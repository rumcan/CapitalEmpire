// Intelligent Driver Model (Treiber, Hennecke, Helbing) car following. Pure TS, SI units.

/** driver and vehicle parameters (SI units) */
export interface Driver { a: number; b: number; T: number; s0: number; delta: number }
/** a typical car: max acceleration a, comfortable braking b (m/s^2), headway T (s), min gap s0 (m), free-road exponent */
export const CAR: Driver = { a: 1.5, b: 2.0, T: 1.2, s0: 2.0, delta: 4 };

/** IDM acceleration (m/s^2) for speed v, desired speed v0, gap to the leader's rear (m, Infinity = free road), dv = v - vLeader */
export function idm(d: Driver, v: number, v0: number, gap: number, dv: number): number {
  const w = v0 > 0.1 ? v0 : 0.1;
  const sStar = d.s0 + Math.max(0, v * d.T + v * dv / (2 * Math.sqrt(d.a * d.b)));
  const free = 1 - Math.pow(v / w, d.delta);
  const inter = gap === Infinity ? 0 : Math.pow(sStar / Math.max(gap, 0.01), 2);
  const r = d.a * (free - inter);
  return r < -9 ? -9 : r > d.a ? d.a : r;
}
