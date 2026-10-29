import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import { CURATED_GAMES, isHtmlFileName, parseGameList, parseGameMonetize, pushRecent, titleFromFileName, type Game } from '@/lib/games';
import { getPref, setPref } from '@/lib/prefs';

const LIBRARY_PREF = 'games.library';
const RECENT_PREF = 'games.recent';
const DISCOVER_PREF = 'games.discover';
const FEED_URL = 'https://gamemonetize.com/feed.php?format=0&num=40';
const FEED_TIMEOUT_MS = 10_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function gamesDir(): Directory {
  const dir = new Directory(Paths.document, 'games');
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function loadLibrary(): Game[] {
  // Drop uploads whose file went missing (app data cleared, restored backup).
  return parseGameList(getPref(LIBRARY_PREF)).filter((g) => g.source !== 'local' || new File(g.url).exists);
}

function saveLibrary(list: Game[]) {
  setPref(LIBRARY_PREF, JSON.stringify(list));
}

export function loadRecent(): Game[] {
  return parseGameList(getPref(RECENT_PREF));
}

export function recordPlayed(game: Game): Game[] {
  const next = pushRecent(loadRecent(), game);
  setPref(RECENT_PREF, JSON.stringify(next));
  return next;
}

export type ImportResult = { ok: true; game: Game } | { ok: false; reason: 'canceled' | 'not-html' | 'too-big' | 'failed'; message?: string };

/** Lets the user pick a single-file HTML5 game and keeps a copy inside the app. */
export async function importGame(): Promise<ImportResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['text/html', 'application/xhtml+xml', 'application/octet-stream'], copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'canceled' };
  const asset = res.assets[0];
  if (!isHtmlFileName(asset.name)) return { ok: false, reason: 'not-html' };
  if ((asset.size ?? 0) > MAX_UPLOAD_BYTES) return { ok: false, reason: 'too-big' };
  try {
    const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const dest = new File(gamesDir(), `${id}.html`);
    await new File(asset.uri).copy(dest);
    const game: Game = {
      id,
      title: titleFromFileName(asset.name),
      url: dest.uri,
      thumb: null,
      description: 'Uploaded from this phone',
      category: 'My games',
      source: 'local',
      orientation: 'any',
      addedAt: new Date().toISOString(),
    };
    saveLibrary([game, ...loadLibrary()]);
    return { ok: true, game };
  } catch (e) {
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : undefined };
  }
}

export function removeGame(id: string): Game[] {
  const list = loadLibrary();
  const game = list.find((g) => g.id === id);
  if (game?.source === 'local') {
    try {
      new File(game.url).delete();
    } catch {
      // Already gone.
    }
  }
  const next = list.filter((g) => g.id !== id);
  saveLibrary(next);
  setPref(RECENT_PREF, JSON.stringify(loadRecent().filter((g) => g.id !== id)));
  return next;
}

export interface DiscoverPage {
  games: Game[];
  /** True when the feed couldn't be reached and saved or built-in games are shown instead. */
  offline: boolean;
}

function cachedDiscover(): Game[] {
  try {
    const raw = getPref(DISCOVER_PREF);
    return raw ? parseGameList(JSON.stringify((JSON.parse(raw) as { games?: unknown }).games ?? [])) : [];
  } catch {
    return [];
  }
}

/** One page of the GameMonetize feed, always followed by the built-in games; never throws. */
export async function fetchDiscover(page = 1, signal?: AbortSignal): Promise<DiscoverPage> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(`${FEED_URL}&page=${Math.max(1, Math.floor(page))}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const games = parseGameMonetize(await res.json());
    if (!games.length) throw new Error('Empty feed');
    if (page === 1) setPref(DISCOVER_PREF, JSON.stringify({ at: Date.now(), games }));
    return { games: page === 1 ? [...games, ...CURATED_GAMES] : games, offline: false };
  } catch {
    if (signal?.aborted) return { games: [], offline: false };
    return { games: page === 1 ? [...cachedDiscover(), ...CURATED_GAMES] : [], offline: true };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
