// The stand-ins' pack sizes (the owner, 2026-10-26: a resized house "is not getting any bigger"): an old building drawn as a four-view stand-in
// (newart.ts) needs that stand-in packed for its own size x their footprints' ratio. standInNeeds (run by prep-views.mjs through
// scripts/assets/stand-in-needs.ts) names every stand-in some building needs, at the largest such size; standInCandidates lists, per building,
// the stand-ins it may be drawn as once they are packed for it. Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { OWNER_SCALE } from '../src/game/lots/scales';
import { drawnAsStandIn, footprintSpan, standInCandidates, standInNeeds } from '../src/game/newart';
import { VIEW_ART } from '../src/game/views-library';

const span = (i: number) => footprintSpan(LIBRARY[i]!);
const own = (i: number) => OWNER_SCALE[LIBRARY[i]!.id] ?? 1;

test('every stand-in is packed for the largest size any building drawn as it needs', () => {
  const need = standInNeeds();
  let buildings = 0;
  LIBRARY.forEach((it, i) => {
    const cands = standInCandidates(i, own(i));
    if (!drawnAsStandIn(i) || it.kind === 'tree') { assert.deepEqual(cands, [], `${it.id} is drawn as itself: no stand-in candidates`); return; }
    if (!cands.length) return; // no new art in its family: hidden (lookOf)
    buildings++;
    for (const s of cands) {
      const n = LIBRARY[s]!, want = own(i) * span(i) / span(s);
      assert.ok(VIEW_ART.has(n.id), `${it.id}: its stand-in ${n.id} is four-view art`);
      assert.ok(need[n.id]! >= want - 1e-9, `${n.id} is packed for ${it.id} at x${own(i)}: x${need[n.id]} >= x${want.toFixed(3)}`);
    }
  });
  assert.ok(buildings > 20, `${buildings} buildings drawn as stand-ins`);
  // nothing is listed that no building needs, and every need is a real size
  for (const [id, k] of Object.entries(need)) { assert.ok(VIEW_ART.has(id), `${id} is four-view art`); assert.ok(k > 0 && Number.isFinite(k), `${id}: x${k}`); }
});

test('the candidates are the family members nearest the building in size, within 10% of the nearest', () => {
  LIBRARY.forEach((it, i) => {
    const cands = standInCandidates(i, own(i)); if (!cands.length) return;
    const dist = (s: number) => Math.abs(Math.log(own(i) * span(i) / span(s) / (OWNER_SCALE[LIBRARY[s]!.id] ?? 1))), best = Math.min(...cands.map(dist));
    for (const s of cands) assert.ok(dist(s) <= best + 0.1 + 1e-9, `${it.id}: ${LIBRARY[s]!.id} is within 10% of the nearest`);
    // a bigger building asks more of the same stand-ins
    for (const s of standInCandidates(i, own(i) * 2)) assert.ok(LIBRARY[s]!.kind !== 'tree', `${it.id} never gets a tree`);
  });
});
