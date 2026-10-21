import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { LIBRARY, ATLAS_PAGES } from '../src/game/library';
import { compose, type LotGeom, type Placed } from '../src/game/lots/compose';
import { OWNER_SCALE, REMOVED_IDS } from '../src/game/lots/scales';
import { LU, LV } from '../src/game/lots/town';

const MATERIALS = ['timber-stack', 'brick-pallet', 'block-pallet', 'roof-tile-pallet', 'gravel-pile', 'sand-pile', 'cement-bag-pallet', 'tile-crate', 'pipe-bundle', 'steel-beams', 'rebar-bundle', 'pallet-stack', 'stone-pallet', 'mortar-tools', 'lumber-stack', 'mesh-rolls'].map(id => `construction:${id}`);
const IDS = [...MATERIALS, 'construction:digger'], removed = new Set<string>(REMOVED_IDS);
const byId = new Map(LIBRARY.map(i => [i.id, i]));
const FRAMES = [
  { u: { x: 1, y: 0 }, n: { x: 0, y: -1 } },
  { u: { x: 0, y: 1 }, n: { x: -1, y: 0 } },
  { u: { x: -1, y: 0 }, n: { x: 0, y: 1 } },
  { u: { x: 0, y: -1 }, n: { x: 1, y: 0 } },
];
const lotOf = (frame: typeof FRAMES[number], w = 8, d = 15): LotGeom => ({ o: { x: 100, y: 100 }, ...frame, w, d });
const state = (seed: number) => ({ use: LU.COM, level: LV.BUILDING, decline: 0, seed });

/** A construction prop's engine footprint, in world tiles (one tile is 2 m). */
function footprint(p: Placed): number[] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of byId.get(p.id)!.boxes) {
    const k = p.scale / 2, hx = (p.flip ? b.hy : b.hx) * k, hy = (p.flip ? b.hx : b.hy) * k;
    const x = p.x + (p.flip ? b.dy : b.dx) * k, y = p.y + (p.flip ? b.dx : b.dy) * k;
    x0 = Math.min(x0, x - hx); y0 = Math.min(y0, y - hy); x1 = Math.max(x1, x + hx); y1 = Math.max(y1, y + hy);
  }
  return [x0, y0, x1, y1];
}

test('construction artwork is appended once after existing business art and honors studio removals', () => {
  const lastBusiness = LIBRARY.reduce((last, it, i) => it.id.startsWith('business:') ? i : last, -1);
  for (const id of IDS) {
    const entries = LIBRARY.filter(it => it.id === id);
    assert.equal(entries.length, removed.has(id) ? 0 : 1, id);
    if (!entries.length) continue;
    assert.ok(LIBRARY.indexOf(entries[0]) > lastBusiness, `${id}: existing save indices must stay ahead of construction`);
    assert.equal(entries[0].tex[0], ATLAS_PAGES.length - 1, `${id}: missing appended atlas page`);
    assert.equal(ATLAS_PAGES[entries[0].tex[0]].length, 5, `${id}: missing mip levels`);
  }
});

test('studio scale generation includes supplemental sprites and ignores unknown override IDs', () => {
  // Run the real generator against a small offline fixture; no atlas packing or source repository access is needed.
  const root = mkdtempSync(join(tmpdir(), 'capital-construction-'));
  try {
    const assets = join(root, 'scripts/assets'), game = join(root, 'src/game');
    mkdirSync(assets, { recursive: true }); mkdirSync(game, { recursive: true });
    writeFileSync(join(assets, 'prep-scales.mjs'), readFileSync(resolve('scripts/assets/prep-scales.mjs')));
    writeFileSync(join(assets, 'source.mjs'), `export const ROOT = ${JSON.stringify(root)}; export async function fromBranch() { return JSON.stringify({ 'town:test': { scale: 1.2 } }); }`);
    writeFileSync(join(assets, 'overrides.mjs'), `export const SCALE_OVERRIDES = { 'construction:digger': 1.5, 'business:test': 0.8, 'missing:stale': 2 };`);
    writeFileSync(join(assets, 'removed.mjs'), 'export const readRemoved = () => ({});');
    writeFileSync(join(game, 'library.ts'), `import { appendConstruction } from './construction-library';\nimport { appendBusinesses } from './business-library';\nconst items = [{"id":"town:test"}];`);
    writeFileSync(join(game, 'construction-library.ts'), 'const items = [{"id":"construction:digger"}];');
    writeFileSync(join(game, 'business-library.ts'), 'const items = [{"id":"business:test"}];');
    execFileSync(process.execPath, [join(assets, 'prep-scales.mjs')], { cwd: root });
    const generated = readFileSync(join(game, 'lots/scales.ts'), 'utf8');
    assert.match(generated, /"construction:digger": 1\.5/);
    assert.match(generated, /"business:test": 0\.8/);
    assert.match(generated, /"town:test": 1\.2/);
    assert.ok(!generated.includes('missing:stale'), 'an override for a missing sprite must not enter OWNER_SCALE');
  } finally {
    assert.equal(dirname(root), resolve(tmpdir()), 'fixture cleanup must remain inside the temporary directory');
    rmSync(root, { recursive: true, force: true });
  }
});

