import {
  analyseRoute,
  buildRouteOptions,
  chooseLeg,
  classifyStep,
  detectForcedMinorRoads,
  type MapboxRoute,
  type MapboxStep,
  type RouteOption,
} from '../supabase/functions/_shared/route-analysis';
import { estimateRouteOptions } from '../src/lib/route-estimate';

const step = (cls: string | null, distance: number, extra: Partial<MapboxStep> = {}): MapboxStep => ({
  distance,
  duration: distance / 20,
  intersections: cls ? [{ mapbox_streets_v8: { class: cls } }] : [],
  geometry: { coordinates: [[-1, 51], [-0.9, 51.1], [-0.8, 51.2]] },
  ...extra,
});

const route = (duration: number, steps: MapboxStep[], typical?: number): MapboxRoute => ({
  duration,
  duration_typical: typical,
  distance: steps.reduce((a, s) => a + s.distance, 0),
  geometry: { coordinates: [[-1, 51], [-0.8, 51.2]] },
  legs: [{ steps }],
});

describe('classifyStep', () => {
  it.each([
    ['motorway', 'motorway'],
    ['motorway_link', 'motorway'],
    ['trunk', 'dual'],
    ['primary', 'primary'],
    ['tertiary', 'minor'],
    ['track', 'minor'],
  ])('%s -> %s', (cls, expected) => expect(classifyStep(step(cls, 100))).toBe(expected));

  it('falls back to UK road numbers', () => {
    expect(classifyStep(step(null, 100, { ref: 'M40' }))).toBe('motorway');
    expect(classifyStep(step(null, 100, { name: 'A404(M)' }))).toBe('motorway');
    expect(classifyStep(step(null, 100, { ref: 'A34' }))).toBe('primary');
    expect(classifyStep(step(null, 100, { name: 'Church Lane' }))).toBe('secondary');
  });
});

describe('analyseRoute', () => {
  it('measures fast-road and minor-road shares and finds an anchor', () => {
    const s = analyseRoute(route(1000, [step('tertiary', 2000), step('motorway', 6000, { ref: 'M4' }), step('trunk', 2000, { ref: 'A34' })], 900));
    expect(s.fastRoadShare).toBeCloseTo(0.8);
    expect(s.minorShare).toBeCloseTo(0.2);
    expect(s.anchor).toEqual([-0.9, 51.1]);
    expect(s.roads).toEqual(['M4', 'A34']);
    expect(s.typicalDurationS).toBe(900);
  });
});

describe('chooseLeg', () => {
  const lanes = route(1800, [step('tertiary', 20000), step('secondary', 5000)]);
  const motorway = route(2000, [step('primary', 3000), step('motorway', 25000), step('primary', 2000)]);
  const tooSlow = route(4000, [step('motorway', 40000)]);

  it('prefers the motorway route when it is within the time tolerance', () => {
    const c = chooseLeg([lanes, motorway]);
    expect(c.standardIndex).toBe(0);
    expect(c.motorwayIndex).toBe(1);
    expect(c.significant).toBe(true);
  });

  it('ignores motorway routes that are far slower', () => {
    const c = chooseLeg([lanes, tooSlow]);
    expect(c.motorwayIndex).toBe(0);
  });

  it('throws on an empty leg', () => {
    expect(() => chooseLeg([])).toThrow();
  });
});

describe('buildRouteOptions', () => {
  const lanes = route(1800, [step('tertiary', 20000), step('secondary', 5000)], 1500);
  const motorway = route(2000, [step('primary', 3000), step('motorway', 25000, { ref: 'M40' }), step('primary', 2000)], 1900);
  const town = route(300, [step('street', 2000)]);

  it('builds a motorway option and a standard option with via points', () => {
    const r = buildRouteOptions([[lanes, motorway], [town]]);
    expect(r.source).toBe('mapbox');
    expect(r.standard.durationS).toBe(2100);
    expect(r.motorway.durationS).toBe(2300);
    expect(r.motorway.available).toBe(true);
    expect(r.identical).toBe(false);
    expect(r.motorway.legs[0].via).toEqual([-0.9, 51.1]);
    expect(r.motorway.legs[1].via).toBeNull();
    expect(r.standard.legs.every((l) => l.via === null)).toBe(true);
    expect(r.motorway.roads).toEqual(['M40']);
    expect(r.standard.typicalDurationS).toBe(1800);
  });

  it('marks the motorway option unavailable when no fast roads exist', () => {
    const r = buildRouteOptions([[lanes], [town]]);
    expect(r.motorway.available).toBe(false);
    expect(r.identical).toBe(true);
  });

  it('flags identical options when the fastest route already uses motorways', () => {
    const r = buildRouteOptions([[motorway, lanes]].map((l) => [l[0], { ...l[1], duration: 9999 }]));
    expect(r.identical).toBe(true);
    expect(r.motorway.available).toBe(true);
  });
});

describe('detectForcedMinorRoads', () => {
  const opt = (distanceM: number, minorShare: number): RouteOption =>
    ({ distanceM, minorShare } as RouteOption);

  it('warns when a long trip is forced onto country lanes', () => {
    expect(detectForcedMinorRoads(opt(20000, 0.5))).toBe(true);
  });
  it('stays quiet on a mostly-fast long trip', () => {
    expect(detectForcedMinorRoads(opt(20000, 0.1))).toBe(false);
  });
  it('ignores short trips where lanes are normal', () => {
    expect(detectForcedMinorRoads(opt(3000, 0.9))).toBe(false);
  });

  it('sets the flag on the whole-day result', () => {
    // A long leg almost entirely on country lanes: the main road is blocked.
    const lanes = route(1800, [step('tertiary', 20000, { name: 'Country Lane' })]);
    const r = buildRouteOptions([[lanes]]);
    expect(r.forcedMinorRoads).toBe(true);
  });
});

describe('offline estimate', () => {
  it('returns only a standard route, flagged as an estimate', () => {
    const r = estimateRouteOptions([{ lat: 51.64, lng: -0.73 }, { lat: 51.45, lng: -0.97 }, { lat: 51.64, lng: -0.73 }]);
    expect(r.source).toBe('estimate');
    expect(r.motorway.available).toBe(false);
    expect(r.standard.legs).toHaveLength(2);
    expect(r.standard.distanceM).toBeGreaterThan(50000);
  });
});
