// T305 (#890, #881; the owner, 2026-11-02: "the parking lots dont work", "sometimes cars dont align with parking", "the parking looks massive"): a car park
// laid in the lot's own frame (x along the street, y away from it, tiles of 2 m). One row of bays square to the street, a 6 m aisle in front of them
// (between the street and the bays). A bay is the parked car's footprint in its own frame plus 0.35 m across and 0.5 m along (the car's margins), so
// each car fills its bay as in a real car park. The cars point along the bays' axis (nose out, or nose in), each in the picture whose heading is
// the nearest one to that axis (the eight-way car art, turned by the frame as compose turns a preset's props). The bay lines are painted lines of
// the car park's patch (never props), so they follow the lot at any angle. Pure: no DOM.
import { LIBRARY } from '../library';
import { CAR_DIRECTIONS, CAR_SCALE, carDrawnLength, carHeading, carOwnerScale } from '../ext/car-art';
import { frameHalf } from './house-class';
import type { PresetFrame } from './preset-frame';
import type { PresetPatch, PresetProp, View } from './presets';
import { OVERLAP, share, type Box4 } from './compose-core';

/** a bay's margins (tiles): 0.35 m across the car (0.175 each side), 0.5 m along it (0.25 each end), and the aisle in front of the bays (6 m) */
export const BAY_SIDE = 0.175, BAY_END = 0.25, AISLE = 3;
const CAR8 = /^cars:(.+):(SE|S|SW|W|NW|N|NE|E)$/;
let BY_HEAD: Map<number, string[]> | null = null;
/** the eight-way car pictures by heading index (CAR_DIRECTIONS), sorted, made once */
function carsByHeading(): Map<number, string[]> {
  if (BY_HEAD) return BY_HEAD;
  BY_HEAD = new Map();
  for (const it of LIBRARY) {
    const m = CAR8.exec(it.id); if (!m) continue;
    const h = CAR_DIRECTIONS.indexOf(m[2] as (typeof CAR_DIRECTIONS)[number]);
    const l = BY_HEAD.get(h) ?? []; l.push(it.id); BY_HEAD.set(h, l);
  }
  for (const l of BY_HEAD.values()) l.sort();
  return BY_HEAD;
}

/** a car park's plan in the lot's frame: its bays (x0 .. x1 along the street, the aisle y 0 .. y1), the painted lines (the bays' edges and the aisle's
 *  edge: x0, y0, x1, y1 segments), and one parked car per bay (a prop at the bay's centre, the car's own size: scale 1) */
export interface CarPark { x0: number; x1: number; y1: number; bays: number; lines: number[]; cars: PresetProp[] }

/** the car park of a row of bays from x0 to at most x1 (tiles, lot frame), the bays' axis along the lot's away vector (f.n), each bay the width and the
 *  length of the car it holds (the picture is one model for the whole row, so the bays are all one size); nose out or in by the seed. Null when no
 *  car picture lies on that heading or no bay fits the span */
export function carPark(f: PresetFrame, x0: number, x1: number, seed: number): CarPark | null {
  // the world heading nearest the away vector (n), nose out or in (+4: the other way); the preset-frame index turned by f.q quarters gives it back
  const w = (carHeading(Math.atan2(f.n.y, f.n.x)) + 4 * (seed & 1)) % 8, p = (w + 2 * f.q) % 8;
  const list = carsByHeading().get(p); if (!list?.length) return null;
  const id = list[(seed >>> 1) % list.length]!;
  const h = frameHalf(f)({ id, x: 0, y: 0, scale: 1, view: 0 });
  const bw = 2 * h.ha + 2 * BAY_SIDE, bl = 2 * h.hb + 2 * BAY_END;
  const k = Math.floor((x1 - x0) / bw + 1e-9);
  if (k < 1) return null;
  const xe = x0 + k * bw, ye = AISLE + bl, lines: number[] = [];
  for (let i = 0; i <= k; i++) lines.push(x0 + i * bw, AISLE, x0 + i * bw, ye);   // the bays' edges
  lines.push(x0, AISLE, xe, AISLE);                                                // the aisle's edge
  const cars: PresetProp[] = [];
  for (let i = 0; i < k; i++) cars.push({ id, x: x0 + (i + 0.5) * bw, y: AISLE + bl / 2, scale: 1, view: 0 });
  return { x0, x1: xe, y1: ye, bays: k, lines, cars };
}

