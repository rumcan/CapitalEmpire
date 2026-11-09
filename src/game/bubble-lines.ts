// The speech bubbles' words (T406, #1090; the owner, 2026-11-09: "add speech bubbles to the game for all of the people walking around. both random thoughts,
// happiness and game related, and fun ones"): ONE data table. Every line a person says is a row here: an id, what sets it off, who may say it, its lines,
// its weight, its cool-down and the conditions it needs. Nothing in the code below this file knows a line; to add a gag add a row.
//
// The words are ours: short, light, kept clean, no real names or brands. Pure TS, no DOM.

/** who a bubble is over: a townsperson on the pavement, a spectator (the galleries, the queues, the walking parties), a golfer, or the staff (the grounds
 *  crew, the pros, the caddies and, from T408, the marshals) */
export type SpeakerKind = 'town' | 'spectator' | 'golfer' | 'staff';
export const SPEAKER_KINDS: readonly SpeakerKind[] = ['town', 'spectator', 'golfer', 'staff'];

/** the bubble's shape: say (a rounded box with a tail), think (a cloud and a trail of dots), shout (a jagged burst) and moan (a wobbly box, for the hurt) */
export type BubbleStyle = 'say' | 'think' | 'shout' | 'moan';

/** the kinds of row: a random thought, a mood (happy or grumbling), a game reaction (the course, the queues, the prices, a great shot) and a fun gag; T408
 *  adds the crowd incidents */
export type RuleGroup = 'thought' | 'mood' | 'game' | 'fun' | 'incident';

/** what a game event is (golf/ballhit.ts and the engine raise them; T408's incidents come later in the same union) */
export type EventId =
  | 'birdie' | 'eagle' | 'ace' | 'nice-shot' | 'ball-water' | 'ball-lost' | 'fore' | 'club-throw' | 'ball-car' | 'hit-spectator';

/** what the bubbles read of the game (the engine sets it about once a second): each 0..1 unless said, 0 meaning nothing wrong */
export interface BubbleContext {
  /** the day's weather: the tournament's, else clear */
  weather: 'clear' | 'overcast' | 'rain' | 'storm' | 'heat';
  /** how dark it is (0 day .. 1 night) */
  night: number;
  /** a golf game, and a tournament day under way (the crowd is out) */
  golf: boolean; tournament: boolean;
  /** how well things are going (0 awful .. 1 lovely): the course and the crowd's service, the queues and the jams folded in */
  mood: number;
  /** the worst queue (the gates, the stops, the range): 0 none .. 1 endless */
  queue: number;
  /** the town's traffic: 0 flowing .. 1 jammed */
  jam: number;
  /** litter on the course and how short of bins it is (T408; 0 when nothing reports it) */
  litter: number; binShort: number;
  /** the prices the crowd pays: -1 the cheap card, 0 normal, 1 the premium card */
  price: -1 | 0 | 1;
  /** the range's ball room is empty (T386) */
  ballsOut: boolean;
  /** how crowded the view is: the people on screen against the most the bubbles read as a crowd */
  crowd: number;
}
/** a context where nothing is happening (and the engine's start) */
export const CALM: Readonly<BubbleContext> = { weather: 'clear', night: 0, golf: false, tournament: false, mood: 0.5, queue: 0, jam: 0, litter: 0, binShort: 0, price: 0, ballsOut: false, crowd: 0 };

/** a condition of a row: the context's value `k` (the person's own mood for `mood`) within min..max, or equal to `is` (a string or a boolean) */
export interface Cond { k: keyof BubbleContext; min?: number; max?: number; is?: string | boolean | number }

/** a row of the table. `on` says what sets it off: 'sample' (picked now and then for a person on screen, from the conditions) or a game event (EventId:
 *  the row answers it). An event row's `role` says who speaks: the 'subject' (the golfer it happened to) or people 'near' the event (up to `n` of the
 *  kinds in `who`, within `radius` tiles) */
export interface BubbleRule {
  id: string; group: RuleGroup; on: 'sample' | EventId; role?: 'subject' | 'near'; n?: number; radius?: number;
  who: readonly SpeakerKind[]; lines: readonly string[];
  /** the share of the picks this row gets among the rows that fit (a sampled one), unitless */
  weight: number;
  /** seconds the same person stays quiet after this row; `gap` seconds the row itself rests for everybody (default 0) */
  cooldown: number; gap?: number;
  when?: readonly Cond[];
  style?: BubbleStyle;
}

