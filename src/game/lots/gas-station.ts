// T198 (#510; the owner, 2026-10-27: "gas station preset is broken"): the gas station lots, and the rules every generated lot keeps.
// The tour group's gas stations are frozen presets (T063's old composer: the canopy its only building, an ice freezer, hvac, cabinet and
// dumpster stacked beside it, a car park's bays at the back); T169/T171 then took the canopy for the lot's main building and laid the yard's
// props round it, on the open paving. A gas station now composes as one: the canopy over its pumps at the front by the street on a clear
// forecourt (a drive patch: no item lands on it), the gas shop behind it (or beside it on a shallow lot) as the lot's main building, a row of
// bays along the shop's front with their wheel stops and cars in them, a walk at the shop's door with the bins and the ice freezer, and the
// dumpster, hvac and utility cabinet at the shop's back or side. Pure (no DOM): compose.ts groupBase draws it, the tests read it.
import type { Box } from './learn';
import type { PresetPatch, PresetProp } from './presets';
import type { Half } from './house-class';

/** the gas shop (the library's four-view art: the convenience store of a gas station) */
export const GAS_SHOP = 'variation:ref-building-gas-shop-3326e70f-plain:1';
/** the shops a gas station takes when the gas shop is gone (removed in the studio, or not in the build): small shops, nearest first */
export const GAS_SHOP_FALLBACK = ['world:snack_bar', 'town:bakery', 'town:barber', 'town:pharmacy'];
/** a gas canopy (its art, a variation, the east art or a view) */
export const isCanopy = (id: string) => /gas-canopy/.test(id);
/** an open structure (a canopy, carport, shelter, gazebo, pavilion, tent, payphone, stand or kiosk): never a lot's main building (T198) */
const OPEN = /gas-canopy|carport|bus_stop|shelter|gazebo|pergola|pavilion|(^|[-_:])tent($|[-_:])|food-tent|phone_booth|produce_stand|parking-kiosk|parking-entry/;
export const isOpenStructure = (id: string) => OPEN.test(id);

/** the bay pitch and depth (compose-core BAY, BAY_DEPTH), the wheel stop and where it stands (in from the bay's end) */
export const BAY_W = 2, BAY_D = 2.75, WHEEL_STOP = 'expansion:wheel-stop', STOP_IN = 0.35;
/** the sidewalk strip along the street (the frozen presets' slabs), the side and back fence inset, the cars' gap in from the sidewalk to the
 *  canopy, the lane round the canopy, the walk at the shop's door, the service strip behind the shop (tiles) */
const FRONT = 1.4, EDGE = 0.4, ENTRY = 1, LANE = 1, WALK = 1, SERVICE = 1.2, SIDE_COL = 1.4;
/** the width from which a gas station lays its shop beside the forecourt, not behind it (tiles) */
const SIDE_W = 13;
/** the service items at the shop's back or side, and the door items (by the door: the bins and the ice freezer) */
export const SERVICE_ITEMS = ['town:dumpster', 'expansion:hvac-unit', 'expansion:utility-cabinet'];
export const DOOR_ITEMS = ['expansion:ice-freezer', 'world:trashcan'];
/** the parked cars' art (nosed into a bay towards +y, the frozen presets' own) */
export const BAY_CARS = ['cars:navy-wood-panel-wagon:NE', 'cars:burgundy-wagon:NE'];

/** a gas station's plan (preset frame: x along the street 0..w, y from it 0..d): its props (the canopy, the shop, the bays' stops and cars, the
 *  service and door items), its patches, the shop's index (the main building), the forecourt and the bays */
export interface GasPlan { props: PresetProp[]; patches: PresetPatch[]; main: number; forecourt: Box; bays: Box[]; layout: 'stacked' | 'side' }

/** one tried layout's numbers (gasPlan) */
interface Try { cv: 0 | 1; side: boolean; walk: boolean; entry: number; lane: number }

/** a gas station's plan for a lot of w x d tiles: the canopy (the frozen preset's, its id and scale), the shop (the first of shops that fits),
 *  cars in a share `fill` of the bays (seeded); half: the frame's footprint half extents (house-class.ts frameHalf). Layouts tried in order, the first that
 *  fits taken: side by side on a lot SIDE_W wide or more (the forecourt on the drive side, on the other the bays off the sidewalk, the walk, the
 *  shop, the service strip behind it or at its side), stacked on a narrower one (the canopy across the forecourt, the bays, the walk, the shop at
 *  the back), each first with the walk and full lanes, then tighter; null when none fits (the lot keeps the generic generated yard) */
