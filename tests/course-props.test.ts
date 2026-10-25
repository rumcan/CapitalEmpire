// The pictures the course props are drawn with (T111). Every prop the golf code places resolves, through newart.ts lookOf (the renderer's one
// path to a picture), to its own picture, or, for a building of the art inventory still waiting for its four views, to a stand-in of its own
// family; a prop is never drawn as a building (the owner, 2026-10-25: "i drew a tee box and it put buildings down for tee markers": every pin,
// tee marker and bench was drawn as a casino, a taxi depot or a tackle shop). Headless: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { lookOf, standInFamily } from '../src/game/newart';
import { BUILDING_IDS, VIEW_ART } from '../src/game/views-library';
import { BENCH_ID, DRESSING_SPRITE_IDS, MARKER_SCALE, OLD_TEE_IDS, PIN_RED_ID, PIN_YELLOW_ID, TEE_BACK_ID, TEE_FORWARD_ID, TEE_MIDDLE_ID, TREE_IDS } from '../src/game/golf/dressing';
import { PIECE_PROP_SPRITE } from '../src/game/ext/course-pieces';
import { FALLBACK_STRUCTURE_SPRITE, STRUCTURE_SPRITE, STRUCTURE_SPRITE_OLD } from '../src/game/golf/structure-art';
import { STRUCTURES } from '../src/game/golf/tents';
import { BUSINESS, type BusinessId } from '../src/game/business/catalogue';
import { businessArt } from '../src/game/business/art';
import { FLOWER_IDS } from '../src/game/plant';
import type { LibItem } from '../src/game/types';

const INDEX = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
const BY_ID = new Map(LIBRARY.map(it => [it.id, it] as const));
/** the picture a turned view (view:<id>:se, sw or nw) is a view of; any other picture is its own */
const base = (id: string) => id.replace(/^view:(.+):(se|sw|nw)$/, '$1');
/** what lookOf draws for item i at scale k (unflipped, as the course props are placed): the drawn picture's base id, or null when hidden */
function drawn(i: number, k: number, flip = false, x = 140.5, y = 260.5): string | null {
  const look = lookOf({ item: i, flip, scale: k, x, y, x0: x - 2, y0: y - 2, x1: x + 2, y1: y + 2 });
  return look.hidden ? null : base(LIBRARY[look.item]!.id);
}
/** a picture is right for a prop: drawn as itself, or (a building of the art inventory waiting for its views) as a stand-in of its own family */
function assertOwnPicture(id: string, k: number, why: string, flip = false) {
  const i = INDEX.get(id); assert.ok(i !== undefined, `${why}: ${id} is in the library`);
  const d = drawn(i, k, flip); assert.ok(d !== null, `${why}: ${id} is drawn`);
  if (d === id) return;
  const it = BY_ID.get(id)!, s = BY_ID.get(d)!;
  assert.ok(BUILDING_IDS.has(id), `${why}: ${id} is a prop (not in the art inventory) but is drawn as ${d}`);
  assert.equal(standInFamily(s), standInFamily(it), `${why}: ${id} (${standInFamily(it)}) is drawn as ${d} (${standInFamily(s)})`);
}

test('the flagsticks and the course-map bench are drawn as themselves at the size they are placed (never a building)', () => {
  assertOwnPicture(PIN_RED_ID, MARKER_SCALE.pin, 'pin');
  assertOwnPicture(PIN_YELLOW_ID, MARKER_SCALE.pin, 'last pin');
  assertOwnPicture(BENCH_ID, 0.26, 'tee bench');
  // the old marker fit placed the flagsticks at scale 1; a save is refitted to MARKER_SCALE, but even at 1 the picture is its own
  assertOwnPicture(PIN_RED_ID, 1, 'pin at scale 1');
  // a flagstick about 2.2 m tall: its drawn height at MARKER_SCALE.pin is about 1.1 to 1.6 times a 1.78 m walker's
  const flag = BY_ID.get(PIN_RED_ID)!, man = 136; // library.ts WALKER_PEOPLE base_man: 136 px for 1.78 m
  const r = flag.h * MARKER_SCALE.pin / man;
  assert.ok(r > 1 && r < 1.6, `the flagstick is drawn ${r.toFixed(2)} times a walker's height`);
});

test('every id course dressing emits is its own picture, a tree, or the tee marker still to import (never a stand-in)', () => {
  const trees = new Set(TREE_IDS);
  for (const id of DRESSING_SPRITE_IDS) {
    if (trees.has(id)) { assert.equal(BY_ID.get(id)?.kind, 'tree', `${id} is a tree`); continue; }
    if (!INDEX.has(id)) continue; // the tee marker's art is not imported yet: the engine places no prop for an id the library lacks
    assertOwnPicture(id, 0.25, 'dressing');
  }
});

