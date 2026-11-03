// Your character (T240, #704; docs/plans/P28.md section 1; the owner, 2026-11-03: "the your character ticket should let the player walk around the
// world like in a point and click adventure game" and "the player must walk with the keys"). Pure TS, no DOM, no engine: the engine hands it what
// it needs (the cost of the ground, what blocks) and draws what it says.
// - Where you are: a point (tiles), a facing (0-7, the people sheets' rows S SW W NW N NE E SE), walking or idle, swinging at a mat.
// - Click to walk: a route found once per click (offroad.ts gridPath: a grid A* round what may not be crossed, pulled straight), walked at a
//   person's pace in REAL time (1.4 m/s; a second click or a double-click runs), whatever the sim's speed: the town may run at 4x or crawl at
//   a watching speed (T320), you always walk as a person walks. A long trip offers Skip (you arrive at once).
// - Keys: WASD / the arrows walk you straight, camera-relative on the iso map (up the screen is up), sliding along what blocks.
// - What a click does (the verb the cursor shows): walk on open ground, talk to a person, look at a building (its card), use a range piece,
//   a practice green or the first tee.
// Everything per frame here is allocation-free: the route is the only allocation, and only on a click.
import type { Pt } from '../network';
import { facing } from '../ext/pedestrians';
import { gridPath } from '../offroad';

/** a person's walk, 1.4 m/s, in tiles per second (2 m per tile; the townspeople's WALK_SPEED) */
export const YOU_WALK = 0.7;
/** a jog (a second click or a double-click on the same spot), 3.8 m/s in tiles per second */
export const YOU_RUN = 1.9;
/** a trip with more than this left (tiles, 120 m) offers Skip: you arrive at once */
export const SKIP_TILES = 60;
/** the walk clip's frames per tile walked (the golfer sheets' walk: 8 frames a 1.4 s stride cycle at 1.4 m/s, 0.7 tiles/s) */
export const FRAMES_PER_TILE = 8 / (1.4 * YOU_WALK);
/** how near a thing you stop to use it (tiles): a person is talked to from here */
export const TALK_REACH = 1.2;

/** what a click does there, as the adventure games' cursor says it */
export type Verb = 'walk' | 'talk' | 'look' | 'use';
/** what is under the pointer: open ground, a person, a building (a business, a house, an iconic place, the clubhouse), the range (its front and
 *  pieces), the practice area's greens, the first tee */
export type ThingKind = 'ground' | 'person' | 'building' | 'range' | 'practice' | 'tee';
export const VERB_OF: Readonly<Record<ThingKind, Verb>> = { ground: 'walk', person: 'talk', building: 'look', range: 'use', practice: 'use', tee: 'use' };
/** the verb of a thing; null where you cannot go (water, a fence, a wall with nothing to look at) */
export function verbOf(kind: ThingKind | null): Verb | null { return kind ? VERB_OF[kind] : null; }
/** the hover label: what a click there does, naming the thing */
export function hoverText(kind: ThingKind | null, name = ''): string {
  switch (kind) {
    case 'ground': return 'Walk here';
    case 'person': return name ? `Talk to ${name}` : 'Talk';
    case 'building': return name ? `Look at ${name}` : 'Look';
    case 'range': return 'Use the range: buy a bucket, hit at a mat';
    case 'practice': return name ? `Use ${name}` : 'Use the practice area';
    case 'tee': return 'The first tee: start a round';
    default: return 'You cannot walk there';
  }
}

/** your character as the engine keeps it. path: the route's x, y pairs (reused); seg: the point walked toward next; phase: the walk clip's
 *  phase (frames); swing: seconds into a swing at a mat (-1: not swinging); skip: whether the trip left is long (Skip shows) */
export interface You {
  x: number; y: number; face: number;
  path: number[]; seg: number; run: boolean; moving: boolean; keys: boolean;
  phase: number; swing: number; skip: boolean;
  /** the target marker's point (NaN: none) and its age (s) */
  tx: number; ty: number; mark: number;
}
export function makeYou(x: number, y: number, face = 0): You {
  return { x, y, face, path: [], seg: 0, run: false, moving: false, keys: false, phase: 0, swing: -1, skip: false, tx: NaN, ty: NaN, mark: 0 };
}

