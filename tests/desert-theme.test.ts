// T341 (#968): the desert theme. Every world tree is drawn as a palm or a rock, every world bush as a desert plant or rock (none left unmapped,
// never mirrored, the same spot the same plant); the course's own props keep their art; the world's grass surfaces wear desert looks, the lot
// lawns dirt (T382: yards are dirt with a few sand drifts; ?sand=old keeps the golden fescue), and no golf surface changes; off restores the look exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { DESERT_THEME, lookOf } from '../src/game/newart';
import { COURSE_SURFACES, DESERT_CLASS, DESERT_DUNE, DESERT_GROUND, DESERT_LAWN, DESERT_POOLS, desertClassOf, desertPick, desertSurfaces } from '../src/game/desert-theme';
import { SURFACES, lookOfTex } from '../src/game/painted-surfaces';
import { baseSurfaces, paintedSurfaces, setDesertSurfaces } from '../src/game/painted-surfaces-live';
import { familyById } from '../src/game/painted-families';
import { PRESETS } from '../src/game/paint-presets';

const isDesert = (i: number) => LIBRARY[i]!.cat.startsWith('Desert:') || LIBRARY[i]!.id.startsWith('kit:palm-');
const isPalmOrRock = (i: number) => LIBRARY[i]!.kind === 'palm' || LIBRARY[i]!.kind === 'rock' && LIBRARY[i]!.cat === 'Desert: rocks';
const drawable = (item: number, x: number, y: number) => ({ item, x, y, flip: true, scale: 0.6, x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 });
const SPOTS: [number, number][] = Array.from({ length: 40 }, (_, k) => [100 + k * 13.37, 200 + k * 7.91]);
const on = (keep: ((d: { x: number; y: number }) => boolean) | null = null) => { DESERT_THEME.on = true; DESERT_THEME.gen++; DESERT_THEME.keep = keep; };
const off = () => { DESERT_THEME.on = false; DESERT_THEME.gen++; DESERT_THEME.keep = null; };

test('desert theme: every pool has pictures, all desert art', () => {
  for (const [c, pools] of Object.entries(DESERT_POOLS)) for (const p of pools) {
    assert.ok(p.items.length > 0, `${c} pool empty`);
    for (const i of p.items) assert.ok(isDesert(i), `${LIBRARY[i]!.id} is not desert art`);
  }
});

test('desert theme: every tree, bush, shrub, flower and hedge of the world is mapped (none left unmapped)', () => {
  let trees = 0, bushes = 0;
  LIBRARY.forEach((it, i) => {
    const plant = it.kind === 'tree' || it.kind === 'bush' || it.kind === 'flower' || (it.kind === 'shrub' && !it.cat.startsWith('Desert:')) || /hedge/.test(it.id) && it.kind.startsWith('fence');
    if (!plant) return;
    assert.ok(DESERT_CLASS[i], `${it.id} (${it.kind}) unmapped`);
    if (DESERT_CLASS[i] === 'tree') trees++; else bushes++;
  });
  assert.ok(trees > 200 && bushes > 50, `${trees} trees, ${bushes} bushes`);
  // desert art and the kit's palms are drawn as themselves
  LIBRARY.forEach((it, i) => { if (isDesert(i)) assert.equal(desertClassOf(it), null, it.id); });
});

test('desert theme on: no ordinary tree is drawn in the world, only palms and rocks; bushes as desert plants or rocks; never mirrored', () => {
  on();
  try {
    LIBRARY.forEach((it, i) => {
      const c = DESERT_CLASS[i]; if (!c) return;
      for (const [x, y] of SPOTS.slice(0, 6)) {
        const l = lookOf(drawable(i, x, y));
        assert.notEqual(l.item, i, `${it.id} drawn as itself`);
        assert.equal(l.flip, false, `${it.id} mirrored`);
        assert.ok(l.scale > 0 && Number.isFinite(l.scale));
        assert.notEqual(LIBRARY[l.item]!.kind, 'tree', `${it.id} drawn as the tree ${LIBRARY[l.item]!.id}`);
        if (c === 'tree') assert.ok(isPalmOrRock(l.item), `${it.id} drawn as ${LIBRARY[l.item]!.id}, not a palm or rock`);
        else assert.ok(isDesert(l.item), `${it.id} drawn as ${LIBRARY[l.item]!.id}`);
      }
    });
  } finally { off(); }
});

