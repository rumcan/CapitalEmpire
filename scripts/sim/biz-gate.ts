// The Phase B gate (docs/BUSINESSES.md step B.7, headless): a scripted player on the seed's valley (harness.ts setupTowns) over D game days. The stadium
// goes on the game's suggested spot and is paid for; the generous build's roads and car parks are paid for. Each day: the everyday traffic to 17:00, the
// Level 1 round (the first card of the draft in PREF order is taken, then the round is closed), the everyday traffic past midnight (the businesses' day
// close), then at most one spin-off built: the first type in BUILD_ORDER that the unlocks open, none of its kind owned, and the treasury keeps RESERVE
// after its cost; it stands beside a road joined to the stadium (findSpot). Pass (a): the treasury is never below $0 at a day's record. Pass (b): at least
// 3 spin-offs built. Pass (c): at least 4 types other than the stadium unlocked at the end. Pass (d): over the rounds, the sim's time per sim step
// (stepMs / 10) has a mean of at most 2.5 ms and a max of at most 25 ms. Prints one line per day and a line per check; writes output/sim/biz-gate.json.
// Exit code 1 when a check fails.
//   npm run biz:gate -- [seed = 1] [days = 30]
import type { Ledger } from '../../src/game/budget';
import type { BusRouteDef } from '../../src/game/event/bus';
import { BUS_ROUTE_COST, BUS_SEATS } from '../../src/game/event/config';
import fs from 'node:fs';
import path from 'node:path';
import { type CarParkDef, parkCost } from '../../src/game/event/carpark';
import type { CardId } from '../../src/game/event/config';
import { siteAt, siteWhy } from '../../src/game/event/site';
import { BUSINESS, unlockedBy, type BusinessId } from '../../src/game/business/catalogue';
import { ownedOf, type BizDef, type BizView } from '../../src/game/business/state';
import { TOWN_POP } from '../../src/game/lots/seedtowns';
import { reachableSegs } from '../../src/game/lots/roads';
import { LV } from '../../src/game/lots/town';
import { SK, type Pt, type RoadNetwork, type Seg } from '../../src/game/network';
import { DAY, HOUR, setupTowns, stepSecond } from './harness';
import { buildGenerous, meter, netValue, newMeter, runRound, type Towns } from './builds';

const seed = Number(process.argv[2] ?? 1), D = Math.max(1, Math.round(Number(process.argv[3] ?? 30)));
/** the day's clock (the round's hour: the build and the kick-off, the clock jumps to the event's 18:00; the day close, s past midnight), the treasury kept
 *  after a spin-off's cost ($), the spacing of a spot's candidates along a road (tiles), the most candidates tried per spot, the most sim seconds a wait
 *  may take, the spin-off count and the unlocked types the checks need, the budgets (ms per sim step: the mean and the max) */
const ROUND_HOUR = 17, CLOSE_S = 5, RESERVE = 60000, SPOT_STEP = 6, MAX_CANDIDATES = 20000, MAX_STEPS = 2 * DAY, MIN_BUILDS = 3, MIN_UNLOCKS = 4, MEAN_MS = 2.5, MAX_MS = 25;
/** the card preference: the first of these in the draft is taken (else the draft's first) */
const PREF: CardId[] = ['express', 'season', 'promo', 'booths', 'doubledecker', 'buses', 'roundabout'];
/** the order the player builds the spin-offs in (one of each kind, when the unlocks and the treasury allow) */
const BUILD_ORDER: BusinessId[] = ['sportsbar', 'buscompany', 'diner', 'taxi', 'golf', 'fishing', 'tackle', 'motel', 'casino', 'hotel', 'estate'];

/** a round's figures as the day record keeps them (tickets and toll 0 when there are none) */
interface RoundRec { level: number; rate: number; arrived: number; tickets: number; toll: number; payout: number; upkeep: number; net: number; perfect: boolean }
/** a business as the day record keeps it: its id, type, level, satisfaction (2 dp), good days, revenue and its today's figures */
interface BizRec { id: number; type: BusinessId; level: number; sat: number; goodDays: number; revenue: number; today: BizView['today'] }
/** a build made that day: its type, the spot's top-left tile and its cost ($) */
interface BuildRec { type: BusinessId; x: number; y: number; cost: number }
/** one game day's record: the treasury at the day's close, the round (null: none), the card taken, the build (null: none), the businesses, the open types */
interface DayRec { day: number; money: number; round: RoundRec | null; card: CardId | null; build: BuildRec | null; businesses: BizRec[]; open: BusinessId[]; ledger: Ledger | null; pop: number }

