# The Course builder: its own tool, components and views (plan, 2026-10-21 night)

The owner: "plan out a better UX with multiple components and different views so it is more user friendly. The golf course builder
is separate from the painter." This replaces GOLF-PLAN 4.5's "Course mode inside the Paint tool": the **Paint tool** stays the generic
ground painter (Draw / Pick / Erase, every texture), and the **Course tool** is a new rail button (key C) for building holes.

## 1. Principles
- **One click to start:** pick a surface and paint at once, always for the **current hole**.
- **The hole is the unit.** Everything you paint or place belongs to a hole (1–18); the hole strip shows every hole's state at a glance.
- **Helpers do the fiddly parts:** borders come with the preset (fringe, first cut, bank, rough lip); a green gets its pin, a tee its
  markers, automatically; par and length are derived.
- **Nothing is final:** undo (Ctrl+Z) for every course action; every piece stays editable (shapes have handles, presets are editable).
- **Two builders, one data model:** the studio's Holes tab (18 preset holes) and the game's Course tool both edit holes made of tagged
  Paint areas (`hole`, `kind`) and props, so a preset placed in the game is an ordinary hole you can keep editing, and a hole built in the
  game can be saved as a preset.

## 2. Screen components (React, each its own file under `src/ui/course/`)
| Component | Where | What it does |
| --- | --- | --- |
| **CourseRailButton** | left rail, after Paint | opens the Course tool (key C) |
| **HoleStrip** | top centre, under the HUD | chips 1..18 + "New hole": number, par, length, a warning dot (no pin, no tee, invalid); click = current hole and the camera goes there; drag to reorder (renumber) |
| **ToolPalette** | left panel | tabs: **Build**, **Hole**, **Presets**, **Plants**, **Land** (below) |
| **ViewSwitcher** | top right of the map | **Game** · **Plan** · **Hole focus** (section 3), plus overlay toggles |
| **HoleInspector** | right panel | the current hole: par, length per tee (m / yd), its checks as a checklist, its surfaces' areas and cost, grow-in; "Course stats" opens the course summary |
| **CourseStats** | right panel (second page) | holes, par, total length, rating, quality, upkeep, the tier's requirements as a checklist |
| **HintBar** | bottom (exists) | the active tool, the hole, and the keys |

