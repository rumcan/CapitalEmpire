// T375 and T376: where a shop's or house's building stands in its lot once the lot composer has turned it to face its street and set it back behind the pavement.
// Kept out of compose.ts (a few lines there call it): the composer is busy, and these two rules are pure functions of a fitted preset.
//  - turnedSpot (T375: the owner, 2026-11-08: the Video Vault, the fishing and tackle shop and some houses face the wrong way): the place a building turned to face
//    its street takes. Turning a footprint makes it deeper or wider than it was and it often passes the lot's edge or the front line, which kept 42% of the shops'
//    presets at their old, wrong, view; its centre now slides inside the lot as little as it takes.
//  - setBack (T376, #1032: the commercial buildings go onto the pavement): a shop's or venue's building moves straight back by what its footprint and the ground
//    contact of its picture (base-pad.ts: steps, door mats, planters, kerbs) lack to stand behind the lot's front line.
// Pure, no DOM.
import { LIBRARY } from '../library';
import { isBuilding } from '../mirror';
import { EPS, OVERLAP, REACH, WHEEL, clamp, share, type Box4, type LotGeom } from './compose-core';
import { frameHalf } from './house-class';
import { isFence } from './item-kinds';
import { basePad } from './base-pad';
import { drawnView, ownerScaleOf } from './preset-art';
import { roadOf, type PresetFrame } from './preset-frame';
import type { Fitted, LotPreset, PresetProp } from './presets';

const BY = new Map(LIBRARY.map(it => [it.id, it] as const));
/** whether a library id is a building (its picture is drawn from building art: mirror.ts isBuilding) */
const isBuildingId = (id: string): boolean => { const it = BY.get(id); return !!it && isBuilding(it); };
/** a footprint box (lot frame, tiles) from a prop's centre and half extents */
const boxAt = (q: { x: number; y: number }, h: { ha: number; hb: number }): Box4 => [q.x - h.ha, q.y - h.hb, q.x + h.ha, q.y + h.hb];
/** what done() lets overlap anything: the fences and the wheel stops (compose-core.ts done: `!it.fence && !it.wheel`) */
const overlapsFreely = (id: string): boolean => id === WHEEL || isFence(id);

/** T375: where a building turned to face its street (view 0) stands: its centre slid inside the lot (the front line, or the preset's WHOLE_FRONT lo, and the
 *  sides and back) as little as it takes, or null when it cannot stand there: the lot is too small for it, or it would cover another building. A prop it covers
 *  beyond OVERLAP goes: done() keeps the first of two uprights that overlap, so a prop that comes before the building in the preset would win it, and the
 *  building is then to be put first (first: true, turnFirst); a later prop it covers is left out by done() as it is. Fences and wheel stops do not count.
 *  h: the turned building's half extents; props and boxes: the preset's, by index; k: this building's index */
export function turnedSpot(q: PresetProp, h: { ha: number; hb: number }, lot: LotGeom, lo: number, props: readonly PresetProp[], boxes: readonly Box4[], k: number): { q: PresetProp; first: boolean } | null {
  const x = clamp(q.x, h.ha, Math.max(h.ha, lot.w - h.ha)), y = clamp(q.y, lo + h.hb, Math.max(lo + h.hb, lot.d - h.hb));
  const b = boxAt({ x, y }, h);
  if (b[0] < -EPS || b[1] < lo - EPS || b[2] > lot.w + EPS || b[3] > lot.d + EPS) return null;
  let first = false;
  for (let j = 0; j < boxes.length; j++) {
    if (j === k || share(b, boxes[j]!) <= OVERLAP) continue;
    const id = props[j]!.id;
    if (overlapsFreely(id)) continue;
    if (isBuildingId(id)) return null;
    if (j < k) first = true;
  }
  return { q: { ...q, view: 0, x, y }, first };
}
/** T375: a fitted preset with the buildings at indexes `first` moved to the front of its props (the arrays that go by prop index alongside), so done() keeps them
 *  over the props they cover; the order of the rest is kept */
export function turnFirst(fit: Fitted, first: readonly number[]): Fitted {
  const at = new Set(first), order = [...first, ...fit.props.map((_, i) => i).filter(i => !at.has(i))];
  return { ...fit, props: order.map(i => fit.props[i]!), from: order.map(i => fit.from[i]!), ...(fit.standIn ? { standIn: order.map(i => fit.standIn![i]) } : {}) };
}

/** whether the commercial buildings are set back behind the lot's front line (on; setLotSetback(false) draws the lots as before T376: the lot lab's coverage, and the
 *  tests that show what the setback fixes) */
let SETBACK = true;
export function setLotSetback(on: boolean): void { SETBACK = on; }
export const lotSetback = (): boolean => SETBACK;

/** T376 (#1032, the owner: "the buildings that are going onto the pavement ... the commercial buildings"): a shop's or venue's buildings stand with their
 *  base behind the lot's front line, the pavement lying beyond it: the footprint (a preset may leave it REACH over the line, and a lot turned off its heading
 *  carries the axis-aligned box's corner further over) and the ground contact of its picture (base-pad.ts basePad: steps, door mats, planters, kerbs) both at
 *  b >= 0. A building too far forward moves straight back by what lacks, as far as the lot's back (REACH past it, as inside() allows) and the buildings it would
 *  newly overlap beyond OVERLAP let it (any other prop it comes to cover is left out by done(), as an overlap always is). Awnings and signs above head height
 *  cross the line as they do: only ground contact counts. The other uses are left as they are */
export function setBack(fit: Fitted, preset: LotPreset, lot: LotGeom, f: PresetFrame): Fitted {
  if (!SETBACK || (preset.use !== 'com' && preset.use !== 'tour') || !fit.props.length || preset.id === 'auto:centre') return fit;
  const road = roadOf(lot.n), half = frameHalf(f), props = fit.props.slice(), boxes = fit.props.map(q => boxAt(q, half(q)));
  let moved = 0;
  props.forEach((q, k) => {
    if (!isBuildingId(q.id)) return;
    const h = half(q), pad = basePad(drawnView(q.id, f, q.view).id, road, q.scale * ownerScaleOf(q.id));
    // how far the base reaches in front of the line (tiles), and how far the lot's back lets the building move
    const need = pad + h.hb - q.y, room = lot.d + REACH - (q.y + h.hb) - 3 * EPS;
    if (need <= EPS / 4) return;
    let dy = Math.min(need, room);
    for (; dy > EPS / 4; dy -= 0.05) {
      const b = boxAt({ x: q.x, y: q.y + dy }, h);
      // (another building must stay: two cannot share ground. Any other prop the building comes to overlap beyond OVERLAP is left out by done(), as every overlap is)
      if (boxes.every((o, j) => j === k || !isBuildingId(props[j]!.id) || share(b, o) <= OVERLAP || share(boxes[k]!, o) > OVERLAP)) break;
    }
    if (dy <= EPS / 4) return;
    props[k] = { ...q, y: q.y + dy }; boxes[k] = boxAt(props[k]!, h); moved++;
  });
  return moved ? { ...fit, props } : fit;
}
