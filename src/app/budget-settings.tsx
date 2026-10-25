import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { BudgetRings } from '@/components/BudgetRings';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { Screen } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { DEFAULT_BUDGETS, budgetsFor, formatPence, monthKey, parseBudget, summariseBudget, type Budgets } from '@/lib/budget';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

const toInput = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));

export default function BudgetSettings() {
  const { profile, updateProfile } = useAuth();
  const { expenses } = useData();
  const saved = budgetsFor(profile);
  const [standard, setStandard] = useState(toInput(saved.standard));
  const [special, setSpecial] = useState(toInput(saved.special));
  const [session, setSession] = useState(toInput(saved.session));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const standardPence = parseBudget(standard);
  const specialPence = parseBudget(special);
  const sessionPence = parseBudget(session);
  const valid = Number.isFinite(standardPence) && Number.isFinite(specialPence) && Number.isFinite(sessionPence) && sessionPence > 0;
  // Live preview of this month against the budgets being typed.
  const month = monthKey(new Date());
  const preview = useMemo(
    () => summariseBudget(expenses, month, valid ? { standard: standardPence, special: specialPence, session: sessionPence } : saved),
    [expenses, month, valid, standardPence, specialPence, sessionPence, saved],
  );

  const save = async (next: Budgets) => {
    setBusy(true);
    setMsg(null);
    try {
      await updateProfile({
        standard_budget: next.standard / 100,
        sales_day_budget: next.special / 100,
        // Only sent when changed, so saving still works before the session column exists.
        ...(next.session !== saved.session ? { ooh_session_allowance: next.session / 100 } : {}),
      });
      setStandard(toInput(next.standard));
      setSpecial(toInput(next.special));
      setSession(toInput(next.session));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMsg({ tone: 'success', text: 'Saved. Your rings and reports now use these budgets.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  };

  const isDefault = saved.standard === DEFAULT_BUDGETS.standard && saved.special === DEFAULT_BUDGETS.special && saved.session === DEFAULT_BUDGETS.session;

  return (
    <Screen back kicker="Finances" title="Budgets">
      <Txt variant="body" tone="dim" style={{ marginBottom: 16 }}>
        Standard expenses come off a monthly budget. Each Sales Day or OOH expense is one session, up to the session allowance, and all sessions share a hard weekly cap that resets every Sunday. Town Takeovers have their own budget, set per day when you log them.
      </Txt>
      <GlassCard glow="gold">
        <Field
          label="Standard budget per month (£)"
          icon="wallet-outline"
          value={standard}
          onChangeText={setStandard}
          keyboardType="decimal-pad"
          placeholder="60"
          error={standard && !Number.isFinite(standardPence) ? 'Enter an amount from £0 to £5,000.' : null}
          hint={`Default ${formatPence(DEFAULT_BUDGETS.standard)}`}
        />
        <Field
          label="Sales Day / OOH weekly cap (£)"
          icon="flash-outline"
          value={special}
          onChangeText={setSpecial}
          keyboardType="decimal-pad"
          placeholder="150"
          error={special && !Number.isFinite(specialPence) ? 'Enter an amount from £0 to £5,000.' : null}
          hint={`Default ${formatPence(DEFAULT_BUDGETS.special)}. A hard limit across all sessions, reset every Sunday.`}
        />
        <Field
          label="Per session allowance (£)"
          icon="ticket-outline"
          value={session}
          onChangeText={setSession}
          keyboardType="decimal-pad"
          placeholder="25"
          error={session && !(Number.isFinite(sessionPence) && sessionPence > 0) ? 'Enter an amount above £0.' : null}
          hint={`Default ${formatPence(DEFAULT_BUDGETS.session)}. Log several sessions in a day if needed, like a surprise OTM.`}
        />
      </GlassCard>

      <GlassCard style={{ marginTop: 14 }}>
        <Txt variant="label" tone="dim" numberOfLines={1} style={{ marginBottom: 14 }}>
          This month and this week with these budgets
        </Txt>
        <BudgetRings budget={preview} />
      </GlassCard>

      {msg ? (
        <Txt variant="caption" tone={msg.tone} style={{ marginTop: 12 }}>
          {msg.text}
        </Txt>
      ) : null}
      <View style={{ gap: 10, marginTop: 16 }}>
        <NeonButton label="Save budgets" icon="checkmark" onPress={() => valid && save({ standard: standardPence, special: specialPence, session: sessionPence })} disabled={!valid} loading={busy} size="lg" full />
        <NeonButton label="Reset to £60, £150 and £25" variant="ghost" onPress={() => save(DEFAULT_BUDGETS)} disabled={busy || isDefault} full />
        <NeonButton label="Done" variant="subtle" onPress={() => router.back()} full />
      </View>
    </Screen>
  );
}
