## features Paths and buildings added to a course
A course's map can be added to from outside the game: `tools/cinderlinks-map.mjs` (made for AI agents; see `tools/MAP-CLI.md`) writes paths and buildings to `edits/<course>.json`, and the running game reads that file again every two seconds, so a change shows without a rebuild.
R: The file's metres are real ones in the game's frame (x east, y south of the course's centre); the game shrinks them by the course's own scale, as it does the course.
R: A path is laid on the ground as it is seen: every ground pixel near a path is asked where on the land it lies, and takes the path's colour if that is within the path's width. Nothing is added to the land's own data, so the land's makers and the workers know nothing of it.
R: Nothing grows on a path or inside a building: no standing grass, no bush, flower, rock or tree trunk.
R: A building is a box with a roof (gable, hip or flat) with courses of tiles, a ridge, eaves and a chimney; windows by floor in frames with sills and glazing bars, a door, a plinth and a band between floors, drawn as flat faces lit by the one sun, in front of and behind things by its true depth; it throws its shadow where the sun reaches it.
R: A concrete path is laid in slabs (a joint across it every 1.7 m, each slab its own shade); any path may carry a fallen leaf here and there; none has flecks or stains.
R: A floodlight tower (a `light` feature: its place, its height, its reach; #1200) is drawn as a mast on a plinth with a lamp head of lamp panels. By day and golden hour the panels are plain glass; at dusk and at night they shine, with a soft bloom round each. At dusk and night every tower lights the ground, the trees, the buildings and the golfers within its reach: a pool of warm white light, brightest at the mast and fading smoothly to nothing at its reach, many towers adding up. What no tower reaches stays as dark as the night.
R: Bare earth (a pad of `earth`: a range's outfield before it is grassed) is mottled, drier and darker in slow patches, with a fine grain and a pebble here and there; a hitting mat (`turf`) is green artificial grass in fine rows, no leaves on it. A later pad lies over an earlier one (the mat on the slab).
R: A pad (a path feature with `ring`: J6b, the practice range's concrete slabs, dirt yards and car park) is laid whole: everything inside its ring takes its surface, its edge as a path's edge.
R: J6c: while he practises, a still picture's pad pass is not made again: what it painted is kept and put back while the camera, the light, the pads and the ground's depth are the same as in the frame before (pixel for pixel what making it again would paint), so the bare outfield's earth costs a still picture nothing.
R: J6d: the pad pass of a moving picture costs the bare outfield's earth little: the same pixels, made without asking the pad grid for each of them. While he practises, a pixel whose nearest grid cell is deep inside a pad (the cell and its eight neighbours more than the edge's width in) is inside it with no edge shade, and a whole 8 x 8 block whose pixels can only fall in deep cells of one pad is that pad's, with no cell asked for any pixel of it (a slab, which asks for its stretch, is asked for each); the nearest cell is found without Math.round, which costs 6 ns a call, and the air's haze is read from a table of the same function.
R: #1308: a fence (a `building` of use `fence`: the host sends one per run, a building w long, 0.12 m thick, turned to its axis, h high, its wall colour; the host's runs are the map's fence pieces that touch end to end, on the range and on a hole) is built, never drawn as a picture: a post every 3 m or so evenly along it, each standing on the ground under it, a rail along the top, and between the posts see-through wire (a chain-link's fine checker, a picket's gaps, an iron fence's bars), 1.8 m high for a chain-link. It is upright and the same from every side; it casts no shadow of its own.
R: #1308 (the owner: "this building is skew as F"): the range's big pictures of buildings are drawn as the view's own boxes, never as flat pictures stood up facing the camera (the game's pictures are drawn for one turn of the map and look sheared from every other side): a `hut` (the shop in cream panels with a corrugated roof, the coffee kiosk, the ball dispenser, the caravan, a shed: a box of its real footprint, upright, flat roof, a door and windows) and a `shelter` (the hitting deck: a flat roof on posts). A house is its own `house` box. Signs, boards, bins and the like stay pictures.
R: A course without the file plays as before.
File: game.js
Check: function lampLight(
Check: function padDeep(
Check: let padKeep
Check: function drawPaths(
Check: function drawBuildings(
Check: function fenceFaces(
Check: function shelterFaces(
Check: function setFeatures(
Check: function padSd(

````js file=game.js

// ---- paths and buildings added to a course (the edits file made by tools/cinderlinks-map.mjs)
const SURF = { gravel: [198, 186, 160], concrete: [216, 210, 196], dirt: [152, 118, 86], sand: [228, 210, 164], earth: [188, 126, 74], turf: [70, 150, 62] };   // (J6c: earth, a bare range's outfield; turf, a hitting mat)
const PLEAF = [[204, 128, 44], [168, 92, 40], [196, 170, 62], [122, 134, 58]];
let feats = null, featTxt = '', featFor = '';
function hexRgb(h, d) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return d; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function setFeatures(F) {   // F: the edits file's object (or nothing): made ready to draw, in the game's own metres
  feats = null; featFor = course ? course.id : '';
  if (!F || !course || !Array.isArray(F.features)) return;
  const S = course.S, paths = [], builds = [], lamps = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of F.features) {
    if (!f) continue;
    if (f.kind === 'path' && Array.isArray(f.pts) && f.pts.length > 1) {
      const p = { hw: f.ring ? 0 : Math.max(1.5, (+f.width || 2.4) * S * 1.3) / 2, col: SURF[f.surface] || SURF.gravel, slab: f.surface === 'concrete', soil: f.surface === 'earth', mat: f.surface === 'turf', pts: [], ring: !!f.ring };   // (J6b: ring, a pad laid whole; J6c: soil and mat, their own grain)
      for (const q of f.pts) { const x = +q[0] * S, y = +q[1] * S; if (!(x === x && y === y)) continue; p.pts.push(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (p.pts.length >= 4) paths.push(p);
    } else if (f.kind === 'building' && Array.isArray(f.at)) {
      const x = +f.at[0] * S, y = +f.at[1] * S; if (!(x === x && y === y)) continue;
      const fen = f.use === 'fence', small = f.use === 'hut' || f.use === 'shelter';   // (#1308: a run of fence: long, thin and low: its own limits; a hut or a shelter may be small)
      builds.push({ x, y, w: fen ? clamp(+f.w || 3, 0.5, 600) * S : clamp(+f.w || 10, small ? 0.8 : 2, 120) * S, d: fen ? clamp(+f.d || 0.12, 0.05, 0.5) * S : clamp(+f.d || 8, small ? 0.8 : 2, 120) * S, h: fen ? clamp(+f.h || 1.8, 0.6, 4) * Math.max(S, 0.8) : clamp(+f.h || 4.5, small ? 1.2 : 2, 20) * Math.max(S, 0.8), rot: (+f.rot || 0) * Math.PI / 180, roof: f.roof || 'gable',
        wall: hexRgb(f.wall, [232, 220, 192]), rc: hexRgb(f.roofColour, [138, 59, 42]), floors: clamp(Math.round(+f.floors || 1), 1, 4), faces: null, use: typeof f.use === 'string' ? f.use : '', fk: /picket/i.test(f.name || '') ? 2 : /iron/i.test(f.name || '') ? 3 : 1 });
    } else if (f.kind === 'light' && Array.isArray(f.at)) {   // #1200: a floodlight tower: a mast with its lamp head (a building of use 'light'), and a lamp that lights the ground within its reach
      const x = +f.at[0] * S, y = +f.at[1] * S; if (!(x === x && y === y)) continue;
      const u = Math.max(S, 0.8), h = clamp(+f.h || 14, 4, 40) * u, reach = clamp(+f.reach || 75, 10, 200) * S;
      builds.push({ x, y, w: 1, d: 1, h, rot: 0, roof: 'flat', wall: [92, 98, 108], rc: [60, 64, 72], floors: 1, faces: null, use: 'light', u });
      lamps.push({ x, y, h, reach, r2: reach * reach, z: undefined });
    }
  }
  for (const B of builds) if (B.use === 'stand' || B.use === 'board') faceStand(B);   // (a grandstand or a scoreboard turned to its green or tee: parts/08h-dress.md)
  let sd = null, kind = null, seg = null, gw = 0, gh = 0, res = 0.5; const SG = [];   // (SG: every stretch of every path: its start, its run, its length squared, how far along its path it starts, its length)
  if (paths.length) {                                               // how far every place near a path is from the path's edge (below 0: on it), on a grid
    x0 -= 6; y0 -= 6; x1 += 6; y1 += 6; while (((x1 - x0) / res) * ((y1 - y0) / res) > 3e6) res *= 2;
    gw = Math.ceil((x1 - x0) / res) + 1; gh = Math.ceil((y1 - y0) / res) + 1; sd = new Float32Array(gw * gh).fill(9); kind = new Uint8Array(gw * gh); seg = new Uint16Array(gw * gh);
    paths.forEach((p, pi) => {
      if (p.ring) { padSd(p, pi, x0, y0, gw, gh, res, sd, kind, seg, SG); return; }   // (J6b: a pad: inside it below 0)
      let acc = 0;
      for (let s = 0; s + 3 < p.pts.length; s += 2) {
        const ax = p.pts[s], ay = p.pts[s + 1], bx = p.pts[s + 2], by = p.pts[s + 3], ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-6, m = p.hw + 3.5, si = Math.min(65535, SG.length / 7);
        SG.push(ax, ay, ex, ey, L2, acc, Math.sqrt(L2)); acc += Math.sqrt(L2);
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - x0) / res)), i1 = Math.min(gw - 1, Math.ceil((Math.max(ax, bx) + m - x0) / res)), j0 = Math.max(0, Math.floor((Math.min(ay, by) - m - y0) / res)), j1 = Math.min(gh - 1, Math.ceil((Math.max(ay, by) + m - y0) / res));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = x0 + i * res, y = y0 + j * res; let t = ((x - ax) * ex + (y - ay) * ey) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(x - ax - ex * t, y - ay - ey * t) - p.hw, k = j * gw + i; if (d < sd[k]) { sd[k] = d; kind[k] = pi & 255; seg[k] = si; }
        }
      }
    });
  }
  let bmap = null;                                                  // the buildings by 16 m square, to ask quickly what stands at a place
  if (builds.length) { bmap = new Map(); for (const B of builds) { const r = Math.hypot(B.w, B.d) / 2 + 1; for (let j = Math.floor((B.y - r) / 16); j <= Math.floor((B.y + r) / 16); j++) for (let i = Math.floor((B.x - r) / 16); i <= Math.floor((B.x + r) / 16); i++) { const k = (i + 4096) * 8192 + j + 4096; let L = bmap.get(k); if (!L) bmap.set(k, L = []); L.push(B); } } }
  feats = { paths, builds, lamps, sd, kind, seg, SG: Float64Array.from(SG), gx0: x0, gy0: y0, res, gw, gh, bmap, deep: null, utile: null, utw: 0 };
}
function padSd(p, pi, x0, y0, gw, gh, res, sd, kind, seg, SG) {   // J6b: a pad's distances: inside the ring below 0 (how far in), outside the distance to its edge
  const P = p.pts, n = P.length >> 1, si = Math.min(65535, SG.length / 7); if (n < 3) return;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9, acc = 0;
  for (let a = 0; a < n; a++) { const ax = P[2 * a], ay = P[2 * a + 1], b = (a + 1) % n, ex = P[2 * b] - ax, ey = P[2 * b + 1] - ay, L2 = ex * ex + ey * ey || 1e-6; SG.push(ax, ay, ex, ey, L2, acc, Math.sqrt(L2)); acc += Math.sqrt(L2);
    if (ax < bx0) bx0 = ax; if (ax > bx1) bx1 = ax; if (ay < by0) by0 = ay; if (ay > by1) by1 = ay; }
  const m = 3.5, i0 = Math.max(0, Math.floor((bx0 - m - x0) / res)), i1 = Math.min(gw - 1, Math.ceil((bx1 + m - x0) / res)), j0 = Math.max(0, Math.floor((by0 - m - y0) / res)), j1 = Math.min(gh - 1, Math.ceil((by1 + m - y0) / res));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = x0 + i * res, y = y0 + j * res; let inside = false, dm = 1e9;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const ax = P[2 * a], ay = P[2 * a + 1], bx = P[2 * b], by = P[2 * b + 1];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1e-6; let t = ((x - ax) * ex + (y - ay) * ey) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - ax - ex * t, y - ay - ey * t); if (d < dm) dm = d;
    }
    const d = inside ? -dm : dm, k = j * gw + i; if (inside ? true : d < sd[k] && sd[k] >= 0) { sd[k] = inside && sd[k] < 0 ? Math.max(d, sd[k]) : d; kind[k] = pi & 255; seg[k] = si; }   // (J6c: a later pad lies over an earlier one: the mat on the slab)
  }
}
function pollFeatures() {   // the edits file read again; a change in it shows within two seconds
  if (!course || typeof fetch !== 'function' || hostMode()) return;   // (in host mode the host page's features are the course's: no file)
  const id = course.id;
  fetch('edits/' + id + '.json?t=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).then((t) => {
    if (!course || course.id !== id || (t === featTxt && featFor === id)) return;
    featTxt = t; let F = null; try { F = t ? JSON.parse(t) : null; } catch (e) { F = null; }
    setFeatures(F);
  }).catch(() => {});
}
if (typeof document !== 'undefined' && typeof location !== 'undefined' && /^http/.test(location.protocol || '')) { setInterval(pollFeatures, 2000); setTimeout(pollFeatures, 300); }

function pathSd(x, y) {
  const F = feats, gx = (x - F.gx0) / F.res, gy = (y - F.gy0) / F.res; if (!(gx >= 0 && gy >= 0 && gx < F.gw - 1 && gy < F.gh - 1)) return 9;
  const i = gx | 0, j = gy | 0, a = gx - i, b = gy - j, k = j * F.gw + i, s = F.sd; return (s[k] * (1 - a) + s[k + 1] * a) * (1 - b) + (s[k + F.gw] * (1 - a) + s[k + F.gw + 1] * a) * b;
}
function pathNearPx(u, v, r) { return pathSd(u / PPM, v / PPV) < r; }   // (asked from drawGround in ground pixels: the sums are kept out of that function, which the browser stops optimising when small pieces of arithmetic are written into it)
const PSB = new Float32Array(CLW * CLH);
// J6c: while he practises the picture stands still most of the time (the golfer is held to his spot): what the pad pass painted (each pixel and its colour) is kept, and put back
// while the camera, the light, the pads and the ground's depth are what they were in the frame before, not made again (the bare outfield is a pad: its earth cost 3 to 4 ms a frame)
let padKeep = null;
// J6d: the pad pass made cheaper on a moving picture, to the very same pixels (3 ms of its 7 were the bare outfield's earth). A cell of the pad grid is deep when it and its eight neighbours are all
// inside a pad by more than the edge's width (0.12 m): a pixel whose nearest cell is deep is inside it, with no edge shade, without asking the grid between its cells (made once, while he practises).
// The air's haze by a pixel's depth is a table of the same function; the soil's value noise keeps its four lattice values while the pixels stay in one 2.6 m cell, as a row of them does for tens of pixels.
function padDeep(F) {
  const gw = F.gw, gh = F.gh, sd = F.sd, out = new Uint8Array(gw * gh), E = -0.12;
  for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) {
    const k = j * gw + i;
    if (sd[k] < E && sd[k - 1] < E && sd[k + 1] < E && sd[k - gw] < E && sd[k - gw - 1] < E && sd[k - gw + 1] < E && sd[k + gw] < E && sd[k + gw - 1] < E && sd[k + gw + 1] < E) out[k] = 1;
  }
  // and the grid by tiles of 8 x 8 cells: a tile whose cells are all deep and of one kind says which (kind + 1; 0: not), for the far blocks, which cover too many cells to look at one by one
  const tw = (gw + 7) >> 3, th = (gh + 7) >> 3, ut = new Uint16Array(tw * th), kind = F.kind;
  for (let tj = 0; tj < th; tj++) for (let ti = 0; ti < tw; ti++) {
    const j0 = tj * 8, i0 = ti * 8, j1 = Math.min(gh, j0 + 8), i1 = Math.min(gw, i0 + 8), k0 = kind[j0 * gw + i0]; let ok = true;
    for (let j = j0; ok && j < j1; j++) for (let i = i0; i < i1; i++) { const c = j * gw + i; if (out[c] === 0 || kind[c] !== k0) { ok = false; break; } }
    if (ok) ut[tj * tw + ti] = k0 + 1;
  }
  F.utile = ut; F.utw = tw;
  return out;
}
let hazeFor = '', hazeLut = null;
function hazeTable() {   // farHaze(depth) for every depth the buffer holds (centimetres)
  const k = HZK + ',' + BSAND; if (hazeLut && hazeFor === k) return hazeLut;
  hazeFor = k; if (!hazeLut) hazeLut = new Float64Array(65536);
  for (let z = 0; z < 65536; z++) hazeLut[z] = farHaze(z * 0.01);
  return hazeLut;
}
const SOIL_T = new Uint8Array(256), SOIL_P = new Uint8Array(256);   // (what each of ih's 256 values makes of the grain: its step, and the pebble: 1 dark, 2 light)
for (let g = 0; g < 256; g++) { SOIL_T[g] = (g % 7) * 3; SOIL_P[g] = g % 41 === 0 ? 1 : g % 53 === 1 ? 2 : 0; }
const soilK = { xi: 1e9, yi: 1e9, a: 0, b: 0, c: 0, d: 0 };
function soilNoise(wx, wy) {   // vnoise(wx / 2.6, wy / 2.6, 913): the same numbers
  const x = wx / 2.6, y = wy / 2.6, xi = Math.floor(x), yi = Math.floor(y), K = soilK;
  if (xi !== K.xi || yi !== K.yi) { K.xi = xi; K.yi = yi; K.a = hash2(xi, yi, 913); K.b = hash2(xi + 1, yi, 913); K.c = hash2(xi, yi + 1, 913); K.d = hash2(xi + 1, yi + 1, 913); }
  const xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), a = K.a, b = K.b, c = K.c;
  return a + (b - a) * u + (c - a) * v + (a - b - c + K.d) * u * v;
}
function drawPaths() {   // the picture gone over in 8 x 8 blocks: only blocks near a path are looked at pixel by pixel
  const F = feats; if (!F || !F.sd || !course || featFor !== course.id) return;
  let rec = null;
  if (PRAC) {
    const K = padKeep || (padKeep = { F: null, k: [], p: null, z: new Uint16Array(VW * VH), n: 0, hits: 0, idx: new Int32Array(VW * VH), col: new Uint32Array(VW * VH) }), k = [camX, camY, FX, FY, RX, RY, FOC, tmode, BSAND, HZK];
    let held = K.p !== null; for (let i = 0; held && i < k.length; i++) if (K.p[i] !== k[i]) held = false; K.p = k;   // (J6d: held: the camera stood as it does the frame before too; only then is a picture kept, as one that moves is not asked for again)
    let same = K.F === F; for (let i = 0; same && i < k.length; i++) if (K.k[i] !== k[i]) same = false;
    if (same) { const z = K.z; for (let i = 0; i < z.length; i++) if (z[i] !== zbuf[i]) { same = false; break; } }
    if (same) { const idx = K.idx, col = K.col; for (let n = 0; n < K.n; n++) { const q = idx[n]; fb[q] = ((fb[q] & 0xff000000) | col[n]) >>> 0; } K.hits++; return; }
    K.F = null; K.k = k; K.n = 0; rec = held ? K : null;
  }
  for (let j = 0; j < CLH; j++) for (let i = 0; i < CLW; i++) {
    const X = i * 8 < VW ? i * 8 : VW - 1, Y = j * 8 < VH ? j * 8 : VH - 1, z = zbuf[Y * VW + X];
    if (z === 65535) { PSB[j * CLW + i] = 99; continue; }
    const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC; PSB[j * CLW + i] = pathSd(camX + FX * d + RX * lat, camY + FY * d + RY * lat);
  }
  const L = 150, lr = LR[L], lg = LG[L], lb = LB[L];
  const gx0 = F.gx0, gy0 = F.gy0, res = F.res, gw = F.gw, gh = F.gh, sdA = F.sd, kindA = F.kind, segA = F.seg, SG = F.SG, paths = F.paths, H0 = TOD[tmode].haze[0], H1 = TOD[tmode].haze[1], H2 = TOD[tmode].haze[2], HL = hazeTable();   // (J6d: asked once, not a pixel at a time)
  const ridx = rec ? rec.idx : null, rcol = rec ? rec.col : null; let rn = 0;   // (the pass kept for a still picture: its pixels and colours, written as they are made)
  const deep = PRAC ? (F.deep || (F.deep = padDeep(F))) : null, gwd = gw - 2, ghd = gh - 2, utile = F.utile, utw = F.utw;   // (J6d: the deep cells and tiles, while he practises)
  let lix = -999, liy = -999, lck = 0, lpk = 0, lP0 = null;   // (the last deep cell asked of and its pad: a row of pixels stays in one cell for many)
  for (let j = 0; j < CLH - 1; j++) for (let i = 0; i < CLW - 1; i++) {
    const k = j * CLW + i, a = PSB[k], b = PSB[k + 1], c = PSB[k + CLW], e = PSB[k + CLW + 1], lo = Math.min(a, b, c, e); if (lo > 2.5) continue;
    const X0 = i * 8, Y0 = j * 8, Y1 = Math.min(VH, Y0 + 8), X1 = Math.min(VW, X0 + 8);
    // J6d: a block deep inside one pad (no slab: that asks the grid for its stretch): the cells its pixels can fall in, all of them deep and of one kind, tell it so, and no pixel of it need be asked
    let uni = -1;
    if (deep !== null && a < -0.5 && b < -0.5 && c < -0.5 && e < -0.5) {
      let zmn = 65534, zmx = 0, sky = false;
      for (let Y = Y0; Y < Y1; Y++) { const o = Y * VW; for (let X = X0; X < X1; X++) { const z = zbuf[o + X]; if (z === 65535) sky = true; else { if (z < zmn) zmn = z; if (z > zmx) zmx = z; } } }
      if (!sky) {                                              // (a pixel's place is bilinear in its column and depth: the box its four extremes make holds them all)
        const d0 = zmn * 0.01, d1 = zmx * 0.01, xa = (X0 + 0.5 - VW / 2) / FOC, xb = (X1 - 0.5 - VW / 2) / FOC;
        const p0x = camX + d0 * (FX + RX * xa), p0y = camY + d0 * (FY + RY * xa), p1x = camX + d0 * (FX + RX * xb), p1y = camY + d0 * (FY + RY * xb);
        const p2x = camX + d1 * (FX + RX * xa), p2y = camY + d1 * (FY + RY * xa), p3x = camX + d1 * (FX + RX * xb), p3y = camY + d1 * (FY + RY * xb);
        const ga = (Math.min(p0x, p1x, p2x, p3x) - gx0) / res, gb = (Math.max(p0x, p1x, p2x, p3x) - gx0) / res, ha = (Math.min(p0y, p1y, p2y, p3y) - gy0) / res, hb = (Math.max(p0y, p1y, p2y, p3y) - gy0) / res;
        if (ga >= 3 && ha >= 3 && gb < gwd - 3 && hb < ghd - 3) {
          const ia = ((ga + 0.5) | 0) - 1, ib = ((gb + 0.5) | 0) + 1, ja = ((ha + 0.5) | 0) - 1, jb = ((hb + 0.5) | 0) + 1;   // (a cell wider each way)
          const nc = (ib - ia + 1) * (jb - ja + 1);
          if (nc <= 60) {
            const k0 = kindA[ja * gw + ia]; let ok = !paths[k0].slab;
            for (let jj = ja; ok && jj <= jb; jj++) for (let ii = ia, cc = jj * gw + ia; ii <= ib; ii++, cc++) if (deep[cc] === 0 || kindA[cc] !== k0) { ok = false; break; }
            if (ok) uni = k0;
          } else if (nc <= 4096) {                             // too many cells to look at one by one: by the tiles that hold them
            const ta = ia >> 3, tb = ib >> 3, ua = ja >> 3, ub = jb >> 3, u0 = utile[ua * utw + ta]; let ok = u0 !== 0 && !paths[u0 - 1].slab;
            for (let tj = ua; ok && tj <= ub; tj++) for (let ti = ta, tc = tj * utw + ta; ti <= tb; ti++, tc++) if (utile[tc] !== u0) { ok = false; break; }
            if (ok) uni = u0 - 1;
          }
        }
      }
    }
    const Pu = uni >= 0 ? paths[uni] : null;
    for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) {
      const q = Y * VW + X, z = zbuf[q]; if (z === 65535) continue;
      const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC, wx = camX + FX * d + RX * lat, wy = camY + FY * d + RY * lat;
      let s = -1, ck = -1, pk = 0, P0 = null;                  // (s: how far inside the pad it is, as pathSd gives it; a deep cell's pixel is inside by more than the edge's width: -1)
      if (Pu !== null) { pk = uni; P0 = Pu; }
      else {
        const gx = (wx - gx0) / res, gy = (wy - gy0) / res, ix = (gx + 0.5) | 0, iy = (gy + 0.5) | 0;   // (ix, iy: the nearest cell: Math.round, which costs 6 ns a call here, for a point inside the grid)
        if (ix === lix && iy === liy) { ck = lck; pk = lpk; P0 = lP0; }
        else {
          if (deep !== null && ix >= 1 && iy >= 1 && ix < gwd && iy < ghd) { ck = iy * gw + ix; if (deep[ck] === 0) ck = -1; }
          if (ck >= 0) { lix = ix; liy = iy; lck = ck; lpk = pk = kindA[ck]; lP0 = P0 = paths[pk]; }
          else {                                               // between the grid's cells: asked of the four round it, as pathSd does
            if (!(gx >= 0 && gy >= 0 && gx < gw - 1 && gy < gh - 1)) continue;
            const gi = gx | 0, gj = gy | 0, fx = gx - gi, fy = gy - gj, gk = gj * gw + gi;
            s = (sdA[gk] * (1 - fx) + sdA[gk + 1] * fx) * (1 - fy) + (sdA[gk + gw] * (1 - fx) + sdA[gk + gw + 1] * fx) * fy; if (s >= 0) continue;
            ck = iy * gw + ix; pk = kindA[ck]; P0 = paths[pk];
          }
        }
      }
      const col = P0.col;
      let t = 256, r0 = col[0], g0 = col[1], b0 = col[2];
      if (P0.slab) {                                           // concrete laid in slabs: a joint across the path every 1.7 m, each slab a shade of its own
        const o = segA[ck] * 7, G = SG; let tt = ((wx - G[o]) * G[o + 2] + (wy - G[o + 1]) * G[o + 3]) / G[o + 4]; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const al = (G[o + 5] + tt * G[o + 6]) / 1.7, sl = Math.floor(al); t = al - sl < 0.05 ? 182 : 236 + (ih(sl, pk * 7 + 3) % 5) * 8;
      }
      if (P0.soil) {                                           // J6c: bare earth: a slow mottle of drier and darker ground, fine grain, a pebble here and there
        const m = soilNoise(wx, wy), g = ih(Math.floor(wx * 7), Math.floor(wy * 7)), pb = SOIL_P[g]; t = 206 + ((m * 64) | 0) + SOIL_T[g];
        if (pb === 1) { r0 = 120; g0 = 96; b0 = 78; } else if (pb === 2) { r0 = 222; g0 = 196; b0 = 160; }
      } else if (P0.mat) t = 228 + (Math.floor((wx + wy) * 9) & 1) * 14 + (ih(Math.floor(wx * 12), Math.floor(wy * 12)) % 5) * 3;   // J6c: a hitting mat's fine rows of artificial grass
      if (s > -0.12) t = (t * 216) >> 8;                       // its edge, a shade darker
      if (!P0.mat) { const lx = Math.floor(wx * 6), ly = Math.floor(wy * 6); if (ih(lx, ly) < 4) { const lf = PLEAF[ih(lx + 9, ly + 5) & 3]; r0 = lf[0]; g0 = lf[1]; b0 = lf[2]; t = 256; } }   // a fallen leaf here and there (no flecks or stains)
      let r = (r0 * t * lr) >> 16, g = (g0 * t * lg) >> 16, bl = (b0 * t * lb) >> 16;
      if (d > 50) { const hf = HL[z]; if (hf > 0) { r += (H0 - r) * hf; g += (H1 - g) * hf; bl += (H2 - bl) * hf; } }   // (HL[z]: farHaze(d), tabled)
      const rgb = ((bl > 255 ? 255 : bl) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r);
      fb[q] = ((fb[q] & 0xff000000) | rgb) >>> 0;   // (the top byte kept: a tree's shadow still falls across the path)
      if (ridx !== null) { ridx[rn] = q; rcol[rn++] = rgb; }
    }
  }
  if (rec) { rec.n = rn; rec.z.set(zbuf); rec.F = F; }
}

// #1200: a floodlight tower's faces: a plinth, a square mast, and a lamp head: a dark box with two rows of three lamp panels on each side (emit 2: they shine at dusk and night)
function lightFaces(B, P, N, add, zm) {
  const u = B.u, m = 0.2 * u, bw = 0.5 * u, hw = 1.5 * u, zt = zm + B.h, zh0 = zt - 1.1 * u, zh1 = zt + 0.7 * u;
  const SIDES = [[-1, -1, 1, -1, 0, -1], [1, -1, 1, 1, 1, 0], [1, 1, -1, 1, 0, 1], [-1, 1, -1, -1, -1, 0]];   // (a side: from its corner to the next, in half widths, and its facing)
  const post = (h, z0, z1, col) => { for (const [a0, f0, a1, f1, na, nf] of SIDES) add([P(a0 * h, f0 * h, z0), P(a1 * h, f1 * h, z0), P(a1 * h, f1 * h, z1), P(a0 * h, f0 * h, z1)], N(na, nf, 0), col, 0); };
  post(bw, zm - 0.4, zm + 0.5 * u, [78, 82, 90]); post(m, zm + 0.5 * u, zh0, [104, 110, 120]); post(hw, zh0, zh1, [46, 50, 58]);
  for (const [a0, f0, a1, f1, na, nf] of SIDES) {
    const len = Math.hypot(a1 - a0, f1 - f0) * hw, ua = (a1 - a0) / 2, uf = (f1 - f0) / 2, n = N(na, nf, 0), rh = (zh1 - zh0) / 2;   // (ua, uf: the side's run, a unit along it)
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const s0 = (c + 0.12) / 3 * len, s1 = (c + 0.88) / 3 * len, zl = zh0 + r * rh + rh * 0.14, zh = zh0 + (r + 1) * rh - rh * 0.14, o = 0.05 * u;
      const pa = (s, z) => P(a0 * hw + ua * s + na * o, f0 * hw + uf * s + nf * o, z);
      add([pa(s0, zl), pa(s1, zl), pa(s1, zh), pa(s0, zh)], n, [190, 206, 226], 8, 2);
    }
  }
  add([P(-hw, -hw, zh1), P(hw, -hw, zh1), P(hw, hw, zh1), P(-hw, hw, zh1)], [0, 0, 1], [74, 78, 88]);
}
// #1308: a run of fence (the owner: "fences on the side of the range are not working": the game's fence pictures are drawn for one turn of the map and stood up as flat
// panels facing the camera, floating a piece apart). Here it is built as the world has it: a post every 3 m or so, evenly along the run, each standing on the ground under it, a top
// rail on the posts, and between them the wire: a quad drawn see-through (a chain-link's fine checker, a picket's gaps, an iron fence's bars: `mesh`), 1.8 m for chain-link.
// Every part is a flat face drawn by drawBuildings, so it is right from any side and hides what is behind it only where it is solid. Five faces a bay; at 3 m a bay, a 100 m side is 170.
function fenceFaces(B, P, faces) {
  const w = B.w, h = B.h, nb = Math.max(1, Math.round(w / 3)), st = w / nb, hp = 0.07, mm = B.fk || 1, up = [0, 0, 1];
  const pc = [B.wall[0] * 0.6, B.wall[1] * 0.6, B.wall[2] * 0.6], wc = mm === 1 ? [B.wall[0], B.wall[1], B.wall[2]] : B.wall;
  const G = []; for (let i = 0; i <= nb; i++) { const q = P(-w / 2 + i * st, 0, 0); G.push(groundH(q[0], q[1])); }
  for (let i = 0; i <= nb; i++) {
    const a = -w / 2 + i * st, g = G[i] - 0.06, zt = G[i] + h + 0.1;
    faces.push({ pts: [P(a - hp, 0, g), P(a + hp, 0, g), P(a + hp, 0, zt), P(a - hp, 0, zt)], n: up, col: pc, bias: 0, emit: false, mesh: 0 });
    faces.push({ pts: [P(a, -hp, g), P(a, hp, g), P(a, hp, zt), P(a, -hp, zt)], n: up, col: pc, bias: 0, emit: false, mesh: 0 });
  }
  for (let i = 0; i < nb; i++) {
    const a0 = -w / 2 + i * st, a1 = a0 + st, g0 = G[i], g1 = G[i + 1];
    faces.push({ pts: [P(a0, 0, g0 + h - 0.06), P(a1, 0, g1 + h - 0.06), P(a1, 0, g1 + h + 0.06), P(a0, 0, g0 + h + 0.06)], n: up, col: pc, bias: 0, emit: false, mesh: 0 });   // (the top rail)
    faces.push({ pts: [P(a0, 0, g0 + 0.08), P(a1, 0, g1 + 0.08), P(a1, 0, g1 + h - 0.06), P(a0, 0, g0 + h - 0.06)], n: up, col: wc, bias: 0, emit: false, mesh: mm });             // (the wire, the pickets, the bars)
  }
}
// #1308: a shelter (the range's hitting deck): a flat roof slab on posts, a post at each corner and every 4 m or so along its long sides; the slab's top, its underside and four thin edges, each a flat face
function shelterFaces(B, P, faces, zm) {
  const hw = B.w / 2, hd = B.d / 2, up = [0, 0, 1], dn = [0, 0, -1], col = B.rc, pc = [B.wall[0] * 0.8, B.wall[1] * 0.8, B.wall[2] * 0.8], zt = zm + B.h, zb = zt - 0.3, hp = 0.1;
  const add = (pts, n, c) => faces.push({ pts, n, col: c, bias: 0, emit: false, mesh: 0 });
  add([P(-hw, -hd, zt), P(hw, -hd, zt), P(hw, hd, zt), P(-hw, hd, zt)], up, col); add([P(-hw, -hd, zb), P(hw, -hd, zb), P(hw, hd, zb), P(-hw, hd, zb)], dn, pc);
  for (const [a0, f0, a1, f1] of [[-hw, -hd, hw, -hd], [hw, -hd, hw, hd], [hw, hd, -hw, hd], [-hw, hd, -hw, -hd]]) add([P(a0, f0, zb), P(a1, f1, zb), P(a1, f1, zt), P(a0, f0, zt)], up, pc);
  const nl = Math.max(1, Math.round(Math.max(B.w, B.d) / 4)), long = B.w >= B.d;
  for (let side = -1; side <= 1; side += 2) for (let i = 0; i <= nl; i++) {
    const a = long ? -hw + 0.3 + (B.w - 0.6) * i / nl : side * (hw - 0.3), f = long ? side * (hd - 0.3) : -hd + 0.3 + (B.d - 0.6) * i / nl, q = P(a, f, 0), g = groundH(q[0], q[1]) - 0.06;
    faces.push({ pts: [P(a - hp, f, g), P(a + hp, f, g), P(a + hp, f, zb), P(a - hp, f, zb)], n: up, col: pc, bias: 0, emit: false, mesh: 0 });
    faces.push({ pts: [P(a, f - hp, g), P(a, f + hp, g), P(a, f + hp, zb), P(a, f - hp, zb)], n: up, col: pc, bias: 0, emit: false, mesh: 0 });
  }
}
// a building's faces: each a few corners in the world (metres), a colour, how it faces the sun
function buildFaces(B) {
  const cr = Math.cos(B.rot), sr = Math.sin(B.rot), hw = B.w / 2, hd = B.d / 2, faces = [];
  const P = (a, f, z) => [B.x + a * cr - f * sr, B.y + a * sr + f * cr, z], N = (a, f, z) => [a * cr - f * sr, a * sr + f * cr, z];
  let zb = 1e9, zm = -1e9; for (const [a, f] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) { const g = groundH(B.x + a * cr - f * sr, B.y + a * sr + f * cr); if (g < zb) zb = g; if (g > zm) zm = g; }
  const z0 = zb - 0.4, z1 = zm + B.h, mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const add = (pts, n, col, bias = 0, emit = false) => faces.push({ pts, n, col, bias, emit, mesh: 0 });   // bias: how far in front of its wall a detail counts (cm); also its rank of detail (see drawBuildings)
  if (B.use === 'light') { lightFaces(B, P, N, add, zm); B.faces = faces; B.z0 = zm; B.top = zm + B.h; return; }   // (#1200: a floodlight tower)
  if (B.use === 'shelter') { shelterFaces(B, P, faces, zm); B.faces = faces; B.z0 = zm; B.top = zm + B.h; return; }   // (#1308: the hitting deck)
  if (B.use === 'fence') { fenceFaces(B, P, faces); B.faces = faces; B.z0 = zm; B.top = zm + B.h; return; }   // (#1308: a run of fence)
  if (B.use === 'tent' || B.use === 'stand' || B.use === 'board') { dressFaces(B, P, N, add, mul, zm); B.faces = faces; B.z0 = zm; B.top = zm + B.h; return; }   // (T429: a marquee, a grandstand: parts/08h-dress.md)
  const FRAME = [246, 242, 230], G1 = [74, 96, 128], G2 = [116, 148, 184];
  const walls = [[-hw, -hd, hw, -hd, 0, -1], [hw, -hd, hw, hd, 1, 0], [hw, hd, -hw, hd, 0, 1], [-hw, hd, -hw, -hd, -1, 0]];
  walls.forEach(([a0, f0, a1, f1, na, nf], wi) => {
    const len = Math.hypot(a1 - a0, f1 - f0), ua = (a1 - a0) / len, uf = (f1 - f0) / len, n = N(na, nf, 0);
    const rect = (s0, s1, zl, zh, off, col, bias, emit) => add([P(a0 + ua * s0 + na * off, f0 + uf * s0 + nf * off, zl), P(a0 + ua * s1 + na * off, f0 + uf * s1 + nf * off, zl), P(a0 + ua * s1 + na * off, f0 + uf * s1 + nf * off, zh), P(a0 + ua * s0 + na * off, f0 + uf * s0 + nf * off, zh)], n, col, bias, emit);
    rect(0, len, z0, z1, 0, B.wall, 0);
    rect(0, len, z0, zm + 0.32, 0.03, mul(B.wall, 0.66), 3);                                             // the plinth
    const fh = B.h / B.floors, nw = Math.max(1, Math.floor(len / 2.2)), ww = Math.min(0.85, len / nw * 0.46), wh = fh * 0.46;
    for (let fl = 1; fl < B.floors; fl++) rect(0, len, zm + fl * fh - 0.05, zm + fl * fh + 0.05, 0.03, mul(B.wall, 0.84), 3);   // a band between floors
    for (let fl = 0; fl < B.floors; fl++) for (let k = 0; k < nw; k++) {
      const c = (k + 0.5) / nw * len, zl = zm + fl * fh + fh * 0.36, zh = zl + wh;
      if (wi === 2 && fl === 0 && k === (nw >> 1)) {                                                      // the door in its frame, a light over it
        const dh = Math.min(1.9, fh * 0.8); rect(c - 0.6, c + 0.6, zm, zm + dh + 0.1, 0.04, FRAME, 5); rect(c - 0.48, c + 0.48, zm, zm + dh, 0.06, [112, 74, 48], 8);
        rect(c - 0.48, c + 0.48, zm + dh * 0.78, zm + dh, 0.08, G2, 11, true); rect(c - 0.02, c + 0.02, zm, zm + dh * 0.78, 0.08, [84, 54, 36], 11); continue; }
      rect(c - ww / 2 - 0.08, c + ww / 2 + 0.08, zl - 0.08, zh + 0.08, 0.04, FRAME, 5);                  // a window: frame, sill, two panes (the upper holds the sky), glazing bars
      rect(c - ww / 2 - 0.14, c + ww / 2 + 0.14, zl - 0.16, zl - 0.08, 0.07, mul(B.wall, 0.6), 6);
      rect(c - ww / 2, c + ww / 2, zl, zl + wh * 0.5, 0.06, G1, 8, true); rect(c - ww / 2, c + ww / 2, zl + wh * 0.5, zh, 0.06, G2, 8, true);
      rect(c - 0.03, c + 0.03, zl, zh, 0.08, FRAME, 11); rect(c - ww / 2, c + ww / 2, zl + wh * 0.5 - 0.025, zl + wh * 0.5 + 0.025, 0.08, FRAME, 11);
    }
  });
  const dk = mul(B.rc, 0.8);
  if (B.roof === 'flat') add([P(-hw, -hd, z1), P(hw, -hd, z1), P(hw, hd, z1), P(-hw, hd, z1)], [0, 0, 1], dk);
  else {
    const along = B.w >= B.d, Lh = along ? hw : hd, Dh = along ? hd : hw, rh = Dh * 0.7, zr = z1 + rh, e = 0.35, hip = B.roof === 'hip' ? Dh * 0.9 : 0;
    const Q = along ? P : (a, f, z) => P(f, a, z), QN = along ? N : (a, f, z) => N(f, a, z), L = Lh + e, D = Dh + e, R = Math.max(0.2, L - e - hip), sl = Math.hypot(rh, D), ny = rh / sl, nz = D / sl;
    for (const sg of [-1, 1]) {
      const n = QN(0, sg * ny, nz), pt = (a, t, lift) => Q(a, sg * D * (1 - t), z1 + rh * t + lift), ax = (t) => L + (R - L) * t;   // t: 0 at the eaves, 1 at the ridge
      add([pt(-L, 0, 0), pt(L, 0, 0), pt(R, 1, 0), pt(-R, 1, 0)], n, B.rc);
      for (const t of [0.22, 0.44, 0.66]) add([pt(-ax(t), t, 0.03), pt(ax(t), t, 0.03), pt(ax(t + 0.05), t + 0.05, 0.03), pt(-ax(t + 0.05), t + 0.05, 0.03)], n, mul(B.rc, 0.82), 4);   // courses of tiles
      add([pt(-ax(0.93), 0.93, 0.04), pt(ax(0.93), 0.93, 0.04), pt(R, 1, 0.04), pt(-R, 1, 0.04)], n, mul(B.rc, 0.68), 5);                                                    // the ridge
      add([Q(-L, sg * D, z1 - 0.16), Q(L, sg * D, z1 - 0.16), Q(L, sg * D, z1 + 0.02), Q(-L, sg * D, z1 + 0.02)], QN(0, sg, 0), mul(B.rc, 0.55), 2);                        // the board under the eaves
    }
    if (hip) for (const sg of [-1, 1]) add([Q(sg * L, -D, z1), Q(sg * L, D, z1), Q(sg * R, 0, zr)], QN(sg * 0.7, 0, 0.7), dk);
    else for (const sg of [-1, 1]) {                                                                     // the gable, a small window under the ridge
      const a = sg * Lh, zw = z1 + rh * 0.22; add([Q(a, -Dh, z1), Q(a, Dh, z1), Q(a, 0, zr)], QN(sg, 0, 0), B.wall);
      if (rh > 1.4) { add([Q(a + sg * 0.04, -0.36, zw), Q(a + sg * 0.04, 0.36, zw), Q(a + sg * 0.04, 0.36, zw + 0.62), Q(a + sg * 0.04, -0.36, zw + 0.62)], QN(sg, 0, 0), FRAME, 5);
        add([Q(a + sg * 0.06, -0.26, zw + 0.1), Q(a + sg * 0.06, 0.26, zw + 0.1), Q(a + sg * 0.06, 0.26, zw + 0.52), Q(a + sg * 0.06, -0.26, zw + 0.52)], QN(sg, 0, 0), G1, 8, true); }
    }
    { const ca = R * 0.45, cf = D * 0.4, zc0 = z1 + rh * 0.3, zc1 = zr + 0.55, w = 0.38, BR = [158, 108, 90], q = (a, f, z) => Q(ca + a, cf + f, z);   // the chimney
      add([q(-w, -w, zc0), q(w, -w, zc0), q(w, -w, zc1), q(-w, -w, zc1)], QN(0, -1, 0), BR); add([q(w, -w, zc0), q(w, w, zc0), q(w, w, zc1), q(w, -w, zc1)], QN(1, 0, 0), BR);
      add([q(w, w, zc0), q(-w, w, zc0), q(-w, w, zc1), q(w, w, zc1)], QN(0, 1, 0), BR); add([q(-w, w, zc0), q(-w, -w, zc0), q(-w, -w, zc1), q(-w, w, zc1)], QN(-1, 0, 0), BR);
      add([q(-w, -w, zc1), q(w, -w, zc1), q(w, w, zc1), q(-w, w, zc1)], [0, 0, 1], [84, 66, 60]); }
  }
  B.faces = faces; B.z0 = zm; B.top = z1;
}
// Nothing grows on a path or inside a building: true if a point of the land is on a path (within r of its edge) or under a building.
function featClear(x, y, r) {
  const F = feats; if (!F || !course || featFor !== course.id) return false;
  if (F.sd && pathSd(x, y) < r) return true;
  if (F.bmap) { const L = F.bmap.get((Math.floor(x / 16) + 4096) * 8192 + Math.floor(y / 16) + 4096); if (L) for (const B of L) { const dx = x - B.x, dy = y - B.y, c = Math.cos(B.rot), s = Math.sin(B.rot), a = dx * c + dy * s, f = -dx * s + dy * c; if (a > -B.w / 2 - 0.8 && a < B.w / 2 + 0.8 && f > -B.d / 2 - 0.8 && f < B.d / 2 + 0.8) return true; } }
  return false;
}
const bSt = new Int32Array(VW * VH);
function drawBuildings() {
  const F = feats; if (!F || !F.builds.length || !course || featFor !== course.id) return;
  const night = TOD[tmode].glow >= 1, HAZ = TOD[tmode].haze;
  for (const B of F.builds) {
    const dC = (B.x - camX) * FX + (B.y - camY) * FY, rad = Math.hypot(B.w, B.d) * 0.5; if (dC < -rad || dC > (B.use === 'fence' ? 260 + rad : 250)) continue;
    if (!B.faces) buildFaces(B);
    const hf = dC > 50 ? farHaze(dC) : 0, fence = B.use === 'fence';
    for (const Fc of B.faces) {
      const bi = Fc.bias; if (bi && (dC > 110 || (dC > 45 && (bi === 3 || bi === 4 || bi === 6 || bi === 11)))) continue;   // far off, the small details are left out
      const v = Fc.pts, n = v.length; let ok = true;
      for (let i = 0; i < n; i++) { const ex = v[i][0] - camX, ey = v[i][1] - camY, d = ex * FX + ey * FY; if (d < 0.8 || (fence && d > 260)) { ok = false; break; } const k = FOC / d; PXs[i] = VW / 2 + (ex * RX + ey * RY) * k; PYs[i] = HZ - (v[i][2] - camZ) * k; PWs[i] = 1 / d; }
      if (!ok) continue;
      if (fence && ((PXs[0] < 0 && PXs[1] < 0 && PXs[2] < 0 && PXs[3] < 0) || (PXs[0] >= VW && PXs[1] >= VW && PXs[2] >= VW && PXs[3] >= VW))) continue;   // (#1308: a run's bays off the side of the picture cost nothing)
      const mesh = Fc.mesh | 0;
      const dot = Fc.n[0] * SUNX + Fc.n[1] * SUNY + Fc.n[2] * SUNZ, L = clamp(Math.round(200 * (0.42 + 0.56 * (dot > 0 ? dot : dot * 0.25))), 30, 200), c = Fc.col;
      let col = Fc.emit && night ? (Fc.emit === 2 ? rgb(255, 246, 224) : rgb(255, 214, 130)) : lit(((L << 24) | (Math.min(255, c[2] | 0) << 16) | (Math.min(255, c[1] | 0) << 8) | Math.min(255, c[0] | 0)) >>> 0);
      if (hf > 0) col = hazed(col, hf, HAZ);
      const x1 = PXs[1] - PXs[0], y1 = PYs[1] - PYs[0], w1 = PWs[1] - PWs[0], x2 = PXs[2] - PXs[0], y2 = PYs[2] - PYs[0], w2 = PWs[2] - PWs[0], det = x1 * y2 - x2 * y1;   // the face's depth as a plane over the screen
      let A = 0, Bc = 0, C = PWs[0]; if (det > 1e-4 || det < -1e-4) { A = (w1 * y2 - w2 * y1) / det; Bc = (x1 * w2 - x2 * w1) / det; C = PWs[0] - A * PXs[0] - Bc * PYs[0]; }
      let ya = 1e9, yb = -1e9; for (let i = 0; i < n; i++) { if (PYs[i] < ya) ya = PYs[i]; if (PYs[i] > yb) yb = PYs[i]; }
      let Y0 = Math.ceil(ya - 0.5), Y1 = Math.floor(yb - 0.5); if (Y0 < 0) Y0 = 0; if (Y1 >= VH) Y1 = VH - 1;
      for (let y = Y0; y <= Y1; y++) {
        if (mesh === 1 && (y & 1)) continue;   // (#1308: chain-link wire is every second pixel of every second row: a quarter of the fill, and it reads as wire)
        const yc = y + 0.5; let xa = 1e9, xb = -1e9;
        for (let i = 0, j = n - 1; i < n; j = i++) { const p0 = PYs[i], p1 = PYs[j]; if ((p0 <= yc) === (p1 <= yc)) continue; const xx = PXs[i] + (yc - p0) / (p1 - p0) * (PXs[j] - PXs[i]); if (xx < xa) xa = xx; if (xx > xb) xb = xx; }
        let X0 = Math.ceil(xa - 0.5), X1 = Math.floor(xb - 0.5); if (X0 < 0) X0 = 0; if (X1 >= VW) X1 = VW - 1;
        for (let x = mesh === 1 ? X0 + (X0 & 1) : X0, sx = mesh === 1 ? 2 : 1; x <= X1; x += sx) { if (mesh > 1 && (mesh === 2 ? (x & 3) === 3 : (x & 3) !== 0)) continue; const w = A * (x + 0.5) + Bc * yc + C; if (w <= 0) continue; const zc = (100 / w) | 0, q = y * VW + x; if (zc < zbuf[q] + bi) { fb[q] = col; zbuf[q] = zc < 65534 ? zc : 65534; } }
      }
    }
    const bsn = night ? 0 : sunAt(B.x, B.y, frame * 0.055);
    if (bsn > 0.03 && dC < 80 && B.use !== 'fence') { shK = bsn;   // its shadow, where the sun reaches it: the box swept away from the sun, each ground pixel darkened once
      const cr = Math.cos(B.rot), sr = Math.sin(B.rot), hw = B.w / 2, hd = B.d / 2, st = dC < 35 ? 0.3 : 0.5, id = frame * 64 + (F.builds.indexOf(B) & 63) + 1;
      for (let zz = B.h; zz > 0.1; zz -= B.h / 4) for (let f = -hd; f <= hd; f += st) for (let a = -hw; a <= hw; a += st) {
        const gx = B.x + a * cr - f * sr - 0.809 * zz, gy = B.y + a * sr + f * cr + 0.735 * zz; project(gx, gy, groundH(gx, gy), PJ);
        if (PJ.x < 0 || PJ.x >= VW || PJ.y < 0 || PJ.y >= VH) continue; const q = PJ.y * VW + PJ.x; if (bSt[q] === id || Math.abs(zbuf[q] - PJ.d * 100) > 30) continue; bSt[q] = id; darken(q);
      }
      shK = 1;
    }
  }
}
// ---- the floodlights' light (#1200). At dusk and at night every tower lights what is within its reach. The light is put into Cinderdeep's light grid (the glow's, one sample
// per 8 x 8 px) after the grid has been spread, so it is not smeared into the dark: each sample reads the distance of what the picture shows there (the ground, a tree, a
// golfer, a wall), works out where in the world that is, and adds, from every tower within reach, warm white light that is brightest at its mast and fades to nothing at its
// reach (1 - (r / reach)^2, squared). The glow pass then lights every pixel of the picture the same way, whatever it is: what no tower reaches stays dark.
const LAMP_COL = [1.0, 0.92, 0.76], LAMP_E = 0.5, LAMP_MAX = 1.15, lampNear = [], lampG = [0, 0, 0];   // (LAMP_COL: the lamp's warm white; LAMP_E: how much of the day's light a lamp gives at its mast, 0..1; LAMP_MAX: the most many towers add up to, in towers' worth)
function lampsOn() { const F = feats; return !!(F && F.lamps && F.lamps.length && course && featFor === course.id && TOD[tmode].glow >= 1); }
function lampLight() {
  const F = feats; lampNear.length = 0;
  for (const L of F.lamps) { const dx = L.x - camX, dy = L.y - camY; if (dx * dx + dy * dy < (L.reach + 300) * (L.reach + 300)) lampNear.push(L); }   // (a tower farther than its reach plus the view's range cannot light anything seen)
  const n = lampNear.length; if (!n) return;
  { const T = TOD[tmode]; for (let c = 0; c < 3; c++) lampG[c] = LAMP_E * LAMP_COL[c] / (2.6 * T.glow * (T.sun[c] + T.sh[c]) * 0.5); }   // (the glow pass multiplies the picture, which the hour has already tinted blue: so each channel's light is what makes the lit ground neutral and warm, not blue)
  const gx1 = LM + Math.ceil(VW / LS), gy1 = LM + Math.ceil(VH / LS);
  for (let gy = LM; gy <= gy1; gy++) for (let gx = LM; gx <= gx1; gx++) {
    const X = Math.min(VW - 1, (gx - LM) * LS); let Y = Math.min(VH - 1, (gy - LM) * LS), z = zbuf[Y * VW + X];
    for (let t = 0; t < 3 && z === 65535 && Y + LS < VH; t++) { Y += LS; z = zbuf[Y * VW + X]; }   // (a sample on the sky takes the ground just below it, so the horizon's blocks are lit)
    if (z === 65535) continue;
    const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC, wx = camX + FX * d + RX * lat, wy = camY + FY * d + RY * lat;
    let s = 0;
    for (let i = 0; i < n; i++) { const L = lampNear[i], dx = wx - L.x, dy = wy - L.y, d2 = dx * dx + dy * dy; if (d2 >= L.r2) continue; const f = 1 - d2 / L.r2; s += f * f; }
    if (s <= 0) continue;
    if (s > LAMP_MAX) s = LAMP_MAX;
    const k = gy * GW + gx; lr[k] += s * lampG[0]; lg[k] += s * lampG[1]; lb[k] += s * lampG[2];
  }
}
function lampBloom() {   // a soft glow round each lamp head in view, added to the picture (the sky takes no grid light, so this is drawn straight): a bright core, a halo that fades out
  const rad = Math.min(24, 14 * RS * 1.0);
  for (const L of lampNear) {
    if (L.z === undefined) L.z = groundH(L.x, L.y) + L.h;
    project(L.x, L.y, L.z, PJ); if (PJ.s <= 0) continue;
    const d = PJ.d, r = Math.max(3, Math.min(rad * 1.7, 2 + 150 * RS / d)), cx = PJ.x, cy = PJ.y; if (cx < -r || cx >= VW + r || cy < -r || cy >= VH + r) continue;
    const dq = d * 100 - 500, hz = d > 50 ? farHaze(d) : 0, a0 = 1 - 0.55 * hz;
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(VH - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(VW - 1, Math.ceil(cx + r)); x++) {
      const q = y * VW + x; if (zbuf[q] < dq) continue;                       // (something nearer than the lamp is in front of it)
      const rr = Math.hypot(x - cx, y - cy) / r; if (rr >= 1) continue;
      const w = (1 - rr) * (1 - rr) * a0, c = fb[q], R = (c & 255) + 255 * w * LAMP_COL[0], G = ((c >> 8) & 255) + 255 * w * LAMP_COL[1], B = ((c >> 16) & 255) + 255 * w * LAMP_COL[2];
      fb[q] = (0xff000000 | ((B > 255 ? 255 : B) << 16) | ((G > 255 ? 255 : G) << 8) | (R > 255 ? 255 : R)) >>> 0;
    }
  }
}

````
