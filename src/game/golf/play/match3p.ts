// T428 (docs/CINDERLINKS-PORT.md, the host half of "money matches"): a money match played in the view from behind the golfer, decided by the one golf
// model. Everything is match.ts' (the match the manager game plays: play/yours.ts YourRound in mode 'match', no mulligans, no gimmies): whose turn it is
// (matchTurn: the honour on the tee, then the one farther from the pin), the opponent's strokes (oppShot), yours (playMatchYours), a hole decided
// (decideHole: a pick-up conceded), the next hole (matchNextHole), the score (scoreOf). The view is sent, in order: the match (`match`), then for each
// stroke who stands where (`actors`: the opponent) and the stroke (`shot`), each decided hole's result (`match`) and its end (`holeEnd`), his turns
// (`turn`), and the match's end. The money moves in the manager game when the view is closed (the engine's matchSettle): the view only shows the stake.
// Positions in the view's frame (protocol3p.ts toView). Pure TS, no DOM.
import type { CourseView, Pt, Sex } from './types';
import type { OwnerInput, OwnerTurn } from './live';
import { MODEL_V } from './live';
import { yourTurn, rowOf, type YourRound } from './yours';
import { holeDecided, matchNextHole, matchTurn, nameSeed, oppShot, playMatchYours, scoreOf } from './match';
import type { EnvFor } from './conditions';
import { envOf } from './conditions';
import type { ShotSkill } from './shot';
import type { HeightAt } from './roll';
import type { WindNow } from './wind';
import type { Frame3p } from './export3p';
import { PROTOCOL_V, fromView, toView, type Actor, type ActorsMsg, type HoleEndMsg, type HostMsg, type MatchMsg, type ViewInput } from './protocol3p';
import { centreOf, turnMsg } from './turn3p';
import { allowedClubs } from './owner';
import { fieldShotMsg, shotMsg } from './shot3p';
import { dressOf } from './actors3p';

/** the owner's and the opponent's golfer ids in the view */
export const OWNER_M3P = 0, OPP_3P = 1;

/** what a match in the view needs: the course, the match as the manager game holds it (match.ts startMatch, or a match under way), his skills as the
 *  model plays them, his sex and the opponent's, the game's seed (the streams of both sides' strokes: the same as the manager game's), the course's frame,
 *  the ground's height, the wind now, the putter's fitting in words, and the conditions the opponent's strokes are struck in (match.ts oppShot's envFor) */
export interface Match3pOpts {
  view: CourseView; round: YourRound; skills: ShotSkill; sex: Sex; oppSex?: Sex; seed: number; frame: Frame3p | Pt;
  height?: HeightAt | null; wind?: () => WindNow | null; fit?: string; envFor?: EnvFor;
}

export class Match3p {
  private r: YourRound;
  private turn: OwnerTurn | null = null;
  private done = false;
  /** a count of the strokes sent: the actors lists and the strokes carry it as their minute (a match has no clock of its own) */
  private tick = 0;
  private readonly centre: Pt;

  constructor(private readonly o: Match3pOpts) {
    if (!o.round.match) throw new Error('match3p: the round is not a match');
    this.r = o.round; this.centre = centreOf(o.frame);
  }

  /** the match as it stands (the engine saves it after each input, and settles it once it is over) */
  get round(): YourRound { return this.r; }
  /** the turn in hand (null: none: the match is over) */
  get current(): OwnerTurn | null { return this.turn; }
  get over(): boolean { return this.done; }

  /** the messages that open the match in the view: the match, then the strokes up to his first turn (the opponent's, when he has the honour), his turn */
  start(): HostMsg[] {
    const out: HostMsg[] = [this.matchMsg('start')];
    if (this.turn) { out.push(this.actors(), this.turnMsg(this.turn)); return out; }
    this.run(out);
    return out;
  }

  /** plays his input for the turn in hand and returns what follows: his stroke, the opponent's strokes, a decided hole, his next turn or the match's end.
   *  An input for another turn gets the turn in hand again; with none, nothing */
  input(vi: ViewInput): HostMsg[] {
    const t = this.turn; if (!t || this.done) return [];
    if (vi.holeIdx !== t.holeIdx || vi.stroke !== t.stroke) return [this.turnMsg(t)];
    const aim = fromView(vi.aim, this.centre), putting = vi.club === 'putter';
    const env = putting ? null : envOf(this.windNow(), this.o.view.kindAt, this.o.height ?? null, t.ball, t.lie, aim);
    const { holeIdx: _h, stroke: _s, ...rest } = vi; void _h; void _s;
    const input: Omit<OwnerInput, 'holeIdx' | 'stroke'> = { ...rest, aim, v: MODEL_V, ...(env ? { env } : {}) };
    const o = playMatchYours(this.o.view, this.r, this.o.skills, input, this.o.seed);
    this.r = o.round; this.turn = null;
    const out: HostMsg[] = [];
    const n = this.o.view.holes[o.shot.hole]?.n ?? o.shot.hole + 1, at = ++this.tick;
    out.push({ ...shotMsg({ shot: { ...o.shot, golfer: OWNER_M3P, t: at }, input, skills: this.o.skills, hole: n, view: this.o.view, height: this.o.height ?? null, wind: this.windNow() }, this.centre), at });
    this.run(out);
    return out;
  }

