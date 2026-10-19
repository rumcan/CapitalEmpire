// Driver variety (T009): the seeded driver styles, the ACC car-following model against the IDM, string stability on a
// tiny 1-lane ring, the fundamental diagram of the mix and the shoulder decision. Headless: npm test (esbuild + node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Drivers, SHOULDER_M, SHOULDER_QUEUE, STYLE, accACC, cah, idm, iidm } from '../src/game/ext/drivers';
import { CAR as SIM_CAR, idm as simIdm } from '../src/game/sim/idm';

/** the sim's step, s */
const DT = 0.1;
/** the vehicle length of the tests, m (a car) */
const LEN = 4.5;
/** the normal car's parameters (the generator's base values): desired speed factor 1, T s, a and b m/s^2, s0 m */
const CAR = { a: 1.5, b: 2, T: 1.2, s0: 2 };
/** a driver's whole parameter set, per vehicle */
interface Params { v0: Float32Array; a: Float32Array; b: Float32Array; T: Float32Array; s0: Float32Array }

test('drivers: the mix shares come out over 10,000 draws, and the stream is seeded', () => {
  const mix = { aggressive: 0.2, cautious: 0.3, truckShare: 0.1 }, N = 10000;
  const d = new Drivers(7, mix);
  d.ensure(N);
  for (let i = 0; i < N; i++) d.assign(i, i % 2 ? 'truck' : 'car');
  const cnt = [0, 0, 0];
  for (let i = 0; i < N; i++) cnt[d.style[i]!]!++;
  const aggr = cnt[STYLE.AGGRESSIVE]! / N, caut = cnt[STYLE.CAUTIOUS]! / N, norm = cnt[STYLE.NORMAL]! / N;
  assert.ok(Math.abs(aggr - 0.2) < 0.02, `aggressive share ${aggr.toFixed(4)}`);
  assert.ok(Math.abs(caut - 0.3) < 0.02, `cautious share ${caut.toFixed(4)}`);
  assert.ok(Math.abs(norm - 0.5) < 0.02, `normal share ${norm.toFixed(4)}`);
  // the same seed and draws give the same drivers; another seed does not
  const same = new Drivers(7, mix), other = new Drivers(8, mix);
  for (let i = 0; i < N; i++) { same.assign(i, i % 2 ? 'truck' : 'car'); other.assign(i, i % 2 ? 'truck' : 'car'); }
  const first = (f: Float32Array) => Array.from(f.subarray(0, N));
  assert.deepEqual(first(same.T), first(d.T));
  assert.deepEqual(first(same.a), first(d.a));
  assert.notDeepEqual(first(other.T), first(d.T));
  // the styles have the intended order: aggressive drivers keep tighter and shorter, cautious longer and gentler
  const mean = (f: Float32Array, st: number) => {
    let s = 0, n = 0;
    for (let i = 0; i < N; i++) if (d.style[i] === st) { s += f[i]!; n++; }
    return s / n;
  };
  assert.ok(mean(d.T, STYLE.AGGRESSIVE) < mean(d.T, STYLE.NORMAL) && mean(d.T, STYLE.NORMAL) < mean(d.T, STYLE.CAUTIOUS), 'headways ordered');
  assert.ok(mean(d.impatience, STYLE.AGGRESSIVE) < mean(d.impatience, STYLE.NORMAL) && mean(d.impatience, STYLE.NORMAL) < mean(d.impatience, STYLE.CAUTIOUS), 'impatience ordered');
  assert.ok(mean(d.a, STYLE.AGGRESSIVE) > mean(d.a, STYLE.NORMAL) && mean(d.a, STYLE.NORMAL) > mean(d.a, STYLE.CAUTIOUS), 'acceleration ordered');
  console.log(`drivers: shares over ${N} draws: aggressive ${(aggr * 100).toFixed(2)}%, normal ${(norm * 100).toFixed(2)}%, cautious ${(caut * 100).toFixed(2)}%; ` +
    `T aggressive/normal/cautious ${mean(d.T, 1).toFixed(2)}/${mean(d.T, 0).toFixed(2)}/${mean(d.T, 2).toFixed(2)} s, ` +
    `impatience ${mean(d.impatience, 1).toFixed(1)}/${mean(d.impatience, 0).toFixed(1)}/${mean(d.impatience, 2).toFixed(1)} s`);
});

