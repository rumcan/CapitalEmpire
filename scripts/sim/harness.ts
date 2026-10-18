// The shared harness of the headless gates (town-gate.ts, fix-gate.ts): the valley and its highway, the city stepped one sim second at a time
// with the town's grow legs applied as the engine does, and the player's bridge (the land-locked rule). Pure node, no DOM.
import { reachableSegs } from '../../src/game/lots/roads';
import { LV } from '../../src/game/lots/town';
import { City } from '../../src/game/city';
import { CLASS, RoadNetwork, SK, type Leg, type Node, type Pt, type Seg } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { highwayRoute, splitByTerrain } from '../../src/game/structures';
import { classAt, generateTerrain } from '../../src/game/terrain';
import { TC, type Terrain } from '../../src/game/terrain/types';
import { MAP } from '../../src/game/iso';

// the network builds Path2D outlines for the painters; in Node a stub that ignores them is enough
(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

/** game hour and day in sim s (one call = one sim second) */
export const HOUR = 60, DAY = 1440;
/** the player's bridge: the street's corridor half width, the land the far bank gives (tiles), the longest leg, the water part at most,
 *  the verge gap kept from other roads, the map margin (tiles) */
const BRIDGE_HW = CLASS.street.h + CLASS.street.walk, BRIDGE_LAND = 40, BRIDGE_MAX = 260, BRIDGE_WATER = 150, BRIDGE_VERGE = 6, BRIDGE_MARGIN = 16;
/** the four axis directions */
export const AXES: Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

/** the valley and its city, and the state the steps keep: the planner's growStats at each game hour's end, the player's last bridge (its second),
 *  the bridges built, the gravel legs laid, the last City.step's time (ms) */
export interface Harness { t: Terrain; city: City; editor: NetEditor; entry: Pt; cls: (x: number, y: number) => number; growHist: { none: number; legs: number }[]; lastBridge: number; bridges: number; gravelLegs: number; stepMs: number }
/** what City.step returns */
export type StepResult = ReturnType<City['step']>;
/** the caller's records: before the grow legs (the step's events), after them (per second, then the game hour's close comes before the bridge rule) */
export interface StepHooks { before?: (r: StepResult, s: number) => void; after?: (s: number) => void }
/** a bridge: the start A (a node of a reachable ground road), the axis u, the length L and the water part W (tiles), the start's distance d to the built centre */
export interface Bridge { a: Pt; u: Pt; L: number; W: number; d: number }

/** the valley and the city: the highway only (no starter town), from the map edge into the start block centre */
export function setup(seed: number): Harness {
  const t = generateTerrain(seed);
  const city = new City(1);
  const editor = new NetEditor(new RoadNetwork());
  editor.net.paintData = false;
  const hw = CLASS.road.h + CLASS.road.walk, cls = (x: number, y: number) => classAt(t, x, y);
  const startC: Pt = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 };
  const hy = t.highway;
  const entry: Pt = hy.x >= 0 ? { x: hy.x, y: hy.y } : startC;
  if (hy.x >= 0) {
    const pts = highwayRoute(hy, startC, hw, cls), legs0: Leg[] = [];
    for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1]!, b: pts[i]! });
    const { legs, kinds } = splitByTerrain(legs0, hw, cls);
    editor.addLegs(legs, CLASS.road, 0, kinds);
  } else console.log('[town] no highway on this valley: nothing can reach the lots');
  city.terrain(t.cls, entry, seed);
  city.netOps(editor.commit(true));
  return { t, city, editor, entry, cls, growHist: [], lastBridge: -Infinity, bridges: 0, gravelLegs: 0, stepMs: 0 };
}

/** the town's grow legs (gravel), applied with the editor and fed to the city as net ops */
export function growLegs(h: Harness, legs: Leg[]) { h.editor.addLegs(legs, CLASS.gravel, 2); h.city.netOps(h.editor.commit()); }

/** one sim second s (from 1): City.step(10) (its time in h.stepMs), the caller's `before`, the grow legs, the caller's `after`, and at each game
 *  hour's end the land-locked bridge rule (at most once per 2 game days); returns the step result (its events array is reused) */
export function stepSecond(h: Harness, s: number, hooks?: StepHooks): StepResult {
  const t0 = performance.now();
  const r = h.city.step(10);
  h.stepMs = performance.now() - t0;
  hooks?.before?.(r, s);
  if (r.grow) { h.gravelLegs += r.grow.length; growLegs(h, r.grow); }
  hooks?.after?.(s);
  if (s % HOUR === 0) {
    h.growHist.push({ none: h.city.growStats.none, legs: h.city.growStats.legs });
    const b = landLocked(h) && s - h.lastBridge >= 2 * DAY ? findBridge(h) : null;
    if (b) {
      buildBridge(h, b); h.lastBridge = s; h.bridges++;
      console.log(`day ${Math.floor((s - 1) / DAY) + 1}: player bridge from (${b.a.x.toFixed(0)}, ${b.a.y.toFixed(0)}) length ${b.L.toFixed(0)}, water ${b.W}`);
    }
  }
  return r;
}

