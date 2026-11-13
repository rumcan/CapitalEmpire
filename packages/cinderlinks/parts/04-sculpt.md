## sculpt The sculpting kit
Upright art is not drawn by hand and not stored: it is sculpted in code from lit balls, capsules and strokes, each with its own seed.
R: Every ball and capsule is lit by the same sun as the ground (upper right), in a few tones of a colour ramp, with noise on the tone and on the rim.
R: A sculpture keeps a depth per pixel, so its parts cover each other correctly.
R: A finished sculpture gets a darker rim and a list of its row extents.
File: game.js
Check: function sBall(
Check: function sCap(

````js file=game.js

// ---- sculpt: balls, capsules, strokes -> a sprite (packed colours with a light level; 0 = empty)
function sculpt(w, h, ax, ay) { return { w, h, ax, ay, px: new Uint32Array(w * h), zb: new Float32Array(w * h).fill(-1e9), x0: null, x1: null, wind: null, mip: null }; }   // (mip: the same sculpture at half size, made when it is first drawn small)
function tone(rp, t, emit) {   // a ramp colour for a brightness 0..1, with its light level
  const n = rp.length; let k = (t * n) | 0; if (k < 0) k = 0; else if (k >= n) k = n - 1;
  return (((emit ? 255 : 100 + ((92 * k / (n - 1)) | 0)) << 24) | rp[k]) >>> 0;
}
function sPut(S, x, y, z, col) {   // x, y from the sculpture's anchor
  x = (x + S.ax) | 0; y = (y + S.ay) | 0;
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
  const i = y * S.w + x;
  if (z >= S.zb[i]) { S.zb[i] = z; S.px[i] = col; }
}
// o: seed, stip (tone noise), rag (ragged rim 0..1), dab (noise in 2 px dabs: leaves), bw + bx/by/bz (lean the normal toward a direction),
//    shift (tone offset), emit (glows), top (only the upper half: a dome)
function sBall(S, cx, cy, r, z, rp, o) {
  const seed = o.seed | 0, stip = o.stip || 0, rag = o.rag || 0, bw = o.bw || 0, sh = o.shift || 0, dab = o.dab ? 1 : 0, r2 = r * r;
  const xa = Math.floor(cx - r), xb = Math.ceil(cx + r), ya = Math.floor(cy - r), yb = o.top ? Math.floor(cy) : Math.ceil(cy + r);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const q = hash2(x >> dab, y >> dab, seed);
    if (rag > 0) { const e = (d2 / r2 - (1 - rag)) / rag; if (e > 0 && q < e * 0.92) continue; }
    let nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    if (bw > 0) { nx = nx * (1 - bw) + o.bx * bw; ny = ny * (1 - bw) + o.by * bw; nz = nz * (1 - bw) + o.bz * bw; const l = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= l; ny *= l; nz *= l; }
    let t = 0.5 + 0.5 * (nx * LVX + ny * LVY + nz * LVZ) + sh + (hash2(x, y, seed + 7) - 0.5) * stip;
    if (o.cel) t = t < 0.36 ? 0.18 : t < 0.68 ? 0.52 : 0.9;   // three flat tones, hard edges (a figure drawn small reads by its tones' shapes, not by a roll of light)
    sPut(S, x, y, z + nz * r, tone(rp, t, o.emit));
  }
}
// a tapered capsule from (x0, y0, radius r0, depth z) to (x1, y1, r1, depth o.z1); o.streak adds grain along its length (bark)
function sCap(S, x0, y0, r0, x1, y1, r1, z, rp, o) {
  const seed = o.seed | 0, stip = o.stip || 0, sh = o.shift || 0, streak = o.streak || 0, z1 = o.z1 === undefined ? z : o.z1;
  const vx = x1 - x0, vy = y1 - y0, vv = vx * vx + vy * vy || 1, vl = Math.sqrt(vv), rm = Math.max(r0, r1);
  const xa = Math.floor(Math.min(x0, x1) - rm), xb = Math.ceil(Math.max(x0, x1) + rm), ya = Math.floor(Math.min(y0, y1) - rm), yb = Math.ceil(Math.max(y0, y1) + rm);
  for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
    const px = x + 0.5 - x0, py = y + 0.5 - y0;
    let t = (px * vx + py * vy) / vv; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const r = r0 + (r1 - r0) * t, dx = px - vx * t, dy = py - vy * t, d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    const nx = dx / r, ny = dy / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let b = 0.5 + 0.5 * (nx * LVX + ny * LVY + nz * LVZ) + sh;
    if (streak) {   // bark as a pixel artist lays it: the light in flat bands, and plates of bark (short strokes along the limb, staggered from row to row, a tone lighter or darker), a dark crack where one plate ends. (A smooth roll of light with a grain to every pixel and ruled streaks read as vector art.)
      const al = t * vl, ac = (px * vy - py * vx) / vl, row = Math.floor(ac / 2.4), hr = hash2(row, 5, seed), pl = 5 + hr * 5, cl = (al + hr * 9) / pl, ci = Math.floor(cl), h = hash2(ci, row, seed + 1);
      b = Math.round(b * 5) / 5 + (h < 0.26 ? -0.2 : h > 0.84 ? 0.2 : 0) - ((cl - ci) * pl < 1 && h > 0.4 ? 0.2 : 0);
    } else { b += (hash2(x, y, seed + 7) - 0.5) * stip; if (o.cel) b = b < 0.36 ? 0.18 : b < 0.68 ? 0.52 : 0.9; }
    sPut(S, x, y, z + (z1 - z) * t + nz * r, tone(rp, b, o.emit));
  }
}
function sLine(S, x0, y0, x1, y1, z, col) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let k = 0; k <= n; k++) sPut(S, Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), z, col);
}
// finish: a darker, cooler rim where the sculpture meets nothing; then the extents of each row
function sDone(S, rim) {
  const { w, h, px } = S, edge = [];
  if (rim) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !px[i - 1] || !px[i + 1] || !px[i - w] || !px[i + w])) edge.push(i);
    }
    for (const i of edge) {
      const c = px[i], L = c >>> 24; if (L === 255) continue;
      px[i] = ((Math.max(40, (L * 0.8) | 0) << 24) | (Math.min(255, ((c >> 16) & 255) * rim * 1.12) << 16) | ((((c >> 8) & 255) * rim * 0.95) << 8) | ((c & 255) * rim * 0.92)) >>> 0;
    }
  }
  S.x0 = new Int16Array(h); S.x1 = new Int16Array(h);
  for (let y = 0; y < h; y++) { let a = w, b = -1; for (let x = 0; x < w; x++) if (px[y * w + x]) { if (x < a) a = x; b = x; } S.x0[y] = a; S.x1[y] = b; }
  S.zb = null;
  return S;
}
````

