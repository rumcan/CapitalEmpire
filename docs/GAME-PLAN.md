# Capital Empire: game plan (v3, towns and tourism booms)

You connect the towns of a valley. You build a tourism attraction (a water park, a Las Vegas-style casino boulevard),
and every season it booms: the other towns send their tourists by car. Whatever reaches the venue spends money; every
car that is stuck in traffic when the boom ends is money lost and growth lost. You find the bottleneck, upgrade the
roads, and the next boom gets more cars through. The loop is:
**build an attraction → the boom → find where the tourists got stuck → fix the roads → the next boom delivers more → repeat.**
Section 1.0 is the core mechanic (2026-10-18); the rest of the plan describes the road builder, the traffic sim, the
towns and the tools it runs on. Section 1.0.6 lists where the earlier plan pivots.

Decisions made so far:
| Topic | Decision |
| --- | --- |
| Setting | **For now: a sleepy maple-wooded town valley** (2026-10-17), because all the current art is Maple Falls maple. The 1980s Las Vegas desert valley described in this plan is **deferred**: it comes back as a re-skin once the desert art exists (see section 7). Eras advance over in-game time (80s, 90s, 2000s, today) as new art arrives. |
| Map | 4 × 4 km = **2048 × 2048 tiles** (2 m tiles), up from 160. **Several towns on it** (2026-10-18, section 1.0.1). |
| Core mechanic | **Connect the towns; tourism first** (2026-10-18): attractions boom by season, the tourists drive from the other towns, and each boom is scored on how many reach the venue (section 1.0). Other industries (logistics) come later. |
| Terrain | Seeded, fixed hills, valleys and rivers. They are not editable and they block building. Roads cross rivers on **bridges** and go through hills in **tunnels**. |
| Player control | **Roads and the industry the player adds** (changed 2026-10-18). The player builds roads and places **tourism attractions** (section 1.0); the towns still build their own houses, shops and lots (the Lot Composer, section 1.5). Before 2026-10-18 the player placed no buildings at all. |
| Road builder UX | **Cities: Skylines (and similar games) is the reference** for road tools, controls and feel, so players from those games feel at home (section 3.2). |
| Closest zoom | **30%**, the town builder's 30% zoom (`ZOOM_MAX = 0.3` already). Full art quality has to hold at that zoom. |

---

## 0. Theme (deferred to the end)

The theme (who you are and why you build the roads) is **open and comes last** (decided 2026-10-18): the game loop
is designed first, and the theme is written afterwards to fit the final gameplay. The earlier alien-parasite story is
dropped; nothing in the plan depends on a theme.

A direction the owner is exploring (an idea, not a decision): you start by adding a business to a town, which makes the
town boom; the boom brings the traffic you have to fix; then new towns pop up, and the traffic between the towns becomes
the next thing to fix (a logistics layer).

---

## 1. The game

### 1.0 The core mechanic: connect the towns, tourism first (2026-10-18)

