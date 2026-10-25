// route-options: live-traffic driving options for a multi-stop day route.
// For every leg it asks the Google Routes API (TRAFFIC_AWARE_OPTIMAL, live
// traffic) for alternatives, falling back to Mapbox
// driving-traffic, then builds a motorway-preferred and a standard option
// with turn-by-turn steps for the in-app navigator.
// Secrets: GOOGLE_MAPS_API_KEY (preferred) or MAPBOX_ACCESS_TOKEN.
import { corsHeaders, json, requireUser } from '../_shared/http.ts';
import {
  buildRouteOptions,
  googleRouteToMapbox,
  ROUTES_API_FIELD_MASK,
  routesApiToGoogle,
  type MapboxRoute,
  type RoutesApiRoute,
} from '../_shared/route-analysis.ts';

const MAX_POINTS = 12;

interface Point {
  lat: number;
  lng: number;
}

function parsePoints(body: unknown): Point[] {
  const points = (body as { points?: unknown })?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_POINTS) {
    throw new Error(`Send between 2 and ${MAX_POINTS} points`);
  }
  return points.map((p) => {
    const lat = Number((p as Point).lat);
    const lng = Number((p as Point).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new Error('Invalid coordinates');
    }
    return { lat, lng };
  });
}

async function fetchGoogleLeg(from: Point, to: Point, key: string): Promise<MapboxRoute[]> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': ROUTES_API_FIELD_MASK },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
      destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
      travelMode: 'DRIVE',
      // Live traffic. TRAFFIC_UNAWARE would ignore current conditions.
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      computeAlternativeRoutes: true,
      languageCode: 'en-GB',
      regionCode: 'GB',
      units: 'IMPERIAL',
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Google Routes ${res.status}${data?.error?.message ? `: ${data.error.message}` : ''}`);
  const routes = (data?.routes ?? []) as RoutesApiRoute[];
  if (routes.length === 0) throw new Error('Google Routes returned no routes');
  return routes.map((r) => googleRouteToMapbox(routesApiToGoogle(r)));
}

async function fetchLeg(from: Point, to: Point, token: string): Promise<MapboxRoute[]> {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const params = new URLSearchParams({
    alternatives: 'true',
    steps: 'true',
    geometries: 'geojson',
    overview: 'simplified',
    access_token: token,
  });
  const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?${params}`);
  if (!res.ok) throw new Error(`Mapbox ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error(`Mapbox returned ${data.code ?? 'no routes'}`);
  }
  return data.routes as MapboxRoute[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const userId = await requireUser(req);
  if (!userId) return json({ error: 'Please sign in again' }, 401);

  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  const token = Deno.env.get('MAPBOX_ACCESS_TOKEN');
  if (!googleKey && !token) return json({ error: 'Live routing is not configured yet.' }, 503);

  let points: Point[];
  try {
    points = parsePoints(await req.json());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Invalid request' }, 400);
  }

  try {
    if (googleKey) {
      try {
        const legs = await Promise.all(points.slice(1).map((to, i) => fetchGoogleLeg(points[i], to, googleKey)));
        return json(buildRouteOptions(legs, new Date(), 'google'));
      } catch (error) {
        if (!token) throw error;
        console.error('route-options google, falling back to mapbox:', error);
      }
    }
    const legs = await Promise.all(points.slice(1).map((to, i) => fetchLeg(points[i], to, token as string)));
    return json(buildRouteOptions(legs, new Date(), 'mapbox'));
  } catch (error) {
    console.error('route-options:', error);
    return json({ error: 'Live traffic routing is unavailable right now.' }, 502);
  }
});
