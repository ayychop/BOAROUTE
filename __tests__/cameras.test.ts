import {
  buildOverpassQuery,
  overpassElementToCamera,
  overpassElementsToCameras,
  parseDirection,
  type OverpassElement,
} from '../supabase/functions/_shared/cameras';
import { bboxAround } from '../src/lib/geo';

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery();
  it('pins the query to Great Britain', () => {
    expect(q).toContain('"ISO3166-1"="GB"');
  });
  it('asks for both camera node kinds', () => {
    expect(q).toContain('node["highway"="speed_camera"]');
    expect(q).toContain('node["enforcement"="maxspeed"]');
  });
  it('returns JSON with a generous timeout', () => {
    expect(q).toContain('[out:json][timeout:180]');
  });
});

describe('parseDirection', () => {
  it.each([
    ['N', 0],
    ['SW', 225],
    ['nnw', 338],
    ['90', 90],
    ['450', 90],
    ['-90', 270],
  ])('reads %s as %d', (input, deg) => {
    expect(parseDirection(input)).toBe(deg);
  });
  it.each([undefined, '', 'sideways'])('rejects %s', (input) => {
    expect(parseDirection(input)).toBeNull();
  });
});

describe('overpassElementToCamera', () => {
  const node = (over: Partial<OverpassElement> = {}): OverpassElement => ({
    type: 'node',
    id: 42,
    lat: 51.5,
    lon: -0.12,
    ...over,
  });

  it('maps a valid node with its tags', () => {
    expect(
      overpassElementToCamera(node({ tags: { highway: 'speed_camera', direction: 'N', maxspeed: '40 mph', ref: 'A4' } })),
    ).toEqual({ osm_id: 42, latitude: 51.5, longitude: -0.12, direction: 0, maxspeed: '40 mph', ref: 'A4' });
  });

  it('defaults missing optional tags to null', () => {
    expect(overpassElementToCamera(node())).toEqual({ osm_id: 42, latitude: 51.5, longitude: -0.12, direction: null, maxspeed: null, ref: null });
  });

  it('falls back to maxspeed:forward', () => {
    expect(overpassElementToCamera(node({ tags: { 'maxspeed:forward': '50' } }))?.maxspeed).toBe('50');
  });

  it.each([
    ['a way', { type: 'way' }],
    ['no latitude', { lat: undefined }],
    ['an out-of-range coordinate', { lat: 120 }],
  ])('rejects %s', (_label, over) => {
    expect(overpassElementToCamera(node(over as Partial<OverpassElement>))).toBeNull();
  });
});

describe('overpassElementsToCameras', () => {
  it('drops unusable nodes and de-dupes by osm_id', () => {
    const rows = overpassElementsToCameras([
      { type: 'node', id: 1, lat: 51, lon: -1 },
      { type: 'way', id: 2, lat: 51, lon: -1 }, // dropped
      { type: 'node', id: 1, lat: 52, lon: -2 }, // replaces id 1
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ osm_id: 1, latitude: 52, longitude: -2 });
  });
});

describe('bboxAround', () => {
  const box = bboxAround({ lat: 51.5, lng: -0.1 }, 25);
  it('brackets the centre', () => {
    expect(box.minLat).toBeLessThan(51.5);
    expect(box.maxLat).toBeGreaterThan(51.5);
    expect(box.minLng).toBeLessThan(-0.1);
    expect(box.maxLng).toBeGreaterThan(-0.1);
  });
  it('widens longitude more than latitude at UK latitudes', () => {
    const latSpan = box.maxLat - box.minLat;
    const lngSpan = box.maxLng - box.minLng;
    expect(lngSpan).toBeGreaterThan(latSpan);
  });
});
