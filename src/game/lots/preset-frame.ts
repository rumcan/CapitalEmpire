// The lot presets' frame (P20): where a preset's point lands in the world for a lot, and back. Pure, no DOM, no library.
// A preset is authored facing its street on the world +y side: x along the street (0 at the left as seen from the street), y away from it.
// A lot's frame (lots.ts: o + u a + n b) may run either way along its street, so the preset frame takes the along axis as n turned a quarter
// (u' = (-n.y, n.x)) and its origin at whichever front corner that puts x = 0 on: every lot is then the canonical lot turned, never mirrored.

/** a point or direction in world tiles */
export interface Pt { x: number; y: number }
/** the lot geometry the frame reads: origin, along, away (unit vectors) and size (tiles) */
export interface FrameLot { o: Pt; u: Pt; n: Pt; w: number; d: number }
/** a lot's preset frame: origin o (the front corner at x = 0, world tiles), along u and away n (unit vectors), size w x d (tiles), and q the
 *  quarter turns from the canonical facing (the street on +y: 0; +x: 1; -y: 2; -x: 3) */
export interface PresetFrame { o: Pt; u: Pt; n: Pt; w: number; d: number; q: 0 | 1 | 2 | 3 }

/** the street side's quarter turn of a lot whose away vector is n: the street lies along -n, by its larger axis (compose.ts flip and rear) */
export function facingOf(n: Pt): 0 | 1 | 2 | 3 {
  const fx = -n.x, fy = -n.y;
  return Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 1 : 3) : (fy > 0 ? 0 : 2);
}

/** a lot's preset frame (see the file head) */
export function frameOf(lot: FrameLot): PresetFrame {
  const u = { x: -lot.n.y, y: lot.n.x }, same = lot.u.x * u.x + lot.u.y * u.y > 0;
  const o = same ? { x: lot.o.x, y: lot.o.y } : { x: lot.o.x + lot.u.x * lot.w, y: lot.o.y + lot.u.y * lot.w };
  return { o, u, n: { x: lot.n.x, y: lot.n.y }, w: lot.w, d: lot.d, q: facingOf(lot.n) };
}

/** a preset-frame point (x along, y away; tiles) in world tiles */
export function toWorld(f: PresetFrame, x: number, y: number): Pt {
  return { x: f.o.x + f.u.x * x + f.n.x * y, y: f.o.y + f.u.y * x + f.n.y * y };
}

/** a world point (tiles) in the preset frame (x along, y away; tiles) */
export function toFrame(f: PresetFrame, wx: number, wy: number): Pt {
  const dx = wx - f.o.x, dy = wy - f.o.y;
  return { x: dx * f.u.x + dy * f.u.y, y: dx * f.n.x + dy * f.n.y };
}

/** a list of preset-frame x, y pairs in world tiles (a patch's points or lines) */
export const listToWorld = (f: PresetFrame, a: readonly number[]): number[] => { const out: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) { const p = toWorld(f, a[i]!, a[i + 1]!); out.push(p.x, p.y); } return out; };
/** a list of world x, y pairs in the preset frame */
export const listToFrame = (f: PresetFrame, a: readonly number[]): number[] => { const out: number[] = []; for (let i = 0; i + 1 < a.length; i += 2) { const p = toFrame(f, a[i]!, a[i + 1]!); out.push(p.x, p.y); } return out; };
