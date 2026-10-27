// T153 (#327): scripts/assets/prep-painted-tiles.mjs's provisional path, on a fixture art folder. A family without a handoff ships per level
// the newest complete set of four tiles (a finished tile-0x.png set first, else the newest raw tile-0x-v<k>.raw.png set), its native size
// checked (a set's four share one: a tile a px larger keeps its top-left pixels, recorded), each sha256 recorded with its source, marked
// provisional; an incomplete family is left out. When READY-MATERIALS lists the family, a re-run ships its canonical selection instead,
// removes the provisional tiles no longer used, and keeps the owner's nearUntil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const EIGHT = 'art/theme-consistency/generated/ground/eight-tiles';
const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');
/** a small opaque RGB PNG, w x h, its pixels from the seed (so every file differs) */
function png(w: number, h: number, seed: number, flat = false): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = (seed * 53 + (flat ? 0 : x * 17 + y * 29) + c * 71) & 255;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
/** a WebP's pixel size from its header (VP8, VP8L or VP8X) */
function webpSize(buf: Buffer): [number, number] {
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  throw new Error('not a webp: ' + kind);
}

interface Tile { id: string; file: string; sha256: string; source?: string; crop?: { from: number[]; removedRight: number; removedBottom: number } }
interface Level { revision: string; folder: string; native: [number, number]; decision: { file: string | null }; tiles: Tile[]; status?: string }
interface Fam { id: string; materialId: string; provisional?: boolean; selection: { file: string; sha256: string } | null; revision: string; levels: Record<'near' | 'mid' | 'far', Level> }
interface Manifest { revision: string; anchors: { far: number; nearUntil: number; zoom: number[] }; families: Fam[] }

