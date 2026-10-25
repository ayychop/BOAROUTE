import type { LngLat, RouteOption } from '../../supabase/functions/_shared/route-analysis';
import type { LatLng } from './types';

/** Google Maps accepts up to 9 waypoints in a directions link. */
export const MAX_WAYPOINTS = 9;

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const fromLngLat = ([lng, lat]: LngLat): LatLng => ({ lat, lng });

export interface NavRequest {
  /** start, every stop, then the final destination (home again or the last stop). */
  points: LatLng[];
  /** Via points per leg (index i = leg from points[i] to points[i + 1]). */
  vias?: (LngLat | null)[];
}

/**
 * Builds a Google Maps driving link. Stops always come first; via points are
 * added for the longest legs until the waypoint limit is reached.
 */
export function buildDirectionsUrl({ points, vias = [] }: NavRequest): string {
  if (points.length < 2) throw new Error('Need at least an origin and a destination');
  const origin = points[0];
  const destination = points[points.length - 1];
  const stops = points.slice(1, -1);

  const budget = Math.max(0, MAX_WAYPOINTS - stops.length);
  const viaLegs = vias
    .map((v, leg) => ({ v, leg }))
    .filter((x): x is { v: LngLat; leg: number } => !!x.v)
    .slice(0, budget)
    .map((x) => x.leg);

  const waypoints: string[] = [];
  for (let leg = 0; leg < points.length - 1; leg++) {
    const via = vias[leg];
    if (via && viaLegs.includes(leg)) waypoints.push(fmt(fromLngLat(via)));
    if (leg < points.length - 2) waypoints.push(fmt(points[leg + 1]));
  }

  const params = new URLSearchParams({
    api: '1',
    origin: fmt(origin),
    destination: fmt(destination),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (waypoints.length) params.set('waypoints', waypoints.slice(0, MAX_WAYPOINTS).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Link for the whole day using a specific route option. */
export function optionDirectionsUrl(points: LatLng[], option: Pick<RouteOption, 'legs'> | null): string {
  return buildDirectionsUrl({ points, vias: option?.legs.map((l) => l.via) ?? [] });
}

/** Link for a single leg from the current location (Google uses GPS when origin is omitted). */
export function legDirectionsUrl(destination: LatLng, via: LngLat | null = null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: fmt(destination),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (via) params.set('waypoints', fmt(fromLngLat(via)));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function searchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