/** the route from a to b (tiles) round what cost(x, y) makes Infinity (paths cheapest), its points a first and b last. Found once per click */
export function routeOf(a: Pt, b: Pt, cost: (x: number, y: number) => number): Pt[] {
  return gridPath(a, b, cost, 256, 16);
}

/** sets you walking a route (its points, the first where you stand), running or not; the target marker goes on its last point */
export function startWalk(y: You, pts: readonly Pt[], run: boolean): void {
  const P = y.path; P.length = 0;
  for (const p of pts) P.push(p.x, p.y);
  y.seg = P.length >= 4 ? 1 : 0; y.run = run; y.moving = P.length >= 4; y.swing = -1; y.keys = false;
  const n = P.length; if (n >= 2) { y.tx = P[n - 2]!; y.ty = P[n - 1]!; y.mark = 0; }
  y.skip = remaining(y) > SKIP_TILES;
}
/** stops where you are (the marker goes) */
export function stopWalk(y: You): void { y.path.length = 0; y.seg = 0; y.moving = false; y.run = false; y.skip = false; y.tx = NaN; y.ty = NaN; }
/** the length of the trip left (tiles) */
export function remaining(y: You): number {
  if (!y.moving) return 0;
  const P = y.path; let d = 0, px = y.x, py = y.y;
  for (let i = y.seg * 2; i + 1 < P.length; i += 2) { d += Math.hypot(P[i]! - px, P[i + 1]! - py); px = P[i]!; py = P[i + 1]!; }
  return d;
}
/** Skip: you arrive at once (keep: the last tiles of the route are still walked, so you are seen to arrive) */
export function skipAhead(y: You, keep = 3): void {
  if (!y.moving) return;
  const P = y.path, n = P.length / 2; let left = keep;
  // walk back from the end until `keep` tiles remain, and stand there
  for (let i = n - 1; i > y.seg; i--) {
    const ax = P[(i - 1) * 2]!, ay = P[(i - 1) * 2 + 1]!, bx = P[i * 2]!, by = P[i * 2 + 1]!, L = Math.hypot(bx - ax, by - ay);
    if (L >= left) { const f = L > 0 ? left / L : 0; y.x = bx + (ax - bx) * f; y.y = by + (ay - by) * f; y.seg = i; y.skip = false; return; }
    left -= L;
  }
  y.skip = false;
}

/** one frame of a walk (dt real seconds): along the route at a walk or a run, facing the way you go; true on the frame you arrive */
export function stepYou(y: You, dt: number): boolean {
  if (y.mark >= 0) y.mark += dt;
  if (y.swing >= 0) y.swing += dt;
  if (!y.moving) return false;
  const P = y.path, n = P.length / 2;
  let left = (y.run ? YOU_RUN : YOU_WALK) * dt;
  y.phase += left * FRAMES_PER_TILE * (y.run ? 0.75 : 1); // (a jog's longer stride)
  while (left > 0 && y.seg < n) {
    const bx = P[y.seg * 2]!, by = P[y.seg * 2 + 1]!, dx = bx - y.x, dy = by - y.y, L = Math.hypot(dx, dy);
    if (L > 1e-6) y.face = facing(dx, dy);
    if (L <= left) { y.x = bx; y.y = by; left -= L; y.seg++; continue; }
    y.x += dx / L * left; y.y += dy / L * left; left = 0;
  }
  if (y.skip && remaining(y) <= SKIP_TILES) y.skip = false;
  if (y.seg >= n) { y.moving = false; y.run = false; y.path.length = 0; y.seg = 0; y.skip = false; return true; }
  return false;
}

/** the tile direction (unit) of a screen direction (kx right, ky down; the iso map's screen x is (x - y) * 64, y (x + y) * 32), into out */
export function keyDir(kx: number, ky: number, out: [number, number]): [number, number] {
  const a = kx / 64, b = ky / 32, dx = (a + b) / 2, dy = (b - a) / 2, L = Math.hypot(dx, dy);
  out[0] = L > 0 ? dx / L : 0; out[1] = L > 0 ? dy / L : 0; return out;
}
const KD: [number, number] = [0, 0];
/** one frame of walking with the keys (kx, ky: -1, 0 or 1 on the screen's axes; run: Shift held): you go that way unless ok(x, y) says the
 *  spot is blocked, then slide along it (each tile axis alone). Any route stops. True when you moved */
