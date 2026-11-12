# Playing your course from behind the golfer: the Cinderlinks port

Written 2026-11-12 for the owner. A plan and its tickets; nothing here is built yet.

## 1. What we are making

When the player wants to play his own course in CapitalEmpire, the game switches from the manager's view to the view from behind the golfer that
Cinderlinks draws (`E:/ClaudeTemp/fidelity-app/cinderlinks/`, latest `gens/gen-29-heat-horizon/`): his holes, his golfer with his clubs and his
skills, and the other people who are on the course with him.

**The one decision everything hangs on: CapitalEmpire's golf model stays the only golf model.** CapitalEmpire already decides every shot in
`src/game/golf/play/` (pure TypeScript, no page code): the skills (`player.ts`: driving, irons, wedges, putting, power, accuracy, touch, nerve), the
bag of 14 clubs with their upgrade levels and the putter's fitting (`play/bag.ts`), the modifiers that stack on a shot (`play/mods.ts`), the lie and
the slope (`play/lies.ts`), the wind (`play/wind.ts`), the spin and the shape (`play/spin.ts`, `play/shape.ts`), the swing (`play/swing.ts`), the roll
(`play/roll.ts`), the field and tee times (`play/field.ts`), the owner's live group (`play/live.ts`), money matches against people (`play/match.ts`),
carts and caddies (`play/entourage.ts`). Cinderlinks becomes **a second way of seeing and feeding that model**, not a second game. So an upgraded
driver, a trained putting stroke or a card that changes a stat counts in the new view exactly as it does today, with no translation table to keep in
step. Cinderlinks' own flight and roll sums are used only when it runs on its own.

What Cinderlinks gives: the land seen from behind the golfer, the golfer and cart, the aim marker and putting grid, the swing input, the ball camera,
biomes and course types, the sounds. What CapitalEmpire gives: the course, who is on it, what every shot does, the money and the progress.

## 2. How the two fit together

```
CapitalEmpire (manager view, the model)                 Cinderlinks view (a panel inside the same page)
  course: areas, tees, pins, aims, heights  --export-->   CourseFile (shapes in metres + height grid)
  LiveGroup (play/live.ts)                  --turn---->   whose turn, lie, ball, pin, wind, club kit
                                            <--input--    OwnerInput: club, aim, power, swing, spin
  shot outcome (flight, bounces, roll, rest) --shot--->   drawn: ball camera, landing, roll
  others in the field / match opponent      --actors-->   golfers, carts, caddies, galleries placed and moved
  result, money, skill gains, cards         <--events--   hole done, round done, gimme taken, left the course
```

- **Embedding.** Cinderlinks runs in an `<iframe>` (its own page and workers, so CapitalEmpire's frame budget and WebGL context are untouched) and
  talks to the host by `postMessage` with a small versioned protocol (section 4). The manager view is paused or thinned while the player is on the
  course.
- **The course.** A new exporter turns the painted course (`CourseArea[]`, `TeeMark[]`, `Pin[]`, `AimPoint[]`, the height field of T026) into the
  course file Cinderlinks already loads (the format of `src/game/golf/osm/data/*.json`, which is what the map importer writes). Tiles are 2 m; the
  exporter smooths outlines and heights so greens are not stepped.
- **Approximate by design.** Fine detail (grass, trees, rocks) is grown by Cinderlinks from a seed taken from the course's name, so the course looks
  the same on every visit. Things the player placed (cart paths, buildings, tents, grandstands, ponds, trees he planted) travel as features.
- **Biome and course type.** The biome comes from the map's setting; the course type from how the course is kept (upkeep spending, the
  superintendent cards, grow-in): neglected plays as Public, well kept as Private, a tour set-up week as Tour. The player may override for a casual
  round.

## 3. Phases

