/** T265 (#794): the river's swamp stops short of what is built (renderer.ts riverCut gathers the shapes near a chunk, swamp.ts makes the band):
 *  drawn onto the band's alpha (in tile space) with destination-out, each shape grown by its margin (RIVER_CUT: a road's walk or a bridge 3 m,
 *  a lot, a yard, a painted area or the course 2 m), its outer half cut by half (a soft edge), its inner half and the shape itself whole.
 *  Pure TypeScript, no DOM types needed (the node tests draw it onto a recorder). Units: tiles of 2 m. */

/** how far short of what is built the river's swamp stops (tiles past its edge) */
export const RIVER_CUT = { road: 1.5, lot: 1 } as const;

/** the drawing calls the cut needs (a 2D context, or a test's recorder); P is the context's path type */
export interface CutCtx<P> {
  globalAlpha: number; lineWidth: number; lineCap: 'butt' | 'round' | 'square'; lineJoin: 'round' | 'bevel' | 'miter';
  fillStyle: unknown; strokeStyle: unknown;
  fill(path: P, rule?: 'nonzero' | 'evenodd'): void; stroke(path: P): void;
}
/** what the cut keeps the swamp off: the roads' features (a stroke of width w, or a filled shape), the bridges (their centrelines and half
 *  widths) and the filled shapes (lots, yards, painted areas, the course) */
export interface CutShapes<P> {
  feats: readonly { kind: 'stroke' | 'poly' | 'disc'; path: P; w: number; cap: 'butt' | 'round' }[];
  bridges: readonly { path: P; hw: number }[];
  shapes: readonly { path: P; rule: 'nonzero' | 'evenodd' }[];
}

/** the cut onto g (its composite already destination-out, its transform tile space): two passes, the margin at half alpha, then half the margin
 *  whole; soft false (a district chunk: the margin a pixel or two) one pass, three quarters of the margin whole */
export function drawRiverCut<P>(g: CutCtx<P>, s: CutShapes<P>, soft = true): void {
  g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = '#000';
  for (const [alpha, k] of soft ? ([[0.5, 1], [1, 0.5]] as const) : ([[1, 0.75]] as const)) {
    g.globalAlpha = alpha; const R = RIVER_CUT.road * k, P = RIVER_CUT.lot * k;
    for (const f of s.feats) { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w + 2 * R; g.stroke(f.path); } else { g.fill(f.path); g.lineWidth = 2 * R; g.stroke(f.path); } }
    g.lineCap = 'round'; for (const b of s.bridges) { g.lineWidth = 2 * (b.hw + R); g.stroke(b.path); }
    g.lineWidth = 2 * P; for (const q of s.shapes) { g.fill(q.path, q.rule); g.stroke(q.path); }
  }
  g.globalAlpha = 1;
}
