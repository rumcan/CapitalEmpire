# T013 · Roads and land: upgrades and downgrades, building over lots, natural town layouts

Status: open
Module: `src/game/ext/landworks/` (three files: `regrade.ts`, `clearance.ts`, `townform.ts`) · Tests: `tests/ext-landworks.test.ts`
Spec by the lead, 2026-10-18 (one task, the owner's wish: three parts that change how the player shapes roads and towns).
Read `agents/arena/INSTRUCTIONS.md` first. Build the parts in order (A, B, C); one branch and one PR for all three.

## Part A · Road upgrades and downgrades (a class ladder with prices) — `regrade.ts`

### Why
The owner: "there's an Add button that makes a dirt road into an arterial one. It is important that roads can easily
up- or downgrade at a price." Today the **Add lane** tool (`src/game/engine.ts` `laneUpdate` / `laneClick`) uses
`WIDER` in `src/game/network.ts` line 46, which sends gravel, lane, street and road straight to arterial (and avenue to
boulevard): one click turns a dirt track into a 4-lane road. There is no way down at all, and the price is the full
cost of the new class with nothing back for the old road.

### What to build
1. **The ladder.** A graph of class moves over `CLASSES` (network.ts): each class's next class **up** and **down**,
   one step at a time, in two families the player can see:
   - local: gravel ⇄ lane ⇄ street ⇄ avenue ⇄ boulevard
   - through: gravel ⇄ road ⇄ arterial ⇄ boulevard
   A class may sit in both families (gravel, boulevard): `regradeOptions` lists every one-step move with its family, so
   the UI can offer "up (street)" and "up (road)" from gravel. Design it so new classes from the road catalogue (Phase 6R
   step 2: one-way, bus lanes, a centre turn lane, highways) slot in as data, not code.
2. **Prices** (pure functions of the class costs per tile, `cls.cost`, and the length, times `STRUCT_COST[kind]` for
   bridges and tunnels as `laneUpdate` does):
   - up: `(new.cost - old.cost) * len * struct + REGRADE_FIXED` (the old road's base is kept), never below a small floor;
   - down: the player pays a small works fee (`0.1 * old.cost * len`) and gets nothing back (roads are sunk cost), but
     the upkeep falls (show the upkeep change per day: `segUpkeep` in budget.ts);
   - export the constants so the lead can tune them.
3. **What blocks a move** (as `why` strings, the style of `laneUpdate`): the widest/narrowest class, a toll plaza
   (`tolls` passed in), a class still locked (a `classOpen(id)` callback), not enough money, and **room**: a wider road
   must fit its corridor (a callback `fits(seg, cls)` the lead supplies, which checks buildings; with Part B the blocked
   lots are offered for clearing instead of refused).
4. **The run:** reuse the idea of `straightChain` (engine.ts): a move applies to the straight run under the cursor, or,
   with a modifier, to only the one seg; return the segs and the per-seg prices.
5. **Junctions:** a downgrade to a class that cannot carry the junction type at either end (a roundabout or signals on a
   gravel road) lists those nodes so the lead can reset them to plain; an upgrade lists nodes whose turn radii or stop
   lines change (informational).

### API
```ts
export type Family = 'local' | 'through';
export interface RegradeMove { dir: 'up' | 'down'; family: Family; from: ClassId; to: ClassId }
export interface RegradePlan { segs: Seg[]; move: RegradeMove; cost: number; upkeepDelta: number /* $/day */; why: string; resetNodes: Node[] }
export function regradeOptions(cls: ClassId): RegradeMove[];
export function regradeCost(segs: { len: number; kind: SegKind }[], move: RegradeMove): number;
export function planRegrade(seg: Seg, move: RegradeMove, ctx: { money: number; tolls: Seg[]; classOpen: (id: ClassId) => boolean; fits: (s: Seg, c: RoadClass) => boolean; single?: boolean }): RegradePlan;
```

### Tests and numbers
Every class reaches every other class of its family by single steps, both ways, and nothing jumps more than one step;
up then down returns the original class; prices are positive, scale with length and the structure kind; the blocks fire
in the cases above; a gravel to street upgrade of 100 m costs less than building a new 100 m street. Print the price
table (each move, per 100 m) in the PR.

### Integration notes expected
How the Add lane tool becomes an **Upgrade / Downgrade** pair (keys, the hover text, the amber/red run preview as now),
how the family choice shows in the UI when there are two options, and what the lead must change in `WIDER`.

## Part B · Building roads over lots (confirm, with the cost, no bulldozing first) — `clearance.ts`

### Why
The owner: "you should be able to build over a lot: it just has to tell you, ask if you are sure and show you the cost.
You don't have to first bulldoze the place." Today the road tool refuses a route through a building
(`src/game/engine.ts` around line 662: "... is in the way — bulldoze it first"), and the player must bulldoze each
building (which buys the lot out: `compensation()` in `src/game/budget.ts`) before drawing the road.

### What to build
1. **The clearance of a route:** given the legs of a planned road, its class half width plus sidewalk (`cls.h +
   cls.walk`, tiles), the town's lots (`LotMap` / `Lot` in `src/game/lots/lots.ts`, with their `LotState` from
   `src/game/lots/town.ts`) and the placed big props (buildings: `LIBRARY[item].big`, not cars), find every lot and
   building the road's corridor touches. A lot counts as cleared if the corridor covers any of its buildings or more
   than a set share of its area (a constant); a lot only clipped at its edge loses that strip but keeps its building
   (list it as "trimmed").
2. **The bill:** the road's own cost (passed in), plus the `compensation()` of every cleared lot, plus a demolition fee
   per building; and what the city loses each day (the cleared lots' property tax: `lotTax()` in `budget.ts`).
   Also the residents and jobs displaced (`LotState.pop`, `.jobs`).
3. **The question to ask:** a pure model of the confirm dialog: a title, one line per cleared lot (use, level, the
   compensation), the totals, and the two buttons ("Build and clear 3 lots for $41,200" / "Cancel"). No React here;
   the lead renders it in `src/App.tsx`.
4. **Special places:** the stadium/business sites, car parks, toll plazas and bus stops are never cleared this way (the
   route is refused, with a reason); a listed building type the lead marks as protected (a set passed in) likewise.

### API
```ts
export interface ClearedLot { key: string; use: number; level: number; compensation: number; pop: number; jobs: number; buildings: number }
export interface Clearance { cleared: ClearedLot[]; trimmed: string[]; blocked: string /* '' if none */; roadCost: number; compensation: number; demolition: number; total: number; taxLostPerDay: number; displaced: { pop: number; jobs: number } }
export function routeClearance(legs: Leg[], halfWidth: number, roadCost: number, ctx: { lots: LotMap; state: (key: string) => LotState | undefined; buildings: { x0: number; y0: number; x1: number; y1: number; lot?: string }[]; protectedAreas: { x0: number; y0: number; x1: number; y1: number; why: string }[] }): Clearance;
export function confirmText(c: Clearance): { title: string; lines: string[]; ok: string; cancel: string };
```

### Tests and numbers
A route clear of lots has an empty clearance and total = road cost; a route through a row of houses clears exactly the
lots whose buildings it hits; an edge clip only trims; a protected area blocks with its reason; the totals add up;
deterministic. Print the bill of a sample route through a seeded town in the PR.

### Integration notes expected
How the road tool shows the preview (lots to be cleared tinted red, the total in the hover text), when the dialog
opens (on the click that finishes the route), how the cleared lots are bought out (the same path as the bulldozer's
buy-out) and rebuilt by the town elsewhere, and the undo story.

## Part C · Natural town layouts (a central feature, not a grid) — `townform.ts`

### Why
The owner wants more natural starting towns: "there may be a central structure that forces the town from being built
in a grid, like next to a river or a hill." Today every town is `townGrid()` (`src/game/lots/seedtowns.ts`): a square
lattice of `BLOCK`-tile blocks with an avenue through the middle, legs dropped where the ground is not GROUND/PATCH.
Phase 6R step 7 also makes the towns start as **small seeds** (a few streets inside their footprint, about 150
residents) that grow later, so the seed's shape decides how the whole town grows.

### What to build
A generator of town street seeds shaped by what is around the site (the terrain classes `TC` in
`src/game/terrain/types.ts`, read through a `classAt(x, y)` callback, and a height callback if useful). Pick the form
from the site, deterministically by a seed:
1. **River town:** a main street along the bank (following the river's curve at a set distance), short side streets
   up from it, maybe one bridge leg across (return it flagged so the lead builds it as a bridge).
2. **Hill town:** streets that follow the contours around a hill (or a ring around its foot) with a few steep links
   straight up, a lookout or church at the top as the central structure.
3. **Crossroads town:** two country roads meeting at a green or market square; the streets radiate along them.
4. **Square / green town:** a central square (a block left open: return it as a reserved area) with streets around it
   and lanes leaving it at irregular angles.
5. **Linear (ribbon) town:** houses along one road through a valley, with a few short spurs.
The grid stays as one option for flat open sites, but rarer. Streets may bend (polyline legs; keep segments at least
4 tiles and angles the road tool accepts: 90° and 45° bends are safe, other angles are fine where the network allows
them, see `src/game/snap.ts` and `RoadNetwork.addLegs`).

Rules: every leg stays on GROUND/PATCH with its half width (as `landOk` checks), the seed fits inside the town's
footprint (`towns[k].size`, see `townCentres`), the seed's streets are local classes only (gravel, lane, street), no
dead ends shorter than one lot, everything is connected, and the result says **where the town wants to grow** (a few
growth directions or frontier legs for the town's own gravel growth).

### API
```ts
export type TownForm = 'river' | 'hill' | 'crossroads' | 'square' | 'ribbon' | 'grid';
export interface TownSeed { form: TownForm; legs: Leg[]; cls: ClassId[]; bridges: number[] /* indexes into legs */; reserved: { x0: number; y0: number; x1: number; y1: number; what: string }[]; growth: { from: Pt; dir: Pt }[]; centre: Pt /* the central structure */ }
export function pickForm(site: { x: number; y: number; size: number }, classAt: (x: number, y: number) => number, seed: number): TownForm;
export function townSeed(site: { x: number; y: number; size: number }, classAt: (x: number, y: number) => number, seed: number, form?: TownForm, scale?: 'seed' | 'full'): TownSeed;
```
`scale: 'seed'` is the small start (about 150 residents' worth of frontage); `'full'` is a grown town of today's size
(the stamp `TOWN_POP` = 1000), so the lead can use either.

### Tests and numbers
Each form on a fitting synthetic site (a river strip, a round hill, flat land) gives connected legs, all on buildable
ground, inside the footprint, with no crossing legs except at shared ends; `pickForm` picks river next to water and
hill next to a hill; deterministic by seed. In the PR: an SVG or PNG contact sheet of the six forms (draw the legs
over the terrain classes, as a test output under `output/`) and the frontage (lot count) of each seed.

### Integration notes expected
How `seedTowns` in `src/game/engine.ts` and `townGrid` are replaced, how the lot cutter (`src/game/lots/lots.ts`)
handles bent streets, and how the town's growth uses `growth`.