/** a day's line: the treasury, the round (level, rate, net, PERFECT, card), each business (type, level, sat, good days, revenue), the open types */
function dayLine(r: DayRec): string {
  const rd = r.round ? `round L${r.round.level} ${(100 * r.round.rate).toFixed(2)}% net $${Math.round(r.round.net)}${r.round.perfect ? ' PERFECT' : ''} card ${r.card ?? '-'}` : 'no round';
  const bz = r.businesses.map(b => `${b.type} L${b.level} sat ${b.sat.toFixed(2).replace(/^0/, '')} good ${b.goodDays} rev $${b.revenue}`).join(' | ');
  const L = r.ledger, lg = L ? `books: tax $${Math.round(L.property)} biz $${Math.round(L.business)} toll $${Math.round(L.toll ?? 0)} payout $${Math.round(L.payout ?? 0)} upkeep $${Math.round(L.upkeep)} interest $${Math.round(L.interest)} build $${Math.round(L.construction)} net $${Math.round(L.net)}` : 'no books';
  return `[day ${r.day}] $${r.money} pop ${r.pop} | ${rd} | ${lg} | ${bz} | open: ${r.open.join(',')}`;
}

/** whether a seg of net runs within pad tiles of the rect (x, y, w, h): each seg's centre line sampled every 0.5 tiles (engine's roadNearRect) */
function roadNear(net: RoadNetwork, x: number, y: number, w: number, h: number, pad: number): boolean {
  for (const s of net.segs) {
    const g = s.cls.h + pad, ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
    if (Math.max(ax, bx) < x - g || Math.min(ax, bx) > x + w + g || Math.max(ay, by) < y - g || Math.min(ay, by) > y + h + g) continue;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.5));
    for (let k = 0; k <= n; k++) { const f = k / n, px = ax + (bx - ax) * f, py = ay + (by - ay) * f; if (Math.hypot(Math.max(x - px, 0, px - x - w), Math.max(y - py, 0, py - y - h)) <= g) return true; }
  }
  return false;
}

/** whether a lot whose town level is not EMPTY lies under the rect (x, y, w, h): the box of its four corners against the rect (engine's lotsUnder) */
function lotsUnder(H: Towns, x: number, y: number, w: number, h: number): boolean {
  for (const l of H.city.lots.lots.values()) {
    const lv = H.city.town.states.get(l.key)?.level;
    if (lv === undefined || lv === LV.EMPTY) continue;
    const ax = l.o.x + l.u.x * l.w, ay = l.o.y + l.u.y * l.w, bx = l.o.x + l.n.x * l.d, by = l.o.y + l.n.y * l.d, cx = ax + l.n.x * l.d, cy = ay + l.n.y * l.d;
    if (Math.max(l.o.x, ax, bx, cx) > x && Math.min(l.o.x, ax, bx, cx) < x + w && Math.max(l.o.y, ay, by, cy) > y && Math.min(l.o.y, ay, by, cy) < y + h) return true;
  }
  return false;
}

/** whether a footprint fw x fh at (x, y) is a valid spot for type t (engine's bizWhy): the site's terrain and town rule (siteWhy), no road within 2 tiles,
 *  no car park within 1, no other business (defs, the stadium too) within 2, no built lot under it */
function validSpot(H: Towns, t: BusinessId, x: number, y: number, fw: number, fh: number, defs: BizDef[], parks: CarParkDef[]): boolean {
  const B = BUSINESS[t];
  if (siteWhy(siteAt(x, y, fw, fh), H.t.cls, H.centres, B.townMin, B.water) !== '') return false;
  if (roadNear(H.city.net, x, y, fw, fh, 2)) return false;
  if (parks.some(p => p.x < x + fw + 1 && p.x + p.w > x - 1 && p.y < y + fh + 1 && p.y + p.h > y - 1)) return false;
  if (defs.some(d => d.x < x + fw + 2 && d.x + d.w > x - 2 && d.y < y + fh + 2 && d.y + d.h > y - 2)) return false;
  return !lotsUnder(H, x, y, fw, fh);
}

