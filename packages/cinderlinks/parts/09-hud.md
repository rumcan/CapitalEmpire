## hud The HUD
The frame keeps Cinderdeep's HUD manner: a card of facts, the clubs as a row of tabs, a power bar, a message line, and a small map of the hole.
R: The card shows the hole, par, strokes (and the score against par), the round, the distance to the pin, the lie and the light.
R: Each club's tab shows how far it carries. A wind arrow shows the wind as the camera sees it and turns gold while a gust is on the golfer.
R: One line of hints says what can be done right now; H opens the full list of keys.
R: The map shows the hole from above with the tee, the pin, the ball and the golfer.
R: #1327 (the owner, 2026-11-15), host mode: the hole's map stands at the top right under CapitalEmpire's buttons, folded HUD or not: the whole hole, tee at the bottom and the green at the top, its fairway, rough, bunkers, water and trees painted once a hole; over it the ball (white), the aim ring's centre (HP.target, a gold ring) with a thin line from the ball, the pin and the others of the group, redrawn only when one moves a pixel. A click folds it to a small pill (kept in cinderlinks.map); the wind and the shot panel keep clear of it.
File: game.js
Check: function updateHud(
R: J5b: in host mode a CapitalEmpire card covers the picture from the course's coming until the pictures it opens on are in (the tree species within the render distance of the tee, his golfer's clips), at most 20 s; every other species is fetched at once behind it, and nothing stands in for a picture still loading.
Check: function drawMini(
Check: function coverTick(

````js file=game.js

// ---- hud
const $ = (id) => document.getElementById(id);
const cardEl = $('card'), clubsEl = $('clubs'), msgEl = $('msg'), powerEl = $('power'), powerBar = $('powerBar'), powerTxt = $('powerTxt'), miniEl = $('mini'), mctx = miniEl.getContext('2d');
const windEl = $('wind'), windArrow = $('windArrow'), windTxt = $('windTxt'), keysEl = $('keys'), helpEl = $('help'), jumpEl = $('jump');
const cardLine = $('cardLine'), cardRead = $('cardRead'), cardMore = $('cardMore'), cornerEl = $('corner');   // (2026-11-15: the card's pill line, its break on the green, its facts; the bottom right corner's buttons)
const aimEl = document.createElement('div'); aimEl.id = 'aimd'; let aimShown = '';   // J5f: the aim's distance, above the club box (hostAimRead); the box's own tabs are rewritten with the club, updateHud puts this back
jumpEl.addEventListener('click', (e) => { jumpToBall(); if (e.preventDefault) e.preventDefault(); if (jumpEl.blur) jumpEl.blur(); });
let helpOn = false, shownKeys = '', shownWind = '';
// the panels are folded away until asked for: only the hole's line, the club in hand and the messages stay. A click on the card or U opens and folds them; the choice is kept.
const gimmeEl = $('gimme'); gimmeEl.addEventListener('click', (e) => { gimme(); if (e.preventDefault) e.preventDefault(); if (gimmeEl.blur) gimmeEl.blur(); });
// the course's style: a button at the top of the picture; its menu lists the course types and the biomes side by side (M steps through them too)
const styleBtn = $('styleBtn'), styleMenu = $('styleMenu'); let shownStyle = '';
let shownType = '';
// T448: the Picture section: the cinematic amount (the painted look and the calm are always on, the calm at full: the owner, 2026-11-13) (parts/09b-postfx.md); without WebGL2 it says so
const PIC_IN = { picCine: ['cine', 0.01, () => Math.round(PIC.cine * 100) + '%'] };
function picMenu() {
  if (!PFX) return '<div class="grp dist"><i>Picture</i><em>The painted look needs WebGL2: the plain picture is shown.</em></div>';
  return '';   // (the owner, 2026-11-13: the cinematic finish hid the ball on the green: it is off, and the Picture section has nothing left to set)
}
function styleShow() {   // the menu: the biome (the land and its plants) beside the course type (how the course is kept); one of each is in force
  shownStyle = biomeId; shownType = ctypeId; styleBtn.innerHTML = '&#9881;'; styleBtn.title = 'Settings';   // (the owner, 2026-11-13: the button is Settings; the biome and type are chosen in its menu. 2026-11-15: a small gear in the bottom right corner)
  const col = (title, kind, ids, T, cur) => '<div class="grp"><i>' + title + '</i>' + ids.map((id) => '<button type="button" data-kind="' + kind + '" data-id="' + id + '"' + (id === cur ? ' class="on"' : '') + '>' + T[id].name + '</button>').join('') + '</div>';
  // T447: inside the game the biome and the course type are the course's own (the host sends them): those two columns go; the trees, the picture and the render distance stay
  styleMenu.innerHTML = (HOST ? '' : col('Biome', 'b', BIOME_ORDER, BIOMES, biomeId) + col('Course type', 't', CTYPE_ORDER, CTYPES, ctypeId) + golferCol())   // (T450: the golfer, without a host)
    + picMenu()
    + '<div class="grp dist"><i>Render distance</i><input id="detail" type="range" min="150" max="400" step="25" value="' + VIEWR + '"><span id="detailV">' + VIEWR + ' m</span><em>How far the land, trees and grass are drawn. Higher needs a faster PC.</em></div>';
}
styleBtn.addEventListener('click', (e) => { styleMenu.className = styleMenu.className === 'on' ? '' : 'on'; if (styleBtn.blur) styleBtn.blur(); if (e.preventDefault) e.preventDefault(); });
for (const b of [styleBtn, keysEl]) if (b && b.addEventListener) b.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });   // (a click never leaves the keyboard on a button: Space swings)
styleMenu.addEventListener('click', (e) => { const t = e.target, id = t && t.getAttribute ? t.getAttribute('data-id') : null, kind = id ? t.getAttribute('data-kind') : null; if (!id) return;
  if (HOST) return;   // (T447: in the game the biome and course type are the course's)
  if (kind === 'b' && BIOMES[id] && id !== biomeId) { useStyle(id, null); firstPicture(); } else if (kind === 't' && CTYPES[id] && id !== ctypeId) { useStyle(null, id); firstPicture(); } else if (kind === 'g') golferPick(id);
  styleShow(); });   // (the menu stays open: a biome and a type are usually chosen together)
styleMenu.addEventListener('input', (e) => { const t = e.target; if (t && PIC_IN[t.id]) { const [k, f, sh] = PIC_IN[t.id]; picSet(k, +t.value * f); const v = document.getElementById(t.id + 'V'); if (v) v.textContent = sh(); return; } if (!t || t.id !== 'detail') return; setDetail(+t.value); const v = document.getElementById('detailV'); if (v) v.textContent = VIEWR + ' m'; });
try { localStorage.removeItem('cinderlinks.treeart'); } catch (e) { /* nothing kept */ }   // (T454: the Trees setting is gone: a host's trees are always its pictures)
try { const d0 = +localStorage.getItem('cinderlinks.view'); if (d0) setDetail(d0); } catch (e) {}   // (T447: the simple grass is the only grass: no choice kept)
// 2026-11-15 (the owner: "Stuff should be collapsed"): the card is a pill (the hole, par, the way to the pin, the shot, the wind); a click on it, or U, opens its
// facts under it, and the choice is kept (cinderlinks.card). Nothing else folds with it: the rest of the HUD is small already, and its panels open on their own buttons.
const hudEl = $('hud'); let cardOpen = false;
try { cardOpen = localStorage.getItem('cinderlinks.card') === 'open'; } catch (e) {}
function setUi(min) { cardOpen = !min; cardEl.className = cardOpen ? 'open' : ''; try { localStorage.setItem('cinderlinks.card', cardOpen ? 'open' : 'pill'); } catch (e) {} }
cardEl.className = cardOpen ? 'open' : ''; cardEl.title = 'Click, or press U: the hole\'s facts';
cardEl.addEventListener('click', () => setUi(cardOpen));
const HELP = [['W S', 'walk forward, back (shift: run)'], ['A D', 'turn'], ['Q E', 'step sideways'], ['mouse', 'aim, beside the ball'], ['hold click', 'power, let go to swing'], ['up (holding the swing)', 'tap fast for boost (or W); let go at the peak'], ['arrows (ball in the air)', 'spin: down back, up top, left and right side; the opposite arrow takes it off'], ['1-9 or [ ]', 'club (or the arrows on the club picker; the wheel over it)'], ['J', 'jump to the ball'], ['Y', 'take a gimme (a short putt, given)'], ['M', 'biome: parkland, coastal, beachside, desert, savanna, jungle, snow'], ['V', 'course type: links, tour, private, public'], ['U', 'the hole card: open or fold'], ['P', 'picture scale: 75, 50, 100%'], ['G', 'golf cart: in and out (W S go and brake, A D steer)'], ['middle drag', 'look around (the camera comes back behind you when you move)'], ['wheel', 'zoom: nearer, farther'], ['R F', 'raise, lower the camera'], ['C', 'camera behind the hole'], ['B', 'drop the ball by you'], ['T', 'time of day'], ['N', 'new land'], ['K', 'real courses: next'], ['L', 'find a real course by name'], ['H', 'hide this']];
if (!CART_SHOWN) { const gi = HELP.findIndex((h) => h[0] === 'G'); if (gi >= 0) HELP.splice(gi, 1); }   // (the cart is hidden for now: 08i-cart.md)
helpEl.innerHTML = HELP.map((h) => '<b>' + h[0] + '</b>' + h[1]).join('\n');
function helpShow(on) { helpOn = on; helpEl.className = on ? 'on' : ''; keysEl.className = on ? 'on' : ''; }
keysEl.innerHTML = '?'; keysEl.addEventListener('click', (e) => { helpShow(!helpOn); if (keysEl.blur) keysEl.blur(); if (e.preventDefault) e.preventDefault(); });
const MINI = [[42, 105, 160], [98, 190, 116], [232, 205, 149], [117, 196, 114], [68, 149, 76], [58, 128, 66], [44, 100, 58], [84, 120, 60], [26, 66, 56], [110, 112, 72], [120, 113, 134], [120, 113, 134], [102, 73, 55]];
let miniImg = null, shownClub = -2, shownMsg = null, shownCard = '';
// #1327: the hole's map. North is not up: the hole runs up the map, tee at the bottom and the green at the top, as the camera looks down the hole. The terrain is painted once a hole (drawMini); each frame
// miniDots checks the few numbers the dots depend on (the ball, the aim, the pin, the group) and only when one moved puts the picture back and draws the dots and the line over it.
// MG is the map's geometry (the harness reads it with MD, what was last drawn): world point (x, y) -> canvas px = (cw/2 + u s, ch/2 - v s) with u = (p - c).right, v = (p - c).forward.
const MINI_W = 128, MINI_H = 168, EM = 13;
const MG = { cx: 0, cy: 0, fx: 1, fy: 0, rx: 0, ry: 1, s: 1, cw: MINI_W, ch: MINI_H }, MD = { n: 0, h: 0, ball: null, aim: null, pin: null, others: 0 }, MP = { x: 0, y: 0 };
const miniBox = $('minimap'), miniTag = $('miniTag');
let miniFold = false; try { miniFold = localStorage.getItem('cinderlinks.map') === 'fold'; } catch (e) {}
function miniXY(x, y, o) { const dx = x - MG.cx, dy = y - MG.cy; o.x = MG.cw / 2 + (dx * MG.rx + dy * MG.ry) * MG.s; o.y = MG.ch / 2 - (dx * MG.fx + dy * MG.fy) * MG.s; return o; }
function miniLay() {   // the box's face (open or folded) and what the wind and the shot panel clear (em of the HUD)
  if (miniBox) miniBox.className = miniFold ? 'fold' : ''; if (miniTag) miniTag.textContent = miniFold ? 'Hole map +' : '−';
  if (hudEl && hudEl.style && hudEl.style.setProperty) { hudEl.style.setProperty('--mapw', miniFold ? '7.4em' : (MG.cw / EM + 0.8).toFixed(2) + 'em'); hudEl.style.setProperty('--mapb', miniFold ? '2.4em' : (MG.ch / EM + 1.9).toFixed(2) + 'em'); }
  MD.h = 0;
}
miniLay();
if (miniBox && miniBox.addEventListener) miniBox.addEventListener('click', () => { miniFold = !miniFold; try { localStorage.setItem('cinderlinks.map', miniFold ? 'fold' : 'open'); } catch (e) {} miniLay(); });
function drawMini() {
  const H = hole, tx = H.tee.x, ty = H.tee.y; let fx = H.pin.x - tx, fy = H.pin.y - ty; { const l = Math.hypot(fx, fy) || 1; fx /= l; fy /= l; }
  const rx = -fy, ry = fx, M = (H.halfW || 7) + 14;
  let u0 = 0, u1 = 0, v0 = 0, v1 = 0;   // the hole's extent in its own frame (u across to the right, v along), from the tee: its path, the tee and the pin
  const grow = (x, y) => { const dx = x - tx, dy = y - ty, u = dx * rx + dy * ry, v = dx * fx + dy * fy; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; };
  grow(H.pin.x, H.pin.y); if (H.path) for (let k = 0; k + 1 < H.path.length; k += 2) grow(H.path[k], H.path[k + 1]);
  const vs = v1 - v0 + 2 * M, us = Math.max(u1 - u0 + 2 * M, 70, vs * 0.55), s = Math.min(MINI_W / us, MINI_H / vs), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const cw = Math.max(2, Math.round(us * s / 2) * 2), ch = Math.max(2, Math.round(vs * s / 2) * 2);
  MG.s = s; MG.cw = cw; MG.ch = ch; MG.fx = fx; MG.fy = fy; MG.rx = rx; MG.ry = ry; MG.cx = tx + rx * cu + fx * cv; MG.cy = ty + ry * cu + fy * cv;
  miniEl.width = cw; miniEl.height = ch; miniEl.style.width = (cw / EM).toFixed(2) + 'em'; miniEl.style.height = (ch / EM).toFixed(2) + 'em';
  miniImg = mctx.createImageData(cw, ch);
  const d = miniImg.data;
  for (let j = 0; j < ch / 2; j++) for (let i = 0; i < cw / 2; i++) {
    const u = (i * 2 + 1 - cw / 2) / s, v = -(j * 2 + 1 - ch / 2) / s, x = MG.cx + rx * u + fx * v, y = MG.cy + ry * u + fy * v;
    field(x, y, FO);
    let c = MINI[matOf(FO.h, 0, FO.dF, FO.dG, FO.dB, FO.dT, FO.dP, FO.wood, FO.dry, 0, 0)];
    const up = FO.h - baseH(x, y);
    const k = FO.dT < 0 ? 1.1 : up > 5 ? 1.25 : up > 2 ? 1.12 : 0.92 + hash2(i, j, 7) * 0.1;
    for (let q = 0; q < 4; q++) { const o = ((j * 2 + (q >> 1)) * cw + i * 2 + (q & 1)) * 4; d[o] = Math.min(255, c[0] * k); d[o + 1] = Math.min(255, c[1] * k); d[o + 2] = Math.min(255, c[2] * k); d[o + 3] = 255; }
  }
  miniLay();
}
function miniDot(x, y, col, r) { miniXY(x, y, MP); mctx.beginPath(); mctx.arc(Math.round(MP.x), Math.round(MP.y), r, 0, 6.2832); mctx.fillStyle = col; mctx.fill(); }
let MH = 17;
function miniHash(x, y) { miniXY(x, y, MP); MH = (Math.imul(MH, 31) + Math.round(MP.x)) | 0; MH = (Math.imul(MH, 31) + Math.round(MP.y)) | 0; }
function miniDots() {   // each frame, from updateHud: nothing is drawn unless a dot moved a pixel
  if (!miniImg || miniFold) return;   // (folded: nothing to draw)
  const H = hole, T = HP && HP.target && !hostBusy() ? HP.target : null;
  MH = 17; miniHash(ball.x, ball.y); miniHash(H.pin.x, H.pin.y); if (T) miniHash(T.x, T.y); if (!HP) miniHash(player.x, player.y);
  let n = 0; if (actors.size) for (const r of actors.values()) if (r.role === 'golfer' && !r.ghost) { miniHash(r.cx, r.cy); n++; }
  MH = (Math.imul(MH, 31) + n + (T ? 977 : 0)) | 0;
  if (MH === MD.h) return; MD.h = MH;
  mctx.putImageData(miniImg, 0, 0); MD.n++; MD.others = 0;
  miniDot(H.tee.x, H.tee.y, '#f8dc6c', 2);
  for (const r of actors.values()) if (r.role === 'golfer' && !r.ghost) { miniXY(r.cx, r.cy, MP); if (MP.x >= 0 && MP.y >= 0 && MP.x < MG.cw && MP.y < MG.ch) { miniDot(r.cx, r.cy, '#82fff6', 2); MD.others++; } }   // (the others of the group, small; one off the map is not drawn)
  miniXY(H.pin.x, H.pin.y, MP); MD.pin = [MP.x, MP.y]; miniDot(H.pin.x, H.pin.y, '#ff5a30', 3.5); mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.beginPath(); mctx.arc(Math.round(MP.x), Math.round(MP.y), 3.5, 0, 6.2832); mctx.stroke();
  miniXY(ball.x, ball.y, MP); const bx = Math.round(MP.x), by = Math.round(MP.y); MD.ball = [MP.x, MP.y]; MD.aim = null;
  if (T) {   // the aim: a thin line from the ball to the aim ring's centre, and a ringed gold dot there
    miniXY(T.x, T.y, MP); MD.aim = [MP.x, MP.y]; const ax = Math.round(MP.x), ay = Math.round(MP.y);
    mctx.lineWidth = 3; mctx.strokeStyle = 'rgba(0,0,0,0.55)'; mctx.beginPath(); mctx.moveTo(bx, by); mctx.lineTo(ax, ay); mctx.stroke();
    mctx.lineWidth = 1; mctx.strokeStyle = '#ffd166'; mctx.beginPath(); mctx.moveTo(bx, by); mctx.lineTo(ax, ay); mctx.stroke();
    mctx.lineWidth = 3; mctx.strokeStyle = '#000'; mctx.beginPath(); mctx.arc(ax, ay, 4, 0, 6.2832); mctx.stroke();
    mctx.lineWidth = 1.5; mctx.strokeStyle = '#ffd166'; mctx.beginPath(); mctx.arc(ax, ay, 4, 0, 6.2832); mctx.stroke(); miniDot(T.x, T.y, '#ffd166', 1.5);
  }
  if (!HP) miniDot(player.x, player.y, '#82fff6', 2.5);
  mctx.lineWidth = 1.5; mctx.strokeStyle = '#000'; mctx.beginPath(); mctx.arc(bx, by, 3.5, 0, 6.2832); mctx.stroke(); miniDot(ball.x, ball.y, '#ffffff', 3);   // (the ball: white with a dark rim, over the line)
}
// J5b: the loading cover (host mode). From the course's coming until CapitalEmpire's pictures are in (every tree species with a picture made for this
// light, and his golfer's three clips), a CapitalEmpire card covers the picture: the hole, "Walking out to the tee" and how many pictures are in. The
// game draws on under it (the land is made, the golfer's frames are cut), so it lifts on a finished picture. At most COVER_MAX ms: then it lifts anyway,
// and whatever is still loading is simply not drawn until it comes (never a stand-in). LOADT keeps the times (performance.now(): the course, the lift).
const COVER_MAX = 20000, LOADT = { course: 0, ready: 0, pics: 0, picsAt: 0, artAt: 0, timedOut: false };
let coverEl = null, coverOn = false, coverTxt = '', coverNeed = null;   // (coverNeed: the species within sight of the tee: the cover waits for those; the rest load behind it and are not drawn until they come)
function coverShow(n) {
  coverNeed = picNear(hole.tee.x, hole.tee.y, VIEWR + 40);
  LOADT.course = performance.now(); LOADT.ready = 0; LOADT.pics = picCount(coverNeed); LOADT.picsAt = 0; LOADT.artAt = 0; LOADT.timedOut = false;
  if (typeof document === 'undefined' || !document.createElement) return;
  if (!coverEl) { coverEl = document.createElement('div'); coverEl.id = 'cover'; const st = document.getElementById('stage'); if (st && st.appendChild) st.appendChild(coverEl); }
  const prac = !!(course && typeof course.id === 'string' && /-practice$/.test(course.id));   // (J5c: the host's practice course: its id ends -practice, engine.ts course3pMsg; hole 1 the range, hole 2 the short game area)
  coverEl.innerHTML = '<div class="cv"><i>' + (prac ? 'Practice' : 'Hole ' + n) + '</i><b>' + (prac ? (n === 2 ? 'Out to the short game area' : 'Out to the range') : 'Walking out to the tee') + '</b><s><u></u></s><em></em></div>'; coverTxt = ''; coverOn = true; coverEl.className = 'on';
}
function coverHide() { coverOn = false; if (coverEl) coverEl.className = ''; }
function coverTick() {
  if (!coverOn || !LOADT.course) return;
  const left = picPending(coverNeed), n = LOADT.pics, art = gaReady(gaHost), t = performance.now() - LOADT.course;
  if (!left && !LOADT.picsAt) LOADT.picsAt = performance.now(); if (art && !LOADT.artAt) LOADT.artAt = performance.now();
  if ((left === 0 && art) || t > COVER_MAX) { LOADT.ready = performance.now(); LOADT.timedOut = left > 0 || !art; coverHide(); return; }
  const done = n - left + (art ? 1 : 0), all = n + 1, txt = (n ? 'The course\'s pictures: ' + (n - left) + ' of ' + n : 'The course\'s pictures') + (art ? '' : ' \u00b7 your golfer');
  if (txt !== coverTxt && coverEl && coverEl.querySelector) { coverTxt = txt; const e = coverEl.querySelector('em'), u = coverEl.querySelector('u'); if (e) e.textContent = txt; if (u) u.style.width = Math.round(done / all * 100) + '%'; }
}
// 2026-11-15: the card's three parts, each written only when it changes: the pill's line (the hole, par, the way to the pin, the shot; on the green the way to the
// cup and how far it climbs or falls), the break on the green (the host's read, and the slope to the cup), and the facts it opens to (no technical lines)
let shownLine = '', shownRead = '', shownMore = '', bagOpen = false;
const fmM = (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) + ' m';
function cardParts(row) {
  const H = hole, d = Math.hypot(H.pin.x - ball.x, H.pin.y - ball.y) / (HP ? hostS() : 1), t = hostOnTurn() ? HP.turn : null, putt = !!(t && t.green), score = strokes - H.par;
  const up = t && t.slope ? +t.slope.up || 0 : 0;
  let line, read = '';
  if (PRAC) line = '<b>' + (PRAC.place === 'range' ? 'The range' : 'Chipping green') + '</b><i>Practice</i><i>Ball ' + ((PRAC.balls | 0) + 1) + '</i>';   // (J6: practising: the place, not the hole)
  else {
    line = '<b>Hole ' + (course ? course.holes[(holeN - 1) % course.holes.length].n : holeN) + '</b><i>Par ' + H.par + '</i><i>' + fmM(d) + (putt ? ' to the cup' : '') + '</i>';
    if (putt) { const cm = Math.round(Math.abs(up) * (+t.distM || d) * 100); if (cm >= 1) line += '<i>' + (up > 0 ? '&#8593; ' + cm + ' cm up' : '&#8595; ' + cm + ' cm down') + '</i>'; }
    else if (ball.state !== 3) line += '<i>Shot ' + (strokes + 1) + '</i>';
  }
  line += '<s>&#9662;</s>';
  if (putt) {   // (the owner, 2026-11-15: the putt's tilt said in words, from the host's read)
    const rd = hostRead() ? String(t.green.read || '').replace(/^Green read: /, '') : 'Read locked: ' + ((t.earned && t.earned.why && t.earned.why.read) || 'the Putting drill');
    const pc = Math.round(Math.abs(up) * 100);
    read = (rd ? rd[0].toUpperCase() + rd.slice(1) : '') + (pc >= 1 ? (rd ? ' · ' : '') + pc + '% ' + (up > 0 ? 'uphill' : 'downhill') + ' to the cup' : '');
  }
  const more = (course ? '<div class="course">' + course.name + '</div>' : '') + (strokes ? row('Score', strokes + ' (' + (score > 0 ? '+' : '') + score + ')') : '') + row('Round', total)
    + row('Lie', t ? t.lieName || t.lieKind : MAT_NAME[matAt(ball.x, ball.y)]) + (t ? hostCardRows(row) : '') + row('Light', TOD[tmode].name) + (course && course.credit ? '<div class="note">' + course.credit + '</div>' : '');   // (the map data's credit stays, in the facts; the heights' source and the size went: the owner, 2026-11-15)
  return [line, read, more];
}
function updateHud() {
  const row = (a, b) => '<div class="row"><span>' + a + '</span><b>' + b + '</b></div>';
  { const [line, read, more] = cardParts(row);
    if (line !== shownLine) { cardLine.innerHTML = line; shownLine = line; } if (read !== shownRead) { cardRead.textContent = read; shownRead = read; } if (more !== shownMore) { cardMore.innerHTML = more; shownMore = more; } }
  if (club !== shownClub) { shownClub = club; const bag = !!(HP && HP.clubs.length); clubsEl.className = bag ? 'bag' + (bagOpen ? ' open' : '') : ''; clubsEl.innerHTML = bag ? hostPicker() : CLUBS.map((c, k) => '<div class="club' + (k === club ? ' on' : '') + '"><div class="ct"><b>' + (k + 1) + '</b> ' + c.name + '<i>' + (c.loft ? Math.round(c.v * c.v * clubK() * clubK() * Math.sin(2 * c.loft) / 9.81 / 5) * 5 + ' m' : 'on the green') + '</i></div></div>').join('');   /* (J8: the standalone page's tabs keep the number, name and carry in one block, as the host's tabs do beside their tile) */ if (clubsEl.appendChild) clubsEl.appendChild(aimEl); }   // (J5f: written again with the club: the aim's distance stays the box's last child)
  if (!HP) { powerEl.className = charging || player.swing >= 0 ? 'on' : ''; powerBar.style.width = (power * 100).toFixed(0) + '%'; }   // (host mode: the meter, hostMeterShow)
  if (charging && !HP) powerTxt.textContent = Math.round(power * 100) + '%  ' + clubName(club);
  const byCart = CART_SHOWN && !cart.on && !pracLock() && Math.hypot(player.x - cart.x, player.y - cart.y) < 3.2;
  const hint = msgT > 0 ? msgText : '';
  if (hint !== shownMsg) { msgEl.textContent = hint; shownMsg = hint; }
  // (2026-11-15: the hints are the "?" button's tooltip; a click opens the keys. The owner: "says Wheel to change clubs but thats to zoom the camera?": no hint names a control that does something else where it is used)
  const kh = (cart.on ? 'G get out · W S go, brake · A D steer' : byCart ? 'G drive the cart' : nearBall() ? (HP ? 'Hold Space or the bar: swing · 1-9 or [ ] club · wheel zoom · Z X shape · tap ↑ boost · I raise it' : 'Hold click: swing · 1-4 or [ ] club · wheel zoom') : 'W walk · A D turn · to the ball (J)') + ' · H all keys';
  if (kh !== shownKeys) { keysEl.title = kh; shownKeys = kh; }
  if (shownStyle !== biomeId || shownType !== ctypeId) styleShow();
  { const gm = canGimme() ? 'on' : ''; if (gimmeEl.className !== gm) gimmeEl.className = gm; }   // the gimme button shows when the putt left is short enough to be given
  { const far = ball.state === 0 && !bcam && player.swing < 0 && Math.hypot(player.x - ball.x, player.y - ball.y) > 4 ? 'on' : ''; if (jumpEl.className !== far) jumpEl.className = far; }   // the button shows when the ball lies still and the golfer is away from it
  { const hw = hostWindDir(), wdx = hw ? hw[0] : WDX, wdy = hw ? hw[1] : WDY, wr = wdx * RX + wdy * RY, wf = wdx * FX + wdy * FY, deg = Math.round(Math.atan2(-wf, wr) * 57.3 / 5) * 5, gu = WG[(((Math.round(player.y * PPV) >> 5) & 127) << 7) | ((Math.round(player.x * PPM) >> 6) & 127)] > 110;   // the wind as the camera sees it; gold while a gust is on the golfer
    const w = HP && HP.turn && HP.turn.wind, mph = w ? (w.mph < 1 ? 'calm' : Math.round(w.mph) + ' mph') : '', ws = deg + (gu ? 'g' : '') + mph;   // (2026-11-15: its mph beside the arrow, in the hole's pill)
    if (ws !== shownWind) { windArrow.style.transform = 'rotate(' + deg + 'deg)'; windEl.className = gu ? 'gust' : ''; windTxt.textContent = mph; windEl.title = w ? 'Wind ' + (w.mph < 1 ? 'calm' : Math.round(w.mph) + ' mph from the ' + COMPASS[Math.round((((w.from % 360) + 360) % 360) / 45) % 8]) : 'Wind'; shownWind = ws; } }
  miniDots();
}
````

