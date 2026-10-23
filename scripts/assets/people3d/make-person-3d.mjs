// One base townsperson as an animated 3D model, with the RUN CLI the way TrickOrTreat makes its kids (scripts/art/make-hero-3d.mjs there):
//   (an A-pose picture, or a text description) -> 3D model -> humanoid rig -> walk and idle clips  =>  art/people3d/<id>/
// then `node scripts/assets/people3d/render-person-3d.mjs <id>` renders the walk template (8 facings, idle + 8 walk frames).
// Every step spends RUN credits (about 1,800 a person), so each one's result is kept and a rerun skips what is already there.
// The RUN game is TrickOrTreat's (its game.config.prod.json; TOT_REPO or ../TrickOrTreat), read only.
//
//   node scripts/assets/people3d/make-person-3d.mjs <id> "<look>" [--image <A-pose png>] [--max-credits <n>] [--root <art dir>] [--clips <list>]
//     without --image the model is made from the text (text-to-3d)
//     --root: where the person goes (default art/people3d; the spectators: art/spectators, docs/SPECTATOR-ART.md)
//     --clips: the clips to make (default walk,idle), each saved as anim_<clip>.glb; `clap=<RUN name>` asks RUN for its own animation name
//       (see `rundot game animate-3d --help`). Each clip is one paid animate-3d call; a clip already there is skipped
//
// One person at a time: the service allows only a few jobs at once and answers the rest with "Too Many Requests".
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tot = process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat');
const [id, look] = process.argv.slice(2), arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
if (!id || !look || !/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Usage: node scripts/assets/people3d/make-person-3d.mjs <id> "<look>" [--image <png>] [--max-credits <n>]');
const game = JSON.parse(await fs.readFile(path.join(tot, 'game.config.prod.json'), 'utf8')).gameId;
const dir = path.join(root, arg('--root') ?? 'art/people3d', id), image = arg('--image'), cap = arg('--max-credits') ?? '1500';
await fs.mkdir(dir, { recursive: true });
const have = f => fs.access(path.join(dir, f)).then(() => true, () => false);
const rundot = async (...args) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const { stdout, stderr } = await run('rundot', args, { cwd: root, maxBuffer: 1 << 26 });
      return (stdout + stderr).replace(/\r/g, '\n');
    } catch (error) {
      const text = `${error.stdout ?? ''}${error.stderr ?? ''}`;
      // wait and try again rather than lose the paid steps before this one
      if (!/rate limit|too many requests/i.test(text) || attempt >= 8) throw new Error(`rundot ${args[0]} ${args[1]} failed:\n${text.slice(-800)}`);
      await new Promise(resolve => setTimeout(resolve, 45000 + attempt * 15000));
    }
  }
};
const note = async (k, v) => { const f = path.join(dir, 'receipt.json'), r = JSON.parse(await fs.readFile(f, 'utf8').catch(() => '{}')); r[k] = v; r.look = look; await fs.writeFile(f, JSON.stringify(r, null, 2) + '\n'); return r; };
const receipt = JSON.parse(await fs.readFile(path.join(dir, 'receipt.json'), 'utf8').catch(() => '{}'));

// 1. the model: from the A-pose picture, or from the text alone
let model = receipt.modelUrl;
if (!model || !(await have('model.glb'))) {
  const pose = `${look}. Full body, standing upright in a neutral A-pose, both arms 45 degrees away from the body, hands open and empty, feet slightly apart, facing forward. Realistic proportions for the person's age, stylised hand-painted game look. No props, nothing in the hands, no logos.`;
  const out = await rundot('game', 'generate-3d', '--game-id', game, ...(image ? ['--image-url', image] : ['--mode', 'text-to-3d', '--prompt', pose]), '--quality', 'standard', '--max-credits', cap, '--out', path.join(dir, 'model.glb'), '--force');
  model = out.replace(/\n/g, '').match(/Model URL:\s*(https:\/\/\S+?\.glb)/)?.[1];
  if (!model) throw new Error(`${id}: 3D generation returned no model URL\n${out.slice(-600)}`);
  await note('modelUrl', model);
  console.log(`${id}: model ready`);
} else console.log(`${id}: reusing the model`);

// 2. the humanoid rig
let rig = receipt.rigId;
if (!rig || !(await have('rigged.glb'))) {
  const out = await rundot('game', 'rig-3d', '--game-id', game, '--model-url', model, '--out', path.join(dir, 'rigged.glb'), '--force');
  rig = out.match(/Rig ID:\s*([0-9a-f-]{36})/)?.[1];
  if (!rig) throw new Error(`${id}: rigging failed\n${out.slice(-600)}`);
  await note('rigId', rig);
  console.log(`${id}: rig ${rig}`);
} else console.log(`${id}: reusing the rig`);

// 3. the clips: walk (the template's 8 frames are sampled from it), idle and any --clips; each saved as anim_<clip>.glb (the file RUN wrote is
// renamed when its name differs); the service fails now and then, a retry is enough
const clips = (arg('--clips') ?? 'walk,idle').split(',').map(c => c.trim()).filter(Boolean).map(c => { const [name, as] = c.split('='); return { name, as: as ?? name }; });
for (const { name: clip, as } of clips) {
  const want = `anim_${clip}.glb`;
  if (await have(want)) { console.log(`${id}: reusing the ${clip} clip (${want})`); continue; }
  const before = new Set((await fs.readdir(dir)).filter(f => f.endsWith('.glb')));
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { await rundot('game', 'animate-3d', '--game-id', game, '--rig-id', rig, '--animations', as, '--out-dir', dir, '--force'); break; }
    catch (error) { if (/AI_POLICY_BUDGET_EXHAUSTED/.test(error.message) || attempt === 3) { console.log(`${id}: ${clip} clip unavailable (${error.message.split('\n').pop()})`); break; } }
  }
  if (!(await have(want))) {
    const made = (await fs.readdir(dir)).filter(f => f.endsWith('.glb') && !before.has(f));
    if (made.length) { await fs.rename(path.join(dir, made[0]), path.join(dir, want)); console.log(`${id}: ${clip} clip -> ${want} (from ${made[0]})`); }
  }
}
console.log(`${id}: done -> ${path.relative(root, dir)}: ${(await fs.readdir(dir)).join(', ')}`);
