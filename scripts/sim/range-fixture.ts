// The grown-town fixture (T098, issue #168; plan P22 2.7.3): a range start (harness.ts setupRange) grown for `seasons` seasons with range-gate.ts's
// scripted course and success (holes 2, then 9 in seasons 2-5, 18 from 6; success 1.0, then 1.2 from season 3, sent through setGolf), saved
// as the engine saves a game (engine.ts save: SaveV5) with the course land empty and green (no holes in the save: P22 2.3.4's year 20 with the
// course still to build) and the camera on the town. It is read by tests/save-fixtures.test.ts (it loads; under 2 MB gzipped), the dev
// ?fixture=range20 loader (engine.ts) and the bench's &fixture=range20 stage (bench.ts).
//   npm run range:fixture -- [seed = 1] [seasons = 20] [--player]   (writes tests/fixtures/saves/golf-v5-range-20y.json)
// --player (T178): a player upgrades the town's jammed roads at each season's end (harness playerUpgrade, as range:gate --player does), so
// the fixture is a healthy grown town; the committed fixture is made with it. Without it, the town left alone jams and declines.
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import { playerUpgrade, setupRange, stepSecond } from './harness';
import { SEASON_LEN } from '../../src/game/golf/calendar';
import { GAME_DAY } from '../../src/game/budget';
import { LV, type LotTuple } from '../../src/game/lots/town';
import { MAP, worldX, worldY } from '../../src/game/iso';
import { SAVE_VERSION, segRec, type SaveV5 } from '../../src/game/save';
import { nodeEntry } from '../../src/game/netops';
import type { Budget } from '../../src/game/budget';
import type { Career } from '../../src/game/career';
import { emptyProgress } from '../../src/game/ext/progressive-ui/progress';

const argv = process.argv.slice(2).filter(a => !a.startsWith('--')), player = process.argv.includes('--player');
const seed = Number(argv[0] ?? 1), seasons = Math.max(1, Math.round(Number(argv[1] ?? 20)));
const roads = { segs: 0, cost: 0 };
const OUT = 'tests/fixtures/saves/golf-v5-range-20y.json';
/** range-gate.ts's scripted course and success of season k (1-based) */
/** the player's upgrades a season at most (range-gate.ts PLAYER.MAX) */
const PLAYER_MAX = 80;
const holesIn = (k: number) => (k <= 1 ? 2 : k <= 5 ? 9 : 18), successIn = (k: number) => (k <= 2 ? 1 : 1.2);

const t0 = performance.now(), h = setupRange(seed), R = h.range, golf = R.start.save, land: [number, number, number, number][] = [golf.course, golf.parcel];
const setSeason = (k: number) => h.city.setGolf({ tier: golf.tier, rep: golf.rep, land, start: 'range', exits: golf.exits, holes: holesIn(k), townBoost: successIn(k) });
setSeason(1);
for (let s = 1; s <= seasons * SEASON_LEN; s++) {
  stepSecond(h, s);
  if (s % SEASON_LEN === 0 && s < seasons * SEASON_LEN) setSeason(s / SEASON_LEN + 1);
  if (player && s % SEASON_LEN === 0 && s < seasons * SEASON_LEN) { const r = playerUpgrade(h, PLAYER_MAX, 0); roads.segs += r.segs; roads.cost += r.cost; }
}
const city = h.city, I = city as unknown as { budget: Budget; career: Career }, sim = city.sim, site = R.start.site, c = site.centre;
const lots: LotTuple[] = [...city.town.states.values()].filter(st => st.level !== LV.EMPTY).map(st => [st.key, st.use, st.level, st.decline, st.seed, st.since]);
const [fx, fy, fw, fh] = site.rangeFront, [px, py, pw, ph] = site.carpark;
const save: SaveV5 = {
  version: SAVE_VERSION, map: MAP, seed,
  segs: [...city.net.segs].map(segRec),
  nodes: [...city.net.nodes.values()].filter(n => n.type !== 'plain' || n.wide || n.tl).map(nodeEntry),
  props: [],
  money: I.budget.money, day: Math.floor(sim.clock / GAME_DAY) + 1, cam: { X: worldX(c.x, c.y), Y: worldY(c.x, c.y), z: 0.08 },
  lots, simT: sim.t, shift: sim.clock - sim.t, townClock: sim.town, budget: I.budget.toJSON(), career: I.career.toJSON(),
  parks: [[px, py, pw, ph]], tolls: [], buses: [], cardsApplied: 0,
  biz: [['range', fx, fy, fw, fh]],
  paints: [], rows: [], curbs: [], parkFee: 0,
  golf: { ...golf, townBoost: successIn(seasons), range: R.save, progress: { ...emptyProgress(), ramp: 0 } },
};
const json = JSON.stringify(save), gz = gzipSync(json).length;
fs.writeFileSync(OUT, json + '\n');
console.log(`[fixture] seed ${seed}, ${seasons} seasons${player ? `, a player upgrading ${roads.segs} segs for $${roads.cost}` : ''} in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${lots.length} lots (${city.town.built} built), ${city.town.pop} residents, ${save.segs.length} segs; ${(json.length / 1024).toFixed(0)} KB, ${(gz / 1024).toFixed(0)} KB gzipped -> ${OUT}`);
