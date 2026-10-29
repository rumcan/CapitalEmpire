// Everyday golf (T208, #553; docs/GOLF-PLAY.md "Everyday golf"): between tournaments the club's members and visitors play the course every town day.
// The day's tee sheet (the roster: who comes, in twos, threes and fours, at which tee time, members or paying visitors) is drawn from the seed and the
// day, from what the club was at the day's start (the course's quality, the reputation, the holes, the members). The round is played with the golf
// play model (play/round.ts playRound: T211's Field, so the groups wait for each other as a tournament field does). The green fees are booked as each
// group checks in at the clubhouse; members pay nothing on the day (their dues are the memberships). Pure TS, no DOM; times are game minutes of the town day.
import { SEASON_LEN } from './calendar';
import { dailyGolfers, GREEN_FEE_PER_ROUND, greenFeeIncome, monthlyMembershipIncome, OFF_SEASON_PLAY_DAYS } from './yearend';
import { AM_SKILL, GOLFER_NAMES } from './play/field';
import { playRound } from './play/round';
import { dayEntourage } from './play/entourage';
import { rng } from './play/shot';
import { everydaySet } from './teesets';
import type { CourseView, Golfer, Group, RoundPlan, Sex } from './play/types';
import type { CrewCardView } from './staff';

/** the first and the last everyday tee time (07:00 and 15:00: an 18-hole round of about four and a half hours is in by the clubhouse's 19:00 close) */
export const DAY_FIRST_TEE = 420, DAY_LAST_TEE = 900;
/** the least gap between two everyday tee times (game minutes): the tee sheet holds (DAY_LAST_TEE - DAY_FIRST_TEE) / TEE_GAP + 1 groups, and the
 *  golfers past that are turned away */
export const DAY_TEE_GAP = 8;
/** the club's monthly dues per member ($): the members are monthlyMembershipIncome / MEMBER_DUES (T214 prices memberships properly) */
export const MEMBER_DUES = 50;
/** the share of the members who play on a given day */
export const MEMBER_PLAY = 0.35;
/** the day-to-day spread of the visitors: a day has dailyGolfers x (1 +- DAY_SPREAD), uniform */
export const DAY_SPREAD = 0.15;
/** the group sizes and their shares (twos, threes, fours) */
const SIZES: readonly (readonly [number, number])[] = [[2, 0.25], [3, 0.3], [4, 0.45]];
/** a group's car parks this many minutes before its tee time, plus up to ARRIVE_JITTER more */
export const ARRIVE_LEAD = 25, ARRIVE_JITTER = 10;
/** the walk from the car park to the clubhouse's desk (game minutes, nominal: the green fee is paid at check-in, ARRIVE + this) */
export const DESK_WALK = 3;
/** the skill of the everyday golfers: visitors are club amateurs (the field's tier-1 amateurs), members a little better */
export const VISITOR_SKILL = AM_SKILL[0]!, MEMBER_SKILL: readonly [number, number] = [0.25, 0.55];
/** the share of men among the everyday golfers */
export const MEN = 0.7;

/** T208, the pace term: how the course plays feeds the reputation at the season's end. A group's average wait on the group ahead over its round, in
 *  minutes (round.ts pace.waits): at PACE_WAIT_OK or less the course plays well (PACE_REP_GOOD), at PACE_WAIT_SLOW or more it is slow and crowded
 *  (PACE_REP_SLOW), linear between. Rounded to whole points */
export const PACE_WAIT_OK = 5, PACE_WAIT_SLOW = 30, PACE_REP_GOOD = 1, PACE_REP_SLOW = -3;

/** what the club was at the day's start: the course's quality score (0..100), the reputation (0..100) and the holes, and an optional busy day (the
 *  bench's: this many visitors in place of dailyGolfers) */
export interface DayInputs { quality: number; rep: number; holes: number; busy?: number }
/** a group on the day's tee sheet: members or visitors, its golfers' count, when its car parks (arrive), when it checks in and pays at the clubhouse
 *  (checkIn), its tee time, the green fees it pays ($, before the scale: 0 for members) and its cars (one per two golfers) */
