// T340 (#967) stage 2: trims a stage-1 course JSON (scripts/dev/osm-course.mjs) to a game fixture: only what the converter (src/game/golf/osm/convert.ts)
// reads, only near the holes of the course to build, coordinates to 0.1 m, no names but the one the game shows. The fixture keeps the ODbL credit in its
// header. Players' browsers never call Overpass or Nominatim: the game ships these files.
//   node scripts/dev/osm-trim-fixture.mjs <stage-1.json> --id rondebosch --name "Rondebosch Golf Course" --place "Cape Town, South Africa" \
//        [--course "Augusta National" --rename "Augusta National=Magnolia National"] [--reach 120] [--simplify 0.3] [--out src/game/golf/osm/data/<id>.json]
// Plain Node 22, no installs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!file || !opt('id')) { console.error('usage: node scripts/dev/osm-trim-fixture.mjs <stage-1.json> --id <id> --name <name> [--place <text>] [--course <name>] [--rename a=b] [--reach 120] [--out file]'); process.exit(2); }
const j = JSON.parse(readFileSync(file, 'utf8')), id = opt('id'), reach = +opt('reach', '120'), out = opt('out', `src/game/golf/osm/data/${id}.json`);
const renames = new Map((opt('rename', '') ? [opt('rename', '')] : []).map(s => s.split('=')));
const r1 = v => Math.round(v * 10) / 10, pt = p => [r1(p[0]), r1(p[1])];
// Douglas-Peucker: a ring or line loses the points that deviate less than --simplify metres (default 0.3: far under a 1 m cell)
const tol = +opt('simplify', '0.3');
function dp(pts, closed) {
  if (pts.length <= (closed ? 4 : 2) || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length), segd = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  // a ring is cut at its two farthest-apart points first, so the closing edge is simplified like the rest
  let lo = 0, hi = pts.length - 1;
  if (closed) { let far = 0; for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = i; keep[0] = keep[far] = 1; run(0, far); run(far, pts.length - 1, true); }
  else { keep[lo] = keep[hi] = 1; run(lo, hi); }
  function run(a, b, wrap) {
    const stack = [[a, b]];
    while (stack.length) {
      const [i, k] = stack.pop(); let md = -1, mi = -1;
      const end = wrap && k === pts.length - 1 ? pts[0] : pts[k];
      for (let m = i + 1; m < k; m++) { const d = segd(pts[m], pts[i], end); if (d > md) { md = d; mi = m; } }
      if (md > tol) { keep[mi] = 1; stack.push([i, mi], [mi, k]); }
    }
  }
  return pts.filter((_, i) => keep[i]);
}
const cname = t => (t?.['golf:course:name'] ?? t?.['course:name'] ?? '').trim();
const F = j.features ?? {};

// the course to build: the named one, else the group with the most holes numbered 1..18
const holes = F.hole ?? [], groups = new Map();
for (const h of holes) { const k = cname(h.tags); (groups.get(k) ?? groups.set(k, []).get(k)).push(h); }
const full = g => new Set(g.filter(h => h.ref >= 1 && h.ref <= 18).map(h => h.ref)).size;
let chosen = opt('course');
if (chosen === undefined) chosen = [...groups.entries()].sort((a, b) => full(b[1]) * 1000 + b[1].length - (full(a[1]) * 1000 + a[1].length))[0]?.[0] ?? '';
const mine = groups.get(chosen) ?? [];
if (!mine.length) { console.error(`no hole lines for course "${chosen}" (have: ${[...groups.keys()].map(k => `"${k}"`).join(', ')})`); process.exit(1); }

// the box of the chosen course's holes, its reach round it
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const h of mine) for (const p of h.line) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
const box = [x0 - reach, y0 - reach, x1 + reach, y1 + reach];
const meets = pts => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of pts) { a = Math.min(a, p[0]); c = Math.max(c, p[0]); b = Math.min(b, p[1]); d = Math.max(d, p[1]); } return a <= box[2] && c >= box[0] && b <= box[3] && d >= box[1]; };
const inBox = p => p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3];
const polys = f => (f.polys ?? []).filter(p => meets(p.outer)).map(p => ({ outer: dp(p.outer.map(pt), true), inner: (p.inner ?? []).map(r => dp(r.map(pt), true)).filter(r => r.length >= 3) }));
const keep = (tags, keys) => { const o = {}; for (const k of keys) if (tags?.[k] !== undefined) o[k] = tags[k]; return o; };
const rename = v => renames.get(v) ?? v;

const features = {};
const area = (kind, keys = []) => {
  const list = (F[kind] ?? []).map(f => ({ tags: keep(f.tags, keys), polys: polys(f) })).filter(f => f.polys.length);
  if (list.length) features[kind] = list.map(f => (Object.keys(f.tags).length ? f : { polys: f.polys }));
};
area('tee', ['tee', 'colour']); area('green'); area('fairway'); area('bunker'); area('water_hazard'); area('lateral_water_hazard'); area('water'); area('rough');
// every hole line near the box (the other courses' too: the converter leaves their features out), the chosen course's under its (renamed) name
features.hole = holes.filter(h => meets(h.line)).map(h => {
  const t = keep(h.tags, ['handicap']), c = cname(h.tags);
  if (c) t['golf:course:name'] = rename(c);
  return { tags: t, ref: h.ref, par: h.par, line: h.line.map(pt) }; // (hole lines keep every vertex: their bends are the aim points)
});
features.pin = (F.pin ?? []).filter(f => f.pos && inBox(f.pos)).map(f => ({ pos: pt(f.pos) }));
// waterways: the runs of each inside the box (with a vertex either side), no names
features.waterway = [];
for (const w of F.waterway ?? []) {
  const L = w.line ?? [];
  let run = [];
  const flush = () => { if (run.length >= 2) features.waterway.push({ tags: keep(w.tags, ['waterway', 'width', 'tunnel', 'culvert']), line: dp(run.map(pt), false) }); run = []; };
  for (let i = 0; i < L.length; i++) {
    const near = inBox(L[i]) || (i > 0 && inBox(L[i - 1])) || (i + 1 < L.length && inBox(L[i + 1]));
    if (near) run.push(L[i]); else flush();
  }
  flush();
}
if (!features.waterway.length) delete features.waterway;

const c = j.meta?.course ?? {};
const fixture = {
  meta: {
    id, credit: '© OpenStreetMap contributors', licence: 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
    place: opt('place', ''), course: { osm: c.osm ?? '', name: opt('name', c.name ?? id) },
    source: `scripts/dev/osm-course.mjs, fetched ${j.meta?.overpass?.fetchedAt?.slice(0, 10) ?? j.meta?.generated?.slice(0, 10) ?? ''}, trimmed by scripts/dev/osm-trim-fixture.mjs (the course "${rename(chosen)}", ${reach} m round its holes)`,
  },
  boundary: j.boundary ? { polys: polys(j.boundary) } : undefined,
  features,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fixture) + '\n');
const n = Object.entries(features).map(([k, v]) => `${k} ${v.length}`).join(', ');
console.log(`${out}: ${(JSON.stringify(fixture).length / 1024).toFixed(1)} kB; the course "${rename(chosen)}" ${mine.length} holes; ${n}`);