This replaces the single-town boomtown loop as the heart of the game. Everything below it (road builder, traffic sim,
the towns' own growth, the bottleneck tools, the budget) stays and is used by it.

#### 1.0.1 The map: several towns
- The valley holds **several towns** (start with 2–3; more appear as the Career advances, section 1.0.5). Each town is
  a Phase 3 town: it grows its own houses, shops and gravel streets, and its people drive.
- The towns start joined by poor links (gravel or country lanes, or one highway). **Connecting them is the player's
  job**: the roads between the towns and the attractions are where the booms are won or lost.
- Towns outside the valley send tourists in through the **highway entries** at the map edge (the "outside world").

#### 1.0.2 The attraction (the industry the player adds)
- The player picks an attraction and **places it** on suitable land (a site rule: flat ground of a minimum size, road
  access). Tourism only for now; the first two:
  - **Water park:** a summer attraction; a big boom each summer weekend, quiet off season.
  - **Casino boulevard** (Las Vegas style): a strip of casinos along a boulevard; booms every weekend all year and a
    huge New Year's Eve boom.
  - Later: a stadium (match days), a ski hill (winter), a fairground or festival, a beach resort.
- Each attraction has a build cost and upkeep, a **capacity** (visitors per boom), a **spend per visitor**, a
  **season calendar** (when it booms and how big), a **car park** (where the tourists' trips end) and a
  **reputation** (section 1.0.4).
- The Lot Composer builds the attraction as a special site (pools and slides; casinos, neon, car parks), the same
  way it builds the towns' lots.

#### 1.0.3 The boom (the traffic event)
- When an attraction's season comes, its **boom** starts: over the boom window every other town (and the highway
  entries) sends tourists by car, in a wave that rises, peaks and fades. How many each town sends depends on its size,
  its travel time to the attraction and the attraction's reputation.
- The tourists are real cars in the sim: they leave the towns' driveways, drive the network and end in the
  attraction's car park. They come on top of the towns' everyday traffic, so the boom finds every weak link.
- Each tourist has a **deadline** (the boom window, or a patience time): a car that arrives in time spends in full, a
  late car spends less, and a car still on the road when the boom ends (or one that gives up: the sim's abandoned
  trips) is **lost**.

#### 1.0.4 The assessment (scored during the boom)
- During the boom the game counts, per attraction and per origin town: tourists **sent**, **arrived** (in time,
  late) and **lost**; the **revenue** (arrivals × spend × punctuality) and the **revenue lost** (what the lost and late
  tourists would have spent).
- After the boom a **boom report** shows these, the worst bottlenecks during the boom (the Phase 4 bottleneck list
  recorded over the boom window), the roads the lost cars were stuck on, and the comparison with the previous boom at
  the same attraction (the before/after of section 3.4, boom against boom).
- **Lost tourists are money lost and growth lost.** The attraction's **reputation** follows its delivered share
  (arrived / sent): a good boom raises it, so the next boom is bigger (more tourists, more money, more load); a bad one
  lowers it. The host town grows with the attraction's success (jobs, hotels, shops), and the origin towns grow with
  what their people bring home; failed booms slow both.
- The loop: the boom → the report → upgrade the roads where the tourists got stuck → the next boom delivers a bigger
  share → more money and reputation → a bigger boom → the next bottleneck → a second attraction or a new town.

#### 1.0.5 Money and the Career
- **Income** is mostly the tourists' spending at the attractions, plus a smaller tax from the towns (section 1.3).
  **Costs:** roads (construction and upkeep), attractions (build and upkeep), signals, compensation, loans.
- **Career:** milestones by tourism results (visitors served in a season, revenue, reputation) instead of population.
  They unlock road classes, junction types, tunnels, new attraction types and **new towns** that appear on the map and
  have to be connected. Lose: bankruptcy (unchanged).

#### 1.0.6 Where the plan pivots
| Area | Before (up to Phase 4) | Now |
| --- | --- | --- |
| Player control | Roads and traffic only; the player never places a building | Roads **and** tourism attractions; the towns still build their own lots |
| Map | One town growing out of one highway exit | Several towns; the links between them are the player's main work |
| Demand | Steady daily commuting from the town's lots (gravity model, rush hours) | **Seasonal booms** from the other towns to an attraction, on top of the everyday traffic |
| Score | Zone access (trip time / free flow); growth stops above 1.8 | **Boom delivered share** (arrived in time / sent), revenue and revenue lost; zone access stays for the towns' own growth |
| Growth | Driven by access, with unlimited demand | Driven by boom success: reputation scales the next boom; host and origin towns grow with tourism |
| Money | Property tax and business takings | Mostly tourist spending; tax and takings stay as a smaller base |
| Before/after | One rush window against the next | One boom against the next (rush windows stay for everyday traffic) |
| Career | Population milestones, win at 6,000 residents | Tourism milestones; unlocks include attractions and new towns |
| Time | One sim second is one game minute; a day is 24 real minutes at 1x | A boom is an event of fixed sim length; seasons are a sequence of booms (open: section 7, item 6) |
| Vegas look | A later re-skin of the whole valley to a desert | The casino boulevard is an attraction inside the valley; the full desert re-skin matters less (section 7, item 4) |
| Theme | (dropped 2026-10-18) | Written last, to fit this mechanic (section 0) |

What carries over unchanged: the road builder and its tools, the traffic sim (IDM, MOBIL, junctions, routing), the
bottleneck tools (flow, LOS, the ranked list, the inspector, the junction routes), the time controls, the budget
machinery, the towns' own growth and the Lot Composer, and the gravel roads the towns lay inside themselves.

### 1.1 Core loop
_Since 2026-10-18 this is the everyday loop inside each town; the main loop is the boom of section 1.0._
1. **Build.** Lay roads, junctions, bridges, tunnels and later freeways, all within your budget. A new road opens
   land.
2. **The city grows.** Every lot that can be reached gets demand. Houses, motels, shops and casinos build
   themselves with lived-in layouts.
3. **Traffic.** Each building produces trips by time of day: the morning rush, shift changes on the Strip, tourists
   coming in on the highway, the evening rush, the night-time Strip crowd. Every trip is a car on a lane.
4. **Find the bottleneck.** Junction delay, queues, and a ranked "worst bottlenecks" list show where the time is
   lost. Districts shade amber where growth has slowed and red where it has stopped.
5. **Optimise.** Upgrade roads, add turn lanes, retime the signals, add a roundabout, make roads one-way, build a
   bypass, a bridge or a tunnel. A before/after panel shows whether the change worked.
6. **Repeat.** The new capacity lets growth restart, which brings new traffic and the next bottleneck.

### 1.2 Growth comes from traffic efficiency
_Still true inside each town (zone access); between the towns, boom success drives growth (section 1.0.4)._
- Demand is unlimited: it is a boomtown. **Your network is the only limit.**
- Each district (zone) has an **access score**: actual trip time divided by free-flow trip time, for trips that
  start or end there.
  - Below 1.3: full growth, and buildings upgrade.
  - 1.3–1.8: growth slows (amber).
  - Above 1.8: growth stops (red) and the worst buildings start to decline (boarded up, then derelict, then
    cleared).
- **The game zones, not the player** (section 1.5). The road class still shapes the character of the land beside
  it, inside the land use the game allocated. Lanes and streets grow tract
  houses and trailer parks. Roads grow mixed use, motels and gas stations. Avenues grow strip malls, chapels and
  pawn shops. Boulevards grow the **Strip**: casinos and resorts, which are big traffic magnets. The land near the
  freeway, the railway or the map edge grows industry.
- External traffic comes in from the outside: a highway at the map edge (I-15 style) carries tourists and trucks.
  It grows with the size of the Strip.

### 1.3 Budget
_Since 2026-10-18 the main income is the tourists' spending at the attractions (section 1.0.5); the taxes below stay as a smaller base. Built in Phase 4 (`src/game/budget.ts`)._
- **Income:** property tax (land value × access), business tax (customers who actually arrived), tourist tax
  (hotel rooms that are full).
- **Costs:** construction (by class and length; bridges and tunnels per metre, which is expensive), daily
  upkeep, signal hardware, compensation for buildings in a new road's path, loans.
- Jams hit you twice: growth stops, and businesses earn less because customers arrive late.
- **Lose:** bankruptcy. **Progress:** population milestones unlock road types, tools, grants, and the next era.

### 1.4 Eras
Every art item and every building records an `era`. The MVP is 1980–1989 only. Later the eras advance by in-game
years: new buildings use the current era's art, old ones redevelop slowly, and the mix of cars changes. The data
model supports this from day 1, so new sprites can be added without code changes.


### 1.5 Land use and growth options (the town builds itself)
- **The player builds no buildings, ever.** They work the traffic: roads, junctions, signals, bridges, tunnels.
- **The game allocates the lots by default.** When a road opens land, the parcels next to it get a land use from
  the terrain, the road class, the distance to the highway and river, the neighbours, and the current demand:
  - **Residential:** preset houses that look amazing, with full backyards, fences, plants, pools, sheds and
    driveways (the Lot Composer, section 3.5).
  - **Commercial:** shops, offices and diners with **parking lots, loading bays and back alleys** generated on the
    lot.
  - **Industrial:** yards, warehouses and truck docks near the highway, the rail line or the edge of the map. They
    make truck traffic.
  - **Tourism:** the attractions are now **placed by the player** (section 1.0.2) and boom by season (section
    1.0.3). The towns' own TOUR lots (hotels, motels, shops near water) still grow by themselves around them.
  - **Government:** the town hall, schools, the police and fire stations, hospitals. They are fixed destinations
    with their own rush peaks (school runs, shift changes) and emergency vehicles that need clear routes.
- **The town lays its own roads, as gravel (decided 2026-10-17).** When the town grows into new land it extends
  its street network itself with cheap **gravel roads** (a new road class: narrow, slow, low capacity, dusty, no
  sidewalks) out to the lots it allocates. The player never has to build the growth roads; the player's job is to
  **upgrade** them (pave gravel into street, road, avenue or boulevard, add junction control) and **reroute**
  traffic (new links, bypasses, bridges and tunnels, closing or downgrading roads) as the gravel network jams.
  Unpaved roads cap how much a district can grow, so paving is how the player unlocks growth where they want it.
- **Growth options (player choice).** Instead of zoning, the player picks how the town should naturally grow from
  a few options, for example: "family suburb", "industrial boom", "tourist town", "downtown core", "balanced".
  The option shifts the allocation weights and the demand mix; it never places anything directly. The exact set
  of options and when they unlock is still open (section 7).
- **Demand events:** the tourism booms of section 1.0.3 are the first kind; later industries (freight between the
  towns) add others.

---

## 2. Efficiency architecture (do this first, everything depends on it)

A 4 km city has roughly **15–25k lots, 400–600k upright sprites, 30–50k road segments, and 5–10k cars moving at
once**. The current engine draws every prop with Canvas2D `drawImage` and rebuilds the whole road network on every
edit. Neither scales. Six rules:

1. **Bake everything flat.** Ground, roads, markings, driveways, pools, gravel yards, lawns, decals and static
   shadows are baked into ground chunks, which the current renderer already does for roads. Per frame, only
   **upright** sprites and vehicles are drawn.
2. **GPU for anything that moves or stands.** A WebGL2 instanced sprite layer: texture atlases, one draw call per
   atlas page, and a per-frame radix sort of the visible instances by iso depth. The existing Canvas2D ground
   painter stays because its quality is excellent. It runs in a **Web Worker with OffscreenCanvas**, and the baked
   chunks are uploaded as textures.
3. **Spatial cells.** The map is split into 64 × 64-tile cells (32 × 32 cells). Every system works on cells: lot
   layouts, instance buffers, ground chunks, network features, and the dirty flags for invalidation.
4. **Incremental network.** `RoadNetwork.rebuild()` is split into topology (pure TS, which runs in Node and the
   worker) and per-cell feature building. An edit rebuilds only the touched nodes, routes and cells.
5. **Derived, not stored.** Terrain is regenerated from its seed. Lot layouts are regenerated from
   `(lot id, archetype, household story, condition, era, seed)`. A save holds the roads, the lot states and the
   seed, not 500k props. Saves are gzip-compressed.
6. **Simulation off the main thread.** The traffic sim runs in a worker at a fixed 10 Hz, using
   struct-of-arrays typed arrays. It sends position snapshots back (a transferable double buffer, or a
   SharedArrayBuffer when the host is cross-origin isolated). The main thread only interpolates and draws.

### 2.1 Zoom tiers
At 30% a 2 m tile is 38 px wide (77 px on retina). To see the whole 4 km city at once you need about 0.7%. Three
tiers:

| Tier | Zoom | Shows |
| --- | --- | --- |
| **Street** | 30% – 12% | Everything: all props, car lights and signals, people later |
| **District** | 12% – 4% | Props under about 1 m on screen are culled; cars use smaller mips |
| **Planner** | 4% – 0.7% | A pre-baked low-res city map (roofs, roads, terrain) per cell. Cars become flow-coloured lanes and dots. Heatmaps, bottleneck pins and access shading. **This is where bottlenecks are found.** |

### 2.2 Art scale contract (TrickOrTreat art → 30% max)
- Art is authored at the town builder's native **128 px per tile**. At 30% zoom on a dpr-2 screen, one native
  pixel is 0.6 device pixels. So the **largest mip we ship is 0.6× native**, plus 0.3× and 0.15×. A dpr-1 screen
  loads only 0.3× and below, which halves the memory. (Today `prep-sprites.py` ships one 0.5× image per sprite.)
- The ingest pipeline does: fetch → normalise the scale so that game scale 1 equals real size (the owner's scale
  table, `places-v5/scales.json`) → trim the alpha → downsample with mild sharpening, so that thin fences, wires
  and railings survive at 0.3 → pack into 4096² atlases → write metadata: anchor, footprint boxes, facing, era,
  tags, flat or upright.
- **The readability rule at 30%:** anything under about 0.5 m either goes into the ground bake as a decal or is
  dropped. A review sheet renders every sprite at exactly 30% and 12% on desert ground before it is accepted.
- **The facing rule** (from the TrickOrTreat asset spec): unflipped art faces +Y and flipped art faces +X. Every
  building needs **a front view and a rear view**, so that streets on all four sides can be fronted. Signs with
  lettering are never mirrored, so they need separate front art for each side.

### 2.3 Performance budgets (gates, measured on a benchmark scene)
| Item | Budget |
| --- | --- |
| Frame (main thread) | ≤ 8 ms at 60 fps: ground blit 1 ms, sort and instances 3 ms, cars 2 ms, overlays 1 ms |
| Visible instances | ≤ 60k at the Street tier, ≤ 120k at the District tier |
| Active vehicles | 10k simulated, 5k drawn |
| Sim tick | ≤ 25 ms of worker time per 100 ms tick at 10k cars |
| GPU memory | Atlases ≤ 96 MB (dpr 2), ≤ 32 MB (dpr 1); ground cache ≤ 192 MB with LRU eviction |
| Network edit | ≤ 30 ms to see the change, from the click to the redrawn ground |
| Save | ≤ 2 MB compressed for a full city |

---

## 3. Systems

### 3.1 Terrain generator (fixed hills, valleys, rivers)
1. **Height field** at 8 tiles per sample (256²). Ridged noise makes mountain ranges along two or three edges.
   Domain-warped noise makes buttes and mesas. The valley floor is flattened for building.
2. **Rivers.** Water flows downhill (D8 flow accumulation) from the high ground to the map edge, smoothed into
   splines. There is one main river (Colorado style, 40–80 m wide) and several **dry washes** (arroyos, 6–15 m),
   which also need short bridges or culverts.
3. **Hills become fixed sprites.** Each hill's outline is filled with a modular **rock kit**: cliff faces cut for
   the +X/+Y facings, butte tops, talus, boulder fields, desert varnish. These are depth-sorted like buildings.
   The ground underneath is baked as rocky sand. The kit is modular, so huge mesas need no huge unique images.
4. **Collision mask.** The hill and river polygons are rasterised into the 2048² occupancy grid. Nothing builds
   there. Roads may only cross them as bridges (water) or tunnels (rock).
5. **Guarantees** (generator tests): at least 55% of the land is buildable and connected; the start site sits
   beside the highway entry and the river; there is at least one natural chokepoint (a gorge or a single bridge
   site), so the first big bottleneck is built into the map.

### 3.2 Road builder (keep what is great, add what traffic needs)
**The reference is Cities: Skylines** (1 and 2) and similar games. We want their players, and a familiar UX makes
the game easy to pick up. Match their conventions wherever it doesn't fight our iso art:
- **Draw modes:** straight, curved (3-click: start, control, end), freeform, and upgrade (click or drag along a
  road to change its class, direction or lanes in place).
- **Snapping and guides:** to road ends, to the middle of segments, to grid and angle guide lines, parallel
  offsets; live length, angle and cost shown at the cursor.
- **Elevation:** Page Up/Down (or a slider) to raise or lower the road being drawn, which gives bridges,
  overpasses and tunnels with the same tool.
- **A road palette by hierarchy:** small, medium, large, highways, one-way variants, and road assets (with/without
  trees, medians, bike lanes).
- **The junction editor** (as in C:S 2 and the TM:PE mod): lane connections, lane arrows, turn bans, stop and
  yield signs, traffic lights with a phase editor, and priority roads.
- **Quick tools:** roundabout stamps, highway ramps, a grid stamp, a parallel-road tool, bulldoze with refund,
  and undo/redo.
- **Overlays:** traffic flow, road condition, noise and the cars' routes for a selected road or vehicle (as in
  C:S "route view").
