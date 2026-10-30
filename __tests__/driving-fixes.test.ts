import fs from 'fs';
import path from 'path';
import { DASHBOARD_PLATE, DASHBOARD_PLATE_FILL, dashboardPlateHeight } from '../src/lib/preferences';
import { assessTraffic, followsLine, MIN_SAVING_S, TRAFFIC_REFRESH_MS } from '../src/lib/traffic-refresh';

const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

// A straight road heading north, 0.001 deg of latitude is about 111 m.
const road = (lngOffset = 0, points = 40): [number, number][] => Array.from({ length: points }, (_, i) => [-0.12 + lngOffset, 51.5 + i * 0.001]);

describe('dashboard plate', () => {
  const plate = read('src/components/NumberPlate.tsx');
  const home = read('src/app/(tabs)/index.tsx');

  it('is a fixed 26 plate that does not read the database or profile', () => {
    expect(DASHBOARD_PLATE).toBe('KM26 MLL');
    expect(plate).toContain('text={DASHBOARD_PLATE}');
    expect(home).toContain('<DashboardPlate />');
    expect(home).not.toMatch(/displayPlate/);
  });

  it('sits above the mileage counter', () => {
    expect(home.indexOf('<DashboardPlate />')).toBeGreaterThan(-1);
    expect(home.indexOf('<DashboardPlate />')).toBeLessThan(home.indexOf('<Odometer value'));
  });

  it('stretches to the card width within limits and is never tiny', () => {
    expect(dashboardPlateHeight(0)).toBeGreaterThanOrEqual(48);
    expect(dashboardPlateHeight(NaN)).toBeGreaterThanOrEqual(48);
    expect(dashboardPlateHeight(200)).toBeGreaterThanOrEqual(48);
    // A 330 px wide card gets a plate about 86% of its width.
    const h = dashboardPlateHeight(330);
    expect(h * 4.4).toBeCloseTo(330 * DASHBOARD_PLATE_FILL, 0);
    expect(dashboardPlateHeight(2000)).toBeLessThanOrEqual(96);
  });
});

describe('camera voice note audio profile', () => {
  const kotlin = read('modules/boaroute-drive/android/src/main/java/expo/modules/boaroutedrive/BoaRouteDriveModule.kt');
  const notes = read('src/services/voice-notes.ts');

  it('plays on the navigation guidance stream with a ducking focus request', () => {
    expect(kotlin).toContain('AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE');
    expect(kotlin).toContain('AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK');
  });

  it('plays the recorded clip at full gain, whatever the volume slider says', () => {
    expect(notes).toMatch(/recorded \? CAMERA_CLIP_VOLUME : voiceVolume\(\)/);
  });

  it('has no passing logic left', () => {
    expect(notes).not.toMatch(/passing/i);
  });

  it('is gated by the camera toggle, which test buttons can bypass with force', () => {
    expect(notes).toMatch(/!force && !\(clip === 'camera_approaching' \? cameraAlertsOn\(\) : policeAlertsOn\(\)\)/);
  });
});

describe('Waze hand-off', () => {
  const drive = read('src/services/drive.ts');
  const watch = read('src/services/hazard-watch.ts');

  it('starts the foreground service before opening Waze', () => {
    const start = drive.indexOf('startHazardWatch(');
    const open = drive.indexOf('openWaze(to);');
    expect(start).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(start);
  });

  it('needs only normal location permission, not "all the time"', () => {
    expect(watch).toContain('getForegroundPermissionsAsync');
    expect(watch).not.toContain('requestBackgroundPermissionsAsync');
    expect(watch).toMatch(/foregroundService: \{/);
  });
});

describe('road closures and traffic', () => {
  const fn = read('supabase/functions/route-options/index.ts');

  it('asks Google for traffic-aware optimal routes, never traffic-unaware', () => {
    expect(fn).toContain("routingPreference: 'TRAFFIC_AWARE_OPTIMAL'");
    expect(fn).not.toMatch(/routingPreference:\s*'(?!TRAFFIC_AWARE_OPTIMAL')/);
    expect(fn).toContain('computeAlternativeRoutes: true');
  });

  it('refreshes live traffic every few minutes while navigating', () => {
    expect(TRAFFIC_REFRESH_MS).toBe(180_000);
    expect(read('src/app/navigate.tsx')).toContain('TRAFFIC_REFRESH_MS');
  });
});

describe('assessTraffic', () => {
  const current = road(0);
  const detour = road(0.01); // a parallel road about 700 m away
  const sameRoute = { geometry: current, durationS: 1800 };

  it('recognises the same road and a different one', () => {
    expect(followsLine(road(0), current)).toBe(true);
    expect(followsLine(road(0.0002), current)).toBe(true);
    expect(followsLine(detour, current)).toBe(false);
  });

  it('keeps going when the current road is still the preferred route', () => {
    expect(assessTraffic(current, 4000, [sameRoute, { geometry: detour, durationS: 1700 }], sameRoute)).toEqual({ action: 'keep' });
  });

  it('switches when a clearly quicker route exists', () => {
    const quicker = { geometry: detour, durationS: 1800 - 400 };
    const verdict = assessTraffic(current, 4000, [sameRoute, quicker], quicker);
    expect(verdict).toEqual({ action: 'switch', reason: 'faster', savingS: 400 });
  });

  it('does not flip for a small gain', () => {
    const marginal = { geometry: detour, durationS: 1800 - (MIN_SAVING_S - 30) };
    expect(assessTraffic(current, 4000, [sameRoute, marginal], marginal)).toEqual({ action: 'keep' });
    // Enough seconds, but under 10% of a long drive.
    const longSame = { geometry: current, durationS: 7200 };
    const slightlyQuicker = { geometry: detour, durationS: 7200 - 300 };
    expect(assessTraffic(current, 4000, [longSame, slightlyQuicker], slightlyQuicker)).toEqual({ action: 'keep' });
  });

  it('moves the driver when their road has dropped out of the live options (closure)', () => {
    const other = { geometry: detour, durationS: 2600 };
    expect(assessTraffic(current, 4000, [other], other)).toEqual({ action: 'switch', reason: 'unavailable' });
  });

  it('leaves the driver alone close to the end, or with nothing to compare', () => {
    const other = { geometry: detour, durationS: 60 };
    expect(assessTraffic(current, 300, [other], other)).toEqual({ action: 'keep' });
    expect(assessTraffic(current, 4000, [], null)).toEqual({ action: 'keep' });
  });
});
