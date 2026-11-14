// T340 (#967), stage 1 (a feasibility spike): find a real golf course in OpenStreetMap and write its layout as JSON (metres around the
// course's centre) and a top-down preview PNG. Plain Node 22 (built-in fetch, fs, zlib, crypto), no installs, no game code.
//   node scripts/dev/osm-course.mjs "<course name>" [--country za] [--list] [--pick 0] [--osm way/123] [--refresh]
//        [--out E:/ClaudeTemp/T340] [--overpass https://mirror/api/interpreter,...] [--timeout 150 (seconds per Overpass attempt)]
//        [--radius 1200 (only for a node-only course)] [--px 1700] [--height [--height-margin 520 --sigma 25]]
// What it does, with one Nominatim request and ONE Overpass query per course (both cached in <out>/raw/, so a rerun makes no request):
//   1. Nominatim search for the name; takes the first leisure=golf_course hit (--list prints the hits and stops; --pick N takes the Nth
//      golf-course hit; --osm way/ID or relation/ID skips the search).
//   2. one Overpass query: the course boundary and, inside it, every golf=* feature (tee fairway green bunker water_hazard
//      lateral_water_hazard rough hole pin cartpath ...), natural=water, streams/rivers/ditches, woods (natural=wood / scrub, landuse=forest) and,
//      since #1273, the map's tree rows (natural=tree_row, lines) and single trees (natural=tree, points), as geometry. The placed course is planted
//      from them (golf/osm/trees.ts); scripts/dev/osm-trim-fixture.mjs keeps the ones near its holes.
//   3. <out>/<slug>.json: the features in metres, x east and y north of the course's centre (the middle of the boundary's bounding box),
//      grouped by kind, with counts and an analysis of how well the holes can be ordered (hole lines, and the guess from tee/green pairs).
//   4. <out>/<slug>.png: top-down preview of the polygons coloured per kind, hole lines numbered, the legend on the left (PNG encoded here
//      with zlib; scanline polygon fill, drawn at 2x and averaged down).
// --height (T357, #999): also the real ground height: the AWS Terrain Tiles over the boundary and a margin, sampled at 4 m, smoothed, packed into <out>/<slug>.height.json with a
//   hillshade preview <out>/<slug>-height.png (scripts/dev/osm-height.mjs, which runs on its own too; the tiles are cached in <out>/dem/raw, a few per course).
//   scripts/dev/osm-trim-fixture.mjs then writes it into the fixture.
// Projection: a local equirectangular one, x = (lon - lon0) * cos(lat0) * R, y = (lat - lat0) * R (R = 6371008.8 m, lat0/lon0 = the centre).
// Over a course (a few km at most) the error is well under 1 m per km, far below the data's own accuracy.
// Public servers, politely: a descriptive User-Agent (no personal address), Nominatim at most one request a second (here: one request per
// run), one Overpass query per course; on 429/5xx or a network error it waits (Retry-After, else 15 s) and retries once, on a timeout or a second
// failure it falls over to the next public mirror (on 2026-11-08 only the main server answered: overpass.kumi.systems hung on every query and
// overpass.private.coffee did not answer at all). It never touches commercial course-guide sites or satellite imagery.
// LICENCE: the data is (c) OpenStreetMap contributors under the ODbL 1.0 (https://www.openstreetmap.org/copyright). Anything that uses it,
// the game included, must credit "© OpenStreetMap contributors" (on the credits screen), and a checked-in fixture of it stays under the
// ODbL with that credit beside it. Do not commit this script's outputs.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

// ---------------------------------------------------------------------------------------------------------------- settings
const UA = 'CapitalEmpire-dev-script/0.1 (+https://github.com/rumcan/CapitalEmpire)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const EARTH_R = 6371008.8;
const CREDIT = '© OpenStreetMap contributors (ODbL 1.0, https://www.openstreetmap.org/copyright)';
const AREA_KINDS = ['tee', 'fairway', 'green', 'bunker', 'water_hazard', 'lateral_water_hazard', 'rough', 'driving_range'];
const LINE_KINDS = ['hole', 'cartpath', 'path'];
const GOLF_KINDS = [...AREA_KINDS, ...LINE_KINDS, 'pin'];
// (#1273: the map's trees too: 'wood' is natural=wood, natural=scrub and landuse=forest (areas), 'tree_row' natural=tree_row (lines), 'tree' natural=tree (single points))
const KINDS = [...GOLF_KINDS, 'water', 'waterway', 'wood', 'tree_row', 'tree', 'other'];
const NEAR = 15;                                  // metres: a hole line "starts on" a tee / "ends on" a green within this
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------- command line
const argv = process.argv.slice(2), FLAGS = new Set(['list', 'refresh', 'help', 'height']), opts = {}, words = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opts[k] = FLAGS.has(k) ? true : argv[++i]; } else words.push(argv[i]);
}
const queryName = words.join(' ').trim();
const OUT = (opts.out || 'E:/ClaudeTemp/T340').replace(/\\/g, '/'), RAW = `${OUT}/raw`;
const slugify = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'course';

// ---------------------------------------------------------------------------------------------------------------- polite fetching
/** fetch with a User-Agent and a timeout; on 429/5xx or a network error it backs off (Retry-After, else 15 s, 30 s, 60 s) and tries again;
 *  a timeout (a hung server: two public mirrors did on 2026-11-08) and any other error throw at once, so the caller can move to the next server */
async function politeFetch(url, init, { label, tries, timeoutMs = 60000 }) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res, retryAfter = 0;
    try {
      res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      last = new Error(`${label}: ${e.name === 'TimeoutError' ? `no answer in ${timeoutMs / 1000} s` : e.cause?.code || e.message}`);
      if (e.name === 'TimeoutError') throw last;
    }
    if (res) {
      if (res.ok) return res;
      const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160);
      last = new Error(`${label}: HTTP ${res.status} ${body}`);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw last;   // a bad query or a block: retrying does not help
      retryAfter = parseInt(res.headers.get('retry-after'), 10) || 0;
    }
    if (attempt < tries) {
      const wait = Math.min(90, retryAfter || 15 * 2 ** (attempt - 1));
      log(`  ${last.message}; waiting ${wait} s, then try ${attempt + 1} of ${tries}`);
      await sleep(wait * 1000);
    }
  }
  throw last;
}

