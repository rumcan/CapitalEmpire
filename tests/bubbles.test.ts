// Speech bubbles (T406, #1090): the table of words (bubble-lines.ts), the machine that picks who says what (bubbles.ts: the on-screen cap, the cool-downs, the
// frequency, the events), the hurt loop of a fan hit by a ball (its timing), the knee-hit detection (golf/ballhit.ts), the playback's landing events (play/view.ts
// PlayView.lands), the hurt pose in the crowd (crowdview.ts galleryPeople) and the drawing's placement (bubble-draw.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUBBLE_RATES, BubbleSystem, HURT_MAX, LIFE_MAX, LIFE_MIN, LOST_S, MIN_Z, QUIET_S, RATES, bubblePose, lifeOf, personMood, seeded, specId, specParts, zoomAlpha,
  type BubbleHost, type Speaker,
} from '../src/game/bubbles';
import {
  CALM, GONE_S, HIT_R, HURT_BEAT, HURT_GAME_MIN, HURT_LINES, HURT_MIN_REAL_S, HURT_ON, HURT_PLAIN, HURT_VARY, LIMP_S, RULES, SAMPLED, SPEAKER_KINDS, fits, holds, hurtLine, rulesFor,
  type BubbleContext, type EventId, type SpeakerKind,
} from '../src/game/bubble-lines';
import { MAX_TEXT_W, drawBubbles, place, wrap, type Clear } from '../src/game/bubble-draw';
import { FORE_R, NICE_R, THROW_P, fanHit, fanHitBy, landEvents } from '../src/game/golf/ballhit';
import { LIMP_V, galleryPeople, type CrowdPerson, type HurtFan } from '../src/game/crowdview';
import { SPECTATOR_CLIPS } from '../src/game/library';
import { TILE_M } from '../src/game/golf/types';
import { IMPACT_S, PlayView, playRound } from '../src/game/golf/play';
import type { CourseView, Golfer, Group, Lie, PlayHole, PlayLand } from '../src/game/golf/play';

// ---------------------------------------------------------------- a fake crowd on screen
class Crowd implements BubbleHost {
  people: Record<SpeakerKind, Speaker[]> = { town: [], spectator: [], golfer: [], staff: [] };
  add(kind: SpeakerKind, n: number, o: Partial<Speaker> = {}, id0 = 1): void {
    for (let i = 0; i < n; i++) this.people[kind].push({ kind, id: id0 + i, x: 10 + (i % 10), y: 10 + Math.floor(i / 10), lift: 0, moving: false, busy: false, alpha: 1, ...o });
  }
  count(kind: SpeakerKind): number { return this.people[kind].length; }
  person(kind: SpeakerKind, k: number, out: Speaker): boolean { const p = this.people[kind][k]; if (!p) return false; Object.assign(out, p); return true; }
  find(kind: SpeakerKind, id: number, out: Speaker): boolean { const p = this.people[kind].find(q => q.id === id); if (!p) return false; Object.assign(out, p); return true; }
}
const sys = (host: BubbleHost, seed = 1, rate: (typeof BUBBLE_RATES)[number] = 'normal') => { const s = new BubbleSystem(host, seeded(seed)); s.rate = rate; return s; };
/** runs frames of dt s from t0 for secs seconds at a zoom; sim advances simRate sim s per real s; returns the most bubbles live at once and every bubble seen (by reference) */
function run(s: BubbleSystem, secs: number, o: { t0?: number; dt?: number; zoom?: number; simRate?: number } = {}): { max: number; seen: Set<object>; t: number } {
  const t0 = o.t0 ?? 0, dt = o.dt ?? 0.1, zoom = o.zoom ?? 0.3, sr = o.simRate ?? 1, seen = new Set<object>();
  let max = 0, t = t0;
  for (; t < t0 + secs; t += dt) { s.frame(t, t * sr, zoom); max = Math.max(max, s.live.length + s.hurts.length); for (const b of s.live) seen.add(b); }
  return { max, seen, t };
}

// ---------------------------------------------------------------- the table
test('the table: unique ids, real lines (short, clean, no brands), valid kinds, weights and cool-downs, every game event answered', () => {
  const ids = new Set<string>();
  for (const r of RULES) {
    assert.ok(!ids.has(r.id), `unique id ${r.id}`); ids.add(r.id);
    assert.ok(r.lines.length >= 1, `${r.id} has lines`);
    assert.ok(r.weight > 0 && r.cooldown >= 0 && (r.gap ?? 0) >= 0, `${r.id} weight and cool-down`);
    assert.ok(r.who.length >= 1 && r.who.every(k => SPEAKER_KINDS.includes(k)), `${r.id} who`);
    for (const l of r.lines) {
      assert.ok(l.length >= 3 && l.length <= 46, `${r.id}: "${l}" is short`);
      assert.ok(!/walkman|nintendo|atari|coca|pepsi|rubik|mcdonald|cabbage patch|sony|ibm|apple/i.test(l), `${r.id}: "${l}" names no brand`);
      assert.ok(!/\b(damn|hell|shit|fuck|piss|crap|ass)\b/i.test(l), `${r.id}: "${l}" is clean`);
    }
    if (r.on !== 'sample') { assert.ok(r.role === 'subject' || r.role === 'near', `${r.id} says who speaks`); if (r.role === 'near') assert.ok((r.n ?? 0) >= 1 && (r.radius ?? 0) > 0, `${r.id} near: n and radius`); }
    else assert.equal(r.role, undefined, `${r.id} a sampled row has no role`);
  }
  const events: EventId[] = ['birdie', 'eagle', 'ace', 'nice-shot', 'ball-water', 'ball-lost', 'fore', 'club-throw', 'ball-car', 'hit-spectator'];
  for (const e of events) assert.ok(rulesFor(e).length >= 1, `event ${e} is answered`);
  for (const g of ['thought', 'mood', 'game', 'fun'] as const) assert.ok(RULES.some(r => r.group === g), `a ${g} row`);
});

