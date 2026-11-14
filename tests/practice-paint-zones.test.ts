// #1298 (the owner, 2026-11-14: "I painted fescue over the practice and pittingarea and this is how it went. see screenshot where some box around the practice greens are not letting it
// paint there"): a practice facility owns its looks (T256: golf/looks.ts), and the cells of no hole it owns were found by a BOX: the bounds of its cells grown by two and a half tiles. Every
// cell of no hole inside it wore the facility's looks, so what the player painted round a facility, in the property's look (fescue, say), showed in the facility's older look inside a
// rectangle round it. The zone is now its own cells (green, sand and its rough band: a mask over their bounds), and the paint round them is the property's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { practiceArea } from '../src/game/golf/practice';
import { SURF, makeGrid, paintCells, paintDisc, type Grid } from '../src/game/ext/course-grid';
import { coursePatch, zoneOwner, type CourseLooks, type FacilityZone } from '../src/game/ext/course-grid/patch';
import { BRUSH_PRESETS, type BrushKind } from '../src/game/paint';
import { courseLookSet, type LookStyle } from '../src/game/course-look';
import { PRACTICE_SIZE, facilityMaskAt, planCells, practicePlan, type PlanSpec } from '../src/game/golf/practicebuild';
import { plotPoint } from '../src/game/golf/range';
import type { Rect } from '../src/game/golf/mode';

const plot: Rect = [200, 200, 70, 150];
const AREA = practiceArea(plot, 2), BOX = AREA.box;
const grid = (): Grid => makeGrid(190, 190, 300, 420);
const pre = (_s: string, old: string) => ({ tex: old, sc: 1, a: 0 });
const dflt = Object.fromEntries(BRUSH_PRESETS.map(p => [p.kind, { style: p.style }])) as Partial<Record<BrushKind, { style: LookStyle }>>;
const withTex = (k: BrushKind, tex: string) => ({ ...dflt, [k]: { style: { ...dflt[k]!.style, tex } } }) as Partial<Record<BrushKind, { style: LookStyle }>>;
function looksOf(b: Partial<Record<BrushKind, { style: LookStyle }>>): CourseLooks { const s = courseLookSet(b, pre); return { surf: s.surf, collar: s.collar, band: s.band, ...(s.lipGrass ? { lipGrass: s.lipGrass } : {}), ...(s.round ? { round: s.round } : {}) }; }
const spec = (kind: PlanSpec['kind'], u: number, v: number, extra: Partial<PlanSpec> = {}): PlanSpec => { const q = plotPoint(plot, 2, u, v); return { kind, x: q.x, y: q.y, m2: PRACTICE_SIZE[kind].def, turn: 0, shape: 0, seed: 1, ...extra }; };
/** a putting green and a chipping green laid as the practice tool lays them (green, sand, rough band: hole 0) */
function laid() {
  const g = grid(), out: { c: ReturnType<typeof planCells>; at: { x: number; y: number } }[] = [];
  for (const s of [spec('putting', 103, 12, { seed: 2 }), spec('chipping', 86, 25)]) {
    const p = practicePlan(s), c = planCells(g, p, BOX);
    paintCells(g, c.green, c.green.length, SURF.green, 0, 0); paintCells(g, c.bunker, c.bunker.length, SURF.bunker, 0, 0); paintCells(g, c.rough, c.rough.length, SURF.rough, 0, 0);
    out.push({ c, at: p.centre });
  }
  return { g, fac: out };
}
/** the property's brush over the practice area from x0 on (the 'below' rule, never a hole's cell): it slides past the greens and the sand, takes the band */
function paint(g: Grid, s: number, x0 = BOX[0] + 1, x1 = BOX[2]) {
  const opts = { over: 'below' as const, allow: (i: number) => g.hole[i] === 0 };
  for (let y = BOX[1] + 1; y < BOX[3]; y += 4) for (let x = x0; x < x1; x += 0.5) paintDisc(g, x, y, 5, s, 0, 0, opts);
}
const CX = 4, CY = 3;   // (the chunk that holds the practice area: tiles 275..311 by 202..236, chunks of 64)

test('a facility\'s zone is its own cells: the mask holds the green, the sand and the rough band and nothing round them, the box its bounds only', () => {
  const { g, fac } = laid();
  for (const f of fac) {
    const z = facilityMaskAt(g, BOX, f.at.x, f.at.y)!, all = new Set([...f.c.green, ...f.c.bunker, ...f.c.rough]);
    assert.ok(z && z.mask.some(v => v), 'a zone for it');
    assert.equal(z.mask.reduce((a, v) => a + v, 0), all.size, 'its cells and nothing else');
    const zone: FacilityZone = { k: 0, ...z };
    for (const i of all) assert.equal(zoneOwner(g, [zone], i), 0, 'its cells wear its looks');
    // the bounds are a box with room round the outline: the cells of it that are not the facility's belong to no zone
    let inside = 0, off = 0;
    for (let y = z.y0 + 0.25; y < z.y1; y += 0.5) for (let x = z.x0 + 0.25; x < z.x1; x += 0.5) { inside++; const i = Math.floor((y - g.y0) / 0.5) * g.w + Math.floor((x - g.x0) / 0.5); if (!all.has(i)) { off++; assert.equal(zoneOwner(g, [zone], i), null, 'in the bounds, off the facility: no zone'); } }
    assert.ok(off > 0.15 * inside, `${off} of ${inside} cells of the bounds are off the facility`);
    // far off it, or on no mask: nobody's
    assert.equal(zoneOwner(g, [zone], Math.floor((BOX[3] - 1 - g.y0) / 0.5) * g.w + Math.floor((BOX[2] - 1 - g.x0) / 0.5)), null);
  }
  assert.equal(facilityMaskAt(g, BOX, BOX[0] + 1, BOX[1] + 1), null, 'bare ground is no facility');
});

