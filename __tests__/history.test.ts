import { dayKey, monthBounds, msUntilMidnight, recentMonths, talliesForMonth } from '../src/lib/history';

const visit = (store_id: string, d: Date, is_manual = false) => ({ store_id, visited_at: d.toISOString(), is_manual });

describe('monthly rollover', () => {
  it('lists months newest first across a year boundary', () => {
    expect(recentMonths(3, new Date(2026, 9, 29))).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(recentMonths(3, new Date(2026, 0, 15))).toEqual(['2026-01', '2025-12', '2025-11']);
    expect(recentMonths(13, new Date(2026, 9, 29))).toHaveLength(13);
    expect(recentMonths(13, new Date(2026, 9, 29))[12]).toBe('2025-10');
  });

  it('gives local month bounds with the end exclusive', () => {
    const { start, end } = monthBounds('2026-12');
    expect(start).toEqual(new Date(2026, 11, 1));
    expect(end).toEqual(new Date(2027, 0, 1));
  });

  it('starts a new month at zero on the 1st', () => {
    const visits = [visit('a', new Date(2026, 9, 28, 10)), visit('a', new Date(2026, 9, 30, 10))];
    expect(talliesForMonth(visits, '2026-10').a.count).toBe(2);
    // The same visits are not counted in November.
    expect(talliesForMonth(visits, '2026-11').a.count).toBe(0);
  });

  it('shows a past month as it stood when it closed', () => {
    const visits = [visit('a', new Date(2026, 8, 3, 9)), visit('a', new Date(2026, 8, 20, 9)), visit('a', new Date(2026, 9, 2, 9)), visit('b', new Date(2026, 10, 1, 9))];
    const sept = talliesForMonth(visits, '2026-09');
    expect(sept.a.count).toBe(2);
    expect(sept.a.last).toBe(new Date(2026, 8, 20, 9).toISOString());
    // A store first visited after the month ended does not appear.
    expect(sept.b).toBeUndefined();
  });

  it('counts a visit at the last millisecond of a month in that month, not the next', () => {
    const edge = new Date(2026, 10, 1).getTime() - 1;
    const v = [{ store_id: 'a', visited_at: new Date(edge).toISOString(), is_manual: false }];
    expect(talliesForMonth(v, '2026-10').a.count).toBe(1);
    expect(talliesForMonth(v, '2026-11').a?.count ?? 0).toBe(0);
  });

  it('keeps manual visits out of the last-visited date but in the count', () => {
    const t = talliesForMonth([visit('a', new Date(2026, 9, 5, 9)), visit('a', new Date(2026, 9, 9, 9), true)], '2026-10');
    expect(t.a.count).toBe(2);
    expect(t.a.last).toBe(new Date(2026, 9, 5, 9).toISOString());
  });

  it('ignores unparseable dates', () => {
    expect(talliesForMonth([{ store_id: 'a', visited_at: 'nope', is_manual: false }], '2026-10')).toEqual({});
  });
});

describe('midnight', () => {
  it('counts down to local midnight', () => {
    expect(msUntilMidnight(new Date(2026, 9, 29, 23, 59, 30))).toBe(30_000);
    expect(msUntilMidnight(new Date(2026, 9, 29, 0, 0, 0))).toBe(24 * 3600_000);
  });

  it('never returns less than a second', () => {
    expect(msUntilMidnight(new Date(2026, 9, 29, 23, 59, 59, 500))).toBe(1000);
  });

  it('keys the day so anything built on it rolls over once a day', () => {
    expect(dayKey(new Date(2026, 9, 29, 23, 59))).toBe('2026-10-29');
    expect(dayKey(new Date(2026, 9, 30, 0, 1))).toBe('2026-10-30');
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
