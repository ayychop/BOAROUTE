import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GlassCard } from '@/components/GlassCard';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { CAR_ICONS, ROUTE_COLORS, carIconFor, prefsFor, routeColorFor } from '@/lib/preferences';
import type { CarIconId, RouteColorId } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

const TRAIL = 'M 18 118 C 70 112, 80 60, 140 56 S 230 30, 290 22';

/** A slice of night map with the chosen trail and car indicator, so the choice is seen before driving. */
function Preview({ color, icon, width }: { color: string; icon: keyof typeof Ionicons.glyphMap; width: number }) {
  const h = 140;
  return (
    <View style={{ height: h, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#0C0C0D' }} accessibilityLabel="Preview of your route trail and car indicator">
      <Svg width={width} height={h} viewBox={`0 0 310 ${h}`} preserveAspectRatio="xMidYMid slice">
        {/* Motorway bold gold, local streets subtle: the same hierarchy as the live map. */}
        <Path d="M -10 30 L 320 96" stroke="#C9A24A" strokeWidth={9} />
        <Path d="M -10 30 L 320 96" stroke="#F3DDA4" strokeOpacity={0.5} strokeWidth={1.2} />
        <Path d="M 60 0 L 90 140 M 200 0 L 180 140 M 0 80 L 310 70" stroke="#222226" strokeWidth={3} />
        <Path d={TRAIL} stroke={color} strokeOpacity={0.35} strokeWidth={14} fill="none" strokeLinecap="round" />
        <Path d={TRAIL} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', left: 6, top: 98, width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: `${color}33` }} />
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#0B0B0C', borderWidth: 2.5, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
      </View>
    </View>
  );
}

export default function Personalise() {
  const { palette } = useTheme();
  const { contentWidth, compact } = useLayout();
  const { profile, updatePreferences } = useAuth();
  const saved = prefsFor(profile);
  // Shown straight away; saved in the background and rolled back if that fails.
  const [carIcon, setCarIcon] = useState<CarIconId>(saved.car_icon);
  const [routeColor, setRouteColor] = useState<RouteColorId>(saved.route_color);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: { car_icon?: CarIconId; route_color?: RouteColorId }, undo: () => void) => {
    Haptics.selectionAsync().catch(() => {});
    setError(null);
    try {
      await updatePreferences(patch);
    } catch (e) {
      undo();
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    }
  };

  const color = routeColorFor(routeColor).color;
  const car = carIconFor(carIcon);
  const tile = compact ? 96 : 110;

  return (
    <Screen back kicker="Premium" title="Map & car style">
      <GlassCard glow="gold" animateIn={false} padded={false} style={{ padding: 10 }}>
        <Preview color={color} icon={car.icon} width={contentWidth - 20} />
      </GlassCard>
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginTop: 10 }}>
          {error}
        </Txt>
      ) : null}

      <SectionHeader title="Car indicator" />
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {CAR_ICONS.map((c) => {
          const on = c.id === carIcon;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${c.label} car indicator`}
              onPress={() => {
                if (on) return;
                const prev = carIcon;
                setCarIcon(c.id);
                save({ car_icon: c.id }, () => setCarIcon(prev));
              }}
              style={{ width: tile, flexGrow: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: on ? 1.5 : StyleSheet.hairlineWidth * 2, borderColor: on ? color : palette.border }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#0B0B0C', borderWidth: 2, borderColor: on ? color : palette.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={c.icon} size={20} color={on ? color : palette.textDim} />
              </View>
              <Txt variant="strong" numberOfLines={1}>
                {c.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Route trail colour" />
      <GlassCard animateIn={false}>
        <View accessibilityRole="radiogroup" style={{ gap: 4 }}>
          {ROUTE_COLORS.map((r) => {
            const on = r.id === routeColor;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${r.label} route colour`}
                onPress={() => {
                  if (on) return;
                  const prev = routeColor;
                  setRouteColor(r.id);
                  save({ route_color: r.id }, () => setRouteColor(prev));
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
              >
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: r.color, shadowColor: r.color, shadowOpacity: on ? 0.8 : 0, shadowRadius: 8, elevation: on ? 6 : 0 }} />
                <Txt variant="strong" style={{ flex: 1 }}>
                  {r.label}
                </Txt>
                {on && <Ionicons name="checkmark-circle" size={22} color={r.color} />}
              </Pressable>
            );
          })}
        </View>
        <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
          Drawn along your route as soon as navigation starts.
        </Txt>
      </GlassCard>
    </Screen>
  );
}
