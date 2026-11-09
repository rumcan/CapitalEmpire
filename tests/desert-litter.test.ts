// T384 (#1040): the desert's litter. Every autumn leaf source of the ground bake lays desert litter in the desert theme, from sheets drawn on the autumn sheets' own layouts (so every placement, size and count is the
// autumn's): the leaf sprites (the road litter, the ground scatter, the fallen leaves' piles, drifts and scatters along kerbs, fences and walls, the living ground's litter under trees), the lots' leaf decals, the map decals
// and the nature patches. Pure: the drawing is run on a recording canvas (the pictures are looked at in the real game: scripts/dev/desert-litter-shots.mjs); the wiring is read from the source.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DECALS, LEAF_CELL, LEAF_COLS, LEAVES } from '../src/game/ground-art';
import { LOT_DECALS } from '../src/game/lot-decals';
import { NATURE } from '../src/game/nature-patches';
import { LEAF_TINTS } from '../src/game/leaf-fall';
import { leafAtlasAt } from '../src/game/leaf-atlas';
import { BRUSH, DESERT_TINTS, DESERT_TINT_LOOK, SAGE, SAND, STONE, desertLeafSheet, desertLotDecals, desertMapDecals, desertNature } from '../src/game/desert-litter';
import type { Cnv } from '../src/game/canvas2d';

