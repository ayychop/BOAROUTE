import type { LatLng } from './types';

/**
 * UK speed limits from OpenStreetMap `maxspeed` tags. UK roads are tagged in
 * mph ("30 mph"); bare numbers follow the OSM default of km/h. National limit
 * codes map to the car limits: 60 on single, 70 on dual carriageways and
 * motorways.
 */

const NATIONAL: Record<string, number> = {
  'GB:nsl_single': 60,
  'GB:nsl_dual': 70,
  'GB:motorway': 70,
  'UK:nsl_single': 60,
  'UK:nsl_dual': 70,
  'UK:motorway': 70,
  'GB:national': 60,
  'GB:urban': 30,
  'UK:urban': 30,
};

export const KMH_PER_MPH = 1.609344;
export const MPS_TO_MPH = 2.2369363;

/** mph for one `maxspeed` value, or null when it cannot be read. */
export function parseMaxspeed(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = raw.split(';')[0].trim();
  if (NATIONAL[v]) return NATIONAL[v];
  if (v === 'none' || v === 'signals' || v === 'variable' || v === 'walk') return null;
  const m = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh|kph)?$/i.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = (m[2] ?? 'km/h').toLowerCase();
  return unit === 'mph' ? Math.round(n) : Math.round(n / KMH_PER_MPH / 5) * 5;
}

export interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

/** The way's limit in mph, from maxspeed, then the national limit type, then the motorway default. */
export function wayLimitMph(tags: Record<string, string>): number | null {
  return (
    parseMaxspeed(tags.maxspeed) ??
    parseMaxspeed(tags['maxspeed:type']) ??
    parseMaxspeed(tags['source:maxspeed']) ??
    (tags.highway === 'motorway' || tags.highway === 'motorway_link' ? 70 : null)
  );
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

function segmentDistance(p: LatLng, a: { lat: number; lon: number }, b: { lat: number; lon: number }): { off: number; bearing: number } {
  const k = Math.cos(rad(p.lat));
  const ax = rad(a.lon - p.lng) * k * R;
  const ay = rad(a.lat - p.lat) * R;
  const bx = rad(b.lon - p.lng) * k * R;
  const by = rad(b.lat - p.lat) * R;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return { off: Math.sqrt(cx * cx + cy * cy), bearing: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
}

/** How far a segment's direction is from the heading, ignoring which way the road was drawn (0 to 90). */
function headingGap(bearing: number, heading: number): number {
  const d = Math.abs(((bearing - heading + 540) % 360) - 180);
  return Math.min(d, 180 - d);
}

/** Beyond this the driver is not on any of the fetched roads. */
export const WAY_MATCH_M = 30;

/**
 * The limit on the road the driver is on: the nearest way with a known
 * limit, preferring ones that run the same way as the car so a slip road or
 * side street next to a motorway does not win.
 */
export function limitAt(here: LatLng, heading: number | null, ways: OsmWay[]): number | null {
  let best: { score: number; limit: number } | null = null;
  for (const w of ways) {
    const limit = wayLimitMph(w.tags);
    if (limit == null) continue;
    for (let i = 0; i < w.geometry.length - 1; i++) {
      const s = segmentDistance(here, w.geometry[i], w.geometry[i + 1]);
      if (s.off > WAY_MATCH_M) continue;
      const turn = heading != null && heading >= 0 ? headingGap(s.bearing, heading) : 0;
      const score = s.off + turn * 0.5;
      if (!best || score < best.score) best = { score, limit };
    }
  }
  return best?.limit ?? null;
}

/** Over the limit by more than 1 mph (speedometer and GPS noise). */
export function isSpeeding(speedMph: number | null | undefined, limitMph: number | null | undefined): boolean {
  return speedMph != null && limitMph != null && speedMph > limitMph + 1;
}

export function mpsToMph(mps: number | null | undefined): number | null {
  return mps == null || !Number.isFinite(mps) || mps < 0 ? null : mps * MPS_TO_MPH;
}
