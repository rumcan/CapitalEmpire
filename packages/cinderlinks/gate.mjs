// npm run cinder:gate: the harness on the built page at the 0.75 picture scale (the scale the page starts at), on any platform.
//   node packages/cinderlinks/gate.mjs [harness arguments]     (RSCALE in the environment wins over 0.75)
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!args.some((a) => !a.startsWith('--'))) args.unshift(path.join(HERE, '..', '..', 'public', 'cinderlinks', 'game.js'));
const r = spawnSync(process.execPath, [path.join(HERE, 'harness.mjs'), ...args], { stdio: 'inherit', cwd: HERE, env: { ...process.env, RSCALE: process.env.RSCALE || '0.75' } });
process.exit(r.status ?? 1);
