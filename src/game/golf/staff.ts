// T269 (#810) part 3: the grounds staff as a system (fitted to P26's staff: docs/plans/P26.md, wages a month, hired in the club's card). The player
// hires greenkeepers and mower operators; each town day the crew works through the course's jobs in their order (cups, sands, greens for the
// greenkeepers; fairways, rough for the mower operators), each job on each hole due every INTERVAL days and taking MINUTES of a worker's SHIFT. The
// recommended crew (crewNeed) is the least that keeps every job on time. Too few, and the jobs fall behind:
//  - the grass gets longer (fairways and rough: GRASS_MM), the greens slower (greenSpeed: the stimp) and the course's condition drops (holeCondition:
//    the overdue days weighted, 100 down to CONDITION_MIN), which takes up to a quarter off the quality score everyday golf, the memberships and the
//    year end read (qualityFactor);
//  - a hole whose cup is not changed keeps yesterday's pin, and the season's share of hole-days with an unmoved pin costs up to PIN_REP_WORST
//    reputation at its end (pinReputation), next to T208's pace term.
// The visible crew (golf/crew.ts) plays the day's jobs. Pure TS; town days, game minutes, dollars.

/** the two roles, their wages ($ a month: P26's teaching pro is $300, its secretary $450) and their day's work (game minutes) */
export type StaffRole = 'gk' | 'mo';
export const WAGE: Readonly<Record<StaffRole, number>> = { gk: 320, mo: 280 };
export const SHIFT: Readonly<Record<StaffRole, number>> = { gk: 420, mo: 600 };
export const ROLE_NAME: Readonly<Record<StaffRole, [string, string]>> = { gk: ['greenkeeper', 'greenkeepers'], mo: ['mower operator', 'mower operators'] };
/** the most of each a club takes on */
export const STAFF_MAX = 6;
/** T214 (#559, P26 section 2): the club's own staff, hired from P26's phase 4 (the Staff card, the pro's office and the teaching huts): the head
 *  pro, the teaching pros (one a hut) and the membership secretary. They sit in the same staff state as the grounds crew (StaffState.club) and are
 *  paid with it, in the same month (payWages), so there is one wage book. Their wages ($ a month) are P26's owner question Q3 at the lead's
 *  recommendation (pre-approved); golf/club.ts reads the head pro and the secretary as the sales and renewal terms (clubTerms) */
export type ClubRole = 'head' | 'teach' | 'sec';
export const CLUB_ROLES: readonly ClubRole[] = ['head', 'teach', 'sec'];
export const CLUB_WAGE: Readonly<Record<ClubRole, number>> = { head: 900, teach: 300, sec: 450 };
/** the most of each club role: one head pro, a teaching pro for each of up to three huts, one secretary */
export const CLUB_MAX: Readonly<Record<ClubRole, number>> = { head: 1, teach: 3, sec: 1 };
/** the jobs, in the order a role works them (the first are done first when the crew is short) */
export type Job = 'cups' | 'sands' | 'greens' | 'fairways' | 'rough';
export const JOBS: readonly Job[] = ['cups', 'sands', 'greens', 'fairways', 'rough'];
export const JOB_ROLE: Readonly<Record<Job, StaffRole>> = { cups: 'gk', sands: 'gk', greens: 'gk', fairways: 'mo', rough: 'mo' };
/** each job's interval (town days: due when this many days have passed since it was last done) and its minutes a hole (the drive there included) */
export const INTERVAL: Readonly<Record<Job, number>> = { cups: 1, sands: 1, greens: 2, fairways: 3, rough: 7 };
export const MINUTES: Readonly<Record<Job, number>> = { cups: 12, sands: 10, greens: 25, fairways: 80, rough: 120 };
/** the condition lost per overdue day of each job (a hole's condition: 100 less these, down to CONDITION_MIN) */
export const OVERDUE_COST: Readonly<Record<Job, number>> = { cups: 0, sands: 3, greens: 8, fairways: 4, rough: 2 };
export const CONDITION_MIN = 40;
/** the greens' speed on the stimp (feet): cut on time, less this a day overdue, never under the floor */
export const STIMP = 8.5, STIMP_DROP = 0.5, STIMP_MIN = 6;
/** the grass's height (mm): as cut, and how much it grows a day */
export const GRASS_MM: Readonly<Record<'fairways' | 'rough', { cut: number; day: number }>> = { fairways: { cut: 15, day: 3 }, rough: { cut: 50, day: 6 } };
/** the quality score is multiplied by QF_BASE + (1 - QF_BASE) x condition / 100 */
export const QF_BASE = 0.75;
/** the season's reputation for unmoved pins: 0 when every cup is changed every day, down to this when none is */
export const PIN_REP_WORST = -3;

