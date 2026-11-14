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
Every number here is behind the JAM flag (`features.ts`: `JAM ? jamValue : currentValue`); the normal game's balance is unchanged. After the
owner's MVP change the goal, the report card and the emergencies are hidden, so only what makes the loop fair from the $75k start is kept.

**How it was measured.** The jam build (`npm run build:jam`, `vite preview`) played by a scripted player in the page at 20x: the range and its
car park placed, every ball picked up (an upper bound for a diligent player), holes built by the New hole wizard's defaults ($18k to $37k a
hole, about $23k; $12k to $17k without frame trees and earthworks), the clubhouse $45k.

**What it found (lead/live 14c206b).**
- New hole and the clubhouse opened only at $20,000 of range takings in a season, or in season 2. A bare range takes $0 to $1,200 a month
  (seasonal), so even a player who picked up every ball waited 7 to 8 months, and a normal one half the two seasons.
- Green fees did not grow with the holes: one hole took about $660 a month, nine holes $880 to $1,540. A $23k hole earned about $110 a month
  while its interest at 10% cost about $190: building a hole never paid back, so borrowing to build never paid.

**What changed (kept).**
- `JAM_RAMP_TAKINGS = 2_000` (game: $20,000): New hole and the clubhouse open after about two months of range takings.
- `JAM_FEE_PER_HOLE = 2`: the everyday green fees are paid per playable hole (fees x 2 x holes): a grown-in hole earns about $1,300 a month and
  pays itself back in about 20 months, so a loan to build one pays and building early beats hoarding cash.
- Kept: `JAM_START_MONEY = 75_000`, the Bank's numbers.

**Runs after tuning** (one seed each; the hidden goal, 9 holes and $250k, for the record):
| Player | Choices | Holes | Net worth |
|---|---|---|---|
| Borrows early | $200k over 5 years at month 2, all nine holes by month 5 | 9 | $327k |
| Borrows, builds slower | $150k at month 2, six holes at once, the rest as cash allowed | 9 | $227k |
| Never borrows | the clubhouse at month 2, then bare holes as cash allowed (months 3, 11, 17, 21) | 4 | $129k |
| Idle | the range and its car park only | 0 | about $74k |

## J7: the Build menu, no pushing, the old range for sale (#1225, the owner 2026-11-13)
"make a better build menu with pictures and let the player decide. dont push them to build the practice green and chipping area"; "def add a
built in dirt parking lot"; "lets place the range for him. he has to buy it ... junk yard stuff ... stuff he has to clean up ... with distance to them".
- **Build** (rail, after Select; `src/ui/jam/BuildMenu.tsx`, data in `build-menu.ts`): picture cards in four tabs (Range, Course, Club, Practice), each
  with its price, upkeep a month and payback line (`golf/payback.ts`), greyed with the reason; a click starts the same placement as before. Paths & roads
  and Facilities left the rail; Range opens its card, Course its Holes panel.
- **No step list**: the range's guided build (step list, rings, rewards) is off in the jam; `Build ▸ Tips` (`src/ui/jam/tips.ts`) holds optional tips. The
  start tutorial ends on "Build what you like". Cart paths and the practice greens are open from the start; New hole and the clubhouse still open at
  `JAM_RAMP_TAKINGS`. The ramp's hints and the practice-area toast are gone; the welcome card is not shown.
- **The old range for sale**: a new jam game lays the range (with its free dirt car park) on the start's plot at the start's set-back, at the spot within
  reach of the home that leaves the most of the parcel free on one side. It draws no golfer until **Buy** ($15,000: Build or the range card). The Car park
  card then enlarges it (gravel, then paving). The guide's rewards are gone and the car park is free: the start is about $7.5k leaner than T459's runs.
