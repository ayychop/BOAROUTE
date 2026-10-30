import { File, Paths } from 'expo-file-system';
import {
  MAX_COVER_BYTES,
  gameIdFor,
  linkProblemMessage,
  normaliseGameUrl,
  parseOgImage,
  sniffImageType,
  titleFromDomain,
  urlKey,
  type CoverType,
} from '@/lib/game-link';
import { USER_GAME_CATEGORY, type Game } from '@/lib/games';
import { getPref, setPref } from '@/lib/prefs';
import { supabase } from '@/lib/supabaseClient';
import { addToLibrary, loadLibrary, saveLibrary } from './game-library';
import { TASK_MEDIA_BUCKET, signMedia } from './media';

/**
 * The Game Hub's + button. A pasted link becomes a game card: the title comes
 * from the domain, the cover is the page's og:image, saved in the private
 * Supabase bucket (<user id>/games/) and listed in public.game_library so it
 * follows the person to a new phone. Every step after the link check is
 * optional: no cover art, or no database table yet, still adds the game.
 */

const PAGE_TIMEOUT_MS = 8_000;
const COVER_TIMEOUT_MS = 12_000;
/** Covers are shown through links that last a week; they are re-signed whenever the Hub opens. */
const COVER_LINK_TTL_S = 7 * 24 * 3600;
const BROWSER_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

export type Page = { reachable: true; status: number; html: string; finalUrl: string } | { reachable: false };

/** The page's HTML, or reachable:false when the site cannot be contacted at all (a 403 or 404 still counts as reachable). */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<Page> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-GB,en;q=0.9' },
    });
    const type = res.headers.get('content-type') ?? '';
    const length = Number(res.headers.get('content-length') ?? 0);
    const readable = (!type || /html|xml|text/i.test(type)) && !(length > 3_000_000);
    return { reachable: true, status: res.status, html: readable ? await res.text() : '', finalUrl: res.url || url };
  } catch {
    return { reachable: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Downloads a cover and checks it really is a small image; anything else (error page, SVG, huge file) is dropped. */
async function downloadCover(coverUrl: string): Promise<{ bytes: ArrayBuffer; type: CoverType } | null> {
  const file = new File(Paths.cache, `cover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.tmp`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const download = File.downloadFileAsync(coverUrl, file, { idempotent: true, headers: { 'User-Agent': BROWSER_UA } });
    download.catch(() => {});
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), COVER_TIMEOUT_MS);
    });
    await Promise.race([download, timeout]);
    if (!file.exists || file.size > MAX_COVER_BYTES || file.size < 100) return null;
    const bytes = await file.arrayBuffer();
    const type = sniffImageType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
    return type ? { bytes, type } : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    try {
      if (file.exists) file.delete();
    } catch {
      // The cache is cleared by the OS anyway.
    }
  }
}

export type AddGameResult =
  | { ok: true; game: Game; duplicate: boolean; coverSaved: boolean; synced: boolean }
  | { ok: false; message: string };

/**
 * Adds a pasted link. `known` is every game already on screen, so a link that
 * is already there is reported instead of added twice.
 */
export async function addGameFromUrl(userId: string | null, input: string, known: readonly Game[], onStep?: (label: string) => void): Promise<AddGameResult> {
  const link = normaliseGameUrl(input);
  if (!link.ok) return { ok: false, message: linkProblemMessage(link.reason) };

  const key = urlKey(link.url);
  const already = known.find((g) => urlKey(g.url) === key) ?? loadLibrary().find((g) => urlKey(g.url) === key);
  if (already) return { ok: true, game: already, duplicate: true, coverSaved: !!already.coverPath, synced: true };

  onStep?.('Checking the link');
  const page = await fetchPage(link.url);
  if (!page.reachable) return { ok: false, message: `Could not reach ${link.host}. Check the link and your connection.` };

  const id = gameIdFor(link.url);
  let thumb: string | null = null;
  let coverPath: string | undefined;
  const ogUrl = page.html ? parseOgImage(page.html, page.finalUrl) : null;
  if (ogUrl) {
    onStep?.('Finding cover art');
    const cover = await downloadCover(ogUrl);
    if (cover) {
      thumb = ogUrl;
      if (userId) {
        onStep?.('Saving to your library');
        const path = `${userId}/games/${id}-${Math.random().toString(36).slice(2, 8)}.${cover.type.ext}`;
        const up = await supabase.storage.from(TASK_MEDIA_BUCKET).upload(path, cover.bytes, { contentType: cover.type.mime, upsert: false });
        if (!up.error) {
          coverPath = path;
          thumb = (await signMedia([path], COVER_LINK_TTL_S))[path] ?? ogUrl;
        }
      }
    }
  }

  const game: Game = {
    id,
    title: titleFromDomain(link.host),
    url: link.url,
    thumb,
    description: `Added from ${link.host}`,
    category: USER_GAME_CATEGORY,
    source: 'web',
    orientation: 'any',
    addedAt: new Date().toISOString(),
    ...(coverPath ? { coverPath } : {}),
  };
  addToLibrary(game);

  let synced = false;
  if (userId) {
    const { error } = await supabase
      .from('game_library')
      .upsert({ user_id: userId, url: link.url, title: game.title, domain: link.host, cover_path: coverPath ?? null }, { onConflict: 'user_id,url' });
    // Before the database update there is no table: the game still works on this phone.
    synced = !error;
  }
  return { ok: true, game, duplicate: false, coverSaved: !!coverPath, synced };
}

