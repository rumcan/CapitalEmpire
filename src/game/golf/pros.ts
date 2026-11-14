// T214 (#559; docs/plans/P26.md sections 2-3 and 5.2, phases 3-4): the club's pros. Two buildings the player places with a ghost (the pro's office
// beside the clubhouse, a teaching hut at the range's mats or a practice green), the staff hired into them on the Staff card (the head pro and the
// membership secretary at the office, a teaching pro a hut), their wages on T269's one wage book (golf/staff.ts payWages), the lessons they give
// (a month's lessons from the range's own counts, the members' lessons, and yours: a lesson booked with a pro raises your next practice session's
// gains, golf/player.ts Lesson), and where each stands in the world through the working day (proPose: 3 to 6 movers). Pure TS, no DOM; tiles,
// dollars, game months, game minutes of the town day and sim seconds.
import type { Pt } from '../network';
import { practicePath } from './menu-path';
import { facing } from '../ext/pedestrians';
import { GOLFER_NAMES } from './play/field';
import { LESSON, LESSON_SHARE } from './rangesave';
import { J_BASE, J_PRO, J_SEC, C_PRO, C_SEC } from './club';
import { CLUB_MAX, CLUB_WAGE, clubOf, type ClubRole, type LessonSeen, type ProHire, type StaffState } from './staff';

// ---- the buildings (P26 3.1) ----
/** what each costs to build ($) and its upkeep a month ($, booked with the wages as each game month begins: P26.D3) */
export const OFFICE_COST = 14000, HUT_COST = 4000, OFFICE_UPKEEP = 80, HUT_UPKEEP = 25;
/** the pro's office: its footprint within this many tiles (60 m) of the clubhouse's, its front within OFFICE_PATH_GAP of a path, drive or road */
export const OFFICE_CLUB_REACH = 30, OFFICE_PATH_GAP = 2;
/** a teaching hut: within this many tiles (16 m) of the range's mats or a practice green's area; at most HUT_MAX (one a place) */
export const HUT_REACH = 8, HUT_MAX = 3;
/** where a teaching hut teaches */
export type HutAt = 'range' | 'putting' | 'chipping';
export const HUT_ATS: readonly HutAt[] = ['range', 'putting', 'chipping'];
export const HUT_NAME: Readonly<Record<HutAt, string>> = { range: 'Range hut', putting: 'Putting green hut', chipping: 'Chipping green hut' };
/** the stand-ins' labels (docs/AGENT-BRIEF.md: "Stand In for <name>") until art 53-55 lands (GOLF-SPRITES.md) */
export const OFFICE_LABEL = "Stand In for pro's office", HUT_LABEL = 'Stand In for teaching hut', DESK_SIGN_LABEL = 'Stand In for membership desk sign';

type Rect4 = readonly [number, number, number, number];
/** the points of footprint r the checks sample: a lattice of half tiles */
function samples(r: Rect4): Pt[] {
  const out: Pt[] = [], [x, y, w, h] = r, nx = Math.max(2, Math.ceil(w / 0.5)), ny = Math.max(2, Math.ceil(h / 0.5));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) out.push({ x: x + 0.05 + (w - 0.1) * i / nx, y: y + 0.05 + (h - 0.1) * j / ny });
  return out;
}
/** the gap between two rects (x, y, w, h), tiles (0 when they touch or overlap) */
export const rectGap = (a: Rect4, b: Rect4): number => Math.hypot(Math.max(0, b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2])), Math.max(0, b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3])));

/** what the land checks read of the map (both buildings) */
export interface LandSpot {
  /** the tile is the player's land */
  owned(x: number, y: number): boolean;
  /** what the course has at a tile: 'play' (a fairway, green, tee, bunker or water), else '' */
  surf(x: number, y: number): 'play' | '';
  /** the room check: why something already stands there ('' when the ground is free): a building, a car park, the range's structures */
  room: string;
  money: number;
}
/** the land's reasons, in the order a player fixes them ('' when it is fine) */
function landWhy(r: Rect4, s: LandSpot): string {
  const pts = samples(r);
  if (!pts.every(p => s.owned(p.x, p.y))) return 'On your land';
  if (pts.some(p => s.surf(p.x, p.y) === 'play')) return 'Off the fairways, greens, tees, bunkers and water';
  return s.room;
}
/** the pro's office's spot: how many stand, the clubhouse's footprint (null: none built), the gap from the footprint to a path's verge (below 0:
 *  on it; Infinity: none near) */