test('the tee markers are never a flagstick, the bag trolley or a building: their own picture, or none until it is imported', () => {
  for (const id of [TEE_BACK_ID, TEE_MIDDLE_ID, TEE_FORWARD_ID]) {
    assert.ok(!OLD_TEE_IDS.includes(id), `${id} is not one of the pictures that stood in for a tee marker`);
    assert.doesNotMatch(id, /pin|flag|trolley|bag/, `${id} is no flag or trolley`);
    const i = INDEX.get(id);
    if (i !== undefined) assert.equal(drawn(i, MARKER_SCALE.back), id, `${id} is drawn as itself`);
  }
  // the yellow flagstick marks the last pin only
  assert.ok(![TEE_BACK_ID, TEE_MIDDLE_ID, TEE_FORWARD_ID].includes(PIN_YELLOW_ID));
});

test('the props a course piece or a preset places (the practice flag, the pond reeds, the flowers) are drawn as themselves', () => {
  let n = 0;
  for (const [anchor, s] of Object.entries(PIECE_PROP_SPRITE)) {
    if (!s) continue;
    // a piece's flag is placed as the red flagstick (engine placePresetProps), its plants by id or from the flower pool
    const ids = s.id ? [s.id] : s.kind === 'flag' ? [PIN_RED_ID] : s.kind === 'flower' ? FLOWER_IDS : [];
    for (const id of ids) { assertOwnPicture(id, s.kind === 'flag' ? MARKER_SCALE.pin : 1, `piece ${anchor}`); n++; }
  }
  for (const id of FLOWER_IDS) assertOwnPicture(id, 1, 'flower');
  assert.ok(n >= 2, `${n} piece props checked`);
});

test('no prop packed with the business art is ever swapped for a building (flagsticks, trolley, bench, carts, buses, taxis, boat, dock props)', () => {
  let props = 0;
  LIBRARY.forEach((it, i) => {
    if (it.kind !== 'business' || BUILDING_IDS.has(it.id) || VIEW_ART.has(it.id) || it.id.startsWith('view:')) return;
    props++;
    for (const flip of [false, true]) for (const k of [0.3, 1]) assert.equal(drawn(i, k, flip, 100 + i, 200 - i), it.id, `${it.id} (flip ${flip}, scale ${k}) is drawn as itself`);
  });
  assert.ok(props >= 15, `${props} business-art props`);
});

test('every business draws its pictures as themselves or as a stand-in of their own family; the starter clubhouse as the clubhouse', () => {
  const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
  let n = 0, club = 0;
  for (const type of Object.keys(BUSINESS) as BusinessId[]) {
    const fp = BUSINESS[type].footprint;
    for (const turned of [false, true]) {
      const def = { id: 5, type, x: 300, y: 400, w: turned ? fp.h : fp.w, h: turned ? fp.w : fp.h };
      for (const p of businessArt(def, LIBRARY, index)) {
        const id = base(LIBRARY[p.item]!.id), look = lookOf(p);
        assert.ok(!look.hidden, `${id} on a ${type} is drawn`);
        const d = base(LIBRARY[look.item]!.id); n++;
        if (d !== id) {
          assert.ok(BUILDING_IDS.has(id), `${id} on a ${type} is a prop but is drawn as ${d}`);
          assert.equal(standInFamily(BY_ID.get(d)!), standInFamily(BY_ID.get(id)!), `${id} on a ${type} is drawn as ${d}`);
        }
        if (id === 'golf:clubhouse-shanty') { club++; assert.equal(d, 'business:golf-clubhouse', `the starter clubhouse is drawn as ${d}`); }
      }
    }
  }
  assert.ok(n > 30 && club === 2, `${n} business pictures, the clubhouse ${club} times`);
});

test('every event structure is drawn as the same kind of thing: its picture or a stand-in of its family; grandstands as a grandstand', () => {
  const kindOf = (it: LibItem) => `${it.id} ${it.name}`.toLowerCase();
  for (const s of STRUCTURES) {
    const id = STRUCTURE_SPRITE[s.id] ?? FALLBACK_STRUCTURE_SPRITE;
    assertOwnPicture(id, 0.5, `structure ${s.id}`);
    const d = drawn(INDEX.get(id)!, 0.5)!;
    if (s.kind === 'grandstand') assert.match(kindOf(BY_ID.get(d)!), /grandstand/, `${s.id} is drawn as ${d}`);
    assert.doesNotMatch(d, /bench|produce/, `${s.id} is drawn as ${d}`);
  }
  // the pictures T111 replaced are gone from the table (a save's prop of one is replaced on load)
  for (const [type, old] of Object.entries(STRUCTURE_SPRITE_OLD)) assert.notEqual(STRUCTURE_SPRITE[type], old, `${type} no longer drawn as ${old}`);
});
