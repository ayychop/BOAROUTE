import type { Grade, Store, UserRole, Visit } from './types';

/** OM visits per store per week. OTMs have no weekly limit. Matches visits_weekly_limit_guard() in the database. */
export const OM_WEEKLY_LIMIT = 1;
export const OM_D_GRADE_WEEKLY_LIMIT = 2;

export const VISIT_LIMIT_MESSAGE = 'Visit limit reached for this store. OM standard limit is 1 visit (2 for D Grade).';

/** Thrown when an OM tries to go over their weekly limit, so screens can show the limit pop-up. */
export class VisitLimitError extends Error {
  constructor() {
    super(VISIT_LIMIT_MESSAGE);
    this.name = 'VisitLimitError';
  }
}

/** True for the error above and for the same refusal coming back from the database. */
export function isVisitLimitError(e: unknown): boolean {
  if (e instanceof VisitLimitError) return true;
  const message = typeof e === 'object' && e !== null && 'message' in e ? (e as { message: unknown }).message : null;
  return typeof message === 'string' && message.startsWith('Visit limit reached');
}

/** Visits allowed per store per week, or null for no weekly limit. */
export function weeklyVisitLimit(role: UserRole | null | undefined, grade: Grade): number | null {
  if (role !== 'OM') return null;
  return grade === 'D' ? OM_D_GRADE_WEEKLY_LIMIT : OM_WEEKLY_LIMIT;
}

/** Monday 00:00 local time of the week containing `now`. */
export function weekStart(now: number): Date {
  const d = new Date(now);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - sinceMonday);
}

/** Visits per store since Monday, timed or logged by hand. */
export function weeklyVisitCounts(visits: Pick<Visit, 'store_id' | 'visited_at'>[], now = Date.now()): Record<string, number> {
  const start = weekStart(now).getTime();
  const out: Record<string, number> = {};
  for (const v of visits) {
    if (new Date(v.visited_at).getTime() >= start) out[v.store_id] = (out[v.store_id] ?? 0) + 1;
  }
  return out;
}

/** Visits still allowed at this store this week; Infinity when there is no limit. */
export function visitsLeftThisWeek(role: UserRole | null | undefined, grade: Grade, doneThisWeek: number): number {
  const limit = weeklyVisitLimit(role, grade);
  return limit === null ? Infinity : Math.max(0, limit - doneThisWeek);
}

/** Stores this person has used up this week's visits at. Always empty for OTMs. */
export function weekLockedIds(stores: Pick<Store, 'id' | 'grade'>[], role: UserRole | null | undefined, counts: Record<string, number>): Set<string> {
  const out = new Set<string>();
  if (role !== 'OM') return out;
  for (const s of stores) if (visitsLeftThisWeek(role, s.grade, counts[s.id] ?? 0) <= 0) out.add(s.id);
  return out;
}
