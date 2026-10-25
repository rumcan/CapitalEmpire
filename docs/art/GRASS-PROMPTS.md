# Ground textures in the game-art style: the prompt sheet (T082)

The owner, 2026-10-24: "We want Blizzard Entertainment style textures." Reference picture:
`art/reference/grass-style-blizzard-20261024.webp` (a green with two bunkers). Attach it to every request.

## How the game lays a set (T082 integration, 2026-10-25)
- **Scale:** each image at its own pixels at its zoom level: close over 48 m, mid over 96 m, far over 192 m (1024 px each), crossfading
  between levels. The first set (`art/theme-consistency/generated/ground/painted-lod/grass-lod-v1`, painted as "8 m") is laid this way: at
  8 m every brush stroke was gone at the closest zoom and the grass read as flat lime.
- **No repeat, ever:** the game never shows a tile's period. It lays each image in soft round patches at random offsets, each turned by up
  to 36 degrees. So: paint light that still reads as upper right after a 36-degree turn, keep no single stroke direction strong across the
  whole tile (it shows as parallel streaks), and paint no stripes (the game adds mowing stripes on top, last).
- **Colour:** `scripts/assets/prep-painted-grass.mjs` makes the three levels one mean colour and grades them towards the style reference
  (HSL saturation about 68%, stroke contrast x1.2); any light or shade it adds follows the light rule (T110): light in proportion to the
  texture's own luminance, shade a cool multiply.
- **Check:** `node scripts/perf/grass-repeat.mjs` (on a dev server) bakes open ground at every zoom and fails when a period shows.

## How to use
1. Attach the reference picture.
2. Paste the **STYLE** block, then the **ZOOM LEVELS** block, then **one** surface block.
3. You get **3 images** for that surface, one per zoom level (close, mid, far), each at **1024 x 1024 px**. (The owner,
   2026-10-24: three images for three different zoom levels of each grass texture.)
4. **Check the seams:** tile each image 2 x 2 (or look at it in the studio). If an edge, a line or a repeating blob shows,
   regenerate it.
5. **Check the set:** put the three side by side, shrunk to the same size. Their average colour and brightness must match,
   or the game shows a jump when it blends from one zoom level to the next.
6. Save them as `art/ground-painted/<surface>-<close|mid|far>-v<n>.png` (for example `rough-close-v1.png`). Note the
   prompt you used next to them, in `<surface>-v<n>.txt`.

## ZOOM LEVELS (paste after STYLE, every time)

```
Make this surface as a SET OF 3 IMAGES, one for each zoom level of the game. All three show the same surface with the
same palette, the same average colour and the same overall brightness, so the game can blend from one to the next
without a visible jump. Each one is seamless and tileable on its own, 1024 x 1024 px.
The game shows each image at its own full size (one image pixel per screen pixel) when you are zoomed to its level,
and only shrinks it between levels, so paint every detail at the size it will really be seen:
- CLOSE (the closest zoom): 1 metre of ground is about 21 px, so the tile covers about 48 x 48 metres. A golf green
  30 m across would be about 650 px wide and a person about 38 px tall. Full painted detail at that size: the clumps,
  strokes, flowers or pebbles described below, sized like the tufts in the reference picture.
- MID (half that zoom): 1 metre is about 11 px, so the tile covers about 96 x 96 metres. Clumps merge into bigger
  painted patches, strokes are broader, and flowers or pebbles become single dots of colour.
- FAR (half again, and the district view beyond): 1 metre is about 5 px, so the tile covers about 192 x 192 metres.
  Only soft painted colour fields and gentle light and dark drifts, no individual tufts or strokes.
The pixel sizes in the surface lines below are for CLOSE.
```

## STYLE (paste first, every time)

```
Hand-painted stylized game texture in the style of Blizzard Entertainment ground art (World of Warcraft, Hearthstone):
bold readable painted shapes, broad confident brush strokes, soft value gradients, saturated warm colours, low-frequency
detail, no photographic noise and no realistic blade-by-blade grass. Match the attached reference picture's look exactly.

It is a SEAMLESS, TILEABLE square texture seen from DIRECTLY ABOVE (orthographic top-down, no perspective, no horizon,
no vignette, no frame, no text, no objects that stand out). The left edge must continue into the right edge and the top
into the bottom with no visible seam, and nothing may repeat in an obvious pattern when tiled.

One sun at the UPPER RIGHT: every clump, tuft or ripple is lit on its upper-right side and has soft shade on its
lower-left side. No cast shadows of objects, no spotlight, and an even overall brightness across the whole tile (no
bright or dark corner).

Scale: see the ZOOM LEVELS block (each image is shown at its own pixels at its zoom level, never stretched).
Output: 1024 x 1024 px, PNG.
```

