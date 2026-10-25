import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Field } from '@/components/controls';
import { Dropdown } from '@/components/Dropdown';
import { NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { budgetsFor, formatPence, toPence } from '@/lib/budget';
import type { ExpenseCategory } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';

function categoryOptions(standard: string, special: string): { value: ExpenseCategory; label: string; hint: string; icon: 'wallet' | 'flash' | 'moon' }[] {
  return [
    { value: 'standard', label: 'Standard', hint: `Deducts from your ${standard} monthly budget`, icon: 'wallet' },
    { value: 'sales_day', label: 'Sales Day', hint: `Deducts from your ${special} Sales Day / OOH pool`, icon: 'flash' },
    { value: 'ooh', label: 'OOH', hint: `Deducts from your ${special} Sales Day / OOH pool`, icon: 'moon' },
  ];
}

/** Amount, location, recipient and category, saved straight to expenses. */
export function ExpenseForm({ onSaved, submitLabel = 'Add expense' }: { onSaved?: (summary: string) => void; submitLabel?: string }) {
  const { addExpense } = useData();
  const { profile } = useAuth();
  const budgets = budgetsFor(profile);
  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [recipient, setRecipient] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const pence = toPence(amount);
    if (!Number.isFinite(pence) || pence <= 0) return setError('Enter an amount like 12.50.');
    if (pence > 1_000_000) return setError('That amount looks too large.');
    if (!location.trim()) return setError('Add where it was spent.');
    if (!recipient.trim()) return setError('Add who was paid.');
    setBusy(true);
    try {
      await addExpense({ amount: pence / 100, location: location.trim(), recipient: recipient.trim(), category });
      onSaved?.(`£${(pence / 100).toFixed(2)} at ${recipient.trim()}`);
      setAmount('');
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
      <Field label="Amount (£)" icon="cash-outline" value={amount} onChangeText={setAmount} placeholder="12.50" keyboardType="decimal-pad" />
      <Field label="Location" icon="location-outline" value={location} onChangeText={setLocation} placeholder="e.g. Reading Oracle" maxLength={200} />
      <Field label="Recipient" icon="storefront-outline" value={recipient} onChangeText={setRecipient} placeholder="e.g. Costa" maxLength={200} />
      <Dropdown label="Category" value={category} onChange={setCategory} options={categoryOptions(formatPence(budgets.standard), formatPence(budgets.special))} />
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {error}
        </Txt>
      ) : null}
      <NeonButton label={submitLabel} icon="add-circle" variant="gold" onPress={save} loading={busy} full />
    </>
  );
}
