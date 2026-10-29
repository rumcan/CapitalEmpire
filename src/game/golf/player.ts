// Your golf (T241, #705; docs/plans/P28.md section 2): the player's own golfer as a small saved profile (GolfSave.player). T240 (your character: the
// "Who are you?" card, the looks, the walk) extends it; until then the name and the sex are defaults. Pure TS, no DOM; times are game minutes of the
// town day, skills 0..100 (the shot model reads them as 0..1: skill / 100, exactly a field golfer's skill).
// - Skills: driving, irons, short game, putting and nerve. The first four play the shots (play/shot.ts skillFor: the driver and the 3-wood drive, the
//   irons and the pitching wedge are the irons, the sand wedge is the short game, the putter putts); nerve keeps them under pressure (gameSkills).
// - Handicap (handicapOf): the strokes over par your skills average over 18 holes, from the shot model itself (a fitted curve, see HCP_CURVE).
// - Practice (practise): a bucket at the range raises driving and irons, the putting green putting, the chipping green the short game. Each session
//   costs game minutes and money (the bucket price, the practice green's fee); its gains shrink as a skill grows and with each session of the same
//   kind on the same day. A lesson (P26 3.2, not built yet: the Lesson hook) adds a bonus.
// - Rounds: your everyday round is a slot on T208's tee sheet (freeTee, withYou), money matches (T244) and the tournament (T246, P4's live play) take
//   playerGolfer at their pressure. Each round you finish raises your nerve a little (playedRound).
// Everything here runs on events (a click, a round's end), never per frame.
import { DAY_FIRST_TEE, DAY_LAST_TEE, DAY_TEE_GAP, type DayRoster } from './everyday';
import type { GameSkills, Golfer, Sex } from './play/types';
import type { TeeKind } from './types';

/** the five skills, in the order the cards show them */
export const SKILL_IDS = ['driving', 'irons', 'short', 'putting', 'nerve'] as const;
export type SkillId = typeof SKILL_IDS[number];
/** your skills, each 0..100 */
export type Skills = Record<SkillId, number>;
export const SKILL_NAME: Readonly<Record<SkillId, string>> = { driving: 'Driving', irons: 'Irons', short: 'Short game', putting: 'Putting', nerve: 'Nerve' };
/** what each skill plays (the cards' tooltips) */
export const SKILL_WHAT: Readonly<Record<SkillId, string>> = {
  driving: 'The driver and the 3-wood: how far and how straight off the tee',
  irons: 'The irons and the pitching wedge: the approach shots',
  short: 'The sand wedge: chips, pitches and bunker shots round the green',
  putting: 'The putter: how many putts drop and how close the misses stay',
  nerve: 'Holding your game under pressure: a money match, the club championship',
};

/** the starting skills: a mid-handicap amateur (handicapOf: about 18), a better driver than he is anything else */
export const START_SKILLS: Readonly<Skills> = { driving: 30, irons: 24, short: 22, putting: 26, nerve: 30 };
/** the name until T240's "Who are you?" card gives one */
export const DEFAULT_NAME = 'You';

/** the pressure of a round (0..1): what it takes off your game, less with nerve (gameSkills). The everyday round is a friendly four; a money match
 *  has a stake on it; the club championship is played in front of the town */
export const PRESSURE = { everyday: 0.2, match: 0.5, tournament: 0.8 } as const;
export type RoundKind = keyof typeof PRESSURE;
/** under pressure p a shot loses NERVE_LOSS * p * (1 - nerve / 100) of its skill: at no nerve and the full pressure, 30% */
export const NERVE_LOSS = 0.3;

/** your skills as the shot model plays them in a round of pressure p (0..1): each part of the game's skill / 100, less what the pressure takes
 *  (NERVE_LOSS, less with nerve) */
export function gameSkills(sk: Skills, pressure: number): GameSkills {
  const f = 1 - NERVE_LOSS * Math.min(1, Math.max(0, pressure)) * (1 - clampSkill(sk.nerve) / 100), s = (k: SkillId) => clampSkill(sk[k]) / 100 * f;
  return { driving: s('driving'), irons: s('irons'), short: s('short'), putting: s('putting') };
}

/** the handicap's weights: each part of the game's share of the strokes a better skill saves, measured on the shot model (output/t241-cal, 600
 *  rounds a point on the tests' synthetic course: +0.1 of driving saves about 2.1 strokes at a skill of 0.4, the irons 0.7, the short game 0.6,
 *  putting 0.5). The driver's carry decides how many shots a long hole takes, so driving is half of it */
