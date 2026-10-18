# T008 · Traffic incidents

Status: open
Module: `src/game/ext/incidents/` · Tests: `tests/ext-incidents.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
Breakdowns and crashes make traffic feel alive and test the network's redundancy: a broken-down car blocks a lane, a
crash blocks one or two lanes and slows passing drivers (rubbernecking), a tow truck clears it.

## What to build (a model the lead wires into the sim)
- **The rates:** per vehicle-km and per junction passage, higher in stop-and-go and dense traffic and at night; crashes
  more likely at junctions with heavy conflicting flows. Seeded.
- **An incident:** a position (lane id and metres along it, given by the caller), the lanes it blocks, a clearance time
  (breakdown 10–20 min, crash 20–60 min; a tow truck must arrive: the time it takes is the caller's), a rubbernecking
  zone (both directions, 200 m, speed factor 0.6–0.8).
- Pure: the caller passes what happened (vehicle-km driven per lane class this step, junction passages with their
  conflict loads); the module decides incidents and returns them.

## API
```ts
export interface Exposure { lane: number; metres: number; density: number /* veh/km/lane */; stopGo: number /* 0..1 */ }
export interface Passage { node: string; conflictLoad: number /* veh/h crossing */ }
export interface Incident { id: number; kind: 'breakdown' | 'crash'; lane: number; s: number; blocks: number /* lanes */; start: number; clearAt: number; slowZone: { lane: number; from: number; to: number; factor: number }[] }
export class Incidents {
  constructor(seed: number);
  step(t: number, exposure: Exposure[], passages: Passage[]): Incident[]; // new incidents this step
  active(t: number): Incident[];
  clear(id: number): void;
}
```

## Tests and numbers
Rates over a long synthetic run (incidents per million vehicle-km by density); crashes concentrate at busy junctions;
determinism; clearance times in range. Print the expected incidents per game day for a city of 3,000 cars.

## Integration notes expected
How the sim should block lanes (a standing obstacle at `s`), apply the slow zones, and send a tow truck.