test('the table: a row fits by who and by its conditions (weather, mood, queue, jam, prices, balls, the tournament)', () => {
  const rule = (id: string) => RULES.find(r => r.id === id)!;
  const ctx = (o: Partial<BubbleContext>): BubbleContext => ({ ...CALM, ...o });
  assert.ok(fits(rule('th-rain'), 'town', ctx({ weather: 'rain' }), 0.5));
  assert.ok(!fits(rule('th-rain'), 'town', ctx({ weather: 'clear' }), 0.5), 'no rain thoughts in the clear');
  assert.ok(fits(rule('th-clear'), 'spectator', ctx({ weather: 'clear', night: 0 }), 0.5));
  assert.ok(!fits(rule('th-clear'), 'spectator', ctx({ weather: 'clear', night: 0.9 }), 0.5), 'not by night');
  assert.ok(fits(rule('th-night'), 'town', ctx({ night: 0.9 }), 0.5));
  assert.ok(fits(rule('mood-happy'), 'town', ctx({}), 0.7) && !fits(rule('mood-happy'), 'town', ctx({}), 0.5), 'happy lines for a happy person');
  assert.ok(fits(rule('mood-grumpy'), 'town', ctx({}), 0.2) && !fits(rule('mood-grumpy'), 'town', ctx({}), 0.5), 'grumbles for a grumpy one');
  assert.ok(fits(rule('queue-long'), 'golfer', ctx({ queue: 0.8 }), 0.5) && !fits(rule('queue-long'), 'golfer', ctx({ queue: 0.2 }), 0.5), 'a long queue is grumbled at');
  assert.ok(fits(rule('jam'), 'town', ctx({ jam: 0.7 }), 0.5) && !fits(rule('jam'), 'golfer', ctx({ jam: 0.7 }), 0.5), 'only the town talks about the jams');
  assert.ok(fits(rule('litter'), 'spectator', ctx({ litter: 0.8 }), 0.5) && fits(rule('no-bins'), 'staff', ctx({ binShort: 0.8 }), 0.5));
  assert.ok(fits(rule('balls-out'), 'golfer', ctx({ ballsOut: true }), 0.5) && fits(rule('balls-out'), 'staff', ctx({ ballsOut: true }), 0.5) && !fits(rule('balls-out'), 'town', ctx({ ballsOut: true }), 0.5), 'out of balls: the golfers and the staff');
  assert.ok(fits(rule('price-high'), 'spectator', ctx({ price: 1 }), 0.5) && !fits(rule('price-high'), 'spectator', ctx({ price: 0 }), 0.5) && fits(rule('price-low'), 'spectator', ctx({ price: -1 }), 0.5));
  assert.ok(fits(rule('tour-day'), 'spectator', ctx({ tournament: true }), 0.5) && !fits(rule('tour-day'), 'spectator', ctx({ tournament: false }), 0.5) && !fits(rule('tour-day'), 'town', ctx({ tournament: true }), 0.5));
  assert.ok(fits(rule('th-golfer'), 'golfer', ctx({}), 0.5) && !fits(rule('th-golfer'), 'town', ctx({}), 0.5), 'golfers think of golf');
  assert.ok(holds({ k: 'mood', min: 0.6 }, ctx({ mood: 0.1 }), 0.9), "a person's own mood, not the context's, is read for mood");
  for (const r of SAMPLED) assert.ok(r.who.length > 0);
});

test('a person has his own mood: the context shifted a little by who he is, always 0..1, not everyone alike', () => {
  const vals = new Set<number>();
  for (let id = 1; id <= 200; id++) { const m = personMood({ mood: 0.5 }, 'town', id); assert.ok(m >= 0 && m <= 1); assert.ok(Math.abs(m - 0.5) <= 0.19, 'within 0.18 of the context'); vals.add(Math.round(m * 100)); }
  assert.ok(vals.size > 10, 'many different moods');
  assert.ok(personMood({ mood: 1 }, 'golfer', 5) <= 1 && personMood({ mood: 0 }, 'golfer', 5) >= 0);
});

test('a bubble lives 2 to 4 s by its words, pops in and fades out, and the zoom fades it', () => {
  assert.equal(lifeOf('Hi'), LIFE_MIN);
  assert.equal(lifeOf('x'.repeat(80)), LIFE_MAX);
  for (const r of RULES) for (const l of r.lines) { const v = lifeOf(l); assert.ok(v >= LIFE_MIN && v <= LIFE_MAX); }
  const b = { born: 10, life: 3 };
  assert.equal(bubblePose(b, 9.9).alpha, 0, 'not yet');
  assert.ok(bubblePose(b, 10.02).scale < 1 && bubblePose(b, 10.02).alpha === 1, 'popping in');
  assert.ok(Math.abs(bubblePose(b, 11).scale - 1) < 1e-9 && bubblePose(b, 11).alpha === 1, 'full');
  assert.ok(bubblePose(b, 12.8).alpha > 0 && bubblePose(b, 12.8).alpha < 1, 'fading over the last 0.4 s');
  assert.equal(bubblePose(b, 13.01).alpha, 0, 'gone');
  assert.equal(zoomAlpha(MIN_Z), 0); assert.equal(zoomAlpha(0.05), 0); assert.equal(zoomAlpha(0.2), 1); assert.equal(zoomAlpha(0.3), 1);
  assert.ok(zoomAlpha(0.15) > 0 && zoomAlpha(0.15) < 1 && zoomAlpha(0.17) > zoomAlpha(0.15), 'between: smooth and rising');
});

