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
import type { CourseView, Golfer, Group, Lie, PlayHole, Pt, RoundPlan, Sex, Shot } from './types';
import type { TeeKind } from '../types';
import { LiveGroup, MODEL_V, shotOutcome, type OwnerInput, type OwnerTurn } from './live';
import { shapeEffect } from './shape';
import { carryFor } from './shot';
import { kitOf } from './mods';
import { ALL_EARNED, type Earned } from './unlocks';
import { green3p, puttAim, type Green3p } from './green3p';
import { playRound, standings } from './round';
import { teeTimes } from './field';
import { envOf } from './conditions';
import type { ShotSkill } from './shot';
import type { HeightAt } from './roll';
import type { WindNow } from './wind';
import type { Frame3p } from './export3p';
import { PROTOCOL_V, fromView, type Actor, type ActorsMsg, type BoardMsg, type HoleEndMsg, type Dress, type HostMsg, type PreviewMsg, type ShotMsg, type ViewInput } from './protocol3p';
import { CartPlay, type CartPaths } from './carts';
import type { WalkField } from '../walkfield';
import { actorsMsg } from './actors3p';
import { boardRows, waitText } from './board';
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
  /** T425 to T427: who else plays: the rest of his group and the field (never id OWNER_3P: that is him) and the tee sheet, the owner (OWNER_3P) in one of
   *  its groups; their carts and caddies as entourage.ts wrote them into the golfers. Absent: he plays alone, as before (no actors, no board) */
  company?: { golfers: Golfer[]; groups: Group[] };
  /** T426: the carts' ways: the course's cart paths (absent or null: along the rough's edge), where a cart goes after the last green, the course's walk field */
  paths?: CartPaths | null; home?: Pt; walk?: WalkField | null;
  /** T425: the owner's real round, played on in the view: the day's plan and course, his live group (live.ts LiveGroup: the very one the manager game plays),
   *  his golfer's id and his group's index. The session plays that group on (no new plan; `holes`, `seed` and `company` are not used); the strokes already
   *  played count as sent, so the view opens on his turn as it stands. Absent: a fresh session, as above */
  attach?: { plan: RoundPlan; view: CourseView; live: LiveGroup; owner: number; group: number };
  /** T450b: the owner's own dress (look3p.ts playerDress of his picked look), so his figure among the actors is the golfer he picked */
  owner?: Dress;
  /** T429: the galleries to put in each actors list (gallery3p.ts galleryActors, as the engine has them now; absent: none) */
  galleries?: () => Actor[];
  /** T433: more people at game minute m (a ghost round's golfer: ghost3p.ts ghostActor); with it, the actors lists are sent as with company */
  more?: (minute: number) => Actor[];
  /** T433: more strokes struck after minute t0 and by t1 (a ghost round's: ghost3p.ts ghostShots), sent with the batch they fall in */
  moreShots?: (t0: number, t1: number) => ShotMsg[];
  /** T436: the board's rows at minute m in place of the field's standings (fair3p.ts fairRows: you and a ghost, gross and net) */
  boardRows?: (minute: number) => BoardMsg['rows'];
  /** T422: the day's gust peak now (mph; absent: none sent) */
  gust?: () => number | null;
  /** T443: what he has earned (unlocks.ts earned; absent: everything, as before T443) */
  earned?: Earned;
  /** T423: the gimme the round's rule allows (m; absent or 0: none, as in a match) */
  gimmeM?: number;
}
/** T427: the leaderboard's rows the view is sent (the leaders; the owner's row after them when he is lower) */
export const BOARD_ROWS = 8;

/** the owner's golfer in a session: id 0, alone in his group */
export const OWNER_3P = 0;

/** T430: what a session plays on: the round the turns come from and the strokes go to. Two kinds: his live group on a free hole (liveDriver, LiveGroup)
 *  and his own round in the game (yours3p.ts, play/yours.ts YourRound: recorded, saved with the game, ended through the game's own round end) */
