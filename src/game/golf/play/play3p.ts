// T418 (docs/CINDERLINKS-PORT.md, the wiring): the owner's play in the view from behind the golfer, decided by the one golf model. The view only shows it
// and sends back what he did; everything here is LiveGroup's (live.ts): the day is played up to his turn, his input is played through LiveGroup.play,
// and every stroke (his and anyone else's in the group's time order) goes back as a ShotMsg (shot3p.ts), his turn as a TurnMsg (turn3p.ts).
//
// What travels:
//   start()        -> the strokes played before his first turn (none when he is alone), then his turn, or holeEnd when there is none
//   input(view)    -> his stroke and everyone's since, in the plan's time order (the view may ignore the others' until T425), then, when the hole
//                     is over, holeEnd, and the next turn when one follows
// An input that is not for the turn in hand (an old one, sent twice) is answered with the turn again, so the view is never left waiting.
//
// Positions cross in the view's frame (protocol3p.ts toView / fromView). Pure TS, no DOM.
import type { CourseView, Golfer, Lie, Pt, RoundPlan, Sex, Shot } from './types';
import type { TeeKind } from '../types';
import { LiveGroup, MODEL_V, shotOutcome, type OwnerInput, type OwnerTurn } from './live';
import { shapeEffect } from './shape';
import { carryFor } from './shot';
import { kitOf } from './mods';
import { ALL_EARNED, type Earned } from './unlocks';
import { green3p, puttAim, type Green3p } from './green3p';
import { playRound } from './round';
import { teeTimes } from './field';
import { envOf } from './conditions';
import type { ShotSkill } from './shot';
import type { HeightAt } from './roll';
import type { WindNow } from './wind';
import type { Frame3p } from './export3p';
import { fromView, type HoleEndMsg, type HostMsg, type PreviewMsg, type ViewInput } from './protocol3p';
import { centreOf, turnMsg } from './turn3p';
import { allowedClubs } from './owner';
import { fieldShotMsg, shotMsg } from './shot3p';

/** what a session needs: the course (every hole the course has) and the indexes of the holes to play, in order (the view's Play this hole: one), the
 *  owner's skills as the model plays them (engine yourSkills: his bag, cards and pressure in them), his sex and tee set, the seed, the course's frame
 *  (export3p.ts frame3p: the same one the course message was made in), the ground's height (absent: flat), the wind now (absent: calm; read at each turn
 *  and each strike) and the putter's fitting in words (bag.ts putterFitName) */
export interface Play3pOpts {
  view: CourseView; holes: readonly number[]; skills: ShotSkill; sex: Sex; tees?: TeeKind; seed: number; frame: Frame3p | Pt;
  height?: HeightAt | null; wind?: () => WindNow | null; fit?: string;
  /** T422: the day's gust peak now (mph; absent: none sent) */
  gust?: () => number | null;
  /** T443: what he has earned (unlocks.ts earned; absent: everything, as before T443) */
  earned?: Earned;
  /** T423: the gimme the round's rule allows (m; absent or 0: none, as in a match) */
  gimmeM?: number;
}

/** the owner's golfer in a session: id 0, alone in his group */
export const OWNER_3P = 0;

/** a course view of only the holes `idx` (in that order), reading the lie and its finer kind from the whole course */
export function holesView(view: CourseView, idx: readonly number[]): CourseView {
  const holes = idx.map(i => { const h = view.holes[i]; if (!h) throw new Error(`play3p: no hole ${i}`); return h; });
  const kindAt = view.kindAt;
  return { holes, lieAt: (x: number, y: number): Lie => view.lieAt(x, y), ...(kindAt ? { kindAt: (x: number, y: number) => kindAt.call(view, x, y) } : {}) };
}

/** one owner's play in the view: build it when the view has loaded the course, send start()'s messages, and input()'s for each input the view sends */
export class Play3p {
  readonly plan: RoundPlan;
  readonly view: CourseView;
  private readonly live: LiveGroup;
  private readonly centre: Pt;
  /** the strokes already sent */
  private readonly sent = new Set<Shot>();
  private turn: OwnerTurn | null = null;
  private done = false;
  /** T443: the boost charges used on each hole (by index) */
  private used = new Map<number, number>();
  /** T423: the green sent with the turn in hand (null: not on the green) */
  private green: Green3p | null = null;
  private get earn(): Earned { return this.o.earned ?? ALL_EARNED; }

  constructor(private readonly o: Play3pOpts) {
    if (!o.holes.length) throw new Error('play3p: no holes to play');
    this.view = holesView(o.view, o.holes);
    const sk = o.skills, golfer: Golfer = { id: OWNER_3P, name: 'You', sex: o.sex, pro: false, look: 0, owner: true,
      skill: typeof sk === 'number' ? sk : (sk.driving + sk.irons + sk.short + sk.putting) / 4, ...(o.tees ? { tees: o.tees } : {}), ...(typeof sk === 'number' ? {} : { skills: sk }) };
    const groups = teeTimes([golfer], o.seed);
    this.plan = playRound(this.view, [golfer], groups, o.seed, { live: 0 });
    this.live = new LiveGroup(this.plan, this.view, 0, o.seed);
    this.centre = centreOf(o.frame);
  }

