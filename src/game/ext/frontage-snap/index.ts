/** Frontage snap (plan P19, T069a): the nearest road segment within reach of the cursor, where a building's footprint goes so its front edge sits on the verge, and which way it faces. Pure TS, no DOM. Units: tiles of 2 m. */

/** a road segment to snap to: its centre line from (ax, ay) to (bx, by) (tiles), and the distance from that line to the verge's outer edge (tiles: the class's half width plus its verge, cls.h + cls.walk); kind: drive or path (the snap itself does not read it) */
export interface SnapSeg { ax: number; ay: number; bx: number; by: number; verge: number; kind: 'drive' | 'path' }
/** a building's footprint (tiles): w along the frontage, d deep (away from the road) */
export interface Footprint { w: number; d: number }
/** where the footprint goes: its centre (tiles), the axis it faces (a unit vector from the footprint toward the road: (1,0), (-1,0), (0,1) or (0,-1)), rot (the frontage runs along y, so the footprint's w lies along y), the segment's index, and the cursor's distance from the segment's centre line (tiles) */
export interface FrontageSnap { cx: number; cy: number; face: { x: number; y: number }; rot: boolean; seg: number; dist: number }

/** the axis a segment runs along: 'y' when x is constant, 'x' when y is constant (tolerance 1e-6 tiles), null when diagonal or zero-length */
function axisOf(g: SnapSeg): 'x' | 'y' | null {
  const sx = Math.abs(g.bx - g.ax) < 1e-6, sy = Math.abs(g.by - g.ay) < 1e-6;
  return sx && sy ? null : sx ? 'y' : sy ? 'x' : null;
}

/** the footprint's place for a cursor (px, py) in tiles against a footprint of fp.w x fp.d tiles: the axis-aligned segment whose centre line is nearest (|offset| in tiles) among those within reach (gap = |offset| - verge <= reach, tiles), ties to the lowest index; null when none is in reach */
export function snapFrontage(px: number, py: number, fp: Footprint, segs: readonly SnapSeg[], reach: number): FrontageSnap | null {
  let best = -1, bestAbs = Infinity, bestOff = 0, bestRot = false;
  for (let i = 0; i < segs.length; i++) {
    const g = segs[i]!, ax = axisOf(g);
    if (!ax) continue;
    const rot = ax === 'y', off = rot ? px - g.ax : py - g.ay, abs = Math.abs(off);
    if (abs - g.verge > reach || abs >= bestAbs) continue;
    best = i; bestAbs = abs; bestOff = off; bestRot = rot;
  }
  if (best < 0) return null;
  const g = segs[best]!;
  const lo = bestRot ? Math.min(g.ay, g.by) : Math.min(g.ax, g.bx);
  const L = bestRot ? Math.abs(g.by - g.ay) : Math.abs(g.bx - g.ax);
  const along = bestRot ? py - lo : px - lo;
  const s = L >= fp.w ? Math.min(L - fp.w / 2, Math.max(fp.w / 2, along)) : L / 2;
  const qx = bestRot ? g.ax : lo + s, qy = bestRot ? lo + s : g.ay;
  const face = bestOff >= 0 ? (bestRot ? { x: -1, y: 0 } : { x: 0, y: -1 }) : (bestRot ? { x: 1, y: 0 } : { x: 0, y: 1 });
  const k = g.verge + fp.d / 2;
  return { cx: qx - face.x * k, cy: qy - face.y * k, face, rot: bestRot, seg: best, dist: bestAbs };
}
