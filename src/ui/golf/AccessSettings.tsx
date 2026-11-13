// J4 (#1207, docs/JAM.md): the golf mode's money and access rows in Settings (App.tsx's gear menu, under the UI scale, which is the text size):
// the currency the money shows in (US dollars, or UAE dirhams at the fixed peg: display only) and colour-blind-safe money (a gain or a loss
// carries a sign and an arrow, not only green or red; on by default). Kept in this browser (./money).
import { AED_PER_USD, setMoneyPrefs, useMoneyPrefs, type Currency } from './money';
import { GLOSSARY, type TermId } from './Glossary';

export function AccessSettings() {
  const p = useMoneyPrefs();
  return (
    <>
      <div className="flex items-center gap-2 px-2 py-2 text-sm" role="group" aria-label="Currency" data-testid="settings-currency"
        data-tip={`Show money in US dollars or UAE dirhams (1 USD = ${AED_PER_USD} AED, the fixed peg). Display only: the game counts in dollars`}>
        <span className="flex-1">Currency</span>
        {(['USD', 'AED'] as Currency[]).map(c => <button key={c} className={`chip ${p.currency === c ? 'chip-on' : ''}`} aria-pressed={p.currency === c} data-currency={c} onClick={() => setMoneyPrefs({ currency: c })}>{c === 'USD' ? '$ USD' : 'AED د.إ'}</button>)}
      </div>
      <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" data-testid="settings-safe-money"
        data-tip="Gains and losses carry a + or − and an arrow (▲ ▼), not only green or red: easier to read with colour blindness">
        <input type="checkbox" checked={p.safe} onChange={e => setMoneyPrefs({ safe: e.target.checked })} />
        Colour-blind-safe money (+/− ▲▼)
      </label>
      {/* the glossary in one place (the cards underline these words where they are used: <Term>) */}
      <details className="px-2 py-1 text-sm" data-testid="settings-money-words">
        <summary className="cursor-pointer py-1">Money words explained</summary>
        <dl className="mt-1 space-y-1.5 text-[12px] leading-snug">
          {(Object.keys(GLOSSARY) as TermId[]).map(id => <div key={id}><dt className="font-semibold text-amber-200">{GLOSSARY[id].word}</dt><dd className="text-slate-300">{GLOSSARY[id].text}</dd></div>)}
        </dl>
      </details>
    </>
  );
}
