// The Bank (jam ticket J2; golf/finance.ts): cash, savings, debt and credit score; Borrow with the monthly payment, the rate and the TOTAL interest shown
// before you sign; Finance a purchase (a bank loan beside murabaha, side by side); your loans with early repay; savings. Plain words, short. Opened from
// the Treasury chip in golf mode (Game.toggleMoneyPanel). 360 px wide, scrolling up and down only (no sideways scrollbar).
import { useState } from 'react';
import type { Game } from '../../game/engine';
import {
  BANK_MAX, BANK_MIN, BANK_STEP, CREDIT_MAX, CREDIT_MIN, LATE_FEE, MURABAHA_MIN, OVERDRAFT_BUST, OVERDRAFT_MONTHLY, OVERDRAFT_MONTHS, SAVINGS_APR, TERMS,
  debtOf, monthlyDue, overdraftStreak, quoteBank, quoteMurabaha, savingsMonthly, settleCost, type Loan,
} from '../../game/golf/finance';
import { Icon } from '../Icon';

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const pct = (v: number) => `${v.toFixed(1)}%`;
/** a plain word for a credit score */
const creditWord = (c: number) => (c >= 800 ? 'Excellent' : c >= 740 ? 'Very good' : c >= 670 ? 'Good' : c >= 580 ? 'Fair' : 'Poor');
const termText = (t: number) => (t % 12 === 0 ? `${t / 12} yr` : `${t} mo`);

/** a small labelled figure */
function Fig({ label, value, tone, tip }: { label: string; value: string; tone?: string; tip?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1" title={tip}>
      <div className="text-[11px] uppercase text-slate-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
    </div>
  );
}
function Section({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <div className="text-[12px] uppercase text-slate-400">{title}{hint && <span className="ml-1 normal-case text-slate-500">{hint}</span>}</div>
      <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs">{children}</div>
    </div>
  );
}
function Terms({ term, setTerm, price }: { term: number; setTerm: (t: number) => void; price: (t: number) => string }) {
  return (
    <div className="grid grid-cols-4 gap-1">
      {TERMS.map(t => (
        <button key={t} className={`chip flex-col py-1 ${term === t ? 'chip-on' : ''}`} onClick={() => setTerm(t)} aria-pressed={term === t} data-testid={`bank-term-${t}`}>
          <span>{termText(t)}</span><span className="text-[11px] opacity-80">{price(t)}</span>
        </button>
      ))}
    </div>
  );
}

