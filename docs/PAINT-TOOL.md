# The Paint tool (ground areas)

The owner's ask (2026-10-19): paint a solid shape with a brush; the area it surrounds is filled with pavement, gravel,
dirt or one of the road colours and textures. Simple controls to shrink or grow the texture, turn it to an angle, and
pick a small, medium or large border with its own texture. Pavement lines up with the iso perspective by default and
is adjusted after. "Same stuff we already have": the existing ground textures and the existing painting path.

## What a painted area is

A closed polygon on the ground (tile coordinates, 1 tile = 2 m), filled with one texture, with an optional border band
just inside its edge. It is decoration: it does not change traffic, lots, growth or what may be built on it.

```ts
interface PaintArea {
  id: number;            // 1..n, also the draw order (a later area paints over an earlier one)
  pts: number[];         // x0 y0 x1 y1 ... (tiles, 3..MAX_PTS points, rounded to 0.25 tiles)
  tex: PaintTex;         // the fill
  scale: number;         // texture scale, 0.25..4 (1 = the textures' native size)
  angle: number;         // texture angle on the ground, degrees, -90..90 (0 = along the iso grid)
  border: 0 | 1 | 2 | 3; // none, small (0.25 tiles = 0.5 m), medium (0.5 = 1 m), large (1 tile = 2 m)
  btex: BorderTex;       // the border's texture: any PaintTex, or 'kerb'
}
```

Textures (all already built by `textures.ts`, or drawn as the roads draw them):

| PaintTex | Looks like | Source |
| --- | --- | --- |
| `paving` | square pavers on the iso grid | screen texture `paving` |
| `slabs` | the sidewalk slabs (running bond) with grime | slab sprites + `grime`, as the sidewalks |
| `pad` | plain concrete | `pad` |
| `asphalt`, `asphaltDark`, `asphaltWorn` | the three road asphalts | the asphalt mosaic + the class tones |
| `roadgravel` | a gravel road's surface | `roadgravel` |
| `gravel` | the verge gravel | `gravel` |
| `dirt` | bare earth | `dirt` |
| `field` | ploughed rows | `field` |
| `grass` | the lawn (to cut a green into a plaza) | `grass` |