| Phase | What the player can do at the end of it | Tickets |
|---|---|---|
| A. The bridge | Press "Play this hole" and walk his own hole in the new view | T412 to T417 |
| B. His golf | Play a full round where every shot is decided by his skills, bag and lie; shape the ball, control it after it lands, use the power boost and other unlocks he has earned | T418 to T423, T441 to T443 |
| C. Other people | Play in a group, in a tournament field, or a money match, with carts, caddies and galleries | T424 to T429 |
| D. It feeds back | Scores, money, skill gains and cards return to the manager game; saved rounds | T430 to T432 |
| E. Friends | Ghost rounds, then live turn-based play with friends | T433 to T436 |
| F. Finish | One look across both views, speed, and the tests that keep it working | T437 to T440 |

Order: A then B are the spine. C can start once B's turn protocol exists. E waits for D. F runs alongside from phase B.

## 4. The protocol (version 1)

Messages are plain JSON with `{ v: 1, t: <type>, ... }`. Host to view: `course` (the course file, features, biome, type, seed), `actors` (who is
on the course and where), `turn` (the owner's turn: hole, stroke, lie kind, ball, pin, wind now, slope, the club kits he may choose with their
carries and scatter after his mods), `shot` (a decided shot: flight samples, bounces, roll path, rest, for the owner or anyone else), `clock`
(time of day and weather), `leave`. View to host: `ready`, `input` (the `OwnerInput` of `play/live.ts`: club, aim, power, swing outcome, spin),
`walked` (where the golfer or cart is, for pace and for people to react), `gimme`, `holeDone`, `exit`. The view never decides a result; if the host
does not answer, the view waits.

## 5. Tickets

Each ticket: what, where, done when. "Lead" means design-heavy work for the lead model; "coder" means a scoped brief for `haiku-coder`.

### Phase A: the bridge

- **T412 Course exporter** (coder, pure TS). `src/game/golf/play/export3p.ts`: from areas, tees, pins, aims and the height field make a
  `CourseFile` in metres (fairway, green, tee, bunker, water shapes; each hole's line and par; a packed height grid as `osm/terrarium.ts` packs
  it). Outlines smoothed (Chaikin, two passes), heights bilinear from the 2 m grid. Done when: unit tests round-trip a painted 3-hole course and
  the Woodhill sample exports to within 1 m of its source.
- **T413 Features export** (coder). Cart paths, buildings (clubhouse, halfway house, sheds), tents, grandstands and planted trees as the features
  list Cinderlinks reads (`parts/08c-features.md`: paths with surface and width, buildings with size, turn, roof). Done when: a test course's
  paths and clubhouse appear in the exported list at the right metres.
- **T414 Cinderlinks as a module of the repo** (lead). Move the Cinderlinks source into `packages/cinderlinks/` (parts, build, harness), build it
  to `public/cinderlinks/` in `npm run build`, keep its gate (`harness.mjs`) as `npm run cinder:gate`. Decide then whether the GPU engine
  (`cinderlinks-engine`) replaces the CPU renderer here. Done when: `npm run dev` serves the view at `/cinderlinks/` and the gate runs in CI's
  nightly.
- **T415 The view takes a course by message** (coder, Cinderlinks side). `?host=1` mode: no course of its own, waits for `course`, loads it as it
  loads a fetched course (`loadCourse` on data pushed to `MORE_COURSES`), applies features, biome, type, seed. Done when: the harness feeds it an
  exported file and renders hole 1.
- **T416 The panel and the bridge** (coder). `src/game/golf/play/view3p.ts` and a React panel: opens the iframe, sends `course`, relays messages,
  pauses the manager's heavy passes while open, closes on `exit`. A "Play this hole" button on the hole card. Done when: pressing it on a painted
  hole shows that hole from the tee and Esc returns.
- **T417 Playability check** (coder). Before opening: every hole needs a tee, a pin on a green and a line that does not start or end in water;
  reasons shown in the owner's words (reuse `holes.ts` warnings). Done when: a hole with its pin off the green cannot be opened and says why.

### Phase B: his golf (gear and skills carry over)

- **T418 Host-decided shots** (lead). The view stops using its own flight: in host mode `strike()` sends `input` and waits for `shot`, then plays
  the samples (ball camera, landing sound, roll). Host side: `LiveGroup.play(input)` and a sampler that turns the outcome into flight and roll
  points. Done when: the same input gives the same rest point in the top view and the new view.
