import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventTypeBadge } from '@/components/badges';
import { BRLogo } from '@/components/BRLogo';
import { BudgetRings } from '@/components/BudgetRings';
import { GlassCard } from '@/components/GlassCard';
import { DataErrorBanner, EmptyState } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { Odometer } from '@/components/Odometer';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { budgetsFor, monthKey, summariseBudget, summariseMileage } from '@/lib/budget';
import { firstName, formatDateTime, relativeDay } from '@/lib/format';
import { odometerValue } from '@/lib/odometer';
import { computeDue, monthProgress } from '@/lib/route-engine';
import { vehicleFor } from '@/lib/vehicles';
import { isWorkingDay, workingDaysLeft } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { COCKPIT_INK, greetingFor } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

function ActionTile({ icon, label, sub, onPress, index, tone = 'primary' }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; index: number; tone?: 'primary' | 'gold' }) {
  const { palette } = useTheme();
  return (
    <GlassCard index={index} onPress={onPress} accessibilityLabel={label} style={{ minHeight: 124 }} glow={tone === 'gold' ? 'gold' : false} fill>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong, marginBottom: 12 }}>
        <Ionicons name={icon} size={18} color={palette.gold} />
      </View>
      <Txt variant="strong" numberOfLines={2}>
        {label}
      </Txt>
      {sub ? (
        <Txt variant="caption" tone="faint" numberOfLines={3} style={{ marginTop: 2 }}>
          {sub}
        </Txt>
      ) : null}
    </GlassCard>
  );
}

/**
 * Wrapping tile grid: two per row on phones, more on wide screens, one per row
 * when the screen is too narrow for two to fit without clipping.
 */
