# P24: The range business first (World of Golf), then the course

Status: **decided by the lead's standing rule** (2026-10-25; the owner pre-approves the lead's recommendations, section 3 lists them).
Issue #239 (T129). Written on `arena/T129-range-business` from main at `6ea3b0a` (after #238, people in game). T129 builds Phase 1.

The owner (2026-10-25): "make the driving range when the game starts. add the players Caravan and back yard and the crappy pro shop.
and lets have people come in and hit balls and you make money as you upgrade the driving range. add more facilities like a putting
green ... Have to have way to place some props ... pot plants and aesthetic foliage or fountains and statues or pillars ... Think
Vodacom's World of Golf. then you have to build the golf course." And: "the driving range should start clearly defined as a driving
range ... that means existing paths and tee boxes and distance markers etc."

## 0. The plan on one screen

- **Minute zero is a small, scruffy, unmistakable driving range**, laid by the game (the player paints nothing): a mown, striped range
  outfield over the whole plot, a tee box with four hitting mats, two target greens with flags, distance markers every 50 m down both
  sides, a chain-link boundary fence, cement cart paths from the car park past the pro shop to the tee line and along the back of the
  mats, and a "Driving Range" sign at the road. Beside it: the player's caravan in a fenced back yard (washing line, braai, chairs,
  cooler) and the crappy pro shop (the tin-and-tarp shack).