test('drivers: trucks are slower and longer, assignAuto draws the truck share, ensure keeps the slots', () => {
  const N = 20000, d = new Drivers(3, { aggressive: 0.2, cautious: 0.3, truckShare: 0.1 });
  let trucks = 0;
  for (let i = 0; i < N; i++) if (d.assignAuto(i) === 'truck') trucks++;
  const share = trucks / N;
  assert.ok(Math.abs(share - 0.1) < 0.01, `truck share ${share.toFixed(4)}`);
  const mean = (f: Float32Array, t: number) => {
    let s = 0, n = 0;
    for (let i = 0; i < N; i++) if (d.truck[i] === t) { s += f[i]!; n++; }
    return s / n;
  };
  assert.ok(mean(d.v0f, 1) < mean(d.v0f, 0), 'trucks slower');
  assert.ok(mean(d.T, 1) > mean(d.T, 0), 'trucks keep a longer headway');
  assert.ok(mean(d.a, 1) < mean(d.a, 0) && mean(d.s0, 1) > mean(d.s0, 0), 'trucks gentler and longer');
  // ensure grows, keeps the old slots and the new ones get assigned
  const e = new Drivers(1, { aggressive: 0.2, cautious: 0.3, truckShare: 0 });
  e.assign(0, 'car'); e.assign(1, 'car');
  const keep = [e.T[0]!, e.a[1]!];
  e.ensure(100);
  assert.ok(e.cap >= 100);
  assert.deepEqual([e.T[0]!, e.a[1]!], keep);
  e.assign(99, 'truck');
  assert.equal(e.truck[99], 1);
  assert.ok(e.T[99]! > 0);
  console.log(`drivers: ${trucks} of ${N} assignAuto draws are trucks (${(share * 100).toFixed(2)}%); ` +
    `mean v0f car/truck ${mean(d.v0f, 0).toFixed(3)}/${mean(d.v0f, 1).toFixed(3)}, T ${mean(d.T, 0).toFixed(2)}/${mean(d.T, 1).toFixed(2)} s, a ${mean(d.a, 0).toFixed(2)}/${mean(d.a, 1).toFixed(2)} m/s^2`);
});

