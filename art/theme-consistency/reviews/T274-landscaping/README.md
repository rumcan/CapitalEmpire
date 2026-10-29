# T274: grey granite and water-edge plants in the game and Studio

Six boulders and six plants are separately placeable in Facilities > Decoration > Props > Stone/Plants. Studio lists twelve individual cards under Painted landscaping; search `kit:granite-` or `kit:water-edge-`. The previous sandstone, shrubs, plants and mixed brushes retain their identities and behavior.

Canonical source: `golf-stone-boulders-grey-v1.png` and `golf-water-edge-plants-v1.png`, native1536x1024, with original provenance and primary appearance reviews. Boulder v2 is an unselected experiment. Separate native-export reports and primary-approved native appearance decisions bind the exact source and every crop hash. The component-aware partition preserves all1,471,583nonzero-alpha source pixels exactly once: zero changed RGBA pixels and zero overlap. Complete source PNGs are unchanged; native exports are not resampled, mirrored, recoloured or warped. Faint alpha edges are preserved even where neighboring foliage bounds overlap.

Physical widths of the six rocks:0.6/1.1/1.8/0.8/1.5/2m. Plant widths: fern1m, sedge0.8m, juniper1m, golden grass0.75m, red shrub0.9m; cattails1.5m high. Native visible bounds determine the world scale, with transparent margins kept separate. Runtime masters and mips use ordinary proportional asset preparation; native exports retain all source pixels.

## Checks

- Fresh default `npm run typecheck`: PASS after merging main `dd86f141aa5a5e37d5fc4f895eec4aff6f4aa577`, and again after the final worker-only main update `2681dfcca0a3d7cbb9606209107ca98879130092`.
- Focused `landscaping-kit` and neighboring `kit` tests:10/10 PASS. Includes overlapping-foliage crop reconstruction, hash bindings, unique tail registration, actual no-mirror behavior, existing kit/lot pools, placement and atlas budgets. The first resumed run lacked art files omitted by the sparse checkout; adding the exact source folders resolved that without changing code.
- Existing golf page:52 old records byte-identical, including UVs;12 new records at the tail. One existing2048page,25.4% area, lowest shelf1049/2048. No page or GPU layer added; existing DPR1/2 budget checks pass. Detailed audit in integration-audit.json.
- Actual game range-start proof: all12 placed through normal PropsTool ownership/collision checks at scale1, flip=false;0pageerrors. Screen1600x1000, DPR1, closest30% zoom. The cleared range-field location keeps forest trees from hiding the small props. Placement does not change owner data: POSTs were intercepted in a disposable browser context. `game-proof.json` records every ID, world point, scale and library index.
- Actual Studio after the main merge:12 separate API cards with loaded thumbnails,0pageerrors. Bigger/Smaller controls invoked on every card,24 exact-ID requests. These scale POSTs were intercepted and echoed locally; persistent size edits were not made. The screenshots use the Studio's1.2x display slider to inspect the source, while each item remains scale1. Studio startup required process-local TOT_REPO and git safe.directory settings. The first cold library request exceeded the browser's30s timeout while hashing existing sprites; the cached retry completed normally.

The screenshot background is existing terrain, not a new ground-art approval. Studio's native-upscale limit remains unreported (`native:null`) for these supplemental masters, as with the old kit; ordinary size controls and current scale1 are available. No full build/suite or Studio Rebuild was run.

## Save identity and future additions

The current library is unchanged before the twelve appended records. Runtime props hold a numeric index, but saved props use **string library IDs** (`src/game/save.ts` Props tuple; `engine.ts` save calls `propTuple(LIBRARY[p.item].id,p)`, load resolves `index.get(id)`). Future Range records inserted before this tail can change transient indices without reinterpreting saved landscaping props. No save-format redesign is needed.

Original screenshots and audit scratch: E:/ClaudeTemp/T274. The WebP files here are smaller diagnostic copies; source art and native PNG crops remain unchanged. Own Vite5189, Studio5193 and headless Edge are stopped. Owner5174/5191 and scheduled-worker state/timer were untouched.
