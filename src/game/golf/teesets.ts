// The four tee sets (T254, #736; the owner, 2026-10-28: "add multiple tees. YEllow, white, blue and red"): a hole has one to four tee boxes, each with a
// pair of markers in its colour and its own length and par. Built on the three marker kinds the game already had (types.ts TeeKind): back is the blue,
// middle the white, a new senior the yellow, forward the red. Here: the sets' names and colours, the set a golfer plays where a hole has fewer
// (nearestSet), the old saves' mapping (migrateTees), where "Add tee" lays a new box (addTeeSpot, teeBox), how Edit Hole Layout carries the markers
// with the tee and the green (layoutMarkers) and the warnings when a marker stands off its turf (markerWarnings), and the course rating's "for every
// golfer" term (teeSetsTerm). Pure TS, no DOM.
import { TILE_M, type GolfSurface, type Pin, type TeeKind, type TeeMark } from './types';

type Pt = { x: number; y: number };

/** the sets back to front: blue, white, yellow, red */
export const TEE_KINDS: readonly TeeKind[] = ['back', 'middle', 'senior', 'forward'];
/** a set's colour word, name, who plays it, and its markers' paint (the ball's fill and its darker rim) */
export interface TeeSetInfo { colour: 'blue' | 'white' | 'yellow' | 'red'; name: string; who: string; fill: string; rim: string }
/** the four sets (1985 America) */
export const TEE_SET: Readonly<Record<TeeKind, TeeSetInfo>> = {
  back: { colour: 'blue', name: 'Blue', who: 'the championship tees: the tournaments', fill: '#2f6fd6', rim: '#163a7c' },
  middle: { colour: 'white', name: 'White', who: "the members' tees", fill: '#f5f5ef', rim: '#7d7d76' },
  senior: { colour: 'yellow', name: 'Yellow', who: "forward men's tees: the seniors", fill: '#f2c71c', rim: '#86650a' },
  forward: { colour: 'red', name: 'Red', who: "the ladies' and beginners' tees", fill: '#d8392e', rim: '#781812' },
};
/** whether k is a tee set's kind */
export const isTeeKind = (k: unknown): k is TeeKind => k === 'back' || k === 'middle' || k === 'senior' || k === 'forward';
/** a set's place back to front (0 blue .. 3 red) */
export const teeRank = (k: TeeKind): number => TEE_KINDS.indexOf(k);
/** the set New hole lays (the white) */
export const DEFAULT_SET: TeeKind = 'middle';

/** the set a golfer who wants `want` plays where the hole has the sets `have`: his own, else the nearest one there is (a tie: the one further back
 *  for a blue or white golfer, further forward for a yellow or red one); null when the hole has no tee */
export function nearestSet(have: readonly TeeKind[], want: TeeKind): TeeKind | null {
  if (!have.length) return null;
  if (have.includes(want)) return want;
  const w = teeRank(want), fwd = w >= 2;
  let best: TeeKind | null = null, bd = Infinity;
  for (const k of have) {
    const d = Math.abs(teeRank(k) - w);
    if (d < bd || (d === bd && best !== null && (fwd ? teeRank(k) > teeRank(best) : teeRank(k) < teeRank(best)))) { best = k; bd = d; }
  }
  return best;
}

/** the sets hole n has, back to front */
export function setsOf(n: number, tees: readonly TeeMark[]): TeeKind[] { return TEE_KINDS.filter(k => tees.some(t => t.hole === n && t.kind === k)); }

/** an old save's tee markers (before T254): the back, middle and forward stand as the blue, white and red; a hole with a single tee marker becomes the
 *  white set. Nothing moves. A marker of an unknown kind or with a bad number is dropped, and a second marker of a hole's set too */