const ALL: readonly SpeakerKind[] = SPEAKER_KINDS;
const FOLK: readonly SpeakerKind[] = ['town', 'spectator', 'staff'];
const PEOPLE: readonly SpeakerKind[] = ['town', 'spectator', 'golfer'];

/** the table */
export const RULES: readonly BubbleRule[] = [
  // ---- random thoughts (idle or walking): the weather, the town, the 1980s
  { id: 'th-clear', group: 'thought', on: 'sample', who: ALL, weight: 3, cooldown: 70, style: 'think', when: [{ k: 'weather', is: 'clear' }, { k: 'night', max: 0.4 }],
    lines: ['Lovely day for it.', 'Not a cloud up there.', 'Good thing I wore a hat.', 'Smells like cut grass.', 'A day like this, you could just stand here.'] },
  { id: 'th-overcast', group: 'thought', on: 'sample', who: ALL, weight: 2, cooldown: 70, style: 'think', when: [{ k: 'weather', is: 'overcast' }, { k: 'night', max: 0.4 }],
    lines: ['Looks like rain. Maybe.', 'Cloudy, with a chance of bogeys.', 'Grey, but I am not complaining.'] },
  { id: 'th-rain', group: 'thought', on: 'sample', who: ALL, weight: 4, cooldown: 60, style: 'think', when: [{ k: 'weather', is: 'rain' }],
    lines: ['Of course. Rain.', 'My hair!', 'Wet socks. Fantastic.', 'I knew I left the umbrella.'] },
  { id: 'th-storm', group: 'thought', on: 'sample', who: ALL, weight: 4, cooldown: 60, style: 'think', when: [{ k: 'weather', is: 'storm' }],
    lines: ['Was that thunder?', 'Maybe we should go in...', 'Hold onto your hat!', 'Who ordered the lightning?'] },
  { id: 'th-heat', group: 'thought', on: 'sample', who: ALL, weight: 4, cooldown: 60, style: 'think', when: [{ k: 'weather', is: 'heat' }],
    lines: ['Hot enough to fry an egg.', 'Is there any shade?', 'I could drink a lake.', 'Is it lunch yet? Feels like lunch.'] },
  { id: 'th-night', group: 'thought', on: 'sample', who: ALL, weight: 3, cooldown: 70, style: 'think', when: [{ k: 'night', min: 0.6 }],
    lines: ['Getting dark already.', 'The crickets are loud tonight.', 'Nice and quiet at night.', 'Was that an owl?'] },
  { id: 'th-town', group: 'thought', on: 'sample', who: ['town', 'staff'], weight: 3, cooldown: 80, style: 'think',
    lines: ['Nice little town.', 'Where did I park?', 'A new shop opened. Finally.', 'Is it Thursday?', 'Same bench, same time tomorrow.'] },
  { id: 'th-eighties', group: 'thought', on: 'sample', who: PEOPLE, weight: 3, cooldown: 90, style: 'think',
    lines: ['Shoulder pads: still winning.', 'My hair has its own weather.', 'Mix tape or the radio?', 'Phones should have cords. Real ones.', 'Neon suits me.', 'Did I record that show?', 'One more quarter for the arcade...'] },
  { id: 'th-golf', group: 'thought', on: 'sample', who: ['town', 'spectator'], weight: 2, cooldown: 90, style: 'think', when: [{ k: 'golf', is: true }],
    lines: ['How hard can golf be?', 'That is a lot of grass.', 'I should take up golf.', 'Is hitting a ball that tiny even allowed?'] },
  { id: 'th-golfer', group: 'thought', on: 'sample', who: ['golfer'], weight: 4, cooldown: 60, style: 'think',
    lines: ['Keep it in the short grass.', 'Nine more to go.', 'Just breathe.', 'Slow down, wrists.', 'Fairway, fairway, fairway.', 'Do not look at the water.'] },
  // ---- happiness, from the mood: lovely when it is going well, grumbles when it is not
  { id: 'mood-happy', group: 'mood', on: 'sample', who: ALL, weight: 4, cooldown: 60, style: 'say', when: [{ k: 'mood', min: 0.62 }],
    lines: ['Great day!', 'This is wonderful.', 'Everything is just right.', 'I would come back.', 'Best afternoon all week!', 'Lovely, lovely.'] },
  { id: 'mood-grumpy', group: 'mood', on: 'sample', who: ALL, weight: 4, cooldown: 50, style: 'say', when: [{ k: 'mood', max: 0.38 }],
    lines: ['What a shambles.', 'I have had better days.', 'Typical.', 'Do not ask.', 'Who runs this place?'] },
  // ---- game-related: the queues, the jams, the litter and bins, the prices, the range, the crowd, the tournament
  { id: 'queue-long', group: 'game', on: 'sample', who: PEOPLE, weight: 6, cooldown: 45, style: 'say', when: [{ k: 'queue', min: 0.55 }],
    lines: ['This line never moves.', 'Are we queuing for the moon?', 'I could have walked home by now.', 'Is anyone actually working?'] },
  { id: 'jam', group: 'game', on: 'sample', who: ['town'], weight: 5, cooldown: 45, style: 'say', when: [{ k: 'jam', min: 0.5 }],
    lines: ['Traffic again!', 'Honk all you like.', 'Walking is faster.', 'Somebody build a road.'] },
  { id: 'litter', group: 'game', on: 'sample', who: FOLK, weight: 5, cooldown: 50, style: 'say', when: [{ k: 'litter', min: 0.5 }],
    lines: ['Who drops all this?', 'Wrappers everywhere. Ew.', 'Mind the mess!', 'Somebody call the cleaners.'] },
  { id: 'no-bins', group: 'game', on: 'sample', who: FOLK, weight: 5, cooldown: 50, style: 'say', when: [{ k: 'binShort', min: 0.5 }],
    lines: ['Not a bin in sight.', 'Where do I put this?', 'One bin for the whole hill?'] },
  { id: 'balls-out', group: 'game', on: 'sample', who: ['golfer', 'staff'], weight: 8, cooldown: 40, style: 'say', when: [{ k: 'ballsOut', is: true }],
    lines: ['Out of balls!', 'Not a ball in the room.', 'Who forgot the balls?', 'The bucket is empty, boss!'] },
  { id: 'price-high', group: 'game', on: 'sample', who: PEOPLE, weight: 3, cooldown: 80, style: 'say', when: [{ k: 'price', min: 1 }],
    lines: ['Seven bucks for a hot dog?!', 'Is the sandwich made of gold?', 'Premium prices, premium sandwiches?'] },
  { id: 'price-low', group: 'game', on: 'sample', who: PEOPLE, weight: 3, cooldown: 80, style: 'say', when: [{ k: 'price', max: -1 }],
    lines: ['Cheap eats. Love it.', 'Two burgers? Why not.', 'Bargain!'] },
  { id: 'crowd-big', group: 'game', on: 'sample', who: ['spectator'], weight: 3, cooldown: 70, style: 'say', when: [{ k: 'crowd', min: 0.6 }],
    lines: ['Packed like sardines.', 'I cannot see a thing!', 'Somebody\'s elbow is in my ribs.'] },
  { id: 'tour-day', group: 'game', on: 'sample', who: ['spectator'], weight: 4, cooldown: 70, style: 'say', when: [{ k: 'tournament', is: true }],
    lines: ['Come on, birdie!', 'Is that the leader?', 'Which hole is best for watching?', 'Where is the nearest toilet?'] },
  // ---- the golf's reactions: a shot, a score
  { id: 'ev-birdie-subject', group: 'game', on: 'birdie', role: 'subject', who: ['golfer'], weight: 1, cooldown: 20, style: 'say', lines: ['Birdie!', 'Yes!', 'That is the one!'] },
  { id: 'ev-birdie-near', group: 'game', on: 'birdie', role: 'near', n: 3, radius: 12, who: ['spectator', 'staff'], weight: 1, cooldown: 25, style: 'say', lines: ['Birdie!', 'Nicely done!', 'Great putt!', 'What a roll!'] },
  { id: 'ev-eagle-subject', group: 'game', on: 'eagle', role: 'subject', who: ['golfer'], weight: 1, cooldown: 20, style: 'shout', lines: ['Eagle!', 'Yes! YES!'] },
  { id: 'ev-eagle-near', group: 'game', on: 'eagle', role: 'near', n: 4, radius: 14, who: ['spectator', 'staff'], weight: 1, cooldown: 25, style: 'shout', lines: ['EAGLE!', 'Did you see that?!', 'Fantastic!'] },
  { id: 'ev-ace-subject', group: 'fun', on: 'ace', role: 'subject', who: ['golfer'], weight: 1, cooldown: 20, style: 'shout', lines: ['I cannot believe it!', 'Did that just happen?!'] },
  { id: 'ev-ace-near', group: 'fun', on: 'ace', role: 'near', n: 5, radius: 16, who: ['spectator', 'staff', 'golfer'], weight: 1, cooldown: 25, style: 'shout', lines: ['HOLE IN ONE!', 'No way!!', 'I will tell my grandkids!', 'Unreal!'] },
  { id: 'ev-nice-shot-near', group: 'game', on: 'nice-shot', role: 'near', n: 2, radius: 10, who: ['spectator', 'staff'], weight: 1, cooldown: 30, gap: 4, style: 'say', lines: ['Nice shot!', 'Right at the flag!', 'Beautiful.', 'That is how it is done.'] },
  { id: 'ev-nice-shot-subject', group: 'game', on: 'nice-shot', role: 'subject', who: ['golfer'], weight: 1, cooldown: 40, gap: 6, style: 'say', lines: ['Nice shot!', 'That felt good.', 'Right where I wanted it.'] },
  { id: 'ev-water-subject', group: 'fun', on: 'ball-water', role: 'subject', who: ['golfer'], weight: 1, cooldown: 25, style: 'say', lines: ['Into the drink...', 'Not again!', 'Plop.', 'Another one for the fish.'] },
  { id: 'ev-water-near', group: 'fun', on: 'ball-water', role: 'near', n: 2, radius: 10, who: ['spectator', 'staff'], weight: 1, cooldown: 30, gap: 3, style: 'say', lines: ['Glug!', 'Splash!', 'The fish are happy.'] },
  { id: 'ev-lost-subject', group: 'fun', on: 'ball-lost', role: 'subject', who: ['golfer'], weight: 1, cooldown: 25, style: 'say', lines: ['Where did it go?', 'Anyone see that?', 'Lost another one.', 'Fore-get it.'] },
  { id: 'ev-lost-near', group: 'fun', on: 'ball-lost', role: 'near', n: 1, radius: 10, who: ['spectator', 'staff'], weight: 1, cooldown: 30, gap: 3, style: 'say', lines: ['Over there!', 'Nope. Gone.', 'I did not see it.'] },
  { id: 'ev-fore-subject', group: 'fun', on: 'fore', role: 'subject', who: ['golfer'], weight: 1, cooldown: 25, style: 'shout', lines: ['Fore!', 'FORE!!', 'Heads up!'] },
  { id: 'ev-fore-near', group: 'fun', on: 'fore', role: 'near', n: 2, radius: 10, who: ['spectator', 'staff'], weight: 1, cooldown: 30, gap: 3, style: 'shout', lines: ['Duck!', 'Heads up!', 'Eek!'] },
  { id: 'ev-throw-subject', group: 'fun', on: 'club-throw', role: 'subject', who: ['golfer'], weight: 1, cooldown: 60, style: 'shout', lines: ['Grrr!', 'That does it!', '!@#$%!'] },
  { id: 'ev-throw-near', group: 'fun', on: 'club-throw', role: 'near', n: 3, radius: 10, who: ['spectator', 'staff'], weight: 1, cooldown: 40, style: 'say', lines: ['Whoa, easy!', 'Mind the club!', 'Somebody has a temper.'] },
  { id: 'ev-car-near', group: 'fun', on: 'ball-car', role: 'near', n: 2, radius: 12, who: ['spectator', 'staff', 'town'], weight: 1, cooldown: 30, style: 'say', lines: ['Ping! That was a car!', 'Hope it is insured.', 'Oops. Dented.'] },
  { id: 'ev-car-subject', group: 'fun', on: 'ball-car', role: 'subject', who: ['golfer'], weight: 1, cooldown: 30, style: 'say', lines: ['Sorry about the car!', 'Did I just do that?'] },
  // ---- a fan hit by a ball: the golfer, the fans round him and the staff; the fan himself plays the hurt loop (HURT_LINES)
  { id: 'ev-hit-subject', group: 'fun', on: 'hit-spectator', role: 'subject', who: ['golfer'], weight: 1, cooldown: 20, style: 'shout', lines: ['Sorry! Sorry!', 'Are you okay?!', 'Fore... too late!'] },
  { id: 'ev-hit-near', group: 'fun', on: 'hit-spectator', role: 'near', n: 3, radius: 9, who: ['spectator'], weight: 1, cooldown: 20, style: 'say', lines: ['Ooh, that must hurt!', 'Ouch!', 'Right in the knee!', 'Somebody get a medic!'] },
  { id: 'ev-hit-staff', group: 'fun', on: 'hit-spectator', role: 'near', n: 1, radius: 16, who: ['staff'], weight: 1, cooldown: 20, style: 'say', lines: ['Medic! Over here!', 'Stay still, sir!', 'Easy does it!'] },
];