- **T419 The bag in the view** (coder). The club tabs show his 14 clubs from `bagGear` with their real carries after mods (not Cinderlinks' four
  clubs); club choice by key and wheel; the putter's fitting shown on the card. Done when: upgrading the driver in the shop lengthens the carry
  shown and flown in the view.
- **T420 The aim marker tells the truth** (coder). The dotted arc, landing ring and its size come from the host's kit for that club, lie and wind
  (carry, scatter radius, shape), so a better club or a higher accuracy visibly tightens the ring. Done when: the ring's radius matches
  `applyMods`' scatter within a metre.
- **T421 The swing** (lead). One swing input for both views: map Cinderlinks' hold-and-release (and its heartbeat) onto `play/swing.ts`'
  `SwingOutcome` (tempo, timing error), with `nerve` and pressure changing the window as they do today. Done when: the same timing error gives
  the same miss in both views.
- **T422 Lies, slopes, wind, spin** (coder). The view shows what the model will use: the lie kind under the ball (fairway, first cut, rough,
  deep, fescue, bunker) on the card, the slope arrow, the wind now with gusts, and spin and shape controls wired to `SpinInput`. The view's
  course type must not move the grounds: in host mode the first cut, rough and fescue are drawn where the host's `kindAt` says. Done when: ten
  sample points report the same lie in both views.
- **T423 Greens** (coder). Putting grid from the host's height field, the putt read (line and pace) from `play/green.ts`, gimmies only where
  the round's rules allow (none in a match). Done when: a 3 m breaking putt aimed by the grid holes out in the model.

- **T441 Shot shaping** (lead). The player shapes the ball in the new view: draw and fade (how far it bends, set by tilting the aim line or
  holding a side key), high and low (ball position: more carry and a softer landing, or under the wind with more run). It feeds
  `play/shape.ts` as it does today, so the bend allowed, and how often it over-bends, come from his accuracy, touch and the club's level. The
  aim marker draws the curved flight and where it lands, the wind's push included; a shape he has not earned shows greyed. Done when: a 15 m
  draw round a tree, set in the view, flies the same curve in the model, and a low-skill golfer's attempt misses wider than a high-skill one's.
- **T442 Ball control** (lead). What the ball does after it lands, chosen before the swing and paid for by skill: backspin (checks and comes
  back), a stop shot, a release (runs on), side spin on the bounce, and the bump-and-run round the green. Input: a strike-point picker on the
  ball (low for spin back, high to run, left and right for side) wired to `SpinInput` (`play/spin.ts`: the club's `SPIN_BACK_CAP`, the lie's
  share of spin from `play/lies.ts`: little spin from rough, a flier from deep grass). The view shows the expected bounce and roll as a second,
  fainter line from the landing ring, and the ball's spin as it flies and lands (a zip back on the green, a puff from the turf). Done when: a
  wedge from the fairway with full backspin stops within 2 m of where it pitched, the same shot from the rough runs on, and both match the
  model's rest point.
- **T443 Power boost and the unlocks** (lead). Extras the player earns in CapitalEmpire and uses in the view, all as `Mod`s and cards so the
  model stays the one judge: a power boost (a limited "go for it" swing: more carry, a narrower sweet spot and a wider miss; charges refill per
  round or per hole by a card's rule), unlocked shapes (the stinger, the flop, the punch, the big draw), unlocked spin (side spin, then
  backspin, then "tour" spin), a second boost charge, a steadier heartbeat under pressure from `nerve`. Where they come from: skill levels on
  the player card, club levels in the shop (`play/bag.ts`), cards (`cards/catalogue.ts`), range practice. In the view: a boost button and meter
  beside the power bar (the heartbeat quickens when it is armed), locked options shown with what unlocks them. Done when: a new save has no
  boost and no shaping; buying the Tour driver and earning the boost card adds the button; one boosted drive flies farther and misses wider in
  both views by the same amounts.

### Phase C: other people