export interface RoundDriver {
  /** the course the turns' hole indices point into */
  readonly view: CourseView;
  /** his golfer's id in the strokes */
  readonly golfer: number;
  /** every input played, in order */
  readonly inputs: readonly OwnerInput[];
  /** his turn now; null when the hole is over (holed, picked up) or the round is */
  turn(): OwnerTurn | null;
  /** plays his input through the one model (a gimme too: gim), with whatever the round keeps; the stroke */
  play(input: OwnerInput): Shot;
  /** every stroke so far (his, and anyone's in his group), to send the new ones */
  shots(): readonly Shot[];
  /** the hole index i as he plays it (his tee set's) */
  hole(i: number): PlayHole;
  /** his strokes on hole index i */
  strokes(i: number): number;
  /** whether hole index i is the round's last (the moment last of a card) */
  isLast(i: number): boolean;
  /** whether the round is over */
  over(): boolean;
  /** on to the next hole once the view has seen this one out (holeDone); absent: the next hole's turn comes by itself */
  nextHole?(): void;
}

/** a driver over his live group in a round plan (T425: alone on a free hole, with company, or his real round attached): his turns from LiveGroup,
 *  the plan's strokes; the round is over when he has no turn left */
export function liveOn(plan: RoundPlan, view: CourseView, live: LiveGroup, me: number): RoundDriver {
  let done = false;
  return {
    view, golfer: me, get inputs() { return live.inputs; },
    turn() { const t = live.advance(); done = !t; return t; },
    play: (input) => live.play(input),
    shots: () => plan.shots,
    hole: (i) => view.holes[i]!,
    strokes: (i) => plan.strokes[me]?.[i] ?? plan.shots.filter(s => s.golfer === me && s.hole === i).reduce((a, s) => a + 1 + s.penalty, 0),
    isLast: (i) => i === view.holes.length - 1,
    over: () => done,
  };
}

/** a course view of only the holes `idx` (in that order), reading the lie and its finer kind from the whole course */
export function holesView(view: CourseView, idx: readonly number[]): CourseView {
  const holes = idx.map(i => { const h = view.holes[i]; if (!h) throw new Error(`play3p: no hole ${i}`); return h; });
  const kindAt = view.kindAt;
  return { holes, lieAt: (x: number, y: number): Lie => view.lieAt(x, y), ...(kindAt ? { kindAt: (x: number, y: number) => kindAt.call(view, x, y) } : {}) };
}

/** one owner's play in the view: build it when the view has loaded the course, send start()'s messages, and input()'s for each input the view sends */
export class Play3p {
  /** the free hole's round plan (an empty one on his own round) */
  readonly plan: RoundPlan;
  readonly view: CourseView;
  private readonly drv: RoundDriver;
  private readonly centre: Pt;
  /** the strokes already sent */
  private readonly sent = new Set<Shot>();
  private turn: OwnerTurn | null = null;
  private done = false;
  /** T433: the last minute the ghost's strokes have been sent to */
  private moreT = -Infinity;
  /** T425: the owner's golfer id (OWNER_3P, or his id in the real round) */
  readonly me: number;
  /** T425: the owner's group (golfer ids) */
  private readonly group: Set<number>;
  /** T426: the carts' playback (null: nobody rides) */
  readonly carts: CartPlay | null;
  /** T443: the boost charges used on each hole (by index) */
  private used = new Map<number, number>();
  /** T423: the green sent with the turn in hand (null: not on the green) */
  private green: Green3p | null = null;
  private get earn(): Earned { return this.o.earned ?? ALL_EARNED; }

