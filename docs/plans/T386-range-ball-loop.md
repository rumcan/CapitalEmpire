# T386 (#1043): the range ball loop

The owner (2026-11-08), after *Find The Needle*: "we do need some progression and automation" (no conveyor belts). The loop: you start by hand, money buys
better tools, then staff, then machines, down a tree. Landing in parts, each playable on its own: **PR 1** the loop, hand picking and the tools (this file's
"Built"); **PR 2** staff and machines, the dirty/clean balls and the flow panel; **PR 3** the rest of the tree and the golf-side nodes.

## The loop (PR 1, built)
- **Balls are a pool.** `golf/rangeballs.ts` (pure, on a plain `BallSave` in `golf.range.balls`): clean balls in the ball room, balls in golfers' hands, your basket and
  hopper, and the balls lying on the outfield (x y pairs, up to `FIELD_CAP`). Every bucket sold takes `visitBalls(dayLen)` balls out of the ball room; every swing lands its
  share on the outfield and they **stay** until somebody picks them up (or overnight loss takes a few). A ball room with fewer than a bucket sends the drivers on (lost,
  why `balls`): the bays sit empty. The pool never changes except by overnight loss, the supplier and `FIELD_CAP`.
- **The range's till.** `balls.till` = everything the range has taken, less what it has spent on its own gear. The ball loop's tools are bought with it *and* the treasury
  (a new game starts with $600,000: the treasury alone would buy the tree at minute 1). Orders from the supplier are the books' **Range balls** line.
- **By hand (Walk mode).** Hold **F** over balls: the nearest within your reach go into your basket at your rate (`HAND`, `TUBE`); or **click a pile**: you walk to it, pick ball
  to ball, take the full basket home at a run and empty it at the ball room (`RangeHost.order`, `orderStep`). Emptying happens within `DUMP_REACH` of the ball room's door.
- **Tools** (all `RANGE_UPGRADES` with a `branch`, paid from the till; `pickKit(owned)` reads them): ball tube, wire basket, push picker (a swath as you walk), the pull-behind
  picker (`picker`, the T133 cart: it tows behind your golf cart, E to drive; a hopper), the gang picker, night picking (`nightpick`, the wagon of T133 that drives the lanes
  after closing by itself), the supplier's account.
- **Old saves.** `normalizeRangeBiz`: a save without `balls` gets `legacyBalls(bays, takings)` (a stock of `LEGACY_BALLS_A_BAY` a bay, a till of its takings to
  `LEGACY_TILL_CAP`) and, if it owned the T133 cart, the tools the cart needs now plus night picking: the range runs as it did.
- **Draw.** The lying balls are one instanced draw of GL points (`RangeHost.fieldPoints` → `gl.drawPoints`, in the sprite upload), at most `BALL_DRAW_MAX` a frame, thinned
  past it; a soft shadow dot down and left (the sun is at the upper right). Bench: `--start range --fieldBalls N --fieldAb 1` (`bench.ts fieldStage`).

## The economy (named constants; the first hour)
| What | Constant | Value |
| --- | --- | --- |
| Balls in a bucket (day 600 s; scales with the day) | `BALLS_VISIT` | 40 |
| New game's ball room | `START_BALLS` | 200 (5 buckets) |
| Save from before T386 | `LEGACY_BALLS_A_BAY`, `LEGACY_TILL_CAP` | 900 a bay, till of its takings to $40,000 |
| Outfield holds | `FIELD_CAP` | 8,000 balls (past it a ball is lost) |
| Overnight loss | `DAY_LOSS_FIELD`, `DAY_LOSS_STOCK` | 2% of the outfield, 0.4% of the stock |
| Supplier | `CASE_BALLS`, `BALL_COST`, `CASES_A_DAY` | 120 balls, $8.50 a ball ($1,020 a case), 3 a day |
| Money a ball earns | (price + extras) x scale / bucket | $6 at the $6 bucket |
| By hand | `HAND` | reach 0.9 tile, 1.2 balls/s, basket 24 |
| Ball tube $1,500 | `TUBE` | reach 1.7, 3 balls/s |
| Wire basket $500 | `BASKET2` | basket 48 |
| Push picker $2,400 | `PUSH_SWATH`, `PUSH_BASKET` | 2.4 tiles swath, basket 96 |
| Pull-behind picker $8,000 | `CART_SWATH`, `CART_HOPPER` | 5 tiles, hopper 450 |
| Gang picker $20,000 | `GANG_SWATH`, `GANG_HOPPER` | 9 tiles, hopper 900 |
| Night picking $8,000 | `PICK_HOURS`, `PICK_SWATH` | the T133 lanes, 7 town hours, 3 tiles each side |
| Supplier's account $2,500 | | enables orders |

