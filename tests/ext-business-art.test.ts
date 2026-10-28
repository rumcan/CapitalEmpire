import test from 'node:test';
import assert from 'node:assert/strict';
import { businessArt, BUSINESS_IMAGE } from '../src/game/business/art';
import { BUSINESSES } from '../src/game/business/catalogue';
import { LIBRARY, ATLAS_PAGES } from '../src/game/library';
import { BUSINESS_THUMBS } from '../src/game/business-library';
import { drawnAs } from '../src/game/mirror';
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

test('R turns the same composition and exchanges world axes; no picture is mirrored (the four-view art turns, the rest stays unflipped)', () => {
  const b = BUSINESSES.find(b => b.id === 'golf')!;
  const normal = businessArt({ id: 1, type: b.id, x: 20, y: 30, ...b.footprint }, LIBRARY, index);
  const turned = businessArt({ id: 1, type: b.id, x: 20, y: 30, w: b.footprint.h, h: b.footprint.w }, LIBRARY, index);
  assert.equal(normal.length, turned.length);
  for (let i = 0; i < normal.length; i++) {
    // four-view art turns to its partner view (sized to the same share of the parcel); any other picture is drawn as it is: never flipped
    const [id] = drawnAs(LIBRARY[normal[i].item]!, true);
    assert.equal(LIBRARY[turned[i].item]!.id, id);
    assert.equal(turned[i].flip, false);
    if (turned[i].item === normal[i].item) assert.equal(turned[i].scale, normal[i].scale);
    assert.ok(Math.abs((turned[i].x - 20) - (normal[i].y - 30)) < 1e-8);
    assert.ok(Math.abs((turned[i].y - 30) - (normal[i].x - 20)) < 1e-8);
  }
});

test('the starter clubhouse is drawn at the clubhouse footprint on any parcel (the owner, 2026-10-28: "monterous", then "too smal", then "good now")', async () => {
  const { BUSINESS } = await import('../src/game/business/catalogue');
  const { footprintSpan, lookOf } = await import('../src/game/newart');
  const fp = BUSINESS.clubhouse.footprint, want = (fp.w + fp.h) / 2;
  // the town start's 40 x 24 venue and a clubhouse the player placed at the catalogue's 20 x 12: the same picture size
  for (const [w, h] of [[40, 24], [fp.w, fp.h]] as const) {
    const [p] = businessArt({ id: 1, type: 'clubhouse', x: 100, y: 200, w, h }, LIBRARY, index);
    assert.ok(p, `a clubhouse prop on ${w} x ${h}`);
    const look = lookOf(p!), n = LIBRARY[look.item]!;
    // the grand clubhouse stands in for the shack: its picture spans the footprint (not 4x it, as its 1 x 1 placeholder box made it)
    assert.ok(Math.abs(footprintSpan(n) * look.scale - want) < 0.01, `${w} x ${h}: drawn span ${footprintSpan(n) * look.scale} = ${want}`);
  }
});
