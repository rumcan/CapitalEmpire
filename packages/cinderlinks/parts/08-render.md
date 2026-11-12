## render Rendering
The camera stands behind the golfer and looks across the course to the horizon. The picture is drawn every frame: the land from near to far, the sky behind it, then everything that stands on the land, then Cinderdeep's glow.
R: The camera starts 14 metres behind the golfer and 3.6 metres up, looking up the hole; it can be turned all the way round him, moved nearer or farther and raised or lowered. The horizon sits a third of the way down the screen. At 14 metres one metre is 56 pixels, so the golfer is drawn at his own size.
R: The sky is a full circle and reaches well above the horizon, so the camera can turn and look up; the sun stands where the land's shadows say it is.
R: The camera is never buried: where the land rises under it, the camera rides up over the land. Land is never cut away to show the golfer; the player turns the camera instead.
R: The distances the land is sampled at are pinned to lines that stand still on the ground, so walking forward reads the same ground every frame and far ground does not flicker.
R: Nothing steep is stretched: where one ground point covers three or more rows of the screen, each row is coloured for its own height (rock blocks on rock and cliffs, grass grain on grass), near and far.
R: Making new land is rationed per frame: far land is made in slices, a missing near chunk is stood in for by its tile for a moment, and when nothing else is needed the ground all round the golfer is made ahead, so turning the camera stays smooth.
R: The land is drawn one screen column at a time, from near to far, each ground point raised by its height in perspective; a point only draws above what is already drawn, so nearer ground covers farther ground (ticket T409's raised ground, seen from behind the player).
R: Near land (to 30 metres) is read from the painted chunks, pixel for pixel; middle land (to 90 metres) from the tiles' own colours; far land (to 260 metres) from a coarse far field made a piece at a time. Far woods are real trees, borrowed from the library, in each grove's own leaf colour.
R: Land fades into the air's colour with distance, so far hills turn pale as in a painting.
R: Where near land steps up steeply, the gap is filled as a cliff face of rock blocks, with bright grass hanging over the lip and its shadow under it.
R: The sky is painted once per light: banded colour from the top to the horizon, cumulus clouds in five tones (billows on billows, a lit rim, a dark flat base) lit from the upper right, streaks of cirrus high up, two ranges of hazy mountains, a low sun at golden hour and dusk, stars at dusk. Clouds drift; the sky slides a little as the golfer moves sideways.
R: Ground far enough away that one screen pixel covers several ground pixels is read from smaller, averaged copies of the painted ground, so small flowers and stones do not blink as the camera moves.
R: Grass stands up: within 30 metres every blade is drawn raised from the ground the way the cliffs are, nearer blades covering farther ones, dark at the root and bright at the tip, with flowers at the tips. The wind rolls through it in long fronts: where a gust passes the blades bend lower and shine. The grass lies flat round the ball.
R: Every drawn pixel records how far away it is, so a thing behind a hill or a cliff is hidden by it.
R: Three lights: day (the default), golden hour and dusk. A pixel's light level picks between a warm sun colour and a cool shadow colour; shadows are never black.
R: Water moves: two drifting noise fields make glints and dark bands, and the shore has a foam line; far water narrows into streaks.
R: Water is see-through close by and takes the sky's colour far off; rings of foam lap in toward the shore; light dances on the bed in the shallows; toward the sun the far water glitters.
R: The banks, the trees, the reeds and the clouds lie mirrored on the water, broken by ripples; far water mirrors strongly, near water faintly.
R: Standing things are drawn far to near, scaled by distance; near ones are each their own sculpture, far trees borrow from a small library; a tree between the camera and the golfer is thinned so he stays visible, and a tree within a few metres of the camera shows its trunk only.
R: The wind is Grove's: every 12 seconds a gust crosses the land. As it passes a tree, each leaf cluster but the core steps through eight poses from its own start and its lobes swell and shrink; the wood stays still. Grass, reeds and flowers bend hard while the gust passes and barely stir in the calm.
R: The golfer, the cart, the ball and the flag cast live shadows; a marker hangs over a far ball.
R: A small plant too far for its sculpture is a speck of its colour (a stem, and a petal on a flower) out to 90 m, so meadows keep their flowers at a distance; the painted ground's levels of detail change over a band of mixed lines fixed to the ground, not at a line that moves with the camera.
R: New land is made by a background worker (tiles and painted chunks), so the page itself only draws; without a worker the page makes it within a ration of milliseconds a frame.
R: The sun breaks through the clouds in soft-edged gaps that drift over the land with the wind and change shape as they go (CapitalEmpire's sun patches). Nothing dark is drawn: in a gap of sun the picture's own pixels are brighter and a little warmer, the dark parts kept dark; elsewhere it is the overcast, the picture as it always was. None at night.
R: Glow (Cinderdeep's light grid, swept and blurred): the lantern, glowcaps, crystals, fireflies, sparks, the ball and the cup light what is around them at dusk, faintly at golden hour.
File: game.js
Check: function drawGround(
Check: function makeSky(
Check: function blit(
Check: function spreadLight(

````js file=game.js

// ---- render
const view = document.getElementById('view');
view.width = VW; view.height = VH;
const vctx = view.getContext('2d', { alpha: false });   // (the picture's top byte carries the shadow mark as far as the sun pass: the canvas must not read it as see-through)
const img = vctx.createImageData(VW, VH), px = img.data, fb = new Uint32Array(px.buffer);
const zbuf = new Uint16Array(VW * VH), smark = new Uint16Array(VW * VH);   // zbuf: the distance of each drawn pixel, in centimetres
const rgb = (r, g, b) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
const TOD = [
  { name: 'Day', sun: [1.1, 1.06, 0.9], sh: [0.5, 0.62, 0.88], water: [1, 1, 1], glow: 0, haze: [196, 228, 244],
    sky: [[58, 134, 214], [110, 180, 236], [196, 232, 246]], cloud: [[255, 255, 255], [214, 229, 248], [132, 168, 220]], mtn: [[150, 186, 222], [178, 208, 236], [104, 150, 196], [130, 174, 214]], disc: null },
  { name: 'Golden hour', sun: [1.2, 1.0, 0.76], sh: [0.5, 0.45, 0.72], water: [1.08, 0.94, 0.86], glow: 0.3, haze: [246, 192, 152],
    sky: [[74, 112, 170], [226, 160, 150], [250, 188, 122]], cloud: [[255, 216, 152], [234, 152, 132], [132, 102, 152]], mtn: [[172, 132, 162], [208, 162, 162], [122, 98, 142], [162, 122, 152]], disc: [1023, 44, 21, [255, 244, 200]] },
  { name: 'Dusk', sun: [0.5, 0.44, 0.64], sh: [0.17, 0.19, 0.4], water: [0.42, 0.42, 0.7], glow: 1, haze: [112, 82, 132],
    sky: [[22, 26, 70], [84, 56, 120], [226, 112, 120]], cloud: [[240, 142, 132], [132, 82, 132], [52, 46, 92]], mtn: [[72, 62, 112], [98, 78, 126], [42, 42, 86], [60, 54, 102]], disc: [1023, 16, 23, [255, 222, 164]] }];
const LR = new Uint16Array(256), LG = new Uint16Array(256), LB = new Uint16Array(256);
function setTime(k) {
  tmode = k; const T = TOD[k];
  for (let L = 0; L < 256; L++) {
    const t = L / 200;
    LR[L] = L > 200 ? 256 : Math.round((T.sh[0] + (T.sun[0] - T.sh[0]) * t) * 256);
    LG[L] = L > 200 ? 256 : Math.round((T.sh[1] + (T.sun[1] - T.sh[1]) * t) * 256);
    LB[L] = L > 200 ? 256 : Math.round((T.sh[2] + (T.sun[2] - T.sh[2]) * t) * 256);
  }
  if (!T.skyBuf) makeSky(T);
}
function lit(c) {   // a packed colour with its light level -> a screen pixel
  const L = c >>> 24, r = ((c & 255) * LR[L]) >> 8, g = (((c >> 8) & 255) * LG[L]) >> 8, b = (((c >> 16) & 255) * LB[L]) >> 8;
  return (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
}
function litArr(src) { const n = src.length, o = new Uint32Array(n); for (let i = 0; i < n; i++) { const c = src[i]; o[i] = (c >>> 24) <= 200 ? (c & 0x01000000 ? (lit(c) & 0xfbffffff) >>> 0 : lit(c)) : c; } return o; }   /* (ground under a cast shadow is marked in the top byte: 251, not 255) */   // a ground array lit for the current light, made once
// a chunk's lit colours at half and at quarter size (each pixel the mean of the land pixels under it). Ground far enough away that one screen
// pixel covers several ground pixels is read from these: read pixel for pixel, flowers and stones blinked on and off as the camera moved.
function chunkMips(C) {
  const a = C.lc, col = C.col, l1 = new Uint32Array(4096), l2 = new Uint32Array(1024);
  const pick = (p, q, r, t) => p === q || p === r || p === t ? p : q === r || q === t ? q : r === t ? r : p || q || r || t;   // the colour two of the four share; else the first there is
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = ((y * 2) << 7) | (x * 2), w = (i2) => (col[i2] >>> 24) <= 200 ? a[i2] : 0;
    l1[(y << 6) | x] = pick(w(i), w(i + 1), w(i + 128), w(i + 129));
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const i = ((y * 2) << 6) | (x * 2); l2[(y << 5) | x] = pick(l1[i], l1[i + 1], l1[i + 64], l1[i + 65]); }
  const gr = C.gr, g1 = new Uint8Array(4096), g2 = new Uint8Array(1024);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const i = ((y * 2) << 7) | (x * 2); g1[(y << 6) | x] = Math.max(gr[i] & 127, gr[i + 1] & 127, gr[i + 128] & 127, gr[i + 129] & 127); }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const i = ((y * 2) << 6) | (x * 2); g2[(y << 5) | x] = Math.max(g1[i], g1[i + 1], g1[i + 64], g1[i + 65]); }
  C.l1 = l1; C.l2 = l2; C.g1 = g1; C.g2 = g2;
}
function hazed(c, f, H) {   // a screen pixel faded into the air's colour (whole-number arithmetic: it runs for every far pixel)
  const fi = (f * 256) | 0, r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  return (0xff000000 | ((b + (((H[2] - b) * fi) >> 8)) << 16) | ((g + (((H[1] - g) * fi) >> 8)) << 8) | (r + (((H[0] - r) * fi) >> 8))) >>> 0;
}

// the sky: a full circle 4096 px round, and 400 rows from high up down to the horizon; painted once per light
const SKW = 4096, SH = 400, SKH = SH + 2, SKRAD = SKW / 6.2832, SKX = new Uint16Array(VW).map((v, x) => (x * IRS) | 0);   // (SKX: the sky's column for each column of the picture)
function pnoise(x, y, s, P) {   // value noise that repeats every P cells across
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % P) + P) % P, x1 = (x0 + 1) % P;
  const a = hash2(x0, yi, s), b = hash2(x1, yi, s), c = hash2(x0, yi + 1, s), d = hash2(x1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function pfbm(x, y, s, oct, P) { let sum = 0, amp = 0.5, f = 1, norm = 0; for (let o = 0; o < oct; o++) { sum += amp * pnoise(x * f, y * f, s + o * 1013, P * f); norm += amp; amp *= 0.5; f *= 2; } return sum / norm; }
function makeSky(T) {
  const sky = new Uint32Array(SKW * SKH), cl = new Uint8Array(SKW * SKH), m1 = new Int16Array(SKW), m2 = new Int16Array(SKW);
  const [top, mid, hor] = T.sky, D = T.disc, W = SKW - 1, HZC = T.haze, zen = [top[0] * 0.6, top[1] * 0.64, top[2] * 0.8];
  const s1 = new Float32Array(SKW), s2 = new Float32Array(SKW);
  for (let x = 0; x < SKW; x++) { m1[x] = SH - Math.round(34 + 76 * pfbm(x / 256, 0.5, 911, 5, 16)); m2[x] = SH - Math.round(14 + 44 * pfbm(x / 128, 0.5, 912, 5, 32)); s1[x] = pfbm(x / 256, 0.5, 911, 2, 16); s2[x] = pfbm(x / 128, 0.5, 912, 2, 32); }
  pixelClouds(cl);                                          // the clouds: pixel-art cumulus, composed (see the clouds part)
  for (let y = 0; y < SKH; y++) for (let x = 0; x < SKW; x++) {
    const up = SH - y;
    let g = 1 - up / 250 + (pnoise(x / 64, y / 8, 902, 64) - 0.5) * 0.09, r, gg, b;   // bands, their edges bent by noise
    if (g < 0) { const t = Math.floor(clamp(-g / 0.6, 0, 0.999) * 6) / 5; r = lerp(top[0], zen[0], t); gg = lerp(top[1], zen[1], t); b = lerp(top[2], zen[2], t); }
    else {
      g = Math.floor(clamp(g, 0, 0.999) * 14) / 13;
      if (g < 0.55) { const t = g / 0.55; r = lerp(top[0], mid[0], t); gg = lerp(top[1], mid[1], t); b = lerp(top[2], mid[2], t); }
      else { const t = (g - 0.55) / 0.45; r = lerp(mid[0], hor[0], t); gg = lerp(mid[1], hor[1], t); b = lerp(mid[2], hor[2], t); }
    }
    if (D) {
      const dd = Math.hypot(x - D[0], y - (SH - D[1])) / D[2];
      if (dd < 1) { r = D[3][0]; gg = D[3][1]; b = D[3][2]; }
      else { const q = Math.floor(Math.min(1, 1.4 / (dd * dd)) * 6) / 6 * 0.75; r = lerp(r, D[3][0], q); gg = lerp(gg, D[3][1], q); b = lerp(b, D[3][2], q); }
    }
    if (T.glow === 1 && up > 70 && hash2(x, y, 904) < 0.0016) { r = gg = b = 235; }   // stars
    for (let mn = 0; mn < 2; mn++) {                        // the two ranges: a light rim on the sunward side of each ridge, and each fades into the air at its foot
      const mt = mn ? m2[x] : m1[x]; if (y < mt) continue;
      const sm = mn ? s2 : s1, slope = (sm[(x - 14) & W] - sm[(x + 14) & W]) * 60, dn = y - mt, C = T.mtn[mn * 2 + (dn < 2 + slope * (3 + 5 * pnoise(x / 16, y / 9, 913 + mn, 256)) ? 1 : 0)];
      const f = Math.floor(clamp((y - (SH - (mn ? 60 : 110))) / (mn ? 60 : 110), 0, 1) * 6) / 6 * (mn ? 0.4 : 0.6);
      r = lerp(C[0], HZC[0], f); gg = lerp(C[1], HZC[1], f); b = lerp(C[2], HZC[2], f);
    }
    sky[y * SKW + x] = rgb(r, gg, b);
  }
  T.skyBuf = sky; T.cloudBuf = cl; T.m1 = m1; { const [a, b, c] = T.cloud, mx = (p, q, t) => rgb(Math.round(lerp(p[0], q[0], t)), Math.round(lerp(p[1], q[1], t)), Math.round(lerp(p[2], q[2], t))); T.cc = [0, mx(a, a, 0), mx(a, b, 0.55), mx(b, b, 0), mx(b, c, 0.5), mx(b, c, 0.9)]; }
}

// (the middle land's look, tileLook, and what it needs live with the ground painter, above the worker's end: the worker makes it too)
// far land: 32 m squares, one sample every 0.4 m, straight from the land's own function; far woods are raised and leaf-coloured
// (the far pieces' sizes and their maker, farStep, live with the ground painter, above the worker's end)
const ftiles = new Map();
const farQ = [];                                           // far pieces being made, a slice at a time
function farTile(fx, fy) {                                  // a finished far piece, or nothing yet (asking for it puts it in the queue)
  const key = (fx + 32768) * 65536 + (fy + 32768);
  let F = ftiles.get(key);
  if (F === undefined) { F = { fx, fy, ready: false, row: 0, hh: null, ff: null, h: null, col: null, wood: null, trees: null }; ftiles.set(key, F); if (wkOn && genBudget < 100) wk2.postMessage({ t: 'far', gen: wkGen, fx, fy }); else farQ.push(F); }
  return F.ready ? F : null;
}
function farWork(ms) { const t0 = performance.now(); while (farQ.length && performance.now() - t0 < ms) { const F = farQ[0]; farStep(F); if (F.ready) farQ.shift(); } }
// the ration: milliseconds of making new land a frame may spend
let pwYaw = 0;
let genBudget = 3, genUsed = 0, pwAt = 1e9, pwI = 0, pwF = 0;
function fadeMix(a, b, w) {   // colour a going over to colour b in four steps (b: the plainer ground's colour at the same place; left alone if that is water)
  if (b === undefined || b >>> 24 < 251) return a;
  const m = (((a ^ b) & 0xfefefefe) >>> 1) + (a & b);
  if (w < 0.25) return a; if (w < 0.5) return ((((a ^ m) & 0xfefefefe) >>> 1) + (a & m) | 0xff000000) >>> 0; if (w < 0.75) return (m | 0xff000000) >>> 0;
  return ((((b ^ m) & 0xfefefefe) >>> 1) + (b & m) | 0xff000000) >>> 0;
}
function chunkHave(cx, cy) { const C = chunks.get((cx + 32768) * 65536 + (cy + 32768)); return C === undefined ? null : C; }   // the chunk if it is painted; nothing is asked for
function standBlades(x, sy, yTop, col, gs, zr) {   // plain standing grass over a column of ground: the ground's colour stood up, its tip a shade lighter; returns its top row
  if (gs <= 0) return sy; const t0 = sy - gs, tip = (col + ((~col >>> 4) & 0x0f0f)) >>> 0, y1 = sy < yTop ? sy : yTop;
  for (let yy = t0 < 0 ? 0 : t0; yy < y1; yy++) { const q = yy * VW + x; fb[q] = yy === t0 ? tip : col; zbuf[q] = zr; }
  return t0;
}
function chunkTry(cx, cy) {                                 // the chunk, made now if the ration allows; else nothing (its tile stands in for it this frame)
  const key = (cx + 32768) * 65536 + (cy + 32768);
  if (key === lastCK) return lastChunk;
  let C = chunks.get(key);
  if (!C) {
    if (wkOn && genBudget < 100) { if (!wkChunks.has(key) && wkChunks.size < 40) { wkChunks.add(key); wk.postMessage({ t: 'chunk', gen: wkGen, cx, cy }); } return null; }   // the worker paints it; its tile's plain look stands in until it comes
    if (genUsed > genBudget || (bcam && ball.state === 1)) return null;
    const t = performance.now(), T = tileAt(cx >> 1, cy >> 1);
    if (!T.lt && genBudget < 100 && !tileLightStep(T, Math.max(0.8, genBudget - genUsed))) { genUsed += performance.now() - t; return null; }   // its tile's light first, a few milliseconds of it a frame (the tile's plain look stands in meanwhile)
    C = genChunk(cx, cy); chunks.set(key, C); genUsed += performance.now() - t;
  }
  lastCK = key; lastChunk = C;
  return C;
}
// ---- the land worker: tiles and painted chunks are made off the main thread, so the page only draws (as CapitalEmpire paints its ground in workers).
// The worker runs this file's own first half (everything above LAND-WORKER-END: the noise, the course, the things, the ground painter) and is told the
// same seed, hole and course, so what it makes is what the page would have made itself. Where there is no worker (the test harness, a page opened from a
// file) the page makes the land itself, as before.
let wk = null, wk2 = null, wk3 = null, wkOn = false, wkUp = 0, wkGen = 0;   // (wk paints chunks and lights tiles; wk2 and wk3 share the plain tiles; wk2 makes the far pieces)
const wkChunks = new Set(), wkTiles = new Set();
const WK_TAIL = `
const wq = [], wc = []; let wgen = 0, wbusy = false;
function wpump() {
  wbusy = false; const t0 = performance.now();
  while (performance.now() - t0 < 10) {
    const m = wc.length ? wc.shift() : wq.shift(); if (!m) return;
    if (m.gen !== wgen) continue;
    if (m.t === 'chunk') { const C = genChunk(m.cx, m.cy); postMessage({ t: 'chunk', gen: wgen, cx: m.cx, cy: m.cy, col: C.col, lift: C.lift, mt: C.mt, gr: C.gr, maxLift: C.maxLift }, [C.col.buffer, C.lift.buffer, C.mt.buffer, C.gr.buffer]); }
    else if (m.t === 'far') { const F = { fx: m.fx, fy: m.fy, ready: false, row: 0, hh: null, ff: null, h: null, col: null, wood: null, trees: null }; while (!F.ready) farStep(F); postMessage({ t: 'far', gen: wgen, fx: m.fx, fy: m.fy, h: F.h, col: F.col, wood: F.wood, trees: F.trees }, [F.h.buffer, F.col.buffer, F.wood.buffer]); }
    else { const T = tileAt(m.tx, m.ty); if (m.light) tileLight(T); tileLook(T);   // (the worker keeps its own tile: copies are handed over, which costs the page nothing to receive)
      const o = { t: 'tile', gen: wgen, tx: m.tx, ty: m.ty, light: m.light, maxLift: T.maxLift, wl: T.wl }, tr = [];
      for (const f of ['look', 'gh', 'h', 'g', 'dF', 'dG', 'dB', 'dT', 'dP', 'wood', 'dry', 'tone', 'tal', 'mow', 'mow2', 'lt', 'sh']) { const a = T[f] ? T[f].slice() : null; o[f] = a; if (a) tr.push(a.buffer); }
      postMessage(o, tr); }
    if (tiles.size > 700) { tiles.clear(); lastTK = NaN; lastTile = null; } if (ocells.size > 4000) ocells.clear(); if (treeMemo.size > 80000) treeMemo.clear();
  }
  if (wc.length || wq.length) { wbusy = true; setTimeout(wpump, 0); }
}
onmessage = (e) => {
  const m = e.data;
  if (m.t === 'init') {
    wgen = m.gen; SEED = m.seed; wq.length = 0; wc.length = 0; setBiome(m.biome || 'parkland', m.ctype || 'private');
    if (m.data) { const k = MORE_COURSES.findIndex((c) => c.id === m.data.id); if (k < 0) MORE_COURSES.push(m.data); else if (MORE_COURSES[k].hv !== m.data.hv) MORE_COURSES[k] = m.data; }   // (hv: a host page's course, numbered each time it is handed over: the same id may come again with new shapes or a new scale)
    if (m.course) { if (!course || course.id !== m.course || (m.data && course.raw && course.raw.hv !== m.data.hv)) loadCourse(m.course); } else course = null;
    hole = course ? courseHole(m.n) : makeHole(m.seed, m.n, m.ox, m.oy);
    tiles.clear(); lastTK = NaN; lastTile = null; ocells.clear(); treeMemo.clear();
    return;
  }
  (m.t === 'chunk' ? wc : wq).push(m); if (!wbusy) { wbusy = true; setTimeout(wpump, 0); }
};
postMessage({ t: 'ready' });
`;
function wkStart() {
  if (wk || typeof Worker === 'undefined' || typeof fetch === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL || !/^https?:/.test(location.href || '')) return;
  fetch('game.js').then((r) => r.text()).then((src) => {
    const end = src.indexOf('// ---- LAND-WORKER-END'); if (end < 0) return;
    const pre = 'try { importScripts(' + JSON.stringify(new URL('courses.js', location.href).href) + '); } catch (e) {}\n';
    const url = URL.createObjectURL(new Blob([pre, src.slice(0, end), WK_TAIL], { type: 'text/javascript' }));
    wk = new Worker(url); wk2 = new Worker(url); wk3 = new Worker(url);
    wk.onmessage = wk2.onmessage = wk3.onmessage = wkGot; wk.onerror = wk2.onerror = wk3.onerror = () => { wkOn = false; };
  }).catch(() => {});
}
function wkInit() {   // a new hole, seed or course: the worker starts over on it, and whatever it was still making for the old one is dropped when it comes back
  wkGen++; wkChunks.clear(); wkTiles.clear();
  if (wkOn) { const m = { t: 'init', gen: wkGen, seed: SEED, n: holeN, ox: hole.tee.x, oy: hole.tee.y, course: course ? course.id : null, data: course ? course.raw : null, biome: biomeId, ctype: ctypeId }; wk.postMessage(m); wk2.postMessage(m); wk3.postMessage(m); }
}
function wkTile(tx, ty, light) {   // ask the worker for a tile (with its light, for land near the camera)
  const key = (tx + 32768) * 65536 + (ty + 32768) + (light ? 0.5 : 0); if (wkTiles.has(key) || wkTiles.size > 300) return;
  wkTiles.add(key); (light ? wk : (tx + ty) & 1 ? wk2 : wk3).postMessage({ t: 'tile', gen: wkGen, tx, ty, light });
}
function wkGot(e) {
  const m = e.data, pt = performance.now(); PERF.msgs++;
  wkGot2(m); PERF.msgMs += performance.now() - pt;
}
function wkGot2(m) {
  if (m.t === 'ready') { if (++wkUp >= 3) { wkOn = true; wkInit(); } return; }
  if (m.gen !== wkGen) return;
  if (m.t === 'chunk') {
    const key = (m.cx + 32768) * 65536 + (m.cy + 32768); wkChunks.delete(key);
    if (!chunks.has(key)) chunks.set(key, { cx: m.cx, cy: m.cy, col: m.col, lift: m.lift, mt: m.mt, maxLift: m.maxLift, gr: m.gr, lc: null, lt: -1, l1: null, l2: null, g1: null, g2: null });
    return;
  }
  if (m.t === 'far') {                                      // a far piece: its trees are matched to the page's own (so a tree keeps the sculpture it has)
    const F = ftiles.get((m.fx + 32768) * 65536 + (m.fy + 32768)); if (!F || F.ready) return;
    for (let k = 0; k < m.trees.length; k++) { const t = m.trees[k], tk = (t.gx + 32768) * 65536 + (t.gy + 32768), own = treeMemo.get(tk); if (own) m.trees[k] = own; else treeMemo.set(tk, t); }
    F.h = m.h; F.col = m.col; F.wood = m.wood; F.trees = m.trees; F.ready = true;
    return;
  }
  const key = (m.tx + 32768) * 65536 + (m.ty + 32768); wkTiles.delete(key + (m.light ? 0.5 : 0));
  const T = tiles.get(key);
  if (T) { if (!T.lt && m.lt) { T.lt = m.lt; T.sh = m.sh; } return; }
  tiles.set(key, { tx: m.tx, ty: m.ty, h: m.h, g: m.g, dF: m.dF, dG: m.dG, dB: m.dB, dT: m.dT, dP: m.dP, wood: m.wood, dry: m.dry, tone: m.tone, tal: m.tal, mow: m.mow, mow2: m.mow2, lt: m.lt, sh: m.sh, look: m.look, gh: m.gh, ll: null, llt: -1, maxLift: m.maxLift, wl: m.wl, lw: null, sw: null, lp: 0 });
}
const tileQ = [], tileQset = new Set();                     // middle-distance tiles the view has asked for, made within the ration
function tileHave(tx, ty) { return tiles.get((tx + 32768) * 65536 + (ty + 32768)); }   // the tile if it is made; asking does not make it
function tileWant(tx, ty) { if (wkOn && genBudget < 100) { wkTile(tx, ty, false); return; } const key = (tx + 32768) * 65536 + (ty + 32768); if (!tileQset.has(key)) { tileQset.add(key); tileQ.push(tx, ty); } }   // (the worker makes it; without one, the queue below)
function tileWork(ms) { const t0 = performance.now(); while (tileQ.length && performance.now() - t0 < ms) { const tx = tileQ.shift(), ty = tileQ.shift(); tileLook(tileAt(tx, ty)); tileQset.delete((tx + 32768) * 65536 + (ty + 32768)); } }
function hTry(u, v) {   // the land's height (metres) at a ground pixel if its tile is made, else NaN
  const tx = Math.floor(u / TPX), ty = Math.floor(v / TPX), T = tileHave(tx, ty); if (!T) return NaN;
  const fx = (u - tx * TPX) * 0.25, fy = (v - ty * TPX) * 0.25, i = fx >= 64 ? 63 : fx | 0, j = fy >= 64 ? 63 : fy | 0, a = fx - i, b = fy - j, k = j * TN + i, H = T.h;
  return (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + TN] * (1 - a) + H[k + TN + 1] * a) * b;
}
function hFar(wx, wy) {   // the far land's height (metres) at a point if its piece is made, else NaN
  const fx = Math.floor(wx / FTS), fy = Math.floor(wy / FTS), F = ftiles.get((fx + 32768) * 65536 + (fy + 32768)); if (!F || !F.ready) return NaN;
  return F.h[Math.min(FTN - 1, ((wy - fy * FTS) / FTD) | 0) * FTN + Math.min(FTN - 1, ((wx - fx * FTS) / FTD) | 0)];
}
const PW_NEAR = [], PW_FAR = [];                            // the chunks within 31 m of the golfer and the far pieces within 260 m, nearest first
let SIMPLEG = true;   // the simple grass everywhere (the owner, 2026-11-12: "make that the main grass, I want to see what it looks like up close"); false: the painted ground near by, as before
const CAMMIN = 18;   // the closest the camera may come behind the golfer (the owner, 2026-11-12: the zoom of their screenshot, for now)
function setSimple(on) { SIMPLEG = !!on; try { localStorage.setItem('cinderlinks.simple', on ? '1' : '0'); } catch (e) {} }
let DNEAR = 30, DFAR = 260, HZK = 1, VIEWR = 260;   // how far the painted ground is drawn (30 to 60 m) and how far the land is drawn at all (150 to 400 m): the player's render distance (setDetail); HZK thins the air to suit
function nearList() { PW_NEAR.length = 0; const R = DNEAR + 1, ny = Math.ceil(R * PPV / CH), nx = Math.ceil(R * PPM / CH); for (let dy = -ny; dy <= ny; dy++) for (let dx = -nx; dx <= nx; dx++) { const d = Math.hypot(dx * CH / PPM, dy * CH / PPV); if (d < R) PW_NEAR.push([d, dx, dy]); } PW_NEAR.sort((a, b) => a[0] - b[0]); }
nearList();
// The player's render distance: how far the painted ground (and with it the standing grass beyond) is drawn. More is prettier and costs more: the
// painted ground kept in memory grows with the square of it.
let CHCAP = 620;
function setDetail(R) {   // R: the render distance, 150 to 400 m (260 is the game as it was made)
  R = R >= 150 && R <= 400 ? Math.round(R / 25) * 25 : 260; VIEWR = R; DFAR = R; HZK = 260 / R;
  const D = R <= 260 ? 30 : Math.round((30 + (R - 260) / 140 * 30) / 5) * 5; DNEAR = D; GRASS_FAR = R <= 260 ? Math.round(140 * R / 260) : R - 10;   /* (past the game's own 260 m the grass stands all the way out: the player asked for it and has the PC for it) */ CHCAP = Math.round(620 * D * D / 900);
  nearList(); farList(); try { localStorage.setItem('cinderlinks.view', '' + R); } catch (e) {}
}
function farList() { PW_FAR.length = 0; const n = Math.ceil((DFAR + FTS) / FTS) + 1; for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) { const d = Math.hypot(dx, dy) * FTS; if (d < DFAR + FTS) PW_FAR.push([d, dx, dy]); } PW_FAR.sort((a, b) => a[0] - b[0]); }
farList();
PW_NEAR.sort((a, b) => a[0] - b[0]); PW_FAR.sort((a, b) => a[0] - b[0]);
let aheadOn = true;
// ---- the land where a shot will come down, painted before the ball gets there. At the strike a copy of the ball is flown (the flight's own sums) to
// find where it lands; while the ball is on its way the tiles and painted chunks round that place are asked of the workers, nearest the landing first, and
// are kept from being dropped. So the ball camera arrives over finished ground, not over the plain stand-in.
let preOn = false, preX = 0, preY = 0, preList = [], preI = 0;
function prewarmShot() {
  let x = ball.x, y = ball.y, z = ball.z, vx = ball.vx, vy = ball.vy, vz = ball.vz; const dt = 1 / 60;
  for (let k = 0; k < 1500; k++) { vz -= 9.81 * dt; vx *= 0.9986; vy *= 0.9986; vx += WDX * WIND * 0.9 * dt; vy += WDY * WIND * 0.9 * dt; x += vx * dt; y += vy * dt; z += vz * dt; if (vz < 0 && (k & 3) === 0) { field(x, y, FO); if (z <= FO.h) break; } }
  const sp = Math.hypot(vx, vy) || 1; preX = x + vx / sp * 6; preY = y + vy / sp * 6; preOn = true; preI = 0;   // (a little beyond: it will run on)
  const L = [], c0 = Math.floor(preX * PPM / CH), c1 = Math.floor(preY * PPV / CH);
  for (let j = -11; j <= 11; j++) for (let i = -21; i <= 21; i++) { const r = Math.hypot(i * CH / PPM, j * CH / PPV); if (r < 46) L.push([r, c0 + i, c1 + j]); }
  L.sort((a, b) => a[0] - b[0]); preList = L;
}
function prewarmStep() {
  if (!preOn) return;
  if (ball.state === 0 && !bcam && preI > 0) { preOn = false; return; }   // the ball lies still and the camera is back with the golfer
  if (!wkOn) return;
  if ((frame & 15) === 0) { const ptx = Math.floor(preX * PPM / TPX), pty = Math.floor(preY * PPV / TPX); for (let dy = -7; dy <= 7; dy++) for (let dx = -13; dx <= 13; dx++) { if (Math.hypot(dx * TPX / PPM, dy * TPX / PPV) > 58) continue; if (!tileHave(ptx + dx, pty + dy)) wkTile(ptx + dx, pty + dy, false); } }
  let n = 0; while (preI < preList.length && wkChunks.size < 38 && n < 12) { const o = preList[preI++]; if (!hasChunk(o[1], o[2])) { wkTile(o[1] >> 1, o[2] >> 1, true); chunkTry(o[1], o[2]); n++; } }
  if (preI >= preList.length && (frame & 63) === 0) preI = 1;   // (gone over again now and then, in case one was dropped or refused)
}
function makeAhead() {                                      // one small piece a frame, when the frame made nothing else: a slice of far land, or the next step toward a chunk near the golfer
  if (!aheadOn || genUsed > 1 || player.moving || camYaw !== pwYaw) { pwYaw = camYaw; return; }   // only while nothing else is going on
  if (tileQ.length) { tileWork(2); return; }
  if (farQ.length) { farWork(2); return; }
  if (SIMPLEG) return;
  for (; libWarm < 36; libWarm++) { const f = libWarm % 3, h = ((libWarm / 3) | 0) % 6, v = (libWarm / 18) | 0; if (!lib.has(K_TREE * 1000 + f * 100 + h * 10 + v)) { libOf(K_TREE, f, h, v); libWarm++; return; } }   // the trees' stand-ins, one a frame, before they are needed
  const pcx = Math.floor(player.x * PPM / CH), pcy = Math.floor(player.y * PPV / CH), at = pcx * 4096 + pcy;
  if (at !== pwAt) { pwAt = at; pwI = 0; pwF = 0; }
  for (; pwI < PW_NEAR.length; pwI++) {
    const o = PW_NEAR[pwI], cx = pcx + o[1], cy = pcy + o[2]; if (hasChunk(cx, cy)) continue;
    if (wkOn) { chunkTry(cx, cy); if (wkChunks.size >= 40) return; continue; }   // (the worker paints them: ask for as many as it will take)
    const key = ((cx >> 1) + 32768) * 65536 + (cy >> 1) + 32768, T = tiles.get(key);
    if (!T) tileAt(cx >> 1, cy >> 1); else if (!T.lt) tileLightStep(T, 3); else chunkTry(cx, cy);   // its tile, then the tile's light, then the chunk: a frame each
    return;
  }
  for (; pwF < PW_FAR.length; pwF++) { const o = PW_FAR[pwF], fx = Math.floor(player.x / FTS) + o[1], fy = Math.floor(player.y / FTS) + o[2]; if (!ftiles.has((fx + 32768) * 65536 + (fy + 32768))) { farTile(fx, fy); return; } }
}
function ih(a, b) { let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 24; }   // a quick hash, 0..255

// water: two drifting noise fields from a table (the table is 256 cells round; a cell is tens of pixels, so no repeat is in view)
const WT = new Float32Array(65536); { const R = mulberry32(8081); for (let i = 0; i < 65536; i++) WT[i] = R(); }
function tnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), r0 = (yi & 255) << 8, r1 = ((yi + 1) & 255) << 8, c0 = xi & 255, c1 = (xi + 1) & 255;
  const a = WT[r0 | c0], b = WT[r0 | c1], c = WT[r1 | c0], d = WT[r1 | c1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
let wFar = 0, wGl = 0, wSR = 0, wSG = 0, wSB = 0, wSh = 0;   // (wSh: how many times the ripple dashes are doubled in size at this distance, so they stay dashes on the screen and never shrink to specks)   // set by the land sweep for the distance it is at: how much sky the water shows, how much it glitters; the sky's colour
// Ideas borrowed from the pirate games' seas (Sea of Thieves, Black Flag) and done in pixels: the water is see-through close by and takes the sky's
// colour far off; rings of foam lap in toward the shore; light dances on the bed in the shallows; toward the sun the far water glitters;
// and (reflectWater) the banks, the trees and the clouds lie mirrored on it, broken by ripples.
function waterPx(c, d, u, v) {   // u, v: ground px (they may be fractions)
  const t = frame, n1 = tnoise((u + t * 0.35) / 23, (v * 2 - t * 0.2) / 23), n2 = tnoise((u - t * 0.22) / 9 + 31, (v * 2 + t * 0.3) / 7 + 17), k = 0.6 * n1 + 0.4 * n2;
  let r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  if (wFar > 0 && d > 1) { r += (wSR - r) * wFar; g += (wSG - g) * wFar; b += (wSB - b) * wFar; }
  if (d === 0 || (d === 1 && k > 0.5)) { r = 190 + r * 0.25; g = 215 + g * 0.15; b = 215 + b * 0.15; }   // the foam line
  else {
    let ring = false;
    if (d < 10) { const ph = d * 0.75 + t * 0.028 + n1 * 2.4, f = ph - Math.floor(ph / 3.2) * 3.2; if (f < 0.42 && n2 > 0.3) { const a = (10 - d) * 6; r += a; g += a; b += a * 0.8; ring = true; } else if (d > 1 && d < 8 && Math.abs(n2 - 0.5) < 0.03) { r += 24; g += 30; b += 16; } }   // a ring of foam lapping in; light on the bed
    if (!ring) {                                               // ripples: level dashes about a dozen pixels long, lighter or darker than the water, in rows that drift past one another
      const vi = Math.floor(v) >> (2 + wSh), uu = (Math.floor(u) + ((t * (vi & 1 ? 0.3 : 0.18)) | 0) >> wSh) + ((vi * 37) & 63), cu = Math.floor(uu / 26), ph = uu - cu * 26, hh = ih(cu, vi + wSh * 977);
      if (ph < 10 + (hh & 7)) { if (hh < 40 + wGl * 900) { r += 58; g += 54; b += 36; } else if (hh > 222) { r *= 0.82; g *= 0.85; b *= 0.9; } }
    }
  }
  const W = TOD[tmode].water; r *= W[0]; g *= W[1]; b *= W[2];
  return (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
}
// reflections: every water pixel still showing takes some of the picture mirrored about the first thing above it in its column (the far bank), shifted sideways by
// ripples; far water mirrors strongly, near water faintly. It runs after everything standing has been drawn, so trees and reeds are mirrored too.
// A tree, a reed or the cart standing in front of the water marks its pixels (wz = 1): they are neither given a reflection nor taken for the far bank.
const wz = new Uint16Array(VW * VH), wrow = new Uint8Array(VH), ysA = new Int16Array(VW);
let wAny = false;
function reflectWater() {
  if (!wAny) return;
  let full = -1; ysA.fill(-1);
  const t = frame;
  for (let y = 0; y < VH; y++) {
    if (!wrow[y]) { full = y; continue; }
    const row = y * VW, rip = Math.sin(y * 0.55 + t * 0.09) * 1.5 + Math.sin(y * 0.23 - t * 0.05) * 1.5, yh = y * 3 + (t >> 4);
    for (let x = 0; x < VW; x++) {
      const q = row + x, z = wz[q];
      if (z === 1) continue;                                                  // something nearer stands in front of the water here: left as it is
      if (z === 0 || zbuf[q] !== z) { ysA[x] = y; continue; }
      let ys = ysA[x]; if (ys < full) ys = ysA[x] = full;
      if (ys < 0) continue;
      const w = fb[q]; if ((w & 0xff00) > 0xd200) continue;                 // foam and glints stay as they are
      const dy = y - ys, sy = ys - dy; if (sy < 0 || ((y + (t >> 4)) & 3) === 0) continue;             // (a level slit every fourth row, drifting down: the water's own colour shows through)
      let sx = x + Math.round(rip * (1 + dy * 0.04)); sx = sx < 0 ? 0 : sx >= VW ? VW - 1 : sx;
      const sq = sy * VW + sx; if (zbuf[sq] === 65535) continue;                                      // the sky above is not mirrored
      const s = fb[sq], h = (((s ^ w) & 0xfefefefe) >>> 1) + (s & w), h2 = (((h ^ w) & 0xfefefefe) >>> 1) + (h & w);   // one part picture to three of water: a shape, not a photograph
      fb[q] = (z > 1100 ? h2 - ((h2 >>> 3) & 0x001f1f) : h2) >>> 0;                                   // (a little darker and bluer far off)
    }
  }
}

// the land: per screen column, near to far; a point draws only above what is already drawn
// the land: one distance at a time, near to far, across all the screen's columns; a point draws only above what its column already holds.
// (Every column meets the same distances, so the sweep runs along lines of the ground and rows of the picture, which is what memory likes.)
const DMID = 90, STEPK = 1 / (FOC * 3.6);
const yTopA = new Int16Array(VW), hPrevA = new Float32Array(VW), mPrevA = new Uint8Array(VW);
let capA = 0, capB = 0, capEnd = 0;   // the cutaway: the land may not rise above a line from just under the camera (capA) to the golfer's feet (capB), nearer than capEnd
function capAt(d, lat) { const t = d <= 2 ? 0 : (d - 2) / (capEnd - 2), w = Math.abs(lat) - 1.2; return capA + (capB - capA) * t + (w > 0 && d > 3 ? w * 0.9 * Math.min(1, (d - 3) / 4) : 0); }
// the wind over the grass: gusts roll across the land in long fronts (the idea of Ghost of Tsushima's fields: one scrolling noise bends every blade, so the
// wind is seen as waves). A grid of 128 x 128 cells of 1.14 m, laid on the world round the camera, a quarter of its rows renewed each frame; 0 = calm, 255 = the top of a gust.
const WG = new Uint8Array(16384), WDX = -0.88, WDY = 0.47;
let ballU = 0, ballV = 0;
function windTick() {
  const cu = Math.floor(camX * PPM / 64) - 64, cv = Math.floor(camY * PPV / 32) - 64, t = frame * 0.1, ph = frame & 3;
  for (let j = 0; j < 128; j++) {
    const cj = cv + j; if ((cj & 3) !== ph) continue;
    const row = (cj & 127) << 7, y = cj * 1.143;
    for (let i = 0; i < 128; i++) {
      const ci = cu + i, x = ci * 1.143, al = x * WDX + y * WDY - t, ac = y * WDX - x * WDY;
      const w = (0.7 * tnoise(al / 9 + 500, ac / 24 + 500) + 0.3 * tnoise(al / 2.9 + 90, ac / 6 + 700) - 0.45) * 4.4;
      WG[row | (ci & 127)] = w <= 0 ? 0 : w >= 1 ? 255 : (w * 255) | 0;
    }
  }
}
// the next distance to sample, pinned to lines that stand still on the ground: as the camera walks forward the same lines of ground are read every frame,
// so what lies between them does not blink in and out (the lines are a power of two apart, and coarser ones are a subset of finer ones)
let syncT = 0, lookN = 0;   // tiles made on the spot this frame; tile looks made this frame
let rowPh = 0, rowX = 0, rowY = 0;   // how far the camera has travelled forward (the sample lines are pinned to that)
// Past the painted ground the land is read along RINGS round the golfer (the point the camera swings round), not along lines square to the view: when the
// camera looks around, a ring stays where it is on the land, so the same points of the land are read and the picture only slides sideways. (Read along lines
// square to the view, the points slid forward and back over the land as the view swung, and every edge between two readings crawled.)
const PGX = new Float64Array(VW), PGY = new Float64Array(VW), PGU = new Float64Array(VW), PGV = new Float64Array(VW), PCS = new Float64Array(VW), PS2 = new Float64Array(VW), PDC = new Float64Array(VW);
// The next row of readings: the next line of a lattice that belongs to the land (a power of two apart, no wider than the step wanted). Every line of
// the lattice inside a band of distances is read, so as the camera moves forward the rows stay on the same lines of the land. (Chosen one from the other by
// rounding, which line came next flipped as the camera moved, and the flip ran down every row beyond it: whole bands of the picture re-read at once, like a torn screen.)
function nextRow(d, step, camF) { if (step < 0.05) return d + step; const s = Math.pow(2, Math.round(Math.log2(step))); return (Math.floor((camF + d) / s + 1e-4) + 1) * s - camF; }   // (the nearest power of two to the step wanted: as many rows as before, on average)
function pinned(d, step, camF) { if (step < 0.05) return d; const s = Math.pow(2, Math.floor(Math.log2(step))), p = Math.round((camF + d) / s) * s - camF; return p; }
// A slope seen steeply, close by: each row of the picture between this reading and the one before takes the painted ground's own colour at its own place on
// the slope (one colour pulled down the gap made a bunker's lip a row of stretched streaks). den: one over the rows between the two readings.
function slopeFillNear(x, y, yTop, sy, den, u, v, bu, bv, cx, cy, col, lc, out, zr) {
  let lk = -1, c2 = out;
  for (; y < yTop; y++) {
    let t = (y - sy) * den; if (t > 1) t = 1;
    const u3 = Math.floor(u - bu * t), v3 = Math.floor(v - bv * t);
    if ((u3 >> 7) === cx && (v3 >> 7) === cy) { const k3 = ((v3 & 127) << 7) | (u3 & 127); if (k3 !== lk) { lk = k3; c2 = (col[k3] >>> 24) <= 200 ? lc[k3] : out; } }
    const q = y * VW + x; fb[q] = c2; zbuf[q] = zr;
  }
}
function tuftHash(du, dv, tx, ty) { return ih(((du * 0.125) | 0) + tx * 32, ((dv * 0.125) | 0) + ty * 32); }   // one number for each small patch of a tile (two of its cells square): the patch's grass shares a height and a shade
let GRASS_FAR = 140;   // how far off the land's standing grass is drawn, metres
let swD = 0, swP = 0, swS = 0;   // where the middle sweep left off: the far sweep goes on from there
function midSweep(d, dPrev, step, HAZ, kx0, B, pivD, cuP, cvP, HZ8, ZPF, pOn, camF, sunF) {
  let pthT = false;
  const GM = SIMPLEG ? Math.max(DMID, Math.min(VIEWR - 20, 220)) : DMID;   // (with the simple grass everywhere, the tiles' grass reaches as far as the render distance allows, to 220 m; the far field only beyond)
  while (d < GM) {                                         // middle: the tiles' own colours
    wFar = d > 68 ? 0.5 : (d - 8) / 120; wGl = sunF * (d > 50 ? 0.1 : (d - 10) / 400); wSh = d < 56 ? 2 : 3;
    const k = FOC / d, zr = (d * 100) | 0, lx = kx0 * d, dl = d / FOC;
    const uf0 = (camX + FX * d + RX * lx) * PPM, du = RX * dl * PPM, vf0 = (camY + FY * d + RY * lx) * PPV, dv = RY * dl * PPV;
    const hf = d * HZK > 50 ? (d * HZK - 50) / (BSAND ? 150 : 300) : 0, rise = step * 1.1, Rr = (d - pivD) * (d - pivD), rw = d < pivD + 6 ? 0 : d > pivD + 20 ? 1 : (d - pivD - 6) / 14, bladeK = k / ZP, g3 = d < DNEAR + 16 ? (DNEAR + 16 - d) * 0.0625 : 0,   /* (g3: the in-between grass, strongest where the painted ground ends and gone by 46 m: taller, more varied, dark at the root, so the painted grass does not end at a line) */ qst = (d - dPrev) * 0.25;   // (bladeK: screen rows per height px of grass; qst: a quarter of the way back to the line before)
    let TGh = null, tWl = -99, ltx = 1e9, lty = 1e9, TL = null, TLL = null, TH = null, TG = null, tu0 = 0, tv0 = 0, sfx = 1e9, sfy = 1e9, sF = null, lfS = 0, lfX = -9;
    for (let x = 0; x < VW; x++) {
      const yTop = yTopA[x]; if (yTop <= 0) continue;
      const rr = Rr - PS2[x], dx = rw >= 1 ? PDC[x] + PCS[x] * Math.sqrt(rr) : rw <= 0 || rr <= 0 ? d : d + (PDC[x] + PCS[x] * Math.sqrt(rr) - d) * rw, kc = FOC / dx,   /* (close to the golfer the rings are too small to read the land by: there it is read along lines square to the view, going over to rings by 34 m) */ zr = (dx * 100) | 0, zs = dx * ZPF, uf = cuP + PGU[x] * dx, vf = cvP + PGV[x] * dx, tx = ((uf + B) >> 8) - 16384, ty = ((vf + B) >> 8) - 16384;   /* (dx: this column's distance where it meets the ring) */
      if (tx !== ltx || ty !== lty) {
        ltx = tx; lty = ty; let Tt = tileHave(tx, ty);
        if (Tt && !Tt.look) { if (lookN < 4 || genBudget > 100) lookN++; else Tt = null; }   // (its look is made here, four tiles a frame at most)
        if (Tt) { TL = tileLook(Tt); if (Tt.llt !== tmode) { Tt.ll = litArr(TL); Tt.llt = tmode; } TLL = Tt.ll; TH = Tt.h; TG = Tt.g; TGh = Tt.gh; tWl = Tt.wl; tu0 = tx * TPX; tv0 = ty * TPX; pthT = pOn && pathNearPx(tu0 + 128, tv0 + 128, 7); }
        else { TL = null; if (!tileHave(tx, ty)) tileWant(tx, ty); }
      }
      if (!TL) {                                             // this tile is not made yet: the far field stands in for it
        const wx = uf / PPM, wy = vf / PPV, fx = Math.floor(wx / FTS), fy = Math.floor(wy / FTS);
        if (fx !== sfx || fy !== sfy) { sF = farTile(fx, fy); sfx = fx; sfy = fy; }
        if (sF) {
          const k3 = (((wy - fy * FTS) / FTD) | 0) * FTN + (((wx - fx * FTS) / FTD) | 0), c3 = sF.col[k3], L3 = c3 >>> 24, h3 = sF.h[k3], sy3 = ((HZ8 + (camZ - h3) * kc) | 0) - 8192;
          if (sy3 < yTop) { let o3 = L3 <= 200 ? lit(c3) : L3 < 255 ? waterPx(c3, L3 - 201, uf, vf) : c3; if (hf > 0) o3 = hazed(o3, hf, HAZ); const wt = L3 > 200 && L3 < 255; if (wt) wAny = true;
            let y = sy3 < 0 ? 0 : sy3;
            if (!wt && yTop - sy3 >= 3 && h3 - hPrevA[x] > rise) { const q0 = y * VW + x; fb[q0] = o3; zbuf[q0] = zr; y++; const a3 = uf + vf * 0.9, z3 = h3 * ZP; let fc = 0; for (let n = 0; y < yTop; y++, n++) { const q = y * VW + x; if (!(n & 1)) { fc = lit(((100 << 24) | faceCol(a3, z3 - (y - sy3) * zs, 0.5)) >>> 0); if (hf > 0) fc = hazed(fc, hf, HAZ); } fb[q] = fc; zbuf[q] = zr; } }
            else for (; y < yTop; y++) { const q = y * VW + x; fb[q] = o3; zbuf[q] = zr; if (wt) { wz[q] = zr; wrow[y] = 1; } }
            yTopA[x] = sy3; }
          hPrevA[x] = h3;
        }
        continue;
      }
      const k2 = (((vf - tv0) * 0.25) | 0) * TN + (((uf - tu0) * 0.25) | 0), c = TL[k2], L = c >>> 24; let h = TH[k2];
      if (L > 200 && L < 255) h = tWl;
      else { const gx = (uf - tu0) * 0.25 - 0.5, gy = (vf - tv0) * 0.25 - 0.5; if (gx >= 0 && gy >= 0 && gx < TN - 1 && gy < TN - 1) { const i = gx | 0, j = gy | 0, a = gx - i, b = gy - j, q = j * TN + i; h = (TH[q] * (1 - a) + TH[q + 1] * a) * (1 - b) + (TH[q + TN] * (1 - a) + TH[q + TN + 1] * a) * b; } }   // the height read smoothly between its samples: a lip is a line, not a row of blocks
      const sy = ((HZ8 + (camZ - h) * kc) | 0) - 8192;
      let gs = 0, wv = 0, hqv = 0, hq2 = 0;
      const gq = TGh[k2];
      if (bladeK > 0 && gq && gq < 255 && TG[k2] < 0.4 && !(pthT && pathNearPx(uf, vf, 0.15))) {   /* not on a cliff's lip: grass and rock alternate there, and the blades stood up as a row of teeth */ wv = WG[(((vf >> 5) & 127) << 7) | ((uf >> 6) & 127)]; gs = ((gq - ((gq * wv) >> 10)) * bladeK) | 0; if (gs) { hqv = tuftHash(uf - tu0, vf - tv0, ltx, lty); gs = (gs * (150 + (hqv & 127))) >> 8; if (g3 > 0) { hq2 = ih(k2, ltx * 7 + lty); gs += (gs * g3 * (40 + (hq2 & 63))) >> 8; } } }   /* (tufts: the grass of each small patch of the land stands a little taller or shorter and a shade darker or lighter than its neighbours', as the painted grass does near by; without it the middle distance looked mown flat and the grass seemed to stop at a line) */
      const syT = sy - gs;
      if (syT < yTop) {
        let out = L <= 200 ? TLL[k2] : L < 255 ? waterPx(c, L - 201, uf, vf) : c;
        if (L <= 200 && qst > 0.07) {                      // the ground this pixel covers reaches back toward the line before: its colour is the average of four points along that reach (one point of it alone made streaks that shuffled as the camera moved)
          const bu = qst * PGU[x], bv = qst * PGV[x]; let a1 = out, a2 = out, a3 = out, pu = uf - tu0 - bu, pv = vf - tv0 - bv;
          if (pu >= 0 && pu < 256 && pv >= 0 && pv < 256) { const t = TLL[((pv * 0.25) | 0) * TN + ((pu * 0.25) | 0)]; if (t >>> 24 >= 251) a1 = t; } pu -= bu; pv -= bv;
          if (pu >= 0 && pu < 256 && pv >= 0 && pv < 256) { const t = TLL[((pv * 0.25) | 0) * TN + ((pu * 0.25) | 0)]; if (t >>> 24 >= 251) a2 = t; } pu -= bu; pv -= bv;
          if (pu >= 0 && pu < 256 && pv >= 0 && pv < 256) { const t = TLL[((pv * 0.25) | 0) * TN + ((pu * 0.25) | 0)]; if (t >>> 24 >= 251) a3 = t; }
          const sa = (1020 - (out >>> 24) - (a1 >>> 24) - (a2 >>> 24) - (a3 >>> 24)) >> 2;   /* how many of the four lie under a cast shadow */
          const m1 = (((out ^ a1) & 0xfefefefe) >>> 1) + (out & a1), m2 = (((a2 ^ a3) & 0xfefefefe) >>> 1) + (a2 & a3); out = ((((((m1 ^ m2) & 0xfefefefe) >>> 1) + (m1 & m2)) & 0xffffff) | ((255 - sa) << 24)) >>> 0;
        }
        if (hf > 0) out = (hazed(out, hf, HAZ) & (out | 0xffffff)) >>> 0;
        let y = sy < 0 ? 0 : sy;
        if (yTop - sy >= 2 && L <= 200 && gq < 255 && (TG[k2] > 0.62 || h - hPrevA[x] > rise)) {   // a far cliff (steeper than about 48 degrees from the sample before): its top pixel, then rock
          if (sy >= 0) { const q = sy * VW + x; fb[q] = out; zbuf[q] = zr; y = sy + 1; }
          lfS = lfX === x - 1 ? lfS + ((L < 110 ? L : 110) - lfS) * 0.2 : L < 110 ? L : 110; lfX = x;   // (the face's light eased along the row: no column has a brightness of its own)
          const z0 = h * ZP, Lf = 108;
          fbA = uf + vf * 0.9; fbOn = false;
          { const hp = hPrevA[x], bu = (d - dPrev) * PGU[x], bv = (d - dPrev) * PGV[x]; fbD = bu + bv * 0.9;
            if (hp < h - 0.1) { fb1 = hTry(uf - bu * 0.25, vf - bv * 0.25) * ZP; fb2 = hTry(uf - bu * 0.5, vf - bv * 0.5) * ZP; fb3 = hTry(uf - bu * 0.75, vf - bv * 0.75) * ZP; fbT = z0; fbB = hp * ZP; fbOn = fb1 === fb1 && fb2 === fb2 && fb3 === fb3; } }
          let fc = 0; for (let n = 0; y < yTop; y++, n++) { const q = y * VW + x; if (!(n & 1)) { const zf = z0 - (y - sy) * zs; fc = lit(((Lf << 24) | faceCol(faceA(zf), zf, 0.5)) >>> 0); if (hf > 0) fc = hazed(fc, hf, HAZ); } fb[q] = fc; zbuf[q] = zr; }
        } else if (yTop - sy >= 3 && L <= 200) {
          const hp = hPrevA[x], syP = ((HZ8 + (camZ - hp) * kc) | 0) - 8192, den = syP > sy ? 1 / (syP - sy) : 0, bu = (d - dPrev) * PGU[x], bv = (d - dPrev) * PGV[x];   // each row of the picture between this reading and the one before takes the land's own colour at its own place on the slope (one colour pulled down the whole gap read as pixels stretched on end, and changed with every step)
          let lk = -1, lc2 = out;
          for (; y < yTop; y++) { const q = y * VW + x; let t = (y - sy) * den; if (t > 1) t = 1; const pu = uf - bu * t - tu0, pv = vf - bv * t - tv0;
            if (pu >= 0 && pu < 256 && pv >= 0 && pv < 256) { const k3 = ((pv * 0.25) | 0) * TN + ((pu * 0.25) | 0); if (k3 !== lk) { lk = k3; const t3 = TLL[k3]; lc2 = t3 >>> 24 >= 251 ? (hf > 0 ? (hazed(t3, hf, HAZ) & (t3 | 0xffffff)) >>> 0 : t3) : out; } }
            fb[q] = lc2; zbuf[q] = zr; }
        } else if (L > 200 && L < 255) { wAny = true; for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; wz[q] = zr; wrow[y] = 1; } }
        else for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; }
        if (gs) {                                            // the blades: the ground's own colour standing up (its edge shows against what lies behind); a gust passes over as a wave of light
          const b0 = wv > 110 ? out + ((~out >>> 3) & 0x1f1f) : out, g3on = g3 > 0.25, bc = g3on && (hq2 & 192) === 192 ? (b0 + ((~b0 >>> 3) & 0x1f1f)) >>> 0 : hqv & 128 || (g3on && (hq2 & 192) === 0) ? (b0 - ((b0 >>> 3) & 0x1f1f1f)) >>> 0 : b0, tipc = (bc + ((~bc >>> 4) & 0x0f0f)) >>> 0, rootc = g3on ? (bc - ((bc >>> 2) & 0x3f3f3f)) >>> 0 : bc, y1 = sy < yTop ? sy : yTop;
          for (let yy = syT < 0 ? 0 : syT; yy < y1; yy++) { const q = yy * VW + x; fb[q] = yy === syT ? tipc : yy >= y1 - 1 ? rootc : bc; zbuf[q] = zr; }   // (its tip a shade lighter, so standing grass reads as grass this far off)
        }
        yTopA[x] = syT;
      }
      hPrevA[x] = h;
    }
    step = d * d * STEPK * 1.5; if (step < 0.03) step = 0.03; if (step > 1.2) { const cap = d < 75 ? 1.2 : d * 0.016; if (step > cap) step = cap; } dPrev = d; d = nextRow(d, step, camF);   // (far land: three rows to two samples)
  }
  swD = d; swP = dPrev; swS = step;
}
function farSweep(d, dPrev, step, HAZ, pivD, HZ8, ZPF, camF, sunF) {
  while (d < DFAR) {                                         // far: the far field (a piece that is not made yet shows as air)
    wFar = 0.5; wGl = sunF * 0.1; wSh = d < 112 ? 3 : d < 200 ? 4 : 5;
    const k = FOC / d, hf = farHaze(d), qst = (d - dPrev) * 0.25, Rr = (d - pivD) * (d - pivD), rise = step * 0.9, gfar = d < GRASS_FAR ? (GRASS_FAR - d > 25 ? 1 : (GRASS_FAR - d) / 25) / ZP : 0;   // (gfar: the far land's grass stands to 140 m, growing shorter over the last 25)
    let lfx = 1e9, lfy = 1e9, FT = null, fx0 = 0, fy0 = 0, FC = null, FH = null, FG = null, lfS = 0, lfX = -9;
    for (let x = 0; x < VW; x++) {
      const yTop = yTopA[x]; if (yTop <= 0) continue;
      const dx = PDC[x] + PCS[x] * Math.sqrt(Rr - PS2[x]), kc = FOC / dx, zr = (dx * 100) | 0, zs = dx * ZPF, wx = camX + PGX[x] * dx, wy = camY + PGY[x] * dx, fx = Math.floor(wx / FTS), fy = Math.floor(wy / FTS);
      if (fx !== lfx || fy !== lfy) { FT = farTile(fx, fy); lfx = fx; lfy = fy; fx0 = fx * FTS; fy0 = fy * FTS; if (FT) { FC = FT.col; FH = FT.h; FG = FT.wood; } }
      if (!FT) continue;
      const gxf = (wx - fx0) / FTD, gyf = (wy - fy0) / FTD, k2 = (gyf | 0) * FTN + (gxf | 0), c = FC[k2], L = c >>> 24;
      let h = FH[k2];                                       // the far land's height is read smoothly between its samples (taken sample by sample, far ridges were stepped and the steps crawled)
      { const bx = gxf - 0.5, by = gyf - 0.5; if (bx >= 0 && by >= 0 && bx < FTN - 1 && by < FTN - 1 && (L <= 200 || L === 255)) { const i = bx | 0, j = by | 0, a = bx - i, b = by - j, q = j * FTN + i; h = (FH[q] * (1 - a) + FH[q + 1] * a) * (1 - b) + (FH[q + FTN] * (1 - a) + FH[q + FTN + 1] * a) * b; } }
      const sy = ((HZ8 + (camZ - h) * kc) | 0) - 8192;
      if (sy < yTop) {
        let cf = c, sa = 0;
        if (L <= 200) {                                    // (as in the middle distance: the average of four points along the pixel's reach)
          const bx = qst * PGX[x], by = qst * PGY[x]; let c1 = c, c2 = c, c3 = c, ax = wx - fx0 - bx, ay = wy - fy0 - by;
          if (ax >= 0 && ax < FTS && ay >= 0 && ay < FTS) { const t = FC[((ay / FTD) | 0) * FTN + ((ax / FTD) | 0)]; if (t >>> 24 <= 200) c1 = t; } ax -= bx; ay -= by;
          if (ax >= 0 && ax < FTS && ay >= 0 && ay < FTS) { const t = FC[((ay / FTD) | 0) * FTN + ((ax / FTD) | 0)]; if (t >>> 24 <= 200) c2 = t; } ax -= bx; ay -= by;
          if (ax >= 0 && ax < FTS && ay >= 0 && ay < FTS) { const t = FC[((ay / FTD) | 0) * FTN + ((ax / FTD) | 0)]; if (t >>> 24 <= 200) c3 = t; }
          const m1 = (((c ^ c1) & 0xfefefefe) >>> 1) + (c & c1), m2 = (((c2 ^ c3) & 0xfefefefe) >>> 1) + (c2 & c3); cf = ((((m1 ^ m2) & 0xfefefefe) >>> 1) + (m1 & m2)) >>> 0; sa = ((c >>> 24) & 1) + ((c1 >>> 24) & 1) + ((c2 >>> 24) & 1) + ((c3 >>> 24) & 1);
        }
        let out = hazed(L <= 200 ? lit(cf) : L < 255 ? waterPx(c, L - 201, wx * PPM, wy * PPV) : c, hf, HAZ); if (sa) out = ((out & 0xffffff) | ((255 - sa) << 24)) >>> 0;
        let y = sy < 0 ? 0 : sy;
        if (yTop - sy >= 2 && L <= 200 && (FG[k2] === 1 || h - hPrevA[x] > (step * 0.8 > 1.2 ? step * 0.8 : 1.2))) {
          if (sy >= 0) { const q = sy * VW + x; fb[q] = out; zbuf[q] = zr; y = sy + 1; }
          lfS = lfX === x - 1 ? lfS + ((L < 110 ? L : 110) - lfS) * 0.2 : L < 110 ? L : 110; lfX = x;
          const z0 = h * ZP, Lf = 104;
          fbA = wx * PPM + wy * PPV * 0.9; fbOn = false;
          { const hp = hPrevA[x], bx = (d - dPrev) * PGX[x], by = (d - dPrev) * PGY[x]; fbK = 0; fbH = (h - hp) * ZP;
            if (hp < h - 0.1) {   // where between the two readings the face stands, found by halving (four looks at the land): the rock keeps its own place however the rows fall (guessed as a straight slope between the readings, the rock slid across the face with every step)
              const hm = (h + hp) * 0.5; let t0 = 0, t1 = 1;
              for (let it = 0; it < 4; it++) { const tm = (t0 + t1) * 0.5, hh = hFar(wx - bx * tm, wy - by * tm); if (hh !== hh) break; if (hh > hm) t0 = tm; else t1 = tm; }
              const tl = (t0 + t1) * 0.5; fbA = (wx - bx * tl) * PPM + (wy - by * tl) * PPV * 0.9; } }
          let fc = 0; for (let n = 0; y < yTop; y++, n++) { const q = y * VW + x; if (!(n & 1)) { const zf = z0 - (y - sy) * zs, dz = z0 - zf; fc = hazed(lit(((Lf << 24) | faceCol(fbA - (dz < fbH ? dz : fbH) * fbK, zf, 0.5)) >>> 0), hf, HAZ); } fb[q] = fc; zbuf[q] = zr; }
        } else if (yTop - sy >= 3 && L <= 200) {
          const hp = hPrevA[x], syP = ((HZ8 + (camZ - hp) * kc) | 0) - 8192, den = syP > sy ? 1 / (syP - sy) : 0, bx = (d - dPrev) * PGX[x], by = (d - dPrev) * PGY[x];   // (as in the middle distance: the slope's own colours, row by row)
          let lk = -1, lc2 = out;
          for (; y < yTop; y++) { const q = y * VW + x; let t = (y - sy) * den; if (t > 1) t = 1; const ax = wx - bx * t - fx0, ay = wy - by * t - fy0;
            if (ax >= 0 && ax < FTS && ay >= 0 && ay < FTS) { const k3 = ((ay / FTD) | 0) * FTN + ((ax / FTD) | 0); if (k3 !== lk) { lk = k3; const c3 = FC[k3]; lc2 = (c3 >>> 24) <= 200 ? hazed(lit(c3), hf, HAZ) : out; } }
            fb[q] = lc2; zbuf[q] = zr; }
        } else if (L > 200 && L < 255) { wAny = true; for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; wz[q] = zr; wrow[y] = 1; } }
        else for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; }
        yTopA[x] = sy;
        if (gfar > 0 && L <= 200) { const gq = FG[k2]; if (gq > 1) { const hq = ih(k2, lfx * 7 + lfy * 13); let gs = ((gq - 2) * kc * gfar * (150 + (hq & 127))) >> 8; if (gs < 1 && gq > 7 && (hq & 3)) gs = 1; if (gs > 0) {   /* (very far off a blade is under a pixel tall: three tufts in four of the taller grass still stand one pixel, so far grass keeps its ragged top instead of going flat) */   // the far land's standing grass: the ground's own colour stood up, its tip a shade lighter
          const t0 = sy - gs, bc = hq & 128 ? (out - ((out >>> 3) & 0x1f1f1f)) >>> 0 : out, tipc = (bc + ((~bc >>> 4) & 0x0f0f)) >>> 0, y1 = sy < yTop ? sy : yTop; for (let yy = t0 < 0 ? 0 : t0; yy < y1; yy++) { const q = yy * VW + x; fb[q] = yy === t0 ? tipc : bc; zbuf[q] = zr; } if (t0 < yTopA[x]) yTopA[x] = t0; } } }
      }
      hPrevA[x] = h;
    }
    step = d * d * STEPK * 1.5; if (step > 1.2) { const cap = d < 75 ? 1.2 : d * 0.016; if (step > cap) step = cap; } dPrev = d; d = nextRow(d, step, camF);   // (far land: three rows to two samples)
  }
}
function drawSky(T, hazePix) {
  const sky = T.skyBuf, cl = T.cloudBuf, m1 = T.m1;
  // the sky turns and tilts with the camera: clouds over the banded sky, behind the mountains; below the horizon, air
  const W = SKW - 1, skyOff = ((Math.round(camYaw * SKRAD) % SKW) + SKW) & W, drift = Math.floor(frame * 0.05), cc = T.cc;
  let top = 0; for (let x = 0; x < VW; x++) if (yTopA[x] > top) top = yTopA[x];
  for (let y = 0; y < top; y++) {
    const row = y * VW, yb0 = Math.floor((y - HZ) * IRS) + SH, yb = yb0 < 0 ? 0 : yb0, srow = yb * SKW, below = y >= HZ;
    for (let x = 0; x < VW; x++) {
      if (y >= yTopA[x]) continue;
      const xs = (SKX[x] + skyOff) & W;
      if (below) fb[row + x] = hazePix;
      else if (yb >= m1[xs]) fb[row + x] = sky[srow + xs];
      else { const ci = cl[srow + ((xs + drift) & W)]; fb[row + x] = ci ? cc[ci] : sky[srow + xs]; }
      zbuf[row + x] = 65535;
    }
  }
}
function drawGround() {
  const T = TOD[tmode], HAZ = T.haze, hazePix = rgb(HAZ[0], HAZ[1], HAZ[2]), sky = T.skyBuf, cl = T.cloudBuf, m1 = T.m1;
  const kx0 = (0.5 - VW / 2) / FOC, B = 4194304, camL = camX * RX + camY * RY;   // camL: the camera's own place along its sideways direction
  yTopA.fill(VH); hPrevA.fill(-1e9); syncT = 0; lookN = 0;
  const pOn = !!(feats && feats.sd && course && featFor === course.id); let pthC = false, pthT = false, prsA = null;   // (paths added to the course: no grass stands on them)
  if (!bcam && camD < CAMMIN) camD = CAMMIN;   // (held back to the closest the player may zoom; the ball camera keeps its own)
  const DN = SIMPLEG ? 0 : bcam ? 78 : DNEAR;   // (SIMPLEG: the player chose the simple grass everywhere: the middle land's plain blades and tufts are drawn from the golfer's feet, no painted ground)   // (following the ball, the painted ground is drawn to 78 m wherever it has been painted: the landing ground is whole long before the camera comes down to it, instead of wiping in at 30 m)
  const pivD = camD < 14 ? camD : 14, cuP = camX * PPM, cvP = camY * PPV, HZ8 = HZ + 8192, ZPF = ZP / FOC;   // (pivD: how far ahead the point is that the camera swings round)
  for (let x = 0; x < VW; x++) { const kx = kx0 + x / FOC, c2 = 1 / (1 + kx * kx); PGX[x] = FX + RX * kx; PGY[x] = FY + RY * kx; PGU[x] = PGX[x] * PPM; PGV[x] = PGY[x] * PPV; PCS[x] = Math.sqrt(c2); PS2[x] = pivD * pivD * kx * kx * c2; PDC[x] = pivD * c2; }
  { const mx = camX - rowX, my = camY - rowY; rowPh = mx * mx + my * my > 25 ? 0 : rowPh + mx * FX + my * FY; rowX = camX; rowY = camY; }
  const camF = rowPh;
  windTick(); ballU = Math.round(ball.x * PPM); ballV = Math.round(ball.y * PPV);
  const leanK = (WDX * RX + WDY * RY) * 0.75 / 255;          // how far a blade's tip leans across the screen, per unit of gust and of blade height
  const ballD = (ball.x - camX) * FX + (ball.y - camY) * FY, sunF = Math.max(0, FX * 0.74 - FY * 0.672);   // how far ahead the ball is; how much the camera faces the sun
  { const S1 = T.sky[1], S2 = T.sky[2]; wSR = (S1[0] + S2[0]) >> 1; wSG = (S1[1] + S2[1]) >> 1; wSB = (S1[2] + S2[2]) >> 1; }
  if (wAny) { wz.fill(0); wrow.fill(0); wAny = false; }
  const gh0 = groundH(player.x, player.y); capA = 1e9; capB = gh0 + 0.25; capEnd = 0;   // (the cutaway is off: the owner moves the camera instead)
  // the first distance: the nearest at which ground could show at the bottom of the screen. Walk out from the camera across the width of the view; any
  // higher ground met on the way brings that distance in (the camera may hang over a drop with a plateau just ahead: the sweep must not start beyond its edge)
  let hm = Math.max(wlAt(camX, camY), wlAt(camX + FX * 6, camY + FY * 6)), d0 = 40;
  for (let dd = 1.2; dd < d0; dd += dd < 8 ? 0.6 : 1.2) {
    for (let i = -2; i <= 2; i++) { const la = i * 0.31 * dd, g = groundH(camX + FX * dd + RX * la, camY + FY * dd + RY * la); if (g > hm) hm = g; }
    const dn = FOC * (camZ - hm) / (VH - HZ) * 0.96; if (dn < d0) d0 = dn;
  }
  let d = clamp(d0, 1.1, 40), step = 0.036, dPrev = d;
  while (d < DN) {                                        // near: the painted chunks
    wFar = d < 8 ? 0 : d > 68 ? 0.5 : (d - 8) / 120; wGl = sunF * (d < 10 ? 0 : d > 50 ? 0.1 : (d - 10) / 400); wSh = d < 14 ? 0 : d < 28 ? 1 : 2;
    const k = FOC / d, kz = k / ZP, zr = (d * 100) | 0, lx = kx0 * d, dl = d / FOC;
    const uf0 = (camX + FX * d + RX * lx) * PPM + B, du = RX * dl * PPM, vf0 = (camY + FY * d + RY * lx) * PPV + B, dv = RY * dl * PPV;
    const base = HZ + camZ * k + 8192, rise = step * 1.2 * ZP, zs = ZP / k, capOn = d < capEnd, lvp = ih(Math.round((camF + d) * 16), 7) & 1, lv = d < 13 * RS ? 0 : d < 21 * RS ? 1 : 2,   /* (lvp: this line of ground's own coin, so the change from one level to the next is a band of mixed lines that stand still on the ground) */ kzg = kz, ballBy = d > ballD - 1.2 && d < ballD + 1.2, gsh = d < 14 ? 1 : d < 28 ? 2 : 3, zqm = d < 12 ? -1 : d < 24 ? -2 : -4;   // (zqm: past 12 m the rock's height is read in steps of 2 px, past 24 m of 4: a row of the face is worked out once for two or more screen rows)   // (kzg: screen rows per height px of grass; the blades sink away toward 30 m, where the painted ground ends)
    const fdOn = d > DN - 9, fdW = fdOn ? (d - (DN - 9)) / 9 : 0;   // the last 9 m of painted ground fade into the plainer ground beyond (no line where one ends)
    let fdA = null, grA = null, mp = null, lcx = 1e9, lcy = 1e9, col = null, lc = null, lift = null, mt = null, sub = false, SL = null, SLL = null, SHh = null, SGh = null, su0 = 0, sv0 = 0, tlA = null, tsA = null, skip = false, sWl = -99;
    for (let x = 0; x < VW; x++) {
      const yTop = yTopA[x]; if (yTop <= 0) continue;
      const u = ((uf0 + x * du) | 0) - B, v = ((vf0 + x * dv) | 0) - B, cx = u >> 7, cy = v >> 7;
      if (cx !== lcx || cy !== lcy) {
        const C = d > DNEAR + 1 ? chunkHave(cx, cy) : chunkTry(cx, cy); lcx = cx; lcy = cy;
        if (C) { if (C.lt !== tmode) { C.lc = litArr(C.col); C.lt = tmode; C.l1 = null; C.l2 = null; } { const Tt = tileHave(cx >> 1, cy >> 1); tlA = Tt ? Tt.lt : null; tsA = Tt ? Tt.sh : null; fdA = fdOn && Tt && Tt.ll !== null && Tt.llt === tmode ? Tt.ll : null; su0 = (cx >> 1) * TPX; sv0 = (cy >> 1) * TPX; if (!tlA && wkOn) wkTile(cx >> 1, cy >> 1, true); else if (!Tt) tileAt(cx >> 1, cy >> 1); } col = C.col; lc = C.lc; lift = C.lift; mt = C.mt; sub = false; skip = false; grA = C.gr; pthC = pOn && pathNearPx(cx * 128 + 64, cy * 128 + 64, 5); prsA = press.size ? press.get((cx + 32768) * 65536 + (cy + 32768)) || null : null; if (lv) { if (!C.l1) chunkMips(C); if (lv === 1) { mp = C.l1; grA = C.g1; } else { mp = C.l2; grA = C.g2; } } }
        else { let Tt = tileHave(cx >> 1, cy >> 1); if (!Tt) { if (syncT < (wkOn ? 2 : 5) || genBudget > 100) { Tt = tileAt(cx >> 1, cy >> 1); syncT++; } else tileWant(cx >> 1, cy >> 1); }
          if (Tt) { SL = tileLook(Tt); if (Tt.llt !== tmode) { Tt.ll = litArr(SL); Tt.llt = tmode; } SLL = Tt.ll; SHh = Tt.h; SGh = Tt.gh; sWl = Tt.wl; su0 = (cx >> 1) * TPX; sv0 = (cy >> 1) * TPX; sub = true; skip = false; } else skip = true; }
      }
      if (skip) continue;
      if (sub) {                                             // the chunk is not painted yet: its tile's plain colours stand in
        const k2 = ((v - sv0) >> 2) * TN + ((u - su0) >> 2), c2 = SL[k2], L2 = c2 >>> 24; let l2 = (L2 > 200 && L2 < 255 ? sWl : SHh[k2]) * ZP;
        if (capOn) { const cp = capAt(d, lx + x * dl) * ZP; if (l2 > cp) l2 = cp; }
        const sy2 = ((base - l2 * kz) | 0) - 8192;
        if (sy2 < yTop) { const o2 = L2 <= 200 ? SLL[k2] : waterPx(c2, L2 - 201, u, v), wt = L2 > 200 && L2 < 255; if (wt) wAny = true; for (let y = sy2 < 0 ? 0 : sy2; y < yTop; y++) { const q = y * VW + x; fb[q] = o2; zbuf[q] = zr; if (wt) { wz[q] = zr; wrow[y] = 1; } } yTopA[x] = sy2;
          if (d > 30 && L2 <= 200 && SGh !== null) { const gq2 = SGh[k2]; if (gq2 && gq2 < 255) { const t0 = standBlades(x, sy2, yTop, o2, (gq2 * kz * (150 + (ih(k2, cx * 7 + cy) & 127))) >> 8, zr); if (t0 < sy2) yTopA[x] = t0; } } }
        hPrevA[x] = l2; continue;
      }
      const i = ((v & 127) << 7) | (u & 127); let lf = lift[i], cut = 0;
      if (capOn) { const cp = capAt(d, lx + x * dl) * ZP; if (lf > cp) { cut = lf - cp; lf = cp; } }
      const sy = ((base - lf * kz) | 0) - 8192;
      let gs = 0, gq = 0, wv = 0;
      if (kzg > 0 && (gq = lv === 0 ? grA[i] : lv === 1 ? grA[(((v & 127) >> 1) << 6) | ((u & 127) >> 1)] : grA[(((v & 127) >> 2) << 5) | ((u & 127) >> 2)]) && !(pthC && pathNearPx(u, v, 0.15))) {   // grass stands here
        wv = WG[(((v >> 5) & 127) << 7) | ((u >> 6) & 127)]; let gh = gq & 127; gh -= (gh * wv) >> 10;                              // a gust bends it lower
        if (ballBy) { const bu = u - ballU, bv = v - ballV, r2 = bu * bu + bv * bv * 4; if (r2 < 1936) gh = (gh * r2 / 1936) | 0; }   // it lies flat round the ball, so the ball can be seen
        if (prsA) { const pp = prsA[(((v & 127) >> 2) << 5) | ((u & 127) >> 2)]; if (pp) gh = (gh * (255 - pp)) >> 8; }   // pressed flat where a wheel or a foot has passed
        gs = (gh * kzg) | 0;
      }
      const syT = sy - gs;
      if (syT < yTop) {
        const c = col[i], L = c >>> 24, m = mt[i];
        let out = L <= 200 ? (lv === 0 ? lc[i] : (lv === 1 ? mp[(((v & 127) >> 1) << 6) | ((u & 127) >> 1)] : mp[(((v & 127) >> 2) << 5) | ((u & 127) >> 2)]) || lc[i]) : L < 255 ? waterPx(c, L - 201, u, v) : c;
        if (fdA !== null && L <= 200) out = fadeMix(out, fdA[((v - sv0) >> 2) * TN + ((u - su0) >> 2)], fdW);
        if (prsA && L <= 200) { const pp = prsA[(((v & 127) >> 2) << 5) | ((u & 127) >> 2)]; if (pp > 150) out = (out + ((~out >>> 2) & 0x3f3f) + ((~out >>> 3) & 0x1f1f)) >>> 0; else if (pp) out = (out - ((out >>> 4) & 0x0f0f0f)) >>> 0; }   // a wheel's track: the grass laid flat shows its pale side (toward yellow); a footprint, a shade darker
        if (cut > 1) { const n = ih(u >> 2, v >> 1); out = lit((((118 + (n >> 4)) << 24) | (cut < 12 + (n >> 5) ? G_SOIL[2 + (n >> 7)] : ROCKB[2 + (n >> 7)])) >>> 0); }   // the cut: soil over rock
        let y = sy < 0 ? 0 : sy;
        if (cut <= 1 && yTop - sy >= 4 && L <= 200 && (m === M_CLIFF || m === M_ROCK || (lf - hPrevA[x] > rise && m !== M_MUD && m !== M_SAND))) {   // (also when its foot is below the screen)   // a steep step or steep rock: its top pixel, then the face below it
          const cliff = m === M_CLIFF;
          if (sy >= 0 && !cliff) { fb[sy * VW + x] = out; zbuf[sy * VW + x] = zr; y = sy + 1; }
          const mid = mPrevA[x] === M_CLIFF,   // (the sample before was on the cliff too: this slice is from the middle of the face)
            sandW = !cliff && mPrevA[x] === M_SAND, wob = faceWob(u, v), gap = yTop - sy, tk = ((v - sv0) >> 2) * TN + ((u - su0) >> 2),
           tkc = (((v - sv0) >> 5) << 3) * TN + (((u - su0) >> 5) << 3), lq = tlA ? (tlA[tkc] < 0.3 ? 0 : tlA[tkc] < 0.62 ? 1 : 2) : 1, L0 = cliff ? 122 + lq * 24 : 80 + lq * 14, Lf = sandW ? Math.min(200, (L * 0.86 + 20) | 0) : L0 | 0;   // (sandW: the far wall of a bunker; L0: the tile's own smooth light, so the face is not striped by the grain of the ground above it)
          let lastZ = 1e9, fp = 0;
          fbA = u + v * 0.9; fbOn = false;
          { const hp = hPrevA[x], kxx = kx0 + x / FOC, bu = (d - dPrev) * (FX + RX * kxx) * PPM, bv = (d - dPrev) * (FY + RY * kxx) * PPV; fbD = bu + bv * 0.9;
            fbK = 0;
            if (hp < lf - 3 && (fbD > 1.5 || fbD < -1.5)) {
              if ((cliff && mid) || (fbD < 5 && fbD > -5)) { fbH = lf - hp; fbK = fbD / fbH; }   // both ends on the face, or the samples close together: the face runs straight between them
              else { fbOn = true; fbT = lf; fbB = hp; fb1 = hUV(u - bu * 0.25, v - bv * 0.25) * ZP; fb2 = hUV(u - bu * 0.5, v - bv * 0.5) * ZP; fb3 = hUV(u - bu * 0.75, v - bv * 0.75) * ZP; } } }
          const aLip = cliff || m === M_ROCK ? 0 : fbOn ? faceA((lf + hPrevA[x]) * 0.5) : fbA - fbD * 0.5 * (fbK !== 0 ? 1 : 0), over = cliff || m === M_ROCK ? 0 : Math.round((2 + 11 * sstep(0.28, 0.74, vnoise(aLip / 7, 0.5, 12))) * k / PPM),   /* the grass hangs over the lip in soft scallops (not a row of even notches) */
           sc = over ? rampAt(FAR_RAMP[m], 0.5) : 0, Ls = cliff ? 0 : L0 / 0.64 > 190 ? 190 : (L0 / 0.64) | 0;   // clumps of grass hang over the lip (their lengths belong to the lip, not to the sample)
          for (; y < yTop; y++) {
            const kk = y - sy, q = y * VW + x;
            if (kk <= over && over) fp = lit(((Math.max(1, kk < over * 0.4 ? Ls + 10 : kk < over * 0.75 ? Ls - 14 : Ls - 44) << 24) | sc) >>> 0);   // bright strands, darker toward the tips
            else {
              const zz = ((lf - kk * zs) | 0) & zqm, lip = !cliff && kk <= over + 2, foot = !mid && gap >= 24 && yTop < VH && yTop - y <= 10, edge = lip || foot;
              if (zz !== lastZ || edge) {                    // (close up, several screen rows share one row of the rock)
                let Ly = Lf - (lip ? 26 : 0) - (foot ? (11 - (yTop - y)) * 3 : 0); Ly = Ly < 1 ? 1 : Ly > 200 ? 200 : Ly;
                const af = fbOn ? faceA(zz) : fbK !== 0 ? fbA - (lf - zz < fbH ? lf - zz : fbH) * fbK : fbA, gn = ih(af >> gsh, zz >> gsh) / 256;   // (the grain in cells big enough to see: they do not twinkle as the samples shift)
                 fp = lit(((Ly << 24) | (sandW ? rampAt(G_SAND, 0.3 + gn * 0.24 + (kk * zs > 9 ? 0.16 : 0)) : faceCol(af, zz + wob, gn))) >>> 0); lastZ = zz;
              }
            }
            fb[q] = fp; zbuf[q] = zr;
          }
        } else if (cut <= 1 && yTop - sy >= 3 && L <= 200 && yTop < VH) {  // a slope seen steeply: each row takes the grain of its own height, so nothing is pulled into streaks
          const hp = hPrevA[x], syF = hp > -1e6 ? base - hp * kz - 8192 : 1e6, syP = syF < 1e6 ? Math.floor(syF) : 1000000;
          slopeFillNear(x, y, yTop, sy, syP > sy ? 1 / (syP - sy) : 0, u, v, (d - dPrev) * PGU[x], (d - dPrev) * PGV[x], cx, cy, col, lc, out, zr);   // (its own function: written out here, this small loop made the browser stop optimising the whole of drawGround, seven times slower; measured in the browser pane, 56 ms against 6)
        } else if (L > 200 && L < 255) { wAny = true; for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; wz[q] = zr; wrow[y] = 1; } }
        else for (; y < yTop; y++) { const q = y * VW + x; fb[q] = out; zbuf[q] = zr; }
        if (gs) {                                            // the blades: dark at the root, the ground's own colour, bright at the tip; in a gust they shine
          const fl = gq & 128 && lv === 0, body = fl ? lc[(i + 256) & 16383] : out, gust = wv > 90 + ((u * 5 + v * 3) & 63);
          let tip = fl ? out : body + ((~body >>> 3) & 0x1f1f); if (gust && !fl) tip += (~tip >>> 3) & 0x1f1f;      // (toward yellow, not toward white: the green stays rich)
          const dk = body - ((body >>> 2) & 0x3f3f3f), dk2 = dk - ((dk >>> 2) & 0x3f3f3f), y1 = sy < yTop ? sy : yTop;
          const ya = fl ? syT + 1 + ((3 * kzg) | 0) : sy - ((gs * (gust ? 120 : 196)) >> 8), yb = sy - ((gs * 110) >> 8), yc = sy - ((gs * 44) >> 8);
          const lp = lv === 0 && !fl && gs >= 5 && wv > 50 ? leanK * wv * gs : 0, nsg = lp > 0.6 || lp < -0.6 ? (lp > 2.4 || lp < -2.4 ? 3 : lp > 1.4 || lp < -1.4 ? 2 : 1) : 0;
          if (nsg) {                                         // leaning: the blade in steps, each step up taken from the blade rooted that much upwind
            let top = 0, g2 = gs, b2 = body, t2 = tip, d2 = dk, e2 = dk2;
            for (let j = 0; j <= nsg; j++) {
              const h0 = (gs * j / (nsg + 1)) | 0, h1 = j === nsg ? 255 : (gs * (j + 1) / (nsg + 1)) | 0;
              if (j) {
                const sh = Math.round(lp * j / nsg), u2 = ((uf0 + (x - sh) * du) | 0) - B, v2 = ((vf0 + (x - sh) * dv) | 0) - B;
                if ((u2 >> 7) === cx && (v2 >> 7) === cy) {
                  const i2 = ((v2 & 127) << 7) | (u2 & 127), q2 = grA[i2];
                  if (!q2 || q2 & 128) break;
                  let gh2 = q2 & 127; gh2 -= (gh2 * wv) >> 10; g2 = (gh2 * kzg) | 0; b2 = lc[i2]; t2 = b2 + ((~b2 >>> 3) & 0x1f1f); if (gust) t2 += (~t2 >>> 3) & 0x1f1f; d2 = b2 - ((b2 >>> 2) & 0x3f3f3f); e2 = d2 - ((d2 >>> 2) & 0x3f3f3f);
                }
              }
              if (g2 <= h0) break;
              const hT = g2 < h1 ? g2 : h1, ta = (g2 * (gust ? 120 : 196)) >> 8, tb2 = (g2 * 110) >> 8, tc = (g2 * 44) >> 8;
              for (let hp = h0 + 1; hp <= hT; hp++) { const yy = sy - hp; if (yy < yTop && yy >= 0) { const q = yy * VW + x; fb[q] = hp > ta ? t2 : hp > tb2 ? b2 : hp > tc ? d2 : e2; zbuf[q] = zr; } }
              top = hT; if (g2 < h1) break;
            }
            yTopA[x] = sy - top < yTop ? sy - top : yTop;
          }
          else if (lv === 0) { for (let yy = syT < 0 ? 0 : syT; yy < y1; yy++) { const q = yy * VW + x; fb[q] = yy < ya ? tip : yy < yb ? body : yy < yc ? dk : dk2; zbuf[q] = zr; } yTopA[x] = syT; }
          else { yTopA[x] = syT; const t1 = lv === 1 ? tip : body + ((~body >>> 4) & 0x0f0f), lo = lv === 1 ? dk : body; for (let yy = syT < 0 ? 0 : syT; yy < y1; yy++) { const q = yy * VW + x; fb[q] = yy < ya ? t1 : yy < yc ? body : lo; zbuf[q] = zr; } }   // (farther off: softer tips, no dark roots)
        }
        else yTopA[x] = syT;
      }
      hPrevA[x] = lf; mPrevA[x] = mt[i];
    }
    step = d * d * STEPK * (d > 14 ? 1.25 : 1); if (step < 0.036) step = 0.036; dPrev = d; d = nextRow(d, step, camF);   // (a little coarser past the golfer)
  }
  for (let x = 0; x < VW; x++) hPrevA[x] /= ZP;               // (the near range keeps heights in px, the others in metres)
  midSweep(d, dPrev, step, HAZ, kx0, B, pivD, cuP, cvP, HZ8, ZPF, pOn, camF, sunF);   // the middle land, then the far land, then the sky: each a function of its own (kept in one function with the near sweep, the whole grew past what the browser will optimise: 56 ms a frame instead of 7)
  farSweep(swD, swP, swS, HAZ, pivD, HZ8, ZPF, camF, sunF);
  drawSky(T, hazePix);
}

