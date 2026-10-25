import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { WorkingDaysPicker } from '@/components/WorkingDaysPicker';
import { DEFAULT_WORKING_DAYS, normaliseDays } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';

export default function WorkingDays() {
  const { profile, updateProfile } = useAuth();
  const [days, setDays] = useState<number[]>(normaliseDays(profile?.working_days?.length ? profile.working_days : DEFAULT_WORKING_DAYS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (days.length === 0) return setError('Pick at least one working day.');
    setBusy(true);
    setError(null);
    try {
      await updateProfile({ working_days: days });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your working days.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      back
      kicker="Schedule"
      title="Working days"
      footer={
        <>
          {error ? (
            <Txt variant="caption" tone="danger" align="center" style={{ marginBottom: 10 }}>
              {error}
            </Txt>
          ) : null}
          <NeonButton label="Save working days" icon="checkmark" onPress={save} loading={busy} size="lg" full />
        </>
      }
    >
      <WorkingDaysPicker value={days} onChange={setDays} />
    </Screen>
  );
}
