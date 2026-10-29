import * as Location from 'expo-location';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPref, setPref } from '@/lib/prefs';
import { LEGACY_START_STORE_PREF, START_PREF, parseStartPoint, type StartPoint } from '@/lib/start-point';
import type { LatLng } from '@/lib/types';

let current: StartPoint | null = null;
const listeners = new Set<() => void>();

function read(): StartPoint {
  current ??= parseStartPoint(getPref(START_PREF), getPref(LEGACY_START_STORE_PREF));
  return current;
}

export function setStartPoint(p: StartPoint) {
  current = p;
  setPref(START_PREF, JSON.stringify(p));
  setPref(LEGACY_START_STORE_PREF, null);
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The shared route start (Go Anywhere sets it, the Route tab reads it), kept on the device. */
export function useStartPoint(): StartPoint {
  return useSyncExternalStore(subscribe, read, read);
}

/** The phone's position, only while `enabled` (starting from "Current location"). */
export function useCurrentPoint(enabled: boolean): { point: LatLng | null; error: string | null } {
  const [state, setState] = useState<{ point: LatLng | null; error: string | null }>({ point: null, error: null });
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) throw new Error('Allow location to start from where you are.');
      const fix = (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
      if (alive) setState({ point: { lat: fix.coords.latitude, lng: fix.coords.longitude }, error: null });
    })().catch((e) => alive && setState({ point: null, error: e instanceof Error ? e.message : 'Could not find your location.' }));
    return () => {
      alive = false;
    };
  }, [enabled]);
  return enabled ? state : { point: null, error: null };
}
