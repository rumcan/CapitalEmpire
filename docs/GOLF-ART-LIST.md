# The golf art list: everything to generate, with its angle (paste-ready prompts, 2026-10-27)

Everything the golf game still needs drawn, in one list for the image generator:
- the driving range and fun range targets;
- the practice areas (rock features, palm trees, lights);
- the club pros and their offices;
- storage and maintenance;
- the course's everyday furniture and the clubhouse surroundings;
- the tournament;
- the people (made in 3D from one picture each);
- greenkeeping: every grass in five conditions, soils and wear decals (section 10).

Each item gives its **angle code** (below), its size, its game id and a prompt. The tracker of what is in the game stays
`docs/GOLF-SPRITES.md`; this file is the generator's side.

**Status marks:** **(stand-in)** the game draws a labelled stand-in today, so this picture goes straight in. **(new)** nothing places it yet:
the art can be made now, and a small ticket places it in the game. **(in the game)** already drawn: listed only so the set is complete.

## Progress (kept current by the lead; the owner, 2026-10-27: "mark off the list things already done")

**Marks:** ✅ in the game · 🎨 made, going in · ⏳ being made now · nothing: still to make. An item gets ✅ the day it is in the game, with the PR.

**The owner's standing rules:** finished art goes straight into the game without asking ("put stuff in the game, dont ask"); the old look
stays a Studio option. Ground textures follow [art/GROUND-TEXTURE-METHOD.md](art/GROUND-TEXTURE-METHOD.md).

**Who makes what** (the owner, 2026-10-28: "use the run.world credits for 3d work. we wont top up, we will use the chat gpt image generator for iamges"):
- **ChatGPT's image generator** (the owner runs it) makes every 2D picture from now on: scenes, portraits, ground layers, sprites on magenta. The next prompts, ready to paste, with file names: [art/CHATGPT-IMAGE-QUEUE.md](art/CHATGPT-IMAGE-QUEUE.md).
- **RUN.world** is for 3D only: the people pipeline (models from A-pose pictures, clips). No more RUN images.