test('spectator ids round trip (source, index, slot)', () => {
  for (const [s, i, k] of [[0, 0, 0], [0, 17, 89], [1, 5999, 2], [2, 3, 23], [0, 999999, 127]] as const) { const p = specParts(specId(s, i, k)); assert.deepEqual([p.source, p.index, p.slot], [s, i, k]); }
});

// ---------------------------------------------------------------- the machine
test('the cap: never more bubbles on screen than the rate allows (4 / 6 / 8), each living 2 to 4 s', () => {
  for (const rate of BUBBLE_RATES) {
    const c = new Crowd(); c.add('town', 60); c.add('spectator', 60, {}, 1000); c.add('golfer', 10, {}, 5000); c.add('staff', 5, {}, 7000);
    const s = sys(c, 7, rate); s.ctx = { ...CALM, mood: 0.8, queue: 0.9, weather: 'rain' };
    const r = run(s, 240);
    assert.ok(r.max <= RATES[rate].cap, `${rate}: at most ${RATES[rate].cap} at once (saw ${r.max})`);
    assert.ok(r.max >= Math.min(2, RATES[rate].cap), `${rate}: and the screen is not empty`);
    assert.ok(s.stats.spawned > 10, `${rate}: bubbles were made`);
    for (const b of r.seen as Set<{ life: number }>) assert.ok(b.life >= LIFE_MIN && b.life <= LIFE_MAX, 'each lives 2 to 4 s');
  }
});

test('frequency: Low makes fewer bubbles than Normal, Normal fewer than High; off and out of the street zoom make none', () => {
  const made = (rate: (typeof BUBBLE_RATES)[number], zoom = 0.3, on = true) => {
    const c = new Crowd(); c.add('town', 40); c.add('spectator', 40, {}, 1000); const s = sys(c, 3, rate); s.on = on; run(s, 300, { zoom }); return s.stats.spawned;
  };
  const lo = made('low'), mid = made('normal'), hi = made('high');
  assert.ok(lo > 0 && lo < mid && mid < hi, `low ${lo} < normal ${mid} < high ${hi}`);
  assert.equal(made('high', MIN_Z - 0.01), 0, 'under the street zoom nobody speaks');
  assert.equal(made('high', 0.3, false), 0, 'off: silence');
});

test('the cool-downs: a person is quiet for QUIET_S after a bubble, a row rests its gap, and the screen has a gap between bubbles', () => {
  // one person alone: his bubbles are at least QUIET_S apart
  const c = new Crowd(); c.add('town', 1);
  const s = sys(c, 11, 'high'); s.ctx = { ...CALM, mood: 0.9 };
  const born: number[] = []; const seenB = new Set<object>();
  for (let t = 0; t < 600; t += 0.1) { s.frame(t, t, 0.3); for (const b of s.live) if (!seenB.has(b)) { seenB.add(b); born.push(b.born); } }
  assert.ok(born.length >= 5, `he spoke ${born.length} times in ten minutes`);
  for (let i = 1; i < born.length; i++) assert.ok(born[i]! - born[i - 1]! >= QUIET_S - 1e-6, `bubbles ${i - 1} and ${i} are ${(born[i]! - born[i - 1]!).toFixed(1)} s apart (>= ${QUIET_S})`);
  // the screen's gap: sampled bubbles over a crowd start at least 0.7 of the rate's gap apart
  const c2 = new Crowd(); c2.add('town', 80);
  const s2 = sys(c2, 5, 'normal'); s2.ctx = { ...CALM, mood: 0.9 };
  const t2: number[] = [], seen2 = new Set<object>();
  for (let t = 0; t < 120; t += 0.05) { s2.frame(t, t, 0.3); for (const b of s2.live) if (!seen2.has(b)) { seen2.add(b); t2.push(b.born); } }
  assert.ok(t2.length > 10);
  for (let i = 1; i < t2.length; i++) assert.ok(t2[i]! - t2[i - 1]! >= RATES.normal.gap * 0.7 - 1e-6, `gap ${(t2[i]! - t2[i - 1]!).toFixed(2)} s`);
  // a row's rest: the nice-shot fans rest 4 s for everyone
  const c3 = new Crowd(); c3.add('spectator', 6);
  const s3 = sys(c3, 2); assert.equal(s3.event('nice-shot', 12, 10, 100), 2, 'two fans cheer the shot');
  assert.equal(s3.event('nice-shot', 12, 10, 101), 0, 'and the row rests 4 s: nobody for another shot a second later');
});

