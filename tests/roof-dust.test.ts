// T384 (#1040): the leaves painted in the world buildings' roofs are gone in the desert theme and a soft low-contrast film of dust lies in the roofs' creases (src/game/roof-dust.ts: the sprite shader's per-pixel grade, its JavaScript twin run here on
// colours and a summary of the ring of taps round the pixel). The lead's review of the first cut: recoloured leaves read as pale dots, "a leaf pattern in a new colour, not dust". Now: no leaf shape is left; the dust is a film in the creases of a dark
// roof, under a quarter of the leaves' contrast, stronger on lit planes than on shaded ones; walls, windows, a red door and a brick wall are as drawn; autumn flags no instance. Pure: colours in, colours out; the wiring is read from the source.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BAND, DARK_BAND, DARK_LEAN, DUST_TONE, FILM, FRAC, LEAF_NEAR, RING, ROOF_DUST_CODE, ROOF_DUST_GLSL, WARM, darkLeafWeight, leafWeight, lumOf, roofGrade, warmWeight, type Around } from '../src/game/roof-dust';
import { packAlpha, unpackAlpha } from '../src/game/car-paint';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const same = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
/** a ring of one colour all round a pixel, all of it roof (no leaf in it) */
const roofAround = (c: readonly number[], over: Partial<Around> = {}): Around => ({ r: c[0]!, g: c[1]!, b: c[2]!, frac: 1, lum: lumOf(c[0]!, c[1]!, c[2]!), leaf: 0, ...over });
const NAVY = hex('#2a2f45'), LEAVES = ['#e0701f', '#d6641a', '#d9792b', '#e68a22', '#cf6a1e', '#8f3a1c', '#7a3016']; // the oranges the leaves on the roofs are painted in, and their dark russet shades

