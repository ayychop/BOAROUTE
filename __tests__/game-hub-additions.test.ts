import fs from 'fs';
import path from 'path';
import { urlKey } from '../src/lib/game-link';
import { FEATURED_GAMES, USER_GAME_CATEGORY, allowGameNavigation, isUserGame, sameSite } from '../src/lib/games';
import { RECORDED_CLIPS, isRecordedClip } from '../src/lib/voice-alerts';

describe('pre-populated Discover games', () => {
  // The links as given. Three more were asked for, but londonstreetfootball.com,
  // sanandreasstreetlegends.com and dudetheftauto.com do not resolve in DNS (checked 30 Oct 2026),
  // so they are left out rather than shown as dead tiles. Add them with the + button if they come back.
  const expected = [
    'https://rimrepublic.com',
    'https://basketbros.io',
    'https://polytrack.org',
    'https://dta6.com',
    'https://cod-webports.pages.dev/',
    'https://krunker.io',
    'https://venge.io',
    'https://shellshock.io',
  ];

  it('lists the live games with their exact links', () => {
    expect(FEATURED_GAMES.map((g) => g.url)).toEqual(expected);
  });

  it('has unique ids and sites, all web games that open in landscape', () => {
    expect(new Set(FEATURED_GAMES.map((g) => g.id)).size).toBe(FEATURED_GAMES.length);
    expect(new Set(FEATURED_GAMES.map((g) => urlKey(g.url))).size).toBe(FEATURED_GAMES.length);
    for (const g of FEATURED_GAMES) {
      expect(g.url.startsWith('https://')).toBe(true);
      expect(g).toMatchObject({ source: 'web', orientation: 'landscape' });
      expect(g.title.length).toBeGreaterThan(2);
      // Built in, not something the person added, so there is no Remove button on them.
      expect(isUserGame(g)).toBe(false);
    }
  });

  it('can be played: every game is let through to its own site, including the www and subdomain redirects they use', () => {
    for (const g of FEATURED_GAMES) {
      const host = new URL(g.url).hostname;
      expect(allowGameNavigation(g.url, g.url)).toBe(true);
      expect(allowGameNavigation(g.url, `https://www.${host}/`)).toBe(true);
      expect(allowGameNavigation(g.url, `https://play.${host}/`)).toBe(true);
      expect(allowGameNavigation(g.url, 'https://ads.example.net/click')).toBe(false);
    }
  });
});

describe('same-site rule for game navigation', () => {
  it('treats www and subdomains as the same site, but not look-alikes', () => {
    expect(sameSite('krunker.io', 'www.krunker.io')).toBe(true);
    expect(sameSite('www.krunker.io', 'krunker.io')).toBe(true);
    expect(sameSite('assets.krunker.io', 'krunker.io')).toBe(true);
    expect(sameSite('krunker.io', 'KRUNKER.io')).toBe(true);
    expect(sameSite('evilkrunker.io', 'krunker.io')).toBe(false);
    expect(sameSite('krunker.io.evil.com', 'krunker.io')).toBe(false);
    expect(sameSite('other.pages.dev', 'cod-webports.pages.dev')).toBe(false);
  });

  it('still blocks insecure and foreign top-frame jumps', () => {
    expect(allowGameNavigation('https://krunker.io', 'http://krunker.io/')).toBe(false);
    expect(allowGameNavigation('https://krunker.io', 'https://krunker.io.evil.com/')).toBe(false);
    expect(allowGameNavigation('https://krunker.io', 'https://evil.com/', false)).toBe(true);
  });
});

describe('games the person added', () => {
  it('counts uploads and pasted links, not built-in games', () => {
    expect(isUserGame({ source: 'local', category: 'Uploaded' })).toBe(true);
    expect(isUserGame({ source: 'web', category: USER_GAME_CATEGORY })).toBe(true);
    expect(isUserGame({ source: 'web', category: 'Shooter' })).toBe(false);
  });
});

describe('alert audio sources', () => {
  const root = path.join(__dirname, '..');

  it('uses the recorded files for cameras and spoken TTS for police', () => {
    expect([...RECORDED_CLIPS]).toEqual(['camera_approaching']);
    expect(isRecordedClip('camera_approaching')).toBe(true);
    expect(isRecordedClip('police_approaching')).toBe(false);
  });

  it('points the camera clip at the file in assets/sounds, with no passing or police recordings left behind', () => {
    const source = fs.readFileSync(path.join(root, 'src/services/voice-notes.ts'), 'utf8');
    expect(source).toContain("require('../../assets/sounds/camera_approaching.mp3')");
    expect(source).not.toMatch(/camera_passing/);
    expect(fs.existsSync(path.join(root, 'assets/sounds/camera_passing.mp3'))).toBe(false);
    expect(source).not.toMatch(/police_(approaching|passing)\.mp3/);
    expect(fs.existsSync(path.join(root, 'assets/sounds/police_approaching.mp3'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'assets/sounds/police_passing.mp3'))).toBe(false);
  });

  it('has real audio data in the camera file', () => {
    for (const name of ['camera_approaching.mp3']) {
      const bytes = fs.readFileSync(path.join(root, 'assets/sounds', name));
      expect(bytes.length).toBeGreaterThan(1000);
      // MP3 (tagged or raw frames), or an MP4/3GPP audio container that voice recorders
      // often save under an .mp3 name; Android's players detect the format from the contents.
      const id3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
      const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
      const mp4 = bytes.subarray(4, 8).toString('latin1') === 'ftyp';
      expect(id3 || frameSync || mp4).toBe(true);
    }
  });
});
