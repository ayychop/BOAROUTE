import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { managerLabel } from '@/lib/frequency';
import type { EventType, Grade, StoreOwner } from '@/lib/types';
import type { Palette } from '@/theme/palettes';
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

/** One distinct metallic tone per manager. */
export function managerColor(manager: StoreOwner, palette: Palette): string {
  const tones: Record<StoreOwner, string> = {
    Joseph: palette.gold,
    Pete: palette.platinum,
    Marcia: palette.success,
    Jermaine: palette.rose,
    Kishan: palette.primary,
    Raphael: palette.warning,
    David: palette.textDim,
    Sarah: palette.textDim,
  };
  return tones[manager] ?? palette.textDim;
}

/** "JO'S STORE", "KISHAN'S STORE": whose store this is, on cards for people who work several owners' stores. */
export function ManagerBadge({ manager }: { manager: StoreOwner }) {
  const { palette } = useTheme();
  const color = managerColor(manager, palette);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        flexShrink: 1,
        minWidth: 0,
        paddingHorizontal: 9,
        paddingVertical: 3,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <Ionicons name="person" size={11} color={color} />
      <Txt variant="label" style={{ color, letterSpacing: 1, flexShrink: 1 }} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {managerLabel(manager).toUpperCase()}
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
