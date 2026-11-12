// T433, T434 (docs/CINDERLINKS-PORT.md): ghost rounds and shared courses (src/game/golf/play/ghost3p.ts, share3p.ts).
// - A course written to a file reads back with its hash; a changed file is refused; the course the model plays from it has the file's lies and holes, and a
//   session on it plays a hole through; its `course` message has the hole.
// - A round played on that course, written as a ghost file and read back, replays stroke for stroke on a course built afresh from the shared file (as on
//   another machine); a ghost of another course is refused; a changed input no longer replays the same; played alongside a new session, the ghost is an
//   actor where his round had him.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameSkills } from '../src/game/golf/play';
import { stateAt } from '../src/game/golf/play';
import type { CourseFile } from '../src/game/golf/play/export3p';
import { fromView, type HostMsg, type TurnMsg, type ViewInput, type ActorsMsg } from '../src/game/golf/play/protocol3p';
import { Play3p } from '../src/game/golf/play/play3p';
import { readShare, shareCourseMsg, shareOf, shareText, shareView, SHARE_FRAME } from '../src/game/golf/play/share3p';
import { GHOST_ID, ghostActor, ghostOf, ghostText, readGhost, replayGhost } from '../src/game/golf/play/ghost3p';

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ polys: [{ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][], inner: [] }] });
/** two par 4s, metres, y north: the first along y = 0 from x -150 to 150, the second back along y = -80 */
function courseFile(): CourseFile {
  return {
    meta: { id: 'shared-test', course: { name: 'Test Links' } },
    boundary: rect(-200, -130, 200, 50),
    features: {
      tee: [rect(-156, -4, -144, 4), rect(144, -84, 156, -76)],
      fairway: [rect(-140, -16, 128, 16), rect(-128, -96, 140, -64)],
      green: [rect(130, -12, 170, 12), rect(-170, -92, -130, -68)],
      bunker: [rect(100, 18, 120, 30)],
      hole: [{ ref: 1, par: 4, line: [[-150, 0], [150, 0]] }, { ref: 2, par: 4, line: [[150, -80], [-150, -80]] }],
      pin: [{ ref: 1, pos: [150, 0] }, { ref: 2, pos: [-150, -80] }],
    },
  } as unknown as CourseFile;
}
const sk: GameSkills = { driving: 0.7, irons: 0.7, short: 0.7, putting: 0.7 };
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
function playAll(p: Play3p): HostMsg[] {
  const all: HostMsg[] = []; let ms = p.start();
  for (let k = 0; k < 60; k++) { all.push(...ms); const t = ms.filter((x): x is TurnMsg => x.t === 'turn').pop(); if (!t) break; ms = p.input(answer(t)); }
  return all;
}

test('a shared course: the file reads back, a changed one is refused, the model plays its lies and holes', async () => {
  const s = shareOf(courseFile(), null, { name: 'Test Links', biome: 'links', type: 'public', seed: 99, by: 'a tester' });
  assert.equal(s.holes, 2); assert.equal(s.par, 8);
  const back = readShare(shareText(s)); assert.ok('share' in back, 'reads back'); if (!('share' in back)) return;
  assert.equal(back.share.hash, s.hash);
  const bad = JSON.parse(shareText(s)); bad.file.features.green[0].polys[0].outer[0][0] += 1;
  assert.ok('why' in readShare(JSON.stringify(bad)), 'a changed course is refused');
  assert.ok('why' in readShare('{"kind":"something else"}'));
  const { view, frame } = await shareView(back.share);
  const at = (X: number, Y: number) => view.lieAt(SHARE_FRAME.cx + X / 2, SHARE_FRAME.cy - Y / 2);   // (metres, y north, into tiles)
  assert.equal(at(-150, 0), 'tee'); assert.equal(at(0, 0), 'fairway'); assert.equal(at(150, 0), 'green'); assert.equal(at(110, 24), 'bunker');
  assert.equal(at(0, 40), 'rough', 'on the land, on no outline'); assert.equal(at(0, 120), 'out', 'off the land');
  assert.equal(view.holes.length, 2); assert.equal(view.holes[1]!.par, 4);
  const p = new Play3p({ view, holes: [0], skills: sk, sex: 'w', seed: 5, frame }), all = playAll(p);
  assert.ok(all.some(m => m.t === 'holeEnd'), 'a hole played through on the shared course');
  const cm = await shareCourseMsg(back.share, view, 1);
  assert.equal(cm.t, 'course'); assert.equal(cm.biome, 'links'); assert.equal(cm.seed, 99);
  assert.ok(Array.isArray((cm.course as { holes?: unknown[] }).holes) && (cm.course as { holes: unknown[] }).holes.length === 2);
});

