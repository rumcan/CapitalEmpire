#!/usr/bin/env node
// Cinderlinks map tool: lets an AI agent add paths and buildings to a course and look at the result. See tools/MAP-CLI.md.
// Plain Node 18+, no dependencies. Every command prints one JSON object. Metres are always the GAME frame (x east, y SOUTH).
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'courses', 'raw');
const EDITS = path.join(ROOT, 'courses', 'edits');
const OUT = path.join(ROOT, '..', '..', 'public', 'cinderlinks');   // the built page (npm run cinder:build)
const OVERPASS = process.env.CINDERLINKS_OVERPASS || 'https://overpass-api.de/api/interpreter';
const UA = 'cinderlinks-map-tool';
const SURFACES = ['gravel', 'concrete', 'dirt', 'sand'];
const ROOFS = ['gable', 'hip', 'flat'];
const NUMERIC_KEYS = new Set(['width', 'w', 'd', 'h', 'rot', 'floors']);

class Fail extends Error {}
const fail = (m) => { throw new Fail(m); };
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r6 = (v) => Math.round(v * 1e6) / 1e6;

// ---------------------------------------------------------------- arguments
function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && a.length > 2) {
      const k = a.slice(2), nx = argv[i + 1];
      if (nx === undefined || nx.startsWith('--')) opt[k] = true; else { opt[k] = nx; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}
function num(v, name) {
  if (v === undefined || v === true || v === '' || !Number.isFinite(Number(v))) fail(`${name} must be a number (got ${JSON.stringify(v)})`);
  return Number(v);
}
function parsePairs(s, name) {
  if (typeof s !== 'string' || !s.trim()) fail(`${name} is required, like "x,y x,y"`);
  return s.trim().split(/[\s;]+/).map((t) => {
    const p = t.split(',');
    if (p.length !== 2 || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1]))) fail(`${name}: "${t}" is not an "a,b" pair`);
    return [Number(p[0]), Number(p[1])];
  });
}

// ---------------------------------------------------------------- course data
function courseIds() {
  if (!fs.existsSync(RAW)) return [];
  return fs.readdirSync(RAW).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}
function unpackHeights(p) {   // same unpacking as tools/course-import.mjs (CapitalEmpire HeightPack), kept as a raw Uint16Array
  if (!p || p.v !== 1) return null;
  const n = p.w * p.h, planes = zlib.inflateRawSync(Buffer.from(p.d, 'base64'));
  if (planes.length !== 2 * n) return null;
  const u = new Int32Array(n), out = new Uint16Array(n);
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const k = j * p.w + i, z = planes[k] | (planes[n + k] << 8), r = z & 1 ? -((z + 1) >> 1) : z >> 1;
    const pred = i > 0 && j > 0 ? u[k - 1] + u[k - p.w] - u[k - p.w - 1] : i > 0 ? u[k - 1] : j > 0 ? u[k - p.w] : 0;
    u[k] = pred + r; out[k] = u[k];
  }
  return { x0: p.x0, y0: p.y0, step: p.step, w: p.w, h: p.h, base: p.base, q: p.q, v: out, src: p.label || p.src || '' };
}
const KIND = { tee: 'tee', fairway: 'fairway', green: 'green', bunker: 'bunker', water_hazard: 'water', lateral_water_hazard: 'water', water: 'water' };

function loadCourse(id) {
  if (!id || typeof id !== 'string') fail(`a course id is required; available: ${courseIds().join(', ')}`);
  const file = path.join(RAW, id + '.json');
  if (!/^[a-z0-9_-]+$/i.test(id) || !fs.existsSync(file)) fail(`unknown course "${id}"; available: ${courseIds().join(', ')}`);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const F = j.features || {}, m = j.meta || {};
  const polys = { tee: [], fairway: [], green: [], bunker: [], water: [] };
  for (const [k, kind] of Object.entries(KIND)) for (const ft of F[k] || []) for (const p of ft.polys || []) {
    if (!p.outer || p.outer.length < 3) continue;
    polys[kind].push(p.outer.map((q) => [q[0], -q[1]]));      // y turned over: game frame
  }
  const pins = (F.pin || []).filter((p) => p.pos).map((p) => [p.pos[0], -p.pos[1]]);
  const byRef = new Map();
  for (const h of F.hole || []) {
    if (!h.line || h.line.length < 2 || !Number.isFinite(h.ref) || byRef.has(h.ref)) continue;
    const line = h.line.map((q) => [q[0], -q[1]]);
    const tee = line[0];
    let pin = line[line.length - 1], bd = 40;
    for (const p of pins) { const d = Math.hypot(p[0] - pin[0], p[1] - pin[1]); if (d < bd) { bd = d; pin = p; } }
    let len = 0; for (let k = 1; k < line.length; k++) len += Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]);
    byRef.set(h.ref, { n: h.ref, par: h.par >= 3 && h.par <= 5 ? h.par : len > 420 ? 5 : len > 220 ? 4 : 3, tee, pin, line, len });
  }
  const holes = [...byRef.values()].sort((a, b) => a.n - b.n);
  // bounding box of everything known (game metres)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (p) => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  for (const k in polys) for (const r of polys[k]) r.forEach(grow);
  holes.forEach((h) => { h.line.forEach(grow); grow(h.pin); });
  if (!Number.isFinite(x0)) fail(`course "${id}" has no shapes`);
  return { id, meta: m, name: (m.course && m.course.name) || m.id || id, place: m.place || '', osm: (m.course && m.course.osm) || '',
    polys, holes, bbox: [x0, y0, x1, y1], hg: unpackHeights(j.height) };
}

