// The shuttle buses (Phase 5 step 6a): a route runs from a car park's lot stop (where its party's fans queue and board) to the doors stop
// (where they alight and walk to the stadium's door). Pure TS, no DOM: the City resolves the stops on the lane graph; the sim drives the buses.

/** a shuttle route as the player draws it: its car park (id), the lot stop (sx, sy: a point on a road beside the car park, tiles), the doors stop
 *  (dx, dy: a point on a road beside the stadium, tiles), its buses and its seats. A route whose stop cannot be resolved is inactive.
 *  A stop beside a town's public car park lot: park 0 and town (the town's index); the town's parties within BUS_WALK of the stop take its bus */
export interface BusRouteDef { id: number; park: number; sx: number; sy: number; dx: number; dy: number; buses: number; seats: number; town?: number }
/** a resolved stop: a dseg and metres along its kerb lane (the rightmost lane of the dseg) */
export interface BusStop { dseg: number; s: number }
/** a route as the sim drives it: its lot stop, its doors stop and its seats */
export interface BusRoute { lot: BusStop; doors: BusStop; seats: number }
