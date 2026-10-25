/** Hour of the "morning of the event" reminder. */
export const MORNING_HOUR = 8;
/** Minimum lead time before an event for the morning reminder. */
const MORNING_MIN_LEAD_MS = 30 * 60_000;

export interface ReminderPlan {
  dayBefore: Date | null;
  morningOf: Date | null;
}

/**
 * When to remind about an event:
 * - dayBefore: exactly 24 hours before the event.
 * - morningOf: 08:00 on the day; if the event starts before 08:30, one hour before instead.
 * Reminders already in the past are dropped.
 */
export function planReminders(
  eventDate: Date,
  opts: { before: boolean; onDay: boolean },
  now = new Date(),
): ReminderPlan {
  const future = (d: Date) => d.getTime() > now.getTime() + 5_000;

  let dayBefore: Date | null = null;
  if (opts.before) {
    const d = new Date(eventDate.getTime() - 24 * 3_600_000);
    dayBefore = future(d) ? d : null;
  }

  let morningOf: Date | null = null;
  if (opts.onDay) {
    let d = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), MORNING_HOUR, 0, 0, 0);
    if (eventDate.getTime() - d.getTime() < MORNING_MIN_LEAD_MS) {
      d = new Date(eventDate.getTime() - 60 * 60_000);
    }
    morningOf = future(d) ? d : null;
  }

  return { dayBefore, morningOf };
}