test('nobody in his swing speaks, nobody off the screen, nobody faded out, and a bubble follows its person and goes when he leaves', () => {
  const c = new Crowd(); c.add('golfer', 5, { busy: true }); c.add('spectator', 5, { alpha: 0.3 }, 100);
  const s = sys(c, 4, 'high'); s.ctx = { ...CALM, mood: 0.9 };
  run(s, 120); assert.equal(s.stats.spawned, 0, 'golfers in their swings and faded people do not get bubbles');
  assert.equal(s.event('birdie', 10, 10, 200, { kind: 'golfer', id: 1 }), 0, 'and an event does not put one over a golfer in his swing');
  // following
  const d = new Crowd(); d.add('town', 1); const f = sys(d, 9, 'high'); f.ctx = { ...CALM, mood: 0.9 };
  let t = 0; for (; t < 60 && !f.live.length; t += 0.1) f.frame(t, t, 0.3);
  assert.equal(f.live.length, 1, 'he speaks');
  d.people.town[0]!.x = 33; d.people.town[0]!.y = 44; f.frame(t, t, 0.3);
  assert.equal(f.live[0]!.x, 33); assert.equal(f.live[0]!.y, 44, 'the bubble moves with him');
  d.people.town.length = 0; t += 0.1; f.frame(t, t, 0.3); assert.equal(f.live.length, 1, 'a moment off screen: still there');
  t += LOST_S + 0.2; f.frame(t, t, 0.3); assert.equal(f.live.length, 0, 'gone for LOST_S: the bubble goes');
});

test('events: the subject and the nearest people within the radius speak, up to n; a full screen makes room for an event', () => {
  const c = new Crowd(); c.add('golfer', 1, { x: 10, y: 10 }, 7);
  for (const [i, d] of [2, 4, 6, 8, 30].entries()) c.add('spectator', 1, { x: 10 + d, y: 10 }, 100 + i);
  const s = sys(c, 6);
  const made = s.event('birdie', 10, 10, 50, { kind: 'golfer', id: 7 });
  assert.equal(made, 4, 'the golfer and the three nearest fans (n = 3 within 12 tiles)');
  const who = s.live.map(b => `${b.kind}:${b.who}`).sort();
  assert.deepEqual(who, ['golfer:7', 'spectator:100', 'spectator:101', 'spectator:102'], 'the fan 30 tiles off and the fourth nearest are silent');
  assert.ok(s.live.every(b => b.life >= LIFE_MIN && b.text.length > 0));
  // a full screen: sampled bubbles make room for an event
  const c2 = new Crowd(); c2.add('town', 40); c2.add('spectator', 1, { x: 12, y: 12 }, 900);
  const s2 = sys(c2, 8, 'low'); s2.ctx = { ...CALM, mood: 0.9 };
  run(s2, 60); while (s2.live.length < RATES.low.cap) { const b = s2.tellAny('town', 'filler', 61); if (!b) break; b.rule = 'x'; }
  const before = s2.live.length; assert.ok(before <= RATES.low.cap);
  s2.event('ball-water', 12, 12, 62, undefined);
  assert.ok(s2.live.length <= RATES.low.cap, 'still at most the cap');
});

// ---------------------------------------------------------------- the hurt loop
test('the hurt loop: a groan then its echo with pauses, a plainer moan every few beats; the bubble shows 2.3 s of each 3.1 s beat', () => {
  assert.equal(hurtLine(0), HURT_LINES[0]);
  assert.equal(hurtLine(HURT_ON - 0.01), HURT_LINES[0]);
  assert.equal(hurtLine(HURT_ON + 0.05), null, 'a pause');
  assert.equal(hurtLine(HURT_BEAT + 0.1), HURT_LINES[1], 'the echo');
  assert.equal(hurtLine(2 * HURT_BEAT + 0.1), HURT_LINES[0], 'and again');
  assert.equal(hurtLine((HURT_VARY - 1) * HURT_BEAT + 0.1), HURT_PLAIN[0], 'a plainer moan breaks it up');
  assert.equal(hurtLine((2 * HURT_VARY - 1) * HURT_BEAT + 0.1), HURT_PLAIN[1]);
  assert.equal(hurtLine(-1), null);
  let on = 0; const n = 6000; for (let i = 0; i < n; i++) if (hurtLine(i * 0.01) !== null) on++;
  assert.ok(Math.abs(on / n - HURT_ON / HURT_BEAT) < 0.01, 'on about 74% of the time');
  for (const l of [...HURT_LINES, ...HURT_PLAIN]) assert.ok(l.length < 30);
});