// a sprite on the screen at scale s, behind any ground nearer than its distance (zr, centimetres); sway bends its rows;
// ghost thins it around the golfer; hz fades it into the air
// A sculpture drawn small is drawn from a copy shrunk beforehand (each pixel takes one of the colours of the 2 x 2 it stands for: the commonest, never a
// blend, so it stays crisp pixel art), halved as often as needed, so a far tree is a small picture of the tree, not a sprinkling of its pixels that changes with every step; and its size then changes in steps of a fiftieth, so its
// pixels hold still between steps.
function mipOf(S) {
  if (S.mip) return S.mip;
  const sw = S.w, w = (S.w + 1) >> 1, h = (S.h + 1) >> 1, sp = S.px, px = new Uint32Array(w * h), x0 = new Int16Array(h), x1 = new Int16Array(h);
  for (let y = 0; y < h; y++) {
    let a = w, b = -1;
    for (let x = 0; x < w; x++) {
      let n = 0, c0 = 0, c1 = 0, c2 = 0, c3 = 0;
      for (let k = 0; k < 4; k++) { const X = x * 2 + (k & 1), Y = y * 2 + (k >> 1); if (X >= sw || Y >= S.h) continue; const c = sp[Y * sw + X]; if (!c) continue; if (n === 0) c0 = c; else if (n === 1) c1 = c; else if (n === 2) c2 = c; else c3 = c; n++; }
      if (n < 2) continue;
      px[y * w + x] = n === 2 ? c0 : c0 === c1 || c0 === c2 || (n > 3 && c0 === c3) ? c0 : c1 === c2 || (n > 3 && c1 === c3) ? c1 : n > 3 && c2 === c3 ? c2 : (c1 >>> 24) >= (c0 >>> 24) === ((c1 >>> 24) <= (c2 >>> 24)) ? c1 : (c0 >>> 24) >= (c1 >>> 24) === ((c0 >>> 24) <= (c2 >>> 24)) ? c0 : c2;   // one that two of them share; else the middle one by light
      if (x < a) a = x; b = x;
    }
    x0[y] = a; x1[y] = b;
  }
  return S.mip = { w, h, ax: S.ax / 2, ay: S.ay / 2, px, zb: null, x0, x1, wind: null, mip: null };
}
let ghostX = 0, ghostY = 0, blitDith = 0;   // blitDith 1..16: only that many sixteenths of the sprite's pixels are drawn (a dissolve)
const BAY4 = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
function blit(S, bx, by, s, zr, swayAmp, swayPh, ghost, hz) {
  if (s < 0.5) { while (s < 0.5 && S.w > 6) { S = S.mip || mipOf(S); s *= 2; } s = Math.round(s * 48) / 48; if (s <= 0) return; }   // drawn small: from the shrunk copy, its size in steps
  const w = S.w, sp = S.px, inv = 1 / s, x0 = bx - S.ax * s, y0 = by - S.ay * s, Ya = Math.max(0, Math.floor(y0)), Yb = Math.min(VH - 1, Math.ceil(y0 + S.h * s)), zmin = zr - 30, HAZ = TOD[tmode].haze;
  for (let Y = Ya; Y <= Yb; Y++) {
    const sy = ((Y + 0.5 - y0) * inv) | 0; if (sy < 0 || sy >= S.h) continue;
    const a = S.x0[sy], b = S.x1[sy]; if (b < a) continue;
    let sh = 0;
    if (swayAmp) { const hf = (S.ay - sy) / S.ay; if (hf > 0) sh = Math.round(Math.sin(swayPh + hf * 1.6) * swayAmp * hf * hf * s); }
    const Xa = Math.max(0, Math.floor(x0 + a * s) + sh), Xb = Math.min(VW - 1, Math.ceil(x0 + (b + 1) * s) + sh), row = Y * VW, srow = sy * w;
    for (let X = Xa; X <= Xb; X++) {
      const sx = ((X - sh + 0.5 - x0) * inv) | 0; if (sx < a || sx > b) continue;
      const c = sp[srow + sx]; if (!c) continue;
      if (blitDith && BAY4[((Y & 3) << 2) | (X & 3)] >= blitDith) continue;
      const q = row + X; if (zbuf[q] < zmin) continue;
      if (blitW > 0 && czS[q] === frame && czB[q] > blitW) continue;   // (behind a nearer part of the cart)
      if (wz[q] > 1) wz[q] = 1;                                         // (it stands in front of water: that pixel is no longer water)
      if (ghost && ((X + Y) & 1)) { const dx = X - ghostX, dy = Y - ghostY; if (dx * dx + dy * dy * 0.6 < 2700) continue; }
      const o = (c >>> 24) === 255 ? c : lit(c);
      fb[q] = hz > 0 ? hazed(o, hz, HAZ) : o;
    }
  }
}
let shK = 1;
function darken(q) {   // one screen pixel in shadow (cooler, and once a frame at most)
  const m = frame & 65535; if (smark[q] === m) return; smark[q] = m;
  const c = fb[q], k = shK; fb[q] = (0xff000000 | ((((c >> 16) & 255) * (1 - 0.3 * k)) << 16) | ((((c >> 8) & 255) * (1 - 0.42 * k)) << 8) | ((c & 255) * (1 - 0.44 * k))) >>> 0;   // (shK: how strong the sun is where the shadow's maker stands: the shadow comes and goes with the sun patches, never all at once)
}
// ---- the golf cart: a small model of flat faces, drawn every frame through the game's own camera, so it sits on the ground it stands on whatever the
// view, leans with the slope, and turns smoothly. Each face takes one tone by how it meets the sun. A small depth buffer of its own sorts its faces, and
// lets the golfer sit inside it (parts nearer than him cover him).
const CF = [];
function cFace(n, pts, rp, sh, grp, emit) { CF.push({ v: Float32Array.from(pts), n, rp, sh, grp, emit }); }
function cBox(a0, a1, f0, f1, z0, z1, rp, sh = 0, grp = 0, emit = false) {   // (right, forward, up) in px; no underside
  cFace([0, 0, 1], [a0, f0, z1, a1, f0, z1, a1, f1, z1, a0, f1, z1], rp, sh, grp, emit);
  cFace([-1, 0, 0], [a0, f0, z0, a0, f1, z0, a0, f1, z1, a0, f0, z1], rp, sh, grp, emit); cFace([1, 0, 0], [a1, f0, z0, a1, f1, z0, a1, f1, z1, a1, f0, z1], rp, sh, grp, emit);
  cFace([0, -1, 0], [a0, f0, z0, a1, f0, z0, a1, f0, z1, a0, f0, z1], rp, sh, grp, emit); cFace([0, 1, 0], [a0, f1, z0, a1, f1, z0, a1, f1, z1, a0, f1, z1], rp, sh, grp, emit);
}
function cWheel(a, f, grp) {   // a tyre of ten flats, its outer wall, a white hub
  const r = 10, w = 3.6, zc = 10, N = 10, out = a < 0 ? -1 : 1;
  for (let k = 0; k < N; k++) {
    const t0 = k / N * 6.2832, t1 = (k + 1) / N * 6.2832, tm = (t0 + t1) / 2;
    cFace([0, Math.cos(tm), Math.sin(tm)], [a - w, f + r * Math.cos(t0), zc + r * Math.sin(t0), a + w, f + r * Math.cos(t0), zc + r * Math.sin(t0), a + w, f + r * Math.cos(t1), zc + r * Math.sin(t1), a - w, f + r * Math.cos(t1), zc + r * Math.sin(t1)], TYRER, -0.12, grp, false);
  }
  const cap = (aa, rr) => { const p = []; for (let k = 0; k < N; k++) { const t = k / N * 6.2832; p.push(aa, f + rr * Math.cos(t), zc + rr * Math.sin(t)); } return p; };
  cFace([out, 0, 0], cap(a + out * w, r), TYRER, 0.06, grp, false);
  cFace([out, 0, 0], cap(a + out * (w + 0.5), 4.8), CARTW, 0, grp, false);
}
cBox(-28, 28, -60, 58, 12, 18, CARTW);                              // the body: white below ...
cBox(-28.4, 28.4, -60.4, 58.4, 18, 22, CARTG);                      // ... a green band round it ...
cBox(-28, 28, -60, 58, 22, 29, CARTW);                              // ... white above
cBox(-25, 25, 58, 61.5, 13, 19, TYRER, 0.14);                       // the bumper
cBox(-26, 26, 36, 58, 29, 42, CARTW);                               // the cowl
cBox(-26, 26, 30, 36, 29, 49, CARTW, -0.12);                        // the dash
cBox(-26, 26, -22, 6, 29, 40, SEATR);                               // the seat
cBox(-26, 26, -29, -22, 29, 64, SEATR, -0.04);                      // its back
cBox(-26, 26, -60, -30, 29, 34, CARTW, -0.1);                       // the deck the bags stand on
cBox(-17, -5, -53, -40, 34, 80, BAGR); cBox(5, 17, -53, -40, 34, 76, POLOR);   // two golf bags
cBox(-15, -11, -50, -46, 80, 86, STEELR); cBox(-10, -7, -48, -44, 80, 84, STEELR); cBox(8, 12, -50, -46, 76, 82, STEELR); cBox(13, 16, -47, -43, 76, 80, STEELR);   // the club heads
for (const sa of [-1, 1]) { cBox(sa * 25 - 1.6, sa * 25 + 1.6, 31, 34, 42, 102, TYRER, 0.12); cBox(sa * 25 - 1.6, sa * 25 + 1.6, -34, -31, 34, 102, TYRER, 0.12); }   // the roof's posts
cBox(-31, 31, -44, 38, 102, 107, CARTG);                            // the roof
cBox(-31.5, 31.5, -44.5, 38.5, 102, 103.6, CARTW);                  // its white rim
cBox(-14, -10, 23, 31, 44, 56, TYRER, 0.1);                         // the steering column
cBox(-19, -5, 19, 23, 53, 59, TYRER, 0.06);                         // the steering wheel
for (const sa of [-1, 1]) cBox(sa * 18 - 3.5, sa * 18 + 3.5, 58, 59.4, 23, 28, LAMPR, 0, 0, true);   // the lamps
cWheel(-27.5, 40, 1); cWheel(27.5, 40, 2); cWheel(-27.5, -40, 0); cWheel(27.5, -40, 0);
const czB = new Float32Array(VW * VH), czS = new Uint32Array(VW * VH), PXs = new Float32Array(12), PYs = new Float32Array(12), PWs = new Float32Array(12);
let blitW = 0;   // when set, a sprite is hidden where the cart's own depth is nearer than this (1 / distance)
function drawCart(gS, G) {   // gS: the golfer's sitting sprite when he is in it; G: how much its lamps glow
  const dC = (cart.x - camX) * FX + (cart.y - camY) * FY; if (dC < 2.4 || dC > 130) return;
  const th = cart.th, hx = Math.cos(th), hy = Math.sin(th), rx = -hy, ry = hx, K = 1 / PPM;
  const gh = (a, f) => groundH(cart.x + (a * rx + f * hx) * K, cart.y + (a * ry + f * hy) * K);
  const hFL = gh(-27, 40), hFR = gh(27, 40), hRL = gh(-27, -40), hRR = gh(27, -40), zc = (hFL + hFR + hRL + hRR) / 4;   // the ground under its four wheels: its height and its lean
  cart.sf += (((hFL + hFR) - (hRL + hRR)) / 160 - cart.sf) * 0.3; cart.sr += (((hFR + hRR) - (hFL + hRL)) / 110 - cart.sr) * 0.3; cart.zc = Math.abs(zc - cart.zc) > 0.6 ? zc : cart.zc + (zc - cart.zc) * 0.5;
  const sf = cart.sf, sr = cart.sr, z0 = cart.zc, cs = Math.cos(cart.steer), sn = Math.sin(cart.steer), stamp = frame;
  const csn = TOD[tmode].glow < 1 ? sunAt(cart.x, cart.y, frame * 0.055) : 1;
  if (dC < 48 && csn > 0.03) { shK = csn;                                                    // its shadow: the roof's and the body's, laid on the ground away from the sun
    for (let f = -44; f <= 38; f += 4) for (let a = -31; a <= 31; a += 4) shadePoint(cart.x + (a * rx + f * hx) * K - 0.809 * 1.82, cart.y + (a * ry + f * hy) * K + 0.735 * 1.82);
    for (let f = -60; f <= 58; f += 4) for (let a = -28; a <= 28; a += 4) shadePoint(cart.x + (a * rx + f * hx) * K - 0.809 * 0.3, cart.y + (a * ry + f * hy) * K + 0.735 * 0.3);
    shK = 1;
  }
  for (const Fc of CF) {
    const v = Fc.v, n = v.length / 3, nz = Fc.n[2]; let na = Fc.n[0], nf = Fc.n[1], pa = 0, ok = true, cxw = 0, cyw = 0, czw = 0;
    if (Fc.grp) { pa = Fc.grp === 1 ? -27.5 : 27.5; const t = na * cs + nf * sn; nf = -na * sn + nf * cs; na = t; }   // a front wheel: turned about its own upright
    for (let i = 0; i < n; i++) {
      let a = v[i * 3], f = v[i * 3 + 1]; const z = v[i * 3 + 2];
      if (Fc.grp) { const da = a - pa, df = f - 40; a = pa + da * cs + df * sn; f = 40 - da * sn + df * cs; }
      const wx = cart.x + (a * rx + f * hx) * K, wy = cart.y + (a * ry + f * hy) * K, wz = z0 + f * sf + a * sr + z * K, ex = wx - camX, ey = wy - camY, d = ex * FX + ey * FY;
      if (d < 0.6) { ok = false; break; }
      const k = FOC / d; PXs[i] = VW / 2 + (ex * RX + ey * RY) * k; PYs[i] = HZ - (wz - camZ) * k; PWs[i] = 1 / d; cxw += wx; cyw += wy; czw += wz;
    }
    if (!ok) continue;
    const nwx = na * rx + nf * hx, nwy = na * ry + nf * hy;
    if (nwx * (cxw / n - camX) + nwy * (cyw / n - camY) + nz * (czw / n - camZ) >= 0) continue;   // turned away from the camera
    const c0 = tone(Fc.rp, 0.5 + 0.44 * (nwx * SUNX + nwy * SUNY + nz * SUNZ) + Fc.sh, Fc.emit), col = Fc.emit ? (c0 | 0xff000000) >>> 0 : lit(c0);
    const x1 = PXs[1] - PXs[0], y1 = PYs[1] - PYs[0], w1 = PWs[1] - PWs[0], x2 = PXs[2] - PXs[0], y2 = PYs[2] - PYs[0], w2 = PWs[2] - PWs[0], det = x1 * y2 - x2 * y1;   // the face's depth as a plane over the screen
    let A = 0, B = 0, C = PWs[0];
    if (det > 1e-4 || det < -1e-4) { A = (w1 * y2 - w2 * y1) / det; B = (x1 * w2 - x2 * w1) / det; C = PWs[0] - A * PXs[0] - B * PYs[0]; }
    let ya = 1e9, yb = -1e9; for (let i = 0; i < n; i++) { if (PYs[i] < ya) ya = PYs[i]; if (PYs[i] > yb) yb = PYs[i]; }
    let Y0 = Math.ceil(ya - 0.5), Y1 = Math.floor(yb - 0.5); if (Y1 < Y0) Y0 = Y1 = Math.round((ya + yb) / 2 - 0.5);
    if (Y0 < 0) Y0 = 0; if (Y1 >= VH) Y1 = VH - 1;
    for (let y = Y0; y <= Y1; y++) {
      const yc = y + 0.5; let xa = 1e9, xb = -1e9;
      for (let i = 0, j = n - 1; i < n; j = i++) { const p0 = PYs[i], p1 = PYs[j]; if ((p0 <= yc) === (p1 <= yc)) continue; const xx = PXs[i] + (yc - p0) / (p1 - p0) * (PXs[j] - PXs[i]); if (xx < xa) xa = xx; if (xx > xb) xb = xx; }
      if (xb < xa) { if (Y0 !== Y1) continue; for (let i = 0; i < n; i++) { if (PXs[i] < xa) xa = PXs[i]; if (PXs[i] > xb) xb = PXs[i]; } }
      let X0 = Math.ceil(xa - 0.5), X1 = Math.floor(xb - 0.5); if (X1 < X0) X0 = X1 = Math.round((xa + xb) / 2 - 0.5);
      if (X0 < 0) X0 = 0; if (X1 >= VW) X1 = VW - 1;
      for (let x = X0; x <= X1; x++) { const q = y * VW + x, w = A * (x + 0.5) + B * yc + C; if (czS[q] === stamp && czB[q] >= w) continue; if (zbuf[q] < 100 / w - 30) continue; czS[q] = stamp; czB[q] = w; fb[q] = col; if (wz[q] > 1) wz[q] = 1; }
    }
  }
  if (gS) {                                                          // the golfer at the wheel
    const a = -12, f = -12; project(cart.x + (a * rx + f * hx) * K, cart.y + (a * ry + f * hy) * K, z0 + f * sf + a * sr, PJ);
    if (PJ.s > 0) { blitW = 1 / PJ.d; blit(gS, PJ.x, PJ.y, PJ.s / golfK, PJ.d * 100 - 80, 0, 0, false, 0); blitW = 0; }
  }
  if (G > 0) for (const sa of [-1, 1]) { project(cart.x + (sa * 18 * rx + 60 * hx) * K, cart.y + (sa * 18 * ry + 60 * hy) * K, z0 + 0.45, PJ); if (PJ.s > 0) addLight(PJ.x, PJ.y, 1.6 * G, 1.3 * G, 0.7 * G); }
}
// ---- the sun breaking through the clouds (CapitalEmpire's sun patches, its src/game/sun-patches.ts; the owner: "you are not building the cloud you are
// building where the sun comes through the clouds", "we dont add any shadow"). A field over the land says how much sun reaches each place: 0 is the
// overcast (the picture as it always was), 1 full sun. Nothing dark is ever drawn. In the sun the picture's own pixels are made brighter: a slightly warm
// gain on the mid-tones and up (the dark gaps stay dark), and a faint warm light on what is already bright. The field is two reads of one noise at two
// scales and turns, drifting at different speeds along the wind, so the gaps of sun change shape as they go; a soft threshold gives them soft edges.
// The picture is gone over in 8 x 8 blocks: the sun is worked out at each block's corners from the ground seen there and spread between them.
const CLW = VW / 8 + 1, CLH = Math.ceil(VH / 8) + 1, cloudS = new Float32Array(CLW * CLH);
const SHR = 64, SHG = 56, SHB = 26;   // how much a cast shadow takes of red, green and blue in full sun (of 256)
// Heat over the desert: far off, near the horizon, the air wobbles as it does over hot ground: what is seen there is bent a little up and down in slow
// waves that travel across the picture and rise, and is softened (each pixel half itself, half its bent neighbour). Only land past 60 m and the foot of the
// sky move; nothing slides sideways in rows (that read as a bad television signal).
const heatBuf = new Uint32Array(VW * VH);
function heatHaze() {
  const y0 = Math.max(1, HZ - Math.round(9 * RS)), y1 = Math.min(VH - 2, HZ + Math.round(40 * RS)), t = frame * 0.06;   // (only at the horizon: land past 150 m and the foot of the sky)
  heatBuf.set(fb.subarray((y0 - 2) * VW > 0 ? (y0 - 2) * VW : 0, (y1 + 2) * VW), (y0 - 2) * VW > 0 ? (y0 - 2) * VW : 0);
  for (let y = y0; y < y1; y++) {
    const row = y * VW, ph = y * 0.21 - t * 1.6;
    for (let x = 0; x < VW; x++) {
      const q = row + x, z = zbuf[q]; if (z < 15000) continue;
      const w = Math.sin(x * 0.085 + ph) + 0.6 * Math.sin(x * 0.19 - ph * 1.3 + t), oy = w > 0.55 ? (z > 21000 && w > 1.15 ? 2 : 1) : w < -0.55 ? (z > 21000 && w < -1.15 ? -2 : -1) : 0; if (!oy) continue;
      const q2 = q + oy * VW; if (zbuf[q2] < 15000) continue;
      const a = heatBuf[q], b = heatBuf[q2]; fb[q] = ((((a ^ b) & 0xfefefefe) >>> 1) + (a & b) | 0xff000000) >>> 0;
    }
  }
}
function sunAt(x, y, t) {   // 0 (overcast) .. 1 (full sun) at a place on the land
  const ax = x - WDX * t, ay = y - WDY * t, bx = (x * 0.82 - y * 0.57) - WDX * t * 1.3 - WDY * t * 0.25, by = (x * 0.57 + y * 0.82) - WDY * t * 1.3 + WDX * t * 0.25;
  const n = 0.5 * tnoise(ax / 78 + 40, ay / 78 + 90) + 0.34 * tnoise(bx / 43 + 7, by / 43 + 3) + 0.16 * tnoise(ax / 17 + 11, ay / 17 + 5), e = (n - 0.41) / 0.11;   /* (about half the land in full sun, a quarter under the overcast, the rest between) */
  return e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
}
function cloudAt(x, y, t) { return sunAt(x, y, t); }
function cloudShadows() {
  if (TOD[tmode].glow >= 1) return;                                // (no sun at night)
  const t = frame * 0.055, str = tmode === 1 ? 0.8 : 1;
  for (let j = 0; j < CLH; j++) for (let i = 0; i < CLW; i++) {
    const X = i * 8 < VW ? i * 8 : VW - 1, Y = j * 8 < VH ? j * 8 : VH - 1, z = zbuf[Y * VW + X];
    if (z === 65535) { cloudS[j * CLW + i] = -1; continue; }
    const d = z * 0.01, lat = (X + 0.5 - VW / 2) * d / FOC;
    cloudS[j * CLW + i] = sunAt(camX + FX * d + RX * lat, camY + FY * d + RY * lat, t) * str;
  }
  for (let j = 0; j < CLH - 1; j++) for (let i = 0; i < CLW - 1; i++) {
    const k = j * CLW + i; let a = cloudS[k], b = cloudS[k + 1], c = cloudS[k + CLW], e = cloudS[k + CLW + 1];
    const hi = Math.max(a, b, c, e); if (hi <= 0.01) continue;         // wholly overcast (or sky): nothing to do
    if (a < 0) a = hi; if (b < 0) b = hi; if (c < 0) c = hi; if (e < 0) e = hi;
    const X0 = i * 8, Y0 = j * 8, Y1 = Math.min(VH, Y0 + 8);
    for (let Y = Y0; Y < Y1; Y++) {
      const fy = (Y - Y0) * 0.125, l = a + (c - a) * fy, r = b + (e - b) * fy, row = Y * VW + X0;
      for (let x = 0; x < 8; x++) {
        const q = row + x; if (zbuf[q] === 65535) continue;
        const sn = l + (r - l) * x * 0.125; if (sn <= 0.01) continue;
        const p = fb[q]; let R = p & 255, G = (p >> 8) & 255, B = (p >> 16) & 255; const lum = (R * 77 + G * 151 + B * 28) >> 8;
        if (lum < 10) continue;                                        // the dark gaps stay dark
        const al = p >>> 24; let kS = 0, sl = sn; if (al !== 255) { const f = (255 - al) * 0.25; kS = sn * f; sl = sn - kS; }   // ground under a cast shadow: the sun does not reach it
        const li = (sl * (lum > 46 ? 82 : (lum - 10) * 2.28)) | 0;     // the lift: up to about a third more light on the mid-tones and up, slightly warm
        R += (R * li * 272) >> 16; G += (G * li) >> 8; B += (B * li * 215) >> 16;
        if (lum > 82) { const hs = (sl * (lum > 158 ? 26 : (lum - 82) * 0.34)) | 0; R += ((255 - R) * hs) >> 8; G += ((236 - G) * hs) >> 8; B += ((176 - B) * hs) >> 8; }   // a faint warm light on what is already bright
        if (kS > 0) { const k8 = (kS * 256) | 0; R -= (R * k8 * SHR) >> 16; G -= (G * k8 * SHG) >> 16; B -= (B * k8 * SHB) >> 16; }   // and the shadow shows: darker and cooler, only here in the sun
        fb[q] = (0xff000000 | ((B > 255 ? 255 : B < 0 ? 0 : B) << 16) | ((G > 255 ? 255 : G) << 8) | (R > 255 ? 255 : R)) >>> 0;
      }
    }
  }
}
const PJ = { x: 0, y: 0, d: 0, s: 0 };
function project(x, y, z, o) {   // a point of the world (metres) -> the screen; o.d = its distance, o.s = its scale
  const rx = x - camX, ry = y - camY, d = rx * FX + ry * FY; o.d = d;
  if (d < 1) { o.x = -99999; o.y = -99999; o.s = 0; return; }
  const k = FOC / d; o.x = Math.round(VW / 2 + (rx * RX + ry * RY) * k); o.y = Math.round(HZ - (z - camZ) * k); o.s = DS / d;
}
function shadePoint(gx, gy) {   // darken the ground at a world point, if that ground is what the screen shows there
  project(gx, gy, groundH(gx, gy), PJ);
  if (PJ.x < 0 || PJ.x >= VW || PJ.y < 0 || PJ.y >= VH) return;
  const q = PJ.y * VW + PJ.x; if (Math.abs(zbuf[q] - PJ.d * 100) <= 30) darken(q);
}
// the live shadow of a standing sprite: each of its pixels falls to the ground, away from the sun, by its height
let golfK = GK;
function castSprite(S, x0, y0, sk = 1) {   // sk: the sculpture's own scale (the golfer is sculpted at the picture's scale)
  const sn = TOD[tmode].glow < 1 ? sunAt(x0, y0, frame * 0.055) : 1; if (sn < 0.03) return;   // a thing's shadow is as strong as the sun on it: it fades in and out as the sun patches pass
  shK = sn;
  for (let y = 0; y < S.h; y++) {
    const a = S.x0[y], b = S.x1[y]; if (b < a) continue;
    const dz = (S.ay - y) / (PPM * sk); if (dz < 0) continue;
    for (let x = a; x <= b; x++) if (S.px[y * S.w + x]) { const dx = (x - S.ax) / (PPM * sk); shadePoint(x0 + RX * dx - 0.809 * dz, y0 + RY * dx + 0.735 * dz); }
  }
  shK = 1;
}
// ---- the putting grid: when the ball lies on the green, a light grid is laid over the green's surface, a line every metre, and on every line that
// slopes a dot runs downhill, faster the steeper it is: where the dots run, and how fast, is how a putt will turn. The grid belongs to the land (whole
// metres of the world), is made once for a green, and is drawn on the ground only (the golfer and the flag stand in front of it).
let pgKey = '', pgN = null, pgS = null;
function puttGrid() {
  const key = SEED + ':' + holeN + ':' + Math.round(hole.pin.x * 10) + ':' + Math.round(hole.pin.y * 10);
  if (key === pgKey) return; pgKey = key;
  const R = 17, x0 = Math.round(hole.pin.x) - R, y0 = Math.round(hole.pin.y) - R, W = 2 * R + 1, N = new Float32Array(W * W * 5), o = { x: 0, y: 0 }, segs = [];
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i, y = y0 + j, k = (j * W + i) * 5;
    if (matAt(x, y) !== M_GREEN) { N[k + 2] = -1e9; continue; }
    slopeAt(x, y, o); N[k] = x; N[k + 1] = y; N[k + 2] = groundH(x, y) + 0.03; N[k + 3] = o.x; N[k + 4] = o.y;
  }
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 5; if (N[k + 2] < -1e8) continue;
    if (i + 1 < W && N[k + 7] > -1e8) segs.push(k, k + 5, 0);
    if (j + 1 < W && N[k + W * 5 + 2] > -1e8) segs.push(k, k + W * 5, 1);
  }
  pgN = N; pgS = Int32Array.from(segs);
}
function gridPix(x, y, d, r, g, b, a) {   // a pixel of the grid on the full-size layer, on the ground only (a: how solid it is, of 255)
  const gx = (x * RS) | 0, gy = (y * RS) | 0; if (gx < 0 || gy < 0 || gx >= VW || gy >= VH) return;
  const dz = zbuf[gy * VW + gx] - d * 100; if (dz > 70 || dz < -70) return;
  overPut(x, y, ((a << 24) | (b << 16) | (g << 8) | r) >>> 0);
}
function drawPuttGrid() {
  if (HP && HP.turn) { if (HP.turn.green && !bcam && ball.state === 0 && !HP.play) hostPuttGrid(); return; }   // (host mode: the host's green only, T423)
  if (bcam || doneT || ball.state === 1 || ball.state === 3 || matAt(ball.x, ball.y) !== M_GREEN) return;
  puttGrid(); const N = pgN, S = pgS;
  for (let s = 0; s < S.length; s += 3) {
    const a = S[s], b = S[s + 1];
    projectO(N[a], N[a + 1], N[a + 2], PJ); const ax = PJ.x, ay = PJ.y, ad = PJ.d; if (ad < 1.5) continue;
    projectO(N[b], N[b + 1], N[b + 2], PJ); const bx = PJ.x, by = PJ.y, bd = PJ.d; if (bd < 1.5) continue;
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); if (n > 700 || (ax < 0 && bx < 0) || (ax >= VW && bx >= VW) || (ay >= VH && by >= VH)) continue;
    for (let k = 0; k <= n; k++) { const f = n ? k / n : 0; gridPix(Math.round(ax + (bx - ax) * f), Math.round(ay + (by - ay) * f), ad + (bd - ad) * f, 214, 255, 204, 96); }
    const g = S[s + 2] ? (N[a + 4] + N[b + 4]) * 0.5 : (N[a + 3] + N[b + 3]) * 0.5;   // the rise along this line, per metre: the dot runs down it
    if (g > 0.005 || g < -0.005) {
      let f = (a * 0.6180339) % 1 - frame * g * 0.4; f -= Math.floor(f);
      const x = Math.round(ax + (bx - ax) * f), y = Math.round(ay + (by - ay) * f), d = ad + (bd - ad) * f, big = d < 34 ? 1 : 0;
      gridPix(x, y, d, 244, 255, 236, 215); if (big) { gridPix(x + 1, y, d, 244, 255, 236, 215); gridPix(x, y - 1, d, 244, 255, 236, 150); gridPix(x + 1, y - 1, d, 244, 255, 236, 150); }
    }
  }
}
function plotZ(sx, sy, d, c) { if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) return; const q = sy * VW + sx; if (zbuf[q] >= d * 100 - 40) fb[q] = c; }

