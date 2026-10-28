# Golf sprites and textures: what to make (v6, 2026-10-21)

**The image generator's list, with prompts and the angle every item needs:** [GOLF-ART-LIST.md](GOLF-ART-LIST.md) (2026-10-27: the range, fun
targets, practice areas, pros and memberships, storage and maintenance, the course, the clubhouse, the tournament, people).

The art the golf events game needs ([GOLF-PLAN.md](GOLF-PLAN.md)): course furniture, the tournament's temporary structures,
people, vehicles and the painted surfaces. **Nothing here is a whole hole:** greens, fairways, tees, bunkers and water are
painted with the Paint tool (textures, section 6). Sprites are the objects that stand on them.

## 1. Rules every sprite follows (from GAME-PLAN 2.2 and ART-PIPELINE.md)
- **Camera and scale:** the TrickOrTreat iso camera (2:1, 128 px per tile native); real size by the owner's scale table (one game
  unit is 1 m); packed at 0.6x of the largest scale the game draws it at.
- **Facings:** unflipped art faces +Y, flipped art faces +X. **Buildings and stands need a front view and a rear view**, so they
  can face a hole or a road from any side. **Anything with lettering** (scoreboards, signs, banners, the tournament logo) needs
  its own art per side, because lettering is never mirrored.
- **No lettering in the generated art (the owner, 2026-10-21):** signs are pictograms, banners and boards are blank; lettering
  may be added by hand later, not now. So every golf sprite can be mirrored to face either way.
- **Readability at 30% zoom:** anything under about 0.5 m becomes a ground decal or is drawn slightly over-size (tee markers,
  ball washers, rakes: marked "decal or 1.5x" below).
- **No baked ground:** sprites come on transparent backgrounds with no grass under them. Shadows are soft and short, as on the
  existing sprites.
- **Making them:** RUN.world image generation through TrickOrTreat's sheet runner (`scripts/town-variations/runner.mjs`: sheets
  of 4–8 items on magenta, sliced into the builder library), read here through the prep scripts, never written into TrickOrTreat.
  RUN's current model makes 1024 px images (the 2K model is not on the plan), so big structures (the L grandstand, the
  hospitality village, the broadcast compound) need **one item per sheet** to keep their detail.
- **Priority:** **P1** for tiers 1–3 and the MVP (phases G1–G4), **P2** for tiers 4–5 (G5–G6), **P3** later (G8–G9).

## 2. Existing art we keep using
| Art (atlas id) | Use in golf mode |
| --- | --- |
| `business:golf-clubhouse`, `golf-pro-shop`, `golf-cart-garage`, `golf-halfway-pavilion` | The clubhouse area and the halfway house |
| `business:golf-practice-net`, `golf-driving-range` | The practice area; `golf-driving-range` is also the range's covered bays (`rangeScene`, until the range kit below, P1) |
| `business:golf-bench-course-map`, `golf-patio-table`, `golf-mower`, `golf-bag-trolley`, `golf-footbridge` | Course furniture |
| `business:golf-pin-red`, `golf-pin-yellow`, `golf-pin-red-equipment` | Flagsticks (until the new pin set) |
| `business:golf-cart-sw`, `golf-cart-se` | Golf carts (two facings: needs the 8-facing set, P1) |
| `business:bus-sw`, `bus-se`, `taxi-sw`, `taxi-se`, the 8-direction cars | Shuttles, taxis, spectators' cars |
| `ce:parking-*` (entrance and exit gates, P sign, kiosk, pay station, IN sign) | Spectator car parks |
| `business:hotel`, `motel`, `diner`, `sportsbar` | Town growth with the tournament |
| Townspeople (40 walkers) | Placeholder spectators until the spectator set |
| Forest and lot trees, hedges, flowers | Course landscaping |

**Retired in golf mode** (the holes are painted): `golf-fairway-curved`, `golf-fairway-dogleg`, `golf-green-kidney-flagged`,
`golf-green-unflagged`, `golf-bunker-organic`, `golf-bunker-crescent`, `golf-tee-box`, `golf-pond`. Also unused in golf mode, and
candidates to drop from the atlas for GPU memory: the Halloween sets (monsters, pumpkins, the arcade).

