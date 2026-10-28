import * as Notifications from 'expo-notifications';
import { configureNotifications, REMINDER_CHANNEL } from './notifications';

/**
 * Check-in reminder: when you arrive at one of your stores and have not
 * started a visit, your phone reminds you to start the 25-minute timer. It is
 * only for you. Nothing is sent to anyone else, and it stays quiet while a
 * visit is already running.
 *
 * Fed by the background location task in hazard-watch, so it works on the
 * drive in without a second location subscription.
 */

const CHECKIN_KIND = 'checkin-reminder';
/** Within this of a store counts as "arrived". */
const RADIUS_M = 150;
/** Don't nag again about the same store for half an hour. */
const COOLDOWN_MS = 30 * 60_000;

export interface CheckinStore {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

let stores: CheckinStore[] = [];
let visiting = false;
const remindedAt = new Map<string, number>();

/** The stores worth reminding about (the person's own, with coordinates). */
export function setCheckinStores(next: CheckinStore[]) {
  stores = next;
}

/** While a visit runs there is nothing to remind about. */
export function setCheckinVisiting(active: boolean) {
  visiting = active;
}

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
function metres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const x = rad(bLng - aLng) * Math.cos(rad((aLat + bLat) / 2));
  const y = rad(bLat - aLat);
  return R * Math.hypot(x, y);
}

/** Called on each location fix. Reminds once per arrival, per store, per cooldown. */
export async function checkInAt(lat: number, lng: number): Promise<void> {
  if (visiting || stores.length === 0) return;
  const now = Date.now();
  let hit: CheckinStore | null = null;
  let best = RADIUS_M;
  for (const s of stores) {
    const d = metres(lat, lng, s.lat, s.lng);
    if (d <= best) {
      best = d;
      hit = s;
    }
  }
  if (!hit) return;
  if (now - (remindedAt.get(hit.id) ?? 0) < COOLDOWN_MS) return;
  remindedAt.set(hit.id, now);

  try {
    await configureNotifications();
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `You're at ${hit.name}`,
        body: 'Open BOAROUTE and tap Start Visit to begin the 25-minute timer.',
        data: { kind: CHECKIN_KIND, storeId: hit.id },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1, channelId: REMINDER_CHANNEL },
    });
  } catch {
    // Reminders are a nicety; never let one break the location fix.
  }
}

/** Forget the cooldown record, e.g. on sign-out. */
export function resetCheckins() {
  remindedAt.clear();
  stores = [];
  visiting = false;
}
