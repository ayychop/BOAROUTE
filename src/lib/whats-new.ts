import type { Ionicons } from '@expo/vector-icons';

export interface ReleaseHighlight {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}

export interface Release {
  /** Change this with every release that has notes; the popup shows once per id on each device. */
  id: string;
  title: string;
  highlights: ReleaseHighlight[];
}

/** Shown once after installing or updating to this version. */
export const CURRENT_RELEASE: Release = {
  id: '2026-10-26',
  title: 'Fresh off the line',
  highlights: [
    { icon: 'timer', title: 'Timed store visits', body: 'Tap Start Visit when you walk in. Complete it after 25 minutes, with a live countdown on the button.' },
    { icon: 'alarm', title: 'One-hour clock-out alarm', body: 'At an hour in store a premium chime and buzz tell you to clock out. Silence it with Continue visit or Clock out.' },
    { icon: 'calendar', title: 'Shift calendar', body: 'Tap the exact dates you work. Your Hub and route now follow your real shifts, not a weekly pattern.' },
    { icon: 'color-palette', title: 'Map & car style', body: 'Pick your car indicator and route trail colour. Motorways now stand out bold on the map.' },
    { icon: 'car-sport', title: 'Your car, your plate', body: 'Type your make, model and registration. Your name rides on the number plate.' },
    { icon: 'stats-chart', title: 'Visit time in reports', body: 'End-of-month reports show your average time per store and across every visit.' },
    { icon: 'flame', title: 'Daily motivation', body: 'A new quote on your Hub every day, plus longer reads under Me > Premium Motivation.' },
  ],
};

export const WHATS_NEW_PREF = 'whatsNew.seen';

/** True when this device has not dismissed the current release's notes yet. */
export function shouldShowWhatsNew(seenId: string | null, release: Release = CURRENT_RELEASE): boolean {
  return release.highlights.length > 0 && seenId !== release.id;
}
