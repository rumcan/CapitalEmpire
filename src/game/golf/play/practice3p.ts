// J6 (#1223; the owner, 2026-11-13: "make the guy be able to hit balls on the range and at his chipping green ... we lock him into the area. no walking
// around"): practice from behind the golfer. Two places: the range (he stands on a mat and hits endless balls at the target greens) and the short game area
// (the chipping green with its bunker: he chips from the stand beside it, putts from 3 to 6 m out, or plays out of the bunker). Both are made into one small
// course the view loads like any other (export3p.ts takes it as plain data): the outfield as fairway, the mats' tee box as tee, each target green as a green,
// and the practice area's painted greens and bunkers as they are. Its holes are the range (the mat to the 100 m green) and the chipping green (the stand to
// the cup). The play is a RoundDriver (play3p.ts): every ball is struck by the one model (live.ts shotOutcome) from the drill's spot, and the next ball is
// teed up there again; a drill (drills.ts) judges each one. The view only shows it, and holds the golfer still (practiceMsg). Pure TS, no DOM.
import type { CourseArea, GolfSurface } from '../types';
import { TILE_M } from '../types';
import type { Hole } from '../holes';
import { surfaceAt } from '../holes';
import type { Export3pInput } from './export3p';
import type { CourseView, OwnerInput, PlayHole, Pt, Shot } from './index';
import { makeCourseView } from './courseview';
import { MODEL_V, POWER, shotOutcome, type OwnerTurn } from './live';
import { carryFor, chooseShot, type ShotSkill } from './shot';
import type { RoundDriver } from './play3p';
import { DRILLS, drillProgress, drillsAt, greenAt, judgeDrill, junkHit, junkReach, type DrillCall, type DrillGreen, type DrillId, type DrillJunk, type DrillShot, type DrillSpot, type DrillsSave } from './drills';
import type { ViewPt } from './protocol3p';
import { mulberry } from '../../iso';

/** the two practice places: the range's mats, and the short game area (the chipping green and its bunker) */
export type PracticePlace = 'range' | 'short';
/** the holes of the practice course: the range is hole 1, the chipping green hole 2 */
export const RANGE_HOLE = 1, SHORT_HOLE = 2;
/** a putt is set out this far from the cup (m) */
export const PUTT_M: readonly [number, number] = [3, 6];

/** a target green as the range scene has it (rangebiz.ts SceneTarget: tiles, its distance m) */
export interface RangeGreen { x: number; y: number; r: number; m: number }
/** the short game area's facility as practice.ts scans it: the cup and the stands (the bunker's first) */
export interface ChipArea { cup: Pt; stands: Pt[] }
/** what the practice course is made of (tiles, the game's frame): the range's outfield (a polygon: the plot past the shop and the car park), the mats' tee box (a polygon), where the golfers stand on the mats,
 *  the target greens (none built: the distance markers', small greens), the practice area's box and the painted areas in it (null: no practice area),
 *  the chipping green (null: none open), the ground's height, and the name */
export interface PracticeIn {
  outfield: readonly number[]; teeBox: readonly number[];
  /** J6b: the outfield's ground as the range has it: 'fairway' once it is grassed (the scene's mown outfield), else 'fescue' (the bare start's scrub: dry long grass in
   *  the view, never a mown fairway); absent: fairway */
  outfieldSurface?: 'fairway' | 'fescue';
  /** J6b: whether the target greens are built (absent: yes). Without them the greens are the distance markers' spots: the drills judge by them, nothing is painted */
  greensBuilt?: boolean;
  /** J6b: the range's whole ground (tiles x0 y0 x1 y1: its plot, car park and practice area, with a margin), laid under everything as rough, so the view counts it as
   *  the course's ground (else its own wild land grows plateaus and cliffs by the shop and the road); absent: none */
  ground?: readonly [number, number, number, number];
  /** J6b (J7's junk, #1225): the junk piles on the outfield: library id, name, spot (tiles) and metres from the mats (absent: none) */
  junk?: readonly { id: string; name: string; x: number; y: number; m: number }[]; bays: readonly Pt[]; greens: readonly RangeGreen[];
  area: readonly [number, number, number, number] | null; areas: readonly CourseArea[]; chip: ChipArea | null;
  /** #1298: what the player painted on the outfield with the Texture Painter (its bunkers, ponds, waste, rough and long grass: the map's cells as areas, none of the tee's or a
   *  collar's), laid over the outfield and under the tee and the target greens, as the game draws them (the range's fixed pieces stay on top); absent: none */
  painted?: readonly CourseArea[];
  heightAt?: (x: number, y: number) => number; name?: string;
}
/** the practice course: what the exporter takes, the course the model plays, the mat he stands on, the greens (the drills' terms), the chipping green's
 *  spots (null: none), and the hole index of each place in the view (-1: none) */
