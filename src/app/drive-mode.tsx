import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRLogo } from '@/components/BRLogo';
import { Txt } from '@/components/Txt';
import { VisitLimitModal } from '@/components/VisitLimitModal';
import { useNow } from '@/hooks/useNow';
import { ARRIVED_M, burnInOffset, clockButtonState, nearestStores } from '@/lib/drive-mode';
import type { LatLng } from '@/lib/types';
import { isVisitLimitError } from '@/lib/visit-limits';
import { formatDuration } from '@/lib/visit-timer';
import { useData } from '@/providers/DataProvider';
import { openEmail, openSpotify, openWaze } from '@/services/drive';
import { hasBackgroundAlertsPermission, isHazardWatchRunning, startHazardWatch } from '@/services/hazard-watch';

const GOLD = '#E8CF94';
const GOLD_DEEP = '#CDA960';
const INK = 'rgba(245,240,230,0.92)';
const DIM = 'rgba(245,240,230,0.55)';

function useHere(): LatLng | null {
  const [here, setHere] = useState<LatLng | null>(null);
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      if (!perm.granted || cancelled) return;
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (last && !cancelled) setHere({ lat: last.coords.latitude, lng: last.coords.longitude });
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 50, timeInterval: 15_000 }, (fix) =>
        setHere({ lat: fix.coords.latitude, lng: fix.coords.longitude }),
      );
      if (cancelled) sub.remove();
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);
  return here;
}

/**
 * Screen Saver: what's left on screen after handing the drive to Waze. Pure
 * black (OLED pixels off), the BR crest breathing in gold, a huge Clock In /
 * Clock Out tied to the same visit as the store page, and one-tap Spotify,
 * Waze and Email. Voice alerts keep running from the hazard service.
 */
