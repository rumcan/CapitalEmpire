// The owner's group, played live (docs/GOLF-PLAY.md decision 7, P4a): playRound with { live } plays the day up to the owner's first strike, and
// LiveGroup plays on as he does. The whole field plays in one time order (round.ts Field, T211): the others strike by the model up to the owner's next
// strike, which waits for his input (play), or by the model too once he caddies. The owner's shot takes his input's club, aim and power through the same
// hit model. Pure TS, no DOM.
import { TILE_M } from '../types';
import { appendShots, FLIGHT_TIME, liveField, PUTT_FLIGHT } from './round';
import type { Due, Field, HoleRun, PlayCtx, Player } from './round';
import { PUTT_V2, carryFor, chooseShot, hitShot, luckyPutt, putt, rng, type ShotSkill } from './shot';
import { hasMech, kitOf, type ModCtx } from './mods';
import { readShape, shapeEffect, type ShotShape } from './shape';
import { holeFrom } from './courseview';
import { BOOST, METER, METER_ANG, MIN_SWING_POWER, readSwing, swingEffect, type SwingOutcome } from './swing';
import { readSpin, spinEffect, type SpinInput } from './spin';
import { readEnv, type ShotEnv } from './conditions';
import type { Club, CourseView, Landing, Lie, PlayHole, Pt, RoundPlan, Shot } from './types';

/** the owner's input for his shot at a turn: the hole index and stroke it answers, the club, the aim point, and the power: 0.3..1 of the club's full
 *  carry (the putter: 0.5..1.5 of the putt's length). T316: swing, the 3-click meter's outcome (swing.ts): with it the meter's power, miss and spread
 *  play the shot and `power` is only the slider's (absent: a shot from before T316, played exactly as before). T318: spin, the ball's dot and the
 *  clicks added in the air (spin.ts; a full shot only; absent: no spin, a shot from before T318 played exactly as before). T334: env, the conditions the shot was
 *  struck in (conditions.ts: the wind, the lie's kind, the slope; a full shot only; absent: none, a shot from before T334 played exactly as before). T334: v, the version of the
 *  shot model the input was struck under (absent: 1, as before; 2: the putting's second version, shot.ts PUTT_V2); the engine writes MODEL_V on every input it plays. T334 part 2: shape,
 *  the curve and the flight he picked before the swing (shape.ts; a full shot only; absent: none, a shot from before played exactly as before). T337 (#963): cad, the shot was played as the caddie
 *  said (his club on his line: the Mic'd-Up Caddie's mods for the moment `follow`); scr, a second ball was hit from the tee and the better stood (the Scramble Captain: once a nine); both only with the card, absent: none */
export interface OwnerInput { holeIdx: number; stroke: number; club: Club; aim: Pt; power: number; swing?: SwingOutcome; spin?: SpinInput; env?: ShotEnv; v?: number; shape?: ShotShape; cad?: true; scr?: true }

/** T337: what the round knows of a shot that the shot itself does not: whether it is on the round's last hole (the moment `last`) */
export interface ShotCtx { last?: boolean }
/** T337: the hooks of the cards that move or drop a ball after the hit: a tee shot in the rough rolls back to the fairway (Fairway Finder: the chance, how far it looks in tiles), a wedge shot that finishes within `trickM` of the cup drops
 *  one time in `trickP` (Backyard Trick Shot), a par 3's tee shot within `aceM` drops one time in `aceP` (Ace Magnet). Each takes its draw only when the card is there and the shot qualifies */
