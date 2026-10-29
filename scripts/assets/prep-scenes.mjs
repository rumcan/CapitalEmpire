// T242 (#702, plan P28 3): the set-the-scene pictures into the game. The owner's scenes (GOLF-ART-LIST section 13) are untracked PNGs in the
// main checkout, about 2 MB each, under art/theme-consistency/generated/scenes/<slug>/. Each accepted picture is sized for the scene card and
// saved as src/assets/scenes/<slug>-<state>.webp (1024 px wide, about 80% quality: 100-250 KB), listed with its size, source and sha256 in
// src/assets/scenes/manifest.json. The game (src/game/scenes.ts) picks a place's picture from the manifest by the place's state; the card
// (src/ui/SceneCard.tsx) loads it only when it opens.
//
// The names the script reads (the art agent's convention, batch 1 of 2026-10-28):
//   <scenes>/<slug>/<slug>-<state>-v<N>.png   one state of a place: rundown, upgraded, tier1..tier5, ... (the highest N of each state wins)
//   <scenes>/<slug>/<slug>-v<N>.png           a place with one picture (state "one")
// Sub-folders (rejected/) are never read, nor a picture whose provenance says it was rejected. A new slug or state is picked up on the next run
// (the owner adds batch 2 later); a picture is encoded again only when its source changed (or --force). A picture whose source is gone stays
// listed unless --prune.
//   node scripts/assets/prep-scenes.mjs [--src <scenes folder>] [--width 1024] [--quality 80] [--force] [--prune] [--dry]
//   (default --src: the main checkout's art/theme-consistency/generated/scenes)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; }, flag = k => args.includes(`--${k}`);
// the main checkout (a worktree's common git dir's parent): the art is untracked there
const main = (() => { try { return path.dirname(path.resolve(root, execSync('git rev-parse --git-common-dir', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim())); } catch { return root; } })();
const SRC = path.resolve(opt('src', path.join(main, 'art/theme-consistency/generated/scenes')));
const OUT = path.join(root, 'src/assets/scenes'), MANIFEST = path.join(OUT, 'manifest.json');
const WIDTH = +opt('width', '1024'), QUALITY = +opt('quality', '80'), FORCE = flag('force'), PRUNE = flag('prune'), DRY = flag('dry');

if (!fs.existsSync(SRC)) { console.error(`prep-scenes: no scenes folder at ${SRC} (pass --src)`); process.exit(1); }
const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { v: 1, pictures: [] };
const byKey = new Map(old.pictures.map(p => [`${p.slug}|${p.state}`, p]));

/** the accepted pictures in a slug's folder: the highest version of each state */
function found(slug) {
  const dir = path.join(SRC, slug), best = new Map();
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!f.isFile() || !f.name.endsWith('.png')) continue;
    const pre = `${slug}-`; if (!f.name.startsWith(pre)) continue;
    const m = /^(?:(.+)-)?v(\d+)\.png$/.exec(f.name.slice(pre.length)); if (!m) continue;
    const state = m[1] ?? 'one', n = +m[2];
    const prov = path.join(dir, f.name.replace(/\.png$/, '.provenance.json'));
    if (fs.existsSync(prov)) { try { const j = JSON.parse(fs.readFileSync(prov, 'utf8')); if (/reject/i.test(String(j.reviewStatus ?? ''))) continue; } catch { /* unreadable provenance: the picture still counts */ } }
    const b = best.get(state); if (!b || n > b.n) best.set(state, { n, file: path.join(dir, f.name) });
  }
  return [...best].map(([state, b]) => ({ state, ...b }));
}

const slugs = fs.readdirSync(SRC, { withFileTypes: true }).filter(d => d.isDirectory() && d.name !== 'rejected').map(d => d.name).sort();
const seen = new Set(), pictures = [];
let made = 0, kept = 0;
if (!DRY) fs.mkdirSync(OUT, { recursive: true });
for (const slug of slugs) for (const { state, n, file } of found(slug).sort((a, b) => (a.state < b.state ? -1 : 1))) {
  const key = `${slug}|${state}`; seen.add(key);
  const raw = fs.readFileSync(file), sha = crypto.createHash('sha256').update(raw).digest('hex');
  const name = `${slug}-${state}.webp`, out = path.join(OUT, name), was = byKey.get(key);
  const source = path.relative(main, file).split(path.sep).join('/');
  if (!FORCE && was && was.sha256 === sha && was.width === WIDTH && was.quality === QUALITY && fs.existsSync(out)) { pictures.push({ ...was, source, version: n }); kept++; continue; }
  const img = sharp(raw).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: QUALITY, effort: 6, smartSubsample: true });
  const buf = await img.toBuffer(), meta = await sharp(buf).metadata();
  if (!DRY) fs.writeFileSync(out, buf);
  pictures.push({ slug, state, file: name, w: meta.width, h: meta.height, bytes: buf.length, width: WIDTH, quality: QUALITY, version: n, source, sha256: sha });
  made++;
  console.log(`${DRY ? 'would make' : 'made'} ${name}: ${meta.width}x${meta.height}, ${(buf.length / 1024).toFixed(0)} KB (from ${path.basename(file)})`);
}
// the pictures whose source is gone: kept (another checkout may lack the art), or dropped with --prune
for (const p of old.pictures) {
  if (seen.has(`${p.slug}|${p.state}`)) continue;
  if (PRUNE) { if (!DRY) fs.rmSync(path.join(OUT, p.file), { force: true }); console.log(`${DRY ? 'would drop' : 'dropped'} ${p.file} (its source is gone)`); continue; }
  console.warn(`kept ${p.file}: its source ${p.source} is gone (--prune drops it)`); pictures.push(p);
}
pictures.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.state < b.state ? -1 : 1));
const total = pictures.reduce((s, p) => s + p.bytes, 0);
const text = JSON.stringify({ v: 1, note: 'Made by scripts/assets/prep-scenes.mjs (T242): never edit by hand', pictures }, null, 1) + '\n';
if (!DRY && (made || PRUNE || !fs.existsSync(MANIFEST) || fs.readFileSync(MANIFEST, 'utf8') !== text)) fs.writeFileSync(MANIFEST, text);
console.log(`${pictures.length} pictures (${made} made, ${kept} unchanged) in ${slugs.length} places: ${(total / 1024).toFixed(0)} KB in all`);