export function gasPlan(w: number, d: number, canopy: PresetProp, shops: readonly string[], half: (q: PresetProp) => Half, o: { fill: number; seed: number; driveLeft?: boolean }): GasPlan | null {
  // a lot wide enough lays the shop beside the forecourt (nothing stands behind the canopy, whose roof would hide it), a narrow one behind it
  const tries: Try[] = [];
  for (const side of w >= SIDE_W ? [true, false] : [false, true]) for (const [walk, entry, lane] of [[true, ENTRY, LANE], [false, 0.6, 0.8]] as const) tries.push({ cv: side ? 0 : 1, side, walk, entry, lane });
  for (const shop of shops) for (const t of tries) { const p = tryPlan(w, d, canopy, shop, half, t, o); if (p) return p; }
  return null;
}

function tryPlan(w: number, d: number, canopy: PresetProp, shop: string, half: (q: PresetProp) => Half, t: Try, o: { fill: number; seed: number; driveLeft?: boolean }): GasPlan | null {
  for (const back of [true, false]) { const p = tryAt(w, d, canopy, shop, half, t, o, back); if (p) return p; }
  return null;
}
/** one layout with the service strip behind the shop (back) or at its side */
function tryAt(w: number, d: number, canopy: PresetProp, shop: string, half: (q: PresetProp) => Half, t: Try, o: { fill: number; seed: number; driveLeft?: boolean }, back: boolean): GasPlan | null {
  const c0: PresetProp = { id: canopy.id, x: 0, y: 0, scale: canopy.scale, view: t.cv }, s0: PresetProp = { id: shop, x: 0, y: 0, scale: 1, view: 0 };
  const ch = half(c0), sh = half(s0), cw = 2 * ch.ha, cd = 2 * ch.hb, sw = 2 * sh.ha, sd = 2 * sh.hb;
  const walk = t.walk ? WALK : 0, left = o.driveLeft ?? false, col = back ? 0 : SIDE_COL;
  // the forecourt's x range, the shop's, and the side the service column takes (back: none)
  let fx0: number, fx1: number, sx0: number, svc: 1 | -1 = 1;
  if (!t.side) {
    fx0 = 0; fx1 = w; sx0 = (w - sw) / 2;
    // the service column at the shop's side: the shop moves over to leave it
    if (!back) { if (sx0 - EDGE < col) sx0 = EDGE + col; svc = -1; if (sx0 + sw > w - EDGE + 1e-9) return null; }
  } else {
    const fw = cw + 2 * t.lane;
    // the shop against the far side fence (its service column beside it there), the forecourt on the drive side
    if (left) { fx0 = 0; fx1 = fw; sx0 = w - EDGE - col - sw; svc = 1; if (sx0 < fx1 - 1e-9) return null; }
    else { fx0 = w - fw; fx1 = w; sx0 = EDGE + col; svc = -1; if (sx0 + sw > fx0 + 1e-9) return null; }
  }
  if (sx0 < EDGE - 1e-9) return null;
  const sx1 = sx0 + sw, scx = (sx0 + sx1) / 2;
  // the canopy: its front ENTRY past the sidewalk, across the forecourt's middle
  const cy0 = FRONT + t.entry, cy1 = cy0 + cd, fcx = (fx0 + fx1) / 2;
  if (fcx - ch.ha < EDGE - 1e-9 || fcx + ch.ha > w - EDGE + 1e-9 || cy1 + t.lane > d - EDGE) return null;
  // stacked: the shop at the back (the service strip behind it, or the column at its side), its walk and its bays before it; side by side: the
  // bays off the sidewalk, the walk, the shop, the service strip behind it (a main street's shop front: the yard behind stays the lot's ground)
  let sy0: number, sy1: number, by0: number;
  if (!t.side) { sy1 = back ? d - EDGE - SERVICE : d - EDGE; sy0 = sy1 - sd; by0 = sy0 - walk - BAY_D; }
  else { by0 = FRONT + 0.4; sy0 = by0 + BAY_D + walk; sy1 = sy0 + sd; if (sy1 + (back ? SERVICE : 0) > d - EDGE + 1e-9) return null; }
  const wy0 = sy0 - walk, by1 = wy0;
  // the forecourt ends behind the canopy's lane (stacked), or at the shop's back (side by side); the asphalt with it
  const fy1 = t.side ? Math.max(cy1 + t.lane, sy1 + (back ? SERVICE : 0)) : cy1 + t.lane, yd = t.side ? Math.min(d, fy1 + EDGE) : d;
  if (!t.side && by0 < fy1 - 1e-9) return null;
  if (by0 < FRONT - 1e-9) return null;
  // the bays: as many as the shop's front takes, centred on it, a bay's end left free at each side for the door items when there is no walk
  const nb = Math.floor((sw - (walk ? 0 : 1.6)) / BAY_W + 1e-9);
  if (nb < 2) return null;
  const bx0 = scx - (nb * BAY_W) / 2, bx1 = bx0 + nb * BAY_W;
  const props: PresetProp[] = [], patches: PresetPatch[] = [], bays: Box[] = [];
  const at = (id: string, x: number, y: number, view = 0, scale = 1) => { props.push({ id, x: +x.toFixed(3), y: +y.toFixed(3), scale, view: view as PresetProp['view'] }); return props.length - 1; };
  const quad = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1].map(v => +v.toFixed(3));
  patches.push({ kind: 'yard', tex: 'asphalt', pts: quad(0, 0, w, yd) }, { kind: 'yard', tex: 'slabs', pts: quad(0, 0, w, FRONT) });
  // the forecourt: a drive from the street (its mouth the whole forecourt), no item on it
  patches.push({ kind: 'drive', tex: 'asphalt', pts: quad(fx0, 0, fx1, fy1) });
  at(canopy.id, fcx, cy0 + cd / 2, t.cv, canopy.scale);
  const main = at(shop, scx, sy0 + sd / 2, 0);
  if (walk) patches.push({ kind: 'walk', tex: 'paving', pts: quad(sx0, wy0, sx1, sy0) });
  // the bays: their lines every BAY_W across the row, a wheel stop STOP_IN short of each bay's end by the shop, cars nosed in (seeded)
  const lines: number[] = [];
  for (let k = 0; k <= nb; k++) lines.push(+(bx0 + k * BAY_W).toFixed(3), +by1.toFixed(3), +(bx0 + k * BAY_W).toFixed(3), +by0.toFixed(3));
  patches.push({ kind: 'lot', tex: 'asphalt', pts: quad(bx0, by0, bx1, by1), lines });
  let r = o.seed >>> 0; const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
  const fill = new Set<number>(); const order = [...Array(nb).keys()].sort((a, b) => ((Math.imul(a + 1, 2654435761) ^ o.seed) >>> 0) - ((Math.imul(b + 1, 2654435761) ^ o.seed) >>> 0));
  for (const k of order.slice(0, Math.min(nb, Math.max(0, Math.round(nb * o.fill))))) fill.add(k);
  for (let k = 0; k < nb; k++) {
    const cx = bx0 + (k + 0.5) * BAY_W, sy = by1 - STOP_IN;
    bays.push([bx0 + k * BAY_W, by0, bx0 + (k + 1) * BAY_W, by1]);
    at(WHEEL_STOP, cx, sy);
    if (fill.has(k)) { const id = BAY_CARS[Math.floor(rnd() * BAY_CARS.length)]!, hb = half({ id, x: 0, y: 0, scale: 1, view: 0 }).hb; at(id, cx, sy - 0.09 - 0.2 - hb * CAR_K); }
  }
  // by the door: the ice freezer and the bins on the walk either side of the door (the shop front's middle); without a walk at the row's ends
  const [fr, bin] = DOOR_ITEMS as [string, string];
  if (walk) { at(fr, scx - Math.min(1.5, sw / 2 - 0.5), wy0 + 0.5); at(bin, scx + Math.min(1.3, sw / 2 - 0.4), wy0 + 0.5); }
  else { at(fr, Math.max(sx0 + 0.45, bx0 - 0.45), sy0 - 0.35); at(bin, Math.min(sx1 - 0.3, bx1 + 0.35), sy0 - 0.35); }
  // the service items: along the back fence behind the shop, else at the shop's side (the side with room, away from the forecourt)
  const [dump, hvac, cab] = SERVICE_ITEMS as [string, string, string];
  if (back) { const y = sy1 + SERVICE / 2; at(dump, scx - sw / 4, y); at(hvac, scx + sw / 8, y); at(cab, scx + sw / 3, y); }
  else { const x = svc > 0 ? sx1 + SIDE_COL / 2 : sx0 - SIDE_COL / 2; at(dump, x, sy1 - 0.6); at(hvac, x, sy0 + sd / 2); at(cab, x, sy0 + 0.4); }
  return { props, patches, main, forecourt: [fx0, 0, fx1, fy1], bays, layout: t.side ? 'side' : 'stacked' };
}
/** a parked car's drawn length over its footprint's (the engine draws a parked car at CAR_SCALE times its owner size: ext/car-art) */
const CAR_K = 0.88;

