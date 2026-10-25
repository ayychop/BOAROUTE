import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';

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
  /** Off for list rows that mount while scrolling, so they don't replay the entrance. */
  animateIn?: boolean;
  /** Stretch to the parent's height, so cards in a row line up. */
  fill?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Frosted glass panel: translucent fill, top sheen, hairline edge and a soft gold aura when highlighted. */
export function GlassCard({ children, style, glow = false, onPress, onLongPress, index = 0, padded = true, accessibilityLabel, animateIn = true, fill = false }: Props) {
  const { palette } = useTheme();
  const { compact } = useLayout();
  const pressed = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));

  const base: ViewStyle = {
    backgroundColor: palette.surface,
    borderColor: glow ? palette.borderStrong : palette.border,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: compact ? radius.lg - 2 : radius.xl - 4,
    padding: padded ? (compact ? 16 : 20) : 0,
    overflow: 'hidden',
    ...(fill ? { flex: 1 } : null),
    // Android draws elevation shadows through translucent glass as a dark box that
    // flickers while the ambient background animates, so depth there comes from the rim and sheen.
    ...(Platform.OS === 'android'
      ? null
      : glow
        ? { shadowColor: glow === 'gold' ? palette.gold : palette.primary, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }
        : { shadowColor: '#000000', shadowOpacity: palette.statusBar === 'dark' ? 0.1 : 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }),
  };

  const sheen = (
    <>
      <LinearGradient pointerEvents="none" colors={[palette.surfaceHighlight, 'rgba(255,255,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 0.9 }} style={StyleSheet.absoluteFill} />
      {/* Light catching the top edge of the glass; gold-rimmed cards already have their edge. */}
      {!glow && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 24, right: 24, height: StyleSheet.hairlineWidth * 2, backgroundColor: palette.surfaceHighlight }} />}
    </>
  );

  const entering = animateIn
    ? FadeInDown.delay(Math.min(index, 10) * 60)
        .duration(520)
        .springify()
        .damping(springs.settle.damping)
        .stiffness(springs.settle.stiffness)
    : undefined;

  if (!onPress && !onLongPress) {
    return (
      <Animated.View entering={entering} style={[base, style]}>
        {sheen}
        {children}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={entering} style={fill ? { flex: 1 } : undefined}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => pressed.set(withSpring(0.98, springs.press))}
        onPressOut={() => pressed.set(withSpring(1, springs.release))}
        style={[base, style, pressStyle]}
      >
        {sheen}
        {children}
      </AnimatedPressable>
    </Animated.View>
  );
}

/** Fine gold rule along the top edge of a card. */
export function AccentBar({ color }: { color?: string }) {
  const { palette } = useTheme();
  return (
    <LinearGradient
      colors={['rgba(0,0,0,0)', color ?? palette.primary, 'rgba(0,0,0,0)']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5 }}
    />
  );
}
