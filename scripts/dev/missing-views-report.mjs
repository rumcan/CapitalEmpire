// T375: which buildings have which views, and what the art queue starts from. Every building subject of the catalogue audit
// (art/catalogue-completion-20261107/audit/catalogue-audit.csv, the other lead's) against what the game draws now: eight approved views (object-eight: the registry and
// the 24 historical sets), the old screen-axis set (axis-library.ts: four straight-on views of the T154 look), corners only, or one picture. Where a building stands on
// a lot (a house, a shop, a venue, industry), a screen-straight road draws its straight-on view when it has one and the nearest corner (45 degrees off) when it has not:
// those are the buildings the next art should give straight-on views.
// Per building: the views missing of the eight (NE SE SW NW corners, N E S W the 8-degree straight-on views), the candidate images that already exist for them (the
// repaint pass's files, D:/AI/repaint/out/<id>: night-lit, not reviewed, not imported), the native export the studio holds (a good source: the audit's original_source
// path, a *.native.png of the building's first view) and whether Idol made a 3D splat of it (D:/AI/idol-batch/out/{building-views,marked,missing}/<id>/*.ply: one picture
// to a Gaussian splat, its unseen sides guessed; the owner rejected the batch's 'missing' crops, 2026-11-01, so a splat is a source to review, not game art).
// Writes a markdown table; prints the counts.
//   node scripts/dev/missing-views-report.mjs --out E:/ClaudeTemp/T375/missing-views.md
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), out = args[args.indexOf('--out') + 1] || 'missing-views.md';
const csv = fs.readFileSync('art/catalogue-completion-20261107/audit/catalogue-audit.csv', 'utf8').replace(/^\uFEFF/, '');
function parse(s) { const rows = []; let i = 0, f = '', r = [], q = false; while (i < s.length) { const c = s[i]; if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { r.push(f); f = ''; } else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; } else if (c !== '\r') f += c; i++; } if (f || r.length) { r.push(f); rows.push(r); } return rows; }
const R = parse(csv), H = R[0], rows = R.slice(1).filter(r => r.length > 5).map(r => Object.fromEntries(H.map((h, i) => [h, r[i]])));
const axisSrc = fs.readFileSync('src/game/axis-library.ts', 'utf8'), axis = new Set(Object.keys(eval('(' + axisSrc.match(/export const AXIS_SETS[^=]*=\s*(\{[\s\S]*?\});/)[1] + ')')));
const reg = JSON.parse(fs.readFileSync('scripts/assets/object-eight-registry.json', 'utf8')), existing = JSON.parse(fs.readFileSync('src/game/object-eight-existing.json', 'utf8'));
const eight = new Map(); for (const s of reg.sets) eight.set(s.subject, s); for (const s of existing.sets) if (s.runtimeEnabled !== false) eight.set(s.subject, s);
for (const s of reg.sets) for (const a of s.aliases ?? []) eight.set(a, s);
const VIEWS = ['NE', 'SE', 'SW', 'NW', 'N', 'E', 'S', 'W'];
// Idol's splats by building: the folders of its three useful sets (marked and missing: the id with ~ for :, building-views: with -)
const IDOL = 'D:/AI/idol-batch/out', idolAt = new Map();
for (const set of ['building-views', 'marked', 'missing']) {
  let dirs = []; try { dirs = fs.readdirSync(path.join(IDOL, set)); } catch { /* no D: drive */ }
  for (const d of dirs) { try { if (fs.readdirSync(path.join(IDOL, set, d)).some(f => f.endsWith('.ply'))) idolAt.set(d.replace(/[~-]/g, '_').toLowerCase(), set); } catch { /* not a folder */ } }
}
const idolOf = id => idolAt.get(id.replace(/[:~-]/g, '_').toLowerCase()) ?? null;
// (the audit's names carry a double-encoded dash or apostrophe in places)
const clean = t => (t || '').replace(/â€”/g, '-').replace(/â€“/g, '-').replace(/â€™/g, "'");
const exists = p => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const lotKinds = new Set(['house', 'building', 'arcade', 'venue']), lotCats = /house|shops|industry|venue|landmark|civic|business|capital/i;
const rowsOut = [], count = { eight: 0, axis: 0, corners: 0, single: 0 }, have = { native: 0, idol: 0, candidates: 0 };
for (const r of rows.filter(r => r.classification === 'building')) {
  const e = eight.get(r.id), a = axis.has(r.id), corners = +r.corner_count || 0;
  const status = e ? 'eight views' : a ? 'old straight-on set (4)' : corners >= 4 ? 'corners only' : 'one picture';
  count[e ? 'eight' : a ? 'axis' : corners >= 4 ? 'corners' : 'single']++;
  // the views missing of the eight, as the game has them (the old straight-on set is the T154 look, kept as the straight-on views until the 8-degree ones exist)
  const missing = e ? [] : a ? [] : corners >= 4 ? VIEWS.slice(4) : VIEWS;
  const cands = VIEWS.filter(v => exists(r[v + '_candidate_path']));
  const native = /\.native\.png$/i.test(r.original_source || '') && exists(r.original_source);
  const idol = idolOf(r.id);
  if (missing.length) { if (native) have.native++; if (idol) have.idol++; if (cands.length) have.candidates++; }
  rowsOut.push({ id: r.id, name: clean(r.name), cat: r.category, kind: r.kind, status, missing, cands, native, idol, golf: r.golf_priority === 'True', onLot: lotKinds.has(r.kind) || lotCats.test(r.category || '') });
}
const need = rowsOut.filter(o => o.missing.length);
const lines = ['# Buildings and the views they have, and what the art queue starts from (T375)', '',
  `${rowsOut.length} building subjects of the catalogue audit: ${count.eight} with eight approved views, ${count.axis} with the old straight-on set, ${count.corners} with corners only, ${count.single} with one picture. **${need.length} are missing views of the eight** (the first table, golf priority first, then the buildings that stand on lots): ${have.native} of them have a native export, ${have.idol} an Idol 3D splat, ${have.candidates} candidate images.`, '',
  'On a screen-straight road a building with corners only is drawn in the nearest corner, 45 degrees off its road; a building with the old straight-on set draws that set there (the T154 look, not the 8-degree views). Views: NE SE SW NW are the corners, N E S W the 8-degree straight-on views.', '',
  '- **Missing of the 8**: as the game has them now. A building with the old straight-on set has its N E S W (the legacy look) and is not listed as missing them.',
  '- **Candidates**: which of the eight already exist as candidate images from the repaint pass (`D:/AI/repaint/out/<id>`: night-lit, not reviewed, not imported): a start for review, not game art.',
  '- **Native export**: the studio\'s native-resolution picture of the building (`original_source`, a `*.native.png` of its first view): the good source the generation starts from. "no" is a building the game only has as an atlas sprite.',
  '- **Idol 3D**: a Gaussian splat (`.ply`) made by Idol from one picture (`D:/AI/idol-batch/out/<set>/<id>`): a model to render the missing sides from; its unseen sides are guesses (the owner rejected the batch\'s crops of 2026-11-01), so a source to review. No building has a mesh (`.glb`): the repository\'s models are the people.', '',
  '## Buildings missing views', '',
  '| Building | Category | Kind | Golf | In the game | Missing of the 8 | Candidates | Native export | Idol 3D |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
const cell = o => `| \`${o.id}\` ${o.name ? '(' + o.name + ')' : ''} | ${o.cat} | ${o.kind} | ${o.golf ? 'yes' : ''} | ${o.status} | ${o.missing.join(' ')} | ${o.cands.length ? (o.cands.length === 8 ? 'all 8' : o.cands.join(' ')) : 'none'} | ${o.native ? 'yes' : 'no'} | ${o.idol ?? 'no'} |`;
for (const o of need.sort((x, y) => (x.golf === y.golf ? (x.onLot === y.onLot ? x.id.localeCompare(y.id) : x.onLot ? -1 : 1) : x.golf ? -1 : 1))) lines.push(cell(o));
lines.push('', '## Buildings with all their views', '', '| Building | Category | Kind | In the game |', '| --- | --- | --- | --- |');
for (const o of rowsOut.filter(o => !o.missing.length).sort((x, y) => (x.status === y.status ? x.id.localeCompare(y.id) : x.status.localeCompare(y.status)))) lines.push(`| \`${o.id}\` ${o.name ? '(' + o.name + ')' : ''} | ${o.cat} | ${o.kind} | ${o.status} |`);
fs.writeFileSync(out, lines.join('\n') + '\n'); console.log(JSON.stringify(count), JSON.stringify(have), 'missing views:', need.length, 'written', out);
