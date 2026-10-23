// Makes every person of art/people-cast.json who has no sheet yet, one at a time (RUN allows only a few jobs at once):
//   1. the model from RUN (make-person-3d.mjs --model-only; it waits out the CLI's 600 s timeout and finds the model in RUN's library)
//   2. the rig and the walk and idle, locally from the person's base (rig-local-person.mjs; free)
//   3. the sheet (render-person-3d.mjs with the cast's render settings: the hands and arms the owner chose)
// A person that fails is logged and skipped; rerun to try again (finished steps are kept). Progress: output/people-cast.log.
//
//   node scripts/assets/people3d/make-cast.mjs [--only id,id] [--render-only] [--limit n]
//     --render-only: re-render every person who has a rig (after a change of the render settings); no credits
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const cast = JSON.parse(fs.readFileSync(path.join(root, 'art/people-cast.json'), 'utf8'));
const only = arg('--only')?.split(','), limit = +(arg('--limit') ?? Infinity), renderOnly = process.argv.includes('--render-only');
const LOG = path.join(root, 'output/people-cast.log'); fs.mkdirSync(path.dirname(LOG), { recursive: true });
const log = t => { const line = `${new Date().toISOString()} ${t}`; console.log(line); fs.appendFileSync(LOG, line + '\n'); };

// every look must start differently (the library lists about the first 38 characters of a prompt)
const starts = new Map();
for (const p of cast.people) { const k = p.look.slice(0, 38); if (starts.has(k)) throw new Error(`${p.id} and ${starts.get(k)} start alike: "${k}"`); starts.set(k, p.id); }

const run = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/assets/people3d', script), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { ok: r.status === 0, out: out.split('\n').slice(-6).join(' | '), all: out };
};
let made = 0;
for (const p of cast.people) {
  if (only && !only.includes(p.id)) continue;
  if (made >= limit) break;
  const dir = path.join(root, p.root, p.id), has = f => fs.existsSync(path.join(dir, f));
  if (!renderOnly && has('sheet.json')) continue;
  if (renderOnly && !has('anim_walk.glb')) continue;
  log(`${p.id}: start (${p.role}, ${p.root})`);
  if (!renderOnly && !has('model.glb')) {
    const r = run('make-person-3d.mjs', [p.id, p.look, '--root', p.root, '--model-only']);
    if (!r.ok || !has('model.glb')) {
      // RUN's rate limit (a cap: about 13 models on 2026-10-23): the rest would fail too, so the batch stops (exit 3; make-cast-loop.sh waits and retries)
      if (/rate limit|too many requests/i.test(r.all)) { log(`${p.id}: RUN rate limit, batch stopped`); process.exit(3); }
      log(`${p.id}: model FAILED: ${r.out}`); continue;
    }
    log(`${p.id}: model ok`);
  }
  if (!renderOnly && !has('anim_walk.glb')) {
    const r = run('rig-local-person.mjs', [p.id, '--from', p.from, '--root', p.root]);
    if (!r.ok) { log(`${p.id}: rig FAILED: ${r.out}`); continue; }
    log(`${p.id}: rig ok (from ${p.from})`);
  }
  const r = run('render-person-3d.mjs', [p.id, '--root', p.root, '--height', String(p.height), '--hand-twist', cast.render.handTwist, '--arms-in', String(cast.render.armsIn)]);
  if (!r.ok) { log(`${p.id}: render FAILED: ${r.out}`); continue; }
  log(`${p.id}: done: ${r.out}`); made++;
}
log(`batch over: ${made} made`);