The scripted player of `tests/golf-range-pacing.test.ts` (it picks without a break, buys the next tool as soon as the till pays): tube at **2.3 min**, basket **10.2**, push picker
**14.4**, cart **33**, night picking **42** (the 10-minute town day, speed 1). The range's money arrives when the shop is open (a town day is 10 minutes, 4.6 of them open), so a tool is
bought at the first morning its price is covered. Hand picking alone brings in about 0.4 balls a second (about $150 a minute) against about 8 balls a second the four bays could sell.

## Staff and machines (PR 2, built)
Pure model `golf/rangeauto.ts` (balls a second at the reference 600-second day; `perHour` says them in balls a town hour), the sim side in `RangeSim.automate`, the card in `ui/golf/RangeCard.tsx`.
- **Dirty balls.** Every ball picked up (you, the cart, the night wagon, staff, robots, nets) is stowed **dirty** (`BallSave.dirty`). The tap washes `HAND_WASH` balls a second, a ball washer
  `WASHER_BPS` more (`wash`, `RangeSim.automate`). A bucket is sold clean balls first, then dirty ones; a bucket of dirty balls earns `DIRTY_VALUE` (75%) of a clean one's price
  (`takeMix`, `bucketValue`). Dirty balls sell too: the ball room is never "empty" while any are there.
- **Staff.** A range attendant works a shift (`SHIFT_HOURS` 8, starts at one of `SHIFT_STARTS` 07, 11 or 15: set it on the Range card), picks balls up on foot with your tools but not the
  cart (`attendantBps`: `ATTENDANT_SKILL` 0.8 of the trip model at `ATTENDANT_PACE` 1.5 tiles/s), the nearest piles to the ball room first. He also tends the shop counter for
  `COUNTER_SHARE` (40%) of his shift unless a dispenser stands (the dispenser: no attendant is needed at the counter). The second attendant takes the next eight hours. Wages are the
  upgrade's monthly upkeep ($90).
- **Machines.** Robot pickers: `ROBOTS_A_NODE` 2 per node (3 nodes: 6), each `ROBOT_BPS` 1.2 balls a second while it runs, on a battery of `ROBOT_HOURS` 3 town hours then `ROBOT_CHARGE` 1 hour
  charging (the bigger battery doubles the run, the faster motors are `ROBOT_SPEED` 1.6x). Target nets catch `NET_SHARE` 30% of the balls that land within reach of a target green: they
  roll to the ball room dirty, picked by nobody. The bucket counter scoops `BUCKET_CUT` 90% of a bucket.
- **Skips.** While you skip time the shop serves what the ball room, the staff's day average, the robots and the washer allow (`skipBalls`), the dirty balls earning their price.
- **Flow panel** (Range card, `flowOf`): outfield, dirty, clean, sold, with the balls an hour each stage can take (picking: you at the trip model's steady pace plus staff and robots;
  washing: the tap and the washer; dispensing: the bays' turnover) on the arrows. The stage that can take the fewest is the bottleneck (amber): by hand it is picking, with the cart it is
  the tap, with the washer it is the four bays.
- **Stand-ins** (the art is requested in `docs/GOLF-SPRITES.md`): the attendants are the spectators' young man in a cap walking between the ball room and the pile; the robots are small
  teal pucks; both have "Stand In for ..." pills.

| What | Price (till) | Upkeep a month | Needs | Effect |
| --- | --- | --- | --- | --- |
| Range attendant | $1,800 | $90 | push picker | a shift, picks on foot, tends the counter |
| Second attendant | $2,400 | $90 | attendant | the next eight hours |
| Ball washer | $6,000 | $90 | push picker | washes 14 balls a second beside the tap's 2.5 |
| Robot pickers | $9,000 | $120 | ball washer | 2 robots |
| Two more robots / a third pair | $9,000 / $11,000 | $120 | the pair before | 4 / 6 robots |
| Bigger robot batteries | $5,000 | $30 | robot pickers | 6 h of running to an hour's charge |
| Faster drive motors | $6,000 | $30 | robot pickers | 1.6x |
| Target nets | $7,000 | $50 | target greens | 30% of the balls that land by a target |
| Bucket counter | $3,500 | $30 | ball washer | a bucket is 90% of the balls |

Scripted-player timeline (`tests/golf-range-pacing.test.ts`, `PACING=1`, the 10-minute day, speed 1): tube **2.3 min**, basket **10.2**, push picker **14.4**, **first hire 21**, cart
**33.2**, **washer (the first machine) 41.7**, night picking **50.6**, robots **54.6**.

## The rest of the tree (PR 3, built)
The tree is **33 nodes in five branches** (Picking 7, Staff 5, Machines 10, Supply 5, Your game 6), all bought with the range's till; `tests/golf-range-tree.test.ts` checks the whole of it (25 to 40
nodes, every prerequisite listed before its node, every node buyable in order). Each staff and machine node's card says its **balls an hour** (`nodeRates`, from the host's view).

