// Freeze today's lots into presets (P20 / T063): writes src/game/lots/lot-presets.json, the only source of the lots from then on.
//   node scripts/assets/freeze-lot-presets.mjs           (npm run lots:freeze) the freeze, then the check
//   node scripts/assets/freeze-lot-presets.mjs --check   (npm run lots:check)  the check alone: counts per use, state and bucket; ids unknown to the game;
//                                                        the curated presets against the last commit's (they must be unchanged)
//   options of the freeze: --note "<dated note>" adds a note to the file's header (repeatable); --refreeze-curated lays the curated presets out
//   again too (by default every preset flagged curated: true is kept exactly as the file has it: the owner's work)
// Two parts: this node step lays out the owner's 14 curated house lots the way lot-variants.mjs does (layoutLot and lot-edits.json, from the
// TrickOrTreat builder library, read only) into output/lot-presets/curated.json; freeze-lot-presets.ts (bundled with esbuild like the tests)
// runs the game's own composer for every use, state and size bucket, converts both into presets in the lot frame and writes the file.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { ROOT } from './source.mjs';

const OUT = path.join(ROOT, 'output/lot-presets');
fs.mkdirSync(OUT, { recursive: true });
const check = process.argv.includes('--check');
const curatedFile = path.join(OUT, 'curated.json');

if (!check) {
  // the curated lots: their placements after the owner's edits (metres, the TrickOrTreat builder's ids), with what the conversion needs of
  // each: flat or upright, its decal scenario, its builder category and footprint, the owner's scale the builder drew it at
  const { lotVariants } = await import('./lot-variants.mjs');
  const { LIB } = await import('./lot-render.mjs');
  const { SCENARIOS, ownerScale } = await import('./lot-layout.mjs');
  const { REMOVED } = await import('./removed.mjs');
  const scenarioOf = new Map(Object.entries(SCENARIOS).flatMap(([sc, ids]) => ids.map(id => [id, sc])));
  const out = [];
  for (const v of lotVariants()) {
    // a lot the owner removed in the studio (its baked picture is in removed.json) is not converted
    if (REMOVED.has(v.id)) { console.log(`curated: ${v.id} skipped (removed by the owner)`); continue; }
    // the house: kept, or rejected by the owner with no other house of its pool left to stand in (lot-variants.mjs), then the conversion gives
    // the lot a four-view house in its place
    const h = v.house, houseKept = v.items.some(q => q.id === h.id && Math.abs(q.x - h.x) < 3 && Math.abs(q.y - h.y) < 3);
    out.push({ id: v.id, W: v.W, D: v.D, rear: v.rear, story: v.story, house: { id: h.id, x: h.x, y: h.y, scale: h.scale, kept: houseKept }, items: v.items.map(p => {
      const it = LIB.get(p.id);
      return { ...p, flat: !!it?.flat, scenario: scenarioOf.get(p.id) ?? null, cat: it?.category ?? null, fw: it?.fw ?? null, fh: it?.fh ?? null, own: ownerScale(p.id) };
    }) });
  }
  fs.writeFileSync(curatedFile, JSON.stringify(out));
  console.log(`curated: ${out.length} lots laid out`);
}

const bundle = path.join(OUT, 'freeze.mjs');
await build({ entryPoints: [path.join(ROOT, 'scripts/assets/freeze-lot-presets.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
  loader: { '.webp': 'empty', '.png': 'empty' }, logLevel: 'warning' });
const r = spawnSync(process.execPath, [bundle, check ? '--check' : '--freeze', curatedFile, path.join(ROOT, 'src/game/lots/lot-presets.json'), ...process.argv.slice(2).filter(a => a !== '--check')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