  /** o.driver: his own round (T430: the game's YourRound, yours3p.ts); absent: his live group (his real round with o.attach, else a fresh one) */
  constructor(private readonly o: Play3pOpts & { driver?: RoundDriver }) {
    const at = o.attach;
    if (o.driver) {   // (T430: his own round: no plan, no company; what was played before is not sent again)
      this.drv = o.driver; this.view = o.driver.view; this.plan = { golfers: [], groups: [], shots: [], strokes: [], done: [] };
      this.me = o.driver.golfer; this.centre = centreOf(o.frame); this.group = new Set([this.me]); this.carts = null;
      for (const s of this.drv.shots()) this.sent.add(s);
      return;
    }
    if (at) {   // (T425: his real round: the day's plan, course and live group)
      this.view = at.view; this.plan = at.plan; this.me = at.owner; this.centre = centreOf(o.frame);
      this.drv = liveOn(at.plan, at.view, at.live, at.owner);
      this.group = new Set(at.plan.groups[at.group]?.players ?? [at.owner]);
      for (const s of at.plan.shots) this.sent.add(s);
      this.carts = at.plan.golfers.some(g => g.cart !== undefined && !g.owner) ? new CartPlay(this.plan, this.view, o.paths ?? null, o.home ?? this.view.holes[0]!.tee, o.walk ?? null) : null;
      return;
    }
    this.me = OWNER_3P;
    if (!o.holes.length) throw new Error('play3p: no holes to play');
    this.view = holesView(o.view, o.holes);
    const sk = o.skills, golfer: Golfer = { id: OWNER_3P, name: 'You', sex: o.sex, pro: false, look: 0, owner: true,
      skill: typeof sk === 'number' ? sk : (sk.driving + sk.irons + sk.short + sk.putting) / 4, ...(o.tees ? { tees: o.tees } : {}), ...(typeof sk === 'number' ? {} : { skills: sk }) };
    const co = o.company, golfers = co ? [golfer, ...co.golfers] : [golfer], groups = co ? co.groups : teeTimes([golfer], o.seed);
    const gi = groups.findIndex(g => g.players.includes(OWNER_3P));
    if (gi < 0) throw new Error('play3p: the owner is in no group of the tee sheet');
    if (co && co.golfers.some(g => g.id === OWNER_3P)) throw new Error('play3p: another golfer has the owner id');
    this.plan = playRound(this.view, golfers, groups, o.seed, { live: gi, ...(co ? { honour: true } : {}) });   // (T425: with company, the honour on the tee)
    this.drv = liveOn(this.plan, this.view, new LiveGroup(this.plan, this.view, gi, o.seed), OWNER_3P);
    this.centre = centreOf(o.frame);
    this.group = new Set(groups[gi]!.players);
    this.carts = co && golfers.some(g => g.cart !== undefined && !g.owner)
      ? new CartPlay(this.plan, this.view, o.paths ?? null, o.home ?? this.view.holes[0]!.tee, o.walk ?? null) : null;
  }

