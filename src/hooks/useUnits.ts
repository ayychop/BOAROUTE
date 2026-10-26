import { useMemo } from 'react';
import { formatDistance, formatMilesIn, formatNavDistance, milesIn, toMiles, unitFor, unitLabel, unitWord } from '@/lib/units';
import { useAuth } from '@/providers/AuthProvider';

/** The signed-in person's distance unit (Me > Distance units), with formatters bound to it. */
export function useUnits() {
  const { profile } = useAuth();
  const unit = unitFor(profile);
  return useMemo(
    () => ({
      unit,
      label: unitLabel(unit),
      word: unitWord(unit),
      /** Route distance in km. */
      distance: (km: number) => formatDistance(km, unit),
      /** Turn-by-turn distance in metres. */
      nav: (m: number) => formatNavDistance(m, unit),
      /** Stored miles (trips, odometer) shown in the unit. */
      miles: (mi: number, decimals = 1) => formatMilesIn(mi, unit, decimals),
      milesValue: (mi: number) => milesIn(mi, unit),
      toMiles: (v: number) => toMiles(v, unit),
    }),
    [unit],
  );
}
