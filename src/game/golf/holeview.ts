// The Course tool's holes (docs/COURSE-BUILDER.md C2): automatic pins and tee markers from the painted greens and tees of each hole, the
// tagging of a golf game's painted course by hole, and per-hole views (par, lengths, checks) for the hole strip and the inspector. Pure, no DOM.
import { insidePoly, polyArea, polyBox, type PaintTex } from '../paint';
import { surfaceOfTex } from './costs';
import { deriveHoles, holeLine, type Pt } from './holes';
import type { AimPoint, CourseArea, GolfSurface, Pin, TeeMark } from './types';

/** the holes a course has */
export const HOLES = 18;
/** a painted area as these helpers read it: its hole tag, texture and outline */
export interface HoleArea { hole?: number; tex: PaintTex; pts: number[] }
/** a marker: the pin or a tee marker */
export type MarkerKind = 'pin' | 'back' | 'middle' | 'forward';
/** a change to the markers: place or move one (x, y), or remove it */
export type MarkerOp = { op: 'set'; hole: number; kind: MarkerKind; x: number; y: number } | { op: 'remove'; hole: number; kind: MarkerKind };
const TEE_KINDS: ('back' | 'middle' | 'forward')[] = ['back', 'middle', 'forward'];
/** an area of the course further than this (tiles, 160 m) from every playing line is not tagged with a hole */
const TAG_REACH = 80;

