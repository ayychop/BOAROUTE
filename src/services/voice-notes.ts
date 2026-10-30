import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { BoaRouteDrive } from '../../modules/boaroute-drive';
import { getPref, setPref } from '@/lib/prefs';
import { ALL_ALERTS_ON, CAMERA_CLIP_VOLUME, cuePhrase, isRecordedClip, parseToggle, parseVolume, type AlertToggles, type VoiceClip } from '@/lib/voice-alerts';

/**
 * Plays the speed camera and police voice notes, and speaks turn-by-turn
 * directions.
 *
 * The speed camera alert is always the recorded file below, played once as
 * the camera comes within about half a mile. To change the voice, replace this
 * one file (keep the name), nothing else:
 *   assets/sounds/camera_approaching.mp3
 * Police alerts and turn-by-turn directions use the phone's default
 * text-to-speech voice.
 *
 * Everything here ducks other apps (Waze, Google Maps, Spotify and the rest):
 * on Android the BoaRouteDrive module asks for transient "may duck" audio focus
 * as navigation guidance (USAGE_ASSISTANCE_NAVIGATION_GUIDANCE, the same stream
 * a car's own prompts use), plays, then gives focus back so they return to full
 * volume. That works while another app is in front because the hazard
 * foreground service keeps this process running.
 */

const CLIPS: Partial<Record<VoiceClip, number>> = {
  camera_approaching: require('../../assets/sounds/camera_approaching.mp3'),
};

export const VOICE_VOLUME_PREF = 'voice.volume';

export function voiceVolume(): number {
  return parseVolume(getPref(VOICE_VOLUME_PREF));
}

export function setVoiceVolume(v: number) {
  setPref(VOICE_VOLUME_PREF, String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100));
}

export const CAMERA_ALERTS_PREF = 'alerts.camera';
export const POLICE_ALERTS_PREF = 'alerts.police';
export const VOICE_NAV_PREF = 'nav.voice';

/** Settings > Voice alerts > "Speed camera alerts". On unless switched off. */
export function cameraAlertsOn(): boolean {
  return parseToggle(getPref(CAMERA_ALERTS_PREF), true);
}

export function policeAlertsOn(): boolean {
  return parseToggle(getPref(POLICE_ALERTS_PREF), true);
}

/** Both switches together, read fresh each time so a change applies to the very next fix. */
export function alertToggles(): AlertToggles {
  return { ...ALL_ALERTS_ON, cameras: cameraAlertsOn(), police: policeAlertsOn() };
}

/**
 * Spoken turn-by-turn directions. On unless switched off. The old single mute
 * ("nav.muted") is honoured until the new switch is first used.
 */
export function voiceNavOn(): boolean {
  return parseToggle(getPref(VOICE_NAV_PREF), getPref('nav.muted') !== 'true');
}

export function setVoiceNav(on: boolean) {
  setPref(VOICE_NAV_PREF, String(on));
}

const localUris = new Map<VoiceClip, string>();

/** Copies the recordings out of the bundle once, so the first alert has no load delay. */
export async function preloadVoiceNotes(): Promise<void> {
  await Promise.all(
    (Object.keys(CLIPS) as VoiceClip[]).map(async (clip) => {
      const source = CLIPS[clip];
      if (source == null || localUris.has(clip)) return;
      try {
        const asset = await Asset.fromModule(source).downloadAsync();
        if (asset.localUri) localUris.set(clip, asset.localUri);
      } catch {
        // Resolved again on play.
      }
    }),
  );
}

let fallback: AudioPlayer | null = null;

async function playWithExpoAudio(clip: VoiceClip, volume: number): Promise<boolean> {
  const source = CLIPS[clip];
  if (source == null) return false;
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
  fallback?.remove();
  const player = createAudioPlayer(source);
  fallback = player;
  player.volume = volume;
  player.play();
  return true;
}

/** Lets the other app's own volume ramp down before the first word, and back up after the last. */
const DUCK_LEAD_MS = 150;
const DUCK_TAIL_MS = 250;
const SPEECH_MAX_MS = 20_000;

