// Pure route analysis shared by the `route-options` Edge Function and the
// Jest suite. No Deno or React Native imports allowed in this file.

export type LngLat = [number, number];

/** Subset of a Mapbox Directions API step that we rely on. */
export interface MapboxStep {
  distance: number;
  duration: number;
  name?: string;
  ref?: string;
  geometry?: { coordinates: LngLat[] };
  intersections?: { mapbox_streets_v8?: { class?: string } }[];
  /** Turn instruction and where it happens (present when steps are requested). */
  maneuver?: { instruction?: string; location?: LngLat };
}

/** Subset of a Mapbox Directions API route that we rely on. */
export interface MapboxRoute {
  distance: number;
  duration: number;
  duration_typical?: number;
  geometry?: { coordinates: LngLat[] };
  legs: { steps: MapboxStep[] }[];
}

export type RoadClass = 'motorway' | 'dual' | 'primary' | 'secondary' | 'minor';

export interface RouteStats {
  durationS: number;
  typicalDurationS: number;
  distanceM: number;
  motorwayM: number;
  dualM: number;
  minorM: number;
  /** Share of distance on motorways and dual carriageways (0..1). */
  fastRoadShare: number;
  /** Share of distance on lanes and minor roads (0..1). */
  minorShare: number;
  /** Midpoint of the longest motorway / dual carriageway stretch. */
  anchor: LngLat | null;
  /** Road numbers used, e.g. ["M4", "A404(M)"]. */
  roads: string[];
}

export interface LegChoice {
  standardIndex: number;
  motorwayIndex: number;
  standard: RouteStats;
  motorway: RouteStats;
  /** True when the leg is long enough for road choice to matter. */
  significant: boolean;
}

/** Legs shorter than this are town hops where road type is irrelevant. */
export const SIGNIFICANT_LEG_M = 5000;
/** Motorway option may be at most this much slower than the fastest route. */
export const MOTORWAY_TIME_TOLERANCE = 1.3;
export const MOTORWAY_TIME_SLACK_S = 300;
/** Below this fast-road distance a day has no meaningful motorway option. */
export const MIN_MOTORWAY_KM = 5;

const MOTORWAY_CLASSES = new Set(['motorway', 'motorway_link']);
// OSM "trunk" roads are the UK's primary A roads, overwhelmingly dual carriageway.
const DUAL_CLASSES = new Set(['trunk', 'trunk_link']);
const PRIMARY_CLASSES = new Set(['primary', 'primary_link']);
const SECONDARY_CLASSES = new Set(['secondary', 'secondary_link']);
const MINOR_CLASSES = new Set(['tertiary', 'tertiary_link', 'street', 'street_limited', 'track', 'service', 'unclassified', 'residential']);

export function classifyStep(step: MapboxStep): RoadClass {
  const cls = step.intersections?.find((i) => i.mapbox_streets_v8?.class)?.mapbox_streets_v8?.class;
  if (cls) {
    if (MOTORWAY_CLASSES.has(cls)) return 'motorway';
    if (DUAL_CLASSES.has(cls)) return 'dual';
    if (PRIMARY_CLASSES.has(cls)) return 'primary';
    if (SECONDARY_CLASSES.has(cls)) return 'secondary';
    if (MINOR_CLASSES.has(cls)) return 'minor';
  }
  // Fall back to UK road numbering when the class is missing.
  const label = `${step.ref ?? ''} ${step.name ?? ''}`;
  if (/\bM\d+\b/.test(label) || /\bA\d+\(M\)/.test(label)) return 'motorway';
  if (/\bA\d+\b/.test(label)) return 'primary';
  if (/\bB\d+\b/.test(label)) return 'secondary';
  return 'secondary';
}

function roadNumbers(step: MapboxStep): string[] {
  const label = `${step.ref ?? ''};${step.name ?? ''}`;
  return label.match(/\b[MA]\d+(\(M\))?/g) ?? [];
}

function midpoint(coords: LngLat[] | undefined): LngLat | null {
  if (!coords || coords.length === 0) return null;
  return coords[Math.floor(coords.length / 2)];
}