test('acc: the IIDM holds the time headway exactly, the IDM does not; the free road and a stopped leader behave', () => {
  // steady following: at s = s0 + vT the IIDM is exactly at equilibrium (the T parameter is the time gap); the IDM's
  // equilibrium gap is far larger (s* / sqrt(1 - (v/v0)^4)), so at s0 + vT it still brakes
  const v = 15, v0 = 30, sEq = CAR.s0 + v * CAR.T, sIdm = sEq / Math.sqrt(1 - Math.pow(v / v0, 4));
  assert.ok(Math.abs(iidm(v, v0, sEq, 0, CAR.a, CAR.b, CAR.T, CAR.s0)) < 1e-6, 'the IIDM sits at s0 + vT');
  assert.ok(idm(v, v0, sEq, 0, CAR.a, CAR.b, CAR.T, CAR.s0) < -0.05, 'the IDM brakes at s0 + vT');
  assert.ok(Math.abs(idm(v, v0, sIdm, 0, CAR.a, CAR.b, CAR.T, CAR.s0)) < 1e-6, 'the IDM sits at its own larger gap');
  assert.ok(iidm(v, v0, sIdm, 0, CAR.a, CAR.b, CAR.T, CAR.s0) > 0.02, 'the IIDM accelerates there');
  // free road: the ACC reaches the desired speed
  let sp = 0;
  for (let k = 0; k < 600; k++) sp = Math.max(0, sp + accACC(sp, 25, 1e6, sp, 0, CAR.a, CAR.b, CAR.T, CAR.s0) * DT);
  assert.ok(Math.abs(sp - 25) < 0.25, `free road ends at ${sp.toFixed(3)} m/s`);
  // the plain IDM here is the sim's model: the same numbers over a grid (the lead can swap the call, not the behaviour)
  for (const sv of [0, 4, 9, 15, 22, 30]) for (const gap of [1, 2.5, 8, 40, 200, Infinity]) for (const dv of [-6, -2, 0, 3, 7]) {
    const ours = idm(sv, 30, gap, dv, SIM_CAR.a, SIM_CAR.b, SIM_CAR.T, SIM_CAR.s0), theirs = simIdm(SIM_CAR, sv, 30, gap, dv);
    assert.ok(Math.abs(ours - theirs) < 1e-9, `idm(${sv}, ${gap}, ${dv}): ${ours} against ${theirs}`);
  }
  // the CAH alone: a stopped leader 50 m ahead needs -v^2/(2s); a leader 10 m/s faster asks for no braking
  assert.ok(Math.abs(cah(20, 50, 0, 0, CAR.a) + 4) < 1e-9, 'CAH against a stopped leader');
  assert.equal(cah(10, 30, 20, 0, CAR.a), 0, 'CAH behind a faster leader');
  // a stopped leader 120 m ahead: stop at about s0, never reverse
  let x = 0, vv = 20;
  for (let k = 0; k < 6000; k++) {
    const a = accACC(vv, 25, 120 - x, 0, 0, CAR.a, CAR.b, CAR.T, CAR.s0), vOld = vv;
    vv = Math.max(0, vv + a * DT); x += 0.5 * (vOld + vv) * DT;
    if (vv === 0 && k > 100) break;
  }
  const gap = 120 - x;
  assert.ok(vv < 0.05, `stopped, v ${vv.toFixed(3)} m/s`);
  assert.ok(gap >= CAR.s0 - 0.3 && gap <= CAR.s0 + 2, `stopped gap ${gap.toFixed(2)} m`);
  // above the desired speed the IIDM brakes, and at 2 v0 not harder than b
  const over = iidm(50, 25, Infinity, 0, CAR.a, CAR.b, CAR.T, CAR.s0);
  assert.ok(over < 0 && over >= -CAR.b - 1e-9, `at 2 v0: ${over.toFixed(3)} m/s^2`);
  console.log(`acc: at s0+vT ${sEq.toFixed(1)} m the IIDM holds ${iidm(v, v0, sEq, 0, CAR.a, CAR.b, CAR.T, CAR.s0).toFixed(4)} m/s^2, the IDM ${idm(v, v0, sEq, 0, CAR.a, CAR.b, CAR.T, CAR.s0).toFixed(3)} ` +
    `(its own equilibrium gap is ${sIdm.toFixed(2)} m); stopped gap ${gap.toFixed(2)} m; at 2 v0 ${over.toFixed(2)} m/s^2`);
});