let lastNominatim = 0;
async function nominatimSearch(q, country) {
  const file = `${RAW}/nominatim-${slugify(q)}${country ? '-' + country : ''}.json`;
  if (!opts.refresh && existsSync(file)) { log(`Nominatim: cached ${file}`); return JSON.parse(readFileSync(file, 'utf8')); }
  const wait = lastNominatim + 1100 - Date.now();                    // the usage policy: at most one request a second
  if (wait > 0) await sleep(wait);
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '10' });
  if (country) params.set('countrycodes', country);
  log(`Nominatim: GET ${NOMINATIM}?${params}`);
  const res = await politeFetch(`${NOMINATIM}?${params}`, {}, { label: 'Nominatim', tries: 3 });
  lastNominatim = Date.now();
  const text = await res.text(), json = JSON.parse(text);
  writeFileSync(file, text);
  return json;
}

/** the one Overpass query: the course (.src, as an area), then everything of interest inside it, as geometry */
function overpassQuery(src, radius) {
  const near = src.type === 'node', sel = near ? `around.src:${radius}` : 'area.course';
  return [
    '[out:json][timeout:120];',
    `${src.type}(${src.id})->.src;`,
    ...(near ? [] : ['.src map_to_area->.course;']),
    '(',
    '  .src;',
    `  nwr(${sel})["golf"];`,
    `  nwr(${sel})["natural"="water"];`,
    `  way(${sel})["waterway"~"^(stream|river|canal|ditch|drain)$"];`,
    `  nwr(${sel})["natural"~"^(wood|scrub)$"];`,
    `  nwr(${sel})["landuse"="forest"];`,
    `  way(${sel})["natural"="tree_row"];`,
    `  node(${sel})["natural"="tree"];`,
    ');',
    'out geom;',
  ].join('\n');
}

async function overpass(src, query) {
  const hash = createHash('sha1').update(query).digest('hex').slice(0, 8);
  const file = `${RAW}/overpass-${src.type}-${src.id}-${hash}.json`;
  if (!opts.refresh && existsSync(file)) {
    const meta = existsSync(file + '.meta') ? JSON.parse(readFileSync(file + '.meta', 'utf8')) : {};
    log(`Overpass: cached ${file}`);
    return { json: JSON.parse(readFileSync(file, 'utf8')), server: meta.server || 'cache', fetchedAt: meta.fetchedAt };
  }
  const urls = opts.overpass ? opts.overpass.split(',') : OVERPASS, errors = [];
  for (const url of urls) {
    try {
      log(`Overpass: POST ${url} (${query.split('\n').length} lines of query)`);
      const res = await politeFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query) },
        { label: 'Overpass', tries: 2, timeoutMs: +(opts.timeout || 150) * 1000 });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`Overpass: not JSON (${text.replace(/\s+/g, ' ').slice(0, 120)})`); }
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(`Overpass: ${json.remark}`);
      if (!Array.isArray(json.elements)) throw new Error('Overpass: no elements in the answer');
      const fetchedAt = new Date().toISOString();
      writeFileSync(file, text);
      writeFileSync(file + '.meta', JSON.stringify({ server: url, fetchedAt, query }, null, 1));
      return { json, server: url, fetchedAt };
    } catch (e) { errors.push(e.message); log(`  ${e.message}; trying the next server`); }
  }
  throw new Error(`every Overpass server failed:\n  ${errors.join('\n  ')}`);
}

// ---------------------------------------------------------------------------------------------------------------- geometry (metres)
const round1 = v => Math.round(v * 10) / 10, round2 = v => Math.round(v * 100) / 100;
const ringArea = r => { let s = 0; for (let i = 0, n = r.length; i < n; i++) { const a = r[i], b = r[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
const orient = (r, ccw) => ((ringArea(r) > 0) === ccw ? r : r.slice().reverse());
const polyArea = p => Math.abs(ringArea(p.outer)) - p.inner.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
function ringCentroid(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n], w = p[0] * q[1] - q[0] * p[1]; a += w; cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w; }
  if (Math.abs(a) < 1e-9) return [r.reduce((s, p) => s + p[0], 0) / r.length, r.reduce((s, p) => s + p[1], 0) / r.length];
  return [cx / (3 * a), cy / (3 * a)];
}
function inRing(p, r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
const inPoly = (p, poly) => inRing(p, poly.outer) && !poly.inner.some(r => inRing(p, r));
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const ringDist = (p, r) => { let d = Infinity; for (let i = 0, n = r.length; i < n; i++) d = Math.min(d, segDist(p, r[i], r[(i + 1) % n])); return d; };
const lineLength = l => { let s = 0; for (let i = 1; i < l.length; i++) s += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]); return s; };
/** distance in metres from a point to a feature (0 inside a polygon) */
function distTo(p, f) {
  if (f.pos) return Math.hypot(p[0] - f.pos[0], p[1] - f.pos[1]);
  if (f.polys) {
    let best = Infinity;
    for (const poly of f.polys) { if (inPoly(p, poly)) return 0; best = Math.min(best, ringDist(p, poly.outer), ...poly.inner.map(r => ringDist(p, r))); }
    return best;
  }
  if (f.line) { let best = Infinity; for (let i = 0; i + 1 < f.line.length; i++) best = Math.min(best, segDist(p, f.line[i], f.line[i + 1])); return best; }
  return Infinity;
}
const nearest = (p, list) => { let best = { f: null, d: Infinity }; for (const f of list) { const d = distTo(p, f); if (d < best.d) best = { f, d }; } return best; };
const pointsOf = f => f.pos ? [f.pos] : f.line ? f.line : (f.polys || []).flatMap(p => p.outer);
function bboxOf(fs) {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const f of fs) for (const [x, y] of pointsOf(f)) { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y); }
  return b;
}
const intTag = v => (/^\s*\d+\s*$/.test(String(v ?? '')) ? parseInt(v, 10) : null);

