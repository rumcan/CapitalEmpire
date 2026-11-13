// T455 (the owner, 2026-11-13: "add distance penalties for your lie ... a full golf club set with distances so the guy can club up ... unlock shot shaping in dev mode"):
// what each lie takes off the carry (lies.ts LIE_FX and CLUB_LIE, lieCarry), the full bag's carries from the lie in the turn message (turn3p.ts clubChoice lieM), the lie
// words, and the Developer toggle's unlocks (unlocks.ts DEV_EARNED).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLUB_LIE, LIE_FX, LIE_KINDS, lieCarry, lieKindOfSurface, kindFits, lieView, previewShot } from '../src/game/golf/play';
import { DEV_EARNED, earned } from '../src/game/golf/play/unlocks';
import { CLUB_ORDER, carryFor } from '../src/game/golf/play/shot';
import { clubChoice } from '../src/game/golf/play/turn3p';
import { bagClubs } from '../src/game/golf/play/turn3p';
import type { Club } from '../src/game/golf/play';

const IRONS: Club[] = ['iron5', 'iron6', 'iron7', 'iron8', 'iron9', 'pw'];
const pct = (k: Parameters<typeof lieCarry>[0], c: Club) => Math.round((1 - lieCarry(k, c)) * 100);

test('lie → distance: the grass costs what the owner asked, by lie, for an iron', () => {
  for (const c of IRONS) {
    assert.equal(lieCarry('fairway', c), 1);
    assert.equal(pct('firstcut', c), 3, 'first cut -3%');
    assert.ok(pct('rough', c) >= 10 && pct('rough', c) <= 15, `rough ${pct('rough', c)}% for ${c}`);
    assert.ok(pct('deep', c) >= 20 && pct('deep', c) <= 25, `long grass ${pct('deep', c)}% for ${c}`);
    assert.equal(pct('fescue', c), 25, 'fescue -25%');
  }
  assert.ok(lieCarry('tee', 'driver') > 1, 'a tee is the most distance');
  assert.equal(lieCarry('green', 'iron7'), 1);
});

test('lie → distance: the waste area -5 to -8% (a kind of its own that plays as a bunker lie), sand -10% for a full shot', () => {
  assert.ok(pct('waste', 'iron7') >= 5 && pct('waste', 'iron7') <= 8);
  assert.equal(lieKindOfSurface('waste'), 'waste');
  assert.equal(lieKindOfSurface('bunker'), 'bunker');
  assert.ok(kindFits('waste', 'bunker') && !kindFits('waste', 'rough'));
  assert.equal(pct('bunker', 'iron8'), 10, 'a mid iron from sand: -10%');
  assert.equal(pct('bunker', 'pw'), 10);
});

test('lie → distance: sand takes the woods away and cuts the long irons further; the wedges explode out short', () => {
  assert.ok(lieCarry('bunker', 'driver') < 0.4, 'no driver from sand');
  assert.ok(lieCarry('bunker', 'wood3') < 0.5 && lieCarry('bunker', 'wood5') < 0.6);
  const order: Club[] = ['iron9', 'iron7', 'iron6', 'iron5', 'iron4', 'hybrid', 'wood5', 'wood3', 'driver'];
  for (let i = 1; i < order.length; i++) assert.ok(lieCarry('bunker', order[i]!) <= lieCarry('bunker', order[i - 1]!), `${order[i]} is cut at least as far as ${order[i - 1]}`);
  assert.ok(lieCarry('bunker', 'sw') < lieCarry('bunker', 'pw') && lieCarry('bunker', 'lw') < lieCarry('bunker', 'sw'), 'sand and lob wedge: the explosion shots');
});

test('lie → distance: every lie’s factor is positive, no club gains from a bad lie, and the table only names kinds and clubs that exist', () => {
  for (const k of LIE_KINDS) for (const c of CLUB_ORDER) { const f = lieCarry(k, c); assert.ok(f > 0 && Number.isFinite(f), `${k} ${c}`); if (k !== 'tee') assert.ok(f <= 1, `${k} ${c} ${f}`); }
  for (const [k, row] of Object.entries(CLUB_LIE)) { assert.ok(LIE_KINDS.includes(k as never), k); for (const c of Object.keys(row!)) assert.ok(CLUB_ORDER.includes(c as Club), c); }
});

test('lie → distance: the heavy lies keep their spin cut and their wider miss', () => {
  assert.ok(LIE_FX.rough.spin < 0.5 && LIE_FX.rough.spread > 1.2 && LIE_FX.rough.flier > 0);
  assert.ok(LIE_FX.deep.spin < LIE_FX.rough.spin && LIE_FX.deep.spread > LIE_FX.rough.spread && LIE_FX.deep.wild > LIE_FX.rough.wild);
});

test('the preview and the panel read the lie for the club: a driver from sand plays far shorter than a wedge, the words say so', () => {
  const env = { lie: 'bunker' as const };
  const dr = previewShot('driver', 200, 1, 0, env).carryM, pw = previewShot('pw', 100, 1, 0, env).carryM;
  assert.ok(dr / 200 < 0.4 && pw / 100 > 0.89 && pw / 100 < 0.91, `${dr} ${pw}`);
  assert.ok(lieView('rough', 'iron7').lines.some(l => l === 'carry -13%'));
  assert.ok(lieView('bunker', 'driver').lines.some(l => /carry -6\d%/.test(l)));
});

test('the full bag from this lie: the turn’s every club has its carry from the lie, so he can club up', () => {
  const sk = 0.6, clubs = bagClubs(sk);
  assert.ok(clubs.length >= 8);
  for (const lie of ['fairway', 'rough', 'bunker'] as const) {
    const choices = clubs.map(c => clubChoice(sk, c, lie, { lie: lie === 'fairway' ? 'fairway' : lie }, 1, 0));
    for (const ch of choices) {
      if (ch.club === 'putter') continue;
      assert.ok(ch.lieM !== undefined && Math.abs(ch.lieM - ch.carryM * lieCarry(lie, ch.club)) < 1e-9, `${lie} ${ch.club}`);
      if (lie === 'fairway') assert.ok(Math.abs(ch.lieM! - ch.carryM) < 1e-9);
      else assert.ok(ch.lieM! < ch.carryM, `${lie} ${ch.club}`);
    }
  }
  // clubbing up: from the rough the 6-iron carries what the 7 would from the fairway... and the club up (5) now matches the 6’s fairway carry
  const f6 = carryFor(sk, 'iron6'), r5 = carryFor(sk, 'iron5') * lieCarry('rough', 'iron5');
  assert.ok(r5 < carryFor(sk, 'iron5') && Math.abs(r5 - f6) < f6 * 0.12, `${r5} vs ${f6}`);
});

test('dev mode unlocks the shot extras without the cards: shaping, flight, spins, the boost with two charges; the earned set does not', () => {
  const none = earned({ skills: {}, bag: null, mech: [] });
  assert.ok(!none.draw && !none.high && !none.boost, 'a new save has none');
  for (const k of ['draw', 'fade', 'high', 'low', 'side', 'back', 'tour', 'boost'] as const) assert.equal(DEV_EARNED[k], true, k);
  assert.equal(DEV_EARNED.charges, 2);
  assert.deepEqual(DEV_EARNED.why, {});
});
