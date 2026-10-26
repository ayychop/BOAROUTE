import { CATEGORY_LABEL, formatPence, inMonth, summariseBudget, summariseMileage, toPence, type Budgets, weeklySpecialSpend } from './budget';
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

/** "Standard - Parking", or just "Standard" when no label was added. */
export function expenseLabel(e: Pick<Expense, 'category'> & Partial<Pick<Expense, 'custom_label'>>): string {
  const label = e.custom_label?.trim();
  return label ? `${CATEGORY_LABEL[e.category]} - ${label}` : CATEGORY_LABEL[e.category];
}

/**
 * Plain-text end-of-month report, laid out to paste cleanly into expense forms,
 * emails or spreadsheets. Uses only plain ASCII separators.
 */
export function buildMonthlyReport(params: {
  month: string;
  name?: string | null;
  mileage: Pick<MileageLog, 'date' | 'miles' | 'type'>[];
  expenses: (Pick<Expense, 'date' | 'amount' | 'location' | 'recipient' | 'category'> & Partial<Pick<Expense, 'custom_label'>>)[];
  /** The person's own budgets; defaults (GBP 60 / GBP 150) when omitted. */
  budgets?: Budgets;
}): string {
  const { month, name, mileage, expenses, budgets } = params;
  const miles = summariseMileage(mileage, month);
  const budget = summariseBudget(expenses, month, budgets);
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
    lines.push('Date | Category: Amount | Location | Recipient');
    for (const e of rows) {
      lines.push(`${ukDate(e.date)} | ${expenseLabel(e)}: ${formatPence(toPence(e.amount))} | ${e.location} | ${e.recipient}`);
    }
  }
  lines.push('');
  lines.push(`Total expenses: ${formatPence(total)}`);
  lines.push(
    `Standard budget: ${formatPence(budget.standard.spent)} of ${formatPence(budget.standard.budget)} used, ${budget.standard.over ? `over by ${formatPence(-budget.standard.remaining)}` : `${formatPence(budget.standard.remaining)} left`}`,
  );
  lines.push(`Sales Day / OOH budget: ${formatPence(budget.sessions.allowance)} per session, ${formatPence(budget.special.budget)} weekly cap, resets every Sunday`);
  for (const w of weeklySpecialSpend(expenses, month, budgets)) {
    lines.push(
      `  Week of ${ukDate(w.start)}: ${formatPence(w.spent)} used, ${w.status.over ? `over by ${formatPence(-w.status.remaining)}` : `${formatPence(w.status.remaining)} left`}`,
    );
  }
  if (budget.takeover.days > 0) {
    lines.push(
      `Town Takeovers: ${formatPence(budget.takeover.spent)} of ${formatPence(budget.takeover.budget)} across ${budget.takeover.days} day${budget.takeover.days === 1 ? '' : 's'}, ${budget.takeover.over ? `over by ${formatPence(-budget.takeover.remaining)}` : `${formatPence(budget.takeover.remaining)} left`}`,
    );
  }
  return lines.join('\n');
}
