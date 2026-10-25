import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { Easing, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { getPref, setPref } from '@/lib/prefs';
import { PALETTES, phaseForDate, msUntilNextPhase, type Palette, type Phase } from './palettes';

export type AmbianceMode = 'auto' | Phase;

interface ThemeValue {
  palette: Palette;
  phase: Phase;
  mode: AmbianceMode;
  setMode: (mode: AmbianceMode) => void;
  /** Opacity of each background layer, animated during a phase change. */
  layers: Record<Phase, SharedValue<number>>;
  /** Content opacity dip used to hide the colour swap. */
  contentOpacity: SharedValue<number>;
}

const ThemeContext = createContext<ThemeValue | null>(null);

const MODES: AmbianceMode[] = ['auto', 'dawn', 'focus', 'cockpit'];
const BG_FADE_MS = 900;
const DIP_MS = 120;

function readMode(): AmbianceMode {
  const saved = getPref('ambiance');
  return MODES.includes(saved as AmbianceMode) ? (saved as AmbianceMode) : 'auto';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AmbianceMode>(readMode);
  const [clockPhase, setClockPhase] = useState<Phase>(() => phaseForDate(new Date()));
  const target: Phase = mode === 'auto' ? clockPhase : mode;
  const [phase, setPhase] = useState<Phase>(target);

  const dawn = useSharedValue(phase === 'dawn' ? 1 : 0);
  const focus = useSharedValue(phase === 'focus' ? 1 : 0);
  const cockpit = useSharedValue(phase === 'cockpit' ? 1 : 0);
  const contentOpacity = useSharedValue(1);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track the clock: wake exactly at the next boundary and whenever the app returns.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      setClockPhase(phaseForDate(now));
      timer = setTimeout(schedule, msUntilNextPhase(now) + 500);
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        clearTimeout(timer);
        schedule();
      }
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  // Premium transition: dissolve the background layers, dip the content, swap colours mid-dip.
  useEffect(() => {
    if (target === phase) return;
    const ease = Easing.inOut(Easing.cubic);
    dawn.value = withTiming(target === 'dawn' ? 1 : 0, { duration: BG_FADE_MS, easing: ease });
    focus.value = withTiming(target === 'focus' ? 1 : 0, { duration: BG_FADE_MS, easing: ease });
    cockpit.value = withTiming(target === 'cockpit' ? 1 : 0, { duration: BG_FADE_MS, easing: ease });
    contentOpacity.value = withSequence(
      withTiming(0.35, { duration: DIP_MS, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 620, easing: Easing.out(Easing.cubic) }),
    );
    if (swapTimer.current) clearTimeout(swapTimer.current);
    swapTimer.current = setTimeout(() => setPhase(target), DIP_MS);
    return () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
    };
  }, [target, phase, dawn, focus, cockpit, contentOpacity]);

  const setMode = useCallback((m: AmbianceMode) => {
    setModeState(m);
    setPref('ambiance', m);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      palette: PALETTES[phase],
      phase,
      mode,
      setMode,
      layers: { dawn, focus, cockpit },
      contentOpacity,
    }),
    [phase, mode, setMode, dawn, focus, cockpit, contentOpacity],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
