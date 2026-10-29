import {
  buildOverpassQuery,
  overpassElementToCamera,
  overpassElementsToCameras,
  parseBbox,
  parseDirection,
  type OverpassElement,
} from '../supabase/functions/_shared/cameras';
import { bboxAround } from '../src/lib/geo';

describe('buildOverpassQuery', () => {
  const q = buildOverpassQuery();
  it('pins the query to the UK bounding box (lighter than an area filter)', () => {
    expect(q).toContain('(49.8,-8.65,61.1,1.8)');
    expect(q).not.toContain('ISO3166-1');
  });
  it('asks for both camera node kinds', () => {
    expect(q).toContain('node["highway"="speed_camera"]');
    expect(q).toContain('node["enforcement"="maxspeed"]');
  });
  it('returns JSON with a generous timeout', () => {
    expect(q).toContain('[out:json][timeout:180]');
  });
  it('accepts a custom bounding box', () => {
    expect(buildOverpassQuery([51.48, -0.98, 51.78, -0.52])).toContain('(51.48,-0.98,51.78,-0.52)');
  });
});

describe('parseBbox', () => {
  it('parses a valid south,west,north,east string', () => {
    expect(parseBbox('51.48,-0.98,51.78,-0.52')).toEqual([51.48, -0.98, 51.78, -0.52]);
  });
  it.each([
    ['empty', undefined],
    ['too few parts', '51.48,-0.98,51.78'],
    ['non-numeric', '51.48,a,51.78,-0.52'],
    ['south past north', '51.78,-0.98,51.48,-0.52'],
    ['west past east', '51.48,-0.52,51.78,-0.98'],
    ['out of range', '91,-0.98,92,-0.52'],
  ])('rejects %s', (_label, input) => {
    expect(parseBbox(input as string | undefined)).toBeNull();
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
