import { useEffect, useRef, useState } from 'react';
import { limitAt, type OsmWay } from '@/lib/speed-limit';
import type { LatLng } from '@/lib/types';

/**
 * Speed limits from OpenStreetMap via Overpass. Roads within RADIUS_M are
 * fetched once and matched locally on every fix; a new batch is fetched when
 * the driver has moved REFETCH_M from where the last one was centred, so a
 * query goes out roughly every 150 m rather than every second.
 */

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const RADIUS_M = 250;
const REFETCH_M = 150;
const TIMEOUT_MS = 8_000;

function metres(a: LatLng, b: LatLng): number {
  const k = Math.cos((a.lat * Math.PI) / 180);
  const dx = (b.lng - a.lng) * k * 111_320;
  const dy = (b.lat - a.lat) * 110_540;
  return Math.sqrt(dx * dx + dy * dy);
}

export async function fetchWaysNear(p: LatLng, signal?: AbortSignal): Promise<OsmWay[]> {
  const q = `[out:json][timeout:8];way(around:${RADIUS_M},${p.lat.toFixed(6)},${p.lng.toFixed(6)})[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street)$"];out tags geom;`;
  let lastError: unknown = null;
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BOAROUTE/1.0' },
        body: `data=${encodeURIComponent(q)}`,
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = (await res.json()) as { elements?: { type: string; id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
      return (json.elements ?? [])
        .filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1)
        .map((e) => ({ id: e.id, tags: e.tags ?? {}, geometry: e.geometry! }));
    } catch (e) {
      lastError = e;
      if (signal?.aborted) break;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError ?? new Error('Speed limits unavailable');
}

/** The UK speed limit (mph) where the driver is, or null while unknown. */
export function useSpeedLimit(here: LatLng | null, heading: number | null, enabled = true): number | null {
  const [limit, setLimit] = useState<number | null>(null);
  const ways = useRef<OsmWay[]>([]);
  const centre = useRef<LatLng | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const lat = here?.lat;
  const lng = here?.lng;
  useEffect(() => {
    if (!enabled || lat == null || lng == null) return;
    const p = { lat, lng };
    if (!inFlight.current && (!centre.current || metres(centre.current, p) > REFETCH_M)) {
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      fetchWaysNear(p, ctrl.signal)
        .then((list) => {
          ways.current = list;
          centre.current = p;
        })
        .catch(() => {
          // Offline or rate limited: try again after another REFETCH_M.
          centre.current = p;
        })
        .finally(() => {
          if (inFlight.current === ctrl) inFlight.current = null;
        });
    }
    setLimit(limitAt(p, heading, ways.current));
  }, [lat, lng, heading, enabled]);

  useEffect(() => () => inFlight.current?.abort(), []);
  return enabled ? limit : null;
}