## Surfaces (paste one after STYLE)

**1. lawn (town lawns and base grass)**
```
Surface: neatly kept town lawn. Medium fresh green, short soft grass painted as small rounded clumps (8-16 px), gentle
light and dark green patches drifting across the tile, a few slightly yellower spots. Calm and even; no flowers, no stripes.
```

**2. meadow (parks, open land)**
```
Surface: open meadow. Light warm green with a touch of yellow, soft grass clumps (12-24 px) in loose swirls, sparse tiny
white and yellow flowers (a few dozen per tile, 2-4 px), very gentle colour variation.
```

**3. rough (beside fairways)**
```
Surface: golf course rough, like the long grass around the green in the reference. Chunky clumpy tufts (16-32 px) with
bright yellow-green lit tips and darker blue-green gaps between them, a few tiny white and yellow flowers, lively but
not noisy. Deeper and more textured than the lawn.
```

**4. fescue (wild long grass on hills and in woodland)**
```
Surface: wild fescue, long golden-green grass. Long flowing painted strokes in soft swirling waves, some pale seed heads,
warm gold highlights and olive shadows, airy and windswept. Taller and wilder than the rough.
```

**5. fairway**
```
Surface: golf fairway. Short, smooth, bright green mown grass with a fine soft painted grain (strokes of 3-8 px), very
subtle light and dark variation. NO mowing stripes (the game paints the stripes itself). Cleaner and brighter than the rough.
```

**6. first-cut (the band between fairway and rough)**
```
Surface: golf first cut. Like the fairway but a little longer and a little darker green, with a slightly coarser painted
grain (strokes of 5-12 px). No stripes.
```

**7. fringe (the collar around the green)**
```
Surface: golf fringe or collar. Very smooth velvety grass, a shade darker and cooler than the green, extremely fine painted
grain. No stripes.
```

**8. green**
```
Surface: putting green, like the green in the reference. The smoothest, most velvety surface: bright lush green, an almost
flat painted finish with the faintest soft grain and gentle light and dark drifts. NO mowing stripes (the game paints them).
```

**9. tee**
```
Surface: golf tee box. Tight, short, very even mown grass, slightly more yellow-green than the fairway, fine painted grain.
No stripes.
```

**10. bunker-sand**
```
Surface: golf bunker sand, like the bunkers in the reference. Warm pale cream sand with soft painted grains and gentle
raked lines running in long, slow, parallel waves across the tile (they must continue across the tile edges). Subtle warm
and cool tints. No edge lip, no grass (the game paints the lip).
```

**11. waste (sandy waste area)**
```
Surface: sandy waste area. Pale dusty sand-dirt mix with scattered small painted pebbles (3-8 px), a few tiny dry grass
tufts and sparse dark specks. Rougher and drier than the bunker sand.
```

**12. dirt (newly seeded ground, before the grass grows)**
```
Surface: freshly worked and seeded soil. Rich warm brown painted earth with soft clods and furrows, fine pale seed specks,
and a very sparse sprinkle of tiny bright green sprouts (1-3 px). Inviting, not muddy.
```

**13. shore (wet ground at the water's edge)**
```
Surface: damp lakeside ground. Dark wet sand and mud with a soft sheen, small smooth pebbles and a few reed-like grass tufts.
Cooler colours than the dirt.
```

## Extra sheets (transparent background; replace the tiling lines in STYLE)

For these, paste STYLE but replace its "SEAMLESS, TILEABLE square texture" paragraph with "on a fully transparent
background, no ground". Leave out the ZOOM LEVELS block: one image each, which the game shrinks itself.

**14. grass tufts for edges**
```
A sheet of 16 separate painted grass tufts in a 4 x 4 grid, each 150-220 px wide, in the reference's style: lit on the
upper-right side, darker at the base, irregular rounded silhouettes, half of them rough-green and half lawn-green. These
overhang the edges of cut grass, bunkers and paths. 1024 x 1024 px PNG with transparency.
```

**15. bunker lip strip**
```
A horizontal strip, 1024 x 256 px, that tiles left to right: the edge of a golf bunker seen from above, like the reference.
A crisp dark brown dirt lip with small pebbles along the middle, sand fading out below it, and painted grass tufts
overhanging it from above, both edges fading to transparent. PNG with transparency.
```

**16. rocks**
```
A sheet of 9 separate chunky painted rocks in a 3 x 3 grid, each 180-260 px, with simple flat painted planes, lit on the
upper-right side and shaded on the lower left, warm grey with a little moss. 1024 x 1024 px PNG with transparency.
```
