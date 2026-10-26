import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import type { RouteOptionsResult } from '../../../supabase/functions/_shared/route-analysis';
import { GradeBadge, ManagerBadge } from '@/components/badges';
import { Chip, ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { HudMap } from '@/components/HudMap';
import { DataErrorBanner, EmptyState, LoadingBlock } from '@/components/misc';
import { IconButton, NeonButton } from '@/components/NeonButton';
import { RouteOptionCard } from '@/components/RouteOptionCard';
import { Screen, SectionHeader } from '@/components/Screen';
import { StartPointPicker } from '@/components/StartPointPicker';
import { Txt } from '@/components/Txt';
import { useHomePoint } from '@/hooks/useHomePoint';
import { useLayout } from '@/hooks/useLayout';
import { useUnits } from '@/hooks/useUnits';
import { localDateString } from '@/lib/budget';
import { formatMinutes } from '@/lib/format';
import { encodeNavRequest, type NavDestination } from '@/lib/nav-request';
import { getPref, setPref } from '@/lib/prefs';
import { DEFAULT_MAX_STOPS, MAX_STOPS_LIMIT, hasCoords, planDayRoute, planWaypoints, toLatLng } from '@/lib/route-engine';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { fetchRouteOptions } from '@/services/functions';
import { useTheme } from '@/theme/ThemeProvider';

function readStops(): number {
  const n = Number(getPref('route.maxStops'));
  return Number.isInteger(n) && n >= 1 && n <= MAX_STOPS_LIMIT ? n : DEFAULT_MAX_STOPS;
}

export default function RouteScreen() {
  const { palette } = useTheme();
  const { profile } = useAuth();
  const { myStores, tallies, targets, logVisit, loading } = useData();
  const { contentWidth, expanded, compact } = useLayout();
  const units = useUnits();
  const { point: home, error: homeError } = useHomePoint(profile?.starting_location);
  const [maxStops, setMaxStops] = useState(readStops);
  const [returnHome, setReturnHome] = useState(getPref('route.returnHome') !== 'false');
  // "Start route from": home by default, or a store on the patch.
  const [startStoreId, setStartStoreId] = useState<string | null>(() => getPref('route.startStore'));
  const startStore = useMemo(() => myStores.find((s) => s.id === startStoreId && hasCoords(s)) ?? null, [myStores, startStoreId]);
  const start = useMemo(() => (startStore ? toLatLng(startStore) : home), [startStore, home]);
  const end = returnHome ? home : null;
  // A missing home only blocks routing when the route starts there.
  const startError = startStore ? null : homeError;
  const chooseStart = (id: string | null) => {
    setStartStoreId(id);
    setPref('route.startStore', id);
  };
  // Live options are stored with the stop list they were computed for.
  const [routeState, setRouteState] = useState<{ key: string; result: RouteOptionsResult; liveError: string | null } | null>(null);
  const [selected, setSelected] = useState<'motorway' | 'standard'>('motorway');
  const [busyStop, setBusyStop] = useState<string | null>(null);

  const plan = useMemo(
    () =>
      start
        ? planDayRoute(myStores, tallies, targets, start, {
            maxStops,
            end,
            excludeIds: startStore ? [startStore.id] : [],
            anchorNearStart: !!startStore,
          })
        : null,
    [myStores, tallies, targets, start, end, startStore, maxStops],
  );
  const points = useMemo(() => (plan && start && plan.stops.length ? planWaypoints(plan, start) : []), [plan, start]);
  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (points.length < 2) return;
    let alive = true;
    fetchRouteOptions(points).then(({ result, liveError: err }) => {
      if (!alive) return;
      setRouteState({ key: pointsKey, result, liveError: err });
      setSelected(result.motorway.available ? 'motorway' : 'standard');
    });
    return () => {
      alive = false;
    };
    // pointsKey captures the stop list; points is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  const current = routeState?.key === pointsKey ? routeState : null;
  const options = current?.result ?? null;
  const liveError = current?.liveError ?? null;
  const fetching = points.length >= 2 && !current;

  const live = !!options && options.source !== 'estimate';
  const motorwayAvailable = !!options?.motorway.available;
  const activeOption = options ? (selected === 'motorway' && motorwayAvailable ? options.motorway : options.standard) : null;

  // In-app navigation from wherever the phone is; the navigator reroutes if that is not the planned start.
  const startNavigation = () => {
    if (!plan || plan.stops.length === 0) return;
    const to: NavDestination[] = plan.stops.map((s) => ({ ...toLatLng(s.store), label: s.store.name }));
    if (plan.end) to.push({ ...plan.end, label: 'Home' });
    router.push({
      pathname: '/navigate',
      params: { req: encodeNavRequest({ from: 'here', to, prefer: selected === 'motorway' && motorwayAvailable ? 'motorway' : 'standard', title: `Today's route · ${plan.stops.length} stops` }) },
    });
  };

  const navigateTo = (store: { name: string; latitude: number | null; longitude: number | null }) =>
    router.push({
      pathname: '/navigate',
      params: { req: encodeNavRequest({ from: 'here', to: [{ lat: store.latitude as number, lng: store.longitude as number, label: store.name }], prefer: 'motorway', title: store.name }) },
    });

  const markVisited = async (storeId: string) => {
    setBusyStop(storeId);
    try {
      await logVisit(storeId);
    } catch (e) {
      Alert.alert('Visit not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusyStop(null);
    }
  };

  const mapW = expanded ? Math.min(contentWidth * 0.5, 560) : contentWidth;
  const mapH = Math.round(Math.min(mapW * (compact ? 0.62 : 0.7), 420));

  const startPicker = <StartPointPicker stores={myStores} selectedId={startStore?.id ?? null} homeLabel={profile?.starting_location ?? 'not set'} onChange={chooseStart} />;

  const goAnywhere = (
    <GlassCard glow="gold" onPress={() => router.push('/go-anywhere')} accessibilityLabel="Go Anywhere" animateIn={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.goldGlow, borderWidth: 1, borderColor: palette.borderStrong }}>
          <Ionicons name="navigate" size={22} color={palette.gold} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="title" numberOfLines={1}>
            Go Anywhere
          </Txt>
          <Txt variant="caption" tone="dim" numberOfLines={2}>
            Premium routing. Motorways preferred, country lanes avoided.
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={20} color={palette.textFaint} />
      </View>
    </GlassCard>
  );

  const settings = (
    <GlassCard index={0}>
      <Txt variant="label" tone="dim" style={{ marginBottom: 8 }}>
        Stops today
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: MAX_STOPS_LIMIT - 2 }, (_, i) => i + 3).map((n) => (
          <Chip
            key={n}
            label={String(n)}
            active={maxStops === n}
            onPress={() => {
              setMaxStops(n);
              setPref('route.maxStops', String(n));
            }}
          />
        ))}
      </View>
      <ToggleRow
        label="Finish back at home"
        hint={startStore ? `${profile?.starting_location ?? 'Home'} · otherwise the day ends at the last stop` : profile?.starting_location ?? undefined}
        value={returnHome}
        onChange={(v) => {
          setReturnHome(v);
          setPref('route.returnHome', String(v));
        }}
      />
    </GlassCard>
  );

  if (loading) return <Screen inTabs title="Today's route" kicker="Route engine"><LoadingBlock label="Loading stores" /></Screen>;

  if (startError) {
    return (
      <Screen inTabs title="Today's route" kicker="Route engine">
        {startPicker}
        <View style={{ height: 12 }} />
        <EmptyState icon="home-outline" title="Where do you start?" body={`${startError} Or start from a store above.`} action={<NeonButton label="Open settings" size="sm" onPress={() => router.navigate('/profile')} />} />
      </Screen>
    );
  }

  if (myStores.length === 0) {
    return (
      <Screen inTabs title="Today's route" kicker="Route engine">
        <DataErrorBanner />
        <EmptyState icon="storefront-outline" title="No stores on your patch" body="Choose the stores you cover and the route engine plans your day around them." action={<NeonButton label="Choose my stores" size="sm" icon="storefront" onPress={() => router.push('/my-stores')} />} />
      </Screen>
    );
  }

  if (!plan || !start) return <Screen inTabs title="Today's route" kicker="Route engine">{startPicker}<LoadingBlock label="Locating home" /></Screen>;

  if (plan.stops.length === 0) {
    return (
      <Screen inTabs title="Today's route" kicker="Route engine">
        {goAnywhere}
        <View style={{ height: 12 }} />
        {startPicker}
        <View style={{ height: 12 }} />
        {settings}
        <View style={{ height: 12 }} />
        <EmptyState
          icon="trophy-outline"
          title={plan.dueCount > 0 ? 'Nothing else owed nearby' : 'All targets met'}
          body={plan.dueCount > 0 ? 'The only store still owed visits is the one you are starting from. Mark it visited from its store page.' : 'Every store in your patch has hit its monthly visit target. Enjoy the open road.'}
        />
      </Screen>
    );
  }

  const optionsBlock = (
    <View style={{ gap: 12 }}>
      {fetching && !options ? (
        <LoadingBlock label="Checking live traffic" />
      ) : options ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start', gap: 12 }}>
            {motorwayAvailable && (
              <RouteOptionCard
                index={0}
                option={options.motorway}
                selected={selected === 'motorway'}
                onSelect={() => setSelected('motorway')}
                live={live}
                note={options.identical ? 'The fastest route already uses motorways, so both options match.' : null}
              />
            )}
            <RouteOptionCard
              index={1}
              option={options.standard}
              selected={selected === 'standard' || !motorwayAvailable}
              onSelect={() => setSelected('standard')}
              live={live}
              note={!motorwayAvailable ? (live ? 'No motorway route exists for today. This is the standard fastest route.' : null) : null}
            />
          </View>
          {liveError ? (
            <Txt variant="caption" tone="warning">
              {liveError} Showing an offline estimate.
            </Txt>
          ) : null}
          <NeonButton
            label={selected === 'motorway' && motorwayAvailable ? 'Start motorway route' : 'Start standard route'}
            icon="navigate"
            variant={selected === 'motorway' && motorwayAvailable ? 'gold' : 'primary'}
            onPress={startNavigation}
            size="lg"
            full
          />
        </>
      ) : null}
    </View>
  );

  const legFor = (i: number) => activeOption?.legs[i] ?? null;

  return (
    <Screen inTabs title="Today's route" kicker={`${plan.stops.length} stops · ${plan.visitsRemaining} visits owed this month`}>
      <DataErrorBanner />
      <View style={{ marginBottom: 12, gap: 12 }}>
        {goAnywhere}
        {startPicker}
      </View>
      {expanded ? (
        <View style={{ flexDirection: 'row', gap: 20, alignItems: 'flex-start' }}>
          <View style={{ alignSelf: 'flex-start' }}>
            <HudMap width={mapW} height={mapH} start={start} end={plan.end} stops={plan.stops.map((s) => toLatLng(s.store))} motorway={motorwayAvailable ? options?.motorway.geometry ?? null : null} standard={options?.standard.geometry ?? points.map((p) => [p.lng, p.lat])} selected={motorwayAvailable ? selected : 'standard'} />
          </View>
          {/* Stops today sits under the start button so the column balances the map beside it. */}
          <View style={{ flex: 1, minWidth: 0, gap: 12, alignSelf: 'flex-start', justifyContent: 'flex-start' }}>
            {optionsBlock}
            {settings}
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <HudMap width={mapW} height={mapH} start={start} end={plan.end} stops={plan.stops.map((s) => toLatLng(s.store))} motorway={motorwayAvailable ? options?.motorway.geometry ?? null : null} standard={options?.standard.geometry ?? points.map((p) => [p.lng, p.lat])} selected={motorwayAvailable ? selected : 'standard'} />
          {optionsBlock}
          {settings}
        </View>
      )}

      <SectionHeader title={`Stops · ${formatMinutes(plan.onSiteMinutes)} on site`} />
      <View style={{ gap: 10 }}>
        {plan.stops.map((stop, i) => {
          const leg = legFor(i);
          const legText = leg ? `${formatMinutes(leg.durationS / 60)} · ${units.distance(leg.distanceM / 1000)}` : `${formatMinutes(stop.legMinutes)} · ${units.distance(stop.legKm)}`;
          const last = tallies[stop.store.id]?.last;
          const doneToday = !!last && localDateString(new Date(last)) === localDateString(new Date());
          return (
            <GlassCard key={stop.store.id} index={i + 2} onPress={() => router.push({ pathname: '/store/[id]', params: { id: stop.store.id } })} accessibilityLabel={`Stop ${i + 1}, ${stop.store.name}`}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: palette.gold }}>
                    <Txt variant="title" tone="gold" style={{ fontSize: 13 }}>
                      {i + 1}
                    </Txt>
                  </View>
                  <GradeBadge grade={stop.store.grade} size={28} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Txt variant="strong" numberOfLines={2}>
                    {stop.store.name}
                  </Txt>
                  <ManagerBadge manager={stop.store.assigned_manager} />
                  <Txt variant="caption" tone="faint" numberOfLines={2}>
                    {stop.store.address}
                  </Txt>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="car-sport-outline" size={14} color={palette.textDim} />
                    <Txt variant="caption" tone="dim">
                      {legText} · {stop.remaining} of {stop.target} visits left
                    </Txt>
                  </View>
                </View>
                <View style={{ gap: 8 }}>
                  <IconButton icon="navigate" label={`Navigate to ${stop.store.name}`} tone="primary" onPress={() => navigateTo(stop.store)} />
                  <IconButton icon={doneToday ? 'checkmark-done' : 'checkmark'} label={`Mark ${stop.store.name} visited`} tone={doneToday ? 'gold' : 'default'} onPress={() => (busyStop ? undefined : markVisited(stop.store.id))} />
                </View>
              </View>
            </GlassCard>
          );
        })}
      </View>

      {plan.unlocated.length > 0 && (
        <Txt variant="caption" tone="warning" style={{ marginTop: 12 }}>
          {plan.unlocated.length} store(s) have no map pin and were skipped: {plan.unlocated.map((s) => s.name).join(', ')}. Edit their address to fix this.
        </Txt>
      )}
    </Screen>
  );
}
