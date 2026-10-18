# T013 · Road upgrades and downgrades (a class ladder with prices)

Status: open
Module: `src/game/ext/regrade/` · Tests: `tests/ext-regrade.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner: "there's an Add button that makes a dirt road into an arterial one. It is important that roads can easily
up- or downgrade at a price." Today the **Add lane** tool (`src/game/engine.ts` `laneUpdate` / `laneClick`) uses
`WIDER` in `src/game/network.ts` line 46, which sends gravel, lane, street and road straight to arterial (and avenue to
boulevard): one click turns a dirt track into a 4-lane road. There is no way down at all, and the price is the full
cost of the new class with nothing back for the old road.

## What to build
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
   must fit its corridor (a callback `fits(seg, cls)` the lead supplies, which checks buildings; with T014 the blocked
   lots are offered for clearing instead of refused).
4. **The run:** reuse the idea of `straightChain` (engine.ts): a move applies to the straight run under the cursor, or,
   with a modifier, to only the one seg; return the segs and the per-seg prices.
5. **Junctions:** a downgrade to a class that cannot carry the junction type at either end (a roundabout or signals on a
   gravel road) lists those nodes so the lead can reset them to plain; an upgrade lists nodes whose turn radii or stop
   lines change (informational).

## API
```ts
export type Family = 'local' | 'through';
export interface RegradeMove { dir: 'up' | 'down'; family: Family; from: ClassId; to: ClassId }
export interface RegradePlan { segs: Seg[]; move: RegradeMove; cost: number; upkeepDelta: number /* $/day */; why: string; resetNodes: Node[] }
export function regradeOptions(cls: ClassId): RegradeMove[];
export function regradeCost(segs: { len: number; kind: SegKind }[], move: RegradeMove): number;
export function planRegrade(seg: Seg, move: RegradeMove, ctx: { money: number; tolls: Seg[]; classOpen: (id: ClassId) => boolean; fits: (s: Seg, c: RoadClass) => boolean; single?: boolean }): RegradePlan;
```

## Tests and numbers
Every class reaches every other class of its family by single steps, both ways, and nothing jumps more than one step;
up then down returns the original class; prices are positive, scale with length and the structure kind; the blocks fire
in the cases above; a gravel to street upgrade of 100 m costs less than building a new 100 m street. Print the price
table (each move, per 100 m) in the PR.

## Integration notes expected
How the Add lane tool becomes an **Upgrade / Downgrade** pair (keys, the hover text, the amber/red run preview as now),
how the family choice shows in the UI when there are two options, and what the lead must change in `WIDER`.