test('the hurt gag lasts HURT_GAME_MIN game minutes (2) with a floor of HURT_MIN_REAL_S, then he limps off, is gone, then is back', () => {
  const c = new Crowd(); c.add('spectator', 1, { x: 20, y: 20 }, specId(0, 3, 5));
  const run1 = (simPerReal: number, rate: number): { clutchEnd: number; limpEnd: number; goneEnd: number } => {
    const s = sys(c, 1); const h = s.hurt(3, 5, 25, 20, 7, 100, 5000, rate)!;
    assert.ok(h && h.pose === 'clutch' && Math.abs(h.simDur - HURT_GAME_MIN / rate) < 1e-9, 'two game minutes in sim seconds');
    const out = { clutchEnd: -1, limpEnd: -1, goneEnd: -1 };
    for (let t = 100; t < 1000 && out.goneEnd < 0; t += 0.05) {
      s.frame(t, 5000 + (t - 100) * simPerReal, 0.3);
      const p = s.hurts[0]?.pose;
      if (out.clutchEnd < 0 && p !== 'clutch') out.clutchEnd = t - 100;
      if (out.clutchEnd >= 0 && out.limpEnd < 0 && p !== 'limp') out.limpEnd = t - 100;
      if (out.limpEnd >= 0 && s.hurts.length === 0) out.goneEnd = t - 100;
    }
    return out;
  };
  // at the watching speed (1/40 x) with a town minute 1.5 a sim second: 2 game minutes = 1.333 sim s = 53.3 real s
  const watch = run1(1 / 40, 1.5);
  assert.ok(Math.abs(watch.clutchEnd - 80 / 1.5) < 0.2, `at the watching speed he clutches ${watch.clutchEnd.toFixed(1)} s (about 53.3)`);
  assert.ok(Math.abs(watch.limpEnd - watch.clutchEnd - LIMP_S) < 0.2, 'then limps for LIMP_S');
  assert.ok(Math.abs(watch.goneEnd - watch.limpEnd - GONE_S) < 0.2, 'then is gone for GONE_S, then back in his place');
  // at 20x the two game minutes pass in a blink: the floor holds him for HURT_MIN_REAL_S
  const fast = run1(20, 1.5);
  assert.ok(Math.abs(fast.clutchEnd - HURT_MIN_REAL_S) < 0.2, `at speed he clutches the floor, ${fast.clutchEnd.toFixed(1)} s`);
  // a clock that does not move (paused) holds him
  const s = sys(c, 1); s.hurt(3, 5, 25, 20, 7, 0, 100, 1.5); for (let t = 0; t < 120; t += 0.5) s.frame(t, 100, 0.3);
  assert.equal(s.hurts[0]!.pose, 'clutch', 'paused: he is still holding his knee');
});

test('the hurt bubble follows the beats while he clutches, only then; one gag a fan; at most HURT_MAX at once; a load clears them', () => {
  const c = new Crowd(); for (let k = 0; k < 5; k++) c.add('spectator', 1, { x: 20 + k, y: 20 }, specId(0, 3, k));
  const s = sys(c, 1);
  const h = s.hurt(3, 0, 30, 20, 7, 100, 0, 1.5)!;
  const seen: (string | null)[] = [];
  for (let t = 100; t < 110; t += 0.05) { s.frame(t, 0, 0.3); const out: object[] = []; const list = s.drawable(t, out as never); const hb = list.find(b => (b as { hurt?: boolean }).hurt); seen.push(hb ? (hb as { text: string }).text : null); assert.equal(hb ? 1 : 0, hurtLine(t - 100) === null ? 0 : 1, `bubble shown iff the beat is on (${(t - 100).toFixed(2)})`); }
  assert.ok(seen.includes(HURT_LINES[0]!) && seen.includes(HURT_LINES[1]!), 'both groans seen in ten seconds');
  assert.equal(s.hurt(3, 0, 30, 20, 7, 101, 0, 1.5), null, 'a fan already hurt is not hurt again');
  assert.equal(h.bubble.kind, 'spectator'); assert.equal(h.bubble.who, specId(0, 3, 0));
  for (let k = 1; k < 5; k++) s.hurt(3, k, 30, 20, 7, 102, 0, 1.5);
  assert.equal(s.hurts.length, HURT_MAX, 'at most three at once');
  assert.ok(!s.hurts.some(x => x.slot === 0), 'the oldest was replaced');
  s.clear(); assert.equal(s.hurts.length, 0);
  assert.equal(sys(c, 1).hurt(1, 1, 0, 0, 1, 0, 0, 1.5) !== null, true);
  const off = sys(c, 1); off.on = false; assert.equal(off.hurt(1, 1, 0, 0, 1, 0, 0, 1.5), null, 'off: no gag');
});

// ---------------------------------------------------------------- the knee-hit detection
/** a gallery buffer of one standing spot: x, y, fans, kind 0, the focus (fx, fy), the aim */
const gallery = (x: number, y: number, fans: number, kind = 0, fx = x + 10, fy = y): Float32Array => Float32Array.of(x, y, fans, kind, fx, fy, fx, fy);
const fansOf = (G: ArrayLike<number>, o = 0, places?: ArrayLike<number>): CrowdPerson[] => { const out: CrowdPerson[] = []; const n = galleryPeople(G, o, o / 8, 0, 1, out, -1, undefined, places); return out.slice(0, n).map(p => ({ ...p })); };

test('the knee hit: a ball that comes down within HIT_R of a standing fan hits him (the nearest), among the fans; a ball well clear hits no one', () => {
  const G = gallery(50, 50, 40), F = fansOf(G);
  assert.ok(F.length >= 30);
  const f = F[17]!;
  const hit = fanHit(G, null, f.x + 0.1, f.y - 0.05);
  assert.ok(hit && hit.slot === 17 && hit.spot === 0, 'the fan the ball landed on');
  assert.ok(hit.d < 0.2 && hit.fx === 60 && hit.fy === 50, 'how near, and where his gallery looks');
  // nearest of two: a point just beside fan 4 is his
  const g = F[4]!, hit2 = fanHit(G, null, g.x - 0.2, g.y);
  assert.ok(hit2 && hit2.slot === 4);
  // in the thick of the crowd, any landing is a hit (the fans stand about 0.55 tiles apart)
  assert.ok(fanHit(G, null, 50.3, 50.1));
  // well clear: 3 and 8 tiles from the crowd
  assert.equal(fanHit(G, null, 50, 60), null, 'beside the gallery');
  assert.equal(fanHit(G, null, 80, 50), null, 'far away');
  // only HIT_R reaches: a point HIT_R + 0.3 from every fan (the crowd's outer edge)
  const far = F.reduce((a, p) => (p.x - 50) ** 2 + (p.y - 50) ** 2 > (a.x - 50) ** 2 + (a.y - 50) ** 2 ? p : a);
  const ux = (far.x - 50), uy = (far.y - 50), L = Math.hypot(ux, uy) || 1;
  assert.equal(fanHit(G, null, far.x + ux / L * (HIT_R + 0.3), far.y + uy / L * (HIT_R + 0.3)), null, 'just past the last fan');
  assert.ok(fanHit(G, null, far.x + ux / L * 0.2, far.y + uy / L * 0.2), 'and just inside it');
});

