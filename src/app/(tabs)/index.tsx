import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventTypeBadge } from '@/components/badges';
import { BRLogo } from '@/components/BRLogo';
import { BudgetRings } from '@/components/BudgetRings';
import { CoverageCard } from '@/components/CoverageCard';
import { DailyIQCard } from '@/components/DailyIQCard';
import { GlassCard } from '@/components/GlassCard';
import { DataErrorBanner, EmptyState } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { MotivationCard } from '@/components/MotivationCard';
import { NumberPlate } from '@/components/NumberPlate';
import { Odometer } from '@/components/Odometer';
import { Screen, SectionHeader } from '@/components/Screen';
import { TodayCard } from '@/components/TodayCard';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useUnits } from '@/hooks/useUnits';
import { useNow } from '@/hooks/useNow';
import { patchCoverage } from '@/lib/coverage';
import { budgetsFor, monthKey, summariseBudget, summariseMileage } from '@/lib/budget';
import { firstName, formatDateTime, relativeDay } from '@/lib/format';
import { odometerValue } from '@/lib/odometer';
import { computeDue, monthProgress, type DueStore } from '@/lib/route-engine';
import { displayPlate, prefsFor } from '@/lib/preferences';
import type { Store } from '@/lib/types';
import { heroVehicle } from '@/lib/vehicles';
import { isWorkingDate, workingDatesLeft } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { COCKPIT_INK, greetingFor } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';

