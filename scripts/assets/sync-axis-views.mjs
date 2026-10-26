// The screen-axis sets into the repo (T154): the art model's <slug>-screen-axis-4views-v<n> sets (art/theme-consistency/HANDOVER.md "Active
// checkpoint: buildings and eight headings": four genuine quarter turns whose footings run along the screen axes, the cardinal headings of the
// eight-view contract NE,SE,SW,NW,N,E,S,W, for buildings on roads at 45 degrees) of every category (buildings, landscaping, props, cars), copied
// to art/axis-views/<slug>/ with their provenance and hashes. prep-axis-views.mjs packs them (and runs this first); prep-cars.mjs takes the
// eight-way cars' four cardinal headings from them.
//   node scripts/assets/sync-axis-views.mjs [generated-folder ...]   (default: the main checkout's art/theme-consistency/generated, then the
//   theme-consistency worktree's, then this checkout's; a version found in several is taken from the first)
// The headings, as the provenance's prompts define them (never reinterpreted, never mirrored): N the front (a car's nose) faces screen down,
// E screen right, S screen up (the rear faces the camera), W screen left; one quarter turn each, the same order as NE, SE, SW, NW (front +y, +x,
// -y, -x in world tiles), half a turn on: N lies between NE and SE.
// Each subject takes its newest version, and its crops in this order:
//   crops-v2    <version>-crops-v2/{N,E,S,W}.native.png: the art model's reviewed source rectangles, copied byte for byte (their sha256 checked
//               against the provenance's nativeSha256)
//   half-cells  <version>/{N,E,S,W}.native.png: equal half-cell crops, copied byte for byte, when no subject crosses its half cell
//   recut       the sheet cut by its subjects (axis-cells.mjs cutSheet: pixel-exact) when a subject crosses its half cell (the half-cell crops
//               clip it: the art model's "hold" for the 4-, 5- and 6-storey car parks) or there are no crops yet (world-trashcan)
// Without the generated folders (a fresh clone) the copies already in art/axis-views are kept.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cutSheet, trimmed } from './axis-cells.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const AXIS_STORE = path.join(root, 'art/axis-views');
export const AXIS_DIRS = ['N', 'E', 'S', 'W'];
/** what each heading shows (the provenance prompts' words, for the record) */
export const AXIS_HEADING = { N: 'front faces screen down', E: 'front faces screen right (its right side to the camera)', S: 'front faces screen up (its rear to the camera)', W: 'front faces screen left (its left side to the camera)' };
const CATS = ['buildings', 'landscaping', 'props', 'cars'];
const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

