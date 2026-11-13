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

## Out of the jam build (J1 hides them when JAM)
Traffic tools but the car park and cart paths (bus, toll, junction tiers, road up/downgrades); town decoration; career milestones and
the city win; the natural disasters toggle (J3's emergencies replace it); the Studio, DEV badge, perf panels; Empty map; real places /
downloaded courses; the tournament event tool and night golf (unless the playtest clears them); portrait placeholders ("not yet available");
greenkeeping (already off). Unlimited dev money never applies in a JAM build.
