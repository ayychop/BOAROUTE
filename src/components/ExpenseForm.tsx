import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Field } from '@/components/controls';
import { Dropdown } from '@/components/Dropdown';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import {
  DEFAULT_TAKEOVER_DAY_PENCE,
  budgetsFor,
  checkExpense,
  formatPence,
  localDateString,
  monthKey,
  parseBudget,
  summariseBudget,
  takeoverBudgetFor,
  toPence,
  type Budgets,
} from '@/lib/budget';
import type { ExpenseCategory } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

type Icon = 'wallet' | 'flash' | 'moon' | 'megaphone';

function categoryOptions(b: Budgets): { value: ExpenseCategory; label: string; hint: string; icon: Icon }[] {
  const session = `${formatPence(b.session)} session, ${formatPence(b.special)} weekly cap`;
  return [
    { value: 'standard', label: 'Standard', hint: `Deducts from your ${formatPence(b.standard)} monthly budget`, icon: 'wallet' },
    { value: 'sales_day', label: 'Sales Day', hint: session, icon: 'flash' },
    { value: 'ooh', label: 'OOH', hint: session, icon: 'moon' },
    { value: 'town_takeover', label: 'Town Takeover', hint: 'Special event with its own day budget, no caps', icon: 'megaphone' },
  ];
}

const toInput = (pence: number) => (pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2));

/** Amount, location, recipient and category, saved straight to expenses. */
export function ExpenseForm({ onSaved, submitLabel = 'Add expense' }: { onSaved?: (summary: string) => void; submitLabel?: string }) {
  const { addExpense, expenses } = useData();
  const { profile } = useAuth();
  const budgets = budgetsFor(profile);
  const today = localDateString(new Date());
  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [recipient, setRecipient] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('standard');
  const [dayBudget, setDayBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSession = category === 'sales_day' || category === 'ooh';
  const week = summariseBudget(expenses, monthKey(new Date()), budgets);
  const existingDayBudget = takeoverBudgetFor(today, expenses);

  const pickCategory = (c: ExpenseCategory) => {
    setCategory(c);
    setError(null);
    if (c === 'town_takeover' && !dayBudget) setDayBudget(toInput(existingDayBudget ?? DEFAULT_TAKEOVER_DAY_PENCE));
    if ((c === 'sales_day' || c === 'ooh') && !amount) setAmount(toInput(budgets.session));
  };

  const save = async () => {
    setError(null);
    const pence = toPence(amount);
    if (!Number.isFinite(pence) || pence <= 0) return setError('Enter an amount like 12.50.');
    if (pence > 1_000_000) return setError('That amount looks too large.');
    if (!location.trim()) return setError('Add where it was spent.');
    if (!recipient.trim()) return setError('Add who was paid.');
    const eventBudget = category === 'town_takeover' ? parseBudget(dayBudget) : null;
    const rule = checkExpense({ category, amount: pence, date: today, eventBudget }, expenses, budgets);
    if (rule) return setError(rule);
    setBusy(true);
    try {
      await addExpense({ amount: pence / 100, location: location.trim(), recipient: recipient.trim(), category, eventBudget: eventBudget === null ? null : eventBudget / 100, customLabel: label.trim() || null });
      onSaved?.(`£${(pence / 100).toFixed(2)} at ${recipient.trim()}`);
      setAmount('');
      setLabel('');
      setLocation('');
      setRecipient('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Dropdown label="Category" value={category} onChange={pickCategory} options={categoryOptions(budgets)} />
      <Field label="Expense Label (Optional)" icon="pricetag-outline" value={label} onChangeText={setLabel} placeholder="e.g., Parking, Train, Supplies" maxLength={60} autoCapitalize="sentences" returnKeyType="next" />
      {isSession ? (
        <Txt variant="caption" tone={week.sessions.left > 0 ? 'dim' : 'danger'} style={{ marginBottom: 10 }}>
          {week.sessions.left > 0
            ? `${week.sessions.left} × ${formatPence(budgets.session)} session${week.sessions.left === 1 ? '' : 's'} left this week (${formatPence(Math.max(0, week.special.remaining))} of ${formatPence(budgets.special)}). Resets Sunday.`
            : `This week's ${formatPence(budgets.special)} cap is used up. It resets on Sunday.`}
        </Txt>
      ) : null}
      <Field label="Amount (£)" icon="cash-outline" value={amount} onChangeText={setAmount} placeholder={isSession ? toInput(budgets.session) : '12.50'} keyboardType="decimal-pad" />
      {category === 'town_takeover' && (
        <Field
          label="Budget for this takeover day (£)"
          icon="megaphone-outline"
          value={dayBudget}
          onChangeText={setDayBudget}
          keyboardType="decimal-pad"
          placeholder="60"
          hint={existingDayBudget !== null ? `Today already has a ${formatPence(existingDayBudget)} takeover budget.` : 'Set what the event allows. Session and weekly caps do not apply.'}
        />
      )}
      <Field label="Location" icon="location-outline" value={location} onChangeText={setLocation} placeholder="e.g. Reading Oracle" maxLength={200} />
      <Field label="Recipient" icon="storefront-outline" value={recipient} onChangeText={setRecipient} placeholder="e.g. Costa" maxLength={200} />
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {error}
        </Txt>
      ) : null}
      <NeonButton label={submitLabel} icon="add-circle" variant="gold" onPress={save} loading={busy} full />
    </>
  );
}