| Branch | Node | Price | Upkeep | Needs | Effect (constant) |
| --- | --- | --- | --- | --- | --- |
| Picking | Bigger hopper | $5,500 | $40 | pull-behind picker | the cart's and gang picker's hopper +60% (`HOPPER_BIG` 1.6: 720 and 1,440) |
| Staff | Pro shop training | $2,200 | $30 | attendant | attendants pick at `ATTENDANT_TRAINED` 1.0, not 0.8 (a quarter faster) |
| Staff | Night attendant | $3,000 | $90 | second attendant | a third shift: somebody picks round the clock |
| Staff | Staff golf cart | $12,000 | $60 | attendant, pull-behind picker | attendants tow the picker (`ATTENDANT_CART` 2 tiles/s) |
| Machines | Ball polisher | $4,500 | $40 | washer | a clean ball earns `POLISH_VALUE` 1.08 of its price |
| Machines | Fast chargers | $4,000 | $30 | robot pickers | a charge takes `ROBOT_CHARGE_FAST` 0.5 hour |
| Supply | Standing order | $3,000 | $20 | supplier | with the ball room under `STANDING_LOW` 2 buckets the supplier brings a case (till and the day's cases permitting) |
| Supply | Trade price | $6,000 | $20 | supplier | a ball costs `BULK_PRICE` 0.85 of $8.50 ($867 a case) |
| Supply | Pallet deliveries | $9,000 | $40 | trade price | `CASES_PALLET` 6 cases a day, not 3 |
| Supply | Stamped range balls | $1,500 | $10 | none | the overnight loss is `STAMP_KEEP` 0.5 |
| Your game | Swing video room | $6,000 | $40 | push picker | your buckets teach `VIDEO_GAIN` 1.15 |
| Your game | Fans and lemonade | $4,500 | $30 | video room | later buckets of the day teach `FANS_FATIGUE` 0.8 of the one before (not 0.7) |
| Your game | Weighted training clubs | $6,500 | $30 | video room | a bucket's power gain x `WEIGHTED_POWER` 1.5 |
| Your game | Launch monitor | $14,000 | $60 | video room | a bucket's driving and irons gains x `LMON_SWING` 1.25 |
| Your game | Doppler ball tracker | $20,000 | $60 | launch monitor | a bucket's accuracy gain x `RADAR_ACCURACY` 1.6 |
| Your game | Putting stroke trainer | $7,500 | $40 | video room | putting and chipping sessions x `PUTTLAB_GAIN` 1.25 |

The whole tree costs $212,800 (the first 17 nodes $103,600), the upkeep of all of it $1,665 a month. **The golf side** is `golf/rangegear.ts` (pure): `practiceGear(owned)` gives each
session kind a `PracticeGear` (a factor on all its gains, factors on single skills, the fatigue) which `player.ts practicePreview` and `practise` apply and the engine passes from `practiceCtx`; the
skills it raises are the T334 stats (power, accuracy, driving, irons; `golf/play/mods.ts` reads them), so a better-practised golfer plays better, and nothing changes without the nodes.

## Resuming
- Branches `arena/T386-range-ball-loop` (PR 1, #1085), `arena/T386-ball-loop-2` (PR 2, #1087), `arena/T386-ball-loop-3` (PR 3) (worktree `F:\Repos\ce-wt\t357`); progress comments on #1043 end with a "To resume:" line.
- Tests: `tests/golf-range-balls.test.ts` (the economy, the sim, the host), `tests/golf-range-pacing.test.ts` (the first hour; `PACING=1` prints the timeline), and the range
  tests that changed with the picker (`golf-range-extras`, `-parking`, `-ramp`, `golf-rangebiz`).
- In-game: `E:/ClaudeTemp/T386/` (shots and the scripts that took them).
- Next: art (docs/GOLF-SPRITES.md, "The range ball loop"), and balancing the tree's prices against play data.
