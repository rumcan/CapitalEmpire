// The owner's group, played live (docs/GOLF-PLAY.md decision 7, P4a): playRound with { live } plays the day up to the owner's first strike, and
// LiveGroup plays on as he does. The whole field plays in one time order (round.ts Field, T211): the others strike by the model up to the owner's next
// strike, which waits for his input (play), or by the model too once he caddies. The owner's shot takes his input's club, aim and power through the same
// hit model. Pure TS, no DOM.
import { TILE_M } from '../types';
import { appendShots, FLIGHT_TIME, liveField, PUTT_FLIGHT } from './round';
import type { Due, Field, HoleRun, PlayCtx, Player } from './round';
import { carryM, chooseShot, hitShot, putt, rng, skillFor } from './shot';
import { holeFrom } from './courseview';
import type { Club, CourseView, Landing, Lie, Pt, RoundPlan, Shot } from './types';

/** the owner's input for his shot at a turn: the hole index and stroke it answers, the club, the aim point, and the power: 0.3..1 of the club's full
 *  carry (the putter: 0.5..1.5 of the putt's length) */
export interface OwnerInput { holeIdx: number; stroke: number; club: Club; aim: Pt; power: number }
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
    const view = this.ctx.view, hole = view.holes[hr.h]!, from = p.ball, r = rng(this.ctx.seed, p.id, hr.h * 32 + turn.stroke), putting = input.club === 'putter';
    let to: Pt, lie: Lie, penalty: 0 | 1 = 0, holed = false, landing: Landing | undefined;
    if (putting) {
      const pw = clamp(input.power, PUTT_POWER[0]!, PUTT_POWER[1]!);
      const dx = hole.pin.x - from.x, dy = hole.pin.y - from.y, L = Math.hypot(dx, dy), ux = L > 0 ? dx / L : 1, uy = L > 0 ? dy / L : 0;
      const ax = input.aim.x - from.x, ay = input.aim.y - from.y;
      const e = Math.atan2(ux * ay - uy * ax, ux * ax + uy * ay); // the aim's angle off the pin's line (radians, signed)
      const distM = L * TILE_M, factor = Math.abs(e) * 180 / Math.PI <= AIM_DEG ? Math.max(0, 1 - 4 * Math.abs(pw - 1)) : 0;
      const k = putt(r, skillFor(p.sk, 'putter'), distM, factor);
      if (k.holed) { to = { x: hole.pin.x, y: hole.pin.y }; lie = 'green'; holed = true; }
      else {
        // a miss: past the cup (short of it under 1) by the model's leave plus the power's error, and off the line by the aim's error
        const leave = Math.max(0.3, k.leaveM + Math.abs(pw - 1) * distM) / TILE_M, s = pw < 1 ? -1 : 1, lat = distM * Math.sin(e) / TILE_M;
        to = { x: hole.pin.x + ux * s * leave - uy * lat, y: hole.pin.y + uy * s * leave + ux * lat };
        lie = view.lieAt(to.x, to.y);
        // a putt into water or out of bounds is a stroke and distance (hitShot's drop is for full shots)
        if (lie === 'water' || lie === 'out') { to = { x: from.x, y: from.y }; lie = p.lie; penalty = 1; }
      }
    } else {
      // the intended carry along the aim's direction (the pin's when the aim is on the ball), then the hit model from there: spread, mishits, lies,
      // roll, water and out of bounds all apply
      const pw = clamp(input.power, POWER[0]!, POWER[1]!);
      let ux = input.aim.x - from.x, uy = input.aim.y - from.y, L = Math.hypot(ux, uy);
      if (L === 0) { ux = hole.pin.x - from.x; uy = hole.pin.y - from.y; L = Math.hypot(ux, uy); }
      if (L === 0) { ux = 1; uy = 0; L = 1; }
      const d = carryM(input.club, skillFor(p.sk, input.club)) * pw / TILE_M, at = { x: from.x + ux / L * d, y: from.y + uy / L * d };
      const o = hitShot(r, p.sk, p.lie, from, at, input.club, view); // (T241: his part of the game's skill)
      to = o.to; lie = o.lie; penalty = o.penalty; landing = o.landing;
    }
    const s = hr.record(p, input.club, turn.t, putting ? PUTT_FLIGHT : FLIGHT_TIME, to, lie, penalty, holed, landing);
    this.inputs.push({ holeIdx: input.holeIdx, stroke: input.stroke, club: input.club, aim: { x: input.aim.x, y: input.aim.y }, power: input.power });
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
    const power = putting ? 1 : clamp(dM / carryM(sg.club, skillFor(p.sk, sg.club)), POWER[0]!, POWER[1]!);
    return { golfer: p.id, holeIdx: hr.h, hole: hole.n, par: hole.par, stroke: p.strokes + 1, t, lie: p.lie, ball: { x: p.ball.x, y: p.ball.y },
      pin: { x: hole.pin.x, y: hole.pin.y }, distM, suggested: { club: sg.club, aim: { x: sg.aim.x, y: sg.aim.y }, power } };
  }

  /** appends the shots played since the last append to the plan */
  private flush(): void { const o = this.ctx.out; if (o.length) { appendShots(this.plan, o); o.length = 0; } }
}