// ---------- T298 (#883; for T296 #881 too): bay rows on either side of an aisle, sized from the car's own body at any street angle
/** a car's body's width over its length (a 4.5 m car is about 1.9 m wide) */
const CAR_WIDTH = 0.42;
/** the bays of a car park: the car model they are sized for, a bay's width along the row (bw) and its length from the aisle (bl), tiles */
export interface BayDims { model: string; bw: number; bl: number; len: number; wid: number }
/** a car's drawn body (tiles): its length (car-lengths.json at its owner size and CAR_SCALE; a 4.5 m car when unmeasured) and its width. The same on any
 *  street: the picture's world box (frameHalf) is a diagonal car's bounding square on a screen-straight street, two bays wide */
export function carBody(id: string): { len: number; wid: number } {
  const len = (carDrawnLength(id) ?? 4.5 * CAR_SCALE * carOwnerScale(id)) / 2;
  return { len, wid: len * CAR_WIDTH };
}
/** the bay size of a car park in frame f: one car model (seeded) for its rows, its bays its body plus the margins (BAY_SIDE across, BAY_END along) */
export function bayDims(f: PresetFrame, seed: number): BayDims | null {
  const w = carHeading(Math.atan2(f.n.y, f.n.x)), list = carsByHeading().get((w + 2 * f.q) % 8);
  if (!list?.length) return null;
  const id = list[(seed >>> 1) % list.length]!, m = CAR8.exec(id)!, b = carBody(id);
  return { model: m[1]!, bw: b.wid + 2 * BAY_SIDE, bl: b.len + 2 * BAY_END, len: b.len, wid: b.wid };
}
/** the preset id of a model's picture that the frame turns to the world heading nearest the frame vector (vx along the street, vy away), or null */
export function carToward(f: PresetFrame, model: string, vx: number, vy: number): string | null {
  const wx = f.u.x * vx + f.n.x * vy, wy = f.u.y * vx + f.n.y * vy, p = (carHeading(Math.atan2(wy, wx)) + 2 * f.q) % 8;
  const id = `cars:${model}:${CAR_DIRECTIONS[p]}`;
  return carsByHeading().get(p)?.includes(id) ? id : (carsByHeading().get(p)?.[0] ?? null);
}
/** a row of k bays from x0 along the row, their open ends on the aisle's edge at ya and their backs at ya + dir x bl (dir 1: away from the street,
 *  -1: toward it): the bays (x0, y0, x1, y1 boxes), the painted lines (each bay's sides), the wheel stops' spots (STOP_IN in from each back end) and a car
 *  in a share `fill` of the bays (seeded; nosed in, now and then backed in, along the bays' axis: the picture turned nearest to it). T296 (#881): axis 'y'
 *  (the default) lays the row along the frame's x, its bays along y (square to the street); axis 'x' lays it along y, its bays along x (x0 and k along y,
 *  ya and dir along x), for a car park whose bays run along the street */
export interface BayRow { axis: 'x' | 'y'; bays: [number, number, number, number][]; lines: number[]; stops: { x: number; y: number }[]; cars: PresetProp[] }
export function bayRow(f: PresetFrame, dims: BayDims, x0: number, k: number, ya: number, dir: 1 | -1, fill: number, seed: number, axis: 'x' | 'y' = 'y'): BayRow {
  const { bw, bl } = dims, yb = ya + dir * bl, lo = Math.min(ya, yb), hi = Math.max(ya, yb);
  // (s along the row, t along the bay: the frame point)
  const P = axis === 'y' ? (s: number, t: number): [number, number] => [s, t] : (s: number, t: number): [number, number] => [t, s];
  const out: BayRow = { axis, bays: [], lines: [], stops: [], cars: [] };
  let r = (seed ^ 0x298) >>> 0; const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const nose = carToward(f, dims.model, ...P(0, dir)), tail = carToward(f, dims.model, ...P(0, -dir));
  for (let i = 0; i <= k; i++) out.lines.push(...P(x0 + i * bw, ya), ...P(x0 + i * bw, yb));
  for (let i = 0; i < k; i++) {
    const cx = x0 + (i + 0.5) * bw, [a, b] = P(x0 + i * bw, lo), [c, d] = P(x0 + (i + 1) * bw, hi);
    out.bays.push([a, b, c, d]);
    const [sx, sy] = P(cx, yb - dir * STOP_IN); out.stops.push({ x: sx, y: sy });
    if (rnd() >= fill) continue;
    const id = rnd() < 0.2 ? tail ?? nose : nose ?? tail, [px, py] = P(cx, (ya + yb) / 2 + dir * 0.1);
    if (id) out.cars.push({ id, x: px, y: py, scale: 1, view: 0 });
  }
  return out;
}

