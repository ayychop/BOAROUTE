import fs from 'fs';
import path from 'path';
import {
  BIG_HEADER_CHARS,
  GREETINGS,
  MAX_GREETING_CHARS,
  MAX_NAME_CHARS,
  parseGreetingIndex,
  pickGreetingIndex,
  renderGreeting,
} from '../src/lib/greetings';

describe('greeting list', () => {
  it('has at least 10 distinct, non-empty lines', () => {
    expect(GREETINGS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(GREETINGS).size).toBe(GREETINGS.length);
    for (const g of GREETINGS) expect(g.trim().length).toBeGreaterThan(10);
  });

  it('keeps every line short enough for the header, even with the longest allowed name', () => {
    const longestName = 'W'.repeat(MAX_NAME_CHARS);
    for (const g of GREETINGS) {
      const shown = renderGreeting(g, longestName);
      expect(shown.length).toBeLessThanOrEqual(MAX_GREETING_CHARS);
    }
  });

  it('stays clean: no swearing or slurs', () => {
    const banned = /\b(fuck\w*|shit\w*|bitch\w*|ass|asshole|damn|hell|nigg\w*|cunt|dick|pussy|whore|slut)\b/i;
    for (const g of GREETINGS) expect(g).not.toMatch(banned);
  });

  it('puts the name in plenty of lines and leaves others standing alone', () => {
    const withName = GREETINGS.filter((g) => g.includes('{name}')).length;
    expect(withName).toBeGreaterThanOrEqual(5);
    expect(GREETINGS.length - withName).toBeGreaterThanOrEqual(3);
  });

  it('includes the three lines from the brief', () => {
    expect(GREETINGS).toContain("I ain't scared of no work, I'm scared of no coffee.");
    expect(GREETINGS).toContain("You know I keep it real, even when I'm sleep.");
    expect(GREETINGS).toContain("They said I couldn't do it, but they didn't know I had a BOA.");
  });
});

describe('renderGreeting', () => {
  it('puts the first name in every placeholder', () => {
    expect(renderGreeting("Don't start nothing, {name}.", 'Jo')).toBe("Don't start nothing, Jo.");
    expect(renderGreeting('{name}, {name}.', 'Jo')).toBe('Jo, Jo.');
  });

  it('leaves lines without a name alone', () => {
    expect(renderGreeting('Lord, give me coffee.', 'Jo')).toBe('Lord, give me coffee.');
  });

  it('cuts very long names and copes with an empty one', () => {
    expect(renderGreeting('Hey {name}', 'A'.repeat(40))).toBe(`Hey ${'A'.repeat(MAX_NAME_CHARS)}`);
    expect(renderGreeting('Hey {name}', '   ')).toBe('Hey champ');
  });

  it('leaves no placeholder behind in any line', () => {
    for (const g of GREETINGS) expect(renderGreeting(g, 'Jo')).not.toMatch(/[{}]/);
  });
});

describe('pickGreetingIndex', () => {
  const n = GREETINGS.length;

  it('always returns a valid index', () => {
    for (const r of [0, 0.0001, 0.25, 0.5, 0.75, 0.9999, 1]) {
      for (const last of [null, 0, 1, n - 1, 999, -3]) {
        const i = pickGreetingIndex(last, () => r);
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      }
    }
  });

  it('never repeats the previous launch', () => {
    for (let last = 0; last < n; last++) {
      for (let step = 0; step < 200; step++) {
        expect(pickGreetingIndex(last, () => step / 200)).not.toBe(last);
      }
    }
  });

  it('can reach every line', () => {
    const seen = new Set<number>();
    for (let step = 0; step < 400; step++) seen.add(pickGreetingIndex(null, () => step / 400));
    expect(seen.size).toBe(n);
  });

  it('actually varies between launches with the real random source', () => {
    const picks = new Set<number>();
    let last: number | null = null;
    for (let launch = 0; launch < 60; launch++) {
      const i = pickGreetingIndex(last);
      expect(i).not.toBe(last);
      picks.add(i);
      last = i;
    }
    expect(picks.size).toBeGreaterThan(5);
  });

  it('handles a one-line list', () => {
    expect(pickGreetingIndex(0, Math.random, 1)).toBe(0);
  });
});

describe('parseGreetingIndex', () => {
  it('reads a stored index and rejects anything else', () => {
    expect(parseGreetingIndex('3')).toBe(3);
    expect(parseGreetingIndex('0')).toBe(0);
    expect(parseGreetingIndex(null)).toBeNull();
    expect(parseGreetingIndex(undefined)).toBeNull();
    expect(parseGreetingIndex('abc')).toBeNull();
    expect(parseGreetingIndex('-1')).toBeNull();
    expect(parseGreetingIndex('2.5')).toBeNull();
    // A list that has since shrunk.
    expect(parseGreetingIndex('99')).toBeNull();
  });
});

describe('Home header wiring', () => {
  const home = fs.readFileSync(path.join(__dirname, '..', 'src/app/(tabs)/index.tsx'), 'utf8');

  it('picks once per launch and no longer shows the old time-of-day greeting', () => {
    expect(home).toContain('useState(greetingForThisLaunch)');
    expect(home).toMatch(/launchGreeting === null/);
    expect(home).not.toContain('greetingFor(phase');
  });

  it('wraps cleanly: capped at three lines, shrinks slightly, then truncates', () => {
    expect(home).toContain('numberOfLines={3}');
    expect(home).toContain('adjustsFontSizeToFit');
    expect(home).toContain('ellipsizeMode="tail"');
  });

  it('steps down from the big serif size only for long lines', () => {
    expect(BIG_HEADER_CHARS).toBeLessThan(MAX_GREETING_CHARS);
    expect(home).toMatch(/greeting\.length > BIG_HEADER_CHARS \? 'title' : 'display'/);
  });
});