// glow: Cinderdeep's light grid (one sample per 8 x 8 px, a margin all round), swept forward and back, then blurred
const LS = 8, LM = 12, GW = VW / LS + 2 * LM, GH = Math.ceil(VH / LS) + 2 * LM, LFALL = 0.9;
const lr = new Float32Array(GW * GH), lg = new Float32Array(GW * GH), lb = new Float32Array(GW * GH), lt = new Float32Array(GW * GH);
let lights = 0;
function addLight(sx, sy, r, g, b) {
  const gx = Math.floor(sx / LS) + LM, gy = Math.floor(sy / LS) + LM;
  if (gx < 1 || gy < 1 || gx >= GW - 1 || gy >= GH - 1) return;
  const k = gy * GW + gx; lr[k] += r; lg[k] += g; lb[k] += b; lights++;
}
function sweep(d) {   // each sample takes the brightest of the 4 neighbours behind it, dimmed; up and down the screen dims faster (the ground is seen at a slant)
  const ya = d > 0 ? 1 : GH - 2, yb = d > 0 ? GH - 1 : 0, xa = d > 0 ? 1 : GW - 2, xb = d > 0 ? GW - 1 : 0, t = LFALL, tn = LFALL * 0.8, td = tn * 0.95;
  for (let y = ya; y !== yb; y += d) for (let x = xa; x !== xb; x += d) {
    const k = y * GW + x, w = k - d, n = k - d * GW, nw = n - d, ne = n + d;
    let r = lr[k], g = lg[k], b = lb[k], c;
    c = lr[w] * t; if (c > r) r = c; c = lg[w] * t; if (c > g) g = c; c = lb[w] * t; if (c > b) b = c;
    c = lr[n] * tn; if (c > r) r = c; c = lg[n] * tn; if (c > g) g = c; c = lb[n] * tn; if (c > b) b = c;
    c = lr[nw] * td; if (c > r) r = c; c = lg[nw] * td; if (c > g) g = c; c = lb[nw] * td; if (c > b) b = c;
    c = lr[ne] * td; if (c > r) r = c; c = lg[ne] * td; if (c > g) g = c; c = lb[ne] * td; if (c > b) b = c;
    lr[k] = r; lg[k] = g; lb[k] = b;
  }
}
function spreadLight() {
  sweep(1); sweep(-1);
  for (const a of [lr, lg, lb]) {
    for (let y = 0; y < GH; y++) { const row = y * GW; lt[row] = a[row]; lt[row + GW - 1] = a[row + GW - 1]; for (let x = 1; x < GW - 1; x++) lt[row + x] = (a[row + x - 1] + 2 * a[row + x] + a[row + x + 1]) * 0.25; }
    for (let y = 1; y < GH - 1; y++) for (let x = 0; x < GW; x++) a[y * GW + x] = (lt[(y - 1) * GW + x] + 2 * lt[y * GW + x] + lt[(y + 1) * GW + x]) * 0.25;
  }
}
function applyGlow() {   // each lit 8 x 8 block: the picture there is brightened in the light's colour, and a little of the light itself is added
  const G = TOD[tmode].glow, K = 2.6 * G, A = 20 * G;
  for (let gy = LM; gy < GH - LM; gy++) for (let gx = LM; gx < GW - LM; gx++) {
    const k = gy * GW + gx, k1 = k + 1, k2 = k + GW, k3 = k2 + 1;
    if (lr[k] + lg[k] + lb[k] + lr[k3] + lg[k3] + lb[k3] + lr[k1] + lb[k1] + lr[k2] + lb[k2] < 0.03) continue;
    const X0 = (gx - LM) * LS, Y0 = (gy - LM) * LS;
    for (let y = 0; y < LS; y++) {
      const Y = Y0 + y; if (Y >= VH) break;
      const fy = (y + 0.5) / LS;
      for (let x = 0; x < LS; x++) {
        const fx = (x + 0.5) / LS, w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
        const Lr = lr[k] * w0 + lr[k1] * w1 + lr[k2] * w2 + lr[k3] * w3, Lg = lg[k] * w0 + lg[k1] * w1 + lg[k2] * w2 + lg[k3] * w3, Lb = lb[k] * w0 + lb[k1] * w1 + lb[k2] * w2 + lb[k3] * w3;
        const q = Y * VW + X0 + x; if (zbuf[q] === 65535) continue;   // the sky takes no lantern light
        const c = fb[q];
        const r = (c & 255) * (1 + K * Lr) + A * Lr, g = ((c >> 8) & 255) * (1 + K * Lg) + A * Lg, b = ((c >> 16) & 255) * (1 + K * Lb) + A * Lb;
        fb[q] = (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
      }
    }
  }
}

const SPARK_COL = [[[255, 238, 170], [255, 158, 48], [196, 68, 22]], [[210, 255, 255], [118, 226, 255], [58, 138, 218]], [[255, 244, 190], [248, 200, 80], [190, 120, 30]], [[200, 255, 160], [110, 215, 70], [56, 140, 40]]];
const LEAFC = [[112, 168, 76], [232, 143, 60], [240, 180, 196]], TURFC = [[68, 149, 76], [50, 114, 61], [102, 73, 55], [85, 166, 80], [122, 89, 62], [64, 131, 63]];
function dot(sx, sy, d, c, big) { plotZ(sx, sy, d, c); if (big) { plotZ(sx + 1, sy, d, c); plotZ(sx, sy + 1, d, c); plotZ(sx + 1, sy + 1, d, c); } }
function drawParticles() {
  for (let n = 0; n < pn; n++) {
    project(PX[n], PY[n], PZ[n], PJ); if (PJ.s === 0 || PJ.x < 0 || PJ.x >= VW) continue;
    const kind = PK[n], l = PL[n], sx = PJ.x, sy = PJ.y, d = PJ.d, m = PM[n], big = PJ.s > 1.3, ls = PJ.s > 1 ? 1 : PJ.s;
    if (kind === P_SPARK) { const c = SPARK_COL[m & 3][l > 18 ? 0 : l > 9 ? 1 : 2]; dot(sx, sy, d, rgb(c[0], c[1], c[2]), big); plotZ(sx + 1, sy, d, rgb(c[0], c[1], c[2])); addLight(sx, sy, 0.5 * ls, 0.3 * ls, 0.1 * ls); }
    else if (kind === P_EMBER) { const f = l > 12 ? 1 : l / 12, c = SPARK_COL[m & 3][1]; dot(sx, sy, d, rgb((c[0] * f) | 0, (c[1] * f) | 0, (c[2] * f) | 0), big); addLight(sx, sy, c[0] / 600 * f * ls, c[1] / 600 * f * ls, c[2] / 600 * f * ls); }
    else if (kind === P_DROP) { dot(sx, sy, d, rgb(190, 225, 255), big); plotZ(sx, sy + 1, d, rgb(120, 180, 240)); }
    else if (kind === P_SPORE) { const g = GLOW_LIGHT[m % 3], f = (l > 30 ? 1 : l / 30) * (0.35 + 0.65 * TOD[tmode].glow); dot(sx, sy, d, rgb((120 + 135 * g[0]) * f, (120 + 135 * g[1]) * f, (120 + 135 * g[2]) * f), big); addLight(sx, sy, g[0] * 0.12 * ls, g[1] * 0.12 * ls, g[2] * 0.12 * ls); }
    else if (kind === P_GLINT) { if (l > 3) { const g = CRY_LIGHT[m % 3], c = rgb(200 + 55 * g[0], 200 + 55 * g[1], 200 + 55 * g[2]); plotZ(sx, sy, d, c); if (l > 7) { plotZ(sx - 1, sy, d, c); plotZ(sx + 1, sy, d, c); plotZ(sx, sy - 1, d, c); plotZ(sx, sy + 1, d, c); } } }
    else if (kind === P_LEAF) { const c = LEAFC[m % 3], k = (l >> 3) & 1; dot(sx, sy, d, lit(((178 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0), big); plotZ(sx + 1, sy + k, d, lit(((130 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0)); }
    else if (kind === P_SAND) dot(sx, sy, d, lit(((170 << 24) | G_SAND[2 + (m % 4)]) >>> 0), big);
    else if (kind === P_TURF) { const c = TURFC[m % 6], p = lit(((160 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0); dot(sx, sy, d, p, big); if (m & 1) plotZ(sx + 1, sy, d, p); }
    else if (kind === P_MOTE && tmode < 2) { if (sy >= 0 && sy < VH) { const q = sy * VW + sx, c = fb[q], f = l > 200 ? (250 - l) / 50 : l < 40 ? l / 40 : 1, a = (tmode === 1 ? 70 : 34) * f; if (zbuf[q] >= d * 100) fb[q] = rgb(Math.min(255, (c & 255) + a), Math.min(255, ((c >> 8) & 255) + a * 0.9), Math.min(255, ((c >> 16) & 255) + a * 0.6)); } }
  }
}
function drawCreatures() {
  const G = TOD[tmode].glow;
  for (let k = 0; k < MAXC; k++) {
    project(CX[k], CY[k], groundH(CX[k], CY[k]) + CZ[k], PJ);
    const sx = PJ.x, sy = PJ.y, d = PJ.d; if (PJ.s === 0 || sx < 2 || sy < 2 || sx >= VW - 2 || sy >= VH - 2) continue;
    if (tmode === 2 || (tmode === 1 && (k & 1))) {            // a firefly: it blinks, and lights the ground
      if (Math.sin(frame * 0.07 + CS[k]) <= -0.2) continue;
      plotZ(sx, sy, d, rgb(226, 255, 130)); plotZ(sx + 1, sy, d, rgb(170, 230, 90)); addLight(sx, sy + 20 * PJ.s, 0.3 * G, 0.36 * G, 0.1 * G);
    } else {                                                  // a butterfly: two wings that open and close
      const pr = PETAL[CS[k] % 5], open = ((frame >> 2) + CS[k]) & 1, c = lit(((185 << 24) | pr[2]) >>> 0), dd = lit(((150 << 24) | pr[1]) >>> 0);
      plotZ(sx, sy, d, rgb(40, 30, 40));
      if (open) { plotZ(sx - 1, sy - 1, d, c); plotZ(sx + 1, sy - 1, d, c); plotZ(sx - 2, sy - 1, d, dd); plotZ(sx + 2, sy - 1, d, dd); plotZ(sx - 1, sy, d, dd); plotZ(sx + 1, sy, d, dd); }
      else { plotZ(sx, sy - 1, d, c); plotZ(sx, sy - 2, d, dd); }
    }
  }
}
const AIM_G = rgb(255, 214, 110), AIM_W = rgb(255, 252, 238), AIM_D = rgb(34, 26, 40), AIM_R = rgb(255, 120, 70);
function aimDot(x, y, r, c) {   // a round dot with a dark edge, over everything
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    const e = dx * dx + dy * dy, X = x + dx, Y = y + dy; if (e > (r + 1) * (r + 1) + 1 || X < 0 || Y < 0 || X >= VW || Y >= VH) continue;
    fb[Y * VW + X] = e <= r * r ? (dx + dy < 0 ? AIM_W : c) : AIM_D;
  }
}
// ---- the full-size layer: marks that guide the eye (the aim's dots, its rings) are drawn on a second canvas at the full 960 x 540, over the game's picture,
// whatever scale the picture itself is drawn at: they stay fine and sharp while the world is drawn in bigger pixels. Depth is still asked of the game's
// picture, so a mark that lies on the ground hides behind what stands in front of it. Only the part of the layer that changed is cleared and sent.
const OW = 960, OH = 540, over = typeof document !== 'undefined' ? document.getElementById('over') : null;
let octx = null, oimg = null, ob = null, ox0 = OW, oy0 = OH, ox1 = -1, oy1 = -1, px0 = OW, py0 = OH, px1 = -1, py1 = -1;
if (over && over.getContext) { over.width = OW; over.height = OH; octx = over.getContext('2d'); if (octx && octx.createImageData) { oimg = octx.createImageData(OW, OH); if (oimg && oimg.data && oimg.data.buffer) ob = new Uint32Array(oimg.data.buffer); } }
if (!ob || ob.length !== OW * OH) { ob = new Uint32Array(OW * OH); oimg = null; }
function overBegin() { if (px1 >= px0) for (let y = py0; y <= py1; y++) ob.fill(0, y * OW + px0, y * OW + px1 + 1); ox0 = OW; oy0 = OH; ox1 = -1; oy1 = -1; }   // what was drawn last frame is wiped
function overPut(x, y, c) { if (x < 0 || y < 0 || x >= OW || y >= OH) return; ob[y * OW + x] = c; if (x < ox0) ox0 = x; if (x > ox1) ox1 = x; if (y < oy0) oy0 = y; if (y > oy1) oy1 = y; }
function overEnd() {   // the rows and columns touched this frame or last are sent to the canvas
  const a0 = Math.min(ox0, px0), b0 = Math.min(oy0, py0), a1 = Math.max(ox1, px1), b1 = Math.max(oy1, py1);
  if (a1 >= a0 && octx && oimg && octx.putImageData) octx.putImageData(oimg, 0, 0, a0, b0, a1 - a0 + 1, b1 - b0 + 1);
  px0 = ox0; py0 = oy0; px1 = ox1; py1 = oy1;
}
function projectO(x, y, z, o) {   // a point of the world -> the full-size layer; o.s = its scale there
  const rx = x - camX, ry = y - camY, d = rx * FX + ry * FY; o.d = d;
  if (d < 1) { o.x = -99999; o.y = -99999; o.s = 0; return; }
  const k = FOC / d; o.x = Math.round((VW / 2 + (rx * RX + ry * RY) * k) * IRS); o.y = Math.round((HZ - (z - camZ) * k) * IRS); o.s = D0 / d;
}
function aimDotO(x, y, r, c) {   // a round dot with a dark edge, over everything
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) { const e = dx * dx + dy * dy; if (e > (r + 1) * (r + 1) + 1) continue; overPut(x + dx, y + dy, e <= r * r ? (dx + dy < 0 ? AIM_W : c) : AIM_D); }
}
function plotZO(sx, sy, d, c) {   // a mark on the ground: hidden where the game's picture has something nearer
  const gx = (sx * RS) | 0, gy = (sy * RS) | 0; if (gx < 0 || gy < 0 || gx >= VW || gy >= VH) return;
  if (zbuf[gy * VW + gx] >= d * 100 - 40) overPut(sx, sy, c);
}
function aimH(x, y) {   // T438: the ground's height for the aim's marks: never made here (a far tile took ~2 ms, thirty of them a slow frame); a tile not made yet is
  const u = x * PPM, v = y * PPV, tx = Math.floor(u / TPX), ty = Math.floor(v / TPX);   // asked of the workers and the ball's height stands in until it comes
  if (tileHave(tx, ty)) return hUV(u, v);
  tileWant(tx, ty); return groundH(ball.x, ball.y);
}
function drawAim() {   // the shot's shape: a dotted arc that marches toward the target, its faint shadow on the ground, and a double ring where the ball will land
  overBegin();
  drawPuttGrid();   // (the putting grid lies on the full-size layer too, drawn after everything so it hides behind what stands on the green)
  if (!nearBall() || player.swing >= 0) { overEnd(); return; }
  if (HP) { if (!hostBusy()) hostAim(); overEnd(); return; }        // (host mode: the host's numbers for the club in hand, T420)
  const c = CLUBS[club], m = matAt(ball.x, ball.y), pw = charging ? power : 0.7, sp = c.v * clubK() * (0.22 + 0.78 * pw) * (club === 2 && m === M_SAND ? 0.85 : club === 3 ? 1 : LIEPOW[m]);
  let x = ball.x, y = ball.y, z = aimH(x, y) + 0.02, vx = aim.dx * sp * Math.cos(c.loft), vy = aim.dy * sp * Math.cos(c.loft), vz = sp * Math.sin(c.loft);
  const hot = charging ? AIM_R : AIM_G, ph = (frame >> 1) % 6;
  if (c.loft === 0) {                                                  // a putt: a line of dots along the green, an arrowhead at its end
    const len = Math.min(18 * clubK() * clubK(), sp * sp / 3.4);
    for (let k = 0, d = 0.4 + ph * 0.07; d < len; d += 0.42, k++) { const qx = ball.x + aim.dx * d, qy = ball.y + aim.dy * d; projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 0.8 ? 1 : 0, k & 1 ? hot : AIM_W); }
    const ex = ball.x + aim.dx * len, ey = ball.y + aim.dy * len; projectO(ex, ey, aimH(ex, ey) + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, 2, hot);
    overEnd(); return;
  }
  for (let k = 0; k < 500; k++) {
    vz -= 9.81 / 60; vx *= 0.9986; vy *= 0.9986; x += vx / 60; y += vy / 60; z += vz / 60;
    const gz = aimH(x, y);
    if (k % 6 === ph) {
      projectO(x, y, gz + 0.03, PJ); if (PJ.s > 0) plotZO(PJ.x, PJ.y, PJ.d, AIM_D);                 // the arc's shadow on the ground
      projectO(x, y, z, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 1.1 ? 2 : PJ.s > 0.35 ? 1 : 0, (k / 6 | 0) & 1 ? hot : AIM_W);
    }
    if (z <= gz) {                                                     // where it lands: two rings (the outer one breathes), a dot in the middle
      const rr = 1.3 + 0.2 * Math.sin(frame * 0.12);
      for (let a = 0; a < 40; a++) {
        const ca = Math.cos(a * 0.157), sa = Math.sin(a * 0.157);
        let qx = x + ca * rr, qy = y + sa * rr; projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZO(PJ.x, PJ.y + 1, PJ.d - 0.3, AIM_D); plotZO(PJ.x, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); plotZO(PJ.x + 1, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); }
        if (a & 1) { qx = x + ca * 0.55; qy = y + sa * 0.55; projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZO(PJ.x, PJ.y, PJ.d - 0.3, AIM_W); plotZO(PJ.x + 1, PJ.y, PJ.d - 0.3, AIM_W); } }
      }
      projectO(x, y, gz + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 0.5 ? 2 : 1, hot);
      break;
    }
  }
  overEnd();
}

// far trees, bushes and rocks borrow a sculpture from a small library until their own is made (one new sculpture a frame at most)
// the wind (Grove's): every 12 seconds a gust crosses the land; it reaches a place 1 to 5 seconds into the cycle by where the place lies, and for 16 steps
// the leaves there run twice through their eight poses; then calm. Returns 0 in calm, 8 + the pose while the gust is passing.
const WIND = 0.6;
function gustAt(x, y) {
  const p = (frame / 60) % 12, tr = ((((y * 0.35 - x * 0.65) / 180) % 1) + 1) % 1, fs = 0.12 / (0.7 + 0.6 * WIND), loc = p - (1 + 4 * tr);
  return loc >= 0 && loc < 16 * fs ? 8 + (Math.floor(loc / fs) & 7) : 0;
}
function drawWindTree(S, sx, sy, s, zr, ghost, hz, g) {      // the wood, then each moving cluster at its own pose, then the core
  const Wd = S.wind, fr = g & 7;
  blit(Wd.wood, sx, sy, s, zr, 0, 0, ghost, hz);
  for (const q of Wd.parts) { const pose = (fr + q.ph) & 7, sv = SWAY_S[pose]; blit(q.v[sv < 0 ? 0 : sv > 0 ? 2 : 1], sx + Math.round((q.x + sv * 1.5) * s), sy + Math.round((q.y + SWAY_L[pose] * 1.5) * s), s, zr, 0, 0, ghost, hz); }
  if (Wd.core) blit(Wd.core, sx + Math.round(Wd.cx * s), sy + Math.round(Wd.cy * s), s, zr, 0, 0, ghost, hz);
}
const lib = new Map();
let smallMade = 0, libF = -1, libWarm = 0, stillF = 0, stX = 0, stY = 0, stYaw = 0;   // (stillF: frames since the camera last moved)   // the frame the last stand-in was made in; how many of the 36 tree stand-ins have been looked at
let madeThisFrame = 0;
function libOf(kind, form, hue, vr) {   // form: 0 conifer, 1 broadleaf, 2 airy; hue: 0..5 along the leaf colours
  const key = kind * 1000 + form * 100 + hue * 10 + vr;
  let L = lib.get(key);
  if (!L) {
    if (libF === frame && spriteMax < 99) { for (let h = 0; h < 12; h++) { const A = lib.get(kind * 1000 + form * 100 + (h >> 1) * 10 + (h & 1)); if (A) return A; } }   // one a frame: another of its kind stands in until its turn
    libF = frame;
    const c = [[0.12, 0.45, 0.82][form], 0.5, hue / 6 + 0.08, 0.6], q = { k: kind, seed: key * 7919 + 5, c, H: kind === K_TREE ? 235 : kind === K_BUSH ? 40 : 20, rx: 0, spr: null, flat: true };
    q.rx = kind === K_TREE ? Math.round(q.H * (form === 0 ? 0.2 : 0.36)) : kind === K_BUSH ? 24 : 20;
    if (kind === K_TREE && t2(c[0])) { q.H = Math.round(q.H * BT2H); q.rx = Math.round(q.H * 0.36 * BT2RX); } else if (kind === K_TREE && t3(c[0])) { q.H = Math.round(q.H * BT3H); q.rx = Math.round(q.H * 0.36 * BT3RX); }
    L = { S: objSprite(q), H: q.H, rx: q.rx }; lib.set(key, L);
  }
  return L;
}
function libFor(o) {   // the library sculpture that stands in for a thing, and (o.libS) the scale that makes it the thing's size
  const L = libOf(o.k, o.k === K_TREE ? (o.c[0] < CONT ? 0 : o.c[0] < 0.66 ? 1 : 2) : 1, Math.floor(o.c[2] * 5.99), (o.seed >>> 3) & 1);
  o.libS = (o.k === K_ROCK ? o.rx / L.rx : o.H / L.H);
  return L.S;
}
function spriteFor(o, d) {
  if (o.spr) return o.spr;
  const heavy = o.k === K_TREE || o.k === K_BUSH || o.k === K_ROCK;
  if (!heavy) { if (smallMade >= 10 && spriteMax < 99) return null; smallMade++; return objSprite(o); }   // small things: ten new ones a frame at most (the rest wait a frame: never a stall when the camera lands among them)
  if (d < 55 && madeThisFrame < spriteMax && !(bcam && ball.state === 1) && (spriteMax > 1 || (stillF > 10 ? frame % 3 === 0 : frame % 15 === 0 && d < 26))) {   /* while the camera moves: only the nearest, and seldom (each new sculpture costs a slow frame) */ madeThisFrame++; o.born = o.born === -1 ? frame : 0; return objSprite(o); }   // (born: it was on show as a stand-in, so its own sculpture dissolves in)
  o.born = -1;
  return libFor(o);
}
function farHaze(d0) { const d = d0 * HZK, h = d < 50 ? 0 : d < 200 ? (d - 50) / 300 : 0.5 + (d - 200) * 0.007; return BSAND ? (h * 2 > 0.92 ? 0.92 : h * 2) : h; }   // (over the desert the air is twice as thick with dust and heat)   // the air thickens fast toward the edge of sight: what comes into view there comes out of the haze
let spriteMax = 1;

const PERF = { n: 0, ground: 0, things: 0, post: 0, make: 0, msgs: 0, msgMs: 0 };   // where the frames' time goes (ms, summed; read and reset by whoever measures): the land sweep, the things standing on it, the passes after, making new land, the worker's deliveries
function speck(o, X, sy, d) {   // a small plant seen from far: a stem a pixel wide in its colour, a petal on a flower; it thins out toward 90 m
  if (X < 0 || X >= VW || d > 89) return;
  if (!o.spk) {
    if (o.k === K_FLOWER) { o.spk = tone(BLADE, 0.45); o.spk2 = tone(PETAL[Math.min(4, (o.c[0] * 5) | 0)], 0.7); }
    else { o.spk = tone(o.k === K_REED ? REEDR : mixRamp(BLADE, STRAW, clamp(o.c[2] * 1.2 - 0.1, 0, 1)), 0.5); o.spk2 = tone(o.k === K_REED ? REEDR : mixRamp(BLADE, STRAW, clamp(o.c[2] * 1.2 - 0.1, 0, 1)), 0.8); }
  }
  const h = Math.max(1, Math.min(o.k === K_FLOWER ? 3 : 2, Math.round(o.H * DS / d * 0.5 * (d > 76 ? (90 - d) / 14 : 1)))), zc = d * 100 - 40, hz = d > 50 ? farHaze(d) : 0, HAZ = TOD[tmode].haze, wide = d < 62 && X + 1 < VW;
  let c1 = lit(o.spk), c2 = lit(o.spk2); if (hz > 0) { c1 = hazed(c1, hz, HAZ); c2 = hazed(c2, hz, HAZ); }
  for (let y = 0; y < h; y++) { const Y = sy - 1 - y; if (Y < 0 || Y >= VH) continue; const q = Y * VW + X, c = y === h - 1 ? c2 : c1; if (zbuf[q] >= zc) { fb[q] = c; if (wide && (y === h - 1 || o.k !== K_FLOWER)) fb[q + 1] = c; } }
}
const dlist = [], flist = [];
function farHas(x, y) { const F = ftiles.get((Math.floor(x / FTS) + 32768) * 65536 + (Math.floor(y / FTS) + 32768)); return F !== undefined && F.ready; }
function render() {
  frame++; madeThisFrame = 0; smallMade = 0; genUsed = 0;
  if (Math.abs(camX - stX) + Math.abs(camY - stY) > 0.02 || Math.abs(camYaw - stYaw) > 0.002) stillF = 0; else stillF++; stX = camX; stY = camY; stYaw = camYaw;
  // the camera: behind the golfer (wherever "behind" has been turned to), raised over any ground that would hide him
  const p = player, gh = groundH(p.x, p.y);
  aimCam();
  const fz = bcam ? ball.z - 0.9 : gh, up = bcam ? 1.7 : HC * camHk * camD / D0;   // (the ball camera looks at the ball, from a little above it)
  let cz = fz + up;
  for (let k = 1; k < 8; k++) { const f = k / 8, g = groundH(camX + FX * camD * f, camY + FY * camD * f) + 0.5; const need = (g - (fz + 0.9) * f) / (1 - f); if (need > cz) cz = need; }
  const flat = fz + Math.max(1.2, up); if (cz > flat + 1.5) cz = flat + 1.5; if (cz < flat) cz = flat;
  // The camera's height glides: the land under it is part of what it aims for (rising sooner than it sinks), never a floor it is pushed up by step by step.
  // (Pushed up by every bump it passed over, the whole picture, the ball in the air with it, shook up and down.)
  { const clr = Math.max(groundH(camX, camY), groundH(camX + FX * 1.2, camY + FY * 1.2), groundH(camX + RX * 0.8, camY + RY * 0.8), groundH(camX - RX * 0.8, camY - RY * 0.8), groundH(camX - FX * 1.5, camY - FY * 1.5), wlAt(camX, camY)) + 1.25;
    if (cz < clr + 0.4) cz = clr + 0.4;
    const dz = cz - camZ; camZ += dz * (Math.abs(dz) > 6 ? 1 : dz > 0 ? (bcam ? 0.3 : 0.16) : (bcam ? 0.12 : 0.07));
    if (camZ < clr - 0.7) camZ = clr - 0.7; }   // (only if the land comes up faster than it can glide: it never sinks into it)   // the camera never sinks into the land: it rides up over it

  const pf0 = performance.now();
  drawGround();
  drawPaths(); drawBuildings();   // (what was added to the course's map: see the features part)
  const pf1 = performance.now();

  // what stands in view, far to near
  dlist.length = 0; visObjs.length = 0;
  const tanH = (VW / 2 + 260) / FOC;
  {
    const ex = camX + FX * DMID, ey = camY + FY * DMID, hw = tanH * DMID + 4;
    const x0 = Math.min(camX, ex - RX * hw, ex + RX * hw), x1 = Math.max(camX, ex - RX * hw, ex + RX * hw), y0 = Math.min(camY, ey - RY * hw, ey + RY * hw), y1 = Math.max(camY, ey - RY * hw, ey + RY * hw);
    for (let j = Math.floor(y0 * PPV / OC); j <= Math.floor(y1 * PPV / OC); j++) for (let i = Math.floor(x0 * PPM / OC); i <= Math.floor(x1 * PPM / OC); i++) {
      const cxm = (i + 0.5) * OC / PPM - camX, cym = (j + 0.5) * OC / PPV - camY, cd = cxm * FX + cym * FY;
      if (cd < -3 || cd > DMID + 3 || Math.abs(cxm * RX + cym * RY) > tanH * (cd + 3) + 5) continue;
      if (!tileHave(i >> 1, j >> 1)) { tileWant(i >> 1, j >> 1); continue; }   // its land is not made yet: its things appear when it is
      for (const o of cellObjects(i, j)) {
        if (o.k === K_TREE && farHas(o.x, o.y)) continue;      // (its far piece lists it: see below)
        const ox = o.u / PPM - camX, oy = o.v / PPV - camY, d = ox * FX + oy * FY; if (d < 3 || d > DMID) continue;
        if (feats && featClear(o.u / PPM, o.v / PPV, o.k === K_TREE ? 0.5 : 0.2)) continue;   // nothing grows on a path or in a building
        const small = o.k > K_ROCK, k = FOC / d, sx = VW / 2 + (ox * RX + oy * RY) * k, reach = ((o.k === K_TREE ? o.rx * 1.3 : o.H) + 30) * k / PPM;
        if (sx < -reach || sx > VW + reach) continue;
        if (small && d > 37) { speck(o, Math.round(sx), Math.round(HZ - (o.lift / ZP - camZ) * k), d); if (d > 46) continue; }   // far off a small plant is a speck of its colour; nearer, its sculpture grows in over the speck
        o.d = d; o.sx = Math.round(sx); dlist.push(o); if (d < 30) visObjs.push(o);
      }
    }
  }
  const H = hole, G = TOD[tmode].glow, HAZ = TOD[tmode].haze;
  const dist = (x, y) => (x - camX) * FX + (y - camY) * FY;
  const flag = { k: 20, d: dist(H.pin.x, H.pin.y) + 0.02 }, gol = { k: 21, d: bcam ? dist(p.x, p.y) : camD }, bl = { k: 22, d: dist(ball.x, ball.y) };
  dlist.push(flag, gol, bl, { k: 24, d: cart.on ? camD - 0.02 : dist(cart.x, cart.y) });
  for (const sd of [-1, 1]) { const mx = H.tee.x - H.ry * sd * 2.5 + H.rx * 2.2, my = H.tee.y + H.rx * sd * 2.5 + H.ry * 2.2; dlist.push({ k: 23, d: dist(mx, my), x: mx, y: my }); }
  flist.length = 0;
  {   // trees: every tree is listed by its far piece, whatever its distance (near ones join the things drawn with sway and shadow, far ones are drawn small)
    const DQ = DFAR + 40, ex = camX + FX * DQ, ey = camY + FY * DQ, hw = tanH * DQ;
    const x0 = Math.min(camX, ex - RX * hw, ex + RX * hw), x1 = Math.max(camX, ex - RX * hw, ex + RX * hw), y0 = Math.min(camY, ey - RY * hw, ey + RY * hw), y1 = Math.max(camY, ey - RY * hw, ey + RY * hw);
    for (let fy = Math.floor(y0 / FTS); fy <= Math.floor(y1 / FTS); fy++) for (let fx = Math.floor(x0 / FTS); fx <= Math.floor(x1 / FTS); fx++) {
      const F = ftiles.get((fx + 32768) * 65536 + (fy + 32768));
      if (!F) { const cxm = (fx + 0.5) * FTS - camX, cym = (fy + 0.5) * FTS - camY, cd = cxm * FX + cym * FY; if (cd > -30 && cd < DQ + 20 && Math.abs(cxm * RX + cym * RY) < tanH * (cd + 30) + 30) farTile(fx, fy); continue; }   // far land is asked for before it comes into sight
      if (!F.ready) continue;
      for (const t of F.trees) {
        const tx = t.x - camX, ty = t.y - camY, d = tx * FX + ty * FY; if (d < 3 || d >= DFAR - 34) continue;
        if (feats && featClear(t.x, t.y, 0.5)) continue;
        const k = FOC / d, sx = VW / 2 + (tx * RX + ty * RY) * k, reach = (t.rx * 1.3 + 30) * k / PPM; if (sx < -reach || sx > VW + reach) continue;
        t.d = d; t.sx = Math.round(sx); if (d >= DMID) flist.push(t); else { dlist.push(t); if (d < 30) visObjs.push(t); }
      }
    }
  }
  prewarmStep();
  if (wkOn && (frame & 7) === 3) {   // with a worker: the tiles within 44 m all round and the painted chunks within 31 m, whichever way the camera looks
    const ptx = Math.floor(player.x * PPM / TPX), pty = Math.floor(player.y * PPV / TPX);
    for (let dy = -6; dy <= 6; dy++) for (let dx = -11; dx <= 11; dx++) { if (Math.hypot(dx * TPX / PPM, dy * TPX / PPV) > 46) continue; if (!tileHave(ptx + dx, pty + dy)) wkTile(ptx + dx, pty + dy, false); }
    const pcx = Math.floor(player.x * PPM / CH), pcy = Math.floor(player.y * PPV / CH);
    for (let k = 0; !SIMPLEG && k < PW_NEAR.length && wkChunks.size < 40; k++) {   /* (no painted ground is asked for while the simple grass is drawn everywhere) */ const o = PW_NEAR[k], cx = pcx + o[1], cy = pcy + o[2]; if (!hasChunk(cx, cy)) chunkTry(cx, cy); }
  }
  if ((frame & 3) === 0) {   // the land just beyond the middle distance is asked for before the view reaches it
    const D1 = DMID + 18, ex = camX + FX * D1, ey = camY + FY * D1, hw = tanH * D1 + 4;
    const x0 = Math.min(camX, ex - RX * hw, ex + RX * hw), x1 = Math.max(camX, ex - RX * hw, ex + RX * hw), y0 = Math.min(camY, ey - RY * hw, ey + RY * hw), y1 = Math.max(camY, ey - RY * hw, ey + RY * hw);
    for (let ty = Math.floor(y0 * PPV / TPX); ty <= Math.floor(y1 * PPV / TPX); ty++) for (let tx = Math.floor(x0 * PPM / TPX); tx <= Math.floor(x1 * PPM / TPX); tx++) {
      const cxm = (tx + 0.5) * TPX / PPM - camX, cym = (ty + 0.5) * TPX / PPV - camY, cd = cxm * FX + cym * FY;
      if (cd < DMID - 10 || cd > D1 || Math.abs(cxm * RX + cym * RY) > tanH * (cd + 5) + 5) continue;
      if (!tileHave(tx, ty)) tileWant(tx, ty);
    }
  }
  actorsList();   // T424: the host's other people and carts join the list (parts/08d-actors.md)
  dlist.sort((a, b) => b.d - a.d);

  const fav = (((p.fa - Math.round(camYaw * 16 / 6.2832)) % 16) + 16) % 16;   // his facing as this camera sees it
  golfK = golferK(DS / Math.max(1, (p.x - camX) * FX + (p.y - camY) * FY));   // the sculpture that suits how big he is seen: the larger one when the camera is close
  const gs = cart.on ? golferSprite(fav, 'c', 0, golfK) : p.swing >= 0 || charging ? golferSprite(fav, 's', Math.round(p.al / 0.2), golfK) : p.moving ? golferSprite(fav, 'w', Math.floor(p.walk) % 8, golfK) : golferSprite(fav, 'i', 0, golfK);
  const fs = flagSpr[(frame >> 3) % 6], bz = ball.state === 3 ? groundH(ball.x, ball.y) - 0.2 : ball.z;
  if (!cart.on) castSprite(gs, p.x, p.y, golfK);
  if (flag.d > 2 && flag.d < 40) castSprite(fs, H.pin.x, H.pin.y);
  if (ball.state !== 3) { const bh = Math.max(0, bz - groundH(ball.x, ball.y)); for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) shadePoint(ball.x - 0.809 * bh + a * 0.018 - 0.02, ball.y + 0.735 * bh + b * 0.03); }
  project(H.pin.x, H.pin.y, groundH(H.pin.x, H.pin.y), PJ);
  if (PJ.s > 0.25) {                                           // the cup: a dark hole with a lit far rim
    const rx = Math.max(2, Math.round(5 * PJ.s)), ry = Math.max(1, Math.round(rx * (camZ - groundH(H.pin.x, H.pin.y)) / PJ.d * 1.5));
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) { if (dx * dx / (rx * rx + 1) + dy * dy / (ry * ry + 0.5) > 1) continue; plotZ(PJ.x + dx, PJ.y + dy, PJ.d - 0.2, dy === -ry ? rgb(70, 60, 80) : rgb(22, 14, 26)); }
    addLight(PJ.x, PJ.y, 0.1 * G, 0.5 * G, 0.5 * G);
  }
  project(p.x, p.y, gh, PJ); const psx = PJ.x, psy = PJ.y;
  flist.sort((a, b) => b.d - a.d);
  for (const t of flist) {   // far trees: the same stand-in the near pass would draw at this distance; at the edge of sight they rise out of the haze
    const d = t.d, k = FOC / d, S = libFor(t), gi = d > 196 ? (228 - d) / 32 : 1;
    blit(S, t.sx, Math.round(HZ - (t.lift / ZP - camZ) * k), DS / d * t.libS * gi, d * 100, 0, 0, false, farHaze(d));
  }
  for (const o of dlist) {
    if (o.k === 24) drawCart(cart.on ? gs : null, G);
    else if (o.k === K_ACTOR) drawActor(o.a, o.d);   // T424: another person or cart from the host (parts/08d-actors.md)
    else if (o.k === 21) { if (cart.on || o.d < 1) continue; ghostX = psx; ghostY = psy - 46; blit(gs, psx, psy, DS / o.d / golfK, o.d * 100, 0, 0, false, 0); if (G > 0) addLight(psx, psy - 30, 2.2 * G, 1.6 * G, 0.8 * G); }
    else if (o.k === 20) { project(H.pin.x, H.pin.y, groundH(H.pin.x, H.pin.y), PJ); if (PJ.s > 0) blit(fs, PJ.x, PJ.y, Math.max(0.3, PJ.s), PJ.d * 100, 0, 0, false, 0); }
    else if (o.k === 22) {
      if (ball.state === 3) continue;
      project(ball.x, ball.y, bz, PJ); if (PJ.s === 0) continue;
      if (PJ.s > 0.55) blit(ballSpr, PJ.x, PJ.y, PJ.s, PJ.d * 100 - 40, 0, 0, false, 0);
      else { const w = rgb(255, 255, 250); plotZ(PJ.x, PJ.y, PJ.d - 1, w); plotZ(PJ.x + 1, PJ.y, PJ.d - 1, w); plotZ(PJ.x, PJ.y - 1, PJ.d - 1, w); plotZ(PJ.x + 1, PJ.y - 1, PJ.d - 1, rgb(214, 216, 226)); }
      if (tmode === 2) addLight(PJ.x, PJ.y, 0.25, 0.7, 0.7);
      if (PJ.d > 24 && ball.state === 0) { const by = PJ.y - 12 - Math.round(Math.abs(Math.sin(frame * 0.08)) * 4), gc = rgb(255, 226, 150); for (let k = 0; k < 4; k++) { plotZ(PJ.x - k, by - k, 0, gc); plotZ(PJ.x + 1 + k, by - k, 0, gc); plotZ(PJ.x - k, by - k - 1, 0, rgb(60, 40, 30)); plotZ(PJ.x + 1 + k, by - k - 1, 0, rgb(60, 40, 30)); } }   // a marker over a far ball
    }
    else if (o.k === 23) { project(o.x, o.y, groundH(o.x, o.y), PJ); if (PJ.s > 0) blit(markSpr, PJ.x, PJ.y, PJ.s, PJ.d * 100, 0, 0, false, 0); }
    else {
      const d = o.d, k = FOC / d, s0 = DS / d, sx = o.sx; let oz = o.lift / ZP; if (d < capEnd) { const cp = capAt(d, (sx - VW / 2) / k); if (oz > cp) oz = cp; }
      const sy = Math.round(HZ - (oz - camZ) * k);
      const gi = o.k === K_TREE ? 1 : o.k > K_ROCK ? (46 - d) / 9 : (DMID - d) / 14; if (gi < 0.12) continue;   // small things grow in over the last metres of their range
      const hzo = d > 50 ? farHaze(d) : 0;
      o.libS = 1; const S = spriteFor(o, d); if (!S) continue;
      const s = s0 * o.libS * (gi < 1 ? gi : 1), soft = o.k === K_GRASS || o.k === K_REED || o.k === K_FLOWER;
      const fade = o.born > 0 && frame - o.born < 16 ? frame - o.born + 1 : 0;
      const ghost = o.k === K_TREE && d < camD && Math.abs(sx - psx) < o.rx * s0 * 1.3 + 20;
      const gust = d < 60 ? gustAt(o.u / PPM, o.v / PPV) : 0;
      if (fade) { const Sl = libFor(o); blit(Sl, sx, sy, s0 * o.libS, d * 100, 0, 0, false, hzo); o.libS = 1; blitDith = fade; }   // the stand-in under, the own sculpture dissolving in over it
      if (o.k === K_TREE && d < 5.5) { if (S.wind) blit(S.wind.wood, sx, sy, s, d * 100, 0, 0, false, 0); }   // a tree right at the camera shows its trunk only: its crown would fill the screen (and cost a slow frame)
      else if (S.wind && d < 46) drawWindTree(S, sx, sy, s, d * 100, ghost, 0, gust);
      else blit(S, sx, sy, s, d * 100, soft ? (1.3 + o.H * 0.035) * (gust ? 1.6 : 0.3) : 0, frame * (gust ? 0.14 : 0.045) + o.u * 0.021 + o.v * 0.034, ghost, hzo);
      blitDith = 0;
      if (G > 0 && d < 40) { if (o.k === K_GLOW) { const g = GLOW_LIGHT[Math.min(2, (o.c[2] * 3) | 0)], a = (0.5 + o.H * 0.03) * G * Math.min(1.5, s0); addLight(sx, sy - o.H * 0.5 * s0, g[0] * a, g[1] * a, g[2] * a); }
        else if (o.k === K_CRYSTAL) { const g = CRY_LIGHT[Math.min(2, (o.c[2] * 3) | 0)], a = (0.4 + o.H * 0.02) * G * Math.min(1.5, s0); addLight(sx, sy - o.H * 0.4 * s0, g[0] * a, g[1] * a, g[2] * a); } }
    }
  }
  const pf2 = performance.now();
  reflectWater();
  cloudShadows();
  if (BSAND && TOD[tmode].glow < 1) heatHaze();
  drawParticles();
  drawCreatures();
  if (G > 0 && lights) { spreadLight(); applyGlow(); }
  lr.fill(0); lg.fill(0); lb.fill(0); lights = 0;
  drawAim();
  vctx.putImageData(img, 0, 0);
  const pf3 = performance.now();
  if (genBudget > 100) { tileWork(1e9); farWork(1e9); }
  else if (genUsed < genBudget) { const t = performance.now(); tileWork(genBudget - genUsed); const left = genBudget - genUsed - (performance.now() - t); if (left > 0.3) farWork(Math.min(3, left)); genUsed += performance.now() - t; }
  makeAhead();
  PERF.n++; PERF.ground += pf1 - pf0; PERF.things += pf2 - pf1; PERF.post += pf3 - pf2; PERF.make += performance.now() - pf3;
}
````
