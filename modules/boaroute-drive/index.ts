import { requireOptionalNativeModule } from 'expo';

interface BoaRouteDriveModule {
  isAppInstalled(packageName: string): boolean;
  launchApp(packageName: string): boolean;
  launchEmail(): boolean;
  launchWaze(lat: number, lng: number): boolean;
  /** Plays a local file as navigation guidance, ducking other audio. Resolves false if replaced or interrupted. */
  playVoiceNote(uri: string, volume: number): Promise<boolean>;
  stopVoiceNote(): Promise<void>;
}

/** Android only; null on iOS, web, in Expo Go and in tests, where callers fall back to JS. */
export const BoaRouteDrive = requireOptionalNativeModule<BoaRouteDriveModule>('BoaRouteDrive');
