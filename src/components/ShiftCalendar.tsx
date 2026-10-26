import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Calendar, type CalendarProps, type DateData } from 'react-native-calendars';
import { datesFromPattern, datesInMonth, isoDay, normaliseDates, toggleDate } from '@/lib/workdays';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { Chip } from './controls';
import { GlassCard } from './GlassCard';
import { Txt } from './Txt';

type MarkedDates = NonNullable<CalendarProps['markedDates']>;

const MONTH_FILLS: { label: string; days: number[] }[] = [
  { label: 'Fill Mon to Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Fill Mon to Sat', days: [1, 2, 3, 4, 5, 6] },
];

/**
 * Shift calendar: tap any date to switch it between Working and Off. Months
 * swipe sideways; the quick fills apply a pattern to the month on screen only.
 */
export function ShiftCalendar({ value, onChange }: { value: string[]; onChange: (dates: string[]) => void }) {
  const { palette, phase } = useTheme();
  const today = isoDay(new Date());
  const [month, setMonth] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const dates = useMemo(() => normaliseDates(value), [value]);

  const marked = useMemo<MarkedDates>(() => {
    const out: MarkedDates = {};
    for (const d of dates) {
      out[d] = {
        customStyles: {
          container: { backgroundColor: palette.gold, borderRadius: 18, borderWidth: d === today ? 2 : 0, borderColor: palette.text },
          text: { color: '#0B0B0C', fontFamily: fonts.bodyBold },
        },
      };
    }
    if (!out[today]) {
      out[today] = { customStyles: { container: { borderRadius: 18, borderWidth: 1.5, borderColor: palette.primary }, text: { color: palette.text, fontFamily: fonts.bodyBold } } };
    }
    return out;
  }, [dates, today, palette]);

  const flip = (day: DateData) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(toggleDate(dates, day.dateString));
  };

  const prefix = `${month.year}-${String(month.month + 1).padStart(2, '0')}-`;
  const withoutMonth = dates.filter((d) => !d.startsWith(prefix));
  const fill = (days: number[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(normaliseDates([...withoutMonth, ...datesFromPattern(days, new Date(month.year, month.month, 1), 1)]));
  };
  const clear = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onChange(withoutMonth);
  };

  const count = datesInMonth(dates, month.year, month.month);
  const monthName = new Date(month.year, month.month, 1).toLocaleDateString('en-GB', { month: 'long' });

  return (
    <View style={{ gap: 14 }}>
      <GlassCard glow="gold" padded={false} animateIn={false}>
        <Calendar
          // The calendar caches its theme; a new key repaints it when the ambiance changes.
          key={phase}
          current={today}
          firstDay={1}
          enableSwipeMonths
          markingType="custom"
          markedDates={marked}
          onDayPress={flip}
          onMonthChange={(d) => setMonth({ year: d.year, month: d.month - 1 })}
          hideExtraDays
          style={{ borderRadius: 22, paddingBottom: 8, backgroundColor: 'transparent' }}
          theme={{
            calendarBackground: 'transparent',
            backgroundColor: 'transparent',
            monthTextColor: palette.text,
            textMonthFontFamily: fonts.display,
            textMonthFontSize: 22,
            textSectionTitleColor: palette.textFaint,
            textDayHeaderFontFamily: fonts.label,
            textDayHeaderFontSize: 11,
            dayTextColor: palette.textDim,
            textDayFontFamily: fonts.bodySemi,
            textDayFontSize: 15,
            todayTextColor: palette.primary,
            textDisabledColor: palette.textFaint,
            arrowColor: palette.gold,
          }}
        />
      </GlassCard>

      <GlassCard animateIn={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Ionicons name="briefcase" size={18} color={palette.gold} />
          <Txt variant="strong" style={{ flex: 1 }}>
            {count} working day{count === 1 ? '' : 's'} in {monthName}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <Legend color={palette.gold} label="Working" filled />
          <Legend color={palette.border} label="Off" />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {MONTH_FILLS.map((f) => (
            <Chip key={f.label} label={f.label} icon="color-fill-outline" onPress={() => fill(f.days)} />
          ))}
          <Chip label={`Clear ${monthName}`} icon="close-circle-outline" onPress={clear} />
        </View>
      </GlassCard>
    </View>
  );
}

function Legend({ color, label, filled }: { color: string; label: string; filled?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: filled ? color : 'transparent', borderWidth: filled ? 0 : 1.5, borderColor: color }} />
      <Txt variant="caption" tone="dim">
        {label}
      </Txt>
    </View>
  );
}