// ---------- T296 (#881; the owner, 2026-11-02: "parking lots like the one now at the driving range needs to be all over town and they need to adapt to the
// street angle. also need different angles of the parking lot cement stoppers and parking lines that are at different angle based on the road"): a whole
// car park in any rectangle of a lot's frame, so it lies along its street at any angle, with its wheel stops in every heading.
/** the wheel stop: its picture, its inset from a bay's back end (tiles), the half length of the stop painted on the ground (0.84 m: a 1.7 m kerb stone) */
export const STOP = 'expansion:wheel-stop', STOP_IN = 0.35, STOP_HALF = 0.42;
/** the stop's picture lies along one world axis (turned and mirrored onto the other: preset-art AXIS_PROPS), so it is drawn only where the bays' rows run
 *  within 2 degrees of a world axis; every other heading (the screen-straight streets, a free angle) paints the stop on the ground (a concrete bar with its
 *  shadow: LotPatch.stops, renderer.ts drawLots), across the bay at any angle */
const STOP_SNAP = Math.cos(2 * Math.PI / 180);
/** whether frame f's rows run along a world axis (the stop's picture fits them) */
export const stopArt = (f: PresetFrame): boolean => Math.max(Math.abs(f.u.x), Math.abs(f.u.y)) > STOP_SNAP;
/** what a car park needs of a lot's layout (autolot's Lay; compose's re-lay of a preset's car park, relayParks) */
export interface ParkLay {
  readonly f: PresetFrame; readonly props: PresetProp[]; readonly boxes: Box4[]; readonly patches: PresetPatch[];
  r(): number;
  boxOf(q: PresetProp): Box4;
  add(q: PresetProp): boolean;
  fit(id: string, view: View, cx: number, cy: number, ha: number, hb: number, least?: number): PresetProp | null;
}
/** a row's wheel stops and cars into a layout: the stops as the picture (stopArt, fitted to the bay's width) or painted bars (pushed on bars: x0 y0 x1 y1,
 *  across the bay); the cars where their body is clear of the layout's other pieces (a car's box is its body, not its picture's square); the counts */
export function rowInto(L: ParkLay, row: BayRow, dims: BayDims, bars: number[]): { art: number; bars: number; cars: number[] } {
  const out = { art: 0, bars: 0, cars: [] as number[] }, art = stopArt(L.f), along = row.axis === 'y';
  // (the cars first: a stop lies under a car's nose, never in the overlap rule)
  for (const c of row.cars) {
    const b = carBody(c.id), box: Box4 = along ? [c.x - b.wid / 2, c.y - b.len / 2, c.x + b.wid / 2, c.y + b.len / 2] : [c.x - b.len / 2, c.y - b.wid / 2, c.x + b.len / 2, c.y + b.wid / 2];
    if (L.boxes.some(o => share(box, o) > OVERLAP)) continue;
    L.props.push(c); L.boxes.push(box); out.cars.push(L.props.length - 1);
  }
  for (const p of row.stops) {
    const q = art ? (along ? L.fit(STOP, 0, p.x, p.y, dims.bw / 2 - 0.02, 0.2, 0.7) : L.fit(STOP, 1, p.x, p.y, 0.2, dims.bw / 2 - 0.02, 0.7)) : null;
    if (q) { L.props.push(q); L.boxes.push(L.boxOf(q)); out.art++; continue; }
    const h = Math.min(STOP_HALF, dims.bw / 2 - 0.12);
    bars.push(...(along ? [p.x - h, p.y, p.x + h, p.y] : [p.x, p.y - h, p.x, p.y + h]).map(v => +v.toFixed(3))); out.bars++;
  }
  return out;
}

/** a row's run from a to b cut into bays and kerbed islands: islands at both ends and between runs of maxRun bays at most, the slack shared by the end
 *  islands; the whole run an island when fewer than two bays fit. bare: a run too short for two islands and three bays is all bays (centred), no island */
