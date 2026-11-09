// T172 (#403): the game's RAM, step 2. The dev build's ?boot= memory budgets (boot.ts withBootNumbers) and the vector shadows' mesh let go
// after its upload (shadow-vector.ts releaseVectorMeshData), rebuilt the same for a second upload (vectorMeshData).
// npm test (bundled by esbuild, run by node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_BOOT, withBootNumbers } from '../src/game/boot';
import { VERTEX_FLOATS, buildVectorMesh, releaseVectorMeshData, vectorMesh, vectorMeshData } from '../src/game/shadow-vector';
import { releaseBuffer } from '../src/game/release-buffer';

/** can this runtime detach an ArrayBuffer at once (ArrayBuffer.prototype.transfer: Chrome and Edge 114, Node 21)? Where it cannot, the bytes stay for the collector, as before */
const CAN_DETACH = typeof (ArrayBuffer.prototype as { transfer?: unknown }).transfer === 'function';

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

test('T375 releaseBuffer: a typed array\'s bytes go back at once where the runtime can, nothing breaks where it cannot', () => {
  const a = new Float32Array(4096); a[0] = 1; releaseBuffer(a);
  assert.equal(a.length, CAN_DETACH ? 0 : 4096, CAN_DETACH ? 'the buffer was detached: the array is empty' : 'no ArrayBuffer.prototype.transfer here: left for the collector');
  releaseBuffer(null); releaseBuffer(undefined); // nothing to release
  const shared = new Float32Array(new SharedArrayBuffer(64)); releaseBuffer(shared); // a buffer nobody can detach is left alone
  assert.equal(shared.length, 16);
});

test('T375 the mesh the game uploaded: its arrays go back at once, the ranges and the counts stay for the sprites', () => {
  const m = vectorMeshData(), nVerts = m.nVerts, pictures = m.at.size; // (the game's mesh, or one built again when an earlier test let it go)
  assert.ok(m.verts.length >= nVerts * VERTEX_FLOATS && nVerts > 0);
  releaseVectorMeshData(m);
  if (CAN_DETACH) { assert.equal(m.verts.length, 0, 'the uploaded mesh\'s vertices were detached'); assert.equal(m.idx.length, 0); }
  const r = vectorMesh(); assert.equal(r.verts.length, 0); assert.equal(r.nVerts, nVerts); assert.equal(r.at.size, pictures);
  // another upload (a second engine on the page) builds it again, whole
  const again = vectorMeshData(); assert.equal(again.nVerts, nVerts); assert.ok(again.verts.length >= nVerts * VERTEX_FLOATS);
  releaseVectorMeshData(again);
});
