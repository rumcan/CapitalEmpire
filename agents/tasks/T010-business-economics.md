# T010 · Business economics (the business tree's numbers)

Status: open
Module: `src/game/ext/business/` · Tests: `tests/ext-business.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` and `docs/GAME-PLAN.md` section 1.0.00 ("the
businesses") first.

## Why
The player is the entrepreneur and the town planner: they place businesses (the stadium first), which unlock spin-offs
when they do well (the stadium → a bus company and a sports bar; a bass-fishing resort → a fish-and-tackle shop; a golf
course → a private golf estate whose lots the player sells; a casino → hotels; taxi services; …). Revenue is **per
visitor who arrives** (traffic still decides the income). This task is the **data and the formulas**, not the UI.

## What to build
- **The catalogue:** each business type with its footprint (tiles), build cost, upkeep per game day, visitor demand
  (visitors per game day as a function of the towns' population within reach and the business's level), the price per
  visitor, the opening hours / event schedule (the stadium: events; a golf course: daily; a casino: evenings), its
  unlock rule (parent business and the condition: a level, a run of good days, revenue), and the spin-offs it unlocks.
- **The formulas:** demand from population and travel time (a gravity model: demand falls with the trip time the caller
  measures), the satisfaction effect (late arrivals and long waits reduce the next days' demand), revenue, upkeep, levels
  (XP from satisfied visitors), and the golf estate's lot sales (lots priced by size and the course's level).
- At least 12 business types across sports, leisure, tourism, transport (bus company, taxi company), and property
  (estate lots), with sensible 1985 dollar values; a comment on each number's source or reasoning.

## API
```ts
export type BusinessId = string;
export interface BusinessType { id: BusinessId; name: string; family: 'sports' | 'leisure' | 'tourism' | 'transport' | 'property'; footprint: { w: number; h: number }; buildCost: number; upkeepPerDay: number; pricePerVisitor: number; schedule: 'event' | 'daily' | 'evening'; unlock: { parent: BusinessId | null; level?: number; goodDays?: number; revenue?: number }; spinOffs: BusinessId[] }
export const BUSINESSES: BusinessType[];
export function dailyDemand(type: BusinessType, level: number, catchment: { pop: number; tripMin: number }[], satisfaction: number): number;
export function satisfactionAfter(prev: number, arrivedOnTime: number, late: number, missed: number): number;
export function levelFromXp(xp: number): number;
export function unlockedBy(owned: { id: BusinessId; level: number; goodDays: number; revenue: number }[]): BusinessId[];
```

## Tests and numbers
Every type's unlock chain is reachable from the stadium; demand falls with trip time; satisfaction recovers; a 30-day
simulated play (simple loop in the test) of a sensible player stays solvent and unlocks at least 4 spin-offs. Print the
30-day money curve and the unlock order.

## Integration notes expected
How the lead places a business (footprint, doors, car parks), turns demand into trips (the crowd), and books revenue.