- **T424 Actors** (lead). People from the host drawn in the view: `actors` gives id, look, position, facing, what they are doing (walking,
  addressing, swinging, putting, riding, watching). Golfers reuse the golfer sculpture with looks (shirt, cap, skin, build); a small rig cache.
  Done when: a second golfer walks down the fairway and swings in step with the host's clock.
- **T425 Your group** (coder). The live group of `play/live.ts` in the view: order of play (farthest first, honours on the tee), the others'
  shots shown with a short ball camera or a quick cut, their balls and markers on the green, waiting on the tee. Done when: a three-ball plays a
  hole in the right order.
- **T426 Carts and caddies** (coder). Carts from `entourage.ts` and `yourcart.ts` on the exported paths (two to a cart, yours drivable as
  today), caddies beside the pros, the flag tended. Done when: your partner's cart follows the path and parks by the green.
- **T427 The rest of the field** (coder). Groups ahead and behind as distant actors (level of detail by distance), the wait on a tee shown,
  the leaderboard card fed by `play/board.ts`. Done when: a full tee sheet runs with the view above 55 frames a second.
- **T428 Money matches** (coder). `play/match.ts` in the view: the challenge, the stake, hole-by-hole status on the card, no mulligans or
  gimmies, the handshake and payout on return. Done when: a 9-hole match can be won and the purse changes in the manager game.
- **T429 Galleries and tournament dress** (coder). Spectators from `galleries.ts` as crowds round greens and along ropes (billboards, a few
  animated), grandstands, tents and boards from the features; applause and groans from the result. Done when: tournament day's 18th green has
  its stands and a crowd that reacts to a holed putt.

### Phase D: it feeds back

- **T430 Results home** (coder). `holeDone` and round end write the score, stats (fairways, greens, putts), money and reputation through the
  existing round result path; the off-season calendar moves on. Done when: a round played in the view shows on the results screen as one played
  in the top view does.
- **T431 Progress earned on the course** (lead). Skill gains from play (practice value by shot type), club wear or mastery if wanted, cards
  earned by feats (`cards/earning.ts`: an ace, a long drive, a trick shot) raised from the view's events; course rating feedback ("this bunker
  caught 40% of drives"). Done when: a holed bunker shot can earn its card from the new view.
- **T432 Save and resume** (coder). A round in progress saved with the game (hole, stroke, ball, the inputs so far and `MODEL_V`), resumed
  into the view. Done when: quitting on the 7th and loading returns to the same lie.

### Phase E: friends

- **T433 Ghost rounds** (coder). A round is its list of `OwnerInput`s plus the course file's hash and the golfer's kit; export to a file or a
  link, play alongside it as an actor. Done when: a saved round replays stroke for stroke on another machine.
- **T434 Course sharing** (coder). Publish a course (file, features, biome, type, name, par) to a shared list; play someone else's course with
  your own golfer. Needs a small store (the first server piece). Done when: a course made on one PC can be played on another.
- **T435 Live turn-based play** (lead). Two to four friends on one course: a lobby, turns sent as inputs, the host's model on one machine as
  the referee (or the Python brain of T411 as the server), reconnects, a turn timer. Golf only sends shots, never positions every frame. Done
  when: two machines finish a hole together.
- **T436 Fair play between different golfers** (lead). Friends bring different skills and bags: modes "own kit" and "level kit" (everyone the
  same stats), handicaps from `player.ts handicapOf`, stakes off by default. Done when: both modes are selectable and scored.

### Phase F: finish

- **T437 One look** (lead). Shared palettes and names between the manager's surfaces and Cinderlinks' biomes and course types; the golfer's
  look from the player card; the same sun (upper right, shadows 145 degrees). Done when: a side-by-side of one hole reads as one game.
