# The 3D people in the game (spectators, golfers, the new townspeople)

Written 2026-10-25 by the lead (Claude), branch `lead/people-in-game` (worktree `worktrees/people-in-game`, cut from `origin/main` with
`art/people-ground-20261024` merged in). The owner: *"can you add the new models and rigs to the game?"* The art is in
`docs/HANDOVER-PEOPLE.md`; this file is the plan and the contract between the pack and the game code.

## What changes
1. **The pack** (`scripts/assets/prep-sprites.mjs`, generated `src/game/library.ts`): the townspeople as today (the repack adds the new
   `town_*` people, who then walk the town), plus two new groups on the walker pages, at the same display scale (k = 0.5, MIP0, trimmed):
   - **spectators**: `art/spectators/spec_*` with the template and all four crowd clips; 25 frames per facing:
     idle, walk1..8 (0..8), clap1..4 (9..12), cheer1..6 (13..18), sit1..2 (19..20), sit_clap1..4 (21..24). A spectator missing a clip is
     skipped (logged). Staff (`staff_*`) and anyone else are not packed yet.
   - **golfers**: `art/golfers/golf_*` with the template and `golf_drive`; 21 frames per facing: idle, walk1..8 (0..8), golf_drive1..12 (9..20).
   - Every frame's quad is placed from its own sheet's anchor (the clip sheets have their own frame size and anchor; the swing's frames are
     400 px wide with the feet 80 px above the bottom).
2. **The data** the sim worker sends: each gallery spot also says what its fans face and where play aims; each walking party says where it is
   going (below).
3. **The drawing** (`src/game/engine.ts`, a new pure module `src/game/crowdview.ts`): the galleries, the gate and stop queues and the walking
   parties are drawn as 3D spectators in the WebGL sprite layer (movers, like the townspeople), at the street tier (zoom >= `DISTRICT_Z`).
   The old 32 px three-hero sheet (`walkerSprite`, `walkers.png`) goes; below the street tier the dots and the labels stay as now.
4. **The golfers**: there is no golf play in the sim yet. Until there is, a pro stands on each tee whose gallery has fans, swings toward the
   pin now and then (the drive, then the held finish) and waits; marked in the code as the stand-in for the play sim.

## The contract
**`src/game/library.ts`** (generated) adds, beside `WALKER_PEOPLE` / `WALKER_BASE` / `WALK_FRAMES`:
```ts
export const SPECTATOR_PEOPLE: { id: string; w: number; h: number; ax: number; ay: number; m: number; seat: number }[]; // seat: metres (sit)
export const SPECTATOR_BASE: number, SPECTATOR_FRAMES = 25;
export const GOLFER_PEOPLE: { id: string; w: number; h: number; ax: number; ay: number; m: number }[];
export const GOLFER_BASE: number, GOLFER_FRAMES = 21;
/** a clip: its first frame in the person's row, its frame count, the seconds of each frame in the source clip, and whether it loops */
export interface PeopleClip { start: number; n: number; times: number[]; loop: boolean }
export const SPECTATOR_CLIPS: Record<'idle' | 'walk' | 'clap' | 'cheer' | 'sit' | 'sit_clap', PeopleClip>;
export const GOLFER_CLIPS: Record<'idle' | 'walk' | 'golf_drive', PeopleClip>;
```
The frame of person p, facing row d (0..7, the rows S SW W NW N NE E SE), frame f: `SPECTATOR_BASE + (p * 8 + d) * SPECTATOR_FRAMES + f`
(golfers alike). `times` come from each clip json's `times` (walk: `k / walkFps`; idle: `[0]`). The LIBRARY items are `kind: 'walker'`.

