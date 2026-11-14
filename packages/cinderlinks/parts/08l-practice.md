## practice Practice at the range and the chipping green (J6)
When the owner practises (CapitalEmpire's `play/practice3p.ts`, `play/drills.ts`), the host sends `{ v: 1, t: 'practice', place, drills, active, note, paid, flags, hcp, balls }` before the first turn and after each ball and each pick; the view answers a drill picked with `{ v: 1, t: 'pick', drill }`. The balls are the host's, as in a round: each turn tees the next one up on the spot.
R: While practising the golfer is held to his spot (a range mat, the chip stand, the putt, the practice bunker): W, S, Q and E do not walk him, there is no cart (G does nothing and none is drawn), J, B, N, K and L do nothing; A and D still turn him, and the mouse aims. Each ball is teed up where he stands, and he is set beside it.
R: A panel on the left lists the drills: each its name, its goal, its progress (3/5) and its reward, the one being played marked, a done one ticked; a drill played at the other place is greyed with where it is played. A click on a drill played here picks it (the next ball comes from its spot). Under the list: the last ball's line, the balls hit and the handicap. A drill just done is said, with its reward.
R: J6c: the view draws no text over the range, never any label made by code, and on the range no flag of its own: the distances are the range's own pictures (its yardage signs, sent with its things), a built target green's flag is the range's own pin picture, and a junk pile (an old car, tyres, oil drums: J7's) is its picture alone (its name and distance show as the game's hover label on the map). (Before J6c: on the range each target green had its flag, with its distance over it, and each junk pile its name and distance.) A host that still sends `flags` gets their flag sprites, never their words. A ball that lands on or stops by a junk pile is said (Hit the old car!).
R: #1308 (the owner: "the guy resets to a default target on the range after every hit"): the aim is his: after a ball lands the next one starts from the aim, club, curve, flight and spin he left (a ball hit from a spot that moves, as a putt, keeps the target spot and turns to it). Only the first ball and a drill he clicks take the host's suggestion, once.
R: The card at the top says Practice and the place instead of the hole, par and strokes, and the words as it opens say where he practises, not the hole and its par.
R: #1301 (the owner: "make the left menu cards and scrollable"): each drill is a card: its picture at 64 px, name, progress (a bar and 3/5), goal and reward; the marked one gold, a done one ticked, one played at the other place dimmed with where it is played; the list is never taller than the view, scrolls up and down inside it (never sideways), keeps where it was scrolled when it is written again after a ball, and brings the marked drill into view when it changes.
R: J8 (#1261; the owner: "add ALOT more images to the UI. especially on stuff you can do"): each drill in the panel wears its painted tile (CapitalEmpire's src/assets/ui/tiles: Distance control, Shot shaping, Flight, Junk targets, Up and down, Putting, Bunker; build.mjs copies them into tiles/) at the left of its name, goal and progress, as a picture only (alt empty: the name beside it says it); a drill with no tile shows none. The panel is never taller than the picture: past 76% of its height it scrolls up and down (never sideways).
File: game.js
Check: function pracIn(
Check: function pracShow(
Check: function pracLock(
Check: function pracTick(
Check: function pracClear(
Check: function pracKept(
Check: function pracSave(
Check: var PRAC_TILE

````js file=game.js

// ---- practice (J6): the drills panel, the golfer held to his spot, the range's flags. The message waits behind a ball being played back, as a turn does.
var K_PFLAG = 26;     // a range flag's entry in render's list (08d-actors.md K_ACTOR is 25)
var PRAC = null, pracEl = null, pracLab = [], pracKeep = null, pracNew = true, pracPicked = false, pracSeen = null;   // (#1308: pracKeep, the aim, club and picks of the last ball struck; pracNew, the next turn takes the host's suggestion once; pracPicked, a drill was clicked; #1301: pracSeen, the drill marked when the list was last written)   // (var: read by the render and the keys, which may run before this line has)
var PRAC_TILE = { distance: 'drill-distance', shaping: 'drill-shaping', flight: 'drill-flight', junk: 'drill-junk', updown: 'drill-up-down', putting: 'drill-putting', bunker: 'drill-bunker' };   // J8 (#1261): a drill's painted tile (tiles/<name>.webp, copied by build.mjs from CapitalEmpire's src/assets/ui/tiles)
function pracLock() { return !!PRAC; }   // the golfer is held to his spot
function pracClear() {   // a new course: no practice (the panel and the flags' labels go)
  PRAC = null; pracKeep = null; pracNew = true; pracPicked = false; if (pracEl) pracEl.style.display = 'none'; padKeep = null;   // (J6c: the pad pass kept for a still picture goes with it: parts/08c-features.md)
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
    pracEl = document.createElement('div'); pracEl.className = 'panel'; pracEl.id = 'prac';
    Object.assign(pracEl.style, { position: 'absolute', left: '1.4%', top: '20%', width: 'clamp(250px, 24vw, 340px)', boxSizing: 'border-box', padding: '0.55em 0.7em', fontSize: 'clamp(11px, 0.95vw, 14px)', lineHeight: '1.35', pointerEvents: 'auto', zIndex: '5', maxHeight: '64%', overflowY: 'auto', overflowX: 'hidden' });   // (#1301: never taller than the view: it ends above the club tabs, and scrolls up and down inside)
    pracEl.addEventListener('click', (e) => {   // a drill picked: the host answers with the panel and the next ball from its spot
      let el = e.target; while (el && el !== pracEl && !(el.dataset && el.dataset.drill)) el = el.parentNode;
      if (el && el !== pracEl && el.dataset && el.dataset.here === '1' && PRAC && el.dataset.drill !== PRAC.active && !hostBusy() && player.swing < 0 && !charging) { pracPicked = true; hostSend({ t: 'pick', drill: el.dataset.drill }); }
      if (e.preventDefault) e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // (Space must swing, never press the panel)
    });
    pracEl.addEventListener('mousedown', (e) => { if (e.stopPropagation) e.stopPropagation(); });
    if (document.body && document.body.appendChild) document.body.appendChild(pracEl);
  }
  const rows = (Array.isArray(m.drills) ? m.drills : []).map((d) => {
    const on = d.id === m.active, cls = 'pd' + (on ? ' on' : '') + (d.here ? '' : ' off') + (d.done ? ' done' : '');
    const prog = d.done ? '&#10003;' : (d.got | 0) + '/' + (d.need | 0);
    const tile = PRAC_TILE[d.id] ? '<img class="pi" src="tiles/' + PRAC_TILE[d.id] + '.webp" alt="" aria-hidden="true" draggable="false">' : '';   // (J8: its picture, #1301: 64 px; a click on it is a click on the drill)
    const pct = d.done ? 100 : Math.min(100, Math.round((d.got | 0) / Math.max(1, d.need | 0) * 100)), why = d.here ? '' : (m.place === 'range' ? 'Played at the chipping green' : 'Played on the range');
    return '<div class="' + cls + '" data-drill="' + pracEsc(d.id) + '" data-here="' + (d.here ? 1 : 0) + '" title="' + pracEsc(d.here ? (d.done ? 'Done: play it again for practice' : 'Click to play this drill') : why) + '">' + tile +
      '<div class="px"><div class="pt"><b>' + pracEsc(d.name) + '</b><i>' + prog + '</i></div><div class="pb"><u style="width:' + pct + '%"></u></div><div class="pg">' + pracEsc(d.goal) + '</div><div class="pr">' + (d.done ? 'Earned: ' : 'Reward: ') + pracEsc(d.reward) + '</div>' + (why ? '<div class="pw">' + pracEsc(why) + '</div>' : '') + '</div></div>';   // (#1301: a card: its picture, name, progress bar, goal and reward; a drill played at the other place is dimmed and says where)
  }).join('');
  if (pracEl) pracEl.style.display = 'block';
  const pst = pracEl ? pracEl.scrollTop : 0;   // (#1301: the list is written again after every ball: it stays where he scrolled it, and the marked drill is brought into view only when it changes)
  if (pracEl) pracEl.innerHTML = '<div class="ph">PRACTICE &middot; ' + (m.place === 'range' ? 'the range' : 'the chipping green') + '</div>' + rows +
    '<div class="pn">' + (m.note ? pracEsc(m.note) : (m.active ? 'Hit away: every ball counts for the marked drill' : 'Pick a drill')) + '</div>' +
    '<div class="pf">Balls ' + (m.balls | 0) + ' &middot; handicap ' + pracEsc(m.hcp) + ' &middot; <b>Esc</b> back</div>';
  if (pracEl) { pracEl.scrollTop = pst; const on = pracEl.querySelector ? pracEl.querySelector('.pd.on') : null; if (on && on.scrollIntoView && (first || pracSeen !== m.active)) on.scrollIntoView({ block: 'nearest' }); pracSeen = m.active; }
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
function pracKept(m) {   // #1308: what the turn m starts from while practising: his last aim, club and picks (null: the host's suggestion: the first ball, a drill clicked, another lie, or a club he no longer has)
  const k = pracKeep, fresh = pracNew; pracNew = false;
  if (!PRAC || fresh || !k || k.lie !== m.lie || k.hole !== m.hole || !HP) return null;
  const ci = HP.clubs.findIndex((c) => c.club === k.club); if (ci < 0) return null;
  return { ci, ax: k.ax, ay: k.ay, pick: k.pick, pin: k.pin };
}
function pracSave(c) {   // #1308: the stroke goes: what the next ball starts from (his aim, club and picks as he left them)
  if (!PRAC || !HP || !HP.turn) return;
  pracKeep = { club: c.club, ax: aim.x, ay: aim.y, pick: HP.pick ? Object.assign({}, HP.pick, { armed: false }) : null, pin: hostAimPin, lie: HP.turn.lie, hole: HP.turn.hole };
}
function pracCard() {   // the card at the top while practising
  return '<div class="course">Practice</div><div class="hole">' + (PRAC.place === 'range' ? 'The range' : 'Chipping green') + '<span>ball ' + ((PRAC.balls | 0) + 1) + '</span></div>';
}
````
