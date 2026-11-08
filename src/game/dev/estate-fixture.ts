// T353 (#995): the house lots' dev fixture (the dev server only: the headless shots and the bench). It finds streets on the player's own land where house
// lots fit (the real rules judge every lot: golf/estate.ts lotWhy), builds each street as the road tool would (a Street, the town's class), and lays the lots
// along it through placeLots, in the stages asked for. It drives the Game's private members the way the road fuzzer does (dev/roadfuzz.ts): nothing here
// ships in a build.
//   const m = await import('/src/game/dev/estate-fixture.ts'); m.layEstateFixture(window.__game, 40, { stages: 'built' })
import { CLASS, type Pt } from '../network';
import * as ES from '../golf/estate';
import { legsOnPlay } from '../golf/parcels';
import type { Game } from '../engine';

/** the Game's private members the fixture drives */
interface Hooks {
  estateEnv(): ES.EstateEnv; estateMake(): ES.Estate; estateStreets(near: Pt, r: number): ES.StreetSeg[]; estateAsk(l: ES.EstateLot): number;
  edit: { addLegs(legs: { a: Pt; b: Pt }[], cls: typeof CLASS.street, style: number): void }; commitNetwork(keepPrev?: boolean, until?: number): void; golfMonthAt(now: number): number;
  estateLaid(placed: readonly ES.EstateLot[]): void; estateSync(): void;
}
/** a street site: the street's ends, the side its lots lie on, how many lots the rules allow there, how many are refused for being in range of a hole, and its score */
export interface Site { a: Pt; b: Pt; side: 1 | -1; ok: number; range: number; score: number }
/** what the fixture laid: the sites (streets), the lots, and a point on a lot the rules refuse for being in range of a hole (null: none found) */
export interface Laid { sites: Site[]; lots: ES.EstateLot[]; rangeSpot: Pt | null; searchMs: number }

/** the best site for a street of len tiles on the player's land (null: none): the one with the most lots the rules allow on one side, the dearest breaking a tie (with `view`:
 *  the one with the most lots that look onto a fairway or a green first: the shots' row beside a fairway);
 *  with `range`, the one that has lots refused for being in range of a hole (at least 2) and some that are allowed */
export function findSite(g: Game, o: { want?: number; len?: number; range?: boolean; view?: boolean } = {}): Site | null {
  const h = g as unknown as Hooks, env = h.estateEnv(), est = h.estateMake(), G = g.golf; if (!G) return null;
  const land = [G.course, ...(G.parcels ?? [G.parcel])] as [number, number, number, number][];
  const x0 = Math.min(...land.map(r => r[0])), y0 = Math.min(...land.map(r => r[1])), x1 = Math.max(...land.map(r => r[0] + r[2])), y1 = Math.max(...land.map(r => r[1] + r[3]));
  const len = o.len ?? 100, want = o.want ?? 8, st = CLASS.street, hw = st.h + st.walk, grid = g.courseGrid, rep = G.rep;
  let best: Site | null = null;
  for (const horiz of [true, false]) {
    const p0 = horiz ? y0 : x0, p1 = horiz ? y1 : x1, s0 = horiz ? x0 : y0, s1 = horiz ? x1 : y1;
    for (let p = p0 + 10; p < p1 - 10; p += 8) for (let s = s0 + 4; s + len < s1 - 4; s += 20) {
      const a = horiz ? { x: s, y: p } : { x: p, y: s }, b = horiz ? { x: s + len, y: p } : { x: p, y: s + len };
      if (![a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }].every(q => env.owned(q.x, q.y))) continue;
      if (grid && legsOnPlay(grid, [{ a, b }], hw)) continue;
      // no road, cart path or drive near the street's line
      const box: [number, number, number, number] = [Math.min(a.x, b.x) - 4, Math.min(a.y, b.y) - 4, Math.max(a.x, b.x) + 4, Math.max(a.y, b.y) + 4];
      if (env.roads(box).length) continue;
      const seg: ES.StreetSeg = { a, b, base: 'street', h: st.h, walk: st.walk, ra: 4, rb: 4 };
      for (const side of [1, -1] as const) {
        const plan = ES.planLots(est, { segs: [seg], side }, env), ok = plan.ok.length, range = plan.refused.filter(r => /in range/.test(r.why)).length;
        if (ok < (o.range ? 2 : want) || (o.range && range < 2)) continue;
        const wet = (h as unknown as { estateWet: (x: number, y: number) => boolean }).estateWet, views = plan.ok.map(f => ES.viewOf(f, grid, wet));
        const value = plan.ok.reduce((t, f, i) => t + ES.priceOf(f, views[i]!, rep), 0), seen = views.filter(v => v.fairway || v.green).length;
        const score = o.range ? range * 1e6 + value : o.view ? seen * 1e9 + ok * 1e6 + value : ok * 1e6 + value;
        if (!best || score > best.score) best = { a, b, side, ok, range, score };
      }
    }
  }
  return best;
}

