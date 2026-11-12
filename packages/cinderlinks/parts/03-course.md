## course The course
A hole is made from a seed: a tee on a cliff-sided plateau, a curved fairway, a green with a cup, bunkers and often a pond. The land is a height field in metres.
R: The same seed and hole number always give the same hole and the same land.
R: The land rolls gently and carries raised plateaus whose edges are sheer cliffs (the pixel-world technique of ticket T409). Each rise comes in two lifts with a ledge between. Near the fairway, green, bunkers and pond a plateau draws back; it is never squashed into a ramp.
R: The course is mown criss-cross, as on a tournament fairway (the owner's photograph): strong stripes about three and a half metres wide run along the hole, light and dark by turns, and a fainter set crosses them at right angles, so the fairway is a plaid in four tones. Each stripe ends squarely where the mower turned, so the striped ground's edge runs in steps, a step at each stripe. Round it lies a border, and beyond that the first cut, both mown in passes that follow the fairway's outline: a thin darker line each pass. The green is the same plaid, finer; the tee a chequer.
R: A pond is always held in: where the land round it lies lower than its water, a grassed bank rises to just above the water and slopes away.
R: Fallen rock lies at the feet of the cliffs in piles (a heap here, a bare foot there), and the odd rock has rolled a few metres out.
R: The tee is a raised box aligned to the isometric axes with rock cliff sides (ticket T372) and one ramp down toward the fairway.
R: Shape edges are bent by noise, so no fairway, green, bunker or pond has a straight or regular outline.
R: The land is sampled once into tiles (one sample every 4 pixels), and everything else reads the tiles.
R: A tile also holds the light: a normal that tilts only away from taller neighbours (direct neighbours count double), lit by the sun, and a cast shadow found by marching toward the sun.
File: game.js
Check: function makeHole(
Check: function field(
Check: function tileLight(

````js file=game.js

// ---- course: the hole, the land's height, the tiles
let SEED = 4242, hole = null, course = null;   // (course: a real course being played, or null: the invented one)
const M_WATER = 0, M_GREEN = 1, M_SAND = 2, M_TEE = 3, M_FAIR = 4, M_CUT = 5, M_ROUGH = 6, M_DEEP = 7, M_FOREST = 8, M_HILL = 9, M_ROCK = 10, M_CLIFF = 11, M_MUD = 12;
const MAT_NAME = ['Water', 'Green', 'Bunker', 'Tee', 'Fairway', 'First cut', 'Rough', 'Meadow', 'Woods', 'Hillside', 'Rock', 'Cliff', 'Shore'];

function baseH(x, y) { return 7 + 9 * (fbm(x / 72 + 11.3, y / 72 - 4.1, SEED, 4) - 0.5); }

function makeHole(seed, n, ox, oy) {
  const R = mulberry32((Math.imul(seed, 7919) + Math.imul(n, 104729) + 13) | 0);
  const flip = R() < 0.35 ? -1 : 1, ang = -(0.38 + R() * 0.8), len = 84 + R() * 36;
  const dx = Math.cos(ang) * flip, dy = Math.sin(ang);
  const ex = ox + dx * len, ey = oy + dy * len, bend = (R() - 0.5) * 36;
  const mx = (ox + ex) / 2 - dy * bend, my = (oy + ey) / 2 + dx * bend;
  const sx = ox + dx * 10, sy = oy + dy * 10, path = new Float32Array(50);
  for (let k = 0; k < 25; k++) {
    const t = k / 24, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
    path[k * 2] = a * sx + b * mx + c * ex; path[k * 2 + 1] = a * sy + b * my + c * ey;
  }
  const halfW = 6 + R() * 2.2, grot = R() * Math.PI;
  const green = { x: ex, y: ey, rx: 6.5 + R() * 2.5, ry: 5.2 + R() * 2, c: Math.cos(grot), s: Math.sin(grot) };
  const pa = R() * 6.283, pr = R() * 2.4, pin = { x: ex + Math.cos(pa) * pr, y: ey + Math.sin(pa) * pr * 0.8 };
  const bunk = [], nb = 2 + ((R() * 3) | 0), back = Math.atan2(dy, dx);
  for (let k = 0; k < nb; k++) {   // around the sides and back of the green, never across the approach
    const a = back + (R() - 0.5) * 3.6, rb = 2.2 + R() * 2, d = Math.max(green.rx, green.ry) + 1.6 + rb, rot = R() * Math.PI;
    bunk.push({ x: ex + Math.cos(a) * d, y: ey + Math.sin(a) * d, rx: rb * (1 + R() * 0.5), ry: rb, c: Math.cos(rot), s: Math.sin(rot), n: (R() * 1000) | 0 });
  }
  {                                // one beside the fairway
    const k = 10 + ((R() * 8) | 0), tx = path[k * 2 + 2] - path[k * 2], ty = path[k * 2 + 3] - path[k * 2 + 1], tl = Math.hypot(tx, ty) || 1, side = R() < 0.5 ? -1 : 1, rb = 2.4 + R() * 1.6, rot = R() * Math.PI;
    bunk.push({ x: path[k * 2] - ty / tl * side * (halfW + rb), y: path[k * 2 + 1] + tx / tl * side * (halfW + rb), rx: rb * 1.5, ry: rb, c: Math.cos(rot), s: Math.sin(rot), n: (R() * 1000) | 0 });
  }
  let pond = null;
  if (R() < 0.75) {
    const k = 7 + ((R() * 9) | 0), tx = path[k * 2 + 2] - path[k * 2], ty = path[k * 2 + 3] - path[k * 2 + 1], tl = Math.hypot(tx, ty) || 1, side = R() < 0.5 ? -1 : 1, r = 6.5 + R() * 4, off = halfW + r + 2 + R() * 3;
    pond = { x: path[k * 2] - ty / tl * side * off, y: path[k * 2 + 1] + tx / tl * side * off, r };
  }
  // the tee box lies along the isometric axis nearest the hole's direction; its ramp leaves along that axis
  const d1 = dx * 0.7071 + dy * 0.7071, d2 = dx * 0.7071 - dy * 0.7071;
  let ax = 0.7071, ay = 0.7071, sg = d1 < 0 ? -1 : 1;
  if (Math.abs(d2) > Math.abs(d1)) { ay = -0.7071; sg = d2 < 0 ? -1 : 1; }
  const H = { seed, n, tee: { x: ox, y: oy }, pin, green, bunk, pond, path, halfW, dx, dy, len, ax, ay, rx: ax * sg, ry: ay * sg, teeL: 4.6, teeW: 3.4, teeH: 2.8 + R() * 1.2, teeTop: 0, wl: -99,
    bx0: 0, bx1: 0, by0: 0, by1: 0, par: len > 105 ? 4 : 3 };
  let x0 = Math.min(ox, ex), x1 = Math.max(ox, ex), y0 = Math.min(oy, ey), y1 = Math.max(oy, ey);
  for (const b of bunk) { x0 = Math.min(x0, b.x); x1 = Math.max(x1, b.x); y0 = Math.min(y0, b.y); y1 = Math.max(y1, b.y); }
  if (pond) { x0 = Math.min(x0, pond.x - pond.r); x1 = Math.max(x1, pond.x + pond.r); y0 = Math.min(y0, pond.y - pond.r); y1 = Math.max(y1, pond.y + pond.r); }
  x0 = Math.min(x0, mx); x1 = Math.max(x1, mx); y0 = Math.min(y0, my); y1 = Math.max(y1, my);
  H.bx0 = x0 - 34; H.bx1 = x1 + 34; H.by0 = y0 - 34; H.by1 = y1 + 34;
  H.teeTop = baseH(ox, oy) + H.teeH;
  if (pond) H.wl = baseH(pond.x, pond.y) - 0.3;
  return H;
}

const FO = { h: 0, dF: 0, dG: 0, dB: 0, dT: 0, dP: 0, wood: 0, dry: 0, tone: 0, tal: 0, mow: 0, mow2: 0, wl: 0 };   // (wl: the level of the water nearest the point; -99: none)
function field(x, y, o) {   // everything the land is at one point (plan metres)
  if (course) { fieldCourse(x, y, o); return; }
  const H = hole;
  const w1 = vnoise(x / 5.3 + 1.1, y / 5.3 + 7.7, SEED + 60) - 0.5, w2 = vnoise(x / 1.7 + 4.2, y / 1.7 - 2.9, SEED + 61) - 0.5;
  let dF = 60, dG = 60, dB = 60, dT = 60, dP = 60, mow = 0, mow2 = 0;
  const tx = x - H.tee.x, ty = y - H.tee.y;
  if (x > H.bx0 && x < H.bx1 && y > H.by0 && y < H.by1) {
    const P = H.path; let best = 1e9, bt = 0, side = 1;
    for (let k = 0; k < 24; k++) {
      const ax = P[k * 2], ay = P[k * 2 + 1], bx = P[k * 2 + 2] - ax, by = P[k * 2 + 3] - ay, px = x - ax, py = y - ay;
      let t = (px * bx + py * by) / (bx * bx + by * by); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - bx * t, qy = py - by * t, d = qx * qx + qy * qy;
      if (d < best) { best = d; bt = k + t; side = px * by - py * bx < 0 ? -1 : 1; }
    }
    mow = side * Math.sqrt(best); mow2 = bt * H.len / 24;
    dF = Math.sqrt(best) - H.halfW * (0.8 + 0.4 * vnoise(bt * 0.21, 3.3, SEED + 62)) + 3 * w1 + 0.6 * w2;
    const G = H.green, gx = x - G.x, gy = y - G.y;
    dG = (Math.hypot((gx * G.c + gy * G.s) / G.rx, (gy * G.c - gx * G.s) / G.ry) - 1) * Math.min(G.rx, G.ry) + 1.2 * w1 + 0.25 * w2;
    for (const b of H.bunk) {
      const qx = x - b.x, qy = y - b.y;
      const d = (Math.hypot((qx * b.c + qy * b.s) / b.rx, (qy * b.c - qx * b.s) / b.ry) - 1) * b.ry + 1.3 * (vnoise(x / 2.9 + b.n, y / 2.9, SEED + 63) - 0.5) + 0.3 * w2;
      if (d < dB) dB = d;
    }
    const a = Math.abs(tx * H.ax + ty * H.ay) - (H.teeL - 1), b = Math.abs(ty * H.ax - tx * H.ay) - (H.teeW - 1);
    dT = Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - 1 + 0.5 * w2 + 0.35 * w1;
    if (H.pond) dP = Math.hypot(x - H.pond.x, y - H.pond.y) - H.pond.r + 2.2 * w1 + 0.5 * w2;
  }
  let h = baseH(x, y);
  h += 0.9 * (fbm(x / 15 + 2.2, y / 15 + 6.1, SEED + 7, 3) - 0.5) * (0.25 + 0.75 * sstep(-1, 4, dG));   // the green is the calmest ground
  const wm = sstep(1.5, 9, Math.min(dF, dG, dB - 1, dT - 1.5, dP - 1));
  let tal = 0;
  if (wm > 0) {                    // plateaus: a warped noise field cut at two levels; the cuts are the cliffs
    const wx = x + 9 * (vnoise(x / 21 + 3.7, y / 21, SEED + 40) - 0.5), wy = y + 9 * (vnoise(x / 21, y / 21 + 8.2, SEED + 41) - 0.5);
    const m = fbm(wx / 48, wy / 48, SEED + 31, 3) + 0.03 * w1 + 0.012 * w2 - (1 - wm) * 0.22;   // near the course a plateau draws back; it never gets lower, so its edge is always a sheer face
    const foot = m < 0.561 ? sstep(0.52, 0.555, m) * (1 - sstep(0.555, 0.561, m)) : m > 0.6 && m < 0.661 ? sstep(0.624, 0.655, m) * (1 - sstep(0.655, 0.661, m)) : 0;
    const out = m < 0.555 ? sstep(0.47, 0.53, m) : m > 0.6 && m < 0.655 ? sstep(0.6, 0.635, m) : 0;        // the ground a few metres out, where the odd rock has rolled
    if (foot > 0 || out > 0) {                                  // fallen rock lies in piles at a cliff's foot: here a heap, there a bare foot
      const pile = sstep(0.3, 0.6, vnoise(x / 6.1 + 2.3, y / 6.1 - 4.4, SEED + 45));
      tal = Math.max(foot * pile, 0.16 * out * (0.4 + 0.6 * pile));
      h += foot * foot * pile * (0.18 + 0.8 * vnoise(x / 1.6 + 7.7, y / 1.6 + 1.2, SEED + 46)) * 0.95;
    }
    h += 2.5 * sstep(0.555, 0.561, m) + 1.9 * sstep(0.573, 0.579, m) + 1.8 * sstep(0.655, 0.661, m) + 1.4 * sstep(0.672, 0.678, m);   // each rise in two lifts, a ledge between them
  }
  if (dB < 1.2) h += 0.12 * Math.max(0, 1 - Math.abs(dB - 0.4) / 0.7) - 0.6 * (1 - sstep(-1.8, 0.1, dB));   // a lip, then the hollow
  if (dT < 3) h = lerp(h, H.teeTop, 1 - sstep(-0.1, 0.4, dT));                                             // the tee box: flat top, sides a metre wide
  const al = tx * H.rx + ty * H.ry - H.teeL, la = Math.abs(ty * H.rx - tx * H.ry);
  if (al > -1.5 && al < 11 && la < 2.4) h = lerp(h, Math.max(h, H.teeTop - H.teeH * sstep(0, 10, al)), 1 - sstep(1.3, 2.3, la));   // the ramp
  if (H.pond && dP < 18 && dP > 2.4) { const bank = H.wl + 0.16 - Math.max(0, dP - 6) * 0.3; if (h < bank) h = bank; }   // where the land round a pond lies lower than its water, a bank holds the water in
  if (dP < 3.2) h = lerp(h, H.wl - 1.2, 1 - sstep(-4, 3.2, dP));
  o.tal = tal; o.mow = mow; o.mow2 = mow2; o.h = h; o.dF = dF; o.dG = dG; o.dB = dB; o.dT = dT; o.dP = dP; o.wl = H.wl;
  o.wood = fbm(x / 34 + 5.5, y / 34 + 9.1, SEED + 80, 3); o.dry = fbm(x / 27 - 3.3, y / 27 + 1.7, SEED + 81, 3); o.tone = fbm(x / 8.5, y / 8.5, SEED + 82, 2);
}

// which ground a point is: e bends the edges (metres), es bends the slope limits
// The course type's set-up (see CTYPES in the ground part): how far the fairway reaches beyond or short of the mapped edge (FWO, m), how wide the first cut
// is (CUTW) and the collar round a green (COLLAR), how far from the fairway the long grass takes over everywhere (DEEPD), how readily it grows in patches
// nearer than that (DRYT), how much less woodland there is (WOODT).
let FWO = 0, CUTW = 2.3, COLLAR = 2, DEEPD = 1e9, DRYT = 0.53, WOODT = 0;
function matOf(h, g, dF, dG, dB, dT, dP, wood, dry, e, es) {
  const wl = hole.wl;
  if (course ? dP + e * 0.25 < -0.2 : h < wl && dP < 5) return M_WATER;   // (the bank round a pond stands above the water out to 6 m, so water is only ever inside it; a real course's water is the mapped shape, its bed dug below its own level)
  if (g > 1.25 + es) return M_CLIFF;
  if (dG + e * 0.3 < 0) return M_GREEN;
  if (dB + e * 0.4 < 0) return M_SAND;
  if (dT + e * 0.3 < -0.75) return M_TEE;
  if (g > 0.62 + es * 0.5) return M_ROCK;
  if (dF + e < FWO) return M_FAIR;
  if (dF + e < FWO + CUTW || dG + e < COLLAR || dT < 0.2) return M_CUT;
  if (course ? dP + e * 0.3 < 0.7 : h < wl + 0.1 + e * 0.07 && dP < 5) return M_MUD;
  if (g > 0.3 + es * 0.5) return M_HILL;
  if (wood > 0.57 + WOODT + e * 0.02) return M_FOREST;
  return dry > DRYT + e * 0.03 || dF > FWO + CUTW + DEEPD ? M_DEEP : M_ROUGH;
}

// tiles: 65 x 65 samples, one every 4 px, 256 x 256 ground px each
const TN = 65, TPX = 256;
const tiles = new Map();
let lastTile = null, lastTK = NaN;
function tileAt(tx, ty) {
  const key = (tx + 32768) * 65536 + (ty + 32768);
  if (key === lastTK) return lastTile;
  let T = tiles.get(key);
  if (!T) { T = buildTile(tx, ty); tiles.set(key, T); }
  lastTK = key; lastTile = T;
  return T;
}
function buildTile(tx, ty) {
  const n = TN * TN, A = () => new Float32Array(n);
  const T = { tx, ty, h: A(), g: A(), dF: A(), dG: A(), dB: A(), dT: A(), dP: A(), wood: A(), dry: A(), tone: A(), tal: A(), mow: A(), mow2: A(), lt: null, sh: null, look: null, gh: null, ll: null, llt: -1, maxLift: 0, wl: -99, lw: null, sw: null, lp: 0 };   // (every field from the start: an object that grows fields later is slow to use)
  const u0 = tx * TPX, v0 = ty * TPX; let bdp = 1e9;
  for (let j = 0, k = 0; j < TN; j++) for (let i = 0; i < TN; i++, k++) {
    field((u0 + i * 4) / PPM, (v0 + j * 4) / PPV, FO);
    if (FO.dP < bdp) { bdp = FO.dP; T.wl = FO.wl; }      // the tile's water level: that of the water nearest any of its points
    T.h[k] = FO.h; T.dF[k] = FO.dF; T.dG[k] = FO.dG; T.dB[k] = FO.dB; T.dT[k] = FO.dT; T.dP[k] = FO.dP; T.wood[k] = FO.wood; T.dry[k] = FO.dry; T.tone[k] = FO.tone; T.tal[k] = FO.tal; T.mow[k] = FO.mow; T.mow2[k] = FO.mow2;
  }
  for (let j = 0, k = 0; j < TN; j++) for (let i = 0; i < TN; i++, k++) {   // the slope (rise over run), one-sided on the tile's edge
    const i0 = i > 0 ? i - 1 : i, i1 = i < TN - 1 ? i + 1 : i, j0 = j > 0 ? j - 1 : j, j1 = j < TN - 1 ? j + 1 : j;
    const hx = (T.h[j * TN + i1] - T.h[j * TN + i0]) / ((i1 - i0) * 4 / PPM), hy = (T.h[j1 * TN + i] - T.h[j0 * TN + i]) / ((j1 - j0) * 4 / PPV);
    T.g[k] = Math.hypot(hx, hy);
  }
  let mh = T.wl; for (let k = 0; k < n; k++) if (T.h[k] > mh) mh = T.h[k];
  T.maxLift = Math.round(mh * ZP) + 2;   // nothing in the tile is drawn higher than this
  return T;
}
function hUV(u, v) {   // the land's height at a ground pixel, metres
  const tx = Math.floor(u / TPX), ty = Math.floor(v / TPX), T = tileAt(tx, ty);
  const fx = (u - tx * TPX) * 0.25, fy = (v - ty * TPX) * 0.25, i = fx >= 64 ? 63 : fx | 0, j = fy >= 64 ? 63 : fy | 0, a = fx - i, b = fy - j, k = j * TN + i, H = T.h;
  return (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + TN] * (1 - a) + H[k + TN + 1] * a) * b;
}
function groundH(x, y) { return hUV(x * PPM, y * PPV); }
function wlAt(x, y) { return tileAt(Math.floor(x * PPM / TPX), Math.floor(y * PPV / TPX)).wl; }   // the water level at a point (its tile's)
function slopeAt(x, y, o) {   // the downhill pull at a point: o.x, o.y = the gradient (rise per metre)
  const e = 0.12; o.x = (groundH(x + e, y) - groundH(x - e, y)) / (2 * e); o.y = (groundH(x, y + e) - groundH(x, y - e)) / (2 * e);
}
function matAt(x, y) {        // the ground at a point, with no edge noise (for play and for placing things)
  const u = x * PPM, v = y * PPV, tx = Math.floor(u / TPX), ty = Math.floor(v / TPX), T = tileAt(tx, ty);
  const k = Math.min(64, Math.round((v - ty * TPX) * 0.25)) * TN + Math.min(64, Math.round((u - tx * TPX) * 0.25));
  return matOf(T.h[k], T.g[k], T.dF[k], T.dG[k], T.dB[k], T.dT[k], T.dP[k], T.wood[k], T.dry[k], 0, 0);
}
function talAt(u, v) {       // how much fallen rock lies at a ground pixel (0 = none, 1 = the middle of a pile)
  const tx = Math.floor(u / TPX), ty = Math.floor(v / TPX), T = tileAt(tx, ty);
  return T.tal[Math.min(64, Math.round((v - ty * TPX) * 0.25)) * TN + Math.min(64, Math.round((u - tx * TPX) * 0.25))];
}

// the light of a tile (the T409 technique): a normal from the height that tilts only away from TALLER neighbours,
// direct neighbours counted double; then the sun's diffuse light, and a cast shadow marched toward the sun
// (the light is made in steps so that no frame waits long for it: tileLightStep does up to `ms` of the work and says whether the light is whole)
function tileLight(T) { while (!tileLightStep(T, 1e9)); }
function tileLightStep(T, ms) {
  if (T.lt) return true;
  const t0 = performance.now(), n = TN * TN, u0 = T.tx * TPX, v0 = T.ty * TPX, H = T.h;
  const D = 16 / PPM, K = 1 / (3.414 * D), Q = 0.7071, R2 = 2 * TN;   // the neighbours are 16 px across and 8 px in depth away: the same distance on the ground
  const sux = 0.740 * PPM, suy = -0.672 * PPV;                        // one metre toward the sun, in ground px
  if (!T.lw) { const lt = new Float32Array(n);
  for (let j = 0, k = 0; j < TN; j++) for (let i = 0; i < TN; i++, k++) {
    const h0 = H[k];
    let hE, hW, hS, hN, hSE, hSW, hNE, hNW;
    if (i >= 4 && i < TN - 4 && j >= 2 && j < TN - 2) { hE = H[k + 4]; hW = H[k - 4]; hS = H[k + R2]; hN = H[k - R2]; hSE = H[k + R2 + 4]; hSW = H[k + R2 - 4]; hNE = H[k - R2 + 4]; hNW = H[k - R2 - 4]; }
    else { const u = u0 + i * 4, v = v0 + j * 4; hE = hUV(u + 16, v); hW = hUV(u - 16, v); hS = hUV(u, v + 8); hN = hUV(u, v - 8); hSE = hUV(u + 16, v + 8); hSW = hUV(u - 16, v + 8); hNE = hUV(u + 16, v - 8); hNW = hUV(u - 16, v - 8); }
    let gx = 0, gy = 0, e;
    e = hE - h0; if (e > 0) gx += 2 * e;
    e = hW - h0; if (e > 0) gx -= 2 * e;
    e = hS - h0; if (e > 0) gy += 2 * e;
    e = hN - h0; if (e > 0) gy -= 2 * e;
    e = hSE - h0; if (e > 0) { gx += e * Q; gy += e * Q; }
    e = hSW - h0; if (e > 0) { gx -= e * Q; gy += e * Q; }
    e = hNE - h0; if (e > 0) { gx += e * Q; gy -= e * Q; }
    e = hNW - h0; if (e > 0) { gx -= e * Q; gy -= e * Q; }
    gx *= K; gy *= K;
    lt[k] = clamp(((-gx * SUNX - gy * SUNY + SUNZ) / Math.sqrt(gx * gx + gy * gy + 1) - 0.2) / 0.686, 0, 1);
  }
  T.lw = lt; T.sw = new Float32Array(n); T.lp = 0; }
  const sh = T.sw;
  let hmx = -1e9; for (let ty = T.ty - 1; ty <= T.ty; ty++) for (let tx = T.tx; tx <= T.tx + 2; tx++) { const N = tiles.get((tx + 32768) * 65536 + (ty + 32768)); if (!N) hmx = 1e9; else if (N.maxLift / ZP > hmx) hmx = N.maxLift / ZP; }   // the highest land the march can meet (this tile and those toward the sun, if they are made: else no bound)
  for (let j = T.lp; j < TN; j += 2) { for (let i = 0; i < TN; i += 2) {   // cast shadows: marched toward the sun from every second sample, a row at a time
    const k = j * TN + i, u = u0 + i * 4, v = v0 + j * 4, h0 = H[k];
    let s = 0; const mmax = Math.min(34, Math.ceil((hmx - h0 - 0.06) / 0.2379) + 1);   // (past this the ray is above everything)
    for (let m = 1; m <= mmax; m++) {
      const dist = m * 0.26, ex = hUV(u + sux * dist, v + suy * dist) - (h0 + dist * 0.915 + 0.06);
      if (ex > 0) { const q = ex / 0.3; if (q > s) s = q; if (s >= 1) { s = 1; break; } }
    }
    sh[k] = s;
  } T.lp = j + 2; if (performance.now() - t0 > ms) return false; }
  for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {         // and filled in between
    const k = j * TN + i, oi = i & 1, oj = j & 1;
    if (oi && oj) sh[k] = (sh[k - TN - 1] + sh[k - TN + 1] + sh[k + TN - 1] + sh[k + TN + 1]) * 0.25;
    else if (oi) sh[k] = (sh[k - 1] + sh[k + 1]) * 0.5;
    else if (oj) sh[k] = (sh[k - TN] + sh[k + TN]) * 0.5;
  }
  T.lt = T.lw; T.sh = sh; T.lw = T.sw = null;
  return true;
}
````
