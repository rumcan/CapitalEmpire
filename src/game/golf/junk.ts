// J7 (#1225; the owner, 2026-11-13: "add some built in driving range props ... there should be junk yard stuff ... stuff he has to clean up but add it
// random stuff on the range with distance to them"): the junk lying on a jam game's old range. The ONE list of what it can be (library ids: the game's
// own scrapyard art), each with its name and its scrap value; the seeded scatter over the outfield (in the range's own frame: u across, v down the range,
// tiles of 2 m; rangebiz.ts places the pieces and their distance pills); and what clearing a pile costs and what junk does to the range's appeal.
// Cinderlinks' practice range (J6) draws the same items: Engine.rangeJunk() gives each pile's library id, name, world spot and distance.
// Pure TS, no DOM.

/** one kind of junk: its library id (src/game/library.ts), its name on the map and the card, and the scrap it fetches when cleared ($) */
export interface JunkKind { id: string; name: string; scrap: number }
/** the junk a range can carry (the scrapyard set; each reads well small) */
export const RANGE_JUNK: readonly JunkKind[] = Object.freeze([
  { id: 'expansion:junk-car', name: 'Old car', scrap: 120 },
  { id: 'expansion:scrap-pickup-rear', name: 'Rusty pickup', scrap: 150 },
  { id: 'expansion:utility-trailer', name: 'Broken trailer', scrap: 70 },
  { id: 'expansion:tyre-stack', name: 'Tyres', scrap: 10 },
  { id: 'expansion:oil-drums', name: 'Oil drums', scrap: 30 },
  { id: 'expansion:pallet-stack', name: 'Pallets', scrap: 15 },
  { id: 'expansion:scrap-engine', name: 'Old engine', scrap: 60 },
  { id: 'expansion:scrap-metal', name: 'Scrap heap', scrap: 80 },
  { id: 'expansion:bike-scrap', name: 'Old bicycles', scrap: 20 },
  { id: 'expansion:lawn-roller', name: 'Lawn roller', scrap: 20 },
  { id: 'expansion:attic-trunk', name: 'Old trunk', scrap: 5 },
]);
export const JUNK_BY_ID: ReadonlyMap<string, JunkKind> = new Map(RANGE_JUNK.map(k => [k.id, k]));

/** a pile in the save (RangeBizSave.junk): its kind's library id and its spot in the range's frame (u across, v down the range, tiles) */
export interface JunkPile { id: string; u: number; v: number }
/** the piles a new jam range carries */
export const JUNK_PILES = 9;
/** what clearing one pile costs (a man and a truck, $; its scrap comes back on top) */
export const JUNK_CLEAR_COST = 250;
/** each pile left on the range takes this off its appeal (a fraction: nine piles about 14% fewer golfers); clearing them all gives it back */
export const JUNK_APPEAL = 0.016;
/** the appeal factor of n piles (1 with none, never below 0.5) */
export const junkFactor = (n: number): number => Math.max(0.5, 1 - JUNK_APPEAL * Math.max(0, Number.isFinite(n) ? Math.floor(n) : 0));

/** a small seeded random (mulberry32) */
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** the outfield the junk may lie on, in the range's frame: u0..u1 across, v0..v1 down (rangebiz.ts passes its own: past the tee's apron, short of the
 *  far fence), and a test for the ground a pile must keep off (the target greens, the oasis) */
export interface JunkField { u0: number; u1: number; v0: number; v1: number; ok: (u: number, v: number) => boolean }
/** n piles scattered over the field from a seed (the same seed, the same range), MIN_GAP tiles apart, a kind each (no kind twice until all are used) */
export function scatterJunk(seed: number, f: JunkField, n = JUNK_PILES): JunkPile[] {
  const r = rand(seed ^ 0x6a75), out: JunkPile[] = [], kinds = RANGE_JUNK.map(k => k.id);
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!]; }
  for (let tries = 0; out.length < n && tries < 400; tries++) {
    const u = Math.round((f.u0 + r() * (f.u1 - f.u0)) * 2) / 2, v = Math.round((f.v0 + r() * (f.v1 - f.v0)) * 2) / 2;
    if (!f.ok(u, v) || out.some(p => Math.hypot(p.u - u, p.v - v) < MIN_GAP)) continue;
    out.push({ id: kinds[out.length % kinds.length]!, u, v });
  }
  return out;
}
/** the least room between two piles (tiles) */
export const MIN_GAP = 9;
/** a loaded junk list made well formed (known kinds, finite spots; absent: none) */
export function normalizeJunk(x: unknown): JunkPile[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out = x.filter((p): p is JunkPile => !!p && typeof p === 'object' && JUNK_BY_ID.has((p as JunkPile).id) && Number.isFinite((p as JunkPile).u) && Number.isFinite((p as JunkPile).v))
    .map(p => ({ id: p.id, u: p.u, v: p.v }));
  return out;
}
