import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Vibration, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useNow } from '@/hooks/useNow';
import { alarmRinging, formatDuration } from '@/lib/visit-timer';
import { useData } from '@/providers/DataProvider';
import { ACTION_CLOCK_OUT, ACTION_CONTINUE, ALARM_VIBRATION, VISIT_ALARM_KIND } from '@/services/visit-alarm';
import { COCKPIT_INK } from '@/theme/palettes';
import { radius } from '@/theme/typography';
import { PremiumButton } from './PremiumButton';
import { Txt } from './Txt';

// The chime then the voice ("Time's up! ... Clock out now!"), looped until answered.
const CHIME = require('../../assets/sounds/clock_out_alarm.wav');

/** Loops the clock-out call and the vibration while `on`, and stops both the moment it turns off. */
function useAlarmSignal(on: boolean) {
  const player = useRef<AudioPlayer | null>(null);
  useEffect(() => {
    if (!on) return;
    try {
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'doNotMix' }).catch(() => {});
      player.current ??= createAudioPlayer(CHIME);
      player.current.loop = true;
      player.current.seekTo(0).catch(() => {});
      player.current.play();
    } catch {
      // No sound (for example muted media); the vibration and screen still alert.
    }
    // `true` repeats the pattern until cancelled.
    Vibration.vibrate(ALARM_VIBRATION, true);
    return () => {
      Vibration.cancel();
      try {
        player.current?.pause();
      } catch {
        // already released
      }
    };
  }, [on]);
  useEffect(
    () => () => {
      player.current?.remove();
      player.current = null;
    },
    [],
  );
}

/**
 * The one-hour clock-out alarm. The aim is 25 minutes to an hour in store:
 * at the hour the chime and vibration loop until the person silences them by
 * choosing Continue visit or Clock out. The scheduled notification covers the
 * same moment when the app is in the background; its buttons land here too.
 */
export function VisitAlarm() {
  const { activeVisit, stores, completeVisit, silenceVisitAlarm } = useData();
  const now = useNow(activeVisit && !activeVisit.alarmSilenced ? 1000 : 60_000);
  const ringing = alarmRinging(activeVisit, now);
  const [busy, setBusy] = useState<'continue' | 'clockout' | null>(null);
  const store = activeVisit ? stores.find((s) => s.id === activeVisit.storeId) : undefined;
  const minutes = activeVisit ? (now - new Date(activeVisit.startedAt).getTime()) / 60_000 : 0;

  useAlarmSignal(ringing);

  const onContinue = async () => {
    setBusy('continue');
    try {
      await silenceVisitAlarm();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const onClockOut = async () => {
    const storeId = activeVisit?.storeId;
    setBusy('clockout');
    try {
      await completeVisit();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (storeId) router.navigate({ pathname: '/store/[id]', params: { id: storeId } });
    } catch (e) {
      Alert.alert('Could not clock out', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  // Buttons on the notification itself (including one tapped while the app was closed).
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  const actions = useRef({ onContinue, onClockOut });
  useEffect(() => {
    actions.current = { onContinue, onClockOut };
  });
  useEffect(() => {
    if (!response || !activeVisit) return;
    if ((response.notification.request.content.data as { kind?: string } | null)?.kind !== VISIT_ALARM_KIND) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handled.current === key) return;
    handled.current = key;
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (response.actionIdentifier === ACTION_CONTINUE) actions.current.onContinue();
    else if (response.actionIdentifier === ACTION_CLOCK_OUT) actions.current.onClockOut();
    // A plain tap opens the app, where the alarm below is already ringing.
  }, [response, activeVisit]);

  return (
    <Modal visible={ringing} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(4,4,5,0.94)', alignItems: 'center', justifyContent: 'center', padding: 24 }} accessibilityViewIsModal>
        <PulseRing />
        <Txt variant="label" style={{ color: COCKPIT_INK.gold, marginTop: 28, letterSpacing: 2 }}>
          One hour in store
        </Txt>
        <Txt variant="display" align="center" style={{ color: COCKPIT_INK.text, marginTop: 6 }} accessibilityRole="header">
          Time to clock out
        </Txt>
        <Txt variant="body" align="center" style={{ color: COCKPIT_INK.dim, marginTop: 10, maxWidth: 340 }}>
          {store ? `${formatDuration(minutes)} at ${store.name}.` : `${formatDuration(minutes)} on this visit.`} The aim is 25 minutes to an hour. Clock out now, or continue if you need longer.
        </Txt>
        <View style={{ alignSelf: 'stretch', maxWidth: 420, width: '100%', marginTop: 32, gap: 12 }}>
          <PremiumButton label="Clock out now" icon="log-out" variant="gold" size="lg" onPress={onClockOut} loading={busy === 'clockout'} disabled={!!busy} onDark full />
          <PremiumButton label="Continue visit" icon="timer-outline" variant="outline" size="lg" onPress={onContinue} loading={busy === 'continue'} disabled={!!busy} onDark full />
        </View>
      </View>
    </Modal>
  );
}

function PulseRing() {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.set(withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [reduced, t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.get()), transform: [{ scale: 1 + t.get() * 0.7 }] }));
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius.pill, borderWidth: 2, borderColor: COCKPIT_INK.gold }, ring]} />
      <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,207,148,0.12)', borderWidth: 1.5, borderColor: COCKPIT_INK.gold }}>
        <Ionicons name="alarm" size={44} color={COCKPIT_INK.gold} />
      </View>
    </View>
  );
}