**Keep:** the 5 classes, 90°/45° routing, auto-split at crossings, curb corners, zebras, stop lines, medians,
roundabouts, slipways, cul-de-sacs, piece bulldozing, lamp pools, the build reveal. The palette is re-themed for
the desert: sun-bleached asphalt, concrete curbs, gravel verges.

**New:**
| Group | Features |
| --- | --- |
| Crossing terrain | **Bridges** (deck, piers and railings sprites; flat decks over the sunken river; cost per metre). **Tunnels** (portal sprites at the hill edges, invisible underground run, straight only, very expensive). |
| Flow control | One-way roads, lane arrows and turn lanes, stop and yield per approach, signal phase editor (cycle, splits, protected left, coordinated "green waves" along a corridor), turn bans, roundabout sizes |
| Capacity | Upgrade or downgrade in place (pay the difference), **roadworks** (lanes close while they are built), a Strip boulevard with 6 lanes |
| Freeways (later phase) | A freeway class, on/off ramps, interchanges, overpasses. These need an **elevated layer**: deck strips cut into depth-sortable slices, later shared with high bridges. |
| Geometry | Arc and broad-bend tool (stored as dense polylines; `buildRoutes` already merges them), parallel-road tool, block-grid stamp (40 tiles = 80 m, the preset block size), snap to road ends |
| Workflow | Undo/redo for whole edits, network health warnings (dead ends, unreachable lots, junctions too close together) |

