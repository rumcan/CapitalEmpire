// T334 part 2 (#960; the owner, 2026-11-04: "Shape the ball"): shot shaping. Before the swing the player picks the curve (draw, straight, fade) and the flight (low, normal, high); the shot
// then flies that way, at a cost in skill:
// - A draw curves left and a fade right (SHAPE.curveDeg over a 200 m carry, the more the longer the shot), a draw runs on and a fade checks (T318's spin takes a dot on the ball and curves
//   it too; the two add). How much of the shape a golfer pulls off (`work`) rises with his skill for the club: half at skill 0, all of it at 1.
// - A high flight carries a little less and lands soft (little run), and the wind has more of it; a low flight carries less too but runs on, the wind has less of it, and it is the more
//   accurate shot (the owner's card idea: "driver off the deck: a lower ball flight but more accuracy").
// - The cost: each pick makes the swing's miss bigger (the meter's accuracy click: a draw x1.35, a flight x1.2, both x1.55), widens the scatter by what he does not pull off, and adds a
//   chance of a mishit for a golfer without the skill.
// The shape is saved with the input (live.ts OwnerInput.shape; absent: none, a shot from before T334's part 2 played as before). Pure TS, no DOM, no draws.
import type { Club } from './types';
import type { ClubKit } from './mods';

/** the pick: the curve (-1 draw, 0 straight, 1 fade) and the flight (-1 low, 0 normal, 1 high) */
export interface ShotShape { curve: -1 | 0 | 1; flight: -1 | 0 | 1 }
export const NO_SHAPE: Readonly<ShotShape> = { curve: 0, flight: 0 };
/** the shape's numbers: the curve (degrees over a 200 m carry, held between curveK), the share of the shape pulled off at skill 0 (`work`), the miss's growth per pick (a curve, a flight), the
 *  scatter a shape not pulled off adds (per pick, times what was not pulled off), the mishit chance a pick adds at skill 0 (falls to 0 at skill 1), what a draw's run and a fade's check
 *  change (per 1 of curve), and the high and low flights' factors on the carry, the run, the wind and the scatter */
export const SHAPE = {
  curveDeg: 5, curveK: [0.4, 1.2], work: 0.5, missCurve: 0.35, missFlight: 0.2, scatter: 0.5, mishit: 0.05, runCurve: 0.15,
  high: { carry: 0.95, run: 0.55, wind: 1.3, spread: 1.05 }, low: { carry: 0.93, run: 1.7, wind: 0.6, spread: 0.85 },
} as const;

/** a shape as a save keeps it, or null when it is none (absent, junk or the straight normal shot) */
export function readShape(v: unknown): ShotShape | null {
  const o = v as Partial<ShotShape> | null;
  if (!o || typeof o !== 'object') return null;
  const c = Math.sign(Math.round(Number(o.curve) || 0)), f = Math.sign(Math.round(Number(o.flight) || 0));
  return c || f ? { curve: c as -1 | 0 | 1, flight: f as -1 | 0 | 1 } : null;
}

/** what a shape does to a shot: the curve (radians, + right as the golfer faces the aim), the factors on the carry, the run, the wind's multiplier (the shot's height) and the scatter, the swing's
 *  miss factor, and the mishit chance added */
export interface ShapeFx { curve: number; carry: number; run: number; wind: number; spread: number; miss: number; mishit: number; pulled: number }
export const NO_FX: Readonly<ShapeFx> = { curve: 0, carry: 1, run: 1, wind: 1, spread: 1, miss: 1, mishit: 0, pulled: 1 };

/** the effect of a shape for a club played at `skill` (0..1) over a carry of carryM metres, the golfer's kit for the club (null: none) lifting how much he pulls off. A putt has no shape */
export function shapeEffect(shape: ShotShape | null | undefined, club: Club, carryM: number, skill: number, kit: ClubKit | null = null): ShapeFx {
  if (!shape || club === 'putter' || (!shape.curve && !shape.flight)) return { ...NO_FX };
  const picks = (shape.curve ? 1 : 0) + (shape.flight ? 1 : 0), control = kit ? (kit.stats.accuracy - 0.5) * 0.3 : 0;
  const pulled = Math.min(1, Math.max(SHAPE.work, SHAPE.work + (1 - SHAPE.work) * (Math.min(1, Math.max(0, skill)) + control)));
  const fl = shape.flight > 0 ? SHAPE.high : shape.flight < 0 ? SHAPE.low : null;
  const k = Math.min(SHAPE.curveK[1], Math.max(SHAPE.curveK[0], carryM / 200));
  return {
    curve: shape.curve * SHAPE.curveDeg * pulled * k * Math.PI / 180,
    carry: fl ? fl.carry : 1, run: (fl ? fl.run : 1) * (1 - SHAPE.runCurve * shape.curve), wind: fl ? fl.wind : 1,
    spread: (fl ? fl.spread : 1) * (1 + SHAPE.scatter * (1 - pulled) * picks),
    miss: 1 + SHAPE.missCurve * (shape.curve ? 1 : 0) + SHAPE.missFlight * (shape.flight ? 1 : 0),
    mishit: SHAPE.mishit * (1 - Math.min(1, Math.max(0, skill))) * picks, pulled,
  };
}

/** the pick as the player reads it: "Draw, high", "Fade", "Low", "Straight" (pickText, not shapeText: swing.ts has a shapeText, the swing's own miss) */
export function pickText(s: ShotShape | null | undefined): string {
  if (!s || (!s.curve && !s.flight)) return 'Straight';
  const c = s.curve < 0 ? 'Draw' : s.curve > 0 ? 'Fade' : '', f = s.flight < 0 ? 'low' : s.flight > 0 ? 'high' : '';
  return c && f ? `${c}, ${f}` : c || f[0]!.toUpperCase() + f.slice(1);
}

/** the shape's effect as lines for the panel: which way and how much it curves over this carry, what the flight does to the carry, the run and the wind, and what it costs (the share of the shape
 *  he pulls off, the swing's miss times): "curves left 4°", "-5% carry · lands soft · wind x1.3", "70% pulled off · miss x1.55" */
export function shapeLines(s: ShotShape | null | undefined, fx: ShapeFx): string[] {
  if (!s || (!s.curve && !s.flight)) return [];
  const out: string[] = [], deg = Math.abs(fx.curve) * 180 / Math.PI, pc = (f: number) => `${f >= 1 ? '+' : '-'}${Math.abs(Math.round((f - 1) * 100))}%`;
  if (s.curve) out.push(`curves ${s.curve < 0 ? 'left' : 'right'} ${deg.toFixed(deg < 10 ? 1 : 0)}°, ${s.curve < 0 ? 'runs on' : 'checks'}`);
  if (s.flight > 0) out.push(`${pc(SHAPE.high.carry)} carry · lands soft · wind x${SHAPE.high.wind.toFixed(1)}`);
  if (s.flight < 0) out.push(`${pc(SHAPE.low.carry)} carry · runs on · wind x${SHAPE.low.wind.toFixed(1)} · tighter`);
  out.push(`${Math.round(fx.pulled * 100)}% pulled off · miss x${fx.miss.toFixed(2)}`);
  return out;
}
