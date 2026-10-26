import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Animated, { FadeIn, FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { LngLat, RouteOption, RouteOptionsResult } from '../../supabase/functions/_shared/route-analysis';
import { HudMap } from '@/components/HudMap';
import { HazardPin, HazardSheet, NAV, NavGlass, ReportSheet, Toast } from '@/components/NavOverlays';
import { IconButton, NeonButton } from '@/components/NeonButton';
import { Txt } from '@/components/Txt';
import { useLayout } from '@/hooks/useLayout';
import { useNow } from '@/hooks/useNow';
import { useUnits } from '@/hooks/useUnits';
import { spokenDistance } from '@/lib/units';
import { formatMinutes, formatTime } from '@/lib/format';
import { haversineKm } from '@/lib/geo';
import { hazardMeta, isLiveHazard, type HazardReport, type HazardType } from '@/lib/hazards';
import { decodeNavRequest, type NavDestination } from '@/lib/nav-request';
import { HAZARD_ALERT_M, nextHazardAhead, type HazardAhead } from '@/lib/hazard-alerts';
import { PREWARN_M, prepareRoute, progressAt, remainingWaypoints, type NavProgress } from '@/lib/nav-progress';
import { getPref, setPref } from '@/lib/prefs';
import type { LatLng } from '@/lib/types';
import { fetchRouteOptions } from '@/services/functions';
import { clearHazard, fetchLiveHazards, reportHazard } from '@/services/hazards';
import { COCKPIT_MAP_STYLE } from '@/theme/map-style';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, springs } from '@/theme/typography';

/** The Google map needs a key baked into the build; without one Android would crash, so fall back to the HUD map. */
const MAPS_READY = Platform.OS !== 'android' || Constants.expoConfig?.extra?.mapsConfigured === true;
const HAZARD_REFRESH_MS = 60_000;
const REROUTE_COOLDOWN_MS = 20_000;

const toCoord = ([lng, lat]: LngLat) => ({ latitude: lat, longitude: lng });

/** Space between the floating cards and the screen edge (inside the safe area). */
const EDGE = 12;
/** One size for the secondary map controls; Report is bigger for a one-thumb tap. */
const FAB = 56;
const REPORT_FAB = 76;
/** Default driving zoom; the driver's own pinch level is kept after that. */
const FOLLOW_ZOOM = 17;
const MIN_ZOOM = 12;
const MAX_ZOOM = 20;

/**
 * Custom marker that snapshots for its first moments only: Android can draw a
 * blank pin if tracking stops before the view has laid out.
 */
function HazardMarker({ hazard, onPress }: { hazard: HazardReport; onPress: () => void }) {
  const [tracks, setTracks] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <Marker coordinate={{ latitude: hazard.latitude, longitude: hazard.longitude }} onPress={onPress} tracksViewChanges={tracks} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel={`${hazardMeta(hazard.hazard_type).label} reported`}>
      <HazardPin type={hazard.hazard_type} />
    </Marker>
  );
}

/** Arrow for the next manoeuvre, read from the instruction text. */
function maneuverIcon(instruction: string | undefined): keyof typeof Ionicons.glyphMap {
  const t = (instruction ?? '').toLowerCase();
  if (t.includes('roundabout')) return 'sync';
  if (t.includes('u-turn')) return 'return-down-back';
  if (t.includes('left')) return 'return-up-back';
  if (t.includes('right')) return 'return-up-forward';
  if (t.includes('arrive') || t.includes('destination')) return 'flag';
  return 'arrow-up';
}

