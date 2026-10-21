// Generates the Paint tool's photo textures with the RUN.world CLI (rundot, signed in; the TrickOrTreat game's id), using the
// owner's three photos in art/grass-photo/ as references. Writes output/grass-gen/<id>-<n>.png and removes every generation
// from RUN's creator library once it is on disk (the library is capped at 1 GB; see TrickOrTreat's AGENTS.md).
//   node scripts/assets/gen-grass-photos.mjs [--only id,id] [--n 2] [--size 4K] [--model gemini-3.1-flash-image-preview]
// Pick the best take per id, make it seamless (scripts/assets/seamless.mjs) and copy it to art/grass-photo/<id>.png.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'output/grass-gen');
const RUNDOT = process.env.RUNDOT_CLI || path.join(process.env.LOCALAPPDATA || 'C:/Users/Francois Smit/AppData/Local', 'Programs/Rundot/rundot.exe');
const GAME_ID = 'AFjPSjQH9kbcCl57sgO3';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', '1'), SIZE = arg('--size', ''), MODEL = arg('--model', 'gemini-3.1-flash-image-preview');
const ONLY = arg('--only', '')?.split(',').filter(Boolean);

const LOOK = 'Seamless tileable ground texture. A real photograph taken looking straight down from directly above (orthographic top-down, no perspective, ' +
  'no horizon, no sky), soft even overcast daylight, no cast shadows, no vignette, the same density everywhere edge to edge, no objects, ' +
  'no text, no border. Match the photographic realism, sharpness, ground scale and natural colour grading of the reference photos: they are ' +
  'grass textures from the same set, and this one must sit next to them. Subject: ';
const NEG = 'perspective, horizon, sky, blur, text, watermark, border, vignette, cartoon, illustration, oversaturated';
const SUBJECTS = {
  'concrete': 'a plain poured concrete slab, light warm grey, broom-finished surface, faint weathering stains, no joints, no cracks. The image covers about 4 x 4 metres.',
  'asphalt': 'smooth grey asphalt paving in good condition, fine stone aggregate, plain and even. The image covers about 3 x 3 metres.',
  'asphalt-dark': 'new blacktop paving, very dark charcoal, fine even aggregate, plain. The image covers about 3 x 3 metres.',
  'asphalt-worn': 'old weathered asphalt, faded light grey, exposed aggregate, fine hairline cracks and a few darker patched repairs, no markings. The image covers about 4 x 4 metres.',
  'road-gravel': 'a compacted gravel road surface: crushed grey-brown stone packed into dusty earth, small loose stones on top. The image covers about 4 x 4 metres.',
  'gravel': 'a garden path of small loose grey pebbles, evenly spread. The image covers about 2 x 2 metres.',
  'dirt': 'bare brown soil: dry compacted earth with small clods, a few pebbles and twigs, no grass. The image covers about 4 x 4 metres.',
  'field': 'a ploughed farm field: straight parallel furrows of dark brown soil running horizontally across the whole image, evenly spaced. The image covers about 8 x 8 metres.',
  'grass': 'ordinary natural grassland ground, medium-length grass, mixed greens with a few yellowing blades, not mowed in stripes. The image covers about 6 x 6 metres.',
  'lawn-lush': 'a lush, healthy backyard lawn, freshly mowed, dense perennial ryegrass, deep even green, no mowing stripes. The image covers about 6 x 6 metres.',
  'lawn-worn': 'a worn, patchy backyard lawn: short grass thinned out with bare dry soil patches, flattened areas, a few brown dry spots and small weeds. The image covers about 6 x 6 metres.',
  'lawn-clover': 'a mown backyard lawn mixed with white clover leaves and small white clover flowers and the odd daisy. The image covers about 6 x 6 metres.',
  'golf-green': 'a golf putting green: extremely short, dense, smooth bentgrass with a very fine uniform texture and only a faint mowing grain, vivid healthy green. The image covers about 4 x 4 metres.',
  'meadow-lush': 'an uncut lush meadow: long grasses and leafy wild plants, varied natural greens, dense, a little untidy. The image covers about 6 x 6 metres.',
  'meadow-flowers': 'a wildflower meadow: long green grasses with scattered clusters of small wildflowers in yellow, white and purple, natural and not oversaturated. The image covers about 6 x 6 metres.',
  // the golf course surfaces (the Paint tool will build the course: docs/GOLF-PLAN.md)
  'golf-fringe': 'the fringe (collar) around a golf putting green: very short dense bentgrass, a little longer and coarser than the green, even healthy green. The image covers about 4 x 4 metres.',
  'golf-tee': 'a golf tee box: short dense mown grass with a scattering of small divot scars and sand-filled divot marks, healthy green. The image covers about 4 x 4 metres.',
  'golf-first-cut': 'the first cut of rough beside a golf fairway: evenly mown medium-length grass, a little darker and thicker than a fairway, no stripes. The image covers about 6 x 6 metres.',
  'golf-fescue': 'deep native fescue rough on a links golf course: long wispy golden and green fescue grass, untidy and windblown. The image covers about 6 x 6 metres.',
  'bunker-sand': 'a freshly raked golf bunker: fine pale tan sand with soft parallel rake lines. The image covers about 4 x 4 metres.',
  'waste-sand': 'a sandy waste area on a golf course: coarse tan sand with scattered small pebbles and a few tufts of dry grass. The image covers about 6 x 6 metres.',
  'pine-straw': 'pine straw ground cover under pine trees: a carpet of fallen brown pine needles with a few pine cones. The image covers about 4 x 4 metres.',
  'bark-mulch': 'dark brown shredded bark mulch in a planting bed. The image covers about 3 x 3 metres.',
  'spectator-path': 'a worn grass walkway where crowds have walked at an outdoor event: flattened, thinned grass with bare dry earth patches. The image covers about 6 x 6 metres.',
  'wood-chips': 'a wood chip walking path: light brown wood chips, evenly spread. The image covers about 3 x 3 metres.',
};
const REFS = ['fairway', 'fairway-sod', 'rough'].map(f => path.join(OUT, 'refs', f + '.jpg'));

