## golfer The golfer
The golfer is a person in golf clothes: a white cap with a peak and a red button, a red polo shirt with short sleeves and a white collar, bare forearms, a white glove, a belt, khaki trousers, white golf shoes. He carries one club in his hand (his bag rides on the cart). He has shoulders, a neck and a head a fifth of his height. Cinderdeep's lantern hangs at his hip only when the light is low. The golf ball is about the size the whole wanderer was in Cinderdeep.
R: The golfer is a small rig of balls and capsules in three dimensions, turned to one of 16 facings and projected by the game's camera, so every pose and facing is lit by the same sun.
R: Poses: standing with the club's head resting on the grass, an eight-step walk with the club carried at his side, a golf swing from address through the top of the backswing to the finish, and sitting at the cart's wheel.
R: Sprites are made when first needed and kept.
R: A golf cart waits by the tee: a white body with a green stripe and a green roof on four posts, a tan bench seat, a steering wheel, two golf bags on a rack at the back, four small wheels with dark tyres. It is built of blocks like the golfer (parts/08i-cart.md), so its wheels stand on the ground from every view, it leans with the slope, and its front wheels turn.
R: The ball is 5 pixels across; the pin is a pole with a waving ember-red flag.
File: game.js
Check: function mkGolfer(
Check: function mkFlag(

````js file=game.js

// ---- golfer: a rig of balls and capsules
const HOODR = ramp(['#3a2456', '#553276', '#6f4494', '#8c5fb4', '#a983cf']);
const CLOAKR = ramp(['#1e1434', '#2c1c48', '#3c275c', '#4e3472']);
const TUNICR = ramp(['#30204e', '#442c66', '#5a3c80', '#72509c']);
const SKINR = ramp(['#8a5c50', '#b98466', '#e2b48a', '#f6d6ae']);
const LEGR = ramp(['#1c1826', '#2a2436', '#3a3348', '#4c445c']);
const BOOTR = ramp(['#1c1210', '#2c1e18', '#40302a', '#584438']);
const GOLDR = ramp(['#8a5a1e', '#c08a2c', '#e2b034', '#f8dc6c']);
const STEELR = ramp(['#5a6070', '#8a92a2', '#bcc4d0', '#eef2f6']);
const LAMPR = ramp(['#ffb850', '#ffd880', '#fff0c0']);
const EYE = 0xff000000 | (246 << 16) | (255 << 8) | 130, EYE2 = 0xff000000 | (200 << 16) | (210 << 8) | 70;
const POLOR = ramp(['#8e1f2a', '#b82c34', '#dc4440', '#f26a58', '#ff9a80']);
const CAPR = ramp(['#8f97ad', '#b9c0d2', '#dfe4ee', '#ffffff']);
const KHAKIR = ramp(['#6e5a3c', '#8f7850', '#b39a68', '#d4bd86', '#eedaa8']);
const SHOER = ramp(['#6a7186', '#a2a9bb', '#d8dce6', '#ffffff']);
const HAIRR = ramp(['#2c1a12', '#47291a', '#643c24', '#855634']);
const BAGR = ramp(['#14233f', '#1e3560', '#2b4c84', '#3f68a8']);
const BELTR = ramp(['#24160f', '#3a2418', '#553626']);
const FLAGR = ramp(['#8a2418', '#b8341c', '#e05020', '#f87a30', '#ffa850']);

// theta: the facing (plan angle, 0 = screen right, a quarter turn = toward the camera); pose 'i' idle, 'w' walk (ph 0..7), 's' swing (ph = the swing angle in
// radians), 'c' sitting in the cart; lamp: the lantern at his hip (only when the light is low)
// The golfer is sculpted at the size he is seen at (GK: the picture's scale), so at the usual distance one pixel of him is one pixel of the picture: drawn
// from a bigger sculpture shrunk by three quarters, every fourth pixel was dropped and he looked chewed. Three flat tones to a material, no grain; a head
// a little large for his body, as small figures are drawn.
const GK = RS;   // the scale he is sculpted at for the usual view; a second sculpture at twice that is used when the camera is close (see golferK)
function golferK(s) { return s <= RS * 1.15 ? RS : RS * 2; }   // s: the scale a full-size sculpture would be drawn at
const TROUR = ramp(['#16203c', '#1f2f58', '#2a4076', '#3a5696', '#5070b4']);   // his trousers: navy, far from the colour of his skin
// The golfer is a figure of small blocks (voxels, 30 to the metre), built for each pose in his own space (to his right, forward, up; metres) with a
// person's proportions: seven and a half heads tall, legs half his height, shoulders two heads wide, hands reaching mid-thigh. Each block takes the tone
// of the side it shows to the one sun (three flat tones to a material), so the blocks' steps read as folds and edges. Materials: skin, white polo with a
// navy collar and sleeve bands, white trousers, a dark belt with a buckle, white shoes on dark soles, brown hair, a white cap with a brim, a glove on his
// left hand, a steel club. (He replaces the figure of balls and capsules that came from Cinderdeep's wanderer.)
const GV = 30, GNA = 50, GNF = 56, GNZ = 66, GA0 = -0.83, GF0 = -0.85;   // the block grid: 1.67 m wide, 1.87 m deep, 2.2 m tall
const gvox = new Uint8Array(GNA * GNF * GNZ);
const TROW = ramp(['#5f6b86', '#8e99b4', '#bcc5d8', '#e6eaf2']);   // his trousers: a shade greyer than his shirt, so the two part at the belt
const GMAT = [null, SKINR, CAPR, TROW, BELTR, SHOER, BELTR, HAIRR, CAPR, CAPR, CAPR, STEELR, TROUR, GOLDR, LAMPR];
const M_SKIN = 1, M_POLO = 2, M_TROU = 3, M_BELT = 4, M_SHOE = 5, M_SOLE = 6, M_HAIR = 7, M_CAP = 8, M_BRIM = 9, M_GLOVE = 10, M_STEEL = 11, M_TRIM = 12, M_GOLD = 13, M_LAMP = 14;
function mkGolfer(theta, pose, ph, lamp, K) {
  const S = sculpt(Math.ceil(170 * K), Math.ceil(190 * K), Math.round(85 * K), Math.round(170 * K));
  const fx = Math.cos(theta), fy = Math.sin(theta), rx = -fy, ry = fx, V = gvox;
  V.fill(0);
  const put = (a, f, z, m) => { const i = Math.round((a - GA0) * GV), j = Math.round((f - GF0) * GV), k = Math.round(z * GV); if (i >= 0 && j >= 0 && k >= 0 && i < GNA && j < GNF && k < GNZ) V[(k * GNF + j) * GNA + i] = m; };
  const st = 1 / GV;
  // a block of the body, turned about the upright by yaw: centre (a, f), half sizes, from z0 to z1
  const box = (ca, cf, ha, hf, z0, z1, m, yaw) => {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), r = Math.hypot(ha, hf) + st;
    for (let z = z0; z <= z1 + 1e-6; z += st) for (let f = cf - r; f <= cf + r; f += st) for (let a = ca - r; a <= ca + r; a += st) { const da = a - ca, df = f - cf, u = da * c + df * s, w = -da * s + df * c; if (u < -ha || u > ha || w < -hf || w > hf) continue; if (ha > 0.06 && hf > 0.06) { const p2 = u / ha, q2 = w / hf; if (p2 * p2 * p2 * p2 + q2 * q2 * q2 * q2 > 1) continue; } put(a, f, z, m); }   // (a big block is rounded: a person has no corners)
  };
  // a limb from joint A to joint B, wa wide (side to side) and wf thick; m2 from fraction t2 on (a sleeve, then bare arm)
  const seg = (A, B, wa, wf, m, t2, m2) => {
    const da = B[0] - A[0], df = B[1] - A[1], dz = B[2] - A[2], L = Math.hypot(da, df, dz), n = Math.max(1, Math.ceil(L * GV * 1.6)), up = Math.abs(dz) >= Math.max(Math.abs(da), Math.abs(df)), fw = !up && Math.abs(df) >= Math.abs(da);
    for (let k = 0; k <= n; k++) { const t = k / n, a = A[0] + da * t, f = A[1] + df * t, z = A[2] + dz * t, mm = m2 && t >= t2 ? m2 : m;
      for (let p = -wa / 2; p <= wa / 2 + 1e-6; p += st) for (let q = -wf / 2; q <= wf / 2 + 1e-6; q += st) { if (wa > 2 * st && (p * p) / (wa * wa / 4) + (q * q) / (wf * wf / 4) > 1.15) continue; if (up) put(a + p, f + q, z, mm); else if (fw) put(a + p, f, z + q, mm); else put(a, f + q, z + p, mm); } }
  };
  let hipZ = 0.93, tw = 0;   // the hips' height; how far the shoulders are turned (the swing)
  const leg = (sd, th, bend) => {   // thigh 0.44, shin 0.40, the ankle 0.09 above the sole
    const hip = [sd * 0.1, 0, hipZ], knee = [sd * 0.105, 0.44 * Math.sin(th), hipZ - 0.44 * Math.cos(th)], t2 = th - bend, an = [sd * 0.11, knee[1] + 0.40 * Math.sin(t2), Math.max(0.09, knee[2] - 0.40 * Math.cos(t2))];
    seg(hip, knee, 0.125, 0.15, M_TROU); seg(knee, an, 0.1, 0.115, M_TROU); foot(an);
  };
  const foot = (an) => { box(an[0], an[1] + 0.06, 0.05, 0.13, an[2] - 0.06, an[2] - 0.01, M_SHOE); box(an[0], an[1] + 0.06, 0.05, 0.13, an[2] - 0.09, an[2] - 0.07, M_SOLE); box(an[0], an[1] + 0.02, 0.045, 0.07, an[2], an[2] + 0.02, M_SHOE); };
  const armTo = (sd, G, glove) => {   // an arm from the shoulder to a hand at G: the elbow a little out and down from the straight line
    const sh = shoulder(sd), E = [(sh[0] + G[0]) / 2 + sd * 0.03, (sh[1] + G[1]) / 2 - 0.02, (sh[2] + G[2]) / 2 - 0.04];
    seg(sh, E, 0.1, 0.1, M_POLO, 0.62, M_SKIN); seg(sh, [sh[0] + (E[0] - sh[0]) * 0.6, sh[1] + (E[1] - sh[1]) * 0.6, sh[2] + (E[2] - sh[2]) * 0.6], 0.11, 0.11, M_POLO, 0.86, M_TRIM);
    seg(E, G, 0.085, 0.085, M_SKIN); box(G[0], G[1], 0.045, 0.045, G[2] - 0.04, G[2] + 0.04, glove ? M_GLOVE : M_SKIN);
  };
  const shoulder = (sd) => { const c = Math.cos(tw), s = Math.sin(tw); return [sd * 0.215 * c, sd * 0.215 * s + 0.01, hipZ + 0.5]; };
  const arm = (sd, f, glove) => { const sh = shoulder(sd), E = [sh[0] + sd * 0.02, sh[1] + 0.29 * Math.sin(f), sh[2] - 0.29 * Math.cos(f)], H = [E[0], E[1] + 0.27 * Math.sin(f + 0.28), E[2] - 0.27 * Math.cos(f + 0.28)]; armTo(sd, H, glove); return H; };
  const shafts = [];
  const club = (H, T) => { shafts.push(H, T); box(T[0], T[1] + 0.02, 0.025, 0.05, T[2] - 0.02, T[2] + 0.035, M_STEEL); };   // the shaft is drawn as a line once the blocks are down (as blocks it broke into dots)
  if (pose === 's') {   // the swing: a wide stance; the hands travel a tilted circle about the chest, the club leads them, the shoulders turn with it
    const al = ph; tw = al * 0.4; hipZ = 0.9;
    for (const sd of [-1, 1]) { const knee = [sd * 0.15, 0.05, 0.49], an = [sd * 0.18, 0, 0.09]; seg([sd * 0.1, 0, hipZ], knee, 0.125, 0.15, M_TROU); seg(knee, an, 0.1, 0.115, M_TROU); foot(an); }
    const hs = Math.sin(al / 2), shz = hipZ + 0.5, G = [-0.4 * Math.sin(al), 0.1 + 0.4 * Math.cos(al) * 0.52, shz - 0.07 + 0.4 * Math.cos(al) * -0.85 + 0.3 * hs * hs];
    const be = clamp(al * 1.6, -3.3, 3.5), T = [G[0] - 0.95 * Math.sin(be), G[1] + 0.95 * Math.cos(be) * 0.52, Math.max(0.03, G[2] + 0.95 * Math.cos(be) * -0.85)];
    armTo(-1, [G[0] - 0.02, G[1], G[2] + 0.03], true); armTo(1, [G[0] + 0.02, G[1], G[2] - 0.03], false); club(G, T);
  } else if (pose === 'c') {   // sitting: thighs along the seat, shins down, hands on the wheel
    hipZ = 0.79;
    for (const sd of [-1, 1]) { const knee = [sd * 0.1, 0.42, hipZ + 0.02], an = [sd * 0.1, 0.46, hipZ - 0.36]; seg([sd * 0.1, 0, hipZ], knee, 0.125, 0.15, M_TROU); seg(knee, an, 0.1, 0.115, M_TROU); foot(an); armTo(sd, [sd * 0.1, 0.32, hipZ + 0.38], sd < 0); }
  } else {
    const walk = pose === 'w', p = walk ? ph / 8 * 6.2832 : 0, amp = walk ? 0.5 : 0, tl = amp * Math.sin(p);
    hipZ = 0.09 + 0.84 * Math.cos(amp * Math.abs(Math.sin(p)) * 0.8);   // he dips a little as the legs pass
    leg(-1, walk ? tl : 0.09, walk ? 0.9 * Math.max(0, Math.cos(p)) : 0.14); leg(1, walk ? -tl : -0.06, walk ? 0.9 * Math.max(0, -Math.cos(p)) : 0.05);   // (standing: one foot a little forward, the knees eased)
    arm(-1, walk ? -0.5 * Math.sin(p) : 0.04, true);
    const H = arm(1, walk ? 0.28 * Math.sin(p) + 0.1 : 0.12, false);
    if (walk) club([H[0] + 0.03, H[1] - 0.3, H[2] + 0.1], [H[0] + 0.03, H[1] + 0.55, H[2] - 0.14]);   // carried at its balance, head forward
    else club([H[0] + 0.02, H[1], H[2]], [H[0] + 0.09, H[1] + 0.5, 0.04]);                             // standing: its head rests on the grass
  }
  // the trunk: hips, belt and buckle, waist, chest (turned with the shoulders), collar, neck
  box(0, -0.015, 0.165, 0.115, hipZ - 0.06, hipZ + 0.1, M_TROU); box(0, -0.01, 0.168, 0.112, hipZ + 0.1, hipZ + 0.13, M_BELT); box(0, 0.105, 0.025, 0.012, hipZ + 0.1, hipZ + 0.13, M_GOLD);   // (the seat a little back, the chest a little forward: he has a side view)
  box(0, -0.005, 0.155, 0.1, hipZ + 0.14, hipZ + 0.3, M_POLO, tw * 0.5); box(0, 0.012, 0.185, 0.12, hipZ + 0.3, hipZ + 0.48, M_POLO, tw); box(0, 0.005, 0.215, 0.105, hipZ + 0.45, hipZ + 0.54, M_POLO, tw);
  box(0, 0.128, 0.012, 0.012, hipZ + 0.36, hipZ + 0.48, M_TRIM, tw);                                       // the placket
  box(0, 0.01, 0.085, 0.08, hipZ + 0.53, hipZ + 0.57, M_TRIM, tw); box(0, 0.01, 0.05, 0.05, hipZ + 0.55, hipZ + 0.62, M_SKIN);
  // the head (turned half as far as the shoulders): face, hair at the back and sides, ears, the cap and its brim
  const hy = tw * 0.5, hz = hipZ + 0.6;
  box(0, 0.025, 0.092, 0.105, hz, hz + 0.24, M_SKIN, hy); box(0, -0.04, 0.097, 0.062, hz + 0.05, hz + 0.24, M_HAIR, hy); box(0, 0.012, 0.1, 0.035, hz + 0.1, hz + 0.2, M_HAIR, hy);
  { const c = Math.cos(hy), sn = Math.sin(hy); box(-0.135 * sn, 0.135 * c, 0.014, 0.014, hz + 0.07, hz + 0.115, M_SKIN, hy); }   // the nose
  box(0, 0.022, 0.1, 0.112, hz + 0.18, hz + 0.26, M_CAP, hy); box(0, 0.012, 0.085, 0.09, hz + 0.26, hz + 0.28, M_CAP, hy); box(0, 0, 0.02, 0.02, hz + 0.29, hz + 0.3, M_TRIM);
  { const c = Math.cos(hy), s = Math.sin(hy); box(-0.175 * s, 0.175 * c, 0.085, 0.055, hz + 0.18, hz + 0.2, M_BRIM, hy); }
  if (lamp) box(-0.19, 0.06, 0.03, 0.03, hipZ - 0.06, hipZ, M_LAMP);
  // the blocks drawn: each takes the tone of the side it shows to the sun
  const P = (a, f, z) => { const X = a * rx + f * fx, Y = a * ry + f * fy; return [X * 56 * K, (-z * 56 + Y * 28) * K, (Y * 48.5 + z * 28) * K, Y]; };
  const s = 56 * K / GV, bw = Math.ceil(s), bh = Math.ceil(s * 1.25), N1 = GNA, N2 = GNA * GNF;
  for (let k = 0; k < GNZ; k++) for (let j = 0; j < GNF; j++) for (let i = 0; i < GNA; i++) {
    const q = k * N2 + j * N1 + i, m = V[q]; if (!m) continue;
    if (i > 0 && j > 0 && k > 0 && i < GNA - 1 && j < GNF - 1 && k < GNZ - 1 && V[q + 1] && V[q - 1] && V[q + N1] && V[q - N1] && V[q + N2] && V[q - N2]) continue;   // buried
    let ea = 0, ef = 0, eu = 0;   // which way the surface faces here: toward the empty blocks among its 26 neighbours (smooth, so a limb is shaded round)
    for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i2 = i + di, j2 = j + dj, k2 = k + dk; if (i2 < 0 || j2 < 0 || k2 < 0 || i2 >= GNA || j2 >= GNF || k2 >= GNZ || !V[k2 * N2 + j2 * N1 + i2]) { ea += di; ef += dj; eu += dk; } }
    const X = ea * rx + ef * fx, Y = ea * ry + ef * fy; let nx = X, ny = -eu * 0.866 + Y * 0.5, nz = Y * 0.866 + eu * 0.5; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let b = 0.5 + 0.5 * (nx * LVX + ny * LVY + nz * LVZ); b = b < 0.3 ? 0.12 : b < 0.52 ? 0.38 : b < 0.74 ? 0.62 : 0.9;   // four flat tones
    const p = P(GA0 + i / GV, GF0 + j / GV, k / GV), col = tone(GMAT[m], b, m === M_LAMP), x0 = Math.round(p[0] - s / 2), y0 = Math.round(p[1] - s * 0.75);
    for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) sPut(S, x0 + dx, y0 + dy, p[2], col);
  }
  { const c = Math.cos(hy), sn = Math.sin(hy), ez = hz + 0.125, n = K > 1 ? 2 : 1;   // the eyes, when they are turned to the camera
    for (const sd of [-1, 1]) { const ea = sd * 0.04 * c - 0.118 * sn, ef = sd * 0.04 * sn + 0.118 * c, e = P(ea, ef, ez); if (e[3] < 0.02) continue; const x = Math.round(e[0]), y = Math.round(e[1]); for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) sPut(S, x + dx, y + dy, 1e3, tone(HAIRR, 0)); } }
  for (let c = 0; c + 1 < shafts.length; c += 2) {   // the club's shaft: one clean line (two pixels wide when he is seen close), light along its upper side
    const A = P(shafts[c][0], shafts[c][1], shafts[c][2]), B2 = P(shafts[c + 1][0], shafts[c + 1][1], shafts[c + 1][2]), n = Math.max(1, Math.ceil(Math.max(Math.abs(B2[0] - A[0]), Math.abs(B2[1] - A[1]))));
    for (let t = 0; t <= n; t++) { const x = Math.round(A[0] + (B2[0] - A[0]) * t / n), y = Math.round(A[1] + (B2[1] - A[1]) * t / n), z = A[2] + (B2[2] - A[2]) * t / n + 1; sPut(S, x, y, z, tone(STEELR, 0.45)); if (K > 1) sPut(S, x + 1, y, z, tone(STEELR, 0.8)); }
  }
  return sDone(S, 0.42);
}
const gcache = new Map();
function golferSprite(fa, pose, ph, K = GK) {
  const lamp = TOD[tmode].glow > 0, key = pose + fa + '_' + ph + (lamp ? 'L' : '') + (K === GK ? '' : 'k' + K);
  let s = gcache.get(key);
  if (!s) { s = mkGolfer(fa / 16 * 6.2832, pose, pose === 's' ? ph * 0.2 : ph, lamp, K); gcache.set(key, s); }   // a swing step is a fifth of a radian
  return s;
}