export interface DayGroup { member: boolean; size: number; arrive: number; checkIn: number; tee: number; fee: number; cars: number }
/** the day's roster: the town day it is for, the seed of its round, the golfers (ids 0..n-1) and the groups (playRound's), each group's tee-sheet line, the
 *  groups in check-in order (indices), the members and the visitors who play, the visitors turned away (the tee sheet was full), and the green fees ($,
 *  before the scale) */
export interface DayRoster { day: number; seed: number; golfers: Golfer[]; groups: Group[]; info: DayGroup[]; order: number[]; members: number; visitors: number; turned: number; fees: number }

/** the club's members: the membership dues a month (yearend.ts monthlyMembershipIncome) over MEMBER_DUES */
export function clubMembers(quality: number, rep: number, holes: number): number { return Math.round(monthlyMembershipIncome(quality, rep, holes) / MEMBER_DUES); }

/** the billing days one town day of play stands for: the season's OFF_SEASON_PLAY_DAYS over the town days in a season (SEASON_LEN sim s of the
 *  season clock over the town day's dayLen sim s). A visitor's green fee is booked times this, so a season of play books about greenFeeIncome
 *  (yearend.ts: dailyGolfers x GREEN_FEE_PER_ROUND x OFF_SEASON_PLAY_DAYS), as the range scales its golfers (rangesave.ts rangeScale) */
export function feeScale(dayLen: number): number { return OFF_SEASON_PLAY_DAYS * Math.max(24, dayLen) / SEASON_LEN; }

/** the seed of a town day's play from the game's seed */
export function daySeed(seed: number, day: number): number { return Math.floor(rng(seed, -7, day)() * 4294967296); }

/** a group's sizes for n golfers: twos, threes and fours by SIZES; a last single joins a group with room, or makes a two with one from a four */
function groupSizes(n: number, r: () => number): number[] {
  const out: number[] = [];
  let left = n;
  while (left > 0) {
    let u = r(), s = 4;
    for (const [k, p] of SIZES) { if (u < p) { s = k; break; } u -= p; }
    s = Math.min(s, left); out.push(s); left -= s;
  }
  const last = out.length - 1;
  if (out.length > 1 && out[last] === 1) {
    const room = out.findIndex(s => s < 4);
    if (room >= 0 && room !== last) { out[room]!++; out.pop(); }
    else { const four = out.findIndex(s => s === 4); if (four >= 0) { out[four] = 3; out[last] = 2; } }
  }
  return out;
}

/** the day's roster (deterministic from the seed and the day): the members who play (MEMBER_PLAY of clubMembers), the visitors (dailyGolfers, or the
 *  busy count, times 1 +- DAY_SPREAD), in groups of two to four, members and visitors apart; the tee times evenly from DAY_FIRST_TEE to DAY_LAST_TEE
 *  (at least DAY_TEE_GAP apart, jittered within the gap), the members' groups a little earlier on the sheet. When the sheet is full the last visitors'
 *  groups are turned away. Each group parks ARRIVE_LEAD (+ up to ARRIVE_JITTER) before its tee time and checks in DESK_WALK later, paying its
 *  visitors' green fees. No holes: nobody plays */
