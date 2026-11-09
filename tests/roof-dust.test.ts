// T384 (#1040): the leaves painted in the world buildings' roofs are dust in the desert theme (src/game/roof-dust.ts: the sprite shader's per-pixel grade, its JavaScript twin run here on colours): the saturated oranges and yellows of a
// leaf go to the colour of dry sand at their own brightness; the roofs, the walls, a lit window, a red door and a brick wall are as drawn; autumn flags no instance. Pure: colours in, colours out; the wiring is read from the source.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BAND, DUST_RGB, ROOF_DUST_CODE, ROOF_DUST_GLSL, leafWeight, roofDust } from '../src/game/roof-dust';
import { packAlpha, unpackAlpha } from '../src/game/car-paint';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const same = (a: readonly number[], b: readonly number[], eps = 1e-6) => a.every((v, i) => Math.abs(v - b[i]!) < eps);

describe('roof dust (T384)', () => {
  it('a leaf\'s saturated orange and yellow go to sand at their own brightness, in a smooth band (never a flat wash)', () => {
    for (const c of ['#e0701f', '#d6641a', '#d9792b', '#e68a22', '#cf6a1e']) { // the oranges the leaves on the roofs are painted in
      const [r, g, b] = hex(c), d = roofDust(r, g, b), mx = Math.max(r, g, b);
      assert.ok(leafWeight(r, g, b) > 0.85, `${c} is a leaf (${leafWeight(r, g, b).toFixed(2)})`);
      assert.ok(Math.abs(Math.max(...d) - mx) < 0.02, `${c}: its brightness is kept (${Math.max(...d).toFixed(3)} against ${mx.toFixed(3)})`);
      assert.ok(d[0] > d[1] && d[1] > d[2] && d[2] / d[0] > 0.6 && d[1] / d[0] > 0.8, `${c} becomes sand: ${d.map(v => v.toFixed(2))}`);
    }
    // between the leaf's band and the roof's colours the grade eases: no hard edge
    const steps = [0.5, 0.6, 0.66, 0.7, 0.74, 0.78, 0.82, 0.9].map(s => leafWeight(0.8, 0.8 * (1 - s) + 0.4 * s, 0.8 * (1 - s))); // (a colour of hue 30 degrees at rising saturation)
    assert.ok(steps[0] === 0 && steps[steps.length - 1]! > 0.99 && steps.some(v => v > 0.05 && v < 0.95), `an eased band: ${steps.map(v => v.toFixed(2))}`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i]! >= steps[i - 1]! - 1e-9, 'rises with the saturation');
  });

  it('everything that is not a leaf is as drawn: a roof\'s greys, blues and dark browns, a lit window\'s glow, a red door, a brick wall, a pale wall, a green bush, a tree trunk, a black outline', () => {
    for (const [what, c] of [
      ['a slate roof', '#4a4f5c'], ['a blue roof', '#2f3d6b'], ['a dark brown shingle', '#4d382a'], ['a grey shingle', '#7b7770'], ['a lit window', '#ffc860'], ['a window\'s orange glow', '#ff9a30'], ['a red door', '#a8281a'],
      ['a brick wall', '#9c4a3a'], ['a darker brick', '#7a3a2c'], ['a pale clapboard wall', '#d8c9a8'], ['a green bush', '#4f7a2c'], ['a tree trunk', '#5a3d22'], ['a black outline', '#14110e'], ['white trim', '#f3efe6'],
    ] as const) { const [r, g, b] = hex(c); assert.ok(same(roofDust(r, g, b), [r, g, b], 0.02), `${what} (${c}) is left as it is (weight ${leafWeight(r, g, b).toFixed(3)})`); }
  });

  it('the GLSL is the same arithmetic: its band numbers are the JavaScript\'s, and the code the instances carry is clear of the car paints\' codes and of the tint\'s, and survives packing', () => {
    const g = ROOF_DUST_GLSL;
    for (const n of [...BAND.sat, ...BAND.valLo, ...BAND.valHi]) assert.ok(g.includes(String(n)), `${n} is in the shader`);
    for (const n of [BAND.hue[0] - BAND.hueSoft, BAND.hue[0], BAND.hue[1], BAND.hue[1] + BAND.hueSoft + 3]) assert.ok(g.includes(n.toFixed(1)), `${n} degrees is in the shader`);
    for (const n of DUST_RGB) assert.ok(g.includes(n.toFixed(2)));
    assert.ok(ROOF_DUST_CODE > 40, 'past every paint code (paint + 16 x body: under 40)');
    const back = unpackAlpha(packAlpha(0.75, false, ROOF_DUST_CODE)); assert.equal(back.tint, ROOF_DUST_CODE + 1); assert.ok(Math.abs(back.alpha - 0.75) < 1e-9);
  });

  it('is wired: the world\'s buildings carry the code in the desert theme only, the shader grades them before the car paint, and the switch sets it (autumn flags nothing)', () => {
    const read = (p: string) => readFileSync(resolve(p), 'utf8'), gl = read('src/game/gl.ts'), sp = read('src/game/sprites.ts'), eng = read('src/game/engine.ts'), art = read('src/game/newart.ts');
    assert.ok(/else if \(vTint > \$\{ROOF_DUST_CODE\}\.5\) c\.rgb = roofDust\(c\.rgb \/ c\.a\) \* c\.a;[\s\S]*else if \(vTint > 1\.5\) c\.rgb = carPaint/.test(gl), 'the dust before the paint');
    assert.ok(/\$\{ROOF_DUST_GLSL\}/.test(gl));
    assert.ok(/const ROOFED = new Set\(\['house', 'building', 'venue'\]\)/.test(sp) && /DESERT_THEME\.dust && ROOFED\.has\(it\.kind\) && !DESERT_THEME\.keep\?\.\(d\) \? ROOF_DUST_CODE : 0/.test(sp), 'only buildings, not the course\'s own');
    assert.ok(/d0\.paint \? paintCode\(l\.item, d0\.paint\) : roofCode\(it, d0\)/.test(sp));
    assert.ok(/DESERT_THEME\.dust = this\.desertTheme && !desertLeavesDev\(\)/.test(eng) && /dust: boolean/.test(art) && /dust: false/.test(art));
  });
});