## 3. The course (everyday furniture)
| Sprite | Size (m) | Views and variants | Notes | P |
| --- | --- | --- | --- | --- |
| Flagstick and cup | 2.1 tall | flags red, yellow, white, blue; flag waving 2 frames; the tournament flag (logo) | thin: keep the stick 2 px at mip 0 | P1 |
| Tee markers | 0.3 | blue, white, red, gold, black pairs | decal or 1.5x | P1 |
| Tee sign (hole number, par, length) | 1.2 x 1.5 | numbers 1–18 as overlays; front and rear | lettering: per side | P1 |
| Ball washer and bench set | 1.8 wide | one set; a trash can | decal or 1.5x for the washer | P1 |
| Yardage posts (100, 150, 200) | 1.2 | 3 colours | decal or 1.5x | P2 |
| Out-of-bounds and hazard stakes | 1.0 | white, yellow, red | decal or 1.5x; in runs like fences | P2 |
| Bunker rake | 1.6 long | lying, standing | decal | P2 |
| Cart path signs, "To 10th tee" arrows | 1.0 | 2 | lettering per side | P2 |
| Drinking fountain / water cooler stand | 1.2 | 2 | - | P2 |
| On-course comfort station (restroom hut) | 4 x 3 | front, rear | - | P1 |
| Rain / lightning shelter | 4 x 4 | open wooden; stone | front, rear | P2 |
| Footbridges | 6–12 long | wood, stone, cart bridge | X and Y facings | P1 |
| Irrigation pump house | 3 x 3 | front, rear | - | P3 |
| Maintenance barn and yard (equipment, sand and soil piles) | 20 x 12 | front, rear | the superintendent's base | P2 |
| Greens mower, fairway mower, utility vehicle | 1.5–3 | 8 facings | movers (G7) | P2 |
| Sprinklers spraying | 0.3 + spray | 3 frames | evening flavour | P3 |
| Flower beds and planters by tees | 2–4 | 4 | the beauty score | P2 |
| Practice green flags (short, numbered) | 0.8 | 5 | - | P2 |
| Range kit: target flags, distance boards, ball dispenser, hitting bay dividers, mats, ball-picker cart | various | sets | the driving range every range start opens with (P22 T096; the rows are in "The range business kit" below) | P1 |
| Bag drop stand, bag racks, club storage | 2–4 | front, rear | by the clubhouse | P2 |

## 4. The tournament (temporary structures)
| Sprite | Footprint (m) / height | Views and variants | Notes | P |
| --- | --- | --- | --- | --- |
| **Grandstand S** (about 200 seats) | 16 x 8 / 5 | front, rear; empty and full (crowd layer) | modular end pieces | P1 |
| **Grandstand M** (about 1,000) | 40 x 12 / 9 | front, rear; empty, full | stairs, a sponsor scrim on the back | P1 |
| **Grandstand L horseshoe** (about 4,000) | 80 x 20 / 14 | front, rear, the two corner pieces; empty, full | one item per sheet; around the 18th green | P2 |
| Practice range grandstand | 24 x 8 / 6 | front, rear | - | P2 |
| **Main leaderboard** (the big manual board) | 8 x 3 / 7 | front, rear; blank board (names drawn by the game) | lettering by code, not in the art | P1 |
| Hole scoreboard | 2 x 1 / 2.5 | front, rear | - | P1 |
| Video screen on a trailer | 6 x 2 / 6 | front, rear | - | P2 |
| **TV camera tower** (scaffold, camera and operator on top) | 2 x 2 / 6, 10 and 15 | 3 heights; front, rear | "from camera stand": the tall ones see more holes | P2 |
| TV camera crane / jib | 4 x 2 / 8 | 2 | by the 18th | P3 |
| Camera operator on the ground, photographers' platform | 1–3 | 2 | - | P2 |
| **Broadcast compound**: outside-broadcast trucks, satellite uplink truck, cabins | 30 x 20 | trucks as single sprites, 4 facings | one item per sheet | P2 |
| Media centre (marquee) | 24 x 16 / 6 | front, rear | - | P2 |
| **Hospitality chalet** (white marquee with glass front) | 10 x 10 / 5 | front, rear; 2 sizes | sponsor-coloured trims as variants | P2 |
| Corporate hospitality village (double-deck pavilion) | 40 x 24 / 9 | front, rear | one item per sheet | P2 |
| **Entrance gate complex** (admission arch, ticket scanners, bag-check tables, metal detectors, staff) | 12 x 6 / 5 | front, rear; queue lane barriers | the tournament logo on the arch | P1 |
| Will-call / ticket office, info booth | 4 x 4 | front, rear | lettering per side | P1 |
| **Food tent** (pagoda tent with counter) | 8 x 8 / 4 | front, rear; burger, BBQ, pizza, ice cream, coffee signs | 5 variants | P1 |
| **Drinks tent / beer garden** (tent, benches, umbrellas) | 10 x 8 / 4 | front, rear | - | P1 |
| Concession kiosk | 4 x 3 / 3 | front, rear; 3 variants | - | P1 |
| Food trucks | 7 x 2.5 | 4 facings; 4 liveries | also drives in (a vehicle) | P2 |
| **Merchandise tent** | 12 x 10 / 5 | front, rear | caps and shirts on racks visible at the front | P1 |
| **Merchandise pavilion** (the big shop) | 30 x 20 / 8 | front, rear | one item per sheet | P2 |
| Picnic tables, umbrellas, standing tables | 2–3 | 3 | around the tents | P1 |
| Trash and recycling bin clusters | 1.5 | 2 | - | P1 |
| **Toilet block** (row of portable toilets) | 8 x 2 / 2.4 | front, rear | - | P1 |
| Luxury restroom trailer | 9 x 3 | front, rear | hospitality areas | P2 |
| First aid tent, ambulance parked | 6 x 6 | front, rear | - | P1 |
| Water refill station | 2 x 1 | 2 | heat (G8) | P2 |
| ATM booth | 1.5 | 2 | - | P3 |
| **Gallery rope and stakes** | runs (stake every 3 m) | a run piece, a corner, a crosswalk gap | laid in runs like the fence layer | P1 |
| Crosswalk gate (two marshals with "Quiet" paddles) | 4 | front, rear | - | P1 |
| Crowd barriers and event fencing with branded scrim | runs | 2 | laid in runs | P1 |
| Sponsor display: car on a plinth ("hole-in-one car") | 6 x 4 | 2 cars | - | P2 |
| Sponsor flags, banners, flagpoles with tournament flags | 1–6 tall | 4 | lettering per side | P1 |
| Directional signs (gates, parking, shuttles, grandstands) | 1.5 | 6 | lettering per side | P1 |
| Course map boards | 3 x 2 | front, rear | - | P2 |
| Trophy presentation stage (by the 18th green) | 10 x 6 | front, rear | the trophy on a table | P2 |
| Volunteer HQ tent, police command post (cabin with mast) | 8 x 6 | front, rear | - | P2 |
| Generator trailers, lighting towers | 3 x 2 / 8 (towers) | 2 | - | P3 |
| **Helipad with helicopter** | 20 x 20 | helicopter 4 facings, landing animation 3 frames | VIP flights at tier 5 | P3 |
| **Shuttle stop shelter and queue barriers** | 8 x 3 | front, rear | at the gates and park-and-ride lots | P1 |
| Park-and-ride sign, coach terminal shelters | 2–20 | front, rear | - | P2 |
| Ride-share pick-up / drop-off sign and kerb paint | 2 | 2 | kerb paint is a decal | P2 |