- **Golfers come and hit balls, all visible.** A car turns in off the county road, parks in a bay, the golfer walks the path to the
  shack, queues, buys a bucket, walks to a free mat, swings (the 3D golfers' drive) and hits balls that fly in arcs and lie on the range
  until closing; then walks back and drives off. Full bays make a queue at the shack; a long queue turns cars away ("drove on").
- **Money:** a price per bucket ($3 to $12), demand that reacts to it, the takings on the range card and the season card.
- **Upgrades on the range card** (click the range, or the top bar's Range chip): bays 4 → 8 → 12 → 24, target greens and yardage
  boards, covered bays, floodlights (open till 22:00), a ball dispenser, and the shack → a real pro shop. Each costs money, changes
  visitors, price or capacity, and changes the map at once. They are part of the save.
- **Then the teaching ramp** (plans only here): Phase 2 practice facilities the player builds with the course brush (a putting green,
  a chipping green and bunker), Phase 3 a Props tool (pot plants, foliage, fountains, statues, pillars), Phase 4 the unlock order from the
  range to the first hole, and World of Golf extras (a second tier, the academy, a kiosk, a ball picker, the caravan becoming a house).

## 1. Where main is today (verified at `6ea3b0a`)

- **The range is a site, not a scene.** `golf/range.ts:9-11` has the 70 x 150-tile plot, its 24-tile front and 12 bays; `rangeLayout`
  (`range.ts:62`) works out a hut, mats, car park, five targets, flags, boards and floodlights, but nothing draws it: the engine reads only
  its hut for the first camera (`engine.ts:1133`). The range is drawn as one placeholder picture (`business/art.ts:33`, "until T096").
  T096 (#165, the range's look) is still open: **P24 Phase 1 absorbs it.**
- **New game:** `Engine.newRangeGame` (`engine.ts:1119`) lays the county road, the gravel drive, the range business (its front) and the
  20 x 16 car park; the course brushes refuse the plot (`onRangePlot`, `engine.ts:1142`). Nothing keeps forest trees off the outfield.
- **Money today:** the range is a visit business in the worker (`business/catalogue.ts:88`: $60 a car x party 2, rate 80, hours 7-22,
  upkeep $2,000 a season). `City.planVisits` (`city.ts:1443`) plans its cars from the exits' pass-pop (`RANGE_PASS_POP`, 1,500 x tier
  factor) and the homes; `drainVisits` (`city.ts:1493`) books $120 per car that reaches the door, where the car vanishes. No golfer is
  ever seen. The season card shows the season's business takings as "Range takings" (`engine.ts:2550`, `ui/golf/SeasonReportCard.tsx`).
- **Time:** one game day is a season (1,440 sim s, `golf/calendar.ts`); the town day (HUD clock, night, rush hours) runs on its own
  `dayLen` (default 600 sim s = 10 real minutes at 1x, `sim/townclock.ts`), so a season is about 2.4 town days.
- **People:** the 3D golfers (`library.ts:1066-1072`: ten golfers with idle, walk and `golf_drive`) are drawn as movers at the street
  tier by `crowdMovers` (`engine.ts:4196`; the stand-in tee golfer is `crowdview.ts:123`). Cars are drawn from `traffic.ts facings()`.
- **Paths:** the course's cart paths are network classes with `noCars` (`network.ts:79-82`: walking path, dirt, cement slab, paved).
- **Art on hand:** the shack `golf:clubhouse-shanty`, the pro shop and the covered-bay building (`business:golf-pro-shop`,
  `business:golf-driving-range`, both four-view), the caravan `expansion:pop-up-caravan`, yard decor (washing line, kettle braai, lawn
  chairs, cooler), chain-link and picket fences, flagsticks `business:golf-pin-red`, benches, bins, street lamps. Missing: tee markers
  (`golf:tee-marker`, waiting for import), a floodlight, a distance board, a ball dispenser, a "Driving Range" sign, hitting-bay dividers,
  a gas bottle.

## 2. The design

### 2.1 The opening scene (range starts only, `golf.start === 'range'`)
The plot's own frame (u along the road 0..70, v away from it 0..150, the drive beside u = 70) turns with the range's facing, never
mirrored (`range.ts plotPoint`). Everything is derived from the save's range state (`golf.range`), so an upgrade re-lays it.
- **Ground** (one ground key `range:ground` of painted areas, in the course's own textures: the surface presets the course brush paints with): the
  outfield v 17..149 is fairway (the preset with its mowing stripes) inside a first-cut band; the tee box v 18..24 runs the width of the
  24 future bays (tee turf with a fringe edge); a concrete hitting deck runs under the open bays, each a dark rubber pad with a green mat;
  target greens (50 to 240 m) are green discs in first-cut collars; the shack's yard is packed dirt, the caravan's yard dry lawn.
- **Paths** (real cement-slab cart paths, network segs laid once with the range): the car park's edge → along the back of the mats the
  full width of the tee box, and a spur to the shack's counter. They are the course's paths: walkable, renamable, extendable later.
- **Props** (auto props `range:*`, re-made from the state, never saved): the shack (or the pro shop), the caravan and yard decor inside a
  picket fence, the chain-link boundary down both sides and across the far end, flags on the greens, distance markers every 25 tiles
  (50 m) on both sides, yardage boards at the greens (upgrade), floodlights (upgrade), covered-bay buildings over each four bays
  (upgrade), the ball dispenser (upgrade), a bench and bins at the tee, the sign at the drive. Forest and town trees keep off the plot.
- **Labels:** each stand-in kind carries its "Stand In for <name>" pill once; the distance numbers (50, 100, ... m) float over their
  markers at the street tier; at district zoom the plot carries a "Driving Range" map label (the ground alone already reads as a range).

### 2.2 The golfers (main thread, `golf/rangebiz.ts RangeSim`, pure and seeded)
- **Arrivals:** a Poisson stream on the town clock. Per town day (the 07:00-18:00 hours) the range draws
  `lambda = 0.0183 x pop x appeal x priceFactor`, `pop = RANGE_PASS_POP(tier) x exits + residents`, spread by an hour curve (a lunch bump,
  an after-work peak 16:00-19:00, the evening 19:00-22:00 with floodlights). Closed hours draw nobody; golfers still playing at closing
  finish their bucket.
- **The visit:** the car drives in off the county road along the drive into a free car-park bay (parked while its golfer plays); the
  golfer walks the path to the shack and queues (FIFO); the counter serves one at a time (shack 3 s, pro shop 2 s, dispenser 0.8 s) and
  only when a mat is free; the bay is held for one town hour from the sale (the walk to it and two or more swings, each ball an arc to a
  target green with scatter, landing and lying there until the range closes); then the golfer walks back and drives off. Walking and
  driving are brisk (a sim second is more than two town minutes).
- **Lost customers:** a car turns away when the line at the shop is at `4 + bays / 4`, or no car-park bay is free; a golfer who walks up
  to a line two past that turns back; a golfer waiting more than two town hours leaves. The card shows today's lost count; the queue is visible at the shack.
- **Cost:** at most about 60 golfers, 40 cars and 800 lying balls; the people are movers like the crowd, the balls one 2D path at the
  street tier, nothing at district zoom. The worker's own range visit cars are switched off in range starts (they would book the money
  twice and vanish at the door).
- **Skipping** (Skip to season end) books the skipped time's expected sales at once and clears the golfers.

### 2.3 Money (first balance)
- **Scale:** each golfer you see is 40 customers at the default 10-minute day (`RANGE_SCALE = 40 x dayLen / 600`), so a season's
  takings do not depend on the day length. A sale books `(price + extra spend) x scale` as business takings (the ledger's business line,
  so the season card and the books show it).
- **Price:** $3 to $12 in $1 steps, $6 to start. Demand `x (ref / price)^1.5`, clamped to 0.25..2.5; `ref` is $6, +$2 with covered bays,
  +$1 with the pro shop.
- **Upkeep:** the range's $2,000 a season stays (the worker's business upkeep); upgrades add none in Phase 1.

| Upgrade | Cost | Effect | Visible change |
| --- | --- | --- | --- |
| 8 bays / 12 bays / 24 bays | $8,000 / $14,000 / $40,000 | capacity 4 → 8 → 12 → 24; queue limit grows | more mats on the tee box |
| Target greens & yardage boards | $6,000 | appeal +25% | 2 → 5 greens, flags, boards at each |
| Covered bays | $18,000 | appeal +15%, ref price +$2 | a covered-bay building over each four bays |
| Floodlights | $24,000 | open till 22:00 (hours 11 → 15, the evening draw) | 8 floodlights, lit at night |
| Ball dispenser | $5,000 | serve 0.8 s (the queue clears: the shack's counter limits 8 bays and more), appeal +5% | a dispenser by the shop |
| Pro shop | $45,000 (the clubhouse's price) | +$2 spend a golfer (gear), appeal +15%, serve 2 s | the shack becomes the pro shop |

- **Start** (tier 1, 2 exits: pop 3,000): about 55 golfers a town day want 44 bay-hours; about 100 are served a season: **about $24,000
  gross, $22,000 net** (P22's year-1 target was $18,000).
- **Payback:** 8 bays about 1 season (+$7,700 a season); targets under 1 season once the bays have room; floodlights about 1.4 seasons;
  the pro shop about 1.8 seasons.
- **Fully grown** (all upgrades, $160,000 in all; 2,000 residents, $8 a bucket): about 250 golfers a town day, about **$240,000 a season**.
- **Against the course:** a seeded hole costs about $35,000 (GOLF-PLAN 4.1: a 14,000 m² fairway at $2, a green at $6/m², tee and
  rough). The bare range funds a hole every season and a half; the grown range five or six a season. The $600,000 start still builds the
  first nine; the range is the steady income of the founding seasons and the reason to come back to it.

### 2.4 Save and old saves
`golf.range` (`RangeBizSave`: v 1, bays, the upgrades owned, the price, the season's and the lifetime counts). A range-start save
without it loads as the starting range (4 bays, $6, nothing bought); its paths are laid on that first load. Golfers, cars and balls are
not saved. Old starts (`?start=town`) and classic games never see any of it.

## 3. Decisions taken (the owner can overrule)

| # | Question | Decision |
| --- | --- | --- |
| D1 | Where does the visitor model run? | On the main thread, pure TS (`golf/rangebiz.ts`), seeded; the worker only books the money. |
| D2 | The worker's range visit cars? | Off in range starts: they booked $120 a car that no one saw and vanished at the door. |
| D3 | Which clock? | The town day (the HUD clock, night): opening hours and floodlights mean something there. |
| D4 | How many customers is a golfer? | 40 at the default day, scaled by the day length; said on the card. |
| D5 | Range ground: course grid or ground patches? | Painted-area ground patches in the course's own presets; the course grid stays the player's (no hole counts, upkeep or stats from the range). Phase 2 lays practice greens in the grid. |
| D6 | Paths | Real cement-slab cart paths in the network, laid once by the game. |
| D7 | Tee boxes | A tee-turf strip with a fringe edge and rubber pads under the mats; T127's raised tee banks are course-grid only, so they wait for Phase 2. |
| D8 | Starting size | 4 open mats, 2 target greens (50 m, 100 m), no floodlights, no cover; the whole plot already mown and fenced. |
| D9 | Price band | $3-$12, $6 to start, elasticity 1.5. |
| D10 | Upkeep of upgrades | None in Phase 1 (one number less to balance); Phase 4 revisits. |
| D11 | Lost customers | A car turns away at a queue of 4 + bays/4 or a full car park; a golfer leaves after two town hours queued. |
| D12 | Missing art | Labelled stand-ins (the shack: the rusty lean-to shed, since the shanty has no four views and would be drawn as the grand clubhouse; floodlight: street lamp; yardage board and distance marker: chalkboard and post sign; dispenser: utility cabinet; sign: blank leaderboard); tee markers wait for `golf:tee-marker`. Requests in GOLF-SPRITES.md. |
| D13 | Rain and covered bays | No live weather on the town day yet: covered bays raise appeal and price; rain play comes with live weather. |
| D14 | Where the range card opens | Clicking the range (shop, mats, yard) with the select tool, and the top bar's Range chip. |
| D15 | Ball clearing | Balls lie until the range closes and are gone by morning; the picker cart is Phase 4. |
| D16 | The first minute | A new range game's town day starts at 06:30, so the first car turns in within the first minute. |
| D17 | Which way the four-view art faces | By the sheets' fronts (front in NE and NW: +y, -x, -y, +x), checked in game on the covered bays; `lots/preset-art.ts` documents +y, +x, -y, -x, which the lead may want to check for the lots. |

## 4. Phases and tickets

### Phase 1, T129 (#239): the opening scene and the range business (this branch)
- `golf/rangebiz.ts`: the save and its migration, the upgrades and their rules, the stats (capacity, appeal, price factor, hours,
  serve time), the demand, the scene layout (ground, paths, props, labels) and `RangeSim` (cars, golfers, queue, balls, takings).
- Engine glue: lay the paths with a new game (and on an old save's first load), re-lay the scene on every change, keep trees off the plot,
  step the sim each frame, draw its people and cars as movers and its balls and labels in the overlay, book sales, the season counts.
- Worker: no range visit cars in range starts. UI: `ui/golf/RangeCard.tsx`, the Range chip, the season card's range lines.
- Tests: the demand and price, the upgrades, the save round trip and migration, the scene (counts, turning with the facing, the plot),
  the sim (arrive, queue, play, leave, turn away, money).
- **Done when:** a new range game shows the scene at 30%, 15% and district zoom, golfers hit balls, a queue forms, upgrades change the map.

### Phase 2, T130: practice facilities (the teaching ramp)
- A practice area beside the range (the plot's free corner by the shop and the land next to it) where the player **paints** a putting
  green (green + fringe, at least 300 m²), then a chipping green with a practice bunker, with the course brush on the 1 m grid; the
  progressive-ui hint pill teaches the brush ("Paint a putting green: drag the Green brush here").
- Each adds appeal (+10% putting, +10% chipping) and a small fee ($2 a golfer who uses it; a share of the range's golfers walk over
  after their bucket). The range's tee box moves into the course grid so T127's tee banks raise it.

### Phase 3, T131: the Props tool
- One panel of decor: pot plants, ornamental shrubs and grasses, flower beds, fountains, statues, pillars, benches, bins, lamp posts,
  flag poles (T113's course props and the library's Trees & plants, Street furniture and Landmarks; new art requested where missing).
- Place, turn (one of four views, never mirrored), move, sell (half back); a price each; **appeal in a radius** (a plant +1% within 15
  tiles of the shop or the mats, a fountain +5%, capped at +40% in all) that raises visitors and what they pay.

### Phase 4, T132: the ramp to the course, World of Golf extras
- The unlock order through progressive-ui: the range card first; the practice area after the first upgrade; Props after the putting
  green; New hole (a par-3 first, the wizard's short preset) once the range takes $20,000 in a season or the second season starts.
- Extras: a second tier of bays (double-deck, +12 bays), the academy (lessons: a pro on two bays, +$15 a lesson), a coffee kiosk, a ball
  picker cart on the outfield at night, upkeep for the upgrades, the arrivals driven by the sim's own visit cars again, and the caravan →
  cottage → house as the player's money grows.

## 5. Risks
- **Two money paths** (the worker's visit cars and the range sim): the worker's are switched off only in range starts; a test holds it.
- **Main-thread cost:** the sim steps a few dozen agents; the balls draw only on screen at the street tier. Check `npm run bench` when
  the lead runs it nightly.
- **Network paths on an old save's first load** could cross something the player built; they are laid only where the plot is clear.
- **The look depends on the presets** the owner tunes in the studio (the fairway's stripes); a tuned preset changes the range with it,
  which is the point.