test('seeded building sites use the digger and every supplied material on both street axes', () => {
  for (const frame of FRAMES) {
    const lot = lotOf(frame), seen = new Set<string>();
    for (let seed = 1; seed <= 128; seed++) {
      const c = compose(lot, state(seed));
      for (const p of c.props) seen.add(p.id);
      const digger = c.props.find(p => p.id === 'construction:digger');
      if (!removed.has('construction:digger')) {
        assert.ok(digger, `seed ${seed}: no digger`);
        assert.equal(digger.flip, Math.abs(lot.n.y) > Math.abs(lot.n.x), 'digger source faces +X; mirrored art faces +Y');
        const ratio = digger.scale / (OWNER_SCALE[digger.id] ?? 1);
        assert.ok(ratio >= 0.95 && ratio <= 1.05, 'digger respects studio scale and seeded size variation');
      }
      assert.ok(!c.props.some(p => p.id.includes('junkyard-crane')), 'the supplied digger replaces the scrapyard crane');
      assert.deepEqual(c, compose(lot, state(seed)), `seed ${seed}: composition changed on repeat`);
    }
    for (const id of MATERIALS) if (!removed.has(id)) assert.ok(seen.has(id), `${id}: never placed for street normal ${JSON.stringify(frame.n)}`);
    assert.ok([...seen].some(id => /concrete-rubble/.test(id)), 'sites retain rubble');
    assert.ok([...seen].some(id => /cable-spool/.test(id)), 'sites retain cable spools');
    assert.ok([...seen].some(id => /forklift/.test(id)), 'sites retain forklifts');
  }
});

test('construction pieces stay within lot footprints at varied sizes and never overlap beyond composer tolerance', () => {
  for (const frame of FRAMES) for (const [w, d] of [[4, 6], [8, 15], [12, 12]]) for (let seed = 1; seed <= 24; seed++) {
    const lot = lotOf(frame, w, d), c = compose(lot, state(seed));
    const props = c.props.filter(p => p.id.startsWith('construction:'));
    const boxes = props.map(footprint);
    for (let i = 0; i < props.length; i++) {
      const p = props[i], [x0, y0, x1, y1] = boxes[i];
      assert.ok(!removed.has(p.id), `${p.id}: removed sprite placed`);
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) {
        const dx = x - lot.o.x, dy = y - lot.o.y, a = dx * lot.u.x + dy * lot.u.y, b = dx * lot.n.x + dy * lot.n.y;
        assert.ok(a >= -0.3 - 1e-9 && a <= w + 0.3 + 1e-9 && b >= -0.3 - 1e-9 && b <= d + 0.3 + 1e-9, `${p.id}: footprint outside ${w}x${d} lot`);
      }
      for (let j = 0; j < i; j++) {
        const a = boxes[i], b = boxes[j], ix = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), iy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
        if (ix <= 0.02 || iy <= 0.02) continue;
        const share = ix * iy / Math.min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]));
        assert.ok(share <= 0.35 + 1e-9, `${p.id} overlaps ${props[j].id}`);
      }
    }
  }
});