export function BankPanel({ game }: { game: Game }) {
  const f = game.finance, cash = game.traffic.budget.money;
  const [amount, setAmount] = useState(50_000);
  const [term, setTerm] = useState(24);
  const [buy, setBuy] = useState(20_000);
  const [buyTerm, setBuyTerm] = useState(24);
  const [what, setWhat] = useState('New holes');
  const [ask, setAsk] = useState<number | null>(null);
  const debt = debtOf(f), due = monthlyDue(f), streak = overdraftStreak(f) + (cash < 0 ? 1 : 0);
  const q = quoteBank(f, amount, term);
  const bq = quoteBank(f, buy, buyTerm), mq = quoteMurabaha(buy, buyTerm);
  const buyOk = bq.ok && mq.ok;
  const step = 5_000;
  return (
    <div className="pointer-events-auto absolute right-3 top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[360px] space-y-3 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-lg backdrop-blur" data-testid="bank-panel">
      <div className="win-head win-head-slate flex items-center justify-between">
        <div>
          <div className="font-semibold text-amber-200">Bank</div>
          <div className="text-[12px] text-slate-400">Loans, savings and your credit. Payments come out at each month end.</div>
        </div>
        <button className="btn-icon" onClick={() => { game.panel = null; game.emit(); }} title="Close" aria-label="Close the bank" data-testid="bank-close"><Icon name="close" size={18} /></button>
      </div>

      <div className="grid grid-cols-2 gap-1.5" data-testid="bank-summary">
        <Fig label="Cash" value={money(cash)} tone={cash < 0 ? 'text-red-300' : 'text-emerald-300'} tip="Your treasury" />
        <Fig label="Savings" value={money(f.savings)} tone="text-sky-300" tip={`Earns ${SAVINGS_APR}% a year, paid each month`} />
        <Fig label="You owe" value={money(debt)} tone={debt ? 'text-amber-300' : ''} tip={due ? `Payments of ${money(due)} a month` : 'No loans'} />
        <Fig label="Credit score" value={`${f.credit} · ${creditWord(f.credit)}`} tip={`${CREDIT_MIN} to ${CREDIT_MAX}. Pay on time and it climbs; miss a payment and it drops 40. A better score means a lower rate.`} />
      </div>
      {due > 0 && <p className="text-xs text-slate-300">Due each month end: <b className="tabular-nums">{money(due)}</b>. Keep that much cash, or the account goes negative and your score drops.</p>}
      {cash < 0 && (
        <p className="rounded-lg bg-red-500/15 px-2 py-1.5 text-xs text-red-200" data-testid="bank-overdraft">
          You are overdrawn by {money(-cash)}. The bank charges {(OVERDRAFT_MONTHLY * 100).toFixed(1)}% a month (about 34% a year) on it. Bankrupt past {money(OVERDRAFT_BUST)}, or after {OVERDRAFT_MONTHS} month ends in a row ({Math.min(streak, OVERDRAFT_MONTHS)} so far).
        </p>
      )}

      <Section title="Borrow" hint="from the bank, with interest on interest" testId="bank-borrow">
        <label className="flex items-center justify-between gap-2">
          <span>Amount</span>
          <b className="tabular-nums text-sm" data-testid="bank-amount">{money(amount)}</b>
        </label>
        <input type="range" className="w-full" min={BANK_MIN} max={BANK_MAX} step={BANK_STEP} value={amount} onChange={e => setAmount(Number(e.target.value))} aria-label="Loan amount" data-testid="bank-slider" />
        <Terms term={term} setTerm={setTerm} price={t => { const x = quoteBank(f, amount, t); return x.ok ? `${money(x.payment)}/mo` : '–'; }} />
        {q.ok ? (
          <div className="space-y-0.5 tabular-nums" data-testid="bank-quote">
            <div className="flex justify-between"><span>Monthly payment</span><b>{money(q.payment)}</b></div>
            <div className="flex justify-between"><span>Yearly rate (APR)</span><b>{pct(q.aprPct)}</b></div>
            <div className="flex justify-between text-amber-200"><span>Total interest you pay</span><b data-testid="bank-interest">{money(q.interest)}</b></div>
            <div className="flex justify-between"><span>Total you pay back</span><b>{money(q.total)}</b></div>
            <p className="pt-1 text-[11px] text-slate-400">
              {pct(q.creditAprPct)} is set by your credit score{q.dtiAprPct ? `, plus ${q.dtiAprPct}% because your loan payments would be over 40% of last month's income` : ''}. Interest is added every month on what you still owe. Repay early any time, no penalty.
            </p>
          </div>
        ) : <p className="text-red-300">{q.reason}</p>}
        <button className="chip chip-on w-full" disabled={!q.ok} onClick={() => game.bankBorrow(amount, term)} data-testid="bank-sign">Borrow {money(amount)} for {termText(term)}</button>
      </Section>

      <Section title="Finance a purchase" hint="bank loan or murabaha" testId="bank-finance">
        <div className="flex items-center gap-2">
          <input className="min-w-0 flex-1 rounded bg-black/30 px-2 py-1" value={what} maxLength={30} onChange={e => setWhat(e.target.value)} aria-label="What you are buying" placeholder="What are you buying?" />
          <input type="number" className="w-24 rounded bg-black/30 px-2 py-1 tabular-nums" min={MURABAHA_MIN} max={BANK_MAX} step={step} value={buy} onChange={e => setBuy(Math.max(0, Number(e.target.value) || 0))} aria-label="Price" data-testid="bank-buy" />
        </div>
        <Terms term={buyTerm} setTerm={setBuyTerm} price={t => { const x = quoteMurabaha(buy, t); return x.ok ? `${money(x.payment)}/mo` : '–'; }} />
        {buyOk ? (
          <div className="grid grid-cols-[auto_1fr_1fr] gap-x-2 gap-y-1 tabular-nums" data-testid="bank-compare">
            <span />
            <b className="text-center text-amber-200">Bank loan</b>
            <b className="text-center text-emerald-300">Murabaha</b>
            <span className="text-slate-400">Per month</span><span className="text-center">{money(bq.payment)}</span><span className="text-center">{money(mq.payment)}</span>
            <span className="text-slate-400">Total cost</span><span className="text-center">{money(bq.total)}</span><span className="text-center">{money(mq.total)}</span>
            <span className="text-slate-400">Extra over price</span><span className="text-center">{money(bq.interest)}</span><span className="text-center">{money(mq.markup)}</span>
            <span className="text-slate-400">Rate</span><span className="text-center">{pct(bq.aprPct)} APR</span><span className="text-center" title="A flat markup of 4.5% a year on the whole price, over the same months, works out to a higher yearly rate on what you still owe">{pct(mq.effectiveAprPct)} true APR</span>
            <span className="text-slate-400">Price changes?</span><span className="text-center">Grows with interest</span><span className="text-center">Fixed at signing</span>
            <span className="text-slate-400">Pay late</span><span className="text-center">Credit −40, overdraft {(OVERDRAFT_MONTHLY * 100).toFixed(1)}%/mo</span><span className="text-center">{money(LATE_FEE)} to charity, no interest</span>
            <span className="text-slate-400">Pay early</span><span className="text-center">No penalty</span><span className="text-center">Half the unpaid markup back</span>
          </div>
        ) : <p className="text-red-300">{bq.reason ?? mq.reason}</p>}
        <p className="text-[11px] text-slate-400">Murabaha: the bank buys it and sells it to you at cost plus a markup fixed now. The price never grows. It is a sale, not a loan with interest.</p>
        <div className="grid grid-cols-2 gap-1">
          <button className="chip" disabled={!bq.ok} onClick={() => game.bankBorrow(buy, buyTerm, what.trim() || 'Purchase')} data-testid="bank-sign-loan">Bank loan</button>
          <button className="chip chip-on" disabled={!mq.ok} onClick={() => game.bankMurabaha(buy, buyTerm, what.trim() || 'Purchase')} data-testid="bank-sign-murabaha">Murabaha</button>
        </div>
      </Section>

      <Section title="Your loans" testId="bank-loans">
        {f.loans.length === 0 && <p className="text-slate-400">No loans. Cash and savings are free of interest costs.</p>}
        {f.loans.map(l => <LoanRow key={l.id} l={l} cash={cash} game={game} ask={ask} setAsk={setAsk} />)}
      </Section>

      <Section title="Savings" hint={`${SAVINGS_APR}% a year, paid monthly`} testId="bank-savings">
        <div className="flex justify-between tabular-nums"><span>Saved</span><b>{money(f.savings)}</b></div>
        <div className="flex justify-between tabular-nums text-slate-400"><span>Next month's interest</span><span>+{money(savingsMonthly(f.savings))}</span></div>
        <div className="grid grid-cols-4 gap-1">
          <button className="chip" disabled={cash < step} onClick={() => game.bankDeposit(step)} data-testid="bank-dep">Save {money(step)}</button>
          <button className="chip" disabled={cash < 1} onClick={() => game.bankDeposit(Math.max(0, cash))}>Save all</button>
          <button className="chip" disabled={f.savings < 1} onClick={() => game.bankWithdraw(step)} data-testid="bank-wd">Take {money(step)}</button>
          <button className="chip" disabled={f.savings < 1} onClick={() => game.bankWithdraw(f.savings)}>Take all</button>
        </div>
        <p className="text-[11px] text-slate-400">Savings are a cushion for storms and repairs. They earn {SAVINGS_APR}%, but a loan costs more than that, so pay a loan off before you save when you can.</p>
      </Section>
    </div>
  );
}