export interface OfficeSpot extends LandSpot { count: number; clubhouse: Rect4 | null; pathGap: number }
/** why the pro's office cannot stand on footprint r ('' when it can), in the order a player fixes them */
export function officeSpotWhy(r: Rect4, s: OfficeSpot): string {
  if (s.count >= 1) return "One pro's office per club";
  if (!s.clubhouse) return "Build the clubhouse first: the pro's office stands beside it";
  const land = landWhy(r, s); if (land) return land;
  if (rectGap(r, s.clubhouse) > OFFICE_CLUB_REACH) return `Near the clubhouse: within ${OFFICE_CLUB_REACH * 2} m of it`;
  if (s.pathGap < 0) return 'Not on the path: beside it';
  if (s.pathGap > OFFICE_PATH_GAP) return 'Its front on a path, drive or road: draw one to it (Course › Cart paths & roads)';
  if (OFFICE_COST > s.money) return `Not enough money: the pro's office costs $${OFFICE_COST.toLocaleString()}`;
  return '';
}
/** a place a hut may teach at: the range's mats (the tee box's box), a practice green's area; open: it is built (a green that is open) */
export interface HutPlace { at: HutAt; rect: Rect4; open: boolean }
/** a teaching hut's spot: the huts standing (where each teaches) and the places */
export interface HutSpot extends LandSpot { huts: readonly HutAt[]; places: readonly HutPlace[] }
/** where a hut on footprint r teaches: the nearest open place within HUT_REACH with no hut yet (null: none) */
export function hutPlace(r: Rect4, s: Pick<HutSpot, 'huts' | 'places'>): HutAt | null {
  let best: HutAt | null = null, bd = Infinity;
  for (const p of s.places) { if (!p.open || s.huts.includes(p.at)) continue; const d = rectGap(r, p.rect); if (d <= HUT_REACH && d < bd) { bd = d; best = p.at; } }
  return best;
}
/** why a teaching hut cannot stand on footprint r ('' when it can), in the order a player fixes them */
export function hutSpotWhy(r: Rect4, s: HutSpot): string {
  if (s.huts.length >= HUT_MAX) return `At most ${HUT_MAX} teaching huts: one at the range and one a practice green`;
  const open = s.places.filter(p => p.open);
  if (!open.length) return 'A hut teaches at the driving range or a practice green: build one first';
  if (open.every(p => s.huts.includes(p.at))) return 'Every range and practice green has its hut';
  const land = landWhy(r, s); if (land) return land;
  if (!hutPlace(r, s)) {
    const near = open.find(p => rectGap(r, p.rect) <= HUT_REACH);
    return near ? `The ${HUT_NAME[near.at].toLowerCase()} stands already: one hut a place` : `By the range's mats or a practice green: within ${HUT_REACH * 2} m of one`;
  }
  if (HUT_COST > s.money) return `Not enough money: a teaching hut costs $${HUT_COST.toLocaleString()}`;
  return '';
}

