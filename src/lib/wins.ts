import { storeTarget } from './frequency';
import type { VisitTally } from './route-engine';
import type { GradeTargets, Store } from './types';

export const WIN_QUOTES = [
  'Job done. The work you put in today built the success of tomorrow.',
  'Consistency wins. Every visit counted, and you made them all.',
  'Target smashed. That is what showing up looks like.',
  'Another one in the bag. Your patch is better for it.',
  'Small visits, big results. Brilliant work.',
  'You said you would, and you did. Take the win.',
  'Momentum is yours. Keep that energy rolling.',
  'Done and dusted. The store team will feel the difference.',
  'Pride in the job shows. This one is complete.',
  'Every great month is built one visit at a time. This store is built.',
] as const;

export interface StoreSplit<S extends Store = Store> {
  /** Still owed visits this month, plus completed stores whose exit has not played yet. */
  active: S[];
  /** Completed stores waiting to play their exit animation. */
  exiting: Set<string>;
  /** Completed stores whose exit has played: shown in Your Wins. */
  wins: S[];
}

/** A store is a win when it has a target and this month's visits reach it. */
export function isWin(store: Store, tally: VisitTally | undefined, targets: GradeTargets): boolean {
  const target = storeTarget(store, targets);
  return target > 0 && (tally?.count ?? 0) >= target;
}

/**
 * Splits the grid. A store that has just hit its target stays in the active
 * grid (flagged as exiting) until its exit animation has been seen, then
 * moves to Your Wins. Order within each list follows the input.
 */
export function splitStores<S extends Store>(stores: S[], tallies: Record<string, VisitTally | undefined>, targets: GradeTargets, celebrated: ReadonlySet<string>): StoreSplit<S> {
  const active: S[] = [];
  const wins: S[] = [];
  const exiting = new Set<string>();
  for (const s of stores) {
    if (!isWin(s, tallies[s.id], targets)) active.push(s);
    else if (celebrated.has(s.id)) wins.push(s);
    else {
      active.push(s);
      exiting.add(s.id);
    }
  }
  return { active, exiting, wins };
}

/** A stable quote per store and month, so a win keeps its quote but the mix changes monthly. */
export function quoteFor(storeId: string, month: string): string {
  let h = 0;
  for (const ch of `${storeId}:${month}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return WIN_QUOTES[h % WIN_QUOTES.length];
}

/** Headline for the Your Wins section. */
export function winsHeadline(wins: number, total: number): string {
  if (wins === 0) return 'Your first win is one visit away.';
  if (wins === total) return `Every store complete. ${wins} of ${wins}, an outstanding month.`;
  const pct = Math.round((wins / total) * 100);
  return `${wins} of ${total} stores complete (${pct}%). Keep going.`;
}

/** Storage key for the stores whose exit already played this month. */
export function celebratedKey(month: string): string {
  return `wins.celebrated.${month}`;
}

export function parseCelebrated(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const v = JSON.parse(raw);
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}
