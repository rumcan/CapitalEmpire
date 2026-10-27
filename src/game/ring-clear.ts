// What a roundabout (or a mini) takes in when it is placed, grown or widened (T224, #623). The owner, 2026-10-27, after laying a 3-lane ring over
// the range's sign and the drive-in's speaker posts, ticket booth and snack bar: "Has to move housers and shit when ou place massive round about
// or stop you form making one". So a ring is judged like a road, by the same obstacles (route-obstacles.ts, the one list the road preview, each
// click and Build use) and the same clearing:
//  - what a road may not cross, a ring may not cover: a business, a car park, the range's structures and pieces (its sign, bays, shop), an iconic
//    place, a toll plaza, a big placed prop. The refusal names the thing and carries its outline (the preview draws it red);
//  - what a road clears, a ring clears: the town's built lots its circle reaches go (compensation, added to the price) and the small placed props
//    under it go for nothing.
// The geometry is the network's own: the ring's radius and the widest arm's walk give the disc (props, obstacles), and the lots the worker's
// partition drops (lots/lots.ts inRing: radius + walk + 0.5; a mini's painted island keeps none out) are the lots that are priced. Pure: no DOM.
import { compensation } from './budget';
import { ringClearR, rectReachesDisc } from './lots/lots';
import { LV } from './lots/town';
import { inTheWayOfDisc, ringWhy, type Disc, type Obstacle } from './route-obstacles';

/** a lot as the main thread holds it (sim/client.ts LotView): its frame and what stands on it */
export interface RingLot { key?: string; o: readonly number[]; u: readonly number[]; n: readonly number[]; w: number; d: number; use: number; level: number; decline: number }
/** a placed prop near the ring: the engine's prop, its footprint (x0 y0 x1 y1) and the refusal if it cannot be cleared (null: it goes) */
export interface RingProp<P> { p: P; box: readonly [number, number, number, number]; refuse: string | null }
/** a ring to judge: its centre, its outer radius rb and the widest arm's walk (the network's), the kind ('roundabout' keeps lots out, a 'mini' is
 *  a painted island and keeps none), its name in a refusal ("A roundabout"), the route obstacles of its class and the props and lots near it */
export interface RingInput<P> { x: number; y: number; rb: number; walk: number; kind: 'roundabout' | 'mini'; name: string; obstacles: readonly Obstacle[]; props: Iterable<RingProp<P>>; lots: Iterable<RingLot> }
/** the verdict: why (the refusal, or ''), the outlines to draw red (polygons, x y pairs), the props that go, the built lots that go, their compensation ($)
 *  and the lots' outlines (to draw them amber: what the click takes) */
export interface RingVerdict<P> { why: string; outline: number[][]; props: P[]; lots: RingLot[]; comp: number; lotOutlines: number[][] }

/** a range scene piece's name by its key (golf/rangebiz.ts rangeScene: 'sign', 'roof0', 'kiosk-table1', 'bed2'...), as a refusal says it */
export function rangePieceName(key: string): string {
  const k = key.replace(/^range:/, '');
  if (k === 'sign') return 'the driving range sign';
  if (k === 'academy-sign') return 'the academy sign';
  if (k === 'shop') return 'the pro shop';
  if (k.startsWith('roof')) return 'the covered bays';
  if (k.startsWith('kiosk')) return 'the coffee kiosk';
  if (k === 'dispenser') return 'the ball dispenser';
  if (k === 'carpark') return 'the car park building';
  if (/^(caravan|cottage|house|garage|glasshouse)$/.test(k)) return 'your home';
  if (/^(wash|braai|chair|hose|bins-yard|swing|birdhouse|firepit|bed|planter)/.test(k)) return 'your yard';
  if (/^(flag|board|mark)/.test(k)) return 'the range targets';
  if (/^(bench|bins-tee|trolley)/.test(k)) return 'the tee area';
  return 'the driving range';
}

/** the disc a ring covers: its outer edge and the widest arm's walk (the pavement round it) */
export const ringDisc = (x: number, y: number, rb: number, walk: number): Disc => ({ x, y, r: rb + walk });
/** a lot's corners (x y pairs) */
export function lotPoly(l: RingLot): number[] {
  const ax = l.o[0]! + l.u[0]! * l.w, ay = l.o[1]! + l.u[1]! * l.w, bx = l.o[0]! + l.n[0]! * l.d, by = l.o[1]! + l.n[1]! * l.d;
  return [l.o[0]!, l.o[1]!, ax, ay, ax + l.n[0]! * l.d, ay + l.n[1]! * l.d, bx, by];
}
/** the box of a prop as a polygon */
const boxPoly = (b: readonly number[]): number[] => [b[0]!, b[1]!, b[2]!, b[1]!, b[2]!, b[3]!, b[0]!, b[3]!];

/** the built lots (BUILDING or more) a ring of radius rb and widest walk would take: those the worker's partition drops (inRing). None for a mini */
export function lotsInRing(lots: Iterable<RingLot>, x: number, y: number, rb: number, walk: number, kind: 'roundabout' | 'mini'): RingLot[] {
  const r = kind === 'mini' ? 0 : ringClearR(rb, walk), out: RingLot[] = []; if (!(r > 0)) return out;
  for (const l of lots) {
    if (l.level < LV.BUILDING) continue;
    if (rectReachesDisc(l.o[0]!, l.o[1]!, l.u[0]!, l.u[1]!, l.n[0]!, l.n[1]!, l.w, l.d, x, y, r)) out.push(l);
  }
  return out;
}

/** judges a ring: the first obstacle its disc reaches (named), else the first prop that cannot be cleared, else the lots it takes and their price.
 *  A refusal carries no lots and no price (nothing is taken) */
export function judgeRing<P>(r: RingInput<P>): RingVerdict<P> {
  const none: RingVerdict<P> = { why: '', outline: [], props: [], lots: [], comp: 0, lotOutlines: [] };
  const disc = ringDisc(r.x, r.y, r.rb, r.walk), o = inTheWayOfDisc(disc, r.obstacles);
  if (o) return { ...none, why: ringWhy(r.name, o.name ?? 'something'), outline: [[...o.outline]] };
  const props: P[] = [];
  for (const q of r.props) {
    const dx = Math.max(q.box[0] - r.x, 0, r.x - q.box[2]), dy = Math.max(q.box[1] - r.y, 0, r.y - q.box[3]);
    if (!(dx * dx + dy * dy < disc.r * disc.r)) continue;
    if (q.refuse) return { ...none, why: q.refuse, outline: [boxPoly(q.box)] };
    props.push(q.p);
  }
  const lots = lotsInRing(r.lots, r.x, r.y, r.rb, r.walk, r.kind);
  return { why: '', outline: [], props, lots, comp: lots.reduce((s, l) => s + compensation(l), 0), lotOutlines: lots.map(lotPoly) };
}
