# Course walls and water: the prompt sheet (T099)

The course stands in terraces now (T099): greens and tees raised, bunkers and ponds sunk, each step a kerb-like wall drawn
by the ground painter from the course outlines. The walls already draw with painted placeholder tones. This sheet asks for
the art that replaces those placeholders, and for the pond's water surface. Attach the owner's reference picture
(`art/reference/grass-style-blizzard-20261024.webp`) to every request, as in `docs/art/GRASS-PROMPTS.md`.

## Scale (measured in the game)

At the closest zoom (30%) on a dpr-2 screen (ground cache level 0.6):
- **Ground:** 21 px per metre, the grass sheet's CLOSE level.
- **Wall height:** 48 px per metre. The course walls stand twice their true height (`WALL_PX_PER_M` = 80 world px a metre in
  `src/game/ext/course-walls`) so the terraces read at 15% zoom too.

The walls as drawn at 30% zoom:

| Step | Height | On screen at 30% |
| --- | --- | --- |
| fairway above the rough | 0.05 m | 2 px |
| green above the rough | 0.25 m | 12 px |
| tee above the rough | 0.45 m | 22 px |
| bunker below the rough | 0.6 m | 29 px (41 px under a green) |
| pond below the rough | 0.8 m | 38 px (50 px under an island green) |

At 15% zoom each is half that. In the district view the walls are drawn as flat painted tones, without art.

## How the game uses the wall art

- The game lays each wall image in **screen space** at its own pixels at the closest zoom (one image px a screen px, at 48 px a
  metre), shrinks it further out, and never enlarges it. Because it is laid in screen space, it must tile in both directions.
- The game paints these over the art:
  - the grass lip and its overhanging tufts at the top;
  - the dark root line under the lip;
  - the light, by each face's direction against the sun at the upper right;
  - the darkening toward the foot, and the contact shadow.

  So **each image must be uniform from top to bottom**: no lip, no ground line, no light-to-dark gradient.
- Lighting: **flat, even and neutral**, like an overcast sky. Use a mid-to-light value, because the game multiplies its own shade
  in. No baked sun and no cast shadows. At most, a very soft upper-right light on single pebbles.

## STYLE (paste first)

Paste the STYLE block from `docs/art/GRASS-PROMPTS.md`, with its second paragraph replaced by this one:

```
It is a SEAMLESS, TILEABLE square texture of a VERTICAL CUT FACE seen STRAIGHT ON (a front elevation, no perspective, no
horizon, no top edge, no ground line, no vignette, no frame, no text). The left edge must continue into the right edge and
the top into the bottom with no visible seam, and nothing may repeat in an obvious pattern when tiled. Even, flat, neutral
lighting (overcast), the same brightness top to bottom; the game adds the light, the shade and the grass lip itself.
Scale: 48 px per metre. Output: 1024 x 1024 px, PNG.
```

## Wall faces (one image each)

**1. turf-wall** (the banks of tees and greens)
```
Surface: the earth face under a golf green's turf. Rich dark-brown topsoil (loam) with fine pale roots threading through it,
a few small pebbles (4-10 px), occasional moss-green flecks. Soft painted clods, no hard cracks.
```

**2. bunker-wall** (a bunker's cut face, under its turf lip)
```
Surface: the cut face of a golf bunker. Compacted pale-tan sand with streaks and pockets of brown soil, small pebbles
(4-10 px), a few fine roots near random spots. Warmer and lighter than the turf wall.
```

**3. bank-wall** (a pond's wall down to the water)
```
Surface: a wet pond bank. Dark wet clay-soil with a soft sheen, small smooth stones (6-14 px), a few thin dark roots. Cool
dark browns with a hint of olive. Wetter and darker than the turf wall.
```

Save them as `art/theme-consistency/generated/ground/course-walls/<name>-v<n>.png` (for example `turf-wall-v1.png`), with
the prompt next to each as `<name>-v<n>.txt`.

## Water surface (three zoom images, as the grass)

Use STYLE and ZOOM LEVELS from `docs/art/GRASS-PROMPTS.md` unchanged (seen from directly above).

**4. water**
```
Surface: still golf course pond water seen from above. Deep teal-blue, soft broad painted ripples drifting across the tile,
a few small sun glints lit from the upper right, even overall brightness (no darker edge, no shore, no reflections of objects).
```

Save as `art/ground-painted/water-<close|mid|far>-v<n>.png`.

These are covered by GRASS-PROMPTS already:
- the bunker sand floor is #10 bunker-sand;
- the pond's bank ring is optionally #13 shore. The game paints it for now: wet soil fading into grass, and a few stones.

## Wiring the art in (no other code change)

The walls have three texture slots, `WALL_TEX` in `src/game/ext/course-walls`: `wallTurf`, `wallSand` and `wallBank`. To
use an image:
1. Import it in `src/game/grass-art.ts`.
2. Add `{ tex: 'wallTurf', src: <import>, mix: 0 }` (and the same for `wallSand` and `wallBank`) to `PHOTO_TEX`.

The ground workers build a slot the first time a course chunk with walls arrives. From then on the renderer
(`GroundPainter.wallArt`) lays the art in each wall's body at the scale above, shaded by its light steps, instead of the
painted placeholder. The top band (the root line under the lip) stays painted.
