import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabaseClient';
import { MAX_MEDIA_BYTES, TASK_MEDIA_BUCKET, type PickedMedia } from './media';

/** One row of public.visit_photos. */
export interface VisitPhoto {
  id: string;
  user_id: string;
  store_id: string;
  visit_id: string | null;
  path: string;
  taken_at: string;
}

const NEEDS_UPDATE = 'Visit photos need the latest database update. Ask your admin to run the All-In-One SQL file.';

function uniqueName(i: number, ext: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i + 1}.${ext}`;
}

/**
 * Saves photos taken at a store for good: the file under <user id>/visits/
 * in the private bucket, and a visit_photos row. The database links the row
 * to the visit when it is completed, and the monthly export embeds it.
 */
export async function uploadVisitPhotos(userId: string, storeId: string, photos: PickedMedia[], onProgress?: (done: number, total: number) => void): Promise<VisitPhoto[]> {
  const saved: VisitPhoto[] = [];
  for (let i = 0; i < photos.length; i++) {
    const m = photos[i];
    const ext = m.fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/visits/${uniqueName(i, ext)}`;
    const body = await new File(m.uri).arrayBuffer();
    if (body.byteLength > MAX_MEDIA_BYTES) throw new Error(`${m.fileName} is over 50 MB.`);
    const up = await supabase.storage.from(TASK_MEDIA_BUCKET).upload(path, body, { contentType: m.mimeType, upsert: false });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const { data, error } = await supabase.from('visit_photos').insert({ store_id: storeId, path, taken_at: new Date().toISOString() }).select('*').single();
    if (error) {
      await supabase.storage.from(TASK_MEDIA_BUCKET).remove([path]);
      throw new Error(/visit_photos/.test(error.message) ? NEEDS_UPDATE : error.message);
    }
    saved.push(data as VisitPhoto);
    onProgress?.(i + 1, photos.length);
  }
  return saved;
}

/** This person's visit photos taken in [from, to). RLS lets the admin read everyone's, so filter by owner. */
export async function fetchVisitPhotos(userId: string, from: Date, to: Date): Promise<VisitPhoto[]> {
  const { data, error } = await supabase
    .from('visit_photos')
    .select('*')
    .eq('user_id', userId)
    .gte('taken_at', from.toISOString())
    .lt('taken_at', to.toISOString())
    .order('taken_at', { ascending: true })
    .limit(500);
  if (error) {
    // Before the migration there is no table; the report just has no photos.
    if (/visit_photos/.test(error.message)) return [];
    throw error;
  }
  return (data ?? []) as VisitPhoto[];
}

export async function deleteVisitPhoto(photo: Pick<VisitPhoto, 'id' | 'path'>): Promise<void> {
  const { error } = await supabase.from('visit_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from(TASK_MEDIA_BUCKET).remove([photo.path]).catch(() => {});
}
