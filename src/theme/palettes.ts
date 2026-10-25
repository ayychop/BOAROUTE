export type Phase = 'dawn' | 'focus' | 'cockpit';

export interface Palette {
  phase: Phase;
  name: string;
  tagline: string;
  /** Three-stop background gradient, top to bottom. */
  bg: readonly [string, string, string];
  /** Colour of the drifting smoke wisps. */
  smoke: string;
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
  statusBar: 'light' | 'dark';
}

/** Shared BOA identity: rich blacks, charcoal, metallic gold and frosted glass. */
const BOA = {
  text: '#F5F0E6',
  textDim: '#B9B0A0',
  textFaint: '#7D766A',
  primary: '#CDA960',
  primaryText: '#17120A',
  primaryDeep: '#8E6E33',
  gold: '#E8CF94',
  goldText: '#17120A',
  platinum: '#C9CDD4',
  rose: '#D19B82',
  success: '#8FC29C',
  danger: '#E4806F',
  warning: '#E3B565',
  scrim: 'rgba(0,0,0,0.7)',
  statusBar: 'light',
} as const;

export const PALETTES: Record<Phase, Palette> = {
  dawn: {
    ...BOA,
    phase: 'dawn',
    name: 'Champagne',
    tagline: 'Morning light on charcoal',
    bg: ['#1E1B16', '#14120F', '#0C0B09'],
    smoke: '#FFF6E4',
    particles: 0.7,
    surface: 'rgba(255,248,235,0.06)',
    surfaceHighlight: 'rgba(255,248,235,0.10)',
    surfaceStrong: '#22201C',
    border: 'rgba(255,240,215,0.10)',
    borderStrong: 'rgba(225,195,130,0.55)',
    gold: '#F0D9A2',
    glow: 'rgba(225,190,120,0.30)',
    goldGlow: 'rgba(240,217,162,0.32)',
    inputBg: 'rgba(0,0,0,0.28)',
    tabBar: 'rgba(22,20,17,0.94)',
  },
  focus: {
    ...BOA,
    phase: 'focus',
    name: 'Graphite',
    tagline: 'Composed and balanced',
    bg: ['#18181A', '#111112', '#0A0A0B'],
    smoke: '#F2EFEA',
    particles: 0.55,
    surface: 'rgba(255,255,255,0.05)',
    surfaceHighlight: 'rgba(255,255,255,0.085)',
    surfaceStrong: '#1D1D1F',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(205,169,96,0.50)',
    glow: 'rgba(205,169,96,0.28)',
    goldGlow: 'rgba(232,207,148,0.28)',
    inputBg: 'rgba(0,0,0,0.30)',
    tabBar: 'rgba(17,17,18,0.95)',
  },
  cockpit: {
    ...BOA,
    phase: 'cockpit',
    name: 'Noir',
    tagline: 'Deep black, glowing gold',
    bg: ['#0D0C0A', '#060606', '#000000'],
    smoke: '#E9DFC8',
    particles: 0.85,
    surface: 'rgba(255,245,225,0.045)',
    surfaceHighlight: 'rgba(255,245,225,0.08)',
    surfaceStrong: '#151413',
    border: 'rgba(255,240,210,0.08)',
    borderStrong: 'rgba(205,169,96,0.58)',
    glow: 'rgba(205,169,96,0.40)',
    goldGlow: 'rgba(232,207,148,0.40)',
    inputBg: 'rgba(0,0,0,0.40)',
    tabBar: 'rgba(8,8,8,0.96)',
  },
};

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
