import type { LngLat } from '../../supabase/functions/_shared/route-analysis';

/** How often the navigator asks again for live traffic while driving. */
export const TRAFFIC_REFRESH_MS = 3 * 60_000;
/** A different route must save at least this many seconds... */
export const MIN_SAVING_S = 120;
/** ...and at least this share of the time left, so near-equal routes never flip back and forth. */
export const MIN_SAVING_SHARE = 0.1;
/** Candidate points within this of the current line count as the same road. */
const SAME_ROAD_M = 70;
/** Share of a candidate that must sit on the current line to be "the same route". */
const SAME_ROUTE_SHARE = 0.9;
/** Fewer than this left and a change is pointless. */
const MIN_REMAINING_M = 600;
const MAX_SAMPLES = 300;
const EARTH_R = 6_371_000;

export interface RouteLine {
  geometry: LngLat[];
  durationS: number;
}

/** Metres from p to the segment a-b (small areas, so a flat projection is plenty). */
function distanceToSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180)) * (Math.PI / 180) * EARTH_R;
  const m = (Math.PI / 180) * EARTH_R;
  const bx = (b[0] - a[0]) * k;
  const by = (b[1] - a[1]) * m;
  const px = (p[0] - a[0]) * k;
  const py = (p[1] - a[1]) * m;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

function distanceToLineM(p: LngLat, line: LngLat[]): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) best = Math.min(best, distanceToSegmentM(p, line[i], line[i + 1]));
  return best;
}

/** True when the candidate follows (almost entirely) the same roads as the line the driver is on. */
export function followsLine(candidate: LngLat[], line: LngLat[]): boolean {
  if (candidate.length < 2 || line.length < 2) return false;
  const stride = Math.max(1, Math.ceil(candidate.length / MAX_SAMPLES));
  let total = 0;
  let near = 0;
  for (let i = 0; i < candidate.length; i += stride) {
    total++;
    if (distanceToLineM(candidate[i], line) <= SAME_ROAD_M) near++;
  }
  return near / total >= SAME_ROUTE_SHARE;
}

export type TrafficVerdict =
  /** Carry on: the current route is still the best, or the gain is too small to bother with. */
  | { action: 'keep' }
  /** A clearly quicker route exists. */
  | { action: 'switch'; reason: 'faster'; savingS: number }
  /** The road the driver is on is no longer among the live options (a closure, or much worse traffic). */
  | { action: 'switch'; reason: 'unavailable' };

/**
 * Compares fresh live-traffic routes with the road the driver is on.
 *
 * `remainingLine` is what is left of the current route and `remainingM` its length;
 * `candidates` are the fresh options from the driver's position; `preferred` is the
 * one they would be given (their chosen kind). Traffic-aware results already
 * account for any closure Google knows about, so when the current road has dropped
 * out of them the driver is moved to the preferred route.
 */
export function assessTraffic(remainingLine: LngLat[], remainingM: number, candidates: RouteLine[], preferred: RouteLine | null): TrafficVerdict {
  if (!preferred || remainingM < MIN_REMAINING_M || remainingLine.length < 2) return { action: 'keep' };
  if (followsLine(preferred.geometry, remainingLine)) return { action: 'keep' };

  const same = candidates.find((c) => followsLine(c.geometry, remainingLine));
  if (!same) return { action: 'switch', reason: 'unavailable' };

  const savingS = same.durationS - preferred.durationS;
  if (savingS >= MIN_SAVING_S && savingS >= same.durationS * MIN_SAVING_SHARE) return { action: 'switch', reason: 'faster', savingS };
  return { action: 'keep' };
}
