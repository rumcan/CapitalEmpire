// T309 (#894): the farm animals. Every animal has every heading and every clip's frames in the library (with a vector shadow); the animals keep
// inside their field (the paddock's fence stands on its edge) at every moment; their placement and their motion are deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { ANIMALS, ANIMAL_CLIPS, ANIMAL_DIRS, ANIMAL_FRAMES, animalItem } from '../src/game/animals-library';
import { hasVectorShadow } from '../src/game/shadow-vector';
import { CAR_DIRECTIONS } from '../src/game/ext/car-art';
import {
  ANIMAL_GRAZE, ANIMAL_LOOKUP, ANIMAL_MARGIN, ANIMAL_ROW, ANIMAL_SEP, ANIMAL_WALK, ANIMALS_PER_FARM_MAX, HERD, animalAt, animalHeading, animalKind, farmAnimalFields, farmAnimals,
  type AnimalView, type FarmParcel,
} from '../src/game/ext/farms';

const KINDS = ['cow', 'horse', 'sheep'];
/** test parcels: a few shapes and turns (u, n orthonormal, as farmParcels makes them) */
function parcels(): FarmParcel[] {
  const out: FarmParcel[] = [];
  for (let i = 0; i < 40; i++) {
    const t = (i * 37) % 360 * Math.PI / 180, u = { x: Math.cos(t), y: Math.sin(t) }, n = { x: -u.y, y: u.x };
    out.push({ key: `t309:${i}`, o: { x: 300 + i * 7, y: 400 + i * 3 }, u, n, w: 40 + (i * 13) % 41, d: 70 + (i * 29) % 81, side: 1 });
  }
  return out;
}
const SEED = 20261104;

test('every animal has all 8 headings and every clip, in the library, each frame with a vector shadow', () => {
  assert.equal(ANIMALS.length, 7);
  assert.deepEqual([...ANIMAL_DIRS], [...CAR_DIRECTIONS]);
  for (const k of KINDS) assert.ok(ANIMALS.some(a => animalKind(a.id) === k), `a ${k}`);
  assert.equal(ANIMAL_FRAMES, ANIMAL_ROW);
  assert.deepEqual([ANIMAL_CLIPS.graze.start, ANIMAL_CLIPS.lookup.start, ANIMAL_CLIPS.walk.start], [ANIMAL_GRAZE, ANIMAL_LOOKUP, ANIMAL_WALK]);
  assert.equal(ANIMAL_CLIPS.walk.start + ANIMAL_CLIPS.walk.n, ANIMAL_FRAMES);
  assert.deepEqual([ANIMAL_CLIPS.graze.n, ANIMAL_CLIPS.lookup.n, ANIMAL_CLIPS.walk.n], [4, 3, 8]);
  for (const [c, clip] of Object.entries(ANIMAL_CLIPS)) assert.equal(clip.times.length, clip.n, c);
  ANIMALS.forEach((a, ai) => {
    for (let d = 0; d < 8; d++) for (let f = 0; f < ANIMAL_FRAMES; f++) {
      const it = LIBRARY[animalItem(ai, d, f)];
      assert.ok(it, `${a.id} ${d} ${f}`);
      assert.equal(it.id, `animal:${a.id}:${d}:${f}`);
      assert.ok(it.quad[2] > it.quad[0] && it.quad[3] > it.quad[1], `${it.id} has pixels`);
      assert.ok(it.tex[3] > it.tex[1] && it.tex[4] > it.tex[2], `${it.id} has texels`);
      assert.ok(hasVectorShadow(it.id), `${it.id} casts a vector shadow`);
    }
  });
  // (the animals are the library's tail but for the eight-view art (T375: object-eight-library.ts appends after them, so no lead/live saved index moved))
  assert.equal(animalItem(ANIMALS.length - 1, 7, ANIMAL_FRAMES - 1), LIBRARY.length - 1 - LIBRARY.filter(i => i.id.startsWith('object8:')).length);
  assert.ok(LIBRARY.slice(animalItem(ANIMALS.length - 1, 7, ANIMAL_FRAMES - 1) + 1).every(i => i.id.startsWith('object8:')), 'only the eight-view art follows the animals');
});

test('the farms get a few animals, cows or horses in the paddock and sheep in the other fields', () => {
  const arts = ANIMALS.map(a => ({ id: a.id }));
  let farms = 0, total = 0;
  for (const p of parcels()) for (const model of [1, 2] as const) {
    const fields = farmAnimalFields(p, SEED, model), herd = farmAnimals(p, SEED, arts, model);
    assert.ok(herd.length <= ANIMALS_PER_FARM_MAX);
    if (herd.length) farms++;
    total += herd.length;
    for (const a of herd) {
      const q = fields.find(z => z.a0 + ANIMAL_MARGIN === a.f[0] && z.b0 + ANIMAL_MARGIN === a.f[1]);
      assert.ok(q, 'its field is one of the farm\'s');
      assert.equal(a.kind, animalKind(arts[a.art]!.id), 'its art is its kind');
      if (q.kind === 'paddock') assert.ok(a.kind === 'cow' || a.kind === 'horse');
      else assert.equal(a.kind, 'sheep');
    }
  }
  assert.ok(farms >= 10, `${farms} of 80 farms have animals`);
  assert.ok(total >= 40, `${total} animals`);
});