test('acc: a cut-in by a faster car never brakes the ACC harder than the IDM', () => {
  let worst = Infinity, worstAt = '';
  for (const v of [8, 12, 16, 20, 24]) for (const dv of [1, 2, 3, 5, 8]) for (const s of [1.5, 2, 3, 5, 8, 12, 20]) for (const al of [-3, -1, 0, 1]) {
    const vl = v + dv; // a faster car has just cut in, dv = v - vl > 0 is a negative approaching rate
    const a = v > 0 ? accACC(v, 30, s, vl, al, CAR.a, CAR.b, CAR.T, CAR.s0) : 0;
    const i = iidm(v, 30, s, v - vl, CAR.a, CAR.b, CAR.T, CAR.s0), d = idm(v, 30, s, v - vl, CAR.a, CAR.b, CAR.T, CAR.s0);
    const m = Math.min(a - i, a - d);
    if (m < worst) { worst = m; worstAt = `v ${v}, vl ${vl}, s ${s}, al ${al}`; }
  }
  assert.ok(worst > -1e-6, `ACC below IDM by ${(-worst).toExponential(2)} at ${worstAt}`);
  // the paper's figure-3 cut-in (same speed 80 km/h, 10 m gap): the IDM hits its floor, the ACC stays near b
  const v0 = 80 / 3.6, cut = 10, aIdm = idm(v0, 120 / 3.6, cut, 0, 1.4, 2, 1.5, 2), aAcc = accACC(v0, 120 / 3.6, cut, v0, 0, 1.4, 2, 1.5, 2);
  assert.ok(aIdm < -8, `the IDM brakes at ${aIdm.toFixed(2)} m/s^2`);
  assert.ok(aAcc > -2.2 && aAcc < -1.8, `the ACC brakes at ${aAcc.toFixed(2)} m/s^2`);
  console.log(`acc: cut-in sweep (${5 * 5 * 7 * 4} cases), least ACC - IDM margin ${worst.toExponential(2)} (${worstAt}); ` +
    `80 km/h 10 m cut-in: IDM ${aIdm.toFixed(2)}, ACC ${aAcc.toFixed(2)} m/s^2 (b = 2)`);
});

/** a 1-lane ring: x m along the ring (increasing with travel), speed m/s, the previous accelerations (for the CAH's al) */
interface Ring { n: number; L: number; x: Float64Array; v: Float64Array; ac: Float64Array; next: Float64Array }

/** a ring of n vehicles, L m long, evenly spaced, all at vInit m/s */
function ring(n: number, L: number, vInit: number): Ring {
  const x = new Float64Array(n), v = new Float64Array(n);
  for (let i = 0; i < n; i++) { x[i] = (i * L) / n; v[i] = vInit; }
  return { n, L, x, v, ac: new Float64Array(n), next: new Float64Array(n) };
}

/** one step of the ring: every vehicle follows its leader (i + 1 mod n) with the ACC (or the plain IDM, acc = false),
 *  ballistic update, v >= 0 */
function stepRing(r: Ring, p: Params, dt: number, acc = true): void {
  const { n, L, x, v, ac, next } = r;
  for (let i = 0; i < n; i++) {
    const ld = i + 1 === n ? 0 : i + 1;
    let gap = x[ld]! - x[i]! - LEN;
    if (gap < 0) gap += L;
    next[i] = acc
      ? accACC(v[i]!, p.v0[i]!, gap, v[ld]!, ac[ld]!, p.a[i]!, p.b[i]!, p.T[i]!, p.s0[i]!)
      : idm(v[i]!, p.v0[i]!, gap, v[i]! - v[ld]!, p.a[i]!, p.b[i]!, p.T[i]!, p.s0[i]!);
  }
  for (let i = 0; i < n; i++) {
    const vn = Math.max(0, v[i]! + next[i]! * dt);
    x[i] = x[i]! + 0.5 * (v[i]! + vn) * dt;
    if (x[i]! >= L) x[i] = x[i]! - L;
    v[i] = vn; ac[i] = next[i]!;
  }
}

