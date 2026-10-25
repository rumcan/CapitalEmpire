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
