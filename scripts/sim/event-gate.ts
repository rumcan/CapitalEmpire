// The event gate (Phase 5 gate, headless): one Level 1 round per scenario on the seed's valley (harness.ts setupTowns), after 120 s of everyday traffic.
// A (naive): the hub build with road links, a 6-booth toll gate on each link that has room, the two car parks, no bus; the round is stepped to its eval
// and the treasury must move by the toll + tickets + payout - upkeep (within $1). B (fix and replay, the same city as A): the first card offered is taken and the
// round closed; then each town whose late cars at A's kick-off are at least 20% of its sent cars is fixed: its spine (the grid's two middle lines through
// the node nearest its centre, out to the grid's last nodes within 200 tiles) widened to arterials, an arterial bypass from its spine end nearest the hub end to
// the hub end, and its link road to the hub widened one class (the
// straight run of each leg, toll plazas excepted); kinds and styles kept, paid as the add-lane tool pays; then the next round. C (100% reachable, a fresh
// city): the generous build (each town's spine widened to arterials, its own feeder and car park on the stadium side facing it), no tolls, no bus.
// Pass (a): A reached the eval with a result and its money reconciles (toll + parking + tickets + payout - upkeep: the parking fees are paid into
// the treasury while the round runs, City.parkFee a car, and RoundResult.parking books them). Pass (b): the arrival rate of the towns B fixed is at
// least A's + LIFT (0.05) for the same towns. Pass (c): every car of C is parked (none late, lost, turned away or stranded) and its rate is at least
// C_RATE (0.99). Pass (d): over the three surges, the sim's time per sim step (stepMs / 10) has a mean of at most 2.5 ms and a max of at most 25 ms.
// Prints one RESULT line per scenario and a line per check; writes output/sim/event-gate.json. Exit code 1 when a check fails.
//   npm run event:gate -- [seed = 1]
// The bars (retuned 2026-10-26, issue #285, to the three-town growth of 78e5472: the towns grow along the paved roads while the rounds run, 6 lots an
// hour, so the corridors carry more everyday traffic than when the gate was born at 72513dd, where B was +10.8 points on all towns and C 100%):
// - (b) is measured on the towns B fixed, because the fix is theirs: at seed 1 it doubles town 2's fans (36 to 72) and lifts the fixed towns from 32.5%
//   to 42.8% (+10.3), while all towns move 45.8% to 52.5% (+6.7; +4 to +9 at every commit since 78e5472). The rest of the lift is capped by what the
//   fix leaves alone by design: the two fixed corridors merge at (520, 848) and (640, 848) onto one stretch to the west hub end, through town 0's 6-booth
//   plaza, onto the 2-lane hub road that fronts the car parks (12 booths would give +10.0 on all towns; redrawing the hub road drops the parks). The bar
//   is half the measured lift, so the corridor fix has to show and the hub end's noise cannot fail it.
// - (c) asks every car in rather than every fan: at seed 1 the last 2 cars of town 2 (the farthest town: its last departures leave the grid 150 s after
//   their time and drive 1.2 km) park at +595 s of the 600 s surge and their 6 fans are on the path from the bay at kick-off (99.17%). That is the
//   round's close cutting a walk, not a road: C's build is still 100% reachable, which the unparked count checks; 0.99 leaves 2.4 cars' fans of 240 walking.
import fs from 'node:fs';
import path from 'node:path';
import { PARTY, PERFECT_RATE } from '../../src/game/event/config';
import { buildPark, type CarParkDef } from '../../src/game/event/carpark';
import type { RoundResult } from '../../src/game/event/round';
import type { TollDef } from '../../src/game/event/toll';
import { TOWN_POP } from '../../src/game/lots/seedtowns';
import { straightChain } from '../../src/game/netops';
import { CLASS, SK, WIDER, cross, sub, vlen, type ClassId, type Leg, type Pt, type RoadNetwork, type Seg } from '../../src/game/network';
import { STRUCT_COST, splitByTerrain } from '../../src/game/structures';
import { setupTowns, stepSecond } from './harness';
import { LINK, buildGenerous, lay, newMeter, runRound, type Meter, type Towns } from './builds';

const seed = Number(process.argv[2] ?? 1);
/** the everyday traffic before each round (sim s), the link class of the hub and the towns, the booths of a toll gate, the shortest last straight leg
 *  that takes a gate (tiles), the share of a town's sent cars that are late at A's kick-off that gets the town fixed, the rate B must beat A by, the
 *  money's tolerance ($), the budgets (ms per sim step: the mean and the max) */
