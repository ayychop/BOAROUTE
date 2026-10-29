import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { nearestHazardWithin } from '@/lib/hazard-alerts';
import { isLiveHazard, type HazardReport } from '@/lib/hazards';
import { APPROACH_ALERT_M, finishedIds, leadMetres, nextVoiceCue, recordCue, type AlertLedger } from '@/lib/voice-alerts';
import { fetchLiveHazards } from '@/services/hazards';
import { playVoiceNote, preloadVoiceNotes } from '@/services/voice-notes';

/**
 * Plays the two-stage speed camera / police voice notes (approaching at
 * 500 m, passing at 100 m) from a location foreground service, so they keep
 * coming while Waze, Spotify or the lock screen is in front.
 *
 * While the in-app navigator is on screen it owns the alerts instead (it
 * measures along the planned route, which is more precise than the heading
 * cone used here) and both share one ledger, so each note plays once.
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
const ledger: AlertLedger = new Map();

/** The in-app navigator sets this while it is focused and navigating. */
export function setRouteAwareAlerts(on: boolean) {
  routeAwareOwner = on;
}

/** Plays the next note for a report the navigator found along its route. */
export function announceHazardAhead(ahead: { hazard: HazardReport; distanceM: number } | null, speedMps: number | null): boolean {
  const cue = nextVoiceCue(ahead, ledger, speedMps);
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
  const live = hazards.filter((h) => isLiveHazard(h));
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
 * Starts background updates for this trip. Android shows a "Navigating"
 * notification while it runs. Fails quietly (alerts then only work on screen)
 * when background location is refused or unsupported, e.g. in Expo Go.
 *
 * `prompt: false` never asks for background location: on Android 11+ that
 * opens Settings, which would get in the way of handing off to Waze.
 */
export async function startHazardWatch({ prompt = true }: { prompt?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (!(await TaskManager.isAvailableAsync())) return false;
    const bg = await Location.getBackgroundPermissionsAsync();
    // Ask once; after a refusal Android only offers it in Settings, so don't nag every trip.
    if (!bg.granted && (!prompt || !bg.canAskAgain || !(await Location.requestBackgroundPermissionsAsync()).granted)) return false;
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

export async function hasBackgroundAlertsPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
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
