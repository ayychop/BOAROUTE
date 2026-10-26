/** Short daily quotes for the Hub, written for people who spend the day on the road and on the shop floor. */
export const DAILY_QUOTES: string[] = [
  'Your grind today builds your empire tomorrow.',
  'Every store you walk into is a chance to leave it better than you found it.',
  'Miles on the clock, standards on the shelf.',
  'Consistency beats talent when talent does not show up.',
  'The best displays are built by people who care about the details nobody notices.',
  'One great visit at a time. That is how targets fall.',
  'You are the face of the brand in every aisle you touch.',
  'Plan the route, work the plan, own the day.',
  'Small wins stacked daily turn into big months.',
  'Pressure is a privilege. It means your work matters.',
  'Show up sharp. Leave it sharper.',
  'Discipline is choosing what you want most over what you want now.',
  'Every mile is a step closer to the goal.',
  'Good merchandisers fill shelves. Great ones change how a store sells.',
  'Be the reason a store manager is glad you came in today.',
  'Your standards are your signature.',
  'Fast is fine. Right first time is better.',
  'The road is long, but so is your ambition.',
  'Nobody remembers easy days. Make today one worth remembering.',
  'Effort is the one thing nobody can take from you.',
  'Turn every visit into a result.',
  'Greatness is just ordinary work done extraordinarily well, every day.',
  'Your future self is watching. Make them proud.',
  'Do it properly or do it again. Choose properly.',
  'A full route and a full heart. Let us go.',
  'Progress over perfection, but never stop chasing perfection.',
  'The shelf does not lie. Let it tell your story.',
  'Hard work compounds. Keep depositing.',
  'Win the morning and the day follows.',
  'Champions are built on the days they did not feel like it.',
  'You do not find momentum. You build it, one store at a time.',
];

const DAY_MS = 86_400_000;

/** Days since 1 Jan 1970 in local time, so the quote changes at local midnight. */
function localDayNumber(date: Date): number {
  return Math.floor((date.getTime() - date.getTimezoneOffset() * 60_000) / DAY_MS);
}

/** Index of today's quote; `offset` steps through the list from there. */
export function dailyQuoteIndex(date: Date, offset = 0): number {
  const n = DAILY_QUOTES.length;
  return (((localDayNumber(date) + offset) % n) + n) % n;
}

export function dailyQuote(date: Date, offset = 0): string {
  return DAILY_QUOTES[dailyQuoteIndex(date, offset)];
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