function LoanRow({ l, cash, game, ask, setAsk }: { l: Loan; cash: number; game: Game; ask: number | null; setAsk: (id: number | null) => void }) {
  const left = Math.max(0, l.termMonths - l.paidMonths), cost = settleCost(l), bank = l.kind === 'bank';
  const part = Math.min(5_000, l.balance);
  return (
    <div className="space-y-1 rounded border border-white/10 bg-black/20 px-2 py-1.5" data-testid={`bank-loan-${l.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="truncate">{l.label}</b>
        <span className={`rounded px-1 text-[11px] ${bank ? 'bg-amber-500/20 text-amber-200' : 'bg-emerald-500/20 text-emerald-200'}`}>{bank ? `Bank · ${pct(l.aprPct)} APR` : `Murabaha · ${pct(l.markupPct)} markup`}</span>
      </div>
      <div className="flex justify-between tabular-nums"><span className="text-slate-400">{bank ? 'You owe' : 'Left to pay'}</span><b>{money(l.balance)}</b></div>
      <div className="flex justify-between tabular-nums"><span className="text-slate-400">{money(Math.min(l.payment, l.balance))} a month</span><span>{left} month{left === 1 ? '' : 's'} left{l.missed ? ` · ${l.missed} late` : ''}</span></div>
      {ask === l.id ? (
        <div className="flex items-center gap-1" data-testid="bank-confirm">
          <span className="flex-1">{bank ? 'Pay it all' : 'Settle now'} for <b>{money(cost)}</b>{!bank && cost < l.balance ? ` (saves ${money(l.balance - cost)})` : ''}?</span>
          <button className="chip chip-on" disabled={cash < cost} onClick={() => { game.bankRepay(l.id, cost); setAsk(null); }}>Yes</button>
          <button className="chip" onClick={() => setAsk(null)}>No</button>
        </div>
      ) : (
        <div className="flex gap-1">
          {bank && l.balance > part && <button className="chip flex-1" disabled={cash < part} onClick={() => game.bankRepay(l.id, part)}>Pay {money(part)}</button>}
          <button className="chip flex-1" disabled={cash < cost} onClick={() => setAsk(l.id)} data-testid={`bank-payoff-${l.id}`}>{bank ? `Pay off ${money(cost)}` : `Settle ${money(cost)}`}</button>
        </div>
      )}
    </div>
  );
}