  /** the turn in hand (null: none, the session is over) */
  get current(): OwnerTurn | null { return this.turn; }
  /** every input played, in order */
  get inputs(): readonly OwnerInput[] { return this.live.inputs; }

  /** the messages that open the session: the strokes played before his first turn, then that turn (or holeEnd when there is none) */
  start(): HostMsg[] {
    if (this.turn) return [this.turnMsg(this.turn)];
    const out: HostMsg[] = [];
    this.next(out, null, -1);
    return out;
  }

  /** plays the view's input for the turn in hand (the aim in the view's frame) and returns what the view is sent: every stroke since (his among them),
   *  holeEnd when his hole is over, and the next turn when one follows. An input for another turn gets the turn in hand again; with none, nothing */
  input(vi: ViewInput): HostMsg[] {
    const t = this.turn; if (!t || this.done) return [];
    if (vi.holeIdx !== t.holeIdx || vi.stroke !== t.stroke) return [this.turnMsg(t)];
    const input = this.owned(vi, t, true);
    const mine = this.live.play(input);
    const out: HostMsg[] = [];
    this.next(out, { shot: mine, input }, t.holeIdx);
    return out;
  }

  /** T441, T442: the model's shot for the view's input with no luck in it (every draw of the stream at 0.75: a normal draw of 0, no mishit, no flier, no card's
   *  chance), as the view would strike it now: what its shape and spin do, for the aim marker. Plays nothing. Null for a putt or with no turn */
  preview(key: number, vi: ViewInput): PreviewMsg {
    const t = this.turn, none: PreviewMsg = { v: 1, t: 'preview', key, shot: null, spread: 1 };
    if (!t || this.done || vi.club === 'putter' || vi.holeIdx !== t.holeIdx || vi.stroke !== t.stroke) return none;
    const input = this.owned(vi, t, false), { holeIdx: _h, stroke: _s, ...inp } = input; void _h; void _s;
    const hole = this.view.holes[t.holeIdx]!, last = t.holeIdx === this.view.holes.length - 1;
    const o = shotOutcome(this.view, hole, t.ball, t.lie, this.o.skills, inp, () => 0.75, { last });
    const shot = { golfer: OWNER_3P, hole: t.holeIdx, stroke: t.stroke, t: t.t, from: { x: t.ball.x, y: t.ball.y }, to: o.to, club: vi.club, lie: o.lie, penalty: o.penalty, holed: o.holed, ...(o.landing ? { landing: o.landing } : {}) };
    const mctx = { lie: t.lie, tee: t.lie === 'tee', deck: vi.club === 'driver' && t.lie !== 'tee', last, follow: false }, kit = kitOf(this.o.skills, vi.club, mctx);
    const fx = shapeEffect(inp.shape ?? null, vi.club, carryFor(this.o.skills, vi.club, mctx) * Math.min(1, Math.max(0.3, inp.power)), kit.skill, kit);
    return { v: 1, t: 'preview', key, shot: this.strokeMsg(shot, input), spread: fx.spread };
  }

  /** the view's input as the model plays it: the aim in tiles, the conditions and the model's version filled in, and what he has not earned taken out (a
   *  shape's curve or flight, side spin, backspin, clicks in the air, a boost with no charge left on the hole); `spend`: a boost uses a charge */
  private owned(vi: ViewInput, t: OwnerTurn, spend: boolean): OwnerInput {
    const e = this.earn, putting = vi.club === 'putter', aim0 = fromView(vi.aim, this.centre);
    const aim = putting && this.green ? puttAim(t.ball, aim0, this.green.startDeg) : aim0; // (T423: a putt is aimed along the read; the model judges it at the pin's line)
    const env = putting ? null : envOf(this.windNow(), this.view.kindAt, this.o.height ?? null, t.ball, t.lie, aim);
    const { shape: sh0, spin: sp0, swing: sw0, ...rest } = vi;
    const shape = sh0 ? { curve: (sh0.curve < 0 ? (e.draw ? -1 : 0) : sh0.curve > 0 ? (e.fade ? 1 : 0) : 0) as -1 | 0 | 1, flight: (sh0.flight > 0 ? (e.high ? 1 : 0) : sh0.flight < 0 ? (e.low ? -1 : 0) : 0) as -1 | 0 | 1 } : null;
    const spin = sp0 ? { x: e.side ? sp0.x : 0, y: sp0.y < 0 && !e.back ? 0 : sp0.y, pump: e.tour ? sp0.pump : 0 } : null;
    let swing = sw0;
    if (swing && swing.boost > 0) {
      const used = this.used.get(t.holeIdx) ?? 0;
      if (!e.boost || used >= e.charges) swing = { ...swing, boost: 0 }; else if (spend) this.used.set(t.holeIdx, used + 1);
    }
    return { ...rest, aim, v: MODEL_V, ...(env ? { env } : {}), ...(swing ? { swing } : {}), ...(shape && (shape.curve || shape.flight) ? { shape } : {}), ...(spin && (spin.x || spin.y || spin.pump) ? { spin } : {}) };
  }

