## realcourse Real courses
A real golf course can stand in for the invented one: its tees, fairways, greens, bunkers and water as OpenStreetMap has them, on the real ground's heights. The data comes from CapitalEmpire's map importer (its saved courses), turned into `courses.js` by `tools/course-import.mjs`.
R: A course is played at six tenths of its true size, heights and all: a 400 m hole plays as 240 m. On a real course every club sends the ball twice as far as on the invented one (a drive carries about 145 m), so the pars play as they should. The slopes stay the real ones (raised by three tenths so they read).
R: The land's function reads the course: how far a point is from each kind of ground comes from distance maps made once when the course is loaded, the height from the real height grid, smoothly.
R: Each stretch of water lies at its own level (the lowest ground on its rim); the land round it is banked and its bed dug as for an invented pond.
R: A mapped stream or river is water about 2.6 m wide along its line, running at the level of the ground under it and never uphill; its surface is level within each tile, so on a slope it comes down in small steps.
R: A hole's tee is the start of its mapped line, its pin the mapped pin (else the line's end), its par the mapped par. A hole with no mapped green gets a round one at its pin.
R: The game's own cliffs and plateaus stand only well away from the course's ground, round the outside.
R: The credit for the map data (OpenStreetMap contributors) and for the heights is shown on the card while a real course is played.
R: The game starts on Woodhill. K steps through the courses and back to the invented one; `?course=<id>` starts on another, `?course=none` on the invented one.
File: game.js
Check: function loadCourse(
Check: function fieldCourse(
Check: function courseHole(

````js file=game.js

// ---- real courses (the data: courses.js, made by tools/course-import.mjs; `course` itself is declared with the land)
const CSCALE = 0.6, CVEX = 1.3, CRES = 1.5;   // the shrink (six tenths: the golfer, the flag and the cart look their size on it; it was three tenths, and they looked like giants); how much the heights are raised over true slope; the distance maps' cell, m
const MORE_COURSES = [];   // courses fetched from inside the game (they join the saved ones)
function courseList() { return (typeof COURSES !== 'undefined' && Array.isArray(COURSES) ? COURSES : []).concat(MORE_COURSES); }
function courseElev(C, x, y) {   // the real height (metres above the grid's lowest) under a point of the game's frame, smoothly (Catmull-Rom over the grid)
  const fx = (x / C.S - C.hx0) / C.hstep, fy = (y / C.S - C.hy0) / C.hstep, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j, w = C.hw, hgt = C.hh, M = C.hm;
  let s = 0;
  for (let n = -1; n <= 2; n++) {
    const jj = j + n < 0 ? 0 : j + n >= hgt ? hgt - 1 : j + n, wb = n === -1 ? ((-b + 2) * b - 1) * b * 0.5 : n === 0 ? ((3 * b - 5) * b * b + 2) * 0.5 : n === 1 ? ((-3 * b + 4) * b + 1) * b * 0.5 : (b - 1) * b * b * 0.5;
    let r = 0;
    for (let m = -1; m <= 2; m++) {
      const ii = i + m < 0 ? 0 : i + m >= w ? w - 1 : i + m, wa = m === -1 ? ((-a + 2) * a - 1) * a * 0.5 : m === 0 ? ((3 * a - 5) * a * a + 2) * 0.5 : m === 1 ? ((-3 * a + 4) * a + 1) * a * 0.5 : (a - 1) * a * a * 0.5;
      r += M[jj * w + ii] * wa;
    }
    s += r * wb;
  }
  return s;
}
function courseH(C, x, y) { return C.hm ? 5 + courseElev(C, x, y) * C.S * CVEX : 6; }
// the signed distance from every cell near a ring to the ring (negative inside), kept where it is the smallest so far; lvG / lv: the water level that goes with it
function sdfRing(C, grid, ring, R, lvG, lv) {
  const n = ring.length >> 1; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let k = 0; k < n; k++) { const x = ring[k * 2], y = ring[k * 2 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const i0 = Math.max(0, Math.floor((x0 - R - C.gx0) / CRES)), i1 = Math.min(C.gw - 1, Math.ceil((x1 + R - C.gx0) / CRES)), j0 = Math.max(0, Math.floor((y0 - R - C.gy0) / CRES)), j1 = Math.min(C.gh - 1, Math.ceil((y1 + R - C.gy0) / CRES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const px = C.gx0 + i * CRES, py = C.gy0 + j * CRES; let best = 1e18, inside = false;
    for (let k = 0, q = n - 1; k < n; q = k++) {
      const ax = ring[k * 2], ay = ring[k * 2 + 1], bx = ring[q * 2], by = ring[q * 2 + 1], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
      let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - ax - ex * t, dy = py - ay - ey * t, d = dx * dx + dy * dy; if (d < best) best = d;
      if ((ay > py) !== (by > py) && px < ax + (py - ay) / (by - ay) * ex) inside = !inside;
    }
    const sd = inside ? -Math.sqrt(best) : Math.sqrt(best), g = j * C.gw + i;
    if (sd < grid[g]) { grid[g] = sd; if (lvG && sd < R) lvG[g] = lv; }
  }
}
function sdfDisc(C, grid, cx, cy, r, R) {   // the same for a round patch (a green or tee the map lacks)
  const i0 = Math.max(0, Math.floor((cx - r - R - C.gx0) / CRES)), i1 = Math.min(C.gw - 1, Math.ceil((cx + r + R - C.gx0) / CRES)), j0 = Math.max(0, Math.floor((cy - r - R - C.gy0) / CRES)), j1 = Math.min(C.gh - 1, Math.ceil((cy + r + R - C.gy0) / CRES));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const sd = Math.hypot(C.gx0 + i * CRES - cx, C.gy0 + j * CRES - cy) - r, g = j * C.gw + i; if (sd < grid[g]) grid[g] = sd; }
}
function sdfAt(C, grid, x, y) {   // a distance map read between its cells; far from everything where the map ends
  const gx = (x - C.gx0) / CRES, gy = (y - C.gy0) / CRES; if (!(gx >= 0 && gy >= 0 && gx < C.gw - 1 && gy < C.gh - 1)) return 60;
  const i = gx | 0, j = gy | 0, a = gx - i, b = gy - j, k = j * C.gw + i, k1 = k + C.gw;
  return (grid[k] * (1 - a) + grid[k + 1] * a) * (1 - b) + (grid[k1] * (1 - a) + grid[k1 + 1] * a) * b;
}
function courseLineD(x, y) {   // how far a point is from the nearest hole's line of play (999: far from all)
  const C = course, i = Math.round((x - C.gx0) / CRES), j = Math.round((y - C.gy0) / CRES); if (i < 0 || j < 0 || i >= C.gw || j >= C.gh) return 999;
  return C.md[j * C.gw + i];
}
function loadCourse(id) {   // make a saved course ready to play; false if there is no such course (its scale: its own `scale` if it has one, as a host page's course does; else CSCALE)
  course = null;
  const D = MORE_COURSES.find((c) => c.id === id) || courseList().find((c) => c.id === id); if (!D) return false;   // (one handed over or fetched in this visit wins over a saved one of the same id)
  const S = D.scale > 0 ? +D.scale : CSCALE, sc = (a) => { const o = new Float32Array(a.length); for (let k = 0; k < a.length; k++) o[k] = a[k] * S; return o; };
  const C = { id: D.id, name: D.name, place: D.place, credit: D.credit, hcredit: D.hg ? D.hg.src : '', S, holes: [], gx0: 0, gy0: 0, gw: 0, gh: 0, sF: null, sG: null, sB: null, sT: null, sP: null, mw: null, ma: null, md: null, wlG: null,
    hx0: 0, hy0: 0, hstep: 1, hw: 0, hh: 0, hm: null, streams: [], raw: D.fetched ? D : null, lk: null };   // (raw: a fetched course's data, for the workers, which do not have it)
  if (D.lk && Array.isArray(D.lk.r)) C.lk = lieGrid(D.lk, S);   // (T422: a host page's lies)
  if (D.hg) {                                                       // the heights: metres above the grid's lowest
    const b = atob(D.hg.d), n = D.hg.w * D.hg.h, M = new Float32Array(n); let lo = 1e9;
    for (let k = 0; k < n; k++) { const v = (b.charCodeAt(k * 2) | (b.charCodeAt(k * 2 + 1) << 8)) * D.hg.q; M[k] = v; if (v < lo) lo = v; }
    for (let k = 0; k < n; k++) M[k] -= lo;
    C.hx0 = D.hg.x0; C.hy0 = -D.hg.y0; C.hstep = D.hg.step; C.hw = D.hg.w; C.hh = D.hg.h; C.hm = M;   // (hy0: the grid's north edge in the game's y, which runs south; rows go south from it)
  }
  const P = { T: D.polys.T.map(sc), F: D.polys.F.map(sc), G: D.polys.G.map(sc), B: D.polys.B.map(sc), W: D.polys.W.map(sc) };
  for (const h of D.holes) C.holes.push({ n: h.n, par: h.par, line: sc(h.line), pin: [h.pin[0] * S, h.pin[1] * S] });
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  const see = (a) => { for (let k = 0; k < a.length; k += 2) { if (a[k] < x0) x0 = a[k]; if (a[k] > x1) x1 = a[k]; if (a[k + 1] < y0) y0 = a[k + 1]; if (a[k + 1] > y1) y1 = a[k + 1]; } };
  for (const key of ['T', 'F', 'G', 'B', 'W']) for (const r of P[key]) see(r);
  for (const h of C.holes) see(h.line);
  C.gx0 = x0 - 44; C.gy0 = y0 - 44; C.gw = Math.ceil((x1 - x0 + 88) / CRES) + 1; C.gh = Math.ceil((y1 - y0 + 88) / CRES) + 1;
  const n = C.gw * C.gh, mk = () => new Float32Array(n).fill(60);
  C.sF = mk(); C.sG = mk(); C.sB = mk(); C.sT = mk(); C.sP = mk(); C.wlG = new Float32Array(n).fill(-99); C.mw = new Float32Array(n); C.ma = new Float32Array(n); C.md = new Float32Array(n).fill(999);   // (mw: how far to the side of its hole's line each cell lies, signed; md: how far from that line)
  for (const r of P.F) sdfRing(C, C.sF, r, 38, null, 0);
  for (const r of P.G) sdfRing(C, C.sG, r, 38, null, 0);
  for (const r of P.T) sdfRing(C, C.sT, r, 38, null, 0);
  for (const r of P.B) sdfRing(C, C.sB, r, 12, null, 0);
  for (const r of P.W) {                                            // water: its level is the lowest ground on its rim (so every bank stands at or above it)
    let lv = 1e9; for (let k = 0; k < r.length; k += 2) { const h = courseH(C, r[k], r[k + 1]); if (h < lv) lv = h; }
    sdfRing(C, C.sP, r, 38, C.wlG, lv - 0.15);
  }
  for (const raw of D.streams || []) {                              // streams and rivers: water 2.6 m wide along the mapped line, its level that of the ground it runs over, point by point
    const L = sc(raw), m = L.length >> 1, lv = new Float32Array(m); C.streams.push(L); for (let k = 0; k < m; k++) lv[k] = courseH(C, L[k * 2], L[k * 2 + 1]) - 0.3;
    for (let k = m - 2; k >= 0; k--) if (lv[k] < lv[k + 1] && lv[0] > lv[m - 1]) lv[k] = lv[k + 1];   // (never uphill along its way: a dip in the height data does not dam it)
    for (let k = 1; k < m; k++) if (lv[k] < lv[k - 1] && lv[0] <= lv[m - 1]) lv[k] = lv[k - 1];
    for (let k = 0; k < m - 1; k++) {
      const ax = L[k * 2], ay = L[k * 2 + 1], ex = L[k * 2 + 2] - ax, ey = L[k * 2 + 3] - ay, l2 = ex * ex + ey * ey || 1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, ax + ex) - 22 - C.gx0) / CRES)), i1 = Math.min(C.gw - 1, Math.ceil((Math.max(ax, ax + ex) + 22 - C.gx0) / CRES)), j0 = Math.max(0, Math.floor((Math.min(ay, ay + ey) - 22 - C.gy0) / CRES)), j1 = Math.min(C.gh - 1, Math.ceil((Math.max(ay, ay + ey) + 22 - C.gy0) / CRES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const qx = C.gx0 + i * CRES - ax, qy = C.gy0 + j * CRES - ay; let t = (qx * ex + qy * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const sd = Math.hypot(qx - ex * t, qy - ey * t) - 1.3, g = j * C.gw + i;
        if (sd < C.sP[g] && sd < 20) { C.sP[g] = sd; C.wlG[g] = lv[k] + (lv[k + 1] - lv[k]) * t; }
      }
    }
  }
  for (const h of C.holes) {                                        // what the map lacks: a green at the pin, a tee at the line's start
    if (sdfAt(C, C.sG, h.pin[0], h.pin[1]) > -1) sdfDisc(C, C.sG, h.pin[0], h.pin[1], 8, 38);
    if (sdfAt(C, C.sT, h.line[0], h.line[1]) > -0.8) sdfDisc(C, C.sT, h.line[0], h.line[1], 3.5, 38);
    const L = h.line, m = L.length >> 1;                             // the mower's stripes run along the hole: each cell's place to the side of the nearest hole's line (signed)
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9; for (let k = 0; k < m; k++) { bx0 = Math.min(bx0, L[k * 2]); bx1 = Math.max(bx1, L[k * 2]); by0 = Math.min(by0, L[k * 2 + 1]); by1 = Math.max(by1, L[k * 2 + 1]); }
    const i0 = Math.max(0, Math.floor((bx0 - 30 - C.gx0) / CRES)), i1 = Math.min(C.gw - 1, Math.ceil((bx1 + 30 - C.gx0) / CRES)), j0 = Math.max(0, Math.floor((by0 - 30 - C.gy0) / CRES)), j1 = Math.min(C.gh - 1, Math.ceil((by1 + 30 - C.gy0) / CRES));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = C.gx0 + i * CRES, py = C.gy0 + j * CRES; let best = 1e18, lat = 0, along = 0, run = 0;
      for (let k = 0; k < m - 1; k++) { const ax = L[k * 2], ay = L[k * 2 + 1], ex = L[k * 2 + 2] - ax, ey = L[k * 2 + 3] - ay, qx = px - ax, qy = py - ay, sl = Math.hypot(ex, ey); const tr = (qx * ex + qy * ey) / (ex * ex + ey * ey || 1), t = tr < 0 ? 0 : tr > 1 ? 1 : tr; const dx = qx - ex * t, dy = qy - ey * t, d = dx * dx + dy * dy; if (d < best) { best = d; lat = (qx * ey - qy * ex) / (sl || 1); along = run + tr * sl; } run += sl; }   // (the distance square to that stretch of the line: past either end the stripes carry straight on)
      const g = j * C.gw + i, d = Math.sqrt(best); if (d < C.md[g]) { C.md[g] = d; C.mw[g] = lat; C.ma[g] = along; }
    }
  }
  course = C;
  return true;
}
// everything the land is at one point of a real course (the invented course's function, with the course's shapes and heights in place of the invented hole's)
function fieldCourse(x, y, o) {
  const C = course, w1 = vnoise(x / 5.3 + 1.1, y / 5.3 + 7.7, SEED + 60) - 0.5, w2 = vnoise(x / 1.7 + 4.2, y / 1.7 - 2.9, SEED + 61) - 0.5;
  let dF = 60, dG = 60, dB = 60, dT = 60, dP = 60, mow = 0, mow2 = 0, wl = -99;
  const gx = (x - C.gx0) / CRES, gy = (y - C.gy0) / CRES;
  if (gx >= 0 && gy >= 0 && gx < C.gw - 1 && gy < C.gh - 1) {
    const i = gx | 0, j = gy | 0, a = gx - i, b = gy - j, k = j * C.gw + i, k1 = k + C.gw, w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b, kn = (b < 0.5 ? k : k1) + (a < 0.5 ? 0 : 1);
    dF = C.sF[k] * w00 + C.sF[k + 1] * w10 + C.sF[k1] * w01 + C.sF[k1 + 1] * w11 + 1.1 * w1 + 0.4 * w2;      // (the edges are the map's, bent a little so none is a ruled line)
    dG = C.sG[k] * w00 + C.sG[k + 1] * w10 + C.sG[k1] * w01 + C.sG[k1 + 1] * w11 - 0.5 + 0.5 * w1 + 0.2 * w2;   // (greens and bunkers a little larger than scale)
    dB = C.sB[k] * w00 + C.sB[k + 1] * w10 + C.sB[k1] * w01 + C.sB[k1 + 1] * w11 - 0.3 + 0.5 * (vnoise(x / 2.9, y / 2.9, SEED + 63) - 0.5) + 0.2 * w2;
    dT = C.sT[k] * w00 + C.sT[k + 1] * w10 + C.sT[k1] * w01 + C.sT[k1 + 1] * w11 - 0.3 + 0.3 * w2;
    dP = C.sP[k] * w00 + C.sP[k + 1] * w10 + C.sP[k1] * w01 + C.sP[k1 + 1] * w11 + 0.8 * w1 + 0.3 * w2;
    { const m0 = C.mw[k], m1 = C.mw[k + 1], m2 = C.mw[k1], m3 = C.mw[k1 + 1], lo = Math.min(m0, m1, m2, m3), hi = Math.max(m0, m1, m2, m3); const ok = hi - lo < 9; mow = ok ? m0 * w00 + m1 * w10 + m2 * w01 + m3 * w11 : C.mw[kn]; mow2 = ok ? C.ma[k] * w00 + C.ma[k + 1] * w10 + C.ma[k1] * w01 + C.ma[k1 + 1] * w11 : C.ma[kn]; }   // (read smoothly, so a stripe's edge is a straight line, not steps; where two holes' lines meet, the nearest cell's)
    wl = C.wlG[kn];
  }
  let h = courseH(C, x, y);
  h += 0.7 * (fbm(x / 15 + 2.2, y / 15 + 6.1, SEED + 7, 3) - 0.5) * (0.25 + 0.75 * sstep(-1, 4, dG));   // the game's own small roll (the height grid is smooth); the green is the calmest ground
  const wm = sstep(16, 34, Math.min(dF, dG, dB, dT, dP));
  let tal = 0;
  if (wm > 0) {                    // the game's plateaus and cliffs, only well away from the course's ground
    const wx = x + 9 * (vnoise(x / 21 + 3.7, y / 21, SEED + 40) - 0.5), wy = y + 9 * (vnoise(x / 21, y / 21 + 8.2, SEED + 41) - 0.5);
    const m = fbm(wx / 48, wy / 48, SEED + 31, 3) + 0.03 * w1 + 0.012 * w2 - (1 - wm) * 0.22;
    const foot = m < 0.561 ? sstep(0.52, 0.555, m) * (1 - sstep(0.555, 0.561, m)) : m > 0.6 && m < 0.661 ? sstep(0.624, 0.655, m) * (1 - sstep(0.655, 0.661, m)) : 0;
    const out = m < 0.555 ? sstep(0.47, 0.53, m) : m > 0.6 && m < 0.655 ? sstep(0.6, 0.635, m) : 0;
    if (foot > 0 || out > 0) { const pile = sstep(0.3, 0.6, vnoise(x / 6.1 + 2.3, y / 6.1 - 4.4, SEED + 45)); tal = Math.max(foot * pile, 0.16 * out * (0.4 + 0.6 * pile)); h += foot * foot * pile * (0.18 + 0.8 * vnoise(x / 1.6 + 7.7, y / 1.6 + 1.2, SEED + 46)) * 0.95; }
    h += 2.5 * sstep(0.555, 0.561, m) + 1.9 * sstep(0.573, 0.579, m) + 1.8 * sstep(0.655, 0.661, m) + 1.4 * sstep(0.672, 0.678, m);
  }
  if (dB < 1.2) h += 0.12 * Math.max(0, 1 - Math.abs(dB - 0.4) / 0.7) - 0.6 * (1 - sstep(-1.8, 0.1, dB));   // a bunker: a lip, then the hollow
  if (wl > -90) {
    if (dP < 18 && dP > 2.4) { const bank = wl + 0.16 - Math.max(0, dP - 6) * 0.3; if (h < bank) h = bank; }   // a bank holds the water in where the land lies lower
    const bz = 3.2 + Math.min(11, Math.max(0, h - wl - 0.4) * 2.6);                                           // (the higher the ground stands over the water, the wider the slope down to it)
    if (dP < bz) h = lerp(h, wl - 1.2, 1 - sstep(-4, bz, dP));                                               // its bank and its bed
  } else dP = 60;
  o.tal = tal; o.mow = mow; o.mow2 = mow2; o.h = h; o.dF = dF; o.dG = dG; o.dB = dB; o.dT = dT; o.dP = dP; o.wl = wl;
  o.wood = fbm(x / 34 + 5.5, y / 34 + 9.1, SEED + 80, 3); o.dry = fbm(x / 27 - 3.3, y / 27 + 1.7, SEED + 81, 3); o.tone = fbm(x / 8.5, y / 8.5, SEED + 82, 2);
  if (C.lk) hostLie(C.lk, x, y, o);
}
// T422: a host page's lies (the course entry's `lk`: its model's kind for every 2 m cell, run-length coded) decide where the first cut, the rough and the
// long grass are: the distances matOf reads are pushed to the side of the host's kind. The course's shapes still draw the fairway, green, tee, sand and water
function lieGrid(L, S) {   // the grid unpacked, in the course's scale
  const g = new Uint8Array(L.w * L.h); let at = 0;
  for (let k = 0; k + 1 < L.r.length; k += 2) { const n = Math.min(L.r[k + 1], g.length - at); if (n > 0) g.fill(L.r[k], at, at + n); at += n; }
  return { x0: L.x0 * S, y0: L.y0 * S, step: L.step * S, w: L.w, h: L.h, g };
}
function hostLie(L, x, y, o) {   // codes: 1 fairway, 2 first cut, 3 rough, 4 deep rough, 5 fescue (the rest: the shapes decide)
  const i = Math.floor((x - L.x0) / L.step), j = Math.floor((y - L.y0) / L.step); if (i < 0 || j < 0 || i >= L.w || j >= L.h) return;
  const k = L.g[j * L.w + i];
  if (k === 1) { if (o.dF > FWO - 1) o.dF = FWO - 1; }
  else if (k === 2) { o.dF = FWO + CUTW * 0.5; o.dry = 0; }
  else if (k >= 3 && k <= 5) {
    o.dF = Math.max(o.dF, FWO + CUTW + 1.2); if (DEEPD < 1e8) o.dF = Math.max(FWO + CUTW + 1.2, Math.min(o.dF, FWO + CUTW + DEEPD - 1.2));
    o.dry = k === 3 ? 0 : 1;
    if (o.dG > -0.3 && o.dG < COLLAR + 1) o.dG = COLLAR + 1; if (o.dT > -0.6 && o.dT < 1) o.dT = 1;
  }
}
function courseHole(n) {   // a hole of the course, in the shape the game's own holes have
  const C = course, Hd = C.holes[(n - 1) % C.holes.length], L = Hd.line, m = L.length >> 1, path = new Float32Array(50), cum = new Float32Array(m);
  for (let k = 1; k < m; k++) cum[k] = cum[k - 1] + Math.hypot(L[k * 2] - L[k * 2 - 2], L[k * 2 + 1] - L[k * 2 - 1]);
  const len = cum[m - 1];
  for (let k = 0, s = 0; k < 25; k++) {                              // its line as 25 even points
    const d = len * k / 24; while (s < m - 2 && cum[s + 1] < d) s++;
    const t = cum[s + 1] > cum[s] ? (d - cum[s]) / (cum[s + 1] - cum[s]) : 0;
    path[k * 2] = L[s * 2] + (L[s * 2 + 2] - L[s * 2]) * t; path[k * 2 + 1] = L[s * 2 + 1] + (L[s * 2 + 3] - L[s * 2 + 1]) * t;
  }
  let dx = path[10] - path[0], dy = path[11] - path[1]; { const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l; }             // the way the hole sets off
  let gx = path[48] - path[40], gy = path[49] - path[41]; { const l = Math.hypot(gx, gy) || 1; gx /= l; gy /= l; }           // the way it comes in to the green
  return { seed: SEED, n, tee: { x: L[0], y: L[1] }, pin: { x: Hd.pin[0], y: Hd.pin[1] }, green: { x: Hd.pin[0], y: Hd.pin[1], rx: 4.2, ry: 4.2, c: gx, s: gy }, bunk: [], pond: null, path, halfW: 6, dx, dy, len, ax: dx, ay: dy, rx: dx, ry: dy,
    teeL: 2, teeW: 2, teeH: 0, teeTop: 0, wl: -99, bx0: 0, bx1: 0, by0: 0, by1: 0, par: Hd.par };
}
````
