# Golf sprites and textures: what to make (v6, 2026-10-21)

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
| `business:golf-practice-net`, `golf-driving-range` | The practice area (the range as a placeable set until the range kit, P2) |
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
| Range kit: target flags, distance boards, ball dispenser, hitting bay dividers, mats, ball-picker cart | various | sets | the practice range (tier 3 need) | P2 |
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

## 5. People and vehicles (movers)
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
