// The hand-drawn vector shadows (T142, src/game/shadow-vector.ts; the owner, 2026-10-26: "can you put a smart opus on the shadows to vector
// draw each shadow individually for all assets?"). Headless: every picture the game draws has its own shapes or is on the fallback list, the
// shapes are sane (closed rings, near their anchor, heights within the picture), the mesh builder fills and rims them right, the draft finds
// legs, posts and walls, and the sprite packing hands the GPU one instance a picture (mirrored with its sprite). The GPU side (gl.ts VS_VEC)
// is checked on the audit sheets (?shadows=audit).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY } from '../src/game/library';
import { VECTOR_SHADOWS, VECTOR_FALLBACK, VERTEX_FLOATS, buildVectorMesh, triangulate, vectorFallback, vectorMesh, type VectorShadow } from '../src/game/shadow-vector';
import { draftItems, SHADOW_HINTS } from '../src/game/dev/shadow-draft-items';
import { draftShadow, type DraftPicture } from '../src/game/dev/shadow-draft';
import { CAST, castShear } from '../src/game/cast-shadow';
import { VECTOR, contactOf, packVector, spriteAnchor, spriteRect, vecOf, type Drawable } from '../src/game/sprites';
import { VECTOR_STRIDE } from '../src/game/gl';

const BY = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
type P = [number, number];
const triArea = (pts: P[], t: number[]) => { let a = 0; for (let i = 0; i < t.length; i += 3) { const [p, q, r] = [pts[t[i]!]!, pts[t[i + 1]!]!, pts[t[i + 2]!]!]; a += ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) / 2; } return a; };

test('triangulate: a square, a concave L, a square with a hole fill exactly their area', () => {
  const sq: P[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(triArea(sq, triangulate(sq, [0, 1, 2, 3], [])), 100);
  const L: P[] = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
  assert.equal(triArea(L, triangulate(L, [0, 1, 2, 3, 4, 5], [])), 64);
  const pts: P[] = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 3], [3, 7], [7, 7], [7, 3]];
  const t = triangulate(pts, [0, 1, 2, 3], [[4, 5, 6, 7]]);
  assert.ok(Math.abs(triArea(pts, t) - 84) < 1e-9, `area ${triArea(pts, t)}`);
});

test('the mesh: a contact ring and a cast ring with a hole are filled and rimmed, every index in range', () => {
  const e: VectorShadow = { c: [[-10, 0, 10, 0, 10, 5, -10, 5]], s: [[0, 0, 0, 40, 0, 0, 40, 0, 40, 0, 0, 40], [10, 0, 10, 10, 0, 20, 30, 0, 20, 30, 0, 10]] };
  const m = buildVectorMesh({ a: e, b: { same: 'a' }, flat: {} });
  assert.deepEqual(m.at.get('b'), m.at.get('a'));
  assert.equal(m.at.get('flat')!.count, 0, 'an entry with no shapes draws none (a flat picture)');
  const r = m.at.get('a')!; assert.equal(r.count % 3, 0); assert.equal(r.mcount, r.count, 'the mirrored copy has as many triangles');
  // the far copy: no holes, no rims (2 triangles for the contact, 2 for the cast square)
  assert.equal(r.fcount / 3, 4); assert.equal(r.fmcount, r.fcount);
  // the mirrored copy: x negated, the same heights
  assert.equal(m.verts[m.idx[r.mfirst]! * VERTEX_FLOATS + 3], m.verts[m.idx[r.first]! * VERTEX_FLOATS + 3]);
  for (let i = r.first; i < r.first + r.count; i++) assert.ok(m.idx[i]! < m.nVerts);
  // the fill: 2 triangles for the contact, 8 for the cast square with its hole bridged; the rims: 2 triangles an edge (4 + 4 + 4 edges)
  assert.equal(r.count / 3, 2 + 8 + 2 * 12);
  // every vertex: kind 0 or 1, darkness in 0..1, edge 0 or 1
  for (let v = 0; v < m.nVerts; v++) { const o = v * VERTEX_FLOATS; assert.ok(m.verts[o + 3] === 0 || m.verts[o + 3] === 1); assert.ok(m.verts[o + 4]! > 0 && m.verts[o + 4]! <= 1); assert.ok(m.verts[o + 5] === 0 || m.verts[o + 5] === 1); }
});

