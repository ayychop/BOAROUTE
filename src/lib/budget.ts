import type { Expense, ExpenseCategory, MileageLog, Profile, SessionType } from './types';

/** All money maths runs in integer pence so totals never drift. */
export const DEFAULT_STANDARD_BUDGET_PENCE = 6000; // GBP 60 per month
export const DEFAULT_SPECIAL_BUDGET_PENCE = 15000; // GBP 150 hard weekly cap (resets every Sunday) for Sales Day / OOH sessions
export const DEFAULT_SESSION_PENCE = 2500; // GBP 25 per Sales Day / OOH session
export const DEFAULT_TAKEOVER_DAY_PENCE = 6000; // suggested GBP 60 Town Takeover day budget
/** Matches the CHECK constraint on profiles.standard_budget and profiles.sales_day_budget. */
export const MAX_BUDGET_PENCE = 500000; // GBP 5,000

export interface Budgets {
  /** Monthly standard budget in pence. */
  standard: number;
  /** Hard weekly cap for Sales Day / OOH sessions in pence. Resets every Sunday. */
  special: number;
  /** Most a single Sales Day / OOH session may cost, in pence. */
  session: number;
}

export const DEFAULT_BUDGETS: Budgets = { standard: DEFAULT_STANDARD_BUDGET_PENCE, special: DEFAULT_SPECIAL_BUDGET_PENCE, session: DEFAULT_SESSION_PENCE };

/** A person's own budgets, falling back to the defaults for anything missing or invalid. */
export function budgetsFor(profile: (Pick<Profile, 'standard_budget' | 'sales_day_budget'> & Partial<Pick<Profile, 'ooh_session_allowance'>>) | null | undefined): Budgets {
  const read = (v: number | string | null | undefined, fallback: number) => {
    if (v === null || v === undefined || v === '') return fallback;
    const p = toPence(v);
    return Number.isFinite(p) && p >= 0 && p <= MAX_BUDGET_PENCE ? p : fallback;
  };
  return {
    standard: read(profile?.standard_budget, DEFAULT_STANDARD_BUDGET_PENCE),
    special: read(profile?.sales_day_budget, DEFAULT_SPECIAL_BUDGET_PENCE),
    session: read(profile?.ooh_session_allowance, DEFAULT_SESSION_PENCE),
  };
}

/** Validates a budget typed by the user ("150", "£1,200.50"). Returns pence or NaN. */
export function parseBudget(input: string): number {
  const p = toPence(input);
  return Number.isFinite(p) && p >= 0 && p <= MAX_BUDGET_PENCE ? p : NaN;
}

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  standard: 'Standard',
  sales_day: 'Sales Day',
  ooh: 'OOH',
  town_takeover: 'Town Takeover',
};

export type BudgetPool = 'standard' | 'special' | 'takeover';

export function poolFor(category: ExpenseCategory): BudgetPool {
  return category === 'standard' ? 'standard' : category === 'town_takeover' ? 'takeover' : 'special';
}

/** Sales Day and OOH expenses are £25 sessions under the weekly cap. */
export function isSession(category: ExpenseCategory): boolean {
  return category === 'sales_day' || category === 'ooh';
}

/** session_type as stored in the database. */
export function sessionTypeFor(category: ExpenseCategory): SessionType {
  return category === 'standard' ? 'Standard' : category === 'town_takeover' ? 'Town_Takeover' : 'OOH_Session';
}

/** The session's own date when set, otherwise the expense date. */
function dayOf(e: Pick<Expense, 'date'> & Partial<Pick<Expense, 'session_date'>>): string {
  return (e.session_date || e.date).slice(0, 10);
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

/** Sunday (local) that starts the week containing d, as YYYY-MM-DD. The Sales Day / OOH budget resets then. */
export function weekStart(d: Date): string {
  return localDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()));
}

/** YYYY-MM-DD plus n days, in local calendar terms. */
export function addDays(isoDate: string, n: number): string {
  const [y, m, day] = isoDate.split('-').map(Number);
  return localDateString(new Date(y, m - 1, day + n));
}

/** True when isoDate (YYYY-MM-DD) falls in the Sunday-to-Saturday week starting at start. */
export function inWeek(isoDate: string, start: string): boolean {
  const d = isoDate.slice(0, 10);
  return d >= start && d < addDays(start, 7);
}

/**
 * Which week the Sales Day / OOH ring shows for a month: the current week when
 * looking at this month, otherwise the month's last week.
 */
export function budgetWeekFor(month: string, today: Date = new Date()): string {
  if (monthKey(today) === month) return weekStart(today);
  const [y, m] = month.split('-').map(Number);
  return weekStart(new Date(y, m, 0));
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
  /** Sunday starting the week the special pool covers. */
  week: string;
  standard: PoolStatus;
  /** Sales Day / OOH sessions this week against the hard weekly cap. */
  special: PoolStatus;
  sessions: {
    /** Sessions logged this week. */
    used: number;
    /** Full-price sessions still affordable before the weekly cap. */
    left: number;
    /** Per-session allowance in pence. */
    allowance: number;
  };
  /** Town Takeovers this month: each day has its own budget; no caps apply. */
  takeover: PoolStatus & { days: number };
  byCategory: Record<ExpenseCategory, number>;
}

type BudgetExpense = Pick<Expense, 'date' | 'amount' | 'category'> & Partial<Pick<Expense, 'session_date' | 'event_budget'>>;

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

