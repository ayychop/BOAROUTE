import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { GradeBadge } from '@/components/badges';
import { Stepper } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { DEFAULT_FREQUENCIES, GRADES, MAX_MONTHLY_TARGET, targetsFor, usesDefaultTargets } from '@/lib/frequency';
import type { Grade, GradeTargets } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

const GRADE_HINT: Record<Grade, string> = {
  A: 'Flagship stores',
  B: 'High priority',
  C: 'Regular rotation',
  D: 'Light touch',
};

export default function RouteSettings() {
  const { profile, isAdmin, updateProfile } = useAuth();
  const { myStores } = useData();
  const [targets, setTargets] = useState<GradeTargets>(() => targetsFor(profile));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const counts = GRADES.reduce((acc, g) => ({ ...acc, [g]: myStores.filter((s) => s.grade === g).length }), {} as Record<Grade, number>);
  const monthly = GRADES.reduce((a, g) => a + targets[g] * counts[g], 0);
  const isDefault = GRADES.every((g) => targets[g] === DEFAULT_FREQUENCIES[g]);

  const save = async (next: GradeTargets | null) => {
    setBusy(true);
    setMsg(null);
    try {
      // NULL means "use the default", so resetting keeps you on future default changes.
      await updateProfile(
        next
          ? { freq_a: next.A, freq_b: next.B, freq_c: next.C, freq_d: next.D }
          : { freq_a: null, freq_b: null, freq_c: null, freq_d: null },
      );
      if (!next) setTargets({ ...DEFAULT_FREQUENCIES });
      setMsg({ tone: 'success', text: 'Saved. Your route engine is using these targets now.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen back kicker="Route engine" title="Route Settings">
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        {isAdmin
          ? 'Your defaults are A 4, B 3, C 2, D 1 visits a month. You can change them here whenever you need to.'
          : 'Set how many times a month you need to visit each grade of store. The route engine plans around these targets.'}
      </Txt>
      <View style={{ gap: 10 }}>
        {GRADES.map((g, i) => (
          <GlassCard key={g} index={i}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <GradeBadge grade={g} size={40} />
              <View style={{ flex: 1, minWidth: 120 }}>
                <Txt variant="strong">Grade {g}</Txt>
                <Txt variant="caption" tone="faint">
                  {GRADE_HINT[g]} · {counts[g]} in your patch · default {DEFAULT_FREQUENCIES[g]}
                </Txt>
              </View>
              <Stepper label={`Grade ${g} visits per month`} value={targets[g]} min={0} max={MAX_MONTHLY_TARGET} onChange={(v) => setTargets((t) => ({ ...t, [g]: v }))} />
            </View>
          </GlassCard>
        ))}
      </View>
      <GlassCard glow="gold" style={{ marginTop: 14 }}>
        <Txt variant="label" tone="dim">
          Monthly workload
        </Txt>
        <Txt variant="metric" tone="gold" glow>
          {monthly} visits
        </Txt>
        <Txt variant="caption" tone="faint">
          Across {myStores.length} stores, about {Math.ceil(monthly / 20)} a working day.
        </Txt>
      </GlassCard>
      {msg ? (
        <Txt variant="caption" tone={msg.tone} style={{ marginTop: 12 }}>
          {msg.text}
        </Txt>
      ) : null}
      <View style={{ gap: 10, marginTop: 16 }}>
        <NeonButton label="Save targets" icon="checkmark" onPress={() => save(targets)} loading={busy} size="lg" full />
        <NeonButton label="Reset to defaults (A4 B3 C2 D1)" variant="ghost" onPress={() => save(null)} disabled={busy || (isDefault && usesDefaultTargets(profile))} full />
        <NeonButton label="Done" variant="subtle" onPress={() => router.back()} full />
      </View>
    </Screen>
  );
}
