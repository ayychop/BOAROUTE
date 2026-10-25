import { DEFAULT_FREQUENCIES, defaultPatchFor, isMember, managerLabel, managersFor, targetsFor, usesDefaultTargets } from '../src/lib/frequency';

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
    expect(managersFor({ role: 'user', route_managers: [], manager_name: 'David' })).toEqual(['David']);
    expect(managersFor({ role: 'user', route_managers: null, manager_name: 'Sarah' })).toEqual(['Sarah', 'Joseph', 'Pete', 'Marcia']);
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
    expect(managersFor({ role: 'user', route_managers: ['David'] })).toEqual(['David']);
    expect(managersFor({ role: 'user', route_managers: ['Marcia'] })).toEqual(['Marcia']);
    expect(managersFor({ role: 'user', route_managers: ['Bob'], manager_name: 'Pete' })).toEqual(['Pete']);
    expect(defaultPatchFor('Bob')).toEqual([]);
  });

  it('labels store cards', () => {
    expect(managerLabel('Joseph')).toBe("Jo's Store");
    expect(managerLabel('Pete')).toBe("Pete's Store");
    expect(managerLabel('David')).toBe("David's Store");
    expect(managerLabel('Marcia')).toBe("Marcia's Store");
  });
});
