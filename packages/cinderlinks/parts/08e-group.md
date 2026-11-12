## group His group and the field in a played round (T425 to T427)
When the host plays a round with company (CapitalEmpire's `play/play3p.ts` with `company`), it sends, in time order, who is where just before each stroke of the owner's group (`actors`), that stroke (`shot`), and before each of his turns who is where, the leaderboard (`board`) and the turn.
R: The others in his group play their strokes in the model's order (the farthest from the pin first, the honour on the tee). Each is played back with the same playback as his own (`hostShot`), from the striker's ball: the striker swings or putts as it starts, a full shot has its short ball camera, and the camera cuts back to the owner once the ball lies still. The owner's ball, his strokes and his score are kept and put back.
R: People move by the round's own clock: while a stroke plays back, everyone walks from where the list before it has them toward where the next list has them; between his turns they stand as the last list has them.
R: The others' balls lie where they came to rest; on the green a marker stands in for a ball until its golfer plays it. The flag is tended for a long putt (the tender stands at the pin).
R: The leaderboard card shows the leaders and the owner's row; when his group waits on the group ahead it is said. Racing a ghost (T436) it shows you and him: in own kit your nets after handicaps, in level kit the strokes as played.
R: A ghost's strokes (T433) play back beside the play when their minute comes: his ball flies and rolls see-through, his figure swings with it; the owner's ball and camera are never taken.
R: In host mode the help (H) also says what a round inside the game is: the course decides the shots, your kit counts, the land's fine detail is grown, and the ghost, share and kit buttons (T440).
File: game.js
Check: function groupMsg(
Check: function groupShotStart(
Check: function groupShotEnd(
Check: function groupAt(

````js file=game.js

// ---- his group and the field in a played round (T425 to T427). groupMsg takes the host's 'actors' and 'board' (parts/09-hud.md hostMessage routes them
// here); in a played round (HP: host play) each actors list is kept by its game minute, and the people are placed by the play's minute (groupAt).
const grpSnaps = [];                  // the actors lists of the round, by minute: { at, m: Map id -> actor }
const GRP_SNAPS = 48;
let grpPlay = null;                   // another golfer's stroke being played back: { m, keep: the owner's ball and score }
let grpCourse = null, grpBoardEl = null, grpWait = '', grpA = null, grpB = null, grpU = 0, grpF = -1;
const grpBalls = new Map();           // golfer id -> his ball as drawn: { role: 'ball', x, y, mark, dl }
function groupMsg(m) {   // the host's 'actors' or 'board'
  if (m.t === 'board') { groupBoard(m); return; }
  if (m.play && Number.isFinite(+m.at) && Array.isArray(m.actors)) {   // a played round's list: kept by its minute (a list of the same minute replaces it)
    if (grpCourse !== course) { grpCourse = course; grpSnaps.length = 0; grpOwner = -1; }   // (a course handed over again: a new round)
    const S = course && course.S > 0 ? course.S : 1, map = new Map();
    for (const a of m.actors) if (a && Array.isArray(a.at)) map.set(a.id, { x: a.at[0] * S, y: a.at[1] * S, th: Number.isFinite(a.heading) ? a.heading * Math.PI / 180 : NaN, doing: a.role === 'cart' ? 'cart' : a.doing || 'stand',
      ph: clamp(+a.phase || 0, 0, 1), ball: Array.isArray(a.ball) ? [a.ball[0] * S, a.ball[1] * S] : null, hole: a.hole | 0, riders: a.riders || [], owner: !!a.owner, role: a.role });
    let k = grpSnaps.findIndex((q) => q.at >= +m.at);
    if (k >= 0 && grpSnaps[k].at === +m.at) grpSnaps[k] = { at: +m.at, m: map }; else { if (k < 0) k = grpSnaps.length; grpSnaps.splice(k, 0, { at: +m.at, m: map }); }
    while (grpSnaps.length > GRP_SNAPS) grpSnaps.shift();
    // the people's looks come with them: kept, the records added (or dropped once no list has them), never moved from here
    const known = new Set(); for (const q of grpSnaps) for (const id of q.m.keys()) known.add(id);
    actorsKeep(m, known); galleriesIn(m, S);   // (T429: the galleries in the list: 08f-gallery.md)
    return;
  }
  actorsIn(m);
}
function actorsKeep(m, known) {   // the records of a played round's people: looks, build and role from the newest list; a record no kept list has is dropped
  const S = course && course.S > 0 ? course.S : 1;
  for (const a of m.actors) {
    if (!a) continue; if (a.owner) { grpOwner = a.id; continue; } if (a.role === 'gallery' || !Array.isArray(a.at)) continue;
    let r = actors.get(a.id);
    if (!r) { const x = a.at[0] * S, y = a.at[1] * S; r = { id: a.id, role: a.role, x0: x, y0: y, x1: x, y1: y, th0: 0, th1: 0, t0: 0, dur: 0, ph0: 0, ph1: 0, doing: 'stand', cx: x, cy: y, cth: 0, cph: 0, walk: 0, px: x, py: y,
      sf: 0, sr: 0, zc: groundH(x, y), L: null, build: 1, riders: [], S: null, K: GK, dl: { k: K_ACTOR, d: 0, a: null } }; r.dl.a = r; actors.set(a.id, r); }
    r.role = a.role; r.ghost = !!a.ghost; if (a.dress) { r.L = lookOf(a.dress); r.build = a.dress.build >= 0.8 && a.dress.build <= 1.2 ? +a.dress.build : 1; }
  }
  for (const id of actors.keys()) if (!known.has(id)) actors.delete(id);
}
function groupMinute() {   // the play's game minute: a stroke being played back runs from its own minute toward the next one held; else the turn's
  if (!grpSnaps.length) return NaN;
  if (!HP) return grpSnaps[grpSnaps.length - 1].at;
  const P = HP.play;
  if (P && Number.isFinite(+P.m.at)) {
    let nx = NaN; for (const q of HP.q) if (Number.isFinite(+q.at) && +q.at > +P.m.at) { nx = +q.at; break; }
    if (!Number.isFinite(nx)) { const last = grpSnaps[grpSnaps.length - 1].at; nx = last > +P.m.at ? last : +P.m.at; }
    const tot = P.RT && P.RT.length ? P.RT[P.RT.length - 1] : P.tL || 1;
    return +P.m.at + (nx - +P.m.at) * clamp(P.t / Math.max(0.1, tot), 0, 1);
  }
  if (HP.turn && Number.isFinite(+HP.turn.at)) return Math.min(+HP.turn.at, grpSnaps[grpSnaps.length - 1].at);
  return grpSnaps[grpSnaps.length - 1].at;
}
function groupFrame() {   // once a frame: the two lists either side of the play's minute, and how far between them it is
  if (grpF === frame) return; grpF = frame; grpA = grpB = null; grpU = 0;
  const M = groupMinute(); if (!Number.isFinite(M)) return;
  let k = 0; while (k + 1 < grpSnaps.length && grpSnaps[k + 1].at <= M) k++;
  grpA = grpSnaps[k]; grpB = grpSnaps[k + 1] || null;
  if (M < grpA.at) { grpB = null; } else if (grpB) grpU = clamp((M - grpA.at) / Math.max(1e-6, grpB.at - grpA.at), 0, 1);
}
const GRP_SWING = 1100, GRP_PUTT = 900, GRP_HOLD = 1400;   // ms: a full swing (address to finish), a putt, the finish held
function groupAt(r, now) {   // a played round's person: placed from the lists either side of the play's minute (false: not a played round, the T424 way)
  if (!grpSnaps.length || grpCourse !== course) return false;
  groupFrame(); r.hidden = false;
  const a = grpA && grpA.m.get(r.id), b = grpB && grpB.m.get(r.id);
  if (!a && !b) { r.hidden = true; return true; }
  const p = a || b, q = b || a, u = a && b ? grpU : 0;
  r.cx = p.x + (q.x - p.x) * u; r.cy = p.y + (q.y - p.y) * u;
  const mv = Math.hypot(q.x - p.x, q.y - p.y);
  if (r.role !== 'cart' && mv > 0.3 && u > 0 && u < 1) { r.doing = 'walk'; r.cth = Math.atan2(q.y - p.y, q.x - p.x); r.cph = 0; }   // (on his way between the two)
  else {
    const s = u < 0.5 ? p : q, t0 = Number.isFinite(p.th) ? p.th : r.cth, t1 = Number.isFinite(q.th) ? q.th : t0;
    r.doing = s.doing; r.cth = t0 + wrapA(t1 - t0) * u; r.cph = s.doing === 'address' ? Math.min(0.5, s.ph) : s.ph;   // (his backswing is played with his stroke: groupShotStart)
    if (r.role === 'cart' && mv > 0.3) r.cth = Math.atan2(q.y - p.y, q.x - p.x);
  }
  r.riders = q.riders;
  if (r.sw0 > 0) {   // his stroke, played as it starts: the address and the swing (or the putt), then the finish held
    const e = now - r.sw0, D = r.swPutt ? GRP_PUTT : GRP_SWING, w = e / D;
    if (e > D + GRP_HOLD) r.sw0 = 0;
    else { r.cth = r.swTh; if (r.swPutt) { r.doing = 'putt'; r.cph = 0.4 + 0.6 * Math.min(1, w); } else if (w < 0.3) { r.doing = 'address'; r.cph = 0.55 + 0.45 * w / 0.3; } else { r.doing = 'swing'; r.cph = Math.min(1, (w - 0.3) / 0.7); } }
  }
  return true;
}
function groupOther(m) {   // a stroke that is not the owner's (by the owner's id in the lists; else by the turn in hand)
  return grpOwner >= 0 ? m.golfer !== grpOwner : !!(HP && HP.turn && m.golfer !== HP.turn.golfer);
}
function groupPlays(m) {   // whether another's stroke is played back here: one of his group's, on the hole on screen (the host sends only those)
  if (m && m.ghost) { ghostShotIn(m); return false; }   // (T433: a ghost's stroke has its own playback, beside the play: ghostShotIn)
  return !!m && groupOther(m) && (m.hole | 0) === holeN;
}
// ---- T433: a ghost's strokes. Each is held until the play's minute reaches it, then its ball flies and rolls along the host's samples (hostAt, the
// playback's own reader) in real time, drawn see-through; the owner's ball, camera and turn are never touched. Then the ghost's ball lies at its rest
const grpGhost = [];
function ghostShotIn(m) {
  const S = hostS(), F = Array.isArray(m.flight) ? m.flight : [], R = Array.isArray(m.roll) ? m.roll : [];
  const fT = Array.isArray(m.flightT) && m.flightT.length === F.length ? m.flightT : F.map((_, k) => k / 30), tL = F.length ? fT[F.length - 1] : 0;
  const rT = Array.isArray(m.rollT) && m.rollT.length === R.length ? m.rollT : R.map((_, k) => tL + (k + 1) * 0.12), start = F.length ? [F[F.length - 1][0], F[F.length - 1][1], 0] : [m.from[0], m.from[1], 0];
  grpGhost.push({ m, S, F, fT, tL, RT: [tL].concat(rT), RQ: [start].concat(R.map((p, k) => [p[0], p[1], Array.isArray(m.rollZ) && m.rollZ.length === R.length ? m.rollZ[k] : 0])), t0: 0,
    b: { role: 'ball', x: 0, y: 0, mark: false, ghost: true, dl: { k: K_ACTOR, d: 0, a: null } } });
  const g = grpGhost[grpGhost.length - 1]; g.b.dl.a = g.b;
  while (grpGhost.length > 24) grpGhost.shift();
}
const GQ = { x: 0, y: 0, h: 0 };
function ghostBalls(now, tanH) {   // each frame: the ghost's strokes whose minute has come, their balls where the samples have them; returns the golfer whose ball flies
  let flying = -1; const M = groupMinute();
  for (let i = 0; i < grpGhost.length; i++) {
    const g = grpGhost[i]; if (!g.t0) { if (!(M >= +g.m.at)) continue; g.t0 = now; const r = actors.get(g.m.golfer); if (r) { r.sw0 = now; r.swPutt = g.m.club === 'putter'; r.swTh = Math.atan2(g.m.rest[1] - g.m.from[1], g.m.rest[0] - g.m.from[0]); } }
    const t = (now - g.t0) / 1000, end = g.RT[g.RT.length - 1];
    if (t >= end) { grpGhost.splice(i--, 1); continue; }
    if (g.F.length && t < g.tL) hostAt(g.fT, g.F, t, GQ); else hostAt(g.RT, g.RQ, t, GQ);
    const b = g.b, S = g.S; b.x = GQ.x * S; b.y = GQ.y * S; b.z = GQ.h * S; flying = g.m.golfer;
    const ex = b.x - camX, ey = b.y - camY, d = ex * FX + ey * FY;
    if (d > 1 && d < 220 && Math.abs(ex * RX + ey * RY) <= tanH * d + 4) { b.dl.d = d; dlist.push(b.dl); }
  }
  return flying;
}
function groupShotStart(m) {   // hook: hostShot is about to play stroke m back. Another's: the owner's ball and score are put aside, the ball set at the striker's
  grpPlay = null;
  if (!groupOther(m)) return;
  const S = hostS();
  grpPlay = { m, keep: { x: ball.x, y: ball.y, z: ball.z, lx: ball.lx, ly: ball.ly, state: ball.state, strokes, total, autoClub } };
  ball.x = ball.lx = m.from[0] * S; ball.y = ball.ly = m.from[1] * S; ball.z = groundH(ball.x, ball.y); ball.state = 0;
  const r = actors.get(m.golfer); if (r) { r.sw0 = performance.now(); r.swPutt = m.club === 'putter'; r.swTh = Math.atan2(m.rest[1] - m.from[1], m.rest[0] - m.from[0]); }
}
function groupShotEnd(m) {   // hook: hostRest has laid stroke m's ball at its rest. Another's: the owner's ball and score come back, and the camera cuts back to him
  const g = grpPlay; if (!g || g.m !== m) return; grpPlay = null;
  const k = g.keep; ball.x = k.x; ball.y = k.y; ball.z = k.z; ball.lx = k.lx; ball.ly = k.ly; ball.state = k.state; ball.vx = ball.vy = ball.vz = 0;
  strokes = k.strokes; total = k.total; autoClub = k.autoClub;
  if (bcam) { bcam = 0; camYaw = bcamYaw; camD = bcamD; }
}
function groupList(t, tanH) {   // each frame (from actorsList): the others' balls on the hole on screen join the list; a ball on the green is a marker until it is played
  if (!grpSnaps.length || grpCourse !== course) { if (grpBalls.size) grpBalls.clear(); return; }
  groupFrame(); const s = grpB && grpU >= 0.5 ? grpB : grpA; if (!s) return;
  const gf = grpGhost.length ? ghostBalls(t, tanH) : -1, seen = new Set(), flying = grpPlay ? grpPlay.m.golfer : -1;
  for (const [id, a] of s.m) {
    if (a.role !== 'golfer' || a.owner || !a.ball || id === flying || id === gf || (a.hole && a.hole !== holeN)) continue;
    let b = grpBalls.get(id); if (!b) { b = { role: 'ball', x: 0, y: 0, mark: false, dl: { k: K_ACTOR, d: 0, a: null } }; b.dl.a = b; grpBalls.set(id, b); }
    b.x = a.ball[0]; b.y = a.ball[1]; b.z = 0; b.ghost = !!(actors.get(id) && actors.get(id).ghost); b.mark = !b.ghost && matAt(b.x, b.y) === M_GREEN && a.doing !== 'putt'; seen.add(id);
    const ex = b.x - camX, ey = b.y - camY, d = ex * FX + ey * FY;
    if (d < 1 || d > 160 || Math.abs(ex * RX + ey * RY) > tanH * d + 4) continue;
    b.dl.d = d; dlist.push(b.dl);
  }
  if (grpPlay) {   // the owner's own ball, put aside while another's stroke plays
    let b = grpBalls.get(-1); if (!b) { b = { role: 'ball', x: 0, y: 0, mark: false, dl: { k: K_ACTOR, d: 0, a: null } }; b.dl.a = b; grpBalls.set(-1, b); }
    const k = grpPlay.keep; b.x = k.x; b.y = k.y; b.mark = false; seen.add(-1);
    if (k.state !== 3) { const d = (b.x - camX) * FX + (b.y - camY) * FY; if (d > 1 && d < 160) { b.dl.d = d; dlist.push(b.dl); } }
  }
  for (const id of grpBalls.keys()) if (!seen.has(id)) grpBalls.delete(id);
}
function drawGroupBall(b, d) {   // a ball at rest or in the air (as the render draws his), or a marker on the green; a ghost's see-through
  project(b.x, b.y, groundH(b.x, b.y) + (b.z || 0), PJ); if (PJ.s === 0) return;
  if (b.mark) { blit(markSpr, PJ.x, PJ.y, PJ.s * 0.7, PJ.d * 100, 0, 0, false, 0); return; }
  if (b.ghost && ((PJ.x + PJ.y + (frame >> 2)) & 1)) return;   // (a ghost's ball: there one frame in two, flickering like a ghost)
  if (PJ.s > 0.55) blit(ballSpr, PJ.x, PJ.y, PJ.s, PJ.d * 100 - 40, 0, 0, false, 0);
  else { const w = lit(tone(SHOER, 0.95)); plotZ(PJ.x, PJ.y, PJ.d - 1, w); plotZ(PJ.x + 1, PJ.y, PJ.d - 1, w); }
}
function groupBoard(m) {   // the leaderboard card (the leaders, his row lit) and his group's wait, said once when it begins
  if (!grpBoardEl && typeof document !== 'undefined') {
    grpBoardEl = document.createElement('div'); grpBoardEl.className = 'panel';
    Object.assign(grpBoardEl.style, { position: 'absolute', left: '1.4%', top: '30%', padding: '5px 8px', fontSize: '11px', lineHeight: '1.35', pointerEvents: 'none', whiteSpace: 'nowrap' });
    if (document.body && document.body.appendChild) document.body.appendChild(grpBoardEl);
  }
  const rows = Array.isArray(m.rows) ? m.rows : [], esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fair = rows.some((r) => r.hcp !== undefined), level = rows.some((r) => r.hcp === 'level');   // (T436: you and a ghost, own kit scored net, level kit as played)
  const head = !fair ? 'LEADERS' : level ? 'LEVEL KIT' : 'OWN KIT &middot; NET';
  if (grpBoardEl) grpBoardEl.innerHTML = '<b>' + head + '</b><br>' + rows.map((r) => (r.owner ? '<span style="color:#f2c94c">' : '<span>') + esc(r.pos) + '&nbsp;&nbsp;' + esc(r.name) + '&nbsp;&nbsp;' + esc(r.toPar)
    + (fair && !level ? '&nbsp;&nbsp;net ' + esc(r.net) + ' (' + esc(r.hcp) + ')' : '') + '&nbsp;&nbsp;thru ' + esc(r.thru) + '</span>').join('<br>');
  const w = typeof m.wait === 'string' ? m.wait : '';
  if (w && w !== grpWait) say('Your group is ' + w, 300);
  grpWait = w; groupBoard.last = m;
}
// ---- T440: the in-game help (H) in host mode: what the round inside CapitalEmpire is (added once to the help panel the page already has)
let hostHelpDone = false;
const HOST_HELP = [['', ''], ['IN YOUR GAME', ''], ['the shots', 'the course decides each one: your skills, clubs, cards and unlocks count'], ['the land', 'its fine detail (grass, trees, rocks) is grown here, not copied'],
  ['1-9, wheel', 'your own clubs, with their real carries'], ['Esc', 'back to the course (a round under way is kept)'], ['Save ghost', 'your round as a file a friend can race'],
  ['Ghost...', 'race a saved round: he plays beside you, see-through'], ['Share course', 'this course as a file; Play a shared course... opens one'], ['Kit', 'own kit (scored net of handicaps) or level kit (everyone the same)']];
function hostHelp() {   // (from actorsList, each frame until done: the help panel is the page's, made after the parts load)
  hostHelpDone = true;
  if (typeof helpEl === 'undefined' || !helpEl) return;
  const NL = String.fromCharCode(10);   // (a new line: the help panel keeps its lines)
  helpEl.innerHTML += NL + HOST_HELP.map((h) => '<b>' + h[0] + '</b>' + h[1]).join(NL);
}
````
