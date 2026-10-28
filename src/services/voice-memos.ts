import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabaseClient';

const BUCKET = 'voice-memos';
const MAX_BYTES = 26214400; // 25 MB, matching the bucket limit.

export interface VoiceMemo {
  id: string;
  user_id: string;
  store_id: string | null;
  storage_path: string;
  duration_seconds: number | null;
  note: string | null;
  created_at: string;
}

/**
 * Uploads a recorded note to the private voice-memos bucket under the author's
 * own folder, then records the row the whole team can read. Returns the row.
 */
export async function uploadVoiceMemo(localUri: string, opts: { storeId?: string | null; durationSeconds?: number | null; note?: string | null } = {}): Promise<VoiceMemo> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error('Please sign in again.');

  const body = await new File(localUri).arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new Error('That memo is over 25 MB. Record a shorter note.');

  const path = `${uid}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.m4a`;
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'audio/m4a', upsert: false });
  if (up.error) throw new Error(`Upload failed: ${up.error.message}`);

  const { data, error } = await supabase
    .from('voice_memos')
    .insert({ storage_path: path, store_id: opts.storeId ?? null, duration_seconds: opts.durationSeconds ?? null, note: opts.note ?? null })
    .select('id,user_id,store_id,storage_path,duration_seconds,note,created_at')
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data as VoiceMemo;
}

/** Recent team memos, newest first; pass a store id to filter to one store. */
export async function fetchVoiceMemos(storeId?: string): Promise<VoiceMemo[]> {
  let q = supabase
    .from('voice_memos')
    .select('id,user_id,store_id,storage_path,duration_seconds,note,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (storeId) q = q.eq('store_id', storeId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as VoiceMemo[];
}

/** One-hour playback URLs for the given memo paths. */
export async function signVoiceMemos(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export async function deleteVoiceMemo(memo: Pick<VoiceMemo, 'id' | 'storage_path'>): Promise<void> {
  const { error } = await supabase.from('voice_memos').delete().eq('id', memo.id);
  if (error) throw error;
  await supabase.storage.from(BUCKET).remove([memo.storage_path]);
}
