// The money-literacy layer over the map (jam ticket J3): the goal chip, the month statement toast and card, the money moments and the report card,
// mounted by one line in App.tsx. Reads game.finance (golf/finance.ts) and the live figures; changes nothing but finance.moments.
import type { FinanceSave } from '../../game/golf/finance';
import type { Live, Report } from '../../game/golf/reports';
import { GoalChip, ReportCard } from './ReportCard';
import { StatementCard } from './StatementCard';
import { MoneyMoments } from './MoneyMoments';

/** what the HUD needs of the game (engine.ts `Game` provides it) */
export interface FinHost { finance: FinanceSave; finLive(): Live }

export function FinLitHud({ game }: { game: FinHost }) {
  const f = game.finance, live = game.finLive(), history = f.history as Report[];
  return <>
    <div className="pointer-events-none absolute left-28 top-[calc(var(--hud-top,4.75rem)+0.25rem)] z-20" data-testid="finlit-goal"><GoalChip history={history} live={live} /></div>
    <StatementCard history={history} />
    <MoneyMoments finance={f} cash={live.cash} />
    <ReportCard history={history} live={live} />
  </>;
}
