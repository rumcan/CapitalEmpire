// The A-pose pictures of the cast (art/people-cast.json, every person with an "image" that is not there yet), with RUN's image generator:
// the picture-first way to a 3D model (make-person-3d.mjs --image): a clean full body on a plain background, nothing under the feet, in the
// painted style of base_man's picture (art/people3d/base_man/style.png). About 120 credits a picture; not capped like the 3D models.
// The prompt is the one the head-to-head test used for its pro golfer (output/opt-test/pics/pro_ref.png, 2026-10-24).
//
//   node scripts/assets/people3d/make-pictures.mjs [--only id,id] [--force]
//     each picture is written with its .json (the generation id, prompt and seed); look at every one before its model is made
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('--only')?.split(','), force = process.argv.includes('--force');
const cast = JSON.parse(fs.readFileSync(path.join(root, 'art/people-cast.json'), 'utf8'));
const game = JSON.parse(fs.readFileSync(path.join(process.env.TOT_REPO || path.resolve(root, '../TrickOrTreat'), 'game.config.prod.json'), 'utf8')).gameId;
const rundot = process.platform === 'win32' ? path.join(process.env.LOCALAPPDATA, 'Programs/Rundot/rundot.exe') : 'rundot';
const style = path.join(root, 'art/people3d/base_man/style.png');
const negative = 'ground, grass, floor, floor shadow, base, stand, golf ball, golf club, golf bag, umbrella, props, text, letters, numbers, logo, emblem, badge, patch, white outline, sticker border, cut-out edge';

for (const p of cast.people) {
  if (!p.image || (only && !only.includes(p.id))) continue;
  const out = path.join(root, p.image);
  if (!force && fs.existsSync(out)) continue;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const look = p.look.replace(/\.?\s*No logos.*$/i, '');
  const prompt = `Full-body character for a 3D model: ${look[0].toLowerCase()}${look.slice(1)}. Plain clothes with no logos, lettering or emblems. ` +
    'Standing in a neutral A-pose, both arms 45 degrees away from the body, hands open and empty, feet slightly apart, facing the viewer straight ' +
    'on, the whole body visible from head to toe. Match the painted style of the reference character. Plain flat light grey background, nothing ' +
    'else in the picture.';
  console.log(`${p.id}: drawing`);
  let text = '';
  for (let attempt = 1; attempt <= 8; attempt++) {
    const r = spawnSync(rundot, ['generate', 'image', '--game-id', game, '--prompt', prompt, '--negative-prompt', negative, '--reference-image', style,
      '--model', 'gemini-3.1-flash-image-preview', '--aspect-ratio', '2:3', '--max-credits', '400', '--out', out], { cwd: root, encoding: 'utf8' });
    text = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    // a short rate limit after a few pictures in a row ("Rate limited; retry in 24 seconds"): wait as told, then again
    const wait = text.match(/Rate limited; retry in (\d+) seconds/i);
    if (fs.existsSync(out) || !wait) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, (+wait[1] + 3) * 1000);
  }
  console.log(fs.existsSync(out) ? `${p.id}: -> ${p.image}` : `${p.id}: FAILED: ${text.split('\n').slice(-3).join(' | ')}`);
}
