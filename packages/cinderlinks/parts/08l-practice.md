## practice Practice at the range and the chipping green (J6)
When the owner practises (CapitalEmpire's `play/practice3p.ts`, `play/drills.ts`), the host sends `{ v: 1, t: 'practice', place, drills, active, note, paid, flags, hcp, balls }` before the first turn and after each ball and each pick; the view answers a drill picked with `{ v: 1, t: 'pick', drill }`. The balls are the host's, as in a round: each turn tees the next one up on the spot.
R: While practising the golfer is held to his spot (a range mat, the chip stand, the putt, the practice bunker): W, S, Q and E do not walk him, there is no cart (G does nothing and none is drawn), J, B, N, K and L do nothing; A and D still turn him, and the mouse aims. Each ball is teed up where he stands, and he is set beside it.
R: A panel on the left lists the drills: each its name, its goal, its progress (3/5) and its reward, the one being played marked, a done one ticked; a drill played at the other place is greyed with where it is played. A click on a drill played here picks it (the next ball comes from its spot). Under the list: the last ball's line, the balls hit and the handicap. A drill just done is said, with its reward.
R: J6c: on the range the view adds no flags and no labels of its own: the distances are the range's own pictures (its distance posts and yardage boards, sent with its things), and a built target green's flag is the range's own pin picture. (Before J6c: on the range each target green had its flag, with its distance over it.) Each junk pile (an old car, tyres, oil drums: J7's) carries its name and distance over it (Old car · 140 m), with no flag; a ball that lands on or stops by one is said (Hit the old car!).
R: The card at the top says Practice and the place instead of the hole, par and strokes, and the words as it opens say where he practises, not the hole and its par.
File: game.js
Check: function pracIn(
Check: function pracShow(
Check: function pracLock(
Check: function pracTick(
Check: function pracClear(

````js file=game.js

// ---- practice (J6): the drills panel, the golfer held to his spot, the range's flags. The message waits behind a ball being played back, as a turn does.
var K_PFLAG = 26;     // a range flag's entry in render's list (08d-actors.md K_ACTOR is 25)
var PRAC = null, pracEl = null, pracLab = [];   // (var: read by the render and the keys, which may run before this line has)
function pracLock() { return !!PRAC; }   // the golfer is held to his spot
function pracClear() {   // a new course: no practice (the panel and the flags' labels go)
  PRAC = null; if (pracEl) pracEl.style.display = 'none';
  for (const L of pracLab) if (L.parentNode) L.parentNode.removeChild(L);
  pracLab = [];
}
function pracIn(m) {   // the host's 'practice': now, or once the ball in the air has come to rest (hostRest takes it from the queue)
  if (HP && (HP.play || HP.q.length)) { HP.q.push(m); return; }
  pracShow(m);
}
function pracEsc(v) { return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function pracShow(m) {   // the panel, the flags, and a drill done said
  const first = !PRAC; PRAC = m;
  if (!pracEl && typeof document !== 'undefined' && document.createElement) {
    pracEl = document.createElement('div'); pracEl.className = 'panel'; pracEl.id = 'prac';
    Object.assign(pracEl.style, { position: 'absolute', left: '1.4%', top: '20%', width: 'clamp(220px, 21vw, 330px)', padding: '0.55em 0.7em', fontSize: 'clamp(11px, 0.95vw, 14px)', lineHeight: '1.35', pointerEvents: 'auto', zIndex: '5' });
    pracEl.addEventListener('click', (e) => {   // a drill picked: the host answers with the panel and the next ball from its spot
      let el = e.target; while (el && el !== pracEl && !(el.dataset && el.dataset.drill)) el = el.parentNode;
      if (el && el !== pracEl && el.dataset && el.dataset.here === '1' && PRAC && el.dataset.drill !== PRAC.active && !hostBusy() && player.swing < 0 && !charging) hostSend({ t: 'pick', drill: el.dataset.drill });
      if (e.preventDefault) e.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur();   // (Space must swing, never press the panel)
    });
    pracEl.addEventListener('mousedown', (e) => { if (e.stopPropagation) e.stopPropagation(); });
    if (document.body && document.body.appendChild) document.body.appendChild(pracEl);
  }
  const rows = (Array.isArray(m.drills) ? m.drills : []).map((d) => {
    const on = d.id === m.active, cls = 'pd' + (on ? ' on' : '') + (d.here ? '' : ' off') + (d.done ? ' done' : '');
    const prog = d.done ? '&#10003;' : (d.got | 0) + '/' + (d.need | 0);
    return '<div class="' + cls + '" data-drill="' + pracEsc(d.id) + '" data-here="' + (d.here ? 1 : 0) + '" title="' + pracEsc(d.here ? (d.done ? 'Done: play it again for practice' : 'Click to play this drill') : (m.place === 'range' ? 'Played at the chipping green' : 'Played on the range')) + '">' +
      '<div class="pt"><b>' + pracEsc(d.name) + '</b><i>' + prog + '</i></div><div class="pg">' + pracEsc(d.goal) + '</div><div class="pr">' + (d.done ? 'Earned: ' : 'Reward: ') + pracEsc(d.reward) + '</div></div>';
  }).join('');
  if (pracEl) pracEl.style.display = 'block';
  if (pracEl) pracEl.innerHTML = '<div class="ph">PRACTICE &middot; ' + (m.place === 'range' ? 'the range' : 'the chipping green') + '</div>' + rows +
    '<div class="pn">' + (m.note ? pracEsc(m.note) : (m.active ? 'Hit away: every ball counts for the marked drill' : 'Pick a drill')) + '</div>' +
    '<div class="pf">Balls ' + (m.balls | 0) + ' &middot; handicap ' + pracEsc(m.hcp) + ' &middot; <b>Esc</b> back</div>';
  if (m.paid) say(String(m.paid), 420);
  else if (m.hit) say(String(m.hit), 200);   // (J6b: a junk pile hit)
  else if (first) say('Practice at ' + (m.place === 'range' ? 'the range' : 'the chipping green') + '  -  pick a drill on the left', 300);   // (in place of the hole's own words)
  // the range's flags: a label over each green
  for (const L of pracLab) if (L.parentNode) L.parentNode.removeChild(L);
  pracLab = [];
  const S = hostS(); PRAC.F = (Array.isArray(m.flags) ? m.flags : []).map((f) => ({ x: f.at[0] * S, y: f.at[1] * S, label: String(f.label || ''), only: !!f.only }));
  if (typeof document !== 'undefined' && document.createElement && document.body) for (const f of PRAC.F) {
    const L = document.createElement('div'); L.className = 'pflag'; L.textContent = f.label;
    Object.assign(L.style, { position: 'absolute', transform: 'translate(-50%, -100%)', pointerEvents: 'none', display: 'none' });
    document.body.appendChild(L); pracLab.push(L);
  }
}
function pracFlags(dlist, dist) {   // the range's flags join the draw list (the pin's own is drawn already)
  if (PRAC && PRAC.place === 'range') { for (let i = dlist.length - 1; i >= 0; i--) if (dlist[i].k === 20) dlist.splice(i, 1); }   // (J6c: no flag of the view's own on the range: its distances are its own pictures)
  if (!PRAC || !PRAC.F || PRAC.pics) return;   // (J6b: the range's own flags stand as the game's pictures: only their labels here)
  for (const f of PRAC.F) { if (f.only || Math.hypot(f.x - hole.pin.x, f.y - hole.pin.y) < 1) continue; dlist.push({ k: K_PFLAG, d: dist(f.x, f.y) + 0.02, x: f.x, y: f.y }); }
}
function pracTick() {   // each step: the labels over the flags follow the camera
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
function pracCard() {   // the card at the top while practising
  return '<div class="course">Practice</div><div class="hole">' + (PRAC.place === 'range' ? 'The range' : 'Chipping green') + '<span>ball ' + ((PRAC.balls | 0) + 1) + '</span></div>';
}
````