// ---------------------------------------------------------------------------------------------------------------- Overpass elements -> features
const wayPoints = el => (el.geometry || []).filter(Boolean).map(g => [g.lon, g.lat]);
const samePt = (a, b) => a[0] === b[0] && a[1] === b[1];
const isClosed = pts => pts.length >= 4 && samePt(pts[0], pts[pts.length - 1]);
/** chains member ways that share end points into rings (end points are the same nodes, so their coordinates are equal) */
function joinWays(ways) {
  const pool = ways.map(w => w.slice()), rings = [];
  while (pool.length) {
    let ring = pool.pop();
    for (let guard = 0; guard < 10000 && !isClosed(ring); guard++) {
      const end = ring[ring.length - 1], i = pool.findIndex(w => samePt(w[0], end) || samePt(w[w.length - 1], end));
      if (i < 0) break;
      const w = pool.splice(i, 1)[0];
      if (!samePt(w[0], end)) w.reverse();
      ring = ring.concat(w.slice(1));
    }
    rings.push(ring);
  }
  return rings;
}
/** the geometry of one element in lon/lat: {pos} | {line, open?} | {polys: [{outer, inner}], broken?}; null when unusable */
function shapeOf(el, areaLike) {
  if (el.type === 'node') return { pos: [el.lon, el.lat] };
  if (el.type === 'way') {
    const pts = wayPoints(el);
    if (pts.length < 2) return null;
    if (!areaLike) return { line: pts };
    return isClosed(pts) ? { polys: [{ outer: pts, inner: [] }] } : { line: pts, open: true };
  }
  if (el.type === 'relation' && areaLike && ['multipolygon', 'boundary'].includes(el.tags?.type)) {
    const outer = [], inner = [];
    for (const m of el.members || []) {
      if (m.type !== 'way' || !m.geometry) continue;
      const pts = wayPoints(m);
      if (pts.length >= 2) (m.role === 'inner' ? inner : outer).push(pts);
    }
    const polys = joinWays(outer).map(o => ({ outer: o, inner: [] })), broken = polys.some(p => !isClosed(p.outer));
    for (const r of joinWays(inner)) { const host = polys.find(p => inRing(r[0], p.outer)); if (host) host.inner.push(r); }
    return polys.length ? { polys, broken } : null;
  }
  return null;
}
function kindOf(el, srcKey) {
  const t = el.tags || {};
  if (`${el.type}/${el.id}` === srcKey) return 'boundary';
  if (t.golf) return GOLF_KINDS.includes(t.golf) ? t.golf : 'other';
  if (t.natural === 'water') return 'water';
  if (t.waterway) return 'waterway';
  if (t.natural === 'tree_row') return 'tree_row';
  if (t.natural === 'tree') return 'tree';
  if (t.natural === 'wood' || t.natural === 'scrub' || t.landuse === 'forest') return 'wood';
  return 'other';
}

/** all elements -> { centre, boundary, F: {kind: [feature]}, skipped } with coordinates projected to metres */
function buildModel(elements, src, fallbackCentre) {
  const srcKey = `${src.type}/${src.id}`, srcEl = elements.find(e => `${e.type}/${e.id}` === srcKey);
  const srcShape = srcEl && shapeOf(srcEl, true);
  const lonLat = srcShape?.polys ? srcShape.polys.flatMap(p => p.outer) : srcShape?.pos ? [srcShape.pos] : [];
  let lat0 = fallbackCentre.lat, lon0 = fallbackCentre.lon;
  if (lonLat.length) {
    const lons = lonLat.map(p => p[0]), lats = lonLat.map(p => p[1]);
    lon0 = (Math.min(...lons) + Math.max(...lons)) / 2; lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
  }
  const kx = Math.PI / 180 * EARTH_R * Math.cos(lat0 * Math.PI / 180), ky = Math.PI / 180 * EARTH_R;
  const P = ([lon, lat]) => [round2((lon - lon0) * kx), round2((lat - lat0) * ky)];
  const ring = (pts, ccw) => { const r = pts.map(P); if (r.length > 1 && samePt(r[0], r[r.length - 1])) r.pop(); return orient(r, ccw); };
  const F = Object.fromEntries(KINDS.map(k => [k, []])), skipped = [];
  let boundary = null;
  for (const el of elements) {
    const kind = kindOf(el, srcKey), areaLike = !LINE_KINDS.includes(kind) && kind !== 'waterway' && kind !== 'pin' && kind !== 'tree_row' && kind !== 'tree';
    const shape = shapeOf(el, areaLike);
    if (!shape) { skipped.push({ id: `${el.type}/${el.id}`, kind, why: 'no usable geometry' }); continue; }
    const f = { id: `${el.type}/${el.id}`, tags: el.tags || {} };
    const ref = intTag(f.tags.ref); if (ref != null) f.ref = ref;
    if (shape.pos) f.pos = P(shape.pos);
    if (shape.line) { f.line = shape.line.map(P); f.length = round1(lineLength(f.line)); if (shape.open) f.open = true; }
    if (shape.polys) {
      f.polys = shape.polys.map(p => ({ outer: ring(p.outer, true), inner: p.inner.map(r => ring(r, false)) }));
      f.area = round1(f.polys.reduce((s, p) => s + polyArea(p), 0));
      f.centroid = ringCentroid(f.polys.reduce((a, b) => (Math.abs(ringArea(b.outer)) > Math.abs(ringArea(a.outer)) ? b : a)).outer).map(round2);
      if (shape.broken) f.broken = true;
    }
    if (kind === 'hole') { const par = intTag(f.tags.par); if (par != null) f.par = par; }
    if (kind === 'boundary') { boundary = f; continue; }
    if (kind === 'water' || kind === 'wood' || kind === 'waterway') {
      const b = bboxOf([f]);
      if (b.maxX - b.minX > 6000 || b.maxY - b.minY > 6000) { skipped.push({ id: f.id, kind, why: 'larger than 6 km (not part of the course)' }); continue; }
    }
    F[kind].push(f);
  }
  return { centre: { lat: lat0, lon: lon0 }, boundary, F, skipped };
}

