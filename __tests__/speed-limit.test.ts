import { isSpeeding, limitAt, mpsToMph, parseMaxspeed, wayLimitMph, type OsmWay } from '../src/lib/speed-limit';

describe('parseMaxspeed', () => {
  it('reads UK mph tags', () => {
    expect(parseMaxspeed('30 mph')).toBe(30);
    expect(parseMaxspeed('70mph')).toBe(70);
  });

  it('treats bare numbers as km/h, rounded to the nearest 5 mph', () => {
    expect(parseMaxspeed('50')).toBe(30);
    expect(parseMaxspeed('100')).toBe(60);
    expect(parseMaxspeed('120')).toBe(75);
  });

  it('maps UK national limit codes', () => {
    expect(parseMaxspeed('GB:nsl_single')).toBe(60);
    expect(parseMaxspeed('GB:nsl_dual')).toBe(70);
    expect(parseMaxspeed('GB:motorway')).toBe(70);
    expect(parseMaxspeed('GB:urban')).toBe(30);
  });

  it('takes the first of several values and rejects the unreadable', () => {
    expect(parseMaxspeed('20 mph;30 mph')).toBe(20);
    expect(parseMaxspeed('none')).toBeNull();
    expect(parseMaxspeed('signals')).toBeNull();
    expect(parseMaxspeed('fast')).toBeNull();
    expect(parseMaxspeed('0')).toBeNull();
    expect(parseMaxspeed('')).toBeNull();
    expect(parseMaxspeed(null)).toBeNull();
  });
});

describe('wayLimitMph', () => {
  it('prefers maxspeed, then the type tag, then the motorway default', () => {
    expect(wayLimitMph({ maxspeed: '40 mph', 'maxspeed:type': 'GB:nsl_single' })).toBe(40);
    expect(wayLimitMph({ 'maxspeed:type': 'GB:nsl_single' })).toBe(60);
    expect(wayLimitMph({ highway: 'motorway' })).toBe(70);
    expect(wayLimitMph({ highway: 'residential' })).toBeNull();
  });
});

// Roads either side of a point at 51.5, -0.1.
const here = { lat: 51.5, lng: -0.1 };
const eastWest = (id: number, limit: string, lat = 51.5): OsmWay => ({
  id,
  tags: { highway: 'primary', maxspeed: limit },
  geometry: [
    { lat, lon: -0.101 },
    { lat, lon: -0.099 },
  ],
});
const northSouth = (id: number, limit: string): OsmWay => ({
  id,
  tags: { highway: 'residential', maxspeed: limit },
  geometry: [
    { lat: 51.499, lon: -0.1 },
    { lat: 51.501, lon: -0.1 },
  ],
});

describe('limitAt', () => {
  it('finds the limit of the road underneath', () => {
    expect(limitAt(here, 90, [eastWest(1, '40 mph')])).toBe(40);
  });

  it('returns null when no known road is within 30 m', () => {
    // 0.001 degrees of latitude is about 111 m.
    expect(limitAt(here, 90, [eastWest(1, '40 mph', 51.501)])).toBeNull();
    expect(limitAt(here, 90, [])).toBeNull();
  });

  it('prefers the road running the same way as the car at a junction', () => {
    const ways = [eastWest(1, '60 mph'), northSouth(2, '30 mph')];
    expect(limitAt(here, 90, ways)).toBe(60);
    expect(limitAt(here, 270, ways)).toBe(60);
    expect(limitAt(here, 0, ways)).toBe(30);
    expect(limitAt(here, 180, ways)).toBe(30);
  });

  it('skips roads with no known limit', () => {
    const unknown: OsmWay = { id: 3, tags: { highway: 'residential' }, geometry: eastWest(0, '1').geometry };
    expect(limitAt(here, 90, [unknown, eastWest(4, '50 mph', 51.50015)])).toBe(50);
  });
});

describe('speeding', () => {
  it('only counts more than 1 mph over', () => {
    expect(isSpeeding(31, 30)).toBe(false);
    expect(isSpeeding(32, 30)).toBe(true);
    expect(isSpeeding(80, 70)).toBe(true);
  });

  it('is never true with an unknown speed or limit', () => {
    expect(isSpeeding(null, 30)).toBe(false);
    expect(isSpeeding(50, null)).toBe(false);
  });

  it('converts GPS metres per second to mph', () => {
    expect(mpsToMph(13.4112)).toBeCloseTo(30, 1);
    expect(mpsToMph(null)).toBeNull();
    expect(mpsToMph(-1)).toBeNull();
  });
});