/** a point inside the polygon: its centroid when that is inside, else the middle of the widest inside span across its box's middle row */
export function interiorPoint(pts: number[]): Pt {
  let cx = 0, cy = 0, a2 = 0;
  for (let i = 0, n = pts.length >> 1; i < n; i++) {
    const x0 = pts[2 * i]!, y0 = pts[2 * i + 1]!, x1 = pts[(2 * i + 2) % pts.length]!, y1 = pts[(2 * i + 3) % pts.length]!, c = x0 * y1 - x1 * y0;
    a2 += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (a2 !== 0) { const p = { x: cx / (3 * a2), y: cy / (3 * a2) }; if (insidePoly(pts, p.x, p.y)) return p; }
  const b = polyBox(pts), y = (b[1] + b[3]) / 2, xs: number[] = [];
  for (let i = 0, n = pts.length >> 1; i < n; i++) {
    const x0 = pts[2 * i]!, y0 = pts[2 * i + 1]!, x1 = pts[(2 * i + 2) % pts.length]!, y1 = pts[(2 * i + 3) % pts.length]!;
    if ((y0 > y) !== (y1 > y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
  }
  xs.sort((p, q) => p - q);
  let best = -1, bx = pts[0]!;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1]! - xs[i]! > best) { best = xs[i + 1]! - xs[i]!; bx = (xs[i]! + xs[i + 1]!) / 2; }
  return best >= 0 ? { x: bx, y } : { x: pts[0]!, y: pts[1]! };
}

/** the largest of the outlines (by area), or undefined */
const largest = (ps: number[][]) => ps.reduce<number[] | undefined>((m, p) => !m || Math.abs(polyArea(p)) > Math.abs(polyArea(m)) ? p : m, undefined);

/** the pin's spot on a hole's greens: the hint when it lies on one of them, else inside the largest green */
export function autoPin(greens: number[][], hint?: Pt): Pt {
  if (hint && greens.some(g => insidePoly(g, hint.x, hint.y))) return { x: hint.x, y: hint.y };
  return interiorPoint(largest(greens)!);
}

/** the tee markers on a hole's largest tee box, along the line toward the green: back at the far end, middle in the middle, forward at the near end
 *  (each pulled toward the middle until it lies on the tee) */
export function autoTees(tees: number[][], toward: Pt): Record<'back' | 'middle' | 'forward', Pt> {
  const P = largest(tees)!, c = interiorPoint(P);
  let dx = toward.x - c.x, dy = toward.y - c.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
  if (!Number.isFinite(dx) || (dx === 0 && dy === 0)) { dx = 1; dy = 0; }
  let s0 = 0, s1 = 0;
  for (let i = 0; i < P.length; i += 2) { const s = (P[i]! - c.x) * dx + (P[i + 1]! - c.y) * dy; if (s < s0) s0 = s; if (s > s1) s1 = s; }
  const at = (s: number): Pt => { for (const k of [0.6, 0.4, 0.2]) { const p = { x: c.x + dx * s * k, y: c.y + dy * s * k }; if (insidePoly(P, p.x, p.y)) return p; } return c; };
  return { back: at(s0), middle: c, forward: at(s1) };
}

/** the outlines of hole n's areas whose surface is s */
const outlines = (areas: HoleArea[], n: number, s: GolfSurface) => areas.filter(a => a.hole === n && surfaceOfTex(a.tex) === s).map(a => a.pts);

/** the marker changes that keep every hole's markers on its painted green and tee: a hole with a green gets a pin on it (at the hint when that
 *  is on the green; a pin already on the green stays), a hole with a tee gets the three tee markers on it (those already on it stay), aimed at the
 *  pin; a marker placed this way (auto) goes when its green or tee is gone; markers the player placed elsewhere stay */
export function markerPlan(areas: HoleArea[], pins: (Pin & { auto?: boolean })[], tees: (TeeMark & { auto?: boolean })[], hints: Map<number, Pt> = new Map()): MarkerOp[] {
  const ops: MarkerOp[] = [];
  for (let n = 1; n <= HOLES; n++) {
    const greens = outlines(areas, n, 'green'), teeBoxes = outlines(areas, n, 'tee'), pin = pins.find(p => p.hole === n);
    let pinAt: Pt | null = pin ? { x: pin.x, y: pin.y } : null;
    if (greens.length) {
      const hint = hints.get(n);
      const on = pin && greens.some(g => insidePoly(g, pin.x, pin.y)) && !(hint && greens.some(g => insidePoly(g, hint.x, hint.y)));
      if (!on) { pinAt = autoPin(greens, hint ?? pinAt ?? undefined); ops.push({ op: 'set', hole: n, kind: 'pin', ...pinAt }); }
    } else if (pin?.auto) { ops.push({ op: 'remove', hole: n, kind: 'pin' }); pinAt = null; }
    const toward = pinAt ?? (greens.length ? interiorPoint(largest(greens)!) : null);
    if (teeBoxes.length) {
      let spots: Record<'back' | 'middle' | 'forward', Pt> | null = null;
      for (const k of TEE_KINDS) {
        const t = tees.find(q => q.hole === n && q.kind === k);
        if (t && teeBoxes.some(b => insidePoly(b, t.x, t.y))) continue;
        spots ??= autoTees(teeBoxes, toward ?? { x: interiorPoint(largest(teeBoxes)!).x + 1, y: interiorPoint(largest(teeBoxes)!).y });
        ops.push({ op: 'set', hole: n, kind: k, ...spots[k] });
      }
    } else for (const k of TEE_KINDS) if (tees.find(q => q.hole === n && q.kind === k)?.auto) ops.push({ op: 'remove', hole: n, kind: k });
  }
  return ops;
}

/** the markers after a plan: the pins and tees with the plan's changes applied (new and moved ones marked auto) */
export function applyPlan(pins: Pin[], tees: TeeMark[], ops: MarkerOp[]): { pins: (Pin & { auto?: boolean })[]; tees: (TeeMark & { auto?: boolean })[] } {
  let P: (Pin & { auto?: boolean })[] = pins.map(p => ({ ...p })), T: (TeeMark & { auto?: boolean })[] = tees.map(t => ({ ...t }));
  for (const o of ops) {
    if (o.kind === 'pin') { P = P.filter(p => p.hole !== o.hole); if (o.op === 'set') P.push({ hole: o.hole, x: o.x, y: o.y, auto: true }); }
    else { T = T.filter(t => !(t.hole === o.hole && t.kind === o.kind)); if (o.op === 'set') T.push({ hole: o.hole, kind: o.kind, x: o.x, y: o.y, auto: true }); }
  }
  return { pins: P, tees: T };
}

/** the distance from p to the polyline (tiles) */
function lineDist(p: Pt, line: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!, b = line[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t));
  }
  return d;
}

