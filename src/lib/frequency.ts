import type { Grade, GradeTargets, Manager, Profile, Store } from './types';

export const GRADES: Grade[] = ['A', 'B', 'C', 'D'];
export const MANAGERS: Manager[] = ['Joseph', 'Pete', 'David', 'Marcia', 'Sarah'];

/** Default required monthly visits per grade (Jo's standard). */
export const DEFAULT_FREQUENCIES: Readonly<GradeTargets> = Object.freeze({ A: 4, B: 3, C: 2, D: 1 });

export const MAX_MONTHLY_TARGET = 12;

/**
 * Everyone starts on the defaults (A 4, B 3, C 2, D 1). Any user, including
 * the admin, can override a grade from Route Settings; NULL means "default".
 */
export function targetsFor(profile: Pick<Profile, 'freq_a' | 'freq_b' | 'freq_c' | 'freq_d'> | null): GradeTargets {
  if (!profile) return { ...DEFAULT_FREQUENCIES };
  const pick = (v: number | null | undefined, g: Grade) =>
    v === null || v === undefined || !Number.isFinite(v) ? DEFAULT_FREQUENCIES[g] : Math.max(0, Math.min(MAX_MONTHLY_TARGET, Math.round(v)));
  return {
    A: pick(profile.freq_a, 'A'),
    B: pick(profile.freq_b, 'B'),
    C: pick(profile.freq_c, 'C'),
    D: pick(profile.freq_d, 'D'),
  };
}

/**
 * Monthly visits needed for one store: its own frequency when someone set it
 * on the store, otherwise this person's target for the store's grade.
 */
export function storeTarget(store: Pick<Store, 'grade'> & Partial<Pick<Store, 'required_frequency' | 'frequency_custom'>>, targets: GradeTargets): number {
  if (store.frequency_custom && Number.isFinite(store.required_frequency)) {
    return Math.max(0, Math.min(MAX_MONTHLY_TARGET, Math.round(store.required_frequency as number)));
  }
  return targets[store.grade] ?? 0;
}

/** Visits still to do this month, never negative. */
export function visitsRemaining(done: number, target: number): number {
  return Math.max(0, target - done);
}

/** Encouragement after logging a visit: "2 more to go!", "Last one to go!", "Target hit!". */
export function remainingMessage(done: number, target: number): string {
  const left = visitsRemaining(done, target);
  if (target <= 0) return 'Visit logged. No target this month.';
  if (left === 0) return done > target ? `Target hit! ${done} of ${target}, above and beyond.` : 'Target hit! Store complete this month.';
  if (left === 1) return 'Last one to go!';
  return `${left} more to go!`;
}

export function usesDefaultTargets(profile: Pick<Profile, 'freq_a' | 'freq_b' | 'freq_c' | 'freq_d'> | null): boolean {
  return !profile || [profile.freq_a, profile.freq_b, profile.freq_c, profile.freq_d].every((v) => v === null || v === undefined);
}

/** Sarah's patch. */
export const TEAM_PATCH: Manager[] = ['Sarah', 'Joseph', 'Pete', 'Marcia'];

/** Approved team members only; pending and denied accounts never get in. */
export function isMember(profile: Pick<Profile, 'role'> | null | undefined): boolean {
  return profile?.role === 'admin' || profile?.role === 'user';
}

/**
 * Default patch for a manager, mirroring public.team_patch in the database:
 * Sarah works Sarah, Jo, Pete and Marcia; everyone else their own stores.
 */
export function defaultPatchFor(manager: string | null | undefined): Manager[] {
  if (manager === 'Sarah') return [...TEAM_PATCH];
  return MANAGERS.includes(manager as Manager) ? [manager as Manager] : [];
}

/**
 * Whose stores appear on this person's Home, Route and Stores tabs. Everything
 * comes from the database (team_members, by email), never from the name typed
 * at signup. The admin's daily patch is strictly Jo's stores; Jo sees the rest
 * only in Admin > Store Management. Pending or denied accounts get nothing.
 */
export function managersFor(profile: (Pick<Profile, 'role' | 'route_managers'> & Partial<Pick<Profile, 'manager_name'>>) | null): Manager[] {
  if (!profile || !isMember(profile)) return [];
  if (profile.role === 'admin') return ['Joseph'];
  const valid = (profile.route_managers ?? []).filter((m): m is Manager => MANAGERS.includes(m as Manager));
  return valid.length ? valid : defaultPatchFor(profile.manager_name);
}

export function managerLabel(manager: Manager): string {
  return manager === 'Joseph' ? "Jo's Store" : `${manager}'s Store`;
}

export function managerShort(manager: Manager): string {
  return manager === 'Joseph' ? 'Jo' : manager;
}
