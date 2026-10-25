export type Phase = 'dawn' | 'focus' | 'cockpit';

export interface Palette {
  phase: Phase;
  name: string;
  tagline: string;
  /** Three-stop background gradient, top to bottom. */
  bg: readonly [string, string, string];
  /** Colour of the drifting smoke wisps. */
  smoke: string;
  /** Three slow-moving colour fields that give each ambiance its mood. */
  mesh: readonly [string, string, string];
  /** Peak opacity of the mesh fields. */
  meshPeak: number;
  /** Peak opacity of the floating light particles. */
  particles: number;
  surface: string;
  /** Top edge of the frosted glass sheen. */
  surfaceHighlight: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  /** Deeper end of the metallic gold gradient. */
  primaryDeep: string;
  gold: string;
  goldText: string;
  /** Highlight, body and shadow of the metallic gold button. */
  goldMetal: readonly [string, string, string];
  /** Neutral metallic second accent (platinum). */
  platinum: string;
  /** Warm third accent (rose gold), used for OOH. */
  rose: string;
  success: string;
  danger: string;
  warning: string;
  glow: string;
  goldGlow: string;
  inputBg: string;
  tabBar: string;
  scrim: string;
  /** Edge darkening over the ambient background. */
  vignette: string;
  statusBar: 'light' | 'dark';
}

/** Shared BOA identity for the dark ambiances: rich blacks, charcoal, metallic gold and frosted glass. */
const BOA = {
  text: '#F5F0E6',
  textDim: '#B9B0A0',
  textFaint: '#857D70',
  primary: '#CDA960',
  primaryText: '#17120A',
  primaryDeep: '#8E6E33',
  gold: '#E8CF94',
  goldText: '#17120A',
  goldMetal: ['#FFF1C9', '#E8CF94', '#B8954F'],
  platinum: '#C9CDD4',
  rose: '#D19B82',
  success: '#8FC29C',
  danger: '#E4806F',
  warning: '#E3B565',
  scrim: 'rgba(0,0,0,0.7)',
  vignette: 'rgba(0,0,0,0.55)',
  statusBar: 'light',
} as const;

export const PALETTES: Record<Phase, Palette> = {
  // Light ambiance: champagne paper, deep bronze accents, ink text.
  dawn: {
    phase: 'dawn',
    name: 'Champagne',
    tagline: 'Bright, warm and light',
    bg: ['#FCF8EF', '#F4EBDA', '#E9DCC3'],
    smoke: '#C7A766',
    mesh: ['#F6C98B', '#EBB39A', '#FFE3A3'],
    meshPeak: 0.55,
    particles: 0.55,
    surface: 'rgba(255,255,255,0.66)',
    surfaceHighlight: 'rgba(255,255,255,0.95)',
    surfaceStrong: '#FFFCF5',
    border: 'rgba(90,66,24,0.16)',
    borderStrong: 'rgba(150,110,45,0.6)',
    text: '#1F1A12',
    textDim: '#54493A',
    textFaint: '#73674F',
    primary: '#8A6424',
    primaryText: '#FFF9EE',
    primaryDeep: '#5E4215',
    gold: '#7E5A1C',
    goldText: '#FFF9EE',
    goldMetal: ['#D6B26A', '#A27A33', '#6F5019'],
    platinum: '#5F6672',
    rose: '#9E5A40',
    success: '#2E7547',
    danger: '#B23E2B',
    warning: '#94600F',
    glow: 'rgba(160,118,48,0.18)',
    goldGlow: 'rgba(160,118,48,0.24)',
    inputBg: 'rgba(255,255,255,0.8)',
    tabBar: 'rgba(252,248,239,0.97)',
    scrim: 'rgba(31,26,18,0.5)',
    vignette: 'rgba(140,105,45,0.14)',
    statusBar: 'dark',
  },
  // Cool graphite charcoal: clearly lighter than Noir, still dark.
  focus: {
    ...BOA,
    phase: 'focus',
    name: 'Graphite',
    tagline: 'Cool charcoal, balanced',
    bg: ['#34353A', '#26272B', '#1A1B1E'],
    smoke: '#F2F3F5',
    mesh: ['#8C95A8', '#6E7687', '#B7BDC8'],
    meshPeak: 0.32,
    particles: 0.5,
    surface: 'rgba(255,255,255,0.075)',
    surfaceHighlight: 'rgba(255,255,255,0.12)',
    surfaceStrong: '#2C2D31',
    border: 'rgba(255,255,255,0.12)',
    borderStrong: 'rgba(205,169,96,0.55)',
    textFaint: '#9A968F',
    glow: 'rgba(205,169,96,0.26)',
    goldGlow: 'rgba(232,207,148,0.26)',
    inputBg: 'rgba(0,0,0,0.25)',
    tabBar: 'rgba(30,31,34,0.97)',
    vignette: 'rgba(0,0,0,0.35)',
  },
  // Pure black with glowing gold.
  cockpit: {
    ...BOA,
    phase: 'cockpit',
    name: 'Noir',
    tagline: 'Pure black, glowing gold',
    bg: ['#000000', '#000000', '#000000'],
    smoke: '#E9DFC8',
    mesh: ['#5A4317', '#3A2A12', '#2A2110'],
    meshPeak: 0.3,
    particles: 0.85,
    surface: 'rgba(255,245,225,0.05)',
    surfaceHighlight: 'rgba(255,245,225,0.08)',
    surfaceStrong: '#0B0B0A',
    border: 'rgba(255,240,210,0.09)',
    borderStrong: 'rgba(205,169,96,0.58)',
    glow: 'rgba(205,169,96,0.40)',
    goldGlow: 'rgba(232,207,148,0.40)',
    inputBg: 'rgba(255,255,255,0.04)',
    tabBar: 'rgba(0,0,0,0.97)',
  },
};

/** Fixed dark instrument colours for things that always sit on black (odometer cells, text over car photos). */
export const COCKPIT_INK = { text: BOA.text, dim: 'rgba(245,240,230,0.7)', gold: BOA.gold, border: 'rgba(255,240,210,0.12)' } as const;

export const PHASES: Phase[] = ['dawn', 'focus', 'cockpit'];

/** Morning 06:00-11:59 Dawn, afternoon 12:00-17:59 Focus, evening and night Cockpit. */
export function phaseForDate(d: Date): Phase {
  const h = d.getHours();
  if (h >= 6 && h < 12) return 'dawn';
  if (h >= 12 && h < 18) return 'focus';
  return 'cockpit';
}

/** Milliseconds until the next phase boundary (06:00, 12:00 or 18:00). */
export function msUntilNextPhase(d: Date): number {
  const next = new Date(d);
  const h = d.getHours();
  const boundary = h < 6 ? 6 : h < 12 ? 12 : h < 18 ? 18 : 30; // 30 = 06:00 tomorrow
  next.setHours(boundary, 0, 0, 0);
  return Math.max(1000, next.getTime() - d.getTime());
}

export function greetingFor(phase: Phase, hour: number): string {
  if (phase === 'dawn') return 'Good morning';
  if (phase === 'focus') return 'Good afternoon';
  return hour >= 18 ? 'Good evening' : 'Burning the midnight oil';
}
