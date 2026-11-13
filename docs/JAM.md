# Zoud GameLab FinLit jam build: "Fairway Fortune"

The owner registered CapitalEmpire for the Zoud GameLab financial-literacy jam (2026-11-13). The lead owns the submission.
**Deadline: 15 Nov 2026 23:59 AoE = Mon 16 Nov 13:59 SAST. Code freeze: Sun 15 Nov 18:00 SAST** (after that only fixes the lead asks for).
Jam rules that bind us: the video shows only the submitted build; nothing broken ships; disclose AI use; the build plays in a browser on itch.io
(at most 1,000 files, 500 MB unpacked, 200 MB a file, paths of 240 characters).

## The game we submit
You start with a plot, a little cash and a driving range. The range earns the money to build a golf course hole by hole, and you play
the holes you built (the Cinderlinks view). Every build is a money decision: pay cash, borrow from the bank (compound interest), take
Islamic financing (murabaha: a fixed markup agreed up front), or save first. Random emergencies (storms, a broken pump) hit, and an
emergency fund or insurance decides whether they hurt. Each month ends with a statement and your net worth. The challenge: grow the
range into a nine-hole golf club in two seasons without drowning in debt; a report card grades how you did it.
Jam rubric: FinLit integration 25, gameplay 25, commercial plan 20, educational impact 15, creativity 15; bonus 5 accessibility, 5 UAE/Arab region.

**Scope change (the owner, 2026-11-13 evening): "too much financial literacy. they said anything where the player manages money is
enough."** The jam build keeps the money the player manages through play: cash and prices, build costs with a one-line payback, the Bank
opened on demand (borrow with the total interest shown, repay, savings), one month-end toast that opens the statement, USD/AED. Hidden when
JAM (the code stays, normal builds unchanged): money moments, the goal chip and report card, emergencies and insurance, the murabaha
section, the glossary underlines. The GDD and the video follow this lighter scope.
**And the MVP (the owner, same evening): "simplify the ui and the game. you dont need to keep all the functionality in the game for this
part. Call it the MVP, we will add stuff we hav that isnt tested as part of future dev for the game design doc".** The jam build is the MVP
core loop only (range, holes, clubhouse, play a hole, the Bank on demand, the month-end toast); everything untested is hidden when JAM and
listed under "Future development (hidden in the MVP)" below, which becomes the GDD's roadmap.

## The jam flag
`src/game/features.ts`: `export const JAM = import.meta.env.VITE_JAM === '1'` (false in tests and normal builds). `npm run build:jam` builds
with VITE_JAM=1 into `dist-jam/`. Everything below that hides or changes behaviour for the jam checks `JAM`; the finance features are
the real game and are on in every build (golf mode).

## Time
Golf mode: one game day is one season (Sep to Aug, `golf/calendar.ts`), 1440 sim s; a month is 120 sim s (2 minutes at speed 1).
Money runs monthly: the month boundary is `seasonMonth(clock)` changing.

## Ticket ownership (no two coders edit the same files; shared files: small, additive edits only, merge lead/live often)
- **J1 cut + build** (`features.ts`, `rail-items.ts`, App.tsx menus/gear, `vite.config.ts`, `package.json` scripts, a new `src/ui/jam/TitleCard.tsx`).
- **J2 bank** (`src/game/golf/finance.ts` new, `src/ui/golf/BankPanel.tsx` new, engine wiring of the month tick and booking, save).
- **J3 risk + reports** (`src/game/golf/risk.ts`, `src/game/golf/reports.ts` new, `src/ui/golf/StatementCard.tsx`, `NetWorthChart.tsx`,
  `MoneyMoments.tsx`, `ReportCard.tsx` new).
- **J4 decisions + access** (payback and demand readouts in the range/build/clubhouse cards, `src/ui/golf/Glossary.tsx` new, currency
  setting, accessibility settings).