export const HCP_WEIGHTS: Readonly<Record<keyof GameSkills, number>> = { driving: 0.5, irons: 0.2, short: 0.15, putting: 0.15 };
/** the handicap curve: the strokes over par a golfer of one skill s (0..1) averages over 18 holes is a + b s + c s² (the shot model's own average,
 *  fitted within 0.9 of a stroke from s 0 to 1: 32 over at 0, 18 over at 0.26, scratch at 0.74, 7 under at 1) */
export const HCP_CURVE = { a: 31.9, b: -56.2, c: 17.5 } as const;

/** your handicap (one decimal; below 0 is a plus handicap): the curve at the weighted average of your skills as an everyday round plays them
 *  (gameSkills at PRESSURE.everyday: your nerve is in it) */
export function handicapOf(sk: Skills): number {
  const g = gameSkills(sk, PRESSURE.everyday);
  const s = HCP_WEIGHTS.driving * g.driving + HCP_WEIGHTS.irons * g.irons + HCP_WEIGHTS.short * g.short + HCP_WEIGHTS.putting * g.putting;
  return Math.round((HCP_CURVE.a + HCP_CURVE.b * s + HCP_CURVE.c * s * s) * 10) / 10;
}
/** a handicap as golfers write it: 18.4, or +2.1 below scratch */
export const hcpText = (h: number): string => h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1);

/** the practice sessions: a bucket of balls at the range, a session on the putting green, one on the chipping green */
export type PracticeKind = 'bucket' | 'putting' | 'chipping';
export const PRACTICE_KINDS: readonly PracticeKind[] = ['bucket', 'putting', 'chipping'];
/** each session: its name, the game minutes it takes, and the most each skill it raises gains (at skill 0, the day's first session of its kind) */
export const PRACTICE: Readonly<Record<PracticeKind, { name: string; min: number; gains: Partial<Record<SkillId, number>> }>> = {
  bucket: { name: 'Hit a bucket', min: 45, gains: { driving: 2.0, irons: 1.6 } },
  putting: { name: 'Putting practice', min: 30, gains: { putting: 2.0 } },
  chipping: { name: 'Chipping practice', min: 30, gains: { short: 2.0 } },
};
/** each session of the same kind on the same day gains this share of the one before (the third bucket of the day teaches less than the first) */
export const FATIGUE = 0.7;
/** P26's lessons (docs/plans/P26.md 3.2: the teaching pro), not built yet. A lesson taken with a session multiplies its gains by 1 + bonus and adds
 *  its price to the cost; the engine passes one when a teaching pro can give it (Engine.lessonFor, null until P26) */
export interface Lesson { bonus: number; price: number }
/** the bonus P26's lesson should give (its hook's suggested value) */
export const LESSON_BONUS = 0.5;

/** the gain of one session for a skill now (0..100): base * (1 - skill / 100)², times FATIGUE for each session of its kind already today, times
 *  1 + the lesson's bonus. So at 25 a bucket adds about 1.1 driving, at 50 0.5, at 80 0.08 */
export function gainOf(skill: number, base: number, today = 0, lessonBonus = 0): number {
  const u = 1 - clampSkill(skill) / 100;
  return base * u * u * FATIGUE ** Math.max(0, today) * (1 + Math.max(0, lessonBonus));
}

/** a practice session in the log: the town day and the minute it began, its kind, its cost ($), its minutes, each skill's gain, whether a lesson came
 *  with it, and the handicap before and after */
export interface PracticeEntry { day: number; at: number; kind: PracticeKind; cost: number; min: number; gains: Partial<Record<SkillId, number>>; lesson?: boolean; hcp: [number, number] }
/** a round in the log: the town day, its kind, your strokes, the par and holes played, the nerve it gave, and the handicap you played off */
export interface RoundEntry { day: number; kind: RoundKind; strokes: number; par: number; holes: number; nerve: number; hcp: number }
/** your everyday round booked on the tee sheet (T208): the town day and the tee time; your game as the round plays it (gameSkills at PRESSURE.everyday:
 *  as you booked, and after each session you practise before you walk to the tee); the result once the day's round is played (the whole day is played
 *  when it is built, so it is known from the start: shown once your round is done, put in your rounds at the day's end at the latest) */