export const CARD_HOOKS = { finderP: 0.3, finderReach: 14, trickM: 2, trickP: 1 / 6, aceM: 6, aceP: 0.2 } as const;
/** the wedges Backyard Trick Shot plays from any lie */
const WEDGES: readonly Club[] = ['pw', 'gw', 'sw', 'lw'];
/** the first fairway lie on the way from p to the hole's line (a step of a tile, at most `reach` tiles), or null: where a Fairway Finder's ball rolls back to */
function backToFairway(view: CourseView, hole: PlayHole, p: Pt, reach: number): Pt | null {
  let best: Pt | null = null, bd = Infinity;
  for (let i = 0; i + 1 < hole.line.length; i++) {
    const a = hole.line[i]!, b = hole.line[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0, q = { x: a.x + dx * t, y: a.y + dy * t }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  if (!best || bd < 1e-6) return null;
  const ux = (best.x - p.x) / bd, uy = (best.y - p.y) / bd;
  for (let s = 1; s <= reach && s <= bd + 1; s++) { const q = { x: p.x + ux * s, y: p.y + uy * s }; if (view.lieAt(q.x, q.y) === 'fairway') return q; }
  return null;
}
/** the shot model's current version (OwnerInput.v): 2 since T334 (the putting) */
export const MODEL_V = 2;
/** the owner's turn: his golfer, the hole (index, number, par), the stroke he plays, the minute he strikes, his lie, his ball and the pin (tiles), the
 *  distance to the pin (metres), and the suggested shot: the model's club and aim, and the power that carries to the aim (1 on the green) */
export interface OwnerTurn { golfer: number; holeIdx: number; hole: number; par: number; stroke: number; t: number; lie: Lie; ball: Pt; pin: Pt; distM: number;
  suggested: { club: Club; aim: Pt; power: number } }

/** the power range of a full shot or a chip, and of a putt (the putt's length) */
export const POWER = [0.3, 1], PUTT_POWER = [0.5, 1.5];
/** a putt holes only with its aim within this many degrees of the pin */
const AIM_DEG = 3;

/** v clamped to [lo, hi] */
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** the owner's group of a round, played a turn at a time. Build it on a plan made by playRound with { live } (the day played up to his first strike).
 *  advance() returns the owner's next turn, or null when the group is done; play(input) plays that turn; advance again. T211: the whole field plays on
 *  with him in one time order (round.ts Field), so the groups behind him wait for him and play on as he does */
export class LiveGroup {
  /** every input played, in order (the save) */
  readonly inputs: OwnerInput[] = [];
  private plan: RoundPlan; private ctx: PlayCtx; private field: Field; private due: Due | null = null;
  private turn: OwnerTurn | null = null; private player: Player | null = null;

  /** the group groupIdx (an index into plan.groups), seed as playRound's. Throws when the plan was not made by playRound with { live: groupIdx } */
  constructor(plan: RoundPlan, view: CourseView, groupIdx: number, seed: number) {
    const gr = plan.groups[groupIdx];
    if (!gr) throw new Error(`LiveGroup: no group ${groupIdx}`);
    const lf = liveField(plan);
    if (!lf || lf.live !== groupIdx) throw new Error('LiveGroup: the group has shots already (play the plan with { live })');
    if (lf.field.c.view !== view || lf.field.c.seed !== seed) throw new Error('LiveGroup: the view and seed must be the plan’s');
    this.plan = plan; this.field = lf.field; this.ctx = lf.field.c;
  }

  /** plays the day up to the owner's next strike and returns that turn (it comes back until he plays it); null once the group is done. After
   *  caddie(), the owner is played by the model and this runs the day to the end */
  advance(): OwnerTurn | null {
    if (this.turn && !this.field.caddied) return this.turn;
    this.turn = null; this.player = null;
    this.due = this.field.run();
    this.flush();
    if (!this.due) return null;
    this.player = this.due.p; this.turn = this.turnOf(this.due.p, this.due.g.hole!, this.due.t);
    return this.turn;
  }

  /** plays the owner's shot at the turn advance() returned, from his input, and appends it (then advance for the next turn). Throws without a turn, or
   *  when the input is for another hole or stroke */
  play(input: OwnerInput): Shot {
    const turn = this.turn, p = this.player, g = this.due?.g, hr = g?.hole;
    if (!turn || !p || !g || !hr || this.field.caddied) throw new Error('LiveGroup.play: no owner turn to play (call advance first)');
    if (input.holeIdx !== turn.holeIdx || input.stroke !== turn.stroke) throw new Error(`LiveGroup.play: the input is for hole ${input.holeIdx} stroke ${input.stroke}, the turn is hole ${turn.holeIdx} stroke ${turn.stroke}`);
    const r = rng(this.ctx.seed, p.id, hr.h * 32 + turn.stroke);
    const { to, lie, penalty, holed, landing, sw, spin, env, shape } = shotOutcome(this.ctx.view, this.ctx.view.holes[hr.h]!, p.ball, p.lie, p.sk, input, r, { last: hr.h === this.ctx.view.holes.length - 1 });
    const putting = input.club === 'putter';
    const s = hr.record(p, input.club, turn.t, putting ? PUTT_FLIGHT : FLIGHT_TIME, to, lie, penalty, holed, landing);
    this.inputs.push({ holeIdx: input.holeIdx, stroke: input.stroke, club: input.club, aim: { x: input.aim.x, y: input.aim.y }, power: input.power, ...(sw ? { swing: sw } : {}), ...(spin ? { spin } : {}), ...(env ? { env } : {}), ...(shape ? { shape } : {}), ...(input.cad && hasMech(p.sk, 'caddie') ? { cad: true as const } : {}), ...(input.scr && hasMech(p.sk, 'scramble') ? { scr: true as const } : {}), ...((input.v ?? 1) >= 2 ? { v: MODEL_V } : {}) });
    this.field.settle(g);
    this.turn = null; this.player = null; this.due = null;
    this.flush();
    return s;
  }

  /** from now on the owner's golfer is played like the others: advance() runs him to the end (a turn pending now is played by the model) */
  caddie(): void { this.field.caddied = true; }

  /** plays the saved inputs in order, each at its turn: a new LiveGroup on a fresh playRound of the same seed reaches the same state. Throws when the
   *  round is over before the inputs are */
  replay(inputs: OwnerInput[]): void {
    for (const i of inputs) { if (!this.advance()) throw new Error('LiveGroup.replay: the round is over before the inputs are'); this.play(i); }
  }

  /** the owner's turn at the golfer p's stroke on the hole hr at minute t (his group's pace and the group ahead's gate), and the model's suggestion for his lie (on the green the putter at
   *  the pin; else the club and aim chooseShot gives, and the power that carries to the aim) */
  private turnOf(p: Player, hr: HoleRun, t: number): OwnerTurn {
    const hole = holeFrom(this.ctx.view.holes[hr.h]!, p.set), sg = chooseShot(p.lie, p.ball, hole, p.sk, p.lie === 'tee'), putting = sg.club === 'putter'; // T254: his set's line
    const distM = Math.hypot(hole.pin.x - p.ball.x, hole.pin.y - p.ball.y) * TILE_M, dM = Math.hypot(sg.aim.x - p.ball.x, sg.aim.y - p.ball.y) * TILE_M;
    const power = putting ? 1 : clamp(dM / carryFor(p.sk, sg.club), POWER[0]!, POWER[1]!);
    return { golfer: p.id, holeIdx: hr.h, hole: hole.n, par: hole.par, stroke: p.strokes + 1, t, lie: p.lie, ball: { x: p.ball.x, y: p.ball.y },
      pin: { x: hole.pin.x, y: hole.pin.y }, distM, suggested: { club: sg.club, aim: { x: sg.aim.x, y: sg.aim.y }, power } };
  }

  /** appends the shots played since the last append to the plan */
  private flush(): void { const o = this.ctx.out; if (o.length) { appendShots(this.plan, o); o.length = 0; } }
}

/** T317: the owner's shot from his input, through the one shot model (LiveGroup.play's, and your own round's, play/yours.ts): from the ball at `from` on
 *  the lie `lie` on the hole `hole` of `view`, with the skill sk and the stream r. T316: the swing meter's outcome (when he swung it) plays its power, miss
 *  and spread; without it the input's power. Returns where the ball came to rest, its lie, the penalty, whether it went in, the full shot's landing, and
 *  the swing read (null: none), the spin read (T318; null: none) and the conditions read (T334; null: none) */
export function shotOutcome(view: CourseView, hole: PlayHole, from: Pt, plie: Lie, sk: ShotSkill, input: Omit<OwnerInput, 'holeIdx' | 'stroke'>, r: () => number, sctx?: ShotCtx):
  { to: Pt; lie: Lie; penalty: 0 | 1; holed: boolean; landing: Landing | undefined; sw: SwingOutcome | null; spin: SpinInput | null; env: ShotEnv | null; shape: ShotShape | null } {
  const putting = input.club === 'putter';
  let to: Pt, lie: Lie, penalty: 0 | 1 = 0, holed = false, landing: Landing | undefined;
  // T316: the swing meter's outcome (when he swung it): its power, its miss (radians off the aim, + right as he faces it) and spread
  const spin0 = !putting && input.spin ? readSpin(input.spin) : null; // (T318: a putt takes no spin)
  // T336 (#962): spin added in the air is a card's (Mid-Flight Whisper): without the mechanic the clicks count for none (a golfer whose skills list no mechanics has it, as before the cards)
  const spin = spin0 && spin0.pump > 0 && !hasMech(sk, 'airspin') ? { ...spin0, pump: 0 } : spin0;
  const env = !putting && input.env ? readEnv(input.env) : null; // (T334: nor the wind, the lie's kind or the slope: a putt never leaves the ground)
  const shape = !putting && input.shape ? readShape(input.shape) : null; // (T334 part 2: a putt takes no shape)
  // (T337: the moment of the shot: a tee shot, the driver off the deck, the round's last hole, a shot played as the caddie said: the mods for it apply, and with none nothing is different)
  const mctx: ModCtx = { lie: plie, tee: plie === 'tee', deck: input.club === 'driver' && plie !== 'tee', last: sctx?.last === true, follow: input.cad === true && hasMech(sk, 'caddie') };
  const kit = kitOf(sk, input.club, mctx); // (his stats and mods for the club: the sweet spot, the scatter, the carry; neutral for a plain skill)
  // (T336: and the Space power-spam is Power Mash's: without the mechanic the boost is none)
  const sw0 = input.swing ? readSwing(input.swing) : null, sw = sw0 && sw0.boost > 0 && !hasMech(sk, 'boost') ? { ...sw0, boost: 0 } : sw0;
  const eff = sw ? swingEffect(sw, kit.skill, putting, kit.sweet, kit.miss) : null, miss = eff ? eff.deg * Math.PI / 180 : 0; // (the kit's skill is skillFor's, with the moment's mods; kit.miss: the Self-Correcting Ball's half)
  if (putting) {
    const pw = eff ? clamp(eff.power, MIN_SWING_POWER, METER.top + BOOST.max) : clamp(input.power, PUTT_POWER[0]!, PUTT_POWER[1]!);
    const dx = hole.pin.x - from.x, dy = hole.pin.y - from.y, L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0;
    const ax = input.aim.x - from.x, ay = input.aim.y - from.y;
    const e = Math.atan2(ux * ay - uy * ax, ux * ax + uy * ay) + miss; // the aim's angle off the pin's line (radians, signed), plus the meter's miss
    const distM = L * TILE_M, v2 = (input.v ?? 1) >= 2, deg = Math.abs(e) * 180 / Math.PI;
    // (T334: v2: the aim's tolerance is the cup's angle at this distance, and the power's error is in metres: shot.ts PUTT_V2)
    // (T335: `line`, the putter's accuracy on the line: the angle a putt may be off and still drop is the cup's angle times it; 1: as before)
    const tol = (v2 ? Math.min(PUTT_V2.maxDeg, Math.max(PUTT_V2.minDeg, Math.atan(PUTT_V2.cupM / Math.max(distM, 0.25)) * 180 / Math.PI)) : AIM_DEG) * kit.line;
    // (T335: `feel`, the putter's distance control: the pace error counts for 1 / feel of what it was, in the window and in the leave; 1: as before)
    const paceErr = Math.abs(pw - 1) / kit.feel;
    const factor = deg <= tol ? (v2 ? Math.max(0, 1 - paceErr * distM / PUTT_V2.windowM) : Math.max(0, 1 - 4 * paceErr)) : 0;
    let k = putt(r, kit.skill, distM, factor, v2);
    k = luckyPutt(r, k, distM, kit.luck); // (T335: a lucky drop or a lip-out: one more draw, only for a putter with luck)
    k.leaveM *= kit.spread; // (T334 part 2: touch tightens the leave)
    if (k.holed) { to = { x: hole.pin.x, y: hole.pin.y }; lie = 'green'; holed = true; }
    else {
      // a miss: past the cup (short of it under 1) by the model's leave plus the power's error, and off the line by the aim's error
      const leave = Math.max(0.3, k.leaveM + paceErr * distM) / TILE_M, s = pw < 1 ? -1 : 1, lat = distM * Math.sin(e) / TILE_M;
      to = { x: hole.pin.x + ux * s * leave - uy * lat, y: hole.pin.y + uy * s * leave + ux * lat };
      lie = view.lieAt(to.x, to.y);
      // a putt into water or out of bounds is a stroke and distance (hitShot's drop is for full shots)
      if (lie === 'water' || lie === 'out') { to = { x: from.x, y: from.y }; lie = plie; penalty = 1; }
    }
  } else {
    // the intended carry along the aim's direction (the pin's when the aim is on the ball), then the hit model from there: spread, mishits, lies,
    // roll, water and out of bounds all apply
    const pw = eff ? eff.power * eff.carry : clamp(input.power, POWER[0]!, POWER[1]!);
    // (T334 part 2: the shape's effect at this carry: the curve, the run, the wind's multiplier, the scatter, and the swing's miss made bigger)
    const fx = shapeEffect(shape, input.club, carryFor(sk, input.club, mctx) * pw, kit.skill, kit);
    let ux = input.aim.x - from.x, uy = input.aim.y - from.y, L = Math.hypot(ux, uy);
    if (L === 0) { ux = hole.pin.x - from.x; uy = hole.pin.y - from.y; L = Math.hypot(ux, uy); }
    if (L === 0) { ux = 1; uy = 0; L = 1; }
    if (miss) { const m2 = miss * fx.miss, c = Math.cos(m2), sn = Math.sin(m2), rx = ux * c - uy * sn; uy = ux * sn + uy * c; ux = rx; } // T316: the meter's miss (T334 part 2: bigger with a shape picked)
    const d = carryFor(sk, input.club, mctx) * pw / TILE_M, at = { x: from.x + ux / L * d, y: from.y + uy / L * d };
    // (T337: Backyard Trick Shot: a wedge plays out of the rough, the fescue or a bunker as if it lay on the fairway: its lie's carry, scatter, flier and spin share are the fairway's)
    const trick = hasMech(sk, 'trick') && WEDGES.includes(input.club) && (plie === 'rough' || plie === 'fescue' || plie === 'bunker'), lieP: Lie = trick ? 'fairway' : plie, envP = trick && env ? { ...env, lie: 'fairway' as const } : env;
    // (T241: his part of the game's skill; T316: a meter shot may carry past the club's full carry, with its spread, and keeps METER_ANG of the
    // model's direction spread, the meter's miss taking over the rest)
    // (T318: the spin, from the lie it is played from: the curve, the check, the release; none without it)
    const sp = spin ? spinEffect(spin, input.club, lieP, envP?.lie, kit.spin) : null; // (T334: the lie's finer kind scales the spin; T335: his clubs' grooves)
    const mod = { ...(eff ? { maxF: Math.max(1, pw), spread: eff.spread, angF: METER_ANG, roll: eff.roll } : {}), ...(sp ? { spin: sp } : {}), ...(envP ? { env: envP } : {}), ...(shape ? { shape: fx } : {}), ctx: mctx };
    let o = hitShot(r, sk, lieP, from, at, input.club, view, mod);
    // (T337: the Scramble Captain: a second ball from the tee, the same strike with its own luck: the one in play, then the nearer the cup, stands)
    if (input.scr === true && plie === 'tee' && hasMech(sk, 'scramble')) {
      const o2 = hitShot(r, sk, lieP, from, at, input.club, view, mod), dist = (p: Pt) => Math.hypot(p.x - hole.pin.x, p.y - hole.pin.y);
      if (o.penalty > o2.penalty || (o.penalty === o2.penalty && dist(o2.to) < dist(o.to))) o = o2;
    }
    to = o.to; lie = o.lie; penalty = o.penalty; landing = o.landing;
    const pinM = () => Math.hypot(to.x - hole.pin.x, to.y - hole.pin.y) * TILE_M;
    const drop = (): void => { landing = { ...landing!, rest: { x: hole.pin.x, y: hole.pin.y }, restLie: 'green' }; to = { x: hole.pin.x, y: hole.pin.y }; lie = 'green'; holed = true; };
    // (T337: Ace Magnet: a par 3's tee shot that finishes within a few metres drops now and then; Backyard Trick Shot: so does a wedge that finishes within two; a draw only when the card is there and the shot is close)
    if (!penalty && hole.par === 3 && plie === 'tee' && hasMech(sk, 'ace') && pinM() <= CARD_HOOKS.aceM && r() < CARD_HOOKS.aceP) drop();
    else if (!penalty && trick && pinM() <= CARD_HOOKS.trickM && r() < CARD_HOOKS.trickP) drop();
    // (T337: Fairway Finder: a tee shot that came to rest in the rough rolls back to the fairway three times in ten)
    else if (!penalty && plie === 'tee' && hasMech(sk, 'finder') && (lie === 'rough' || lie === 'fescue') && r() < CARD_HOOKS.finderP) {
      const q = backToFairway(view, hole, to, CARD_HOOKS.finderReach); if (q) { landing = { ...landing!, rest: q, restLie: 'fairway' }; to = q; lie = 'fairway'; }
    }
  }
  return { to, lie, penalty, holed, landing, sw, spin, env, shape };
}
