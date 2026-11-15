# The trailer: how it is made and how to make it again

The jam video is an advert of the real game: every shot is the jam build being played by a robot that uses the game's own tools, recorded
frame by frame from Chrome, then cut with ffmpeg. Nothing is mocked up. The jam rule (docs/JAM.md) is that the video shows only the
submitted build, so the final takes are recorded from `dist-jam` (`npm run build:jam`).

Name on screen: **Golf Manager 2026**. The money side is not the subject (the owner, 2026-11-15: "make it like an advert for Theme Park").

## The three steps

All three write under `--out` (default `F:/ClaudeTemp/jam/video`). One headless Chrome at a time; each step closes its browser and any server it started.

```
# 1. the showcase club (a VITE_JAM=1 dev server on a scratch port: the map's ?seed= is a dev-server feature)
VITE_JAM=1 npx vite --port 5480 --strictPort --host 127.0.0.1          # in another shell; stop it after
node scripts/jam/trailer.mjs build --base http://127.0.0.1:5480/        # -> showcase.cesave (about 2 min to build, 2-4 min to grow)

# 2. the shots, from the jam build (served by vite preview on a free port; or --base a dev server for a quick look)
npm run build:jam
node scripts/jam/trailer.mjs record [--only menu,range-build,...] [--takes 3]   # -> shots/<shot>.mp4, raw/<shot>/ frames

# 3. the cut
node scripts/jam/trailer.mjs edit [--link "Play free at <url>"]          # -> trailer.mp4 (scripts/jam/trailer-cut.json says what goes where)
```

Files: `scripts/jam/trailer.mjs` (the three steps, the club's build), `trailer-shots.mjs` (each shot), `trailer-rec.mjs` (the recorder),
`trailer-edit.mjs` (the cut), `trailer-world.json` (the club: seed, holes, the hole built on camera, camera stops), `trailer-cut.json` (the cut list).

## The showcase club (`build`)

On seed 11 (the menu scene's map, scripts/jam/menu-scene-world.json), by the game's own flows, as scripts/jam/menu-scene-build.mjs does: the old range
bought, its junk cleared, the ten upgrades of the jam's Build menu, the clubhouse beside the drive, five holes through the New hole wizard (tee, green,
a bend, Build with sod and framing trees), then the club runs at 20x until the town has grown and a spring month with no town event is on. The cash is
topped up (it is a set: its takings would take years); the money is never filmed. Saved with the game's own Download save.

Limits found while building it (2026-11-15):
- **A real course replaces the club's holes.** Laying Woodhill turned the club's course into Woodhill (holes 1-18), so the save keeps its own five
  holes and the trailer imports Magnolia National on camera instead, as the last thing done in that session.
- **The town stops at about 30 houses** along the county road (year 4 onwards on this map): the jam has no road tool, so the town has no new lots.
  Filmed as it is, framed wide with the club in front.
- **Holes off the club's land are refused** (the jam has no land sale).

## The shots (`record`)

| Shot | What the robot does | What is shown |
|---|---|---|
| menu | opens the jam build: the title card over the living menu scene | the title card |
| range-build | New game, Who are you, the start pick (the pointer looks for a green ghost, a click), then the Build menu's range cards one by one (each a ghost and a click on the outfield), the camera fixed; then 20x | the bare range, then grass, tee turf, target greens, bays, roof, dispenser, car park; golfers coming in |
| town | the showcase club; the camera glides from the town over the range to the holes | the club and the town |
| import | Course > Place a real course > Magnolia National, the course in hand moved over the map, a click, Place it | a real course laid |
| hole-build | Build > Course > New hole, a click for the tee and one for the green, BUILD NOW, then 20x | the outline, BUILD NOW, the hole with its trees and contoured green growing in |
| paint | Course > Shape by hand > Green, Bunker, Water, a stroke or two each | painting greens, sand and water |
| decor | Course > Plants, trees clicked in | trees and props going in |
| golf-tee | Hole 1's card, Golden hour, Play this hole; a drive held to the aim's fill with taps of Up (the boost), Up in the air (topspin) | the tee shot, the boost bar, spin in the air, the minimap |
| golf-draw | Hole 4 (par 3), Day; the ball button, the dot dragged left (a draw), the tee shot, then the hole played out to the cup | shot shaping, the approach, the putting grid, the holed putt |
| range-practice | the range's practice mode, two balls | the Last ball readout |
| times | hole 4's tee at Day, Golden hour, Dusk, Night | the four lights |
| night | hole 2 at Night, the tee shot | night golf |
| alive | the club at 2x, a slow camera move | golfers, carts, cars, people |

How a swing is timed: the robot holds Space and lets go when the meter reaches the aim's fill (`HP.target.u`, the gold mark a player releases on),
read from the golf view each frame. Every take is a real stroke by the game's golf model with the starting golfer's skills (handicap 18.5), so
`--takes N` records N tries and the cut uses the best one.

The pointer: headless Chrome draws no cursor, so the recorder draws a small arrow where the robot's mouse is (`trailer-rec.mjs cursorScript`),
hidden inside the golf view, which has its own aim.

Frames come from Chrome's screencast (each painted frame, with its time): about 13-21 a second at 1920x1080 on this PC, held to 30 fps by ffmpeg.

## The cut (`edit`)

`trailer-cut.json`: the parts in order, each `{ shot, from, to, speed, caption }` (a time-lapse is `speed` > 1), the title part (`title: true`: the
logo `src/assets/ui/brand/logo.webp` over the menu scene, or the name in Georgia when there is no logo), the end card (the logo or the name, the jam,
the play line: `--link` sets it) and the music. Captions are Bahnschrift, bottom left, fading in and out.

Music: **Sunny Side Up 2** by Pro Sensory (Alex McCulloch), CC0 1.0, from OpenGameArt, the game's own radio track (docs/jam/AUDIO-CREDITS.md). CC0
allows any use, a video included; the credit is a courtesy.

## Re-recording against the final build

1. `git pull` lead/live; `npm run build:jam`.
2. `node scripts/jam/trailer.mjs build ...` only if the save format or the map changed (the old `showcase.cesave` loads in a newer build otherwise).
3. `node scripts/jam/trailer.mjs record` (all shots, about 20-30 minutes), look at `shots/`, re-run a weak one with `--only <shot>`.
4. Adjust `trailer-cut.json`'s in and out points if a take changed; `node scripts/jam/trailer.mjs edit`.
