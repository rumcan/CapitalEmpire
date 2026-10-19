// The road builder's stress test (dev only; window.__roadFuzz(seed, steps) on the dev server). It drives the real tools through the Game,
// as clicks would (routes of every class and variant, 90/45 bends, Shift runs, Replace, the bulldozer, every junction type, Add lane, one-way
// reversal), at random points and at points picked next to the junctions, road ends and rings already there, in an empty box of the map.
// After every action the network is checked (netProblems); a problem that was not there before the action is a failure, logged with the
// actions that led to it. The owner, 2026-10-19: "put the road builder through its paces".
import { CLASSES, type Node, type Pt, type RoadNetwork, type Seg } from '../network';
import { checkGraph, type LaneGraph } from '../sim/lanes';
import { MIN_ANGLE, MIN_SEP } from '../snap';
import type { Game } from '../engine';

/** a seeded generator (mulberry32) */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function ptSeg(p: Pt, a: Pt, b: Pt) { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y); }
function segDist(a: Pt, b: Pt, c: Pt, d: Pt) {
  const cross = (o: Pt, p: Pt, q: Pt) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b));
}
const hwOf = (s: Seg) => s.cls.h + s.cls.walk;
const key = (p: Pt) => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`;
/** a point at the network's precision (0.001 tile), for the action log */
const exact = (p: Pt) => `${+p.x.toFixed(3)},${+p.y.toFixed(3)}`;
const sk = (s: Seg) => `${s.cls.id} ${key(s.a)}-${key(s.b)}`;
const ringReach = (n: Node) => (n.rb > 0 ? n.rb + Math.max(0, ...n.arms.map(a => a.walk)) : 0);

/** true when seg t is reached from seg s through the network within `reach` tiles of road (end to end): two such segs meet like a junction's arms */
function linked(s: Seg, t: Seg, reach: number): boolean {
  const best = new Map<Node, number>(), todo: [Node, number][] = [[s.a, 0], [s.b, 0]];
  while (todo.length) {
    const [n, d] = todo.pop()!; if ((best.get(n) ?? Infinity) <= d) continue; best.set(n, d);
    if (n === t.a || n === t.b) return true;
    for (const q of n.segs) if (q !== s && q !== t) { const m = q.a === n ? q.b : q.a, e = d + dist(n, m); if (e <= reach) todo.push([m, e]); }
  }
  return false;
}

/** what is wrong with the network inside box [x0, y0, x1, y1] (tiles): one string per problem, stable across calls (so a diff finds the new ones) */
export function netProblems(net: RoadNetwork, g: LaneGraph, box: [number, number, number, number]): string[] {
  const out = new Set<string>(), inBox = (p: Pt) => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3];
  const segs = [...net.segs].filter(s => inBox(s.a) || inBox(s.b)), nodes = new Set<Node>(); for (const s of segs) { nodes.add(s.a); nodes.add(s.b); }
  for (const s of segs) {
    const L = dist(s.a, s.b);
    if (!(L > 0)) out.add(`zero or NaN seg ${sk(s)}`); else if (L < 1) out.add(`seg under 1 tile ${sk(s)}`);
  }
  // pairs of segs: collinear overlap (a road on a road), or corridors overlapping away from a shared node
  for (const s of segs) for (const t of net.segsNear({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, dist(s.a, s.b) / 2 + 14)) {
    if (t === s || sk(t) < sk(s) && segs.includes(t)) continue;
    const shared = s.a === t.a || s.a === t.b || s.b === t.a || s.b === t.b;
    const ex = s.b.x - s.a.x, ey = s.b.y - s.a.y, fx = t.b.x - t.a.x, fy = t.b.y - t.a.y, Ls = Math.hypot(ex, ey), Lt = Math.hypot(fx, fy);
    const sin = Math.abs(ex * fy - ey * fx) / (Ls * Lt);
    if (sin < 0.02 && Math.max(ptSeg(t.a, s.a, s.b), ptSeg(t.b, s.a, s.b)) < 0.05) {
      const ta = ((t.a.x - s.a.x) * ex + (t.a.y - s.a.y) * ey) / Ls, tb = ((t.b.x - s.a.x) * ex + (t.b.y - s.a.y) * ey) / Ls;
      if (Math.min(Ls, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > 0.5) { out.add(`road on a road ${sk(s)} / ${sk(t)}`); continue; }
    }
    if (shared) continue;
    const d = segDist(s.a, s.b, t.a, t.b), need = hwOf(s) + hwOf(t);
    // a crossing without a node (d 0) or corridors overlapping by more than a tile (side by side, or an end in a corridor)
    if (d < 1e-6) out.add(`roads cross without a junction ${sk(s)} / ${sk(t)}`);
    else if (d < need - 1) {
      // two arms of junctions next to each other overlap near those junctions: only flag it when neither touches a node the other's node shares a seg with
      // (pieces of roads joined through a short chain of segs, as round a corner split into a tunnel mouth and a ground piece, meet like arms)
      if (!linked(s, t, need)) out.add(`corridors overlap (${d.toFixed(1)} < ${need.toFixed(1)}) ${sk(s)} / ${sk(t)}`);
    }
  }
  for (const n of nodes) {
    if (!inBox(n)) continue;
    // sharp joins
    for (let i = 0; i < n.segs.length; i++) for (let j = i + 1; j < n.segs.length; j++) {
      const o1 = n.segs[i]!.a === n ? n.segs[i]!.b : n.segs[i]!.a, o2 = n.segs[j]!.a === n ? n.segs[j]!.b : n.segs[j]!.a;
      const c = ((o1.x - n.x) * (o2.x - n.x) + (o1.y - n.y) * (o2.y - n.y)) / (dist(o1, n) * dist(o2, n));
      if (c > Math.cos((MIN_ANGLE - 1) * Math.PI / 180)) out.add(`sharp join at ${key(n)} (${(Math.acos(Math.min(1, c)) * 180 / Math.PI).toFixed(0)}°)`);
    }
    // junctions too close together
    if (n.segs.length >= 3) for (const s of net.segsNear(n, MIN_SEP)) for (const m of [s.a, s.b]) if (m !== n && m.segs.length >= 3 && dist(m, n) < MIN_SEP - 0.05 && key(n) < key(m)) out.add(`junctions ${dist(m, n).toFixed(1)} apart at ${key(n)} and ${key(m)}`);
    // rings: arms shorter than the ring, other nodes or roads inside its circle
    const r = ringReach(n);
    if (n.type === 'roundabout' && r > 0) {
      for (const a of n.arms) if (a.len < n.rb + 2 - 1e-6) out.add(`ring arm shorter than the ring at ${key(n)} (${a.len.toFixed(1)} < ${(n.rb + 2).toFixed(1)})`);
      for (const s of net.segsNear(n, r + 8)) {
        for (const m of [s.a, s.b]) if (m !== n && dist(m, n) < r - 0.05) out.add(`node ${key(m)} inside the ring at ${key(n)}`);
        // (a road from an arm's far node only keeps its centre line off the circle: its corridor meets the arm's there, as checkLegs judges it)
        const nextTo = n.arms.some(a => a.other === s.a || a.other === s.b);
        if (s.a !== n && s.b !== n && ptSeg(n, s.a, s.b) < r + (nextTo ? 0 : hwOf(s)) - 1) out.add(`road ${sk(s)} into the ring at ${key(n)}`);
      }
    }
  }
  for (const p of checkGraph(g)) out.add(`lane graph: ${p}`);
  return [...out].sort();
}

/** the Game's private tool methods the stress test calls (the same ones the pointer and keys reach) */
interface Tools {
  net: RoadNetwork; lanes: LaneGraph; toasts: { text: string }[]; keys: Set<string>; route: Pt[]; roadClass: string; bendMode: 90 | 45; replaceMode: boolean;
  setTool(t: string): void; cancelRoute(): void; finishRoute(): void; screen(x: number, y: number): Pt; dpr: number;
  roadClick(mx: number, my: number): void; bulldozeAt(mx: number, my: number, first: boolean): void; installType(n: Node, t: string, rl: 1 | 2 | 3): boolean;
  laneUpdate(t: Pt | null): void; laneClick(): void; laneReverse(mx: number, my: number): void; setFlag(n: Node, k: 'wide' | 'tl', on: boolean): void; jumpTo(x: number, y: number): void;
  edit: { removePiece(sel: { seg: Seg; p0: Pt; p1: Pt }): void }; commitNetwork(): void;
}

export interface FuzzReport { box: [number, number, number, number]; steps: number; built: number; refused: Record<string, number>; failures: { step: number; action: string; problems: string[]; log: string[] }[] }

/** removes every road with an end in the box (the stress test starts again clean after a failure) */
function clearBox(G: Tools, box: [number, number, number, number]) {
  const inBox = (p: Pt) => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3];
  for (const s of [...G.net.segs]) if (inBox(s.a) || inBox(s.b)) G.edit.removePiece({ seg: s, p0: s.a, p1: s.b });
  G.commitNetwork();
}

/** runs `steps` random tool actions with seed in an empty box of the map (or around `at`); stops after `maxFail` failing actions */
export function roadFuzz(game: Game, seed = 1, steps = 300, opts: { at?: Pt; half?: number; maxFail?: number } = {}): FuzzReport {
  const G = game as unknown as Tools, R = rng(seed), half = opts.half ?? 110, pick = <T>(a: T[]): T => a[Math.floor(R() * a.length)]!;
  // the box: `at`, else the first spot with no road within it
  let c = opts.at ?? null;
  for (let k = 0; !c && k < 400; k++) { const p = { x: 200 + Math.floor(R() * 1648), y: 200 + Math.floor(R() * 1648) }; if (![...G.net.segsNear(p, half + 20)].length) c = p; }
  if (!c) throw new Error('no empty box on the map');
  const box: [number, number, number, number] = [c.x - half, c.y - half, c.x + half, c.y + half];
  G.jumpTo(c.x, c.y);
  const click = (p: Pt, f: (mx: number, my: number) => void) => { const s = G.screen(p.x, p.y); f(s.x / G.dpr, s.y / G.dpr); };
  const nodesIn = () => { const ns = new Set<Node>(); for (const s of G.net.segsNear(c!, half)) for (const n of [s.a, s.b]) if (n.x >= box[0] && n.x <= box[2] && n.y >= box[1] && n.y <= box[3]) ns.add(n); return [...ns]; };
  const segsIn = () => [...G.net.segsNear(c!, half)];
  const grid = (): Pt => ({ x: Math.round(box[0] + 10 + R() * (2 * half - 20)), y: Math.round(box[1] + 10 + R() * (2 * half - 20)) });
  // a point to click: on the grid, near a node (a junction, an end, a ring), on a road, or just off one
  const point = (): Pt => {
    const r = R(), ns = nodesIn(), ss = segsIn();
    if (r < 0.3 || !ss.length || !ns.length) return grid();
    if (r < 0.6) { const n = pick(ns); const d = pick([0, 0, 2, 5, 9, 12, 16, 20, 30]), a = R() * Math.PI * 2; return { x: Math.round(n.x + Math.cos(a) * d), y: Math.round(n.y + Math.sin(a) * d) }; }
    const s = pick(ss), t = R(), o = pick([0, 0, 1, 3, 6]) * (R() < 0.5 ? -1 : 1), dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy) || 1;
    return { x: s.a.x + dx * t - dy / L * o, y: s.a.y + dy * t + dx / L * o };
  };
  const classes = CLASSES.map(x => x.id);
  const report: FuzzReport = { box, steps, built: 0, refused: {}, failures: [] }, log: string[] = [];
  let before = netProblems(G.net, G.lanes, box);
  for (let step = 0; step < steps && report.failures.length < (opts.maxFail ?? 5); step++) {
    G.toasts.length = 0;
    const r = R(); let action = '';
    if (r < 0.55) {
      // a route of 2 to 4 clicks
      G.setTool('road'); G.cancelRoute(); G.roadClass = pick(classes); G.bendMode = R() < 0.5 ? 90 : 45; G.replaceMode = R() < 0.35;
      const shift = R() < 0.2; if (shift) G.keys.add('Shift'); else G.keys.delete('Shift');
      const pts: Pt[] = []; for (let k = 0, n = 2 + Math.floor(R() * 3); k < n; k++) pts.push(point());
      for (const p of pts) click(p, (x, y) => G.roadClick(x, y));
      const got = G.route.map(exact); G.finishRoute(); G.keys.delete('Shift');
      action = `route ${G.roadClass} bend ${G.bendMode}${shift ? ' shift' : ''}${G.replaceMode ? ' replace' : ''} clicks ${pts.map(exact).join(' ')} -> route ${got.join(' ')}`;
    } else if (r < 0.7) {
      G.setTool('bulldoze'); const p = pick([point(), point()]); click(p, (x, y) => G.bulldozeAt(x, y, true)); action = `bulldoze ${exact(p)}`;
    } else if (r < 0.88) {
      const ns = nodesIn().filter(n => n.segs.length >= 2); if (!ns.length) { step--; continue; }
      const n = pick(ns), t = pick(['plain', 'stop', 'mini', 'signal', 'roundabout', 'roundabout', 'roundabout']), rl = (1 + Math.floor(R() * 3)) as 1 | 2 | 3;
      G.setTool('junction'); G.installType(n, t, rl); action = `junction ${exact(n)} -> ${t}${t === 'roundabout' ? ` ${rl}` : ''}`;
      if (R() < 0.2) { const m = G.net.nodeAt(n); if (m) { const k = R() < 0.5 ? 'wide' : 'tl'; G.setFlag(m, k, true); action += ` + ${k}`; } }
    } else {
      G.setTool('lane'); const p = point();
      if (R() < 0.75) { G.laneUpdate(p); G.laneClick(); action = `add lane ${exact(p)}`; } else { click(p, (x, y) => G.laneReverse(x, y)); action = `reverse ${exact(p)}`; }
    }
    const said = G.toasts.map(t => t.text);
    if (said.some(t => /^Built/.test(t))) report.built++;
    for (const t of said) if (!/^(Built|Added|Removed|Roundabout|Reversed|Bought)/.test(t) && !/installed/.test(t)) report.refused[t] = (report.refused[t] ?? 0) + 1;
    log.push(`${step}: ${action}${said.length ? ` [${said.join(' | ')}]` : ''}`);
    const now = netProblems(G.net, G.lanes, box), fresh = now.filter(p => !before.includes(p));
    if (fresh.length) {
      // the whole history since the box was last cleared, so the failure can be replayed; then the box starts again clean
      report.failures.push({ step, action, problems: fresh, log: log.slice() });
      clearBox(G, box); log.length = 0; before = netProblems(G.net, G.lanes, box);
    } else before = now;
  }
  // the box is left empty for the next run (the test's roads would fill the map otherwise)
  clearBox(G, box); G.setTool('select');
  return report;
}

/** replays a failure's action log (FuzzReport.failures[k].log) on the live game, action by action, after clearing its box; returns the problems
 *  each action left that were not there before it (the same check as roadFuzz). `upTo` stops before that log index, to look at the network there */
export function roadReplay(game: Game, box: [number, number, number, number], log: string[], upTo = log.length): { step: string; problems: string[] }[] {
  const G = game as unknown as Tools, out: { step: string; problems: string[] }[] = [], pt = (s: string): Pt => { const [x, y] = s.split(',').map(Number); return { x: x!, y: y! }; };
  const click = (p: Pt, f: (mx: number, my: number) => void) => { const s = G.screen(p.x, p.y); f(s.x / G.dpr, s.y / G.dpr); };
  clearBox(G, box); G.jumpTo((box[0] + box[2]) / 2, (box[1] + box[3]) / 2);
  let before = netProblems(G.net, G.lanes, box);
  for (const line of log.slice(0, upTo)) {
    const a = line.replace(/^\d+: /, '').replace(/ \[.*$/, ''), w = a.split(' ');
    if (w[0] === 'route') {
      G.setTool('road'); G.cancelRoute(); G.roadClass = w[1]!; G.bendMode = +w[3]! as 90 | 45; G.replaceMode = w.includes('replace');
      if (w.includes('shift')) G.keys.add('Shift'); else G.keys.delete('Shift');
      const clicks = a.split(' clicks ')[1]!.split(' -> ')[0]!.split(' ');
      for (const c of clicks) click(pt(c), (x, y) => G.roadClick(x, y));
      G.finishRoute(); G.keys.delete('Shift');
    } else if (w[0] === 'bulldoze') { G.setTool('bulldoze'); click(pt(w[1]!), (x, y) => G.bulldozeAt(x, y, true)); }
    else if (w[0] === 'junction') {
      const n = G.net.nodeAt(pt(w[1]!)); if (n) { G.setTool('junction'); G.installType(n, w[3]!, (+w[4]! || 1) as 1 | 2 | 3); const k = a.split(' + ')[1]; if (k) { const m = G.net.nodeAt(n); if (m) G.setFlag(m, k as 'wide' | 'tl', true); } }
    } else if (w[0] === 'add') { G.setTool('lane'); G.laneUpdate(pt(w[2]!)); G.laneClick(); }
    else if (w[0] === 'reverse') { G.setTool('lane'); click(pt(w[1]!), (x, y) => G.laneReverse(x, y)); }
    const now = netProblems(G.net, G.lanes, box);
    out.push({ step: line, problems: now.filter(p => !before.includes(p)) }); before = now;
  }
  G.setTool('select');
  return out;
}

/** the painted surface (asphalt, walk, median, island) at tile point (x, y) near box b: true if any road or junction feature covers it */
function pavedAt(net: RoadNetwork, ctx: CanvasRenderingContext2D, fx: { walkF: { kind: string; path: Path2D; w: number; cap: string; bbox: number[] }[]; asphF: unknown[]; medianF: unknown[]; islandF: unknown[] }[], x: number, y: number): boolean {
  for (const f of fx) for (const list of [f.asphF, f.walkF, f.medianF, f.islandF] as { kind: string; path: Path2D; w: number; cap: string; bbox: number[] }[][]) for (const t of list) {
    const b = t.bbox; if (x < b[0]! || x > b[2]! || y < b[1]! || y > b[3]!) continue;
    if (t.kind === 'stroke') { ctx.lineWidth = t.w; ctx.lineCap = t.cap as CanvasLineCap; if (ctx.isPointInStroke(t.path, x, y)) return true; }
    else if (ctx.isPointInPath(t.path, x, y)) return true;
  }
  void net; return false;
}

/** the bare spots (grass) almost enclosed by road surface around node n: sample points every half tile within r of it; an unpaved one with
 *  surface within 3 tiles in at least 7 of 8 directions is a hole (a missing wedge, a notch). Returns their count and one sample */
export function junctionHoles(net: RoadNetwork, n: Node, r: number): { holes: number; at: Pt | null } {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const N = net as unknown as { nodeFx: Map<Node, { bbox: number[] }>; routeFx: Map<unknown, { bbox: number[] }> };
  const box = [n.x - r - 4, n.y - r - 4, n.x + r + 4, n.y + r + 4];
  const fx = [...N.nodeFx.values(), ...N.routeFx.values()].filter(f => f.bbox[0]! <= box[2]! && f.bbox[2]! >= box[0]! && f.bbox[1]! <= box[3]! && f.bbox[3]! >= box[1]!) as unknown as Parameters<typeof pavedAt>[2];
  const memo = new Map<string, boolean>(), paved = (x: number, y: number) => { const k = `${x},${y}`; let v = memo.get(k); if (v === undefined) memo.set(k, (v = pavedAt(net, ctx, fx, x, y))); return v; };
  let holes = 0, at: Pt | null = null;
  for (let dx = -r; dx <= r; dx += 0.5) for (let dy = -r; dy <= r; dy += 0.5) {
    const x = n.x + dx, y = n.y + dy; if (paved(x, y)) continue;
    let hit = 0;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a); for (let s = 0.5; s <= 3; s += 0.5) if (paved(Math.round((x + ux * s) * 2) / 2, Math.round((y + uy * s) * 2) / 2)) { hit++; break; } }
    if (hit >= 7) { holes++; at ??= { x, y }; }
  }
  return { holes, at };
}

/** builds junction after junction of every main road with every side road (T at several angles, a crossing, a main road ending under a V or
 *  across a road, a bend with a side road) in an empty box, one at a time, and reports those with holes (junctionHoles). The owner,
 *  2026-10-19: "make a bunch of weird connections and check all of them" */
export function junctionGallery(game: Game, opts: { mains?: string[]; sides?: string[]; at?: Pt } = {}): { cases: number; bad: { name: string; holes: number; at: Pt | null }[] } {
  const G = game as unknown as Tools & { edit: { addLegs(legs: { a: Pt; b: Pt }[], cls: unknown, style: number): void } };
  const C = opts.at ?? (() => { for (let k = 0; k < 400; k++) { const p = { x: 300 + Math.floor(Math.random() * 1448), y: 300 + Math.floor(Math.random() * 1448) }; if (![...G.net.segsNear(p, 140)].length) return p; } throw new Error('no empty box'); })();
  const box: [number, number, number, number] = [C.x - 120, C.y - 120, C.x + 120, C.y + 120];
  const cls = (id: string) => CLASSES.find(c => c.id === id)!;
  const mains = opts.mains ?? ['arterial', 'boulevard', 'six', 'grand', 'divided', 'six.ow', 'arterial.ow', 'road', 'avenue'];
  const sides = opts.sides ?? ['gravel', 'lane', 'street', 'road', 'avenue', 'arterial'];
  const L = 60, deg = Math.PI / 180, out: { name: string; holes: number; at: Pt | null }[] = []; let cases = 0;
  const ray = (a: number) => ({ x: C.x + Math.round(Math.cos(a) * L), y: C.y + Math.round(Math.sin(a) * L) });
  for (const m of mains) for (const s of sides) {
    const shapes: [string, { a: Pt; b: Pt }[], { a: Pt; b: Pt }[]][] = [];
    for (const th of [30, 45, 60, 90, 120, 135, 150]) shapes.push([`T ${th}°`, [{ a: ray(Math.PI), b: C }, { a: C, b: ray(0) }], [{ a: C, b: ray(-th * deg) }]]);
    for (const th of [45, 60, 90]) shapes.push([`end under a V ±${th}°`, [{ a: ray(90 * deg), b: C }], [{ a: ray(-90 * deg - th * deg), b: C }, { a: C, b: ray(-90 * deg + th * deg) }]]);
    for (const th of [90, 45]) shapes.push([`end across a road at ${th}°`, [{ a: ray(90 * deg), b: C }], [{ a: ray(-90 * deg - th * deg), b: C }, { a: C, b: ray(90 * deg - th * deg) }]]);
    for (const th of [90, 45]) shapes.push([`crossing at ${th}°`, [{ a: ray(Math.PI), b: C }, { a: C, b: ray(0) }], [{ a: ray(th * deg), b: C }, { a: C, b: ray(th * deg + Math.PI) }]]);
    for (const th of [45, 90, 135]) shapes.push([`bend ${th}° with a side road`, [{ a: ray(Math.PI), b: C }, { a: C, b: ray(Math.PI - (180 - th) * deg) }], [{ a: C, b: ray(-60 * deg) }]]);
    for (const [name, ml, sl] of shapes) {
      cases++;
      G.edit.addLegs(ml, cls(m), 0); G.edit.addLegs(sl, cls(s), 0); G.commitNetwork();
      const n = G.net.nodeAt(C);
      if (n) { const r = Math.max(...n.arms.map(a => a.h + a.walk)) * 2 + 8, h = junctionHoles(G.net, n, r); if (h.holes) out.push({ name: `${m} + ${s}: ${name}`, holes: h.holes, at: h.at }); }
      else out.push({ name: `${m} + ${s}: ${name} (no node)`, holes: -1, at: null });
      clearBox(G, box);
    }
  }
  return { cases, bad: out };
}
