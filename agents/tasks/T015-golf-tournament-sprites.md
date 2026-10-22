# T015 - Golf tournament isometric sprite sheets

Status: in progress
Owner request: 2026-10-21. Branch: `arena/T015-golf-tournament-sprites`.

Generate an extensive researched collection of golf course and major tournament artwork for Capital Empire. The owner explicitly requests transparent PNG sprite sheets containing four isometric sprites per page. This art-only task authorizes new source artwork and its inventory under `art/golf-tournament/`, plus this task file. Do not replace existing assets, modify runtime code, or edit `docs/`.

Use the built-in image generator. Cover course features, competition, practice, spectators, hospitality, retail, broadcast, staffing, grounds maintenance, medical services, utilities and transport. Match the game's detailed illustrated isometric style. Keep each page in a consistent 2-by-2 layout with generous transparent gutters, no captions and four independently usable objects or compact assemblies.

Owner expansion, 2026-10-22: the game progresses from a poor worn tournament to an amazing premium event. Preserve all 28 polished sheets and send every sheet through the image generator again to create matching worn starter versions under `art/golf-tournament/worn/`. Keep subject identities and reading order so 112 subjects each have a poor/premium pair. Do not replace actual generator edits with code distress filters. The owner explicitly authorizes multiple agents generating sheets concurrently. Document any layout drift or generated edge artifacts before runtime integration.

Owner correction, 2026-10-22: the old worn treatment did not work and must be substantially more shanty. Produce the final starter tier in `art/golf-tournament/shanty/`, retaining the same four roles per sheet but allowing simpler silhouettes and construction: improvised pallet/plank structures, scavenged corrugated tin, patched tarps on rough poles, rope lashings and homemade equipment. Rejected worn variants are working drafts, not the final starter tier. Preserve those files locally without promoting them into the final inventory. The owner also asked about Python, NumPy, Numba, Pillow, SciPy, raymarching, SDFs and Lua for animation; feasibility was discussed, no animation implementation has been requested yet.

Save the exact generation prompts, sprite inventory and research sources with the artwork. Validate the PNG format, alpha transparency, dimensions and four-cell layout. No simulation or rendering changes are requested. Deliver on the dedicated branch as a pull request; flag any tool or delivery limitations honestly.
