import { MAX_WAYPOINTS, buildDirectionsUrl, legDirectionsUrl, optionDirectionsUrl } from '../src/lib/navigation';

const p = (i: number) => ({ lat: 51 + i / 100, lng: -1 + i / 100 });
const decode = (url: string) => new URL(url).searchParams;

describe('Google Maps links', () => {
  it('puts start, stops and destination in order', () => {
    const q = decode(buildDirectionsUrl({ points: [p(0), p(1), p(2), p(0)] }));
    expect(q.get('origin')).toBe('51.000000,-1.000000');
    expect(q.get('destination')).toBe('51.000000,-1.000000');
    expect(q.get('waypoints')).toBe('51.010000,-0.990000|51.020000,-0.980000');
    expect(q.get('travelmode')).toBe('driving');
  });

  it('inserts motorway via points before the stop they lead to', () => {
    const url = optionDirectionsUrl([p(0), p(1), p(0)], { legs: [{ via: [-0.5, 51.5] }, { via: null }] as never });
    expect(decode(url).get('waypoints')).toBe('51.500000,-0.500000|51.010000,-0.990000');
  });

  it('never exceeds the waypoint limit and keeps every stop', () => {
    const points = [p(0), ...Array.from({ length: 8 }, (_, i) => p(i + 1)), p(0)];
    const vias = points.slice(1).map(() => [-0.5, 51.5] as [number, number]);
    const wps = decode(buildDirectionsUrl({ points, vias })).get('waypoints')!.split('|');
    expect(wps.length).toBeLessThanOrEqual(MAX_WAYPOINTS);
    for (let i = 1; i <= 8; i++) expect(wps).toContain(`${p(i).lat.toFixed(6)},${p(i).lng.toFixed(6)}`);
  });

  it('builds a single-leg link from the current location', () => {
    const q = decode(legDirectionsUrl(p(3), [-0.5, 51.5]));
    expect(q.get('origin')).toBeNull();
    expect(q.get('destination')).toBe('51.030000,-0.970000');
    expect(q.get('waypoints')).toBe('51.500000,-0.500000');
  });

  it('rejects a single point', () => {
    expect(() => buildDirectionsUrl({ points: [p(0)] })).toThrow();
  });
});