export function bayRuns(a: number, b: number, bw: number, isl: number, maxRun: number, bare = false): { isl: [number, number][]; bays: [number, number][] } {
  const len = b - a;
  if (bare && len < 2 * isl + 3 * bw) { const k = Math.floor(len / bw + 1e-9); return { isl: [], bays: k < 1 ? [] : [[a + (len - k * bw) / 2, k]] }; }
  let k = Math.floor((len - 2 * isl) / bw + 1e-9);
  if (k < 2) return { isl: len > 0.4 ? [[a, b]] : [], bays: [] };
  const m = Math.ceil(k / maxRun);
  k = Math.floor((len - (m + 1) * isl) / bw + 1e-9);
  if (k < 2) return { isl: [[a, b]], bays: [] };
  const extra = len - (m + 1) * isl - k * bw, isles: [number, number][] = [], bays: [number, number][] = [];
  let x = a + isl + extra / 2;
  isles.push([a, x]);
  for (let j = 0; j < m; j++) {
    const n = Math.floor(k / m) + (j < k % m ? 1 : 0);
    bays.push([x, n]); x += n * bw;
    const e = j === m - 1 ? b : x + isl;
    isles.push([x, e]); x = e;
  }
  return { isl: isles, bays };
}
const quad = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1].map(v => +v.toFixed(3));

/** a car park's ground and furniture: its asphalt's texture, the trees and shrubs its islands are planted from, whether its islands are lit (lamp posts) */
export interface ParkKit { tex: string; trees: readonly string[]; shrubs: readonly string[]; lamps: boolean }
/** a laid car park (frame tiles): its asphalt's box, the entrance (its mouth from the street, y = 0, to the first aisle), whether it is at the middle or a
 *  side drive, the aisles, the bays, the islands, and the props it added (lamp posts, cars: indices), its wheel stops (art: pictures, bars: painted) */
export interface ParkPlan {
  park: Box4; entrance: Box4; mouth: 'mid' | 'side'; aisles: Box4[]; bays: Box4[]; islands: Box4[]; lamps: number[]; cars: number[]; art: number; bars: number;
}
/** the car park's aisle (5.6 m, two-way), the entrance's width at the middle, an island's least width, the most bays between two islands, an island's kerb */
export const PARK_AISLE = 2.8, PARK_ENTRY = 3.2, PARK_ISL = 1.5, PARK_RUN = 8, PARK_KERB = 0.2;
const LAMP = 'world:streetlamp';

/** a car park laid in box (x0, y0, x1, y1 in the lot's frame; the street before y0, the lot's front at y = 0), square to its street at any angle. From the
 *  street back, modules of [a row facing the street, an aisle, a row] where both rows fit, else [an aisle, a row], as many as the depth takes; one module is
 *  entered at its middle (through the front row), several by a drive at one side (seeded) that joins their aisles. Each row is cut into runs of bays and
 *  kerbed, planted islands (bayRuns: none on a short row), the end islands of the back rows lit by a lamp post. Bays sized from the car (bayDims), painted
 *  lines, a wheel stop at each bay's back (rowInto: the picture or a painted bar), cars in some bays. The asphalt is one patch (the lines and the bars on it)
 *  with its mouth to the street; the islands are drawn over it (park). Null when no row and aisle fit */
