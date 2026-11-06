# Native sprite-sheet continuation, 2026-11-06

## State

- Raw generated sheets and exact prompts are versioned per queue ID. Nothing here is owner approved.
- `status.json` records each import; each provenance file records hashes, references and validation.
- Corner cell order: SE SW / NW NE. Axisturn cell order: N E / S W, matching the existing 8-degree geometry guide.
- `--kind axisturn` uses `queue-axisturn.json`, independent `axisturn-vN` archives, compatible crops in `D:/AI/repaint/out/<id>/turned/`, and project copies in `<id>/turned/`.
- Existing `sheets.py` deliberately uses the original export for compatible NE when snap.json says corner. The raw sheet retains all four generated cells. Project `<view>.native.png` copies the actual compatible output.
- Explicit lighting-only variants use `--all-generated-views`: all four crops then come from the generated sheet, preventing an old dusk NE from entering a daytime set. This option does not change other queue prompts.
- Replaced compatible crops are preserved in each subject's `backups/` directory.
- No runtime packaging, builds, commits, pushes, or live-checkout changes performed by the importer.

## Next

1. Inspect the raw sheet and compatible crops visually; automatic checks only reject obvious unusable images.
2. Generate the next pending ID from `D:/AI/chatgpt-bridge/queue-resume-corners-20261106.json`.
3. Save the exact actual generation prompt, then run:

```powershell
python D:/AI/chatgpt-bridge/import-native.py --id "<queue-id>" --source "<generated.png>" --prompt-file "<exact-prompt.txt>" --project-root "E:/Repos/CapitalEmpire/.claude/worktrees/art-repaint-20261106"
```

Exit 2 means the raw was archived but validation rejected import. Preserve it and regenerate. Reimporting identical raw/prompt reuses its version. Historical raw sheets are never overwritten. When `D:/AI/chatgpt-bridge/native-pause-after-import.flag` exists, successful imports exit 75 after safely writing all outputs and status; this is an intentional pause, not an image rejection.
