# The concept look: Maple Falls (the owner's target, 2026-10-27)

The owner: "this is the look and feel we need to get to". The reference is [concept/maple-falls-concept.webp](concept/maple-falls-concept.webp):
a grown club in year 3, October, at golden hour. Give it to every art job as the style reference after `theme-authoritative.png`. Give it
to RUN too, when RUN paints a ground layer into a game screenshot (GROUND-TEXTURE-METHOD.md), so the grass comes out in the concept's colours.

## What makes the look (in order of how much it matters)

1. **Autumn trees on green grass.** Every lawn, verge, rough and open field is green. The colour comes from the trees: red and orange
   maples, gold birches, russet oaks, dark spruces and pines. Our ground is gold (the map's golden fescue) and orange-brown (the desert
   blocks, #625), so our orange trees disappear into it. The T220 shots, taken before #625 with green blocks, are already close.
2. **Golden-hour light.** Low warm sun from the upper right, long soft shadows to the lower left, warm highlights and cool deep shadows,
   rich colour. The lamps and windows are already lit and glow. Slightly soft at the screen's edges, which gives a miniature feel.
3. **Lush, striped fairways.** Wide light and dark mowing bands that follow the hole. A clear darker first-cut collar. Bright cream bunkers
   with a grass lip and a dark rim on the far side. Smooth, finely striped greens.
4. **Water with stone edges.** Deep teal water that reflects the trees. Natural boulder rims, reeds and flowers. In town, a round pond with
   a fountain jet. The lake shore is rocky.
5. **Density.** Houses close together with hedges, fences, flower beds and drives. Car parks full of colourful cars. Trees lining every
   street and framing every hole. People on the course and on the clubhouse patio.
6. **Clean streets.** Dark asphalt with white edge lines and dashed centres, zebra crossings at junctions, pavements with lamp posts and
   street trees.
7. **The club at the centre.** A big red-brick clubhouse with many gables and a slate roof, a patio with red umbrellas, flower beds, and a
   paved plaza with the fountain pond. The covered range bays face a long striped range.
8. **Growth you can see.** Bought land is bare dirt inside a white dashed line, with an excavator, a timber frame going up and stacks of
   lumber.
9. **The UI.** Very close to ours already: dark panels, gold serif titles, the maple leaf, the isometric minimap at the lower left. The
   concept adds a top bar of stat chips (money with its monthly change, reputation, golfers a month, course rating), and a build panel
   whose tools are small illustrated isometric scenes.

## What we already have

Autumn trees and conifers, colonial houses with warm windows, lamps, the sun at the upper right, fallen leaves (T220 #633), fairway stripes
(T218 #609), the clubhouse, the covered range bays, patio sets, the dark-and-gold UI with an isometric minimap, and the town name
"Maple Falls".

## The code work (recommended order)

| # | Work | What changes | Size |
| --- | --- | --- | --- |
| 1 | **Green ground** | Painted mapping only (`painted-surfaces.json`): the map's open ground, the town blocks and the yards go green. Golden fescue stays on the course's fescue and native areas; the desert stays on the range start (T223) and the waste areas. Use today's green families until the concept-coloured ones (items 149-153) land. It reverses #625 and the map half of #621, so it is the owner's call. | an hour |
| 2 | **Golden-hour grade** (done, #654) | One full-screen pass after the scene: a tone curve (warm highlights, cool deep shadows, a little more saturation and contrast), a soft vignette, an optional edge blur for the miniature feel. It is a curve, not a tint, so texture detail stays (the no-flat-wash rule). A gear-menu switch. | a ticket |
| 3 | **Fairway bands and collar** (done, #660) | T218's stripes wider and stronger. The first-cut ring round fairways and greens clearly darker. Greens get fine stripes. | tuning |
| 4 | **Bunker lips** (done, #660) | A dark textured crescent inside the far (upper right) rim, a light near lip, a thin raised grass lip (the textured-shadow rule). | a ticket |
| 5 | **Pond edges and water** (water: done, #679; stone edges, lily pads and the fountain: done, T231 #671: Decoration › Water's Stone pond edge, Fountain jet and Fountain pond, golf/ponds.ts) | A pond edge style (natural reeds, or boulders as in the concept) that lays boulders and reeds along the edge by itself. Water darker teal, deeper in the middle, with T215's camera reflection (T230: art 154 on ponds and rivers; `water-look.ts` deepens it toward the middle, lightens the edge, reflects the shore's trees and buildings, and T215's switch lights it with the glint; Studio > Painted > Water look). A fountain pond as one placeable town and clubhouse feature. Still needs art 158-160 for the edges and the fountain. | a ticket |
| 6 | **Trees frame the holes** (done, #677) | When a hole is built, an optional priced tree line (spruce, pine and maple clumps) along the outer edge of its rough. | a ticket |
| 7 | **Streets and car parks** (done, #667) | Zebra crossings at junctions and white edge lines. Car parks draw parked cars to match their count (the range already shows "P 6/44"). | a ticket |
| 8 | **Fuller yards** (done, T231 #671: clipped hedges, autumn shrubs and mums on house lots by draws of their own, lots/compose.ts kitYard; the hedge also a run in Decoration) | The lot composer lays hedges, flower beds and fences once art 162-165 lands. | after the art |
| 9 | **Building sites** (T232 #673, running) | Bought land shows bare dirt inside a white dashed line. Buildings rise with the construction kit (art 168-172). | a ticket |
| 10 | **UI** (done, T233 #674) | Stat chips in the top bar (money and its change a month, reputation, golfers a month, course rating: `ui/StatChips.tsx`, `golf/topstats.ts`). The build tools as illustrated tiles (art 174, `ui/tool-tiles.ts`): the Course and Facilities flyouts lay a level with tiles out as a grid of them. | a ticket |
| 11 | **Life on the course** (T211 #655 done; T208 #553 running) | Golfers playing and carts on the paths: already queued as T208 and T213. | queued |

## The art (GOLF-ART-LIST section 12, items 149-175)

Items 149-157 are ground textures. Make them by the owner's method with the concept as RUN's style reference. Items 158-175 are kit,
plants, buildings, construction pieces, a cart and UI pictures. Items already on the list that the concept also needs: 42 pond rocks and
reeds, 36 and 37 boulders and rock clusters, 45 and 46 lamps, 56 the pro's cart, 86 flower beds, 93 patio sets with umbrellas, and 19 the
hitting mats (made).
