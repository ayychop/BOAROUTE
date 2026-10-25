import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface Props {
  /** 0..1 */
  value: number;
  size: number;
  stroke?: number;
  colors?: [string, string];
  children?: ReactNode;
  accessibilityLabel?: string;
}

/** Metallic ring that sweeps to its value with a gradient stroke. */
export function ProgressRing({ value, size, stroke = 12, colors, children, accessibilityLabel }: Props) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = useSharedValue(0);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  useEffect(() => {
    progress.value = reduced ? clamped : withTiming(clamped, { duration: 1200, easing: Easing.out(Easing.cubic) });
  }, [clamped, reduced, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const [c1, c2] = colors ?? [palette.primary, palette.gold];
  const gradientId = `ring-${size}-${stroke}`;

  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }} style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          inset: stroke / 2,
          borderRadius: size / 2,
          shadowColor: c1,
          shadowOpacity: 0.3,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <SvgGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c1} />
            <Stop offset="1" stopColor={c2} />
          </SvgGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 3} stroke={palette.primary} strokeOpacity={0.18} strokeWidth={0.8} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', padding: stroke + 4 }}>{children}</View>
    </View>
  );
}