/** the rows that answer a game event */
export const rulesFor = (event: EventId): readonly BubbleRule[] => RULES.filter(r => r.on === event);
/** the sampled rows */
export const SAMPLED: readonly BubbleRule[] = RULES.filter(r => r.on === 'sample');

/** whether a condition holds: `mood` is the person's own mood (the context's, a little different for everyone) */
export function holds(c: Cond, ctx: BubbleContext, mood: number): boolean {
  const v: number | string | boolean = c.k === 'mood' ? mood : ctx[c.k];
  if (c.is !== undefined) return v === c.is;
  const n = typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : NaN;
  if (c.min !== undefined && !(n >= c.min)) return false;
  if (c.max !== undefined && !(n <= c.max)) return false;
  return true;
}
/** whether a row fits a person of kind `kind` with mood `mood` in the context */
export function fits(r: BubbleRule, kind: SpeakerKind, ctx: BubbleContext, mood: number): boolean {
  if (!r.who.includes(kind)) return false;
  if (r.when) for (const c of r.when) if (!holds(c, ctx, mood)) return false;
  return true;
}

// ---- the hurt loop (a fan hit by a ball clutches his knee and moans, over and over): lines, beat and the length of the gag
/** the moans, in turn: a drawn-out groan, then its echo; (every so often a plainer one breaks it up) */
export const HURT_LINES: readonly string[] = ['Aaarrgh...', '...aaarrgghh...'];
/** a plainer moan, in now and then (every HURT_VARY-th beat) */
export const HURT_PLAIN: readonly string[] = ['Ow... my knee...', 'Oooh... ow, ow, owww...'];
/** a beat is HURT_BEAT real seconds; the bubble shows for the first HURT_ON of each and rests the rest (the pauses) */
export const HURT_BEAT = 3.1, HURT_ON = 2.3, HURT_VARY = 5;
/** the gag lasts HURT_GAME_MIN game minutes (the ticket: about 2 game-minutes) and never less than HURT_MIN_REAL_S real seconds (at the fast speeds two game
 *  minutes are a second: the gag must still be seen once), then he limps off for LIMP_S seconds and is gone GONE_S seconds, then he is back in his place */
export const HURT_GAME_MIN = 2, HURT_MIN_REAL_S = 8, LIMP_S = 6, GONE_S = 60;
/** a fan hit within this many tiles of a ball's landing or rest (a person's own space 0.2 and the ball) is the one hit */
export const HIT_R = 0.6;

/** the moan shown `elapsed` seconds into the gag, or null in a pause: the beats alternate the groan and its echo, every HURT_VARY-th a plainer one */
export function hurtLine(elapsed: number): string | null {
  if (!(elapsed >= 0)) return null;
  const beat = Math.floor(elapsed / HURT_BEAT), within = elapsed - beat * HURT_BEAT;
  if (within >= HURT_ON) return null;
  if (beat % HURT_VARY === HURT_VARY - 1) return HURT_PLAIN[Math.floor(beat / HURT_VARY) % HURT_PLAIN.length]!;
  return HURT_LINES[beat % HURT_LINES.length]!;
}