export interface Booking { day: number; tee: number; skills: GameSkills; result?: { strokes: number; par: number; holes: number; done: number } }
/** the profile (GolfSave.player): the name and sex (defaults until T240), the skills, the practice log and the rounds (the last LOG_MAX and ROUNDS_MAX),
 *  today's sessions by kind (the fatigue), the minute you are busy until (a session under way), and your booked round */
export interface PlayerProfile {
  v: 1; name: string; sex: Sex; skills: Skills; log: PracticeEntry[]; rounds: RoundEntry[];
  today: { day: number; n: Record<PracticeKind, number> }; busy: { day: number; until: number } | null; booked: Booking | null;
}
/** the practice log and the rounds keep this many (newest last) */
export const LOG_MAX = 30, ROUNDS_MAX = 20;

/** a skill kept within 0..100 */
const clampSkill = (v: number): number => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));
/** a skill as saved: two decimals */
const keep = (v: number): number => Math.round(clampSkill(v) * 100) / 100;
const noSessions = (): Record<PracticeKind, number> => ({ bucket: 0, putting: 0, chipping: 0 });

/** a new game's profile (and an old save's: it had none) */
export function startProfile(sex: Sex = 'm'): PlayerProfile {
  return { v: 1, name: DEFAULT_NAME, sex, skills: { ...START_SKILLS }, log: [], rounds: [], today: { day: 0, n: noSessions() }, busy: null, booked: null };
}

/** a finite number, else d */
const num = (v: unknown, d = 0): number => typeof v === 'number' && Number.isFinite(v) ? v : d;
const isKind = (k: unknown): k is PracticeKind => k === 'bucket' || k === 'putting' || k === 'chipping';
const isRound = (k: unknown): k is RoundKind => k === 'everyday' || k === 'match' || k === 'tournament';
/** a saved profile, its fields well formed (a bad field takes the start's); null when there is none (the engine starts one: startProfile) */
export function normalizePlayer(x: unknown): PlayerProfile | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Partial<PlayerProfile>, s0 = startProfile(p.sex === 'w' ? 'w' : 'm'), sk = (p.skills ?? {}) as Partial<Skills>;
  const skills = Object.fromEntries(SKILL_IDS.map(k => [k, keep(num(sk[k], START_SKILLS[k]))])) as Skills;
  const gains = (g: unknown): Partial<Record<SkillId, number>> => { const o: Partial<Record<SkillId, number>> = {}; if (g && typeof g === 'object') for (const k of SKILL_IDS) { const v = (g as Record<string, unknown>)[k]; if (typeof v === 'number' && Number.isFinite(v)) o[k] = v; } return o; };
  const log = (Array.isArray(p.log) ? p.log : []).filter(e => e && isKind(e.kind)).slice(-LOG_MAX).map(e => {
    const out: PracticeEntry = { day: num(e.day), at: num(e.at), kind: e.kind, cost: num(e.cost), min: num(e.min), gains: gains(e.gains), hcp: [num(e.hcp?.[0]), num(e.hcp?.[1])] };
    if (e.lesson) out.lesson = true;
    return out;
  });
  const rounds = (Array.isArray(p.rounds) ? p.rounds : []).filter(r => r && isRound(r.kind)).slice(-ROUNDS_MAX)
    .map(r => ({ day: num(r.day), kind: r.kind, strokes: num(r.strokes), par: num(r.par), holes: num(r.holes), nerve: num(r.nerve), hcp: num(r.hcp) }));
  const t = (p.today ?? {}) as Partial<PlayerProfile['today']>, tn = (t.n ?? {}) as Partial<Record<PracticeKind, number>>;
  const b = p.busy, bk = p.booked;
  let booked: Booking | null = null;
  if (bk && Number.isFinite(bk.day) && Number.isFinite(bk.tee)) {
    const q = bk.skills, ok = q && [q.driving, q.irons, q.short, q.putting].every(v => typeof v === 'number' && Number.isFinite(v));
    booked = { day: bk.day, tee: bk.tee, skills: ok ? { driving: q.driving, irons: q.irons, short: q.short, putting: q.putting } : gameSkills(skills, PRESSURE.everyday) };
    const r = bk.result;
    if (r && [r.strokes, r.par, r.holes, r.done].every(v => typeof v === 'number' && Number.isFinite(v))) booked.result = { strokes: r.strokes, par: r.par, holes: r.holes, done: r.done };
  }
  return {
    v: 1, name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 40) : s0.name, sex: s0.sex, skills, log, rounds,
    today: { day: num(t.day), n: { bucket: Math.max(0, Math.floor(num(tn.bucket))), putting: Math.max(0, Math.floor(num(tn.putting))), chipping: Math.max(0, Math.floor(num(tn.chipping))) } },
    busy: b && Number.isFinite(b.day) && Number.isFinite(b.until) ? { day: b.day, until: b.until } : null,
    booked,
  };
}

