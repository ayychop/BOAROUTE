import type { LngLat, RouteOption, RouteOptionsResult } from '../../supabase/functions/_shared/route-analysis';
import { estimateDrive } from './geo';
import type { LatLng } from './types';

/**
 * Offline fallback when live traffic routing is unavailable: straight-line
 * estimates, standard route only, clearly flagged as an estimate.
 */
export function estimateRouteOptions(points: LatLng[], now = new Date()): RouteOptionsResult {
  const legs = points.slice(1).map((to, i) => {
    const d = estimateDrive(points[i], to);
    return { durationS: d.minutes * 60, typicalDurationS: d.minutes * 60, distanceM: d.km * 1000, via: null };
  });
  const geometry: LngLat[] = points.map((p) => [p.lng, p.lat]);
  const base: Omit<RouteOption, 'kind' | 'available'> = {
    durationS: legs.reduce((a, l) => a + l.durationS, 0),
    typicalDurationS: legs.reduce((a, l) => a + l.typicalDurationS, 0),
    distanceM: legs.reduce((a, l) => a + l.distanceM, 0),
    fastRoadShare: 0,
    minorShare: 0,
    roads: [],
    legs,
    geometry,
    steps: [],
  };
  return {
    source: 'estimate',
    motorway: { ...base, kind: 'motorway', available: false },
    standard: { ...base, kind: 'standard', available: true },
    identical: true,
    // Estimates carry no road mix, so they never flag a closure.
    forcedMinorRoads: false,
    generatedAt: now.toISOString(),
  };
}
