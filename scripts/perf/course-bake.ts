// T271: the course chunk bake (ext/course-grid/patch coursePatch: the contour worker's per-chunk work) on a generated 9-hole course over
// 8 x 8 chunks, median per chunk (and of the 16 busiest, and the whole round). Build it against a source tree (another branch's: git archive
// <ref> src | tar -x -C <dir>) and run each in turn:
//   npx esbuild scripts/perf/course-bake.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty
//     --alias:@root=<tree>/src --define:CUSTOM=false --define:GEOM=false --define:LOOKON=false --external:@root/game/golf/grasses --outfile=<out>.mjs
//   node <out>.mjs [rounds=5] [dump per-chunk medians to stderr] [plain | lg]
// GEOM paints three more areas (a strip down three fairways, a disc in three roughs); LOOKON with CUSTOM lays them as two custom grasses
// (golf/grasses.ts; 'plain': with their Border, Round off and stripes off); 'lg' lays them as long grass (one more saved surface)
import { SURF, fillPolygon, makeGrid, paintDisc, type Grid } from '@root/game/ext/course-grid';
import { coursePatch, type CourseLooks } from '@root/game/ext/course-grid/patch';

declare const CUSTOM: boolean;
declare const LOOKON: boolean;
declare const GEOM: boolean;
declare const process: { argv: string[]; hrtime: { bigint(): bigint } };

const LOOKS: CourseLooks = {
  surf: [undefined, { tex: 'golfRough', sc: 1, a: 0 }, { tex: 'golfFescue', sc: 1, a: 0 }, { tex: 'waterDark', sc: 1, a: 0 }, { tex: 'golfFairway', sc: 1, a: 0 }, { tex: 'golfTee', sc: 1, a: 0 }, { tex: 'bunkerSand', sc: 1, a: 0 }, { tex: 'wasteSand', sc: 1, a: 0 }, { tex: 'golfGreen', sc: 1, a: 0 }, { tex: 'golfLongGrass', sc: 1, a: 0 }],
  collar: { 'first-cut': { tex: 'golfFirstCut', sc: 1, a: 0 }, fringe: { tex: 'golfFringe', sc: 1, a: 0 }, lip: { tex: 'golfRough', sc: 1, a: 0 }, bank: { tex: 'rockyDirt', sc: 1, a: 0 } },
  band: [], border: [undefined, undefined, undefined, undefined, 3, undefined, undefined, undefined, 2], round: [], shadow: [],
};
// bunkers rounded at full Smoothness by default (#807)
(LOOKS.round as (number | undefined)[])[SURF.bunker] = 1;

/** mulberry32 */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** a wobbly sausage polygon from (ax, ay) to (bx, by), half width w (tiles) */
function sausage(r: () => number, ax: number, ay: number, bx: number, by: number, w: number) {
  const n = 18, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux, L1: { x: number; y: number }[] = [], R: { x: number; y: number }[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = ax + dx * t, y = ay + dy * t, ww = w * (0.75 + 0.35 * Math.sin(t * Math.PI)) * (0.9 + 0.2 * r());
    L1.push({ x: x + nx * ww, y: y + ny * ww }); R.push({ x: x - nx * ww, y: y - ny * ww });
  }
  return [...L1, ...R.reverse()];
}
/** a course on a 1024 x 1024 cell grid (512 tiles, 8 x 8 chunks): 9 holes, each a rough corridor, a fairway, a green, a tee, bunkers, some
 *  ponds; with CUSTOM, a custom fairway on three holes and a custom rough on three others */
