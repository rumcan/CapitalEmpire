// Car following for the driver-variety task (T009): the plain IDM, the improved IDM (IIDM) and the ACC model of Kesting,
// Treiber & Helbing, "Enhanced Intelligent Driver Model to Access the Impact of Driving Strategies on Traffic Capacity"
// (Phil. Trans. R. Soc. A 368, 2010), eqs. 2.1-2.4, with the IIDM of Treiber & Kesting, Traffic Flow Dynamics (2013),
// ch. 11 (the piecewise form used by Treiber & Kesting, "Automatic and efficient driving strategies...", eq. 1).
// Pure TS, SI units (m, m/s, m/s^2, s), allocation-free: every export takes and returns numbers only.

/** the acceleration exponent of the free-road term (IDM and IIDM), unitless (Treiber's usual 4) */
export const DELTA = 4;
/** the ACC's coolness factor c: 0.99 keeps 1% of the IIDM in the blend (Kesting et al. 2010; realistic 0.95-1.00) */
export const COOLNESS = 0.99;
/** the hardest braking any model here returns, m/s^2 (the same -9 floor as src/game/sim/idm.ts) */
export const MIN_ACC = -9;

/** the desired dynamic gap s* (m): s0 + max(0, v T + v dv / (2 sqrt(ab))), dv = v - vl the approaching rate (m/s) */
export function sStar(v: number, dv: number, a: number, b: number, T: number, s0: number): number {
  return s0 + Math.max(0, v * T + (v * dv) / (2 * Math.sqrt(a * b)));
}

/** clamp an acceleration to the model's range [MIN_ACC, a], m/s^2 */
export function capAcc(r: number, a: number): number { return r < MIN_ACC ? MIN_ACC : r > a ? a : r; }

/** plain IDM acceleration (m/s^2): v own speed, v0 desired speed, s bumper-to-bumper gap (m, Infinity = free road), dv = v - vl
 *  the approaching rate (m/s), a max acceleration, b comfortable braking, T time headway (s), s0 jam gap (m).
 *  Same model as src/game/sim/idm.ts (delta = 4, limited to [MIN_ACC, a]), with the parameters passed one by one. */
export function idm(v: number, v0: number, s: number, dv: number, a: number, b: number, T: number, s0: number): number {
  const w = v0 > 0.1 ? v0 : 0.1, r = v / w, r4 = DELTA === 4 ? (r * r) * (r * r) : Math.pow(r, DELTA);
  const sSt = sStar(v, dv, a, b, T, s0), z = sSt / Math.max(s, 0.01);
  return capAcc(a * (1 - r4 - (s === Infinity ? 0 : z * z)), a);
}

/** improved IDM acceleration (m/s^2), the same arguments and units as idm(). Below the desired speed the IIDM is
 *  a(1 - z^2) for z = sStar / s >= 1 and a_free (1 - z^(2a/a_free)) below it, so the steady-state gap is exactly s* (the time
 *  headway T holds); above v0 the free term is -b(1 - (v0/v)^2) and the interaction term is added only for z >= 1. */
export function iidm(v: number, v0: number, s: number, dv: number, a: number, b: number, T: number, s0: number): number {
  const w = v0 > 0.1 ? v0 : 0.1;
  let free: number;
  if (v <= w) { const r = v / w; free = a * (1 - (DELTA === 4 ? (r * r) * (r * r) : Math.pow(r, DELTA))); }
  else { const q = w / v; free = -b * (1 - q * q); }
  if (s === Infinity) return capAcc(free, a);
  const z = sStar(v, dv, a, b, T, s0) / Math.max(s, 0.01);
  let r: number;
  if (v <= w) {
    if (z >= 1) r = a * (1 - z * z);
    else if (free < 1e-9) r = 0; // at the desired speed there is no free acceleration left to scale
    else r = free * (1 - Math.exp(((2 * a) / free) * Math.log(z))); // z^(2a/a_free), exp/log is faster than pow
  } else r = z >= 1 ? free + a * (1 - z * z) : free;
  return capAcc(r, a);
}

/** constant-acceleration heuristic (m/s^2): the largest constant acceleration that keeps the gap non-negative if the
 *  leader keeps its acceleration al (m/s^2), capped at a -- Treiber & Kesting 2010, eq. 2.3. v own speed (m/s), s gap (m),
 *  vl the leader's speed (m/s), al the leader's acceleration (m/s^2), a the follower's max acceleration (m/s^2). */
export function cah(v: number, s: number, vl: number, al: number, a: number): number {
  const alEff = Math.min(al, a), g = Math.max(s, 0.01), den = vl * vl - 2 * g * alEff;
  // the leader stops before the gap closes: the exact constant-acceleration root (the denominator guard covers vl = al = 0)
  if (vl * (v - vl) <= -2 * g * alEff && den > 1e-9) return (v * v * alEff) / den;
  // otherwise only an approaching (v > vl) follower has to brake for the leader: the pure collision-free acceleration
  return alEff - (v > vl ? ((v - vl) * (v - vl)) / (2 * g) : 0);
}

/** ACC acceleration (m/s^2): the IIDM, replaced by the coolness blend with the CAH where the CAH is the more relaxed of
 *  the two (a_iidm < a_cah) -- Treiber & Kesting 2010, eq. 2.4. Arguments as idm(); al is the leader's acceleration
 *  (m/s^2). The result is never below the IIDM's (the ACC never brakes harder than the IIDM) and never above a. */
export function accACC(v: number, v0: number, s: number, vl: number, al: number, a: number, b: number, T: number, s0: number): number {
  const aI = iidm(v, v0, s, v - vl, a, b, T, s0), aC = cah(v, s, vl, al, a);
  if (aI >= aC) return aI;
  return capAcc((1 - COOLNESS) * aI + COOLNESS * (aC + b * Math.tanh((aI - aC) / b)), a);
}
