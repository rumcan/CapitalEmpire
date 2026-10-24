// Save safety (T042): reading an unreadable save backs it up before anything is written, the migration chain, and the backup list. Uses an in-memory store (no IndexedDB).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP } from '../src/game/iso';
import { SAVE_VERSION, MIGRATIONS, upgradeSave, readSave, listSaveBackups, backupTownSlot, setSaveStore, gzip, gunzip, writeSave, exportSaveBytes, importSaveBytes, readBackup, deleteBackup, type SaveStore } from '../src/game/save';

/** an in-memory save store; putThrows makes every put fail (a full or private store) */
function memStore(opts: { putThrows?: boolean; getThrows?: boolean } = {}): SaveStore & { m: Map<string, ArrayBuffer> } {
  const m = new Map<string, ArrayBuffer>();
  return {
    m,
    get: async k => { if (opts.getThrows) throw new Error('no IndexedDB'); return m.get(k); },
    put: async (k, v) => { if (opts.putThrows) throw new Error('quota'); m.set(k, v); },
    del: async k => { m.delete(k); },
    keys: async () => [...m.keys()],
  };
}
const bytesOf = (b: ArrayBuffer | undefined) => new Uint8Array(b!);
const v4 = { version: 4, map: MAP, seed: 7, segs: [[1, 2, 3, 4, 'street', 0]], nodes: [], props: [['world:house_1', 5, 6, 0, 1]], money: 900, day: 3, cam: { X: 1, Y: 2, z: 0.2 } };
const v5 = { ...v4, version: 5, lots: [['lot:1', 1, 2, 0, 99, 1500]], simT: 1234.5 };

test('no save: none, and nothing to back up', async () => {
  const s = memStore(); setSaveStore(s);
  const r = await readSave();
  assert.equal(r.status, 'none');
  assert.equal(r.save, null);
  assert.equal(r.backedUp, true);
  assert.equal(s.m.size, 0);
});

test('a v5 save reads as ok, with no backup slots written', async () => {
  const s = memStore(); setSaveStore(s);
  s.m.set('town', (await gzip(JSON.stringify(v5))));
  const r = await readSave();
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save, v5);
  assert.equal(r.version, 5);
  assert.equal(r.migratedFrom, undefined);
  assert.equal(r.backedUp, true);
  assert.deepEqual([...s.m.keys()], ['town']);
});

test('a v4 save migrates to v5, its original bytes go to town-pre-v4 once', async () => {
  const s = memStore(); setSaveStore(s);
  const original = await gzip(JSON.stringify(v4));
  s.m.set('town', original);
  const r = await readSave();
  assert.equal(r.status, 'ok');
  assert.equal(r.migratedFrom, 4);
  assert.equal(r.version, 5);
  assert.equal(r.save?.version, 5);
  assert.equal(r.save?.seed, 7);
  assert.equal(r.backedUp, true);
  assert.equal(r.backup, 'town-pre-v4');
  assert.deepEqual(bytesOf(s.m.get('town-pre-v4')), bytesOf(original));
  assert.equal(s.m.size, 2);
  // reading again keeps the one old copy
  await readSave();
  assert.equal(s.m.size, 2);
  assert.deepEqual(await listSaveBackups(), ['town-pre-v4']);
});

test('a v4 save whose pre-v4 copy cannot be written still reads, with backedUp false', async () => {
  const s = memStore({ putThrows: true }); setSaveStore(s);
  s.m.set('town', await gzip(JSON.stringify(v4)));
  const r = await readSave();
  assert.equal(r.status, 'ok');
  assert.equal(r.migratedFrom, 4);
  assert.ok(r.save);
  assert.equal(r.backedUp, false);
  assert.equal(r.backup, undefined);
});

test('a v6 save (from a newer build) is kept in a backup slot, byte for byte, and the town slot is untouched', async () => {
  const s = memStore(); setSaveStore(s);
  const original = await gzip(JSON.stringify({ ...v5, version: 6 }));
  s.m.set('town', original);
  const r = await readSave();
  assert.equal(r.save, null);
  assert.equal(r.status, 'future');
  assert.equal(r.version, 6);
  assert.equal(r.backedUp, true);
  assert.ok(r.backup?.startsWith('town-backup-future-6-'), `backup key ${r.backup}`);
  assert.deepEqual(bytesOf(s.m.get(r.backup!)), bytesOf(original));
  assert.deepEqual(bytesOf(s.m.get('town')), bytesOf(original));
  assert.equal(s.m.size, 2);
});

