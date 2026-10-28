// T228 (#661, the owner's concept, 2026-10-27: "car parks full of colourful cars"): which bays of a car park its parked cars stand in, and which
// car parks are looked at. Every car park draws its cars: the city worker's (event, party and tournament cars: the engine's parked-car props,
// one per bay, from this), the range's golfers' (the range sim's own movers) and the club's everyday golfers' (T208's playback). The worker's
// count is all it says, so its cars take a fixed order of bays: car i always stands in the same bay (no reshuffle), an arrival fills the next
// bay and a departure frees the last. In a car park that also holds cars that draw themselves (the range's, the club's: they take the bays
// nearest the entrance, first free first), the worker's fill from the far end, so the two never share a bay until the car park is full.
// Car parks off screen are not looked at (no per-frame work, and their props, culled with their sprite tiles, cost nothing to draw).

/** the bay index of the worker's i-th parked car in a car park of `bays` bays (nearest its entrances first): i, or from the far end when shared */
export function workerBay(i: number, bays: number, shared: boolean): number { return shared ? bays - 1 - i : i; }

/** how many of the worker's `parked` cars a car park of `bays` bays shows: all of them, up to its bays */
export function workerShown(parked: number, bays: number): number { return Math.max(0, Math.min(parked, bays)); }

/** a tile box: x0 y0 x1 y1 */
export type TileBox = readonly [number, number, number, number];
/** the tile box round a car park's bays (each bay's point, grown by `pad` tiles), or null with none */
export function baysBox(bays: readonly { x: number; y: number }[], pad = 4): TileBox | null {
  if (!bays.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of bays) { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x); y1 = Math.max(y1, b.y); }
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
}
/** whether two tile boxes overlap */
export const boxesMeet = (a: TileBox, b: TileBox): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
