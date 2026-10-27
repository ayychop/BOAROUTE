import BoarouteCar from '../../modules/boaroute-car';
import type { LngLat } from '../../supabase/functions/_shared/route-analysis';
import { EMPTY_CAR_CONTEXT, carDisplayState, carPath, type CarContext, type CarHazard, type CarNavState, type CarPosition } from './car-state';

/**
 * JS side of the Android Auto car app. The native CarAppService, the
 * NavigationTemplate screen and the map renderer are in modules/boaroute-car;
 * this keeps them fed with the phone's route, visit and position, and hands
 * the car's Start Visit / End Visit presses to whoever registered for them
 * (CarBridge). Only Android has the native module, so everything here is a
 * no-op on iOS, web, Expo Go and in tests.
 */

let navState: CarNavState | null = null;
let context: CarContext = EMPTY_CAR_CONTEXT;
let metric = false;
let position: CarPosition | null = null;
let hazards: CarHazard[] = [];
let lastSent = '';

let startVisitHandler: ((storeId: string) => void) | null = null;
let endVisitHandler: (() => void) | null = null;
const connectionHandlers = new Set<(connected: boolean) => void>();
let subscribed = false;

/** The native side skips redraws when only the map moved; this skips identical sends. */
function push() {
  if (!BoarouteCar) return;
  const json = JSON.stringify(carDisplayState(navState, context, { metric, position, hazards }));
  if (json === lastSent) return;
  lastSent = json;
  BoarouteCar.setState(json);
}

export const CarAppService = {
  /** Call once at launch: wires the car's buttons and connection events. */
  start() {
    if (!BoarouteCar || subscribed) return;
    subscribed = true;
    BoarouteCar.addListener('onStartVisit', ({ storeId }) => startVisitHandler?.(storeId));
    BoarouteCar.addListener('onEndVisit', () => endVisitHandler?.());
    BoarouteCar.addListener('onConnectionChange', ({ connected }) => connectionHandlers.forEach((h) => h(connected)));
    push();
  },

  /** True while Android Auto has BOAROUTE's car app open. */
  isConnected(): boolean {
    return BoarouteCar?.isConnected() ?? false;
  },

  /** Shows the live route on the car. Safe to call on every GPS fix. */
  showRoute(state: CarNavState) {
    navState = state;
    push();
  },

  /** The route line for the car map; call when the route (not the position) changes. */
  setPath(geometry: LngLat[]) {
    BoarouteCar?.setPath(carPath(geometry));
  },

  /** Navigation ended on the phone: idle screen, line off the map. */
  clear() {
    navState = null;
    BoarouteCar?.setPath([]);
    push();
  },

  setPosition(next: CarPosition | null) {
    position = next;
    push();
  },

  setHazards(next: CarHazard[]) {
    hazards = next;
    push();
  },

  setMetric(next: boolean) {
    metric = next;
    push();
  },

  /** The person's stores and visit state, kept current by CarBridge. */
  setContext(next: CarContext) {
    context = next;
    push();
  },

  /** A short message on the car screen. */
  toast(text: string) {
    BoarouteCar?.toast(text);
  },

  onStartVisit(handler: ((storeId: string) => void) | null) {
    startVisitHandler = handler;
  },

  onEndVisit(handler: (() => void) | null) {
    endVisitHandler = handler;
  },

  /** Returns an unsubscribe function. */
  onConnectionChange(handler: (connected: boolean) => void): () => void {
    connectionHandlers.add(handler);
    return () => connectionHandlers.delete(handler);
  },
};
