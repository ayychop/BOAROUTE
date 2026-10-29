import type { HazardType } from './hazards';

/** First voice note: "Speed camera ahead, 500 metres". */
export const APPROACH_ALERT_M = 500;
/** Second voice note as the driver goes past. */
export const PASSING_ALERT_M = 100;
/**
 * Fixes arrive every few seconds and a clip takes a moment to start, so each
 * threshold is brought forward by this much travel time. At 70 mph that is
 * about 19 m, keeping the note on the mark rather than after it.
 */
export const ALERT_LEAD_S = 0.6;
const MAX_LEAD_M = 40;

export type VoiceClip = 'camera_approaching' | 'camera_passing' | 'police_approaching' | 'police_passing';
export type AlertStage = 'approaching' | 'passing';

export interface VoiceCue {
  hazardId: string;
  stage: AlertStage;
  clip: VoiceClip;
}

/** Which notes each report has had this trip. */
export type AlertLedger = Map<string, Set<AlertStage>>;

export function isVoiceAlertType(type: HazardType): type is 'speed_camera' | 'police' {
  return type === 'speed_camera' || type === 'police';
}

export function clipFor(type: 'speed_camera' | 'police', stage: AlertStage): VoiceClip {
  return `${type === 'speed_camera' ? 'camera' : 'police'}_${stage}`;
}

/** Metres to bring a threshold forward at this speed (m/s). Unknown or negative speed: none. */
export function leadMetres(speedMps: number | null | undefined): number {
  if (speedMps == null || !Number.isFinite(speedMps) || speedMps <= 0) return 0;
  return Math.min(MAX_LEAD_M, speedMps * ALERT_LEAD_S);
}

/**
 * The note to play for the closest report ahead, if any. Each report gets
 * "approaching" once inside 500 m and "passing" once inside 100 m. A report
 * first seen already inside 100 m (a fresh report, or a late fix) only gets
 * "passing": two notes back to back would talk over the road.
 */
export function nextVoiceCue(
  ahead: { hazard: { id: string; hazard_type: HazardType }; distanceM: number } | null,
  ledger: AlertLedger,
  speedMps: number | null | undefined,
): VoiceCue | null {
  if (!ahead || !isVoiceAlertType(ahead.hazard.hazard_type)) return null;
  const { id, hazard_type: type } = ahead.hazard;
  const done = ledger.get(id);
  if (done?.has('passing')) return null;
  const lead = leadMetres(speedMps);
  const d = ahead.distanceM;
  if (d <= PASSING_ALERT_M + lead) return { hazardId: id, stage: 'passing', clip: clipFor(type, 'passing') };
  if (d <= APPROACH_ALERT_M + lead && !done?.has('approaching')) return { hazardId: id, stage: 'approaching', clip: clipFor(type, 'approaching') };
  return null;
}

/** Records a played note. Passing implies approaching, so it is never played afterwards. */
export function recordCue(ledger: AlertLedger, cue: VoiceCue): void {
  const done = ledger.get(cue.hazardId) ?? new Set<AlertStage>();
  done.add('approaching');
  if (cue.stage === 'passing') done.add('passing');
  ledger.set(cue.hazardId, done);
}

/** IDs that have had both notes and can be ignored for the rest of the trip. */
export function finishedIds(ledger: AlertLedger): Set<string> {
  const out = new Set<string>();
  for (const [id, done] of ledger) if (done.has('passing')) out.add(id);
  return out;
}

/** Spoken fallback when a clip cannot play. */
export function cuePhrase(clip: VoiceClip): string {
  switch (clip) {
    case 'camera_approaching':
      return 'Speed camera ahead. 500 metres.';
    case 'camera_passing':
      return 'Passing the speed camera now.';
    case 'police_approaching':
      return 'Police reported ahead. 500 metres.';
    case 'police_passing':
      return 'Passing the police report now.';
  }
}

/** Voice note volume pref, 0 to 1. Default 0.9 so notes sit just above Waze/Spotify. */
export function parseVolume(raw: string | null | undefined): number {
  const v = raw == null ? NaN : Number(raw);
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.9;
}