/** the sessions of a kind you have had on a town day (the fatigue's count) */
export const sessionsToday = (p: PlayerProfile, kind: PracticeKind, day: number): number => p.today.day === day ? p.today.n[kind] : 0;

/** what one session would give now: each skill it raises, from and to, and the handicap after (the cards' preview; practise applies the same) */
export function practicePreview(p: PlayerProfile, kind: PracticeKind, day: number, lesson: Lesson | null = null): { gains: { id: SkillId; from: number; to: number; gain: number }[]; hcp: [number, number] } {
  const k = sessionsToday(p, kind, day), next = { ...p.skills }, gains: { id: SkillId; from: number; to: number; gain: number }[] = [];
  for (const id of SKILL_IDS) {
    const base = PRACTICE[kind].gains[id]; if (base === undefined) continue;
    const from = p.skills[id], to = keep(from + gainOf(from, base, k, lesson?.bonus ?? 0));
    next[id] = to; gains.push({ id, from, to, gain: Math.round((to - from) * 100) / 100 });
  }
  return { gains, hcp: [handicapOf(p.skills), handicapOf(next)] };
}

/** where and when you would practise: the town day and minute, the hours the place is open (minutes of the day), its price ($, without a lesson),
 *  whether the facility is open (a practice green not built: false), the money you have, and whether you are on the course now (your round) */
export interface PracticeCtx { day: number; minute: number; open: number; close: number; price: number; facility: boolean; money: number; onCourse: boolean }

/** why a session cannot start now (the button's reason), or null when it can */
export function practiceWhy(p: PlayerProfile, kind: PracticeKind, c: PracticeCtx, lesson: Lesson | null = null): string | null {
  if (!c.facility) return kind === 'bucket' ? 'The range is not open' : `Build the ${kind === 'putting' ? 'putting' : 'chipping'} green first`;
  if (c.onCourse) return 'You are out on the course';
  const until = busyUntil(p, c.day);
  if (until !== null && c.minute < until) return `Practising until ${clock(until)}`;
  if (c.minute < c.open || c.minute + PRACTICE[kind].min > c.close) return `Open ${clock(c.open)} to ${clock(c.close)}: not enough time today`;
  const cost = c.price + (lesson?.price ?? 0);
  if (c.money < cost) return `Needs $${cost.toLocaleString()}`;
  return null;
}

/** the minute you are busy until on a town day (a session under way), or null */
export function busyUntil(p: PlayerProfile, day: number): number | null { return p.busy && p.busy.day === day ? p.busy.until : null; }

/** a session from now (practiceWhy must be null): the skills it raises (gainOf, the day's fatigue, the lesson), the cost (the price, plus the lesson's),
 *  busy for its minutes, and its entry in the log. Returns the new profile and the entry (the profile passed in is not changed) */
export function practise(p: PlayerProfile, kind: PracticeKind, c: Pick<PracticeCtx, 'day' | 'minute' | 'price'>, lesson: Lesson | null = null): { profile: PlayerProfile; entry: PracticeEntry } {
  const pv = practicePreview(p, kind, c.day, lesson), skills = { ...p.skills }, gains: Partial<Record<SkillId, number>> = {};
  for (const g of pv.gains) { skills[g.id] = g.to; gains[g.id] = g.gain; }
  const P = PRACTICE[kind], entry: PracticeEntry = { day: c.day, at: c.minute, kind, cost: c.price + (lesson?.price ?? 0), min: P.min, gains, hcp: pv.hcp };
  if (lesson) entry.lesson = true;
  const n = p.today.day === c.day ? { ...p.today.n } : noSessions(); n[kind]++;
  return { profile: { ...p, skills, log: [...p.log, entry].slice(-LOG_MAX), today: { day: c.day, n }, busy: { day: c.day, until: c.minute + P.min } }, entry };
}

