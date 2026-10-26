// The contact shadows' rules and the per-sprite override table (T141, the owner, 2026-10-26: "audit each props boxed shadow. the shadows should
// be tailor made for a top right shadow"). Headless: every shadowed sprite gets a shape that fits its picture, every override names a real
// sprite with sane numbers, blob and box lean the same way (145 degrees on screen, away from the top-right sun) by the same rule, and the
// name rules the audit found wrong stay right. The GPU side (gl.ts VS_SHADOW) is checked on the audit sheet (?shadows=audit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { CAST_DEFAULT } from '../src/game/cast-shadow';
import { CONTACT_LEAN, SHADOW_KINDS, SHADOW_OVERRIDES, contactLean, kindOf, leanShift, overrideOf, placeholderBoxes, ruleKind, type ShadowKind } from '../src/game/shadow-shape';
import { VECTOR, contactOf, spriteRect, type Drawable } from '../src/game/sprites';
import { OWNER_SCALE } from '../src/game/lots/scales';
import { fourViews } from '../src/game/lots/preset-art';

// T141's rule shapes: the fallback under the hand-drawn vector shadows (T142, shadow-vector.ts), tested with those off
VECTOR.on = false;
const BY = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const wx = (x: number, y: number) => (x - y) * 64, wy = (x: number, y: number) => (x + y) * 32;
/** a drawable of library sprite i at its owner scale, its footprint from its boxes (engine.ts footprint) */
function placed(i: number, scale = OWNER_SCALE[LIBRARY[i]!.id] ?? 1, x = 200.5, y = 300.5): Drawable {
  const it = LIBRARY[i]!; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) { const hx = b.hx * scale / 2, hy = b.hy * scale / 2, dx = b.dx * scale / 2, dy = b.dy * scale / 2; x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy); }
  return { item: i, x, y, flip: false, scale, x0, y0, x1, y1 };
}
const byId = (id: string) => { const i = BY.get(id); assert.ok(i !== undefined, `${id} is in the library`); return i; };
/** a shape's width on screen (world px): a box's diamond, an ellipse's */
const widthOf = (s: { hx: number; hy: number; round: boolean }) => (s.round ? 64 * Math.hypot(s.hx, s.hy) : 64 * (s.hx + s.hy));

test('every shadowed sprite gets a contact shadow with sane numbers (none for the baked lots and the overrides that say none)', () => {
  let n = 0;
  LIBRARY.forEach((it, i) => {
    const s = contactOf(placed(i));
    if (it.kind === 'lot' || overrideOf(it.id)?.o.contact === false) { assert.equal(s, null, it.id); return; }
    // (an old building swapped for a stand-in draws the stand-in's: still a shape; one with no stand-in is hidden and casts none)
    if (!s) { assert.ok(!['tree', 'walker', 'car', 'decor', 'bush', 'lamp', 'fencex', 'fencey'].includes(it.kind), `${it.id} has a shape`); return; }
    n++;
    for (const v of [s.hx, s.hy, s.feather]) assert.ok(Number.isFinite(v) && v > 0, `${it.id} ${JSON.stringify(s)}`);
    assert.ok(s.core > 0 && s.core <= 1, it.id); assert.ok(s.lean >= 0 && s.lean <= 3, it.id);
    assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y), it.id);
  });
  assert.ok(n > 5000, `${n} shapes`);
});

test('a box never reaches wider than its picture, and sits under it', () => {
  let boxes = 0;
  LIBRARY.forEach((it, i) => {
    const k = kindOf(it); if (k === 'none' || k === 'walker' || k === 'fencex' || k === 'fencey' || overrideOf(it.id)) return;
    const d = placed(i), s = contactOf(d); if (!s || s.round) return;
    const r = spriteRect(d), pw = r[2] - r[0]; if (pw <= 8) return;
    boxes++;
    assert.ok(widthOf(s) <= pw * (k === 'vehicle' ? 1.05 : 0.9) + 1e-6, `${it.id}: box ${widthOf(s).toFixed(0)} px wide under a ${pw.toFixed(0)} px picture`);
    const cx = wx(s.x, s.y), mid = (r[0] + r[2]) / 2;
    assert.ok(Math.abs(cx - mid) <= pw / 8 + 1e-6, `${it.id}: box centre ${(cx - mid).toFixed(0)} px off the picture's middle`);
  });
  assert.ok(boxes > 1000, `${boxes} boxes`);
});

