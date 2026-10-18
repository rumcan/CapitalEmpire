// Driver variety (T009): per-slot driver parameters drawn from seeded shares (aggressive / normal / cautious, car or truck),
// and the shoulder decision of the impatient ones. The car-following equations are in acc.ts. Pure TS, no DOM, no random
// globals: the same seed and the same calls always give the same drivers.
import { clamp, mulberry } from '../../iso';

export { DELTA, COOLNESS, MIN_ACC, sStar, capAcc, idm, iidm, cah, accACC } from './acc';

/** the shares of new drivers, 0..1 (clamped in the constructor; aggressive + cautious <= 1, the rest normal):
 *  aggressive, cautious, and truckShare (the share of assignAuto's draws that are trucks) */
export interface DriverMix { aggressive: number; cautious: number; truckShare: number }

/** the driving styles (Drivers.style): normal, aggressive, cautious */
export const STYLE = { NORMAL: 0, AGGRESSIVE: 1, CAUTIOUS: 2 } as const;
/** a driver uses the shoulder only with its slip lane at most this far ahead, m */
export const SHOULDER_M = 80;
/** ... and only behind a queue of at least this many vehicles, veh */
export const SHOULDER_QUEUE = 3;

/** a normal car's parameters: desired speed factor, headway (s), max acceleration (m/s^2), comfortable braking (m/s^2),
 *  jam gap (m), MOBIL politeness, MOBIL threshold (m/s^2), reaction (s), patience before the shoulder (s) */
const CAR = { v0f: 1, T: 1.2, a: 1.5, b: 2, s0: 2, politeness: 0.3, threshold: 0.2, reaction: 0.3, impatience: 20 };
/** a normal truck's: slower, longer, gentler and more patient (the ACC paper's truck values, adapted to v0f 0.8) */
const TRUCK = { v0f: 0.8, T: 1.7, a: 0.7, b: 2, s0: 4, politeness: 0.45, threshold: 0.35, reaction: 0.5, impatience: 45 };
/** style factors on the parameters above, in the order v0f, T, a, b, s0, politeness, threshold, reaction, impatience:
 *  aggressive drivers faster and tighter, cautious ones slower, longer and more patient (a bigger impatience) */
const FACTOR = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1.08, 0.75, 1.2, 1.1, 0.8, 0.5, 0.7, 0.7, 0.5],
  [0.93, 1.3, 0.85, 0.9, 1.25, 1.6, 1.4, 1.5, 1.8],
];

/** the driver parameters of one traffic stream, drawn into typed arrays by slot. Call ensure(n) (or assign up to n - 1)
 *  before reading a slot; the arrays are replaced by larger ones when they grow, so read the getters again after ensure. */
export class Drivers {
  /** the seed the stream was built from (the save stores it) */
  readonly seed: number;
  /** the shares in use (the constructor's, clamped: aggressive, cautious in 0..1, aggressive + cautious <= 1) */
  readonly mix: DriverMix;
  /** the slots the arrays hold (ensure may make this larger than asked, by doubling) */
  cap = 0;
  /** per slot: the style drawn (STYLE) */
  style = new Uint8Array(0);
  /** per slot: 1 for a truck, 0 for a car */
  truck = new Uint8Array(0);
  private vr = new Float32Array(0); private tr = new Float32Array(0); private ar = new Float32Array(0);
  private br = new Float32Array(0); private sr = new Float32Array(0); private pr = new Float32Array(0);
  private hr = new Float32Array(0); private rr = new Float32Array(0); private ir = new Float32Array(0);
  private rnd: () => number;

  constructor(seed: number, mix: DriverMix) {
    this.seed = seed;
    const aggressive = clamp(mix.aggressive, 0, 1), cautious = clamp(mix.cautious, 0, 1 - aggressive);
    this.mix = { aggressive, cautious, truckShare: clamp(mix.truckShare, 0, 1) };
    this.rnd = mulberry(seed);
  }

