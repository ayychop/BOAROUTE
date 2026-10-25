import {
  DEFAULT_SPECIAL_BUDGET_PENCE,
  DEFAULT_STANDARD_BUDGET_PENCE,
  budgetsFor,
  parseBudget,
  formatPence,
  localDateString,
  monthKey,
  parseMiles,
  poolFor,
  checkExpense,
  sessionTypeFor,
  summariseBudget,
  summariseMileage,
  takeoverBudgetFor,
  toPence,
  weekStart,
  weeklySpecialSpend,
} from '../src/lib/budget';
import type { ExpenseCategory } from '../src/lib/types';

const e = (date: string, amount: number | string, category: ExpenseCategory, event_budget: number | null = null) => ({ date, amount, category, event_budget });
// Saturday 3 October 2026: the week of Sunday 27 September to Saturday 3 October.
const SAT_3_OCT = new Date(2026, 9, 3, 12);
// Tuesday 6 October 2026: the week of Sunday 4 to Saturday 10 October.
const TUE_6_OCT = new Date(2026, 9, 6, 12);

describe('budget pools', () => {
  it('defaults to GBP 60 standard and GBP 150 Sales Day / OOH budgets', () => {
    expect(DEFAULT_STANDARD_BUDGET_PENCE).toBe(6000);
    expect(DEFAULT_SPECIAL_BUDGET_PENCE).toBe(15000);
    expect(budgetsFor(null)).toEqual({ standard: 6000, special: 15000, session: 2500 });
  });

  it("reads each person's own budgets, including PostgREST strings", () => {
    expect(budgetsFor({ standard_budget: '80.00', sales_day_budget: 200 })).toEqual({ standard: 8000, special: 20000, session: 2500 });
    expect(budgetsFor({ standard_budget: 0, sales_day_budget: null })).toEqual({ standard: 0, special: 15000, session: 2500 });
    expect(budgetsFor({ standard_budget: 'abc', sales_day_budget: 9999 })).toEqual({ standard: 6000, special: 15000, session: 2500 });
  });

  it('validates typed budgets', () => {
    expect(parseBudget('150')).toBe(15000);
    expect(parseBudget('£1,200.50')).toBe(120050);
    expect(parseBudget('0')).toBe(0);
    expect(parseBudget('5000.01')).toBeNaN();
    expect(parseBudget('-5')).toBeNaN();
    expect(parseBudget('')).toBeNaN();
  });

  it('applies custom budgets to the pools', () => {
    const s = summariseBudget([e('2026-10-02', 50, 'standard'), e('2026-10-03', 120, 'ooh')], '2026-10', { standard: 10000, special: 15000, session: 12000 }, SAT_3_OCT);
    expect(s.standard.remaining).toBe(5000);
    expect(s.special.remaining).toBe(3000);
    expect(s.special.over).toBe(false);
  });

  it('routes only standard expenses to the standard pool', () => {
    expect(poolFor('standard')).toBe('standard');
    expect(poolFor('sales_day')).toBe('special');
    expect(poolFor('ooh')).toBe('special');
  });

  it('deducts standard from the monthly 60 and Sales Day + OOH from this week\'s shared 150', () => {
    const s = summariseBudget(
      [e('2026-10-02', 12.5, 'standard'), e('2026-10-05', '7.25', 'standard'), e('2026-10-06', 10, 'sales_day'), e('2026-10-08', '4.99', 'ooh'), e('2026-10-20', 30, 'ooh')],
      '2026-10',
      undefined,
      TUE_6_OCT,
    );
    expect(s.week).toBe('2026-10-04');
    expect(s.standard.spent).toBe(1975);
    expect(s.standard.remaining).toBe(4025);
    // Only the week of 4 October counts; the 20 October OOH is a later week.
    expect(s.special.spent).toBe(1499);
    expect(s.special.remaining).toBe(13501);
    expect(s.byCategory).toEqual({ standard: 1975, sales_day: 1000, ooh: 3499, town_takeover: 0 });
  });

  it('resets the Sales Day / OOH budget every Sunday', () => {
    const spend = [e('2026-10-03', 140, 'sales_day'), e('2026-10-04', 20, 'ooh')];
    // Saturday: 140 of 150 used.
    expect(summariseBudget(spend, '2026-10', undefined, SAT_3_OCT).special.remaining).toBe(1000);
    // Sunday: a fresh 150, minus only Sunday's 20.
    const sunday = summariseBudget(spend, '2026-10', undefined, new Date(2026, 9, 4, 9));
    expect(sunday.week).toBe('2026-10-04');
    expect(sunday.special.remaining).toBe(13000);
  });

  it('starts weeks on Sunday, including across month ends', () => {
    expect(weekStart(new Date(2026, 9, 4))).toBe('2026-10-04');
    expect(weekStart(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-04');
    expect(weekStart(new Date(2026, 9, 1))).toBe('2026-09-27');
  });

  it('shows a past month by its last week', () => {
    expect(summariseBudget([], '2026-09', undefined, TUE_6_OCT).week).toBe('2026-09-27');
  });

  it('lists every week of the month against the weekly budget', () => {
    const weeks = weeklySpecialSpend([e('2026-10-03', 160, 'ooh'), e('2026-10-06', 10, 'sales_day'), e('2026-10-06', 99, 'standard')], '2026-10');
    expect(weeks.map((w) => w.start)).toEqual(['2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25']);
    expect(weeks[0].status.over).toBe(true);
    expect(weeks[1].spent).toBe(1000);
    expect(weeks[2].spent).toBe(0);
  });

  it('never lets special expenses touch the standard pool', () => {
    const s = summariseBudget([e('2026-10-02', 100, 'sales_day'), e('2026-10-03', 75, 'ooh')], '2026-10', undefined, SAT_3_OCT);
    expect(s.standard.spent).toBe(0);
    expect(s.standard.remaining).toBe(6000);
    expect(s.special.remaining).toBe(-2500);
    expect(s.special.over).toBe(true);
    expect(s.special.remainingRatio).toBe(0);
  });

  it('avoids floating point drift', () => {
    const s = summariseBudget([e('2026-10-01', 0.1, 'standard'), e('2026-10-01', 0.2, 'standard')], '2026-10');
    expect(s.standard.spent).toBe(30);
    expect(formatPence(s.standard.remaining)).toBe('£59.70');
  });

  it('ignores other months and exactly-spent budgets are not over', () => {
    const s = summariseBudget([e('2026-09-30', 59, 'standard'), e('2026-10-01', 60, 'standard'), e('2026-11-01', 5, 'ooh')], '2026-10');
    expect(s.standard.spent).toBe(6000);
    expect(s.standard.remaining).toBe(0);
    expect(s.standard.over).toBe(false);
    expect(s.special.spent).toBe(0);
    expect(s.special.remainingRatio).toBe(1);
  });
});

describe('money parsing and formatting', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['£1,234.05', 123405],
    ['.99', 99],
    [7.1, 710],
  ])('toPence(%p) = %p', (input, out) => expect(toPence(input as string | number)).toBe(out));

  it.each(['', 'abc', '12.345', '-5', '1.2.3'])('rejects %p', (bad) => expect(toPence(bad)).toBeNaN());

  it('formats pence as pounds', () => {
    expect(formatPence(4025)).toBe('£40.25');
    expect(formatPence(-150)).toBe('-£1.50');
    expect(formatPence(123456)).toBe('£1,234.56');
    expect(formatPence(5)).toBe('£0.05');
  });
});

