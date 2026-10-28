// The tournament day as the save keeps it (T209, #554): a reload during a golf tournament day comes back where it was. Written (SaveV5.tourney) only while a
// golf round is in its surge or its eval on the tournament day, so every other save is as before; a save without it loads as before (the round's surge
// restores as free). The City writes it (City.daySave) and resumes it (City.resumeDay); this module holds its shape and the check a loaded one passes.
// Pure TS, no DOM.
import type { TownClock } from '../sim/townclock';
import type { GateStats } from './crowd';

/** going home (golf, LEAD.md M2.3; City.leave): when it starts (sim s), the release order of the parked cars, the next to release, the cars back at their
 *  bays waiting to leave (k: the car, at: since, sim s), the counts, the last car's time, the exit waits so far, and the timeline's release times (sim s;
 *  null: the even spread from at) */
export interface Leave { at: number; order: number[]; next: number; pending: { k: number; at: number }[]; cars: number; gone: number; last: number; waits: number[]; times: number[] | null }

/** a departure still to come, as saved: its sim time, its town, its home lot's key, its car park's id (0: none, a bus party), its entrance ordinal and
 *  the route of the town bus it takes (-1: by car) */
export type DepSave = [number, number, string, number, number, number];

/** the surge as saved (Surge.save): per town the cars sent, departed, parked, turned away, lost and stranded, and the parties that took a town bus; and
 *  the departures not yet spawned (the due ones first, then the rest of the schedule, in order) */
export interface SurgeSave { sent: number[]; departed: number[]; parked: number[]; turned: number[]; lost: number[]; stranded: number[]; bus: number[]; deps: DepSave[] }

/** the crowd as saved (crowdSave): the walker groups (8 numbers each: x, y, tx, ty, n, town, stage, route), each route's lot stop queue (2 numbers a
 *  party: town, n; the fans on a bus at the save are back at the front of their route's queue), the fans at the doors by town, each gate's queue (3
 *  numbers a party: town, n, since), the gates' measurements and each gallery spot's fans */
export interface CrowdSave { walkers: number[]; queue: number[][]; fans: number[]; gateQ: number[][]; gate: GateStats; gallery: number[] }

/** the tournament day under way (SaveV5.tourney). The clocks: the sim time of the snapshot (s), the game clock's shift from it (s), whether that clock is
 *  frozen (a round freezes it), the town clock (a game minute per sim second on the day), the day's start (sim s at 05:00) and the surge's sim s left to
 *  kick-off. The crowd's day: the golf play's featured holes, the surge (null: none), the crowd (null: none), the party cars that parked (3 numbers each:
 *  town, car park id, bay), each car park's counts (3 numbers each: id, parked, turned), the party cars on the road or at an entrance at the save (2
 *  numbers each: town, car park id, 0 none; on load they queue at their car park's entrance), the last 30-minute mark the fans moved at (null: none
 *  yet), the shuttle riders so far, each gate's carried-over admitting, and going home (null before kick-off) */
export interface DaySave {
  t: number; shift: number; frozen: boolean; town: TownClock; t0: number; left: number;
  featured: number[]; surge: SurgeSave | null; crowd: CrowdSave | null; cars: number[]; parks: number[]; road: number[];
  relocatedAt: number | null; busRiders: number; gateAcc: number[]; leave: Leave | null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nums = (v: unknown): v is number[] => Array.isArray(v) && v.every(num);
const numss = (v: unknown): v is number[][] => Array.isArray(v) && v.every(nums);

/** a saved surge, or null when it is not well formed */
function surgeOk(s: unknown): s is SurgeSave {
  const q = s as SurgeSave | null;
  return !!q && nums(q.sent) && nums(q.departed) && nums(q.parked) && nums(q.turned) && nums(q.lost) && nums(q.stranded) && nums(q.bus) && Array.isArray(q.deps)
    && q.deps.every(d => Array.isArray(d) && d.length === 6 && num(d[0]) && num(d[1]) && typeof d[2] === 'string' && num(d[3]) && num(d[4]) && num(d[5]));
}
/** a saved crowd, or null when it is not well formed */
function crowdOk(c: unknown): c is CrowdSave {
  const q = c as CrowdSave | null, g = q?.gate;
  return !!q && nums(q.walkers) && q.walkers.length % 8 === 0 && numss(q.queue) && nums(q.fans) && numss(q.gateQ) && nums(q.gallery)
    && !!g && num(g.admitted) && num(g.waitSum) && num(g.waitMax) && num(g.late);
}
/** a saved leaving, or null when it is not well formed */
function leaveOk(l: unknown): l is Leave {
  const q = l as Leave | null;
  return !!q && num(q.at) && nums(q.order) && num(q.next) && Array.isArray(q.pending) && q.pending.every(p => num(p?.k) && num(p?.at)) && num(q.cars) && num(q.gone)
    && num(q.last) && nums(q.waits) && (q.times === null || nums(q.times));
}

/** a loaded tournament day, or null when it is not well formed (the round then loads as it did before T209: a surge as free) */
export function normalizeDaySave(d: unknown): DaySave | null {
  const q = d as DaySave | null | undefined;
  if (!q || typeof q !== 'object') return null;
  if (!num(q.t) || !num(q.shift) || typeof q.frozen !== 'boolean' || !num(q.t0) || !num(q.left) || !q.town || !num(q.town.t0) || !num(q.town.m0) || !num(q.town.rate)) return null;
  if (!nums(q.featured) || !nums(q.cars) || q.cars.length % 3 !== 0 || !nums(q.parks) || q.parks.length % 3 !== 0 || !nums(q.road) || q.road.length % 2 !== 0) return null;
  if (!(q.relocatedAt === null || num(q.relocatedAt)) || !num(q.busRiders) || !nums(q.gateAcc)) return null;
  if (!(q.surge === null || surgeOk(q.surge)) || !(q.crowd === null || crowdOk(q.crowd)) || !(q.leave === null || leaveOk(q.leave))) return null;
  return q;
}
