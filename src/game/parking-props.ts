// The parking props' spots (docs/PARKING.md section 3): the entrance and exit gates, the P sign and the pay-and-display machine of a car park, lot or
// on-street run. Pure geometry; the engine places them as auto props (syncGates).
import type { CarPark } from './event/carpark';
import { sub, vlen } from './network';

/** a prop to place: its library item id, its centre (tiles) and whether it turns to run along Y (the gate art's arm runs along X) */
export interface GateSpot { item: string; x: number; y: number; flip: boolean }

/** the props of a car park or lot (its entrance gate and exit gate side by side at the entrance, just past the sidewalk, and a P sign beside them),
 *  or of an on-street run (a P sign and a pay-and-display machine on the sidewalk at its entrance); none if it has no entrance */
export function gateSpots(p: CarPark): GateSpot[] {
  const e = p.entrances[0];
  if (!e) return [];
  const s = p.seg, L = vlen(sub(s.b, s.a)) || 1;
  const tx = (s.b.x - s.a.x) / L, ty = (s.b.y - s.a.y) / L, pv = p.pv;
  const flip = Math.abs(ty) > Math.abs(tx);
  if (p.curb) {
    const d = s.cls.h + s.cls.walk * 0.5, sx = e.x + pv.x * d, sy = e.y + pv.y * d;
    return [{ item: 'ce:parking-sign', x: sx, y: sy, flip }, { item: 'ce:parking-paystation', x: sx + tx * 2, y: sy + ty * 2, flip }];
  }
  const d = s.cls.h + s.cls.walk + 1.2, qx = e.x + pv.x * d, qy = e.y + pv.y * d;
  return [
    { item: 'ce:parking-entry', x: qx - tx * 1.6, y: qy - ty * 1.6, flip },
    { item: 'ce:parking-exit', x: qx + tx * 1.6, y: qy + ty * 1.6, flip },
    { item: 'ce:parking-sign', x: qx + tx * 3.4 + pv.x * 0.6, y: qy + ty * 3.4 + pv.y * 0.6, flip },
  ];
}
