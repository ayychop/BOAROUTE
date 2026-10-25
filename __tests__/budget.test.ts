import {
  STANDARD_BUDGET_PENCE,
  SPECIAL_BUDGET_PENCE,
  formatPence,
  localDateString,
  monthKey,
  parseMiles,
  poolFor,
  summariseBudget,
  summariseMileage,
  toPence,
} from '../src/lib/budget';
import type { ExpenseCategory } from '../src/lib/types';

const e = (date: string, amount: number | string, category: ExpenseCategory) => ({ date, amount, category });

describe('budget pools', () => {
  it('uses GBP 60 standard and GBP 25 Sales Day / OOH budgets', () => {
    expect(STANDARD_BUDGET_PENCE).toBe(6000);
    expect(SPECIAL_BUDGET_PENCE).toBe(2500);
  });

  it('routes only standard expenses to the GBP 60 pool', () => {
    expect(poolFor('standard')).toBe('standard');
    expect(poolFor('sales_day')).toBe('special');
    expect(poolFor('ooh')).toBe('special');
  });

  it('deducts standard from 60 and Sales Day + OOH from the shared 25', () => {
    const s = summariseBudget(
      [e('2026-10-02', 12.5, 'standard'), e('2026-10-05', '7.25', 'standard'), e('2026-10-06', 10, 'sales_day'), e('2026-10-20', '4.99', 'ooh')],
      '2026-10',
    );
    expect(s.standard.spent).toBe(1975);
    expect(s.standard.remaining).toBe(4025);
    expect(s.special.spent).toBe(1499);
    expect(s.special.remaining).toBe(1001);
    expect(s.byCategory).toEqual({ standard: 1975, sales_day: 1000, ooh: 499 });
  });

  it('never lets special expenses touch the standard pool', () => {
    const s = summariseBudget([e('2026-10-02', 25, 'sales_day'), e('2026-10-03', 25, 'ooh')], '2026-10');
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
