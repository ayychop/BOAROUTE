import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { CarAppService } from '@/car/CarAppService';
import { carHazards } from '@/car/car-state';
import { cameraCue, nearestHazardWithin, proximityPhrase, type CameraCue } from '@/lib/hazard-alerts';
import { hazardMeta, isLiveHazard, type HazardReport } from '@/lib/hazards';
import { getPref } from '@/lib/prefs';
import { checkInAt } from '@/services/checkin-watch';
import { fetchLiveHazards } from '@/services/hazards';
import { playCameraCue, speakWarning } from '@/services/copilot-audio';

/**
 * The co-pilot: speed camera voice notes and police warnings while BOAROUTE
 * navigates, and whenever Android Auto is connected, even with Waze or Google
 * Maps on the car screen and the phone locked. A background location task
 * (foreground service on Android) keeps it running.
 *
 * While the navigate screen is in front it announces reports on its route
 * (more precise than the crow-flies check here), so this one stays quiet then.
 * Both go through announceHazard, so each report is announced once.
 *
 * The task must be defined at module load (imported from the root layout) so
 * Android can deliver locations even if the JS runtime was restarted.
 */

export const HAZARD_WATCH_TASK = 'boaroute-hazard-watch';
const REFRESH_MS = 60_000;

export type WatchReason = 'navigate' | 'car';

let hazards: HazardReport[] = [];
let fetchedAt = 0;
let fetching = false;
/** What each report has had: a camera's last voice note, or 'spoken' for the one-off warnings. */
const announced = new Map<string, CameraCue | 'spoken'>();
/** Crowd-sourced reports already flashed on the car screen, so each shows once. */
const toasted = new Set<string>();
const reasons = new Set<WatchReason>();
let routeAlertsOnScreen = false;

/** The navigate screen sets this while it is navigating, so the two never both speak. */
export function setRouteAlertsOnScreen(on: boolean) {
  routeAlertsOnScreen = on;
}

/**
 * Announces a report at this distance if it is due: speed cameras get the
 * "approaching" note from 500 m and the "next to the camera" note under
 * 100 m; anything else is spoken once with `phrase`. Returns true if it played.
 */
export function announceHazard(hazard: HazardReport, distanceM: number, phrase: string): boolean {
  if (getPref('nav.muted') === 'true') return false;
  const done = announced.get(hazard.id);
  if (hazard.hazard_type === 'speed_camera') {
    const cue = cameraCue(distanceM, done === 'spoken' ? undefined : done);
    if (!cue) return false;
    announced.set(hazard.id, cue);
    playCameraCue(cue);
    return true;
  }
  if (done) return false;
  announced.set(hazard.id, 'spoken');
  speakWarning(phrase);
  return true;
}

function refresh() {
  if (fetching || Date.now() - fetchedAt < REFRESH_MS) return;
  fetching = true;
  fetchLiveHazards()
    .then((list) => {
      hazards = list;
      fetchedAt = Date.now();
    })
    .catch(() => {
      // Offline: keep the last list and try again on a later fix.
    })
    .finally(() => {
      fetching = false;
    });
}

function onFix(fix: Location.LocationObject) {
  refresh();
  const here = { lat: fix.coords.latitude, lng: fix.coords.longitude };
  const heading = fix.coords.heading ?? null;
  const live = hazards.filter((h) => isLiveHazard(h));
  // Keeps the car map moving when the phone is not on the navigate screen.
  CarAppService.setPosition({ ...here, heading });
  CarAppService.setHazards(carHazards(live, here));

  // A crew report nearby pops up quietly on the car screen (no voice): the
  // subtle, auto-clearing counterpart to the spoken speed-camera cues.
  if (CarAppService.isConnected()) {
    const near = nearestHazardWithin(here, heading, live, toasted);
    if (near && near.hazard.hazard_type !== 'speed_camera') {
      toasted.add(near.hazard.id);
      CarAppService.toast(`Heads up: ${hazardMeta(near.hazard.hazard_type).label.toLowerCase()} reported nearby.`);
    }
  }

  // Remind the driver to clock in when they reach one of their own stores.
  checkInAt(here.lat, here.lng).catch(() => {});

  if (routeAlertsOnScreen && AppState.currentState === 'active') return;
  // Fully announced reports drop out, so a nearer camera never hides one still due.
  const finished = new Set([...announced].filter(([, v]) => v !== 'approaching').map(([id]) => id));
  const next = nearestHazardWithin(here, heading, live, finished);
  if (next) announceHazard(next.hazard, next.distanceM, proximityPhrase(next.hazard.hazard_type));
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(HAZARD_WATCH_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(HAZARD_WATCH_TASK, ({ data, error }) => {
    if (error || !data?.locations?.length) return Promise.resolve();
    onFix(data.locations[data.locations.length - 1]);
    return Promise.resolve();
  });
}

/**
 * Starts background updates for `reason` (BOAROUTE navigation, or an Android
 * Auto session). Android shows a notification while it runs. Fails quietly
 * (alerts then only work on screen) when background location is refused or
 * unsupported, e.g. in Expo Go.
 */
export async function startHazardWatch(reason: WatchReason): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  reasons.add(reason);
  try {
    if (!(await TaskManager.isAvailableAsync())) return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    // Ask once; after a refusal Android only offers it in Settings, so don't nag every trip.
    if (!bg.granted && (!bg.canAskAgain || !(await Location.requestBackgroundPermissionsAsync()).granted)) return false;
    if (await Location.hasStartedLocationUpdatesAsync(HAZARD_WATCH_TASK)) return true;
    fetchedAt = 0;
    refresh();
    await Location.startLocationUpdatesAsync(HAZARD_WATCH_TASK, {
      accuracy: Location.Accuracy.High,
      distanceInterval: 15,
      timeInterval: 2_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'BOAROUTE co-pilot is on',
        notificationBody: 'Speed camera and police alerts are on.',
        notificationColor: '#CDA960',
        killServiceOnDestroy: true,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/** Stops once no reason is left (the trip ended and the car is disconnected). */
export async function stopHazardWatch(reason: WatchReason): Promise<void> {
  if (Platform.OS === 'web') return;
  reasons.delete(reason);
  if (reasons.size > 0) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(HAZARD_WATCH_TASK)) await Location.stopLocationUpdatesAsync(HAZARD_WATCH_TASK);
  } catch {
    // Already stopped.
  }
  announced.clear();
  toasted.clear();
}
