import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ZoomIn,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useLayout } from '@/hooks/useLayout';
import { COCKPIT_INK } from '@/theme/palettes';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/typography';
import { Txt } from './Txt';

const SPEND_DAT = require('../../assets/spend_dat.mp3');

/** The track is a full song; the celebration plays its opening seconds, then fades out. */
export const CLIP_MS = 6000;
const AUDIO_FADE_MS = 700;
const OVERLAY_FADE_MS = 450;
const DROPS = 26;

interface Drop {
  x: number;
  size: number;
  delay: number;
  fall: number;
  spin: number;
  note: boolean;
}

/** Spread drops across the width with some jitter, so the rain never clumps or leaves gaps. */
function makeDrops(width: number): Drop[] {
  return Array.from({ length: DROPS }, (_, i) => {
    const note = i % 4 === 0;
    const lane = (i + 0.5) / DROPS;
    return {
      x: Math.max(0, Math.min(width - 40, lane * width + (Math.random() - 0.5) * (width / DROPS) * 2 - 18)),
      size: note ? 46 : 22 + Math.random() * 18,
      delay: Math.random() * 1400,
      fall: 1700 + Math.random() * 1400,
      spin: (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 360),
      note,
    };
  });
}

function FallingDrop({ drop, height }: { drop: Drop; height: number }) {
  const { palette } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(drop.delay, withRepeat(withTiming(1, { duration: drop.fall, easing: Easing.in(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [drop, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 1,
    transform: [
      { translateY: -80 + t.value * (height + 160) },
      { translateX: Math.sin(t.value * Math.PI * 2) * (drop.note ? 18 : 6) },
      { rotate: `${t.value * drop.spin}deg` },
      // Coins flip as they fall; notes flutter.
      drop.note ? { rotateX: `${Math.sin(t.value * Math.PI * 4) * 50}deg` } : { scaleX: Math.cos(t.value * Math.PI * 3) },
    ],
  }));

  if (drop.note) {
    return (
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: drop.x, top: 0 }, style]}>
        <LinearGradient
          colors={['#F3E6B8', '#D9C17E', '#A88A45']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: drop.size, height: drop.size * 0.5, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(90,64,20,0.5)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Txt maxFontSizeMultiplier={1} style={{ fontFamily: fonts.displayHeavy, fontSize: 13, lineHeight: 15, color: 'rgba(70,48,12,0.85)' }}>
            £
          </Txt>
        </LinearGradient>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: drop.x, top: 0 }, style]}>
      <LinearGradient
        colors={[...palette.goldMetal]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width: drop.size, height: drop.size, borderRadius: drop.size / 2, borderWidth: 1.5, borderColor: '#8E6E33', alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: drop.size * 0.7, height: drop.size * 0.7, borderRadius: drop.size, borderWidth: 1, borderColor: 'rgba(120,88,30,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Txt maxFontSizeMultiplier={1} style={{ fontFamily: fonts.displayHeavy, fontSize: drop.size * 0.42, lineHeight: drop.size * 0.5, color: 'rgba(92,64,18,0.9)' }}>
            £
          </Txt>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function Word({ text, delay, size }: { text: string; delay: number; size: number }) {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={reduced ? FadeIn.delay(delay) : ZoomIn.delay(delay).springify().damping(11).stiffness(180)}>
      <Txt
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        adjustsFontSizeToFit
        align="center"
        style={{
          fontFamily: fonts.displayHeavy,
          fontSize: size,
          lineHeight: size * 1.02,
          letterSpacing: size * 0.06,
          color: palette.gold,
          textShadowColor: 'rgba(232,207,148,0.65)',
          textShadowRadius: 28,
          textShadowOffset: { width: 0, height: 0 },
        }}
      >
        {text}
      </Txt>
    </Animated.View>
  );
}

/**
 * The "Spend Dat" moment after an expense saves: the track and a heavy haptic
 * fire together, gold coins and notes rain for the clip, then the overlay
 * fades and calls onDone. Tapping anywhere skips to the end.
 */
export function SpendDatOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const { width, height, compact } = useLayout();
  const reduced = useReducedMotion();
  const player = useRef<AudioPlayer | null>(null);
  const opacity = useSharedValue(0);
  const closing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fader = useRef<ReturnType<typeof setInterval> | null>(null);
  const drops = useMemo(() => (visible ? makeDrops(width) : []), [visible, width]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (fader.current) clearInterval(fader.current);
    fader.current = null;
  };

  const stopAudio = () => {
    try {
      player.current?.pause();
    } catch {
      // released
    }
  };

  const finish = () => {
    if (closing.current) return;
    closing.current = true;
    clearTimers();
    opacity.set(
      withTiming(0, { duration: OVERLAY_FADE_MS, easing: Easing.out(Easing.quad) }, (done) => {
        if (done) runOnJS(onDone)();
      }),
    );
    // The volume fade normally ends the sound; stop it outright on a skip.
    timers.current.push(setTimeout(stopAudio, OVERLAY_FADE_MS));
  };

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // Loaded up front, so the sound starts the instant the expense saves.
  useEffect(() => {
    let p: AudioPlayer | null = null;
    try {
      p = createAudioPlayer(SPEND_DAT);
    } catch {
      return;
    }
    player.current = p;
    // A clip shorter than CLIP_MS closes as soon as it ends.
    const sub = p.addListener('playbackStatusUpdate', (s) => {
      if (s.didJustFinish) finishRef.current();
    });
    return () => {
      sub.remove();
      p?.remove();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    opacity.set(withTiming(1, { duration: 180 }));
    // Sound and haptic at the same moment.
    try {
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' }).catch(() => {});
      const p = player.current;
      if (p) {
        p.volume = 1;
        p.seekTo(0).catch(() => {});
        p.play();
      }
    } catch {
      // No sound; the overlay still runs on its own clock.
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});

    // Fade the track out over the end of the clip, then close.
    timers.current.push(
      setTimeout(() => {
        const steps = 10;
        let n = 0;
        fader.current = setInterval(() => {
          n++;
          try {
            if (player.current) player.current.volume = Math.max(0, 1 - n / steps);
          } catch {
            // released
          }
          if (n >= steps && fader.current) {
            clearInterval(fader.current);
            fader.current = null;
            stopAudio();
          }
        }, AUDIO_FADE_MS / steps);
      }, CLIP_MS - AUDIO_FADE_MS),
    );
    timers.current.push(setTimeout(finish, CLIP_MS));
    return () => {
      clearTimers();
      stopAudio();
    };
    // finish and stopAudio only touch refs and the player, which stay stable while visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const wordSize = Math.min(compact ? 64 : 84, width * 0.2);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={finish}>
      <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>
        <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="SPEND DAT SHIT. Tap to close." style={StyleSheet.absoluteFill}>
          <LinearGradient colors={['rgba(8,6,3,0.94)', 'rgba(22,16,6,0.9)', 'rgba(8,6,3,0.96)']} style={StyleSheet.absoluteFill} />
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(232,207,148,0)', 'rgba(232,207,148,0.16)', 'rgba(232,207,148,0)']}
            start={{ x: 0.5, y: 0.2 }}
            end={{ x: 0.5, y: 0.8 }}
            style={StyleSheet.absoluteFill}
          />
          {!reduced && drops.map((d, i) => <FallingDrop key={i} drop={d} height={height} />)}
          <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
            <Word text="SPEND" delay={0} size={wordSize} />
            <Word text="DAT" delay={260} size={wordSize * 1.25} />
            <Word text="SHIT" delay={520} size={wordSize} />
            <Animated.View entering={FadeIn.delay(1200).duration(600)} style={{ marginTop: 22 }}>
              <Txt variant="label" align="center" style={{ color: COCKPIT_INK.text, opacity: 0.6 }}>
                Expense logged
              </Txt>
            </Animated.View>
          </View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
