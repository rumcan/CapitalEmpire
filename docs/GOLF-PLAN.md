# The golf events pivot (v6, 2026-10-21)

The owner's direction, 2026-10-21: **Capital Empire becomes a golf events manager.** It keeps the same gameplay loop and
everything already built, with a much stronger focus on golf:
- The game starts with **a single town and an old 9-hole golf course**. The player manages **the town's roads, the golf
  course, and the traffic to the golf event each year**.
- The event starts as **a small golf tournament** and grows into **a massive major** with thousands of people coming to the
  town.
- **The Paint tool is adapted to build and expand the course.** Course sprites will be made, but nothing is placed as a whole
  green or fairway: the playing surfaces are painted. (The owner wrote "the current golf course sprites will now work"; this
  plan reads it as "will not work" for the whole-hole sprites, given the next sentence. The object sprites such as the
  clubhouse and carts still work: section 10.)
- **The businesses become tents for the event**: food, drinks, merchandise and other things that make money.
- **A year passes between tournaments**: the player upgrades the roads and the course before the event starts each year.

This document is the design. [GAME-PLAN.md](GAME-PLAN.md) section 1.0 points here; [GOLF-SPRITES.md](GOLF-SPRITES.md) lists the
art; [PROGRESS.md](PROGRESS.md) tracks the work. The numbers below are first estimates for balancing in phase G5. The open
questions for the owner (section 13) each come with a recommendation.

---

## 1. The game in one paragraph

You run the Maple Falls Open. In year one it is the club championship on a tired 9-hole course beside a sleepy town, and a few
hundred locals drive in on gravel roads. Each year you get **twelve months** to rebuild holes, extend to 18, lay roads and car
parks, and plan the next tournament's tents and stands. Then **tournament week** starts and you watch it live: the crowd drives
in from the town and the highway, parks, rides your shuttles, and pours through the gates. You fix bottlenecks while it happens
and sell them food, beer and caps while they watch. Then everyone leaves at once. After the event you take the results: money,
reputation, the tour's verdict on next year's tier, and a card from the draft. Ten years later the same town hosts a major with
fifty thousand people a day, arriving by interchange, park and ride, and coach.

## 2. The year loop (it replaces the v4 event round; same shape)

| v4/v5 (the stadium) | v6 (golf) |
| --- | --- |
| Free stage, then a 10-minute build | **The off-season: 12 months** to build roads, rebuild the course, place tents and stands |
| The surge to kick-off | **Tournament days**: the arrival wave, play, the exit wave |
| The evaluation and the payout | **The results**: income by line, reputation, the tour's verdict (tier up, stay, or down) |
| Draft a card (1 of 3) | Draft a card (1 of 3): road, transport, venue and course cards |
| At 100%: towns grow, the stadium levels up, a new event elsewhere | Success grows **reputation, the town, and next year's crowd**; tier requirements unlock the next tier |
| One finished round = one year | **One tournament = one year** (the calendar from 1985 stays, and so do the signal tiers) |

### 2.1 The off-season (the year)
- **Length:** 12 months. **Recommended time model (open question 1):** the existing day clock carries the year: **one game
  day is one year**, two game hours a month (24 real minutes at 1x, about 1.2 minutes at 20x). It needs no new time base: the
  town's everyday traffic, the lights and the speed controls all work as they do now. A **"Skip to tournament week"** button runs
  the remaining months at top speed. The tournament's date is fixed, so the player cannot delay it.
- **What the player does:** roads (all of today's tools, instant as always), the course (Paint's course mode and the hole tools,
  section 4), car parks, shuttle routes, the event structures (tents, stands, gates: section 6), and the event traffic plan
  (section 9).
- **Money in the off-season:** **green fees** from daily golfers (the course is a public course: today's visit-business engine,
  section 4.6), **memberships** per month, the town's connection fees (B.7), and the year's sponsor contracts. **Costs:** course
  maintenance per month, road and structure upkeep, loan interest.
- **The sim shows a sample; the books count the month.** Golfers and town traffic are drawn at a normal day's rate. The books
  scale income and costs to the month (the standard compression, as in Cities: Skylines), so a compressed month never floods
  the roads.
- **Grow-in time:** newly **seeded** turf needs months to grow in (greens about 6, tees and fairways 3, rough 2). **Sod** is
  ready at once but costs 3 to 5 times as much. That is the purpose of the "New sod" texture, and the off-season clock
  matters because of it. An area not grown in by tournament week plays and looks worse (a course quality penalty, section 4.3).

### 2.2 Tournament week
- **Days by tier** (section 5.1): 1 day at tier 1, up to 4 tournament days plus practice days at tier 5.
- **A tournament day** runs on the game clock: gates open **07:00**, the first tee time is 07:30, the last groups (the leaders)
  tee off about 13:30, and play ends about 18:30. The **arrival wave** builds from 07:00 to about 13:00 and peaks at 09:00–11:00.
  The **exit wave** follows the final groups: most of the crowd leaves 17:00–19:30. At one game minute per sim second this is
  about 12 real minutes per day at 1x, close to today's 600 s surge.
- **Which days are played live (open question 2):** recommended: tiers 1–2 live; from tier 3, **the busiest day (Saturday or
  Sunday) is live** and the other days are resolved from the network's measured performance (arrival and exit rates per
  source), with an option to play every day live.
- **Live edits** are paid from the takings, as today (add a lane, widen a turn, a bypass, more buses). The event traffic plan can
  change between days.

### 2.3 The results
- Income by line (tickets, tents, merchandise, hospitality, parking, shuttles, sponsors, TV), costs (purse and sanctioning fee,
  structure rental, staff, upkeep), and the net.
- **Arrival on time** (spectators through the gates before their planned time plus a grace period), **missed** (gave up in
  traffic, or turned away when the car parks were full), **exit time** (95th percentile from the gates to off the network),
  queues (gates, tents, toilets, bus stops), and **satisfaction**, giving **reputation** (section 8.1).
- **The tour's verdict:** next year's tier offer (up when the next tier's requirements and the reputation threshold are met; the
  player may stay), or a warning and then a **demotion** after two poor years. Bankruptcy is still the hard loss.
- Flavour: the champion's name and score (the names module can make golfers' names), the attendance record, the
  winning moment on the 18th.

### 2.4 The draft
Pick 1 of 3 cards at each results screen, as today. The pool is in section 8.3.

---

## 3. The start: one road and the driving range (plan P22)

The owner (2026-10-24): "The game starts with nothing but a road passing a driving range. The town grows from your driving range outward.
No more prepainted streets for the town." The full design is [plans/P22.md](plans/P22.md); the code is `golf/rangestart.ts` (the plan),
`golf/range.ts` (the range) and `Engine.newRangeGame`.