### 3.3 Traffic simulation
**The bar (owner, 2026-10-17): the traffic system must be super powerful and adapt to every change.** That means:
- **Every edit takes effect at once.** A new road, a closed lane, a changed signal or roadworks changes the lane
  graph, and the cars already driving re-plan; nothing waits for a rebuild.
- **Routes react to congestion.** Route costs use the measured travel times, not only free-flow speeds, so drivers
  spread onto alternatives as jams form, and come back when the jam clears (with damping, so they don't flip-flop).
- **Disruptions are first-class:** tourism events, roadworks, accidents and emergency vehicles inject surges or
  close capacity, and the sim must absorb them without deadlock.
- **Scale:** 10k simulated cars within the budget in section 2.3, with mesoscopic fallback off-screen (section 6)
  if needed.

**Build or borrow (decided 2026-10-17).** We write our own TypeScript simulator. We use the published models, not
someone else's engine, because the sim has to update incrementally on every road edit, run in our worker on our
lane graph, and ship in a browser.
- [movsim/traffic-simulation-de](https://github.com/movsim/traffic-simulation-de) is the reference for accuracy. It
  is Treiber's own IDM and MOBIL in JavaScript, licensed GPL-3.0, so we implement the published equations rather than
  copy its code. Its scenarios (ring road, on-ramp, lane closure) become our validation tests.
- [cityflow-project/CityFlow](https://github.com/cityflow-project/CityFlow) (Apache-2.0, C++): the model for lane
  links, junctions and signal phases at city scale.
- [a-b-street/abstreet](https://github.com/a-b-street/abstreet) (Apache-2.0, Rust): a traffic game about editing a
  city's roads. Its ideas for gridlock handling, live edits and event-driven far-away traffic can be ported, with
  attribution.
- SUMO (EPL-2.0) is the research gold standard, but it is a desktop toolsuite and not practical in a browser.

- **Lane graph** from the network. Arms already carry `dir`, `h`, `laneCentres`, `stop`, `xw`, `reachEdge`,
  roundabout radius and slip geometry. Lanes are directed, right-hand traffic. Connectors are turn curves shaped
  from the same corner fillets the renderer uses. A **conflict table** per node drives gap acceptance and
  "don't block the box".
- **Vehicles.** IDM car-following, MOBIL lane changes, and vehicle types: car, pickup, van, school bus, city bus,
  delivery truck, tour bus and limo for the Strip.
- **Junction control:** priority to the bigger road, stop/yield, fixed-time signals (actuated later), roundabout
  yield, free-flow slips.
- **Routing at scale.** There is no per-trip Dijkstra. The city is split into about 256 destination zones. Each
  zone keeps a **next-hop table** (for every junction, which arm to take) built from reverse Dijkstra over
  congested travel times. Tables are refreshed round-robin, a few zones per tick. At each junction a logit choice
  among the near-best arms spreads the traffic in a natural way. Inside the destination zone, a small local A*
  finds the exact driveway.
- **Boom trips** (section 1.0.3, Phase 5): a wave of trips from the towns' driveways and the highway entries to an
  attraction's car park, each with a deadline; scored on arrival.
- **Trips** are generated per zone pair with a gravity model and time-of-day profiles. There are no persistent
  people. A trip starts as a car leaving a real driveway or car park and ends parked. **The cars parked in
  driveways are the simulated cars:** they leave in the morning and come back at night.
- **Safety valves:** a car stuck in a junction box for more than 60 s is towed (counted, and shown as a marker).
  Spawning is throttled when a zone's exits are saturated.
- **Determinism:** seeded and fixed-step, so the before/after comparison and the tests are reproducible.
- **Detail at the Street tier:** headlights and taillights at night, brake lights when slowing, blinking turn
  signals at junctions, buses stopping at stops, shadows (in the sprite, or as one shader ellipse).
- **Headings.** The existing TrickOrTreat cars have 4 grid facings (`static:compact_n/e/s/w` with 4 colour
  variations; the n/e sprites mirrored give the others). That is enough for an MVP on 90° roads. **45° roads and
  curves need 16 headings.** The recommended source is TrickOrTreat's three.js render pipeline
  (`scripts/art/render-hero-3d.mjs`): render low-poly 1980s cars at 16 headings in the exact camera, with a light
  layer for the head/tail lights.

### 3.4 Bottleneck tools (the "find" half of the loop)
- Lane flow heatmap (volume ÷ capacity) and junction Level-of-Service badges (A to F).
- A **ranked bottleneck list**: vehicle-hours lost per junction or link. Click one to jump the camera there.
- The car inspector (origin, destination, route), and the routes through a selected junction (where its traffic
  comes from and where it goes).
- Overlays for district access shading (green, amber, red) and for where growth is blocked.
- **Before/after:** take a snapshot of the stats, make a change, and after one simulated rush hour the panel shows
  the change in delay, throughput and growth (built in Phase 4). In Phase 5 the boom report compares each boom with
  the previous boom at the same attraction.
- Time controls: pause, 1×, 2×, 4×, 8×; and "skip to rush hour".

### 3.5 Lot Composer (houses that look like the owner built them)
**Scope, 2026-10-17:** the Lot Composer builds **every** lot type, not only houses. Residential gets preset
houses with full backyards, fences and plants. Commercial gets the building plus its **parking lot, loading bay
and back alley**. Industrial gets yards and truck docks. Tourism and government get their own preset sites. Lots
are allocated by the game (section 1.5), never placed by the player. The text below was written for the desert
houses; for the maple setting the same rules apply with Maple Falls art (picket fences and hedges instead of
CMU walls, lawns instead of rock gardens).
A deterministic algorithm. Given a lot, it produces a believable, lived-in layout in the style of the owner's
Maple Falls blocks, but for the desert. It ports the **places-v5 kit** ideas: block-local u/v metres, sidewalk
2.05 m, curb, road centre 5.3 m. CapitalEmpire's `street` class already has the same dimensions (half width
1.625 tiles = 3.25 m, walk 1.025 tiles = 2.05 m). It also ports the owner scale table, the `RUNS` fence and wall
logic, the overlap checks, and the rule that every item is placed for a reason.

1. **Parcel.** Blocks come from the faces of the road graph and are cut into frontage lots. Suburban lots are
   15–20 m wide; motel lots 40 m; Strip parcels 80–200 m. Corner lots get special handling.
2. **Archetype.** Chosen by road class, land value, era and the neighbours. Vegas tract housing really does repeat
   3–4 models along a street, mirrored and recoloured, which is believable and cheap.
3. **Skeleton.** The setback line; the house footprint with the garage beside the drive; the driveway to a curb
   cut; the front walk from door to sidewalk; side-yard gates; a rear patio by the back door; the pool (chance
   depends on value); the AC unit in the side yard; **block walls** around the side and rear (the classic Vegas
   CMU wall, laid as a `RUNS` fence).
4. **Household story.** Young family (toys, trampoline, basketball hoop), retirees (neat rock garden, golf cart),
   shift worker (pickup, a sun-faded car), party house (pool floats, string lights), hobby mechanic (car on
   blocks, tools), neglected (dead lawn, junk car). Each dressing item has an attach rule, such as "at the
   door", "against the wall", "by the pool edge", "at the curb on bin day".
5. **The owner's grammar as rules:** plants packed in beds against buildings, decorations clustered at doors,
   trees tucked against walls, and **nothing alone on open ground**. Item and clustering densities are taken from
   the owner's blocks.
6. **Constraints:** footprints never collide; the driveway and the door path stay clear; the sidewalk stays free;
   **iso occlusion**, meaning no tall item south or east of a front door; at most 35% footprint overlap (the
   places-v5 warning).
7. **Output:** ground operations go to the bake; upright instances go to the cell buffer. It is regenerated on
   demand from the lot state.
8. **It changes over time:** cars come and go with the sim, value rises (pool added, new car, fresh paint), value
   falls (dead lawn, boarded windows), and eras change (redevelopment).
9. **Quality gate:** a stage renderer modelled on TrickOrTreat's `places-v5/stage.mjs` produces contact sheets of
   100 lots at 30%, reviewed next to the owner's blocks. Lots on 45° roads keep axis-aligned buildings with
   stepped setbacks, because the art only faces +X and +Y.

---

## 4. Taking from TrickOrTreat

| Take | Use |
| --- | --- |
| **4-facing 1980s cars** (compact n/e/s/w, pickups, vans, school bus; ×4 colour variations) | MVP moving traffic and parked cars |
| Street furniture (lamps, hydrants, traffic lights, stop signs, bus stop, phone booth, utility pole, mailbox) | Roads and junctions |
| Backyard furniture, scrapyard clutter, *Backyard stories*, *Town odds & ends* (80s satellite dishes, kiddie pools, barbecues, junk cars) | Household-story dressing; anything leafy or autumnal is filtered out |
| Pine Hollow trailer lots, Route 9 gas & diner, salvage yard, strip-mall presets | Desert-fitting place presets: motels, trailer parks, highway stops |
| *New industrial buildings*, *Derelict town* | Industry, and the decline states |
| places-v5 kit, scales table, RUNS, poi-presets (car parks with bays) | The Lot Composer core |
| Lot/paving/driveway ground model (`scripts/lib/town-scene.mjs`) | Baked driveways and car parks |
| Night lighting (`night-light.js`), sprite glows, lamp pools | **Neon Vegas at night**, the biggest visual payoff |
| RUN imagegen + slicer pipeline (`scripts/town-variations/`), ASSET_SPEC camera rules | Producing the new desert art in the exact same camera |
| three.js render pipeline | Cars with 16 headings |
| Road master plan rules (marking phase, crossing orientation, lot portals) | Acceptance rules for the new road features |

**Does not fit the desert:** autumn trees, leaf drifts, Halloween items, grass decals, mums, the Maple Falls
houses with porches (except as an older-town variant).

As TrickOrTreat's `AGENTS.md` requires, we only **read** from its `output/town-builder/` and copy into this repo
through prep scripts.

### 4.1 New art for the 1980s MVP (made with the TrickOrTreat pipeline)
| Group | Items (front + rear view for buildings) |
| --- | --- |
| Ground | Sand, caliche, desert gravel, rock-yard gravel, green lawn, dead lawn, concrete, sun-bleached asphalt, river water, wet bank |
| Terrain kit | Cliff faces (X and Y), butte tops, talus, boulders, tamarisk, river-bank rocks |
| Flora | Fan palm, date palm, Joshua tree, creosote, cholla, saguaro (decor), agave, oleander |
| Houses | 6 stucco ranch models (tile or flat roof), 2 two-storey models, trailers, carports, CMU block-wall runs, wrought-iron gates |
| Commercial | Neon motel, wedding chapel, pawn shop, strip mall, diner, gas station, liquor store, 1980s low-rise casino, 2 resort towers (Strip) |
| Infrastructure | Bridge deck, piers and railings; tunnel portals; desert signal poles; highway signs |

The art production is a **parallel track**. Placeholder art (recoloured existing sprites) keeps the code moving.

---

## 5. Phases

Every phase ends with something playable and a measurable gate.

| # | Phase | Contents | Gate |
| --- | --- | --- | --- |
| **0** | **Scale foundation** | First commit; asset prep runs on Windows; atlas and mip pipeline (0.6/0.3/0.15); WebGL2 instanced sprite layer; ground baking in a worker; 2048² map with 64-tile cells; incremental network rebuild; topology split for Node; zoom tiers including the Planner bake; save v3 (seed + roads + lot states, gzip); headless test harness; **benchmark scene** (synthetic 4 km city: 500k props, 10k moving sprites) | 60 fps panning the benchmark at every tier; budgets in §2.3 met |
| **1** | **Desert terrain** | Height field, rivers, washes, hill outlines; placeholder rock kit; collision mask; bridges and tunnels in the road tool; highway entry at the map edge | 20 seeds pass the generator guarantees; a road can cross a river and a hill |
| **2** | **Traffic core** | Lane graph, IDM/MOBIL, junction control, zone next-hop routing, sim worker, 4-facing car sprites, lights and brake lights, test traffic | 10k cars for 10 in-game days on a seeded network: no deadlock, budgets met, every junction type behaves visibly |
| **3** | **Lot Composer + growth** | The town extends itself with gravel roads (new gravel class; growth along them; paving and rerouting are the player's job, section 1.5); game-allocated land use (residential, commercial, industrial, tourism, government) and growth options; parcels, archetypes for every lot type (houses with backyards, commercial with parking and back alleys), skeleton, household stories, constraints; trips and parking (the parked cars are the sim cars); access-driven growth and decline | From one highway exit, a city of 5k grows by itself; 100-lot contact sheets pass review; a jam stops growth locally |
| **4** | **Budget + bottleneck loop** | Taxes, costs, compensation, loans, milestones (as a mechanism); bottleneck ranking; before/after; access overlays; time controls | The books close every game day and bankruptcy is reachable; fixing the top bottleneck measurably improves the next rush hour (headless: a scripted player fixes the top item, the before/after shows less time lost per trip). The Career win/lose gate moves to Phase 5 (changed 2026-10-18) |
| **5** | **Towns + tourism booms** (new, 2026-10-18) | Several seeded towns, each a Phase 3 town, joined by poor links; attraction placement (water park, then casino boulevard) as Lot Composer sites with car parks; seasonal boom events (waves of tourist trips from the towns and the highway entries to the car park, with deadlines); the boom report (sent, arrived, late, lost, revenue and revenue lost, the bottlenecks during the boom, boom against boom); reputation and tourism-driven growth; the tourism Career (milestones unlock classes, attractions and new towns) | Two booms at one attraction: after a scripted player fixes the top bottleneck of the first, the second delivers a measurably larger share in time; a tourism Career is winnable and losable |
| **6** | **Road builder pro** | Cities: Skylines-style tools and UX (section 3.2): curved/freeform draw, snapping and guides, elevation keys, junction editor; upgrade in place, roadworks, turn lanes, signal editor and green waves, one-way, curves, roundabout sizes, car parks, bus lines; then **freeways, ramps, interchanges, overpasses** (elevated layer) | Each tool has a screenshot test and a sim capacity test |
| **7** | **Look + eras** | Attraction art (water park, the casino boulevard with neon night lighting); attraction events (conventions, New Year's Eve); 16-heading cars; the era system (90s and onward as art arrives); the desert re-skin only if still wanted (section 7, item 4) | The casino boulevard at night at 30% holds up next to the Maple Falls standard |

The art track runs alongside from Phase 1: terrain kit, then houses, then commercial, then the attractions (water park, casino boulevard and neon).

---

## 6. Risks and how we handle them
- **Draw cost at 500k props.** Handled by baking everything flat, culling by cell, deriving layouts on demand,
  and the Planner bake. Phase 0 proves it with the benchmark before any content work.
- **Sim cost at 10k cars.** Handled by the worker, typed arrays and zone routing. If this is still too slow:
  run off-screen links as mesoscopic queues (cars only become individual agents when visible).
- **Overpasses in a single ground layer.** These are kept to Phase 5 and share the elevated-layer system with
  high bridges. River bridges in Phase 1 are flat decks over a sunken river, which needs no elevation.
- **Facing limits.** Buildings only face +X or +Y, so rear views are needed. 45° roads get stepped setbacks.
  Cars need 16 headings for curves (the three.js render).
- **Art consistency across sources** (TrickOrTreat, RUN generations, 3D renders). One camera spec, one scale
  table, and the 30% review sheet as the gate.
- **The balance of growth, traffic and money.** The headless sim (Phase 0) lets balance be tested with numbers.

## 7. Still open (they can wait until the phase that needs them)
0. **Growth options** (section 1.5): the exact set, how strongly each shifts allocation, and whether they unlock
   with population (Phase 3).
1. Era pacing: how many real minutes per in-game year, and whether eras unlock by time or by population (Phase 6).
2. Hosting: the single-file browser build or RUN. This decides whether SharedArrayBuffer is available (Phase 2).
3. Is the Strip one special boulevard the map seeds, or any boulevard that grows into it (Phase 3)?
4. **The desert re-skin (deferred, 2026-10-17; less important since 2026-10-18).** The game runs in a maple-wooded
   valley. With the casino boulevard now an attraction inside the valley (section 1.0.2), the Vegas features no longer
   need a desert map. Still to decide whether a desert valley comes later as a second map.
5. **The theme (deferred to the end, 2026-10-18):** see section 0. The towns-and-tourism mechanic of section 1.0 is now
   the gameplay; the theme will be written to fit it.
6. **Time model for booms (Phase 5).** Cars drive at real speed, and one sim second is one game minute, so a 3 km
   trip between two towns lasts about 5 game hours. Options: (a) keep the clock and make a boom a long window (a game
   day or more); (b) decouple the calendar from the sim: a boom is an event of fixed sim length (say 20 sim minutes),
   seasons are a sequence of booms, and the HUD shows "Summer, weekend 3" and a boom countdown instead of the time of
   day; (c) slow the clock (one sim second = 10 game seconds) so trips last minutes of game time. Recommended: (b).
7. **Towns (Phase 5).** How many at the start (recommended 2–3), whether they start small and grow or start grown,
   when new towns appear (Career milestones), and how far apart: the 4 km map holds 3–4 towns of 300–600 m with 1–3 km
   between them; more, or longer links, would need a bigger map (the Phase 0 budgets would need re-checking).
8. **Attraction placement (Phase 5).** Free placement on suitable land, or sites the map offers; footprints (a water
   park about 100 × 100 m; a casino boulevard about 600 m of boulevard with casino lots along it); can one town hold
   several attractions.
9. **Boom size (Phase 5).** The sim's budget is 10k cars, so a boom peaks at a few thousand cars; each car stands for
   a party of tourists. Whether the towns' everyday commuting stays at full strength during a boom, or shrinks to a
   background load to leave the sim budget for the boom.
10. **Logistics (after Phase 5).** Other industries between the towns (freight, a factory and its suppliers, a port)
   use the same machinery as the booms: flows between towns, scored on what arrives.
