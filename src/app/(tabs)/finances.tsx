import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Chip, Field, Segmented } from '@/components/controls';
import { Dropdown } from '@/components/Dropdown';
import { GlassCard } from '@/components/GlassCard';
import { NeonButton } from '@/components/NeonButton';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { CATEGORY_LABEL, formatPence, inMonth, monthKey, parseMiles, summariseBudget, summariseMileage, toPence } from '@/lib/budget';
import { buildMonthlyReport, monthTitle, ukDate } from '@/lib/report';
import type { ExpenseCategory, MileageType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';

function recentMonths(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
}

export default function Finances() {
  const { palette } = useTheme();
  const { profile } = useAuth();
  const { mileage, expenses, addMileage, addExpense, deleteExpense, deleteMileage, refresh } = useData();
  const { compact, expanded } = useLayout();
  const month = monthKey(new Date());

  const budget = useMemo(() => summariseBudget(expenses, month), [expenses, month]);
  const miles = useMemo(() => summariseMileage(mileage, month), [mileage, month]);

  // Mileage form
  const [mileType, setMileType] = useState<MileageType>('work');
  const [milesInput, setMilesInput] = useState('');
  const [mileNote, setMileNote] = useState('');
  const [mileBusy, setMileBusy] = useState(false);
  const [mileError, setMileError] = useState<string | null>(null);

  // Expense form
  const [amount, setAmount] = useState('');
  const [location, setLocation] = useState('');
  const [recipient, setRecipient] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('standard');
  const [expBusy, setExpBusy] = useState(false);
  const [expError, setExpError] = useState<string | null>(null);

  // Report
  const [reportMonth, setReportMonth] = useState(month);
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const saveMiles = async () => {
    setMileError(null);
    const v = parseMiles(milesInput);
    if (!Number.isFinite(v)) return setMileError('Enter miles like 42 or 42.5 (up to 2000).');
    setMileBusy(true);
    try {
      await addMileage({ miles: v, type: mileType, notes: mileNote.trim() || null });
      setMilesInput('');
      setMileNote('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setMileError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setMileBusy(false);
    }
  };

  const saveExpense = async () => {
    setExpError(null);
    const pence = toPence(amount);
    if (!Number.isFinite(pence) || pence <= 0) return setExpError('Enter an amount like 12.50.');
    if (pence > 1_000_000) return setExpError('That amount looks too large.');
    if (!location.trim()) return setExpError('Add where it was spent.');
    if (!recipient.trim()) return setExpError('Add who was paid.');
    setExpBusy(true);
    try {
      await addExpense({ amount: pence / 100, location: location.trim(), recipient: recipient.trim(), category });
      setAmount('');
      setLocation('');
      setRecipient('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setExpError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setExpBusy(false);
    }
  };

  const generate = () => {
    setReport(buildMonthlyReport({ month: reportMonth, name: profile?.name, mileage, expenses }));
    setCopied(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const bigRing = compact ? 150 : expanded ? 230 : 190;
  const smallRing = compact ? 104 : expanded ? 150 : 128;
  const thisMonthExpenses = expenses.filter((e) => inMonth(e.date, month));
  const thisMonthMiles = mileage.filter((m) => inMonth(m.date, month));

  const rings = (
    <GlassCard glow={budget.standard.over ? false : 'gold'} index={0}>
      <Txt variant="label" tone="dim" align="center" style={{ marginBottom: 12 }}>
        {monthTitle(month)} budgets
      </Txt>
      <View style={{ flexDirection: compact ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 16 : 28 }}>
        <ProgressRing
          value={budget.standard.remainingRatio}
          size={bigRing}
          stroke={compact ? 12 : 16}
          colors={budget.standard.over ? [palette.danger, palette.warning] : [palette.gold, palette.primary]}
          accessibilityLabel={`Standard budget: ${formatPence(budget.standard.remaining)} remaining of ${formatPence(budget.standard.budget)}`}
        >
          <Txt variant="label" tone="faint" style={{ fontSize: 9 }}>
            {budget.standard.over ? 'Over by' : 'Remaining'}
          </Txt>
          <Txt variant="metric" glow tone={budget.standard.over ? 'danger' : 'gold'} adjustsFontSizeToFit numberOfLines={1} style={{ fontSize: compact ? 24 : 32, lineHeight: compact ? 30 : 38 }}>
            {formatPence(Math.abs(budget.standard.remaining))}
          </Txt>
          <Txt variant="caption" tone="dim">
            of £60 standard
          </Txt>
        </ProgressRing>
        <ProgressRing
          value={budget.special.remainingRatio}
          size={smallRing}
          stroke={compact ? 9 : 11}
          colors={budget.special.over ? [palette.danger, palette.warning] : ['#B57BFF', palette.primary]}
          accessibilityLabel={`Sales Day and OOH budget: ${formatPence(budget.special.remaining)} remaining of ${formatPence(budget.special.budget)}`}
        >
          <Txt variant="label" tone="faint" style={{ fontSize: 8 }}>
            {budget.special.over ? 'Over by' : 'Left'}
          </Txt>
          <Txt variant="title" glow tone={budget.special.over ? 'danger' : 'default'} adjustsFontSizeToFit numberOfLines={1}>
            {formatPence(Math.abs(budget.special.remaining))}
          </Txt>
          <Txt variant="caption" tone="faint" style={{ fontSize: 11 }} align="center">
            Sales Day / OOH
          </Txt>
        </ProgressRing>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        {(['standard', 'sales_day', 'ooh'] as ExpenseCategory[]).map((c) => (
          <View key={c} style={{ alignItems: 'center', minWidth: 90 }}>
            <Txt variant="label" tone="faint">
              {CATEGORY_LABEL[c]}
            </Txt>
            <Txt variant="strong">{formatPence(budget.byCategory[c])}</Txt>
          </View>
        ))}
      </View>
    </GlassCard>
  );

  const mileageCard = (
    <GlassCard index={1}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt variant="title">Mileage</Txt>
        <Txt variant="caption" tone="dim">
          {miles.work.toFixed(1)} work · {miles.personal.toFixed(1)} personal
        </Txt>
      </View>
      <Segmented
        big
        value={mileType}
        onChange={setMileType}
        options={[
          { value: 'work', label: 'Work', icon: 'briefcase' },
          { value: 'personal', label: 'Personal', icon: 'home' },
        ]}
        style={{ marginBottom: 14 }}
      />
      <Field label="Miles" icon="speedometer-outline" value={milesInput} onChangeText={setMilesInput} placeholder="e.g. 42.5" keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={saveMiles} error={mileError} />
      <Field label="Note (optional)" value={mileNote} onChangeText={setMileNote} placeholder="e.g. Reading loop" maxLength={500} />
      <NeonButton label={`Log ${mileType} miles`} icon="add-circle" onPress={saveMiles} loading={mileBusy} full />
    </GlassCard>
  );

  const expenseCard = (
    <GlassCard index={2}>
      <Txt variant="title" style={{ marginBottom: 12 }}>
        Quick expense
      </Txt>
      <Field label="Amount (£)" icon="cash-outline" value={amount} onChangeText={setAmount} placeholder="12.50" keyboardType="decimal-pad" />
      <Field label="Location" icon="location-outline" value={location} onChangeText={setLocation} placeholder="e.g. Reading Oracle" maxLength={200} />
      <Field label="Recipient" icon="storefront-outline" value={recipient} onChangeText={setRecipient} placeholder="e.g. Costa" maxLength={200} />
      <Dropdown
        label="Category"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'standard', label: 'Standard', hint: 'Deducts from the £60 monthly budget', icon: 'wallet' },
          { value: 'sales_day', label: 'Sales Day', hint: 'Deducts from the £25 Sales Day / OOH pool', icon: 'flash' },
          { value: 'ooh', label: 'OOH', hint: 'Deducts from the £25 Sales Day / OOH pool', icon: 'moon' },
        ]}
      />
      {expError ? (
        <Txt variant="caption" tone="danger" style={{ marginBottom: 10 }}>
          {expError}
        </Txt>
      ) : null}
      <NeonButton label="Add expense" icon="add-circle" variant="gold" onPress={saveExpense} loading={expBusy} full />
    </GlassCard>
  );

  const history = (
    <View>
      <SectionHeader title="This month" />
      {thisMonthExpenses.length === 0 && thisMonthMiles.length === 0 ? (
        <Txt variant="caption" tone="faint">
          Nothing logged yet this month.
        </Txt>
      ) : (
        <View style={{ gap: 8 }}>
          {thisMonthExpenses.map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)}>
              <Row
                icon={e.category === 'standard' ? 'wallet' : e.category === 'sales_day' ? 'flash' : 'moon'}
                title={`${formatPence(toPence(e.amount))} · ${e.recipient}`}
                sub={`${ukDate(e.date)} · ${e.location} · ${CATEGORY_LABEL[e.category]}`}
                onDelete={() => confirmDelete('expense', () => deleteExpense(e.id))}
              />
            </Animated.View>
          ))}
          {thisMonthMiles.map((m, i) => (
            <Animated.View key={m.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)}>
              <Row
                icon={m.type === 'work' ? 'briefcase' : 'home'}
                title={`${Number(m.miles).toFixed(1)} mi · ${m.type === 'work' ? 'Work' : 'Personal'}`}
                sub={`${ukDate(m.date)}${m.notes ? ` · ${m.notes}` : ''}`}
                onDelete={() => confirmDelete('mileage log', () => deleteMileage(m.id))}
              />
            </Animated.View>
          ))}
        </View>
      )}
    </View>
  );

  const reportCard = (
    <View>
      <SectionHeader title="End-of-month report" />
      <GlassCard glow="primary">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
          {recentMonths(6).map((m) => (
            <Chip
              key={m}
              label={monthTitle(m)}
              active={reportMonth === m}
              onPress={() => {
                setReportMonth(m);
                setReport(null);
              }}
            />
          ))}
        </ScrollView>
        <NeonButton label="Generate Report" icon="document-text" onPress={generate} size="lg" full />
        {report && (
          <Animated.View entering={FadeInDown.springify().damping(18)} style={{ marginTop: 14 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator style={{ borderRadius: radius.md, backgroundColor: palette.inputBg, borderWidth: 1, borderColor: palette.border }}>
              <Txt selectable style={{ fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 21, color: palette.text, padding: 14 }}>
                {report}
              </Txt>
            </ScrollView>
            <NeonButton
              label={copied ? 'Copied to clipboard' : 'Copy to Clipboard'}
              icon={copied ? 'checkmark-done' : 'copy'}
              variant="gold"
              onPress={async () => {
                await Clipboard.setStringAsync(report);
                setCopied(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              }}
              full
              style={{ marginTop: 12 }}
            />
          </Animated.View>
        )}
      </GlassCard>
    </View>
  );

  return (
    <Screen
      inTabs
      kicker="Finances & mileage"
      title="Finances"
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      {rings}
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 12 }}>
            {mileageCard}
            {history}
          </View>
          <View style={{ flex: 1, gap: 12 }}>
            {expenseCard}
            {reportCard}
          </View>
        </View>
      ) : (
        <View style={{ gap: 12, marginTop: 12 }}>
          {mileageCard}
          {expenseCard}
          {history}
          {reportCard}
        </View>
      )}
    </Screen>
  );
}

function confirmDelete(what: string, run: () => Promise<void>) {
  Alert.alert(`Delete this ${what}?`, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run().catch((e) => Alert.alert('Could not delete', e.message)) },
  ]);
}

function Row({ icon, title, sub, onDelete }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onDelete: () => void }) {
  const { palette } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}>
      <Ionicons name={icon} size={18} color={palette.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="strong" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="caption" tone="faint" numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete">
        <Ionicons name="trash-outline" size={18} color={palette.textFaint} />
      </Pressable>
    </View>
  );
}
