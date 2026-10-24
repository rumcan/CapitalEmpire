// Click-to-place course pieces (UIX revamp T030): the piece list, snap targets from the painted areas, and the paint areas a placed piece lays.
// Pure TypeScript, deterministic. Units: tiles of 2 m; money in $.
import { checkArea, clampStyle, DEFAULT_STYLE, type BorderTex, type BrushKind, type PaintArea, type PaintTex } from '../../paint';
import { areaBuildCost, type PlantKind } from '../../golf/costs';
import type { CoursePieceArchetype, SnapPieceKind, SnapPiecePlacement, SnapTargetArea } from '../course-snap';

/** the pieces the Course panel offers, in its order */
export const PIECE_BUTTONS: readonly { arch: CoursePieceArchetype; kind: SnapPieceKind; name: string }[] = [
  { arch: 'tee-raised', kind: 'tee', name: 'Raised tee' },
  { arch: 'tee-box', kind: 'tee', name: 'Tee box' },
  { arch: 'fairway-corridor', kind: 'fairway', name: 'Fairway' },
  { arch: 'fairway-pear', kind: 'fairway', name: 'Pear fairway' },
  { arch: 'fairway-dogleg-left', kind: 'fairway', name: 'Dogleg left' },
  { arch: 'fairway-dogleg-right', kind: 'fairway', name: 'Dogleg right' },
  { arch: 'green-kidney', kind: 'green', name: 'Kidney green' },
  { arch: 'green-peanut', kind: 'green', name: 'Peanut green' },
  { arch: 'green-practice', kind: 'green', name: 'Practice green' },
  { arch: 'bunker-crescent', kind: 'bunker', name: 'Crescent bunker' },
  { arch: 'bunker-pot', kind: 'bunker', name: 'Pot bunker' },
  { arch: 'water-pond', kind: 'water', name: 'Pond' },
  { arch: 'water-creek', kind: 'water', name: 'Creek' },
];

/** the painted areas a new piece can snap to: the course areas with a piece kind (rough and areas without a kind are not targets) */
export function snapTargets(areas: readonly Pick<PaintArea, 'id' | 'pts' | 'kind' | 'hole'>[]): SnapTargetArea[] {
  const out: SnapTargetArea[] = [];
  for (const a of areas) if (a.kind && a.kind !== 'rough') out.push({ id: a.id, kind: a.kind, pts: a.pts, ...(a.hole ? { hole: a.hole } : {}) });
  return out;
}

/** the paint areas (bottom to top) a placed piece lays: each layer's style on the default style; every layer carries the hole, only the core carries the piece's kind (so it is a snap target and joins brush strokes of its kind) */
export function pieceAreas(pl: SnapPiecePlacement): Omit<PaintArea, 'id'>[] {
  return pl.layers.map(l => {
    const style = clampStyle({ ...DEFAULT_STYLE, tex: l.tex as PaintTex, border: l.border, btex: l.btex as BorderTex, radius: l.radius, angle: l.angle, ...(l.tone ? { tone: l.tone, toneAmt: l.toneAmt ?? DEFAULT_STYLE.toneAmt, tint: l.tint ?? DEFAULT_STYLE.tint } : {}) });
    return { ...style, pts: l.pts.slice(), hole: pl.hole, ...(l.role === 'core' ? { kind: l.kind as BrushKind } : {}) };
  });
}

/** why a piece's areas cannot be laid ('' if they can): any layer's shape (checkArea), then, given an owned-land test (golf mode), every layer inside the owned land */
export function pieceWhy(areas: readonly { pts: number[] }[], owned?: (pts: number[]) => boolean): string {
  for (const a of areas) { const w = checkArea(a.pts); if (w) return w; }
  if (owned) for (const a of areas) if (!owned(a.pts)) return 'Cannot place outside owned course land';
  return '';
}

/** a piece's build cost ($): the sum of its layers' paint costs */
export function pieceCost(areas: readonly { pts: number[]; tex: PaintTex }[], plant: PlantKind = 'seed'): number {
  let c = 0;
  for (const a of areas) c += areaBuildCost(a.pts, a.tex, plant);
  return Math.round(c);
}