export interface PracticeCourse { input: Export3pInput; view: CourseView; mat: Pt; greens: DrillGreen[]; chip: { cup: Pt; stand: Pt; sand: Pt | null } | null;
  /** J6b: the junk piles as targets */ junk: DrillJunk[];
  idx: Record<PracticePlace, number> }

const disc = (x: number, y: number, r: number, n = 32): number[] => { const p: number[] = []; for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; p.push(x + Math.cos(a) * r, y + Math.sin(a) * r); } return p; };
const rect = (b: readonly [number, number, number, number]): number[] => [b[0], b[1], b[2], b[1], b[2], b[3], b[0], b[3]];
const boxOf = (pts: readonly number[]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < pts.length; i += 2) { x0 = Math.min(x0, pts[i]!); x1 = Math.max(x1, pts[i]!); y0 = Math.min(y0, pts[i + 1]!); y1 = Math.max(y1, pts[i + 1]!); }
  return [x0, y0, x1, y1];
};
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** the practice course for a range (and its short game area). The painted areas kept are those wholly within the practice area (grown 8 tiles): its greens,
 *  fringes and bunkers, not the course's big areas that reach into it */
export function practiceCourse(p: PracticeIn): PracticeCourse {
  const areas: CourseArea[] = [];
  let id = -1;
  const add = (surface: GolfSurface, pts: number[]) => { areas.push({ id: id--, surface, pts }); };
  // the range: the outfield as fairway, the mats' tee box as tee, each target green as green
  if (p.ground) add('rough', rect(p.ground));
  const outfieldAt = areas.length;
  add(p.outfieldSurface ?? 'fairway', p.outfield.slice());
  // #1298: what the player painted on the outfield, over it (the ball lies in a painted bunker, rolls into a painted pond), under the fixed pieces
  for (const a of p.painted ?? []) add(a.surface, a.pts.slice());
  add('tee', p.teeBox.slice());
  const greens: RangeGreen[] = p.greens.length ? p.greens.slice() : [];
  if (p.greensBuilt !== false) for (const g of greens) add('green', disc(g.x, g.y, g.r));
  // the short game area: a first cut over the area, then what is painted in it
  if (p.area) {
    add('firstCut', rect(p.area));
    const [ax0, ay0, ax1, ay1] = p.area, M = 8;
    for (const a of p.areas) { const b = boxOf(a.pts); if (b[0] >= ax0 - M && b[1] >= ay0 - M && b[2] <= ax1 + M && b[3] <= ay1 + M) areas.push({ ...a, pts: a.pts.slice() }); }
  }
  const mat = p.bays.length ? p.bays[Math.floor(p.bays.length / 2)]! : (() => { const b = boxOf(p.teeBox); return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 }; })();
  const dg: DrillGreen[] = greens.map(g => ({ x: g.x, y: g.y, r: g.r, distM: g.m }));
  const aim = greenAt(dg, 100) ?? { x: mat.x, y: mat.y + 50, r: 4, distM: 100 };
  const hole = (n: number, from: Pt, to: Pt): Hole => {
    const lengthM = Math.round(dist(from, to) * TILE_M);
    return { n, par: 3, lengthM, memberLengthM: lengthM, line: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }], warnings: [] };
  };
  const holes: Hole[] = [hole(RANGE_HOLE, mat, aim)];
  const surf = (x: number, y: number) => surfaceAt(areas, x, y);
  let chip: PracticeCourse['chip'] = null;
  if (p.chip && p.chip.stands.length) {
    const cup = p.chip.cup, sandAt = p.chip.stands.find(s => surf(s.x, s.y) === 'bunker') ?? null;
    const stand = p.chip.stands.find(s => { const k = surf(s.x, s.y); return k !== 'bunker' && k !== 'green' && k !== 'water'; }) ?? p.chip.stands[p.chip.stands.length - 1]!;
    chip = { cup: { x: cup.x, y: cup.y }, stand: { x: stand.x, y: stand.y }, sand: sandAt ? { x: sandAt.x, y: sandAt.y } : null };
    holes.push(hole(SHORT_HOLE, stand, cup));
  }
  const view = makeCourseView(holes, surf);
  const pins = holes.map(h => ({ hole: h.n, x: h.line[h.line.length - 1]!.x, y: h.line[h.line.length - 1]!.y }));
  const tees = holes.map(h => ({ hole: h.n, x: h.line[0]!.x, y: h.line[0]!.y, kind: 'middle' as const }));
  // J6b: the course file always holds the outfield as fairway, so the view counts it as the course's ground (else its own wild land grows plateaus and cliffs
  // there); a bare outfield is told apart by the lies the model reads (fescue: the view draws dry long grass by them, not a mown fairway)
  const shapes = areas.map((a, i) => (i <= outfieldAt && a.surface !== 'fairway' ? { ...a, surface: 'fairway' as GolfSurface } : a));   // (the ground and the outfield)
  const input: Export3pInput = { areas: shapes, tees, pins, aims: [], holes, ...(p.heightAt ? { heightAt: p.heightAt } : {}), name: p.name ?? 'Practice' };
  const junk: DrillJunk[] = (p.junk ?? []).filter(j => Number.isFinite(j.x) && Number.isFinite(j.y)).map(j => ({ x: j.x, y: j.y, r: junkReach(j.id), name: j.name, distM: Math.round(j.m) }));
  return { input, view, mat: { x: mat.x, y: mat.y }, greens: dg, chip, junk, idx: { range: 0, short: chip ? 1 : -1 } };
}

