import { patchCoverage } from '../src/lib/coverage';
import { DEFAULT_FREQUENCIES, managersFor } from '../src/lib/frequency';
import type { RoutableStore } from '../src/lib/route-engine';
import { storesForPerson } from '../src/lib/store-selection';
import type { Grade, StoreOwner } from '../src/lib/types';

const store = (id: string, owner: StoreOwner, grade: Grade = 'B'): RoutableStore => ({
  id,
  name: id,
  address: `${id} High St`,
  grade,
  assigned_manager: owner,
  latitude: 51.6,
  longitude: -0.7,
  last_visit_date: null,
});

const all = [store('jo1', 'Joseph', 'A'), store('pete1', 'Pete'), store('marcia1', 'Marcia', 'D'), store('kishan1', 'Kishan'), store('david1', 'David', 'C')];
const tally = (count: number) => ({ count, last: null });
const patchOf = (profile: Parameters<typeof managersFor>[0]) => storesForPerson(all, managersFor(profile), [], []).patch;

describe('patchCoverage', () => {
  const tallies = { jo1: tally(4), pete1: tally(1), marcia1: tally(3), kishan1: tally(3) };

  it("counts Jo against Jo's stores only", () => {
    const c = patchCoverage(patchOf({ role: 'admin', route_managers: null }), tallies, DEFAULT_FREQUENCIES);
    expect(c).toMatchObject({ total: 1, completed: 1, remaining: 0, visitsOwed: 4, visitsDone: 4, ratio: 1, cleared: true });
  });

  it("counts Sarah against Jo, Pete and Marcia's stores, capping extra visits per store", () => {
    const c = patchCoverage(patchOf({ role: 'user', route_managers: null, manager_name: 'Sarah' }), tallies, DEFAULT_FREQUENCIES);
    // jo1 4/4, pete1 1/3, marcia1 1/1 (3 logged, 1 owed).
    expect(c).toMatchObject({ total: 3, completed: 2, remaining: 1, visitsOwed: 8, visitsDone: 6, cleared: false });
    expect(c.ratio).toBeCloseTo(2 / 3);
  });

  it("counts David against David's patch", () => {
    const c = patchCoverage(patchOf({ role: 'user', route_managers: null, manager_name: 'David' }), tallies, DEFAULT_FREQUENCIES);
    // kishan1 3/3, david1 0/2.
    expect(c).toMatchObject({ total: 2, completed: 1, remaining: 1, visitsOwed: 5, visitsDone: 3, cleared: false });
  });

  it('never clears an empty patch', () => {
    expect(patchCoverage([], {}, DEFAULT_FREQUENCIES)).toMatchObject({ total: 0, ratio: 0, cleared: false });
  });

  it('treats a store with no target as done', () => {
    const c = patchCoverage([store('d', 'Pete', 'D')], {}, { ...DEFAULT_FREQUENCIES, D: 0 });
    expect(c).toMatchObject({ completed: 1, cleared: true, visitsOwed: 0 });
  });
});