// ---------------------------------------------------------------------------------------------------------------- analysis: can the holes be ordered?
function clusterPoints(items, maxD) {                       // single-link clusters of {c: [x, y]} items
  const cl = [];
  for (const it of items) {
    const hit = cl.filter(k => k.members.some(m => Math.hypot(m.c[0] - it.c[0], m.c[1] - it.c[1]) <= maxD));
    if (!hit.length) { cl.push({ members: [it] }); continue; }
    hit[0].members.push(it);
    for (const o of hit.slice(1)) { hit[0].members.push(...o.members); cl.splice(cl.indexOf(o), 1); }
  }
  for (const k of cl) k.c = [k.members.reduce((s, m) => s + m.c[0], 0) / k.members.length, k.members.reduce((s, m) => s + m.c[1], 0) / k.members.length];
  return cl;
}
const centreOf = f => f.pos || f.centroid || f.line?.[Math.floor(f.line.length / 2)];

function analyse(F) {
  const A = {}, holes = F.hole.filter(h => h.line), tees = F.tee, greens = F.green, pins = F.pin;
  // numbering and par of the hole lines, per course (one club boundary can hold several: Augusta National's holds its Par 3 Course too)
  const courseOf = h => h.tags['golf:course:name'] || h.tags['course:name'] || '', groups = new Map();
  for (const h of holes) groups.set(courseOf(h), [...(groups.get(courseOf(h)) || []), h]);
  A.holeLines = { count: holes.length, numbered: holes.filter(h => h.ref != null).length, withPar: holes.filter(h => h.par != null).length, named: holes.filter(h => h.tags.name).length };
  A.courses = [...groups].map(([name, hs]) => {
    const refs = hs.map(h => h.ref).filter(r => r != null), count = new Map(), firstOf = r => hs.find(h => h.ref === r);
    for (const r of refs) count.set(r, (count.get(r) || 0) + 1);
    const highest = Math.max(0, ...refs);
    return {
      name: name || null, holeLines: hs.length, distinctNumbers: count.size, highest,
      missingNumbers: Array.from({ length: highest }, (_, i) => i + 1).filter(r => !count.has(r)),
      duplicatedNumbers: [...count].filter(([, c]) => c > 1).map(([r]) => r),
      parTotal: count.size && [...count.keys()].every(r => firstOf(r).par != null) ? [...count.keys()].reduce((s, r) => s + firstOf(r).par, 0) : null,
    };
  });
  // every hole line against the mapped tees, greens, pins and fairways
  const per = holes.map(h => {
    const a = h.line[0], b = h.line[h.line.length - 1];
    const tA = nearest(a, tees), gB = nearest(b, greens), gA = nearest(a, greens), tB = nearest(b, tees);
    const samples = []; for (let i = 0; i + 1 < h.line.length; i++) {
      const p = h.line[i], q = h.line[i + 1], n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 8));
      for (let k = 0; k < n; k++) samples.push([p[0] + (q[0] - p[0]) * k / n, p[1] + (q[1] - p[1]) * k / n]);
    }
    const inFairway = samples.filter(s => F.fairway.some(f => distTo(s, f) === 0)).length / (samples.length || 1);
    return { id: h.id, course: courseOf(h) || null, ref: h.ref ?? null, par: h.par ?? null, length: h.length, teeD: round1(tA.d), tee: tA.f?.id, greenD: round1(gB.d), green: gB.f?.id, fairwayShare: round2(inFairway),
      reversed: gA.d <= NEAR && tB.d <= NEAR && !(tA.d <= NEAR && gB.d <= NEAR) };
  });
  A.perHole = per;
  A.holeEnds = {
    startOnTee: per.filter(p => p.teeD <= NEAR).length, endOnGreen: per.filter(p => p.greenD <= NEAR).length,
    drawnGreenToTee: per.filter(p => p.reversed).length, onFairway: per.filter(p => p.fairwayShare >= 0.25).length,
  };
  const used = new Map(); for (const p of per) if (p.greenD <= NEAR) used.set(p.green, (used.get(p.green) || 0) + 1);
  const teeUsed = new Set(per.filter(p => p.teeD <= NEAR).map(p => p.tee));
  A.matching = {
    greensWithAHoleLine: used.size, greensWithoutOne: greens.length - used.size, greensEndingMoreThanOneHole: [...used.values()].filter(c => c > 1).length,
    teesWithAHoleLine: teeUsed.size, teesWithoutOne: tees.length - teeUsed.size,
  };
  const pinOn = pins.map(p => nearest(p.pos || centreOf(p), greens));
  A.pins = { count: pins.length, onAGreen: pinOn.filter(n => n.d <= NEAR).length, greensWithAPin: new Set(pinOn.filter(n => n.d <= NEAR).map(n => n.f.id)).size, withHoleNumber: pins.filter(p => p.ref != null).length };
  A.refsOnFeatures = Object.fromEntries(['tee', 'green', 'fairway', 'bunker', 'pin'].map(k => [k, F[k].filter(f => f.ref != null).length]));
  const numberName = /^\s*\d+(\s*[/&,;-]\s*\d+)*\s*$/;                // name="7" or "7/11" (a double green): the hole numbers some mappers put in name= instead of ref=
  A.numbersInNames = Object.fromEntries(['tee', 'green', 'fairway', 'bunker'].map(k => [k, F[k].filter(f => numberName.test(f.tags.name ?? '')).length]));
  // the guess without hole lines: tee clusters (a hole's several tee boxes are one) paired to greens, nearest first, each used once
  const teeCl = clusterPoints(tees.map(t => ({ f: t, c: centreOf(t) })), 35), greenItems = greens.map(g => ({ f: g, c: centreOf(g) }));
  const cand = [];
  for (const t of teeCl) for (const g of greenItems) { const d = Math.hypot(t.c[0] - g.c[0], t.c[1] - g.c[1]); if (d >= 60 && d <= 650) cand.push({ t, g, d }); }
  cand.sort((x, y) => x.d - y.d);
  const uT = new Set(), uG = new Set(), pairs = [];
  for (const c of cand) if (!uT.has(c.t) && !uG.has(c.g)) { uT.add(c.t); uG.add(c.g); pairs.push(c); }
  const judged = per.filter(p => p.teeD <= NEAR && p.greenD <= NEAR);
  const right = judged.filter(p => pairs.some(c => c.t.members.some(m => m.f.id === p.tee) && c.g.f.id === p.green)).length;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ranks = judged.map(p => {                           // how many greens (60 m or more away: the next tee sits by the last green) lie nearer to the hole's tee than its own green
    const t = centreOf(tees.find(f => f.id === p.tee)), g = greens.find(f => f.id === p.green), dTrue = dist(t, centreOf(g));
    return 1 + greens.filter(o => { const d = dist(t, centreOf(o)); return o !== g && d >= 60 && d < dTrue; }).length;
  });
  A.guessFromPairs = {
    teeClusters: teeCl.length, greens: greens.length, pairsFound: pairs.length, holeLinesJudged: judged.length, pairedCorrectly: right, accuracy: judged.length ? round2(right / judged.length) : null,
    nearestGreenIsRight: ranks.filter(r => r === 1).length, rightGreenAmongNearest3: ranks.filter(r => r <= 3).length,
  };
  return A;
}