### The palette's tabs
- **Build:** surface buttons with photo swatches: Fairway, Green, Tee, Rough, Bunker, Water, Cart path, Fescue, Landscaping (pine
  straw, mulch, flower bed). Two ways to lay them: **Brush** (round iso brush, size, Rub out / Alt; done) and **Shape** (click corners,
  then handles; today's Draw). "Edit preset" opens the surface's style (texture, border, border texture, corner radius, tone).
- **Hole:** tee markers (back / middle / forward), pin, aim point (doglegs), renumber, delete hole, "Save hole as preset N".
- **Presets:** the 18 preset holes from the studio as thumbnails (empty slots greyed); click one, the ghost follows the cursor, R turns,
  click places it as the current hole (or the next free number).
- **Plants:** a **scatter brush** for trees (density slider, tree mix: pines / broadleaf / autumn), bushes and flower beds; click-place
  furniture (benches, ball washers, bins, tee signs, flagpoles).
- **Land:** owned land, "Buy this block" (GOLF-PLAN 4.4).

## 3. Views
- **Game:** the normal view, with the Course overlays on top.
- **Plan:** a flat, top-down-coloured course map (surfaces as flat colours, hole numbers in circles, playing lines tee → aim → pin,
  routing arrows from each green to the next tee, corridors as translucent bands). The best view for laying out 18 holes.
- **Hole focus:** the camera frames the current hole and dims the rest; "," and "." step to the previous / next hole.
- **Overlays** (toggles, any view): playing lines, corridors (60 m), yardage marks (100 / 150 / 200 m from the green), owned land,
  grow-in state, spectator space.

## 4. Keys
1–9 surfaces · [ ] brush size · Alt-drag erases · R turns a preset · , . previous / next hole · V cycles the views · Ctrl+Z / Ctrl+Y
undo / redo · Esc back to the surface brush, then out of the tool.

## 5. A first hole, step by step (the flow to test against)
1. Course (C) → hole 1 is current. 2. Build → Tee: one dab (markers appear). 3. Fairway: drag down the hole (first cut comes with it).
4. Green: a dab at the end (fringe and pin appear). The strip shows "1 · par 4 · 382 m"; the inspector's checks go green.
5. Bunker / Water: dabs beside the landing zone. 6. Plants → scatter trees along the sides. 7. "+" → hole 2, repeat; or Presets → pick
one and click.

## 6. Build order (each step browser-checked and landed on main)
- **C1 (DONE 2026-10-22, on main, browser-checked):** the Course rail button and tool; the palette's Build tab (the golf brush moves out of Paint) and Presets tab (the Golf
  hole mode moves out of Paint, with the 1–18 picker from the studio's `hole-presets.json`); the hole strip (numbers only); undo.
  As built: the Course tool (key C; Paint moved to A) drives the same `PaintTool` (`course` flag; `enterCourse` / `enterPaint`); the panel is
  `src/ui/course/CoursePanel.tsx` with the hole strip inside it (`HoleStrip.tsx`, two rows of 9: over the map it hid under the event card);
  Build = the surfaces as **Brush** or **Shape** (Shape = Draw in the surface's preset style, tagged with the hole and kind), keys 1–7;
  Presets = Generated or studio slots 1–18 (a slot's props keep their sprite, flip and scale), placed as the current hole or the next free
  number, areas tagged by kind (`kindOfTex`); Plants = the plant brushes (they stay in Paint too). **Undo / redo** (Ctrl+Z, Ctrl+Y or
  Ctrl+Shift+Z, and panel buttons) in `PaintTool` for every stroke, shape, preset, erase, handle drag and planting: area snapshots by
  save tuple, the engine's prop journal (only the props the action itself added or removed), and refunds of what a shape cost.
  Style edits are undo steps too since T359 (see below). **Open for C2:** the coder's generated course (`golf/paintcourse.ts`) paints surfaces per course, not per
  hole, so a new golf game's strip shows 0 holes started and the brush does not join the generated fairways; C2's hole derivation
  should tag them (or the strip should read `holes.ts`).
- **C2 (DONE 2026-10-22, on main, browser-checked):** auto pin and tee markers; `holes.ts` reads the tagged areas: par, length, checks in the hole strip and the inspector.
  As built (`src/game/golf/holeview.ts`, pure): after every Course change, undo and redo the engine fits each hole's markers
  (`markerPlan`): a hole with a painted green gets a pin on it (a placed preset's flag spot when that is on the green), a hole with a
  painted tee gets back / middle / forward markers along it toward the pin; markers already on them stay (so the Holes tool's moves
  stay), and markers placed this way (`auto`) go when their green or tee does. A golf game's painted course is tagged by hole on load
  (`tagByHole`: green by its pin, tee by its markers, other course surfaces by the nearest playing line within 160 m; a hole tag only).
  The strip has green / amber dots, tooltips and par and length totals; the inspector (`HoleInspector.tsx`) shows par, back and member
  length (m, yd) and the checklist (green, tee, fairway unless par 3, pin on the green, tee markers on the tee) plus `deriveHoles`'
  warnings. A classic game works the markers out for the view only. **Not yet:** aim points for doglegs (a bent fairway can read
  "off the course"), re-aiming tee markers when the green moves.
- **C3:** Plan and Hole focus views; the overlays.
- **C4:** Plants tab (scatter brush, furniture), "Save hole as preset N" in the game.
- **C5:** costs, grow-in, land buying (GOLF-PLAN G2 / G5 numbers).

Ownership: these are the coder's files (App.tsx, engine.ts, paint-tool.ts); the owner asked the art chat to plan and build the builder
(2026-10-21 night), so the art chat builds C1 and records each step here and in SECOND-AGENT.md; the coder may take over C2 onward.

## 7. Menu settings are undo steps; the surface panel opens on the Course default; mowing lines (T359, #1006, 2026-11-08)
- **Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z) also undo and redo the build menus' settings**, on the same stack as the ground edits, in time order
  (`PaintTool.setting` / `endSetting` / `setApply`, `src/game/paint-tool.ts`): a texture pick, its size, angle or pan, the border texture, the
  exposure, the blend, Round off, This hole / Course default, Apply to all holes (one step), the Edges sliders, the brush's shape and size,
  Layer under / Replace, a grass of your own, the mowing lines. A step keeps only the items it changed (the brush presets by surface, the looks
  book by owner, a few flags). A slider's drag is one step: the page tells the tool when a slider is held (`src/ui/setting-hold.ts`,
  `PaintTool.holdSetting`; the Pan texture drag holds itself) and the gesture closes on release. A text field keeps its own undo
  (`src/game/text-entry.ts isTextEntry`; the engine's `keyDown` lets Ctrl+Z through from a slider, tick box or button, which keep the focus after a click).
- **Course > Holes > Shape by hand > <surface>** calls `PaintTool.openSurface(kind)`: the brush armed, the Course default the owner of the look, the
  panel in focus (`focusWanted`, taken once by `SurfaceSwatches`); `‹ All surfaces` still goes back.
- **Mowing lines** (`src/ui/course/MowingLines.tsx`, in the surface panel under This hole / Course default, for the fairway, green, tee, rough):
  a `mow` field on the look (`src/game/mow-lines.ts`: on / off, pattern along the hole / straight / checkerboard / diamond, band width, light and
  dark strength, angle; every field absent is the course finish's own, `course-finish.ts mowSpec`). It is saved with the look (the Course
  default's in the browser, each hole's in the game save), sent to the chunks per hole (`CourseLooks.mow` -> `stripeAreas` -> `CourseLayer.stripes[].m`)
  and baked by `renderer.ts courseStripes` / `mowBands` (the texture made lighter or darker, never a wash; a checkerboard is two crossed
  families of bands XORed). The crew's passes follow a hole's own band width. The cause of "I can't edit them any more": the only in-game way
  to set the mowing direction was Greenkeeping's Grass care (hidden by `GREENKEEPING = false`, 17965bb, 2026-10-27, an hour after T218 made the
  fairway's stripes automatic with their look in the Studio alone); nothing was removed from the Fairway panel.

## 8. Tees: the green's grass, the bunker's wall (T364, #1019, 2026-11-09)
The owner, 2026-11-08: "replace grass on tees with the green grass but without any mow lines" and "use the same texture the bunker uses for its walls for the
elevated tee walls".
- **The tee's grass is the putting green's.** `painted-surfaces.json` gives the Tee surface the green's look (`green-concept-run`; it wore the fairway's,
  `fairway-concept-run`). The tee keeps its own texture ids (`golfTee`, a preset for the `tee` surface), so costs, grow-in, kinds and the hole tags are
  untouched; only the painting changes, wherever the tee's look is laid (the course grid, painted tee areas, the Paint panel's swatches and pucks). No mowing
  lines: the tee's Mowing lines are Off unless a look turns them on (`course-finish.ts mowSpec`, pinned in `tests/tee-look.test.ts`). The Grass setting
  `photo` still lays the old tee photo (it is the "as before" setting for every surface). The range's turf tee box already wore the green's grass.
- **A raised tee's sides wear the bunker's wall** (`src/game/tee-wall.ts`, painted by `renderer.ts courseBanks` for the rock form, a tee from `ROCK_FROM`
  = 0.5 m up: the default 0.6 m tee and every taller one; a low tee is still a grass bank, "a flat tee"). The picture is the Bunker look's Cut wall by
  default (`bunker:wall-earth`, the pack's `wall-earth.png`), decoded by the ground workers with the painted pictures (`Textures.preparePainted`'s
  `pictures`), laid in screen space at the scale the approved bunker lays it (7.45 m across a repeat), over the whole face, opaque. The light is the bunker
  stage's wall shader (`stage-baker/wall-renderer.js`: `.28 + .74 x light`, mixed with .95 by the Shadow strength 1.252 / 1.5): per light step a cool
  multiply of the share of the colour that step keeps (a face turned from the sun at the upper right the darkest, one turned to it the picture as it is),
  a darker strip under the grass lip and a darker foot, the picture's grain in every step. The tee's contact shade, cast shadow, grass crest with its
  tufts and the stairs are as T127 had them; the hash-placed stones are not drawn (the picture has its own pebbles).
- **The old look stays an option:** the course finish's `teeWall` (`'bunker'` by default, `'rock'` for the painted earth and set stones; the file's
  `course` block, clamped by `clampCourseFinish`), and the file's `surfaces.tee` look set back to the fairway's. `oldTeeSurfaces(file)` makes both at once;
  the dev server's `?tee=old` lays it (`painted-surfaces-live.ts teeOldDev`), for A/B shots and the bench on one build. T372 (#1027) adds the cliff face as
  a third `TeeWall` and moves the choice into the tee's look.
- **Check:** `node scripts/dev/tee-look-shots.mjs --base http://localhost:<port>/ --out E:/ClaudeTemp/T364` (the old nine's tee, raised and flat, at 30% and 15%,
  before | after sheets).
