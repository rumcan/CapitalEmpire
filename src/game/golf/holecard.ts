// The hole card (plan P23-UX 6.2 P2-4, T174): what a selected hole shows, from data the game already has (D7.3): its number and par, its length
// from each tee marker, its grow-in (the hole's and each surface's), its surfaces' areas, and its checks and warnings, each with the Fix that arms
// the tool that mends it; the note Delete's confirm states; and the renumbering of two holes (D4.12: badges dragged), which swaps every place a
// hole number lives so the routing and the walk check follow. No quality score, golfers or fees, and no Move. Pure TS, no DOM.
import { holeLine, lineLength, parFromLength, validateMarkerPlacement } from './holes';
import { FLAG_OFF, TEE_KINDS } from './teesets';
import type { HoleView } from './holeview';
import { TILE_M, type AimPoint, type CourseArea, type GolfSurface, type Pin, type TeeMark } from './types';
import { MONTH_BASE, SURF_SURFACE } from '../ext/course-grid/areas';
import { SURF_GROW_MONTHS } from '../ext/course-fx';
import type { Grid } from '../ext/course-grid';

/** a surface of the hole: its area (m², a cell is 1 m²) and, while some of it grows in, the game month it is all grown in (null: grown in) */
export interface HoleCardArea { surface: GolfSurface; m2: number; ready: number | null }
/** what a Fix does: paint a missing surface with the brush; put a marker back on its green or tee (the marker in hand); open the hole in New
 *  hole's editor; or nothing to arm (the warning says what to do) */
export type HoleFix = { kind: 'brush'; surface: 'green' | 'tee' | 'fairway' } | { kind: 'marker'; marker: 'pin' | 'back' } | { kind: 'edit' };
/** one line of the card's checks: a check (ok or not) or a warning (never ok); its Fix when it is not ok and something mends it */
export interface HoleCardCheck { id: string; text: string; ok: boolean; warn: boolean; fix: HoleFix | null }
/** the hole card's facts */
export interface HoleCardView {
  n: number; par: 3 | 4 | 5 | 0;
  /** the length from each tee set there is (m) and its par, back (blue) first */
  tees: { kind: TeeMark['kind']; m: number; par: 3 | 4 | 5 }[];
  /** T254: the sets "Add tee" can lay (the hole has a line and not that set), back to front */
  addable: TeeMark['kind'][];
  /** the hole's grow-in month (the game month all of it is grown in; null: grown in) */
  ready: number | null;
  /** its surfaces, the biggest first */
  areas: HoleCardArea[];
  checks: HoleCardCheck[];
  /** the hole has New hole's plan: Edit hole and Delete work on it (a hole painted by hand has none) */
  planned: boolean;
}

/** the draw order the card lists surfaces in when two have the same area (the playing ones first) */
const ORDER: GolfSurface[] = ['green', 'tee', 'fairway', 'bunker', 'water', 'waste', 'fescue', 'longGrass', 'rough'];

/** hole n's surfaces in the course grid: each surface's cells (1 m² each) and, while some of them grow in, the latest month they are grown in
 *  (the game month scale: Game.holesGrowing's, shift months earlier: the grow cards). now: the grow-in month (Engine.growMonth) */
export function holeAreas(g: Grid | null, n: number, now: number, shift = 0): HoleCardArea[] {
  if (!g || n < 1) return [];
  const m2 = new Map<GolfSurface, number>(), ready = new Map<GolfSurface, number>(), t = now + MONTH_BASE, { surf, hole, month } = g;
  for (let i = 0; i < surf.length; i++) {
    if (hole[i] !== n) continue;
    const s = SURF_SURFACE[surf[i]!]; if (!s) continue;
    m2.set(s, (m2.get(s) ?? 0) + 1);
    const mo = month[i]!, k = SURF_GROW_MONTHS[surf[i]!] ?? 0;
    if (mo && k > 0 && mo + k > t && mo + k > (ready.get(s) ?? -1)) ready.set(s, mo + k);
  }
  return [...m2].map(([surface, a]) => ({ surface, m2: a, ready: ready.has(surface) ? ready.get(surface)! - MONTH_BASE - shift : null }))
    .sort((a, b) => b.m2 - a.m2 || ORDER.indexOf(a.surface) - ORDER.indexOf(b.surface));
}

