# Golf facilities: complete turns, replacement budget art, and event expansion

Status: source audit and concrete art brief, 2026-11-07. No game code or live asset changed. Proposed catalogue additions below are art/design proposals, not implemented capacity, balance, safety certification or pricing facts.

## Decision and visual contract

Every distinct physical building or nonplant, nondecal prop needs **eight authored views**: normal `NE, SE, SW, NW`, plus `N, E, S, W` in the established **turned8** geometry. Use actual turned references from the pipeline; do not rotate a finished bitmap in the image plane or mirror it. A second size, material tier or structural variation is its own eight-view subject. The eight view labels describe the repository's existing view families, not eight successive 8-degree rotations.

Exactly **two visual upgrade levels** apply to this golf expansion:

- **Budget / worn**: ordinary commercial and municipal facilities built around the 1950s and still working in 1985. Square saw-cut timber, bolted painted tubular steel, modest brick or rendered concrete-block cabins, simple corrugated roofs, faded cream/green paint, restrained rust at joints, old canvas awnings. They look cheap and old, with believable carpentry and serviceable stairs, handrails, roofs and doors. No rope-lashed log construction, splintered fantasy palisades, slum huts, blue-tarp village roofs, primitive towers or deliberately dangerous-looking access.
- **Upgraded**: attractive, repaired or newly supplied facilities available in 1985: clean cream canvas, forest-green painted steel and timber, modest brick/stone bases, neat railings, finished benches or period molded seats, tidy hospitality glazing. Preserve each facility's purpose and size; this is an upgrade, not a new modern technology era. No LCD/LED video walls, contemporary scanners, QR codes, smartphones or present-day event branding.

Match the owner's detailed painterly miniature style for both levels. **Late-afternoon daytime, sun at screen upper right, shadows toward lower left, readable sunlit roofs and walls**. Turn the object while the lighting stays fixed. No dark night grades, neon bloom or pools of lamplight dominating the daylight. Keep sprite scenes empty of baked-in people: runtime crowd layers must fill the stands.

The owner asked that these lighting changes apply from now on. Do not repaint an already accepted older set solely to change time of day; do repaint all shanty replacements and every newly generated missing turn using this current contract.

## Verified sources and existing functionality

Live read-only source checkout: `E:/Repos/CapitalEmpire/worktrees/theme-consistency`.

- [Event structures](../../../../../../worktrees/theme-consistency/src/game/golf/tents.ts) define **28** structure types. Footprints there are **tiles of 2 m**; multiply by two for metres.
- [Structure picture mapping](../../../../../../worktrees/theme-consistency/src/game/golf/structure-art.ts) uses one `golf:grandstand-s` picture for **standS, standM, standL, rangeStand**. Chalet, village, merchandise pavilion and helipad also share the halfway-pavilion fallback. Therefore existing large catalogue entries are not evidence of unique appropriate artwork.
- `standS` = 200 seats, 8x4 tiles = 16x8 m. `standM` = 1,000 seats, 20x6 tiles = 40x12 m. `standL` = 4,000 seats, 40x10 tiles = 80x20 m, intended horseshoe. `rangeStand` = 600 seats, 12x4 tiles = 24x8 m. These are verified runtime numbers; they are not inferred by counting the current small sprite's drawn benches.
- `chalet` = 60 guests at 10x10 m; `village` = 500 guests at 40x24 m. These are hospitality guests, not seated stand capacity. Never label the generic decorative pavilion as 500 seated spectators.
- [Golf art list](../../../../../../worktrees/theme-consistency/docs/GOLF-ART-LIST.md) and [golf sprite list](../../../../../../worktrees/theme-consistency/docs/GOLF-SPRITES.md) already request S/M/L/range stands, manual boards, hospitality, admission, toilets, first aid, transport and maintenance. Finish these families before inventing duplicates. The October 27 two-view rule and dropped A8 entry are superseded by the owner's current eight-view request.
- [Raw tournament prompt inventory](../../../../../../worktrees/theme-consistency/art/golf-tournament/prompts.json) defines 28 different **four-subject** sheets, not four turns of each subject. A sheet's four cells cannot be counted as four rotations. Its historical upper-left sunlight is also superseded.
- [New prop identities](../../../../../../worktrees/theme-consistency/art/new-props/items.json) identify original sheet, cell, crop and current library ID. There are 21 IDs containing `shanty`, and **54 broad replacement candidates** selected from shabby categories plus shanty/tarp names. One candidate, `newprop:course-worker`, is a person accidentally filed in shabby stalls; route it to the character portrait/style pass instead of drawing a building.
- The separate budget-props manifest has nine assets: two trees excluded, **seven ordinary props** remain. Their individual four-view source crops do not establish turned8 completion.