/** how much a finished round raises your nerve, at nerve 0 (shrinking as it grows, as practice does): a friendly round a little, a money match more,
 *  the club championship most */
export const NERVE_GAIN: Readonly<Record<RoundKind, number>> = { everyday: 1.0, match: 2.0, tournament: 3.0 };
/** a finished round: into the log (the last ROUNDS_MAX), and your nerve up by gainOf(nerve, NERVE_GAIN[kind]). The profile passed in is not changed */
export function playedRound(p: PlayerProfile, r: { day: number; kind: RoundKind; strokes: number; par: number; holes: number }): PlayerProfile {
  const nerve = keep(p.skills.nerve + gainOf(p.skills.nerve, NERVE_GAIN[r.kind])), e: RoundEntry = { ...r, nerve: Math.round((nerve - p.skills.nerve) * 100) / 100, hcp: handicapOf(p.skills) };
  return { ...p, skills: { ...p.skills, nerve }, rounds: [...p.rounds, e].slice(-ROUNDS_MAX) };
}

/** your golfer for a round (the shot model's, as a field golfer): id, your name and sex, your skills under the round's pressure (gameSkills), their
 *  average as his skill, look 0 (T240 gives the looks), the white tees unless you pick others. Money matches (T244) and the tournament (T246) take it */
export function playerGolfer(p: PlayerProfile, id: number, pressure: number, tees: TeeKind = 'middle'): Golfer {
  const skills = gameSkills(p.skills, pressure);
  return { id, name: p.name, sex: p.sex, pro: false, skill: (skills.driving + skills.irons + skills.short + skills.putting) / 4, look: 0, tees, skills };
}

/** you book a tee time at least this many minutes ahead (the walk to the first tee) */
export const BOOK_LEAD = 15;
/** your tee time keeps at least this far from every group's on the sheet (game minutes: half the sheet's gap, the owner squeezes in) */
export const BOOK_GAP = DAY_TEE_GAP / 2;
/** the first tee time you can book on a day's sheet from minute `minute`: BOOK_LEAD ahead at least, from DAY_FIRST_TEE to DAY_LAST_TEE, BOOK_GAP clear of
 *  every group's tee time; null when none is left today */
export function freeTee(roster: Pick<DayRoster, 'groups'> | null, minute: number): number | null {
  const tees = roster?.groups.map(g => g.tee) ?? [];
  for (let t = Math.max(DAY_FIRST_TEE, Math.ceil(minute + BOOK_LEAD)); t <= DAY_LAST_TEE; t++) if (tees.every(x => Math.abs(x - t) >= BOOK_GAP)) return t;
  return null;
}

/** your round booked at a tee time on a town day, played with your game as it is now */
export function bookRound(p: PlayerProfile, day: number, tee: number): PlayerProfile { return { ...p, booked: { day, tee, skills: gameSkills(p.skills, PRESSURE.everyday) } }; }
/** after a session: your round booked today and not begun (before its walk to the tee) plays with your game as it is now */
export function rebook(p: PlayerProfile, day: number, minute: number): PlayerProfile {
  const b = p.booked; if (!b || b.day !== day || minute >= b.tee - BOOK_LEAD) return p;
  return { ...p, booked: { day, tee: b.tee, skills: gameSkills(p.skills, PRESSURE.everyday) } };
}
/** your golfer in the everyday round you booked: as playerGolfer, with the booking's game */
export function bookedGolfer(p: PlayerProfile, b: Booking): Golfer {
  const s = b.skills;
  return { id: 0, name: p.name, sex: p.sex, pro: false, skill: (s.driving + s.irons + s.short + s.putting) / 4, look: 0, tees: 'middle', skills: { ...s } };
}

/** the day's roster with you on it (the playback's, not the day book's: you pay no green fee and bring no car): your golfer as the next id, alone in a
 *  group at your tee time, added last (the round orders the groups by tee time, so the others keep their indices and their play: each golfer's stream
 *  is his own; only the waits behind you can move) */
export function withYou(roster: DayRoster, you: Golfer, tee: number): DayRoster {
  const id = roster.golfers.length, g: Golfer = { ...you, id };
  const info = { member: true, size: 1, arrive: tee - BOOK_LEAD, checkIn: tee - BOOK_LEAD, tee, fee: 0, cars: 0 };
  const infos = [...roster.info, info], order = infos.map((_, i) => i).sort((a, b) => infos[a]!.checkIn - infos[b]!.checkIn || a - b);
  return { ...roster, golfers: [...roster.golfers, g], groups: [...roster.groups, { tee, players: [id] }], info: infos, order };
}