test('desert theme: deterministic per spot, varied across spots, mostly palms for trees', () => {
  const oak = LIBRARY.findIndex(it => it.id === 'world:tree_oak_0');
  assert.ok(oak >= 0);
  const picks = SPOTS.map(([x, y]) => desertPick(oak, x, y, 0.6)!.item);
  assert.deepEqual(SPOTS.map(([x, y]) => desertPick(oak, x, y, 0.6)!.item), picks);
  assert.ok(new Set(picks).size >= 5, 'too little variety');
  assert.ok(picks.filter(i => LIBRARY[i]!.kind === 'palm').length > picks.length / 2, 'trees should be mostly palms');
});

test('desert theme: the course keeps its own props, and off restores the look exactly', () => {
  const items = LIBRARY.map((_, i) => i).filter(i => DESERT_CLASS[i]).slice(0, 80);
  const before = items.map(i => { const d = drawable(i, 300, 300); return { d, l: { ...lookOf(d) } }; });
  on(d => d.x >= 290 && d.x <= 310); // a course box round (300, 300)
  try { for (const { d, l } of before) assert.deepEqual({ ...lookOf(d) }, l, `course prop ${LIBRARY[d.item]!.id} changed`); }
  finally { off(); }
  on();
  try { for (const { d } of before) assert.notEqual(lookOf(d).item, d.item); } finally { off(); }
  for (const { d, l } of before) assert.deepEqual({ ...lookOf(d) }, l, `${LIBRARY[d.item]!.id} not restored`);
});

test('desert theme ground: every world grass surface and lawn has a desert look; the course surfaces and the range presets are untouched', () => {
  const base = baseSurfaces(), d = desertSurfaces(base);
  assert.equal(d.desert, true);
  const world = SURFACES.filter(s => s.group === 'Map' || s.group === 'Town' || s.group === 'Living ground').filter(s => s.kinds.includes('grass')).map(s => s.key);
  // the grass surfaces of the world (the farm fields and the swamp keep their own looks: the ploughed fields stay)
  const keep = new Set(['swamp', 'field', 'outside', ...SURFACES.filter(s => s.key.startsWith('field') || s.key.startsWith('corn')).map(s => s.key)]);
  for (const k of world) if (!keep.has(k)) assert.ok(DESERT_GROUND[k] || DESERT_LAWN[k], `world grass surface ${k} unmapped`);
  for (const l of [...Object.values(DESERT_GROUND), ...Object.values(DESERT_LAWN)]) assert.ok(familyById(l.family), `${l.family} missing`);
  for (const k of Object.keys(DESERT_GROUND)) assert.notEqual(d.surfaces[k]!.family, 'lawn-concept-run');
  // T382: the yards are dirt (the owner: "no sand-rectangle yards"), the sand blotches' pale rippled sand is the Sand drifts surface
  for (const k of Object.keys(DESERT_LAWN)) assert.equal(d.surfaces[k]!.family, 'dirt-run', `lawn ${k}`);
  // three materials over the open ground (desert sand, dirt, pale sand in the blotches), not one colour
  assert.ok(new Set([...Object.values(DESERT_GROUND), DESERT_DUNE].map(l => l.family)).size >= 3);
  assert.deepEqual(d.surfaces.dune, DESERT_DUNE);
  // no course tile changes: every golf surface and every texture of the course reads the same look
  for (const k of COURSE_SURFACES) assert.deepEqual(d.surfaces[k], base.surfaces[k], `course surface ${k} changed`);
  for (const s of SURFACES.filter(s => s.group === 'Golf' || s.group === 'Course walls')) for (const t of s.tex) assert.deepEqual(lookOfTex(t, d, PRESETS), lookOfTex(t, base, PRESETS), `course texture ${t} changed`);
  for (const [k, v] of Object.entries(base.presets)) if (k.startsWith('range-')) assert.deepEqual(d.presets[k], v, `range preset ${k} changed`);
  assert.deepEqual(d.course, base.course); assert.deepEqual(d.range, base.range);
});

test('desert theme ground: the switch swaps the live file and off restores it exactly', () => {
  const was = JSON.stringify(paintedSurfaces());
  setDesertSurfaces(true);
  assert.equal(paintedSurfaces().desert, true);
  assert.equal(JSON.stringify(baseSurfaces()), was, 'the owner file must not take the theme');
  setDesertSurfaces(false);
  assert.equal(JSON.stringify(paintedSurfaces()), was);
});
