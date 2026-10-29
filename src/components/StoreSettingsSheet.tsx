import { useState } from 'react';
import { View } from 'react-native';
import { Chip, Stepper, ToggleRow } from '@/components/controls';
import { BottomSheet } from '@/components/NavOverlays';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { GRADES, MAX_MONTHLY_TARGET } from '@/lib/frequency';
import type { Grade, GradeTargets, Store } from '@/lib/types';
import { canChangeGrade } from '@/lib/visit-limits';
import { useAuth } from '@/providers/AuthProvider';

interface Props {
  store: Store;
  targets: GradeTargets;
  open: boolean;
  onClose: () => void;
  onSave: (grade: Grade, frequency: number | null) => Promise<void>;
}

/** Store > Edit: grade and monthly frequency. Remounted per opening so it always starts from the saved values. */
export function StoreSettingsSheet({ store, targets, open, onClose, onSave }: Props) {
  const { userRole, isAdmin } = useAuth();
  // D grade doubles an OM's weekly visits, so only the admin regrades for OMs (the database enforces it too).
  const gradeLocked = !canChangeGrade(userRole, isAdmin);
  const [grade, setGrade] = useState<Grade>(store.grade);
  const [custom, setCustom] = useState(store.frequency_custom === true);
  const [frequency, setFrequency] = useState(store.frequency_custom ? store.required_frequency : targets[store.grade]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(grade, custom ? frequency : null);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} label="Edit store">
      <Txt variant="title" style={{ marginBottom: 4 }}>
        Edit store
      </Txt>
      <Txt variant="caption" tone="faint" style={{ marginBottom: 16 }} numberOfLines={2}>
        {store.name}
      </Txt>

      <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
        Grade
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: gradeLocked ? 8 : 16 }}>
        {(gradeLocked ? [store.grade] : GRADES).map((g) => (
          <Chip
            key={g}
            icon={gradeLocked ? 'lock-closed' : undefined}
            label={`Grade ${g}`}
            active={grade === g}
            onPress={
              gradeLocked
                ? undefined
                : () => {
                    setGrade(g);
                    if (!custom) setFrequency(targets[g]);
                  }
            }
          />
        ))}
      </View>
      {gradeLocked ? (
        <Txt variant="caption" tone="faint" style={{ marginBottom: 16 }}>
          Only your admin can change a store&apos;s grade, because it sets your weekly visit limit.
        </Txt>
      ) : null}

      <ToggleRow
        label="Custom visit frequency"
        hint={custom ? 'This store keeps its own target, whatever its grade.' : `Following your Grade ${grade} target: ${targets[grade]} a month.`}
        value={custom}
        onChange={(v) => {
          setCustom(v);
          if (!v) setFrequency(targets[grade]);
        }}
      />
      {custom && <Stepper label="Visits required per month" value={frequency} min={0} max={MAX_MONTHLY_TARGET} onChange={setFrequency} />}

      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginTop: 10 }}>
          {error}
        </Txt>
      ) : null}
      <View style={{ gap: 10, marginTop: 16 }}>
        <NeonButton label="Save changes" icon="checkmark" variant="gold" size="lg" onPress={save} loading={busy} full />
        <NeonButton label="Cancel" variant="ghost" onPress={onClose} disabled={busy} full />
      </View>
    </BottomSheet>
  );
}