/** the distance from p to the centre line of a seg */
function segDist(p: Pt, s: Seg): number {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L2 = dx * dx + dy * dy;
  let k = L2 > 0 ? ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / L2 : 0; k = k < 0 ? 0 : k > 1 ? 1 : k;
  return Math.hypot(s.a.x + dx * k - p.x, s.a.y + dy * k - p.y);
}
/** the built centre: the mean of the built lots (the entry while none is built), as the town planner's */
function builtCentre(h: Harness): Pt {
  let sx = 0, sy = 0, m = 0;
  for (const s of h.city.town.states.values()) if (s.level >= LV.BUILT) { const l = h.city.lots.lots.get(s.key); if (l) { sx += l.c.x; sy += l.c.y; m++; } }
  return m ? { x: sx / m, y: sy / m } : h.entry;
}
/** the leg from node n along u, if it is a bridge: no hill on the centre line, the margin kept, water (WATER) crossed in at most BRIDGE_WATER
 *  tiles, then BRIDGE_LAND tiles of GROUND or PATCH beyond the far bank (the leg stops there), and the land parts keep BRIDGE_VERGE
 *  clear of other roads' verges (the start excepted) */
function bridgeAlong(h: Harness, n: Node, u: Pt, cen: Pt): Bridge | null {
  const A = { x: n.x, y: n.y };
  let first = -1, last = -1, run = 0, end = -1;
  for (let i = 0; i < BRIDGE_MAX && end < 0; i++) {
    const tx = Math.floor(A.x + u.x * (i + 0.5)), ty = Math.floor(A.y + u.y * (i + 0.5));
    if (tx < BRIDGE_MARGIN || ty < BRIDGE_MARGIN || tx >= MAP - BRIDGE_MARGIN || ty >= MAP - BRIDGE_MARGIN) return null;
    const c = h.cls(tx, ty);
    if (c === TC.HILL) return null;
    if (c === TC.WATER) { if (first < 0) first = i; last = i; run = 0; }
    else if (c === TC.GROUND || c === TC.PATCH) { if (first >= 0 && ++run >= BRIDGE_LAND) end = i + 1; }
    else if (first >= 0) run = 0;
  }
  if (first < 0 || end < 0 || last + 1 - first > BRIDGE_WATER) return null;
  const L = end, W = last + 1 - first, E = { x: A.x + u.x * L, y: A.y + u.y * L };
  for (const s of h.city.net.segsNear({ x: (A.x + E.x) / 2, y: (A.y + E.y) / 2 }, L / 2 + 40)) {
    const need = BRIDGE_HW + s.cls.h + s.cls.walk + BRIDGE_VERGE, adj = s.a === n || s.b === n;
    for (let k = 0; k <= 2 * L; k++) {
      const t = k / 2;
      if (t >= first && t < last + 1) continue;
      if (adj && t < need) continue;
      if (segDist({ x: A.x + u.x * t, y: A.y + u.y * t }, s) < need) return null;
    }
  }
  return { a: A, u, L, W, d: Math.hypot(A.x - cen.x, A.y - cen.y) };
}
/** the player's bridge: over all dead ends and nodes of 1-3 arms on a reachable ground road, the four axis directions with no arm;
 *  the shortest water crossing first, then the start nearest the built centre; null when none fits */
function findBridge(h: Harness): Bridge | null {
  const reach = reachableSegs(h.city.net, h.entry), cen = builtCentre(h);
  let best: Bridge | null = null;
  for (const n of h.city.net.nodes.values()) {
    if (n.segs.length > 3 || !n.segs.some(s => s.kind === SK.GROUND && reach.has(s))) continue;
    for (const u of AXES) {
      if (n.segs.some(s => { const o = s.a === n ? s.b : s.a, vx = o.x - n.x, vy = o.y - n.y, l = Math.hypot(vx, vy); return l > 0 && vx * u.x + vy * u.y > 0.98 * l; })) continue;
      const b = bridgeAlong(h, n, u, cen);
      if (b && (!best || b.W < best.W || (b.W === best.W && b.d < best.d))) best = b;
    }
  }
  return best;
}
/** the bridge as the engine's road tool: the street's leg split by terrain (the water parts become bridges), applied and fed to the city */
export function buildBridge(h: Harness, b: Bridge) {
  const legs0: Leg[] = [{ a: b.a, b: { x: b.a.x + b.u.x * b.L, y: b.a.y + b.u.y * b.L } }];
  const { legs, kinds } = splitByTerrain(legs0, BRIDGE_HW, h.cls);
  h.editor.addLegs(legs, CLASS.street, 0, kinds);
  h.city.netOps(h.editor.commit());
}
/** land-locked: the planner found no land (growStats.none rose) in each of the last 3 game hours, and proposed no leg in them */
function landLocked(h: Harness): boolean {
  const g = h.growHist, n = g.length;
  if (n < 4) return false;
  for (let k = 1; k <= 3; k++) { const a = g[n - k]!, b = g[n - k - 1]!; if (a.none <= b.none || a.legs !== b.legs) return false; }
  return true;
}
