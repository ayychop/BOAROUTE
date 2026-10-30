import { requireOptionalNativeModule } from 'expo';

interface BoaRouteDriveModule {
  isAppInstalled(packageName: string): boolean;
  launchApp(packageName: string): boolean;
  launchEmail(): boolean;
  launchWaze(lat: number, lng: number): boolean;
  /** Plays a local file as navigation guidance, ducking other audio. Resolves false if replaced or interrupted. */
  playVoiceNote(uri: string, volume: number): Promise<boolean>;
  stopVoiceNote(): Promise<void>;
  /** Lowers every other app's audio (Waze, Maps, Spotify) until restoreOthers(). Used around spoken alerts. */
  duckOthers(): Promise<boolean>;
  /** Gives the volume back to the other apps. Safe to call when nothing is ducked. */
  restoreOthers(): Promise<void>;
}

/** Android only; null on iOS, web, in Expo Go and in tests, where callers fall back to JS. */
export const BoaRouteDrive = requireOptionalNativeModule<BoaRouteDriveModule>('BoaRouteDrive');
