# Painted ground: the art the game still needs (T128)

The owner, 2026-10-25: "golf and lawns and map everything using the drawn grass art", then "i dont want to see old textures anymore".
Since T128 every grass, sand, water and wall surface wears a hand-painted family (`src/game/painted-surfaces.json`, edited in the
studio's **Painted** tab). The surfaces below have **no painted art yet**: until a set arrives they keep their old photo or procedural
texture (or, for the soils, borrow the earth cut face, which is the wrong view and light). Each request is one **three-level set**, in
the same spatial scales as the grass families of `art/theme-consistency/generated/ground/new-painted-spatial-scales-20261025.json`.

For the grass families and the older prompt sheet see `docs/art/GRASS-PROMPTS.md`; for the course walls' cut faces `docs/art/WALL-PROMPTS.md`.

## How the game lays a set (T128)
- **Three paintings of real ground coverage**, each 1024 x 1024 px: **near 40 m** a tile (half a town block), **mid 320 m** (half a town),
  **far 4096 m** (the whole map, laid once). Each level is drawn at its declared metres; the game crossfades near to mid at about 12.6%
  zoom and mid to far at about 1.25% (the planner map).
- **No repeat, ever:** a level smaller than the view is laid in soft, shifted patches with a slow colour drift (never turned or mirrored, so
  the painted light stays at the upper right). So: no strong single stroke direction across the whole tile, no isolated motif that would
  be recognised twice, no stripes (the game adds mowing stripes and road markings itself).
- **The three levels must match:** the same palette, the same mean colour and brightness, or the crossfade shows a jump.
- **Light:** one sun at the upper right (shadows at 145 degrees), soft relief lit on its upper-right side; no cast shadows of objects,
  even overall brightness (the game adds its own light and shade).

## Where the files go
1. Save each set as `art/theme-consistency/generated/ground/painted-scaled/<material>-v<n>/near.png`, `mid.png`, `far.png` (1024 px,
   seamless on both axes), each with a `<level>.provenance.json` holding the prompt and `"metresPerRepeat": [40, 40]` (320, 4096).
2. Add the material to `FAMILIES` in `scripts/assets/prep-painted-families.mjs` (id, plain name, kind, folder, default picks) and run
   `node scripts/assets/prep-painted-families.mjs`: it writes the WebP paintings and `src/game/painted-families.json`.
3. Give the surface a look in the studio's Painted tab (or add the texture ids below to its entry in `src/game/painted-surfaces.ts`
   SURFACES), then Save: a dev game takes it at once.
4. Run the no-repeat check: `node scripts/perf/grass-repeat.mjs <dev server url> --families <id>` (every judged value at most 0.2).

## STYLE (paste first, every time)
```
Hand-painted stylized game material in the environment-art style of World of Warcraft / Hearthstone: broad confident brush masses, soft
value gradients, bold readable painted shapes, warm colours, low-frequency detail, no photographic noise. Seen from DIRECTLY ABOVE
(orthographic top-down, no perspective, no horizon, no vignette, no frame, no text, no objects). Seamless and tileable on BOTH axes: the
left edge continues into the right and the top into the bottom. Aperiodic: no obvious repeating isolated motif, no bands. One fixed sun at
the SCREEN UPPER RIGHT: small relief lit on its upper-right side with soft lower-left shade, no cast object shadows, even overall
brightness. Fill every pixel: an opaque 1024 x 1024 square PNG.
```

## COVERAGE LEVELS (paste after STYLE, then one material line; make all three)
```
Make this material as a SET OF 3 IMAGES with the same palette, mean colour and brightness, each covering a real area of ground:
- NEAR: the tile covers 40 x 40 METRES (half a town block; 1 m is about 26 px). Full painted detail at true size: every stone, crack,
  chip or clod sized for 40 m across.
- MID: the tile covers 320 x 320 METRES (half a town; 1 m is about 3 px). The small detail is below a pixel: paint soft aperiodic
  colour and density patches mostly 5 to 20 metres across, never giant close-up features.
- FAR: the tile covers 4096 x 4096 METRES (the whole map). Only quiet colour fields mostly 70 to 200 metres across, the material's
  average colour with restrained variation.
```

## The requests

| # | Material | The game's textures it replaces | Where it shows today |
|---|---|---|---|
| 1 | Asphalt | `asphalt`, `asphaltPatched`, `asphaltWorn`, `lotAsphalt`, the road mosaics | roads, car parks, drives |
| 2 | Concrete | `concreteStained`, `concreteCracked`, `concreteOld`, `concreteWeathered`, `pad`, `paving`, `slabs` | pads, sidewalks, paved lots |
| 3 | Gravel | `gravel`, `chipSeal`, `roadgravel` | gravel roads, chip seal, gravel lots |
| 4 | Mulch | `barkMulch`, `woodChips`, `pineStraw` | garden beds, tree rings (Paint tool) |
| 5 | Worn path | `spectatorPath`, the `path-worn` preset (borrows the earth cut face) | spectator paths, dirt cart paths |
| 6 | Rock | `rock` (procedural) | the map's steep faces |
| 7 | Top-down soil | `dirt`, `rockyDirt`, `rockyDirtAlt`, `growSoil`, `bank`, `creek` (all borrow the earth cut face) | bare soil, grow-in, river banks, creek beds, the living ground's bare dirt |
| 8 | Farm crops | `field` (borrows the earth cut face) | farm fields |

One line for each (paste after STYLE and COVERAGE LEVELS):

**1. asphalt**
```
Material: hand-painted dark asphalt road surface seen from above: fine dark-grey aggregate painted as soft speckled masses, a few faint
paler patched rectangles and darker oil-soft stains, even value; no lane markings, no kerbs, no cracks pattern across the whole tile.
```

**2. concrete**
```
Material: hand-painted pale concrete slab seen from above: warm light grey with soft trowel marks, faint stains and a few hairline
cracks; no joints or grid lines (the game draws the slab joints), no kerbs.
```

**3. gravel**
```
Material: hand-painted compacted grey gravel seen from above: small rounded stones in broad painted groups of warm and cool greys, a
little pale dust between them, a few larger pebbles; no ruts, no tyre tracks.
```

**4. mulch**
```
Material: hand-painted garden mulch seen from above: warm brown bark chips and a few pine needles in soft clumps, darker damp gaps,
an even spread; no plants, no edging.
```

**5. worn path**
```
Material: hand-painted trodden earth path seen from above: packed light-brown soil, smooth and slightly polished where it is walked,
a few small pebbles and sparse grass tufts at the very edges of patches; no footprints, no edges or borders (the game shapes the path).
```

**6. rock**
```
Material: hand-painted weathered rock seen from above: broad flat facets of muted grey-brown stone with soft cracks, a little moss and
lichen in the hollows, the facets lit on their upper-right sides; no single boulder outline.
```

**7. top-down soil**
```
Material: hand-painted tilled garden soil seen from above: crumbly warm-brown clods and soft furrow-less earth, a few small pebbles and
roots, faint darker damp patches; no grass, no seeds, no rows (the game adds sprouts and furrows itself).
```

**8. farm crops**
```
Material: hand-painted farm field seen from above: soft crop rows of young green shoots and golden stubble in broad painted bands that
bend gently and never line up across the tile, warm soil showing between them; no tractor tracks, no fences, no field edges.
```
