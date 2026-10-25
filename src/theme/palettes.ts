export type Phase = 'dawn' | 'focus' | 'cockpit';

export interface Palette {
  phase: Phase;
  name: string;
  tagline: string;
  /** Three-stop background gradient, top to bottom. */
  bg: readonly [string, string, string];
  /** Two ambient glow orb colours. */
  orbs: readonly [string, string];
  surface: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textDim: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  gold: string;
  goldText: string;
  success: string;
  danger: string;
  warning: string;
  glow: string;
  goldGlow: string;
  inputBg: string;
  tabBar: string;
  scrim: string;
  statusBar: 'light' | 'dark';
  /** Grid line opacity for the cockpit HUD overlay (0 hides it). */
  grid: number;
}

export const PALETTES: Record<Phase, Palette> = {
  dawn: {
    phase: 'dawn',
    name: 'Dawn',
    tagline: 'Crisp and energised',
    bg: ['#F7FBFF', '#E6F3FF', '#D3EAFF'],
    orbs: ['rgba(0,170,255,0.30)', 'rgba(255,196,0,0.26)'],
    surface: 'rgba(255,255,255,0.80)',
    surfaceStrong: '#FFFFFF',
    border: 'rgba(0,122,255,0.16)',
    borderStrong: 'rgba(0,122,255,0.42)',
    text: '#06182F',
    textDim: '#355270',
    textFaint: '#7A90AA',
    primary: '#0094FF',
    primaryText: '#FFFFFF',
    gold: '#E8A600',
    goldText: '#1F1500',
    success: '#00A870',
    danger: '#E5484D',
    warning: '#E07B00',
    glow: 'rgba(0,148,255,0.45)',
    goldGlow: 'rgba(232,166,0,0.45)',
    inputBg: 'rgba(255,255,255,0.92)',
    tabBar: 'rgba(255,255,255,0.88)',
    scrim: 'rgba(6,24,47,0.45)',
    statusBar: 'dark',
    grid: 0,
  },
  focus: {
    phase: 'focus',
    name: 'Focus',
    tagline: 'Sleek and balanced',
    bg: ['#121A2A', '#182236', '#1F2B43'],
    orbs: ['rgba(61,169,255,0.22)', 'rgba(242,193,78,0.16)'],
    surface: 'rgba(34,46,70,0.74)',
    surfaceStrong: '#26324B',
    border: 'rgba(130,175,255,0.16)',
    borderStrong: 'rgba(110,180,255,0.45)',
    text: '#EBF2FF',
    textDim: '#A8B6CE',
    textFaint: '#6F7F99',
    primary: '#3DA9FF',
    primaryText: '#04121F',
    gold: '#F2C14E',
    goldText: '#1F1500',
    success: '#3DD68C',
    danger: '#FF6369',
    warning: '#FFB224',
    glow: 'rgba(61,169,255,0.38)',
    goldGlow: 'rgba(242,193,78,0.35)',
    inputBg: 'rgba(14,21,36,0.70)',
    tabBar: 'rgba(18,26,42,0.92)',
    scrim: 'rgba(0,0,0,0.55)',
    statusBar: 'light',
    grid: 0.04,
  },
  cockpit: {
    phase: 'cockpit',
    name: 'Cockpit',
    tagline: 'Deep night, neon glow',
    bg: ['#010309', '#040A18', '#07132B'],
    orbs: ['rgba(0,208,255,0.26)', 'rgba(255,200,61,0.18)'],
    surface: 'rgba(8,20,42,0.74)',
    surfaceStrong: '#0B1832',
    border: 'rgba(0,208,255,0.20)',
    borderStrong: 'rgba(0,224,255,0.60)',
    text: '#E4F7FF',
    textDim: '#8EB2CB',
    textFaint: '#4F6A84',
    primary: '#00D0FF',
    primaryText: '#00121A',
    gold: '#FFC83D',
    goldText: '#1F1500',
    success: '#2CF5A9',
    danger: '#FF5C7A',
    warning: '#FFB020',
    glow: 'rgba(0,208,255,0.62)',
    goldGlow: 'rgba(255,200,61,0.55)',
    inputBg: 'rgba(2,8,20,0.75)',
    tabBar: 'rgba(3,9,22,0.94)',
    scrim: 'rgba(0,0,0,0.65)',
    statusBar: 'light',
    grid: 0.07,
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
