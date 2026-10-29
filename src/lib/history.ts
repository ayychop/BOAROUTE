import { monthKey } from './budget';
import type { VisitTally } from './route-engine';
import type { Visit } from './types';

/** "2026-10", "2026-09", ... newest first, n months including this one. */
export function recentMonths(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
}

/** Local-time bounds of a "YYYY-MM" month, end exclusive. */
export function monthBounds(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}

/**
 * Per store: visits in `month`, and the latest timed visit up to the end of
 * that month. For the current month this matches the live tallies; for a past
 * month it shows the dashboard as it stood when that month closed.
 */
export function talliesForMonth(visits: Pick<Visit, 'store_id' | 'visited_at' | 'is_manual'>[], month: string): Record<string, VisitTally> {
  const { start, end } = monthBounds(month);
  const s = start.getTime();
  const e = end.getTime();
  const out: Record<string, VisitTally> = {};
  for (const v of visits) {
    const t = new Date(v.visited_at).getTime();
    if (!Number.isFinite(t) || t >= e) continue;
    const tally = (out[v.store_id] ??= { count: 0, last: null });
    if (t >= s) tally.count++;
    if (!v.is_manual && (!tally.last || v.visited_at > tally.last)) tally.last = v.visited_at;
  }
  return out;
}

/** Milliseconds until the next local midnight (at least 1 s), when the day, week and month roll over. */
export function msUntilMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}

/** "2026-10-29": changes once a day, so anything keyed on it rolls over at midnight. */
export function dayKey(now = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}