// ---------------------------------------------------------------- centre (lat/lon of the frame's origin)
const CENTRES_FILE = path.join(EDITS, '_centres.json');
const KNOWN_CENTRES = {};   // filled by `calibrate`; see _centres.json
function getCentre(c) {
  const m = c.meta || {};
  if (m.centre && Number.isFinite(m.centre.lat)) return { lat: m.centre.lat, lon: m.centre.lon, source: 'raw meta' };
  if (Number.isFinite(m.lat) && Number.isFinite(m.lon)) return { lat: m.lat, lon: m.lon, source: 'raw meta' };
  try { const t = JSON.parse(fs.readFileSync(CENTRES_FILE, 'utf8'))[c.id]; if (t && Number.isFinite(t.lat)) return { lat: t.lat, lon: t.lon, source: 'calibrated: ' + (t.method || '') }; } catch { /* none */ }
  if (KNOWN_CENTRES[c.id]) return { ...KNOWN_CENTRES[c.id], source: 'built-in table' };
  return null;
}
const needCentre = (c) => getCentre(c) || fail(`course "${c.id}" has no centre latitude/longitude (the raw file does not store one). Run: node tools/cinderlinks-map.mjs calibrate ${c.id}`);
const mPerLat = 111132.9;
const toLatLon = (cen, x, y) => [r6(cen.lat - y / mPerLat), r6(cen.lon + x / (111320 * Math.cos(cen.lat * Math.PI / 180)))];
const fromLatLon = (cen, lat, lon) => [r2((lon - cen.lon) * 111320 * Math.cos(cen.lat * Math.PI / 180)), r2(-(lat - cen.lat) * mPerLat)];

// ---------------------------------------------------------------- geometry
function inPoly(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
  }
  return ins;
}
function whatIsAt(c, x, y) {
  for (const k of ['green', 'tee', 'bunker', 'water', 'fairway']) for (const r of c.polys[k]) if (inPoly(x, y, r)) return k;
  return 'rough';
}
function segDist(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}
function heightAt(c, x, y) {
  const g = c.hg; if (!g) return null;
  const col = (x - g.x0) / g.step, row = (g.y0 + y) / g.step;   // raw y north = -y_game; row j sits at y0 - j*step
  if (col < 0 || row < 0 || col > g.w - 1 || row > g.h - 1) return null;
  const i = Math.min(g.w - 2, Math.floor(col)), j = Math.min(g.h - 2, Math.floor(row)), tx = col - i, ty = row - j;
  const v = (a, b) => g.base + g.v[b * g.w + a] * g.q;
  const h = v(i, j) * (1 - tx) * (1 - ty) + v(i + 1, j) * tx * (1 - ty) + v(i, j + 1) * (1 - tx) * ty + v(i + 1, j + 1) * tx * ty;
  return r1(h);
}
const polyLen = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };

// ---------------------------------------------------------------- features file
const editsFile = (id) => path.join(EDITS, id + '.json');
function loadEdits(id) {
  const f = editsFile(id);
  if (!fs.existsSync(f)) return { course: id, v: 1, features: [] };
  let j; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`${f} is not valid JSON: ${e.message}`); }
  if (!Array.isArray(j.features)) j.features = [];
  return { course: id, v: 1, features: j.features };
}
function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp' + process.pid;
  fs.writeFileSync(tmp, text);
  for (let i = 0; i < 8; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (i + 1)); if (i === 7) { fs.writeFileSync(file, text); try { fs.unlinkSync(tmp); } catch { /* gone */ } } }
  }
}
function saveEdits(id, data) {
  const text = '{ "course": ' + JSON.stringify(id) + ', "v": 1, "features": [\n' + data.features.map((f) => '  ' + JSON.stringify(f)).join(',\n') + (data.features.length ? '\n' : '') + '] }\n';
  atomicWrite(editsFile(id), text);
  const written = [path.relative(ROOT, editsFile(id)).replace(/\\/g, '/')];
  if (fs.existsSync(OUT)) { atomicWrite(path.join(OUT, 'edits', id + '.json'), text); written.push('public/cinderlinks/edits/' + id + '.json'); }
  return written;
}
function nextId(features, prefix) {
  let n = 0; for (const f of features) { const m = new RegExp('^' + prefix + '(\\d+)$').exec(f.id); if (m) n = Math.max(n, +m[1]); }
  return prefix + (n + 1);
}

// ---------------------------------------------------------------- validation
const HEX = /^#[0-9a-f]{6}$/i;
function inReach(c, x, y, what) {
  const b = c.bbox, M = 300;
  if (x < b[0] - M || x > b[2] + M || y < b[1] - M || y > b[3] + M) fail(`${what} (${r1(x)}, ${r1(y)}) is more than ${M} m outside the course's bounding box [${b.map(r1).join(', ')}] (game metres, x east, y south)`);
}
function validate(c, f) {
  if (f.kind === 'path') {
    if (!SURFACES.includes(f.surface)) fail(`surface must be one of ${SURFACES.join(', ')} (got ${JSON.stringify(f.surface)})`);
    if (!(f.width > 0 && f.width <= 20)) fail('width must be more than 0 and at most 20 metres');
    if (!Array.isArray(f.pts) || f.pts.length < 2) fail('a path needs at least 2 points');
    for (const p of f.pts) { if (!Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) fail('pts must be [[x, y], ...] numbers'); inReach(c, p[0], p[1], 'path point'); }
    f.pts = f.pts.map((p) => [r2(p[0]), r2(p[1])]);
  } else if (f.kind === 'building') {
    if (!Array.isArray(f.at) || f.at.length !== 2 || !f.at.every(Number.isFinite)) fail('at must be [x, y] numbers');
    inReach(c, f.at[0], f.at[1], 'building centre');
    for (const [k, lo, hi] of [['w', 2, 120], ['d', 2, 120], ['h', 2, 20]]) if (!(f[k] >= lo && f[k] <= hi)) fail(`${k} must be between ${lo} and ${hi} metres (got ${f[k]})`);
    if (!Number.isFinite(f.rot)) fail('rot must be a number (degrees clockwise from east)');
    f.rot = r2(((f.rot % 360) + 360) % 360);
    if (!ROOFS.includes(f.roof)) fail(`roof must be one of ${ROOFS.join(', ')}`);
    if (!HEX.test(f.wall)) fail('wall must be a colour like #e8dcc0');
    if (!HEX.test(f.roofColour)) fail('roofColour must be a colour like #8a3b2a');
    if (!Number.isInteger(f.floors) || f.floors < 1 || f.floors > 4) fail('floors must be a whole number 1 to 4');
    f.at = [r2(f.at[0]), r2(f.at[1])];
  } else fail(`unknown kind "${f.kind}"`);
  if (typeof f.name !== 'string') f.name = String(f.name ?? '');
  return f;
}
function buildPoints(c, s, opt, name) {
  let pts = parsePairs(s, name);
  if (opt.latlon) { const cen = needCentre(c); pts = pts.map((p) => fromLatLon(cen, p[0], p[1])); }
  return pts;
}

