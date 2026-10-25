import { useEffect, useMemo, useState } from 'react';
import { geocode } from '@/lib/geo';
import { getPref, setPref } from '@/lib/prefs';
import type { LatLng } from '@/lib/types';

function readCachedPoint(location: string): LatLng | null {
  const cached = getPref(`start.${location.toUpperCase()}`);
  if (!cached) return null;
  try {
    const p = JSON.parse(cached);
    return Number.isFinite(p?.lat) && Number.isFinite(p?.lng) ? p : null;
  } catch {
    return null;
  }
}

/** The person's home postcode as a map point, geocoded once and cached on the device. */
export function useHomePoint(location: string | null | undefined) {
  const cached = useMemo(() => (location ? readCachedPoint(location) : null), [location]);
  // Geocode results are stored with the location they belong to.
  const [lookup, setLookup] = useState<{ location: string; point: LatLng | null } | null>(null);

  useEffect(() => {
    if (!location || cached) return;
    let alive = true;
    geocode(location).then((p) => {
      if (!alive) return;
      if (p) setPref(`start.${location.toUpperCase()}`, JSON.stringify(p));
      setLookup({ location, point: p });
    });
    return () => {
      alive = false;
    };
  }, [location, cached]);

  if (!location) return { point: null, error: 'Set your starting location in Me > Starting location.' };
  if (cached) return { point: cached, error: null };
  if (lookup?.location !== location) return { point: null, error: null };
  return lookup.point
    ? { point: lookup.point, error: null }
    : { point: null, error: `Could not locate "${location}". Check your connection or update your starting location.` };
}

