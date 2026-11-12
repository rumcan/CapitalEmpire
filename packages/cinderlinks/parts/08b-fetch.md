## fetch Finding a real course
A real course can be fetched by name from inside the game: OpenStreetMap's search finds it, its map server gives the course's shapes, and the open height tiles give the ground. This is the same route CapitalEmpire's importer takes (its `docs/OSM-COURSES.md`), cut down to what Cinderlinks needs.
R: L asks for a course's name; `?find=<name>` does the same from the address. The game says what it is doing while it fetches, and why if it cannot.
R: The search is OpenStreetMap's Nominatim; only a result that is a golf course is taken. The shapes come from an Overpass server (three are tried in turn) for the course's bounding box: everything tagged golf, the water, the streams.
R: The heights are read from the open terrain tiles (Mapzen's, hosted by AWS) at zoom 15, one tile at a time, 30 tiles at most, sampled every 16 m and smoothed over 25 m.
R: A course with no mapped hole lines cannot be laid out, and the game says so. A course fetched is kept in the browser's storage (the last six) and joins the courses K steps through.
R: Nothing about the player is sent: only the name typed, and the map and tile addresses.
File: game.js
Check: function importCourse(

````js file=game.js

// ---- finding and fetching a real course (OpenStreetMap's search and map servers, the open height tiles)
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
let fetching = false;
const fr1 = (v) => Math.round(v * 10) / 10, pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function fetchJson(url, opt) { const r = await fetch(url, opt); if (!r.ok) throw new Error('the server answered ' + r.status); return r.json(); }
async function findCourse(q) {   // the first golf course the search knows by that name: where it is and its box
  const base = q.replace(/\b(golf|links|course|club|country|gc|cc)\b/gi, ' ').replace(/\s+/g, ' ').trim(), tries = [q]; let hit = null;   // the map may know it as a 'golf course' where the player typed 'golf links' (or a club): the name is tried each way
  for (const t of [base + ' golf course', base + ' golf club', base + ' country club', base + ' golf links']) if (base && !tries.includes(t)) tries.push(t);
  for (let k = 0; k < tries.length && !hit; k++) {
    if (k) await pause(1100);                                        // (the search asks for one question a second at most)
    const res = await fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=20&dedupe=0&q=' + encodeURIComponent(tries[k]));
    hit = res.find((r) => r.type === 'golf_course' && (r.osm_type === 'way' || r.osm_type === 'relation')) || null;
  }
  if (!hit) return null;
  const b = hit.boundingbox.map(Number);   // south, north, west, east
  return { type: hit.osm_type, id: +hit.osm_id, name: hit.name || q, lat: (b[0] + b[1]) / 2, lon: (b[2] + b[3]) / 2, box: b, place: (hit.display_name || '').split(',').slice(1, 4).map((s) => s.trim()).join(', ') };
}
async function overpass(q) {
  let err = null;
  for (const u of OVERPASS) { try { return await fetchJson(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); } catch (e) { err = e; } }
  throw err || new Error('no map server answered');
}
function stitch(pieces) {   // the ways of a shape's outline joined end to end into rings
  const out = [], left = pieces.map((p) => p.slice());
  while (left.length) {
    let cur = left.pop(), grew = true;
    while (grew) {
      grew = false; const a = cur[cur.length - 1];
      for (let k = 0; k < left.length; k++) { const p = left[k], f = p[0], l = p[p.length - 1]; if (f.lat === a.lat && f.lon === a.lon) { cur = cur.concat(p.slice(1)); left.splice(k, 1); grew = true; break; } if (l.lat === a.lat && l.lon === a.lon) { cur = cur.concat(p.slice(0, -1).reverse()); left.splice(k, 1); grew = true; break; } }
    }
    out.push(cur);
  }
  return out;
}
function osmToCourse(hit, els) {   // the map's answer -> a course as courses.js holds one (real metres, x east, y south of the course's middle)
  const kx = 6371008.8 * Math.cos(hit.lat * Math.PI / 180) * Math.PI / 180, ky = 6371008.8 * Math.PI / 180;
  const ring = (gm) => { const o = []; for (const g of gm) o.push(fr1((g.lon - hit.lon) * kx), fr1(-(g.lat - hit.lat) * ky)); return o; };
  const polys = { T: [], F: [], G: [], B: [], W: [] }, streams = [], byRef = new Map(), pins = [];
  for (const e of els) {
    const tg = e.tags || {}, golf = tg.golf;
    if (e.type === 'node') { if (golf === 'pin') pins.push([(e.lon - hit.lon) * kx, -(e.lat - hit.lat) * ky]); continue; }
    const geoms = e.type === 'way' ? (e.geometry ? [e.geometry] : []) : stitch((e.members || []).filter((m) => m.type === 'way' && m.geometry && m.role !== 'inner').map((m) => m.geometry));
    for (const gm of geoms) {
      if (!gm || gm.length < 2) continue;
      if (golf === 'hole') { const ref = parseInt(tg.ref, 10); if (ref >= 1 && !byRef.has(ref)) byRef.set(ref, { n: ref, par: +tg.par || 0, line: ring(gm) }); }
      else if (tg.waterway) streams.push(ring(gm));
      else { const key = golf === 'tee' ? 'T' : golf === 'fairway' ? 'F' : golf === 'green' ? 'G' : golf === 'bunker' ? 'B' : golf === 'water_hazard' || golf === 'lateral_water_hazard' || tg.natural === 'water' ? 'W' : null; if (key && gm.length >= 4) polys[key].push(ring(gm)); }
    }
  }
  const holes = [...byRef.values()].sort((a, b) => a.n - b.n);
  for (const h of holes) {
    const L = h.line, ex = L[L.length - 2], ey = L[L.length - 1]; let len = 0; for (let k = 2; k < L.length; k += 2) len += Math.hypot(L[k] - L[k - 2], L[k + 1] - L[k - 1]);
    h.pin = [ex, ey]; let bd = 40; for (const p of pins) { const d = Math.hypot(p[0] - ex, p[1] - ey); if (d < bd) { bd = d; h.pin = [fr1(p[0]), fr1(p[1])]; } }
    h.lenM = Math.round(len); if (!(h.par >= 3 && h.par <= 5)) h.par = len > 420 ? 5 : len > 220 ? 4 : 3;
  }
  return { id: 'osm-' + hit.type + '-' + hit.id, name: hit.name, place: hit.place, osm: hit.type + '/' + hit.id, credit: '© OpenStreetMap contributors', licence: 'Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
    holes, polys, streams, hg: null, fetched: true, lat: hit.lat, lon: hit.lon };
}
async function fetchHeights(C) {   // the real ground under the course, every 16 m, smoothed: packed as courses.js packs it
  const kx = 6371008.8 * Math.cos(C.lat * Math.PI / 180) * Math.PI / 180, ky = 6371008.8 * Math.PI / 180, step = 16, Z = 15, N = 2 ** Z;
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const see = (a) => { for (let k = 0; k < a.length; k += 2) { if (a[k] < x0) x0 = a[k]; if (a[k] > x1) x1 = a[k]; if (a[k + 1] < y0) y0 = a[k + 1]; if (a[k + 1] > y1) y1 = a[k + 1]; } };
  for (const key of ['T', 'F', 'G', 'B', 'W']) for (const r of C.polys[key]) see(r); for (const h of C.holes) see(h.line);
  x0 -= 160; y0 -= 160; x1 += 160; y1 += 160;
  const w = Math.ceil((x1 - x0) / step) + 1, h = Math.ceil((y1 - y0) / step) + 1, raw = new Float32Array(w * h), tiles = new Map();
  const pxOf = (x, y) => { const lon = C.lon + x / kx, lat = (C.lat - y / ky) * Math.PI / 180; return [(lon + 180) / 360 * N * 256, (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * N * 256]; };
  const need = new Set(); for (let j = 0; j < h; j += 4) for (let i = 0; i < w; i += 4) { const p = pxOf(x0 + i * step, y0 + j * step); need.add(Math.floor(p[0] / 256) + '/' + Math.floor(p[1] / 256)); }
  { const a = pxOf(x1, y1), b = pxOf(x0, y1), c = pxOf(x1, y0); for (const p of [a, b, c]) need.add(Math.floor(p[0] / 256) + '/' + Math.floor(p[1] / 256)); }
  if (need.size > 30) throw new Error('the course is too big for the height tiles (' + need.size + ')');
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const cx = cv.getContext('2d', { willReadFrequently: true });
  for (const key of need) {                                          // one tile at a time, a short pause between
    const im = new Image(); im.crossOrigin = 'anonymous'; im.src = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/' + Z + '/' + key + '.png';
    await im.decode(); cx.clearRect(0, 0, 256, 256); cx.drawImage(im, 0, 0); const d = cx.getImageData(0, 0, 256, 256).data, m = new Float32Array(65536);
    for (let k = 0; k < 65536; k++) m[k] = d[k * 4] * 256 + d[k * 4 + 1] + d[k * 4 + 2] / 256 - 32768;
    tiles.set(key, m); await pause(120);
  }
  const at = (px, py) => { const tx = Math.floor(px / 256), ty = Math.floor(py / 256), m = tiles.get(tx + '/' + ty); if (!m) return NaN; const ix = Math.min(255, Math.floor(px - tx * 256)), iy = Math.min(255, Math.floor(py - ty * 256)); return m[iy * 256 + ix]; };
  let last = 0; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const p = pxOf(x0 + i * step, y0 + j * step); let v = at(p[0], p[1]); if (v !== v) v = last; raw[j * w + i] = last = v; }
  const kr = 4, kw = []; let ks = 0; for (let k = -kr; k <= kr; k++) { const g = Math.exp(-k * k / (2 * 1.56 * 1.56)); kw.push(g); ks += g; }   // smoothed over 25 m (the raw heights have steps and noise)
  const tmp = new Float32Array(w * h), sm = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -kr; k <= kr; k++) { const ii = i + k < 0 ? 0 : i + k >= w ? w - 1 : i + k; s += raw[j * w + ii] * kw[k + kr]; } tmp[j * w + i] = s / ks; }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -kr; k <= kr; k++) { const jj = j + k < 0 ? 0 : j + k >= h ? h - 1 : j + k; s += tmp[jj * w + i] * kw[k + kr]; } sm[j * w + i] = s / ks; }
  let lo = 1e9, hi = -1e9; for (const v of sm) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const q = Math.max(0.01, Math.ceil((hi - lo) / 65000 * 1000) / 1000), u = new Uint8Array(w * h * 2);
  for (let k = 0; k < w * h; k++) { const v = Math.round((sm[k] - lo) / q); u[k * 2] = v & 255; u[k * 2 + 1] = v >> 8; }
  let bin = ''; for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
  return { x0: fr1(x0), y0: fr1(-y0), step, w, h, base: lo, q, d: btoa(bin), reliefM: +(hi - lo).toFixed(1), src: 'Mapzen terrain tiles (AWS)', credit: 'Terrain Tiles: Mapzen, hosted by AWS (SRTM, USGS 3DEP and others)' };
}
function keepCourses() { try { localStorage.setItem('cinderlinks.courses', JSON.stringify(MORE_COURSES.slice(-6))); } catch (e) { try { localStorage.setItem('cinderlinks.courses', JSON.stringify(MORE_COURSES.slice(-2))); } catch (e2) { /* too big to keep: it stays for this visit */ } } }
async function importCourse(q) {   // find a real course by name, fetch its layout and heights, and play it
  if (fetching || !q) return false; fetching = true;
  try {
    say('Looking for "' + q + '" ...', 1200);
    const hit = await findCourse(q); if (!hit) { say('No golf course found for "' + q + '"', 360); return false; }
    say('Found ' + hit.name + ': fetching its map ...', 1800);
    const b = hit.box, box = '(' + b[0] + ',' + b[2] + ',' + b[1] + ',' + b[3] + ')';
    const data = await overpass('[out:json][timeout:90];(nwr["golf"]' + box + ';nwr["natural"="water"]' + box + ';way["waterway"~"stream|river|canal|ditch|drain"]' + box + ';);out geom;');
    const C = osmToCourse(hit, data.elements || []);
    if (!C.holes.length) { say(hit.name + ' has no hole lines on the map yet: it cannot be laid out', 480); return false; }
    say(hit.name + ': ' + C.holes.length + ' holes. Fetching the heights ...', 1800);
    try { C.hg = await fetchHeights(C); } catch (e) { C.hg = null; say(hit.name + ': no heights (' + e.message + '); it is laid out flat', 300); }
    const old = MORE_COURSES.findIndex((c) => c.id === C.id); if (old >= 0) MORE_COURSES.splice(old, 1); MORE_COURSES.push(C); keepCourses();
    setCourse(C.id); firstPicture();
    return true;
  } catch (e) { say('Could not fetch the course: ' + (e && e.message ? e.message : e), 480); return false; }
  finally { fetching = false; }
}
function askCourse() { const q = typeof prompt === 'function' ? prompt('Find a real golf course: its name (and its town, if the name is a common one)') : null; if (q && q.trim()) importCourse(q.trim()); }
````