// ---------------------------------------------------------------- commands
const C = {};
const HELP = [
  ['help', 'help', 'This list.'],
  ['courses', 'courses', 'Course ids with name and place.'],
  ['info', 'info <course>', 'Centre, bounding box, holes (tee/pin/length), shape counts, features already added.'],
  ['where', 'where <course> (--x X --y Y | --lat LAT --lon LON)', 'Convert both ways and say what is there: shape kind, nearest hole, ground height.'],
  ['calibrate', 'calibrate <course>', 'Find the centre latitude/longitude by matching the raw hole lines to OpenStreetMap golf=hole ways (needs network; run once per course).'],
  ['add-path', 'add-path <course> --pts "x,y x,y" [--latlon] [--width 2.4] [--surface gravel] [--name ".."]', 'Add a path (centre line).'],
  ['add-building', 'add-building <course> --at "x,y" [--latlon] --w 30 --d 16 --h 6 [--rot 0] [--roof gable] [--wall "#e8dcc0"] [--roof-colour "#8a3b2a"] [--floors 1] [--name ".."]', 'Add a building.'],
  ['list', 'list <course>', 'List the added features.'],
  ['remove', 'remove <course> <id>', 'Remove one feature.'],
  ['clear', 'clear <course> --yes', 'Remove all added features.'],
  ['move', 'move <course> <id> --dx DX --dy DY', 'Shift a feature by game metres (x east, y south).'],
  ['set', 'set <course> <id> --key value ...', 'Change any field (width, surface, name, pts, at, w, d, h, rot, roof, wall, roof-colour, floors); --latlon for pts/at.'],
  ['import-osm', 'import-osm <course> [--dry-run]', 'Fetch paths and buildings from OpenStreetMap (Overpass) and add them; repeatable without duplicates.'],
  ['map', 'map <course> [--out file.png] [--px-per-m 1] [--bbox "x0,y0,x1,y1"] [--grid 100]', 'Draw a north-up PNG of the course and the added features.'],
];
C.help = () => ({ ok: true,
  description: 'cinderlinks-map adds paths and buildings to a Cinderlinks golf course and draws a picture of the result. Metres are in the GAME frame (x east, y SOUTH, real metres about the course centre); lat/lon is accepted where noted. Every write goes to courses/edits/<course>.json and, if out/ exists, to out/edits/<course>.json, which the running game polls every two seconds. Every command prints one JSON object ({ok:true,...} or {ok:false,error}); add --pretty to indent. See tools/MAP-CLI.md.',
  commands: HELP.map(([name, usage, about]) => ({ name, usage, about })) });

C.courses = () => ({ ok: true, courses: courseIds().map((id) => { const c = loadCourse(id); return { id, name: c.name, place: c.place, holes: c.holes.length }; }) });

const ptInfo = (cen, p) => ({ x: r1(p[0]), y: r1(p[1]), ...(cen ? { lat: toLatLon(cen, p[0], p[1])[0], lon: toLatLon(cen, p[0], p[1])[1] } : {}) });
C.info = ({ pos }) => {
  const c = loadCourse(pos[0]), cen = getCentre(c), ed = loadEdits(c.id);
  const counts = {}; for (const k in c.polys) counts[k] = c.polys[k].length;
  return { ok: true, course: c.id, name: c.name, place: c.place, frame: 'game metres: x east, y south, about the course centre',
    centre: cen ? { lat: cen.lat, lon: cen.lon, source: cen.source } : null, centreNote: cen ? undefined : 'no centre lat/lon known: run calibrate ' + c.id + ' to enable --latlon and lat/lon output',
    bbox: { x0: r1(c.bbox[0]), y0: r1(c.bbox[1]), x1: r1(c.bbox[2]), y1: r1(c.bbox[3]), note: 'x0,y0 is the north-west corner; y grows southward' },
    holes: c.holes.map((h) => ({ n: h.n, par: h.par, lengthM: Math.round(h.len), tee: ptInfo(cen, h.tee), pin: ptInfo(cen, h.pin) })),
    shapes: counts, heightGrid: c.hg ? { stepM: c.hg.step, source: c.hg.src } : null,
    features: ed.features.map(summ) };
};
const summ = (f) => f.kind === 'path' ? { id: f.id, kind: 'path', name: f.name, surface: f.surface, width: f.width, points: f.pts.length, lengthM: r1(polyLen(f.pts)), ...(f.src ? { src: f.src } : {}) }
  : { id: f.id, kind: 'building', name: f.name, at: f.at, w: f.w, d: f.d, h: f.h, rot: f.rot, roof: f.roof, floors: f.floors, ...(f.src ? { src: f.src } : {}) };

