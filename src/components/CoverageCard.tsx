import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ZoomIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { GlassCard } from '@/components/GlassCard';
import { ProgressRing } from '@/components/ProgressRing';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import type { PatchCoverage } from '@/lib/coverage';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

const SPARKS = 12;

/** One gold spark flying out from the ring's centre, then fading. */
function Spark({ i, burst, ringSize }: { i: number; burst: SharedValue<number>; ringSize: number }) {
  const { palette } = useTheme();
  const angle = (i / SPARKS) * Math.PI * 2;
  const reach = ringSize / 2 + (i % 2 ? 10 : 22);
  const style = useAnimatedStyle(() => ({
    opacity: burst.value < 0.05 ? 0 : 1 - burst.value,
    transform: [{ translateX: Math.cos(angle) * reach * burst.value }, { translateY: Math.sin(angle) * reach * burst.value }, { scale: 1.2 - burst.value * 0.7 }],
  }));
  const size = i % 3 === 0 ? 7 : 5;
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: ringSize / 2 - size / 2, top: ringSize / 2 - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: i % 2 ? palette.gold : palette.primary }, style]}
    />
  );
}

/** Home card: how much of this person's patch is on target this month. Celebrates once it is all cleared. */
export function CoverageCard({ coverage, index = 0, onPress }: { coverage: PatchCoverage; index?: number; onPress?: () => void }) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const reduced = useReducedMotion();
  const ringSize = compact ? 112 : 132;
  const pct = Math.round(coverage.ratio * 100);
  const { cleared } = coverage;

  const burst = useSharedValue(0);
  const pulse = useSharedValue(0);
  const celebrated = useRef(false);

  useEffect(() => {
    if (!cleared) {
      celebrated.current = false;
      pulse.value = 0;
      return;
    }
    if (celebrated.current) return;
    celebrated.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (reduced) return;
    // Two bursts as the ring lands, then a slow breathing glow while the patch stays cleared.
    burst.value = withDelay(900, withSequence(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 }), withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) })));
    pulse.value = withDelay(900, withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [cleared, reduced, burst, pulse]);

  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.25 + pulse.value * 0.45, transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  return (
    <GlassCard glow={cleared ? 'gold' : false} index={index} onPress={onPress} accessibilityLabel={`Coverage progress: ${coverage.completed} of ${coverage.total} stores on target${cleared ? ', patch cleared' : ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8 }}>
        <Txt variant="label" tone="dim" numberOfLines={1} style={{ flexShrink: 1 }}>
          Coverage progress
        </Txt>
        {cleared ? (
          <Animated.View entering={reduced ? undefined : ZoomIn.delay(1000).springify()}>
            <LinearGradient colors={[...palette.goldMetal]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill }}>
              <Ionicons name="trophy" size={11} color={palette.goldText} />
              <Txt variant="label" tone="onGold" numberOfLines={1} style={{ fontSize: 9.5 }}>
                Patch cleared
              </Txt>
            </LinearGradient>
          </Animated.View>
        ) : (
          <Txt variant="label" tone="faint" numberOfLines={1} style={{ fontSize: 9.5 }}>
            This month
          </Txt>
        )}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 14 : 20 }}>
        <View style={{ width: ringSize, height: ringSize }}>
          {cleared && (
            <Animated.View
              pointerEvents="none"
              style={[{ position: 'absolute', inset: -6, borderRadius: ringSize, borderWidth: 2, borderColor: palette.gold, shadowColor: palette.gold, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } }, haloStyle]}
            />
          )}
          <ProgressRing value={coverage.ratio} size={ringSize} stroke={compact ? 10 : 12} colors={[palette.primary, palette.gold]} accessibilityLabel={`${pct}% of patch complete`}>
            <Txt variant="metric" tone={cleared ? 'gold' : 'default'} glow={cleared} numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: compact ? 26 : 30 }}>
              {pct}%
            </Txt>
            <Txt variant="label" tone="faint" numberOfLines={1} style={{ fontSize: 8.5, letterSpacing: 1.4 }}>
              {cleared ? 'Cleared' : 'Of patch'}
            </Txt>
          </ProgressRing>
          {cleared && !reduced && Array.from({ length: SPARKS }, (_, i) => <Spark key={i} i={i} burst={burst} ringSize={ringSize} />)}
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: 10 }}>
          <View style={{ flexDirection: 'row' }}>
            <Stat label="Stores" value={coverage.total} />
            <Stat label="Done" value={coverage.completed} tone="success" divider />
            <Stat label="Left" value={coverage.remaining} tone={coverage.remaining ? 'primary' : 'faint'} divider />
          </View>
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
              <Txt variant="label" tone="faint" numberOfLines={1} style={{ fontSize: 9, letterSpacing: 1.2, flexShrink: 1 }}>
                Visits
              </Txt>
              <Txt variant="strong" numberOfLines={1} style={{ fontSize: 14 }}>
                {coverage.visitsDone}
                <Txt variant="caption" tone="faint"> / {coverage.visitsOwed}</Txt>
              </Txt>
            </View>
            <VisitBar ratio={coverage.visitsOwed ? coverage.visitsDone / coverage.visitsOwed : 0} />
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

function VisitBar({ ratio }: { ratio: number }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const width = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, ratio));
  useEffect(() => {
    width.value = reduced ? clamped : withTiming(clamped, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduced, width]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.border, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: 3, overflow: 'hidden' }, fillStyle]}>
        <LinearGradient colors={[palette.primary, palette.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

function Stat({ label, value, tone = 'default', divider }: { label: string; value: number; tone?: 'default' | 'success' | 'primary' | 'faint'; divider?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 2, borderLeftWidth: divider ? StyleSheet.hairlineWidth * 2 : 0, borderLeftColor: palette.border }}>
      <Txt variant="strong" tone={tone} numberOfLines={1} style={{ fontSize: 19, lineHeight: 24 }}>
        {value}
      </Txt>
      <Txt variant="label" tone="faint" numberOfLines={1} style={{ fontSize: 9, letterSpacing: 1.2 }}>
        {label}
      </Txt>
    </View>
  );
}