/** the length of hole n from each of its tee sets to its pin (m) with that set's par, back (blue) first; none without a pin */
export function teeLengths(n: number, pins: readonly Pin[], tees: readonly TeeMark[], aims: readonly AimPoint[]): { kind: TeeMark['kind']; m: number; par: 3 | 4 | 5 }[] {
  const pin = pins.find(p => p.hole === n); if (!pin) return [];
  const a = aims.filter(q => q.hole === n);
  return TEE_KINDS.flatMap(kind => {
    const t = tees.find(q => q.hole === n && q.kind === kind); if (!t) return [];
    const m = Math.round(lineLength(holeLine(t, a, pin)) * TILE_M);
    return [{ kind, m, par: parFromLength(m) }];
  });
}

/** the walk from hole n's green (its pin) to the next number's first tee (m), or null when either is missing */
export function walkToNext(n: number, pins: readonly Pin[], tees: readonly TeeMark[]): number | null {
  const pin = pins.find(p => p.hole === n), next = TEE_KINDS.map(k => tees.find(t => t.hole === n + 1 && t.kind === k)).find(t => t);
  return pin && next ? Math.round(Math.hypot(pin.x - next.x, pin.y - next.y) * TILE_M) : null;
}

/** the Fix of each of the hole view's checks (holeview.ts holeViews' labels) */
const CHECK_FIX: Readonly<Record<string, HoleFix>> = {
  'Green painted': { kind: 'brush', surface: 'green' },
  'Tee painted': { kind: 'brush', surface: 'tee' },
  'Fairway painted': { kind: 'brush', surface: 'fairway' },
  'Pin on the green': { kind: 'marker', marker: 'pin' },
  'Tee markers on the tee': { kind: 'marker', marker: 'back' },
  // T254: a marker Edit Hole Layout left off its turf: paint the turf under it
  [FLAG_OFF]: { kind: 'brush', surface: 'green' },
};
/** the Fix of a check's label (T254: "The red tee is off the tee turf: …" paints a tee) */
const fixOf = (label: string): HoleFix | null => CHECK_FIX[label] ?? (/ tee is off the tee turf/.test(label) ? { kind: 'brush', surface: 'tee' } : null);

/** the hole card for hole view v: the markers, the hole's surfaces (holeAreas), its grow-in month and whether it has New hole's plan. The
 *  warnings are deriveHoles' (holes.ts), said with their numbers: the long walk with its metres, too close with the hole's number; the ones a
 *  new line mends carry Edit hole as their Fix when the hole has a plan */
export function holeCard(v: HoleView, o: { pins: readonly Pin[]; tees: readonly TeeMark[]; aims: readonly AimPoint[]; areas: HoleCardArea[]; ready: number | null; planned: boolean }): HoleCardView {
  const checks: HoleCardCheck[] = v.checks.map((c, i) => ({ id: `check-${i}`, text: c.label, ok: c.ok, warn: false, fix: c.ok ? null : fixOf(c.label) }));
  v.warnings.forEach((w, i) => {
    let text = w, fix: HoleFix | null = o.planned ? { kind: 'edit' } : null;
    if (w === 'Long walk to the next tee') { const m = walkToNext(v.n, o.pins, o.tees); text = m === null ? w : `A ${m} m walk to hole ${v.n + 1}'s tee`; fix = null; }
    else { const close = /^Too close to hole (\d+)$/.exec(w); if (close) text = `Too close to hole ${close[1]}: golfers there are in range`; }
    checks.push({ id: `warn-${i}`, text, ok: false, warn: true, fix });
  });
  const tees = teeLengths(v.n, o.pins, o.tees, o.aims), addable = tees.length ? TEE_KINDS.filter(k => !tees.some(t => t.kind === k)) : [];
  return { n: v.n, par: v.par, tees, addable, ready: o.ready, areas: o.areas, checks, planned: o.planned };
}

