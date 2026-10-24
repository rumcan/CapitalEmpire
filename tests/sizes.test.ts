// Sizes (the owner, 2026-10-24: "A lot of houses are being placed too big. Some are even placed so big they pixelate"): no picture is drawn past
// the pixels its atlas rect holds at the closest zoom, a stand-in never enlarges past its pixels, and the sprite studio's size for a library id
// is the size the game draws it at everywhere. Runs in the default mode (no URL flag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_MIP0, LIBRARY } from '../src/game/library';
import { lookOf, maxDrawScale, thumbItem } from '../src/game/newart';
import { PIXEL_LIMIT, PIXEL_SLACK, pixelLimit } from '../src/game/sizes';
import { spriteRect } from '../src/game/sprites';
import { OWNER_SCALE, STUDIO_SCALE } from '../src/game/lots/scales';
import { businessArt } from '../src/game/business/art';
import { BUSINESSES } from '../src/game/business/catalogue';
import { CAR_SCALE } from '../src/game/ext/car-art';
import { isBuilding } from '../src/game/mirror';
import type { LibItem } from '../src/game/types';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
/** the engine's footprint (engine.footprint): the union of the boxes at scale k, in tiles */
function drawable(item: number, x: number, y: number, flip: boolean, scale: number) {
  const it = LIBRARY[item]!; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of it.boxes) {
    const hx = (flip ? b.hy : b.hx) * scale / 2, hy = (flip ? b.hx : b.hy) * scale / 2, dx = (flip ? b.dy : b.dx) * scale / 2, dy = (flip ? b.dx : b.dy) * scale / 2;
    x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
  }
  return { item, x, y, flip, scale, x0, y0, x1, y1 };
}
/** the scale a drawable's picture is drawn at, measured on its drawn rect (sprites.ts spriteRect): world px over the picture's display px */
function drawnScale(d: ReturnType<typeof drawable>): { item: LibItem; k: number } | null {
  const l = lookOf(d); if (l.hidden) return null;
  const it = LIBRARY[l.item]!, r = spriteRect(d), qw = it.quad[2] - it.quad[0], qh = it.quad[3] - it.quad[1];
  return { item: it, k: Math.max(qw > 0 ? (r[2] - r[0]) / qw : 0, qh > 0 ? (r[3] - r[1]) / qh : 0) };
}

test('every library item has a pixel limit read from its atlas rect (0.6 atlas px per display px is scale 1)', () => {
  LIBRARY.forEach((it, i) => {
    assert.ok(Number.isFinite(PIXEL_LIMIT[i]!) && PIXEL_LIMIT[i]! >= 0, `${it.id}: limit ${PIXEL_LIMIT[i]}`);
    assert.equal(PIXEL_LIMIT[i], pixelLimit(it));
  });
  const it = { ...LIBRARY[0]!, tex: [0, 0, 0, 0.3, 0.3] as LibItem['tex'], quad: [0, 0, 2048 * 0.3 / ATLAS_MIP0, 2048 * 0.3 / ATLAS_MIP0] as LibItem['quad'] };
  assert.ok(Math.abs(pixelLimit(it) - 1) < 1e-9, 'a rect holding 0.6 atlas px per display px is sharp up to scale 1');
});

test('no sprite of the whole library is ever drawn past its pixels at the closest zoom, at any scale, flipped or not (sprites.ts spriteRect)', () => {
  let capped = 0, drawn = 0;
  LIBRARY.forEach((it, i) => {
    for (const scale of [0.5, 1, OWNER_SCALE[it.id] ?? 1, 1.6, 3, 9]) for (const flip of [false, true]) {
      const d = drawable(i, 300 + (i % 40) * 13, 300 + Math.floor(i / 40) * 11, flip, scale), r = drawnScale(d);
      if (!r) continue;
      drawn++;
      const lim = pixelLimit(r.item);
      assert.ok(r.k <= lim * PIXEL_SLACK + 1e-6, `${it.id} at ${scale} is drawn as ${r.item.id} at ${r.k.toFixed(3)}, past its limit ${lim.toFixed(3)}`);
      if (lookOf(d).scale < scale - 1e-9 && lookOf(d).item === i) capped++;
    }
  });
  assert.ok(drawn > 5000, `${drawn} draws`);
  assert.ok(capped > 0, 'some sprites asked to be drawn past their pixels are capped');
});

test('a sprite within its pixels is drawn as itself, the same object (no allocation)', () => {
  let n = 0;
  LIBRARY.forEach((it, i) => {
    const probe = { item: i, x: 10, y: 10, flip: false, scale: 1e-3 };
    if (lookOf(probe) !== probe) return; // drawn as a stand-in
    const d = { item: i, x: 10, y: 10, flip: false, scale: Math.min(1, PIXEL_LIMIT[i]!) };
    assert.equal(lookOf(d), d, `${it.id} within its pixels is drawn as itself`);
    n++;
  });
  assert.ok(n > 1000, `${n} sprites`);
});

test('a parked car is drawn CAR_SCALE smaller than its scale, so its limit is CAR_SCALE bigger; a moving car is drawn at its scale', () => {
  const i = LIBRARY.findIndex(it => it.kind === 'car'); assert.ok(i >= 0);
  const lim = PIXEL_LIMIT[i]!;
  const parked = lookOf({ item: i, x: 5, y: 5, flip: false, scale: lim / CAR_SCALE }), moving = { item: i, x: 5, y: 5, flip: false, scale: lim * 1.5, moving: true };
  assert.ok(Math.abs(parked.scale - lim / CAR_SCALE) < 1e-9, 'a parked car at its limit over CAR_SCALE is not capped');
  assert.ok(Math.abs(lookOf(moving).scale - lim) < 1e-9, 'a moving car past its limit is capped at it');
});

