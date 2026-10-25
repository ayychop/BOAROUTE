import type { Expense, ExpenseCategory, MileageLog } from './types';

/** All money maths runs in integer pence so totals never drift. */
export const STANDARD_BUDGET_PENCE = 6000; // GBP 60 per month
export const SPECIAL_BUDGET_PENCE = 2500; // GBP 25 per month, shared by Sales Day and OOH

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  standard: 'Standard',
  sales_day: 'Sales Day',
  ooh: 'OOH',
};

export type BudgetPool = 'standard' | 'special';

export function poolFor(category: ExpenseCategory): BudgetPool {
  return category === 'standard' ? 'standard' : 'special';
}

/** Parses "12.5", "12.50", 12.5 or "£12.50" into pence. Returns NaN when invalid. */
export function toPence(value: number | string): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) : NaN;
  const cleaned = value.replace(/[£,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$|^\.\d{1,2}$/.test(cleaned)) return NaN;
  const [whole, frac = ''] = cleaned.split('.');
  return Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
}

export function formatPence(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(Math.round(pence));
  return `${sign}£${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
}

/** "YYYY-MM" for a Date in local time. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function inMonth(isoDate: string, key: string): boolean {
  return isoDate.slice(0, 7) === key;
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening entries stay on the right day). */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface PoolStatus {
  budget: number;
  spent: number;
  /** Can go negative when overspent. */
  remaining: number;
  /** 0..1 share of the budget still available (clamped). */
  remainingRatio: number;
  over: boolean;
}

export interface BudgetSummary {
  month: string;
  standard: PoolStatus;
  special: PoolStatus;
  byCategory: Record<ExpenseCategory, number>;
}

function pool(budget: number, spent: number): PoolStatus {
  const remaining = budget - spent;
  return {
    budget,
    spent,
    remaining,
    remainingRatio: budget > 0 ? Math.max(0, Math.min(1, remaining / budget)) : 0,
    over: remaining < 0,
  };
}

export function summariseBudget(expenses: Pick<Expense, 'date' | 'amount' | 'category'>[], month: string): BudgetSummary {
  const byCategory: Record<ExpenseCategory, number> = { standard: 0, sales_day: 0, ooh: 0 };
  for (const e of expenses) {
    if (!inMonth(e.date, month)) continue;
    const p = toPence(e.amount);
    if (!Number.isFinite(p)) continue;
    byCategory[e.category] += p;
  }
  return {
    month,
    standard: pool(STANDARD_BUDGET_PENCE, byCategory.standard),
    special: pool(SPECIAL_BUDGET_PENCE, byCategory.sales_day + byCategory.ooh),
    byCategory,
  };
}

export interface MileageSummary {
  work: number;
  personal: number;
  total: number;
}

/** Mileage in tenths internally to avoid float error, returned in miles. */
export function summariseMileage(logs: Pick<MileageLog, 'date' | 'miles' | 'type'>[], month: string): MileageSummary {
  let work = 0;
  let personal = 0;
  for (const l of logs) {
    if (!inMonth(l.date, month)) continue;
    const tenths = Math.round(Number(l.miles) * 10);
    if (!Number.isFinite(tenths)) continue;
    if (l.type === 'work') work += tenths;
    else personal += tenths;
  }
  return { work: work / 10, personal: personal / 10, total: (work + personal) / 10 };
}

/** Parses a miles input like "42" or "42.5"; NaN when invalid. */
export function parseMiles(input: string): number {
  const t = input.trim();
  if (!/^\d+(\.\d)?$|^\.\d$/.test(t)) return NaN;
  const v = Number(t);
  return v > 0 && v <= 2000 ? v : NaN;
}