test('the knee hit: grandstand fans (seated) are not hit, a ball in the water hits no one, a ball that rolls on into the fans hits where it rests, and arcs and rings count', () => {
  const stand = gallery(50, 50, 40, 2), fan = fansOf(gallery(50, 50, 40))[3]!;
  assert.equal(fanHit(stand, null, fan.x, fan.y), null, 'a stand is not a standing gallery');
  const G = gallery(50, 50, 40), F = fansOf(G), f = F[8]!;
  const land = (o: Partial<Pick<PlayLand, 'x' | 'y' | 'rx' | 'ry' | 'landLie' | 'lie'>>) => ({ x: 70, y: 70, rx: 70, ry: 70, landLie: 'rough' as Lie, lie: 'rough' as Lie, ...o });
  assert.equal(fanHitBy(G, null, land({ x: f.x, y: f.y, landLie: 'water', lie: 'water' })), null, 'water');
  assert.equal(fanHitBy(G, null, land({ x: 70, y: 70, rx: f.x + 0.05, ry: f.y })!)?.slot, 8, 'it landed clear and rolled on: where it rests');
  assert.equal(fanHitBy(G, null, land({ x: f.x, y: f.y, rx: 70, ry: 70 }))?.slot, 8, 'where it landed');
  // an arc of places (a tee's gallery): fan s stands on place s
  const places = Float32Array.of(...Array.from({ length: 20 }, (_, i) => [40 + i * 0.7, 30 + (i % 3) * 0.6]).flat());
  const Gp = gallery(40, 30, 20), P = fansOf(Gp, 0, places);
  assert.equal(P.length, 20);
  const m = new Map<number, ArrayLike<number>>([[0, places]]);
  assert.equal(fanHit(Gp, m, P[5]!.x + 0.05, P[5]!.y)?.slot, 5, 'with places the fans are where the places put them');
  assert.equal(fanHit(Gp, m, 60, 60), null);
});

test('the hit fan crouches (the sit clip as the stand-in), then limps away from his gallery and fades, then is out of sight; the others are untouched', () => {
  const G = gallery(50, 50, 30), base = fansOf(G);
  const hurt = (pose: HurtFan['pose'], since: number): HurtFan[] => [{ spot: 0, slot: 3, pose, since, fx: 60, fy: 50 }];
  const run2 = (h: HurtFan[], now: number): CrowdPerson[] => { const out: CrowdPerson[] = []; const n = galleryPeople(G, 0, 0, now, 1, out, -1, undefined, undefined, h); return out.slice(0, n).map(p => ({ ...p })); };
  const C = run2(hurt('clutch', 0), 1.3), sit = SPECTATOR_CLIPS.sit;
  assert.ok(C[3]!.frame >= sit.start && C[3]!.frame < sit.start + sit.n, 'crouched: the sit clip');
  assert.equal(C[3]!.x, base[3]!.x); assert.equal(C[3]!.y, base[3]!.y); assert.equal(C[3]!.alpha, undefined);
  for (let k = 0; k < C.length; k++) if (k !== 3) assert.deepEqual([C[k]!.x, C[k]!.y, C[k]!.frame], [base[k]!.x, base[k]!.y, run2([], 1.3)[k]!.frame], `fan ${k} is as before`);
  const L = run2(hurt('limp', 10), 13)[3]!, d0 = Math.hypot(base[3]!.x - 60, base[3]!.y - 50), d1 = Math.hypot(L.x - 60, L.y - 50);
  assert.ok(Math.abs(d1 - d0 - LIMP_V * 3) < 1e-6, `3 s into the limp he is ${LIMP_V * 3} tiles further from the focus`);
  assert.ok(L.frame >= SPECTATOR_CLIPS.walk.start && L.frame < SPECTATOR_CLIPS.walk.start + SPECTATOR_CLIPS.walk.n, 'walking');
  assert.equal(run2(hurt('limp', 10), 10 + LIMP_S - 0.1)[3]!.alpha! < 0.2, true, 'fading out at the end of the limp');
  assert.equal(run2(hurt('gone', 20), 25)[3]!.alpha, 0, 'gone');
  // a slot reused by the next call has no stale alpha
  const out: CrowdPerson[] = []; galleryPeople(G, 0, 0, 5, 1, out, -1, undefined, undefined, hurt('gone', 0));
  galleryPeople(G, 0, 0, 5, 1, out); assert.equal(out[3]!.alpha, undefined, 'nobody stays invisible');
});