interface GameRow {
  url: string;
  title: string;
  domain: string;
  cover_path: string | null;
  created_at: string;
}

/**
 * Brings this person's saved links onto this phone (a new install gets them
 * back) and refreshes the cover links, which expire. Returns the library.
 * Never throws: offline or without the table it just returns what is local.
 */
export async function syncUserGames(userId: string): Promise<Game[]> {
  const local = loadLibrary();
  try {
    const { data, error } = await supabase
      .from('game_library')
      .select('url,title,domain,cover_path,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200);
    const rows = error || !data ? [] : (data as GameRow[]);

    const byId = new Map(local.map((g) => [g.id, g]));
    for (const r of rows) {
      const id = gameIdFor(r.url);
      const have = byId.get(id);
      if (have) {
        if (!have.coverPath && r.cover_path) byId.set(id, { ...have, coverPath: r.cover_path });
      } else {
        byId.set(id, {
          id,
          title: r.title,
          url: r.url,
          thumb: null,
          description: `Added from ${r.domain}`,
          category: USER_GAME_CATEGORY,
          source: 'web',
          orientation: 'any',
          addedAt: r.created_at,
          ...(r.cover_path ? { coverPath: r.cover_path } : {}),
        });
      }
    }

    const all = [...byId.values()];
    const paths = all.flatMap((g) => (g.coverPath ? [g.coverPath] : []));
    const signed = await signMedia(paths, COVER_LINK_TTL_S);
    const merged = all.map((g) => (g.coverPath && signed[g.coverPath] ? { ...g, thumb: signed[g.coverPath] } : g));
    if (rows.length || paths.length) saveLibrary(merged);
    return merged;
  } catch {
    return local;
  }
}

/** Forgets a saved link and its cover in Supabase. Best effort; the local copy is already gone. */
export async function removeCloudGame(userId: string, game: Pick<Game, 'url' | 'coverPath'>): Promise<void> {
  try {
    await supabase.from('game_library').delete().eq('user_id', userId).eq('url', game.url);
    if (game.coverPath) await supabase.storage.from(TASK_MEDIA_BUCKET).remove([game.coverPath]);
  } catch {
    // Nothing to clean up if the table or network is missing.
  }
}

const COVER_CACHE_PREF = 'games.covers';
const COVER_HIT_TTL_MS = 7 * 24 * 3600_000;
const COVER_MISS_TTL_MS = 24 * 3600_000;
type CoverCache = Record<string, { url: string | null; at: number }>;

function readCoverCache(): CoverCache {
  try {
    const raw = getPref(COVER_CACHE_PREF);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as CoverCache) : {};
  } catch {
    return {};
  }
}

/** Cover links found earlier for the built-in games, so Discover has art the moment it opens. */
export function cachedCovers(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, c] of Object.entries(readCoverCache())) if (c && typeof c.url === 'string' && /^https:\/\//.test(c.url)) out[id] = c.url;
  return out;
}

/**
 * Looks up the og:image of games that have no cover yet (three at a time) and
 * reports each as it is found. Misses are remembered for a day so a site that
 * blocks us is not asked again on every visit.
 */
export async function fetchMissingCovers(games: readonly Game[], onCover: (id: string, url: string) => void, signal?: AbortSignal): Promise<void> {
  const cache = readCoverCache();
  const now = Date.now();
  const todo = games.filter((g) => {
    const c = cache[g.id];
    return !g.thumb && !(c && now - c.at < (c.url ? COVER_HIT_TTL_MS : COVER_MISS_TTL_MS));
  });
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !signal?.aborted) {
      const g = todo[next++];
      const page = await fetchPage(g.url, signal);
      const url = page.reachable && page.html ? parseOgImage(page.html, page.finalUrl) : null;
      cache[g.id] = { url, at: Date.now() };
      if (url) onCover(g.id, url);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!signal?.aborted) setPref(COVER_CACHE_PREF, JSON.stringify(cache));
}
