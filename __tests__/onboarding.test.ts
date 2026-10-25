import { formatOdometer, odometerDigits, odometerValue, parseOdometer } from '../src/lib/odometer';
import { defaultSelection, filterStores, toggleGroup } from '../src/lib/store-selection';
import type { Store } from '../src/lib/types';
import { describeDays, isWorkingDay, monthGrid, normaliseDays, toggleDay, workingDaysLeft } from '../src/lib/workdays';

const store = (id: string, name: string, manager: Store['assigned_manager'], address = 'High Street'): Store => ({
  id,
  name,
  address,
  assigned_manager: manager,
  user_id: null,
  grade: 'A',
  required_frequency: 4,
  visits_completed: 0,
  last_visit_date: null,
  vibe: null,
  latitude: 51,
  longitude: -0.7,
});
const stores = [store('1', 'Reading - EE', 'Joseph'), store('2', 'Slough - O2', 'David', 'Queensmere'), store('3', 'Oxford - Currys', 'Pete'), store('4', 'Bracknell - EE', 'Joseph')];

describe('store selection', () => {
  it('pre-selects every Joseph store for Jo only', () => {
    expect(defaultSelection(stores, true)).toEqual(['1', '4']);
    expect(defaultSelection(stores, false)).toEqual([]);
  });
  it('filters by manager and by name or address', () => {
    expect(filterStores(stores, '', 'Joseph').map((s) => s.id)).toEqual(['1', '4']);
    expect(filterStores(stores, 'queens', null).map((s) => s.id)).toEqual(['2']);
    expect(filterStores(stores, ' READING ', null).map((s) => s.id)).toEqual(['1']);
  });
  it('toggles a whole group on, then off', () => {
    const jo = filterStores(stores, '', 'Joseph');
    expect(toggleGroup(['2'], jo).sort()).toEqual(['1', '2', '4']);
    expect(toggleGroup(['1', '2', '4'], jo)).toEqual(['2']);
  });
});

describe('odometer', () => {
  it.each([
    ['14500', 14500],
    ['14,500', 14500],
    ['14 500.4', 14500.4],
    ['0', 0],
    ['999999', 999999],
  ])('parses %s', (input, out) => expect(parseOdometer(input)).toBe(out));
  it.each(['', 'abc', '-5', '1000000', '12.34', '1e5'])('rejects %s', (input) => expect(parseOdometer(input)).toBeNaN());
  it('formats like a dashboard', () => {
    expect(formatOdometer('14542.5')).toBe('14,542');
    expect(formatOdometer(null)).toBe('--');
    expect(odometerDigits(14542.9)).toEqual(['0', '1', '4', '5', '4', '2']);
    expect(odometerDigits(null)).toHaveLength(6);
    expect(odometerValue('')).toBeNull();
  });
});

describe('working days', () => {
  it('normalises to UK week order', () => {
    expect(normaliseDays([0, 5, 1, 1, 9, 3])).toEqual([1, 3, 5, 0]);
    expect(toggleDay([1, 2, 3], 2)).toEqual([1, 3]);
    expect(toggleDay([1, 3], 6)).toEqual([1, 3, 6]);
  });
  it('describes common patterns', () => {
    expect(describeDays([1, 2, 3, 4, 5])).toBe('Mon to Fri');
    expect(describeDays([2, 3, 4, 5, 6])).toBe('Tue to Sat');
    expect(describeDays([1, 3, 5])).toBe('Mon, Wed, Fri');
    expect(describeDays([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(describeDays([])).toBe('No working days');
    expect(describeDays([6, 0])).toBe('Sat, Sun');
  });
  it('checks a date against the pattern', () => {
    expect(isWorkingDay(new Date(2026, 9, 26), [1, 2, 3, 4, 5])).toBe(true); // Monday
    expect(isWorkingDay(new Date(2026, 9, 25), [1, 2, 3, 4, 5])).toBe(false); // Sunday
    expect(isWorkingDay(new Date(2026, 9, 25), null)).toBe(false); // defaults to Mon to Fri
  });
  it('lays out a Monday-first month', () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid[0].slice(0, 3)).toEqual([null, null, null]);
    expect(grid[0][3]?.getDate()).toBe(1);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });
  it('counts working days left in the month', () => {
    expect(workingDaysLeft(new Date(2026, 9, 26), [1, 2, 3, 4, 5])).toBe(5); // 26 to 30 Oct
    expect(workingDaysLeft(new Date(2026, 9, 31), [1, 2, 3, 4, 5])).toBe(0); // Saturday
  });
});
