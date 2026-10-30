import type { HazardType } from './hazards';

/**
 * The one voice note per report: "Speed camera ahead". It plays once, as soon as
 * the report is inside this distance (about half a mile), which leaves time to
 * react at motorway speed. There is no second "passing" note.
 */
export const APPROACH_ALERT_M = 800;
/**
 * Fixes arrive every few seconds and a clip takes a moment to start, so the
 * threshold is brought forward by this much travel time. At 70 mph that is
 * about 19 m, keeping the note on the mark rather than after it.
 */
export const ALERT_LEAD_S = 0.6;
const MAX_LEAD_M = 40;

export type VoiceClip = 'camera_approaching' | 'police_approaching';

export interface VoiceCue {
  hazardId: string;
  clip: VoiceClip;
}

/** Reports already announced this trip. */
export type AlertLedger = Set<string>;

/** Which kinds of report may speak. Both default to on. */
export interface AlertToggles {
  cameras: boolean;
  police: boolean;
}

export const ALL_ALERTS_ON: AlertToggles = { cameras: true, police: true };

export function isVoiceAlertType(type: HazardType): type is 'speed_camera' | 'police' {
  return type === 'speed_camera' || type === 'police';
}

export function clipFor(type: 'speed_camera' | 'police'): VoiceClip {
  return type === 'speed_camera' ? 'camera_approaching' : 'police_approaching';
}

/** A stored on/off preference ("true" / "false"); anything else is the default. */
export function parseToggle(raw: string | null | undefined, fallback = true): boolean {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return fallback;
}

/** Whether a report type is switched on in the settings. */
export function alertAllowed(type: 'speed_camera' | 'police', toggles: AlertToggles): boolean {
  return type === 'speed_camera' ? toggles.cameras : toggles.police;
}

/** Metres to bring the threshold forward at this speed (m/s). Unknown or negative speed: none. */
export function leadMetres(speedMps: number | null | undefined): number {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps <= 0) return 0;
  return Math.min(MAX_LEAD_M, speedMps * ALERT_LEAD_S);
}

/**
 * The note to play for the closest report ahead, if any. A report gets exactly
 * one note, the first time it is inside APPROACH_ALERT_M (plus speed lead).
 * Nothing plays when its type is switched off, and nothing is recorded then, so
 * switching it on mid-trip still warns about reports yet to come.
 */
export function nextVoiceCue(
  ahead: { hazard: { id: string; hazard_type: HazardType }; distanceM: number } | null,
  ledger: AlertLedger,
  speedMps: number | null | undefined,
  toggles: AlertToggles = ALL_ALERTS_ON,
): VoiceCue | null {
  if (!ahead || !isVoiceAlertType(ahead.hazard.hazard_type)) return null;
  const { id, hazard_type: type } = ahead.hazard;
  if (!alertAllowed(type, toggles) || ledger.has(id)) return null;
  if (ahead.distanceM > APPROACH_ALERT_M + leadMetres(speedMps)) return null;
  return { hazardId: id, clip: clipFor(type) };
}

/** Records a played note so the report is never announced twice. */
export function recordCue(ledger: AlertLedger, cue: VoiceCue): void {
  ledger.add(cue.hazardId);
}

/** IDs already announced; the background watcher skips them for the rest of the trip. */
export function finishedIds(ledger: AlertLedger): ReadonlySet<string> {
  return ledger;
}

/** Spoken fallback when a clip cannot play. */
export function cuePhrase(clip: VoiceClip): string {
  return clip === 'camera_approaching' ? 'Speed camera ahead.' : 'Police reported ahead.';
}

/**
 * Clips that are recorded files in assets/sounds (your own voice). Police
 * alerts are not: they are spoken by the phone's default text-to-speech voice.
 */
export const RECORDED_CLIPS: readonly VoiceClip[] = ['camera_approaching'];

export function isRecordedClip(clip: VoiceClip): boolean {
  return RECORDED_CLIPS.includes(clip);
}

/**
 * Gain for the recorded camera note. Always full: the player is at maximum and
 * the phone's own volume decides how loud that is, like any navigation prompt.
 */
export const CAMERA_CLIP_VOLUME = 1;

/** Spoken alert volume pref (police, turn-by-turn), 0 to 1. Default full. */
export function parseVolume(raw: string | null | undefined): number {
  const v = raw == null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}