let speaking = 0;
let restoreTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRestore() {
  if (restoreTimer) clearTimeout(restoreTimer);
  restoreTimer = setTimeout(() => {
    restoreTimer = null;
    if (speaking === 0) BoaRouteDrive?.restoreOthers().catch(() => {});
  }, DUCK_TAIL_MS);
}

/**
 * Speaks with the default text-to-speech voice, ducking other audio first:
 * lower everyone else, speak, then hand the volume back (even when BOAROUTE is
 * in the background). Several alerts in a row hold one duck until the last ends.
 */
async function speakDucked(text: string, volume: number): Promise<void> {
  speaking++;
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    speaking = Math.max(0, speaking - 1);
    scheduleRestore();
  };
  try {
    if (BoaRouteDrive && Platform.OS === 'android') {
      if (restoreTimer) {
        clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      await BoaRouteDrive.duckOthers().catch(() => false);
      await new Promise((resolve) => setTimeout(resolve, DUCK_LEAD_MS));
    }
    Speech.speak(text, { language: 'en-GB', rate: 1.0, volume, onDone: end, onStopped: end, onError: end });
    // Never hold everyone else's volume down if the engine goes quiet without calling back.
    setTimeout(end, SPEECH_MAX_MS);
  } catch {
    end();
  }
}

/**
 * Plays one voice note. `force` plays even when the alert type is switched off
 * (the Voice alerts test buttons). The recorded camera note always plays at full
 * gain; spoken notes use the saved volume. Resolves once the note has started
 * (or finished, natively); never throws.
 */
export async function playVoiceNote(clip: VoiceClip, { force = false }: { force?: boolean } = {}): Promise<boolean> {
  const recorded = isRecordedClip(clip);
  if (!force && !(clip === 'camera_approaching' ? cameraAlertsOn() : policeAlertsOn())) return false;
  const volume = recorded ? CAMERA_CLIP_VOLUME : voiceVolume();
  if (volume <= 0) return false;

  // Police: the phone's own voice.
  if (!recorded) {
    speakDucked(cuePhrase(clip), volume);
    return true;
  }

  try {
    if (BoaRouteDrive && Platform.OS === 'android') {
      let uri = localUris.get(clip);
      if (!uri) {
        await preloadVoiceNotes();
        uri = localUris.get(clip);
      }
      if (uri) {
        // Do not await the whole clip: the location task must return quickly.
        BoaRouteDrive.playVoiceNote(uri, volume).catch(() => playRecordingAnotherWay(clip, volume));
        return true;
      }
    }
    return await playWithExpoAudio(clip, volume);
  } catch {
    return playRecordingAnotherWay(clip, volume);
  }
}

/**
 * The native player could not play the recording. Try the same file through
 * expo-audio, and only if that fails too speak the words, so a camera alert is
 * never silent and your recording is always the first choice.
 */
async function playRecordingAnotherWay(clip: VoiceClip, volume: number): Promise<boolean> {
  try {
    if (await playWithExpoAudio(clip, volume)) return true;
  } catch {
    // Fall through to speech.
  }
  speakDucked(cuePhrase(clip), volume);
  return true;
}

/**
 * Speaks one turn-by-turn direction ("In 200 yards, turn left") with the phone's
 * text-to-speech voice, ducking Waze, Maps and music while it talks. A new
 * direction replaces one still being spoken. Does nothing when voice navigation
 * is switched off.
 */
export function speakGuidance(text: string) {
  if (!text || !voiceNavOn()) return;
  const volume = voiceVolume();
  if (volume <= 0) return;
  // The speech engine queues by default; a stale direction is worse than a missed one.
  Speech.stop().catch(() => {});
  speakDucked(text, volume);
}

export function stopVoiceNotes() {
  BoaRouteDrive?.stopVoiceNote().catch(() => {});
  if (speaking > 0) {
    Speech.stop().catch(() => {});
    speaking = 0;
    scheduleRestore();
  }
  try {
    fallback?.pause();
  } catch {
    // Released.
  }
}
