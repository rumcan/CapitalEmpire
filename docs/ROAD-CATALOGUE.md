# The road catalogue: design (6R.2, 2026-10-19)

The owner asked for "all the road types that exist in real life" (as Cities: Skylines has), one-way for every type, and a
way to flip through the variants of a type. Today the road tool is a flat list of seven fixed classes (`CLASSES` in
network.ts) and the Add lane tool jumps most of them straight to the arterial.

## What the reference games do

- **Cities: Skylines II (road tools page):** roads come in **size categories: small, medium, large, highways**; each
  category has **two-way, one-way and asymmetric** variants; bus lanes and tram tracks are road options; trees, grass,
  wider sidewalks and sound barriers are **upgrades applied with the Replace tool**, and **right-click on a feature
  removes it**. ([Paradox: road tools](https://www.paradoxinteractive.com/games/cities-skylines-ii/features/road-tools))
- **Replace / Upgrade tool (C:S1 and C:S2):** pick a road type and click or drag along an existing road to change it in
  place (pay the difference); **right-click a one-way road reverses its direction** (C:S1's Upgrade tool; C:S2 reverses
  with the Replace tool). One-way roads run the way they are drawn.
  ([Steam: reverse one-way](https://steamcommunity.com/app/255710/discussions/0/617335934138634663))
- **Road Builder (C:S2 mod) and Network Extensions 2 (C:S1):** players build roads from lanes: 2, 4 and 6 lanes two-way
  with or without a planted median, 3 and 4 lane one-ways, 8 lanes with a median: the real-life set is a handful of
  parameters (lanes each way, one-way, median, edge treatment, trees), not a list of unrelated assets.
- **Real life (US/UK street design):** local street (2 lanes, sidewalks), one-way street pair, rural two-lane with
  shoulders, gravel road, four-lane arterial, the five-lane arterial with a **centre two-way left-turn lane** (yellow
  solid outside, dashed inside), avenues and boulevards with planted medians, six-lane divided arterials, rural divided
  four-lane roads with a wide grass median.

Shared principles: **a road is a few parameters; types are named presets grouped by size; variants of a type are
toggles on it (one-way, trees, median, turn lane); the same tool upgrades in place, and right-click reverses a one-way.**

## Our model

`RoadSpec` is not stored on its own: every catalogue entry is still a `RoadClass` object (so the painter, the sim and the
workers keep reading `s.cls.h`, `s.cls.laneCentres` and friends), and the catalogue builds all of them at load time.
- **Id:** the type id, plus the variant flags joined with dots: `street`, `street.ow`, `arterial.tl`, `avenue.gr`. The
  seven old ids are the plain variants of their types, unchanged in every number, so **old saves load as they are**.
- **New fields on `RoadClass`:** `base` (the type id), `flags` (the variant's flags), `family` ('small' | 'medium' |
  'large' | 'rural'), `vmax` (m/s; was the `VMAX` table in lanes.ts), `laneLines: number[]` (every dashed white
  divider's offset, was the single `laneLine`), `oneway`, `medianTrees` (a planted median gets trees; the grass variant
  does not), `streetTrees` (trees along the sidewalks), `centre` gains `'twltl'` (the centre turn lane's markings).
- **Flags:** `ow` one-way, `tl` centre turn lane, `tr` street trees, `gr` grass median (no trees).
- **The variant list of each type** is explicit (the Tab key cycles it in order):

| Family | Type (id) | Lanes | Width | Variants |
| --- | --- | --- | --- | --- |
| Small | Gravel (`gravel`) | 1 + 1, unpaved | 5 m | — |
| Small | Lane (`lane`) | 1 shared | 4 m | — |
| Small | Street (`street`) | 1 + 1 | 6.5 m + sidewalks | one-way (2 lanes one way), trees, one-way + trees |
| Medium | Avenue (`avenue`) | 1 + 1, planted median | 14 m | grass median |
| Medium | Arterial (`arterial`) | 2 + 2 | 16 m | one-way (4 lanes), centre turn lane, trees, one-way + trees, turn lane + trees |
| Large | Boulevard (`boulevard`) | 2 + 2, planted median | 20 m | grass median |
| Large | Six-lane (`six`) | 3 + 3, painted median | 22 m | one-way (6 lanes) |
| Large | Grand boulevard (`grand`) | 3 + 3, planted median | 25 m | grass median |
| Rural | Gravel (`gravel`, shown again) | | | |
| Rural | Country road (`road`) | 1 + 1, shoulders | 12 m | — |
| Rural | Divided road (`divided`) | 2 + 2, grass median, shoulders | 24 m | — |

Bus lanes are left for Phase B (the bus business); asymmetric roads (2 + 1) and highways come with 6R.5.

**Add lane** (the in-place upgrade) widens by type: street → arterial, arterial → six, avenue → boulevard, boulevard →
grand, keeping the flags the wider type has (a one-way street becomes a one-way arterial). Arena task T013's one-step
ladder with prices plugs onto this later.

**Unlocks** follow the type (`base`): a variant is open when its type is.

## One-way

- A one-way road runs from `seg.a` to `seg.b`: the order it was drawn in. Splits keep the order already; drawing over an
  existing segment the other way does not flip it. **Right-click a one-way road with the Add lane tool reverses the
  whole straight chain** (as C:S1's upgrade tool), free.
- **Lanes:** `laneCentres` of a one-way class run across the whole width, left to right (`street.ow`: −0.8, 0.8;
  `arterial.ow`: −3, −1, 1, 3). The b-to-a directed seg gets no lanes; junction movements and routes skip it.
- **Paint:** no centre line; dashed white dividers between all lanes; a white straight arrow on every lane every ~30 m,
  pointing along a→b; at junctions the stop line spans the whole width of an incoming one-way arm, and an outgoing-only
  arm has none.
- **Dead ends:** a one-way road that ends in a dead end traps cars: the road tool warns (as C:S players learn the hard
  way); the U-turn at a one-way dead end is allowed in the sim so nothing is lost.

## The road tool panel

Families as small headers (Small · Medium · Large · Rural), the types as cards under them (name, lanes, width, price), and
under the selected type a row of **variant chips** (Two-way / One-way, Trees, Turn lane, Grass median), the one in hand
lit. **Tab / Shift+Tab** cycles the variants of the type in hand (the junction tool's Tab cycles types: the same key,
"flip"). Keys 1–6 still pick the six old key types. The preview of a one-way road draws its direction arrows.
