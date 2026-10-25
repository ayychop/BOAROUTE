import { estimateDrive, haversineKm } from './geo';
import type { GradeTargets, LatLng, Manager, Store } from './types';

export type RoutableStore = Pick<
  Store,
  'id' | 'name' | 'address' | 'grade' | 'assigned_manager' | 'latitude' | 'longitude' | 'last_visit_date'
>;

export interface VisitTally {
  /** Visits this calendar month by the current user. */
  count: number;
  /** Most recent visit by the current user (any month). */
  last: string | null;
}

export interface DueStore<S extends RoutableStore = RoutableStore> {
  store: S;
  target: number;
  done: number;
  remaining: number;
  daysSinceLast: number | null;
  priority: number;
}

export interface RouteStop<S extends RoutableStore = RoutableStore> extends DueStore<S> {
  legKm: number;
  legMinutes: number;
  arriveMinute: number;
}

export interface DayPlan<S extends RoutableStore = RoutableStore> {
  stops: RouteStop<S>[];
  returnLeg: { km: number; minutes: number } | null;
  totalKm: number;
  driveMinutes: number;
  onSiteMinutes: number;
  /** Stores still owed visits this month (in scope, with coordinates). */
  dueCount: number;
  visitsRemaining: number;
  /** Stores in scope that cannot be routed because they lack coordinates. */
  unlocated: S[];
}

export interface PlanOptions {
  maxStops?: number;
  minutesOnSite?: number;
  returnToStart?: boolean;
  now?: Date;
  /** Cost of 1 km away from the anchor store, in priority points. */
  detourWeight?: number;
}

export const DEFAULT_MAX_STOPS = 6;
export const MAX_STOPS_LIMIT = 8;
export const DEFAULT_MINUTES_ON_SITE = 40;

const GRADE_WEIGHT = { A: 4, B: 3, C: 2, D: 1 } as const;
const DAY_MS = 86_400_000;

/** Stores belonging to the managers this person routes (see managersFor). */
export function storesInScope<S extends RoutableStore>(stores: S[], managers: Manager[]): S[] {
  return stores.filter((s) => managers.includes(s.assigned_manager));
}

export function hasCoords(s: RoutableStore): s is RoutableStore & { latitude: number; longitude: number } {
  return typeof s.latitude === 'number' && typeof s.longitude === 'number' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude);
}

export function toLatLng(s: RoutableStore): LatLng {
  return { lat: s.latitude as number, lng: s.longitude as number };
}

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** Scores every store in scope that is still owed visits this month. */
export function computeDue<S extends RoutableStore>(
  stores: S[],
  tallies: Record<string, VisitTally | undefined>,
  targets: GradeTargets,
  now = new Date(),
): DueStore<S>[] {
  const dim = daysInMonth(now);
  const daysLeft = dim - now.getDate() + 1;
  const monthPressure = 1 + (1 - daysLeft / dim); // 1.0 at month start, ~2.0 at month end

  const due: DueStore<S>[] = [];
  for (const store of stores) {
    const target = targets[store.grade] ?? 0;
    const tally = tallies[store.id];
    const done = tally?.count ?? 0;
    const remaining = Math.max(0, target - done);
    if (remaining === 0) continue;

    const last = tally?.last ?? null;
    const daysSinceLast = last ? Math.max(0, Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS)) : null;
    const idealGap = dim / Math.max(1, target);
    const overdue = daysSinceLast === null ? 1.5 : Math.min(3, daysSinceLast / idealGap);
    // Recently visited stores wait for their next slot unless the month is running out.
    const tooSoon = daysSinceLast !== null && daysSinceLast < idealGap * 0.5 && remaining < daysLeft / idealGap ? 0.4 : 1;

    const priority = (remaining * (1 + GRADE_WEIGHT[store.grade] * 0.5) * monthPressure + overdue * 2) * tooSoon;
    due.push({ store, target, done, remaining, daysSinceLast, priority });
  }
  return due.sort((a, b) => b.priority - a.priority || a.store.name.localeCompare(b.store.name));
}

function pathLength(start: LatLng, pts: LatLng[], end: LatLng | null): number {
  let total = 0;
  let prev = start;
  for (const p of pts) {
    total += haversineKm(prev, p);
    prev = p;
  }
  if (end) total += haversineKm(prev, end);
  return total;
}