C.where = ({ pos, opt }) => {
  const c = loadCourse(pos[0]);
  let x, y, cen = getCentre(c);
  if (opt.lat !== undefined || opt.lon !== undefined) { cen = needCentre(c); [x, y] = fromLatLon(cen, num(opt.lat, '--lat'), num(opt.lon, '--lon')); }
  else { x = num(opt.x, '--x'); y = num(opt.y, '--y'); }
  const out = { ok: true, course: c.id, x: r1(x), y: r1(y) };
  if (cen) { [out.lat, out.lon] = toLatLon(cen, x, y); } else out.latlonNote = 'no centre lat/lon known: run calibrate ' + c.id;
  out.inside = whatIsAt(c, x, y);
  let best = null;
  for (const h of c.holes) {
    let d = Infinity; for (let i = 1; i < h.line.length; i++) d = Math.min(d, segDist(x, y, h.line[i - 1], h.line[i]));
    if (!best || d < best.d) best = { h, d };
  }
  if (best) out.nearestHole = { n: best.h.n, par: best.h.par, distFromHoleLineM: r1(best.d), distToTeeM: r1(Math.hypot(x - best.h.tee[0], y - best.h.tee[1])), distToPinM: r1(Math.hypot(x - best.h.pin[0], y - best.h.pin[1])) };
  const ht = heightAt(c, x, y);
  out.heightM = ht; if (ht === null) out.heightNote = c.hg ? 'outside the height grid' : 'this course has no height grid';
  return out;
};

C.calibrate = async ({ pos }) => {
  const c = loadCourse(pos[0]);
  const m = /^(relation|way)\/(\d+)$/.exec(c.osm); if (!m) fail('the raw file has no OSM relation/way id to find the course by');
  const ctr = await overpass(`[out:json][timeout:50];${m[1] === 'relation' ? 'rel' : 'way'}(${m[2]});out center;`);
  const e = ctr.elements[0]; if (!e || !e.center) fail('OpenStreetMap returned no centre for ' + c.osm);
  const holes = await overpass(`[out:json][timeout:50];way["golf"="hole"](around:3500,${e.center.lat},${e.center.lon});out geom tags;`);
  const cands = [];
  for (const h of c.holes) for (const w of holes.elements) {
    const ref = parseInt((w.tags || {}).ref, 10);
    if (ref !== h.n || !w.geometry || w.geometry.length !== h.line.length) continue;
    const g = w.geometry[0];
    // game frame: x = (lon - lon0) * k, y = -(lat - lat0) * mPerLat. The origin is solved with the course's own latitude.
    const lat0 = g.lat + h.tee[1] / mPerLat;
    const lon0 = g.lon - h.tee[0] / (111320 * Math.cos(lat0 * Math.PI / 180));
    cands.push({ lat: lat0, lon: lon0, hole: h.n });
  }
  if (!cands.length) fail('no OpenStreetMap golf=hole way matched the raw hole lines (ref and point count)');
  let best = null;
  for (const a of cands) {
    const near = cands.filter((b) => Math.abs(a.lat - b.lat) * mPerLat < 4 && Math.abs(a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180) < 4);
    if (!best || near.length > best.length) best = near;
  }
  const lat = r6(best.reduce((s, q) => s + q.lat, 0) / best.length), lon = r6(best.reduce((s, q) => s + q.lon, 0) / best.length);
  let t = {}; try { t = JSON.parse(fs.readFileSync(CENTRES_FILE, 'utf8')); } catch { /* new */ }
  t[c.id] = { lat, lon, method: `matched ${best.length} of ${c.holes.length} hole lines to OSM golf=hole ways`, date: new Date().toISOString().slice(0, 10) };
  atomicWrite(CENTRES_FILE, JSON.stringify(t, null, 1) + '\n');
  return { ok: true, course: c.id, lat, lon, matchedHoles: best.length, of: c.holes.length, savedTo: 'courses/edits/_centres.json' };
};

C['add-path'] = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id);
  const pts = buildPoints(c, opt.pts, opt, '--pts');
  const f = validate(c, { id: nextId(ed.features, 'p'), kind: 'path', name: typeof opt.name === 'string' ? opt.name : 'path', surface: opt.surface === undefined ? 'gravel' : opt.surface,
    width: opt.width === undefined ? 2.4 : num(opt.width, '--width'), pts });
  ed.features.push(f);
  return { ok: true, feature: f, lengthM: r1(polyLen(f.pts)), wrote: saveEdits(c.id, ed) };
};
C['add-building'] = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id);
  const at = buildPoints(c, opt.at, opt, '--at'); if (at.length !== 1) fail('--at takes exactly one "x,y" pair');
  const f = validate(c, { id: nextId(ed.features, 'b'), kind: 'building', name: typeof opt.name === 'string' ? opt.name : 'building', at: at[0],
    w: num(opt.w, '--w'), d: num(opt.d, '--d'), h: num(opt.h, '--h'), rot: opt.rot === undefined ? 0 : num(opt.rot, '--rot'),
    roof: opt.roof === undefined ? 'gable' : opt.roof, wall: opt.wall === undefined ? '#e8dcc0' : opt.wall,
    roofColour: opt['roof-colour'] === undefined ? '#8a3b2a' : opt['roof-colour'], floors: opt.floors === undefined ? 1 : num(opt.floors, '--floors') });
  const warnings = [], k = whatIsAt(c, f.at[0], f.at[1]);
  if (k !== 'rough') warnings.push(`the building's centre lies on a ${k}`);
  ed.features.push(f);
  return { ok: true, feature: f, warnings, wrote: saveEdits(c.id, ed) };
};
C.list = ({ pos }) => { const c = loadCourse(pos[0]); const ed = loadEdits(c.id); return { ok: true, course: c.id, count: ed.features.length, features: ed.features }; };
C.remove = ({ pos }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id), i = ed.features.findIndex((f) => f.id === pos[1]);
  if (i < 0) fail(`no feature "${pos[1]}" in ${c.id}; ids: ${ed.features.map((f) => f.id).join(', ') || '(none)'}`);
  const [f] = ed.features.splice(i, 1);
  return { ok: true, removed: f.id, remaining: ed.features.length, wrote: saveEdits(c.id, ed) };
};
C.clear = ({ pos, opt }) => {
  const c = loadCourse(pos[0]); if (!opt.yes) fail('clear removes every added feature; repeat with --yes');
  const ed = loadEdits(c.id), n = ed.features.length; ed.features = [];
  return { ok: true, removed: n, wrote: saveEdits(c.id, ed) };
};
function findFeature(ed, id, course) { const f = ed.features.find((q) => q.id === id); if (!f) fail(`no feature "${id}" in ${course}; ids: ${ed.features.map((q) => q.id).join(', ') || '(none)'}`); return f; }
C.move = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id), f = findFeature(ed, pos[1], c.id);
  const dx = opt.dx === undefined ? 0 : num(opt.dx, '--dx'), dy = opt.dy === undefined ? 0 : num(opt.dy, '--dy');
  if (f.kind === 'path') f.pts = f.pts.map((p) => [p[0] + dx, p[1] + dy]); else f.at = [f.at[0] + dx, f.at[1] + dy];
  validate(c, f);
  return { ok: true, feature: f, wrote: saveEdits(c.id, ed) };
};
C.set = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id), f = findFeature(ed, pos[1], c.id);
  const keys = Object.keys(opt).filter((k) => k !== 'latlon'); if (!keys.length) fail('give at least one --key value');
  for (const k of keys) {
    const key = k === 'roof-colour' ? 'roofColour' : k;
    if (key === 'id' || key === 'kind') fail(`${key} cannot be changed`);
    if (opt[k] === true) fail(`--${k} needs a value`);
    if (key === 'pts') { if (f.kind !== 'path') fail('pts only applies to a path'); f.pts = buildPoints(c, opt[k], opt, '--pts'); }
    else if (key === 'at') { if (f.kind !== 'building') fail('at only applies to a building'); const a = buildPoints(c, opt[k], opt, '--at'); if (a.length !== 1) fail('--at takes one pair'); f.at = a[0]; }
    else if (NUMERIC_KEYS.has(key)) f[key] = num(opt[k], '--' + k);
    else f[key] = opt[k];
  }
  validate(c, f);
  return { ok: true, feature: f, wrote: saveEdits(c.id, ed) };
};

