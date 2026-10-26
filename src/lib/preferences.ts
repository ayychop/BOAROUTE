import type { Ionicons } from '@expo/vector-icons';
import type { CarIconId, Profile, RouteColorId, UserPreferences } from './types';

export interface CarIconOption {
  id: CarIconId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Arrow-style icons point up and turn with the car's heading. */
  rotates: boolean;
}

/** Location markers for the in-app navigator. */
export const CAR_ICONS: CarIconOption[] = [
  { id: 'car-sport', label: 'Sport', icon: 'car-sport', rotates: false },
  { id: 'car', label: 'Saloon', icon: 'car', rotates: false },
  { id: 'arrow', label: 'Arrow', icon: 'navigate', rotates: true },
  { id: 'diamond', label: 'Diamond', icon: 'diamond', rotates: false },
  { id: 'bolt', label: 'Bolt', icon: 'flash', rotates: false },
  { id: 'star', label: 'Star', icon: 'star', rotates: false },
];

export interface RouteColorOption {
  id: RouteColorId;
  label: string;
  /** Six-digit hex, so an alpha suffix can be appended for the glow. */
  color: string;
}

/** Colours for the route trail while navigating. */
export const ROUTE_COLORS: RouteColorOption[] = [
  { id: 'gold', label: 'BOA Gold', color: '#E8CF94' },
  { id: 'neon-blue', label: 'Neon Blue', color: '#3FC8FF' },
  { id: 'violet', label: 'Electric Violet', color: '#B18CFF' },
  { id: 'emerald', label: 'Emerald', color: '#3DDC97' },
  { id: 'rose-gold', label: 'Rose Gold', color: '#F2A88F' },
  { id: 'platinum', label: 'Platinum', color: '#E4E7EC' },
];

export const DEFAULT_CAR_ICON: CarIconId = 'car-sport';
export const DEFAULT_ROUTE_COLOR: RouteColorId = 'gold';

export const MAX_MAKE_MODEL = 40;
export const MAX_REG = 8;
export const MAX_PLATE = 8;

/** The person's preferences with every unknown or missing value replaced by its default. */
export function prefsFor(profile: Pick<Profile, 'preferences'> | null | undefined): Required<Pick<UserPreferences, 'car_icon' | 'route_color'>> & UserPreferences {
  const p = profile?.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
  return {
    ...p,
    car_icon: CAR_ICONS.some((c) => c.id === p.car_icon) ? (p.car_icon as CarIconId) : DEFAULT_CAR_ICON,
    route_color: ROUTE_COLORS.some((c) => c.id === p.route_color) ? (p.route_color as RouteColorId) : DEFAULT_ROUTE_COLOR,
  };
}

export function carIconFor(id: CarIconId | undefined): CarIconOption {
  return CAR_ICONS.find((c) => c.id === id) ?? CAR_ICONS[0];
}

export function routeColorFor(id: RouteColorId | undefined): RouteColorOption {
  return ROUTE_COLORS.find((c) => c.id === id) ?? ROUTE_COLORS[0];
}

/** "ab12cde" -> "AB12 CDE"; anything else is upper-cased, trimmed and capped. */
export function formatReg(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const compact = clean.replace(/ /g, '');
  // Current UK format: two letters, two digits, three letters.
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(compact)) return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  return clean.slice(0, MAX_REG);
}

/** Plate text as typed: upper case, letters, digits and single spaces, at most 8 characters. */
export function cleanPlate(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').replace(/^ /, '').slice(0, MAX_PLATE);
}

/**
 * Font size that fits a plate's lettering into `width` without squashing it:
 * as big as the plate's height allows, stepping down only when the characters
 * would run out of room (KMKM25ML). Spaces count as narrow, like real plates.
 * `fill` is the share of the plate's height the letters may take.
 */
export function plateFontSize(label: string, width: number, height: number, fill = 0.7): number {
  const ems = [...label].reduce((sum, ch) => sum + (ch === ' ' ? 0.35 : 0.74), 0);
  return Math.min(height * fill, width / Math.max(ems, 1));
}

/** What the car's plate shows: their custom plate, or their first name when it's empty. */
export function displayPlate(profile: Pick<Profile, 'name' | 'email' | 'preferences'> | null | undefined): string {
  return cleanPlate(profile?.preferences?.custom_plate ?? '').trim() || plateName(profile?.name, profile?.email);
}

/** The name on the dynamic number plate: "SARAH", "JO". Falls back to the email's first part. */
export function plateName(name: string | null | undefined, email?: string | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] || (email ?? '').split('@')[0] || 'BOA';
  return first.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'BOA';
}
