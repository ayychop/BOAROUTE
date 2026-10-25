import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { managerLabel } from '@/lib/frequency';
import type { EventType, Grade, Manager } from '@/lib/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { Txt } from './Txt';

export function GradeBadge({ grade, size = 34 }: { grade: Grade; size?: number }) {
  const { palette } = useTheme();
  const color = grade === 'A' ? palette.gold : grade === 'B' ? palette.platinum : grade === 'C' ? palette.rose : palette.textDim;
  return (
    <View
      accessibilityLabel={`Grade ${grade}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: color,
        backgroundColor: palette.surface,
        shadowColor: color,
        shadowOpacity: grade === 'A' ? 0.45 : 0,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <Txt variant="title" style={{ color, fontSize: size * 0.48, lineHeight: size * 0.6 }}>
        {grade}
      </Txt>
    </View>
  );
}

export function ManagerBadge({ manager }: { manager: Manager }) {
  const { palette } = useTheme();
  const color = manager === 'Joseph' ? palette.gold : manager === 'David' ? palette.rose : palette.platinum;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Ionicons name="person" size={11} color={color} />
      <Txt variant="label" style={{ color, letterSpacing: 1 }} numberOfLines={1}>
        {managerLabel(manager)}
      </Txt>
    </View>
  );
}

/** Glowing, pulsing badge for Sales Day and OOH events. Plain pill for General. */
export function EventTypeBadge({ type }: { type: EventType }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  const special = type !== 'General';
  const color = type === 'Sales Day' ? palette.gold : type === 'OOH' ? palette.rose : palette.textDim;

  useEffect(() => {
    if (!special || reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [special, reduced, pulse]);

  const glow = useAnimatedStyle(() => ({
    shadowOpacity: special ? 0.45 + pulse.value * 0.5 : 0,
    transform: [{ scale: special ? 1 + pulse.value * 0.04 : 1 }],
  }));

  return (
    <Animated.View
      accessibilityLabel={`${type} event`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          alignSelf: 'flex-start',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: radius.pill,
          borderWidth: special ? 1.5 : 1,
          borderColor: color,
          backgroundColor: special ? `${color}26` : 'transparent',
          shadowColor: color,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 0 },
          elevation: special ? 6 : 0,
        },
        glow,
      ]}
    >
      <Ionicons name={type === 'Sales Day' ? 'flash' : type === 'OOH' ? 'moon' : 'calendar-clear'} size={11} color={color} />
      <Txt variant="label" style={{ color, letterSpacing: 1 }}>
        {type}
      </Txt>
    </Animated.View>
  );
}