- **The county road** (class `road`, a free town road) crosses the map edge to edge through the range's junction J. It is straight for
  at least 600 tiles each side of J, so the town's 40-tile lattice meets it square, and each half may take one 45° bend. It crosses water
  by at most 2 bridges. Its two map exits are saved (`golf.exits`); the exit nearer the town is the city's entry. Open edges win:
  a road ends on a mountain edge only when the map leaves no open one on that axis (half the maps have three mountain edges).
- **The driving range** is the player's first business: a 70 × 150 tile plot (140 × 300 m) in the road corner of the owned parcel,
  with golfers hitting away from the road. Its 24-tile front (the `range` visit business) holds the hut, the covered mats and a 20 × 16
  car park beside a short gravel drive from J. Until a clubhouse exists, the range front is the venue.
- **The owned parcel** is 300 × 450 tiles (about 54 ha) on the range's side of the road, 6 tiles off the road: room for a first nine,
  not for 18 (land is bought as before, section 4.4). The course grid covers it, and its brushes keep off the range plot.
- **The town has a seed, not streets:** one town centre 40 tiles across the road from J. The town planner lays every street itself,
  the first within the first game hour, and the town's roads keep off the golf land. There are no lots, no stamp, no old nine and no
  clubhouse at minute zero. Farms line the county road away from the town and the course.
