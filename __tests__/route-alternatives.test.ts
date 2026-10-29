import { MAX_ROUTE_OPTIONS, buildRouteOptions, routeChoices, routeKindLabel, routeScore, type MapboxRoute } from '../supabase/functions/_shared/route-analysis';

const road = (cls: string, distance: number, duration: number, extra: Record<string, unknown> = {}) => ({
  distance,
  duration,
  intersections: [{ mapbox_streets_v8: { class: cls } }],
  geometry: { coordinates: [[-1, 51], [-0.9, 51.1], [-0.8, 51.2]] as [number, number][] },
  ...extra,
});

/** One route made of a single kind of road. */
const route = (duration: number, distance: number, cls = 'primary'): MapboxRoute => ({
  duration,
  distance,
  geometry: { coordinates: [[-1, 51], [-0.8, 51.2]] },
  legs: [{ steps: [road(cls, distance, duration)] }],
});

describe('3 to 4 route options', () => {
  // Four distinct routes for one trip; none uses motorways.
  const four = [route(1000, 10_000), route(1100, 9_000), route(1200, 12_000), route(1300, 13_000)];

  it('offers every distinct route for a single destination, up to 4', () => {
    const r = buildRouteOptions([four]);
    expect(MAX_ROUTE_OPTIONS).toBe(4);
    expect(r.alternatives).toHaveLength(4);
    expect(r.alternatives!.map((o) => o.kind)).toEqual(['recommended', 'shortest', 'alternative', 'alternative']);
    // Fill is best score first.
    expect(r.alternatives!.map((o) => o.durationS)).toEqual([1000, 1100, 1200, 1300]);
  });

  it('never repeats the same route under two names', () => {
    const r = buildRouteOptions([four]);
    const keys = r.alternatives!.map((o) => `${o.durationS}/${o.distanceM}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers just one when the provider only has one route', () => {
    const r = buildRouteOptions([[route(1000, 10_000)]]);
    expect(r.alternatives).toHaveLength(1);
    expect(r.alternatives![0].kind).toBe('recommended');
  });

  it('does not multiply options across a multi-stop day', () => {
    const r = buildRouteOptions([four, four]);
    expect(r.alternatives!.length).toBeLessThanOrEqual(MAX_ROUTE_OPTIONS);
    expect(r.alternatives!.every((o) => o.kind !== 'alternative')).toBe(true);
  });

  it('lists recommended first through routeChoices', () => {
    const r = buildRouteOptions([four]);
    expect(routeChoices(r)[0].kind).toBe('recommended');
    expect(routeChoices(r)).toBe(r.alternatives);
  });

  it('labels alternatives', () => {
    expect(routeKindLabel('alternative')).toBe('Alternative');
    expect(routeKindLabel('recommended')).toBe('Recommended');
  });
});

describe('country roads are penalised', () => {
  it('scores two minutes per km of country road', () => {
    expect(routeScore({ durationS: 1000, ruralM: 0 })).toBe(1000);
    expect(routeScore({ durationS: 1000, ruralM: 5000 })).toBe(1600);
  });

  it('recommends a slightly slower main road over a quicker lane', () => {
    // 20 km of unnumbered 5 km lane steps: 600 s faster than main roads would be, minus the penalty.
    const lane: MapboxRoute = { duration: 1000, distance: 20_000, geometry: { coordinates: [[-1, 51], [-0.8, 51.2]] }, legs: [{ steps: Array.from({ length: 4 }, () => road('tertiary', 5000, 250)) }] };
    const main = route(1100, 22_000, 'primary');
    const r = buildRouteOptions([[lane, main]]);
    expect(r.alternatives![0].kind).toBe('recommended');
    expect(r.alternatives![0].durationS).toBe(1100);
    expect(r.alternatives![0].ruralM ?? 0).toBe(0);
    // The quicker lane route is still offered.
    expect(r.standard.durationS).toBe(1000);
  });

  it('warns when even the best route needs 3 km or more of country road', () => {
    const lane: MapboxRoute = { duration: 1000, distance: 10_000, geometry: { coordinates: [[-1, 51], [-0.8, 51.2]] }, legs: [{ steps: [road('tertiary', 5000, 500), road('primary', 5000, 500)] }] };
    const r = buildRouteOptions([[lane]]);
    expect(r.countryRoadWarning).not.toBeNull();
    expect(r.countryRoadWarning!.ruralKm).toBe(5);
    expect(buildRouteOptions([[route(1000, 10_000)]]).countryRoadWarning).toBeNull();
  });
});