  /** T423: the view's gimme for the turn in hand: played as a conceded putt (LiveGroup's `gim`) when the ball lies on the green within the round's gimme;
   *  else the turn again. Answered as an input is */
  gimme(holeIdx: number, stroke: number): HostMsg[] {
    const t = this.turn; if (!t || this.done) return [];
    const m = this.o.gimmeM ?? 0, onGreen = this.view.lieAt(t.ball.x, t.ball.y) === 'green';
    if (holeIdx !== t.holeIdx || stroke !== t.stroke || !onGreen || !(m > 0) || t.distM > m) return [this.turnMsg(t)];
    const input: OwnerInput = { holeIdx, stroke, club: 'putter', aim: { x: t.pin.x, y: t.pin.y }, power: 1, v: MODEL_V, gim: true };
    const mine = this.live.play(input), out: HostMsg[] = [];
    this.next(out, { shot: mine, input }, t.holeIdx);
    return out;
  }

  /** runs the day to his next turn and writes what happened: the strokes not sent yet in time order (his own from his input), holeEnd when his hole
   *  changed or the round is over, then the turn */
  private next(out: HostMsg[], mine: { shot: Shot; input: OwnerInput } | null, holeWas: number): void {
    const turn = this.live.advance();
    for (const s of this.plan.shots) {
      if (this.sent.has(s)) continue;
      this.sent.add(s);
      out.push(this.strokeMsg(s, mine && s === mine.shot ? mine.input : null));
    }
    if (mine && !this.plan.shots.includes(mine.shot)) out.push(this.strokeMsg(mine.shot, mine.input)); // (LiveGroup records it in the plan; this is a guard)
    if (holeWas >= 0 && (!turn || turn.holeIdx !== holeWas)) out.push(this.holeEnd(holeWas, !turn));
    this.turn = turn; this.done = !turn;
    if (turn) out.push(this.turnMsg(turn));
  }

  private strokeMsg(s: Shot, input: OwnerInput | null) {
    const n = this.view.holes[s.hole]?.n ?? s.hole + 1, wind = this.windNow(), height = this.o.height ?? null;
    if (s.golfer === OWNER_3P && input) {
      const { holeIdx: _h, stroke: _s, ...inp } = input; void _h; void _s;
      return shotMsg({ shot: s, input: inp, skills: this.o.skills, hole: n, view: this.view, height, wind }, this.centre);
    }
    return fieldShotMsg(s, this.centre, { hole: n, view: this.view, height, wind });
  }

  private holeEnd(holeIdx: number, last: boolean): HoleEndMsg {
    const h = this.view.holes[holeIdx]!, strokes = this.plan.strokes[OWNER_3P]?.[holeIdx] ?? this.plan.shots.filter(s => s.golfer === OWNER_3P && s.hole === holeIdx).reduce((a, s) => a + 1 + s.penalty, 0);
    return { v: 1, t: 'holeEnd', holeIdx, hole: h.n, par: h.par, strokes, last };
  }

  /** his turn for the view, offering only the clubs the model lets him take from this lie (owner.ts allowedClubs: the driver from the tee, the putter
   *  on the green; his bag's and cards' rules) */
  private turnMsg(t: OwnerTurn) {
    const m = this.turnMsgAll(t), sk = this.o.skills, bag = typeof sk === 'number' ? undefined : sk.clubs, mech = typeof sk === 'number' ? undefined : sk.mech;
    const ok = allowedClubs(t.lie, t.lie === 'tee', bag, mech), clubs = m.clubs.filter(c => ok.includes(c.club) || c.club === m.suggested.club);
    if (clubs.length) m.clubs = clubs;
    return m;
  }
  private turnMsgAll(t: OwnerTurn) {
    const m = turnMsg({ turn: t, skills: this.o.skills, view: this.view, height: this.o.height ?? null, wind: this.windNow(), last: t.holeIdx === this.view.holes.length - 1,
      ...(this.o.fit ? { fit: this.o.fit } : {}), ...(this.o.gust ? { gust: this.o.gust() } : {}) }, this.centre);
    m.earned = this.earn; m.charges = Math.max(0, this.earn.charges - (this.used.get(t.holeIdx) ?? 0));
    // T423: on the green, the host's green and the gimme the rule allows
    this.green = this.view.lieAt(t.ball.x, t.ball.y) === 'green' ? green3p(this.o.height ?? null, (x, y) => this.view.lieAt(x, y) === 'green', t.ball, t.pin, this.centre) : null;
    if (this.green) m.green = this.green;
    if ((this.o.gimmeM ?? 0) > 0) m.gimmeM = this.o.gimmeM;
    return m;
  }

  private windNow(): WindNow | null { return this.o.wind ? this.o.wind() : null; }
}
