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
import { useLayout } from '@/hooks/useLayout';
import { daysSinceLabel } from '@/lib/format';
import { visitsRemaining } from '@/lib/frequency';
import type { VisitTally } from '@/lib/route-engine';
import type { Store } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
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
  /** Show whose store this is ("PETE'S STORE"), for people who work several owners' stores. */
  showOwner?: boolean;
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

export const StoreCard = memo(function StoreCard({ store, tally, target, index, now, animateIn = true, exiting = false, onExited, showOwner = false }: Props) {
  const { palette } = useTheme();
  const { compact } = useLayout();
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

  const status = met ? 'Target hit' : left === 1 ? 'Last one to go' : `${left} more to go`;

  // Sized by its content, never by the cell: the list rows stretch cards to the
  // tallest in the row, so every text block keeps its full natural height.
  return (
    <Animated.View style={[{ flex: 1 }, exitStyle]}>
      <GlassCard index={index} animateIn={animateIn} fill onPress={() => router.push({ pathname: '/store/[id]', params: { id: store.id } })} accessibilityLabel={`${store.name}, grade ${store.grade}, ${done} of ${target} visits`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <GradeBadge grade={store.grade} size={30} />
          {met ? <Ionicons name="trophy" size={18} color={palette.gold} /> : null}
        </View>
        {showOwner && (
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            <ManagerBadge manager={store.assigned_manager} />
          </View>
        )}
        {/* Breaks between words only, so narrow columns never split a town name mid-word. */}
        <Txt variant="strong" numberOfLines={2} maxFontSizeMultiplier={1.15} textBreakStrategy="simple" android_hyphenationFrequency="none" style={{ flexShrink: 1 }}>
          {store.name}
        </Txt>
        <Txt variant="caption" tone="faint" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flexShrink: 0, marginTop: 2 }}>
          {store.address}
        </Txt>
        {/* Takes up the slack when a neighbour in the row is taller, so progress bars line up. */}
        <View style={{ flexGrow: 1, minHeight: 10 }} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
          <Txt variant="caption" tone={met ? 'gold' : left === 1 ? 'primary' : 'dim'} numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flex: 1 }}>
            {status}
          </Txt>
          <Txt variant="caption" tone={met ? 'gold' : 'faint'} numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flexShrink: 0, fontVariant: ['tabular-nums'] }}>
            {done}/{target}
          </Txt>
        </View>
        <GoalBar done={done} target={target} met={met} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 }}>
          <Ionicons name="time-outline" size={12} color={palette.textFaint} />
          <Txt variant="caption" tone="faint" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flex: 1, fontSize: 12 }}>
            {daysSinceLabel(days)}
          </Txt>
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
              borderRadius: compact ? radius.lg - 2 : radius.xl - 4,
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
