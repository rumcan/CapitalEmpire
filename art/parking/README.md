# Car park art (CapitalEmpire's own sprites)

Generated 2026-10-20 with the RUN.world CLI (`rundot generate image`, gemini-3.1-flash-image-preview + BRIA background
removal, 147 credits per sheet, two sheets; the generations were removed from RUN storage after download). References:
the town builder's style target and two library props (parking meter, payphone). Prompts and the raw sheets are kept
locally in `output/imagegen/parking/` (not committed).

`items.json` lists each sprite in the town export's item format (w, h, ax, ay in display px at 128 px per tile; boxes in
metres) with `local: true`; `scripts/assets/prep-sprites.mjs` packs them into the atlas under the category "Parking".
Scale: the gates from their 3 m barrier arm (0.4 px per sheet px), the signs and kiosk from their real heights.
The gates face along the ground X axis; a prop's flip shows them along Y.
