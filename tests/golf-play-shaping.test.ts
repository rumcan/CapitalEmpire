// T334 (#960), part 2: shot shaping (src/game/golf/play/shape.ts, used by shot.ts hitShot, live.ts shotOutcome, conditions.ts previewShot): before the swing the player picks the curve (draw,
// straight, fade) and the flight (low, normal, high). The shot flies that way (a draw curves left and runs on, a fade curves right and checks; a high flight carries less, lands soft and catches more
// wind; a low one runs on, shrugs the wind and is the more accurate), at a cost in skill: the swing's miss is bigger (the accuracy click), the scatter wider for what he does not pull off, a mishit
// likelier without the skill. Saved with the input (OwnerInput.shape; absent: none, as before).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import { LiveGroup, NO_FX, SHAPE, applyMods, hitShot, makeField, playRound, previewShot, readShape, rng, shapeEffect, pickText, shotOutcome, teeTimes, windToward } from '../src/game/golf/play';
import type { Club, CourseView, GameSkills, Lie, OwnerInput, PlayHole, Pt, ShotEnv, ShotShape } from '../src/game/golf/play';

const flat = (lie: Lie): CourseView => ({ holes: [], lieAt: () => lie });
const O: Pt = { x: 0, y: 0 };
const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y) * TILE_M;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** the interquartile range: the scatter without the mishits' tails */
const iqr = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.75)]! - s[Math.floor(s.length * 0.25)]!; };
/** the volley of a shape: n full shots of `club` aimed m metres along +x, with the shape's effect (shapeEffect) in the model, and env */
function volley(club: Club, m: number, shape: ShotShape | null, env?: ShotEnv, sk: number | GameSkills = 0.6, n = 300) {
  const out: { carry: number; side: number; run: number; ang: number }[] = [];
  for (let k = 0; k < n; k++) {
    const fx = shapeEffect(shape, club, m, typeof sk === 'number' ? sk : sk.driving), o = hitShot(rng(60 + k, 3, 5), sk, 'fairway', O, { x: m / TILE_M, y: 0 }, club, flat('fairway'), { ...(shape ? { shape: fx } : {}), ...(env ? { env } : {}) });
    out.push({ carry: dist(O, o.landing.at), side: o.landing.at.y * TILE_M, run: dist(o.landing.at, o.to), ang: Math.atan2(o.landing.at.y, o.landing.at.x) * 180 / Math.PI });
  }
  return out;
}

test('shape: a pick is read from a save (junk is none, the straight normal shot is none), and named for the player', () => {
  assert.deepEqual(readShape({ curve: -1, flight: 1 }), { curve: -1, flight: 1 }); assert.deepEqual(readShape({ curve: 3, flight: -9 }), { curve: 1, flight: -1 });
  assert.deepEqual(readShape({ curve: 0.2, flight: 0 }), { curve: 0.2, flight: 0 }, 'J5f: an amount is read as it is (a light fade)'); assert.equal(readShape({ curve: 0, flight: 0 }), null); assert.equal(readShape(null), null); assert.equal(readShape('x'), null); assert.deepEqual(readShape({ curve: 'fade' }), null);
  assert.equal(pickText({ curve: -1, flight: 0 }), 'Draw'); assert.equal(pickText({ curve: 1, flight: 1 }), 'Fade, high'); assert.equal(pickText({ curve: 0, flight: -1 }), 'Low'); assert.equal(pickText(null), 'Straight'); assert.equal(pickText({ curve: 0, flight: 0 }), 'Straight');
});