test('ring: a platoon of normal drivers is string-stable (a speed perturbation does not grow)', () => {
  const N = 20, v0 = 20, vE = 15, L = N * (CAR.s0 + vE * CAR.T + LEN);
  const d = new Drivers(11, { aggressive: 0, cautious: 0, truckShare: 0 });
  for (let i = 0; i < N; i++) d.assign(i, 'car');
  const p: Params = { v0: new Float32Array(N), a: d.a, b: d.b, T: d.T, s0: d.s0 };
  for (let i = 0; i < N; i++) p.v0[i] = v0 * d.v0f[i]!;
  const r = ring(N, L, vE);
  for (let k = 0; k < 1000; k++) stepRing(r, p, DT); // settle
  const meanV = r.v.reduce((s, x) => s + x, 0) / N;
  assert.ok(Math.abs(meanV - vE) < 2, `the ring settles at ${meanV.toFixed(2)} m/s, wanted ${vE}`);
  r.v[0] = r.v[0]! + 2; // the perturbation
  const lo = new Float64Array(N).fill(Infinity), hi = new Float64Array(N).fill(-Infinity);
  for (let k = 0; k < 3000; k++) {
    stepRing(r, p, DT);
    for (let i = 0; i < N; i++) { lo[i] = Math.min(lo[i]!, r.v[i]!); hi[i] = Math.max(hi[i]!, r.v[i]!); }
  }
  const amp = Array.from({ length: N }, (_, i) => hi[i]! - lo[i]!);
  const first = amp[0]!, last = amp[N - 1]!, most = Math.max(...amp.slice(1));
  assert.ok(first > 1, `the perturbation shows: ${first.toFixed(3)} m/s`);
  assert.ok(most < 0.6 * first, `a follower's speed amplitude of ${most.toFixed(3)} m/s against the perturbed car's ${first.toFixed(3)}`);
  console.log(`ring: ${N} normal cars, ${L.toFixed(0)} m ring at ${meanV.toFixed(2)} m/s; speed amplitude after 2 m/s on car 0: ` +
    `car 0 ${first.toFixed(3)}, car 10 ${amp[10]!.toFixed(3)}, car ${N - 1} ${last.toFixed(3)} m/s (most ${most.toFixed(3)})`);
});

/** the flow of n vehicles on an L m lane with the drivers' mix, veh/h: a settle run, then the mean speed of the last 100 s;
 *  acc = false runs the same drivers on the plain IDM (the sim's model today) for the capacity comparison */
function laneFlow(n: number, L: number, mix: { aggressive: number; cautious: number; truckShare: number }, seed: number, acc = true): number {
  const d = new Drivers(seed, mix), vlim = 25;
  for (let i = 0; i < n; i++) d.assignAuto(i);
  const p: Params = { v0: new Float32Array(n), a: d.a, b: d.b, T: d.T, s0: d.s0 };
  let s0 = 0, Tm = 0;
  for (let i = 0; i < n; i++) { p.v0[i] = vlim * d.v0f[i]!; s0 += d.s0[i]!; Tm += d.T[i]!; }
  s0 /= n; Tm /= n;
  const spacing = L / n, vInit = Math.max(0.5, Math.min(0.8 * vlim, (spacing - LEN - s0) / Tm));
  const r = ring(n, L, vInit);
  for (let k = 0; k < 2000; k++) stepRing(r, p, DT, acc); // 200 s to settle (a jam may form)
  let sum = 0, steps = 0;
  for (let k = 0; k < 1000; k++) {
    stepRing(r, p, DT, acc);
    for (let i = 0; i < n; i++) sum += r.v[i]!;
    steps++;
  }
  return ((n * sum) / (steps * n) / L) * 3600; // veh/h per lane
}

test('fundamental diagram: flow rises to a capacity then falls; the mix\'s lane capacity in veh/h', () => {
  const L = 2000, mix = { aggressive: 0.2, cautious: 0.3, truckShare: 0.1 };
  const dens = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90, 100];
  const flows = dens.map((q) => laneFlow(Math.round((q * L) / 1000), L, mix, 5));
  const cap = Math.max(...flows), capAt = dens[flows.indexOf(cap)]!;
  const idmFlows = dens.map((q) => laneFlow(Math.round((q * L) / 1000), L, mix, 5, false));
  const idmCap = Math.max(...idmFlows), idmAt = dens[idmFlows.indexOf(idmCap)]!;
  assert.ok(cap > idmCap, `the ACC's capacity ${cap.toFixed(0)} against the IDM's ${idmCap.toFixed(0)}`);
  assert.ok(cap > 1500 && cap < 3000, `capacity ${cap.toFixed(0)} veh/h`);
  assert.ok(flows[flows.length - 1]! < 0.7 * cap, `at ${dens[dens.length - 1]} veh/km the flow is ${flows[flows.length - 1]!.toFixed(0)} veh/h`);
  assert.ok(flows[0]! < cap, 'the free-flow branch is below the capacity');
  assert.ok(flows.indexOf(cap) > 0 && flows.indexOf(cap) < flows.length - 1, 'the peak is inside the sweep');
  console.log(`fundamental diagram: lane ${L} m, vlim 25 m/s, mix 20% aggressive / 30% cautious / 10% trucks`);
  console.log('  density veh/km/lane: ' + dens.map((q) => String(q).padStart(4)).join(' '));
  console.log('  flow veh/h/lane:     ' + flows.map((f) => String(Math.round(f)).padStart(4)).join(' '));
  console.log(`  capacity ${cap.toFixed(0)} veh/h per lane at ${capAt} veh/km/lane (the plain IDM for the same drivers: ${idmCap.toFixed(0)} at ${idmAt}; ` +
    `${(100 * (cap / idmCap - 1)).toFixed(1)}% more)`);
});

