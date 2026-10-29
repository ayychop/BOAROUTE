import { formatCountdown, lockRemainingMs, type ActiveVisit } from './visit-timer';
import type { LatLng } from './types';

export type ClockState =
  /** No store chosen yet. */
  | { kind: 'pick'; label: string; sub: string }
  /** Ready to clock in at the chosen store. */
  | { kind: 'start'; label: string; sub: string }
  /** OM weekly limit used up at this store. */
  | { kind: 'limit'; label: string; sub: string }
  /** Clocked in, inside the 25-minute minimum. */
  | { kind: 'locked'; label: string; sub: string; remainingMs: number }
  /** Clocked in, free to clock out. */
  | { kind: 'complete'; label: string; sub: string };

/**
 * What the Screen Saver's big button does right now. It mirrors the store
 * page exactly: the same active visit, the same 25-minute lock and the same
 * weekly limit, so clocking in from either place is the same visit.
 */
export function clockButtonState(params: {
  activeVisit: ActiveVisit | null;
  storeId: string | null;
  storeName: string | null;
  activeStoreName: string | null;
  visitsLeft: number;
  now: number;
}): ClockState {
  const { activeVisit, storeId, storeName, activeStoreName, visitsLeft, now } = params;
  if (activeVisit) {
    const remainingMs = lockRemainingMs(activeVisit.startedAt, now);
    const at = activeStoreName ?? 'this store';
    if (remainingMs > 0) return { kind: 'locked', label: 'Clock Out', sub: `${at} · unlocks in ${formatCountdown(remainingMs)}`, remainingMs };
    return { kind: 'complete', label: 'Clock Out', sub: at };
  }
  if (!storeId) return { kind: 'pick', label: 'Clock In', sub: 'Choose your store below' };
  if (visitsLeft <= 0) return { kind: 'limit', label: 'Clock In', sub: `${storeName ?? 'This store'} · weekly limit reached` };
  return { kind: 'start', label: 'Clock In', sub: storeName ?? 'Your store' };
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function metresBetween(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Arrived: within this of a store, the Screen Saver picks it on its own. */
export const ARRIVED_M = 400;

/** Stores with coordinates, nearest first, with their distance in metres. */
export function nearestStores<T extends { latitude: number | null; longitude: number | null }>(here: LatLng | null, stores: T[], limit = 6): { store: T; distanceM: number | null }[] {
  const located = stores.filter((s) => s.latitude != null && s.longitude != null);
  if (!here) return located.slice(0, limit).map((store) => ({ store, distanceM: null }));
  return located
    .map((store) => ({ store, distanceM: metresBetween(here, { lat: store.latitude!, lng: store.longitude! }) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}

/**
 * Slow drift for the logo so a phone left on the dash all day never burns
 * the same pixels in. Returns an offset in points for a given minute.
 */
export function burnInOffset(minute: number, range = 18): { x: number; y: number } {
  const t = minute / 7;
  return { x: Math.round(Math.sin(t) * range), y: Math.round(Math.cos(t * 1.3) * range) };
}
