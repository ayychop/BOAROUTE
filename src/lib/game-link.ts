/**
 * Pure helpers for the Game Hub's + button: tidy a pasted link, name the game
 * from its domain, find its cover art (og:image) in the page's HTML, and tell
 * real images from error pages. Network and storage live in services/game-links.
 */

export type LinkProblem = 'empty' | 'invalid' | 'private';
export type ParsedLink = { ok: true; url: string; host: string } | { ok: false; reason: LinkProblem };

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const LOCAL_SUFFIX = /\.(local|localhost|internal|lan|home|corp|test|invalid)$/;

/** scheme://host[:port]/rest, https only (http is upgraded). */
function splitUrl(raw: string): { host: string; port: string; rest: string } | null {
  const m = /^https:\/\/([^/?#]*)([/?#].*)?$/i.exec(raw);
  if (!m) return null;
  const authority = m[1];
  if (!authority || authority.includes('@')) return null; // no credentials in links
  const hp = /^([^:]+)(?::(\d{1,5}))?$/.exec(authority);
  if (!hp) return null;
  return { host: hp[1].toLowerCase().replace(/\.$/, ''), port: hp[2] ?? '', rest: m[2] ?? '/' };
}

/**
 * "krunker.io", "http://x.com/play" or " https://x.com/play extra words " all
 * become a clean https link. Games only run over https, so http is upgraded.
 * Addresses that only mean something on one network (localhost, 192.168.x.x,
 * names without a dot) are refused.
 */
export function normaliseGameUrl(input: string): ParsedLink {
  const first = input.trim().split(/\s+/)[0] ?? '';
  if (!first) return { ok: false, reason: 'empty' };
  let raw = first;
  if (/^http:\/\//i.test(raw)) raw = `https://${raw.slice(7)}`;
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[a-z0-9.-]+:\d+/i.test(raw)) raw = `https://${raw}`;
  const parts = splitUrl(raw);
  if (!parts) return { ok: false, reason: 'invalid' };
  const { host, port, rest } = parts;
  if (!/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.includes('..')) return { ok: false, reason: 'invalid' };
  if (!host.includes('.') || IPV4.test(host) || LOCAL_SUFFIX.test(host)) return { ok: false, reason: 'private' };
  const tld = host.split('.').pop() ?? '';
  if (tld.length < 2 || /^\d+$/.test(tld)) return { ok: false, reason: 'invalid' };
  const noHash = rest.replace(/#.*$/, '');
  const url = `https://${host}${port && port !== '443' ? `:${port}` : ''}${noHash === '' ? '/' : noHash}`;
  return { ok: true, url, host };
}

/** Same page however it was typed: no www, no trailing slash, no scheme. */
export function urlKey(url: string): string {
  const parts = splitUrl(url.trim().replace(/^http:\/\//i, 'https://'));
  if (!parts) return url.trim().toLowerCase();
  const rest = parts.rest.replace(/#.*$/, '').replace(/\/+$/, '').replace(/^\/\?/, '?');
  return `${parts.host.replace(/^www\./, '')}${parts.port && parts.port !== '443' ? `:${parts.port}` : ''}${rest}`.toLowerCase();
}

/** Stable id for a pasted link, the same on every device. */
export function gameIdFor(url: string): string {
  let h = 0x811c9dc5;
  const key = urlKey(url);
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `web-${h.toString(16).padStart(8, '0')}`;
}

/** Suffixes where the name is the label before, e.g. cod-webports.pages.dev is "Cod Webports". */
const SHARED_SUFFIX = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.za', 'co.in',
  'pages.dev', 'workers.dev', 'github.io', 'gitlab.io', 'itch.io', 'netlify.app', 'vercel.app', 'web.app',
  'firebaseapp.com', 'glitch.me', 'onrender.com', 'herokuapp.com', 'replit.app', 'repl.co', 'surge.sh',
]);

/** "www.cool-games.co.uk" is "Cool Games"; "krunker.io" is "Krunker". */
export function titleFromDomain(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, '');
  const parts = h.split('.').filter(Boolean);
  if (parts.length === 0) return 'Game';
  let i = parts.length - 2;
  if (parts.length >= 3 && SHARED_SUFFIX.has(parts.slice(-2).join('.'))) i = parts.length - 3;
  const label = parts[Math.max(0, i)];
  const words = label.split(/[-_]+/).filter(Boolean);
  const title = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return (title || h).slice(0, 60);
}

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** An absolute https link from a possibly relative one, or null for anything else (data:, javascript:...). */
export function resolveImageUrl(href: string, pageUrl: string): string | null {
  const h = href.trim();
  if (!h || /^(data|javascript|blob|file|about):/i.test(h)) return null;
  if (/^https?:\/\//i.test(h)) return `https://${h.replace(/^https?:\/\//i, '')}`;
  const base = splitUrl(pageUrl.replace(/^http:\/\//i, 'https://'));
  if (!base) return null;
  const origin = `https://${base.host}${base.port ? `:${base.port}` : ''}`;
  if (h.startsWith('//')) return `https:${h}`;
  if (h.startsWith('/')) return `${origin}${h}`;
  const dir = base.rest.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
  return `${origin}${dir}${h.replace(/^\.\//, '')}`;
}

const IMAGE_META = ['og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'];

/** The cover art a site declares for link previews, as an absolute https link, or null. */
export function parseOgImage(html: string, pageUrl: string): string | null {
  const found = new Map<string, string>();
  const head = html.slice(0, 400_000);
  const tags = head.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const a = attributes(tag);
    const key = (a.property ?? a.name ?? '').toLowerCase();
    if (IMAGE_META.includes(key) && a.content && !found.has(key)) found.set(key, a.content);
  }
  for (const key of IMAGE_META) {
    const href = found.get(key);
    const abs = href ? resolveImageUrl(href, pageUrl) : null;
    if (abs) return abs;
  }
  return null;
}

export type CoverType = { mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; ext: 'jpg' | 'png' | 'webp' | 'gif' };

/** What the bytes really are. Error pages and SVGs (which can carry scripts) come back null. */
export function sniffImageType(bytes: ArrayLike<number>): CoverType | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38) return { mime: 'image/gif', ext: 'gif' };
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** Covers bigger than this are skipped; link previews are never this large. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export function linkProblemMessage(reason: LinkProblem): string {
  switch (reason) {
    case 'empty':
      return 'Paste a game link first.';
    case 'private':
      return 'That looks like an address on your own network. Paste a public link such as https://krunker.io.';
    default:
      return 'That is not a valid link. Try something like https://krunker.io.';
  }
}