### The owner's additions (2026-10-21 night)
All P1, no lettering (pictograms or blank boards):
| Sprite | Notes |
| --- | --- |
| **Large plain white tents** (marquees, no branding) | 3 sizes (10 x 10, 15 x 10, 20 x 12 m); front and rear; the generic event tent |
| **TV cameras** | camera on a tripod with operator, camera platform, the camera tower (section 4, raised to P1) |
| **Course odds and ends** | gardening tools (rakes, shovels, wheelbarrow, hose reel, leaf blower), ball cleaners (ball washers), tee markers for the tee boxes (blue, white, red, gold) |
| **First-tee sign** | a blank board on posts (lettering later, by hand) |
| **Pro shop buildings** | 2-3 more variants beside `business:golf-pro-shop` |
| **Tables with umbrellas** | patio tables, café sets, picnic tables with parasols |
| **Golf estate gates** | a gatehouse and stone pillars with wrought-iron gates, sized for each road class that can enter the estate (lane, street, avenue) |
| **More grass, bushes, flower beds** | ornamental grass clumps, shrubs, flower beds and planters for tees and the clubhouse |
| **Flag poles** | single and in rows (plain coloured flags) |
| **Golf cart bridges** | both axes (X and Y facings; flipping gives the other two), wood and stone |

## 5. People and vehicles (movers)
**The spectators' brief is [SPECTATOR-ART.md](SPECTATOR-ART.md)** (2026-10-23: 3D people through the RUN CLI, the cast, every clip,
the wayward-ball scene); it replaces the spectator rows below.

