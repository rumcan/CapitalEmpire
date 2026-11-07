# Details, identity and event seating continuation — 2026-11-07

Branch: `lead/details-identity-20261107`. Own isolated child checkout; no owner-live changes.

## Verified steps

- `32fa916`: stable saved town identities/looks, exact-look lazy portraits, home/event scene identities and character inspection. TypeScript clean; 45 focused tests passed.
- `4d438f2`: reviewed `golfer:golf_pro_m1` image imported losslessly, source preserved and manifest registered.

## Current step, before edits

Build a pure authored-seating geometry module taking physical heading degrees, local seat rows, seat elevations and entry anchors. Rotate seat position, facing and entry together; remove the fixed bottom-facing/12-column assumptions when authored seating exists. Missing layouts remain explicitly unverified rather than claiming spectators align with seats.

Add four new event seating catalogue models: seated pavilions with 24, 60 and 120 places, and a compact 60-seat bleacher. Exactly two art conditions: budget and upgraded (worn/rundown are budget aliases). New types remain unavailable until a reviewed, complete eight-view art set and valid seat metadata are registered. Existing event prices and capacities do not change.

The parent lead approved provisional rental balance: $600/$1,200/$2,400 for the pavilions and $900 for the compact bleacher. The one-time visual improvement fee is half that rent ($300/$600/$1,200/$450); capacity and recurring rental remain the same after improvement. These are new design values, not historical existing-game facts.

Rotation baseline `6fd351e` was cherry-picked into this child as `0896a98` for integration; the parent already has the equivalent baseline and the prior details commits. Return only subsequent follow-up commits. Parent has wired imported object8 identity lookup into the scene subject resolver.

Seating rows are in local metres around the collision-footprint centre. Their `seatHeightMetres` is the bench top, not a ground offset. Rendered hips are aligned using each spectator's own recorded source hip height, the source people's 128-px/m / 160-wide-frame / 30-degree-camera contract, and the actual imported frame width. The bench height independently uses the game's 32-world-pixels-per-metre height scale. Subtracting hip metres times 32 would be wrong because the person source uses a different pixel scale. Prepared row arrays and entry anchors are rebuilt on structure changes, not allocated on each render.

Gallery approach/relocation/egress uses the rotated entry anchor where present; the same existing random draws are consumed to preserve unrelated simulation sequencing. Old unreviewed stands use an explicitly draft dimension-based row estimate until reviewed art supplies measured rows. This estimate never unlocks a new facility or counts as reviewed seating.

Allowed source scope: seating/facility modules, golf galleries/crowd seat layout handling, event catalogue/art readiness, event condition controls and the related engine/UI hunks; focused tests. No movement changes, full suite, build, server, push or owner-live edits.

Checks: wait for the heavy-check slot after the rotation agent releases it, then targeted tests and TypeScript only. Stop all owned commands before reporting.

## Verified seating step

- Added authored local-metre row banks, independent front vectors, physical heading rotations, bench heights, measured optional height calibration, and rotated entry/exit anchors. Adult/child sitting sprites use their actual source-rendered hip pixel offsets; no animation clips changed.
- Renderer caches prepared row arrays per gallery when structures change. It keeps the existing 90-visible-spectator-per-stand performance limit while sampling occupied authored seats; gameplay capacities remain the catalogue values.
- Added the four new sizes, budget/upgraded selection and paid one-time improvements. New sizes stay unavailable without all eight approved native runtime pictures, matching physical dimensions/capacity, and reviewed seat/entry metadata. There are no new registered facility images or small-stand substitutions in this commit.
- Native cut/integration preserves base and per-view seating metadata, rejecting unreviewed layouts, wrong counts, missing access and out-of-footprint seat rows.
- **66/66 focused tests passed**: event seating, galleries, crowd views, gallery drawing, event tool/wiring, object facings, people details and scenes. **3/3 native importer checks passed**. **TypeScript clean**. No full suite, build or server started; the shared heavy-check slot was released to the lead.

Remaining visual verification: the parent is generating the new facility pictures. Each actual eight-view facility still needs its real seat rows/entrances calibrated against those pictures and a browser check before review is approved. Draft legacy row estimates are not claimed to match old unreviewed art. The parent separately excludes the old gazebo and shanty from historical eight-view reuse; this child follow-up does not modify that registry.
