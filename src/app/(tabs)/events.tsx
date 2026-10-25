import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { EventTypeBadge } from '@/components/badges';
import { GlassCard } from '@/components/GlassCard';
import { EmptyState } from '@/components/misc';
import { IconButton, NeonButton } from '@/components/NeonButton';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { formatDay, formatTime, relativeDay } from '@/lib/format';
import type { WorkEvent } from '@/lib/types';
import { useData } from '@/providers/DataProvider';
import { useTheme } from '@/theme/ThemeProvider';

function EventCard({ e, index, past }: { e: WorkEvent; index: number; past?: boolean }) {
  const { palette } = useTheme();
  const { deleteEvent } = useData();
  const when = new Date(e.event_date);
  const special = e.event_type !== 'General';
  const accent = e.event_type === 'Sales Day' ? palette.gold : e.event_type === 'OOH' ? palette.rose : palette.platinum;

  const remove = () =>
    Alert.alert('Delete event?', `"${e.title}" and its reminders will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteEvent(e.id).catch((err) => Alert.alert('Could not delete', err.message)) },
    ]);

  return (
    <GlassCard index={index} glow={!past && special ? (e.event_type === 'Sales Day' ? 'gold' : 'primary') : false} style={past ? { opacity: 0.6 } : undefined}>
      {special && !past && <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: accent }} />}
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <View style={{ width: 58, alignItems: 'center', paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: accent }}>
          <Txt variant="label" style={{ color: accent }}>
            {formatDay(when).split(' ')[0]}
          </Txt>
          <Txt variant="metric" style={{ fontSize: 22, lineHeight: 26 }}>
            {when.getDate()}
          </Txt>
          <Txt variant="label" tone="faint">
            {formatDay(when).split(' ')[2]}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <EventTypeBadge type={e.event_type} />
          <Txt variant="strong" numberOfLines={2}>
            {e.title}
          </Txt>
          <Txt variant="caption" tone="faint">
            {relativeDay(when)} at {formatTime(when)}
          </Txt>
          {e.description ? (
            <Txt variant="caption" tone="dim" numberOfLines={2}>
              {e.description}
            </Txt>
          ) : null}
          {!past && (e.reminder_before || e.reminder_on_day) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="notifications" size={12} color={palette.primary} />
              <Txt variant="caption" tone="primary" style={{ fontSize: 12 }}>
                {[e.reminder_before && 'Day before', e.reminder_on_day && 'Morning of'].filter(Boolean).join(' + ')}
              </Txt>
            </View>
          )}
        </View>
        <IconButton icon="trash-outline" label={`Delete ${e.title}`} tone="danger" size={36} onPress={remove} />
      </View>
    </GlassCard>
  );
}

export default function Events() {
  const { events, refresh } = useData();
  const { columns } = useLayout();
  const [showPast, setShowPast] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cutoff = useNow() - 3_600_000;
  const upcoming = useMemo(() => events.filter((e) => new Date(e.event_date).getTime() >= cutoff), [events, cutoff]);
  const past = useMemo(() => events.filter((e) => new Date(e.event_date).getTime() < cutoff).reverse(), [events, cutoff]);
  const special = upcoming.filter((e) => e.event_type !== 'General').length;

  const grid = (list: WorkEvent[], isPast?: boolean) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {list.map((e, i) => (
        <View key={e.id} style={{ width: columns === 1 ? '100%' : `${100 / Math.min(columns, 2) - 1.5}%`, flexGrow: 1 }}>
          <EventCard e={e} index={Math.min(i, 10)} past={isPast} />
        </View>
      ))}
    </View>
  );

  return (
    <Screen
      inTabs
      kicker={special ? `${special} special work day${special > 1 ? 's' : ''} ahead` : 'Work events'}
      title="Events"
      right={<NeonButton size="sm" icon="add" label="Log" onPress={() => router.push('/event-new')} />}
      onRefresh={async () => {
        setRefreshing(true);
        await refresh().catch(() => {});
        setRefreshing(false);
      }}
      refreshing={refreshing}
    >
      {upcoming.length === 0 ? (
        <EmptyState icon="calendar-outline" title="Nothing scheduled" body="Log a Sales Day, an OOH shift or any work event. You get a reminder the day before and on the morning." action={<NeonButton label="Log event" icon="add" onPress={() => router.push('/event-new')} />} />
      ) : (
        grid(upcoming)
      )}
      {past.length > 0 && (
        <>
          <SectionHeader
            title={`Past (${past.length})`}
            action={
              <Pressable onPress={() => setShowPast((v) => !v)} hitSlop={8} accessibilityRole="button">
                <Txt variant="label" tone="primary">
                  {showPast ? 'Hide' : 'Show'}
                </Txt>
              </Pressable>
            }
          />
          {showPast && grid(past.slice(0, 30), true)}
        </>
      )}
    </Screen>
  );
}