/** where the ball is teed up for a spot: the mat; the chip stand; the practice bunker (none: the chip stand); a putt out on the green, PUTT_M from the cup,
 *  its distance and side turning with each ball (k) so no two putts in a row are the same (a point off the green is not used) */
export function spotBall(c: PracticeCourse, spot: DrillSpot, k: number): Pt {
  if (spot === 'range' || !c.chip) return { ...c.mat };
  if (spot === 'chip') return { ...c.chip.stand };
  if (spot === 'sand') return { ...(c.chip.sand ?? c.chip.stand) };
  const cup = c.chip.cup, [lo, hi] = PUTT_M;
  for (let t = 0; t < 36; t++) {
    const m = lo + ((k * 0.618034 + t * 0.37) % 1) * (hi - lo), a = (k * 2.39996 + t * 0.7) % (Math.PI * 2), q = { x: cup.x + Math.cos(a) * m / TILE_M, y: cup.y + Math.sin(a) * m / TILE_M };
    if (c.view.lieAt(q.x, q.y) === 'green') return q;
  }
  for (let m = lo; m >= 1; m -= 0.5) for (let t = 0; t < 16; t++) { const a = t / 16 * Math.PI * 2, q = { x: cup.x + Math.cos(a) * m / TILE_M, y: cup.y + Math.sin(a) * m / TILE_M }; if (c.view.lieAt(q.x, q.y) === 'green') return q; }
  return { ...c.chip.stand };
}

/** what the driver asks of the game: the drills as saved now, and keeping a judged shot (the caller saves it and pays a drill done: drills.ts recordDrill) */
export interface PracticeHooks { drills(): DrillsSave | null; judged(id: DrillId, call: DrillCall): void }