| Sprite | Frames | Variants | Notes | P |
| --- | --- | --- | --- | --- |
| **Spectators** walking | 5 facings x 5 walk frames (the townspeople format) | 12+ people (caps, visors, umbrellas, kids) | crowds on walkways | P1 |
| Spectators standing / cheering / seated | 3 frames each | the same people | rope lines and grandstands (crowd layers) | P1 |
| **Pro golfers** | walk, address, swing (4 frames), putt (3), celebrate (2) | 6 (shirt colours) | the featured groups | P1 |
| **Caddies** with bags | walk, stand | 4 | with the pros | P1 |
| Everyday golfers (foursomes) | walk, swing, putt | 8 | the off-season | P1 |
| Marshals (Quiet paddles), volunteers, security, ticket scanners, vendors | stand, walk | 2 each | - | P2 |
| TV crew, photographers, officials (rules buggy) | stand, walk | 2 each | - | P2 |
| **Golf carts** | 8 facings | white, green; with bags | the 2-facing art is not enough | P1 |
| Marshal cart, media cart, official cart with flag | 8 facings | 3 | - | P2 |
| Courtesy cars (sponsor-branded sedans) | 8 facings | 2 liveries | players' transport (G8) | P2 |
| **Coaches** (charter buses) | 8 facings | 3 liveries | regional visitors (G6) | P2 |
| Police car, police officer directing traffic | 8 facings; 3 frames | - | the event traffic plan | P2 |
| Outside-broadcast trucks, delivery trucks, flatbed with tent parts | 8 facings | 3 | build-out and deliveries | P3 |
| Tractor with mower deck, utility vehicle | 8 facings | 2 | maintenance movers | P3 |

## 6. Painted surfaces (photo textures, Paint tool)
Generated with the RUN CLI (`scripts/assets/gen-grass-photos.mjs`, branch `claude/paint-wip`; images in the git-ignored
`output/grass-gen/` of the `photo-grass` worktree). Each one stands for a small patch (2–8 m) and is hex-mixed over large areas,
so 1024 px is plenty (section 1).