test('the prep script ships a family without a handoff provisionally, then its canonical selection once READY-MATERIALS lists it', t => {
  const root = path.resolve('output', `tests-t153-prep-${process.pid}`), out = path.join(root, 'out');
  fs.rmSync(root, { recursive: true, force: true });
  const write = (rel: string, data: Buffer | string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/assets/prep-painted-tiles.mjs', '--art', root, '--out', out, ...args], { encoding: 'utf8' });
  const manifest = (): Manifest => JSON.parse(fs.readFileSync(path.join(out, 'src/game/painted-tiles.json'), 'utf8'));
  const tilesOnDisk = () => fs.readdirSync(path.join(out, 'src/assets/ground/painted/tiles'), { recursive: true }).map(String).filter(p => p.endsWith('.webp')).map(p => p.replace(/\\/g, '/')).sort();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  try {
    const F = `${EIGHT}/fairway`;
    write(`${EIGHT}/READY-MATERIALS.json`, JSON.stringify({ schema: 1, date: '2026-10-26', ready: [] }));
    // NEAR: v1 complete (raw v1); v2 started (one raw tile only): the newest complete set is near-v1's
    for (let i = 1; i <= 4; i++) write(`${F}/near-v1/tile-0${i}-v1.raw.png`, png(12, 6, i));
    write(`${F}/near-v1/tile-01-v1.provenance.json`, JSON.stringify({ lighting: 'UPPER RIGHT -> LOWER LEFT', reviewStatus: 'pending review' }));
    write(`${F}/near-v1/prepare-report.json`, JSON.stringify({ status: 'AI-border-repairs-required', dimensions: [12, 5] }));
    write(`${F}/near-v2/tile-01-v1.raw.png`, png(12, 6, 9));
    // MID: raw v1 and raw v2 both complete: v2; its tile-03 a px wider and taller than the others (kept at the set's 12x6, top-left)
    for (let i = 1; i <= 4; i++) { write(`${F}/mid-v1/tile-0${i}-v1.raw.png`, png(12, 6, 10 + i)); write(`${F}/mid-v1/tile-0${i}-v2.raw.png`, i === 3 ? png(13, 7, 20 + i) : png(12, 6, 20 + i)); }
    // FAR: a finished set in far-v1 and only raw tiles in the newer far-v2: the finished set wins
    for (let i = 1; i <= 4; i++) { write(`${F}/far-v1/tile-0${i}.png`, png(12, 6, 30 + i)); write(`${F}/far-v2/tile-0${i}-v1.raw.png`, png(12, 6, 40 + i)); }
    // A complete newer export with an appearance hold is not a finished asset, nor a raw fallback candidate from that same held set.
    for (const b of ['near', 'mid', 'far']) {
      for (let i = 1; i <= 4; i++) { write(`${F}/${b}-v8/tile-0${i}.png`, png(12, 6, 80 + i)); write(`${F}/${b}-v8/tile-0${i}-v8.raw.png`, png(12, 6, 90 + i)); }
      write(`${F}/${b}-v8/review/appearance-review-v8.json`, JSON.stringify({ decision: 'held-for-appearance', visualAccepted: false }));
    }
    // putting green: NEAR only (incomplete: left out); long grass: no folder at all
    for (let i = 1; i <= 4; i++) write(`${EIGHT}/putting-green/near-v1/tile-0${i}-v1.raw.png`, png(12, 6, 50 + i));

    let r = run();
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stderr, /putting-green mid: no complete set of four tiles; putting-green is left out/); assert.match(r.stderr, /long-grass near: no complete set/);
    assert.match(r.stderr, /near-v8 is held by its appearance review/);
    let m = manifest();
    assert.deepEqual(m.families.map(f => f.id), ['fairway']);
    const f = m.families[0]!;
    assert.equal(f.provisional, true); assert.equal(f.selection, null); assert.equal(f.materialId, 'painted:fairway');
    assert.deepEqual(Object.fromEntries((['near', 'mid', 'far'] as const).map(b => [b, f.levels[b].revision])), { near: 'near-v1', mid: 'mid-v1', far: 'far-v1' });
    assert.deepEqual(f.levels.near.tiles.map(x => x.source), [1, 2, 3, 4].map(i => `${F}/near-v1/tile-0${i}-v1.raw.png`), 'NEAR: the complete v1 set, not the started near-v2');
    assert.deepEqual(f.levels.mid.tiles.map(x => x.source), [1, 2, 3, 4].map(i => `${F}/mid-v1/tile-0${i}-v2.raw.png`), 'MID: the newest raw set (v2)');
    assert.deepEqual(f.levels.far.tiles.map(x => x.source), [1, 2, 3, 4].map(i => `${F}/far-v1/tile-0${i}.png`), 'FAR: the finished set first');
    for (const b of ['near', 'mid', 'far'] as const) {
      const lv = f.levels[b];
      assert.deepEqual(lv.native, [12, 6]); assert.equal(lv.decision.file, null); assert.deepEqual(lv.tiles.map(x => x.id), ['tile-01', 'tile-02', 'tile-03', 'tile-04']);
      for (const x of lv.tiles) {
        assert.equal(x.sha256, sha256(fs.readFileSync(path.join(root, x.source!))), `${x.source}: its sha256 recorded`);
        assert.equal(x.file, `tiles/fairway/${b}/${x.id}.webp`);
        assert.deepEqual(webpSize(fs.readFileSync(path.join(out, 'src/assets/ground/painted', x.file))), [12, 6], `${x.file}: the set's native size`);
      }
    }
    assert.deepEqual(f.levels.mid.tiles[2]!.crop, { from: [13, 7], removedRight: 1, removedBottom: 1 }); assert.equal(f.levels.mid.tiles[0]!.crop, undefined);
    assert.match(f.levels.mid.status!, /raw generator outputs v2; cropped to the set's 12x6: tile-03 13x7/);
    assert.match(f.levels.near.status!, /prepare-report: AI-border-repairs-required \(master 12x5\); review: pending review/);
    assert.match(f.levels.far.status!, /^finished tiles/);
    assert.equal(f.revision, sha256((['near', 'mid', 'far'] as const).flatMap(b => f.levels[b].tiles.map(x => x.sha256)).join(':')).slice(0, 12));
    assert.equal(m.anchors.far, 0.05); assert.deepEqual(m.anchors.zoom, [0.0125, 0.3]); assert.equal(m.anchors.nearUntil, 0.1); assert.equal((m.anchors as { farFrom?: number }).farFrom, 0.025);
    const provisionalRevision = m.revision;
    // --check: current
    r = run('--check'); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /the manifest is current/);

    // the owner tunes nearUntil in the manifest: a re-run keeps it
    const edited = manifest(); edited.anchors.nearUntil = 0.07; fs.writeFileSync(path.join(out, 'src/game/painted-tiles.json'), JSON.stringify(edited, null, 1) + '\n');
    r = run(); assert.equal(r.status, 0, r.stderr); assert.equal(manifest().anchors.nearUntil, 0.07);

    // the handoff lands: a canonical selection of finished tiles (other ids) in new folders, listed in READY-MATERIALS
    const sets: Record<string, unknown> = {}, levels: Record<string, unknown> = {}, ids = ['tile-01', 'tile-03', 'tile-05', 'tile-07'];
    for (const [k, b] of (['near', 'mid', 'far'] as const).entries()) {
      const folder = `${F}/${b}-v9`, decision = `${folder}/review/appearance-decision.json`;
      const dBuf = Buffer.from(JSON.stringify({ decision: 'accepted-for-art-appearance' })); write(decision, dBuf);
      const primaryTiles = ids.map((id, i) => { const file = `${folder}/${id}.png`, buf = png(12, 6, 60 + 10 * k + i); write(file, buf); return { id, file, sha256: sha256(buf), nativePixels: [12, 6] }; });
      sets[b] = { folder, revision: `${b}-v9`, primaryTileIds: ids, primaryTiles, nativePixels: [12, 6], visualDecision: { file: decision, sha256: sha256(dBuf), decision: 'accepted-for-art-appearance' } };
      levels[b] = { folder, nativePixels: [12, 6], primaryTileIds: ids, visualDecision: decision };
    }
    const selBuf = Buffer.from(JSON.stringify({ id: 'painted:fairway', light: 'UPPER RIGHT toward LOWER LEFT', displayContract: { allowMirror: false, allowRotate: false, allowFlip: false }, sets }));
    write(`${F}/canonicalselection.json`, selBuf);
    write(`${EIGHT}/READY-MATERIALS.json`, JSON.stringify({ schema: 1, date: '2026-10-27', ready: [{ id: 'painted:fairway', material: 'fairway', canonicalSelection: { file: `${F}/canonicalselection.json`, sha256: sha256(selBuf) }, levels }] }));
    r = run();
    assert.equal(r.status, 0, r.stderr + r.stdout); assert.match(r.stdout, /fairway: in READY-MATERIALS, its canonical selection ships/);
    m = manifest();
    const c = m.families.find(x => x.id === 'fairway')!;
    assert.equal(c.provisional, undefined, 'no longer provisional'); assert.deepEqual(c.selection, { file: `${F}/canonicalselection.json`, sha256: sha256(selBuf) });
    assert.equal(c.revision, sha256(selBuf).slice(0, 12)); assert.notEqual(m.revision, provisionalRevision, 'a new revision: every chunk that laid the provisional tiles is baked again');
    for (const b of ['near', 'mid', 'far'] as const) {
      assert.equal(c.levels[b].revision, `${b}-v9`); assert.deepEqual(c.levels[b].tiles.map(x => x.id), ids);
      for (const x of c.levels[b].tiles) { assert.equal(x.source, undefined); assert.equal(x.crop, undefined); }
      assert.equal(c.levels[b].decision.file, `${F}/${b}-v9/review/appearance-decision.json`);
    }
    // the provisional tiles the selection does not use are gone; only the selection's ship
    assert.deepEqual(tilesOnDisk(), (['far', 'mid', 'near'] as const).flatMap(b => ids.map(id => `fairway/${b}/${id}.webp`)).sort());
    assert.equal(m.anchors.nearUntil, 0.07, 'the owner\'s nearUntil survives the switch');
    // a tampered tile in the canonical selection stops the script before it writes anything
    write(`${F}/near-v9/tile-01.png`, png(12, 6, 99));
    const before = fs.readFileSync(path.join(out, 'src/game/painted-tiles.json'), 'utf8');
    r = run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /sha256/); assert.equal(fs.readFileSync(path.join(out, 'src/game/painted-tiles.json'), 'utf8'), before);
  } finally { /* t.after cleans the fixture */ }
});