Before that switch:
- **RUN.world** (the art agent, the owner's RUN account): ground textures by the owner's method (RUN paints tile 1 into a game screenshot,
  tiles 2-4 quilted); top-down pictures (C); one-view sprites (B) on magenta; people's A-pose pictures (P).
- **Codex** (the art session): four-view sheets (A, A8). RUN's four turns did not hold one object in the pilot. The one-view-per-call
  route (each view matched to the last) is being tried.

### Ground textures (course surfaces)
| Surface | Status |
| --- | --- |
| First cut | ✅ `first-cut-run` (#586); also every lawn (#591) |
| Tee | ✅ `tee-run` (#590) |
| Fringe | held: the RUN set came out too flat at NEAR (the owner's no-flat-wash rule); the textured fringe in the game stays |
| Desert (Waste area sand) | ✅ `desert-run` (#612), from the art session's painting, the store removed |
| Swamp | ✅ `swamp-run` (#614), RUN-painted; on the map with T199 #517 |
| Dirt (Dirt surface, farm fields) | ✅ `dirt-run` (#616, #617), from the art session's painting, the store removed |
| Raked sand (bunkers) | ✅ `sand-raked-run` (#620) |
| Putting green (greens, range targets) | ✅ `putting-green-run` (#621) |
| Rough | 🎨 `rough-run` (#621) offered; the owner's own rough stays on the course |
| The map's fescue blending | ✅ blends with dirt (#621, the owner) |
| Fairway | Codex (18 of 24 jobs done) |
| Golden fescue, lake, putting green v2 | ✅ (the art session, earlier) |
| Pond bank (river banks, creek beds) | ✅ `pond-bank-run` (#630) |
| Grow-in soil | ✅ `grow-in-run` (#630) |
| Bark mulch (flower beds) | ✅ `flower-bed-soil-run` (#630), the Paint tool's Bark mulch |
| Field parking | 🎨 `field-parking-run` (#630) in Studio › Painted; no grass car park wears it yet |
| Range tee, divots | 🎨 `range-tee-divots-run` (#630) in Studio › Painted; goes on the range tee with T223 #622 |
| Brown fescue (town blocks) | 🎨 `fescue-brown-run` made; on hold until the leaves (T220) land, the owner's call |
| Greenkeeping conditions (section 10) | after the course surfaces |

### The concept look (section 12)
The owner's target picture, 2026-10-27: items 149-175, and 178-179 the eight-facing pickup and sedan (T236 #693: the driving cars' colours). ✅ 153 lawn on every yard (#663); 🎨 153 meadow and 152 rough in the Studio; ✅ 149-151 the fairway, first cut and green on the course and the range (#666). 🎨 154 pond water (T230 #679); ✅ 158-160 the pond kit, 162-164 the shrubs, flowers and hedge, and 36, 43, 45 in the game (T231 #671); 169-171 the building-site kit (T232 #673; 168 the excavator blocked in RUN); ✅ 174 the build-tool tiles in the game (T233 #674). Ground textures 149-153 come first: the concept's greens. The plan is in [art/CONCEPT-LOOK.md](art/CONCEPT-LOOK.md).

### Set the scene, portraits and you (section 13, P28)
The owner's 2026-10-28 asks: items 200-235 and 240-327 (about 115 places, most with a run-down and an upgraded picture), still to make, except batch 1 (200-204, 211; 17 pictures in `art/theme-consistency/generated/scenes/`). Batch 2 (the P1 places 205-222) after RUN's cap resets; the rest needs a credit top-up.

### List items done
Ground (section 8 and the range ground): ✅ 131 Pond bank, ✅ 132 Grow-in, ✅ 135 Flower bed soil (#630); 🎨 133 Field parking, 🎨 21 range tee divots (#630, in the Studio, no ground wears them yet); 130 Pond water skipped (the lake is in). 134 Event matting deferred (quilting would break its panel grid). 🎨 19 the hitting mat (top-down, made, not drawn yet); 20, 27, 147 retakes next. The range and practice sprites still draw labelled stand-ins.

## The angles

Every picture uses the same camera: **2:1 isometric**.
- The ground's lines run at +/-26.565 degrees on screen, and verticals stay vertical.
- You look down at the ground at about 30 degrees, from the south-east, as the game's camera does.
- The sun is fixed at the **screen's upper right** in every picture, so shadows fall to the lower left (145 degrees). Turn the object, never the sun.

| Code | What it is | Pictures | Use it for |
| --- | --- | --- | --- |
| **A** | **Two views** (the owner, 2026-10-27: "just get two diffrent angles of each thing same lighting from top right always") | one 1x2 sheet: view 1 front+right (the old NE cell: the front faces the screen's lower left), view 2 left+front (the old NW cell: the front faces the lower right); the same object, never mirrored, the sun at the upper right in both | anything with a front that the game turns to face a road, a hole or a path: buildings, kiosks, signs, benches, shelters. The game shows view 1 or view 2 by which way the object faces; its back is not drawn |
| **A8** | (dropped) | the owner's two views (A) replace the four and eight-view sheets | - |
| **B** | One view, several variants | one picture each, 2-4 variants | things that look the same from every side: trees, palms, rocks, bins, posts, round lamps, flags. Variants (other shapes, sizes, leans) stop a row of them looking copied. |
| **C** | Top-down ground picture | one square picture seen from straight above | mats, target greens, decals, ground textures |
| **D** | Eight facings | eight separate pictures: E, NE, N, NW, W, SW, S, SE (where its front points) | vehicles: carts, mowers, trucks |
| **R** | Run pieces | two pictures: one piece lying along the map's x axis, one along its y axis (the game never turns or mirrors a fence), plus an end post or corner | fences, walls, rope lines, hedges, stake lines, bridges |
| **P** | A person for the 3D pipeline | ONE front picture in an A-pose; RUN.world and Meshy make the 3D model, the 8 facings and the clips from it (`docs/HANDOVER-PEOPLE.md`) | golfers, pros, staff, spectators |

**Never mirrored:** every view is its own drawing. A mirrored front is not a back, and lettering must read correctly. **No lettering**
unless the item asks for it: most boards are blank, and the game writes the words.

## How to use this list
1. **One subject per generation.** Paste the shared block for its angle code (below), then the item's prompt.
2. **Attach the references in this order:**
   1. `art/theme-consistency/references/theme-authoritative.png`: the owner's Maple Bean street, the only style authority.
   2. The item's identity picture, when it lists one.
   3. For A and A8 sheets only, last: `art/theme-consistency/references/rotation-guide-v1.png` (geometry only).
3. **Magenta backgrounds (the owner, 2026-10-27).** Every sprite (codes A, A8, B, D, R) is generated on flat pure magenta #FF00FF and keyed
   out with `scripts/assets/key-magenta.mjs`:
   - before keying, sample the corners and gutters and reject a take whose background drifts more than about 10 per channel or that has
     magenta-like pixels inside the subject;
   - after keying, despill so no pink halo is left (check a 2x crop on dark and light);
   - keep the raw magenta take beside the keyed file.
   Ground pictures (C) are opaque and need no background; C decal sheets that must be transparent use magenta too.
4. **Check every result:** a clean key; real turns (the back is a back); the light at the upper right in every view; nothing cropped.
5. **Save it** as `art/theme-consistency/generated/<category>/<slug>-4views-vN.png` (or `-8views-`, `-1view-`, `-top-`, `-8facings-`) with
   its provenance (`docs/SPRITE-GENERATION-WORKFLOW.md` section 6).

Sizes are real-world metres (1 game unit = 1 m, a map tile is 2 m); the pixels are calibrated to the game later. P1 is needed first
(tiers 1-3), P2 later (tiers 4-5), P3 last.

## The shared blocks

**A. Two views** (the owner, 2026-10-27). Below, read "a strict 2x2 grid of four separate cells in row-major order NE, SE, SW, NW: four genuine 90-degree turns" as "two separate views side by side: view 1 front+right, view 2 left+front, two genuine turns"; everything else holds.
> ONE subject. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style, materials and light. A later reference, when given, is this subject's identity: keep its design. The last reference, when it is the camera-rotation guide, is a geometry diagram only: never copy its colours, boxes, labels or marker. Return one SQUARE image on a FLAT PURE MAGENTA background (#FF00FF, RGB 255,0,255: one uniform colour edge to edge, no gradient, floor, texture, vignette or shadow on it), to be keyed out to transparency afterwards; the subject itself contains NO magenta, pink or purple and has a crisp outline: a strict 2x2 grid of four separate cells in row-major order NE, SE, SW, NW: four genuine 90-degree turns of the SAME physical object, with the face pairs front+right, right+back, back+left, left+front. Reconstruct the real back and sides; never mirror a front and never repeat a view. Fixed parallel 2:1 isometric camera, ground axes +/-26.565 degrees, verticals vertical. Early autumn dusk: low warm sunlight fixed at SCREEN UPPER RIGHT in every cell, right-facing planes warmer, left-facing planes cooler, only tiny soft contact shadows toward SCREEN LOWER LEFT; practical lamps already warmly lit, still enough daylight to read every material. The year is 1985: no modern screens, LEDs, QR codes or present-day plastic signage. No people, no Halloween decoration, no ground tile, lawn, street, backdrop, haze, checkerboard, caption or frame, no neighbouring objects. Leave at least 15% clear transparent space round each view, including the centre gutters; shrink all four views uniformly so nothing is cropped. No lettering unless this prompt asks for it; lettering that is asked for reads correctly in every view.

**B. One view.**
> ONE subject, centred, one view only, on a SQUARE image on a FLAT PURE MAGENTA background (#FF00FF, RGB 255,0,255: one uniform colour edge to edge, no gradient, floor, texture, vignette or shadow on it), to be keyed out to transparency afterwards; the subject itself contains NO magenta, pink or purple and has a crisp outline. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style. Fixed parallel 2:1 isometric camera, verticals vertical. Early autumn dusk: low warm sunlight from SCREEN UPPER RIGHT, a tiny soft contact shadow toward SCREEN LOWER LEFT; a lamp, if it has one, warmly lit. The year is 1985. No people, no ground tile, lawn, backdrop, checkerboard, caption or frame. Leave at least 15% clear space on every side. No lettering.

**C. Top-down ground picture.** For ground TEXTURES (grass, sand, soil, the greenkeeping conditions) do not use this block: follow
[art/GROUND-TEXTURE-METHOD.md](art/GROUND-TEXTURE-METHOD.md), the owner's method (paint the layer into a game screenshot, slice it, clean it,
paint four tiles; the generator never knows it is a texture). Block C is for decals and one-off pictures (mats, target greens, helipads).
> A ground picture seen from STRAIGHT ABOVE (orthographic top-down, no perspective, no isometric tilt), filling the whole square canvas edge to edge. Detailed hand-painted illustrated style matching reference 1's grass and paving. Soft even daylight with a gentle warm light from the upper right; no cast shadows except tiny ones under small objects, toward the lower left. No objects standing up out of the ground, no people, no lettering, no frame. No visible repeating pattern: every patch of it looks different.

**D. Eight facings.**
> ONE vehicle, eight separate pictures of the SAME vehicle, one per facing: E, NE, N, NW, W, SW, S, SE (the direction its front points on the map). Each on its own SQUARE image on a FLAT PURE MAGENTA background (#FF00FF, RGB 255,0,255: one uniform colour edge to edge, no gradient, floor, texture, vignette or shadow on it), to be keyed out to transparency afterwards; the subject itself contains NO magenta, pink or purple and has a crisp outline, the vehicle centred with 15% clear space round it. Reference 1 is the only visual-theme authority: match its detailed illustrated miniature style. Fixed parallel 2:1 isometric camera, verticals vertical. Early autumn dusk: low warm sunlight fixed at SCREEN UPPER RIGHT in every picture whatever the facing, a tiny soft contact shadow toward SCREEN LOWER LEFT. Every facing is its own drawing: never mirror one facing to make another. The year is 1985. No driver or people, no ground tile, backdrop or caption.

**R. Run pieces.**
> ONE run piece of the subject below, drawn twice on one SQUARE image on a FLAT PURE MAGENTA background (#FF00FF, RGB 255,0,255: one uniform colour edge to edge, no gradient, floor, texture, vignette or shadow on it), to be keyed out to transparency afterwards; the subject itself contains NO magenta, pink or purple and has a crisp outline: on the left, the piece lying along the map's x axis (its line running from the upper left toward the lower right of the screen); on the right, the same piece lying along the map's y axis (running from the lower left toward the upper right). Both ends of each piece are cut clean so identical pieces join end to end without a gap or a doubled post; add one end post (or corner) as a third small item below them. Reference 1 is the only visual-theme authority. Fixed parallel 2:1 isometric camera, verticals vertical. Early autumn dusk: sun fixed at SCREEN UPPER RIGHT, tiny contact shadows toward SCREEN LOWER LEFT. The year is 1985. No people, no ground tile, backdrop, caption or frame; 15% clear space round each item.

**P. A person for the 3D pipeline.**
> ONE person, full body, head to feet in frame, standing in a relaxed A-pose (arms held a little away from the body, palms in, feet slightly apart), facing the camera straight on, eye level, no perspective distortion. Plain flat light-grey background, soft even studio light, no cast shadow, nothing in the hands unless the prompt says so. Realistic proportions, clothes clearly readable, matching the detailed illustrated style of reference 1. The year is 1985: period clothes and hair, no phones, headsets or modern logos. No lettering on the clothes.

---

## 1. The driving range
Every stand-in the range draws today (`src/game/golf/rangebiz.ts rangeScene`, the yellow "Stand In for ..." pills), and its other
requests.

### Range buildings

**1. Tin-and-tarp pro shop** (`golf:clubhouse-shanty`) · **A** · 12 x 8 m, 4 high · P1 **(stand-in)**. The range's starting shop, where
golfers buy their buckets.
- Identity reference: `art/theme-consistency/exports/buildings/golf-clubhouse-shanty.configured@2x.png`.
- Full ready-made prompt: `art/theme-consistency/jobs/golf-clubhouse-shanty.prompt.txt`.
> Subject: golf:clubhouse-shanty, the driving range's starter pro shop, a makeshift tin-and-tarp shack, about 12 x 8 m and 4 m high. Keep the identity reference's design: plank walls in faded blue and grey paint, a rusty corrugated-tin roof with a blue tarp patch tied over it, a stovepipe chimney, small four-pane windows, an open doorway, a serving hatch with a timber counter on the front, a bench by the wall, a blue crate of range balls by the door. Small-budget, cheerful and cared for, not derelict. A bare-bulb lamp lit over the hatch.

**2. Double-deck hitting stand, one section** (`golf:range-deck`) · **A** · 20 x 7 m, 7 high · P1 **(stand-in)**. The "Second tier of bays"
upgrade: the game sets one section over every four bays, side by side, so the two ends must join cleanly.
- Identity reference (for the style it must match): `art/theme-consistency/exports/buildings/business-golf-driving-range.configured@2x.png`, the covered bays already in the game.
> Subject: golf:range-deck, one section of a two-storey driving-range hitting stand, about 20 m long, 7 m deep and 7 m high, built in exactly the same style as the identity reference's covered bays: heavy timber posts on dressed-stone piers, timber knee braces with black iron brackets, a dark green standing-seam metal roof, warm lanterns under the eaves. Four open hitting bays on each storey, all open toward the front: green artificial-turf mats with a white rubber tee, dark green timber divider walls between the bays, a timber club rack in each bay. The upper deck is a timber floor on beams with a dark green steel safety rail along its open front. A steel stair with a handrail climbs to the upper deck at one end. Both short ends are clean and open enough to butt against an identical section beside it. Empty, no golfers.

**3. Coffee kiosk** (`golf:range-coffee-kiosk`) · **A** · 3 x 2.5 m, 3 high · P1 **(stand-in)**.
> Subject: golf:range-coffee-kiosk, a small timber coffee kiosk at a 1985 driving range, about 3 x 2.5 m and 3 m high. Painted cream timber walls with dark green trim, a serving hatch with a fold-down counter on the front, a red-and-white striped canvas awning over the hatch, a chrome espresso machine and a stack of paper cups visible through the hatch, a blank dark green chalk menu board hung beside it (no writing), a warm light inside. A plain back wall with a small door and a gas bottle in a cage.

**4. The player's cottage** (`golf:home-cottage`) · **A** · 6 x 5 m, 5 high · P2 **(stand-in)**. The player's second home, after the caravan.
> Subject: golf:home-cottage, a modest owner-built cottage beside a driving range, about 6 x 5 m and 5 m high. Whitewashed brick walls, a red-oxide corrugated-iron roof, a small covered stoep (veranda) across the front with a timber bench, a green front door, two sash windows with warm lamplight, a galvanised water tank on a timber stand at one side, a small satellite dish on the roof. Neat and cared for, a step up from a caravan, not a mansion. No garden beds or fence attached.

The six-storey car park's diagonal views are not on this list: Codex is drawing them now (T183, issue #459).

### Range signs

**5. "Driving Range" road sign** (`golf:range-sign`) · **A** · 4 x 0.5 m, 3 high · P1 **(stand-in)**.
> Subject: golf:range-sign, a weathered roadside sign for a small 1985 driving range, about 4 m wide and 3 m high: a white painted board with a dark green trim on two stout timber posts, a red golf-flag-on-a-green motif at its left, and the words DRIVING RANGE in bold dark green capitals. The lettering must read correctly, left to right, in the two views that show the face; the back of the board is plain painted planks.

If the generator garbles the letters, make the board blank: the game can write the words on it.

**6. Yardage board** (`golf:range-yardage-board`) · **A** · 2 x 0.5 m, 2.5 high · P1 **(stand-in)**.
> Subject: golf:range-yardage-board, a driving-range yardage board, about 2 m wide and 2.5 m high: a white painted board with a green trim on two white posts, its face BLANK (the game writes a number on it), a small red flag finial on top. The back is plain painted planks.

**7. Distance marker post** (`golf:range-distance-post`) · **B** · 0.5 x 0.5 m, 1.5 high · P1 **(stand-in)**.
> Subject: golf:range-distance-post, a short driving-range distance marker, about 1.5 m high: a square timber post painted in red and white bands, a small blank white plate on top (no number), set in the ground.

**8. Golf academy sign** (`golf:range-academy-sign`) · **A** · 1.5 x 0.3 m, 1.8 high · P2 **(stand-in)**.
> Subject: golf:range-academy-sign, a smart little golf academy sign, about 1.5 m wide and 1.8 m high: a dark green painted timber board on two posts with a gold crossed-golf-clubs crest at its top and a BLANK cream plate below it (the game writes the words). The back is plain dark green planks.

**9. Practice green sign** (`golf:practice-sign`) · **A** · 1 x 0.2 m, 1 high · P2.
> Subject: golf:practice-sign, a small sign by a practice putting green, about 1 m wide and 1 m high: a dark green timber board on one post, the words PRACTICE GREEN in white capitals, reading correctly in the views that show the face. The back is plain dark green planks.

### Range equipment and props

**10. Floodlight mast** (`golf:range-floodlight`) · **A** · 1 x 1 m, 12 high · P1 **(stand-in)**. Four views, because the lamps must point down
the range whichever way it faces.
> Subject: golf:range-floodlight, a tall galvanised-steel floodlight mast at a driving range, about 12 m high on a square concrete foot: a slim lattice or tube mast with a service ladder, at its top a bank of four rectangular floodlights on a crossbar, all angled down and forward toward the front. The lamps glow warm white, lit. Fit the whole mast, lamps included, inside each cell.

**11. Ball dispenser** (`golf:range-ball-dispenser`) · **A** · 1.5 x 1 m, 2 high · P1 **(stand-in)**.
> Subject: golf:range-ball-dispenser, a 1985 coin-operated range-ball dispenser, about 1.5 m wide, 1 m deep and 2 m high: a green painted steel cabinet with a chrome coin slot and a small blank instruction plate on its front, a chute at waist height with a wire bucket of white range balls under it, a few balls on the ground at its foot. A plain back with a service door and a padlock.

**12. Hitting bay divider** (`golf:range-bay-divider`) · **A** · 1.5 x 0.2 m, 1.2 high · P2.
> Subject: golf:range-bay-divider, a low timber divider between two driving-range hitting mats, about 1.5 m long, 0.2 m thick and 1.2 m high: dark green painted planks on two short posts, a timber club rack fixed to one side holding two golf clubs, a small hook with a towel.

**13. Tee marker** (`golf:tee-marker`) · **B** · 0.3 m, drawn 1.5x · P1. Make it in five colours (red, blue, white, gold, black): the course's
tees use the same marker.
> Subject: golf:tee-marker, a single golf tee marker: a painted timber block about 30 cm long, rounded at the ends, on a short spike, standing on its own. Make five pictures: red, blue, white, gold and black.

**14. White plastic garden chair** (`golf:yard-plastic-chair`) · **A** · 0.6 m, 0.9 high · P2.
> Subject: golf:yard-plastic-chair, one ordinary white moulded-plastic garden armchair, about 0.6 m wide and 0.9 m high, a little weathered.

**15. Gas bottle on a braai stand** (`golf:yard-gas-bottle`) · **B** · 0.5 m, 1 high · P2.
> Subject: golf:yard-gas-bottle, a dented grey 9 kg LPG gas bottle with a brass valve and a rubber hose, standing beside a small black steel gas braai (barbecue) stand with a round grid, about 1 m high together.

**16. Practice green flag** (`golf:practice-flag`) · **B** · 0.2 m, 0.9 high · P2.
> Subject: golf:practice-flag, a short practice-green flagstick, about 0.9 m high: a thin white pole with a small yellow triangular pennant lifting in the breeze, a white cup liner showing in the hole at its foot.

**17. Range ball basket** (`golf:practice-balls`) · **B** · 0.4 m, 0.3 high · P2.
> Subject: golf:practice-balls, a wire basket of white range balls, about 40 cm across and 30 cm high, with a carry handle, three or four balls spilled on the ground beside it.

**18. Ball-picker cart** (`golf:range-picker`) · **D** · 2.5 x 1.5 m · P1 **(stand-in)**.
> Subject: golf:range-picker, a small 1985 driving-range ball-picker cart, about 2.5 m long and 1.5 m wide: a dark green utility cart with a protective wire-mesh cage over its open cab (to stop flying balls), towing behind it a gang of three ball-picking units (rows of rubber discs between wheels that roll the balls up into trays), a wire basket of collected white balls on its back.

### Range ground

🎨 **19. Hitting mat** (made: `run-top/golf-range-mats/golf-range-mats-top-v1.png`, not drawn yet) (`golf:range-mats`) · **C** · 4.2 x 6 m a bay · P1 **(stand-in)**. The left and right edges must join seamlessly.
> Subject: golf:range-mats, ONE driving-range hitting mat seen from straight above, about 4.2 m wide and 6 m deep: a concrete pad with a slightly worn green artificial-turf mat on it, a white rubber tee near the front edge, two or three white range balls beside it, a scuffed, flattened strike zone behind the tee. The left and right edges of the picture continue the concrete and must tile seamlessly when two copies are placed side by side.

🎨 **20. Target green** (top-down retake made: `run-top/golf-range-target-green/`) (`golf:range-target-green`) · **C** · 12-20 m across · P1 **(stand-in)**.
> Subject: golf:range-target-green, one round driving-range target green seen from straight above, filling the square: a smooth fine-cut inner green, a lighter mown collar ring round it, a faint darker ring at its outer edge where it meets the coarser outfield grass (the outfield shows only in the corners), a cup at the exact centre (no flag), a few white range balls lying scattered on it. No mowing stripes.

**21. Divot-scarred range tee turf** (`range-tee-divots-run`, #630: **rejected by the owner**, 2026-10-28: the divots read as litter, "please find diffrent grass"; the turfed tee wears `green-concept-run`; the family stays a Studio option) (texture) · **C** · a 16 m square · P1 **(stand-in)**.
> Subject: a seamless ground texture of a busy driving range's tee turf seen from straight above, covering a 16 x 16 m area: short green fairway grass scarred with many small divots (oval patches of bare brown soil and torn turf, some filled with green-tinted sand), a few loose white golf tees and broken tee pieces. It must tile seamlessly on all four edges with no visible repeat: no single distinctive divot or patch that the eye picks out when it repeats.

### Range extras (new)

**22. Safety net poles** · **R** · a 10 m piece, 12 high · P2. Down the sides of the range where it borders a road.
> Subject: a run of driving-range safety netting, one section about 10 m long and 12 m high: two tall creosoted timber poles with steel guy wires, a fine dark green net stretched between them, sagging slightly.

**23. Bag stand rack by the shop** · **A** · 3 x 0.6 m, 1.2 high · P2. The same rack as item 88.

**24. Ball washer stand** · **B** · 1.1 m · P2.
> Subject: a classic green paddle-type golf ball washer on a short post with a white towel hanging from it and a small litter bin at its foot.

**25. Price board** · **A** · 0.7 x 0.5 m, 1.1 high · P2. The game writes the bucket prices on it.
> Subject: a free-standing A-frame board, about 0.7 m wide and 1.1 m high, dark green with a cream trim and a BLANK chalk face.

**26. Bucket return trolley** · **A** · 1 x 0.6 m, 1 high · P3.
> Subject: a low galvanised trolley about 1 m long with stacked empty wire range-ball buckets on it.

### Fun range targets (new)
The owner, 2026-10-27: "how about better more fun range targets". Big, bright things out on the outfield that golfers aim at and that
read from far away. Each stands on the outfield grass; a ball that lands in or on one would count as a hit. They are new: the game
needs a ticket to offer them (a range upgrade, "Fun targets").

🎨 **27. Bullseye target green** (top-down retake made: `run-top/golf-range-bullseye-target/`) · **C** · 16-24 m across · P1. A target green painted as a giant archery target.
> Subject: a giant round driving-range target seen from straight above, filling the square: concentric rings mown and painted into the turf, white, red, white, red, with a bright yellow bullseye green at the centre holding a cup, the rings slightly irregular as if hand-painted on grass, a few white balls lying in the rings.

**28. Island target green** · **A** · 20 x 16 m, 1 high · P1. A small green on an island in a pond.
> Subject: a driving-range island target: a small round putting green with a red flag on a little island of rocks and sand, in a kidney-shaped pond about 20 x 16 m with rushes at its banks, a couple of floating white range balls, the water reflecting the warm dusk sky.

**29. Old pickup truck target** · **A** · 5 x 2 m, 2 high · P1. The classic: a battered truck to hit balls into.
> Subject: a driving-range target made from an old 1960s pickup truck parked out on the range, faded sky-blue paint, dented, no wheels (sitting on its axles in the grass), a large bright orange target circle painted on its side and tailgate, its open bed full of white golf balls. No number plate.

**30. Windmill target** · **A** · 4 x 4 m, 6 high · P2. A mini-golf style windmill, scaled up.
> Subject: a big fun driving-range target shaped like a red-and-white Dutch windmill, about 6 m high, its four white sails still, a wide open arched doorway at its base with a net inside to catch balls, a ring of white balls in the grass round its foot.

**31. Giant golf ball target** · **B** · 4 m across · P2.
> Subject: a giant white golf ball, about 4 m across, with deep dimples, lying on a short timber tee-shaped stand on the range, a cut-out hoop in its front with a net behind it to catch balls.

**32. Basket target** · **B** · 5 m across, 2 high · P1. A raised catch basket that collects balls into a chute.
> Subject: a round raised driving-range catch basket, about 5 m across and 2 m high: a ring of green netting on a white tubular steel frame, funnelling down to a chute, a bright yellow flag on a pole in its middle, a few balls in the net.

**33. Oil drum and tyre targets** · **B** · 3-4 m · P2. A cheap, cheerful cluster for the early range.
> Subject: a cluster of driving-range targets made of junk: three oil drums painted red, yellow and blue standing in a ring of stacked old tractor tyres painted white, a short flag in the middle. Make three variants with a different arrangement.

**34. Tractor target** · **A** · 4 x 2.5 m, 3 high · P3.
> Subject: an old rusty red farm tractor from the 1950s parked out on a driving range as a target, no driver, its seat replaced by a white bucket target, a big orange ring painted on its rear tyre.

**35. Pin flag with rings** · **B** · 1 m, 3 high · P1. A tall bright flag that marks a target from far away.
> Subject: a tall driving-range target flagstick, about 3 m high, a white pole with a large square fluorescent-orange flag, three coloured hoops (red, yellow, white) round its base lying flat on the grass.

---

## 2. The practice areas (rock features, palms, lights)
The putting green, the chipping green and the bunker area beside the range (and later round the clubhouse). The owner asked for cool
rock features, palm trees and lights. All **(new)** unless marked; T206 (#540) gives the practice areas their own tools, and these go in
as their decoration.

### Rock features

✅ **36. Boulders** (9 made; in the game, T231 #671: Decoration › Stone, Small boulder, Boulder, Large boulder, R the shape) · **B** · 0.8-2.5 m · P1. Make three sizes, three variants each.
> Subject: one weathered sandstone boulder sitting in the grass, rounded, with lichen patches and a little moss on its shaded side. Make nine pictures: small (0.8 m), medium (1.5 m) and large (2.5 m), three different shapes each.

**37. Rock cluster with ornamental grass** · **B** · 3 x 2 m · P1. Three variants.
> Subject: a landscaped cluster of three or four grey-gold sandstone rocks of different sizes, with clumps of tall feathery ornamental grass and a few low succulents between them, mulched with bark at the base.

**38. Rock waterfall** · **A** · 6 x 4 m, 3 high · P1. For a practice green's pond or a course pond.
> Subject: a natural rock waterfall: stacked flat sandstone ledges about 3 m high, water spilling down three small falls into a shallow pool at the foot, ferns and moss in the cracks, a little white foam where the water lands. The pool edge is rocks only (the game paints the pond).

**39. Stacked stone wall** · **R** · a 2 m piece, 0.8 high · P1. A low dry-stone wall round greens and tees.
> Subject: a low dry-stone retaining wall, about 0.8 m high, flat sandstone pieces stacked without mortar, a mown grass top.

**40. Rock-edged palm bed** · **A** · 4 x 4 m, 4 high · P2.
> Subject: a raised round planting bed edged with big rounded river rocks, holding one fan palm and low red and yellow flowering plants, bark mulch, a small brass uplight among the plants shining up the palm's trunk.

**41. Stepping stones** · **C** · 1 x 3 m · P2. A path of stones across the grass.
> Subject: seen from straight above, five flat irregular sandstone stepping stones set in short green grass, in a gently curving line, the grass worn slightly round them.

**42. Pond rocks and reeds** · **B** · 1-3 m · P1. The course's pond edges need them too (T030b's missing pieces).
> Subject: pond-edge pieces: (a) a group of three wet dark rocks half in the water line; (b) a clump of tall green bulrushes with brown cattail heads; (c) a clump of yellow flag irises. One picture each.

### Palm trees

✅ **43. Palm trees** (9 made; in the game, T231 #671: Facilities › Plants › Palms, and Decoration › Plants) · **B** · 3-10 m high · P1. Three species, three variants each (height and lean), cold-hardy palms that suit a 1985
resort-style club. Evergreen: no autumn colours.
> Subject: one palm tree with no ground under it. Make nine pictures: (a) a windmill palm (Trachycarpus), hairy brown trunk, fan leaves, 4, 5 and 6 m high; (b) a Canary Island date palm, thick diamond-patterned trunk, a big round crown of arching fronds, 6, 8 and 10 m high; (c) a dwarf fan palm clump (Chamaerops), several short trunks, 2, 3 and 3.5 m high. Each slightly different lean.

**44. Palm uplight** · **B** · 0.3 m · P2.
> Subject: a small brass ground uplight on a short spike, its lens glowing warm, a soft warm cone of light on the grass in front of it.

### Lights

✅ **45. Practice green lamp post** (single and twin; in the game, T231 #671: Decoration › Furniture, lit at night) · **B** · 3.5 m high · P1. Two variants.
> Subject: a traditional golf club lamp post about 3.5 m high: a dark green cast-iron post with a fluted base and a glass lantern on top, glowing warm; variant two with a twin lantern arm.

**46. Path bollard light** · **B** · 0.9 m high · P1.
> Subject: a short dark green metal bollard light about 0.9 m high, a round cap with a warm glowing band of light under it.

**47. Practice area floodlight** · **A** · 1 x 1 m, 6 high · P2. A smaller mast than the range's, for the putting green after dark.
> Subject: a 6 m galvanised pole on a concrete foot with two rectangular floodlights on a short crossbar angled down to the front, lit warm white.

**48. Clubhouse garden lantern on a stone pillar** · **A** · 0.6 x 0.6 m, 2.2 high · P2.
> Subject: a square sandstone pillar about 2.2 m high with a moulded cap, a black iron lantern on top glowing warm.

### Practice furniture and props

**49. Chipping net** · **B** · 1.5 m · P1. A target net for the chipping green. Two variants.
> Subject: a golf chipping net: a round green net basket on a white steel frame, about 1.5 m across, with an orange target ring at its mouth and a few white balls inside.

**50. Practice bunker rake** · **B** · 1.6 m long · P1. Lying and standing.
> Subject: a golf bunker rake with a long white handle and a green plastic head; picture one lying on sand, picture two standing upright stuck in sand.

**51. Shade umbrella and bench** · **A** · 3 x 3 m, 3 high · P2.
> Subject: a timber slatted bench beside a big round dark green canvas market umbrella on a heavy base, a small side table with a water jug and two glasses.

**52. Putting green cup and flag set** · **B** · 0.9 m · P2. Numbered practice flags.
> Subject: five short practice-green flagsticks, about 0.9 m high, each with a small triangular pennant in a different colour (yellow, red, blue, white, orange), each in its white cup. One picture each.

---

## 3. Pros and memberships (new)
The owner, 2026-10-27: "What about adding pros who help people and sell memberships. Maybe they need an office to work out of." The plan
already earns membership money each month (GOLF-PLAN section 1); the club pros, their office and the membership desk are new. The game
side needs its own plan; the art can be made now.

**53. Pro's office** (`golf:pro-office`) · **A** · 8 x 6 m, 4.5 high · P1. Where the head pro and the membership desk work.
> Subject: a smart small golf pro's office for a 1985 club, about 8 x 6 m and 4.5 m high: cream painted brick with dark green timber trim, a gabled green metal roof, a glazed front door with a brass handle, a big front window showing a desk with a lamp, a framed course map and a rack of golf clubs, a small covered porch with two potted shrubs, a blank brass plaque by the door. Warm light inside.

**54. Teaching pro's hut by the range** (`golf:teaching-hut`) · **A** · 4 x 3 m, 3.5 high · P1.
> Subject: a small timber teaching hut at the end of a driving range, about 4 x 3 m: dark green painted boards, a pitched shingle roof, a wide open front with a counter, inside a chalkboard (blank), a bag of clubs and a VHS video camera on a tripod pointing at the nearest hitting mat, a basket of balls by the door.

**55. Membership desk sign** · **A** · 1.5 x 0.3 m, 2 high · P1.
> Subject: a smart free-standing sign on two posts, dark green with a gold border, a gold crossed-clubs crest and a BLANK cream panel (the game writes the words).

**56. Pro's golf cart** · **D** · 2.4 x 1.2 m · P2.
> Subject: a 1985 club golf cart for the head pro, cream with a dark green canopy, a gold crest on its front, a bag of clubs strapped on the back.

The pros themselves are people: see section 9.

---

## 4. Storage and maintenance (new)
The superintendent's base and everything that keeps the course in shape. Most of it stands in a fenced maintenance yard out of the
golfers' view.

**57. Maintenance barn** · **A** · 20 x 12 m, 7 high · P1.
> Subject: a golf course maintenance barn, about 20 x 12 m and 7 m high: green painted corrugated steel walls, a low-pitched grey roof with a row of skylights, two big roller doors (one open, showing mowers inside), a small office door and window at one end with a light on, a concrete apron in front.

**58. Open equipment shed** · **A** · 12 x 6 m, 4 high · P1.
> Subject: an open-fronted equipment shed: timber posts, a corrugated-iron lean-to roof, a back wall of planks hung with rakes, shovels, hoses and flags, three bays holding a tractor, a trailer and a stack of pallets.

**59. Cart barn** · **A** · 18 x 8 m, 4 high · P2. A bigger barn than the cart garage already in the game (`business:golf-cart-garage`).
> Subject: a long cart barn for golf carts, about 18 x 8 m: cream walls, a dark green roof, six open bays along the front each with a charging cable, two golf carts parked inside.

**60. Workshop** · **A** · 8 x 6 m, 4.5 high · P2.
> Subject: a small brick mechanic's workshop for mowers, a roller door half open showing a workbench, tools on a pegboard and a mower with its cutting reel off, an oil drum outside, a light on inside.

**61. Fuel tank and pump** · **A** · 3 x 2 m, 2.5 high · P1.
> Subject: an above-ground diesel tank on a steel stand inside a low concrete bund, painted red, with a hand pump and hose, a sand bucket and a fire extinguisher on a post beside it.

**62. Sand and soil bays** · **A** · 9 x 4 m, 1.8 high · P1.
> Subject: three concrete-block storage bays side by side, open at the front, holding a heap of white bunker sand, a heap of dark topdressing soil and a heap of grey gravel.

**63. Chemical and fertiliser store** · **A** · 4 x 3 m, 3 high · P2.
> Subject: a small locked brick store with a steel door, a vent, a pictogram-only hazard diamond sign (no words), stacked fertiliser bags on a pallet outside.

**64. Irrigation pump house** · **A** · 3 x 3 m, 3 high · P2.
> Subject: a small square brick pump house with a louvred vent, a pipe coming out of the ground beside it into a valve with a red wheel, a gauge, a light over the door.

**65. Water tank tower** · **B** · 3 m across, 6 high · P3.
> Subject: a round corrugated galvanised water tank on a timber stand about 6 m high, a ladder up one leg.

**66. Compost and clippings heap** · **B** · 4 x 3 m · P3. Two variants.
> Subject: a heap of grass clippings and leaves inside a three-sided timber bay, steam rising faintly, a pitchfork stuck in it.

**67. Sod pallets and fertiliser bags** · **B** · 1.2 m · P2. Three variants.
> Subject: (a) a pallet of rolled turf sod; (b) a pallet of stacked white fertiliser bags (no writing); (c) a pallet of sand bags.

**68. Mower wash pad** · **C** · 6 x 4 m · P3.
> Subject: seen from straight above, a concrete wash pad with a drain grate in the middle, wet patches, a coiled green hose and scattered grass clippings.

**69. Turf nursery** · **C** · 16 m square · P3.
> Subject: seen from straight above, a turf nursery: neat rectangular beds of green turf at different growth stages, from bare soil with seedlings to full sod, separated by narrow mown paths.

**70. Tools and small kit** · **B** · 0.5-1.5 m · P1. One picture each.
> Subject: golf course groundskeeping kit: (a) a green wheelbarrow with a shovel in it; (b) a hose reel on a stand; (c) a rack of rakes, shovels and a broom; (d) a backpack leaf blower standing on the ground; (e) a hole cutter and a bucket of spare flags; (f) a red petrol can.

**71. Greenkeeping vehicles** · **D** · 1.5-4 m · P2. One subject per generation, eight facings each.
> Subjects, one at a time, all 1985 models with no driver: (a) a ride-on triplex greens mower, red, three cutting reels at the front; (b) a five-gang fairway mower pulled by a small green tractor; (c) a rotary rough mower; (d) a three-wheeled bunker rake machine with a rake frame behind; (e) a utility vehicle (a small open truck) with a tipping bed holding sand; (f) a tractor towing a topdresser; (g) a sprayer on a small tractor with booms folded.

**72. Sprinkler spraying** · **B** · 0.3 m and spray · P3. Three frames of animation.
> Subject: a pop-up golf sprinkler head in the grass throwing an arc of water spray, three pictures of the same sprinkler at three points of its turn.

---

## 5. On the course (everyday furniture)
From GOLF-SPRITES section 3 and the owner's additions (2026-10-21), with prompts. **(stand-in)** where the game draws a stand-in.

**73. Flagstick and cup** · **B** · 2.1 m high · P1. Four flag colours plus a plain white tournament flag. `business:golf-pin-red` and `-yellow` are in the game.
> Subject: a golf flagstick, a thin white fibreglass pole about 2.1 m high with a rectangular flag lifting in the breeze, its white cup liner showing at the foot. Make four pictures: red, yellow, white and blue flags, and one with a plain white flag for the tournament logo.

**74. Tee sign** · **A** · 1.2 x 0.3 m, 1.5 high · P1. The game writes the hole, par and length.
> Subject: a golf tee sign on two short timber posts: a dark green board with a gold border and a BLANK cream panel (the game writes the hole number, the par and the length), a small hole-plan shape engraved in its top corner.

**75. Ball washer, bench and bin set** · **A** · 1.8 x 0.6 m, 1.1 high · P1.
> Subject: a tee-side set in a row: a classic green paddle-type golf ball washer on a short post with a white towel, a short slatted timber bench, a small green litter bin.

**76. Yardage posts** · **B** · 1.2 m · P2. 100, 150 and 200 marked by colour, not numbers.
> Subject: three short square timber posts, about 1.2 m high: one with a red top, one white, one blue; the game marks the distance.

**77. Out-of-bounds and hazard stakes** · **B** · 1 m · P2. Laid in runs.
> Subject: three slim timber stakes about 1 m high, one painted white with a black top (out of bounds), one yellow (water hazard), one red (lateral hazard).

**78. Cart path direction signs** · **A** · 0.6 x 0.1 m, 1 high · P2. Pictogram arrows only.
> Subject: a small dark green sign on one post with a white golf cart pictogram and a white arrow pointing right; a second sign with the arrow pointing straight ahead.

**79. Drinking water cooler stand** · **A** · 1 x 0.6 m, 1.2 high · P2.
> Subject: a small timber stand with a big orange-and-white plastic water cooler on top, a stack of paper cones in a holder, a bin beside it.

**80. On-course restroom hut** · **A** · 4 x 3 m, 3.5 high · P1.
> Subject: a small cream painted brick restroom hut with a dark green roof, two doors with man and woman pictograms (no words), a vent, a light over the doors, a hand-wash basin on the side wall.

**81. Rain shelter** · **A** · 4 x 4 m, 3.5 high · P2. Two variants: timber, stone.
> Subject: an open golf course rain shelter, four posts, a steep roof, a bench along two sides inside; variant one all timber with a shingle roof, variant two with stone pillars and a slate roof.

**82. Footbridges** · **R** · 6-12 m long · P1. Wood, stone, and a cart bridge. `business:golf-footbridge` is in the game; the cart bridge and stone bridge are new.
> Subject: one bridge over a narrow golf course stream, about 8 m long: (a) a timber footbridge with handrails; (b) an arched stone bridge with low parapets; (c) a wider flat timber cart bridge with a kerb rail. One subject per generation, drawn along each map axis.

**83. Starter's hut** · **A** · 3 x 2.5 m, 3 high · P1. By the first tee.
> Subject: a small timber starter's hut by a first tee: white painted boards, a green roof, an open window with a counter holding a clipboard and a bell, a blank board beside the window for the tee times, a small bench.

**84. Course map board** · **A** · 3 x 0.3 m, 2.2 high · P2. `business:golf-bench-course-map` is in the game; this is a bigger free-standing board.
> Subject: a free-standing course map board under a small green roof on two timber posts, its face a painted plan of a golf course in greens and blues with no words or numbers.

**85. Tee steps** · **A** · 2 x 1.5 m · P2. Up a raised tee.
> Subject: three wide timber sleeper steps set into a grass bank, a short timber handrail on one side.

**86. Flower beds and planters for tees** · **B** · 1-3 m · P2. Four variants.
> Subject: a tee-side flower planting: (a) a half-barrel planter of red geraniums; (b) a brick-edged bed of yellow marigolds; (c) a round bed of white and purple petunias; (d) a stone trough of trailing ivy.

---

## 6. Around the clubhouse (new unless marked)

**87. Bag drop stand** · **A** · 3 x 1 m, 1.2 high · P2.
> Subject: a long timber bag drop rack under a small dark green canopy, slots for eight golf bags, three bags standing in it (tan, navy, red tartan).

**88. Bag racks** · **A** · 3 x 0.6 m, 1.2 high · P2.
> Subject: a timber golf-bag rack about 3 m long with slots for six bags, two bags in it.

**89. Cart staging canopy** · **A** · 10 x 5 m, 3 high · P2.
> Subject: a long open steel canopy with a dark green fabric roof where golf carts wait in a row, four cream golf carts parked under it.

**90. Flag poles** · **B** · 8 m high · P1. A single pole and a row of three.
> Subject: tall white aluminium flag poles on concrete feet, flags lifting in the breeze: (a) one pole with a dark green club flag and a small gold crest; (b) a row of three poles with plain red, white and blue flags.

**91. Estate gatehouse and gates** · **A** · lane 8 m, street 12 m, avenue 18 m wide · P2. Three widths, one for each road class.
> Subject: a golf estate entrance: two sandstone gate pillars with lanterns, black wrought-iron double gates standing open, and on one side a small sandstone gatehouse with a slate roof and a window lit warm. Make three widths: for a lane (8 m), a street (12 m) and an avenue (18 m).

**92. Club entrance sign** · **A** · 4 x 1 m, 1.5 high · P1.
> Subject: a low sandstone wall sign with a dark green panel set in it holding a gold crossed-clubs crest and a BLANK area for the club's name, a flower bed in front of it, two small uplights.

**93. Patio sets with umbrellas** · **B** · 3 m · P1. Three variants.
> Subject: a round white metal patio table with four chairs under a big round umbrella; variants with a dark green, a cream and a red-and-white striped umbrella.

**94. More pro shop buildings** · **A** · 10 x 8 m, 5 high · P2. Two variants beside `business:golf-pro-shop` **(in the game)**.
> Subject: a 1985 golf pro shop, a single-storey shop with a big display window showing clubs, bags and shirts, an awning, a glazed door; variant one timber with a veranda, variant two brick with a flat roof and a gold fascia (blank).

---

## 7. The tournament
From GOLF-SPRITES section 4, with the angle each needs. The big ones are one item per sheet (the generator's 1024 px limit). Prompts are
short: the shared block carries the rules. In the game already: `golf:grandstand-s`, `golf:leaderboard`, `golf:food-tent`,
`golf:toilet-block`.

| # | Item | Angle | Size (m) | Prompt | P |
| --- | --- | --- | --- | --- | --- |
| 95 | Grandstand M (about 1,000 seats) | A | 40 x 12, 9 high | a tiered steel-scaffold grandstand with green plastic seats, stairs at both ends, a blank sponsor scrim on its back, empty | P1 |
| 96 | Grandstand L horseshoe, a corner piece and a straight piece | A | 80 x 20, 14 high | the same grandstand built big round the 18th green, one piece per sheet, empty | P2 |
| 97 | Practice range grandstand | A | 24 x 8, 6 high | a low grandstand behind a driving range's hitting bays, empty | P2 |
| 98 | Hole scoreboard | A | 2 x 1, 2.5 high | a small manual scoreboard on legs, a blank white face with a green frame | P1 |
| 99 | TV camera tower, three heights | A | 2 x 2, 6 / 10 / 15 high | a scaffold tower with a ladder and a railed platform on top holding a TV camera on a tripod (no operator) | P1 |
| 100 | TV camera on a tripod | B | 1 | a 1985 broadcast TV camera on a heavy tripod with a cable reel | P1 |
| 101 | Video screen trailer | A | 6 x 2, 6 high | a big screen on a trailer, the screen dark and blank | P2 |
| 102 | Outside-broadcast truck, uplink truck | D | 10 x 2.5 | a 1985 outside-broadcast truck with a roof platform; a truck with a satellite dish (no livery words) | P2 |
| 103 | Media centre marquee | A | 24 x 16, 6 high | a long white marquee with clear windows, tables and typewriters inside | P2 |
| 104 | Hospitality chalet, two sizes | A | 10 x 10, 5 high | a white marquee chalet with a glass front, a timber deck, potted bay trees | P2 |
| 105 | Hospitality village (double-deck) | A | 40 x 24, 9 high | a two-storey white pavilion with a glass front and a balcony | P2 |
| 106 | Entrance gate complex | A | 12 x 6, 5 high | an admission arch with a blank banner, turnstiles, bag-check tables, queue barriers | P1 |
| 107 | Ticket office, info booth | A | 4 x 4, 3 high | a small white cabin with a hatch and an awning, blank boards | P1 |
| 108 | Drinks tent / beer garden | A | 10 x 8, 4 high | an open white tent with a bar counter, picnic benches and umbrellas | P1 |
| 109 | Concession kiosk, three variants | A | 4 x 3, 3 high | a small food kiosk with a hatch and a striped awning, pictogram signs (burger, ice cream, coffee) | P1 |
| 110 | Food trucks, four liveries | D | 7 x 2.5 | a 1985 food van with a side hatch open, a pictogram of its food (no words) | P2 |
| 111 | Merchandise tent | A | 12 x 10, 5 high | a white tent with racks of caps and shirts visible at the open front | P1 |
| 112 | Merchandise pavilion | A | 30 x 20, 8 high | a big white pavilion shop with display windows | P2 |
| 113 | Picnic and standing tables | B | 2-3 | a picnic table with benches; a tall standing table; a table under a parasol | P1 |
| 114 | Bin clusters | B | 1.5 | a cluster of a green general bin and a blue recycling bin | P1 |
| 115 | Luxury restroom trailer | A | 9 x 3, 3 high | a smart white restroom trailer with steps and planters | P2 |
| 116 | First aid tent with ambulance | A | 6 x 6, 3 high | a white tent with a red cross, a 1985 ambulance parked beside it | P1 |
| 117 | Water refill station | A | 2 x 1, 1.5 high | a steel water trough with taps under a small roof | P2 |
| 118 | Gallery rope and stakes | R | a 3 m piece | a white rope on short white stakes, with a gap piece for a crossing | P1 |
| 119 | Crosswalk gate | A | 4 x 1, 1.5 high | a gap in a rope line with two small stands holding "quiet" paddles (blank) | P1 |
| 120 | Event fencing with scrim | R | a 3 m piece | a steel crowd barrier with a blank green scrim | P1 |
| 121 | Hole-in-one car on a plinth | A | 6 x 4, 2.5 high | a shiny red 1985 sedan on a low carpeted plinth with a rope round it | P2 |
| 122 | Sponsor flags and banners | B | 1-6 high | feather flags and banner poles in plain colours, blank | P1 |
| 123 | Directional signs | A | 1.5 high | a white sign on a post with a pictogram (car, bus, gate, seat, toilet, first aid) and an arrow | P1 |
| 124 | Trophy presentation stage | A | 10 x 6, 3 high | a low stage with a green carpet, a table with a silver trophy, a blank backdrop | P2 |
| 125 | Volunteer HQ tent, police post | A | 8 x 6, 4 high | a white tent with tables; a portable cabin with a radio mast | P2 |
| 126 | Generator trailer, lighting tower | A | 3 x 2, 8 high | a towed generator; a towed lighting mast with four lamps, lit | P3 |
| 127 | Helipad with helicopter | C + D | 20 x 20 | a top-down helipad with an H; a 1985 helicopter in eight facings | P3 |
| 128 | Shuttle stop shelter and queue barriers | A | 8 x 3, 3 high | a bus shelter with a bench and zig-zag queue barriers | P1 |
| 129 | Large plain white marquees, three sizes | A | 10 x 10, 15 x 10, 20 x 12 | plain white event marquees, no branding, sides rolled up on the front | P1 |

---

## 8. Ground pictures for the course (top-down, C)
| # | Picture | Prompt | P |
| --- | --- | --- | --- |
| 130 | Pond water | still dark green-blue water with soft ripples and a faint reflection of the sky, no edges | P1 |
| 131 | ✅ Pond bank | wet brown mud with reeds and small stones, fading to grass | P1 |
| 132 | ✅ Grow-in | bare brown soil with tiny green seedlings in faint rows | P1 |
| 133 | 🎨 Field parking | mown grass with tyre ruts and worn patches | P1 |
| 134 | Event matting | interlocking grey plastic walkway panels laid on grass | P2 |
| 135 | ✅ Flower bed soil | dark bark mulch over soil, a few fallen petals | P1 |

---

## 9. People (P: one A-pose picture each for the 3D pipeline)
The image generator makes ONE front picture in an A-pose per person (shared block P). RUN.world then makes the 3D model, and Meshy the
clips; the game renders the eight facings (`docs/HANDOVER-PEOPLE.md`). 31 people are in the game already, and 12 more are waiting to go in
(T203).

**136. Head pro** · P1. Clips: walk, idle, the coach clip (point at the ball, a slow half swing), a handshake.
> Subject: a golf club's head professional in 1985: a man in his forties, a navy polo shirt with a small crest, tan slacks, a white visor, a golf glove in his back pocket, holding nothing.

**137. Teaching pro** · P1. Clips: walk, idle, the coach clip, demonstrating a swing.
> Subject: a golf teaching professional in 1985: a woman in her thirties, a white polo shirt, a green sleeveless sweater, navy slacks, hair in a ponytail through a cap.

**138. Membership secretary** · P1. Clips: walk, idle, a handshake, handing over a folder.
> Subject: a golf club's membership secretary in 1985: a smart woman in her fifties in a dark green blazer with a gold crest, a cream blouse, a pleated skirt, low heels, reading glasses on a chain.

**139. Greenkeepers** · P2. Clips: walk, rake a bunker, push a mower, change a hole.
> Subject: a golf course greenkeeper in 1985: green overalls, work boots, a cap; make two people, a young man and an older man with a beard.

**140. Starter** · P2. Clips: idle, wave a group on, ring a bell.
> Subject: an elderly golf club starter in 1985: a tweed jacket, a flat cap, a tie, holding nothing.

**141. Shop assistant and bag boy** · P2. Clips: walk, idle, carry a bag.
> Subject: (a) a young pro shop assistant in a club polo shirt and slacks; (b) a teenage bag boy in a white shirt, green shorts and a cap.

**176. Tour caddie** · P1 (T213 #558: the game draws a stand-in). Clips: walk carrying the bag on the shoulder, idle standing with the bag, set the bag
down, hold the flag. The tour's pros (tiers 3-5) each walk with a caddie who stands off the green while they putt. `staff_caddie_m` was made on
2026-10-24 (`art/spectators/staff_caddie_m`, walk and idle, no bag) but is packed nowhere; the game draws `spec_m_polo_visor` labelled "Stand In for
caddie", with the bag trolley (`business:golf-bag-trolley`) beside him. Wanted: that caddie (or a woman too) with a tour bag on his shoulder in every
frame, packed with the spectators so the game can draw him (`CADDIE_ART` in `engine.ts`).
> Subject: a 1985 tour caddie, a fit man in his 30s: a plain white caddie bib over a navy polo shirt, khaki shorts, a plain white cap, white sneakers, a
> large leather tour golf bag full of clubs on a strap over his right shoulder. No logos, no lettering, no number on the bib.

**177. Golfer celebration clips** · P1 (T213 #558: the game plays a stand-in pose). For every golfer of the cast (`golf_pro_*`, `golf_am_*`): a fist
pump (one arm, about 1 s) and a cap tip (about 1 s), as one-shot sheets like `golf_drive`. Meshy's library has `Victory_Cheer` (59) and `Seated_Fist_Pump`
(304, seated); no standing fist pump or cap tip, so a hand-keyed clip or Mixamo (`docs/HANDOVER-PEOPLE.md` 1c). Until then a golfer who holes a birdie or
better holds the swing's high finish, turned to the camera, with a little hop (`celebrate.ts`, `view.ts` POSE_T).

---

## Already in the game (no new art needed)
- **Buildings:** the clubhouse, the pro shop, the cart garage, the halfway pavilion, the covered range bays, the caravan, the farmhouse
  and its garage and glasshouse, the six-storey car park (its diagonal views in progress).
- **Course furniture:** the bench with course map, the patio table, the bag trolley, the mower, the footbridge, red and yellow
  flagsticks, the bin row, chain-link and picket fences.
- **Tournament:** the small grandstand, the leaderboard, the food tent, the toilet block.
- **Yard props:** the washing line, braais, lawn chairs, cooler, swing seat, birdhouse.
- **People:** 31 golfers, spectators, staff and townspeople (PR #238), plus the 12 waiting for T203.

---

## 10. Greenkeeping (grass care): every grass in five conditions
The owner, 2026-10-27: "we have this massive green keeping section that relies on grass looking a specific way. you need all that art in
the art document".

Greenkeeping (`src/game/ext/grass-management/`, T016) lays a **condition layer** over every managed grass, chosen by its health:
- **neglected → stressed → recovering → maintained → pristine;**
- plus soils, and decals for wear, divots and mowing.

T016 generated all of it on 2026-10-22 (`art/grass-management/textures/`, `decals/`, `DELIVERY.md`), **before the painted style**, so it no
longer matches the new grass (golden fescue, the rough paintings, fringe, putting-green v2). Regenerate it in the painted style, family by
family. Keep each file's id (`<family>-<condition>`), since the game loads them by id.

**Angle C, opaque, a 16 m square** (the base textures), seamless on all four edges, no visible repeat. Each family's five conditions must be
the same grass at the same scale and camera, changing only its state, so the game can blend one into the next.

**How to prompt:** shared block C, then the family line, then the condition line. Attach the family's current painted texture (Studio ›
Painted shows which one) as the identity reference.

### The 16 grass families (`GRASS_SURFACES`)
| Family id | What it is (the family line) |
| --- | --- |
| `golf-green` | a golf putting green: very short dense bentgrass, a fine even grain |
| `golf-fairway` | a golf fairway: short dense ryegrass, mown, even |
| `golf-tee` | a golf tee box: short turf, a little worn where golfers stand |
| `golf-fringe` | the collar round a green: fairway-short turf, slightly longer than the green |
| `golf-first-cut` | the first cut of rough: medium-length grass between fairway and rough |
| `golf-rough` | golf rough: longer, denser, darker grass with some coarse blades |
| `golf-fescue` | deep golden fescue: tall wispy grass, gold and green |
| `driving-range` | a driving range's outfield: mown turf with scattered balls and divot marks |
| `town-park` | a town park lawn: ordinary mixed grass |
| `road-verge` | a roadside verge: rough, mixed grass, a little dusty |
| `residential-lawn` | a backyard lawn: mown ryegrass |
| `meadow` | an uncut meadow: long grasses and leafy wild plants |
| `clover-lawn` | a lawn mixed with white clover |
| `estate-lawn` | a manicured estate lawn: very even, rich green |
| `shaded-lawn` | a lawn under trees: thinner, softer, with some moss |
| `damp-lawn` | a damp low lawn: lush, with soft patches and a little moss |

### The five conditions (the condition line)
| Condition | What it looks like |
| --- | --- |
| `neglected` | long and uneven, patchy, weeds (dandelion, plantain), bare soil patches, brown dead areas, no mowing |
| `stressed` | thinning, dry and yellowing, wilted blades, brown spots, footprints and compaction showing |
| `recovering` | new green shoots coming through thin turf, seeded patches, a mix of fresh green and old brown |
| `maintained` | healthy, even, mown, a few small imperfections |
| `pristine` | immaculate: dense, uniform, rich colour, crisp mowing, not a blade out of place |

### Soils (4 families x 5 conditions)
`loam`, `sandy-soil`, `clay-soil` and `gravel-soil`, each `dry`, `damp`, `compacted`, `churned` and `prepared` (raked and ready to seed). Each
is one picture: the family's soil in that state, seen from above.

### Decal sheets (12): angle C, TRANSPARENT, four separate variants in a 2x2 grid
Each sheet holds four independent overlays laid over any grass; transparent everywhere except the marks; the edges fade out.
| Sheet id | The four variants show |
| --- | --- |
| `mowing-stripes` | light/dark mowing stripes in four widths |
| `mowing-patterns` | checkerboard, diagonal, diamond and circle mowing patterns |
| `crowd-light` | light foot wear: flattened grass in a scattered path |
| `crowd-heavy` | heavy crowd wear: trampled, muddy, bare paths |
| `divots-fresh` | fresh divots: torn turf with a brown soil scar |
| `divots-repair` | divots filled with green-tinted sand seed mix |
| `cart-tracks` | golf cart tyre tracks pressed into turf |
| `mud-footprints` | muddy footprints after rain |
| `dry-patches` | brown dry patches of different shapes |
| `maintenance` | aeration core holes, a topdressing sand film, sprinkler wet circles, a hole plug |
| `leaves-litter` | scattered autumn leaves (maple red, oak brown, gold) |
| `surface-transitions` | soft ragged grass-to-soil edges |

---

## 11. Iconic places (T219, #594)
The owner, 2026-10-27: "custom build some iconic places for the map that we reuse each time like the drive in and a highschool etc". The library
already has the drive-in's marquee (`world:drivein_marquee`), the schools (`world:school`, `world:primary_school`), the school bus, the diner,
the water towers, a silo, a windmill and a fountain. These pieces are missing:

**142. Drive-in movie screen** · **A** · 20 x 3 m, 12 high · P1.
> Subject: a 1985 drive-in theatre's big outdoor movie screen, about 20 m wide and 12 m high: a plain white screen face (blank, a faint glow from the projector at night) on a tall timber frame braced at the back with diagonal timbers and a service ladder, a small projection booth's light visible below it. Front and back are both real: the back shows the bracing.

**143. Drive-in speaker post** · **B** · 0.3 m, 1.2 high · P1. Two variants.
> Subject: a drive-in theatre's speaker post: a short grey steel post with two small chrome window speakers hanging from it on curly cables, one a little crooked.

**144. Drive-in ticket booth** · **A** · 2.5 x 2 m, 3 high · P1.
> Subject: a small 1950s-style drive-in ticket booth: white walls, a red-and-yellow striped canopy, a sliding window with a counter on the driver's side, a little neon star on the roof (lit, no words).

**145. Football goalposts** · **A** · 6 x 1 m, 9 high · P1.
> Subject: an American football goalpost: a single yellow gooseneck post on padding with the crossbar and two tall uprights.

**146. Bleachers** · **A** · 20 x 6 m, 4 high · P1. Two lengths (10 and 20 m).
> Subject: aluminium school bleachers: five rows of grey benches on a steel frame with a handrail at the back, a stair at one end, empty.

🎨 **147. Running track and field** (top-down made: `run-top/iconic-running-track-field/`) · **C** · 100 x 60 m · P1. Top-down.
> Subject: seen from straight above, a high school football field: striped mown grass with white yard lines (no numbers), end zones, inside a red-brown running track with white lane lines curving round both ends.

**In the game now (T219):** both places are built (`src/game/lots/iconic-places.json`), with labelled stand-ins for the speaker posts (143: `world:speaker_post`), the car park
attendant kiosk (`ce:parking-kiosk`) for the ticket booth (144), `world:goalposts` (145), `world:bleachers` (146), and `town:utility_pole` for a flag pole (new: **148. Flag pole**
· **B** · 0.3 m, 9 high · P2: a white school flag pole on a small concrete base with the flag hanging limp, its rope against the pole). The track
(147) is painted ground for now (`dirt` round a `preset:fairway` field with white yard lines). **The screen (142) is no longer a stand-in** (T219b): the drive-in uses the library's own
drive-in screen (`variation:ref-building-drive-in-screen-b0bccc2a-plain:1`, four views), drawn through `src/game/lots/art-fix.ts`, which gives it the
footprint that fits its pictures (5.5 x 1.2 tiles; the library keeps the old sprite's 1 x 8, across them), its true ground point, and the view whose face
looks at the cars at each facing (its SE and NW sheets are the other way round from the game's order). Item 142 stays open only for the town's own
name: the picture's face is painted "Maple Falls Drive-In" (accepted for now: a new drive-in screen that reads blank or "DRIVE-IN" would replace it).

## 12. The concept look (the owner's target, 2026-10-27)

The owner: "this is the look and feel we need to get to". The reference is `docs/art/concept/maple-falls-concept.webp`; what it needs from
the code and why is in [art/CONCEPT-LOOK.md](art/CONCEPT-LOOK.md). **Attach the concept as the second reference on every item here**,
after `theme-authoritative.png`, as a style and colour reference only: never copy its layout, buildings or UI.

### Ground textures (the owner's method, not block C)
Make these by [art/GROUND-TEXTURE-METHOD.md](art/GROUND-TEXTURE-METHOD.md): RUN repaints the layer into a game screenshot, then the tile is
sliced and tiles 2-4 are quilted. Add the concept as RUN's style reference, and ask for its colours: "repaint the [area] as [the item],
in the colours, light and painted style of the second picture". The game draws mowing bands, leaves and edges itself: paint plain turf.

✅ **149. Concept fairway grass** (`fairway-concept-run` v2 on the fairway and the range outfield, #666) · ground · P1. Lush, saturated mid-green, closely mown, a very fine even grain, warm golden-hour light; NO
mowing stripes painted in. For the fairway and the range outfield. Codex has a fairway job: keep whichever set matches the concept.

✅ **150. Concept first cut** (`first-cut-concept-run` v2 on the first cut and the collar round greens, #666) · ground · P1. The collar: a little darker and a touch longer than 149, the same green family.

✅ **151. Concept green** (`green-concept-run` v3 on the greens and the range targets, #666; its MID is provisional: RUN refused the MID edits) · ground · P1. The smoothest, finest and brightest turf; for the greens and the range's target greens.

🎨 **152. Concept rough** (`rough-concept-run`, in Studio › Painted; the owner's rough stays on the course) · ground · P1. A deeper green, longer grass in soft clumps, a few fallen autumn leaves. Green, not gold.

✅ **153. Lawn and meadow** (lawn: `lawn-concept-run` v2 on every yard, #663; meadow: `meadow-concept-run` v2 in Studio › Painted, for the map when the owner says) · ground · P1. Two sets. Lawn: soft ordinary green garden grass with small clover patches, for the yards and the
town blocks. Meadow: the same green, a little longer and uneven, a few tiny wildflowers, for the map's open ground.

🎨 **154. Deep pond water** (`pond-concept-run` tiles-v3, shipped with T230 #669) · ground · P1. Dark teal-green still water, darker toward the middle, soft ripples, a faint reflection of a warm
sky. It replaces item 130.

**155. Lake water with a soft swell** · ground · P2. Deep blue-teal open water, a gentle wave pattern, small warm glints.

**156. Plaza paving** · ground · P1. Warm sandstone and red-brick pavers in a herringbone, for the clubhouse plaza and a town square.

**157. Building-site dirt** · ground · P2. Graded bare earth with tyre and track marks and a few stones. Try `dirt-run` first.

### Water features
✅ **158. Pond-edge boulders** (`landscaping/golf-pond-edge-boulders-pieces-v1.png`; in the game, T231 #671: Stone pond edge; laid at 8 x 2 m a piece, the stones at the boulders' scale; T234 #683: not a ring wall, then boulder-led as in the concept: the rim is large and medium boulders (36) every 1.5-3 m, half on the bank and half in the water, with plume grass, shrubs (162) and mums (163) on the bank in the gaps; these run pieces are only short fills (1.2-2.2 m) in breaks of a straight shore, at most a third of it, and the corner clusters (inner, outer) are no longer laid; nothing stands more than 0.5 tile out onto land but the planting; ponds.ts) · **R** · 1 x 4 m a piece · P1.
> Subject: a pond's rim of rounded grey granite boulders of mixed sizes, set tight along the edge, moss and a few small autumn flowers between them, the stones dark and wet at the waterline. The water side of the piece faces the screen's lower edge. Make an inner corner and an outer corner as the extra items.

✅ **159. Fountain jet** (`props/golf-fountain-jet-4frames-v1.png`; in the game, T231 #671: Fountain jet and Fountain pond, animated) · **B** · 1.5 m across, 4 m high · P1. Four frames of a loop.
> Subject: a single tall fountain jet of water rising from a still pond's surface, a crown of spray at its top, a ring of ripples and foam at its foot, the water white-blue catching warm light. Only the water: no basin, no pond. Four frames of the same jet in one row, the spray shapes moving, so they loop.

✅ **160. Lily pads** (`landscaping/golf-lily-pads-top-v1.png`; in the game, T231 #671: on stone-edged ponds; T234 #683: the art is autumn olive and orange, so prep-kit.mjs moves its hue toward green (greenPads; GREEN_PADS = false keeps it as painted; switch it off if the art agent repaints it green) and a cluster is laid 3.4-4.8 m across so it reads at 30% zoom) · **C** decal sheet on magenta, four variants · P1.
> Subject: seen from straight above, a cluster of round green lily pads of mixed sizes floating flat, a few with a notch, two white water-lily flowers with yellow centres. Four different clusters in a 2x2 grid on flat pure magenta.

**161. Lake-shore rocks** · **R** · 2 x 4 m a piece · P2.
> Subject: a rocky lake shore of large weathered granite boulders and flat slabs, lichen on top, dark and wet at the bottom, a little pale sand between them.

### Planting
✅ **162. Autumn shrubs** (all 6; in the game, T231 #671: Plants › Bushes, Decoration › Plants, the yards) · **B** · 1-1.5 m · P1. Six variants: burning bush in scarlet, golden spirea, a clipped green boxwood ball, a
red-twig dogwood with orange leaves, a blue-green juniper, an ornamental grass with pale cream plumes. No pink or purple (the magenta key).
> Subject: one garden shrub (the variant named above), full and round, in autumn colour, standing on its own.

✅ **163. Autumn flower clumps** (all 6; in the game, T231 #671: Plants › Flowers, Decoration › Plants, the yards) · **B** · 0.6 m · P1. Six variants: chrysanthemums in red, yellow, orange, white and bronze, and a clump
of black-eyed Susans. No pink or purple.
> Subject: one dense mounded clump of garden chrysanthemums (the colour named above) in full bloom, the flowers small and many, dark green leaves showing at the bottom.

✅ **164. Clipped hedge** (`landscaping/golf-clipped-hedge-pieces-v1.png`; in the game, T231 #671: Decoration › Plants › Hedge row, a run, and the yards) · **R** · 0.7 m deep, 0.9 m high · P1.
> Subject: a neatly clipped dark-green boxwood hedge with a flat top and straight sides, a few autumn leaves caught on top.

**165. Low fieldstone garden wall** · **R** · 0.5 m deep, 0.7 m high · P2.
> Subject: a low dry-stone garden wall of rounded grey and brown fieldstones with a flat capstone row, moss in the joints.

**166. Tree-line conifers** · **B** · four variants · P2. Only if the library's conifers run short for framing holes. Tall narrow spruces
and white pines, 12-18 m high.

### The club
**167. The country club clubhouse** · **A** · 36 x 22 m, 14 m high · P1. The club's top tier, the concept's clubhouse. Identity: the
concept, the large brick building behind the patio with the red umbrellas.
> Subject: a grand New England country club clubhouse: red brick with white trim, many steep gables and dormers, a dark grey slate roof, three brick chimneys, a white columned portico at the entrance, a long covered veranda along the front, tall windows warmly lit from inside, flower boxes. No patio furniture and no lettering.

### Building sites
**168. Excavator** **BLOCKED in RUN** (the two views did not hold one rigid machine; T232 draws the library's digger, `construction:digger`, 6 x 3 m, unmirrored) · **A** · 3 x 9 m, 3.5 m high · P1.
> Subject: a yellow tracked excavator parked with its arm folded and the bucket resting on the ground, a dark cab, dried mud on the tracks. The 1985 look, no lettering.

🎨 **169. Timber frame going up** (`buildings/golf-timber-frame-2views-v1.png`, provisional; in the game, T232 #673: `construction:timber-frame-1` and `-2`, 10.4 m square, a house site's frame. The two views are one frame turned half round, not a quarter: view 1 where the street lies toward the camera, view 2 where away. View 2 lacks the ladder) · **A** · 12 x 9 m, 3 m high · P1.
> Subject: a house under construction: pale new timber wall studs and plates standing on a grey concrete slab, window and door openings framed, no roof yet, a ladder leaning on one wall, a few stacked studs on the slab.

🎨 **170. Lumber stacks** (a, b, c; in the game, T232: `construction:site-lumber-a`, `-b`, `-c`) · **B** · 3 variants · P1.
> Subject: a stack of new pale timber planks on two bearers, strapped, a few loose planks on top.

🎨 **171. Dirt and gravel heaps** (earth, gravel, sand; in the game, T232: `construction:site-heap-earth`, `-gravel`, `-sand`, 3 m across) · **B** · 3 variants · P1.
> Subject: one heap of loose brown earth (or grey gravel, or pale sand), about 3 m across, a shovel stuck in its side.

**172. Survey stakes** · **B** · 2 variants · P2. The game draws the white dashed boundary itself.
> Subject: a wooden survey stake with orange flagging tape tied at the top, driven into bare earth.

### On the course
**173. Hire golf cart** · **D** · 1.2 x 2.4 m, 1.8 m high · P1. The fleet cart (item 56 is the pro's own). **Art gap (T213 #558):** the carts in the
field (the small events' amateurs, the everyday visitors) are drawn with `business:golf-cart-sw` and `-se`, the only two facings there are (the front to
the screen's lower left or lower right); a cart driving up the screen shows the nearer of the two. The eight facings fix that (`CART_ART` in `engine.ts`).
> Subject: a white 1985 two-seater golf cart with a cream canopy on four posts, a bag rack at the back holding two golf bags, small headlights. No people and no lettering.

### Vehicles (T236, #693: colour in the streets and car parks)
T228 recoloured the two wood-panel wagons in the shader; the audit (T236) found no paint clean on either (patchy hoods, orange rims, painted
chrome), so painting is off and the cars keep their art's colours. The car parks now mix in the library's old cars (the yellow pickup, the
world cars, the compacts), but those have only one to six facings, so they only park in bays they have a view for; **every car that drives
is still one of the two wagons**, burgundy or navy (the traffic, the range's and the club's golfers' cars). Eight-facing vehicles in new
colours fix that: the game adds each to the drivers (`vehicles.ts` `VEHICLES`, all eight views) and to the bays. **Each colour is its own
set of eight pictures**: never recoloured in code. Size them as the wagons (`art/cars/burgundy-wagon/`: a 4.5 m car about 200 px wide in
its SE view); attach that SE picture as the scale and camera reference after the style references.
**RUN's multi-view turns have failed before** (the excavator, item 168: the views did not hold one rigid machine; the four-view pilot): make
each facing its own generation, matched to the first, and reject a set where the length, wheelbase, colour or trim changes between facings,
or where a facing is a mirrored copy of another (the sun must stay at the upper right in all eight).

**178. 1985 pickup truck, three colours** · **D** · 5 x 1.9 m, 1.8 m high · P1. Three sets: white, bright red, forest green (the library's
pickup is mustard yellow and the wagons burgundy and navy: not those).
> Subject: a 1985 full-size American pickup truck, a squared-off regular cab and a long open bed (empty), chrome front bumper and grille, round headlights, steel wheels with small hubcaps, painted solid [colour]. Clean and well kept, no rust, no lettering, no number plate text.

**179. 1985 sedan, three colours** · **D** · 4.8 x 1.8 m, 1.4 m high · P1. Three sets: white, silver-grey metallic, black (the street's
commonest colours, which the car parks still lack).
> Subject: a 1985 American four-door family sedan, a long boxy body with a formal roofline, chrome bumpers and window trim, a full-width grille, rectangular headlights, whitewall tyres, painted solid [colour]. No wood panels, no vinyl roof, no lettering, no number plate text.

**180. Grey stone water border, with planting** · **R** kit · P1. The owner, 2026-10-28: "we need more rocks. grey stone rocks with plants and foilage that tiles well for the border sprite that surounds water as a border you can turn on and off." Replaces the tan boulders (36, 158) on water edges; the concept's rims are grey and rose-grey granite with ferns, grasses and small shrubs between. Made in ChatGPT (RUN is 3D only): the prompts are in [art/CHATGPT-IMAGE-QUEUE.md](art/CHATGPT-IMAGE-QUEUE.md) "Grey stone water border".
- **180a run pieces**: one 4 m piece along the map's x axis and the same along the y axis (block R), rocks of mixed sizes half in the water, planting tucked between; both ends cut so pieces join end to end.
- **180b corners**: an inner corner and an outer corner piece (each axis pair).
- **180c single boulders**: six grey granite boulders, 0.6-2 m, three with a fern or grass tuft at the foot.
- **180d planting tufts**: six tufts for the gaps: ferns, a sedge, cattails, a low juniper, golden grass, a small red-leaf shrub (no pink or purple: the magenta key).
Lit from the upper right, never mirrored, on flat pure magenta.

**Farms** (the owner, 2026-10-29: "lets add some corn fields to the art work so we can plant tehse fields you created for the farms and make a better texture for the un planted fields and maybe make some orchards quickly with some treees all in a line and have the actual famrshouses further wawa from the road, deeper in land with a row of trees down the dirt road to the house like they do on farms to break the wind"). Made in ChatGPT; prompts in [art/CHATGPT-IMAGE-QUEUE.md](art/CHATGPT-IMAGE-QUEUE.md) "Farms". The code is T259.

**185. Corn field** · ground, the owner's method · P1. Two stages: **young** (short green corn in straight rows over brown soil) and **ripe** (tall golden-tan corn, dry tassels, autumn). Rows run along the map's x axis; the game turns them by the field's direction. Plus a **stubble** stage (cut stalks after the harvest).
**186. Ploughed field** · ground, the owner's method · P1. Freshly ploughed dark brown soil in neat parallel furrows with a few clods and stones; replaces the plain dirt look of unplanted fields.
**187. Orchard trees** · **B**, four variants · P1. Apple trees in autumn: a round canopy, red apples, a few fallen under it; a pear tree; a young apple tree; an apple tree half bare with yellow leaves. Each about 4-5 m high, pruned low and wide like orchard trees. No pink or purple.
**188. Windbreak poplars** · **B**, three variants · P1. Tall narrow Lombardy poplars, 15-20 m, in autumn gold, green-gold and half bare; planted in a line along a farm lane.
**189. Farm lane** · ground · P2. A two-rut dirt farm lane with a grass strip down the middle (or use the dirt path textures if they read right).

### UI pictures
✅ **174. Build-tool tiles** (`ui/golf-build-tool-tiles-sheet-v1.png`; in the game, T233 #674: cut by `scripts/assets/prep-ui-tool-tiles.mjs` into `src/assets/ui/tiles/`, shown on the Course and Facilities flyouts' tools by `ui/tool-tiles.ts`; the tools still without one are requested in GOLF-SPRITES.md "Build-tool tiles") · one sheet of 12 · P1. The build flyouts' tools as small illustrated scenes, as in the concept's Golf Course panel.
> Subject: twelve tiny isometric dioramas in a 4x3 grid, each on its own dark navy rounded square, the light from the upper right: a tee box, a fairway, a green with a flag, a bunker, a pond, rough grass, a clump of autumn trees, a group of boulders, a curving cart path, a small clubhouse, the range bays, a flower bed. The same scale and style in every tile; no lettering.

**175. Top-bar icons** · one sheet of 6 on magenta · P2.
> Subject: six small flat painted icons in a row, gold and cream with a dark outline: a bundle of banknotes, a smiling face, two golfers, a maple leaf, a sun, a cloud. No lettering.

## 13. Set the scene, portraits and you (P28, the owner 2026-10-28)

The owner: "I want lots of "Set the scene" artwork that shows you scene images of what is currently in focus ... a nostalgic 1980s
america close up of the building or inside the building or outside ... both a starting poor run down "set the scene" image and a later
upgraded nice looking one. even the towns people get healthier and better looking as your driving range and course does better."
The design is in [plans/P28.md](plans/P28.md). Items are numbered from 200 to stay clear of other sections.

### The shared blocks for this section
**S. A set-the-scene picture** (one wide painted image, RUN's strength: no turns).
> One painted illustration, 16:9, of the place described below, as a warm, nostalgic 1985 small-town America scene, in the detailed illustrated style of reference 1 (and the colours of the concept picture, reference 2). A cinematic eye-level or slightly raised view, the kind a film would open on. Late-afternoon autumn light, warm sun from the upper right, long soft shadows. Period details only: 1985 cars, signs, clothes, technology (no phones, no LEDs, no modern logos). A few people going about their day where it fits, never posing. No text other than the signs the place would really have (the place's name may appear on its sign), no UI, no frame, no caption.
For each item: make the **run-down** version (hard times: faded paint, weeds, dust, makeshift repairs, few people) and the **upgraded**
version (good times: fresh paint, tidy planting, busy, proud). Same viewpoint and composition in both, so the card can swap them.

**Q. A portrait.**
> One painted head-and-shoulders portrait, 1:1, of the person described below, in the detailed illustrated style of reference 1: a 1985 small-town American, period hair and clothes, looking at the viewer with a natural expression, soft warm light from the upper right, a plain warm painted background. No text, no frame, no props unless named.
For each archetype: a **hard times** version (tired, worn or dated clothes, a little unkempt) and a **good times** version (healthy,
well dressed, confident). Same person, same pose, same framing.

### The range and the club (S, run-down and upgraded)
🎨 **200. The range from the road** (made: `scenes/`, run-down and upgraded): a desert driving range off a county road: a tin-and-tarp shack, four mats on dirt, a dirt car park, a hand-painted sign. Upgraded: a striped green outfield with target greens, covered bays, a paved car park, the clubhouse beyond. P1.
🎨 **201. The hitting bays, close** (made: `scenes/`, run-down and upgraded): run-down: worn mats on packed dirt, a split bucket of balls, a bent divider, a dusty tee line. Upgraded: covered bays with lights, fresh mats on turf, a ball dispenser, golfers mid-swing. P1.
🎨 **202. Inside your home** (caravan and farmhouse pairs; the cottage's upgraded picture still to make): three stages: the caravan (cramped 1985 trailer: a fold-down table with a ledger and coffee, a small TV, a golf bag by the door), the cottage, the farmhouse (a warm kitchen, trophies on a shelf). P1.
🎨 **203. The pro shop** (made: `scenes/`, run-down and upgraded): run-down: inside the tin shack, a counter of plywood, a few used clubs, a cash box. Upgraded: the pro shop with racks of clubs, a glass counter, shirts on hangers. P1.
🎨 **204. The practice green** (made: `scenes/`, run-down and upgraded): run-down: a patchy green with one flag on dirt. Upgraded: a manicured putting green with flags, golfers putting. P1.
**205. The car park**: run-down: a dirt lot with a few dusty cars. Upgraded: paved bays, lamps, tree islands, a full lot. P2.
**206. The clubhouse, outside**: one per tier, from the starter clubhouse to the grand country club (167). P1.
**207. The clubhouse, inside**: the bar and lounge, one per tier (a few stools and a TV, then wood panelling and leather). P1.
**208. The halfway house**: a small snack hut by the 9th, then a smart pavilion. P2.
**209. A hole on your course**: run-down: a scrubby young fairway, thin grass. Upgraded: the concept's look (striped fairway, bunkers, autumn woods, a pond). P1.
**210. Tournament day**: a few folding chairs and a chalkboard; then grandstands, flags and a crowd. P2.

### The town (S, outside and inside where named; run-down and upgraded)
🎨 **211. The video store** (outside and inside): outside: a strip-mall video rental store with posters in the window and a lit sign (run-down: faded posters, a flickering sign; upgraded: neon, new-release cut-outs, a queue). Inside: rows of VHS boxes, a new-releases wall, a clerk at the counter, a drop box. P1.
**212. The diner**: outside: a chrome diner. Inside: booths, a counter with stools, pie under glass, a waitress with coffee. P1.
**213. The gas station**: pumps, a little shop, a mechanic in the bay. P1.
**214. The motel**: a roadside motel with a vacancy sign, cars at the doors. P2.
**215. The sports bar**: outside, and inside with the golf on the TV. P2.
**216. The fish-and-tackle shop**: outside, and inside with rods and lures. P2.
**217. The drive-in at night**: cars facing the screen, the projector beam. P1.
**218. The high school**: Friday night football under the lights. P2.
**219. Main Street**: the downtown street of shops. P1.
**220. A family house and yard**: run-down: peeling paint, a dry yard, an old car. Upgraded: fresh paint, a green lawn with leaves, kids' bikes, a hedge. P1.
**221. A farm**: a farmhouse, a barn and fields. P2.
**222. Town hall and the mayor's office**: for the Mayor's Cup. P1.
**223. The hotel, the casino, the stadium**: one each, late-game, upgraded only. P3.
**224. The junk yard**: run-down only. P3.

### More places (S): the owner, 2026-10-28: "these were just examples. you better add a shit ton more"
Everything a player can look at gets a picture. Each has a run-down and an upgraded version unless marked *(one)*. Inside views are marked *(in)*.
Pairs of outside and inside are two items' worth of work.

**The range and the practice areas**
**240. The tee line at dawn**: the first golfer of the day hitting the first bucket, mist on the outfield. P1.
**241. The ball picker** driving the outfield, balls rattling into the cage. P1.
**242. The bucket counter** *(in)*: the window, the price board, a kid paying in coins. P1.
**243. The range at night**: under floodlights, moths in the beams. P2.
**244. The target greens close**: flags, balls lying round the pin. P2.
**245. The chipping green and its bunker**: a golfer splashing out of the sand. P1.
**246. A lesson**: the teaching pro and a student at the teaching hut. P1.
**247. The pro's office** *(in)*: a desk, a calendar, a club on the wall (P26). P1.
**248. The membership desk** *(in)*: the secretary, the forms, a framed course map. P2.

**The course and the club**
**249. The cart barn** *(in)*: rows of carts charging. P2.
**250. The maintenance barn at dawn**: greenkeepers heading out on mowers. P1.
**251. The 1st tee**: the starter, a foursome waiting, the course stretching away. P1.
**252. The 18th green**: the last putt, a few watchers (then a big crowd). P1.
**253. The locker room** *(in)*. P2.
**254. The clubhouse grill** *(in)*: lunch after the round. P2.
**255. The clubhouse patio**: red umbrellas, drinks, the 18th beyond (the concept). P1.
**256. The trophy cabinet and members' honours board** *(in)*. P2.
**257. The halfway house window**: hot dogs and a cold drink. P2.
**258. The clubhouse fountain pond and plaza** (the concept). P1.
**259. A course pond**: boulders, lily pads, autumn reflections (the concept). P1.
**260. The cart path** through the autumn woods. P1.
**261. A footbridge** over the creek. P2.
**262. The swamp** on a misty morning. P2.
**263. The fescue and the waste area** in late light. P2.
**264. The leaderboard** on tournament day: chalk to a big board. P1.
**265. The TV tower and the broadcast truck** *(one, upgraded)*. P3.
**266. The hospitality chalet and the beer garden** *(one, upgraded)*. P3.
**267. The grandstands, full** *(one, upgraded)*. P2.
**268. The trophy presentation** on the 18th green: the mayor, the winner, the cheque. P1.
**269. The car park on tournament day**: overflowing onto the grass. P2.
**270. The ticket gates and the shuttle stop**. P3.

**Main Street and the town's businesses** (outside and *(in)*)
**271. Main Street at night**: neon, a cruising car. P1.
**272. The barber shop** *(in)*: the pole, the chair, the radio. P1.
**273. The hardware store** *(in)*. P1.
**274. The grocery store** *(in)*: checkout, a paper bag, a cereal aisle. P1.
**275. The pharmacy and soda fountain** *(in)*. P2.
**276. The bank** *(in)*: the loan officer's desk, where you ask for a loan. P1.
**277. The post office**. P3.
**278. The arcade** *(in)*: 1985 cabinets, kids, tokens. P1.
**279. The bowling alley** *(in)*. P2.
**280. The record store** *(in)*: vinyl and cassettes. P2.
**281. The movie theatre**: a single screen, the marquee. P1.
**282. The pizza place** *(in)*. P2.
**283. The burger drive-in**: carhops, a tray on the window. P2.
**284. The laundromat** *(in)*. P3.
**285. The car dealership**: bunting, a new model on the lot. P2.
**286. The auto repair garage** *(in)*: a car on the lift. P2.
**287. The church**: Sunday morning. P2.
**288. The fire station**: the engine out front. P2.
**289. The sheriff's office** *(in)*. P2.
**290. The library** *(in)*. P3.
**291. The elementary school**: recess. P3.
**292. The high school hallway** *(in)*: lockers, letter jackets. P2.
**293. The doctor's clinic** *(in)*. P3.

**Homes and neighbourhoods**
**294. The town park**: a gazebo, a duck pond, a band on Sunday. P1.
**295. The playground**. P3.
**296. Little League**: the baseball diamond, parents in the stands. P2.
**297. The community pool** in late summer. P3.
**298. The trailer park**. P2.
**299. A suburban street at dusk**: kids on bikes, sprinklers. P1.
**300. A family kitchen** *(in)*: wall phone, avocado appliances. P1.
**301. A living room** *(in)*: the TV, a VCR, a game on. P1.
**302. A teenager's bedroom** *(in)*: posters, a cassette deck. P2.
**303. A backyard barbecue**: neighbours, a grill, lawn chairs. P1.
**304. A garage workbench** *(in)*: tools, a golf bag in the corner. P3.

**Work and the countryside**
**305. The barn** *(in)*: hay, a tractor. P2.
**306. The grain elevator and co-op**. P2.
**307. The factory**: shift change at the gate. P2.
**308. The railway crossing and depot**. P2.
**309. The bus depot**. P3.
**310. The taxi office** *(in)*. P3.
**311. The water tower** with the town's name. P2.
**312. The river and the old bridge**. P1.
**313. The fishing pier** at the lake. P2.
**314. The boat launch**. P3.
**315. The campground**. P3.
**316. The valley overlook**: the whole town and your course below (gets greener as you grow). P1.
**317. The county fair** *(one)*: rides, prize pigs, a golf putting booth. P2.

**Seasons, weather and events** *(one each)*
**318. Halloween on Main Street**. P2.
**319. Christmas on Main Street**: snow, lights. P2.
**320. The Fourth of July parade**. P2.
**321. Spring planting** on the course. P3.
**322. A rainy day** at the range: one stubborn golfer under an umbrella. P2.
**323. Snow on the course**: the winter shutdown. P2.

**Later in the game (upgraded only)**
**324. The motel room** *(in)*. P3.
**325. The hotel lobby** *(in)*. P3.
**326. The casino floor** *(in)*. P3.
**327. The stadium** on game night. P3.

### People (Q, hard times and good times)
**230. Townspeople portraits, 48 archetypes**: three ages (20-30, 30-50, 50-70) x two sexes x eight jobs: farmer, mechanic, teacher, shop clerk, diner waitress or cook, office worker, nurse, retiree; plus 8 more: a high school kid, a video store clerk, a gas attendant, a construction worker, a banker, the sheriff, the mayor, a club golfer. Each in hard times and good times. P1.
**231. Club people portraits**: the head pro, a teaching pro, the membership secretary, a greenkeeper, a caddie, the starter, a bartender, a tour pro (P26 and T213's people). Each in hard times and good times. P1.
**232. Your portraits**: 12 looks (men and women, ages 25-60), matching the player's 3D looks (233). P1.

### You in 3D (P, the 3D pipeline: `docs/HANDOVER-PEOPLE.md`)
**233. The player's 12 looks**: A-pose pictures for the 3D pipeline (block P), 1985 golf-casual clothes, one per look in 232. P1.
**234. The player's clips**: idle, idle with a club twirl, watching, talking (a hand gesture), walking, the drive, the putt and the chip (T212's clips), a fist pump and a cap tip (177). Meshy's library or RUN's animate. P1.
**235. The townspeople's good-times clothes**: a second, smarter clothing set for the townspeople models already in the game (block P), so the 3D town looks healthier as the club does well (T245). P2.