function mkFlag(ph) {
  const S = sculpt(44, 104, 6, 100);
  for (let z = 0; z <= 90; z++) { sPut(S, 0, -z, 0, tone(STEELR, 0.4)); sPut(S, 1, -z, 0, tone(STEELR, 0.95)); }
  sBall(S, 1, -92, 2.4, 1, GOLDR, { seed: 5 });
  for (let x = 0; x < 27; x++) {
    const w = x * 0.34 + ph * 1.0472, yo = Math.sin(w) * 2.5 * (x / 26), hh = 15 * (1 - x / 29);
    for (let y = 0; y < hh; y++) sPut(S, 2 + x, Math.round(-89 + yo + y), 2, tone(FLAGR, 0.5 + 0.4 * Math.cos(w) - y / hh * 0.12));
  }
  return sDone(S, 0.6);
}
const flagSpr = [0, 1, 2, 3, 4, 5].map(mkFlag); for (const f of flagSpr) f.keep = true;
const ballSpr = (() => {
  const S = sculpt(5, 5, 2, 4), W = (r, g, b, L) => ((L << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const rows = ['.bca.', 'bccaa', 'dbcca', 'ddbcc', '.ddb.'], pal = { a: W(255, 255, 250, 198), c: W(244, 244, 238, 180), b: W(214, 216, 226, 150), d: W(168, 172, 200, 120) };
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') S.px[y * 5 + x] = pal[ch]; }));
  return sDone(S, 0);
})();
ballSpr.keep = true;   // (kept sharp: see sprM)
const markSpr = (() => { const S = sculpt(11, 12, 5, 10); sBall(S, 0, -4, 4, 0, GOLDR, { seed: 3, stip: 0.05 }); return sDone(S, 0.6); })();
markSpr.keep = true;
// ---- the golf cart's colours (the cart itself is a small model drawn by the renderer: drawCart)
const CARTW = ramp(['#8e96aa', '#b8bfd0', '#dde2ec', '#f6f8fc', '#ffffff']);
const CARTG = ramp(['#14402c', '#1c5a3a', '#267848', '#34965a', '#48b46e']);
const TYRER = ramp(['#17161c', '#24232b', '#33323c', '#44434e']);
const SEATR = ramp(['#5a3a24', '#7a5232', '#9c6e44', '#bc8c5c']);
````
