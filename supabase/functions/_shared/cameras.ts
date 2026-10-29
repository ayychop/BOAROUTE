// Pure helpers for the UK speed-camera sync, shared by the `camera-sync`
// Edge Function and the Jest suite. No Deno or React Native imports allowed.
//
// Cameras come from OpenStreetMap via the Overpass API. OSM tags speed-camera
// devices as `highway=speed_camera` nodes; average-speed systems are also
// tagged `enforcement=maxspeed` on the enforcement node. We take both.

export interface CameraRow {
  osm_id: number;
  latitude: number;
  longitude: number;
  /** Bearing the camera faces in degrees (0..359), or null when unknown. */
  direction: number | null;
  /** Posted limit as tagged, e.g. "40 mph" or "30", or null. */
  maxspeed: string | null;
  /** Road number, e.g. "A4", when tagged. */
  ref: string | null;
}

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

/** Public Overpass endpoint. Override with OVERPASS_ENDPOINT in the function. */
export const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/**
 * Every speed camera in the United Kingdom. The area filter pins it to GB so
 * we never pull the whole planet; the long timeout lets Overpass finish a
 * nationwide query.
 */
export function buildOverpassQuery(): string {
  return [
    '[out:json][timeout:180];',
    'area["ISO3166-1"="GB"][admin_level=2]->.gb;',
    '(',
    '  node["highway"="speed_camera"](area.gb);',
    '  node["enforcement"="maxspeed"](area.gb);',
    ');',
    'out body;',
  ].join('\n');
}

/** OSM compass words to bearings, for cameras tagged with a direction word. */
const COMPASS: Record<string, number> = {
  N: 0, NNE: 22, NE: 45, ENE: 68, E: 90, ESE: 113, SE: 135, SSE: 158,
  S: 180, SSW: 203, SW: 225, WSW: 248, W: 270, WNW: 293, NW: 315, NNW: 338,
};

/** A numeric bearing or a compass word to degrees in [0, 360), else null. */
export function parseDirection(value: string | undefined): number | null {
  if (!value) return null;
  const word = COMPASS[value.trim().toUpperCase()];
  if (word !== undefined) return word;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return ((n % 360) + 360) % 360;
}

/** A single Overpass node to a camera row, or null when it is unusable. */
export function overpassElementToCamera(el: OverpassElement): CameraRow | null {
  if (el.type !== 'node' || !Number.isInteger(el.id)) return null;
  const latitude = Number(el.lat);
  const longitude = Number(el.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const tags = el.tags ?? {};
  return {
    osm_id: el.id,
    latitude,
    longitude,
    direction: parseDirection(tags.direction),
    maxspeed: tags.maxspeed ?? tags['maxspeed:forward'] ?? null,
    ref: tags.ref ?? null,
  };
}

/** Maps a batch of elements to rows, dropping unusable ones and de-duping by id. */
export function overpassElementsToCameras(elements: OverpassElement[]): CameraRow[] {
  const byId = new Map<number, CameraRow>();
  for (const el of elements) {
    const row = overpassElementToCamera(el);
    if (row) byId.set(row.osm_id, row);
  }
  return [...byId.values()];
}