/** a spot for a business of type t beside a road joined to the stadium: the axis-aligned ground segs reachable from the node nearest the stadium's centre
 *  and at least the footprint's long side + 4 long, nearest a town centre first; each side and both orientations, every SPOT_STEP tiles along, the near
 *  edge at the seg's class half width + 3 from its centre line; the first valid one (as { type, x, y, w, h }), or null (none fits in MAX_CANDIDATES) */
function findSpot(H: Towns, t: BusinessId, defs: BizDef[], parks: CarParkDef[]): Omit<BizDef, 'id'> | null {
  const city = H.city, site = city.site!, B = BUSINESS[t], long = Math.max(B.footprint.w, B.footprint.h);
  let door: Pt | null = null, dd = Infinity;
  for (const n of city.net.nodes.values()) { const d = Math.hypot(n.x - site.c.x, n.y - site.c.y); if (d < dd) { dd = d; door = { x: n.x, y: n.y }; } }
  if (!door) return null;
  const cand: { s: Seg; d: number }[] = [];
  for (const s of reachableSegs(city.net, door)) {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, horiz = Math.abs(dy) < 0.01, vert = Math.abs(dx) < 0.01;
    if ((!horiz && !vert) || s.kind !== SK.GROUND || Math.hypot(dx, dy) < long + 4) continue;
    const mx = (s.a.x + s.b.x) / 2, my = (s.a.y + s.b.y) / 2;
    let md = Infinity; for (const c of H.centres) md = Math.min(md, Math.hypot(c.x - mx, c.y - my));
    cand.push({ s, d: md });
  }
  cand.sort((p, q) => p.d - q.d);
  let tried = 0;
  for (const { s } of cand) {
    const horiz = Math.abs(s.b.y - s.a.y) < 0.01, C = horiz ? s.a.y : s.a.x, g = s.cls.h + 3;
    const lo = Math.ceil(horiz ? Math.min(s.a.x, s.b.x) : Math.min(s.a.y, s.b.y)), hi = horiz ? Math.max(s.a.x, s.b.x) : Math.max(s.a.y, s.b.y);
    for (const [fw, fh] of [[B.footprint.w, B.footprint.h], [B.footprint.h, B.footprint.w]]) for (const side of [1, -1]) {
      const along = horiz ? fw : fh, across = horiz ? fh : fw, edge = side > 0 ? Math.ceil(C + g) : Math.floor(C - g - across);
      for (let p = lo; p + along <= hi; p += SPOT_STEP) {
        if (++tried > MAX_CANDIDATES) return null;
        const x = horiz ? p : edge, y = horiz ? edge : p;
        if (validSpot(H, t, x, y, fw, fh, defs, parks)) return { type: t, x, y, w: fw, h: fh };
      }
    }
  }
  return null;
}

