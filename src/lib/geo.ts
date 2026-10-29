import type { LatLng } from './types';

const EARTH_RADIUS_KM = 6371;

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** A lat/lng box roughly `radiusKm` around a point, for "near me" queries. */
export function bboxAround(center: LatLng, radiusKm: number): BBox {
  const dLat = radiusKm / 111.32;
  // A degree of longitude narrows towards the poles; guard the cos at ±90°.
  const dLng = radiusKm / Math.max(111.32 * Math.cos((center.lat * Math.PI) / 180), 1e-6);
  return {
    minLat: center.lat - dLat,
    minLng: center.lng - dLng,
    maxLat: center.lat + dLat,
    maxLng: center.lng + dLng,
  };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Straight-line distance to typical UK road distance. */
export const ROAD_FACTOR = 1.3;
/** Average speed for offline drive-time estimates (mixed roads). */
export const ESTIMATE_SPEED_KMH = 52;

export function estimateDrive(a: LatLng, b: LatLng): { km: number; minutes: number } {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return { km, minutes: (km / ESTIMATE_SPEED_KMH) * 60 };
}

const UK_POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;

export function isUkPostcode(text: string): boolean {
  return UK_POSTCODE.test(text.trim());
}

export function normalisePostcode(text: string): string {
  const m = text.trim().match(UK_POSTCODE);
  return m ? `${m[1]} ${m[2]}`.toUpperCase() : text.trim();
}

const USER_AGENT = 'BOAROUTE/1.0 (field route planner)';

/** Postcodes via postcodes.io; anything else via OpenStreetMap Nominatim (UK only). */
export async function geocode(query: string): Promise<LatLng | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    if (isUkPostcode(q)) {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(normalisePostcode(q))}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.result) return { lat: data.result.latitude, lng: data.result.longitude };
      }
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return { lat: Number(rows[0].lat), lng: Number(rows[0].lon) };
  } catch {
    return null;
  }
}