test('garbage bytes are corrupt and backed up', async () => {
  const s = memStore(); setSaveStore(s);
  const garbage = new Uint8Array([1, 2, 3, 4, 5]).buffer;
  s.m.set('town', garbage);
  const r = await readSave();
  assert.equal(r.save, null);
  assert.equal(r.status, 'corrupt');
  assert.equal(r.backedUp, true);
  assert.ok(r.backup?.startsWith('town-backup-corrupt-x-'), `backup key ${r.backup}`);
  assert.deepEqual(bytesOf(s.m.get(r.backup!)), bytesOf(garbage));
});

test('a valid save of another map size is otherMap, and an unknown old version is corrupt', async () => {
  const s = memStore(); setSaveStore(s);
  s.m.set('town', await gzip(JSON.stringify({ version: 5, map: 999 })));
  const other = await readSave();
  assert.equal(other.status, 'otherMap');
  assert.equal(other.save, null);
  assert.equal(other.backedUp, true);
  assert.ok(other.backup?.startsWith('town-backup-otherMap-5-'), `backup key ${other.backup}`);

  const s1 = memStore(); setSaveStore(s1);
  s1.m.set('town', await gzip(JSON.stringify({ version: 1, map: MAP })));
  const old = await readSave();
  assert.equal(old.status, 'corrupt');
  assert.equal(old.save, null);
  assert.equal(old.version, 1);
  assert.equal(old.backedUp, true);
});

test('a future save whose backup cannot be written is not backed up (backedUp false), and the town slot is untouched', async () => {
  const s = memStore({ putThrows: true }); setSaveStore(s);
  const original = await gzip(JSON.stringify({ ...v5, version: 6 }));
  s.m.set('town', original);
  const r = await readSave();
  assert.equal(r.save, null);
  assert.equal(r.status, 'future');
  assert.equal(r.backedUp, false);
  assert.equal(r.backup, undefined);
  assert.deepEqual(bytesOf(s.m.get('town')), bytesOf(original));
});

test('a store that cannot be read (no IndexedDB) reads as none, not backed up', async () => {
  setSaveStore(memStore({ getThrows: true }));
  const r = await readSave();
  assert.equal(r.status, 'none');
  assert.equal(r.save, null);
  assert.equal(r.backedUp, false);
});

test('MIGRATIONS chain 3 to 4 to 5: a v3 save upgrades field by field as before', () => {
  assert.deepEqual(MIGRATIONS.map(m => m.from), [3, 4]);
  assert.equal(SAVE_VERSION, 5);
  const v3 = { version: 3, map: MAP, segs: [[1, 2, 3, 4, 'street', 0]], nodes: [], props: [], money: 500000, day: 2 };
  const up = upgradeSave(v3 as any)!;
  assert.equal(up.version, 5);
  assert.equal(up.map, MAP);
  assert.equal(up.seed, 1);
  assert.deepEqual(up.segs, v3.segs);
  assert.deepEqual(up.nodes, []);
  assert.deepEqual(up.props, []);
  assert.equal(up.money, 500000);
  assert.equal(up.day, 2);
  assert.equal(up.cam, undefined);
  assert.equal(up.lots, undefined);
  assert.equal(up.simT, undefined);
  assert.deepEqual(Object.keys(up).sort(), ['cam', 'day', 'map', 'money', 'nodes', 'props', 'seed', 'segs', 'version']);
  // the first step alone gives a v4 save
  assert.equal(MIGRATIONS[0]!.up(v3).version, 4);
});

test('listSaveBackups lists only the backup slots, newest first', async () => {
  const s = memStore(); setSaveStore(s);
  for (const k of ['town', 'other', 'town-pre-v4', 'town-backup-future-6-1000', 'town-backup-corrupt-x-2000']) s.m.set(k, new ArrayBuffer(0));
  assert.deepEqual(await listSaveBackups(), ['town-backup-corrupt-x-2000', 'town-backup-future-6-1000', 'town-pre-v4']);
});

test('backupTownSlot copies the town slot (a save that read but failed to load), and reports a failed copy', async () => {
  const s = memStore(); setSaveStore(s);
  assert.equal(await backupTownSlot('loadfailed'), false); // nothing to copy
  const buf = await gzip(JSON.stringify({ version: SAVE_VERSION, map: MAP }));
  s.m.set('town', buf);
  assert.equal(await backupTownSlot('loadfailed'), true);
  const k = [...s.m.keys()].find(x => x.startsWith('town-backup-loadfailed-'));
  assert.ok(k); assert.deepEqual(new Uint8Array(s.m.get(k!)!), new Uint8Array(buf));
  const f = memStore({ putThrows: true }); setSaveStore(f); f.m.set('town', buf);
  assert.equal(await backupTownSlot('loadfailed'), false);
});

