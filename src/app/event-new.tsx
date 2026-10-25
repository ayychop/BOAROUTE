import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Field, Segmented, ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { formatDateTime } from '@/lib/format';
import { planReminders } from '@/lib/reminders';
import type { EventType } from '@/lib/types';
import { useData } from '@/providers/DataProvider';
import { ensureNotificationPermission } from '@/services/notifications';
import { useTheme } from '@/theme/ThemeProvider';

function defaultDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export default function NewEvent() {
  const { palette } = useTheme();
  const { addEvent } = useData();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<EventType>('General');
  const [date, setDate] = useState(defaultDate);
  const [before, setBefore] = useState(true);
  const [onDay, setOnDay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iosPicker, setIosPicker] = useState(false);

  const pickAndroid = () => {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      minimumDate: new Date(),
      onChange: (e: DateTimePickerEvent, d?: Date) => {
        if (e.type !== 'set' || !d) return;
        const picked = new Date(d);
        picked.setHours(date.getHours(), date.getMinutes(), 0, 0);
        DateTimePickerAndroid.open({
          value: picked,
          mode: 'time',
          is24Hour: true,
          onChange: (e2: DateTimePickerEvent, t?: Date) => {
            if (e2.type !== 'set' || !t) {
              setDate(picked);
              return;
            }
            const final = new Date(picked);
            final.setHours(t.getHours(), t.getMinutes(), 0, 0);
            setDate(final);
          },
        });
      },
    });
  };

  const plan = planReminders(date, { before, onDay });

  const save = async () => {
    setError(null);
    if (!title.trim()) return setError('Give the event a title.');
    if (date.getTime() < Date.now() - 60_000) return setError('Pick a time in the future.');
    setBusy(true);
    try {
      if (before || onDay) await ensureNotificationPermission().catch(() => false);
      await addEvent({
        title: title.trim().slice(0, 200),
        description: description.trim() || null,
        event_date: date.toISOString(),
        reminder_before: before,
        reminder_on_day: onDay,
        event_type: type,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the event.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Work events" title="Log an event">
      <GlassCard glow={type === 'Sales Day' ? 'gold' : 'primary'}>
        <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
          Event type
        </Txt>
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: 'General', label: 'General' },
            { value: 'Sales Day', label: 'Sales Day', icon: 'flash' },
            { value: 'OOH', label: 'OOH', icon: 'moon' },
          ]}
          style={{ marginBottom: 16 }}
        />
        <Field label="Title" icon="calendar-outline" value={title} onChangeText={setTitle} placeholder="e.g. Reading O2 launch" maxLength={200} />
        <Field label="Notes (optional)" value={description} onChangeText={setDescription} multiline placeholder="Who, what to bring, parking..." />

        <Txt variant="label" tone="dim" style={{ marginBottom: 6 }}>
          When
        </Txt>
        <NeonButton
          variant="subtle"
          icon="time-outline"
          label={formatDateTime(date)}
          onPress={() => (Platform.OS === 'android' ? pickAndroid() : setIosPicker((v) => !v))}
          full
        />
        {Platform.OS === 'ios' && iosPicker && (
          <DateTimePicker
            value={date}
            mode="datetime"
            display="inline"
            minimumDate={new Date()}
            onChange={(_, d) => d && setDate(d)}
            themeVariant={palette.statusBar === 'light' ? 'dark' : 'light'}
            accentColor={palette.primary}
          />
        )}

        <View style={{ marginTop: 14 }}>
          <ToggleRow label="Remind me the day before" hint={plan.dayBefore ? formatDateTime(plan.dayBefore) : before ? 'Too late for a day-before reminder' : undefined} value={before} onChange={setBefore} />
          <ToggleRow label="Remind me on the morning" hint={plan.morningOf ? formatDateTime(plan.morningOf) : onDay ? 'Too late for a morning reminder' : undefined} value={onDay} onChange={setOnDay} />
        </View>

        {error ? (
          <Txt variant="caption" tone="danger" style={{ marginVertical: 8 }}>
            {error}
          </Txt>
        ) : null}
        <NeonButton label="Save event" icon="checkmark" variant={type === 'Sales Day' ? 'gold' : 'primary'} onPress={save} loading={busy} size="lg" full style={{ marginTop: 8 }} />
      </GlassCard>
    </Screen>
  );
}
