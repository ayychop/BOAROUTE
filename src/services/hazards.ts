import { HAZARD_MAX_AGE_MS, HAZARD_TYPES, isLiveHazard, type HazardReport, type HazardType } from '@/lib/hazards';
import { supabase } from '@/lib/supabaseClient';

const COLUMNS = 'id,user_id,hazard_type,latitude,longitude,is_active,created_at';

/** Coordinates can arrive as strings from a numeric column; drop anything unusable. */
function normalise(row: HazardReport): HazardReport | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !HAZARD_TYPES.some((t) => t.type === row.hazard_type)) return null;
  return { ...row, latitude, longitude };
}

/** Active reports from the last two hours, newest first. */
export async function fetchLiveHazards(): Promise<HazardReport[]> {
  const since = new Date(Date.now() - HAZARD_MAX_AGE_MS).toISOString();
  const { data, error } = await supabase
    .from('hazard_reports')
    .select(COLUMNS)
    .eq('is_active', true)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return ((data ?? []) as HazardReport[])
    .map(normalise)
    .filter((h): h is HazardReport => !!h && isLiveHazard(h));
}

export async function reportHazard(type: HazardType, latitude: number, longitude: number): Promise<HazardReport> {
  const { data, error } = await supabase.from('hazard_reports').insert({ hazard_type: type, latitude, longitude }).select(COLUMNS).single();
  if (error) {
    // The database limits reports to 10 every 10 minutes.
    if (error.code === '42501') throw new Error('You have reported a lot in the last few minutes. Try again shortly.');
    throw error;
  }
  return normalise(data as HazardReport) ?? { ...(data as HazardReport), latitude, longitude };
}

/** Marks a report as no longer there. Returns false if someone already cleared it. */
export async function clearHazard(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('clear_hazard', { p_id: id });
  if (error) throw error;
  return data === true;
}
