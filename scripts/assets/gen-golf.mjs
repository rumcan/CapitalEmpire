// The golf sprites (GOLF-SPRITES.md) from the RUN CLI: one item per image (1024 px is all the plan's model makes), the house
// style from reference sprites, the background removed. Prompts and references in art/golf/items.json. Takes go to the
// git-ignored output/golf-gen/<id>-<take>.png; the chosen take is copied to art/golf/<id>.png (the master prep-golf packs).
// Each generation is removed from RUN's library once downloaded (its 1 GB cap).
//   node scripts/assets/gen-golf.mjs [--takes 2] [id ...]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ROOT } from './source.mjs';

const RUN = path.join(process.env.LOCALAPPDATA ?? '', 'Programs/Rundot/rundot.exe'), GAME = 'AFjPSjQH9kbcCl57sgO3';
const MODEL = 'gemini-3.1-flash-image-preview';
const args = process.argv.slice(2), ti = args.indexOf('--takes');
const takes = ti >= 0 ? Number(args.splice(ti, 2)[1]) : 2, only = new Set(args);
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'art/golf/items.json'), 'utf8'));
const OUT = path.join(ROOT, 'output/golf-gen'); fs.mkdirSync(OUT, { recursive: true });

// the references flattened on white (the model reads transparency as black)
const refs = [];
for (const r of spec.refs) {
  const f = path.join(OUT, 'ref-' + path.basename(r));
  if (!fs.existsSync(f)) await sharp(path.join(ROOT, r)).flatten({ background: '#ffffff' }).png().toFile(f);
  refs.push(f);
}

const sleep = s => new Promise(r => setTimeout(r, s * 1000));
for (const it of spec.items) {
  if (only.size && !only.has(it.id)) continue;
  for (let t = 1; t <= takes; t++) {
    const out = path.join(OUT, `${it.id}-${t}.png`);
    if (fs.existsSync(out)) continue;
    const prompt = `${spec.style}\n\nThe object: ${it.prompt} Real size ${it.size}.`;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res = '';
      try {
        res = execFileSync(RUN, ['generate', 'image', '--game-id', GAME, '--model', MODEL, '--aspect-ratio', it.aspect, '--remove-background',
          '--remove-background-model', 'bria', '--json', '--out', out, '--negative-prompt', spec.negative, ...refs.flatMap(f => ['--reference-image', f]),
          '--prompt', prompt], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) { res = String(e.stdout ?? '') + String(e.stderr ?? ''); }
      const gid = /"generationId":"([^"]+)"/.exec(res)?.[1];
      if (gid && fs.existsSync(out)) {
        console.log(`${it.id} take ${t}: ok`);
        try { execFileSync(RUN, ['assets', 'rm', gid, '--service', 'imagegen', '--game-id', GAME], { stdio: 'ignore' }); } catch { console.log(`  (could not remove ${gid} from RUN)`); }
        break;
      }
      const wait = Number(/retry in (\d+)/.exec(res)?.[1] ?? 20) + 3;
      console.log(`${it.id} take ${t} try ${attempt}: ${res.trim().split('\n').at(-1)?.slice(0, 160)}`);
      await sleep(wait);
    }
  }
}
console.log('done');