export default function DriveMode() {
  useKeepAwake('drive-mode');
  const params = useLocalSearchParams<{ storeId?: string }>();
  const { stores, myStores, activeVisit, startVisit, completeVisit, visitsLeftThisWeek } = useData();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const now = useNow(1000);
  const here = useHere();
  const [picked, setPicked] = useState<string | null>(params.storeId ?? null);
  const [busy, setBusy] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [alertsOn, setAlertsOn] = useState(isHazardWatchRunning());

  useEffect(() => {
    const id = setInterval(() => setAlertsOn(isHazardWatchRunning()), 5000);
    return () => clearInterval(id);
  }, []);

  const nearby = useMemo(() => nearestStores(here, myStores.length ? myStores : stores, 6), [here, myStores, stores]);
  // Arriving at a store picks it, unless the person chose one themselves.
  const autoStore = nearby[0]?.distanceM != null && nearby[0].distanceM <= ARRIVED_M ? nearby[0].store.id : null;
  const storeId = activeVisit?.storeId ?? picked ?? autoStore;
  const store = storeId ? stores.find((s) => s.id === storeId) ?? null : null;
  const activeStore = activeVisit ? stores.find((s) => s.id === activeVisit.storeId) ?? null : null;

  const state = clockButtonState({
    activeVisit,
    storeId,
    storeName: store?.name ?? null,
    activeStoreName: activeStore?.name ?? null,
    visitsLeft: storeId ? visitsLeftThisWeek(storeId) : Infinity,
    now,
  });

  const onClock = async () => {
    if (busy) return;
    if (state.kind === 'pick') return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    if (state.kind === 'limit') return setLimitOpen(true);
    if (state.kind === 'locked') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setBusy(true);
    try {
      if (state.kind === 'start' && storeId) {
        await startVisit(storeId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else if (state.kind === 'complete') {
        const { minutes } = await completeVisit();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setPicked(null);
        Alert.alert('Clocked out', `${formatDuration(minutes)} on site. Visit saved.`);
      }
    } catch (e) {
      if (isVisitLimitError(e)) setLimitOpen(true);
      else Alert.alert(state.kind === 'start' ? 'Could not clock in' : 'Could not clock out', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const turnOnAlerts = async () => {
    Haptics.selectionAsync().catch(() => {});
    const ok = await startHazardWatch({ prompt: true });
    setAlertsOn(ok);
    if (!ok && !(await hasBackgroundAlertsPermission())) {
      Alert.alert('Allow location', 'Speed camera alerts need location allowed for BOAROUTE ("While using the app" is enough), so they keep playing while Waze is open.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open settings', onPress: () => Linking.openSettings().catch(() => {}) },
      ]);
    }
  };

  const minute = Math.floor(now / 60_000);
  const drift = burnInOffset(minute);
  const clock = new Date(now).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const logoSize = Math.min(landscape ? height * 0.34 : width * 0.42, 220);
  const buttonSize = Math.min(landscape ? height * 0.52 : width * 0.68, 300);

  const crest = (
    <View style={{ alignItems: 'center', transform: [{ translateX: drift.x }, { translateY: drift.y }] }}>
      <GlowHalo size={logoSize} />
      <BRLogo size={logoSize} animated glow />
      <Txt style={styles.clock} accessibilityRole="header">
        {clock}
      </Txt>
      <Txt variant="label" style={{ color: DIM, marginTop: 2 }}>
        BOA ROUTE · Drive mode
      </Txt>
    </View>
  );

  const controls = (
    <View style={{ alignItems: 'center', gap: 18, flexShrink: 1 }}>
      <ClockButton size={buttonSize} state={state} busy={busy} onPress={onClock} />
      {!activeVisit && nearby.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }} style={{ maxWidth: Math.max(width * (landscape ? 0.5 : 1) - 24, 200), flexGrow: 0 }}>
          {nearby.map(({ store: s, distanceM }) => {
            const on = s.id === storeId;
            return (
              <Pressable
                key={s.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setPicked(s.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.storeChip, on && { borderColor: GOLD, backgroundColor: 'rgba(232,207,148,0.12)' }]}
              >
                <Txt variant="strong" numberOfLines={1} style={{ color: on ? GOLD : INK, maxWidth: 180 }}>
                  {s.name}
                </Txt>
                {distanceM != null && (
                  <Txt variant="caption" style={{ color: DIM }}>
                    {distanceM < 1000 ? `${Math.round(distanceM / 10) * 10} m` : `${(distanceM / 1609.344).toFixed(1)} mi`}
                  </Txt>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <View style={styles.shortcuts}>
        <Shortcut icon="musical-notes" label="Spotify" color="#1DB954" onPress={openSpotify} />
        <Shortcut icon="navigate" label="Waze" color="#33CCFF" onPress={() => openWaze(store?.latitude != null && store.longitude != null ? { lat: store.latitude, lng: store.longitude } : undefined)} />
        <Shortcut icon="mail" label="Email" color={GOLD} onPress={openEmail} />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
      <StatusBar style="light" hidden />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Leave drive mode" style={styles.exit}>
          <Ionicons name="chevron-down" size={22} color={DIM} />
        </Pressable>
        {alertsOn ? (
          <View style={styles.alertPill} accessibilityLabel="Voice alerts on">
            <View style={[styles.dot, { backgroundColor: '#4CD07D' }]} />
            <Txt variant="caption" style={{ color: DIM }}>
              Camera & police alerts on
            </Txt>
          </View>
        ) : (
          <Pressable onPress={turnOnAlerts} accessibilityRole="button" style={[styles.alertPill, { borderColor: 'rgba(229,54,59,0.6)' }]}>
            <View style={[styles.dot, { backgroundColor: '#E5363B' }]} />
            <Txt variant="caption" style={{ color: INK }}>
              Voice alerts off while Waze is open · Turn on
            </Txt>
          </Pressable>
        )}
      </View>
      <View style={[styles.body, landscape && { flexDirection: 'row', justifyContent: 'space-around' }]}>
        {crest}
        {controls}
      </View>
      <VisitLimitModal open={limitOpen} onClose={() => setLimitOpen(false)} footnote="Your visits here unlock again on Monday." />
    </View>
  );
}

function GlowHalo({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [reduced, t]);
  const halo = useAnimatedStyle(() => ({ opacity: 0.18 + t.get() * 0.32, transform: [{ scale: 1.05 + t.get() * 0.12 }] }));
  const d = size * 1.25;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: -size * 0.1, width: d, height: d, borderRadius: d / 2, backgroundColor: 'rgba(205,169,96,0.22)', shadowColor: GOLD_DEEP, shadowOpacity: 1, shadowRadius: 40, shadowOffset: { width: 0, height: 0 } },
        halo,
      ]}
    />
  );
}

function ClockButton({ size, state, busy, onPress }: { size: number; state: ReturnType<typeof clockButtonState>; busy: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const out = state.kind === 'locked' || state.kind === 'complete';
  const ready = state.kind === 'start' || state.kind === 'complete';
  const ring = state.kind === 'limit' ? '#E5363B' : ready ? GOLD : 'rgba(232,207,148,0.35)';
  return (
    <Animated.View entering={FadeIn.duration(400)} style={press}>
      <Pressable
        onPress={onPress}
        onPressIn={() => scale.set(withSpring(0.95, { damping: 16, stiffness: 320 }))}
        onPressOut={() => scale.set(withSpring(1, { damping: 12, stiffness: 260 }))}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${state.label}. ${state.sub}`}
        accessibilityState={{ disabled: busy || state.kind === 'locked' || state.kind === 'pick', busy }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 3,
          borderColor: ring,
          backgroundColor: ready ? 'rgba(232,207,148,0.10)' : 'rgba(255,255,255,0.03)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          shadowColor: ring,
          shadowOpacity: ready ? 0.9 : 0.3,
          shadowRadius: 30,
          shadowOffset: { width: 0, height: 0 },
          elevation: ready ? 12 : 0,
        }}
      >
        <Ionicons name={out ? 'log-out-outline' : 'log-in-outline'} size={size * 0.2} color={ring} />
        <Txt style={{ color: ready ? GOLD : INK, fontSize: size * 0.13, lineHeight: size * 0.16, fontWeight: '800', letterSpacing: 1 }}>{busy ? '…' : state.label}</Txt>
        <Txt variant="caption" align="center" numberOfLines={2} style={{ color: DIM, marginTop: 4 }}>
          {state.sub}
        </Txt>
      </Pressable>
    </Animated.View>
  );
}

function Shortcut({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`Open ${label}`}
      style={({ pressed }) => [styles.shortcut, pressed && { backgroundColor: 'rgba(255,255,255,0.08)' }]}
    >
      <Ionicons name={icon} size={30} color={color} />
      <Txt variant="caption" style={{ color: INK, marginTop: 6 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  exit: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  alertPill: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  clock: { color: INK, fontSize: 44, lineHeight: 52, fontWeight: '200', marginTop: 12, fontVariant: ['tabular-nums'] },
  storeChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
  shortcuts: { flexDirection: 'row', gap: 14 },
  shortcut: { width: 92, height: 84, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
});
