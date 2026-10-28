# Golf play: the field, the round, the crowd that follows it, and the owner in the field

Written 2026-10-25 by the lead (Claude), branch `lead/golf-play` (worktree `.claude/worktrees/golf-play`). The owner: *"build playing golf
into the game. you should be able to play in the tournament yourself if you want to. simulate the players and crowds going around the
course. lets say tournaments are 1 day."* Until now the sim had no golf at all (a stand-in pro swung on each watched tee,
`crowdview.ts teeGolfer`; one imaginary featured group moved through the holes, `daytimeline.ts featuredHole`).

## Decisions (the lead's, pre-approved by the owner's standing rule; change them here if the owner says otherwise)
1. **One day, one round.** A tournament is the tournament day: one 18-hole stroke-play round (a 9-hole course is played twice). The
   tier's extra days (`tour.ts` TIERS days) collapse to one; the champion is the lowest score after 18, ties shared (no play-off in v1).
2. **The field** grows with the tier: 24, 36, 48, 60, 72 players (tiers 1-5), in threesomes; tier 1 is mostly local amateurs (20% pros),
   tier 5 all pros. A tournament is a men's or a women's event (60/40 by seed), so the field's looks come from the matching golfer art
   (`golf_pro_m*`, `golf_am_m*` / `_w*`). Names from a 1985 first and last name list. Skill: pros 0.6 to 1.0, amateurs 0.2 to 0.55.
3. **Tee times** run evenly from `FIRST_TEE` (07:30) to `LAST_TEE` (13:30), at least 8 minutes apart, the weakest groups first and the
   best last (the marquee groups play in the afternoon, when the crowd is biggest; GOLF-PLAN 5.5 "the crowd follows them").
4. **The whole day is played at the start** (deterministic from the course and a seed; each golfer and hole has its own random stream),
   then played back by the game clock: who is where, walking or addressing or swinging or putting, where each ball is, the scores so far.
   Only the owner's own shots are decided as the day goes (decision 7). Time: game minutes of the tournament day (1 sim s = 1 game minute).
5. **A shot** is decided from the lie, the distance to the pin, the hole's line and the golfer's skill: a club (driver from the tee only,
   3-wood, 4-, 6-, 8-iron, wedges, putter), an aim along the line or at the pin, a carry with a distance and direction spread that shrinks
   with skill, the lie's effect (rough, fescue, bunkers), a roll by the landing surface, water (a penalty stroke and a drop where the ball
   went in) and out of bounds (stroke and distance). On the green: a make chance by distance and skill, else a leave. Pros score about par,
   club amateurs 10 to 25 over. The numbers are in `src/game/golf/play/shot.ts` and are meant to be tuned.
