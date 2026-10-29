// Your golf (T241, #705; docs/plans/P28.md section 2): the profile (golf/player.ts), its handicap, practice and its gains, your round on the everyday
// tee sheet, and your skills in the shot model (play/shot.ts skillFor), on the synthetic 18-hole course of golf-play.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { dayRoster } from '../src/game/golf/everyday';
import { makeField, playRound, teeTimes, dayRound, ownerGolfer, skillFor, CLUB_PART, OWNER_SKILL } from '../src/game/golf/play';
import type { CourseView, Golfer, Lie, PlayHole, Pt } from '../src/game/golf/play';
import {
  BOOK_GAP, BOOK_LEAD, FATIGUE, HCP_CURVE, HCP_WEIGHTS, LOG_MAX, PRACTICE, PRESSURE, START_SKILLS, bookRound, bookedGolfer, freeTee, gainOf, gameSkills,
  handicapOf, hcpText, normalizePlayer, playedRound, playerCardView, playerGolfer, practicePreview, practise, practiceWhy, rebook, startProfile, withYou,
  youRangeView, type PracticeCtx, type PlayerProfile, type Skills,
} from '../src/game/golf/player';
import { normalizeGolfSave } from '../src/game/golf/mode';

const PARS: (3 | 4 | 5)[] = [3, 4, 4, 5, 3, 4, 4, 4, 5, 4, 3, 4, 4, 4, 5, 4, 4, 5];
const POND = [5, 12];
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
/** golf-play.test.ts's synthetic course: each hole on its own row, a green round each pin, a fairway strip, two ponds, rough, out of bounds beyond */
function course(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => {
    const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y };
    return { n: h + 1, par, tee, pin, line: [tee, pin] };
  });
  const ponds = POND.map(h => ({ x: holes[h].tee.x + 100, y: holes[h].tee.y + 12.5 }));
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    for (const q of ponds) if (Math.hypot(x - q.x, y - q.y) <= 7.5) return 'water';
    let d = Infinity;
    for (const h of holes) d = Math.min(d, segDist({ x, y }, h.tee, h.pin));
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
const VIEW = course(), PAR = PARS.reduce((a, b) => a + b, 0);

/** a golfer's average strokes over par alone on the course over seeds 1..n */
function overPar(g: Golfer, n: number): number {
  let t = 0;
  for (let seed = 1; seed <= n; seed++) t += playRound(VIEW, [{ ...g, id: 0 }], [{ tee: 480, players: [0] }], seed * 7919).strokes[0]!.reduce((a, b) => a + b, 0) - PAR;
  return t / n;
}
/** a practice place open 07:00-18:00 at $6 with money to spare, at 10:00 of day 3 */
const ctx = (o: Partial<PracticeCtx> = {}): PracticeCtx => ({ day: 3, minute: 600, open: 420, close: 1080, price: 6, facility: true, money: 1e6, onCourse: false, ...o });
const withSkills = (p: PlayerProfile, s: Partial<Skills>): PlayerProfile => ({ ...p, skills: { ...p.skills, ...s } });

test('the profile starts a mid-handicap amateur (about 18) under the default name', () => {
  const p = startProfile();
  assert.equal(p.name, 'You'); assert.deepEqual(p.skills, START_SKILLS);
  const h = handicapOf(p.skills);
  assert.ok(h >= 17 && h <= 20, `start handicap ${h}`);
  assert.equal(p.log.length + p.rounds.length, 0); assert.equal(p.booked, null);
});