## The shared contract (J2 writes it first and pushes within its first hour; J3 and J4 code against it)
```ts
// src/game/golf/finance.ts: pure TS, no DOM
export type Line = 'range' | 'greenFees' | 'members' | 'events' | 'shop' | 'parking' | 'otherIn'
  | 'wages' | 'upkeep' | 'build' | 'stock' | 'otherOut'
  | 'loanInterest' | 'loanPrincipal' | 'savingsInterest' | 'overdraftInterest' | 'emergency' | 'insurance';
export interface Loan { id: number; kind: 'bank' | 'murabaha'; label: string; principal: number; balance: number; aprPct: number;
  markupPct: number; termMonths: number; payment: number; paidMonths: number; missed: number; startMonth: number }
export interface MonthReport { month: number; label: string; lines: Partial<Record<Line, number>>; cash: number; savings: number;
  debt: number; assets: number; netWorth: number; credit: number; events: string[] }
export interface FinanceSave { v: 1; month: number; savings: number; loans: Loan[]; credit: number;
  insurance: 'none' | 'basic' | 'full'; cur: Partial<Record<Line, number>>; history: MonthReport[]; moments: string[]; nextId: number }
export function newFinance(): FinanceSave;
export function book(f: FinanceSave, line: Line, amount: number): void;   // + money in, - money out, this month
// engine: game.finance (FinanceSave), game.bookLine(line, amount), game.onMonthEnd(cb) -> the MonthReport; cash stays the budget's treasury
```

## Numbers (balance pass after the playtest; keep them as named constants)
- Start: range start, `JAM_START_MONEY = 75_000` (J1), credit score 650.
- Bank loan: $5k to $250k (steps of $5k), terms 12, 24, 36, 60 months, APR = 7% + up to 12% by credit score (850: +0, 300: +12) +
  2% if debt payments exceed 40% of last month's income. Monthly compounding, amortised: payment = P r / (1 - (1 + r)^-n). Prepay any
  time, no penalty. A payment the cash cannot cover is still taken (the account goes negative) and costs 40 credit points.
- Murabaha (Islamic financing, for one named purchase of $5k or more): the bank buys it and sells it to you at cost plus a markup
  fixed at signing (4.5% a year of the term), in equal monthly instalments; the price never grows; settling early gets a rebate of half the
  unearned markup; a late instalment costs a flat $50 given to charity, never interest.
- Savings: 4% a year, credited monthly (4%/12 of the balance); deposit and withdraw any time.
- Overdraft: cash below 0 pays 2.5% a month (about 34% a year) on the shortfall. Bankrupt (golf mode) when the overdraft passes
  $50k or lasts 3 month ends in a row (replaces the old 5-days-in-the-red rule in golf mode).