test('business art: a placeholder 2 x 2 m box gives way to the picture, for the contact shadow and the cast shadow\'s foot', () => {
  for (const id of ['business:golf-pro-shop', 'business:golf-clubhouse', 'business:fishing-rental-kiosk', 'business:golf-halfway-pavilion', 'business:golf-cart-garage']) {
    const i = byId(id), it = LIBRARY[i]!; assert.ok(placeholderBoxes(it), `${id} has the placeholder box`);
    const d = placed(i, 1), s = contactOf(d)!, r = spriteRect(d);
    assert.equal(kindOf(it), 'building', id);
    assert.ok(widthOf(s) >= 0.8 * (r[2] - r[0]), `${id}: contact ${widthOf(s).toFixed(0)} px under a ${(r[2] - r[0]).toFixed(0)} px picture`);
    assert.ok(s.foot, `${id}: the cast shadow stands on the picture's base`);
  }
});

test('a spot stands at the foot of a picture drawn above its anchor (a stop sign, a traffic light, a utility pole)', () => {
  for (const id of ['town:stop_sign', 'town:traffic_light', 'town:utility_pole']) {
    const d = placed(byId(id)), s = contactOf(d)!, r = spriteRect(d);
    assert.equal(kindOf(LIBRARY[byId(id)]!), 'pole', id);
    assert.ok(Math.abs(wy(s.x, s.y) - r[3]) < 6, `${id}: spot ${(wy(s.x, s.y) - r[3]).toFixed(1)} px from the pole's foot`);
  }
});

test('blob and box lean the same way, away from the top-right sun, by one rule that keeps them on their base', () => {
  const u = contactLean(CAST_DEFAULT);
  assert.ok(Math.abs(Math.atan2(u.y, u.x) * 180 / Math.PI - 145) < 1e-9, 'the lean follows the cast shadows (145 degrees on screen)');
  const shapes = [
    { hx: 1, hy: 1, round: true, lean: 1 }, { hx: 1, hy: 1, round: false, lean: 1 }, { hx: 3, hy: 0.16, round: false, lean: 1 },
    { hx: 0.16, hy: 3, round: false, lean: 1 }, { hx: 0.2, hy: 0.2, round: true, lean: 1 }, { hx: 6, hy: 4, round: false, lean: 1 },
  ];
  for (const s of shapes) {
    const v = leanShift(s, u), a = Math.atan2(v.y, v.x) * 180 / Math.PI;
    assert.ok(Math.abs(a - 145) < 1e-6, `${JSON.stringify(s)}: leans at ${a.toFixed(2)} degrees`);
    // the ground distance it moves: at most CONTACT_LEAN.max, at most CONTACT_LEAN.frac of its reach toward the shadow (it stays on its base)
    const m = Math.hypot(v.x / 32, v.y / 16) / Math.SQRT2;
    assert.ok(m <= CONTACT_LEAN.max * 1.001 && m > 0, `${JSON.stringify(s)}: moves ${m.toFixed(3)} m`);
  }
  // the same reach toward the shadow, the same lean: a round pool and a box of the same size
  const blob = leanShift(shapes[0]!, u), box = leanShift(shapes[1]!, u);
  assert.ok(Math.abs(Math.hypot(blob.x, blob.y) - Math.hypot(box.x, box.y)) / Math.hypot(blob.x, blob.y) < 0.05, 'blob and box of one size lean alike');
  // a fence's thin strip moves less than its own depth, so it stays on its fence
  const strip = leanShift(shapes[2]!, u), depth = 0.16;
  assert.ok(Math.hypot(strip.x / 32, strip.y / 16) / Math.SQRT2 < depth, 'a fence strip stays on its fence');
  // no lean without cast shadows; a longer cast shadow leans more
  assert.deepEqual(contactLean({ ...CAST_DEFAULT, on: false }), { x: 0, y: 0 });
  assert.ok(Math.hypot(...Object.values(contactLean({ ...CAST_DEFAULT, length: 1.5 })) as [number, number]) > 1);
});

