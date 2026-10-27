// Headless tests for T199 (#517): the small streams drawn as swamp, and the swamp's pools' camera glint (src/game/swamp.ts; the drawing is
// renderer.ts step 1 and gl.ts FS_QUAD's glossLight; the look is checked in the browser by scripts/dev/swamp-shots.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ASPHALT_MEAN } from '../src/game/ground-art';
import { clampSurfaces, lookOfTex, SURFACES, surfaceOfTex } from '../src/game/painted-surfaces';
import file from '../src/game/painted-surfaces.json';
import tiles from '../src/game/painted-tiles.json';
import { SPEC_LOOK } from '../src/game/lamp-reflect';
import { GLOSS, GLOSS_LIGHT_GLSL, KEY, SWAMP, SWAMP_OUT, SwampField, bandAt, glossGain, glossPixel, glossTile, swampKey, swampStreams } from '../src/game/swamp';

const lum = (c: readonly number[]) => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;
/** a wavy creek of width w (tiles) from (x0, y0), n points 6 tiles apart */
const creek = (x0: number, y0: number, n: number, w = 6) => Array.from({ length: n }, (_, k) => ({ x: x0 + k * 4.2 + 3 * Math.sin(k * 0.7), y: y0 + k * 4.3 + 2.5 * Math.cos(k * 0.5), w }));
/** the plain distance from (x, y) past the channel's edge (the nearest segment's) */
const plainEdge = (pts: readonly { x: number; y: number; w: number }[], x: number, y: number) => {
  let e = Infinity;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k]!, b = pts[k + 1]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2));
    e = Math.min(e, Math.hypot(a.x + dx * t - x, a.y + dy * t - y) - (a.w + (b.w - a.w) * t) / 2);
  }
  return e;
};

test('T199 the swamp surface: listed for the studio, mapped to the swamp tile set; #630\'s banks and the river keep theirs', () => {
  const s = SURFACES.find(v => v.key === 'swamp');
  assert.ok(s, 'a swamp surface'); assert.equal(s!.group, 'Map'); assert.deepEqual([...s!.tex], ['swamp']); assert.ok(s!.kinds.includes('water'));
  assert.equal(surfaceOfTex('swamp'), 'swamp');
  const f = clampSurfaces(file);
  assert.equal(f.surfaces.swamp?.family, 'swamp-run'); assert.equal(lookOfTex('swamp', f)?.family, 'swamp-run');
  const fam = (tiles as { families: { id: string; kind: string }[] }).families.find(v => v.id === 'swamp-run');
  assert.ok(fam, 'swamp-run is in the tile manifest'); assert.equal(fam!.kind, 'water');
  assert.equal(f.surfaces.bank?.family, 'pond-bank-run'); assert.equal(lookOfTex('creek', f)?.family, 'pond-bank-run'); assert.equal(lookOfTex('water', f)?.family, f.surfaces.river?.family);
  // unmapped (the owner's choice in Studio > Painted), the streams keep their old creek bed (renderer.ts swampOn)
  assert.equal(lookOfTex('swamp', clampSurfaces({ ...file, surfaces: { ...file.surfaces, swamp: undefined } })), null);
});

test('T199 the streams draw swamp and the river does not', () => {
  const river = { kind: 'river' as const, pts: [{ x: 100, y: 400, w: 30 }, { x: 400, y: 400, w: 30 }] };
  const stream = { kind: 'creek' as const, pts: creek(150, 100, 30) };
  assert.deepEqual(swampStreams([river, stream]), [stream]);
  const f = new SwampField(swampStreams([river, stream]));
  for (const p of stream.pts) assert.equal(f.cover(p.x, p.y), 1, 'the stream\'s channel is swamp');
  for (const x of [120, 200, 300, 380]) { assert.equal(f.cover(x, 400), 0, 'the river is not'); assert.equal(f.cover(x, 400 - 15 - 2), 0, 'nor its bank'); }
  assert.equal(new SwampField(swampStreams([river])).alpha(80, 360, 340, 80, 1), null, 'a river alone lays no swamp');
  // the renderer: the band from the streams' field, laid before the river's bank; the river's bank and water as before; off, the creek bed as before
  const r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'), step1 = r.slice(r.indexOf('// ---- 1. terrain:'), r.indexOf('const walk = net.walkF'));
  assert.match(r, /this\.swampField = new SwampField\(swampStreams\(waters\)\)/);
  assert.match(step1, /this\.swampOn\(\) \? this\.swampField\.alpha\(tx0, ty0, bw, bh, cres\)/);
  assert.ok(step1.indexOf('this.swampField.alpha(') < step1.indexOf("layer('bank', g => shore(g, rivers, 3, 0.8))"), 'the swamp lies under the river\'s bank');
  assert.match(step1, /if \(rivers\.length\) layer\('water', g => shore\(g, rivers, 0, 0\.3\), water\);/);
  assert.match(step1, /: shore\(g, creeks, 0\.5, 0\.5\)\)\)/, 'the old creek bed, off');
  assert.equal(SWAMP.water, 0.35); assert.equal(SWAMP.waterFeather, 0.25); assert.match(step1, /layer\('water', g => shore\(g, creeks, 0, SWAMP\.waterFeather, SWAMP\.water\), water\)/, 'the stream\'s water as narrow as before');
});

