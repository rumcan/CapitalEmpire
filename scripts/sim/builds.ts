// The shared builds of the headless event and business gates (event-gate.ts, biz-gate.ts): the straight-leg layer, the link road's class, the generous
// build (each town's spine widened, its feeder and car park), the surge meter and the Level 1 round's run from build to eval, and the network's value.
import { CLASS, type ClassId, type Leg, type Pt, type RoadNetwork } from '../../src/game/network';
import type { CarParkDef } from '../../src/game/event/carpark';
import type { RoundResult } from '../../src/game/event/round';
import { STRUCT_COST, splitByTerrain } from '../../src/game/structures';
import { stepSecond, type Harness } from './harness';

/** the link road's class: the hub, the towns' links and the generous feeders */
export const LINK: ClassId = 'road';

/** the towns as setupTowns gives them: the harness with the town centres */
export type Towns = Harness & { centres: Pt[] };
/** a box: the car park's place (tiles) */
export type Box = { x: number; y: number; w: number; h: number };
/** one scenario's surge timing: the steps (n), their sum and max (ms per sim step), the most cars alive at a step and the most party cars */
export interface Meter { n: number; sum: number; max: number; peak: number; peakParty: number }
/** a fresh surge meter (no steps) */
export const newMeter = (): Meter => ({ n: 0, sum: 0, max: 0, peak: 0, peakParty: 0 });
/** a straight leg chain of pts on class cls (split by the terrain, as the engine's road tool) */
export function lay(H: Harness, pts: Pt[], cls: ClassId) {
  const c = CLASS[cls], hw = c.h + c.walk, legs0: Leg[] = [];
  for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1]!, b: pts[i]! });
  const { legs, kinds } = splitByTerrain(legs0, hw, H.cls);
  H.editor.addLegs(legs, c, 0, kinds);
}
/** the generous build: each town (in turn) gets its feeder road 44 tiles out from the stadium on the side facing it (the next free side when taken),
 *  running along that side with 50 tiles past each end; its spine (the grid's middle lines within 200 tiles of the centre) widened to arterials; an
 *  L of LINK from the spine's end nearest the feeder to the feeder; and its own car park between the feeder and the stadium */
export function buildGenerous(H: Towns): CarParkDef[] {
  const city = H.city, site = city.site!, sc = site.c, cl = CLASS[LINK], hwc = Math.ceil(cl.h + cl.walk) + 1;
  const used = new Set<number>(), parks: CarParkDef[] = [];
  H.centres.forEach((c, k) => {
    // the side facing the town: 0 east, 1 south, 2 west, 3 north
    const ang = Math.atan2(c.y - sc.y, c.x - sc.x); let side = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
    while (used.has(side)) side = (side + 1) % 4; used.add(side);
    let A: Pt, B: Pt, P: Box;
    if (side === 0) { const x = site.x + site.w + 44; A = { x, y: site.y - 10 }; B = { x, y: site.y + site.h + 10 }; P = { x: site.x + site.w + 3, y: site.y, w: 44 - hwc - 3, h: site.h }; }
    else if (side === 2) { const x = site.x - 44; A = { x, y: site.y - 10 }; B = { x, y: site.y + site.h + 10 }; P = { x: x + hwc, y: site.y, w: 44 - hwc - 3, h: site.h }; }
    else if (side === 1) { const y = site.y + site.h + 44; A = { x: site.x - 10, y }; B = { x: site.x + site.w + 10, y }; P = { x: site.x, y: site.y + site.h + 3, w: site.w, h: 44 - hwc - 3 }; }
    else { const y = site.y - 44; A = { x: site.x - 10, y }; B = { x: site.x + site.w + 10, y }; P = { x: site.x, y: y + hwc, w: site.w, h: 44 - hwc - 3 }; }
    lay(H, [A, B], LINK);
    // the town's spine: the grid's middle lines through its nearest node, widened to arterials
    let cn: Pt | null = null, cd = Infinity;
    for (const n of city.net.nodes.values()) { const d = Math.hypot(n.x - c.x, n.y - c.y); if (d < cd) { cd = d; cn = { x: n.x, y: n.y }; } }
    const xs = [...city.net.nodes.values()].filter(n => n.y === cn!.y && Math.abs(n.x - c.x) <= 200).map(n => n.x);
    const ys = [...city.net.nodes.values()].filter(n => n.x === cn!.x && Math.abs(n.y - c.y) <= 200).map(n => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    lay(H, [{ x: x0, y: cn!.y }, { x: x1, y: cn!.y }], 'arterial');
    lay(H, [{ x: cn!.x, y: y0 }, { x: cn!.x, y: y1 }], 'arterial');
    // the spine end nearest the feeder's nearer end, and an L to it
    const end = Math.hypot(A.x - c.x, A.y - c.y) < Math.hypot(B.x - c.x, B.y - c.y) ? A : B;
    const cands: Pt[] = [{ x: x0, y: cn!.y }, { x: x1, y: cn!.y }, { x: cn!.x, y: y0 }, { x: cn!.x, y: y1 }];
    const st = cands.reduce((p, q) => (Math.hypot(q.x - end.x, q.y - end.y) < Math.hypot(p.x - end.x, p.y - end.y) ? q : p));
    const vertFirst = st.y === y0 || st.y === y1;
    lay(H, vertFirst ? [st, { x: st.x, y: end.y }, end] : [st, { x: end.x, y: st.y }, end], LINK);
    parks.push({ id: k + 1, ...P });
  });
  city.netOps(H.editor.commit());
  city.setParks(parks);
  return parks;
}

/** records one surge step (after the step's time is taken): ms per sim step, the cars alive and the party cars (a loop over the slots, outside the timing) */
export function meter(m: Meter, H: Harness) {
  const ms = H.stepMs / 10; m.n++; m.sum += ms; if (ms > m.max) m.max = ms;
  const sim = H.city.sim; let alive = 0, party = 0;
  for (let i = 0; i < sim.cap; i++) if (sim.alive[i]) { alive++; if (sim.party[i]! >= 0) party++; }
  if (alive > m.peak) m.peak = alive; if (party > m.peakParty) m.peakParty = party;
}

/** one Level 1 round from the build to its eval (startRound, startNow, then the surge stepped to kick-off; each surge step metered): the result (null if
 *  the round did not start), the treasury before the round and at its eval, and the next second */
export function runRound(H: Harness, s: number, m: Meter): { s: number; r: RoundResult | null; before: number; after: number } {
  const city = H.city, before = city.budget.money;
  if (!city.startRound() || !city.startNow()) return { s, r: null, before, after: before };
  for (; city.round.stage === 'surge'; s++) { stepSecond(H, s); meter(m, H); }
  return { s, r: city.round.last, before, after: city.budget.money };
}

/** the value of the network (tile-metres x class cost x structure cost, summed over its segs): what the roads cost to lay, as the add-lane tool prices them */
export function netValue(net: RoadNetwork): number {
  let v = 0;
  for (const s of net.segs) v += Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * s.cls.cost * STRUCT_COST[s.kind];
  return v;
}
