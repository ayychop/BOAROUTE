import { createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import BoarouteCar from '../../modules/boaroute-car';
import type { CameraCue } from '@/lib/hazard-alerts';

/**
 * The co-pilot voice. On Android the native player (modules/boaroute-car,
 * CoPilotAudio.kt) plays the recorded voice notes and police warnings with
 * Android audio focus: music ducks, the warning plays, the music comes back.
 * Elsewhere (iOS, Expo Go) it falls back to expo-audio and expo-speech
 * without ducking.
 */

/** res/raw names, copied from assets/sounds by plugins/withAndroidAuto.js. */
const CUE_RAW: Record<CameraCue, string> = { approaching: 'camera_approaching', passing: 'camera_passing' };

const CUE_ASSET: Record<CameraCue, number> = {
  approaching: require('../../assets/sounds/camera_approaching.mp3'),
  passing: require('../../assets/sounds/camera_passing.mp3'),
};

export function playCameraCue(cue: CameraCue) {
  if (BoarouteCar) return BoarouteCar.playCue(CUE_RAW[cue]);
  try {
    const player = createAudioPlayer(CUE_ASSET[cue]);
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (!s.didJustFinish) return;
      sub.remove();
      player.remove();
    });
    player.play();
  } catch {
    // No audio output available: the on-screen banner still shows the camera.
  }
}

export function speakWarning(text: string) {
  if (BoarouteCar) return BoarouteCar.speak(text);
  Speech.speak(text, { language: 'en-GB', rate: 1.0 });
}
