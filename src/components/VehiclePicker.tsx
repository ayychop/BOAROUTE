import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { VEHICLES, type Vehicle } from '@/lib/vehicles';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';
import { Txt } from './Txt';

/** Fine gold corner ticks that frame the car like an instrument cluster. */
function CornerTicks({ color }: { color: string }) {
  const arm = 14;
  const s = { position: 'absolute' as const, width: arm, height: arm, borderColor: color };
  const w = StyleSheet.hairlineWidth * 3;
  return (
    <>
      <View style={[s, { top: 12, left: 12, borderTopWidth: w, borderLeftWidth: w }]} />
      <View style={[s, { top: 12, right: 12, borderTopWidth: w, borderRightWidth: w }]} />
      <View style={[s, { bottom: 12, left: 12, borderBottomWidth: w, borderLeftWidth: w }]} />
      <View style={[s, { bottom: 12, right: 12, borderBottomWidth: w, borderRightWidth: w }]} />
    </>
  );
}

function VehicleCard({ v, selected, onSelect, index, width }: { v: Vehicle; selected: boolean; onSelect: () => void; index: number; width: number }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const sweep = useSharedValue(-1);
  const lift = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    lift.set(withSpring(selected ? 1 : 0, springs.settle));
    if (selected && !reduced) {
      sweep.set(-1);
      sweep.set(withRepeat(withSequence(withTiming(-1, { duration: 0 }), withDelay(1400, withTiming(1.4, { duration: 1600, easing: Easing.inOut(Easing.cubic) }))), -1, false));
    } else {
      cancelAnimation(sweep);
      sweep.set(-1);
    }
  }, [selected, reduced, lift, sweep]);

  const imageH = Math.round(width * 0.56);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.975 + lift.get() * 0.025 }],
    shadowOpacity: 0.2 + lift.get() * 0.25,
  }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: sweep.get() * width }, { rotate: '18deg' }] }));

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 140).springify().damping(springs.settle.damping)} style={{ width }}>
      <Animated.View style={[{ borderRadius: radius.xl, shadowColor: palette.primary, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: selected ? 10 : 2 }, cardStyle]}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected }}
          accessibilityLabel={`${v.year} ${v.model}`}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onSelect();
          }}
          style={{
            borderRadius: radius.xl,
            overflow: 'hidden',
            borderWidth: selected ? 1.5 : StyleSheet.hairlineWidth * 2,
            borderColor: selected ? palette.primary : palette.border,
            backgroundColor: palette.surfaceStrong,
          }}
        >
          <View style={{ height: imageH, backgroundColor: palette.bg[2] }}>
            <Image source={v.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} accessibilityIgnoresInvertColors />
            {/* Cinematic grade: warm highlights, crushed blacks */}
            <LinearGradient colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.92)']} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={[`${palette.primary}40`, 'rgba(0,0,0,0)']} start={{ x: 0, y: 1 }} end={{ x: 0.7, y: 0.3 }} style={[StyleSheet.absoluteFill, { opacity: selected ? 1 : 0.3 }]} />
            {/* Showroom light sweep across the paintwork */}
            <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -imageH * 0.3, bottom: -imageH * 0.3, width: width * 0.22 }, sweepStyle]}>
              <LinearGradient colors={['rgba(255,246,221,0)', 'rgba(255,246,221,0.22)', 'rgba(255,246,221,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <CornerTicks color={selected ? palette.gold : 'rgba(255,240,210,0.35)'} />
            <View style={{ position: 'absolute', top: 18, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong }}>
                <Txt variant="label" tone="gold">
                  {v.plate}
                </Txt>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={24} color={palette.gold} />}
            </View>
            <View style={{ position: 'absolute', left: 20, right: 20, bottom: 16 }}>
              <Txt variant="label" style={{ color: 'rgba(245,240,230,0.7)' }}>
                {v.year} BMW X1
              </Txt>
              <Txt variant="display" style={{ color: palette.text }} numberOfLines={1} adjustsFontSizeToFit>
                M Sport Hybrid
              </Txt>
            </View>
          </View>
          {/* Instrument strip */}
          <View style={{ flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8 }}>
            {v.specs.map((s, i) => (
              <View key={s.label} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? StyleSheet.hairlineWidth * 2 : 0, borderLeftColor: palette.border }}>
                <Txt variant="label" tone="faint" numberOfLines={1} style={{ fontSize: 9 }}>
                  {s.label}
                </Txt>
                <Txt variant="strong" numberOfLines={1} style={{ fontSize: 13.5, marginTop: 2 }}>
                  {s.value}
                </Txt>
              </View>
            ))}
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

export function VehiclePicker({ value, onChange }: { value: Vehicle['id'] | null; onChange: (id: Vehicle['id']) => void }) {
  const { contentWidth, width } = useLayout();
  // Side by side when there is room (Fold inner, landscape), stacked otherwise.
  const sideBySide = width >= 640;
  const cardW = sideBySide ? (contentWidth - 16) / 2 : contentWidth;
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: sideBySide ? 'row' : 'column', gap: 16 }}>
      {VEHICLES.map((v, i) => (
        <VehicleCard key={v.id} v={v} index={i} width={cardW} selected={value === v.id} onSelect={() => onChange(v.id)} />
      ))}
    </View>
  );
}