/** each hole's jobs as the save keeps them: the town day each was last done */
export type JobDays = Record<Job, number>;
/** the staff's state (CrewSave's part): the crew hired, each hole's job days, the day the jobs were last worked out and that day's jobs (the holes
 *  each was done on: the visible crew plays them), the season's hole-days and those with an unmoved pin, and the game month the wages were paid to;
 *  T214: the club's own staff (missing: none, until P26's phase 4 hires them) */
export interface StaffState {
  staff: Record<StaffRole, number>;
  club?: Partial<Record<ClubRole, number>>;
  holes: Record<number, JobDays>;
  day: number; today: Record<Job, number[]>;
  season: { holeDays: number; stale: number };
  paid: number;
}

const noJobs = (): Record<Job, number[]> => ({ cups: [], sands: [], greens: [], fairways: [], rough: [] });
const allDone = (day: number): JobDays => ({ cups: day, sands: day, greens: day, fairways: day, rough: day });

/** each role's minutes of work a day on `holes` holes, every job on time */
export function workNeed(holes: number): Record<StaffRole, number> {
  const out: Record<StaffRole, number> = { gk: 0, mo: 0 };
  for (const j of JOBS) out[JOB_ROLE[j]] += Math.max(0, holes) * MINUTES[j] / INTERVAL[j];
  return out;
}
/** the crew a course of `holes` holes needs: the least of each role whose shifts cover its work (9 holes: one of each; 18: two of each) */
export function crewNeed(holes: number): Record<StaffRole, number> {
  const w = workNeed(holes); return { gk: Math.max(0, Math.ceil(w.gk / SHIFT.gk - 1e-9)), mo: Math.max(0, Math.ceil(w.mo / SHIFT.mo - 1e-9)) };
}
/** the wages a month ($): the crew's, and (T214) the club staff's when given */
export const wages = (staff: Readonly<Record<StaffRole, number>>, club: Readonly<Partial<Record<ClubRole, number>>> = {}): number =>
  staff.gk * WAGE.gk + staff.mo * WAGE.mo + CLUB_ROLES.reduce((a, r) => a + (club[r] ?? 0) * CLUB_WAGE[r], 0);
/** T214: the club staff's terms in the members' month (golf/club.ts StaffTerms): a head pro and a secretary on the staff */
export const clubTerms = (s: Pick<StaffState, 'club'> | null | undefined): { head: boolean; sec: boolean } => ({ head: (s?.club?.head ?? 0) > 0, sec: (s?.club?.sec ?? 0) > 0 });

/** a fresh state: the crew the course needs hired (an old save's, a new game's), every job on time today (each job's holes staggered over its
 *  interval, as a rota runs: the k-th hole last done k mod INTERVAL days ago, so the days after carry an even share), the season empty, the wages
 *  paid to month */
export function freshStaff(day: number, holes: readonly number[], month: number, staff?: Record<StaffRole, number>): StaffState {
  const h: Record<number, JobDays> = {};
  holes.forEach((n, k) => { const d = allDone(day); for (const j of JOBS) d[j] = day - (k % INTERVAL[j]); h[n] = d; });
  return { staff: staff ?? crewNeed(holes.length), holes: h, day, today: { ...noJobs(), cups: [...holes] }, season: { holeDays: 0, stale: 0 }, paid: month };
}

