// Emergencies and insurance (jam ticket J3; docs/JAM.md "Numbers"): each month a seeded roll may hit the club with a storm, a broken pump and so
// on; the insurance plan decides how much of the bill the player pays. The lesson is taught by the consequence: the same bill lands very
// differently on a club with a cash cushion or a plan and on one without. Pure TS, no DOM, deterministic for a (seed, month).
import { INSURANCE, book, type FinanceSave } from './finance';

export type Plan = FinanceSave['insurance'];
export const PLAN_IDS: readonly Plan[] = ['none', 'basic', 'full'];

/** the chance of an emergency in a month (JAM.md: 8% a month) */
export const EMERGENCY_CHANCE = 0.08;
/** the emergencies grow with the club: x1 at the range, x2 at this many holes and beyond */
export const SCALE_HOLES = 18;

export interface PlanInfo { id: Plan; name: string; premium: number; deductible: number; cover: number; blurb: string }
const NAMES: Record<Plan, [string, string]> = {
  none: ['No insurance', 'Free each month, but every bill is yours.'],
  basic: ['Basic cover', 'You pay the first $5,000 of a bill, then 30% of the rest.'],
  full: ['Full cover', 'You pay the first $1,000 of a bill, then 10% of the rest.'],
};
/** the insurance plans (the numbers are finance.ts INSURANCE's): the premium is paid every month by the month end; the deductible is what you pay
 *  first; the cover is the share of the rest paid for you */
export const PLANS: Record<Plan, PlanInfo> = Object.fromEntries(PLAN_IDS.map(id => [id, { id, name: NAMES[id][0], blurb: NAMES[id][1], ...INSURANCE[id] }])) as Record<Plan, PlanInfo>;

export interface Emergency { id: string; name: string; cost: number; insured: number; youPay: number }

interface Kind { id: string; name: string; lo: number; hi: number; needsFees?: boolean }
/** what can go wrong (JAM.md): a price range at the range; the flooded bunkers cost a week of green fees instead */
export const KINDS: readonly Kind[] = [
  { id: 'storm', name: 'Storm clean-up', lo: 3_000, hi: 12_000 },
  { id: 'pump', name: 'Irrigation pump failed', lo: 6_000, hi: 6_000 },
  { id: 'mower', name: 'Mower breakdown', lo: 4_000, hi: 4_000 },
  { id: 'drought', name: 'Drought water bill', lo: 2_000, hi: 5_000 },
  { id: 'flood', name: 'Flooded bunkers', lo: 0, hi: 0, needsFees: true },
];

const fin = (n: unknown, d = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : d);
/** a known plan, 'none' for anything else (an old or hand-edited save) */
export function asPlan(p: unknown): Plan { return p === 'basic' || p === 'full' ? p : 'none'; }

/** x1 at the range up to x2 at SCALE_HOLES holes: a bigger club has more to break */
export function holeScale(holes: number): number { return 1 + Math.min(1, Math.max(0, fin(holes)) / SCALE_HOLES); }

/** the monthly premium of a plan, 0 for an unknown one */
export function premiumOf(plan: Plan): number { return PLANS[asPlan(plan)].premium; }

/** what a bill costs the player under a plan: `insured` is paid by the insurer, `youPay` is yours (the two always add up to the cost) */
export function applyInsurance(cost: number, plan: Plan): { insured: number; youPay: number } {
  const c = Math.max(0, fin(cost));
  const p = PLANS[asPlan(plan)];
  const insured = Math.round(p.cover * Math.max(0, c - p.deductible));
  return { insured, youPay: c - insured };
}

/** a small seeded stream (mulberry32) of the (seed, month) pair */
function stream(seed: number, month: number): () => number {
  let a = (Math.imul(Math.floor(fin(seed)) | 0, 0x9e3779b1) ^ Math.imul(Math.floor(fin(month)) | 0, 0x85ebca6b) ^ 0x2545f491) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RiskCtx {
  /** the world seed */
  seed: number;
  /** the game month index (0 = the first month), so every month rolls differently */
  month: number;
  /** the holes built (the scale) */
  holes: number;
  /** what the flooded bunkers cost: a week of green fees (0 when there are none yet) */
  weeklyGreenFees: number;
  plan: Plan;
}

/** the month's emergency, or null (8% of months; the same (seed, month) always gives the same answer) */
export function rollEmergency(ctx: RiskCtx): Emergency | null {
  const r = stream(ctx.seed, ctx.month);
  if (!(r() < EMERGENCY_CHANCE)) return null;
  const fees = Math.max(0, fin(ctx.weeklyGreenFees));
  const pool = KINDS.filter(k => !k.needsFees || fees > 0);
  const k = pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))];
  const base = k.needsFees ? fees : k.lo + (k.hi - k.lo) * r();
  const cost = Math.max(0, Math.round((base * holeScale(ctx.holes)) / 50) * 50);
  if (cost <= 0) return null;
  return { id: k.id, name: k.name, cost, ...applyInsurance(cost, ctx.plan) };
}

/** Before the month closes (finance.ts monthEnd, which also charges the premium): roll the month's emergency and book its out-of-pocket share on the
 *  'emergency' line. `pay` takes the money out of the treasury (the caller's spend). Returns the emergency, or null. */
export function settleRisk(f: FinanceSave, ctx: Omit<RiskCtx, 'plan'>, pay: (amount: number) => void): Emergency | null {
  const e = rollEmergency({ ...ctx, plan: asPlan(f.insurance) });
  if (e && e.youPay > 0) { book(f, 'emergency', -e.youPay); pay(e.youPay); }
  return e;
}

/** After monthEnd: attach the emergency to the statement it hit, with a plain sentence in the report's events. */
export function noteEmergency(report: { events: string[]; emergencies?: Emergency[] }, e: Emergency | null): void {
  if (!e) return;
  (report.emergencies ??= []).push(e);
  report.events.push(emergencyLine(e));
}

/** the player's choice of plan, kept on the finance save (the Bank panel's Protection section calls this) */
export function setInsurance(f: FinanceSave, plan: Plan): void { f.insurance = asPlan(plan); }

/** the one line that says what happened, plain and short */
export function emergencyLine(e: Emergency): string {
  const m = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
  if (e.insured > 0) return `${e.name}: a ${m(e.cost)} bill. Insurance paid ${m(e.insured)}; you paid ${m(e.youPay)}.`;
  return `${e.name}: a ${m(e.cost)} bill, all yours.`;
}
