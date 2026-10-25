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
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { VEHICLES, type Vehicle } from '@/lib/vehicles';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { Txt } from './Txt';

/** Corner brackets that frame the car like a head-up display. */
function HudCorners({ color }: { color: string }) {
  const arm = 18;
  const s = { position: 'absolute' as const, width: arm, height: arm, borderColor: color };
  return (
    <>
      <View style={[s, { top: 8, left: 8, borderTopWidth: 2, borderLeftWidth: 2 }]} />
      <View style={[s, { top: 8, right: 8, borderTopWidth: 2, borderRightWidth: 2 }]} />
      <View style={[s, { bottom: 8, left: 8, borderBottomWidth: 2, borderLeftWidth: 2 }]} />
      <View style={[s, { bottom: 8, right: 8, borderBottomWidth: 2, borderRightWidth: 2 }]} />
    </>
  );
}

function VehicleCard({ v, selected, onSelect, index, width }: { v: Vehicle; selected: boolean; onSelect: () => void; index: number; width: number }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const scan = useSharedValue(0);
  const lift = useSharedValue(selected ? 1 : 0);
  const accent = v.id === '25' ? palette.gold : palette.primary;

  useEffect(() => {
    lift.value = withSpring(selected ? 1 : 0, { damping: 16, stiffness: 180 });
    if (selected && !reduced) {
      scan.value = 0;
      scan.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.quad) }), -1, false);
    } else {
      cancelAnimation(scan);
      scan.value = 0;
    }
  }, [selected, reduced, lift, scan]);

  const imageH = Math.round(width * 0.56);
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 0.97 + lift.value * 0.03 }],
    shadowOpacity: palette.phase === 'dawn' ? 0.1 + lift.value * 0.1 : 0.15 + lift.value * 0.6,
  }));
  const scanStyle = useAnimatedStyle(() => ({ transform: [{ translateY: scan.value * imageH }], opacity: scan.value > 0 ? 0.9 : 0 }));

  return (
    <Animated.View entering={FadeInDown.delay(120 + index * 120).springify().damping(16)} style={{ width }}>
      <Animated.View
        style={[
          {
            borderRadius: radius.xl,
            shadowColor: accent,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 0 },
            elevation: selected ? 14 : 2,
          },
          cardStyle,
        ]}
      >
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
            borderWidth: selected ? 2 : 1,
            borderColor: selected ? accent : palette.border,
            backgroundColor: palette.surfaceStrong,
          }}
        >
          <View style={{ height: imageH, backgroundColor: '#02060F' }}>
            <Image source={v.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} accessibilityIgnoresInvertColors />
            {/* Cinematic grade: cool shadows, neon edge light, dark vignette */}
            <LinearGradient colors={['rgba(0,20,60,0.10)', 'rgba(0,10,30,0.15)', 'rgba(2,6,15,0.92)']} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={[`${accent}55`, 'transparent']}
              start={{ x: 0, y: 1 }}
              end={{ x: 0.6, y: 0.2 }}
              style={[StyleSheet.absoluteFill, { opacity: selected ? 1 : 0.35 }]}
            />
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: 2, backgroundColor: accent, shadowColor: accent, shadowOpacity: 1, shadowRadius: 8 }, scanStyle]} />
            <HudCorners color={selected ? accent : 'rgba(255,255,255,0.35)'} />
            <View style={{ position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1, borderColor: accent }}>
                <Txt variant="label" style={{ color: accent }}>
                  {v.plate}
                </Txt>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={26} color={accent} />}
            </View>
            <View style={{ position: 'absolute', left: 16, right: 16, bottom: 12 }}>
              <Txt variant="label" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {v.year} BMW X1
              </Txt>
              <Txt variant="title" style={{ color: '#FFFFFF' }} numberOfLines={1}>
                M Sport Hybrid
              </Txt>
            </View>
          </View>
          <View style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 8 }}>
            {v.specs.map((s) => (
              <View key={s.label} style={{ flex: 1, alignItems: 'center' }}>
                <Txt variant="label" tone="faint" numberOfLines={1}>
                  {s.label}
                </Txt>
                <Txt variant="strong" numberOfLines={1} style={{ fontSize: 14 }}>
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
