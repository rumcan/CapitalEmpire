## hud The HUD
The frame keeps Cinderdeep's HUD manner: a card of facts, the clubs as a row of tabs, a power bar, a message line, and a small map of the hole.
R: The card shows the hole, par, strokes (and the score against par), the round, the distance to the pin, the lie and the light.
R: Each club's tab shows how far it carries. A wind arrow shows the wind as the camera sees it and turns gold while a gust is on the golfer.
R: One line of hints says what can be done right now; H opens the full list of keys.
R: The map shows the hole from above with the tee, the pin, the ball and the golfer.
File: game.js
Check: function updateHud(
Check: function drawMini(

````js file=game.js

// ---- hud
const $ = (id) => document.getElementById(id);
const cardEl = $('card'), clubsEl = $('clubs'), msgEl = $('msg'), powerEl = $('power'), powerBar = $('powerBar'), powerTxt = $('powerTxt'), miniEl = $('mini'), mctx = miniEl.getContext('2d');
const windEl = $('wind'), windArrow = $('windArrow'), keysEl = $('keys'), helpEl = $('help'), jumpEl = $('jump');
jumpEl.addEventListener('click', (e) => { jumpToBall(); if (e.preventDefault) e.preventDefault(); if (jumpEl.blur) jumpEl.blur(); });
let helpOn = false, shownKeys = '', shownWind = '';
// the panels are folded away until asked for: only the hole's line, the club in hand and the messages stay. A click on the card or U opens and folds them; the choice is kept.
const gimmeEl = $('gimme'); gimmeEl.addEventListener('click', (e) => { gimme(); if (e.preventDefault) e.preventDefault(); if (gimmeEl.blur) gimmeEl.blur(); });
// the course's style: a button at the top of the picture; its menu lists the course types and the biomes side by side (M steps through them too)
const styleBtn = $('styleBtn'), styleMenu = $('styleMenu'); let shownStyle = '';
let shownType = '';
function styleShow() {   // the menu: the biome (the land and its plants) beside the course type (how the course is kept); one of each is in force
  shownStyle = biomeId; shownType = ctypeId; styleBtn.innerHTML = BIOMES[biomeId].name + ' &middot; ' + CTYPES[ctypeId].name + '<b>&#9662;</b>';
  const col = (title, kind, ids, T, cur) => '<div class="grp"><i>' + title + '</i>' + ids.map((id) => '<button type="button" data-kind="' + kind + '" data-id="' + id + '"' + (id === cur ? ' class="on"' : '') + '>' + T[id].name + '</button>').join('') + '</div>';
  styleMenu.innerHTML = col('Biome', 'b', BIOME_ORDER, BIOMES, biomeId) + col('Course type', 't', CTYPE_ORDER, CTYPES, ctypeId)
    + '<div class="grp dist"><i>Render distance</i><input id="detail" type="range" min="150" max="400" step="25" value="' + VIEWR + '"><span id="detailV">' + VIEWR + ' m</span><label class=\"simple\"><input id=\"simpleG\" type=\"checkbox\"' + (SIMPLEG ? ' checked' : '') + '> Simple grass everywhere</label><em>How far the land, trees and grass are drawn; past 260 m the detailed ground reaches farther too. Higher needs a faster PC.</em></div>';
}
styleBtn.addEventListener('click', (e) => { styleMenu.className = styleMenu.className === 'on' ? '' : 'on'; if (styleBtn.blur) styleBtn.blur(); if (e.preventDefault) e.preventDefault(); });
styleMenu.addEventListener('click', (e) => { const t = e.target, id = t && t.getAttribute ? t.getAttribute('data-id') : null, kind = id ? t.getAttribute('data-kind') : null; if (!id) return;
  if (kind === 'b' && BIOMES[id] && id !== biomeId) { useStyle(id, null); firstPicture(); } else if (kind === 't' && CTYPES[id] && id !== ctypeId) { useStyle(null, id); firstPicture(); }
  styleShow(); });   // (the menu stays open: a biome and a type are usually chosen together)
styleMenu.addEventListener('change', (e) => { const t = e.target; if (t && t.id === 'simpleG') setSimple(t.checked); });
styleMenu.addEventListener('input', (e) => { const t = e.target; if (!t || t.id !== 'detail') return; setDetail(+t.value); const v = document.getElementById('detailV'); if (v) v.textContent = VIEWR + ' m'; });
try { const d0 = +localStorage.getItem('cinderlinks.view'); if (d0) setDetail(d0); const s0 = localStorage.getItem('cinderlinks.simple'); if (s0 === '0') SIMPLEG = false; } catch (e) {}
const hudEl = $('hud'); let uiMin = true;
try { if (localStorage.getItem('cinderlinks.ui') === 'open') uiMin = false; } catch (e) {}
function setUi(min) { uiMin = min; hudEl.className = min ? 'min' : ''; try { localStorage.setItem('cinderlinks.ui', min ? 'min' : 'open'); } catch (e) {} }
hudEl.className = uiMin ? 'min' : ''; cardEl.title = 'Click, or press U: show or hide the panels';
cardEl.addEventListener('click', () => setUi(!uiMin));
const HELP = [['W S', 'walk forward, back (shift: run)'], ['A D', 'turn'], ['Q E', 'step sideways'], ['mouse', 'aim, beside the ball'], ['hold click', 'power, let go to swing'], ['1 2 3 4', 'club'], ['J', 'jump to the ball'], ['Y', 'take a gimme (a short putt, given)'], ['M', 'biome: parkland, coastal, beachside, desert, savanna, jungle, snow'], ['V', 'course type: links, tour, private, public'], ['U', 'show or hide the panels'], ['P', 'picture scale: 75, 50, 100%'], ['G', 'golf cart: in and out (W S go and brake, A D steer)'], ['middle drag', 'look around (the camera comes back behind you when you move)'], ['wheel', 'nearer, farther'], ['R F', 'raise, lower the camera'], ['C', 'camera behind the hole'], ['B', 'drop the ball by you'], ['T', 'time of day'], ['N', 'new land'], ['K', 'real courses: next'], ['L', 'find a real course by name'], ['H', 'hide this']];
helpEl.innerHTML = HELP.map((h) => '<b>' + h[0] + '</b>' + h[1]).join('\n');
const MINI = [[42, 105, 160], [98, 190, 116], [232, 205, 149], [117, 196, 114], [68, 149, 76], [58, 128, 66], [44, 100, 58], [84, 120, 60], [26, 66, 56], [110, 112, 72], [120, 113, 134], [120, 113, 134], [102, 73, 55]];
let miniImg = null, miniS = 1, miniX0 = 0, miniY0 = 0, shownClub = -2, shownMsg = null, shownCard = '';
function drawMini() {
  const H = hole, x0 = Math.min(H.tee.x, H.pin.x) - 22, x1 = Math.max(H.tee.x, H.pin.x) + 22, y0 = Math.min(H.tee.y, H.pin.y) - 22, y1 = Math.max(H.tee.y, H.pin.y) + 22, w = Math.max(x1 - x0, y1 - y0);
  miniS = 150 / w; miniX0 = (x0 + x1) / 2 - w / 2; miniY0 = (y0 + y1) / 2 - w / 2;
  miniImg = mctx.createImageData(150, 150);
  const d = miniImg.data;
  for (let j = 0; j < 75; j++) for (let i = 0; i < 75; i++) {
    const x = miniX0 + (i + 0.5) * 2 / miniS, y = miniY0 + (j + 0.5) * 2 / miniS;
    field(x, y, FO);
    let c = MINI[matOf(FO.h, 0, FO.dF, FO.dG, FO.dB, FO.dT, FO.dP, FO.wood, FO.dry, 0, 0)];
    const up = FO.h - baseH(x, y);
    const k = FO.dT < 0 ? 1.1 : up > 5 ? 1.25 : up > 2 ? 1.12 : 0.92 + hash2(i, j, 7) * 0.1;
    for (let q = 0; q < 4; q++) { const o = ((j * 2 + (q >> 1)) * 150 + i * 2 + (q & 1)) * 4; d[o] = Math.min(255, c[0] * k); d[o + 1] = Math.min(255, c[1] * k); d[o + 2] = Math.min(255, c[2] * k); d[o + 3] = 255; }
  }
}
function miniDot(x, y, col, s) { mctx.fillStyle = col; mctx.fillRect(Math.round((x - miniX0) * miniS) - (s >> 1), Math.round((y - miniY0) * miniS) - (s >> 1), s, s); }
function updateHud() {
  const H = hole, m = matAt(ball.x, ball.y), d = Math.hypot(H.pin.x - ball.x, H.pin.y - ball.y);
  const score = strokes - H.par, row = (a, b) => '<div class="row"><span>' + a + '</span><b>' + b + '</b></div>';
  const card = (course ? '<div class="course">' + course.name + '</div>' : '') + '<div class="hole">Hole ' + (course ? course.holes[(holeN - 1) % course.holes.length].n : holeN) + '<span>par ' + H.par + '</span></div>' + row('Strokes', strokes + (strokes ? ' (' + (score > 0 ? '+' : '') + score + ')' : '')) + row('Round', total) + row('To pin', (d < 10 ? d.toFixed(1) : Math.round(d)) + ' m') + row('Lie', hostOnTurn() ? HP.turn.lieName || HP.turn.lieKind : MAT_NAME[m]) + (hostOnTurn() ? hostCardRows(row) : '') + row('Light', TOD[tmode].name) + (course ? '<div class="credit">' + course.credit + (course.hcredit ? ' &middot; heights: ' + course.hcredit : '') + ' &middot; ' + Math.round(course.S * 10) + '/10 size</div>' : '');
  if (card !== shownCard) { cardEl.innerHTML = card; shownCard = card; }
  if (club !== shownClub) { shownClub = club; clubsEl.className = HP && HP.clubs.length ? 'bag' : ''; clubsEl.innerHTML = HP && HP.clubs.length ? hostTabs() : CLUBS.map((c, k) => '<div class="club' + (k === club ? ' on' : '') + '"><b>' + (k + 1) + '</b> ' + c.name + '<i>' + (c.loft ? Math.round(c.v * c.v * clubK() * clubK() * Math.sin(2 * c.loft) / 9.81 / 5) * 5 + ' m' : 'on the green') + '</i></div>').join(''); }
  if (!HP) { powerEl.className = charging || player.swing >= 0 ? 'on' : ''; powerBar.style.width = (power * 100).toFixed(0) + '%'; }   // (host mode: the meter, hostMeterShow)
  if (charging && !HP) powerTxt.textContent = Math.round(power * 100) + '%  ' + clubName(club);
  const byCart = !cart.on && Math.hypot(player.x - cart.x, player.y - cart.y) < 3.2;
  const hint = msgT > 0 ? msgText : '';
  if (hint !== shownMsg) { msgEl.textContent = hint; shownMsg = hint; }
  const kh = (cart.on ? '<b>G</b> get out &middot; <b>W S</b> go, brake &middot; <b>A D</b> steer' : byCart ? '<b>G</b> drive the cart' : nearBall() ? '<b>hold click</b> swing &middot; <b>' + (HP ? '1-9, wheel' : '1-4') + '</b> club' : '<b>W</b> walk &middot; <b>A D</b> turn &middot; to the ball') + ' &middot; <b>H</b> help';
  if (kh !== shownKeys) { keysEl.innerHTML = kh; shownKeys = kh; }
  if (shownStyle !== biomeId || shownType !== ctypeId) styleShow();
  { const gm = canGimme() ? 'on' : ''; if (gimmeEl.className !== gm) gimmeEl.className = gm; }   // the gimme button shows when the putt left is short enough to be given
  { const far = ball.state === 0 && !bcam && player.swing < 0 && Math.hypot(player.x - ball.x, player.y - ball.y) > 4 ? 'on' : ''; if (jumpEl.className !== far) jumpEl.className = far; }   // the button shows when the ball lies still and the golfer is away from it
  { const hw = hostWindDir(), wdx = hw ? hw[0] : WDX, wdy = hw ? hw[1] : WDY, wr = wdx * RX + wdy * RY, wf = wdx * FX + wdy * FY, deg = Math.round(Math.atan2(-wf, wr) * 57.3 / 5) * 5, gu = WG[(((Math.round(player.y * PPV) >> 5) & 127) << 7) | ((Math.round(player.x * PPM) >> 6) & 127)] > 110, ws = deg + (gu ? 'g' : '');   // the wind as the camera sees it; gold while a gust is on the golfer
    if (ws !== shownWind) { windArrow.style.transform = 'rotate(' + deg + 'deg)'; windEl.className = gu ? 'gust' : ''; shownWind = ws; } }
  if (miniImg) {
    mctx.putImageData(miniImg, 0, 0);
    miniDot(H.tee.x, H.tee.y, '#f8dc6c', 3); miniDot(H.pin.x, H.pin.y, '#ff5a30', 5); miniDot(ball.x, ball.y, '#ffffff', 3); miniDot(player.x, player.y, '#82fff6', 4);
  }
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
R: Host mode (?host=1, T415): the page is a view inside another page (CapitalEmpire). It loads no course of its own, says { v: 1, t: 'ready' } to the page that holds it and waits for { v: 1, t: 'course', course, features, biome, type, seed, scale, hole }; it plays that course from hole `hole` (1 if none) and answers { v: 1, t: 'loaded', holes }. { t: 'leave' } stops it drawing; Escape sends { v: 1, t: 'exit' }. Messages from anywhere but the page that holds it are ignored.
Check: function hostMessage(
R: Host play (T418 to T420): in host mode the host decides every shot. A strike sends { v: 1, t: 'input', input: { holeIdx, stroke, club, aim, power } } and waits (after 5 s it says it is waiting for the course, and keeps waiting); { t: 'shot' } is played back from its samples (the flight with the ball camera, a thump at the landing and each bounce, the roll, the rest); { t: 'turn' } puts the ball and the pin where the host has them and only then may he swing again; { t: 'holeEnd' } says the score. The club tabs are his bag from the turn (keys 1 to 9 and the wheel over the tabs), and the aim's arc and ring are the host's carry, wind push and scatter for the club in hand. Standalone play is unchanged.
Check: function hostShot(
Check: function hostAim(
Check: function hostTabs(

````js file=game.js

// ---- host mode (?host=1, T415): the view inside another page (CapitalEmpire), driven by messages (docs/CINDERLINKS-PORT.md, section 4)
// Host to view:  { v: 1, t: 'course', course, features, biome, type, seed, scale, hole }   course: one entry of courses.js (tools/course-import.mjs's
//                shape); features: what setFeatures takes; biome, type: what setBiome takes; scale: the course's scale (1: true size); hole: from 1
//                { v: 1, t: 'leave' }   stop drawing (a later 'course' starts it again)
// View to host:  { v: 1, t: 'ready' } once listening; { v: 1, t: 'loaded', holes } when a course is on screen; { v: 1, t: 'error', why }; { v: 1, t: 'exit' } on Escape
let HOST = false, hostOrigin = '', hostLast = null, hostN = 0, hostOff = false, looping = false;
function hostMode() { return HOST; }
function hostSend(m) {
  hostLast = Object.assign({ v: 1 }, m);   // (kept: the harness reads it, having no parent page)
  try { if (typeof window !== 'undefined' && window.parent && window.parent !== window) window.parent.postMessage(hostLast, hostOrigin || '*'); } catch (e) { /* the parent is gone */ }
}
function hostMessage(m) {   // one message from the host page, already known to come from it
  if (!m || typeof m !== 'object') return;
  if (m.t === 'leave') { hostOff = true; return; }
  if (m.t === 'actors') { actorsIn(m); return; }   // T424: who else is on the course (parts/08d-actors.md)
  if ((m.t === 'turn' || m.t === 'shot' || m.t === 'holeEnd') && m.v === 1) { if (course) hostPlayMsg(m); return; }   // (T418: the play, once a course is in)
  if (m.t !== 'course' || m.v !== 1) return;
  const C = m.course;
  if (!C || typeof C.id !== 'string' || !Array.isArray(C.holes) || !C.holes.length || !C.polys) { hostSend({ t: 'error', why: 'the course has no id, holes or shapes' }); return; }
  const D = Object.assign({}, C, { fetched: true, scale: +m.scale > 0 ? +m.scale : 1, hv: ++hostN });   // (fetched: the workers are handed its data; hv: a new hand-over of the same id is loaded again)
  const k = MORE_COURSES.findIndex((c) => c.id === D.id); if (k >= 0) MORE_COURSES.splice(k, 1); MORE_COURSES.push(D);
  if (m.seed !== undefined && Number.isFinite(+m.seed)) SEED = +m.seed | 0;
  setBiome(BIOMES[m.biome] ? m.biome : biomeId, CTYPES[m.type] ? m.type : ctypeId); lib.clear(); libWarm = 0;   // (sculptures made in the old colours are dropped, as useStyle does)
  HP = null; course = null; if (!setCourse(D.id)) { hostSend({ t: 'error', why: 'the course could not be laid out' }); return; }
  setFeatures(m.features || null); featTxt = ''; featFor = course.id;
  const n = Math.max(1, Math.min(course.holes.length, +m.hole | 0 || 1)); if (n !== 1) newHole(n, 0, 0);
  hostOff = false; firstPicture(); updateHud();
  if (!looping && typeof requestAnimationFrame === 'function') { looping = true; last = performance.now(); acc = 0; requestAnimationFrame(loop); }
  hostSend({ t: 'loaded', holes: course.holes.length });
}
function hostStart() {
  HOST = true; hostOff = true;   // (nothing is drawn until a course comes)
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
  if (m.t === 'shot') { if (HP.turn && m.golfer !== HP.turn.golfer) return; if (HP.play) { HP.q.push(m); return; } hostShot(m); return; }   // (anyone else's stroke: shown from T425)
  if (HP.play || HP.q.length) { HP.q.push(m); return; }
  if (m.t === 'turn') hostTurn(m); else if (m.t === 'holeEnd') hostHoleEnd(m);
}
function hostTurn(m) {   // the owner's turn: the ball and the pin where the model has them, his clubs in the tabs, the suggested club in hand
  const S = hostS(); HP.turn = m; HP.clubs = Array.isArray(m.clubs) ? m.clubs : []; HP.wait = 0; HP.over = false;
  if (m.hole !== holeN) newHole(m.hole, 0, 0);
  ball.x = ball.lx = m.ball[0] * S; ball.y = ball.ly = m.ball[1] * S; ball.z = groundH(ball.x, ball.y); ball.vx = ball.vy = ball.vz = 0; ball.state = 0;
  hole.pin.x = hole.green.x = m.pin[0] * S; hole.pin.y = hole.green.y = m.pin[1] * S;
  strokes = m.stroke - 1; autoClub = false; club = Math.max(0, HP.clubs.findIndex((c) => c.club === m.suggested.club)); shownClub = -2;
  const ax = m.suggested.aim[0] * S - ball.x, ay = m.suggested.aim[1] * S - ball.y, al = Math.hypot(ax, ay); if (al > 0.3) { aim.dx = ax / al; aim.dy = ay / al; }
  if (m.stroke === 1 && Math.hypot(player.x - ball.x, player.y - ball.y) > 2.5) jumpToBall();   // (on the tee he stands at his ball; later he walks to it, or J)
}
function hostStrike() {   // the club meets the ball: the input goes to the host, and the ball waits for its answer
  const c = hostClub(), t = HP.turn, S = hostS(); if (!c || !t) return;
  const putt = c.club === 'putter', m = matAt(ball.x, ball.y);
  const sw = HP.out; HP.out = null;   // (T421: the meter's outcome; the power is then only what it would be without one)
  hostSend({ t: 'input', input: Object.assign({ holeIdx: t.holeIdx, stroke: t.stroke, club: c.club, aim: [aim.x / S, aim.y / S], power: sw ? Math.min(putt ? 1.5 : 1, Math.max(putt ? 0.5 : 0.3, sw.power)) : hostPower(power, putt) }, sw ? { swing: sw } : {}) });   // (spin and shape: T441, T442)
  HP.wait = 1;
  if (!putt) sndShot(); else sndTap();
  for (let k = 0, n = putt ? 3 : 10 + ((power * 14) | 0); k < n; k++) {   // sparks off the club, and turf or sand
    addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, aim.dx * (1 + rnd() * 3) + (rnd() - 0.5) * 2, aim.dy * (1 + rnd() * 3) + (rnd() - 0.5) * 2, 1 + rnd() * 3, 16 + rndi(18), 0);
    if (!putt) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, ball.z + 0.05, aim.dx * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, aim.dy * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, 1.5 + rnd() * 2.5, 30 + rndi(30), rndi(6));
  }
}
function hostShot(m) {   // the owner's decided stroke: played back from its samples (hostBall)
  const S = hostS(), F = Array.isArray(m.flight) ? m.flight : [], R = Array.isArray(m.roll) ? m.roll : [];
  const fT = Array.isArray(m.flightT) && m.flightT.length === F.length ? m.flightT : F.map((_, k) => k / 30);   // (an older host: 30 samples a second)
  const tL = F.length ? fT[F.length - 1] : 0, rT = Array.isArray(m.rollT) && m.rollT.length === R.length ? m.rollT : R.map((_, k) => tL + (k + 1) * 0.12);
  const bT = (m.bounces || []).map((b) => { let bi = -1, bd = 1e9; for (let k = 0; k < R.length; k++) { const d = Math.hypot(R[k][0] - b[0], R[k][1] - b[1]); if (d < bd) { bd = d; bi = k; } } return bi >= 0 ? rT[bi] : tL; }).sort((a, b) => a - b);
  const start = F.length ? [F[F.length - 1][0], F[F.length - 1][1], 0] : [m.from[0], m.from[1], 0];
  HP.play = { m, S, F, fT, tL, bT, bi: 0, t: 0, landed: !F.length, RT: [tL].concat(rT), RQ: [start].concat(R.map((p, k) => [p[0], p[1], Array.isArray(m.rollZ) && m.rollZ.length === R.length ? m.rollZ[k] : 0])) };
  HP.wait = 0; ball.lx = ball.x; ball.ly = ball.y; ball.t = 0; ball.state = F.length ? 1 : 2;
  if (F.length && tL > 0.8) { bcam = 1; bcamT = 0; bcamYaw = camYaw; bcamD = camD; slowT = 30; }   // a full shot: a moment of slow time, and the camera goes with the ball
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
    hostAt(P.fT, P.F, P.t, HQ); ball.x = HQ.x * S; ball.y = HQ.y * S; ball.z = groundH(ball.x, ball.y) + HQ.h * S; ball.state = 1;
    if (tmode > 0 && (ball.t & 1)) addParticle(P_EMBER, ball.x, ball.y, ball.z, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, 0.2, 16 + rndi(14), 1);
  } else if (P.RT.length > 1 && P.t < P.RT[P.RT.length - 1]) {        // bouncing and rolling
    if (!P.landed) { P.landed = true; hostLand(8); }
    while (P.bi < P.bT.length && P.bT[P.bi] <= P.t) { P.bi++; if (P.bi > 1) hostLand(4); }   // (the first bounce is the landing)
    hostAt(P.RT, P.RQ, P.t, HQ); ball.x = HQ.x * S; ball.y = HQ.y * S; ball.z = groundH(ball.x, ball.y) + HQ.h * S; ball.state = 2;
  } else { hostRest(); return; }
  ball.vx = (ball.x - x0) / dt; ball.vy = (ball.y - y0) / dt; ball.vz = 0;   // (for the ball camera's turn)
}
function hostLand(v) { sndLand(v); const m = matAt(ball.x, ball.y), gh = groundH(ball.x, ball.y); for (let k = 0; k < v; k++) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, gh + 0.04, (rnd() - 0.5) * 2.4, (rnd() - 0.5) * 2.4, 0.8 + rnd() * 2, 20 + rndi(24), rndi(6)); }
function hostRest() {   // the playback is over: the ball lies at the host's rest (in the cup, in the water), the strokes are counted, held messages go on
  const P = HP.play, m = P.m, S = P.S; HP.play = null;
  if (!P.landed) hostLand(8);
  ball.x = m.rest[0] * S; ball.y = m.rest[1] * S; ballRest();
  strokes = m.stroke + (m.penalty || 0); total += 1 + (m.penalty || 0);
  if (m.holed) { ball.state = 3; ball.x = hole.pin.x; ball.y = hole.pin.y; for (let k = 0; k < 120; k++) addParticle(k & 1 ? P_SPARK : P_EMBER, hole.pin.x, hole.pin.y, ball.z + 0.1, (rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 2 + rnd() * 5, 40 + rndi(70), rndi(4)); }
  else if (m.penalty) { splash(ball.x, ball.y, wlAt(ball.x, ball.y), 26); say(m.restLie === 'water' ? 'Water: one stroke, and a drop' : 'Out of bounds: one stroke', 260); }
  while (HP.q.length && !HP.play) { const q = HP.q.shift(); if (q.t === 'shot') hostShot(q); else if (q.t === 'turn') hostTurn(q); else if (q.t === 'holeEnd') hostHoleEnd(q); }
}
function hostHoleEnd(m) {   // the hole is over: its score is said; after the last, the view waits for Escape
  const d = m.strokes - m.par, name = m.strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : '+' + d;
  strokes = m.strokes; if (m.last) { HP.turn = null; HP.over = true; }
  say(name + '  -  hole ' + m.hole + ' in ' + m.strokes + (m.last ? '  -  Esc goes back to the course' : ''), m.last ? 100000 : 330);
}
function hostTick() {   // each step: the playback, the meter, and the wait for an answer
  hostBall(); hostMeterShow();
  if (HP.wait > 0 && ++HP.wait > HOST_WAIT && (HP.wait - HOST_WAIT) % 120 === 1) say('Waiting for the course...', 130);
}
function hostAim() {   // T420: the aim tells the truth: the arc to where the model's mean lands this club at this power (its carry in this lie, slope and wind, and
  // the wind's push off the line), and a ring at one standard deviation of where it lands (shot.ts SHOT_SCATTER: across the line and along it). A better
  // club or a steadier golfer draws a smaller ring. Its numbers come from the host's kit for the club (turn.clubs), worked out along the suggested line
  const C = hostClub(), t = HP.turn; if (!C || !t) return;
  const sw = HP.sw, u = sw ? (sw.ph === 1 ? sw.u : sw.power) : 1, b = sw ? hostBoost(sw.presses) : 0;   // (T421: what the meter has set so far: the overswing carries half, the boost adds)
  const S = hostS(), putt = C.club === 'putter', pw = sw ? (putt ? u : u <= 1 ? u : 1 + 0.5 * (u - 1)) + b : 1, hot = charging ? AIM_R : AIM_G, ph = (frame >> 1) % 6;
  const dx = aim.dx, dy = aim.dy, rx = -dy, ry = dx;                  // (the line, and his right as he faces it: x east, y south)
  if (putt) {                                                          // a putt: its length is a share of the way to the pin
    const len = Math.hypot(hole.pin.x - ball.x, hole.pin.y - ball.y) * pw;
    for (let k = 0, d = 0.4 + ph * 0.07; d < len; d += 0.42, k++) { const qx = ball.x + dx * d, qy = ball.y + dy * d; projectO(qx, qy, groundH(qx, qy) + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 0.8 ? 1 : 0, k & 1 ? hot : AIM_W); }
    const ex = ball.x + dx * len, ey = ball.y + dy * len; projectO(ex, ey, groundH(ex, ey) + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, 2, hot);
    return;
  }
  const carry = (C.playsM !== undefined ? C.playsM : C.carryM) * pw * S, side = (C.sideM || 0) * pw * S;
  const lx = ball.x + dx * carry + rx * side, ly = ball.y + dy * carry + ry * side, apex = (0.08 + 0.004 * (C.loftDeg || 30)) * carry, z0 = groundH(ball.x, ball.y), z1 = groundH(lx, ly);
  for (let k = 0, n = Math.max(12, Math.round(carry / 1.6)); k <= n; k++) {   // the arc and its shadow
    if (k % 6 !== ph) continue;
    const u = k / n, x = ball.x + (lx - ball.x) * u, y = ball.y + (ly - ball.y) * u, gz = groundH(x, y), z = z0 + (z1 - z0) * u + apex * 4 * u * (1 - u);
    projectO(x, y, gz + 0.03, PJ); if (PJ.s > 0) plotZO(PJ.x, PJ.y, PJ.d, AIM_D);
    projectO(x, y, Math.max(z, gz + 0.03), PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 1.1 ? 2 : PJ.s > 0.35 ? 1 : 0, (k / 6 | 0) & 1 ? hot : AIM_W);
  }
  const across = Math.max(0.4, (C.scatterM || 0) / 2 * pw * S), along = Math.max(0.4, (C.longM !== undefined ? C.longM : C.scatterM || 0) / 2 * pw * S);   // (one standard deviation: the host sends two)
  const na = Math.max(40, Math.min(160, Math.round((across + along) * 3)));
  for (let a = 0; a < na; a++) {                                       // the ring: one standard deviation across the line and along it
    const an = a / na * 6.2832, ca = Math.cos(an), sa = Math.sin(an), qx = lx + dx * along * ca + rx * across * sa, qy = ly + dy * along * ca + ry * across * sa;
    projectO(qx, qy, groundH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZO(PJ.x, PJ.y + 1, PJ.d - 0.3, AIM_D); plotZO(PJ.x, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); plotZO(PJ.x + 1, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); }
  }
  projectO(lx, ly, z1 + 0.03, PJ); if (PJ.s > 0) aimDotO(PJ.x, PJ.y, PJ.s > 0.5 ? 2 : 1, hot);
  HP.ring = { x: lx, y: ly, across, along };   // (kept for the harness)
}
// T421: the swing is the model's meter (swing.ts SwingMeter) in Cinderlinks' hold-and-release. Pressing starts the backswing: the marker climbs at the
// club's speed (turn.clubs[].speed: meter units a second, slower for a better golfer) while the heart beats faster; letting go sets the power (past 100%
// is the overswing; at 120% it turns back by itself). The marker then comes back down, the club with it, and a second press strikes: its place against
// the snap line is the accuracy (inside the sweet band, the club's `sweet` and narrowed by a boost, straight; early pulls left, late pushes right). With
// no second press the swing ends at -20%, the worst late miss. Space during the swing adds the boost (the host counts it only for a golfer with the card).
// The outcome, not the times, goes to the host, which reads it exactly as the top view's meter (swing.ts swingEffect): the same click, the same miss.
const HMETER = { top: 1.2, low: -0.2, per: 0.01, max: 0.06, narrow: 0.4, v: 2 };
function hostBoost(n) { return Math.min(HMETER.max, Math.max(0, n) * HMETER.per); }
function hostSweet(C, boost) { return (C && C.sweet > 0 ? C.sweet : 0.07) * (1 - HMETER.narrow * Math.min(HMETER.max, boost) / HMETER.max); }   // (swing.ts sweetSpot's narrowing by the boost)
function hostSwing(p) {   // one step of the meter; true while it holds the golfer (updatePlayer then does nothing else)
  const down = mouse.down, edge = down && !HP.mwas; HP.mwas = down;
  const S = HP.sw, C = hostClub();
  if (!S) {
    if (!edge || !C || hostBusy() || !nearBall() || player.swing >= 0 || cart.on) return false;
    HP.sw = { ph: 1, t: 0, u: 0, power: 0, presses: 0, spd: C.speed > 0 ? C.speed : 1 }; heartT = 0; charging = true; power = 0; return true;
  }
  const fx = -aim.dy, fy = aim.dx;                                     // he stands side-on: the target is to his left
  p.x += (ball.x - fx * 0.64 - p.x) * 0.3; p.y += (ball.y - fy * 0.64 - p.y) * 0.3; p.th = Math.atan2(fy, fx); p.fa = Math.round(p.th / 6.2832 * 16 + 16) % 16; p.moving = false;
  S.t += 1 / 60;
  if (S.ph === 1) {                                                    // the backswing: the marker climbs while the button is held
    S.u = Math.min(HMETER.top, S.t * S.spd);
    if (S.u >= HMETER.top || !down) { S.power = S.u; S.ph = 2; S.t = 0; charging = false; }
    if (--heartT <= 0) { sndHeart(); heartT = Math.round(50 - 24 * Math.min(1, S.u)); }   // the heart beats, faster as the power builds
    power = S.u; p.al = -2 * Math.min(1, S.u);
    return true;
  }
  S.u = S.power - S.t * S.spd;                                         // the downswing: the marker comes back to the snap line, the club to the ball
  p.al = S.u > 0 ? -2 * Math.min(1, S.u) : 0;
  const acc = edge ? S.u : S.u <= HMETER.low ? HMETER.low : null;
  if (acc === null) return true;
  HP.out = { power: S.power, acc, boost: hostBoost(S.presses), v: HMETER.v }; HP.sw = null; HP.lastSw = HP.out;
  p.swing = 1; p.al = 0.01;                                            // (the follow-through plays; the club has met the ball)
  hostStrike();
  return true;
}
function hostMeterShow() {   // the power bar as the meter: the marker, the sweet band round the snap line and the 100% mark; the outcome in words after it
  const S = HP.sw, on = !!S || (player.swing >= 0 && !!HP.lastSw), C = hostClub(), span = HMETER.top - HMETER.low, at = (u) => ((u - HMETER.low) / span * 100).toFixed(1) + '%';
  const cls = on ? 'on meter' : 'meter'; if (powerEl.className !== cls) powerEl.className = cls;
  if (!on) return;
  const u = S ? S.u : HP.lastSw.acc, boost = S ? hostBoost(S.presses) : HP.lastSw.boost, w = hostSweet(C, boost);
  powerBar.style.width = at(Math.max(HMETER.low, u));
  meterSweet.style.left = at(-w); meterSweet.style.width = (2 * w / span * 100).toFixed(1) + '%'; meterTop.style.left = at(1);
  const pw = S ? (S.ph === 1 ? S.u : S.power) : HP.lastSw.power;
  let txt = Math.round(pw * 100) + '%  ' + clubName(club) + (boost > 0 ? '  +' + Math.round(boost * 100) + '% boost' : '');
  if (!S) { const off = Math.abs(u) <= w ? 0 : u; txt += off === 0 ? '  -  straight' : off > 0 ? '  -  early: it goes left' : '  -  late: it goes right'; }
  else if (S.ph === 2) txt += '  -  click on the line';
  powerTxt.textContent = txt;
}
const meterSweet = document.createElement('b'), meterTop = document.createElement('b');
meterSweet.className = 'sweet'; meterTop.className = 'top';
{ const tr = powerBar.parentNode || (powerEl.children && powerEl.children[0]); if (tr && tr.appendChild) { tr.appendChild(meterSweet); tr.appendChild(meterTop); } }

// T422: the card says what the model will use: the lie (its kind and what it does), the slope under the ball, and the wind now with the day's gusts
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
function hostOnTurn() { return !!(HP && HP.turn && !HP.play && ball.state === 0); }
function hostCardRows(row) {
  const t = HP.turn, s = t.slope || { up: 0, across: 0 }, w = t.wind || { mph: 0, from: 0 }, pc = (v) => Math.round(Math.abs(v) * 100) + '%';
  const up = Math.abs(s.up) < 0.01 ? 'level' : (s.up > 0 ? 'uphill ' : 'downhill ') + pc(s.up), side = Math.abs(s.across) < 0.01 ? '' : ', ball ' + (s.across > 0 ? 'above' : 'below') + ' feet ' + pc(s.across);
  const wind = w.mph < 1 ? 'calm' : Math.round(w.mph) + ' mph from the ' + COMPASS[Math.round((((w.from % 360) + 360) % 360) / 45) % 8] + (t.gust > w.mph + 1 ? ', gusts ' + Math.round(t.gust) : '');
  return row('Slope', up + side) + row('Wind', wind) + (t.lieNote ? '<div class="credit">' + t.lieNote + '</div>' : '');
}
function hostWindDir() {   // the way the host's wind blows (toward), on the ground: the arrow shows it; null without a turn (the view's own wind)
  if (!HP || !HP.turn || !HP.turn.wind || HP.turn.wind.mph < 1) return null;
  const b = HP.turn.wind.from * Math.PI / 180; return [-Math.sin(b), Math.cos(b)];   // (from the north, 0, it blows south: + y)
}
function hostTabs() {   // T419: his clubs in the tabs: the name, its full carry after his mods (the putter: its fitting); keys 1 to 9 and the wheel change club
  return HP.clubs.map((c, k) => '<div class="club' + (k === club ? ' on' : '') + '">' + (k < 9 ? '<b>' + (k + 1) + '</b> ' : '') + (CLUB_NAME[c.club] || c.club) + '<i>' + (c.club === 'putter' ? (c.fit || 'on the green') : Math.round(c.carryM) + ' m') + '</i></div>').join('');
}
function hostPickClub(k) { if (!HP || !HP.clubs.length || charging || player.swing >= 0) return; club = Math.max(0, Math.min(HP.clubs.length - 1, k)); }
clubsEl.addEventListener('wheel', (e) => { if (!HP || !HP.clubs.length) return; hostPickClub(club + (e.deltaY > 0 ? 1 : -1)); if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }, { passive: false });

// ---- loop
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (HP && HP.sw && e.code === 'Space') { HP.sw.presses++; if (e.preventDefault) e.preventDefault(); return; }   // (host mode: the boost, T421 and T443)
  if (HOST && e.code === 'Escape') { hostSend({ t: 'exit' }); return; }   // (the host page closes the view)
  keys[e.code] = true;
  if (e.code === 'KeyT') setTime((tmode + 1) % 3);
  else if (e.code === 'KeyC') { behindHole(); camD = D0; camHk = 1; HZ = HZ0; }
  else if (e.code === 'KeyN') { SEED = (Math.random() * 1e9) | 0; total = 0; newHole(1, 0, 0); firstPicture(); }   // (on a real course: the same course, new trees and rough)
  else if (e.code === 'KeyB') dropBall();
  else if (e.code === 'KeyK') { nextCourse(); firstPicture(); }
  else if (e.code === 'KeyL') { keys.KeyL = false; askCourse(); }
  else if (e.code === 'KeyG') rideCart();
  else if (e.code === 'KeyJ') jumpToBall();
  else if (e.code === 'KeyU') setUi(!uiMin);
  else if (e.code === 'KeyM') { useBiome(BIOME_ORDER[(BIOME_ORDER.indexOf(biomeId) + 1) % BIOME_ORDER.length]); firstPicture(); }
  else if (e.code === 'KeyV') { useStyle(null, CTYPE_ORDER[(CTYPE_ORDER.indexOf(ctypeId) + 1) % CTYPE_ORDER.length]); firstPicture(); }
  else if (e.code === 'KeyY') gimme();
  else if (e.code === 'KeyP') { const nx = RS > 0.9 ? 0.75 : RS > 0.6 ? 0.5 : 1; try { localStorage.setItem('cinderlinks.scale', '' + nx); } catch (e2) {} if (typeof location !== 'undefined' && location.reload) { const u = new URLSearchParams(location.search); u.delete('scale'); location.search = u.toString(); } }   // the picture's scale: 75%, 50%, 100% (the page loads again at the new size)
  else if (e.code === 'KeyH') { helpOn = !helpOn; helpEl.className = helpOn ? 'on' : ''; }
  else if (HP && /^Digit[1-9]$/.test(e.code)) hostPickClub(+e.code.slice(5) - 1);   // (host mode: his bag)
  else if (/^Digit[1-4]$/.test(e.code)) { club = +e.code.slice(5) - 1; autoClub = false; }
  if (/^Arrow|^Space/.test(e.code) && e.preventDefault) e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
let camDrag = false;
view.addEventListener('mousemove', (e) => {
  const r = view.getBoundingClientRect(); mouse.x = clamp((e.clientX - r.left) / r.width * VW, 0, VW - 1); mouse.y = clamp((e.clientY - r.top) / r.height * VH, 0, VH - 1);
  if (camDrag) { camYaw -= (e.movementX || 0) * 0.005; HZ = Math.round(clamp(HZ + (e.movementY || 0) * 0.7 * RS, 40 * RS, SH * RS)); }   // (a whole row: the sky is read by row)   // the middle button holds the scene: drag it round, drag it up or down
});
view.addEventListener('mousedown', (e) => { const a = audio(); if (a && a.state === 'suspended') a.resume(); if (e.button === 1) { camDrag = true; if (e.preventDefault) e.preventDefault(); } else if (!e.button) mouse.down = true; });
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
function firstPicture() { const b = genBudget, s = spriteMax; genBudget = 1e9; spriteMax = 999; render(); render(); render(); genBudget = b; spriteMax = s; }   // a hole's first picture is made whole; after it, new land and new sculptures arrive a piece a frame
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
  render();
  if ((frame & 7) === 0) updateHud();
  if (((frame & 255) === 0 || (wkOn && (frame & 15) === 0 && tiles.size > 470)) && !bcam) trimCaches();   // (not while the camera is away with the ball: the land round the golfer is kept for the cut back)
  requestAnimationFrame(loop);
}
{
  const q = new URLSearchParams(location.search);
  if (q.get('host') === '1') HOST = true;   // (host mode: started below, once the page is ready)
  if (q.get('seed')) SEED = +q.get('seed') | 0;
  setTime(q.get('time') ? clamp(+q.get('time') | 0, 0, 2) : 0);
  setBiome(BIOMES[q.get('biome')] ? q.get('biome') : 'parkland', CTYPES[q.get('type')] ? q.get('type') : 'private');   // ?biome=desert&type=links and so on
  if (!HOST) try { for (const c of JSON.parse(localStorage.getItem('cinderlinks.courses') || '[]')) if (c && c.id && c.holes) MORE_COURSES.push(c); } catch (e) { /* nothing kept */ }
  if (q.get('find') && !HOST) setTimeout(() => importCourse(q.get('find')), 800);
  if (!HOST) { const c = q.get('course'); if (c !== 'none') loadCourse(c || 'woodhill') || loadCourse(courseList().length ? courseList()[0].id : ''); }   // the game starts on Woodhill (the owner's choice, 2026-11-12); ?course=<id> starts on another, ?course=none on the invented course
}
if (!/[?&]worker=0/.test(location.search || '')) wkStart();   // (?worker=0: the page makes the land itself, for comparing)
newHole(1, 0, 0);   // (in host mode: the invented hole, never drawn, so that everything has a hole until the course comes)
if (HOST) hostStart();
else { firstPicture(); updateHud(); looping = true; requestAnimationFrame(loop); }
````
