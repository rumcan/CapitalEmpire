// T172 (#403): the game's RAM, step 2. The dev build's ?boot= memory budgets (boot.ts withBootNumbers) and the vector shadows' mesh let go
// after its upload (shadow-vector.ts releaseVectorMeshData), rebuilt the same for a second upload (vectorMeshData).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BOOT, withBootNumbers } from '../src/game/boot';
import { VERTEX_FLOATS, buildVectorMesh, releaseVectorMeshData, vectorMesh, vectorMeshData } from '../src/game/shadow-vector';

test('withBootNumbers: sets the named budgets, null for the default, ignores unknown keys and values that are not numbers', () => {
  const b = withBootNumbers({ ...GAME_BOOT }, 'atlasKeep:2, tileSources:12,groundPx:32000000,atlasMB:null,bogus:3,paintedSources:x');
  assert.equal(b.atlasKeep, 2); assert.equal(b.tileSources, 12); assert.equal(b.groundPx, 32e6); assert.equal(b.atlasMB, null);
  assert.equal(b.paintedSources, GAME_BOOT.paintedSources, 'not a number: unchanged');
  assert.ok(!('bogus' in b));
  assert.equal(withBootNumbers({ ...GAME_BOOT }, 'groundPx:null').groundPx, GAME_BOOT.groundPx, 'the ground budget has no null');
  assert.deepEqual(withBootNumbers({ ...GAME_BOOT }, ''), { ...GAME_BOOT });
});

test('the vector mesh: its data let go after the upload, the ranges kept, the same data built again for another upload', () => {
  const fresh = buildVectorMesh(), m = vectorMesh();
  assert.equal(m.verts.length >= m.nVerts * VERTEX_FLOATS, true);
  const ids = [...m.at.keys()].slice(0, 5);
  releaseVectorMeshData();
  const r = vectorMesh();
  assert.equal(r.verts.length, 0); assert.equal(r.idx.length, 0);
  assert.equal(r.nVerts, fresh.nVerts); assert.equal(r.nIdx, fresh.nIdx);
  for (const id of ids) assert.deepEqual(r.at.get(id), fresh.at.get(id), `${id}: its range kept`);
  const d = vectorMeshData();
  assert.equal(d.nVerts, fresh.nVerts); assert.deepEqual([...d.verts.subarray(0, 64)], [...fresh.verts.subarray(0, 64)]);
  assert.equal(d.verts.length, fresh.verts.length); assert.equal(d.idx.length, fresh.idx.length);
  assert.equal(vectorMesh().verts.length, 0, 'the game’s mesh stays without its data');
});
