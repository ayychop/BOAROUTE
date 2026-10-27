import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { nearestHazardWithin, proximityPhrase } from '@/lib/hazard-alerts';
import { isLiveHazard, type HazardReport } from '@/lib/hazards';
import { getPref } from '@/lib/prefs';
import { fetchLiveHazards } from '@/services/hazards';

/**
 * Speaks "Speed camera ahead" / "Police reported ahead" while the phone is
 * locked or another app (Android Auto, music) is in front during navigation.
 * The navigate screen does the same, route-aware, while it is on screen, so
 * this one stays quiet when the app is active and both share one warned set.
 *
 * The task must be defined at module load (imported from the root layout) so
 * Android can deliver locations even if the JS runtime was restarted.
 */

export const HAZARD_WATCH_TASK = 'boaroute-hazard-watch';
const REFRESH_MS = 60_000;

let hazards: HazardReport[] = [];
let fetchedAt = 0;
let fetching = false;
const warned = new Set<string>();

/** The navigate screen calls this after its own spoken warning, so a report is announced once. */
export function markHazardWarned(id: string) {
  warned.add(id);
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
  if (AppState.currentState === 'active' || getPref('nav.muted') === 'true') return;
  const here = { lat: fix.coords.latitude, lng: fix.coords.longitude };
  const live = hazards.filter((h) => isLiveHazard(h));
  const next = nearestHazardWithin(here, fix.coords.heading ?? null, live, warned);
  if (!next) return;
  warned.add(next.hazard.id);
  Speech.speak(proximityPhrase(next.hazard.hazard_type), { language: 'en-GB', rate: 1.0 });
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(HAZARD_WATCH_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(HAZARD_WATCH_TASK, ({ data, error }) => {
    if (error || !data?.locations?.length) return Promise.resolve();
    onFix(data.locations[data.locations.length - 1]);
    return Promise.resolve();
  });
}

/**
 * Starts background updates for this trip. Android shows a "Navigating"
 * notification while it runs. Fails quietly (alerts then only work on screen)
 * when background location is refused or unsupported, e.g. in Expo Go.
 */
export async function startHazardWatch(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
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
      distanceInterval: 25,
      timeInterval: 3_000,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      foregroundService: {
        notificationTitle: 'BOAROUTE is navigating',
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

export async function stopHazardWatch(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(HAZARD_WATCH_TASK)) await Location.stopLocationUpdatesAsync(HAZARD_WATCH_TASK);
  } catch {
    // Already stopped.
  }
  warned.clear();
}
