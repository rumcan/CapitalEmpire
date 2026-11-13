// T449 (the owner: "unlock night golf as an event you can host and play in"): Night golf, one of the club's own yearly events (clubevents.ts), held on
// a summer town day after dark. It opens when your tournament reaches the tour's tier 2 (GolfSave.tier: the first promotion, GOLF-PLAN 8.2), and it
// needs the course lit: floodlight towers (tents.ts 'floodlight', bought and placed with the Event tool) beside the holes. A hole is lit when most of
// its line is within a tower's reach; the night is hosted only with most holes lit, and the field plays a little worse on the holes left dark.
// Its money follows the events' pattern: tickets for the spectators the club's reputation draws, the field's entry fees, a novelty bonus that fades
// each year it is held, and the lights' running cost a night. Pure TS, no DOM, deterministic.
import { TILE_M } from './types';
import type { Pt } from './holes';

/** the tour tier your tournament must have reached to host night golf */
export const NIGHT_UNLOCK_TIER = 2;
/** the floodlight tower's structure id (tents.ts STRUCTURES) */
export const FLOODLIGHT_ID = 'floodlight';
/** how far a tower lights, m: a hole's line within this of a tower is lit */
export const LIGHT_REACH_M = 75;
/** a hole is lit when at least this share of its line (sampled every LINE_STEP_M) is within a tower's reach */
export const HOLE_LIT_SHARE = 0.8, LINE_STEP_M = 10;
/** the share of the course's holes that must be lit to host (rounded up: 15 of 18, 8 of 9) */
export const COURSE_LIT_SHARE = 0.8;
/** the night's money: spectators at reputation 0 and per reputation point, the ticket ($), the field's entry fee ($ a golfer), the staff a spectator ($),
 *  the lights' running cost a tower a night ($), and the novelty bonus as a share of the tickets by how many nights were held before (0, 1, 2, 3...; then none) */
export const NIGHT = { base: 80, perRep: 6, ticket: 15, entry: 25, staff: 2, towerNight: 60, novelty: [0.5, 0.3, 0.15, 0.05] } as const;
/** the darkness: the chance a golfer of the field drops a stroke on a hole left fully dark (a share of it on a partly lit one) */
export const DARK_STROKES = 0.35;

/** a hole as the light check reads it: its number and its line (tiles) */
export interface LitHole { n: number; line: readonly Pt[] }
/** the share (0..1) of a hole's line within a tower's reach */
export function litShare(line: readonly Pt[], lights: readonly Pt[]): number {
  const r2 = (LIGHT_REACH_M / TILE_M) ** 2, near = (x: number, y: number) => lights.some(l => (l.x - x) ** 2 + (l.y - y) ** 2 <= r2);
  if (line.length < 2) return line[0] && near(line[0].x, line[0].y) ? 1 : 0;
  let n = 0, lit = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, L = Math.hypot(b.x - a.x, b.y - a.y) * TILE_M, k = Math.max(1, Math.ceil(L / LINE_STEP_M));
    for (let j = i === 0 ? 0 : 1; j <= k; j++) { n++; if (near(a.x + (b.x - a.x) * j / k, a.y + (b.y - a.y) * j / k)) lit++; }
  }
  return n ? lit / n : 0;
}
/** the course's lighting: each hole's lit share, how many holes are lit, how many must be, and how many there are */
export interface Lighting { shares: Map<number, number>; lit: number; need: number; holes: number }
export function lighting(holes: readonly LitHole[], lights: readonly Pt[]): Lighting {
  const shares = new Map<number, number>();
  let lit = 0;
  for (const h of holes) { const s = litShare(h.line, lights); shares.set(h.n, s); if (s >= HOLE_LIT_SHARE - 1e-9) lit++; }
  return { shares, lit, need: Math.ceil(holes.length * COURSE_LIT_SHARE - 1e-9), holes: holes.length };
}

/** whether night golf is unlocked (your tournament's tier) */
export const nightUnlocked = (tier: number): boolean => tier >= NIGHT_UNLOCK_TIER;
/** why you cannot host night golf (null: you can): it is not unlocked yet, the course has no holes, or too few holes are lit */
export function hostWhy(tier: number, holes: readonly LitHole[], lights: readonly Pt[]): string | null {
  if (!nightUnlocked(tier)) return `Night golf opens when your tournament reaches tier ${NIGHT_UNLOCK_TIER}`;
  if (!holes.length) return 'Night golf needs a course with holes';
  const L = lighting(holes, lights);
  return L.lit >= L.need ? null : `Night golf needs floodlights along at least ${L.need} of your ${L.holes} holes: ${L.lit === 0 ? 'none is' : L.lit === 1 ? '1 is' : `${L.lit} are`} lit (build Floodlight towers beside the holes)`;
}

/** what a night of golf takes and costs: attendance (spectators), tickets, the field's entries and the novelty bonus (in, $); staff and the lights (out, $);
 *  and the net */
export interface NightMoney { attendance: number; tickets: number; entries: number; novelty: number; staff: number; lights: number; net: number }
/** the night's money from the club's reputation (0..100), the field's size, how many nights were held before this one and how many towers run */
export function nightMoney(o: { rep: number; field: number; before: number; towers: number }): NightMoney {
  const rep = Math.min(100, Math.max(0, o.rep)), attendance = Math.round(NIGHT.base + NIGHT.perRep * rep);
  const tickets = attendance * NIGHT.ticket, entries = Math.max(0, Math.round(o.field)) * NIGHT.entry;
  const novelty = Math.round(tickets * (NIGHT.novelty[Math.max(0, Math.floor(o.before))] ?? 0));
  const staff = attendance * NIGHT.staff, lights = Math.max(0, Math.round(o.towers)) * NIGHT.towerNight;
  return { attendance, tickets, entries, novelty, staff, lights, net: tickets + entries + novelty - staff - lights };
}
/** the night's money as a line: "Night golf: 410 came · tickets $6,150 · novelty $3,075 · lights $1,200 · net $9,000" */
export function nightMoneyLine(m: NightMoney): string {
  const $ = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US')}`;
  return `Night golf: ${m.attendance} came · tickets ${$(m.tickets)}${m.novelty ? ` · novelty ${$(m.novelty)}` : ''} · lights ${$(m.lights)} · net ${$(m.net)}`;
}

/** a 32-bit hash of a string and a number, as a float in [0, 1) */
function hash01(s: string, k: number): number {
  let h = 0x811c9dc5 ^ k;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
/** the strokes the dark costs a golfer of the field over the holes (their lit shares): a stroke on a hole with chance DARK_STROKES times its dark share,
 *  drawn by his name and the hole, so the same night gives the same scores; a fully lit course costs none */
export function darkStrokes(name: string, shares: ReadonlyMap<number, number>): number {
  let s = 0;
  for (const [n, lit] of shares) if (hash01(name, n) < DARK_STROKES * (1 - Math.min(1, Math.max(0, lit)))) s++;
  return s;
}