/** puts the lots (default: all of the estate) in stages: 'sale' (all for sale), 'mix' (two for sale, two sold, two being built, the rest built: the shots), 'built'
 *  (all built: the bench). The estate redraws them. The lots in the order they were laid; the clock is held (a stage ends 40 months on) */
export function setStages(g: Game, stages: 'sale' | 'mix' | 'built', lots?: ES.EstateLot[]): void {
  const h = g as unknown as Hooks, e = h.estateMake(), now = h.golfMonthAt(performance.now()), mix = [0, 0, 1, 1, 2, 2];
  (lots ?? e.lots).forEach((l, i) => {
    const st = stages === 'built' ? 3 : stages === 'mix' ? (i < mix.length ? mix[i]! : 3) : 0;
    l.st = st as ES.Stage; l.at = now - (st === 0 ? 0 : 1); l.after = st === 3 ? Infinity : now + 40; l.price = st === 0 ? 0 : h.estateAsk(l);
    l.member = st === 3 ? true : undefined; if (!l.member) delete l.member;
  });
  e.rev++;
}

/** builds the street of a site (a Street, as the road tool lays one) */
export function buildStreet(g: Game, site: Site): void {
  const h = g as unknown as Hooks;
  h.edit.addLegs([{ a: site.a, b: site.b }], CLASS.street, 0); h.commitNetwork(true, performance.now() + 100);
}

/** lays `n` lots (as many as sites allow): each street built, its lots laid; stages: 'sale' (all for sale), 'mix' (two for sale, two sold, two being built, the rest
 *  built: the shots), 'built' (all built: the bench). rangeSpot: with `range`, a short street is built where lots are refused for being in range of a hole; with `both`,
 *  each street takes the lots the rules allow on both its sides (the most lots from the fewest streets) */
export function layEstateFixture(g: Game, n: number, o: { stages?: 'sale' | 'mix' | 'built'; len?: number; range?: boolean; both?: boolean } = {}): Laid {
  const t0 = performance.now(), h = g as unknown as Hooks, e = h.estateMake(), sites: Site[] = [], now = h.golfMonthAt(performance.now());
  let rangeSpot: Pt | null = null;
  const build = (site: Site, side: 1 | -1 | 0): ES.PlaceResult => {
    buildStreet(g, site);
    const mid = { x: (site.a.x + site.b.x) / 2, y: (site.a.y + site.b.y) / 2 };
    return ES.placeLots(e, { segs: h.estateStreets(mid, Math.hypot(site.b.x - site.a.x, site.b.y - site.a.y) / 2 + 10), side }, h.estateEnv(), now, g.seed);
  };
  const placed: ES.EstateLot[] = [];
  for (let guard = 0; placed.length < n && guard < 14; guard++) {
    // the best street that gives ten lots, else eight, six, four, two (a scene's land may have no site for ten on one side: the bench asks for forty lots in all)
    const need = Math.max(2, n - placed.length); let site: Site | null = null;
    for (const w of [10, 8, 6, 4, 2]) { site = findSite(g, { want: Math.min(w, need), len: o.len ?? 100 }); if (site) break; }
    if (!site) break;
    sites.push(site);
    const r = build(site, o.both ? 0 : site.side); // (both: the lots of both sides of the street, the bench's forty)
    const keep: ES.EstateLot[] = [];
    for (const l of r.placed) { if (placed.length < n) { placed.push(l); keep.push(l); } else ES.removeLot(e, l.id); }
    h.estateLaid(keep); // (the course's ground under the lots goes, as when the tool lays them)
  }
  if (o.range) {
    const site = findSite(g, { range: true, len: 60 });
    if (site) {
      buildStreet(g, site);
      const mid = { x: (site.a.x + site.b.x) / 2, y: (site.a.y + site.b.y) / 2 }, segs = h.estateStreets(mid, 60);
      const bad = ES.planLots(e, { segs, side: site.side }, h.estateEnv()).refused.find(r => /in range/.test(r.why));
      if (bad) rangeSpot = ES.centreOf({ ...bad.frame });
      sites.push(site);
    }
  }
  setStages(g, o.stages ?? 'sale', placed); h.estateSync();
  return { sites, lots: placed, rangeSpot, searchMs: Math.round(performance.now() - t0) };
}