  /** plays on to his next turn: the opponent's strokes, the holes decided (the result, the hole's end, the next tee), or the match's end */
  private run(out: HostMsg[]): void {
    for (let k = 0; k < 400; k++) {
      const r = this.r;
      if (r.match && holeDecided(r)) {
        out.push(this.matchMsg('hole'), this.holeEnd(r));
        if (r.over) { this.end(out); return; }
        const nx = matchNextHole(this.o.view, r); if (nx === r) { this.end(out); return; }
        this.r = nx; continue;
      }
      if (r.over) { this.end(out); return; }
      const who = matchTurn(this.o.view, r);
      if (who === 'opp') {
        out.push(this.actors('address'));
        const { round, shot } = oppShot(this.o.view, r, this.o.seed, this.o.envFor), at = ++this.tick;
        this.r = round;
        out.push({ ...fieldShotMsg({ ...shot, golfer: OPP_3P, t: at }, this.centre, { hole: this.o.view.holes[shot.hole]?.n ?? shot.hole + 1, view: this.o.view, height: this.o.height ?? null, wind: this.windNow() }), at });
        continue;
      }
      if (who === 'you') {
        const t = yourTurn(this.o.view, r, this.o.skills); if (!t) { this.end(out); return; }
        this.turn = { ...t, golfer: OWNER_M3P, t: this.tick + 0.5 };
        out.push(this.actors(), this.turnMsg(this.turn));
        return;
      }
      this.end(out); return;
    }
  }
  private end(out: HostMsg[]): void { if (this.done) return; this.done = true; this.turn = null; out.push(this.matchMsg('end')); }

  /** the match as the view shows it */
  matchMsg(why: MatchMsg['why']): MatchMsg {
    const m = this.r.match!, sc = scoreOf(this.r), msg: MatchMsg = { v: PROTOCOL_V, t: 'match', why, name: m.name, hcp: m.hcp, stake: m.stake, holes: this.r.holes.length, res: [...m.res],
      score: { text: sc.text, short: sc.short, up: sc.up, played: sc.played, left: sc.left, over: sc.over, result: sc.result } };
    if (why === 'hole' && holeDecided(this.r)) {
      const row = this.r.card[this.r.at]!; msg.hole = row.n; msg.you = row.up ? null : row.strokes;
      const os = m.ocard[m.ocard.length - 1]; msg.opp = m.holed && os !== undefined ? os : null;
    }
    return msg;
  }
  /** the opponent where he stands (his ball; addressing it before his stroke, else watching), and the owner flagged (the view draws him itself) */
  actors(doing: 'address' | 'watch' = 'watch'): ActorsMsg {
    const m = this.r.match!, row = rowOf(this.r), h = this.o.view.holes[row.i], c = this.centre, n = h?.n ?? row.i + 1;
    const toward = doing === 'address' ? h?.pin ?? this.r.ball : this.r.ball, hd = Math.round(Math.atan2(toward.y - m.ball.y, toward.x - m.ball.x) * 180 / Math.PI);
    const opp: Actor = { id: OPP_3P, role: 'golfer', at: toView(m.ball, c), hole: n, name: m.name, sex: this.o.oppSex ?? 'm', look: m.look, doing: m.holed ? 'stand' : doing, phase: doing === 'address' ? 0.3 : 0,
      ball: m.holed ? null : toView(m.ball, c), dress: dressOf({ id: nameSeed(m.name) % 100000, look: m.look, sex: this.o.oppSex ?? 'm' }) };
    if (Number.isFinite(hd)) opp.heading = hd;
    const you: Actor = { id: OWNER_M3P, role: 'golfer', at: toView(this.r.ball, c), hole: n, owner: true };
    return { v: PROTOCOL_V, t: 'actors', at: this.tick + (doing === 'address' ? 0.99 : 0.5), actors: [you, opp], play: true };
  }
  private holeEnd(r: YourRound): HoleEndMsg {
    const row = r.card[r.at]!;
    return { v: PROTOCOL_V, t: 'holeEnd', holeIdx: row.i, hole: row.n, par: row.par, strokes: row.strokes, last: r.over || r.at + 1 >= r.holes.length };
  }
  private turnMsg(t: OwnerTurn) {
    const m = turnMsg({ turn: t, skills: this.o.skills, view: this.o.view, height: this.o.height ?? null, wind: this.windNow(), last: this.r.at === this.r.holes.length - 1, ...(this.o.fit ? { fit: this.o.fit } : {}) }, this.centre);
    const sk = this.o.skills, bag = typeof sk === 'number' ? undefined : sk.clubs, mech = typeof sk === 'number' ? undefined : sk.mech;
    const ok = allowedClubs(t.lie, t.lie === 'tee', bag, mech), clubs = m.clubs.filter(c => ok.includes(c.club) || c.club === m.suggested.club);
    if (clubs.length) m.clubs = clubs;
    return m;
  }
  private windNow(): WindNow | null { return this.o.wind ? this.o.wind() : null; }
}
