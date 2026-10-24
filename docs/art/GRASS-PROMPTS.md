# Ground textures in the game-art style: the prompt sheet (T082)

The owner, 2026-10-24: "We want Blizzard Entertainment style textures." Reference picture:
`art/reference/grass-style-blizzard-20261024.webp` (a green with two bunkers). Attach it to every request.

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
- CLOSE (the closest zoom): the tile covers 8 x 8 metres. Full painted detail: the individual clumps, strokes, flowers
  or pebbles described below.
- MID: the tile covers 32 x 32 metres. The same surface seen from further away: clumps merge into bigger painted patches,
  strokes are broader, and small details (flowers, pebbles) become tiny dots of colour.
- FAR (the district view): the tile covers 128 x 128 metres. Only soft painted colour fields and gentle light and dark
  drifts, no individual tufts or strokes.
The "Scale" line in the style block applies to CLOSE; MID and FAR follow the sizes above.
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

Scale: the tile covers 8 x 8 metres of ground. Keep shapes big enough to read when the tile is shown small.
Output: 1024 x 1024 px, PNG.
```

## Surfaces (paste one after STYLE)

**1. lawn (town lawns and base grass)**
```
Surface: neatly kept town lawn. Medium fresh green, short soft grass painted as small rounded clumps (20-40 px), gentle
light and dark green patches drifting across the tile, a few slightly yellower spots. Calm and even; no flowers, no stripes.
```

**2. meadow (parks, open land)**
```
Surface: open meadow. Light warm green with a touch of yellow, soft grass clumps (30-50 px) in loose swirls, sparse tiny
white and yellow flowers (a dozen per tile, 4-8 px), very gentle colour variation.
```

**3. rough (beside fairways)**
```
Surface: golf course rough, like the long grass around the green in the reference. Chunky clumpy tufts (40-70 px) with
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
Surface: golf fairway. Short, smooth, bright green mown grass with a fine soft painted grain (strokes of 8-16 px), very
subtle light and dark variation. NO mowing stripes (the game paints the stripes itself). Cleaner and brighter than the rough.
```

**6. first-cut (the band between fairway and rough)**
```
Surface: golf first cut. Like the fairway but a little longer and a little darker green, with a slightly coarser painted
grain (strokes of 12-24 px). No stripes.
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
Surface: sandy waste area. Pale dusty sand-dirt mix with scattered small painted pebbles (6-14 px), a few tiny dry grass
tufts and sparse dark specks. Rougher and drier than the bunker sand.
```

**12. dirt (newly seeded ground, before the grass grows)**
```
Surface: freshly worked and seeded soil. Rich warm brown painted earth with soft clods and furrows, fine pale seed specks,
and a very sparse sprinkle of tiny bright green sprouts (2-6 px). Inviting, not muddy.
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