export function analyseRoute(route: MapboxRoute): RouteStats {
  let motorwayM = 0;
  let dualM = 0;
  let minorM = 0;
  let longestFast: MapboxStep | null = null;
  const roads: string[] = [];

  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const cls = classifyStep(step);
      if (cls === 'motorway') motorwayM += step.distance;
      else if (cls === 'dual') dualM += step.distance;
      else if (cls === 'minor') minorM += step.distance;

      if ((cls === 'motorway' || cls === 'dual') && (!longestFast || step.distance > longestFast.distance)) {
        longestFast = step;
      }
      if (cls === 'motorway' || cls === 'dual') {
        for (const r of roadNumbers(step)) if (!roads.includes(r)) roads.push(r);
      }
    }
  }

  const distanceM = route.distance || 1;
  return {
    durationS: route.duration,
    typicalDurationS: route.duration_typical ?? route.duration,
    distanceM: route.distance,
    motorwayM,
    dualM,
    minorM,
    fastRoadShare: (motorwayM + dualM) / distanceM,
    minorShare: minorM / distanceM,
    anchor: longestFast ? midpoint(longestFast.geometry?.coordinates) : null,
    roads,
  };
}

/**
 * Picks, for one leg, the fastest route and the route that best favours
 * motorways and dual carriageways without being unreasonably slower.
 */
export function chooseLeg(routes: MapboxRoute[]): LegChoice {
  if (routes.length === 0) throw new Error('No routes returned for leg');
  const stats = routes.map(analyseRoute);

  let standardIndex = 0;
  stats.forEach((s, i) => {
    if (s.durationS < stats[standardIndex].durationS) standardIndex = i;
  });
  const standard = stats[standardIndex];
  const limit = standard.durationS * MOTORWAY_TIME_TOLERANCE + MOTORWAY_TIME_SLACK_S;

  let motorwayIndex = standardIndex;
  stats.forEach((s, i) => {
    if (s.durationS > limit) return;
    const best = stats[motorwayIndex];
    // More fast road wins; then fewer country lanes; then the quicker route.
    const fastGain = s.fastRoadShare - best.fastRoadShare;
    const laneGain = best.minorShare - s.minorShare;
    if (fastGain > 0.02 || (Math.abs(fastGain) <= 0.02 && (laneGain > 0.02 || (Math.abs(laneGain) <= 0.02 && s.durationS < best.durationS)))) {
      motorwayIndex = i;
    }
  });

  return {
    standardIndex,
    motorwayIndex,
    standard,
    motorway: stats[motorwayIndex],
    significant: standard.distanceM >= SIGNIFICANT_LEG_M,
  };
}

export interface OptionLeg {
  durationS: number;
  typicalDurationS: number;
  distanceM: number;
  /** Extra point that steers turn-by-turn apps onto the chosen road. */
  via: LngLat | null;
}

/** One turn-by-turn instruction for in-app navigation. */
export interface NavStep {
  instruction: string;
  distanceM: number;
  durationS: number;
  /** Where the manoeuvre happens. */
  location: LngLat;
}

export interface RouteOption {
  kind: 'motorway' | 'standard';
  available: boolean;
  durationS: number;
  typicalDurationS: number;
  distanceM: number;
  fastRoadShare: number;
  minorShare: number;
  roads: string[];
  legs: OptionLeg[];
  geometry: LngLat[];
  /** Turn-by-turn steps for the in-app navigator (empty for estimates). */
  steps: NavStep[];
}

export interface RouteOptionsResult {
  source: 'google' | 'mapbox' | 'estimate';
  motorway: RouteOption;
  standard: RouteOption;
  /** Both options follow exactly the same roads. */
  identical: boolean;
  generatedAt: string;
}

function sumOption(kind: RouteOption['kind'], picks: { stats: RouteStats; route: MapboxRoute; via: LngLat | null }[]): RouteOption {
  const durationS = picks.reduce((a, p) => a + p.stats.durationS, 0);
  const typicalDurationS = picks.reduce((a, p) => a + p.stats.typicalDurationS, 0);
  const distanceM = picks.reduce((a, p) => a + p.stats.distanceM, 0);
  const fastM = picks.reduce((a, p) => a + p.stats.motorwayM + p.stats.dualM, 0);
  const minorM = picks.reduce((a, p) => a + p.stats.minorM, 0);
  const roads: string[] = [];
  for (const p of picks) for (const r of p.stats.roads) if (!roads.includes(r)) roads.push(r);
  return {
    kind,
    available: true,
    durationS,
    typicalDurationS,
    distanceM,
    fastRoadShare: distanceM ? fastM / distanceM : 0,
    minorShare: distanceM ? minorM / distanceM : 0,
    roads,
    legs: picks.map((p) => ({
      durationS: p.stats.durationS,
      typicalDurationS: p.stats.typicalDurationS,
      distanceM: p.stats.distanceM,
      via: p.via,
    })),
    geometry: picks.flatMap((p) => p.route.geometry?.coordinates ?? []),
    steps: picks.flatMap((p) => routeSteps(p.route)),
  };
}

