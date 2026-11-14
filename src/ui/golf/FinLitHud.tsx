// The money-literacy layer over the map (jam ticket J3): the goal chip, the month statement toast and card, the money moments and the report card,
// mounted by one line in App.tsx. Reads game.finance (golf/finance.ts) and the live figures; changes nothing but finance.moments.
import type { FinanceSave } from '../../game/golf/finance';
import type { Live, Report } from '../../game/golf/reports';
import { Icon } from '../Icon';
import { GoalChip, GoalToggle, ReportCard } from './ReportCard';
import { StatementCard } from './StatementCard';
import { MoneyMoments } from './MoneyMoments';
import { JAM } from '../../game/features';

/** what the HUD needs of the game (engine.ts `Game` provides it) */
export interface FinHost { finance: FinanceSave; finLive(): Live }

/** #1297: the Goal pill is part of the top bar (goal-pill.ts), not a layer of its own over the panels. The small chip, for the bar's own row (golf game, normal build: the jam has no goal) */
export function GoalChipInBar({ game, open, onToggle }: { game: FinHost; open: boolean; onToggle: () => void }) {
  if (JAM) return null;
  return <GoalToggle history={game.finance.history as Report[]} live={game.finLive()} open={open} onToggle={onToggle} />;
}
/** #1297: the full pill, in a row of the top bar under its chip while the player has it open: the pill (a click: the report card) and a Fold button beside it */
export function GoalRowInBar({ game, onFold }: { game: FinHost; onFold: () => void }) {
  if (JAM) return null;
  return (
    <div className="flex items-center gap-1.5" data-testid="finlit-goal">
      <GoalChip history={game.finance.history as Report[]} live={game.finLive()} />
      <button type="button" className="chip pointer-events-auto" onClick={onFold} aria-label="Fold the goal to a small chip" data-tip="Fold the goal to a small chip in the top bar" data-testid="goal-fold"><Icon name="up" size={14} />Fold</button>
    </div>
  );
}

export function FinLitHud({ game }: { game: FinHost }) {
  const f = game.finance, live = game.finLive(), history = f.history as Report[];
  // T459 (the jam MVP, the owner: "too much financial literacy"): the jam build keeps the month-end statement only; the goal chip, the money moments and
  // the report card are hidden there (docs/JAM.md "Future development")
  if (JAM) return <StatementCard history={history} />;
  return <>
    <StatementCard history={history} />
    <MoneyMoments finance={f} cash={live.cash} />
    <ReportCard history={history} live={live} />
  </>;
}
