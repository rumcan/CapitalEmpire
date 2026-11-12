# Cinderlinks

Cinderdeep's golf game: the wanderer plays golf on a pixel course seen from an isometric camera. Started 2026-11-11.

- **Play:** `npm run dev` in the repo, then open `/cinderlinks/index.html` (Vite serves the built page from `public/cinderlinks/`). Or double-click
  `public/cinderlinks/launch.cmd` after a build (Edge app window, no server; no workers then). `index.html?seed=N&time=0|1|2&course=<id>|none` picks the
  course and the light.
- **Keys:** WASD walk (Shift runs; W is always away from the camera). **Camera:** drag with the middle mouse button to turn it round the golfer and to look up and down; wheel zooms; Q E turn; R F raise and lower; C puts it back behind the hole. Mouse aims beside the ball, hold the left button for power and let go to hit, 1-4 clubs, T light (day, golden hour, dusk), N new course, B drop the ball beside you (one stroke).

## In CapitalEmpire (from 2026-11-12, T414)

This folder is Cinderlinks as a package of the CapitalEmpire repo, copied from `E:/ClaudeTemp/fidelity-app/cinderlinks/gens/gen-29-heat-horizon/`
(the generations before it, and their pictures, stay there). The plan it serves is `docs/CINDERLINKS-PORT.md`: the view from behind the golfer,
opened inside CapitalEmpire in an iframe and fed by messages.

- **Build:** `npm run cinder:build` (`node packages/cinderlinks/build.mjs [--out <dir>]`). It joins `parts/*.md` into `cinderlinks.fd.md`, compiles it
  with `compiler/fidelity.mjs` (every `Check:` line must pass), writes `courses.js` from `courses/raw/*.json` (the logic of `tools/course-import.mjs`),
  copies `courses/edits/` and syntax-checks `game.js`. Output: `public/cinderlinks/` (not committed). `npm run build` and `npm run dev` run it first.
- **No PowerShell needed.** `compiler/fidelity.mjs` is a Node port of the `compile` and `check` commands of Fidelity's `fidelity.ps1` (kept beside it
  for reference and for its other commands, which open windows). On gen-29 the two write byte-for-byte the same files. `build.sh` just calls `build.mjs`.
- **Gate:** `npm run cinder:gate` runs `harness.mjs` on `public/cinderlinks/game.js` at `RSCALE=0.75` (`gate.mjs`, so it works on Windows without
  `cross-env`). Budget: standing render under 16.6 ms. Pictures: `node packages/cinderlinks/harness.mjs public/cinderlinks/game.js --shot shots/x --scenes ...`.
- **Host mode (T415):** `index.html?host=1` loads no course of its own and is driven by `postMessage` from the page that holds it; see "Host mode" at the end.
- **The GPU engine is not decided.** `E:/ClaudeTemp/fidelity-app/cinderlinks-engine/` holds an unfinished GPU renderer (a copy of gen-14 with the land
  drawn on the card, `?engine=cpu` for this renderer; its hand-over is in that folder's `ENGINE-NOTES.md`). Whether it replaces the CPU renderer here is
  still open: nothing of it is in this package.
- The other paths below (`out/...`, `bash build.sh`, `../compiler/fidelity.ps1`) are from before the move: read `out/` as `public/cinderlinks/`.

## How it is built

- Source of truth: `parts/*.md` (one Fidelity part each, in order). Never edit `public/cinderlinks/` or `cinderlinks.fd.md` by hand.
- Build: `npm run cinder:build` (see above).
- Gate: `npm run cinder:gate` (one JSON line, exit 0 = pass): timings against budgets, same seed gives the same ground and plants, a scripted shot, tee and cup valid on 9 holes, a measured "no repeating pattern" check (the checker is itself tested on a tiled picture and on noise), and the host mode loading Woodhill by message.
- Look: `node harness.mjs ../../public/cinderlinks/game.js --shot shots/x --scenes tee,fair,green,pond,cliff,woods,meadow,bunker,swing,walk,golfer,flora,host [--time 0|1|2] [--seed N]` (run from this folder) writes one 960 x 540 PNG per scene. Read the PNGs to judge the art.

## The camera (from 2026-11-11)

Not polygon 3D: the land is height data drawn in perspective (as old voxel-terrain games did), and trees, rocks and the golfer are flat sculptures placed on it. The camera starts 14 m behind the golfer and 3.6 m up, looking up the hole, and can be turned all the way round, zoomed, raised, and tilted (the horizon row `HZ` moves). Snapshots: `gens/gen-00-iso/` (isometric), `gens/gen-01-horizon/` (fixed horizon camera), `gens/gen-02-camera/` (free camera).

- **Cutaway:** land between the camera and the golfer that rises above the sight line to his feet is cut away and shows soil over rock (`capAt`), so the camera is never buried in a cliff.
- **Nothing steep is stretched:** where one ground sample covers three or more screen rows, each row is coloured for its own height: rock blocks on rock and cliffs, grass grain on grass.
- **The ration:** making new land is limited per frame (`genBudget`, ms). Far land is made in slices (`farStep`), middle tiles in a queue (`tileWork`), a missing near chunk is stood in for by its tile, and while the golfer stands still the ground all round him is made ahead (`makeAhead`).
- **A lesson worth keeping:** give chunks, tiles and far pieces every field when they are created. Adding fields later made the engine throw away its optimised code and the land pass ran five times slower.

## Cliffs and Grove's leaves (2026-11-11, `gens/gen-03-cliffs-grove/`)

- **Cliffs:** plateau edges are sheer everywhere and come in two lifts with a ledge between; near the course a plateau draws back and is never squashed into a ramp (`field`). The rock is columns between long zigzag cracks, each a stack of big blocks about a metre across with a lit top and sunward edge, a shaded foot, cracks, splits and grass caps (`faceCol`).
- **Leaves:** broadleaf crowns, conifers and bushes use the leaf clusters of the owner's Grove project (`leafCluster`, ported from Grove's `evolution/detail4x/detail_runtime.py`): lobed ellipses of small leaf cells in five tones, patchy, sunlit to the upper right, darker where clusters overlap, with glints and stray single leaves. Autumn groves use Grove's own three palettes. Trunks and branches are Cinderlinks' own.
- **Wind:** Grove's (`gustAt`, `drawWindTree`, from Grove's `site/wind_runtime.js`): a gust crosses the land every 12 seconds; while it passes a tree (about 1.8 s) each cluster but the core steps through eight poses from its own start and its lobes swell and shrink; the wood stays still. Grass and flowers bend hard in the gust and barely stir in the calm. Only trees within 46 m keep moving parts; farther ones are flat.
- Grove itself was downloaded from the owner's laptop (size and SHA-256 checked) to `E:/ClaudeTemp/Grove-20261111/` and is viewed with `python -I -m http.server 57844 --bind 127.0.0.1 --directory E:/ClaudeTemp/Grove-20261111/reduce-tree-game`, then `http://127.0.0.1:57844/evolution/detail4x/`.

