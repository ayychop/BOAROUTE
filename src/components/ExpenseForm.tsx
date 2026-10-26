import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { Field } from '@/components/controls';
import { Dropdown } from '@/components/Dropdown';
import { NeonButton } from '@/components/NeonButton';
import { SpendDatOverlay } from '@/components/SpendDatOverlay';
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
import { MAX_RECEIPTS, captureWithCamera, deleteMedia, pickFromLibrary, uploadReceipts, type PickedMedia } from '@/services/media';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

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

/**
 * Amount, location, recipient, category and receipt photos, saved straight to
 * expenses. Each save plays the Spend Dat overlay; onCelebrated runs once it closes.
 */
export function ExpenseForm({ onSaved, onCelebrated, submitLabel = 'Add expense' }: { onSaved?: (summary: string) => void; onCelebrated?: () => void; submitLabel?: string }) {
  const { addExpense, expenses } = useData();
  const { profile, session } = useAuth();
  const { palette } = useTheme();
  const budgets = budgetsFor(profile);
  const today = localDateString(new Date());
  const [amount, setAmount] = useState('');
  const [celebrating, setCelebrating] = useState(false);
  const [location, setLocation] = useState('');
  const [recipient, setRecipient] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('standard');
  const [dayBudget, setDayBudget] = useState('');
  const [receipts, setReceipts] = useState<PickedMedia[]>([]);
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

  const addReceipt = async (source: 'camera' | 'library') => {
    try {
      const picked = source === 'camera' ? await captureWithCamera(['images']) : await pickFromLibrary(MAX_RECEIPTS - receipts.length, ['images']);
      setReceipts((prev) => [...prev, ...picked].slice(0, MAX_RECEIPTS));
    } catch (e) {
      Alert.alert('Could not add receipt', e instanceof Error ? e.message : 'Please try again.');
    }
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
    if (receipts.length && !session) return setError('Sign in again to upload receipts.');
    setBusy(true);
    let receiptPaths: string[] = [];
    try {
      if (receipts.length && session) receiptPaths = await uploadReceipts(session.user.id, receipts);
      try {
        await addExpense({ amount: pence / 100, location: location.trim(), recipient: recipient.trim(), category, eventBudget: eventBudget === null ? null : eventBudget / 100, customLabel: label.trim() || null, receiptPaths });
      } catch (e) {
        // Don't leave orphaned photos behind when the expense itself was refused.
        deleteMedia(receiptPaths).catch(() => {});
        throw e;
      }
      onSaved?.(`£${(pence / 100).toFixed(2)} at ${recipient.trim()}`);
      setAmount('');
      setLabel('');
      setLocation('');
      setRecipient('');
      setReceipts([]);
      // The overlay fires the sound and a heavy haptic together.
      setCelebrating(true);
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Ionicons name="receipt-outline" size={16} color={palette.gold} />
        <Txt variant="label" tone="gold">
          Receipt photos ({receipts.length}/{MAX_RECEIPTS})
        </Txt>
      </View>
      {receipts.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12, paddingTop: 6 }}>
          {receipts.map((r, i) => (
            <Animated.View key={`${r.uri}-${i}`} entering={ZoomIn.springify()} exiting={ZoomOut.duration(150)}>
              <View style={{ width: 72, height: 96, borderRadius: radius.md, overflow: 'hidden', backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.border }}>
                <Image source={{ uri: r.uri }} style={{ width: 72, height: 96 }} contentFit="cover" accessibilityLabel={`Receipt ${i + 1}`} />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove receipt"
                onPress={() => setReceipts((prev) => prev.filter((_, j) => j !== i))}
                hitSlop={8}
                disabled={busy}
                style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: palette.danger, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={15} color="#fff" />
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}
      {receipts.length < MAX_RECEIPTS ? (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <NeonButton size="sm" variant="subtle" icon="camera" label={receipts.length ? 'Add another' : 'Snap receipt'} onPress={() => addReceipt('camera')} disabled={busy} />
          <NeonButton size="sm" variant="subtle" icon="images" label="From gallery" onPress={() => addReceipt('library')} disabled={busy} />
        </View>
      ) : null}
      {error ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {error}
        </Txt>
      ) : null}
      <NeonButton label={submitLabel} icon="add-circle" variant="gold" onPress={save} loading={busy} full />
      <SpendDatOverlay
        visible={celebrating}
        onDone={() => {
          setCelebrating(false);
          onCelebrated?.();
        }}
      />
    </>
  );
}
