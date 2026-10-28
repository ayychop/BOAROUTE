import type { LngLat } from '../../supabase/functions/_shared/route-analysis';
import type { HazardReport } from '@/lib/hazards';
import type { LatLng } from '@/lib/types';

/**
 * What the Android Auto screen shows, as plain data for the native car module
 * (modules/boaroute-car). The native side draws it as a NavigationTemplate:
 * BOAROUTE's map with the route, the car and nearby cameras; the next turn or
 * the visit countdown; and one big Start Visit or End Visit button. When
 * another app (Waze) has the map, the car's side panel shows the media entry
 * instead: the same status, Start / End Visit and the upcoming stores. Pure, so
 * it is tested without a head unit.
 */

export interface CarNavState {
  /** Route title from the phone, e.g. "Tuesday route". */
  title: string;
  /** Next manoeuvre, already worded for speech and the phone banner. */
  instruction: string | null;
  /** Metres to that manoeuvre. */
  distanceToNextM: number | null;
  /** Epoch ms of the arrival estimate. */
  arrivalMs: number;
  remainingM: number;
  remainingS: number;
  /** Stores still to visit, in order; the last is the destination. */
  stops: string[];
  arrived: boolean;
  rerouting: boolean;
}

/** A store still owed visits. */
export interface CarStore {
  id: string;
  name: string;
}

/** What the phone knows about the person's stores, beyond the live route. */
export interface CarContext {
  /** Stores to visit next, most pressing first. */
  upcoming: CarStore[];
  /** Store id by name, so the next route stop can be started from the car. */
  storeIds: Record<string, string>;
  /** The visit running now. */
  visit: { storeName: string; startedAt: string } | null;
  /** Minimum visit length (the 25-minute lock). */
  lockMs: number;
}

export const EMPTY_CAR_CONTEXT: CarContext = { upcoming: [], storeIds: {}, visit: null, lockMs: 0 };

export interface CarHazard {
  lat: number;
  lng: number;
  type: 'speed_camera' | 'police';
}

export interface CarPosition {
  lat: number;
  lng: number;
  heading: number | null;
}

/** The JSON BoarouteCarModule.setState takes (parsed in CarState.kt). */
export interface CarDisplayState {
  route: (Omit<CarNavState, 'stops'> & { nextStop: string | null }) | null;
  visit: { storeName: string; startedAtMs: number; lockMs: number } | null;
  /** What Start Visit starts; null while a visit runs or with nothing to start. */
  start: { storeId: string; storeName: string } | null;
  metric: boolean;
  position: CarPosition | null;
  hazards: CarHazard[];
  /** One-line summary of the open group lunch order, or null. */
  lunch: string | null;
  /**
   * The stores ahead, listed on the car's side panel: the route's remaining
   * stops while navigating (storeId null for a stop that is not a store),
   * else the most pressing stores.
   */
  upcoming: { storeId: string | null; name: string }[];
}

/** The side panel has room for a short list; the head unit may cut it shorter. */
const MAX_UPCOMING = 8;

function upcomingStores(nav: CarNavState | null, ctx: CarContext): CarDisplayState['upcoming'] {
  const list = nav && nav.stops.length > 0
    ? nav.stops.map((name) => ({ storeId: ctx.storeIds[name] ?? null, name }))
    : ctx.upcoming.map((s) => ({ storeId: s.id, name: s.name }));
  return list.slice(0, MAX_UPCOMING);
}

/** Start Visit goes to the next stop on the route, else the most pressing store. */
function startTarget(nav: CarNavState | null, ctx: CarContext): CarDisplayState['start'] {
  if (ctx.visit) return null;
  const next = nav?.stops[0];
  if (next && ctx.storeIds[next]) return { storeId: ctx.storeIds[next], storeName: next };
  const first = ctx.upcoming[0];
  return first ? { storeId: first.id, storeName: first.name } : null;
}

export function carDisplayState(
  nav: CarNavState | null,
  ctx: CarContext,
  extra: { metric: boolean; position: CarPosition | null; hazards: CarHazard[]; lunch?: string | null },
): CarDisplayState {
  const startedAtMs = ctx.visit ? new Date(ctx.visit.startedAt).getTime() : NaN;
  return {
    route: nav
      ? {
          title: nav.title,
          instruction: nav.instruction,
          distanceToNextM: nav.distanceToNextM,
          arrivalMs: nav.arrivalMs,
          remainingM: nav.remainingM,
          remainingS: nav.remainingS,
          nextStop: nav.stops[0] ?? null,
          arrived: nav.arrived,
          rerouting: nav.rerouting,
        }
      : null,
    visit: ctx.visit && Number.isFinite(startedAtMs) ? { storeName: ctx.visit.storeName, startedAtMs, lockMs: ctx.lockMs } : null,
    start: startTarget(nav, ctx),
    ...extra,
    lunch: extra.lunch ?? null,
    upcoming: upcomingStores(nav, ctx),
  };
}

/** The car map needs the shape, not every vertex: keep at most `max` points, always the last. */
export function carPath(geometry: LngLat[], max = 400): number[] {
  if (geometry.length === 0) return [];
  const step = Math.max(1, Math.ceil(geometry.length / max));
  const out: number[] = [];
  for (let i = 0; i < geometry.length; i += step) out.push(geometry[i][1], geometry[i][0]);
  const last = geometry[geometry.length - 1];
  if ((geometry.length - 1) % step !== 0) out.push(last[1], last[0]);
  return out;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Live cameras and police within `radiusM`, nearest first, at most `max` for the car map. */
export function carHazards(hazards: HazardReport[], here: LatLng | null, radiusM = 15_000, max = 40): CarHazard[] {
  const near = hazards
    .filter((h): h is HazardReport & { hazard_type: CarHazard['type'] } => h.hazard_type === 'speed_camera' || h.hazard_type === 'police')
    .map((h) => {
      const d = here ? R * Math.hypot(rad(h.longitude - here.lng) * Math.cos(rad(here.lat)), rad(h.latitude - here.lat)) : 0;
      return { h, d };
    })
    .filter(({ d }) => d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, max);
  return near.map(({ h }) => ({ lat: h.latitude, lng: h.longitude, type: h.hazard_type }));
}
