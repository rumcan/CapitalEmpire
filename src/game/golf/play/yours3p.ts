// T430, T432 (docs/CINDERLINKS-PORT.md): his own round (play/yours.ts YourRound) played in the view from behind the golfer. The round is the game's: the
// same one the top view plays, kept in the save (so a round left on the 7th comes back at the same lie, T432) and ended through the game's own round end
// (its card into his rounds, his handicap, the event's result, T430). This driver is what Play3p (play3p.ts) plays on for it: the turn is yourTurn, a
// stroke is playYours (a gimme takeGimme), each with the round's own stream, so the same input gives the same shot in either view.
// The game's side of each stroke (saving the round, the toast, the skill gains and card pulls of T431) is the caller's, through the hooks.
// Pure TS, no DOM.
import type { CourseView, OwnerInput, Shot } from './index';
import type { ShotSkill } from './shot';
import { holeOf, nextHole, playYours, rowOf, takeGimme, canGimme, yourTurn, type YourRound } from './yours';
import type { RoundDriver } from './play3p';

/** what the driver needs of the game: the round now (null: none), keeping a changed round (the game saves it), what follows a stroke (the round before
 *  and after it, the stroke, and whether the hole was picked up), and going on to the next hole (absent: yours.ts nextHole) */
export interface YoursHooks {
  get(): YourRound | null;
  set(r: YourRound): void;
  played?(shot: Shot, before: YourRound, after: YourRound, up: boolean): void;
  next?(): void;
}

/** the round's driver over the course `view` for his skills (the game's: yourSkills) and the game's seed */
export function yoursDriver(view: CourseView, sk: ShotSkill, seed: number, h: YoursHooks): RoundDriver {
  const shots: Shot[] = [], inputs: OwnerInput[] = [];
  const round = (): YourRound => { const r = h.get(); if (!r) throw new Error('yours3p: no round'); return r; };
  return {
    view, golfer: -1, inputs,
    turn() { const r = h.get(); return r ? yourTurn(view, r, sk) : null; },
    play(input) {
      const r = round(), row = rowOf(r);
      let after: YourRound, shot: Shot, up = false;
      if (input.gim === true && input.club === 'putter') {   // (a gimme: the round's own, inside its rule)
        if (!canGimme(view, r)) throw new Error('yours3p: no gimme here');
        after = takeGimme(view, r); const pin = holeOf(view, row.i)!.pin;
        shot = { golfer: -1, hole: row.i, stroke: row.strokes + 1, t: 0, from: { x: r.ball.x, y: r.ball.y }, to: { x: pin.x, y: pin.y }, club: 'putter', lie: 'green', penalty: 0, holed: true };
      } else {
        const { holeIdx: _h, stroke: _s, ...inp } = input; void _h; void _s;
        const o = playYours(view, r, sk, inp, seed); after = o.round; shot = o.shot; up = o.up;
      }
      h.set(after); shots.push(shot); inputs.push(input);
      h.played?.(shot, r, after, up);
      return shot;
    },
    shots: () => shots,
    hole: (i) => { const p = holeOf(view, i); if (!p) throw new Error(`yours3p: no hole ${i}`); return p; },
    strokes: (i) => h.get()?.card.find(c => c.i === i)?.strokes ?? 0,
    isLast: (i) => { const r = h.get(); return !!r && r.card[r.card.length - 1]?.i === i; },
    over: () => { const r = h.get(); return !r || !!r.over; },
    nextHole() { if (h.next) h.next(); else { const r = h.get(); if (r) h.set(nextHole(view, r)); } },
  };
}
