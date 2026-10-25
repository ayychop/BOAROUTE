import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glow?: 'primary' | 'gold' | false;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Stagger index for the entrance animation. */
  index?: number;
  padded?: boolean;
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function GlassCard({ children, style, glow = false, onPress, onLongPress, index = 0, padded = true, accessibilityLabel }: Props) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const pressed = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));

  const glowColor = glow === 'gold' ? palette.gold : palette.primary;
  const base: ViewStyle = {
    backgroundColor: palette.surface,
    borderColor: glow ? (glow === 'gold' ? palette.goldGlow : palette.borderStrong) : palette.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: compact ? radius.md : radius.lg,
    padding: padded ? (compact ? 12 : 16) : 0,
    overflow: 'hidden',
    ...(glow && palette.phase !== 'dawn'
      ? { shadowColor: glowColor, shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, elevation: 10 }
      : { shadowColor: '#00264d', shadowOpacity: palette.phase === 'dawn' ? 0.08 : 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 3 }),
  };

  const entering = FadeInDown.delay(Math.min(index, 10) * 55).springify().damping(18);

  if (!onPress && !onLongPress) {
    return (
      <Animated.View entering={entering} style={[base, style]}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => pressed.set(withSpring(0.975, { damping: 20, stiffness: 400 }))}
        onPressOut={() => pressed.set(withSpring(1, { damping: 14, stiffness: 300 }))}
        style={[base, style, pressStyle]}
      >
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}

/** Thin neon accent line along the top edge of a card. */
export function AccentBar({ color }: { color?: string }) {
  const { palette } = useTheme();
  return <View style={{ position: 'absolute', top: 0, left: 16, right: 16, height: 2, borderRadius: 2, backgroundColor: color ?? palette.primary, opacity: 0.85 }} />;
}
