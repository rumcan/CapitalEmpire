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

## Starting your own round (T350, #993)

The owner, 2026-11-08: "it tells me what I shot. The game cannot play for me?? ... there should be a start round button and we move the time to the tee time and the round starts and time now slows down to the pace of play." The cause (on the issue): the first-tee card's **Book** made a booked everyday round that the day's playback plays with your skills (`golf/player.ts Booking`, `Game.updateEveryday`), scored at the end (`youRoundDone`), whether or not you were on the course. Now (`golf/startround.ts`, pure; the engine's T350 section):
- **A booking is a tee time to play yourself.** The model plays it only when `Booking.auto` is set, which only **Let the game play it** does (the first-tee card, or the tee-time card). Playing by hand ends the booking (it used to stay and its simulated score arrived mid-round). A booking whose day is over lapses.
- **Start round** (first-tee card for a booking; the event card for today's club event, at the next free tee time on the sheet; the first-tee card for the tournament you joined) runs the clock to the tee time (20x far off, slower as it nears and 1x for the last eight minutes, by what the sim has really done: the clock shown runs ahead of the sim between its frames and steps back when the speed drops, so a fast arrival would show a time past the tee time and then an earlier one; `ffSpeed`; touching the speed or the pause cancels it), then begins your round and puts you at the first tee with the first shot open.
- **On the course the clock runs at the pace of play.** From the moment your own round exists (a booked round, an event, a money match, a practice round) until it ends, the clock is at the watching speed (`WATCH_SPEED`, watch reason `'round'`); the speed bar's faster speeds are off and `setSpeed` holds any faster request to it. A pause and the slower speeds go through. The speed before comes back when the round ends.
- **If the tee time passes while you are away** (the booking is due, no round under way) the game pauses the clock and asks once a day: **Play now** or **Let the game play it**; closing the card leaves the booking and the clock running.
- Not changed: the money match's **Skip to result** and the caddie's "finish the hole" are explicit choices already; the tournament's owner round keeps its own watching speed from two minutes before the tee time (`watchFor('own')`).
- Tests: `tests/golf-start-round.test.ts` (the rules, the profile's `auto`), `tests/ui-start-round.test.ts` (the cards); `scripts/dev/start-round-check.mjs` (the real game: Start round, the clock at the tee time, the first shot open, no score before the last putt).

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
- **Every walk walked (T294 #879, 2026-11-03):** the watchable pace's pacer (`play/pacer.ts`) no longer fades a golfer out and cuts him to his walk's end when the 1.4 tiles/s cap cannot make the walk in time (on the 10-minute day that was nearly every walk: the schedule walks a round at ~19 tiles a sim second, so golfers seemed to teleport, vanish and turn into their group-mates). He walks at the cap when that gets him there by his deadline, else just as fast as he must (the walk spread over all the time he has, the waits included); with no deadline never more than 3 tiles behind the schedule. A swing's or a putt's natural length gives way when he would miss his next address; a celebration is in place (no cut to the cup); a rider's walk to and from his cart has its deadline (`carts.ts walk.by`); the group's side-by-side spread is laid on the schedule's point. Fast walks remain where the schedule leaves little time (p50 14.5, p90 54 tiles a sim second while moving at 1x); `tests/golf-everyday-continuity.test.ts`.
- **Slow speeds for watching (T320 #908, 2026-11-04; the owner: "Slow speed for watching"):** the speed bar goes below 1x: 1/40, 1/16, 1/4, 1/2 (`golf/watch.ts SPEEDS`). Below 1x the sim worker steps once every 1/k frames (`StepClock`: the same DT steps as at 1x, so no drift; saves and replays unchanged), the cars lerp over the longer frame, and the golf pacers hold their caps in real seconds (`play/pacer.ts setPaceSpeed`; at 1x and faster T294 is unchanged). **The watching speed** `WATCH_SPEED` (one constant, 1/40x): on the 10-minute day the schedule's walk shows at 36 tiles a game minute x 1.5 x k, so 1/16x still shows walks at ~2.6 tiles/s (p50) and only ~1/40x puts them at the 1.4 cap (p50 1.35, p90 1.5; `tests/golf-watch-speed.test.ts`). "Watch golf" in the speed bar follows the group nearest the screen's middle, the board's Watch follows the last group; the camera stays on them, and Stop, Esc or a pan return to the speed before (a speed chosen while watching stands). **Your own live round** plays at the watching speed from 2 game minutes before your tee time to your last shot; after each of your shots the address's game minutes are skipped (the swing plays at once), and the camera holds on your ball through its flight and roll and 0.9 s more before your next shot opens. Fixed on the way: the ball left the club at the swing's first frame (now at the drive clip's impact, 1.22 s; a putt at its stroke's return), a pause could step the shown time back (the panel opened with you short of your ball, then a cut), and a skip overshot by up to 2 sim s.
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

**The 3-click swing (T316 #902, 2026-11-03):** the owner: *"you have the classic 3 click swing to start with, you know the half circle one. ... pick
his club on shots. get the distance for each shot. mis left and right based on how the second click lands on the click swing ... also add spamming a
keyboard button while doing the 3click swing to add power."* His shots are now swung on a half-circle meter in the shot panel (it replaces the power
slider and Hit); `src/game/golf/play/swing.ts`, `tests/golf-play-swing.test.ts`, captures by `scripts/dev/swing-shots.mjs`.
- **The clicks** (Enter, or a click: on the meter to start, anywhere during the swing): 1 starts the marker up the arc from the snap line; 2 sets the
  power where it is (100% at the gold mark, the club's full carry; the last sixth is the overswing: half of it as distance, and more spread) and the
  marker turns back at once; 3, on the way back, sets the accuracy against the snap line. The owner's "second click" for the miss is read as this
  accuracy click. Early (above the line) misses left, late right: inside the sweet spot straight; then a pull or push; from 5° a hook (runs on, roll
  x1.5) or a slice (carries 4% short); 90° a meter unit, at most 18° (a putt 30°, at most 8°, pulls and pushes only). No click 2: the marker turns
  at the arc's top (the most overswing); no click 3: the swing ends past the snap line (the worst late miss).
- **Space taps** during the swing (taps, not a held key): +1% power each, at most +6%; the boost narrows the sweet spot (up to 40%) and widens the
  spread (up to 30%).
- **Skill** (T241: the club's part of the game): the marker takes 0.7 s (skill 0) to 1.3 s (skill 1) to 100%, and the sweet spot is 0.025 to 0.07
  meter units either side.
- **The shot:** the aim is turned by the miss; the carry may pass the club's full carry; a meter shot keeps half of the model's random direction
  spread (the meter's miss takes the rest); the lie's effects, mishits, roll, water and out of bounds as before. **Putts** use the same meter on a
  putting scale: 100% is the putt's length to the hole.
- **The panel:** the clubs his lie allows (the suggested one ringed; Q / E or the wheel cycle them), the club's full carry, the distance to the pin and
  to the aim, the aim's mark on the arc (where to stop the power for the aimed distance); after the shot a toast and the "Last shot" line: the club,
  the miss, the carry and the total.
- **The save:** `OwnerInput.swing` keeps the meter's outcome (power, accuracy, boost), never the click times; the replay plays it through the same
  model. An input without it (a save from before T316) plays as before.
- Left for T317-T319: the spin (a field next to `swing`), the cart and first tee, the break grid, tracers and holing.

**The play pass, part 1 (T334 #960, 2026-11-08; the owner, 2026-11-04: "We want wind and diffrent flights based on fairway and rough"):** the wind, the lie that
changes the flight, the slope under the ball, and the playtest's fixes. `play/wind.ts`, `play/lies.ts`, `play/conditions.ts`; `tests/golf-play-conditions.test.ts`,
`tests/golf-play-putting-v2.test.ts`; the playtest's tools `scripts/dev/play-pass-playtest.mjs`, `play-pass-sim.ts`, `play-pass-shots.mjs`, `tests/helpers/swing-bot.ts`.
- **The shape of it: one optional record per shot.** `ShotEnv { wind?: { mph, from }, lie?: LieKind, slope?: { up, across } }` (conditions.ts) is read when the shot is struck
  (`Game.shotEnv`: the wind with its gusts at that instant, the lie's kind under the ball from the course, the height field under the stance along the aim) and saved with the
  owner's input (`OwnerInput.env`; `readEnv` clamps it). `hitShot` takes it as `HitMod.env`. **No `env`: the model is exactly what it was** (the same draws, the same floats:
  a golden test over `hitShot` x70, `shotOutcome`, a 3810-shot field round and an 18-hole live group, captured from the unchanged code). The wind and the slope take no draws;
  a flier takes one, only from a lie that can give it. A saved input with `env` replays exactly, whatever the wind and the terrain do afterwards.
- **The wind** (wind.ts). `dailyWind(seed, day)`: a mean speed (2 to 15 mph, a blustery day to 27, about one day in ten calm), the compass bearing it blows FROM (seven days in ten from the
  west's quarter; 0 is north, the top of the screen), a gustiness. `windAt(wind, t)`: gusts on a clock in seconds (three slow waves, sharpened; smooth, no snaps), a direction
  wobble of up to 12 degrees on a gusty day. On a shot (`windEffect`): the wind along the line is a headwind (-0.9% of the carry a mph) or a tailwind (+0.45%), the wind across
  drifts the ball 0.6% of the carry a mph (a 10 mph crosswind moves a 200 m drive 12 m); times the club's exposure (`WIND_CLUB`: driver and woods 1, 4-iron 0.95, 6-iron 0.85,
  8-iron 0.75, PW 0.65, SW 0.55, putter 0) and the lie's height (a bunker shot comes out high: x1.3). More on high, long shots, less on low, short ones, none on a putt (a putt
  does not come through `hitShot`; `shotOutcome` reads no `env` for it). The tournament's wind is `dailyWind(seed, key)` (stable after a reload); your round's, its day's.
- **The lie** (lies.ts). `LieKind`: tee, fairway, first cut, rough, deep rough, fescue, bunker, green. `makeCourseView` gives the view a `kindAt`: the surface's own kind
  (long grass is deep rough, fescue is fescue, the waste area is sand) and a rough ball within 1.5 tiles (3 m) of a fairway, fringe, tee or green is first cut; a view
  without `kindAt` (made by hand) gets the coarse lie's own. `LIE_FX` per kind: carry, spread, the share of the spin that gets on, the run after landing, the chance of a
  flier, a wild streak, the height. Tee 1.03 carry (the most distance); fairway clean, full spin; first cut 0.98 / 1.1 / 85% of the spin; rough 0.88 / 1.3 / 45%, run x1.25,
  a flier in 28% (times the club: a driver 10%, a wedge 120%); deep rough 0.74 / 1.55 / 25%, wild 8%; fescue 0.6 / 1.9 / 20%, wild 16%; bunker 0.7 / 1.4, high, no run. A flier
  jumps off the grass with no spin: +12% carry, run x1.8. T318's spin takes the kind's spin share (`spinEffect(..., kind)`).
- **The slope** (lies.ts `slopeAt` from the T026 height field, 1.5 tiles either side of the ball): uphill carries 1.1% less per 1% (at most 10%), downhill more, and runs on;
  the ball above the feet (the ground higher to the right of the target line) pulls left 0.7 degrees per 1% (at most 6), below the feet pushes right; a cross slope adds scatter.
  The town's course is flat (a height edit raises it: the Ground height tool); the lines on the panel say what the ground does.
- **The model's golfers** play in the same weather when `playRound(..., { cond })` has the day's `Conditions` (the mean wind, no gusts: a model shot never depends on the
  minute; the heights; the view's kinds): `dayRound(..., cond)`. The engine passes them for a tournament from `GolfSave.weather.from` on: a save from before the weather has
  none, and the engine stamps it on load with the next tournament's key, so a day in progress and every day before play exactly as they did. Everyday golf and the money
  matches' opponent are left as they were (see Left).
- **The shot panel** (`ui/ShotPanel.tsx`, `Game.shotConditions`): under the meter, the wind dial (the arrow is the way it blows against the shot: up the line a tailwind), its
  mph, "Into the wind / Helping / Left to right", the gusts' peak and what it adds to this shot ("-9 m, 5 m right"); the lie's name and effect lines ("carry -12% · scatter x1.3
  · 45% of the spin · a flier in 3 of 10") and the slope's lines. The meter's aim mark is where to stop the power for the distance the aim PLAYS like in the conditions (the club
  line says so), and the caddie's club (the ring) is the shortest that reaches that. Over the ball (the overlay): the faint ellipse of where the shot is expected to land is
  shifted by the wind's drift and the slope's pull and as wide as the lie's scatter, and a wind arrow with its mph stands by the ball. The round's bar has a wind chip. The
  report after the shot ends with what the wind did ("wind -9 m, 5 m right").
- **The flags and the trees** (`gl.ts` VS_SPRITE / FS_SPRITE, `sprites.ts swayOf`): a uniform (`uWind`: time, the wind's direction on the screen, strength) and a sway code in the
  sprite's cullable slot (bit 0 stays the cull flag): the top of a tree or a shrub leans downwind and breathes with the gusts (the picture sheared about its foot: four vertices
  a sprite, no CPU per frame), and the pin's flag cloth ripples in the fragment shader, streams out in a breeze and hangs limp and drawn in toward the pole in a calm. Nothing
  re-packs on a gust. `?wind=off` (a still day: the shader skips it) or `?wind=14,270,0.6` (mph, bearing, gustiness) force the wind in a dev build, `window.__game.devWind` for the capture
  scripts; `npm run bench -- --start town --wind off|14,270,0.6` measures it.
- **The playtest** (the town course, seed 2, and the 18-hole synthetic course; a person's clicks scripted in `tests/helpers/swing-bot.ts`: the timing error in seconds, so a faster
  meter is harder; `scripts/dev/play-pass-sim.ts`): the findings are on #960. Fixed here: **putting** (the second version, `shot.ts PUTT_V2`, `OwnerInput.v` 2, written on every input
  the engine plays; a saved input without it is version 1 and plays as before): a 0.5 m putt was missed one time in four and half the holes took three putts or more, because the make
  chance fell from 0.3 m, the aim's tolerance was a flat 3 degrees (the cup's angle is 8 at half a metre and 1 at ten) and the power's error counted as 25% of the putt whatever its
  length. Now the chance falls from 0.6 m, the aim's tolerance is the cup's angle at the distance (1.5 to 8 degrees) and the power's window is 0.9 m in metres. The field's days with
  conditions and the money matches' opponents putt by it too. Measured (30 rounds a golfer, the scripted swinger's clicks): a 0.5 m putt 59-90% before, 92-99% after; 1 m 46-80% before,
  86-96% after; 3+ putts on 16-55% of the holes before, 7-30% after; putts a round for a club golfer at the starting skills 40.8 before, 36.1 after, and his score +23.4 before, +18.0 after,
  which is the handicap (18.5) the player card shows.
- **Filed from the playtest:** T345 #987 (the meter's sweet spot is +-33 ms at the starting skill: make it a window in time), T346 #988 (a ball's roll does not depend on the club),
  T347 #989 (everyday golfers and the money matches' opponents play without the wind, lie kinds and slope), T348 #990 (other cards stay open over the shot panel).
- **Left:** the wind has no art but the shader's stand-in (docs/GOLF-SPRITES.md asks for a flag sheet).

**The play pass, part 2 (T334 #960): shot shaping and the player's stats.** `play/shape.ts`, `play/mods.ts`; `tests/golf-play-shaping.test.ts`, `tests/golf-play-stats.test.ts`.
- **Shot shaping** (`shape.ts`). Before the swing the shot panel picks the **curve** (draw, straight, fade) and the **flight** (low, normal, high); the pick is `ShotShape { curve: -1|0|1, flight: -1|0|1 }`, saved
  with the input (`OwnerInput.shape`, a full shot only; absent: none, a shot from before plays as before). A draw curves left and a fade right by `SHAPE.curveDeg` (5 degrees over a 200 m carry, more
  the longer, held between 0.4 and 1.2 of it) and a draw runs on (+15%) while a fade checks; a **high** flight carries 5% less, lands soft (run x0.55) and catches 1.3 times the wind; a **low**
  flight carries 7% less, runs on (x1.7), catches 0.6 of the wind and is the accurate one (scatter x0.85). T318's spin (the dot on the ball) curves the flight too: the two add.
  **The skill cost**: a golfer pulls off `SHAPE.work` (half) of a shape at skill 0 and all of it at skill 1 (his accuracy stat lifts it a little); each pick makes the swing's miss bigger (the meter's
  accuracy click: a curve x1.35, a flight x1.2, both x1.55), widens the scatter by what he does not pull off, and adds a mishit chance that falls to 0 at skill 1. The panel shows it ("Draw: curves left
  4.0°, runs on · 70% pulled off · miss x1.35"); the expected-landing ellipse, "plays like" and the meter's aim mark follow it.
- **Stats and modifiers** (`mods.ts`): `Stats` are the four parts of the game (T241: driving, irons, the wedges = `short`, putting) and three new ones: **power** (the carry: woods +-10% over 0..100 against 50, irons
  +-6%, the wedge +-3%, the putter nothing), **accuracy** (the scatter -+30%, the sweet spot +-40% wide, the marker -+15% in speed: woods and irons) and **touch** (the same for the putter, whose scatter
  is its leave); the wedge reads the mean of accuracy and touch. 50 changes nothing. They live on the player card (0..100) with the others, nerve takes them off under pressure like the skills (`gameSkills`),
  practice raises them (the bucket power and accuracy, the putting green touch, the chipping green touch and accuracy) and the handicap follows them (`HCP_STAT_WEIGHTS`; a stat at 50 weighs nothing).
- **For T335 (the bag) and T336 (the cards): plain data and one function.** A `Mod { id, stats?, carry?, spread?, sweet?, speed?, roll?, mishit?, clubs? }` is a change of stats (added, 0..1 units) and factors
  on the shot, for every club or the listed ones (a club or a family: wood, iron, wedge, putter). `GameSkills.mods` carries the list (the engine builds it in `Game.yourSkills`: empty today);
  `applyMods(skills, club)` stacks them in order into the `ClubKit` the club plays at (its skill after the mods, the carry, scatter, sweet spot, marker speed, roll and mishit factors); `skillFor`, `carryFor`
  (the club's full carry for him), `hitShot`, `shotOutcome`, the meter (`SwingMeter(skill, speed)`, `sweetSpot(skill, boost, sweet)`, `swingEffect(..., sweet)`) and the panel all read it, and nothing else
  has to change for a card or a club to take effect. A new club (T335) is a `Club` id with its carry in `CLUBS`, its family in `FAMILY` and its part of the game in `PART_OF`; a putter shaft is a `Mod` with
  `clubs: ['putter']`; a card that unlocks a mechanic is a flag the engine and the panel read (the spin and the shape are the pattern: an optional field of the input).
- **Back-compat**: a golfer's skills without the new fields (or with them at 0.5) play every shot exactly as a plain skill did (tested over every club and lie); a saved tournament owner keeps his new stats
  with his skills; a profile from before has them at 50; an input without `shape` is played as before and the golden test of part 1 still passes.
