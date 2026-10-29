// T268 (#809; the owner, 2026-10-29: "should be able to place the diffrent tees white/red/blue/yellow yourself"): each tee set's row, on the hole card
// and in Edit Hole Layout. A set the hole has: its length and par, Move (its box follows the pointer as a ghost: R turns it, [ ] size it, a click lays
// it there and its old ground goes back) and ✕ (it goes with its box, never the hole's last set). A set it has not: Place (the same ghost) and Add (the
// quick box along the line of play, T254). The map draws the ghost (Engine.drawTeeGhost); a drag on a tee box with the card open moves it too.
import type { Game } from '../../game/engine';
import { TEE_KINDS, TEE_SET } from '../../game/golf/teesets';
import type { TeeKind } from '../../game/golf/types';

/** a set's marker colour, as a small ball */
export function TeeDot({ kind }: { kind: TeeKind }) {
  const s = TEE_SET[kind];
  return <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-[-1px]" style={{ background: s.fill, boxShadow: `inset 0 0 0 1px ${s.rim}` }} />;
}

/** the four sets' rows for hole n: tees, the sets it has with their lengths and pars (teeLengths); addable, those Add tee can lay */
export function TeeSetRows({ game, n, tees, addable }: { game: Game; n: number; tees: readonly { kind: TeeKind; m: number; par: number }[]; addable: readonly TeeKind[] }) {
  const tp = game.teePlace, last = tees.length <= 1, price = game.teeBoxPrice?.() ?? 0;
  return (
    <>
      <ul className="mt-1 flex flex-col gap-1" data-testid="tee-sets">
        {TEE_KINDS.map(k => {
          const t = tees.find(q => q.kind === k), s = TEE_SET[k], on = tp?.hole === n && tp.kind === k;
          return (
            <li key={k} className="flex min-w-0 items-center gap-1.5 text-[12px]" data-tee={k}>
              <span className="flex min-w-0 flex-1 items-center truncate"><TeeDot kind={k} /><span className={t ? '' : 'text-[var(--muted)]'}>{t ? `${s.name} tee · par ${t.par}` : `${s.name}: none`}</span></span>
              {t && <span className="font-semibold tabular-nums">{t.m} m</span>}
              <button className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} onClick={() => (on ? game.cancelTeePlace() : game.placeTee(n, k))} data-place-tee={k}
                title={on ? 'Put it down (Esc)' : `${t ? 'Move' : 'Place'} the ${s.colour} tee (${s.who}): its box follows the pointer, facing the line of play; R turns it, [ ] size it, a click lays it${t ? ' and its old ground goes back' : ''}. Priced like a tee, with its level pad`}>
                {on ? 'Placing…' : t ? 'Move' : 'Place'}
              </button>
              {t ? (
                <button className="chip disabled:opacity-40" disabled={last} onClick={() => game.removeTeeSet(n, k)} aria-label={`Remove the ${s.colour} tee`} data-remove-tee={k}
                  title={last ? 'A hole keeps its last tee: place another set first' : `Remove the ${s.colour} tee: its box goes and the ground is as it was (no refund; undo brings it back)`}>✕</button>
              ) : addable.includes(k) ? (
                <button className="chip" onClick={() => game.addTeeSet(n, k)} data-add-tee={k}
                  title={`Lay the ${s.colour} tee box ${k === 'back' ? 'behind' : 'ahead'} along the line at once, priced like a tee${price ? `: about $${price.toLocaleString('en-US')}` : ''}`}>Add</button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {tp?.hole === n && <p className="sub-line mt-1" data-testid="tee-placing">Click the map to lay the {TEE_SET[tp.kind].colour} tee · <kbd>R</kbd> turns it · <kbd>[</kbd> <kbd>]</kbd> size it · <kbd>Esc</kbd> puts it down</p>}
    </>
  );
}

/** Edit Hole Layout's tee sets: the rows for the hole being edited (the plan's handles still drag; a set in hand takes the map's clicks) */
export function EditTees({ game, n }: { game: Game; n: number }) {
  const r = game.teeSetRows(n);
  if (!r.tees.length) return null;
  return (
    <section className="mt-2" aria-label="Tee sets" data-section="edit-tees">
      <h4 className="sub-head">Tee sets</h4>
      <TeeSetRows game={game} n={n} tees={r.tees} addable={r.addable} />
    </section>
  );
}