test('shoulder: only an impatient driver behind a queue with the slip lane within 80 m wants it', () => {
  const d = new Drivers(2, { aggressive: 0.2, cautious: 0.3, truckShare: 0 });
  d.ensure(10);
  for (let i = 0; i < 10; i++) d.assign(i, 'car');
  d.impatience[0] = 10; d.impatience[1] = 60; // a patient driver in the same situation
  assert.equal(d.wantsShoulder(0, 30, 5, 40), true, 'impatient, queued, slip lane near');
  assert.equal(d.wantsShoulder(1, 30, 5, 40), false, 'patient driver waits');
  assert.equal(d.wantsShoulder(0, 9, 5, 40), false, 'under its patience');
  assert.equal(d.wantsShoulder(0, 30, SHOULDER_QUEUE - 1, 40), false, 'queue too short');
  assert.equal(d.wantsShoulder(0, 30, 5, SHOULDER_M + 1), false, 'slip lane too far');
  assert.equal(d.wantsShoulder(0, 30, 5, -1), false, 'no slip lane');
  assert.equal(d.wantsShoulder(0, 1000, 50, 1), true, 'still true after a long wait');
  assert.equal(d.wantsShoulder(99, 1000, 50, 1), false, 'an unassigned slot makes no decision');
  // the share of drivers wanting it grows with the wait: at 30 s the impatient styles are over-represented
  let yes = 0;
  for (let i = 0; i < 10; i++) if (d.wantsShoulder(i, 30, 5, 40)) yes++;
  assert.ok(yes > 0 && yes < 10, `${yes} of 10 drivers want the shoulder at 30 s`);
  console.log(`shoulder: ${yes} of 10 drivers want the shoulder after 30 s behind ${5} cars with a slip lane 40 m ahead (limit ${SHOULDER_M} m, queue ${SHOULDER_QUEUE})`);
});

test('accACC is allocation-free and fast (ns per call)', () => {
  let sum = 0;
  for (let i = 0; i < 200000; i++) sum += accACC(10 + (i & 7), 25, 12 + (i & 15), 14, 0, CAR.a, CAR.b, CAR.T, CAR.s0); // warm up
  const N = 1000000, before = process.memoryUsage().heapUsed, t0 = performance.now();
  for (let i = 0; i < N; i++) sum += accACC(10 + (i & 7), 25, 12 + (i & 15), 14, i & 1 ? 0 : -2, CAR.a, CAR.b, CAR.T, CAR.s0);
  const ms = performance.now() - t0, grew = process.memoryUsage().heapUsed - before, ns = (ms * 1e6) / N;
  assert.ok(Number.isFinite(sum) && sum !== 0);
  assert.ok(ns < 250, `${ns.toFixed(1)} ns per call`);
  assert.ok(grew < 8 * 1024 * 1024, `the heap grew ${(grew / 1024).toFixed(0)} KiB over ${N} calls`);
  console.log(`acc: ${ns.toFixed(1)} ns per accACC call (${N} calls in ${ms.toFixed(0)} ms), heap ${grew >= 0 ? '+' : ''}${(grew / 1024).toFixed(0)} KiB`);
});
