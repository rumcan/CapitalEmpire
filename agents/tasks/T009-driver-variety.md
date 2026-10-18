# T009 · Driver variety (driver styles and the ACC car-following model)

Status: open
Module: `src/game/ext/drivers/` · Tests: `tests/ext-drivers.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
Today every car uses one IDM parameter set (`src/game/sim/idm.ts`) with only a speed factor per car. Real traffic has
cautious, normal and aggressive drivers with their own headway, acceleration, braking and reaction, and the ACC model
(Treiber & Kesting: the improved IDM blended with the constant-acceleration heuristic) keeps drivers calm when a faster
car cuts in. The owner also likes "brave drivers" who use the shoulder to reach a slip lane when traffic is bad. (A
reviewed outside simulator had these ideas; implement the published equations yourself, deterministic and
allocation-free.)

## What to build
- **Driver styles:** a seeded generator of per-driver parameters for `car` and `truck` (desired speed factor, time
  headway T, max acceleration a, comfortable braking b, jam gap s0, politeness, lane-change threshold, reaction delay,
  impatience: how long they wait before accepting smaller gaps or using a shoulder), in shares (aggressive / normal /
  cautious) that are parameters. Store them in typed arrays by slot (`Float32Array` per parameter, `ensure(cap)`).
- **The ACC acceleration:** `accACC(v, v0, s, vl, al, a, b, T, s0)` (IIDM + CAH blend with c = 0.99), and the plain IDM
  for comparison.
- **Shoulder use (a decision only):** `wantsShoulder(slot, waited, queueLen, toSlip)`: true for impatient drivers stuck
  behind a queue with their slip lane within 80 m.

## API
```ts
export interface DriverMix { aggressive: number; cautious: number; truckShare: number }
export class Drivers {
  constructor(seed: number, mix: DriverMix);
  ensure(cap: number): void;
  assign(slot: number, kind: 'car' | 'truck'): void; // draws the slot's parameters
  readonly v0f: Float32Array; readonly T: Float32Array; readonly a: Float32Array; readonly b: Float32Array; readonly s0: Float32Array;
  readonly politeness: Float32Array; readonly threshold: Float32Array; readonly reaction: Float32Array; readonly impatience: Float32Array;
  wantsShoulder(slot: number, waited: number, queueLen: number, toSlip: number): boolean;
}
export function accACC(v: number, v0: number, s: number, vl: number, al: number, a: number, b: number, T: number, s0: number): number;
export function idm(v: number, v0: number, s: number, dv: number, a: number, b: number, T: number, s0: number): number;
```

## Tests and numbers
Shares come out right over 10,000 draws; ACC never brakes harder than IDM in a cut-in by a faster car; a platoon on a
ring road (implement a tiny 1-lane ring test loop in the test) is string-stable for normal drivers; the fundamental
diagram: flow vs density for the mix (print the capacity per lane, veh/h). Allocation-free `accACC` (a microbenchmark:
ns per call).

## Integration notes expected
How the lead swaps `idm` for `accACC` in `Sim.accelerate` and reads the per-slot parameters; the expected effect on
capacity (lane flow numbers) so the gates' numbers can be re-baselined.
