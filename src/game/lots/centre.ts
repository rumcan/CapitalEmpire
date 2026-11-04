// T298 (#883; the owner, 2026-11-02: "build small shopping center with multiple commercial stores circling a nice parking lot with lights and islands
// with plants etc."): a small shopping centre laid in the lot's own preset frame (x along the street 0..W, y away from it 0..D; autolot.ts fills a Lay
// with it), so it lies along its street at any angle as every generated lot does. From the street back:
//   - a planted strip along the street (grass, shrubs, a tree at each end) with the one entrance through it, a street lamp either side of it on the verge;
//   - the car park: one asphalt patch (its painted bay lines on it) with two rows of bays on one aisle on a deep lot, one row on a shallow one; the rows
//     broken by kerbed islands (a kerb of slabs round grass) at their ends, beside the entrance and every MAXRUN bays, each island planted (a tree, shrubs)
//     and the end and entrance ones lit (a lamp post at the aisle end); cars in some bays (centre's car model, nosed in), wheel stops at the bays' backs;
//   - a footpath of slabs along the shop fronts, benches and bins on it between the shops;
//   - the back row of shops (the centre's businesses, fitted to one depth so they read as one terrace, their fronts on one line, facing the street) and on a
//     wide lot one or two side wings (an L or a U: a shop at the car park's side, its front turned to face across it, its own footpath), so the shops
//     stand round the car park; the service yard behind with a dumpster.
// The car park polygon is notched round its islands (a car park is drawn after the lot's other ground, renderer.ts drawLots(parks), so an island under it
// would be hidden). Pure: no DOM; the library through the Lay's footprints only.
import type { Box4 } from './compose-core';
import type { Half } from './house-class';
import type { PresetFrame } from './preset-frame';
import type { PresetPatch, PresetProp, Road, View } from './presets';
import { bayDims, bayRow, carBody, type BayDims } from './carpark-lot';
import { roadView, turned } from './preset-art';
import { wingsOf } from './centre-biz';

/** what a centre needs of autolot's Lay (the lot's frame, size and road, its props, boxes and patches, its draws and the composer's fit and overlap rule) */
export interface CentreLay {
  readonly f: PresetFrame; readonly W: number; readonly D: number; readonly road: Road;
  readonly props: PresetProp[]; readonly boxes: Box4[]; readonly patches: PresetPatch[];
  r(): number;
  half(q: PresetProp): Half;
  boxOf(q: PresetProp): Box4;
  add(q: PresetProp): boolean;
  fit(id: string, view: View, cx: number, cy: number, ha: number, hb: number, least?: number): PresetProp | null;
}
/** the pictures a centre is planted and furnished from: the trees (the owner's real trees), the shrubs, and whether a shop may stand here (not removed,
 *  of the lot's tier) */
export interface CentreKit { trees: readonly string[]; shrubs: readonly string[]; ok: (id: string) => boolean }
/** a laid centre: its layout, the shops (prop indices: the back row, then the wings), the car park's box, the entrance, the islands, the bays (each
 *  [x0, y0, x1, y1]), the lamp posts (prop indices), the parked cars (prop indices) */
export interface CentrePlan {
  layout: 'row' | 'L' | 'U'; rows: 1 | 2; shops: number[]; wings: number[]; park: Box4; entrance: Box4; islands: Box4[]; bays: Box4[]; lamps: number[]; cars: number[];
}

/** (tiles) the side margin, the planted strip along the street, the footpath along the shop fronts and the service yard behind the shops (each at most,
 *  and the least a shallow lot cuts it to: the town's lots on a closed block are 10 or 11 tiles deep), the footpath along a wing, the aisle (5.6 m) */
const EDGE = 0.4, STRIP = 1.6, STRIP0 = 0.8, STRIP1 = 2.6, PATH = 1.5, PATH0 = 1.1, BACK = 1.2, BACK0 = 0.4, WPATH = 1.3, CAISLE = 2.8;
/** an island's least width, the most bays in a run between two islands, the entrance's width, an island's kerb */
const ISL = 1.5, MAXRUN = 7, ENTRY = 3.4, KERB = 0.2;
/** the depth the shops are fitted to (one terrace: the deeper ones a little smaller), the least depth a shop takes, the least scale, a wing's depth */
const SHOP_D = 4.6, SHOP_MIN = 3.0, SHOP_ROWS2 = 4.0, LEAST = 0.65, WING_D = 4.8;
/** the gap between two shops of the back row: at least, at most */
const GAP0 = 0.2, GAP1 = 1.2;
const LAMP = 'world:streetlamp', STOP = 'expansion:wheel-stop', BENCH = 'world:bench', BIN = 'world:trashcan', DUMPSTER = 'town:dumpster';