test('every picture the game draws has its own vector shadow, or is on the fallback list', () => {
  const items = draftItems(), missing: string[] = [];
  for (const i of items) if (!VECTOR_SHADOWS[LIBRARY[i]!.id]) missing.push(LIBRARY[i]!.id);
  assert.deepEqual(missing.slice(0, 20), [], `${missing.length} pictures without a vector shadow`);
  assert.ok(items.length > 1000, `${items.length} pictures`);
  // the fallback list says why, and covers the walkers' frames
  for (const f of VECTOR_FALLBACK) assert.ok(f.why.length > 10, f.id);
  assert.ok(LIBRARY.filter(it => it.kind === 'walker').every(it => vectorFallback(it.id, it.kind)), 'every walker frame is on the fallback list');
  // no stale entries: every key is a library picture, every `same` names a drawn entry
  for (const [k, e] of Object.entries(VECTOR_SHADOWS)) { assert.ok(BY.has(k), `${k} is no library picture`); if (e.same) assert.ok(VECTOR_SHADOWS[e.same] && !VECTOR_SHADOWS[e.same]!.same, `${k}: same as ${e.same}`); }
  // every hint names a library picture or a variation set
  for (const k of Object.keys(SHADOW_HINTS)) assert.ok(BY.has(k) || LIBRARY.some(it => it.id.startsWith(`${k}:`)), `hint ${k} names no picture`);
});

test('the shapes are sane: closed rings of a few vertices, near their anchor, heights within the picture', () => {
  let n = 0;
  for (const [id, e] of Object.entries(VECTOR_SHADOWS)) {
    if (e.same) continue;
    const it = LIBRARY[BY.get(id)!]!; if (!it) continue;
    const W = it.quad[2] - it.quad[0], H = it.quad[3] - it.quad[1], reach = 1.6 * Math.max(W, H) + 40;
    for (const r of e.c ?? []) {
      assert.ok(r.length >= 6 && r.length % 2 === 0 && r.length <= 2 * 64, `${id}: a contact ring of ${r.length / 2} points`);
      for (let i = 0; i < r.length; i += 2) { assert.ok(Number.isFinite(r[i]!) && Math.abs(r[i]!) <= reach, `${id}: contact x ${r[i]}`); assert.ok(Math.abs(r[i + 1]!) <= reach, `${id}: contact y ${r[i + 1]}`); }
      // the contact lies at the picture's foot: no higher up the screen than its top, no lower than a little under its bottom
      for (let i = 1; i < r.length; i += 2) assert.ok(r[i]! >= it.quad[1] - it.ay - 2 && r[i]! <= it.quad[3] - it.ay + 0.35 * H + 20, `${id}: contact y ${r[i]} off the picture`);
    }
    for (const r of e.s ?? []) {
      assert.ok(r.length >= 9 && r.length % 3 === 0 && r.length <= 3 * 64, `${id}: a cast ring of ${r.length / 3} points`);
      for (let i = 0; i < r.length; i += 3) {
        assert.ok(Math.abs(r[i]!) <= reach && Math.abs(r[i + 1]!) <= reach, `${id}: cast foot ${r[i]},${r[i + 1]}`);
        assert.ok(r[i + 2]! >= 0 && r[i + 2]! <= 1.6 * H + 4, `${id}: height ${r[i + 2]} in a ${H.toFixed(0)} px picture`);
      }
    }
    for (const k of ['f', 'fc'] as const) if (e[k] !== undefined) assert.ok(e[k]! > 0 && e[k]! <= 40, `${id}: ${k} ${e[k]}`);
    for (const k of ['kc', 'ks'] as const) if (e[k] !== undefined) assert.ok(e[k]! > 0 && e[k]! <= 1, `${id}: ${k} ${e[k]}`);
    n++;
  }
  assert.ok(n > 500, `${n} drawn entries`);
});

/** a synthetic picture: opaque where fn(x, y), the anchor at (ax, ay), 1 display px a texel */
function pic(w: number, h: number, ax: number, ay: number, fn: (x: number, y: number) => boolean): DraftPicture {
  const rgba = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fn(x, y)) rgba[(y * w + x) * 4 + 3] = 255;
  return { rgba, w, h, x0: 0.5 - ax, y0: 0.5 - ay, rx: 1, ry: 1 };
}
const sun = castShear(CAST);
const ys = (r: number[], s: number) => r.filter((_, i) => i % s === 1);
const xs = (r: number[], s: number) => r.filter((_, i) => i % s === 0);