function ActionTile({ icon, label, sub, onPress, index, tone = 'primary' }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; index: number; tone?: 'primary' | 'gold' }) {
  const { palette } = useTheme();
  return (
    <GlassCard index={index} onPress={onPress} accessibilityLabel={label} style={{ minHeight: 128, padding: 16 }} glow={tone === 'gold' ? 'gold' : false} fill>
      <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: palette.borderStrong, marginBottom: 12 }}>
        <Ionicons name={icon} size={18} color={palette.gold} />
      </View>
      {/* Whole words only: tiles are wide enough for the longest word at the capped font scale. */}
      <Txt variant="strong" numberOfLines={2} maxFontSizeMultiplier={1.15} textBreakStrategy="simple" android_hyphenationFrequency="none" style={{ flexShrink: 1, fontSize: 15, lineHeight: 20 }}>
        {label}
      </Txt>
      {sub ? (
        <Txt variant="caption" tone="faint" numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ flexShrink: 1, marginTop: 4, fontSize: 12.5, lineHeight: 17 }}>
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
        <View key={i} style={{ flexGrow: 1, flexBasis: 150, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Two cards side by side on the Fold's inner screen, stacked on phones. Side
 * by side they stretch to the taller one (cards pass `fill`), so a short card
 * never leaves a block of empty background under it.
 */
function Pair({ wide, children }: { wide: boolean; children: [ReactNode, ReactNode] }) {
  const [a, b] = children;
  if (!wide || !a || !b) {
    return (
      <>
        {a}
        {b}
      </>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 14 }}>
      <View style={{ flex: 1, minWidth: 0 }}>{a}</View>
      <View style={{ flex: 1, minWidth: 0 }}>{b}</View>
    </View>
  );
}

/**
 * Home, most urgent first for a field worker:
 * 1. Today: the visit running now (countdown, End Visit) or the next store (Start Visit, today's route).
 * 2. The patch: coverage, the stores after that, Daily Samsung IQ.
 * 3. Money and the rest: car and mileage, budgets, events, motivation, tools.
 */
export default function Hub() {
  const { phase } = useTheme();
  const { profile, isAdmin } = useAuth();
  const { myStores, patchStores, tallies, targets, weekLocked, activeVisit, startVisit, completeVisit, refresh } = useData();
  const { compact, expanded } = useLayout();
  const [refreshing, setRefreshing] = useState(false);

  const nowMs = useNow();
  const now = new Date(nowMs);
  const progress = useMemo(() => monthProgress(myStores, tallies, targets), [myStores, tallies, targets]);
  // Stores an OM is locked out of this week would only refuse Start Visit, so they are left off.
  const due = useMemo(() => computeDue(myStores.filter((s) => !weekLocked.has(s.id)), tallies, targets), [myStores, weekLocked, tallies, targets]);
  // Coverage counts the whole patch they are meant to cover, not just the stores they picked to route.
  const coverage = useMemo(() => patchCoverage(patchStores, tallies, targets), [patchStores, tallies, targets]);
  const shiftDates = profile?.shift_dates ?? null;
  const workingToday = isWorkingDate(now, shiftDates, profile?.working_days);
  const owed = due.reduce((a, d) => a + d.remaining, 0);
  const visitStore = activeVisit ? (patchStores.find((s) => s.id === activeVisit.storeId) ?? null) : null;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 12 : 16, marginBottom: compact ? 14 : 20 }}>
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

  return (
    <Screen inTabs onRefresh={onRefresh} refreshing={refreshing}>
      {header}
      <DataErrorBanner />

      {/* 1. Today */}
      <TodayCard
        activeVisit={activeVisit}
        visitStore={visitStore}
        next={due[0] ?? null}
        workingToday={workingToday}
        progressLine={`${progress.done} of ${progress.target} visits · ${owed} owed`}
        startVisit={startVisit}
        completeVisit={completeVisit}
      />

      {/* 2. The patch */}
      <SectionHeader title="Your patch" />
      <View style={{ gap: 14 }}>
        <Pair wide={expanded}>
          <CoverageCard coverage={coverage} index={1} onPress={() => router.navigate('/stores')} fill={expanded} />
          <NextStores due={due.slice(activeVisit ? 0 : 1, activeVisit ? 4 : 5)} fill={expanded} />
        </Pair>
        {profile?.show_training ? <DailyIQCard now={nowMs} index={2} /> : null}
      </View>

      {/* 3. Money, events and tools */}
      <SectionHeader title="Mileage & budgets" />
      <Pair wide={expanded}>
        <CarCard fill={expanded} />
        <BudgetCard fill={expanded} />
      </Pair>
      <EventsBlock now={nowMs} />
      <SectionHeader title="Daily motivation" />
      <MotivationCard now={nowMs} index={3} />
      <SectionHeader title="Quick actions" />
      <TileGrid>
        {
          [
            <ActionTile key="miles" index={5} icon="speedometer" label="Log a trip" sub="Work or personal" onPress={() => router.navigate('/finances')} />,
            <ActionTile key="event" index={6} icon="calendar" label="Log event" sub="Sales Day, OOH, meetings" onPress={() => router.push('/event-new')} />,
            <ActionTile key="ai" index={7} icon="sparkles" label="Draft a message" sub="Notes and emails" onPress={() => router.push('/ai-writer')} />,
            <ActionTile key="stores" index={8} icon="storefront" label="My stores" sub={`${myStores.length} on your patch`} onPress={() => router.push('/my-stores')} />,
            isAdmin ? <ActionTile key="admin" index={9} icon="shield-checkmark" tone="gold" label="Store management" sub="Assign and move stores" onPress={() => router.push('/admin/stores')} /> : null,
          ].filter(Boolean) as ReactNode[]
        }
      </TileGrid>
    </Screen>
  );
}

/** The stores after the one on the Today card, most pressing first. */
function NextStores({ due, fill }: { due: DueStore<Store>[]; fill?: boolean }) {
  const { palette } = useTheme();
  return (
    <GlassCard index={1} fill={fill} accessibilityLabel="Stores to visit next">
      <Txt variant="label" tone="dim" numberOfLines={1} style={{ marginBottom: 6 }}>
        Up next
      </Txt>
      {due.length === 0 ? (
        <Txt variant="caption" tone="faint">
          No other store is owed a visit this month.
        </Txt>
      ) : (
        due.map((d, i) => (
          <Pressable
            key={d.store.id}
            accessibilityRole="link"
            onPress={() => router.push(`/store/${d.store.id}`)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: palette.border,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="strong" numberOfLines={1}>
                {d.store.name}
              </Txt>
              <Txt variant="caption" tone="faint" numberOfLines={1}>
                Grade {d.store.grade} · {d.remaining} {d.remaining === 1 ? 'visit' : 'visits'} to go
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.textFaint} style={{ flexShrink: 0 }} />
          </Pressable>
        ))
      )}
    </GlassCard>
  );
}

