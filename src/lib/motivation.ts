import { MANAGER_QUOTES, MERCHANDISER_QUOTES } from '@/data/quotes';

/** One "Real Talk" quote per day of the year for the Hub: merchandisers by default. */
export const DAILY_QUOTES: string[] = MERCHANDISER_QUOTES;
/** The manager's set: training, store relationships, Elites and launch game plans. */
export const MANAGER_DAILY_QUOTES: string[] = MANAGER_QUOTES;

/** The list for someone's job: managers (the admin role) get their own quotes. */
export function quotesFor(manager: boolean): string[] {
  return manager ? MANAGER_DAILY_QUOTES : DAILY_QUOTES;
}

const DAY_MS = 86_400_000;

/** Day of the year in local time: 1 on 1 Jan, up to 365 (366 in a leap year). */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((today.getTime() - start.getTime()) / DAY_MS) + 1;
}

/** Index of today's quote (dayOfYear % length), so it changes at local midnight; `offset` steps through the list from there. */
export function dailyQuoteIndex(date: Date, offset = 0, quotes: string[] = DAILY_QUOTES): number {
  const n = quotes.length;
  return (((dayOfYear(date) + offset) % n) + n) % n;
}

export function dailyQuote(date: Date, offset = 0, quotes: string[] = DAILY_QUOTES): string {
  return quotes[dailyQuoteIndex(date, offset, quotes)];
}

export interface LongRead {
  id: string;
  title: string;
  kicker: string;
  minutes: number;
  paragraphs: string[];
}

/** Longer pieces for Me > Premium Motivation. */
export const LONG_READS: LongRead[] = [
  {
    id: 'empire',
    title: 'The empire is built on ordinary Tuesdays',
    kicker: 'Mindset',
    minutes: 2,
    paragraphs: [
      'Nobody builds anything great on the days that feel exciting. They build it on the grey Tuesday in March when the traffic is bad, the stockroom is a mess and the manager is too busy to say hello.',
      'Those are the days that separate the people who talk about standards from the people who keep them. Anyone can do great work when they feel inspired. Professionals do great work because they decided to, long before they got out of the car.',
      'So when today feels ordinary, remember that ordinary days are where the real work hides. Do the next store properly. Then the one after that. The empire takes care of itself.',
    ],
  },
  {
    id: 'face',
    title: 'You are the brand in the room',
    kicker: 'Pride',
    minutes: 2,
    paragraphs: [
      'To a store manager, you are not a name on a route sheet. You are the brand. The way you walk in, the way you leave the shelf, the way you speak to the team on the shop floor: that is what they think of when they think of who you represent.',
      'That is a responsibility, but it is also a quiet kind of power. One good visit can change how a store treats your products for months. One honest conversation can turn a difficult manager into an ally.',
      'Carry that with you today. You are not just filling space on a shelf. You are building a reputation, and it is yours.',
    ],
  },
  {
    id: 'miles',
    title: 'Respect the miles',
    kicker: 'Resilience',
    minutes: 3,
    paragraphs: [
      'Field work asks a lot of you. Early starts, long drives, car park lunches and the strange loneliness of spending hours between stores with only the radio for company.',
      'It is fine to admit that it is hard. Strength is not pretending the road is easy. It is knowing that it is hard and choosing to show up with a good attitude anyway.',
      'Look after yourself out there. Take your breaks. Drink water. Stretch when you get out of the car. A rested merchandiser does better work than an exhausted one, every single time.',
      'And when you pull into the drive at the end of the day, take a second to be proud. You covered ground today that most people never see. That counts.',
    ],
  },
  {
    id: 'details',
    title: 'Details are the whole job',
    kicker: 'Craft',
    minutes: 2,
    paragraphs: [
      'The difference between a good display and a great one is rarely one big thing. It is fifty small things: the facing that is perfectly straight, the price label that is actually correct, the gap that got filled before anyone noticed it was there.',
      'Customers will never thank you for those details. They will not even see them. But they will feel them, because a store that has been looked after properly simply sells better.',
      'Pride in the details is what turns a job into a craft. Take the extra minute. It is always worth it.',
    ],
  },
  {
    id: 'targets',
    title: 'Targets are a map, not a verdict',
    kicker: 'Perspective',
    minutes: 2,
    paragraphs: [
      'A monthly target can feel like a judge looking over your shoulder. Behind on visits, behind on budget, behind on everything.',
      'Try looking at it differently. A target is just a map. It tells you where you are and where you are trying to get to. It does not tell you who you are or what you are worth.',
      'If you are behind, the map simply shows the next best road. Plan it, drive it, and let the numbers catch up with the effort. They usually do.',
    ],
  },
  {
    id: 'team',
    title: 'Nobody wins alone',
    kicker: 'Team',
    minutes: 2,
    paragraphs: [
      'Out on the road it is easy to feel like you are doing this on your own. But every store you visit is part of something bigger: a team covering a patch, a brand counting on its people, a group of merchandisers all chasing the same standard.',
      'Share what works. Warn each other about the hazard on the A40. Celebrate when someone hits their month early. A strong team lifts everyone in it, including you.',
      'Today, do one thing that makes a teammate\'s day easier. It will come back around.',
    ],
  },
];
