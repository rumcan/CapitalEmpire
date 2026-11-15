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
| town-grow | the same new game: one camera on the town by the county road, a few seconds as it is, then about four years at 20x as a time-lapse (each picture 16 frames of the clock) | the town early, then filled in: houses, yards, side roads |
| town | the showcase club; the camera glides from the town over the range to the holes | the club and the town |
| hole-full | Build > Course > New hole: a click for the tee, one for the green, BUILD NOW; then the Holes panel: the green widened, two bunkers, a pond in front of the green (closer camera), long grass along both edges; Build > Trees and props: maples brushed along the fairway, a bench and a fountain by the tee; then 20x as a time-lapse | a hole built and shaped by hand, then grown in |
| texture | Build > Course > Texture Painter: a surface, its Main texture opened (the looks as pictures), Fescue picked and painted; then Worn path | the textures are the player's choice |
| props-range | Build > Course > Trees and props: the list scrolled from the trees to the media; a statue, a planter and a lamp post placed | how many props there are |
| traffic | the grown town's built houses, close, at 1x, a slow move | cars and people in the streets |
| import | Build > Course > Magnolia National (the card per real course): the course in hand, moved to a pose the planner allows (no houses, no roads), a click, Place it; the camera rises over it. (It replaces the club's holes, so it is the last club shot.) `--import new`: from a new game's Who are you? card instead | a real course laid into the running club |
| golf-real | Magnolia National hole 16 (par 3 over water), Golden hour, played out | a real course from behind the golfer |
| golf-tee | Hole 1's card, Golden hour, Play this hole; a drive held to the aim's fill with 4 taps of Up during the hold (the boost bar rising; `--boost N`), Up tapped in the air (topspin). (#1368 was the robot letting go late on the falling meter, not the game: fixed in #1379; a boosted drive carries about 193 m against 178 m) | the tee shot, the boost, spin in the air, the minimap |
| golf-draw | Hole 4 (par 3), Day; the ball button, the dot dragged left (a draw), the tee shot with Down tapped 4 times in the air (backspin: the ball checks on the green; `--backspin N`), then the hole played out to the cup | shot shaping, the approach, the putting grid, the holed putt |
| range-practice | the range's practice mode, two balls | the Last ball readout |
| times | hole 4's tee at Day, Golden hour, Dusk, Night | the four lights |
| night | hole 2 at Night, the tee shot | night golf |
| alive | the club at 2x, a slow camera move | golfers, carts, cars, people |

How a swing is timed: the robot holds Space and lets go when the meter reaches the aim's fill (`HP.target.u`, the gold mark a player releases on),
read from the golf view each frame. Every take is a real stroke by the game's golf model with the starting golfer's skills (handicap 18.5), so
`--takes N` records N tries and the cut uses the best one.

The pointer: headless Chrome draws no cursor, so the recorder draws a small arrow where the robot's mouse is (`trailer-rec.mjs cursorScript`),
hidden inside the golf view, which has its own aim.

## How a frame is made (frame stepping)

Draft 1 was a real-time screencast, and it stuttered whenever the PC was busy (the owner: "the pc is slow so when you are showing stuff like the importing a map
it doesnt translate"). Since draft 2 every shot is stepped (`scripts/jam/trailer-vclock.mjs`): while a shot records, the page, the golf view's frame and the sim
worker run on a virtual clock that the robot moves on by exactly 1/30 s a frame (two 1/60 s steps: the golf view moves per animation frame). After each step
the robot waits in real time until the ground's bakes in flight are done, draws again at the same moment, and takes the picture (CDP Page.captureScreenshot);
ffmpeg makes the 30 fps clip from the numbered frames. A frame takes as long as the PC needs and the clip is still smooth (a 10 s shot takes a few minutes).
The robot's waits, pointer moves and swing holds count frames while recording; between shots the clocks are the browser's own. `--realtime` records the old
way (Chrome's screencast). Run recordings inside `bash E:/ClaudeTemp/heavy.sh` so nothing else heavy runs during a take.

## The voice

`node scripts/jam/trailer-voice.mjs --voice am_michael --speed 0.95` reads `F:/ClaudeTemp/jam/voice/script.md` (17 numbered lines, each tagged with its shot),
says each with Kokoro-82M (Apache-2.0, local) and normalises it to -16 LUFS: `F:/ClaudeTemp/jam/voice/am_michael/NN.wav` and `lines.json`. In the cut, a part
with `"vo": N` starts line N (0.25 s in); the parts up to the next line are stretched to the line plus 0.45 s (slower first, then more of the clip, then the
last frame held), so a shot is never shorter than its line. The music is ducked 10 dB under each line with 0.25 s ramps. The owner chose am_michael
(Michael, US) at 0.95.

Found while recording (2026-11-15): #1368 (the tap boost); the Texture Painter and placing a real course into a running club are not reachable in the jam UI (the Course flyout is off there; the lead is opening it), Props only by key Z; town events (the Mayor's Cup, the Club Championship) leave a leaderboard on the map for months of game time, so the club is run on past it before filming.

## The cut (`edit`)

`trailer-cut.json`: the parts in order, each `{ shot, from, to, speed, caption }` (a time-lapse is `speed` > 1), the title part (`title: true`: the
logo `src/assets/ui/brand/logo.webp` over the menu scene, or the name in Georgia when there is no logo), the end card (the logo or the name, the jam,
the play line: `--link` sets it) and the music. Captions are Bahnschrift, bottom left, fading in and out.

Output: `trailer.mp4` (1920x1080, 30 fps), `trailer-720p.mp4` (under 30 MB, for a phone) and `trailer-voice.json` (where each line falls).

Music: **Sunny Side Up 2** by Pro Sensory (Alex McCulloch), CC0 1.0, from OpenGameArt, the game's own radio track (docs/jam/AUDIO-CREDITS.md). CC0
allows any use, a video included; the credit is a courtesy.

## Re-recording against the final build

1. `git pull` lead/live; `npm run build:jam`.
2. `node scripts/jam/trailer.mjs build ...` only if the save format or the map changed (the old `showcase.cesave` loads in a newer build otherwise).
3. `node scripts/jam/trailer.mjs record` (all shots, about 20-30 minutes), look at `shots/`, re-run a weak one with `--only <shot>`.
4. Adjust `trailer-cut.json`'s in and out points if a take changed; `node scripts/jam/trailer.mjs edit`.