export function dayRoster(seed: number, day: number, inp: DayInputs): DayRoster {
  const s = daySeed(seed, day), r = rng(s, -2, 0);
  const empty: DayRoster = { day, seed: s, golfers: [], groups: [], info: [], order: [], members: 0, visitors: 0, turned: 0, fees: 0 };
  if (inp.holes <= 0) return empty;
  const memN = Math.round(clubMembers(inp.quality, inp.rep, inp.holes) * MEMBER_PLAY * (1 + DAY_SPREAD * (2 * r() - 1)));
  const visN = Math.round((inp.busy ?? dailyGolfers(inp.quality, inp.rep, inp.holes)) * (1 + DAY_SPREAD * (2 * r() - 1)));
  // the groups (members' first), each with a key for its place on the sheet: the members' a little earlier
  const gs: { member: boolean; size: number; key: number }[] = [];
  for (const sz of groupSizes(Math.max(0, memN), r)) gs.push({ member: true, size: sz, key: 0.75 * r() });
  for (const sz of groupSizes(Math.max(0, visN), r)) gs.push({ member: false, size: sz, key: r() });
  gs.sort((a, b) => a.key - b.key);
  // the tee sheet: at most cap groups; the visitors' groups past it are turned away (the members' always get on)
  const cap = Math.floor((DAY_LAST_TEE - DAY_FIRST_TEE) / DAY_TEE_GAP) + 1;
  let turned = 0;
  while (gs.length > cap) { let i = gs.length - 1; while (i >= 0 && gs[i]!.member) i--; if (i < 0) i = gs.length - 1; turned += gs[i]!.member ? 0 : gs[i]!.size; gs.splice(i, 1); }
  const n = gs.length, step = n > 1 ? (DAY_LAST_TEE - DAY_FIRST_TEE) / (n - 1) : 0, slack = Math.max(0, step - DAY_TEE_GAP) / 2;
  const golfers: Golfer[] = [], groups: Group[] = [], info: DayGroup[] = [], used = new Set<string>();
  let members = 0, visitors = 0, fees = 0;
  gs.forEach((g, k) => {
    const tee = Math.round(DAY_FIRST_TEE + k * step + (k > 0 && k < n - 1 ? slack * (2 * r() - 1) : 0));
    const players: number[] = [];
    for (let j = 0; j < g.size; j++) {
      const id = golfers.length, sex: Sex = r() < MEN ? 'm' : 'w', firsts = GOLFER_NAMES[sex];
      let name: string, tries = 0;
      do name = `${firsts[Math.floor(r() * firsts.length)]} ${GOLFER_NAMES.last[Math.floor(r() * GOLFER_NAMES.last.length)]}`; while (used.has(name) && ++tries < 20);
      used.add(name);
      const [lo, hi] = g.member ? MEMBER_SKILL : VISITOR_SKILL;
      const skill = lo + (hi - lo) * r();
      // T254: his tee set: the ladies and the beginners the red, the seniors the yellow (his own draw, so the roster's stream is as before), the rest the white
      golfers.push({ id, name, sex, pro: false, skill, look: Math.floor(r() * 5), tees: everydaySet(sex, skill, rng(s, -8, id)()) });
      players.push(id);
    }
    const arrive = tee - ARRIVE_LEAD - ARRIVE_JITTER * r(), fee = g.member ? 0 : g.size * GREEN_FEE_PER_ROUND;
    groups.push({ tee, players });
    info.push({ member: g.member, size: g.size, arrive, checkIn: arrive + DESK_WALK, tee, fee, cars: Math.ceil(g.size / 2) });
    if (g.member) members += g.size; else visitors += g.size;
    fees += fee;
  });
  const order = info.map((_, i) => i).sort((a, b) => info[a]!.checkIn - info[b]!.checkIn || a - b);
  // T213: the visitors ride carts, two to a cart; the members' groups walk half the time
  dayEntourage(golfers, groups, info.map(g => g.member), s);
  return { day, seed: s, golfers, groups, info, order, members, visitors, turned, fees };
}

/** the course an everyday round plays: each hole once (a 9-hole course is a 9-hole round; the tournament plays it twice, courseview.ts). So a group on its
 *  second nine never shares a green with a group on its first: T211's field orders the groups per hole of the round, not per green */
export function dayCourse(view: CourseView): CourseView {
  const H = view.holes, k = H.findIndex((h, i) => i > 0 && h.line === H[0]!.line);
  return k > 0 ? { holes: H.slice(0, k), lieAt: view.lieAt } : view;
}

/** the day's round on the course (play/round.ts playRound with the roster's golfers, groups and seed): every group's holes in time order, the waits on the
 *  group ahead (T211) and each golfer's done minute */
