# T386 (#1043): the range ball loop

The owner (2026-11-08), after *Find The Needle*: "we do need some progression and automation" (no conveyor belts). The loop: you start by hand, money buys
better tools, then staff, then machines, down a tree. Landing in parts, each playable on its own: **PR 1** the loop, hand picking and the tools (this file's
"Built"); **PR 2** staff and machines, the dirty/clean balls and the flow panel; **PR 3** the rest of the tree and the golf-side nodes.

## The loop (PR 1, built)
- **Balls are a pool.** `golf/rangeballs.ts` (pure, on a plain `BallSave` in `golf.range.balls`): clean balls in the ball room, balls in golfers' hands, your basket and
  hopper, and the balls lying on the outfield (x y pairs, up to `FIELD_CAP`). Every bucket sold takes `visitBalls(dayLen)` balls out of the ball room; every swing lands its
  share on the outfield and they **stay** until somebody picks them up (or overnight loss takes a few). A ball ball room with fewer than a bucket sends the drivers on (lost,
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

## Resuming
- Branch `arena/T386-range-ball-loop` (worktree `F:\Repos\ce-wt\t357`); progress comments on #1043 end with a "To resume:" line.
- Tests: `tests/golf-range-balls.test.ts` (the economy, the sim, the host), `tests/golf-range-pacing.test.ts` (the first hour; `PACING=1` prints the timeline), and the range
  tests that changed with the picker (`golf-range-extras`, `-parking`, `-ramp`, `golf-rangebiz`).
- In-game: `E:/ClaudeTemp/T386/` (shots and the scripts that took them).
- Next (PR 2): the range attendant (shifts, a wage in the monthly upkeep), the ball washer (dirty balls sell at a discount: `BallSave.dirty`), the dispenser (no counter staff),
  robot pickers (battery, speed), target nets (a share of the balls land in a chute), the bucket counter, the flow panel (outfield, picked, washed, dispensed; the bottleneck).
  Then (PR 3) the rest of the nodes to 25 to 40 and the golf-side ones (range practice raises skills faster: `golf/play/mods.ts`).
