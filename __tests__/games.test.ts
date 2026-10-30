import {
  CURATED_GAMES,
  PAD_KEYS,
  allowGameNavigation,
  buildEnhancerScript,
  isHtmlFileName,
  orientationFor,
  parseGameList,
  parseGameMessage,
  parseGameMonetize,
  pushRecent,
  titleFromFileName,
  type Game,
} from '../src/lib/games';

const feed = [
  { id: 11, title: 'Space Runner', url: 'https://html5.gamemonetize.com/abc/', thumb: 'https://img.gamemonetize.com/abc.jpg', description: 'Run!', category: 'Arcade', width: 800, height: 450 },
  { id: 11, title: 'Duplicate', url: 'https://html5.gamemonetize.com/abc/' },
  { id: 12, title: 'Insecure', url: 'http://example.com/game' },
  { id: 13, title: '', url: 'https://example.com/x' },
  { id: 14, title: 'Portrait', url: 'https://example.com/p/', width: 360, height: 640 },
  null,
  'junk',
];

describe('Discover feed', () => {
  it('keeps only games with a title and an https url, without duplicates', () => {
    const games = parseGameMonetize(feed);
    expect(games.map((g) => g.title)).toEqual(['Space Runner', 'Portrait']);
    expect(games[0]).toMatchObject({ id: 'gm-11', source: 'web', orientation: 'landscape', thumb: 'https://img.gamemonetize.com/abc.jpg' });
    expect(games[1].orientation).toBe('portrait');
  });

  it('never throws on a bad payload', () => {
    expect(parseGameMonetize({ error: 'rate limited' })).toEqual([]);
    expect(parseGameMonetize(null)).toEqual([]);
    expect(parseGameMonetize('<html>')).toEqual([]);
  });

  it('ships built-in games that are all playable https links', () => {
    expect(CURATED_GAMES.length).toBeGreaterThanOrEqual(3);
    for (const g of CURATED_GAMES) expect(g.url.startsWith('https://')).toBe(true);
    expect(new Set(CURATED_GAMES.map((g) => g.id)).size).toBe(CURATED_GAMES.length);
  });

  it('works out orientation from the size', () => {
    expect(orientationFor(1280, 720)).toBe('landscape');
    expect(orientationFor(360, 640)).toBe('portrait');
    expect(orientationFor(500, 500)).toBe('any');
    expect(orientationFor(0, 0)).toBe('any');
  });
});

describe('library', () => {
  const game = (id: string): Game => ({ id, title: id, url: `https://x/${id}`, thumb: null, description: '', category: 'Arcade', source: 'web', orientation: 'any' });

  it('names uploads from the file name', () => {
    expect(titleFromFileName('space_runner-v2.html')).toBe('Space Runner V2');
    expect(titleFromFileName('.html')).toBe('My game');
  });

  it('accepts only html files', () => {
    expect(isHtmlFileName('game.html')).toBe(true);
    expect(isHtmlFileName('GAME.HTM')).toBe(true);
    expect(isHtmlFileName('game.zip')).toBe(false);
    expect(isHtmlFileName('html')).toBe(false);
  });

  it('keeps recents newest first, de-duplicated and capped', () => {
    let list: Game[] = [];
    for (const id of ['a', 'b', 'c', 'a']) list = pushRecent(list, game(id));
    expect(list.map((g) => g.id)).toEqual(['a', 'c', 'b']);
    for (let i = 0; i < 20; i++) list = pushRecent(list, game(`n${i}`));
    expect(list).toHaveLength(12);
  });

  it('drops corrupt saved entries and non-https/file urls', () => {
    const raw = JSON.stringify([game('ok'), { id: 'x' }, { ...game('js'), url: 'javascript:alert(1)' }, { ...game('file'), url: 'file:///games/a.html', source: 'local' }]);
    expect(parseGameList(raw).map((g) => g.id)).toEqual(['ok', 'file']);
    expect(parseGameList('{oops')).toEqual([]);
    expect(parseGameList(null)).toEqual([]);
  });
});

