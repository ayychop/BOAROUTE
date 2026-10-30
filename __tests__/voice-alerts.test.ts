import {
  ALERT_LEAD_S,
  ALL_ALERTS_ON,
  APPROACH_ALERT_M,
  CAMERA_CLIP_VOLUME,
  alertAllowed,
  clipFor,
  cuePhrase,
  finishedIds,
  isVoiceAlertType,
  leadMetres,
  nextVoiceCue,
  parseToggle,
  parseVolume,
  recordCue,
  type AlertLedger,
} from '../src/lib/voice-alerts';

const camera = (id: string, distanceM: number) => ({ hazard: { id, hazard_type: 'speed_camera' as const }, distanceM });
const police = (id: string, distanceM: number) => ({ hazard: { id, hazard_type: 'police' as const }, distanceM });

describe('single approaching camera alert', () => {
  it('triggers at 800 m: about half a mile, well short of a mile', () => {
    expect(APPROACH_ALERT_M).toBe(800);
    expect(APPROACH_ALERT_M).toBeGreaterThanOrEqual(0.49 * 1609.344);
    expect(APPROACH_ALERT_M).toBeLessThanOrEqual(1609.344);
  });

  it('plays camera_approaching once inside 800 m and never again', () => {
    const ledger: AlertLedger = new Set();
    expect(nextVoiceCue(camera('c', 950), ledger, 0)).toBeNull();

    const cue = nextVoiceCue(camera('c', 790), ledger, 0);
    expect(cue).toEqual({ hazardId: 'c', clip: 'camera_approaching' });
    recordCue(ledger, cue!);

    // Closer, level with it, nothing more: there is no passing note.
    for (const d of [500, 100, 20]) expect(nextVoiceCue(camera('c', d), ledger, 0)).toBeNull();
    expect(finishedIds(ledger)).toEqual(new Set(['c']));
  });

  it('plays the approaching note even for a report first seen up close', () => {
    expect(nextVoiceCue(camera('late', 60), new Set(), 0)?.clip).toBe('camera_approaching');
  });

  it('has no passing clip anywhere', () => {
    expect(clipFor('speed_camera')).toBe('camera_approaching');
    expect(clipFor('police')).toBe('police_approaching');
    expect(cuePhrase('camera_approaching')).not.toMatch(/passing/i);
    expect(cuePhrase('police_approaching')).not.toMatch(/passing/i);
  });

  it('uses the police clip for police reports', () => {
    expect(nextVoiceCue(police('p', 700), new Set(), 0)?.clip).toBe('police_approaching');
  });

  it('ignores other hazard types and nothing ahead', () => {
    expect(nextVoiceCue({ hazard: { id: 'a', hazard_type: 'accident' }, distanceM: 100 }, new Set(), 0)).toBeNull();
    expect(nextVoiceCue(null, new Set(), 10)).toBeNull();
    expect(isVoiceAlertType('accident')).toBe(false);
    expect(isVoiceAlertType('police')).toBe(true);
  });

  it('brings the threshold forward with speed so the note lands on the mark', () => {
    // 30 m/s (about 67 mph) gives 18 m of lead: 815 m is already inside the window.
    expect(nextVoiceCue(camera('c', 815), new Set(), 30)?.clip).toBe('camera_approaching');
    expect(nextVoiceCue(camera('c', 815), new Set(), 0)).toBeNull();
    expect(leadMetres(30)).toBeCloseTo(30 * ALERT_LEAD_S);
  });

  it('caps the lead and tolerates unknown speed', () => {
    expect(leadMetres(100)).toBe(40);
    expect(leadMetres(null)).toBe(0);
    expect(leadMetres(-3)).toBe(0);
    expect(leadMetres(NaN)).toBe(0);
  });

  it('keeps a separate history per report', () => {
    const ledger: AlertLedger = new Set();
    recordCue(ledger, nextVoiceCue(camera('one', 400), ledger, 0)!);
    expect(nextVoiceCue(camera('two', 400), ledger, 0)?.hazardId).toBe('two');
  });
});

describe('camera alerts toggle', () => {
  it('is on unless explicitly switched off', () => {
    expect(parseToggle(null)).toBe(true);
    expect(parseToggle('nonsense')).toBe(true);
    expect(parseToggle('true')).toBe(true);
    expect(parseToggle('false')).toBe(false);
    expect(parseToggle(undefined, false)).toBe(false);
  });

  it('plays nothing for a camera when cameras are off, and does not use up the report', () => {
    const ledger: AlertLedger = new Set();
    const off = { ...ALL_ALERTS_ON, cameras: false };
    expect(nextVoiceCue(camera('c', 300), ledger, 0, off)).toBeNull();
    expect(ledger.size).toBe(0);
    // Switching it back on mid-trip still warns.
    expect(nextVoiceCue(camera('c', 300), ledger, 0, ALL_ALERTS_ON)?.clip).toBe('camera_approaching');
  });

  it('leaves police alone when only cameras are off, and the other way round', () => {
    expect(nextVoiceCue(police('p', 300), new Set(), 0, { cameras: false, police: true })?.clip).toBe('police_approaching');
    expect(nextVoiceCue(police('p', 300), new Set(), 0, { cameras: true, police: false })).toBeNull();
    expect(alertAllowed('speed_camera', { cameras: false, police: true })).toBe(false);
    expect(alertAllowed('police', { cameras: false, police: true })).toBe(true);
  });
});

describe('voice volume', () => {
  it('plays the recorded camera note at full gain', () => {
    expect(CAMERA_CLIP_VOLUME).toBe(1);
  });

  it('defaults spoken alerts to full and clamps to 0 to 1', () => {
    expect(parseVolume(null)).toBe(1);
    expect(parseVolume('nonsense')).toBe(1);
    expect(parseVolume('0.4')).toBe(0.4);
    expect(parseVolume('7')).toBe(1);
    expect(parseVolume('-2')).toBe(0);
  });
});