describe('mileage', () => {
  it('splits work and personal miles for the month', () => {
    const m = summariseMileage(
      [
        { date: '2026-10-01', miles: 42.5, type: 'work' },
        { date: '2026-10-02', miles: '0.1', type: 'work' },
        { date: '2026-10-02', miles: 0.2, type: 'work' },
        { date: '2026-10-03', miles: 10, type: 'personal' },
        { date: '2026-09-29', miles: 99, type: 'work' },
      ],
      '2026-10',
    );
    expect(m).toEqual({ work: 42.8, personal: 10, total: 52.8 });
  });

  it('parses mile inputs', () => {
    expect(parseMiles('42')).toBe(42);
    expect(parseMiles(' 42.5 ')).toBe(42.5);
    expect(parseMiles('0')).toBeNaN();
    expect(parseMiles('42.55')).toBeNaN();
    expect(parseMiles('2001')).toBeNaN();
    expect(parseMiles('abc')).toBeNaN();
  });
});

describe('dates', () => {
  it('uses local calendar dates, not UTC', () => {
    const lateEvening = new Date(2026, 9, 31, 23, 45);
    expect(localDateString(lateEvening)).toBe('2026-10-31');
    expect(monthKey(lateEvening)).toBe('2026-10');
  });
});

describe('Sales Day / OOH sessions and Town Takeovers', () => {
  const week = [e('2026-10-04', 25, 'ooh'), e('2026-10-05', 25, 'sales_day'), e('2026-10-05', 20, 'ooh')];

  it('counts sessions and how many full GBP 25 sessions are left this week', () => {
    const s = summariseBudget(week, '2026-10', undefined, TUE_6_OCT);
    expect(s.special.spent).toBe(7000);
    expect(s.sessions.used).toBe(3);
    // GBP 80 left of 150: three more GBP 25 sessions fit.
    expect(s.sessions.left).toBe(3);
    expect(s.sessions.allowance).toBe(2500);
  });

  it('allows several sessions on the same day', () => {
    expect(checkExpense({ category: 'ooh', amount: 2500, date: '2026-10-05' }, week)).toBeNull();
  });

  it('caps a single session at GBP 25', () => {
    expect(checkExpense({ category: 'sales_day', amount: 2600, date: '2026-10-06' }, [])).toMatch(/capped at £25.00/);
  });

  it('enforces the hard GBP 150 weekly cap and resets on Sunday', () => {
    const full = Array.from({ length: 6 }, () => e('2026-10-06', 25, 'ooh'));
    expect(checkExpense({ category: 'ooh', amount: 100, date: '2026-10-10' }, full)).toMatch(/used up/);
    expect(checkExpense({ category: 'ooh', amount: 2500, date: '2026-10-11' }, full)).toBeNull();
    const nearly = [...full.slice(0, 5), e('2026-10-06', 15, 'ooh')];
    expect(checkExpense({ category: 'sales_day', amount: 2500, date: '2026-10-07' }, nearly)).toMatch(/Only £10.00/);
    expect(summariseBudget(full, '2026-10', undefined, TUE_6_OCT).sessions.left).toBe(0);
  });

  it('lets Town Takeovers bypass the session and weekly caps', () => {
    const full = Array.from({ length: 6 }, () => e('2026-10-06', 25, 'ooh'));
    expect(checkExpense({ category: 'town_takeover', amount: 9000, date: '2026-10-06', eventBudget: 6000 }, full)).toBeNull();
    expect(checkExpense({ category: 'town_takeover', amount: 1000, date: '2026-10-06' }, [])).toMatch(/budget/);
  });

  it('keeps Town Takeovers out of the weekly pool and gives each day its own budget', () => {
    const s = summariseBudget(
      [...week, e('2026-10-08', 45, 'town_takeover', 60), e('2026-10-08', 20, 'town_takeover', 60), e('2026-10-15', 30, 'town_takeover', 40)],
      '2026-10',
      undefined,
      TUE_6_OCT,
    );
    expect(s.special.spent).toBe(7000);
    expect(s.takeover.days).toBe(2);
    expect(s.takeover.budget).toBe(10000);
    expect(s.takeover.spent).toBe(9500);
    expect(s.takeover.over).toBe(false);
    expect(s.byCategory.town_takeover).toBe(9500);
  });

  it('remembers a day budget already set for a takeover', () => {
    expect(takeoverBudgetFor('2026-10-08', [e('2026-10-08', 45, 'town_takeover', 60)])).toBe(6000);
    expect(takeoverBudgetFor('2026-10-09', [e('2026-10-08', 45, 'town_takeover', 60)])).toBeNull();
  });

  it('maps categories to the stored session_type', () => {
    expect(sessionTypeFor('standard')).toBe('Standard');
    expect(sessionTypeFor('ooh')).toBe('OOH_Session');
    expect(sessionTypeFor('sales_day')).toBe('OOH_Session');
    expect(sessionTypeFor('town_takeover')).toBe('Town_Takeover');
  });
});
