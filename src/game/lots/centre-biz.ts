// T298 (#883; the owner, 2026-11-02: "build small shopping center with multiple commercial stores circling a nice parking lot with lights and islands
// with plants etc."): the shopping centre's town side, pure and free of the library (the worker's town reads it). A centre is one commercial lot
// (the anchor) widened along its street over its empty neighbours on the same street line (the parts), so it is a larger lot than the town cuts:
// the town's lots are 10 to 26 tiles wide and at most 18 deep, too small for shops round a car park.
//
// What the town stores (LotState.biz, saved, sent and composed as it is, so no new field crosses the worker):
//   anchor: '@<left>,<right>,<depth>|<shop>+<shop>+...': the tiles the lot is widened by to the left and right along its own u, the centre's depth
//           (the shallowest part's), and its shops (SHOP_PALETTE ids, each counted against T295's cap like a shop lot's business);
//   part:   '^<anchor key>': an empty lot the centre covers (the town grows nothing on it; compose draws nothing on it).
import { roadOf, type Pt } from './preset-frame';

/** the least frontage (tiles) a centre takes, the most it spans, the town tier it needs (town: the town's shops), the built lots a grown town has before it
 *  builds one */
export const CENTRE_W = 24, CENTRE_WMAX = 44, CENTRE_TIER = 2, CENTRE_BUILT = 8;
/** a centre's least depth (tiles): one row of bays on its aisle and shops 3 tiles deep (centre.ts), on a screen-straight street 4.5 (its shops' pictures
 *  stand on the diagonal: a footprint as deep as it is wide). The town's lots on a closed block are 10 to 12 deep, on an open street 15 or more */
export const CENTRE_D = 11, CENTRE_D_STRAIGHT = 12.5;
/** the least depth of a centre on a lot whose away vector is n */
export const centreDepth = (n: Pt): number => (roadOf(n) % 2 ? CENTRE_D_STRAIGHT : CENTRE_D);
/** the frontage from which a centre lays one side wing (an L) and two (a U): shops at the car park's side, facing across it */
export const L_W = 28, U_W = 34;
/** the gap (tiles) two lots side by side may leave between them and still join (the lattice lots meet within it; the block lots share their lines) */
const JOIN = 1.0;

/** a centre's span: the tiles its lot is widened by to the left (l) and right (r) along the lot's u, its depth (d) */
export interface Span { l: number; r: number; d: number }
/** a centre's business: its span and its shops (SHOP_PALETTE ids) */
export interface Centre extends Span { shops: string[] }

const num = (v: number) => String(+v.toFixed(2));
/** a centre's business string (see the file head) */
export function centreBiz(c: Centre): string { return `@${num(c.l)},${num(c.r)},${num(c.d)}|${c.shops.join('+')}`; }
/** a centre from its business string, or null for any other business */
export function centreOf(biz: string | undefined): Centre | null {
  if (!biz || biz[0] !== '@') return null;
  const bar = biz.indexOf('|'); if (bar < 0) return null;
  const [l, r, d] = biz.slice(1, bar).split(',').map(Number);
  if (!Number.isFinite(l) || !Number.isFinite(r) || !Number.isFinite(d)) return null;
  return { l: l!, r: r!, d: d!, shops: biz.slice(bar + 1).split('+').filter(Boolean) };
}
/** whether a business is a centre's (its anchor lot) */
export const isCentre = (biz: string | undefined): boolean => !!biz && biz[0] === '@';
/** the anchor key of a centre's part, or null for any other business */
export const partOf = (biz: string | undefined): string | null => (biz && biz[0] === '^' ? biz.slice(1) : null);
/** a part's business string */
export const partBiz = (anchor: string): string => `^${anchor}`;
/** the businesses a lot's business counts as against the cap (T295 #2): a centre's shops, none for a part, else the business itself */
export function bizNames(biz: string | undefined): string[] {
  if (biz === undefined) return [];
  if (biz[0] === '^') return [];
  return centreOf(biz)?.shops ?? [biz];
}

