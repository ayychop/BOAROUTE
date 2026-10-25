import seed from '../src/data/seed-stores.json';
import { DEFAULT_FREQUENCIES, managersFor } from '../src/lib/frequency';
import { haversineKm } from '../src/lib/geo';
import {
  computeDue,
  monthProgress,
  nearestNeighbourOrder,
  planDayRoute,
  planWaypoints,
  storesInScope,
  twoOpt,
  type RoutableStore,
} from '../src/lib/route-engine';
import type { Grade, Manager } from '../src/lib/types';

const HP13 = { lat: 51.640425, lng: -0.734715 }; // HP13 6BU
const now = new Date(2026, 9, 12, 9, 0);

// Jo's patch only, so cluster distances reflect a single region.
const stores: RoutableStore[] = (seed as { name: string; address: string; grade: string; manager: string; latitude: number; longitude: number }[])
  .filter((s) => s.manager === 'Joseph')
  .map((s, i) => ({
  id: `s${i}`,
  name: s.name,
  address: s.address,
  grade: s.grade as Grade,
  assigned_manager: 'Joseph' as Manager,
  latitude: s.latitude,
  longitude: s.longitude,
  last_visit_date: null,
}));

describe('scope', () => {
  const owners: Manager[] = ['Joseph', 'Pete', 'David'];
  const mixed = stores.map((s, i) => ({ ...s, assigned_manager: owners[i % 3] }));
  it('admin (Jo) routes Joseph stores only', () => {
    const jo = storesInScope(mixed, managersFor({ role: 'admin', route_managers: null }));
    expect(jo.length).toBeGreaterThan(0);
    expect(jo.every((s) => s.assigned_manager === 'Joseph')).toBe(true);
  });
  it('Sarah routes Joseph and Pete stores', () => {
    const sarah = storesInScope(mixed, managersFor({ role: 'user', route_managers: null }));
    expect(new Set(sarah.map((s) => s.assigned_manager))).toEqual(new Set(['Joseph', 'Pete']));
  });
  it('David routes David stores', () => {
    const david = storesInScope(mixed, managersFor({ role: 'user', route_managers: ['David'] }));
    expect(david.length).toBeGreaterThan(0);
    expect(david.every((s) => s.assigned_manager === 'David')).toBe(true);
  });
});

describe('computeDue', () => {
  it('skips stores that already met their target and ranks A above D', () => {
    const a = stores.find((s) => s.grade === 'A')!;
    const d = stores.find((s) => s.grade === 'D')!;
    const due = computeDue([a, d], { [a.id]: { count: 0, last: null }, [d.id]: { count: 0, last: null } }, DEFAULT_FREQUENCIES, now);
    expect(due.map((x) => x.store.id)).toEqual([a.id, d.id]);
    expect(due[0].remaining).toBe(4);
    const done = computeDue([d], { [d.id]: { count: 1, last: now.toISOString() } }, DEFAULT_FREQUENCIES, now);
    expect(done).toHaveLength(0);
  });

  it('respects custom targets (zero means never due)', () => {
    const due = computeDue(stores, {}, { A: 0, B: 0, C: 0, D: 1 }, now);
    expect(due.every((x) => x.store.grade === 'D')).toBe(true);
  });
});

describe('planDayRoute', () => {
  it('plans a compact route from HP13 6BU with at most maxStops stops', () => {
    const plan = planDayRoute(stores, {}, DEFAULT_FREQUENCIES, HP13, { maxStops: 6, now });
    expect(plan.stops).toHaveLength(6);
    expect(plan.dueCount).toBe(78);
    expect(new Set(plan.stops.map((s) => s.store.id)).size).toBe(6);
    expect(plan.returnLeg).not.toBeNull();
    expect(plan.totalKm).toBeGreaterThan(0);
    expect(plan.driveMinutes).toBeGreaterThan(0);
    expect(plan.onSiteMinutes).toBe(240);
    // Compact: every stop within 45 km of the first (most urgent) cluster centre.
    const first = plan.stops[0].store;
    for (const s of plan.stops) {
      expect(haversineKm({ lat: first.latitude!, lng: first.longitude! }, { lat: s.store.latitude!, lng: s.store.longitude! })).toBeLessThan(45);
    }
    // Arrival times increase along the route.
    for (let i = 1; i < plan.stops.length; i++) expect(plan.stops[i].arriveMinute).toBeGreaterThan(plan.stops[i - 1].arriveMinute);
  });

  it('returns an empty plan when everything is done', () => {
    const tallies = Object.fromEntries(stores.map((s) => [s.id, { count: 10, last: now.toISOString() }]));
    const plan = planDayRoute(stores, tallies, DEFAULT_FREQUENCIES, HP13, { now });
    expect(plan.stops).toHaveLength(0);
    expect(plan.returnLeg).toBeNull();
    expect(plan.totalKm).toBe(0);
  });

  it('reports stores without coordinates instead of crashing', () => {
    const broken = [{ ...stores[0], latitude: null, longitude: null }, stores[1]];
    const plan = planDayRoute(broken, {}, DEFAULT_FREQUENCIES, HP13, { now });
    expect(plan.unlocated.map((s) => s.id)).toEqual([stores[0].id]);
    expect(plan.stops.map((s) => s.store.id)).toEqual([stores[1].id]);
  });

  it('clamps maxStops to the supported range', () => {
    expect(planDayRoute(stores, {}, DEFAULT_FREQUENCIES, HP13, { maxStops: 50, now }).stops).toHaveLength(8);
    expect(planDayRoute(stores, {}, DEFAULT_FREQUENCIES, HP13, { maxStops: 0, now }).stops).toHaveLength(1);
  });

  it('builds waypoints start, stops, home', () => {
    const plan = planDayRoute(stores, {}, DEFAULT_FREQUENCIES, HP13, { maxStops: 3, now });
    const pts = planWaypoints(plan, HP13);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual(HP13);
    expect(pts[4]).toEqual(HP13);
  });
});

describe('ordering', () => {
  const at = (p: { lat: number; lng: number }) => p;
  it('2-opt never makes a path longer than nearest neighbour', () => {
    const pts = stores.slice(0, 8).map((s) => ({ lat: s.latitude!, lng: s.longitude! }));
    const len = (o: typeof pts) => o.reduce((acc, p, i) => acc + haversineKm(i === 0 ? HP13 : o[i - 1], p), 0) + haversineKm(o[o.length - 1], HP13);
    const nn = nearestNeighbourOrder(HP13, pts, at);
    const opt = twoOpt(HP13, nn, at, true);
    expect(len(opt)).toBeLessThanOrEqual(len(nn) + 1e-9);
    expect(opt).toHaveLength(8);
  });
});

describe('monthProgress', () => {
  it('caps each store at its target', () => {
    const two = stores.slice(0, 2);
    const p = monthProgress(two, { [two[0].id]: { count: 99, last: null } }, DEFAULT_FREQUENCIES);
    expect(p.done).toBe(DEFAULT_FREQUENCIES[two[0].grade]);
    expect(p.target).toBe(DEFAULT_FREQUENCIES[two[0].grade] + DEFAULT_FREQUENCIES[two[1].grade]);
  });
});
