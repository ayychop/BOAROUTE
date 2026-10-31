/**
 * Home header greetings. One is picked each time the app is freshly opened.
 *
 * Tone: raw, unapologetic, quick on its feet, like a stand-up special with the
 * sound off the swearing. Keep every line clean and short enough to sit on three
 * lines of the header (see MAX_GREETING_CHARS; a test enforces it).
 *
 * `{name}` becomes the person's first name, so the line can end ", Jo" or
 * carry the name in the middle. A line with no `{name}` stands on its own.
 */
export const GREETINGS: readonly string[] = [
  "I ain't scared of no work, I'm scared of no coffee.",
  "You know I keep it real, even when I'm sleep.",
  "They said I couldn't do it, but they didn't know I had a BOA.",
  "Morning, {name}. Don't start nothing, won't be nothing.",
  'I came to work today. Do not make me regret it, {name}.',
  "Stores ain't gonna visit themselves, {name}.",
  "Everybody got a plan till the sat nav says recalculating.",
  'Lord, give me coffee and one parking space.',
  "I'm not tired, {name}. I'm just stylishly exhausted.",
  "Run the route, {name}. Let the haters ride the bus.",
  'Clock in like you mean it, {name}. Clock out like a boss.',
  'Somebody gotta get this money. Might as well be you, {name}.',
  "Fuel light on. I said, 'We gon' make it.' Faith, {name}.",
  "Think outside the box? I'm in a BMW. Ain't no box.",
  "Mileage don't lie, {name}. Neither do I.",
  'I do not do traffic. Traffic does me. Then I keep driving.',
  "Be the reason the manager says, 'Dang, they actually came.'",
  "I'm not late, {name}. I'm making an entrance.",
];

/** The longest a greeting may be once the name is in, so it never takes more than three lines. */
export const MAX_GREETING_CHARS = 66;
/** First names longer than this are cut, so an email-style name cannot blow the line. */
export const MAX_NAME_CHARS = 12;
/** Up to this many characters still fits the big header size on two lines; longer lines step down. */
export const BIG_HEADER_CHARS = 30;

/** Fills in the name. */
export function renderGreeting(template: string, name: string): string {
  const first = name.trim().slice(0, MAX_NAME_CHARS) || 'champ';
  return template.replace(/\{name\}/g, first);
}

/** A stored index, or null when it is missing or no longer valid. */
export function parseGreetingIndex(raw: string | null | undefined, count = GREETINGS.length): number | null {
  if (raw == null || !/^\d+$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return n < count ? n : null;
}

/**
 * A random index that is never the same as `last`, so two launches in a row
 * never show the same line. `random` is injectable for tests.
 */
export function pickGreetingIndex(last: number | null, random: () => number = Math.random, count = GREETINGS.length): number {
  if (count <= 1) return 0;
  const hasLast = last != null && last >= 0 && last < count;
  const span = hasLast ? count - 1 : count;
  let i = Math.min(span - 1, Math.floor(random() * span));
  if (hasLast && i >= (last as number)) i += 1;
  return i;
}
