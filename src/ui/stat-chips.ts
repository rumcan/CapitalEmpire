// The top bar's stat chips (T233, #674; the concept's top bar, docs/art/CONCEPT-LOOK.md step 10): the money with its change a month, the
// reputation, the golfers a month and the course rating, worded from the engine's figures (golf/topstats.ts TopStats). Each chip is its icon,
// its figure and, under it, its words; the owner's T135 rule holds: below 2200 px the words go into the tooltip (StatChips.tsx WIDE_LINE), the
// figures stay. Pure TypeScript, no DOM.
import { courseRating, type TopStats } from '../game/golf/topstats';
import { monthIndexLabel } from '../game/golf/calendar';
import type { IconName } from './Icon';
import { balanceKind, trendKind, withIcon } from './status-icon';

/** a chip as drawn: its id, icon, figure (short: the figure narrower than 1600 px; and a muted unit after it, from 1600 px), its words (hidden
 *  below 2200 px; null: none), the line under the figure (sub: the money's change, from 1600 px; subAlways: shown at every width, the debt's
 *  warning) and its tone, and its tooltip */
export interface StatChipView {
  id: 'money' | 'rep' | 'golfers' | 'rating'; icon: IconName; value: string; short?: string; unit?: string; tone?: 'up' | 'down';
  label: string | null; sub?: string; subTone?: 'up' | 'down' | 'flat'; subAlways?: true; tip: string;
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
/** a money figure with a true minus when below zero: $842,350, −$5,000 */
export const plainMoney = (n: number) => (n < 0 ? '−' : '') + money(Math.abs(n));
/** a signed money figure: +$X, −$X (a true minus), or $0 */
export const signedMoney = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n));
/** money in a few characters (the top bar narrower than 1600 px): $9,500, $842k, $1.23M, $12.4M (a true minus before it) */
export function shortMoney(n: number): string {
  const a = Math.abs(n), s = n < 0 ? '−' : '';
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
  return s + money(a);
}

/** the span the money's change is over: so far this month, last month, or a month on average over the last n months */
export function changeWhen(s: Pick<TopStats, 'monthSpan' | 'month'>): string {
  if (s.monthSpan <= 0) return `So far this month (${monthIndexLabel(s.month)})`;
  if (s.monthSpan === 1) return `Last month (${monthIndexLabel(s.month)})`;
  return `A month on average over the last ${s.monthSpan} months (${monthIndexLabel(s.month)} to ${monthIndexLabel(s.month + s.monthSpan - 1)})`;
}

/** the golfers chip's tooltip: the rounds a month at today's tee sheet and (T214, P26 5.3) how many of them are members' and the club's members */
export function golfersTip(s: Pick<TopStats, 'golfers' | 'members' | 'memberRounds'>): string {
  if (!(s.golfers > 0)) return 'Golfers a month: none yet. Members and visitors play once the club has holes and a clubhouse';
  const n = (v: number) => v.toLocaleString('en-US');
  const club = s.members === undefined ? '' : `; ${n(s.memberRounds ?? 0)} of them members' (the club has ${n(s.members)} ${s.members === 1 ? 'member' : 'members'}, who play free on their dues)`;
  return `Golfers a month: ${n(s.golfers)} rounds, members and visitors, at today's tee sheet${club} (the Club chip)`;
}

/** the four chips, in the concept's order: money, reputation, golfers a month, course rating. Status is never colour alone (T180): the money
 *  in the red carries !, its change ▲ or ▼; debtLeft: the days left before bankruptcy while in the red (its line replaces the change) */
export function statChips(s: TopStats, debtLeft: number | null = null): StatChipView[] {
  const unlimited = !Number.isFinite(s.money);
  const ch = s.monthChange, change = ch === null ? '' : `${changeWhen(s)}: ${signedMoney(ch)}`;
  const moneyChip: StatChipView = {
    id: 'money', icon: 'bank', value: unlimited ? '∞' : withIcon(balanceKind(s.money), plainMoney(s.money)), ...(unlimited ? {} : { short: withIcon(balanceKind(s.money), shortMoney(s.money)) }),
    ...(s.money < 0 ? { tone: 'down' as const } : {}), label: null,
    ...(debtLeft !== null && !unlimited ? { sub: `bankrupt in ${debtLeft} ${debtLeft === 1 ? 'day' : 'days'}`, subTone: 'down' as const, subAlways: true as const }
      : ch === null ? {} : { sub: withIcon(trendKind(ch), `${signedMoney(ch)}/mo`), subTone: ch > 0 ? 'up' as const : ch < 0 ? 'down' as const : 'flat' as const }),
    tip: unlimited ? 'Money: unlimited (the dev sandbox). Click for the books' : `Money: ${plainMoney(s.money)}. ${change}${debtLeft !== null ? `. In the red: bankrupt in ${debtLeft} ${debtLeft === 1 ? 'day' : 'days'} unless the books recover` : ''}. Click for the books`,
  };
  const rating = s.quality === null ? null : courseRating(s.quality);
  return [
    moneyChip,
    { id: 'rep', icon: 'chart', value: `${Math.round(s.rep)}%`, label: 'Reputation', tip: `Reputation: ${Math.round(s.rep)} of 100. The tournaments, the pace of play and the course move it; golfers and members follow it` },
    { id: 'golfers', icon: 'people', value: s.golfers.toLocaleString('en-US'), label: 'Golfers/mo', tip: golfersTip(s) },
    { id: 'rating', icon: 'leaf', value: rating === null ? '—' : String(rating), ...(rating === null ? {} : { unit: '/5' }), label: 'Course rating', tip: rating === null ? 'Course rating: no holes yet' : `Course rating: ${rating} of 5, from the course's quality, ${Math.round(s.quality!)} of 100 (${s.holes} ${s.holes === 1 ? 'hole' : 'holes'}; the Season chip's Course stats)` },
  ];
}