// ---------------------------------------------------------------- OpenStreetMap
async function overpass(query) {
  let r;
  try { r = await fetch(OVERPASS, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(60000) }); }
  catch (e) { fail('Overpass request failed: ' + (e.cause && e.cause.message ? e.message + ' (' + e.cause.message + ')' : e.message)); }
  const text = await r.text();
  if (!r.ok) fail(`Overpass answered HTTP ${r.status}: ${text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`);
  try { return JSON.parse(text); } catch { fail('Overpass did not return JSON: ' + text.slice(0, 200)); }
}
function minRect(ring) {   // minimum-area bounding rectangle: try each edge direction
  let best = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of ring) { const u = p[0] * ux + p[1] * uy, v = -p[0] * uy + p[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) { const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2; best = { area, w: u1 - u0, d: v1 - v0, cx: cu * ux - cv * uy, cy: cu * uy + cv * ux, rot: Math.atan2(uy, ux) * 180 / Math.PI }; }
  }
  return best;
}
// route-cartpaths <course> [--buildings] [--dry-run]: a cart path for every hole that has none near it: beside the hole, in the rough, from its tee to its
// green, and on to the next tee. With --buildings: a clubhouse and a starter's hut by the first tee, a halfway house by the tenth, a greenkeeper's shed.
C['route-cartpaths'] = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id), added = [], rough = (x, y) => whatIsAt(c, x, y) === 'rough';
  const paths = () => ed.features.filter((f) => f.kind === 'path');
  const nearPath = (x, y, d) => paths().some((f) => { for (let i = 1; i < f.pts.length; i++) if (segDist(x, y, f.pts[i - 1], f.pts[i]) < d) return true; return false; });
  const resample = (line, step) => { const out = [line[0]]; let carry = 0; for (let i = 1; i < line.length; i++) { const A = line[i - 1], B = line[i], L = Math.hypot(B[0] - A[0], B[1] - A[1]); let t = step - carry; while (t <= L) { out.push([A[0] + (B[0] - A[0]) * t / L, A[1] + (B[1] - A[1]) * t / L]); t += step; } carry = (carry + L) % step; } out.push(line[line.length - 1]); return out; };
  const offsetLine = (line, side) => {   // the hole's own line moved sideways until it lies in the rough; the distances evened out so the path runs smoothly
    const P = resample(line, 12), n = P.length, N = [], off = [];
    for (let i = 0; i < n; i++) { const A = P[Math.max(0, i - 1)], B = P[Math.min(n - 1, i + 1)], L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1; N.push([-(B[1] - A[1]) / L * side, (B[0] - A[0]) / L * side]); }
    let bad = 0;
    for (let i = 0; i < n; i++) { let o = 0; for (let d = 12; d <= 60; d += 3) { const x = P[i][0] + N[i][0] * d, y = P[i][1] + N[i][1] * d; if (rough(x, y) && rough(P[i][0] + N[i][0] * (d - 4), P[i][1] + N[i][1] * (d - 4)) && rough(P[i][0] + N[i][0] * (d + 3), P[i][1] + N[i][1] * (d + 3))) { o = d; break; } } if (!o) { o = 34; bad++; } off.push(o); }
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) { const a = off[Math.max(0, i - 1)], b = off[Math.min(n - 1, i + 1)]; off[i] = Math.max(off[i], (a + off[i] * 2 + b) / 4); }   // (never nearer the fairway than it needs to be at that point)
    const pts = P.map((q, i) => [r1(q[0] + N[i][0] * off[i]), r1(q[1] + N[i][1] * off[i])]);
    return { pts, bad, mean: off.reduce((u, v) => u + v, 0) / n };
  };
  const ends = [];
  for (const h of c.holes) {
    const L = offsetLine(h.line, -1), R = offsetLine(h.line, 1), best = L.bad * 40 + L.mean <= R.bad * 40 + R.mean ? L : R;
    const served = best.pts.filter((q) => nearPath(q[0], q[1], 26)).length / best.pts.length;
    if (served > 0.6) { ends.push(null); continue; }
    const f = validate(c, { id: nextId(ed.features, 'p'), kind: 'path', name: `cart path, hole ${h.n}`, surface: 'concrete', width: 2.4, pts: best.pts, src: 'route/hole' + h.n });
    ed.features.push(f); added.push({ id: f.id, hole: h.n, lengthM: r1(polyLen(f.pts)) }); ends.push(f);
  }
  for (let i = 0; i + 1 < ends.length; i++) {   // from each green on to the next tee
    const A = ends[i], B = ends[i + 1]; if (!A || !B) continue;
    const a = A.pts[A.pts.length - 1], b = B.pts[0], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 6 || L > 260) continue;
    let cross = 0; for (let t = 0.1; t < 1; t += 0.1) { const k = whatIsAt(c, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (k === 'green' || k === 'water' || k === 'bunker') cross++; } if (cross) continue;
    const f = validate(c, { id: nextId(ed.features, 'p'), kind: 'path', name: `cart path, green ${c.holes[i].n} to tee ${c.holes[i + 1].n}`, surface: 'concrete', width: 2.4, pts: [a, [r1((a[0] + b[0]) / 2), r1((a[1] + b[1]) / 2)], b], src: 'route/link' + c.holes[i].n });
    ed.features.push(f); added.push({ id: f.id, link: c.holes[i].n, lengthM: r1(L) });
  }
  const built = [];
  if (opt.buildings) {
    const holeD = (x, y) => Math.min(...c.holes.map((h) => { let m = 1e9; for (let i = 1; i < h.line.length; i++) m = Math.min(m, segDist(x, y, h.line[i - 1], h.line[i])); return m; }));
    const clear = (x, y, w, d) => { for (const u of [-0.5, 0, 0.5]) for (const v of [-0.5, 0, 0.5]) if (!rough(x + u * w, y + v * d)) return false; return !nearPath(x, y, Math.max(w, d) / 2 + 4) && holeD(x, y) > Math.max(w, d) / 2 + 22 && !ed.features.some((f) => f.kind === 'building' && Math.hypot(f.at[0] - x, f.at[1] - y) < 30); };
    const place = (x0, y0, w, d) => { for (let r = 0; r <= 90; r += 6) for (let a = 0; a < 6.283; a += 0.5) { const x = x0 + Math.cos(a) * r, y = y0 + Math.sin(a) * r; if (clear(x, y, w, d)) return [r1(x), r1(y)]; } return null; };
    const h1 = c.holes[0], dir = (h) => { const a = h.line[0], b = h.line[Math.min(h.line.length - 1, 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; }, d1 = dir(h1), rot1 = r1(Math.atan2(d1[1], d1[0]) * 180 / Math.PI + 90);
    const want = [['Clubhouse', h1.tee[0] - d1[0] * 55, h1.tee[1] - d1[1] * 55, { w: 34, d: 18, h: 6.5, floors: 2, roof: 'hip', rot: rot1, wall: '#ece2c8', roofColour: '#7a3a2c' }],
      ['Starter\'s hut', h1.tee[0] - d1[1] * 16, h1.tee[1] + d1[0] * 16, { w: 5, d: 4, h: 3, floors: 1, roof: 'hip', rot: rot1, wall: '#dfe6d8', roofColour: '#3c5a44' }]];
    const h10 = c.holes.find((h) => h.n === 10); if (h10) { const d = dir(h10); want.push(['Halfway house', h10.tee[0] - d[0] * 26, h10.tee[1] - d[1] * 26, { w: 11, d: 8, h: 3.6, floors: 1, roof: 'gable', rot: r1(Math.atan2(d[1], d[0]) * 180 / Math.PI), wall: '#e8dcc0', roofColour: '#8a3b2a' }]); }
    const hm = c.holes[Math.floor(c.holes.length * 0.7)]; if (hm) want.push(['Greenkeeper\'s shed', hm.tee[0] + 70, hm.tee[1] + 50, { w: 16, d: 9, h: 4.2, floors: 1, roof: 'gable', rot: 20, wall: '#b9b3a4', roofColour: '#4e5a60' }]);
    for (const [name, x, y, o] of want) { const at = place(x, y, o.w, o.d); if (!at) { built.push({ name, placed: false }); continue; } const f = validate(c, { id: nextId(ed.features, 'b'), kind: 'building', name, at, ...o, src: 'route/building' }); ed.features.push(f); built.push({ id: f.id, name, at }); }
  }
  return { ok: true, course: c.id, dryRun: !!opt['dry-run'], pathsAdded: added.length, lengthM: r1(added.reduce((u, v) => u + v.lengthM, 0)), added, buildings: built, totalFeatures: ed.features.length, ...(opt['dry-run'] ? {} : { wrote: saveEdits(c.id, ed) }) };
};
C['import-osm'] = async ({ pos, opt }) => {
  const c = loadCourse(pos[0]), cen = needCentre(c), ed = loadEdits(c.id);
  const [sw, ne] = [toLatLon(cen, c.bbox[0], c.bbox[3]), toLatLon(cen, c.bbox[2], c.bbox[1])];
  const bb = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;
  // --cartpaths: only the course's own cart paths (golf=cartpath, golf=path), nothing else
  const q = opt.cartpaths ? `[out:json][timeout:55];(way["golf"~"^(cartpath|path)$"](${bb}););out geom tags;` : `[out:json][timeout:55];(way["golf"~"^(cartpath|path)$"](${bb});way["highway"~"^(path|footway|service|track|cycleway|pedestrian)$"](${bb});way["building"](${bb}););out geom tags;`;
  const res = await overpass(q);
  const have = new Set(ed.features.map((f) => f.src).filter(Boolean));
  const SURF = { asphalt: 'concrete', concrete: 'concrete', paved: 'concrete', gravel: 'gravel', fine_gravel: 'gravel', compacted: 'gravel', dirt: 'dirt', ground: 'dirt', earth: 'dirt', sand: 'sand' };
  const fresh = [], stats = { fetched: res.elements.length, pathsAdded: 0, buildingsAdded: 0, skippedExisting: 0, skippedInvalid: 0 };
  const probe = loadEdits(c.id); probe.features = ed.features.slice();
  for (const w of res.elements) {
    if (w.type !== 'way' || !w.geometry || w.geometry.length < 2) { stats.skippedInvalid++; continue; }
    const src = 'osm/' + w.id, t = w.tags || {};
    if (have.has(src)) { stats.skippedExisting++; continue; }
    const g = w.geometry.map((q) => fromLatLon(cen, q.lat, q.lon));
    let f;
    try {
      if (t.building) {
        const ring = g.length > 1 && g[0][0] === g[g.length - 1][0] && g[0][1] === g[g.length - 1][1] ? g.slice(0, -1) : g;
        if (ring.length < 3) { stats.skippedInvalid++; continue; }
        const R = minRect(ring); if (!R) { stats.skippedInvalid++; continue; }
        const hh = parseFloat(t.height), lv = parseFloat(t['building:levels']);
        const roofTag = { gabled: 'gable', hipped: 'hip', flat: 'flat', pyramidal: 'hip' }[t['roof:shape']] || 'gable';
        f = validate(c, { id: nextId(probe.features, 'b'), kind: 'building', name: t.name || 'building', at: [R.cx, R.cy], w: Math.min(120, Math.max(2, R.w)), d: Math.min(120, Math.max(2, R.d)),
          h: Math.min(20, Math.max(2, Number.isFinite(hh) ? hh : Number.isFinite(lv) ? lv * 3.2 : 4.5)), rot: R.rot, roof: roofTag, wall: '#e8dcc0', roofColour: '#8a3b2a',
          floors: Math.min(4, Math.max(1, Number.isFinite(lv) ? Math.round(lv) : 1)), src });
        stats.buildingsAdded++;
      } else {
        const small = t.golf === 'cartpath' || t.highway === 'service' || t.highway === 'track';
        const wd = parseFloat(t.width);
        if (polyLen(g) < 1) { stats.skippedInvalid++; continue; }
        f = validate(c, { id: nextId(probe.features, 'p'), kind: 'path', name: t.name || (t.golf === 'cartpath' ? 'cart path' : t.highway ? t.highway : 'path'), surface: SURF[t.surface] || (t.golf ? 'concrete' : 'gravel'),
          width: Number.isFinite(wd) && wd > 0 && wd <= 20 ? wd : small ? 2.4 : 1.6, pts: g, src });
        stats.pathsAdded++;
      }
    } catch (e) { if (e instanceof Fail) { stats.skippedInvalid++; continue; } throw e; }
    probe.features.push(f); fresh.push(f);
  }
  const out = { ok: true, course: c.id, dryRun: !!opt['dry-run'], ...stats, totalFeatures: ed.features.length + fresh.length };
  if (!opt['dry-run'] && fresh.length) { ed.features.push(...fresh); out.wrote = saveEdits(c.id, ed); }
  else if (!opt['dry-run']) out.wrote = [];
  return out;
};

// ---------------------------------------------------------------- picture
const FONT = {   // 5 x 7, rows top to bottom, '#' = on
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'], ',': ['.....', '.....', '.....', '.....', '..##.', '..#..', '.#...'], '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'], P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function encodePng(w, h, rgb) {
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
const hexRgb = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
class Img {
  constructor(w, h, bg) { this.w = w; this.h = h; this.b = Buffer.alloc(w * h * 3); for (let i = 0; i < w * h; i++) { this.b[i * 3] = bg[0]; this.b[i * 3 + 1] = bg[1]; this.b[i * 3 + 2] = bg[2]; } }
  px(x, y, c, a = 1) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return; const i = (y * this.w + x) * 3, b = this.b; if (a >= 1) { b[i] = c[0]; b[i + 1] = c[1]; b[i + 2] = c[2]; } else { b[i] += (c[0] - b[i]) * a; b[i + 1] += (c[1] - b[i + 1]) * a; b[i + 2] += (c[2] - b[i + 2]) * a; } }
  poly(pts, c, a = 1) {
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(this.h - 1, Math.ceil(y1));
    for (let y = y0; y <= y1; y++) {
      const yc = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const p = pts[i], q = pts[j]; if ((p[1] > yc) !== (q[1] > yc)) xs.push(p[0] + (yc - p[1]) / (q[1] - p[1]) * (q[0] - p[0])); }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) { const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5)); for (let x = xa; x <= xb; x++) this.px(x, y, c, a); }
    }
  }
  line(x0, y0, x1, y1, c, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 100000; n++) { this.px(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  thick(pts, wpx, c) {
    const hw = wpx / 2;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) continue;
      const nx = -(b[1] - a[1]) / L * hw, ny = (b[0] - a[0]) / L * hw;
      this.poly([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], c);
    }
    if (hw >= 1.5) for (const p of pts) this.poly(Array.from({ length: 12 }, (_, k) => [p[0] + Math.cos(k * Math.PI / 6) * hw, p[1] + Math.sin(k * Math.PI / 6) * hw]), c);
  }
  text(s, x, y, sc, c, back) {
    s = String(s).toUpperCase(); const wd = s.length * 6 * sc - sc;
    if (back) for (let yy = y - 1; yy < y + 7 * sc + 1; yy++) for (let xx = x - 1; xx < x + wd + 1; xx++) this.px(xx, yy, back, 0.65);
    for (let i = 0; i < s.length; i++) { const g = FONT[s[i]]; if (!g) continue; for (let r = 0; r < 7; r++) for (let q = 0; q < 5; q++) if (g[r][q] === '#') for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) this.px(x + (i * 6 + q) * sc + a, y + r * sc + b, c); }
    return wd;
  }
}
const SURF_COL = { gravel: [176, 165, 140], concrete: [196, 196, 200], dirt: [140, 104, 68], sand: [226, 206, 140] };
C.map = ({ pos, opt }) => {
  const c = loadCourse(pos[0]), ed = loadEdits(c.id);
  const s = opt['px-per-m'] === undefined ? 1 : num(opt['px-per-m'], '--px-per-m'); if (!(s > 0.05 && s <= 20)) fail('--px-per-m must be between 0.05 and 20');
  const grid = opt.grid === undefined ? 100 : num(opt.grid, '--grid'); if (!(grid > 0)) fail('--grid must be more than 0');
  let bb;
  if (opt.bbox !== undefined) { const v = String(opt.bbox).split(',').map(Number); if (v.length !== 4 || v.some((q) => !Number.isFinite(q))) fail('--bbox must be "x0,y0,x1,y1" in game metres'); bb = [Math.min(v[0], v[2]), Math.min(v[1], v[3]), Math.max(v[0], v[2]), Math.max(v[1], v[3])]; }
  else {
    bb = c.bbox.slice();
    for (const f of ed.features) for (const p of (f.kind === 'path' ? f.pts : [f.at])) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); }
    bb = [bb[0] - 20, bb[1] - 20, bb[2] + 20, bb[3] + 20];
  }
  const W = Math.ceil((bb[2] - bb[0]) * s), H = Math.ceil((bb[3] - bb[1]) * s);
  if (!(W >= 8 && H >= 8)) fail('the picture would be smaller than 8 px'); if (W * H > 30e6) fail(`the picture would be ${W} x ${H} px; lower --px-per-m or give a smaller --bbox`);
  const img = new Img(W, H, [52, 104, 48]), P = (p) => [(p[0] - bb[0]) * s, (p[1] - bb[1]) * s];
  const fill = (kind, col) => { for (const r of c.polys[kind]) img.poly(r.map(P), col); };
  fill('fairway', [104, 164, 74]); fill('water', [58, 118, 200]); fill('bunker', [232, 216, 152]); fill('tee', [158, 218, 118]); fill('green', [150, 238, 120]);
  // grid + edge labels
  const gc = [255, 255, 255], minPx = 64, k = Math.max(1, Math.ceil(minPx / (grid * s)));
  for (let gx = Math.ceil(bb[0] / grid) * grid, n = 0; gx <= bb[2]; gx += grid, n++) { const px = (gx - bb[0]) * s; img.line(px, 0, px, H - 1, gc, 0.22); if (Math.round(gx / grid) % k === 0) { const t = String(Math.round(gx)); img.text(t, Math.round(px) + 3, 3, 2, [255, 255, 255], [0, 0, 0]); img.text(t, Math.round(px) + 3, H - 17, 2, [255, 255, 255], [0, 0, 0]); } }
  for (let gy = Math.ceil(bb[1] / grid) * grid; gy <= bb[3]; gy += grid) { const py = (gy - bb[1]) * s; img.line(0, py, W - 1, py, gc, 0.22); if (Math.round(gy / grid) % k === 0) { const t = String(Math.round(gy)); img.text(t, 3, Math.round(py) + 3, 2, [255, 255, 255], [0, 0, 0]); img.text(t, W - t.length * 12 - 3, Math.round(py) + 3, 2, [255, 255, 255], [0, 0, 0]); } }
  for (const h of c.holes) { const a = P(h.tee), b = P(h.pin); img.line(a[0], a[1], b[0], b[1], [255, 255, 255], 0.75); }
  for (const f of ed.features) if (f.kind === 'path') {
    const pts = f.pts.map(P), col = SURF_COL[f.surface] || SURF_COL.gravel;
    img.thick(pts, Math.max(2, f.width * s), col);
    img.text(f.id, Math.round(pts[0][0]) + 4, Math.round(pts[0][1]) + 4, 2, [255, 255, 255], [0, 0, 0]);
  }
  for (const f of ed.features) if (f.kind === 'building') {
    const th = f.rot * Math.PI / 180, co = Math.cos(th), si = Math.sin(th);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => P([f.at[0] + (u * f.w / 2) * co - (v * f.d / 2) * si, f.at[1] + (u * f.w / 2) * si + (v * f.d / 2) * co]));
    img.poly(corners, hexRgb(f.roofColour));
    for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; img.thick([a, b], 2, [30, 20, 20]); }
    const reach = Math.max(...corners.map((q) => q[0])), cy = P(f.at)[1];
    img.text(f.id, Math.round(reach) + 4, Math.round(cy) - 7, 2, [255, 255, 255], [0, 0, 0]);
  }
  for (const h of c.holes) { const a = P(h.tee); img.text(h.n, Math.round(a[0]) + 5, Math.round(a[1]) - 16, 2, [255, 255, 0], [0, 0, 0]); }
  const file = opt.out && opt.out !== true ? path.resolve(String(opt.out)) : path.join(OUT, 'edits', c.id + '-map.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePng(W, H, img.b));
  return { ok: true, file, width: W, height: H, pxPerM: s, grid, bbox: { x0: r1(bb[0]), y0: r1(bb[1]), x1: r1(bb[2]), y1: r1(bb[3]), note: 'game metres, north (smallest y) at the top' }, features: ed.features.length };
};

// ---------------------------------------------------------------- main
(async () => {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const cmd = pos.shift() || 'help';
  let res;
  try {
    if (!C[cmd]) fail(`unknown command "${cmd}"; run help`);
    res = await C[cmd]({ pos, opt });
  } catch (e) {
    res = { ok: false, error: e instanceof Fail ? e.message : 'unexpected: ' + (e && e.stack || e) };
  }
  process.stdout.write(JSON.stringify(res, null, opt.pretty ? 2 : 0) + '\n');
  process.exitCode = res.ok ? 0 : 1;
})();
