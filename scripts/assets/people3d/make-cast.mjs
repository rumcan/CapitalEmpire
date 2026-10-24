// Makes every person of the cast (art/people-cast.json, or --cast <file>) who has no sheet yet, or no sheet for one of its extra clips,
// one at a time (RUN allows only a few jobs at once):
//   1. the model from RUN: from the person's A-pose picture (image: make-pictures.mjs) or from the text (make-person-3d.mjs --model-only; it waits
//      out the CLI's 600 s timeout and finds the model in RUN's library)
//   2. the ground plate cut off the model, locally and free (cut-plate.mjs: model-cut.glb, git-ignored, which the rig then uses; receipt.json gets plateCut)
//   3. the extra clips the base lacks (e.g. golf_drive), made by RUN once per base (animate-3d), then the rig with the walk, idle and extra clips,
//      locally from the person's base (rig-local-person.mjs; free)
//   4. the sheet (render-person-3d.mjs with the person's render settings: the hands and arms the owner chose), and a sheet per extra clip
// A person that fails is logged and skipped; rerun to try again (finished steps are kept). Progress: output/people-cast.log.
// The cast also has runClips (RUN's own names for a clip, tried in turn) and clipRender (a clip sheet's args; default --frames 4).
//
//   node scripts/assets/people3d/make-cast.mjs [--cast <file>] [--only id,id] [--render-only] [--limit n]
//     --cast: the cast to make (default art/people-cast.json; a scratch cast for tests; its paths are from the repo root)
//     --render-only: re-render every person who has a rig (after a change of the render settings); no credits
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const cast = JSON.parse(fs.readFileSync(path.resolve(root, arg('--cast') ?? 'art/people-cast.json'), 'utf8'));
const only = arg('--only')?.split(','), limit = +(arg('--limit') ?? Infinity), renderOnly = process.argv.includes('--render-only');
const LOG = path.join(root, 'output/people-cast.log'); fs.mkdirSync(path.dirname(LOG), { recursive: true });
const log = t => { const line = `${new Date().toISOString()} ${t}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

// every look must start differently (the library lists about the first 38 characters of a prompt)
const starts = new Map();
for (const p of cast.people) { const k = p.look.slice(0, 38); if (starts.has(k)) throw new Error(`${p.id} and ${starts.get(k)} start alike: "${k}"`); starts.set(k, p.id); }

const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/assets/people3d', script), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { ok: r.status === 0, out: out.split('\n').slice(-6).join(' | '), all: out, last: (r.stdout ?? '').trim().split('\n').pop() };
};
// RUN's daily 3D cap or its rate limit: the batch stops (exit 3, see make-cast-loop.sh)
const capped = text => /rate limit|too many requests|AI_POLICY_BUDGET_EXHAUSTED|credit cap/i.test(text);
// RUN's game id: TrickOrTreat's game.config.prod.json (read only), as make-person-3d.mjs
const gameId = () => JSON.parse(fs.readFileSync(path.join(tot, 'game.config.prod.json'), 'utf8')).gameId;

/** a base's clip: made once by RUN from the base's rig and then moved onto every person of that base (rig-local-person.mjs reads it).
 *  The names tried in turn: the clip's own, then cast.runClips (RUN's names for it); the first that writes a new .glb is kept */
function baseClip(base, clip) {
  const want = path.join(root, 'art/people3d', base, `anim_${clip}.glb`);
  if (fs.existsSync(want)) return { ok: true };
  const outDir = `output/base-clips/${base}-${clip}`, dir = path.join(root, outDir);
  fs.mkdirSync(dir, { recursive: true });
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'art/people3d', base, 'rigged.glb'))).digest('hex');
  const glbs = () => fs.readdirSync(dir).filter(f => f.endsWith('.glb'));
  let last = '';
  for (const name of [clip, ...(cast.runClips?.[clip] ?? [])]) {
    const before = new Set(glbs());
    const animate = (...more) => { const r = spawnSync('rundot', ['game', 'animate-3d', '--game-id', gameId(), '--input', `art/people3d/${base}/rigged.glb`, '--source-sha256', sha, '--animations', name, '--out-dir', outDir, '--max-credits', '800', '--json', ...more], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
      return `${r.stdout ?? ''}${r.stderr ?? ''}${r.error?.message ?? ''}`.replace(/\r/g, '').trim(); };
    let text = animate();
    // the CLI gives up after 600 s while RUN keeps going: fetch the same job's clip (--resume, from the receipt in the out dir), never pay twice
    for (let k = 0; k < 20 && /HttpClient\.Timeout|TaskCanceled/i.test(text) && !glbs().some(f => !before.has(f)); k++) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60000);
      text = animate('--resume');
    }
    const file = glbs().find(f => !before.has(f));
    if (file) { fs.copyFileSync(path.join(dir, file), want); log(`${base}: base clip ${clip} (RUN's ${name}) -> art/people3d/${base}/anim_${clip}.glb`); return { ok: true }; }
    if (capped(text)) return { capped: true };
    last = text.split('\n').slice(-3).join(' | ');
  }
  return { ok: false, out: last };
}