test('no stand-in is drawn above its native pixels, whatever the footprint it stands in for; below its limit it fills the footprint, centred on it', () => {
  let swapped = 0, fills = 0, atCap = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    const own = OWNER_SCALE[it.id] ?? 1;
    for (const scale of [0.6, own, own * 1.05, 1.6, 2.5]) for (const flip of [false, true]) {
      const d = drawable(i, 500 + i * 0.37, 900 - i * 0.29, flip, scale), l = lookOf(d);
      if (l.item === i || l.hidden) continue;
      swapped++;
      const n = LIBRARY[l.item]!, lim = PIXEL_LIMIT[l.item]!;
      assert.ok(l.scale <= lim * PIXEL_SLACK + 1e-9, `${it.id} at ${scale}: stand-in ${n.id} drawn at ${l.scale.toFixed(3)}, past its limit ${lim.toFixed(3)}`);
      const span = (x: LibItem) => x.boxes[0]!.hx + x.boxes[0]!.hy, fill = scale * span(it) / span(n);
      if (fill <= lim * PIXEL_SLACK) { assert.ok(Math.abs(l.scale - fill) < 1e-6, `${it.id}: ${n.id} fills its footprint`); fills++; }
      else { assert.ok(Math.abs(l.scale - lim) < 1e-9, `${it.id}: ${n.id} is drawn at its limit`); atCap++; }
      // centred: the stand-in's footprint centre is the building's footprint centre
      const s = drawable(l.item, l.x!, l.y!, l.flip, l.scale);
      assert.ok(Math.abs((s.x0 + s.x1) / 2 - (d.x0 + d.x1) / 2) < 1e-6 && Math.abs((s.y0 + s.y1) / 2 - (d.y0 + d.y1) / 2) < 1e-6, `${it.id}: ${n.id} is centred on the footprint`);
    }
  });
  assert.ok(swapped > 100, `${swapped} stand-ins`);
  assert.ok(fills > 0 && atCap > 0, `${fills} fill their footprint, ${atCap} are drawn at their limit`);
});

test('a stand-in is picked to fit within its pixels when its family has one that does (at the owner scale)', () => {
  let fit = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    const d = drawable(i, 40, 60, false, OWNER_SCALE[it.id] ?? 1), l = lookOf(d);
    if (l.item === i || l.hidden) return;
    const span = (x: LibItem) => x.boxes[0]!.hx + x.boxes[0]!.hy, n = LIBRARY[l.item]!, fill = d.scale * span(it) / span(n);
    if (fill <= PIXEL_LIMIT[l.item]! * PIXEL_SLACK) fit++;
  });
  assert.ok(fit > 20, `${fit} old buildings drawn as a stand-in that fills their footprint within its pixels`);
});

test('the player resizes a sprite only as far as its picture allows (engine.scaleSelected: maxDrawScale)', () => {
  LIBRARY.forEach((it, i) => {
    const m = maxDrawScale(i);
    if (m === Infinity) { assert.ok(isBuilding(it), `${it.id}: only a stand-in has no limit`); return; }
    const d = { item: i, x: 0, y: 0, flip: false, scale: m / PIXEL_SLACK };
    if (it.kind !== 'car') assert.equal(lookOf(d), d, `${it.id} at its largest player size is drawn as itself`);
  });
});

test("the studio's sizes are the game's: OWNER_SCALE is scale-overrides.json for every id in it, and a building's four views share its size", () => {
  for (const [id, s] of Object.entries(STUDIO_SCALE)) assert.equal(OWNER_SCALE[id], s, id);
  let views = 0;
  for (const it of LIBRARY) {
    const m = /^view:(.+):(se|sw|nw)$/.exec(it.id); if (!m || !INDEX.has(m[1]!)) continue;
    views++;
    assert.equal(OWNER_SCALE[it.id], OWNER_SCALE[m[1]!], `${it.id} has its subject's size`);
  }
  assert.ok(views > 100, `${views} views`);
});

test("a business picture the owner sized in the studio is drawn at that size in its parcel (capped at its pixels like any other)", () => {
  let sized = 0;
  for (const b of BUSINESSES) for (const p of businessArt({ id: 3, type: b.id, x: 100, y: 200, ...b.footprint }, LIBRARY, INDEX)) {
    const it = LIBRARY[p.item]!, subject = it.id.replace(/^view:(.+):(se|sw|nw)$/, '$1'), s = STUDIO_SCALE[subject];
    if (s === undefined) continue;
    sized++;
    assert.equal(p.scale, s, `${it.id} in a ${b.id} parcel at its studio size`);
  }
  assert.ok(sized > 0, `${sized} studio-sized business pictures`);
});

test('thumbItem: an old building is thumbnailed as the stand-in it is drawn as at its owner scale', () => {
  let n = 0;
  LIBRARY.forEach((it, i) => {
    if (!isBuilding(it) || it.kind === 'lot') return;
    const t = thumbItem(it); if (t === it) return;
    n++;
    assert.equal(LIBRARY[lookOf(drawable(i, 0, 0, false, OWNER_SCALE[it.id] ?? 1)).item], t, it.id);
  });
  assert.ok(n > 20, `${n} thumbnails`);
});
