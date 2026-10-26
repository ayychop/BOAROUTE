/**
 * The Android Auto screen, built from the phone's live navigation. Pure data in
 * the shape react-native-car-projection sends to the native Car App Library,
 * so it can be tested without a head unit.
 *
 * The library renders ListTemplate, PaneTemplate and MessageTemplate only (no
 * map surface), so the car shows the next manoeuvre, arrival and the stops as
 * a list, and the map stays on the phone. It is a single screen on purpose:
 * the library loses track of which screen is on top after the car's own Back
 * button, and live updates would then land on the wrong one.
 */

export const ROOT_SCREEN = 'root';

/** Android Auto caps lists at six rows while driving. */
export const MAX_CAR_ROWS = 6;

export interface CarNavState {
  /** Route title from the phone, e.g. "Tuesday route". */
  title: string;
  /** Next manoeuvre, already worded for speech and the phone banner. */
  instruction: string | null;
  /** Distance to that manoeuvre in the driver's units, e.g. "300 m". */
  distanceToNext: string | null;
  /** e.g. "14:32". */
  arrival: string;
  /** e.g. "25 min · 12.4 mi". */
  remaining: string;
  /** Stores still to visit, in order; the last is the destination. */
  stops: string[];
  arrived: boolean;
  rerouting: boolean;
}

export interface CarRow {
  title: string;
  texts?: string[];
}

export interface CarListTemplate {
  type: 'ListTemplate';
  title: string;
  items: CarRow[];
  /** "app_icon" is mapped to the car's standard app icon header. */
  headerAction: { title: 'app_icon' };
}

/** Car screens truncate long lines; keep titles readable at a glance. */
function clip(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function stopLabel(i: number, total: number): string {
  if (i === 0) return total === 1 ? 'Next · destination' : 'Next';
  return i === total - 1 ? 'Destination' : `Stop ${i + 1}`;
}

/** What the car shows: the live route while the phone navigates, a prompt otherwise. */
export function carTemplate(state: CarNavState | null): CarListTemplate {
  if (!state) {
    return {
      type: 'ListTemplate',
      title: 'BOAROUTE',
      items: [{ title: 'No active route', texts: ['Start navigation on your phone and your route appears here.'] }],
      headerAction: { title: 'app_icon' },
    };
  }

  const items: CarRow[] = [];
  const next = state.stops[0];
  if (state.arrived) {
    items.push({ title: clip(`Arrived${next ? ` at ${next}` : ''}`), texts: ['Route complete'] });
  } else {
    const turn = state.rerouting ? 'Rerouting…' : (state.instruction ?? `Continue to ${next ?? 'your destination'}`);
    items.push({ title: clip(turn, 80), texts: state.distanceToNext && !state.rerouting ? [state.distanceToNext] : undefined });
    items.push({ title: `Arrive ${state.arrival}`, texts: [state.remaining] });

    const room = MAX_CAR_ROWS - items.length;
    const shown = state.stops.length > room ? state.stops.slice(0, room - 1) : state.stops;
    shown.forEach((label, i) => items.push({ title: clip(label), texts: [stopLabel(i, state.stops.length)] }));
    const hidden = state.stops.length - shown.length;
    if (hidden > 0) items.push({ title: `+${hidden} more stops`, texts: [`Ending at ${clip(state.stops[state.stops.length - 1], 40)}`] });
  }

  return { type: 'ListTemplate', title: clip(state.title, 40), items, headerAction: { title: 'app_icon' } };
}
