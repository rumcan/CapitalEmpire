# The junction tool: design (2026-10-19)

The owner tried Widen turns, Turn lanes, Slipways and Signals and found two problems: nothing on the map shows what
changed, and the five sibling tabs mix "what kind of junction" with "options on a junction". This design keeps every
feature we have (types, ring lanes 1–3, the Tab type flip, widened turns, turn lanes, slipways per corner, the signal
tiers and the green split) and rearranges them the way the established city builders do.

## What the reference games do

- **Cities: Skylines II (road tools page)**: roundabouts are placed onto an existing intersection with a size choice;
  traffic lights, stop signs, crosswalks and turn lanes are upgrades applied to the junction or road by clicking it with
  the upgrade selected; **right-click while hovering a feature removes it**; upgrades have a visual and a mechanical
  effect at once. ([Paradox: road tools](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/road-tools))
- **TM:PE (Cities: Skylines 1's standard traffic mod)**: each tool works **on the map**: hovering a junction outlines it,
  clicking selects it, and the options appear as **clickable icons on the junction itself** (priority signs at each
  road end that cycle Priority → Yield → Stop on click; lane arrows over each incoming lane; light heads per direction in
  the timed-lights editor); a small window only holds numbers (step durations). Escape or right-click deselects.
  ([TM:PE wiki](https://github.com/CitiesSkylinesMods/TMPE/wiki), [Priority signs](https://github.com/CitiesSkylinesMods/TMPE/wiki/Priority-Signs), [Lane arrows](https://github.com/CitiesSkylinesMods/TMPE/wiki/Lane-Arrows))
- **Cities: Skylines 1 (vanilla Traffic Routes info view, Junctions tab)**: while the view is open every junction shows
  its control as an icon (lights, stop signs); clicking toggles it.
- **Node Controller**: corner offset (how round a junction's corners are) is a per-junction setting you see change on
  the road as you drag it. ([Node Controller wiki](https://github.com/kianzarrin/NodeController/wiki))

Shared principles: **the type is the main choice and options belong to it; you edit on the map where you look; every
change shows on the road at once; a panel only for numbers; right-click / Escape to remove or back out.**

## Our junction tool

**Two ways to use it, one panel:**
1. **Brush** (Cities: Skylines II style): pick a type card (Plain, Lights, Roundabout with ring lanes 1–3) and click
   junctions to apply it to many. Right-click a junction resets it to plain.
2. **Inspect** (TM:PE style): with the **Select** brush (the default), hover outlines a junction and a click selects it.
   Applying a type with a brush also selects that junction, so its options show at once. Escape or right-click on empty
   ground deselects.

**The selected-junction panel** (its name at the top, e.g. "Main St & 3rd Ave"):
- **Type**: Plain · Lights · Roundabout (Tab / Shift+Tab still flip it; slipways are no longer a type of their own but an
  option of Lights).
- **Options for that type only:**
  - Plain: *Wide corners*, *Turn lanes* (two-lane roads).
  - Lights: *Slipways* (n of k corners; on the map a "+" / "×" at each corner adds or removes one; All / None buttons),
    *Wide corners*, *Turn lanes*, and *Signals*: the tier (fixed-time / actuated / adaptive) with its upgrade button, and
    for fixed-time a green-time slider per phase with the cycle length.
  - Roundabout: ring lanes 1 · 2 · 3.
  Each option shows its price; an option that does not fit says why (too short for slipways, a one-lane road for turn
  lanes).

**On the map, always (not only in the tool):**
- Turn lanes: a left-turn arrow painted on the left lane of each two-lane approach, and straight/right arrows on the
  others, near the stop line.
- Wide corners: the kerb corners painted with a bigger radius.
- Slipways: the islands (already painted).
- Roundabouts and lights: as now.

**While the junction tool is open** (Cities: Skylines 1's junction view): every junction in view gets a small badge:
its control (lights with a tier letter F / A / Ad, a roundabout ring with its lane count) and its options (W, TL, and
the slipway count), so you can see what every junction has without selecting it. The old W/TL tags outside the tool go.

## What changes in code

- `engine.ts`: `junctionMode` and its five chips give way to `brush` ('select' | 'plain' | 'signal' | 'roundabout' with
  ring lanes) and `selectedJunction`; the mode-specific click handlers (`flagClick`, `slipClick`, `signalsClick`)
  become actions on the selected junction (toggle wide, toggle turn lanes, toggle a corner's slipway, set the tier, set
  the split); the map overlay for the selected junction (corner + / ×) and the badges in the tool.
- `App.tsx`: the Junctions panel: brush cards, then the selected-junction section (type, options, signals).
- `network.ts` painter: turn arrows on approaches of `n.tl` nodes; a bigger corner radius for `n.wide` nodes; the
  'slip' type stays in saves (a slip node is shown as Lights with slipways).

## Addendum (2026-10-19): stop signs and mini-roundabouts (6R.4)

The owner asked for "mini-roundabouts (a small yellow circle in the road where drivers take turns) instead of two stop
streets", and the junction editor list has all-way and two-way stops.

**Reference:** TM:PE sets a priority sign per road end (Priority / Yield / Stop): all ends on Stop is an all-way stop,
the main road on Priority and the side roads on Stop is a two-way stop. Mini-roundabouts (UK, SA, now the US: FHWA)
have a **traversable painted island** (about 4 m across, a white or yellow dome), an inscribed circle under ~28 m, for
roads up to ~50 km/h; entering traffic gives way to traffic already on the circle; capacity is below a single-lane
roundabout but above an all-way stop, in the space of an ordinary crossing.
([FHWA mini-roundabouts](https://highways.dot.gov/media/19871), [OSM mini_roundabout](https://wiki.openstreetmap.org/Tag:highway=mini_roundabout))

**Ours:** two more types in the junction tool, between Plain and Lights:
- **Plain** stays the priority junction (the bigger road runs through; side roads stop or yield): this is the two-way
  stop, and its card says so.
- **All-way stop** ('stop'): every approach stops at the line, then the car that has waited longest goes (first come,
  first served). Painted: a stop bar and "STOP" on every inbound approach. $300. Badge **4S**.
- **Mini-roundabout** ('mini'): no new land: the ring sits inside the crossing (outer radius the widest arm's half width
  + 1 tile, at least 4 tiles; island radius 1.2 tiles, painted white with a yellow rim, no kerb, no tree); one ring lane,
  entries yield to the ring (the roundabout logic at a small radius, ring speed ~6 m/s), so drivers take turns.
  Arms of up to 2 lanes each way (bigger roads: "too big for a mini-roundabout"). $1,500. Badge **MR**.
Both open from the start (1985) and in event mode; Tab flips through Plain → All-way stop → Mini → Lights → Roundabout.
