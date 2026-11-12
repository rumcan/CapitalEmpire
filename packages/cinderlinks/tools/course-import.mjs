// Cinderlinks: turn a course saved by CapitalEmpire's map importer (the stage-1 JSON of src/game/golf/osm: OpenStreetMap shapes in metres, x east and
// y north of the course centre, plus a packed height grid) into the compact data the game loads (courses.js).
//   node tools/course-import.mjs courses/raw/*.json > out/courses.js
// The game's frame has y toward the camera (south), so every y is turned over here. Coordinates stay in REAL metres; the game shrinks them when it loads.
// The map data is OpenStreetMap's (ODbL 1.0): the credit and licence lines travel with each course and the game shows them.
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { pathToFileURL } from 'url';

const r1 = (v) => Math.round(v * 10) / 10;
const KIND = { tee: 'T', fairway: 'F', green: 'G', bunker: 'B', water_hazard: 'W', lateral_water_hazard: 'W', water: 'W' };

function unpackHeights(p) {   // CapitalEmpire's HeightPack (terrarium.ts): 16-bit units of q metres over base, a predictive delta, zigzag, two byte planes, raw deflate, base64
  if (!p || p.v !== 1) return null;
  const n = p.w * p.h, planes = zlib.inflateRawSync(Buffer.from(p.d, 'base64'));
  if (planes.length !== 2 * n) throw new Error('a height pack of the wrong size');
  const u = new Int32Array(n), out = new Uint16Array(n);
  for (let j = 0; j < p.h; j++) for (let i = 0; i < p.w; i++) {
    const k = j * p.w + i, z = planes[k] | (planes[n + k] << 8), r = z & 1 ? -((z + 1) >> 1) : z >> 1;
    const pred = i > 0 && j > 0 ? u[k - 1] + u[k - p.w] - u[k - p.w - 1] : i > 0 ? u[k - 1] : j > 0 ? u[k - p.w] : 0;
    u[k] = pred + r; out[k] = u[k];
  }
  let lo = 65535, hi = 0; for (const v of out) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return { x0: p.x0, y0: p.y0, step: p.step, w: p.w, h: p.h, base: p.base, q: p.q, d: Buffer.from(out.buffer).toString('base64'), reliefM: +((hi - lo) * p.q).toFixed(1), src: p.label || p.src || '', credit: p.credit || '' };
}

export function convert(j, file) {   // (also used by the build and by the harness's host scene)
  const F = j.features || {}, polys = { T: [], F: [], G: [], B: [], W: [] };
  for (const [kind, key] of Object.entries(KIND)) for (const ft of F[kind] || []) for (const p of ft.polys || []) {
    if (!p.outer || p.outer.length < 3) continue;
    const ring = []; for (const q of p.outer) ring.push(r1(q[0]), r1(-q[1]));
    polys[key].push(ring);
  }
  const streams = [];
  for (const ft of F.waterway || []) { if (!ft.line || ft.line.length < 2) continue; const l = []; for (const q of ft.line) l.push(r1(q[0]), r1(-q[1])); streams.push(l); }
  const pins = (F.pin || []).filter((p) => p.pos).map((p) => [p.pos[0], -p.pos[1]]);
  const byRef = new Map();
  for (const h of F.hole || []) {            // the first line of each number (a second course on the same land may repeat numbers)
    if (!h.line || h.line.length < 2 || !Number.isFinite(h.ref) || byRef.has(h.ref)) continue;
    const line = []; for (const q of h.line) line.push(r1(q[0]), r1(-q[1]));
    const ex = line[line.length - 2], ey = line[line.length - 1];
    let pin = [ex, ey], bd = 40; for (const p of pins) { const d = Math.hypot(p[0] - ex, p[1] - ey); if (d < bd) { bd = d; pin = [r1(p[0]), r1(p[1])]; } }
    let len = 0; for (let k = 2; k < line.length; k += 2) len += Math.hypot(line[k] - line[k - 2], line[k + 1] - line[k - 1]);
    byRef.set(h.ref, { n: h.ref, par: h.par >= 3 && h.par <= 5 ? h.par : len > 420 ? 5 : len > 220 ? 4 : 3, lenM: Math.round(len), line, pin });
  }
  const holes = [...byRef.values()].sort((a, b) => a.n - b.n);
  if (!holes.length) throw new Error(file + ': no hole lines (a course whose holes must be guessed is not handled here yet)');
  const m = j.meta || {};
  return { id: m.id || file.replace(/^.*[\\/]/, '').replace(/\.json$/, ''), name: (m.course && m.course.name) || m.id || 'Course', place: m.place || '', osm: (m.course && m.course.osm) || '',
    credit: m.credit || '© OpenStreetMap contributors', licence: m.licence || 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
    holes, polys, streams, hg: unpackHeights(j.height) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {   // run as a command (not imported)
  const out = [];
  for (const f of process.argv.slice(2)) {
    const c = convert(JSON.parse(fs.readFileSync(f, 'utf8')), f);
    out.push(c);
    process.stderr.write(`${c.id}: ${c.holes.length} holes, par ${c.holes.reduce((s, h) => s + h.par, 0)}, ${c.holes.reduce((s, h) => s + h.lenM, 0)} m; tees ${c.polys.T.length}, fairways ${c.polys.F.length}, greens ${c.polys.G.length}, bunkers ${c.polys.B.length}, water ${c.polys.W.length}, streams ${c.streams.length}; heights ${c.hg ? c.hg.w + ' x ' + c.hg.h + ' every ' + c.hg.step + ' m, relief ' + c.hg.reliefM + ' m (' + c.hg.src + ')' : 'none (flat)'}\n`);
  }
  process.stdout.write('// Cinderlinks: real courses, made by tools/course-import.mjs from CapitalEmpire\'s map importer. Map data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).\n');
  process.stdout.write('const COURSES = ' + JSON.stringify(out) + ';\n');
}