test('shape: the effect: a draw curves left and runs on, a fade curves right and checks; more of it the longer the shot and the better the golfer', () => {
  const d = shapeEffect({ curve: -1, flight: 0 }, 'iron6', 200, 1), f = shapeEffect({ curve: 1, flight: 0 }, 'iron6', 200, 1);
  assert.ok(Math.abs(d.curve + SHAPE.curveDeg * Math.PI / 180) < 1e-12 && Math.abs(f.curve - SHAPE.curveDeg * Math.PI / 180) < 1e-12, 'the full curve at skill 1 over 200 m: left minus, right plus');
  assert.ok(d.run > 1 && f.run < 1 && Math.abs(d.run - 1 - SHAPE.runCurve) < 1e-12);
  const half = shapeEffect({ curve: 1, flight: 0 }, 'iron6', 200, 0);
  assert.ok(Math.abs(half.curve / f.curve - SHAPE.work) < 1e-12, 'a golfer of no skill pulls off half of it'); assert.ok(half.spread > f.spread && half.mishit > f.mishit && f.mishit === 0 && f.spread === 1, 'and pays in scatter and mishits; a master pays none');
  assert.ok(shapeEffect({ curve: 1, flight: 0 }, 'iron6', 100, 1).curve < f.curve && shapeEffect({ curve: 1, flight: 0 }, 'driver', 300, 1).curve > f.curve, 'the longer the carry the bigger the curve, within the bounds');
  assert.ok(Math.abs(shapeEffect({ curve: 1, flight: 0 }, 'driver', 1000, 1).curve - f.curve * SHAPE.curveK[1] / 1) < 1e-12, 'held to 1.2 of the 200 m curve');
  // the accuracy stat helps a little to pull it off
  const kit = (a: number) => applyMods({ driving: 0.5, irons: 0.5, short: 0.5, putting: 0.5, accuracy: a }, 'iron6');
  assert.ok(shapeEffect({ curve: 1, flight: 0 }, 'iron6', 200, 0.5, kit(1)).pulled > shapeEffect({ curve: 1, flight: 0 }, 'iron6', 200, 0.5, kit(0)).pulled);
  assert.deepEqual(shapeEffect(null, 'iron6', 150, 0.5), NO_FX); assert.deepEqual(shapeEffect({ curve: 0, flight: 0 }, 'iron6', 150, 0.5), NO_FX); assert.deepEqual(shapeEffect({ curve: -1, flight: 1 }, 'putter', 5, 0.5), NO_FX, 'a putt has no shape');
});

test('shape: the cost: each pick makes the swing’s miss bigger (a curve x1.35, a flight x1.2, both x1.55), the scatter wider and the mishit likelier for what he does not pull off', () => {
  assert.equal(shapeEffect({ curve: 1, flight: 0 }, 'iron6', 150, 0.5).miss, 1 + SHAPE.missCurve); assert.equal(shapeEffect({ curve: 0, flight: -1 }, 'iron6', 150, 0.5).miss, 1 + SHAPE.missFlight);
  assert.ok(Math.abs(shapeEffect({ curve: -1, flight: 1 }, 'iron6', 150, 0.5).miss - 1.55) < 1e-12);
  const one = shapeEffect({ curve: 1, flight: 0 }, 'iron6', 150, 0.2), two = shapeEffect({ curve: 1, flight: 1 }, 'iron6', 150, 0.2);
  assert.ok(two.mishit > one.mishit && two.spread > one.spread * 0.99 && one.mishit > 0, 'two picks cost more than one');
  assert.ok(shapeEffect({ curve: 1, flight: 0 }, 'iron6', 150, 0.9).mishit < shapeEffect({ curve: 1, flight: 0 }, 'iron6', 150, 0.1).mishit, 'a golfer with the skill pays less');
  // through the model: the same swing click, a pull: with a draw picked the miss is 35% bigger (shotOutcome multiplies the swing's miss)
  const view = flat('fairway'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 90, y: 0 }, line: [O, { x: 90, y: 0 }] }, click = { power: 1, acc: 0.2, boost: 0 };
  const angle = (shape?: ShotShape) => { const a: number[] = []; for (let k = 0; k < 150; k++) { const o = shotOutcome(view, hole, O, 'fairway', 0.9, { club: 'iron6', aim: hole.pin, power: 1, swing: click, ...(shape ? { shape } : {}) }, rng(8, k, 1)); a.push(Math.atan2(o.landing!.at.y, o.landing!.at.x) * 180 / Math.PI); } return mean(a); };
  const plain = angle(), fade = angle({ curve: 1, flight: 0 }), draw = angle({ curve: -1, flight: 0 });
  assert.ok(plain < -3, `the click is a pull: ${plain.toFixed(1)} degrees`);
  // the click's miss is x1.35 with a curve picked (the extra pull), and the curve itself goes left for a draw and right for a fade
  assert.ok(draw < plain - 4 && fade < plain && fade > draw + 4, `the same click: plain ${plain.toFixed(1)}, draw ${draw.toFixed(1)}, fade ${fade.toFixed(1)}`);
});