- **Junk** (`golf/junk.ts` `RANGE_JUNK`, the library's scrapyard set): nine piles scattered (seeded) over the outfield, each with a distance pill; each pile
  left takes 1.6% off the range's appeal; Clear on the range card costs $250 and pays its scrap back. For Cinderlinks (J6): `Engine.rangeJunk()` /
  `RangeScene.junk` give each pile's library id, name, world spot and metres from the mats; the save holds `golf.range.junk` (range frame u, v).

## J8: a picture on every action (#1261, the owner 2026-11-14)
"add ALOT more images to the UI. especially on stuff you can do", then "a picture on every step of the tutorial and the guide". Seven sheets of 12 painted tiles in the Build menu tiles' style
(`art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-v3..v9.png`) are cut by `scripts/assets/prep-ui-tool-tiles.mjs` (`--version v3` to `v9`) into 144 px WebPs in
`src/assets/ui/tiles/` (84 more; `ACTION_TILES` in `src/ui/tool-tiles.ts`; provenance beside each sheet, crops in `art/ui-tool-tiles/sheet-vN.json`). The six sound tiles of v9 (`SOUND_TILES`: radio,
boombox, headphones, bell, radio-off, jukebox) are cut for J11 (#1270, the music radio); no action wears them yet.
- **One component**: `src/ui/ActionTile.tsx` draws a tile as a square thumbnail (`alt=""`, `aria-hidden`: the button's words name it; fixed width and height, lazy; px sizes scale
  with Settings' text size because the UI layer is zoomed). Small (28) on a chip, row (40) beside a row, big (56 to 64) on a card's main action. A button gets its picture inside it, so the
  whole of it is the click.
- **Which tile where** is data: the tables in `tool-tiles.ts` (`RANGE_UPGRADE_TILE`, `SESSION_TILE`, `PRACTICE_BUILD_TILE`, `PLACE_TILE`, `BRANCH_TILE` ...), a `tile` field on a tip
  (`ui/jam/tips.ts`), on a rail item (`rail-items.ts`), on a stat chip, and on every guide and tutorial step (`GuideStep.tile`: `RANGE_GUIDE`, `GUIDE`, `JAM_TOUR`, `TOWN_TOUR`; the guide card draws it
  at the left of the step's row, bigger on the open step). A new action or step takes a tile the same way; `tests/ui-action-tiles.test.ts` fails a tile id with no file, a step with no tile and a tile
  on no action.
- **Where**: the Range card and its ball room tree, the Build menu (a tile card shows it whole on the tile's navy, never cropped to the 92 px strip), the Bank, the hole card, the Holes panel
  and New hole's wizard, the rail (Select, Walk, Bulldoze; in the jam also Build, Range and Course) and the top bar (the Cash chip, Me, a picture beside the speed bar and the zoom buttons: the pause
  and zoom icons stay, they show a state and a direction; on a narrow screen at a big Text size some of these pictures are left out so the bar stays one row: see J13's top bar), the title card, the tutorial and the guide, the tips, the statement, Scene, Help's Keys, the bankrupt pop-up, Settings' rows.
- **Golf view** (a separate page): `packages/cinderlinks/build.mjs` copies the `drill-*`, `shot-*` and `club-*` tiles and `jump-to-ball`, `gimme` and `go-for-it` into `public/cinderlinks/tiles/` (the page cannot
  import them); the practice drills panel, the shot panel (Curve and Flight ends, Tour spin, Go for it), the club tabs, Jump to ball and Gimme show them, and the host's Back to the course button wears
  its tile. `npm run cinder:build` needs no dev server holding `public/cinderlinks` open (Windows refuses to delete it).

## J13: the ball room's and the props' tiles (#1277, and the tiles half of #1284; the owner 2026-11-14: "all this needs images ofcourse")
Four more sheets of 12 (`golf-build-tool-tiles-sheet-v10..v13.png`, provenance beside each, prompts from `F:/ClaudeTemp/jam/queue-ui-tiles-4.json` and `-5.json`) are cut by the same
script (`--version v10` to `v13`; crops in `art/ui-tool-tiles/sheet-v10..v13.json`) into 48 more 144 px WebPs: `src/assets/ui/tiles` now holds 156 (about 0.7 MB in all; the jam build inlines each, they are
under its 128 KB limit). v10 to v12 are `ACTION_TILES` (the ball room tree's upgrades, one tile each, plus the range till and the home); v13 is `PROP_TILES` (the Props menu's entries and the Texture Painter).
`tests/ui-action-tiles.test.ts` keeps a `NOT_YET` list of tiles cut but worn by nothing; each commit that places one takes it off.
- **The ball room tree** (`BallTree.tsx`): every upgrade in `rangesave.ts` has its tile by id (`RANGE_UPGRADE_TILE`): on its row of the tree (40 px), bigger (64 px) beside the name on the open card, on the Range
  card's upgrade rows and on the Build menu's cards. Supply wears `supplier` (the `bucket-price` stand-in is gone); the Range till line, on the card and in the tree, wears `range-till`; Your home wears `home-caravan`
  while it is the caravan (the cottage and the house have no picture yet). Four upgrades wear an existing tile until their own is painted: Putting stroke trainer (`putting-green`), Second tier of bays
  (`covered-bays`), Golf academy (`staff-training`), Car park building (`paved-car-park`). `tests/ui-action-tiles.test.ts` fails an upgrade with no tile that exists. The tree's columns scroll up and down only: at the
  largest Text size (125%) it is 800 px wide on a 1366 px screen, no sideways scrollbar (shots: `docs/jam-shots/j13-ball-tree*.jpg`).
- **The Props menu** (`flyout-menu.ts`, tiles by `PROP_GROUP_TILE` and `ROW_TILE.allProps` in `tool-tiles.ts`; tiles only, the natural / man-made restructure is #1284's other coder): in the golf Course flyout's Facilities >
  Decoration > Props, the Props row and All props wear `all-props`, Desert & oasis `desert-oasis`, New: Trees `trees-mixed`, New: Lake props `lake-props`; the Course furniture kind's rows, which showed the leaf, wear their
  own or their kind's tile (Tournament dressing the scoreboard stand and New: Course props `man-made-props`, both stand-ins). Still without a tile: the classic town's Decoration > Props rows (the town's menus stay lists,
  T233: New: Buildings and New: Eight-view objects have no tile painted) and the eight Tournament structures rows (the `buildings` icon). `natural-props`, `fences`, `signs`, `fountain`, `clear-plants`,
  `nursery-plants` and `texture-painter` are cut and wait (`NOT_YET` in the test) for #1284's restructure and #1282's Texture Painter rename.
- **The top bar** keeps one row by tiers (`topBarTier` in `uiScale.ts`, the screen's width over the Text size): every picture from 1150 px of the UI layer, without the speed bar's and zoom's below 1065 (1366 px at 125%),
  without the Cash chip's too below that (1280 px at 125%); narrower, the bar wraps to a second row as it always has. The month note starts under the bar (`--hud-top`), however many rows it has.

## J12: a living scene behind the title card (#1271, the owner 2026-11-14)
"animated town/golfcourse/farms etc behind the main menu like the factorio main menu ... very pretty and zoomed in, inspire the player to build a pretty golf course and customise his town".
- **The real game runs behind the card, on a prepared world; not recordings.** The engine boots behind the jam's card anyway, so a live scene costs no extra boot, stays sharp at any size and shows
  real golfers, cars, balls, range customers and farm animals; short videos would add 6 to 9 MB, look soft on a large screen and show nothing the game does. Where the scene must not run (reduced
  motion, a hidden tab, fewer than 4 GB or 3 cores, "save data", or a first seconds slower than 24 fps) the card shows one still picture of its first place over the game's own boot.
- **The world** is `src/assets/showcase/menu.cesave` (about 30 KB), made by the game's own flows and rebuilt by `node scripts/jam/menu-scene-build.mjs --base http://127.0.0.1:<port>/` against a dev
  server started with `VITE_JAM=1` (numbers in `scripts/jam/menu-scene-world.json`): map seed 11, the old range bought and cleared, the Build menu's range upgrades (grass outfield, target greens,
  paved car park, 12 bays, covered bays, dispenser), the clubhouse beside the range's drive, four holes through the New hole wizard (sod, frame trees; one with a dogleg), then 90 s at 20x so the county
  road has its houses, the snack shop and its traffic. The farms and the river are the map's own. Nothing in it is hidden in the jam (no tournament kit, no props, no bunkers or water painted by hand).
- **The stops** (`src/game/showcase.ts` SHOW_STOPS): the range, the way from the clubhouse down the first fairway, a green, the whole club from above, a farm, the county road with its houses and the
  bridge. Each is 14 to 17 s of slow glide at 25 to 30% zoom (the wide one 12%), then a cross-fade (the picture is copied over the game while the next place bakes); the next place's ground is asked for
  3.5 s ahead. A visit starts at a different place from the last (`localStorage fairwayfortune.scene`). The town clock is kept in the golf morning (07:00 to 13:00) so a day's groups are always out.
- **Never the player's world.** The scene loads the file in place of the save: nothing is read from or written to the player's slot (`saveBlocked` before anything could write), it takes no input, shows no
  toast, label, badge, tee marker, outline or money float (its overlay is `Engine.drawShowOverlay`: balls and dust only), its houses are drawn from the top building tier (a tidy street), its farms are
  in September. A choice on the card writes `#play=new|continue` (and the tab's session storage) and reloads: the page then boots exactly as the game always did and starts it.
- **Looking at it**: `scripts/jam/menu-scene-shots.mjs --base <url> --posters --docs` keeps the stills (`src/assets/showcase/<stop>.jpg`, the card's first picture) and the shots under
  `docs/jam-shots/j12-*.jpg`; `scripts/jam/menu-scene-measure.mjs --base <preview of dist-jam>` measures the time to the card with and without the scene and the frame time while it runs.
  Tests: `tests/showcase.test.ts`.

## Button tests: run them before every jam build (T459, the owner 2026-11-13: "are you guys not testing buttons?")
A dead button must not ship. Two checks:
- **`npm test`** includes `tests/jam-buttons.test.ts` (node, seconds): every tutorial step's Show me does something (`tour.ts tourShowOf`) and every
  control it pulses is drawn; every tip's Show me and every Build menu card reaches the engine (`ui/jam/acts.ts`, run against a stub game); every
  Build card that is not built has an act; every `<button>` in the jam's cards has an `onClick`; every `game.x` they call is a member of the engine.
  A new card, tip or step goes through `acts.ts` / `tourShowOf` so the test covers it.
- **`npm run jam:smoke`** (`scripts/jam/smoke.mjs`, after `npm run build:jam`): serves `dist-jam` on a free port, opens it in the installed Chrome
  (playwright-core, headless with WebGL), starts a fresh game and clicks every visible button in turn: the title card, who-are-you, the tutorial
  (each Show me and Next), the rail, the Build menu's tabs and cards, the tips and their Show me, buying the range, every Range card button, the
  Bank (a small loan, repay, save, take), a hole's card, Play this hole and Back to the course, Settings, the speeds. A click passes when the page
  or the game's state changes and no console error appears; a locked card or button is listed with its reason; a click that may change nothing
  (a tab already open, the currency already set) says why. It prints the table and exits 1 on a FAIL (about 4 minutes; `--headed` to watch,
  `--debug` prints the state of a click that changed nothing, `--stop-after tutorial` stops early).

Order before a jam build: `npm run typecheck`, `npm test`, `npm run build:jam`, `npm run jam:smoke`.

## Out of the jam build (J1 hides them when JAM)
Traffic tools but the car park and cart paths (bus, toll, junction tiers, road up/downgrades); town decoration; career milestones and
the city win; the natural disasters toggle (J3's emergencies replace it); the Studio, DEV badge, perf panels; Empty map; real places /
downloaded courses; the tournament event tool and night golf (unless the playtest clears them); portrait placeholders ("not yet available");
greenkeeping (already off). Unlimited dev money never applies in a JAM build.

## Future development (hidden in the MVP)
Hidden when JAM (T459, the owner: "simplify the ui and the game ... Call it the MVP"); the code stays and normal builds are unchanged. Each one
is a candidate for the GDD's roadmap.

**Money**
- Goal chip and report card: the two-season challenge (9 holes, $250k net worth, no overdraft) graded A to F.
- Money moments: one-line lessons that pop up the first time a loan, interest, a profit or an overdraft happens.
- Emergencies and insurance: a monthly 8% chance of a storm, a broken pump or a drought bill, and the plans that cover it.
- Murabaha ("Finance a purchase"): Islamic financing, a fixed markup agreed up front, compared side by side with a bank loan.
- Glossary: dotted underlines that explain money words on hover, and the "Money words explained" list in Settings.

**Range**
- Coffee kiosk and golf academy: extra takings from the range's golfers.
- Range upgrades: 24 bays, floodlights (night), the pro shop, the second tier of bays, the car park building.
- Props appeal and Your home: decoration that draws golfers, and the house that grows with the takings.
- Range › Build: painting the property freely, apart from the holes.

**Course**
- Shape by hand: painting greens, fairways, bunkers and water with brushes instead of New hole.
- Tee sets: blue, yellow and red tees placed and moved per hole.
- Land for sale: buying the blocks next to your land.
- Ground height: raising, lowering and smoothing the land.
- Facilities' Plants (trees and flower beds) and Props (course furniture and decoration); Facilities keeps Practice (the putting and chipping
  greens J6's practice mode uses).
- Halfway house, pro's office, teaching huts and house lots (the Buildings beyond the clubhouse).
- The hole card's top-down Play, Build, Save hole and Play a shared course.

**Club and golfer**
- Club card and Staff card: members and dues, green fee price, staff hiring and wages, the club's day.
- Your golf, your bag and your cards: the golfer's skills and handicap, the 14 clubs and upgrades, the card collection and vending machine.
- The golf view's ghosts, kits and shared courses: Save ghost, Ghost…, Own kit / Level kit, Share course.

**Seasons and events**
- The tour's invitation and the season-end tournament (the Club Championship), its result card and its card draft.
- The season card (the founding season's checklist) and the Season chip with the course stats.
- Watch golf, Skip to the rush hour, the tier and the reputation, golfers and course-rating chips.
- The town hints (roads, the event gate, junctions and transport).

**Map and settings**
- Traffic: roads, junctions, transport and the town car parks (the range keeps its own car park).
- Town decoration.
- Display options in Settings: the map grid, putt break lines, the ball's trace, stand-in labels, money floats, shadows, grass looks, sun patches,
  desert litter and yards, the world switch, the graphics grade and the night.
