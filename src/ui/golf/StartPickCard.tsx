// J9 (#1268, the owner 2026-11-14: "the start should be placing the driving range and that should buit your house and buy the property. so the guy can start where
// he wants"): the card over the map while a new game's start is chosen. The placement ghost is the game's own (golf/placing.ts: green where a start fits, red with
// its reason by the pointer); this card says what a click does, and offers "Pick a spot for me" (today's automatic start: nobody is stuck, and the keyboard has a way)
// and Turn (R). The same look as the real-course placer's card (ui/course/RealPlaceCard.tsx). Pure view: the engine owns the choice.
import type { Game } from '../../game/engine';
import { Icon } from '../Icon';

export function StartPickCard({ game }: { game: Game }) {
  const v = game.startPickView();
  if (!v) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-3" data-testid="start-pick-card">
      <div className="pointer-events-auto flex w-[34rem] max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 text-slate-200 shadow-2xl backdrop-blur" role="dialog" aria-label={v.title}>
        <div className="min-w-0 flex-1 basis-60">
          <div className="font-display text-lg font-bold leading-tight text-[var(--gold-hi)]">{v.title}</div>
          <p className="mt-0.5 text-sm leading-snug text-slate-100" data-testid="start-pick-text">{v.text}</p>
          <div className="mt-1 text-[11px] text-slate-400">Green: a start fits. Red: it does not, and the note by the pointer says why. R turns the range{v.facing ? ` (the golfers hit ${v.facing})` : ''}. Drag the map to look around.</div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button className="btn-gold w-full px-3 py-1.5 text-sm" onClick={() => game.startPickAuto()} data-tip="Start where the game would put you: the same start as always" data-testid="start-pick-auto">Pick a spot for me</button>
          <button className="btn w-full" onClick={() => game.startPickTurn()} data-tip="Turn the range a quarter (R)" data-testid="start-pick-turn"><Icon name="forward2" size={16} />Turn (R)</button>
        </div>
      </div>
    </div>
  );
}