/** the hole of each untagged golf-surface area (0: none; an area with a hole tag keeps 0 here): a green takes the hole whose pin is on it, a tee
 *  the hole whose tee marker is on it, any other course surface the hole whose playing line passes nearest (within TAG_REACH) */
export function tagByHole(areas: HoleArea[], pins: Pin[], tees: TeeMark[], aims: AimPoint[]): number[] {
  const ns = Array.from(new Set(pins.map(p => p.hole))).sort((a, b) => a - b);
  const lines = ns.map(n => {
    const pin = pins.find(p => p.hole === n)!, t = tees.find(q => q.hole === n && q.kind === 'back') ?? tees.find(q => q.hole === n);
    return { n, line: t ? holeLine(t, aims.filter(a => a.hole === n), pin) : [pin, pin] };
  });
  return areas.map(a => {
    if (a.hole) return 0;
    const s = surfaceOfTex(a.tex); if (!s || s === 'other') return 0;
    if (s === 'green') { const p = pins.find(q => insidePoly(a.pts, q.x, q.y)); if (p) return p.hole; }
    if (s === 'tee') { const t = tees.find(q => insidePoly(a.pts, q.x, q.y)); if (t) return t.hole; }
    const c = interiorPoint(a.pts); let best = 0, bd = TAG_REACH;
    for (const l of lines) { const d = lineDist(c, l.line); if (d < bd) { bd = d; best = l.n; } }
    return best;
  });
}

/** one check of a hole (the inspector's checklist) */
export interface HoleCheck { label: string; ok: boolean }
/** a hole as the Course panel shows it: painted or not, par and lengths (metres; 0 without a pin and a tee), its checks and other warnings, all
 *  good or not; virtual: the markers were worked out for the view (a classic game has none) */
export interface HoleView { n: number; started: boolean; par: 3 | 4 | 5 | 0; lengthM: number; memberLengthM: number; checks: HoleCheck[]; warnings: string[]; ok: boolean; virtual: boolean }
/** the warnings deriveHoles gives that the checklist already shows */
const CHECKED = new Set(['No pin', 'No tee markers', 'The pin is not on a green', 'The back tee is not on a tee']);

/** holes 1..18 as the Course panel shows them; golf: the game's markers (null in a classic game: the automatic ones are worked out for the view) */
export function holeViews(areas: HoleArea[], golf: { pins: Pin[]; tees: TeeMark[]; aims: AimPoint[] } | null): HoleView[] {
  const virtual = !golf, mk = golf ? { pins: golf.pins, tees: golf.tees } : applyPlan([], [], markerPlan(areas, [], []));
  const course: CourseArea[] = areas.map((a, i) => ({ id: i + 1, surface: surfaceOfTex(a.tex) ?? 'other', pts: a.pts }));
  const derived = new Map(deriveHoles(course, mk.tees, mk.pins, golf?.aims ?? []).map(h => [h.n, h] as const));
  const out: HoleView[] = [];
  for (let n = 1; n <= HOLES; n++) {
    const started = areas.some(a => a.hole === n), h = derived.get(n), has = (s: GolfSurface) => outlines(areas, n, s).length > 0;
    const pin = mk.pins.find(p => p.hole === n), tee = mk.tees.filter(t => t.hole === n);
    const par = h && h.line.length ? h.par : 0;
    const checks: HoleCheck[] = [
      { label: 'Green painted', ok: has('green') },
      { label: 'Tee painted', ok: has('tee') },
      { label: par === 3 ? 'Fairway (a par 3 needs none)' : 'Fairway painted', ok: par === 3 || has('fairway') },
      { label: 'Pin on the green', ok: !!pin && outlines(areas, n, 'green').some(g => insidePoly(g, pin.x, pin.y)) },
      { label: 'Tee markers on the tee', ok: tee.length === 3 && tee.every(t => outlines(areas, n, 'tee').some(b => insidePoly(b, t.x, t.y))) },
    ];
    const warnings = (h?.warnings ?? []).filter(w => !CHECKED.has(w));
    out.push({ n, started: started || !!h, par, lengthM: par ? h!.lengthM : 0, memberLengthM: par ? h!.memberLengthM : 0, checks, warnings, ok: checks.every(c => c.ok) && !warnings.length, virtual });
  }
  return out;
}
