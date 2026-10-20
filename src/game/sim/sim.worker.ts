/// <reference lib="webworker" />
// The city worker: a thin shell around one City (game/city.ts). Messages in (edits, terrain, targets, speed), messages out: the cars
// packed into a frame every FRAME_MS (SimClient reads them), the parcels that changed, the town's events and totals, the town's
// gravel extensions and the timing logs. The city logic itself is in City, so the town gate runs the same code headless.
import type { NetOp } from '../ground-protocol';
import { City } from '../city';
import type { Pt } from '../network';
import type { Lot } from '../lots/lots';
import type { TownEvent } from '../lots/town';
import type { Ledger } from '../budget';
import type { Milestone } from '../career';
import type { FromSim, LotRec, SimStats, ToSim } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** wall-clock frame period, ms; the sim is stepped once per DT of its speed. A skip (fast-forward) runs for SKIP_MS of each frame */
const FRAME_MS = 100, SKIP_MS = 70, TOWN_EVERY = 10;
const city = new City(1); city.autoStadium = false; // the player places the stadium (see City.autoStadium)
let speed = 1, forcePost = false, wasAlive = false, townPosted = 0;
/** the event round's stage as the books were last posted for it (the build and the surge move on the clock: a change posts the books) */
let roundStage = city.round.stage;
/** the sim time a fast-forward runs to, s; -1 when none */
let skipUntil = -1;
/** the performance.now() of the last frame: the wall time since it feeds the event round's build */
let wallAt = performance.now();
const post = (m: FromSim, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
const fail = (err: unknown) => post({ t: 'error', message: (err as Error).stack || String(err) });
const rec = (l: Lot): LotRec => ({ key: l.key, o: [l.o.x, l.o.y], u: [l.u.x, l.u.y], n: [l.n.x, l.n.y], w: l.w, d: l.d, cls: l.cls, corner: l.corner });

/** posts the town's events and totals: when forced, when there are events, or every TOWN_EVERY sim s */
function postTown(ev: TownEvent[], force: boolean) {
  if (!force && !ev.length && city.sim.t - townPosted < TOWN_EVERY) return;
  townPosted = city.sim.t;
  const town = city.town;
  post({ t: 'town', events: ev.slice(), pop: town.pop, jobs: town.jobs, built: town.built, access: town.access });
}

/** the books: the save, the career's save, the game day now, and the ledger of the day that just closed (null unless a day did) */
function postBudget(ledger: Ledger | null) { post({ t: 'budget', save: city.budget.toJSON(), career: city.career.toJSON(), day: city.budget.dayOf(city.sim.clock), ledger }); }

/** posts the businesses with their stats (after a change of the list, a day's close, a round's close, and a save's load) */
function postBiz() { post({ t: 'biz', list: city.bizView() }); }

/** a step's career news: the milestones it newly reached and the win, then the books (the grants moved the treasury); nothing if neither */
function postCareer(r: { milestones: Milestone[]; won: boolean }) { if (!r.milestones.length && !r.won) return; post({ t: 'milestone', newly: r.milestones, won: r.won }); postBudget(null); }

/** the bottleneck report: the flow buffer is handed over, not copied */
function postReport() { const report = city.report(); post({ t: 'report', report, hours: city.hours.slice() }, [report.flow.buffer as ArrayBuffer]); }
/** the game hour (sim s) the bottleneck report was last posted for (-1: none yet); a report goes out once per game hour of sim time */
const HOUR = 60;
let reportHour = -1;
/** the car inspected (-1: none); the junction watch: its node's x, y (null: none), whether it is on, and the wall-clock time (ms) of its next post */
let inspecting = -1, watchXY: [number, number] | null = null, watching = false, watchNext = 0;

/** the congestion heat map (off by default): on while the client asks; heatGeomV is the version of the geometry last posted (-1: none, so it goes
 *  out before the first heat of each switch on), heatNext the performance.now() of the next heat */
const HEAT_MS = 500;
let heatOn = false, heatGeomV = -1, heatNext = 0;

/** posts the heat: the geometry first when the version changed, then the ratios and densities (copies, transferred) */
function postHeat() {
  const sim = city.sim;
  if (sim.heatVersion !== heatGeomV) { heatGeomV = sim.heatVersion; const geom = sim.heatGeometry(); post({ t: 'heatGeom', version: heatGeomV, geom }, [geom.buffer as ArrayBuffer]); }
  const ratio = sim.heatRatio.slice(), dens = sim.heatDens.slice(), hist = sim.heatHist.slice(), pdem = sim.parkDemand.slice();
  post({ t: 'heat', version: heatGeomV, ratio, dens, hist, pdem }, [ratio.buffer as ArrayBuffer, dens.buffer as ArrayBuffer, hist.buffer as ArrayBuffer, pdem.buffer as ArrayBuffer]);
  heatNext = performance.now() + HEAT_MS;
}

/** posts the junction watch: the node, the crossings since it was set, and their lines (the ring's first min(n, 256) entries, 4 floats each) */
function postWatch() {
  const n = city.sim.watchN, lines = city.sim.watchLog.slice(0, 4 * Math.min(n, 256));
  post({ t: 'watch', node: watchXY, n, lines }, [lines.buffer as ArrayBuffer]); watchNext = performance.now() + 1000;
}

/** a new valley: the city takes its terrain and the town centres (flat x, y pairs); the town starts again (no lots yet) and posts its totals and books */
function terrainOps(m: Extract<ToSim, { t: 'terrain' }>) {
  const towns: Pt[] = [];
  for (let i = 0; i + 1 < m.towns.length; i += 2) towns.push({ x: m.towns[i]!, y: m.towns[i + 1]! });
  city.terrain(m.cls, { x: m.entry[0], y: m.entry[1] }, m.seed, towns, m.height);
  post({ t: 'site', site: city.site });
  postTown([], true); postBudget(null);
}

/** replays the ops; the city logs the timings that are slow (over 50 ms) */
function netOps(ops: NetOp[]) {
  const r = city.netOps(ops);
  if (city.graphMs > 50) post({ t: 'log', message: `net ops ${ops.length} and graph in ${city.graphMs.toFixed(0)} ms` });
  if (r.lotsAdded.length || r.lotsRemoved.length) post({ t: 'lots', added: r.lotsAdded.map(rec), removed: r.lotsRemoved });
  postTown(r.events, true);
  if (city.lotsMs > 50) post({ t: 'log', message: `lots ${r.lotsAdded.length} added, ${r.lotsRemoved.length} removed in ${city.lotsMs.toFixed(0)} ms` });
}

/** one wall-clock period: speed steps of the sim (or, while skipping, as many 20-step blocks as SKIP_MS allows), the town to the sim time, the planner, then a frame unless there is nothing to show */
function frame() {
  // the event round's build runs on the wall clock: the time since the last frame, s (clamped to [0, 0.5])
  const now = performance.now();
  city.wall(Math.min(0.5, Math.max(0, (now - wallAt) / 1000))); wallAt = now;
  const skipping = skipUntil > city.sim.t;
  if (skipping) {
    const t0 = performance.now();
    while (city.sim.t < skipUntil && performance.now() - t0 < SKIP_MS) {
      const r = city.step(20);
      postTown(r.events, false);
      if (r.grow) post({ t: 'grow', legs: r.grow.flatMap(l => [l.a.x, l.a.y, l.b.x, l.b.y]) });
      if (r.ledger) { postBudget(r.ledger); postBiz(); }
      postCareer(r);
    }
    if (city.sim.t >= skipUntil) { skipUntil = -1; forcePost = true; }
  } else {
    const r = city.step(speed);
    postTown(r.events, false);
    if (r.grow) post({ t: 'grow', legs: r.grow.flatMap(l => [l.a.x, l.a.y, l.b.x, l.b.y]) });
    if (r.ledger) { postBudget(r.ledger); postBiz(); }
    postCareer(r);
  }
  // the round's stage moved (the build ends, kick-off: the payout is booked then): the books go out so the treasury shows it at once
  if (city.round.stage !== roundStage) { roundStage = city.round.stage; postBudget(null); postBiz(); }
  const hr = Math.floor(city.sim.t / HOUR);
  // not while fast-forwarding (an hour passes almost every frame then); the first frame after the skip posts it
  // the businesses' stats go out with it (the visit businesses' day so far)
  if (hr !== reportHour && !(skipUntil > city.sim.t)) { reportHour = hr; postReport(); postBiz(); }
  if (watching && performance.now() >= watchNext) postWatch();
  if (heatOn && performance.now() >= heatNext) postHeat();
  // the disasters go when they changed (warnings, starts, ends, repairs): not per frame
  const dz = city.disasterFrame();
  if (dz) post({ t: 'disasters', active: dz.active, notes: dz.notes });
  const sim = city.sim, alive = sim.active > 0;
  // with no cars, still a frame every second: the clock (signals, the town) reads simT from it; while skipping, a frame every period
  if (!skipping && !alive && !wasAlive && !forcePost && city.calls % 10 !== 0) return;
  forcePost = false; wasAlive = alive;
  const buf = new Float32Array(sim.cap * 4); sim.writeFrame(buf);
  // the shuttle crowd (walkers and stops) goes with the frames of a surge and its eval
  const walkers = city.surge ? city.walkBuf() : null, stops = city.surge ? city.stopBuf() : null;
  const stats: SimStats = { active: sim.active, target: sim.target, lanes: city.lanes, stepMs: sim.stats.stepMs, tickMs: city.tickMs, maxTickMs: city.maxTickMs, graphMs: city.graphMs, respawned: sim.stats.respawned, simT: sim.t, skipping: skipUntil > sim.t, clock: sim.clock, frozen: sim.frozen, round: city.roundView(), parks: city.parkView() };
  // the signal states (4 floats per plan) go with every frame
  const sig = sim.signalFrame();
  // the active traffic incidents go with every frame (3 floats each: see City.incidentBuf)
  const inc = city.incidentBuf();
  if (walkers && stops) post({ t: 'frame', cap: sim.cap, buf, stats, sig, inc, walkers, stops }, [buf.buffer, sig.buffer, inc.buffer, walkers.buffer, stops.buffer]);
  else post({ t: 'frame', cap: sim.cap, buf, stats, sig, inc }, [buf.buffer, sig.buffer, inc.buffer]);
  // the inspected car goes with every frame; once it is gone (null), no more
  if (inspecting >= 0) { const info = city.inspect(inspecting); post({ t: 'car', info }); if (!info) inspecting = -1; }
}

scope.onmessage = (e: MessageEvent<ToSim>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'net': netOps(m.ops); break;
      case 'terrain': terrainOps(m); break;
      case 'target': city.sim.setTarget(m.n); forcePost = true; break;
      case 'speed': speed = m.k; break;
      case 'skip': skipUntil = m.until; forcePost = true; break;
      case 'option': city.option(m.id); break;
      case 'townState': postTown(city.restore(m.lots, m.simT, m.budget, m.money, m.career, m.shift), true); city.loadRound(m.round); city.restoreBiz(m.biz); postBudget(null); postBiz(); break;
      case 'parks': city.setParks(m.defs); forcePost = true; break;
      case 'businesses': city.setBusinesses(m.defs); post({ t: 'site', site: city.site }); postBiz(); break;
      case 'parkTest': city.parkTest(m.id, m.n); forcePost = true; break;
      case 'tolls': city.setTolls(m.defs); forcePost = true; break;
      case 'parking': city.setParking(m.rows, m.curbs, m.fee); forcePost = true; break;
      case 'buses': city.setBusRoutes(m.defs); forcePost = true; break;
      case 'buyLot': postTown(city.buyLot(m.key), true); postBudget(null); break;
      case 'heat': heatOn = m.on; heatGeomV = -1; heatNext = 0; break;
      case 'incidents': city.setIncidents(m.on); forcePost = true; break;
      case 'disastersOn': city.setDisasters(m.on); break;
      case 'forceDisaster': city.forceDisaster(m.kind); break;
      case 'repairDisaster': city.repairDisaster(m.id, m.key); postBudget(null); break;
      case 'round':
        if (m.op === 'start') city.startRound(); else if (m.op === 'now') city.startNow(); else if (m.op === 'pick') city.pickCard(m.card);
        else { if (city.closeRound() && city.grown) postTown(city.grown.events, true); postBiz(); }
        postBudget(null); forcePost = true; break;
      case 'spend': city.spend(m.kind, m.n); postBudget(null); break;
      case 'loan': city.loan(m.take); postBudget(null); break;
      case 'budget': city.setBudget(m.save, m.career); postBudget(null); break;
      case 'report': postReport(); break;
      case 'stamp': postTown(city.stamp(m.pop), true); break;
      case 'sandbox': city.setGrowth(m.grow); city.setUnlimited(m.money); postBudget(null); break;
      case 'inspect': inspecting = m.slot; break;
      case 'watch':
        if (m.x < 0) { city.unwatch(); watching = false; watchXY = null; }
        else { watchXY = city.watchAt(m.x, m.y); watching = true; postWatch(); }
        break;
    }
  } catch (err) { fail(err); }
};

setInterval(() => { try { frame(); } catch (err) { fail(err); } }, FRAME_MS);