- **The camera** starts on the range's hut at the street zoom (17%), with the Course tool open.
- **Start money:** $600,000 (today's $800,000 less the $200,000 stadium, which golf mode does not have). The first nine is the
  player's to build.
- **Founding seasons:** no tournament until the tour invites the player (`golf/tour.ts` invitationNeeds, tournamentDue). The invitation
  comes the moment the course has 9 holes, a car park (the range's counts) and a clubhouse: a toast, and the HUD chip "The Club
  Championship: end of this season" (or next). The tournament closes that season if the invitation came at least 3 months before its
  end, else the next one. A season that ends uninvited shows the season card (the takings, the residents, the checklist "6 of 9 holes ·
  car park ✓ · clubhouse ✗", Continue), the clock never stops, the calendar counts it (`golf.founding`), and Skip reads "Skip to season
  end". In range starts the driving range meets tier 3's `range` need.
- **The clubhouse is the player's to place** (Course > Buildings, $45,000, one only, 40 × 24 tiles; `golf/range.ts` clubhouseSpotOk):
  on the player's land, off the range plot and the course, beside a drive or road (its front snaps to a course drive within 6 tiles,
  P19). It becomes the venue (the crowd's doors and the tournament's site) and its green fees start. An old save's game-placed clubhouse
  stays, and a second one is refused.
- **Still to come** (P22's tickets): the grown-town growth rules (T090, T091), the exits feeding the range (T092), through traffic
  (T093), the off-map tournament crowd (T094), the first-minute guide (T095) and the range's look (T096).
- **Old saves keep their towns.** A save without `golf.start` is the old start: one seeded town (one asphalt main avenue with gravel
  branches, about 1,000 residents), the old nine placed and painted by the game 150-350 tiles from the town centre, and its clubhouse.
  It loads and grows by today's rules. The old start stays behind `?start=town` for comparisons and tests; `?start=valley` gives the
  classic three-town valley. Legacy (classic) saves load as they are.

---

## 4. The course

### 4.1 Surfaces (painted)
Each surface is a Paint texture (a photo texture laid in ground space, section 4.5) with a play role, a cost and a grow-in time.
Costs are 1985 dollars per m², first estimates for G5 tuning.

| Surface | Role | Seed $/m² | Sod $/m² | Grow-in (seed) | Upkeep $/m²/year |
| --- | --- | --- | --- | --- | --- |
| Putting green | the green: the hole's end (needs a pin) | 6 | 25 | 6 months | 3.0 |
| Fringe / collar | border band around a green (Paint border) | 4 | 15 | 4 months | 1.5 |
| Tee | the hole's start (needs tee markers) | 3 | 12 | 3 months | 1.2 |
| Fairway (+ worn, + new sod look) | the landing areas | 2 | 8 | 3 months | 0.6 |
| First cut | border band along fairways | 1.5 | 6 | 2 months | 0.4 |
| Rough | everything between the holes | 0.8 | 4 | 2 months | 0.15 |
| Deep fescue | native areas, rough edges, links look | 0.5 | - | 3 months | 0.05 |
| Bunker sand (+ waste sand) | hazards; raked look | 4 | - | none | 0.5 |
| Pond water (+ bank border) | water hazards (painted; decoration for the sim) | 10 | - | none | 0.2 |
| Cart path (concrete, asphalt, gravel) | carts and maintenance; spectators walk on them | 6–15 | - | none | 0.1 |
| Pine straw, bark mulch, flower beds | landscaping under trees and by tees | 2 | - | none | 0.3 |
| Spectator walkway, wood chips, event matting | crowd routes on tournament days | 1–4 | - | none | 0.1 |
| Field parking (grass with tyre ruts) | grass car parks on farmland | 0.3 | - | none | 0.05 |

The photo textures for these are being generated through the RUN CLI (section 10.4 and GOLF-SPRITES.md section 6). The
owner's three photos (fairway, new sod, rough) are already in the game at full resolution.

### 4.2 Holes
- A hole has **tee markers** (placed objects: back, middle and forward tees; the back tee sets the championship length), a
  **pin** (a flagstick placed on a painted green) and **a number** (auto in routing order, editable). Everything else about it is
  derived.
- **Derived:** the playing line (tee → optional aim points for doglegs → pin), the length in metres and yards, **par from
  length** (men's, USGA: par 3 under about 238 m, par 4 about 219–448 m, par 5 about 411–649 m; the game uses par 3 ≤ 230 m,
  par 4 ≤ 430 m, par 5 above), the corridor (a band about 60 m wide along the line), its hazards (bunkers and water near the
  landing zones), and its spectator space (open land beside the corridor).
- **Valid when:** the pin stands on green; the tee stands on tee surface; the line is mostly over fairway or rough; no road
  crosses the corridor (a **cart crossing** or a **footbridge** is needed where a cart path or crowd route meets a road); no
  building or tent stands in the corridor; corridors do not overlap (about 60 m between hole centre lines, from the 65-yard
  corridor guideline); the next tee is within a walk of the previous green (warn over 150 m).
- **Course stats panel:** holes, par, length (championship and member tees), rating (difficulty), quality, grow-in state, the
  monthly upkeep, and each tier's requirements as a checklist.
- **Trees frame the holes (T229 #668, the concept look's step 6):** New hole's **Frame with trees** (on by default, a toggle in its Trees
  section) and the hole card's Trees row plant clumps of 3 to 9 conifers and autumn broadleaves just past the edge of the hole's corridor
  (`golf/holeframe.ts`; the engine's T229 block). Never within 28 m of a line of play, a tee or a pin, on a playing surface, a path, a road or
  water; 10 m clear of the cart lanes (green to the next tee, the clubhouse to the first tee and the last green home: T213's carts drive them
  where there is no path); 12 m further back beside a landing zone (a plan's widest width handle, else the drive's spot). Deterministic from
  the hole's seed. $100 a tree (`FRAME_TREE_PRICE`), shown on the Build button and the card before you press; a frame tree is the Props
  catalogue's hidden "Course tree" (a plant's appeal near the range, half back when bulldozed) and remembers its hole, so framing again only
  fills the gaps and takes away frame trees an edit left in play.

### 4.3 Course quality and rating
- **Quality** (0–100): conditioning (grown-in share weighted by surface; maintenance spending), design (par mix close to
  4/10/4 for 18 holes, variety of lengths, hazards near landing zones), length against the tier's minimum, beauty (trees,
  water, landscaping, no bare patches), and **spectator space** (room for ropes, stands and tents beside the featured holes:
  the 18th, the par 3s, the closing stretch).
- **Rating** (difficulty, for flavour and the pros' scores): length, hazards, fairway widths, green sizes.
- Quality feeds the players' satisfaction, the tour's requirements and the TV tier.

### 4.4 Expansion
- From 9 to 18 holes (tier 3 needs 18), then **championship tees** for length (tier 4–5 minimums), a **practice range**, a
  putting green and a short-game area (the players' needs from tier 3), and a second nine on new land, which pushes the town's
  roads and parking outward.
- **Land (the owner, 2026-10-21; for realism, not a hard mechanic):** the course starts on **its own parcel outside the town,
  surrounded by farms**. The player can only paint and build the course on land the course owns. It grows by **buying adjacent
  land in square blocks**: farm blocks from the farmers (`ext/farms` fields) or blocks from the town. A block with houses on it is
  bought out naturally: the houses go and the price is the same as for empty land, so buying never turns into a demolition puzzle.
  The owned land shows as a soft boundary line (and a fence at the edge, later). Buying is a small panel action ("Buy this block,
  $X"); prices rise a little as the town grows. Section 3 places the old nine's parcel so it has farmland on at least two sides.

### 4.5 The Paint tool as the course builder (details in [PAINT-TOOL.md](PAINT-TOOL.md))
- A **Course** mode beside today's Draw / Pick / Erase: golf surfaces as the texture chips, **borders as collars** (a green
  with a fringe border, a fairway with a first-cut border, a pond with a bank border, a bunker with a grass lip: today's border
  band), **smooth corners** (the corner radius slider parked on `claude/paint-wip`), and a smoothed freehand lasso.
- **Shape editing (the owner, 2026-10-21):** a closed shape is **selected at once** and shows **transform handles**: drag any
  corner to move it, drag an edge's midpoint to insert a corner, delete a corner (right-click or Delete), and move, rotate or
  scale the whole shape with its box handles. The ground re-bakes live while dragging. The same handles appear when Pick
  selects an existing area, so any fairway, green or bunker can be reshaped later.
- **Tone filters (the owner, 2026-10-21):** each area can darken or lighten its texture: **Multiply** (darker) or **Lighten**
  (screen: lighter), a strength slider (0–100%) and an optional tint colour, applied in the area's bake (the existing asphalt
  tones already work this way in `drawPaints`). Uses: a darker first cut, sun-bleached rough, shade under trees, a fresh green
  next to a tired one.
- **Hole tools:** place tee markers, place a pin, renumber, and add aim points for doglegs.
- **Costs and grow-in:** painting costs money by surface and m² (seed or sod chosen in the panel); a seeded area shows a
  **grow-in look** (bare soil with young grass) until it is ready.
- **Photo textures** (section 10.4) are laid in ground space at full resolution, with the mip chosen by zoom times the area's
  scale (done 2026-10-21). They are built **lazily**: only the textures a painted area uses are built in the ground workers,
  which keeps memory down.

### 4.6 Daily golfers (the off-season)
The course is open to the public: today's **visit business** engine (`business/visits.ts`, the old Golf course type: $22 green
fee, foursomes, 07:00–19:00) sends golfers' cars from the town and, from tier 2, from the highway to the clubhouse car park.
They are drawn as foursomes walking or riding carts along the holes (golfer movers, phase G7). Course quality and the
roads' trip times set the demand. The course closes to the public during tournament week.

---

## 5. The tournament

### 5.1 Tiers
The names are fictional on purpose (no real tour or championship names).

| Tier | Event | Days (practice + tournament) | Spectators a day (peak) | Course | Must have | Ticket (1985 $) |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Maple Falls Club Championship | 0 + 1 | 300–600 | the old 9 | a car park | free |
| 2 | County Amateur | 0 + 2 | 1,500–2,500 | 9 (played twice) or 18 | entrance gate, food tent, toilets | $5 |
| 3 | State Open | 1 + 3 | 4,000–8,000 | 18, ≥ 5,800 m | grandstand at the 18th, leaderboard, merchandise tent, a park-and-ride shuttle, practice range | $10 |
| 4 | Maple Falls Classic (tour event) | 2 + 4 | 12,000–25,000 | 18, ≥ 6,400 m | TV towers and broadcast compound, hospitality chalets, media centre, 2 park-and-ride lots, hotel rooms in town | $20 |
| 5 | The Maple Falls Open (a major) | 3 + 4 | 30,000–50,000 | 18, ≥ 6,700 m | the grandstands, merchandise pavilion, hospitality village, highway interchange access, a coach terminal | $35 |

For scale: the Phoenix Open has had single days above 200,000 and weeks above 700,000 (an outlier); the St Andrews 150th
Open built 15,000 grandstand seats. Tier 5's 50,000 a day is a big major, and the ceiling the sim budget allows (section 5.6).

### 5.2 Who comes, and how
- **Sources:** the town's residents (a share by tier and reputation), **regional day visitors** through the highway entries
  (most of the crowd from tier 2), **hotel guests** (the town's hotels and motels, from tier 3: morning trips from the hotels),
  **staff and volunteers** (an early wave before the gates open, to staff car parks: tier 3+), **VIPs and hospitality guests**
  (their own car park or drop-off, tier 4+), and **players, officials and media** (their own lot and a closed route, tier 4+).
- **Modes:**
  - **Drive to an on-site car park** (today's car parks, bay rows and on-street parking).
  - **Park and ride:** a remote car park near the highway or the town edge, then today's shuttle bus to a stop at the gates.
    This is how real big events run: only players park on site, the road at the main gate closes, and shuttles start before the
    gates open (PGA Championship transport plans; section 14).
  - **Walk up** from town homes and hotels within about 1 km (the walkers).
  - **Ride-share or taxi drop-off** (today's taxi company becomes the operator; a drop-off zone by the gates).
  - **Coaches** (charter buses from off the map, tier 4+, to a coach terminal).
  - Later: a **shuttle train** from a park-and-ride station (the merged subway module, `ext/subway`).
- **The crowd's plan:** each spectator party picks a mode and a car park by trip time and price, as today's surge picks car
  parks (`event/surge.ts`), with the price of parking and the queues known from last year.

### 5.3 The gates and the venue
- **Entrance gates** (a placed structure) have **lanes**. Each lane admits a spectator every few seconds (scan and bag check:
  about 600 an hour a lane); the "Express gates" card speeds it up. A queue at the gates is visible and counts against
  satisfaction.
- **Inside**, the spectators are counts per **zone**: grandstands (seats), rope lines along the featured holes (capacity from
  the rope length), the tent villages, and the practice range stand. Walkers show them at street zoom; denser areas become crowd
  decals at district zoom.
- **Needs inside:** toilets (about 1 per 100–150 spectators, a common event guideline), water, first aid, shade, food. Missing
  needs lower satisfaction. Tents earn from the spectators in their catchment (section 6.2).
- **The exit:** spectators leave gradually through the day and mostly after the final groups. The exit wave reverses every
  mode: gates → stops → shuttles → lots → cars → home or the highway. **Exit time is the second traffic test** of each day.

### 5.4 Scoring a day
- **On time:** through the gates before the party's planned arrival plus 45 minutes (the gates' queue counts as late).
- **Missed:** gave up after 90 minutes in traffic, or turned away from full car parks with no alternative. Missed spectators
  get refunds and hurt reputation.
- **Exit time:** the 95th-percentile time from leaving the gates to leaving the network (home, a hotel, or a highway entry).
- **Satisfaction** of the day = arrival (40%), exit (20%), queues (gates, tents, toilets, stops: 20%), viewing (seats and rope
  space at the featured holes: 20%).

### 5.5 Tournament day timeline (game clock)
| Time | What happens |
| --- | --- |
| 05:30–06:30 | Staff and volunteers arrive (tier 3+) |
| 06:30 | Shuttles start (30 minutes before the gates) |
| 07:00 | Gates open; the arrival wave builds |
| 07:30–13:30 | Tee times; the arrival peak 09:00–11:00 |
| 13:30–18:30 | The leaders' groups; the crowd follows them; tent sales peak at lunch |
| 17:00–19:30 | The exit wave (most of the crowd); shuttles run until 30 minutes after the gates close |

### 5.6 Sim scale
- **The car budget is 10k simulated cars** (GAME-PLAN 2.3), with the town's own traffic underneath. A party car carries about
  2.5 spectators on average.
- **Tier 5 at 45,000 spectators a day:** if 60% use park and ride (about 450 bus trips of 60 seats), 30% drive to on-site lots
  (about 5,400 cars) and 10% walk or take ride-share, the cars on the network at once stay under the budget because arrivals
  spread over six hours. **The top tiers push the player toward park and ride**, which is also what real majors do.
- Spectators inside the venue are counts plus a capped set of walkers (about 5,000 drawn at street zoom), with crowd density
  decals beyond that. This keeps within the 60k visible-instance budget.

---

## 6. Tents and event structures (the businesses become tents)

### 6.1 The catalogue (the Event tool, which replaces the Business tool, key M)
Footprints are in tiles (2 m). Rent is per tournament (temporary; removed after); **Buy** makes it permanent (no rent, but upkeep
every month). Numbers are first estimates.

| Structure | Footprint | Rent / buy | Capacity | Earns or does | Tier |
| --- | --- | --- | --- | --- | --- |
| Food tent (burgers, BBQ, pizza) | 4 x 4 | $2k / $15k | 300 meals an hour | food spend | 1 |
| Drinks tent / beer garden | 5 x 4 | $2k / $15k | 400 drinks an hour | drink spend (peaks in the afternoon) | 2 |
| Concession kiosk | 2 x 2 | $500 / $4k | 120 an hour | snacks and water near the holes | 1 |
| Food truck | 3 x 2 (a vehicle) | $800 / - | 150 an hour | food spend; arrives by road | 2 |
| Merchandise tent → pavilion | 6 x 5 → 15 x 10 | $4k / $40k → $20k / $250k | 200 → 1,200 shoppers an hour | merchandise (the biggest stream at the top: about 45% of the Masters' revenue) | 3 / 5 |
| Hospitality chalet | 5 x 5 | $6k / $50k | 60 guests | sold to sponsors in advance; needs VIP parking | 4 |
| Corporate hospitality village | 20 x 12 | $40k / - | 500 guests | the big sponsor packages | 5 |
| Grandstand S / M / L | 8 x 4 / 20 x 6 / 40 x 10 (L horseshoe) | $3k / $12k / $40k | 200 / 1,000 / 4,000 seats | viewing satisfaction; seat tickets (tier 4+) | 2 / 3 / 4 |
| Main leaderboard | 4 x 2 | $3k / $25k | - | viewing satisfaction around it | 3 |
| Hole scoreboard | 1 x 1 | $300 / $2k | - | small viewing bonus at a hole | 3 |
| Video screen | 3 x 1 | $8k / - | - | big viewing bonus | 5 |
| TV camera tower | 1 x 1 | $1.5k / $10k | - | TV coverage of the holes it sees | 4 |
| Broadcast compound (trucks) | 15 x 10 | $10k / - | - | needed for TV income | 4 |
| Media centre | 12 x 8 | $8k / $80k | - | the media's satisfaction | 4 |
| Entrance gate | 6 x 3 + queue lanes | $2k / $20k | 4 lanes (600 an hour each) | admission; ticket income counted here | 2 |
| Toilet block | 4 x 1 | $400 / $6k | 12 cubicles | spectator need | 2 |
| First aid tent | 3 x 3 | $500 / - | - | spectator need | 3 |
| Info / will-call booth | 2 x 2 | $300 / $3k | - | small satisfaction bonus by the gates | 2 |
| Shuttle hub (stops by the gates) | road-side | today's bus route | - | today's shuttle stops | 3 |
| Ride-share drop-off zone | road-side | $2k / $10k | - | taxi and ride-share arrivals | 3 |
| Coach terminal | 20 x 10 | $10k / $120k | 20 coaches | coach arrivals (tier 5 needs one) | 4 |
| Practice range grandstand | 12 x 4 | $5k / $30k | 600 seats | viewing; the players' practice | 4 |
| Sponsor display (car on plinth, banners) | 3 x 3 | earns | - | sponsor bonus | 3 |
| Helipad | 10 x 10 | - / $60k | - | VIP satisfaction (tier 5 hospitality) | 5 |

### 6.2 Tent economics
- **Spend per spectator a day** (1985 $, by tier 1→5): food 4→9, drinks 3→8, merchandise 1→25 (merchandise grows fastest with
  the event's fame), snacks 1→3. A spectator spends only while inside: **late arrivals spend less**, so traffic decides the
  takings as it decides the visit businesses' takings today.
- **Catchment:** a spectator buys at the nearest tent of each kind within about 250 m of their zone; farther tents get a share
  falling with walking distance.
- **Capacity and queues:** demand over a tent's capacity becomes a queue. A queue longer than about 10 minutes loses sales and
  satisfaction. The panel shows each tent's sales, queue and lost sales.
- **Price card** (per kind): cheap, normal or premium. Premium earns more per sale with fewer sales and lower satisfaction.
- **Hospitality:** chalets are sold before the tournament by tier and reputation (fixed income), and need VIP parking and a
  drop-off.

### 6.3 Placement rules
- Structures go on open ground or painted walkway, never in a hole's corridor (grandstands and TV towers may border a corridor;
  in real golf they are temporary immovable obstructions, so play gets relief from them) and never on roads. Gates go where a
  path meets a road or a shuttle stop.
- Rented structures stand during tournament week (placed any time; drawn "packed" in the off-season, built in the last month).
  Bought ones stand all year.

### 6.4 What happens to today's businesses
| Today (Phase B) | Golf mode |
| --- | --- |
| Stadium (the event business) | **Removed** in golf mode: the course is the venue |
| Sports bar, diner | **The town's own**: the town builds them as it grows with the tournament (not player-owned) |
| Bus company | **Kept as the shuttle operator**: fares per rider; buys buses; runs park and ride |
| Taxi company | **Kept as the taxi and ride-share operator**: the drop-off zone at the gates |
| Golf course | **Becomes the venue itself** (green fees in the off-season, section 4.6) |
| Golf estate | **Later**: lots for sale beside the course (phase G9) |
| Hotel, motel | **Town growth**: hotels and motels grow in the town with the tournament's fame (rooms are a tier 4 need) |
| Fishing resort, tackle shop, casino | **Dropped** from golf mode (kept in the code; legacy saves) |

---

## 7. Money

- **Income:** tickets, food, drinks, merchandise, hospitality, sponsors, TV (tier 4+), parking fees, shuttle fares, taxi fares,
  green fees and memberships (off-season), the town's connection fees.
- **Costs:** the **purse and sanctioning fee** (tier 1 about $2k → tier 5 about $1M), structure rent, staff and volunteers
  (per spectator), course maintenance (per m² per month, section 4.1), course work (painting), roads (build and upkeep: only the
  player's roads, B.7), buses, loans.
- **Sponsors:** a title sponsor per year by tier and reputation (tier 3 about $50k → tier 5 about $1M), with a **performance
  bonus** for arrival on time (today's payout curve becomes the sponsor's bonus: the arrival rate still pays directly).
- **TV:** from tier 4, by the coverage of the featured holes (towers that see them) and a broadcast compound (about $300k at
  tier 4, $1.5M at tier 5).
- **The books** close every month (off-season) and every tournament day; the year's report is the results screen.
- **Start:** $600,000. **Lose:** bankruptcy (Phase 4's rule).

## 8. Progression

### 8.1 Reputation (0–100)
From the spectators' satisfaction (section 5.4), the players' satisfaction (course quality, practice facilities, the players'
car park and route), and the media's (media centre, TV coverage). It sets **next year's crowd** (demand grows with reputation
and tier), the sponsors, and the tour's verdict. It moves 30% toward each year's score, as satisfaction does today.

### 8.2 The tour's requirements (the tier offer)
At the results screen the tour offers the next tier when **all** its "must have" items (section 5.1) and a reputation threshold
(about 55 / 65 / 75 / 85 for tiers 2 / 3 / 4 / 5) are met. The course stats panel shows the next tier's checklist all year, like
today's locked business cards showing their unlock and progress. Two poor years in a row (reputation below the tier's threshold
minus 15) demote one tier.

### 8.3 Cards (1 of 3 at each results screen)
| Group | Cards |
| --- | --- |
| Roads | Roundabout (unlock, as now), Slip lanes (unlock), Green wave, **Police traffic control** (unlock: officers hold junctions for the exit flow on tournament days), **Message signs** (drivers re-route earlier), **Contraflow** (unlock: a road runs one way out during the exit wave) |
| Transport | Double-decker shuttles (as now), +4 shuttles (as now), Express entry (car parks, as now), **Ride-share zone** (unlock), **Charter coaches** (more regional visitors come by coach) |
| Venue | **Express gates** (gate lanes +50%), **Mobile ordering** (tents serve 30% faster), **Merchandise exclusives** (merchandise spend +20%), **Volunteer corps** (staff cost −30%), **Weather radar** (shorter rain delays, with weather in G8) |
| Course | **Head superintendent** (grow-in 30% faster), **Irrigation upgrade** (maintenance −20%), **Sod farm deal** (sod −30%), **Championship tees** (unlock the back tees beyond the member length) |
| Money | Promotion (demand +20%, as now), **Season badges** (ticket +$3; today's Season tickets) |

### 8.4 The town grows with the tournament
The owner's 6R.7 rule ("a town grows by the player's success with traffic") becomes concrete: after each tournament the town
grows by the year's reputation and attendance. It gets more homes, **hotels and motels** (rooms are a tier 4 need), restaurants
and bars (the old sports bar and diner types, built by the town), and its industrial district grows. Its own traffic grows too,
so the off-season roads must keep up.

### 8.5 The calendar
One tournament is one year from 1985, as now (`round.ts` START_YEAR). The signal tiers (1985 fixed-time, 1990 actuated, 2000
adaptive) and the speed-limit tiers stay. Later eras bring tech cards (electronic tickets, mobile ordering in the 2010s).

---

## 9. Roads and traffic under the pivot

Unchanged: the road builder and every road tool, the catalogue, junctions and the junction editor, roundabouts, snapping, the
ladder, the traffic sim, routing, signals, bottleneck tools, car parks, bay rows, on-street parking, shuttles and walkers.

More important now:
- **Highways and interchanges** (6R.5, with the merged `ext/grade` and `ext/interchange`): the big crowds come from off the
  map. A tier 5 major needs an interchange near the course.
- **Park and ride** near the highway exits and the town edge, with shuttle routes to the gates.
- **Field parking:** grass car parks on farmland (`ext/farms` fields): cheap, slow to fill (one entrance, no lines), muddy in
  rain (G8).
- **The event traffic plan** (new, used only on tournament days): **road closures** (the road at the main gate for shuttles
  only; residents' access kept), **temporary one-way** and **contraflow** for the exit wave, **police control** at chosen
  junctions (they override the signals in favour of the busiest flow), and **message signs** that send drivers to the car parks
  with space. Real event plans do exactly this (the transport plans in section 14).
- **The toll gate (open question 3):** real events do not toll roads. Recommended: re-skin it as the **parking pay plaza**: the
  same booths, lanes and service time, at the entrance of a big car park, charging the parking fee on entry. The separate fee
  per parked car stays for car parks without a plaza.
- The towns' everyday traffic stays as the background load, and the daily golfers add to it.

---

## 10. Review of all development (what stays, what changes)

| System (where) | State today | Golf verdict | Changes required |
| --- | --- | --- | --- |
| Scale foundation: atlas, GL sprites, ground workers, zoom tiers (Phase 0) | Done | **Keep** | None; see the GPU memory row |
| Terrain and its painter (Phase 1, `terrain/`, `terrain-paint.ts`) | Done | **Keep** | The course site rules (flat open land); `ext/terrain2` (merged, not wired) for rolling hills: courses read better on gentle hills (6R.6) |
| Roads: network, catalogue, ladder, speed tiers, snapping (6R.1–6R.4) | Done | **Keep** | Cart crossings and footbridges where cart paths or crowd routes cross roads |
| Junction editor, roundabouts, signals (actuated) | Done | **Keep** | Police control (manual hold) for the event traffic plan (G6) |
| Highways, ramps, grade separation, interchanges (6R.5; `ext/grade`, `ext/interchange` merged, not wired) | Not wired | **Promote** (G6) | Wire as planned; several map-edge entries by tier |
| Traffic sim, routing, lane graph (Phase 2) | Done | **Keep** | Longer arrival waves and an **exit wave**; closures, one-way and contraflow on tournament days; message-sign re-routing |
| Bottleneck tools (Phase 4) | Done | **Keep** | Per-mode queues (gates, stops, car parks) in the live list |
| Budget and books (`budget.ts`) | Daily books | **Adapt** | Monthly books in the off-season and books per tournament day; new lines (section 7); maintenance by surface |
| Career and milestones (Phase 4, superseded) | Code kept | **Remove** in golf mode | Already off in event valleys |
| Lots, Lot Composer, fenced and block lots, town growth (Phase 3, `lots/`) | Done | **Keep** | One town seeded by 6R.7's rules; growth by tournament success; hotels and motels as town growth |
| The round (`event/round.ts`) | Done (stadium) | **Adapt** (G1) | Stages: off-season (12 months) → tournament days → results → draft; the calendar in months; skip to tournament week |
| Event config (`event/config.ts`) | Done | **Adapt** | Tier table, spectator demand, ticket prices, spend rates, purse; the stadium constants stay for legacy |
| Surge (`event/surge.ts`) | Done | **Adapt** (G3) | Arrival wave to gates (not kick-off); sources: town, highway entries, hotels, staff; modes; the exit wave |
| Crowd and walkers (`event/crowd.ts`) | Done | **Adapt** | Stops at the gates; spectators inside the venue by zone; the reverse flow at exit |
| Event site (`event/site.ts`) | Stadium site | **Adapt** | The course site (the old 9's generator); structure footprints (siteAt / siteWhy) |
| Toll gate (`event/toll.ts`) | Done | **Re-skin** | The parking pay plaza (open question 3) |
| Car parks, bay rows, on-street, fee, heat maps, gate art (`event/carpark.ts`, `rows.ts`, `curb.ts`) | Done | **Keep** | Lot tags (spectator, park and ride, staff, VIP, players); field parking |
| Shuttle buses (`event/bus.ts`, sim) | Done | **Keep** (core) | Stops at the gates; routes from park-and-ride lots; run before and after the gates |
| Event types (Phase 6 plan: concert, festival, water park, casino) | Planned only | **Drop** | Replaced by the tournament tiers |
| Several events on one map (Phase 6 step 2) | Planned only | **Drop** | A second venue is a later idea (G9) |
| Business model, catalogue, tree (`business/`, Phase B) | Done | **Replace** (G4) | The Event tool's structures and tents (section 6); keep `visits.ts` for daily golfers; transport operators stay |
| Business art (`business-library.ts`, `business/art.ts`) | Done | **Split** | Keep the object sprites (clubhouse, pro shop, cart garage, halfway pavilion, practice net, bench, patio table, mower, pins, carts, bag trolley, footbridge, buses, taxis); **drop the whole-hole sprites** (curved and dogleg fairways, flagged and unflagged kidney greens, organic and crescent bunkers, tee box, pond) |
| Paint tool (`paint.ts`, `paint-tool.ts`, `PaintPanel.tsx`) | Done; photo grasses done; corner radius parked | **Adapt** (G2) | The course builder (section 4.5); costs and grow-in; hole objects; generalised lazy photo textures |
| Photo textures (`grass-art.ts`, `textures.ts`, `renderer.ts`) | Three photos done (full resolution, scale-aware mips) | **Extend** | Every Paint texture as a photo (`PAINT_PHOTO`), built lazily per worker (memory) |
| Parking art and gates | Done | **Keep** | Park-and-ride signs |
| Townspeople (`ext/pedestrians`) | Done | **Adapt** | Spectators on walkways in the venue; golfers on the holes (movers) |
| Taxi (`ext/taxi`, wired B.5) | Done | **Keep** | The ride-share drop-off zone |
| Farms (`ext/farms`, wired) | Done | **Adapt** | Fields become field parking |
| Disasters (`ext/disasters`, wired, off) | Done | **Adapt** (G8) | Weather: rain delays (spectators leave early: an early exit wave), storms (evacuation), heat (water need) |
| Incidents (`ext/incidents`, wired) | Done | **Keep** | More likely on tournament days |
| Drivers (`ext/drivers`, wired) | Done | **Keep** | - |
| Names (`ext/names`, wired) | Done | **Extend** | Hole names, the champion's name, the tournament's name |
| Subway (`ext/subway`, merged, not wired) | Not wired | **Later** (G6/G9) | A shuttle train from a park-and-ride station at tier 5 |
| Paranormal nights (T014, uncommitted in the main checkout, branch `feature/paranormal-nights`) | In progress (another session) | **Park** (open question 8) | Off-theme for golf; keep the module off by default, or finish later as a Halloween special |
| Business economics (T010) | Open | **Rewrite** | As tent economics (an Arena candidate, section 12) |
| Roads and land (T013) | Open | **Keep** | Building over lots (the course expansion needs it) |
| Fuzz testing (T007) | Open | **Keep** | - |
| UI (Phase UI, `App.tsx`, `ui/`) | Steps 1–2 done | **Adapt** | Rail: Course (Paint) and Event groups; top bar: calendar (month, year), the countdown to tournament week, tier and reputation; the tournament card in place of the stadium card; new panels (course stats with the tier checklist, the Event tool, tournament results) |
| Saves (`save.ts`) | v3 + optional fields | **Extend** | Holes (tees, pins, numbers), grow-in state, structures, calendar, tier, reputation, sponsors, the traffic plan; legacy saves load as they are |
| Headless gates (`scripts/sim/*`) | event:gate fails (b, c, known); biz:gate passes | **Replace** | `tournament:gate` (G3), `year:gate` (a scripted multi-year campaign, G5); keep `sim:gate`, `town:gate`, `fix:gate` |
| Art pipeline and sprite studio | Done | **Extend** | Golf categories in the studio; the golf sprite batches (GOLF-SPRITES.md) |
| GPU memory (atlas 15 pages, about 336 MB at dpr 2 against a 96 MB budget) | Open (owner) | **Decide now** | The Halloween sets (monsters, pumpkins, arcade) are unused in golf mode: drop them from the atlas before the golf sprites go in; then compressed textures if still over |
| Performance budgets (GAME-PLAN 2.3) | Met | **Keep** | New checks: tier 5 day (sim), spectator walkers and structures (frame) |

### 10.1 Work in flight, parked for this planning step (resume order)
1. **Corner radius slider** (branch `claude/paint-wip`, commit `cda5446`; tests pass bar timing; needs typecheck, build and a
   browser check): resumes in G2 (smooth course shapes).
2. **Texture batch** (RUN CLI, 2026-10-21): 14 replacements for the Paint textures (everything except Pavers, Slabs, Rocky dirt,
   Rocky dirt alt and the owner's three photos) and 10 golf surfaces, into `output/grass-gen/` of the `photo-grass` worktree
   (git-ignored). The putting green test (1024 px; detailed at 1:1) is done. Next: pick the best take per texture, then
   generalise the photo pipeline (`PAINT_PHOTO`, lazy builds) in G2.
3. **Phase B.7** (merged): superseded by the tent economics; its road ownership and connection fees stay.
4. **6R.5–6R.8**: 6R.5 (highways) moves to G6, 6R.6 (terrain) to G1/G2 (the course site), 6R.7 (the town seed) to G1, and
   6R.8 (the road set check) stays as it was.

### 10.2 What the RUN generator can do (learned 2026-10-21)
- `gemini-3.1-flash-image-preview` (120 credits an image) returns **1024 x 1024**. The 2K/4K model (`gemini-3-pro-image-preview`)
  is **not available on the owner's plan**. So each ground texture is generated as a small patch (3–6 m) and hex-mixed over
  large areas: about 170–340 px per metre, far above the about 22 px/m the closest zoom needs at scale 1.
- The safety filter blocked a plain putting-green prompt that said "a photograph shot straight down"; "taken looking straight
  down" passed. Keep prompts free of words such as "shot".
- Every generation must be removed from RUN's library after download (TrickOrTreat AGENTS.md: the 1 GB cap):
  `scripts/assets/gen-grass-photos.mjs` does it.

---

## 11. Roadmap (phases G0–G9)

Each phase ends playable, verified in the browser, merged to main and live on the owner's 5174.

| # | Phase | Contents | Gate |
| --- | --- | --- | --- |
| **G0** | **The pivot plan** (this document) | The design, the review, the sprite list, every plan doc updated | The owner's review of the open questions |
| **G1** | **Golf mode foundation** | A new game = one town (6R.7 seed rules) + the old 9-hole course painted by the generator + clubhouse and car park; the calendar (12 months, one game day a year), skip to tournament week; the round becomes off-season → tournament day → results → draft; stadium and business tool off in golf mode; HUD: month, year, countdown, tier; legacy saves load | A new game shows the town and a valid 9-hole course; a year passes; the tier 1 tournament day starts on its date and runs with today's surge machinery |
| **G2** | **The course builder** | Land: the owned parcel and buying adjacent farm or town blocks (houses bought out at the land price); Paint's course mode (golf surfaces, collars, smooth corners from `claude/paint-wip`, lasso smoothing, shape editing: auto-select after drawing, corner and edge handles, move / rotate / scale; tone filters: multiply / lighten with strength and tint); photo textures for every surface (lazy); tee and pin tools, hole derivation, par and length, validity; the course stats panel; costs, seed or sod, grow-in, maintenance | The player builds holes 10–18 in the browser; headless tests for hole derivation and validity; the course stats match hand-computed values |
| **G3** | **Tournament days** | Spectator demand by tier and reputation; sources (town, highway, hotels) and modes (car, park and ride, walk, drop-off); the entrance gates and their queues; spectators inside by zone; the exit wave; on time, missed, exit time; tickets, parking, fares; the new results screen | `tournament:gate`: a scripted player runs a tier 1 and a tier 2 day; fixing the worst bottleneck raises the arrival rate measurably; the exit clears inside the target |
| **G4** | **Tents and structures** | The Event tool (rent or buy; placement rules); tent economics (spend, catchment, capacity, queues, price card); grandstands and viewing; toilets and needs; leaderboards; sponsors' displays | Tent takings and queues respond to capacity and placement (headless); a tier 3 venue in the browser |
| **G5** | **Progression and balance** | Reputation, the tour's requirements and verdicts, sponsors with performance bonuses, hospitality, TV (towers, compound, coverage), the new card pool, the town's growth by success, the money balance (section 7) | `year:gate`: a scripted 10-year campaign reaches tier 4 solvent; a careless one gets demoted |
| **G6** | **Regional access and crowd scale** | Highways and interchanges (6R.5 wiring), several map-edge entries, park and ride, field parking, coaches and the coach terminal, ride-share zone, the event traffic plan (closures, one-way, contraflow, police, message signs), multi-day tournaments with resolved days | A tier 5 day (45,000 spectators) inside the sim and frame budgets (worker bench) |
| **G7** | **Golf art** (parallel track from now) | The sprite batches in GOLF-SPRITES.md (P1 first), golfers and spectators as movers, the course and tournament look at 30% | The 18th green on a tournament Sunday at 30% holds up next to the Maple Falls standard |
| **G8** | **Weather, practice days, staff** | Rain delays and storms (from `ext/disasters`), heat; practice rounds; the staff and volunteer wave; players' transport (courtesy cars from the hotels) | A storm's early exit wave clears without gridlock (headless) |
| **G9** | **Eras and extras** | Eras (1985 → today, tech cards), the golf estate (lots by the course), a second venue (the desert course re-skin), team match play, women's and seniors' events, the shuttle train | - |

Order: G1 → G2 → G3 → G4 → G5 → G6; G7 runs alongside from now (the owner's sprite batches); G8 and G9 after G6. The
remaining road steps fold in: 6R.5 into G6, 6R.6 into G1/G2, 6R.7 into G1, and 6R.8 stays where it was.

## 12. Arena task candidates (pure modules for outside agents; specs written when their phase starts)
- **Course generator:** the old 9 (and an 18 for tests) as paint areas, tees and pins on a given site; deterministic per seed.
- **Hole derivation and validity:** from paint areas, tees, pins and aim points to holes, par, length, corridors, warnings.
- **Course quality and rating:** the section 4.3 formulas, with tests.
- **Tent economics:** spend, catchment, capacity and queue formulas (rewrites T010).
- **Venue flow:** gate queues, zones, the exit curve (counts only; no rendering).
- **Weather:** a seeded weather calendar and the rain delay or storm effects (extends T006).
- **The tour:** tiers, requirements, reputation, verdicts and sponsors (pure).

## 13. Open questions for the owner (each with a recommendation)
1. **The off-season's length and time model.** Recommended: one game day is one year (two game hours a month: 24 real minutes
   at 1x), with "Skip to tournament week". Alternative: 12 game days (one a month), which is long at 1x.
2. **Which tournament days are played live.** Recommended: tiers 1–2 every day; tier 3+ the busiest day live and the others
   resolved, with an option to play all.
3. **The toll gate.** Recommended: re-skin as the parking pay plaza (section 9).
4. **Shaping the land for golf** (mounds, bunker depth, raised greens). Recommended: painted and cosmetic only; the terrain stays
   fixed (the plan's rule since Phase 1).
5. **Daily golfers and green fees in the off-season.** Recommended: yes (section 4.6).
6. **Today's businesses.** Recommended: section 6.4 (the stadium goes from golf mode; the bar, diner, hotels and motels become
   town growth; the bus and taxi companies stay as operators; fishing and casino dropped; the estate later).
7. **Legacy saves** (three towns and a stadium). Recommended: they keep loading as they are until G3 ships, then a "classic"
   mode or nothing (the owner's call).
8. **Paranormal nights (T014).** Recommended: park it, off by default, as a possible Halloween special.
9. **Names.** Recommended: the event is "The Maple Falls Open" and the tier names in section 5.1 (fictional); the game's title
   stays open.
10. **Crowd sizes per tier** (section 5.1) and the sim scale (section 5.6). Recommended as written; G5 tunes.
11. **Tents: rent or buy.** Recommended: both (rent per tournament; buy for permanent, with upkeep).
12. **Painting costs money.** Recommended: yes, by surface and m², with seed or sod (section 4.1). Today painting is free.
13. **The course's minimum length per tier** (section 5.1). Recommended as written.
14. **The GPU memory decision** (section 10). Recommended: drop the unused Halloween sets from the atlas now.

## 14. Sources (research, 2026-10-21)
- Spectator transport plans (off-site lots, shuttles, closed roads at the gate, shuttles from 30 minutes before the gates):
  [PGA Championship 2017 transportation plan](https://www.pga.com/archive/2017-pga-championship-announces-transportation-plan),
  [Aronimink 2026 spectator guide](https://6abc.com/amp/post/pga-championship-how-get-aronimink-golf-club-what-spectators-need-know/19088507/),
  [LPGA traffic management plan, West Linn](https://westlinnoregon.gov/sites/default/files/fileattachments/communications/page/53944/lpga_traffic_management_plan.pdf),
  [Valhalla 2014 traffic and parking plan](https://www.wave3.com/story/26045794/traffic-and-parking-plan-for-pga-championship-at-valhalla-announced),
  [THE PLAYERS parking improvements](https://pontevedrarecorder.com/stories/players-makes-parking-improvements,39567).
- Revenue mix (merchandise about 45% of the Masters' revenue, tickets 26%, TV 17%, sponsors 7%, concessions 5%; corporate
  hospitality and merchandise lead at USGA championships):
  [Golf Digest](https://www.golfdigest.com/post/-69-to--80-million--),
  [USGA 2016 Oakland Hills budget summary](https://www.usga.org/content/dam/usga/pdf/host-sites/Budget%20Summary%20-%202016%20Oakland%20Hills%20CC%20Final.pdf),
  [Nasdaq: the money behind the Masters](https://www.nasdaq.com/articles/money-behind-masters-2018-04-05).
- Build-out (15,000 grandstand seats and 39 TV camera towers at the 150th Open; leaderboards, chalets, screens; temporary
  immovable obstructions): [GL events: the 150th Open](https://glevents.co.uk/experience/the-r-a-150th-open),
  [Gulf News: Jumeirah Golf Estates](https://gulfnews.com/sport/golf-in-uae/jumeirah-golf-estates-ready-for-dp-world-tour-1.2123200),
  [BMW International Open facts](https://www.press.bmwgroup.com/global/article/attachment/T0271755EN/388224),
  [National Club Golfer: TIOs at The Open](https://www.nationalclubgolfer.com/rules/temporary-immovable-obstructions-the-open/).
- Attendance (Phoenix Open: 719,179 in a week, 216,818 in a day, a 20,000-seat grandstand at the 16th):
  [Phoenix Open](https://en.wikipedia.org/wiki/Phoenix_Open),
  [Golf.com](https://golf.com/news/phoenix-open-sets-another-attendance-record-raises-bar-for-biggest-turnout-in-pga-tour-history/).
- Course design (par by length, the 4/10/4 mix, 65-yard corridors, the standard nine):
  [Golf course (USGA par ranges)](https://en.wikipedia.org/wiki/Golf_course),
  [Scott Macpherson: design principles](https://www.scottmacphersongolfdesign.com/?p=138),
  [Golf Course Industry: good routing](https://golfcourseindustry.com/article/golf-design-good-routing).
- Reference game: [Sid Meier's SimGolf](https://en.wikipedia.org/wiki/Sid_Meier%27s_SimGolf) (tile-painted holes, automatic
  par, golfers' moods, staff, amenities unlocked by progress).
