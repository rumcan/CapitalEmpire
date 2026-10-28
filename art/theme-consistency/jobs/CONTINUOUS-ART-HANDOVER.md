# Continuous golf artwork — resume checkpoint, 2026-10-28

Owner request: keep making the artwork in the constantly updated `worktrees/theme-consistency/docs/GOLF-ART-LIST.md`; on a genuine usage limit, save progress and retry five hours later until all required artwork is made. Keep accepted work on main and in the game/Studio. Never regenerate a finished item merely to restart the queue.

**Latest direct owner instruction, 2026-10-28:** this built-in generator supports transparency, so request **true transparent PNGs** with `transparent_background: true` for sprites. Do not request magenta for new built-in generations. Magenta is only for generators that cannot produce alpha. This owner instruction overrides the live list's shared magenta block for our built-in generator. Preserve existing valid alpha art. The dispenser and yardage board were already started on magenta before this clarification: retain their exact raw takes/provenance and key them once if otherwise good; do not regenerate them just to change format.

**Additional owner reference, 2026-10-28:** include `art/theme-consistency/references/golf-country-club-owner-20261028.png` (original attachment, 1725 x 912, SHA256 `14060410b73fd9f0215c2814049119d2390e4830a614e6bf9d8dfd02b8e674df`) as a supporting style reference alongside `theme-authoritative.png`, before any geometry-only guide. It illustrates the desired golf turf, planting, rocks, architecture and warm town lighting. Keep the fixed game projection and screen-upper-right light; do not copy its interface, scenery or background into isolated sprites. Native PNG and origin metadata are saved in `references/` for unattended runs.

## Read live authority on every batch

The live list takes precedence over historical job files. As of this checkpoint **A means TWO separately drawn views** (front+right and left+front), A8 is retired. Codex owns A sheets. RUN owns ground, top-down, single-view and person work; inspect its progress before taking another role's unfinished item. Existing reviewed four-view art stays valid. Do not silently destroy useful completed directions.

Read current live `docs/LEAD.md`, `docs/NOW.md`, `CLAUDE.md`, `docs/AGENT-BRIEF.md`, `docs/GOLF-ART-LIST.md` and, for ground work, `docs/art/GROUND-TEXTURE-METHOD.md`. Source Markdown changes while work runs. Re-read it before claiming a new item and preserve its hash alongside each batch.

Use the imagegen skill and **built-in `image_gen.imagegen`**. No API key, Python image generation script, model substitution or account switching. The installed npm `codex` 0.98.0 fails with the current model; the VS Code bundled `bin/windows-x86_64/codex.exe` 0.164.0-alpha.11.1 successfully answered a read-only probe reporting its built-in imagegen tool. This is an orchestration runner, not the API image-generation fallback. Validate a real generated asset before claiming unattended generation works.

## Workspace boundaries

- Generate project source artwork into `E:/Repos/CapitalEmpire/art/theme-consistency/generated/` with raw source and exact provenance. Copy built-in output there immediately.
- The root checkout is another AI's old arena branch: do not switch, reset, stage wholesale or edit root runtime files.
- Code and source delivery use their own ticket branches/worktrees, reviewed PRs, then main. Owner-selected artwork, surface mappings, lot presets and scale overrides are authoritative; preserve them.
- Owner servers 5174 and 5191 in `worktrees/theme-consistency` must stay untouched. Never serve root on 5174. Temporary check servers must be stopped afterward.
- Scratch/logs belong on E:, not C:. One heavy check at a time. No full suite/build; typecheck is the current merge gate.

## Do not duplicate these completed batches

- Six accepted ground families in root `generated/ground/eight-tiles/READY-MATERIALS.json`: golden-fescue, lake, sand-ripples, long-grass, putting-green and fringe. Read canonical selections, not the highest version. Many newer RUN/owner families are also on main: use the live list and actual packed manifests before deciding anything is missing.
- Root parking-garage diagonal canonical selections: 2/3/4/6-storey `-4views-v3`, 5-storey `-4views-v2`. Twenty real diagonal images passed primary visual review. Their authored axis art is retained. Main source copies alone do not prove runtime IDs are integrated.
- Four accepted diagonal shrub sheets: sage-round, deep-green and hydrangea-pale `-4views-v1`, golden-russet `-4views-v2`; 16 diagonal views.
- Nine raw native-alpha palms are saved in `generated/trees/golf-practice-palm-{windmill,date,dwarf-fan}-{01,02,03}-1view-v1.png` plus provenance. Started before the latest magenta rule. Review existing alpha/style and registration before generating any more of these. Raw presence is not library registration.
- Three new two-view range props are saved in `generated/props/`: `golf-range-ball-dispenser-2views-v1`, `golf-range-yardage-board-2views-v1`, and `golf-range-sign-2views-v1`. The first two retain original magenta `.raw.png` takes and separate keyed `.alpha.png`, native crops and provenance. The range sign is a native transparent PNG, made using the additional country-club reference; its decoded size is 1774 x 887, with two 887-square native halves. Primary style/alpha/real-turn appearance passes are separately hash-bound; geometry and physical edge calibration remain pending. Do not regenerate these subjects merely because they are not registered yet.
- Flower beds: canonical v1 is BLOCKED for angle defects. V3 targeted SE singles now measure Daisy 1.85°, Lavender 1.62°, Marigold 2.68° and are candidates to retain. Only Daisy SW (3.51°) and Marigold SW (4.41°) still need correction. **Old prompts contain contradictory horizontal/vertical and no-diamond instructions. Never copy those details into new prompts.** Write fresh species descriptions and use the diagonal guide geometry. Keep all old raw takes.

## Integration work already in flight

1. **T183 issue #459, PR #582 MERGED**: `1c72936dc24daf4bcae166f8204a3a17e94745c6`. Shared extra-view append pipeline for five garages plus four shrubs, preserving owner base IDs. Typecheck, 15 focused checks and actual-engine/Studio proofs passed. No second implementation needed. Temporary servers stopped.
2. **T217 issue #569, PR #726 MERGED**: `9381b909e01d729010e99cdb58e41f21c23c3e1f`. Scoped prep CLI `--only fringe,putting-green-finished`, all owner mappings preserved, complete accepted green family selectable. Typecheck and 24 focused checks passed. Mature-sod game/Studio proofs are committed under `art/theme-consistency/reviews/T217-green-fringe/`. Existing MID chunk artifacts and inherited detail-band coverage are documented; this import does not claim those renderer problems fixed. Temporary servers stopped and finished T217 worktree removed.
3. **PR #486 already merged**, merge `d90451b242a7aa9c6f0d3af027ed9c7f6bc65e43`: accepted terrain source closure. Do not redo it.

## Durable worker contract

Keep generated / visual-review-ready / library-integrated / merged-on-main states separate. A file existing, a list emoji, a generic provenance ID or an agent's claim alone cannot advance all four states. Check exact IDs, directions, hashes and actual library registrations. Queue pending reviews/integration before spending on a duplicate.

Single worker lock; checkpoint after every image and before tool retries. On a real usage-limit response, set a persisted UTC not-before at least five hours after that failure. Do not treat a prompt containing the words 'usage limit' as an actual failure. Technical/auth/capability errors need their own visible status, not a fake successful wake-up. Never use `resume --last`: store and resume only the dedicated worker thread, never an unrelated/active interactive thread.

When no work remains, stop image generation. Keep a cheap list-hash watcher so a later live-list addition becomes new work without regenerating completed art. Respect stop/cancel instructions and expose how to disable the task. A background worker requested by the owner may stay active; unrelated temporary servers may not.
