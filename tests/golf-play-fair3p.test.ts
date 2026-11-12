// T433 (the ghost's balls) and T436 (fair play: own kit and level kit) (src/game/golf/play/fair3p.ts, ghost3p.ts ghostShots, Play3p moreShots and boardRows).
// - The level kit: the middle golfer, the standard bag, no cards; the same for everyone whatever his own kit.
// - The board for you and a ghost: own kit ordered by net (strokes less the handicap's share of the holes played), level kit by strokes, ties shared.
// - Racing a ghost in a session: every one of his strokes is sent once, marked a ghost's, in time order and no later than the batch it falls in, and the
//   board sent is the two of you, with handicaps and nets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameSkills, RoundPlan } from '../src/game/golf/play';
import type { CourseFile } from '../src/game/golf/play/export3p';
import type { BoardMsg, HostMsg, ShotMsg, TurnMsg, ViewInput } from '../src/game/golf/play/protocol3p';
import { Play3p } from '../src/game/golf/play/play3p';
import { shareOf, shareView } from '../src/game/golf/play/share3p';
import { GHOST_ID, ghostActor, ghostOf, ghostShots, replayGhost } from '../src/game/golf/play/ghost3p';
import { fairRows, kitFor, levelHcp, levelSkills, shotsGiven } from '../src/game/golf/play/fair3p';
import { clubsOf, DEFAULT_BAG } from '../src/game/golf/play/bag';

const rect = (x0: number, y0: number, x1: number, y1: number) => ({ polys: [{ outer: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as [number, number][], inner: [] }] });
const file = (): CourseFile => ({
  meta: { id: 'fair-test', course: { name: 'Fair Links' } }, boundary: rect(-200, -130, 200, 50),
  features: { tee: [rect(-156, -4, -144, 4)], fairway: [rect(-140, -16, 128, 16)], green: [rect(130, -12, 170, 12)], hole: [{ ref: 1, par: 4, line: [[-150, 0], [150, 0]] }], pin: [{ ref: 1, pos: [150, 0] }] },
} as unknown as CourseFile);
const strong: GameSkills = { driving: 0.9, irons: 0.9, short: 0.9, putting: 0.9 }, weak: GameSkills = { driving: 0.3, irons: 0.3, short: 0.3, putting: 0.3 };
const answer = (t: TurnMsg): ViewInput => ({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power });
function playAll(p: Play3p): HostMsg[] {
  const all: HostMsg[] = []; let ms = p.start();
  for (let k = 0; k < 60; k++) { all.push(...ms); const t = ms.filter((x): x is TurnMsg => x.t === 'turn').pop(); if (!t) break; ms = p.input(answer(t)); }
  return all;
}

test('the level kit is the same for everyone: the middle golfer, the standard bag, no cards', () => {
  const a = kitFor('level', strong) as GameSkills, b = kitFor('level', weak) as GameSkills;
  assert.deepEqual(a, b); assert.deepEqual(a, levelSkills());
  assert.deepEqual(a.clubs, clubsOf(DEFAULT_BAG)); assert.deepEqual(a.mech, []); assert.ok(!a.mods || !a.mods.length);
  assert.equal(kitFor('own', strong), strong, 'own kit: his own');
  assert.ok(levelHcp() > 0 && levelHcp() < 36);
});

