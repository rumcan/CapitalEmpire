# T272: second painted menu sheet in the actual game

2026-10-28, PR #818 / issue #816. The approved native 1448 x 1086 source is unchanged. Its twelve cards are prepared as twelve distinct 144px runtime assets; all twelve original v1 asset hashes remain identical (asset-audit.json). Source crop rectangles and exact output hashes are in art/ui-tool-tiles/sheet-v2.json.

Fresh default `npm run typecheck`: PASS. Focused ui-flyouts + ui-tool-tiles-prep tests: 21/21 PASS. An earlier resumed check used an artificial1536MB heap cap and exhausted it; normal typecheck completed successfully afterward. No full suite/build ran.

The seven screenshots are from the real Vite game at 1600 x 900, DPR1, 100% UI scale, isolated range start with advanced tools enabled. Existing flyout labels/actions were used. Onboarding was dismissed through its normal game control; all POSTs were intercepted, and no owner data was saved. `browser-review.json` records56 loaded menu-image instances (including the existing SVG fallback icons), the painted assets'144px native dimensions and0pageerrors. Across the captures all24 named painted icons are shown, including all12 new subjects. The unchanged terrain/background is incidental: these are menu integration proofs, not terrain approval.

- course-menu: whole-hole, tournament/scoreboard and land plot.
- course-surfaces: Waste area and Long grass alongside the original surface pictures.
- course-buildings: Halfway house uses the snack-hut painting; Clubhouse stays original.
- facilities-menu: Decoration/street furniture and Build/surveyor turf.
- facilities-practice: separately painted chipping green and bunker.
- facilities-plants: new autumn shrubs and palms alongside original trees/flowers.
- facilities-props: new patio furniture alongside original planting/water/stone.

Town-start Practice remains correctly locked until there is a driving-range practice area; the successful captures use an actual range start. Every new image resolves through the repository's normal Vite asset import. Original PNG screenshots remain in E:/ClaudeTemp/T272; these smaller WebP review copies are diagnostic exports only. No original artwork was repainted, recoloured, warped or overwritten.

Own dev server5189 and headless Edge are stopped. Owner5174/5191 and the continuous-art task/timer were untouched.

Parent visual review caught the new Build tile inheriting near-black gold-button lettering after the tile style replaced its gold fill. A scoped `.flyout-tile.flyout-row-gold` colour override now keeps a gold wash and bright gold label/border; ordinary gold buttons are unchanged. The final actual-game browser capture asserts label `rgb(255, 209, 102)` in normal and hover states. All seven screenshots were retaken after that fix;0pageerrors.
