import { CATEGORY_LABEL, formatPence, inMonth, summariseBudget, summariseMileage, toPence } from './budget';
import type { Expense, MileageLog } from './types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-10-07" -> "07/10/2026" (UK expense-form format). */
export function ukDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const fmtMiles = (n: number) => `${n.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`;

/**
 * Plain-text end-of-month report, laid out to paste cleanly into expense forms,
 * emails or spreadsheets. Uses only plain ASCII separators.
 */
export function buildMonthlyReport(params: {
  month: string;
  name?: string | null;
  mileage: Pick<MileageLog, 'date' | 'miles' | 'type'>[];
  expenses: Pick<Expense, 'date' | 'amount' | 'location' | 'recipient' | 'category'>[];
}): string {
  const { month, name, mileage, expenses } = params;
  const miles = summariseMileage(mileage, month);
  const budget = summariseBudget(expenses, month);
  const rows = expenses
    .filter((e) => inMonth(e.date, month) && Number.isFinite(toPence(e.amount)))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = rows.reduce((a, e) => a + toPence(e.amount), 0);

  const lines: string[] = [];
  lines.push(`BOAROUTE MONTHLY REPORT: ${monthTitle(month).toUpperCase()}`);
  if (name) lines.push(`Name: ${name}`);
  lines.push('');
  lines.push('MILEAGE');
  lines.push(`Work miles: ${fmtMiles(miles.work)}`);
  lines.push(`Personal miles: ${fmtMiles(miles.personal)}`);
  lines.push(`Total miles: ${fmtMiles(miles.total)}`);
  lines.push('');
  lines.push(`EXPENSES (${rows.length})`);
  if (rows.length === 0) {
    lines.push('No expenses logged this month.');
  } else {
    lines.push('Date | Amount | Location | Recipient | Category');
    for (const e of rows) {
      lines.push(`${ukDate(e.date)} | ${formatPence(toPence(e.amount))} | ${e.location} | ${e.recipient} | ${CATEGORY_LABEL[e.category]}`);
    }
  }
  lines.push('');
  lines.push(`Total expenses: ${formatPence(total)}`);
  lines.push(
    `Standard budget: ${formatPence(budget.standard.spent)} of ${formatPence(budget.standard.budget)} used, ${budget.standard.over ? `over by ${formatPence(-budget.standard.remaining)}` : `${formatPence(budget.standard.remaining)} left`}`,
  );
  lines.push(
    `Sales Day / OOH budget: ${formatPence(budget.special.spent)} of ${formatPence(budget.special.budget)} used, ${budget.special.over ? `over by ${formatPence(-budget.special.remaining)}` : `${formatPence(budget.special.remaining)} left`}`,
  );
  return lines.join('\n');
}