## flora Plants, rocks and glowing things
Each plant or rock is one point in a four-number space: form, size, hue and fullness. The numbers come from slow noise over the land plus the thing's own seed, so neighbours are kin and no two are the same.
R: Trees are broadleaf (full or airy, birch-barked when airy) or conifer; foliage runs from deep green through lush and lime to ember and rose, blended by the hue number.
R: A broadleaf crown is Grove's (the owner's Grove project): a few big lobed clusters of small leaf cells, five tones lighter to the upper right in broad patches, darker where one cluster lies over another, with a few sunlit leaves on the lit side and stray single leaves; a conifer is drooping tiers. The trunk and branches are this game's own.
R: Autumn groves use Grove's own three leaf colours (red maple, golden birch, copper oak).
R: A tree keeps its crown as parts: the wood, the clusters that move, and the core over them, so the wind can move the leaves and leave the wood still.
R: Bushes, boulders with facets and moss, grass and reed clumps, five kinds of flower, glowing mushrooms and crystals in three hues (Cinderdeep's glowcaps and Shardhall crystals) are made the same way.
R: Nothing here uses a stored picture or a repeating tile.
File: game.js
Check: function leafCluster(
Check: function mkTree(
Check: function mkRock(
Check: function mkGlowcap(

````js file=game.js

// ---- flora
const LEAF = [
  ramp(['#0c2f3a', '#12453f', '#1b5e40', '#2c7a40', '#479444', '#6cae4e']),   // deep
  ramp(['#0f3d3e', '#17573f', '#24753f', '#3f9440', '#6ab446', '#a0d25a']),   // lush
  ramp(['#1f4a36', '#2f6a38', '#48893a', '#6aa63e', '#94c048', '#c4d860']),   // lime
  ramp(['#5a1a2a', '#8a2426', '#b83a22', '#de5a22', '#f48a2e', '#ffc04c']),   // ember
  ramp(['#6a2a58', '#98407a', '#c2609a', '#e284b4', '#f6aecc', '#ffd8e4']),   // rose
];
const CONIF = ramp(['#10262f', '#163836', '#1d4b3e', '#286047', '#3a7650', '#56905c']);
const BARK = ramp(['#2a1c22', '#3d2a2a', '#523a30', '#6a4d3a', '#846448', '#9e7d5a']);
const BIRCH = ramp(['#5a5868', '#8a8892', '#b8b6b8', '#d8d6d0', '#eeece2', '#fbf9ee']);
const ROCKR = ramp(['#3b3550', '#4d4662', '#615a74', '#787186', '#928b98', '#aea7a8', '#c9c2b8']);
const ROCKW = ramp(['#4a3648', '#624552', '#7c575c', '#966c66', '#b08574', '#c8a288', '#dcbfa0']);
const MOSSR = ramp(['#22402e', '#2f5a34', '#42763a', '#5c9242', '#7eac50']);
const BLADE = ramp(['#1e4a34', '#2a6038', '#3a783c', '#529042', '#70a64c', '#96ba5c']);
const STRAW = ramp(['#5a4a30', '#7a6638', '#9a8444', '#b8a054', '#d2bc6c', '#e8d68c']);
const REEDR = ramp(['#1c3a30', '#265034', '#32683a', '#448040', '#5c964a']);
const STEMR = ramp(['#8a7a9a', '#b0a2b8', '#d2c8d4', '#eee6ea']);
const GLOWS = [ramp(['#1f6f78', '#2aa39a', '#58d6c0', '#a8f5e0']), ramp(['#8a2f7a', '#c84fa0', '#f083c0', '#ffc6e6']), ramp(['#4a3a9a', '#7a5ad0', '#a98af0', '#dccbff'])];
const GLOW_LIGHT = [[0.25, 0.95, 0.8], [1.0, 0.4, 0.75], [0.6, 0.45, 1.0]];
const CRYS = [ramp(['#2a5ab0', '#4a8ae0', '#8ac0ff', '#e0f2ff']), ramp(['#5a3ab0', '#8a62e0', '#b89aff', '#eee0ff']), ramp(['#b03a78', '#e0629c', '#ff9ac4', '#ffe0ee'])];
const CRY_LIGHT = [[0.35, 0.6, 1.0], [0.6, 0.4, 1.0], [1.0, 0.4, 0.7]];
const PETAL = [ramp(['#c8c8d8', '#f4f4f0', '#ffffff']), ramp(['#b03020', '#e8502a', '#ff8a40']), ramp(['#5a3aa0', '#8a5ad0', '#e08ad8']), ramp(['#3a5ac0', '#5a8ae8', '#9ac0ff']), ramp(['#c89a20', '#f4cc30', '#fff08a'])];
function leafRamp(hue) { const p = clamp(hue, 0, 0.9999) * 4, k = p | 0; return mixRamp(LEAF[k], LEAF[k + 1], p - k); }
const K_TREE = 0, K_BUSH = 1, K_ROCK = 2, K_GRASS = 3, K_FLOWER = 4, K_GLOW = 5, K_CRYSTAL = 6, K_REED = 7;

// a crown: lobes (x across, y toward the camera, z up, r) covered with leaf clusters
function crown(S, R, lobes, lf, dens, cr0, cr1, airy, seed, cx, cz) {
  let id = 0;
  for (const L of lobes) {
    if (airy < 0.5) sBall(S, L.x, -L.z + L.y * 0.5, L.r * 0.84, L.y * 0.866 + L.z * 0.5 - L.r * 0.3, lf, { seed: seed + 900 + id, stip: 0.3, rag: 0.4, dab: 1, shift: -0.3 });   // the dark inside
    const ca = (cr0 + cr1) / 2, n = Math.round(5 * dens * (L.r / ca) * (L.r / ca));
    for (let i = 0; i < n; i++) {
      let dx, dy, dz, l;
      do { dx = R() * 2 - 1; dy = R() * 2 - 1; dz = R() * 2 - 1; l = dx * dx + dy * dy + dz * dz; } while (l > 1 || l < 0.04);
      l = 1 / Math.sqrt(l); dx *= l; dy *= l; dz *= l;
      if (dy < -0.3) dy = -dy * 0.6;                         // most of the hidden back comes round to the front
      const rr = L.r * (0.7 + R() * 0.32), X = L.x + dx * rr, Y = L.y + dy * rr, Z = L.z + dz * rr * 0.92, cr = cr0 + R() * (cr1 - cr0);
      // the cluster is lit mostly as part of the whole crown: its normal leans to the lobe's and the crown's outward direction
      let ox = dx * 0.6 + (X - cx) / (L.r * 2), oy = dy * 0.6, oz = dz * 0.6 + (Z - cz) / (L.r * 2);
      const ol = 1 / (Math.hypot(ox, oy, oz) || 1); ox *= ol; oy *= ol; oz *= ol;
      const vx = ox, vy = -oz * 0.866 + oy * 0.5, vz = oy * 0.866 + oz * 0.5;   // the crown's outward direction as the camera sees it
      sBall(S, X, -Z + Y * 0.5, cr, Y * 0.866 + Z * 0.5, lf, { seed: seed + (id++) * 13, stip: 0.14, rag: 0.42, dab: 1, bw: 0.4,
        bx: vx, by: vy, bz: vz, shift: 0.15 * (vx * LVX + vy * LVY + vz * LVZ) + (dz < -0.25 ? -0.12 : 0) + (R() - 0.5) * 0.08 });
    }
  }
}

// ---- Grove's leaves and wind (ported from the owner's Grove project: evolution/detail4x/detail_runtime.py and site/wind_runtime.js, at this game's scale).
// A crown is a few big lobed clusters of leaf cells. A cluster: an ellipse whose edge has 7 and 11 lobes; solid inside, leaf cells kept three in four along
// the rim; five tones in clean bands, lighter to the upper right, with leaves as short leaning strokes a tone lighter or darker (pixel art: no random squares, no grain); one tone darker where it lies over an earlier cluster; glints; stray single
// leaves beside it. In wind every cluster but the core steps through eight poses, each from its own start, and its lobes swell and shrink; the wood never moves.
const SWAY_S = [0, 1, 2, 1, 0, -1, -2, -1], SWAY_L = [0, 0, 1, 1, 0, 0, -1, -1];
const GFOL = [[[58, 27, 28], [101, 38, 29], [157, 59, 29], [206, 91, 35], [238, 139, 55]], [[55, 48, 26], [98, 77, 29], [149, 111, 37], [196, 151, 56], [230, 192, 91]], [[48, 36, 27], [84, 53, 30], [126, 76, 36], [169, 106, 49], [206, 145, 75]]]
  .map((p) => Uint32Array.from(p, (c) => (c[2] << 16) | (c[1] << 8) | c[0]));   // Grove's own three autumn leaf colours: red maple, golden birch, copper oak
function h32(a, b, s) { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; }
// one cluster as a sprite centred on its own middle. rp: five tones, dark to light. sway -1, 0, 1: how far its lobes are out. cover (cw x ch, with this cluster's centre at ox, oy): what is already leaf.
function leafCluster(seed, cid, rx, ry, rp, sway, cover, cw, ch, ox, oy) {
  const hx = Math.ceil(1.24 * rx) + 3, hy = Math.ceil(1.24 * ry) + 3, w = hx * 2 + 1, h = hy * 2 + 1, S = sculpt(w, h, hx, hy), Pp = S.px, lev = new Int8Array(w * h).fill(-1);
  const phi = 6.2832 * hash2(cid, 500, seed), amp = 0.10 + 0.05 * sway, cs = seed + cid * 7919;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - hx, dy = y - hy, nx = dx / rx, ny = dy / ry, r2 = nx * nx + ny * ny;
    if (r2 > 1.45) continue;
    const hc = h32(dx >> 1, dy >> 1, cs);
    if (r2 > 0.72) { const th = Math.atan2(ny, nx), e = 1 + amp * Math.sin(7 * th + phi) + 0.06 * Math.cos(11 * th - phi); if (r2 > e * e || (hc & 7) < 2) continue; }
    let l = Math.floor(1.7 + 1.35 * (nx * 0.62 - ny * 0.78));                                            // a ball in clean bands, light to the upper right
    const ry2 = dy >> 1, lf = h32((dx + ry2 + ((ry2 & 1) << 1)) >> 2, ry2, cs + 7) % 13; l += lf < 2 ? 1 : lf < 4 ? -1 : 0;   // leaves: short leaning strokes (4 x 2 px, staggered row by row), some a tone lighter, some darker
    l = l < 0 ? 0 : l > 4 ? 4 : l;
    if (dx * 0.866 - dy * 0.5 > 0 && dy < ry * 0.3 && l < 4) l++;                                       // the sunward half
    const X = ox + dx, Y = oy + dy; if (cover && X >= 0 && Y >= 0 && X < cw && Y < ch && cover[Y * cw + X] && l > 0) l--;   // over an earlier cluster: a tone darker
    if (l >= 2 && l < 4 && ((hc >>> 8) % 37) === 0) l++;                                               // a glint: a leaf on the lit side catching the sun, one tone up
    lev[y * w + x] = l;
  }
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    let l = lev[i];
    if (l < 0 && x > 0 && lev[i - 1] >= 0 && ((h32((x - hx) >> 1, (y - hy) >> 1, cs) >>> 13) % 23) === 0) l = Math.min(4, lev[i - 1] + 1);   // a stray leaf beside it
    if (l >= 0) Pp[i] = (((104 + l * 22) << 24) | rp[l]) >>> 0;
  }
  return sDone(S, 0.74);
}
function paste(dst, S, ox, oy, cover) {   // a cluster into the whole tree's picture; cover learns where leaf now is
  for (let y = 0; y < S.h; y++) { const Y = oy - S.ay + y; if (Y < 0 || Y >= dst.h) continue; for (let x = S.x0[y]; x <= S.x1[y]; x++) { const c = S.px[y * S.w + x], X = ox - S.ax + x; if (c && X >= 0 && X < dst.w) { dst.px[Y * dst.w + X] = c; if (cover) cover[Y * dst.w + X] = 1; } } }
}
function five(rp) { return Uint32Array.of(rp[0], rp[1], rp[2], rp[4], rp[5]); }
// the crown: clusters (x across, y up the picture is negative) -> the flat picture; with keep, also the moving parts and the core for the wind
function leafCrown(flat, seed, list, rp, keep) {
  const W = flat.w, HH = flat.h, cover = new Uint8Array(W * HH), parts = []; let core = null, cx = 0, cy = 0;
  for (const q of list) {
    const ox = flat.ax + Math.round(q.x), oy = flat.ay + Math.round(q.y), rx = Math.max(3, Math.round(q.rx)), ry = Math.max(3, Math.round(q.ry));
    const S0 = leafCluster(seed, q.cid, rx, ry, rp, 0, cover, W, HH, ox, oy);
    if (keep) { if (q.move) parts.push({ v: [leafCluster(seed, q.cid, rx, ry, rp, -1, cover, W, HH, ox, oy), S0, leafCluster(seed, q.cid, rx, ry, rp, 1, cover, W, HH, ox, oy)], x: Math.round(q.x), y: Math.round(q.y), ph: (hash2(q.cid, 6100, seed) * 8) | 0 }); else { core = S0; cx = Math.round(q.x); cy = Math.round(q.y); } }
    paste(flat, S0, ox, oy, cover);
  }
  return keep ? { parts, core, cx, cy } : null;
}

// ---- trees that belong to a biome: the palm (beachside), the saguaro cactus (desert), the flat-topped acacia (savanna). They take the place of the
// full broadleaf tree there (the airy one stays, as the dry or the windblown tree of the place); see t2() and the biomes.
const PALMT = ramp(['#4a3a30', '#63503e', '#7e684e', '#998262', '#b49c78', '#ccb48e']);
const CACTR = ramp(['#1c4a34', '#2a6238', '#3c7c40', '#56964a', '#78ae58']);
const CACTF = ramp(['#b83a6a', '#e0608c', '#f890b0', '#ffc8d8']);
function mkPalm(o, R) {   // a tall bowed trunk ringed with old leaf scars; a crown of fronds, each a bowed rib with leaflets hanging from it; a few coconuts
  const H = o.H, L = Math.max(34, o.rx), W = Math.ceil(L * 2.5 + 50), HH = Math.ceil(H + L * 0.7 + 34), S = sculpt(W, HH, W >> 1, HH - 10);
  const lean = (R() - 0.5) * H * 0.3, tr = 4 + H * 0.012, th = H * 0.86, n = 7;
  let px = 0, py = 0;
  for (let k = 1; k <= n; k++) { const t = k / n, x = lean * t * t, y = -th * t; sCap(S, px, py, tr * (1 - 0.4 * (t - 1 / n)), x, y, tr * (1 - 0.4 * t), 0, PALMT, { seed: o.seed + k, stip: 0.12 }); px = x; py = y; }
  for (let y = -6; y > -th + 4; y -= 6 + ((R() * 3) | 0)) { const t = -y / th, x = lean * t * t, r = tr * (1 - 0.4 * t); sLine(S, Math.round(x - r), Math.round(y), Math.round(x + r), Math.round(y - 1), 40, tone(PALMT, 0.08)); }   // the rings
  const rp = five(leafRamp(clamp(o.c[2] * 0.5 + 0.2, 0, 0.5))), tx = lean, ty = -th, nf = 9 + ((R() * 3) | 0);
  for (let f = 0; f < nf; f++) {   // the fronds, the far ones first
    const back = f < 3, a = back ? -Math.PI * (0.25 + 0.5 * (f + R() * 0.6) / 3) : -Math.PI * (1.08 - 1.16 * (f - 3 + R() * 0.5) / (nf - 4)), len = L * (back ? 0.75 : 0.9 + R() * 0.25), droop = 0.55 + R() * 0.3, z = back ? 2 : 6 + f;
    let qx = tx, qy = ty;
    for (let k = 1; k <= 18; k++) {
      const s = k / 18, x = tx + Math.cos(a) * len * s, y = ty + Math.sin(a) * len * s + droop * len * s * s * 0.7, dx = x - qx, dy = y - qy, dl = Math.hypot(dx, dy) || 1, b = back ? 0.3 : 0.55 + 0.3 * (1 - s);
      sCap(S, qx, qy, 1.7 * (1 - s * 0.5), x, y, 1.5 * (1 - s * 0.6), z + 1, rp, { seed: o.seed + f * 13 + k, shift: back ? -0.25 : 0.05 });
      const ll = len * 0.3 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.08)), 0.6) + 2;   // the leaflets: longest at the middle of the frond, hanging to both sides and down
      for (const sd of [-1, 1]) { const ex = x - dy / dl * sd * ll * 0.55 + dx / dl * ll * 0.3, ey = y + dx / dl * sd * ll * 0.55 + Math.abs(ll) * 0.55; sLine(S, Math.round(x), Math.round(y), Math.round(ex), Math.round(ey), z, tone(rp, b - (sd < 0 ? 0.22 : 0))); sLine(S, Math.round(x + 1), Math.round(y), Math.round(ex + 1), Math.round(ey), z - 0.3, tone(rp, b - (k & 1 ? 0.12 : 0.34))); sLine(S, Math.round(x - 1), Math.round(y), Math.round(ex - 1), Math.round(ey), z - 0.5, tone(rp, b - 0.3)); }   // (three pixels wide and close together: the frond is a blade with a combed edge, not a row of wires)
      qx = x; qy = y;
    }
  }
  sBall(S, tx, ty - 2, 7, 28, rp, { seed: o.seed + 59, stip: 0.1, shift: -0.1 });   // the heart of the crown
  for (let k = 0; k < 3; k++) sBall(S, tx + (k - 1) * 4.5 + (R() - 0.5) * 2, ty + 5 + (k & 1) * 2, 3.1, 30, BARK, { seed: o.seed + 60 + k, stip: 0.1 });   // coconuts
  sDone(S, 0.55); S.wind = null;
  return S;
}
function mkCactus(o, R) {   // a saguaro: a ribbed column with a rounded top, one to three arms that go out and then up, a few flowers at the tips
  const H = o.H, r = 5 + H * 0.045, W = Math.ceil(r * 12 + 30), HH = Math.ceil(H + 30), S = sculpt(W, HH, W >> 1, HH - 8);
  const col = (x0, y0, x1, y1, rr, sd) => { sCap(S, x0, y0, rr, x1, y1, rr * 0.9, 0, CACTR, { seed: sd, cel: true });
    if (Math.abs(y1 - y0) > Math.abs(x1 - x0)) for (const k of [-0.5, 0.15]) sLine(S, Math.round(x0 + k * rr), Math.round(y0 - 1), Math.round(x1 + k * rr), Math.round(y1 + rr * 0.5), 60, tone(CACTR, 0.12));   // the ribs: dark furrows down its length
    if (R() < 0.6) sBall(S, x1, y1 - rr * 0.8, 2.2, 70, CACTF, { seed: sd + 1, cel: true }); };
  col(0, 0, 0, -H * 0.92, r, o.seed + 1);
  const arms = 1 + ((R() * 2.6) | 0);
  for (let k = 0; k < arms; k++) { const sd = k % 2 ? 1 : -1, h0 = H * (0.32 + R() * 0.25), out = r * (2.2 + R() * 1.1), h1 = Math.min(H * 0.88, h0 + H * (0.2 + R() * 0.2)), ra = r * 0.62;
    sCap(S, sd * r * 0.5, -h0, ra, sd * out, -h0 - ra * 0.4, ra, sd * 0 - 1, CACTR, { seed: o.seed + 10 + k, cel: true }); col(sd * out, -h0 - ra * 0.4, sd * out, -h1, ra, o.seed + 20 + k); }
  sDone(S, 0.5); S.wind = null;
  return S;
}
function mkAcacia(o, R) {   // the savanna's tree: a leaning trunk that forks into spreading boughs under one wide, flat crown
  const H = o.H, rx = o.rx, c = o.c, tr = 4.5 + H * 0.028, lean = (R() - 0.5) * H * 0.22, cz = H * 0.8, ry = rx * 0.17 + 6;
  const W = Math.ceil(rx * 2.7 + 44), HH = Math.ceil(H + ry * 2 + 30), wood = sculpt(W, HH, W >> 1, HH - 10);
  const fkx = lean * 0.45, fky = -H * 0.42;
  sCap(wood, 0, 0, tr, fkx, fky, tr * 0.72, 0, BARK, { seed: o.seed + 3, streak: 0.5 });
  for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4 - 0.5 + (R() - 0.5) * 0.1; sCap(wood, fkx, fky, tr * 0.55, lean + t * rx * 1.5, -cz + ry * 0.5, 1.6, k & 1 ? -1 : 0, BARK, { seed: o.seed + 5 + k, streak: 0.4 }); }
  sDone(wood, 0.62);
  const list = [], n = 9 + ((R() * 4) | 0);
  for (let i = 0; i < n; i++) { const t = (i + R() * 0.7) / n - 0.5; list.push({ cid: 100 + i, x: lean + t * rx * 1.9, y: -cz - ry * (0.2 + 0.5 * R()) + Math.abs(t) * ry * 1.1, rx: rx * (0.3 + 0.12 * R()), ry: ry * (0.75 + 0.3 * R()), move: true }); }
  list.push({ cid: 2, x: lean, y: -cz, rx: rx * 0.86, ry: ry, move: false });
  const flat = sculpt(W, HH, W >> 1, HH - 10); flat.px.set(wood.px);
  const wind = leafCrown(flat, o.seed, list, five(leafRamp(c[2] + (R() - 0.5) * 0.06)), !o.flat);
  sDone(flat, 0);
  flat.wind = wind ? { wood, parts: wind.parts, core: wind.core, cx: wind.cx, cy: wind.cy } : null;
  return flat;
}
function mkTree(o) {
  if (o.hf !== undefined && !o.hs) {   // T451: a host's tree: sculpted at most HMAX px tall from a copy of it, drawn larger by S.sk (its true size stays its own)
    const sk = Math.max(1, o.H / HMAX), q = Object.assign({}, o, { H: Math.round(o.H / sk), rx: Math.max(8, Math.round(o.rx / sk)), hs: true, spr: null });
    const S = mkTree(q); S.sk = sk; if (S.wind) { S.wind.wood.sk = sk; } return S;
  }
  const R = mulberry32(o.seed), H = o.H, c = o.c, rx = o.rx;
  if (o.hf === 0) return mkConifer(o, R);   // T451: the host's species decides the build, whatever the biome
  if (o.hf === 3) return mkPalm(o, R);
  if (o.hf === 5) return mkCactus(o, R);   // T454: the desert's own, and the bushes, shrubs and grasses a host plants
  if (o.hf === 7) return mkAcacia(o, R);
  if (o.hf === 6) { const B = mkBush(o); B.wind = null; return B; }
  if (o.hf === undefined) {
    if (c[0] < CONT) return mkConifer(o, R);
    if (t2(c[0])) return BT2 === 1 ? mkPalm(o, R) : BT2 === 2 ? mkCactus(o, R) : mkAcacia(o, R);   // the biome's own tree
    if (t3(c[0])) return mkAcacia(o, R);   // its second: a thorn tree, low and flat-topped
  }
  const airy = sstep(0.66, 0.95, c[0]), trunkH = H * (0.26 + R() * 0.08), tr = 5 + H * 0.03, tk = airy > 0.5 ? 0.62 : 1, bark = airy > 0.5 ? BIRCH : BARK, lean = (R() - 0.5) * H * 0.14;
  const ryc = Math.min(H * 0.27, rx * 0.66), cz = trunkH + ryc * 1.05;
  const W = Math.ceil(rx * 3.2 + 44), HH = Math.ceil(cz + ryc * 1.75 + rx * 0.5 + 24), wood = sculpt(W, HH, W >> 1, HH - 10);
  const b1x = lean * 0.4, b1y = -trunkH * 0.55, b2x = lean, b2y = -trunkH * 1.2;
  if (airy <= 0.5) { sCap(wood, -tr * 1.25, 1, tr * 0.5, -tr * 0.2, -tr * 1.6, tr * 0.8, -2, bark, { seed: o.seed + 1, stip: 0.25, streak: 0.4 }); sCap(wood, tr * 1.3, 2, tr * 0.5, tr * 0.2, -tr * 1.6, tr * 0.8, -2, bark, { seed: o.seed + 2, stip: 0.25, streak: 0.4 }); }
  sCap(wood, 0, 0, tr * tk, b1x, b1y, tr * 0.8 * tk, 0, bark, { seed: o.seed + 3, stip: 0.25, streak: 0.55 });
  sCap(wood, b1x, b1y, tr * 0.8 * tk, b2x, b2y, tr * 0.55 * tk, 0, bark, { seed: o.seed + 4, stip: 0.25, streak: 0.55 });
  if (airy > 0.5) for (let k = 0; k < 12; k++) { const t = R(), y = -trunkH * 1.1 * t, x = lean * t * 0.7 + (R() - 0.5) * tr * 0.5; sLine(wood, x - 2, y, x + 1 + R() * 2, y, 99, tone(BARK, 0.1)); }   // birch marks
  const list = [];
  for (let i = 0; i < 5; i++) { const side = i % 2 ? 1 : -1; list.push({ cid: 10 + i, x: lean + side * rx * (0.5 + 0.4 * R()), y: -cz + ryc * (-0.45 + 1.15 * R()), rx: rx * (0.4 + 0.15 * R()), ry: rx * (0.33 + 0.12 * R()), move: true }); }   // beside the trunk
  const nt = Math.round((9 + R() * 5) * (1 - airy * 0.35));
  for (let i = 0; i < nt; i++) { const a = -3.5 + 3.85 * (i + R()) / nt, rr = 0.7 + 0.45 * R(); list.push({ cid: 100 + i, x: lean + Math.cos(a) * rx * rr, y: -cz + Math.sin(a) * ryc * (0.9 + 0.6 * R()), rx: rx * (0.33 + 0.12 * R()), ry: rx * (0.25 + 0.11 * R()), move: true }); }   // at the branch ends, round the top
  list.push({ cid: 2, x: lean, y: -cz, rx: rx * (airy > 0.5 ? 0.78 : 0.92), ry: ryc, move: false });                    // the core, over them all
  for (let k = 0; k < 4 && k < nt; k++) { const L = list[5 + ((k * 3) % nt)]; sCap(wood, b1x, b1y * 1.3, tr * 0.5, L.x, L.y + L.ry * 0.4, 1.4, 0, bark, { seed: o.seed + 5 + k, stip: 0.2 }); }
  sDone(wood, 0.62);
  const flat = sculpt(W, HH, W >> 1, HH - 10); flat.px.set(wood.px);
  const rp = c[2] >= 0.6 && c[2] < 0.86 ? GFOL[(o.seed >>> 4) % 3] : five(leafRamp(c[2] + (R() - 0.5) * 0.06));
  const wind = leafCrown(flat, o.seed, list, rp, !o.flat);
  sDone(flat, 0);
  flat.wind = wind ? { wood, parts: wind.parts, core: wind.core, cx: wind.cx, cy: wind.cy } : null;
  return flat;
}
function mkConifer(o, R) {   // a conifer in the same leaves: tiers of flattened clusters, wide at the foot, each over the one below; in wind every tier moves
  const H = o.H, trunkH = H * 0.14, tiers = 7 + ((R() * 4) | 0), R0 = o.rx, W = Math.ceil(R0 * 2.9 + 36), HH = Math.ceil(H + 36), wood = sculpt(W, HH, W >> 1, HH - 10), lean = (R() - 0.5) * H * 0.05;
  sCap(wood, 0, 0, 4 + H * 0.012, lean, -H * 0.9, 1.5, 0, BARK, { seed: o.seed + 3, stip: 0.25, streak: 0.5 });
  sDone(wood, 0.62);
  const list = [];
  for (let k = 0; k < tiers; k++) { const f = k / (tiers - 1), rk = R0 * (1 - f * 0.84) + 4; list.push({ cid: 100 + k, x: lean * f + (R() - 0.5) * rk * 0.16, y: -(trunkH + 10 + f * (H - trunkH - 24)), rx: rk, ry: rk * 0.4 + 6, move: true }); }
  const flat = sculpt(W, HH, W >> 1, HH - 10); flat.px.set(wood.px);
  const wind = leafCrown(flat, o.seed, list, five(mixRamp(CONIF, LEAF[0], o.c[2] * 0.6)), !o.flat);
  sDone(flat, 0);
  flat.wind = wind ? { wood, parts: wind.parts, core: null, cx: 0, cy: 0 } : null;
  return flat;
}
function mkBush(o) {
  const R = mulberry32(o.seed), H = o.H, rx = o.rx, W = Math.ceil(rx * 3 + 20), HH = Math.ceil(H * 1.2 + 26), S = sculpt(W, HH, W >> 1, HH - 6), list = [];
  for (let i = 0; i < 4; i++) { const a = -2.9 + 2.7 * (i + R()) / 4; list.push({ cid: 100 + i, x: Math.cos(a) * rx * 0.75, y: -H * 0.45 + Math.sin(a) * H * 0.4, rx: rx * (0.4 + 0.15 * R()), ry: rx * (0.3 + 0.12 * R()), move: false }); }
  list.push({ cid: 2, x: 0, y: -H * 0.42, rx: rx * 0.82, ry: H * 0.4, move: false });
  leafCrown(S, o.seed, list, o.c[2] >= 0.6 && o.c[2] < 0.86 ? GFOL[(o.seed >>> 4) % 3] : five(leafRamp(o.c[2] * 0.7 + (R() - 0.5) * 0.08)), false);
  if (o.c[3] > 0.55) {                                       // flowers or berries
    const pr = PETAL[(o.c[0] * 4.99) | 0], n = 10 + ((R() * 24) | 0);
    for (let k = 0; k < n; k++) { const x = Math.round((R() - 0.5) * rx * 1.6), y = Math.round(-R() * H * 0.9), i = (y + S.ay) * S.w + x + S.ax; if (S.px[i]) { S.px[i] = tone(pr, 0.5 + R() * 0.5); if (R() < 0.4 && S.px[i - S.w]) S.px[i - S.w] = tone(pr, 0.95); } }
  }
  for (let y = S.ay; y < S.h; y++) for (let x = 0; x < S.w; x++) S.px[y * S.w + x] = 0;   // nothing below the ground line
  const out = sDone(S, 0); out.wind = null;
  return out;
}
function mkRock(o) {
  const R = mulberry32(o.seed), rx = o.rx, ry = rx * (0.5 + R() * 0.32), W = Math.ceil(rx * 2 + 8), HH = Math.ceil(ry * 2 + 8), cy = -ry * 0.56, S = sculpt(W, HH, W >> 1, HH - 4 - Math.ceil(ry * 0.3));
  const rp = o.c[2] > 0.6 ? ROCKW : ROCKR, p1 = R() * 6.283, p2 = R() * 6.283, p3 = R() * 6.283, a1 = 0.08 + R() * 0.1, a2 = 0.05 + R() * 0.08, mossy = 0.56 - o.c[3] * 0.22, sd = o.seed;
  for (let y = Math.floor(cy - ry * 1.3); y <= ry * 0.5; y++) for (let x = Math.floor(-rx * 1.3); x <= rx * 1.3; x++) {
    const dx = x + 0.5, dy = y + 0.5 - cy, an = Math.atan2(dy, dx), lump = 1 + a1 * Math.sin(an * 2 + p1) + a2 * Math.sin(an * 3 + p2) + 0.05 * Math.sin(an * 5 + p3);
    const qx = dx / (rx * lump), qy = dy / (ry * lump), d2 = qx * qx + qy * qy;
    if (d2 > 1) continue;
    const base = 0.2 * ry * Math.sqrt(Math.max(0, 1 - (dx / rx) * (dx / rx)));   // the ground line bulges toward the camera
    if (y > base) continue;
    const fx = Math.floor((x + (hash2(3, y >> 2, sd) - 0.5) * 5) / 6), fy = Math.floor((y + (hash2(x >> 2, 5, sd + 1) - 0.5) * 4) / 5);   // facets: jittered cells, each with its own tilt
    let nx = qx + (hash2(fx, fy, sd + 2) - 0.5) * 0.8, ny = qy + (hash2(fx, fy, sd + 3) - 0.5) * 0.8, nz = Math.sqrt(1 - d2);
    const l = 1 / Math.hypot(nx, ny, nz); nx *= l; ny *= l; nz *= l;
    let t = 0.5 + 0.5 * (nx * LVX + ny * LVY + nz * LVZ), r2 = rp;   // (each facet one tone: no grain)
    if (ny < -0.25 && vnoise(x / 5 + 9, y / 4, sd + 5) > mossy) { r2 = MOSSR; t += 0.05; }
    if (y > base - 2) t -= 0.25;
    sPut(S, x, y, nz, tone(r2, t));
  }
  return sDone(S, 0.6);
}
function mkGrass(o, reed) {
  const R = mulberry32(o.seed), H = o.H, W = Math.ceil(H * 1.5 + 14), HH = H + 10, S = sculpt(W, HH, W >> 1, HH - 3);
  const rp = reed ? REEDR : mixRamp(BLADE, STRAW, clamp(o.c[2] * 1.2 - 0.1, 0, 1)), n = Math.round(10 + o.c[3] * 22), heads = !reed && o.c[0] > 0.45;
  for (let i = 0; i < n; i++) {
    const bx = (R() - 0.5) * H * (reed ? 0.5 : 0.36), lean = reed ? (R() - 0.5) * H * 0.22 - H * 0.04 : (R() - 0.5) * H * 0.95 - H * 0.08, len = H * (0.5 + R() * 0.5), droop = reed ? 0 : len * 0.3 * Math.abs(lean) / (H * 0.5), j = (R() - 0.5) * 0.12;
    let x = bx, y = 0;
    for (let s = 0; s <= len; s++) { const t = s / len; x = bx + lean * t * t; y = -len * t + droop * t * t * t; sPut(S, Math.round(x), Math.round(y), i, tone(rp, 0.12 + 0.8 * t + j)); if (reed && t < 0.6) sPut(S, Math.round(x) + 1, Math.round(y), i, tone(rp, 0.05 + 0.6 * t + j)); }
    if (reed && R() < 0.35) for (let k = 0; k < 7; k++) { sPut(S, Math.round(x), Math.round(y) + k, i + 0.5, tone(BARK, 0.3 + (k < 2 ? 0.2 : 0))); sPut(S, Math.round(x) + 1, Math.round(y) + k, i + 0.5, tone(BARK, 0.55)); }   // a cattail
    else if (heads && R() < 0.55) { const hc = tone(STRAW, 0.8 + R() * 0.2); sPut(S, Math.round(x), Math.round(y), i + 0.5, hc); sPut(S, Math.round(x), Math.round(y) - 1, i + 0.5, hc); if (R() < 0.5) sPut(S, Math.round(x) + (lean > 0 ? 1 : -1), Math.round(y), i + 0.5, hc); }
  }
  return sDone(S, 0);
}
function mkFlower(o) {
  const R = mulberry32(o.seed), H = o.H, kind = Math.min(4, (o.c[0] * 5) | 0), pr = PETAL[kind], n = 3 + ((o.c[3] * 6 + R() * 2) | 0), W = H + 30, HH = H + 14, S = sculpt(W, HH, W >> 1, HH - 3);
  for (let i = 0; i < n; i++) {
    const bx = Math.round((R() - 0.5) * (H * 0.9 + 8)), h = Math.round(H * (0.55 + R() * 0.45)), lean = (R() - 0.5) * 5, z = i * 2;
    for (let s = 0; s <= h; s++) sPut(S, bx + Math.round(lean * s / h * s / h), -s, z, tone(BLADE, 0.25 + 0.4 * s / h));
    for (let k = 0; k < 2; k++) { const d = k ? 1 : -1; sLine(S, bx, -1 - k, bx + d * (2 + ((R() * 3) | 0)), -3 - ((R() * 3) | 0), z, tone(BLADE, 0.55)); }   // leaves
    const x = bx + Math.round(lean), y = -h;
    if (kind === 0) { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [-1, -1], [1, -1], [1, 1], [-1, 1]]) sPut(S, x + dx, y + dy, z + 1, tone(pr, dy < 0 || dx > 0 ? 0.95 : 0.4)); sPut(S, x, y, z + 2, tone(PETAL[4], 0.5)); }   // daisy
    else if (kind === 1) { for (let dy = -2; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) < 4) sPut(S, x + dx, y + dy, z + 1, tone(pr, dy < -1 ? 0.95 : dx > 0 ? 0.6 : 0.2)); sPut(S, x, y, z + 2, tone(BARK, 0.05)); }   // poppy
    else if (kind === 2) { for (let k = 0; k < 9; k++) { const w = k < 2 ? 0 : k < 6 ? 1 : 1; for (let dx = -w; dx <= w; dx++) if (R() < 0.85) sPut(S, x + dx, y + 4 - k, z + 1, tone(pr, 0.15 + k / 9 * 0.8 + (dx > 0 ? 0.1 : 0))); } }   // lupin spike
    else if (kind === 3) { for (let k = 0; k < 3; k++) { const hx = x + 1 + k, hy = y + 1 + k * 2; sPut(S, hx, hy, z + 1, tone(pr, 0.9)); sPut(S, hx, hy + 1, z + 1, tone(pr, 0.5)); sPut(S, hx + 1, hy + 1, z + 1, tone(pr, 0.2)); } }   // bluebell
    else { sPut(S, x, y, z + 1, tone(pr, 0.95)); sPut(S, x + 1, y, z + 1, tone(pr, 0.6)); sPut(S, x, y + 1, z + 1, tone(pr, 0.5)); sPut(S, x + 1, y + 1, z + 1, tone(pr, 0.2)); }   // buttercup
  }
  return sDone(S, 0);
}
function mkGlowcap(o) {
  const R = mulberry32(o.seed), H = o.H, hue = Math.min(2, (o.c[2] * 3) | 0), gr = GLOWS[hue], n = 1 + ((R() * 3.5) | 0), W = H * 2 + 30, HH = H + 14, S = sculpt(W, HH, W >> 1, HH - 3);
  for (let i = 0; i < n; i++) {
    const bx = (i === 0 ? 0 : (R() - 0.5) * (H * 1.3 + 8)), h = H * (i === 0 ? 1 : 0.4 + R() * 0.5), lean = (R() - 0.5) * h * 0.3, cr = 3 + h * (0.28 + R() * 0.12), z = i * 30 + (bx > 0 ? 1 : 0);
    sCap(S, bx, 0, 1.6 + h * 0.04, bx + lean, -h + cr * 0.3, 1.2 + h * 0.03, z, STEMR, { seed: o.seed + i, stip: 0.15 });
    const cx = bx + lean, cy = -h + cr * 0.45;
    for (let y = Math.floor(cy - cr * 0.8); y <= cy; y++) for (let x = Math.floor(cx - cr); x <= cx + cr; x++) {   // the cap: a low dome that glows
      const dx = (x + 0.5 - cx) / cr, dy = (y + 0.5 - cy) / (cr * 0.8), d2 = dx * dx + dy * dy; if (d2 > 1) continue;
      const t = 0.42 + 0.3 * dx - 0.42 * dy + (hash2(x, y, o.seed + 40 + i) > 0.86 ? 0.4 : 0);
      sPut(S, x, y, z + 20, tone(gr, t, true));
    }
    for (let x = Math.floor(cx - cr * 0.8); x <= cx + cr * 0.8; x++) sPut(S, x, Math.floor(cy) + 1, z + 19, tone(STEMR, 0.1));   // the gills' shadow
  }
  return sDone(S, 0);
}
function mkCrystal(o) {
  const R = mulberry32(o.seed), H = o.H, hue = Math.min(2, (o.c[2] * 3) | 0), cr = CRYS[hue], n = 2 + ((R() * 4) | 0), W = H * 2 + 24, HH = H + 14, S = sculpt(W, HH, W >> 1, HH - 3);
  for (let k = 0; k < 10; k++) sPut(S, Math.round((R() - 0.5) * H), Math.round(-R() * 2), 0, tone(ROCKR, 0.1 + R() * 0.3));   // rubble at the foot
  for (let i = 0; i < n; i++) {
    const b = (i === 0 ? 0 : (R() - 0.5) * H * 0.9), hh = H * (i === 0 ? 1 : 0.35 + R() * 0.55), w = 1.6 + hh * (0.09 + R() * 0.05), tilt = (i === 0 ? (R() - 0.5) * 0.25 : (b > 0 ? 1 : -1) * (0.15 + R() * 0.5)) * hh, z = i === 0 ? 5 : R() * 4;
    for (let s = 0; s <= hh; s++) {
      const t = s / hh, xc = b + tilt * t, ww = t > 0.82 ? w * (1 - t) / 0.18 : w;
      for (let x = Math.floor(xc - ww); x <= xc + ww; x++) { const d = x + 0.5 - xc; sPut(S, x, -Math.round(s), z, tone(cr, t > 0.82 ? 0.85 : Math.abs(d) < 0.7 ? 0.95 : d > 0 ? 0.55 : 0.12, true)); }
    }
  }
  return sDone(S, 0);
}
````
