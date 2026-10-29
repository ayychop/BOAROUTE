import type { Ionicons } from '@expo/vector-icons';

export type HazardType = 'police' | 'speed_camera' | 'accident' | 'hazard';

export interface HazardReport {
  id: string;
  user_id: string;
  hazard_type: HazardType;
  latitude: number;
  longitude: number;
  is_active: boolean;
  created_at: string;
}

/** Reports older than this drop off the map. */
export const HAZARD_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export const HAZARD_TYPES: { type: HazardType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { type: 'police', label: 'Police', icon: 'shield', color: '#E5363B' },
  { type: 'speed_camera', label: 'Speed Camera', icon: 'camera', color: '#E3B565' },
  { type: 'accident', label: 'Accident', icon: 'car', color: '#F07F4F' },
  { type: 'hazard', label: 'Hazard', icon: 'warning', color: '#F0A35C' },
];

export function hazardMeta(type: HazardType) {
  return HAZARD_TYPES.find((h) => h.type === type) ?? HAZARD_TYPES[3];
}

/** Active and reported within the last two hours. */
export function isLiveHazard(h: Pick<HazardReport, 'is_active' | 'created_at'>, now = Date.now()): boolean {
  const t = new Date(h.created_at).getTime();
  return h.is_active && Number.isFinite(t) && now - t <= HAZARD_MAX_AGE_MS && t - now < 5 * 60_000;
}

/** "Just now", "12 min ago", "1 h 40 min ago". */
export function reportedAgo(createdAt: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - new Date(createdAt).getTime()) / 60_000));
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h} h ${r} min ago` : `${h} h ago`;
}
