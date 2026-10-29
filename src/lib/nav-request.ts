import type { RouteKind } from '../../supabase/functions/_shared/route-analysis';
import type { LatLng } from './types';

const ROUTE_KINDS: readonly RouteKind[] = ['recommended', 'standard', 'motorway', 'shortest', 'alternative'];

export interface NavDestination extends LatLng {
  label: string;
}

export interface NavRequest {
  /** Start from the device's current position, or from a fixed point (home). */
  from: 'here' | NavDestination;
  /** Stops in order; the last one is the destination. */
  to: NavDestination[];
  /** Option to start on. Recommended (country roads avoided) unless the person picked another. */
  prefer: RouteKind;
  /** Which of several options of the same kind (alternatives), by position in the list. */
  optionIndex?: number;
  title: string;
}

/** Live routing accepts up to 12 points including the start. */
export const MAX_NAV_STOPS = 11;

const validPoint = (p: unknown): p is NavDestination => {
  const v = p as NavDestination;
  return (
    !!v &&
    typeof v.lat === 'number' &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lat) &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lat) <= 90 &&
    Math.abs(v.lng) <= 180 &&
    typeof v.label === 'string'
  );
};

/** Serialises a request into a single router param. */
export function encodeNavRequest(req: NavRequest): string {
  return JSON.stringify({ ...req, to: req.to.slice(0, MAX_NAV_STOPS) });
}

/** Parses the router param back, or null if it is missing or malformed. */
export function decodeNavRequest(raw: string | string[] | undefined): NavRequest | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<NavRequest>;
    const from = v.from === 'here' ? 'here' : validPoint(v.from) ? v.from : null;
    const to = Array.isArray(v.to) ? v.to.filter(validPoint).slice(0, MAX_NAV_STOPS) : [];
    if (!from || to.length === 0) return null;
    return {
      from,
      to,
      prefer: ROUTE_KINDS.includes(v.prefer as RouteKind) ? (v.prefer as RouteKind) : 'recommended',
      ...(typeof v.optionIndex === 'number' && Number.isInteger(v.optionIndex) && v.optionIndex >= 0 && v.optionIndex < 8 ? { optionIndex: v.optionIndex } : {}),
      title: typeof v.title === 'string' && v.title.trim() ? v.title.trim() : to[to.length - 1].label,
    };
  } catch {
    return null;
  }
}