test('T199 the band: whole over its channel, a rugged rim that never runs straight, nothing past SWAMP_OUT', () => {
  const pts = creek(200, 200, 40), f = new SwampField([{ pts }]);
  // along the stream (away from its ends), the rim's distance from the centreline on one side, a tile apart
  const rim: number[] = [];
  for (let k = 4; k < 34; k++) for (let s = 0; s < 1; s += 0.25) {
    const a = pts[k]!, b = pts[k + 1]!, x = a.x + (b.x - a.x) * s, y = a.y + (b.y - a.y) * s, l = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / l, ny = (b.x - a.x) / l;
    for (let d = 0; d <= a.w / 2 + SWAMP.core; d += 0.25) assert.equal(f.cover(x + nx * d, y + ny * d), 1, 'whole over the channel and its core');
    let edge = 0; for (let d = 0; d < 20; d += 0.05) if (f.cover(x + nx * d, y + ny * d) < 0.5) { edge = d; break; }
    rim.push(edge);
  }
  const mean = rim.reduce((s, v) => s + v, 0) / rim.length, sd = Math.sqrt(rim.reduce((s, v) => s + (v - mean) ** 2, 0) / rim.length);
  assert.ok(mean > 3 + 2 && mean < 3 + SWAMP_OUT, `it widens well past the channel: ${mean.toFixed(2)}`);
  assert.ok(sd > 0.6, `rugged: the rim's distance varies (sd ${sd.toFixed(2)} tiles)`);
  // never straight: no run of 4 tiles where the rim's distance moves by less than a tenth of a tile a step
  let run = 0, longest = 0; for (let i = 1; i < rim.length; i++) { run = Math.abs(rim[i]! - rim[i - 1]!) < 0.025 ? run + 1 : 0; longest = Math.max(longest, run); }
  assert.ok(longest < 16, `a straight run of ${longest / 4} tiles`);
  // past the farthest reach (on the plain distance, less the soft union's most), nothing
  for (let x = 150; x < 400; x += 3.7) for (let y = 150; y < 400; y += 3.3) if (plainEdge(pts, x, y) > SWAMP_OUT + SWAMP.soft * Math.log(3)) assert.equal(f.cover(x, y), 0, `${x}, ${y}`);
  assert.equal(bandAt(SWAMP_OUT, 0, 0), 0); assert.equal(bandAt(-1, 0, 0), 1);
});

test('T199 the band rounds the inside of a bend (no sharp corner) and every chunk lays the same cover', () => {
  // a right-angle bend: on its inside the plain distance's level set has a corner; the soft distance pulls the rim out round it
  const bend = [{ x: 300, y: 200, w: 6 }, { x: 300, y: 260, w: 6 }, { x: 360, y: 260, w: 6 }], f = new SwampField([{ pts: bend }]);
  const corner = f.edge(f.near(296, 264, 296, 264), 293, 267), plain = plainEdge(bend, 293, 267);
  assert.ok(corner < plain - 0.5, `the inside of the bend: soft ${corner.toFixed(2)} vs plain ${plain.toFixed(2)}`);
  // two chunks' boxes overlapping by a band of whole tiles sample the same points there: the same cover, and the point query agrees
  const pts = creek(500, 500, 30), g = new SwampField([{ pts }]), res = 4;
  const A = g.alpha(540, 530, 40, 40, res)!, B = g.alpha(560, 530, 40, 40, res)!;
  assert.ok(A && B);
  let n = 0;
  for (let v = 0; v < A.H; v++) for (let u = 20 * res; u < A.W; u++) {
    const a = A.data[(v * A.W + u) * 4 + 3]!, b = B.data[(v * B.W + u - 20 * res) * 4 + 3]!; assert.equal(a, b, `sample ${u}, ${v}`);
    if (u % 7 === 0 && v % 5 === 0) { assert.equal(a, Math.round(g.cover(540 + (u + 0.5) / res, 530 + (v + 0.5) / res) * 255)); n++; }
  }
  assert.ok(n > 50);
  // its box holds every sample it covers
  const [bx0, by0, bx1, by1] = A.box;
  for (let v = 0; v < A.H; v++) for (let u = 0; u < A.W; u++) if (A.data[(v * A.W + u) * 4 + 3]! > 0) { const x = 540 + (u + 0.5) / res, y = 530 + (v + 0.5) / res; assert.ok(x >= bx0 && x <= bx1 && y >= by0 && y <= by1); }
});

