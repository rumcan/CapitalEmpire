## practice Practice at the range and the chipping green (J6)
When the owner practises (CapitalEmpire's `play/practice3p.ts`, `play/drills.ts`), the host sends `{ v: 1, t: 'practice', place, drills, active, note, paid, flags, hcp, balls }` before the first turn and after each ball and each pick; the view answers a drill picked with `{ v: 1, t: 'pick', drill }`. The balls are the host's, as in a round: each turn tees the next one up on the spot.
R: While practising the golfer is held to his spot (a range mat, the chip stand, the putt, the practice bunker): W, S, Q and E do not walk him, there is no cart (G does nothing and none is drawn), J, B, N, K and L do nothing; A and D still turn him, and the mouse aims. Each ball is teed up where he stands, and he is set beside it.
R: A panel on the left lists the drills: each its name, its goal, its progress (3/5) and its reward, the one being played marked, a done one ticked; a drill played at the other place is greyed with where it is played. A click on a drill played here picks it (the next ball comes from its spot). Under the list: the last ball's line, the balls hit and the handicap. A drill just done is said, with its reward.
R: J6c: the view draws no text over the range, never any label made by code, and on the range no flag of its own: the distances are the range's own pictures (its yardage signs, sent with its things), a built target green's flag is the range's own pin picture, and a junk pile (an old car, tyres, oil drums: J7's) is its picture alone (its name and distance show as the game's hover label on the map). (Before J6c: on the range each target green had its flag, with its distance over it, and each junk pile its name and distance.) A host that still sends `flags` gets their flag sprites, never their words. A ball that lands on or stops by a junk pile is said (Hit the old car!).
R: #1308 (the owner: "the guy resets to a default target on the range after every hit"): the aim is his: after a ball lands the next one starts from the aim, club, curve, flight and spin he left (a ball hit from a spot that moves, as a putt, keeps the target spot and turns to it). Only the first ball and a drill he clicks take the host's suggestion, once.
R: The card at the top says Practice and the place instead of the hole, par and strokes, and the words as it opens say where he practises, not the hole and its par.
R: #1301 (the owner: "make the left menu cards and scrollable"): each drill is a card: its picture at 64 px, name, progress (a bar and 3/5), goal and reward; the marked one gold, a done one ticked, one played at the other place dimmed with where it is played; the list is never taller than the view, scrolls up and down inside it (never sideways), keeps where it was scrolled when it is written again after a ball, and brings the marked drill into view when it changes.
R: J8 (#1261; the owner: "add ALOT more images to the UI. especially on stuff you can do"): each drill in the panel wears its painted tile (CapitalEmpire's src/assets/ui/tiles: Distance control, Shot shaping, Flight, Junk targets, Up and down, Putting, Bunker; build.mjs copies them into tiles/) at the left of its name, goal and progress, as a picture only (alt empty: the name beside it says it); a drill with no tile shows none. The panel is never taller than the picture: past 76% of its height it scrolls up and down (never sideways).
R: #1344 (the owner, 2026-11-15: "make the 'practice - the range' window shrink and expand. fix the scroll bar style"): a click on the panel's header folds it to a small pill in the HUD's look (Practice · The range · Ball 12 ▸, the place in the serif gold as the hole pill has it); a click on the pill opens it again, and the choice is kept (localStorage cinderlinks.pracFold). Its scroll bar is the HUD's: thin (6 px), a rounded muted-gold thumb on a clear track, brighter under the pointer, no arrows (Blink's ::-webkit-scrollbar, Firefox's scrollbar-width and scrollbar-color); never a sideways one: long words wrap.
R: #1344 (the owner: "add some info about the ball you just hit. center top. how far it went, spin, ball speed and swing speed. things that you can improve"): the host sends the ball just played with the practice message after it (`last`: CapitalEmpire's play/launch.ts, its numbers and tips; the view only shows them). Once the ball rests a launch monitor's strip shows at the top centre, under the top edge and clear of the hole pill and the map: the club, then on the range the carry, the total, how far offline, the ball and club speed (mph, as the wind), the smash, the launch, the apex, the backspin and the side spin (draw or fade); at the chipping green the carry, the roll, the distance to the pin and the spin; for a putt its length, how far short or long and the line missed; under them one or two things to improve. It stays until the next ball is struck, and a small x closes it. It is written only when a ball's message comes, never per frame.
File: game.js
Check: function pracIn(
Check: function pracShow(
Check: function pracLock(
Check: function pracTick(
Check: function pracClear(
Check: function pracKept(
Check: function pracSave(
Check: var PRAC_TILE
Check: function pracFoldSet(
Check: function pracLastShow(
Check: function pracLastHide(

````js file=game.js

// ---- practice (J6): the drills panel, the golfer held to his spot, the range's flags. The message waits behind a ball being played back, as a turn does.
var K_PFLAG = 26;     // a range flag's entry in render's list (08d-actors.md K_ACTOR is 25)
var PRAC = null, pracEl = null, pracLab = [], pracKeep = null, pracNew = true, pracPicked = false, pracSeen = null, pracFold = false, pracLastEl = null, pracLastV = null;   // (#1344: pracFold, the panel folded to its pill (kept); pracLastEl, the last ball's strip at the top centre; pracLastV, the readout it shows (null: none))   // (#1308: pracKeep, the aim, club and picks of the last ball struck; pracNew, the next turn takes the host's suggestion once; pracPicked, a drill was clicked; #1301: pracSeen, the drill marked when the list was last written)   // (var: read by the render and the keys, which may run before this line has)
var PRAC_TILE = { distance: 'drill-distance', shaping: 'drill-shaping', flight: 'drill-flight', junk: 'drill-junk', updown: 'drill-up-down', putting: 'drill-putting', bunker: 'drill-bunker' };   // J8 (#1261): a drill's painted tile (tiles/<name>.webp, copied by build.mjs from CapitalEmpire's src/assets/ui/tiles)
function pracLock() { return !!PRAC; }   // the golfer is held to his spot
function pracClear() {   // a new course: no practice (the panel and the flags' labels go)
  PRAC = null; pracKeep = null; pracNew = true; pracPicked = false; if (pracEl) pracEl.style.display = 'none'; padKeep = null; pracLastHide();   // (J6c: the pad pass kept for a still picture goes with it: parts/08c-features.md)
  for (const L of pracLab) if (L.parentNode) L.parentNode.removeChild(L);
  pracLab = [];
}
function pracIn(m) {   // the host's 'practice': now, or once the ball in the air has come to rest (hostRest takes it from the queue)
  if (HP && (HP.play || HP.q.length)) { HP.q.push(m); return; }
  pracShow(m);
}
function pracEsc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function pracShow(m) {   // the panel and a drill done said (J6c: no labels over the flags)
  const first = !PRAC; PRAC = m; if (first || pracPicked) { pracNew = true; pracKeep = null; } pracPicked = false;   // (#1308: the first ball and a drill he clicked take the suggested aim once; every ball after keeps his)
  if (!pracEl && typeof document !== 'undefined' && document.createElement) {
    pracEl = document.createElement('div'); pracEl.className = 'panel'; pracEl.id = 'prac';   // (#1301: never taller than the view: it ends above the club tabs, and scrolls up and down inside; #1344: its place, size and scroll bar are style.css's #prac, so it can fold)
    try { pracFold = localStorage.getItem('cinderlinks.pracFold') === '1'; } catch (err) { /* (no storage: open) */ }
    pracEl.addEventListener('click', (e) => {   // a drill picked: the host answers with the panel and the next ball from its spot; #1344: the header folds the panel, the pill opens it
      let el = e.target; while (el && el !== pracEl && !(el.dataset && (el.dataset.drill || el.dataset.fold))) el = el.parentNode;
      if (el && el !== pracEl && el.dataset && el.dataset.fold) { pracFoldSet(!pracFold); if (e.preventDefault) e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return; }
      if (el && el !== pracEl && el.dataset && el.dataset.here === '1' && PRAC && el.dataset.drill !== PRAC.active && !hostBusy() && player.swing < 0 && !charging) { pracPicked = true; hostSend({ t: 'pick', drill: el.dataset.drill }); }
      if (e.preventDefault) e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // (Space must swing, never press the panel)
    });
    pracEl.addEventListener('mousedown', (e) => { if (e.stopPropagation) e.stopPropagation(); });
    { const host = document.getElementById ? document.getElementById('hud') : null; if (host && host.appendChild) host.appendChild(pracEl); else if (document.body && document.body.appendChild) document.body.appendChild(pracEl); }   // (#1344: in the HUD, over the picture, as its other panels)
  }
  const rows = (Array.isArray(m.drills) ? m.drills : []).map((d) => {
    const on = d.id === m.active, cls = 'pd' + (on ? ' on' : '') + (d.here ? '' : ' off') + (d.done ? ' done' : '');
    const prog = d.done ? '&#10003;' : (d.got | 0) + '/' + (d.need | 0);
    const tile = PRAC_TILE[d.id] ? '<img class="pi" src="tiles/' + PRAC_TILE[d.id] + '.webp" alt="" aria-hidden="true" draggable="false">' : '';   // (J8: its picture, #1301: 64 px; a click on it is a click on the drill)
    const pct = d.done ? 100 : Math.min(100, Math.round((d.got | 0) / Math.max(1, d.need | 0) * 100)), why = d.here ? '' : (m.place === 'range' ? 'Played at the chipping green' : 'Played on the range');
    return '<div class="' + cls + '" data-drill="' + pracEsc(d.id) + '" data-here="' + (d.here ? 1 : 0) + '" title="' + pracEsc(d.here ? (d.done ? 'Done: play it again for practice' : 'Click to play this drill') : why) + '">' + tile +
      '<div class="px"><div class="pt"><b>' + pracEsc(d.name) + '</b><i>' + prog + '</i></div><div class="pb"><u style="width:' + pct + '%"></u></div><div class="pg">' + pracEsc(d.goal) + '</div><div class="pr">' + (d.done ? 'Earned: ' : 'Reward: ') + pracEsc(d.reward) + '</div>' + (why ? '<div class="pw">' + pracEsc(why) + '</div>' : '') + '</div></div>';   // (#1301: a card: its picture, name, progress bar, goal and reward; a drill played at the other place is dimmed and says where)
  }).join('');
  if (pracEl) { pracEl.style.display = 'block'; pracEl.className = 'panel' + (pracFold ? ' fold' : ''); }
  const pst = pracEl ? pracEl.scrollTop : 0;   // (#1301: the list is written again after every ball: it stays where he scrolled it, and the marked drill is brought into view only when it changes)
  if (pracEl) pracEl.innerHTML = '<div class="ph" data-fold="1" title="Fold or open the practice panel"><b>Practice</b><i>' + (m.place === 'range' ? 'The range' : 'Chipping green') + '</i><em>Ball ' + ((m.balls | 0) + 1) + '</em><s>&#9662;</s></div>' + rows +   // (#1344: the header folds it: folded, the header alone is the pill)
    '<div class="pn">' + (m.note ? pracEsc(m.note) : (m.active ? 'Hit away: every ball counts for the marked drill' : 'Pick a drill')) + '</div>' +
    '<div class="pf">Balls ' + (m.balls | 0) + ' &middot; handicap ' + pracEsc(m.hcp) + ' &middot; <b>Esc</b> back</div>';
  if (pracEl) { pracEl.scrollTop = pst; const on = pracEl.querySelector ? pracEl.querySelector('.pd.on') : null; if (on && on.scrollIntoView && (first || pracSeen !== m.active)) on.scrollIntoView({ block: 'nearest' }); pracSeen = m.active; }
  if (m.last && typeof m.last === 'object') pracLastShow(m.last);   // (#1344: the ball just played, once it rests: this message waits behind its playback)
  if (m.paid) say(String(m.paid), 420);
  else if (m.hit) say(String(m.hit), 200);   // (J6b: a junk pile hit)
  else if (first) say('Practice at ' + (m.place === 'range' ? 'the range' : 'the chipping green') + '  -  pick a drill on the left', 300);   // (in place of the hole's own words)
  // J6c: no label, ever: the view draws no text over the range (its distances are its own pictures); a host that still sends flags gets their flag sprites, never their words
  for (const L of pracLab) if (L.parentNode) L.parentNode.removeChild(L);
  pracLab = [];
  const S = hostS(); PRAC.F = (Array.isArray(m.flags) ? m.flags : []).map((f) => ({ x: f.at[0] * S, y: f.at[1] * S, only: !!f.only }));
}
function pracFlags(dlist, dist) {   // the range's flags join the draw list (the pin's own is drawn already)
  if (PRAC && PRAC.place === 'range') { for (let i = dlist.length - 1; i >= 0; i--) if (dlist[i].k === 20) dlist.splice(i, 1); }   // (J6c: no flag of the view's own on the range: its distances are its own pictures)
  if (!PRAC || !PRAC.F || PRAC.pics) return;   // (J6b: the range's own flags stand as the game's pictures: none of the view's own here; J6c: and no label either way)
  for (const f of PRAC.F) { if (f.only || Math.hypot(f.x - hole.pin.x, f.y - hole.pin.y) < 1) continue; dlist.push({ k: K_PFLAG, d: dist(f.x, f.y) + 0.02, x: f.x, y: f.y }); }
}
function pracTick() {   // each step: the labels over the flags follow the camera (J6c: there are none now: pracLab stays empty and this returns at once)
  if (!PRAC || !PRAC.F || !pracLab.length || typeof view === 'undefined' || !view.getBoundingClientRect) return;
  const r = view.getBoundingClientRect();
  for (let k = 0; k < pracLab.length; k++) {
    const f = PRAC.F[k], L = pracLab[k]; if (!f) continue;
    project(f.x, f.y, groundH(f.x, f.y) + 3.2, PJ);
    const ok = PJ.s > 0 && PJ.x > 0 && PJ.x < VW && PJ.y > 0 && PJ.y < VH && !bcam;
    const disp = ok ? 'block' : 'none'; if (L.style.display !== disp) L.style.display = disp;
    if (ok) { L.style.left = (r.left + PJ.x / VW * r.width).toFixed(1) + 'px'; L.style.top = (r.top + PJ.y / VH * r.height).toFixed(1) + 'px'; }
  }
}
function pracKept(m, live) {   // (live: the same ball's turn sent again: the state he has now, not the last stroke's)   // #1308: what the turn m starts from while practising: his last aim, club and picks (null: the host's suggestion: the first ball, a drill clicked, another lie, or a club he no longer has)
  const k = live || pracKeep, fresh = pracNew; pracNew = false;
  if (!PRAC || (fresh && !live) || !k || (!live && (k.lie !== m.lie || k.hole !== m.hole)) || !HP) return null;
  const ci = HP.clubs.findIndex((c) => c.club === k.club); if (ci < 0) return null;
  return { ci, ax: k.ax, ay: k.ay, pick: k.pick, pin: k.pin };
}
function pracSave(c) {   // #1308: the stroke goes: what the next ball starts from (his aim, club and picks as he left them)
  if (!PRAC || !HP || !HP.turn) return;
  pracLastHide();   // (#1344: the last ball's strip goes as the next is struck)
  pracKeep = { club: c.club, ax: aim.x, ay: aim.y, pick: HP.pick ? Object.assign({}, HP.pick, { armed: false }) : null, pin: hostAimPin, lie: HP.turn.lie, hole: HP.turn.hole };
}
function pracFoldSet(on) {   // #1344: the panel folded to its pill (on) or open; kept
  pracFold = !!on; try { localStorage.setItem('cinderlinks.pracFold', pracFold ? '1' : '0'); } catch (err) { /* (not kept) */ }
  if (pracEl) { pracEl.className = 'panel' + (pracFold ? ' fold' : ''); if (pracFold) pracEl.scrollTop = 0; }
  return pracFold;
}
// #1344: the last ball's launch-monitor strip (top centre). The host's numbers as they come (play/launch.ts lastBall); the view only writes them, once a ball
function pracNum(v, unit) { const n = Number(v); if (!Number.isFinite(n)) return '-'; const a = Math.abs(n); return (a >= 10 ? Math.round(a) : Math.round(a * 10) / 10) + (unit ? ' ' + unit : ''); }
function pracRpm(v) { const n = Math.round(Math.abs(Number(v) || 0)); return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' rpm'; }
function pracSide(m, l, r) { const n = Number(m) || 0; return Math.abs(n) < 0.5 ? 'on line' : pracNum(n, 'm') + ' ' + (n < 0 ? l : r); }
function pracLastHtml(L) {
  const cell = (k, v, t) => '<span' + (t ? ' title="' + pracEsc(t) + '"' : '') + '><i>' + k + '</i><b>' + pracEsc(v) + '</b></span>', C = [];
  const name = (typeof CLUB_NAME !== 'undefined' && CLUB_NAME[L.club]) || String(L.club || '');
  const side = (n) => { const v = Number(n) || 0; return Math.abs(v) < 100 ? 'Straight' : (v < 0 ? 'Draw ' : 'Fade ') + pracRpm(v); };
  if (L.kind === 'putt') {
    C.push(cell('Putt', pracNum(L.puttM, 'm')));
    C.push(L.holed ? cell('Result', 'Holed') : cell(Number(L.leaveM) < 0 ? 'Short' : 'Long', pracNum(L.leaveM, 'm')));
    if (!L.holed) C.push(cell('Line', pracSide(L.lineM, 'left', 'right')));
  } else {
    C.push(cell('Carry', pracNum(L.carryM, 'm')));
    if (L.kind === 'chip') { C.push(cell('Roll', (Number(L.rollM) < 0 ? '-' : '') + pracNum(L.rollM, 'm'), Number(L.rollM) < 0 ? 'It spun back' : '')); C.push(cell('To pin', L.holed ? 'Holed' : pracNum(L.pinM, 'm'))); }
    else { C.push(cell('Total', pracNum(L.totalM, 'm'))); C.push(cell('Offline', pracSide(L.offM, 'L', 'R'), 'From the line you aimed')); }
    if (L.ballMph !== undefined) { C.push(cell('Ball speed', pracNum(L.ballMph, 'mph'))); C.push(cell('Club speed', pracNum(L.clubMph, 'mph'), 'The club head at impact')); C.push(cell('Smash', Number(L.smash).toFixed(2), 'Ball speed over club speed')); }
    if (L.kind !== 'chip' && L.launchDeg !== undefined) { C.push(cell('Launch', (Number.isFinite(Number(L.launchDeg)) ? Number(L.launchDeg).toFixed(1) : '-') + '\u00b0')); C.push(cell('Apex', pracNum(L.apexM, 'm'))); }
    if (L.backRpm !== undefined) C.push(cell('Spin', pracRpm(L.backRpm), 'Backspin'));
    if (L.sideRpm !== undefined && L.kind !== 'chip') C.push(cell('Side', side(L.sideRpm), 'Side spin: a draw curves left, a fade right'));
  }
  const tips = (Array.isArray(L.tips) ? L.tips : []).slice(0, 2).map((t) => '<div class="' + (/^(Great|Holed|In the hole|Chipped in|Good pace)/.test(String(t)) ? 'good' : 'tip') + '">' + pracEsc(t) + '</div>').join('');
  return '<div class="lbh"><b>' + (L.kind === 'putt' ? 'Last putt' : 'Last ball') + '</b><em>' + pracEsc(name) + '</em><button type="button" class="lbx" data-x="1" title="Close (until the next ball)" aria-label="Close">&times;</button></div><div class="lbr">' + C.join('') + '</div>' + (tips ? '<div class="lbt">' + tips + '</div>' : '');
}
function pracLastShow(L) {
  if (!pracLastEl && typeof document !== 'undefined' && document.createElement) {
    pracLastEl = document.createElement('div'); pracLastEl.id = 'lastBall'; pracLastEl.className = 'panel';
    pracLastEl.addEventListener('mousedown', (e) => { if (e.stopPropagation) e.stopPropagation(); if (e.preventDefault) e.preventDefault(); });   // (never an aim or a swing)
    pracLastEl.addEventListener('click', (e) => { let el = e.target; while (el && el !== pracLastEl && !(el.dataset && el.dataset.x)) el = el.parentNode; if (el && el !== pracLastEl) pracLastHide(); });
    const host = document.getElementById ? document.getElementById('hud') : null; (host && host.appendChild ? host : document.body).appendChild(pracLastEl);
  }
  pracLastV = L; if (!pracLastEl) return;
  pracLastEl.innerHTML = pracLastHtml(L); pracLastEl.className = 'panel on ' + (L.kind === 'putt' ? 'putt' : L.kind === 'chip' ? 'chip' : 'full');
}
function pracLastHide() { pracLastV = null; if (pracLastEl && pracLastEl.className !== 'panel') pracLastEl.className = 'panel'; }
function pracCard() {   // the card at the top while practising
  return '<div class="course">Practice</div><div class="hole">' + (PRAC.place === 'range' ? 'The range' : 'Chipping green') + '<span>ball ' + ((PRAC.balls | 0) + 1) + '</span></div>';
}
````