6. **The crowd follows the play** (this is T051b, done with the real groups instead of `featuredHole`): the gallery spots on the holes
   where the best players are draw more (`gallerydraw.ts` spotDraw, with the marquee groups' holes in place of the featured hole), and
   every 30 game minutes a share of the fans walks from spot to spot (the sim's walking parties, stage 3).
7. **The owner can play.** Before the first tee time the tournament panel offers "Play in it": the owner's golfer (an amateur invite,
   skill 0.4, the owner's choice of look) joins the first group. When it is the owner's shot the game pauses and the camera goes to the
   ball; a shot panel offers the club (the suggested one first), the aim (a click on the course, the line by default) and the power (a
   slider, the club's full carry or the distance to the aim), then Hit. The same shot model plays it. "Let the caddie finish" auto-plays
   the rest. The owner's score is on the leaderboard like anyone's.
8. **What the player sees:** the golfers walking the course, swinging (the drive clip with the drawn club; putts as the clip's address and
   first frames until a putt clip exists), the ball in flight and rolling, a live leaderboard (position, name, to par, thru; the owner
   highlighted), and at the end the champion ("Name wins at -4") in the day's result. The tee stand-in golfer goes.

## Phases (each its own PR)
- **P1, the round (pure, tested):** `src/game/golf/play/` (below). No engine change.
- **P2, the day in the game:** the engine builds the `CourseView` from the course grid and the derived holes, plays the round at the
  tournament's start (seed from the save), plays it back each frame: the golfers as golfer sprites (crowdview-style movers), the balls on
  the 2D overlay, the leaderboard panel, the champion in the result. The tee stand-in goes. The day's seed (and later the owner's shots)
  go in the save.
- **P3, the crowd follows:** the spots' draw from the play (decision 6), the 30-minute moves in the sim (City), the galleries' fans walking.
- **P4, the owner plays:** decision 7.

## P1 contract (`src/game/golf/play/`, pure TS, no DOM; times in game minutes of the day, distances in tiles unless named `M` = metres)
```ts
type Pt = { x: number; y: number };                                   // tiles (TILE_M = 2 m)
type Lie = 'tee' | 'fairway' | 'rough' | 'fescue' | 'bunker' | 'green' | 'water' | 'out';
interface PlayHole { n: number; par: 3 | 4 | 5; tee: Pt; pin: Pt; line: Pt[] }          // line: tee, aim points, pin
interface CourseView { holes: PlayHole[]; lieAt(x: number, y: number): Lie }           // the 18 played in order (a 9 twice)
type Sex = 'm' | 'w';
interface Golfer { id: number; name: string; sex: Sex; pro: boolean; skill: number; look: number; owner?: boolean }
interface Group { tee: number; players: number[] }                                      // tee: game minute; golfer ids
type Club = 'driver' | 'wood3' | 'iron4' | 'iron6' | 'iron8' | 'pw' | 'sw' | 'putter';
interface Shot { golfer: number; hole: number; stroke: number; t: number; from: Pt; to: Pt; club: Club; lie: Lie; penalty: 0 | 1; holed: boolean }
interface RoundPlan { golfers: Golfer[]; groups: Group[]; shots: Shot[]; strokes: number[][]; done: number[] } // shots by t; strokes[golfer][hole]; done: minute each golfer finished
type Action = 'waiting' | 'walk' | 'address' | 'swing' | 'putt' | 'holed' | 'done';
interface GolferState { golfer: number; hole: number; x: number; y: number; action: Action; ball: Pt | null; flight: { from: Pt; to: Pt; u: number } | null; strokes: number; toPar: number; thru: number }
interface Standing { golfer: number; pos: number; toPar: number; thru: number; strokes: number }
```
- `field.ts`: `makeField(tier, seed): Golfer[]`, `teeTimes(golfers, seed): Group[]`, `GOLFER_NAMES` (1985 first names by sex, last names).
- `shot.ts`: `CLUBS` (carry metres for skill 1: driver 250, wood3 225, iron4 195, iron6 170, iron8 145, pw 120, sw 90; skill s carries
  `base * (0.75 + 0.25 s)`), `chooseShot(...)`, `hitShot(rng, ...)`, `putt(rng, skill, distM)`; `rng(seed, a, b)` (mulberry32 over a hash).
- `round.ts`: `playRound(view, golfers, groups, seed): RoundPlan`, `stateAt(plan, view, minute): GolferState[]`, `standings(plan, view,
  minute): Standing[]`.
The details (the dispersion, lies, roll, water, out of bounds, putting, the time model) are in the P1 brief and the code's comments.

## Status (2026-10-25, branch `lead/golf-play`)
P1 to P4 are built and checked: the pure modules by their tests (`tests/golf-play*.test.ts`, 50+), the game in the dev build on the
old nine (`?start=town`, "Skip to the tournament"): 24 golfers in 8 groups, the 9 played twice, the golfers walking, swinging and
putting, the balls flying, the leaderboard (bottom right), "Play in it" as a man, the pause at the owner's address with the shot
panel, aiming by a click (the power follows the aim), Hit, the camera to his ball, "Let the caddie finish", "You shot 78 (+6)",
the last group in at 16:55 and "Bruce Grant wins at −11 — Maple Falls Club Championship".
Changes after the first look: the field's skill now follows the tier (`PRO_SKILL`, `AM_SKILL` in field.ts: tier-1 pros are club pros;
tour-level pros went 8 to 11 under on the short old nine), and a click to aim sets the power so the ring is where the ball should land.
**Decision 1, recorded:** the played competition is one 18-hole round on the tournament day; the tier table's extra days
(`tour.ts` TIERS `days`, `practiceDays`) are left as they are, because setting them to 1 would put a whole multi-day crowd into the one
played day (50,000 fans at tier 5) and change the year-end money; say if the economy should be one day too.
**Resumes after a reload (T209 #554, 2026-10-27):** a save made while the golf round is in its surge or eval keeps the tournament day
(`SaveV5.tourney`, `src/game/event/daysave.ts`: the clocks, the surge's counts and departures to come, the crowd, the car parks, going home;
`City.daySave` / `City.resumeDay`), and the engine builds the round again with `dayRound` (owner.ts) from the seed and the owner's saved inputs:
the field, the leaderboard, the crowd and the owner at his ball come back where they were, and the sim waits at that moment until the play is
back (his shot reopens). The road's traffic is not saved: the party cars on the road at the save queue at their car park's entrance. The day
also saves itself each game hour. A save without a tournament day is unchanged, and one from before T209 loads as before (the surge as free).
`tests/golf-day-resume.test.ts`.
**The results wait for the last group (T210 #555, 2026-10-27):**
- The day's result is still worked out at the 15:00 kick-off (the eval: the arrivals, the tickets, the draft; the money and the town growth at "Back to the valley" are as before). Only the results screen waits.
- The leaderboard shows the live round and says "The results come when the last group is in". Its "Results now" button is today's early leave: the screen as it opened at kick-off ("Still on the course: X leads"), where "Back to the valley" ends the day and drops the play.
- When the last group on the course walks onto the 18th, a toast names it, and the board shows a "Last group on the 18th" banner with a Watch button (the camera goes to it).
- When every golfer is done, the champion is toasted and the results open: the champion, the final leaderboard (the owner's row too) and the takings.
- The pure end of the round is `src/game/golf/play/finish.ts`: `DayFinish` latches the moment and the end, each once and in order, even at 20x; `resultsDue` is the gate. A day with no holes (no play) opens the results at once, as before. A reload rebuilds the play and ends the same way.
- Tested in `tests/golf-play-finish.test.ts`.

**Pace of play (T211 #556, 2026-10-28):** the field plays in one time order (`round.ts` `Field`), each group waiting on the group that began
the hole before it, one look per strike:
- it tees off once that group's balls are past the landing area (`LANDING_M`, 300 m from the tee) or holed;
- it plays to the green once that group is off it (holed out, plus `GREEN_CLEAR` 0.2 min). The model's golfers decide "to the green" by
  their stroke worked out ahead (aimed at the pin, or finishing on the green: the outcome never depends on the minute, so the waits only move
  the minutes). The owner decides it by reach (`OWNER_REACH` 1.4 x his driver's carry, plus 15 m).

The owner's live group plays in the same order: the play stops at his strike, so the groups behind wait for him and play on as he does, and
he waits for the group ahead like anyone. A reload replays his inputs, so the waits come back the same.

The wave-through: when a group reaches a tee with the group ahead already on its tee two holes on, and the group behind it is held up on the
hole before, the slow group stands aside until that group has begun the hole, then waits on it. A group never waves back a group that went
through it, and a group waved through on a hole waves nobody there (otherwise the groups held behind a slow group wave each other on).

The plan keeps the pace (`plan.pace`: each group's arrival at each tee, the waits, the waits open at the owner's turn, the wave-throughs).
The leaderboard shows a waiting golfer's line ("waiting on the 7th tee", "waiting for the 7th green"), and the engine toasts each
wave-through. A group walks to the next tee with its group and waits there, standing behind the tee (`teeSpot`), spread by slot.

A model field barely waits: tee times are 16-51 min apart and the groups' paces are within about 0.7 h, so the tier days end as before. The
waits come from a slow group, most often the owner's. `tests/golf-play-pace.test.ts`.
**Everyday golf (T208 #553, 2026-10-28):** between tournaments the club's members and visitors play the course every town day
(`src/game/golf/everyday.ts`, `everydayview.ts`; the engine's `updateEveryday`; `tests/golf-everyday.test.ts`):
- **The tee sheet** (`dayRoster`, deterministic from the map's seed and the town day, from what the club was at the day's start: the quality score
  as the year end takes it, the reputation, the holes). Members: `MEMBER_PLAY` (35%) of the club's members (`clubMembers` = the monthly dues,
  `monthlyMembershipIncome`, over `MEMBER_DUES` $50; T214 prices memberships properly). Visitors: `dailyGolfers` +-15% a day (the reputation and
  the course; they drive in from the town). Twos, threes and fours, members and visitors apart; tee times 07:00 to 15:00, at least 8 minutes apart
  (a full sheet turns the last visitors away); club amateur skill (visitors 0.15-0.5, members 0.25-0.55), walking.
- **The day:** a group's car drives in from the club car park's entrance and parks 25-35 minutes before its tee time; its golfers walk to the
  clubhouse's door and check in (the green fee is paid there; members pay nothing on the day); they walk out to stand behind the first tee (a group
  that arrives while groups before it still have to tee off stands further back, one place each), play their round with the golf play model
  (`playRound`: T211's `Field`, so the everyday groups wait on each other exactly as a tournament field does), walk back to the car and drive off.
  A 9-hole course is a 9-hole everyday round (`dayCourse`): the tournament plays it twice, but its field orders groups per hole of the round, so two
  loops of everyday groups would share greens.
- **No everyday play on a tournament day:** the day is closed as soon as the round is not free (the fees paid stay).
- **The money:** a visitor's green fee ($22) is booked at check-in times `feeScale` (the billing days a town day stands for: `OFF_SEASON_PLAY_DAYS`
  x the town day / `SEASON_LEN`, 10 at the 10-minute town day), as business takings (so `Budget.earned` and the town growth count it), floating
  up at the clubhouse. `greenFeeIncome` stays the expectation (the clubhouse card shows it); the year end's green fees are what was played
  (`YearEndResult.greenFeesPlayed`), and the close book no longer books them a second time. Days a skip jumps over are booked whole.
- **The pace term:** the season's average wait on the group ahead per group moves the reputation at the season's end (`paceReputation`: +1 at 5
  minutes or less, down to -3 at 30 or more; `YearEndResult.paceRep`).
- **The clubhouse card** (the select tool on the clubhouse, or the top bar's Club chip): today's members and visitors (checked in of the tee
  sheet), the green fees taken, the golfers out, the cars parked, the next tee time, the waits now and so far; the season's rounds, fees against
  the expectation, and the pace term.
- **Cheap off the screen:** the round is played once per day (about 30 ms for 50 golfers); each frame, a group off the screen costs a look at its
  hole's box (from `plan.pace.arrive`), and only the groups on screen are played back (`PlayView.update(..., only)`).
- **The save** (`GolfSave.everyday`, `DaySave`): the day, its inputs, the check-ins paid and the season so far; a reload mid-day rebuilds the same
  roster and round and books on from where it was. A save from before T208 starts with the day under way, booking only the check-ins to come.
- Dev and bench: `?golfers=N` (a busy day of N visitors), `?seed=N` (the old start's map), `?everyday=0` (none drawn); `npm run bench -- --start
  town [--golfers N] [--seed N] [--everyday 0]`.
- Left: memberships sold by the pros (T214), the clubhouse's visit cars (City's generic visits: they still book $22 x party as before,
  on the season clock; T214 should make them the pro shop's and the bar's trade, or drop them), golfers walking the paths instead of straight lines.

**Caddies, carts and celebrations (T213 #558, 2026-10-28):** `src/game/golf/play/entourage.ts`, `carts.ts`, `celebrate.ts`, the playback's
`view.ts`; `tests/golf-play-entourage.test.ts`.
- **Who:** at tier 3 and up (`CADDIE_TIER`: the tour events; tier 1-2 pros are club pros) every pro has a caddie. At tier 1-2 (`CART_TIER`) the
  amateurs ride carts, two to a cart within a group (`pairCarts`; an odd one rides alone). Everyday: the visitors ride; a members' group walks half the
  time (`MEMBER_WALK`, drawn from its own stream of the day's seed, so the roster is otherwise unchanged). The owner always walks (his walk to his ball is
  the live playback's) and has no caddie. Set by `dayRound` (`fieldEntourage`) and `dayRoster` (`dayEntourage`) on the golfers (`Golfer.cart`,
  `Golfer.caddie`), so a reload rebuilds the same: nothing new is saved (T209, T208's save unchanged).
- **Pace:** a rider's move between shots takes `CART_PACE` (0.75) of the walk (`round.ts moveMin`), and an all-cart group drives to the next tee as
  fast. Every stroke's outcome is unchanged (each golfer's own random stream); only the minutes move, and T211's gates still decide the order: never two
  groups on a green (tested on cart fields and a busy everyday day).
- **The carts** (`CartPlay`, worked out from the round's shots: the round already timed its riders): a cart parks by the tee, beside the green (just
  off it), and beside each ball on the hole (a ball within `GREEN_NEAR` 15 tiles of the pin plays from the green's stop; stops within `MERGE_TILES` 20
  share a stop). A stop is on a cart path within `PATH_REACH` 25 tiles (the network's cart paths, not the walking path, and the course drives:
  `engine.ts cartPathsNow`), else at the rough's edge. The drives follow the paths (the shortest way over their nodes; not a detour longer than
  `DETOUR` 2.5 x the straight line + 60 tiles), else the rough's edge (a green, tee, bunker or water always driven around, a fairway kept beside, crossed
  when the edge is far). The golfers walk from the cart to the ball and back, and ride between (not drawn: the hire cart's art has nobody in it); a cart
  late from its last stop shortens its golfers' walk out. Everyday riders ride back to the clubhouse's door after the 18th and walk to their car. Lazy: a
  hole's stops when the cart reaches it, a drive's route only when it is near the screen (`PlayView.box`), so a cart off the screen costs a look at its
  hole.
- **Caddies:** walk beside their pro, stand behind him off the line of a full shot, stand just off the green (past his ball, from the pin) while he putts,
  and come to him once he has holed out; they follow at 1.6 x the walking pace. Stand-in art (GOLF-ART-LIST 176): the spectator `spec_m_polo_visor`,
  labelled "Stand In for caddie", with the bag trolley beside him.
- **Celebrations:** a hole-out at a birdie or better (`celebrations`): once the ball drops, the golfer holds a stand-in pose (the swing's high finish,
  turned to the camera, a little hop) for `CELEBRATE_S` 1.6 real s at the cup, and the gallery spots within `CHEER_TILES` 40 play the spectators' cheer
  clip (seated fans their seated clap). The fist pump and cap tip clips are GOLF-ART-LIST 177. Not replayed on a reload.
- **Art gaps:** the hire cart has 2 facings (SW, SE), the nearest drawn (GOLF-ART-LIST 173 asks for 8); the caddie (176); the celebration clips (177).
- **Cost:** a playback update with a 72-pro field and caddies 0.02 ms, a tier-2 field with carts 0.04 ms (the test's numbers); the bench (`--start town
  --golfers 150 --seed 7`, a busy everyday day with carts) moved 1.58 to 1.76 ms CPU a frame at 30% and 2.14 to 2.18 ms at 15%.

**Open (tickets since 2026-10-27: T212 #557 the putt and chip clips, and T214 #559 pros and memberships):** putts use the drive clip's address frames
(no putt clip in Meshy's library); the caddie, the eight-facing cart and the celebration clips are art requests (GOLF-ART-LIST 176, 173, 177).