const BASELINE_S = 120, BOOTHS = 6, TOLL_MIN = 90, LATE_SHARE = 0.2, LIFT = 0.05, MONEY_TOL = 1, MEAN_MS = 2.5, MAX_MS = 25;
/** pass (c): the least share of C's fans at the doors at kick-off, once every car is parked (the fans of the last cars parked can still be walking) */
const C_RATE = 0.99;
/** a float comparison's slack (rates are fans over fans: a lift of exactly LIFT must pass) */
const EPS = 1e-9;
/** a seg to upgrade and the class it goes to */
interface Pair { s: Seg; to: ClassId }
/** a fix B made to a town: the town (its index), the part (its spine, or its link road), the segs upgraded, the cost paid ($), and the note */
interface FixLog { town: number; part: 'spine' | 'bypass' | 'link'; segs: number; cost: number; note: string }

/** the hub build (the reference's default): a road 40 tiles south of the stadium, 60 tiles past each side; each town links from its nearest node (within
 *  200 tiles) to the nearer end of the hub by an elbow (its link's points returned per town, [] when it has none); with tolls, a gate of BOOTHS booths
 *  40 to 70 tiles before the hub end on each link of TOLL_MIN tiles or more; the two car parks (the stadium's south side, and the hub's) */
function buildHub(H: Towns, withTolls: boolean): { tolls: TollDef[]; parks: CarParkDef[]; links: Pt[][] } {
  const city = H.city, site = city.site!, hw = Math.ceil(CLASS[LINK].h + CLASS[LINK].walk);
  const hy = site.y + site.h + 40, hx0 = site.x - 60, hx1 = site.x + site.w + 60;
  lay(H, [{ x: hx0, y: hy }, { x: hx1, y: hy }], LINK);
  const tolls: TollDef[] = [], links: Pt[][] = []; let tid = 1;
  for (const c of H.centres) {
    const end: Pt = Math.abs(c.x - hx0) < Math.abs(c.x - hx1) ? { x: hx0, y: hy } : { x: hx1, y: hy };
    let best: Pt | null = null, bd = Infinity;
    for (const n of city.net.nodes.values()) { if (Math.hypot(n.x - c.x, n.y - c.y) > 200) continue; const d = Math.hypot(n.x - end.x, n.y - end.y); if (d < bd) { bd = d; best = { x: n.x, y: n.y }; } }
    const pts: Pt[] = [];
    if (best) {
      const elbow: Pt = { x: best.x, y: end.y };
      pts.push(best, elbow, end);
      lay(H, pts, LINK);
      const L = Math.abs(end.x - elbow.x);
      if (withTolls && L >= TOLL_MIN) { const u = Math.sign(end.x - elbow.x); tolls.push({ id: tid++, ax: end.x - u * 70, ay: hy, bx: end.x - u * 40, by: hy, booths: BOOTHS }); }
    }
    links.push(pts);
  }
  city.netOps(H.editor.commit());
  // the plazas: drawn over their road piece so the road splits at A and B
  for (const t of tolls) H.editor.addLegs([{ a: { x: t.ax, y: t.ay }, b: { x: t.bx, y: t.by } }], CLASS[LINK], 0, [SK.GROUND]);
  city.netOps(H.editor.commit());
  city.setTolls(tolls);
  const top = site.y + site.h + 3;
  const parks: CarParkDef[] = [{ id: 1, x: site.x, y: top, w: site.w, h: hy - hw - 1 - top }, { id: 2, x: site.x - 20, y: hy + hw + 1, w: site.w + 40, h: 60 }];
  city.setParks(parks);
  return { tolls, parks, links };
}

/** the treasury's move over a round against its books: toll + parking + tickets + payout - upkeep (the parking fees are booked while the round runs,
 *  City.parkFee per car parked, and are not in the result's net) */
function reconcile(r: RoundResult | null, before: number, after: number) {
  const delta = after - before, expect = r ? (r.toll ?? 0) + (r.parking ?? 0) + (r.tickets ?? 0) + r.payout - r.upkeep : NaN;
  return { before: Math.round(before), after: Math.round(after), delta: Math.round(delta * 100) / 100, expect: Math.round(expect * 100) / 100, ok: !!r && Math.abs(delta - expect) <= MONEY_TOL };
}

