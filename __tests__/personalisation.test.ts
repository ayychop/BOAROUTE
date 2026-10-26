import { distinctOwners } from '../src/lib/frequency';
import { DAILY_QUOTES, LONG_READS, MANAGER_DAILY_QUOTES, dailyQuote, dailyQuoteIndex, dayOfYear, quotesFor } from '../src/lib/motivation';
import { CAR_ICONS, DEFAULT_CAR_ICON, DEFAULT_ROUTE_COLOR, ROUTE_COLORS, cleanPlate, displayPlate, formatReg, plateFontSize, plateName, prefsFor } from '../src/lib/preferences';
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

  it('shows the custom plate, upper case and capped at 8, or falls back to the first name', () => {
    expect(cleanPlate('ab12 cde')).toBe('AB12 CDE');
    expect(cleanPlate('  boa-route  2026')).toBe('BOAROUTE');
    expect(displayPlate({ name: 'Jo Smith', email: 'jo@example.com', preferences: { custom_plate: 'jo 1' } })).toBe('JO 1');
    expect(displayPlate({ name: 'Jo Smith', email: 'jo@example.com', preferences: { custom_plate: '   ' } })).toBe('JO');
    expect(displayPlate({ name: 'Sarah', email: '', preferences: null })).toBe('SARAH');
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

  it('has a unique Real Talk quote for every day of the year, picked by dayOfYear % length', () => {
    expect(DAILY_QUOTES).toHaveLength(365);
    expect(new Set(DAILY_QUOTES).size).toBe(365);
    expect(dayOfYear(new Date(2026, 0, 1))).toBe(1);
    expect(dayOfYear(new Date(2026, 11, 31, 23, 59))).toBe(365);
    expect(dayOfYear(new Date(2028, 11, 31))).toBe(366);
    // Across the clock change (29 Mar 2026 in the UK) the count still steps by one.
    expect(dayOfYear(new Date(2026, 2, 30)) - dayOfYear(new Date(2026, 2, 29))).toBe(1);
    const d = new Date(2026, 9, 26, 9);
    expect(dailyQuoteIndex(d)).toBe(dayOfYear(d) % DAILY_QUOTES.length);
    // New Year still moves on to a different quote.
    expect(dailyQuote(new Date(2027, 0, 1))).not.toBe(dailyQuote(new Date(2026, 11, 31)));
    // Every day of a year gets its own quote.
    const year = new Set(Array.from({ length: 365 }, (_, i) => dailyQuote(new Date(2026, 0, 1 + i))));
    expect(year.size).toBe(365);
  });

  it('gives managers their own 365 quotes on the same daily rotation', () => {
    expect(MANAGER_DAILY_QUOTES).toHaveLength(365);
    expect(new Set(MANAGER_DAILY_QUOTES).size).toBe(365);
    expect(quotesFor(true)).toBe(MANAGER_DAILY_QUOTES);
    expect(quotesFor(false)).toBe(DAILY_QUOTES);
    const d = new Date(2026, 9, 26, 9);
    expect(dailyQuote(d, 0, MANAGER_DAILY_QUOTES)).toBe(MANAGER_DAILY_QUOTES[dayOfYear(d) % 365]);
    expect(dailyQuote(new Date(2026, 9, 26, 23, 59), 0, MANAGER_DAILY_QUOTES)).toBe(dailyQuote(new Date(2026, 9, 26, 0, 1), 0, MANAGER_DAILY_QUOTES));
  });

  it('has premium long reads and no em or en dashes anywhere', () => {
    expect(LONG_READS.length).toBeGreaterThanOrEqual(5);
    const all = [...DAILY_QUOTES, ...MANAGER_DAILY_QUOTES, ...LONG_READS.flatMap((r) => [r.title, ...r.paragraphs])].join(' ');
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

describe('number plate lettering', () => {
  it('fills the plate height for short names', () => {
    expect(plateFontSize('JO', 82, 24)).toBeCloseTo(24 * 0.7);
    expect(plateFontSize('SARAH', 82, 24)).toBeCloseTo(24 * 0.7);
  });

  it('steps down so eight characters still fit the width, without going tiny', () => {
    const size = plateFontSize('KMKM25ML', 82, 24);
    expect(size).toBeLessThan(24 * 0.7);
    expect(size * 8 * 0.74).toBeLessThanOrEqual(82 + 0.001);
    expect(size).toBeGreaterThan(24 * 0.5);
  });

  it('lets the plate fill more of its height when asked, still fitting KMKM25ML', () => {
    expect(plateFontSize('JO', 100, 24, 0.8)).toBeCloseTo(24 * 0.8);
    expect(plateFontSize('KMKM25ML', 100, 24, 0.8) * 8 * 0.74).toBeLessThanOrEqual(100 + 0.001);
  });

  it('treats spaces as narrow, like a real registration', () => {
    expect(plateFontSize('AB12 CDE', 82, 24)).toBeGreaterThan(plateFontSize('AB12XCDE', 82, 24));
  });
});
