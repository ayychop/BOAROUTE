import type { LatLng } from './types';

/**
 * Where routes start: home (default), wherever the phone is, a store on the
 * patch, or any address. Set in Go Anywhere; the Route tab plans from it too.
 */
export type StartPoint =
  | { kind: 'home' }
  | { kind: 'here' }
  | { kind: 'store'; storeId: string }
  | { kind: 'custom'; label: string; lat: number; lng: number };

export const START_PREF = 'route.start';
/** Older builds kept only a store id here. */
export const LEGACY_START_STORE_PREF = 'route.startStore';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function parseStartPoint(raw: string | null | undefined, legacyStoreId?: string | null): StartPoint {
  if (raw) {
    try {
      const v = JSON.parse(raw) as Partial<StartPoint> & Record<string, unknown>;
      if (v.kind === 'home' || v.kind === 'here') return { kind: v.kind };
      if (v.kind === 'store' && typeof v.storeId === 'string' && v.storeId) return { kind: 'store', storeId: v.storeId };
      if (v.kind === 'custom' && typeof v.label === 'string' && finite(v.lat) && finite(v.lng) && Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180) {
        return { kind: 'custom', label: v.label.slice(0, 120), lat: v.lat, lng: v.lng };
      }
    } catch {
      // Fall through to the default.
    }
  }
  return legacyStoreId ? { kind: 'store', storeId: legacyStoreId } : { kind: 'home' };
}

/** Short words for the start row: "Home · HP13 6BU", "Current location", "Tesco Reading". */
export function startPointLabel(p: StartPoint, ctx: { homeLabel?: string | null; storeName?: string | null }): string {
  switch (p.kind) {
    case 'home':
      return ctx.homeLabel ? `Home · ${ctx.homeLabel}` : 'Home';
    case 'here':
      return 'Current location';
    case 'store':
      return ctx.storeName ?? 'A store';
    case 'custom':
      return p.label;
  }
}

/** The map point to plan from, or null while it is still unknown (home not geocoded, no GPS fix). */
export function resolveStartPoint(p: StartPoint, ctx: { home: LatLng | null; here: LatLng | null; store: LatLng | null }): LatLng | null {
  switch (p.kind) {
    case 'home':
      return ctx.home;
    case 'here':
      return ctx.here;
    case 'store':
      return ctx.store ?? ctx.home;
    case 'custom':
      return { lat: p.lat, lng: p.lng };
  }
}
