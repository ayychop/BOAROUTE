import { PALETTES, PHASES, greetingFor, msUntilNextPhase, phaseForDate } from '../src/theme/palettes';

const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);

/** WCAG relative luminance of a #RRGGBB colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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
    // Champagne is the light ambiance; Graphite and Noir stay dark.
    expect(PALETTES.dawn.statusBar).toBe('dark');
    expect(PALETTES.focus.statusBar).toBe('light');
    expect(PALETTES.cockpit.statusBar).toBe('light');
  });

  it('makes the three ambiances visibly different', () => {
    const lum = (hex: string) => luminance(hex);
    // Champagne clearly bright, Graphite mid charcoal, Noir pure black.
    expect(lum(PALETTES.dawn.bg[1])).toBeGreaterThan(0.75);
    expect(lum(PALETTES.focus.bg[1])).toBeGreaterThan(lum(PALETTES.cockpit.bg[1]) + 0.01);
    expect(PALETTES.cockpit.bg).toEqual(['#000000', '#000000', '#000000']);
  });

  it.each(PHASES)('%s keeps text readable on every background stop', (phase) => {
    const p = PALETTES[phase];
    for (const bg of [...p.bg, p.surfaceStrong]) {
      expect(contrast(p.text, bg)).toBeGreaterThanOrEqual(7);
      expect(contrast(p.textDim, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.textFaint, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.primary, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.gold, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.danger, bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(p.success, bg)).toBeGreaterThanOrEqual(3);
    }
    // Labels on filled buttons.
    expect(contrast(p.primaryText, p.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.goldText, p.goldMetal[1])).toBeGreaterThanOrEqual(3);
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