/** the seg of net that runs parallel to d through m (within half a tile, m on the seg), or null */
function segAt(net: RoadNetwork, m: Pt, d: Pt): Seg | null {
  const dl = vlen(d);
  for (const s of net.segs) {
    const e = sub(s.b, s.a), el = vlen(e);
    if (el === 0 || Math.abs(cross(e, d)) > 0.01 * el * dl) continue;
    if (Math.abs(cross(e, sub(m, s.a))) / el > 0.5) continue;
    const t = ((m.x - s.a.x) * e.x + (m.y - s.a.y) * e.y) / (el * el);
    if (t >= 0 && t <= 1) return s;
  }
  return null;
}

/** upgrades the pairs' segs in place (each seg's ends, kind and style kept; the network rebuilt), paid as the add-lane tool pays (length x class cost x
 *  structure cost, rounded) and returned as the fix's log */
function apply(H: Towns, town: number, part: FixLog['part'], pairs: Pair[]): FixLog {
  if (!pairs.length) return { town, part, segs: 0, cost: 0, note: 'nothing to widen' };
  let raw = 0;
  for (const p of pairs) raw += vlen(sub(p.s.b, p.s.a)) * CLASS[p.to].cost * STRUCT_COST[p.s.kind];
  const cost = Math.round(raw);
  for (const p of pairs) H.editor.addLegs([{ a: p.s.a, b: p.s.b }], CLASS[p.to], p.s.style, [p.s.kind]);
  H.city.netOps(H.editor.commit()); H.city.spend('construction', cost);
  return { town, part, segs: pairs.length, cost, note: `to ${[...new Set(pairs.map(p => p.to))].join(', ')}` };
}