## Priority 0: usable seating and pavilion art

Each row is produced in **both** material levels, each level with all eight views and one large click-through image. Reuse existing semantic families and keep additional capacities clearly proposed until a runtime ticket adopts them. Capacities describe the visual composition brief; no prices or economy changes are introduced here.

| Family / variants | Metres and capacity | Existing anchors | Art and functional checks |
| --- | --- | --- | --- |
| Compact bleacher | **Proposed:** 8x4 m, 60 seats | `newprop:small-bleacher`, `newprop:wooden-bleacher` | Low open benches, visible end stair, inexpensive town-course option. |
| Small grandstand | **Existing:** 16x8 m, 200 seats | `standS`, `golf:grandstand-s`, `newprop:grandstand-small` | Uncovered; stair/aisle gaps remain clear. |
| Medium grandstand | **Existing:** 40x12 m, 1,000 seats | `standM`, `newprop:grandstand-wide` | Genuine longer/deeper structure; not enlarged S art. |
| Large horseshoe grandstand | **Existing:** 80x20 m nominal footprint, 4,000 seats | `standL` | Whole horseshoe identity plus separate straight, left corner, right corner and end/stair modules; do not double-count module capacities. |
| Practice grandstand | **Existing:** 24x8 m, 600 seats | `rangeStand` | Low sightline-safe range seating; unique geometry. |
| Covered grandstand | **Proposed:** S 16x8 m/200, M 40x12 m/1,000 | `newprop:covered-grandstand`, `newprop:covered-bleacher` | Budget fixed corrugated roof on bolted posts; upgraded clean roof and seating. Roof must not obscure all seated rows. |
| Seated pavilion | **Proposed:** S 8x6 m/24, M 12x8 m/60, L 18x10 m/120 | `newprop:pavilion`, `newprop:dining-pavilion`, `newprop:tarp-seating` | Covered level viewing, seats in orderly rows facing the course, rear aisle. Distinct from dining/hospitality. |
| Accessible viewing deck | **Proposed:** S 6x5 m/4 wheelchair spaces + 4 companion seats; M 10x6 m/10 + 10 | `newprop:bleacher-platform`, `newprop:bleacher-deck`; shanty sheet 06 cell 3 | Complete reachable ramp/landings, companion seating and front sightline. Ramp belongs to footprint, not an extra hidden protrusion. |
| Small observation deck | **Proposed:** S 4x4 m/12 standing; M 6x5 m/24 standing | `newprop:bleacher-tower`, `newprop:scaffold-stand` | Low raised deck with genuine steel/timber stairs; no primitive pole tower. Standing capacity must not be mistaken for seats. |
| Stand connection pieces | **Proposed:** 2 m aisle, 4 m stair bay, straight/end/left/right corner rail pieces | `newprop:bleacher-stairs` | Both tiers; eight views even for small modules; clean joins, known entry/exit sides. |

Seat capacity is simulation metadata and a visual density target, not a requirement that a 1,000-seat miniature contains exactly 1,000 individually painted seats. Art must still distinguish the size bands and expose consistent aisles and seating rows.

## Priority 1: replace all budget / shanty identities

`budget-replacement-inventory.json` is the exact machine-readable inventory. It records every selected current ID, image, source sheet and cell; it also records raw shanty sheets and the separate seven-item budget manifest. Keep runtime IDs stable for replacement work and version the new picture selection/provenance. A new human-readable label such as "Old clubhouse" can replace "shanty" without breaking existing saves.