/** Nearest-neighbour ordering from the start point. */
export function nearestNeighbourOrder<T>(start: LatLng, items: T[], at: (t: T) => LatLng): T[] {
  const left = [...items];
  const out: T[] = [];
  let cur = start;
  while (left.length) {
    let bi = 0;
    let bd = Infinity;
    left.forEach((t, i) => {
      const d = haversineKm(cur, at(t));
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const [next] = left.splice(bi, 1);
    out.push(next);
    cur = at(next);
  }
  return out;
}

/** 2-opt improvement of an ordered path (optionally returning to start). */
export function twoOpt<T>(start: LatLng, order: T[], at: (t: T) => LatLng, returnToStart: boolean): T[] {
  let best = [...order];
  const end = returnToStart ? start : null;
  let bestLen = pathLength(start, best.map(at), end);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const len = pathLength(start, cand.map(at), end);
        if (len + 1e-9 < bestLen) {
          best = cand;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Builds today's route: a tight cluster around the most urgent store, in driving order. */
export function planDayRoute<S extends RoutableStore>(
  stores: S[],
  tallies: Record<string, VisitTally | undefined>,
  targets: GradeTargets,
  start: LatLng,
  options: PlanOptions = {},
): DayPlan<S> {
  const maxStops = Math.max(1, Math.min(MAX_STOPS_LIMIT, options.maxStops ?? DEFAULT_MAX_STOPS));
  const minutesOnSite = options.minutesOnSite ?? DEFAULT_MINUTES_ON_SITE;
  const returnToStart = options.returnToStart ?? true;
  const detourWeight = options.detourWeight ?? 0.08;
  const now = options.now ?? new Date();

  const located = stores.filter(hasCoords);
  const unlocated = stores.filter((s) => !hasCoords(s));
  const due = computeDue(located, tallies, targets, now);

  let chosen: DueStore<S>[] = [];
  if (due.length > 0) {
    const anchor = due[0];
    const anchorPt = toLatLng(anchor.store);
    const rest = due
      .slice(1)
      .map((d) => ({ d, utility: d.priority - detourWeight * haversineKm(anchorPt, toLatLng(d.store)) }))
      .sort((a, b) => b.utility - a.utility)
      .slice(0, maxStops - 1)
      .map((x) => x.d);
    chosen = [anchor, ...rest];
  }

  const at = (d: DueStore<S>) => toLatLng(d.store);
  const ordered = twoOpt(start, nearestNeighbourOrder(start, chosen, at), at, returnToStart);

  const stops: RouteStop<S>[] = [];
  let prev = start;
  let clock = 0;
  let totalKm = 0;
  let driveMinutes = 0;
  for (const d of ordered) {
    const leg = estimateDrive(prev, at(d));
    clock += leg.minutes;
    stops.push({ ...d, legKm: leg.km, legMinutes: leg.minutes, arriveMinute: clock });
    clock += minutesOnSite;
    totalKm += leg.km;
    driveMinutes += leg.minutes;
    prev = at(d);
  }

  let returnLeg: DayPlan<S>['returnLeg'] = null;
  if (returnToStart && stops.length > 0) {
    returnLeg = estimateDrive(prev, start);
    totalKm += returnLeg.km;
    driveMinutes += returnLeg.minutes;
  }

  return {
    stops,
    returnLeg,
    totalKm,
    driveMinutes,
    onSiteMinutes: stops.length * minutesOnSite,
    dueCount: due.length,
    visitsRemaining: due.reduce((a, d) => a + d.remaining, 0),
    unlocated,
  };
}

/** Points sent to the live routing service: start, stops, and optionally back home. */
export function planWaypoints(plan: DayPlan, start: LatLng): LatLng[] {
  const pts = [start, ...plan.stops.map((s) => toLatLng(s.store))];
  if (plan.returnLeg) pts.push(start);
  return pts;
}

export function monthProgress(
  stores: RoutableStore[],
  tallies: Record<string, VisitTally | undefined>,
  targets: GradeTargets,
): { done: number; target: number } {
  let done = 0;
  let target = 0;
  for (const s of stores) {
    const t = targets[s.grade] ?? 0;
    target += t;
    done += Math.min(t, tallies[s.id]?.count ?? 0);
  }
  return { done, target };
}
