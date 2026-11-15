// The jam build's title card (docs/JAM.md, J1): "Fairway Fortune", one line, New game / Continue / How to play. Shown over the game when JAM
// (src/game/features.ts) until the player chooses; pure view, App.tsx owns the choice. Same look as the game's other cards (glass, gold display type).
import { useState } from 'react';
import { ActionTile, TILE_ROW } from '../ActionTile'; // J8 (#1261): each button of the title card wears a painted tile
import { SANDBOX_MONEY, type SandboxSave } from '../../game/ext/progressive-ui/sandbox';

export const TITLE = 'Fairway Fortune';
export const TAGLINE = 'Build a golf club from a driving range. Borrow wisely.';
/** the four things to know before the first click */
export const HOW_TO_PLAY: readonly string[] = [
  'The driving range earns your first money: golfers hit buckets of balls, and you pick the balls up again.',
  'Spend it on holes: Course > Holes > New hole, click a tee, then a green, and Build. A clubhouse brings the green fees.',
  'Play the holes you built: open a hole and press Play this hole.',
  'Practise on your range: Hit balls and Chip and putt. Drills unlock shot shaping and the putt read, and lower your handicap.',
  'Click your cash to open the Bank: borrow (see the total interest first), repay early, or save.',
]; // (T459, the jam MVP: no goal, no murabaha: docs/JAM.md "Future development")

/** J12 (#1271): the dark pool behind the card: a soft ellipse a little wider than the card, fading to nothing. It is never a layer over the picture (the owner's rule:
 *  no flat colour washes hiding the art); the card sits on the left of a wide screen and the scene's point of interest on the right (showcase.ts SHOW_ANCHOR) */
export const CARD_POOL = 'radial-gradient(closest-side, rgba(6,10,4,0.62) 0%, rgba(6,10,4,0.46) 55%, rgba(6,10,4,0) 100%)';

/** #1314: what the Sandbox choice says it gives, and its town roads choice (#1317) */
export const SANDBOX_LINE = `Everything unlocked, $${SANDBOX_MONEY.toLocaleString('en-US')} to build with, no tutorial.`;
export const TOWN_ROADS_CHOICES: readonly { townRoads: boolean; label: string; tip: string }[] = [
  { townRoads: false, label: 'I build the town roads', tip: 'The town grows only along the roads you build, as in the normal game' },
  { townRoads: true, label: 'The town builds its own roads', tip: 'The town lays its own gravel streets as it grows' },
];

/** onSandbox: the Sandbox choice (#1314; absent: none, as in the jam build); canContinueSandbox / onContinueSandbox: a sandbox game is saved (its own slot) to go back to */
export function TitleCard({ canContinue, onNew, onContinue, onSandbox, canContinueSandbox = false, onContinueSandbox, starting = false }: {
  canContinue: boolean; onNew: () => void; onContinue: () => void; onSandbox?: (o: SandboxSave) => void; canContinueSandbox?: boolean; onContinueSandbox?: () => void; starting?: boolean;
}) {
  const [how, setHow] = useState(false);
  const [sand, setSand] = useState(false); // #1314: the Sandbox choice's options are open
  const [townRoads, setTownRoads] = useState(false);
  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 min-[900px]:justify-start min-[900px]:pl-[7vw]" data-testid="title-card" role="dialog" aria-modal="true" aria-label={TITLE}>
      <div className="relative w-full max-w-md">
      <div className="pointer-events-none absolute -inset-x-24 -inset-y-20" style={{ background: CARD_POOL }} aria-hidden="true" data-testid="title-pool" />
      <div className="glass relative w-full rounded-2xl border border-white/10 p-6 text-center shadow-2xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">A golf club money game</div>
        <h1 className="font-display mt-1 text-4xl font-bold leading-tight text-[var(--gold-hi)]">{TITLE}</h1>
        <p className="mt-2 text-sm text-slate-300">{TAGLINE}</p>
        {how ? (
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-left text-sm text-slate-200" data-testid="how-to-play">
            {HOW_TO_PLAY.map(s => <li key={s}>{s}</li>)}
          </ol>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          {canContinue && <button className="btn w-full !py-2 text-base font-semibold" onClick={onContinue} data-testid="title-continue" autoFocus><ActionTile tile="front-door" size={TILE_ROW} />Continue</button>}
          <button className={`btn w-full !py-2 text-base ${canContinue ? '' : 'font-semibold'}`} onClick={onNew} data-testid="title-new" autoFocus={!canContinue}><ActionTile tile="new-game" size={TILE_ROW} />New game</button>
          {onSandbox && <button className="btn w-full !py-2 text-base" onClick={() => setSand(!sand)} aria-expanded={sand} data-testid="title-sandbox" title={SANDBOX_LINE}><ActionTile tile="earthworks" size={TILE_ROW} />Sandbox</button>}
          {onSandbox && sand && (
            <div className="rounded-lg border border-amber-400/30 bg-black/25 p-3 text-left text-sm text-slate-200" data-testid="sandbox-options">
              <p className="text-slate-300">{SANDBOX_LINE} It is saved apart from your career game, which stays as it is.</p>
              {canContinueSandbox && onContinueSandbox && <button className="btn mt-2 w-full !py-1.5" onClick={onContinueSandbox} data-testid="title-sandbox-continue">Continue sandbox</button>}
              <fieldset className="mt-2 space-y-1">
                <legend className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/80">Town roads</legend>
                {TOWN_ROADS_CHOICES.map(c => (
                  <label key={String(c.townRoads)} className="flex cursor-pointer items-center gap-2" title={c.tip}>
                    <input type="radio" name="sandbox-roads" checked={townRoads === c.townRoads} onChange={() => setTownRoads(c.townRoads)} data-testid={`sandbox-roads-${c.townRoads ? 'town' : 'me'}`} />
                    {c.label}
                  </label>
                ))}
              </fieldset>
              <button className="btn-gold mt-3 w-full !py-1.5 font-semibold" onClick={() => onSandbox({ townRoads })} data-testid="title-sandbox-start">{canContinueSandbox ? 'Start a new sandbox' : 'Start sandbox'}</button>
            </div>
          )}
          <button className="btn w-full" onClick={() => setHow(!how)} aria-expanded={how} data-testid="title-how"><ActionTile tile="how-to-play" size={TILE_ROW} />{how ? 'Hide how to play' : 'How to play'}</button>
        </div>
        {starting && <div className="mt-3 text-xs text-slate-400" role="status" data-testid="title-starting">Mowing the fairways and filling the ball buckets…</div>}
      </div>
      </div>
    </div>
  );
}