The clubhouse replacement keeps `golf:clubhouse-shanty` as its compatibility ID: a simple 12x8 m old pro-shop cabin with ordinary low-pitched corrugated roof, square painted clapboard or rendered brick walls, serving hatch, small windows, plain front door, bench and range-ball crate. Avoid copying the tarp-patched source's fantasy construction. Generate one accepted budget identity, then all eight turns; do not generate eight unrelated small shops.

The 28 raw shanty subject sheets remain reference-only archives. They include plants, terrain and people as well as facilities; do not blindly generate eight views of their greens, fairways, flower beds or ground decals. Inspect each retained object's function and use the new budget architecture contract. The extra `06-...-v2` is a spacing correction of sheet 06, not a new facility or set of rotations.

Priority order among the 54 candidates: seating/decks/stairs; clubhouse/pro-shop/range bay; ticketing/gates; toilets/first aid/water; camera/scaffold structures; kiosks and merchandise; remaining clocks/signs/booths/vehicles. Preserve the current decorative ID until the art import uses an explicit replacement map.

## Priority 2: complete the event from arrival to exit

All following structural and prop variants get **both levels x eight views**. Named existing quantities remain unchanged; other size variants are **proposals**. A slash-separated list names a few explicit variants, not an open-ended request for every conceivable object. Where equivalent art exists, finish its missing views instead of adding another duplicate ID.