export function layCarPark(L: ParkLay, box: Box4, seed: number, kit: ParkKit): ParkPlan | null {
  const [x0, y0, x1, y1] = box, f = L.f, dims = bayDims(f, seed);
  if (!dims) return null;
  const { bw, bl } = dims, CA = PARK_AISLE;
  // the modules from the street back (the aisle from ya to yb; a front row before it when front)
  const mods: { front: boolean; ya: number; yb: number }[] = [];
  for (let y = y0; ;) {
    const room = y1 - y;
    if (room >= 2 * bl + CA - 1e-9) { mods.push({ front: true, ya: y + bl, yb: y + bl + CA }); y += 2 * bl + CA; }
    else if (room >= bl + CA - 1e-9) { mods.push({ front: false, ya: y, yb: y + CA }); y += bl + CA; }
    else break;
  }
  if (!mods.length) return null;
  const last = mods[mods.length - 1]!, yE = last.yb + bl, side = mods.length > 1, left = ((seed >>> 3) & 1) === 0;
  let rx0 = x0, rx1 = x1, ent: Box4;
  if (side) {
    const dx0 = left ? x0 : x1 - CA;
    ent = [dx0, 0, dx0 + CA, last.yb];
    if (left) rx0 = dx0 + CA; else rx1 = dx0;
  } else { const ex0 = (x0 + x1) / 2 - PARK_ENTRY / 2; ent = [ex0, 0, ex0 + PARK_ENTRY, mods[0]!.ya]; }
  if (rx1 - rx0 < 2 * bw) return null;
  const plan: ParkPlan = { park: [x0, y0, x1, yE], entrance: ent, mouth: side ? 'side' : 'mid', aisles: [], bays: [], islands: [], lamps: [], cars: [], art: 0, bars: 0 };
  const fill = 0.45 + 0.35 * L.r(), lines: number[] = [], bars: number[] = [], isles: { b: Box4; aisle: number; lit: boolean }[] = [];
  const row = (a: number, b: number, ya: number, dir: 1 | -1, s: number, lit: boolean) => {
    const R = bayRuns(a, b, bw, PARK_ISL, PARK_RUN, true), lo = Math.min(ya, ya + dir * bl), hi = Math.max(ya, ya + dir * bl);
    R.bays.forEach(([bx, k], j) => {
      const r = bayRow(f, dims, bx, k, ya, dir, fill, s + 17 * j);
      lines.push(...r.lines); plan.bays.push(...r.bays);
      const n = rowInto(L, r, dims, bars); plan.art += n.art; plan.bars += n.bars; plan.cars.push(...n.cars);
    });
    R.isl.forEach(([ia, ib], j) => isles.push({ b: [ia, lo, ib, hi], aisle: ya, lit: lit && (j === 0 || j === R.isl.length - 1) }));
  };
  mods.forEach((m, j) => {
    plan.aisles.push([side ? rx0 : x0, m.ya, side ? rx1 : x1, m.yb]);
    if (m.front) {
      if (side) row(rx0, rx1, m.ya, -1, seed + 101 * j + 7, false);
      else { row(rx0, ent[0], m.ya, -1, seed + 101 * j + 7, false); row(ent[2], rx1, m.ya, -1, seed + 101 * j + 9, false); }
    }
    row(rx0, rx1, m.yb, 1, seed + 101 * j + 11, kit.lamps);
  });
  // (the side drive's end beside the last back row: an island)
  if (side) isles.push({ b: [ent[0], last.yb, ent[2], yE], aisle: last.yb, lit: kit.lamps });
  // the asphalt: the box to the back of the last row, its mouth out to the street (y = 0)
  const P: number[] = [x0, y0];
  if (y0 > 0.05) P.push(ent[0], y0, ent[0], 0, ent[2], 0, ent[2], y0);
  P.push(x1, y0, x1, yE, x0, yE);
  L.patches.push({ kind: 'lot', tex: kit.tex, pts: P.map(v => +v.toFixed(3)), lines: lines.map(v => +v.toFixed(3)), ...(bars.length ? { stops: bars } : {}) });
  // the islands: a kerb of slabs round grass, drawn over the asphalt (park); a tree or a shrub, and on the lit ones a lamp post at the aisle end
  for (const is of isles) {
    const [a, b, c, d] = is.b;
    if (c - a < 0.6 || d - b < 0.6) continue;
    plan.islands.push(is.b);
    const K = PARK_KERB;
    L.patches.push({ kind: 'walk', tex: 'slabs', pts: quad(a, b, c, b + K), park: true }, { kind: 'walk', tex: 'slabs', pts: quad(a, d - K, c, d), park: true },
      { kind: 'walk', tex: 'slabs', pts: quad(a, b + K, a + K, d - K), park: true }, { kind: 'walk', tex: 'slabs', pts: quad(c - K, b + K, c, d - K), park: true },
      { kind: 'yard', tex: 'grass', pts: quad(a + K, b + K, c - K, d - K), park: true });
    const mx = (a + c) / 2, toward = is.aisle <= b + 1e-6 ? 1 : -1, near = is.aisle + toward * 0.45, far = is.aisle + toward * (d - b - 0.75);
    if (is.lit) { const q = L.fit(LAMP, 0, mx, near, 0.4, 0.4); if (q && L.add(q)) plan.lamps.push(L.props.length - 1); }
    plant(L, kit, mx, is.lit ? far : (b + d) / 2, (c - a) / 2 - K, (d - b) / 2 - K);
  }
  return plan;
}
/** an island's planting: a tree (the kit's, the largest that fits, at most 0.75) or, on a small island, a shrub */
function plant(L: ParkLay, kit: ParkKit, x: number, y: number, ha: number, hb: number): void {
  const n = kit.trees.length, at = Math.floor(L.r() * Math.max(1, n));
  if (n && ha >= 0.45 && hb >= 0.45) for (let t = 0; t < Math.min(n, 6); t++) { const q = L.fit(kit.trees[(at + t) % n]!, 0, x, y, ha, hb, 0.4); if (q && L.add({ ...q, scale: Math.min(q.scale, 0.75) })) return; }
  const m = kit.shrubs.length; if (!m) return;
  const q = L.fit(kit.shrubs[at % m]!, 0, x, y, Math.min(0.5, ha), Math.min(0.5, hb), 0.3); if (q) L.add(q);
}
