## play Playing a hole
You walk the golfer around the course, to your ball, and hit it. The art comes first; the golf is simple and complete.
R: The camera follows from behind, as in World of Warcraft: W and S walk the golfer forward and back the way he faces, A and D turn him, Q and E step sideways, and whenever he moves the camera swings back behind him. While he stands still the player may turn the camera anywhere.
R: The biome and course type chosen for a course are remembered in the browser and come back when that course is played again; a biome or type in the page's address wins.
R: A golf cart waits near the tee. G gets the golfer into it when he stands beside it and out of it again. It drives like a cart: W goes, S brakes and backs up, A and D steer (less at speed), up to three times walking pace, and the camera swings round behind it as it turns. It keeps off the green, the tee and the bunkers. He must get out to play a shot.
R: A full shot is played like a marksman's: a heartbeat sounds while the power is held, quickening as it builds; on release he holds at the top for a drawn breath; the strike cracks like a rifle; time runs slow for a moment and the camera leaves him to fly behind the ball until it lies still, then cuts back.
R: The wind that bends the grass also pushes a flying ball a little; an arrow on the HUD shows which way it blows.
R: Dragging with the middle mouse button turns the camera round the golfer and looks up and down; Q and E also turn it, the mouse wheel moves it nearer or farther, R and F raise and lower it, C puts it back behind the hole. W always walks away from the camera.
R: WASD or the arrow keys walk the golfer; cliffs, steep rock and deep water stop him; the tee's ramp is the way down.
R: The golfer walks while the ball is at rest; the camera stays behind him and watches the ball fly toward the horizon.
R: Beside the ball the mouse aims at the ground it points at; holding the mouse button swings the club back as the power rises and falls; letting go hits the ball.
R: Four clubs (driver, iron, wedge, putter): the game picks one by the distance and the lie, and keys 1 to 4 pick by hand.
R: The ball flies with gravity, bounces by the ground it lands on, rolls down slopes and slows by its lie; sand stops it, water costs a stroke and returns it.
R: A slow ball at the cup drops in; the next hole starts from behind that green.
R: B drops the ball beside the golfer for one stroke (for a ball that came to rest out of reach).
File: game.js
Check: function updatePlayer(
Check: function updateBall(
Check: function newHole(

````js file=game.js

// ---- play: the golfer, the ball, the clubs
function clubK() { return course ? Math.sqrt(course.S / 0.3) : 1; }   // on a real course every club reaches as much further as the course is bigger than the invented one (0.3): at 0.6 twice as far, its speed up by the root of two; at a host page's full size (1) 3.3 times
const CLUBS = [{ name: 'Driver', v: 31, loft: 0.42 }, { name: 'Iron', v: 24.5, loft: 0.66 }, { name: 'Wedge', v: 16.5, loft: 0.95 }, { name: 'Putter', v: 7.4, loft: 0 }];
//                 water green sand  tee  fair  cut  rough deep woods hill rock cliff shore
const BOUNCE = [0, 0.28, 0.03, 0.36, 0.36, 0.28, 0.16, 0.1, 0.14, 0.3, 0.55, 0.5, 0.05];
const GRIP = [0, 0.25, 0.9, 0.3, 0.3, 0.4, 0.6, 0.7, 0.6, 0.45, 0.2, 0.15, 0.8];      // how much of its speed a landing takes
const DRAG = [0, 1.5, 14, 3, 3, 4.5, 8, 11, 9, 6, 2.5, 0.5, 12];                     // rolling: metres per second lost each second
const LIEPOW = [1, 1, 0.6, 1, 1, 0.95, 0.85, 0.72, 0.78, 0.85, 0.9, 0.9, 0.7];
const keys = {}, mouse = { x: VW / 2, y: VH / 2 - 60, down: false };
const player = { x: 0, y: 0, fa: 4, walk: 0, moving: false, swing: -1, al: 0, th: 0 };   // (th: the way he faces, radians; fa: the same in sixteenths of a turn, for his picture)
const cart = { x: 0, y: 0, fa: 4, on: false, v: 0, th: 0, steer: 0, sf: 0, sr: 0, zc: 0 };   // the golf cart: where it stands, the way it faces (fa in sixteenths, th in radians), whether the golfer is in it, its speed, its steering, how it leans, its height
const ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, state: 0, lx: 0, ly: 0, t: 0 };   // state: 0 at rest, 1 flying, 2 rolling, 3 holed
const aim = { x: 0, y: 0, dx: 1, dy: 0 }, SL = { x: 0, y: 0 }, GP = { x: 0, y: 0 };
let strokes = 0, club = 0, autoClub = true, power = 0, charging = false, chargeT = 0, holeN = 1, doneT = 0, total = 0, tmode = 1;
let camX = 0, camY = 0, camZ = 0, frame = 0;
let camYaw = 0, camD = D0, camHk = 1, FX = 0, FY = -1, RX = 1, RY = 0;   // the camera's turn, its distance behind the golfer, its height factor; its forward and right directions on the ground
let bcam = 0, bcamT = 0, bcamYaw = 0, bcamD = 0, slowT = 0, breathT = 0, heartT = 0;   // the ball camera (on, its last steps, the view to go back to); slow steps left after impact; the held breath; steps to the next heartbeat
function aimCam() { FX = Math.sin(camYaw); FY = -Math.cos(camYaw); RX = Math.cos(camYaw); RY = Math.sin(camYaw); const fx = bcam ? ball.x : player.x, fy = bcam ? ball.y : player.y; camX = fx - FX * camD; camY = fy - FY * camD; }
function ballCam() {   // after a full shot the camera leaves the golfer and flies behind the ball until it lies still, then cuts back
  if (!bcam) return;
  const b = ball, sp = Math.hypot(b.vx, b.vy);
  if (sp > 0.8) { let dy = Math.atan2(b.vx, -b.vy) - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); camYaw += dy * 0.2; }
  camD += ((b.state === 1 ? 6.5 : 9) - camD) * 0.1;
  if ((b.state === 0 || b.state === 3) && ++bcamT > 50) { bcam = 0; camYaw = bcamYaw; camD = bcamD; }
}

// ---- sound, made on the spot (no files): a heartbeat while the shot is charged, a breath drawn in on release, a rifle's crack at impact
let AC = null, noiseBuf = null, humO = null, humG = null;
function audio() {
  if (AC) return AC;
  const A = typeof AudioContext !== 'undefined' ? AudioContext : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null; if (!A) return null;
  try { AC = new A(); } catch (e) { return null; }
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return AC;
}
function thump(f0, f1, dur, vol, when = 0) {   // a falling tone with a quick attack
  const a = audio(); if (!a) return; const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function hiss(type, f0, f1, q, dur, vol, attack, when = 0) {   // noise through a filter that sweeps
  const a = audio(); if (!a) return; const t = a.currentTime + when, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function sndHeart() { thump(64, 38, 0.16, 0.9); thump(54, 34, 0.2, 0.6, 0.17); }                                    // lub-dub
function sndBreath() { hiss('bandpass', 420, 2600, 1.1, 0.42, 0.4, 0.3); }                                           // a breath drawn in
function sndShot() { hiss('lowpass', 9000, 420, 0.7, 0.32, 1, 0.002); thump(170, 36, 0.32, 1); hiss('bandpass', 1300, 260, 0.6, 1.5, 0.22, 0.012, 0.04); }   // the crack, the thump under it, the roll across the land
function sndTap() { thump(880, 520, 0.05, 0.3); }
function sndLand(v) { thump(120, 46, 0.13, Math.min(0.6, 0.1 + v * 0.05)); }
function cartHum() {   // the cart's motor: a low hum that rises with its speed
  const a = AC; if (!a) return;
  if (!cart.on) { if (humO) { humG.gain.setTargetAtTime(0.0001, a.currentTime, 0.08); humO.stop(a.currentTime + 0.4); humO = null; } return; }
  if (!humO) { humO = a.createOscillator(); humG = a.createGain(); humO.type = 'sawtooth'; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; humG.gain.value = 0.0001; humO.connect(f); f.connect(humG); humG.connect(a.destination); humO.start(); }
  const v = Math.abs(cart.v); humO.frequency.setTargetAtTime(48 + v * 11, a.currentTime, 0.06); humG.gain.setTargetAtTime(0.012 + v * 0.004, a.currentTime, 0.08);
}
function behindHole() { camYaw = Math.atan2(hole.dx, -hole.dy); }       // look up the hole
let msgText = '', msgT = 0;
function say(text, steps = 300) { msgText = text; msgT = steps; }

// ---- pressed grass: where the cart's wheels (and, lightly, the golfer's feet) have passed, the grass lies flat and shows a shade darker: two tracks behind the cart.
// Kept by painted chunk, in cells of 4 x 4 ground pixels (0: standing, 255: flat).
const press = new Map();
function pressAt(x, y, amt) {
  const u = Math.floor(x * PPM), v = Math.floor(y * PPV), key = ((u >> 7) + 32768) * 65536 + ((v >> 7) + 32768); let A = press.get(key);
  if (!A) { if (press.size > 700) press.delete(press.keys().next().value); press.set(key, A = new Uint8Array(1024)); }
  const k = (((v & 127) >> 2) << 5) | ((u & 127) >> 2); if (A[k] < amt) A[k] = amt;
}
let pcX = 0, pcY = 0, pcOn = false;
function pressCart(x, y, th) {   // its four wheels, each a tyre's width, laid down all the way from where the cart was a moment ago to where it is now
  const hx = Math.cos(th), hy = Math.sin(th), dx = pcOn ? x - pcX : 0, dy = pcOn ? y - pcY : 0, dl = Math.hypot(dx, dy), n = dl > 3 ? 1 : Math.max(1, Math.ceil(dl / 0.045));   // (stamped only where it stood each moment, a moving cart left a stamp, a gap, a stamp: its tracks came out as stripes across them)
  for (let k = 1; k <= n; k++) { const cx = n > 1 ? pcX + dx * k / n : x, cy = n > 1 ? pcY + dy * k / n : y;
    for (const a of [-0.48, 0.48]) for (const f of [0.71, -0.71]) for (const b of [-0.1, -0.03, 0.04, 0.11]) pressAt(cx - (a + b) * hy + f * hx, cy + (a + b) * hx + f * hy, 255); }
  pcX = x; pcY = y; pcOn = true;
}
function clearWorld() { press.clear(); pcOn = false; preOn = false; bcam = 0; slowT = 0; libWarm = 0; treeMemo.clear(); tiles.clear(); chunks.clear(); ocells.clear(); ftiles.clear(); farQ.length = 0; tileQ.length = 0; tileQset.clear(); lib.clear(); pwAt = 1e9; lastTK = NaN; lastCK = NaN; lastTile = lastChunk = null; }
function newHole(n, ox, oy) {
  holeN = n; if (course) { hole = courseHole(n); ox = hole.tee.x; oy = hole.tee.y; } else hole = makeHole(SEED, n, ox, oy);
  clearWorld(); wkInit();
  ball.x = ball.lx = ox; ball.y = ball.ly = oy; ball.z = groundH(ox, oy); ball.vx = ball.vy = ball.vz = 0; ball.state = 0;
  player.x = ox - hole.ry * 0.9 - hole.rx * 0.6; player.y = oy + hole.rx * 0.9 - hole.ry * 0.6; player.th = Math.atan2(hole.dy, hole.dx); player.fa = ((Math.round(player.th / 6.2832 * 16) % 16) + 16) % 16; player.swing = -1; player.moving = false;   // (he faces down the hole)
  strokes = 0; doneT = 0; charging = false; autoClub = true;
  { cart.on = false; cart.v = 0; cart.fa = Math.round(Math.atan2(hole.ry, hole.rx) / 6.2832 * 16 + 16) % 16; let best = 1e9;   // the cart waits near the foot of the tee's ramp, on the flattest spot there
    const noCart = cartNo;
    for (let k = 0; k < 72; k++) { const al = hole.teeL + 11 + (k % 6) * 1.4, row = (k / 6) | 0, sd = (row & 1 ? -1 : 1) * (3.2 + (row >> 1) * 1.6), x = ox + hole.rx * al - hole.ry * sd, y = oy + hole.ry * al + hole.rx * sd;
      slopeAt(x, y, SL); const sc = Math.hypot(SL.x, SL.y) + noCart(x, y) + noCart(x + 1.6, y) + noCart(x - 1.6, y) + noCart(x, y + 1.6) + noCart(x, y - 1.6) + (row >> 1) * 0.02; if (sc < best) { best = sc; cart.x = x; cart.y = y; } }   // (the nearest flat, allowed spot beside the way off the tee: out to 12 m either side)
    cart.th = cart.fa / 16 * 6.2832; cart.steer = 0; cart.zc = groundH(cart.x, cart.y); }
  behindHole(); aimCam(); camZ = groundH(player.x, player.y) + HC * camHk * camD / D0;
  pn = 0; spawnCreatures();
  if (typeof drawMini === 'function') drawMini();
  say('Hole ' + n + '  -  par ' + hole.par + '  -  ' + Math.round(Math.hypot(hole.pin.x - ox, hole.pin.y - oy)) + ' m', 260);
}
// the course's style (see the biomes): everything made so far is dropped and made again in the new colours
const BIOME_ORDER = ['parkland', 'coastal', 'beachside', 'desert', 'savanna', 'jungle', 'snow'], CTYPE_ORDER = ['links', 'tour', 'private', 'public'];
function useStyle(b, t) { setBiome(b || biomeId, t || ctypeId); styleKeep(); lib.clear(); libWarm = 0; total = 0; newHole(holeN, 0, 0); say(BIOMES[biomeId].name + ' ' + CTYPES[ctypeId].name + ' course', 220); }
function useBiome(id) { useStyle(id, null); }
// the style chosen for each course is kept (localStorage 'cinderlinks.styles': course id, or '-' for the invented course -> [biome, type]) and comes back
// when that course is played again; ?biome= or ?type= in the address wins for the whole visit; in host mode the host says the style, so nothing is kept
let STYLE_URL = false;
const STYLE_KEY = 'cinderlinks.styles';
function styleKeep() { if (HOST) return; try { const all = JSON.parse(localStorage.getItem(STYLE_KEY) || '{}') || {}; all[course ? course.id : '-'] = [biomeId, ctypeId]; localStorage.setItem(STYLE_KEY, JSON.stringify(all)); } catch (e) { /* not kept */ } }
function styleRestore(id) {   // the style kept for course id, put in force; false when none is kept (or the address or the host decides)
  if (STYLE_URL || HOST) return false;
  let s = null; try { s = (JSON.parse(localStorage.getItem(STYLE_KEY) || '{}') || {})[id || '-']; } catch (e) { return false; }
  if (!Array.isArray(s) || !BIOMES[s[0]] || !CTYPES[s[1]]) return false;
  if (s[0] !== biomeId || s[1] !== ctypeId) { setBiome(s[0], s[1]); lib.clear(); libWarm = 0; }
  return true;
}
function dragK(m) { const C = CTYPES[ctypeId]; return m === M_GREEN ? C.greenDrag : m === M_FAIR || m === M_TEE || m === M_CUT ? C.fairDrag : m === M_ROUGH || m === M_DEEP ? C.roughDrag : 1; }   // how the course type's turf holds a rolling ball
function setCourse(id) {   // play a real course (its id), or the invented one (null); false if there is no such course
  if (id && !loadCourse(id)) return false;
  if (!id) course = null;
  styleRestore(course ? course.id : null);   // (the style last chosen for this course)
  total = 0; newHole(1, 0, 0); shownClub = -2;   // (the clubs' reach differs on a real course: the tabs are written again)
  if (course) say(course.name + (course.place ? ', ' + course.place : '') + '  -  hole 1, par ' + hole.par, 360);
  return true;
}
function nextCourse() { const L = courseList(), k = course ? L.findIndex((c) => c.id === course.id) : -1; setCourse(k + 1 < L.length ? L[k + 1].id : null); }
function cartNo(x, y) { const m = matAt(x, y); return m === M_WATER || m === M_CLIFF || m === M_SAND || m === M_TEE || m === M_GREEN ? 9 : 0; }   // ground a cart may not stand on (it keeps off tees and greens itself: parked on one, it could not leave)
function jumpToBall() {   // J: the golfer is set down beside his ball, facing the pin, the camera behind him; the cart is brought along and parked near by
  if (ball.state !== 0 || player.swing >= 0 || charging || bcam) { say('Wait for the ball to lie still', 90); return; }
  const H = hole, dx = H.pin.x - ball.x, dy = H.pin.y - ball.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, p = player;
  cart.on = false; cart.v = 0;
  for (const [a, b] of [[-0.9, 0.75], [-0.9, -0.75], [-1.3, 0], [0.9, 0.9]]) { const x = ball.x + ux * a - uy * b, y = ball.y + uy * a + ux * b; if (matAt(x, y) !== M_WATER) { p.x = x; p.y = y; break; } }
  p.th = Math.atan2(uy, ux); p.fa = ((Math.round(p.th / 6.2832 * 16) % 16) + 16) % 16; p.moving = false;
  camYaw = p.th + 1.5708; aimCam(); camZ = groundH(p.x, p.y) + HC * camHk * camD / D0;
  let best = 1e9;                                                      // the cart: the flattest allowed spot four to nine metres behind or beside him
  for (let k = 0; k < 40; k++) { const an = p.th + 1.6 + (k % 10) * 0.35, rr = 4.5 + ((k / 10) | 0) * 1.5, x = ball.x + Math.cos(an) * rr, y = ball.y + Math.sin(an) * rr; slopeAt(x, y, SL);
    const sc = Math.hypot(SL.x, SL.y) + cartNo(x, y) + cartNo(x + 1.6, y) + cartNo(x - 1.6, y) + cartNo(x, y + 1.6) + cartNo(x, y - 1.6) + rr * 0.01; if (sc < best) { best = sc; cart.x = x; cart.y = y; } }
  cart.th = p.th; cart.fa = p.fa; cart.steer = 0; cart.zc = groundH(cart.x, cart.y);
}
function nearBall() { return ball.state === 0 && Math.hypot(player.x - ball.x, player.y - ball.y) < 1.5; }
function pickClub() {
  if (HP) return;                                                      // (host mode: the host suggests the club)
  const d = Math.hypot(hole.pin.x - ball.x, hole.pin.y - ball.y) / (clubK() * clubK()), m = matAt(ball.x, ball.y);   // (measured in the clubs' own reach)
  club = m === M_GREEN ? 3 : m === M_SAND ? 2 : d > 62 ? 0 : d > 26 ? 1 : d > 9 || m !== M_CUT ? 2 : 3;
}
function screenToGround(sx, sy, o) {   // the ground point under a screen pixel: walk out along that pixel's ray until the land rises to its row
  const kx = (sx + 0.5 - VW / 2) / FOC, ax = FX + RX * kx, ay = FY + RY * kx;
  let d = 3;
  for (; d < 220; d += Math.max(0.05, d * d / (FOC * 4.5))) if (HZ - (groundH(camX + ax * d, camY + ay * d) - camZ) * FOC / d <= sy) break;
  o.x = camX + ax * d; o.y = camY + ay * d;
}
const SLC = { x: 0, y: 0 };
function canStand(x, y, x0, y0) {
  const h1 = groundH(x, y), h0 = groundH(x0, y0), d = Math.hypot(x - x0, y - y0) || 1, ha = groundH(x0 + (x - x0) / d * 0.5, y0 + (y - y0) / d * 0.5);   // (ha: the ground half a metre on)
  if (ha - h0 > 0.65) return false;                                     // a bank or a wall ahead: too steep to climb
  if (h0 - ha > 1.5) { slopeAt(x0, y0, SLC); if (Math.hypot(SLC.x, SLC.y) < 1) return false; }   // a drop ahead: he does not step off a cliff; but one who already stands on a steep face may always go down it (he is never trapped there)
  return !(matAt(x, y) === M_WATER && h1 < wlAt(x, y) - 0.12);   // only the pond itself is water: low ground elsewhere is just low ground
}
function rideCart() {                                                // G: into the cart when beside it, out of it when in it
  const p = player;
  if (cart.on) { for (const sd of [-1, 1, -2, 2]) { const a = cart.th, x = cart.x - Math.sin(a) * sd * 1.3, y = cart.y + Math.cos(a) * sd * 1.3; if (canStand(x, y, cart.x, cart.y)) { p.x = x; p.y = y; break; } } cart.on = false; cart.v = 0; p.th = cart.th; }
  else if (p.swing < 0 && !charging && Math.hypot(p.x - cart.x, p.y - cart.y) < 3.2) { cart.on = true; p.x = cart.x; p.y = cart.y; p.moving = false; }
  else say('The cart is ' + Math.round(Math.hypot(p.x - cart.x, p.y - cart.y)) + ' m away', 120);
}
function driveCart() {   // W goes, S brakes and backs up, A and D steer; the camera swings round behind it; it keeps off greens, tees, bunkers and water
  const p = player;
  const go = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), turn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  p.moving = false;
  cart.steer += (turn * 0.5 / (1 + Math.abs(cart.v) * 0.18) - cart.steer) * 0.18;   // (the faster it goes, the less the wheels turn)
  if (go > 0) cart.v = Math.min(13, cart.v + 0.16); else if (go < 0) cart.v = Math.max(-4, cart.v - (cart.v > 0 ? 0.4 : 0.1)); else { cart.v *= 0.965; if (Math.abs(cart.v) < 0.05) cart.v = 0; }
  if (cart.v === 0) return;
  pressCart(p.x, p.y, cart.th);
  cart.th += cart.v / 60 * Math.tan(cart.steer) / 1.43;              // (the wheels are 1.43 m apart, front to back)
  const wx = Math.cos(cart.th), wy = Math.sin(cart.th), sp = cart.v / 60, nx = p.x + wx * sp, ny = p.y + wy * sp, m = matAt(nx, ny);
  cart.fa = p.fa = ((Math.round(cart.th / 6.2832 * 16) % 16) + 16) % 16;
  const m0 = matAt(p.x, p.y);
  if ((m === M_GREEN || m === M_SAND || m === M_TEE) && m0 !== M_GREEN && m0 !== M_SAND && m0 !== M_TEE) { cart.v = 0; if (msgT <= 0) say(   // (a cart that somehow stands on such ground may always drive off it)
   m === M_SAND ? 'No carts in the bunker' : 'Carts keep off the ' + (m === M_GREEN ? 'green' : 'tee'), 120); return; }
  if (canStand(nx, ny, p.x, p.y)) { p.x = nx; p.y = ny; } else if (canStand(nx, p.y, p.x, p.y)) { p.x = nx; cart.v *= 0.9; } else if (canStand(p.x, ny, p.x, p.y)) { p.y = ny; cart.v *= 0.9; } else cart.v = 0;
  cart.x = p.x; cart.y = p.y;
  if (Math.abs(cart.v) > 0.6 && !camDrag) { let dy = cart.th + 1.5708 - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); camYaw += dy * 0.07 * Math.min(1, Math.abs(cart.v) / 4); }   // the camera swings round behind the cart as it turns
  if (cart.v > 6 && (frame & 3) === 0) { const mm = matAt(p.x, p.y); if (mm === M_HILL || mm === M_MUD || mm === M_ROCK) addParticle(P_SAND, p.x - wx * 0.8, p.y - wy * 0.8, groundH(p.x, p.y) + 0.05, -wx * 0.6 + (rnd() - 0.5) * 0.6, -wy * 0.6 + (rnd() - 0.5) * 0.6, 0.6 + rnd() * 0.8, 18 + rndi(14), rndi(6)); }   // dust on bare ground
}
function aimToMouse() {   // the aim is the ground point under the mouse: the line from the ball to it, and the point itself (T456: the target the ring is drawn at)
  screenToGround(mouse.x, mouse.y, GP);
  let dx = GP.x - ball.x, dy = GP.y - ball.y; const l = Math.hypot(dx, dy);
  if (l > 0.3) { aim.dx = dx / l; aim.dy = dy / l; }
  aim.x = GP.x; aim.y = GP.y;
}
function updatePlayer() {
  const p = player;
  if (cart.on) { driveCart(); return; }
  if (HP && hostSwing(p)) return;                                     // (host mode: the hold-and-release swing, T421 and T446)
  if (HP && hostAimPin && !nearBall()) hostAimPin = false;            // (walked away from the ball: the aim follows the mouse again)
  if (p.swing >= 0) {                                                  // the swing plays out; the ball leaves as the club passes it
    if (breathT > 0) { breathT--; return; }                              // (held at the top while the breath is drawn)
    const before = p.al; p.al += 0.34; p.swing++;
    if (before < 0 && p.al >= 0) strike();
    if (p.al > 2.2) { p.al = 2.2; if (p.swing > 34) p.swing = -1; }
    return;
  }
  const near = nearBall();
  if (near && ball.state === 0 && !(HP && hostBusy())) {               // (host mode: not while the course decides, or plays back, a shot)
    if (!HP || !hostAimPin || mouse.down) {                            // (host mode, T446: a click on the course sets the aim and holds it, so the mouse can go to the swing button)
      aimToMouse();
      if (HP && mouse.down) hostAimPin = true;
    }
    if (autoClub) pickClub();
    if (mouse.down && !charging && !HP) { charging = true; chargeT = 0; }
  }
  if (charging) {
    if (!near) { charging = false; return; }
    chargeT++; power = 0.5 - 0.5 * Math.cos(chargeT * 0.055);
    if (--heartT <= 0) { sndHeart(); heartT = Math.round(50 - 24 * power); }   // the heart beats, faster as the power builds
    const fx = -aim.dy, fy = aim.dx;                                   // he stands side-on: the target is to his left
    p.x += (ball.x - fx * 0.64 - p.x) * 0.3; p.y += (ball.y - fy * 0.64 - p.y) * 0.3;
    p.th = Math.atan2(fy, fx); p.fa = Math.round(p.th / 6.2832 * 16 + 16) % 16;
    p.al = -2 * power; p.moving = false;
    if (!mouse.down) { charging = false; p.swing = 0; heartT = 0; if (!puttNow()) { breathT = 18; sndBreath(); } }
    return;
  }
  if (ball.state === 1 || ball.state === 2 || ball.state === 3) { p.moving = false; return; }
  const fwd = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), turn = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), side = (keys.KeyE ? 1 : 0) - (keys.KeyQ ? 1 : 0);
  p.moving = false;
  if (!fwd && !turn && !side) return;
  if (turn) { p.th += turn * 0.045; p.fa = ((Math.round(p.th / 6.2832 * 16) % 16) + 16) % 16; }      // A and D turn him
  if (!camDrag) { let dy = p.th + 1.5708 - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); camYaw += dy * 0.12; }   // the camera swings back behind him whenever he moves
  if (!fwd && !side) return;
  const hx = Math.cos(p.th), hy = Math.sin(p.th), l = fwd && side ? 0.7071 : 1, sp = (fwd < 0 ? 2.6 : keys.ShiftLeft ? 7.5 : 4.6) / 60;   // (backward is a slower walk)
  const wx = (hx * fwd - hy * side) * l, wy = (hy * fwd + hx * side) * l, nx = p.x + wx * sp, ny = p.y + wy * sp;
  if (canStand(nx, ny, p.x, p.y)) { p.x = nx; p.y = ny; p.moving = true; pressAt(nx, ny, 110); }
  else if (Math.abs(wx) > 0.2 && canStand(nx, p.y, p.x, p.y)) { p.x = nx; p.moving = true; }
  else if (Math.abs(wy) > 0.2 && canStand(p.x, ny, p.x, p.y)) { p.y = ny; p.moving = true; }
  if (p.moving) p.walk += keys.ShiftLeft && fwd > 0 ? 0.3 : 0.2;
}
function strike() {
  if (HP) { hostStrike(); return; }                                   // (host mode: the host decides the shot: hostStrike sends the input)
  const c = CLUBS[club], m = matAt(ball.x, ball.y), sp = c.v * clubK() * (0.22 + 0.78 * power) * (club === 2 && m === M_SAND ? 0.85 : club === 3 ? 1 : LIEPOW[m]);
  ball.lx = ball.x; ball.ly = ball.y; strokes++; total++;
  ball.vx = aim.dx * sp * Math.cos(c.loft); ball.vy = aim.dy * sp * Math.cos(c.loft); ball.vz = sp * Math.sin(c.loft); prewarmShot();
  ball.state = c.loft > 0 ? 1 : 2; ball.t = 0; ball.z = groundH(ball.x, ball.y) + (c.loft > 0 ? 0.02 : 0);
  if (c.loft > 0 && sp > 12) { sndShot(); bcam = 1; bcamT = 0; bcamYaw = camYaw; bcamD = camD; slowT = 30; } else sndTap();   // a full shot: the crack, a moment of slow time, and the camera goes with the ball
  const n = club === 3 ? 3 : 10 + ((power * 14) | 0);
  for (let k = 0; k < n; k++) {                                        // sparks off the club, and turf or sand
    addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, aim.dx * (1 + rnd() * 3) + (rnd() - 0.5) * 2, aim.dy * (1 + rnd() * 3) + (rnd() - 0.5) * 2, 1 + rnd() * 3, 16 + rndi(18), 0);
    if (club !== 3) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, ball.z + 0.05, aim.dx * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, aim.dy * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, 1.5 + rnd() * 2.5, 30 + rndi(30), rndi(6));
  }
}
function splash(x, y, z, n) { for (let k = 0; k < n; k++) addParticle(P_DROP, x, y, z, (rnd() - 0.5) * 2.6, (rnd() - 0.5) * 2.6, 1.5 + rnd() * 3.2, 30 + rndi(40), 0); }
function ballRest() {
  ball.state = 0; ball.vx = ball.vy = ball.vz = 0; ball.z = groundH(ball.x, ball.y); autoClub = true;
}
function updateBall() {
  if (HP) { hostTick(); return; }                                     // (host mode: the ball only plays back the host's shot)
  const b = ball, dt = (slowT > 0 ? 0.3 : 1) / 60;
  if (slowT > 0) slowT--;
  if (b.state === 0 || b.state === 3) return;
  b.t++;
  if (b.state === 1) {
    b.vz -= 9.81 * dt; b.vx *= 0.9986; b.vy *= 0.9986;
    b.vx += WDX * WIND * 0.9 * dt; b.vy += WDY * WIND * 0.9 * dt;   // the wind leans on a flying ball
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (tmode > 0 && (b.t & 1)) addParticle(P_EMBER, b.x, b.y, b.z, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0.2, 16 + rndi(14), 1);
    const gh = groundH(b.x, b.y);
    if (b.z > gh) return;
    const m = matAt(b.x, b.y);
    if (m === M_WATER) return drown();
    slopeAt(b.x, b.y, SL);
    const nl = 1 / Math.hypot(SL.x, SL.y, 1), nx = -SL.x * nl, ny = -SL.y * nl, nz = nl, vn = b.vx * nx + b.vy * ny + b.vz * nz;
    if (vn < 0) { const e = 1 + BOUNCE[m]; b.vx -= e * vn * nx; b.vy -= e * vn * ny; b.vz -= e * vn * nz; const g = 1 - GRIP[m] * 0.6; b.vx *= g; b.vy *= g; }
    b.z = gh + 0.001;
    const hard = Math.min(12, (Math.abs(vn) * 1.6) | 0); if (hard > 2) sndLand(hard);
    for (let k = 0; k < hard; k++) addParticle(m === M_SAND ? P_SAND : m === M_ROCK || m === M_CLIFF ? P_SPARK : P_TURF, b.x, b.y, gh + 0.04, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4, 0.8 + rnd() * 2, 20 + rndi(24), rndi(6));
    if (b.vz < 1.1) { b.state = 2; b.vz = 0; }
    return;
  }
  slopeAt(b.x, b.y, SL);
  const m = matAt(b.x, b.y), fr = DRAG[m] * dragK(m), z0 = b.z;
  b.vx -= 9.81 * 0.62 * SL.x * dt; b.vy -= 9.81 * 0.62 * SL.y * dt;
  const sp = Math.hypot(b.vx, b.vy), ns = Math.max(0, sp - fr * dt);
  if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
  b.x += b.vx * dt; b.y += b.vy * dt;
  const gh = groundH(b.x, b.y);
  if (z0 - gh > 0.2) { b.state = 1; b.vz = 0; return; }                // it rolled off a ledge
  b.z = gh;
  if (matAt(b.x, b.y) === M_WATER && wlAt(b.x, b.y) - gh > 0.06) return drown();
  if (m === M_GREEN && ns < 3.4 && Math.hypot(b.x - hole.pin.x, b.y - hole.pin.y) < 0.2) return holed();
  if ((ns < 0.07 && Math.hypot(SL.x, SL.y) * 9.81 * 0.62 < fr) || b.t > 1500) ballRest();
}
function drown() {
  splash(ball.x, ball.y, wlAt(ball.x, ball.y), 26);
  ball.x = ball.lx; ball.y = ball.ly; ballRest(); strokes++; total++;
  say('Water: one stroke, and the ball is back where you played it', 260);
}
// a gimme: the ball lies still on the green within a short putt of the hole; the putt is given (one stroke) and the hole is done
const GIMME = 1.5;
function canGimme() { if (HP) return hostCanGimme(); return ball.state === 0 && !bcam && !doneT && strokes > 0 && Math.hypot(ball.x - hole.pin.x, ball.y - hole.pin.y) < GIMME && matAt(ball.x, ball.y) === M_GREEN; }
function gimme() { if (HP) { hostGimme(); return; } if (!canGimme()) return; strokes++; total++; holed(); }
function holed() {
  ball.state = 3; ball.x = hole.pin.x; ball.y = hole.pin.y; doneT = 1;
  const d = strokes - hole.par, name = strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : '+' + d;
  say(name + '  -  hole ' + holeN + ' in ' + strokes, 330);
  for (let k = 0; k < 120; k++) addParticle(k & 1 ? P_SPARK : P_EMBER, hole.pin.x, hole.pin.y, ball.z + 0.1, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 2 + rnd() * 5, 40 + rndi(70), rndi(4));
}
function dropBall() {
  if (HP) { say('The course decides where the ball lies', 120); return; }
  if (ball.state !== 0 || player.swing >= 0) return;
  ball.x = player.x + 0.5; ball.y = player.y + 0.35; ballRest(); strokes++; total++; say('Dropped: one stroke', 160);
}