- **T438 Speed** (lead). Budgets: 60 frames a second in the view with a full field; the manager view costs under 2 ms a frame while the panel
  is open; course export under 300 ms; first picture under 3 s. Bench before and after, as the performance gate asks. Done when: `npm run
  bench` reports all four.
  **Measured (2026-11-13, PR for T438).** `npm run cinder:bench` (after `npm run cinder:build`) prints the four, as far as they go headless: the
  harness's render timings on the built page (Woodhill handed over as the host does, 0.75 picture scale), the export of Woodhill and a painted 18
  holes (`scripts/cinder/bench-export.ts`), and the view's course load. In the browser (one tab, one dev server; the pane was hidden, so
  requestAnimationFrame was throttled and every frame was timed by calling the view's own `render()` and reading `PERF`; the game's painted
  Maple Falls course, 259 areas, 18 holes):

  | Budget | Measured | |
  |---|---|---|
  | (a) 60 fps in the view | tee: 15.6 ms a frame (p50 14.9, p95 22; ground 11.1, things 2.3, post 2.2). Green, 40 people in view: 13.7 ms (p50 12.5, p95 34). Headless Woodhill tee + 40 people: 14.3 ms | median within; the slow frames are over |
  | (b) manager view under 2 ms a frame, panel open | 0.4 us: `frame()` returns at once while `view3pHole` is set (engine.ts), the sim at speed 0 | within |
  | (c) export under 300 ms | headless Woodhill 379 ms median (was 582), painted 18 holes 110 (was 174). Browser, Maple Falls: file 300 to 490 ms, entry 30 to 50 | Woodhill and big painted courses over |
  | (d) Play this hole to first picture under 3 s | the view's page is ready in 0.6 to 0.9 s; the course message took 66 s before this PR (the lie grid: 36 s), 4 to 7 s after (the lie grid 2 to 6 s); the view's first frames cost about 1 s each making land | over |

  Fixed (cheap, every output the same as before, checked against the old code): the outline tracer marches each kind only over its own window
  with typed arrays and reused buffers (export3p.ts marchLoops); base64 by a pair table (terrarium.ts toBase64); `surfaceAt` reads an outline's
  box first and a row's crossings once (holes.ts: a point on no painted cell was testing all 259 areas edge by edge, 85 us); the played lines'
  distance from a lattice stamped once, the exact test only near the 40-tile edge (courseview.ts). Left, not cheap: (1) the view's lie grid
  still asks the course view for ~800 000 points (surfaceAt's loop over 259 boxes): an area index, or the grid sent after the first picture;
  (2) the export's height pack (deflate, then inflated again by courseEntry3p) and the 1 m tracing of the full-course rough: pass the grid along
  instead of re-reading it; (3) the view's first frames making land (about 1 s each) and its slow frames (p95 22 to 34 ms): the GPU engine;
  (4) Woodhill's tee in the browser and a rAF frame rate with the pane shown were not measured (hidden pane).
- **T439 Tests** (coder). Unit: exporter, protocol encode and decode, sampler. Headless: the Cinderlinks harness fed by a scripted host plays
  three holes and checks rest points against the model. Nightly, as the testing policy says. Done when: `npm run cinder:gate` covers it.
- **T440 The player's guide** (coder). The hole card's button, keys, what carries over (skills, clubs, cards) and what does not (fine detail is
  grown, not copied), in `docs/` and the in-game help.

## 6. Risks and what would make this plan wrong

- **Two flight models drifting.** Avoided only if T418 lands early; until then the new view is for walking the course, not for scoring.
- **Lie mismatch.** The grown detail must not move the grounds; T422 makes the host's map the truth.
- **Speed.** The CPU renderer is near its limit and stops being optimised by the browser when its main routine grows; the GPU engine is the
  better base for T427 and T429. Decide in T414.
- **Scale.** Cinderlinks plays real courses at 6/10 size with longer clubs to match; in host mode it must run at 1:1 so carries in metres mean
  the same in both views. That is a setting, but it changes how big the golfer looks on the land and needs a look (T415).
- **Not checked while writing this:** how a painted course's height field and ponds are stored in a save, and how the manager view can be
  paused cleanly. T412 and T416 start by reading those.

## 7. What "done" looks like

The player paints a hole, presses Play, tees off with the driver he bought last season, sees his partner's ball land ahead of his, drives his
cart down the path he laid, reads the putt on the grid, and comes back to a results screen that knows what he shot.
