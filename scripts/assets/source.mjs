// Where the art comes from: a local TrickOrTreat checkout (TOT_REPO, default ../TrickOrTreat), else GitHub.
// Ground art lives on the branch town/builder-in-repo; the sprite export lives in public/assets/town-built on main.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const TOT = path.resolve(process.env.TOT_REPO || path.join(ROOT, '../TrickOrTreat'));
const RAW = 'https://raw.githubusercontent.com/rumcan/TrickOrTreat';
const hasRepo = fs.existsSync(path.join(TOT, '.git'));

/** a file from a branch of the TrickOrTreat repo (git show, so no worktree is touched) */
export async function fromBranch(branch, rel) {
  if (hasRepo) {
    try { return execFileSync('git', ['-C', TOT, 'show', `${branch}:${rel}`], { maxBuffer: 256 << 20 }); } catch { /* fall through to GitHub */ }
  }
  const res = await fetch(`${RAW}/${branch}/${rel}`);
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** a file from the public game export (working tree first, it is committed on main) */
export async function fromExport(rel) {
  const local = path.join(TOT, 'public/assets/town-built', rel);
  if (fs.existsSync(local)) return fs.readFileSync(local);
  return fromBranch('main', 'public/assets/town-built/' + rel);
}
