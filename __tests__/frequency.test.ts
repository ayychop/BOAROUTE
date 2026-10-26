import { DEFAULT_FREQUENCIES, MANAGERS, TEAM_SEATS, defaultPatchFor, isLegacyOwner, isMember, managerLabel, managersFor, patchOwners, targetsFor, usesDefaultTargets } from '../src/lib/frequency';

const freqs = (f: Partial<Record<'freq_a' | 'freq_b' | 'freq_c' | 'freq_d', number | null>> = {}) => ({
  freq_a: null,
  freq_b: null,
  freq_c: null,
  freq_d: null,
  ...f,
});

describe('frequencies', () => {
  it('defaults to A4 B3 C2 D1', () => {
    expect(DEFAULT_FREQUENCIES).toEqual({ A: 4, B: 3, C: 2, D: 1 });
    expect(targetsFor(freqs())).toEqual({ A: 4, B: 3, C: 2, D: 1 });
    expect(targetsFor(null)).toEqual(DEFAULT_FREQUENCIES);
    expect(usesDefaultTargets(freqs())).toBe(true);
  });

  it('lets anyone (OMs and Jo) override individual grades', () => {
    expect(targetsFor(freqs({ freq_a: 6, freq_c: 0 }))).toEqual({ A: 6, B: 3, C: 0, D: 1 });
    expect(usesDefaultTargets(freqs({ freq_a: 6 }))).toBe(false);
  });

  it('clamps out-of-range targets', () => {
    expect(targetsFor(freqs({ freq_b: 99, freq_d: -3 }))).toEqual({ A: 4, B: 12, C: 2, D: 0 });
  });
});

describe('route scope', () => {
  it('comes from the database role and manager, never the typed name', () => {
    expect(managersFor({ role: 'admin', route_managers: null })).toEqual(['Joseph']);
    expect(managersFor({ role: 'user', route_managers: [], manager_name: 'David' })).toEqual(['Jermaine', 'Kishan', 'Raphael', 'David']);
    expect(managersFor({ role: 'user', route_managers: null, manager_name: 'Sarah' })).toEqual(['Joseph', 'Pete', 'Marcia', 'Sarah']);
    expect(managersFor({ role: 'user', route_managers: null, manager_name: 'Pete' })).toEqual(['Pete']);
    // A user with no manager assigned gets nothing, whatever they typed as a name.
    expect(managersFor({ role: 'user', route_managers: null, manager_name: null })).toEqual([]);
  });

  it('pending and denied accounts see no stores', () => {
    expect(managersFor({ role: 'unassigned', route_managers: ['David'], manager_name: 'David' })).toEqual([]);
    expect(managersFor({ role: 'denied', route_managers: ['Joseph'] })).toEqual([]);
    expect(isMember({ role: 'unassigned' })).toBe(false);
    expect(isMember({ role: 'denied' })).toBe(false);
    expect(isMember({ role: 'user' })).toBe(true);
    expect(isMember({ role: 'admin' })).toBe(true);
    expect(managersFor(null)).toEqual([]);
  });

  it('uses the per-profile scope and drops unknown managers', () => {
    expect(managersFor({ role: 'user', route_managers: ['Jermaine', 'Kishan', 'Raphael', 'David'] })).toEqual(['Jermaine', 'Kishan', 'Raphael', 'David']);
    expect(managersFor({ role: 'user', route_managers: ['Marcia'] })).toEqual(['Marcia']);
    expect(managersFor({ role: 'user', route_managers: ['Bob'], manager_name: 'Pete' })).toEqual(['Pete']);
    expect(defaultPatchFor('Bob')).toEqual([]);
    expect(defaultPatchFor('constructor')).toEqual([]);
  });

  it('separates store owners from app seats', () => {
    expect(MANAGERS).toEqual(['Joseph', 'Pete', 'Marcia', 'Jermaine', 'Kishan', 'Raphael']);
    expect(MANAGERS).not.toContain('Sarah');
    expect(MANAGERS).not.toContain('David');
    expect(TEAM_SEATS).toEqual(['Sarah', 'David', 'Pete']);
    expect(patchOwners(defaultPatchFor('Sarah'))).toEqual(['Joseph', 'Pete', 'Marcia']);
    expect(patchOwners(defaultPatchFor('David'))).toEqual(['Jermaine', 'Kishan', 'Raphael']);
    expect(isLegacyOwner('David')).toBe(true);
    expect(isLegacyOwner('Kishan')).toBe(false);
  });

  it('labels store cards', () => {
    expect(managerLabel('Joseph')).toBe("Jo's Store");
    expect(managerLabel('Pete')).toBe("Pete's Store");
    expect(managerLabel('Jermaine')).toBe("Jermaine's Store");
    expect(managerLabel('Marcia')).toBe("Marcia's Store");
  });
});