/** a canvas that records what is drawn on it: its calls, and every colour it was given */
type Call = [string, ...unknown[]];
const made: FakeCanvas[] = [];
class FakeCanvas {
  calls: Call[] = []; colours = new Set<string>(); private ctx: unknown;
  constructor(public width: number, public height: number) { made.push(this); }
  getContext() {
    if (this.ctx) return this.ctx;
    const me = this, grad = { addColorStop(_o: number, c: string) { me.colours.add(c); me.calls.push(['stop', c]); } };
    return (this.ctx = new Proxy({}, {
      get(_t, name: string) { return name === 'createRadialGradient' ? (...a: unknown[]) => { me.calls.push([name, ...a]); return grad; } : (...a: unknown[]) => { me.calls.push([name, ...a]); }; },
      set(_t, name: string, v) { if ((name === 'fillStyle' || name === 'strokeStyle') && typeof v === 'string') me.colours.add(v); me.calls.push([`set:${name}`, v]); return true; },
    }));
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = FakeCanvas;
const fake = (w: number, h: number) => new FakeCanvas(w, h) as unknown as Cnv & FakeCanvas;

/** a colour string as hue (degrees), saturation and value */
function hsv(c: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(c), q = /^rgba?\((\d+),(\d+),(\d+)/.exec(c);
  const [r, g, b] = (m ? [0, 2, 4].map(i => parseInt(m[1]!.slice(i, i + 2), 16)) : q ? [+q[1]!, +q[2]!, +q[3]!] : [0, 0, 0]).map(v => v / 255) as [number, number, number];
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo;
  const h = d === 0 ? 0 : hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, hi === 0 ? 0 : d / hi, hi];
}
/** an autumn leaf's colour: a saturated red, orange or yellow, or a leaf green */
const autumn = (c: string) => { const [h, s, v] = hsv(c); return (s > 0.62 && v > 0.45 && (h < 55 || h > 340)) || (s > 0.38 && h >= 70 && h <= 170); };

describe('the desert litter\'s colours (T384)', () => {
  it('the test knows an autumn leaf: the leaf sprites\' and the leaf tints\' reds, oranges and greens are caught, sand, stone, brush and sage are not', () => {
    // (the oak's brown tint, #6f4a2c, is a dry brown too: not told apart by colour, and not needed: the desert's tints are checked to be its own below)
    for (const c of ['#c8561e', '#e08a2a', '#a8321c', '#d9b13b', '#b8451d', '#8f2d14', '#f0c040', '#a8281a', '#d6a12c', '#71882e']) assert.ok(autumn(c), `${c} is an autumn leaf`);
    for (const c of [...SAND, ...STONE, ...BRUSH, ...SAGE, ...DESERT_TINTS.filter(Boolean)]) assert.ok(!autumn(c), `${c} is not`);
  });
  it('the leaf sheet is drawn in desert colours only, a cell for every leaf sprite (the same cells), each clipped to its own', () => {
    const out = desertLeafSheet() as unknown as FakeCanvas;
    assert.equal(out.width, LEAF_COLS * LEAF_CELL + 1); assert.ok(out.height >= 160 && out.height <= 161 + LEAF_CELL, `${out.height}`);
    for (const c of out.colours) assert.ok(!autumn(c), `${c} is not a leaf colour`);
    const clears = out.calls.filter(c => c[0] === 'clearRect'), clips = out.calls.filter(c => c[0] === 'rect');
    assert.equal(clears.length, LEAVES.length); assert.equal(clips.length, LEAVES.length);
    LEAVES.forEach((l, k) => { const want = [(l.i % LEAF_COLS) * LEAF_CELL, Math.floor(l.i / LEAF_COLS) * LEAF_CELL, LEAF_CELL, LEAF_CELL]; assert.deepEqual(clears[k]!.slice(1), want, `sprite ${l.i}'s cell`); assert.deepEqual(clips[k]!.slice(1), want); });
  });
  it('the decal atlases are repainted on exactly the autumn pictures\' rects: the lots\' leaf group, the map decals, the nature patches; and in desert colours only', () => {
    const rects = (cs: Call[]) => cs.filter(c => c[0] === 'clearRect').map(c => c.slice(1));
    const lot = desertLotDecals() as unknown as FakeCanvas, map = desertMapDecals() as unknown as FakeCanvas, nat = desertNature() as unknown as FakeCanvas;
    assert.deepEqual(rects(lot.calls), LOT_DECALS.filter(d => d.group === 'leaves').map(d => [d.x, d.y, d.w, d.h]));
    assert.deepEqual(rects(map.calls), DECALS.map(d => [d.x, d.y, d.w, d.h]));
    assert.deepEqual(rects(nat.calls), NATURE.map(n => [n.x, n.y, n.w, n.h]));
    for (const s of [lot, map, nat]) for (const c of s.colours) assert.ok(!autumn(c), `${c}`);
    // the litter and the rest of the lot decals (paper, cans, tracks) are not touched: only the leaf group is cleared
    assert.ok(!rects(lot.calls).some(r => LOT_DECALS.some(d => d.group === 'litter' && d.x === r[0] && d.y === r[1])));
  });
  it('is the same twice (a seeded stream a cell and a rect), and different cells are different pictures', () => {
    const a = desertLeafSheet() as unknown as FakeCanvas, b = desertLeafSheet() as unknown as FakeCanvas;
    assert.equal(JSON.stringify(a.calls), JSON.stringify(b.calls));
    const per = (cs: Call[]) => { const out: string[] = []; let cur: Call[] = []; for (const c of cs) { cur.push(c); if (c[0] === 'restore' && cur.some(x => x[0] === 'clearRect')) { out.push(JSON.stringify(cur)); cur = []; } } return out; };
    assert.ok(new Set(per(a.calls)).size > LEAVES.length * 0.9, 'a different picture in (nearly) every cell');
  });
  it('the fallen leaves\' atlas takes the desert tints and look: sand, stone, dry brown and sage over the desert sheet, none of the autumn tints', () => {
    const sheet = fake(480, 160), pick = () => [0, 0, 40, 40] as [number, number, number, number], used = (from: number) => new Set(made.slice(from).flatMap(c => [...c.colours]));
    let from = made.length; const desert = leafAtlasAt(0.6, sheet, pick, { tints: DESERT_TINTS, look: DESERT_TINT_LOOK }), dc = used(from);
    from = made.length; const autumnA = leafAtlasAt(0.6, sheet, pick), ac = used(from);
    assert.ok(desert.cv.width > 100 && autumnA.cv.width > 100);
    for (const t of DESERT_TINTS.filter(Boolean)) assert.ok(dc.has(t) && !ac.has(t), `the desert's ${t}`);
    for (const t of LEAF_TINTS.filter(Boolean)) assert.ok(ac.has(t) && !dc.has(t), `the leaves' ${t}`);
    assert.equal(DESERT_TINTS.length, LEAF_TINTS.length, 'the same five tints: the pictures index them the same'); assert.equal(DESERT_TINT_LOOK.length, DESERT_TINTS.length);
  });
});

describe('the one switch drives every leaf source (T384)', () => {
  const read = (p: string) => readFileSync(resolve(p), 'utf8');
  it('the ground bake picks its sheets by the surfaces file\'s desert flag, where it used the leaves: the road and ground litter, the fallen leaves, the living ground\'s litter, the lots\' decals and the map decals', () => {
    const tex = read('src/game/textures.ts'), ren = read('src/game/renderer.ts');
    assert.ok(/get desertLitter\(\): boolean \{ return !!this\.surfaces\.desert && !this\.surfaces\.autumnLitter; \}/.test(tex) && /leafSheet\(desert = this\.desertLitter\)/.test(tex) && /desertLotDecalSheet\(/.test(tex) && /mapDecalArt\(/.test(tex), 'the textures give the sheet for the theme');
    assert.ok(!/tex\.leaves\b/.test(ren) && !/this\.tex\.nature\b/.test(ren) && !/this\.tex\.decals\b/.test(ren), 'no leaf source reads an autumn sheet directly');
    assert.ok(/tex\.leafSheet\(\)/.test(ren) && /this\.tex\.desertLotDecalSheet\(\)/.test(ren) && /this\.tex\.mapDecalArt\(\)/.test(ren));
    assert.ok(/DESERT_TINTS/.test(ren) && /leafAtlases = new Map<string,/.test(ren), 'the fallen leaves\' atlas is kept for each theme');
  });
  it('the theme switch keeps the fallen leaves\' density in the desert (it was zeroed: the desert had none): the same stamps, the same cost as autumn', () => {
    const eng = read('src/game/engine.ts');
    assert.ok(!/setLeafDensity\(this\.desertTheme \? 0/.test(eng) && /setLeafDensity\(this\.desertTheme && desertLeavesDev\(\) \? 0 : this\.leafDensity\)/.test(eng), 'no zero for the desert (but the dev A/B)');
  });
});
