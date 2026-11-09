# Native building-art continuation — complete, 2026-11-06

## State

- Saved branch: `lead/art-repaint-20261106`; isolated worktree: `E:/Repos/CapitalEmpire/.claude/worktrees/art-repaint-20261106`. No native generator is running. The original 43-subject resume CORNER queue is complete with zero pending subjects.
- [Completion verification](./completion-verification.json) verifies 43 selected successful corner sets, their raw sheets/exact prompts and 172 current native RGBA crops against provenance and `D:/AI/repaint/out/<id>/`. True transparency and source-sheet cell margins pass. Odd image dimensions use integer split boundaries without losing pixels.
- File presence: 87 earlier corner subjects + 43 resumed subjects = all 130 rows in the original corner queue have four compatible output files. These are file-presence counts, not owner visual approvals. This does not convert all older cardinal sheets or establish that every catalogue view is complete/correct.
- Preserved raw sheets: 47 corner + 3 axisturn = 50. Provenance statuses: 47 imported candidates awaiting review, 2 historical geometry holds (barber/firestation corners-v1), 1 rejected sheet (Arcade axisturn-v1 crossing cell boundaries). Barber/firestation v2 are the selected usable corner candidates; rejected/held historical files remain intact.
- Explicit eight-view candidates: [Video Vault selection](./world~video_rental/selection.json) chooses corners-v2 + axisturn-v1 (daytime as generated); [Arcade selection](./world~arcade/selection.json) chooses corners-v2 + axisturn-v2 (late-afternoon daytime). Both manifests verify all eight current crops and actual edit references. Arcade axisturn-v2 is a spacing-only edit of its rejected v1, accurately recorded in provenance.
- All art remains candidate art: `owner_approved=false`, `runtime_integrated=false`. No runtime packaging, servers, game code, commits or pushes were performed by this verification/handover.

## Lighting scope and retained evidence

- Owner: **"only from now on"**. The last nine resume jobs (indices 34–42) were generated with exact LATE-AFTERNOON DAYLIGHT prompts and `all_generated_views=true`; their provenance records the upper-right sun and lower-left shadows. Earlier lighting remains historical. Only Video Vault and Arcade received explicitly requested retrospective daylight/eight-degree corrections; do not relabel other earlier sheets or convert them automatically.
- Future building prompts: [corners](D:/AI/chatgpt-bridge/prompt-corners.txt), [8-degree cardinal](D:/AI/chatgpt-bridge/prompt-axisturn.txt), [square cardinal](D:/AI/chatgpt-bridge/prompt-axis.txt). They require late-afternoon daylight, sun SCREEN UPPER RIGHT, shadows SCREEN LOWER LEFT, warm natural sun and ambient sky fill; exterior lamps/neon OFF, no glowing windows/artificial light pools.
- [Byte-for-byte prior templates and checkpoint files](D:/AI/chatgpt-bridge/prompt-backups/20261106-late-afternoon-20261106T192400375768Z) are preserved. Archived per-image actual prompts, raw PNGs, SHA256 provenance, historical holds/rejections and replaced crop backups remain available per subject. Do not rewrite their lighting history.

## Future generation/import

- Native direct image generation is authorized; no ChatGPT browser sign-in is required. Supply the actual references and archive the exact actual prompt. The original queues remain unchanged; there is no remaining work in the original 43-row resume queue.
- Use [import-native.py](D:/AI/chatgpt-bridge/import-native.py), not the historical cutter alone. **Every future daylight import MUST use `--all-generated-views`**: the old `sheets.py` corner cutter deliberately reuses the original NE export, which may be a night image. The importer overrides that NE with the generated bottom-right cell when the option is set.
- Corner layout: SE SW / NW NE. `--kind axisturn` layout: N E / S W, using the 8-degree geometry guide. Compatible turned crops go to `D:/AI/repaint/out/<id>/turned/`; project copies go to `<id>/turned/<view>.native.png`. Corner/axisturn raw and prompt/provenance versions are independent.

```powershell
python D:/AI/chatgpt-bridge/import-native.py --kind corners --all-generated-views --id "<queue-id>" --source "<generated.png>" --prompt-file "<exact-actual-prompt.txt>" --reference "<actual-reference-1.png>" --reference "<actual-reference-2.png>" --project-root "E:/Repos/CapitalEmpire/.claude/worktrees/art-repaint-20261106"
```

- Repeat `--reference` for actual edit inputs; preserve original queue references separately. Use `--kind axisturn --all-generated-views` for future turned daylight sheets. Never accept a rejected sheet or a geometry hold merely because files exist.
- `native-art-control.json` is intentionally `pause=true`, `state=complete`, `lighting=daytime`, `timeOfDay=late-afternoon`. No native generator is running. A future import may exit 75 after success if the separate pause-after-import flag exists; exit 2 indicates validation rejection. Neither condition warrants deleting saved art.
- Next: owner visual review of the saved candidates; runtime integration is a separate action. Consult [the current art log](../../../docs/NOW.md) before further work.
