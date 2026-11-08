// T385 (#1042): the lead's reading of the studio's Lot review (scripts/assets/lot-review.json: src/game/lots/review-file.ts): the counts, then every bad lot with the owner's
// note, the checks he unticked, what the machine read on it and what he placed on it, grouped by the failing check so a rule is fixed once for all the lots that need it.
//   npm run lots:review [-- --file scripts/assets/lot-review.json] [--all] [--json]
// --all lists the lots that are ok or only touched too; --json prints the bad lots as JSON. Reads the file only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const file = path.resolve(root, opt('file', 'scripts/assets/lot-review.json'));
const CHECKS = ['house', 'drive', 'trees', 'fence'], WORDS = { house: 'House', drive: 'Driveway or parking', trees: 'Trees', fence: 'Fence' };
let data = { lots: {} };
try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`no review file at ${path.relative(root, file)} (${e.code ?? e.message}): nothing has been reviewed yet`); process.exit(0); }
const lots = Object.entries(data.lots ?? {}).map(([id, r]) => ({ id, ...r }));
const isBad = r => r.bad === true || CHECKS.some(c => r.checks?.[c] === false);
const standing = r => (isBad(r) ? 'bad' : CHECKS.every(c => r.checks?.[c] === true) ? 'ok' : 'touched');
const bad = lots.filter(isBad), ok = lots.filter(r => standing(r) === 'ok'), touched = lots.filter(r => standing(r) === 'touched');
console.log(`${path.relative(root, file)}: ${lots.length} lots reviewed: ${ok.length} ok, ${bad.length} bad, ${touched.length} touched`);
const by = Object.fromEntries(CHECKS.map(c => [c, bad.filter(r => r.checks?.[c] === false)]));
console.log(CHECKS.map(c => `${WORDS[c]}: ${by[c].length} bad`).join(' | ') + ` | marked bad with every check ticked: ${bad.filter(r => r.bad && !CHECKS.some(c => r.checks?.[c] === false)).length}`);
const describe = r => {
  const a = r.audit ?? {}, parts = [`${r.id}  ${r.w}x${r.d} road ${r.road} ${r.level === 3 ? 'upgraded' : 'built'}${r.decline ? ` decline ${r.decline}` : ''}${r.tier !== undefined ? ` tier ${r.tier}` : ''} ${r.theme}`];
  if (r.note) parts.push(`   note: ${r.note}`);
  if (r.audit) parts.push(`   machine: house ${a.house ? `${a.buildings}, off ${a.facingOff}` : 'NONE'}; drive ${a.drive ? (a.driveConnects ? 'meets road' : 'does not meet road') : 'none'}, path ${a.path ? 'yes' : 'none'}; trees ${a.trees}${a.treesClear ? '' : ' (not clear)'}; fence ${a.fence} ${a.fencePieces}${a.fenceAcross ? ` (${a.fenceAcross} across)` : ''}${a.clutter?.length ? `; CLUTTER ${[...new Set(a.clutter)].join(', ')}` : ''}`);
  if (r.override) parts.push(`   placed: ${r.override.props.map(p => `${p.id}@${p.a},${p.b}`).concat(r.override.decals.map(d => `${d.id}@${d.a},${d.b}`)).join('; ')}`);
  parts.push(`   reproduce: ?lotreview&source=${r.kind}&seed=${r.seed}&desert=${r.theme === 'desert' ? 'on' : 'off'}  (lot key ${r.key})`);
  return parts.join('\n');
};
if (args.includes('--json')) { console.log(JSON.stringify(bad, null, 1)); process.exit(0); }
for (const c of CHECKS) { if (!by[c].length) continue; console.log(`\n== ${WORDS[c]} unticked (${by[c].length}) ==`); for (const r of by[c]) console.log(describe(r)); }
const rest = bad.filter(r => !CHECKS.some(c => r.checks?.[c] === false));
if (rest.length) { console.log(`\n== marked bad, every check ticked (${rest.length}) ==`); for (const r of rest) console.log(describe(r)); }
if (args.includes('--all')) { console.log(`\n== ok (${ok.length}) and touched (${touched.length}) ==`); for (const r of [...ok, ...touched]) console.log(describe(r)); }
