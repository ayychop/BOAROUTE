import { requireOptionalNativeModule, type NativeModule } from 'expo';

/**
 * Android Auto car screen (NavigationTemplate with BOAROUTE's own map) and the
 * co-pilot voice with audio ducking. Native code lives in android/; only
 * Android builds have it, so this is null on iOS, web, Expo Go and in tests.
 */

type Events = {
  onStartVisit: (e: { storeId: string }) => void;
  onEndVisit: () => void;
  onConnectionChange: (e: { connected: boolean }) => void;
};

declare class BoarouteCarModule extends NativeModule<Events> {
  /** JSON of CarDisplayState (src/car/car-state.ts). */
  setState(json: string): void;
  /** Route line as [lat, lng, lat, lng, ...]. */
  setPath(points: number[]): void;
  /** A short message on the car screen, e.g. "Visit started at Currys Thame". */
  toast(text: string): void;
  isConnected(): boolean;
  /** Plays res/raw/<name> with audio ducking. */
  playCue(name: string): void;
  /** Speaks a short warning with audio ducking. */
  speak(text: string): void;
}

export default requireOptionalNativeModule<BoarouteCarModule>('BoarouteCar');
