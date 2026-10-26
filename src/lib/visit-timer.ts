import type { Store, Visit } from './types';

/** Every visit lasts at least this long; the database enforces it too. */
export const MIN_VISIT_MINUTES = 25;
export const MIN_VISIT_MS = MIN_VISIT_MINUTES * 60_000;
/** The aim is 25 minutes to an hour in store; at an hour the clock-out alarm sounds. */
export const VISIT_ALARM_MINUTES = 60;
export const VISIT_ALARM_MS = VISIT_ALARM_MINUTES * 60_000;

/** A visit that has been started but not completed yet (kept on the device). */
export interface ActiveVisit {
  storeId: string;
  /** ISO timestamp */
  startedAt: string;
  /** Set when the one-hour alarm was silenced with Continue visit. */
  alarmSilenced?: boolean;
}

/** When the clock-out alarm goes off for a visit. */
export function alarmAt(startedAt: string): Date {
  return new Date(new Date(startedAt).getTime() + VISIT_ALARM_MS);
}

/** True from the hour mark until the alarm is silenced (Continue visit) or the visit ends (Clock out). */
export function alarmRinging(visit: ActiveVisit | null, now: number): boolean {
  if (!visit || visit.alarmSilenced) return false;
  return now >= alarmAt(visit.startedAt).getTime();
}

/** Milliseconds until the visit may be completed, never negative. */
export function lockRemainingMs(startedAt: string, now: number): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return MIN_VISIT_MS;
  return Math.max(0, start + MIN_VISIT_MS - now);
}

export function canCompleteVisit(startedAt: string, now: number): boolean {
  return lockRemainingMs(startedAt, now) === 0;
}

/** "24:59", "5:03", "0:00"; whole seconds rounded up so it never shows 0:00 while still locked. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "25 min", "1 h 05 min" */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Minutes between start and end of a timed visit; null for older visits without times. */
export function visitMinutes(v: Pick<Visit, 'visit_start_time' | 'visit_end_time'>): number | null {
  if (!v.visit_start_time || !v.visit_end_time) return null;
  const ms = new Date(v.visit_end_time).getTime() - new Date(v.visit_start_time).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms / 60_000 : null;
}

/** Parses the saved active visit; anything malformed is treated as no visit. */
export function parseActiveVisit(raw: string | null): ActiveVisit | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ActiveVisit>;
    if (typeof v.storeId !== 'string' || typeof v.startedAt !== 'string' || !Number.isFinite(new Date(v.startedAt).getTime())) return null;
    return { storeId: v.storeId, startedAt: v.startedAt, ...(v.alarmSilenced === true ? { alarmSilenced: true } : null) };
  } catch {
    return null;
  }
}

export interface StoreVisitTime {
  storeId: string;
  name: string;
  visits: number;
  avgMinutes: number;
}

export interface VisitTimeSummary {
  /** Timed visits in the month (older visits without times are left out). */
  timedVisits: number;
  /** Average across every timed visit in the month; null when there are none. */
  overallAvgMinutes: number | null;
  /** Average per store, longest first. */
  perStore: StoreVisitTime[];
}

/** Average time on site per store and across all visits for a month ("YYYY-MM", local time). */
export function summariseVisitTimes(visits: Pick<Visit, 'store_id' | 'visited_at' | 'visit_start_time' | 'visit_end_time'>[], month: string, stores: Pick<Store, 'id' | 'name'>[]): VisitTimeSummary {
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const byStore = new Map<string, { total: number; count: number }>();
  let total = 0;
  let count = 0;
  for (const v of visits) {
    const minutes = visitMinutes(v);
    if (minutes === null) continue;
    const at = new Date(v.visit_end_time ?? v.visited_at);
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    if (key !== month) continue;
    const t = byStore.get(v.store_id) ?? { total: 0, count: 0 };
    t.total += minutes;
    t.count++;
    byStore.set(v.store_id, t);
    total += minutes;
    count++;
  }
  const perStore = [...byStore.entries()]
    .map(([storeId, t]) => ({ storeId, name: names.get(storeId) ?? 'Unknown store', visits: t.count, avgMinutes: t.total / t.count }))
    .sort((a, b) => b.avgMinutes - a.avgMinutes || a.name.localeCompare(b.name));
  return { timedVisits: count, overallAvgMinutes: count ? total / count : null, perStore };
}
