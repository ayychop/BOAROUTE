import {
  ALERT_LEAD_S,
  APPROACH_ALERT_M,
  PASSING_ALERT_M,
  clipFor,
  cuePhrase,
  finishedIds,
  isVoiceAlertType,
  leadMetres,
  nextVoiceCue,
  parseVolume,
  recordCue,
  type AlertLedger,
} from '../src/lib/voice-alerts';

const camera = (id: string, distanceM: number) => ({ hazard: { id, hazard_type: 'speed_camera' as const }, distanceM });
const police = (id: string, distanceM: number) => ({ hazard: { id, hazard_type: 'police' as const }, distanceM });

describe('two-stage voice alerts', () => {
  it('uses 500 m and 100 m', () => {
    expect(APPROACH_ALERT_M).toBe(500);
    expect(PASSING_ALERT_M).toBe(100);
  });

  it('plays approaching inside 500 m, then passing inside 100 m, once each', () => {
    const ledger: AlertLedger = new Map();
    expect(nextVoiceCue(camera('c', 620), ledger, 0)).toBeNull();

    const first = nextVoiceCue(camera('c', 480), ledger, 0);
    expect(first).toEqual({ hazardId: 'c', stage: 'approaching', clip: 'camera_approaching' });
    recordCue(ledger, first!);
    expect(nextVoiceCue(camera('c', 300), ledger, 0)).toBeNull();

    const second = nextVoiceCue(camera('c', 95), ledger, 0);
    expect(second).toEqual({ hazardId: 'c', stage: 'passing', clip: 'camera_passing' });
    recordCue(ledger, second!);
    expect(nextVoiceCue(camera('c', 20), ledger, 0)).toBeNull();
    expect(finishedIds(ledger)).toEqual(new Set(['c']));
  });

  it('plays only the passing note for a report first seen inside 100 m', () => {
    const ledger: AlertLedger = new Map();
    const cue = nextVoiceCue(camera('late', 60), ledger, 0);
    expect(cue?.stage).toBe('passing');
    recordCue(ledger, cue!);
    // Passing implies approaching: the earlier note never plays afterwards.
    expect(nextVoiceCue(camera('late', 450), ledger, 0)).toBeNull();
  });

  it('uses the police clips for police reports', () => {
    expect(nextVoiceCue(police('p', 400), new Map(), 0)?.clip).toBe('police_approaching');
    expect(nextVoiceCue(police('p', 50), new Map(), 0)?.clip).toBe('police_passing');
    expect(clipFor('police', 'passing')).toBe('police_passing');
  });

  it('ignores other hazard types and nothing ahead', () => {
    expect(nextVoiceCue({ hazard: { id: 'a', hazard_type: 'accident' }, distanceM: 100 }, new Map(), 0)).toBeNull();
    expect(nextVoiceCue(null, new Map(), 10)).toBeNull();
    expect(isVoiceAlertType('accident')).toBe(false);
    expect(isVoiceAlertType('police')).toBe(true);
  });

  it('brings the thresholds forward with speed so the note lands on the mark', () => {
    // 30 m/s (about 67 mph) gives 18 m of lead: 515 m is already inside the window.
    expect(nextVoiceCue(camera('c', 515), new Map(), 30)?.stage).toBe('approaching');
    expect(nextVoiceCue(camera('c', 515), new Map(), 0)).toBeNull();
    expect(leadMetres(30)).toBeCloseTo(30 * ALERT_LEAD_S);
  });

  it('caps the lead and tolerates unknown speed', () => {
    expect(leadMetres(100)).toBe(40);
    expect(leadMetres(null)).toBe(0);
    expect(leadMetres(-3)).toBe(0);
    expect(leadMetres(NaN)).toBe(0);
  });

  it('keeps a separate history per report', () => {
    const ledger: AlertLedger = new Map();
    recordCue(ledger, nextVoiceCue(camera('one', 400), ledger, 0)!);
    expect(nextVoiceCue(camera('two', 400), ledger, 0)?.hazardId).toBe('two');
  });

  it('has a spoken fallback for every clip', () => {
    for (const clip of ['camera_approaching', 'camera_passing', 'police_approaching', 'police_passing'] as const) {
      expect(cuePhrase(clip).length).toBeGreaterThan(5);
    }
  });
});

describe('voice volume', () => {
  it('defaults to 0.9 and clamps to 0 to 1', () => {
    expect(parseVolume(null)).toBe(0.9);
    expect(parseVolume('nonsense')).toBe(0.9);
    expect(parseVolume('0.4')).toBe(0.4);
    expect(parseVolume('7')).toBe(1);
    expect(parseVolume('-2')).toBe(0);
  });
});