function TileGrid({ children }: { children: ReactNode[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {children.filter(Boolean).map((child, i) => (
        <View key={i} style={{ flexGrow: 1, flexBasis: 128, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

export default function Hub() {
  const { palette, phase } = useTheme();
  const { profile, isAdmin } = useAuth();
  const { myStores, tallies, targets, events, expenses, mileage, refresh } = useData();
  const { compact, expanded } = useLayout();
  const [refreshing, setRefreshing] = useState(false);

  const nowMs = useNow();
  const now = new Date(nowMs);
  const month = monthKey(new Date(nowMs));
  const progress = useMemo(() => monthProgress(myStores, tallies, targets), [myStores, tallies, targets]);
  const due = useMemo(() => computeDue(myStores, tallies, targets), [myStores, tallies, targets]);
  const budgets = useMemo(() => budgetsFor(profile), [profile]);
  const budget = useMemo(() => summariseBudget(expenses, month, budgets), [expenses, month, budgets]);
  const miles = useMemo(() => summariseMileage(mileage, month), [mileage, month]);
  const upcoming = useMemo(() => events.filter((e) => new Date(e.event_date).getTime() >= nowMs - 3_600_000).slice(0, 3), [events, nowMs]);
  const vehicle = vehicleFor(profile?.vehicle_model);
  const workDays = profile?.working_days ?? [];
  const workingToday = isWorkingDay(now, workDays);
  const daysLeft = workingDaysLeft(now, workDays);
  const owed = due.reduce((a, d) => a + d.remaining, 0);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 12 : 16, marginBottom: compact ? 16 : 22 }}>
      <BRLogo size={compact ? 40 : expanded ? 60 : 50} animated={phase === 'cockpit'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" tone="primary" numberOfLines={1}>
          {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Txt>
        <Txt variant={compact ? 'title' : 'display'} numberOfLines={2}>
          {greetingFor(phase, now.getHours())}, {firstName(profile?.name, profile?.email)}
        </Txt>
      </View>
    </View>
  );

  // 1. Car and mileage
  const carCard = (
    <GlassCard glow="gold" padded={false} index={0} onPress={() => router.navigate('/finances')} accessibilityLabel="Vehicle and mileage">
      {vehicle && (
        <View style={{ aspectRatio: compact ? 2.1 : 2.3 }}>
          <Image source={vehicle.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', palette.surfaceStrong]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
          <View style={{ position: 'absolute', top: 14, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <View style={{ flexShrink: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong }}>
              <Txt variant="label" numberOfLines={1} style={{ color: COCKPIT_INK.gold, fontSize: 9.5 }}>
                {vehicle.plate}
              </Txt>
            </View>
            <View style={{ flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: workingToday ? palette.success : palette.textFaint }} />
              <Txt variant="label" numberOfLines={1} style={{ color: COCKPIT_INK.text, fontSize: 9.5 }}>
                {workingToday ? 'Working day' : 'Day off'}
              </Txt>
            </View>
          </View>
          <View style={{ position: 'absolute', left: 18, right: 18, bottom: 6 }}>
            <Txt variant="label" tone="dim" numberOfLines={1} style={{ fontSize: 9.5 }}>
              {vehicle.year} BMW X1 · {vehicle.specs[0].value}
            </Txt>
            <Txt variant="title" numberOfLines={1}>
              M Sport Hybrid
            </Txt>
          </View>
        </View>
      )}
      <View style={{ padding: compact ? 16 : 20, paddingTop: vehicle ? 10 : undefined, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Odometer value={odometerValue(profile?.current_mileage)} size={compact ? 'sm' : 'md'} maxWidth={expanded ? 420 : undefined} />
          <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 12 }}>
          <Metric label="Work" value={`${miles.work.toFixed(0)} mi`} />
          <Metric label="Personal" value={`${miles.personal.toFixed(0)} mi`} divider />
          <Metric label="Days left" value={String(daysLeft)} divider />
        </View>
      </View>
    </GlassCard>
  );

  // 2. Budgets
  const budgetCard = (
    <GlassCard index={1} onPress={() => router.navigate('/finances')} accessibilityLabel="Budgets">
      <Txt variant="label" tone="dim" numberOfLines={1} style={{ marginBottom: 14 }}>
        Budgets this month
      </Txt>
      <BudgetRings budget={budget} />
    </GlassCard>
  );

  // 3. Upcoming events
  const eventsBlock = (
    <View>
      <SectionHeader
        title="Upcoming events"
        action={
          <Pressable onPress={() => router.navigate('/events')} hitSlop={8} accessibilityRole="link">
            <Txt variant="label" tone="primary" numberOfLines={1}>
              See all
            </Txt>
          </Pressable>
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Nothing scheduled" body="Log a Sales Day, OOH shift or meeting and reminders arrive automatically." action={<NeonButton size="sm" label="Log event" icon="add" onPress={() => router.push('/event-new')} />} />
      ) : (
        <View style={{ gap: 10 }}>
          {upcoming.map((e, i) => {
            const when = new Date(e.event_date);
            return (
              <GlassCard key={e.id} index={i + 2} glow={e.event_type === 'Sales Day' ? 'gold' : false} onPress={() => router.navigate('/events')} accessibilityLabel={e.title}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={{ alignItems: 'center', width: 56, flexShrink: 0, paddingRight: 12, borderRightWidth: StyleSheet.hairlineWidth * 2, borderRightColor: palette.border }}>
                    <Txt variant="label" tone="primary" align="center" numberOfLines={2}>
                      {relativeDay(when)}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Txt variant="strong" numberOfLines={1}>
                      {e.title}
                    </Txt>
                    <Txt variant="caption" tone="faint">
                      {formatDateTime(when)}
                    </Txt>
                  </View>
                  {e.event_type !== 'General' && (
                    <View style={{ flexShrink: 0 }}>
                      <EventTypeBadge type={e.event_type} />
                    </View>
                  )}
                </View>
              </GlassCard>
            );
          })}
        </View>
      )}
    </View>
  );

  // 4. Quick actions
  const actions = (
    <View>
      <SectionHeader title="Quick actions" />
      <TileGrid>
        {[
          <ActionTile key="route" index={5} icon="navigate" label="Today's route" sub={owed ? `${progress.done} of ${progress.target} visits · ${owed} owed` : 'Every store on target'} onPress={() => router.navigate('/route')} />,
          <ActionTile key="miles" index={6} icon="speedometer" label="Log a trip" sub="Work or personal" onPress={() => router.navigate('/finances')} />,
          <ActionTile key="event" index={7} icon="calendar" label="Log event" sub="Sales Day, OOH, meetings" onPress={() => router.push('/event-new')} />,
          <ActionTile key="ai" index={8} icon="sparkles" label="Draft a message" sub="Notes and emails" onPress={() => router.push('/ai-writer')} />,
          isAdmin ? <ActionTile key="admin" index={9} icon="shield-checkmark" tone="gold" label="Store management" sub="Assign and move stores" onPress={() => router.push('/admin/stores')} /> : null,
          <ActionTile key="stores" index={10} icon="storefront" label="My stores" sub={`${myStores.length} on your patch`} onPress={() => router.push('/my-stores')} />,
        ].filter(Boolean) as ReactNode[]}
      </TileGrid>
    </View>
  );

  return (
    <Screen inTabs onRefresh={onRefresh} refreshing={refreshing}>
      {header}
      <DataErrorBanner />
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.1, gap: 14 }}>
            {carCard}
            {budgetCard}
          </View>
          <View style={{ flex: 1 }}>
            {eventsBlock}
            {actions}
          </View>
        </View>
      ) : (
        <View style={{ gap: 14 }}>
          {carCard}
          {budgetCard}
          {eventsBlock}
          {actions}
        </View>
      )}
    </Screen>
  );
}

function Metric({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4, borderLeftWidth: divider ? StyleSheet.hairlineWidth * 2 : 0, borderLeftColor: palette.border }}>
      <Txt variant="label" tone="faint" numberOfLines={2} align="center" style={{ fontSize: 9, letterSpacing: 1.2 }}>
        {label}
      </Txt>
      <Txt variant="strong" numberOfLines={1} align="center" style={{ marginTop: 2, fontSize: value.length > 7 ? 13 : 15.5 }}>
        {value}
      </Txt>
    </View>
  );
}
