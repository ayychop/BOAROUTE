import { planReminders } from '../src/lib/reminders';

const now = new Date(2026, 9, 25, 10, 0);

describe('event reminders', () => {
  it('fires 24 hours before and at 08:00 on the day', () => {
    const event = new Date(2026, 9, 28, 14, 30);
    const p = planReminders(event, { before: true, onDay: true }, now);
    expect(p.dayBefore).toEqual(new Date(2026, 9, 27, 14, 30));
    expect(p.morningOf).toEqual(new Date(2026, 9, 28, 8, 0));
  });

  it('moves the morning reminder to an hour before for early events', () => {
    const event = new Date(2026, 9, 28, 7, 30);
    expect(planReminders(event, { before: false, onDay: true }, now).morningOf).toEqual(new Date(2026, 9, 28, 6, 30));
    const edge = new Date(2026, 9, 28, 8, 20);
    expect(planReminders(edge, { before: false, onDay: true }, now).morningOf).toEqual(new Date(2026, 9, 28, 7, 20));
  });

  it('drops reminders in the past', () => {
    const tomorrowMorning = new Date(2026, 9, 26, 9, 0);
    const p = planReminders(tomorrowMorning, { before: true, onDay: true }, now);
    expect(p.dayBefore).toBeNull();
    expect(p.morningOf).toEqual(new Date(2026, 9, 26, 8, 0));
    const laterToday = new Date(2026, 9, 25, 15, 0);
    expect(planReminders(laterToday, { before: true, onDay: true }, now)).toEqual({ dayBefore: null, morningOf: null });
  });

  it('respects the toggles', () => {
    const event = new Date(2026, 9, 30, 12, 0);
    expect(planReminders(event, { before: false, onDay: false }, now)).toEqual({ dayBefore: null, morningOf: null });
  });
});
