// camera-sync: refreshes the nationwide UK speed-camera table from
// OpenStreetMap. Fetches every `highway=speed_camera` / `enforcement=maxspeed`
// node in GB from the Overpass API, upserts them into `public.speed_cameras`,
// then prunes cameras that have disappeared from OSM.
//
// This writes with the service-role key (bypassing RLS), so it is NOT a
// user-facing endpoint: it must be called by the scheduler with the shared
// CRON_SECRET. See ./README.md for the pg_cron setup.
//
// Secrets: CRON_SECRET (required), SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// (injected by Supabase). Optional: OVERPASS_ENDPOINT to override the mirror.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import {
  buildOverpassQuery,
  OVERPASS_MIRRORS,
  overpassElementsToCameras,
  parseBbox,
  UK_BBOX,
  type OverpassElement,
} from '../_shared/cameras.ts';

const UPSERT_CHUNK = 1000;
// Overpass is flaky under load; try a few times, rotating mirrors, before
// giving up. Each attempt is capped so a hung mirror cannot eat the whole
// function budget before the next try.
const FETCH_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Fetches the Overpass elements, retrying across mirrors with a short backoff.
 * Logs the exact status (e.g. 429, 504) or error per attempt, and throws with
 * the last reason when every attempt fails so the caller can report it.
 */
async function fetchOverpassElements(query: string): Promise<OverpassElement[]> {
  const override = Deno.env.get('OVERPASS_ENDPOINT');
  const mirrors = override ? [override] : OVERPASS_MIRRORS;
  let lastReason = 'no attempts made';

  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    const endpoint = mirrors[attempt % mirrors.length];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      if (!res.ok) {
        const snippet = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
        lastReason = `${endpoint} -> HTTP ${res.status} ${res.statusText}${snippet ? ` | ${snippet}` : ''}`;
        console.error(`camera-sync overpass attempt ${attempt + 1}/${FETCH_ATTEMPTS}: ${lastReason}`);
      } else {
        const data = await res.json();
        const elements = Array.isArray(data?.elements) ? (data.elements as OverpassElement[]) : [];
        console.log(`camera-sync overpass ok via ${endpoint}: ${elements.length} elements`);
        return elements;
      }
    } catch (error) {
      const why = error instanceof Error ? (error.name === 'AbortError' ? `timed out after ${FETCH_TIMEOUT_MS}ms` : error.message) : String(error);
      lastReason = `${endpoint} -> ${why}`;
      console.error(`camera-sync overpass attempt ${attempt + 1}/${FETCH_ATTEMPTS}: ${lastReason}`);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < FETCH_ATTEMPTS - 1) await sleep(RETRY_DELAY_MS);
  }
  throw new Error(lastReason);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Only the scheduler may run this. Reject when unconfigured rather than
  // leaving an open endpoint that rewrites the whole table.
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'Forbidden' }, 403);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Sync is not configured.' }, 503);

  const startedAt = new Date().toISOString();

  // OVERPASS_BBOX ("south,west,north,east") narrows the query for testing; the
  // whole UK is the default. A narrowed box also narrows the prune, so a test
  // run only clears cameras inside that box (see the delete below).
  const bbox = parseBbox(Deno.env.get('OVERPASS_BBOX')) ?? UK_BBOX;

  let elements: OverpassElement[];
  try {
    elements = await fetchOverpassElements(buildOverpassQuery(bbox));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('camera-sync overpass: all attempts failed:', detail);
    // detail carries the upstream status (429/504/...) so it is visible in the response.
    return json({ error: 'Could not reach the camera source.', detail }, 502);
  }

  const cameras = overpassElementsToCameras(elements);
  if (cameras.length === 0) {
    // A healthy nationwide query always returns thousands; an empty result
    // means a bad fetch. Keep the existing rows rather than pruning them all.
    return json({ error: 'No cameras returned; keeping the current set.' }, 502);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  try {
    const rows = cameras.map((c) => ({ ...c, updated_at: startedAt }));
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await supabase.from('speed_cameras').upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: 'osm_id' });
      if (error) throw error;
    }
    // Anything inside the queried box not touched by this run is gone from
    // OSM: drop it. Scoping the delete to the box means a narrowed test run
    // never clears cameras elsewhere in the country.
    const [s, w, n, e] = bbox;
    const { error: pruneError, count } = await supabase
      .from('speed_cameras')
      .delete({ count: 'exact' })
      .lt('updated_at', startedAt)
      .gte('latitude', s)
      .lte('latitude', n)
      .gte('longitude', w)
      .lte('longitude', e);
    if (pruneError) throw pruneError;
    return json({ ok: true, synced: rows.length, pruned: count ?? 0, at: startedAt });
  } catch (error) {
    console.error('camera-sync write:', error);
    return json({ error: 'Could not write the camera set.' }, 500);
  }
});
