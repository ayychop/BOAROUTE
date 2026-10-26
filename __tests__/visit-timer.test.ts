import fs from 'fs';
import path from 'path';
import { buildMonthlyReport } from '../src/lib/report';
import {
  MIN_VISIT_MS,
  VISIT_ALARM_MS,
  alarmAt,
  alarmRinging,
  canCompleteVisit,
  formatCountdown,
  formatDuration,
  lockRemainingMs,
  parseActiveVisit,
  summariseVisitTimes,
  visitMinutes,
} from '../src/lib/visit-timer';

const start = '2026-10-26T09:00:00.000Z';
const t0 = new Date(start).getTime();

describe('25-minute visit lockout', () => {
  it('stays locked for the first 25 minutes', () => {
    expect(lockRemainingMs(start, t0)).toBe(MIN_VISIT_MS);
    expect(canCompleteVisit(start, t0 + 24 * 60_000 + 59_000)).toBe(false);
    expect(lockRemainingMs(start, t0 + 10 * 60_000)).toBe(15 * 60_000);
  });

  it('unlocks at exactly 25 minutes and after', () => {
    expect(canCompleteVisit(start, t0 + MIN_VISIT_MS)).toBe(true);
    expect(lockRemainingMs(start, t0 + 40 * 60_000)).toBe(0);
  });

  it('counts down as m:ss and never shows 0:00 while still locked', () => {
    expect(formatCountdown(MIN_VISIT_MS)).toBe('25:00');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('formats durations', () => {
    expect(formatDuration(25)).toBe('25 min');
    expect(formatDuration(65.4)).toBe('1 h 05 min');
  });
});

describe('one-hour clock-out alarm', () => {
  it('rings from the hour until silenced', () => {
    const visit = { storeId: 's1', startedAt: start };
    expect(alarmAt(start).getTime()).toBe(t0 + VISIT_ALARM_MS);
    expect(alarmRinging(visit, t0 + 59 * 60_000)).toBe(false);
    expect(alarmRinging(visit, t0 + VISIT_ALARM_MS)).toBe(true);
    expect(alarmRinging({ ...visit, alarmSilenced: true }, t0 + 2 * VISIT_ALARM_MS)).toBe(false);
    expect(alarmRinging(null, t0 + VISIT_ALARM_MS)).toBe(false);
  });

  it('restores a saved visit, including a silenced alarm, and ignores junk', () => {
    expect(parseActiveVisit(JSON.stringify({ storeId: 's1', startedAt: start, alarmSilenced: true }))).toEqual({ storeId: 's1', startedAt: start, alarmSilenced: true });
    expect(parseActiveVisit(JSON.stringify({ storeId: 's1', startedAt: start }))).toEqual({ storeId: 's1', startedAt: start });
    expect(parseActiveVisit('{oops')).toBeNull();
    expect(parseActiveVisit(JSON.stringify({ storeId: 1 }))).toBeNull();
    expect(parseActiveVisit(null)).toBeNull();
  });
});

describe('visit time reporting', () => {
  const at = (iso: string, mins: number) => ({
    visited_at: new Date(new Date(iso).getTime() + mins * 60_000).toISOString(),
    visit_start_time: iso,
    visit_end_time: new Date(new Date(iso).getTime() + mins * 60_000).toISOString(),
  });
  const visits = [
    { store_id: 'a', ...at('2026-10-02T09:00:00', 30) },
    { store_id: 'a', ...at('2026-10-09T09:00:00', 50) },
    { store_id: 'b', ...at('2026-10-05T13:00:00', 26) },
    // Older visit without times: left out of the averages.
    { store_id: 'b', visited_at: '2026-10-06T10:00:00', visit_start_time: null, visit_end_time: null },
    // Other month.
    { store_id: 'a', ...at('2026-09-20T09:00:00', 90) },
  ];
  const stores = [
    { id: 'a', name: 'Tesco Extra High Wycombe' },
    { id: 'b', name: 'Boots Reading' },
  ];

  it('averages per store and across every visit in the month', () => {
    const s = summariseVisitTimes(visits, '2026-10', stores);
    expect(s.timedVisits).toBe(3);
    expect(s.overallAvgMinutes).toBeCloseTo((30 + 50 + 26) / 3, 5);
    expect(s.perStore).toEqual([
      { storeId: 'a', name: 'Tesco Extra High Wycombe', visits: 2, avgMinutes: 40 },
      { storeId: 'b', name: 'Boots Reading', visits: 1, avgMinutes: 26 },
    ]);
  });

  it('handles a month with no timed visits', () => {
    const s = summariseVisitTimes(visits, '2026-08', stores);
    expect(s).toEqual({ timedVisits: 0, overallAvgMinutes: null, perStore: [] });
  });

  it('reads minutes from a timed visit only', () => {
    expect(visitMinutes(at('2026-10-02T09:00:00', 30))).toBe(30);
    expect(visitMinutes({ visit_start_time: null, visit_end_time: null })).toBeNull();
  });

  it('prints both averages in the end-of-month report', () => {
    const report = buildMonthlyReport({ month: '2026-10', mileage: [], expenses: [], visitTimes: summariseVisitTimes(visits, '2026-10', stores) });
    expect(report).toContain('VISIT TIME (3 timed visits)');
    expect(report).toContain('Overall average across all visits: 35 min');
    expect(report).toContain('  Tesco Extra High Wycombe: 40 min (2 visits)');
    expect(report).toContain('  Boots Reading: 26 min (1 visit)');
    expect(buildMonthlyReport({ month: '2026-08', mileage: [], expenses: [], visitTimes: summariseVisitTimes(visits, '2026-08', stores) })).toContain('No timed visits this month.');
    expect(buildMonthlyReport({ month: '2026-10', mileage: [], expenses: [] })).not.toContain('VISIT TIME');
  });
});

describe('database enforces the visit rules', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261025000000_boaroute_init.sql'), 'utf8');
  it('adds the visit time columns, the 25-minute minimum and the profile columns', () => {
    expect(sql).toContain('add column if not exists visit_start_time timestamptz');
    expect(sql).toContain('add column if not exists visit_end_time timestamptz');
    expect(sql).toContain("visit_end_time >= visit_start_time + interval '25 minutes'");
    expect(sql).toContain('create trigger visits_timing_guard');
    expect(sql).toContain('add column if not exists shift_dates date[]');
    expect(sql).toContain("add column if not exists preferences jsonb not null default '{}'::jsonb");
  });

  it('no longer wipes the admin’s store picks when the file is re-run', () => {
    expect(sql).not.toContain('set route_managers = null where role');
  });
});
