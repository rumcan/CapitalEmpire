import test from 'node:test';
import assert from 'node:assert/strict';
import { businessArt, BUSINESS_IMAGE } from '../src/game/business/art';
import { BUSINESSES } from '../src/game/business/catalogue';
import { LIBRARY, ATLAS_PAGES } from '../src/game/library';
import { BUSINESS_THUMBS } from '../src/game/business-library';
import { hasLettering } from '../src/game/lots/lettering';
const index = new Map(LIBRARY.map((it, i) => [it.id, i]));

test('every catalogue business has delivered thumbnails and world sprites inside its parcel', () => {
  for (const b of BUSINESSES) {
    assert.ok(Object.prototype.hasOwnProperty.call(BUSINESS_THUMBS, BUSINESS_IMAGE[b.id]), b.id + ' thumbnail');
    const d = { id: 2, type: b.id, x: 100, y: 200, ...b.footprint };
    const props = businessArt(d, LIBRARY, index);
    assert.ok(props.length, b.id + ' world artwork');
    for (const p of props) {
      assert.ok(p.x0 >= d.x && p.y0 >= d.y && p.x1 <= d.x + d.w && p.y1 <= d.y + d.h, b.id + ' art footprint');
      assert.ok(p.scale > 0 && Number.isFinite(p.scale));
      assert.ok(LIBRARY[p.item].tex[0] < ATLAS_PAGES.length);
      assert.equal(p.auto, 'business-art');
    }
  }
});

test('R mirrors the same composition and exchanges world axes without changing sprite scale', () => {
  const b = BUSINESSES.find(b => b.id === 'golf')!;
  const normal = businessArt({ id: 1, type: b.id, x: 20, y: 30, ...b.footprint }, LIBRARY, index);
  const turned = businessArt({ id: 1, type: b.id, x: 20, y: 30, w: b.footprint.h, h: b.footprint.w }, LIBRARY, index);
  assert.equal(normal.length, turned.length);
  for (let i = 0; i < normal.length; i++) {
    assert.equal(turned[i].item, normal[i].item);
    assert.equal(turned[i].scale, normal[i].scale);
    assert.equal(turned[i].flip, !hasLettering(LIBRARY[turned[i].item]!.id, LIBRARY[turned[i].item]!.name));
    assert.ok(Math.abs((turned[i].x - 20) - (normal[i].y - 30)) < 1e-8);
    assert.ok(Math.abs((turned[i].y - 30) - (normal[i].x - 20)) < 1e-8);
  }
});