test('the animals never leave their field (never through its fence), and walk the way they face', () => {
  const arts = ANIMALS.map(a => ({ id: a.id })), v: AnimalView = { x: 0, y: 0, art: 0, row: 0, frame: 0, moving: false };
  let checked = 0, walking = 0;
  for (const p of parcels()) for (const model of [1, 2] as const) {
    for (const a of farmAnimals(p, SEED, arts, model)) {
      let px = NaN, py = NaN;
      for (let t = 0; t < 1800; t += 0.5) {
        animalAt(a, t, v);
        // back to the parcel frame
        const dx = v.x - p.o.x, dy = v.y - p.o.y, pa = dx * p.u.x + dy * p.u.y, pb = dx * p.n.x + dy * p.n.y;
        assert.ok(pa >= a.f[0] - 1e-6 && pa <= a.f[2] + 1e-6 && pb >= a.f[1] - 1e-6 && pb <= a.f[3] + 1e-6, `${p.key} at ${t}s: ${pa.toFixed(2)}, ${pb.toFixed(2)} outside ${a.f.map(n => n.toFixed(1))}`);
        assert.ok(v.row >= 0 && v.row < 8 && v.frame >= 0 && v.frame < ANIMAL_ROW);
        if (v.moving) {
          assert.ok(v.frame >= ANIMAL_WALK);
          const mx = v.x - px, my = v.y - py;
          if (Math.hypot(mx, my) > 0.05) { assert.ok(Math.abs(((animalHeading(mx, my) - v.row) % 8 + 12) % 8 - 4) <= 1, `faces its way (${animalHeading(mx, my)} vs ${v.row})`); walking++; }
        } else assert.ok(v.frame < ANIMAL_WALK);
        px = v.x; py = v.y; checked++;
      }
    }
  }
  assert.ok(checked > 10000 && walking > 100, `${checked} moments, ${walking} walking`);
});

test('the herds are the owner\'s sizes, and the animals of a field keep a little apart (never closer than twice ANIMAL_SEP) at every moment', () => {
  const arts = ANIMALS.map(a => ({ id: a.id }));
  let herds = 0, pairs = 0;
  for (const p of parcels()) for (const model of [1, 2] as const) {
    const groups = new Map<string, ReturnType<typeof farmAnimals>>();
    for (const a of farmAnimals(p, SEED, arts, model)) { const k = a.f.join(); const g = groups.get(k) ?? []; g.push(a); groups.set(k, g); }
    for (const g of groups.values()) {
      const [, hi] = HERD[g[0]!.kind];
      assert.ok(g.length >= 1 && g.length <= hi, `${p.key}: ${g.length} ${g[0]!.kind}s, at most ${hi}`);
      assert.ok(g.every(a => a.kind === g[0]!.kind), 'a field holds one kind');
      herds++;
      const views = g.map((): AnimalView => ({ x: 0, y: 0, art: 0, row: 0, frame: 0, moving: false }));
      for (let t = 0; t < 1500; t += 2.3) {
        g.forEach((a, i) => animalAt(a, t, views[i]!));
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
          const d = Math.hypot(views[i]!.x - views[j]!.x, views[i]!.y - views[j]!.y);
          assert.ok(d >= 2 * ANIMAL_SEP - 1e-6, `${p.key} at ${t.toFixed(1)}s: ${d.toFixed(2)} tiles apart`); pairs++;
        }
      }
    }
  }
  assert.ok(herds >= 10 && pairs > 1000, `${herds} herds, ${pairs} pairs checked`);
});

test('the animals keep clear of the hay bales and bushes of their paddock (given as obstacles): never within 2.2 tiles of one', () => {
  const arts = ANIMALS.map(a => ({ id: a.id })), v: AnimalView = { x: 0, y: 0, art: 0, row: 0, frame: 0, moving: false };
  let checked = 0;
  for (const p of parcels()) {
    const fields = farmAnimalFields(p, SEED, 2), q = fields.find(z => z.kind === 'paddock'); if (!q) continue;
    // a bale at the paddock's middle and one near a corner (world tiles)
    const at = (pa: number, pb: number) => ({ x: p.o.x + p.u.x * pa + p.n.x * pb, y: p.o.y + p.u.y * pa + p.n.y * pb });
    const obs = [at((q.a0 + q.a1) / 2, (q.b0 + q.b1) / 2), at(q.a0 + 3, q.b0 + 3)];
    for (const a of farmAnimals(p, SEED, arts, 2, fields, obs)) {
      if (a.f[0] !== q.a0 + ANIMAL_MARGIN || a.f[1] !== q.b0 + ANIMAL_MARGIN) continue; // (an animal of the paddock)
      for (let t = 0; t < 1200; t += 3.1) {
        animalAt(a, t, v);
        for (const o of obs) { const d = Math.hypot(v.x - o.x, v.y - o.y); assert.ok(d >= 2.2 - 1e-6, `${p.key} at ${t.toFixed(1)}s: ${d.toFixed(2)} tiles from a bale`); checked++; }
      }
    }
  }
  assert.ok(checked > 500, `${checked} animal-bale distances checked`);
});

test('placement and motion are deterministic', () => {
  const arts = ANIMALS.map(a => ({ id: a.id })), [p] = parcels().filter(q => farmAnimals(q, SEED, arts).length);
  assert.ok(p);
  const a = farmAnimals(p, SEED, arts), b = farmAnimals(p, SEED, arts);
  assert.deepEqual(a, b);
  for (const t of [0, 13.3, 999.9]) {
    const va: AnimalView = { x: 0, y: 0, art: 0, row: 0, frame: 0, moving: false }, vb = { ...va };
    assert.deepEqual(animalAt(a[0]!, t, va), animalAt(b[0]!, t, vb));
  }
  assert.notDeepEqual(farmAnimals(p, SEED + 1, arts).map(x => x.home), a.map(x => x.home));
});
