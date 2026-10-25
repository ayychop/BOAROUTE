/** Weekday numbers follow Date.getDay(): 0 = Sunday ... 6 = Saturday. UK weeks start on Monday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

export const WORKDAY_PRESETS: { label: string; days: number[] }[] = [
  { label: 'Mon to Fri', days: [1, 2, 3, 4, 5] },
  { label: 'Mon to Sat', days: [1, 2, 3, 4, 5, 6] },
  { label: 'Tue to Sat', days: [2, 3, 4, 5, 6] },
  { label: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] },
];

/** Unique, valid weekdays in UK week order. */
export function normaliseDays(days: readonly number[] | null | undefined): number[] {
  const set = new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  return WEEK_ORDER.filter((d) => set.has(d));
}

export function toggleDay(days: readonly number[], day: number): number[] {
  return normaliseDays(days.includes(day) ? days.filter((d) => d !== day) : [...days, day]);
}

export function isWorkingDay(date: Date, days: readonly number[] | null | undefined): boolean {
  return normaliseDays(days ?? DEFAULT_WORKING_DAYS).includes(date.getDay());
}

/** "Mon to Fri", "Mon, Wed, Fri", "Every day" or "No working days". */
export function describeDays(days: readonly number[]): string {
  const d = normaliseDays(days);
  if (d.length === 0) return 'No working days';
  if (d.length === 7) return 'Every day';
  const idx = d.map((x) => WEEK_ORDER.indexOf(x as (typeof WEEK_ORDER)[number]));
  const consecutive = d.length >= 3 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (consecutive) return `${DAY_SHORT[d[0]]} to ${DAY_SHORT[d[d.length - 1]]}`;
  return d.map((x) => DAY_SHORT[x]).join(', ');
}

/** Month as Monday-first weeks; days outside the month are null. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Working days left in the month from (and including) the given date. */
export function workingDaysLeft(from: Date, days: readonly number[]): number {
  const set = new Set(normaliseDays(days));
  const last = new Date(from.getFullYear(), from.getMonth() + 1, 0).getDate();
  let n = 0;
  for (let d = from.getDate(); d <= last; d++) if (set.has(new Date(from.getFullYear(), from.getMonth(), d).getDay())) n++;
  return n;
}
