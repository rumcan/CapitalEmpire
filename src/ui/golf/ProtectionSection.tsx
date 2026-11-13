// The Protection section of the Bank panel (jam ticket J3): choose an insurance plan. Shows what a typical bad month costs under each plan,
// so the trade (a steady premium against a rare big bill) is felt, not explained.
import { useState } from 'react';
import { PLAN_IDS, PLANS, applyInsurance, setInsurance, type Plan } from '../../game/golf/risk';
import type { FinanceSave } from '../../game/golf/finance';
import { money } from './finevents';

const EXAMPLE = 8_000;

/** `finance` is game.finance; `onChange` lets the host re-render / save after the plan is set */
export function ProtectionSection({ finance, onChange }: { finance: FinanceSave; onChange?: (p: Plan) => void }) {
  const [, bump] = useState(0);
  const cur = finance.insurance;
  return (
    <section className="space-y-2" data-testid="protection" aria-label="Protection">
      <div className="text-[12px] font-semibold uppercase tracking-wider text-slate-400">Protection</div>
      <p className="text-xs text-slate-400">About one month in twelve something breaks. Insurance is a steady monthly price for not facing a big bill alone.</p>
      <div className="grid gap-2">
        {PLAN_IDS.map(id => {
          const p = PLANS[id], hit = applyInsurance(EXAMPLE, id);
          return (
            <button key={id} type="button" role="radio" aria-checked={cur === id} data-testid={`plan-${id}`}
              onClick={() => { setInsurance(finance, id); bump(n => n + 1); onChange?.(id); }}
              className={`rounded-xl border p-2 text-left text-xs ${cur === id ? 'border-emerald-400/70 bg-emerald-400/10' : 'border-white/10 bg-white/5 hover:border-white/30'}`}>
              <div className="flex justify-between text-sm font-semibold text-white"><span>{p.name}</span><span>{p.premium ? `${money(p.premium)} / month` : 'free'}</span></div>
              <div className="text-slate-300">{p.blurb}</div>
              <div className="text-slate-400">An {money(EXAMPLE)} storm bill: you pay {money(hit.youPay)}.</div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