export function dayPlan(view: CourseView, roster: DayRoster): RoundPlan { return playRound(view, roster.golfers, roster.groups, roster.seed); }

/** the check-ins due by minute m after `paid` of them (in check-in order, roster.order): how many are paid now, and the green fees they pay ($, before the
 *  scale), the members and the visitors who checked in */
export function checkInsTo(roster: DayRoster, paid: number, m: number): { paid: number; fees: number; members: number; visitors: number } {
  let k = paid, fees = 0, members = 0, visitors = 0;
  while (k < roster.order.length && roster.info[roster.order[k]!]!.checkIn <= m) {
    const g = roster.info[roster.order[k]!]!; fees += g.fee; if (g.member) members += g.size; else visitors += g.size; k++;
  }
  return { paid: k, fees, members, visitors };
}

/** a day's pace: the groups that played, their waits on the group ahead (minutes, summed over the day: plan.pace.waits, finite ones), the slowest group's
 *  wait, and the average round (minutes, tee time to the group's last golfer done) */
export interface DayPace { groups: number; waitMin: number; worstMin: number; roundMin: number }
export function dayPace(plan: RoundPlan): DayPace {
  const G = plan.groups.length, per = new Array<number>(G).fill(0);
  for (const w of plan.pace?.waits ?? []) if (Number.isFinite(w.to)) per[w.group]! += w.to - w.from;
  let round = 0, n = 0;
  plan.groups.forEach(gr => { const d = Math.max(...gr.players.map(id => plan.done[id] ?? 0)); if (Number.isFinite(d)) { round += d - gr.tee; n++; } });
  return { groups: G, waitMin: per.reduce((a, b) => a + b, 0), worstMin: G ? Math.max(...per) : 0, roundMin: n ? round / n : 0 };
}

/** the pace term (T208): the reputation points for an average wait per group of `avgWait` minutes (see PACE_WAIT_OK, PACE_WAIT_SLOW); 0 with no play */
export function paceReputation(avgWait: number, groups: number): number {
  if (!(groups > 0)) return 0;
  const u = Math.min(1, Math.max(0, (avgWait - PACE_WAIT_OK) / (PACE_WAIT_SLOW - PACE_WAIT_OK)));
  return Math.round(PACE_REP_GOOD + (PACE_REP_SLOW - PACE_REP_GOOD) * u);
}

/** the season's everyday play so far (the save): the days played, the members' and the visitors' rounds, the visitors turned away, the green fees booked
 *  ($, scaled: what went into the treasury), the groups and their waits (minutes, summed) for the pace term */
export interface DaySeason { days: number; members: number; visitors: number; turned: number; fees: number; groups: number; waitMin: number }
export const emptySeason = (): DaySeason => ({ days: 0, members: 0, visitors: 0, turned: 0, fees: 0, groups: 0, waitMin: 0 });
/** the season's pace term (paceReputation of its average wait per group) */
export function seasonPaceRep(s: DaySeason): number { return paceReputation(s.groups > 0 ? s.waitMin / s.groups : 0, s.groups); }

/** everyday golf as the save keeps it (GolfSave.everyday): the town day in play and what the club was at its start (the roster comes back from them and
 *  the seed), how many of its check-ins are paid, whether the day was closed for a tournament (no play), the visitors and members checked in today,
 *  the fees booked today ($, scaled), and the season so far */
export interface DaySave { day: number; inp: DayInputs; paid: number; closed: boolean; today: { members: number; visitors: number; fees: number }; season: DaySeason }