/** endless balls at one place: the drill picked sets the spot and the pin; each ball is the model's; no hole ever ends */
export class PracticeDriver implements RoundDriver {
  readonly view: CourseView;
  readonly golfer = -1;
  readonly inputs: OwnerInput[] = [];
  private readonly list: Shot[] = [];
  /** the drill being played (null: none: free hitting from the place's first spot) */
  active: DrillId | null;
  /** the last ball's line for the panel (null: none yet) */
  note: string | null = null;
  /** balls hit this session */
  balls = 0;
  /** J6b: the junk pile the last ball hit, said once (null: none) */
  hitJunk: string | null = null;
  constructor(readonly course: PracticeCourse, readonly place: PracticePlace, private readonly sk: ShotSkill, private readonly seed: number, private readonly hooks: PracticeHooks) {
    this.view = course.view;
    const here = drillsAt(place), sv = hooks.drills();
    this.active = here.find(id => !drillProgress(sv, id).done && this.canPlay(id)) ?? here.find(id => this.canPlay(id)) ?? null;
  }
  /** whether drill id can be played here (its place, and at the short game area its spot: a bunker drill needs the bunker) */
  canPlay(id: DrillId): boolean {
    const d = DRILLS[id];
    if (!drillsAt(this.place).includes(id)) return false;
    if (id === 'junk') return this.course.junk.length > 0;
    if (d.spot === 'range') return true;
    return !!this.course.chip && (d.spot !== 'sand' || !!this.course.chip.sand);
  }
  /** picks drill id (false: not here) */
  pick(id: DrillId): boolean { if (!this.canPlay(id)) return false; this.active = id; this.note = null; return true; }
  /** the spot the next ball is played from */
  get spot(): DrillSpot { return this.active ? DRILLS[this.active].spot : this.place === 'range' ? 'range' : 'chip'; }
  private get holeIdx(): number { return Math.max(0, this.course.idx[this.place]); }
  /** the pin of the next ball: the drill's range green (distance and shaping: theirs; else the 100 m green), or the chipping green's cup */
  pin(): Pt {
    if (this.place === 'short' && this.course.chip) return { ...this.course.chip.cup };
    const g = greenAt(this.course.greens, this.active ? DRILLS[this.active].greenM ?? 100 : 100);
    return g ? { x: g.x, y: g.y } : { ...this.view.holes[this.holeIdx]!.pin };
  }
  private holeNow(): PlayHole { const h = this.view.holes[this.holeIdx]!, ball = spotBall(this.course, this.spot, this.balls), pin = this.pin(); return { ...h, pin, line: [ball, pin] }; }

  turn(): OwnerTurn {
    const h = this.holeNow(), ball = h.line[0]!, lie = this.view.lieAt(ball.x, ball.y), tee = this.spot === 'range';
    const sg = chooseShot(lie, ball, h, this.sk, tee), putting = sg.club === 'putter';
    const distM = dist(h.pin, ball) * TILE_M, dM = dist(sg.aim, ball) * TILE_M;
    const power = putting ? 1 : Math.min(POWER[1]!, Math.max(POWER[0]!, dM / carryFor(this.sk, sg.club)));
    return { golfer: this.golfer, holeIdx: this.holeIdx, hole: h.n, par: h.par, stroke: this.balls + 1, t: 0, lie: tee ? 'tee' : lie, ball: { ...ball }, pin: { ...h.pin }, distM,
      suggested: { club: sg.club, aim: { ...sg.aim }, power } };
  }
  play(input: OwnerInput): Shot {
    const t = this.turn(), h = this.holeNow(), { holeIdx: _h, stroke: _s, ...inp } = input; void _h; void _s;
    const r = mulberry((this.seed ^ Math.imul(this.balls + 1, 2654435761)) | 0);
    const o = shotOutcome(this.view, h, t.ball, t.lie, this.sk, { ...inp, v: inp.v ?? MODEL_V }, r, { last: false });
    { const j = this.spot === 'range' ? junkHit(this.course.junk, o.landing?.at ?? null, o.landing?.rest ?? o.to) : null; this.hitJunk = j ? `Hit the ${j.name.toLowerCase()}!` : null; }   // (J6b: any range ball that hits a junk pile is said)
    const shot: Shot = { golfer: this.golfer, hole: t.holeIdx, stroke: t.stroke, t: 0, from: { ...t.ball }, to: o.to, club: input.club, lie: o.lie, penalty: o.penalty, holed: o.holed,
      ...(o.landing ? { landing: o.landing } : {}) };
    this.list.push(shot); this.inputs.push(input); this.balls++;
    if (this.active) {
      const ds: DrillShot = { spot: this.spot, club: input.club, shape: o.shape, landing: o.landing?.at ?? null, landLie: o.landing?.lie ?? null, rest: o.landing?.rest ?? o.to,
        restLie: o.landing?.restLie ?? o.lie, holed: o.holed, pin: t.pin, greens: this.course.greens, from: t.lie, junk: this.course.junk };
      const id = this.active, was = drillProgress(this.hooks.drills(), id).done, call = judgeDrill(id, ds); this.note = call.note;
      this.hooks.judged(id, call);
      if (!was && drillProgress(this.hooks.drills(), id).done) {   // (just done: on to the next drill not done here, from the next ball; none left: he keeps this one)
        const sv = this.hooks.drills(), next = drillsAt(this.place).find(d => d !== id && this.canPlay(d) && !drillProgress(sv, d).done);
        if (next) this.active = next;
      }
    } else this.note = null;
    return shot;
  }
  shots(): readonly Shot[] { return this.list; }
  /** hole index i as he plays it: the drill's pin on it */
  hole(i: number): PlayHole { const h = this.view.holes[i] ?? this.view.holes[0]!; return { ...h, pin: this.pin() }; }
  strokes(): number { return this.balls; }
  isLast(): boolean { return false; }
  over(): boolean { return false; }
}

