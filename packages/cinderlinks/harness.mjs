// Cinderlinks' headless gate and camera (after Cinderdeep's harness): runs the compiled game.js in Node with a stub page.
//   node harness.mjs [public/cinderlinks/game.js]                the gate: one JSON line, exit 0 = pass (npm run cinder:gate: at RSCALE 0.75)
//   node harness.mjs public/cinderlinks/game.js --shot shots/x --scenes a,b,c   one PNG per scene: shots/x-a.png ... (no gate)
//        [--seed N] [--time 0|1|2] [--scale N]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { convert } from './tools/course-import.mjs';

const argv = process.argv.slice(2);
const optOf = (name, def) => { const k = argv.indexOf(name); return k >= 0 && k + 1 < argv.length ? argv[k + 1] : def; };
const VALUE_FLAGS = new Set(['--shot', '--scenes', '--seed', '--scale', '--time', '--course']);
const positional = argv.filter((a, k) => !a.startsWith('--') && !(k > 0 && VALUE_FLAGS.has(argv[k - 1])));
const file = positional[0] || new URL('../../public/cinderlinks/game.js', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const shotBase = optOf('--shot', null);
const BUDGET = { renderMs: 16.6, tickMs: 1.5, chunkMs: 14, tileMs: 40, actors40Ms: 2 };   // (actors40Ms: T424, drawing forty of the host's people a frame)

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, rgba, scale) {
  const W = w * scale, H = h * scale, row = W * 3 + 1, raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4, d = y * row + 1 + x * 3; raw[d] = rgba[s]; raw[d + 1] = rgba[s + 1]; raw[d + 2] = rgba[s + 2]; }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 6 })), pngChunk('IEND', Buffer.alloc(0))]);
}

function el() {
  return { style: {}, textContent: '', innerHTML: '', className: '', width: 0, height: 0, children: [], dataset: {},
    addEventListener() {}, removeEventListener() {}, appendChild(c) { this.children.push(c); return c; }, setAttribute() {}, classList: { add() {}, remove() {}, toggle() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
    getContext: () => ({ imageSmoothingEnabled: true, fillStyle: '', createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() {}, drawImage() {}, fillRect() {}, clearRect() {}, fillText() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {} }) };
}
const els = {};
const ctx = {
  document: { getElementById: (id) => (els[id] ||= el()), createElement: () => el(), querySelector: () => el(), querySelectorAll: () => [], body: el(), addEventListener() {} },
  addEventListener() {}, removeEventListener() {}, requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '?seed=' + optOf('--seed', '4242') + '&time=' + optOf('--time', '0') + '&course=' + optOf('--course', 'none') + '&biome=' + optOf('--biome', '') + '&type=' + optOf('--type', ''), hash: '' },
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
};
for (const [k, v] of Object.entries(ctx)) globalThis[k] = v;
globalThis.window = globalThis; globalThis.self = globalThis;
{ const ef = 'courses/edits/' + optOf('--course', 'none') + '.json'; if (fs.existsSync(ef)) globalThis.FEAT_JSON = fs.readFileSync(ef, 'utf8'); }   // the paths and buildings added to the course, for the scenes that show them
const RSH = +process.env.RSCALE || 1; if (RSH !== 1) globalThis.RSCALE = RSH;   // the picture's scale, to try smaller pictures (RSCALE=0.5)
const run = (src) => (0, eval)(src);
// host mode (T415): the message a host page sends, made from the importer's Woodhill file as CapitalEmpire would send it (true size, its paths and buildings)
globalThis.hostMsg = () => {   // (made only when asked: a course this size held from the start slows the gate's chunk timings)
  const raw = JSON.parse(fs.readFileSync(new URL('./courses/raw/woodhill.json', import.meta.url), 'utf8')), ed = new URL('./courses/edits/woodhill.json', import.meta.url);
  return { v: 1, t: 'course', course: convert(raw, 'woodhill.json'), features: fs.existsSync(ed) ? JSON.parse(fs.readFileSync(ed, 'utf8')) : null, biome: 'parkland', type: 'private', seed: 4242, scale: 1, hole: 1 };
};

// T424: 'actors' messages as CapitalEmpire sends them (its play/actors3p.ts), in the view's metres. A dress like actors3p.ts dressOf makes
const ACT_SHIRTS = ['#c8323a', '#f2f2ee', '#2f5fae', '#2f8a4e', '#f2c94c', '#e8803a', '#7a4fa0', '#1f2a44', '#5ab8d8', '#e87aa8'];
const ACT_TROU = ['#2a3550', '#d8cfb4', '#5a5f6a', '#1e1e24', '#f0f0ea', '#6e5a3c'], ACT_CAPS = ['#f6f6f2', '#1f2a44', '#c8323a', '#2f5fae', '#2a2a2e'];
const ACT_SKIN = ['#f1c9a4', '#e2b48a', '#c48d62', '#9a6544', '#6e4430'], ACT_HAIR = ['#2c1a12', '#5a3a22', '#a8743c', '#d8b070', '#8a8a8a'];
const actDress = (k) => ({ shirt: ACT_SHIRTS[k % 10], trousers: ACT_TROU[(k * 3 + 1) % 6], cap: ACT_CAPS[(k * 7 + 2) % 5], skin: ACT_SKIN[(k * 3) % 5], hair: ACT_HAIR[(k + 2) % 5], build: 0.95 + (k % 4) * 0.03, sex: k % 5 === 3 ? 'w' : 'm' });
/** a three-ball on the fairway at P(0, 0) playing along (ux, uy): one addressing (or swinging: phase), one watching, one walking up, a caddie, and two carts
 *  on the side of the fairway, one with its two riders. P(f, s): f metres along the hole, s to its right */
globalThis.actorsThreeBall = (P, hd, doing = 'address', phase = 0.75) => ({ v: 1, t: 'actors', at: 600, actors: [
  { id: 11, role: 'golfer', at: P(0, -1.2), hole: 1, heading: hd, doing, phase, dress: actDress(2), caddie: true },
  { id: 12, role: 'golfer', at: P(-3.5, 3.2), hole: 1, heading: hd - 70, doing: 'watch', phase: 0, dress: actDress(4) },
  { id: 13, role: 'golfer', at: P(-10, 1.5), hole: 1, heading: hd + 8, doing: 'walk', phase: 0, dress: actDress(5) },
  { id: 200011, role: 'caddie', at: P(-1, -3.4), hole: 1, heading: hd, doing: 'stand', phase: 0, dress: { shirt: '#f6f6f2', trousers: '#3a4250', cap: '#1f2a44', skin: '#c48d62', hair: '#2c1a12', build: 1, sex: 'm' } },
  { id: 14, role: 'golfer', at: P(-7, 14), hole: 1, doing: 'ride', phase: 0, dress: actDress(7), cart: 100000 },
  { id: 15, role: 'golfer', at: P(-7, 14), hole: 1, doing: 'ride', phase: 0, dress: actDress(1), cart: 100000 },
  { id: 100000, role: 'cart', at: P(-7, 14), hole: 1, heading: hd, riders: [14, 15] },
  { id: 100001, role: 'cart', at: P(9, 15), hole: 1, heading: hd + 160, riders: [] },
] });
/** forty actors in front of a camera at (x, y) looking along (ux, uy): 36 people in every pose from 8 to 190 m, and 4 carts */
globalThis.actors40 = (x, y, ux, uy) => {
  const rx = -uy, ry = ux, hd = Math.atan2(uy, ux) * 180 / Math.PI, poses = ['walk', 'stand', 'address', 'swing', 'putt', 'watch'], A = [];
  for (let k = 0; k < 40; k++) {
    const d = 8 + k * 4.6, s = (((k * 7) % 11) - 5) * (1.2 + d * 0.06), at = [x + ux * d + rx * s, y + uy * d + ry * s];
    if (k % 10 === 9) A.push({ id: 100000 + k, role: 'cart', at, hole: 1, heading: hd + k * 37, riders: [] });
    else A.push({ id: k, role: 'golfer', at, hole: 1, heading: hd + k * 41, doing: poses[k % 6], phase: (k % 5) / 5, dress: actDress(k) });
  }
  return { v: 1, t: 'actors', at: 600, actors: A };
};


