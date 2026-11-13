// `npm run build:jam` (after cinder:build): the Fairway Fortune jam build. vite build with VITE_JAM=1 into dist-jam/ (base stays './'), then
// scripts/jam/pack.mjs checks itch.io's limits and zips it. Pass --no-pack to stop after the vite build.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', '..');
const run = (args) => { const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', env: { ...process.env, VITE_JAM: '1' } }); if (r.status !== 0) process.exit(r.status ?? 1); };
run(['--max-old-space-size=8192', join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-jam', '--emptyOutDir']);
if (!process.argv.includes('--no-pack')) run([join(here, 'pack.mjs'), join(root, 'dist-jam')]);
