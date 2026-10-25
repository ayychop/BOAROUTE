import type { Grade, GradeTargets, Manager, Profile, Role } from './types';

export const GRADES: Grade[] = ['A', 'B', 'C', 'D'];
export const MANAGERS: Manager[] = ['Joseph', 'Pete', 'David', 'Marcia'];

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

export function usesDefaultTargets(profile: Pick<Profile, 'freq_a' | 'freq_b' | 'freq_c' | 'freq_d'> | null): boolean {
  return !profile || [profile.freq_a, profile.freq_b, profile.freq_c, profile.freq_d].every((v) => v === null || v === undefined);
}

/** Fallback route scope when a profile has none: admin (Jo) Joseph only; users (Sarah) Joseph and Pete. */
export function defaultManagersFor(role: Role): Manager[] {
  return role === 'admin' ? ['Joseph'] : ['Joseph', 'Pete'];
}

/** Whose stores this person routes. Set per profile by the admin (David routes David's, Marcia routes Marcia's). */
export function managersFor(profile: Pick<Profile, 'role' | 'route_managers'> | null): Manager[] {
  if (!profile) return [];
  const valid = (profile.route_managers ?? []).filter((m): m is Manager => MANAGERS.includes(m as Manager));
  return valid.length ? valid : defaultManagersFor(profile.role);
}

export function managerLabel(manager: Manager): string {
  return manager === 'Joseph' ? "Jo's Store" : `${manager}'s Store`;
}

export function managerShort(manager: Manager): string {
  return manager === 'Joseph' ? 'Jo' : manager;
}