Border textures: every PaintTex, plus `kerb` (the curb's joint and cream top, as on medians and islands).
A `slabs` border lays one row of slab sprites along each edge (the sidewalk's `drawSlabs`), so a plaza can have a
sidewalk-style rim.

## Texture scale and angle

Ground textures come in two kinds and both keep working:
- **Screen textures** (paving, gravel, dirt, pad, field, grass, grime) are painted in screen space with the iso
  foreshortening baked in (`paving`'s joints are drawn through `isoAuthor`). The area's pattern transform is
  `G · T0`, where `T0` is the existing `screenPattern` transform (pattern px → tile space, continuous across chunks)
  and `G` = rotate(angle) · scale(scale) **in tile space, about the map origin**. Rotating in tile space (not screen
  space) keeps the perspective right: pavers turn on the ground, they are not spun on the screen.
- **Ground textures** (the asphalt mosaic, the slab grid) live in tile space already; `G` multiplies their transform.

Angle 0 is the iso grid: paving joints and slab rows run along the tile axes, like the existing sidewalks. That is the
default ("aligned to the perspective"); the player turns it after. Because `G` is about the map origin, two areas with
the same settings join without a seam.

## How it draws (the ground workers)

Painted areas ride the **lot ground channel** that car parks, toll plazas, lots and farms already use
(`setLotGround(key, patches)` → `GroundCache.lotGround` → the `lotground` worker message → `GroundPainter.lotPatches`):
- key `paint:<id>`, one patch per area;
- `LotPatch` grows: `pts` may be any polygon (it was always a quad), `tex` takes the paint textures, and an optional
  `paint: { s, a, b, bt, z }` carries scale, angle, border width (tiles), border texture and the draw order.

The ground cache already invalidates the old and the new boxes of an edited key, the workers already index patches
in a cell grid, and every worker replays the same edits, so painting, editing and erasing re-bake only the chunks
under the area, at once (no "rebuild ground" step).

Order in a chunk (`GroundPainter.paint`, step 1a): terrain → lot patches → **painted areas in id order** → bridge
decks → verges and sidewalks → roads. So paint goes **over grass and lot ground, under roads**: a road drawn across a
plaza paints over it with its curbs, as the owner would expect.

Per area: clip to the polygon; fill with the texture through `G`; asphalt tones as in step 5; the border as a band
`2 × width` stroked on the clipped edge (texture through `G`, `kerb` as `curbRing`, `slabs` as slab runs along the
edges); a thin dark rim inside the edge for the paved textures (as lot patches have). District chunks (lite) skip the
slab sprites (base colour + grime only, as the sidewalks do there). The planner map fills the polygon in the
texture's flat planner colour.

## Saving

A new optional field in the save, no version bump (like `parks`, `tolls`):

```ts
paints?: [tex, scale, angle, border, btex, pts][]   // ids 1..n in this order
```

Load rebuilds the areas and sends their patches; old saves have none.

## The tool (UI)

Tool **Paint** (key **C**, for colour; A is the camera; icon 🖌️), with three modes in its panel:
- **Draw** (default): click to drop corners; click the first corner, double-click or press Enter to close; Backspace
  removes the last corner, Esc cancels. **Press and drag** draws a freehand outline (the brush/lasso) that closes when
  the button is released. Corners snap to whole tiles while "Snap to grid" is on (default), else to 0.25 tiles; the
  lasso is simplified (Douglas–Peucker, 0.3 tiles).
- **Pick**: click an area to select it. The panel's settings then show and change that area (the ground re-bakes at
  once); Delete removes it.
- **Erase**: click an area to remove it (the hovered area is outlined red first).

Panel controls: texture chips; scale − / + (×1.25, 25%–400%) and a reset; angle slider (−90°..90°, 5° steps) with
"Grid 0°", "45°" and "Along first edge" buttons; border None / Small / Medium / Large; border texture chips.

**Preview** while drawing, in the road tool's style: the shape filled in the texture's preview colour at about half
alpha, its border band darker, an amber dashed outline and amber corner dots; when the shape cannot be placed the fill
turns red, the crossing edges are drawn red, and the reason shows beside the cursor.

## Validity (headless-tested, `src/game/paint.ts`)

- at least 3 corners, at most `MAX_PTS` (200);
- no two edges cross (the shape is simple);
- area at least 1 tile² (4 m²);
- every corner on the map;
- bounding box at most 256 tiles (512 m) a side (keeps one area's re-bake bounded).

Water, roads and buildings do not block painting (roads draw over it; props stand on it).

## The golf pivot: the Paint tool becomes the course builder (planned 2026-10-21, phase G2)

Design: [GOLF-PLAN.md](GOLF-PLAN.md) sections 4.1–4.5. What changes here:
- **Its own rail button** (done 2026-10-21; key C unchanged).
- **Photo textures** (done for Fairway, New sod and Rough, 2026-10-21): seamless photos laid in **ground space**
  (`GRASS_PHOTO` in `grass-art.ts`, `groundPattern` in `drawPaints`), so mowing stripes follow the map axes and the area's
  angle. Plain tiles for striped ones (a 12-tile period); hex-mixed in ground space (`Textures.mosaic` at 160 px a tile) for the
  rest. Full resolution, with the mip chosen by zoom times the area's scale, so scaling up stays sharp. **Next:** every Paint
  texture as a photo (`PAINT_PHOTO`; the RUN batch in GOLF-SPRITES.md section 6), **built lazily** per worker (only textures in
  use), because 20+ photo textures in each of three workers would cost hundreds of MB.
- **Golf surfaces** as texture chips: green, fringe, tee, fairway, first cut, rough, fescue, bunker sand, waste sand, water,
  cart path, pine straw, mulch, walkways, field parking. **Borders as collars**: a green with a fringe band, a fairway with a
  first cut, a pond with a bank, a bunker with a grass lip.
- **Smooth corners:** a per-area corner radius (0–30 m) that turns every corner into an arc (`roundCorners`), saved as an
  optional 7th tuple element. Built and parked on branch `claude/paint-wip` (commit `cda5446`): resume, typecheck, browser-check.
- **Shape editing (the owner, 2026-10-21):** a closed shape is **selected at once** with **transform handles**: corner handles
  to drag (snapping as when drawing), edge-midpoint handles that insert a corner, Delete or right-click to remove a corner (3 is
  the minimum), and a box with move, rotate and scale handles for the whole shape. Validity is checked live (red with the
  reason, as when drawing); the area re-bakes while dragging (throttled to a few bakes a second). Pick shows the same handles on
  any existing area. Undo covers each drag.
- **Tone filters (the owner, 2026-10-21):** per area, **Multiply** (darker) or **Lighten** (screen: lighter), a strength slider
  (0–100%) and an optional tint colour, applied after the texture in the area's bake (as the asphalt tones are today). Saved as
  optional tuple elements (mode, strength, tint).
  **T261 (#766, the owner 2026-10-29): Exposure replaces them.** One Exposure slider (and one Border exposure) multiplies the texture's
  own RGB by f, one stop darker (0.5) to one stop lighter (2), 0 in the middle unchanged: darker is a multiply of grey rgb(255f), lighter
  the drawn pixels added to themselves ('lighter' at f - 1), inside the same clip; no tint colour is drawn (`src/game/exposure.ts`). The
  save is unchanged: Darker at strength a reads as f = 1 - a (at least 0.5), Lighter as 1 + a, and the tint is kept but ignored. It is
  drawn on the course fills, feathers, spill and bands, the painted areas' fill and border, the cursor's puck and band, the swatch pucks
  and the My looks disc. The course finish's collar tone (course-finish.ts COLLAR_TINT) stays a multiply of its tint.
- **Shadow (T136, #260):** a slider under Border width (0 to 100%; the StyleEditor and My looks) gives a painted area an edge shade, so it
  reads as slightly raised under the sun at the upper right: a cool multiply inside the edges whose outside faces 145° on screen, full at
  the edge and fading inward over 2 to 3.5 m (a slow world-space noise varies the depth), and a light a 0.2 m gap inside the edges turned
  to the sun, textured by the area's own colours (T110). Both stay inside the area, so nothing lands on the course, a road or a
  neighbour; the light is left out on district chunks and far levels. Saved as optional tuple element 24 (missing: 0, the look before
  it); a change re-bakes the area's own chunks and is one undo step per slider drag (`paint-edges.ts` areaShadeImages,
  `renderer.ts` drawPaints and areaLight).
- **Costs and grow-in:** painting costs money by surface and m², with seed or sod; seeded areas show a grow-in look until ready
  (GOLF-PLAN 4.1). Erasing refunds nothing.
- **Hole objects** belong to the course tools beside Paint: tee markers, pins, hole numbers, aim points (GOLF-PLAN 4.2).

## Not in this step (open)

- **Cost.** Painting is free for now (decoration). Planned for G2: a price per m² by surface (GOLF-PLAN 4.1, open question 12).
- Editing an area's corners after placing: planned for G2 (shape editing, above).
- The bulldozer leaves paint alone (it removes roads and objects); erase is the Paint tool's own.