// ---------------------------------------------------------------------------------------------------------------- PNG preview
/** a 3 x 5 pixel font: the character, then its five rows */
const FONT = {};
for (const line of `
A .#. #.# ### #.# #.#
B ##. #.# ##. #.# ##.
C .## #.. #.. #.. .##
D ##. #.# #.# #.# ##.
E ### #.. ##. #.. ###
F ### #.. ##. #.. #..
G .## #.. #.# #.# .##
H #.# #.# ### #.# #.#
I ### .#. .#. .#. ###
J ..# ..# ..# #.# .#.
K #.# #.# ##. #.# #.#
L #.. #.. #.. #.. ###
M #.# ### ### #.# #.#
N ##. #.# #.# #.# #.#
O .#. #.# #.# #.# .#.
P ##. #.# ##. #.. #..
Q .#. #.# #.# ##. .##
R ##. #.# ##. #.# #.#
S .## #.. .#. ..# ##.
T ### .#. .#. .#. .#.
U #.# #.# #.# #.# ###
V #.# #.# #.# #.# .#.
W #.# #.# ### ### #.#
X #.# #.# .#. #.# #.#
Y #.# #.# .#. .#. .#.
Z ### ..# .#. #.. ###
0 ### #.# #.# #.# ###
1 .#. ##. .#. .#. ###
2 ##. ..# .#. #.. ###
3 ##. ..# .#. ..# ##.
4 #.# #.# ### ..# ..#
5 ### #.. ##. ..# ##.
6 .## #.. ### #.# ###
7 ### ..# .#. .#. .#.
8 ### #.# ### #.# ###
9 ### #.# ### ..# ##.
- ... ... ### ... ...
. ... ... ... ... .#.
/ ..# ..# .#. #.. #..
: ... .#. ... .#. ...
+ ... .#. ### .#. ...
( .#. #.. #.. #.. .#.
) .#. ..# ..# ..# .#.
, ... ... ... .#. #..
? ##. ..# .#. ... .#.
`.trim().split('\n')) { const [ch, ...rows] = line.trim().split(/\s+/); FONT[ch] = rows; }

