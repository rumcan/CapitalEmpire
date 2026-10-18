// The Toll Gate's definition (Phase 5 step 5a): a plaza seg of road with booths, identified by its end points and inbound direction. Pure TS, no DOM.
import { keyOf } from '../network';

/** a toll gate: the plaza seg's end points (tiles; inbound traffic runs a to b), its id and its booths */
export interface TollDef { id: number; ax: number; ay: number; bx: number; by: number /* the plaza seg's ends, tiles; inbound runs a → b */; booths: number }

/** the lane graph's key of the inbound directed seg of a toll gate: the same keys as lanes.ts dseg keys (`${keyOf(a)}>${keyOf(b)}`) */
export function plazaKey(d: TollDef): string { return `${keyOf({ x: d.ax, y: d.ay })}>${keyOf({ x: d.bx, y: d.by })}`; }