// ---- the staff (P26 2.1-2.2) ----
export const ROLE_TITLE: Readonly<Record<ClubRole, string>> = { head: 'head pro', teach: 'teaching pro', sec: 'membership secretary' };
/** what each role needs: the buildings standing (the office's id, the huts' ids and places), the clubhouse, the holes */
export interface StaffNeeds { clubhouse: boolean; office: number | null; huts: readonly { id: number; at: HutAt }[]; holes: number }
/** why a role cannot be hired now at building `at` ('' when it can) */
export function hireWhy(s: Pick<StaffState, 'pros'>, role: ClubRole, at: number | null, n: StaffNeeds): string {
  const pros = s.pros ?? [];
  if (role === 'teach') {
    if (at === null || !n.huts.some(h => h.id === at)) return `Needs a teaching hut (${practicePath('›')})`;
    if (pros.some(p => p.role === 'teach' && p.at === at)) return 'This hut has its teaching pro';
    return '';
  }
  if (!n.clubhouse) return 'Needs the clubhouse';
  if (n.office === null) return "Needs the pro's office (Course › Buildings)";
  if (pros.some(p => p.role === role)) return `You have a ${ROLE_TITLE[role]}`;
  if (role === 'sec' && !pros.some(p => p.role === 'head')) return 'Needs a head pro on the staff';
  if (role === 'sec' && n.holes < 9) return 'Needs 9 holes: members join a full nine';
  return '';
}
/** a new hire's name from the 1985 lists (the field's), seeded by the map and the hire count; the head pro and the secretary of their sex */
export function proName(seed: number, n: number, sex: 'm' | 'w'): string {
  const r = (k: number) => { let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(n + 1, 0x85ebca6b) ^ Math.imul(k + 7, 0xc2b2ae35)) >>> 0; h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; return (h >>> 0) / 4294967296; };
  const first = GOLFER_NAMES[sex];
  return `${first[Math.floor(r(1) * first.length)]} ${GOLFER_NAMES.last[Math.floor(r(2) * GOLFER_NAMES.last.length)]}`;
}
/** the stand-ins' sexes (P26 3.5: the head pro golf_pro_m2, the teaching pro golf_pro_w1, the secretary spec_w_older_cardigan) */
export const ROLE_SEX: Readonly<Record<ClubRole, 'm' | 'w'>> = { head: 'm', teach: 'w', sec: 'w' };
/** hires a role at building `at` in game month `month` (hireWhy must be ''): its name, paid from the next month (payWages). Returns the new state */
export function hirePro(s: StaffState, role: ClubRole, at: number, month: number, seed: number): { s: StaffState; hire: ProHire } {
  const n = s.hires ?? 0, hire: ProHire = { role, name: proName(seed, n, ROLE_SEX[role]), at, since: Math.floor(month), work: { lessons: 0, takings: 0, sold: 0, kept: 0 } };
  const pros = [...(s.pros ?? []), hire];
  return { s: { ...s, pros, club: clubOf(pros), hires: n + 1 }, hire };
}
/** lets the k-th hire go: a month's wage now (P26 2.2). Null: no such hire */
export function letGoPro(s: StaffState, k: number): { s: StaffState; gone: ProHire; cost: number } | null {
  const pros = s.pros ?? [], gone = pros[k]; if (!gone) return null;
  const left = pros.filter((_, i) => i !== k);
  return { s: withPros(s, left), gone, cost: CLUB_WAGE[gone.role] };
}
/** the state with these hires (the club's counts follow; none: the fields go) */
function withPros(s: StaffState, pros: ProHire[]): StaffState {
  const { pros: _p, club: _c, ...rest } = s;
  return pros.length ? { ...rest, pros, club: clubOf(pros) } : rest;
}
/** the hires whose building is gone (bulldozed) are let go, each with a month's wage (P26 2.2); and a secretary with no head pro left. Returns
 *  the state, the cost and who went (the same state when nobody did) */
export function dropProsAt(s: StaffState, standing: ReadonlySet<number>): { s: StaffState; cost: number; gone: ProHire[] } {
  const pros = s.pros ?? []; if (!pros.length) return { s, cost: 0, gone: [] };
  let keep = pros.filter(p => standing.has(p.at));
  if (!keep.some(p => p.role === 'head')) keep = keep.filter(p => p.role !== 'sec');
  if (keep.length === pros.length) return { s, cost: 0, gone: [] };
  const gone = pros.filter(p => !keep.includes(p));
  return { s: withPros(s, keep), cost: gone.reduce((a, p) => a + CLUB_WAGE[p.role], 0), gone };
}
/** the club staff's wages a month ($) */
export const proWages = (s: Pick<StaffState, 'pros'>): number => (s.pros ?? []).reduce((a, p) => a + CLUB_WAGE[p.role], 0);
/** the most of a role (golf/staff.ts CLUB_MAX), re-exported for the card */
export const ROLE_MAX = CLUB_MAX;

// ---- the lessons (P26 3.2; P26.D4: P24's share and price) ----
/** one lesson an hour per pro: P26's 1,056 a season, in the range's own units (each counted golfer stands for rangeScale customers: 1,056 / 40 /
 *  12 at the 10-minute day) a month */
export const LESSON_CAP = 2.2;
/** a practice-green hut: this share of that green's users take a lesson, at this price ($, times the range's scale) */
export const GREEN_LESSON_SHARE = 0.08, GREEN_LESSON = 12;
/** each member takes MEMBER_LESSONS lessons a season (a twelfth each month) at MEMBER_LESSON ($) while any pro is on the staff */
export const MEMBER_LESSONS = 1, MEMBER_LESSON = 15;
/** what a month's lessons read: the range's lifetime counts now (golf.range: its golfers, each green's users, the academy's lessons), the range's
 *  scale (rangesave.ts rangeScale: customers a counted golfer stands for), the huts with a teaching pro (where each teaches), the members, and
 *  whether any pro (a teaching pro or the head pro) is on the staff */