/** sync every screen-axis set into art/axis-views (the folders given, else the default ones); returns the subjects { id: slug } synced */
export async function syncAxisViews(folders = []) {
  const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root }).toString().trim())); } catch { return root; } })();
  const GEN = 'art/theme-consistency/generated';
  const bases = [...new Set(folders.length ? folders.map(d => path.resolve(d)) : [path.join(main, GEN), path.join(main, 'worktrees/theme-consistency', GEN), path.join(root, GEN)])].filter(d => fs.existsSync(d));
  const best = new Map(), seen = new Set();
  for (const base of bases) for (const cat of CATS) {
    const dir = path.join(base, cat); if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const m = /^(.+)-screen-axis-4views-v(\d+)\.provenance\.json$/.exec(file); if (!m) continue;
      const version = `${m[1]}-screen-axis-4views-v${m[2]}`; if (seen.has(version)) continue; seen.add(version);
      const prov = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), id = prov.id;
      if (prov.integrationStatus === 'blocked' || prov.screenAxisExport?.integrationStatus === 'blocked') { console.log(`withheld ${id} (${version}): blocked`); continue; }
      if (!fs.existsSync(path.join(dir, `${version}.png`))) { console.log(`withheld ${id} (${version}): no sheet`); continue; }
      const b = best.get(id); if (!b || b.n < +m[2]) best.set(id, { id, slug: m[1], cat, version, n: +m[2], dir, prov, file: path.join(dir, file) });
    }
  }
  if (!best.size) { console.log(`no screen-axis sets found (${bases.length ? bases.map(d => path.relative(root, d) || '.').join(', ') : 'no generated folders'}): the copies in art/axis-views are kept`); return {}; }
  const synced = {};
  for (const { id, slug, cat, version, dir, prov, file } of [...best.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const sheet = fs.readFileSync(path.join(dir, `${version}.png`)), exp = prov.screenAxisExport, out = path.join(AXIS_STORE, slug);
    const have = d => AXIS_DIRS.every(v => fs.existsSync(path.join(dir, d, `${v}.native.png`)));
    let crops, views = {}, rects = null, why = '';
    if (have(`${version}-crops-v2`)) {
      crops = 'crops-v2';
      for (const v of AXIS_DIRS) views[v] = fs.readFileSync(path.join(dir, `${version}-crops-v2`, `${v}.native.png`));
      for (const v of AXIS_DIRS) { const want = exp?.views?.[v]?.nativeSha256; if (want && /crops-v2/.test(exp.views[v].nativeFile ?? '') && want !== sha(views[v])) throw Error(`${id} ${v}: crops-v2 sha256 differs from its provenance`); }
    } else {
      const cut = await cutSheet(sheet);
      if (have(version) && !cut.crossed.length) { crops = 'half-cells'; for (const v of AXIS_DIRS) views[v] = fs.readFileSync(path.join(dir, version, `${v}.native.png`)); }
      else {
        crops = 'recut'; views = cut.views; rects = cut.rects;
        why = have(version) ? `the half-cell crops clip ${cut.crossed.join(', ')} (the subject crosses its half cell): cut from the sheet by its subjects` : 'no crops yet: cut from the sheet by its subjects';
      }
    }
    fs.mkdirSync(out, { recursive: true });
    const old = fs.existsSync(path.join(out, 'source.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'source.json'), 'utf8')) : null, record = {};
    for (const v of AXIS_DIRS) {
      const h = sha(views[v]);
      if (old?.views?.[v]?.sha256 !== h || !fs.existsSync(path.join(out, `${v}.png`))) fs.writeFileSync(path.join(out, `${v}.png`), views[v]);
      const t = await trimmed(views[v]);
      record[v] = { file: `${v}.png`, sha256: h, ...(exp?.views?.[v]?.nativeSha256 && crops !== 'recut' ? { nativeSha256: exp.views[v].nativeSha256 } : {}), ...(exp?.views?.[v]?.pixelSha256 && crops !== 'recut' ? { pixelSha256: exp.views[v].pixelSha256 } : {}),
        ...(rects ? { sheetRect: rects[v] } : exp?.views?.[v]?.sourceRect && crops === 'crops-v2' ? { sheetRect: exp.views[v].sourceRect } : {}), trim: t.rect, heading: AXIS_HEADING[v] };
    }
    fs.copyFileSync(file, path.join(out, 'provenance.json'));
    const source = { id, slug, category: cat, version, crops, ...(why ? { why } : {}), sheetSha256: sha(sheet), status: exp?.fileContractStatus ?? prov.integrationStatus ?? null, ...(prov.storeys ? { storeys: prov.storeys } : {}), views: record };
    fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify(source, null, 1) + '\n');
    if (old?.version !== version || old?.crops !== crops) console.log(`synced ${id}: ${version} (${crops}${why ? `: ${why}` : ''})`);
    synced[id] = slug;
  }
  console.log(`screen-axis sets: ${Object.keys(synced).length} subjects in art/axis-views (from ${bases.map(d => path.relative(root, d) || '.').join(', ')})`);
  return synced;
}

/** the synced subjects as prep-axis-views and prep-cars read them: every art/axis-views/<slug>/source.json */
export function axisSources() {
  if (!fs.existsSync(AXIS_STORE)) return [];
  return fs.readdirSync(AXIS_STORE).filter(d => fs.existsSync(path.join(AXIS_STORE, d, 'source.json'))).sort().map(d => ({ dir: path.join(AXIS_STORE, d), ...JSON.parse(fs.readFileSync(path.join(AXIS_STORE, d, 'source.json'), 'utf8')) }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await syncAxisViews(process.argv.slice(2));