/** the bays of a fitted preset's car parks (its 'lot' patches' lines: two neighbouring parallel lines BAY_W apart, 1.5 to 3.5 tiles, are a bay):
 *  boxes in the preset frame, and whether the bay's cars point along y (lines along y) */
export function baysOf(patches: readonly PresetPatch[]): { box: Box; alongY: boolean }[] {
  const out: { box: Box; alongY: boolean }[] = [];
  for (const p of patches) {
    if (p.kind !== 'lot' || !p.lines || p.lines.length < 8) continue;
    const vs: [number, number, number][] = [], hs: [number, number, number][] = [];
    for (let i = 0; i + 3 < p.lines.length; i += 4) {
      const x0 = p.lines[i]!, y0 = p.lines[i + 1]!, x1 = p.lines[i + 2]!, y1 = p.lines[i + 3]!;
      if (Math.abs(x1 - x0) < 0.05) vs.push([x0, Math.min(y0, y1), Math.max(y0, y1)]); else if (Math.abs(y1 - y0) < 0.05) hs.push([y0, Math.min(x0, x1), Math.max(x0, x1)]);
    }
    const pairs = (ls: [number, number, number][], alongY: boolean) => {
      ls.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
        const a = ls[i]!, b = ls[j]!, g = b[0] - a[0];
        if (g < 1.5) continue; if (g > 3.5) break;
        const lo = Math.max(a[1], b[1]), hi = Math.min(a[2], b[2]);
        if (hi - lo < 1.5) continue;
        out.push({ box: alongY ? [a[0], lo, b[0], hi] : [lo, a[0], hi, b[0]], alongY });
        break;
      }
    };
    pairs(vs, true); pairs(hs, false);
  }
  return out;
}
/** whether a point stands inside a box, with a margin */
const inBox = (b: Box, x: number, y: number, m = 0) => x >= b[0] - m && x <= b[2] + m && y >= b[1] - m && y <= b[3] + m;
/** the wheel stops and cars of a base matched to its bays (T198: wheel stops only with their bays): a wheel stop in a bay's end is centred
 *  across it, any other dropped; a car in a car park is centred in its bay, one across the lines or outside a bay dropped; a car elsewhere (a
 *  drive, the yard) stays. Returns the indices kept and the props moved */