describe('crash isolation: game navigation', () => {
  it('lets a game stay on its own site', () => {
    expect(allowGameNavigation('https://a.com/game/', 'https://a.com/game/level2')).toBe(true);
    expect(allowGameNavigation('https://a.com/game/', 'about:blank')).toBe(true);
  });

  it('blocks top-frame jumps to other sites and insecure pages but not iframes', () => {
    expect(allowGameNavigation('https://a.com/game/', 'https://ads.example.net/click')).toBe(false);
    expect(allowGameNavigation('https://a.com/game/', 'http://a.com/game/')).toBe(false);
    expect(allowGameNavigation('https://a.com/game/', 'intent://evil#Intent;end')).toBe(false);
    expect(allowGameNavigation('https://a.com/game/', 'https://ads.example.net/frame', false)).toBe(true);
  });

  it('keeps uploaded files on their own file', () => {
    expect(allowGameNavigation('file:///docs/games/a.html', 'file:///docs/games/a.html')).toBe(true);
    expect(allowGameNavigation('file:///docs/games/a.html', 'file:///docs/games/b.html')).toBe(false);
    expect(allowGameNavigation('file:///docs/games/a.html', 'https://a.com/')).toBe(false);
  });
});

describe('game enhancer script', () => {
  it('is valid JavaScript with and without the upscaler', () => {
    expect(() => new Function(buildEnhancerScript({ upscale: true }))).not.toThrow();
    expect(() => new Function(buildEnhancerScript({ upscale: false }))).not.toThrow();
  });

  it('renders at 720p by default and clamps odd values', () => {
    expect(buildEnhancerScript({ upscale: true })).toContain('"renderHeight":720');
    expect(buildEnhancerScript({ upscale: true, renderHeight: 5 })).toContain('"renderHeight":360');
    expect(buildEnhancerScript({ upscale: true, sharpness: 9 })).toContain('"sharpness":1');
  });

  it('wires up upscaling, the gamepad and crash reporting', () => {
    const s = buildEnhancerScript({ upscale: true });
    expect(s).toContain('preserveDrawingBuffer');
    expect(s).toContain('getGamepads');
    expect(s).toContain('unhandledrejection');
    expect(s).toContain("t:'beat'");
    expect(s).toContain('texture2D');
  });

  it('maps the DualSense face buttons, shoulders and D-pad to keys', () => {
    expect(PAD_KEYS[0].key).toBe(' ');
    expect(PAD_KEYS[9].key).toBe('Enter');
    expect(PAD_KEYS[12].key).toBe('ArrowUp');
    expect(PAD_KEYS[15].key).toBe('ArrowRight');
  });
});

describe('messages from the game page', () => {
  it('parses known messages', () => {
    expect(parseGameMessage('{"t":"beat","fps":59.6,"enh":true}')).toEqual({ t: 'beat', fps: 60, enh: true, game: false });
    expect(parseGameMessage('{"t":"beat","fps":30,"enh":false,"game":true}')).toEqual({ t: 'beat', fps: 30, enh: false, game: true });
    expect(parseGameMessage('{"t":"error","msg":"boom"}')).toEqual({ t: 'error', msg: 'boom' });
    expect(parseGameMessage('{"t":"pad","id":"DualSense","on":true}')).toEqual({ t: 'pad', id: 'DualSense', on: true });
    expect(parseGameMessage('{"t":"enh","on":false,"why":"WebGL unavailable"}')).toEqual({ t: 'enh', on: false, why: 'WebGL unavailable' });
  });

  it('ignores anything else instead of crashing', () => {
    expect(parseGameMessage('not json')).toBeNull();
    expect(parseGameMessage('{"t":"hack"}')).toBeNull();
    expect(parseGameMessage('null')).toBeNull();
  });
});