/** whether a shop's picture faces a frame direction on the road: view 0 the street, 1 +x, 3 -x (a screen-straight road: its screen-axis set has that
 *  view; any other road: its four views turn) */
function facesView(id: string, road: Road, view: View): boolean {
  return road % 2 ? roadView(id, road, view) !== null : turned(id, 1).id !== id;
}

/** a row's run from a to b cut into islands and bays: islands at both ends and between runs of MAXRUN bays at most, the slack shared by the end
 *  islands; the whole run an island when fewer than two bays fit */
function runs(a: number, b: number, bw: number): { isl: [number, number][]; bays: [number, number][] } {
  const len = b - a;
  let k = Math.floor((len - 2 * ISL) / bw + 1e-9);
  if (k < 2) return { isl: len > 0.4 ? [[a, b]] : [], bays: [] };
  const m = Math.ceil(k / MAXRUN);
  k = Math.floor((len - (m + 1) * ISL) / bw + 1e-9);
  if (k < 2) return { isl: [[a, b]], bays: [] };
  const extra = len - (m + 1) * ISL - k * bw, isl: [number, number][] = [], bays: [number, number][] = [];
  let x = a + ISL + extra / 2;
  isl.push([a, x]);
  for (let j = 0; j < m; j++) {
    const n = Math.floor(k / m) + (j < k % m ? 1 : 0);
    bays.push([x, n]); x += n * bw;
    const e = j === m - 1 ? b : x + ISL;
    isl.push([x, e]); x = e;
  }
  return { isl, bays };
}

/** a polygon with its collinear points (straight-through or doubling back) and repeats taken out, so a notch at a corner leaves no spike */
function clean(p: number[]): number[] {
  let q = p.slice(), changed = true;
  while (changed && q.length > 6) {
    changed = false;
    const n = q.length / 2;
    for (let i = 0; i < n; i++) {
      const a = (i + n - 1) % n, c = (i + 1) % n;
      const ax = q[2 * a]! - q[2 * i]!, ay = q[2 * a + 1]! - q[2 * i + 1]!, cx = q[2 * c]! - q[2 * i]!, cy = q[2 * c + 1]! - q[2 * i + 1]!;
      if (Math.abs(ax * cy - ay * cx) < 1e-6) { q.splice(2 * i, 2); changed = true; break; }
    }
  }
  return q.map(v => +v.toFixed(3));
}
const quad = (x0: number, y0: number, x1: number, y1: number): number[] => [x0, y0, x1, y0, x1, y1, x0, y1].map(v => +v.toFixed(3));

/** a shopping centre in the Lay for its shops (in order: the back row's, then the wings'; ids the kit allows, each at most once); null when the lot is too
 *  shallow or narrow for a car park and two shops (the caller lays a small shop instead) */
