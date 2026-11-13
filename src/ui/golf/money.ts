// J4 (#1207, docs/JAM.md): how the golf UI writes money. The currency it shows (US dollars, or UAE dirhams at the fixed peg: display only, the
// game counts in dollars) and colour-blind-safe money (on by default: a gain or a loss carries a + or a − and an arrow, never only green or red).
// Both are kept per browser (localStorage, every access in try/catch, as ui/uiScale.ts) and read by money() at each call; the settings' change
// listeners let React re-render (useMoneyPrefs). Pure but for the storage.
import { useSyncExternalStore } from 'react';

export type Currency = 'USD' | 'AED';
/** the UAE dirham's fixed peg: 1 US dollar is 3.6725 dirhams */
export const AED_PER_USD = 3.6725;
export const CURRENCY_KEY = 'capitalempire.currency', SAFE_MONEY_KEY = 'capitalempire.safeMoney';

export interface MoneyPrefs { currency: Currency; safe: boolean }
type Store = Pick<Storage, 'getItem'> | null | undefined;
const store = (s?: Store | Pick<Storage, 'setItem'>) => (s === undefined ? globalThis.localStorage : s);
/** the stored settings (USD and safe money on when there are none, they are bad, or storage throws) */
export function loadMoneyPrefs(s?: Store): MoneyPrefs {
  let currency: Currency = 'USD', safe = true;
  try { const st = store(s) as Pick<Storage, 'getItem'> | null; if (st?.getItem(CURRENCY_KEY) === 'AED') currency = 'AED'; if (st?.getItem(SAFE_MONEY_KEY) === '0') safe = false; } catch { /* storage may be unavailable */ }
  return { currency, safe };
}

let prefs: MoneyPrefs = loadMoneyPrefs();
const subs = new Set<() => void>();
/** the settings in force */
export const moneyPrefs = (): MoneyPrefs => prefs;
/** changes the settings (stored; listeners told) */
export function setMoneyPrefs(p: Partial<MoneyPrefs>, s?: Pick<Storage, 'setItem'> | null): MoneyPrefs {
  prefs = { currency: p.currency === 'AED' ? 'AED' : p.currency === 'USD' ? 'USD' : prefs.currency, safe: p.safe ?? prefs.safe };
  try { const st = store(s) as Pick<Storage, 'setItem'> | null; st?.setItem(CURRENCY_KEY, prefs.currency); st?.setItem(SAFE_MONEY_KEY, prefs.safe ? '1' : '0'); } catch { /* storage may be unavailable */ }
  for (const f of subs) f();
  return prefs;
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** the settings, re-rendering the component when they change */
export function useMoneyPrefs(): MoneyPrefs { return useSyncExternalStore(subscribe, moneyPrefs, moneyPrefs); }

/** a dollar amount in the shown currency's units */
export const inCurrency = (usd: number, c: Currency = prefs.currency): number => (c === 'AED' ? usd * AED_PER_USD : usd);
/** a whole amount with thousands commas (en-US, so every machine writes it alike) */
const whole = (n: number) => Math.round(Math.abs(n)).toLocaleString('en-US');
/** a dollar amount as the golf UI writes it: "$1,200" or "AED 4,407" (a loss: "-$300"); non-finite amounts read as 0 */
export function money(usd: number, c: Currency = prefs.currency): string {
  const v = inCurrency(Number.isFinite(usd) ? usd : 0, c), neg = Math.round(v) < 0 ? '−' : '';
  return c === 'AED' ? `${neg}AED ${whole(v)}` : `${neg}$${whole(v)}`;
}
/** a dollar amount with cents ("$7.23", "AED 26.55"): prices under a few dollars */
export function moneyCents(usd: number, c: Currency = prefs.currency): string {
  const v = inCurrency(Number.isFinite(usd) ? usd : 0, c), s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), neg = v < -0.005 ? '−' : '';
  return c === 'AED' ? `${neg}AED ${s}` : `${neg}$${s}`;
}
/** a change of money (a gain or a loss): with safe money on, "+$1,200 ▲" and "−$300 ▼" (zero: "$0"); off, the sign alone */
export function moneyDelta(usd: number, p: MoneyPrefs = prefs): string {
  const v = Number.isFinite(usd) ? usd : 0, r = Math.round(inCurrency(v, p.currency));
  if (r === 0) return money(0, p.currency);
  const body = money(Math.abs(v), p.currency);
  return r > 0 ? `+${body}${p.safe ? ' ▲' : ''}` : `−${body}${p.safe ? ' ▼' : ''}`;
}
/** the Tailwind text colour for a gain or a loss (the arrow and sign say it too when safe money is on) */
export const deltaTone = (usd: number): string => (!Number.isFinite(usd) || Math.abs(usd) < 0.5 ? 'text-slate-300' : usd > 0 ? 'text-emerald-300' : 'text-rose-300');
