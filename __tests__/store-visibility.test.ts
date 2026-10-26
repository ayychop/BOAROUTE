import { managersFor } from '../src/lib/frequency';
import type { RoutableStore } from '../src/lib/route-engine';
import { storesForPerson } from '../src/lib/store-selection';
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
