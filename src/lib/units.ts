import type { Profile } from './types';

/** Distance unit for every display. UK default: miles. Stored values stay in miles (trips, odometer) or metres (routes). */
export type DistanceUnit = 'mi' | 'km';

export const DEFAULT_UNIT: DistanceUnit = 'mi';
export const KM_PER_MILE = 1.609344;

export function unitFor(profile: Pick<Profile, 'distance_unit'> | null | undefined): DistanceUnit {
  return profile?.distance_unit === 'km' ? 'km' : DEFAULT_UNIT;
}

export function unitLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'km' : 'mi';
}

export function unitWord(unit: DistanceUnit): string {
  return unit === 'km' ? 'kilometres' : 'miles';
}

/** A stored miles figure (trips, odometer) in the chosen unit. */
export function milesIn(miles: number, unit: DistanceUnit): number {
  return unit === 'km' ? miles * KM_PER_MILE : miles;
}

/** A figure typed in the chosen unit, back to miles for storage. */
export function toMiles(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value / KM_PER_MILE : value;
}

/** Route distances: "4.2 mi" / "6.8 km", whole numbers from 10 up. */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const v = unit === 'km' ? km : km / KM_PER_MILE;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unitLabel(unit)}`;
}

/** A stored miles figure, formatted in the chosen unit with one decimal. */
export function formatMilesIn(miles: number, unit: DistanceUnit, decimals = 1): string {
  return `${milesIn(miles, unit).toFixed(decimals)} ${unitLabel(unit)}`;
}

/**
 * Turn-by-turn distances. Miles: yards up close, then miles (UK road signs).
 * Kilometres: metres up close, then kilometres.
 */
export function formatNavDistance(m: number, unit: DistanceUnit = DEFAULT_UNIT): string {
  if (unit === 'km') {
    if (m < 50) return 'now';
    if (m < 1000) return `${Math.round(m / (m < 300 ? 10 : 50)) * (m < 300 ? 10 : 50)} m`;
    const km = m / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  const yards = m * 1.09361;
  if (yards < 50) return 'now';
  if (yards < 400) return `${Math.round(yards / 10) * 10} yd`;
  const miles = m / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

/** "300 yd" becomes "300 yards" for the voice. */
export function spokenDistance(text: string): string {
  return text
    .replace(/(\d) yd$/, '$1 yards')
    .replace(/(\d) mi$/, '$1 miles')
    .replace(/(\d) km$/, '$1 kilometres')
    .replace(/(\d) m$/, '$1 metres');
}
