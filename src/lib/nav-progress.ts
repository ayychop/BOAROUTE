import type { LngLat, NavStep } from '../../supabase/functions/_shared/route-analysis';
import { haversineKm } from './geo';
import type { LatLng } from './types';

/** Further than this from the line counts as off route. */
export const OFF_ROUTE_M = 120;
/** Spoken heads-up before a turn. */
export const PREWARN_M = 300;
/** Within this of the destination counts as arrived. */
export const ARRIVED_M = 40;

const toLatLng = ([lng, lat]: LngLat): LatLng => ({ lat, lng });
const metres = (a: LatLng, b: LatLng) => haversineKm(a, b) * 1000;

export interface PreparedRoute {
  geometry: LngLat[];
  /** Distance from the start of the line to each vertex, in metres. */
  cumulative: number[];
  totalM: number;
  steps: NavStep[];
  /** Index of the geometry vertex where each step's manoeuvre happens. */
  stepVertex: number[];
}

function nearestVertex(geometry: LngLat[], p: LatLng, from = 0, to = geometry.length): { index: number; distanceM: number } {
  let index = from;
  let best = Infinity;
  for (let i = from; i < to; i++) {
    const d = metres(p, toLatLng(geometry[i]));
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return { index, distanceM: best };
}

/** Precomputes distances so progress updates are cheap on every GPS fix. */
export function prepareRoute(geometry: LngLat[], steps: NavStep[]): PreparedRoute {
  const cumulative = [0];
  for (let i = 1; i < geometry.length; i++) cumulative.push(cumulative[i - 1] + metres(toLatLng(geometry[i - 1]), toLatLng(geometry[i])));
  // Steps are in order, so each manoeuvre is searched for after the previous one.
  let cursor = 0;
  const stepVertex = steps.map((s) => {
    const { index } = nearestVertex(geometry, toLatLng(s.location), cursor);
    cursor = index;
    return index;
  });
  return { geometry, cumulative, totalM: cumulative[cumulative.length - 1] ?? 0, steps, stepVertex };
}

export interface NavProgress {
  /** Vertex the driver is nearest to. */
  vertex: number;
  offRouteM: number;
  offRoute: boolean;
  remainingM: number;
  /** Next manoeuvre ahead, if any. */
  nextStep: NavStep | null;
  nextStepIndex: number;
  distanceToNextM: number;
  arrived: boolean;
}

/**
 * Where the driver is along the route. Searches forward from the last known
 * vertex (with a little slack backwards) so a road passing near an earlier
 * part of the route does not snap progress back.
 */
export function progressAt(route: PreparedRoute, p: LatLng, lastVertex = 0): NavProgress {
  const n = route.geometry.length;
  if (n === 0) {
    return { vertex: 0, offRouteM: 0, offRoute: false, remainingM: 0, nextStep: null, nextStepIndex: -1, distanceToNextM: 0, arrived: true };
  }
  const from = Math.max(0, lastVertex - 5);
  let near = nearestVertex(route.geometry, p, from);
  // Lost the thread (for example after a reroute or a tunnel): search the whole line.
  if (near.distanceM > OFF_ROUTE_M && from > 0) {
    const all = nearestVertex(route.geometry, p);
    if (all.distanceM < near.distanceM) near = all;
  }
  const vertex = near.index;
  const remainingM = Math.max(0, route.totalM - route.cumulative[vertex]);
  // The next manoeuvre is the first one beyond where the driver is now.
  const nextStepIndex = route.stepVertex.findIndex((v) => v > vertex);
  const nextStep = nextStepIndex >= 0 ? route.steps[nextStepIndex] : null;
  const distanceToNextM = nextStep ? Math.max(0, route.cumulative[route.stepVertex[nextStepIndex]] - route.cumulative[vertex]) : remainingM;
  const end = toLatLng(route.geometry[n - 1]);
  return {
    vertex,
    offRouteM: near.distanceM,
    offRoute: near.distanceM > OFF_ROUTE_M,
    remainingM,
    nextStep,
    nextStepIndex,
    distanceToNextM,
    arrived: metres(p, end) <= ARRIVED_M || (remainingM <= ARRIVED_M && near.distanceM <= OFF_ROUTE_M),
  };
}

/** UK road distances: yards up close, miles further out. */
export function formatNavDistance(m: number): string {
  const yards = m * 1.09361;
  if (yards < 50) return 'now';
  if (yards < 400) return `${Math.round(yards / 10) * 10} yd`;
  const miles = m / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** Waypoints still ahead of the driver, used to reroute from where they are. */
export function remainingWaypoints(route: PreparedRoute, waypoints: LatLng[], vertex: number): LatLng[] {
  return waypoints.filter((w) => nearestVertex(route.geometry, w).index > vertex);
}