console.log(`[biz] seed ${seed}: ${D} game days; a scripted player builds the stadium on the suggested spot, the generous roads and car parks, then a Level 1 round a day and one spin-off when the unlocks and the treasury allow`);
const H = setupTowns(seed, TOWN_POP), city = H.city;
if (!city.site) throw new Error('no suggested stadium spot on this valley');
const site = city.site;
// the stadium: placed on the suggested spot and paid for
city.setStadium([site.x, site.y, site.w, site.h]);
const stadiumCost = BUSINESS.stadium.buildCost;
city.spend('construction', stadiumCost);
// the roads (the generous build's network value, as the add-lane tool prices it) and the car parks
/** the buses on each shuttle route the player draws with its bus company */
const BUS_PER_ROUTE = 4;
/** the money the player keeps in hand after the opening build ($) */
const OPEN_RESERVE = 20000;
const v0 = netValue(city.net), parks = buildGenerous(H, false), roadCost = Math.round(netValue(city.net) - v0);
city.spend('construction', roadCost);
// the car parks the player can afford, in the build's order, keeping OPEN_RESERVE in hand: it takes loans when short (as the game lets it), and leaves
// out a park it still cannot pay for. The generous build without its spine widening: the start fund cannot pay for the arterials as well
const kept: CarParkDef[] = [];
let parksCost = 0, loans = 0;
for (const p of parks) {
  const c = parkCost(p);
  while (city.budget.money - parksCost - c < OPEN_RESERVE && city.loan(true)) loans++;
  if (city.budget.money - parksCost - c >= OPEN_RESERVE) { kept.push(p); parksCost += c; }
}
if (kept.length < parks.length) city.setParks(kept);
city.spend('construction', parksCost);
console.log(`[biz] spend: stadium $${stadiumCost}, roads $${roadCost}, car parks $${parksCost} (${kept.length} of ${parks.length} parks), loans ${loans}; the town spines are not widened`);
const defs: BizDef[] = city.bizView().map(b => ({ id: b.id, type: b.type, x: b.x, y: b.y, w: b.w, h: b.h }));
const everyday = newMeter(), surge = newMeter(), days: DayRec[] = [];
let s = 1;
/** steps the everyday traffic (each second metered into everyday) until the clock reaches t (at most MAX_STEPS seconds) */
/** the last day close's books (City.step's ledger) */
let ledger: Ledger | null = null;
const stepTo = (t: number) => { for (let i = 0; city.sim.clock < t && i < MAX_STEPS; i++, s++) { const r = stepSecond(H, s); if (r.ledger) ledger = { ...r.ledger }; meter(everyday, H); } };

/** the point on the ground road nearest p (the projection on its nearest seg's centre line), or null within r tiles */
function roadPt(p: Pt, r: number): Pt | null {
  let best: Pt | null = null, bd = Infinity;
  for (const g of city.net.segsNear(p, r)) {
    if (g.kind !== SK.GROUND) continue;
    const dx = g.b.x - g.a.x, dy = g.b.y - g.a.y, L2 = dx * dx + dy * dy; if (L2 < 1e-9) continue;
    const k = Math.max(0.2, Math.min(0.8, ((p.x - g.a.x) * dx + (p.y - g.a.y) * dy) / L2)), q = { x: g.a.x + dx * k, y: g.a.y + dy * k }, dd = Math.hypot(q.x - p.x, q.y - p.y);
    if (dd < bd) { bd = dd; best = q; }
  }
  return best;
}
/** with the bus company: a shuttle route per town (BUS_PER_ROUTE buses of BUS_SEATS), from the road nearest the town centre to the feeder road by that town's
 *  car park (buildGenerous makes park k + 1 for town k), paid at BUS_ROUTE_COST each; a town without both stops gets none */
function busRoutes() {
  const routes: BusRouteDef[] = [];
  H.centres.forEach((c, k) => {
    const pk = parks.find(q => q.id === k + 1); if (!pk) return;
    const a = roadPt(c, 30), b = roadPt({ x: pk.x + pk.w / 2, y: pk.y + pk.h / 2 }, 60);
    if (a && b) routes.push({ id: routes.length + 1, park: 0, town: k, sx: a.x, sy: a.y, dx: b.x, dy: b.y, buses: BUS_PER_ROUTE, seats: BUS_SEATS });
  });
  city.setBusRoutes(routes); city.spend('construction', routes.length * BUS_ROUTE_COST);
  console.log(`[biz] ${routes.length} shuttle routes (${BUS_PER_ROUTE} buses each) -$${routes.length * BUS_ROUTE_COST}`);
}

