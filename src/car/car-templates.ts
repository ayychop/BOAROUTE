/**
 * The Android Auto screen, built from the phone's live navigation. Pure data in
 * the shape react-native-car-projection sends to the native Car App Library,
 * so it can be tested without a head unit. A Start Visit button in the action
 * strip starts the timed visit for the next store without touching the phone.
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

/** A button in the car's action strip. CarAppService turns storeId into the press handler. */
export interface CarAction {
  title: 'Start Visit';
  storeId: string;
}

export interface CarListTemplate {
  type: 'ListTemplate';
  title: string;
  items: CarRow[];
  /** "app_icon" is mapped to the car's standard app icon header. */
  headerAction: { title: 'app_icon' };
  actionStrip?: CarAction[];
}

/** A store still owed visits, for the car's idle screen. */
export interface CarStore {
  id: string;
  name: string;
  /** e.g. "Grade A · 2 visits to go". */
  detail: string;
}

/** What the phone knows about the person's stores, beyond the live route. */
export interface CarContext {
  /** Stores to visit next, most pressing first. */
  upcoming: CarStore[];
  /** Store id by name, so the next route stop can be started from the car. */
  storeIds: Record<string, string>;
  /** Name of the store being visited now, if a visit is running. */
  visiting: string | null;
}

export const EMPTY_CAR_CONTEXT: CarContext = { upcoming: [], storeIds: {}, visiting: null };

/** Car screens truncate long lines; keep titles readable at a glance. */
function clip(text: string, max = 60): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function stopLabel(i: number, total: number): string {
  if (i === 0) return total === 1 ? 'Next · destination' : 'Next';
  return i === total - 1 ? 'Destination' : `Stop ${i + 1}`;
}

function startVisit(storeId: string | undefined, ctx: CarContext): CarAction[] | undefined {
  return storeId && !ctx.visiting ? [{ title: 'Start Visit', storeId }] : undefined;
}

/** Without a route: the visit in progress, else "No active route" over the stores to visit next, with Start Visit for the first. */
function idleTemplate(ctx: CarContext): CarListTemplate {
  const header = { headerAction: { title: 'app_icon' as const } };
  if (ctx.visiting) {
    return { type: 'ListTemplate', title: 'BOAROUTE', items: [{ title: clip(`Visiting ${ctx.visiting}`), texts: ['Complete the visit on your phone.'] }], ...header };
  }
  if (ctx.upcoming.length === 0) {
    return { type: 'ListTemplate', title: 'BOAROUTE', items: [{ title: 'No active route', texts: ['Start navigation on your phone and your route appears here.'] }], ...header };
  }
  const items = ctx.upcoming.slice(0, MAX_CAR_ROWS).map((s, i) => ({ title: clip(s.name), texts: [i === 0 ? `Next · ${s.detail}` : s.detail] }));
  return { type: 'ListTemplate', title: 'No active route', items, ...header, actionStrip: startVisit(ctx.upcoming[0].id, ctx) };
}

/** What the car shows: the live route while the phone navigates, the upcoming stores otherwise. */
export function carTemplate(state: CarNavState | null, ctx: CarContext = EMPTY_CAR_CONTEXT): CarListTemplate {
  if (!state) return idleTemplate(ctx);

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

  const template: CarListTemplate = { type: 'ListTemplate', title: clip(state.title, 40), items, headerAction: { title: 'app_icon' } };
  const actions = startVisit(next ? ctx.storeIds[next] : undefined, ctx);
  return actions ? { ...template, actionStrip: actions } : template;
}