/** a town's spine: the grid node nearest its centre (row), its row and column out to the grid's last nodes within 200 tiles (x0..x1 on the row, y0..y1 on the column) */
interface Spine { row: Pt; x0: number; x1: number; y0: number; y1: number }
function spineOf(H: Towns, k: number): Spine | null {
  const city = H.city, c = H.centres[k]!;
  let cn: Pt | null = null, cd = Infinity;
  for (const n of city.net.nodes.values()) { const d = Math.hypot(n.x - c.x, n.y - c.y); if (d < cd) { cd = d; cn = { x: n.x, y: n.y }; } }
  if (!cn) return null;
  const row: Pt = cn;
  const xs = [...city.net.nodes.values()].filter(n => n.y === row.y && Math.abs(n.x - c.x) <= 200).map(n => n.x);
  const ys = [...city.net.nodes.values()].filter(n => n.x === row.x && Math.abs(n.y - c.y) <= 200).map(n => n.y);
  return { row, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** town k's spine widened: the segs on its row and column (see spineOf) go to arterial; the grid's middle lines are avenues (2 lanes), so they go up to
 *  arterials (4 lanes); arterials and boulevards stay */
function fixSpine(H: Towns, k: number, sp: Spine | null): FixLog {
  if (!sp) return { town: k, part: 'spine', segs: 0, cost: 0, note: 'no grid node' };
  const { row, x0, x1, y0, y1 } = sp, pairs: Pair[] = [];
  for (const s of H.city.net.segs) {
    const onRow = s.a.y === s.b.y && s.a.y === row.y && Math.min(s.a.x, s.b.x) >= x0 && Math.max(s.a.x, s.b.x) <= x1;
    const onCol = s.a.x === s.b.x && s.a.x === row.x && Math.min(s.a.y, s.b.y) >= y0 && Math.max(s.a.y, s.b.y) <= y1;
    if ((onRow || onCol) && s.cls.id !== 'arterial' && s.cls.id !== 'boulevard') pairs.push({ s, to: 'arterial' });
  }
  return apply(H, k, 'spine', pairs);
}

/** the bypass, as the reference's spine mode: an arterial L from the spine end nearest the town's hub end (the four ends: the row's two and the column's
 *  two) to that hub end; vertical first when the spine end is a column's end, else horizontal first; split by terrain (bridges and tunnels as their
 *  kinds); built with the editor and paid as the road tool pays (length x class cost x structure cost, rounded) */
function fixBypass(H: Towns, k: number, sp: Spine | null, end: Pt | undefined): FixLog {
  if (!sp || !end) return { town: k, part: 'bypass', segs: 0, cost: 0, note: 'no spine or no hub end' };
  const cands = [
    { p: { x: sp.x0, y: sp.row.y }, vert: false }, { p: { x: sp.x1, y: sp.row.y }, vert: false },
    { p: { x: sp.row.x, y: sp.y0 }, vert: true }, { p: { x: sp.row.x, y: sp.y1 }, vert: true },
  ];
  const st = cands.reduce((p, q) => (Math.hypot(q.p.x - end.x, q.p.y - end.y) < Math.hypot(p.p.x - end.x, p.p.y - end.y) ? q : p));
  const corner: Pt = st.vert ? { x: st.p.x, y: end.y } : { x: end.x, y: st.p.y };
  const legs0: Leg[] = [{ a: st.p, b: corner }, { a: corner, b: end }].filter(l => vlen(sub(l.b, l.a)) > 0);
  const { legs, kinds } = splitByTerrain(legs0, CLASS.arterial.h + CLASS.arterial.walk, H.cls);
  let len = 0, raw = 0;
  for (let i = 0; i < legs.length; i++) { const l = vlen(sub(legs[i]!.b, legs[i]!.a)); len += l; raw += l * CLASS.arterial.cost * STRUCT_COST[kinds[i]!]; }
  if (!legs.length) return { town: k, part: 'bypass', segs: 0, cost: 0, note: 'no length' };
  const cost = Math.round(raw);
  H.editor.addLegs(legs, CLASS.arterial, 0, kinds);
  H.city.netOps(H.editor.commit()); H.city.spend('construction', cost);
  return { town: k, part: 'bypass', segs: legs.length, cost, note: `arterial bypass ${len.toFixed(0)} tiles (${(2 * len).toFixed(0)} m) from (${st.p.x.toFixed(0)}, ${st.p.y.toFixed(0)}) to the hub end` };
}

/** town k's link road: each leg of its link (town node, elbow, hub end) takes the seg parallel to it through its middle, and that seg's straight run
 *  (toll plazas excepted) goes up one class (WIDER: road to arterial) */
function fixLink(H: Towns, k: number, legs: Pt[], tolls: Set<Seg>): FixLog {
  const pairs: Pair[] = [], seen = new Set<Seg>();
  for (let i = 1; i < legs.length; i++) {
    const a = legs[i - 1]!, b = legs[i]!, d = sub(b, a), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const s = segAt(H.city.net, m, d);
    if (!s) continue;
    for (const x of straightChain(s, y => tolls.has(y))) { const to = WIDER[x.cls.id]; if (to && !seen.has(x)) { seen.add(x); pairs.push({ s: x, to }); } }
  }
  return apply(H, k, 'link', pairs);
}

/** the segs that are toll plazas (their ends match a gate's) */
function tollSet(H: Towns, tolls: TollDef[]): Set<Seg> {
  const out = new Set<Seg>();
  for (const s of H.city.net.segs) for (const t of tolls) if ((s.a.x === t.ax && s.a.y === t.ay && s.b.x === t.bx && s.b.y === t.by) || (s.a.x === t.bx && s.a.y === t.by && s.b.x === t.ax && s.b.y === t.ay)) out.add(s);
  return out;
}

console.log(`[event] seed ${seed}: 120 s of everyday traffic, then a Level 1 round per scenario (A naive, B fixes the corridors of the towns with late cars and replays, C generous)`);
const scen: Record<string, unknown> = {};

// A: the naive hub build, the first round
const HA = setupTowns(seed, TOWN_POP);
const hub = buildHub(HA, true);
let s = 1;
for (; s <= BASELINE_S; s++) stepSecond(HA, s);
const mA = newMeter();
const A = runRound(HA, s, mA); s = A.s;
const rA = A.r, moneyA = reconcile(rA, A.before, A.after);
console.log(line('A naive', rA, mA));
if (rA) console.log(`[A] stuck ${JSON.stringify(rA.stuck.map(i => [i.label, Math.round(i.x), Math.round(i.y), Math.round(i.loss)]))}`);
console.log(`[A] parks ${hub.parks.map(d => { const p = buildPark(HA.city.net, d); return `${p?.bays.length ?? 0} bays/${p?.entrances.length ?? 0} entrances`; }).join(', ')}; tolls ${hub.tolls.length} x ${BOOTHS} booths`);
console.log(`[A] treasury $${moneyA.before} → $${moneyA.after}: moved $${moneyA.delta}, toll + parking + tickets + payout - upkeep $${moneyA.expect}`);
scen.A = { rate: rA?.rate ?? null, sent: rA?.sent ?? null, arrived: rA?.arrived ?? null, toll: rA?.toll ?? 0, payout: rA?.payout ?? null, upkeep: rA?.upkeep ?? null, net: rA?.net ?? null,
  byTown: rA?.byTown ?? [], stuck: rA?.stuck ?? [], money: moneyA, surge: mA, parks: hub.parks.length, tolls: hub.tolls.length };

// the towns whose late cars at A's kick-off are at least LATE_SHARE of their sent cars: B fixes their corridors
const shares = (rA?.byTown ?? []).map((t, k) => ({ town: k, late: t.late, sent: t.sent, share: t.sent > 0 ? t.late / t.sent : 0, fixed: t.sent > 0 && t.late / t.sent >= LATE_SHARE }));
for (const x of shares) console.log(`[A] town ${x.town}: late ${x.late} of ${x.sent} sent (${(100 * x.share).toFixed(0)}%), ${x.fixed ? 'to fix' : 'left alone'}`);

// B: the same city after A's round: the first card, the round closed, the late towns' corridors fixed, the next round
const city = HA.city;
const draft = city.round.draft;
const card = draft?.length ? draft[0]! : null;
const picked = card ? city.pickCard(card) : false;
const closed = picked && city.closeRound();
console.log(`[B] card ${card ?? 'none offered'} ${picked ? 'taken' : 'not taken'}; round ${closed ? 'closed' : 'not closed'}`);
const fixes: FixLog[] = [];
if (rA && closed) {
  const ts = tollSet(HA, hub.tolls);
  for (const x of shares) if (x.fixed) {
    // the spine widened, then its bypass to the hub end, then the old link's straight runs widened (the old link stays: two exits)
    const legs = hub.links[x.town] ?? [], sp = spineOf(HA, x.town);
    fixes.push(fixSpine(HA, x.town, sp));
    fixes.push(fixBypass(HA, x.town, sp, legs[legs.length - 1]));
    fixes.push(fixLink(HA, x.town, legs, ts));
  }
}
for (const f of fixes) console.log(`[B] town ${f.town} ${f.part}: ${f.segs} segs (${f.note}), cost $${f.cost}`);
const fixedTowns = shares.filter(x => x.fixed).map(x => x.town);
const mB = newMeter();
const B = closed ? runRound(HA, s, mB) : { s, r: null, before: city.budget.money, after: city.budget.money };
s = B.s;
const rB = B.r, moneyB = reconcile(rB, B.before, B.after);
console.log(line('B fixed', rB, mB));
if (rB) console.log(`[B] stuck ${JSON.stringify(rB.stuck.map(i => [i.label, Math.round(i.x), Math.round(i.y), Math.round(i.loss)]))}`);
console.log(`[B] towns fixed: ${fixedTowns.length ? fixedTowns.join(', ') : 'none'}`);
scen.B = { card, closed, shares, fixedTowns, fixes, rate: rB?.rate ?? null, sent: rB?.sent ?? null, arrived: rB?.arrived ?? null, toll: rB?.toll ?? 0, payout: rB?.payout ?? null, upkeep: rB?.upkeep ?? null, net: rB?.net ?? null,
  byTown: rB?.byTown ?? [], stuck: rB?.stuck ?? [], money: moneyB, surge: mB };

// C: a fresh city, the generous build, one round
const HC = setupTowns(seed, TOWN_POP);
const parksC = buildGenerous(HC);
let sc = 1;
for (; sc <= BASELINE_S; sc++) stepSecond(HC, sc);
const mC = newMeter();
const C = runRound(HC, sc, mC);
const rC = C.r, moneyC = reconcile(rC, C.before, C.after);
console.log(line('C generous', rC, mC));
if (rC) console.log(`[C] stuck ${JSON.stringify(rC.stuck.map(i => [i.label, Math.round(i.x), Math.round(i.y), Math.round(i.loss)]))}`);
console.log(`[C] parks ${parksC.map(d => { const p = buildPark(HC.city.net, d); return `${p?.bays.length ?? 0} bays/${p?.entrances.length ?? 0} entrances`; }).join(', ')}`);
scen.C = { rate: rC?.rate ?? null, sent: rC?.sent ?? null, arrived: rC?.arrived ?? null, toll: rC?.toll ?? 0, payout: rC?.payout ?? null, upkeep: rC?.upkeep ?? null, net: rC?.net ?? null,
  byTown: rC?.byTown ?? [], stuck: rC?.stuck ?? [], money: moneyC, surge: mC, parks: parksC.length };

// the checks
const all = newMeter(); for (const m of [mA, mB, mC]) { all.n += m.n; all.sum += m.sum; all.max = Math.max(all.max, m.max); all.peak = Math.max(all.peak, m.peak); all.peakParty = Math.max(all.peakParty, m.peakParty); }
const meanMs = all.sum / Math.max(1, all.n);
const passA = !!rA && moneyA.ok;
// (b) on the towns B fixed: their fans at the doors over their fans sent, A against B (the towns left alone are not the fix's)
const fixedRate = (r: RoundResult | null) => { if (!r) return null; let f = 0, s = 0; for (const k of fixedTowns) { const t = r.byTown[k]; if (t) { f += t.fans; s += t.sent * PARTY; } } return s > 0 ? f / s : null; };
const fixedA = fixedRate(rA), fixedB = fixedRate(rB);
const passB = fixedA !== null && fixedB !== null && fixedB >= fixedA + LIFT - EPS;
// (c): every car of C parked (none late, lost, turned away or stranded), and the fans at the doors at least C_RATE
const unparked = (r: RoundResult | null) => (r ? r.byTown.reduce((n, t) => n + t.late + t.lost + t.turned + t.stranded, 0) : -1);
const passC = !!rC && unparked(rC) === 0 && rC.rate >= C_RATE - EPS;
const passD = all.n > 0 && meanMs <= MEAN_MS && all.max <= MAX_MS;
const pc = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${(100 * v).toFixed(2)}%`);
console.log(`(a) ${passA ? 'PASS' : 'FAIL'}: A reached its eval (rate ${pc(rA?.rate)}); the treasury moved $${moneyA.delta} against toll + parking + tickets + payout - upkeep = $${moneyA.expect} (within $${MONEY_TOL})`);
console.log(`(b) ${passB ? 'PASS' : 'FAIL'}: the fixed towns' rate ${pc(fixedB)} against A's ${pc(fixedA)} (needs at least +${(LIFT * 100).toFixed(0)} points); towns fixed ${fixedTowns.length ? fixedTowns.join(', ') : 'none'}; ` +
  `all towns: B ${pc(rB?.rate)} against A ${pc(rA?.rate)}`);
console.log(`(c) ${passC ? 'PASS' : 'FAIL'}: C's rate ${pc(rC?.rate)} (needs at least ${(C_RATE * 100).toFixed(2)}%) with ${rC ? unparked(rC) : '-'} cars not parked (needs 0); perfect (${(PERFECT_RATE * 100).toFixed(2)}%): ${rC?.perfect ? 'yes' : 'no'}`);
console.log(`(d) ${passD ? 'PASS' : 'FAIL'}: sim time per step mean ${meanMs.toFixed(2)} ms (needs at most ${MEAN_MS}), max ${all.max.toFixed(2)} ms (needs at most ${MAX_MS}) over ${all.n} surge steps; cars alive at peak ${all.peak} (party ${all.peakParty})`);
const pass = passA && passB && passC && passD;
const out = {
  seed, baselineS: BASELINE_S, scenarios: scen,
  checks: { a: passA, b: passB, c: passC, d: passD }, lift: { fixedA, fixedB, allA: rA?.rate ?? null, allB: rB?.rate ?? null, bar: LIFT }, cRate: { rate: rC?.rate ?? null, unparked: rC ? unparked(rC) : null, bar: C_RATE }, budget: { steps: all.n, meanMs, maxMs: all.max, carsAlivePeak: all.peak, partyPeak: all.peakParty, limits: { meanMs: MEAN_MS, maxMs: MAX_MS } },
  pass,
};
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'event-gate.json'), JSON.stringify(out, null, 1));
console.log(`[event] ${pass ? 'PASS' : 'FAIL'}: wrote output/sim/event-gate.json`);
process.exitCode = pass ? 0 : 1;

/** one scenario's line: the result (rate, fans, the money, the towns, the stuck list) and its surge timing */
function line(name: string, r: RoundResult | null, m: Meter): string {
  if (!r) return `[${name}] RESULT no round (it did not start or reach its eval)`;
  const towns = r.byTown.map(t => `${t.fans}/${t.sent * PARTY} lost ${t.lost} late ${t.late}`).join(' | ');
  return `[${name}] RESULT ${(100 * r.rate).toFixed(2)}% fans ${r.arrived}/${r.sent * PARTY} toll $${r.toll ?? 0} payout $${r.payout} upkeep $${Math.round(r.upkeep)} net $${Math.round(r.net)} | ${towns} | ` +
    `surge ${m.n} steps, ${(m.sum / Math.max(1, m.n)).toFixed(2)} ms/step mean, ${m.max.toFixed(2)} max, cars alive at peak ${m.peak} (party ${m.peakParty})`;
}
