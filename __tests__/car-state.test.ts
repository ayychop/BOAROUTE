import { EMPTY_CAR_CONTEXT, carDisplayState, carHazards, carPath, type CarContext, type CarNavState } from '../src/car/car-state';
import type { HazardReport } from '../src/lib/hazards';
import type { LngLat } from '../supabase/functions/_shared/route-analysis';

const base: CarNavState = {
  title: 'Tuesday route',
  instruction: 'Turn left onto High Street',
  distanceToNextM: 300,
  arrivalMs: Date.UTC(2026, 9, 27, 14, 32),
  remainingM: 20_000,
  remainingS: 1_500,
  stops: ['Currys Aylesbury', 'Argos Thame', 'Currys Oxford'],
  arrived: false,
  rerouting: false,
};

const ctx: CarContext = {
  upcoming: [
    { id: 's1', name: 'Currys Aylesbury' },
    { id: 's2', name: 'Argos Thame' },
  ],
  storeIds: { 'Currys Aylesbury': 's1', 'Argos Thame': 's2' },
  visit: null,
  lockMs: 25 * 60_000,
};

const extra = { metric: false, position: null, hazards: [] };

describe('Android Auto car state', () => {
  it('has no route and nothing to start before the phone has data', () => {
    const s = carDisplayState(null, EMPTY_CAR_CONTEXT, extra);
    expect(s.route).toBeNull();
    expect(s.visit).toBeNull();
    expect(s.start).toBeNull();
  });

  it('carries the live route with the next stop', () => {
    const s = carDisplayState(base, ctx, extra);
    expect(s.route).toMatchObject({ title: 'Tuesday route', instruction: 'Turn left onto High Street', distanceToNextM: 300, nextStop: 'Currys Aylesbury' });
  });

  it('offers Start Visit for the next route stop', () => {
    expect(carDisplayState({ ...base, stops: ['Argos Thame'] }, ctx, extra).start).toEqual({ storeId: 's2', storeName: 'Argos Thame' });
  });

  it('falls back to the most pressing store when the next stop is not a store', () => {
    expect(carDisplayState({ ...base, stops: ['Home'] }, ctx, extra).start).toEqual({ storeId: 's1', storeName: 'Currys Aylesbury' });
    expect(carDisplayState(null, ctx, extra).start).toEqual({ storeId: 's1', storeName: 'Currys Aylesbury' });
  });

  it('swaps Start Visit for the running visit and its 25-minute lock', () => {
    const startedAt = '2026-10-27T10:00:00.000Z';
    const s = carDisplayState(base, { ...ctx, visit: { storeName: 'Argos Thame', startedAt } }, extra);
    expect(s.start).toBeNull();
    expect(s.visit).toEqual({ storeName: 'Argos Thame', startedAtMs: Date.parse(startedAt), lockMs: 25 * 60_000 });
  });

  it('lists the route stops ahead for the side panel, with ids where they are stores', () => {
    expect(carDisplayState(base, ctx, extra).upcoming).toEqual([
      { storeId: 's1', name: 'Currys Aylesbury' },
      { storeId: 's2', name: 'Argos Thame' },
      { storeId: null, name: 'Currys Oxford' },
    ]);
  });

  it('lists the most pressing stores when no route is running, and nothing before the phone has data', () => {
    expect(carDisplayState(null, ctx, extra).upcoming).toEqual([
      { storeId: 's1', name: 'Currys Aylesbury' },
      { storeId: 's2', name: 'Argos Thame' },
    ]);
    expect(carDisplayState(null, EMPTY_CAR_CONTEXT, extra).upcoming).toEqual([]);
  });

  it('drops a visit with an unreadable start time rather than showing a broken clock', () => {
    expect(carDisplayState(null, { ...ctx, visit: { storeName: 'X', startedAt: 'nope' } }, extra).visit).toBeNull();
  });
});

describe('car map data', () => {
  it('thins a long route line but keeps both ends, as lat/lng pairs', () => {
    const line: LngLat[] = Array.from({ length: 1001 }, (_, i) => [-0.75, 51 + i * 0.001]);
    const flat = carPath(line, 400);
    expect(flat.length / 2).toBeLessThanOrEqual(401);
    expect(flat.slice(0, 2)).toEqual([51, -0.75]);
    expect(flat.slice(-2)).toEqual([line[1000][1], -0.75]);
  });

  it('sends only nearby cameras and police, nearest first', () => {
    const at = (id: string, type: HazardReport['hazard_type'], lat: number): HazardReport => ({ id, user_id: 'u', hazard_type: type, latitude: lat, longitude: -0.75, is_active: true, created_at: new Date().toISOString() });
    const list = [at('far', 'speed_camera', 52), at('cam', 'speed_camera', 51.62), at('cop', 'police', 51.61), at('crash', 'accident', 51.6)];
    expect(carHazards(list, { lat: 51.6, lng: -0.75 })).toEqual([
      { lat: 51.61, lng: -0.75, type: 'police' },
      { lat: 51.62, lng: -0.75, type: 'speed_camera' },
    ]);
  });
});
