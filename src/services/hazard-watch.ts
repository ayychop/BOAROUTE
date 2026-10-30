import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { nearestHazardWithin } from '@/lib/hazard-alerts';
import { isLiveHazard, type HazardReport } from '@/lib/hazards';
import { alertAllowed, APPROACH_ALERT_M, finishedIds, isVoiceAlertType, leadMetres, nextVoiceCue, recordCue, type AlertLedger } from '@/lib/voice-alerts';
import { fetchLiveHazards } from '@/services/hazards';
import { alertToggles, playVoiceNote, preloadVoiceNotes } from '@/services/voice-notes';

/**
 * Plays the speed camera / police voice note (once, inside about half a mile)
 * from a location foreground service, so it keeps coming while Waze, Spotify or
 * the lock screen is in front.
 *
 * While the in-app navigator is on screen it owns the alerts instead (it
 * measures along the planned route, which is more precise than the heading
 * cone used here) and both share one ledger, so each report is announced once.
 *
 * The task must be defined at module load (imported from the root layout) so
 * Android can deliver locations even if the JS runtime was restarted.
 */

export const HAZARD_WATCH_TASK = 'boaroute-hazard-watch';
const REFRESH_MS = 60_000;

let hazards: HazardReport[] = [];
let fetchedAt = 0;
let fetching = false;
let routeAwareOwner = false;
const ledger: AlertLedger = new Set();

/** The in-app navigator sets this while it is focused and navigating. */
export function setRouteAwareAlerts(on: boolean) {
  routeAwareOwner = on;
}

/** Plays the next note for a report the navigator found along its route. */
export function announceHazardAhead(ahead: { hazard: HazardReport; distanceM: number } | null, speedMps: number | null): boolean {
  const cue = nextVoiceCue(ahead, ledger, speedMps, alertToggles());
  if (!cue) return false;
  recordCue(ledger, cue);
  playVoiceNote(cue.clip);
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
  if (routeAwareOwner && AppState.currentState === 'active') return;
  const here = { lat: fix.coords.latitude, lng: fix.coords.longitude };
  const speed = fix.coords.speed ?? null;
  // Switched-off kinds are dropped before picking the nearest, so a camera that is off never hides police behind it.
  const toggles = alertToggles();
  const live = hazards.filter((h) => isLiveHazard(h) && isVoiceAlertType(h.hazard_type) && alertAllowed(h.hazard_type, toggles));
  const ahead = nearestHazardWithin(here, fix.coords.heading ?? null, live, finishedIds(ledger), APPROACH_ALERT_M + leadMetres(speed));
  announceHazardAhead(ahead, speed);
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(HAZARD_WATCH_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(HAZARD_WATCH_TASK, ({ data, error }) => {
    if (error || !data?.locations?.length) return Promise.resolve();
    onFix(data.locations[data.locations.length - 1]);
    return Promise.resolve();
  });
}

let watching = false;

/** True while the foreground service is running (games are locked then). */
export function isHazardWatchRunning(): boolean {
  return watching;
}

/**
 * Starts the location foreground service for this trip. Android shows a
 * "Navigating" notification while it runs. Fails quietly (alerts then only work
 * on screen) when location is refused or unsupported, e.g. in Expo Go.
 *
 * It needs only the normal "while using the app" location permission, not
 * "Allow all the time": a foreground service started while BOAROUTE is on screen
 * keeps receiving locations after Waze or the lock screen takes over. That is
 * why this must be called BEFORE handing off to Waze (Android 12+ refuses to
 * start one from the background).
 *
 * `prompt: false` never asks for permission; `true` shows the normal location
 * dialog once if it has not been answered.
 */
export async function startHazardWatch({ prompt = true }: { prompt?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await TaskManager.isAvailableAsync())) return false;
    const fg = await Location.getForegroundPermissionsAsync();
    if (!fg.granted && (!prompt || !fg.canAskAgain || !(await Location.requestForegroundPermissionsAsync()).granted)) return false;
    preloadVoiceNotes().catch(() => {});
    if (await Location.hasStartedLocationUpdatesAsync(HAZARD_WATCH_TASK)) {
      watching = true;
      return true;
    }
    fetchedAt = 0;
    refresh();
    await Location.startLocationUpdatesAsync(HAZARD_WATCH_TASK, {
      accuracy: Location.Accuracy.BestForNavigation,
      distanceInterval: 10,
      timeInterval: 1_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'BOAROUTE is navigating',
        notificationBody: 'Speed camera and police alerts are on.',
        notificationColor: '#CDA960',
        killServiceOnDestroy: true,
      },
    });
    watching = true;
    return true;
  } catch {
    return false;
  }
}

/** True when location is allowed, which is all the alerts service needs (see startHazardWatch). */
export async function hasBackgroundAlertsPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Location.getForegroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function stopHazardWatch(): Promise<void> {
  watching = false;
  routeAwareOwner = false;
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(HAZARD_WATCH_TASK)) await Location.stopLocationUpdatesAsync(HAZARD_WATCH_TASK);
  } catch {
    // Already stopped.
  }
  ledger.clear();
}
