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
  a chipping green and bunker), Phase 3 a Props tool (pot plants, foliage, fountains, statues, pillars), Phase 4a the unlock order from the
  range to the first hole (built in T132), and Phase 4b the World of Golf extras (a second tier, the academy, a kiosk, a ball picker, the
  caravan becoming a house: built in T133).

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
- **Upkeep:** the range's $2,000 a season stays (the worker's business upkeep); upgrades add none in Phase 1. Phase 4a (T132) gives each
  upgrade a monthly upkeep (the table's last column), booked as upkeep in the ledger.

| Upgrade | Cost | Effect | Visible change | Upkeep (T132) |
| --- | --- | --- | --- | --- |
| 8 bays / 12 bays / 24 bays | $8,000 / $14,000 / $40,000 | capacity 4 → 8 → 12 → 24; queue limit grows | more mats on the tee box | $60 / $90 / $300 a month |
| Target greens & yardage boards | $6,000 | appeal +25% | 2 → 5 greens, flags, boards at each | $40 a month |
| Covered bays | $18,000 | appeal +15%, ref price +$2 | a covered-bay building over each four bays | $120 a month |
| Floodlights | $24,000 | open till 22:00 (hours 11 → 15, the evening draw) | 8 floodlights, lit at night | $250 a month |
| Ball dispenser | $5,000 | serve 0.8 s (the queue clears: the shack's counter limits 8 bays and more), appeal +5% | a dispenser by the shop | $30 a month |
| Pro shop | $45,000 (the clubhouse's price) | +$2 spend a golfer (gear), appeal +15%, serve 2 s | the shack becomes the pro shop | $400 a month |
| Coffee kiosk (T133) | $9,000 | 40% of golfers buy a $3 coffee after their bucket, appeal +3% | a kiosk on a patio by the shop, two patio tables, a line drawn | $80 a month |
| Ball picker cart (T133; needs 8 bays) | $7,000 | appeal +5% (a clean range every morning) | a cart parked by the outfield; after closing it drives twelve lanes and picks the balls | $60 a month |
| Second tier of bays (T133; needs 12 bays and covered bays) | $60,000 | +12 bays upstairs, appeal +10% | a second covered-bay storey over the roofs under the middle twelve slots, golfers on both decks | $450 a month |
| Golf academy (T133; needs the pro shop) | $30,000 | 15% of golfers take a $15 lesson on its two bays, appeal +5% | an academy sign on the tee, the pro beside the golfer at a lesson | $350 a month |

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
| D10 | Upkeep of upgrades | None in Phase 1 (one number less to balance); Phase 4 revisits (done: D34). |
| D11 | Lost customers | A car turns away at a queue of 4 + bays/4 or a full car park; a golfer leaves after two town hours queued. |
| D12 | Missing art | Labelled stand-ins (the shack: the rusty lean-to shed, since the shanty has no four views and would be drawn as the grand clubhouse; floodlight: street lamp; yardage board and distance marker: chalkboard and post sign; dispenser: utility cabinet; sign: blank leaderboard); tee markers wait for `golf:tee-marker`. Requests in GOLF-SPRITES.md. |
| D13 | Rain and covered bays | No live weather on the town day yet: covered bays raise appeal and price; rain play comes with live weather. |
| D14 | Where the range card opens | Clicking the range (shop, mats, yard) with the select tool, and the top bar's Range chip. |
| D15 | Ball clearing | Balls lie until the range closes and are gone by morning; the picker cart is Phase 4. |
| D16 | The first minute | A new range game's town day starts at 06:30, so the first car turns in within the first minute. |
| D17 | Which way the four-view art faces | By the sheets' fronts (front in NE and NW: +y, -x, -y, +x), checked in game on the covered bays; `lots/preset-art.ts` documents +y, +x, -y, -x, which the lead may want to check for the lots. |
| D18 | The Props tool's key | Z: the only letter free in play and in dev (I is the dev lot editor's toggle); Ctrl+Z stays undo. |
| D19 | Turning a single picture | R cycles the view; four-view art takes its turned picture, a single picture stays as it is (a toast says so): never mirrored. The `variation:...:n` ids are variants of a picture, not its views, so turning does not use them. |
| D20 | Where props count | Within 15 tiles of the shop or any open mat, each prop once; capped at +40% of appeal; the same factor on the fair price. Cheap plants reach the cap for about $2,000: Phase 4 may add upkeep or diminishing returns (done: D33). |
| D21 | The props' undo | The course tools' undo stack (`PaintTool.step`): one step per place, move, turn or sale; the money goes back with it. |
| D22 | Missing props art | Labelled stand-ins: golfer statue = the coin-operated horse ride, stone pillar = the plain stone obelisk (`world:grave_2`), flag pole = the red flagstick scaled up, flower bed = `world:bush_2`. Requests in GOLF-SPRITES.md "Props kit". |
| D23 | Where the practice area is (T130) | Across the drive from the car park (frame u 75..111, v 2..36): the plot's free corners by the shop are 6 to 8 tiles wide, too small for a putting green and a chipping green; this is the land next to the car park and the shop, owned from the start. |
| D24 | Practice cells and holes (T130) | Every cell laid in the practice area holds hole 0, whatever the brush's hole: the markers never place a pin there and no hole counts it. A New hole planned across the area loses those cells to practice. |
| D25 | Which green is which (T130) | The biggest green with no bunker within 6 m is the putting green; the biggest with 20 m² of bunker is the chipping green; with no bunker yet the second green is the chipping green waiting for its bunker. Fringe = the 2 m round the green (its automatic collar). |
| D26 | The practice appeal (T130) | A fraction in `RangeExtras` (`practiceAppeal`, from the save's open flags), multiplied in beside `propsAppeal`; unlike the props it leaves the fair price alone. |
| D27 | The brushes at stage 1 (T130) | A range start opens Shape by hand with Green and Bunker from stage 1, to paint the practice greens; the rest open with the stages as before. |
| D28 | The practice strokes (T130) | No putt or chip clip yet: a putt is the drive clip's address, takeaway and impact frames, a chip the whole drive clip, each labelled "Stand In for golfer putting/chipping clip"; requests in GOLF-SPRITES.md. |
| D29 | The tee box in the grid (T130) | Laid past the brush rules (the plot stays the range's: the player cannot paint or rub it out); its upkeep is the course's (tee turf), and the outfield's patches are cut round it so the grid's raised tee shows. |
| D30 | The ramp's steps (T132) | A range start's own step beside the stages (`GolfProgress.ramp`, 0..3, saved, never falls): 0 the range card; 1 the first range upgrade opens Holes (Shape by hand, Green and Bunker only) and Paths; 2 the putting green opens Props; 3 New hole and Buildings open once the season's takings reach $20,000, the second season starts or a hole exists. Bulldoze and Select are open from minute zero; the stages (Paint at the first hole, the town at stage 3) go on as before. |
| D31 | Old saves and other starts (T132) | A range save from before T132 has no ramp saved: step 3, every tool as it had them, no NEW badges. Town and classic golf starts have no ramp. "Show every tool now" opens every step. |
| D32 | The first hole (T132) | New hole's first use in a range start suggests a 150 m par-3 (`HoleWizard.suggestM`): after the tee the pointer only aims, the green sits 150 m out; "Any length" in the card drops it. Only the first hole. The range start is never "stuck" (the 20-minute fallback would open stage 2 and offer New hole while it is locked); the ramp's own hint offers the first hole. |
| D33 | Props' diminishing returns (T132) | By kind (plants, water, statues, stonework, seats, small things, signs): the best prop of a kind counts in full, each further one 80% of the one before. The big pieces gain: fountain +15%, statue +8%, well +3%, arch +2.5%, welcome board +3%, pillar and flag pole +1.5%, the map bench +1.5%, other seats +1%, small things +0.5%, plants +1%. |
| D34 | Upgrades' upkeep (T132) | A monthly cost each (the table in 2.3), paid as each game month begins (a skip pays every month crossed; the month a game is loaded in is not charged again), booked as upkeep in the ledger and counted in the range's season and lifetime `upkeep`. |
| D35 | The range's own looks (T132) | Two texture presets of its own in `paint-presets.json`: Range outfield (the fairway's mix, mowing stripes on: 6-tile bands across the line of play) and Range target green; each with its own painted look in `painted-surfaces.json` (the green brighter: tone +0.26, a pale lime tint). Until the studio bakes their pictures they borrow the fairway's and the green's (`PaintPreset.pic`), so no new picture ships. |
| D36 | Stripes on top (T132) | The outfield's stripes are laid last on its fill from the preset's Stripes (`PatchPaint.mw`, `renderer.mowStripes`): screened light bands, multiplied dark bands, soft edges, at every zoom; the T075 rule. Tuning the preset's stripes in the studio changes them. |
| D37 | Target greens (T132) | A first-cut collar (feathered), a fringe ring and the green itself raised with the course's sun-lit edge (`edgeProfileOf('green')`). |
| D38 | The range's map label (T132) | The stray glyph after "DRIVING RANGE" was the stadium label ("STADIUM · L1": the site falls back to the range) drawn under it at the same spot: only a real stadium draws it now. The range's own plate reads "DRIVING RANGE · 4 BAYS" on a dark plate below the shop's pill (the worker's "L1" meant nothing there); at district zoom the "Driving Range" map label stands alone. |
| D39 | The car park counter (T132) | The range car park's "P · parked/bays" adds the range sim's parked cars (the worker never sees them). A bug found on the way: a leaving car freed its bay on every frame of its drive out, so later cars piled into one bay; it frees it once now. |
| D40 | Selecting a prop (T132) | The Select panel names a Props tool prop by its catalogue name and group, with what it cost and sells for, and a "Sell for $X" button (not the library picture's name, e.g. "Main leaderboard (blank)"). |
| D41 | The second tier's look (T133) | No double-deck art yet: the covered-bay building drawn again a storey up over each lower roof (a lift in world px, footprint kept) reads as a two-storey hitting stand at 30% and 15%; labelled "Stand In for the double-deck hitting stand", the art requested. |
| D42 | The second tier's bays (T133) | Always 12, over the lower roofs under the middle twelve slots (three sections over 12 bays, four over 24), along each section's mats; it needs 12 bays and covered bays (so its roofs exist). The counter fills the decks in turn. |
| D43 | Getting upstairs (T133) | No stair art: a golfer's lift ramps over the last leg from the path to its bay (it climbs as it walks), its ball starts at the deck's height. |
| D44 | The academy (T133) | Two of the lower bays (the first open two) are lesson bays, not two more: golfers who want no lesson use them only when the rest are full, so the capacity stays and lessons add $15 x the scale; a lesson golfer finding them busy plays without one. The pro is a golfer of the set (no coach art), beside its pupil, now and then showing the swing. |
| D45 | The picker cart (T133) | Flavour plus +5% visitors (no running cost saved: the range has no ball cost to save). Its stand-in is the eight-way wagon (the golf cart art has two views only and nothing is mirrored), labelled at the street tier. |
| D46 | The range's own visit cars (T133) | Left as they are: the range sim already drives its own cars in off the county road, parks them and walks the golfers in. Driving the arrivals from the worker's traffic would need a hand-off per car (the worker's car reaches the drive, the main thread takes it over and the worker books nothing) through the worker protocol, the worker's range demand turned off to avoid paying twice, and the town's own roads to the range; the only gain is cars coming from the town instead of the county road's ends. Not worth the risk here. |
| D47 | The home (T133) | Automatic and free, by the range's lifetime takings ($100,000 the cottage, $400,000 the house), not bought: it shows the business growing and costs the player nothing to skip; the stage is worked out from the save's takings, so nothing new is saved. |
| D48 | The roofs' footprint (T133) | A scene piece can carry its own footprint (`foot`): the covered-bay roofs and the deck take their four bays' (behind the golfers), so the painter's order is right from every facing. |
| D49 | The car park caps the live golfers (T133) | The range's car park (44 bays on the test maps) holds a car for a golfer's whole visit (two or three town hours with the walks), so a live busy range with 36 bays turns cars away for want of parking while the skip (which counts bays, not parking) books more. Left for a later ticket: a car park upgrade, or the second tier adding bays to the car park. |
| D50 | The kiosk's numbers (T133) | 40% of golfers, $3 a coffee (first $4: it paid back in under a season on an 8-bay range, more than the bays). |

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

### Phase 2, T130 (#241): practice facilities, the teaching ramp (built)
- **The practice area** (`golf/practice.ts`): the owned land across the drive from the range's car park, frame u 75..111, v 2..36 (72 x 68 m,
  turned with the facing like the plot). Trees keep off it. Until something is painted there it carries a faint dashed outline, a "Practice
  area" label and "Paint a putting green here" (street tier; the label alone at district zoom); the outline pulses while its hint is up.
  Clicking it with Select opens the range card.
- **Painted with the course brush** on the 1 m grid. Cells laid there hold **no hole** (`RangeHost.practiceCells` zeroes them in the grid and
  in the brush's diff, so undo and redo keep it): no hole counts them, no pins or tee markers are placed, no hole stats. The course pill says
  "practice area (no hole)" there. They are ordinary course cells, so their build price and their upkeep follow GOLF-PLAN's surface costs.
- **What counts** (`scanPractice`, read again a few frames after the grid changes): the green blobs in the area, each with its fringe (the
  cells within 2 m); the **putting green** is the biggest green with no bunker beside it, open at 300 m² (green + fringe); the **chipping
  green** is the biggest green with at least 20 m² of bunker within 6 m of it, open at 200 m². States: none, too small ("Too small: 180 of
  300 m²"), no bunker ("Add a practice bunker beside it"), open. An open putting green gets three cup flags, the chipping green one.
- **Each pays:** appeal x1.1 each (`practiceAppeal`, a fraction in `RangeExtras` beside T131's `propsAppeal`; it does not raise the fair
  price) and $2 a golfer who uses it, times the scale, booked with the buckets as business takings (the range's season takings include it).
  After their bucket 35% of the golfers walk to the putting green and, of the rest, 30% to the chipping green (when open and a spot is free:
  six spots putting, up to five chipping, two of them in the bunker); each practises 0.45 of a town hour, then walks back to the car. Putts
  roll to a cup (they never lie), chips fly a low arc onto the green and lie until closing. A skip books the expected fees.
- **The hints** (progressive-ui `PRACTICE_HINTS`): in a range start, before the first hole, "Paint a putting green" and then "Now a chipping
  green and a bunker"; each has **Show me** (the camera on the area at 30% with the Green brush, or the Bunker brush once only the bunker is
  missing) and Got it. In a range start the Green and Bunker brushes (Shape by hand) are open from stage 1.
- **The tee box is the course grid's** (D7 done): the game lays it once as tee cells of no hole (`golf.range.tee`; an old save lays it on its
  first load), so T127's tee banks and the Height slider raise it. The outfield's painted patches leave it open (painted areas draw over the
  course); the concrete deck, the pads and mats stay painted areas on top, as in Phase 1.
- **The range card** lists both facilities: state, its words, +10%, the fee, today's and the season's golfers and takings, and Show area.
- **Save:** `golf.range.practice` (each facility: open, season and lifetime golfers and takings) and `golf.range.tee`; a save without them
  loads with none built. A new season zeroes the season counts (`rangeNewSeason`).

### Phase 3, T131 (#242): the Props tool (built)
- **The tool:** Props on the rail's Course group after Buildings (key Z; golf games only; open from stage 1 until Phase 4 sets the unlock
  order). `golf/decor.ts` is the catalogue and the rules (pure), `golf/propstool.ts` the engine's side (a small context, as `rangehost.ts`),
  `ui/course/PropsPanel.tsx` the panel.
- **The panel:** four groups of cards (picture, plain name, price, appeal; a "Stand In for ..." pill where the art is a stand-in):
  - Plants (+1% each): terracotta pot plant $120, potted palm $90, stone planter box $250, hydrangea shrub $60, ornamental grass $50,
    fern clump $50, clipped hedge $80, flower bed $150 (stand-in), ornamental maple $300.
  - Water: plaza fountain $12,000 (+5%, four views), wishing well $1,200 (+2%).
  - Stone: golfer statue $6,000 (+3%, stand-in), stone pillar $400 (+1%, stand-in), ivy garden arch $900 (+2%).
  - Furniture (+0.5% each unless said): park bench $300, course-map bench $600, picnic table $450, bag trolley $150, litter bin $80, lamp
    post $350 (lit at night), welcome board $2,500 (+1%, four views), flag pole $500 (+1%, stand-in).
- **Using it:** a card puts the item in hand; its ghost (the picture over its footprint, green or red, with the price or the reason) follows
  the cursor on a quarter-tile snap; R turns it (`preset-art.ts turned()`: four-view art takes its turned view; single pictures stay as they
  are, never mirrored); a click buys and places it. Placement is the player's land only (the golf parcels: the range plot, the practice
  area, the course), refused on roads, paths and car parks, water (the map's or a course pond), greens and bunkers, the range's tee box and
  mats and its target greens, and any building or prop. With nothing in hand a click selects a placed prop: drag moves it, R turns it,
  Delete or Sell sells it for half its price; Esc puts the item down, then the selection. Each place, move, turn and sale is one step of
  the course tools' undo (`PaintTool.step`; Ctrl+Z and Ctrl+Y work in the Props tool too). The Select tool, Delete and the bulldozer refund
  a Props tool prop at half its catalogue price.
- **Appeal:** each prop within 15 tiles of the shop or an open mat counts its appeal once; the sum is capped at +40% (`PROPS_APPEAL_CAP`).
  It is its own term in `rangeStats` (`RangeExtras.propsAppeal`, passed in the demand context): the appeal and the fair price are both
  multiplied by (1 + propsAppeal). The engine works it out twice a second (and at once after the tool's own changes). The range card shows
  "Appeal from props: +12% (of +40%)", and the Props panel the same in range starts.
- **Save:** the props are ordinary placed props; a Props tool prop's tuple carries 0 and its catalogue key after the scale
  (`decor.ts propTuple`, `tupleMarks`): the kind, the view (its picture id) and the spot come back on load. Old saves (five- and six-long
  tuples) load untouched; an unknown key loads as a plain prop. The tool works in any golf game; appeal only feeds a range start's range.
- **Art requests:** "Props kit" in `docs/GOLF-SPRITES.md` (golfer statue, stone pillar, club flag pole, flower bed, a small tiered
  fountain, a stone entrance arch, an urn).

### Phase 4a, T132 (#249): from the range to the first hole (built)
- **The unlock order** (`ext/progressive-ui`: `RampStep`, `rampStep`, `rampLock`, `RAMP_TOOL_STEP`, D30): in a range start the rail shows
  every tool from minute zero, the locked ones dimmed in place with their reason ("Unlocks with your first range upgrade", "... when your
  putting green opens", "... when the range takes $20,000 in a season, or in season 2"); a click or a key says it. In order:
  1. **Minute zero:** Select (the range card) and Bulldoze. The practice area's label says "Opens with your first range upgrade".
  2. **The first range upgrade:** Holes (Shape by hand with Green and Bunker, to paint the practice greens) and Paths, with NEW badges. In the
     Holes panel New hole stays in place, locked, with its reason.
  3. **The putting green opens:** Props (key Z).
  4. **$20,000 of takings in one season, or season 2:** New hole and Buildings. The first hole is suggested as a 150 m par-3 (D32).
  Each step opening is toasted. The step is saved and never falls (D30); old saves and other starts keep their tools (D31).
- **The hint bar** follows the ramp and never says "Step 1: Build your first hole" in a range start: "Your driving range is open" (minute
  zero; Show me: the camera on the shop and the card) → "Buy your first upgrade" (once the card was seen; Show me opens it) → "Paint a putting
  green" (Show me: the practice area with the Green brush) → "Props are open (Z)" (Show me: Props at the shop) → "Now a chipping green and a
  bunker" → "Next: your first hole" (the season's takings so far against $20,000) → "New hole is open: start with a par-3" (Show me: Holes with
  New hole armed, the par-3 suggested). After the first hole the stages' hints follow as everywhere.
- **Balance:** the props' diminishing returns by kind (D33), the upgrades' monthly upkeep (D34), on the range card (each upgrade's line, and
  "Upgrades' upkeep: $X a month · $Y this season").
- **The range stays a range** (D35-D37): its own outfield preset with mowing stripes laid on top at every zoom, target greens brighter, raised
  with a sun-lit edge in a fringe and a first-cut collar; checked at 30%, 15% and district zoom.
- **Fixes:** the label glyph (D38), the car park counter and the bay bug (D39), the Select panel's name for a decor prop (D40).
- **The first balance again** (`rangesave` rules, tier 1, 2 exits, no residents, $6 a bucket, a 10-minute town day; gross is buckets and
  practice fees; upkeep is the range's $2,000 plus the upgrades' months):

  | The range | Golfers a season | Gross | Upkeep | Net |
  | --- | --- | --- | --- | --- |
  | Bare (4 bays) | 95 | $22,800 | $2,000 | $20,800 |
  | 8 bays ($8,000) | 119 | $28,700 | $2,700 | $25,900 |
  | 8 bays, dispenser, targets ($19,000) | 149 | $35,700 | $3,600 | $32,100 |
  | ... and both practice greens | 171 | $48,500 | $3,600 | $44,900 |
  | ... and props +20% | 197 | $55,800 | $3,600 | $52,300 |
  | 12 bays with all that ($33,000 of upgrades) | 265 | $75,000 | $4,600 | $70,400 |
  | Fully grown (every upgrade, 2,000 residents, $8, props +40%) | 782 | $347,000 | $17,500 | $329,600 |

  - The bare range reaches $20,000 of takings about 88% into season 1 (8 bays bought early: about 70%), so New hole opens late in season 1 for
    a player who grows the range, at season 2 for one who does not.
  - The props' cap now takes a real mix: a fountain, a statue, a well, ten plants, an arch, two pillars, two benches, the welcome board, a flag
    pole and three bins and lamps (about $26,000) reach +40%; forty ornamental grasses ($2,000) give +5%, and the cheap pieces alone (a $12,000
    mix with no fountain or statue) stay under +30%.
  - The suggested first hole, a 150 m par-3, costs about $13,000 seeded on the test map (about $62,000 with Sod); a seeded par-4 about $17,000
    to $35,000. A range grown with the early upgrades and its practice greens nets $30,000 to $50,000 a season: a hole or two a season from the
    range alone by season 2 or 3, beside the $600,000 start.
- **Tests:** `tests/golf-range-ramp.test.ts` (the order step by step, steps never closing, old saves and other starts, the hint per step, the
  par-3, the diminishing returns, the upkeep, the looks' patches and stripes, the plate and the counter, the Select panel's words).

### Phase 4b, T133 (#252): World of Golf extras (built)
- **Four new range card upgrades** (`rangesave.ts RANGE_UPGRADES`, the table in 2.3), each with its cost, its monthly upkeep (T132's D34: paid as
  each game month begins), its effect, its place in the order (`needs`, now one upgrade or several: `needsOf`) and its change on the map
  (`rangebiz.ts rangeScene`). The card lists them under the old eight with "needs ..." beside the upkeep, a "Kiosk and academy" block (today,
  the season and its takings) and a "Your home" line; the header and the Hitting tile count the bays upstairs.
- **The second tier** (`tier2`, D41-D43): 12 bays upstairs over the middle twelve slots. The stand is the covered-bay building again, drawn
  `DECK_H` (190 world px) up the screen over each lower roof under those slots (`ScenePiece.lift`, `Prop.lift`, `Drawable.lift` in
  `sprites.ts`: drawn higher, the footprint kept for the painter's order, no shadow of its own), three sections over 12 bays and four over 24.
  The upper bays share themselves among the sections and stand along each section's own mats (`DECK_SPAN`); a golfer walks the path to the
  bay's foot and climbs (its lift ramps over the last leg), hits from the deck (the ball starts at its height) and climbs down. The counter
  fills the two decks in turn (`bayOrder`), so both have golfers. `rangeStats.bays` is the total, `lowerBays` the tee box's.
- **The academy** (`academy`, D44): the first two open bays are its lesson bays. A golfer arriving wants a lesson 15% of the time
  (`LESSON_SHARE`); at the counter it takes a free lesson bay and pays $15 x the scale with its bucket (`extras.academy`); the other golfers fill
  the rest first and a lesson bay last. The pro (golfer 3) waits on the tee in front of the lesson bays, walks to the pupil, stands beside it
  facing it and every other swing shows the swing down the range. An academy sign stands in on the tee (`poi:fishing-board`).
- **The coffee kiosk** (`kiosk`): a kiosk on a concrete patio by the shop (frame u 41..48, v 4..15: off the car park) with two patio tables;
  after its bucket 40% of the golfers (`KIOSK_SHARE`) walk to its line (at most `KIOSK_QMAX` 5, else they skip it), are served in 2.5 s, pay
  $3 x the scale (`extras.kiosk`) and go on to the practice area or the car. The line is drawn, facing the counter.
- **The ball picker cart** (`picker`, D45): parked by the outfield at the tee end by day; once the range is closed and empty it drives twelve
  lanes down and up the outfield and back home in seven town hours at any day length (`PICK_HOURS`), picking every lying ball within 3 tiles of
  its lane as it passes (`sweep`); opening time sends it home and picks the rest. Without it the balls go at closing as before (D15).
- **The range's own visit cars** (D46): left as they are. The range sim's own cars already drive in off the county road and park; the
  worker's visit cars stay off in range starts.
- **The home** (D47): the caravan, the cottage at $100,000 of the range's lifetime takings, the house at $400,000 (`homeStage`, `HOME_AT`):
  free, automatic, toasted once ("You moved into the cottage"), never on a load. The yard grows with it: the caravan's dry lawn and camp
  chairs; the cottage (`world:house_4`, a stand-in) on a mown lawn with a brick braai, a swing seat, a birdhouse and flower beds; the house
  (`gen:house-farmhouse-wrap`) in a wider yard (u 3..26) with a garage, a glasshouse, a fire pit, beds and planters. Each turns to face the road.
- **A fix on the way** (D48): the covered-bay roofs (and the deck) carry the footprint of their four bays behind the golfers
  (`ScenePiece.foot`, `addProp`'s `o.foot`) in place of the business art's 1 x 1 placeholder boxes, so the golfers in the bays and on the path
  behind draw in the right order from every side (they were drawn over the roofs' back walls when the range faces away).
- **Save:** the four ids in `golf.range.owned`, and `golf.range.extras` (the kiosk's and the academy's season and lifetime golfers and
  takings); a save from before T133 loads with zero counts, an extra without its prerequisites is dropped (as before), the home is worked out
  from the lifetime takings. The upper deck, the pro, the kiosk's line and the cart are never saved. A skip books the expected coffees
  (`KIOSK_SHARE` of the served) and lessons (`LESSON_SHARE` of the served, capped by the two bays an hour): `skippedVisits` returns them.
- **Balance** (the 4a rules: tier 1, 2 exits, no residents, $6, a 10-minute day, one season; gross = buckets, practice fees, coffees and
  lessons; upkeep = $2,000 + 12 months of the upgrades'; the first rows are 4a's, unchanged):

  | The range | Upgrades bought | Golfers a season | Gross | Upkeep | Net |
  | --- | --- | --- | --- | --- | --- |
  | 8 bays, dispenser, targets (4a) | $19,000 | 149 | $35,700 | $3,560 | $32,100 |
  | ... and the kiosk | $28,000 | 151 | $43,600 | $4,520 | $39,100 |
  | ... and the picker cart | $35,000 | 156 | $44,900 | $5,240 | $39,600 |
  | 12 bays, covered, dispenser, targets, kiosk, both greens, props +20% | $60,000 | 295 | $97,900 | $7,040 | $90,800 |
  | ... and the second tier | $120,000 | 508 | $168,300 | $12,440 | $155,900 |
  | ... or the pro shop | $105,000 | 295 | $121,500 | $11,840 | $109,700 |
  | ... the pro shop and the academy | $135,000 | 295 | $148,100 | $16,040 | $132,000 |
  | ... the pro shop, the academy and the second tier | $195,000 | 576 | $266,600 | $21,440 | $245,200 |
  | Fully grown (4a: the eight, 2,000 residents, $8, props +40%) | $160,000 | 782 | $347,100 | $17,480 | $329,600 |
  | Fully grown with the extras but no second tier | $206,000 | 782 | $423,700 | $23,360 | $400,400 |
  | Fully grown with every extra | $266,000 | 1,170 | $614,200 | $28,760 | $585,400 |

  - Payback: the kiosk about 1.3 seasons on an 8-bay range (sooner as it grows: it is 40% of every golfer); the academy about 1.3 seasons
    (its two bays cap it near 50 lessons a season, 65 under floodlights); the second tier under a season wherever the bays are full (it only
    pays once demand passes the lower bays: at 12 bays with the greens and props it does, on a bare 8-bay range it would not); the picker cart
    is the slow one (+5% of the visitors: about $1,300 a season on an 8-bay range, $20,000 on a grown one) and mostly flavour.
  - The home: a range that grows its upgrades reaches the cottage in season 2 or 3 and the house around season 4; the bare range gets the
    cottage in its fifth season.
  - Against the course: the grown range with the extras nets about $585,000 a season beside a $13,000 to $35,000 hole; the course should
    carry the later game's money (GOLF-PLAN), so the range's ceiling matters less than its first seasons, which the extras leave as they were.
- **Tests:** `tests/golf-range-extras.test.ts` (each extra's cost, upkeep and prerequisites; the stats; the save, its round trip and the old
  save's migration; the scene on every facing: the deck, the upper bays, the academy, the kiosk and the cart's lanes on the plot; the home's
  three stages and the host's move toast; golfers upstairs and drawn up there; coffees and their line; lessons and the pro beside the pupil;
  the cart picking the balls, and the old clearing without it; the skip's coffees and lessons).
- **Left:** the art (GOLF-SPRITES "The range business kit": the double-deck stand, the coffee kiosk, the academy sign, the picker cart, the
  cottage); a bigger car park for the grown range (D49); the putt and chip clips (D28), the studio bake of the two range presets' own pictures
  (D35), live weather for the covered bays (D13).

## 5. Risks
- **Two money paths** (the worker's visit cars and the range sim): the worker's are switched off only in range starts; a test holds it.
- **Main-thread cost:** the sim steps a few dozen agents; the balls draw only on screen at the street tier. Check `npm run bench` when
  the lead runs it nightly.
- **Network paths on an old save's first load** could cross something the player built; they are laid only where the plot is clear.
- **The look depends on the presets** the owner tunes in the studio (the fairway's stripes); a tuned preset changes the range with it,
  which is the point.