/** a finite number, else d */
const num = (v: unknown, d = 0): number => typeof v === 'number' && Number.isFinite(v) ? v : d;
/** a saved everyday day, or null when it is not well formed */
export function normalizeDaySave(s: Partial<DaySave> | null | undefined): DaySave | null {
  if (!s || typeof s.day !== 'number' || !Number.isFinite(s.day) || !s.inp) return null;
  const i = s.inp, se = (s.season ?? {}) as Partial<DaySeason>, t = (s.today ?? {}) as Partial<DaySave['today']>;
  const inp: DayInputs = { quality: num(i.quality), rep: num(i.rep), holes: num(i.holes) };
  if (typeof i.busy === 'number' && Number.isFinite(i.busy)) inp.busy = i.busy;
  return {
    day: s.day, inp, paid: Math.max(0, Math.floor(num(s.paid))), closed: !!s.closed,
    today: { members: num(t.members), visitors: num(t.visitors), fees: num(t.fees) },
    season: { days: num(se.days), members: num(se.members), visitors: num(se.visitors), turned: num(se.turned), fees: num(se.fees), groups: num(se.groups), waitMin: num(se.waitMin) },
  };
}

/** the clubhouse card (T208, ui/golf/ClubhouseCard.tsx): whether the course is open today (closed on a tournament day), the minute; today: the members and
 *  visitors on the tee sheet, those checked in so far, the green fees booked ($, scaled), the visitors turned away, the golfers out on the course and the
 *  cars in the car park now, the next tee time (null: none left), the groups waiting on the group ahead now, the waits so far (minutes, summed, and per
 *  group teed off) and the longest; the season: days played, members' and visitors' rounds, fees booked ($), the expectation (greenFeeIncome), the
 *  average wait per group and the pace term; the club's members, the green fee and the scale */
export interface ClubCardView {
  open: boolean; minute: number;
  today: { members: number; visitors: number; inMembers: number; inVisitors: number; fees: number; turned: number; out: number; parked: number; next: number | null; waiting: number; waitMin: number; waitAvg: number; worst: number };
  season: { days: number; members: number; visitors: number; fees: number; expected: number; waitAvg: number; paceRep: number };
  clubMembers: number; fee: number; scale: number;
  /** T237: the car parks within walking distance of the door (golf/walkserve.ts), nearest walk first (the engine adds them) */
  lots?: { id: number; bays: number; m: number }[];
  /** T269: the grounds crew (golf/staff.ts crewCard; the engine adds it) */
  crew?: CrewCardView;
}

/** the clubhouse card's view from the day book, the day's playback (null: none: a tournament day, no holes) and the minute */
export function clubCardView(bk: DayBook, dv: { plan: RoundPlan; outNow(m: number): number; parkedNow(m: number): number } | null, minute: number, free: boolean, rep: number, scale: number): ClubCardView {
  const s = bk.save, r = bk.rosterOf(), se = bk.season(), inp = s?.inp ?? { quality: 0, rep, holes: 0 };
  let waitMin = 0, worst = 0, waiting = 0, teed = 0;
  if (dv) {
    const per = new Map<number, number>();
    for (const w of dv.plan.pace?.waits ?? []) if (w.from <= minute) { const d = Math.min(w.to, minute) - w.from; per.set(w.group, (per.get(w.group) ?? 0) + d); waitMin += d; if (w.to > minute) waiting++; }
    for (const v of per.values()) worst = Math.max(worst, v);
    teed = dv.plan.groups.filter(g => g.tee <= minute).length;
  }
  const next = r ? r.groups.map(g => g.tee).find(t => t > minute) ?? null : null;
  return {
    open: free && !!s && !s.closed, minute,
    today: {
      members: r?.members ?? 0, visitors: r?.visitors ?? 0, inMembers: s?.today.members ?? 0, inVisitors: s?.today.visitors ?? 0, fees: s?.today.fees ?? 0, turned: r?.turned ?? 0,
      out: dv ? dv.outNow(minute) : 0, parked: dv ? dv.parkedNow(minute) : 0, next, waiting, waitMin, waitAvg: teed ? waitMin / teed : 0, worst,
    },
    season: { days: se.days, members: se.members, visitors: se.visitors, fees: se.fees, expected: greenFeeIncome(inp.quality, inp.rep, inp.holes), waitAvg: se.groups ? se.waitMin / se.groups : 0, paceRep: seasonPaceRep(se) },
    clubMembers: clubMembers(inp.quality, inp.rep, inp.holes), fee: GREEN_FEE_PER_ROUND, scale,
  };
}

