import type { Store, StoreOwner } from './types';

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