## loop The game loop
The loop is Cinderdeep's: fixed steps of a sixtieth of a second, one render per frame.
R: T changes the light; N starts a new course from a new seed; 1 to 4 pick a club; B drops the ball; G gets into and out of the cart; H shows the keys.
R: The page can be opened with ?seed=N and ?time=0, 1 or 2.
R: Old chunks, tiles and scatter cells far from the camera are dropped, so memory stays bounded however far the golfer walks.
File: game.js
Check: function tickGame(
Check: requestAnimationFrame(loop)
R: The swing in host mode (T446): only the swing button or Space starts it, never a click on the course or a panel; holding lines the camera up behind the ball along the aim, then fills the power to 100% and back; letting go strikes at the power held; a click on the course sets the aim and holds it.
R: Host mode (?host=1, T415): the page is a view inside another page (CapitalEmpire). It loads no course of its own, says { v: 1, t: 'ready' } to the page that holds it and waits for { v: 1, t: 'course', course, features, biome, type, seed, scale, hole }; it plays that course from hole `hole` (1 if none) and answers { v: 1, t: 'loaded', holes }. { t: 'leave' } stops it drawing; Escape sends { v: 1, t: 'exit' }. { v: 1, t: 'lies', lk } (T438) may come after the course: the host's lies, sent once read so the first picture does not wait for them; from then on the grass is drawn by them and the land made before them is made again (the sculptures are kept). Messages from anywhere but the page that holds it are ignored. The first picture in host mode is whole within 60 m, the far land standing in beyond until the rest is made; until the first turn (or the lies) come, one frame in four is drawn, so the host page, on the same thread, reads the lies sooner.
Check: function hostMessage(
R: Host play (T418 to T420): in host mode the host decides every shot. A strike sends { v: 1, t: 'input', input: { holeIdx, stroke, club, aim, power } } and waits (after 5 s it says it is waiting for the course, and keeps waiting); { t: 'shot' } is played back from its samples (the flight with the ball camera, a thump at the landing and each bounce, the roll, the rest); { t: 'turn' } puts the ball and the pin where the host has them and only then may he swing again; { t: 'holeEnd' } says the score. The club tabs are his bag from the turn (keys 1 to 9 and the wheel over the tabs), and the aim's arc and ring are the host's carry, wind push and scatter for the club in hand. Standalone play is unchanged.
Check: function hostShot(
Check: function hostAim(
Check: function hostTabs(
R: J5f (the owner, 2026-11-14), host mode: the aim's distance (from the ball to the aim ring, in metres) is read out above the club box; before the swing the blue ribbon is drawn at the aim's strength, so it ends on the aim ring (not at the club's full carry), and while he holds it grows with the meter and reaches the ring at the gold mark; Curve (draw to fade) and Flight (low to high) are amounts, any from none to the full old pick, and a side he has not earned is held at the middle and says what unlocks it.
Check: function hostPickAmt(
Check: function hostAimRead(
R: J8 (#1261; the owner: "add ALOT more images to the UI. especially on stuff you can do"): in host mode the shot panel's pictures: a painted tile at each end of Curve (shot-draw, shot-fade) and of Flight (shot-low, shot-high), above the end's name, and one on the Tour button (shot-spin), from CapitalEmpire's src/assets/ui/tiles (build.mjs copies them into tiles/). They are pictures only (no text, never a click of their own: the end names and Tour keep theirs), and a locked end's tile dims with its name.
Check: tiles/shot-spin.webp
R: J8: and each club tab wears its club's painted tile (club-driver, club-wood, club-long-iron for a hybrid and a 4-iron, club-iron, club-wedge, club-putter) at the left of its number, name and carry; Go for it wears go-for-it, and the page's Jump to ball and Gimme buttons jump-to-ball and gimme. Pictures only: a click on one is a click on its tab or button, and the tabs keep their class, number and carry (the host and the harness read them).
Check: function clubTile(
R: 2026-11-15 (the owner: "Why not make the draw and fade like normal golf games where you just move the dot on the ball?"): in host mode the curve and the flight (J5f's amounts, -1 to 1) are set by dragging a dot on a ball: left a draw, right a fade, up high, down low; the painted draw, fade, high and low tiles sit round it and dim for a side he has not earned; a gold ring marks his limit (his full bend against a scratch golfer's) and the dot stops at it, its edge his full amount; a small arrow beside it previews the shape; Reset (or a double click) is straight. It sends the same shape the sliders sent; Z and X still step through them. Folded under it: how to boost and spin, and Go for it.
Check: function shapeAmt(
Check: function hostShapeAt(
R: 2026-11-15 (the owner: "the weird circles", "these are drawn so badly"): the aim is one clean line of steady width from the ball to one ring lying on the ground where the ball is predicted to land (a true circle projected through the camera, sized from the spread, 0.9 to 4.5 m); the point aimed at is a small cross; the roll after the landing is a faint short dash; no separate wind trace.
Check: function groundRing(
Check: function aimSpreadR(
R: 2026-11-15 (the owner: "the grid that shows slope is white. this grid is yellow. is there no slope?"): on his putt turn the green's lattice lines are a neutral faint white and the slope is shown by dots that flow downhill along it, their speed and colour (white, cyan, yellow, orange, red) by its steepness; the hole card says the break and the slope to the cup.
Check: function pgNow(
R: 2026-11-15: after each of his shots a short result fades by itself after about two seconds (carry, total, what is left to the pin).
Check: function hostToast(
R: #1336 (the owner, 2026-11-15: "like in the tiger woods games where you spam a button"): in host mode, while the swing is held, each tap of Up (or W, or Shift) adds to a boost level that halves every 0.6 s; the boost let go with is the level times the cap (+4% for everyone, +6% with the Power Mash charge armed by I or Go for it); a putt takes none. A thin bar over the power shows the level rising and falling, and the bar says "tap ↑ boost". Up and W never walk him while the swing is held.
Check: function hostBoostTap(
Check: function hostSwBoost(
R: #1336: while his full shot is in the air, the arrows tap spin in: Down backspin, Up topspin, Left and Right side spin, one step a tap, the opposite arrow taking one off; nothing drains; the count is held to the taps his club takes from this lie (turn.clubs[].air) and a way he has not earned says what unlocks it. A small ball beside the meter shows the spin's dot and words during the flight. The arrows never walk or turn him then. The pre-shot spin ball and Tour spin are gone: this is the one way to spin.
Check: function hostSpinTap(
Check: function hostSpinShow(
R: #1336: a full shot's input goes with fly: true; the host answers with the flight only (air: true); the view flies it and at the landing sends the same input again with the spin's totals (spin.ax, spin.ay), holding the ball at the landing until the stroke comes; the stroke's bounce and roll then play on from there (hostShotLand). A host that sends no taps for the club (no turn.clubs[].air) is sent a plain input, as before.
Check: function hostShotLand(
Check: function hostAirLand(

````js file=game.js

// ---- host mode (?host=1, T415): the view inside another page (CapitalEmpire), driven by messages (docs/CINDERLINKS-PORT.md, section 4)
// Host to view:  { v: 1, t: 'course', course, features, biome, type, seed, scale, hole }   course: one entry of courses.js (tools/course-import.mjs's
//                shape); features: what setFeatures takes; biome, type: what setBiome takes; scale: the course's scale (1: true size); hole: from 1
//                { v: 1, t: 'leave' }   stop drawing (a later 'course' starts it again)
// View to host:  { v: 1, t: 'ready' } once listening; { v: 1, t: 'loaded', holes } when a course is on screen; { v: 1, t: 'error', why }; { v: 1, t: 'exit' } on Escape
let HOST = false, hostOrigin = '', hostLast = null, hostN = 0, hostOff = false, looping = false;
function hostMode() { return HOST; }
function hostSend(m) {
  const msg = Object.assign({ v: 1 }, m);
  if (m.t !== 'sound') hostLast = msg;   // (kept: the harness reads it, having no parent page; J11: a sound is no answer to read, it never replaces the last message)
  try { if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage(msg, hostOrigin || '*'); } catch (e) { /* the parent is gone */ }
}
function hostMessage(m) {   // one message from the host page, already known to come from it
  if (!m || typeof m !== 'object') return;
  if (m.t === 'leave') { hostOff = true; coverHide(); return; }
  if (m.t === 'actors' || m.t === 'board' || m.t === 'match') { if (m.t === 'match') matchIn(m); else groupMsg(m); return; }   // T424, T427, T428: who else is on the course, the leaderboard, a money match (parts/08d-actors.md, 08e-group.md, 08g-match.md)
  if (m.t === 'lies' && m.v === 1) { hostLies(m.lk); return; }   // T438
  if (m.t === 'practice' && m.v === 1) { if (course) pracIn(m); return; }   // J6: practice (parts/08l-practice.md)
  if ((m.t === 'turn' || m.t === 'shot' || m.t === 'holeEnd' || m.t === 'preview') && m.v === 1) { if (course) hostPlayMsg(m); return; }   // (T418: the play, once a course is in)
  if (m.t !== 'course' || m.v !== 1) return;
  if (m.time === 'night') setTime(3); else if (m.time === 'day') setTime(0); else if (m.time === 'golden') setTime(1); else if (m.time === 'dusk') setTime(2);   // T449, #1200: night golf: the Night time of day (TOD 3), lit by the host's floodlight towers; T448: golden, dusk (absent: the view's own, Golden hour)
  if (m.golfer) { playerLook(m.golfer); gaHost = artIdOf(m.golfer); }   // T437: the golfer in the player card's clothes (parts/08d-actors.md); T450: and drawn as that golfer (parts/08k-golfart.md)
  const C = m.course;
  if (!C || typeof C.id !== 'string' || !Array.isArray(C.holes) || !C.holes.length || !C.polys) { hostSend({ t: 'error', why: 'the course has no id, holes or shapes' }); return; }
  const D = Object.assign({}, C, { fetched: true, scale: +m.scale > 0 ? +m.scale : 1, hv: ++hostN }, m.features && m.features.trees ? { trees: m.features.trees } : {});   // (T451: the host's trees travel with the course, so the workers stand them too)   // (fetched: the workers are handed its data; hv: a new hand-over of the same id is loaded again)
  const k = MORE_COURSES.findIndex((c) => c.id === D.id); if (k >= 0) MORE_COURSES.splice(k, 1); MORE_COURSES.push(D);
  if (m.seed !== undefined && Number.isFinite(+m.seed)) SEED = +m.seed | 0;
  setBiome(BIOMES[m.biome] ? m.biome : biomeId, CTYPES[m.type] ? m.type : ctypeId); lib.clear(); libWarm = 0;   // (sculptures made in the old colours are dropped, as useStyle does)
  HP = null; pracClear(); course = null; if (!setCourse(D.id)) { hostSend({ t: 'error', why: 'the course could not be laid out' }); return; }
  picReset();   // (T454: a new course's species pictures)
  setFeatures(m.features || null); featTxt = ''; featFor = course.id;
  picPrefetch(); if (gaHost) for (const c of GOLFART_CLIPS) gaLoad(gaHost, c);   // (J5b: every tree picture and his golfer's clips are asked for at once)
  const n = Math.max(1, Math.min(course.holes.length, +m.hole | 0 || 1)); if (n !== 1) newHole(n, 0, 0);
  coverShow(n);   // (J5b: after newHole: the cover waits for the trees within sight of this hole's tee)
  hostOff = false; firstPicture(FP_NEAR); updateHud();
  if (!looping && typeof requestAnimationFrame === 'function') { looping = true; last = performance.now(); acc = 0; requestAnimationFrame(loop); }
  hostSend({ t: 'loaded', holes: course.holes.length }); hostWaitT = performance.now();
}
let hostWaitT = 0, hostWaitF = 0;   // T438: since the first picture, waiting for the first turn (see loop)
function hostLies(L) {   // T438: the host's lies, after the course: the grass by them from now on; the land made without them is made again (here and in the workers)
  if (!course || !L || !Array.isArray(L.r)) return;
  const D = course.raw; if (D) { D.lk = L; D.hv = ++hostN; }   // (a new hv: the workers load the course again, with the lies)
  course.lk = lieGrid(L, course.S);
  treeMemo.clear(); tiles.clear(); chunks.clear(); ocells.clear(); ftiles.clear(); farQ.length = 0; tileQ.length = 0; tileQset.clear(); pwAt = 1e9; lastTK = NaN; lastCK = NaN; lastTile = lastChunk = null;
  wkInit();
  if (typeof hole !== 'undefined' && hole && hole.tee) drawMini();   // (#1327: the map's grass by the lies too)
}
function hostStart() {
  HOST = true; hostOff = true;   // (nothing is drawn until a course comes)
  try { document.body.classList.add('host'); } catch (e) { /* (no page: the harness) */ }   // (J5: the style moves the map and the wind below CapitalEmpire's buttons)
  helpEl.innerHTML = HELP.filter((h) => h[0] !== 'M' && h[0] !== 'V').map((h) => '<b>' + h[0] + '</b>' + h[1]).join('\n');   // (T447: M and V choose nothing in the game)
  try { hostOrigin = (location.ancestorOrigins && location.ancestorOrigins.length ? location.ancestorOrigins[0] : '') || (document.referrer ? new URL(document.referrer).origin : '') || location.origin || ''; } catch (e) { hostOrigin = ''; }
  addEventListener('message', (e) => {
    if (typeof window !== 'undefined' && e.source !== window.parent) return;   // only the page that holds this one
    if (hostOrigin && e.origin !== hostOrigin) return;
    try { hostMessage(e.data); } catch (err) { hostSend({ t: 'error', why: String((err && err.message) || err) }); }   // (a course that cannot be read is said, not swallowed)
  });
  hostSend({ t: 'ready' });
}

// ---- host play (T418, T419, T420): in host mode the shots are the host's. The view never flies or rolls a ball of its own: strike() sends the
// owner's input (the club from the host's list, the aim point, the power) and waits; the host's `shot` is played back sample by sample (the flight with
// the ball camera, a thump at the landing and each bounce, the roll, the rest), and only then does the next `turn` put the ball and the pin where the
// model has them. The clubs are the host's (turn.clubs: his bag with its carries after his mods); the aim draws the host's numbers (hostAim).
// Host to view:  { t: 'turn', ... }   { t: 'shot', ... }   { t: 'holeEnd', hole, par, strokes, last }      (docs/CINDERLINKS-PORT.md section 4)
// View to host:  { t: 'input', input: { holeIdx, stroke, club, aim: [x, y], power } }   (metres in the host's frame, true size)
let HP = null;   // the host's play: { turn, clubs, wait (steps since the input went, 0: none), play (a shot being played back), q (messages held until it ends), over }
const HOST_WAIT = 300;   // five seconds of steps without an answer: "waiting for the course" is said (and the view keeps waiting)
function hostS() { return course ? course.S : 1; }   // (the host's metres are true size; a course drawn at another scale scales them)
function hostBusy() { return !!HP && (!HP.turn || HP.wait > 0 || !!HP.play || HP.q.length > 0 || HP.over); }
function hostClub() { return HP && HP.clubs[club] ? HP.clubs[club] : null; }
function puttNow() { const c = hostClub(); return c ? c.club === 'putter' : club === 3; }
function hostPower(p, putt) { return putt ? 0.5 + p : 0.3 + 0.7 * p; }   // the meter's 0..1 as the model's power: a full shot 0.3..1 of the club's carry, a putt 0.5..1.5 of its length to the pin (live.ts POWER, PUTT_POWER)
const CLUB_NAME = { driver: 'Driver', wood3: '3-wood', wood5: '5-wood', hybrid: 'Hybrid', iron4: '4-iron', iron5: '5-iron', iron6: '6-iron', iron7: '7-iron', iron8: '8-iron', iron9: '9-iron', pw: 'Pitching wedge', gw: 'Gap wedge', sw: 'Sand wedge', lw: 'Lob wedge', putter: 'Putter' };
function clubName(k) { const c = HP && HP.clubs[k]; return c ? CLUB_NAME[c.club] || c.club : CLUBS[k] ? CLUBS[k].name : ''; }
function hostPlayMsg(m) {   // a play message from the host: a turn, a shot, the hole's end; held while a shot is being played back
  if (!HP) HP = { turn: null, clubs: [], wait: 0, play: null, q: [], over: false };
  if (m.t === 'preview') { if (m.key === HP.pvKey) HP.pv = Object.assign({}, m, { sig: HP.pvSig, club: hostClub() ? hostClub().club : '' }); return; }   // (T441: the answer to the latest `aim` only)
  if (m.t === 'shot' && !m.air && HP.play && HP.play.air && m.golfer === HP.play.m.golfer && m.hole === HP.play.m.hole && m.stroke === HP.play.m.stroke) { hostShotLand(m); return; }   // (#1336: the stroke for the flight in the air)
  if (m.t === 'shot') { if (groupOther(m) && !groupPlays(m)) return;   /* (T425: his group's strokes are played too: 08e-group.md) */ if (HP.play) { HP.q.push(m); return; } hostShot(m); return; }   // (anyone else's stroke: shown from T425)
  if (HP.play || HP.q.length) { HP.q.push(m); return; }
  if (m.t === 'turn') hostTurn(m); else if (m.t === 'holeEnd') hostHoleEnd(m);
}
function hostTurn(m) {   // the owner's turn: the ball and the pin where the model has them, his clubs in the tabs, the suggested club in hand
  const S = hostS(), live = pracLock() && !pracNew && HP.turn && HP.turn.stroke === m.stroke && HP.turn.hole === m.hole && HP.clubs[club] ? { club: HP.clubs[club].club, ax: aim.x, ay: aim.y, pick: HP.pick, pin: hostAimPin } : null;   // (the same ball's turn sent again, e.g. with a new wind: what he has set on it so far stays)
  HP.turn = m; HP.clubs = Array.isArray(m.clubs) ? m.clubs : []; HP.wait = 0; HP.over = false;
  if (m.hole !== holeN) newHole(m.hole, 0, 0);
  ball.x = ball.lx = m.ball[0] * S; ball.y = ball.ly = m.ball[1] * S; ball.z = groundH(ball.x, ball.y); ball.vx = ball.vy = ball.vz = 0; ball.state = 0;
  hole.pin.x = hole.green.x = m.pin[0] * S; hole.pin.y = hole.green.y = m.pin[1] * S;
  const kp = live ? pracKept(m, live) : pracKept(m);   // (#1308: practising, the next ball is hit with what the last one was: his aim, club, curve, flight and spin stay until he moves them; a drill picked, or the first ball, takes the suggestion once)
  strokes = m.stroke - 1; autoClub = false; club = kp ? kp.ci : Math.max(0, HP.clubs.findIndex((c) => c.club === m.suggested.club)); shownClub = -2;
  HP.pick = kp ? kp.pick : null; HP.pv = null; HP.pvSig = ''; hostAimPin = kp ? kp.pin : false;   // (T441: each turn starts from a plain shot; T446: and the aim follows the mouse until a click sets it)
  const ax = (kp ? kp.ax : m.suggested.aim[0] * S) - ball.x, ay = (kp ? kp.ay : m.suggested.aim[1] * S) - ball.y, al = Math.hypot(ax, ay); if (al > 0.3) { aim.dx = ax / al; aim.dy = ay / al; }
  aim.x = kp ? kp.ax : m.suggested.aim[0] * S; aim.y = kp ? kp.ay : m.suggested.aim[1] * S;   // (J5c: the target too: it was left where the last turn, or the mouse passing, put it, and the strike went there)
  // (2026-11-15, the owner: "im supposed to see player on the tee when it loads"): every turn, not only the tee's, starts with him at his ball, facing down
  // the aim, the camera behind him; a turn that comes while the camera is away with the ball waits for it to come back (ballCam, HP.jumpPend)
  HP.jumpPend = false;
  if (pracLock()) { if (Math.hypot(player.x - ball.x, player.y - ball.y) > 0.3) jumpToBall(); }
  else if (ball.state === 0) { if (bcam || player.swing >= 0 || charging) HP.jumpPend = true; else jumpToBall(); }   // (J5c: on the tee always: he stands at his ball facing down the aim, the camera behind him)   // (J6: practising, each ball is teed up where he stands)   // (on the tee he stands at his ball; later he walks to it, or J)
}
function hostStrike() {   // the club meets the ball: the input goes to the host, and the ball waits for its answer
  const c = hostClub(), t = HP.turn, S = hostS(); if (!c || !t) return;
  const putt = c.club === 'putter', m = matAt(ball.x, ball.y);
  const sw = HP.out; HP.out = null;   // (T421: the meter's outcome; the power is then only what it would be without one)
  const inp = Object.assign({ holeIdx: t.holeIdx, stroke: t.stroke, club: c.club, aim: [aim.x / S, aim.y / S], power: sw ? Math.min(putt ? HOLD_PUTT_TOP : 1, Math.max(putt ? 0.05 : 0.3, sw.power)) : hostPower(power, putt) }, sw ? { swing: { power: sw.power, acc: sw.acc, boost: sw.boost, v: sw.v } } : {}, hostShotIn());   // (T441: the shape picked)
  // #1336: a full shot goes with `fly` (a host that sends the taps each club takes, turn.clubs[].air): the host answers with the flight, he taps the spin in while it flies,
  // and at the landing the same input goes again with the taps' totals (hostAirLand), answered with the stroke
  const fly = !putt && !!c.air; HP.air = fly ? { ax: 0, ay: 0, cap: c.air, inp, sent: false, n: 0 } : null;
  hostSend({ t: 'input', input: fly ? Object.assign({ fly: true }, inp) : inp });
  if (HP.pick) HP.pick.armed = false;   // (spin and shape: T441, T442)
  pracSave(c);   // (#1308: what the next practice ball starts from)
  HP.wait = 1;
  if (!sndMsg('strike', { club: c.club, p: Math.min(1, Math.max(0, power)) })) { if (!putt) sndShot(); else sndTap(); }   // (J11: the club's own strike, played by the host)
  for (let k = 0, n = putt ? 3 : 10 + ((power * 14) | 0); k < n; k++) {   // sparks off the club, and turf or sand
    addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, aim.dx * (1 + rnd() * 3) + (rnd() - 0.5) * 2, aim.dy * (1 + rnd() * 3) + (rnd() - 0.5) * 2, 1 + rnd() * 3, 16 + rndi(18), 0);
    if (!putt) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, ball.z + 0.05, aim.dx * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, aim.dy * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, 1.5 + rnd() * 2.5, 30 + rndi(30), rndi(6));
  }
}
function hostShot(m) {   // the owner's decided stroke: played back from its samples (hostBall)
  groupShotStart(m);   // (T425: another's stroke: the owner's ball and score put aside, 08e-group.md)
  const P = hostPlayOf(m), F = P.F, tL = P.tL;
  HP.play = P;
  HP.wait = 0; ball.lx = ball.x; ball.ly = ball.y; ball.t = 0; ball.state = F.length ? 1 : 2;
  if (F.length && tL > 0.8) { bcam = 1; bcamT = 0; bcamYaw = camYaw; bcamD = camD; slowT = 30; }   // a full shot: a moment of slow time, and the camera goes with the ball
}
// #1336: the stroke for the flight in hand (its bounce and roll, worked out now the spin is in): the playback goes on from where it is, on the stroke's samples (its
// flight is the one flown: the spin never moves the landing)
function hostShotLand(m) {
  const P = HP.play, Q = hostPlayOf(m); Q.t = Math.min(P.t, Q.tL); Q.landed = P.landed;
  HP.play = Q; HP.wait = 0; if (HP.air) HP.air.done = true;
}
function hostPlayOf(m) {   // the playback of a stroke from its samples: the flight's and the roll's points and times, the bounces' times
  const S = hostS(), F = Array.isArray(m.flight) ? m.flight : [], R = Array.isArray(m.roll) ? m.roll : [];
  const fT = Array.isArray(m.flightT) && m.flightT.length === F.length ? m.flightT : F.map((_, k) => k / 30);   // (an older host: 30 samples a second)
  const tL = F.length ? fT[F.length - 1] : 0, rT = Array.isArray(m.rollT) && m.rollT.length === R.length ? m.rollT : R.map((_, k) => tL + (k + 1) * 0.12);
  const bT = (m.bounces || []).map((b) => { let bi = -1, bd = 1e9; for (let k = 0; k < R.length; k++) { const d = Math.hypot(R[k][0] - b[0], R[k][1] - b[1]); if (d < bd) { bd = d; bi = k; } } return bi >= 0 ? rT[bi] : tL; }).sort((a, b) => a - b);
  const start = F.length ? [F[F.length - 1][0], F[F.length - 1][1], 0] : [m.from[0], m.from[1], 0];
  return { m, S, F, fT, tL, bT, bi: 0, t: 0, landed: !F.length, air: m.air === true && F.length > 0, RT: [tL].concat(rT), RQ: [start].concat(R.map((p, k) => [p[0], p[1], Array.isArray(m.rollZ) && m.rollZ.length === R.length ? m.rollZ[k] : 0])) };
}
// (the owner, 2026-11-15: "the height of the golf ball at game play time seems to move up and down based on the ground height below. so if it travels over a
// clif it goed higher when it gets over the cliff"): the host's flight heights are an arc over the straight line from the strike to the landing (shot3p.ts:
// 0 at both ends), not over the ground under the ball. So the ball's base is the ground at the strike, sliding to the ground at the landing along the way
// (by the share of the distance covered), never the ground under it: a cliff, a hill or a pond below no longer lifts or drops the ball in the air
function flightBase(P, x, y) {
  const F = P.F, S = P.S; if (!F.length) return groundH(x, y);
  if (P.g0 === undefined) { const a = F[0], b = F[F.length - 1]; P.ax = a[0] * S; P.ay = a[1] * S; P.bx = b[0] * S; P.by = b[1] * S; P.g0 = groundH(P.ax, P.ay); P.g1 = groundH(P.bx, P.by); P.dl = Math.hypot(P.bx - P.ax, P.by - P.ay); }
  const f = P.dl > 1e-6 ? Math.min(1, Math.max(0, Math.hypot(x - P.ax, y - P.ay) / P.dl)) : 1;
  return P.g0 + (P.g1 - P.g0) * f;
}
function hostAt(T, P, t, o) {   // the point of a sampled path at time t (seconds from the strike): x, y and the height (m) between its samples
  let k = 0; while (k < T.length - 1 && T[k + 1] < t) k++;
  const a = P[k], b = P[Math.min(k + 1, P.length - 1)], t0 = T[k], t1 = T[Math.min(k + 1, T.length - 1)], u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 1;
  o.x = a[0] + (b[0] - a[0]) * u; o.y = a[1] + (b[1] - a[1]) * u; o.h = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * u; return o;
}
const HQ = { x: 0, y: 0, h: 0 };
function hostBall() {   // one step of the playback: the ball follows the host's samples, then lies where the host says it rests
  const P = HP.play; if (!P) return;
  const dt = (slowT > 0 ? 0.3 : 1) / 60, S = P.S; if (slowT > 0) slowT--;
  P.t += dt; ball.t++;
  const x0 = ball.x, y0 = ball.y;
  if (P.F.length && P.t < P.tL) {                                     // in the air
    hostAt(P.fT, P.F, P.t, HQ); ball.x = HQ.x * S; ball.y = HQ.y * S; ball.z = flightBase(P, ball.x, ball.y) + HQ.h * S; ball.state = 1;
    if (tmode > 0 && (ball.t & 1)) addParticle(P_EMBER, ball.x, ball.y, ball.z, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0.2, 16 + rndi(14), 1);
  } else if (P.air) {                                                  // #1336: landed with only the flight in hand: the taps go to the host, the ball waits at the landing for the stroke
    P.t = P.tL; const L = P.F[P.F.length - 1]; ball.x = L[0] * S; ball.y = L[1] * S; ball.z = flightBase(P, ball.x, ball.y); ball.state = 2;
    if (!P.landed) { P.landed = true; hostLand(8); }
    if (!P.sent) { P.sent = true; hostAirLand(); }
  } else if (P.RT.length > 1 && P.t < P.RT[P.RT.length - 1]) {        // bouncing and rolling
    if (!P.landed) { P.landed = true; hostLand(8); }
    while (P.bi < P.bT.length && P.bT[P.bi] <= P.t) { P.bi++; if (P.bi > 1) hostLand(4); }   // (the first bounce is the landing)
    hostAt(P.RT, P.RQ, P.t, HQ); ball.x = HQ.x * S; ball.y = HQ.y * S; ball.z = groundH(ball.x, ball.y) + HQ.h * S; ball.state = 2;
    { const vx = ball.x - x0, vy = ball.y - y0;   // (T442: a ball that turns back is spinning back: a zip of sparks and a tick where it bites)
      if (P.ldx !== undefined && !P.zip && vx * P.ldx + vy * P.ldy < 0) { P.zip = true; sndTap(); for (let k = 0; k < 10; k++) addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 1.6, 0.6 + rnd(), 14 + rndi(12), 0); }
      if (Math.hypot(vx, vy) > 1e-4) { P.ldx = vx; P.ldy = vy; } }
  } else { hostRest(); return; }
  ball.vx = (ball.x - x0) / dt; ball.vy = (ball.y - y0) / dt; ball.vz = 0;   // (for the ball camera's turn)
}
// #1336 (the owner, 2026-11-15: "pick a direction on the arrow keys and spam it to induce side or back or front spin ... the spin one does not drop like power and you can
// reverse how much spin you added by spamming the opposite direction key"): while his ball is in the air the arrows tap spin in: Down backspin, Up topspin, Left and
// Right side spin, one step a tap (spin.ts AIR.per), the opposite arrow taking one off; the count is held to the taps his club takes from this lie (turn.clubs[].air)
// and to what he has earned (side spin, backspin: a locked way says what unlocks it). Nothing drains. At the landing the totals go to the host (hostAirLand)
const AIR_PER = 0.08;   // (spin.ts AIR.per: a tap's share of full spin, for the readout)
function hostAirOn() { const P = HP && HP.play; return !!(P && P.air && !P.sent && HP.air && P.t < P.tL); }
function hostSpinTap(d) {   // one arrow tapped in the air ('up', 'down', 'left', 'right'); false when it did nothing
  if (!hostAirOn()) return false;
  const A = HP.air, c = A.cap || { side: 0, top: 0, back: 0 }, was = A.ax + ',' + A.ay;
  if (d === 'down') { if (A.ay > 0) A.ay--; else if (!hostEarned('back')) say('Backspin is locked: ' + (hostWhy('back') || 'not earned yet'), 150); else if (-A.ay < c.back) A.ay--; }
  else if (d === 'up') { if (A.ay < 0) A.ay++; else if (A.ay < c.top) A.ay++; }
  else if (d === 'left' || d === 'right') {
    const sg = d === 'left' ? -1 : 1;
    if (A.ax * sg < 0) A.ax += sg; else if (!hostEarned('side')) say('Side spin is locked: ' + (hostWhy('side') || 'not earned yet'), 150); else if (Math.abs(A.ax) < c.side) A.ax += sg;
  }
  if (A.ax + ',' + A.ay === was) return false;
  A.n++; return true;
}
function hostAirLand() {   // the landing: the input again, with the spin's totals (no tap times), and the wait for the stroke
  const A = HP.air; if (!A || A.sent) return;
  A.sent = true; HP.wait = 1;
  hostSend({ t: 'input', input: Object.assign({}, A.inp, { spin: { x: 0, y: 0, pump: 0, ax: A.ax, ay: A.ay } }) });
}
function spinWords(ax, ay) {   // "Backspin 24% · left 8%", "Tap the arrows for spin"
  const pc = (n) => Math.round(Math.min(1, Math.abs(n) * AIR_PER) * 100) + '%', v = ay < 0 ? 'Backspin ' + pc(ay) : ay > 0 ? 'Topspin ' + pc(ay) : '', sd = ax ? (ax < 0 ? 'left ' : 'right ') + pc(ax) : '';
  return v && sd ? v + ' · ' + sd : v || (sd ? sd[0].toUpperCase() + sd.slice(1) : 'Tap the arrows for spin');
}
// the spin readout beside the meter, his flight only: a small ball with the spin's dot (its distance from the middle the spin's share) and the words; drawn only when it changes
const spinReadEl = document.createElement('div'), spinReadCv = document.createElement('canvas'), spinReadTx = document.createElement('span');
spinReadEl.id = 'spinRead'; spinReadCv.width = 64; spinReadCv.height = 64; spinReadEl.appendChild(spinReadCv); spinReadEl.appendChild(spinReadTx);
if (typeof hudEl !== 'undefined' && hudEl && hudEl.appendChild) hudEl.appendChild(spinReadEl);
let spinShown = '';
function hostSpinShow() {
  const A = HP && HP.air, P = HP && HP.play, on = !!(A && P && P.air && !A.done), sig = on ? A.ax + ',' + A.ay : '';
  if (sig === spinShown) return; spinShown = sig;
  spinReadEl.className = on ? 'on' : ''; if (!on) return;
  spinReadTx.textContent = spinWords(A.ax, A.ay);
  const c = spinReadCv.getContext ? spinReadCv.getContext('2d') : null; if (!c || !c.createRadialGradient) return;
  c.clearRect(0, 0, 64, 64); const R = ballFace(c, 64, false), k = (n) => Math.max(-1, Math.min(1, n * AIR_PER)) * (R - 7);
  c.strokeStyle = 'rgba(60, 54, 40, 0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(32 - R * 0.85, 32); c.lineTo(32 + R * 0.85, 32); c.moveTo(32, 32 - R * 0.85); c.lineTo(32, 32 + R * 0.85); c.stroke();
  c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 2; c.beginPath(); c.arc(32, 32, R, 0, 6.2832); c.stroke();
  c.fillStyle = '#e8573c'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(32 + k(A.ax), 32 - k(A.ay), 6, 0, 6.2832); c.fill(); c.stroke();
}
function hostLand(v) { sndLand(v); const m = matAt(ball.x, ball.y), gh = groundH(ball.x, ball.y); for (let k = 0; k < v; k++) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, gh + 0.04, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4, 0.8 + rnd() * 2, 20 + rndi(24), rndi(6)); }
function hostRest() {   // the playback is over: the ball lies at the host's rest (in the cup, in the water), the strokes are counted, held messages go on
  const P = HP.play, m = P.m, S = P.S; HP.play = null;
  if (!P.landed) hostLand(8);
  if (!m.holed && !m.penalty && !(typeof groupOther === 'function' && groupOther(m))) hostToast(m, P.F);   // (2026-11-15: the result, his own shots only)
  ball.x = m.rest[0] * S; ball.y = m.rest[1] * S; ballRest();
  strokes = m.stroke + (m.penalty || 0); total += 1 + (m.penalty || 0);
  if (m.holed) { sndMsg('cup', { drop: true }); ball.state = 3; ball.x = hole.pin.x; ball.y = hole.pin.y; for (let k = 0; k < 120; k++) addParticle(k & 1 ? P_SPARK : P_EMBER, hole.pin.x, hole.pin.y, ball.z + 0.1, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 2 + rnd() * 5, 40 + rndi(70), rndi(4)); }
  else if (m.penalty) { splash(ball.x, ball.y, wlAt(ball.x, ball.y), 26); say(m.restLie === 'water' ? 'Water: one stroke, and a drop' : 'Out of bounds: one stroke', 260); }
  groupShotEnd(m);   // (T425: after another's stroke the owner's ball and score come back, 08e-group.md)
  galleryReact(m);   // (T429: the crowd near it cheers a holed putt, groans at a short miss: 08f-gallery.md)
  while (HP.q.length && !HP.play) { const q = HP.q.shift(); if (q.t === 'shot') hostShot(q); else if (q.t === 'turn') hostTurn(q); else if (q.t === 'holeEnd') hostHoleEnd(q); else if (q.t === 'practice') pracShow(q); }
}
// 2026-11-15: after each of his shots a short result that fades by itself after about two seconds: "Carry 187 m · total 203 m · 120 m to the pin"
function hostToast(m, F) {
  const fr = m.from, r = m.rest, pin = HP.turn && HP.turn.pin; if (!Array.isArray(fr) || !Array.isArray(r)) return;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), left = Array.isArray(pin) ? '  ·  ' + fmM(d(r, pin)) + ' to the ' + (m.restLie === 'green' ? 'cup' : 'pin') : '';
  say((F.length ? 'Carry ' + fmM(d(fr, F[F.length - 1])) + '  ·  total ' + fmM(d(fr, r)) : 'Rolled ' + fmM(d(fr, r))) + left, 130);
}
function hostHoleEnd(m) {   // the hole is over: its score is said; after the last, the view waits for Escape
  const d = m.strokes - m.par, name = m.strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : '+' + d;
  strokes = m.strokes; if (m.last) { HP.turn = null; HP.over = true; }
  HP.doneHole = m.holeIdx; HP.doneAt = 200;   // (T430: after the score has been seen, about three seconds, the view says so: the host's round goes on to its next hole, or ends)
  say(name + '  -  hole ' + m.hole + ' in ' + m.strokes + (m.last ? '  -  Esc goes back to the course' : '  -  on to the next tee'), m.last ? 100000 : 330);
}
function hostTick() {   // each step: the playback, the meter, and the wait for an answer
  hostBall(); hostMeterShow(); hostShotShow(); hostSpinShow(); hostAimAsk(); pracTick();
  if (HP.doneAt > 0 && --HP.doneAt === 0) hostSend({ t: 'holeDone', holeIdx: HP.doneHole });
  if (HP.wait > 0 && ++HP.wait > HOST_WAIT && (HP.wait - HOST_WAIT) % 120 === 1) say('Waiting for the course...', 130);
}
function hostAim() {   // T420: the aim tells the truth: the arc to where the model's mean lands this club at this power (its carry in this lie, slope and wind, and
  // the wind's push off the line), and a ring at one standard deviation of where it lands (shot.ts SHOT_SCATTER: across the line and along it). A better
  // club or a steadier golfer draws a smaller ring. Its numbers come from the host's kit for the club (turn.clubs), worked out along the suggested line
  const C = hostClub(), t = HP.turn; if (!C || !t) return;
  const sw = HP.sw, u = sw ? sw.u : 1, b = sw ? hostSwBoost(sw) : 0;   // (T421, T446: what the swing has set so far: the power held, and the boost added)
  const T = hostTarget();   // (T456: the aimed point on the ground)
  const S = hostS(), putt = C.club === 'putter', pw = sw ? (putt ? u * hostPuttTop() : u) + b : T ? T.pw : 1, hot = charging ? AIM_R : AIM_G, ph = (frame >> 1) % 6;   // (T456: a putt's meter reaches past the hole. J5f: before the swing the way is drawn at the aim's strength, so the ribbon ends on the aim ring and not at the club's full carry; held, it grows with the meter and is the same at the gold mark)
  if (T) hostTargetRing(T, C); else HP.target = null;
  const dx = aim.dx, dy = aim.dy, rx = -dy, ry = dx;                  // (the line, and his right as he faces it: x east, y south)
  if (!putt && hostAimPreview(C, pw, hot, ph)) return;               // (T441, T442: the model's preview of the shot picked, when it has come)
  if (putt && hostRead() && hostPuttAim(pw, hot, ph)) return;        // (T423: the host's read: the way a putt struck along this aim takes; J6: once earned)
  if (putt) {                                                          // a putt: its length is a share of the way to the pin; the blue ribbon along the green (J5b)
    const len = Math.hypot(hole.pin.x - ball.x, hole.pin.y - ball.y) * pw;
    ribStart(); for (let d = 0; d < len + 0.34; d += 0.35) { const e = d < len ? d : len, qx = ball.x + dx * e, qy = ball.y + dy * e; ribAdd(qx, qy, aimH(qx, qy) + 0.03); }
    ribbonO(RIB_W * 0.35 * S, 2);   // (2026-11-15: a putt's way short and faint)
    return;
  }
  const carry = (C.playsM !== undefined ? C.playsM : C.carryM) * pw * S, side = (C.sideM || 0) * pw * S;
  const lx = ball.x + dx * carry + rx * side, ly = ball.y + dy * carry + ry * side, apex = (0.08 + 0.004 * (C.loftDeg || 30)) * carry, z0 = aimH(ball.x, ball.y), z1 = aimH(lx, ly);
  let kh = 1; const n = Math.max(12, Math.round(carry / 1.6)), top = arcTop(lx, ly, z1);
  for (let k = 0; k <= n; k++) { const u = k / n; kh = arcKeep(ball.x + (lx - ball.x) * u, ball.y + (ly - ball.y) * u, z0 + (z1 - z0) * u, apex * 4 * u * (1 - u), kh, top); }
  ribStart();
  for (let k = 0; k <= n; k++) {   // the arc: one clean line, a point every 1.6 m or so
    const u = k / n, x = ball.x + (lx - ball.x) * u, y = ball.y + (ly - ball.y) * u, gz = aimH(x, y), z = z0 + (z1 - z0) * u + apex * 4 * u * (1 - u) * kh;
    ribAdd(x, y, Math.max(z, gz + 0.03));
  }
  ribbonO(RIB_W * S, false);
  const across = Math.max(0.4, (C.scatterM || 0) / 2 * pw * S), along = Math.max(0.4, (C.longM !== undefined ? C.longM : C.scatterM || 0) / 2 * pw * S);   // (one standard deviation: the host sends two)
  groundRing(lx, ly, aimSpreadR(across, along, S), hot);   // (one ring where it lands, lying on the ground)
  HP.ring = { x: lx, y: ly, across, along };   // (kept for the harness: the spread itself, not the ring drawn)
}
// 2026-11-15 (the owner: "the weird circles... WTF", "these are drawn so badly"): one landing ring, lying on the ground where the ball is predicted to come
// down (the model's preview when it has come), its size from the spread (one standard deviation across and along) but kept modest: 0.9 m for the
// steadiest, growing a little with a long club or a poor lie, never over 4.5 m (it used to be the whole one-sigma ellipse, half the fairway for a driver)
// 2026-11-15: seen from behind the golfer a full arc runs off the top of the picture and its way down lies over its way up (a pole, not a curve). The drawn
// height is scaled down just enough that its top stays 12% below the picture's top edge and a little above its landing; its way over the ground, its landing and
// its bend are the shot's (a gentle hump that leads the eye into the landing ring).
// arcKeep: the scale (kh, at most the one given) that keeps a point h m over the ground at base (x, y) in the picture
// (and no higher on the picture than ARC_UP of its height above where it lands: from straight behind, a taller arc folds back down over itself)
const ARC_UP = 0.07;
function arcTop(lx, ly, lz) { const d = (lx - camX) * FX + (ly - camY) * FY; return d > 1 ? Math.max(VH * 0.12, HZ - (lz - camZ) * FOC / d - VH * ARC_UP) : VH * 0.12; }   // (the highest row the arc may reach, game px)
function arcKeep(x, y, base, h, kh, top) {
  if (!(h > 0.3)) return kh; const d = (x - camX) * FX + (y - camY) * FY; if (d < 1) return kh;
  const lim = (HZ - top) * d / FOC + camZ - base; return lim < h * kh ? Math.max(0.03, Math.min(kh, lim / h)) : kh;
}
function aimSpreadR(across, along, S) { return Math.min(4.5 * S, Math.max(0.9 * S, 0.9 * S + 0.12 * Math.sqrt(across * along))); }
// T446 (the owner, 2026-11-13: "the original mechanic of holding and releasing the key when the distance is correct"): the swing is Cinderlinks' own
// hold and release, started only from the swing button (bottom centre) or Space, never by a click on the course, so a click on a menu, a tab or the
// spin ball cannot start one. Holding first lines the camera up behind the ball along the aim (a glide of HMETER.glide seconds, smooth in and out, the
// shortest way round; none when it is already within HMETER.line), and the meter waits for it. Then the power fills: it rises to 100% at the club's
// speed (turn.clubs[].speed: meter units a second, slower for a better golfer) and falls back again, as the original's did, while the heart beats
// faster; the landing marker grows with it. Letting go swings the club down and strikes at the power held (let go during the glide: no swing). There is
// no accuracy click: how straight it goes is the model's own spread for the golfer's skill (swing.ts HOLD_V), so the shot comes only from the host.
// Shift tapped while holding adds the boost (the host counts it only for a golfer with the card); I arms the full boost. A click on the course sets the
// aim and holds it there (so the mouse can go down to the button); before a click the aim follows the mouse, as it did.
// #1336 (the owner, 2026-11-15: "the faster you spam the forward arrow key while you are holding the swing the more power you get ... The power boost power keeps dropping"):
// while the swing is held, each tap of Up (or W, or Shift) adds HMETER.tap to a level that halves every HMETER.half seconds; the boost let go with is the level times
// the cap (HMETER.plain for every golfer; HMETER.max with the Power Mash charge armed, I); a putt takes none. swing.ts TAP_BOOST holds the same numbers for the model
const HMETER = { max: 0.06, v: 3, glide: 0.4, line: 0.07, tap: 0.14, half: 0.6, plain: 0.04 };   // (v: swing.ts HOLD_V; glide: seconds; line: radians the camera may be off and need no glide)
const HDRAIN = Math.pow(0.5, 1 / 60 / HMETER.half);   // (the level's fall a step)
function hostArmed() { return !!(HP && HP.pick && HP.pick.armed && hostEarned('boost') && hostCharges() > 0); }
function hostSwBoost(S) { const C = hostClub(); if (!S || !C || C.club === 'putter') return 0; return Math.round(Math.max(0, Math.min(1, S.lv || 0)) * (hostArmed() ? HMETER.max : HMETER.plain) * 1e4) / 1e4; }
function hostBoostTap() {   // one tap while the swing is held (not on a putt, not once let go): the level up by HMETER.tap, at most full
  const S = HP && HP.sw, C = hostClub(); if (!S || S.rel || !C || C.club === 'putter') return false;
  S.lv = Math.min(1, (S.lv || 0) + HMETER.tap); S.taps = (S.taps || 0) + 1; return true;
}
// T456 (the owner, 2026-11-13: "the putting stroke should go past the hole"): a putt's meter reaches well past the hole: its top is 1.6 times the way to the
// hole, and at least 3 m past it (swing.ts HOLD_PUTT_TOP: never more than 5 times). A full shot's top is the club's full carry, as before.
const HOLD_PUTT_TOP = 5;
function hostPuttTop() { const D = HP && HP.turn ? +HP.turn.distM || 0 : 0; return D > 0 ? Math.min(HOLD_PUTT_TOP, Math.max(1.6, (D + 3) / D)) : 1.6; }
// T456: the aim as a target: the point clicked (or pointed at), kept within the club's reach, its distance, the model's power that lands the ball there
// (a full shot: the share of the club's carry in this lie, the host's playsM, so a lie that costs distance asks for more) or rolls it there (a putt: the
// share of the way to the hole), and the meter's fill for it; null without a club or an aim off the ball
function hostTarget() {
  const C = hostClub(), t = HP && HP.turn; if (!C || !t) return null;
  const S = hostS(), putt = C.club === 'putter', dx = aim.x - ball.x, dy = aim.y - ball.y, d = Math.hypot(dx, dy); if (!(d > 0.05)) return null;
  const unit = putt ? Math.hypot(hole.pin.x - ball.x, hole.pin.y - ball.y) : (C.playsM !== undefined ? C.playsM : C.carryM) * S;
  if (!(unit > 0)) return null;
  const top = putt ? hostPuttTop() : 1, dd = Math.min(d, unit * top);
  return { x: ball.x + dx / d * dd, y: ball.y + dy / d * dd, d: dd, pw: dd / unit, u: dd / (unit * top), putt, top };
}
// T456: the target drawn on the ground: a ring lying flat on the slope (a full shot: one standard deviation of the spread across the line at that
// distance; a putt: a little more than a cup) and a small chevron inside it pointing along the shot line; marks on the ground, hidden behind whatever
// stands nearer (the golfer, a tree), as the putting grid is
function hostTargetRing(T, C) {
  // (2026-11-15, the owner: "Two rings that don't agree"; the flat screen ellipse of 2026-11-14 was meant for the isometric map): one marker only, where the ball
  // lands (hostAim). The point aimed at is a small cross on the ground; a putt's a small ring on the green, a little more than the cup
  const S = hostS(), R = T.putt ? Math.max(0.25 * S, 0.05 * T.d) : Math.max(1.2 * S, (C.scatterM || 0) / 2 * T.pw * S);
  HP.target = { x: T.x, y: T.y, d: T.d, u: T.u, pw: T.pw, top: T.top, R };   // (kept for the harness and the map)
  if (T.putt) groundRing(T.x, T.y, Math.min(R, 0.6 * S), AIM_G); else aimCross(T.x, T.y, AIM_W);
}
let swingBtnDown = false, hostAimPin = false;
function hostSwingHeld() { return swingBtnDown || !!keys.Space; }
function hostLineUp(S) {   // one step of the camera's glide behind the ball, along the aim, with the green ahead; true once it is lined up
  const g = S.g; if (!g) return true;
  g.t = Math.min(1, g.t + 1 / 60 / HMETER.glide); const e = g.t * g.t * (3 - 2 * g.t);
  camYaw = g.y0 + g.dy * e; camD = g.d0 + (camK.d - g.d0) * e; camHk = g.h0 + (camK.hk - g.h0) * e; aimCam();
  if (g.t >= 1) S.g = null;
  return !S.g;
}
function hostSwing(p) {   // one step of the swing; true while it holds the golfer (updatePlayer then does nothing else)
  const down = hostSwingHeld(), edge = down && !HP.mwas; HP.mwas = down;
  const S = HP.sw, C = hostClub();
  if (!S) {
    // J5e ("holding the swing button left the meter at 0%"): a press made while he cannot swing yet (the last shot still settling, a turn not come)
    // is kept while it is held, and starts the swing the moment he can; it used to be spent on the moment it was made, and the hold did nothing
    const ready = !!C && !hostBusy() && nearBall() && player.swing < 0 && !cart.on;
    if (!down) HP.pend = false; else if (edge && !ready) HP.pend = true;
    if (!(edge || HP.pend) || !down || !ready) return false;
    HP.pend = false;
    let dy = Math.atan2(aim.dy, aim.dx) + 1.5708 - camYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));   // (the camera behind him looks his way: its yaw is his heading plus a quarter turn)
    const g = Math.abs(dy) > HMETER.line || Math.abs(camD - camK.d) > 0.5 || Math.abs(camHk - camK.hk) > 0.05 ? { t: 0, y0: camYaw, dy, d0: camD, h0: camHk } : null;   // (J5e: to the framing the tee chose, not the default view)
    HP.sw = { t: 0, u: 0, lv: 0, spd: Math.max(0.3, C.speed > 0 ? C.speed : 1), g, rel: false };   // (J5e: never a meter too slow to see move) heartT = 0; charging = true; power = 0; hostAimPin = true;
    if (HP.ring) prewarmAt(HP.ring.x, HP.ring.y);   // (the land where it will come down is made while he lines up and swings)
    return true;
  }
  if (S.lv && !S.rel) S.lv = S.lv * HDRAIN < 1e-4 ? 0 : S.lv * HDRAIN;   // (#1336: the boost falls all the time; taps hold it up)
  const fx = -aim.dy, fy = aim.dx;                                     // he stands side-on: the target is to his left
  p.x += (ball.x - fx * 0.64 - p.x) * 0.3; p.y += (ball.y - fy * 0.64 - p.y) * 0.3; p.th = Math.atan2(fy, fx); p.fa = Math.round(p.th / 6.2832 * 16 + 16) % 16; p.moving = false;
  if (S.rel) {                                                         // the downswing: the club comes down from where it was; the ball is struck as it passes
    p.al += 0.34; if (p.al < 0) return true;
    HP.sw = null; p.swing = 1; p.al = 0.01; hostStrike(); return true;
  }
  if (!hostLineUp(S)) {                                                // the camera lines up first; the meter waits
    if (!down) { HP.sw = null; charging = false; power = 0; p.al = 0; }   // (let go before it was lined up: no swing)
    return true;
  }
  if (down) {                                                          // the backswing: the power rises to 100% in 1 / speed seconds, falls back, rises again
    S.t += 1 / 60; S.u = 0.5 - 0.5 * Math.cos(Math.PI * S.t * S.spd);
    if (--heartT <= 0) { sndHeart(); heartT = Math.round((50 - 24 * S.u) * (HP.pick && HP.pick.armed ? 0.6 : 1)); }   // the heart beats, faster as the power builds (and faster still with the boost armed, T443)
    power = S.u; p.al = -2 * S.u;
    return true;
  }
  if (S.u < 0.02) { HP.sw = null; charging = false; power = 0; p.al = 0; return true; }   // (J5e: let go before the meter moved: no swing, not a stroke spent at 0%)
  HP.out = { power: S.u * (C.club === 'putter' ? hostPuttTop() : 1), u: S.u, acc: 0, boost: hostSwBoost(S), v: HMETER.v }; HP.lastSw = HP.out;
  S.rel = true; charging = false; if (C.club !== 'putter') sndBreath();   // (let go: he draws a breath and swings down)
  sndMsg('swish', { club: C.club, p: S.u });   // (J11: and the club comes down through the air: its swish, by the club)
  return true;
}
function hostMeterShow() {   // the meter on the swing button: the power held, the club and the boost; after the strike the power played
  const S = HP.sw, on = !!S || (player.swing >= 0 && !!HP.lastSw), turn = !!(HP.turn && !HP.over);
  if (powerEl.className) powerEl.className = '';                     // (host mode: the swing button carries the meter)
  const cls = turn ? (on ? 'on swinging' : hostBusy() || !nearBall() ? 'on idle' : 'on') : '';
  if (swingBtn.className !== cls) swingBtn.className = cls;
  if (!turn) { hostAimRead(null); return; }
  const pw = S ? S.u : on ? (HP.lastSw.u !== undefined ? HP.lastSw.u : HP.lastSw.power) : 0, boost = S ? hostSwBoost(S) : on ? HP.lastSw.boost : 0, putt0 = !!hostClub() && hostClub().club === 'putter';
  swingFill.style.width = (Math.max(0, Math.min(1, pw)) * 100).toFixed(1) + '%';
  const txt = S && S.g ? 'Lining up ...' : S || on ? Math.round(pw * 100) + '%  ' + clubName(club) + (boost > 0 ? '  +' + (boost * 100).toFixed(1) + '% boost' : '') + (S && !S.rel ? (putt0 ? '  -  let go to hit' : '  -  tap ↑ boost, let go') : '') : !nearBall() ? 'Walk to your ball (J)' : 'Hold to swing (or Space)';
  if (swingTxt.textContent !== txt) swingTxt.textContent = txt;
  { const bw = S && !putt0 && !S.g ? (Math.round(Math.max(0, Math.min(1, S.lv || 0)) * 200) / 2).toFixed(1) + '%' : '', bc = bw ? 'boostbar on' + (hostArmed() ? ' armed' : '') : 'boostbar';   // (#1336: the boost bar over the power, written only when it moves)
    if (swingBoost.style.width !== bw) swingBoost.style.width = bw; if (swingBoost.className !== bc) swingBoost.className = bc; }
  // T456: the bar's marks: where the aim is (the fill that lands or rolls the ball there: hold to it and let go) and, on a putt, where the hole is
  const T = !on || S ? hostTarget() : null, C = hostClub(), putt = !!C && C.club === 'putter';
  hostAimRead(T && nearBall() && !hostBusy() ? T : null);   // (J5f: the aim's distance, above the club box, while the ring is drawn)
  const aimAt = T ? (T.u * 100).toFixed(1) + '%' : '', holeAt = putt ? (100 / hostPuttTop()).toFixed(1) + '%' : '';
  if (swingAimMk.style.left !== aimAt) { swingAimMk.style.left = aimAt; swingAimMk.className = T ? 'aimmk on' : 'aimmk'; }
  if (swingHoleMk.style.left !== holeAt) { swingHoleMk.style.left = holeAt; swingHoleMk.className = putt ? 'holemk on' : 'holemk'; }
  const tip = T ? 'Aim: ' + Math.round(T.u * 100) + '%' + (putt ? ', the hole at ' + Math.round(100 / hostPuttTop()) + '%' : '') : '';
  if (swingBtn.title !== tip) swingBtn.title = tip;
}
// J5f (the owner, 2026-11-14): the aim's distance read out above the club box: from the ball to the aim ring, in metres (held at the club's reach: "max"). The ring is
// where the shot is aimed; the blue ribbon (hostAim) ends on it at that strength. Written only when it changes; empty (hidden) without an aim to read
function hostAimRead(T) {
  const m = T ? T.d / hostS() : 0, txt = T ? 'Aim <b>' + (m < 10 ? m.toFixed(1) : Math.round(m)) + ' m</b>' + (T.u > 0.9995 ? '<i>max</i>' : '') : '';
  if (txt !== aimShown) { aimShown = txt; aimEl.innerHTML = txt; }
}
// the swing button: held with the mouse (or a finger) it swings; its presses never reach the course (so they never set the aim either)
const swingBtn = document.createElement('div'), swingFill = document.createElement('i'), swingTxt = document.createElement('span'), swingAimMk = document.createElement('b'), swingHoleMk = document.createElement('b'), swingBoost = document.createElement('u');
swingBtn.id = 'swingBtn'; swingAimMk.className = 'aimmk'; swingHoleMk.className = 'holemk'; swingBoost.className = 'boostbar'; swingBtn.appendChild(swingFill); swingBtn.appendChild(swingBoost); swingBtn.appendChild(swingHoleMk); swingBtn.appendChild(swingAimMk); swingBtn.appendChild(swingTxt);   // (T456: the aim's and the hole's marks on the bar)
{
  const up = (e) => { swingBtnDown = false; if (e && e.stopPropagation) e.stopPropagation(); };
  swingBtn.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    if (!nearBall() && ball.state === 0 && !bcam && !(HP && hostBusy())) { jumpToBall(); if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); return; }   // (J5d: it reads "Walk to your ball (J)": a press does that, and he is at address)
    swingBtnDown = true;
    try { if (swingBtn.setPointerCapture) swingBtn.setPointerCapture(e.pointerId); } catch (x) { /* (no capture: pointerup on the button still ends it) */ }
    const a = audio(); if (a && a.state === 'suspended') a.resume();
    if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation();
  });
  swingBtn.addEventListener('pointerup', up); swingBtn.addEventListener('pointercancel', up); swingBtn.addEventListener('lostpointercapture', up);
  swingBtn.addEventListener('mousedown', (e) => { if (e.stopPropagation) e.stopPropagation(); });
  if (hudEl && hudEl.appendChild) hudEl.appendChild(swingBtn);
}

// T422: the card says what the model will use: the lie (its kind and what it does), the slope under the ball, and the wind now with the day's gusts
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function hostRead() { const e = HP && HP.turn && HP.turn.earned; return !e || e.read !== false; }   // J6: the putt read (its line and pace) is earned; an older host's turn: open
function hostOnTurn() { return !!(HP && HP.turn && !HP.play && ball.state === 0); }
function hostCardRows(row) {
  const t = HP.turn, s = t.slope || { up: 0, across: 0 }, w = t.wind || { mph: 0, from: 0 }, pc = (v) => Math.round(Math.abs(v) * 100) + '%';
  const up = Math.abs(s.up) < 0.01 ? 'level' : (s.up > 0 ? 'uphill ' : 'downhill ') + pc(s.up), side = Math.abs(s.across) < 0.01 ? '' : ', ball ' + (s.across > 0 ? 'above' : 'below') + ' feet ' + pc(s.across);
  const wind = w.mph < 1 ? 'calm' : Math.round(w.mph) + ' mph from the ' + COMPASS[Math.round((((w.from % 360) + 360) % 360) / 45) % 8] + (t.gust > w.mph + 1 ? ', gusts ' + Math.round(t.gust) : '');
  return (t.green ? row('Read', hostRead() ? t.green.read.replace(/^Green read: /, '') : 'locked: ' + ((t.earned && t.earned.why && t.earned.why.read) || 'the Putting drill')) : '') + row('Slope', up + side) + row('Wind', wind) + (hostClub() && hostClub().club !== 'putter' ? row('Shot', hostPickText()) : '') + (t.lieNote ? '<div class="note">' + t.lieNote + '</div>' : '');
}
function hostWindDir() {   // the way the host's wind blows (toward), on the ground: the arrow shows it; null without a turn (the view's own wind)
  if (!HP || !HP.turn || !HP.turn.wind || HP.turn.wind.mph < 1) return null;
  const b = HP.turn.wind.from * Math.PI / 180; return [-Math.sin(b), Math.cos(b)];   // (from the north, 0, it blows south: + y)
}
// T441, T442, T443: the shot he picks before the swing, the model's preview of it, and what he has earned.
// - The shape (shape.ts ShotShape): the curve (draw, straight, fade; Z steps through them) and the flight (normal, high, low; X).
// - The spin is no longer picked here (#1336): it is tapped in with the arrows while the ball is in the air (hostSpinTap), the one way to spin.
// - The boost (I, or the button): armed, the Power Mash charge raises the tapped boost's cap to swing.ts BOOST.max (more carry, a wider miss), one charge (#1336: the
//   boost itself is tapped in with Up while the swing is held, hostBoostTap).
// What he has not earned (turn.earned, unlocks.ts) is greyed and says what unlocks it; the host takes it out of an input anyway.
// The aim draws the host's preview: the model's shot for this pick with no luck in it (its curve, its landing, then its bounce and roll as a fainter line).
function hostEarned(k) { const e = HP && HP.turn && HP.turn.earned; return !e || !!e[k]; }   // (an older host sends none: everything)
function hostWhy(k) { const e = HP && HP.turn && HP.turn.earned; return (e && e.why && e.why[k]) || ''; }
function hostCharges() { const t = HP && HP.turn; return t && t.charges !== undefined ? t.charges : hostEarned('boost') ? 1 : 0; }
function hostPick() { if (!HP.pick) HP.pick = { curve: 0, flight: 0, armed: false }; return HP.pick; }
function hostLock(n) { say(n[0].toUpperCase() + n.slice(1) + ' is locked: ' + (hostWhy(n) || 'not earned yet'), 200); return false; }
// J5f (the owner, 2026-11-14: "add a slider so you can increase and decrease the draw or fade. low or high flight too"): the curve and the flight are amounts, -1 to 1 (a full
// draw .. straight .. a full fade; low .. normal .. high), set by the panel's sliders (hostPickAmt) and sent as they are; the old picks are the ends and the middle.
function hostPickSet(k) {   // a pick from a button or a key; a locked one says what unlocks it
  const P = hostPick();
  if (k === 'draw' || k === 'fade') { if (!hostEarned(k)) return hostLock(k); P.curve = P.curve === (k === 'draw' ? -1 : 1) ? 0 : k === 'draw' ? -1 : 1; }
  else if (k === 'straight') P.curve = 0;
  else if (k === 'high' || k === 'low') { if (!hostEarned(k)) return hostLock(k); P.flight = P.flight === (k === 'high' ? 1 : -1) ? 0 : k === 'high' ? 1 : -1; }
  else if (k === 'normal') P.flight = 0;
  else if (k === 'boost') { if (!hostEarned('boost')) return hostLock('boost'); if (!P.armed && hostCharges() <= 0) { say('No boost left on this hole', 150); return false; } P.armed = !P.armed; }
  else if (k === 'curve') return hostStep('curve', P.curve, [-1, 1], ['draw', 'fade']);
  else if (k === 'flight') return hostStep('flight', P.flight, [1, -1], ['high', 'low']);
  shotShown = ''; return true;
}
function hostStep(kind, cur, ends, names) {   // Z, X: straight, then a full draw (high), then a full fade (low), then straight again; a side he has not earned is passed over (none earned: the first says what unlocks it)
  const vals = [0, ends[0], ends[1]], at = cur === 0 ? 0 : Math.sign(cur) === ends[0] ? 1 : 2;   // (a part amount counts as its side)
  for (let j = 1; j <= 2; j++) { const s = (at + j) % 3; if (s === 0 || hostEarned(names[s - 1])) { hostPick()[kind] = vals[s]; shotShown = ''; return true; } }
  return hostLock(names[0]);
}
function hostPickAmt(kind, v) {   // J5f: a slider's amount (kind 'curve' or 'flight'), -1 to 1 to the hundredth; the side he has not earned is held at the middle and says what unlocks it
  const P = hostPick(), cv = kind === 'curve', neg = cv ? 'draw' : 'low', pos = cv ? 'fade' : 'high';
  let a = Number(v); a = Number.isFinite(a) ? Math.round(Math.max(-1, Math.min(1, a)) * 100) / 100 : 0;
  if (a < 0 && !hostEarned(neg)) { hostLock(neg); a = 0; } else if (a > 0 && !hostEarned(pos)) { hostLock(pos); a = 0; }
  P[cv ? 'curve' : 'flight'] = Math.abs(a) < 0.02 ? 0 : a;   // (shape.ts SHAPE_MIN: a hair off the middle is none)
  shotShown = ''; return P[cv ? 'curve' : 'flight'];
}
function hostPickText() {   // (J5f: a part amount says how much, as shape.ts pickText does: "Draw 40%"; a full one is just "Draw")
  const P = hostPick(), pc = (v) => (Math.abs(v) >= 0.995 ? '' : ' ' + Math.round(Math.abs(v) * 100) + '%'), c = P.curve < 0 ? 'Draw' + pc(P.curve) : P.curve > 0 ? 'Fade' + pc(P.curve) : '', f = P.flight > 0 ? 'high' + pc(P.flight) : P.flight < 0 ? 'low' + pc(P.flight) : '';
  return [c && f ? c + ', ' + f : c || (f ? f[0].toUpperCase() + f.slice(1) : 'Straight'), P.armed ? 'boost cap up' : ''].filter(Boolean).join(' · ');
}
function hostShotIn() {   // what the pick adds to an input (none for a putt)
  const P = hostPick(), c = hostClub(); if (!c || c.club === 'putter') return {};
  const o = {}; if (P.curve || P.flight) o.shape = { curve: P.curve, flight: P.flight }; return o;   // (#1336: the spin is tapped in the air, not picked)
}
// 2026-11-15 (the owner: "Why not make the draw and fade like normal golf games where you just move the dot on the ball?"): the shot is shaped on a ball, as golf
// games do: a dot dragged across it, left a draw and right a fade (the curve), up high and down low (the flight). It sends what the sliders did (hostPickAmt: the
// curve and the flight, -1..1, a side he has not earned held at the middle with its message), so the model is unchanged. The gold ring is his limit
// (turn.clubs[].bend: his full bend against a scratch golfer's): the dot cannot pass it, and at the ring the amount is his full 1, which the model turns into the
// share he pulls off, as before. Folded under it: how to boost and spin (#1336: Up tapped while the swing is held, the arrows in the air) and Go for it, which arms the
// Power Mash charge (the boost's higher cap). The panel is shut until the corner button opens it, and the choice is kept (cl_shotopen).
const shotEl = document.createElement('div'); shotEl.id = 'shotc';
const shotBtn = document.createElement('button'); shotBtn.type = 'button'; shotBtn.id = 'shotBtn'; shotBtn.title = 'Shape the shot: draw, fade, high, low';
shotBtn.innerHTML = '<canvas width="64" height="64"></canvas><span>Straight</span>';
const SHAPE_LAB = 'Drag the dot: left draw, right fade, up high, down low';
const tileImg = (k) => '<img class="e-' + k + '" data-e="' + k + '" src="tiles/shot-' + k + '.webp" alt="" aria-hidden="true" draggable="false">';
shotEl.innerHTML = '<div class="sh"><b>Shot shape</b><em id="pickTxt"></em><button type="button" class="rst" data-k="reset" title="Back to a straight shot (or double-click the ball)">Reset</button></div>'
  + '<div class="bw">' + tileImg('draw') + tileImg('fade') + tileImg('high') + tileImg('low') + '<canvas id="shapeBall" width="192" height="192"></canvas><canvas id="shapeArc" width="64" height="64"></canvas></div>'
  + '<div class="lab">' + SHAPE_LAB + '</div><div class="lim" id="limTxt"></div>'
  + '<details><summary>Spin and boost</summary><div class="hw"><img src="tiles/shot-spin.webp" alt="" aria-hidden="true" draggable="false"><span><b class="k">Boost</b> hold the swing and tap ↑ (or W) fast; it falls when you stop, so let go at the peak.<br><b class="k">Spin</b> while the ball flies tap ↓ back, ↑ top, ← → side; the opposite arrow takes it off.</span></div>'
  + '<div class="st"><b data-k="boost" class="boost"><img src="tiles/go-for-it.webp" alt="" aria-hidden="true" draggable="false"><span class="tx"><span class="nm">Go for it (I)</span><em class="lw" id="boostTxt"></em></span></b></div><div class="lim" id="spinTxt"></div></details>';
if (typeof hudEl !== 'undefined' && hudEl.appendChild) hudEl.appendChild(shotEl);
if (cornerEl && cornerEl.insertBefore) cornerEl.insertBefore(shotBtn, cornerEl.firstChild);
const q1 = (el, s) => (el && el.querySelector ? el.querySelector(s) : null), c2d = (cv) => (cv && cv.getContext ? cv.getContext('2d') : null);
const shapeBall = q1(shotEl, '#shapeBall'), shctx = c2d(shapeBall), arcCtx = c2d(q1(shotEl, '#shapeArc')), btnCtx = c2d(q1(shotBtn, 'canvas')), btnTxt = q1(shotBtn, 'span');
let shotShown = '', shotOpen = false, shapeDrag = false, tipShown = false;
try { shotOpen = localStorage.getItem('cl_shotopen') === '1'; } catch (e) { /* (no storage: shut) */ }
function shapeRing() { const C = hostClub(), B = C && C.bend; return B && B.scrM > 0 ? clamp(B.m / B.scrM, 0.3, 1) : 1; }   // his limit's ring, as a share of the ball's radius (a scratch golfer's full bend: the whole ball)
function shapeAmt(px, py, rr) {   // a point on the ball (-1..1 each, y up; the ball's edge at 1) -> [curve, flight]: held inside the ring, the ring's edge a full 1, a dot near the middle none
  let x = px, y = py; const l = Math.hypot(x, y); if (l > rr) { x *= rr / l; y *= rr / l; }
  if (Math.hypot(x, y) < 0.1 * rr) return [0, 0];
  return [Math.round(x / rr * 100) / 100, Math.round(y / rr * 100) / 100];
}
function hostShapeAt(c, f) { hostPickAmt('curve', c); hostPickAmt('flight', f); return hostShotIn().shape || null; }   // (the ball's dot: the same two amounts the sliders sent)
function shapeFrom(e) { if (!HP || !shapeBall || !shapeBall.getBoundingClientRect) return; const r = shapeBall.getBoundingClientRect(), k = 192 / 88; const a = shapeAmt(((e.clientX - r.left) / r.width - 0.5) * k, -((e.clientY - r.top) / r.height - 0.5) * k, shapeRing()); hostShapeAt(a[0], a[1]); }
if (typeof addEventListener === 'function') {   // #1301: a drag that began on a ball goes on past its edge; let go anywhere
  addEventListener('mousemove', (e) => { if (shapeDrag) shapeFrom(e); });
  addEventListener('mouseup', () => { shapeDrag = false; });
}
if (shotBtn.addEventListener) {
  shotBtn.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); });   // (no focus left on it: Space swings)
  shotBtn.addEventListener('click', () => { shotOpen = !shotOpen; try { localStorage.setItem('cl_shotopen', shotOpen ? '1' : '0'); } catch (err) { /* (not kept) */ } shotShown = ''; });
}
if (shotEl.addEventListener) {
  shotEl.addEventListener('contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); if (!HP) return; if (e.target === shapeBall) hostShapeAt(0, 0); });   // (right-click on a ball: none)
  shotEl.addEventListener('dblclick', (e) => { if (HP && e.target === shapeBall) hostShapeAt(0, 0); });
  shotEl.addEventListener('mousedown', (e) => {
    if (e.stopPropagation) e.stopPropagation();
    let t = e.target; if (t && t.tagName === 'SUMMARY') return;   // (the fold opens itself)
    if (e.preventDefault) e.preventDefault();
    if (!t || !HP) return;
    if (t === shapeBall) { if ((e.button | 0) === 0) { shapeDrag = true; shapeFrom(e); } return; }
    while (t && t !== shotEl && !(t.dataset && t.dataset.k)) t = t.parentNode;
    if (!t || t === shotEl) return;
    if (t.dataset.k === 'reset') hostShapeAt(0, 0); else hostPickSet(t.dataset.k);
  });
}
function shapeWords(P) {   // (J5f: a part amount says how much, as shape.ts pickText does: "Draw 40%"; a full one is just "Draw")
  const pc = (v) => (Math.abs(v) >= 0.995 ? '' : ' ' + Math.round(Math.abs(v) * 100) + '%'), c = P.curve < 0 ? 'Draw' + pc(P.curve) : P.curve > 0 ? 'Fade' + pc(P.curve) : '', f = P.flight > 0 ? 'high' + pc(P.flight) : P.flight < 0 ? 'low' + pc(P.flight) : '';
  return c && f ? c + ', ' + f : c || (f ? f[0].toUpperCase() + f.slice(1) : 'Straight');
}
function hostShotShow() {   // the button and the panel, written only when something changed
  const C = hostClub(), on = hostOnTurn() && !hostBusy() && !HP.sw && nearBall() && !!C && C.club !== 'putter', P = hostPick();
  const sig = on ? [P.curve, P.flight, P.armed, hostCharges(), club, shotOpen, JSON.stringify((HP.turn && HP.turn.earned) || '')].join('|') : 'off';
  if (sig === shotShown) return; shotShown = sig;
  shotEl.className = on && shotOpen ? 'on' : ''; shotBtn.className = on ? 'on' + (shotOpen ? ' open' : '') : '';
  if (!on) return;
  if (!tipShown) { tipShown = true; try { if (!localStorage.getItem('cinderlinks.tip')) { localStorage.setItem('cinderlinks.tip', '1'); say('Shape the shot on the ball, bottom right  ·  ? shows the keys', 320); } } catch (e) { /* (no storage: no tip) */ } }   // (once: help is a hint, never paragraphs)
  if (btnTxt) btnTxt.textContent = shapeWords(P);
  if (btnCtx && btnCtx.createRadialGradient) paintShape(btnCtx, 64, P, false);
  if (!shotOpen || !shotEl.querySelectorAll) return;
  for (const b of shotEl.querySelectorAll('b[data-k]')) {   // (the Go for it button)
    const k = b.dataset.k, earnedK = hostEarned(k), sel = k === 'boost' && P.armed;
    b.className = (k === 'boost' ? 'boost ' : '') + (sel ? 'sel' : '') + (earnedK ? '' : ' lock'); b.title = earnedK ? 'Arms the Power Mash charge: the tapped boost may go to +6% (the plain cap is +4%)' : 'Locked: ' + hostWhy(k);
  }
  for (const e of shotEl.querySelectorAll('img[data-e]')) { const ok = hostEarned(e.dataset.e); e.className = 'e-' + e.dataset.e + (ok ? '' : ' lock'); }   // (a side he has not earned: its tile dimmed)
  const set = (id, t) => { const el = q1(shotEl, id); if (el) el.textContent = t; return el; };
  set('#pickTxt', shapeWords(P));
  const B = C.bend, locked = ['draw', 'fade', 'high', 'low'].filter((k) => !hostEarned(k)), lockTxt = locked.length ? 'Locked: ' + locked.map((k) => k + ' (' + (hostWhy(k) || 'not earned yet') + ')').join(', ') : '';
  let lim = '', why = '';
  if (B && B.scrM > 0) {   // #1301 (the owner: "indicate if that is my handicap limit or not"): one short line; the why on hover
    const mine = B.pulled < B.scrPulled - 0.02;
    lim = mine ? 'Gold ring: your limit, ' + B.m.toFixed(1) + ' m of bend (a pro ' + B.scrM.toFixed(1) + ' m)' : 'Full bend ' + B.m.toFixed(1) + ' m at ' + Math.round(C.carryM) + ' m';
    why = mine ? 'You pull off ' + Math.round(B.pulled * 100) + '% of a shaped shot (club skill ' + Math.round(B.skill * 100) + ', accuracy ' + Math.round(B.accuracy * 100) + '): the dot stops at the ring. Practise Shot shaping to widen it.' : 'As much as a scratch golfer: the game bends a shot a few degrees at most.';
  }
  const le = set('#limTxt', lim || lockTxt); if (le) le.title = [why, lim ? lockTxt : ''].filter(Boolean).join(' ');
  if (shapeBall) shapeBall.title = SHAPE_LAB + '. Double-click: straight.' + (why ? ' ' + why : '') + (lockTxt ? ' ' + lockTxt : '');
  const lk = ['side', 'back'].filter((k) => !hostEarned(k)); set('#spinTxt', lk.length ? 'Locked: ' + lk.map((k) => (k === 'side' ? 'side spin' : 'backspin') + ' (' + (hostWhy(k) || 'not earned yet') + ')').join(', ') : '');   // (#1301: what is locked, in words)
  const bt = q1(shotEl, '#boostTxt'); if (bt) bt.textContent = hostEarned('boost') ? (P.armed ? 'armed: cap +6%' : 'raises the cap') + ' · ' + hostCharges() + ' left this hole' : 'Locked: ' + hostWhy('boost');
  if (shctx && shctx.createRadialGradient) paintShape(shctx, 192, P, true);
  if (arcCtx && arcCtx.quadraticCurveTo) paintArc(arcCtx, P);
}
function ballFace(c, W, big) {   // a lit golf ball filling a W x W canvas (the light at the upper right), with dimples when big
  const R = W * 88 / 192, cx = W / 2, cy = W / 2, g = c.createRadialGradient(cx + R * 0.32, cy - R * 0.34, R * 0.07, cx, cy, R);
  g.addColorStop(0, '#fffef8'); g.addColorStop(0.55, '#e9e3d2'); g.addColorStop(1, '#8d8777'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fill();
  if (big) { c.fillStyle = 'rgba(80, 74, 60, 0.16)'; for (let i = 0; i < 46; i++) { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 46) * (R - 9), k = 1 - 0.35 * (r / R); c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 5.4 * k, 0, 6.2832); c.fill(); } }
  return R;
}
function paintShape(c, W, P, big) {   // the shape ball: the sides he has not earned dimmed, the cross, the gold ring of his limit, the dot
  c.clearRect(0, 0, W, W); const R = ballFace(c, W, big), cx = W / 2, cy = W / 2, rr = shapeRing();
  if (c.save && c.clip) { c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.clip(); c.fillStyle = 'rgba(20, 21, 25, 0.5)'; if (!hostEarned('draw')) c.fillRect(0, 0, cx, W); if (!hostEarned('fade')) c.fillRect(cx, 0, W - cx, W); if (!hostEarned('high')) c.fillRect(0, 0, W, cy); if (!hostEarned('low')) c.fillRect(0, cy, W, W - cy); c.restore(); }
  c.strokeStyle = 'rgba(60, 54, 40, 0.35)'; c.lineWidth = big ? 1.5 : 1; c.beginPath(); c.moveTo(cx - R * 0.88, cy); c.lineTo(cx + R * 0.88, cy); c.moveTo(cx, cy - R * 0.88); c.lineTo(cx, cy + R * 0.88); c.stroke();
  if (big && rr < 0.995) { c.strokeStyle = '#f5b52e'; c.lineWidth = 2.5; if (c.setLineDash) c.setLineDash([7, 5]); c.beginPath(); c.arc(cx, cy, R * rr, 0, 6.2832); c.stroke(); if (c.setLineDash) c.setLineDash([]); }
  c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = big ? 3 : 2; c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.stroke();
  const x = cx + P.curve * rr * R, y = cy - P.flight * rr * R; c.fillStyle = '#e8573c'; c.strokeStyle = '#fff'; c.lineWidth = big ? 3 : 2; c.beginPath(); c.arc(x, y, big ? 10 : 6, 0, 6.2832); c.fill(); c.stroke();
}
function paintArc(c, P) {   // the small arrow beside the ball: the shape picked, from the ball (bottom) out to the target (top): a draw bends left, a fade right, a high one climbs steeper
  c.clearRect(0, 0, 64, 64); const x0 = 32, y0 = 58, x1 = 32 + P.curve * 20, y1 = 10 - P.flight * 4, mx = 32 - P.curve * 4, my = 30 - P.flight * 8;
  for (const [w, col] of [[6, 'rgba(0, 0, 0, 0.55)'], [3, '#f5b52e']]) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); }
  const ax = x1 - mx, ay = y1 - my, al = Math.hypot(ax, ay) || 1, ux = ax / al, uy = ay / al; c.fillStyle = '#f5b52e'; c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(x1 + ux * 6, y1 + uy * 6); c.lineTo(x1 - ux * 4 - uy * 6, y1 - uy * 4 + ux * 6); c.lineTo(x1 - ux * 4 + uy * 6, y1 - uy * 4 - ux * 6); c.closePath(); c.fill(); c.stroke();
}
function hostLockWords(neg, pos) { const lo = hostEarned(neg), hi = hostEarned(pos); return lo && hi ? '' : ' Locked: ' + [lo ? '' : neg + ' (' + (hostWhy(neg) || 'not earned yet') + ')', hi ? '' : pos + ' (' + (hostWhy(pos) || 'not earned yet') + ')'].filter(Boolean).join(', ') + '.'; }   // (#1301: what is locked, and what unlocks it, in words)
// the preview: asked for when the pick, the club or the line changes (a few times a second at most), drawn when the answer is for what is picked now
function hostAimSig() { const c = hostClub(), P = hostPick(); return c ? [c.club, P.curve, P.flight, P.armed, Math.round(Math.atan2(aim.dy, aim.dx) * 360 / Math.PI)].join('|') : ''; }
function hostAimAsk() {
  if (!hostOnTurn() || hostBusy() || HP.sw || !nearBall() || !hostClub() || hostClub().club === 'putter') return;
  const sig = hostAimSig(); HP.tk = (HP.tk || 0) + 1; if (sig === HP.pvSig || HP.tk - (HP.pvAt || -99) < 8) return;
  const t = HP.turn, S = hostS(); HP.pvSig = sig; HP.pvAt = HP.tk; HP.pvKey = (HP.pvKey || 0) + 1;
  hostSend({ t: 'aim', key: HP.pvKey, input: Object.assign({ holeIdx: t.holeIdx, stroke: t.stroke, club: hostClub().club, aim: [aim.x / S, aim.y / S], power: 1 }, hostShotIn(), HP.pick.armed ? { swing: { power: 1, acc: 0, boost: HMETER.max, v: HMETER.v } } : {}) });
}
const AIM_RL = rgb(150, 205, 255);   // the bounce and roll after the landing: a fainter line
function hostAimPreview(C, pw, hot, ph) {   // the preview's flight (scaled to the power while he swings), its landing ring, and its roll; false when there is none for this pick
  const pv = HP.pv; if (!pv || !pv.shot || pv.sig !== HP.pvSig || pv.club !== C.club) return false;
  const m = pv.shot, S = hostS(), F = m.flight, n = F.length; if (n < 2) return false;
  const bx = ball.x, by = ball.y, k = pw, ax0 = bx + (F[0][0] * S - bx) * k, ay0 = by + (F[0][1] * S - by) * k, Lx = bx + (F[n - 1][0] * S - bx) * k, Ly = by + (F[n - 1][1] * S - by) * k;
  const g0 = aimH(ax0, ay0), g1 = aimH(Lx, Ly), dl0 = Math.hypot(Lx - ax0, Ly - ay0);   // (the arc over the strike-to-landing line, as the ball flies it: flightBase)
  // 2026-11-15 (the owner: "it climbs, then hooks back on itself at its end, a hard turn into the ground"): every sample, and the height as the ball flies
  // it (no longer pushed up to the ground under it, which bent the line at the landing): one smooth line that comes down where the ring is
  let kh = 1; const top = arcTop(Lx, Ly, g1);
  for (let i = 0; i < n; i++) { const qx = bx + (F[i][0] * S - bx) * k, qy = by + (F[i][1] * S - by) * k, f = dl0 > 1e-6 ? Math.min(1, Math.hypot(qx - ax0, qy - ay0) / dl0) : 1; kh = arcKeep(qx, qy, g0 + (g1 - g0) * f, F[i][2] * S * k, kh, top); }
  ribStart();
  for (let i = 0; i < n; i++) {
    const qx = bx + (F[i][0] * S - bx) * k, qy = by + (F[i][1] * S - by) * k, f = dl0 > 1e-6 ? Math.min(1, Math.hypot(qx - ax0, qy - ay0) / dl0) : 1;
    ribAdd(qx, qy, g0 + (g1 - g0) * f + F[i][2] * S * k * kh + 0.03);
  }
  ribbonO(RIB_W * S, false);
  const across = Math.max(0.4, (C.scatterM || 0) / 2 * pv.spread * pw * S), along = Math.max(0.4, (C.longM !== undefined ? C.longM : C.scatterM || 0) / 2 * pv.spread * pw * S);
  groundRing(Lx, Ly, aimSpreadR(across, along, S), hot);
  // the roll: a faint short dash along the ground from the landing straight to where it stops (one that spins back runs back over it: never a loop)
  const E = m.rest || (m.roll && m.roll.length ? m.roll[m.roll.length - 1] : null);
  if (E) { const Ex = bx + (E[0] * S - bx) * k, Ey = by + (E[1] * S - by) * k, rl = Math.hypot(Ex - Lx, Ey - Ly);
    if (rl > 0.8 * S) { ribStart(); const nn = Math.max(2, Math.min(60, Math.ceil(rl / (0.8 * S)))); for (let j = 0; j <= nn; j++) { const u = j / nn, x = Lx + (Ex - Lx) * u, y = Ly + (Ey - Ly) * u; ribAdd(x, y, aimH(x, y) + 0.04); } ribbonO(RIB_W * 0.45 * S, 1); } }
  HP.ring = { x: Lx, y: Ly, across, along, pv: true };
  return true;
}
// T423: the green as the host reads it. Its slope grid is the host's (its own heights: the view's are raised and roughened for the look), drawn as a
// mesh, a dot every metre with a tick downhill, white on the flat, then cyan, yellow, orange as it steepens (green.ts BREAK_COLOURS). A putt is aimed as one is
// read: the aim shows the way a putt struck along it takes (the host's holed way, turned with the aim and stretched with the pace), and the model judges
// it against the read's start line (green3p.ts), so a putt started along the read and struck at the right pace goes in.
const GRID_RGB = [rgb(255, 255, 255), rgb(125, 211, 252), rgb(250, 204, 21), rgb(249, 115, 22), rgb(239, 68, 68)];   // the flowing dots by steepness: white, cyan, yellow, orange, red
// 2026-11-15 (the owner, on the coloured mesh: "the grid is showing but not a single dot that shows the slope ... this grid is yellow. is there no slope?"): his
// green was one even 2% tilt, so every line was the same yellow and the ticks were lost. The read is now drawn as golf games draw it: the lattice's lines are
// neutral, a faint thin white whatever the slope, and the slope is shown by dots that flow downhill along it, one to a point (phase-offset, so together they
// read as a current), each running one lattice step down the slope and fading in and out, their speed and colour by how steep it is there: on the flat they
// barely creep, white; then cyan, yellow, orange, red as it steepens. Worked out once a green (PG_MEMO); a frame only moves them on (pgNow).
const GRID_LINE_A = 70, GRID_LINE = ((rgb(255, 255, 255) & 0xffffff) | (GRID_LINE_A << 24)) >>> 0;
const pgU = (s) => (s <= 0.002 ? 0 : Math.min(1, (s - 0.002) / 0.038));   // (green.ts breakBucket's scale: 0 flat .. 1 at a 4% slope)
const pgBucket = (s) => { const u = pgU(s); return u <= 0 ? 0 : u < 0.25 ? 1 : u < 0.55 ? 2 : u < 0.85 ? 3 : 4; };
const PG_MEMO = new WeakMap();   // T438: a green's grid worked out once a green, not each frame: its points on the land, the dots' runs, the lattice's lines
function pgNow() { return performance.now() / 1000; }   // (the dots' clock, in seconds; the harness sets its own)
function hostPuttPts(G, S) {
  const hv = course && course.raw ? course.raw.hv : 0; let M = PG_MEMO.get(G);
  if (M && M.S === S && M.hv === hv) return M;
  const P = G.pts, n = Math.floor(P.length / 5), c = (G.step > 0 ? G.step : 1) * S, xyz = new Float64Array(n * 3), run = new Float64Array(n * 3), col = new Uint32Array(n), sp = new Float32Array(n), ph = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const k = p * 5, x = P[k] * S, y = P[k + 1] * S, u = pgU(P[k + 4]), ex = x + P[k + 2] * c, ey = y + P[k + 3] * c;
    col[p] = GRID_RGB[pgBucket(P[k + 4])]; xyz[p * 3] = x; xyz[p * 3 + 1] = y; xyz[p * 3 + 2] = groundH(x, y) + 0.02;
    run[p * 3] = ex; run[p * 3 + 1] = ey; run[p * 3 + 2] = groundH(ex, ey) + 0.02;   // (where its dot runs to: one step down the slope)
    sp[p] = 0.05 + 1.15 * u; ph[p] = hash2(p, 17, 5);   // (lattice steps a second: a creep on the flat, over one at 4%)
  }
  // the lattice's lines: each point to its neighbours one step away (found through a hash of step-sized buckets; the diagonals, 1.41 steps, are not lines)
  const B = new Map(), e = [], key = (i, j) => (i + 32768) * 65536 + (j + 32768);
  for (let p = 0; p < n; p++) { const kk = key(Math.floor(xyz[p * 3] / c), Math.floor(xyz[p * 3 + 1] / c)); let L = B.get(kk); if (!L) B.set(kk, L = []); L.push(p); }
  for (let p = 0; p < n; p++) {
    const x = xyz[p * 3], y = xyz[p * 3 + 1], i = Math.floor(x / c), j = Math.floor(y / c);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const L = B.get(key(i + di, j + dj)); if (!L) continue;
      for (const q of L) { if (q <= p) continue; const d = Math.hypot(xyz[q * 3] - x, xyz[q * 3 + 1] - y); if (d > c * 0.8 && d < c * 1.2) e.push(p, q); }
    }
  }
  M = { S, hv, n, xyz, run, col, sp, ph, e: Int32Array.from(e), sx: new Int32Array(n), sy: new Int32Array(n), sd: new Float64Array(n), dots: 0 };
  PG_MEMO.set(G, M); return M;
}
function hostPuttTurn() { const t = HP && HP.turn; return !!t && !!t.green && !hostBusy() && !bcam && ball.state === 0; }   // his putt turn: the ball at rest on the host's green, nothing in flight
function hostPuttGrid() {
  const M = hostPuttPts(HP.turn.green, hostS()), X = M.xyz, Rn = M.run, n = M.n, SX = M.sx, SY = M.sy, SD = M.sd, E = M.e, t = pgNow();
  for (let p = 0; p < n; p++) { projectO(X[p * 3], X[p * 3 + 1], X[p * 3 + 2], PJ); SX[p] = PJ.x; SY[p] = PJ.y; SD[p] = PJ.s > 0 && PJ.d >= 1.5 ? PJ.d : 0; }   // (each point once a frame)
  for (let k = 0; k < E.length; k += 2) {   // the lines between neighbours: neutral, faint
    const a = E[k], b = E[k + 1], ad = SD[a], bd = SD[b]; if (!ad || !bd) continue;
    const ax = SX[a], ay = SY[a], dx = SX[b] - ax, dy = SY[b] - ay, m = Math.max(dx < 0 ? -dx : dx, dy < 0 ? -dy : dy);
    if (m < 2 || m > 700 || (ax < 0 && ax + dx < 0) || (ax >= OW && ax + dx >= OW) || (ay < 0 && ay + dy < 0) || (ay >= OH && ay + dy >= OH)) continue;
    const f = 1 / m, dd = bd - ad;
    for (let i = 0; i < m; i++) { const u = i * f; gridPut(ax + Math.round(dx * u), ay + Math.round(dy * u), ad + dd * u, GRID_LINE); }   // (its far end is the next line's start)
  }
  let dots = 0;
  for (let p = 0; p < n; p++) {   // the dots: each a step down the slope from its point, as far along as the clock has run it, fading in and out at the ends
    if (!SD[p]) continue;
    let u = (M.ph[p] + t * M.sp[p]) % 1; if (u < 0) u += 1;
    const i3 = p * 3; projectO(X[i3] + (Rn[i3] - X[i3]) * u, X[i3 + 1] + (Rn[i3 + 1] - X[i3 + 1]) * u, X[i3 + 2] + (Rn[i3 + 2] - X[i3 + 2]) * u, PJ); if (PJ.s <= 0 || PJ.d < 1.5) continue;
    const a = 96 + Math.round(159 * Math.min(1, Math.sin(Math.PI * u) * 1.6)), c = ((M.col[p] & 0xffffff) | (a << 24)) >>> 0, x = PJ.x, y = PJ.y, d = PJ.d;   // (never as faint as the lines: 96 and up)
    gridPut(x - 1, y, d, c); gridPut(x, y, d, c); gridPut(x + 1, y, d, c); gridPut(x - 1, y - 1, d, c); gridPut(x, y - 1, d, c); gridPut(x + 1, y - 1, d, c); dots++;
  }
  M.dots = dots;
}
function hostPuttAim(pw, hot, ph) {   // the putt's way as the model would draw it for this aim and pace; false without the host's green
  const G = HP.turn && HP.turn.green; if (!G || !G.path || G.path.length < 2) return false;
  const S = hostS(), bx = ball.x, by = ball.y, pin = HP.turn.pin, a0 = Math.atan2(pin[1] * S - by, pin[0] * S - bx), aA = Math.atan2(aim.dy, aim.dx);
  const rot = aA - a0 - G.startDeg * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot), at = (p) => { const dx = (p[0] * S - bx) * pw, dy = (p[1] * S - by) * pw; return [bx + dx * c - dy * s, by + dx * s + dy * c]; };
  ribStart();
  for (let i = 0; i + 1 < G.path.length; i++) {   // the way the putt takes: the blue ribbon along the green (J5b)
    const a = at(G.path[i]), b = at(G.path[i + 1]), seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let d = 0; d < seg; d += 0.35) { const u = d / seg, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; ribAdd(x, y, groundH(x, y) + 0.03); }
  }
  const e = at(G.path[G.path.length - 1]); ribAdd(e[0], e[1], groundH(e[0], e[1]) + 0.03);
  ribbonO(RIB_W * 0.35 * S, 2);
  HP.putt = { x: e[0], y: e[1], rot };   // (kept for the harness: where this aim and pace end)
  return true;
}
function hostCanGimme() {   // a gimme the round's rule allows: his turn, on the green, inside the rule's distance
  const t = HP.turn; return !!t && hostOnTurn() && !hostBusy() && !bcam && t.gimmeM > 0 && !!t.green && t.distM <= t.gimmeM;
}
function hostGimme() { if (!hostCanGimme()) return; const t = HP.turn; hostSend({ t: 'gimme', holeIdx: t.holeIdx, stroke: t.stroke }); HP.wait = 1; }
// J8 (#1261): a club tab's painted tile by its club: the driver, the woods, the long irons and the hybrid (a 4-iron and longer), the irons, the wedges, the putter (tiles/<name>.webp, copied by build.mjs)
function clubTile(id) { return id === 'driver' ? 'club-driver' : id === 'putter' ? 'club-putter' : id === 'wood3' || id === 'wood5' ? 'club-wood' : id === 'hybrid' || /^iron[234]$/.test(id) ? 'club-long-iron' : /^(pw|gw|sw|lw)$/.test(id) ? 'club-wedge' : 'club-iron'; }
function hostTabs() {   // T419: his clubs in the tabs: the name, its carry after his mods (the putter: its fitting); keys 1 to 9 and the wheel change club. T455: the carry FROM THIS LIE (the host's lieM: rough, sand, long grass cut it; a cut one is amber with a down arrow), so he can club up
  return HP.clubs.map((c, k) => { const lie = c.lieM !== undefined ? c.lieM : c.carryM, cut = c.club !== 'putter' && lie < c.carryM - 0.5; return '<div class="club' + (k === club ? ' on' : '') + (cut ? ' cut' : '') + '" data-k="' + k + '"><img class="ci" src="tiles/' + clubTile(c.club) + '.webp" alt="" aria-hidden="true" draggable="false"><div class="ct">' + (k < 9 ? '<b>' + (k + 1) + '</b> ' : '') + (CLUB_NAME[c.club] || c.club) + '<i>' + (c.club === 'putter' ? (c.fit || 'on the green') : Math.round(lie) + ' m' + (cut ? ' ▼' : '')) + '</i></div></div>'; }).join('');
}
// 2026-11-15 (the owner: "12 tiles always open"): the club picker: the club in hand, its tile, name and carry from this lie, between previous and next arrows;
// the lie as a chip beside it ("Rough 80%": the share of the carry the lie leaves); his whole bag (hostTabs) folded above it until the club is clicked
function hostPicker() {
  const c = HP.clubs[club]; if (!c) return '<div class="bagl">' + hostTabs() + '</div>';
  const lie = c.lieM !== undefined ? c.lieM : c.carryM, cut = c.club !== 'putter' && lie < c.carryM - 0.5, t = HP.turn, ln = t ? String(t.lieName || t.lieKind || '') : '';
  return '<div class="pick"><button type="button" class="cb" data-c="-1" title="Previous club ( [ )">&#8249;</button><div class="cur" data-c="bag" title="Your bag: click to choose a club (1-9, [ ])"><img class="ci" src="tiles/' + clubTile(c.club) + '.webp" alt="" aria-hidden="true" draggable="false"><span>' + (CLUB_NAME[c.club] || c.club) + '<i>' + (c.club === 'putter' ? (c.fit || 'on the green') : Math.round(lie) + ' m') + '</i></span></div><button type="button" class="cb" data-c="1" title="Next club ( ] )">&#8250;</button></div>'
    + (ln ? '<div class="lie' + (cut ? ' cut' : '') + '" title="' + (cut ? 'The lie: this club carries ' + Math.round(lie) + ' m from here (' + Math.round(c.carryM) + ' m from a clean lie)' : 'The lie') + '">' + ln[0].toUpperCase() + ln.slice(1) + (cut ? ' ' + Math.round(lie / c.carryM * 100) + '%' : '') + '</div>' : '')
    + '<div class="bagl">' + hostTabs() + '</div>';
}
function hostPickClub(k) { if (!HP || !HP.clubs.length || charging || player.swing >= 0) return; club = Math.max(0, Math.min(HP.clubs.length - 1, k)); }
function bagShow(on) { bagOpen = on; if (HP && HP.clubs.length) clubsEl.className = 'bag' + (on ? ' open' : ''); }
clubsEl.addEventListener('mousedown', (e) => { if (e.preventDefault) e.preventDefault(); });   // (no focus left on its buttons: Space swings)
clubsEl.addEventListener('click', (e) => {
  let el = e.target; while (el && el !== clubsEl && !(el.dataset && (el.dataset.c || el.dataset.k))) el = el.parentNode;
  if (!HP || !el || el === clubsEl) return;
  if (el.dataset.c === 'bag') bagShow(!bagOpen); else if (el.dataset.c) hostPickClub(club + +el.dataset.c); else { hostPickClub(+el.dataset.k); bagShow(false); }
});
clubsEl.addEventListener('wheel', (e) => { if (!HP || !HP.clubs.length) return; hostPickClub(club + (e.deltaY > 0 ? 1 : -1)); if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }, { passive: false });

// ---- loop
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (HP && HP.sw && !HP.sw.rel && (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ShiftLeft' || e.code === 'ShiftRight')) { hostBoostTap(); if (e.preventDefault) e.preventDefault(); return; }   // (#1336: the boost, tapped while the swing is held: Up or W, Shift as before; never a step)
  if (HP && hostAirOn() && /^Arrow(Up|Down|Left|Right)$/.test(e.code)) { hostSpinTap(e.code.slice(5).toLowerCase()); if (e.preventDefault) e.preventDefault(); return; }   // (#1336: spin, tapped while his ball is in the air; never a step or a turn)
  if (HP && HP.turn && !HP.sw && (e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyI')) { hostPickSet(e.code === 'KeyZ' ? 'curve' : e.code === 'KeyX' ? 'flight' : 'boost'); return; }   // (T441, T443: the shape and the boost)
  if (HOST && e.code === 'Escape') { hostSend({ t: 'exit' }); return; }   // (the host page closes the view)
  if (HOST && e.code === 'F8') { e.preventDefault(); sndMsg('mute'); return; }   // (J11: the Mute key works in the view too: the host page mutes, or lifts every mute)
  keys[e.code] = true;
  if (e.code === 'KeyT') setTime((tmode + 1) % TOD.length);
  else if (e.code === 'KeyC') { behindHole(); camD = D0; camHk = 1; HZ = HZB = HZ0; camK = { d: D0, hk: 1 }; }
  else if (e.code === 'KeyN' && !pracLock()) { SEED = (Math.random() * 1e9) | 0; total = 0; newHole(1, 0, 0); firstPicture(); }   // (on a real course: the same course, new trees and rough)
  else if (pracLock() && /^Key[BKLGJN]$/.test(e.code)) { /* (J6: practising, he stays on his spot) */ }
  else if (e.code === 'KeyB') dropBall();
  else if (e.code === 'KeyK') { nextCourse(); firstPicture(); }
  else if (e.code === 'KeyL') { keys.KeyL = false; askCourse(); }
  else if (e.code === 'KeyG') rideCart();
  else if (e.code === 'KeyJ') jumpToBall();
  else if (e.code === 'KeyU') setUi(!uiMin);
  else if (e.code === 'KeyM' && !HOST) { useBiome(BIOME_ORDER[(BIOME_ORDER.indexOf(biomeId) + 1) % BIOME_ORDER.length]); firstPicture(); }
  else if (e.code === 'KeyV' && !HOST) { useStyle(null, CTYPE_ORDER[(CTYPE_ORDER.indexOf(ctypeId) + 1) % CTYPE_ORDER.length]); firstPicture(); }
  else if (e.code === 'KeyY') gimme();
  else if (e.code === 'KeyP') { const nx = RS > 0.9 ? 0.75 : RS > 0.6 ? 0.5 : 1; try { localStorage.setItem('cinderlinks.scale', '' + nx); } catch (e2) {} if (typeof location !== 'undefined' && location.reload) { const u = new URLSearchParams(location.search); u.delete('scale'); location.search = u.toString(); } }   // the picture's scale: 75%, 50%, 100% (the page loads again at the new size)
  else if (e.code === 'KeyH') helpShow(!helpOn);
  else if (e.code === 'BracketLeft' || e.code === 'BracketRight') { const s = e.code === 'BracketRight' ? 1 : -1; if (HP) hostPickClub(club + s); else { club = (club + s + CLUBS.length) % CLUBS.length; autoClub = false; } }   // (2026-11-15: [ and ] step through the clubs; the wheel zooms)
  else if (HP && /^Digit[1-9]$/.test(e.code)) hostPickClub(+e.code.slice(5) - 1);   // (host mode: his bag)
  else if (/^Digit[1-4]$/.test(e.code)) { club = +e.code.slice(5) - 1; autoClub = false; }
  if (/^Arrow|^Space/.test(e.code) && e.preventDefault) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
// J5e: the page losing the keyboard (the host page took it, another window) while a key is held: its key-up never comes. Every key is let go, and a swing
// being held is called off (no stroke), rather than left holding or struck at whatever the meter showed
addEventListener('blur', () => { for (const k of Object.keys(keys)) keys[k] = false; swingBtnDown = false; if (HP && HP.sw && !HP.sw.rel) { HP.sw = null; charging = false; power = 0; player.al = 0; } });
let camDrag = false;
view.addEventListener('mousemove', (e) => {
  const r = view.getBoundingClientRect(); mouse.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1); mouse.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1);
  if (camDrag) { camYaw -= (e.movementX || 0) * 0.005; HZ = HZB = Math.round(clamp(HZB + (e.movementY || 0) * 0.7 * RS, 40 * RS, SH * RS)); }   // (a whole row: the sky is read by row)   // the middle button holds the scene: drag it round, drag it up or down
});
view.addEventListener('mousedown', (e) => { const a = audio(); if (a && a.state === 'suspended') a.resume(); if (e.button === 1) { camDrag = true; if (e.preventDefault) e.preventDefault(); } else if (!e.button) {
  mouse.down = true;
  if (HP && ball.state === 0 && nearBall() && !hostBusy()) { const r = view.getBoundingClientRect(); mouse.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1); mouse.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1); aimToMouse(); hostAimPin = true; }   // (T456: a click on the ground aims there at once, whatever the tick: it is the target, and it stays when the mouse goes)
} });
addEventListener('mouseup', (e) => { if (e.button === 1) camDrag = false; else mouse.down = false; });
view.addEventListener('auxclick', (e) => { if (e.preventDefault) e.preventDefault(); });
view.addEventListener('wheel', (e) => { camD = clamp(camD * (e.deltaY > 0 ? 1.1 : 1 / 1.1), CAMMIN, 42); if (e.preventDefault) e.preventDefault(); }, { passive: false });

function trimCaches() {   // drop what is far from the camera
  const cu = camX * PPM, cv = (camY - 30) * PPV;
  if (chunks.size > (preOn ? CHCAP + 700 : CHCAP)) { for (const [k, C] of chunks) if ((Math.abs(C.cx * CH - cu) > (DNEAR + 30) * PPM || Math.abs(C.cy * CH - cv) > (DNEAR + 24) * PPV) && !(preOn && Math.abs(C.cx * CH - preX * PPM) < 2700 && Math.abs(C.cy * CH - preY * PPV) < 1400)) chunks.delete(k);   /* (the land where the ball will come down is kept) */ lastCK = NaN; }
  if (tiles.size > (SIMPLEG ? 1100 : 330)) {
    const tanV = (VW / 2 + 300) / FOC;
    for (const [k, T] of tiles) { const ex = (T.tx + 0.5) * TPX / PPM - camX, ey = (T.ty + 0.5) * TPX / PPV - camY, fd = ex * FX + ey * FY, la = Math.abs(ex * RX + ey * RY), near = Math.hypot((T.tx + 0.5) * TPX / PPM - player.x, (T.ty + 0.5) * TPX / PPV - player.y) < 52 || (preOn && Math.hypot((T.tx + 0.5) * TPX / PPM - preX, (T.ty + 0.5) * TPX / PPV - preY) < 62);
      if (!near && (wkOn ? fd < -12 || fd > (SIMPLEG ? Math.min(VIEWR - 20, 220) + 35 : 125) || la > tanV * (fd + 24) + 14 : Math.abs(T.tx * TPX - cu) > 6800 || Math.abs(T.ty * TPX - cv) > 3000)) tiles.delete(k); }   // (with a worker: all that is out of view and not round the golfer)
    lastTK = NaN; lastTile = null;
  }
  if (ocells.size > 2600) { for (const k of ocells.keys()) { const ix = Math.floor(k / 65536) - 32768, iy = (k % 65536) - 32768; if (Math.abs(ix * OC - cu) > 6800 || Math.abs(iy * OC - cv) > 3000) ocells.delete(k); } }
  if (ftiles.size > 340 * DFAR * DFAR / 67600) { for (const [k, F] of ftiles) if (Math.abs(F.fx * FTS - camX) > DFAR + 140 || Math.abs(F.fy * FTS - camY) > DFAR + 140) ftiles.delete(k); for (let i = farQ.length - 1; i >= 0; i--) { const F = farQ[i]; if (ftiles.get((F.fx + 32768) * 65536 + (F.fy + 32768)) !== F) farQ.splice(i, 1); } }
}
function firstPicture(near) { const b = genBudget, s = spriteMax; genBudget = 1e9; spriteMax = 999; fpNear = near || 0; render(); render(); render(); fpNear = 0; genBudget = b; spriteMax = s; }   // a hole's first picture is made whole (near: T438, the host's, whole within that many metres, the far land standing in beyond); after it, new land and new sculptures arrive a piece a frame
function tickGame() {
  if (keys.KeyR) camHk = Math.min(3.2, camHk * 1.02); if (keys.KeyF) camHk = Math.max(0.4, camHk / 1.02);
  updatePlayer(); updateBall(); ballCam(); cartHum(); updateParticles(); updateCreatures(); ambienceTick();
  if (msgT > 0) msgT--;
  if (doneT && ++doneT > 340) { newHole(holeN + 1, hole.pin.x + hole.dx * 16, hole.pin.y + hole.dy * 16); firstPicture(); }   // (a real course goes on to its own next hole)
}
const STEP_MS = 1000 / 60;
let last = performance.now(), acc = 0;
function loop(now) {
  if (hostOff) { looping = false; return; }   // (host mode: left, or no course yet; a 'course' message starts the loop again)
  looping = true;
  acc = Math.min(acc + (now - last), 100); last = now;
  while (acc >= STEP_MS) { tickGame(); acc -= STEP_MS; }
  // T438: after the first picture, until the first turn (or the lies) come, a frame in four is drawn: the host reads the lies on this same thread
  if (hostWaitT && (!HOST || !course || (HP && HP.turn) || course.lk || now - hostWaitT > 10000)) hostWaitT = 0;
  coverTick();   // (J5b: every frame: the cover lifts the moment the pictures are in)
  if (hostWaitT && (++hostWaitF & 3) !== 0) { requestAnimationFrame(loop); return; }
  render();
  if ((frame & 7) === 0) updateHud();
  if (((frame & 255) === 0 || (wkOn && (frame & 15) === 0 && tiles.size > 470)) && !bcam) trimCaches();   // (not while the camera is away with the ball: the land round the golfer is kept for the cut back)
  requestAnimationFrame(loop);
}
{
  const q = new URLSearchParams(location.search);
  if (q.get('host') === '1') HOST = true;   // (host mode: started below, once the page is ready)
  if (q.get('seed')) SEED = +q.get('seed') | 0;
  setTime(q.get('time') ? clamp(+q.get('time') | 0, 0, TOD.length - 1) : 1);   // (Golden hour unless the address says: the owner's choice with the painted look, T448)
  setBiome(BIOMES[q.get('biome')] ? q.get('biome') : 'parkland', CTYPES[q.get('type')] ? q.get('type') : 'private');   // ?biome=desert&type=links and so on
  STYLE_URL = q.has('biome') || q.has('type');   // (the address's style wins over the one kept for the course)
  if (!HOST) try { for (const c of JSON.parse(localStorage.getItem('cinderlinks.courses') || '[]')) if (c && c.id && c.holes) MORE_COURSES.push(c); } catch (e) { /* nothing kept */ }
  if (q.get('find') && !HOST) setTimeout(() => importCourse(q.get('find')), 800);
  if (!HOST) { const c = q.get('course'); if (c !== 'none') loadCourse(c || 'woodhill') || loadCourse(courseList().length ? courseList()[0].id : ''); }
  if (!HOST) styleRestore(course ? course.id : null);   // the style last chosen for this course (parts/07-play.md)   // the game starts on Woodhill (the owner's choice, 2026-11-12); ?course=<id> starts on another, ?course=none on the invented course
}
if (!/[?&]worker=0/.test(location.search || '')) wkStart();   // (?worker=0: the page makes the land itself, for comparing)
newHole(1, 0, 0);   // (in host mode: the invented hole, never drawn, so that everything has a hole until the course comes)
if (HOST) hostStart();
else { firstPicture(); updateHud(); looping = true; requestAnimationFrame(loop); }
````
