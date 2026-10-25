import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatTime } from '@/lib/format';
import { planReminders } from '@/lib/reminders';
import type { WorkEvent } from '@/lib/types';

export const REMINDER_CHANNEL = 'reminders';
const KIND = 'event-reminder';

let configured = false;

/** Foreground presentation + Android channel. Safe to call many times. */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Event reminders',
      description: 'Reminders the day before and the morning of your work events',
      // eslint-disable-next-line import/namespace -- exported via `export *` from a .types module; exists at runtime
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#CDA960',
      vibrationPattern: [0, 200, 120, 200],
    });
  }
}

/** Asks for permission only when needed. Returns whether reminders can be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  await configureNotifications();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return res.granted;
}

/**
 * Rebuilds every event reminder from the database copy of the events, so
 * reminders survive reinstalls and new devices. Never prompts for permission.
 */
export async function syncEventReminders(events: WorkEvent[], now = new Date()): Promise<number> {
  await configureNotifications();
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return 0;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { kind?: string } | null)?.kind === KIND)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  let count = 0;
  for (const ev of events) {
    const when = new Date(ev.event_date);
    if (when.getTime() <= now.getTime()) continue;
    const plan = planReminders(when, { before: ev.reminder_before, onDay: ev.reminder_on_day }, now);
    const special = ev.event_type !== 'General' ? `${ev.event_type}: ` : '';
    const jobs: { at: Date; title: string; body: string }[] = [];
    if (plan.dayBefore) {
      jobs.push({ at: plan.dayBefore, title: `Tomorrow: ${special}${ev.title}`, body: `Starts tomorrow at ${formatTime(when)}. Get set up today.` });
    }
    if (plan.morningOf) {
      jobs.push({ at: plan.morningOf, title: `Today: ${special}${ev.title}`, body: `Starts at ${formatTime(when)}.${ev.description ? ` ${ev.description}` : ''}` });
    }
    for (const job of jobs) {
      await Notifications.scheduleNotificationAsync({
        content: { title: job.title, body: job.body, data: { kind: KIND, eventId: ev.id }, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: job.at, channelId: REMINDER_CHANNEL },
      });
      count++;
    }
  }
  return count;
}
