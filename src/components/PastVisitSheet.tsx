import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Field } from '@/components/controls';
import { BottomSheet } from '@/components/NavOverlays';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { parsePastVisitCount } from '@/lib/visit-timer';
import type { Store } from '@/lib/types';

interface Props {
  store: Store;
  /** Visits already counted this month, shown so nothing is logged twice. */
  done: number;
  open: boolean;
  onClose: () => void;
  onSave: (count: number) => Promise<void>;
}

/** Store > Log Past Visit: visits done this month before they were tracked in the app. No timer. */
export function PastVisitSheet({ store, done, open, onClose, onSave }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const count = parsePastVisitCount(value, done);
    if (typeof count === 'string') return setError(count);
    setBusy(true);
    setError(null);
    try {
      await onSave(count);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setValue('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log the visits. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} label="Log past visits">
      <Txt variant="title" style={{ marginBottom: 4 }}>
        Log past visits
      </Txt>
      <Txt variant="caption" tone="faint" style={{ marginBottom: 16 }} numberOfLines={2}>
        {store.name}
      </Txt>
      <Txt variant="body" tone="dim" style={{ marginBottom: 14 }}>
        How many visits have you already done here this month that are not in the app yet? {done > 0 ? `${done} ${done === 1 ? 'is' : 'are'} already counted.` : ''}
      </Txt>
      <Field label="Visits to add" icon="calendar-number-outline" value={value} onChangeText={(t) => setValue(t.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" inputMode="numeric" placeholder="e.g. 2" maxLength={2} returnKeyType="done" onSubmitEditing={save} autoFocus />
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {error}
        </Txt>
      ) : null}
      <NeonButton label="Log visits" icon="checkmark-circle" variant="gold" onPress={save} loading={busy} full />
      <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 10 }}>
        They count towards this month straight away. No visit timer needed.
      </Txt>
    </BottomSheet>
  );
}