| Texture | Status (2026-10-21) |
| --- | --- |
| Fairway, New sod, Rough | **In the game** (the owner's photos, full resolution) |
| Putting green | Generated (test take; detailed at 1:1) |
| Concrete, Worn asphalt, Road gravel, Dirt, Field, Grass, Lush lawn, Worn lawn, Clover lawn, Meadow, Wildflowers | Generated (first takes, to review) |
| Asphalt, Dark asphalt, Gravel | Blocked by RUN's safety filter on every wording tried (false positives): new wording or references, or keep the code-painted ones |
| Fringe, Tee, First cut, Deep fescue, Bunker sand, Waste sand, Pine straw, Bark mulch, Spectator walkway, Wood chips | Generated (first takes, to review) |
| Pond water (still, with ripple variation), pond bank (mud and reeds), grow-in (bare soil with seedlings), divot-scarred range tee, field parking (grass with tyre ruts), event matting (plastic walkway panels), flower bed soil | **To make** (P1 except event matting P2) |
| Pavers, Slabs, Rocky dirt, Rocky dirt alt | Kept as they are (the owner: correct already) |

## 7. Counts
- P1: about 45 sprite items (with views and variants about 140 images) plus 7 textures: enough for tiers 1–3.
- P2: about 40 items (about 120 images): tiers 4–5.
- P3: about 12 items.
- The biggest single items (L grandstand, hospitality village, merchandise pavilion, broadcast compound) are one per sheet.

## Course piece props (T030b)
- Still missing: tee steps, a bunker rake, a pond waterfall, pond rocks, and pond reeds (reeds use the roadside ornamental grass for now). They plug into `PIECE_PROP_SPRITE` in `src/game/ext/course-pieces/index.ts` (a sprite id, or `null` until the art exists).

## The range business kit (plan P24 Phase 1, T129, the World of Golf extras, T133, and the range's look, P22 T096: art requests)
**Paste-ready prompts for every item below and in "Practice facilities":** [GOLF-ART-LIST.md](GOLF-ART-LIST.md) section 1 (2026-10-27).
The opening range (`golf/rangebiz.ts rangeScene`) stands these in with labelled stand-ins ("Stand In for ..."); each goes in by its id in
`rangeScene`. Four views (NE, SE, SW, NW as the building sheets: the front in NE and NW), sun at the upper right, shadows at 145°, early
autumn dusk, no lettering in the art unless said.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Tin-and-tarp shack, four views (`golf:clubhouse-shanty` views) | 12 x 8 / 4 | `expansion:lean-to-shed` | the existing shanty picture (rusty corrugated tin, blue tarp roof patch, plank walls, a serving hatch with a counter, a crate of range balls) turned to four views | P1 |
| Range floodlight (`golf:range-floodlight`) | 1 x 1 / 12 | `world:streetlamp` | a tall galvanised floodlight mast with a bank of four rectangular lamps angled down the range, a concrete foot | P1 |
| Range yardage board (`golf:range-yardage-board`) | 2 x 0.5 / 2.5 | `poi:fishing-board` | a white painted board on two posts with a blank face for the game's number, a green trim | P1 |
| Range distance marker post (`golf:range-distance-post`) | 0.5 x 0.5 / 1.5 | `ce:parking-sign` | a short white-and-red striped post with a blank plate on top | P1 |
| Ball dispenser (`golf:range-ball-dispenser`) | 1.5 x 1 / 2 | `expansion:utility-cabinet` | a green metal range-ball dispenser with a coin slot, a chute and a wire bucket under it, a few balls on the ground | P1 |
| "Driving Range" road sign (`golf:range-sign`) | 4 x 0.5 / 3 | `golf:leaderboard` | a weathered roadside sign on two timber posts, white board with a red golf flag motif, the lettering DRIVING RANGE | P1 |
| Hitting bay divider (`golf:range-bay-divider`) | 1.5 x 0.2 / 1.2 | none (the mats stand open) | a low green timber divider between two hitting mats, a club rack on it | P2 |
| Range tee markers (`golf:tee-marker`, already requested) | 0.3 | none | the single red timber tee marker of T111 | P1 |
| Gas bottle and plastic garden chairs (`golf:yard-gas-bottle`, `golf:yard-plastic-chair`) | 0.5 / 1 | the striped lawn chair | a dented grey LPG gas bottle on a braai stand; a white plastic garden chair | P2 |
| Ball-picker cart (`golf:range-picker`, 8 facings as the cars: `cars:...:E..SE`) | 2.5 x 1.5 | the navy wood-panel wagon (T133, "Stand In for Ball picker cart" over it) | a small green utility cart with a wire-caged cab towing a gang of ball-picking discs, a basket of balls on its back; never mirrored, each facing its own picture | P1 |
| Double-deck hitting stand section (`golf:range-deck`, four views, T133) | 20 x 7 / 7 (two storeys) | the covered-bay building drawn again a storey up (`business:golf-driving-range`, "Stand In for the double-deck hitting stand") | one section of a World of Golf style two-storey hitting stand: four open bays a storey, green mats with rubber tees, timber dividers with club racks, a steel stair at one end, a green steel roof, the upper deck's rail along its front; the rangebiz.ts deck draws one per four bays | P1 |
| Coffee kiosk (`golf:range-coffee-kiosk`, four views, T133) | 3 x 2.5 / 3 | `business:fishing-rental-kiosk` ("Stand In for Coffee kiosk") | a small timber coffee kiosk with a serving hatch and counter, an espresso machine and paper cups, a chalk menu board (no lettering), a striped awning | P1 |
| Golf academy sign (`golf:range-academy-sign`, T133) | 1.5 x 0.3 / 1.8 | `poi:fishing-board` ("Stand In for Golf academy sign") | a dark green timber sign on two posts with a gold crossed-clubs crest and a blank plate for the game's words | P2 |
| The player's cottage (`golf:home-cottage`, four views, T133) | 6 x 5 / 5 | `world:house_4` ("Stand In for the player's cottage") | a modest whitewashed cottage with a corrugated-iron roof, a small stoep with a bench, a water tank on a stand at its side, a satellite dish | P2 |
| Golf pro coaching pose (`golf_coach`, the 3D golfers' 8 facings, T133) | 1 / 1.8 | the golfer's idle frame and the drive clip | a coach standing side-on to the pupil, one hand out pointing at the ball, then miming a slow half swing; 8 frames | P2 |
| Divot-scarred range tee (texture) | 16 m | the tee turf | listed in section 6 | P1 |
| Hitting mats strip (`golf:range-mats`, T096; one mat a bay, the bays 2.5 tiles apart) | 4.2 x 6 per bay / 0.05 | each open bay's dark pad (an `asphaltDark` patch) and a green tee square (scene patches) | a top-down decal of one artificial-turf hitting mat on a concrete pad: worn green turf, a white rubber tee, two or three range balls, a scuffed strike zone; tiles side by side into a strip, so its left and right edges match | P1 |
| Target green decal (`golf:range-target-green`, T096) | 12-20 across (radius 3-5 tiles) | the `range-green` preset disc with a raised, feathered collar (`ScenePatch` 'target') | a top-down round range target green: a smooth inner green, a lighter collar ring, a faint darker ring at the edge, a cup at the centre for the flag, a few balls lying on it; laid at any size, never rotated into a different look | P1 |
| Range golfer at a mat (`golf_range_tee_up`, the 3D golfers' 8 facings, T096) | 1 / 1.8 | the golfer's idle frame between drives, then the drive clip (`golf_drive`) | a golfer at a hitting mat between shots: bends to take a ball from the bucket at the mat, tees it up, stands up for a practice waggle; then the existing drive clip; 8 frames | P1 |
| Car park building (`golf:range-carpark`, four views, T146) | 18 x 26 / 12 (ground, three decks and the open roof deck) | **In (T154):** `ce:parking-garage-6storey`, the art model's parking garage (five covered levels at 36 cars: GARAGE_CARS 180), drawn from its screen-axis views (N, E, S, W, one per quarter turn) at scale 0.6 so it sits inside the footprint; no label. **Still wanted:** its four diagonal views NE, SE, SW, NW (`parking-garage-6storey-8views`: the eight-view contract), so it lines up with the range's lot, whose edges run along the world axes | the existing 6-storey parking garage (brick columns with cream caps, warm-grey floor bands, dark green rails, warm ceiling lights, the rear-right stair tower, the green P sign by the ramp) turned to the four diagonal headings. The house lighting: the sun at the upper right, shadows at 145°; never mirrored, each view its own picture. `rangeScene` places it at frame u 49..58, v 2..15 with its foot, its ramp facing the frame's +u | P1 |

## Practice facilities (plan P24 Phase 2, T130: art requests)
The practice greens the player paints (`golf/practice.ts`, golfers in `golf/rangebiz.ts RangeSim`) stand these in; the stroke clips go into the
3D golfer sheets (`library.ts GOLFER_CLIPS`, the eight facings, as `golf_drive`) and replace the frames `RangeSim.view` picks today. Sun at the
upper right, shadows at 145°, never mirrored.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Putting stroke clip (`golf_putt`, the 3D golfers' 8 facings) | 1 / 1.8 | the drive clip's address, takeaway and impact frames ("Stand In for golfer putting clip" over the green) | a golfer bent over a putter, a short pendulum stroke back and through, head still, holding the finish; 8 frames | P1 |
| Chipping stroke clip (`golf_chip`, 8 facings) | 1 / 1.8 | the whole drive clip ("Stand In for golfer chipping clip") | a half swing with a wedge, hands to hip height, a short follow-through, from grass and from sand (a little spray); 10 frames | P1 |
| Practice green cup flag (`golf:practice-flag`) | 0.2 / 0.9 | `business:golf-pin-red` at 0.2 scale | a short practice-green flagstick, a small yellow triangular pennant, a white cup liner showing at its foot | P2 |
| Putting green sign (`golf:practice-sign`) | 1 x 0.2 / 1 | none | a small dark green timber sign on one post, the lettering PRACTICE GREEN in white | P2 |
| Range ball basket (`golf:practice-balls`) | 0.4 / 0.3 | none | a wire basket of white range balls on the grass, a few spilled | P2 |

## Screen-axis sets in the game, their diagonal views wanted (T154)
The art model's `<slug>-screen-axis-4views-v1` sets are in the game (`scripts/assets/prep-axis-views.mjs`, record in `art/axis-views/INDEX.md`).
Their views are the cardinal headings N, E, S, W of the eight-view contract (HANDOVER.md: NE, SE, SW, NW, N, E, S, W). The subjects new with
them are drawn from those four views (one per quarter turn), so on the world-axis roads and lots they stand 45 degrees off until their
**diagonal views NE, SE, SW, NW** exist; these are wanted, as eight-view sheets (`<slug>-8views-vN`, the same subject, its existing four views kept
byte for byte):
| Subject (id) | Has | Missing | P |
| --- | --- | --- | --- |
| Parking garages, 2 to 6 storeys (`ce:parking-garage-<n>storey`) | N, E, S, W | NE, SE, SW, NW (the 6-storey first: the range's car park) | P1 |
| Shrubs: deep green, golden russet, sage round (`landscape:bush-*`); pale hydrangea (`landscape:hydrangea-pale`) | N, E, S, W | NE, SE, SW, NW | P2 |
| Flower beds: daisies, lavender, marigolds (`landscape:flowerbed-*`) | N, E, S, W | NE, SE, SW, NW | P1 |
| Bench, street lamp, trash can, car park entrance gate (`world:bench`, `world:streetlamp`, `world:trashcan`, `ce:parking-entry`) | N, E, S, W (beside their old pictures) | NE, SE, SW, NW | P2 |
| Pickup (`static:pickup_n`, the pickup model) | N, E, S, W | the four diagonal headings, as an eight-way car (art/cars) | P2 |
The shops and houses with screen-axis sets (`town:bakery`, `town:grocery`, `town:pharmacy`, the three industrial variations, `world:house_0`,
`_1`, `_3`) keep their diagonal views; their N, E, S, W views are extra headings (`view:<id>:n|e|s|w`) the roads at 45 degrees take in T154 Phase 2.
The world trash can's set had no crops yet (cut from its sheet by its subjects) and the 4-, 5- and 6-storey car parks' half-cell crops clip
their subject (re-cut from the sheet the same way): the art model may want to review those cuts.

## Buildings on the roads at 45 degrees: their cardinal views wanted (T154 Phase 2)
On a road at 45 degrees a building with a screen-axis set faces its street. A lot's front faces its street: N on road 1, E on 3, S on 5, W on 7
(`lots/preset-art.ts roadView`). It is never mirrored, and its footprint and anchor come from the set. A building without a set is drawn in its
diagonal view, at 45 degrees to the road, as before. 14 buildings have a set: the five parking garages, `town:bakery`, `town:grocery`,
`town:pharmacy`, the three industrial variations, and `world:house_0`, `_1` and `_3`. A variation (`variation:<base>-<hash>:1`) is its own picture
and needs its own set. **Wanted: the N, E, S, W views** of the buildings below, as eight-view sheets (`<slug>-8views-vN`: the existing four views
kept byte for byte, plus the four cardinal ones). The buildings the owner's presets of the 45-degree roads draw today come first (counted
2026-10-27 over `lot-presets.json`):
| Building (id) | Presets at 45 degrees | P |
| --- | --- | --- |
| House 5 (`world:house_5`) | 13 (12 approved) | P1 |
| Colonial L-shape, double garage, variation 1 (`variation:gen-house-l-shape-e0e3b328-plain:1`), and its base `gen:house-l-shape` | 3 + 1 | P1 |
| House 2 (`world:house_2`) and its variation `variation:world-house_2-north-332663ab-plain:1` | 2 + 1 | P1 |
| House 0, variation 1 (`variation:world-house_0-51fa4b80-plain:1`) | 1 | P2 |
| House Large, variation 1 (`variation:ref-building-house-large-20cb9f9e-plain:1`) | 1 | P2 |
| Ranch L-shape, corner porch, variation 1 (`variation:gen-house-l-ranch-18552ce5-plain:1`) | 1 | P2 |
| House Dormer, variation 1 (`variation:ref-building-house-dormer-b4413f08-plain:1`); Bellamy Hardware, variation 1 (`variation:town-hardware-bf36737f-plain:1`) | 1 draft each | P2 |
| House back, shed and garden (`gen:back-shed-garden`); weathered timber outhouse (`expansion:outhouse`) | 1 each | P2 |

All the presets place 74 different buildings; 65 of them have no set yet (houses 28, industry 14, shops and services 9, landmarks 9, yard
buildings 5). The library holds 165 building subjects, 14 of them with a set. By how often the presets place them, the next ones wanted are:
`town:postoffice` (193), `expansion:boarded-store-rear` and its variation (42 + 82), `expansion:lean-to-shed` (73), `world:school` (56),
`expansion:outhouse` (53), `world:arcade` and its variation (51 + 45), `expansion:derelict-two-storey` (49), `static:garage_brick-v2` and its
variation (39 + 32), `ref:building-gas-canopy` (39), `world:house_5` (38), `world:video` (38), `world:diner` (38), `world:video_rental` (37),
`world:snack_bar` (35), `expansion:rundown-house` (34), `town:laundromat` (33), `static:garage_timber` (31), `ref:landmark-water-tower` (27),
`static:garage_brick` (26), `world:house_2` (25), `world:house_4` (20).

## Props kit (plan P24 Phase 3, T131: art requests)
The Props tool (`golf/decor.ts DECOR`) shows these as labelled stand-ins ("Stand In for ..." on the card and once per kind on the map); each
goes in by replacing its item's `id` (and dropping its `standIn`). Four views where it says so (NE, SE, SW, NW as the building sheets: the front
in NE and NW), sun at the upper right, shadows at 145°, early autumn dusk, no lettering, never drawn to be mirrored.
| Sprite (id to use) | Footprint (m) / height | Stand-in today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Bronze golfer statue (`golf:prop-golfer-statue`, four views) | 1.5 x 1.5 / 3 | `expansion:coin-horse-ride` | a bronze golfer at the top of his follow-through on a square dressed-stone plinth with a plain bronze plaque | P1 |
| Stone pillar (`golf:prop-stone-pillar`) | 0.8 x 0.8 / 2.2 | `world:grave_2` | a square sandstone gate pillar with a moulded cap and a stone ball finial, a little lichen at the foot | P1 |
| Club flag pole (`golf:prop-flag-pole`) | 0.5 x 0.5 / 8 | `business:golf-pin-red` (scaled up) | a tall white aluminium flag pole on a concrete foot, a dark green club flag with a small gold crest lifting in the breeze | P1 |
| Flower bed (`golf:prop-flower-bed`) | 3 x 1.5 / 0.5 | **In (T154):** `landscape:flowerbed-daisies` (and the lavender and marigold beds, new Props items), screen-axis views; **still wanted:** their diagonal views (below) | a raised bed edged in brick, massed red and yellow annuals with a clipped box edge, dark mulch between | P1 |
| Tiered garden fountain, small (`golf:prop-fountain-small`, four views) | 2 x 2 / 1.8 | none (the plaza fountain is real art) | a two-tier cast-stone fountain in a round basin, water spilling from the top bowl, wet stone darker | P2 |
| Stone entrance arch (`golf:prop-entrance-arch`, four views) | 5 x 1 / 4 | none (the ivy garden arch is real art) | a dressed-stone arch on two pillars over a path, a blank stone keystone, low hedges either side | P2 |
| Classical urn on plinth (`golf:prop-urn`) | 0.8 x 0.8 / 1.6 | none | a stone urn on a square plinth spilling trailing ivy and white petunias | P2 |

## Town buildings (T187, Town decoration › Buildings: art requests)
The few buildings a golf game's player adds to the town (`golf/decor.ts DECOR`, group `buildings`) use the library's own art: the plaza fountain
(`ref:landmark-fountain-v2`), the bus shelter (`town:bus_stop`), the toilet block (`golf:toilet-block`) and the white chapel (`variation:world-church-44e76535-plain:1`).
These are missing and offered only once drawn (four views, sun at the upper right, shadows at 145°, early autumn dusk, no lettering):
| Sprite (id to use) | Footprint (m) / height | Today | Prompt (short) | P |
| --- | --- | --- | --- | --- |
| Park bandstand (`town:bandstand`, four views) | 6 x 6 / 5 | `world:gazebo` is a stand-in (not offered) | an octagonal white timber bandstand on a low brick base, a green shingled roof with a small cupola, steps on one side | P1 |
| Bronze statue on a plinth (`town:statue-founder`, four views) | 2 x 2 / 4 | none | a bronze figure of a town founder in a frock coat on a dressed-stone plinth, a little green patina | P2 |
| Town hall annex (`town:townhall-annex`, four views) | 12 x 8 / 7 | none | a small two-storey brick civic building with a white portico and a flag, autumn trees beside it | P2 |

## Build-tool tiles (T233, #674: art requests)
Art 174's twelve tiles show on the Course and Facilities flyouts' tools (`ui/tool-tiles.ts`). These tools still show their icon, mark or swatch on
the tile's navy square; a second sheet in 174's style would finish the panel (one tiny isometric diorama per tile on a dark navy rounded square
#1E2A44, a 4 x 3 grid on charcoal #1C1F26, the light from the upper right, the same scale as 174, no lettering):
| Tile (file name in `src/assets/ui/tiles/`) | For | Prompt (short) | P |
| --- | --- | --- | --- |
| `waste` | Course › Shape by hand › Waste area | a patch of pale waste sand with scattered pebbles, dry grass tufts and a little scrub | P1 |
| `halfway-house` | Course › Buildings › Halfway house | a small timber snack hut with a striped awning and a bench | P1 |
| `your-holes` | Course › Holes › Your holes | a tiny fairway running to a green with a flag, a tee at the near end (a whole hole) | P2 |
| `tournament` | Course › Tournament | a small white grandstand and a scoreboard beside a green | P2 |
| `land` | Course › Land for sale | a bare dirt plot inside a white dashed line with a For Sale post (no lettering on the sign) | P2 |
| `bushes` | Facilities › Plants › Bushes | a few autumn shrubs, scarlet burning bush and golden spirea | P2 |
| `palms` | Facilities › Plants › Palms | two palms on a sandy grass patch | P2 |
| `props` | Facilities › Decoration › Props, All props | a bench, a lamp post and a planter on a paved square | P2 |
| `furniture` | Decoration › Props › Furniture | a patio table with a red umbrella and two chairs | P2 |
| `long-grass` | Course › Shape by hand › Long grass (wears `rough` today) | a patch of tall, wispy golden-green long grass, looser than rough | P1 |
| `chipping` | Facilities › Practice › Chipping green and bunker (wears `bunker` today) | a small chipping green with a flag, a bunker beside it, a few balls | P2 |
| `build` | Facilities › Build on your property; Range › Build | surveyor's stakes with orange tape and a wheelbarrow of turf on a lawn edge | P2 |

All twelve are art 181, one sheet in the ChatGPT queue (`docs/art/CHATGPT-IMAGE-QUEUE.md`, first). Sheet order, row by row: waste,
halfway-house, your-holes, tournament / land, bushes, palms, props / furniture, long-grass, chipping, build.
