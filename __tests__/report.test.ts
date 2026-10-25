import { buildMonthlyReport, monthTitle, ukDate } from '../src/lib/report';

describe('monthly report', () => {
  const report = buildMonthlyReport({
    month: '2026-10',
    name: 'Sarah',
    mileage: [
      { date: '2026-10-03', miles: 120.5, type: 'work' },
      { date: '2026-10-04', miles: '15', type: 'personal' },
      { date: '2026-09-04', miles: 500, type: 'work' },
    ],
    expenses: [
      { date: '2026-10-09', amount: '8.99', location: 'Oxford Westgate', recipient: 'Pret', category: 'sales_day' },
      { date: '2026-10-02', amount: 12.5, location: 'Reading', recipient: 'Costa', category: 'standard' },
      { date: '2026-11-01', amount: 99, location: 'Nope', recipient: 'Nope', category: 'standard' },
    ],
  });

  it('includes work vs personal mileage', () => {
    expect(report).toContain('Work miles: 120.5 mi');
    expect(report).toContain('Personal miles: 15.0 mi');
    expect(report).toContain('Total miles: 135.5 mi');
  });

  it('lists every expense of the month in date order', () => {
    const costa = report.indexOf('02/10/2026 | £12.50 | Reading | Costa | Standard');
    const pret = report.indexOf('09/10/2026 | £8.99 | Oxford Westgate | Pret | Sales Day');
    expect(costa).toBeGreaterThan(-1);
    expect(pret).toBeGreaterThan(costa);
    expect(report).not.toContain('Nope');
    expect(report).toContain('Total expenses: £21.49');
  });

  it('reports both budgets', () => {
    expect(report).toContain('Standard budget: £12.50 of £60.00 used, £47.50 left');
    expect(report).toContain('Sales Day / OOH budget: £25.00 per session, £150.00 weekly cap, resets every Sunday');
    // The Sales Day on Friday 9 October falls in the week of Sunday 4 October.
    expect(report).toContain('Week of 04/10/2026: £8.99 used, £141.01 left');
    expect(report).toContain('Week of 11/10/2026: £0.00 used, £150.00 left');
  });

  it('has a header and no em or en dashes', () => {
    expect(report.startsWith('BOAROUTE MONTHLY REPORT: OCTOBER 2026')).toBe(true);
    expect(report).toContain('Name: Sarah');
    expect(report).not.toMatch(/[\u2013\u2014]/);
  });

  it('handles an empty month and overspend', () => {
    const empty = buildMonthlyReport({ month: '2026-02', mileage: [], expenses: [] });
    expect(empty).toContain('No expenses logged this month.');
    const over = buildMonthlyReport({
      month: '2026-02',
      mileage: [],
      expenses: [{ date: '2026-02-01', amount: 155, location: 'A', recipient: 'B', category: 'ooh' }],
    });
    expect(over).toContain('over by £5.00');
  });

  it("uses the person's own budgets when given", () => {
    const custom = buildMonthlyReport({
      month: '2026-02',
      mileage: [],
      expenses: [{ date: '2026-02-01', amount: 30, location: 'A', recipient: 'B', category: 'standard' }],
      budgets: { standard: 10000, special: 20000, session: 2500 },
    });
    expect(custom).toContain('Standard budget: £30.00 of £100.00 used, £70.00 left');
    expect(custom).toContain('Sales Day / OOH budget: £25.00 per session, £200.00 weekly cap, resets every Sunday');
    expect(custom).toContain('Week of 01/02/2026: £0.00 used, £200.00 left');
  });

  it('formats helpers', () => {
    expect(ukDate('2026-01-07')).toBe('07/01/2026');
    expect(monthTitle('2026-12')).toBe('December 2026');
  });
});
