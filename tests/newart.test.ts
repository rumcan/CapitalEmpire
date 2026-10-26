// The new-art preview (?newart): every building or tree is drawn as new art, on its own footprint, never mirrored against the sun.
import './helpers/newart-on';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { NEW_ART_ONLY, lookOf } from '../src/game/newart';
import { VIEW_ART } from '../src/game/views-library';
import { TREE_MIRROR } from '../src/game/tree-sun';
import { PIXEL_LIMIT } from '../src/game/sizes';

const isNew = (id: string) => VIEW_ART.has(id) || id.startsWith('view:') || id.startsWith('gen:tree-');
const span = (i: number) => { const b = LIBRARY[i]!.boxes[0]!; return b.hx + b.hy; };

test('?newart draws only new art for buildings, shops and trees, on the same footprint', () => {
  assert.equal(NEW_ART_ONLY, true);
  let swapped = 0;
  LIBRARY.forEach((it, i) => {
    if (!['house', 'building', 'venue', 'tree'].includes(it.kind) || it.id.startsWith('east:')) return;
    // the flips the game places (engine.addProp): a tree by TREE_MIRROR, new-art buildings unflipped (unmirror), old buildings either way
    const flips = it.kind === 'tree' ? [TREE_MIRROR.has(it.id)] : isNew(it.id) ? [false] : [false, true];
    for (const flip of flips) {
      const d = { item: i, flip, scale: 1.5, x: 100 + i, y: 200 - i }, look = lookOf(d), n = LIBRARY[look.item]!;
      assert.ok(isNew(n.id), `${it.id} is drawn as ${n.id}`);
      if (n.kind === 'tree') assert.equal(look.flip, TREE_MIRROR.has(n.id), `${n.id} is lit from the right as drawn`);
      else if (look.item !== i) {
        assert.equal(look.flip, false, `${n.id} is turned, never mirrored`);
        // it fills its footprint, unless that would draw it past its pixels (sizes.ts): then it is drawn at its limit
        assert.ok(Math.abs(span(look.item) * look.scale - span(i) * d.scale) < 0.01 || Math.abs(look.scale - PIXEL_LIMIT[look.item]!) < 1e-9, `${it.id}: the stand-in fills its footprint`);
      }
      if (look.item !== i) swapped++;
    }
  });
  assert.ok(swapped > 100, `${swapped} pictures swapped`);
});
