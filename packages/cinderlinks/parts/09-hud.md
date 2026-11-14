## hud The HUD
The frame keeps Cinderdeep's HUD manner: a card of facts, the clubs as a row of tabs, a power bar, a message line, and a small map of the hole.
R: The card shows the hole, par, strokes (and the score against par), the round, the distance to the pin, the lie and the light.
R: Each club's tab shows how far it carries. A wind arrow shows the wind as the camera sees it and turns gold while a gust is on the golfer.
R: One line of hints says what can be done right now; H opens the full list of keys.
R: The map shows the hole from above with the tee, the pin, the ball and the golfer.
File: game.js
Check: function updateHud(
R: J5b: in host mode a CapitalEmpire card covers the picture from the course's coming until the pictures it opens on are in (the tree species within the render distance of the tee, his golfer's clips), at most 20 s; every other species is fetched at once behind it, and nothing stands in for a picture still loading.
Check: function drawMini(
Check: function coverTick(

````js file=game.js

// ---- hud
const $ = (id) => document.getElementById(id);
const cardEl = $('card'), clubsEl = $('clubs'), msgEl = $('msg'), powerEl = $('power'), powerBar = $('powerBar'), powerTxt = $('powerTxt'), miniEl = $('mini'), mctx = miniEl.getContext('2d');
const windEl = $('wind'), windArrow = $('windArrow'), keysEl = $('keys'), helpEl = $('help'), jumpEl = $('jump');
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
  shownStyle = biomeId; shownType = ctypeId; styleBtn.innerHTML = 'Settings<b>&#9662;</b>';   // (the owner, 2026-11-13: the button always reads Settings; the biome and type are chosen in its menu)
  const col = (title, kind, ids, T, cur) => '<div class="grp"><i>' + title + '</i>' + ids.map((id) => '<button type="button" data-kind="' + kind + '" data-id="' + id + '"' + (id === cur ? ' class="on"' : '') + '>' + T[id].name + '</button>').join('') + '</div>';
  // T447: inside the game the biome and the course type are the course's own (the host sends them): those two columns go; the trees, the picture and the render distance stay
  styleMenu.innerHTML = (HOST ? '' : col('Biome', 'b', BIOME_ORDER, BIOMES, biomeId) + col('Course type', 't', CTYPE_ORDER, CTYPES, ctypeId) + golferCol())   // (T450: the golfer, without a host)
    + picMenu()
    + '<div class="grp dist"><i>Render distance</i><input id="detail" type="range" min="150" max="400" step="25" value="' + VIEWR + '"><span id="detailV">' + VIEWR + ' m</span><em>How far the land, trees and grass are drawn. Higher needs a faster PC.</em></div>';
}
styleBtn.addEventListener('click', (e) => { styleMenu.className = styleMenu.className === 'on' ? '' : 'on'; if (styleBtn.blur) styleBtn.blur(); if (e.preventDefault) e.preventDefault(); });
styleMenu.addEventListener('click', (e) => { const t = e.target, id = t && t.getAttribute ? t.getAttribute('data-id') : null, kind = id ? t.getAttribute('data-kind') : null; if (!id) return;
  if (HOST) return;   // (T447: in the game the biome and course type are the course's)
  if (kind === 'b' && BIOMES[id] && id !== biomeId) { useStyle(id, null); firstPicture(); } else if (kind === 't' && CTYPES[id] && id !== ctypeId) { useStyle(null, id); firstPicture(); } else if (kind === 'g') golferPick(id);
  styleShow(); });   // (the menu stays open: a biome and a type are usually chosen together)
styleMenu.addEventListener('input', (e) => { const t = e.target; if (t && PIC_IN[t.id]) { const [k, f, sh] = PIC_IN[t.id]; picSet(k, +t.value * f); const v = document.getElementById(t.id + 'V'); if (v) v.textContent = sh(); return; } if (!t || t.id !== 'detail') return; setDetail(+t.value); const v = document.getElementById('detailV'); if (v) v.textContent = VIEWR + ' m'; });
try { localStorage.removeItem('cinderlinks.treeart'); } catch (e) { /* nothing kept */ }   // (T454: the Trees setting is gone: a host's trees are always its pictures)
try { const d0 = +localStorage.getItem('cinderlinks.view'); if (d0) setDetail(d0); } catch (e) {}   // (T447: the simple grass is the only grass: no choice kept)
const hudEl = $('hud'); let uiMin = true;
try { if (localStorage.getItem('cinderlinks.ui') === 'open') uiMin = false; } catch (e) {}
function setUi(min) { uiMin = min; hudEl.className = min ? 'min' : ''; try { localStorage.setItem('cinderlinks.ui', min ? 'min' : 'open'); } catch (e) {} }
hudEl.className = uiMin ? 'min' : ''; cardEl.title = 'Click, or press U: show or hide the panels';
cardEl.addEventListener('click', () => setUi(!uiMin));
const HELP = [['W S', 'walk forward, back (shift: run)'], ['A D', 'turn'], ['Q E', 'step sideways'], ['mouse', 'aim, beside the ball'], ['hold click', 'power, let go to swing'], ['1 2 3 4', 'club'], ['J', 'jump to the ball'], ['Y', 'take a gimme (a short putt, given)'], ['M', 'biome: parkland, coastal, beachside, desert, savanna, jungle, snow'], ['V', 'course type: links, tour, private, public'], ['U', 'show or hide the panels'], ['P', 'picture scale: 75, 50, 100%'], ['G', 'golf cart: in and out (W S go and brake, A D steer)'], ['middle drag', 'look around (the camera comes back behind you when you move)'], ['wheel', 'nearer, farther'], ['R F', 'raise, lower the camera'], ['C', 'camera behind the hole'], ['B', 'drop the ball by you'], ['T', 'time of day'], ['N', 'new land'], ['K', 'real courses: next'], ['L', 'find a real course by name'], ['H', 'hide this']];
if (!CART_SHOWN) { const gi = HELP.findIndex((h) => h[0] === 'G'); if (gi >= 0) HELP.splice(gi, 1); }   // (the cart is hidden for now: 08i-cart.md)
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
function updateHud() {
  const H = hole, m = matAt(ball.x, ball.y), d = Math.hypot(H.pin.x - ball.x, H.pin.y - ball.y);
  const score = strokes - H.par, row = (a, b) => '<div class="row"><span>' + a + '</span><b>' + b + '</b></div>';
  const card = (course ? '<div class="course">' + course.name + '</div>' : '') + '<div class="hole">Hole ' + (course ? course.holes[(holeN - 1) % course.holes.length].n : holeN) + '<span>par ' + H.par + '</span></div>' + row('Strokes', strokes + (strokes ? ' (' + (score > 0 ? '+' : '') + score + ')' : '')) + row('Round', total) + row('To pin', (d < 10 ? d.toFixed(1) : Math.round(d)) + ' m') + row('Lie', hostOnTurn() ? HP.turn.lieName || HP.turn.lieKind : MAT_NAME[m]) + (hostOnTurn() ? hostCardRows(row) : '') + row('Light', TOD[tmode].name) + (course ? '<div class="credit">' + course.credit + (course.hcredit ? ' &middot; heights: ' + course.hcredit : '') + ' &middot; ' + Math.round(course.S * 10) + '/10 size</div>' : '');
  if (PRAC) { const pc = pracCard(); if (pc !== shownCard) { cardEl.innerHTML = pc; shownCard = pc; } } else if (card !== shownCard) { cardEl.innerHTML = card; shownCard = card; }   // (J6: practising: the place, not the hole)
  if (club !== shownClub) { shownClub = club; clubsEl.className = HP && HP.clubs.length ? 'bag' : ''; clubsEl.innerHTML = HP && HP.clubs.length ? hostTabs() : CLUBS.map((c, k) => '<div class="club' + (k === club ? ' on' : '') + '"><div class="ct"><b>' + (k + 1) + '</b> ' + c.name + '<i>' + (c.loft ? Math.round(c.v * c.v * clubK() * clubK() * Math.sin(2 * c.loft) / 9.81 / 5) * 5 + ' m' : 'on the green') + '</i></div></div>').join('');   /* (J8: the standalone page's tabs keep the number, name and carry in one block, as the host's tabs do beside their tile) */ if (clubsEl.appendChild) clubsEl.appendChild(aimEl); }   // (J5f: the tabs are written again with the club: the aim's distance stays the box's last child)
  if (!HP) { powerEl.className = charging || player.swing >= 0 ? 'on' : ''; powerBar.style.width = (power * 100).toFixed(0) + '%'; }   // (host mode: the meter, hostMeterShow)
  if (charging && !HP) powerTxt.textContent = Math.round(power * 100) + '%  ' + clubName(club);
  const byCart = CART_SHOWN && !cart.on && !pracLock() && Math.hypot(player.x - cart.x, player.y - cart.y) < 3.2;
  const hint = msgT > 0 ? msgText : '';
  if (hint !== shownMsg) { msgEl.textContent = hint; shownMsg = hint; }
  const kh = (cart.on ? '<b>G</b> get out &middot; <b>W S</b> go, brake &middot; <b>A D</b> steer' : byCart ? '<b>G</b> drive the cart' : nearBall() ? '<b>hold click</b> swing &middot; <b>' + (HP ? '1-9, wheel' : '1-4') + '</b> club' + (HP ? ' &middot; <b>Z X</b> shape &middot; <b>I</b> boost' : '') : '<b>W</b> walk &middot; <b>A D</b> turn &middot; to the ball') + ' &middot; <b>H</b> help';
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
R: The swing in host mode (T446): only the swing button or Space starts it, never a click on the course or a panel; holding lines the camera up behind the ball along the aim, then fills the power to 100% and back; letting go strikes at the power held; a click on the course sets the aim and holds it.
R: Host mode (?host=1, T415): the page is a view inside another page (CapitalEmpire). It loads no course of its own, says { v: 1, t: 'ready' } to the page that holds it and waits for { v: 1, t: 'course', course, features, biome, type, seed, scale, hole }; it plays that course from hole `hole` (1 if none) and answers { v: 1, t: 'loaded', holes }. { t: 'leave' } stops it drawing; Escape sends { v: 1, t: 'exit' }. { v: 1, t: 'lies', lk } (T438) may come after the course: the host's lies, sent once read so the first picture does not wait for them; from then on the grass is drawn by them and the land made before them is made again (the sculptures are kept). Messages from anywhere but the page that holds it are ignored. The first picture in host mode is whole within 60 m, the far land standing in beyond until the rest is made; until the first turn (or the lies) come, one frame in four is drawn, so the host page, on the same thread, reads the lies sooner.
Check: function hostMessage(
R: Host play (T418 to T420): in host mode the host decides every shot. A strike sends { v: 1, t: 'input', input: { holeIdx, stroke, club, aim, power } } and waits (after 5 s it says it is waiting for the course, and keeps waiting); { t: 'shot' } is played back from its samples (the flight with the ball camera, a thump at the landing and each bounce, the roll, the rest); { t: 'turn' } puts the ball and the pin where the host has them and only then may he swing again; { t: 'holeEnd' } says the score. The club tabs are his bag from the turn (keys 1 to 9 and the wheel over the tabs), and the aim's arc and ring are the host's carry, wind push and scatter for the club in hand. Standalone play is unchanged.
Check: function hostShot(
Check: function hostAim(
Check: function hostTabs(
R: J5f (the owner, 2026-11-14), host mode: the aim's distance (from the ball to the aim ring, in metres) is read out above the club box; before the swing the blue ribbon is drawn at the aim's strength, so it ends on the aim ring (not at the club's full carry), and while he holds it grows with the meter and reaches the ring at the gold mark; Curve (draw to fade) and Flight (low to high) are sliders, any amount from none to the full old pick, and a side he has not earned is held at the middle and says what unlocks it.
Check: function hostPickAmt(
Check: function hostAimRead(
R: J8 (#1261; the owner: "add ALOT more images to the UI. especially on stuff you can do"): in host mode the shot panel's pictures: a painted tile at each end of Curve (shot-draw, shot-fade) and of Flight (shot-low, shot-high), above the end's name, and one on the Tour button (shot-spin), from CapitalEmpire's src/assets/ui/tiles (build.mjs copies them into tiles/). They are pictures only (no text, never a click of their own: the end names and Tour keep theirs), and a locked end's tile dims with its name.
Check: tiles/shot-spin.webp
R: J8: and each club tab wears its club's painted tile (club-driver, club-wood, club-long-iron for a hybrid and a 4-iron, club-iron, club-wedge, club-putter) at the left of its number, name and carry; Go for it wears go-for-it, and the page's Jump to ball and Gimme buttons jump-to-ball and gimme. Pictures only: a click on one is a click on its tab or button, and the tabs keep their class, number and carry (the host and the harness read them).
Check: function clubTile(

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
  if (m.t === 'shot') { if (groupOther(m) && !groupPlays(m)) return;   /* (T425: his group's strokes are played too: 08e-group.md) */ if (HP.play) { HP.q.push(m); return; } hostShot(m); return; }   // (anyone else's stroke: shown from T425)
  if (HP.play || HP.q.length) { HP.q.push(m); return; }
  if (m.t === 'turn') hostTurn(m); else if (m.t === 'holeEnd') hostHoleEnd(m);
}
function hostTurn(m) {   // the owner's turn: the ball and the pin where the model has them, his clubs in the tabs, the suggested club in hand
  const S = hostS(); HP.turn = m; HP.clubs = Array.isArray(m.clubs) ? m.clubs : []; HP.wait = 0; HP.over = false;
  if (m.hole !== holeN) newHole(m.hole, 0, 0);
  ball.x = ball.lx = m.ball[0] * S; ball.y = ball.ly = m.ball[1] * S; ball.z = groundH(ball.x, ball.y); ball.vx = ball.vy = ball.vz = 0; ball.state = 0;
  hole.pin.x = hole.green.x = m.pin[0] * S; hole.pin.y = hole.green.y = m.pin[1] * S;
  const kp = pracKept(m);   // (#1308: practising, the next ball is hit with what the last one was: his aim, club, curve, flight and spin stay until he moves them; a drill picked, or the first ball, takes the suggestion once)
  strokes = m.stroke - 1; autoClub = false; club = kp ? kp.ci : Math.max(0, HP.clubs.findIndex((c) => c.club === m.suggested.club)); shownClub = -2;
  HP.pick = kp ? kp.pick : null; HP.pv = null; HP.pvSig = ''; hostAimPin = kp ? kp.pin : false;   // (T441: each turn starts from a plain shot; T446: and the aim follows the mouse until a click sets it)
  const ax = (kp ? kp.ax : m.suggested.aim[0] * S) - ball.x, ay = (kp ? kp.ay : m.suggested.aim[1] * S) - ball.y, al = Math.hypot(ax, ay); if (al > 0.3) { aim.dx = ax / al; aim.dy = ay / al; }
  aim.x = kp ? kp.ax : m.suggested.aim[0] * S; aim.y = kp ? kp.ay : m.suggested.aim[1] * S;   // (J5c: the target too: it was left where the last turn, or the mouse passing, put it, and the strike went there)
  if (pracLock() ? Math.hypot(player.x - ball.x, player.y - ball.y) > 0.3 : m.stroke === 1 && ball.state === 0 && !bcam) jumpToBall();   // (J5c: on the tee always: he stands at his ball facing down the aim, the camera behind him)   // (J6: practising, each ball is teed up where he stands)   // (on the tee he stands at his ball; later he walks to it, or J)
}
function hostStrike() {   // the club meets the ball: the input goes to the host, and the ball waits for its answer
  const c = hostClub(), t = HP.turn, S = hostS(); if (!c || !t) return;
  const putt = c.club === 'putter', m = matAt(ball.x, ball.y);
  const sw = HP.out; HP.out = null;   // (T421: the meter's outcome; the power is then only what it would be without one)
  hostSend({ t: 'input', input: Object.assign({ holeIdx: t.holeIdx, stroke: t.stroke, club: c.club, aim: [aim.x / S, aim.y / S], power: sw ? Math.min(putt ? HOLD_PUTT_TOP : 1, Math.max(putt ? 0.05 : 0.3, sw.power)) : hostPower(power, putt) }, sw ? { swing: { power: sw.power, acc: sw.acc, boost: sw.boost, v: sw.v } } : {}, hostShotIn()) });   // (T441, T442: the shape and spin picked)
  if (HP.pick) HP.pick.armed = false;   // (spin and shape: T441, T442)
  pracSave(c);   // (#1308: what the next practice ball starts from)
  HP.wait = 1;
  if (!putt) sndShot(); else sndTap();
  for (let k = 0, n = putt ? 3 : 10 + ((power * 14) | 0); k < n; k++) {   // sparks off the club, and turf or sand
    addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, aim.dx * (1 + rnd() * 3) + (rnd() - 0.5) * 2, aim.dy * (1 + rnd() * 3) + (rnd() - 0.5) * 2, 1 + rnd() * 3, 16 + rndi(18), 0);
    if (!putt) addParticle(m === M_SAND ? P_SAND : P_TURF, ball.x, ball.y, ball.z + 0.05, aim.dx * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, aim.dy * (0.5 + rnd() * 2.5) + (rnd() - 0.5) * 1.6, 1.5 + rnd() * 2.5, 30 + rndi(30), rndi(6));
  }
}
function hostShot(m) {   // the owner's decided stroke: played back from its samples (hostBall)
  groupShotStart(m);   // (T425: another's stroke: the owner's ball and score put aside, 08e-group.md)
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
    { const vx = ball.x - x0, vy = ball.y - y0;   // (T442: a ball that turns back is spinning back: a zip of sparks and a tick where it bites)
      if (P.ldx !== undefined && !P.zip && vx * P.ldx + vy * P.ldy < 0) { P.zip = true; sndTap(); for (let k = 0; k < 10; k++) addParticle(P_SPARK, ball.x, ball.y, ball.z + 0.05, (rnd() - 0.5) * 1.6, (rnd() - 0.5) * 1.6, 0.6 + rnd(), 14 + rndi(12), 0); }
      if (Math.hypot(vx, vy) > 1e-4) { P.ldx = vx; P.ldy = vy; } }
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
  groupShotEnd(m);   // (T425: after another's stroke the owner's ball and score come back, 08e-group.md)
  galleryReact(m);   // (T429: the crowd near it cheers a holed putt, groans at a short miss: 08f-gallery.md)
  while (HP.q.length && !HP.play) { const q = HP.q.shift(); if (q.t === 'shot') hostShot(q); else if (q.t === 'turn') hostTurn(q); else if (q.t === 'holeEnd') hostHoleEnd(q); else if (q.t === 'practice') pracShow(q); }
}
function hostHoleEnd(m) {   // the hole is over: its score is said; after the last, the view waits for Escape
  const d = m.strokes - m.par, name = m.strokes === 1 ? 'Hole in one!' : d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : '+' + d;
  strokes = m.strokes; if (m.last) { HP.turn = null; HP.over = true; }
  HP.doneHole = m.holeIdx; HP.doneAt = 200;   // (T430: after the score has been seen, about three seconds, the view says so: the host's round goes on to its next hole, or ends)
  say(name + '  -  hole ' + m.hole + ' in ' + m.strokes + (m.last ? '  -  Esc goes back to the course' : '  -  on to the next tee'), m.last ? 100000 : 330);
}
function hostTick() {   // each step: the playback, the meter, and the wait for an answer
  hostBall(); hostMeterShow(); hostShotShow(); hostAimAsk(); pracTick();
  if (HP.doneAt > 0 && --HP.doneAt === 0) hostSend({ t: 'holeDone', holeIdx: HP.doneHole });
  if (HP.wait > 0 && ++HP.wait > HOST_WAIT && (HP.wait - HOST_WAIT) % 120 === 1) say('Waiting for the course...', 130);
}
function hostAim() {   // T420: the aim tells the truth: the arc to where the model's mean lands this club at this power (its carry in this lie, slope and wind, and
  // the wind's push off the line), and a ring at one standard deviation of where it lands (shot.ts SHOT_SCATTER: across the line and along it). A better
  // club or a steadier golfer draws a smaller ring. Its numbers come from the host's kit for the club (turn.clubs), worked out along the suggested line
  const C = hostClub(), t = HP.turn; if (!C || !t) return;
  const sw = HP.sw, u = sw ? sw.u : 1, b = sw ? hostBoost(sw.presses) : 0;   // (T421, T446: what the swing has set so far: the power held, and the boost added)
  const T = hostTarget();   // (T456: the aimed point on the ground)
  const S = hostS(), putt = C.club === 'putter', pw = sw ? (putt ? u * hostPuttTop() : u) + b : T ? T.pw : 1, hot = charging ? AIM_R : AIM_G, ph = (frame >> 1) % 6;   // (T456: a putt's meter reaches past the hole. J5f: before the swing the way is drawn at the aim's strength, so the ribbon ends on the aim ring and not at the club's full carry; held, it grows with the meter and is the same at the gold mark)
  if (T) hostTargetRing(T, C); else HP.target = null;
  const dx = aim.dx, dy = aim.dy, rx = -dy, ry = dx;                  // (the line, and his right as he faces it: x east, y south)
  if (!putt && hostAimPreview(C, pw, hot, ph)) return;               // (T441, T442: the model's preview of the shot picked, when it has come)
  if (putt && hostRead() && hostPuttAim(pw, hot, ph)) return;        // (T423: the host's read: the way a putt struck along this aim takes; J6: once earned)
  if (putt) {                                                          // a putt: its length is a share of the way to the pin; the blue ribbon along the green (J5b)
    const len = Math.hypot(hole.pin.x - ball.x, hole.pin.y - ball.y) * pw;
    ribStart(); for (let d = 0; d < len + 0.34; d += 0.35) { const e = d < len ? d : len, qx = ball.x + dx * e, qy = ball.y + dy * e; ribAdd(qx, qy, aimH(qx, qy) + 0.03); }
    ribbonO(RIB_W * 0.35 * S, false);
    return;
  }
  const carry = (C.playsM !== undefined ? C.playsM : C.carryM) * pw * S, side = (C.sideM || 0) * pw * S;
  const lx = ball.x + dx * carry + rx * side, ly = ball.y + dy * carry + ry * side, apex = (0.08 + 0.004 * (C.loftDeg || 30)) * carry, z0 = aimH(ball.x, ball.y), z1 = aimH(lx, ly);
  ribStart();
  for (let k = 0, n = Math.max(12, Math.round(carry / 1.6)); k <= n; k++) {   // the arc: the blue ribbon (J5b), a point every 3 m or so (smooth enough, half the cost)
    if ((k & 1) && k !== n) continue;
    const u = k / n, x = ball.x + (lx - ball.x) * u, y = ball.y + (ly - ball.y) * u, gz = aimH(x, y), z = z0 + (z1 - z0) * u + apex * 4 * u * (1 - u);
    ribAdd(x, y, Math.max(z, gz + 0.03));
  }
  ribbonO(RIB_W * S, false);
  const across = Math.max(0.4, (C.scatterM || 0) / 2 * pw * S), along = Math.max(0.4, (C.longM !== undefined ? C.longM : C.scatterM || 0) / 2 * pw * S);   // (one standard deviation: the host sends two)
  const na = Math.max(40, Math.min(160, Math.round((across + along) * 3)));
  for (let a = 0; a < na; a++) {                                       // the ring: one standard deviation across the line and along it
    const an = a / na * 6.2832, ca = Math.cos(an), sa = Math.sin(an), qx = lx + dx * along * ca + rx * across * sa, qy = ly + dy * along * ca + ry * across * sa;
    projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZA(PJ.x, PJ.y + 1, PJ.d - 0.3, AIM_D); plotZA(PJ.x, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); plotZA(PJ.x + 1, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); }
  }
  HP.ring = { x: lx, y: ly, across, along };   // (kept for the harness)
}
// T446 (the owner, 2026-11-13: "the original mechanic of holding and releasing the key when the distance is correct"): the swing is Cinderlinks' own
// hold and release, started only from the swing button (bottom centre) or Space, never by a click on the course, so a click on a menu, a tab or the
// spin ball cannot start one. Holding first lines the camera up behind the ball along the aim (a glide of HMETER.glide seconds, smooth in and out, the
// shortest way round; none when it is already within HMETER.line), and the meter waits for it. Then the power fills: it rises to 100% at the club's
// speed (turn.clubs[].speed: meter units a second, slower for a better golfer) and falls back again, as the original's did, while the heart beats
// faster; the landing marker grows with it. Letting go swings the club down and strikes at the power held (let go during the glide: no swing). There is
// no accuracy click: how straight it goes is the model's own spread for the golfer's skill (swing.ts HOLD_V), so the shot comes only from the host.
// Shift tapped while holding adds the boost (the host counts it only for a golfer with the card); I arms the full boost. A click on the course sets the
// aim and holds it there (so the mouse can go down to the button); before a click the aim follows the mouse, as it did.
const HMETER = { per: 0.01, max: 0.06, v: 3, glide: 0.4, line: 0.07 };   // (v: swing.ts HOLD_V; glide: seconds; line: radians the camera may be off and need no glide)
function hostBoost(n) { return Math.min(HMETER.max, Math.max(0, n) * HMETER.per); }
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
  const S = hostS(), dx = aim.dx, dy = aim.dy, rx = -dy, ry = dx;
  const R = T.putt ? Math.max(0.25 * S, 0.05 * T.d) : Math.max(1.2 * S, (C.scatterM || 0) / 2 * T.pw * S);
  const mark = (qx, qy, c) => { projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZA(PJ.x, PJ.y + 1, PJ.d - 0.3, AIM_D); plotZA(PJ.x, PJ.y, PJ.d - 0.3, c); plotZA(PJ.x + 1, PJ.y, PJ.d - 0.3, c); } };
  const n = Math.max(48, Math.min(220, Math.round(R / S * 30)));
  for (let a = 0; a < n; a++) { const an = a / n * 6.2832; mark(T.x + Math.cos(an) * R, T.y + Math.sin(an) * R, AIM_G); }
  const c = R * 0.6, tx = T.x + dx * c * 0.5, ty = T.y + dy * c * 0.5;   // (the chevron's point, a little past the centre, along the line)
  for (const sd of [-1, 1]) { const bx = tx - dx * c + rx * c * 0.75 * sd, by = ty - dy * c + ry * c * 0.75 * sd, m = Math.max(24, Math.round(c / S * 40)); for (let k = 0; k <= m; k++) { const u = k / m; mark(bx + (tx - bx) * u, by + (ty - by) * u, AIM_W); } }
  HP.target = { x: T.x, y: T.y, d: T.d, u: T.u, pw: T.pw, top: T.top, R };   // (kept for the harness)
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
    HP.sw = { t: 0, u: 0, presses: 0, spd: Math.max(0.3, C.speed > 0 ? C.speed : 1), g, rel: false };   // (J5e: never a meter too slow to see move) heartT = 0; charging = true; power = 0; hostAimPin = true;
    if (HP.ring) prewarmAt(HP.ring.x, HP.ring.y);   // (the land where it will come down is made while he lines up and swings)
    return true;
  }
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
  HP.out = { power: S.u * (C.club === 'putter' ? hostPuttTop() : 1), u: S.u, acc: 0, boost: HP.pick && HP.pick.armed && hostEarned('boost') && hostCharges() > 0 ? HMETER.max : hostBoost(S.presses), v: HMETER.v }; HP.lastSw = HP.out;
  S.rel = true; charging = false; if (C.club !== 'putter') sndBreath();   // (let go: he draws a breath and swings down)
  return true;
}
function hostMeterShow() {   // the meter on the swing button: the power held, the club and the boost; after the strike the power played
  const S = HP.sw, on = !!S || (player.swing >= 0 && !!HP.lastSw), turn = !!(HP.turn && !HP.over);
  if (powerEl.className) powerEl.className = '';                     // (host mode: the swing button carries the meter)
  const cls = turn ? (on ? 'on swinging' : hostBusy() || !nearBall() ? 'on idle' : 'on') : '';
  if (swingBtn.className !== cls) swingBtn.className = cls;
  if (!turn) { hostAimRead(null); return; }
  const pw = S ? S.u : on ? (HP.lastSw.u !== undefined ? HP.lastSw.u : HP.lastSw.power) : 0, boost = S ? (HP.pick && HP.pick.armed ? HMETER.max : hostBoost(S.presses)) : on ? HP.lastSw.boost : 0;
  swingFill.style.width = (Math.max(0, Math.min(1, pw)) * 100).toFixed(1) + '%';
  const txt = S && S.g ? 'Lining up ...' : S || on ? Math.round(pw * 100) + '%  ' + clubName(club) + (boost > 0 ? '  +' + Math.round(boost * 100) + '% boost' : '') + (S && !S.rel ? '  -  let go to hit' : '') : !nearBall() ? 'Walk to your ball (J)' : 'Hold to swing (or Space)';
  if (swingTxt.textContent !== txt) swingTxt.textContent = txt;
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
const swingBtn = document.createElement('div'), swingFill = document.createElement('i'), swingTxt = document.createElement('span'), swingAimMk = document.createElement('b'), swingHoleMk = document.createElement('b');
swingBtn.id = 'swingBtn'; swingAimMk.className = 'aimmk'; swingHoleMk.className = 'holemk'; swingBtn.appendChild(swingFill); swingBtn.appendChild(swingHoleMk); swingBtn.appendChild(swingAimMk); swingBtn.appendChild(swingTxt);   // (T456: the aim's and the hole's marks on the bar)
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
  return (t.green ? row('Read', hostRead() ? t.green.read.replace(/^Green read: /, '') : 'locked: ' + ((t.earned && t.earned.why && t.earned.why.read) || 'the Putting drill')) : '') + row('Slope', up + side) + row('Wind', wind) + (hostClub() && hostClub().club !== 'putter' ? row('Shot', hostPickText()) : '') + (t.lieNote ? '<div class="credit">' + t.lieNote + '</div>' : '');
}
function hostWindDir() {   // the way the host's wind blows (toward), on the ground: the arrow shows it; null without a turn (the view's own wind)
  if (!HP || !HP.turn || !HP.turn.wind || HP.turn.wind.mph < 1) return null;
  const b = HP.turn.wind.from * Math.PI / 180; return [-Math.sin(b), Math.cos(b)];   // (from the north, 0, it blows south: + y)
}
// T441, T442, T443: the shot he picks before the swing, the model's preview of it, and what he has earned.
// - The shape (shape.ts ShotShape): the curve (draw, straight, fade; Z steps through them) and the flight (normal, high, low; X).
// - The ball control (spin.ts SpinInput): a strike point picked on the ball (low for backspin, high to run on, left and right for side spin); tour spin
//   adds the clicks in the air a card allows. A click on the ball's middle takes the spin off.
// - The boost (I, or the button): armed, the swing is a "go for it" (swing.ts BOOST.max: more carry, a narrower sweet band, a wider miss), one charge.
// What he has not earned (turn.earned, unlocks.ts) is greyed and says what unlocks it; the host takes it out of an input anyway.
// The aim draws the host's preview: the model's shot for this pick with no luck in it (its curve, its landing, then its bounce and roll as a fainter line).
function hostEarned(k) { const e = HP && HP.turn && HP.turn.earned; return !e || !!e[k]; }   // (an older host sends none: everything)
function hostWhy(k) { const e = HP && HP.turn && HP.turn.earned; return (e && e.why && e.why[k]) || ''; }
function hostCharges() { const t = HP && HP.turn; return t && t.charges !== undefined ? t.charges : hostEarned('boost') ? 1 : 0; }
function hostPick() { if (!HP.pick) HP.pick = { curve: 0, flight: 0, sx: 0, sy: 0, tour: false, armed: false }; return HP.pick; }
function hostLock(n) { say(n[0].toUpperCase() + n.slice(1) + ' is locked: ' + (hostWhy(n) || 'not earned yet'), 200); return false; }
// J5f (the owner, 2026-11-14: "add a slider so you can increase and decrease the draw or fade. low or high flight too"): the curve and the flight are amounts, -1 to 1 (a full
// draw .. straight .. a full fade; low .. normal .. high), set by the panel's sliders (hostPickAmt) and sent as they are; the old picks are the ends and the middle.
function hostPickSet(k) {   // a pick from a button or a key; a locked one says what unlocks it
  const P = hostPick();
  if (k === 'draw' || k === 'fade') { if (!hostEarned(k)) return hostLock(k); P.curve = P.curve === (k === 'draw' ? -1 : 1) ? 0 : k === 'draw' ? -1 : 1; }
  else if (k === 'straight') P.curve = 0;
  else if (k === 'high' || k === 'low') { if (!hostEarned(k)) return hostLock(k); P.flight = P.flight === (k === 'high' ? 1 : -1) ? 0 : k === 'high' ? 1 : -1; }
  else if (k === 'normal') P.flight = 0;
  else if (k === 'tour') { if (!hostEarned('tour')) return hostLock('tour'); P.tour = !P.tour; }
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
function hostSpinAt(fx, fy) {   // the strike point on the ball (-1..1 each, y up): side spin and backspin only when earned
  const P = hostPick(), r = Math.hypot(fx, fy); let x = fx, y = fy; if (r > 1) { x /= r; y /= r; } if (r < 0.18) { x = 0; y = 0; }
  if (x && !hostEarned('side')) { say('Side spin is locked: ' + hostWhy('side'), 200); x = 0; }
  if (y < 0 && !hostEarned('back')) { say('Backspin is locked: ' + hostWhy('back'), 200); y = 0; }
  P.sx = +x.toFixed(2); P.sy = +y.toFixed(2); shotShown = '';
}
function hostPickText() {   // (J5f: a part amount says how much, as shape.ts pickText does: "Draw 40%"; a full one is just "Draw")
  const P = hostPick(), pc = (v) => (Math.abs(v) >= 0.995 ? '' : ' ' + Math.round(Math.abs(v) * 100) + '%'), c = P.curve < 0 ? 'Draw' + pc(P.curve) : P.curve > 0 ? 'Fade' + pc(P.curve) : '', f = P.flight > 0 ? 'high' + pc(P.flight) : P.flight < 0 ? 'low' + pc(P.flight) : '', sp = Math.round(Math.hypot(P.sx, P.sy) * 100);
  const spin = sp ? (P.sy < -0.2 ? 'backspin' : P.sy > 0.2 ? 'topspin' : 'side spin') + ' ' + sp + '%' + (P.tour ? ' + tour' : '') : '';
  return [c && f ? c + ', ' + f : c || (f ? f[0].toUpperCase() + f.slice(1) : 'Straight'), spin, P.armed ? 'boost' : ''].filter(Boolean).join(' · ');
}
function hostShotIn() {   // what the pick adds to an input (none for a putt)
  const P = hostPick(), c = hostClub(); if (!c || c.club === 'putter') return {};
  const o = {}; if (P.curve || P.flight) o.shape = { curve: P.curve, flight: P.flight }; if (P.sx || P.sy || P.tour) o.spin = { x: P.sx, y: P.sy, pump: P.tour ? 4 : 0 }; return o;
}
// the panel: built once, shown while it is his turn with a full shot in hand
const shotEl = document.createElement('div'); shotEl.id = 'shotc';
shotEl.innerHTML = '<div class="row sl"><span data-z="curve" title="Click to centre">Curve</span><small data-e="draw"><img src="tiles/shot-draw.webp" alt="" aria-hidden="true" draggable="false">Draw</small><input type="range" data-s="curve" min="-100" max="100" step="5" value="0" aria-label="Curve: draw to fade"><small data-e="fade"><img src="tiles/shot-fade.webp" alt="" aria-hidden="true" draggable="false">Fade</small></div>'   // (J5f: sliders, a draw .. a fade, low .. high)
  + '<div class="row sl"><span data-z="flight" title="Click to centre">Flight</span><small data-e="low"><img src="tiles/shot-low.webp" alt="" aria-hidden="true" draggable="false">Low</small><input type="range" data-s="flight" min="-100" max="100" step="5" value="0" aria-label="Flight: low to high"><small data-e="high"><img src="tiles/shot-high.webp" alt="" aria-hidden="true" draggable="false">High</small></div>'
  + '<div class="row"><span>Spin</span><canvas id="spinBall" width="40" height="40"></canvas><b data-k="tour"><img src="tiles/shot-spin.webp" alt="" aria-hidden="true" draggable="false">Tour</b></div>'
  + '<div class="row"><b data-k="boost" class="boost"><img src="tiles/go-for-it.webp" alt="" aria-hidden="true" draggable="false">Go for it</b><i id="boostTxt"></i></div><div id="pickTxt"></div>';
if (typeof hudEl !== 'undefined' && hudEl.appendChild) hudEl.appendChild(shotEl);
const spinBall = shotEl.querySelector ? shotEl.querySelector('#spinBall') : null, sctx = spinBall && spinBall.getContext ? spinBall.getContext('2d') : null;
let shotShown = '';
if (shotEl.addEventListener) shotEl.addEventListener('mousedown', (e) => {
  if (e.stopPropagation) e.stopPropagation();
  const t = e.target; if (t && t.dataset && t.dataset.s) return;   // (J5f: a slider takes its own press: dragging it needs the browser's own handling)
  if (e.preventDefault) e.preventDefault();
  if (!HP || !t) return;
  if (t === spinBall && spinBall.getBoundingClientRect) { const r = spinBall.getBoundingClientRect(); hostSpinAt(((e.clientX - r.left) / r.width - 0.5) * 2.2, -((e.clientY - r.top) / r.height - 0.5) * 2.2); }
  else if (t.dataset && t.dataset.k) hostPickSet(t.dataset.k);
  else if (t.dataset && t.dataset.z) hostPickAmt(t.dataset.z, 0);   // (J5f: a click on a slider's name puts it back in the middle)
});
if (shotEl.addEventListener) {   // J5f: the sliders: each move is an amount (a locked side holds the thumb at the middle, with its message); let go, the keys go back to the game; a double click centres
  shotEl.addEventListener('input', (e) => { const t = e.target; if (!HP || !t || !t.dataset || !t.dataset.s) return; const a = Math.round(hostPickAmt(t.dataset.s, +t.value / 100) * 100); if (+t.value !== a) t.value = a; });
  for (const ev of ['change', 'pointerup']) shotEl.addEventListener(ev, (e) => { const t = e.target; if (t && t.dataset && t.dataset.s && t.blur) t.blur(); });   // (a drag that ends where it began fires no change: the release lets go too)
  shotEl.addEventListener('dblclick', (e) => { const t = e.target; if (HP && t && t.dataset && t.dataset.s) hostPickAmt(t.dataset.s, 0); });
}
function hostShotShow() {   // the panel, written only when something changed
  const on = hostOnTurn() && !hostBusy() && !HP.sw && !!hostClub() && hostClub().club !== 'putter', P = hostPick();
  const sig = on ? [P.curve, P.flight, P.sx, P.sy, P.tour, P.armed, hostCharges(), JSON.stringify((HP.turn && HP.turn.earned) || '')].join('|') : 'off';
  if (sig === shotShown) return; shotShown = sig; shotEl.className = on ? 'on' : ''; if (!on || !shotEl.querySelectorAll) return;
  for (const b of shotEl.querySelectorAll('b[data-k]')) {   // (the Tour and Go for it buttons)
    const k = b.dataset.k, earnedK = hostEarned(k), sel = (k === 'tour' && P.tour) || (k === 'boost' && P.armed);
    b.className = (k === 'boost' ? 'boost ' : '') + (sel ? 'sel' : '') + (earnedK ? '' : ' lock'); b.title = earnedK ? '' : 'Locked: ' + hostWhy(k);
  }
  for (const e of shotEl.querySelectorAll('small[data-e]')) { const ok = hostEarned(e.dataset.e); e.className = ok ? '' : 'lock'; e.title = ok ? '' : 'Locked: ' + hostWhy(e.dataset.e); }   // (J5f: a slider's end he has not earned is struck through)
  for (const s of shotEl.querySelectorAll('input[data-s]')) {   // J5f: each slider: where the amount stands, gold from the middle to the thumb, the side he has not earned dimmed and saying what unlocks it
    const cv = s.dataset.s === 'curve', v = Math.round((cv ? P.curve : P.flight) * 100), neg = cv ? 'draw' : 'low', pos = cv ? 'fade' : 'high', lo = hostEarned(neg), hi = hostEarned(pos), p = (v + 100) / 2;
    if (+s.value !== v) s.value = v;
    s.className = v ? 'on' : '';
    s.title = lo && hi ? 'Double-click to centre' : 'Locked: ' + [lo ? '' : neg + ': ' + (hostWhy(neg) || 'not earned yet'), hi ? '' : pos + ': ' + (hostWhy(pos) || 'not earned yet')].filter(Boolean).join(' / ');
    if (s.style && s.style.setProperty) { s.style.setProperty('--a', Math.min(50, p) + '%'); s.style.setProperty('--b', Math.max(50, p) + '%'); s.style.setProperty('--l', lo ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'); s.style.setProperty('--r', hi ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)'); }
  }
  const bt = shotEl.querySelector('#boostTxt'); if (bt) bt.textContent = hostEarned('boost') ? hostCharges() + ' left this hole' : 'locked';
  const pt = shotEl.querySelector('#pickTxt'); if (pt) pt.textContent = hostPickText();
  if (sctx) {   // the ball and its strike point
    sctx.clearRect(0, 0, 40, 40); sctx.fillStyle = '#efe9da'; sctx.beginPath(); sctx.arc(20, 20, 17, 0, 6.2832); sctx.fill();
    sctx.fillStyle = 'rgba(20,21,25,0.3)'; if (!hostEarned('back')) sctx.fillRect(3, 20, 34, 17); if (!hostEarned('side')) { sctx.fillRect(3, 3, 9, 34); sctx.fillRect(28, 3, 9, 34); }
    sctx.fillStyle = '#e8573c'; sctx.beginPath(); sctx.arc(20 + P.sx * 15, 20 - P.sy * 15, 3.5, 0, 6.2832); sctx.fill();
  }
}
// the preview: asked for when the pick, the club or the line changes (a few times a second at most), drawn when the answer is for what is picked now
function hostAimSig() { const c = hostClub(), P = hostPick(); return c ? [c.club, P.curve, P.flight, P.sx, P.sy, P.tour, P.armed, Math.round(Math.atan2(aim.dy, aim.dx) * 360 / Math.PI)].join('|') : ''; }
function hostAimAsk() {
  if (!hostOnTurn() || hostBusy() || HP.sw || !nearBall() || !hostClub() || hostClub().club === 'putter') return;
  const sig = hostAimSig(); HP.tk = (HP.tk || 0) + 1; if (sig === HP.pvSig || HP.tk - (HP.pvAt || -99) < 8) return;
  const t = HP.turn, S = hostS(); HP.pvSig = sig; HP.pvAt = HP.tk; HP.pvKey = (HP.pvKey || 0) + 1;
  hostSend({ t: 'aim', key: HP.pvKey, input: Object.assign({ holeIdx: t.holeIdx, stroke: t.stroke, club: hostClub().club, aim: [aim.x / S, aim.y / S], power: 1 }, hostShotIn(), HP.pick.armed ? { swing: { power: 1, acc: 0, boost: HMETER.max, v: HMETER.v } } : {}) });
}
const AIM_RL = rgb(150, 205, 255);   // the bounce and roll after the landing: a fainter line
function hostAimPreview(C, pw, hot, ph) {   // the preview's flight (scaled to the power while he swings), its ring, and its roll; false when there is none for this pick
  const pv = HP.pv; if (!pv || !pv.shot || pv.sig !== HP.pvSig || pv.club !== C.club) return false;
  const m = pv.shot, S = hostS(), F = m.flight, n = F.length; if (n < 2) return false;
  const bx = ball.x, by = ball.y, k = pw, at = (p) => [bx + (p[0] * S - bx) * k, by + (p[1] * S - by) * k];
  ribStart();
  for (let i = 0; i < n; i++) {   // the curved flight: the blue ribbon (J5b), every other sample
    if ((i & 1) && i !== n - 1) continue;
    const q = at(F[i]), gz = aimH(q[0], q[1]);
    ribAdd(q[0], q[1], Math.max(gz + 0.03, gz + F[i][2] * S * k));
  }
  ribbonO(RIB_W * S, false);
  const L = at(F[n - 1]), dx0 = L[0] - bx, dy0 = L[1] - by, dl = Math.hypot(dx0, dy0) || 1, dx = dx0 / dl, dy = dy0 / dl, rx = -dy, ry = dx;
  const across = Math.max(0.4, (C.scatterM || 0) / 2 * pv.spread * pw * S), along = Math.max(0.4, (C.longM !== undefined ? C.longM : C.scatterM || 0) / 2 * pv.spread * pw * S);
  const na = Math.max(40, Math.min(160, Math.round((across + along) * 3)));
  for (let a = 0; a < na; a++) { const an = a / na * 6.2832, qx = L[0] + dx * along * Math.cos(an) + rx * across * Math.sin(an), qy = L[1] + dy * along * Math.cos(an) + ry * across * Math.sin(an); projectO(qx, qy, aimH(qx, qy) + 0.03, PJ); if (PJ.s > 0) { plotZA(PJ.x, PJ.y + 1, PJ.d - 0.3, AIM_D); plotZA(PJ.x, PJ.y, PJ.d - 0.3, a & 1 ? hot : AIM_W); } }
  const R = [F[n - 1]].concat(m.roll || []);   // the bounce and roll: a fainter, narrower ribbon from the landing to where it stops
  ribStart();
  for (let i = 0; i + 1 < R.length; i++) { const a = at(R[i]), b = at(R[i + 1]), seg = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = 0; d < seg; d += 0.6) { const u = d / seg, x = a[0] + (b[0] - a[0]) * u, y = a[1] + (b[1] - a[1]) * u; ribAdd(x, y, aimH(x, y) + 0.04); } }
  if (R.length > 1) { const E2 = at(R[R.length - 1]); ribAdd(E2[0], E2[1], aimH(E2[0], E2[1]) + 0.04); }
  ribbonO(RIB_W * 0.45 * S, true);
  HP.ring = { x: L[0], y: L[1], across, along, pv: true };
  return true;
}
// T423: the green as the host reads it. Its slope grid is the host's (its own heights: the view's are raised and roughened for the look), drawn as a
// dot every metre with a tick downhill, white on the flat, then cyan, yellow, orange as it steepens (green.ts BREAK_COLOURS). A putt is aimed as one is
// read: the aim shows the way a putt struck along it takes (the host's holed way, turned with the aim and stretched with the pace), and the model judges
// it against the read's start line (green3p.ts), so a putt started along the read and struck at the right pace goes in.
const GRID_RGB = [rgb(255, 255, 255), rgb(125, 211, 252), rgb(250, 204, 21), rgb(249, 115, 22)];
const PG_MEMO = new WeakMap();   // T438: a green's grid points on the land (x, y, height; 0 or 4 tick points after each), worked out once a green, not each frame
function hostPuttPts(G, S) {
  const hv = course && course.raw ? course.raw.hv : 0; let M = PG_MEMO.get(G);
  if (M && M.S === S && M.hv === hv) return M;
  const P = G.pts, xyz = [], col = [], nt = [];
  for (let k = 0; k + 4 < P.length; k += 5) {
    const x = P[k] * S, y = P[k + 1] * S, s = P[k + 4], u = s <= 0.002 ? 0 : Math.min(1, (s - 0.002) / 0.038);
    col.push(GRID_RGB[u <= 0 ? 0 : u < 0.3 ? 1 : u < 0.65 ? 2 : 3]); xyz.push(x, y, groundH(x, y) + 0.02);
    if (u > 0) {   // the tick downhill: longer where steeper
      const L = (0.12 + 0.3 * u) * S, ex = x + P[k + 2] * L, ey = y + P[k + 3] * L;
      for (let t = 0.25; t <= 1; t += 0.25) { const qx = x + (ex - x) * t, qy = y + (ey - y) * t; xyz.push(qx, qy, groundH(qx, qy) + 0.02); }
      nt.push(4);
    } else nt.push(0);
  }
  M = { S, hv, xyz: Float64Array.from(xyz), col, nt }; PG_MEMO.set(G, M); return M;
}
function hostPuttGrid() {
  const M = hostPuttPts(HP.turn.green, hostS()), X = M.xyz;
  for (let p = 0, q = 0; p < M.col.length; p++) {
    const c = M.col[p], n = M.nt[p], q0 = q; q += 3 * (1 + n);
    projectO(X[q0], X[q0 + 1], X[q0 + 2], PJ); if (PJ.s <= 0 || PJ.d < 1.5) continue;
    plotZO(PJ.x, PJ.y, PJ.d - 0.2, c); plotZO(PJ.x + 1, PJ.y, PJ.d - 0.2, c);
    for (let t = 1; t <= n; t++) { const r = q0 + 3 * t; projectO(X[r], X[r + 1], X[r + 2], PJ); if (PJ.s > 0) plotZO(PJ.x, PJ.y, PJ.d - 0.2, c); }
  }
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
  ribbonO(RIB_W * 0.35 * S, false);
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
  return HP.clubs.map((c, k) => { const lie = c.lieM !== undefined ? c.lieM : c.carryM, cut = c.club !== 'putter' && lie < c.carryM - 0.5; return '<div class="club' + (k === club ? ' on' : '') + (cut ? ' cut' : '') + '"><img class="ci" src="tiles/' + clubTile(c.club) + '.webp" alt="" aria-hidden="true" draggable="false"><div class="ct">' + (k < 9 ? '<b>' + (k + 1) + '</b> ' : '') + (CLUB_NAME[c.club] || c.club) + '<i>' + (c.club === 'putter' ? (c.fit || 'on the green') : Math.round(lie) + ' m' + (cut ? ' ▼' : '')) + '</i></div></div>'; }).join('');
}
function hostPickClub(k) { if (!HP || !HP.clubs.length || charging || player.swing >= 0) return; club = Math.max(0, Math.min(HP.clubs.length - 1, k)); }
clubsEl.addEventListener('wheel', (e) => { if (!HP || !HP.clubs.length) return; hostPickClub(club + (e.deltaY > 0 ? 1 : -1)); if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }, { passive: false });

// ---- loop
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (HP && HP.sw && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) { HP.sw.presses++; return; }   // (host mode: the boost, tapped while the swing is held: T421, T443; Shift since T446, Space now swings)
  if (HP && HP.turn && !HP.sw && (e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyI')) { hostPickSet(e.code === 'KeyZ' ? 'curve' : e.code === 'KeyX' ? 'flight' : 'boost'); return; }   // (T441, T443: the shape and the boost)
  if (HOST && e.code === 'Escape') { hostSend({ t: 'exit' }); return; }   // (the host page closes the view)
  keys[e.code] = true;
  if (e.code === 'KeyT') setTime((tmode + 1) % TOD.length);
  else if (e.code === 'KeyC') { behindHole(); camD = D0; camHk = 1; HZ = HZ0; camK = { d: D0, hk: 1 }; }
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
  else if (e.code === 'KeyH') { helpOn = !helpOn; helpEl.className = helpOn ? 'on' : ''; }
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
  if (camDrag) { camYaw -= (e.movementX || 0) * 0.005; HZ = Math.round(clamp(HZ + (e.movementY || 0) * 0.7 * RS, 40 * RS, SH * RS)); }   // (a whole row: the sky is read by row)   // the middle button holds the scene: drag it round, drag it up or down
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