test('T199 the pools by their colour: the swamp\'s teal water, not its grass, mud, the asphalt, leaves or lines', () => {
  assert.ok(swampKey(40, 79, 68) > 0.99, 'the swamp tiles\' mean water');
  assert.ok(swampKey(11, 82, 99) > 0.99, 'the lake\'s water is water too');
  for (const c of [[82, 85, 44], [98, 72, 52], [76, 84, 38], ASPHALT_MEAN, [205, 95, 30], [225, 222, 205], [120, 110, 90], [62, 70, 66]]) assert.equal(swampKey(c[0]!, c[1]!, c[2]!), 0, `${c}`);
  assert.ok(KEY.br[0] < KEY.br[1] && KEY.gr[0] < KEY.gr[1]);
});

test('T199 the gloss mask: a tile\'s pools, inset from their edges, brightest in their open middle; its colour the pool\'s own; no seam line', () => {
  const w = 96, h = 64, src = new Uint8ClampedArray(w * h * 4), water = [40, 79, 68], grass = [82, 85, 44];
  const pool = (x: number, y: number) => Math.hypot(x - 30, y - 30) < 16 || Math.hypot(x - 75, y - 30) < 3 || Math.hypot(x - 96, y - 52) < 14; // a big pool, a small one, one cut by the border
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = pool(x + 0.5, y + 0.5) ? water : grass; src.set([...c, 255], (y * w + x) * 4); }
  const g = glossTile(src, w, h), A = (x: number, y: number) => g[(y * w + x) * 4 + 3]!;
  assert.equal(A(30, 30), 255, 'whole in the big pool\'s middle');
  assert.ok(A(30, 30) > A(30, 20) && A(30, 20) > A(30, 16), 'rising from the rim to the middle');
  for (const [x, y] of [[30, 14], [14, 30], [45, 30], [30, 45]]) assert.ok(A(x, y) <= 8, `a gap inside the edge at ${x}, ${y}: ${A(x, y)}`);
  assert.ok(A(75, 30) < 80, 'a small pool has little');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!pool(x + 0.5, y + 0.5)) assert.equal(A(x, y), 0, 'none on the grass');
  assert.deepEqual([...g.slice((30 * w + 30) * 4, (30 * w + 30) * 4 + 3)], water, 'the pool\'s own mean colour');
  // the pool cut by the tile's right border: its gloss runs to the border (more of the same water goes on in the next tile), not a line
  assert.ok(A(95, 52) > 100, `at the border ${A(95, 52)}`);
});