/** what Delete's confirm states for hole n (T174; T256: the hole owns its paint): its choice, all its cells (touch-ups included) back to the
 *  land with its frame trees, or kept as the property's paint; its plan, looks and markers go either way, and nothing is refunded (course
 *  work is not refunded, as Erase) */
export function deleteNote(c: Pick<HoleCardView, 'n' | 'areas'>): { refund: number; m2: number; text: string } {
  const m2 = c.areas.reduce((s, a) => s + a.m2, 0);
  return { refund: 0, m2, text: `All ${m2.toLocaleString('en-US')} m² of hole ${c.n}, touch-ups included: "Delete hole and its grass" takes it back to the land with its frame trees; "Keep the grass" leaves it as your property's paint. Its plan, its looks and its pin and tee markers go. No refund: course work is not refunded.` };
}

/** renumbering (D4.12): hole a and hole b trade numbers wherever a number lives. Returns the new values; the grid's hole layer is changed in
 *  place (and the indices of the cells changed are returned, for the redraw and the save). Plans and markers keep their own shapes */
export function swapHoleNumbers<P extends { hole: number }, T extends { hole: number }, A extends { hole: number }, L extends { hole: number }>(
  a: number, b: number, d: { grid: Grid | null; pins: readonly P[]; tees: readonly T[]; aims: readonly A[]; plans: readonly L[]; areas?: { hole?: number }[] },
): { pins: P[]; tees: T[]; aims: A[]; plans: L[]; cells: number[] } {
  const sw = (h: number) => (h === a ? b : h === b ? a : h);
  const cells: number[] = [];
  if (d.grid) { const h = d.grid.hole; for (let i = 0; i < h.length; i++) if (h[i] === a || h[i] === b) { h[i] = sw(h[i]!); cells.push(i); } }
  for (const ar of d.areas ?? []) if (ar.hole === a || ar.hole === b) ar.hole = sw(ar.hole);
  const re = <X extends { hole: number }>(xs: readonly X[]) => xs.map(x => (x.hole === a || x.hole === b ? { ...x, hole: sw(x.hole) } : x));
  return { pins: re(d.pins), tees: re(d.tees), aims: re(d.aims), plans: re(d.plans).sort((p, q) => p.hole - q.hole), cells };
}

/** a pin or tee marker dragged to (x, y) (T174, P23 D2.5): on its surface (a pin on a green, a tee marker on a tee: holes.ts
 *  validateMarkerPlacement) the markers with it moved there, else the reason it stays. It reads and returns only the markers: no plan is
 *  re-made and nothing is charged */
export function markerMove(m: { pins: readonly Pin[]; tees: readonly TeeMark[] }, areas: CourseArea[], hole: number, kind: 'pin' | TeeMark['kind'], x: number, y: number):
  { ok: true; pins: Pin[]; tees: TeeMark[] } | { ok: false; reason: string } {
  const v = validateMarkerPlacement(areas, kind, x, y);
  if (!v.ok) return { ok: false, reason: v.reason ?? 'Not there' };
  if (kind === 'pin') {
    const has = m.pins.some(p => p.hole === hole);
    return { ok: true, pins: has ? m.pins.map(p => (p.hole === hole ? { ...p, x, y } : p)) : [...m.pins, { hole, x, y }], tees: [...m.tees] };
  }
  const has = m.tees.some(t => t.hole === hole && t.kind === kind);
  return { ok: true, pins: [...m.pins], tees: has ? m.tees.map(t => (t.hole === hole && t.kind === kind ? { ...t, x, y } : t)) : [...m.tees, { hole, kind, x, y }] };
}