export function migrateTees(tees: readonly TeeMark[]): TeeMark[] {
  const ok = tees.filter(t => t && isTeeKind(t.kind) && Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.hole));
  const seen = new Set<string>(), mine = ok.filter(t => { const k = `${t.hole}:${t.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const count = new Map<number, number>(); for (const t of mine) count.set(t.hole, (count.get(t.hole) ?? 0) + 1);
  return mine.map(t => (count.get(t.hole) === 1 && t.kind !== DEFAULT_SET ? { ...t, kind: DEFAULT_SET } : { ...t }));
}

/** the gap between a new tee box and its neighbour set (m): a blue lays 25 m behind, a yellow 25 m ahead, a red 40 m ahead */
export const TEE_GAP_M = 25, RED_GAP_M = 40;
/** a new set never lays further up the line than this share of the first leg */
const MAX_LEG = 0.45;
/** "Add tee" (the hole card): where the set's new tee box goes on hole's line of play (tiles: the tee, the aims, the pin), and the heading down the
 *  line there. Behind the set nearest behind it in order, ahead of the one nearest ahead, halfway between when there are both; measured along the
 *  line's first leg from its start. Null when the hole has the set already, has no set or no line */
export function addTeeSpot(kind: TeeKind, sets: readonly { kind: TeeKind; x: number; y: number }[], line: readonly Pt[]): { at: Pt; dir: Pt } | null {
  if (sets.some(s => s.kind === kind) || !sets.length || line.length < 2) return null;
  const o = line[0]!, a = line[1]!, L = Math.hypot(a.x - o.x, a.y - o.y); if (L < 1e-6) return null;
  const d = { x: (a.x - o.x) / L, y: (a.y - o.y) / L }, along = (p: Pt) => (p.x - o.x) * d.x + (p.y - o.y) * d.y, r = teeRank(kind);
  type Set = { kind: TeeKind; x: number; y: number };
  let behind: Set | null = null, ahead: Set | null = null;
  for (const s of sets) {
    const k = teeRank(s.kind);
    if (k < r && (!behind || k > teeRank(behind.kind))) behind = s;
    if (k > r && (!ahead || k < teeRank(ahead.kind))) ahead = s;
  }
  const gap = (kind === 'forward' ? RED_GAP_M : TEE_GAP_M) / TILE_M;
  let s = behind && ahead ? (along(behind) + along(ahead)) / 2 : behind ? along(behind) + gap : along(ahead!) - TEE_GAP_M / TILE_M;
  s = Math.min(s, MAX_LEG * L);
  return { at: { x: o.x + d.x * s, y: o.y + d.y * s }, dir: d };
}

/** a new set's tee box, 14 x 8 m: a rounded strip (a stadium) along dir, centred on at; its outline x0 y0 x1 y1 ... (tiles) */
export const BOX_LEN_M = 14, BOX_WID_M = 8;
export function teeBox(at: Pt, dir: Pt): number[] {
  const r = BOX_WID_M / 2 / TILE_M, half = (BOX_LEN_M - BOX_WID_M) / 2 / TILE_M, ux = dir.x, uy = dir.y, nx = -uy, ny = ux, out: number[] = [], steps = 8;
  const f = { x: at.x + ux * half, y: at.y + uy * half }, b = { x: at.x - ux * half, y: at.y - uy * half };
  for (let i = 0; i <= steps; i++) { const t = -Math.PI / 2 + Math.PI * i / steps, c = Math.cos(t), sn = Math.sin(t); out.push(f.x + (ux * c + nx * sn) * r, f.y + (uy * c + ny * sn) * r); }
  for (let i = 0; i <= steps; i++) { const t = -Math.PI / 2 + Math.PI * i / steps, c = Math.cos(t), sn = Math.sin(t); out.push(b.x - (ux * c + nx * sn) * r, b.y - (uy * c + ny * sn) * r); }
  return out;
}

/** a plan's points Edit Hole Layout reads: the tee, the bends and the green (tiles) */
export interface LayoutPts { tee: Pt; green: Pt; bends: readonly Pt[] }
/** the heading of a plan's first leg (its tee toward the first bend, else the green) */
function heading(p: LayoutPts): Pt {
  const a = p.bends[0] ?? p.green, dx = a.x - p.tee.x, dy = a.y - p.tee.y, L = Math.hypot(dx, dy);
  return L > 1e-9 ? { x: dx / L, y: dy / L } : { x: 1, y: 0 };
}
/** Edit Hole Layout (T254): a built hole's markers after its plan went from base to plan, with no grass laid. The tee moved: every tee set goes with it,
 *  each keeping its place along and across the first leg (the sets stay in their order, turned with the leg). The green moved: the flag goes by the same
 *  step. A marker that moves is held (it stays where the player put it, off its turf or not); the others stay as they are. moved: which went */
export function layoutMarkers(base: LayoutPts, plan: LayoutPts, pin: Pin | null, tees: readonly TeeMark[]): { pin: Pin | null; tees: TeeMark[]; moved: { pin: boolean; tees: boolean } } {
  const teeMoved = Math.hypot(plan.tee.x - base.tee.x, plan.tee.y - base.tee.y) > 1e-6;
  const greenMoved = Math.hypot(plan.green.x - base.green.x, plan.green.y - base.green.y) > 1e-6;
  let outTees = tees.map(t => ({ ...t }));
  if (teeMoved) {
    const d0 = heading(base), d1 = heading(plan);
    outTees = tees.map(t => {
      const rx = t.x - base.tee.x, ry = t.y - base.tee.y, al = rx * d0.x + ry * d0.y, ac = -rx * d0.y + ry * d0.x;
      const x = plan.tee.x + al * d1.x - ac * d1.y, y = plan.tee.y + al * d1.y + ac * d1.x;
      const { auto: _a, ...rest } = t; void _a;
      return { ...rest, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, held: true };
    });
  }
  let outPin = pin ? { ...pin } : null;
  if (pin && greenMoved) { const { auto: _a, ...rest } = pin; void _a; outPin = { ...rest, x: pin.x + plan.green.x - base.green.x, y: pin.y + plan.green.y - base.green.y, held: true }; }
  return { pin: outPin, tees: outTees, moved: { pin: !!pin && greenMoved, tees: teeMoved && tees.length > 0 } };
}

/** the warning when the flag stands off the green */
export const FLAG_OFF = 'The flag is off the green: paint a green there';
/** the warning when a set's markers stand off the tee turf */
export const teeOff = (k: TeeKind) => `The ${TEE_SET[k].name.toLowerCase()} tee is off the tee turf: paint a tee there`;
/** the warnings for a hole's markers standing off their turf (surfAt: the surface at a point, null none): the flag off the green, each set off the tee */
export function markerWarnings(surfAt: (x: number, y: number) => GolfSurface | null, pin: Pt | null, tees: readonly { kind: TeeKind; x: number; y: number }[]): string[] {
  const out: string[] = [];
  if (pin && surfAt(pin.x, pin.y) !== 'green') out.push(FLAG_OFF);
  for (const k of TEE_KINDS) { const t = tees.find(q => q.kind === k); if (t && surfAt(t.x, t.y) !== 'tee') out.push(teeOff(k)); }
  return out;
}

/** the course rating's "for every golfer" term (T254): the tee sets a playable hole has on average, and the quality points they add: none for one set,
 *  one for two, two for three, three for all four (a little appeal: every golfer has a tee that suits him) */
export const EVERY_GOLFER_MAX = 3;
export function teeSetsTerm(holes: readonly { line: readonly unknown[]; sets?: readonly unknown[] }[]): { avg: number; points: number } {
  const play = holes.filter(h => h.line.length >= 2); if (!play.length) return { avg: 0, points: 0 };
  const avg = play.reduce((s, h) => s + Math.max(1, h.sets?.length ?? 1), 0) / play.length;
  return { avg, points: Math.min(EVERY_GOLFER_MAX, Math.max(0, Math.round(avg - 1))) };
}

/** T254: the share of everyday members who are seniors (the yellow tees) */
export const SENIOR_SHARE = 0.2;
/** an everyday golfer below this skill is a beginner (the red tees) */
export const BEGINNER_SKILL = 0.22;
/** the set an everyday golfer plays from (T208's members and visitors): the ladies and the beginners from the red, the seniors (u < SENIOR_SHARE, his own
 *  draw) from the yellow, everyone else from the white */
export function everydaySet(sex: 'm' | 'w', skill: number, u: number): TeeKind {
  if (sex === 'w' || skill < BEGINNER_SKILL) return 'forward';
  return u < SENIOR_SHARE ? 'senior' : 'middle';
}
