import fs from 'fs';
import path from 'path';
import {
  OM_D_GRADE_WEEKLY_LIMIT,
  OM_WEEKLY_LIMIT,
  VISIT_LIMIT_MESSAGE,
  VisitLimitError,
  isVisitLimitError,
  visitsLeftThisWeek,
  weekStart,
  weeklyVisitCounts,
  weekLockedIds,
  weeklyVisitLimit,
} from '../src/lib/visit-limits';
import { planDayRoute } from '../src/lib/route-engine';

describe('OM weekly visit limit', () => {
  it('gives OMs 1 visit a week at standard stores and 2 at D grade', () => {
    expect(weeklyVisitLimit('OM', 'A')).toBe(OM_WEEKLY_LIMIT);
    expect(weeklyVisitLimit('OM', 'B')).toBe(1);
    expect(weeklyVisitLimit('OM', 'C')).toBe(1);
    expect(weeklyVisitLimit('OM', 'D')).toBe(OM_D_GRADE_WEEKLY_LIMIT);
    expect(OM_D_GRADE_WEEKLY_LIMIT).toBe(2);
  });

  it('never limits OTMs or people who have not picked a role', () => {
    expect(weeklyVisitLimit('OTM', 'A')).toBeNull();
    expect(weeklyVisitLimit(null, 'D')).toBeNull();
    expect(visitsLeftThisWeek('OTM', 'A', 9)).toBe(Infinity);
  });

  it('counts down and locks at the limit', () => {
    expect(visitsLeftThisWeek('OM', 'A', 0)).toBe(1);
    expect(visitsLeftThisWeek('OM', 'A', 1)).toBe(0);
    expect(visitsLeftThisWeek('OM', 'D', 1)).toBe(1);
    expect(visitsLeftThisWeek('OM', 'D', 2)).toBe(0);
    expect(visitsLeftThisWeek('OM', 'D', 5)).toBe(0);
  });
});

describe('the visit week', () => {
  it('starts on Monday at midnight local time', () => {
    // Wednesday 29 October 2026, mid-afternoon.
    const start = weekStart(new Date(2026, 9, 29, 15, 30).getTime());
    expect(start.getDay()).toBe(1);
    expect(start.getDate()).toBe(26);
    expect(start.getHours()).toBe(0);
  });

  it('treats Sunday as the end of the week, not the start', () => {
    expect(weekStart(new Date(2026, 10, 1, 22, 0).getTime()).getDate()).toBe(26);
    expect(weekStart(new Date(2026, 10, 2, 0, 1).getTime()).getDate()).toBe(2);
  });

  it('counts only visits since Monday, per store', () => {
    const now = new Date(2026, 9, 29, 12).getTime();
    const counts = weeklyVisitCounts(
      [
        { store_id: 'a', visited_at: new Date(2026, 9, 26, 9).toISOString() },
        { store_id: 'a', visited_at: new Date(2026, 9, 28, 9).toISOString() },
        { store_id: 'b', visited_at: new Date(2026, 9, 25, 23).toISOString() },
      ],
      now,
    );
    expect(counts).toEqual({ a: 2 });
  });
});

describe('limit errors', () => {
  it('uses the exact pop-up wording', () => {
    expect(VISIT_LIMIT_MESSAGE).toBe('Visit limit reached for this store. OM standard limit is 1 visit (2 for D Grade).');
    expect(new VisitLimitError().message).toBe(VISIT_LIMIT_MESSAGE);
  });

  it('recognises the database refusal as well as the app one', () => {
    expect(isVisitLimitError(new VisitLimitError())).toBe(true);
    expect(isVisitLimitError({ message: VISIT_LIMIT_MESSAGE, code: 'P0001' })).toBe(true);
    expect(isVisitLimitError(new Error('Visits must be at least 25 minutes long'))).toBe(false);
    expect(isVisitLimitError(null)).toBe(false);
  });

  it('matches the message and limits the database enforces', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261025000000_boaroute_init.sql'), 'utf8');
    expect(sql).toContain(VISIT_LIMIT_MESSAGE);
    expect(sql).toMatch(/v_limit := case when v_grade = 'D' then 2 else 1 end;/);
    expect(sql).toMatch(/check \(user_role is null or user_role in \('OM', 'OTM'\)\)/);
  });
});

describe('route planner lockout', () => {
  const stores = [
    { id: 'a', grade: 'A' as const },
    { id: 'd', grade: 'D' as const },
    { id: 'c', grade: 'C' as const },
  ];

  it('locks OM stores at their weekly limit only', () => {
    expect([...weekLockedIds(stores, 'OM', { a: 1, d: 1 })]).toEqual(['a']);
    expect([...weekLockedIds(stores, 'OM', { a: 1, d: 2, c: 0 })]).toEqual(['a', 'd']);
  });

  it('never locks OTM stores', () => {
    expect(weekLockedIds(stores, 'OTM', { a: 5, d: 5 }).size).toBe(0);
  });

  it('keeps locked stores out of the day route while they still count as owed', () => {
    const route = [
      { id: 'a', name: 'Alpha', address: '', grade: 'A' as const, assigned_manager: 'Joseph' as const, latitude: 51.5, longitude: -0.1, last_visit_date: null, required_frequency: 4 },
      { id: 'c', name: 'Charlie', address: '', grade: 'C' as const, assigned_manager: 'Joseph' as const, latitude: 51.51, longitude: -0.11, last_visit_date: null, required_frequency: 2 },
    ];
    const locked = weekLockedIds(route, 'OM', { a: 1 });
    const plan = planDayRoute(route, { a: { count: 1, last: null } }, { A: 4, B: 3, C: 2, D: 1 }, { lat: 51.5, lng: -0.1 }, { excludeIds: [...locked] });
    expect(plan.stops.map((s) => s.store.id)).toEqual(['c']);
    expect(plan.dueCount).toBe(2);
  });
});