  /** desired speed factor per slot, unitless: multiplies the lane's speed limit (1 = the limit) */
  get v0f(): Float32Array { return this.vr; }
  /** desired time headway per slot, s */
  get T(): Float32Array { return this.tr; }
  /** maximum acceleration per slot, m/s^2 */
  get a(): Float32Array { return this.ar; }
  /** comfortable braking per slot, m/s^2 (positive) */
  get b(): Float32Array { return this.br; }
  /** jam gap per slot, m */
  get s0(): Float32Array { return this.sr; }
  /** MOBIL politeness per slot, 0..1 */
  get politeness(): Float32Array { return this.pr; }
  /** MOBIL lane-change threshold per slot, m/s^2 */
  get threshold(): Float32Array { return this.hr; }
  /** reaction delay per slot, s (the sim should delay its acceleration by this much) */
  get reaction(): Float32Array { return this.rr; }
  /** seconds a slot's driver waits behind a queue before accepting smaller gaps or the shoulder, s */
  get impatience(): Float32Array { return this.ir; }

  /** grows every per-slot array to hold at least cap slots (doubling; existing values are kept) */
  ensure(cap: number): void {
    if (cap <= this.cap) return;
    const n = Math.max(cap, this.cap * 2, 32);
    const g = (a: Float32Array) => { const b = new Float32Array(n); b.set(a); return b; };
    this.vr = g(this.vr); this.tr = g(this.tr); this.ar = g(this.ar); this.br = g(this.br); this.sr = g(this.sr);
    this.pr = g(this.pr); this.hr = g(this.hr); this.rr = g(this.rr); this.ir = g(this.ir);
    const st = new Uint8Array(n); st.set(this.style); this.style = st;
    const tk = new Uint8Array(n); tk.set(this.truck); this.truck = tk;
    this.cap = n;
  }

  /** draws slot's parameters: a style in the mix's shares, a car's or a truck's base values times the style's factors and
   *  a seeded jitter (+-4% on v0f, +-8% on the rest), clamped to sane ranges. Grows the arrays if the slot is new. */
  assign(slot: number, kind: 'car' | 'truck'): void {
    if (slot < 0) return;
    if (slot >= this.cap) this.ensure(slot + 1);
    const r = this.rnd();
    const st = r < this.mix.aggressive ? STYLE.AGGRESSIVE : r < this.mix.aggressive + this.mix.cautious ? STYLE.CAUTIOUS : STYLE.NORMAL;
    const B = kind === 'truck' ? TRUCK : CAR, F = FACTOR[st]!;
    this.style[slot] = st; this.truck[slot] = kind === 'truck' ? 1 : 0;
    this.vr[slot] = clamp(B.v0f * F[0]! * (0.96 + 0.08 * this.rnd()), 0.5, 1.3);
    this.tr[slot] = clamp(B.T * F[1]! * (0.92 + 0.16 * this.rnd()), 0.6, 3);
    this.ar[slot] = clamp(B.a * F[2]! * (0.92 + 0.16 * this.rnd()), 0.4, 3);
    this.br[slot] = clamp(B.b * F[3]! * (0.92 + 0.16 * this.rnd()), 1, 4);
    this.sr[slot] = clamp(B.s0 * F[4]! * (0.92 + 0.16 * this.rnd()), 1, 6);
    this.pr[slot] = clamp(B.politeness * F[5]! * (0.92 + 0.16 * this.rnd()), 0.05, 0.95);
    this.hr[slot] = clamp(B.threshold * F[6]! * (0.92 + 0.16 * this.rnd()), 0.05, 0.8);
    this.rr[slot] = clamp(B.reaction * F[7]! * (0.92 + 0.16 * this.rnd()), 0.1, 1.2);
    this.ir[slot] = clamp(B.impatience * F[8]! * (0.92 + 0.16 * this.rnd()), 3, 150);
  }

  /** draws the kind from mix.truckShare, assigns the slot and returns the kind drawn */
  assignAuto(slot: number): 'car' | 'truck' {
    const kind = this.rnd() < this.mix.truckShare ? 'truck' : 'car';
    this.assign(slot, kind);
    return kind;
  }

  /** true when slot's driver would use the shoulder: waited s behind a queue of at least SHOULDER_QUEUE vehicles, with its
   *  slip lane within SHOULDER_M m ahead (toSlip, m; pass -1 or Infinity when there is none). A decision only: the sim moves
   *  the car. The slot must have been assigned. */
  wantsShoulder(slot: number, waited: number, queueLen: number, toSlip: number): boolean {
    return slot >= 0 && slot < this.cap && toSlip >= 0 && toSlip <= SHOULDER_M && queueLen >= SHOULDER_QUEUE && waited >= this.ir[slot]!;
  }
}