test('handicap: the curve at the weighted skills of an everyday round; lower with every better skill, a plus handicap below scratch', () => {
  // the formula by hand: s = weights . gameSkills(everyday), a + b s + c s^2, one decimal
  const sk: Skills = { driving: 45, irons: 35, short: 30, putting: 40, nerve: 40 }, g = gameSkills(sk, PRESSURE.everyday);
  const s = HCP_WEIGHTS.driving * g.driving + HCP_WEIGHTS.irons * g.irons + HCP_WEIGHTS.short * g.short + HCP_WEIGHTS.putting * g.putting;
  assert.equal(handicapOf(sk), Math.round((HCP_CURVE.a + HCP_CURVE.b * s + HCP_CURVE.c * s * s) * 10) / 10);
  assert.ok(Math.abs(HCP_WEIGHTS.driving + HCP_WEIGHTS.irons + HCP_WEIGHTS.short + HCP_WEIGHTS.putting - 1) < 1e-9, 'the weights add to 1');
  for (const k of ['driving', 'irons', 'short', 'putting', 'nerve'] as const) assert.ok(handicapOf({ ...sk, [k]: sk[k] + 10 }) < handicapOf(sk), `better ${k}, lower handicap`);
  const scratch = handicapOf({ driving: 80, irons: 80, short: 80, putting: 80, nerve: 100 });
  assert.ok(scratch < 0, `a strong player is below scratch (${scratch})`);
  assert.equal(hcpText(-2.14), '+2.1'); assert.equal(hcpText(18.46), '18.5');
  assert.ok(handicapOf({ driving: 0, irons: 0, short: 0, putting: 0, nerve: 0 }) <= HCP_CURVE.a);
});

test('handicap: within two strokes of what the shot model averages for that player in an everyday round', () => {
  for (const sk of [START_SKILLS, { driving: 60, irons: 24, short: 22, putting: 26, nerve: 30 }, { driving: 30, irons: 60, short: 60, putting: 60, nerve: 30 }, { driving: 50, irons: 50, short: 50, putting: 50, nerve: 50 }] as Skills[]) {
    const m = overPar(playerGolfer({ ...startProfile(), skills: sk }, 0, PRESSURE.everyday), 200), h = handicapOf(sk);
    assert.ok(Math.abs(m - h) < 2, `${JSON.stringify(sk)}: model ${m.toFixed(2)} against handicap ${h}`);
  }
});

test('gains shrink as a skill grows, with each session of a kind on the same day, and a lesson adds its bonus', () => {
  let last = Infinity;
  for (const s of [0, 20, 40, 60, 80, 95, 100]) { const g = gainOf(s, 2); assert.ok(g < last || (g === 0 && last === 0), `gain at ${s}`); last = g; }
  assert.equal(gainOf(100, 2), 0); assert.equal(gainOf(25, 2), 2 * 0.75 * 0.75);
  assert.equal(gainOf(25, 2, 2), 2 * 0.75 * 0.75 * FATIGUE * FATIGUE);
  assert.equal(gainOf(25, 2, 0, 0.5), 2 * 0.75 * 0.75 * 1.5);
  // a better player gains less from the same bucket
  const weak = practicePreview(startProfile(), 'bucket', 3).gains, strong = practicePreview(withSkills(startProfile(), { driving: 70, irons: 70 }), 'bucket', 3).gains;
  for (let i = 0; i < weak.length; i++) assert.ok(strong[i]!.gain < weak[i]!.gain, `${weak[i]!.id}: ${strong[i]!.gain} < ${weak[i]!.gain}`);
});