/** the ground plate RUN fuses to a model's shoes (a patch of golf course): cut off locally and free. cut-plate.mjs writes model-cut.glb only when
 *  it finds a plate, and rig-local-person.mjs then rigs that one. model.glb stays RUN's original (2 MB, in git); the cut one is about 18 MB
 *  (no compression), so it is git-ignored and remade by this step (a model already cut is not cut again) */
function cutPlate(p, dir) {
  const model = path.join(dir, 'model.glb'), cut = path.join(dir, 'model-cut.glb');
  if (fs.existsSync(cut)) return;
  const r = run('cut-plate.mjs', [model, cut]);
  if (!r.ok) { log(`${p.id}: plate cut FAILED: ${r.out}`); return; }
  if (!fs.existsSync(cut)) return;
  const rf = path.join(dir, 'receipt.json'), rec = JSON.parse(fs.existsSync(rf) ? fs.readFileSync(rf, 'utf8') : '{}');
  rec.plateCut = r.last; fs.writeFileSync(rf, JSON.stringify(rec, null, 2) + '\n');
  log(`${p.id}: plate cut (${r.last})`);
}

let made = 0;
person: for (const p of cast.people) {
  if (only && !only.includes(p.id)) continue;
  if (made >= limit) break;
  const dir = path.join(root, p.root, p.id), has = f => fs.existsSync(path.join(dir, f));
  const extra = [...new Set(p.clips ?? [])], render = { ...cast.render, ...p.render };
  // the template sheet (sheet.json) and each extra clip's sheet (<clip>.json): a rerun makes only what is missing
  const template = renderOnly || !has('sheet.json'), sheets = extra.filter(c => renderOnly || !has(`${c}.json`));
  if (!template && !sheets.length) continue;
  if (renderOnly && !has('anim_walk.glb')) continue;
  // the rig again when an extra clip's animation is missing (free: it rewrites them all)
  const rig = !renderOnly && (!has('anim_walk.glb') || extra.some(c => !has(`anim_${c}.glb`)));
  log(`${p.id}: start (${p.role}, ${p.root})`);
  if (!renderOnly && !has('model.glb')) {
    // a picture makes the model (image-to-3d); a picture not made yet skips the person
    const picture = p.image ? path.resolve(root, p.image) : null;
    if (picture && !fs.existsSync(picture)) { log(`${p.id}: no picture yet (make-pictures.mjs)`); continue; }
    const r = run('make-person-3d.mjs', [p.id, p.look, '--root', p.root, '--model-only', ...(picture ? ['--image', picture] : [])]);
    if (!r.ok || !has('model.glb')) {
      // RUN's daily 3D cap (AI_POLICY_BUDGET_EXHAUSTED "Daily user credit cap reached for threeDGen", shown without --json as "Too Many
      // Requests": 13 models on 2026-10-23): the rest would fail too, so the batch stops (exit 3; make-cast-loop.sh waits for the next day)
      if (capped(r.all)) { log(`${p.id}: RUN rate limit, batch stopped`); process.exit(3); }
      log(`${p.id}: model FAILED: ${r.out}`); continue;
    }
    log(`${p.id}: model ok`);
  }
  if (!renderOnly && !has('anim_walk.glb')) cutPlate(p, dir);
  if (rig) {
    // the extra clips the base lacks, made by RUN once per base before the rig moves them on
    for (const clip of extra) {
      const b = baseClip(p.from, clip);
      if (b.capped) { log(`${p.id}: RUN rate limit, batch stopped`); process.exit(3); }
      if (!b.ok) { log(`${p.from}: clip ${clip} FAILED: ${b.out}`); continue person; }
    }
    const r = run('rig-local-person.mjs', [p.id, '--from', p.from, '--root', p.root, '--clips', [...new Set(['walk', 'idle', ...extra])].join(',')]);
    if (!r.ok) { log(`${p.id}: rig FAILED: ${r.out}`); continue; }
    log(`${p.id}: rig ok (from ${p.from})`);
  }
  if (template) {
    const r = run('render-person-3d.mjs', [p.id, '--root', p.root, '--height', String(p.height), '--hand-twist', render.handTwist, '--arms-in', String(render.armsIn)]);
    if (!r.ok) { log(`${p.id}: render FAILED: ${r.out}`); continue; }
    log(`${p.id}: done: ${r.out}`);
  }
  // one sheet per extra clip, with its own args from cast.clipRender (default: 4 frames a facing)
  for (const clip of sheets) {
    const r = run('render-person-3d.mjs', [p.id, '--root', p.root, '--height', String(p.height), '--clip', clip, ...(cast.clipRender?.[clip] ?? ['--frames', '4'])]);
    log(r.ok ? `${p.id}: ${clip} sheet done: ${r.out}` : `${p.id}: ${clip} render FAILED: ${r.out}`);
  }
  made++;
}
log(`batch over: ${made} made`);
