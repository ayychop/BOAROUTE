import { useEffect } from 'react';
import { View, type DimensionValue } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { GlassCard } from './GlassCard';

/** One shared breathing pulse, so every placeholder on screen glows in step. */
function usePulse() {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true));
    return () => cancelAnimation(t);
  }, [reduced, t]);
  return useAnimatedStyle(() => ({ opacity: 0.45 + t.get() * 0.4 }));
}

function Bar({ width, height = 12, round, style }: { width: DimensionValue; height?: number; round?: boolean; style?: object }) {
  const { palette } = useTheme();
  return <View style={[{ width, height, borderRadius: round ? height / 2 : 6, backgroundColor: palette.borderStrong }, style]} />;
}

/** A store card placeholder: grade badge, name, address and the visit bar. */
function StoreCardSkeleton() {
  const { palette } = useTheme();
  return (
    <GlassCard animateIn={false}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Bar width={40} height={40} round />
        <View style={{ flex: 1, gap: 8 }}>
          <Bar width="70%" height={14} />
          <Bar width="45%" height={10} />
        </View>
        <Bar width={52} height={22} round />
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: palette.border }} />
        ))}
      </View>
    </GlassCard>
  );
}

/** Shown while the first store list loads, in place of a spinner. */
export function StoreListSkeleton({ rows = 5, label = 'Loading your stores' }: { rows?: number; label?: string }) {
  const pulse = usePulse();
  return (
    <Animated.View style={[{ gap: 12 }, pulse]} accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <StoreCardSkeleton key={i} />
      ))}
    </Animated.View>
  );
}

/** A generic block placeholder for cards that are still loading. */
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View style={pulse} accessibilityRole="progressbar">
      <GlassCard animateIn={false} style={{ gap: 10, borderRadius: radius.lg }}>
        <Bar width="40%" height={12} />
        {Array.from({ length: lines }, (_, i) => (
          <Bar key={i} width={i === lines - 1 ? '60%' : '100%'} height={12} />
        ))}
      </GlassCard>
    </Animated.View>
  );
}
