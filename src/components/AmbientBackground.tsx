import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useId } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { PALETTES, PHASES, type Phase } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';

/** One master loop drives every wisp and particle, so the whole scene is a single animation. */
const LOOP_MS = 120_000;
const TAU = Math.PI * 2;

/** Deterministic pseudo-random in [0, 1) so renders stay pure and layouts stay stable. */
function seeded(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

interface ParticleSpec {
  x: number;
  y: number;
  size: number;
  /** Whole laps per master loop, so the loop is seamless. */
  laps: number;
  offset: number;
  sway: number;
  gold: boolean;
}

const PARTICLES: ParticleSpec[] = Array.from({ length: 22 }, (_, i) => ({
  x: seeded(i + 1),
  y: 0.25 + seeded(i + 41) * 0.85,
  size: 1.4 + seeded(i + 81) * 2.6,
  laps: 3 + Math.floor(seeded(i + 121) * 5),
  offset: seeded(i + 161),
  sway: 10 + seeded(i + 201) * 26,
  gold: seeded(i + 241) > 0.4,
}));

function Layer({ phase }: { phase: Phase }) {
  const { layers } = useTheme();
  const style = useAnimatedStyle(() => ({ opacity: layers[phase].value }));
  const p = PALETTES[phase];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient colors={p.bg} style={StyleSheet.absoluteFill} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} />
    </Animated.View>
  );
}

/** A soft radial cloud: reads as smoke in pale tones and as light in gold. */
function Wisp({
  clock,
  color,
  peak,
  w,
  h,
  cx,
  cy,
  driftX,
  driftY,
  laps,
  phase,
}: {
  clock: SharedValue<number>;
  color: string;
  peak: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  driftX: number;
  driftY: number;
  laps: number;
  phase: number;
}) {
  const id = useId().replace(/:/g, '');
  const style = useAnimatedStyle(() => {
    const a = TAU * (clock.value * laps + phase);
    return {
      opacity: 0.65 + Math.sin(a * 2) * 0.35,
      transform: [
        { translateX: Math.sin(a) * driftX },
        { translateY: Math.cos(a) * driftY },
        { rotate: `${Math.sin(a) * 6}deg` },
        { scale: 1 + Math.cos(a * 2) * 0.08 },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cx - w / 2, top: cy - h / 2, width: w, height: h }, style]}>
      <Svg width={w} height={h}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={peak} />
            <Stop offset="0.45" stopColor={color} stopOpacity={peak * 0.45} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

function Particle({ clock, spec, width, height, color, peak }: { clock: SharedValue<number>; spec: ParticleSpec; width: number; height: number; color: string; peak: number }) {
  const rise = height * 0.45;
  const style = useAnimatedStyle(() => {
    const raw = clock.value * spec.laps + spec.offset;
    const t = raw - Math.floor(raw);
    return {
      opacity: Math.sin(t * Math.PI) * peak,
      transform: [{ translateY: -t * rise }, { translateX: Math.sin(t * TAU) * spec.sway }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: spec.x * width,
          top: spec.y * height,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowOpacity: 0.9,
          shadowRadius: spec.size * 2,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

/**
 * Cinematic BOA ambiance: a charcoal-to-black gradient that dissolves between
 * times of day, slow smoke wisps, warm gold light and floating motes.
 * Only the focused screen animates; others hold a still frame.
 */
export function AmbientBackground({ animated = true }: { animated?: boolean }) {
  const { palette } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const clock = useSharedValue(0.18);
  const moving = animated && !reduced;

  useEffect(() => {
    if (!moving) return;
    clock.set(withRepeat(withTiming(clock.get() + 1, { duration: LOOP_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(clock);
  }, [moving, clock]);

  const big = Math.max(width, height);
  const pale = palette.smoke;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PHASES.map((p) => (
        <Layer key={p} phase={p} />
      ))}

      {/* Warm key light from above, like a showroom spotlight */}
      <Wisp clock={clock} color={palette.gold} peak={0.16} w={width * 1.5} h={height * 0.55} cx={width * 0.5} cy={-height * 0.04} driftX={width * 0.05} driftY={8} laps={1} phase={0} />
      <Wisp clock={clock} color={palette.primary} peak={0.1} w={big * 0.8} h={big * 0.8} cx={width * 0.95} cy={height * 0.62} driftX={30} driftY={40} laps={1} phase={0.4} />

      {/* Smoke */}
      <Wisp clock={clock} color={pale} peak={0.05} w={width * 1.8} h={height * 0.32} cx={width * 0.3} cy={height * 0.34} driftX={width * 0.18} driftY={20} laps={1} phase={0.15} />
      <Wisp clock={clock} color={pale} peak={0.045} w={width * 1.6} h={height * 0.28} cx={width * 0.75} cy={height * 0.7} driftX={width * 0.22} driftY={26} laps={2} phase={0.6} />
      <Wisp clock={clock} color={pale} peak={0.035} w={width * 1.2} h={height * 0.22} cx={width * 0.1} cy={height * 0.9} driftX={width * 0.15} driftY={14} laps={1} phase={0.8} />

      {PARTICLES.map((spec, i) => (
        <Particle key={i} clock={clock} spec={spec} width={width} height={height} color={spec.gold ? palette.gold : pale} peak={palette.particles * (spec.gold ? 0.9 : 0.6)} />
      ))}

      {/* Vignette pulls focus to the content */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)']} start={{ x: 0.5, y: 0.45 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}
