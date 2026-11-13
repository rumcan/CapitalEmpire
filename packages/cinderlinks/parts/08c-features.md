## features Paths and buildings added to a course
A course's map can be added to from outside the game: `tools/cinderlinks-map.mjs` (made for AI agents; see `tools/MAP-CLI.md`) writes paths and buildings to `edits/<course>.json`, and the running game reads that file again every two seconds, so a change shows without a rebuild.
R: The file's metres are real ones in the game's frame (x east, y south of the course's centre); the game shrinks them by the course's own scale, as it does the course.
R: A path is laid on the ground as it is seen: every ground pixel near a path is asked where on the land it lies, and takes the path's colour if that is within the path's width. Nothing is added to the land's own data, so the land's makers and the workers know nothing of it.
R: Nothing grows on a path or inside a building: no standing grass, no bush, flower, rock or tree trunk.
R: A building is a box with a roof (gable, hip or flat) with courses of tiles, a ridge, eaves and a chimney; windows by floor in frames with sills and glazing bars, a door, a plinth and a band between floors, drawn as flat faces lit by the one sun, in front of and behind things by its true depth; it throws its shadow where the sun reaches it.
R: A concrete path is laid in slabs (a joint across it every 1.7 m, each slab its own shade); any path may carry a fallen leaf here and there; none has flecks or stains.
R: A course without the file plays as before.
File: game.js
Check: function drawPaths(
Check: function drawBuildings(
Check: function setFeatures(

````js file=game.js

// ---- paths and buildings added to a course (the edits file made by tools/cinderlinks-map.mjs)
const SURF = { gravel: [198, 186, 160], concrete: [216, 210, 196], dirt: [152, 118, 86], sand: [228, 210, 164] };
const PLEAF = [[204, 128, 44], [168, 92, 40], [196, 170, 62], [122, 134, 58]];
let feats = null, featTxt = '', featFor = '';
function hexRgb(h, d) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return d; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function setFeatures(F) {   // F: the edits file's object (or nothing): made ready to draw, in the game's own metres
  feats = null; featFor = course ? course.id : '';
  if (!F || !course || !Array.isArray(F.features)) return;
  const S = course.S, paths = [], builds = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of F.features) {
    if (!f) continue;
    if (f.kind === 'path' && Array.isArray(f.pts) && f.pts.length > 1) {
      const p = { hw: Math.max(1.5, (+f.width || 2.4) * S * 1.3) / 2, col: SURF[f.surface] || SURF.gravel, slab: f.surface === 'concrete', pts: [] };
      for (const q of f.pts) { const x = +q[0] * S, y = +q[1] * S; if (!(x === x && y === y)) continue; p.pts.push(x, y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (p.pts.length >= 4) paths.push(p);
    } else if (f.kind === 'building' && Array.isArray(f.at)) {
      const x = +f.at[0] * S, y = +f.at[1] * S; if (!(x === x && y === y)) continue;
      builds.push({ x, y, w: clamp(+f.w || 10, 2, 120) * S, d: clamp(+f.d || 8, 2, 120) * S, h: clamp(+f.h || 4.5, 2, 20) * Math.max(S, 0.8), rot: (+f.rot || 0) * Math.PI / 180, roof: f.roof || 'gable',
        wall: hexRgb(f.wall, [232, 220, 192]), rc: hexRgb(f.roofColour, [138, 59, 42]), floors: clamp(Math.round(+f.floors || 1), 1, 4), faces: null, use: typeof f.use === 'string' ? f.use : '' });
    }
  }
  for (const B of builds) if (B.use === 'stand' || B.use === 'board') faceStand(B);   // (a grandstand or a scoreboard turned to its green or tee: parts/08h-dress.md)
  let sd = null, kind = null, seg = null, gw = 0, gh = 0, res = 0.5; const SG = [];   // (SG: every stretch of every path: its start, its run, its length squared, how far along its path it starts, its length)
  if (paths.length) {                                               // how far every place near a path is from the path's edge (below 0: on it), on a grid
    x0 -= 6; y0 -= 6; x1 += 6; y1 += 6; while (((x1 - x0) / res) * ((y1 - y0) / res) > 3e6) res *= 2;
    gw = Math.ceil((x1 - x0) / res) + 1; gh = Math.ceil((y1 - y0) / res) + 1; sd = new Float32Array(gw * gh).fill(9); kind = new Uint8Array(gw * gh); seg = new Uint16Array(gw * gh);
    paths.forEach((p, pi) => {
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
  feats = { paths, builds, sd, kind, seg, SG: Float64Array.from(SG), gx0: x0, gy0: y0, res, gw, gh, bmap };
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
function drawPaths() {   // the picture gone over in 8 x 8 blocks: only blocks near a path are looked at pixel by pixel
  const F = feats; if (!F || !F.sd || !course || featFor !== course.id) return;
  for (let j = 0; j < CLH; j++) for (let i = 0; i < CLW; i++) {
    const X = i * 8 < VW ? i * 8 : VW - 1, Y = j * 8 < VH ? j * 8 : VH - 1, z = zbuf[Y * VW + X];
    if (z === 65535) { PSB[j * CLW + i] = 99; continue; }
    const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC; PSB[j * CLW + i] = pathSd(camX + FX * d + RX * lat, camY + FY * d + RY * lat);
  }
  const L = 150, lr = LR[L], lg = LG[L], lb = LB[L];
  for (let j = 0; j < CLH - 1; j++) for (let i = 0; i < CLW - 1; i++) {
    const k = j * CLW + i, a = PSB[k], b = PSB[k + 1], c = PSB[k + CLW], e = PSB[k + CLW + 1], lo = Math.min(a, b, c, e); if (lo > 2.5) continue;
    const X0 = i * 8, Y0 = j * 8, Y1 = Math.min(VH, Y0 + 8), X1 = Math.min(VW, X0 + 8);
    for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) {
      const q = Y * VW + X, z = zbuf[q]; if (z === 65535) continue;
      const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC, wx = camX + FX * d + RX * lat, wy = camY + FY * d + RY * lat, s = pathSd(wx, wy); if (s >= 0) continue;
      const ck = Math.round((wy - F.gy0) / F.res) * F.gw + Math.round((wx - F.gx0) / F.res), pk = F.kind[ck], P0 = F.paths[pk], col = P0.col;
      let t = 256, r0 = col[0], g0 = col[1], b0 = col[2];
      if (P0.slab) {                                           // concrete laid in slabs: a joint across the path every 1.7 m, each slab a shade of its own
        const o = F.seg[ck] * 7, G = F.SG; let tt = ((wx - G[o]) * G[o + 2] + (wy - G[o + 1]) * G[o + 3]) / G[o + 4]; tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        const al = (G[o + 5] + tt * G[o + 6]) / 1.7, sl = Math.floor(al); t = al - sl < 0.05 ? 182 : 236 + (ih(sl, pk * 7 + 3) % 5) * 8;
      }
      if (s > -0.12) t = (t * 216) >> 8;                       // its edge, a shade darker
      { const lx = Math.floor(wx * 6), ly = Math.floor(wy * 6); if (ih(lx, ly) < 4) { const lf = PLEAF[ih(lx + 9, ly + 5) & 3]; r0 = lf[0]; g0 = lf[1]; b0 = lf[2]; t = 256; } }   // a fallen leaf here and there (no flecks or stains)
      let r = (r0 * t * lr) >> 16, g = (g0 * t * lg) >> 16, bl = (b0 * t * lb) >> 16;
      if (d > 50) { const hf = farHaze(d), H = TOD[tmode].haze; if (hf > 0) { r += (H[0] - r) * hf; g += (H[1] - g) * hf; bl += (H[2] - bl) * hf; } }
      fb[q] = ((fb[q] & 0xff000000) | ((bl > 255 ? 255 : bl) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;   // (the top byte kept: a tree's shadow still falls across the path)
    }
  }
}

// a building's faces: each a few corners in the world (metres), a colour, how it faces the sun
function buildFaces(B) {
  const cr = Math.cos(B.rot), sr = Math.sin(B.rot), hw = B.w / 2, hd = B.d / 2, faces = [];
  const P = (a, f, z) => [B.x + a * cr - f * sr, B.y + a * sr + f * cr, z], N = (a, f, z) => [a * cr - f * sr, a * sr + f * cr, z];
  let zb = 1e9, zm = -1e9; for (const [a, f] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [0, 0]]) { const g = groundH(B.x + a * cr - f * sr, B.y + a * sr + f * cr); if (g < zb) zb = g; if (g > zm) zm = g; }
  const z0 = zb - 0.4, z1 = zm + B.h, mul = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const add = (pts, n, col, bias = 0, emit = false) => faces.push({ pts, n, col, bias, emit });   // bias: how far in front of its wall a detail counts (cm); also its rank of detail (see drawBuildings)
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
    const dC = (B.x - camX) * FX + (B.y - camY) * FY, rad = Math.hypot(B.w, B.d) * 0.5; if (dC < -rad || dC > 250) continue;
    if (!B.faces) buildFaces(B);
    const hf = dC > 50 ? farHaze(dC) : 0;
    for (const Fc of B.faces) {
      const bi = Fc.bias; if (bi && (dC > 110 || (dC > 45 && (bi === 3 || bi === 4 || bi === 6 || bi === 11)))) continue;   // far off, the small details are left out
      const v = Fc.pts, n = v.length; let ok = true;
      for (let i = 0; i < n; i++) { const ex = v[i][0] - camX, ey = v[i][1] - camY, d = ex * FX + ey * FY; if (d < 0.8) { ok = false; break; } const k = FOC / d; PXs[i] = VW / 2 + (ex * RX + ey * RY) * k; PYs[i] = HZ - (v[i][2] - camZ) * k; PWs[i] = 1 / d; }
      if (!ok) continue;
      const dot = Fc.n[0] * SUNX + Fc.n[1] * SUNY + Fc.n[2] * SUNZ, L = clamp(Math.round(200 * (0.42 + 0.56 * (dot > 0 ? dot : dot * 0.25))), 30, 200), c = Fc.col;
      let col = Fc.emit && night ? rgb(255, 214, 130) : lit(((L << 24) | (Math.min(255, c[2] | 0) << 16) | (Math.min(255, c[1] | 0) << 8) | Math.min(255, c[0] | 0)) >>> 0);
      if (hf > 0) col = hazed(col, hf, HAZ);
      const x1 = PXs[1] - PXs[0], y1 = PYs[1] - PYs[0], w1 = PWs[1] - PWs[0], x2 = PXs[2] - PXs[0], y2 = PYs[2] - PYs[0], w2 = PWs[2] - PWs[0], det = x1 * y2 - x2 * y1;   // the face's depth as a plane over the screen
      let A = 0, Bc = 0, C = PWs[0]; if (det > 1e-4 || det < -1e-4) { A = (w1 * y2 - w2 * y1) / det; Bc = (x1 * w2 - x2 * w1) / det; C = PWs[0] - A * PXs[0] - Bc * PYs[0]; }
      let ya = 1e9, yb = -1e9; for (let i = 0; i < n; i++) { if (PYs[i] < ya) ya = PYs[i]; if (PYs[i] > yb) yb = PYs[i]; }
      let Y0 = Math.ceil(ya - 0.5), Y1 = Math.floor(yb - 0.5); if (Y0 < 0) Y0 = 0; if (Y1 >= VH) Y1 = VH - 1;
      for (let y = Y0; y <= Y1; y++) {
        const yc = y + 0.5; let xa = 1e9, xb = -1e9;
        for (let i = 0, j = n - 1; i < n; j = i++) { const p0 = PYs[i], p1 = PYs[j]; if ((p0 <= yc) === (p1 <= yc)) continue; const xx = PXs[i] + (yc - p0) / (p1 - p0) * (PXs[j] - PXs[i]); if (xx < xa) xa = xx; if (xx > xb) xb = xx; }
        let X0 = Math.ceil(xa - 0.5), X1 = Math.floor(xb - 0.5); if (X0 < 0) X0 = 0; if (X1 >= VW) X1 = VW - 1;
        for (let x = X0; x <= X1; x++) { const w = A * (x + 0.5) + Bc * yc + C; if (w <= 0) continue; const zc = (100 / w) | 0, q = y * VW + x; if (zc < zbuf[q] + bi) { fb[q] = col; zbuf[q] = zc < 65534 ? zc : 65534; } }
      }
    }
    const bsn = night ? 0 : sunAt(B.x, B.y, frame * 0.055);
    if (bsn > 0.03 && dC < 80) { shK = bsn;   // its shadow, where the sun reaches it: the box swept away from the sun, each ground pixel darkened once
      const cr = Math.cos(B.rot), sr = Math.sin(B.rot), hw = B.w / 2, hd = B.d / 2, st = dC < 35 ? 0.3 : 0.5, id = frame * 64 + (F.builds.indexOf(B) & 63) + 1;
      for (let zz = B.h; zz > 0.1; zz -= B.h / 4) for (let f = -hd; f <= hd; f += st) for (let a = -hw; a <= hw; a += st) {
        const gx = B.x + a * cr - f * sr - 0.809 * zz, gy = B.y + a * sr + f * cr + 0.735 * zz; project(gx, gy, groundH(gx, gy), PJ);
        if (PJ.x < 0 || PJ.x >= VW || PJ.y < 0 || PJ.y >= VH) continue; const q = PJ.y * VW + PJ.x; if (bSt[q] === id || Math.abs(zbuf[q] - PJ.d * 100) > 30) continue; bSt[q] = id; darken(q);
      }
      shK = 1;
    }
  }
}
````
