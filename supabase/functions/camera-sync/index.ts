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
  OVERPASS_ENDPOINT,
  overpassElementsToCameras,
  type OverpassElement,
} from '../_shared/cameras.ts';

const UPSERT_CHUNK = 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
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

  const endpoint = Deno.env.get('OVERPASS_ENDPOINT') ?? OVERPASS_ENDPOINT;
  const startedAt = new Date().toISOString();

  let elements: OverpassElement[];
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildOverpassQuery())}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    elements = Array.isArray(data?.elements) ? (data.elements as OverpassElement[]) : [];
  } catch (error) {
    console.error('camera-sync overpass:', error);
    return json({ error: 'Could not reach the camera source.' }, 502);
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
    // Anything not touched by this run is gone from OSM: drop it.
    const { error: pruneError, count } = await supabase
      .from('speed_cameras')
      .delete({ count: 'exact' })
      .lt('updated_at', startedAt);
    if (pruneError) throw pruneError;
    return json({ ok: true, synced: rows.length, pruned: count ?? 0, at: startedAt });
  } catch (error) {
    console.error('camera-sync write:', error);
    return json({ error: 'Could not write the camera set.' }, 500);
  }
});
