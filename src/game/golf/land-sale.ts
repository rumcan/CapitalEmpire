// Land for sale (T200, #524; plan P23-UX 6.2 P2-6 and D2.4: "an overlay; a block click opens a card with Buy; the brush's refusal offers it ... a
// block click opens a card and never buys; it closes when another tool is picked"). The blocks you can buy next to your land, each priced and
// banded (cheap, fair, dear: a colour and a $ label, never colour alone, T180); the blocks you cannot buy with why (a public road, water, not
// next to your land yet); a click opens the block's card, never buys; Buy buys exactly the card's block at the card's price. Pure TypeScript,
// no DOM: the engine is its host (golf/parcels.ts does the pricing and the purchase), the overlay and the card read it, the tests drive it.
import type { Rect } from './mode';
import { LAND_BLOCK, adjacentBlockPrice, blockAt, isAdjacentBlock, mergeParcelBounds, parcelsAreaSqm, rectAreaSqm, rectsOverlap, type ParcelLandClass } from './parcels';

/** a price band (by the price a square metre): the overlay's colour and its label */
export type PriceBand = 'cheap' | 'fair' | 'dear';
/** the bands' upper bounds ($ a m²: the land classes' base rates are farm 1, open 1.25, town 2, industrial 3, commercial 4) and their labels */
export const BAND_MAX: Readonly<Record<PriceBand, number>> = { cheap: 1.5, fair: 2.5, dear: Infinity };
export const BAND_LABEL: Readonly<Record<PriceBand, string>> = { cheap: '$', fair: '$$', dear: '$$$' };
export const BAND_NAME: Readonly<Record<PriceBand, string>> = { cheap: 'Cheap', fair: 'Fair', dear: 'Dear' };
/** the refusals' words */
export const LAND_REFUSE = {
  road: 'A public road runs here: it stays public',
  water: 'Water: unbuildable land',
  apart: 'Not next to your land yet: buy a block between first',
} as const;

/** a block on the overlay: its rect (tiles), its land class, what stands on it, its price ($; Infinity: none) and band, and why it cannot be
 *  bought (null: it can) */
export interface LandOffer { rect: Rect; landClass: ParcelLandClass; houses: number; buildings: number; price: number; band: PriceBand | null; why: string | null;
  /** T239: a named parcel (the practice area of a guided range start), offered whatever its size and wherever it lies */
  name?: string }
/** what the land sale reads from the game */
export interface LandHost {
  /** your land (the owned rects) */
  parcels(): readonly Rect[];
  /** the map's side (tiles) */
  map: number;
  /** a block's land class and what stands on it (houses, other buildings) */
  classOf(r: Rect): { landClass: ParcelLandClass; houses: number; buildings: number };
  /** whether a block would take a public road's tiles */
  onRoad(r: Rect): boolean;
  /** the town's people (the price rises gently with them) */
  pop(): number;
  /** a key that changes when the roads, the town or the land change (the offers are worked out again) */
  version(): string;
  /** T239: named parcels for sale besides the blocks (the practice area of a guided range start: inside the start's land, not the player's
   *  until bought), priced like a block of their land class; missing: none */
  special?(): readonly { rect: Rect; name: string }[];
}
/** the band of a price on a block */
export function bandOf(price: number, rect: Rect): PriceBand | null {
  const sqm = rectAreaSqm(rect); if (!Number.isFinite(price) || sqm <= 0) return null;
  const rate = price / sqm;
  return rate <= BAND_MAX.cheap ? 'cheap' : rate <= BAND_MAX.fair ? 'fair' : 'dear';
}
const key = (r: Rect) => r.join(',');

/** the overlay's blocks: every block for sale next to your land (blockAt's, at points round the land: the blocks a click would pick, the one
 *  sharing the longest edge first, none overlapping another), priced and banded, a refused one with why; then the ring beyond them, refused as
 *  not next to your land yet */
