/** Road structures: splits a route into ground, bridge and tunnel pieces by the terrain under its corridor. Pure, so it runs in node. */
import { SK, sub, vlen, type Leg, type Pt, type SegKind } from './network';
import { TC } from './terrain/types';

/** cost multiplier per metre, by kind */
export const STRUCT_COST = [1, 4, 6];
/** longest single bridge / tunnel, in tiles */
export const STRUCT_MAX = [Infinity, 150, 300];

const STEP = 0.25, ABUT = 1.5, MIN_GROUND = 0.25, SHORT_GROUND = 3;
/** probe offsets across the corridor, in half widths */
const OFFS = [-1, -0.5, 0, 0.5, 1];

interface Run { s0: number; s1: number; kind: SegKind }

/** the point at distance s along a leg (exact at the ends) */
function at(l: Leg, u: Pt, L: number, s: number): Pt {
  if (s <= 0) return l.a;
  if (s >= L) return l.b;
  return { x: l.a.x + u.x * s, y: l.a.y + u.y * s };
}

/** split each leg where its corridor (half width hw) crosses water (bridge) or hills (tunnel); the rest stays ground */
export function splitByTerrain(legs: Leg[], hw: number, classAt: (x: number, y: number) => number): { legs: Leg[]; kinds: SegKind[] } {
  const outLegs: Leg[] = [], kinds: SegKind[] = [];
  for (const l of legs) {
    const d = sub(l.b, l.a), L = vlen(d); if (L < 1e-6) continue;
    const u = { x: d.x / L, y: d.y / L }, n = { x: -u.y, y: u.x };
    const N = Math.ceil(L / STEP), S: number[] = [], K: SegKind[] = [];
    for (let i = 0; i <= N; i++) {
      const s = Math.min(L, i * STEP); let water = false, hill = false;
      for (const o of OFFS) { const c = classAt(l.a.x + u.x * s + n.x * o * hw, l.a.y + u.y * s + n.y * o * hw); if (c === TC.WATER) water = true; else if (c === TC.HILL) hill = true; }
      S.push(s); K.push(water ? SK.BRIDGE : hill ? SK.TUNNEL : SK.GROUND);
    }
    // runs of equal kind, boundaries halfway between differing samples
    const runs: Run[] = [];
    let start = 0;
    for (let i = 1; i <= N; i++) if (K[i] !== K[i - 1]) { const b = Math.min(L, Math.max(0, (S[i - 1] + S[i]) / 2)); runs.push({ s0: start, s1: b, kind: K[i - 1] }); start = b; }
    runs.push({ s0: start, s1: L, kind: K[N] });
    // a short ground gap between two equal structures is bridged over (or tunnelled through)
    for (let k = 1; k + 1 < runs.length; k++) {
      const r = runs[k], p = runs[k - 1], q = runs[k + 1];
      if (r.kind === SK.GROUND && r.s1 - r.s0 < SHORT_GROUND && p.kind !== SK.GROUND && p.kind === q.kind) r.kind = p.kind;
    }
    // bridges take a 1.5 tile abutment on each bank
    for (let k = 0; k < runs.length; k++) if (runs[k].kind === SK.BRIDGE) {
      const r = runs[k], p = runs[k - 1], q = runs[k + 1];
      if (p && p.kind === SK.GROUND) { const s0 = Math.max(p.s0, r.s0 - ABUT); p.s1 = s0; r.s0 = s0; }
      if (q && q.kind === SK.GROUND) { const s1 = Math.min(q.s1, r.s1 + ABUT); q.s0 = s1; r.s1 = s1; }
    }
    // a bank left shorter than MIN_GROUND disappears: its neighbours meet where it ended
    for (let k = runs.length - 1; k >= 0; k--) {
      const g = runs[k];
      if (g.kind !== SK.GROUND || g.s1 - g.s0 >= MIN_GROUND || (runs[k - 1]?.kind !== SK.BRIDGE && runs[k + 1]?.kind !== SK.BRIDGE)) continue;
      if (runs[k - 1]) runs[k - 1].s1 = g.s1; else if (runs[k + 1]) runs[k + 1].s0 = g.s0;
      runs.splice(k, 1);
    }
    // adjacent runs of the same kind become one
    for (let k = runs.length - 1; k > 0; k--) if (runs[k].kind === runs[k - 1].kind) { runs[k - 1].s1 = runs[k].s1; runs.splice(k, 1); }
    for (const r of runs) { outLegs.push({ a: at(l, u, L, r.s0), b: at(l, u, L, r.s1) }); kinds.push(r.kind); }
  }
  return { legs: outLegs, kinds };
}

/** tiles of road per kind: [ground, bridge, tunnel] */
export function structureLengths(legs: Leg[], kinds: SegKind[]): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < legs.length; i++) out[kinds[i]] += vlen(sub(legs[i].b, legs[i].a));
  return out;
}

/** the longest chain of consecutive legs of this kind whose ends touch, in tiles */
export function longestRun(legs: Leg[], kinds: SegKind[], kind: SegKind): number {
  let best = 0, run = 0, end: Pt | null = null;
  for (let i = 0; i < legs.length; i++) {
    const l = legs[i];
    if (kinds[i] !== kind) { run = 0; end = null; continue; }
    const touch = end !== null && Math.abs(end.x - l.a.x) < 1e-6 && Math.abs(end.y - l.a.y) < 1e-6;
    run = (touch ? run : 0) + vlen(sub(l.b, l.a)); end = l.b; best = Math.max(best, run);
  }
  return best;
}
