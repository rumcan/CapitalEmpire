// T340 (#967) stage 2: trims a stage-1 course JSON (scripts/dev/osm-course.mjs) to a game fixture: only what the converter (src/game/golf/osm/convert.ts)
// reads, only near the holes of the course to build, coordinates to 0.1 m, no names but the one the game shows. The fixture keeps the ODbL credit in its
// header. A shipped course makes no request: the game ships these files (the search for other courses, T358, calls the servers on the player's own submit).
//   node scripts/dev/osm-trim-fixture.mjs <stage-1.json> --id rondebosch --name "Rondebosch Golf Course" --place "Cape Town, South Africa" \
//        [--course "Augusta National" --rename "Augusta National=Magnolia National"] [--reach 120] [--simplify 0.3] [--height <stage-1>.height.json | none]
//        [--trees parkland|links|desert [--conifers 0.65] [--density 0.8]] [--simplify-wood 1.5] [--min-wood 60] [--out src/game/golf/osm/data/<id>.json]
// #1273: the map's trees stay too (the woods, clipped to the box round the holes and simplified; the tree rows; the single trees as one point list per leaf type), and `--trees`
// writes how wooded the course is into the fixture's meta (golf/osm/trees.ts plants it: the map's trees where it has them, the holes framed where it has few).
// T357 (#999): the real ground height. The stage-1 run's `<name>.height.json` (scripts/dev/osm-height.mjs, or osm-course.mjs --height) beside the input is cropped
// to the course's box and 440 m round it (the land, the skirt the game fades it out over, the margin), kept at the lattice step its source's smoothing needs
// (terrarium.ts packStepOf: 16 m for SRTM, 8 m for 3DEP) and written as the fixture's `height` (16-bit, 1 cm units from a base, deflated, base64). `--height none`
// leaves it out. The game reads that grid through a cubic, so the coarse lattice costs nothing.
// Plain Node 22, no installs (the height part bundles terrarium.ts with the esbuild the repo already has).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--') && a.endsWith('.json'));
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
if (!file || !opt('id')) { console.error('usage: node scripts/dev/osm-trim-fixture.mjs <stage-1.json> --id <id> --name <name> [--place <text>] [--course <name>] [--rename a=b] [--reach 120] [--out file]'); process.exit(2); }
const j = JSON.parse(readFileSync(file, 'utf8')), id = opt('id'), reach = +opt('reach', '120'), out = opt('out', `src/game/golf/osm/data/${id}.json`);
const renames = new Map((opt('rename', '') ? [opt('rename', '')] : []).map(s => s.split('=')));
const r1 = v => Math.round(v * 10) / 10, pt = p => [r1(p[0]), r1(p[1])];
// Douglas-Peucker: a ring or line loses the points that deviate less than --simplify metres (default 0.3: far under a 1 m cell)
const TOL = +opt('simplify', '0.3');
function dp(pts, closed, tol = TOL) {
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

// The kinds a fixture keeps. AREAS: polygons, each with the tags worth keeping. LINES: lines (cut to the box, runs of them), each with its tags. A new kind is one entry in a
// table here and one section in src/game/golf/osm/convert.ts (T354's estate streets: `LINES.street = ['highway', 'name', 'width', 'tunnel']`, once the stage-1 script fetches them).
const AREAS = { tee: ['tee', 'colour'], green: [], fairway: [], bunker: [], water_hazard: [], lateral_water_hazard: [], water: [], rough: [] };
// (#1273: the map's trees: tree rows are lines like waterways; woods are areas, clipped to the box and simplified more (a tree outline need not be exact); single trees
// are one list of points per leaf type: `pts`, not one feature each, so a well-mapped course's thousand trees cost 12 bytes a tree)
const LINES = { waterway: ['waterway', 'width', 'tunnel', 'culvert'], tree_row: ['leaf_type'] };
const features = {};
const area = (kind, keys = []) => {
  const list = (F[kind] ?? []).map(f => ({ tags: keep(f.tags, keys), polys: polys(f) })).filter(f => f.polys.length);
  if (list.length) features[kind] = list.map(f => (Object.keys(f.tags).length ? f : { polys: f.polys }));
};
for (const [kind, keys] of Object.entries(AREAS)) area(kind, keys);
{
  // woods: each polygon clipped to the box (Sutherland-Hodgman: a forest that runs for kilometres keeps only the part near the holes), rings simplified to --simplify-wood m
  // (default 1.5), parts under --min-wood m2 (default 60) dropped; the tags that say what grows there: natural (wood, scrub), landuse (forest), leaf_type
  const wtol = +opt('simplify-wood', '1.5'), minArea = +opt('min-wood', '60');
  const clip = ring => {
    let out = ring;
    for (const [axis, edge, keepLow] of [[0, box[0], false], [0, box[2], true], [1, box[1], false], [1, box[3], true]]) {
      const inp = out; out = [];
      const inside = p => (keepLow ? p[axis] <= edge : p[axis] >= edge);
      for (let i = 0; i < inp.length; i++) {
        const a = inp[i], b = inp[(i + 1) % inp.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { const t = (edge - a[axis]) / (b[axis] - a[axis]), q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; q[axis] = edge; out.push(q); }
      }
      if (!out.length) break;
    }
    return out;
  };
  const ringArea = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  const simp = (ring, closed) => (ring.length > 4 && wtol > 0 ? dp(ring.map(pt), closed, wtol) : ring.map(pt));
  const list = [];
  for (const f of F.wood ?? []) {
    const ps = [];
    for (const p of f.polys ?? []) {
      if (!meets(p.outer)) continue;
      const outer = clip(p.outer);
      if (outer.length < 3) continue;
      const o = simp(outer, true);
      if (o.length < 3 || ringArea(o) < minArea) continue;
      ps.push({ outer: o, inner: (p.inner ?? []).map(r => clip(r)).filter(r => r.length >= 3).map(r => simp(r, true)).filter(r => r.length >= 3 && ringArea(r) >= minArea) });
    }
    if (ps.length) list.push({ tags: keep(f.tags, ['natural', 'landuse', 'leaf_type']), polys: ps });
  }
  if (list.length) features.wood = list;
  const by = new Map();
  for (const f of F.tree ?? []) if (f.pos && inBox(f.pos)) { const k = f.tags?.leaf_type ?? ''; (by.get(k) ?? by.set(k, []).get(k)).push(pt(f.pos)); }
  if (by.size) features.tree = [...by].map(([k, pts]) => ({ ...(k ? { tags: { leaf_type: k } } : {}), pts }));
}
// every hole line near the box (the other courses' too: the converter leaves their features out), the chosen course's under its (renamed) name
features.hole = holes.filter(h => meets(h.line)).map(h => {
  const t = keep(h.tags, ['handicap']), c = cname(h.tags);
  if (c) t['golf:course:name'] = rename(c);
  return { tags: t, ref: h.ref, par: h.par, line: h.line.map(pt) }; // (hole lines keep every vertex: their bends are the aim points)
});
features.pin = (F.pin ?? []).filter(f => f.pos && inBox(f.pos)).map(f => ({ pos: pt(f.pos) }));
// waterways: the runs of each inside the box (with a vertex either side), no names
for (const [kind, keys] of Object.entries(LINES)) {
  features[kind] = [];
  for (const w of F[kind] ?? []) {
    const L = w.line ?? [];
    let run = [];
    const flush = () => { if (run.length >= 2) features[kind].push({ tags: keep(w.tags, keys), line: dp(run.map(pt), false) }); run = []; };
    for (let i = 0; i < L.length; i++) {
      const near = inBox(L[i]) || (i > 0 && inBox(L[i - 1])) || (i + 1 < L.length && inBox(L[i + 1]));
      if (near) run.push(L[i]); else flush();
    }
    flush();
  }
  if (!features[kind].length) delete features[kind];
}

const c = j.meta?.course ?? {};
// how wooded the course is (#1273: golf/osm/trees.ts): --trees parkland|links|desert (a links course has almost no trees, a desert course scattered desert plants, a parkland course
// its holes framed in woods); --conifers 0.65 the share of conifers among its trees (default: the style's), --density 0.8 the share of the style's trees kept (default 1)
const treeStyle = opt('trees'), treeSetting = treeStyle
  ? (opt('conifers') || opt('density') ? { style: treeStyle, ...(opt('conifers') ? { conifers: +opt('conifers') } : {}), ...(opt('density') ? { density: +opt('density') } : {}) } : treeStyle)
  : undefined;
if (treeStyle && !['parkland', 'links', 'desert'].includes(treeStyle)) { console.error('--trees parkland|links|desert'); process.exit(2); }
// the real ground height (T357): the stage-1 run's height file, cropped and kept at the step its source needs
let height;
{
  const hf = opt('height', file.replace(/\.json$/, '.height.json'));
  if (hf !== 'none' && existsSync(hf)) {
    const { loadTerrarium } = await import('./osm-height.mjs'), T = await loadTerrarium(), hd = JSON.parse(readFileSync(hf, 'utf8'));
    const g = await T.unpackGrid(hd.pack), m = +opt('height-margin', '440'), win = [box[0] - m, box[1] - m, box[2] + m, box[3] + m];
    const crop = T.cropGrid(g, win), k = Math.max(1, Math.round(T.packStepOf(hd.meta.sigma) / g.step)), small = T.decimateGrid(crop, k), pk = await T.packGrid(small);
    height = { ...pk, src: hd.meta.src, label: hd.meta.label, credit: hd.meta.credit, z: hd.meta.z, sigma: hd.meta.sigma, fetched: String(hd.meta.fetchedAt ?? '').slice(0, 10) };
    const r = T.gridRange(small);
    console.log(`height: ${hd.meta.label}, ${small.w} x ${small.h} samples at ${small.step} m over ${Math.round(win[2] - win[0])} x ${Math.round(win[3] - win[1])} m, ${r.min.toFixed(1)} to ${r.max.toFixed(1)} m, ${(JSON.stringify(height).length / 1024).toFixed(1)} kB`);
  } else if (hf !== 'none') console.log(`no height file (${hf}): the fixture has no ground height; run scripts/dev/osm-height.mjs first`);
}
const fixture = {
  meta: {
    id, credit: '© OpenStreetMap contributors', licence: 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
    place: opt('place', ''), course: { osm: c.osm ?? '', name: opt('name', c.name ?? id) },
    source: `scripts/dev/osm-course.mjs, fetched ${j.meta?.overpass?.fetchedAt?.slice(0, 10) ?? j.meta?.generated?.slice(0, 10) ?? ''}, trimmed by scripts/dev/osm-trim-fixture.mjs (the course "${rename(chosen)}", ${reach} m round its holes)`,
    ...(treeSetting ? { trees: treeSetting } : {}),
  },
  boundary: j.boundary ? { polys: polys(j.boundary) } : undefined,
  features,
  ...(height ? { height } : {}),
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fixture) + '\n');
const n = Object.entries(features).map(([k, v]) => `${k} ${v.length}`).join(', ');
console.log(`${out}: ${(JSON.stringify(fixture).length / 1024).toFixed(1)} kB; the course "${rename(chosen)}" ${mine.length} holes; ${n}`);
