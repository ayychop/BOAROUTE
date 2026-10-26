import { Platform } from 'react-native';
import type { TemplateConfig } from 'react-native-car-projection';
import { ROOT_SCREEN, carTemplate, type CarListTemplate, type CarNavState } from './car-templates';

/**
 * JS side of the Android Auto car app. The native CarAppService and Session
 * come from react-native-car-projection (Kotlin, declared in the manifest by
 * its config plugin); they build the car screen from the template registered
 * here. This keeps that template in step with the phone's navigation.
 *
 * Only Android has the native module, so everything here is a no-op on iOS
 * and web, and in Expo Go.
 */

type CarProjection = typeof import('react-native-car-projection').default;

let cached: CarProjection | null | undefined;
function car(): CarProjection | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (Platform.OS !== 'android') return cached;
  try {
    // Loaded lazily so iOS, web and tests never touch the native module (it warns when missing).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = (require('react-native-car-projection') as { default: CarProjection }).default;
  } catch {
    cached = null;
  }
  return cached;
}

let lastSent = '';
let pending: CarListTemplate | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastAt = 0;

/** Android Auto rate-limits template refreshes, and GPS fixes arrive every second or so. */
const MIN_INTERVAL_MS = 2_000;

async function send(template: CarListTemplate) {
  const c = car();
  if (!c) return;
  const key = JSON.stringify(template);
  if (key === lastSent) return;
  lastSent = key;
  lastAt = Date.now();
  try {
    // Registering keeps the template for the next time the car connects;
    // updating redraws it if the car screen is showing now.
    // Our rows carry no press handlers, which the library's Action type insists on.
    await c.registerScreen({ name: ROOT_SCREEN, template: template as unknown as TemplateConfig });
    // Through JSON so no undefined fields reach the native map conversion.
    await c.updateScreen(ROOT_SCREEN, JSON.parse(key));
  } catch {
    // No car connected, or the head unit refused the update: the next change retries.
    lastSent = '';
  }
}

function schedule(template: CarListTemplate) {
  pending = template;
  if (timer) return;
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastAt));
  timer = setTimeout(() => {
    timer = null;
    const t = pending;
    pending = null;
    if (t) void send(t);
  }, wait);
}

export const CarAppService = {
  /** Call once at launch so the car never shows an empty screen while the app is running. */
  start() {
    const c = car();
    if (!c) return;
    c.startSession().catch(() => {});
    schedule(carTemplate(null));
  },

  /** Shows the live route on the car. Safe to call on every GPS fix. */
  showRoute(state: CarNavState) {
    schedule(carTemplate(state));
  },

  /** Navigation ended on the phone: back to the prompt. */
  clear() {
    schedule(carTemplate(null));
  },
};
