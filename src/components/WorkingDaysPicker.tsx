import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { DAY_LETTER, DAY_SHORT, WEEK_ORDER, WORKDAY_PRESETS, describeDays, monthGrid, normaliseDays, toggleDay } from '@/lib/workdays';
import { useTheme } from '@/theme/ThemeProvider';
import { springs } from '@/theme/typography';
import { Chip } from './controls';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

function DayToggle({ day, on, size, onPress }: { day: number; on: boolean; size: number; onPress: () => void }) {
  const { palette } = useTheme();
  const fill = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0, { duration: 220 }), transform: [{ scale: withSpring(on ? 1 : 0.6, springs.release) }] }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${DAY_SHORT[day]}: ${on ? 'working' : 'off'}`}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: on ? palette.primary : palette.border,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.92 : 1 }],
      })}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: palette.primary }, fill]} />
      <Txt variant="strong" style={{ color: on ? palette.primaryText : palette.textDim, fontSize: size * 0.34 }} maxFontSizeMultiplier={1}>
        {DAY_LETTER[day]}
      </Txt>
    </Pressable>
  );
}

/**
 * Weekly working pattern with a live month calendar. Tap a weekday, a preset,
 * or any date in the calendar to switch that weekday between working and off.
 */
export function WorkingDaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const { palette } = useTheme();
  const { contentWidth, compact } = useLayout();
  const nowMs = useNow();
  const days = normaliseDays(value);
  const set = new Set(days);
  const today = new Date(nowMs);
  const grid = monthGrid(today.getFullYear(), today.getMonth());

  const flip = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(toggleDay(days, d));
  };

  const inner = Math.min(contentWidth, 520) - (compact ? 32 : 40);
  const toggleSize = Math.max(34, Math.min(48, (inner - 6 * 8) / 7));
  const cell = Math.floor(inner / 7);
  const monthName = today.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const working = grid.flat().filter((d) => d && set.has(d.getDay())).length;

  return (
    <View style={{ gap: 14 }}>
      <GlassCard glow="gold">
        <Txt variant="label" tone="dim" style={{ marginBottom: 12 }}>
          Your week
        </Txt>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {WEEK_ORDER.map((d) => (
            <DayToggle key={d} day={d} on={set.has(d)} size={toggleSize} onPress={() => flip(d)} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
          {WORKDAY_PRESETS.map((p) => (
            <Chip
              key={p.label}
              label={p.label}
              active={normaliseDays(p.days).join() === days.join()}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                onChange(normaliseDays(p.days));
              }}
            />
          ))}
        </View>
      </GlassCard>

      <GlassCard>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <Txt variant="title">{monthName}</Txt>
          <Txt variant="caption" tone="dim">
            {working} working days
          </Txt>
        </View>
        <View style={{ alignSelf: 'center', width: cell * 7 }}>
          <View style={{ flexDirection: 'row' }}>
            {WEEK_ORDER.map((d) => (
              <View key={d} style={{ width: cell, alignItems: 'center', paddingBottom: 6 }}>
                <Txt variant="label" tone={set.has(d) ? 'gold' : 'faint'} style={{ fontSize: 9 }}>
                  {DAY_SHORT[d]}
                </Txt>
              </View>
            ))}
          </View>
          {grid.map((week, w) => (
            <View key={w} style={{ flexDirection: 'row' }}>
              {week.map((date, i) => {
                if (!date) return <View key={i} style={{ width: cell, height: cell }} />;
                const on = set.has(date.getDay());
                const isToday = date.toDateString() === today.toDateString();
                const dot = cell - 8;
                return (
                  <Pressable
                    key={i}
                    accessibilityRole="button"
                    accessibilityLabel={`${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${on ? 'working' : 'off'}. Tap to switch every ${DAY_SHORT[date.getDay()]}.`}
                    onPress={() => flip(date.getDay())}
                    style={{ width: cell, height: cell, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <View
                      style={{
                        width: dot,
                        height: dot,
                        borderRadius: dot / 2,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: on ? palette.glow : 'transparent',
                        borderWidth: isToday ? 1.2 : 0,
                        borderColor: palette.gold,
                      }}
                    >
                      <Txt variant="caption" style={{ color: on ? palette.text : palette.textFaint, fontSize: Math.min(14, dot * 0.4) }} maxFontSizeMultiplier={1}>
                        {date.getDate()}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 18, marginTop: 12, justifyContent: 'center' }}>
          <Legend color={palette.glow} label="Working" />
          <Legend color="transparent" border={palette.border} label="Off" />
        </View>
      </GlassCard>

      <Txt variant="body" tone="dim" align="center">
        <Txt variant="strong" tone="gold">
          {describeDays(days)}
        </Txt>{' '}
        · {days.length} on, {7 - days.length} off
      </Txt>
    </View>
  );
}

function Legend({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: color, borderWidth: border ? 1 : 0, borderColor: border }} />
      <Txt variant="caption" tone="faint">
        {label}
      </Txt>
    </View>
  );
}
