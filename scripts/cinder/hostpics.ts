// T454: the species pictures for the Cinderlinks harness's treesms scene (HOSTPICS=<file>): six of the game's woods species (two conifers, four
// broadleaf), each with its atlas picture (features3p.ts TreePic) whose url is the page's file on disk, so the harness can decode the pages (sharp)
// and time the view's trees drawn as the game's pictures, as a host page hands them over.
//   npx esbuild scripts/cinder/hostpics.ts --bundle --platform=node --format=esm --loader:.webp=file --loader:.png=file --outdir=output/hostpics
//   node output/hostpics/hostpics.js > output/hostpics/hostpics.json
//   HOSTTREES=1 HOSTPICS=output/hostpics/hostpics.json node packages/cinderlinks/harness.mjs public/cinderlinks/game.js --shot output/x --scenes treesms
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, ATLAS_PAGES } from '../../src/game/library';

const SP = ['capital:tree-pine-open', 'gen:tree-fir-tall:ne', 'capital:tree-oak-open', 'capital:tree-maple-moderate', 'gen:tree-maple-scarlet:se', 'gen:tree-aspen-young:sw'];
const here = path.dirname(fileURLToPath(import.meta.url)), pics: Record<string, unknown> = {};
for (const id of SP) {
  const L = LIBRARY.find(i => i.id === id); if (!L) throw new Error('no library tree ' + id);
  pics[id] = { url: path.resolve(here, ATLAS_PAGES[L.tex[0]]![0]!), uv: L.tex.slice(1), w: L.w, h: L.h, ax: L.ax, ay: L.ay, quad: L.quad };
}
console.log(JSON.stringify({ sp: SP, pics }));