**Gallery buffer** (`galleryBuf`, `traffic.gallery`): 8 floats per spot: `x, y, fans, kind, fx, fy, ax, ay` (kind 0 green, 1 tee, 2 stand,
3 tent). `fx, fy`: what the fans face (green: the pin; tee: the tee; stand: the spot's point plus one tile toward the screen's bottom,
`(+0.7071, +0.7071)`; tent: the structure's centre). `ax, ay`: where play aims (green and tee: the pin; others: `fx, fy`). `GallerySpot`
gains `fx, fy, ax, ay`.

**Walker buffer** (`walkBuf`, `traffic.walkers`): 6 floats per party: `x, y, n, stage, tx, ty` (tx, ty: the party's current target).

## How a crowd looks (crowdview.ts, pure and tested)
- A spot shows min(fans, 60) people (a grandstand: min(fans, 90)), each with a seeded person, place and time offset (hash of spot index
  and slot), so crowds never move in step and a spot keeps its people from frame to frame.
- Green, tee, tent: standing rows across the line to the focus, 0.55 tiles apart, rows 0.6 tiles apart stepping back from the focus, the front row at the spot's
  point (the gallery's front, already off the line of play), jitter 0.12 tiles; everyone faces the focus. Each fan idles, now and then claps for 2 to 4 s (the clap loop) and
  rarely cheers (the one-shot), on a seeded schedule.
- Grandstand: seated rows (the `sit` loop, now and then `sit_clap`), facing `fx, fy`, each row drawn a step higher (the stand's tiers).
- Queues: standing, idle, facing the stop or gate. Walking parties: min(n, 3) side by side across the heading, the walk frames by time.
- Tee golfer: at the tee (`fx, fy`), body turned so the pin (`ax, ay`) is on the golfer's left (right-handed; the swing json's `shot`): the
  pin's screen direction turned 90 degrees clockwise (screen `X = x - y, Y = (x + y) / 2`; clockwise `(X, Y) -> (-Y, X)`; back:
  `x = Y + X / 2, y = Y - X / 2`). A 30 s cycle, offset by hole: address (golf_drive frame 0) 2 s, the swing by its `times`, the finish
  held 2 s, then idle.

## Checks
`npm run typecheck`, the full `npm test` (the repack moves the digests `tests/compose.test.ts` pins: update them), `npm run bench` before and
after (GAME-PLAN 2.3: the atlas grows by the new walker pages), and the game itself: a tournament day at 30% and 12% zoom, screenshots.

## Who is in the game (2026-10-27, T203 #531)
The pack is the wiring: the town's walkers pick a person by index over `WALKER_PEOPLE` (engine.ts `Pedestrians(seed,
WALKER_PEOPLE.length, ...)`) and the crowd by a seeded hash over `SPECTATOR_PEOPLE`, so a new person folder with its sheets, repacked,
walks the town or joins the crowd with no code change. The tables are sorted by id, so a repack moves the indices (nothing saves them).
- **Townspeople (15, `art/people3d`):** `base_kid`, `base_man`, `base_woman`, `town_m_business`, `town_m_elder`, `town_m_mechanic`,
  `town_w_nurse`, `town_w_shopper`, and from T203 `town_w_waitress`, `town_w_student`, `town_m_jogger`, `town_m_postman`, `town_k_boy`,
  `town_k_girl`, `town_w_elder`.
- **Spectators (15, `art/spectators/spec_*`, every one with clap, cheer, sit and sit_clap):** `spec_m_bucket_hat`, `spec_m_dad`,
  `spec_m_plaid`, `spec_m_polo_visor`, `spec_m_sun_hat`, `spec_m_young_cap`, `spec_w_older_cardigan`, `spec_w_sunhat_dress`,
  `spec_w_visor_pastel`, `spec_w_windbreaker`, `spec_w_young_shorts`, and from T203 `spec_teen_boy`, `spec_teen_girl`, `spec_k_boy_cap`,
  `spec_k_girl_pigtails` (the kids sit at 0.32-0.34 m).
- **Golfers (10, `art/golfers/golf_*`):** unchanged.
- **Not packed: staff.** `staff_marshal_m`, `staff_marshal_w`, `staff_volunteer_w`, `staff_caddie_m`, `staff_security_m` and (from the last
  batch) `staff_vendor_m` have their sheets in `art/spectators/`, but the packer takes only `spec_*` there and the game has no staff yet.
  Their own ticket: a `staff_*` group in prep-sprites.mjs (like `crowd('golfers', ...)`) and somewhere to stand them (the gates, the tents, the
  marshals along the ropes).
- **The atlas after T203:** 22 pages in library.ts (the sprite pages 0-16 kept byte for byte, the walker pages 17-21), 74 with the other
  packs; the residency plan holds GAME-PLAN 2.3 by construction (dpr 2: 95.8 of 96 MB, dpr 1: 31.9 of 32 MB; one page more costs about 3
  streamed slots of each tier).

## Status (2026-10-25)
Done on `lead/people-in-game`: the pack (19 atlas pages, the walker pages 15-18; main's sprite pages 0-14 kept byte for byte), the data
(8-float galleries, 6-float walkers), `crowdview.ts` with `tests/crowdview.test.ts`, and the engine (crowdMovers at the street tier; the old
32 px sheet gone). Checked in the dev build with a crowd injected beside the camera (the sim paused, `__game.traffic` pinned): the green,
tee, grandstand and tent galleries, a walking party and the tee golfer's 30 s cycle (address, swing, held finish, idle) all draw, no
console errors, 118 crowd movers costing about 0.6 ms of CPU a frame. Not yet seen in a real tournament day (no saved scene has one).
Next for the crowd: the grandstand's real seat rows (the fans now sit in stepped rows on the stand's point, not on its art), the staff
(marshals, volunteers, caddies) and the kids once made, crowd patches for the far zoom (SPECTATOR-ART 3d), and the golfers' play once the
sim plays golf (they replace the tee stand-in).