test('the board for you and a ghost: own kit by net, level kit by strokes', async () => {
  const sh = shareOf(file(), null, { name: 'Fair Links', biome: 'parkland', type: 'private', seed: 1 }), { view, frame } = await shareView(sh);
  const run = (sk: GameSkills, seed: number): RoundPlan => { const p = new Play3p({ view, holes: [0], skills: sk, sex: 'm', seed, frame }); playAll(p); return p.plan; };
  const a = run(strong, 4), b = run(weak, 4), end = Math.max(...a.done, ...b.done) + 1;
  const own = fairRows([{ name: 'You', hcp: 2, owner: true, plan: a, view: { ...view, holes: [view.holes[0]!] }, id: 0 }, { name: 'Pat', hcp: 30, owner: false, plan: b, view: { ...view, holes: [view.holes[0]!] }, id: 0 }], end, 'own');
  assert.equal(own.length, 2); assert.ok(own.every(r => r.net && r.hcp && r.thru === '1'));
  const you = own.find(r => r.owner)!, pat = own.find(r => !r.owner)!;
  assert.equal(you.hcp, '2.0'); assert.equal(pat.hcp, '30.0');
  const n = (t: string) => t === 'E' ? 0 : +t.replace('−', '-');
  assert.equal(n(pat.net!), n(pat.toPar) - shotsGiven(30, 1), 'his net is his strokes less his handicap\'s share of one hole');
  assert.ok(n(own[0]!.net!) <= n(own[1]!.net!), 'ordered by net');
  const lv = fairRows([{ name: 'You', hcp: 2, owner: true, plan: a, view: { ...view, holes: [view.holes[0]!] }, id: 0 }, { name: 'Pat', hcp: 30, owner: false, plan: b, view: { ...view, holes: [view.holes[0]!] }, id: 0 }], end, 'level');
  assert.ok(lv.every(r => r.hcp === 'level' && r.net === r.toPar), 'level: scored as played');
  assert.ok(n(lv[0]!.toPar) <= n(lv[1]!.toPar), 'ordered by strokes');
});

test('racing a ghost: his strokes sent once each, a ghost\'s, in time order, in their batch; the board is the two of you', async () => {
  const sh = shareOf(file(), null, { name: 'Fair Links', biome: 'parkland', type: 'private', seed: 1 }), { view, frame } = await shareView(sh);
  const p0 = new Play3p({ view, holes: [0], skills: weak, sex: 'm', seed: 6, frame }); playAll(p0);
  const g = ghostOf({ holes: [0], seed: 6, skills: weak, sex: 'm', name: 'Pat', mode: 'own', hcp: 24 }, { name: sh.name, hash: sh.hash }, p0.inputs, p0.plan);
  const r = replayGhost(g, view);
  const p: Play3p = new Play3p({ view, holes: [0], skills: strong, sex: 'm', seed: 7, frame,
    more: m => { const a = ghostActor(r, m, frame); return a ? [a] : []; }, moreShots: (t0, t1) => ghostShots(r, t0, t1, frame),
    boardRows: (m: number): BoardMsg['rows'] => fairRows([{ name: 'You', hcp: 3, owner: true, plan: p.plan, view: p.view, id: p.me }, { name: 'Pat', hcp: g.hcp ?? null, owner: false, plan: r.plan, view: r.view, id: 0 }], m, 'own') });
  const all = playAll(p), gs = all.filter((m): m is ShotMsg => m.t === 'shot' && m.golfer === GHOST_ID);
  const his = r.plan.shots.filter(s => s.golfer === 0), last = Math.max(...all.filter(m => m.t === 'actors').map(m => (m as { at: number }).at));
  assert.equal(gs.length, his.filter(s => s.t <= last).length, 'each of his strokes up to the end of the session, once');
  assert.ok(gs.length > 0 && gs.every(m => m.ghost === true), 'marked a ghost\'s');
  for (let i = 1; i < gs.length; i++) assert.ok(gs[i]!.at >= gs[i - 1]!.at, 'in time order');
  all.forEach((m, i) => { if (m.t === 'shot' && m.golfer === GHOST_ID) { const nx = all.slice(i).find(x => x.t === 'actors') as { at: number } | undefined; assert.ok(!nx || m.at <= nx.at + 1e-9, 'sent no later than its batch'); } });
  const b = all.filter((m): m is BoardMsg => m.t === 'board').pop()!;
  assert.equal(b.rows.length, 2); assert.ok(b.rows.some(x => x.owner && x.hcp === '3.0') && b.rows.some(x => x.name === 'Pat' && x.hcp === '24.0' && x.net));
});
