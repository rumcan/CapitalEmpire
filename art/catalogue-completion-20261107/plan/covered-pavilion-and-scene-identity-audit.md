# Covered pavilion visibility and clicked building identity audit

Read-only inspection, 2026-11-07. No rendering changes or visual approval implied.

## Current covered seating render order

`src/game/sprites.ts` sorts a mover against the complete prop footprint. An interior seat normally fails `isBehind(host, person)` because the host far corner is beyond the person's tiny ground footprint. Therefore the person usually renders before the complete pavilion PNG: under the roof and posts, but also under its floor and rear bench pixels. `crowdDrawable` lifts image pixels to the bench while sorting remains based on the original ground footprint. Seats can consequently disappear or have incorrectly hidden legs/bodies. Forcing the person after the whole host instead would put bodies over the roof and posts.

The technical guide explicitly says anchor visibility is not asserted. The companion `covered-pavilion-technical-visibility.json` ray audit finds roof/support obstruction for 23/24 head anchors in each normal view, 24/24 in yaw N/S and 19/24 in yaw E/W. This ray audit checks the technical mesh, not final native painted pixels; it is not an approved visibility mask.

Smallest honest first step: add reviewed per-view/per-seat visibility (hidden/visible/partial); skip fully hidden people without reducing gameplay capacity. Correct partial visibility then needs native-pixel foreground masks or a back/floor + foreground roof/posts split. Base/background -> seated people -> foreground must recombine to the original art, with measured bench/head anchors. One global foreground mask may still mishandle intermediate row posts: review each seat bank. Avoid a full-size RGBA texture per seat. No renderer rewrite is authorized by this report.

## Heading calibration warning requiring verification

The technical normal camera projects ground-down as negative (x+y); the game projects worldY as positive (X+Y). NormalNE technical rotation is 270 degrees while normalSE is zero. Mapping that guide to game ground coordinates appears to make the normalNE-to-SE transition clockwise, whereas the present generic seat helper applies positive counter-clockwise heading. An asymmetric row/entry fixture needs to be projected and compared to the actual source before approving any native seating layout. Use measured per-view seat/entry metadata if conventions differ. Do not globally negate all existing art headings based on this preliminary check; the authored guides and generic library can have different local bases.

## Actual clicked appearance

`newart.ts:lookOf` can substitute a different library item while retaining the saved logical item. Sprite geometry uses that drawn item. The old inspectScene preferred saved `own` identity and could choose the wrong house/business scene. Exact-scoped scene selection must use `sceneSubject(lookOf(prop).item)`; hidden items have no scene. Keep logical lot occupants, jobs, condition and business ownership separate from visible architecture. Canonicalize eight-view subjects with objectFacings. Repainting PNG pixels under the same ID needs a new art provenance review: an ID cannot detect architecture changes inside an overwritten file.

## Source-pack matching contract

New reviewed scene registrations require exact `subject`, explicit `view: outside|inside` and actual `state`, plus optional `instanceKey`. Descriptive scene slugs need not mirror runtime semantic slugs. The first four source batches now explicitly specify `view: outside` in their proposed registrations. An ordinary manually placed prop has no simulated condition: its available art states must be presented as illustration variants, not as a fabricated upgrade level. Known lots, event tiers, range upgrades and clubhouse tiers retain actual state filtering.
