// Course dressing (docs/GOLF-PLAN.md sections 3, 4.2 and 10): deterministic prop placements {id, x, y, flip, scale} for tee markers, flagsticks at pins, benches near tees, trees lining holes outside fairways, and a painted cart path loop. Pure TS, no DOM.
import { mulberry } from '../iso';
import { deriveHoles, surfaceAt, type Pt } from './holes';
import type { CourseArea, CourseLayout } from './types';

/**
 * Verified sprite IDs from src/game/business-library.ts (line 66, registered via appendBusinesses in src/game/library.ts)
 * and src/game/library.ts (lines 66-87, categories "Capital vegetation" and "Trees & plants").
 */
export const PIN_RED_ID = 'business:golf-pin-red';
/** yellow flagstick for the final (9th or 18th) hole (src/game/business-library.ts line 66, w=206, h=476) */
export const PIN_YELLOW_ID = 'business:golf-pin-yellow';
/** back (championship) tee marker prop (src/game/business-library.ts line 66, w=211, h=429) */
export const TEE_BACK_ID = 'business:golf-pin-red-equipment';
/** middle (member) tee marker prop (src/game/business-library.ts line 66, w=362, h=480) */
export const TEE_MIDDLE_ID = 'business:golf-bag-trolley';
/** forward tee marker prop (src/game/business-library.ts line 66, w=206, h=476) */
export const TEE_FORWARD_ID = 'business:golf-pin-yellow';
/** tee-side bench with course map (src/game/business-library.ts line 66, w=562, h=494; never flipped per owner's lettering rule) */
export const BENCH_ID = 'business:golf-bench-course-map';

/** verified tree sprite IDs from src/game/library.ts ("Capital vegetation" and "Trees & plants", kind="tree") */
export const TREE_IDS = [
  'capital:tree-pine-open',
  'capital:tree-pine-moderate',
  'capital:tree-spruce-open',
  'capital:tree-spruce-moderate',
  'capital:tree-maple-open',
  'capital:tree-maple-moderate',
  'capital:tree-birch-open',
  'capital:tree-birch-moderate',
  'capital:tree-oak-open',
  'capital:tree-oak-moderate',
  'world:tree_oak_1',
  'world:tree_pine_1',
] as const;

/** set of every sprite ID used by course dressing, for fast verification */
export const DRESSING_SPRITE_IDS: ReadonlySet<string> = new Set<string>([
  PIN_RED_ID, PIN_YELLOW_ID, TEE_BACK_ID, TEE_MIDDLE_ID, TEE_FORWARD_ID, BENCH_ID, ...TREE_IDS,
]);

/** a placed course prop in tile coordinates (flip is always false on pins/benches/equipment so lettering never mirrors) */
export interface DressedProp {
  id: string;
  x: number;
  y: number;
  flip: boolean;
  scale: number;
}

/** cart path ribbon half-width in tiles (1.25 tiles = 2.5 m -> 5 m wide path) */
const PATH_HALF = 1.25;
/** maximum cart path segment length in tiles (kept well under CELL = 200 so courseAreas never drops a clipped piece) */
const PATH_SEG_MAX = 140;
/** minimum clearance (tiles) from any hole playing line to a placed tree */
const TREE_LINE_CLEAR = 13;
/** minimum clearance (tiles) from any pin or tee to a placed tree */
const TREE_END_CLEAR = 12;
/** minimum spacing (tiles) between placed trees */
const TREE_MIN_SPACING = 9;

/** round to quarter tiles (no -0) */
const q4 = (v: number) => Math.round(v * 4) / 4 + 0;

/** distance from point (x, y) to segment a-b in tiles */
function ptSeg(x: number, y: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
  return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
}

/** build a closed loop of simple rectangular 'path' CourseAreas (each <= PATH_SEG_MAX tiles) connecting clubhouse -> hole tees/pins -> clubhouse */
export function buildCartPathLoop(layout: CourseLayout, startId = 1000): CourseArea[] {
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  const waypoints: Pt[] = [{ x: layout.clubhouse.x, y: layout.clubhouse.y }];
  let cx = layout.clubhouse.x, cy = layout.clubhouse.y;
  if (holes.length > 0) {
    let sx = 0, sy = 0, n = 0;
    for (const h of holes) for (const p of h.line) { sx += p.x; sy += p.y; n++; }
    if (n > 0) { cx = sx / n; cy = sy / n; }
  }
  for (const h of holes) {
    for (const p of h.line) {
      // offset the cart path 10 tiles toward the course interior so it skirts beside the fairways and greens
      const vx = cx - p.x, vy = cy - p.y, vl = Math.hypot(vx, vy) || 1;
      waypoints.push({ x: q4(p.x + (vx / vl) * 10), y: q4(p.y + (vy / vl) * 10) });
    }
  }
  waypoints.push({ x: layout.clubhouse.x, y: layout.clubhouse.y });

  const out: CourseArea[] = [];
  let nextId = startId;
  for (let i = 0; i + 1 < waypoints.length; i++) {
    const a = waypoints[i]!, b = waypoints[i + 1]!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len < 4) continue;
    const steps = Math.max(1, Math.ceil(len / PATH_SEG_MAX));
    const ux = dx / len, uy = dy / len, nx = -uy * PATH_HALF, ny = ux * PATH_HALF;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const x0 = a.x + dx * t0, y0 = a.y + dy * t0, x1 = a.x + dx * t1, y1 = a.y + dy * t1;
      const pts = [
        q4(x0 + nx), q4(y0 + ny),
        q4(x1 + nx), q4(y1 + ny),
        q4(x1 - nx), q4(y1 - ny),
        q4(x0 - nx), q4(y0 - ny),
      ];
      out.push({ id: nextId++, surface: 'path', pts });
    }
  }
  return out;
}

