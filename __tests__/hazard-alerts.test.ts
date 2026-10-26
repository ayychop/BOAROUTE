import { nextHazardAhead } from '../src/lib/hazard-alerts';
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