test('a ghost round replays stroke for stroke on a course made afresh from the file; another course or a changed input does not', async () => {
  const s = shareOf(courseFile(), null, { name: 'Test Links', biome: 'parkland', type: 'private', seed: 3 });
  const a = await shareView(s), p = new Play3p({ view: a.view, holes: [0, 1], skills: sk, sex: 'm', seed: 21, frame: a.frame });
  playAll(p);
  const g = ghostOf({ holes: [0, 1], seed: 21, skills: sk, sex: 'm', name: 'Pat' }, { name: s.name, hash: s.hash }, p.inputs, p.plan);
  assert.ok(g.inputs.length >= 6 && g.strokes.length === 2 && g.strokes.every(k => k > 0));
  // "another machine": the course read from the shared file's text, the ghost from its text
  const s2 = readShare(shareText(s)), b = 'share' in s2 ? await shareView(s2.share) : null; assert.ok(b);
  const read = readGhost(ghostText(g), s.hash); assert.ok('ghost' in read); if (!('ghost' in read)) return;
  const r = replayGhost(read.ghost, b!.view);
  assert.ok(r.same, 'the strokes are the same');
  const mine = p.plan.shots.filter(x => x.golfer === 0), his = r.plan.shots.filter(x => x.golfer === 0);
  assert.equal(his.length, mine.length);
  his.forEach((x, i) => { const y = mine[i]!; assert.ok(Math.hypot(x.to.x - y.to.x, x.to.y - y.to.y) < 1e-9 && x.club === y.club && x.t === y.t, `stroke ${i + 1} is the same`); });
  assert.ok('why' in readGhost(ghostText(g), 'deadbeef'), 'a ghost of another course is refused');
  const bent = JSON.parse(ghostText(g)); bent.inputs[0].aim.y += 30;
  const rb = replayGhost(bent, b!.view);
  assert.ok(rb.plan.shots[0]!.to.y !== his[0]!.to.y, 'a changed input plays another stroke');
});

test('played alongside a new session, the ghost is an actor where his round had him', async () => {
  const s = shareOf(courseFile(), null, { name: 'Test Links', biome: 'parkland', type: 'private', seed: 3 }), a = await shareView(s);
  const p0 = new Play3p({ view: a.view, holes: [0], skills: sk, sex: 'm', seed: 8, frame: a.frame }); playAll(p0);
  const r = replayGhost(ghostOf({ holes: [0], seed: 8, skills: sk, sex: 'm', name: 'Pat' }, { name: s.name, hash: s.hash }, p0.inputs, p0.plan), a.view);
  const p = new Play3p({ view: a.view, holes: [0], skills: sk, sex: 'm', seed: 9, frame: a.frame, more: m => { const x = ghostActor(r, m, a.frame); return x ? [x] : []; } });
  const all = playAll(p), lists = all.filter((m): m is ActorsMsg => m.t === 'actors');
  assert.ok(lists.length > 0, 'actors lists are sent');
  let seen = 0;
  for (const l of lists) {
    const gh = l.actors.find(x => x.id === GHOST_ID); if (!gh) continue; seen++;
    assert.equal(gh.ghost, true); assert.equal(gh.name, 'Pat'); assert.ok(!gh.owner);
    const st = stateAt(r.plan, r.view, l.at)[0]!, q = fromView(gh.at, { x: a.frame.cx, y: a.frame.cy }); assert.ok(Math.hypot(q.x - st.x, q.y - st.y) < 0.01, `where his round had him (${q.x},${q.y} vs ${st.x},${st.y} at ${l.at} ${gh.doing})`);
  }
  assert.ok(seen > 0, 'the ghost is in the lists');
});
