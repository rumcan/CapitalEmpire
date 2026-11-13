// The jam build's title card (docs/JAM.md, J1): "Fairway Fortune", one line, New game / Continue / How to play. Shown over the game when JAM
// (src/game/features.ts) until the player chooses; pure view, App.tsx owns the choice. Same look as the game's other cards (glass, gold display type).
import { useState } from 'react';

export const TITLE = 'Fairway Fortune';
export const TAGLINE = 'Build a golf club from a driving range. Borrow wisely.';
/** the four things to know before the first click */
export const HOW_TO_PLAY: readonly string[] = [
  'The driving range earns your first money: golfers hit buckets of balls, and you pick the balls up again.',
  'Spend it on holes: Course > Holes > New hole, click a tee, then a green, and Build. A clubhouse brings the green fees.',
  'Play the holes you built: open a hole and press Play this hole.',
  'Click your cash to open the Bank: borrow (see the total interest first), repay early, or save.',
]; // (T459, the jam MVP: no goal, no murabaha: docs/JAM.md "Future development")

export function TitleCard({ canContinue, onNew, onContinue }: { canContinue: boolean; onNew: () => void; onContinue: () => void }) {
  const [how, setHow] = useState(false);
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" data-testid="title-card" role="dialog" aria-modal="true" aria-label={TITLE}>
      <div className="glass w-full max-w-md rounded-2xl border border-white/10 p-6 text-center shadow-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">A golf club money game</div>
        <h1 className="font-display mt-1 text-4xl font-bold leading-tight text-[var(--gold-hi)]">{TITLE}</h1>
        <p className="mt-2 text-sm text-slate-300">{TAGLINE}</p>
        {how ? (
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-left text-sm text-slate-200" data-testid="how-to-play">
            {HOW_TO_PLAY.map(s => <li key={s}>{s}</li>)}
          </ol>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          {canContinue && <button className="btn w-full !py-2 text-base font-semibold" onClick={onContinue} data-testid="title-continue" autoFocus>Continue</button>}
          <button className={`btn w-full !py-2 text-base ${canContinue ? '' : 'font-semibold'}`} onClick={onNew} data-testid="title-new" autoFocus={!canContinue}>New game</button>
          <button className="btn w-full" onClick={() => setHow(!how)} aria-expanded={how} data-testid="title-how">{how ? 'Hide how to play' : 'How to play'}</button>
        </div>
      </div>
    </div>
  );
}
