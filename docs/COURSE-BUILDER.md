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
  Not undoable: style edits. **Open for C2:** the coder's generated course (`golf/paintcourse.ts`) paints surfaces per course, not per
  hole, so a new golf game's strip shows 0 holes started and the brush does not join the generated fairways; C2's hole derivation
  should tag them (or the strip should read `holes.ts`).
- **C2:** auto pin and tee markers; `holes.ts` reads the tagged areas: par, length, checks in the hole strip and the inspector.
- **C3:** Plan and Hole focus views; the overlays.
- **C4:** Plants tab (scatter brush, furniture), "Save hole as preset N" in the game.
- **C5:** costs, grow-in, land buying (GOLF-PLAN G2 / G5 numbers).

Ownership: these are the coder's files (App.tsx, engine.ts, paint-tool.ts); the owner asked the art chat to plan and build the builder
(2026-10-21 night), so the art chat builds C1 and records each step here and in SECOND-AGENT.md; the coder may take over C2 onward.
