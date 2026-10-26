import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { ShiftCalendar } from '@/components/ShiftCalendar';
import { Txt } from '@/components/Txt';
import { DEFAULT_WORKING_DAYS, datesFromPattern, normaliseDates } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';

export default function WorkingDays() {
  const { profile, updateProfile } = useAuth();
  // First time here: start from the old weekly pattern for this month and the next two.
  const [dates, setDates] = useState<string[]>(() =>
    profile?.shift_dates ? normaliseDates(profile.shift_dates) : datesFromPattern(profile?.working_days?.length ? profile.working_days : DEFAULT_WORKING_DAYS, new Date(), 3),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ shift_dates: dates });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your shift calendar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Schedule"
      title="Shift calendar"
      footer={
        <>
          {error ? (
            <Txt variant="caption" tone="danger" align="center" style={{ marginBottom: 10 }}>
              {error}
            </Txt>
          ) : null}
          <NeonButton label="Save shift calendar" icon="checkmark" onPress={save} loading={busy} size="lg" full />
        </>
      }
    >
      <Txt variant="body" tone="dim" style={{ marginBottom: 14 }}>
        Tap a date to switch it between Working and Off. Swipe for other months. Your Hub and route use these exact dates.
      </Txt>
      <ShiftCalendar value={dates} onChange={setDates} />
    </Screen>
  );
}
