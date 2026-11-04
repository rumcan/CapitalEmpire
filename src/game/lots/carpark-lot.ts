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
import type { PresetProp } from './presets';

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
/** a row of k bays from x0 along the street, their open ends on the aisle's edge at y = ya and their backs at ya + dir x bl (dir 1: away from the street,
 *  -1: toward it): the bays (x0, y0, x1, y1 boxes), the painted lines (each bay's sides), the wheel stops' spots (in from each back end) and a car in a
 *  share `fill` of the bays (seeded; nosed in, now and then backed in, along the bays' axis: the picture turned nearest to it) */
export interface BayRow { bays: [number, number, number, number][]; lines: number[]; stops: { x: number; y: number }[]; cars: PresetProp[] }
export function bayRow(f: PresetFrame, dims: BayDims, x0: number, k: number, ya: number, dir: 1 | -1, fill: number, seed: number): BayRow {
  const { bw, bl } = dims, yb = ya + dir * bl, lo = Math.min(ya, yb), hi = Math.max(ya, yb);
  const out: BayRow = { bays: [], lines: [], stops: [], cars: [] };
  let r = (seed ^ 0x298) >>> 0; const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const nose = carToward(f, dims.model, 0, dir), tail = carToward(f, dims.model, 0, -dir);
  for (let i = 0; i <= k; i++) out.lines.push(x0 + i * bw, ya, x0 + i * bw, yb);
  for (let i = 0; i < k; i++) {
    const cx = x0 + (i + 0.5) * bw;
    out.bays.push([x0 + i * bw, lo, x0 + (i + 1) * bw, hi]);
    out.stops.push({ x: cx, y: yb - dir * 0.35 });
    if (rnd() >= fill) continue;
    const id = rnd() < 0.2 ? tail ?? nose : nose ?? tail;
    if (id) out.cars.push({ id, x: cx, y: (ya + yb) / 2 + dir * 0.1, scale: 1, view: 0 });
  }
  return out;
}
