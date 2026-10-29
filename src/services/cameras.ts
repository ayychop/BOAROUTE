import { bboxAround } from '@/lib/geo';
import type { HazardReport } from '@/lib/hazards';
import { supabase } from '@/lib/supabaseClient';

/** How far around the driver we load cameras, and the most we keep in memory. */
const DEFAULT_RADIUS_KM = 25;
const MAX_CAMERAS = 500;

interface CameraRow {
  osm_id: number;
  latitude: number;
  longitude: number;
}

/**
 * Speed cameras near a point, shaped as `HazardReport`s so the existing
 * co-pilot alert logic (the 500 m / 100 m voice cues with audio ducking)
 * treats them exactly like a reported `speed_camera`. They are synthetic:
 * a stable `cam:<osm_id>` id so each announces once, and always "live".
 */
export async function fetchCamerasNear(lat: number, lng: number, radiusKm = DEFAULT_RADIUS_KM): Promise<HazardReport[]> {
  const b = bboxAround({ lat, lng }, radiusKm);
  const { data, error } = await supabase
    .from('speed_cameras')
    .select('osm_id,latitude,longitude')
    .gte('latitude', b.minLat)
    .lte('latitude', b.maxLat)
    .gte('longitude', b.minLng)
    .lte('longitude', b.maxLng)
    .limit(MAX_CAMERAS);
  if (error) throw error;

  const now = new Date().toISOString();
  return ((data ?? []) as CameraRow[])
    .map((c): HazardReport | null => {
      const latitude = Number(c.latitude);
      const longitude = Number(c.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        id: `cam:${c.osm_id}`,
        user_id: 'osm',
        hazard_type: 'speed_camera',
        latitude,
        longitude,
        is_active: true,
        created_at: now,
      };
    })
    .filter((c): c is HazardReport => !!c);
}
