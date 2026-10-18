# T001 · Subways (a standalone underground rail module)

Status: open
Module: `src/game/ext/subway/` · Tests: `tests/ext-subway.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## What it is in the game
The player builds **subway lines** under the map: stations at the towns and next to businesses (the stadium first),
joined by straight tunnels. Trains carry **fans and residents** between stations, so a town far from the stadium can
send its crowd underground instead of by road. Subways ignore the roads and the terrain on the surface (they run
underground), so this module needs **no road network**: only points on the map. The lead wires it in afterwards: the
station tool, the drawing, the crowd sending fans to stations, the costs and the save.

## Units
Positions in **tiles** (1 tile = 2 m; the map is 2048 x 2048 tiles, `MAP` in `src/game/iso.ts`). Time in **sim
seconds**. Speeds in m/s. Money in $.

## Model (keep it simple and deterministic)
- **Stations:** `{ id, x, y }`. **Lines:** an ordered list of station ids (2 or more), `trains` count, `loop` flag
  (a loop line runs round; an open line runs back and forth, reversing at the ends).
- **Tunnels:** straight between consecutive stations; length = the distance in metres.
- **Trains:** cruise 20 m/s, accelerate and brake at 1.0 m/s², capacity 600 fans each, dwell at a station = max(20 s,
  the boarding/alighting time at 10 fans/s per train). Trains on a line keep apart: spread evenly at the start, and a
  train never enters a tunnel stretch another train of the same line occupies in the same direction (it waits at the
  station; simple block signalling: one train per tunnel per direction).
- **Passengers are counts**, not agents: per station, a queue per destination station with a `tag` (an integer the lead
  uses for the town they came from). Routing: the fewest transfers, then the shortest time (a breadth-first search over
  the lines; stations shared by lines are transfers; a transfer adds a 60 s walk). Boarding picks fans whose route's next
  hop is this train's next stops; alighting drops fans at their destination or transfer station.
- **Costs** (the lead tunes later; export them as constants): a station $40,000, a tunnel $900 per tile of length, a
  train $25,000; upkeep 1% of the build cost per game day (1,440 sim s).

## API (keep these names; add more if useful)
```ts
export interface StationDef { id: number; x: number; y: number; name?: string }
export interface LineDef { id: number; stations: number[]; trains: number; loop?: boolean }
export interface Arrival { station: number; fans: number; tag: number }
export interface TrainView { line: number; x: number; y: number; dir: number /* radians, tile space */; load: number }
export interface SubwayView { trains: TrainView[]; queues: { station: number; fans: number }[] }
export const STATION_COST: number, TUNNEL_COST_PER_TILE: number, TRAIN_COST: number, UPKEEP_RATE: number;
/** the build cost of a network: stations + tunnels + trains */
export function buildCost(stations: StationDef[], lines: LineDef[]): number;
export class Subway {
  constructor(seed?: number);
  /** the network replaced (a station or line added/removed/changed): trains re-placed on changed lines; queued fans at
   *  stations that still exist keep waiting (fans whose destination is gone are dropped and counted in `dropped`) */
  setNetwork(stations: StationDef[], lines: LineDef[]): void;
  /** n fans tagged `tag` start waiting at station `from` for station `to`; returns the fans accepted (0 when no route) */
  board(from: number, to: number, fans: number, tag: number): number;
  /** advance dt sim seconds (called with dt = 0.1 or 1; allocation-free) */
  step(dt: number): void;
  /** the fans who reached their destination since the last call, merged per (station, tag); clears them */
  takeArrivals(out: Arrival[]): Arrival[];
  /** what the renderer draws now (reuse arrays between calls) */
  view(): SubwayView;
  /** totals since the network was set: fans carried, fans dropped, mean wait at the first station (s) */
  stats(): { carried: number; dropped: number; meanWait: number };
}
```

## Tests (`tests/ext-subway.test.ts`) and the numbers to print
1. **Travel time:** a 2-station open line 1,000 tiles apart (2 km), 1 train, 100 fans: all arrive; the time is close to
   the accelerate/cruise/brake physics plus the dwell (print it; expected ~2 min).
2. **Capacity:** the same line with 2 trains and 5,000 fans queued: print fans per hour delivered (expected ~2 x 600
   per round trip); never more than 600 on a train.
3. **Spacing:** 4 trains on one line never share a tunnel stretch in the same direction.
4. **Transfers:** two lines sharing one station: fans from a station of line A to a station of line B arrive, with one
   transfer (and its 60 s).
5. **Loop vs open:** a loop line serves the stations round in order; an open line reverses at the ends.
6. **Network change:** removing a station drops only the fans bound for it; the rest arrive.
7. **Determinism:** two identical runs give identical arrivals.
8. **Cost:** `buildCost` of a known network; the step cost of 10 lines, 40 trains, 50 stations under 0.05 ms per step
   (print the measured time).

## Integration notes the lead expects in the PR
Where the station positions come from (the lead's station tool), how the crowd hands fans to `board`, how
`takeArrivals` turns into arrived fans at the stadium (a walk from the station), what `view()` sends per frame and its
size, and the save shape (the defs are enough).