/** the range's flags as the view stands them. J6c (the owner: "labels overlapping ... make sprites with distance markers only"): none, at either place. The practice view draws no
 *  flag and no label of its own, never text drawn by code: the range's distances are its own PNG pictures (the yardage signs: yardage-signs.ts, placed by rangebiz.ts rangeScene) and a
 *  built target green's pin is the range's own pin picture, all sent with the range's things. The message keeps its (empty) `flags` list for a view that still reads one */
export function practiceFlags(_c: PracticeCourse, _place: PracticePlace, _centre: Pt): { at: ViewPt; label: string; only?: true }[] { return []; }

/** J6c (the owner: the golfers at the other mats must not stand frozen): how a range golfer keeps hitting in the practice view. The view plays it on its own clock (protocol3p.ts
 *  Actor.cycle: he stands to the ball, takes the club back, swings through and rests, again and again): the seconds one ball takes him, 3.6 to 5.4 by his visit's id (the range
 *  sim's own swing is about 4: rangebiz.ts SWING), and where in it he starts (`phase`, 0..1), so no two of them swing together */
export function rangeSwingCycle(id: number): { cycle: number; phase: number } {
  const r = mulberry((Math.imul(Math.trunc(id) | 0, 2654435761) ^ 0x5bd1e995) | 0);
  return { cycle: Math.round((3.6 + r() * 1.8) * 100) / 100, phase: Math.floor(r() * 1000) / 1000 };
}

/** J6c: the bare earth under a range's tee in the practice view, as plot-frame rectangles [u0, v0, u1, v1] (tiles; w: the plot's width, tee: rangebiz.ts RANGE_TEE): the whole band from
 *  the shop's walk to past the tee when the tee is dirt (the dirt tee, the slab and the mats lie over it); round a turfed tee only its front and its two sides, so the tee's own turf
 *  shows, as the game draws it */
export function bareEarthRects(w: number, tee: readonly [number, number, number, number], turfed: boolean): [number, number, number, number][] {
  const [u0, u1, v0, v1] = tee, a = 0.3, b = w - 0.3, front = 16.5, back = 30;
  return turfed ? [[a, front, b, v0], [a, v0, u0, v1], [u1, v0, b, v1]] : [[a, front, b, back]];
}

/** J6c: the practice course's tee area: the tee box, and once it is turfed (the scene's `apron`: rangebiz.ts RangeScene.apron) the strip of turf between it and the outfield with it,
 *  as the game lays them into the course grid: one stepped polygon through the corners of the two rectangles (each as rangebiz.ts `quad` makes it: its corners in turn) */
export function teeAreaOf(teeBox: readonly number[], apron: readonly number[] | null): number[] {
  if (!apron || apron.length < 8 || teeBox.length < 8) return teeBox.slice();
  const t = (i: number) => [teeBox[2 * i]!, teeBox[2 * i + 1]!], a = (i: number) => [apron[2 * i]!, apron[2 * i + 1]!];
  return [...t(0), ...t(1), ...t(2), ...a(1), ...a(2), ...a(3), ...a(0), ...t(3)];
}
