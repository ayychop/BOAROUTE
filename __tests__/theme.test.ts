import { PALETTES, PHASES, greetingFor, msUntilNextPhase, phaseForDate } from '../src/theme/palettes';

const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);

describe('time-based ambiance', () => {
  it.each([
    [5, 59, 'cockpit'],
    [6, 0, 'dawn'],
    [11, 59, 'dawn'],
    [12, 0, 'focus'],
    [17, 59, 'focus'],
    [18, 0, 'cockpit'],
    [23, 30, 'cockpit'],
    [0, 0, 'cockpit'],
  ])('%i:%i is %s', (h, m, phase) => expect(phaseForDate(at(h, m))).toBe(phase));

  it('schedules the next switch at the boundary', () => {
    expect(msUntilNextPhase(at(11, 30))).toBe(30 * 60_000);
    expect(msUntilNextPhase(at(17, 0))).toBe(60 * 60_000);
    expect(msUntilNextPhase(at(23, 0))).toBe(7 * 3_600_000);
    expect(msUntilNextPhase(at(3, 0))).toBe(3 * 3_600_000);
  });

  it('defines every palette with matching phase keys', () => {
    for (const p of PHASES) {
      expect(PALETTES[p].phase).toBe(p);
      expect(PALETTES[p].bg).toHaveLength(3);
    }
    // Every phase stays dark: the BOA identity is black, charcoal and gold.
    expect(PALETTES.dawn.statusBar).toBe('light');
    expect(PALETTES.cockpit.statusBar).toBe('light');
  });

  it('uses no cyan or teal anywhere in the palettes', () => {
    for (const p of PHASES) {
      for (const value of Object.values(PALETTES[p])) {
        if (typeof value !== 'string' || !value.startsWith('#')) continue;
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
        // Cyan/teal means blue and green both well above red.
        expect(Math.min(g, b) - r > 40).toBe(false);
      }
    }
  });

  it('greets by time of day', () => {
    expect(greetingFor('dawn', 8)).toBe('Good morning');
    expect(greetingFor('cockpit', 20)).toBe('Good evening');
    expect(greetingFor('cockpit', 2)).toBe('Burning the midnight oil');
  });
});
