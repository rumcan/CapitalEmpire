# Phase B, the businesses: design (2026-10-19)

The owner's direction is GAME-PLAN 1.0.00: **you are both the entrepreneur and the town planner.** The player places and
pays for businesses (the stadium first); each one unlocks its spin-offs when it does well; revenue comes **per visitor who
arrives**, so traffic still decides the income; the cards become upgrades. Phase B replaces Phase 6's game-placed events
and comes before 6R.5–6R.8 (highways, terrain, towns as seeds, the road set check).

## What the reference games do

- **Cities: Skylines 1, unique buildings and monuments:** each unique building unlocks on a measured condition of the
  city, often traffic-shaped (the Expo Center at 2,000 tourists and Big Town; the Observation Tower at 300 tourists a week;
  the Transport Tower at 1,000 transit passengers a week), and the monuments need a set of earlier uniques. The tree is
  visible from the start, with the condition and progress shown on each locked card.
  ([guidestrats: Expo Center](https://guidestrats.com/cities-skylines-expo-center/),
  [Observation Tower](https://guidestrats.com/cities-skylines-observation-tower/),
  [number13: the monuments](https://en.number13.de/cities-skylines-all-8-monuments-and-their-requirements/))
- **Cities: Skylines II, signature buildings:** the Supply Chains pack unlocks signature buildings by how much the city's
  industry produces plus milestones: the unlock follows what the player's network actually achieved.
  ([Xbox store: Supply Chains](https://www.xbox.com/en-us/games/store/GGWPshop/9P3HDT5NW5SF))
- **OpenTTD, cargo income:** pay = rate × amount × distance × a time factor that falls once the trip passes a cargo's
  "days1/days2" limits: speed and the network decide the money, not the building.
  ([OpenTTD wiki: Cargo income](https://wiki.openttd.org/en/Manual/Game%20Mechanics/Cargo%20income))
- **RollerCoaster Tycoon:** income per guest (the gate or each ride), guests' happiness drops on missing essentials and
  queues, and a ride's appeal (so its fair price) decays with age; players tune prices to the park's state.
  ([Giant Bomb: RollerCoaster Tycoon](https://www.giantbomb.com/games/3030-2236/),
  [Steam discussion on fees](https://steamcommunity.com/app/285310/discussions/0/133257636766778445/))

Shared principles we take: **the player places the money-maker and its spot sets the difficulty; income per customer
who gets there (time matters); satisfaction carries over to the next days' demand; unlocks are earned by measured
success, shown in a visible tree with progress on each locked card.**

## Our model

- **A business** is a placed footprint (a rectangle, rotatable), its doors (side midpoints, outside the footprint), its
  type, level, XP (satisfied visitors), satisfaction (0–1) and its books (revenue, upkeep). The City keeps a list of them;
  the stadium is the first type and keeps today's event rounds.
- **Placing:** the Business tool (key M). Pick a type card, a ghost footprint follows the cursor (green / red with the
  reason: map edge, not open land, a road or car park in the way, buildings there, too close to a town centre); R rotates;
  click pays and builds. Any valid land: the spot sets how far the crowd drives, so how hard the traffic is.
- **Two schedules:** *event* businesses (the stadium; later the concert arena) run today's rounds: a build, a surge to
  kick-off, the eval. *Daily* and *evening* businesses (a sports bar, a golf course, a casino, a tackle shop) draw visitors
  every game day from the towns' everyday trips: a gravity model (demand = level × population within reach × a falloff
  with trip time × satisfaction), their cars drive to the door (a small car park inside the footprint).
- **Revenue per visitor who arrives** (a ticket, a green fee, a fare, a room night): the stadium earns a ticket per fan at
  the doors before kick-off (on top of the toll, which stays as the road's own income); a daily business earns its price
  per visitor whose trip finishes within its time limit; late visitors pay but lower satisfaction; missed ones pay nothing.
- **The tree:** the stadium at Level 2 unlocks the bus company and the sports bar; later branches (a fishing resort → a
  tackle shop; a golf course → estate lots to sell; a casino → hotels; a taxi company) open by level, good days or revenue.
  A Businesses panel shows every type: owned, open to build (cost), or locked (the condition and the progress).
- **Cards become upgrades** of a business or the roads (the existing five first: roundabout, +2 booths, double-decker,
  +4 buses, express entry).
- **Upkeep** per game day on every business, booked with the roads' upkeep.
- **Numbers:** 1985 dollars, scaled so the existing balance holds: the stadium costs $200,000 and the starting fund rises
  by the same amount (to $800,000), so a new game's spending room for roads, the toll, car parks and buses is unchanged.

## Steps (each verified, committed, written up in PROGRESS.md)

1. **B.1 The player places the stadium.** No stadium at the start of a new game; the Business tool with the stadium card,
   the ghost with its reason, R to rotate, the cost; the worker builds the site from the player's spot; save and load (old
   saves keep the game's spot); demolish while no round runs (half refunded). Headless runs and tests keep the game's spot.
2. **B.2 The business model and catalogue.** `src/game/business/` with the types (T010's API shape), the City's business
   list (type, site, level, XP, satisfaction), saved; the stadium becomes one entry; the Businesses panel with the tree
   (owned / open / locked with progress).
3. **B.3 Daily businesses in the sim.** The gravity demand from the towns, visitor trips to the doors as town traffic,
   arrivals counted per business, revenue per arrival, satisfaction from late and missed trips, upkeep; the sports bar
   first, then the golf course and the fishing resort.
4. **B.4 The stadium's tickets and the unlocks.** A ticket per fan arrived; XP and levels per business; the tree opens by
   success; the cards as business and road upgrades.
5. **B.5 Transport businesses.** The bus company (the town buses and shuttles as its fleet, fares per rider) and the taxi
   company (wire `ext/taxi`: ranks at the stadium and the towns, fares).
6. **B.6 Property and tourists.** The golf estate's lots for sale; hotels by the casino; tourists entering from the map
   edge as the businesses grow (wire T010's economics if its PR comes).
7. **B.7 The Phase B gate (headless).** A scripted player places the stadium and three spin-offs, stays solvent over 30
   game days and unlocks at least four types; sim and town budgets met; the GPU bench.