// ---------------------------------------------------------------- the events a landing raises
const land = (o: Partial<PlayLand> = {}): PlayLand => ({ golfer: 3, hole: 4, x: 100, y: 100, rx: 100, ry: 100, landLie: 'fairway', lie: 'fairway', club: 'iron7', stroke: 2, penalty: 0, holed: false, par: 4, px: 120, py: 100, ...o });
test('landing events: an ace, an eagle, a birdie, the water, out of bounds, a nice shot and Fore, from what the ball did', () => {
  assert.deepEqual(landEvents(land({ holed: true, stroke: 1, par: 3, club: 'iron7' }), false), ['ace']);
  assert.deepEqual(landEvents(land({ holed: true, stroke: 3, par: 5, club: 'putter' }), false), ['eagle']);
  assert.deepEqual(landEvents(land({ holed: true, stroke: 2, par: 3, club: 'putter' }), false), ['birdie']);
  assert.deepEqual(landEvents(land({ holed: true, stroke: 4, par: 4, club: 'putter' }), false), [], 'a par is not a story');
  assert.deepEqual(landEvents(land({ landLie: 'water', lie: 'water' }), false).slice(0, 1), ['ball-water']);
  assert.deepEqual(landEvents(land({ lie: 'out', landLie: 'out' }), false).slice(0, 1), ['ball-lost']);
  assert.deepEqual(landEvents(land({ lie: 'green', landLie: 'green', rx: 120.5, ry: 100 }), false), ['nice-shot'], 'an approach that ends by the pin');
  assert.deepEqual(landEvents(land({ lie: 'green', landLie: 'green', rx: 100, ry: 100 }), false), [], 'a green but far from the pin');
  assert.deepEqual(landEvents(land({ lie: 'green', landLie: 'green', rx: 120.5, ry: 100, club: 'putter' }), false), [], 'putts are not nice shots');
  assert.ok(Math.hypot(0.5, 0) <= NICE_R);
  assert.deepEqual(landEvents(land({ landLie: 'rough', lie: 'rough', club: 'driver' }), true), ['fore'], 'in the rough near the fans: Fore');
  assert.deepEqual(landEvents(land({ landLie: 'rough', lie: 'rough', club: 'driver' }), false), [], 'not near anyone: quiet');
  assert.deepEqual(landEvents(land({ landLie: 'fairway', lie: 'fairway', club: 'driver' }), true), [], 'the fairway is no Fore');
  assert.ok(FORE_R >= 8);
});

test('landing events: a club thrown after a penalty is rare, seeded (the same story every time the day is played)', () => {
  let n = 0, again = 0;
  for (let g = 0; g < 40; g++) for (let st = 2; st < 52; st++) {
    const l = land({ golfer: g, stroke: st, penalty: 1, landLie: 'water', lie: 'water' });
    const a = landEvents(l, false), b = landEvents(l, false);
    if (a.includes('club-throw')) n++; if (JSON.stringify(a) === JSON.stringify(b)) again++;
  }
  assert.equal(again, 2000, 'the same each time');
  assert.ok(n / 2000 > THROW_P / 3 && n / 2000 < THROW_P * 3, `about ${THROW_P}: ${n / 2000}`);
  assert.ok(!landEvents(land({ landLie: 'rough', lie: 'rough', penalty: 0, stroke: 9 }), false).includes('club-throw'), 'no penalty, no tantrum');
});

// ---------------------------------------------------------------- the playback reports each landing once
const PARS: (3 | 4 | 5)[] = [3, 4, 5];
function view3(): CourseView {
  const holes: PlayHole[] = PARS.map((par, h) => { const y = 20 + 60 * h, tee = { x: 10, y }, pin = { x: 10 + (par === 3 ? 160 : par === 4 ? 380 : 500) / TILE_M, y }; return { n: h + 1, par, tee, pin, line: [tee, pin] }; });
  const lieAt = (x: number, y: number): Lie => {
    for (const h of holes) if (Math.hypot(x - h.pin.x, y - h.pin.y) <= 6) return 'green';
    let d = Infinity;
    for (const h of holes) { const dx = h.pin.x - h.tee.x, dy = h.pin.y - h.tee.y, L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((x - h.tee.x) * dx + (y - h.tee.y) * dy) / L2)); d = Math.min(d, Math.hypot(x - h.tee.x - dx * t, y - h.tee.y - dy * t)); }
    return d <= 7.5 ? 'fairway' : d <= 40 ? 'rough' : 'out';
  };
  return { holes, lieAt };
}
const GOLFERS: Golfer[] = [{ id: 0, name: 'Pro One', sex: 'm', pro: true, skill: 0.9, look: 0 }, { id: 1, name: 'Ama Two', sex: 'w', pro: false, skill: 0.4, look: 1 }];
const GROUPS: Group[] = [{ tee: 450, players: [0] }, { tee: 500, players: [1] }];

