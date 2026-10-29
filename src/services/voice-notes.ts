import { Asset } from 'expo-asset';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { BoaRouteDrive } from '../../modules/boaroute-drive';
import { getPref, setPref } from '@/lib/prefs';
import { cuePhrase, parseVolume, type VoiceClip } from '@/lib/voice-alerts';

/**
 * Plays the speed camera / police voice notes. On Android the BoaRouteDrive
 * module plays them as navigation guidance with transient "may duck" focus,
 * so Waze and Spotify dip under the note and come back straight after, even
 * while Waze is in front (the hazard foreground service keeps us running).
 * Elsewhere expo-audio plays them with duckOthers, and if a clip cannot play
 * at all the words are spoken instead so the alert is never silent.
 */

const CLIPS: Record<VoiceClip, number> = {
  camera_approaching: require('../../assets/sounds/camera_approaching.mp3'),
  camera_passing: require('../../assets/sounds/camera_passing.mp3'),
  police_approaching: require('../../assets/sounds/police_approaching.mp3'),
  police_passing: require('../../assets/sounds/police_passing.mp3'),
};

export const VOICE_VOLUME_PREF = 'voice.volume';

export function voiceVolume(): number {
  return parseVolume(getPref(VOICE_VOLUME_PREF));
}

export function setVoiceVolume(v: number) {
  setPref(VOICE_VOLUME_PREF, String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100));
}

export function voiceMuted(): boolean {
  return getPref('nav.muted') === 'true';
}

const localUris = new Map<VoiceClip, string>();

/** Copies the clips out of the bundle once, so the first alert has no load delay. */
export async function preloadVoiceNotes(): Promise<void> {
  await Promise.all(
    (Object.keys(CLIPS) as VoiceClip[]).map(async (clip) => {
      if (localUris.has(clip)) return;
      try {
        const asset = await Asset.fromModule(CLIPS[clip]).downloadAsync();
        if (asset.localUri) localUris.set(clip, asset.localUri);
      } catch {
        // Resolved again on play.
      }
    }),
  );
}

let fallback: AudioPlayer | null = null;

async function playWithExpoAudio(clip: VoiceClip, volume: number): Promise<boolean> {
  await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
  fallback?.remove();
  const player = createAudioPlayer(CLIPS[clip]);
  fallback = player;
  player.volume = volume;
  player.play();
  return true;
}

/**
 * Plays one voice note at the user's volume. `force` plays even when muted
 * (the Voice alerts test button). Resolves once the note has started (or
 * finished, natively); never throws.
 */
export async function playVoiceNote(clip: VoiceClip, { force = false }: { force?: boolean } = {}): Promise<boolean> {
  if (!force && voiceMuted()) return false;
  const volume = voiceVolume();
  if (volume <= 0) return false;
  try {
    if (BoaRouteDrive && Platform.OS === 'android') {
      let uri = localUris.get(clip);
      if (!uri) {
        await preloadVoiceNotes();
        uri = localUris.get(clip);
      }
      if (uri) {
        // Do not await the whole clip: the location task must return quickly.
        BoaRouteDrive.playVoiceNote(uri, volume).catch(() => speakFallback(clip, volume));
        return true;
      }
    }
    return await playWithExpoAudio(clip, volume);
  } catch {
    speakFallback(clip, volume);
    return true;
  }
}

function speakFallback(clip: VoiceClip, volume: number) {
  Speech.speak(cuePhrase(clip), { language: 'en-GB', rate: 1.0, volume });
}

export function stopVoiceNotes() {
  BoaRouteDrive?.stopVoiceNote().catch(() => {});
  try {
    fallback?.pause();
  } catch {
    // Released.
  }
}
