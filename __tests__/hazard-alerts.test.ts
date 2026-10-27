import { CAMERA_APPROACH_M, CAMERA_PASSING_M, cameraCue, nearestHazardWithin, nextHazardAhead, proximityPhrase } from '../src/lib/hazard-alerts';
import type { HazardReport } from '../src/lib/hazards';
import { prepareRoute } from '../src/lib/nav-progress';
import type { LngLat } from '../supabase/functions/_shared/route-analysis';

// A straight road heading north, a vertex roughly every 111 m (0.001 deg of latitude).
const line: LngLat[] = Array.from({ length: 30 }, (_, i) => [-0.75, 51.6 + i * 0.001]);
const route = prepareRoute(line, []);
const camera = (id: string, lat: number, lng = -0.75): HazardReport => ({ id, user_id: 'u', hazard_type: 'speed_camera', latitude: lat, longitude: lng, is_active: true, created_at: new Date().toISOString() });

describe('speed camera proximity', () => {
  const here = { lat: 51.6, lng: -0.75 };

  it('counts down to a camera on the road ahead', () => {
    const a = nextHazardAhead(route, 0, here, [camera('c', 51.6045)]);
    expect(a?.hazard.id).toBe('c');
    expect(a!.distanceM).toBeGreaterThan(480);
    expect(a!.distanceM).toBeLessThan(520);
    const closer = nextHazardAhead(route, 2, { lat: 51.6025, lng: -0.75 }, [camera('c', 51.6045)]);
    expect(closer!.distanceM).toBeLessThan(a!.distanceM);
    expect(closer!.distanceM).toBeGreaterThan(200);
  });

  it('ignores cameras out of range, behind, or on another road', () => {
    expect(nextHazardAhead(route, 0, here, [camera('far', 51.615)])).toBeNull();
    expect(nextHazardAhead(route, 10, { lat: 51.61, lng: -0.75 }, [camera('behind', 51.605)])).toBeNull();
    expect(nextHazardAhead(route, 0, here, [camera('parallel', 51.604, -0.745)])).toBeNull();
  });

  it('drops the alert once the camera is passed and picks the nearest of several', () => {
    expect(nextHazardAhead(route, 5, { lat: 51.6051, lng: -0.75 }, [camera('c', 51.605)])).toBeNull();
    const two = nextHazardAhead(route, 0, here, [camera('second', 51.607), camera('first', 51.603)]);
    expect(two?.hazard.id).toBe('first');
  });
});

describe('background voice alerts within 500 m', () => {
  const here = { lat: 51.6, lng: -0.75 };
  const police = (id: string, lat: number): HazardReport => ({ ...camera(id, lat), hazard_type: 'police' });

  it('finds a camera inside 500 m and ignores one beyond it', () => {
    expect(nearestHazardWithin(here, null, [camera('near', 51.604)], new Set())?.hazard.id).toBe('near');
    expect(nearestHazardWithin(here, null, [camera('far', 51.6055)], new Set())).toBeNull();
  });

  it('only warns about speed cameras and police, once each', () => {
    const accident: HazardReport = { ...camera('acc', 51.601), hazard_type: 'accident' };
    expect(nearestHazardWithin(here, null, [accident], new Set())).toBeNull();
    expect(nearestHazardWithin(here, null, [police('p', 51.602)], new Set(['p']))).toBeNull();
  });

  it('skips reports behind the driver when the heading is known', () => {
    expect(nearestHazardWithin(here, 0, [camera('ahead', 51.603)], new Set())?.hazard.id).toBe('ahead');
    expect(nearestHazardWithin(here, 180, [camera('ahead', 51.603)], new Set())).toBeNull();
  });

  it('picks the nearest and words it for speech', () => {
    const a = nearestHazardWithin(here, null, [camera('c', 51.604), police('p', 51.602)], new Set());
    expect(a?.hazard.id).toBe('p');
    expect(proximityPhrase('speed_camera')).toBe('Speed camera ahead');
    expect(proximityPhrase('police')).toBe('Police reported ahead');
  });
});

describe('speed camera voice notes', () => {
  it('plays "approaching" from 500 m, once', () => {
    expect(cameraCue(CAMERA_APPROACH_M + 1, undefined)).toBeNull();
    expect(cameraCue(CAMERA_APPROACH_M, undefined)).toBe('approaching');
    expect(cameraCue(300, 'approaching')).toBeNull();
  });

  it('plays "next to the camera" under 100 m, once', () => {
    expect(cameraCue(CAMERA_PASSING_M, 'approaching')).toBe('passing');
    expect(cameraCue(40, 'passing')).toBeNull();
  });

  it('goes straight to "passing" when the first fix is already close', () => {
    expect(cameraCue(60, undefined)).toBe('passing');
  });
});