export interface LessonInputs { counts: LessonSeen; scale: number; huts: readonly HutAt[]; members: number; anyPro: boolean }
/** the lessons booked over `months` months since the counts last seen: each hut's (its share of the new golfers there, the range's after the
 *  academy's own, within LESSON_CAP a month) and the members'. Returns the takings ($) at each place and the members', and the counts now */
export function lessonsMonth(seen: LessonSeen | undefined, i: LessonInputs, months: number): { at: Partial<Record<HutAt, { lessons: number; takings: number }>>; members: { lessons: number; takings: number }; seen: LessonSeen } {
  const c = i.counts, at: Partial<Record<HutAt, { lessons: number; takings: number }>> = {};
  const m = Math.max(0, Math.floor(months));
  if (seen && m > 0) {
    const d = (k: keyof LessonSeen) => Math.max(0, c[k] - seen[k]);
    for (const h of HUT_ATS) {
      if (!i.huts.includes(h)) continue;
      const want = h === 'range' ? Math.max(0, d('range') * LESSON_SHARE - d('academy')) : d(h) * GREEN_LESSON_SHARE;
      const n = Math.min(want, LESSON_CAP * m), price = (h === 'range' ? LESSON : GREEN_LESSON) * i.scale;
      if (n > 0) at[h] = { lessons: n * i.scale, takings: Math.round(n * price) };
    }
  }
  const ml = i.anyPro && m > 0 ? Math.max(0, i.members) * MEMBER_LESSONS / 12 * m : 0;
  return { at, members: { lessons: ml, takings: Math.round(ml * MEMBER_LESSON) }, seen: { ...c } };
}
/** the share of a month's joined the staff sold and the members they kept (P26 4.4-4.5: their sales rates against the base, their renewals) */
export function staffWork(joined: number, members: number, head: boolean, sec: boolean): { head: { sold: number; kept: number }; sec: { sold: number; kept: number } } {
  const all = J_BASE + (head ? J_PRO : 0) + (sec ? J_SEC : 0), j = Math.max(0, joined), M = Math.max(0, members);
  return {
    head: head ? { sold: j * J_PRO / all, kept: M * C_PRO } : { sold: 0, kept: 0 },
    sec: sec ? { sold: j * J_SEC / all, kept: M * C_SEC } : { sold: 0, kept: 0 },
  };
}

// ---- your lesson (T241's hook: golf/player.ts Lesson) ----
/** a lesson with your own pro: the next practice session today gains PLAYER_LESSON_BONUS more (player.ts LESSON_BONUS); it is free (your own
 *  staff) and one a day */
export const PLAYER_LESSON_PRICE = 0;
/** the pros teach from PRO_DAY[0] to PRO_DAY[1] (game minutes of the town day: 07:00 to 18:00) */
export const PRO_DAY: readonly [number, number] = [420, 1080];
/** your lesson as the profile keeps it: the town day it is for, who gives it, and whether it was used */
export interface LessonBooking { day: number; with: string; used: boolean }
/** why you cannot book a lesson now ('' when you can): a pro who teaches (a teaching pro, or the head pro), the hours, one a day */
export function lessonWhy(b: LessonBooking | null | undefined, day: number, minute: number, teaches: boolean): string {
  if (!teaches) return 'Hire a teaching pro (or a head pro) on the Staff card';
  if (b && b.day === day) return b.used ? 'One lesson a day: come back tomorrow' : 'Booked: your next practice session today comes with it';
  if (minute < PRO_DAY[0] || minute >= PRO_DAY[1]) return 'The pros teach from 07:00 to 18:00';
  return '';
}

// ---- the people in the world (P26 3.5) ----
/** a pro's beat: home (his building's door), work (the clubhouse's door for a sale, a mat or a green for a lesson), a seed (his offset in the
 *  day's loop), and whether he shows the swing at work (a teaching pro) */
export interface ProBeat { home: Pt; work: Pt; seed: number; demo: boolean }
/** where a pro stands: point, facing (0-7), walking, the tiles walked (the walk clip's phase), the seconds at work (the swing's clock: -1 not at
 *  work), and how visible (fading in at the day's start and out at its end) */