export function keyStep(y: You, kx: number, ky: number, run: boolean, dt: number, ok: (x: number, y: number) => boolean): boolean {
  if (!kx && !ky) { if (y.keys) { y.keys = false; } return false; }
  if (y.moving) stopWalk(y);
  y.keys = true; y.swing = -1;
  keyDir(kx, ky, KD);
  const s = (run ? YOU_RUN : YOU_WALK) * dt, dx = KD[0] * s, dy = KD[1] * s;
  y.face = facing(KD[0], KD[1]);
  let moved = false;
  if (ok(y.x + dx, y.y + dy)) { y.x += dx; y.y += dy; moved = true; }
  else if (dx && ok(y.x + dx, y.y)) { y.x += dx; moved = true; }
  else if (dy && ok(y.x, y.y + dy)) { y.y += dy; moved = true; }
  if (moved) y.phase += s * FRAMES_PER_TILE * (run ? 0.75 : 1);
  return moved;
}

/** the clip frame to draw (k frames into the golfer sheets' row: idle 0, walk 1..8, the drive 9..20): the walk while moving, the drive's
 *  frames while swinging at a mat (a swing every SWING_EVERY s), else idle */
export const SWING_EVERY = 4;
export function youFrame(y: You, walk: { start: number; n: number }, idle: number, drive: { start: number; n: number; times: readonly number[] } | null): number {
  if (y.moving || y.keys) return walk.start + (Math.floor(y.phase) % walk.n + walk.n) % walk.n;
  if (drive && y.swing >= 0) {
    const t = y.swing % SWING_EVERY, T = drive.times; let k = 0;
    while (k + 1 < drive.n && T[k + 1]! <= t) k++;
    return t > T[drive.n - 1]! + 0.6 ? idle : drive.start + k;
  }
  return idle;
}

/** where you walk to use a building (its box x0 y0 x1 y1, tiles): its door, the middle of the side facing the nearest road (roadAt says how far
 *  a road is from a point, Infinity: none near), 1.2 tiles out; on a tie the side nearest you. Only a side you can stand on (ok) */
export function doorOf(box: readonly [number, number, number, number], from: Pt, ok: (x: number, y: number) => boolean, roadAt: (x: number, y: number, ux: number, uy: number) => number): Pt | null {
  const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, o = 1.2;
  const sides: [number, number, number, number][] = [[cx, y1 + o, 0, 1], [x1 + o, cy, 1, 0], [cx, y0 - o, 0, -1], [x0 - o, cy, -1, 0]];
  let best: Pt | null = null, bs = Infinity;
  for (const [x, y, ux, uy] of sides) {
    if (!ok(x, y)) continue;
    const s = Math.min(40, roadAt(x, y, ux, uy)) * 10 + Math.hypot(x - from.x, y - from.y) * 0.01;
    if (s < bs) { bs = s; best = { x, y }; }
  }
  return best;
}
/** where you stop to talk to a person at p: TALK_REACH short of them on the way from `from` */
export function talkSpot(p: Pt, from: Pt): Pt {
  const dx = from.x - p.x, dy = from.y - p.y, L = Math.hypot(dx, dy);
  return L <= TALK_REACH ? { x: from.x, y: from.y } : { x: p.x + dx / L * TALK_REACH, y: p.y + dy / L * TALK_REACH };
}

/** the saved character (golf/player.ts PlayerProfile.you): where you stand, your facing, and your look (an index into the golfer art) */
export interface YouSave { x: number; y: number; f: number; look: number }
export function normalizeYou(x: unknown): YouSave | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<YouSave>, n = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (!n(o.x) || !n(o.y)) return undefined;
  return { x: o.x!, y: o.y!, f: n(o.f) ? ((Math.round(o.f!) % 8) + 8) % 8 : 0, look: n(o.look) ? Math.max(0, Math.round(o.look!)) : 0 };
}
/** the looks the "Who are you?" card offers: the golfer art (ids), each a man's or a woman's (the ids carry _w for the women) */
export const lookSex = (id: string): 'm' | 'w' => /_w\d/.test(id) ? 'w' : 'm';
/** a stand-in's label (docs/AGENT-BRIEF.md: stand-ins are labelled "Stand In for <name>") */
export const standInText = (name: string): string => `Stand In for ${name || 'you'}`;
