// T303 (#888; the owner: "painting palm trees should not have a texture and blend area when you select Erase?? also the painting of trees and
// plants etc should not have a mode or pick button that brings up texture and blend"): with a plant brush in hand, painting or rubbing out, the
// Paint panel shows the plant controls only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { PaintTool } from '../src/game/paint-tool';
import { PLANT_KINDS } from '../src/game/plant';
import { PaintPanel } from '../src/PaintPanel';
import type { Game } from '../src/game/engine';

const HOST = { setLotGround() {}, emit() {}, save() {}, toast() {}, affine() {}, placeProps: () => 0, plant: () => 0, unplant: () => 0, plantPool: () => [] };

test('a plant brush (every kind), painting and in Rub out: no Draw / Pick / Erase, no texture, blend or edges; a way back to the ground', () => {
  const p = new PaintTool({ ...HOST });
  const game = { paint: p, golfMode: false, plantPool: () => [], plantedCount: () => 0, emit() {} } as unknown as Game;
  for (const k of PLANT_KINDS) for (const rub of [false, true]) {
    p.setPlant(k.kind); p.rubOut = rub;
    const h = renderToStaticMarkup(createElement(PaintPanel, { game }));
    assert.doesNotMatch(h, /data-testid="paint-modes"/, `${k.name}${rub ? ' rub out' : ''}: no mode row`);
    assert.doesNotMatch(h, />(Draw|Pick|Erase)</, 'no Draw, Pick or Erase button');
    assert.doesNotMatch(h, /Texture|Blend|Edges|Planting method/i, 'no surface controls');
    assert.match(h, />Rub out</, 'its own Rub out'); assert.match(h, /Spacing/);
    assert.match(h, /data-testid="plant-leave"/, 'Paint ground goes back to the surfaces');
  }
});
