import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Chip, Field, Segmented } from '@/components/controls';
import { ExpenseForm } from '@/components/ExpenseForm';
import { GlassCard } from '@/components/GlassCard';
import { MediaViewer } from '@/components/MediaViewer';
import { DataErrorBanner, StatTile } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Odometer } from '@/components/Odometer';
import { BudgetRings } from '@/components/BudgetRings';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useUnits } from '@/hooks/useUnits';
import { CATEGORY_LABEL, budgetsFor, formatPence, inMonth, parseMiles, summariseBudget, summariseMileage, toPence } from '@/lib/budget';
import { copyText } from '@/lib/external';
import { formatOdometer, odometerValue, parseOdometer } from '@/lib/odometer';
import { vehicleFor } from '@/lib/vehicles';
import { buildMonthlyReport, expenseLabel, monthTitle, ukDate } from '@/lib/report';
import { formatDuration, summariseVisitTimes } from '@/lib/visit-timer';
import type { ExpenseCategory, MileageType } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { recentMonths } from '@/lib/history';
import { signMedia } from '@/services/media';
import { exportMonthlyReport, type ExportFormat } from '@/services/report-export';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radius } from '@/theme/typography';

export default function Finances() {
  const { palette } = useTheme();
  const { profile, updateProfile, session } = useAuth();
  const { mileage, expenses, visits, stores, today, addMileage, deleteExpense, deleteMileage, refresh } = useData();
  const params = useLocalSearchParams<{ month?: string }>();
  const u = useUnits();
  const { compact, expanded } = useLayout();
  // Matches GlassCard's inner padding.
  const cardPad = compact ? 16 : 20;
  const month = today.slice(0, 7);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const budgets = useMemo(() => budgetsFor(profile), [profile]);
  const budget = useMemo(() => summariseBudget(expenses, month, budgets), [expenses, month, budgets]);
  const miles = useMemo(() => summariseMileage(mileage, month), [mileage, month]);
  const [receipt, setReceipt] = useState<{ paths: string[]; urls: Record<string, string>; at: number } | null>(null);
  const openReceipts = async (paths: string[]) => {
    const urls = await signMedia(paths).catch(() => ({}) as Record<string, string>);
    if (!Object.keys(urls).length) return Alert.alert('Could not open receipt', 'Check your connection and try again.');
    setReceipt({ paths, urls, at: 0 });
  };
  const receiptPath = receipt ? receipt.paths[receipt.at] : null;

  // Mileage form
  const [mileType, setMileType] = useState<MileageType>('work');
  const [milesInput, setMilesInput] = useState('');
  const [mileNote, setMileNote] = useState('');
  const [mileBusy, setMileBusy] = useState(false);
  const [mileError, setMileError] = useState<string | null>(null);

  // Odometer correction
  const [odoEdit, setOdoEdit] = useState<string | null>(null);
  const [odoBusy, setOdoBusy] = useState(false);
  const [odoError, setOdoError] = useState<string | null>(null);
  // Stored in miles; shown and typed in the person's unit.
  const odoMiles = odometerValue(profile?.current_mileage);
  const odo = odoMiles === null ? null : u.milesValue(odoMiles);
  const vehicle = vehicleFor(profile?.vehicle_model);

  // Report
  const [reportMonth, setReportMonth] = useState(month);
  const [report, setReport] = useState<string | null>(null);
  // "Export report" on Home opens here on the month the dashboard was showing.
  const [paramMonth, setParamMonth] = useState<string | undefined>(undefined);
  if (params.month !== paramMonth) {
    setParamMonth(params.month);
    if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
      setReportMonth(params.month);
      setReport(null);
    }
  }
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const saveMiles = async () => {
    setMileError(null);
    const typed = parseMiles(milesInput);
    if (!Number.isFinite(typed)) return setMileError(`Enter ${u.word} like 42 or 42.5 (up to 2000).`);
    const v = Math.round(u.toMiles(typed) * 10) / 10;
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

  const saveOdometer = async () => {
    if (odoEdit === null) return;
    const typed = parseOdometer(odoEdit);
    if (!Number.isFinite(typed)) return setOdoError('Enter the reading as shown on your dashboard, for example 14500.');
    const v = Math.round(u.toMiles(typed) * 10) / 10;
    setOdoBusy(true);
    setOdoError(null);
    try {
      await updateProfile({ current_mileage: v });
      setOdoEdit(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      setOdoError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setOdoBusy(false);
    }
  };

  const visitTimes = useMemo(() => summariseVisitTimes(visits, reportMonth, stores), [visits, reportMonth, stores]);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const runExport = async (format: ExportFormat) => {
    const userId = session?.user.id;
    if (!userId || exporting) return;
    setExporting(format);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      await exportMonthlyReport({ userId, month: reportMonth, name: profile?.name, visits, stores, mileage, expenses, visitTimes }, format, setExportStatus);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setExporting(null);
      setExportStatus(null);
    }
  };

  const generate = () => {
    setReport(buildMonthlyReport({ month: reportMonth, name: profile?.name, mileage, expenses, budgets, visitTimes }));
    setCopied(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const thisMonthExpenses = expenses.filter((e) => inMonth(e.date, month));
  const thisMonthMiles = mileage.filter((m) => inMonth(m.date, month));

  const odometerCard = (
    <GlassCard glow="gold" index={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" tone="dim" numberOfLines={2}>
            Current mileage
          </Txt>
          <Txt variant="caption" tone="faint" numberOfLines={1}>
            {vehicle ? `${vehicle.year} BMW X1 · ${vehicle.specs[0].value}` : 'Your vehicle'}
          </Txt>
        </View>
        {odoEdit === null && (
          <View style={{ flexShrink: 0 }}>
            <NeonButton size="sm" variant="subtle" icon="create-outline" label={odo === null ? 'Set' : 'Correct'} onPress={() => setOdoEdit(odo === null ? '' : String(Math.floor(odo)))} />
          </View>
        )}
      </View>
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.border }}>
        <Odometer value={odo} size={compact ? 'md' : 'lg'} />
      </View>
      <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 12 }}>
        {odo === null ? 'Set your reading once and every trip you log adds to it.' : `Updates automatically when you log a trip · ${formatOdometer(odo)} ${u.word}`}
      </Txt>
      {odoEdit !== null && (
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ marginTop: 16 }}>
          <Field label="Dashboard reading" icon="speedometer-outline" value={odoEdit} onChangeText={setOdoEdit} keyboardType="number-pad" maxLength={9} placeholder="e.g. 14500" error={odoError} autoFocus />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NeonButton label="Cancel" variant="subtle" onPress={() => { setOdoEdit(null); setOdoError(null); }} />
            <NeonButton label="Save reading" icon="checkmark" onPress={saveOdometer} loading={odoBusy} style={{ flex: 1 }} full />
          </View>
        </Animated.View>
      )}
    </GlassCard>
  );

  const rings = (
    <GlassCard index={1}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <Txt variant="label" tone="dim" numberOfLines={1}>
          {monthTitle(month)} budgets
        </Txt>
        <Pressable accessibilityRole="link" onPress={() => router.push('/budget-settings')} hitSlop={10} style={{ flexShrink: 0 }}>
          <Txt variant="label" tone="primary" numberOfLines={1}>
            Edit
          </Txt>
        </Pressable>
      </View>
      <BudgetRings budget={budget} large />
      <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 10 }}>
        Standard is monthly. OOH and Sales Day sessions are {formatPence(budget.sessions.allowance)} each with a {formatPence(budget.special.budget)} weekly cap (week of {ukDate(budget.week)}, resets Sunday). Town Takeovers use their own day budgets.
      </Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, flexWrap: 'wrap', gap: 8 }}>
        {(['standard', 'sales_day', 'ooh', 'town_takeover'] as ExpenseCategory[]).map((c) => (
          <View key={c} style={{ alignItems: 'center', flexGrow: 1, flexBasis: 80, minWidth: 0 }}>
            <Txt variant="label" tone="faint" numberOfLines={1}>
              {CATEGORY_LABEL[c]}
            </Txt>
            <Txt variant="strong" numberOfLines={1}>
              {formatPence(budget.byCategory[c])}
            </Txt>
          </View>
        ))}
      </View>
    </GlassCard>
  );

  const mileageCard = (
    <GlassCard index={2}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Txt variant="title">Log a trip</Txt>
        <Txt variant="caption" tone="dim">
          {u.miles(miles.work)} work · {u.miles(miles.personal)} personal
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
      <Field label={u.unit === 'km' ? 'Kilometres' : 'Miles'} icon="speedometer-outline" value={milesInput} onChangeText={setMilesInput} placeholder="e.g. 42.5" keyboardType="decimal-pad" returnKeyType="done" onSubmitEditing={saveMiles} error={mileError} />
      <Field label="Note (optional)" value={mileNote} onChangeText={setMileNote} placeholder="e.g. Reading loop" maxLength={500} />
      <NeonButton label={`Log ${mileType} ${u.word}`} icon="add-circle" onPress={saveMiles} loading={mileBusy} full />
      {odo !== null && (
        <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 10 }}>
          Adds to your odometer ({formatOdometer(odo)} {u.label})
        </Txt>
      )}
    </GlassCard>
  );

  const expenseCard = (
    <GlassCard index={3}>
      <Txt variant="title" style={{ marginBottom: 12 }}>
        Quick expense
      </Txt>
      {/* After the Spend Dat overlay, back up to the budget rings with the new spend in them. */}
      <ExpenseForm onCelebrated={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
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
                sub={`${ukDate(e.date)} · ${e.location} · ${expenseLabel(e)}`}
                onDelete={() => confirmDelete('expense', () => deleteExpense(e.id))}
                receipts={e.receipt_paths?.length ?? 0}
                onReceipts={() => openReceipts(e.receipt_paths ?? [])}
              />
            </Animated.View>
          ))}
          {thisMonthMiles.map((m, i) => (
            <Animated.View key={m.id} entering={FadeInDown.delay(Math.min(i, 8) * 40)}>
              <Row
                icon={m.type === 'work' ? 'briefcase' : 'home'}
                title={`${u.miles(Number(m.miles))} · ${m.type === 'work' ? 'Work' : 'Personal'}`}
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
        {/* Bleeds to the card edges so older months clearly scroll in from the right. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={{ marginHorizontal: -cardPad, marginBottom: 14 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: cardPad }}
        >
          {recentMonths(12, new Date(`${today}T12:00:00`)).map((m) => (
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <StatTile label="Avg per visit" icon="timer" tone="gold" value={visitTimes.overallAvgMinutes === null ? 'None' : formatDuration(visitTimes.overallAvgMinutes)} sub={`Across all visits in ${monthTitle(reportMonth)}`} />
          <StatTile
            label="Stores timed"
            icon="storefront"
            value={String(visitTimes.perStore.length)}
            sub={visitTimes.timedVisits ? `${visitTimes.timedVisits} timed visits · per-store averages in the report` : 'Start and complete visits to track time'}
          />
        </View>
        <NeonButton label="Generate Report" icon="document-text" onPress={generate} size="lg" full />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <NeonButton label="Export PDF" icon="document-attach" variant="gold" onPress={() => runExport('pdf')} loading={exporting === 'pdf'} disabled={!!exporting} style={{ flex: 1 }} accessibilityHint={`Tables and visit photos for ${monthTitle(reportMonth)}, ready to email or print`} />
          <NeonButton label="Export HTML" icon="globe-outline" variant="outline" onPress={() => runExport('html')} loading={exporting === 'html'} disabled={!!exporting} style={{ flex: 1 }} accessibilityHint="Open on a computer and copy the tables straight into a portal" />
        </View>
        {exportStatus ? (
          <Txt variant="caption" tone="dim" align="center" style={{ marginTop: 8 }} accessibilityLiveRegion="polite">
            {exportStatus}
          </Txt>
        ) : null}
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
                if (!(await copyText(report))) return;
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
      scrollRef={scrollRef}
      kicker="Finances & mileage"
      title="Finances"
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      <DataErrorBanner />
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'stretch' }}>
          <View style={{ flex: 1 }}>{odometerCard}</View>
          <View style={{ flex: 1.3 }}>{rings}</View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {odometerCard}
          {rings}
        </View>
      )}
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
      <MediaViewer
        path={receiptPath}
        url={receipt && receiptPath ? receipt.urls[receiptPath] ?? null : null}
        onClose={() => setReceipt(null)}
        footer={
          receipt && receipt.paths.length > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous receipt" hitSlop={12} onPress={() => setReceipt((r) => r && { ...r, at: (r.at - 1 + r.paths.length) % r.paths.length })}>
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </Pressable>
              <Txt variant="label" style={{ color: '#fff' }}>
                Receipt {receipt.at + 1} of {receipt.paths.length}
              </Txt>
              <Pressable accessibilityRole="button" accessibilityLabel="Next receipt" hitSlop={12} onPress={() => setReceipt((r) => r && { ...r, at: (r.at + 1) % r.paths.length })}>
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </Pressable>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function confirmDelete(what: string, run: () => Promise<void>) {
  Alert.alert(`Delete this ${what}?`, 'This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run().catch((e) => Alert.alert('Could not delete', e.message)) },
  ]);
}

function Row({ icon, title, sub, onDelete, receipts = 0, onReceipts }: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; onDelete: () => void; receipts?: number; onReceipts?: () => void }) {
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
      {receipts > 0 && onReceipts ? (
        <Pressable onPress={onReceipts} hitSlop={10} accessibilityRole="button" accessibilityLabel={`View ${receipts} receipt${receipts === 1 ? '' : 's'}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name="receipt" size={18} color={palette.gold} />
          {receipts > 1 ? (
            <Txt variant="caption" tone="gold">
              {receipts}
            </Txt>
          ) : null}
        </Pressable>
      ) : null}
      <Pressable onPress={onDelete} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete">
        <Ionicons name="trash-outline" size={18} color={palette.textFaint} />
      </Pressable>
    </View>
  );
}