test('the draft: two posts give two spots, a box its walls\' base, a tree one pool at its trunk, every cast falls to the lower left', () => {
  // a sign: two posts 4 px wide at x 10 and 50, a board from y 10 to 30 between them, 80 px tall, anchored at its middle foot
  const sign = draftShadow(pic(64, 80, 32, 79, (x, y) => ((x >= 10 && x < 14) || (x >= 50 && x < 54)) || (y >= 10 && y < 30 && x >= 8 && x < 56)), 'pole', sun)!;
  assert.equal(sign.c!.length, 2, `two spots: ${JSON.stringify(sign.c)}`);
  const cx = sign.c!.map(r => xs(r, 2).reduce((a, b) => a + b) / (r.length / 2)).sort((a, b) => a - b);
  assert.ok(Math.abs(cx[0]! - (12 - 32)) < 3 && Math.abs(cx[1]! - (52 - 32)) < 3, `the spots stand on the posts: ${cx}`);
  // the cast: lands to the lower left of the foot (the sun at the upper right)
  const s = sign.s!.flat(), land = (i: number) => [s[i]! + s[i + 2]! * sun.sx, s[i + 1]! + s[i + 2]! * sun.sy];
  let mx = 0, my = 0, n = 0; for (let i = 0; i < s.length; i += 3) { const [x, y] = land(i); mx += x!; my += y!; n++; }
  assert.ok(mx / n < -5 && my / n > 5, `the cast falls to the lower left: ${(mx / n).toFixed(1)}, ${(my / n).toFixed(1)}`);
  // an iso box: walls down to a V-shaped base (the near corner lowest), 60 px tall walls
  const box = draftShadow(pic(121, 120, 60, 119, (x, y) => y <= 119 - Math.abs(x - 60) / 2 && y >= 59 - Math.abs(x - 60) / 2 - 30 + 30 * 0), 'building', sun)!;
  assert.equal(box.c!.length, 1, 'one band along the walls\' base');
  const by = ys(box.c![0]!, 2); assert.ok(Math.max(...by) <= 8 && Math.max(...by) >= 1, `the band hugs the near corner: ${Math.max(...by)}`);
  // a tree: a 6 px trunk under a round canopy: one pool at the trunk's foot
  const tree = draftShadow(pic(80, 120, 40, 119, (x, y) => (x >= 37 && x < 43 && y > 60) || (x - 40) ** 2 + (y - 40) ** 2 < 900), 'tree', sun)!;
  assert.equal(tree.c!.length, 1); const ty = ys(tree.c![0]!, 2), tx = xs(tree.c![0]!, 2);
  assert.ok(Math.abs((Math.max(...ty) + Math.min(...ty)) / 2) < 3 && Math.abs((Math.max(...tx) + Math.min(...tx)) / 2) < 3, 'the pool is centred on the trunk\'s foot');
  // the canopy's shadow lands well away from the trunk: its far end 0.9 x its height to the lower left
  const ts = tree.s!.flat(); let far = 0; for (let i = 0; i < ts.length; i += 3) far = Math.max(far, -(ts[i]! + ts[i + 2]! * sun.sx));
  assert.ok(far > 0.6 * 0.9 * 110 * 0.8, `the canopy's shadow reaches ${far.toFixed(0)} px left`);
});

test('the sprites: a picture with a shape packs one instance (mirrored with its sprite) and no T141 shape; off, T141\'s again', () => {
  const id = Object.keys(VECTOR_SHADOWS).find(k => !VECTOR_SHADOWS[k]!.same && (VECTOR_SHADOWS[k]!.s?.length ?? 0) > 0 && LIBRARY[BY.get(k)!]!.kind !== 'car');
  if (!id) return; // (no shapes drafted yet)
  const i = BY.get(id)!, d: Drawable = { item: i, x: 100.5, y: 100.5, flip: false, scale: 1.5, x0: 100, y0: 100, x1: 101, y1: 101 }, out = new Float32Array(VECTOR_STRIDE);
  VECTOR.on = true;
  assert.ok(vecOf(i) && packVector(d, out, 0, 0, 0, spriteRect(d)), id);
  // (its drawn scale: the placed scale, held to the pixels its atlas holds)
  assert.ok(out[3]! > 0 && Math.abs(out[3]! - spriteAnchor(d)!.k) < 1e-6 && out[2] === 0, "its scale, no lift"); assert.equal(out[5], vecOf(i)!.count);
  assert.equal(contactOf(d), null, 'no T141 contact shape under a drawn one');
  assert.ok(packVector({ ...d, flip: true }, out, 0, 0, 0, spriteRect({ ...d, flip: true })) && out[4] === vecOf(i)!.mfirst && out[5] === vecOf(i)!.mcount, 'mirrored: its mirrored mesh');
  // a lifted sprite (the range's upper deck) casts from its ground spot, its lift higher
  const ground = out[1]!; assert.ok(packVector({ ...d, lift: 40 }, out, 0, 0, 0, spriteRect({ ...d, lift: 40 })) && out.at(2) === 40 && Math.abs(out[1]! - ground) < 1e-3, 'a lifted sprite casts from its ground spot, 40 px higher');
  VECTOR.on = false;
  assert.equal(packVector(d, out, 0, 0, 0, spriteRect(d)), false);
  VECTOR.on = true;
  assert.ok(vectorMesh().nVerts > 0);
});