/** the jobs worked on town day `day` (a new day after s.day): each hole new to the course starts with everything done; for each role the jobs due
 *  (INTERVAL days or more since last done), in JOBS order and the most overdue hole first, each taking MINUTES of the role's shifts while they last;
 *  the jobs done today are dated today. The season counts each hole's day and whether its cup stayed. Returns the new state (s is not changed) */
export function workDay(s: StaffState, day: number, holes: readonly number[]): StaffState {
  if (day <= s.day) return s;
  const H: Record<number, JobDays> = {};
  for (const n of holes) H[n] = { ...(s.holes[n] ?? allDone(s.day)) };
  const left: Record<StaffRole, number> = { gk: s.staff.gk * SHIFT.gk, mo: s.staff.mo * SHIFT.mo }, today = noJobs();
  for (const j of JOBS) {
    const r = JOB_ROLE[j], due = holes.filter(n => day - H[n]![j] >= INTERVAL[j]).sort((a, b) => H[a]![j] - H[b]![j] || a - b);
    for (const n of due) { if (left[r] < MINUTES[j]) break; left[r] -= MINUTES[j]; H[n]![j] = day; today[j].push(n); }
  }
  for (const j of JOBS) today[j].sort((a, b) => a - b);
  const moved = new Set(today.cups);
  return { ...s, holes: H, day, today, season: { holeDays: s.season.holeDays + holes.length, stale: s.season.stale + holes.filter(n => !moved.has(n)).length } };
}

/** a job's overdue days on hole n by town day `day` (0: on time) */
export function overdue(s: StaffState, n: number, j: Job, day = s.day): number { const h = s.holes[n]; return h ? Math.max(0, day - h[j] - INTERVAL[j]) : 0; }
/** a hole's condition (CONDITION_MIN..100): 100 less each job's overdue days at its cost */
export function holeCondition(s: StaffState, n: number, day = s.day): number {
  let c = 100; for (const j of JOBS) c -= OVERDUE_COST[j] * overdue(s, n, j, day);
  return Math.max(CONDITION_MIN, Math.round(c));
}
/** the course's condition: its holes' average (100 with no holes) */
export function courseCondition(s: StaffState, day = s.day): number {
  const ns = Object.keys(s.holes).map(Number); if (!ns.length) return 100;
  return Math.round(ns.reduce((a, n) => a + holeCondition(s, n, day), 0) / ns.length);
}
/** the greens' speed (feet on the stimp) and the fairways' and rough's heights (mm), averaged over the holes */
export function turf(s: StaffState, day = s.day): { stimp: number; fairwayMM: number; roughMM: number } {
  const ns = Object.keys(s.holes).map(Number); if (!ns.length) return { stimp: STIMP, fairwayMM: GRASS_MM.fairways.cut, roughMM: GRASS_MM.rough.cut };
  let st = 0, f = 0, r = 0;
  for (const n of ns) {
    st += Math.max(STIMP_MIN, STIMP - STIMP_DROP * overdue(s, n, 'greens', day));
    f += GRASS_MM.fairways.cut + GRASS_MM.fairways.day * Math.max(0, day - s.holes[n]!.fairways);
    r += GRASS_MM.rough.cut + GRASS_MM.rough.day * Math.max(0, day - s.holes[n]!.rough);
  }
  return { stimp: Math.round(st / ns.length * 10) / 10, fairwayMM: Math.round(f / ns.length), roughMM: Math.round(r / ns.length) };
}
/** the quality score's factor for a condition (QF_BASE at 0 .. 1 at 100) */
export const qualityFactor = (condition: number): number => QF_BASE + (1 - QF_BASE) * Math.min(100, Math.max(0, condition)) / 100;
/** the season's reputation for its unmoved pins: PIN_REP_WORST times the share of hole-days whose cup stayed, rounded (0 with no days) */
export function pinReputation(season: { holeDays: number; stale: number }): number {
  return season.holeDays > 0 ? Math.round(PIN_REP_WORST * Math.min(1, season.stale / season.holeDays)) || 0 : 0;
}