/** a minute of the day as hh:mm */
export function clock(m: number): string { const h = Math.floor(m / 60) % 24, mi = Math.floor(m % 60); return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; }
/** strokes against par as golfers say it: E, +3, -2 */
export const toParWord = (d: number): string => d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;

/** a practice entry as the log reads: "Bucket 10:15: driving +1.1, irons +0.9 ($6)" */
export function entryText(e: PracticeEntry): string {
  const g = SKILL_IDS.filter(k => e.gains[k] !== undefined).map(k => `${SKILL_NAME[k].toLowerCase()} +${e.gains[k]!.toFixed(1)}`).join(', ');
  return `${PRACTICE[e.kind].name} at ${clock(e.at)}: ${g}${e.lesson ? ' (with a lesson)' : ''}`;
}

/** the "You" block of the range card and its practice greens' rows: your handicap, and each session's cost, minutes, gains and why not */
export interface YouPracticeView { kind: PracticeKind; name: string; cost: number; min: number; gains: { id: SkillId; name: string; from: number; to: number; gain: number }[]; hcp: [number, number]; why: string | null }
export interface YouRangeView { name: string; hcp: number; hcpText: string; busy: string | null; sessions: YouPracticeView[]; last: { text: string; hcp: [number, number]; cost: number; day: number } | null }
/** the range card's view of you (built when the card is drawn, from the profile and each place's PracticeCtx) */
export function youRangeView(p: PlayerProfile, ctx: Record<PracticeKind, PracticeCtx>, lesson: Lesson | null = null): YouRangeView {
  const day = ctx.bucket.day, h = handicapOf(p.skills), u = busyUntil(p, day), last = p.log[p.log.length - 1];
  return {
    name: p.name, hcp: h, hcpText: hcpText(h), busy: u !== null && ctx.bucket.minute < u ? `Practising until ${clock(u)}` : null,
    sessions: PRACTICE_KINDS.map(kind => {
      const pv = practicePreview(p, kind, day, lesson), c = ctx[kind];
      return { kind, name: PRACTICE[kind].name, cost: c.price + (lesson?.price ?? 0), min: PRACTICE[kind].min, gains: pv.gains.map(g => ({ ...g, name: SKILL_NAME[g.id] })), hcp: pv.hcp, why: practiceWhy(p, kind, c, lesson) };
    }),
    last: last ? { text: entryText(last), hcp: last.hcp, cost: last.cost, day: last.day } : null,
  };
}

/** your round today as the profile card shows it: none booked (with the next tee time you can book, or why not), booked (the tee time), out on the
 *  course, or done (the score) */
export type RoundState = { k: 'none'; next: number | null; why: string | null } | { k: 'booked'; tee: number } | { k: 'out'; tee: number } | { k: 'done'; strokes: number; par: number };
/** the profile card ("Your golf"): name, handicap, the skills with what each plays, your round today, the practice log and the rounds (newest first) */
export interface PlayerCardView {
  name: string; sex: Sex; hcp: number; hcpText: string;
  skills: { id: SkillId; name: string; value: number; what: string }[];
  round: RoundState;
  log: { text: string; day: number; cost: number; hcp: [number, number] }[];
  rounds: { day: number; kind: RoundKind; strokes: number; par: number; text: string }[];
}
export function playerCardView(p: PlayerProfile, round: RoundState): PlayerCardView {
  const h = handicapOf(p.skills);
  return {
    name: p.name, sex: p.sex, hcp: h, hcpText: hcpText(h),
    skills: SKILL_IDS.map(id => ({ id, name: SKILL_NAME[id], value: p.skills[id], what: SKILL_WHAT[id] })),
    round,
    log: p.log.slice(-8).reverse().map(e => ({ text: entryText(e), day: e.day, cost: e.cost, hcp: e.hcp })),
    rounds: p.rounds.slice(-6).reverse().map(r => ({ day: r.day, kind: r.kind, strokes: r.strokes, par: r.par, text: `${r.strokes} (${toParWord(r.strokes - r.par)})${r.holes !== 18 ? ` over ${r.holes}` : ''}` })),
  };
}
