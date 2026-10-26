import { storeTarget } from './frequency';
import type { RoutableStore, VisitTally } from './route-engine';
import type { GradeTargets } from './types';

export interface PatchCoverage {
  /** Stores in the patch. */
  total: number;
  /** Stores that hit their monthly target (a store with no target counts as done). */
  completed: number;
  remaining: number;
  /** Visits owed across the patch this month, and how many of those are done (capped per store). */
  visitsOwed: number;
  visitsDone: number;
  /** 0..1 share of the patch's stores completed. */
  ratio: number;
  /** Every store on target, and there is at least one store. */
  cleared: boolean;
}

/** Month-to-date coverage of someone's patch: whole stores on target, plus visits owed vs done. */
export function patchCoverage(
  stores: readonly RoutableStore[],
  tallies: Record<string, VisitTally | undefined>,
  targets: GradeTargets,
): PatchCoverage {
  let completed = 0;
  let visitsOwed = 0;
  let visitsDone = 0;
  for (const s of stores) {
    const target = storeTarget(s, targets);
    const done = Math.min(target, tallies[s.id]?.count ?? 0);
    visitsOwed += target;
    visitsDone += done;
    if (done >= target) completed++;
  }
  const total = stores.length;
  return {
    total,
    completed,
    remaining: total - completed,
    visitsOwed,
    visitsDone,
    ratio: total ? completed / total : 0,
    cleared: total > 0 && completed === total,
  };
}