test('shape: in the model a draw lands left of the same shot straight and a fade right; the draw runs on and the fade checks', () => {
  const st = volley('iron6', 140, null), dr = volley('iron6', 140, { curve: -1, flight: 0 }), fd = volley('iron6', 140, { curve: 1, flight: 0 });
  const side = (v: typeof st) => mean(v.map(x => x.side)), run = (v: typeof st) => mean(v.map(x => x.run));
  const want = Math.tan(SHAPE.curveDeg * 0.7 * 0.8 * Math.PI / 180) * 120;
  assert.ok(side(dr) < side(st) - 0.5 * want && side(fd) > side(st) + 0.5 * want, `sideways: draw ${side(dr).toFixed(1)}, straight ${side(st).toFixed(1)}, fade ${side(fd).toFixed(1)} m`);
  assert.ok(run(dr) > run(st) && run(fd) < run(st), `run: draw ${run(dr).toFixed(1)}, straight ${run(st).toFixed(1)}, fade ${run(fd).toFixed(1)} m`);
});

test('shape: a high flight carries less and lands soft, the wind has more of it; a low flight carries less too, runs on, shrugs the wind and is the more accurate shot', () => {
  const wind: ShotEnv = { wind: { mph: 16, from: 270 }, lie: 'fairway' };
  const nrm = volley('iron6', 140, null, { lie: 'fairway' }), hi = volley('iron6', 140, { curve: 0, flight: 1 }, { lie: 'fairway' }), lo = volley('iron6', 140, { curve: 0, flight: -1 }, { lie: 'fairway' });
  const carry = (v: typeof nrm) => mean(v.map(x => x.carry)), run = (v: typeof nrm) => mean(v.map(x => x.run));
  assert.ok(Math.abs(carry(hi) / carry(nrm) - SHAPE.high.carry) < 0.03 && Math.abs(carry(lo) / carry(nrm) - SHAPE.low.carry) < 0.03, `carry: low ${carry(lo).toFixed(0)}, normal ${carry(nrm).toFixed(0)}, high ${carry(hi).toFixed(0)}`);
  assert.ok(run(hi) < 0.8 * run(nrm) && run(lo) > 1.3 * run(nrm), `run: high ${run(hi).toFixed(1)}, normal ${run(nrm).toFixed(1)}, low ${run(lo).toFixed(1)}`);
  assert.ok(iqr(lo.map(x => x.side)) < 0.95 * iqr(nrm.map(x => x.side)) && iqr(hi.map(x => x.side)) > iqr(nrm.map(x => x.side)), 'the low shot is the accurate one, the high one a little less');
  // the wind's drift: x1.3 for the high shot, x0.6 for the low, against the normal (the same draws: the drift is deterministic on them)
  const drift = (shape: ShotShape | null) => mean(volley('iron6', 140, shape, wind).map(x => x.side)) - mean(volley('iron6', 140, shape, { lie: 'fairway' }).map(x => x.side));
  const dn = drift(null), dh = drift({ curve: 0, flight: 1 }), dl = drift({ curve: 0, flight: -1 });
  assert.ok(Math.abs(dn) > 3 && Math.abs(dh / dn - SHAPE.high.wind * SHAPE.high.carry) < 0.08 && Math.abs(dl / dn - SHAPE.low.wind * SHAPE.low.carry) < 0.08, `drift: low ${dl.toFixed(1)}, normal ${dn.toFixed(1)}, high ${dh.toFixed(1)} m`);
  void windToward;
});

