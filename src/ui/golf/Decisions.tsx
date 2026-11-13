// J4 (#1207, docs/JAM.md): the money decisions' readouts, shared by the range, the ball room, the buildings and the hole wizard. PaybackLine: what an
// investment costs, its upkeep a month, the extra income a month the game's demand models expect from it (an estimate) and when it pays back.
// PriceLadder: the golfers (or members) and the takings a month at the price now and a step either side. Money is written by ./money (the currency
// setting; gains and losses with a sign and an arrow when safe money is on).
import type { Payback, PriceRung } from '../../game/golf/payback';
import { paybackWords } from '../../game/golf/payback';
import { Term } from './Glossary';
import { money, moneyDelta, deltaTone, useMoneyPrefs } from './money';

/** "Cost $8,000 · upkeep $60 a month · about +$410 a month (estimate) · Pays back in about 23 months"; `what`: a word before the income (e.g. "green fees") */
export function PaybackLine({ p, what, note, testid }: { p: Payback; what?: string; note?: string; testid?: string }) {
  useMoneyPrefs();
  const tone = p.verdict === 'pays' || p.verdict === 'free' ? 'text-emerald-300' : p.verdict === 'slow' ? 'text-amber-300' : 'text-slate-300';
  const mark = p.verdict === 'pays' || p.verdict === 'free' ? '✓ ' : p.verdict === 'never' ? '✗ ' : p.verdict === 'slow' ? '⏳ ' : '';
  return (
    <div className="text-[12px] leading-snug text-slate-400" data-testid={testid ?? 'payback'} data-verdict={p.verdict}>
      {p.cost > 0 && <>Cost <span className="text-slate-200">{money(p.cost)}</span> · </>}
      upkeep <span className="text-slate-200">{money(p.upkeep)}</span> a month
      {p.extra >= 0.5 && <> · about <span className={deltaTone(p.extra)}>{moneyDelta(p.extra)}</span> a month{what ? ` in ${what}` : ''} (<Term id="estimate">estimate</Term>)</>}
      {' · '}<span className={`font-semibold ${tone}`}><span aria-hidden>{mark}</span><Term id="payback">{paybackWords(p)}</Term></span>
      {note && <span className="block text-slate-500">{note}</span>}
    </div>
  );
}

/** the price ladder: a row a price, "now" marked; `who`: what is counted ("golfers", "members"); `step`: the step's words ("$1") */
export function PriceLadder({ rungs, who, testid }: { rungs: PriceRung[]; who: string; testid?: string }) {
  useMoneyPrefs();
  const now = rungs.find(r => r.now);
  return (
    <table className="mt-1 w-full text-[12px]" data-testid={testid ?? 'price-ladder'}>
      <caption className="text-left text-slate-400">At each price, a month (<Term id="estimate">estimates</Term>)</caption>
      <thead><tr className="text-slate-500"><th className="text-left font-normal">Price</th><th className="text-right font-normal">{who}</th><th className="text-right font-normal">Takings</th><th className="text-right font-normal">vs now</th></tr></thead>
      <tbody>
        {rungs.map(r => (
          <tr key={r.price} className={r.now ? 'font-semibold text-white' : 'text-slate-300'} data-now={r.now ? '1' : undefined}>
            <td>{money(r.price)}{r.now ? ' (now)' : ''}</td>
            <td className="text-right tabular-nums">{Math.round(r.golfers).toLocaleString('en-US')}</td>
            <td className="text-right tabular-nums">{money(r.takings)}</td>
            <td className={`text-right tabular-nums ${r.now || !now ? 'text-slate-500' : deltaTone(r.takings - now.takings)}`}>{r.now || !now ? '·' : moneyDelta(r.takings - now.takings)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
