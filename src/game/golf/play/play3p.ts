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
import type { CourseView, Golfer, Group, Lie, Pt, RoundPlan, Sex, Shot } from './types';
import type { TeeKind } from '../types';
import { LiveGroup, MODEL_V, type OwnerInput, type OwnerTurn } from './live';
import { playRound, standings } from './round';
import { teeTimes } from './field';
import { envOf } from './conditions';
import type { ShotSkill } from './shot';
import type { HeightAt } from './roll';
import type { WindNow } from './wind';
import type { Frame3p } from './export3p';
import { PROTOCOL_V, fromView, type ActorsMsg, type BoardMsg, type HoleEndMsg, type HostMsg, type ViewInput } from './protocol3p';
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
}
/** T427: the leaderboard's rows the view is sent (the leaders; the owner's row after them when he is lower) */
export const BOARD_ROWS = 8;

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
  /** T425: the owner's group (golfer ids) */
  private readonly group: Set<number>;
  /** T426: the carts' playback (null: nobody rides) */
  readonly carts: CartPlay | null;

  constructor(private readonly o: Play3pOpts) {
    if (!o.holes.length) throw new Error('play3p: no holes to play');
    this.view = holesView(o.view, o.holes);
    const sk = o.skills, golfer: Golfer = { id: OWNER_3P, name: 'You', sex: o.sex, pro: false, look: 0, owner: true,
      skill: typeof sk === 'number' ? sk : (sk.driving + sk.irons + sk.short + sk.putting) / 4, ...(o.tees ? { tees: o.tees } : {}), ...(typeof sk === 'number' ? {} : { skills: sk }) };
    const co = o.company, golfers = co ? [golfer, ...co.golfers] : [golfer], groups = co ? co.groups : teeTimes([golfer], o.seed);
    const gi = groups.findIndex(g => g.players.includes(OWNER_3P));
    if (gi < 0) throw new Error('play3p: the owner is in no group of the tee sheet');
    if (co && co.golfers.some(g => g.id === OWNER_3P)) throw new Error('play3p: another golfer has the owner id');
    this.plan = playRound(this.view, golfers, groups, o.seed, { live: gi, ...(co ? { honour: true } : {}) });   // (T425: with company, the honour on the tee)
    this.live = new LiveGroup(this.plan, this.view, gi, o.seed);
    this.centre = centreOf(o.frame);
    this.group = new Set(groups[gi]!.players);
    this.carts = co && golfers.some(g => g.cart !== undefined && !g.owner)
      ? new CartPlay(this.plan, this.view, o.paths ?? null, o.home ?? this.view.holes[0]!.tee, o.walk ?? null) : null;
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
    const putting = vi.club === 'putter', aim = fromView(vi.aim, this.centre);
    const env = putting ? null : envOf(this.windNow(), this.view.kindAt, this.o.height ?? null, t.ball, t.lie, aim);
    const input: OwnerInput = { ...vi, aim, v: MODEL_V, ...(env ? { env } : {}) };
    const mine = this.live.play(input);
    const out: HostMsg[] = [];
    this.next(out, { shot: mine, input }, t.holeIdx);
    return out;
  }

  /** runs the day to his next turn and writes what happened: the strokes not sent yet in time order (his own from his input), holeEnd when his hole
   *  changed or the round is over, then the turn */
  private next(out: HostMsg[], mine: { shot: Shot; input: OwnerInput } | null, holeWas: number): void {
    const turn = this.live.advance(), co = !!this.o.company;
    // the strokes not sent yet in time order. T425: with company, only his group's are played back, each after who is where just before it is struck
    // (the view moves everyone by these as the strokes play); the rest of the field travels in those lists
    const fresh = this.plan.shots.filter(s => !this.sent.has(s)).sort((a, b) => a.t - b.t);
    let last = -Infinity;
    for (const s of fresh) {
      this.sent.add(s); last = Math.max(last, s.t);
      if (co && !this.group.has(s.golfer)) continue;
      if (co) out.push(this.actors(s.t - 1e-3));
      out.push(this.strokeMsg(s, mine && s === mine.shot ? mine.input : null));
    }
    if (mine && !this.plan.shots.includes(mine.shot)) out.push(this.strokeMsg(mine.shot, mine.input)); // (LiveGroup records it in the plan; this is a guard)
    if (holeWas >= 0 && (!turn || turn.holeIdx !== holeWas)) out.push(this.holeEnd(holeWas, !turn));
    this.turn = turn; this.done = !turn;
    if (co) { const m = turn ? turn.t - 1e-3 : Number.isFinite(last) ? last + 1 : 0; out.push(this.actors(m), this.board(m)); }
    if (turn) out.push(this.turnMsg(turn));
  }

  /** T424/T425: who is on the course at game minute m, in the view's frame (actors3p.ts), carts and riders included */
  actors(m: number): ActorsMsg { return actorsMsg({ plan: this.plan, view: this.view, minute: m, carts: this.carts }, this.centre); }
  /** T427: the leaderboard at game minute m and his group's wait on the group ahead */
  board(m: number): BoardMsg {
    const rows = boardRows(standings(this.plan, this.view, m), this.plan.golfers, BOARD_ROWS, OWNER_3P).map(r => ({ pos: r.pos, name: r.name, toPar: r.toPar, thru: r.thru, owner: r.owner }));
    return { v: PROTOCOL_V, t: 'board', at: m, rows, wait: waitText(this.plan, this.view, OWNER_3P, m) };
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
    return turnMsg({ turn: t, skills: this.o.skills, view: this.view, height: this.o.height ?? null, wind: this.windNow(), last: t.holeIdx === this.view.holes.length - 1,
      ...(this.o.fit ? { fit: this.o.fit } : {}) }, this.centre);
  }

  private windNow(): WindNow | null { return this.o.wind ? this.o.wind() : null; }
}