describe('roof dust (T384)', () => {
  it('a leaf\'s saturated orange and yellow are a leaf in a smooth band (never a hard edge)', () => {
    for (const c of LEAVES) { const [r, g, b] = hex(c); assert.ok(leafWeight(r, g, b) > 0.85, `${c} is a leaf (${leafWeight(r, g, b).toFixed(2)})`); }
    const steps = [0.5, 0.6, 0.66, 0.7, 0.74, 0.78, 0.82, 0.9].map(s => leafWeight(0.8, 0.8 * (1 - s) + 0.4 * s, 0.8 * (1 - s))); // (a colour of hue 30 degrees at rising saturation)
    assert.ok(steps[0] === 0 && steps[steps.length - 1]! > 0.99 && steps.some(v => v > 0.05 && v < 0.95), `an eased band: ${steps.map(v => v.toFixed(2))}`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i]! >= steps[i - 1]! - 1e-9, 'rises with the saturation');
  });

  it('no leaf shape is left: a leaf on a roof takes the roof\'s own colour (and not a paler or a warmer one: no dot, no dropping)', () => {
    for (const c of LEAVES.slice(0, 5)) {
      const [r, g, b] = hex(c), out = roofGrade(r, g, b, roofAround(NAVY));
      assert.equal(leafWeight(out[0], out[1], out[2]), 0, `${c} is no leaf now`);
      assert.ok(Math.abs(lumOf(...out) - lumOf(...NAVY)) < 0.02, `${c} is the roof's lightness (${lumOf(...out).toFixed(3)} for ${lumOf(...NAVY).toFixed(3)})`);
      assert.ok(same(out, NAVY, 0.03), `${c} is the roof's colour: ${out.map(v => v.toFixed(3))} for ${NAVY.map(v => v.toFixed(3))}`);
    }
    // on a brown roof and a grey one the same
    for (const roof of ['#5a463a', '#7b7770', '#4a3a58']) { const R = hex(roof), [r, g, b] = hex('#d6641a'), out = roofGrade(r, g, b, roofAround(R)); assert.ok(same(out, R, 0.05), `on ${roof}: ${out.map(v => v.toFixed(3))}`); }
  });

  it('the dark russet of a leaf\'s outline goes too, but only beside a leaf: a brown shingle is a brown shingle', () => {
    const [r, g, b] = hex('#4a2210');
    assert.ok(darkLeafWeight(r, g, b) > 0.9 && leafWeight(r, g, b) === 0, 'a dark russet is no leaf of the band but is its outline');
    assert.ok(same(roofGrade(r, g, b, roofAround(NAVY, { leaf: 0 })), [r, g, b], 0.01), 'with no leaf in the ring it is left (a brown roof)');
    const beside = roofGrade(r, g, b, roofAround(NAVY, { leaf: 1 }));
    assert.ok(same(beside, NAVY, 0.03), `beside a leaf it is the roof's colour: ${beside.map(v => v.toFixed(3))}`);
    for (const c of ['#4d382a', '#5a463a', '#3a2c22']) { const [R, G, B] = hex(c); assert.ok(darkLeafWeight(R, G, B) < 0.02, `${c}, a brown shingle, is not a leaf's outline (${darkLeafWeight(R, G, B).toFixed(3)})`); }
    assert.ok(LEAF_NEAR[0] < LEAF_NEAR[1]);
  });

  it('the warm blend at the edge of a leaf goes too (no ghost of a leaf is left on the roof), but only beside a leaf, and never the glow of a window or a green', () => {
    for (const c of ['#523320', '#4a2a2a', '#5a3028', '#3d2024']) { // a leaf's edge mixed into a navy roof: brown, dull red, maroon
      const [r, g, b] = hex(c);
      assert.ok(warmWeight(r, g, b, NAVY) > 0.9, `${c} is warmer than the navy roof (${warmWeight(r, g, b, NAVY).toFixed(2)})`);
      assert.ok(same(roofGrade(r, g, b, roofAround(NAVY, { leaf: 1 })), NAVY, 0.03), `${c} beside a leaf is the roof's colour`);
      assert.ok(same(roofGrade(r, g, b, roofAround(NAVY, { leaf: 0 })), [r, g, b], 0.01), `${c} with no leaf beside it is left (a brown, a maroon on its own)`);
    }
    for (const [what, c] of [['the glow of a lit window', '#e8b050'], ['an orange glow', '#ff9a30'], ['a green bush', '#4f7a2c']] as const) { const [r, g, b] = hex(c); assert.ok(warmWeight(r, g, b, NAVY) < 0.05, `${what} (${c}) is no leaf's residue`); }
    const [r, g, b] = hex('#523320'); assert.ok(warmWeight(r, g, b, hex('#5a463a')) < 0.5, 'on a roof as warm as itself it is no residue');
    assert.ok(WARM.over[0] < WARM.over[1] && WARM.valMax[0] < WARM.valMax[1]);
  });

  it('a leaf-coloured area that is no small speck on a roof is left alone: an orange wall, a big painted area (most of the ring is the same colour)', () => {
    for (const frac of [0, 0.1, 0.25]) {
      const [r, g, b] = hex('#d6641a'), out = roofGrade(r, g, b, roofAround(NAVY, { frac, leaf: 1 }));
      assert.ok(same(out, [r, g, b], 0.01), `with ${frac * 100}% of the ring roof it is untouched: ${out.map(v => v.toFixed(3))}`);
    }
    const [r, g, b] = hex('#d6641a'), whole = roofGrade(r, g, b, roofAround(NAVY, { frac: FRAC[1] }));
    assert.ok(same(whole, NAVY, 0.03), 'with the ring mostly roof it goes');
  });

  it('the dust is a low-contrast film: a crease of a dark roof is lightened by well under a quarter of what a leaf\'s contrast was, warm, and a crease only', () => {
    const roof = NAVY, leafLum = lumOf(...hex('#e0701f')), contrast = leafLum - lumOf(...roof);
    for (const depth of [0.02, 0.05, 0.09, 0.2]) {
      const px = roof.map(v => Math.max(0, v - depth)) as [number, number, number], out = roofGrade(px[0], px[1], px[2], roofAround(roof)), dl = lumOf(...out) - lumOf(...px);
      assert.ok(dl >= -1e-9, `crease ${depth}: never darker`);
      assert.ok(dl < 0.25 * contrast, `crease ${depth}: lightened by ${dl.toFixed(3)}, a leaf's contrast is ${contrast.toFixed(3)}`);
      assert.ok(dl < 0.09, `crease ${depth}: ${dl.toFixed(3)} is barely lighter`);
      if (depth >= 0.05) assert.ok(out[0] - px[0] > out[2] - px[2], 'and it is warm (red gains more than blue)');
    }
    // the film follows the crease: a deeper one holds more
    const at = (depth: number) => { const px = roof.map(v => Math.max(0, v - depth)) as [number, number, number]; return lumOf(...roofGrade(px[0], px[1], px[2], roofAround(roof))) - lumOf(...px); };
    assert.ok(at(0.02) < at(0.05) && at(0.05) < at(0.09), `deeper, more: ${at(0.02).toFixed(4)} ${at(0.05).toFixed(4)} ${at(0.09).toFixed(4)}`);
    // the fullest film is at most FILM.amount of the way to the sand
    const px = roof.map(v => v * 0.2) as [number, number, number], full = roofGrade(px[0], px[1], px[2], roofAround(roof));
    for (let c = 0; c < 3; c++) assert.ok(full[c]! - px[c]! <= (DUST_TONE[c]! - px[c]!) * FILM.amount + 1e-9, 'at most the film\'s amount toward the dust');
    // no crease, no film: the pixel the roof's own colour is as it was
    assert.ok(same(roofGrade(roof[0], roof[1], roof[2], roofAround(roof)), roof), 'a flat roof is untouched');
    assert.ok(same(roofGrade(roof[0] + 0.05, roof[1] + 0.05, roof[2] + 0.05, roofAround(roof)), [roof[0] + 0.05, roof[1] + 0.05, roof[2] + 0.05]), 'a lighter pixel than its round is untouched (dust is not a highlight)');
  });

  it('the sun at the upper right: the film is stronger on the lit planes (the lighter ones) than on the shaded planes (the darker ones)', () => {
    const dl = (roofL: number) => { const roof: [number, number, number] = [roofL * 0.9, roofL * 0.95, roofL * 1.3], px = roof.map(v => v - 0.07) as [number, number, number]; return lumOf(...roofGrade(px[0], px[1], px[2], roofAround(roof))) - lumOf(...px); };
    assert.ok(dl(0.30) > dl(0.12) * 1.3, `lit ${dl(0.30).toFixed(4)} over shaded ${dl(0.12).toFixed(4)}`);
    assert.ok(dl(0.12) > 0, 'the shaded plane still gets a little, muted');
  });

  it('walls and windows get none, a light roof gets none: the dust lies in the creases of dark roofs', () => {
    const wall = hex('#d8c9a8'), window = hex('#27303f'), grey = hex('#7b7770');
    assert.ok(same(roofGrade(window[0], window[1], window[2], roofAround(wall)), window), 'a dark window pane in a pale wall is as drawn');
    const crease = grey.map(v => v - 0.1) as [number, number, number];
    assert.ok(same(roofGrade(crease[0], crease[1], crease[2], roofAround(grey)), crease, 1e-6), 'a crease of a light roof is as drawn');
    assert.ok(same(roofGrade(wall[0] - 0.1, wall[1] - 0.1, wall[2] - 0.1, roofAround(wall)), [wall[0] - 0.1, wall[1] - 0.1, wall[2] - 0.1]), 'a shade on a wall is as drawn');
  });

  it('everything that is not a leaf is as drawn: a roof\'s greys, blues and dark browns, a lit window\'s glow, a red door, a brick wall, a pale wall, a green bush, a tree trunk, a black outline', () => {
    for (const [what, c] of [
      ['a slate roof', '#4a4f5c'], ['a blue roof', '#2f3d6b'], ['a dark brown shingle', '#4d382a'], ['a grey shingle', '#7b7770'], ['a lit window', '#ffc860'], ['a window\'s orange glow', '#ff9a30'], ['a red door', '#a8281a'],
      ['a brick wall', '#9c4a3a'], ['a darker brick', '#7a3a2c'], ['a pale clapboard wall', '#d8c9a8'], ['a green bush', '#4f7a2c'], ['a tree trunk', '#5a3d22'], ['a black outline', '#14110e'], ['white trim', '#f3efe6'],
    ] as const) {
      const [r, g, b] = hex(c);
      assert.ok(same(roofGrade(r, g, b, roofAround([r, g, b])), [r, g, b], 0.01), `${what} (${c}) is left as it is among its own colour (leaf weight ${leafWeight(r, g, b).toFixed(3)})`);
      assert.ok(same(roofGrade(r, g, b, roofAround(hex('#d8c9a8'))), [r, g, b], 0.01), `${what} (${c}) is left as it is in a pale wall`);
    }
  });

  it('the GLSL is the same arithmetic: its numbers are the JavaScript\'s, and the code the instances carry is clear of the car paints\' codes and of the tint\'s, and survives packing', () => {
    const g = ROOF_DUST_GLSL;
    for (const n of [...BAND.sat, ...BAND.valLo, ...BAND.valHi, ...DARK_BAND.sat, ...DARK_BAND.val, ...LEAF_NEAR, ...FRAC, ...FILM.crease, ...FILM.roofRound, ...FILM.roofSelf, ...FILM.lit, ...WARM.over, ...WARM.valMax, WARM.green]) assert.ok(g.includes(String(n)), `${n} is in the shader`);
    for (const n of [BAND.hue[0] - BAND.hueSoft, BAND.hue[0], BAND.hue[1], BAND.hue[1] + BAND.hueSoft + 3, DARK_BAND.hue[0] - DARK_BAND.hueSoft, DARK_BAND.hue[0], DARK_BAND.hue[1], DARK_BAND.hue[1] + DARK_BAND.hueSoft]) assert.ok(g.includes(n.toFixed(1)), `${n} degrees is in the shader`);
    for (const n of DUST_TONE) assert.ok(g.includes(n.toFixed(2)));
    assert.ok(g.includes(FILM.amount.toFixed(3)) && g.includes(FILM.litFloor.toFixed(3)) && g.includes(DARK_LEAN.toFixed(1)));
    assert.ok(g.includes(`k < ${RING.taps}`) && g.includes(`${RING.inner}.0`) && g.includes(`${RING.outer}.0`), 'the ring of taps');
    assert.ok(g.includes('if (k < 6) leaf = max(leaf, lw);'), 'the leaf beside a pixel is the inner ring\'s');
    assert.ok(/atlasTex\(uv \+ vec2\(cos\(a\), sin\(a\)\) \* \(r \* px\), page\)/.test(g), 'the taps are of the sprite\'s own atlas cell');
    assert.ok(ROOF_DUST_CODE > 40, 'past every paint code (paint + 16 x body: under 40)');
    const back = unpackAlpha(packAlpha(0.75, false, ROOF_DUST_CODE)); assert.equal(back.tint, ROOF_DUST_CODE + 1); assert.ok(Math.abs(back.alpha - 0.75) < 1e-9);
  });

  it('is wired: the world\'s buildings carry the code in the desert theme only, the shader grades them before the car paint, and the switch sets it (autumn flags nothing)', () => {
    const read = (p: string) => readFileSync(resolve(p), 'utf8'), gl = read('src/game/gl.ts'), sp = read('src/game/sprites.ts'), eng = read('src/game/engine.ts'), art = read('src/game/newart.ts');
    assert.ok(/else if \(vTint > \$\{ROOF_DUST_CODE\}\.5\) c\.rgb = roofDust\(c\.rgb \/ c\.a, uv, vUV\.z\) \* c\.a;[\s\S]*else if \(vTint > 1\.5\) c\.rgb = carPaint/.test(gl), 'the dust before the paint');
    assert.ok(/\$\{ROOF_DUST_GLSL\}/.test(gl) && gl.indexOf('${atlas}') < gl.indexOf('${ROOF_DUST_GLSL}'), 'after the atlas lookup it calls');
    assert.ok(/const ROOFED = new Set\(\['house', 'building', 'venue'\]\)/.test(sp) && /DESERT_THEME\.dust && ROOFED\.has\(it\.kind\) && !DESERT_THEME\.keep\?\.\(d\) \? ROOF_DUST_CODE : 0/.test(sp), 'only buildings, not the course\'s own');
    assert.ok(/d0\.paint \? paintCode\(l\.item, d0\.paint\) : roofCode\(it, d0\)/.test(sp));
    assert.ok(/DESERT_THEME\.dust = this\.desertTheme && !desertLeavesDev\(\)/.test(eng) && /dust: boolean/.test(art) && /dust: false/.test(art));
  });
});
