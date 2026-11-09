// The Season card (T188, plan P23-UX P2-2): the top bar's season chip opens it. Where the year is (the month, the months to the season's end or
// the tournament); in a founding season the founding checklist (nine holes, a car park, a clubhouse: each ✓ or ✗ with a Fix that arms its tool
// and pulses its control), after founding the season's tournament plan (the invitation's season, the tournament day); and the Course stats
// (CourseStatsPanel, moved in from its own chip). Docked top right, under the top bar, where the round's pill was.
// T366 (#1021; the owner, 2026-11-08: "move the skipping to tournament forward arrow button to the season window", "make headers for windows sticky with the window
// close button also sticky"): the Skip to tournament button is a row of this card (the top bar's chip is gone; canSkip is the unlock that showed the chip), and its
// header, the title and the close button, stays pinned at the top while the card scrolls.
import type { Game } from '../../game/engine';
import { CourseStatsPanel } from '../CourseStatsPanel';
import { Icon } from '../Icon';
import { FIX, foundingChecklist, seasonPhase, seasonSentence } from './season';

export function SeasonCard({ game, onClose, onSelectHole, canSkip = false }: { game: Game; onClose: () => void; onSelectHole?: (hole: number) => void; canSkip?: boolean }) {
  const gv = game.golfView(), fv = game.foundingView(); if (!gv) return null;
  const phase = seasonPhase(fv, game.traffic.round.runs), stats = game.courseStatsView();
  const items = phase === 'founding' && fv ? foundingChecklist(fv.check) : [];
  const months = Math.ceil(gv.monthsLeft);
  // the skip: to the tournament, or (no tournament yet) to the end of the season; not on tournament day, nor while it skips
  const toEnd = !!fv && !fv.due, skipLabel = toEnd ? 'Skip to season end' : 'Skip to tournament';
  const skipTip = toEnd ? `Skip to the end of the season (no tournament yet: ${fv!.invited ? 'the first one closes the next season' : fv!.check.text})` : 'Skip to the tournament (end of August)';
  return (
    <div className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20 w-[380px] max-w-[calc(100vw-1.5rem)] max-h-[calc(100vh-var(--hud-top,6rem)-5rem)] overflow-y-auto glass p-3`} data-testid="season-card" role="dialog" aria-label="Season">
      <div className="win-head flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon name="calendar" size={30} />
          <div className="min-w-0">
            <div className="font-display text-base font-bold uppercase tracking-wide text-[var(--gold-hi)]">{phase === 'founding' ? 'Founding season' : phase === 'invited' ? 'Invited season' : `Season ${gv.year}`}</div>
            <div className="text-sm">{gv.month} · {gv.live ? 'tournament day' : `${months} ${months === 1 ? 'month' : 'months'} to ${phase === 'founding' || (fv && !fv.due) ? 'the season end' : 'the tournament'}`}</div>
          </div>
        </div>
        <button className="btn-icon shrink-0" onClick={onClose} aria-label="Close" data-tip="Close (Esc)"><Icon name="close" size={16} /></button>
      </div>
      <p className="mt-2 leading-snug" data-testid="season-sentence">{seasonSentence(phase, { due: fv?.due, check: fv?.check, monthsLeft: gv.monthsLeft, live: gv.live })}</p>
      {canSkip && (
        <button className="btn mt-2 flex w-full items-center justify-center gap-2 disabled:opacity-40" data-guide="chip-skip" data-testid="season-skip" disabled={game.traffic.skipping || gv.live} onClick={() => game.skipToTournament()} data-tip={skipTip} aria-label={skipLabel}>
          <Icon name="skip" size={16} />{game.traffic.skipping ? 'Skipping…' : skipLabel}
        </button>
      )}
      {phase === 'founding' && (
        <div className="mt-2" data-testid="founding-checklist">
          <div className="label-caps mb-1">The tour's invitation</div>
          <ul className="space-y-1">
            {items.map(it => (
              <li key={it.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5" data-check={it.id}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[12px] font-bold ${it.ok ? 'bg-emerald-500/25 text-emerald-200' : 'bg-red-500/25 text-red-200'}`} aria-label={it.ok ? 'done' : 'not yet'}>{it.ok ? '✓' : '✗'}</span>
                <span className="min-w-0 flex-1"><span className="font-semibold">{it.label}</span> <span className="sub-line">· {it.detail}</span></span>
                {!it.ok && <button className="chip chip-on" data-guide={`fix-${it.id}`} onClick={() => { game.armFix(it.id); onClose(); }} data-tip={`Fix: ${FIX[it.id].label}`}>Fix</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {phase !== 'founding' && (
        <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2" data-testid="season-plan">
          <div className="label-caps mb-0.5">The tournament</div>
          <div>{gv.live ? 'Today: the Club Championship is on.' : phase === 'invited' ? `The Club Championship, at the end of ${fv?.due ? 'this' : 'next'} season.` : `The ${gv.tierName} tournament closes this season: ${months} ${months === 1 ? 'month' : 'months'} to go.`}</div>
        </div>
      )}
      {stats && (
        <div className="mt-3" data-testid="season-stats">
          <CourseStatsPanel stats={stats} bare onSelectHole={onSelectHole} />
        </div>
      )}
    </div>
  );
}
