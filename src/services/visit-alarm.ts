import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { alarmAt } from '@/lib/visit-timer';
import { configureNotifications } from './notifications';

export const VISIT_ALARM_CHANNEL = 'visit-alarm';
export const VISIT_ALARM_KIND = 'visit-alarm';
/** Notification category with the two buttons. No ':' or '-' allowed in the id. */
export const VISIT_ALARM_CATEGORY = 'visitalarm';
export const ACTION_CONTINUE = 'continue_visit';
export const ACTION_CLOCK_OUT = 'clock_out';
/** Bundled through the expo-notifications plugin (app.json > sounds). */
export const VISIT_ALARM_SOUND = 'clock_out.wav';
/** Long, insistent buzzes: impossible to miss in a pocket. */
export const ALARM_VIBRATION = [0, 900, 400, 900, 400, 900];

let ready = false;

/** Android channel (sound + vibration live on the channel) and the Continue / Clock out buttons. */
async function configureVisitAlarm(): Promise<void> {
  if (ready) return;
  ready = true;
  await configureNotifications();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(VISIT_ALARM_CHANNEL, {
      name: 'Visit clock-out alarm',
      description: 'Sounds when a store visit reaches one hour',
      // eslint-disable-next-line import/namespace -- exported via `export *` from a .types module; exists at runtime
      importance: Notifications.AndroidImportance.MAX,
      sound: VISIT_ALARM_SOUND,
      vibrationPattern: ALARM_VIBRATION,
      enableVibrate: true,
      lightColor: '#CDA960',
      bypassDnd: true,
    });
  }
  await Notifications.setNotificationCategoryAsync(VISIT_ALARM_CATEGORY, [
    { identifier: ACTION_CONTINUE, buttonTitle: 'Continue visit', options: { opensAppToForeground: false } },
    { identifier: ACTION_CLOCK_OUT, buttonTitle: 'Clock out', options: { opensAppToForeground: true } },
  ]);
}

/** Cancels any pending clock-out alarm (visit completed, cancelled or silenced). */
export async function cancelVisitAlarm(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: string } | null)?.kind === VISIT_ALARM_KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  // The delivered one too, so the buttons do not linger after clocking out in the app.
  const shown = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    shown
      .filter((n) => (n.request.content.data as { kind?: string } | null)?.kind === VISIT_ALARM_KIND)
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

/**
 * Schedules the one-hour clock-out alarm so it fires even when the app is in
 * the background or closed. Asks for notification permission the first time.
 */
export async function scheduleVisitAlarm(storeName: string, storeId: string, startedAt: string): Promise<boolean> {
  await configureVisitAlarm();
  const perm = await Notifications.getPermissionsAsync();
  let granted = perm.granted;
  if (!granted && perm.canAskAgain) granted = (await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })).granted;
  if (!granted) return false;
  await cancelVisitAlarm();
  const at = alarmAt(startedAt);
  if (at.getTime() <= Date.now()) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'One hour in store: time to clock out',
      body: `${storeName}: you have hit the hour. Clock out now, or tap Continue visit to stay.`,
      data: { kind: VISIT_ALARM_KIND, storeId },
      sound: VISIT_ALARM_SOUND,
      categoryIdentifier: VISIT_ALARM_CATEGORY,
      // Stays until it is answered.
      sticky: true,
      autoDismiss: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
      vibrate: ALARM_VIBRATION,
      interruptionLevel: 'timeSensitive',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: VISIT_ALARM_CHANNEL },
  });
  return true;
}
