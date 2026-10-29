import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { routeChoices, type RouteKind, type RouteOptionsResult } from '../../../supabase/functions/_shared/route-analysis';
import { GradeBadge, ManagerBadge } from '@/components/badges';
import { Chip, ToggleRow } from '@/components/controls';
import { GlassCard } from '@/components/GlassCard';
import { HudMap } from '@/components/HudMap';
import { DataErrorBanner, EmptyState, LoadingBlock } from '@/components/misc';
import { StoreListSkeleton } from '@/components/Skeleton';
import { IconButton, NeonButton } from '@/components/NeonButton';
import { RouteOptionCard } from '@/components/RouteOptionCard';
import { Screen, SectionHeader } from '@/components/Screen';
import { Txt } from '@/components/Txt';
import { useHomePoint } from '@/hooks/useHomePoint';
import { useCurrentPoint, useStartPoint } from '@/hooks/useStartPoint';
import { useLayout } from '@/hooks/useLayout';
import { useUnits } from '@/hooks/useUnits';
import { localDateString } from '@/lib/budget';
import { formatMinutes } from '@/lib/format';
import { storeTarget } from '@/lib/frequency';
import { encodeNavRequest, type NavDestination } from '@/lib/nav-request';
import { getPref, setPref } from '@/lib/prefs';
import { DEFAULT_MAX_STOPS, MAX_STOPS_LIMIT, hasCoords, planDayRoute, planWaypoints, toLatLng } from '@/lib/route-engine';
import { resolveStartPoint, startPointLabel } from '@/lib/start-point';
import { isWorkingDate } from '@/lib/workdays';
import { useAuth } from '@/providers/AuthProvider';
import { useData } from '@/providers/DataProvider';
import { navigateWithWaze } from '@/services/drive';
import { fetchRouteOptions } from '@/services/functions';
import { useTheme } from '@/theme/ThemeProvider';

function readStops(): number {
  const n = Number(getPref('route.maxStops'));
  return Number.isInteger(n) && n >= 1 && n <= MAX_STOPS_LIMIT ? n : DEFAULT_MAX_STOPS;
}

