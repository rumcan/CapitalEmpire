# T014 · Building roads over lots (confirm, with the cost, no bulldozing first)

Status: open
Module: `src/game/ext/clearance/` · Tests: `tests/ext-clearance.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
The owner: "you should be able to build over a lot: it just has to tell you, ask if you are sure and show you the cost.
You don't have to first bulldoze the place." Today the road tool refuses a route through a building
(`src/game/engine.ts` around line 662: "... is in the way — bulldoze it first"), and the player must bulldoze each
building (which buys the lot out: `compensation()` in `src/game/budget.ts`) before drawing the road.

## What to build
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

## API
```ts
export interface ClearedLot { key: string; use: number; level: number; compensation: number; pop: number; jobs: number; buildings: number }
export interface Clearance { cleared: ClearedLot[]; trimmed: string[]; blocked: string /* '' if none */; roadCost: number; compensation: number; demolition: number; total: number; taxLostPerDay: number; displaced: { pop: number; jobs: number } }
export function routeClearance(legs: Leg[], halfWidth: number, roadCost: number, ctx: { lots: LotMap; state: (key: string) => LotState | undefined; buildings: { x0: number; y0: number; x1: number; y1: number; lot?: string }[]; protectedAreas: { x0: number; y0: number; x1: number; y1: number; why: string }[] }): Clearance;
export function confirmText(c: Clearance): { title: string; lines: string[]; ok: string; cancel: string };
```

## Tests and numbers
A route clear of lots has an empty clearance and total = road cost; a route through a row of houses clears exactly the
lots whose buildings it hits; an edge clip only trims; a protected area blocks with its reason; the totals add up;
deterministic. Print the bill of a sample route through a seeded town in the PR.

## Integration notes expected
How the road tool shows the preview (lots to be cleared tinted red, the total in the hover text), when the dialog
opens (on the click that finishes the route), how the cleared lots are bought out (the same path as the bulldozer's
buy-out) and rebuilt by the town elsewhere, and the undo story.