| Facility family | Scoped variants / size | Reuse / match existing IDs | Large click-through image |
| --- | --- | --- | --- |
| Admission and security | Single 2-lane entry (**proposed**), existing 12x6 m 4-lane complex; detached bag-check table and barrier gate | `gate`, `newprop:gate-arch`, `newprop:shanty-turnstiles`, `newprop:ticket-booth` | Entry with period paper-ticket admission and queue. |
| Tickets, info, accreditation | Existing 4x4 m info/will-call; 3x2.5 m ticket hut; 4x3 m staff/accreditation cabin | `info`, `newprop:shanty-ticket-hut`, `newprop:shanty-booth`, `newprop:green-booth` | Hatch/desk view with identity matching the sprite. |
| Arrival/parking controls | Attendant booth, lift barrier, transport sign; 8x3 m shuttle shelter and larger paired shelter | `rideshare`, `coach`, `interchange`, `newprop:shuttle-bus`, `ce:parking-entry`, `ce:parking-kiosk` | Small arrival hub; paved/turf car parks remain terrain, not new sprite sets. |
| Queues, route control and exits | 3 m straight barrier/left corner/right corner, 4 m opening/crossing, exit gate | `newprop:rope-barrier`, `newprop:rope-barrier-corner`, `newprop:rope-walkway`, `newprop:shanty-signpost` | Entry/exit operations shared with admission, not duplicate scene per barrier. |
| Food concessions | Existing 8x8 m food tent; small 4x3 m kiosk in burger/coffee/ice-cream variants; period food truck | `foodTent`, `kiosk`, `foodTruck`, `newprop:green-food-kiosk`, `newprop:snack-shack`, `newprop:ice-cream-cart` | One counter scene per distinct vendor design. |
| Drinks / beer garden | Existing 10x8 m drinks tent; water/soft-drink counter variant | `drinksTent`, `newprop:drinks-stand-with-canopy`, `newprop:cooler-drinks-stall` | Working counter plus seating. |
| Merchandise / bag check | Existing 12x10 m tent and 30x20 m pavilion; 4x3 m compact stall; 4x3 m cloakroom/bag-check cabin | `merchTent`, `merchPavilion`, `newprop:shirt-stall`, `newprop:cap-stall`, `newprop:club-badge-stall` | Interior racks/checkout preserving the building's facade. |
| Hospitality / dining | Existing 10x10 m chalet/60 guests and 40x24 m village/500; proposed 15x10 m dining pavilion | `chalet`, `village`, `newprop:hospitality-marquee`, `newprop:dining-pavilion`, `newprop:food-pavilion` | Terrace/interior; existing guests are not relabelled seats. |
| Generic marquee / staff catering | 10x10,15x10,20x12 m; kitchen trailer | `newprop:marquee`, `newprop:catering-tent`, `newprop:catering-trailer`, `newprop:buffet-tent` | Shared staff/hospitality scene plus distinct marquee identity. |
| Sanitation | Existing 8x2 m/12-cubicle toilet block; proposed 4x3 m basic comfort cabin and 9x3 m upgraded trailer; detached wash trough | `toilets`, `golf:toilet-block`, `newprop:shanty-toilet`, `newprop:toilet-booth`, `newprop:wash-station` | Exterior entrance and wash area, no occupants in private spaces. |
| Drinking water | 2x1 m refill unit and 3x2 m sheltered multi-tap station | `newprop:water-tank-stall`; art-list117 | Patron refill scene; old clean galvanized tank vs upgraded tidy enclosed unit. |
| First aid / evacuation | Existing 6x6 m first-aid tent; proposed 6x4 m clinic cabin and stretcher/evacuation cart | `firstAid`, `newprop:medical-tent`, `newprop:first-aid-trailer`, `newprop:shanty-cart-ambulance` | Staff-ready interior/exterior, period kit. |
| Weather/rain shelter | 4x4 and8x4 m shelter; weather mast and separate public warning board | `newprop:shanty-weather-mast`, `newprop:weather-station`; art-list81 | Sheltered waiting view; storm effects aren't baked into sprites. |
| Course control / marshals | Starter hut3x2.5 m, marshal crossing post, referee/scoring cabin4x3 m | `newprop:starter-hut`, `newprop:shack-map-board`, `newprop:shanty-hole-sign` | First-tee starter or scorer at desk. |
| Scoreboards / clocks / wayfinding | Existing8x3 m main board and2x1 m hole board; small course map, direction post and analog clock | `leaderboard`, `holeBoard`, `golf:leaderboard`, `newprop:leaderboard`, `newprop:shanty-clock` | Scorekeeper/board scene; names and scores remain runtime overlays. |
| Media / TV / photography | Tower6/10/15 m, tripod camera, low photographers' deck,24x16 m media centre,30x20 m broadcast compound | `tvTower`, `broadcast`, `media`, `newprop:shanty-camera-tower`, `newprop:tv-camera`, `newprop:broadcast-truck` | Press desk/broadcast operations in 1985. |
| Player / caddie services | Bag-drop counter3x1 m, rack3x0.6 m, player rest canopy6x4 m, scoring cabin above | `newprop:bag-stand-stall`, `newprop:club-rack-stall`, `newprop:equipment-stall` | Bag room/player lounge; caddies get separate character portrait. |
| Range / practice | Existing shop/range-deck identity; basic single bay and four-bay module; cage, ball dispenser, yardage board | `golf:clubhouse-shanty`, `golf:range-deck`, `newprop:shanty-range-bay`, `newprop:practice-cage`, `newprop:ball-dispenser` | Counter, teaching bay and practice scene; no new grass/decal work. |
| Cart staging / transport | Cart canopy10x5/20x5 m, bag trolley; existing fleet cart, player shuttle, utility cart, ambulance cart | `newprop:roofed-cart`, `newprop:wheelchair-cart`, `newprop:utility-cart`, `business:golf-cart-garage` | Cart garage/staging scene; actual moving vehicles keep heading system. |
| Maintenance / storage | Existing20x12 m barn/yard, small6x4 m toolshed, fuel/oil cabinet, sand-bin module | `newprop:garden-shed`, `newprop:shanty-shed`, `newprop:tool-stall`; art-list12/67 | Workshop/yard scene; neat functional wear instead of scrap village. |
| Utilities / waste | Towed generator, light tower, cable protector, bins2/3-unit cluster, recycling station | `newprop:shanty-weather-mast`; art-list114/126; existing budget bin | Back-of-house scene shared with maintenance, no duplicate scene for every bin. |
| Staff / volunteer / security HQ | 8x6 m HQ tent or cabin, police/radio cabin4x3 m | art-list125; `newprop:shanty-booth`, `newprop:scaffold-booth` | Volunteer briefing room with lockers/radios. |
| Trophy / sponsor / presentation | Existing10x6 m stage; trophy desk,6x4 m sponsor-car plinth; existing video trailer | `sponsorDisplay`, `screen`, `newprop:stage`; art-list121/124 | Ceremony view, consistent period clothing and faces. |
| Course bridges / furniture | Footbridge/cart bridge6/9/12 m, bench, picnic table, parasol-table, ball washer | `newprop:wooden-footbridge`, `newprop:plank-bridge`, `newprop:stone-bridge`, `newprop:park-bench`, `newprop:picnic-table`, `newprop:ball-washer` | Bridge/rest-area scene shared by family; every hard prop still gets eight views. |