export function centreLot(L: CentreLay, shops: readonly string[], kit: CentreKit, seed: number): CentrePlan | null {
  const { W, D, f, road } = L;
  const dims = bayDims(f, seed);
  if (!dims) return null;
  const { bl } = dims;
  // the rows: two on one aisle when the lot is deep enough for them, the strip, path and yard at full depth and shops of SHOP_ROWS2; else one (its aisle along
  // the strip). The depth left after the aisle and the bays goes to the shops first (SHOP_MIN to SHOP_D), then to the strip, the footpath and the yard
  // (each from its least to its most), what is left over to the strip (up to STRIP1) and then the yard
  const fixed = (rows: number) => CAISLE + rows * bl;
  const rows: 1 | 2 = D - fixed(2) - (STRIP + PATH + BACK) >= SHOP_ROWS2 ? 2 : 1;
  const depth = Math.min(SHOP_D, D - fixed(rows) - (STRIP0 + PATH0 + BACK0));
  if (depth < SHOP_MIN - 1e-9 || W < 16) return null;
  let sp = D - fixed(rows) - depth;
  const strip0 = Math.min(STRIP, sp - PATH0 - BACK0), path = Math.min(PATH, sp - strip0 - BACK0);
  sp -= strip0 + path;
  const strip = strip0 + Math.max(0, Math.min(STRIP1 - strip0, sp - BACK)), back = sp - (strip - strip0);
  const pa = strip, ya = rows === 2 ? pa + bl : pa, yb = ya + CAISLE, yP = yb + bl, yS = yP + path;
  const used = new Set<string>(), list = shops.filter(id => kit.ok(id) && !used.has(id) && (used.add(id), true));
  // ---- the wings: the last shops of the list (an L's on a seeded side), each turned to face across the car park, at the back of the strip
  const nw = wingsOf(W), sides: (0 | 1)[] = nw === 2 ? [0, 1] : nw === 1 ? [L.r() < 0.5 ? 0 : 1] : [];
  // (the back row keeps three shops before a wing takes one: on a screen-straight street only the shops with a screen-axis set face it)
  const wingIds = list.slice(Math.max(3, list.length - sides.length));
  const backIds = list.filter(id => !wingIds.includes(id));
  const placed = new Set<string>();
  // ---- the back row: fitted to one depth, fronts on y = yS, side by side across the lot, centred
  const row: PresetProp[] = [];
  let tot = 0;
  for (const id of backIds) {
    const q = L.fit(id, 0, 0, 0, (W - 2 * EDGE) / 2, depth / 2, LEAST); if (!q) continue;
    const h = L.half(q), need = tot + (row.length ? GAP0 : 0) + 2 * h.ha;
    if (need > W - 2 * EDGE + 1e-9) continue;
    row.push(q); tot = need;
  }
  if (row.length < 2) return null;
  const gap = Math.min(GAP1, row.length > 1 ? (W - 2 * EDGE - tot) / (row.length - 1) + GAP0 : 0);
  let span = 0; row.forEach((q, i) => { span += 2 * L.half(q).ha + (i ? gap : 0); });
  let x = (W - span) / 2;
  const rx0 = x, rx1 = x + span;
  const plan: CentrePlan = { layout: 'row', rows, shops: [], wings: [], park: [0, 0, 0, 0], entrance: [0, 0, 0, 0], islands: [], bays: [], lamps: [], cars: [] };
  const seams: number[] = [];
  for (const q of row) {
    const h = L.half(q), p = { ...q, x: +(x + h.ha).toFixed(3), y: +(yS + h.hb).toFixed(3) };
    if (L.add(p)) { plan.shops.push(L.props.length - 1); placed.add(q.id); }
    x += 2 * h.ha + gap; seams.push(x - gap / 2);
  }
  seams.pop();
  // ---- the wings (a side's picture: view 1 faces +x from the left side, view 3 faces -x from the right), their footpaths; the car park between them
  let cx0 = EDGE, cx1 = W - EDGE;
  const wingBoxes: Box4[] = [];
  for (const side of sides) {
    const view: View = side === 0 ? 1 : 3, tries = [...wingIds, ...backIds].filter(id => !placed.has(id) && facesView(id, road, view));
    for (const id of tries) {
      const q = L.fit(id, view, 0, 0, WING_D / 2, (yP - pa - 0.2) / 2, LEAST); if (!q) continue;
      const h = L.half(q), wx = side === 0 ? EDGE + h.ha : W - EDGE - h.ha, p = { ...q, x: +wx.toFixed(3), y: +(yP - 0.1 - h.hb).toFixed(3) };
      if (!L.add(p)) continue;
      plan.wings.push(L.props.length - 1); placed.add(id);
      const wb: Box4 = side === 0 ? [EDGE, pa, EDGE + 2 * h.ha, yP] : [W - EDGE - 2 * h.ha, pa, W - EDGE, yP];
      wingBoxes.push(wb);
      if (side === 0) cx0 = wb[2] + WPATH; else cx1 = wb[0] - WPATH;
      break;
    }
  }
  plan.layout = plan.wings.length === 2 ? 'U' : plan.wings.length === 1 ? 'L' : 'row';
  if (cx1 - cx0 < 3 * ISL + 4 * dims.bw) return null;
  // ---- the car park: the entrance at its middle, the rows cut into runs of bays and islands
  const ex0 = (cx0 + cx1) / 2 - ENTRY / 2, ex1 = ex0 + ENTRY;
  plan.entrance = [ex0, 0, ex1, ya]; plan.park = [cx0, pa, cx1, yP];
  const rear = runs(cx0, cx1, dims.bw);
  const front = rows === 2 ? [runs(cx0, ex0, dims.bw), runs(ex1, cx1, dims.bw)] : [];
  const fill = 0.5 + 0.3 * L.r(), lines: number[] = [], isles: { b: Box4; aisle: number; lit: boolean }[] = [];
  /** a run's bays into the plan: its cars (the bodies' boxes in the overlap rule) and its wheel stops (on the map-axis streets only: the stop's picture
   *  lies along a world axis, T296 adds the other headings) */
  const lay = (x0: number, k: number, yA: number, dir: 1 | -1, s: number) => {
    const r = bayRow(f, dims, x0, k, yA, dir, fill, s);
    lines.push(...r.lines); plan.bays.push(...r.bays);
    if (road % 2 === 0) for (const p of r.stops) { const q = L.fit(STOP, 0, p.x, p.y, dims.bw / 2 - 0.02, 0.2, 0.7); if (q) { L.props.push(q); L.boxes.push(L.boxOf(q)); } }
    for (const c of r.cars) { const b = carBody(c.id); L.props.push(c); L.boxes.push([c.x - b.wid / 2, c.y - b.len / 2, c.x + b.wid / 2, c.y + b.len / 2]); plan.cars.push(L.props.length - 1); }
  };
  rear.bays.forEach(([x0, k], j) => lay(x0, k, yb, 1, seed + 17 * j));
  rear.isl.forEach(([a, b], j) => isles.push({ b: [a, yb, b, yP], aisle: yb, lit: j === 0 || j === rear.isl.length - 1 }));
  front.forEach((fr, side) => {
    fr.bays.forEach(([x0, k], j) => lay(x0, k, ya, -1, seed + 101 + 31 * side + 17 * j));
    // (lit: the islands at the car park's ends and the two beside the entrance)
    fr.isl.forEach(([a, b], j) => isles.push({ b: [a, pa, b, ya], aisle: ya, lit: j === 0 || j === fr.isl.length - 1 }));
  });
  // the car park's asphalt: one polygon round the rows and the aisle, notched round the islands, with the entrance's mouth out to the street
  const P: number[] = [], pt = (px: number, py: number) => P.push(px, py);
  pt(cx0, pa);
  const fx = isles.filter(i => i.b[1] === pa).map(i => i.b).sort((a, b) => a[0] - b[0]);
  const feats = [...fx.map(b => ({ a: b[0], b: b[2], notch: true })), { a: ex0, b: ex1, notch: false }].sort((p, q) => p.a - q.a);
  for (const t of feats) { const y = t.notch ? ya : 0; pt(t.a, pa); pt(t.a, y); pt(t.b, y); pt(t.b, pa); }
  pt(cx1, pa); pt(cx1, yP);
  for (const b of isles.filter(i => i.b[3] === yP).map(i => i.b).sort((a, b) => b[0] - a[0])) { pt(b[2], yP); pt(b[2], yb); pt(b[0], yb); pt(b[0], yP); }
  pt(cx0, yP);
  L.patches.push({ kind: 'lot', tex: 'asphalt', pts: clean(P), lines: lines.map(v => +v.toFixed(3)) });
  // ---- the islands: a kerb of slabs round grass; a tree, shrubs, and on the lit ones a lamp post at the aisle end
  for (const is of isles) {
    const [a, b, c, d] = is.b;
    if (c - a < 0.6 || d - b < 0.6) continue;
    plan.islands.push(is.b);
    L.patches.push({ kind: 'walk', tex: 'slabs', pts: quad(a, b, c, b + KERB) }, { kind: 'walk', tex: 'slabs', pts: quad(a, d - KERB, c, d) },
      { kind: 'walk', tex: 'slabs', pts: quad(a, b + KERB, a + KERB, d - KERB) }, { kind: 'walk', tex: 'slabs', pts: quad(c - KERB, b + KERB, c, d - KERB) },
      { kind: 'yard', tex: 'grass', pts: quad(a + KERB, b + KERB, c - KERB, d - KERB) });
    const mx = (a + c) / 2, toward = is.aisle === b ? 1 : -1, near = is.aisle + toward * 0.45, far = is.aisle + toward * (d - b - 0.75);
    if (is.lit) { const q = L.fit(LAMP, 0, mx, near, 0.4, 0.4); if (q && L.add(q)) plan.lamps.push(L.props.length - 1); }
    tree(L, kit, mx, is.lit ? far : (b + d) / 2, (c - a) / 2 - KERB, (d - b) / 2 - KERB);
    for (const sx of [a + 0.45, c - 0.45]) shrub(L, kit, sx, is.lit ? (near + far) / 2 : far, 0.4);
  }
  // ---- the strip along the street: grass either side of the entrance, shrubs along it, a tree at each end; the street lamps either side of the mouth
  L.patches.push({ kind: 'yard', tex: 'grass', pts: quad(0, 0, ex0, pa) }, { kind: 'yard', tex: 'grass', pts: quad(ex1, 0, W, pa) });
  for (const lx of [ex0 - 0.9, ex1 + 0.9]) { const q = L.fit(LAMP, 0, lx, -0.4, 0.4, 0.4); if (q && L.add(q)) plan.lamps.push(L.props.length - 1); }
  tree(L, kit, 1.1, pa / 2, 0.9, pa / 2);
  tree(L, kit, W - 1.1, pa / 2, 0.9, pa / 2);
  for (let sx = 2.4; sx < W - 2; sx += 1.5) if (sx < ex0 - 0.6 || sx > ex1 + 0.6) shrub(L, kit, sx, pa / 2, 0.55);
  // ---- the footpaths (slabs along the shop fronts, and along each wing's front), benches and bins at the seams between the shops
  L.patches.push({ kind: 'walk', tex: 'slabs', pts: quad(EDGE, yP, W - EDGE, yS) });
  for (const wb of wingBoxes) L.patches.push({ kind: 'walk', tex: 'slabs', pts: wb[0] === EDGE ? quad(wb[2], pa, wb[2] + WPATH, yP) : quad(wb[0] - WPATH, pa, wb[0], yP) }, { kind: 'yard', tex: 'concrete', pts: quad(wb[0], pa, wb[2], yP) });
  seams.forEach((sx, i) => { const q = L.fit(i % 2 ? BIN : BENCH, 0, sx, yP + path / 2, 0.6, Math.min(0.35, path / 2 - 0.1), 0.5); if (q) L.add(q); });
  // ---- the service yard behind the shops (concrete under the row and behind it), its dumpster; trees on the grass either side of a short row
  const sx0 = Math.max(EDGE, rx0 - 0.4), sx1 = Math.min(W - EDGE, rx1 + 0.4);
  L.patches.push({ kind: 'yard', tex: 'concrete', pts: quad(sx0, yS, sx1, D) });
  if (back >= 0.8) { const q = L.fit(DUMPSTER, 0, sx1 - 1.2, D - back / 2, 1.0, back / 2, 0.5); if (q) L.add(q); }
  for (const [a, b] of [[EDGE, sx0], [sx1, W - EDGE]] as const) for (let tx = a + 1.4; tx <= b - 1.4; tx += 3) tree(L, kit, tx, (yS + D) / 2, 1.3, (D - yS) / 2 - 0.2);
  return plan;
}

/** a tree in a spot (half extents ha, hb about its centre), from the kit's trees by a draw, the largest scale that fits (never under 0.4) */
function tree(L: CentreLay, kit: CentreKit, x: number, y: number, ha: number, hb: number): boolean {
  const n = kit.trees.length; if (!n || ha < 0.3 || hb < 0.3) return false;
  const at = Math.floor(L.r() * n);
  for (let t = 0; t < Math.min(n, 8); t++) { const q = L.fit(kit.trees[(at + t) % n]!, 0, x, y, ha, hb, 0.4); if (q && L.add({ ...q, scale: Math.min(q.scale, 0.75) })) return true; }
  return false;
}
/** a shrub at (x, y) fitted to half extent h (never under 0.3) */
function shrub(L: CentreLay, kit: CentreKit, x: number, y: number, h: number): boolean {
  const n = kit.shrubs.length; if (!n) return false;
  const q = L.fit(kit.shrubs[Math.floor(L.r() * n)]!, 0, x, y, h, h, 0.3);
  return !!q && L.add(q);
}

/** the bay size a centre's car park takes in a frame (re-exported for the tests) */
export const centreBays = (f: PresetFrame, seed: number): BayDims | null => bayDims(f, seed);
