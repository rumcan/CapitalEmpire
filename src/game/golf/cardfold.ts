// T348 (#990): the cards at the right edge fold away while your shot is open. The playtest (h3s1-address): at an address the right-hand column held the Mayor's Cup card and the tutorial card, the toast and the tool
// footer crowded the speed bar's strip, and the shot panel took the middle bottom: the cards you are not using sit over the one you are. While a shot is open (yours, or your turn in the tournament) every card of the
// T392 to T394 stack that is open (the card on the right: the range's, the clubhouse's, the event's; the Staff card; your profile; your bag or your cards) is closed, and the cards come back when the shot is over:
// FOLD_BACK_MS after the last shot of a run closes (a putt a few seconds after a chip, the next address of a hole, never flickers the cards in and out between two shots close together).
// A card you open yourself while the shot is open stays: it is your own act. A card is brought back only if it is still closed, and not if its neighbour took its place (the bag and the cards stand in one column,
// the range card and the clubhouse card in another). The guide cards (the tutorial, the range guide, the tournament checklist) hold no open state: App.tsx hides them while `on`.
// Pure TS, no DOM; the engine reads the open cards each frame and does what step says (Game.stepFoldCards).
import type { EventId } from './clubevents';

/** the cards that fold (the event's card is kept by its id) */
export type FoldKey = 'bag' | 'cards' | 'player' | 'staff' | 'club' | 'range';
/** which cards are open now */
export interface OpenCards { bag: boolean; cards: boolean; player: boolean; staff: boolean; club: boolean; range: boolean; event: EventId | null }
/** a set of cards: the ones folded for a shot, or the ones to bring back */
export type Folded = Partial<Record<FoldKey, true>> & { event?: EventId };
/** how long (ms of real time) the cards stay away after the last frame a shot was open */
export const FOLD_BACK_MS = 2500;
const KEYS: readonly FoldKey[] = ['range', 'club', 'staff', 'player', 'cards', 'bag'];
/** the card each card cannot stand beside: the bag and the cards take one column, the range card and the clubhouse card one */
const SHARES: Readonly<Record<'bag' | 'cards' | 'club' | 'range', 'bag' | 'cards' | 'club' | 'range'>> = { bag: 'cards', cards: 'bag', club: 'range', range: 'club' };

/** what a frame asks the engine to do: `on` is whether the cards are folded after it; `close`: the cards to close now (a shot has just opened); `back`: the cards to open again (the shot's run is over) */
export interface FoldStep { on: boolean; close?: Folded; back?: Folded }

export class CardFold {
  private f: Folded | null = null;
  private until = 0;
  /** whether the cards are folded away now (a shot is open, or its run ended less than FOLD_BACK_MS ago) */
  get on(): boolean { return this.f !== null; }
  /** one frame at `now` (ms): whether a shot is open, and the cards open now. Null when nothing changes */
  step(now: number, shot: boolean, open: OpenCards): FoldStep | null {
    if (shot) {
      this.until = now + FOLD_BACK_MS;
      if (this.f) return null;
      const f: Folded = {};
      for (const k of KEYS) if (open[k]) f[k] = true;
      if (open.event) f.event = open.event;
      this.f = f;
      return { on: true, close: f };
    }
    if (this.f && now >= this.until) {
      const back: Folded = {}, f = this.f;
      for (const k of KEYS) if (f[k] && !open[k] && !(k in SHARES && open[SHARES[k as keyof typeof SHARES]])) back[k] = true;
      if (f.event && open.event === null) back.event = f.event;
      this.f = null;
      return { on: false, back };
    }
    return null;
  }
  /** drops the fold with no cards to bring back (a game left, a golf game ended) */
  reset(): void { this.f = null; this.until = 0; }
}
