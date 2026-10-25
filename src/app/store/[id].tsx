import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { GradeBadge, ManagerBadge } from '@/components/badges';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { MediaViewer } from '@/components/MediaViewer';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen, SectionHeader } from '@/components/Screen';
import { TaskCard } from '@/components/TaskCard';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { openMaps } from '@/lib/external';
import { daysSinceLabel } from '@/lib/format';
import { legDirectionsUrl, searchUrl } from '@/lib/navigation';
import { hasCoords, toLatLng } from '@/lib/route-engine';
import { supabase } from '@/lib/supabaseClient';
import type { Task } from '@/lib/types';
import { useData } from '@/providers/DataProvider';
import { deleteMedia, signMedia } from '@/services/media';
import { useTheme } from '@/theme/ThemeProvider';

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const { expanded } = useLayout();
  const { stores, tallies, targets, logVisit, undoLastVisit, updateStoreAddress } = useData();
  const store = stores.find((s) => s.id === id);
  const now = useNow();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrNotice, setAddrNotice] = useState<string | null>(null);
  const [visitBusy, setVisitBusy] = useState(false);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase.from('tasks').select('*').eq('store_id', id).order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as Task[];
      setTasks(rows);
      setTasksError(null);
      // Photos are a bonus: if signing fails the notes still show, just without thumbnails.
      setUrls(await signMedia(rows.flatMap((t) => t.media_urls)).catch(() => ({})));
    } catch (e) {
      setTasks((prev) => prev ?? []);
      setTasksError(e instanceof Error && e.message ? e.message : 'Check your connection and try again.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks]),
  );

  const tally = store ? tallies[store.id] : undefined;
  const target = store ? targets[store.grade] : 0;
  const done = tally?.count ?? 0;
  const days = tally?.last ? Math.floor((now - new Date(tally.last).getTime()) / 86_400_000) : null;
  const sortedTasks = useMemo(() => tasks ?? [], [tasks]);

  if (!store) {
    return (
      <Screen back title="Store">
        <EmptyState icon="storefront-outline" title="Store not found" body="It may have been removed or you no longer have access." />
      </Screen>
    );
  }

  const saveAddress = async () => {
    setAddrError(null);
    setAddrNotice(null);
    const next = draft.trim();
    if (next.length < 5) return setAddrError('Enter the full address (at least 5 characters).');
    if (next === store.address) return setEditing(false);
    setSaving(true);
    try {
      const { located } = await updateStoreAddress(store.id, next);
      setEditing(false);
      setAddrNotice(located ? 'Address saved and map pin updated.' : 'Address saved. We could not place it on the map, so routing keeps the old pin. Adding a postcode helps.');
    } catch (e) {
      setAddrError(e instanceof Error ? e.message : 'Could not save the address.');
    } finally {
      setSaving(false);
    }
  };

  const onLogVisit = async () => {
    setVisitBusy(true);
    try {
      await logVisit(store.id);
    } catch (e) {
      Alert.alert('Visit not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setVisitBusy(false);
    }
  };

  const onUndo = () =>
    Alert.alert('Undo last visit?', 'This removes your most recent visit to this store.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo', style: 'destructive', onPress: () => undoLastVisit(store.id).catch((e) => Alert.alert('Could not undo', e.message)) },
    ]);

  const onDeleteTask = (task: Task) =>
    Alert.alert('Delete this task?', 'The note and its attachments are removed permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('tasks').delete().eq('id', task.id);
            if (error) throw error;
          } catch (e) {
            return Alert.alert('Could not delete', e instanceof Error && e.message ? e.message : 'Please try again.');
          }
          await deleteMedia(task.media_urls).catch(() => {});
          setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
        },
      },
    ]);

  const info = (
    <GlassCard glow="primary" index={0}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing value={target ? done / target : 1} size={104} stroke={10} accessibilityLabel={`${done} of ${target} visits this month`}>
          <Txt variant="metric" glow style={{ fontSize: 24 }}>
            {done}/{target}
          </Txt>
          <Txt variant="label" tone="faint" style={{ fontSize: 8 }}>
            Visits
          </Txt>
        </ProgressRing>
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <GradeBadge grade={store.grade} />
            <ManagerBadge manager={store.assigned_manager} />
          </View>
          <Txt variant="caption" tone="dim">
            {daysSinceLabel(days)}
          </Txt>
          {store.vibe ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={14} color={palette.gold} />
              <Txt variant="caption" tone="gold">
                Vibe: {store.vibe}
              </Txt>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <NeonButton label="Log visit" icon="checkmark-circle" onPress={onLogVisit} loading={visitBusy} style={{ flexGrow: 1 }} />
        {done > 0 && <NeonButton label="Undo" icon="arrow-undo" variant="ghost" onPress={onUndo} />}
      </View>
    </GlassCard>
  );

  const address = (
    <Animated.View layout={LinearTransition.springify().damping(18)}>
      <GlassCard index={1}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Txt variant="label" tone="dim">
            Address
          </Txt>
          {!editing && (
            <NeonButton
              size="sm"
              variant="ghost"
              icon="create-outline"
              label="Edit Address"
              onPress={() => {
                setDraft(store.address);
                setAddrError(null);
                setAddrNotice(null);
                setEditing(true);
              }}
            />
          )}
        </View>
        {editing ? (
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}>
            <Field label="New address" icon="location-outline" value={draft} onChangeText={setDraft} multiline autoFocus placeholder="Unit, street, town and postcode" error={addrError} hint="Include the postcode so the route engine can pin it precisely." />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <NeonButton label="Save" icon="checkmark" onPress={saveAddress} loading={saving} style={{ flexGrow: 1 }} />
              <NeonButton label="Cancel" variant="ghost" onPress={() => setEditing(false)} disabled={saving} />
            </View>
          </Animated.View>
        ) : (
          <>
            <Txt variant="heading" selectable>
              {store.address}
            </Txt>
            {addrNotice ? (
              <Txt variant="caption" tone="success" style={{ marginTop: 6 }}>
                {addrNotice}
              </Txt>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <NeonButton
                size="sm"
                variant="subtle"
                icon="navigate"
                label="Navigate"
                onPress={() => {
                  if (hasCoords(store)) return openMaps(legDirectionsUrl(toLatLng(store)));
                  if (!store.address?.trim()) return Alert.alert('No address yet', 'Tap Edit Address to add one, then you can navigate here.');
                  openMaps(searchUrl(`${store.name}, ${store.address}`));
                }}
              />
              <NeonButton
                size="sm"
                variant="subtle"
                icon="map"
                label="View on map"
                onPress={() => {
                  if (!store.address?.trim() && !hasCoords(store)) return Alert.alert('No address yet', 'Tap Edit Address to add one first.');
                  openMaps(searchUrl(`${store.name}, ${store.address ?? ''}`.trim()));
                }}
              />
            </View>
          </>
        )}
      </GlassCard>
    </Animated.View>
  );

  const tasksBlock = (
    <View>
      <SectionHeader title="Tasks & Notes" />
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <NeonButton label="New task" icon="add-circle" onPress={() => router.push({ pathname: '/task-new', params: { storeId: store.id } })} style={{ flexGrow: 1 }} />
        <NeonButton label="Draft a Message" icon="sparkles" variant="gold" onPress={() => router.push({ pathname: '/ai-writer', params: { storeId: store.id } })} style={{ flexGrow: 1 }} />
      </View>
      {tasksError ? (
        <GlassCard animateIn={false} style={{ marginBottom: 10 }}>
          <Txt variant="caption" tone="danger" style={{ marginBottom: 8 }}>
            Could not load tasks. {tasksError}
          </Txt>
          <NeonButton size="sm" variant="subtle" icon="refresh" label="Retry" onPress={loadTasks} />
        </GlassCard>
      ) : null}
      {tasks === null ? (
        <LoadingBlock label="Loading tasks" />
      ) : sortedTasks.length === 0 ? (
        <EmptyState icon="clipboard-outline" title="No tasks yet" body="Log stock counts, photos of displays or follow-ups. Everything is saved to your account." />
      ) : (
        <View style={{ gap: 10 }}>
          {sortedTasks.map((t, i) => (
            <TaskCard key={t.id} task={t} urls={urls} index={i} onOpenMedia={setViewing} onDelete={() => onDeleteTask(t)} />
          ))}
        </View>
      )}
    </View>
  );

  return (
    <Screen back kicker="Store" title={store.name}>
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: 12 }}>
            {info}
            {address}
          </View>
          <View style={{ flex: 1.1 }}>{tasksBlock}</View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          {info}
          {address}
          {tasksBlock}
        </View>
      )}
      <MediaViewer path={viewing} url={viewing ? urls[viewing] ?? null : null} onClose={() => setViewing(null)} />
    </Screen>
  );
}