export function landOffers(h: LandHost, size = LAND_BLOCK): LandOffer[] {
  const parcels = h.parcels(), pop = h.pop(), seen = new Map<string, { r: Rect; edge: number }>();
  const shared = (r: Rect) => parcels.reduce((s, p) => s + edgeLen(p, r), 0);
  // points round the land, a quarter block apart, a block deep: blockAt's block at each
  const b = mergeParcelBounds(parcels as Rect[]), step = size / 4;
  for (let y = b[1] - size + step / 2; y < b[1] + b[3] + size; y += step) for (let x = b[0] - size + step / 2; x < b[0] + b[2] + size; x += step) {
    const c = blockAt(parcels, x, y, size, h.map); if (!c) continue;
    const k = key(c); if (!seen.has(k)) seen.set(k, { r: c, edge: shared(c) });
  }
  const out: LandOffer[] = (h.special?.() ?? []).map(sp => ({ ...offerOf(h, sp.rect, pop), name: sp.name }));
  for (const { r } of [...seen.values()].sort((a, c) => c.edge - a.edge || a.r[1] - c.r[1] || a.r[0] - c.r[0])) {
    if (out.some(o => rectsOverlap(o.rect, r))) continue;
    out.push(offerOf(h, r, pop));
  }
  // the ring beyond: a block's neighbour away from your land, not next to it (buy the one between first)
  const ring: LandOffer[] = [];
  for (const o of out) if (!o.name) for (const [dx, dy] of [[size, 0], [-size, 0], [0, size], [0, -size]] as const) {
    const r: Rect = [o.rect[0] + dx, o.rect[1] + dy, size, size];
    if (r[0] < 0 || r[1] < 0 || r[0] + size > h.map || r[1] + size > h.map) continue;
    if (parcels.some(p => rectsOverlap(p, r)) || isAdjacentBlock(parcels, r) || [...out, ...ring].some(q => rectsOverlap(q.rect, r))) continue;
    ring.push({ ...offerOf(h, r, pop), price: Infinity, band: null, why: LAND_REFUSE.apart });
  }
  return [...out, ...ring];
}
/** the length (tiles) of the edge two rects share */
function edgeLen(a: Rect, b: Rect): number {
  if (rectsOverlap(a, b)) return 0;
  if (a[0] + a[2] === b[0] || b[0] + b[2] === a[0]) return Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  if (a[1] + a[3] === b[1] || b[1] + b[3] === a[1]) return Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  return 0;
}
/** a block's offer: its class, price and band, or why it cannot be bought (a public road, water) */
function offerOf(h: LandHost, r: Rect, pop: number): LandOffer {
  const c = h.classOf(r), road = h.onRoad(r), price = road ? Infinity : adjacentBlockPrice({ rect: r, ...c, townPop: pop });
  const why = road ? LAND_REFUSE.road : c.landClass === 'unbuildable' || !Number.isFinite(price) ? LAND_REFUSE.water : null;
  return { rect: r, landClass: c.landClass, houses: c.houses, buildings: c.buildings, price: why ? Infinity : price, band: why ? null : bandOf(price, r), why };
}
const inside = (r: Rect, x: number, y: number) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];

/** the card's words for a block: its size (m², tiles, the side in m), what stands on it, what it adds to your land */
export function offerFacts(o: LandOffer, parcels: readonly Rect[], trees = 0): { size: string; on: string; adds: string } {
  const sqm = rectAreaSqm(o.rect), own = parcelsAreaSqm(parcels), side = Math.round(Math.sqrt(sqm));
  const on: string[] = [];
  if (o.houses) on.push(`${o.houses} house${o.houses === 1 ? '' : 's'} (bought out at the land price)`);
  if (o.buildings) on.push(`${o.buildings} other building${o.buildings === 1 ? '' : 's'} (bought out)`);
  if (trees) on.push(`${trees} tree${trees === 1 ? '' : 's'} (cleared as you build there)`);
  if (o.landClass === 'farm') on.push('farmland');
  return {
    size: `${sqm.toLocaleString()} m² · ${o.rect[2]} × ${o.rect[3]} tiles (${side} × ${side} m)`,
    on: on.length ? on.join(', ') : 'Open ground: nothing built',
    adds: o.name ? `${sqm.toLocaleString()} m² beside the range: Facilities › Practice builds its putting and chipping greens here`
      : `${sqm.toLocaleString()} m² more course land${own > 0 ? ` (+${Math.round((100 * sqm) / own)}% of yours)` : ''}`,
  };
}

/** the land sale's state: the blocks (worked out again when the host's version changes), the one under the pointer and the card's */
export class LandSale {
  hover: LandOffer | null = null;
  /** the block whose card is open (a click opened it; Buy buys it); null: none */
  card: LandOffer | null = null;
  private cache: { k: string; offers: LandOffer[] } | null = null;
  constructor(private h: LandHost) {}
  /** the overlay's blocks (see landOffers) */
  offers(): LandOffer[] {
    const k = `${this.h.version()}|${this.h.parcels().map(key).join(';')}|${Math.round(this.h.pop())}|${(this.h.special?.() ?? []).map(sp => key(sp.rect)).join(';')}`;
    if (this.cache?.k !== k) this.cache = { k, offers: landOffers(this.h) };
    return this.cache.offers;
  }
  /** the block at tile point (x, y), bought or not (null: none there: your land, or beyond the ring) */
  at(x: number, y: number): LandOffer | null { return this.offers().find(o => inside(o.rect, x, y)) ?? null; }
  /** the pointer moved to (x, y) */
  move(x: number, y: number) { this.hover = this.at(x, y); }
  /** a click at (x, y): opens that block's card (a refused one too: its card says why), else closes the card. Never buys */
  click(x: number, y: number): LandOffer | null { this.card = this.at(x, y); return this.card; }
  /** closes the card (Cancel, Esc) */
  cancel() { this.card = null; }
  /** Buy on the card: the card's block, at the card's price, if it is still for sale at that price (the town may have grown, the land changed)
   *  and the money holds; what to buy, or why not */
  buy(money: number): { ok: true; rect: Rect; price: number } | { ok: false; why: string } {
    const c = this.card; if (!c) return { ok: false, why: 'No block picked' };
    if (c.why) return { ok: false, why: c.why };
    const now = this.offers().find(o => key(o.rect) === key(c.rect));
    if (!now || now.why) return { ok: false, why: now?.why ?? 'This block is no longer for sale' };
    if (now.price !== c.price) { this.card = now; return { ok: false, why: `The price changed: now $${now.price.toLocaleString()}` }; }
    if (money < c.price) return { ok: false, why: `Not enough money: $${c.price.toLocaleString()} (you have $${Math.round(money).toLocaleString()})` };
    return { ok: true, rect: [...c.rect] as Rect, price: c.price };
  }
}