// T185 (the owner, 2026-10-27: "shadows are not starting at the base of a sprite")
/** is ground point p (display px) inside the draft's landed cast (its rings at the default sun), or within `slack` px of it */
function castCovers(d: { s?: number[][] }, p: [number, number], slack = 1.5) {
  const rings = (d.s ?? []).map(r => { const o: [number, number][] = []; for (let i = 0; i + 2 < r.length; i += 3) o.push([r[i]! + r[i + 2]! * sun.sx, r[i + 1]! + r[i + 2]! * sun.sy]); return o; });
  let inside = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const a = r[i]!, b = r[j]!; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; }
  if (inside) return true;
  for (const r of rings) for (let i = 0; i < r.length; i++) { const a = r[i]!, b = r[(i + 1) % r.length]!, dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; if (Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= slack) return true; }
  return false;
}
test('T185 draft: a tree\'s shadow runs from its trunk\'s foot (its own band), its pool on the trunk, not on a low branch', () => {
  // a 6 px trunk at x 40 from the foot (y 119) to a round canopy (y 10..70), and a low branch hanging to the left down to y 117
  const tree = draftShadow(pic(100, 120, 40, 119, (x, y) => (x >= 37 && x < 43 && y > 60) || (x - 40) ** 2 + (y - 40) ** 2 < 900 || (x >= 2 && x < 26 && y >= 100 && y <= 117)), 'tree', sun)!;
  // the trunk's shadow: every point from its foot to its top (h 0..48) lies in the cast
  for (let h = 0; h <= 48; h += 4) assert.ok(castCovers(tree, [0 + h * sun.sx, 0 + h * sun.sy]), `the trunk's shadow at h ${h}`);
  // the pool sits on the trunk (x 0 about the anchor), though the branch's touching run is wider
  const tx = xs(tree.c![0]!, 2); assert.ok(Math.abs((Math.max(...tx) + Math.min(...tx)) / 2) < 3, `the pool on the trunk: ${(Math.max(...tx) + Math.min(...tx)) / 2}`);
});
test("T185 draft: a wall standing behind a lower porch casts from its own base; a thin leg's shadow reaches its foot", () => {
  // a box with V-shaped walls 160 px tall (base y 279 - |x - 60| / 2) and a low slab in front of its right half, its corner 16 px below the
  // left wall's base line drawn on: the old ground line ran under the slab's diamond, 16 px below the left wall's base
  const box = (x: number, y: number) => y <= 279 - Math.abs(x - 60) / 2 && y >= 119 - Math.abs(x - 60) / 2;
  const slab = (x: number, y: number) => x >= 62 && x < 118 && y <= 310 - Math.abs(x - 90) / 2 && y >= 290 - Math.abs(x - 90) / 2;
  const house = draftShadow(pic(121, 320, 60, 279, (x, y) => box(x, y) || slab(x, y)), 'building', sun)!;
  for (let x = 6; x <= 50; x += 4) assert.ok(castCovers(house, [x - 60, -(60 - x) / 2]), `the left wall's base at x ${x}`);
  // a table 900 px wide: a top on two 2 px legs 780 px apart, 280 px tall (the draft's grid is 2.5 px a cell here, a leg under one cell):
  // both legs' feet lie in the cast
  const table = draftShadow(pic(900, 300, 450, 299, (x, y) => (y >= 20 && y < 40 && x >= 50 && x < 850) || ((x === 60 || x === 61 || x === 840 || x === 841) && y >= 20)), 'prop', sun)!;
  assert.ok(castCovers(table, [60.5 - 450, 0], 3) && castCovers(table, [840.5 - 450, 0], 3), "both legs' feet");
});
test('T185 draft: a vehicle seen end on with its mirrors out at the top casts about its width tall, not its length', () => {
  // a bus from behind: 50 px wide, 140 px of picture (its length running back), mirrors sticking out 24 px either side near the top
  const bus = draftShadow(pic(110, 150, 55, 149, (x, y) => (x >= 30 && x < 80 && y >= 8) || ((x < 6 || x >= 104) && y >= 20 && y < 34) || (y >= 24 && y < 28)), 'vehicle', sun)!;
  const hMax = Math.max(...bus.s!.flatMap(r => r.filter((_, i) => i % 3 === 2)));
  assert.ok(hMax <= 0.9 * 110 + 2, `stands at most about its width tall: ${hMax}`);
});
