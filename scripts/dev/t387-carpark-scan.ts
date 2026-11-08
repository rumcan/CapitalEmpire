// T387 (#1045) scan (node; esbuild scripts/dev/t387-carpark-scan.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty --outfile=output/t387/scan.mjs, then node output/t387/scan.mjs 1-80 10): on real terrains (seeds 1..N), the range slid along its parcel (du 0.. in steps), the car park spots beside its drive in the frontage
// strip: how many does the NEW rule allow, how many would the OLD rule (any tile not GROUND/PATCH) have allowed, and the classes that refuse
import { MAP } from '../../src/game/iso';
import { CLASS, RoadNetwork, classOf, type Pt } from '../../src/game/network';
import { NetEditor } from '../../src/game/netops';
import { TC, generateTerrain } from '../../src/game/terrain';
import { NEAR, planRangeStart } from '../../src/game/golf/rangestart';
import { RANGE_PLOT, plotPoint, rangeLayout } from '../../src/game/golf/range';
import { homeYardBox, rangeKeepOut } from '../../src/game/golf/rangebiz';
import { landWhy, rangeSpotAt, type LandCheck } from '../../src/game/golf/placing';
import { carParkSpotAt, carParkWhy, parkSpotWhy, type CarParkCtx } from '../../src/game/golf/parkplace';
import type { Rect } from '../../src/game/golf/mode';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };
const seeds = (process.argv[2] ?? '1-20').split('-').map(Number), STEP = +(process.argv[3] ?? 10);
let worst: string[] = [];
for (let seed = seeds[0]!; seed <= seeds[1]!; seed++) {
  const t = generateTerrain(seed), rs = planRangeStart(t, seed); if (!rs) { console.log(`seed ${seed}: no range start`); continue; }
  const f = rs.site.dir, home = rs.site.rangePlot, parcel = rs.site.parcel, cls = t.cls;
  const along = rs.site.axis === 'x' ? parcel[2] : parcel[3];
  const owned = (x: number, y: number) => x >= parcel[0] && x < parcel[0] + parcel[2] && y >= parcel[1] && y < parcel[1] + parcel[3];
  const wetAt = (x: number, y: number) => { const c = cls[Math.floor(y) * MAP + Math.floor(x)]; return c === TC.WATER || c === TC.CREEK || c === TC.BANK; };
  const land: LandCheck = { owned, wet: wetAt, course: () => false };
  const line: string[] = [];
  for (let du = 0; du <= along - RANGE_PLOT[0]; du += STEP) {
    const p0 = plotPoint(home, f, RANGE_PLOT[0] / 2 + du, 12), spot = rangeSpotAt(home, f, p0.x, p0.y), rwhy = landWhy(spot.plot, land);
    if (rwhy) { line.push(`${du}:range ${rwhy.slice(0, 8)}`); continue; }
    const e = new NetEditor(new RoadNetwork());
    e.addLegs(rs.road.legs, CLASS.road!, 0, rs.road.kinds, true);
    e.addLegs([{ a: spot.J, b: spot.end }], classOf('drive-gravel'), 0, undefined, true); e.commit();
    const plot = spot.plot, yb = homeYardBox(home, f);
    const ctx: CarParkCtx = { built: true, lot: false, keepOut: rangeKeepOut(plot, f, spot.setback), buildings: [{ rect: rangeLayout(plot, f).hut.rect, name: 'the pro shop' }], cls, net: e.net, site: null, parks: [], lotsUnder: () => false, land, yard: [yb[0], yb[1], yb[2] - yb[0], yb[3] - yb[1]], practice: null };
    const o = plotPoint(plot, f, 0, 0), U: Pt = { x: plotPoint(plot, f, 1, 0).x - o.x, y: plotPoint(plot, f, 1, 0).y - o.y }, V: Pt = { x: plotPoint(plot, f, 0, 1).x - o.x, y: plotPoint(plot, f, 0, 1).y - o.y };
    const J = rs.site.J, sOf = (p: Pt) => (p.x - J.x) * U.x + (p.y - J.y) * U.y, sDrive = sOf(spot.J);
    let allowNew = 0, allowOld = 0, total = 0, nearNew = 0, nearOld = 0; const cl = [0, 0, 0, 0, 0, 0];
    for (let ds = -70; ds <= 70; ds += 2) {
      const pt = { x: J.x + U.x * (sDrive + ds) + V.x * (NEAR + 6), y: J.y + U.y * (sDrive + ds) + V.y * (NEAR + 6) };
      const d = carParkSpotAt(e.net, f, pt.x, pt.y); total++;
      const why = carParkWhy(d, ctx); if (why) continue;
      allowNew++; if (Math.abs(ds) <= 30) nearNew++;
      // the old rule: any tile of the park not GROUND/PATCH refused it (after the range's own keep-out and the hiding rule, which already passed)
      let bad = false; for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { const c = cls[y * MAP + x]!; if (c !== TC.GROUND && c !== TC.PATCH) { bad = true; cl[c]++; } }
      if (!bad) { allowOld++; if (Math.abs(ds) <= 30) nearOld++; }
    }
    const tag = `${du}:${allowNew}/${allowOld} near ${nearNew}/${nearOld}${nearNew > 0 && nearOld === 0 ? '!' : ''}`;
    line.push(tag); if (nearNew > 0 && nearOld === 0) worst.push(`seed ${seed} du ${du} facing ${f}: within 30 tiles of the drive new ${nearNew} old 0 (of 31); in all ${allowNew}/${allowOld}; tiles refused by class hill/water/creek/bank ${cl[2]}/${cl[3]}/${cl[4]}/${cl[5]}`);
  }
  console.log(`seed ${seed} facing ${f} parcel ${parcel.join(',')}: ${line.join('  ')}`);
}
console.log('--- placements where the old rule left no car park spot beside the drive but the new rule does:'); console.log(worst.join('\n') || '(none)');
