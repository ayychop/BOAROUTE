import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';
import { PALETTES, PHASES, type Phase } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';

function Layer({ phase }: { phase: Phase }) {
  const { layers } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: layers[phase].value }));
  const p = PALETTES[phase];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient colors={p.bg} style={StyleSheet.absoluteFill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} />
    </Animated.View>
  );
}

function Orb({ color, size, x, y, delay }: { color: string; size: number; x: number; y: number; delay: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: 9000 + delay, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [reduced, delay, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (t.value - 0.5) * 60 }, { translateY: (0.5 - t.value) * 40 }, { scale: 0.92 + t.value * 0.16 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** Time-of-day gradient with drifting glow orbs and a faint HUD grid at night. */
export function AmbientBackground() {
  const { palette } = useTheme();
  const { width, height } = useWindowDimensions();
  const orb = Math.max(width, height) * 0.55;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PHASES.map((p) => (
        <Layer key={p} phase={p} />
      ))}
      <View style={[StyleSheet.absoluteFill, { opacity: 0.55 }]}>
        <Orb color={palette.orbs[0]} size={orb} x={width * 0.92} y={height * 0.08} delay={0} />
        <Orb color={palette.orbs[1]} size={orb * 0.8} x={width * 0.05} y={height * 0.78} delay={2400} />
      </View>
      {palette.grid > 0 && (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <Pattern id="grid" width={32} height={32} patternUnits="userSpaceOnUse">
              <Line x1="0" y1="0" x2="32" y2="0" stroke={palette.primary} strokeWidth={0.6} opacity={palette.grid} />
              <Line x1="0" y1="0" x2="0" y2="32" stroke={palette.primary} strokeWidth={0.6} opacity={palette.grid} />
            </Pattern>
          </Defs>
          <Rect x="0" y="0" width={width} height={height} fill="url(#grid)" />
        </Svg>
      )}
    </View>
  );
}
