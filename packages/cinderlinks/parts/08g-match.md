## match A money match (T428)
When the owner plays a money match in the view, the host (CapitalEmpire's `play/match3p.ts`) sends the match (`{ v: 1, t: 'match', why, name, hcp, stake, holes, res, score, hole, you, opp }`) as it begins, as each hole is decided and as it ends; the strokes, turns and holes' ends come as in any played round.
R: A card shows the match: who against (and their handicap), the stake, the holes, and the state ("2 UP thru 5", "All square", "Dormie"), one mark a hole (won, halved, lost).
R: As it begins it is said: the stake, the holes, and that a match has no mulligans and no gimmies. A hole's result is said when that hole's strokes have played back, not before; the match's end says who won and what the stake does (the manager game settles it: the money moves there).
File: game.js
Check: function matchIn(
Check: function matchTick(

````js file=game.js

// ---- a money match (T428): the card and the words. A message waits until the strokes that came before it have played back (matchTick, each frame).
let matchEl = null, matchNow = null;
const matchQ = [];                    // { m, after: the last playback message before it (null: none) }
function matchIn(m) {   // the host's 'match': shown now, or once the strokes before it have played back
  const after = typeof HP !== 'undefined' && HP ? (HP.q.length ? HP.q[HP.q.length - 1] : HP.play ? HP.play.m : null) : null;
  if (after) matchQ.push({ m, after }); else matchShow(m);
}
function matchTick() {   // each frame: a held message is shown once its stroke has been played (it is neither queued nor playing any more)
  while (matchQ.length) {
    const q = matchQ[0], a = q.after, busy = HP && ((HP.play && HP.play.m === a) || HP.q.includes(a));
    if (busy) return;
    matchQ.shift(); matchShow(q.m);
  }
}
function matchFirst(name) { return String(name || '').split(' ')[0] || 'They'; }
function matchShow(m) {   // the card, and the words for why it was sent
  matchNow = m;
  if (!matchEl && typeof document !== 'undefined') {
    matchEl = document.createElement('div'); matchEl.className = 'panel';
    Object.assign(matchEl.style, { position: 'absolute', left: '1.4%', top: '12%', padding: '0.5em 0.8em', fontSize: 'clamp(11px, 1.016vw, 15px)', lineHeight: '1.45', pointerEvents: 'none', whiteSpace: 'nowrap' });
    if (document.body && document.body.appendChild) document.body.appendChild(matchEl);
  }
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const res = Array.isArray(m.res) ? m.res : [], marks = [];
  for (let k = 0; k < (m.holes | 0); k++) { const w = res[k]; marks.push(w === 1 ? '<span style="color:#7fd67f">&#9679;</span>' : w === -1 ? '<span style="color:#e2685c">&#9679;</span>' : w === 0 ? '<span style="color:#d8d0b0">&#9675;</span>' : '<span style="color:#5a6a60">&middot;</span>'); }
  const sc = m.score || {}, f = matchFirst(m.name);
  if (matchEl) matchEl.innerHTML = '<b>MATCH</b> v ' + esc(m.name) + ' (' + esc(m.hcp) + ') &middot; $' + esc((+m.stake || 0).toLocaleString('en-US')) + '<br>' + esc(sc.text || '') + '<br>' + marks.join(' ');
  if (m.why === 'start') say('Match v ' + f + ': $' + (+m.stake || 0) + ', ' + (m.holes | 0) + ' holes  -  no mulligans, no gimmies', 330);
  else if (m.why === 'hole') {
    const w = res[res.length - 1], n = m.hole | 0, th = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    say((w === 1 ? 'You win the ' + n + th : w === -1 ? f + ' wins the ' + n + th : 'The ' + n + th + ' is halved') + '  -  ' + (sc.text || ''), 300);
  } else if (m.why === 'end') {
    const r = sc.result, st = '$' + (+m.stake || 0);
    say((r === 'w' ? 'You win ' + (sc.short || '') + '  -  +' + st : r === 'l' ? f + ' wins ' + (sc.short || '') + '  -  -' + st : 'The match is halved  -  the stake stays') + '  -  Esc goes back to the course', 100000);
  }
}
````
