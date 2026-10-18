# T011 · Taxi service (fleet and dispatch model)

Status: open
Module: `src/game/ext/taxi/` · Tests: `tests/ext-taxi.test.ts`
Spec by the lead, 2026-10-18. Read `agents/arena/INSTRUCTIONS.md` first.

## Why
A taxi company is one of the businesses the player can start: taxis wait at ranks (the stadium, the towns), take fares
to their destinations, earn per km, and reduce the cars on the road during events.

## What to build (the dispatch brain; the lead drives the taxis as sim vehicles)
- **Ranks** (points) and a **fleet** of taxis with states: idle at a rank, driving to a pickup, carrying a fare, returning.
- **Requests:** a party (1–4 people) wants to go from A to B at time t; the dispatcher assigns the nearest idle taxi by
  travel time (the caller supplies a travel-time function), or queues the request; parties give up after a wait limit.
- **Fares:** a flag fall plus per km plus per minute (1985 prices); the company's revenue, the drivers' cost per hour,
  fuel per km.
- **Rebalancing:** idle taxis return to the rank with the most waiting demand.

## API
```ts
export interface Rank { id: number; at: Pt; capacity: number }
export interface Request { id: number; from: Pt; to: Pt; people: number; t: number; maxWait: number }
export interface Order { taxi: number; request: number; kind: 'pickup' | 'dropoff' | 'rank'; to: Pt }
export class Taxis {
  constructor(seed: number, ranks: Rank[], fleet: number, travelTime: (a: Pt, b: Pt) => number /* s */);
  request(r: Request): void;
  /** the caller reports taxis that reached their target; returns the next orders to drive */
  step(t: number, reached: number[]): Order[];
  stats(): { served: number; gaveUp: number; revenue: number; costs: number; meanWait: number };
}
```

## Tests and numbers
A rank with 5 taxis and 100 requests over an hour: served, gave up, mean wait; dispatch picks the nearest idle taxi;
rebalancing moves idle taxis toward demand; revenue minus costs over a day for 1, 5, 20 taxis (print the curve).

## Integration notes expected
How the lead spawns taxis as sim vehicles (a vtype), where requests come from (the crowd, town trips), the rank tool.
