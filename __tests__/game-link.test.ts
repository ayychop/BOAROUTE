import {
  gameIdFor,
  linkProblemMessage,
  normaliseGameUrl,
  parseOgImage,
  resolveImageUrl,
  sniffImageType,
  titleFromDomain,
  urlKey,
} from '../src/lib/game-link';

describe('pasted game links', () => {
  it('tidies whatever was pasted into a clean https link', () => {
    expect(normaliseGameUrl('krunker.io')).toEqual({ ok: true, url: 'https://krunker.io/', host: 'krunker.io' });
    expect(normaliseGameUrl('  https://venge.io/play?mode=ffa  ')).toEqual({ ok: true, url: 'https://venge.io/play?mode=ffa', host: 'venge.io' });
    expect(normaliseGameUrl('HTTP://Shellshock.IO/')).toEqual({ ok: true, url: 'https://shellshock.io/', host: 'shellshock.io' });
    // Share sheets add words after the link; only the link counts.
    expect(normaliseGameUrl('https://polytrack.org/ check this out')).toMatchObject({ ok: true, url: 'https://polytrack.org/' });
    expect(normaliseGameUrl('https://krunker.io#top')).toMatchObject({ ok: true, url: 'https://krunker.io/' });
    expect(normaliseGameUrl('example.com:8080/x')).toMatchObject({ ok: true, url: 'https://example.com:8080/x' });
    expect(normaliseGameUrl('https://example.com:443/x')).toMatchObject({ ok: true, url: 'https://example.com/x' });
  });

  it('refuses links that are empty, not web addresses, or only mean something on one network', () => {
    expect(normaliseGameUrl('   ')).toEqual({ ok: false, reason: 'empty' });
    for (const bad of ['javascript:alert(1)', 'ftp://files.example.com/a', 'file:///sdcard/a.html', 'https://user:pw@example.com/', 'not a url', 'a.b', 'https://exa mple.com']) {
      expect(normaliseGameUrl(bad).ok).toBe(false);
    }
    for (const local of ['localhost:3000', 'http://192.168.1.20/game', 'https://10.0.0.1', 'https://nas.local/game', 'intranet']) {
      expect(normaliseGameUrl(local)).toEqual({ ok: false, reason: 'private' });
    }
    expect(linkProblemMessage('empty')).toMatch(/paste/i);
    expect(linkProblemMessage('private')).toMatch(/network/i);
    expect(linkProblemMessage('invalid')).toMatch(/not a valid link/i);
  });

  it('gives the same key and id however the same site was typed', () => {
    const same = ['krunker.io', 'https://krunker.io', 'http://www.krunker.io/', 'HTTPS://KRUNKER.IO/#play'];
    expect(new Set(same.map(urlKey)).size).toBe(1);
    expect(new Set(same.map(gameIdFor)).size).toBe(1);
    expect(gameIdFor('https://krunker.io')).toMatch(/^web-[0-9a-f]{8}$/);
    expect(gameIdFor('https://krunker.io')).not.toBe(gameIdFor('https://venge.io'));
    expect(urlKey('https://a.com/x')).not.toBe(urlKey('https://a.com/y'));
  });
});

describe('naming a game from its domain', () => {
  it('uses the main label of the domain, in title case', () => {
    expect(titleFromDomain('krunker.io')).toBe('Krunker');
    expect(titleFromDomain('www.venge.io')).toBe('Venge');
    expect(titleFromDomain('london-street-football.com')).toBe('London Street Football');
    expect(titleFromDomain('play.example.com')).toBe('Example');
  });

  it('looks past shared hosting suffixes to the name before them', () => {
    expect(titleFromDomain('cod-webports.pages.dev')).toBe('Cod Webports');
    expect(titleFromDomain('someone.github.io')).toBe('Someone');
    expect(titleFromDomain('www.cool_games.co.uk')).toBe('Cool Games');
    expect(titleFromDomain('')).toBe('Game');
  });
});

describe('finding cover art', () => {
  const page = 'https://example.com/games/play?x=1';

  it('reads og:image whichever way round the attributes are', () => {
    expect(parseOgImage('<head><meta property="og:image" content="https://cdn.example.com/a.jpg"></head>', page)).toBe('https://cdn.example.com/a.jpg');
    expect(parseOgImage("<meta content='https://cdn.example.com/b.png' property='og:image' />", page)).toBe('https://cdn.example.com/b.png');
    expect(parseOgImage('<META PROPERTY=og:image CONTENT=https://cdn.example.com/c.webp>', page)).toBe('https://cdn.example.com/c.webp');
  });

  it('prefers the secure og:image, then falls back to twitter:image', () => {
    const both = '<meta name="twitter:image" content="https://t.example.com/t.jpg"><meta property="og:image" content="https://o.example.com/o.jpg"><meta property="og:image:secure_url" content="https://s.example.com/s.jpg">';
    expect(parseOgImage(both, page)).toBe('https://s.example.com/s.jpg');
    expect(parseOgImage('<meta name="twitter:image" content="https://t.example.com/t.jpg">', page)).toBe('https://t.example.com/t.jpg');
  });

  it('resolves relative links against the page and decodes entities', () => {
    expect(parseOgImage('<meta property="og:image" content="/img/cover.jpg">', page)).toBe('https://example.com/img/cover.jpg');
    expect(parseOgImage('<meta property="og:image" content="cover.jpg">', page)).toBe('https://example.com/games/cover.jpg');
    expect(parseOgImage('<meta property="og:image" content="//cdn.example.com/c.jpg">', page)).toBe('https://cdn.example.com/c.jpg');
    expect(parseOgImage('<meta property="og:image" content="https://cdn.example.com/c.jpg?a=1&amp;b=2">', page)).toBe('https://cdn.example.com/c.jpg?a=1&b=2');
    expect(resolveImageUrl('http://cdn.example.com/c.jpg', page)).toBe('https://cdn.example.com/c.jpg');
  });

  it('returns null when there is no usable image, and never a script or inline data', () => {
    expect(parseOgImage('<html><head><title>x</title></head></html>', page)).toBeNull();
    expect(parseOgImage('<meta property="og:title" content="A game">', page)).toBeNull();
    expect(parseOgImage('<meta property="og:image" content="">', page)).toBeNull();
    expect(parseOgImage('<meta property="og:image" content="javascript:alert(1)">', page)).toBeNull();
    expect(parseOgImage('<meta property="og:image" content="data:image/png;base64,AAAA">', page)).toBeNull();
    expect(parseOgImage('', page)).toBeNull();
  });
});

describe('telling images from error pages', () => {
  it('recognises JPEG, PNG, GIF and WebP by their first bytes', () => {
    expect(sniffImageType([0xff, 0xd8, 0xff, 0xe0])).toEqual({ mime: 'image/jpeg', ext: 'jpg' });
    expect(sniffImageType([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])).toEqual({ mime: 'image/png', ext: 'png' });
    expect(sniffImageType([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])).toEqual({ mime: 'image/gif', ext: 'gif' });
    const webp = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(sniffImageType(webp)).toEqual({ mime: 'image/webp', ext: 'webp' });
  });

  it('rejects HTML, SVG, empty and truncated data', () => {
    const bytes = (s: string) => [...s].map((c) => c.charCodeAt(0));
    expect(sniffImageType(bytes('<!DOCTYPE html>'))).toBeNull();
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImageType([])).toBeNull();
    expect(sniffImageType([0xff, 0xd8])).toBeNull();
    // A RIFF container that is not WebP (a WAV, say).
    expect(sniffImageType([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])).toBeNull();
  });
});