/** return a new CourseLayout with the cart path loop inserted right after the base 'rough' area so fairways, greens, tees, and bunkers paint over it */
export function withCartPathLoop(layout: CourseLayout): CourseLayout {
  const pathAreas = buildCartPathLoop(layout);
  const roughIdx = layout.areas.findIndex(a => a.surface === 'rough');
  const insertAt = roughIdx >= 0 ? roughIdx + 1 : 0;
  const combined = [
    ...layout.areas.slice(0, insertAt),
    ...pathAreas,
    ...layout.areas.slice(insertAt),
  ].map((a, idx) => ({ ...a, id: idx + 1 }));
  return { ...layout, areas: combined };
}

/** deterministically generate prop placements {id, x, y, flip, scale} for pins, tee markers, benches near tees, and hole-lining trees */
export function dressCourse(layout: CourseLayout, seed: number): DressedProp[] {
  const rng = mulberry(seed);
  const props: DressedProp[] = [];
  const holes = deriveHoles(layout.areas, layout.tees, layout.pins, layout.aims);
  const maxHole = layout.pins.reduce((m, p) => Math.max(m, p.hole), 9);

  // 1. Flagsticks at every pin (yellow flag on the finishing hole, red on the others; never flipped)
  for (const pin of layout.pins) {
    props.push({
      id: pin.hole === maxHole ? PIN_YELLOW_ID : PIN_RED_ID,
      x: pin.x,
      y: pin.y,
      flip: false,
      scale: 0.32,
    });
  }

  // 2. Tee markers at back, middle, and forward tees (never flipped)
  for (const tee of layout.tees) {
    const id = tee.kind === 'back' ? TEE_BACK_ID : tee.kind === 'middle' ? TEE_MIDDLE_ID : TEE_FORWARD_ID;
    const scale = tee.kind === 'back' ? 0.22 : tee.kind === 'middle' ? 0.2 : 0.18;
    props.push({ id, x: tee.x, y: tee.y, flip: false, scale });
  }

  // 3. Benches beside each hole's back tee (offset 4.5 tiles perpendicular to the hole's initial line; flip: false per lettering rule)
  for (const h of holes) {
    if (h.line.length < 2) continue;
    const p0 = h.line[0]!, p1 = h.line[1]!;
    const dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    props.push({
      id: BENCH_ID,
      x: q4(p0.x + nx * 4.5),
      y: q4(p0.y + ny * 4.5),
      flip: false,
      scale: 0.26,
    });
  }

  // 4. Trees lining the holes outside the fairways, inside the rough boundary
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  const rough = layout.areas.find(a => a.surface === 'rough');
  const boundPts = rough ? rough.pts : layout.areas.flatMap(a => a.pts);
  for (let i = 0; i + 1 < boundPts.length; i += 2) {
    bx0 = Math.min(bx0, boundPts[i]!); by0 = Math.min(by0, boundPts[i + 1]!);
    bx1 = Math.max(bx1, boundPts[i]!); by1 = Math.max(by1, boundPts[i + 1]!);
  }

  const allSegs: [Pt, Pt][] = [];
  for (const h of holes) {
    for (let i = 0; i + 1 < h.line.length; i++) allSegs.push([h.line[i]!, h.line[i + 1]!]);
  }
  const treePts: Pt[] = [];
  const safeTree = (x: number, y: number): boolean => {
    if (x < bx0 + 6 || x > bx1 - 6 || y < by0 + 6 || y > by1 - 6) return false;
    if (Math.hypot(x - layout.clubhouse.x, y - layout.clubhouse.y) < 16) return false;
    for (const p of layout.pins) if (Math.hypot(x - p.x, y - p.y) < TREE_END_CLEAR) return false;
    for (const t of layout.tees) if (Math.hypot(x - t.x, y - t.y) < TREE_END_CLEAR) return false;
    for (const [a, b] of allSegs) if (ptSeg(x, y, a, b) < TREE_LINE_CLEAR) return false;
    for (const tp of treePts) if (Math.hypot(x - tp.x, y - tp.y) < TREE_MIN_SPACING) return false;
    const surf = surfaceAt(layout.areas, x, y);
    return surf === 'rough' || surf === 'fescue' || surf === 'other';
  };

  for (const h of holes) {
    for (let i = 0; i + 1 < h.line.length; i++) {
      const a = h.line[i]!, b = h.line[i + 1]!;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
      if (len < 20) continue;
      const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
      for (let d = 18; d < len - 14; d += 18) {
        for (const side of [-1, 1] as const) {
          const jitterAlong = (rng() - 0.5) * 4;
          const off = 15 + rng() * 5;
          const tx = q4(a.x + (d + jitterAlong) * ux + side * off * nx);
          const ty = q4(a.y + (d + jitterAlong) * uy + side * off * ny);
          const treeId = TREE_IDS[Math.floor(rng() * TREE_IDS.length)]!;
          const flip = rng() < 0.5;
          const scale = Math.round((0.42 + rng() * 0.16) * 100) / 100;
          if (!safeTree(tx, ty)) continue;
          treePts.push({ x: tx, y: ty });
          props.push({ id: treeId, x: tx, y: ty, flip, scale });
        }
      }
    }
  }

  return props;
}