/** what a step booked: the green fees ($, scaled) and the members and visitors who checked in */
export interface DayBooked { fees: number; members: number; visitors: number }

/** the club's everyday play through the town days (the engine steps it every frame): it keeps the save (DaySave), starts each town day from what the
 *  club is then (inputs), books the check-ins as the minute passes them (times the scale), closes a day on a tournament (the round not free: no play,
 *  the paid fees stay), and at each new day settles the last: its check-ins not booked yet (a skip jumps them) and its pace (the engine plays the day:
 *  pace). The days a skip jumps over whole are booked the same way, from the club as it is now. A day already under way when there is no save (a new
 *  game, a save from before T208) books only the check-ins still to come */
export class DayBook {
  save: DaySave | null; private seed: number;
  private roster: DayRoster | null = null;
  constructor(seed: number, save: DaySave | null) { this.seed = seed; this.save = save; }
  /** the roster of the day in play (built once per day) */
  rosterOf(): DayRoster | null {
    const s = this.save; if (!s) return null;
    if (!this.roster || this.roster.day !== s.day) this.roster = dayRoster(this.seed, s.day, s.inp);
    return this.roster;
  }
  /** steps to town day `day`, minute `minute`: free (the round is free: no tournament day), the club's inputs now, the fee scale (feeScale), and the pace
   *  of a day's roster (null: not worked out). Returns what was booked now */
  step(day: number, minute: number, free: boolean, inputs: () => DayInputs, scale: number, pace: (r: DayRoster) => DayPace | null): DayBooked {
    const out: DayBooked = { fees: 0, members: 0, visitors: 0 };
    const add = (c: { fees: number; members: number; visitors: number }, s: DaySeason) => { const f = c.fees * scale; out.fees += f; out.members += c.members; out.visitors += c.visitors; s.fees += f; s.members += c.members; s.visitors += c.visitors; };
    let s = this.save;
    if (!s || day < s.day) {
      const inp = inputs(), r = dayRoster(this.seed, day, inp);
      this.save = { day, inp, paid: checkInsTo(r, 0, minute).paid, closed: !free, today: { members: 0, visitors: 0, fees: 0 }, season: s?.season ?? emptySeason() };
      this.roster = r;
      return out;
    }
    if (day > s.day) {
      // the day in play ends: its check-ins still due (unless a tournament closed it, or begins now), its pace, its turned away
      const season = s.season;
      const settle = (r: DayRoster, from: number) => {
        add(checkInsTo(r, from, Infinity), season);
        const p = pace(r); if (p) { season.groups += p.groups; season.waitMin += p.waitMin; }
        season.days++; season.turned += r.turned;
      };
      if (!s.closed && free) settle(this.rosterOf()!, s.paid);
      // the days a skip jumped over whole (free: no tournament on them), from the club as it is now
      if (free) for (let d = s.day + 1; d < day; d++) settle(dayRoster(this.seed, d, inputs()), 0);
      s = this.save = { day, inp: inputs(), paid: 0, closed: !free, today: { members: 0, visitors: 0, fees: 0 }, season };
    }
    if (!free) { s.closed = true; return out; }
    if (s.closed) return out;
    const r = this.rosterOf()!, c = checkInsTo(r, s.paid, minute);
    if (c.paid === s.paid) return out;
    s.paid = c.paid; add(c, s.season);
    s.today.fees += c.fees * scale; s.today.members += c.members; s.today.visitors += c.visitors;
    return out;
  }
  /** the season's play so far, then a fresh season (the tournament closes the season) */
  endSeason(): DaySeason { const s = this.save; if (!s) return emptySeason(); const out = s.season; s.season = emptySeason(); return out; }
  /** the season's play so far (empty with no save) */
  season(): DaySeason { return this.save?.season ?? emptySeason(); }
}