export interface ProPose { x: number; y: number; face: number; walking: boolean; walked: number; work: number; alpha: number }
/** a person's walk, tiles a sim second (the golfers' WALK_CAP), and the seconds of a beat he stays at home and at work */
export const PRO_WALK = 1.4, PRO_HOME_S = 40, PRO_WORK_S = 30;
/** the minutes over which a pro fades in after PRO_DAY[0] and out before PRO_DAY[1] */
export const PRO_FADE_MIN = 10;
/** a pro at sim second t and minute of the town day (null off duty, 07:00 to 18:00): home, the walk to work, work, the walk home, in a loop */
export function proPose(b: ProBeat, t: number, minute: number, out: ProPose): ProPose | null {
  if (minute < PRO_DAY[0] || minute >= PRO_DAY[1]) return null;
  const dx = b.work.x - b.home.x, dy = b.work.y - b.home.y, L = Math.hypot(dx, dy), walk = L / PRO_WALK, cyc = PRO_HOME_S + PRO_WORK_S + 2 * walk;
  let u = ((t + b.seed * 13.7) % cyc + cyc) % cyc;
  out.alpha = Math.max(0, Math.min(1, (minute - PRO_DAY[0]) / PRO_FADE_MIN, (PRO_DAY[1] - minute) / PRO_FADE_MIN));
  out.walking = false; out.work = -1;
  const toward = (fx: number, fy: number) => { if (L > 1e-6) out.face = facing(fx, fy); };
  if (u < PRO_HOME_S) { out.x = b.home.x; out.y = b.home.y; out.walked = 0; toward(dx, dy); return out; }
  u -= PRO_HOME_S;
  if (u < walk) { const f = u / walk; out.x = b.home.x + dx * f; out.y = b.home.y + dy * f; out.walking = true; out.walked = u * PRO_WALK; toward(dx, dy); return out; }
  u -= walk;
  if (u < PRO_WORK_S) { out.x = b.work.x; out.y = b.work.y; out.walked = 0; out.work = u; toward(-dx, -dy); return out; }
  u -= PRO_WORK_S;
  const f = Math.min(1, u / Math.max(1e-6, walk)); out.x = b.work.x - dx * f; out.y = b.work.y - dy * f; out.walking = true; out.walked = u * PRO_WALK; toward(-dx, -dy);
  return out;
}

// ---- the Staff card (P26 5.2) ----
/** a row: a hire (his index in the hires, name, wage, this season's work in words) or an open role (the reason it is locked, '' to hire) */
export interface StaffRow { key: string; role: ClubRole; title: string; wage: number; at: number | null; hire: { k: number; name: string; work: string } | null; why: string }
export interface StaffSection { key: string; title: string; rows: StaffRow[] }
/** the card: the club staff's wages a month, a section per building (the pro's office, each hut), the season's wages and what they brought in */
export interface StaffCardView { wages: number; sections: StaffSection[]; season: { wages: number; brought: number }; built: boolean }
/** the card's view (the season's wages: the months of the season so far x each hire's wage, from his hiring) */
export function staffCardView(s: Pick<StaffState, 'pros'>, n: StaffNeeds, seasonMonths: number, monthNow: number): StaffCardView {
  const pros = s.pros ?? [], money = (v: number) => `$${Math.round(v).toLocaleString()}`;
  const row = (role: ClubRole, at: number | null): StaffRow => {
    const k = pros.findIndex(p => p.role === role && (role !== 'teach' || p.at === at)), p = pros[k];
    const work = !p ? '' : role === 'teach' ? `${Math.round(p.work.lessons)} lessons, ${money(p.work.takings)} this season`
      : `${Math.round(p.work.sold)} sold, ${Math.round(p.work.kept)} kept${p.work.lessons > 0 ? `, ${Math.round(p.work.lessons)} lessons` : ''} this season`;
    return { key: `${role}:${at ?? ''}`, role, title: ROLE_TITLE[role], wage: CLUB_WAGE[role], at, hire: p ? { k, name: p.name, work } : null, why: p ? '' : hireWhy(s, role, at, n) };
  };
  const sections: StaffSection[] = [{ key: 'office', title: "Pro's office", rows: [row('head', n.office), row('sec', n.office)] }];
  for (const h of n.huts) sections.push({ key: `hut:${h.id}`, title: HUT_NAME[h.at], rows: [row('teach', h.id)] });
  const wages = proWages(s), sm = Math.max(0, seasonMonths);
  const seasonWages = pros.reduce((a, p) => a + CLUB_WAGE[p.role] * Math.max(0, Math.min(sm, monthNow - p.since)), 0);
  const brought = pros.reduce((a, p) => a + p.work.takings, 0);
  return { wages, sections, season: { wages: seasonWages, brought }, built: n.office !== null || n.huts.length > 0 };
}
