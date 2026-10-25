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
- Green, tee, tent: standing rows across the line to the focus, 0.55 tiles apart, rows 0.6 tiles apart, front row 1.5 tiles from the spot's
  point toward the focus, jitter 0.12 tiles; everyone faces the focus. Each fan idles, now and then claps for 2 to 4 s (the clap loop) and
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
