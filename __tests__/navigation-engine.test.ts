import {
  buildRouteOptions,
  decodePolyline,
  googleRoadClass,
  googleRouteToMapbox,
  stripHtml,
  type GoogleRoute,
  type LngLat,
} from '../supabase/functions/_shared/route-analysis';
import { HAZARD_MAX_AGE_MS, hazardMeta, isLiveHazard, reportedAgo } from '../src/lib/hazards';
import { decodeNavRequest, encodeNavRequest, MAX_NAV_STOPS } from '../src/lib/nav-request';
import { ARRIVED_M, formatNavDistance, OFF_ROUTE_M, prepareRoute, progressAt, remainingWaypoints } from '../src/lib/nav-progress';

/** Encodes [lng, lat] pairs the way Google does, so fixtures stay readable. */
function encodePolyline(points: LngLat[]): string {
  let out = '';
  let pLat = 0;
  let pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) {
      s += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e5);
    const ln = Math.round(lng * 1e5);
    out += enc(la - pLat) + enc(ln - pLng);
    pLat = la;
    pLng = ln;
  }
  return out;
}

describe('Google Directions adapter', () => {
  it('decodes Google polylines (reference example)', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('strips HTML instructions to plain speech-friendly text', () => {
    expect(stripHtml('Turn <b>left</b> onto <b>A404</b><div style="font-size:0.9em">Toll road</div>')).toBe('Turn left onto A404. Toll road');
    expect(stripHtml('Keep&nbsp;right at the fork')).toBe('Keep right at the fork');
  });

  it('classifies UK roads from the instruction text', () => {
    expect(googleRoadClass('Merge onto M4')).toBe('motorway');
    expect(googleRoadClass('Take the A404(M) exit')).toBe('motorway');
    expect(googleRoadClass('Turn left onto A329')).toBe('primary');
    expect(googleRoadClass('Continue onto B3018')).toBe('secondary');
    expect(googleRoadClass('Turn right onto Pinkneys Lane')).toBe('street');
  });

  const step = (from: LngLat, to: LngLat, metres: number, seconds: number, html: string) => ({
    distance: { value: metres },
    duration: { value: seconds },
    html_instructions: html,
    polyline: { points: encodePolyline([from, to]) },
    start_location: { lat: from[1], lng: from[0] },
  });

  // Two ways from High Wycombe to Reading: M40/M4 (longer, mostly motorway) or lanes (shorter, slightly faster).
  const viaMotorway: GoogleRoute = {
    legs: [
      {
        distance: { value: 42000 },
        duration: { value: 2400 },
        duration_in_traffic: { value: 2700 },
        steps: [
          step([-0.75, 51.63], [-0.8, 51.6], 2000, 240, 'Head south on <b>A404</b>'),
          step([-0.8, 51.6], [-0.95, 51.47], 38000, 1980, 'Merge onto <b>M4</b>'),
          step([-0.95, 51.47], [-0.97, 51.455], 2000, 180, 'Turn right onto <b>Oxford Road</b>'),
        ],
      },
    ],
  };
  const viaLanes: GoogleRoute = {
    legs: [
      {
        distance: { value: 30000 },
        duration: { value: 2300 },
        duration_in_traffic: { value: 2500 },
        steps: [
          step([-0.75, 51.63], [-0.85, 51.55], 15000, 1150, 'Turn left onto <b>Marlow Bottom</b>'),
          step([-0.85, 51.55], [-0.97, 51.455], 15000, 1150, 'Continue onto <b>Henley Lane</b>'),
        ],
      },
    ],
  };

  it('uses live-traffic durations and keeps steps for the navigator', () => {
    const r = googleRouteToMapbox(viaMotorway);
    expect(r.duration).toBe(2700);
    expect(r.duration_typical).toBe(2400);
    expect(r.distance).toBe(42000);
    expect(r.legs[0].steps[1].maneuver?.instruction).toBe('Merge onto M4');
    expect(r.geometry?.coordinates.length).toBe(6);
    // Traffic delay is spread over the steps in proportion.
    const stepTotal = r.legs[0].steps.reduce((a, s) => a + s.duration, 0);
    expect(stepTotal).toBeCloseTo(2700, 5);
  });

  it('picks the motorway for the motorway-preferred option and the quickest for standard', () => {
    const options = buildRouteOptions([[viaLanes, viaMotorway].map(googleRouteToMapbox)], new Date(2026, 9, 25), 'google');
    expect(options.source).toBe('google');
    expect(options.standard.durationS).toBe(2500);
    expect(options.motorway.durationS).toBe(2700);
    expect(options.motorway.roads).toContain('M4');
    expect(options.motorway.available).toBe(true);
    expect(options.identical).toBe(false);
    expect(options.motorway.steps.map((s) => s.instruction)).toEqual(['Head south on A404', 'Merge onto M4', 'Turn right onto Oxford Road']);
    expect(options.standard.steps).toHaveLength(2);
  });
});

describe('navigation progress', () => {
  // A straight road north, about 1.1 km between vertices.
  const line: LngLat[] = [0, 1, 2, 3, 4].map((i) => [-0.75, 51.6 + i * 0.01]);
  const steps = [
    { instruction: 'Head north', distanceM: 1100, durationS: 60, location: line[0] },
    { instruction: 'Turn left onto A404', distanceM: 2200, durationS: 120, location: line[2] },
    { instruction: 'Arrive', distanceM: 0, durationS: 0, location: line[4] },
  ];
  const route = prepareRoute(line, steps);

  it('measures the route', () => {
    expect(route.totalM).toBeGreaterThan(4400);
    expect(route.totalM).toBeLessThan(4500);
    expect(route.stepVertex).toEqual([0, 2, 4]);
  });

  it('finds the next turn and the distance to it', () => {
    const p = progressAt(route, { lat: 51.6101, lng: -0.75 });
    expect(p.vertex).toBe(1);
    expect(p.nextStep?.instruction).toBe('Turn left onto A404');
    expect(p.distanceToNextM).toBeGreaterThan(1050);
    expect(p.distanceToNextM).toBeLessThan(1150);
    expect(p.offRoute).toBe(false);
    expect(p.arrived).toBe(false);
  });

  it('flags the driver as off route', () => {
    const p = progressAt(route, { lat: 51.61, lng: -0.73 });
    expect(p.offRouteM).toBeGreaterThan(OFF_ROUTE_M);
    expect(p.offRoute).toBe(true);
  });

  it('does not snap back to an earlier part of the route', () => {
    const p = progressAt(route, { lat: 51.6301, lng: -0.75 }, 3);
    expect(p.vertex).toBe(3);
  });

  it('detects arrival', () => {
    const p = progressAt(route, { lat: 51.64 - (ARRIVED_M / 2) / 111_000, lng: -0.75 }, 3);
    expect(p.arrived).toBe(true);
  });

  it('keeps only the waypoints still ahead', () => {
    const ahead = remainingWaypoints(route, [{ lat: 51.61, lng: -0.75 }, { lat: 51.64, lng: -0.75 }], 2);
    expect(ahead).toEqual([{ lat: 51.64, lng: -0.75 }]);
  });

  it('formats distances the British way', () => {
    expect(formatNavDistance(20)).toBe('now');
    expect(formatNavDistance(200)).toBe('220 yd');
    expect(formatNavDistance(1609.344 * 2.34)).toBe('2.3 mi');
    expect(formatNavDistance(1609.344 * 25)).toBe('25 mi');
  });
});

describe('hazards', () => {
  const now = Date.UTC(2026, 9, 25, 12, 0);
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();

  it('shows only active reports from the last two hours', () => {
    expect(isLiveHazard({ is_active: true, created_at: at(10 * 60_000) }, now)).toBe(true);
    expect(isLiveHazard({ is_active: true, created_at: at(HAZARD_MAX_AGE_MS + 1000) }, now)).toBe(false);
    expect(isLiveHazard({ is_active: false, created_at: at(60_000) }, now)).toBe(false);
    expect(isLiveHazard({ is_active: true, created_at: 'not a date' }, now)).toBe(false);
  });

  it('describes report age', () => {
    expect(reportedAgo(at(10_000), now)).toBe('Just now');
    expect(reportedAgo(at(12 * 60_000), now)).toBe('12 min ago');
    expect(reportedAgo(at(100 * 60_000), now)).toBe('1 h 40 min ago');
  });

  it('has a label and icon for every type', () => {
    expect(hazardMeta('speed_camera').label).toBe('Speed Camera');
    expect(hazardMeta('police').icon).toBe('shield');
  });
});

describe('navigation requests', () => {
  it('round-trips through a router param', () => {
    const req = { from: 'here' as const, to: [{ lat: 51.45, lng: -0.97, label: 'Reading' }], prefer: 'motorway' as const, title: 'Reading' };
    expect(decodeNavRequest(encodeNavRequest(req))).toEqual(req);
  });

  it('rejects missing or malformed params instead of crashing', () => {
    expect(decodeNavRequest(undefined)).toBeNull();
    expect(decodeNavRequest('{not json')).toBeNull();
    expect(decodeNavRequest(JSON.stringify({ from: 'here', to: [{ lat: 200, lng: 0, label: 'x' }] }))).toBeNull();
  });

  it('caps the stop count at what live routing accepts', () => {
    const to = Array.from({ length: 20 }, (_, i) => ({ lat: 51 + i * 0.01, lng: -0.7, label: `S${i}` }));
    expect(decodeNavRequest(encodeNavRequest({ from: 'here', to, prefer: 'standard', title: 'Day' }))?.to).toHaveLength(MAX_NAV_STOPS);
  });
});