/** Car photo with the plate, odometer and this month's mileage. */
function CarCard({ fill }: { fill?: boolean }) {
  const { palette } = useTheme();
  const { profile, isAdmin } = useAuth();
  const { mileage } = useData();
  const { compact, expanded, contentWidth } = useLayout();
  const units = useUnits();
  const nowMs = useNow();
  const now = new Date(nowMs);
  const month = monthKey(new Date(nowMs));
  const miles = useMemo(() => summariseMileage(mileage, month), [mileage, month]);
  const vehicle = heroVehicle(profile?.vehicle_model, isAdmin);
  const carPrefs = prefsFor(profile);
  const daysLeft = workingDatesLeft(now, profile?.shift_dates ?? null, profile?.working_days);
  const cardWidth = expanded ? (contentWidth - 14) / 2 : contentWidth;

  return (
    <GlassCard glow="gold" padded={false} index={4} fill={fill} onPress={() => router.navigate('/finances')} accessibilityLabel="Vehicle and mileage">
      <View style={{ aspectRatio: compact ? 2.1 : 2.3 }}>
        <Image source={vehicle.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
        <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0)', palette.surfaceStrong]} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
        <View style={{ position: 'absolute', top: 14, left: 16 }}>
          {/* Sized from the card's width, so it is never squeezed by anything beside it. */}
          <NumberPlate text={displayPlate(profile)} height={compact ? 26 : 32} maxWidth={cardWidth * 0.55} sheen />
        </View>
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 6 }}>
          <Txt variant="title" numberOfLines={1} style={{ color: COCKPIT_INK.text }}>
            {carPrefs.car_make_model ?? 'BMW X1 M Sport Hybrid'}
          </Txt>
        </View>
      </View>
      <View style={{ flex: fill ? 1 : undefined, justifyContent: 'space-between', padding: compact ? 16 : 20, paddingTop: 10, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Odometer value={odometerValue(profile?.current_mileage)} size={compact ? 'sm' : 'md'} maxWidth={expanded ? 360 : undefined} />
          <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, paddingTop: 12 }}>
          <Metric label="Work" value={units.miles(miles.work, 0)} />
          <Metric label="Personal" value={units.miles(miles.personal, 0)} divider />
          <Metric label="Days left" value={String(daysLeft)} divider />
        </View>
      </View>
    </GlassCard>
  );
}

function BudgetCard({ fill }: { fill?: boolean }) {
  const { profile } = useAuth();
  const { expenses } = useData();
  const nowMs = useNow();
  const month = monthKey(new Date(nowMs));
  const budgets = useMemo(() => budgetsFor(profile), [profile]);
  const budget = useMemo(() => summariseBudget(expenses, month, budgets), [expenses, month, budgets]);
  return (
    <GlassCard index={4} fill={fill} onPress={() => router.navigate('/finances')} accessibilityLabel="Budgets">
      <Txt variant="label" tone="dim" numberOfLines={1} style={{ marginBottom: 14 }}>
        Budgets this month
      </Txt>
      <BudgetRings budget={budget} />
    </GlassCard>
  );
}

function EventsBlock({ now }: { now: number }) {
  const { palette } = useTheme();
  const { events } = useData();
  const upcoming = useMemo(() => events.filter((e) => new Date(e.event_date).getTime() >= now - 3_600_000).slice(0, 3), [events, now]);
  return (
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