test('a written save carries its build stamp (sha dev under the tests)', async () => {
  const s = memStore(); setSaveStore(s);
  await writeSave(v5 as any);
  const d = JSON.parse(await gunzip(s.m.get('town')!));
  assert.equal(d.build.sha, 'dev');
  assert.equal(typeof d.build.app, 'string');
  assert.equal(d.seed, 7);
});

test('exportSaveBytes: null with no save, and the exact bytes of the town slot when there is one', async () => {
  const s = memStore(); setSaveStore(s);
  assert.equal(await exportSaveBytes(), null);
  const buf = await gzip(JSON.stringify(v5));
  s.m.set('town', buf);
  assert.deepEqual(bytesOf((await exportSaveBytes())!), bytesOf(buf));
});

test('importSaveBytes refuses garbage, a newer build and another map size, and writes nothing', async () => {
  const s = memStore(); setSaveStore(s);
  const kept = await gzip(JSON.stringify(v5));
  s.m.set('town', kept);
  const keysBefore = [...s.m.keys()].sort();
  const garbage = await importSaveBytes(new Uint8Array([9, 8, 7, 6]).buffer);
  assert.deepEqual(garbage, { ok: false, why: 'Not a Capital Empire save' });
  const newer = await importSaveBytes(await gzip(JSON.stringify({ ...v5, version: 99 })));
  assert.equal(newer.ok, false);
  assert.equal(newer.why, 'This save is from a newer build (v99)');
  assert.equal(newer.version, 99);
  const otherMap = await importSaveBytes(await gzip(JSON.stringify({ ...v5, map: MAP + 1 })));
  assert.deepEqual(otherMap, { ok: false, why: 'This save is for another map size', version: 5 });
  assert.deepEqual([...s.m.keys()].sort(), keysBefore);
  assert.deepEqual(bytesOf(s.m.get('town')), bytesOf(kept));
});

test('importSaveBytes on a valid v5 save: ok, the town slot holds the new bytes and the old ones go to a town-backup-import slot', async () => {
  const s = memStore(); setSaveStore(s);
  const old = await gzip(JSON.stringify({ ...v5, simT: 1 }));
  s.m.set('town', old);
  const fresh = await gzip(JSON.stringify(v5));
  const r = await importSaveBytes(fresh);
  assert.deepEqual(r, { ok: true, version: 5 });
  assert.deepEqual(bytesOf(s.m.get('town')), bytesOf(fresh));
  const k = [...s.m.keys()].find(x => x.startsWith('town-backup-import-'));
  assert.ok(k, 'an import backup slot');
  assert.deepEqual(bytesOf(s.m.get(k!)), bytesOf(old));
  // with no current save nothing is backed up
  const empty = memStore(); setSaveStore(empty);
  assert.deepEqual(await importSaveBytes(fresh), { ok: true, version: 5 });
  assert.deepEqual([...empty.m.keys()], ['town']);
  // a current save that cannot be copied is never written over
  const full = memStore({ putThrows: true }); setSaveStore(full); full.m.set('town', old);
  const refused = await importSaveBytes(fresh);
  assert.equal(refused.ok, false);
  assert.deepEqual(bytesOf(full.m.get('town')), bytesOf(old));
});

test('readBackup and deleteBackup work on a listed backup key and refuse the town slot', async () => {
  const s = memStore(); setSaveStore(s);
  const town = await gzip(JSON.stringify(v5)), backup = new Uint8Array([4, 5, 6]).buffer;
  s.m.set('town', town);
  s.m.set('town-backup-corrupt-x-2000', backup);
  s.m.set('town-pre-v4', new Uint8Array([7]).buffer);
  s.m.set('other', new Uint8Array([8]).buffer);
  assert.deepEqual(bytesOf((await readBackup('town-backup-corrupt-x-2000'))!), bytesOf(backup));
  assert.equal(await readBackup('town'), null);
  assert.equal(await readBackup('other'), null);
  assert.equal(await deleteBackup('town'), false);
  assert.equal(await deleteBackup('other'), false);
  assert.deepEqual(bytesOf(s.m.get('town')), bytesOf(town));
  assert.ok(s.m.has('other'));
  assert.equal(await deleteBackup('town-pre-v4'), true);
  assert.equal(s.m.has('town-pre-v4'), false);
  assert.deepEqual(await listSaveBackups(), ['town-backup-corrupt-x-2000']);
});