/**
 * Standard is a monthly budget. Sales Day and OOH share a weekly budget that
 * resets every Sunday, so the special pool only counts that week's spend.
 * byCategory stays monthly for the report.
 */
export function summariseBudget(expenses: BudgetExpense[], month: string, budgets: Budgets = DEFAULT_BUDGETS, today: Date = new Date()): BudgetSummary {
  const week = budgetWeekFor(month, today);
  const byCategory: Record<ExpenseCategory, number> = { standard: 0, sales_day: 0, ooh: 0, town_takeover: 0 };
  let specialThisWeek = 0;
  let sessionsThisWeek = 0;
  const takeoverDays = new Map<string, number>();
  for (const e of expenses) {
    const p = toPence(e.amount);
    if (!Number.isFinite(p)) continue;
    const day = dayOf(e);
    if (isSession(e.category) && inWeek(day, week)) {
      specialThisWeek += p;
      sessionsThisWeek++;
    }
    if (!inMonth(day, month)) continue;
    if (e.category in byCategory) byCategory[e.category] += p;
    if (e.category === 'town_takeover') {
      // A day's budget is the largest one set on any of that day's takeover expenses.
      const b = e.event_budget === null || e.event_budget === undefined ? 0 : toPence(e.event_budget);
      takeoverDays.set(day, Math.max(takeoverDays.get(day) ?? 0, Number.isFinite(b) ? b : 0));
    }
  }
  const special = pool(budgets.special, specialThisWeek);
  const takeoverBudget = [...takeoverDays.values()].reduce((a, b) => a + b, 0);
  return {
    month,
    week,
    standard: pool(budgets.standard, byCategory.standard),
    special,
    sessions: {
      used: sessionsThisWeek,
      left: budgets.session > 0 ? Math.floor(Math.max(0, special.remaining) / budgets.session) : 0,
      allowance: budgets.session,
    },
    takeover: { ...pool(takeoverBudget, byCategory.town_takeover), days: takeoverDays.size },
    byCategory,
  };
}

export interface NewExpense {
  category: ExpenseCategory;
  /** Pence. */
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  /** Town Takeover day budget in pence. */
  eventBudget?: number | null;
}

/**
 * Budget rules for a new expense. Returns a message when it breaks one:
 * a Sales Day / OOH session is at most the session allowance (GBP 25) and the
 * week (Sunday to Saturday) can never pass the hard cap (GBP 150). Town
 * Takeovers skip both but need a day budget. Standard is never blocked.
 */
export function checkExpense(next: NewExpense, expenses: BudgetExpense[], budgets: Budgets = DEFAULT_BUDGETS): string | null {
  if (isSession(next.category)) {
    if (next.amount > budgets.session) return `A ${CATEGORY_LABEL[next.category]} session is capped at ${formatPence(budgets.session)}. Log a second session for anything more.`;
    const week = weekStart(parseLocalDate(next.date));
    let spent = 0;
    for (const e of expenses) {
      if (!isSession(e.category) || !inWeek(dayOf(e), week)) continue;
      const p = toPence(e.amount);
      if (Number.isFinite(p)) spent += p;
    }
    if (spent + next.amount > budgets.special) {
      const left = Math.max(0, budgets.special - spent);
      return left === 0
        ? `This week's ${formatPence(budgets.special)} Sales Day / OOH cap is used up. It resets on Sunday.`
        : `Only ${formatPence(left)} of this week's ${formatPence(budgets.special)} Sales Day / OOH cap is left. It resets on Sunday.`;
    }
  }
  if (next.category === 'town_takeover') {
    const b = next.eventBudget;
    if (b === null || b === undefined || !Number.isFinite(b) || b <= 0 || b > MAX_BUDGET_PENCE) return 'Set a budget for this Town Takeover day, like 60.';
  }
  return null;
}

/** The day budget already set for a Town Takeover on this date, if any. */
export function takeoverBudgetFor(date: string, expenses: BudgetExpense[]): number | null {
  let best: number | null = null;
  for (const e of expenses) {
    if (e.category !== 'town_takeover' || dayOf(e) !== date || e.event_budget === null || e.event_budget === undefined) continue;
    const b = toPence(e.event_budget);
    if (Number.isFinite(b)) best = Math.max(best ?? 0, b);
  }
  return best;
}

function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface WeekSpend {
  /** Sunday starting the week. */
  start: string;
  spent: number;
  status: PoolStatus;
}

/** Every Sunday-to-Saturday week touching the month, with its Sales Day / OOH spend against the weekly budget. */
export function weeklySpecialSpend(expenses: BudgetExpense[], month: string, budgets: Budgets = DEFAULT_BUDGETS): WeekSpend[] {
  const [y, m] = month.split('-').map(Number);
  const last = localDateString(new Date(y, m, 0));
  const weeks: WeekSpend[] = [];
  for (let start = weekStart(new Date(y, m - 1, 1)); start <= last; start = addDays(start, 7)) {
    let spent = 0;
    for (const e of expenses) {
      if (!isSession(e.category) || !inWeek(dayOf(e), start)) continue;
      const p = toPence(e.amount);
      if (Number.isFinite(p)) spent += p;
    }
    weeks.push({ start, spent, status: pool(budgets.special, spent) });
  }
  return weeks;
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