// ---- particles (Cinderdeep's pool, now in metres above the ground) and the small life of the course
const MAXP = 900, P_SPARK = 1, P_EMBER = 2, P_DROP = 3, P_SPORE = 4, P_GLINT = 5, P_LEAF = 6, P_SAND = 7, P_TURF = 8, P_MOTE = 9;
const PX = new Float32Array(MAXP), PY = new Float32Array(MAXP), PZ = new Float32Array(MAXP), PVX = new Float32Array(MAXP), PVY = new Float32Array(MAXP), PVZ = new Float32Array(MAXP);
const PK = new Uint8Array(MAXP), PL = new Uint8Array(MAXP), PM = new Uint8Array(MAXP);
let pn = 0;
function addParticle(kind, x, y, z, vx, vy, vz, life, m) {
  const n = pn < MAXP ? pn++ : rndi(MAXP);
  PX[n] = x; PY[n] = y; PZ[n] = z; PVX[n] = vx; PVY[n] = vy; PVZ[n] = vz; PK[n] = kind; PL[n] = life > 255 ? 255 : life; PM[n] = m;
}
function updateParticles() {
  const dt = 1 / 60;
  for (let n = pn - 1; n >= 0; n--) {
    const kind = PK[n], l = PL[n] - 1;
    let dead = l <= 0;
    if (!dead && kind !== P_GLINT) {
      if (kind === P_SPARK || kind === P_DROP || kind === P_SAND || kind === P_TURF) PVZ[n] -= 9.81 * dt;
      else if (kind === P_EMBER) { PVZ[n] = PVZ[n] * 0.95 + 0.012; PVX[n] = PVX[n] * 0.94 + (rnd() - 0.5) * 0.1; PVY[n] = PVY[n] * 0.94 + (rnd() - 0.5) * 0.1; }
      else if (kind === P_SPORE || kind === P_MOTE) { PVX[n] = PVX[n] * 0.97 + (rnd() - 0.5) * 0.03; PVY[n] = PVY[n] * 0.97 + (rnd() - 0.5) * 0.02; PVZ[n] = PVZ[n] * 0.97 + (rnd() - 0.48) * 0.02; }
      else if (kind === P_LEAF) { PVX[n] = -0.35 + Math.sin(l * 0.11 + n) * 0.5; PVY[n] = 0.12; PVZ[n] = -0.42 + Math.cos(l * 0.13 + n) * 0.12; }
      PX[n] += PVX[n] * dt; PY[n] += PVY[n] * dt; PZ[n] += PVZ[n] * dt;
      if (kind !== P_EMBER && kind !== P_SPORE && kind !== P_MOTE && PZ[n] < groundH(PX[n], PY[n])) dead = true;
    }
    if (dead) { const last = --pn; if (n !== last) { PX[n] = PX[last]; PY[n] = PY[last]; PZ[n] = PZ[last]; PVX[n] = PVX[last]; PVY[n] = PVY[last]; PVZ[n] = PVZ[last]; PK[n] = PK[last]; PL[n] = PL[last]; PM[n] = PM[last]; } }
    else PL[n] = l;
  }
}
// fireflies at dusk, butterflies by day: a few always near the golfer
const MAXC = 26, CX = new Float32Array(MAXC), CY = new Float32Array(MAXC), CZ = new Float32Array(MAXC), CA = new Float32Array(MAXC), CS = new Uint8Array(MAXC);
function placeCreature(k, far) {
  const a = rnd() * 6.283, d = (far ? 9 : 2) + rnd() * 9;
  CX[k] = player.x + Math.cos(a) * d; CY[k] = player.y + Math.sin(a) * d * 1.3; CZ[k] = 0.4 + rnd() * 1.4; CA[k] = rnd() * 6.283; CS[k] = rndi(250);
}
function spawnCreatures() { for (let k = 0; k < MAXC; k++) placeCreature(k, false); }
function updateCreatures() {
  for (let k = 0; k < MAXC; k++) {
    CA[k] += (rnd() - 0.5) * 0.5;
    const sp = tmode >= 2 ? 0.012 : 0.03;
    CX[k] += Math.cos(CA[k]) * sp; CY[k] += Math.sin(CA[k]) * sp; CZ[k] = clamp(CZ[k] + (rnd() - 0.5) * 0.03, 0.3, 2.2);
    if (Math.abs(CX[k] - player.x) > 13 || Math.abs(CY[k] - player.y) > 15) placeCreature(k, true);
  }
}
let visObjs = [];
function ambienceTick() {   // glowcaps shed spores, crystals twinkle, trees drop a leaf now and then, motes drift in the low sun
  const n = visObjs.length;
  if (n) for (let k = 0; k < 5; k++) {
    const o = visObjs[rndi(n)], x = o.u / PPM, y = o.v / PPV, z = o.lift / ZP;
    if (o.k === K_GLOW && tmode > 0 && rnd() < 0.5) addParticle(P_SPORE, x + (rnd() - 0.5) * 0.2, y, z + o.H / ZP, (rnd() - 0.5) * 0.1, 0, 0.1 + rnd() * 0.15, 110 + rndi(120), Math.min(2, (o.c[2] * 3) | 0));
    else if (o.k === K_CRYSTAL && rnd() < 0.4) addParticle(P_GLINT, x + (rnd() - 0.5) * o.H / PPM, y, z + rnd() * o.H / ZP, 0, 0, 0, 10 + rndi(8), Math.min(2, (o.c[2] * 3) | 0));
    else if (o.k === K_TREE && rnd() < (o.c[2] > 0.55 ? 0.3 : 0.06)) addParticle(P_LEAF, x + (rnd() - 0.5) * o.rx * 1.6 / PPM, y + 0.05, z + o.H * (0.45 + rnd() * 0.4) / ZP, 0, 0, 0, 240, o.c[2] > 0.84 ? 2 : o.c[2] > 0.55 ? 1 : 0);
  }
  if (tmode < 2 && rnd() < 0.35) addParticle(P_MOTE, player.x + (rnd() - 0.5) * 16, player.y + (rnd() - 0.5) * 18, groundH(player.x, player.y) + 0.3 + rnd() * 2, (rnd() - 0.5) * 0.1, 0, 0, 180 + rndi(70), 0);
}
````
