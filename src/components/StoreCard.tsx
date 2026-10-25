import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { memo, useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { daysSinceLabel } from '@/lib/format';
import { visitsRemaining } from '@/lib/frequency';
import type { VisitTally } from '@/lib/route-engine';
import type { Store } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { GradeBadge, ManagerBadge } from './badges';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

interface Props {
  store: Store;
  tally?: VisitTally;
  target: number;
  index: number;
  /** Current time from the list, so 100+ cards don't each run a timer. */
  now: number;
  animateIn?: boolean;
  /** Play the completion exit (gold glow, lift, slide down, fade), then call onExited. */
  exiting?: boolean;
  onExited?: (id: string) => void;
}

/** Above this many visits a month the bar is continuous instead of one segment per visit. */
const MAX_SEGMENTS = 8;

function Segment({ filled, delay, color, track }: { filled: boolean; delay: number; color: string; track: string }) {
  const p = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    p.value = withDelay(delay, withSpring(filled ? 1 : 0, { damping: 14, stiffness: 180 }));
  }, [filled, delay, p]);
  const fill = useAnimatedStyle(() => ({ opacity: p.value, transform: [{ scaleX: 0.2 + 0.8 * p.value }] }));
  return (
    <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: track, overflow: 'hidden' }}>
      <Animated.View style={[{ flex: 1, borderRadius: 4, backgroundColor: color }, fill]} />
    </View>
  );
}

/** One segment per visit owed this month; each fills with a spring as visits are logged. */
export function GoalBar({ done, target, met }: { done: number; target: number; met: boolean }) {
  const { palette } = useTheme();
  const color = met ? palette.gold : done / Math.max(1, target) >= 0.5 ? palette.primary : palette.platinum;
  const width = useSharedValue(0);
  const ratio = target > 0 ? Math.min(1, done / target) : 1;
  useEffect(() => {
    width.value = withSpring(ratio, { damping: 16, stiffness: 120 });
  }, [ratio, width]);
  const bar = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  if (target > 0 && target <= MAX_SEGMENTS) {
    return (
      <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={`${done} of ${target} visits`}>
        {Array.from({ length: target }, (_, i) => (
          <Segment key={i} filled={i < done} delay={i * 70} color={color} track={palette.border} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: palette.border, overflow: 'hidden' }} accessibilityLabel={`${done} of ${target} visits`}>
      <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, bar]} />
    </View>
  );
}

export const StoreCard = memo(function StoreCard({ store, tally, target, index, now, animateIn = true, exiting = false, onExited }: Props) {
  const { palette } = useTheme();
  const done = tally?.count ?? 0;
  const days = tally?.last ? Math.floor((now - new Date(tally.last).getTime()) / 86_400_000) : null;
  const met = target > 0 && done >= target;
  const left = visitsRemaining(done, target);

  // Exit: glow and lift, a beat, then a cinematic slide down and fade.
  const glow = useSharedValue(0);
  const lift = useSharedValue(0);
  const drop = useSharedValue(0);
  useEffect(() => {
    if (!exiting) return;
    const id = store.id;
    const delay = Math.min(index, 6) * 160;
    glow.value = withDelay(delay, withSequence(withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }), withTiming(1, { duration: 380 })));
    lift.value = withDelay(delay, withSequence(withSpring(1, { damping: 10, stiffness: 160 }), withTiming(1, { duration: 300 })));
    drop.value = withDelay(
      delay + 900,
      withTiming(1, { duration: 650, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished && onExited) runOnJS(onExited)(id);
      }),
    );
  }, [exiting, index, store.id, onExited, glow, lift, drop]);

  const exitStyle = useAnimatedStyle(() => ({
    opacity: 1 - drop.value,
    transform: [{ translateY: drop.value * 90 - lift.value * 6 }, { scale: 1 + lift.value * 0.035 - drop.value * 0.12 }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (1 - drop.value),
    shadowOpacity: glow.value * 0.9,
  }));

  return (
    <Animated.View style={[{ height: '100%' }, exitStyle]}>
      <GlassCard index={index} animateIn={animateIn} onPress={() => router.push({ pathname: '/store/[id]', params: { id: store.id } })} accessibilityLabel={`${store.name}, grade ${store.grade}, ${done} of ${target} visits`} style={{ height: '100%' }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <GradeBadge grade={store.grade} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="strong" numberOfLines={2}>
              {store.name}
            </Txt>
            <ManagerBadge manager={store.assigned_manager} />
            <Txt variant="caption" tone="faint" numberOfLines={2}>
              {store.address}
            </Txt>
          </View>
          {met && <Ionicons name="trophy" size={20} color={palette.gold} />}
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Txt variant="caption" tone={met ? 'gold' : left === 1 ? 'primary' : 'dim'} numberOfLines={1}>
              {met ? `Target hit · ${done}/${target}` : left === 1 ? `Last one to go · ${done}/${target}` : `${left} more to go · ${done}/${target}`}
            </Txt>
            <Txt variant="caption" tone="faint" numberOfLines={1}>
              {daysSinceLabel(days)}
            </Txt>
          </View>
          <GoalBar done={done} target={target} met={met} />
        </View>
      </GlassCard>
      {exiting && (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              borderRadius: 24,
              borderWidth: 2,
              borderColor: palette.gold,
              backgroundColor: palette.gold + '1A',
              shadowColor: palette.gold,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 0 },
            },
            glowStyle,
          ]}
        />
      )}
    </Animated.View>
  );
});
