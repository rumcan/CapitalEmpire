# Accepted terrain source authority

Start with `generated/ground/eight-tiles/READY-MATERIALS.json`. Its six families select 72 primary PNGs:

| Material | NEAR | MID | FAR |
| --- | --- | --- | --- |
| Golden fescue | v3: 01, 03, 06, 08 | v2: 01–04 | v4: 01–04 |
| Lake | v1: 01–04 | v1: 01–04 | v1: 01–04 |
| Sand ripples | v1: 01–04 | v1: 01–04 | v1: 01–04 |
| Long grass | v3: 01–04 | v2: 01–04 | v2: 01–04 |
| Putting green | v1: 01–04 | v2: 01–04 | v2: 01–04 |
| Fringe/apron | v1: 01–04 | v1: 01–04 | v1: 01–04 |

Each entry names a hash-bound `canonicalselection.json`; follow that selection's primary files, appearance decision and `HANDOFF.md`.
The committed source closure includes the actual native PNGs, provenance, inputs, pixel-selection reports and appearance evidence those
records reference. Some input paths name historical versions: they are lineage, not alternative ready selections. Never ship a file just
because it has a newer folder number or is present in this tree. Raw outputs, guides, proofs, seam masters and optional variants are not
runtime primary tiles.

The 2026-10-27 delivery verified 440 source files, 717 explicit path/hash bindings (315 unique) and all 48 primary PNG/native WebP sizes
against the packed manifest. It changed no packed pixels: T170 already shipped these exact accepted selections. Saved-art acceptance is
distinct from owner approval and live game appearance.

`node scripts/assets/prep-painted-tiles.mjs --art <art-checkout>` checks canonical hashes and native dimensions before writing assets.
The command also needs the provisional and owner-source families named by its importer. An explicit held, blocked or rejected appearance
review excludes that experimental set, including its raw drafts. If no usable fallback remains, preparation stops before writing; finish
the approved handoff rather than deleting the hold. A fallback follows a canonical set when it satisfies that fallback's explicit revision pin.

T217 publishes the complete accepted green under `runtimeId: "putting-green-finished"`, named "Putting green (fine turf)". Its canonical
source ID and hashes are unchanged. This is an additional Painted option: the legacy green's pinned MID/FAR v1 sets and the owner's NEAR
painting remain intact. Fringe keeps its existing runtime ID and identical packed pictures, now backed by its handoff.

For a selected accepted batch, use:

```sh
node scripts/assets/prep-painted-tiles.mjs --art <art-checkout> --only fringe,putting-green-finished
```

The scoped command requires an existing manifest, retains all other family records, pictures and curated settings, updates the combined
revision, and prunes only the selected family folders. An explicitly pinned held legacy option is retained only at the exact source files
and hashes already recorded in that manifest; newly completed or changed rejected files cannot replace it.

The owner-supplied `rough-owner`, `fairway-paint` and `putting-green-paint` families and their gameplay mappings remain separate. This
source delivery preserves their paintings and surface choices. Their owner-source status remains separate from the new accepted green
and fringe handoffs.
