// The top bar's stat chips (T233, #674; docs/art/CONCEPT-LOOK.md step 10, the concept's top bar): the money with its change a month,
// the reputation, the golfers a month and the course rating, from the game's own figures. The engine fills TopStats (Engine.topStats); the UI
// words them (ui/stat-chips.ts). Pure TS, no DOM.
import { OFF_SEASON_PLAY_DAYS } from './yearend';

/** the figures behind the chips: the treasury (Infinity: the dev sandbox's unlimited money) and its change a month (null: unlimited) over
 *  monthSpan whole months from month `month` (golfMonthIndex: 0 = the first September; monthSpan 0: so far this month, `month` itself); the
 *  reputation (0..100); the everyday golfers a month (golfersAMonth); the course's quality score (0..100, coursestats; null: no holes yet) and
 *  its holes */
export interface TopStats {
  money: number; monthChange: number | null; monthSpan: number; month: number;
  rep: number; golfers: number; quality: number | null; holes: number;
  /** T214: the club's members (golf/club.ts, rounded) and the members' rounds a month of the golfers (missing: no club yet) */
  members?: number; memberRounds?: number;
}

/** T208's everyday rounds a month at a play day's tee sheet of n golfers (members and visitors). A town day of play stands for feeScale billing
 *  days and a season of them for OFF_SEASON_PLAY_DAYS (golf/everyday.ts), whatever the town day's length: so a season's rounds are n x
 *  OFF_SEASON_PLAY_DAYS, and a month's a twelfth of that */
export function golfersAMonth(n: number): number { return Math.max(0, Math.round(n * OFF_SEASON_PLAY_DAYS / 12)); }

/** the course rating, 0 to 5 in half steps, from the course's quality score (0..100: the Course stats' conditioning quality, the course
 *  consultant's card included): 20 points a step */
export function courseRating(quality: number): number { return Math.round(Math.min(100, Math.max(0, quality)) / 10) / 2; }

/** the months the money chip averages over at most (MonthMoney keeps their starts) */
export const MONEY_MONTHS = 12;

/** the treasury's change a month, from the money seen as the golf months go by (noted every frame; not saved). A golf month is short against a
 *  town day (a 10-minute town day is five months), so the money comes in lumps: the green fees in the day's tee times, nothing at night, the
 *  books at the season's end. The change a month is therefore the average over the last few whole months (window: the engine passes about a
 *  town day's worth), from the money at their starts; a skip over several months counts them all. Until a whole month has been seen (a new
 *  game's first month counts as whole when it was seen from its start; a loaded game's first month does not) it is the change so far this month */
export class MonthMoney {
  /** the month being watched (-1: none yet) and the money when it was first seen; the money at the start of each month seen from its start,
   *  oldest first (at most MONEY_MONTHS + 1) */
  private m = -1; private first = 0;
  private starts: { month: number; money: number }[] = [];
  /** notes the money at month position mf (golf months: golfMonthIndex plus how far into the month the clock is); an earlier month (a load, a
   *  new game) starts again; unlimited money (not finite) is not watched */
  note(mf: number, money: number): void {
    if (!Number.isFinite(money) || !Number.isFinite(mf)) return;
    const m = Math.floor(mf);
    if (this.m < 0 || m < this.m) { this.m = m; this.first = money; this.starts = mf - m < 0.05 ? [{ month: m, money }] : []; return; }
    if (m === this.m) return;
    this.m = m; this.first = money; this.starts.push({ month: m, money });
    if (this.starts.length > MONEY_MONTHS + 1) this.starts.splice(0, this.starts.length - MONEY_MONTHS - 1);
  }
  /** the change a month at money now: the average over the last whole months, up to `window` of them (span: how many; month: the first of
   *  them), else (span 0) the change so far this month (month: this one) */
  change(money: number, window = 1): { value: number; span: number; month: number } {
    const S = this.starts, last = S[S.length - 1];
    if (S.length >= 2 && last) {
      // the oldest start within the window, else (a skip left none in it) the one before the last
      const w = Math.max(1, Math.min(MONEY_MONTHS, Math.floor(window))), before = S.slice(0, -1), from = before.find(x => x.month >= last.month - w) ?? before[before.length - 1]!;
      const span = last.month - from.month; return { value: Math.round((last.money - from.money) / span), span, month: from.month };
    }
    return { value: this.m < 0 || !Number.isFinite(money) ? 0 : Math.round(money - (last && last.month === this.m ? last.money : this.first)), span: 0, month: Math.max(0, this.m) };
  }
}
