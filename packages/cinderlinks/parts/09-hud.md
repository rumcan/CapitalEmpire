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
  styleMenu.innerHTML = col('Biome', 'b', BIOME_ORDER, BIOMES, biomeId) + col('Course type', 't', CTYPE_ORDER, CTYPES, ctypeId);
}
styleBtn.addEventListener('click', (e) => { styleMenu.className = styleMenu.className === 'on' ? '' : 'on'; if (styleBtn.blur) styleBtn.blur(); if (e.preventDefault) e.preventDefault(); });
styleMenu.addEventListener('click', (e) => { const t = e.target, id = t && t.getAttribute ? t.getAttribute('data-id') : null, kind = id ? t.getAttribute('data-kind') : null; if (!id) return;
  if (kind === 'b' && BIOMES[id] && id !== biomeId) { useStyle(id, null); firstPicture(); } else if (kind === 't' && CTYPES[id] && id !== ctypeId) { useStyle(null, id); firstPicture(); }
  styleShow(); });   // (the menu stays open: a biome and a type are usually chosen together)
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
  const card = (course ? '<div class="course">' + course.name + '</div>' : '') + '<div class="hole">Hole ' + (course ? course.holes[(holeN - 1) % course.holes.length].n : holeN) + '<span>par ' + H.par + '</span></div>' + row('Strokes', strokes + (strokes ? ' (' + (score > 0 ? '+' : '') + score + ')' : '')) + row('Round', total) + row('To pin', (d < 10 ? d.toFixed(1) : Math.round(d)) + ' m') + row('Lie', MAT_NAME[m]) + row('Light', TOD[tmode].name) + (course ? '<div class="credit">' + course.credit + (course.hcredit ? ' &middot; heights: ' + course.hcredit : '') + ' &middot; ' + Math.round(CSCALE * 10) + '/10 size</div>' : '');
  if (card !== shownCard) { cardEl.innerHTML = card; shownCard = card; }
  if (club !== shownClub) { shownClub = club; clubsEl.innerHTML = CLUBS.map((c, k) => '<div class="club' + (k === club ? ' on' : '') + '"><b>' + (k + 1) + '</b> ' + c.name + '<i>' + (c.loft ? Math.round(c.v * c.v * clubK() * clubK() * Math.sin(2 * c.loft) / 9.81 / 5) * 5 + ' m' : 'on the green') + '</i></div>').join(''); }
  powerEl.className = charging || player.swing >= 0 ? 'on' : '';
  powerBar.style.width = (power * 100).toFixed(0) + '%';
  if (charging) powerTxt.textContent = Math.round(power * 100) + '%  ' + CLUBS[club].name;
  const byCart = !cart.on && Math.hypot(player.x - cart.x, player.y - cart.y) < 3.2;
  const hint = msgT > 0 ? msgText : '';
  if (hint !== shownMsg) { msgEl.textContent = hint; shownMsg = hint; }
  const kh = (cart.on ? '<b>G</b> get out &middot; <b>W S</b> go, brake &middot; <b>A D</b> steer' : byCart ? '<b>G</b> drive the cart' : nearBall() ? '<b>hold click</b> swing &middot; <b>1-4</b> club' : '<b>W</b> walk &middot; <b>A D</b> turn &middot; to the ball') + ' &middot; <b>H</b> help';
  if (kh !== shownKeys) { keysEl.innerHTML = kh; shownKeys = kh; }
  if (shownStyle !== biomeId || shownType !== ctypeId) styleShow();
  { const gm = canGimme() ? 'on' : ''; if (gimmeEl.className !== gm) gimmeEl.className = gm; }   // the gimme button shows when the putt left is short enough to be given
  { const far = ball.state === 0 && !bcam && player.swing < 0 && Math.hypot(player.x - ball.x, player.y - ball.y) > 4 ? 'on' : ''; if (jumpEl.className !== far) jumpEl.className = far; }   // the button shows when the ball lies still and the golfer is away from it
  { const wr = WDX * RX + WDY * RY, wf = WDX * FX + WDY * FY, deg = Math.round(Math.atan2(-wf, wr) * 57.3 / 5) * 5, gu = WG[(((Math.round(player.y * PPV) >> 5) & 127) << 7) | ((Math.round(player.x * PPM) >> 6) & 127)] > 110, ws = deg + (gu ? 'g' : '');   // the wind as the camera sees it; gold while a gust is on the golfer
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

````js file=game.js

// ---- loop
addEventListener('keydown', (e) => {
  if (e.repeat) return;
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
view.addEventListener('wheel', (e) => { camD = clamp(camD * (e.deltaY > 0 ? 1.1 : 1 / 1.1), 7, 42); if (e.preventDefault) e.preventDefault(); }, { passive: false });

function trimCaches() {   // drop what is far from the camera
  const cu = camX * PPM, cv = (camY - 30) * PPV;
  if (chunks.size > (preOn ? 1300 : 620)) { for (const [k, C] of chunks) if ((Math.abs(C.cx * CH - cu) > 3400 || Math.abs(C.cy * CH - cv) > 1500) && !(preOn && Math.abs(C.cx * CH - preX * PPM) < 2700 && Math.abs(C.cy * CH - preY * PPV) < 1400)) chunks.delete(k);   /* (the land where the ball will come down is kept) */ lastCK = NaN; }
  if (tiles.size > 330) {
    const tanV = (VW / 2 + 300) / FOC;
    for (const [k, T] of tiles) { const ex = (T.tx + 0.5) * TPX / PPM - camX, ey = (T.ty + 0.5) * TPX / PPV - camY, fd = ex * FX + ey * FY, la = Math.abs(ex * RX + ey * RY), near = Math.hypot((T.tx + 0.5) * TPX / PPM - player.x, (T.ty + 0.5) * TPX / PPV - player.y) < 52 || (preOn && Math.hypot((T.tx + 0.5) * TPX / PPM - preX, (T.ty + 0.5) * TPX / PPV - preY) < 62);
      if (!near && (wkOn ? fd < -12 || fd > 125 || la > tanV * (fd + 24) + 14 : Math.abs(T.tx * TPX - cu) > 6800 || Math.abs(T.ty * TPX - cv) > 3000)) tiles.delete(k); }   // (with a worker: all that is out of view and not round the golfer)
    lastTK = NaN; lastTile = null;
  }
  if (ocells.size > 2600) { for (const k of ocells.keys()) { const ix = Math.floor(k / 65536) - 32768, iy = (k % 65536) - 32768; if (Math.abs(ix * OC - cu) > 6800 || Math.abs(iy * OC - cv) > 3000) ocells.delete(k); } }
  if (ftiles.size > 340) { for (const [k, F] of ftiles) if (Math.abs(F.fx * FTS - camX) > 400 || Math.abs(F.fy * FTS - camY) > 400) ftiles.delete(k); for (let i = farQ.length - 1; i >= 0; i--) { const F = farQ[i]; if (ftiles.get((F.fx + 32768) * 65536 + (F.fy + 32768)) !== F) farQ.splice(i, 1); } }
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
  acc = Math.min(acc + (now - last), 100); last = now;
  while (acc >= STEP_MS) { tickGame(); acc -= STEP_MS; }
  render();
  if ((frame & 7) === 0) updateHud();
  if (((frame & 255) === 0 || (wkOn && (frame & 15) === 0 && tiles.size > 470)) && !bcam) trimCaches();   // (not while the camera is away with the ball: the land round the golfer is kept for the cut back)
  requestAnimationFrame(loop);
}
{
  const q = new URLSearchParams(location.search);
  if (q.get('seed')) SEED = +q.get('seed') | 0;
  setTime(q.get('time') ? clamp(+q.get('time') | 0, 0, 2) : 0);
  setBiome(BIOMES[q.get('biome')] ? q.get('biome') : 'parkland', CTYPES[q.get('type')] ? q.get('type') : 'private');   // ?biome=desert&type=links and so on
  try { for (const c of JSON.parse(localStorage.getItem('cinderlinks.courses') || '[]')) if (c && c.id && c.holes) MORE_COURSES.push(c); } catch (e) { /* nothing kept */ }
  if (q.get('find')) setTimeout(() => importCourse(q.get('find')), 800);
  { const c = q.get('course'); if (c !== 'none') loadCourse(c || 'woodhill') || loadCourse(courseList().length ? courseList()[0].id : ''); }   // the game starts on Woodhill (the owner's choice, 2026-11-12); ?course=<id> starts on another, ?course=none on the invented course
}
if (!/[?&]worker=0/.test(location.search || '')) wkStart();   // (?worker=0: the page makes the land itself, for comparing)
newHole(1, 0, 0);
firstPicture(); updateHud();
requestAnimationFrame(loop);
````