// T162 (#350): the owner's own paintings (art/owner-supplied/<set>/, named with their hashes in its source.json): one tile a level, its edges
// healed in this step (tile-heal.mjs) so each tiles with itself, the wrap before and after recorded from the WebP that ships; a changed file
// stops the script before it writes anything.
/** a small opaque RGB PNG that does not tile: two waves and a tone gradient (each seed its own phase) */
function wavyPng(w: number, h: number, seed: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.max(0, Math.min(255, Math.round(100 + 40 * Math.sin(x * 0.29 + y * 0.13 + c + seed) + 25 * Math.sin(y * 0.21 - x * 0.07 + seed) + 0.2 * x - 0.15 * y)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
interface Wrap { lr: number; tb: number; h: number; v: number }

test('a green fallback follows the ready canonical set rather than a newer complete experiment, and the actual review must accept it', t => {
  const root = path.resolve('output', `tests-t168-art-${process.pid}`), out = path.join(root, 'out'), F = `${EIGHT}/putting-green`, DIR = 'art/owner-supplied/putting-green-20261026';
  fs.rmSync(root, { recursive: true, force: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel: string, bytes: Buffer | string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
  const run = () => spawnSync(process.execPath, ['scripts/assets/prep-painted-tiles.mjs', '--art', root, '--out', out], { encoding: 'utf8' });
  const sets: Record<string, any> = {}, levels: Record<string, any> = {}, ownerLevels: Record<string, any> = {};
  for (const b of ['near', 'mid', 'far']) {
    const folder = `${F}/${b}-v2`, decision = `${folder}/review/appearance-decision.json`, review = Buffer.from(JSON.stringify({ decision: 'accepted-for-art-appearance' }));
    write(decision, review);
    const primaryTiles = [1, 2, 3, 4].map(i => { const id = `tile-0${i}`, file = `${folder}/${id}.png`, bytes = png(24, 16, 7, true); write(file, bytes); return { id, file, sha256: sha256(bytes), nativePixels: [24, 16] }; });
    sets[b] = { folder, revision: `${b}-v2`, primaryTileIds: primaryTiles.map(x => x.id), primaryTiles, nativePixels: [24, 16], visualDecision: { file: decision, sha256: sha256(review) } };
    levels[b] = { folder, nativePixels: [24, 16], primaryTileIds: primaryTiles.map(x => x.id), visualDecision: decision };
    // A complete and numerically newer experiment must never override the handoff, including the owner's MID fallback.
    for (let i = 1; i <= 4; i++) write(`${F}/${b}-v99/tile-0${i}.png`, png(24, 16, 9, true));
    const bytes = png(240, 200, 3, true); write(`${DIR}/${b}.png`, bytes);
    ownerLevels[b] = { file: `${b}.png`, sha256: sha256(bytes), size: [240, 200] };
  }
  const writeAuthority = () => {
    const buf = Buffer.from(JSON.stringify({ id: 'painted:putting-green', sets })); write(`${F}/canonicalselection.json`, buf);
    write(`${EIGHT}/READY-MATERIALS.json`, JSON.stringify({ ready: [{ id: 'painted:putting-green', material: 'putting-green', canonicalSelection: { file: `${F}/canonicalselection.json`, sha256: sha256(buf) }, levels }] }));
  };
  writeAuthority();
  write(`${DIR}/source.json`, JSON.stringify({ id: 'paint:putting-green-fixture', family: { id: 'putting-green-paint', name: 'Putting green' }, levels: ownerLevels }));
  let r = run(); assert.equal(r.status, 0, r.stderr + r.stdout);
  const file = path.join(out, 'src/game/painted-tiles.json'), before = fs.readFileSync(file, 'utf8'), manifest = JSON.parse(before);
  const fallback = manifest.families.find((f: Fam) => f.id === 'putting-green-paint').levels.mid;
  assert.equal(fallback.folder, `${F}/mid-v2`);
  assert.deepEqual(fallback.tiles.map((x: Tile) => x.source), sets.mid.primaryTiles.map((x: Tile) => (x as Tile & { file: string }).file));
  const held = Buffer.from(JSON.stringify({ decision: 'held-for-appearance', visualAccepted: false }));
  write(sets.mid.visualDecision.file, held); sets.mid.visualDecision.sha256 = sha256(held); writeAuthority();
  r = run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /does not accept the artwork/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a hash-consistent hold must stop before rewriting shipped assets');
});

test('the owner\'s paintings (T162): hash-checked against their source.json, one tile a level, edges healed to tile, the heal\'s numbers recorded from the shipped WebP', t => {
  const root = path.resolve('output', `tests-t162-prep-${process.pid}`), out = path.join(root, 'out'), DIR = 'art/owner-supplied/rough-20261026';
  fs.rmSync(root, { recursive: true, force: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (rel: string, data: Buffer | string) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, data); return p; };
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/assets/prep-painted-tiles.mjs', '--art', root, '--out', out, ...args], { encoding: 'utf8' });
  const manifestText = () => fs.readFileSync(path.join(out, 'src/game/painted-tiles.json'), 'utf8');
  write(`${EIGHT}/READY-MATERIALS.json`, JSON.stringify({ schema: 1, date: '2026-10-26', ready: [] }));
  const sizes = { near: [240, 200], mid: [244, 198], far: [240, 200] } as const, levels: Record<string, unknown> = {}, hashes: Record<string, string> = {};
  for (const [i, b] of (['near', 'mid', 'far'] as const).entries()) {
    const buf = wavyPng(sizes[b][0], sizes[b][1], i); write(`${DIR}/${b}.png`, buf); hashes[b] = sha256(buf);
    levels[b] = { file: `${b}.png`, sha256: hashes[b], size: sizes[b] };
  }
  write(`${DIR}/source.json`, JSON.stringify({ schema: 1, id: 'owner:rough-20261026', family: { id: 'rough-owner', name: 'Rough (owner)', kind: 'grass', provisional: true }, levels }));

  let r = run();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const m = JSON.parse(manifestText());
  assert.deepEqual(m.families.map((f: Fam) => f.id), ['rough-owner']);
  const f = m.families[0] as Omit<Fam, 'levels'> & { name: string; kind: string; owner: string; levels: Record<'near' | 'mid' | 'far', Level & { heal: { method: string; band: number; before: Wrap; healed: Wrap; after: Wrap } }> };
  assert.equal(f.name, 'Rough (owner)'); assert.equal(f.kind, 'grass'); assert.equal(f.provisional, true); assert.equal(f.selection, null);
  assert.equal(f.materialId, 'owner:rough-20261026'); assert.equal(f.owner, `${DIR}/source.json`);
  assert.equal(f.revision, sha256(['near', 'mid', 'far'].map(b => hashes[b]).join(':') + '|wrap-bridge-v1/48').slice(0, 12), 'the paintings\' hashes and the heal');
  for (const b of ['near', 'mid', 'far'] as const) {
    const lv = f.levels[b], x = lv.tiles[0]!;
    assert.deepEqual(lv.tiles.map(q => q.id), ['tile-01']); assert.deepEqual(lv.native, sizes[b]); assert.equal(lv.folder, DIR); assert.equal(lv.decision.file, null);
    assert.equal(x.sha256, hashes[b]); assert.equal(x.source, `${DIR}/${b}.png`); assert.equal(x.file, `tiles/rough-owner/${b}/tile-01.webp`);
    const webp = path.join(out, 'src/assets/ground/painted', x.file);
    assert.deepEqual(webpSize(fs.readFileSync(webp)), sizes[b], 'the native size, never resized');
    const h = lv.heal; assert.equal(h.method, 'wrap-bridge-v1'); assert.equal(h.band, 48);
    assert.ok(h.before.lr > 2 * h.before.h && h.before.tb > 2 * h.before.v, `${b}: the fixture has seams (${JSON.stringify(h.before)})`);
    assert.ok(h.healed.lr <= 1.25 * h.healed.h && h.healed.tb <= 1.25 * h.healed.v, `${b}: healed (${JSON.stringify(h.healed)})`);
    // as shipped: the lossy WebP adds its own small error across the wrap (on this smooth fixture more than on a painting), the seams still gone
    assert.ok(h.after.lr < 0.6 * h.before.lr && h.after.tb < 0.6 * h.before.tb, `${b}: as shipped (${JSON.stringify(h.after)})`);
    // the numbers are the shipped WebP's: measured again here, outside the script (sharp decodes it in a child node)
    const code = `import sharp from 'sharp'; import { wrapMismatch } from './scripts/assets/tile-heal.mjs'; const d = await sharp(${JSON.stringify(webp)}).raw().toBuffer({ resolveWithObject: true }); console.log(JSON.stringify(wrapMismatch(d.data, d.info.width, d.info.height, d.info.channels)));`;
    const q = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
    assert.equal(q.status, 0, q.stderr); const again = JSON.parse(q.stdout) as Wrap;
    for (const k of ['lr', 'tb', 'h', 'v'] as const) assert.ok(Math.abs(again[k] - h.after[k]) < 0.006, `${b} ${k}: ${again[k]} vs the manifest's ${h.after[k]}`);
    assert.match(lv.status!, /one tile; edges healed to tile with itself \(wrap-bridge-v1, 48 px\)/);
  }
  r = run('--check'); assert.equal(r.status, 0, r.stdout); assert.match(r.stdout, /the manifest is current/);
  // a changed painting stops the script before it writes anything
  const before = manifestText();
  write(`${DIR}/mid.png`, wavyPng(244, 198, 7));
  r = run(); assert.notEqual(r.status, 0); assert.match(r.stderr, /mid\.png: sha256 [0-9a-f]{64} != .*source\.json/); assert.equal(manifestText(), before);
});