// host play (T418 to T420): a turn with a made-up bag, a scripted strike, and a canned shot from the host; run in the game's own scope by the gate and the
// `host` scene. The view must take the turn (the ball where it says, the bag in the tabs, the ring at one standard deviation), send one input and wait
// without moving the ball, play the shot back (it flies, lands, rolls) and leave the ball exactly at the shot's rest, then take the next turn from there
const HOST_PLAY = String.raw`
  function hostPlayRun(snapAt) {
    const errs = [], info = {}, S = course.S, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const b0 = [hole.tee.x / S, hole.tee.y / S], p0 = [hole.pin.x / S, hole.pin.y / S], dl = near(b0, p0), ux = (p0[0] - b0[0]) / dl, uy = (p0[1] - b0[1]) / dl;
    const kit = (club, carryM, scatterM, longM, loftDeg, x) => Object.assign({ club, carryM, scatterM, longM, playsM: carryM * 0.98, sideM: 2, loftDeg, speed: 0.9, sweet: 0.08 }, x || {});
    const bag = (sc) => [kit('driver', 230, sc, 24, 10.5), kit('iron7', 150, 18, 12, 34), kit('putter', 0, 0, 0, 3, { fit: 'Mallet head' })];
    const turn = (ball, stroke, sc) => ({ v: 1, t: 'turn', golfer: 0, holeIdx: 0, hole: holeN, par: hole.par, stroke, at: 600, lie: 'tee', lieKind: 'tee', ball, pin: p0, distM: dl, wind: { mph: 5, from: 90 },
      slope: { up: 0, across: 0 }, clubs: bag(sc), suggested: { club: 'driver', aim: [b0[0] + ux * 230, b0[1] + uy * 230], power: 1 } });
    const step = (n, every) => { for (let k = 0; k < n; k++) { tickGame(); if (every && k % every === 0) render(); } };
    for (const c of Object.keys(keys)) keys[c] = false; mouse.down = false; charging = false;
    hostMessage(turn(b0, 1, 40));
    if (!HP || !HP.turn) errs.push('host play: the turn was not taken');
    if (near([ball.x / S, ball.y / S], b0) > 1e-6) errs.push('host play: the ball is not where the turn put it');
    updateHud(); info.tabs = (clubsEl.innerHTML.match(/class="club/g) || []).length;
    if (info.tabs !== 3 || !/Driver/.test(clubsEl.innerHTML) || !/230 m/.test(clubsEl.innerHTML) || !/Mallet head/.test(clubsEl.innerHTML)) errs.push('host play: the tabs do not show the bag');
    mouse.x = VW / 2; mouse.y = VH / 2 - 120; step(6, 1);
    const r1 = HP.ring && HP.ring.across; info.ring = r1;
    if (!(Math.abs(r1 - 20) < 1e-6)) errs.push('host play: the ring is not at one standard deviation (' + r1 + ' m, want 20)');
    if (snapAt) snapAt('host-aim');
    hostMessage(turn(b0, 1, 16)); step(2, 1); info.ringTight = HP.ring && HP.ring.across;
    if (!(info.ringTight < r1)) errs.push('host play: a steadier club did not tighten the ring');
    // T421: the meter in the hold-and-release: held 45 steps at 0.9 a second (power 0.675), Space three times (boost 0.03), clicked 40 steps into
    // the downswing (accuracy 0.675 - 0.6 = 0.075: early)
    mouse.down = true; step(45, 0); mouse.down = false; if (HP.sw) HP.sw.presses += 3; step(40, 0); mouse.down = true; step(1, 0); mouse.down = false;
    let sent = null; for (let k = 0; k < 120 && !sent; k++) { step(1, 0); if (hostLast && hostLast.t === 'input') sent = hostLast.input; }
    info.input = sent;
    { const w = sent && sent.swing; if (!w || Math.abs(w.power - 0.675) > 1e-6 || Math.abs(w.acc - 0.075) > 1e-6 || Math.abs(w.boost - 0.03) > 1e-9 || w.v !== 2) errs.push('host play: the meter\'s outcome is not the timing (' + JSON.stringify(w) + ')'); }
    if (!sent || sent.club !== 'driver' || !(sent.power >= 0.3 && sent.power <= 1) || !Array.isArray(sent.aim) || !Number.isFinite(sent.aim[0]) || sent.holeIdx !== 0 || sent.stroke !== 1) errs.push('host play: no input, or a wrong one');
    const bw = [ball.x, ball.y]; step(60, 0);
    if (ball.state !== 0 || near([ball.x, ball.y], bw) > 1e-9 || !hostBusy()) errs.push('host play: the ball moved (or he could swing) before the host answered');
    // the canned shot: 200 m out along the hole, 30 m up, 5 s in the air; two bounces and a roll to 22 m further on
    const L = [b0[0] + ux * 200 + uy * 3, b0[1] + uy * 200 - ux * 3], R = [L[0] + ux * 22, L[1] + uy * 22], F = [], FT = [], RL = [], RT = [], RZ = [];
    for (let k = 0; k <= 50; k++) { const u = k / 50; F.push([b0[0] + (L[0] - b0[0]) * u, b0[1] + (L[1] - b0[1]) * u, 30 * 4 * u * (1 - u)]); FT.push(5 * u); }
    for (let k = 1; k <= 12; k++) { const u = k / 12; RL.push([L[0] + (R[0] - L[0]) * u, L[1] + (R[1] - L[1]) * u]); RT.push(5 + 3 * u); RZ.push(k < 4 ? 0.6 * Math.sin(k / 4 * Math.PI) : 0); }
    hostMessage({ v: 1, t: 'shot', golfer: 0, hole: holeN, stroke: 1, club: 'driver', from: b0, flight: F, flightT: FT, bounces: [L, RL[3]], roll: RL, rollT: RT, rollZ: RZ, rest: R, restLie: 'fairway', holed: false, penalty: 0, at: 600 });
    let flew = 0, maxH = 0, cam = 0, k = 0;
    for (; k < 1500 && (HP.play || ball.state !== 0); k++) { step(1, 0); if (ball.state === 1) flew++; if (bcam) cam++; const h = ball.z - groundH(ball.x, ball.y); if (h > maxH) maxH = h; if (snapAt && k === 150) snapAt('host-flight'); }
    info.flew = flew; info.maxH = +maxH.toFixed(1); info.steps = k; info.rest = [+(ball.x / S).toFixed(2), +(ball.y / S).toFixed(2)]; info.want = [+R[0].toFixed(2), +R[1].toFixed(2)];
    if (HP.play || ball.state !== 0) errs.push('host play: the shot never came to rest');
    if (near([ball.x / S, ball.y / S], R) > 1e-6) errs.push('host play: the ball did not stop at the rest of the shot');
    if (flew < 200 || maxH < 25 || !cam) errs.push('host play: the shot was not flown with the ball camera (' + flew + ' steps, ' + maxH.toFixed(1) + ' m high)');
    if (strokes !== 1) errs.push('host play: the stroke was not counted');
    hostMessage(turn(R, 2, 40));
    if (near([ball.x / S, ball.y / S], R) > 1e-6 || strokes !== 1 || hostBusy()) errs.push('host play: the next turn is not from the rest');
    if (snapAt) { step(60, 0); jumpToBall(); step(30, 0); snapAt('host-rest'); }
    return { errs, info };
  }
  // T422: a host page's lies: three fairway points of hole 1 handed over as rough, deep rough and first cut are drawn so
  function hostLieRun() {
    const errs = [], info = {}, msg = hostMsg(), pts = [];
    for (let t = 0.3; t < 0.8 && pts.length < 3; t += 0.02) { const k = Math.min(23, Math.floor(t * 24)), x = hole.path[k * 2], y = hole.path[k * 2 + 1]; if (matAt(x, y) === M_FAIR && pts.every((q) => Math.hypot(q[0] - x, q[1] - y) > 8)) pts.push([x, y]); }
    if (pts.length < 3) { errs.push('host lies: no fairway points found'); return { errs, info }; }
    const S = course.S, x0 = Math.min(...pts.map((q) => q[0])) / S - 10, y0 = Math.min(...pts.map((q) => q[1])) / S - 10, w = 80, h = 80, g = new Array(w * h).fill(0);
    pts.forEach((q, n) => { const i = Math.floor((q[0] / S - x0) / 2), j = Math.floor((q[1] / S - y0) / 2); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) g[(j + dj) * w + i + di] = [3, 4, 2][n]; });
    const r = []; for (let k = 0; k < g.length; k++) { if (r.length && r[r.length - 2] === g[k]) r[r.length - 1]++; else r.push(g[k], 1); }
    msg.course.lk = { x0, y0, step: 2, w, h, r }; msg.course.id = 'woodhill-lies'; hostMessage(msg);
    const got = pts.map((q) => MAT_NAME[matAt(q[0], q[1])]); info.lies = got;
    if (!(got[0] === MAT_NAME[M_ROUGH] || got[0] === MAT_NAME[M_FOREST]) || got[1] !== MAT_NAME[M_DEEP] || got[2] !== MAT_NAME[M_CUT]) errs.push('host lies: the grounds do not follow the host (' + got.join(', ') + ')');
    return { errs, info };
  }
`;
// the scene library for --shot: it runs in the game's own scope
const SHOT_LIB = String.raw`
${HOST_PLAY}
  const out = { names: [], frames: [], info: [] };
  const idle = () => { for (const c of Object.keys(keys)) keys[c] = false; mouse.down = false; charging = false; };
  genBudget = 1e9; spriteMax = 999;
  const go = (x, y, yaw = 0) => { player.x = x; player.y = y; camYaw = yaw; player.th = yaw - 1.5708; player.fa = ((Math.round(player.th / 6.2832 * 16) % 16) + 16) % 16; camD = D0; camHk = 1; HZ = Math.round(190 * RS); aimCam(); camZ = groundH(x, y) + HC; };
  const frames = (n) => { for (let k = 0; k < n; k++) { tickGame(); render(); } };
  const snap = (name) => { render(); render(); render(); out.names.push(name); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name, mat: MAT_NAME[matAt(player.x, player.y)], objs: visObjs.length, chunks: chunks.size, tiles: tiles.size }); };
  const pathAt = (t) => { const k = Math.min(23, Math.floor(t * 24)); return [hole.path[k * 2], hole.path[k * 2 + 1]]; };
  const find = (test, cx, cy, rad) => { for (let r = 0; r < rad; r += 1.5) for (let a = 0; a < 6.283; a += 1.5 / Math.max(r, 1.5)) { const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (test(x, y)) return [x, y]; } return null; };
  const mid = pathAt(0.5);
  const SC = {
    host: () => { hostMessage(hostMsg()); idle(); snap('host'); const r = hostPlayRun(snap); out.info.push({ hostPlay: r.info, errors: r.errs }); const l = hostLieRun(); out.info.push({ hostLies: l.info, errors: l.errs }); snap('host-lies'); },   // (T418: then a turn, a strike and a canned shot)   // (T415: Woodhill handed over by message, hole 1 from its tee)
    tee() { idle(); frames(20); snap('tee'); },
    aim() { idle(); newHole(holeN, hole.tee.x, hole.tee.y); frames(20); player.x = ball.x - 0.3; player.y = ball.y + 0.6; mouse.x = VW / 2 + 60; mouse.y = VH / 2 - 150; frames(6); snap('aim'); mouse.down = true; frames(40); snap('aim-charge'); mouse.down = false; frames(60); snap('ballcam-a'); frames(70); snap('ballcam-b'); for (let k = 0; k < 900 && ball.state !== 0; k++) frames(1); frames(20); snap('ballcam-end'); frames(60); snap('aim-after'); },
    stuck() { // can the golfer be trapped? On every steep point found near the hole (and its flatter neighbours), count the points from which no step in any of 16 directions is allowed
      idle(); let steep = 0, trapped = 0, all = 0; const S2 = { x: 0, y: 0 };
      for (let y = mid[1] - 90; y < mid[1] + 90; y += 0.9) for (let x = mid[0] - 90; x < mid[0] + 90; x += 0.9) { if (matAt(x, y) === M_WATER) continue; slopeAt(x, y, S2); all++; if (Math.hypot(S2.x, S2.y) < 0.9) continue; steep++; let ok = 0; for (let a = 0; a < 16; a++) if (canStand(x + Math.cos(a * 0.3927) * 0.077, y + Math.sin(a * 0.3927) * 0.077, x, y)) ok++; if (!ok) trapped++; }
      out.info.push({ stuck: { points: all, steep, trapped } }); snap('stuck'); },
    pondtree() { idle(); if (!hole.pond) return; const P = hole.pond; let best = null, bd = 1e9; for (let gy = Math.floor((P.y - 30) / TGC); gy < (P.y + 30) / TGC; gy++) for (let gx = Math.floor((P.x - 30) / TGC); gx < (P.x + 30) / TGC; gx++) { const t = treeAt(gx, gy); if (!t) continue; const d = Math.hypot(t.x - P.x, t.y - P.y) - P.r; if (d > 1 && d < bd) { bd = d; best = t; } }
      if (!best) return; const dx = best.x - P.x, dy = best.y - P.y, l = Math.hypot(dx, dy); out.info.push({ pondtree: +bd.toFixed(1) }); go(best.x + dx / l * 4, best.y + dy / l * 4, Math.atan2(-dx, dy)); frames(40); snap('pondtree'); camHk = 1.8; frames(30); snap('pondtree-high'); camHk = 1; },
    course() { // a real course: its first holes from the tee and from the air, the numbers that say it is laid out right
      idle(); if (!course) { out.info.push({ course: 'none loaded (use --course <id>)' }); return; } const rep = [];
      for (const n of [1, 2, 3, 7, 12]) { newHole(n, 0, 0); frames(30); for (let w = 0; w < 500 && (farQ.length || tileQ.length); w++) frames(1); frames(10); snap('course-h' + n); const H = hole; let fair = 0; for (let k = 4; k < 22; k++) if (matAt(H.path[k * 2], H.path[k * 2 + 1]) === M_FAIR) fair++;
        rep.push({ hole: n, par: H.par, lenM: Math.round(H.len), teeMat: MAT_NAME[matAt(H.tee.x, H.tee.y)], pinMat: MAT_NAME[matAt(H.pin.x, H.pin.y)], fairwayOnLine: fair + '/18', teeH: +groundH(H.tee.x, H.tee.y).toFixed(1), pinH: +groundH(H.pin.x, H.pin.y).toFixed(1) });
        if (n === 1) { camHk = 3; camD = 30; frames(20); snap('course-h1-high'); camHk = 1; camD = 14; go(...pathAt(0.5)); frames(30); snap('course-h1-fair'); go(H.pin.x - H.dx * 9, H.pin.y - H.dy * 9, Math.atan2(H.dx, -H.dy)); frames(30); snap('course-h1-green'); } }
      { let best = -1, bs = 0; for (let k = 0; k < course.sP.length; k += 3) if (course.sP[k] < bs) { bs = course.sP[k]; best = k; }   // the middle of the widest water: stand beside it and look across
        if (best >= 0) { const wx = course.gx0 + (best % course.gw) * CRES, wy = course.gy0 + Math.floor(best / course.gw) * CRES; let p = null; for (let a = 0; a < 16 && !p; a++) { const x = wx + Math.cos(a * 0.39) * (-bs + 7), y = wy + Math.sin(a * 0.39) * (-bs + 7); if (matAt(x, y) !== M_WATER && matAt(x, y) !== M_FOREST) p = [x, y, Math.atan2(wx - x, -(wy - y))]; }
          if (p) { go(p[0], p[1], p[2]); frames(40); snap('course-water'); camHk = 2.2; frames(20); snap('course-water-high'); camHk = 1; rep.push({ water: [Math.round(wx), Math.round(wy)], level: +wlAt(wx, wy).toFixed(2), bank: +groundH(p[0], p[1]).toFixed(2), bed: +groundH(wx, wy).toFixed(2) }); } } }
      for (let si = 0; si < Math.min(2, course.streams.length); si++) { const L = course.streams[si], k = (L.length >> 2) * 2, sx = L[k], sy = L[k + 1], ex = L[k + 2 < L.length ? k + 2 : k - 2] - sx, ey = L[k + 3 < L.length ? k + 3 : k - 1] - sy, l = Math.hypot(ex, ey) || 1; go(sx - ey / l * 9 - ex / l * 6, sy + ex / l * 9 - ey / l * 6, Math.atan2(ey / l * 9 + ex / l * 6, ex / l * 9 - ey / l * 6)); camHk = 1.6; frames(40); snap('course-stream' + si); camHk = 1; rep.push({ stream: si, at: [Math.round(sx), Math.round(sy)], level: +wlAt(sx, sy).toFixed(2), mat: MAT_NAME[matAt(sx, sy)], bed: +groundH(sx, sy).toFixed(2) }); }
      let water = 0, lv = new Set(); for (let k = 0; k < course.wlG.length; k += 7) if (course.sP[k] < -0.5) { water++; lv.add(course.wlG[k].toFixed(1)); }
      out.info.push({ course: course.name, holes: course.holes.length, grid: [course.gw, course.gh], waterCells: water, waterLevels: [...lv].slice(0, 12), rep }); },
    cartspot() { // where the cart waits on every hole: the ground under it and round it (it must never wait on a tee, a green, sand or water)
      idle(); const bad = [], n = course ? course.holes.length : 6; for (let h = 1; h <= n; h++) { newHole(h, hole.pin.x + hole.dx * 16, hole.pin.y + hole.dy * 16); const ms = [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].map((o) => matAt(cart.x + o[0], cart.y + o[1])); if (ms.some((m) => m === M_TEE || m === M_GREEN || m === M_SAND || m === M_WATER)) bad.push({ hole: h, mats: ms.map((m) => MAT_NAME[m]) }); }
      out.info.push({ cartspot: { holes: n, bad } }); snap('cartspot'); },
    clouds() { idle(); let n = 0, sh = 0, lo = 9, hi = -9; for (let y = -300; y < 300; y += 3) for (let x = -300; x < 300; x += 3) { const v = cloudAt(x, y, 0); n++; if (v > 0.55) sh++; if (v < lo) lo = v; if (v > hi) hi = v; } out.info.push({ clouds: { share: +(sh / n).toFixed(3), lo: +lo.toFixed(2), hi: +hi.toFixed(2) } });
      camHk = 2.6; camD = 30; frames(20); snap('clouds-a'); frames(240); snap('clouds-b'); camHk = 1; camD = 14; },
    sky() { idle(); const y0 = camYaw; HZ = Math.round(360 * RS); for (const [n, dy] of [['a', 0], ['b', 1.2], ['c', 2.6], ['d', 4.2]]) { camYaw = y0 + dy; aimCam(); frames(8); snap('sky-' + n); } HZ = Math.round(190 * RS); camYaw = y0; },
    closeup() { // the art seen close: parts of the picture three times enlarged (the ground by the golfer, a tree, the middle distance)
      idle(); go(...pathAt(0.3)); frames(40); for (let w = 0; w < 400 && (farQ.length || tileQ.length); w++) frames(1); frames(10); snap('closeup-full'); const keep = Uint32Array.from(fb);
      for (const [n, x0, y0] of [['ground', 80, 360], ['left', 0, 200], ['mid', 320, 180], ['right', 640, 200]]) { for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) fb[y * VW + x] = keep[Math.min(VH - 1, y0 + ((y / 3) | 0)) * VW + Math.min(VW - 1, x0 + ((x / 3) | 0))]; out.names.push('closeup-' + n); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: n }); } fb.set(keep); },
    artsheet() { // the sculptures at their own size on a plain ground: six trees, then bushes and rocks, to judge the pixel art itself
      idle(); render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff58a04c; zbuf.fill(65535);
      const mk = (k, form, hue, H, rx, seed) => ({ k, u: 0, v: 0, lift: 0, seed, c: [form, 0.5, hue, 0.5], H, rx, spr: null, flat: true, d: 0, sx: 0, libS: 1, born: 0, x: 0, y: 0, gx: 0, gy: 0, spk: 0, spk2: 0 });
      [[0.1, 0.1], [0.45, 0.2], [0.45, 0.55], [0.8, 0.35], [0.45, 0.8], [0.8, 0.95]].forEach((p, i) => { const o = mk(K_TREE, p[0], p[1], 210, p[0] < 0.26 ? 42 : 74, 1234 + i * 77); blit(objSprite(o), 85 + i * 158, 300, 1, 100, 0, 0, false, 0); });
      for (let i = 0; i < 5; i++) { blit(objSprite(mk(K_BUSH, 0.5, i / 5, 40, 24, 500 + i)), 80 + i * 90, 420, 1.6, 100, 0, 0, false, 0); blit(objSprite(mk(K_ROCK, 0.5, i / 5, 22 + i * 4, 22 + i * 4, 900 + i)), 560 + i * 80, 420, 1.6, 100, 0, 0, false, 0); }
      for (let i = 0; i < 6; i++) { blit(objSprite(mk(K_GRASS, i / 6, 0.5, 30, 0, 300 + i)), 60 + i * 60, 520, 2, 100, 0, 0, false, 0); blit(objSprite(mk(K_FLOWER, i / 6, 0.5, 20, 0, 400 + i)), 460 + i * 60, 520, 2, 100, 0, 0, false, 0); }
      out.names.push('artsheet'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'artsheet' }); },
    cliffclose() { idle(); camYaw += 3.14; camD = 14; aimCam(); frames(30); snap('cliffclose-full'); const keep = Uint32Array.from(fb); for (const [n, x0, y0] of [['a', 80, 150], ['b', 520, 150]]) { for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) fb[y * VW + x] = keep[Math.min(VH - 1, y0 + ((y / 3) | 0)) * VW + Math.min(VW - 1, x0 + ((x / 3) | 0))]; out.names.push('cliffclose-' + n); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: n }); } fb.set(keep); camYaw -= 3.14; },
    teeround() { idle(); const y0 = camYaw; for (const [n, dy, cd] of [['a', 1.6, 14], ['b', 3.14, 14], ['c', 4.7, 14], ['d', 3.14, 24], ['e', 2.4, 9]]) { camYaw = y0 + dy; camD = cd; aimCam(); frames(14); snap('teeround-' + n); } camYaw = y0; camD = 14; },
    turn() { idle(); go(...pathAt(0.45), 2.2); frames(12); snap('turn-a'); go(...pathAt(0.45), -1.2); camD = 26; frames(12); snap('turn-far'); go(...pathAt(0.45), 4.0); camD = 8.5; camHk = 0.6; frames(12); snap('turn-low'); go(...pathAt(0.45), 2.2); HZ = Math.round(330 * RS); frames(6); snap('look-up'); HZ = Math.round(70 * RS); frames(6); snap('look-down'); HZ = Math.round(190 * RS); camYaw = 0; },
    buried() { idle(); const q = find((x, y) => { if (matAt(x, y) === M_WATER) return false; field(x, y, FO); const h0 = FO.h; field(x, y + 5, FO); const h1 = FO.h; field(x, y + 11, FO); return h1 - h0 > 3 && FO.h - h0 > 3; }, mid[0], mid[1], 80); if (q) { go(q[0], q[1]); frames(10); snap('buried'); go(q[0], q[1], 0.6); frames(10); snap('buried-b'); } },
    wind() { idle(); const p = find((x, y) => matAt(x, y) === M_FOREST && matAt(x + 3, y) === M_FOREST, mid[0], mid[1], 70); if (p) go(p[0], p[1] + 6); frames(4); let f0 = frame; while (!gustAt(player.x, player.y - 8) && frame - f0 < 800) frames(1); frames(3); snap('wind-a'); frames(4); snap('wind-b'); out.info.push({ gustFrames: frame - f0 }); },
    steep() { idle(); const q = find((x, y) => { const m = matAt(x, y); return (m === M_ROCK || m === M_HILL) && matAt(x + 1.5, y) === m; }, mid[0], mid[1], 70); if (q) { go(q[0], q[1] + 7); frames(10); snap('steep'); go(q[0] - 8, q[1], 1.57); frames(10); snap('steep-side'); } },
    fair() { idle(); go(...pathAt(0.45)); frames(12); snap('fair'); },
    green() { idle(); go(hole.pin.x - 2.5, hole.pin.y + 9); frames(12); snap('green'); },
    pond() { idle(); if (hole.pond) { const p = find((x, y) => matAt(x, y) !== M_WATER && matAt(x, y - 1.2) !== M_WATER, hole.pond.x + 2, hole.pond.y + hole.pond.r - 1, 14); if (p) go(...p); } frames(12); snap('pond'); },
    cliff() { idle(); const p = find((x, y) => { field(x, y, FO); const h = FO.h; field(x, y - 2.5, FO); return FO.h - h > 3; }, mid[0], mid[1], 60); if (p) go(p[0], p[1] + 9); frames(12); snap('cliff'); },
    foot() { idle(); let n = 0; const p = find((x, y) => { field(x, y, FO); return FO.tal > 0.8 && ++n > 0; }, mid[0], mid[1], 90); out.info.push({ foot: p });
      if (p) { field(p[0] + 1.5, p[1], FO); const hx1 = FO.h; field(p[0] - 1.5, p[1], FO); const hx0 = FO.h; field(p[0], p[1] + 1.5, FO); const hy1 = FO.h; field(p[0], p[1] - 1.5, FO); const gx = hx1 - hx0, gy = hy1 - FO.h, l = Math.hypot(gx, gy) || 1;
        go(p[0] - gx / l * 7, p[1] - gy / l * 7, Math.atan2(gx, -gy)); frames(12); snap('foot'); camD = 8; aimCam(); frames(6); snap('foot-near'); go(p[0] - gx / l * 7 + gy / l * 5, p[1] - gy / l * 7 - gx / l * 5, Math.atan2(gx, -gy) + 0.5); frames(10); snap('foot-b'); } },
    flick() { // how much the picture changes from one frame to the next while walking up the fairway, by band of rows (far, middle, near)
      idle(); go(...pathAt(0.3)); frames(10); keys.KeyW = true; const N = VW * VH, prev = new Float32Array(N), band = [0, 0, 0], cnt = [0, 0, 0]; let first = true;
      for (let f = 0; f < 30; f++) { tickGame(); render();
        for (let y = 200; y < VH; y++) { const bi = y < 250 ? 0 : y < 330 ? 1 : 2; for (let x = 0; x < VW; x++) { const q = y * VW + x, c = fb[q], l = (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; if (!first) { band[bi] += Math.abs(l - prev[q]); cnt[bi]++; } prev[q] = l; } }
        first = false; }
      idle(); out.info.push({ flick: band.map((b, i) => +(b / cnt[i]).toFixed(2)) }); snap('flick'); },
    still() { // does the rock's pattern stay put on the rock? Turn, then step sideways, at a cliff's foot; each frame is matched block by block against the one before (the best small shift); what is left over is picture that moved on its own
      idle(); let n = 0; const p = find((x, y) => { field(x, y, FO); return FO.tal > 0.8 && ++n > 0; }, mid[0], mid[1], 90); if (!p) return;
      field(p[0] + 1.5, p[1], FO); const hx1 = FO.h; field(p[0] - 1.5, p[1], FO); const hx0 = FO.h; field(p[0], p[1] + 1.5, FO); const hy1 = FO.h; field(p[0], p[1] - 1.5, FO); const gx = hx1 - hx0, gy = hy1 - FO.h, l = Math.hypot(gx, gy) || 1;
      const N = VW * VH, A = new Float32Array(N), Bq = new Float32Array(N), res = [];
      const MK = new Uint8Array(N), MB = new Uint8Array(N); const lum = (o, mk) => { for (let q = 0; q < N; q++) { const c = fb[q], r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255; o[q] = r * 0.3 + g * 0.59 + b * 0.11; mk[q] = g <= r && b < r + 30 ? 1 : 0; } };   // (mk: rock-coloured pixels)
      let DIFF = null; const match = () => { let tot = 0, nb = 0; for (let by = 96; by + 48 <= 432; by += 48) for (let bx = 96; bx + 48 <= 864; bx += 48) { let best = 1e18, bdx = 0, bdy = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) { let s = 0; for (let y = 0; y < 48; y++) { const r0 = (by + y) * VW + bx, r1 = (by + y + dy) * VW + bx + dx; for (let x = 0; x < 48; x++) if (MK[r0 + x]) s += Math.abs(A[r0 + x] - Bq[r1 + x]); } if (s < best) { best = s; bdx = dx; bdy = dy; } } if (DIFF) for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const q = (by + y) * VW + bx + x; DIFF[q] = MK[q] ? Math.min(255, 4 * Math.abs(A[q] - Bq[q + bdy * VW + bdx])) : 0; } let c = 0; for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) c += MK[(by + y) * VW + bx + x]; if (c > 1100) { tot += best / c; nb++; } } return nb ? tot / nb : 0; };
      for (const mode of [0, 1, 2]) {
        go(p[0] - gx / l * (mode === 2 ? 30 : 7), p[1] - gy / l * (mode === 2 ? 30 : 7), Math.atan2(gx, -gy)); camD = mode === 2 ? 14 : 8; aimCam(); frames(14); lum(A, MK); let tot = 0;
        for (let f = 0; f < 14; f++) { if (mode !== 1) camYaw += 0.004; else keys.KeyD = true; tickGame(); render(); if (mode === 0 && f >= 12) { const keep = Uint32Array.from(fb); for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) fb[y * VW + x] = keep[(192 + (y >> 3)) * VW + 340 + (x >> 3)]; out.names.push('still-z' + f); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'still-z' + f }); fb.set(keep); } lum(Bq, MB); if (f === 13) DIFF = new Float32Array(N); tot += match(); A.set(Bq); MK.set(MB); }
        snap('still-' + mode); for (let q = 0; q < N; q++) { const v = DIFF[q] | 0; fb[q] = (0xff000000 | (v << 16) | (v << 8) | v) >>> 0; } DIFF = null; out.names.push('still-diff' + mode); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'still-diff' + mode });
        idle(); res.push(+(tot / 14).toFixed(2));
      }
      camD = 14; out.info.push({ still: res }); },
    bench() { // frame times for comparing two builds on a busy machine: the median and the fastest tenth, standing at the tee, standing on the fairway, walking up it
      const run = (n, walk) => { const ts = []; for (let f = 0; f < n; f++) { if (walk) tickGame(); const t = performance.now(); render(); ts.push(performance.now() - t); } ts.sort((p, q) => p - q); return [+ts[n >> 1].toFixed(2), +ts[n >> 3].toFixed(2)]; };
      idle(); frames(40); for (let w = 0; w < 900 && (farQ.length || tileQ.length); w++) frames(1); const tee = run(process.env.TEEONLY ? 600 : 160, false); let fair = 0, walk = 0, flight = 0; if (!process.env.TEEONLY) { go(...pathAt(0.45)); frames(40); fair = run(160, false); keys.KeyW = true; frames(30); walk = run(160, true); idle(); newHole(holeN, hole.tee.x, hole.tee.y); firstPicture(); frames(30); player.x = ball.x - 0.3; player.y = ball.y + 0.6; mouse.x = VW / 2 + 200; mouse.y = VH / 2 - 160; frames(5); mouse.down = true; frames(50); mouse.down = false; { const ts = []; for (let k = 0; k < 900 && (k < 60 || ball.state !== 0); k++) { tickGame(); const c0 = [tiles.size, chunks.size, lib.size, ocells.size, ftiles.size, treeMemo.size, gcache.size]; const t = performance.now(); render(); const dt = performance.now() - t; ts.push(dt); if (dt > 150) out.info.push({ slow: k, ms: Math.round(dt), state: ball.state, bcam, d: [tiles.size, chunks.size, lib.size, ocells.size, ftiles.size, treeMemo.size, gcache.size].map((v, i) => v - c0[i]), genUsed: Math.round(genUsed), made: madeThisFrame, small: typeof smallMade === 'number' ? smallMade : -1 }); } const mi = ts.indexOf(Math.max(...ts)); ts.sort((p, q) => p - q); flight = [mi, +ts[ts.length >> 1].toFixed(2), +ts[(ts.length * 0.9) | 0].toFixed(2), +ts[ts.length - 1].toFixed(1), ts.length]; } }
      out.info.push({ bench: { tee, fair, walk, flight } }); snap('bench'); },
    shimmer() { // what moves on its own when the camera moves: on the fairway and at the tee, turning and walking; each frame is matched block by block against the one before (best small shift); the rest is shimmer. Sky is left out.
      const N = VW * VH, A = new Float32Array(N), Bq = new Float32Array(N), MK = new Uint8Array(N), MB = new Uint8Array(N), DIFF = new Float32Array(N), res = {};
      const lum = (o, mk) => { for (let q = 0; q < N; q++) { const c = fb[q]; o[q] = (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; mk[q] = zbuf[q] === 65535 ? 0 : 1; } };
      const match = (keep) => { let tot = 0, nb = 0; for (let by = 96; by + 32 <= 512; by += 32) for (let bx = 32; bx + 32 <= 928; bx += 32) { let best = 1e18, bdx = 0, bdy = 0, c = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c += MK[(by + y) * VW + bx + x]; if (c < 700) continue;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) { let s = 0; for (let y = 0; y < 32; y++) { const r0 = (by + y) * VW + bx, r1 = (by + y + dy) * VW + bx + dx; for (let x = 0; x < 32; x++) if (MK[r0 + x]) s += Math.abs(A[r0 + x] - Bq[r1 + x]); } if (s < best) { best = s; bdx = dx; bdy = dy; } }
        if (keep) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const q = (by + y) * VW + bx + x; DIFF[q] = MK[q] ? Math.min(255, 5 * Math.abs(A[q] - Bq[q + bdy * VW + bdx])) : 0; }
        tot += best / c; nb++; } return nb ? tot / nb : 0; };
      for (const [name, at, mode] of [['fair-turn', 0.45, 0], ['fair-walk', 0.45, 1], ['tee-turn', -1, 0], ['far-turn', 0.2, 0]]) {
        idle(); if (at >= 0) go(...pathAt(at)); else newHole(holeN, hole.tee.x, hole.tee.y); frames(30); for (let w = 0; w < 600 && (farQ.length || tileQ.length); w++) frames(1); frames(20); lum(A, MK); let tot = 0; DIFF.fill(0);
        for (let f = 0; f < 12; f++) { if (mode === 0) camYaw += 0.004; else keys.KeyW = true; tickGame(); render(); lum(Bq, MB); tot += match(f === 11); A.set(Bq); MK.set(MB); }
        idle(); res[name] = +(tot / 12).toFixed(2); snap('shimmer-' + name);
        for (let q = 0; q < N; q++) { const v = DIFF[q] | 0; fb[q] = (0xff000000 | (v << 16) | (v << 8) | v) >>> 0; } out.names.push('shimmer-' + name + '-diff'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'diff' });
      }
      out.info.push({ shimmer: res }); },
    turnbench() { // a steady turn at the tee with the game's real making budget: frame times (median, slowest tenth, slowest) and what was made
      idle(); frames(40); for (let w = 0; w < 900 && (farQ.length || tileQ.length); w++) frames(1); const gb = genBudget, sm = spriteMax; genBudget = 3; spriteMax = 1; const ts = []; const c0 = [tiles.size, chunks.size, lib.size, gcache.size]; let sculpt = 0;
      for (let f = 0; f < 400; f++) { camYaw += 0.016; tickGame(); const t = performance.now(); render(); ts.push(performance.now() - t); sculpt += madeThisFrame; }
      genBudget = gb; spriteMax = sm; const srt = ts.slice().sort((p, q) => p - q); out.info.push({ turnbench: { med: +srt[200].toFixed(1), p90: +srt[360].toFixed(1), max: +srt[399].toFixed(1), over17: ts.filter((v) => v > 16.7).length, made: [tiles.size, chunks.size, lib.size, gcache.size].map((v, i) => v - c0[i]), sculpt } }); snap('turnbench'); },
    cliffbench() { // the heaviest standing views: at the tee, looking four ways (cliffs all round); frame time and where it goes
      idle(); const res = {}; const y0 = camYaw; for (const [n, dy] of [['ahead', 0], ['right', 1.57], ['back', 3.14], ['left', 4.71]]) { camYaw = y0 + dy; aimCam(); frames(30); for (let w = 0; w < 600 && (farQ.length || tileQ.length); w++) frames(1); for (const k of Object.keys(PERF)) PERF[k] = 0; const ts = []; for (let f = 0; f < 120; f++) { const t = performance.now(); render(); ts.push(performance.now() - t); } ts.sort((p, q) => p - q); res[n] = { med: +ts[60].toFixed(1), ground: +(PERF.ground / PERF.n).toFixed(1), things: +(PERF.things / PERF.n).toFixed(1), post: +(PERF.post / PERF.n).toFixed(1) }; snap('cliffbench-' + n); }
      camYaw = y0; out.info.push({ cliffbench: res }); },
    putt() { idle(); const px0 = hole.pin.x + 3.2, py0 = hole.pin.y + 2.4; ball.x = px0; ball.y = py0; ballRest(); const yaw = Math.atan2(hole.pin.x - px0, -(hole.pin.y - py0)); go(px0 - Math.sin(yaw) * 0.6 + 0.3, py0 + Math.cos(yaw) * 0.6, yaw); frames(40); snap('putt'); camD = 9; HZ = Math.round(150 * RS); aimCam(); frames(30); snap('putt-near'); },
    feat() { idle(); const S = course.S, T = hole.tee, pts = []; for (let t = 0.04; t < 0.9; t += 0.06) { const p = pathAt(t); pts.push([(p[0] + 7 + 3 * Math.sin(t * 9)) / S, p[1] / S]); }
      setFeatures({ features: [{ kind: 'path', pts, width: 2.4, surface: 'gravel' }, { kind: 'building', at: [(T.x - 16) / S, (T.y - 22) / S], w: 26, d: 14, h: 6, rot: 25, roof: 'gable', floors: 2 }, { kind: 'building', at: [(T.x + 20) / S, (T.y - 30) / S], w: 12, d: 10, h: 4, rot: -15, roof: 'hip', roofColour: '#4a5a6a', wall: '#d8d0c0' }] });
      { const q = pathAt(0.3), yaw = Math.atan2(q[0] - T.x, -(q[1] - T.y)); go(T.x, T.y, yaw); frames(40); snap('feat-path'); out.info.push({ sd: feats.sd ? feats.sd.length : 0, at: pathSd(q[0] + 7, q[1]), res: feats.res }); }
      { go(T.x, T.y, 0); frames(30); const tm = () => { const t0 = performance.now(); for (let k = 0; k < 40; k++) drawGround(); return +((performance.now() - t0) / 40).toFixed(2); }; const withF = tm(), keep = feats; feats = null; const noF = tm(); feats = keep; const again = tm(); out.info.push({ groundMsWithFeats: withF, without: noF, againWith: again }); }
      go(T.x, T.y + 6, 0); frames(40); snap('feat-tee'); go(T.x - 10, T.y + 2, -0.5); frames(30); snap('feat-house'); setTime(2); frames(20); snap('feat-dusk'); setTime(0); },
    trk() { idle(); setFeatures(JSON.parse(FEAT_JSON)); const T = hole.tee; let best = null, bd = 0; { let P1 = feats.paths[0]; for (const p of feats.paths) if (p.pts.length > P1.pts.length) P1 = p; const k = ((P1.pts.length / 4) | 0) * 2, k2 = Math.min(P1.pts.length - 2, k + 8); best = [P1.pts[k], P1.pts[k + 1], P1.pts[k2], P1.pts[k2 + 1]]; }
      const yaw = Math.atan2(best[2] - best[0], -(best[3] - best[1])); go(best[0] - Math.sin(yaw) * 5 + 3, best[1] + Math.cos(yaw) * 5, yaw); frames(40); snap('trk-path'); out.info.push({ nearestPathM: +bd.toFixed(1) }); { const F = feats, r = []; for (let k = 0; k < 12; k++) { const wx = best[0] + (best[2] - best[0]) * k / 12, wy = best[1] + (best[3] - best[1]) * k / 12, ck = Math.round((wy - F.gy0) / F.res) * F.gw + Math.round((wx - F.gx0) / F.res), o = F.seg[ck] * 7, G = F.SG; let tt = ((wx - G[o]) * G[o + 2] + (wy - G[o + 1]) * G[o + 3]) / G[o + 4]; r.push([F.paths[F.kind[ck]].slab, F.seg[ck], +tt.toFixed(2), +((G[o + 5] + tt * G[o + 6]) / 1.7).toFixed(2)]); } out.info.push({ dbg: r, res: F.res, segs: F.SG.length / 7, span: Math.hypot(best[2] - best[0], best[3] - best[1]).toFixed(1) }); }
      const q = pathAt(0.2); go(q[0] + 9, q[1], 0); for (let k = 0; k < 60; k++) pressCart(player.x - 2 + Math.sin(k * 0.08) * 1.2, player.y + 3 - k * 0.2, -1.5708 + Math.cos(k * 0.08) * 0.48); frames(20); snap('trk-tracks'); { let nz = 0; for (const A of press.values()) for (let k = 0; k < 1024; k++) if (A[k]) nz++; const u = Math.floor((player.x - 2) * PPM), v = Math.floor((player.y - 3) * PPV), key = ((u >> 7) + 32768) * 65536 + ((v >> 7) + 32768); out.info.push({ pressChunks: press.size, cells: nz, hasChunkThere: press.has(key), chunkMade: !!chunkTry(u >> 7, v >> 7), gAt: MAT_NAME[matAt(player.x - 2, player.y - 3)], hit: globalThis.__hit | 0, lcxInfo: typeof prsDbg }); } },
    golferzoom() { render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff5a9e4a; zbuf.fill(65535); const L = [[4, 'i', 0], [2, 'i', 0], [0, 'w', 2], [12, 'i', 0], [6, 'w', 5], [4, 's', 8], [4, 's', -6]]; L.forEach((o, k) => blit(golferSprite(o[0], o[1], o[2]), Math.round(VW * (k + 0.5) / L.length), Math.round(VH * 0.9), 4 * RS / GK * 0.75, 100, 0, 0, false, 0)); out.names.push('golferzoom'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'golferzoom' }); },
    bioinfo() { idle(); frames(20); let con = 0, br = 0, n = 0; for (const o of visObjs) if (o.k === K_TREE) { n++; if (o.c[0] < CONT) con++; else br++; } const t = treeAt(10, 10) || treeAt(11, 10) || treeAt(12, 12); out.info.push({ biomeId, CONT, BTREE, BGR, trees: n, con, br, leaf0: LEAF[0][5].toString(16), rough0: G_ROUGH[3].toString(16) }); },
    treesheet() { render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff5a9e4a; zbuf.fill(65535); for (let k = 0; k < 5; k++) { const H = Math.round((170 + k * 28) * (BT2 ? BT2H : 1)), o = { k: K_TREE, seed: 1000 + k * 977, c: [0.45, 0.5, 0.15 + k * 0.08, 0.6], H, rx: Math.round(H * 0.36 * (BT2 ? BT2RX : 1)), spr: null, flat: true }; const S = objSprite(o); blit(S, Math.round(VW * (k + 0.5) / 5), Math.round(VH * 0.94), RS * 1.25, 100, 0, 0, false, 0); } out.names.push('treesheet'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'treesheet', BT2 }); },
    gt() { idle(); const T = hole.tee, r = {}; for (const yaw of [0, 1.57, 3.14, 4.71]) { go(T.x, T.y, yaw); frames(30); const t0 = performance.now(); for (let k = 0; k < 30; k++) drawGround(); r['yaw' + yaw] = +((performance.now() - t0) / 30).toFixed(1); } out.info.push({ gt: r }); },
    lip() { // a bunker's lip and a grass edge seen from a little way off while the camera turns: the picture, a 3x close-up of its middle, and how much the close-up changes per small turn beyond what turning explains
      idle(); let sand = null; for (let t = 0.25; t < 0.98 && !sand; t += 0.02) { const [px, py] = pathAt(t); sand = find((x, y) => matAt(x, y) === M_SAND && matAt(x + 1.5, y) === M_SAND && matAt(x, y + 1.5) === M_SAND, px, py, 40); }
      if (!sand) { out.info.push({ lip: 'no sand found' }); return; }
      const res = { sand: [Math.round(sand[0]), Math.round(sand[1])] };
      for (const [nm, dist] of [['d100', 100], ['d70', 70]]) {
        let st = [sand[0], sand[1] + dist], bd = 1e9; for (let t = 0; t < 1; t += 0.02) { const p = pathAt(t), e = Math.abs(Math.hypot(p[0] - sand[0], p[1] - sand[1]) - dist); if (e < bd) { bd = e; st = p; } }   // a place on the hole's own line, that far from the bunker
        const yaw = Math.atan2(sand[0] - st[0], -(sand[1] - st[1])); go(st[0], st[1], yaw); frames(50); for (let w = 0; w < 400 && (farQ.length || tileQ.length); w++) frames(1);
        snap('lip-' + nm);
        const N = VW * VH, crop = () => { const k = new Uint32Array(N); const x0 = (VW / 3) | 0, y0 = (VH * 0.4) | 0; for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) k[y * VW + x] = fb[(y0 + ((y / 3) | 0)) * VW + x0 + ((x / 3) | 0)]; return k; };
        { const keep = Uint32Array.from(fb), z = crop(); fb.set(z); out.names.push('lip-' + nm + '-zoom'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'zoom' }); fb.set(keep); }
        let chg = 0, cnt = 0, prev = null; const y0 = camYaw;
        for (let f = 0; f < 24; f++) { camYaw = y0 + f * 0.0016; aimCam(); render();   // (a pixel's worth of turn every frame or so)
          const cur = new Float32Array(N); for (let q = 0; q < N; q++) { const c = fb[q]; cur[q] = zbuf[q] === 65535 ? -1 : (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; }
          if (prev) { let best = 1e18; for (let dx = 0; dx <= 3; dx++) { let s = 0, n = 0; for (let y = (VH / 4) | 0; y < (VH * 0.7) | 0; y++) for (let x = (VW / 4) | 0; x < (VW * 0.75) | 0; x++) { const a = cur[y * VW + x], b = prev[y * VW + x + dx]; if (a >= 0 && b >= 0) { s += Math.abs(a - b); n++; } } if (n && s / n < best) best = s / n; } chg += best; cnt++; }
          prev = cur; }
        camYaw = y0 + 0.02; aimCam(); render(); { const keep = Uint32Array.from(fb), z = crop(); fb.set(z); out.names.push('lip-' + nm + '-zoom2'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'zoom2' }); fb.set(keep); }
        camYaw = y0; res[nm] = +(chg / cnt).toFixed(3);
      }
      out.info.push({ lip: res }); },
    farjit() { // what moves on its own FAR AWAY (beyond 45 m) while the golfer walks forward, then turns: each frame matched block by block against the one before; the rest is jitter. Also two frames of a far stretch, four times enlarged, to look at.
      const N = VW * VH, A = new Float32Array(N), Bq = new Float32Array(N), MK = new Uint8Array(N), MB = new Uint8Array(N), DIFF = new Float32Array(N), res = {};
      const lum = (o, mk) => { for (let q = 0; q < N; q++) { const c = fb[q]; o[q] = (c & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + ((c >> 16) & 255) * 0.11; mk[q] = zbuf[q] !== 65535 && zbuf[q] > 4500 ? 1 : 0; } };
      const match = (keep) => { let tot = 0, nb = 0; for (let by = 64; by + 32 <= 400; by += 32) for (let bx = 32; bx + 32 <= 928; bx += 32) { let best = 1e18, bdx = 0, bdy = 0, c = 0; for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) c += MK[(by + y) * VW + bx + x]; if (c < 500) continue;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -6; dx <= 6; dx++) { let s = 0; for (let y = 0; y < 32; y++) { const r0 = (by + y) * VW + bx, r1 = (by + y + dy) * VW + bx + dx; for (let x = 0; x < 32; x++) if (MK[r0 + x]) s += Math.abs(A[r0 + x] - Bq[r1 + x]); } if (s < best) { best = s; bdx = dx; bdy = dy; } }
        if (keep) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const q = (by + y) * VW + bx + x; DIFF[q] = MK[q] ? Math.min(255, 5 * Math.abs(A[q] - Bq[q + bdy * VW + bdx])) : 0; }
        tot += best / c; nb++; } return nb ? tot / nb : 0; };
      const zoom = (name) => { const keep = Uint32Array.from(fb); for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) fb[y * VW + x] = keep[(150 + (y >> 2)) * VW + 360 + (x >> 2)]; out.names.push(name); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name }); fb.set(keep); };
      for (const [name, mode] of [['walk', 1], ['turn', 0]]) {
        idle(); newHole(holeN, hole.tee.x, hole.tee.y); frames(40); for (let w = 0; w < 600 && (farQ.length || tileQ.length); w++) frames(1); frames(30); lum(A, MK); let tot = 0; DIFF.fill(0);
        for (let f = 0; f < 16; f++) { if (mode === 0) camYaw += 0.004; else keys.KeyW = true; tickGame(); render(); if (f >= 13 && mode === 1) zoom('farjit-z' + f); lum(Bq, MB); tot += match(f === 15); A.set(Bq); MK.set(MB); }
        idle(); res[name] = +(tot / 16).toFixed(2); snap('farjit-' + name);
        for (let q = 0; q < N; q++) { const v = DIFF[q] | 0; fb[q] = (0xff000000 | (v << 16) | (v << 8) | v) >>> 0; } out.names.push('farjit-' + name + '-diff'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'diff' });
      }
      out.info.push({ farjit: res }); },
    chunkprof() { const t0 = performance.now(); let n = 0; for (let cy = -12; cy < 12; cy++) for (let cx = -14; cx < 14; cx++) { genChunk(cx, cy); n++; } out.info.push({ chunkAvgMs: +((performance.now() - t0) / n).toFixed(2), n }); snap('chunkprof'); },
    cart() { idle(); cart.th = Math.atan2(hole.ry, hole.rx); const back = Math.atan2(Math.cos(cart.th), Math.sin(cart.th));   // (back: the camera's turn that looks along the cart's heading)
      go(cart.x - Math.cos(cart.th) * 5, cart.y - Math.sin(cart.th) * 5, back + 0.7); camD = 8; aimCam(); frames(12); snap('cart'); camYaw = back + 2.4; aimCam(); frames(8); snap('cart-b'); camYaw = back - 1.5; camD = 6; aimCam(); frames(8); snap('cart-c');
      camD = 14; camYaw = back; player.x = cart.x; player.y = cart.y; rideCart(); frames(4); snap('cart-in'); keys.KeyW = true; frames(60); keys.KeyD = true; frames(40); snap('cart-ride'); idle(); frames(30); rideCart(); out.info.push({ cartTh: +cart.th.toFixed(2), cartAt: [+cart.x.toFixed(1), +cart.y.toFixed(1)] }); },
    golfer() { idle(); render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff5a9e4a; zbuf.fill(65535); for (let f = 0; f < 8; f++) { blit(golferSprite(f * 2, 'i', 0), 70 + f * 118, 150, 1.5, 100, 0, 0, false, 0); blit(golferSprite(f * 2, 'w', f), 70 + f * 118, 320, 1.5, 100, 0, 0, false, 0); blit(golferSprite(f * 2, f < 4 ? 's' : 'c', f < 4 ? -8 + f * 5 : 0), 70 + f * 118, 490, 1.5, 100, 0, 0, false, 0); } out.names.push('golfer-sheet'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'golfer-sheet' }); },
    woods() { idle(); const p = find((x, y) => matAt(x, y) === M_FOREST && matAt(x + 3, y) === M_FOREST && matAt(x - 3, y + 2) === M_FOREST, mid[0], mid[1], 70); if (p) go(...p); frames(12); snap('woods'); },
    meadow() { idle(); const p = find((x, y) => matAt(x, y) === M_DEEP && matAt(x + 3, y) === M_DEEP && matAt(x - 3, y + 2) === M_DEEP, mid[0], mid[1], 70); if (p) go(...p); frames(12); snap('meadow'); },
    bunker() { idle(); const b = hole.bunk[0]; go(b.x, b.y + b.ry + 6); frames(12); snap('bunker'); },
    swing() { idle(); go(ball.x - 0.2, ball.y + 0.6); mouse.x = VW / 2 + 180; mouse.y = VH / 2 - 150; frames(4); mouse.down = true; frames(26); snap('swing'); mouse.down = false; frames(8); snap('strike'); frames(40); snap('flight'); idle(); },
    walk() { idle(); keys.KeyD = true; keys.KeyS = true; frames(46); snap('walk'); idle(); },
    gallery() { // T429: Woodhill's 18th on tournament day: a ring of fans round the green, a grandstand of seated fans behind it; then a holed putt and the cheer
      const hm = hostMsg(); hm.hole = 18; hostMessage(hm); idle(); ACT_MAKE = 999;
      const S = course.S, px = hole.pin.x, py = hole.pin.y, bx = hole.tee.x, by = hole.tee.y, L = Math.hypot(px - bx, py - by), ux = (px - bx) / L, uy = (py - by) / L, rx = -uy, ry = ux;
      const ring = [], stand = [];
      for (let k = 0; k < 165; k++) {   // round the green but its approach, two or three deep
        const a = Math.PI * 0.28 + (k % 55) / 55 * Math.PI * 1.44, row = Math.floor(k / 55) % 3, cx = Math.cos(a), cy = Math.sin(a);
        let r = 6; while (r < 40 && matAt(px - (ux * cx + rx * cy) * r, py - (uy * cx + ry * cy) * r) === M_GREEN) r += 0.5;
        r += 2.5 + row * 1.2; const qx = px - (ux * cx + rx * cy) * r, qy = py - (uy * cx + ry * cy) * r, mq = matAt(qx, qy); if (mq === M_WATER || mq === M_SAND || mq === M_GREEN) continue; ring.push([qx / S, qy / S, 0]);
      }
      const sx = px + ux * 30, sy = py + uy * 30;   // a stand behind the green, facing back down the hole
      for (let row = 0; row < 4; row++) for (let c = 0; c < 16; c++) { const a = (c - 7.5) * 0.65, b = row * 0.9; stand.push([(sx + rx * a + ux * b) / S, (sy + ry * a + uy * b) / S, 0.45 + row * 0.35]); }
      const msg = { v: 1, t: 'actors', at: 600, actors: [
        { id: 300000, role: 'gallery', at: [px / S, py / S], hole: 18, count: ring.length, fans: ring, focus: [px / S, py / S] },
        { id: 300001, role: 'gallery', at: [sx / S, sy / S], hole: 18, count: stand.length, fans: stand, focus: [px / S, py / S], seated: true }] };
      msg.actors.pop();   // (Woodhill has no grandstand to seat them on: the seated crowd is drawn in the gate's count only)
      hostMessage(msg);
      const me = [px - ux * 26 + rx * 4, py - uy * 26 + ry * 4]; go(me[0], me[1], Math.atan2(ux, -uy) + 0); camYaw = Math.atan2(px - me[0], -(py - me[1])); player.th = camYaw - 1.5708; aimCam(); frames(30);
      for (let k = 0; k < 6; k++) render(); snap('gallery');
      ACT_MS = 0; const T0 = performance.now(); for (let k = 0; k < 30; k++) render(); const ms = (performance.now() - T0) / 30, act = ACT_MS / 30;
      galleryReact({ holed: true, club: 'putter', rest: [px / S, py / S] }); for (let k = 0; k < 6; k++) { frame++; } render(); snap('gallery-cheer');
      out.info.push({ gallery: { fans: ring.length, crowds: galleries.size, cheering: [...galleries.values()].filter((g) => frame - g.cheer < 150).length, renderMs: +ms.toFixed(2), crowdMs: +act.toFixed(3), sprites: fanSpr.size } });
      hostMessage({ v: 1, t: 'actors', at: 600, actors: [] }); ACT_MAKE = 3; },
    actors() { // T424: a three-ball on the fairway, a caddie and two carts beside it, from an 'actors' message; then the swing; then forty actors timed
      idle(); newHole(holeN, hole.tee.x, hole.tee.y); frames(4); ACT_MAKE = 999;
      const q = pathAt(0.34), q0 = pathAt(0.26), L = Math.hypot(q[0] - q0[0], q[1] - q0[1]) || 1, ux = (q[0] - q0[0]) / L, uy = (q[1] - q0[1]) / L, rx = -uy, ry = ux;
      const P = (f, s) => [q[0] + ux * f + rx * s, q[1] + uy * f + ry * s], hd = Math.atan2(uy, ux) * 180 / Math.PI, th = Math.atan2(uy, ux);
      const me = P(-17, -2.5); go(me[0], me[1], th + 1.5708); frames(20);
      hostMessage(actorsThreeBall(P, hd)); frames(4); snap('actors');
      hostMessage(actorsThreeBall(P, hd, 'swing', 0.45)); frames(4); snap('actors-swing');
      go(me[0], me[1], th + 1.5708); frames(10);
      hostMessage(actors40(me[0], me[1], ux, uy)); for (let k = 0; k < 6; k++) render(); snap('actors40');
      const T0 = performance.now(); ACT_MS = 0; for (let k = 0; k < 40; k++) render(); const withMs = (performance.now() - T0) / 40, actMs = ACT_MS / 40;
      hostMessage({ v: 1, t: 'actors', at: 600, actors: [] }); render(); const T1 = performance.now(); for (let k = 0; k < 40; k++) render(); const noMs = (performance.now() - T1) / 40;
      ACT_MAKE = 3; out.info.push({ actors40: { actorMs: +actMs.toFixed(3), renderMs: +withMs.toFixed(2), renderNoActorsMs: +noMs.toFixed(2), sprites: actSpr.size } }); },
    golfer() { // every facing, standing and mid-stride, on one sheet (drawn straight into the frame)
      render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff5a9e4a; zbuf.fill(65535);
      for (let f = 0; f < 16; f++) { blit(golferSprite(f, 'i', 0), 40 + (f % 8) * 118, 130 + Math.floor(f / 8) * 135, 1, 100, 0, 0, false, 0); blit(golferSprite(f, 'w', 2), 40 + (f % 8) * 118 + 52, 130 + Math.floor(f / 8) * 135, 1, 100, 0, 0, false, 0); }
      for (let s = -10; s <= 11; s += 3) blit(golferSprite(5, 's', s), 60 + (s + 10) / 3 * 115, 500, 1, 100, 0, 0, false, 0);
      out.names.push('golfer'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'golfer' });
    },
    flora() { // a sheet of generated things, each from its own seed
      render(); for (let i = 0; i < fb.length; i++) fb[i] = 0xff5a9e4a; zbuf.fill(65535);
      const R = mulberry32(99); let x = 90, y = 330;
      for (let k = 0; k < 7; k++) { const c = [k < 2 ? 0.1 : k === 5 ? 0.9 : 0.5, 0.2 + R() * 0.8, k / 6.2, R()], o = { k: K_TREE, seed: (R() * 1e9) | 0, c, H: Math.round(150 + c[1] * 170), rx: 0 }; o.rx = Math.round(o.H * (c[0] < 0.26 ? 0.2 : 0.3)); blit(mkTree(o), x, y, 1, 100, 0, 0, false, 0); x += 132; }
      x = 50; y = 520;
      for (let k = 0; k < 4; k++) { const c = [R(), R(), R(), R()], o = { seed: (R() * 1e9) | 0, c, H: Math.round(26 + c[1] * 28), rx: 0 }; o.rx = Math.round(o.H * 0.6); blit(mkBush(o), x, y, 1, 100, 0, 0, false, 0); x += 70; }
      for (let k = 0; k < 4; k++) { const c = [R(), R(), R(), R()], o = { seed: (R() * 1e9) | 0, c, H: 0, rx: Math.round(8 + c[1] * 30) }; blit(mkRock(o), x, y, 1, 100, 0, 0, false, 0); x += 70; }
      for (let k = 0; k < 4; k++) { const c = [R(), R(), k / 3, R()], o = { seed: (R() * 1e9) | 0, c, H: Math.round(16 + c[1] * 28) }; blit(mkGrass(o, k === 3), x, y, 1, 100, 0, 0, false, 0); x += 50; }
      for (let k = 0; k < 5; k++) { const c = [k / 4.5, R(), R(), R()], o = { seed: (R() * 1e9) | 0, c, H: Math.round(11 + c[1] * 15) }; blit(mkFlower(o), x, y, 1, 100, 0, 0, false, 0); x += 40; }
      for (let k = 0; k < 3; k++) { const c = [R(), 0.4 + R() * 0.6, k / 2.5, R()], o = { seed: (R() * 1e9) | 0, c, H: Math.round(9 + c[1] * 17) }; blit(mkGlowcap(o), x, y, 1, 100, 0, 0, false, 0); x += 46; }
      for (let k = 0; k < 3; k++) { const c = [R(), 0.4 + R() * 0.6, k / 2.5, R()], o = { seed: (R() * 1e9) | 0, c, H: Math.round(12 + c[1] * 26) }; blit(mkCrystal(o), x, y, 1, 100, 0, 0, false, 0); x += 46; }
      out.names.push('flora'); out.frames.push(Uint8ClampedArray.from(px)); out.info.push({ name: 'flora' });
    },
  };
  for (const n of NAMES) { if (SC[n]) SC[n](); else throw new Error('no scene ' + n); }
  return out;
`;