test('the paint the player laid round a facility wears the property\'s looks, not the facility\'s: no rectangle of the older look round the greens', () => {
  const { g, fac } = laid();
  paint(g, SURF.longGrass);
  // the property wears the long grass of its choice, the facilities the older one (their looks were seeded before the player changed the property's): dirt
  const base = looksOf(withTex('longGrass', 'golfFescue')), old = courseLookSet(withTex('longGrass', 'dirt'), pre);
  const zones = fac.map(f => ({ k: 0, ...facilityMaskAt(g, BOX, f.at.x, f.at.y)! }));
  const patchWith = (z: FacilityZone[]) => coursePatch(g, CX, CY, { ...base, own: { looks: [old], hole: [-1], zones: z } }, 0)!.course!;
  const now = patchWith(zones), lg = now.layers.find(l => l.s === SURF.longGrass)!;
  assert.ok(lg.fill.length > 0, 'the long grass is laid over the area');
  assert.equal(lg.alts, undefined, 'one look for all the long grass: the property\'s');
  assert.equal(lg.tex, base.surf[SURF.longGrass]!.tex, 'the one the player painted with');
  // the old zones, the bounds of the cells grown by two and a half tiles with every cell of the box in them, put the facility's look on the long grass inside the box: the rectangle
  const boxes: FacilityZone[] = zones.map(z => ({ k: 0, x0: z.x0 - 2.5, y0: z.y0 - 2.5, x1: z.x1 + 2.5, y1: z.y1 + 2.5, mask: new Uint8Array(Math.round((z.x1 - z.x0 + 5) / 0.5) * Math.round((z.y1 - z.y0 + 5) / 0.5)).fill(1) }));
  const was = patchWith(boxes).layers.find(l => l.s === SURF.longGrass)!;
  assert.equal(was.alts?.length, 1, 'the box laid the facility\'s look over a share of the long grass');
  assert.ok([was.tex, was.alts![0]!.look.tex].includes('dirt'));
  // the facility's own green still wears its look
  const greenOld = courseLookSet(withTex('green', 'dirt'), pre);
  const gl = coursePatch(g, CX, CY, { ...base, own: { looks: [greenOld], hole: [-1], zones } }, 0)!.course!.layers.find(l => l.s === SURF.green)!;
  assert.equal(gl.tex, 'dirt', 'its green: the facility\'s'); assert.equal(gl.alts, undefined);
});

test('what the player did not paint over stays the facility\'s: a rough band left as it was wears the facility\'s rough, the cells painted over the property\'s', () => {
  const { g, fac } = laid();
  paint(g, SURF.longGrass, BOX[0] + 1, fac[1]!.at.x - 3);   // (the chipping green's side only: the putting green's band is left alone)
  const base = looksOf(withTex('longGrass', 'golfFescue')), old = courseLookSet({ ...withTex('rough', 'dirt'), longGrass: { style: { ...dflt.longGrass!.style, tex: 'dirt' } } }, pre);
  const zones = fac.map(f => ({ k: 0, ...facilityMaskAt(g, BOX, f.at.x, f.at.y)! }));
  const c = coursePatch(g, CX, CY, { ...base, own: { looks: [old], hole: [-1], zones } }, 0)!.course!;
  const rough = c.layers.find(l => l.s === SURF.rough), lg = c.layers.find(l => l.s === SURF.longGrass)!;
  assert.ok(rough && rough.fill.length > 0, 'the putting green\'s band is still rough'); assert.equal(rough!.tex, 'dirt', 'in its facility\'s look');
  assert.equal(lg.alts, undefined); assert.equal(lg.tex, base.surf[SURF.longGrass]!.tex, 'the painted cells: the property\'s');
});

test('a facility painted over its whole band is no zone but its green and sand: the cells of the band are the property\'s now, the zone follows the grid', () => {
  const { g, fac } = laid();
  const before = facilityMaskAt(g, BOX, fac[0]!.at.x, fac[0]!.at.y)!, cells = (m: typeof before) => m.mask.reduce((a, v) => a + v, 0);
  paint(g, SURF.longGrass);
  const after = facilityMaskAt(g, BOX, fac[0]!.at.x, fac[0]!.at.y)!;
  assert.equal(cells(after), fac[0]!.c.green.length + fac[0]!.c.bunker.length, 'only its green and sand');
  assert.ok(cells(before) > cells(after) + 100, 'the band was part of it');
});