class Raster {
  constructor(w, h, bg) { this.w = w; this.h = h; this.px = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) this.px.set(bg, i * 3); }
  /** one horizontal run of pixels, x0..x1 inclusive, clipped; a < 1 blends */
  span(y, x0, x1, c, a = 1) {
    if (y < 0 || y >= this.h) return;
    x0 = Math.max(0, x0); x1 = Math.min(this.w - 1, x1);
    const px = this.px; let o = (y * this.w + x0) * 3;
    if (a >= 1) for (let x = x0; x <= x1; x++, o += 3) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; }
    else for (let x = x0; x <= x1; x++, o += 3) { px[o] += (c[0] - px[o]) * a; px[o + 1] += (c[1] - px[o + 1]) * a; px[o + 2] += (c[2] - px[o + 2]) * a; }
  }
  rect(x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) this.span(yy, x, x + w - 1, c); }
  /** even-odd scanline fill of closed rings (outer and inner rings together make holes), sampled at pixel centres */
  fill(rings, c, a = 1) {
    const edges = []; let minY = Infinity, maxY = -Infinity;
    for (const r of rings) for (let i = 0, n = r.length; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n];
      if (p[1] === q[1]) continue;
      const [x0, y0, x1, y1] = p[1] < q[1] ? [p[0], p[1], q[0], q[1]] : [q[0], q[1], p[0], p[1]];
      edges.push([x0, y0, y1, (x1 - x0) / (y1 - y0)]); minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    }
    if (!edges.length) return;
    for (let y = Math.max(0, Math.ceil(minY - 0.5)), yb = Math.min(this.h - 1, Math.floor(maxY - 0.5)); y <= yb; y++) {
      const yc = y + 0.5, xs = [];
      for (const [x0, y0, y1, s] of edges) if (yc >= y0 && yc < y1) xs.push(x0 + (yc - y0) * s);
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) this.span(y, Math.ceil(xs[k] - 0.5), Math.floor(xs[k + 1] - 0.5), c, a);
    }
  }
  disc(cx, cy, r, c) {
    for (let y = Math.max(0, Math.ceil(cy - r - 0.5)), yb = Math.min(this.h - 1, Math.floor(cy + r - 0.5)); y <= yb; y++) {
      const dy = y + 0.5 - cy, hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      this.span(y, Math.ceil(cx - hw - 0.5), Math.floor(cx + hw - 0.5), c);
    }
  }
  /** a polyline of width w: a quad per segment and a disc per joint */
  stroke(pts, w, c) {
    const h = w / 2;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
      if (!L) continue;
      const nx = -(y1 - y0) / L * h, ny = (x1 - x0) / L * h;
      this.fill([[[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]]], c);
    }
    for (const [x, y] of pts) this.disc(x, y, h, c);
  }
  glyphs(str, x, y, s, c) {
    for (const ch of str) {
      const g = FONT[ch];
      if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++) if (g[r][q] === '#') this.rect(x + q * s, y + r * s, s, s, c);
      x += 4 * s;
    }
  }
  text(str, x, y, s, c, outline) {
    str = String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    if (outline) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) this.glyphs(str, x + dx, y + dy, s, outline);
    this.glyphs(str, x, y, s, c);
  }
  blit(src, dx, dy) { for (let y = 0; y < src.h; y++) if (y + dy >= 0 && y + dy < this.h) this.px.set(src.px.subarray(y * src.w * 3, (y + 1) * src.w * 3), ((y + dy) * this.w + dx) * 3); }
}
function downsample(r, f) {
  const out = new Raster(Math.floor(r.w / f), Math.floor(r.h / f), [0, 0, 0]), n = f * f;
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) for (let ch = 0; ch < 3; ch++) {
    let s = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) s += r.px[((y * f + j) * r.w + x * f + i) * 3 + ch];
    out.px[(y * out.w + x) * 3 + ch] = Math.round(s / n);
  }
  return out;
}
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = buf => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function pngChunk(type, data) {
  const head = Buffer.alloc(8), crc = Buffer.alloc(4);
  head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng(r) {
  const stride = r.w * 3, raw = Buffer.alloc((stride + 1) * r.h), ihdr = Buffer.alloc(13);
  for (let y = 0; y < r.h; y++) Buffer.from(r.px.buffer, r.px.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);   // filter byte 0 = none
  ihdr.writeUInt32BE(r.w, 0); ihdr.writeUInt32BE(r.h, 4); ihdr[8] = 8; ihdr[9] = 2;                                                 // 8-bit RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

const COLOURS = {
  background: [26, 32, 38], boundary: [60, 96, 56], rough: [84, 128, 66], wood: [28, 62, 38], water: [96, 152, 224], water_hazard: [44, 108, 214], lateral_water_hazard: [64, 178, 208],
  waterway: [96, 152, 224], fairway: [136, 196, 88], tee: [216, 226, 118], bunker: [240, 220, 152], green: [92, 236, 132], driving_range: [104, 156, 84],
  cartpath: [176, 176, 168], path: [146, 136, 116], hole: [255, 255, 255], pin: [236, 52, 52], tree_row: [56, 120, 60], tree: [46, 104, 52],
};
const LEGEND = [['boundary', 'COURSE AREA'], ['rough', 'ROUGH'], ['wood', 'WOOD'], ['water', 'WATER'], ['water_hazard', 'WATER HAZARD'], ['lateral_water_hazard', 'LATERAL WATER'], ['waterway', 'STREAM'],
  ['fairway', 'FAIRWAY'], ['tee', 'TEE'], ['bunker', 'BUNKER'], ['green', 'GREEN'], ['driving_range', 'RANGE'], ['cartpath', 'CART PATH'], ['path', 'PATH'], ['tree_row', 'TREE ROW'], ['tree', 'TREE'], ['hole', 'HOLE LINE'], ['pin', 'PIN']];
const wrap = (str, n) => {
  const out = []; let cur = '';
  for (const w of String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
};

/** top-down preview: map at the right (north up), legend and counts at the left */
function renderPreview({ boundary, F, title }, maxPx) {
  const bb = bboxOf([...(boundary ? [boundary] : []), ...GOLF_KINDS.flatMap(k => F[k])]);
  if (!isFinite(bb.minX)) throw new Error('nothing to draw: the course has neither a boundary nor any golf=* feature');
  const pad = Math.max(30, 0.03 * Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY));
  const minX = bb.minX - pad, maxX = bb.maxX + pad, minY = bb.minY - pad, maxY = bb.maxY + pad, wM = maxX - minX, hM = maxY - minY;
  const k = Math.min(maxPx / wM, 1800 / hM, 3), SS = 2, mw = Math.ceil(wM * k), mh = Math.ceil(hM * k);   // k = final pixels per metre
  const big = new Raster(mw * SS, mh * SS, COLOURS.background);
  const T = ([x, y]) => [(x - minX) * k * SS, (maxY - y) * k * SS];                                             // metres -> pixels, north up
  const polysOf = f => (f.polys || []).map(p => [p.outer, ...p.inner].map(r => r.map(T)));
  const fillKind = (kind, a = 1) => { for (const f of F[kind]) for (const rings of polysOf(f)) big.fill(rings, COLOURS[kind], a); };
  const lineKind = (kind, w) => { for (const f of F[kind]) if (f.line) big.stroke(f.line.map(T), w * SS, COLOURS[kind]); };   // lines, and unclosed area ways
  if (boundary) for (const rings of polysOf(boundary)) big.fill(rings, COLOURS.boundary);
  fillKind('wood', 0.85); fillKind('rough'); fillKind('driving_range'); fillKind('water'); lineKind('waterway', 1.6);
  fillKind('fairway'); fillKind('water_hazard'); fillKind('lateral_water_hazard'); fillKind('tee'); fillKind('bunker'); fillKind('green');
  for (const kind of AREA_KINDS) lineKind(kind, 1.6);
  lineKind('cartpath', 1.4); lineKind('path', 1); lineKind('tree_row', 2.2);
  for (const p of F.tree) if (p.pos) { const [x, y] = T(p.pos); big.disc(x, y, 1.6 * SS, COLOURS.tree); }   // (#1273: single mapped trees as dots)
  if (boundary) for (const p of boundary.polys || []) for (const r of [p.outer, ...p.inner]) big.stroke([...r, r[0]].map(T), 1.2 * SS, [236, 236, 236]);
  const holes = F.hole.filter(h => h.line);
  for (const h of holes) big.stroke(h.line.map(T), 4.4 * SS, [8, 10, 12]);
  for (const h of holes) big.stroke(h.line.map(T), 2.2 * SS, COLOURS.hole);
  for (const h of holes) { const [x, y] = T(h.line[0]); big.disc(x, y, 5 * SS, [8, 10, 12]); big.disc(x, y, 3.6 * SS, COLOURS.hole); }   // the tee end
  for (const p of F.pin) { const [x, y] = T(p.pos); big.disc(x, y, 4.8 * SS, [8, 10, 12]); big.disc(x, y, 3.4 * SS, COLOURS.pin); }
  const PW = 270, H = Math.max(mh, 640), fin = new Raster(PW + mw, H, [18, 22, 26]);
  fin.blit(downsample(big, SS), PW, 0);
  for (const h of holes) if (h.ref != null) { const [x, y] = T(h.line[0]); fin.text(String(h.ref), PW + Math.round(x / SS) + 8, Math.round(y / SS) - 17, 3, [255, 255, 255], [8, 10, 12]); }
  let y = 12;
  for (const l of wrap(title, 31)) { fin.text(l, 12, y, 2, [255, 255, 255]); y += 16; }
  y += 6;
  fin.text(`NORTH UP  ${Math.round(bb.maxX - bb.minX)} X ${Math.round(bb.maxY - bb.minY)} M`, 12, y, 2, [170, 180, 190]); y += 26;
  for (const [kind, label] of LEGEND) {
    const n = kind === 'boundary' ? (boundary ? 1 : 0) : F[kind].length, dim = n === 0;
    fin.rect(12, y, 14, 12, dim ? [60, 66, 72] : COLOURS[kind]);
    fin.text(label, 34, y + 1, 2, dim ? [110, 118, 126] : [225, 230, 235]);
    fin.text(String(n), 210, y + 1, 2, dim ? [110, 118, 126] : [225, 230, 235]);
    y += 20;
  }
  const bar = [20, 50, 100, 200, 250, 500, 1000, 2000].filter(m => m * k <= PW - 40).pop() || 20;
  y += 8; fin.rect(12, y, Math.round(bar * k), 4, [236, 236, 236]); fin.text(`${bar} M`, 12, y + 10, 2, [236, 236, 236]);
  fin.text('(C) OPENSTREETMAP', 12, H - 36, 2, [150, 160, 170]); fin.text('CONTRIBUTORS  ODBL', 12, H - 20, 2, [150, 160, 170]);
  return encodePng(fin);
}

// ---------------------------------------------------------------------------------------------------------------- main
function writeJson(file, out) {
  const keys = Object.keys(out.features), parts = ['{', `"meta": ${JSON.stringify(out.meta, null, 1)},`, `"boundary": ${JSON.stringify(out.boundary)},`, '"features": {'];
  keys.forEach((k, i) => {
    const rows = out.features[k].map(f => JSON.stringify(f));
    parts.push(`"${k}": [${rows.length ? '\n' + rows.join(',\n') + '\n' : ''}]${i < keys.length - 1 ? ',' : ''}`);
  });
  writeFileSync(file, [...parts, '}', '}'].join('\n') + '\n');
}

async function main() {
  if (opts.help || (!queryName && !opts.osm)) {
    log('usage: node scripts/dev/osm-course.mjs "<course name>" [--country za] [--list] [--pick N] [--osm way/ID] [--refresh] [--out DIR] [--overpass URL,URL] [--timeout S] [--radius M] [--px N] [--height]');
    process.exitCode = opts.help ? 0 : 2; return;
  }
  mkdirSync(RAW, { recursive: true });
  let src, nominatim = null;
  if (opts.osm) {
    const m = /^(node|way|relation)\/(\d+)$/.exec(opts.osm);
    if (!m) throw new Error('--osm wants node/ID, way/ID or relation/ID');
    src = { type: m[1], id: +m[2] };
  } else {
    const hits = await nominatimSearch(queryName, opts.country), golf = hits.filter(h => h.type === 'golf_course');
    log(`Nominatim: ${hits.length} hits, ${golf.length} of them golf courses`);
    for (const h of hits) log(`  ${h.type === 'golf_course' ? `[${golf.indexOf(h)}]` : '   '} ${h.osm_type}/${h.osm_id}  ${h.category || h.class}=${h.type}  ${h.display_name}`);
    if (opts.list) return;
    if (!golf.length) throw new Error('no leisure=golf_course among the hits: try another spelling, --country, or --osm way/ID');
    const hit = opts.pick != null ? golf[+opts.pick] : golf.find(h => h.osm_type !== 'node') || golf[0];
    if (!hit) throw new Error('--pick is out of range');
    nominatim = { osm: `${hit.osm_type}/${hit.osm_id}`, name: hit.name, displayName: hit.display_name, lat: +hit.lat, lon: +hit.lon, boundingbox: hit.boundingbox };
    src = { type: hit.osm_type, id: +hit.osm_id };
  }
  const { json, server, fetchedAt } = await overpass(src, overpassQuery(src, +(opts.radius || 1200)));
  const srcEl = json.elements.find(e => e.type === src.type && e.id === src.id);
  const name = srcEl?.tags?.name || nominatim?.name || queryName || `${src.type}/${src.id}`;
  const slug = slugify(queryName || name);
  const model = buildModel(json.elements, src, { lat: nominatim?.lat ?? 0, lon: nominatim?.lon ?? 0 });
  const { F, boundary } = model, analysis = analyse(F);
  const bb = bboxOf([...(boundary ? [boundary] : []), ...GOLF_KINDS.flatMap(k => F[k])]);
  const golfValues = {}; for (const e of json.elements) if (e.tags?.golf) golfValues[e.tags.golf] = (golfValues[e.tags.golf] || 0) + 1;
  const counts = Object.fromEntries(KINDS.map(k => [k, F[k].length]));
  const meta = {
    tool: 'scripts/dev/osm-course.mjs (T340, #967)', generated: new Date().toISOString(), attribution: CREDIT,
    query: queryName || null, course: { osm: `${src.type}/${src.id}`, name, tags: srcEl?.tags || null }, nominatim,
    overpass: { server, fetchedAt: fetchedAt || null },
    centre: { lat: +model.centre.lat.toFixed(7), lon: +model.centre.lon.toFixed(7) },
    projection: 'local equirectangular: x = (lon - lon0) * cos(lat0) * R, y = (lat - lat0) * R, R = 6371008.8 m',
    units: 'metres, x east and y north of the centre; rings are implicitly closed (the first point is not repeated), outer rings counter-clockwise, inner rings clockwise',
    boundsM: bb, sizeM: [Math.round(bb.maxX - bb.minX), Math.round(bb.maxY - bb.minY)], boundaryAreaHa: boundary?.area != null ? round1(boundary.area / 1e4) : null,
    counts, golfValues, skipped: model.skipped, analysis,
  };
  const jsonFile = `${OUT}/${slug}.json`, pngFile = `${OUT}/${slug}.png`;
  writeJson(jsonFile, { meta, boundary, features: F });
  writeFileSync(pngFile, renderPreview({ boundary, F, title: name }, +(opts.px || 1700)));
  if (opts.height) { const { makeHeight } = await import('./osm-height.mjs'); await makeHeight(jsonFile, { out: OUT, margin: opts['height-margin'], sigma: opts.sigma, z: opts.z, refresh: false }); }

  const A = analysis, H = A.holeLines, E = A.holeEnds, M = A.matching, G = A.guessFromPairs;
  log(`\n== ${name} (${src.type}/${src.id}) ==`);
  log(`centre ${meta.centre.lat}, ${meta.centre.lon}; ${boundary ? `boundary ${meta.sizeM[0]} x ${meta.sizeM[1]} m, ${meta.boundaryAreaHa} ha` : 'NO boundary polygon'}; ${json.elements.length} elements from ${server}`);
  log('features: ' + KINDS.map(k => `${k} ${counts[k]}`).join(', '));
  log('golf=* values: ' + (Object.entries(golfValues).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'));
  if (model.skipped.length) log(`skipped ${model.skipped.length}: ` + model.skipped.slice(0, 5).map(s => `${s.id} (${s.why})`).join('; '));
  log(`hole lines: ${H.count} (numbered ${H.numbered}, par on ${H.withPar}, named ${H.named}), grouped by course name:`);
  for (const c of A.courses) log(`  "${c.name ?? '(no course name)'}": ${c.holeLines} lines, numbers 1..${c.highest} (distinct ${c.distinctNumbers}, missing [${c.missingNumbers}], duplicated [${c.duplicatedNumbers}]), par total ${c.parTotal ?? 'n/a'}`);
  log(`  start on a tee ${E.startOnTee}, end on a green ${E.endOnGreen}, drawn green-to-tee ${E.drawnGreenToTee}, running along a fairway ${E.onFairway}; greens with a hole line ${M.greensWithAHoleLine} of ${counts.green} (ending 2+ holes: ${M.greensEndingMoreThanOneHole}), tees with one ${M.teesWithAHoleLine} of ${counts.tee}`);
  log(`  pins ${A.pins.count}: on a green ${A.pins.onAGreen}, greens with a pin ${A.pins.greensWithAPin}, with a hole number ${A.pins.withHoleNumber}; ref= on tee/green/fairway/bunker/pin: ${Object.values(A.refsOnFeatures).join('/')}; a hole number in name= on tee/green/fairway/bunker: ${Object.values(A.numbersInNames).join('/')}`);
  log(`  the guess without hole lines: ${G.teeClusters} tee clusters + ${G.greens} greens -> ${G.pairsFound} nearest pairs (60-650 m, each used once); of ${G.holeLinesJudged} judged hole lines ${G.pairedCorrectly} paired right (${G.accuracy ?? 'n/a'}); the nearest green 60 m or more away is the right one for ${G.nearestGreenIsRight}, among the nearest 3 for ${G.rightGreenAmongNearest3}`);
  for (const p of A.perHole.slice().sort((a, b) => String(a.course).localeCompare(String(b.course)) || (a.ref ?? 999) - (b.ref ?? 999))) log(`   ${p.course ? `[${p.course}] ` : ''}hole ${String(p.ref ?? '?').padStart(2)} par ${p.par ?? '?'} ${String(Math.round(p.length)).padStart(4)} m  tee ${p.teeD} m  green ${p.greenD} m  fairway ${p.fairwayShare}${p.reversed ? '  REVERSED' : ''}`);
  log(`wrote ${jsonFile}\nwrote ${pngFile}`);
}
main().catch(e => { console.error('FAILED: ' + e.message); process.exitCode = 1; });
