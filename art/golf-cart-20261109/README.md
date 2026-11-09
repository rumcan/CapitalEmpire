# The hire golf cart's eight pictures (T351, #994)

The owner, 2026-11-08: "why does the golf cart not look natural when driving?" The game had two pictures of the cart (`business:golf-cart-sw` and `-se`, the front to the screen's lower left or
lower right), picked by the sign of `hx - hy`: a cart driving up the screen showed its front, one driving across it a diagonal. It slid sideways or looked to reverse. The lead's animation runner
painted the missing views from the cart's 3D guides (`F:/Art/newArt/animations/buildings/business~golf-cart/{corners,axisturn}.png`); this is how they came into the game.

## What is in the game

One object-eight set (T375's format, `scripts/assets/OBJECT-EIGHT.md`): subject `business:golf-cart`, "Hire golf cart", library category `Eight-view carts` (so no Props card), ring
`[NE, N, SE, E, SW, S, NW, W]` = the way the cart's FRONT faces (the NE view's front to +y, the screen's lower left; the N view's to the screen's bottom; ...). The game picks the nearest of eight to
the cart's heading, counted the way the cars' eight headings are (`ext/car-art carHeading`: tile angle atan2(hy, hx) over 45 degrees, 0 the screen's lower right), never mirrored (`golf/cartart.ts`).

| heading (iso screen) | tile direction | set view | picture |
| --- | --- | --- | --- |
| SE | +x | `normalSE` | the existing `business:golf-cart-se` (reused: an alias of its atlas cell) |
| S | +x +y | `yaw8N` | axisturn top left: the front, turned 8 degrees |
| SW | +y | `normalNE` | the existing `business:golf-cart-sw` (reused) |
| W | -x +y | `yaw8W` | axisturn bottom right: the left side |
| NW | -x | `normalNW` | corners top right: the back to the camera, the front to the upper left |
| N | -x -y | `yaw8S` | axisturn bottom left: the back |
| NE | -y | `normalSW` | corners top left: the back to the camera, the front to the upper right |
| E | +x -y | `yaw8E` | axisturn top right: the right side |

Cells were identified by comparing with the existing pictures (silhouette overlap after the best scale: old SE against the corners' bottom right 0.86, old SW against the bottom left 0.84, every
other pairing 0.60 to 0.76) and by reading the sheets (the sheet's top row drives away from the camera, its bottom row towards it). `prep-report.json` has the sources' hashes.

### The existing SE and SW stay; the corners sheet's bottom row is not used

Measured (`scripts/assets/golf-cart/measure.py`, `measurements.json`): the pitch of each picture from its roof (roof height over width is the sine of the camera's elevation):

| picture | elevation |
| --- | --- |
| existing SE, SW | 25.7, 26.9 degrees |
| the four axis views | about 27 (taken from the corners') |
| corners top row (NE, NW headings) | 29.9, 28.6 |
| **corners bottom row (SW, SE headings)** | **36.9, 35.7** |

The bottom row was drawn from a camera 9 to 10 degrees higher than every other picture, and its roof is paler (blue channel 177-181 against 165-167 for the old pictures and the axis views). Used, it
would tilt the cart toward the camera by 9 degrees at SW and SE and back again at S and W. The old pictures match the other six on both counts. They are also the pictures the owner has already
seen, and reusing them stores no pixel twice. The bottom row is kept in `src/` (not committed) and named `unused-corners-bottom-*`.

## How it was made

1. `python scripts/assets/golf-cart/prep_cart.py` cuts the eight cells into `src/` (8 px clear margin each):
   - `corners.png` is RGB with a checkerboard baked in (no alpha): `key_checker.py` keys it (the near-white neutral paper that joins the sheet's border, and the see-through gaps of the open cart:
     enclosed paper of 60 px or more; alpha unmixed against the paper on a 3 px band; the edge colour is the pixel less the paper it holds, over its alpha, where that is well conditioned, else
     the nearest solid colour; nothing resized or repainted). A first try that only bled the nearest solid colour into the edge left a light halo round the dark tyres: at dark edges 52% of
     the edge pixels were more than 60 levels brighter than their neighbour (median +61); now 5-9% (median +16-21: the cart's own rim light), against 0.0-0.2% for the axis views
     (`fringe_check.py`);
   - `axisturn.png` has alpha, haze and a yellow fringe: T398's `straight-views/prep_sheet.py` (alpha under 8 zeroed, solid alpha 252-253 to 255, edge pixels take the colour of the solid ones beside
     them, the four views kept as connected pieces). Checked at 3-6x over grass green and dark: no fringe left.
2. `python scripts/assets/golf-cart/measure.py` writes `measurements.json`:
   - **Scale.** The roof's horizontal width does not depend on the camera's pitch, so it measures the scale between pictures. The sheet's bottom-row roofs (the same headings as the old pictures)
     are 325 and 331 px wide, the old pictures' 244 and 250: an old native pixel is 0.753 of a new one. The old pictures are drawn at 1.406 library px per native px, so the new ones take
     1.406 x 0.753 = **1.059** (pixelsPerMetre 42.73, baselineScale 0.294: the cart's owner size, so the cart keeps its size). The four corners' roofs (325-339 px) and the four axis views' (their
     widths and the 8-degree turn imply 328-334) agree to 2%: one scale for the six.
   - **Anchors.** The old pictures' library anchor lies under their roof's centroid (+-5 px) and 225-231 native px below it (the cart's floor): the new anchor is the roof's centroid and that drop at the
     new scale times the cosine of the picture's pitch. Checked against the wheel hubs and tyre bottoms read by eye: within about 20 native px, under 2 px at the closest zoom. (The T375 footprint-box
     fit was tried first and is not used: with a cart-sized box it inflates its eave and height to cover the golf bags and shifts the anchor toward them by 30-60 px.)
3. `node scripts/assets/golf-cart/build.mjs --prepare` writes `input.json` and cuts the six new pictures (`cut/`, provenance with the sha256 of every crop and source), `--integrate` approves the manifest
   and runs the importer's batch packer: `node scripts/assets/import-object-eight.mjs --integrate-batch golf-cart-20261109 --density 0.3`. One shared page, `src/assets/object-eight/golf-cart-20261109-v1`
   (about 300 KB with its mips). Density 0.3 (not the batch default 0.6): the cart is drawn at 0.294 of its library size (at most 0.44, SIZE_HI x the baseline), so mip 0 at 0.3 holds a pixel limit of 0.5.
4. The importer now lets any of the four normal views be a `reuse` (T398 required all four or none): the cart reuses two and adds two. Test: `scripts/assets/import-object-eight.test.mjs`.

`src/` and `cut/*.native.png` are reproducible from the sheets and are archived at `F:/Art/newArt/animations/t351-golf-cart/{src,cut}`; the manifests, measurements and provenance stay.

## In the game

- The picture is the nearest of the eight to the heading wherever the hire cart is drawn: your cart, the field's carts and the grounds crew's utility cart (its stand-in, engine `crewMovers`; its legs
  are long and straight, so its heading is not blended).
- `?oldcart`: the two pictures by the sign of `hx - hy`, your cart's side by its facing, a steady pace and the segment's own heading, as before T351.
- The field's carts (`golf/play/carts.ts`): the heading is blended round every bend over 3 m of route centred on the bend (smoothstep through the shorter way round, never two blends meeting), from the
  heading the cart was parked with into its first leg, so the picture steps through its neighbours and never jumps across; the pace eases in and out over 3 m at each end (constant acceleration;
  the drive takes the same minutes, so the play is unchanged). A route's slivers (under 0.5 tile: a stop on a path starts its route with one) have no heading of their own.
- Your cart (`golf/cartdrive.ts`): under the keys it steers (a quarter turn in about 0.3 s, a little slower from rest) and drives along its heading, pulls away in 0.45 s and rolls to a stop in
  0.3 s; a click's route is followed exactly, its pace eased; a facing the game sets from outside (the cart turned to you on arriving) is turned to a step at a time.
- Shots (`shots/`): `node scripts/assets/golf-cart/shots.mjs --url <dev server> --tag after|before [--query "&oldcart=1"] --zooms 0.3,0.15` drives the game's own cart in a headless Edge on the
  GPU, the page's clock STEPPED by the script (every frame is exactly 50 ms of game time and each screenshot is of exactly that frame, so a loaded PC makes the same strips as a fast one): a
  loop of eight legs through all eight headings (the picture at the middle of each leg), a square of 90 degree bends and a hairpin (the pictures through each bend), and under the keys (D, W,
  A, S held, then let go). `compare.mjs` stacks before over after. The before is this build with `?oldcart` (the old pictures, pace and heading); the closest zoom (30%) and the middle one
  (15%).
- Tests: `tests/t351-cart-eight.test.ts`.

## Not done

Nothing is owner-approved. The straight views are turned 8 degrees like the buildings' (a cart on a screen-axis road shows that turn). The set's shadow is the sprite's silhouette (no hand-drawn
shadow shape, as the other object-eight sets).