test('the name rules the audit found wrong: whole words, the lamp before the tree, buildings before the pole words', () => {
  const want: Record<string, ShadowKind> = {
    'world:streetlamp': 'pole', 'town:street_sign': 'pole', 'town:postoffice': 'building', 'world:drivein_marquee': 'building', 'expansion:compost-bin': 'prop',
    'arcade:arcade_v2_clutter_poster': 'prop', 'town:bus_stop': 'prop', 'ce:parking-entry': 'prop', 'ce:parking-kiosk': 'prop', 'expansion:carseat-bench': 'prop',
    'business:golf-cart-garage': 'building', 'business:golf-pro-shop': 'building', 'expansion:trampoline': 'round', 'expansion:aboveground-pool': 'round',
    'expansion:firepit': 'round', 'world:car_0': 'vehicle', 'world:schoolbus': 'vehicle', 'business:taxi-sw': 'vehicle', 'town:hydrangea': 'plant',
    'capital:tree-oak-open': 'tree', 'world:hydrant': 'pole', 'business:golf-pin-red': 'pole', 'world:bench': 'prop', 'ref:landmark-fountain-v2': 'roundhouse',
  };
  for (const [id, k] of Object.entries(want)) assert.equal(ruleKind(LIBRARY[byId(id)]!), k, id);
  for (const id of LIBRARY.filter(it => /street/i.test(it.id) && it.kind !== 'tree').map(it => it.id)) assert.notEqual(ruleKind(LIBRARY[byId(id)]!), 'tree', `${id}: "street" is no tree`);
});

test('the override table: every key is a library sprite or variation set, every value sane, views share their NE view\'s entry turned', () => {
  const keys = Object.keys(SHADOW_OVERRIDES);
  for (const k of keys) {
    const o = SHADOW_OVERRIDES[k]!;
    const known = BY.has(k) || (k.startsWith('variation:') && LIBRARY.some(it => it.id.startsWith(`${k}:`)));
    assert.ok(known, `override ${k} names no library sprite`);
    assert.ok(!/^view:.+:(se|sw|nw)$/.test(k) || !SHADOW_OVERRIDES[k.replace(/^view:(.+):(se|sw|nw)$/, '$1')], `${k}: its NE view's entry already covers it`);
    if (o.kind !== undefined) assert.ok(SHADOW_KINDS.includes(o.kind), `${k}: kind ${o.kind}`);
    for (const f of ['hx', 'hy', 'feather'] as const) if (o[f] !== undefined) assert.ok(Number.isFinite(o[f]) && o[f]! > 0 && o[f]! < 20, `${k}: ${f} ${o[f]}`);
    for (const f of ['dx', 'dy'] as const) if (o[f] !== undefined) assert.ok(Number.isFinite(o[f]) && Math.abs(o[f]!) < 20, `${k}: ${f} ${o[f]}`);
    if (o.core !== undefined) assert.ok(o.core > 0 && o.core <= 1, `${k}: core ${o.core}`);
    if (o.lean !== undefined) assert.ok(o.lean >= 0 && o.lean <= 3, `${k}: lean ${o.lean}`);
    for (const f of ['contact', 'cast'] as const) if (o[f] !== undefined) assert.equal(o[f], false, `${k}: ${f} is only ever turned off`);
    assert.ok(typeof o.note === 'string' && o.note.length > 3, `${k}: says why`);
    // a four-view sprite's views take its entry, its sizes and offsets turned a quarter for SE and NW
    const v = fourViews(k);
    if (v && v.at === 0 && (o.hx !== undefined || o.hy !== undefined)) {
      const ne = contactOf(placed(byId(v.views[0]), 1)), se = contactOf(placed(byId(v.views[1]), 1));
      if (ne && se && o.hx !== undefined && o.hy !== undefined) { assert.ok(Math.abs(ne.hx - se.hy) < 1e-9 && Math.abs(ne.hy - se.hx) < 1e-9, `${k}: the SE view's shape is the NE view's turned`); }
      assert.equal(overrideOf(v.views[2])?.turn, 2, `${k}: the SW view turns twice`);
    }
  }
  assert.ok(keys.length > 0 && keys.length < 400, `${keys.length} overrides`);
});
