import type { HazardReport, HazardType } from './hazards';
import type { PreparedRoute } from './nav-progress';
import type { LatLng } from './types';

/** Start warning this far ahead along the route. */
export const HAZARD_ALERT_M = 800;
/** A report further than this from the route line is on another road. */
export const HAZARD_ON_ROUTE_M = 60;
/** Types worth a countdown while driving. */
export const ALERT_TYPES: readonly HazardType[] = ['speed_camera', 'police', 'accident', 'hazard'];

export interface HazardAhead {
  hazard: HazardReport;
  /** Distance along the route from the driver to the report, in metres. */
  distanceM: number;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Projects p onto segment a-b in local metres; returns metres along a-b and distance off it. */
function project(a: LatLng, b: LatLng, p: LatLng): { along: number; off: number; length: number } {
  const k = Math.cos(rad((a.lat + b.lat) / 2));
  const bx = rad(b.lng - a.lng) * k * R;
  const by = rad(b.lat - a.lat) * R;
  const px = rad(p.lng - a.lng) * k * R;
  const py = rad(p.lat - a.lat) * R;
  const len2 = bx * bx + by * by;
  const t = len2 > 0 ? Math.max(0, Math.min(1, (px * bx + py * by) / len2)) : 0;
  const dx = px - t * bx;
  const dy = py - t * by;
  const length = Math.sqrt(len2);
  return { along: t * length, off: Math.sqrt(dx * dx + dy * dy), length };
}

/**
 * Where the driver is along the line, in metres from the start, projected onto
 * the segments either side of their nearest vertex.
 */
export function positionAlong(route: PreparedRoute, vertex: number, here: LatLng): number {
  const g = route.geometry;
  if (g.length < 2) return 0;
  const pt = (i: number): LatLng => ({ lat: g[i][1], lng: g[i][0] });
  let best = { off: Infinity, at: route.cumulative[vertex] ?? 0 };
  for (const i of [vertex - 1, vertex]) {
    if (i < 0 || i >= g.length - 1) continue;
    const s = project(pt(i), pt(i + 1), here);
    if (s.off < best.off) best = { off: s.off, at: route.cumulative[i] + s.along };
  }
  return best.at;
}

/**
 * The closest live report on the road ahead within HAZARD_ALERT_M, measured
 * along the route (so a camera on a parallel road or behind the driver never
 * counts). Returns null once the driver has passed it.
 */
export function nextHazardAhead(route: PreparedRoute, vertex: number, here: LatLng, hazards: HazardReport[], maxAheadM = HAZARD_ALERT_M): HazardAhead | null {
  const g = route.geometry;
  if (g.length < 2 || hazards.length === 0) return null;
  const start = positionAlong(route, vertex, here);
  const pt = (i: number): LatLng => ({ lat: g[i][1], lng: g[i][0] });
  let found: HazardAhead | null = null;
  for (const h of hazards) {
    if (!ALERT_TYPES.includes(h.hazard_type)) continue;
    const p = { lat: h.latitude, lng: h.longitude };
    let best: { off: number; at: number } | null = null;
    // Walk forward from just behind the driver to the end of the alert window.
    for (let i = Math.max(0, vertex - 1); i < g.length - 1; i++) {
      if (route.cumulative[i] - start > maxAheadM) break;
      const s = project(pt(i), pt(i + 1), p);
      if (s.off <= HAZARD_ON_ROUTE_M && (!best || s.off < best.off)) best = { off: s.off, at: route.cumulative[i] + s.along };
    }
    if (!best) continue;
    const distanceM = best.at - start;
    if (distanceM <= 5 || distanceM > maxAheadM) continue;
    if (!found || distanceM < found.distanceM) found = { hazard: h, distanceM };
  }
  return found;
}