function build(): { g: Grid; lines: Map<number, number[]> } {
  const r = rng(271), g = makeGrid(1024, 1024, 1024, 1024), lines = new Map<number, number[]>();
  for (let h = 1; h <= 9; h++) {
    const row = Math.floor((h - 1) / 3), col = (h - 1) % 3, x0 = 1024 + 20 + col * 165, y0 = 1024 + 20 + row * 165;
    const ax = x0 + 15 + r() * 20, ay = y0 + 15 + r() * 20, bx = x0 + 120 + r() * 25, by = y0 + 110 + r() * 30;
    fillPolygon(g, sausage(r, ax - 10, ay - 10, bx + 10, by + 10, 34), SURF.rough, h, 0);
    fillPolygon(g, sausage(r, ax + 8, ay + 8, bx - 10, by - 10, 13), SURF.fairway, h, 0);
    paintDisc(g, bx, by, 9, SURF.green, h, 0);
    fillPolygon(g, [{ x: ax - 4, y: ay - 3 }, { x: ax + 4, y: ay - 3 }, { x: ax + 4, y: ay + 3 }, { x: ax - 4, y: ay + 3 }], SURF.tee, h, 0);
    for (let b = 0; b < 4; b++) { const t = 0.35 + 0.55 * r(), s = r() < 0.5 ? 1 : -1; paintDisc(g, ax + (bx - ax) * t + s * 14, ay + (by - ay) * t - s * 10, 2.5 + 2 * r(), SURF.bunker, h, 0); }
    if (h % 3 === 0) paintDisc(g, (ax + bx) / 2 + 26, (ay + by) / 2 - 18, 9, SURF.water, h, 0);
    // GEOM: the areas a custom grass takes (LOOKON: in the custom grasses; else plain fairway and rough, the same cells)
    // (argv[4] 'lg': the same areas in long grass, another saved surface: what one more surface of its own costs)
    const lg = process.argv[4] === 'lg';
    if (GEOM && h <= 3) fillPolygon(g, sausage(r, ax + 40, ay + 40, bx - 30, by - 30, 9), lg ? SURF.longGrass : SURF.fairway, h, 0, LOOKON ? { look: 1 } as {} : {});
    if (GEOM && h >= 7) paintDisc(g, (ax + bx) / 2 - 24, (ay + by) / 2 + 22, 12, lg ? SURF.longGrass : SURF.rough, h, 0, LOOKON ? { look: 2 } as {} : {});
    lines.set(h, [ax, ay, bx, by]);
  }
  return { g, lines };
}

async function main() {
  const { g, lines } = build();
  let looks = LOOKS;
  if (CUSTOM) {
    const G = await import('@root/game/golf/grasses');
    // argv[4] 'plain': no Border, no Round off, no stripes (the grasses' own edges off)
    const fam = G.GRASS_FAMILIES[0]!.id, plain = process.argv[4] === 'plain';
    const list = [{ ...G.newGrass(1, fam), border: plain ? 0 : 1.5, stripes: !plain }, { ...G.newGrass(2, fam), plays: 'rough' as const, stripes: false, border: 0, round: !plain, smooth: 0.6 }];
    const gl = G.grassLooks(list, LOOKS.collar['first-cut']), put = <T,>(a: readonly (T | undefined)[] | undefined, b: (T | undefined)[]) => { const o = a ? a.slice() : []; b.forEach((v, s) => { if (v !== undefined) o[s] = v; }); return o; };
    looks = { ...LOOKS, surf: put(LOOKS.surf, gl.surf), band: put(LOOKS.band, gl.band), border: put(LOOKS.border, gl.border), shadow: put(LOOKS.shadow, gl.shadow), round: put(LOOKS.round, gl.round), base: gl.base, ...(gl.stripes ? { stripes: gl.stripes } : {}) };
  }
  const chunks: [number, number][] = []; for (let cy = 16; cy < 24; cy++) for (let cx = 16; cx < 24; cx++) chunks.push([cx, cy]);
  const rounds = +(process.argv[2] ?? 5), times: number[] = [], byChunk = new Map<string, number[]>();
  let layers = 0;
  for (let k = 0; k <= rounds; k++) for (const [cx, cy] of chunks) {
    const t0 = process.hrtime.bigint(), p = coursePatch(g, cx, cy, looks, 0, lines), ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (k === 0) { layers += p?.course?.layers.length ?? 0; continue; } // the first round warms up
    times.push(ms); const key = `${cx},${cy}`; (byChunk.get(key) ?? byChunk.set(key, []).get(key)!).push(ms);
  }
  const med = (a: number[]) => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2) : 0; };
  const per = [...byChunk.values()].map(med).filter(v => v > 0.05), busy = [...byChunk.values()].map(med).sort((a, b) => b - a).slice(0, 16);
  if (process.argv[3]) console.error(JSON.stringify(Object.fromEntries([...byChunk].map(([k, v]) => [k, +med(v).toFixed(2)]))));
  console.log(JSON.stringify({ custom: CUSTOM, chunks: chunks.length, layers, rounds, medianAll: +med(times).toFixed(3), medianBaked: +med(per).toFixed(3), medianBusy16: +med(busy).toFixed(3), total: +(times.reduce((s, v) => s + v, 0) / rounds).toFixed(1) }));
}
void main();
