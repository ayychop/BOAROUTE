import { distinctOwners } from '../src/lib/frequency';
import { DAILY_QUOTES, LONG_READS, dailyQuote, dailyQuoteIndex } from '../src/lib/motivation';
import { CAR_ICONS, DEFAULT_CAR_ICON, DEFAULT_ROUTE_COLOR, ROUTE_COLORS, formatReg, plateName, prefsFor } from '../src/lib/preferences';
import { CURRENT_RELEASE, shouldShowWhatsNew } from '../src/lib/whats-new';
import { datesFromPattern, datesInMonth, isWorkingDate, normaliseDates, toggleDate, workingDatesLeft } from '../src/lib/workdays';

describe('team management store owners', () => {
  it('lists every distinct owner from the stores table, Jo first', () => {
    const rows = [{ assigned_manager: 'Pete' }, { assigned_manager: 'Joseph' }, { assigned_manager: 'Marcia' }, { assigned_manager: 'Joseph' }, { assigned_manager: null }, { assigned_manager: 'Sarah' }];
    expect(distinctOwners(rows)).toEqual([
      { owner: 'Joseph', stores: 2 },
      { owner: 'Pete', stores: 1 },
      { owner: 'Marcia', stores: 1 },
      { owner: 'Sarah', stores: 1 },
    ]);
  });
});

describe('shift calendar', () => {
  const mon = new Date(2026, 9, 26);
  const sun = new Date(2026, 9, 25);

  it('checks exact dates once the calendar is saved', () => {
    expect(isWorkingDate(sun, ['2026-10-25'], [1, 2, 3, 4, 5])).toBe(true);
    expect(isWorkingDate(mon, ['2026-10-25'], [1, 2, 3, 4, 5])).toBe(false);
    // Saved but empty means every day is off.
    expect(isWorkingDate(mon, [], [1, 2, 3, 4, 5])).toBe(false);
  });

  it('falls back to the weekly pattern until the calendar is saved', () => {
    expect(isWorkingDate(mon, null, [1, 2, 3, 4, 5])).toBe(true);
    expect(isWorkingDate(sun, null, [1, 2, 3, 4, 5])).toBe(false);
  });

  it('counts working dates left this month', () => {
    expect(workingDatesLeft(mon, ['2026-10-01', '2026-10-26', '2026-10-30', '2026-11-02'])).toBe(2);
    // Mon 26 to Sat 31 October: five weekdays.
    expect(workingDatesLeft(mon, null, [1, 2, 3, 4, 5])).toBe(5);
  });

  it('toggles and normalises dates', () => {
    expect(toggleDate(['2026-10-26'], '2026-10-27')).toEqual(['2026-10-26', '2026-10-27']);
    expect(toggleDate(['2026-10-26', '2026-10-27'], '2026-10-26')).toEqual(['2026-10-27']);
    expect(normaliseDates(['2026-10-27T00:00:00', '2026-10-27', 'nope', '2026-10-01'])).toEqual(['2026-10-01', '2026-10-27']);
  });

  it('seeds dates from the old weekly pattern', () => {
    const dates = datesFromPattern([1, 2, 3, 4, 5], new Date(2026, 9, 15), 1);
    expect(dates).toHaveLength(22);
    expect(dates[0]).toBe('2026-10-01');
    expect(datesInMonth(dates, 2026, 9)).toBe(22);
    expect(datesInMonth(dates, 2026, 10)).toBe(0);
  });
});

describe('preferences', () => {
  it('fills defaults and ignores unknown values', () => {
    expect(prefsFor(null)).toEqual({ car_icon: DEFAULT_CAR_ICON, route_color: DEFAULT_ROUTE_COLOR });
    expect(prefsFor({ preferences: { car_icon: 'arrow', route_color: 'neon-blue', car_reg: 'AB12 CDE' } })).toMatchObject({ car_icon: 'arrow', route_color: 'neon-blue', car_reg: 'AB12 CDE' });
    expect(prefsFor({ preferences: { car_icon: 'ufo' as never, route_color: 'mauve' as never } })).toMatchObject({ car_icon: DEFAULT_CAR_ICON, route_color: DEFAULT_ROUTE_COLOR });
  });

  it('has six-digit hex colours, so the glow alpha can be appended', () => {
    for (const c of ROUTE_COLORS) expect(c.color).toMatch(/^#[0-9A-F]{6}$/i);
    expect(ROUTE_COLORS.map((c) => c.label)).toEqual(expect.arrayContaining(['BOA Gold', 'Neon Blue']));
    expect(new Set(CAR_ICONS.map((c) => c.id)).size).toBe(CAR_ICONS.length);
  });

  it('formats UK registrations', () => {
    expect(formatReg('ab12cde')).toBe('AB12 CDE');
    expect(formatReg(' ab12  cde ')).toBe('AB12 CDE');
    expect(formatReg('j0 boa!')).toBe('J0 BOA');
  });

  it('puts the first name on the number plate', () => {
    expect(plateName('Sarah Jones')).toBe('SARAH');
    expect(plateName('Jo')).toBe('JO');
    expect(plateName(null, 'david@example.com')).toBe('DAVID');
    expect(plateName('', '')).toBe('BOA');
  });
});

describe('motivation', () => {
  it('rotates one quote per day and wraps around', () => {
    const d = new Date(2026, 9, 26, 9);
    const next = new Date(2026, 9, 27, 9);
    expect(dailyQuoteIndex(next)).toBe((dailyQuoteIndex(d) + 1) % DAILY_QUOTES.length);
    expect(dailyQuote(d, DAILY_QUOTES.length)).toBe(dailyQuote(d));
    expect(dailyQuote(d, -1)).toBe(DAILY_QUOTES[(dailyQuoteIndex(d) - 1 + DAILY_QUOTES.length) % DAILY_QUOTES.length]);
    // Same day, any hour: same quote.
    expect(dailyQuote(new Date(2026, 9, 26, 23, 59))).toBe(dailyQuote(new Date(2026, 9, 26, 0, 1)));
  });

  it('has premium long reads and no em or en dashes anywhere', () => {
    expect(LONG_READS.length).toBeGreaterThanOrEqual(5);
    const all = [...DAILY_QUOTES, ...LONG_READS.flatMap((r) => [r.title, ...r.paragraphs])].join(' ');
    expect(all).not.toMatch(/[–—]/);
  });
});

describe("what's new", () => {
  it('shows once per release', () => {
    expect(shouldShowWhatsNew(null)).toBe(true);
    expect(shouldShowWhatsNew('2020-01-01')).toBe(true);
    expect(shouldShowWhatsNew(CURRENT_RELEASE.id)).toBe(false);
    expect(CURRENT_RELEASE.highlights.length).toBeGreaterThan(0);
  });
});
