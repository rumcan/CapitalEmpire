## cart The golf cart
The golf cart is built the way the golfer is (parts/06-golfer.md mkGolfer): a figure of small blocks, thirty to the metre, its boxes rounded, each block shaded by which way the blocks round it open, four flat tones, the one sun at the upper right. It is a real cart's size and shape.
R: The cart is 2.4 m long and 1.2 m wide: a white tub with a green stripe and a rounded nose, black bumpers, two lamps, a tan bench seat with a back, a green roof with a white rim on four dark posts, the windscreen a thin light frame from the dash to the roof, a steering wheel on its column before the driver's seat, a deck at the back with a light bag rack and two golf bags leaning on it with their club heads showing, and four small wheels with dark tyres and light hubs; the front wheels turn as it steers.
R: Its blocks are laid once; a picture is made from them for each of 32 headings as the camera sees the cart and kept, so a frame only draws a picture (and makes at most one new one: a turn quicker than that shows the nearest heading already made).
R: Each pixel of the picture keeps how near it is, so a rider sits inside the cart (the parts nearer than him cover him), the ground in front hides it, and of two carts the nearer covers the other. It stands on the ground under its four wheels and leans with the slope across the view; it casts the shadow of its roof and body away from the sun.
File: game.js
Check: function cartBlocks(
Check: function cartPic(
Check: function drawCart(

````js file=game.js

// ---- the golf cart (the owner: "need better looking player and cart"): blocks like the golfer's, at a real cart's size (right, forward, up; metres)
const CV = 30, CNA = 40, CNF = 76, CNZ = 60, CA0 = -0.665, CF0 = -1.265;   // the grid: 1.33 m across, 2.53 m long, 2 m tall
const CMAT = [null, CARTW, CARTG, TYRER, STEELR, SEATR, CAPR, BAGR, POLOR, STEELR, LAMPR, TYRER];
const C_BODY = 1, C_GREEN = 2, C_TYRE = 3, C_HUB = 4, C_SEAT = 5, C_FRAME = 6, C_BAG1 = 7, C_BAG2 = 8, C_HEAD = 9, C_LAMP = 10, C_DARK = 11;
const CART_WB = 0.78, CART_TR = 0.52, CART_WR = 0.2;   // the wheels: front and rear 0.78 m from the middle, their middles 0.52 m to either side, 0.2 m round
const cartVox = new Map();   // the steer step (-1, 0, 1) -> the blocks on the surface: [a, f, z, na, nf, nz] each, and their materials
function cartBlocks(st) {
  let L = cartVox.get(st); if (L) return L;
  const V = new Uint8Array(CNA * CNF * CNZ), s = 1 / CV, N1 = CNA, N2 = CNA * CNF;
  const put = (a, f, z, m) => { const i = Math.round((a - CA0) * CV), j = Math.round((f - CF0) * CV), k = Math.round(z * CV); if (i >= 0 && j >= 0 && k >= 0 && i < CNA && j < CNF && k < CNZ) V[(k * CNF + j) * CNA + i] = m; };
  // a box from (a0, f0, z0) to (a1, f1, z1), its edges rounded by r; keep: a test each block must pass
  const box = (a0, a1, f0, f1, z0, z1, m, r = 0, keep = null) => {
    for (let z = z0; z <= z1 + 1e-6; z += s) for (let f = f0; f <= f1 + 1e-6; f += s) for (let a = a0; a <= a1 + 1e-6; a += s) {
      if (r > 0) { const da = Math.max(0, a0 + r - a, a - (a1 - r)), df = Math.max(0, f0 + r - f, f - (f1 - r)), dz = Math.max(0, z0 + r - z, z - (z1 - r)); if (da * da + df * df + dz * dz > r * r) continue; }
      if (keep && !keep(a, f, z)) continue;
      put(a, f, z, m);
    }
  };
  const rod = (A, B, w, m) => { const n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]) * CV * 1.5)); for (let k = 0; k <= n; k++) { const t = k / n, a = A[0] + (B[0] - A[0]) * t, f = A[1] + (B[1] - A[1]) * t, z = A[2] + (B[2] - A[2]) * t; box(a - w, a + w, f - w, f + w, z - w, z + w, m); } };
  const well = (a, f, z) => Math.abs(a) > 0.34 && Math.hypot(Math.abs(f) - CART_WB, z - CART_WR) < CART_WR + 0.06;   // round each wheel the body is cut away
  const foot = (a, f, z) => Math.abs(a) < 0.5 && f > 0.06 && f < 0.4 && z > 0.4;                                    // the footwell before the seat
  // the body: a white tub with a green stripe, its rounded nose over the front wheels, black bumpers, two lamps, the dash
  box(-0.55, 0.55, -1.16, 1.12, 0.24, 0.56, C_BODY, 0.07, (a, f, z) => !well(a, f, z) && !foot(a, f, z));
  box(-0.565, 0.565, -1.17, 1.13, 0.42, 0.47, C_GREEN, 0, (a, f, z) => !well(a, f, z) && !foot(a, f, z));
  box(-0.53, 0.53, 0.4, 1.16, 0.56, 0.74, C_BODY, 0.1);
  box(-0.5, 0.5, 1.13, 1.22, 0.26, 0.38, C_DARK, 0.03); box(-0.5, 0.5, -1.22, -1.15, 0.26, 0.36, C_DARK, 0.03);
  for (const sd of [-1, 1]) box(sd * 0.35 - 0.06, sd * 0.35 + 0.06, 1.12, 1.17, 0.6, 0.67, C_LAMP);
  box(-0.52, 0.52, 0.38, 0.46, 0.56, 0.96, C_BODY, 0.03);
  // the bench: a tan cushion and its back
  box(-0.5, 0.5, -0.5, 0.06, 0.56, 0.71, C_SEAT, 0.05); box(-0.5, 0.5, -0.6, -0.48, 0.66, 1.12, C_SEAT, 0.05);
  // the deck behind it, the bag rack (a light frame), two bags leaning back on it with a green band and their club heads out of the top
  box(-0.53, 0.53, -1.14, -0.62, 0.56, 0.62, C_BODY, 0.02);
  for (const sd of [-1, 1]) rod([sd * 0.42, -1.06, 0.62], [sd * 0.42, -1.06, 1.18], 0.017, C_FRAME);
  rod([-0.42, -1.06, 1.18], [0.42, -1.06, 1.18], 0.017, C_FRAME); rod([-0.42, -1.06, 0.86], [0.42, -1.06, 0.86], 0.017, C_FRAME);
  for (const [ca, m, top] of [[-0.2, C_BAG1, 1.3], [0.2, C_BAG2, 1.24]]) {
    for (let z = 0.62; z <= top + 1e-6; z += s) { const cf = -0.86 - (z - 0.62) * 0.18; for (let f = cf - 0.13; f <= cf + 0.13; f += s) for (let a = ca - 0.13; a <= ca + 0.13; a += s) if ((a - ca) * (a - ca) + (f - cf) * (f - cf) <= 0.0156) put(a, f, z, Math.abs(z - 0.95) < 0.03 ? C_GREEN : m); }
    const cf = -0.86 - (top - 0.62) * 0.18;
    for (const [da, df, h] of [[-0.05, -0.02, 0.09], [0.04, 0.03, 0.12], [0, -0.06, 0.06]]) box(ca + da - 0.025, ca + da + 0.025, cf + df - 0.03, cf + df + 0.03, top, top + h, C_HEAD);
  }
  // the roof (green, a white rim) on four dark posts; the windscreen: a thin light frame from the dash to the roof
  for (const sd of [-1, 1]) { rod([sd * 0.5, 0.42, 0.95], [sd * 0.5, 0.42, 1.8], 0.022, C_DARK); rod([sd * 0.5, -0.66, 0.62], [sd * 0.5, -0.66, 1.8], 0.022, C_DARK); }
  box(-0.6, 0.6, -0.82, 0.58, 1.81, 1.88, C_GREEN, 0.04); box(-0.61, 0.61, -0.83, 0.59, 1.78, 1.81, C_BODY);
  rod([-0.47, 0.45, 0.97], [0.47, 0.45, 0.97], 0.012, C_FRAME); rod([-0.47, 0.47, 1.76], [0.47, 0.47, 1.76], 0.012, C_FRAME);
  for (const sd of [-1, 1]) rod([sd * 0.47, 0.45, 0.97], [sd * 0.47, 0.47, 1.76], 0.012, C_FRAME);
  // the steering: a column from the dash and a dark wheel tilted toward the driver (he sits 0.21 m to the left of the middle)
  rod([-0.21, 0.4, 0.86], [-0.21, 0.16, 1.08], 0.018, C_DARK);
  for (let t = 0; t < 6.2832; t += 0.03) for (const r of [0.14, 0.155]) put(-0.21 + Math.cos(t) * r, 0.14 - Math.sin(t) * r * 0.5, 1.12 + Math.sin(t) * r * 0.866, C_DARK);
  // the wheels: dark tyres, light hubs on their outer sides; the front ones turned by the steer (to the right for a positive steer, as driveCart turns)
  for (const sf of [-1, 1]) for (const sd of [-1, 1]) {
    const fc = sf * CART_WB, ac = sd * CART_TR, an = sf > 0 ? st * 0.32 : 0, c = Math.cos(an), sn = Math.sin(an);
    for (let z = 0; z <= CART_WR * 2 + 1e-6; z += s) for (let df = -0.24; df <= 0.24; df += s) for (let da = -0.24; da <= 0.24; da += s) {
      const u = da * c - df * sn, w = da * sn + df * c, r = Math.hypot(w, z - CART_WR);   // u: along the axle, w: the way the wheel rolls
      if (Math.abs(u) > 0.08 || r > CART_WR) continue;
      put(ac + da, fc + df, z, r < 0.1 && u * sd > 0.04 ? C_HUB : C_TYRE);
    }
  }
  // the blocks on the surface, each with the way it faces: toward the empty blocks among its 26 neighbours (smooth, so round parts are shaded round)
  const A = [], M = [];
  for (let k = 0; k < CNZ; k++) for (let j = 0; j < CNF; j++) for (let i = 0; i < CNA; i++) {
    const q = k * N2 + j * N1 + i, m = V[q]; if (!m) continue;
    if (i > 0 && j > 0 && k > 0 && i < CNA - 1 && j < CNF - 1 && k < CNZ - 1 && V[q + 1] && V[q - 1] && V[q + N1] && V[q - N1] && V[q + N2] && V[q - N2]) continue;   // buried
    let ea = 0, ef = 0, eu = 0;
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i2 = i + di, j2 = j + dj, k2 = k + dk; if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= CNA || j2 >= CNF || k2 >= CNZ || !V[k2 * N2 + j2 * N1 + i2]) { ea += di; ef += dj; eu += dk; } }
    A.push(CA0 + i / CV, CF0 + j / CV, k / CV, ea, ef, eu); M.push(m);
  }
  L = { b: Float32Array.from(A), m: Uint8Array.from(M) }; cartVox.set(st, L); return L;
}
// the cart's picture for heading h (32nds of a turn as the camera sees it: 0 to the screen's right, 8 toward the camera), steer step st, sculpture scale K.
// Each pixel keeps how far it stands toward the camera from the cart's middle, on the ground (cz, 40ths of a metre): what a rider and the ground are
// sorted against.
const cartPics = new Map();
let cartMade = -1;   // the frame the last picture was made in
function cartPic(h, st, K) {
  const kk = (K === GK ? 0 : 1000) + st * 32, have = cartPics.get(h + kk); if (have) return have;
  if (cartMade === frame) for (let d = 1; d < 16; d++) for (const e of [h + d, h - d]) { const S = cartPics.get((((e % 32) + 32) % 32) + kk); if (S) return S; }   // (one a frame: the nearest made)
  cartMade = frame;
  const th = h / 32 * 6.2832, fx = Math.cos(th), fy = Math.sin(th), rx = -fy, ry = fx, B = cartBlocks(st), b = B.b, n = B.m.length;
  const S = sculpt(Math.ceil(170 * K), Math.ceil(205 * K), Math.round(85 * K), Math.round(160 * K)), cz = new Int8Array(S.w * S.h), sc = 56 * K / CV, bw = Math.ceil(sc), bh = Math.ceil(sc * 1.25);
  for (let q = 0; q < n; q++) {
    const o = q * 6, a = b[o], f = b[o + 1], z = b[o + 2], ea = b[o + 3], ef = b[o + 4], eu = b[o + 5];
    const X = ea * rx + ef * fx, Y = ea * ry + ef * fy, nx = X, ny = -eu * 0.866 + Y * 0.5, nz = Y * 0.866 + eu * 0.5, l = Math.hypot(nx, ny, nz) || 1;
    let t = 0.5 + 0.5 * (nx * LVX + ny * LVY + nz * LVZ) / l; t = t < 0.3 ? 0.12 : t < 0.52 ? 0.38 : t < 0.74 ? 0.62 : 0.9;   // four flat tones
    const m = B.m[q], col = tone(CMAT[m], t, m === C_LAMP), PX = a * rx + f * fx, PY = a * ry + f * fy, pz = (PY * 48.5 + z * 28) * K, dz = Math.round(PY * 40);
    const x0 = Math.round(PX * 56 * K - sc / 2) + S.ax, y0 = Math.round((-z * 56 + PY * 28) * K - sc * 0.75) + S.ay;
    for (let dy = 0; dy < bh; dy++) { const y = y0 + dy; if (y < 0 || y >= S.h) continue; for (let dx = 0; dx < bw; dx++) { const x = x0 + dx; if (x < 0 || x >= S.w) continue; const i = y * S.w + x; if (pz >= S.zb[i]) { S.zb[i] = pz; S.px[i] = col; cz[i] = dz; } } }
  }
  sDone(S, 0.42); S.cz = cz; cartPics.set(h + kk, S); return S;
}
// a cart picture on the screen at scale s, its middle at (bx, by) dC metres away; ls: how much its pixels drop for each pixel to the right (its lean).
// It writes the cart depth buffer (czB, czS) that a rider is drawn against.
function cartBlit(S, bx, by, s, dC, ls) {
  let cz = S.cz;
  if (s < 0.5) { cz = null; while (s < 0.5 && S.w > 6) { S = S.mip || mipOf(S); s *= 2; } s = Math.round(s * 48) / 48; if (s <= 0) return; }   // (far: the shrunk copy, one depth)
  const w = S.w, sp = S.px, inv = 1 / s, x0 = bx - S.ax * s, y0 = by - S.ay * s, Xa = Math.max(0, Math.floor(x0)), Xb = Math.min(VW - 1, Math.ceil(x0 + w * s)), stamp = frame;
  for (let X = Xa; X <= Xb; X++) {
    const sx = ((X + 0.5 - x0) * inv) | 0; if (sx < 0 || sx >= w) continue;
    const sh = ls * (X + 0.5 - bx), Ya = Math.max(0, Math.floor(y0 + sh)), Yb = Math.min(VH - 1, Math.ceil(y0 + sh + S.h * s));
    for (let Y = Ya; Y <= Yb; Y++) {
      const sy = ((Y + 0.5 - y0 - sh) * inv) | 0; if (sy < 0 || sy >= S.h) continue;
      const i = sy * w + sx, c = sp[i]; if (!c) continue;
      const d = cz ? dC - cz[i] * 0.025 : dC, q = Y * VW + X, wv = 1 / d;
      if (zbuf[q] < d * 100 - 30) continue;                 // ground in front of it
      if (czS[q] === stamp && czB[q] >= wv) continue;        // a nearer cart's pixel
      czS[q] = stamp; czB[q] = wv; if (wz[q] > 1) wz[q] = 1;
      fb[q] = (c >>> 24) === 255 ? c : lit(c);
    }
  }
}
const czB = new Float32Array(VW * VH), czS = new Uint32Array(VW * VH), PXs = new Float32Array(12), PYs = new Float32Array(12), PWs = new Float32Array(12);   // (PXs..: the buildings' faces use them too)
let blitW = 0;   // when set, a sprite is hidden where the cart's own depth is nearer than this (1 / distance)
function drawCart(gS, G) {   // gS: the golfer's sitting sprite when he is in it; G: how much its lamps glow
  const dC = (cart.x - camX) * FX + (cart.y - camY) * FY; if (dC < 2.4 || dC > 130) return;
  const th = cart.th, hx = Math.cos(th), hy = Math.sin(th), rx = -hy, ry = hx;
  const gh = (a, f) => groundH(cart.x + a * rx + f * hx, cart.y + a * ry + f * hy);
  const hFL = gh(-CART_TR, CART_WB), hFR = gh(CART_TR, CART_WB), hRL = gh(-CART_TR, -CART_WB), hRR = gh(CART_TR, -CART_WB), zc = (hFL + hFR + hRL + hRR) / 4;   // the ground under its four wheels
  cart.sf += (((hFL + hFR) - (hRL + hRR)) / (4 * CART_WB * PPM) - cart.sf) * 0.3; cart.sr += (((hFR + hRR) - (hFL + hRL)) / (4 * CART_TR * PPM) - cart.sr) * 0.3;   // (its lean, a rise a picture pixel forward and right, as the riders' seats use it)
  cart.zc = Math.abs(zc - cart.zc) > 0.6 ? zc : cart.zc + (zc - cart.zc) * 0.5;
  const z0 = cart.zc, csn = TOD[tmode].glow < 1 ? sunAt(cart.x, cart.y, frame * 0.055) : 1;
  if (dC < 48 && csn > 0.03) { shK = csn;                                                    // its shadow: the roof's and the body's, laid on the ground away from the sun
    for (let f = -0.82; f <= 0.58; f += 0.08) for (let a = -0.6; a <= 0.6; a += 0.08) shadePoint(cart.x + a * rx + f * hx - 0.809 * 1.84, cart.y + a * ry + f * hy + 0.735 * 1.84);
    for (let f = -1.16; f <= 1.2; f += 0.08) for (let a = -0.56; a <= 0.56; a += 0.08) shadePoint(cart.x + a * rx + f * hx - 0.809 * 0.3, cart.y + a * ry + f * hy + 0.735 * 0.3);
    shK = 1;
  }
  project(cart.x, cart.y, z0, PJ); if (PJ.s <= 0) return;
  const K = golferK(DS / dC), h = ((Math.round((th - camYaw) / 6.2832 * 32) % 32) + 32) % 32, st = cart.steer > 0.12 ? 1 : cart.steer < -0.12 ? -1 : 0;   // the heading as this camera sees it
  const ls = clamp((groundH(cart.x - RX * 0.55, cart.y - RY * 0.55) - groundH(cart.x + RX * 0.55, cart.y + RY * 0.55)) / 1.1, -0.4, 0.4);   // the ground's fall from its left to its right on the screen
  cartBlit(cartPic(h, st, K), PJ.x, PJ.y, PJ.s / K, dC, ls);
  if (gS) {                                                          // the golfer at the wheel
    const a = -12, f = -12; project(cart.x + (a * rx + f * hx) / PPM, cart.y + (a * ry + f * hy) / PPM, z0 + f * cart.sf + a * cart.sr, PJ);
    if (PJ.s > 0) { blitW = 1 / PJ.d; blit(gS, PJ.x, PJ.y, PJ.s / golfK, PJ.d * 100 - 80, 0, 0, false, 0); blitW = 0; }
  }
  if (G > 0) for (const sa of [-1, 1]) { project(cart.x + sa * 0.35 * rx + 1.17 * hx, cart.y + sa * 0.35 * ry + 1.17 * hy, z0 + 0.63, PJ); if (PJ.s > 0) addLight(PJ.x, PJ.y, 1.6 * G, 1.3 * G, 0.7 * G); }
}
````
