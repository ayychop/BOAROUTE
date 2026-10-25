import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabaseClient';

export const TASK_MEDIA_BUCKET = 'task-media';
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS = 6;

export interface PickedMedia {
  uri: string;
  kind: 'image' | 'video';
  mimeType: string;
  fileName: string;
  size: number | null;
}

function toPicked(a: ImagePicker.ImagePickerAsset): PickedMedia {
  const kind = a.type === 'video' || a.type === 'pairedVideo' ? 'video' : 'image';
  const ext = (a.fileName?.split('.').pop() ?? a.uri.split('.').pop() ?? (kind === 'video' ? 'mp4' : 'jpg')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const mimeType = a.mimeType ?? (kind === 'video' ? `video/${ext === 'mov' ? 'quicktime' : 'mp4'}` : `image/${ext === 'png' ? 'png' : ext === 'heic' ? 'heic' : 'jpeg'}`);
  return { uri: a.uri, kind, mimeType, fileName: a.fileName ?? `${kind}.${ext}`, size: a.fileSize ?? null };
}

/** Pick photos and videos from the gallery. Returns [] when cancelled. */
export async function pickFromLibrary(limit: number): Promise<PickedMedia[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, limit),
    quality: 0.7,
    videoMaxDuration: 120,
  });
  if (res.canceled) return [];
  return res.assets.map(toPicked);
}

/** Take a photo or a short video with the camera. */
export async function captureWithCamera(): Promise<PickedMedia[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. You can enable it in Settings.');
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.7, videoMaxDuration: 60 });
  if (res.canceled) return [];
  return res.assets.map(toPicked);
}

function folderId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Uploads into <user id>/<folder>/ so storage RLS lets only the owner read it. Returns object paths. */
export async function uploadTaskMedia(userId: string, media: PickedMedia[], onProgress?: (done: number, total: number) => void): Promise<string[]> {
  const folder = folderId();
  const paths: string[] = [];
  for (let i = 0; i < media.length; i++) {
    const m = media[i];
    if (m.size !== null && m.size > MAX_MEDIA_BYTES) throw new Error(`${m.fileName} is over 50 MB. Trim the video and try again.`);
    const ext = m.fileName.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (m.kind === 'video' ? 'mp4' : 'jpg');
    const path = `${userId}/${folder}/${i + 1}-${m.kind}.${ext}`;
    const body = await new File(m.uri).arrayBuffer();
    if (body.byteLength > MAX_MEDIA_BYTES) throw new Error(`${m.fileName} is over 50 MB. Trim the video and try again.`);
    const { error } = await supabase.storage.from(TASK_MEDIA_BUCKET).upload(path, body, { contentType: m.mimeType, upsert: false });
    if (error) {
      if (paths.length) await supabase.storage.from(TASK_MEDIA_BUCKET).remove(paths);
      throw new Error(`Upload failed: ${error.message}`);
    }
    paths.push(path);
    onProgress?.(i + 1, media.length);
  }
  return paths;
}

/** Time-limited URLs for private media (1 hour). */
export async function signMedia(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(TASK_MEDIA_BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return {};
  const out: Record<string, string> = {};
  for (const row of data) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export async function deleteMedia(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from(TASK_MEDIA_BUCKET).remove(paths);
}

export function isVideoPath(path: string): boolean {
  return /-video\.|\.(mp4|mov|m4v|3gp|webm|mkv)$/i.test(path);
}
