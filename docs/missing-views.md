# Buildings and the views they have, and what the art queue starts from (T375)

203 building subjects of the catalogue audit: 60 with eight approved views, 20 with the old straight-on set, 93 with corners only, 30 with one picture. **123 are missing views of the eight** (the first table, golf priority first, then the buildings that stand on lots): 106 of them have a native export, 94 an Idol 3D splat, 93 candidate images.

On a screen-straight road a building with corners only is drawn in the nearest corner, 45 degrees off its road; a building with the old straight-on set draws that set there (the T154 look, not the 8-degree views). Views: NE SE SW NW are the corners, N E S W the 8-degree straight-on views.

- **Missing of the 8**: as the game has them now. A building with the old straight-on set has its N E S W (the legacy look) and is not listed as missing them.
- **Candidates**: which of the eight already exist as candidate images from the repaint pass (`D:/AI/repaint/out/<id>`: night-lit, not reviewed, not imported): a start for review, not game art.
- **Native export**: the studio's native-resolution picture of the building (`original_source`, a `*.native.png` of its first view): the good source the generation starts from. "no" is a building the game only has as an atlas sprite.
- **Idol 3D**: a Gaussian splat (`.ply`) made by Idol from one picture (`D:/AI/idol-batch/out/<set>/<id>`): a model to render the missing sides from; its unseen sides are guesses (the owner rejected the batch's crops of 2026-11-01), so a source to review. No building has a mesh (`.glb`): the repository's models are the people.

## Buildings missing views

| Building | Category | Kind | Golf | In the game | Missing of the 8 | Candidates | Native export | Idol 3D |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `business:golf-bag-trolley` (golf bag trolley) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-bench-course-map` (golf bench course map) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-cart-garage` (golf cart garage) | Business artwork | business | yes | corners only | N E S W | all 8 | yes | marked |
| `business:golf-cart-se` (golf cart se) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | yes | no |
| `business:golf-cart-sw` (golf cart sw) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | yes | no |
| `business:golf-clubhouse` (golf clubhouse) | Business artwork | business | yes | corners only | N E S W | all 8 | yes | marked |
| `business:golf-footbridge` (golf footbridge) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-halfway-pavilion` (golf halfway pavilion) | Business artwork | business | yes | corners only | N E S W | all 8 | yes | marked |
| `business:golf-mower` (golf mower) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-patio-table` (golf patio table) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-pin-red` (golf pin red) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-pin-red-equipment` (golf pin red equipment) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-pin-yellow` (golf pin yellow) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-practice-net` (golf practice net) | Business artwork | business | yes | one picture | NE SE SW NW N E S W | none | no | no |
| `business:golf-pro-shop` (golf pro shop) | Business artwork | business | yes | corners only | N E S W | all 8 | yes | marked |
| `golf:grandstand-s` (Grandstand S (about 200 seats)) | Golf tournament | building | yes | corners only | N E S W | all 8 | no | marked |
| `business:bus-se` (bus se) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:bus-sw` (bus sw) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:buscompany` (buscompany) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:casino` (casino) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:diner` (diner) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:estate-villa` (estate villa) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:fishing-bass-boat` (fishing bass boat) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:fishing-boathouse` (fishing boathouse) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:fishing-cabin` (fishing cabin) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:fishing-dock-lifebuoy` (fishing dock lifebuoy) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:fishing-dock-rope` (fishing dock rope) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:fishing-lodge` (fishing lodge) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:fishing-rental-kiosk` (fishing rental kiosk) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:hotel` (hotel) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:motel` (motel) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:sportsbar` (sportsbar) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:tackle` (tackle) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:taxi` (taxi) | Business artwork | business |  | corners only | N E S W | all 8 | yes | marked |
| `business:taxi-se` (taxi se) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `business:taxi-sw` (taxi sw) | Business artwork | business |  | one picture | NE SE SW NW N E S W | none | no | no |
| `expansion:boarded-store-rear` (Abandoned brick store - rear) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `expansion:derelict-two-storey` (Dilapidated two-storey house) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `expansion:duplex-rear` (Brick duplex - rear service doors) | More houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `expansion:rundown-house` (Boarded-up timber house) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `gen:back-patio-pool` (House back - patio & pool) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `gen:back-screened-porch` (House back - screened porch) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `gen:back-shed-garden` (House back - shed & garden) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `gen:back-swingset` (House back - swing set & grill) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `gen:house-duplex` (Duplex) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `gen:house-farmhouse-wrap` (Farmhouse - wraparound porch) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `gen:house-l-shape` (Colonial - L-shape, double garage) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `gen:house-ranch-long` (Ranch house - long, carport) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `gen:house-splitlevel` (Split-level house) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `ref:building-gas-canopy` (Gas Canopy) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `ref:landmark-fountain-v2` (Fountain V2) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `ref:landmark-silo` (Silo) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `ref:landmark-water-tower` (Water Tower) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `ref:landmark-windmill` (Windmill) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:garage_brick` (Garage Brick) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:garage_brick-v2` (Garage Brick V2) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:garage_timber` (Garage Timber) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:shop_brick_rear` (Shop Brick Rear) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:shop_brick_rear-v2` (Shop Brick Rear V2) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:shop_market_rear` (Shop Market Rear) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `static:shop_market_rear-v2` (Shop Market Rear V2) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `town:barber` (Clip Joint Barbers) | Shops & services | venue |  | corners only | N E S W | all 8 | yes | marked |
| `town:fish_tackle` (Pike & Pine Outfitters) | Shops & services | venue |  | corners only | N E S W | all 8 | yes | marked |
| `town:laundromat` (Spin Cycle Laundry) | Shops & services | venue |  | corners only | N E S W | all 8 | yes | marked |
| `town:postoffice` (Maple Falls Post Office) | Shops & services | venue |  | corners only | N E S W | all 8 | yes | marked |
| `variation:expansion-abandoned-workshop-26852883:1` (Derelict brick repair workshop - variation 1) | Industry | building |  | one picture | NE SE SW NW N E S W | none | yes | missing |
| `variation:expansion-rundown-house-a7c17683-plain:1` (Boarded-up timber house - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-back-shed-garden-ac94c81e-plain-corner:1` (House back - shed & garden - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-back-shed-garden-ac94c81e-plain:1` (House back - shed & garden - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-duplex-c39d1a23-plain-corner:1` (Duplex - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-duplex-north-521714ac-plain:1` (Duplex - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-farmhouse-wrap-2b0eea83-plain-corner:1` (Farmhouse - wraparound porch - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-farmhouse-wrap-2b0eea83-plain:1` (Farmhouse - wraparound porch - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-farmhouse-wrap-north-446969e5-plain:1` (Farmhouse - wraparound porch - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-l-ranch-18552ce5-plain:1` (Ranch - L-shape, corner porch - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-l-shape-e0e3b328-plain-corner:1` (Colonial - L-shape, double garage - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-l-shape-e0e3b328-plain:1` (Colonial - L-shape, double garage - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-l-shape-north-79eba705-plain:1` (Colonial - L-shape, double garage - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-ranch-long-a4ddd58c-plain-corner:1` (Ranch house - long, carport - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-ranch-long-a4ddd58c-plain:1` (Ranch house - long, carport - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-splitlevel-8b6b4aa4-plain:1` (Split-level house - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:gen-house-splitlevel-north-63bc759e-plain:1` (Split-level house - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-bottling-plant-13e91e4e:1` (Small bottling plant - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-cold-storage-378b3489:1` (Cold storage depot - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-foundry-606f1084:1` (Small iron foundry - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-freight-depot-a030c919:1` (Freight transfer depot - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-lumber-workshop-8a43a691:1` (Lumber planing workshop - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-printing-works-2be751ae:1` (Local printing works - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-rail-repair-shed-fbe2c8d9:1` (Rail repair shed - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-textile-mill-eedf9576:1` (Old textile mill - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:industrial-utility-substation-54820c2b:1` (Utility control building - variation 1) | Industry | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:ref-building-barn-74bee205-plain:1` (Barn - variation 1) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:ref-building-church-1df07e15-plain:1` (Church - variation 1) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:ref-building-corner-shop-2ffc6ab7-plain:1` (Corner Shop - variation 1) | Shops & services | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `variation:ref-building-drive-in-screen-b0bccc2a-plain:1` (Drive In Screen - variation 1) | Landmarks | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `variation:ref-building-gas-canopy-543306a0-plain:1` (Gas Canopy - variation 1) | Shops & services | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `variation:ref-building-gas-shop-3326e70f-plain:1` (Gas Shop - variation 1) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:ref-building-house-cottage-fc52ce66-plain:1` (House Cottage - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:ref-building-house-large-20cb9f9e-plain:1` (House Large - variation 1) | Houses | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `variation:town-barber-13c5ef06-plain:1` (Clip Joint Barbers - variation 1) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:town-grocery-46d5dc39-plain:1` (Maple Family Market - variation 1) | Shops & services | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `variation:town-laundromat-43183f9e-plain:1` (Spin Cycle Laundry - variation 1) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:town-postoffice-1c7025b8-plain:1` (Maple Falls Post Office - variation 1) | Shops & services | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:world-barn-ae80f6c9-plain:1` (Barn - variation 1) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:world-house_0-51fa4b80-plain:1` (House 0 - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:world-house_2-north-332663ab-plain:1` (House 2 - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:world-house_5-d6198cb0-plain:1` (House 5 - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `variation:world-house_5-north-bffd2c68-plain:1` (House 5 - variation 1) | Houses | building |  | corners only | N E S W | all 8 | yes | marked |
| `world:bleachers` (Bleachers) | Landmarks | building |  | corners only | N E S W | NE SE SW NW | yes | marked |
| `world:diner` (Diner) | Shops & services | venue |  | corners only | N E S W | all 8 | yes | marked |
| `world:drivein_marquee` (Drivein Marquee) | Landmarks | building |  | corners only | N E S W | all 8 | yes | marked |
| `world:house_5` (House 5) | Houses | house |  | corners only | N E S W | all 8 | yes | marked |
| `lot:8x15-front-0` (House lot 8x15 front 1 (family)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-1` (House lot 8x15 front 2 (retired)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-2` (House lot 8x15 front 3 (worker)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-3` (House lot 8x15 front 4 (party)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-4` (House lot 8x15 front 5 (dreamer)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-5` (House lot 8x15 front 6 (mechanic)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-7` (House lot 8x15 front 8 (retired)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-front-9` (House lot 8x15 front 10 (party)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-rear-0` (House lot 8x15 rear 1 (family)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-rear-3` (House lot 8x15 rear 4 (dreamer)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |
| `lot:8x15-rear-4` (House lot 8x15 rear 5 (worker)) | Lots | lot |  | one picture | NE SE SW NW N E S W | none | yes | no |

## Buildings with all their views

| Building | Category | Kind | In the game |
| --- | --- | --- | --- |
| `expansion:dormer-rear` (Dormer home - rear and side) | More houses | building | eight views |
| `gen:back-bbq-deck` (House back - deck & barbecue) | Houses | building | eight views |
| `golf:clubhouse-shanty` (Starter clubhouse (a tin and tarp shack)) | Golf tournament | building | eight views |
| `golf:food-tent` (Food tent (burger)) | Golf tournament | building | eight views |
| `golf:leaderboard` (Main leaderboard (blank)) | Golf tournament | building | eight views |
| `golf:toilet-block` (Toilet block (portable toilets)) | Golf tournament | building | eight views |
| `town:firestation` (Maple Falls Fire House) | Shops & services | venue | eight views |
| `variation:expansion-boarded-store-rear-d09a309a:1` (Abandoned brick store - rear - variation 1) | Industry | building | eight views |
| `variation:expansion-cottage-rear-e52a10bb-plain:1` (Cottage - rear and side - variation 1) | More houses | building | eight views |
| `variation:expansion-derelict-two-storey-012bed48:1` (Dilapidated two-storey house - variation 1) | Industry | building | eight views |
| `variation:expansion-garage-rear-91bcbe45:1` (Timber garage - rear view - variation 1) | More houses | building | eight views |
| `variation:expansion-rundown-house-a7c17683-plain-corner:1` (Boarded-up timber house - variation 1) | Industry | building | eight views |
| `variation:expansion-rundown-house-north-24ae3116-plain:1` (Boarded-up timber house - variation 1) | Industry | building | eight views |
| `variation:gen-back-bbq-deck-b546df1a-plain:1` (House back - deck & barbecue - variation 1) | Houses | building | eight views |
| `variation:gen-back-patio-pool-3b943d52-plain-corner:1` (House back - patio & pool - variation 1) | Houses | building | eight views |
| `variation:gen-back-screened-porch-8c31c391-plain:1` (House back - screened porch - variation 1) | Houses | building | eight views |
| `variation:gen-back-swingset-a10c81b7-plain-corner:1` (House back - swing set & grill - variation 1) | Houses | building | eight views |
| `variation:gen-back-swingset-a10c81b7-plain:1` (House back - swing set & grill - variation 1) | Houses | building | eight views |
| `variation:ref-building-barn-v2-b96e34dc-plain:1` (Barn V2 - variation 1) | Landmarks | building | eight views |
| `variation:ref-building-diner-1e19ec22-plain:1` (Diner - variation 1) | Shops & services | building | eight views |
| `variation:ref-building-farm-shed-0280794d-plain:1` (Farm Shed - variation 1) | Landmarks | building | eight views |
| `variation:ref-building-farmhouse-ef501a21-plain:1` (Farmhouse - variation 1) | Houses | building | eight views |
| `variation:ref-building-garage-0f7895a1-plain:1` (Garage - variation 1) | Houses | building | eight views |
| `variation:ref-building-grocery-79498713-plain:1` (Grocery - variation 1) | Shops & services | building | eight views |
| `variation:ref-building-house-cottage-north-304e5431-plain:1` (House Cottage - variation 1) | Houses | building | eight views |
| `variation:ref-building-house-dormer-b4413f08-plain:1` (House Dormer - variation 1) | Houses | building | eight views |
| `variation:ref-building-house-dormer-north-6952cea5-plain:1` (House Dormer - variation 1) | Houses | building | eight views |
| `variation:ref-building-house-garage-a1d986d3-plain:1` (House Garage - variation 1) | Houses | building | eight views |
| `variation:ref-building-house-garage-north-a7184edf-plain:1` (House Garage - variation 1) | Houses | building | eight views |
| `variation:ref-building-house-large-north-24d21776-plain:1` (House Large - variation 1) | Houses | building | eight views |
| `variation:ref-building-mausoleum-719fd618-plain:1` (Mausoleum - variation 1) | Landmarks | building | eight views |
| `variation:ref-building-shop-blue-941779e4-plain:1` (Shop Blue - variation 1) | Shops & services | building | eight views |
| `variation:static-garage_brick-v2-be1ee461-plain:1` (Garage Brick V2 - variation 1) | Houses | building | eight views |
| `variation:static-garage_timber-v2-22fab891-plain:1` (Garage Timber V2 - variation 1) | Houses | building | eight views |
| `variation:static-shop_brick_rear-04db4dfa-plain:1` (Shop Brick Rear - variation 1) | Shops & services | building | eight views |
| `variation:static-shop_market_rear-f9272004-plain:1` (Shop Market Rear - variation 1) | Shops & services | building | eight views |
| `variation:town-bakery-af15d7f5-plain:1` (Rose's Bakery - variation 1) | Shops & services | building | eight views |
| `variation:town-fish_tackle-99c1401c-plain:1` (Pike & Pine Outfitters - variation 1) | Shops & services | building | eight views |
| `variation:town-hardware-bf36737f-plain:1` (Bellamy Hardware - variation 1) | Shops & services | building | eight views |
| `variation:town-pharmacy-d87b861c-plain:1` (Maple Pharmacy - variation 1) | Shops & services | building | eight views |
| `variation:world-arcade-f5b7f5eb-plain:1` (Arcade - variation 1) | Landmarks | arcade | eight views |
| `variation:world-church-44e76535-plain:1` (Church - variation 1) | Landmarks | building | eight views |
| `variation:world-diner-c9878d46-plain:1` (Diner - variation 1) | Landmarks | building | eight views |
| `variation:world-house_0-north-1dde6f56-plain:1` (House 0 - variation 1) | Houses | building | eight views |
| `variation:world-house_1-ba13ed2e-plain-corner:1` (House 1 - variation 1) | Houses | building | eight views |
| `variation:world-house_1-north-2521eca8-plain:1` (House 1 - variation 1) | Houses | building | eight views |
| `variation:world-house_3-north-2638a034-plain:1` (House 3 - variation 1) | Houses | building | eight views |
| `variation:world-video-bf85dfb9-plain:1` (Video - variation 1) | Landmarks | building | eight views |
| `world:arcade` (Arcade) | Shops & services | arcade | eight views |
| `world:barn` (Barn) | Landmarks | venue | eight views |
| `world:house_0` (House 0) | Houses | house | eight views |
| `world:house_1` (House 1) | Houses | house | eight views |
| `world:house_2` (House 2) | Houses | house | eight views |
| `world:house_3` (House 3) | Houses | house | eight views |
| `world:house_4` (House 4) | Houses | house | eight views |
| `world:primary_school` (Primary School) | Landmarks | venue | eight views |
| `world:school` (School) | Landmarks | venue | eight views |
| `world:snack_bar` (Snack Bar) | Landmarks | venue | eight views |
| `world:video` (Video) | Landmarks | venue | eight views |
| `world:video_rental` (Video Rental) | Shops & services | venue | eight views |
| `ce:parking-garage-2storey` (Parking garage, 2 storeys) | Parking | building | old straight-on set (4) |
| `ce:parking-garage-3storey` (Parking garage, 3 storeys) | Parking | building | old straight-on set (4) |
| `ce:parking-garage-4storey` (Parking garage, 4 storeys) | Parking | building | old straight-on set (4) |
| `ce:parking-garage-5storey` (Parking garage, 5 storeys) | Parking | building | old straight-on set (4) |
| `ce:parking-garage-6storey` (Parking garage, 6 storeys) | Parking | building | old straight-on set (4) |
| `town:bakery` (Rose's Bakery) | Shops & services | venue | old straight-on set (4) |
| `town:grocery` (Maple Family Market) | Shops & services | venue | old straight-on set (4) |
| `town:pharmacy` (Maple Pharmacy) | Shops & services | venue | old straight-on set (4) |
| `variation:expansion-dormer-rear-55d3cd77-plain:1` (Dormer home - rear and side - variation 1) | More houses | building | old straight-on set (4) |
| `variation:gen-house-l-ranch-18552ce5-plain-corner:1` (Ranch - L-shape, corner porch - variation 1) | Houses | building | old straight-on set (4) |
| `variation:gen-house-l-ranch-north-2edc5f59-plain:1` (Ranch - L-shape, corner porch - variation 1) | Houses | building | old straight-on set (4) |
| `variation:industrial-auto-body-shop-63875699:1` (Auto body workshop - variation 1) | Industry | building | old straight-on set (4) |
| `variation:industrial-brick-machine-shop-34206b23:1` (Brick machine shop - variation 1) | Industry | building | old straight-on set (4) |
| `variation:industrial-corrugated-warehouse-69aeee07:1` (Corrugated warehouse - variation 1) | Industry | building | old straight-on set (4) |
| `variation:ref-building-corner-store-a89c59c0-plain:1` (Corner Store - variation 1) | Shops & services | building | old straight-on set (4) |
| `variation:ref-building-farmhouse-north-408a9ca6-plain:1` (Farmhouse - variation 1) | Houses | building | old straight-on set (4) |
| `variation:ref-building-snack-bar-4e0d11f7-plain:1` (Snack Bar - variation 1) | Landmarks | building | old straight-on set (4) |
| `variation:world-house_1-ba13ed2e-plain:1` (House 1 - variation 1) | Houses | building | old straight-on set (4) |
| `variation:world-house_4-north-630f880a-plain:1` (House 4 - variation 1) | Houses | building | old straight-on set (4) |
| `world:gazebo` (Gazebo) | Landmarks | gazebo | old straight-on set (4) |