## The technique

Ticket T409 (CapitalEmpire issue 1105), from Shifty the Dev's "Making a little pixel world that looks 3D":

1. The ground is a height field. It is drawn one distance at a time, near to far; each ground point is raised by its height (in perspective) and only draws above what its screen column already holds (`drawGround`).
2. A normal per sample from the height, tilting only away from taller neighbours, direct neighbours counted double (`tileLight`).
3. Diffuse sun light, then a cast shadow marched toward the sun.
4. The light is posterized into six bands with a dithered edge (`genChunk`).
5. The shadow colour is a chosen cool colour, never black (`setTime`).

Where near land steps up steeply, the gap is filled as a cliff face (`faceCol`). The tee is a cliff-sided box (ticket T372).

Three levels of land: painted chunks to 30 m, the tiles' own colours to 90 m, a coarse far field to 260 m (made a piece a frame). The sky (bands, clouds, two mountain ranges, sun, stars) is painted once per light in `makeSky`. Standing things are scaled by distance; far trees borrow sculptures from a small library (`libOf`).

## What is reused from Cinderdeep

The page frame (launch.cmd, HUD manner, pixelated canvas), the random and noise functions, the particle pool, the light grid (sweep and blur) for glow, the wanderer's colours, glowcaps, crystals and moths (as fireflies), the fixed-step loop, the harness idea (headless gate plus PNG scenes), and the Fidelity file format.

## Known weak spots (2026-11-11, free camera)

- The worst spot (the tee, beside cliffs) takes about 15 ms a frame headless, right at the 16.6 ms limit; open fairway about 12 ms. Turning into land never seen dips to about 50 frames a second in the browser; turning back is near 60.
- Sculptures are lit as if the sun were always at the screen's upper right, so after a big turn their light no longer matches the ground's shadows.
- Ground close to the camera is magnified (chunky pixels at the bottom of the screen); painted detail and cast shadows stop 30 m out.
- Aiming is by pointing at ground the camera can see.
- Conifers read as lumpy columns close up; cliff blocks read a little like masonry.
- The art was judged by eye on one seed (4242) in three lights.

## Golf, grass and water (gen-05, 2026-11-12)

What the owner asked for after the cliffs and Grove work, and what was built:

- **Cliff feet.** Fallen rock lies in piles at the feet of the cliffs (`tal` in `field()`), with scree painted on the ground, stones stamped on it and mossy boulders of many sizes. The rock blocks have tilted joints, set-back blocks, chamfered tops and facets, so none is a box.
- **No cutaway.** Land is never cut away to show the golfer. The camera rides up over the land instead (`render()`), and the player turns the camera.
- **Less fantasy.** The golfer is a golfer (cap, polo, glove, khaki trousers, golf shoes, a bag on his back). Glowing mushrooms, crystals and toadstools are gone. The HUD is a golf scoreboard.
- **Flashing when moving.** Two causes, both measured with the `flick` scene. Ground more than 13 m away is read from averaged half and quarter size copies of each chunk (`chunkMips`). The distances the land is sampled at are pinned to lines that stand still on the ground (`pinned`). Frame-to-frame change while walking: far 14.1 to 9.8, middle 18.0 to 9.9, near 15.7 to 12.9.
- **Trees.** The bright dots are gone: a glint is one tone up and only on the lit side, and there is less cell-to-cell noise. A tree within 5.5 m of the camera shows its trunk only.
- **Clouds.** Billows on billows, five tones, a lit rim, a dark flat base, and streaks of cirrus high up.
- **Grass** (idea from Ghost of Tsushima's fields: clumps of blades, and one scrolling noise that bends them all so the wind is seen as waves). Each ground pixel of rough, meadow, first cut and hillside has a blade height (`gr` in a chunk). Within 30 m the land sweep raises every blade the way it raises cliffs, nearer blades covering farther ones: dark root, bright tip, flowers at the tips. `windTick()` keeps a grid of gusts; where a gust passes the blades bend lower and shine. The grass lies flat round the ball.
- **Water** (ideas from Sea of Thieves and Black Flag): far water takes the sky's colour, rings of foam lap in toward the shore, light dances on the bed in the shallows, the far water glitters toward the sun, and `reflectWater()` mirrors the banks, trees, reeds and clouds, broken by ripples. A pond is always held in by a grassed bank.
- **Golf look.** The fairway is mown in stripes that run along the hole (`mow` in `field()`), the green in finer stripes, the tee in a chequer; bunkers are raked in furrows that follow their shape and their far wall is sand.
- **Mechanics.** A golf cart waits near the tee: G gets in and out, the walking keys drive it three times as fast, it keeps off greens, tees and bunkers. The wind leans on a flying ball; an arrow on the HUD shows it. H opens the list of keys.

Gate change, stated plainly: the chunk budget (14 ms) is now checked against the slowest of 48 warm chunks (about 9 ms), and the first four chunks from a cold start are reported as `chunkColdMs` for information (about 15 ms, and it swings between 7 and 16 from run to run). Steady chunk making did not get slower (2.65 ms a chunk, 2.68 before).

Known weak spots now: a standing frame is about 14.4 ms headless against a 16.6 ms limit; a view full of close trees dropped to 54 frames a second in the browser before the trunk-only rule and was not re-measured in that exact spot; blades do not lean sideways in the wind (they bend lower and shine); beyond 30 m the grass is flat paint; reflections mirror about the first thing above the water in each column, which is right for banks and things at the water's edge and only roughly right for things farther back; the cart has no sound and the golfer sits in it in his standing pose; sprites are still lit as if the sun were at the screen's upper right.

## Still pictures, follow camera, cart model (gen-06, 2026-11-12)

What the owner asked for after playing gen-05, and what was built.

- **Nothing may move on its own when the camera moves.** Measured by three harness scenes: `still` (rock-coloured pixels at a cliff, turning), `shimmer` (whole picture, turning and walking, sky left out) and `flick` (walking). Each frame is matched block by block against the one before; what is left over is picture that moved on its own.
  - A cliff's pattern is pinned to the cliff: the place along the face is found between the two samples the face is drawn between, not taken from the upper one.
  - A cliff is many samples tall: only its lip and its foot are shaded (each sample's slice used to get its own dark top and foot, which crawled).
  - The sweep keeps the previous height across the joins of its three ranges (30 m and 90 m). It used to forget it there, and the cliff standing on the join was smeared with grass.
  - The sample lines move over the ground only by how far the camera travels forward, so turning turns the picture as one piece.
  - The sweep starts at the nearest distance at which ground can show (it used to start beyond a plateau's edge when the camera hung over a drop: a striped smear at the bottom of the screen).
- **Far ground is the near ground, coarser.** Middle and far samples use the painted ground's own tone formula, slow noise and mower's stripes at full strength; tree, bush and rock shadows lie on them; grass stands on them out to 76 m; a bunker's lip is sand at every distance.
- **One rule for trees** (`treeAt`): a tree seen 225 m away is the same tree in the same place close up. Far trees rise out of thicker haze; small things grow in over the last metres of their range; a tree's own sculpture dissolves in over its stand-in. Land just outside the view is asked for before it is needed.
- **The golf cart is a model**, not a sprite: flat faces drawn through the game's camera with a small depth buffer, so it stands on its wheels from every view, leans with the slope, and its front wheels turn. W goes, S brakes and backs up, A and D steer; the camera swings behind it. The golfer sits at the wheel.
- **The golfer is a person:** shoulders, a neck, a head a fifth of his height, arms clear of the body, the club in his hand. No bag on his back. The lantern only when the light is low.
- **Follow camera (World of Warcraft style):** W and S walk forward and back, A and D turn him, Q and E step sideways; the camera swings back behind him whenever he moves; middle-drag looks around while he stands.
- **A full shot is a marksman's shot:** a heartbeat while the power is held, a drawn breath on release (he holds at the top), a rifle's crack at impact, a moment of slow time, and the camera flies behind the ball until it lies still. Sounds are made with Web Audio, no files.
- **Grass leans** in a gust close by (the upper parts of a blade are drawn downwind of its root).
- **Shot indicator:** dots with a dark edge marching along the arc, the arc's shadow on the ground, a double ring where the ball will land.
- **Bugs fixed:** the golfer could be trapped on a steep face (harness `stuck`: 10 trap points before, 0 after; CapitalEmpire issue 1115); things standing in front of water were given the water's reflection.

Gate changes: the walk test walks straight ahead (W only). It used to hold W and D, which now means walking in a circle with the camera following; turning has its own measure.

Known weak spots: frame time at the tee is about 1 ms higher than gen-05 (the gate passes at 15.6 ms of 16.6 on a busy machine). In the browser, walking while turning runs at about 42 frames a second and the cart at about 47, because new land is lit (25 ms a tile) and new trees are sculpted as they come into view. The ball camera shows plainer ground while it flies (nothing new is painted at that speed). Blades lean only within 13 m. The sounds have not been heard by the one who wrote them.

## Real courses (gen-07, 2026-11-12)

A real golf course can stand in for the invented one. The data comes from CapitalEmpire's map importer (branch `lead/live`, `src/game/golf/osm/`, described in its `docs/OSM-COURSES.md`): OpenStreetMap shapes for tees, fairways, greens, bunkers and water, the mapped hole lines and pins, and a real height grid (SRTM or USGS 3DEP). Map data © OpenStreetMap contributors, ODbL 1.0; the game shows the credit on the card.

- `courses/raw/*.json`: the importer's saved courses, copied as they are (Rondebosch, Magnolia National, Woodhill).
- `tools/course-import.mjs`: turns them into `out/courses.js` (y turned over to the game's frame, heights unpacked, one line and pin per hole number). `build.sh` runs it.
- `parts/03b-realcourse.md`: `loadCourse` makes distance maps (0.75 m cells) for each kind of ground, the mower's lines and each water's level; `fieldCourse` is the land's function for a course; `courseHole` gives a hole the shape the game's own holes have.
- The course is played at six tenths of its size (heights too, raised by three tenths over true slope): a 400 m hole plays as 240 m. On a real course every club sends the ball twice as far (`clubK`), so a drive carries about 145 m and the pars play as they should. It was three tenths at first; the owner found the golfer, flag and cart looked like giants on it (2026-11-12). Greens and bunkers are drawn a little larger than scale.
- Water no longer has one level for the whole land: each tile carries the level of the water nearest it (`T.wl`, `wlAt`), so ponds on a hillside lie at their own heights. The invented course is unchanged by this (its one pond gives every tile the same level).
- K steps through the courses and back to the invented one; `?course=<id>` starts on one. Harness: `--course <id>` and the `course` scene (pictures, and for each hole whether the tee is tee, the pin is on a green and fairway lies along the line).

Not done: streams and rivers (mapped as lines) are left out; holes that have no mapped line are not guessed; islands inside water or bunkers are filled; trees are the game's own woods, not the map's; a new course cannot be fetched from inside Cinderlinks yet (run CapitalEmpire's `scripts/dev/osm-course.mjs "<name>" --height`, put the JSON in `courses/raw/`, rebuild).

## Workers, cloud shadows, streams, the course finder (gen-09, 2026-11-12)

- **The land is made in background workers.** Three workers run this file's own first half (everything above `LAND-WORKER-END` in `out/game.js`: the noise, the course, the things, the ground painter, the middle land's look, the far pieces). One paints chunks and lights the tiles under them, two share the plain tiles, one of those also makes the far pieces. The page asks (`wkTile`, `chunkTry`, `farTile`) and only draws. What a worker makes is the same as what the page would make (checked: 120 chunks compared, no pixel different). Where there is no worker (the harness, a page opened from a file, `?worker=0`) the page makes the land itself within its ration, as before. **Nothing above `LAND-WORKER-END` may touch the page.**
- `PERF` in the renderer sums where the frames' time goes (the land sweep, the things, the passes after, making, the workers' deliveries). Read it from the console; do not wrap the game's functions to time them (that knocks them out of the engine's fast path and gives false numbers).
- **Cloud shadows** drift over the land with the wind (`cloudShadows`, a pass over the finished picture in 8 x 8 blocks).
- **The cart** never waits on a tee or a green (harness `cartspot`), and one that stands on such ground may drive off it.
- **Fairway stripes** run along the hole with straight edges (the owner tried bands across and chose along).
- **Real courses** play at six tenths of true size, with every club reaching twice as far there (`clubK`). No tree stands within 13 m of a hole's line of play. Mapped streams and rivers are water along their lines. The game starts on Woodhill (`?course=none` for the invented course).
- **The course finder** (`parts/08b-fetch.md`): L asks for a name, or `?find=<name>`. Nominatim finds the course (the name is tried as typed, then as "... golf course", "... golf club" and so on), an Overpass server gives its shapes for the course's box, the open terrain tiles give its heights. A fetched course is kept in the browser's storage and joins the K list.
- **Detail at a distance:** a small plant too far for its sculpture is a speck of its colour out to 90 m; the painted ground's levels of detail change over a band of mixed lines fixed to the ground; a distant cliff face is worked out once for two or four screen rows.
- **Walking:** judged over half a metre ahead (harness `stuck`: no trap points).

Harness scenes added: `course`, `cartspot`, `stuck`, `clouds`, `cliffbench`, `turnbench`, `bench`, `shimmer`, `still`, `aim`, `pondtree`, `teeround`. `--course <id>` plays a real course; without it the harness plays the invented one (the gate's numbers stay comparable).

Known weak spots: views full of cliff faces cost 20 ms a frame on the invented course (its first tee stands in a bowl of cliffs). The finder takes everything in the course's box, so a neighbouring course's holes can get mixed in; the sea is not drawn (a links course by the sea shows the sea bed as land); a course with no mapped hole lines cannot be laid out. A stream's water is level within each tile, so on a slope it comes down in steps. The gate cannot measure the worker path (node has no page workers): the browser numbers do.

## Pixel art, plaid, sun patches, picture scale (gen-10 to gen-13, 2026-11-12)

The owner's direction changed here: less realism, more pixel art ("it should look like a painting all the time").

- **Clouds** (`parts/08a-clouds.md`): drawn as heaps of balls lit as one solid and cut into four flat tones, not grown from noise. gen-13: the underside is a row of shallow bellies that curls up at the ends (never a ruled line), and no cloud touches or sits over another (`pixelClouds` places them with clear sky all round; a cloud that cannot be placed is left out).
- **Ground, trees, rocks, water, cliffs** (gen-11): flat patches and clusters instead of per-pixel grain; small copies of sprites and ground take the commonest colour, never a blend.
- **Mowing** (gen-12): a plaid of two crossing passes with squared stripe ends and outline passes round the fairway (`plaid`, `stripeDF`, `mowLines`).
- **Sun patches** (gen-12, gen-13): the clouds do not darken the land; the sun lifts it where it reaches (`sunAt`, `cloudShadows`). About half the land is in full sun. Cast shadows are painted only as a soft shade (light x 0.78) and marked: the lowest bit of the light level in ground arrays, 251 in the top byte once lit. The sun pass darkens marked ground only where the sun is, so a shadow shows under the sun and fades under the overcast. Night has no cast shadows.
- **Jump to ball**: J, or the button.
- **Picture scale** (gen-13): `RS` in `parts/02-core.md`. The page draws at 75% (720 x 405) by default; P cycles 75, 50, 100% (kept in `localStorage['cinderlinks.scale']`, the page reloads), `?scale=1` forces one. The harness draws at 100% unless `RSCALE=0.75` is set, so the gate numbers stay comparable with older ones. Measured on a busy machine: standing 22.2 ms at 100%, 12.6 at 75%, 7.5 at 50%; turning 31.2, 19.5, 13.2. At 50% the golfer and the plaid are too coarse.
- **Panels folded by default** (gen-13): only the hole's line and the club in hand show. Click the card or press U to open them; the choice is kept in `localStorage['cinderlinks.ui']`.

Not done: aim dots and a few other sizes given in screen pixels do not shrink with the picture scale; far and middle shadows are marked per sample, so their edges are coarser than the near ones; the README sections above still describe cloud shadows as they were in gen-09.

A GPU renderer with continuous level of detail is being built in a copy of gen-12 at `E:/ClaudeTemp/fidelity-app/cinderlinks-engine/` (its own session). It starts from gen-12, so gen-13's changes (shadow marks, cloud undersides, picture scale, folded panels) have to be carried over to it.

## Steadier distance, putting grid, gimmes, map tool (gen-14, 2026-11-12)

The owner: "we can't have pixels changing color when the camera looks around ... like a layer of distorted glass on the ground", worst about 100 m away, and "the golf ball in the air also jitters up and down".

- **Rings, not lines** (`drawGround`, middle and far land): past the painted ground the land is read along rings round the golfer (the point the camera swings round), `PDC/PCS/PS2/PGX/PGY` per column, instead of lines square to the view. When the camera looks around the rings stay where they are on the land, so the same points are read and the picture only slides sideways. Measured with the `farjit` scene on Woodhill: jitter while turning 4.97 -> 3.56, walking 3.22 -> 3.13. The painted ground (to 30 m) still uses lines square to the view.
- **Rows on a lattice of the land** (`nextRow`): every row of readings lies on a line of a power-of-two lattice fixed to the land, and every line inside a band of distances is read; before, which line came next was a rounding that flipped as the camera moved and re-shuffled every row beyond it (bands like a torn screen).
- **Steep slopes take the land's own colours** row by row between two readings (middle and far), instead of one colour pulled down the gap; far cliff faces find where the face stands by halving, so their rock keeps its place.
- **Middle heights read smoothly** (bilinear between the tile's samples): a far lip is a line, not a row of blocks.
- **The camera's height glides**: the land under the camera is part of what it aims for (rising sooner than it sinks); before, every bump it passed over pushed it up at once and the whole picture shook, the ball in the air with it.
- **Sand** is painted in flat tones with broad soft rake lines on the floor only; steep fills between two readings carry a few broad flecks, not a grain to every pixel (both read as streaks stood on end).
- **Greens** are mown as a diagonal checker of 1.1 m passes with a clean-up ring round the edge (`greenSt`, `mowLinesG`), near, middle and far alike.
- **Putting grid** (`drawPuttGrid`): when the ball lies on the green, a light grid (a line every metre of the world) lies on the green and a dot runs down every sloping line, faster the steeper it is.
- **Gimme**: within 1.5 m of the hole on the green a Gimme button shows (or Y): one stroke, hole done.
- **Map tool for AI agents**: `tools/cinderlinks-map.mjs` (documented in `tools/MAP-CLI.md`) adds paths and buildings to a course in `courses/edits/<id>.json` and `out/edits/<id>.json`; the running game reads the file again every two seconds (`parts/08c-features.md`: `setFeatures`, `drawPaths`, `drawBuildings`). Paths are laid on the ground as it is seen (no change to the land's data); buildings are boxes with roofs, windows and a door, with true depth and a shadow in the sun.
- Harness scenes: `lip` (a bunker from the hole's line at 100 m and 70 m, two camera angles, 3x close-ups), `putt`, `feat`.

Not done: paths do not change how the ball rolls or show on the small map; buildings do not stop the ball or the golfer; the painted ground between about 15 and 30 m still crawls a little when the camera swings (the engine being built in `cinderlinks-engine/` is the cure for that).

## Building detail, clear paths, bunker lips (gen-15, 2026-11-12)

- Buildings carry detail (`buildFaces`): window frames, sills, two panes and glazing bars, a door in its frame, a plinth, a band between floors, courses of tiles, a ridge, eaves boards, a gable window and a chimney. Small details are left out past 45 m and all details past 110 m.
- Nothing grows on a path or inside a building (`featClear`): no bush, flower, rock or tree trunk is drawn there, and no grass stands on a path (near and middle land ask `pathSd` only in chunks and tiles near a path).
- Bunker lips close to the player take the painted ground's own colours row by row (the near "slope seen steeply" fill), and the grass is trimmed short within 0.6 m of a bunker (`genChunk`, `tileLook`), so its edge is a line and not a row of blades over the sand.
- The example clubhouse the map tool left by Woodhill's first tee was removed; one example path remains in `courses/edits/woodhill.json`.

## Real cart paths in slabs, cart tracks, landing zone painted ahead, a browser-only slowdown (gen-16, 2026-11-12)

- **Woodhill's own cart paths** come from OpenStreetMap: `node tools/cinderlinks-map.mjs import-osm woodhill --cartpaths` (9 paths, 1.9 km; the new `--cartpaths` option takes only `golf=cartpath` and `golf=path`). The made-up example path and clubhouse are gone.
- **Concrete paths are laid in slabs** (`drawPaths`): a joint across the path every 1.7 m, each slab its own shade, a darker edge, a fallen leaf here and there, no flecks or stains. The path's grid keeps, for every cell, which stretch of which path is nearest (`seg`, `SG`), so a pixel knows how far along the path it lies.
- **Pressed grass** (`press`, `pressAt`, `pressCart` in the play part; read in `drawGround` per painted chunk): the cart's four wheels lay the grass flat and leave two pale tracks; the golfer's feet press it lightly. Kept for the 700 chunks touched last.
- **The landing zone is painted before the ball gets there** (`prewarmShot`, `prewarmStep`): at the strike a copy of the ball is flown with the flight's own sums; the tiles and the painted chunks within 29 m of where it comes down are asked of the workers, nearest first, and are kept from being dropped until the ball lies still. Measured in the browser: 257 chunks ready within 4 s of a 123 m shot.
- **A slowdown that only the browser showed**: the near lip fill, written as a small loop inside `drawGround`, made the browser's engine stop optimising the whole function (56 ms a frame for the ground against 6; the harness under node showed nothing). It is now its own function, `slopeFillNear`. Rule: time every change to `drawGround` in the browser pane as well (call `drawGround()` eight times from the console and take the mean), and put new loops in functions of their own.
- **Bark** (`sCap` with `streak`): the light in flat bands and staggered plates of bark with a dark crack at each plate end, instead of a smooth roll of light with per-pixel grain and ruled streaks.

## The golfer redrawn (gen-17, 2026-11-12)

- He is sculpted at the size he is seen at (`GK` = the picture's scale; his blits divide by it), so at the usual camera distance one pixel of him is one pixel of the picture. Before, a full-size sculpture was shrunk to three quarters and every fourth pixel was dropped.
- Three flat tones to a material and no grain (`cel` in `sBall` and `sCap`); a head a little large for the body; bigger hands and shoes.
- The cap is a dome over the top of the head with a red band and a short shaded peak above the eyes, so the face and eyes show from in front.
- His live shadow takes the sculpture's scale (`castSprite(..., GK)`).
- Harness scene `golferzoom`: seven poses enlarged four times, to judge the drawing.

## A new golfer, biomes, fading shadows, full cart paths (gen-18, 2026-11-12)

- **The golfer is new** (`mkGolfer` in the golfer part): a figure of small blocks (voxels, 30 to the metre) built for each pose with a person's proportions, each block taking one of three flat tones from the side it shows the sun. White polo with navy collar and sleeve bands, white trousers, a dark belt and buckle, white shoes on dark soles, brown hair, a white cap with a brim, a glove, a thin steel club. Two sculptures: one at the picture's scale for the usual view, one at twice that when the camera is close (`golferK`). About 2 ms to make a sprite. The figure of balls and capsules from Cinderdeep is gone.
- **Biomes and course styles** (`BIOMES`, `setBiome` in the ground part; `useBiome` in the play part): parkland, links, beachside, desert, savanna, jungle, snow. Each sets the colours of every ground and plant, how thickly trees stand (`BTREE`), the share of conifers (`CONT`) and the grass's height (`BGR`); fairways, greens and tees stay green. M cycles them, `?biome=links` starts on one; the harness takes `--biome`. The workers are told the biome with each fresh start. Not yet made: plants of their own (palms, cacti, acacias), skies per biome, a biome kept per course.
- **Shadows fade with the sun patches** (`shK` in `darken`): a thing's live shadow is as strong as the sun where it stands, for the golfer, the flag, the cart and buildings; before, it vanished at once below a quarter sun.
- **Woodhill's cart paths are complete**: `node tools/cinderlinks-map.mjs route-cartpaths woodhill --buildings` lays a concrete path beside every hole that has none near it (the hole's own line moved sideways until it lies in the rough, evened out), links each green to the next tee, and places a clubhouse and a starter's hut by the first tee, a halfway house by the tenth and a greenkeeper's shed, each on rough clear of holes and paths. With the 9 paths from OpenStreetMap: 32 paths, 4 buildings.
- **The browser slowdown again, and its rule**: the grass-on-path check written inside `drawGround` brought back the 57 ms ground pass as soon as a path lay near the tee; it is now `pathNearPx`. Keep arithmetic that is not the sweep's own out of `drawGround`.

## A full-size layer for the aim marker (gen-19, 2026-11-12)

The aim's dots, its ground shadow and its landing rings are drawn on a second canvas (`#over`, 960 x 540) laid over the game's picture, whatever scale the picture is drawn at (`overBegin`, `overPut`, `overEnd`, `projectO`, `aimDotO`, `plotZO` in the render part). Depth is still asked of the game's picture, so marks on the ground hide behind what stands in front. Only the part that changed is cleared and sent. The harness's pictures are the game's picture only, so they no longer show the aim marker. The putting grid is still drawn in the game's picture.

## The ground routine split, the putting grid on the full-size layer, the golfer rounded, biome grass (gen-21, 2026-11-12)

- **`drawGround` is three functions and a sky** (`midSweep`, `farSweep`, `drawSky`; the near sweep stays in `drawGround`). Kept in one function, the whole sat at the limit of what the browser will optimise, and which view tipped it over changed from build to build (56 ms a frame for the ground instead of 7; the tee one time, the green the next). Measured in the browser pane after the split: 6.9 ms at the tee, 7.7 ms on the green.
- **The putting grid is on the full-size layer** with the aim marker (drawn after everything, so it hides behind what stands on the green).
- **The golfer, second pass**: limbs round in section and the trunk's big blocks rounded; each block's facing is taken from all 26 neighbours (so a limb is shaded round, in four flat tones, not in three slab faces); the seat a little back and the chest a little forward, one foot forward and the knees eased when he stands, a nose, greyer trousers; the club's shaft is one clean line drawn after the blocks. About 3 ms a sprite.
- **Biome grass and small plants**: each biome may set how tall the grass stands on every ground (`gb`), how sparse its tufts are (`sparse` -> `BSP`), and how many flowers, bushes and grass clumps are kept and how many lost bushes become rocks (`fl`, `bu`, `gc`, `rk` -> `bioKind`). Links: tall straw fescue, few flowers; desert: sparse scrub and rocks; savanna: tall golden grass; jungle: lush; snow: little standing.

## Trees of the biomes (gen-22, 2026-11-12)

- **Palm** (`mkPalm`, beachside): a tall bowed trunk ringed with leaf scars; fronds that are bowed ribs with leaflets hanging from both sides (three pixels wide and close together, so a frond is a blade with a combed edge); a heart to the crown and coconuts. It does not move in the wind yet.
- **Saguaro cactus** (`mkCactus`, desert): a ribbed column with one to three arms that go out and then up, flowers at some tips. The desert's trees stand thicker than before (`trees: 0.22`) so the cacti are met.
- **Acacia** (`mkAcacia`, savanna): a leaning trunk that forks into spreading boughs under one wide flat crown, in the game's own leaves (so it moves in the wind).
- Which trees are the biome's own: `t2(c0)` in the ground part, those that would be full broadleaf trees (form number from the conifer share up to 0.66); the airy tree stays. The biome sets `tree2` (1 palm, 2 cactus, 3 acacia), `t2h` and `t2rx` (height and spread beside the usual tree's), used where trees are placed (`treeAt`) and where the far stand-ins are made (`libOf`), so near and far agree.
- Harness scene `treesheet` (with `--biome`): five of the biome's trees on one sheet.
- Not made: jungle and links have no tree of their own; a sky per biome; a biome remembered per course.

## A button for the course's style (gen-23, 2026-11-12)

A button at the top of the picture shows the current style; its menu lists the course types (parkland, links, beachside) and the biomes (desert, savanna, jungle, snow) side by side (`styleBtn`, `styleMenu`, `STYLE_GROUPS`, `styleShow` in the HUD part). Choosing one calls `useBiome` and starts the hole again in that style. M still steps through them; the button's label follows either way.

## Standing grass to 140 m (gen-24, 2026-11-12)

- The far land carries its grass's height (in the far piece's `wood` bytes: 1 is still steep rock, 2 and up is the height plus 2), and `farSweep` stands it up as far as `GRASS_FAR` (140 m), growing shorter over the last 25 m. The middle land's blades now run to its end (90 m, was 76).
- Tufts: in the middle and far land each small patch's grass stands a little taller or shorter and a shade darker or lighter than its neighbours' (`tuftHash`, by place on the land), with a lighter tip. Before, the middle distance looked mown flat and the grass seemed to stop where the painted ground ends (30 m).
- Cost, measured in the browser pane on the savanna (the tallest grass), four directions from the first tee: 7.5 to 9.9 ms for the ground, no frame over 16.8 ms. The painted, blade-by-blade grass still ends at 30 m: this is the plainer grass carried on.

## Biome and course type, two choices (gen-25, 2026-11-12)

The owner's idea: the land's look and the way a course is kept are two separate choices, and any pair makes a course (a Desert Links, a Snow Tour course).

- **Biome** (the land and its plants; `BIOMES`): Parkland, Coastal (was called Links), Beachside, Desert, Savanna, Jungle, Snow. Colours, trees, how sparse the tufts are, the mix of small plants. The desert has its saguaros and, in place of the parkland's airy trees, low thorn trees (`tree3`, `t3()`).
- **Course type** (how it is kept; `CTYPES` in the ground part): each sets the grass's length on every ground (`gm`, times the biome's own), how far the fairway reaches past or short of the mapped edge (`fwo` -> `FWO`), the first cut's width (`cutw`) and the collar round a green (`collar`), how far off the fairway the long grass takes over everywhere (`deepd`) and how readily it grows in patches nearer (`dryt`), how much woodland there is (`woodt`, `trees`), how strong the mower's pattern is on fairways, tees and greens (`mow`, `gmow`), how patchy the fairway's turf is (`patch`: uneven tone and dry worn patches), whether the grass is trimmed round bunkers (`trim`), the flowers (`fl`), and how the turf holds a rolling ball on greens, fairways and rough (`greenDrag`, `fairDrag`, `roughDrag` -> `dragK` in the play part).
  - Links: short and firm in play, almost no first cut, long fescue everywhere a few metres off the fairway, few trees, faint mowing, the ball runs.
  - Tour: narrow fairways, a thin first cut, deep rough then fescue, crisp plaid, the fastest greens.
  - Private (the default): full plaid, a wide first cut, short even rough, trimmed edges, more flowers.
  - Public: wide fairways with no mowing lines and dry worn patches, no first cut, rough of all lengths, shaggy bunker edges, slow greens.
- `setBiome(id, type)` sets both (page and workers); `useStyle(biome, type)` restarts the hole in the pair. The style button shows "Biome · Type" and its menu lists both; M steps the biome, V the type; `?biome=desert&type=links`; the harness takes `--biome` and `--type`.
- **Following the ball, the painted ground is drawn to 78 m** wherever it has been painted (`DN` in `drawGround`, `chunkHave`), and the landing ground is painted ahead to 46 m round where the ball will come down (was 29), so it is whole before the camera descends to it. Unpainted ground in that range carries plain standing grass (`standBlades`).
- **An in-between grass** from where the painted ground ends to 46 m (`g3` in `midSweep`): taller, more varied in shade, dark at the root, so the painted grass does not end at a line.
- **The small bushes and the grass clumps are gone** from the scatter (the owner: "they add very little to the grass"); rocks, flowers and reeds stay.

## The desert, sandier (gen-26, 2026-11-12)

In the desert biome the ground a wood would cover (far off the fairway) is soft pale sand with no green in it (`litter` and `moss` ramps), the rough, long-grass and hill grounds are paler sand, the soil lighter, and the grass is shorter and sparser on every ground (`gb`, `sparse: 0.6`). Fairways, tees and greens stay green.

## Rippled sand and heat over the desert (gen-27, 2026-11-12)

- `sandRipple` (ground part): on the desert's open ground the wind has left ripples about a metre apart, bowed and forked, shown mostly as the shadow in each ripple's lee (bright sand is near the top of the light, so a crest cannot be made much lighter), strong on some stretches and smoothed away on others. Painted ground only (to 30 m).
- `heatHaze` (render part): by day in the desert, rows of the picture near the horizon slide a pixel or two left and right in a slow wave, only where the land is past 55 m, more past 120 m.

## A fade where the painted ground ends; heat as a wobble (gen-28, 2026-11-12)

- Over its last 9 m the painted ground goes over to the plainer ground's colour at the same place in four steps (`fdOn`, `fdW`, `fdA` in `drawGround`; `fadeMix`), so there is no line where one ends and the other begins. It needs the tile's lit look to be made already; where it is not, that stretch does not fade this frame.
- `heatHaze` is now a soft wobble: far land near the horizon (past 60 m) is bent a pixel or two up and down in slow travelling waves and half blended with its bent neighbour. Rows no longer slide sideways.

## Heat at the horizon, thicker desert air (gen-29, 2026-11-12)

The heat wobble now touches only land past 150 m and the foot of the sky (it began at 60 m), a little stronger there; and over the desert the distance haze is twice as thick (`farHaze`, and the middle sweep's `hf`).

## Host mode (T415, 2026-11-12)

`index.html?host=1` is the view inside another page (CapitalEmpire's panel, T416). It loads no course of its own (no `courses.js` pick, no kept
courses, no `?find=`), draws nothing, and talks to the page that holds it by `postMessage` (protocol version 1, `docs/CINDERLINKS-PORT.md` section 4):

| Direction | Message | What happens |
|---|---|---|
| view to host | `{ v: 1, t: 'ready' }` | sent once the page listens |
| host to view | `{ v: 1, t: 'course', course, features, biome, type, seed, scale, hole }` | `course`: one entry in the shape `tools/course-import.mjs` makes for `courses.js` (`convert()` is exported for this); `features`: the object `setFeatures` takes (`{ features: [...] }`, as `courses/edits/<id>.json`); `biome`, `type`: as `setBiome` takes; `seed`: the scatter's seed; `scale`: the course's size (1: true size, the default here; saved courses keep `CSCALE` 0.6); `hole`: from 1 (default 1). The course joins `MORE_COURSES` (replacing one of the same id), is played with `setCourse`, and the drawing starts |
| view to host | `{ v: 1, t: 'loaded', holes }` | the course is on screen |
| view to host | `{ v: 1, t: 'error', why }` | a course without id, holes or shapes |
| host to view | `{ v: 1, t: 'actors', at, actors }` | T424: who else is on the course (CapitalEmpire's `play/actors3p.ts`): each golfer, caddie and cart with its id, place (metres, x east, y south), heading, `doing` and `phase`, `dress` (shirt, trousers, cap, skin, hair, build) and a cart's `riders`; the whole list each time. Drawn by `parts/08d-actors.md` with the golfer sculpture in their clothes, moved smoothly between messages; harness scene `actors`, and the gate times forty of them (budget 2 ms) |
| host to view | `{ v: 1, t: 'leave' }` | the loop stops (nothing drawn); a later `course` starts it again |
| view to host | `{ v: 1, t: 'exit' }` | the player pressed Escape |

- Messages whose `source` is not `window.parent`, or whose origin is not the parent's (`location.ancestorOrigins`, else the referrer, else the
  page's own), are ignored. The view sends to the parent's origin.
- The scale travels with the course (`D.scale`, read by `loadCourse`, so the land workers use it too); the clubs follow it: `clubK()` is
  `sqrt(course.S / 0.3)` (the root of two at 0.6, as before). A course handed over again under the same id carries a new `hv`, so the workers load it again.
- In host mode the page does not poll `edits/<id>.json`: the host's features are the course's.
- The code is in `parts/09-hud.md` (`hostMessage`, `hostStart`), below `LAND-WORKER-END` and outside `drawGround`.
- The gate checks it: `hostMsg()` in `harness.mjs` builds the message from `courses/raw/woodhill.json` (and its edits), and the gate wants the
  `loaded` answer, Woodhill at scale 1, hole 1 with a tee under the golfer, the features applied and a picture that is not black. Picture:
  `--scenes host`.

## Host play: the host decides every shot (T418 to T420, 2026-11-12)

In host mode the shots are CapitalEmpire's (its golf model, `src/game/golf/play/play3p.ts`); the view never flies or rolls a ball of its own. The code is in `parts/09-hud.md` below `hostStart` (`hostPlayMsg`, `hostTurn`, `hostStrike`, `hostShot`, `hostBall`, `hostAim`, `hostTabs`), with one-line hooks in `strike`, `updateBall`, `updatePlayer`, `pickClub`, `gimme`, `dropBall` (07) and `drawAim` (08); nothing in `drawGround`. All of it keys off `HP`, which only a `turn` sets, so standalone play is unchanged.

| Direction | Message | What happens |
|---|---|---|
| host to view | `{ v: 1, t: 'turn', golfer, holeIdx, hole, stroke, ball, pin, clubs, suggested, wind, ... }` | the ball and the pin go where the host has them, the tabs show `clubs` (his bag: name, full carry after his mods, the putter's fitting), the suggested club is in hand. Held while a shot plays back |
| view to host | `{ v: 1, t: 'input', input: { holeIdx, stroke, club, aim: [x, y], power } }` | sent at the strike (metres in the host's frame; power is the model's: 0.3..1 of the carry, a putt 0.5..1.5 of its length to the pin); the ball stays put. After 5 s without an answer it says "Waiting for the course..." and keeps waiting |
| host to view | `{ v: 1, t: 'shot', flight, flightT, bounces, roll, rollT, rollZ, rest, holed, penalty, ... }` | the owner's stroke is played back: the flight with the ball camera, a thump at the landing and each bounce, the roll, then the ball lies at `rest`. Anyone else's is ignored until T425 |
| host to view | `{ v: 1, t: 'holeEnd', hole, par, strokes, last }` | the score is said; after the last, the view waits for Escape |

- Keys 1 to 9 and the mouse wheel over the tabs change club; B (drop) and the gimme are the host's to decide, so they do nothing here.
- The aim (T420) draws the host's numbers for the club in hand: the arc to `playsM` times the power plus `sideM` (the wind's and the slope's push, both along the suggested line), and a ring of one standard deviation: `scatterM / 2` across the line and `longM / 2` along it, times the power. A better club or a steadier golfer draws a smaller ring.
- The gate checks it (`HOST_PLAY` in `harness.mjs`): a turn with a made-up bag, the tabs, the ring's size and that a steadier club tightens it, one input and a wait with the ball still, a canned shot flown with the ball camera and the ball exactly at its rest, and the next turn from there. Pictures: `--scenes host` (also `host-aim`, `host-flight`, `host-rest`; the aim itself is on the full-size layer, which the harness pictures do not show).

## Cart tracks without stripes (gen-30, 2026-11-12)

`pressCart` lays the wheels' tracks all the way from where the cart was a moment ago to where it is now. Stamped only where it stood each frame, a moving cart left a stamp, a gap, a stamp, and its tracks came out as stripes across them (it looked like two surfaces fighting for the same pixels).

## The player's render distance (gen-31, 2026-11-12)

A slider in the style menu, 150 to 400 m in steps of 25 (260 is the game as it was made), kept in `localStorage['cinderlinks.view']`. `setDetail(R)` sets how far the land and its trees are drawn (`DFAR`), thins the haze to suit (`HZK`), carries the standing grass out in proportion (`GRASS_FAR`), and past 260 m lets the painted ground reach farther too (`DNEAR`, 30 m rising to 60 m at 400), with the lists of ground to ask for (`nearList`, `farList`) and the memory limits following. Measured in the browser pane at the first tee: 260 m, 60 frames a second, ground 8.6 ms, 436 MB; 400 m, 57 frames a second, ground 11.2 ms, 573 MB (while other work was loading the PC).
- Past 260 m the standing grass is carried to within 10 m of the render distance (390 m at 400), and far tufts of the taller grass keep one pixel of height so they do not go flat.

## Simple grass everywhere (gen-32, 2026-11-12)

At the owner's word the middle land's plain grass (tile colours, standing blades in tufts) is now drawn from the golfer's feet out (`SIMPLEG`, default on; the "Simple grass everywhere" box under Render distance in the style menu turns the painted near ground back on; kept in `localStorage['cinderlinks.simple']`). Close to the golfer the land is read along lines square to the view, going over to rings between 20 and 34 m (`rw` in `midSweep`: the rings round the golfer are too small to read by near him), and the middle sweep's rows are at least 3 cm apart. With it off, nothing changes from gen-31. Lost while it is on: the camera's cutaway through hills, cliff faces close by, flowers and pressed cart tracks painted into the ground.
- gen-33: with the simple grass on, the tiles' grass reaches as far as the render distance allows, to 220 m (`GM` in `drawGround`), the far field only beyond; tiles are kept to match (up to 1100); no detailed ground is painted or asked for. The camera comes no closer than 18 m behind the golfer (`CAMMIN`; the ball camera keeps its own).