- Credit score: 300 to 850; +5 a month all paid on time (to 850), -40 a missed payment, -10 a month in overdraft.
- Insurance: none; basic $150 a month (deductible $5k, covers 70% above it); full $400 a month (deductible $1k, covers 90%).
- Emergencies: 8% a month (seeded), one of: storm clean-up $3k-12k, irrigation pump $6k, mower breakdown $4k, drought water bill $2k-5k,
  flooded bunkers (a week's green fees lost); scaled by the number of holes (x1 at the range, up to x2 at 18 holes).
- The goal: by the end of season 2 (Aug 1986): 9 playable holes, net worth at least $250k, not in overdraft. Report card grade A to F.

## Balance (T459, 2026-11-13: measured on the built jam, then tuned)
Every number below is behind the JAM flag (`features.ts`: `JAM ? jamValue : currentValue`); the normal game's balance is unchanged.

**How it was measured.** The jam build (`npm run build:jam`, served with `vite preview`) played by a scripted player in the page at 20x: the
range placed, then its car park; balls picked up perfectly (the field's balls back in the ball room, an upper bound for a diligent player);
holes built by the New hole wizard's defaults (seeded, framed with trees, ground shaped: $18k to $37k a hole, about $23k on average); the
clubhouse $45k. Two seasons is 24 game months, about 3 to 5 minutes at 20x (a 20 to 40 minute session at 1x to 4x with the pauses to build).
Holes count at cost in net worth (no depreciation), so net worth is the start plus what the club earned: building never lowers it, interest,
upkeep, insurance and emergencies do.

**What the playtest found before tuning (lead/live 14c206b).**
- New hole and the clubhouse opened only at $20,000 of range takings in a season, or in season 2. A bare range takes $0 to $1,200 a month
  (seasonal), so even a player who picks up every ball waited 7 to 8 months; a normal one, until September 1985, half the two seasons.
- Green fees did not grow with the holes: one hole took about $660 a month, nine holes $880 to $1,540. A $23k hole earned about $110 a month
  while its interest at 10% cost $190: **borrowing to build never paid**, and the $250k goal was out of reach (the best scripted run: $103k).
- The report card gave an idle club (range only, nothing built, emergencies paid from cash) a **C**: 55 of its 100 points (no overdraft, no
  debt, no interest, emergencies weathered) came from doing nothing.
- At the end of season 1 the tour invites the club and its tournament's result opens a card draft (Express entry, First-aid posts,
  Roundabout: event and road unlocks the jam hides); the season's clock waits until a card is picked.

**What changed.**
- `JAM_RAMP_TAKINGS = 2_000` (game: $20,000): New hole and the clubhouse open after about two months of range takings.
- `JAM_FEE_PER_HOLE = 2`: the everyday green fees are paid per playable hole (fees x 2 x holes). A grown-in hole earns about $1,300 a month and
  pays itself back in about 20 months; a loan's interest on it is about $190 a month, so borrowing to build pays, and building late costs.
- `JAM_MANAGE_FLOOR = 0.3` (`reports.ts MANAGE_FLOOR`; game: 1, as before): the money-management points scale from 30% to 100% with the
  goal's progress (holes and net worth). The idle club is now an F; clean books with the goal met is an A.
- No card draft in the jam (`event/round.ts draftFor`): the tournament's result closes with Back to the valley.
- Kept: `JAM_START_MONEY = 75_000`, the goal (9 holes, $250k, no overdraft), the bank, savings, insurance and the 8% emergency rate (measured
  over 2,000 seeds: 8.0% a month, 1.9 emergencies in two seasons, 12% of games get 4 or more; no clustering). A $4k to $12k bill is felt:
  it is a month or two of green fees.

**Runs after tuning** (one seed each; emergencies are luck):
| Player | Choices | Holes | Net worth | Notes |
|---|---|---|---|---|
| Aggressive | $200k over 5 years at month 2, all nine holes by month 5, full insurance | 9 | $327k | 1 emergency ($9k, insured: $1.8k paid); interest $40k; goal met |
| Smart, slower | $150k over 5 years at month 2, six holes at once, the rest as cash allowed (months 12, 16, 20), no insurance | 9 | $227k | 4 emergencies, $28k all paid; just short |
| Cautious | no loan; the clubhouse at month 2, then bare holes (no frame trees, no earthworks: $12k to $17k) whenever the cash allowed | 4 | $129k | holes at months 3, 11, 17, 21; no emergencies; no debt; report card about D |
| Idle | range and car park only | 0 | about $74k | report card F (was C) |

So the goal is tense but winnable: it takes one well-sized loan taken early and the holes built while it lasts; a player who builds late or
leaves the club uninsured through bad luck falls just short, and one who never borrows cannot get there in two seasons.

## Out of the jam build (J1 hides them when JAM)
Traffic tools but the car park and cart paths (bus, toll, junction tiers, road up/downgrades); town decoration; career milestones and
the city win; the natural disasters toggle (J3's emergencies replace it); the Studio, DEV badge, perf panels; Empty map; real places /
downloaded courses; the tournament event tool and night golf (unless the playtest clears them); portrait placeholders ("not yet available");
greenkeeping (already off). Unlimited dev money never applies in a JAM build.
