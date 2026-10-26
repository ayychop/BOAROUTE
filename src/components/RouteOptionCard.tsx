import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import type { RouteOption } from '../../supabase/functions/_shared/route-analysis';
import { useUnits } from '@/hooks/useUnits';
import { formatMinutes } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';
import { Txt } from './Txt';

interface Props {
  option: RouteOption;
  selected: boolean;
  onSelect: () => void;
  live: boolean;
  note?: string | null;
  index: number;
}

export function RouteOptionCard({ option, selected, onSelect, live, note, index }: Props) {
  const { palette } = useTheme();
  const units = useUnits();
  const motorway = option.kind === 'motorway';
  const accent = motorway ? palette.gold : palette.primary;
  const delayMin = Math.round((option.durationS - option.typicalDurationS) / 60);
  const title = motorway ? 'Fastest Route (Motorway Preferred)' : 'Standard Route';
  const scale = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(selected ? 1 : 0.98, { damping: 16 }) }] }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 90).springify().damping(17)} style={[{ flex: 1, minWidth: 240 }, scale]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${title}: ${formatMinutes(option.durationS / 60)}, ${units.distance(option.distanceM / 1000)}`}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onSelect();
        }}
        style={{
          borderRadius: radius.lg,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? accent : palette.border,
          backgroundColor: palette.surface,
          padding: 14,
          gap: 10,
          shadowColor: accent,
          shadowOpacity: selected ? 0.35 : 0,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 0 },
          elevation: selected ? 10 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: motorway ? palette.goldGlow : palette.glow }}>
            <MaterialCommunityIcons name={motorway ? 'highway' : 'road-variant'} size={22} color={palette.text} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt variant="label" style={{ color: accent }} numberOfLines={1}>
              {motorway ? 'Motorway Route' : 'Standard Route'}
            </Txt>
            <Txt variant="strong" numberOfLines={2}>
              {title}
            </Txt>
          </View>
          <MaterialCommunityIcons name={selected ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={selected ? accent : palette.textFaint} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
          <Txt variant="metric" style={{ color: accent }} glow>
            {formatMinutes(option.durationS / 60)}
          </Txt>
          <Txt variant="strong" tone="dim" style={{ marginBottom: 4 }}>
            {units.distance(option.distanceM / 1000)}
          </Txt>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {live && (
            <Tag icon="traffic-light" text={delayMin > 1 ? `+${delayMin} min traffic` : 'Traffic flowing'} color={delayMin > 5 ? palette.warning : palette.success} />
          )}
          {live && option.fastRoadShare > 0 && <Tag icon="speedometer" text={`${Math.round(option.fastRoadShare * 100)}% motorway / dual`} color={palette.textDim} />}
          {live && option.minorShare > 0.05 && <Tag icon="pine-tree" text={`${Math.round(option.minorShare * 100)}% lanes`} color={palette.textDim} />}
          {!live && <Tag icon="wifi-off" text="Estimate, no live traffic" color={palette.warning} />}
        </View>

        {option.roads.length > 0 && (
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            Via {option.roads.slice(0, 5).join(', ')}
          </Txt>
        )}
        {note ? (
          <Txt variant="caption" tone="faint">
            {note}
          </Txt>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

function Tag({ icon, text, color }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string; color: string }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: palette.border }}>
      <MaterialCommunityIcons name={icon} size={12} color={color} />
      <Txt variant="caption" style={{ color, fontSize: 12 }}>
        {text}
      </Txt>
    </View>
  );
}