test('practice: each place raises its skills, costs its price and its minutes, and the day\'s second session gains less', () => {
  const p0 = startProfile();
  const a = practise(p0, 'bucket', ctx());
  assert.deepEqual(Object.keys(a.entry.gains).sort(), ['driving', 'irons']);
  assert.ok(a.profile.skills.driving > p0.skills.driving && a.profile.skills.irons > p0.skills.irons);
  assert.equal(a.profile.skills.putting, p0.skills.putting); assert.equal(a.profile.skills.short, p0.skills.short);
  assert.equal(a.entry.cost, 6); assert.equal(a.entry.min, PRACTICE.bucket.min);
  assert.deepEqual(a.profile.busy, { day: 3, until: 600 + PRACTICE.bucket.min });
  assert.ok(a.entry.hcp[1] <= a.entry.hcp[0], 'the handicap does not rise');
  assert.equal(p0.skills.driving, START_SKILLS.driving, 'the profile passed in is not changed');
  assert.deepEqual(Object.keys(practise(p0, 'putting', ctx({ price: 2 })).entry.gains), ['putting']);
  assert.deepEqual(Object.keys(practise(p0, 'chipping', ctx({ price: 2 })).entry.gains), ['short']);
  // the second bucket of the day (after the first is over) gains less than the first; the next day's first is fresh
  const b = practise(a.profile, 'bucket', ctx({ minute: 700 }));
  assert.ok(b.entry.gains.driving! < a.entry.gains.driving! * FATIGUE + 1e-6, 'fatigue');
  const c = practise(b.profile, 'bucket', ctx({ day: 4, minute: 480 }));
  assert.ok(c.entry.gains.driving! > b.entry.gains.driving!, 'a new day');
  // the log keeps the last LOG_MAX
  let p = p0; for (let i = 0; i < LOG_MAX + 5; i++) p = practise(p, 'putting', ctx({ day: 10 + i })).profile;
  assert.equal(p.log.length, LOG_MAX);
  // a lesson (P26's hook) adds its bonus and its price
  const L = practise(p0, 'bucket', ctx(), { bonus: 0.5, price: 15 });
  assert.equal(L.entry.cost, 21); assert.equal(L.entry.lesson, true);
  assert.ok(L.entry.gains.driving! > a.entry.gains.driving! * 1.45);
});

test('practice: why a session cannot start (hours, busy, money, the green, your round)', () => {
  const p = startProfile();
  assert.equal(practiceWhy(p, 'bucket', ctx()), null);
  assert.match(practiceWhy(p, 'bucket', ctx({ minute: 300 }))!, /Open 07:00 to 18:00/);
  assert.match(practiceWhy(p, 'bucket', ctx({ minute: 1060 }))!, /not enough time/);
  assert.match(practiceWhy(p, 'bucket', ctx({ money: 3 }))!, /Needs \$6/);
  assert.match(practiceWhy(p, 'putting', ctx({ facility: false }))!, /putting green/);
  assert.match(practiceWhy(p, 'bucket', ctx({ onCourse: true }))!, /on the course/);
  const busy = practise(p, 'bucket', ctx()).profile;
  assert.match(practiceWhy(busy, 'putting', ctx({ minute: 620 }))!, /until 10:45/);
  assert.equal(practiceWhy(busy, 'putting', ctx({ minute: 645 })), null);
  assert.equal(practiceWhy(busy, 'putting', ctx({ day: 4, minute: 620 })), null, 'busy is for that day only');
  // the range card's view: the gain and the cost of each place, and the last session
  const v = youRangeView(busy, { bucket: ctx({ minute: 620 }), putting: ctx({ minute: 620, price: 2 }), chipping: ctx({ minute: 620, price: 2, facility: false }) });
  assert.equal(v.busy, 'Practising until 10:45');
  assert.deepEqual(v.sessions.map(s => [s.kind, s.cost, s.gains.map(g => g.id).join()]), [['bucket', 6, 'driving,irons'], ['putting', 2, 'putting'], ['chipping', 2, 'short']]);
  assert.match(v.last!.text, /Hit a bucket at 10:00: driving \+1\.0, irons \+0\.9/);
});

test('determinism: the same session gives the same profile; a profile survives the save', () => {
  const run = () => { let p = startProfile(); for (const [k, m] of [['bucket', 480], ['putting', 600], ['chipping', 700], ['bucket', 800]] as const) p = practise(p, k, ctx({ minute: m })).profile; return playedRound(p, { day: 3, kind: 'everyday', strokes: 92, par: 72, holes: 18 }); };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  const back = normalizePlayer(JSON.parse(JSON.stringify(bookRound(a, 3, 900))));
  assert.deepEqual(back, bookRound(a, 3, 900));
  // an old save: no player (the engine starts the starting profile), a broken one is mended
  assert.equal(normalizePlayer(undefined), null);
  const mended = normalizePlayer({ skills: { driving: 'x', irons: 140 }, log: [{ kind: 'nope' }], rounds: 3 })!;
  assert.equal(mended.skills.driving, START_SKILLS.driving); assert.equal(mended.skills.irons, 100); assert.equal(mended.log.length, 0); assert.equal(mended.rounds.length, 0);
  // the golf save keeps it (and a save without one stays without: the engine starts it when needed)
  const g = { town: { x: 1, y: 1 }, course: [0, 0, 10, 10], clubhouse: { x: 2, y: 2 }, tees: [], pins: [], aims: [] } as never;
  assert.equal(normalizeGolfSave(g)!.player, undefined);
  assert.deepEqual(normalizeGolfSave({ ...(g as object), player: a } as never)!.player, a);
});