for (let d = 0; d < D; d++) {
  // the everyday traffic to 17:00, then the round: the card, the round closed
  stepTo(d * DAY + ROUND_HOUR * HOUR);
  const R = runRound(H, s, surge); s = R.s;
  const draft = city.round.draft;
  const card: CardId | null = draft?.length ? (PREF.find(c => draft.includes(c)) ?? draft[0]!) : null;
  if (card) city.pickCard(card);
  city.closeRound();
  const r = R.r;
  const round: RoundRec | null = r ? { level: r.level, rate: r.rate, arrived: r.arrived, tickets: r.tickets ?? 0, toll: r.toll ?? 0, payout: r.payout, upkeep: r.upkeep, net: r.net, perfect: r.perfect } : null;
  // the everyday traffic past midnight (the day close), then at most one spin-off
  stepTo((d + 1) * DAY + CLOSE_S);
  const owned = ownedOf(city.bizView()), open = unlockedBy(owned);
  let build: BuildRec | null = null;
  for (const t of BUILD_ORDER) {
    const cost = BUSINESS[t].buildCost;
    if (!open.includes(t) || owned.some(o => o.id === t) || city.budget.money - cost < RESERVE) continue;
    const spot = findSpot(H, t, defs, parks);
    if (!spot) { console.log(`day ${d + 1}: no spot for ${t}`); continue; }
    defs.push({ id: Math.max(0, ...defs.map(q => q.id)) + 1, ...spot });
    city.setBusinesses(defs);
    city.spend('construction', cost);
    build = { type: t, x: spot.x, y: spot.y, cost };
    console.log(`day ${d + 1}: built ${t} at (${spot.x},${spot.y}) -$${cost}`);
    if (t === 'buscompany') busRoutes();
    break;
  }
  // the day's record
  const views = city.bizView(), openNow = unlockedBy(ownedOf(views));
  const businesses: BizRec[] = views.map(b => ({ id: b.id, type: b.type, level: b.level, sat: Math.round(b.sat * 100) / 100, goodDays: b.goodDays, revenue: Math.round(b.revenue), today: b.today }));
  const rec: DayRec = { day: d + 1, money: Math.round(city.budget.money), round, card, build, businesses, open: openNow, ledger, pop: Math.round(city.town.pop) };
  days.push(rec);
  console.log(dayLine(rec));
}

// the checks
const minMoney = days.reduce((m, r) => Math.min(m, r.money), Infinity);
const spinOffs = defs.filter(q => q.type !== 'stadium').length;
const unlocks = unlockedBy(ownedOf(city.bizView())).filter(t => t !== 'stadium').length;
const meanMs = surge.sum / Math.max(1, surge.n), everyMean = everyday.sum / Math.max(1, everyday.n);
const passA = days.length > 0 && minMoney >= 0, passB = spinOffs >= MIN_BUILDS, passC = unlocks >= MIN_UNLOCKS, passD = surge.n > 0 && meanMs <= MEAN_MS && surge.max <= MAX_MS;
console.log(`[check] (a) ${passA ? 'PASS' : 'FAIL'}: the lowest treasury at a day's record is $${Math.round(minMoney)} (needs at least $0)`);
console.log(`[check] (b) ${passB ? 'PASS' : 'FAIL'}: ${spinOffs} spin-offs built (needs at least ${MIN_BUILDS})`);
console.log(`[check] (c) ${passC ? 'PASS' : 'FAIL'}: ${unlocks} types unlocked besides the stadium (needs at least ${MIN_UNLOCKS})`);
console.log(`[check] (d) ${passD ? 'PASS' : 'FAIL'}: sim time per step mean ${meanMs.toFixed(2)} ms (needs at most ${MEAN_MS}), max ${surge.max.toFixed(2)} ms (needs at most ${MAX_MS}) over ${surge.n} surge steps`);
console.log(`[biz] everyday traffic: mean ${everyMean.toFixed(2)} ms, max ${everyday.max.toFixed(2)} ms per step over ${everyday.n} steps (report only)`);
const pass = passA && passB && passC && passD;
const out = {
  seed, days: D, spend: { stadium: stadiumCost, roads: roadCost, parks: parksCost }, dayRecords: days,
  checks: { a: passA, b: passB, c: passC, d: passD }, pass,
  meters: { surge: { steps: surge.n, meanMs, maxMs: surge.max }, everyday: { steps: everyday.n, meanMs: everyMean, maxMs: everyday.max } },
};
const dir = path.resolve('output/sim');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'biz-gate.json'), JSON.stringify(out, null, 1));
console.log(`[biz] ${pass ? 'PASS' : 'FAIL'}: wrote output/sim/biz-gate.json`);
process.exitCode = pass ? 0 : 1;
