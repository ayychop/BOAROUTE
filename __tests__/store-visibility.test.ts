import { managersFor } from '../src/lib/frequency';
import type { RoutableStore } from '../src/lib/route-engine';
import { ownerTabs, storesForPerson } from '../src/lib/store-selection';
import type { StoreOwner } from '../src/lib/types';

const store = (id: string, owner: StoreOwner): RoutableStore => ({
  id,
  name: id,
  address: `${id} High St`,
  grade: 'B',
  assigned_manager: owner,
  latitude: 51.6,
  longitude: -0.7,
  last_visit_date: null,
});

const all = [store('jo1', 'Joseph'), store('pete1', 'Pete'), store('marcia1', 'Marcia'), store('marcia2', 'Marcia'), store('kishan1', 'Kishan'), store('old', 'Sarah')];
const sarah = managersFor({ role: 'user', route_managers: null, manager_name: 'Sarah' });
const ids = (list: RoutableStore[]) => list.map((s) => s.id);

describe('storesForPerson', () => {
  it("gives Sarah every Jo, Pete and Marcia store plus any still under her name", () => {
    const { patch, mine } = storesForPerson(all, sarah, [], []);
    expect(ids(patch)).toEqual(['jo1', 'pete1', 'marcia1', 'marcia2', 'old']);
    expect(mine).toEqual(patch);
  });

  it('adds a store handed to her from outside her patch, keeping its owner', () => {
    const { patch, mine } = storesForPerson(all, sarah, [], ['kishan1']);
    expect(ids(patch)).toContain('kishan1');
    expect(ids(mine)).toContain('kishan1');
    expect(mine.find((s) => s.id === 'kishan1')?.assigned_manager).toBe('Kishan');
  });

  it('keeps a handed store on her list even when she picked her own stores', () => {
    const { mine } = storesForPerson(all, sarah, ['jo1'], ['marcia2']);
    expect(ids(mine)).toEqual(['jo1', 'marcia2']);
  });

  it('ignores picks outside the patch', () => {
    const { mine } = storesForPerson(all, sarah, ['kishan1'], []);
    expect(ids(mine)).toEqual(ids(storesForPerson(all, sarah, [], []).patch));
  });

  it('shows nothing to a pending account, handed stores included', () => {
    const none = managersFor({ role: 'unassigned', route_managers: null });
    expect(storesForPerson(all, none, [], []).patch).toEqual([]);
  });
});

describe('ownerTabs', () => {
  const david = managersFor({ role: 'user', route_managers: null, manager_name: 'David' });
  const table = [
    ...all,
    store('jermaine1', 'Jermaine'),
    store('kishan2', 'Kishan'),
    store('raphael1', 'Raphael'),
    store('dave-old', 'David'),
  ];

  it('gives Sarah Jo, Pete and Marcia, without her legacy name', () => {
    const { patch } = storesForPerson(table, sarah, [], []);
    expect(ownerTabs(sarah, patch)).toEqual(['Joseph', 'Pete', 'Marcia']);
  });

  it('gives David Jermaine, Kishan and Raphael', () => {
    const { patch } = storesForPerson(table, david, [], []);
    expect(ownerTabs(david, patch)).toEqual(['Jermaine', 'Kishan', 'Raphael']);
  });

  it('keeps every tab when she routes only a few picked stores', () => {
    const { patch, mine } = storesForPerson(table, sarah, ['pete1'], []);
    expect(ids(mine)).toEqual(['pete1']);
    expect(ownerTabs(sarah, patch)).toEqual(['Joseph', 'Pete', 'Marcia']);
  });

  it('adds no tab for a store handed over from outside the patch', () => {
    const { patch } = storesForPerson(table, sarah, [], ['kishan1']);
    expect(ownerTabs(sarah, patch)).not.toContain('Kishan');
  });

  it('drops a manager with no stores in the table', () => {
    const { patch } = storesForPerson(table.filter((s) => s.assigned_manager !== 'Marcia'), sarah, [], []);
    expect(ownerTabs(sarah, patch)).toEqual(['Joseph', 'Pete']);
  });
});
