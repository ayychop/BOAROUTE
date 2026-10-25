import { DEFAULT_FREQUENCIES, managerLabel, managersFor, targetsFor, usesDefaultTargets } from '../src/lib/frequency';

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
  it('falls back to role defaults', () => {
    expect(managersFor({ role: 'admin', route_managers: null })).toEqual(['Joseph']);
    expect(managersFor({ role: 'user', route_managers: [] })).toEqual(['Joseph', 'Pete']);
  });

  it('uses the per-profile scope and drops unknown managers', () => {
    expect(managersFor({ role: 'user', route_managers: ['David'] })).toEqual(['David']);
    expect(managersFor({ role: 'user', route_managers: ['Marcia'] })).toEqual(['Marcia']);
    expect(managersFor({ role: 'user', route_managers: ['Bob'] })).toEqual(['Joseph', 'Pete']);
    expect(managersFor(null)).toEqual([]);
  });

  it('labels store cards', () => {
    expect(managerLabel('Joseph')).toBe("Jo's Store");
    expect(managerLabel('Pete')).toBe("Pete's Store");
    expect(managerLabel('David')).toBe("David's Store");
    expect(managerLabel('Marcia')).toBe("Marcia's Store");
  });
});
