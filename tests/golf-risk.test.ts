import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollEmergency, applyInsurance, holeScale, settleRisk, setInsurance, premiumOf, asPlan, emergencyLine, noteEmergency, EMERGENCY_CHANCE, PLANS } from '../src/game/golf/risk';
import { newFinance } from '../src/game/golf/finance';

const ctx = (seed: number, month: number, holes = 0, fees = 8000, plan: 'none' | 'basic' | 'full' = 'none') => ({ seed, month, holes, weeklyGreenFees: fees, plan });

test('the rate is about 8% a month over many seeds', () => {
  let hits = 0; const N = 20000;
  for (let i = 0; i < N; i++) if (rollEmergency(ctx(i * 7 + 1, i % 60))) hits++;
  const rate = hits / N;
  assert.ok(Math.abs(rate - EMERGENCY_CHANCE) < 0.012, `rate ${rate}`);
});

test('deterministic for the same seed and month', () => {
  for (let s = 0; s < 200; s++) assert.deepEqual(rollEmergency(ctx(s, 5)), rollEmergency(ctx(s, 5)));
});

test('every kind turns up, costs are in range and the parts add up', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20000; i++) {
    const e = rollEmergency(ctx(i, 3, 0, 8000, 'basic'));
    if (!e) continue;
    seen.add(e.id);
    assert.equal(e.insured + e.youPay, e.cost);
    assert.ok(e.cost > 0 && e.youPay >= 0 && e.insured >= 0);
    if (e.id === 'storm') assert.ok(e.cost >= 3000 && e.cost <= 12000);
    if (e.id === 'pump') assert.equal(e.cost, 6000);
    if (e.id === 'mower') assert.equal(e.cost, 4000);
    if (e.id === 'drought') assert.ok(e.cost >= 2000 && e.cost <= 5000);
    if (e.id === 'flood') assert.equal(e.cost, 8000);
  }
  assert.deepEqual([...seen].sort(), ['drought', 'flood', 'mower', 'pump', 'storm']);
});

test('no flood without green fees', () => {
  for (let i = 0; i < 5000; i++) assert.notEqual(rollEmergency(ctx(i, 1, 0, 0))?.id, 'flood');
});

test('deductible and cover maths', () => {
  assert.deepEqual(applyInsurance(3000, 'none'), { insured: 0, youPay: 3000 });
  assert.deepEqual(applyInsurance(3000, 'basic'), { insured: 0, youPay: 3000 });
  assert.deepEqual(applyInsurance(15000, 'basic'), { insured: 7000, youPay: 8000 });
  assert.deepEqual(applyInsurance(15000, 'full'), { insured: 12600, youPay: 2400 });
  assert.deepEqual(applyInsurance(800, 'full'), { insured: 0, youPay: 800 });
  assert.deepEqual(applyInsurance(6000, 'full'), { insured: 4500, youPay: 1500 });
});

test('scales with holes from x1 to x2', () => {
  assert.equal(holeScale(0), 1); assert.equal(holeScale(9), 1.5); assert.equal(holeScale(18), 2); assert.equal(holeScale(40), 2);
  let found = 0;
  for (let i = 0; i < 3000 && found < 20; i++) {
    const a = rollEmergency(ctx(i, 2, 0, 8000)), b = rollEmergency(ctx(i, 2, 18, 8000));
    if (a && b) { found++; assert.ok(Math.abs(b.cost - 2 * a.cost) <= 100, `${a.cost} ${b.cost}`); }
  }
  assert.ok(found > 0);
});

test('zero, NaN and negative guards', () => {
  for (const bad of [NaN, -50, Infinity, -Infinity]) {
    assert.ok(Number.isFinite(holeScale(bad)));
    const a = applyInsurance(bad, 'full');
    assert.ok(Number.isFinite(a.insured) && Number.isFinite(a.youPay) && a.youPay >= 0 && a.insured >= 0);
    const e = rollEmergency({ seed: bad, month: bad, holes: bad, weeklyGreenFees: bad, plan: 'basic' });
    if (e) assert.ok(Number.isFinite(e.cost) && e.cost > 0);
  }
  assert.equal(asPlan('gold'), 'none'); assert.equal(asPlan(undefined), 'none'); assert.equal(premiumOf('gold' as never), 0);
});

test('settleRisk books the out-of-pocket share on the emergency line and pays it; the premium is the month end s', () => {
  let withE = 0;
  for (let i = 0; i < 2000; i++) {
    const f = newFinance(); f.insurance = 'full'; let paid = 0;
    const e = settleRisk(f, { seed: i, month: 4, holes: 9, weeklyGreenFees: 6000 }, n => { paid += n; });
    assert.equal(f.cur.insurance, undefined);
    if (e) { withE++; assert.equal(f.cur.emergency, -e.youPay); assert.equal(paid, e.youPay); } else { assert.equal(f.cur.emergency, undefined); assert.equal(paid, 0); }
  }
  assert.ok(withE > 50);
});

test('noteEmergency attaches the bill to the report', () => {
  const r = { events: [] as string[], emergencies: undefined as undefined | { id: string }[] };
  noteEmergency(r as never, null); assert.equal(r.events.length, 0);
  noteEmergency(r as never, { id: 'pump', name: 'Irrigation pump failed', cost: 6000, insured: 0, youPay: 6000 });
  assert.equal(r.emergencies?.length, 1); assert.match(r.events[0], /all yours/);
});

test('insurance beats no insurance on a big bill, and setInsurance sets the plan', () => {
  assert.ok(applyInsurance(12000, 'full').youPay < applyInsurance(12000, 'none').youPay);
  const f = { insurance: 'none' } as never as Parameters<typeof setInsurance>[0];
  setInsurance(f, 'full'); assert.equal(f.insurance, 'full'); setInsurance(f, 'weird' as never); assert.equal(f.insurance, 'none');
  assert.equal(PLANS.basic.premium, 150); assert.equal(PLANS.full.premium, 400);
  assert.match(emergencyLine({ id: 'x', name: 'Storm clean-up', cost: 8000, insured: 2100, youPay: 5900 }), /Insurance paid \$2,100; you paid \$5,900/);
});
