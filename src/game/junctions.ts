// The junction tool's pure rules (no DOM, no Game): a junction's corners, which of them take a slipway, the slipways a plan leaves, and why a
// flag or a slipway cannot be had. Used by Game (engine.ts) and the Junctions panel (App.tsx); headless test: tests/junction-tool.test.ts.
import { add, armDeg, cross, mul, norm, perp, slipCorner, slipIn, sub, type Arm, type Node, type NodeType, type Pt } from './network';

/** the lights' tier letters on the map badges (index = tier: fixed-time, actuated, adaptive) */
export const TIER_BADGE = ['F', 'A', 'Ad'];

/** one corner of a junction, between arms A and B (B the arm after A in n.arms): deg = its right turn's in-arm (armDeg: its name in slipOff);
 *  at = where the corner sits on the map (tiles); right = it has a right turn, so a slipway can go there at all; fits = a slipway fits
 *  (long enough approaches: slipCorner); on = the node has its slipway now */
export interface Corner { A: Arm; B: Arm; deg: number; at: Pt; right: boolean; fits: boolean; on: boolean }

/** a slipway plan: the node's type and its slipOff (the corners without one, see slipPlan) */
export interface SlipPlan { type: NodeType; off: number[] }

/** whether a node is lights: a signal, or a slip node (lights with slipways) */
export const isLights = (n: Node): boolean => n.type === 'signal' || n.type === 'slip';

/** the kerb corner between arms A and B of the node at N: where A's edge (its perp side) meets B's edge; the bisector point when they run parallel */
function cornerAt(N: Pt, A: Arm, B: Arm): Pt {
  const p1 = add(N, mul(perp(A.dir), A.h)), p2 = sub(N, mul(perp(B.dir), B.h)), den = cross(A.dir, B.dir);
  if (Math.abs(den) < 1e-9) return add(N, mul(norm(add(A.dir, B.dir)), Math.max(A.h, B.h) + 2));
  return add(p1, mul(A.dir, cross(sub(p2, p1), B.dir) / den));
}

/** the corners of node n in arm order. geometry = false skips the fit test (fits is then false), for the state alone (a badge, a plan) */
export function junctionCorners(n: Node, geometry = true): Corner[] {
  const k = n.arms.length, N = { x: n.x, y: n.y }, out: Corner[] = [];
  for (let i = 0; i < k; i++) {
    const A = n.arms[i]!, B = n.arms[(i + 1) % k]!, I = slipIn(A, B), right = !!I, deg = I ? armDeg(I) : 0;
    const on = n.type === 'slip' && right && !n.slipOff?.includes(deg);
    const fits = geometry && right && !!slipCorner({ ...n, type: 'slip', slipOff: undefined }, A, B);
    out.push({ A, B, deg, at: cornerAt(N, A, B), right, fits, on });
  }
  return out;
}

/** the plan that leaves the slipways on at the corners named in on (degs): none makes plain lights ('signal', no slipOff); some make a 'slip' node
 *  whose slipOff names the right-turn corners that are off (none off: slipOff empty, every corner has one) */
export function slipPlan(n: Node, on: number[]): SlipPlan {
  return on.length ? { type: 'slip', off: junctionCorners(n, false).filter(c => c.right && !on.includes(c.deg)).map(c => c.deg) } : { type: 'signal', off: [] };
}

/** the degs of the corners with a slipway now (see Corner.on) */
export const slipsOn = (n: Node): number[] => junctionCorners(n, false).filter(c => c.on).map(c => c.deg);

/** why a widened-turns or turn-lane flag cannot go on at node n ('' when it can): turn lanes need three roads and a two-lane road; a roundabout has its own lanes */
export function flagRule(n: Node, k: 'wide' | 'tl'): string {
  if (n.type === 'roundabout') return 'Roundabouts have their own lanes';
  if (k === 'tl' && n.arms.length < 3) return 'Turn lanes need a junction of three or more roads';
  if (k === 'tl' && !n.arms.some(a => a.cls.laneCentres.length >= 2)) return 'Turn lanes need a two-lane road at the junction';
  return '';
}

/** why lights at node n cannot have a slipway ('' when some corner has one to offer): no corner has a right turn, or none is long enough (slipways need 54 m approaches) */
export function slipRule(n: Node): string {
  const cs = junctionCorners(n);
  if (!cs.some(c => c.right)) return 'No corner here has a right turn for a slipway';
  if (!cs.some(c => c.fits || c.on)) return 'Slipways need approaches of 54 m+ into the junction';
  return '';
}