test('T199 the gloss of the shipped swamp tiles picks their pools and nothing else', () => {
  const tile = resolve('src/assets/ground/painted/tiles/swamp-run/near/tile-01.webp');
  const code = `import sharp from 'sharp'; const d = await sharp(${JSON.stringify(tile)}).resize(688, 384).ensureAlpha().raw().toBuffer(); process.stdout.write(d.toString('base64'));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, r.stderr);
  const raw = Buffer.from(r.stdout, 'base64'), w = 688, h = 384, src = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.length), g = glossTile(src, w, h);
  let glossy = 0, water = 0;
  for (let i = 0; i < w * h; i++) {
    const k = swampKey(src[4 * i]!, src[4 * i + 1]!, src[4 * i + 2]!); if (k >= 0.5) water++;
    if (g[4 * i + 3]! > 0) { glossy++; assert.ok(k > 0, 'only water glints'); }
  }
  assert.ok(water / (w * h) > 0.12 && water / (w * h) < 0.35, `the pools are ${(100 * water / (w * h)).toFixed(1)}% of the tile`);
  assert.ok(glossy > 0.3 * water && glossy < water, `inset: ${glossy} of ${water} water px glint`);
});

test('T199 the glint: none off or without gloss, cool and toward the sky, textured by the water, held, and strongest by day', () => {
  const m = [40, 79, 68], c = [...m];
  assert.deepEqual(glossPixel(c, m, 0, 1), c); assert.deepEqual(glossPixel(c, m, 1, 0), c);
  // on grass, a leaf, a line or the asphalt (the pixel's own key), nothing, whatever the mask says
  for (const t of [[82, 85, 44], [205, 95, 30], [225, 222, 205], ASPHALT_MEAN.map(v => v)]) assert.deepEqual(glossPixel(t, m, 1, 1), t);
  let last = lum(c); for (const k of [0.2, 0.5, 1]) { const l = lum(glossPixel(c, m, 1, k)); assert.ok(l > last, `k ${k}`); last = l; }
  const lit = glossPixel(c, m, 1, 1); assert.ok(lit[2]! - c[2]! > lit[0]! - c[0]! - 1 && lit[2]! > lit[0]!, 'cool: toward the sky\'s blue');
  // the texture stays and is the glint's mask: a lit ripple (above the mean) takes more of it than a dark hollow, and stays brighter
  const hi = c.map(v => v + 10), lo = c.map(v => v - 10), dHi = lum(glossPixel(hi, m, 1, 1)) - lum(hi), dLo = lum(glossPixel(lo, m, 1, 1)) - lum(lo);
  assert.ok(dHi > 2 * dLo && dLo > 0, `ripple +${dHi.toFixed(1)} vs hollow +${dLo.toFixed(1)}`);
  assert.ok(lum(glossPixel(hi, m, 1, 1)) - lum(glossPixel(lo, m, 1, 1)) > lum(hi) - lum(lo), 'its contrast kept, never flattened');
  // held: at most GLOSS.max of the way to the sky, however big the gain
  const top = glossPixel(c.map(v => v + 40), m, 1, 9); top.forEach((v, i) => assert.ok(v <= c[i]! + 40 + (GLOSS.sky[i]! - c[i]! - 40) * GLOSS.max + 1e-9));
  assert.equal(glossGain(SPEC_LOOK, 0), SPEC_LOOK.strength); assert.ok(glossGain(SPEC_LOOK, 1) < 0.5 * SPEC_LOOK.strength);
});

test('T199 the shader runs the same numbers, and off draws and bakes as before', () => {
  const gl = readFileSync(resolve('src/game/gl.ts'), 'utf8'), r = readFileSync(resolve('src/game/renderer.ts'), 'utf8'), e = readFileSync(resolve('src/game/engine.ts'), 'utf8'), gc = readFileSync(resolve('src/game/ground-cache.ts'), 'utf8');
  for (const v of [...GLOSS.sky, GLOSS.spread, GLOSS.floor, GLOSS.max, GLOSS.amount, ...KEY.br, ...KEY.gr]) assert.ok(GLOSS_LIGHT_GLSL.includes(Number.isInteger(v) ? v.toFixed(1) : String(v)), `GLSL has ${v}`);
  const fs = gl.slice(gl.indexOf('const FS_QUAD'), gl.indexOf('}`;', gl.indexOf('const FS_QUAD')));
  assert.match(fs, /\$\{GLOSS_LIGHT_GLSL\}/); assert.match(fs, /if \(uGloss\.z > 0\.0\)/, 'no mask or no gain: the chunk as before'); assert.match(fs, /g\.rgb \/ g\.a/);
  // off: no gain uniform (0) and the empty texture; the engine sets no glint without specCam; the bake makes no mask without it
  assert.match(gl, /const gloss = this\.gloss && this\.gloss\.gain > 0 && this\.glossOf \? this\.glossOf\(tex\) : null, gs = gloss \? this\.gloss : null;/);
  assert.match(gl, /gl\.uniform4f\(pr\.u\.uGloss, gs \? gs\.inner : 0, gs \? gs\.outer : 1, gs \? gs\.gain : 0, 0\)/);
  assert.match(e, /gl\.gloss = this\.ground\.specCam \? \{/);
  assert.match(r, /const tp = this\.specCam \? this\.tex\.paintedOf\('swamp'\)\?\.tiled : undefined;/);
  assert.match(r, /this\.specMask = null; this\.glossMask = null; this\.swampNow = null;/, 'every bake starts with no gloss mask');
  // a gloss mask goes with its picture and is deleted with it
  assert.match(gc, /const g = this\.glosses\.get\(tex\); if \(g\) \{ this\.gl\.deleteTexture\(g\); this\.glosses\.delete\(tex\); \}/);
  assert.match(gc, /m\.gloss\?\.close\(\)/);
});
