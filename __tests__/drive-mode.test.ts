import { ARRIVED_M, burnInOffset, clockButtonState, metresBetween, nearestStores } from '../src/lib/drive-mode';
import { MIN_VISIT_MS } from '../src/lib/visit-timer';

const startedAt = new Date(2026, 9, 29, 10, 0).toISOString();
const t0 = new Date(startedAt).getTime();
const base = { storeId: 's1', storeName: 'Tesco Reading', activeStoreName: 'Tesco Reading', visitsLeft: 1, now: t0 };

describe('screen saver clock button', () => {
  it('asks for a store before clocking in', () => {
    const s = clockButtonState({ ...base, activeVisit: null, storeId: null, storeName: null });
    expect(s.kind).toBe('pick');
    expect(s.label).toBe('Clock In');
  });

  it('clocks in at the chosen store', () => {
    const s = clockButtonState({ ...base, activeVisit: null });
    expect(s).toMatchObject({ kind: 'start', label: 'Clock In', sub: 'Tesco Reading' });
  });

  it('refuses at the OM weekly limit', () => {
    const s = clockButtonState({ ...base, activeVisit: null, visitsLeft: 0 });
    expect(s.kind).toBe('limit');
    expect(s.sub).toContain('weekly limit');
  });

  it('is locked for the first 25 minutes, then free to clock out', () => {
    const visit = { storeId: 's1', startedAt };
    const early = clockButtonState({ ...base, activeVisit: visit, now: t0 + 10 * 60_000 });
    expect(early.kind).toBe('locked');
    expect(early.label).toBe('Clock Out');
    expect(early.kind === 'locked' && early.remainingMs).toBe(MIN_VISIT_MS - 10 * 60_000);

    const done = clockButtonState({ ...base, activeVisit: visit, now: t0 + 26 * 60_000 });
    expect(done.kind).toBe('complete');
    expect(done.label).toBe('Clock Out');
  });

  it('stays on the active visit even when a different store is picked or the limit is hit', () => {
    const s = clockButtonState({ ...base, activeVisit: { storeId: 's2', startedAt }, activeStoreName: 'Boots', storeId: 's1', visitsLeft: 0, now: t0 + 30 * 60_000 });
    expect(s).toMatchObject({ kind: 'complete', sub: 'Boots' });
  });
});

describe('distance helpers', () => {
  it('measures great-circle metres', () => {
    expect(metresBetween({ lat: 51, lng: 0 }, { lat: 52, lng: 0 })).toBeGreaterThan(111_000);
    expect(metresBetween({ lat: 51, lng: 0 }, { lat: 52, lng: 0 })).toBeLessThan(111_400);
    expect(metresBetween({ lat: 51, lng: 0 }, { lat: 51, lng: 0 })).toBe(0);
  });

  it('sorts stores by distance and drops those without coordinates', () => {
    const stores = [
      { id: 'far', latitude: 51.6, longitude: -0.1 },
      { id: 'none', latitude: null, longitude: null },
      { id: 'near', latitude: 51.5005, longitude: -0.1 },
    ];
    const out = nearestStores({ lat: 51.5, lng: -0.1 }, stores);
    expect(out.map((r) => r.store.id)).toEqual(['near', 'far']);
    expect(out[0].distanceM).toBeLessThan(ARRIVED_M);
    expect(out[1].distanceM).toBeGreaterThan(ARRIVED_M);
  });

  it('keeps list order without a fix and honours the limit', () => {
    const stores = Array.from({ length: 9 }, (_, i) => ({ id: String(i), latitude: 51 + i / 100, longitude: 0 }));
    expect(nearestStores(null, stores, 3).map((r) => r.store.id)).toEqual(['0', '1', '2']);
    expect(nearestStores(null, stores)[0].distanceM).toBeNull();
  });
});

describe('burn-in drift', () => {
  it('stays within range and keeps moving', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 600; m++) {
      const o = burnInOffset(m, 18);
      expect(Math.abs(o.x)).toBeLessThanOrEqual(18);
      expect(Math.abs(o.y)).toBeLessThanOrEqual(18);
      seen.add(`${o.x},${o.y}`);
    }
    expect(seen.size).toBeGreaterThan(20);
  });
});