Every existing event structure is covered above or here: `hotel` keeps its resort-specific building family and needs two-tier facade/room/click-through art; `helipad` uses an appropriate period landing-support item/helicopter family, not the pavilion fallback. The helipad marking itself is a **decal and excluded** from this request. Interchange road geometry, parking surface paint and tee mats are also excluded terrain/decals; their booths/signs/shelters remain included.

## Click-through and character identity contract

For every **distinct house/business/facility identity**: one large exterior view tied to the accepted sprite's roof/windows/doors/materials; one large interior or activity view where the place has an interior or meaningful service (homes: living room/occupant; shops: counter/display; stands: seated spectator experience; range: hitting line; workshop: tools/service). Both golf upgrade levels need their own matching scene. Small identical incidental modules may share a family scene, but a house or named business must not receive an unrelated generic image.

Characters need a large painterly portrait AND a full-body contextual walking image, keyed to their real actor/appearance identity: town residents/commuters, shop staff, range owner, teaching/head pro, starter, marshal, greenkeeper, volunteer, security, medic, camera/press staff, caddie, golfer and course spectators. Use the established cast/wardrobe where identities exist; don't assign invented names or stats as if runtime already knows them. Generate varied ages/body types/skin tones and period outfits as explicit cast entries rather than random faces that change on each click. No eight static sprite sheets are required for portraits; existing walking/3D animation remains a separate pipeline. Actor hit-testing and identity-to-portrait mapping need runtime work before a player can click a walker to see who they are.

Existing scene requests are in GOLF-ART-LIST section13/items200-327 and the P28 plan. That list is a request/status ledger; some claimed scene paths are absent in the live checkout. The full inventory agent must check actual files before reporting completion.

## Reference order and review

1. **Style authority:** `art/theme-consistency/references/theme-authoritative.png` (Maple Bean street), SHA recorded by `references/theme.json`. This is a dusk picture: copy brushwork/materials/proportions, then obey the current late-afternoon daylight instruction.
2. **Usable native material references:** `art/theme-consistency/generated/buildings/business-golf-halfway-pavilion-4views-v2/NE.native.png` and `business-golf-pro-shop-4views-v1/NE.native.png`. Visually inspected: both have crisp painted roof/timber/masonry and warm lamps. Copy material quality, not exaggerated golden glow. The pavilion is not a geometry reference for every grandstand.
3. **Golf palette/layout reference:** `art/theme-consistency/references/golf-country-club-owner-20261028.png`; `art/grass-management/scene-reference/tournament-small-budget-master-v1.png` may inform ordinary inexpensive event layout.
4. **Identity/geometry:** accepted same-subject corners plus its own four turned renders. Starter-shop old sources are allowed to locate hatch/door only; rejected shanty geometry must be redesigned first. Existing raw shanty sheet06 is **functional layout only**, never style.

Acceptance per subject: eight nonempty native PNGs with real alpha; unchanged object identity, physical proportions and seating layout across angles; distinct back and sides; upper-right sunlight; all rail gaps transparent; full ramps/stairs/poles within margins; same scale between views; no mirror; no plants/decals used to satisfy missing hard props; click-through architecture matches accepted sprite. File existence alone is not visual approval.

Runtime follow-up identified by the other audit: event structures currently store only a rotated boolean, PropsTool mostly cycles four views, all stand rows face a fixed direction, and crowd drawing assumes12 seats per row. Each new view family needs footprint/anchor metadata and authored seating-row/aisle access information; capacity, art condition and orientation must be independent fields. Keep people in runtime layers and avoid generating crowd-filled sprites as a substitute for this work.

No server, browser, build, benchmark, image generation or background process was started by this audit.
