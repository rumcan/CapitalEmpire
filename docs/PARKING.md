# Parking stamps and on-street parking

The owner's ask (2026-10-20): a parking lot stamp that draws the bay lines **and** gives cars real spaces; and parallel
parking lines for on-street parking. Decisions (the owner's answers): stamps at **any angle with 90°/60°/45° bays**,
joining the car park system; on-street bays **in the kerb lane** (the kerb lane becomes parking, so it needs 2+ lanes
that way).

## 1. Bay rows: drag to lay parking spaces (Car Park Capital style)

The owner's reference (2026-10-20): MicroProse's *Car Park Capital*: you click and drag and the parking spaces appear on
the ground along the drag (straight or angled bays, painted lines). So the stamp is a **row of bays laid by a drag**:

```ts
interface BayRowDef { id: number; ax: number; ay: number; bx: number; by: number; side: 1 | -1; bay: 90 | 60 | 45; col: 'white' | 'yellow' }
```

- **Geometry**: the drag a→b is the row's front line (the aisle side). The bays stand on `side` of it (1: perp(u), the
  right of a→b; −1 the left), BAY_D deep (angled: BAY_D·sin θ + BAY_W·cos θ), one bay per BAY_W / sin θ along it,
  leaning towards b for angled bays. Each bay is a `Bay` (centre, heading into the bay, row direction).
- **Ground**: the row's footprint is paved (the asphalt mosaic, which lives in tile space, so it joins an asphalt area
  or another row without a seam) and its lines are painted: one line between bays and at both ends, plus the back
  line; white or yellow. It rides the lot ground channel (key `row:<id>`; `LotPatch.lineCol`).
- **Lots**: rows within LOT_JOIN tiles of each other form one lot (a car park for the sim: `CarPark` with id
  100000 + its lowest row id). Its entrance is on the nearest ground road to the lot (within ROW_REACH tiles), at the
  projection of the lot's centre on that road; `pv` points from the road to the lot. Its bays (all the rows' bays) fill
  nearest the entrance first. A lot with no road in reach has no entrance: its rows are drawn red in the overlay and
  park nobody.
- **Tool**: the Car park tool gains modes **Rectangle** (today's), **Rows** and **On-street**. Rows: press and drag;
  the row follows the drag (Shift: snap the angle to 15° steps; the start snaps to the end of an existing row so rows
  chain); **Tab** flips the side, the panel picks 90° / 60° / 45° and white / yellow. Preview: the bays and lines
  translucent, red with the reason when it cannot go (over a road, on water or off buildable ground, under 2 bays,
  over another row). Click a row (no drag) with Alt, or use Bulldoze, to remove it. Cost: ROW_BAY_COST per bay.

(The angled-bay and frame helpers in `carpark.ts` (`a`, `bay` on `CarParkDef`, `Bay.hx/hy/tx/ty`, `bayLines`, `pv`)
come from the first design, a rotated block stamp; `pv` and the bay headings are what rows and curbs use.)

## 2. On-street parking (curbs)

```ts
interface CurbDef { id: number; ax: number; ay: number; bx: number; by: number }   // a straight run, traffic from a to b, bays on its right kerb
```

- **The run**: the straight run (netops `straightChain`) through the road between node a and node b, all ground segs
  of one class, no toll plaza. The kerb lane of that direction (the outermost lane, `laneCentres` last) becomes
  parking, so the class needs **2+ lanes in that direction** (one-way roads count all their lanes). Min 4 bays.
- **The lane graph** drops the kerb lane on those directed segs (`LaneGraph.setCurbs(keys)`, rebuilt like the toll
  gates' booths); junction movements are built from the lanes that remain, as for any change of lane count.
- **Bays**: parallel, every 3 tiles (6 m) along the kerb lane's centre line, 4 tiles clear of each end; heading along
  the traffic.
- **Cars**: the City makes each curb a park (after the car parks, id −curbId) with one entrance at the run's middle
  and a sink on the outermost remaining lane of that direction only (no U-turns into it). Event and party cars use it
  like any car park; parked cars stand in their bays (props, as in the car parks).
- **Markings** (drawn over the road, a new top layer of the lot ground channel: `LotPatch.top`): a solid white line
  between the parking lane and the traffic lane, and a T tick at every bay boundary.
- **Tool**: On-street mode: hover a road; the side under the pointer picks the direction (its right kerb); the run
  lights up amber (red with the reason: "needs 2 lanes this way", a junction-free straight run, ...). Click to add;
  clicking an existing curb removes it. Cost per bay: CURB_BAY_COST.

## 3. Entrance and exit gates (art)

The owner asked for an entrance and an exit, with art from the RUN.world image generator. Two sheets were generated
(art/parking/README.md): an entrance gate (ticket pillar + boom barrier), an exit gate (pay station + barrier), a P sign, an
attendant kiosk, a pay-and-display machine and an IN sign, packed into the atlas as `ce:parking-*` (category Parking).
Placement is automatic: every car park and bay-row lot gets an entrance gate and an exit gate side by side at its
entrance, just past the sidewalk, their arms across the driveway (along the road; a prop's flip turns them for roads
along Y), with a P sign beside them; on-street runs get a P sign and a pay-and-display machine on the sidewalk at their
middle. They are auto props (not saved), rebuilt with the parks.

## 4. Parking fee

Every car that parks (car parks, bay-row lots, on-street) pays one fee, set in the Car park panel ($0–$50, default $5),
into the treasury on its own ledger line (`Budget.parking`, today.parking). The City books it each step from the
cars the sim parked (`Sim.parkedNow`).

## 5. Heat maps over time

The owner: "a heat map is over time, not right now". The Flow overlay gets two views: **Over time** (the default)
and **Now** (today's live bands). Over time = per road direction, the delay its cars suffered (the sum of 1 − v/vmax
per lane-km, an EMA of about 6 game hours: HIST_TAU = 360 sim s), drawn as a glow from yellow to red where traffic keeps
jamming. **Parking demand** (a toggle in the Car park panel): per 16-tile cell, the cars per game hour that wanted to
park there (trips ending at a shop, office, factory, tourist or civic lot, and every car reaching a car park
entrance, parked or turned away), the same 6-hour EMA, shaded blue to red, with the number written at street zoom.

## 6. The golf pivot (planned 2026-10-21, [GOLF-PLAN.md](GOLF-PLAN.md) sections 5.2 and 9)

Everything above stays: tournament spectators park in these car parks, bay-row lots and on-street runs. Planned additions:
- **Lot tags**: spectator, park and ride (a shuttle route from the lot to the gates), staff (filled before the gates open),
  VIP and hospitality, players and officials (on site, a closed route).
- **Field parking** on farmland (`ext/farms` fields): grass, no lines, one entrance, slow to fill, muddy in rain (G8).
- **The parking pay plaza** (open question 3): the toll gate's booths re-skinned at a big lot's entrance, charging the fee on
  entry with a service time per car.
- **Message signs** send drivers to car parks that still have space; a full car park turns cars away to the next one (the
  missed spectators when none is left).

## Saving

New optional fields `rows: [ax, ay, bx, by, side, bay, col][]`, `curbs: [ax, ay, bx, by][]` (ids 1..n in order) and `parkFee`. No version bump.