test('nerve: a finished round raises it (more under pressure, less as it grows), and pressure costs a nervous player more', () => {
  const p = startProfile(), e = playedRound(p, { day: 1, kind: 'everyday', strokes: 90, par: 72, holes: 18 }), t = playedRound(p, { day: 1, kind: 'tournament', strokes: 90, par: 72, holes: 18 });
  assert.ok(e.skills.nerve > p.skills.nerve && t.skills.nerve - p.skills.nerve > e.skills.nerve - p.skills.nerve);
  assert.equal(e.rounds.length, 1); assert.equal(e.rounds[0]!.strokes, 90);
  const calm = gameSkills({ ...START_SKILLS, nerve: 90 }, PRESSURE.tournament), shaky = gameSkills({ ...START_SKILLS, nerve: 10 }, PRESSURE.tournament);
  assert.ok(calm.putting > shaky.putting && calm.driving > shaky.driving);
  assert.ok(overPar(playerGolfer(p, 0, PRESSURE.tournament), 120) > overPar(playerGolfer(p, 0, PRESSURE.everyday), 120), 'the tournament plays harder');
});

test('the shot model: a golfer with four equal skills plays exactly as a field golfer of that skill (the field does not move)', () => {
  const f = makeField(2, 41), groups = teeTimes(f, 41), base = playRound(VIEW, f, groups, 41);
  const same = f.map(g => ({ ...g, skills: { driving: g.skill, irons: g.skill, short: g.skill, putting: g.skill } }));
  const plan = playRound(VIEW, same, groups, 41);
  assert.deepEqual(plan.shots, base.shots); assert.deepEqual(plan.strokes, base.strokes);
  assert.equal(skillFor(0.3, 'driver'), 0.3);
  const sk = { driving: 0.1, irons: 0.2, short: 0.3, putting: 0.4 };
  assert.deepEqual((['driver', 'wood3', 'iron4', 'iron6', 'iron8', 'pw', 'sw', 'putter'] as const).map(c => skillFor(sk, c)), [0.1, 0.1, 0.2, 0.2, 0.2, 0.2, 0.3, 0.4]);
  assert.equal(CLUB_PART.sw, 'short');
});

test('a better you scores better: the same seeds, the same course, your skills before and after a season of practice', () => {
  const before = startProfile();
  let after = before;
  for (let d = 1; d <= 12; d++) for (const [k, m] of [['bucket', 480], ['putting', 540], ['chipping', 580], ['bucket', 620], ['putting', 680], ['chipping', 720]] as const) after = practise(after, k, ctx({ day: d, minute: m })).profile;
  assert.ok(handicapOf(after.skills) < handicapOf(before.skills) - 2, `handicap ${handicapOf(before.skills)} to ${handicapOf(after.skills)}`);
  let won = 0, tot = [0, 0];
  for (let seed = 1; seed <= 40; seed++) {
    const a = playRound(VIEW, [playerGolfer(before, 0, PRESSURE.everyday)], [{ tee: 480, players: [0] }], seed).strokes[0]!.reduce((x, y) => x + y, 0);
    const b = playRound(VIEW, [playerGolfer(after, 0, PRESSURE.everyday)], [{ tee: 480, players: [0] }], seed).strokes[0]!.reduce((x, y) => x + y, 0);
    tot[0] += a; tot[1] += b; if (b < a) won++;
    // the same seed, the same round
    assert.equal(playRound(VIEW, [playerGolfer(after, 0, PRESSURE.everyday)], [{ tee: 480, players: [0] }], seed).strokes[0]!.reduce((x, y) => x + y, 0), b);
  }
  assert.ok(tot[1] < tot[0] - 40 * 2, `40 rounds: ${tot[0]} before, ${tot[1]} after`);
  assert.ok(won >= 28, `the better you won ${won} of 40`);
});