// "no patterns", measured: remove the slow tone (a box mean), then the largest autocorrelation at any lag past 12 px
function patternScore(lum, w, h) {
  const B = 12, hp = new Float32Array(w * h), integ = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let s = 0; for (let x = 0; x < w; x++) { s += lum[y * w + x]; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + s; } }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - B), x1 = Math.min(w, x + B + 1), y0 = Math.max(0, y - B), y1 = Math.min(h, y + B + 1);
    hp[y * w + x] = lum[y * w + x] - (integ[y1 * (w + 1) + x1] - integ[y0 * (w + 1) + x1] - integ[y1 * (w + 1) + x0] + integ[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  let v0 = 0, n0 = 0; for (let i = 0; i < hp.length; i += 3) { v0 += hp[i] * hp[i]; n0++; } v0 /= n0;
  let best = 0, at = [0, 0];
  for (let dy = 0; dy <= Math.min(140, h >> 1); dy += 2) for (let dx = -Math.min(200, w >> 1); dx <= Math.min(200, w >> 1); dx += 2) {
    if (Math.abs(dx) < 12 && dy < 12) continue;
    let s = 0, n = 0;
    for (let y = 0; y < h - dy; y += 3) for (let x = Math.max(0, -dx); x < Math.min(w, w - dx); x += 3) { s += hp[y * w + x] * hp[(y + dy) * w + x + dx]; n++; }
    const r = s / n / v0; if (r > best) { best = r; at = [dx, dy]; }
  }
  return { r: +best.toFixed(3), at };
}

const out = { file, pass: false };
try {
  let code = fs.readFileSync(file, 'utf8');
  { const cf = file.replace(/game\.js$/, 'courses.js'); if (cf !== file && fs.existsSync(cf)) code = fs.readFileSync(cf, 'utf8') + ';' + code; }   // (the real courses, if they are there, as the page loads them)
  out.bytes = code.length;
  if (shotBase) {
    const names = optOf('--scenes', 'tee,fair,green').split(','), scale = +optOf('--scale', '1');
    const r = run(code + '\n;(() => {const NAMES = ' + JSON.stringify(names) + ';\n' + SHOT_LIB + '})()');
    r.frames.forEach((f, k) => fs.writeFileSync(shotBase + '-' + r.names[k] + '.png', encodePng(Math.round(120 * RSH) * 8, Math.round(540 * RSH), f, scale)));
    console.log(JSON.stringify({ shots: r.names.map((n) => shotBase + '-' + n + '.png'), info: r.info }));
    process.exit(0);
  }
  const r = run(code + '\n;' + HOST_PLAY + '\n;' + `(() => {
    const res = { errors: [] };
    const t = () => performance.now();
    // timings from cold: a tile, its light, a chunk
    clearWorld();
    let a = t(); const T = tileAt(0, 0); res.tileMs = +(t() - a).toFixed(1);
    a = t(); tileLight(T); res.tileLightMs = +(t() - a).toFixed(1);
    a = t(); for (let k = 0; k < 4; k++) chunkAt(k & 1, k >> 1); res.chunkColdMs = +((t() - a) / 4).toFixed(1);   // the first four, from a cold start (information: it swings from run to run)
    { let sum = 0, mx = 0, n = 0; for (let cy = 2; cy < 8; cy++) for (let cx = -6; cx < 6; cx++) { const s0 = t(); chunkAt(cx, cy); const dd = t() - s0; if (n >= 24) { sum += dd; if (dd > mx) mx = dd; if (dd > 7) (res.slowChunks = res.slowChunks || []).push([cx, cy, +dd.toFixed(1), tiles.size, ocells.size, treeMemo.size]); } n++; } res.chunkMs = +(sum / (n - 24)).toFixed(1); res.chunkMaxMs = +mx.toFixed(1); }   // then 72 more: the first 24 warm the code up, the rest are measured
    // determinism: the same hole and the same ground twice
    const h1 = JSON.stringify(makeHole(SEED, 1, 0, 0)), c1 = chunkAt(0, 0).col.slice(), l1 = chunkAt(0, 0).lift.slice();
    clearWorld(); const c2 = chunkAt(0, 0);
    res.deterministic = h1 === JSON.stringify(makeHole(SEED, 1, 0, 0)) && c1.every((v, i) => v === c2.col[i]) && l1.every((v, i) => v === c2.lift[i]);
    const o1 = JSON.stringify(cellObjects(3, -2).map((o) => [o.k, o.u, o.v, o.seed])); ocells.clear();
    res.thingsDeterministic = o1 === JSON.stringify(cellObjects(3, -2).map((o) => [o.k, o.u, o.v, o.seed]));
    // a scripted round: stand, walk off the tee, come back, hit, follow the ball, walk on
    newHole(1, 0, 0); aheadOn = false;
    a = t(); firstPicture(); res.firstFrameMs = +(t() - a).toFixed(0);
    let tickT = 0, tickN = 0, renT = 0, renN = 0, maxRen = 0, standT = 0, standN = 0;
    const frame1 = (measure) => { let s = t(); tickGame(); tickT += t() - s; tickN++; s = t(); render(); const d = t() - s; if (measure) { renT += d; renN++; if (d > maxRen) maxRen = d; } return d; };
    { const y0 = camYaw; for (let k = 0; k < 90; k++) { const d = frame1(false); if (k >= 30) { standT += d; standN++; } } camYaw = 0; for (let k = 0; k < 6; k++) frame1(false); let s = 0; for (let k = 0; k < 40; k++) s += frame1(false); res.renderStandStraightMs = +(s / 40).toFixed(2); camYaw = y0; }
    res.renderStandMs = +(standT / standN).toFixed(2);
    keys.KeyW = true; for (let k = 0; k < 240; k++) frame1(true); keys.KeyW = false;   // (straight ahead: since the camera follows the golfer, turning while walking is a turning test, and turning has its own measure below)
    res.renderWalkMs = +(renT / renN).toFixed(2); res.renderWalkMaxMs = +maxRen.toFixed(1);
    player.x = ball.x - 0.3; player.y = ball.y + 0.6; mouse.x = VW / 2 + 200; mouse.y = VH / 2 - 160;
    for (let k = 0; k < 5; k++) frame1(false);
    mouse.down = true; for (let k = 0; k < 50; k++) frame1(false); mouse.down = false;
    renT = 0; renN = 0; maxRen = 0; let flew = 0;
    for (let k = 0; k < 900 && (k < 60 || ball.state !== 0); k++) { frame1(true); if (ball.state === 1) flew++; }
    res.strokes = strokes; res.flightFrames = flew; res.carry = +Math.hypot(ball.x - ball.lx, ball.y - ball.ly).toFixed(1); res.ballRests = ball.state === 0;
    res.renderFlightMs = +(renT / Math.max(1, renN)).toFixed(2); res.renderFlightMaxMs = +maxRen.toFixed(1);
    res.tickMs = +(tickT / tickN).toFixed(3);
    aheadOn = true; { let s = 0, m = 0; for (let k = 0; k < 90; k++) { const d = frame1(false); s += d; if (d > m) m = d; } res.renderWithAheadMs = +(s / 90).toFixed(2); res.renderWithAheadMaxMs = +m.toFixed(1); }
    { const y0 = camYaw; let s = 0, m = 0; for (let k = 0; k < 120; k++) { camYaw += 0.016; const d = frame1(false); s += d; if (d > m) m = d; } res.renderTurningMs = +(s / 120).toFixed(2); res.renderTurningMaxMs = +m.toFixed(1); camYaw = y0; }
    for (const v of [player.x, player.y, ball.x, ball.y, ball.z, camX, camY, camZ]) if (!Number.isFinite(v)) res.errors.push('a NaN in the state');
    // every hole of three courses has a reachable tee and a green; the cup is on the green
    for (const s of [1, 77, 31337]) for (let n = 1; n <= 3; n++) { SEED = s; hole = makeHole(s, n, 0, 0); clearWorld(); if (matAt(hole.pin.x, hole.pin.y) !== M_GREEN) res.errors.push('cup off the green: seed ' + s + ' hole ' + n); if (matAt(0, 0) !== M_TEE) res.errors.push('tee is not tee: seed ' + s + ' hole ' + n); }
    // the look, measured: no repeating pattern on screen
    SEED = 4242; setTime(0); newHole(1, 0, 0); const p = [hole.path[20], hole.path[21]]; player.x = p[0] + 9; player.y = p[1] + 2; camYaw = 0; aimCam(); camZ = groundH(player.x, player.y) + HC; genBudget = 1e9; spriteMax = 999;
    render(); render();
    res.lum = Array.from({ length: VW * VH }, (_, i) => px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11);
    res.mem = { chunks: chunks.size, tiles: tiles.size, cells: ocells.size };
    // host mode (T415): Woodhill handed over by message at true size: answered 'loaded', hole 1 drawn with a tee under the golfer
    { a = t(); hostMessage(hostMsg()); res.hostLoadMs = +(t() - a).toFixed(0);
      const lie = matAt(player.x, player.y); let s = 0; for (let k = 0; k < 30; k++) { const s0 = t(); render(); s += t() - s0; }
      res.host = { answer: hostLast && hostLast.t, holes: hostLast && hostLast.holes, course: course && course.id, scale: course && course.S, hole: holeN, lie: MAT_NAME[lie], renderMs: +(s / 30).toFixed(2) };
      if (!course || course.id !== 'woodhill' || course.S !== 1) res.errors.push('host: Woodhill was not loaded at scale 1');
      if (!hostLast || hostLast.t !== 'loaded' || !course || hostLast.holes !== course.holes.length) res.errors.push('host: no loaded answer');
      if (holeN !== 1 || lie !== M_TEE) res.errors.push('host: hole 1 has no tee under the golfer (' + MAT_NAME[lie] + ')');
      if (!(feats && feats.paths && feats.paths.length)) res.errors.push('host: the features were not applied');
      let lit = 0; for (let i = 0; i < VW * VH; i += 7) if (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2] > 30) lit++; if (lit < VW * VH / 7 * 0.5) res.errors.push('host: the picture is mostly black'); }
    // T424: forty actors (36 people in every pose from 8 to 190 m, 4 carts) in front of the golfer: what drawing them costs a frame, once their sculptures are made
    { const mk = ACT_MAKE; ACT_MAKE = 999; hostMessage(actors40(player.x, player.y, FX, FY)); for (let k = 0; k < 4; k++) render(); ACT_MAKE = mk;
      let drawn = 0; for (const o of dlist) if (o.k === K_ACTOR) drawn++;
      ACT_MS = 0; for (let k = 0; k < 30; k++) render(); res.actors40Ms = +(ACT_MS / 30).toFixed(3); res.actorsDrawn = drawn;
      if (actors.size !== 40) res.errors.push('actors: ' + actors.size + ' kept of 40 sent');
      if (drawn < 30) res.errors.push('actors: only ' + drawn + ' of 40 in view');
      hostMessage({ v: 1, t: 'actors', at: 600, actors: [] }); if (actors.size) res.errors.push('actors: an empty list did not clear them'); }
    // host play (T418 to T420): the turn, the bag, the ring, one input and a wait, the host's shot played back to its rest
    { const hp = hostPlayRun(null); res.hostPlay = hp.info; res.errors.push(...hp.errs); }
    { const hl = hostLieRun(); res.hostLies = hl.info; res.errors.push(...hl.errs); }
    return res;
  })()`);
  const lum = r.lum; delete r.lum;
  Object.assign(out, r);
  // the pattern checker is itself checked on a known fail (a 32 px tile) and a known pass (white noise)
  const W = 960, Hh = 540, tiled = new Float32Array(W * Hh), noise = new Float32Array(W * Hh);
  let s = 12345; const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) | 0) >>> 8) / 16777216;
  const tile = Float32Array.from({ length: 32 * 32 }, rnd);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { tiled[y * W + x] = tile[(y & 31) * 32 + (x & 31)] * 60 + rnd() * 20; noise[y * W + x] = rnd() * 80; }
  out.patternCheckerOnTile = patternScore(tiled, W, Hh).r; out.patternCheckerOnNoise = patternScore(noise, W, Hh).r;
  out.pattern = patternScore(lum, W, Hh);
  const over = [];
  if (r.renderStandMs > BUDGET.renderMs) over.push('render (standing) ' + r.renderStandMs + ' ms > ' + BUDGET.renderMs);
  if (r.tickMs > BUDGET.tickMs) over.push('tick ' + r.tickMs + ' ms > ' + BUDGET.tickMs);
  if (r.chunkMaxMs > BUDGET.chunkMs) over.push('slowest warm chunk ' + r.chunkMaxMs + ' ms > ' + BUDGET.chunkMs);
  if (r.tileMs + r.tileLightMs > BUDGET.tileMs) over.push('tile ' + (r.tileMs + r.tileLightMs) + ' ms > ' + BUDGET.tileMs);
  if (!r.deterministic) over.push('same seed, different ground');
  if (!r.thingsDeterministic) over.push('same seed, different plants');
  if (r.actors40Ms > BUDGET.actors40Ms) over.push('forty actors ' + r.actors40Ms + ' ms > ' + BUDGET.actors40Ms);
  if (!r.ballRests) over.push('the ball never came to rest');
  if (r.strokes !== 1) over.push('the scripted shot did not happen');
  if (!(out.patternCheckerOnTile > 0.5 && out.patternCheckerOnNoise < 0.1)) over.push('the pattern checker failed its own test');
  if (out.pattern.r > 0.2) over.push('a repeating pattern on screen: r ' + out.pattern.r + ' at lag ' + out.pattern.at);
  out.failures = [...r.errors, ...over];
  out.pass = out.failures.length === 0;
} catch (e) {
  out.failures = ['exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)];
}
console.log(JSON.stringify(out));
process.exit(out.pass ? 0 : 1);
