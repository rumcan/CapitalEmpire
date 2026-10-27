// T183: a lot's ground stack in the bake (renderer.ts): the lawn, then the lot's patches, the painted areas, the living ground and the car parks,
// and the decals on top of them all (the owner: "Decals in wizard dont work. maybe they are placed under the lawn?"); the sprites come after the
// ground (the GL pass). The bake is one long method: its calls' order in the source is the order they draw in.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe("a lot's ground stack (T183)", () => {
  it('lawn, patches, painted areas, living ground, car parks, then the decals on top', () => {
    const src = readFileSync('src/game/renderer.ts', 'utf8');
    const at = (call: string) => { const i = src.indexOf(call); assert.ok(i >= 0, `${call} is in the bake`); assert.equal(src.indexOf(call, i + 1), -1, `${call} is called once`); return i; };
    const order = [
      'this.drawLawns(ctx, lawns',
      'drawLots(rest);',
      'this.drawPaints(ctx, paints',
      'this.drawLiving(ctx, L',
      'drawLots(parks);',
      'this.drawMarks(ctx, marks',
    ].map(c => [c, at(c)] as const);
    for (let k = 1; k < order.length; k++) assert.ok(order[k - 1]![1] < order[k]![1], `${order[k - 1]![0]} draws before ${order[k]![0]}`);
  });
});