/** the wings a centre of frontage w lays (0 a row, 1 an L, 2 a U) */
export const wingsOf = (w: number): 0 | 1 | 2 => (w >= U_W ? 2 : w >= L_W ? 1 : 0);
/** the shops a centre of frontage w asks the town for: the back row (about one a 6.5 tiles of frontage, 3 to 5) and its wings */
export function shopCount(w: number): number { return Math.min(5, Math.max(3, Math.floor((w - 2) / 6.5))) + wingsOf(w); }

/** the lot geometry a centre composes on: the anchor widened by the span (o moved l back along u, w + l + r) and cut to the span's depth */
export function widen<T extends { o: Pt; u: Pt; n: Pt; w: number; d: number }>(lot: T, s: Span): T {
  return { ...lot, o: { x: lot.o.x - lot.u.x * s.l, y: lot.o.y - lot.u.y * s.l }, w: lot.w + s.l + s.r, d: Math.min(lot.d, s.d) };
}

/** a lot as the span search reads it */
export interface SpanLot { key: string; o: Pt; u: Pt; n: Pt; w: number; d: number }
/** the span of a centre on lot a over its free neighbours (free: an empty lot the town may cover): the lots on a's street line (the same away vector,
 *  their fronts on one line) that run on from a's ends, taken to the right then the left in turn until the frontage reaches CENTRE_W (never past
 *  CENTRE_WMAX), each one keeping the depth CENTRE_D or more. Null when no such run reaches CENTRE_W; else the span and the part keys */
export function findSpan(a: SpanLot, free: readonly SpanLot[]): { span: Span; parts: string[] } | null {
  const least = centreDepth(a.n);
  if (a.d < least) return null;
  // each free lot's interval along a's u (a runs 0..w), on a's line and facing as a does
  const iv: { key: string; t0: number; t1: number; d: number }[] = [];
  for (const b of free) {
    if (b.key === a.key || b.n.x * a.n.x + b.n.y * a.n.y < 0.999 || b.d < least) continue;
    const dx = b.o.x - a.o.x, dy = b.o.y - a.o.y;
    if (Math.abs(dx * a.n.x + dy * a.n.y) > 0.3) continue;
    const s0 = dx * a.u.x + dy * a.u.y, s1 = s0 + (b.u.x * a.u.x + b.u.y * a.u.y) * b.w;
    iv.push({ key: b.key, t0: Math.min(s0, s1), t1: Math.max(s0, s1), d: b.d });
  }
  let lo = 0, hi = a.w, d = a.d;
  const parts: string[] = [];
  for (let side = 0, stuck = 0; hi - lo < CENTRE_W && stuck < 2; side ^= 1) {
    const nb = side === 0 ? iv.find(v => Math.abs(v.t0 - hi) <= JOIN) : iv.find(v => Math.abs(v.t1 - lo) <= JOIN);
    if (!nb || (side === 0 ? nb.t1 - lo : hi - nb.t0) > CENTRE_WMAX) { stuck++; continue; }
    stuck = 0;
    if (side === 0) hi = nb.t1; else lo = nb.t0;
    d = Math.min(d, nb.d); parts.push(nb.key);
  }
  if (hi - lo < CENTRE_W) return null;
  return { span: { l: 0 - lo + 0, r: hi - a.w, d }, parts };
}
/** whether lot b lies inside the span of a centre on lot a (on a's street line, facing as a does, within the widened frontage): the parts of a centre
 *  found again from its business (a save keeps the anchor alone) */
export function spanCovers(a: SpanLot, b: SpanLot, s: Span): boolean {
  if (b.key === a.key || b.n.x * a.n.x + b.n.y * a.n.y < 0.999) return false;
  const dx = b.o.x - a.o.x, dy = b.o.y - a.o.y;
  if (Math.abs(dx * a.n.x + dy * a.n.y) > 0.3) return false;
  const s0 = dx * a.u.x + dy * a.u.y, s1 = s0 + (b.u.x * a.u.x + b.u.y * a.u.y) * b.w;
  return Math.min(s0, s1) >= -s.l - JOIN && Math.max(s0, s1) <= a.w + s.r + JOIN;
}
