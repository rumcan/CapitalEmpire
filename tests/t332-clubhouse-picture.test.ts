// T332 (#958): the clubhouse showed its name label and no picture. The shack (golf:clubhouse-shanty) was drawn at its studio size (0.317, the owner,
// 2026-11-02), 2.7 tiles across a 20 x 12 plot, right under the plot-centred "CLUBHOUSE · L1" label that hid it. The clubhouse fills its footprint
// again (#593), never past its pixels. The world picture has no tiers: every level of the clubhouse draws the one LAYOUT.clubhouse composition
// (business/art.ts businessArt reads only the type and the plot), so the placements below cover the shack, the starter clubhouse and every upgrade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { businessArt } from '../src/game/business/art';
import { BUSINESS } from '../src/game/business/catalogue';
import { LIBRARY, ATLAS_PAGES } from '../src/game/library';
import { footprintSpan, lookOf } from '../src/game/newart';
import { REMOVED_IDS } from '../src/game/lots/scales';

const index = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const REMOVED = new Set(REMOVED_IDS);
const fp = BUSINESS.clubhouse.footprint, want = (fp.w + fp.h) / 2;
/** the clubhouse's plots: the catalogue's 20 x 12 a range start places (and turned by R), the town start's 40 x 24 venue (and turned) */
const PLOTS: [number, number][] = [[fp.w, fp.h], [fp.h, fp.w], [40, 24], [24, 40]];

test('every clubhouse plot draws a library picture the owner has not removed, on a real atlas page, with pixels', () => {
  for (const [w, h] of PLOTS) {
    const ps = businessArt({ id: 1, type: 'clubhouse', x: 100, y: 200, w, h }, LIBRARY, index);
    assert.ok(ps.length >= 1, `${w} x ${h}: the clubhouse draws a picture`);
    for (const p of ps) {
      const look = lookOf(p), it = LIBRARY[look.item];
      assert.ok(it, `${w} x ${h}: drawn as a library item`);
      assert.ok(!look.hidden, `${w} x ${h}: ${it!.id} is not hidden`);
      assert.ok(!REMOVED.has(it!.id) && !REMOVED.has(LIBRARY[p.item]!.id), `${w} x ${h}: ${it!.id} is not a removed picture`);
      const [page, u0, v0, u1, v1] = it!.tex;
      assert.ok(page >= 0 && page < ATLAS_PAGES.length && u1 > u0 && v1 > v0, `${w} x ${h}: ${it!.id} has an atlas rect (page ${page} of ${ATLAS_PAGES.length})`);
      assert.ok(look.scale > 0 && Number.isFinite(look.scale), `${w} x ${h}: a drawn scale (${look.scale})`);
      // inside its plot
      assert.ok(p.x > 100 && p.x < 100 + w && p.y > 200 && p.y < 200 + h, `${w} x ${h}: anchored on its plot`);
    }
  }
});

test('the clubhouse picture spans a sensible share of its footprint (not 2.7 of its 16 tiles), and never more than the footprint', () => {
  for (const [w, h] of PLOTS) {
    const [p] = businessArt({ id: 1, type: 'clubhouse', x: 100, y: 200, w, h }, LIBRARY, index);
    const look = lookOf(p!), span = footprintSpan(LIBRARY[look.item]!) * look.scale;
    assert.ok(span >= 0.4 * want, `${w} x ${h}: drawn ${span.toFixed(2)} tiles across, at least 40% of the footprint's ${want}`);
    assert.ok(span <= want * 1.02, `${w} x ${h}: drawn ${span.toFixed(2)} tiles across, within the footprint's ${want}`);
  }
});
