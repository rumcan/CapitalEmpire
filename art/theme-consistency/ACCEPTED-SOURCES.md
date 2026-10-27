# Accepted terrain source authority

Start with `generated/ground/eight-tiles/READY-MATERIALS.json`. Its four families select 48 primary PNGs:

| Material | NEAR | MID | FAR |
| --- | --- | --- | --- |
| Golden fescue | v3: 01, 03, 06, 08 | v2: 01–04 | v4: 01–04 |
| Lake | v1: 01–04 | v1: 01–04 | v1: 01–04 |
| Sand ripples | v1: 01–04 | v1: 01–04 | v1: 01–04 |
| Long grass | v3: 01–04 | v2: 01–04 | v2: 01–04 |

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
the approved handoff rather than deleting the hold. The owner's green MID fallback follows an accepted canonical selection when one exists.

The owner-supplied `rough-owner`, `fairway-paint` and `putting-green-paint` families and their gameplay mappings remain separate. This
source delivery does not replace them. Putting-green and fringe require their own accepted handoffs; this index makes no readiness claim
for those unfinished families.
