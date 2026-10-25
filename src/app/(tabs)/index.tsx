import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { EventTypeBadge } from '@/components/badges';
import { BRLogo } from '@/components/BRLogo';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState, StatTile } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { formatPence, monthKey, summariseBudget } from '@/lib/budget';
import { managerShort } from '@/lib/frequency';
import { firstName, formatDateTime, relativeDay } from '@/lib/format';
import { computeDue, monthProgress } from '@/lib/route-engine';
import { vehicleFor } from '@/lib/vehicles';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { greetingFor } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

export default function Hub() {
  const { palette, phase } = useTheme();
  const { profile, isAdmin } = useAuth();
  const { myStores, tallies, targets, events, expenses, managers, refresh, error } = useData();
  const { compact, expanded } = useLayout();
  const [refreshing, setRefreshing] = useState(false);

  const nowMs = useNow();
  const now = new Date(nowMs);
  const progress = useMemo(() => monthProgress(myStores, tallies, targets), [myStores, tallies, targets]);
  const due = useMemo(() => computeDue(myStores, tallies, targets), [myStores, tallies, targets]);
  const budget = useMemo(() => summariseBudget(expenses, monthKey(new Date())), [expenses]);
  const upcoming = useMemo(() => events.filter((e) => new Date(e.event_date).getTime() >= nowMs - 3_600_000).slice(0, 3), [events, nowMs]);
  const vehicle = vehicleFor(profile?.vehicle_model);
  const ratio = progress.target ? progress.done / progress.target : 0;

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh().catch(() => {});
    setRefreshing(false);
  };

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 10 : 14, marginBottom: compact ? 12 : 18 }}>
      <BRLogo size={compact ? 38 : expanded ? 58 : 48} animated={phase === 'cockpit'} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="label" tone="primary" numberOfLines={1}>
          {palette.name} mode · {palette.tagline}
        </Txt>
        <Txt variant={compact ? 'title' : 'display'} glow numberOfLines={1} adjustsFontSizeToFit>
          {greetingFor(phase, now.getHours())}, {firstName(profile?.name, profile?.email)}
        </Txt>
      </View>
    </View>
  );

  const cockpit = (
    <GlassCard glow="primary" padded={false} index={0}>
      <View style={{ flexDirection: compact ? 'column' : 'row' }}>
        {vehicle && (
          <View style={{ width: compact ? '100%' : '42%', aspectRatio: compact ? 2.2 : undefined, minHeight: compact ? undefined : 150 }}>
            <Image source={vehicle.image} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient
              colors={compact ? ['transparent', palette.surfaceStrong] : ['transparent', palette.surfaceStrong]}
              start={compact ? { x: 0.5, y: 0.3 } : { x: 0.35, y: 0.5 }}
              end={compact ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={{ position: 'absolute', top: 10, left: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Txt variant="label" style={{ color: '#fff' }}>
                {vehicle.plate}
              </Txt>
            </View>
          </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, padding: compact ? 12 : 16 }}>
          <ProgressRing value={ratio} size={compact ? 92 : 112} stroke={compact ? 9 : 11} accessibilityLabel={`${progress.done} of ${progress.target} visits this month`}>
            <Txt variant="metric" glow style={{ fontSize: compact ? 20 : 24, lineHeight: compact ? 24 : 28 }}>
              {Math.round(ratio * 100)}%
            </Txt>
            <Txt variant="label" tone="faint" style={{ fontSize: 8 }}>
              Month
            </Txt>
          </ProgressRing>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Txt variant="label" tone="dim">
              Visits this month
            </Txt>
            <Txt variant="display" glow>
              {progress.done}
              <Txt variant="title" tone="faint">
                {' '}
                / {progress.target}
              </Txt>
            </Txt>
            <Txt variant="caption" tone="faint" numberOfLines={2}>
              Covering {managers.map(managerShort).join(' + ')} · {myStores.length} stores
            </Txt>
          </View>
        </View>
      </View>
    </GlassCard>
  );

  const kpis = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
      <StatTile index={1} icon="flag" label="Stores due" value={String(due.length)} sub={due[0] ? `Next up: ${due[0].store.name}` : 'All targets met'} onPress={() => router.navigate('/route')} />
      <StatTile
        index={2}
        icon="wallet"
        tone={budget.standard.over ? 'danger' : 'gold'}
        label="Budget left"
        value={formatPence(budget.standard.remaining)}
        sub={`Sales Day / OOH: ${formatPence(budget.special.remaining)}`}
        onPress={() => router.navigate('/finances')}
      />
    </View>
  );

  const routeCard = (
    <GlassCard index={3} onPress={() => router.navigate('/route')} accessibilityLabel="Open today's route">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.glow }}>
          <Ionicons name="navigate" size={22} color={palette.text} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title">Plan today&apos;s route</Txt>
          <Txt variant="caption" tone="dim" numberOfLines={2}>
            {due.length ? `${due.reduce((a, d) => a + d.remaining, 0)} visits still owed. Motorway-first options ready.` : 'Every store is on target this month.'}
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textFaint} />
      </View>
    </GlassCard>
  );

  const eventsBlock = (
    <View>
      <SectionHeader
        title="Upcoming events"
        action={
          <Pressable onPress={() => router.navigate('/events')} hitSlop={8} accessibilityRole="link">
            <Txt variant="label" tone="primary">
              See all
            </Txt>
          </Pressable>
        }
      />
      {upcoming.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No events yet" body="Log a Sales Day, OOH shift or meeting and get reminders automatically." action={<NeonButton size="sm" label="Log event" icon="add" onPress={() => router.push('/event-new')} />} />
      ) : (
        <View style={{ gap: 10 }}>
          {upcoming.map((e, i) => {
            const when = new Date(e.event_date);
            return (
              <GlassCard key={e.id} index={i + 4} glow={e.event_type === 'Sales Day' ? 'gold' : e.event_type === 'OOH' ? 'primary' : false}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ alignItems: 'center', width: 54 }}>
                    <Txt variant="label" tone="primary">
                      {relativeDay(when)}
                    </Txt>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Txt variant="strong" numberOfLines={1}>
                      {e.title}
                    </Txt>
                    <Txt variant="caption" tone="faint">
                      {formatDateTime(when)}
                    </Txt>
                  </View>
                  {e.event_type !== 'General' && <EventTypeBadge type={e.event_type} />}
                </View>
              </GlassCard>
            );
          })}
        </View>
      )}
    </View>
  );

  const actions = (
    <View>
      <SectionHeader title="Quick actions" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <NeonButton size="sm" variant="subtle" icon="calendar" label="Log event" onPress={() => router.push('/event-new')} />
        <NeonButton size="sm" variant="subtle" icon="sparkles" label="Draft a message" onPress={() => router.push('/ai-writer')} />
        <NeonButton size="sm" variant="subtle" icon="speedometer" label="Log miles" onPress={() => router.navigate('/finances')} />
        <NeonButton size="sm" variant="subtle" icon="options" label="Route settings" onPress={() => router.push('/route-settings')} />
        {isAdmin && <NeonButton size="sm" variant="gold" icon="shield-checkmark" label="Store management" onPress={() => router.push('/admin/stores')} />}
      </View>
    </View>
  );

  return (
    <Screen inTabs onRefresh={onRefresh} refreshing={refreshing}>
      {header}
      {error ? (
        <GlassCard style={{ marginBottom: 12, borderColor: palette.danger }}>
          <Txt variant="caption" tone="danger">
            Some data could not load: {error}. Pull down to retry.
          </Txt>
        </GlassCard>
      ) : null}
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1.2, gap: 12 }}>
            {cockpit}
            {kpis}
            {routeCard}
          </View>
          <View style={{ flex: 1 }}>
            {eventsBlock}
            {actions}
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {cockpit}
          {kpis}
          {routeCard}
          {eventsBlock}
          {actions}
        </View>
      )}
    </Screen>
  );
}