function routeSteps(route: MapboxRoute): NavStep[] {
  const out: NavStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const location = step.maneuver?.location ?? step.geometry?.coordinates[0];
      const instruction = step.maneuver?.instruction?.trim();
      if (location && instruction) out.push({ instruction, distanceM: step.distance, durationS: step.duration, location });
    }
  }
  return out;
}

/** Builds the two whole-day options from per-leg alternatives. */
export function buildRouteOptions(legsAlternatives: MapboxRoute[][], now = new Date(), source: RouteOptionsResult['source'] = 'mapbox'): RouteOptionsResult {
  const choices = legsAlternatives.map(chooseLeg);

  const standard = sumOption(
    'standard',
    choices.map((c, i) => ({ stats: c.standard, route: legsAlternatives[i][c.standardIndex], via: null })),
  );
  const motorway = sumOption(
    'motorway',
    choices.map((c, i) => {
      const useMotorway = c.significant ? c.motorwayIndex : c.standardIndex;
      const stats = c.significant ? c.motorway : c.standard;
      // Only steer navigation when the motorway pick differs from the fastest.
      const via = c.significant && c.motorwayIndex !== c.standardIndex ? stats.anchor : null;
      return { stats, route: legsAlternatives[i][useMotorway], via };
    }),
  );

  const fastKm = (motorway.fastRoadShare * motorway.distanceM) / 1000;
  motorway.available = fastKm >= MIN_MOTORWAY_KM;
  const identical = choices.every((c) => !c.significant || c.motorwayIndex === c.standardIndex);

  return { source, motorway, standard, identical, generatedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Google Directions adapter: converts Google routes into the shape analysed
// above, so the motorway-preferred logic is identical for both providers.

/** Subset of a Google Directions API route that we rely on. */
export interface GoogleRoute {
  legs: {
    distance: { value: number };
    duration: { value: number };
    /** Present when departure_time is set: the live-traffic duration. */
    duration_in_traffic?: { value: number };
    steps: {
      distance: { value: number };
      duration: { value: number };
      html_instructions?: string;
      polyline: { points: string };
      start_location: { lat: number; lng: number };
    }[];
  }[];
}

/** Decodes a Google encoded polyline into [lng, lat] pairs. */
export function decodePolyline(encoded: string): LngLat[] {
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20 && index < encoded.length);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    out.push([lng / 1e5, lat / 1e5]);
  }
  return out;
}

/** Plain text from Google's HTML instructions ("Turn <b>left</b> onto <b>A404</b>"). */
export function stripHtml(html: string): string {
  return html
    .replace(/<div[^>]*>/gi, '. ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/(\. )+/g, '. ')
    .trim();
}

/**
 * Google has no road class, so it comes from UK road numbers in the
 * instruction: M roads and A(M) are motorways, A roads primary, B roads
 * secondary, and unnumbered roads count as lanes and streets.
 */
export function googleRoadClass(text: string): string {
  if (/\bM\d+\b/.test(text) || /\bA\d+\(M\)/.test(text)) return 'motorway';
  if (/\bA\d+\b/.test(text)) return 'primary';
  if (/\bB\d+\b/.test(text)) return 'secondary';
  return 'street';
}

export function googleRouteToMapbox(route: GoogleRoute): MapboxRoute {
  let distance = 0;
  let duration = 0;
  let typical = 0;
  const coordinates: LngLat[] = [];
  const legs = route.legs.map((leg) => {
    const live = leg.duration_in_traffic?.value ?? leg.duration.value;
    // Spread the live-traffic delay across the leg's steps.
    const ratio = leg.duration.value > 0 ? live / leg.duration.value : 1;
    distance += leg.distance.value;
    duration += live;
    typical += leg.duration.value;
    const steps: MapboxStep[] = leg.steps.map((st) => {
      const text = stripHtml(st.html_instructions ?? '');
      const coords = decodePolyline(st.polyline.points);
      coordinates.push(...coords);
      const numbers = text.match(/\b[MAB]\d+(\(M\))?/g) ?? [];
      return {
        distance: st.distance.value,
        duration: st.duration.value * ratio,
        ref: numbers.join(';'),
        name: text,
        geometry: { coordinates: coords },
        intersections: [{ mapbox_streets_v8: { class: googleRoadClass(text) } }],
        maneuver: { instruction: text, location: [st.start_location.lng, st.start_location.lat] },
      };
    });
    return { steps };
  });
  return { distance, duration, duration_typical: typical, geometry: { coordinates }, legs };
}