test('shape: the preview (the panel and the overlay) follows the pick: the wind, the carry, the curve', () => {
  const env: ShotEnv = { lie: 'fairway', wind: { mph: 14, from: 270 } }, u = { x: -Math.SQRT1_2, y: -Math.SQRT1_2 };
  const n = previewShot('iron6', 140, u.x, u.y, env), h = previewShot('iron6', 140, u.x, u.y, env, shapeEffect({ curve: 0, flight: 1 }, 'iron6', 140, 0.5)), l = previewShot('iron6', 140, u.x, u.y, env, shapeEffect({ curve: 0, flight: -1 }, 'iron6', 140, 0.5));
  assert.ok(Math.abs(h.windDriftM) > Math.abs(n.windDriftM) && Math.abs(l.windDriftM) < Math.abs(n.windDriftM), 'a high shot drifts more, a low one less');
  assert.ok(h.carryM < n.carryM * 1.01 && l.carryM < n.carryM);
  const d = previewShot('iron6', 140, 1, 0, { lie: 'fairway' }, shapeEffect({ curve: -1, flight: 0 }, 'iron6', 140, 1)), f = previewShot('iron6', 140, 1, 0, { lie: 'fairway' }, shapeEffect({ curve: 1, flight: 0 }, 'iron6', 140, 1));
  assert.ok(d.sideM < -3 && f.sideM > 3 && Math.abs(d.sideM + f.sideM) < 1e-9, `the curve moves the landing: draw ${d.sideM.toFixed(1)}, fade ${f.sideM.toFixed(1)} m`);
  assert.equal(previewShot('iron6', 140, 1, 0, { lie: 'fairway' }).sideM, 0);
});

test('shape: a saved input keeps its shape and replays exactly; an input without it plays as it did', () => {
  const PARS = [4, 4, 3, 5], hs: PlayHole[] = PARS.map((par, i) => { const y = 20 + 60 * i, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 80 : par === 4 ? 150 : 220), y }; return { n: i + 1, par: par as 3 | 4 | 5, tee, pin, line: [tee, pin] }; });
  const v: CourseView = { holes: hs, lieAt: (x, y) => hs.some(h => Math.hypot(x - h.pin.x, y - h.pin.y) <= 5) ? 'green' : Math.abs(((y - 20) % 60 + 60) % 60) < 8 ? 'fairway' : 'rough' };
  const f = makeField(2, 6), owner = f.find(g => !g.pro)!; owner.owner = true; owner.skill = 0.4;
  const gs = teeTimes(f, 6), gi = gs.findIndex(g => g.players.includes(owner.id));
  const run = (withShape: boolean) => {
    const pa = playRound(v, f, gs, 6, { live: gi }), a = new LiveGroup(pa, v, gi, 6);
    for (let k = 0; k < 80; k++) {
      const t = a.advance(); if (!t) break;
      const shape: ShotShape | undefined = withShape && t.suggested.club !== 'putter' ? { curve: ((k % 3) - 1) as -1 | 0 | 1, flight: ((k % 2) * 2 - 1) as -1 | 1 } : undefined;
      a.play({ holeIdx: t.holeIdx, stroke: t.stroke, club: t.suggested.club, aim: t.suggested.aim, power: t.suggested.power, swing: { power: Math.min(1.1, t.suggested.power), acc: 0.02 * (k % 4), boost: 0 }, ...(shape ? { shape } : {}) });
    }
    const pb = playRound(v, f, gs, 6, { live: gi }), b = new LiveGroup(pb, v, gi, 6);
    b.replay(JSON.parse(JSON.stringify(a.inputs)) as OwnerInput[]); b.advance(); a.advance();
    return { a, pa, pb };
  };
  const s = run(true), p = run(false);
  assert.ok(s.a.inputs.some(i => i.shape) && s.a.inputs.every(i => i.club !== 'putter' || !i.shape), 'the inputs keep their shapes (none for a putt)');
  assert.equal(JSON.stringify(s.pb.shots), JSON.stringify(s.pa.shots), 'the replay is the same round'); assert.equal(JSON.stringify(p.pb.shots), JSON.stringify(p.pa.shots));
  assert.ok(p.a.inputs.every(i => !('shape' in i)), 'no shape is saved for an input that had none');
  assert.notEqual(JSON.stringify(s.pa.shots), JSON.stringify(p.pa.shots), 'and a shape changes the shots');
  // a putt takes no shape: the same outcome with or without it
  const view = flat('green'), hole: PlayHole = { n: 1, par: 4, tee: O, pin: { x: 30, y: 0 }, line: [O, { x: 30, y: 0 }] }, from = { x: 20, y: 0 };
  const a = shotOutcome(view, hole, from, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing: { power: 1, acc: 0, boost: 0 } }, rng(1, 1, 1)), b = shotOutcome(view, hole, from, 'green', 0.6, { club: 'putter', aim: hole.pin, power: 1, swing: { power: 1, acc: 0, boost: 0 }, shape: { curve: 1, flight: 1 } }, rng(1, 1, 1));
  assert.deepEqual(a.to, b.to); assert.equal(a.holed, b.holed);
});