test('PlayView.lands: a ball that comes down is reported once, with where it landed and rests, the hole and the stroke; a shot struck before the first update is not', () => {
  const view = view3(), plan = playRound(view, GOLFERS, GROUPS, 1234), pv = new PlayView(plan, view);
  const s = plan.shots.find(x => x.golfer === 0 && x.club !== 'putter' && x.landing)!;
  pv.update(s.t - 0.05, 100); assert.equal(pv.lands.length, 0);
  pv.update(s.t + 0.01, 101); assert.equal(pv.lands.length, 0, 'struck, not down yet');
  pv.update(s.t + 0.01, 101 + IMPACT_S + 0.5); assert.equal(pv.lands.length, 0, 'in the air');
  pv.update(s.t + 0.01, 101 + IMPACT_S + 1.5);
  assert.equal(pv.lands.length, 1, 'down');
  const l = pv.lands[0]!;
  assert.equal(l.golfer, 0); assert.equal(l.hole, s.hole); assert.equal(l.club, s.club); assert.equal(l.stroke, s.stroke + s.penalty);
  assert.deepEqual([l.x, l.y], [s.landing!.at.x, s.landing!.at.y]); assert.deepEqual([l.rx, l.ry], [s.to.x, s.to.y]);
  assert.equal(l.par, PARS[s.hole]); assert.equal(l.landLie, s.landing!.lie); assert.equal(l.lie, s.lie);
  pv.update(s.t + 0.01, 101 + IMPACT_S + 1.6); assert.equal(pv.lands.length, 0, 'once: the next update reports nothing new');
  // struck before the first update (a page load mid-round): shown at rest, no landing
  const pv2 = new PlayView(plan, view); pv2.update(s.t + 30, 50); assert.equal(pv2.lands.length, 0);
  pv2.update(s.t + 30, 60); assert.equal(pv2.lands.length, 0);
  // the hole-out: a holed shot reports itself holed
  const h = plan.shots.find(x => x.holed)!, pv3 = new PlayView(plan, view);
  pv3.update(h.t - 0.05, 10); pv3.update(h.t + 0.01, 11); pv3.update(h.t + 0.01, 14);
  const hl = pv3.lands.find(q => q.golfer === h.golfer && q.stroke === h.stroke + h.penalty);
  assert.ok(hl && hl.holed, 'the ball drops');
});

// ---------------------------------------------------------------- the drawing
test('placement: a bubble is lifted off a ball or a golfer in his swing, may sit over another bubble, and is hidden when it cannot clear a ball', () => {
  const ball: Clear = { x0: 90, y0: 40, x1: 110, y1: 60 };
  assert.equal(place(80, 100, 40, 20, [], []), 100, 'nothing in the way: where it was');
  const lifted = place(80, 50, 40, 20, [ball], [])!;
  assert.ok(lifted < 40 - 20 + 1e-9 || lifted + 20 <= 40 || lifted >= 60, 'lifted clear of the ball');
  assert.ok(!(ball.x0 < 120 && ball.x1 > 80 && ball.y0 < lifted + 20 && ball.y1 > lifted), 'and it does not touch the ball');
  const wall: Clear = { x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 };
  assert.equal(place(80, 50, 40, 20, [wall], []), null, 'a ball it cannot get clear of: hidden');
  const other: Clear = { x0: 70, y0: 40, x1: 130, y1: 70 };
  const over = place(80, 50, 40, 20, [], [other])!; assert.ok(over <= 50, 'lifted off another bubble');
  const stack: Clear[] = Array.from({ length: 6 }, (_, i) => ({ x0: 0, y0: -200 + i * 100, x1: 500, y1: -100 + i * 100 }));
  assert.equal(place(80, 50, 40, 20, [], stack), 50, 'boxed in by bubbles only: it stays where it was (overlap allowed)');
});

test('wrapping and drawing: text wraps to the width, the tail and box draw, a bubble under the street zoom or hidden draws nothing', () => {
  const m = (s: string) => s.length * 6.5;
  const w = wrap('Is the sandwich made of gold? Seriously now', m);
  assert.ok(w.lines.length >= 2 && w.lines.every(l => m(l) <= MAX_TEXT_W + 1e-9), 'wrapped');
  assert.deepEqual(wrap('Hi', m).lines, ['Hi']);
  let texts = 0, rects = 0;
  const ctx = new Proxy({}, { get: (_t, k) => k === 'measureText' ? (s: string) => ({ width: m(s) }) : k === 'fillText' ? () => { texts++; } : k === 'arcTo' ? () => { rects++; } : () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  const mk = (text: string, style: 'say' | 'think' | 'shout' | 'moan', x: number, y: number) => ({ kind: 'town' as const, who: 1, x, y, lift: 0, text, style, rule: 'x', born: 0, life: 3, seen: 0 });
  const list = [mk('Nice shot!', 'say', 5, 5), mk('Hot enough to fry an egg.', 'think', 6, 9), mk('Fore!', 'shout', 8, 3), mk('Aaarrgh...', 'moan', 9, 9)];
  const screen = (x: number, y: number) => ({ x: 200 + (x - y) * 20, y: 300 + (x + y) * 10 });
  assert.equal(drawBubbles(ctx, list, 1, 0.3, 0.3, 1, 800, 600, screen, []), 4, 'four drawn');
  assert.ok(texts >= 4 && rects >= 4);
  assert.equal(drawBubbles(ctx, list, 1, 0.1, 0.1, 1, 800, 600, screen, []), 0, 'under the street zoom: nothing');
  assert.equal(drawBubbles(ctx, list, 9, 0.3, 0.3, 1, 800, 600, screen, []), 0, 'past their life: nothing');
  assert.equal(drawBubbles(ctx, list, 1, 0.3, 0.3, 1, 800, 600, screen, [{ x0: -1e5, y0: -1e5, x1: 1e5, y1: 1e5 }]), 0, 'over a ball: hidden');
  // the HUD: nothing is ever drawn off the screen's side
  assert.equal(drawBubbles(ctx, [mk('Far away', 'say', 500, 500)], 1, 0.3, 0.3, 1, 800, 600, screen, []), 0, 'off screen');
});
