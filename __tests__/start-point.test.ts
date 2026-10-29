import { encodeNavRequest, decodeNavRequest } from '../src/lib/nav-request';
import { parseStartPoint, resolveStartPoint, startPointLabel } from '../src/lib/start-point';
import { canChangeGrade } from '../src/lib/visit-limits';

describe('start point', () => {
  it('defaults to home', () => {
    expect(parseStartPoint(null)).toEqual({ kind: 'home' });
    expect(parseStartPoint('{bad json')).toEqual({ kind: 'home' });
    expect(parseStartPoint(JSON.stringify({ kind: 'teleport' }))).toEqual({ kind: 'home' });
  });

  it('round-trips each kind', () => {
    for (const p of [{ kind: 'home' }, { kind: 'here' }, { kind: 'store', storeId: 's1' }, { kind: 'custom', label: 'Mum', lat: 51.5, lng: -0.1 }] as const) {
      expect(parseStartPoint(JSON.stringify(p))).toEqual(p);
    }
  });

  it('rejects custom points that are out of range or incomplete', () => {
    expect(parseStartPoint(JSON.stringify({ kind: 'custom', label: 'x', lat: 123, lng: 0 }))).toEqual({ kind: 'home' });
    expect(parseStartPoint(JSON.stringify({ kind: 'custom', label: 'x', lat: 51 }))).toEqual({ kind: 'home' });
    expect(parseStartPoint(JSON.stringify({ kind: 'store', storeId: '' }))).toEqual({ kind: 'home' });
  });

  it('migrates the older store-only preference', () => {
    expect(parseStartPoint(null, 'old-store')).toEqual({ kind: 'store', storeId: 'old-store' });
    // A saved choice wins over the legacy one.
    expect(parseStartPoint(JSON.stringify({ kind: 'here' }), 'old-store')).toEqual({ kind: 'here' });
  });

  it('describes and resolves each kind', () => {
    const ctx = { home: { lat: 1, lng: 1 }, here: { lat: 2, lng: 2 }, store: { lat: 3, lng: 3 } };
    expect(resolveStartPoint({ kind: 'home' }, ctx)).toEqual(ctx.home);
    expect(resolveStartPoint({ kind: 'here' }, ctx)).toEqual(ctx.here);
    expect(resolveStartPoint({ kind: 'store', storeId: 's' }, ctx)).toEqual(ctx.store);
    expect(resolveStartPoint({ kind: 'store', storeId: 's' }, { ...ctx, store: null })).toEqual(ctx.home);
    expect(resolveStartPoint({ kind: 'custom', label: 'x', lat: 9, lng: 8 }, ctx)).toEqual({ lat: 9, lng: 8 });
    expect(resolveStartPoint({ kind: 'here' }, { ...ctx, here: null })).toBeNull();

    expect(startPointLabel({ kind: 'here' }, {})).toBe('Current location');
    expect(startPointLabel({ kind: 'home' }, { homeLabel: 'HP13 6BU' })).toBe('Home · HP13 6BU');
    expect(startPointLabel({ kind: 'store', storeId: 's' }, { storeName: 'Tesco' })).toBe('Tesco');
    expect(startPointLabel({ kind: 'custom', label: 'Mum', lat: 1, lng: 1 }, {})).toBe('Mum');
  });
});

describe('navigation request route choice', () => {
  const to = [{ lat: 51.45, lng: -0.97, label: 'Reading' }];

  it('defaults to the recommended (country roads penalised) option', () => {
    const raw = JSON.stringify({ from: 'here', to });
    expect(decodeNavRequest(raw)?.prefer).toBe('recommended');
  });

  it('keeps every valid kind and rejects unknown ones', () => {
    for (const prefer of ['recommended', 'standard', 'motorway', 'shortest', 'alternative'] as const) {
      expect(decodeNavRequest(encodeNavRequest({ from: 'here', to, prefer, title: 'x' }))?.prefer).toBe(prefer);
    }
    expect(decodeNavRequest(JSON.stringify({ from: 'here', to, prefer: 'scenic' }))?.prefer).toBe('recommended');
  });

  it('carries which alternative was chosen, within bounds', () => {
    expect(decodeNavRequest(encodeNavRequest({ from: 'here', to, prefer: 'alternative', optionIndex: 2, title: 'x' }))?.optionIndex).toBe(2);
    expect(decodeNavRequest(JSON.stringify({ from: 'here', to, optionIndex: 99 }))).not.toHaveProperty('optionIndex');
    expect(decodeNavRequest(JSON.stringify({ from: 'here', to, optionIndex: -1 }))).not.toHaveProperty('optionIndex');
    expect(decodeNavRequest(JSON.stringify({ from: 'here', to, optionIndex: 1.5 }))).not.toHaveProperty('optionIndex');
  });
});

describe('grade lock for OMs', () => {
  it('lets only an admin (or an OTM) change a store grade', () => {
    expect(canChangeGrade('OM', false)).toBe(false);
    expect(canChangeGrade('OM', true)).toBe(true);
    expect(canChangeGrade('OTM', false)).toBe(true);
    expect(canChangeGrade(null, false)).toBe(true);
  });
});
