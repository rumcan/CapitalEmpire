import type { LibItem } from './types';

/** Contact shadows: TrickOrTreat's town-builder base shadows (scripts/town-builder/shadows.mjs shapeFor + render), ported. Each upright sprite
 *  casts a feathered ground shape at its base, projected in the 2:1 view: buildings and vehicles their footprint, fences a thin strip along
 *  their run, trees and bushes a round pool sized from the canopy, poles and signs a small dark spot, other props their base. The builder bakes
 *  these into its ground pictures; here the GPU draws the same shape under every sprite (gl.ts FS_SHADOW is render()'s formula), so it moves,
 *  mirrors and scales with the sprite. Baked house lots carry their own shadows (lot-render.mjs) and cast none. */

/** a shadow shape: half extents (metres, along the map's x and y), darkness at the base (0..1), the feathered edge (metres), round or boxy */
export interface ShadowShape { hx: number; hy: number; core: number; feather: number; round: boolean; /** at the anchor (round shapes) or the footprint's centre */ atAnchor: boolean }
type Kind = 'none' | 'walker' | 'fencex' | 'fencey' | 'vehicle' | 'roundhouse' | 'building' | 'tree' | 'pole' | 'plant' | 'prop';

// the builder's name rules
const ROUND = /tree|bush|fern|hydrangea|ornamental|mums|pumpkin|hay|ghost|scarecrow|shrub|plant|grass_clump|witch|lantern|planter|flower|hedge/i;
const POLE = /lamp|utility_pole|pole|street_sign|stop sign|stop_sign|traffic|speaker_post|goalpost|hydrant|mailbox|marquee|sign|post|flag|meter|bollard|signal|payphone/i;
const VEHICLE = /\b(car|van|pickup|bus|compact|truck|wagon|sedan|coupe|cart)\b/i;
const BOXY = new Set(['house', 'building', 'venue', 'vending', 'arcade', 'junglegym']);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const KINDS = new Map<LibItem, Kind>();
function kindOf(it: LibItem): Kind {
  let k = KINDS.get(it);
  if (k) return k;
  const name = `${it.name} ${it.id}`;
  k = it.kind === 'lot' ? 'none' : it.kind === 'walker' ? 'walker' : it.kind === 'fencex' ? 'fencex' : it.kind === 'fencey' ? 'fencey'
    : it.kind === 'car' || (VEHICLE.test(name) && !/candy|scarecrow|wheelbarrow/i.test(name)) ? 'vehicle'
    : it.kind === 'gazebo' || /fountain|merrygoround|merry-go-round/i.test(name) ? 'roundhouse'
    : BOXY.has(it.kind) && !POLE.test(name) ? 'building'
    : it.kind === 'tree' || /tree/i.test(name) ? 'tree'
    : it.kind === 'lamp' || (POLE.test(name) && !/bus.?stop|shelter|scoreboard|leaderboard/i.test(name)) ? 'pole'
    : it.kind === 'bush' || ROUND.test(name) ? 'plant' : 'prop';
  KINDS.set(it, k);
  return k;
}

/** the shadow of a library item placed with a footprint of half extents hx, hy (metres) at the given scale; null = none */
export function shadowShape(it: LibItem, hx: number, hy: number, scale = 1): ShadowShape | null {
  switch (kindOf(it)) {
    case 'none': return null;
    case 'walker': return { hx: 0.28, hy: 0.28, core: 0.5, feather: 0.12, round: true, atAnchor: true };
    // fences: a thin strip along the run
    case 'fencex': return { hx: hx * 0.95, hy: 0.16, core: 0.62, feather: 0.14, round: false, atAnchor: false };
    case 'fencey': return { hx: 0.16, hy: hy * 0.95, core: 0.62, feather: 0.14, round: false, atAnchor: false };
    // vehicles: a dark pool that reaches past the body (bumpers, wheels): 1.12 along the length, 1.35 across
    case 'vehicle': { const [kx, ky] = hx >= hy ? [1.12, 1.35] : [1.35, 1.12]; return { hx: hx * kx, hy: hy * ky, core: 0.95, feather: 0.34, round: false, atAnchor: false }; }
    // round structures (a gazebo, a fountain, a merry-go-round)
    case 'roundhouse': { const r = clamp(Math.max(hx, hy) * 0.95, 0.5, 4); return { hx: r, hy: r, core: 0.6, feather: 0.3, round: true, atAnchor: false }; }
    // buildings and venues: their footprint
    case 'building': return { hx: hx * 0.97, hy: hy * 0.97, core: 0.55, feather: 0.32, round: false, atAnchor: false };
    // trees: from the canopy (the picture is about two canopy radii across, at 64 px per metre), not the trunk
    case 'tree': { const r = clamp(((it.w * scale) / 64) * 0.32, 0.45, 1.6); return { hx: r, hy: r, core: 0.58, feather: clamp(r * 0.35, 0.12, 0.5), round: true, atAnchor: true }; }
    // poles, lamps, signs, hydrants: small and dark
    case 'pole': { const r = clamp(Math.min(hx, hy) * 0.75, 0.12, 0.35); return { hx: r, hy: r, core: 0.7, feather: 0.1, round: true, atAnchor: true }; }
    // bushes and plants: round, from the base
    case 'plant': { const r = Math.max(0.25, Math.max(hx, hy) * 0.95); return { hx: r, hy: r, core: 0.58, feather: clamp(r * 0.35, 0.12, 0.5), round: true, atAnchor: true }; }
    // other props: their base, at least 0.3 m across both axes, keeping the footprint's aspect
    default: { const sum = hx + hy, s = Math.max(0.3, sum), fx = sum > 0 ? hx / sum : 0.5; return { hx: s * fx * 0.9, hy: s * (1 - fx) * 0.9, core: 0.6, feather: clamp(s * 0.12, 0.1, 0.3), round: false, atAnchor: false }; }
  }
}

/** the shadow's alpha at ground point (X, Y) metres from its centre (render() of shadows.mjs, one sample): darkest at the base, feathered both
 *  inside and outside the edge. The GPU shader (gl.ts FS_SHADOW) computes the same per pixel; this copy is for tests. */
export function shadowAlpha(s: ShadowShape, X: number, Y: number) {
  const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  let d: number;
  if (s.round) d = (Math.hypot(X / s.hx, Y / s.hy) - 1) * Math.min(s.hx, s.hy);
  else { const r = Math.min(0.18, s.hx * 0.5, s.hy * 0.5), qx = Math.abs(X) - s.hx + r, qy = Math.abs(Y) - s.hy + r; d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
  const f = s.feather;
  return clamp(s.core * (1 - smooth(-f, f * 1.2, d)) * (0.82 + 0.18 * smooth(0, -Math.min(s.hx, s.hy), d)), 0, 1);
}