export default function RouteScreen() {
  const { palette } = useTheme();
  const { profile } = useAuth();
  const { myStores, tallies, targets, weekLocked, activeVisit, loading } = useData();
  // The shift calendar decides; the weekly pattern only applies until it is saved.
  const workingToday = isWorkingDate(new Date(), profile?.shift_dates ?? null, profile?.working_days);
  const { contentWidth, compact } = useLayout();
  const units = useUnits();
  const { point: home, error: homeError } = useHomePoint(profile?.starting_location);
  const [maxStops, setMaxStops] = useState(readStops);
  const [returnHome, setReturnHome] = useState(getPref('route.returnHome') !== 'false');
  // Where the day starts is set in Go Anywhere: home by default, current location, a store or an address.
  const startPoint = useStartPoint();
  const here = useCurrentPoint(startPoint.kind === 'here');
  const startStore = useMemo(() => (startPoint.kind === 'store' ? myStores.find((s) => s.id === startPoint.storeId && hasCoords(s)) ?? null : null), [myStores, startPoint]);
  const start = useMemo(
    () => resolveStartPoint(startPoint, { home, here: here.point, store: startStore ? toLatLng(startStore) : null }),
    [startPoint, home, here.point, startStore],
  );
  const startLabel = startPointLabel(startPoint, { homeLabel: profile?.starting_location, storeName: startStore?.name });
  const end = returnHome ? home : null;
  // A missing home only blocks routing when the route starts there (or a picked store has gone).
  const startError = startPoint.kind === 'here' ? here.error : startPoint.kind === 'custom' || startStore ? null : homeError;
  // Live options are stored with the stop list they were computed for.
  const [routeState, setRouteState] = useState<{ key: string; result: RouteOptionsResult; liveError: string | null } | null>(null);
  const [selected, setSelected] = useState<{ kind: RouteKind; n: number }>({ kind: 'recommended', n: 0 });

  const plan = useMemo(
    () =>
      start
        ? planDayRoute(myStores, tallies, targets, start, {
            maxStops,
            end,
            // OMs who have used this week's visits at a store don't drive there again until Monday.
            excludeIds: startStore ? [startStore.id, ...weekLocked] : [...weekLocked],
            anchorNearStart: !!startStore,
          })
        : null,
    [myStores, tallies, targets, weekLocked, start, end, startStore, maxStops],
  );
  // Stores still owed visits this month but locked for the week (OM limit).
  const lockedOwed = useMemo(
    () => myStores.filter((s) => weekLocked.has(s.id) && (tallies[s.id]?.count ?? 0) < storeTarget(s, targets)).length,
    [myStores, weekLocked, tallies, targets],
  );
  const points = useMemo(() => (plan && start && plan.stops.length ? planWaypoints(plan, start) : []), [plan, start]);
  const pointsKey = points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|');

  useEffect(() => {
    if (points.length < 2) return;
    let alive = true;
    fetchRouteOptions(points).then(({ result, liveError: err }) => {
      if (!alive) return;
      setRouteState({ key: pointsKey, result, liveError: err });
      const first = routeChoices(result)[0];
      setSelected({ kind: first?.kind ?? 'standard', n: 0 });
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
  const choices = useMemo(() => (options ? routeChoices(options) : []), [options]);
  const activeOption = choices.filter((o) => o.kind === selected.kind)[selected.n] ?? choices[0] ?? null;

  // In-app navigation from wherever the phone is; the navigator reroutes if that is not the planned start.
  const startNavigation = () => {
    if (!plan || plan.stops.length === 0) return;
    const to: NavDestination[] = plan.stops.map((s) => ({ ...toLatLng(s.store), label: s.store.name }));
    if (plan.end) to.push({ ...plan.end, label: 'Home' });
    router.push({
      pathname: '/navigate',
      params: { req: encodeNavRequest({ from: 'here', to, prefer: activeOption?.kind ?? 'recommended', optionIndex: selected.n, title: `Today's route · ${plan.stops.length} stops` }) },
    });
  };

  const navigateTo = (store: { name: string; latitude: number | null; longitude: number | null }) =>
    router.push({
      pathname: '/navigate',
      params: { req: encodeNavRequest({ from: 'here', to: [{ lat: store.latitude as number, lng: store.longitude as number, label: store.name }], prefer: 'recommended', title: store.name }) },
    });

  // Visits are timed (25 minutes minimum), so they start on the store page.
  const openVisit = (storeId: string) => router.push({ pathname: '/store/[id]', params: { id: storeId } });

  const dayOffNotice = workingToday ? null : (
    <GlassCard animateIn={false} onPress={() => router.push('/working-days')} accessibilityLabel="Day off today. Open your shift calendar">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="moon-outline" size={20} color={palette.gold} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="strong">Day off on your shift calendar</Txt>
          <Txt variant="caption" tone="dim">
            You can still plan a route. Tap to change today in your calendar.
          </Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
      </View>
    </GlassCard>
  );

  // A fixed-height preview map; the full map lives on the navigation screen.
  const mapH = compact ? 200 : 250;

  const startPicker = (
    <GlassCard animateIn={false} onPress={() => router.push('/go-anywhere')} accessibilityLabel={`Starting from ${startLabel}. Change it in Go Anywhere`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name={startPoint.kind === 'here' ? 'locate' : startPoint.kind === 'store' ? 'storefront' : startPoint.kind === 'custom' ? 'location' : 'home'} size={20} color={palette.gold} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="label" tone="dim">
            Starting from
          </Txt>
          <Txt variant="strong" numberOfLines={1}>
            {startLabel}
          </Txt>
        </View>
        <Txt variant="caption" tone="faint">
          Change in Go Anywhere
        </Txt>
        <Ionicons name="chevron-forward" size={18} color={palette.textFaint} />
      </View>
    </GlassCard>
  );

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

  if (loading) return <Screen inTabs title="Today's route" kicker="Route engine"><StoreListSkeleton rows={4} label="Loading your route" /></Screen>;

  if (startError) {
    return (
      <Screen inTabs title="Today's route" kicker="Route engine">
        {startPicker}
        <View style={{ height: 12 }} />
        <EmptyState icon="home-outline" title="Where do you start?" body={`${startError} Or pick another starting point in Go Anywhere.`} action={<NeonButton label="Choose starting point" size="sm" onPress={() => router.push('/go-anywhere')} />} />
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

  if (!plan || !start) return <Screen inTabs title="Today's route" kicker="Route engine">{startPicker}<LoadingBlock label={startPoint.kind === 'here' ? 'Finding your location' : 'Locating your start'} /></Screen>;

  if (plan.stops.length === 0) {
    return (
      <Screen inTabs title="Today's route" kicker="Route engine">
        {dayOffNotice}
        {dayOffNotice && <View style={{ height: 12 }} />}
        {goAnywhere}
        <View style={{ height: 12 }} />
        {startPicker}
        <View style={{ height: 12 }} />
        {settings}
        <View style={{ height: 12 }} />
        <EmptyState
          icon={lockedOwed > 0 ? 'lock-closed-outline' : 'trophy-outline'}
          title={lockedOwed > 0 ? 'Done for this week' : plan.dueCount > 0 ? 'Nothing else owed nearby' : 'All targets met'}
          body={
            lockedOwed > 0
              ? `You have used this week's visits at ${lockedOwed === 1 ? 'the 1 store' : `all ${lockedOwed} stores`} still owed visits. ${lockedOwed === 1 ? 'It comes' : 'They come'} back into your route on Monday.`
              : plan.dueCount > 0
                ? 'The only store still owed visits is the one you are starting from. Start a visit from its store page.'
                : 'Every store in your patch has hit its monthly visit target. Enjoy the open road.'
          }
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
          {options.countryRoadWarning ? (
            <GlassCard animateIn={false}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Ionicons name="warning" size={20} color={palette.warning} />
                <Txt variant="caption" tone="warning" style={{ flex: 1 }}>
                  No main-road way through right now, so even the best route uses about {units.distance(options.countryRoadWarning.ruralKm)} of country roads.
                  {options.countryRoadWarning.warnings.length ? ` ${options.countryRoadWarning.warnings[0]}` : ''}
                </Txt>
              </View>
            </GlassCard>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start', gap: 12 }}>
            {choices.map((o, i) => (
              <RouteOptionCard
                key={`${o.kind}-${i}`}
                index={i}
                option={o}
                selected={o === activeOption}
                onSelect={() => setSelected({ kind: o.kind, n: choices.filter((c) => c.kind === o.kind).indexOf(o) })}
                live={live}
                note={i === 0 && choices.length === 1 && live ? 'Only one sensible route today; the others drive the same roads.' : null}
              />
            ))}
          </View>
          {liveError ? (
            <Txt variant="caption" tone="warning">
              {liveError} Showing an offline estimate.
            </Txt>
          ) : null}
          <NeonButton
            label={activeOption?.kind === 'recommended' ? 'Start recommended route' : activeOption?.kind === 'motorway' ? 'Start motorway route' : 'Start this route'}
            icon="navigate"
            variant={activeOption === choices[0] ? 'gold' : 'primary'}
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
      {/* One stacked column at every width: Go Anywhere, start point, map preview, route, start, stops today. */}
      <View style={{ gap: 12 }}>
        {dayOffNotice}
        {goAnywhere}
        {startPicker}
        <HudMap width={contentWidth} height={mapH} start={start} end={plan.end} stops={plan.stops.map((s) => toLatLng(s.store))} motorway={null} standard={activeOption?.geometry ?? points.map((p) => [p.lng, p.lat])} selected="standard" />
        {optionsBlock}
        {settings}
      </View>

      <SectionHeader title={`Stops · ${formatMinutes(plan.onSiteMinutes)} on site`} />
      <View style={{ gap: 10 }}>
        {plan.stops.map((stop, i) => {
          const leg = legFor(i);
          const legText = leg ? `${formatMinutes(leg.durationS / 60)} · ${units.distance(leg.distanceM / 1000)}` : `${formatMinutes(stop.legMinutes)} · ${units.distance(stop.legKm)}`;
          const last = tallies[stop.store.id]?.last;
          const doneToday = !!last && localDateString(new Date(last)) === localDateString(new Date());
          const inProgress = activeVisit?.storeId === stop.store.id;
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
                  <IconButton icon="car-sport" label={`Navigate to ${stop.store.name} with Waze`} onPress={() => navigateWithWaze(toLatLng(stop.store), { storeId: stop.store.id }).catch(() => {})} />
                  <IconButton icon={inProgress ? 'timer' : doneToday ? 'checkmark-done' : 'timer-outline'} label={inProgress ? `Visit in progress at ${stop.store.name}` : `Start a visit at ${stop.store.name}`} tone={inProgress || doneToday ? 'gold' : 'default'} onPress={() => openVisit(stop.store.id)} />
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