/** the wages due from s.paid to game month `month` ($: each month passed, the crew and (T214) the club staff as they are now), and the state paid
 *  to it; a month before s.paid (a new clock) pays nothing and starts from it */
export function payWages(s: StaffState, month: number): { s: StaffState; due: number } {
  const m = Math.floor(month);
  if (m <= s.paid) return { s: m < s.paid ? { ...s, paid: m } : s, due: 0 };
  return { s: { ...s, paid: m }, due: (m - s.paid) * wages(s.staff, s.club) };
}
/** one more (+1) or one fewer (-1) of a role, within 0..STAFF_MAX; letting one go costs a month's wage (P26). Null: no change */
export function changeStaff(s: StaffState, role: StaffRole, delta: 1 | -1): { s: StaffState; cost: number } | null {
  const n = s.staff[role] + delta; if (n < 0 || n > STAFF_MAX) return null;
  return { s: { ...s, staff: { ...s.staff, [role]: n } }, cost: delta < 0 ? WAGE[role] : 0 };
}
/** the season closes (the tournament): its pin count starts again */
export const closeSeason = (s: StaffState): StaffState => ({ ...s, season: { holeDays: 0, stale: 0 } });

/** a finite number, else d */
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
/** a saved staff state, well formed, or null (none saved: an old save, which gets freshStaff) */
export function normalizeStaff(v: unknown): StaffState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<StaffState>; if (!o.staff || typeof o.day !== 'number' || !Number.isFinite(o.day)) return null;
  const cl = (x: unknown) => Math.max(0, Math.min(STAFF_MAX, Math.floor(num(x))));
  const holes: Record<number, JobDays> = {};
  for (const [k, d] of Object.entries(o.holes ?? {})) { const n = Number(k); if (!(n > 0) || !d) continue; const jd = {} as JobDays; for (const j of JOBS) jd[j] = Math.floor(num((d as Partial<JobDays>)[j], o.day)); holes[n] = jd; }
  const today = noJobs(); for (const j of JOBS) { const a = (o.today as Partial<Record<Job, unknown>> | undefined)?.[j]; if (Array.isArray(a)) today[j] = a.filter((n): n is number => typeof n === 'number' && n > 0); }
  const out: StaffState = { staff: { gk: cl(o.staff.gk), mo: cl(o.staff.mo) }, holes, day: Math.floor(o.day), today, season: { holeDays: Math.max(0, num(o.season?.holeDays)), stale: Math.max(0, num(o.season?.stale)) }, paid: Math.floor(num(o.paid)) };
  // T214: the club's own staff, each role within its most (none kept: the field stays out)
  if (o.club && typeof o.club === 'object') { const c: Partial<Record<ClubRole, number>> = {}; for (const r of CLUB_ROLES) { const n = Math.max(0, Math.min(CLUB_MAX[r], Math.floor(num(o.club[r])))); if (n > 0) c[r] = n; } if (Object.keys(c).length) out.club = c; }
  return out;
}

/** the club card's Grounds crew block (ui/golf/ClubhouseCard.tsx): the crew hired and needed, the wages ($ a month: the crew's, and each role's), the
 *  condition and the turf, the cups changed this morning of the holes, the season's pin term so far and the most of a role */
export interface CrewCardView {
  staff: Record<StaffRole, number>; need: Record<StaffRole, number>; wages: number; wage: Readonly<Record<StaffRole, number>>;
  condition: number; stimp: number; fairwayMM: number; roughMM: number; cupsToday: number; holes: number; pinRep: number; max: number;
}
/** the card's view of a staff state on a course of `holes` holes */
export function crewCard(s: StaffState, holes: number): CrewCardView {
  return { staff: { ...s.staff }, need: crewNeed(holes), wages: wages(s.staff), wage: WAGE, condition: courseCondition(s), ...turf(s), cupsToday: s.today.cups.length, holes, pinRep: pinReputation(s.season), max: STAFF_MAX };
}
