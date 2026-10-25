import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { LngLat, RouteOption, RouteOptionsResult } from '../../supabase/functions/_shared/route-analysis';
import { HudMap } from '@/components/HudMap';
import { LoadingBlock } from '@/components/misc';
import { HazardPin, HazardSheet, ReportSheet, Toast } from '@/components/NavOverlays';
import { IconButton, NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { formatMinutes, formatMiles, formatTime } from '@/lib/format';
import { haversineKm } from '@/lib/geo';
import { isLiveHazard, type HazardReport, type HazardType } from '@/lib/hazards';
import { decodeNavRequest, type NavDestination } from '@/lib/nav-request';
import { formatNavDistance, PREWARN_M, prepareRoute, progressAt, remainingWaypoints, type NavProgress } from '@/lib/nav-progress';
import { getPref, setPref } from '@/lib/prefs';
import type { LatLng } from '@/lib/types';
import { fetchRouteOptions } from '@/services/functions';
import { clearHazard, fetchLiveHazards, reportHazard } from '@/services/hazards';
import { COCKPIT_MAP_STYLE } from '@/theme/map-style';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/typography';

/** The Google map needs a key baked into the build; without one Android would crash, so fall back to the HUD map. */
const MAPS_READY = Platform.OS !== 'android' || Constants.expoConfig?.extra?.mapsConfigured === true;
const HAZARD_REFRESH_MS = 60_000;
const REROUTE_COOLDOWN_MS = 20_000;

const toCoord = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

function KeepAwake() {
  useKeepAwake();
  return null;
}

export default function Navigate() {
  const { req: rawReq } = useLocalSearchParams<{ req: string }>();
  const req = useMemo(() => decodeNavRequest(rawReq), [rawReq]);
  const { palette } = useTheme();
  const { insets, width, height, compact } = useLayout();
  const mapRef = useRef<MapView>(null);
  const nowMs = useNow(15_000);

  const [origin, setOrigin] = useState<LatLng | null>(req && req.from !== 'here' ? req.from : null);
  const [error, setError] = useState<string | null>(null);
  // Asked once up front: Google Maps on Android throws if the blue location dot
  // is switched on before the permission is granted, so the map waits for this.
  const [locPerm, setLocPerm] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [options, setOptions] = useState<RouteOptionsResult | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [choice, setChoice] = useState<'motorway' | 'standard'>(req?.prefer ?? 'motorway');
  const [navigating, setNavigating] = useState(false);
  const [following, setFollowing] = useState(true);
  const [position, setPosition] = useState<Location.LocationObject | null>(null);
  const [progress, setProgress] = useState<NavProgress | null>(null);
  const [muted, setMuted] = useState(getPref('nav.muted') === 'true');
  const [rerouting, setRerouting] = useState(false);
  const [waypoints, setWaypoints] = useState<NavDestination[]>(req?.to ?? []);

  const [hazards, setHazards] = useState<HazardReport[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBusy, setReportBusy] = useState<HazardType | null>(null);
  const [openHazard, setOpenHazard] = useState<HazardReport | null>(null);
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hideToast = useCallback(() => setToast(null), []);

  const lastVertex = useRef(0);
  const offRouteFixes = useRef(0);
  const lastReroute = useRef(0);
  const spoken = useRef<{ step: number; prewarned: boolean }>({ step: -1, prewarned: false });
  const announced = useRef(new Set<string>());

  const option: RouteOption | null = options ? (choice === 'motorway' && options.motorway.available ? options.motorway : options.standard) : null;
  const other: RouteOption | null = options && options.motorway.available && !options.identical ? (option === options.motorway ? options.standard : options.motorway) : null;
  const prepared = useMemo(() => (option ? prepareRoute(option.geometry, option.steps) : null), [option]);

  // 0. Location permission, before the map renders.
  useEffect(() => {
    let alive = true;
    Location.requestForegroundPermissionsAsync()
      .then((perm) => alive && setLocPerm(perm.granted ? 'granted' : 'denied'))
      .catch(() => alive && setLocPerm('denied'));
    return () => {
      alive = false;
    };
  }, []);

  // 1. Where are we starting from?
  useEffect(() => {
    if (!req || req.from !== 'here' || locPerm !== 'granted') return;
    let alive = true;
    (async () => {
      try {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        const fix = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
        if (alive) setOrigin({ lat: fix.coords.latitude, lng: fix.coords.longitude });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not find your location.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [req, locPerm]);

  // 2. Plan with live traffic.
  const plan = useCallback(async (from: LatLng, stops: NavDestination[]) => {
    const { result, liveError: err } = await fetchRouteOptions([from, ...stops]);
    setOptions(result);
    setLiveError(err);
    lastVertex.current = 0;
    spoken.current = { step: -1, prewarned: false };
    return result;
  }, []);

  useEffect(() => {
    if (!origin || !req) return;
    let alive = true;
    fetchRouteOptions([origin, ...req.to])
      .then(({ result, liveError: err }) => {
        if (!alive) return;
        setOptions(result);
        setLiveError(err);
      })
      .catch(() => alive && setError('Could not plan this route. Check your connection and try again.'));
    return () => {
      alive = false;
    };
  }, [origin, req]);

  // Frame the whole route while previewing.
  useEffect(() => {
    if (!option || navigating || !MAPS_READY) return;
    const coords = option.geometry.map(toCoord);
    if (coords.length < 2) return;
    const t = setTimeout(() => mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: insets.top + 90, right: 40, bottom: 320, left: 40 }, animated: true }), 250);
    return () => clearTimeout(t);
  }, [option, navigating, insets.top]);

  // 3. Hazards: load now and refresh every minute.
  const loadHazards = useCallback(() => {
    fetchLiveHazards()
      .then(setHazards)
      .catch(() => {
        // Hazards are a bonus layer; navigation carries on without them.
      });
  }, []);
  useEffect(() => {
    loadHazards();
    const t = setInterval(loadHazards, HAZARD_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadHazards]);

  const say = useCallback(
    (text: string) => {
      if (muted || !text) return;
      Speech.stop();
      Speech.speak(text, { language: 'en-GB', rate: 1.0 });
    },
    [muted],
  );

  // 4. Turn-by-turn: follow the driver, speak turns, reroute when off course.
  useEffect(() => {
    if (!navigating) return;
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 1000 }, (fix) => {
      if (alive) setPosition(fix);
    })
      .then((s) => {
        if (alive) sub = s;
        else s.remove();
      })
      .catch(() => {
        Alert.alert('Location unavailable', 'Turn on location to follow the route.');
        setNavigating(false);
      });
    return () => {
      alive = false;
      sub?.remove();
      Speech.stop();
    };
  }, [navigating]);

  useEffect(() => {
    if (!navigating || !position || !prepared) return;
    const here = { lat: position.coords.latitude, lng: position.coords.longitude };
    const p = progressAt(prepared, here, lastVertex.current);
    lastVertex.current = p.vertex;
    setProgress(p);

    if (following && MAPS_READY) {
      const heading = position.coords.heading;
      mapRef.current?.animateCamera(
        { center: { latitude: here.lat, longitude: here.lng }, pitch: 55, zoom: 17, ...(heading != null && heading >= 0 ? { heading } : null) },
        { duration: 900 },
      );
    }

    // Stops along the way.
    for (const w of waypoints) {
      const key = `${w.lat},${w.lng}`;
      if (!announced.current.has(key) && haversineKm(here, w) * 1000 < 60) {
        announced.current.add(key);
        setToast(`Arrived at ${w.label}`);
        say(`You have arrived at ${w.label}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    }
    if (p.arrived) return;

    // Voice: announce each new step once, then again just before the turn.
    if (p.nextStep) {
      if (spoken.current.step !== p.nextStepIndex) {
        spoken.current = { step: p.nextStepIndex, prewarned: p.distanceToNextM <= PREWARN_M };
        say(p.distanceToNextM > PREWARN_M ? `In ${formatNavDistance(p.distanceToNextM).replace('mi', 'miles').replace('yd', 'yards')}, ${p.nextStep.instruction}` : p.nextStep.instruction);
      } else if (!spoken.current.prewarned && p.distanceToNextM <= PREWARN_M) {
        spoken.current.prewarned = true;
        say(p.nextStep.instruction);
      }
    }

    // Reroute after three fixes in a row off the line.
    offRouteFixes.current = p.offRoute ? offRouteFixes.current + 1 : 0;
    if (offRouteFixes.current >= 3 && !rerouting && Date.now() - lastReroute.current > REROUTE_COOLDOWN_MS) {
      lastReroute.current = Date.now();
      offRouteFixes.current = 0;
      const ahead = remainingWaypoints(prepared, waypoints, p.vertex) as NavDestination[];
      const stops = ahead.length ? ahead : waypoints.slice(-1);
      setRerouting(true);
      say('Rerouting');
      plan(here, stops)
        .then(() => setWaypoints(stops))
        .catch(() => setToast('Could not reroute. Keep to the line.'))
        .finally(() => setRerouting(false));
    }
    // Position drives this effect; the rest is read at the moment of each fix.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  const start = async () => {
    const perm = await Location.requestForegroundPermissionsAsync().catch(() => null);
    if (!perm?.granted) {
      Alert.alert('Location needed', 'Allow location so BOAROUTE can guide you turn by turn.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
      return;
    }
    announced.current.clear();
    setFollowing(true);
    setNavigating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (option?.steps[0]) say(option.steps[0].instruction);
  };

  const stop = () => {
    setNavigating(false);
    setProgress(null);
    Speech.stop();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setPref('nav.muted', String(next));
    if (next) Speech.stop();
  };

  const onReport = async (type: HazardType) => {
    setReportBusy(type);
    try {
      let fix = position;
      if (!fix) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) throw new Error('Allow location so the report lands in the right place.');
        fix = (await Location.getLastKnownPositionAsync({ maxAge: 30_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
      }
      const saved = await reportHazard(type, fix.coords.latitude, fix.coords.longitude);
      setHazards((prev) => [saved, ...prev]);
      setReportOpen(false);
      setToast('Reported. Thanks for warning the team.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Report not sent', e instanceof Error && e.message ? e.message : 'Check your connection and try again.');
    } finally {
      setReportBusy(null);
    }
  };

  const onClearHazard = async () => {
    if (!openHazard) return;
    setClearing(true);
    try {
      await clearHazard(openHazard.id);
      setHazards((prev) => prev.filter((h) => h.id !== openHazard.id));
      setOpenHazard(null);
      setToast('Hazard cleared. Thanks for keeping the roads safe.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) {
      Alert.alert('Could not clear', e instanceof Error && e.message ? e.message : 'Check your connection and try again.');
    } finally {
      setClearing(false);
    }
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/route'));

  if (!req) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg[1], padding: 24, paddingTop: insets.top + 40, gap: 16 }}>
        <Txt variant="title">Nothing to navigate to</Txt>
        <NeonButton label="Back" icon="chevron-back" onPress={close} />
      </View>
    );
  }

  const live = !!options && options.source !== 'estimate';
  const remainingS = option && prepared && progress ? option.durationS * (prepared.totalM ? progress.remainingM / prepared.totalM : 0) : (option?.durationS ?? 0);
  const remainingM = progress ? progress.remainingM : (option?.distanceM ?? 0);
  const arrival = new Date(nowMs + remainingS * 1000);
  const liveHazards = hazards.filter((h) => isLiveHazard(h, nowMs));
  const destination = waypoints[waypoints.length - 1];
  const shownError = error ?? (req?.from === 'here' && locPerm === 'denied' ? 'Location is off for BOAROUTE. Allow it to navigate from where you are.' : null);

  const map = MAPS_READY && locPerm !== 'pending' ? (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      customMapStyle={COCKPIT_MAP_STYLE}
      userInterfaceStyle="dark"
      showsUserLocation={locPerm === 'granted'}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      showsPointsOfInterests={false}
      showsBuildings={false}
      pitchEnabled
      initialRegion={origin ? { latitude: origin.lat, longitude: origin.lng, latitudeDelta: 0.2, longitudeDelta: 0.2 } : { latitude: 51.64, longitude: -0.73, latitudeDelta: 0.6, longitudeDelta: 0.6 }}
      onPanDrag={() => navigating && setFollowing(false)}
    >
      {other && <Polyline coordinates={other.geometry.map(toCoord)} strokeColor="rgba(201,205,212,0.45)" strokeWidth={4} tappable onPress={() => setChoice(other.kind)} />}
      {option && (
        <>
          <Polyline coordinates={option.geometry.map(toCoord)} strokeColor="rgba(142,110,51,0.55)" strokeWidth={12} />
          <Polyline coordinates={option.geometry.map(toCoord)} strokeColor="#E8CF94" strokeWidth={5} />
        </>
      )}
      {waypoints.map((w, i) => (
        <Marker key={`${w.lat},${w.lng}`} coordinate={{ latitude: w.lat, longitude: w.lng }} title={w.label} tracksViewChanges={false}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#0B0B0C', borderWidth: 2.5, borderColor: '#E8CF94', alignItems: 'center', justifyContent: 'center' }}>
            {i === waypoints.length - 1 ? <Ionicons name="flag" size={14} color="#E8CF94" /> : <Txt variant="strong" style={{ color: '#E8CF94', fontSize: 13 }}>{i + 1}</Txt>}
          </View>
        </Marker>
      ))}
      {liveHazards.map((h) => (
        <Marker key={h.id} coordinate={{ latitude: h.latitude, longitude: h.longitude }} onPress={() => setOpenHazard(h)} tracksViewChanges={false} accessibilityLabel={`${h.hazard_type} reported`}>
          <HazardPin type={h.hazard_type} />
        </Marker>
      ))}
    </MapView>
  ) : origin && option ? (
    <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg[2] }]}>
      <HudMap
        width={width - 24}
        height={Math.min(height * 0.55, width)}
        start={origin}
        end={null}
        stops={waypoints}
        motorway={option.kind === 'motorway' ? option.geometry : null}
        standard={options?.standard.geometry ?? option.geometry}
        selected={option.kind}
      />
    </View>
  ) : (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.bg[2] }]} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0C0D' }}>
      {navigating && <KeepAwake />}
      {map}

      {/* Top: next manoeuvre while navigating, otherwise the destination */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: insets.left + 12, right: insets.right + 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        {!navigating && <IconButton icon="chevron-back" label="Close navigation" onPress={close} size={44} />}
        <View style={{ flex: 1, minWidth: 0, borderRadius: radius.lg, padding: 14, backgroundColor: palette.surfaceStrong, borderWidth: 1, borderColor: palette.borderStrong }}>
          {navigating && progress ? (
            progress.arrived ? (
              <Txt variant="title" numberOfLines={2}>
                You have arrived{destination ? ` at ${destination.label}` : ''}
              </Txt>
            ) : (
              <Animated.View key={progress.nextStepIndex} entering={FadeIn.duration(250)}>
                <Txt variant="display" tone="gold" numberOfLines={1} style={{ fontSize: compact ? 26 : 32, lineHeight: compact ? 32 : 38 }}>
                  {formatNavDistance(progress.distanceToNextM)}
                </Txt>
                <Txt variant="heading" numberOfLines={3}>
                  {rerouting ? 'Rerouting...' : progress.nextStep?.instruction ?? `Continue to ${destination?.label ?? 'your destination'}`}
                </Txt>
                {progress.offRoute && !rerouting ? (
                  <Txt variant="caption" tone="warning">
                    {Math.round(progress.offRouteM)} m off route
                  </Txt>
                ) : null}
              </Animated.View>
            )
          ) : (
            <>
              <Txt variant="label" tone="primary" numberOfLines={1}>
                {navigating ? 'Finding you' : waypoints.length > 1 ? `${waypoints.length} stops` : 'Destination'}
              </Txt>
              <Txt variant="heading" numberOfLines={2}>
                {req.title}
              </Txt>
            </>
          )}
        </View>
      </View>

      <Toast message={toast} onHide={hideToast} top={insets.top + (navigating ? 150 : 100)} />

      {/* Floating controls above the bottom panel */}
      <View style={{ position: 'absolute', right: insets.right + 14, bottom: insets.bottom + (navigating ? 150 : 300), gap: 12, alignItems: 'flex-end' }}>
        {navigating && !following && MAPS_READY && <IconButton icon="locate" label="Recentre on me" tone="gold" onPress={() => setFollowing(true)} size={52} />}
        {navigating && <IconButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Unmute voice' : 'Mute voice'} onPress={toggleMute} size={52} />}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report a hazard"
          onPress={() => setReportOpen(true)}
          style={({ pressed }) => ({ width: 68, height: 68, borderRadius: 34, backgroundColor: '#E3B565', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#0B0B0C', transform: [{ scale: pressed ? 0.94 : 1 }] })}
        >
          <Ionicons name="warning" size={26} color="#0B0B0C" />
          <Txt variant="label" style={{ color: '#0B0B0C', fontSize: 9, letterSpacing: 1 }}>
            Report
          </Txt>
        </Pressable>
      </View>

      {/* Bottom panel */}
      <View
        style={{
          position: 'absolute',
          left: insets.left + 12,
          right: insets.right + 12,
          bottom: insets.bottom + 12,
          borderRadius: radius.xl,
          padding: 16,
          backgroundColor: palette.surfaceStrong,
          borderWidth: 1,
          borderColor: palette.borderStrong,
          maxWidth: 640,
          alignSelf: 'center',
          width: Math.min(640, width - insets.left - insets.right - 24),
        }}
      >
        {shownError ? (
          <View style={{ gap: 12 }}>
            <Txt variant="body" tone="danger">
              {shownError}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              <NeonButton label="Open settings" variant="subtle" onPress={() => Linking.openSettings().catch(() => {})} />
              <NeonButton label="Close" variant="ghost" onPress={close} />
            </View>
          </View>
        ) : !options || !option ? (
          <LoadingBlock label={origin ? 'Checking live traffic' : 'Finding your location'} />
        ) : navigating ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="title" tone="gold" numberOfLines={1}>
                {formatTime(arrival)} arrival
              </Txt>
              <Txt variant="caption" tone="dim" numberOfLines={1}>
                {formatMinutes(remainingS / 60)} · {formatMiles(remainingM / 1000)}
                {liveHazards.length ? ` · ${liveHazards.length} report${liveHazards.length > 1 ? 's' : ''} nearby` : ''}
              </Txt>
            </View>
            <NeonButton label="End" icon="close" variant="danger" onPress={stop} />
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {[options.motorway.available ? options.motorway : null, options.identical ? null : options.standard]
              .filter((o): o is RouteOption => !!o)
              .map((o) => {
                const active = o === option;
                return (
                  <Pressable
                    key={o.kind}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setChoice(o.kind)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, borderWidth: active ? 2 : 1, borderColor: active ? palette.gold : palette.border, backgroundColor: palette.surface }}
                  >
                    <Ionicons name={o.kind === 'motorway' ? 'speedometer' : 'git-branch'} size={20} color={active ? palette.gold : palette.textDim} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt variant="strong" numberOfLines={1}>
                        {o.kind === 'motorway' ? 'Fastest Route (Motorway Preferred)' : 'Standard Route'}
                      </Txt>
                      <Txt variant="caption" tone="faint" numberOfLines={1}>
                        {o.roads.length ? `Via ${o.roads.slice(0, 3).join(', ')}` : o.kind === 'motorway' ? 'Main roads first' : 'Shortest drive time'}
                      </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <Txt variant="strong" tone={active ? 'gold' : 'default'}>
                        {formatMinutes(o.durationS / 60)}
                      </Txt>
                      <Txt variant="caption" tone="faint">
                        {formatMiles(o.distanceM / 1000)}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            <Txt variant="caption" tone={live ? 'success' : 'warning'} numberOfLines={2}>
              {live ? 'Live traffic included' : `${liveError ?? 'Live traffic unavailable'} Showing an estimate.`}
              {!MAPS_READY ? ' Add a Google Maps key to enable the live map.' : ''}
            </Txt>
            <NeonButton label="Start Navigation" icon="navigate" variant="gold" size="lg" onPress={start} full />
          </View>
        )}
      </View>

      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onPick={onReport} busy={reportBusy} />
      <HazardSheet hazard={openHazard} onClose={() => setOpenHazard(null)} onClear={onClearHazard} busy={clearing} />
    </View>
  );
}