test('your everyday round: a free tee time on the sheet, you added last, the others keep their play', () => {
  const r = dayRoster(5, 3, { quality: 60, rep: 40, holes: 18 });
  assert.ok(r.groups.length > 3);
  const t = freeTee(r, 600)!;
  assert.ok(t >= 600 + BOOK_LEAD && r.groups.every(g => Math.abs(g.tee - t) >= BOOK_GAP), `tee ${t}`);
  assert.equal(freeTee(r, 2000), null, 'none after the last tee time');
  assert.equal(freeTee(null, 400), 420, 'an empty sheet: the first tee time');
  const p = bookRound(startProfile(), 3, t), you = bookedGolfer(p, p.booked!), w = withYou(r, you, t), id = r.golfers.length;
  assert.equal(w.golfers.length, r.golfers.length + 1); assert.equal(w.golfers[id]!.name, 'You'); assert.deepEqual(w.golfers[id]!.skills, p.booked!.skills);
  assert.deepEqual(w.groups.slice(0, -1), r.groups); assert.deepEqual(w.groups[w.groups.length - 1], { tee: t, players: [id] });
  assert.equal(w.info.length, w.groups.length); assert.equal(w.info[w.info.length - 1]!.fee, 0);
  assert.equal(new Set(w.order).size, w.info.length);
  const a = playRound(VIEW, r.golfers, r.groups, r.seed), b = playRound(VIEW, w.golfers, w.groups, w.seed);
  assert.deepEqual(b.strokes.slice(0, id), a.strokes, 'the others play the same strokes (only the waits behind you can move)');
  assert.ok(b.strokes[id]!.every(s => s > 0), 'you play every hole');
  // a session before you walk to the tee updates the game you play with; once you are out it does not
  const q = practise(p, 'bucket', ctx({ minute: t - 60 })).profile;
  assert.notDeepEqual(rebook(q, 3, t - 60).booked!.skills, p.booked!.skills);
  assert.deepEqual(rebook(q, 3, t).booked!.skills, p.booked!.skills);
  // the card's view of the round and the log
  const v = playerCardView(q, { k: 'booked', tee: t });
  assert.equal(v.skills.length, 5); assert.equal(v.log.length, 1); assert.deepEqual(v.round, { k: 'booked', tee: t });
});

test('the tournament (P4\'s live play): your skills as you joined, the same round on a replay; an old save plays at OWNER_SKILL', () => {
  const sk = gameSkills(START_SKILLS, PRESSURE.tournament);
  const a = dayRound(VIEW, 1, 77, { owner: 'm', inputs: [], caddie: 0, skills: sk }), b = dayRound(VIEW, 1, 77, { owner: 'm', inputs: [], caddie: 0, skills: sk });
  const id = a.own!.id;
  a.own!.live.advance(); b.own!.live.advance();
  assert.deepEqual(a.plan.strokes[id], b.plan.strokes[id]);
  assert.deepEqual(a.golfers[id]!.skills, sk);
  assert.equal(ownerGolfer(9, 'm').skill, OWNER_SKILL); assert.equal(ownerGolfer(9, 'm').skills, undefined);
  // the field's play does not depend on yours: the others' strokes are their own streams
  const c = dayRound(VIEW, 1, 77, { owner: 'm', inputs: [], caddie: 0 });
  c.own!.live.advance();
  assert.deepEqual(a.plan.strokes.slice(0, id), c.plan.strokes.slice(0, id));
  // the save keeps them for the replay
  const g = { town: { x: 1, y: 1 }, course: [0, 0, 10, 10], clubhouse: { x: 2, y: 2 }, tees: [], pins: [], aims: [], play: { key: 3, owner: 'm', inputs: [], caddie: null, skills: sk } } as never;
  assert.deepEqual(normalizeGolfSave(g)!.play!.skills, sk);
});