/** rundot, waiting out RUN's rate limit ("Rate limited; retry in N seconds") up to 8 times */
async function run(args) {
  for (let i = 0; ; i++) {
    try { return await run1(args); } catch (e) {
      const m = /retry in (\d+) seconds/i.exec(e.message);
      if (!m || i >= 8) throw e;
      console.log(`  rate limited, waiting ${+m[1] + 2} s`); await new Promise(r => setTimeout(r, (+m[1] + 2) * 1000));
    }
  }
}
function run1(args) {
  return new Promise((res, rej) => {
    const c = spawn(RUNDOT, args, { cwd: ROOT, windowsHide: true });
    let out = '', err = '';
    c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { err += d; });
    c.on('close', code => code === 0 ? res(out) : rej(new Error(`rundot ${args[0]} ${args[1]} exited ${code}: ${(err || out).slice(-600)}`)));
  });
}

fs.mkdirSync(OUT, { recursive: true });
for (const r of REFS) if (!fs.existsSync(r)) throw new Error('missing reference ' + r + ' (JPEGs of art/grass-photo/*.png)');
for (const [id, subject] of Object.entries(SUBJECTS)) {
  if (ONLY?.length && !ONLY.includes(id)) continue;
  for (let n = 1; n <= N; n++) {
    let k = n; while (fs.existsSync(path.join(OUT, `${id}-${k}.png`))) k++;
    const target = path.join(OUT, `${id}-${k}.png`);
    let out;
    try {
      out = await run(['generate', 'image', '--game-id', GAME_ID, '--model', MODEL, '--prompt', LOOK + subject, '--negative-prompt', NEG,
        '--aspect-ratio', '1:1', ...(SIZE ? ['--image-size', SIZE] : []), '--json', '--out', target, ...REFS.flatMap(r => ['--reference-image', r])]);
    } catch (e) { console.log(id, 'FAILED:', e.message.split('\n').filter(l => /Exception|error/i.test(l)).join(' ') || e.message.slice(-200)); continue; }
    const j = JSON.parse(out.slice(out.indexOf('{')));
    const gid = j.generationId ?? j.data?.generationId ?? j.id;
    console.log(id, '->', path.relative(ROOT, target), 'credits', j.creditsUsed ?? j.credits ?? '?', 'generation', gid);
    if (gid) await run(['assets', 'rm', gid, '--service', 'imagegen', '--game-id', GAME_ID]).then(() => console.log('  removed from RUN'), e => console.log('  NOT removed from RUN:', e.message));
  }
}