/** Solid gold disc holding the manoeuvre arrow. */
function ManeuverDisc({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <LinearGradient colors={['#FFF1C9', '#E8CF94', '#B8954F']} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <Ionicons name={icon} size={24} color="#17120A" />
    </View>
  );
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

/** Big gold one-tap Report: icon and label, sized for a thumb while driving. */
function ReportButton({ onPress }: { onPress: () => void }) {
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  return (
    <Animated.View style={[anim, { width: REPORT_FAB, height: REPORT_FAB, borderRadius: REPORT_FAB / 2, shadowColor: '#E8CF94', shadowOpacity: 0.55, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 10 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Report a hazard"
        accessibilityHint="Opens police, camera, accident and hazard buttons"
        hitSlop={10}
        onPressIn={() => press.set(withSpring(0.92, springs.press))}
        onPressOut={() => press.set(withSpring(1, springs.release))}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        style={{ flex: 1, borderRadius: REPORT_FAB / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(23,18,10,0.85)' }}
      >
        <LinearGradient colors={['#FFF1C9', '#E8CF94', '#B8954F']} locations={[0, 0.55, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
        <Ionicons name="warning" size={30} color="#17120A" />
        <Txt variant="label" maxFontSizeMultiplier={1} style={{ color: '#17120A', fontSize: 9.5, letterSpacing: 1.2, marginTop: 1 }}>
          Report
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

/** Floating countdown to the next report on the road ahead: "Speed Camera · 450 yd". */
function HazardCountdown({ ahead, label }: { ahead: HazardAhead; label: string }) {
  const meta = hazardMeta(ahead.hazard.hazard_type);
  const left = Math.max(0, Math.min(1, ahead.distanceM / HAZARD_ALERT_M));
  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutUp.duration(220)} accessibilityLiveRegion="polite" accessibilityLabel={`${meta.label} in ${label}`}>
      <NavGlass style={{ borderColor: meta.color }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 14 }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: meta.color, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={meta.icon} size={20} color="#0B0B0C" />
          </View>
          <Txt variant="strong" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ flex: 1, color: NAV.text }}>
            {meta.label} ahead
          </Txt>
          <Txt variant="display" numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ color: meta.color, fontSize: 24, lineHeight: 29, flexShrink: 0 }}>
            {label}
          </Txt>
        </View>
        <View style={{ height: 3, backgroundColor: 'rgba(255,255,255,0.06)' }}>
          <View style={{ height: 3, width: `${left * 100}%`, backgroundColor: meta.color }} />
        </View>
      </NavGlass>
    </Animated.View>
  );
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
  const [ahead, setAhead] = useState<HazardAhead | null>(null);
  const warned = useRef(new Set<string>());
  const units = useUnits();
  // The driver's zoom survives following, recentring and the next trip.
  const zoom = useRef(clampZoom(Number(getPref('nav.zoom')) || FOLLOW_ZOOM));
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
        { center: { latitude: here.lat, longitude: here.lng }, pitch: 55, zoom: zoom.current, ...(heading != null && heading >= 0 ? { heading } : null) },
        { duration: 900 },
      );
    }

    // Reports on the road ahead: a countdown banner, plus one spoken warning per report.
    const next = nextHazardAhead(prepared, p.vertex, here, hazards.filter((h) => isLiveHazard(h)));
    setAhead(next);
    if (next && !warned.current.has(next.hazard.id)) {
      warned.current.add(next.hazard.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      say(`${hazardMeta(next.hazard.hazard_type).label} reported in ${spokenDistance(units.nav(next.distanceM))}`);
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
        say(p.distanceToNextM > PREWARN_M ? `In ${spokenDistance(units.nav(p.distanceToNextM))}, ${p.nextStep.instruction}` : p.nextStep.instruction);
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
    warned.current.clear();
    setFollowing(true);
    setNavigating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (option?.steps[0]) say(option.steps[0].instruction);
  };

  /** Back to following at the driver's own zoom, straight away rather than on the next fix. */
  const recentre = () => {
    setFollowing(true);
    if (position && MAPS_READY) {
      const heading = position.coords.heading;
      mapRef.current?.animateCamera(
        { center: { latitude: position.coords.latitude, longitude: position.coords.longitude }, pitch: 55, zoom: zoom.current, ...(heading != null && heading >= 0 ? { heading } : null) },
        { duration: 600 },
      );
    }
  };

  const stop = () => {
    setNavigating(false);
    setProgress(null);
    setAhead(null);
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
      // Panning stops following until Recentre; pinching sets the zoom that following keeps.
      onPanDrag={() => navigating && setFollowing(false)}
      onRegionChangeComplete={() => {
        if (!navigating) return;
        mapRef.current
          ?.getCamera()
          .then((c) => {
            if (typeof c.zoom !== 'number' || !Number.isFinite(c.zoom)) return;
            const z = clampZoom(c.zoom);
            if (Math.abs(z - zoom.current) < 0.05) return;
            zoom.current = z;
            setPref('nav.zoom', z.toFixed(2));
          })
          .catch(() => {});
      }}
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
        <HazardMarker key={h.id} hazard={h} onPress={() => setOpenHazard(h)} />
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

      {/* Top: next manoeuvre while navigating, otherwise the destination. */}
      <SafeAreaView edges={['top', 'left', 'right']} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
        <View pointerEvents="box-none" style={{ paddingHorizontal: EDGE, paddingTop: 8, width: '100%', maxWidth: 680, alignSelf: 'center', gap: 10 }}>
        <View pointerEvents="box-none" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          {!navigating && <IconButton icon="chevron-back" label="Close navigation" onPress={close} size={48} onDark />}
          <NavGlass style={{ flex: 1, minWidth: 0 }}>
            {navigating && progress ? (
              progress.arrived ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <ManeuverDisc icon="flag" />
                  <Txt variant="heading" numberOfLines={2} style={{ flex: 1, color: NAV.text }}>
                    You have arrived{destination ? ` at ${destination.label}` : ''}
                  </Txt>
                </View>
              ) : (
                <Animated.View key={progress.nextStepIndex} entering={FadeIn.duration(250)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
                  <ManeuverDisc icon={maneuverIcon(progress.nextStep?.instruction)} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Txt variant="display" numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ color: NAV.gold, fontSize: compact ? 22 : 26, lineHeight: compact ? 27 : 31 }}>
                      {units.nav(progress.distanceToNextM)}
                    </Txt>
                    <Txt variant="strong" numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ color: NAV.text, fontSize: 15, lineHeight: 20 }}>
                      {rerouting ? 'Rerouting...' : progress.nextStep?.instruction ?? `Continue to ${destination?.label ?? 'your destination'}`}
                    </Txt>
                    {progress.offRoute && !rerouting ? (
                      <Txt variant="caption" numberOfLines={1} style={{ color: NAV.warning, marginTop: 2 }}>
                        {Math.round(progress.offRouteM)} m off route
                      </Txt>
                    ) : null}
                  </View>
                </Animated.View>
              )
            ) : (
              <View style={{ paddingVertical: 12, paddingHorizontal: 16 }}>
                <Txt variant="label" numberOfLines={1} style={{ color: NAV.gold }}>
                  {navigating ? 'Finding you' : waypoints.length > 1 ? `${waypoints.length} stops` : 'Destination'}
                </Txt>
                <Txt variant="strong" numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ color: NAV.text, marginTop: 2 }}>
                  {req.title}
                </Txt>
              </View>
            )}
          </NavGlass>
        </View>
        {navigating && ahead ? <HazardCountdown ahead={ahead} label={units.nav(ahead.distanceM)} /> : null}
        </View>
      </SafeAreaView>

      <Toast message={toast} onHide={hideToast} top={insets.top + (navigating ? (ahead ? 196 : 124) : 90)} />

      {/* Bottom: controls stacked above the panel, both clear of the Android navigation bar. */}
      <SafeAreaView edges={['bottom', 'left', 'right']} pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <View pointerEvents="box-none" style={{ paddingHorizontal: EDGE, paddingBottom: EDGE, width: '100%', maxWidth: 680, alignSelf: 'center' }}>
          {/* One column, centred on the Report button, in the right thumb's reach. */}
          <View pointerEvents="box-none" style={{ alignSelf: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 12, width: REPORT_FAB }}>
            {navigating && !following && MAPS_READY && <IconButton icon="locate" label="Recentre on me" tone="gold" onPress={recentre} size={FAB} onDark />}
            {navigating && <IconButton icon={muted ? 'volume-mute' : 'volume-high'} label={muted ? 'Unmute voice' : 'Mute voice'} tone={muted ? 'danger' : 'default'} onPress={toggleMute} size={FAB} onDark />}
            <ReportButton onPress={() => setReportOpen(true)} />
          </View>

          <NavGlass style={{ padding: 16, borderRadius: radius.xl - 4 }}>
            {shownError ? (
              <View style={{ gap: 12 }}>
                <Txt variant="body" style={{ color: NAV.danger }}>
                  {shownError}
                </Txt>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <NeonButton label="Open settings" variant="outline" onDark onPress={() => Linking.openSettings().catch(() => {})} style={{ flex: 1 }} />
                  <NeonButton label="Close" variant="subtle" onDark onPress={close} style={{ flex: 1 }} />
                </View>
              </View>
            ) : !options || !option ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 10 }}>
                <ActivityIndicator color={NAV.gold} />
                <Txt variant="strong" style={{ color: NAV.dim }}>
                  {origin ? 'Checking live traffic' : 'Finding your location'}
                </Txt>
              </View>
            ) : navigating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt variant="title" numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ color: NAV.gold }}>
                    {formatTime(arrival)} arrival
                  </Txt>
                  <Txt variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: NAV.dim, marginTop: 2 }}>
                    {formatMinutes(remainingS / 60)} · {units.distance(remainingM / 1000)}
                    {liveHazards.length ? ` · ${liveHazards.length} report${liveHazards.length > 1 ? 's' : ''} nearby` : ''}
                  </Txt>
                </View>
                <NeonButton label="End" icon="stop-circle-outline" variant="danger" onDark onPress={stop} />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
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
                        style={({ pressed }) => ({
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 12,
                          paddingHorizontal: 14,
                          borderRadius: radius.md,
                          borderWidth: 1,
                          borderColor: active ? NAV.gold : 'rgba(232,207,148,0.16)',
                          backgroundColor: active ? 'rgba(232,207,148,0.08)' : 'rgba(255,255,255,0.03)',
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        })}
                      >
                        <Ionicons name={o.kind === 'motorway' ? 'speedometer' : 'git-branch'} size={20} color={active ? NAV.gold : NAV.faint} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Txt variant="strong" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: NAV.text }}>
                            {o.kind === 'motorway' ? 'Fastest (motorway)' : 'Standard route'}
                          </Txt>
                          <Txt variant="caption" numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: NAV.faint }}>
                            {o.roads.length ? `Via ${o.roads.slice(0, 3).join(', ')}` : o.kind === 'motorway' ? 'Main roads first' : 'Shortest drive time'}
                          </Txt>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                          <Txt variant="strong" maxFontSizeMultiplier={1.15} style={{ color: active ? NAV.gold : NAV.text }}>
                            {formatMinutes(o.durationS / 60)}
                          </Txt>
                          <Txt variant="caption" maxFontSizeMultiplier={1.15} style={{ color: NAV.faint }}>
                            {units.distance(o.distanceM / 1000)}
                          </Txt>
                        </View>
                      </Pressable>
                    );
                  })}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: live ? NAV.success : NAV.warning }} />
                  <Txt variant="caption" numberOfLines={2} maxFontSizeMultiplier={1.15} style={{ flex: 1, color: live ? NAV.success : NAV.warning }}>
                    {live ? 'Live traffic included' : `${liveError ?? 'Live traffic unavailable'} Showing an estimate.`}
                    {!MAPS_READY ? ' Add a Google Maps key to enable the live map.' : ''}
                  </Txt>
                </View>
                <NeonButton label="Start Navigation" icon="navigate" variant="gold" size="lg" onDark onPress={start} full />
              </View>
            )}
          </NavGlass>
        </View>
      </SafeAreaView>

      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} onPick={onReport} busy={reportBusy} />
      <HazardSheet hazard={openHazard} onClose={() => setOpenHazard(null)} onClear={onClearHazard} busy={clearing} />
    </View>
  );
}