export function matchBays(props: readonly PresetProp[], patches: readonly PresetPatch[], isCar: (id: string) => boolean): { keep: number[]; props: PresetProp[] } {
  const bays = baysOf(patches), parks = patches.filter(p => p.kind === 'lot').map(p => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i + 1 < p.pts.length; i += 2) { x0 = Math.min(x0, p.pts[i]!); x1 = Math.max(x1, p.pts[i]!); y0 = Math.min(y0, p.pts[i + 1]!); y1 = Math.max(y1, p.pts[i + 1]!); } return [x0, y0, x1, y1] as Box; });
  const keep: number[] = [], out: PresetProp[] = [];
  props.forEach((q, i) => {
    const wheel = q.id === WHEEL_STOP, car = isCar(q.id);
    if (!wheel && !(car && parks.some(b => inBox(b, q.x, q.y)))) { keep.push(i); out.push(q); return; }
    // the bay it stands in: across the bay (within its width), along it (within its depth, a stop a little past its end)
    const bay = bays.find(b => (b.alongY ? q.x > b.box[0] && q.x < b.box[2] && q.y >= b.box[1] - 0.3 && q.y <= b.box[3] + 0.3 : q.y > b.box[1] && q.y < b.box[3] && q.x >= b.box[0] - 0.3 && q.x <= b.box[2] + 0.3));
    if (!bay) return;
    // a car must sit within its bay (its centre a third of the bay's width from the middle at most: not across the lines)
    const mid = bay.alongY ? (bay.box[0] + bay.box[2]) / 2 : (bay.box[1] + bay.box[3]) / 2, off = Math.abs((bay.alongY ? q.x : q.y) - mid), bw = bay.alongY ? bay.box[2] - bay.box[0] : bay.box[3] - bay.box[1];
    if (car && off > bw / 3) return;
    keep.push(i); out.push(bay.alongY ? { ...q, x: +mid.toFixed(3) } : { ...q, y: +mid.toFixed(3) });
  });
  return { keep, props: out };
}
