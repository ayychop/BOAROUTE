import { distinctOwners, patchOwners } from './frequency';
import type { RoutableStore } from './route-engine';
import type { Store, StoreOwner } from './types';

/**
 * Whose stores someone works. patch: every store under their managers plus
 * any store the admin handed them (pickers). mine: the stores they picked
 * from that patch (all of it when they picked none), always including the
 * handed stores, which they never have to pick.
 */
export function storesForPerson<S extends RoutableStore>(
  stores: readonly S[],
  managers: readonly StoreOwner[],
  chosen: readonly string[],
  assigned: readonly string[],
): { patch: S[]; mine: S[] } {
  const handed = new Set(assigned);
  const patch = stores.filter((s) => managers.includes(s.assigned_manager) || handed.has(s.id));
  // Picks never reach outside the patch, even if a store was reassigned since.
  const picked = new Set(chosen);
  const mine = patch.some((s) => picked.has(s.id)) ? patch.filter((s) => picked.has(s.id) || handed.has(s.id)) : patch;
  return { patch, mine };
}

/**
 * Owner filter tabs on the Stores screen: the managers in this person's patch
 * (from their role and team seat) that own at least one store in the stores
 * table, in the usual order. Built from the whole patch, not just the stores
 * they picked, so Sarah always gets Jo, Pete and Marcia and David gets
 * Jermaine, Kishan and Raphael. Legacy owner names (stores still under Sarah or
 * David) and stores handed over from outside the patch stay under "All".
 */
export function ownerTabs(managers: readonly StoreOwner[], patch: readonly { assigned_manager: string | null }[]): StoreOwner[] {
  const inTable = new Set(distinctOwners([...patch]).map((o) => o.owner));
  return patchOwners(managers).filter((m) => inTable.has(m));
}

/** Jo (the admin) starts with every Joseph store ticked; everyone else picks from scratch. */
export function defaultSelection(stores: readonly Store[], isAdmin: boolean): string[] {
  return isAdmin ? stores.filter((s) => s.assigned_manager === 'Joseph').map((s) => s.id) : [];
}

export function filterStores(stores: readonly Store[], query: string, manager: StoreOwner | null): Store[] {
  const q = query.trim().toLowerCase();
  return stores.filter(
    (s) => (!manager || s.assigned_manager === manager) && (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)),
  );
}

/** Ticks every given store, or unticks them all when they are already all ticked. */
export function toggleGroup(selected: readonly string[], group: readonly Store[]): string[] {
  const set = new Set(selected);
  const allOn = group.length > 0 && group.every((s) => set.has(s.id));
  for (const s of group) {
    if (allOn) set.delete(s.id);
    else set.add(s.id);
  }
  return [...set];
}
