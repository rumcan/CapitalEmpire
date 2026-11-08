// T375: which buildings have which views: every building subject of the catalogue audit (art/catalogue-completion-20261107/audit/catalogue-audit.csv, the
// other lead's) against what the game draws now: eight approved views (object-eight: the registry and the 24 historical sets), the old screen-axis set
// (axis-library.ts: four straight-on views), corners only, or one picture. Where a building stands on a lot (a house, a shop, a venue, industry), a
// screen-straight road draws its straight-on view when it has one and the nearest corner (45 degrees off) when it has not: those are the buildings the
// next art should give straight-on views. Writes a markdown table; prints the counts.
//   node scripts/dev/missing-views-report.mjs --out E:/ClaudeTemp/T375/missing-views.md
import fs from 'node:fs';
const args = process.argv.slice(2), out = args[args.indexOf('--out') + 1] || 'missing-views.md';
const csv = fs.readFileSync('art/catalogue-completion-20261107/audit/catalogue-audit.csv', 'utf8').replace(/^\uFEFF/, '');
function parse(s) { const rows = []; let i = 0, f = '', r = [], q = false; while (i < s.length) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n') { r.push(f.replace(/\r$/, '')); rows.push(r); r = []; f = ''; } else f += c; i++; } if (f || r.length) { r.push(f); rows.push(r); } return rows; }
const R = parse(csv), H = R[0], rows = R.slice(1).filter(r => r.length > 5).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]])));
const axisSrc = fs.readFileSync('src/game/axis-library.ts', 'utf8'), axis = new Set(Object.keys(eval('(' + axisSrc.match(/export const AXIS_SETS[^=]*=\s*(\{[\s\S]*?\});/)[1] + ')')));
const reg = JSON.parse(fs.readFileSync('scripts/assets/object-eight-registry.json', 'utf8')), existing = JSON.parse(fs.readFileSync('src/game/object-eight-existing.json', 'utf8'));
const eight = new Map(); for (const s of reg.sets) eight.set(s.subject, s); for (const s of existing.sets) if (s.runtimeEnabled !== false) eight.set(s.subject, s);
for (const s of reg.sets) for (const a of s.aliases ?? []) eight.set(a, s);
const lotKinds = new Set(['house', 'building', 'arcade', 'venue']), lotCats = /house|shops|industry|venue|landmark|civic|business|capital/i;
const rowsOut = [], count = { eight: 0, axis: 0, corners: 0, single: 0 };
for (const r of rows.filter(r => r.classification === 'building')) {
  const e = eight.get(r.id), a = axis.has(r.id), corners = +r.corner_count || 0;
  const status = e ? 'eight views' : a ? 'old straight-on set (4)' : corners >= 4 ? 'corners only' : 'one picture';
  count[e ? 'eight' : a ? 'axis' : corners >= 4 ? 'corners' : 'single']++;
  rowsOut.push({ id: r.id, name: r.name, cat: r.category, kind: r.kind, status, candidateEight: r.candidate_eight_views_present === 'True', golf: r.golf_priority === 'True' });
}
const lines = ['# Buildings and the views they have (T375)', '', `${rowsOut.length} building subjects of the catalogue audit: ${count.eight} with eight approved views, ${count.axis} with the old straight-on set, ${count.corners} with corners only, ${count.single} with one picture.`, '',
  'On a screen-straight road a building with corners only is drawn in the nearest corner, 45 degrees off its road. "Candidate" means the art branch or the other lead has candidate eight-view files (audit column candidate_eight_views_present): file presence, not reviewed art; the older straight-on candidates on D:\AI\repaint\out are night-lit and not imported.', '',
  '| Building | Category | Kind | Views in the game | Candidate 8-view files | Golf priority |', '| --- | --- | --- | --- | --- | --- |'];
for (const o of rowsOut.sort((x, y) => (x.status === y.status ? x.id.localeCompare(y.id) : x.status.localeCompare(y.status)))) lines.push(`| \`${o.id}\` ${o.name ? '(' + o.name + ')' : ''} | ${o.cat} | ${o.kind} | ${o.status} | ${o.candidateEight ? 'yes' : 'no'} | ${o.golf ? 'yes' : ''} |`);
fs.writeFileSync(out, lines.join('\n') + '\n'); console.log(JSON.stringify(count), 'written', out);