  /** the turn in hand (null: none, the session is over) */
  get current(): OwnerTurn | null { return this.turn; }
  /** every input played, in order */
  get inputs(): readonly OwnerInput[] { return this.drv.inputs; }

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
    const mine = this.drv.play(input);
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
    const hole = this.drv.hole(t.holeIdx), last = this.drv.isLast(t.holeIdx);
    const o = shotOutcome(this.view, hole, t.ball, t.lie, this.o.skills, inp, () => 0.75, { last });
    const shot = { golfer: this.me, hole: t.holeIdx, stroke: t.stroke, t: t.t, from: { x: t.ball.x, y: t.ball.y }, to: o.to, club: vi.club, lie: o.lie, penalty: o.penalty, holed: o.holed, ...(o.landing ? { landing: o.landing } : {}) };
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
    const amt = (v: unknown, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.max(lo, Math.min(hi, n)) * 100) / 100 : 0; };   // (J5f: a continuous amount, held to the side he has earned)
    const shape = sh0 ? { curve: amt(sh0.curve, e.draw ? -1 : 0, e.fade ? 1 : 0), flight: amt(sh0.flight, e.low ? -1 : 0, e.high ? 1 : 0) } : null;
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
    const mine = this.drv.play(input), out: HostMsg[] = [];
    this.next(out, { shot: mine, input }, t.holeIdx);
    return out;
  }

  /** J6: the turn read again from the driver (a practice drill picked moves the ball and the pin): the turn as it is now */
  refresh(): HostMsg[] { if (this.done) return []; const out: HostMsg[] = []; this.next(out, null, -1); return out; }

  /** T430: the view has seen the hole out: on his own round, on to the next hole (its turn); nothing more once the round is over */
  holeDone(holeIdx: number): HostMsg[] {
    if (this.turn || !this.drv.nextHole || this.drv.over() || holeIdx !== this.lastHole) return this.turn ? [this.turnMsg(this.turn)] : [];
    this.drv.nextHole();
    const out: HostMsg[] = []; this.next(out, null, -1); return out;
  }
  /** the hole of the last turn (holeDone answers only for it) */
  private lastHole = -1;

  /** runs the day to his next turn and writes what happened: the strokes not sent yet in time order (his own from his input), holeEnd when his hole
   *  changed or the round is over, then the turn */
  private next(out: HostMsg[], mine: { shot: Shot; input: OwnerInput } | null, holeWas: number): void {
    const turn = this.drv.turn(), co = !!this.o.company || !!this.o.attach || !!this.o.more;
    // the strokes not sent yet in time order. T425: with company, only his group's are played back, each after who is where just before it is struck
    // (the view moves everyone by these as the strokes play); the rest of the field travels in those lists
    const fresh = this.drv.shots().filter(s => !this.sent.has(s)).sort((a, b) => a.t - b.t);
    let last = -Infinity;
    for (const s of fresh) {
      this.sent.add(s); last = Math.max(last, s.t);
      if (co && !this.group.has(s.golfer)) continue;
      if (co) out.push(this.actors(s.t - 1e-3));
      out.push(this.strokeMsg(s, mine && s === mine.shot ? mine.input : null));
    }
    if (mine && !this.sent.has(mine.shot)) { this.sent.add(mine.shot); out.push(this.strokeMsg(mine.shot, mine.input)); } // (a driver that keeps no list of strokes; a guard)
    if (holeWas >= 0 && (!turn || turn.holeIdx !== holeWas)) out.push(this.holeEnd(holeWas, this.drv.over()));
    this.turn = turn; this.done = this.drv.over(); if (turn) this.lastHole = turn.holeIdx;
    if (co) {
      const m = turn ? turn.t - 1e-3 : Number.isFinite(last) ? last + 1 : 0;
      if (this.o.moreShots && m > this.moreT) { out.push(...this.o.moreShots(this.moreT, m)); this.moreT = m; }   // (T433: the ghost's strokes of this stretch)
      out.push(this.actors(m), this.board(m));
    }
    if (turn) out.push(this.turnMsg(turn));
  }

  /** T424/T425: who is on the course at game minute m, in the view's frame (actors3p.ts), carts and riders included */
  actors(m: number): ActorsMsg {
    const a = actorsMsg({ plan: this.plan, view: this.view, minute: m, carts: this.carts, ...(this.o.owner ? { owner: this.o.owner } : {}) }, this.centre), g = [...(this.o.galleries ? this.o.galleries() : []), ...(this.o.more ? this.o.more(m) : [])];
    return { ...a, actors: g.length ? [...a.actors, ...g] : a.actors, play: true };
  }
  /** T427: the leaderboard at game minute m and his group's wait on the group ahead */
  board(m: number): BoardMsg {
    if (this.o.boardRows) return { v: PROTOCOL_V, t: 'board', at: m, rows: this.o.boardRows(m), wait: waitText(this.plan, this.view, this.me, m) };
    const rows = boardRows(standings(this.plan, this.view, m), this.plan.golfers, BOARD_ROWS, this.me).map(r => ({ pos: r.pos, name: r.name, toPar: r.toPar, thru: r.thru, owner: r.owner }));
    return { v: PROTOCOL_V, t: 'board', at: m, rows, wait: waitText(this.plan, this.view, this.me, m) };
  }

  private strokeMsg(s: Shot, input: OwnerInput | null) {
    const n = this.view.holes[s.hole]?.n ?? s.hole + 1, wind = this.windNow(), height = this.o.height ?? null;
    if (s.golfer === this.me && input) {
      const { holeIdx: _h, stroke: _s, ...inp } = input; void _h; void _s;
      return shotMsg({ shot: s, input: inp, skills: this.o.skills, hole: n, view: this.view, height, wind }, this.centre);
    }
    return fieldShotMsg(s, this.centre, { hole: n, view: this.view, height, wind });
  }

  private holeEnd(holeIdx: number, last: boolean): HoleEndMsg {
    const h = this.drv.hole(holeIdx), strokes = this.drv.strokes(holeIdx);
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
    const m = turnMsg({ turn: t, skills: this.o.skills, view: this.view, height: this.o.height ?? null, wind: this.windNow(), last: this.drv.isLast(t.holeIdx),
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
