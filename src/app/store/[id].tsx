import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { GradeBadge, ManagerBadge } from '@/components/badges';
import { Field } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { MediaViewer } from '@/components/MediaViewer';
import { EmptyState, LoadingBlock } from '@/components/misc';
import { NeonButton } from '@/components/NeonButton';
import { ProgressRing } from '@/components/ProgressRing';
import { Screen, SectionHeader } from '@/components/Screen';
import { PastVisitSheet } from '@/components/PastVisitSheet';
import { StoreSettingsSheet } from '@/components/StoreSettingsSheet';
import { TaskCard } from '@/components/TaskCard';
import { Txt } from '@/components/Txt';
import { VisitLimitModal } from '@/components/VisitLimitModal';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { localDateString } from '@/lib/budget';
import { daysSinceLabel } from '@/lib/format';
import { remainingMessage, storeTarget } from '@/lib/frequency';
import { geocode } from '@/lib/geo';
import { encodeNavRequest } from '@/lib/nav-request';
import { hasCoords, toLatLng } from '@/lib/route-engine';
import { isVisitLimitError } from '@/lib/visit-limits';
import { MIN_VISIT_MINUTES, VISIT_ALARM_MINUTES, formatCountdown, formatDuration, lockRemainingMs } from '@/lib/visit-timer';
import { supabase } from '@/lib/supabaseClient';
import type { Task } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { navigateWithWaze } from '@/services/drive';
import { captureWithCamera, deleteMedia, pickFromLibrary, signMedia } from '@/services/media';
import { uploadVisitPhotos } from '@/services/visit-photos';
import { useTheme } from '@/theme/ThemeProvider';

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { palette } = useTheme();
  const { expanded } = useLayout();
  const { stores, tallies, targets, visitsLeftThisWeek, activeVisit, startVisit, completeVisit, cancelVisit, undoLastVisit, logPastVisits, updateStoreAddress, updateStoreSettings } = useData();
  const store = stores.find((s) => s.id === id);
  const visitHere = !!activeVisit && activeVisit.storeId === id;
  const visitElsewhere = activeVisit && !visitHere ? stores.find((s) => s.id === activeVisit.storeId) ?? null : null;
  // Ticks every second while a visit runs here, for the live countdown.
  const now = useNow(visitHere ? 1000 : 60_000);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [addrError, setAddrError] = useState<string | null>(null);
  const [addrNotice, setAddrNotice] = useState<string | null>(null);
  const [visitBusy, setVisitBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [cheer, setCheer] = useState<{ text: string; done: boolean } | null>(null);
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [photoBusy, setPhotoBusy] = useState(false);
  // Photos saved during the visit running now (they link to it when it is completed).
  const [visitPhotos, setVisitPhotos] = useState(0);
  const visitKey = visitHere ? activeVisit.startedAt : null;
  const [photosFor, setPhotosFor] = useState(visitKey);
  if (photosFor !== visitKey) {
    setPhotosFor(visitKey);
    setVisitPhotos(0);
  }

  // The encouragement after a visit fades after a few seconds.
  useEffect(() => {
    if (!cheer) return;
    const t = setTimeout(() => setCheer(null), 4500);
    return () => clearTimeout(t);
  }, [cheer]);

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
  }, [id, setTasks, setTasksError, setUrls]);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks]),
  );

  const tally = store ? tallies[store.id] : undefined;
  const target = store ? storeTarget(store, targets) : 0;
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

  // Stores without a map pin are looked up by address first.
  const locate = async () => {
    if (hasCoords(store)) return toLatLng(store);
    if (!store.address?.trim()) {
      Alert.alert('No address yet', 'Tap Edit Address to add one, then you can navigate here.');
      return null;
    }
    setLocating(true);
    let point = await geocode(`${store.name}, ${store.address}`).catch(() => null);
    if (!point) point = await geocode(store.address).catch(() => null);
    setLocating(false);
    if (!point) Alert.alert('Address not found', 'We could not place this address on the map. Adding a postcode usually fixes it.');
    return point;
  };

  // In-app navigation from where the phone is.
  const onNavigate = async () => {
    const point = await locate();
    if (point) router.push({ pathname: '/navigate', params: { req: encodeNavRequest({ from: 'here', to: [{ ...point, label: store.name }], prefer: 'recommended', title: store.name }) } });
  };

  const onWaze = async () => {
    const point = await locate();
    if (point) navigateWithWaze(point, { storeId: store.id }).catch(() => {});
  };

  const onAddPhoto = async (source: 'camera' | 'library') => {
    if (!userId || photoBusy) return;
    try {
      const picked = source === 'camera' ? await captureWithCamera(['images']) : await pickFromLibrary(6, ['images']);
      if (!picked.length) return;
      setPhotoBusy(true);
      const saved = await uploadVisitPhotos(userId, store.id, picked);
      setVisitPhotos((n) => n + saved.length);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Photo not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  };

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

  const visitedToday = !!tally?.last && localDateString(new Date(tally.last)) === localDateString(new Date(now));
  const owed = Math.max(0, target - done);

  const lockMs = visitHere ? lockRemainingMs(activeVisit.startedAt, now) : 0;
  const locked = visitHere && lockMs > 0;
  // OMs: 1 visit per store a week (2 at D grade). OTMs never lock.
  const weekLocked = visitsLeftThisWeek(store.id) <= 0;
  const elapsedMin = visitHere ? Math.max(0, (now - new Date(activeVisit.startedAt).getTime()) / 60_000) : 0;

  const beginVisit = async () => {
    setVisitBusy(true);
    try {
      await startVisit(store.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } catch (e) {
      if (isVisitLimitError(e)) return setLimitOpen(true);
      Alert.alert('Visit not started', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setVisitBusy(false);
    }
  };

  // A second visit on the same day is usually a mistake, so confirm it.
  const onStartVisit = () => {
    if (visitBusy) return;
    if (weekLocked) return setLimitOpen(true);
    if (!visitedToday) return beginVisit();
    Alert.alert('Already visited today', `Start another visit to ${store.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Start visit', onPress: beginVisit },
    ]);
  };

  const onCompleteVisit = async () => {
    if (visitBusy || locked) return;
    setVisitBusy(true);
    try {
      const { minutes } = await completeVisit();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCheer({ text: `${formatDuration(minutes)} on site. ${remainingMessage(done + 1, target)}`, done: done + 1 >= target });
    } catch (e) {
      if (isVisitLimitError(e)) return setLimitOpen(true);
      Alert.alert('Visit not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setVisitBusy(false);
    }
  };

  const onCancelVisit = () =>
    Alert.alert('Cancel this visit?', 'The timer stops and nothing is logged.', [
      { text: 'Keep going', style: 'cancel' },
      { text: 'Cancel visit', style: 'destructive', onPress: () => cancelVisit().catch(() => {}) },
    ]);

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
      <Txt variant="caption" tone={owed === 0 ? 'success' : 'dim'} style={{ marginTop: 16 }}>
        {owed === 0
          ? `Target met: ${done} of ${target} visits this month. This store is out of today's route.`
          : `${done} of ${target} visits this month · ${owed === 1 ? 'Last one to go' : `${owed} more to go`}`}
        {visitedToday ? ' · Visited today' : ''}
        {weekLocked ? ' · Done for this week' : ''}
      </Txt>
      {cheer ? (
        <Animated.View
          key={cheer.text}
          entering={ZoomIn.springify().damping(12)}
          exiting={FadeOut.duration(300)}
          accessibilityLiveRegion="polite"
          style={{
            marginTop: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 16,
            backgroundColor: cheer.done ? palette.gold + '26' : palette.primary + '1F',
            borderWidth: 1,
            borderColor: cheer.done ? palette.gold : palette.primary,
          }}
        >
          <Ionicons name={cheer.done ? 'trophy' : 'flame'} size={22} color={cheer.done ? palette.gold : palette.primary} />
          <Txt variant="strong" style={{ flex: 1 }}>
            {cheer.text}
          </Txt>
        </Animated.View>
      ) : null}
      {visitHere ? (
        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }} accessibilityLiveRegion="polite">
            <Ionicons name="timer" size={16} color={palette.gold} />
            <Txt variant="caption" tone="gold" style={{ flex: 1 }}>
              On site since {new Date(activeVisit.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {formatDuration(elapsedMin)}
            </Txt>
          </View>
          <NeonButton
            label={locked ? `Complete Visit · ${formatCountdown(lockMs)}` : 'Complete Visit'}
            icon={locked ? 'lock-closed' : 'checkmark-circle'}
            variant={locked ? 'subtle' : 'gold'}
            size="lg"
            onPress={onCompleteVisit}
            disabled={locked}
            loading={visitBusy}
            accessibilityHint={locked ? `Unlocks in ${formatCountdown(lockMs)}` : undefined}
            full
          />
          {locked ? (
            <Txt variant="caption" tone="dim" align="center" style={{ marginTop: 8 }}>
              Note: Visits must be at least {MIN_VISIT_MINUTES} minutes long.
            </Txt>
          ) : (
            <Txt variant="caption" tone="faint" align="center" style={{ marginTop: 8 }}>
              Aim for {MIN_VISIT_MINUTES} minutes to an hour. The clock-out alarm sounds at {VISIT_ALARM_MINUTES} minutes.
            </Txt>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <NeonButton label="Visit photo" icon="camera-outline" variant="outline" onPress={() => onAddPhoto('camera')} loading={photoBusy} style={{ flex: 1 }} accessibilityHint="Saved to this visit and included in your monthly export" />
            <NeonButton label="From gallery" icon="images-outline" variant="subtle" onPress={() => onAddPhoto('library')} disabled={photoBusy} style={{ flex: 1 }} />
          </View>
          {visitPhotos > 0 ? (
            <Txt variant="caption" tone="success" align="center" style={{ marginTop: 6 }}>
              {visitPhotos} photo{visitPhotos === 1 ? '' : 's'} saved to this visit
            </Txt>
          ) : null}
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <NeonButton label="Cancel visit" icon="close" variant="ghost" size="sm" onPress={onCancelVisit} disabled={visitBusy} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <NeonButton
              label={visitElsewhere ? 'Visit in progress elsewhere' : weekLocked ? 'Visit limit reached' : visitedToday ? 'Start another visit' : 'Start Visit'}
              icon={weekLocked && !visitElsewhere ? 'lock-closed' : 'play-circle'}
              variant={weekLocked ? 'subtle' : 'gold'}
              accessibilityHint={weekLocked ? 'You have used this week\'s visits for this store' : undefined}
              size="lg"
              onPress={onStartVisit}
              loading={visitBusy}
              disabled={!!visitElsewhere}
              style={{ flexGrow: 1, flexBasis: 200 }}
              full
            />
            {done > 0 && <NeonButton label="Undo" icon="arrow-undo" variant="ghost" onPress={onUndo} />}
          </View>
          <NeonButton label="Log Past Visit" icon="time-outline" variant="outline" onPress={() => (weekLocked ? setLimitOpen(true) : setPastOpen(true))} disabled={visitBusy} style={{ marginTop: 10 }} accessibilityHint="Add visits you already did this month" full />
          {visitElsewhere ? (
            <Txt variant="caption" tone="dim" style={{ marginTop: 8 }} onPress={() => router.replace({ pathname: '/store/[id]', params: { id: visitElsewhere.id } })}>
              You are on a visit at {visitElsewhere.name}. Complete or cancel it there first.
            </Txt>
          ) : weekLocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Ionicons name="checkmark-circle" size={15} color={palette.gold} />
              <Txt variant="caption" tone="gold" style={{ flex: 1 }}>
                Visited this week. Unlocks again on Monday.
              </Txt>
            </View>
          ) : (
            <Txt variant="caption" tone="faint" style={{ marginTop: 8 }}>
              Tap Start Visit when you walk in. You can complete it after {MIN_VISIT_MINUTES} minutes.
            </Txt>
          )}
        </View>
      )}
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
              <NeonButton size="sm" variant="gold" icon="navigate" label="Navigate" onPress={onNavigate} loading={locating} />
              <NeonButton size="sm" variant="outline" icon="car-sport" label="Navigate with Waze" onPress={onWaze} disabled={locating} accessibilityHint="Opens Waze and leaves BOAROUTE's drive screen with Clock In underneath" />
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
    <Screen
      back
      kicker="Store"
      title={store.name}
      right={<NeonButton size="sm" variant="subtle" icon="options-outline" label="Edit" onPress={() => setSettingsOpen(true)} />}
    >
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
      {pastOpen && (
        <PastVisitSheet
          store={store}
          done={done}
          open={pastOpen}
          onClose={() => setPastOpen(false)}
          onSave={async (count) => {
            try {
              await logPastVisits(store.id, count);
            } catch (e) {
              if (isVisitLimitError(e)) {
                setPastOpen(false);
                setLimitOpen(true);
              }
              throw e;
            }
            setCheer({ text: `${count} past ${count === 1 ? 'visit' : 'visits'} logged. ${remainingMessage(done + count, target)}`, done: done + count >= target });
          }}
        />
      )}
      {settingsOpen && (
        <StoreSettingsSheet store={store} targets={targets} open={settingsOpen} onClose={() => setSettingsOpen(false)} onSave={(grade, frequency) => updateStoreSettings(store.id, grade, frequency)} />
      )}
      <VisitLimitModal open={limitOpen} onClose={() => setLimitOpen(false)} footnote="Your visits here unlock again on Monday." />
      <MediaViewer path={viewing} url={viewing ? urls[viewing] ?? null : null} onClose={() => setViewing(null)} />
    </Screen>
  );
}
