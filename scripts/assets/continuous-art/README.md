# Continuous golf artwork worker (T250 / T258)

The supervisor refreshes the live Markdown every tick, inventories actual hashed originals in both checkouts, and claims one bounded batch. It keeps generated, appearance-reviewed, registered and merged states separate. Raw presence suppresses duplicate generation; pending originals receive a review checkpoint once per exact source hash. A primary appearance decision may be a hash-bound sibling `.appearance.json`, preserving the original generator provenance.

All 2D families are planned and generated with the built-in ChatGPT image generator; RUN/Meshy is for 3D only. The live linked paste-ready queue takes priority, including item 180. Numbered headings with status marks, numeric table rows, inherited S/Q/P image types and grouped greenkeeping sections stay visible. Status claims never prove a whole multi-image family delivered. Parent review/integration is separate; the image worker cannot merge runtime changes.

Only the supported VS Code bundled Codex binary is discovered. It orchestrates the built-in `image_gen.imagegen`, with true alpha and the owner's two style references. No API/SDK/script image-generation fallback exists. Initial execution stores a new dedicated thread UUID; every later turn resumes precisely that UUID. The interactive parent's thread is forbidden.

An actual outer usage error or the worker's structured **actual tool** quota checkpoint persists a UTC `notBeforeUtc` five hours later. A strictly valid terminal checkpoint survives an outer stream disconnect. An actual transient network failure without a valid terminal checkpoint retries after five minutes; auth/capability/malformed failures still need attention. The five-hour quota delay takes precedence and is never cleared by `--retry-errors` or a source refresh. A completed outer CLI turn does not hide a tool quota error. Quota words in prompts never start backoff. A file lock covers the complete child lifetime; active/orphan worker PIDs block another launch.

Configuration and all large state/logs live under `E:/ClaudeTemp/continuous-art/`. `queue.json` exposes authority SHA, per-item source SHA, raw artifact SHA, appearance state, owners and pending direction plans. `state.json` exposes the dedicated UUID, PID/heartbeat, last checkpoint/error and retry time. Each `batches/<UTC>/` preserves exact authority, prompt, JSONL output and checkpoint.

## Durable plans and source authority

Each tick re-reads and hashes the catalogue and linked ChatGPT queue/ground method. The root continuous handover and its exact linked job briefs are read too. Only an explicitly queued continuousPlanOverride:true correction can replace an old linked target; no highest-version picking. The first live queue priority and its ordering win over the historical pilot preference. A changed source invalidates its old plan before another image is generated. A planning turn writes a strict source-bound checkpoint, without generating. The supervisor validates and atomically saves a hash-bound envelope under `plans/<item-key-hash>.json`. The next tick dispatches exactly one pending subjob, with its own key, ID, absolute versioned PNG path, prompt, camera/background, references and dependencies. Existing thread/state and legacy checkpoints are retained; `planning:false` exists only for legacy compatibility checks.

A deliverable that exists only in a configured live inventory root is copied to its exact main-root relative path using exclusive, hash-verified writes and unchanged provenance. Already accepted hash-bound native exports can also supply newly requested separate-view filenames: validate original/source-provenance/export/crop hashes and exact decoded sourceRect pixels, copy native bytes unchanged, and write honest derived provenance with builtinImagegenUsed:false. No midpoint guessing, unseen views, resampling or image call. Local reuse gets a durable checkpoint and preserves any active quota deadline.

An existing exact output is preserved, whether accepted, raw, held or corrupt; it is never repainted just because the group has more work. Remaining colours/facings/stages continue independently. Held/rejected prior images do not unlock dependent jobs. Explicit corrections bind the old file/hash/reason and write a separate new version. A held source can be an explicit correction identity reference, not a normal unblocked dependency. Real scene edits use the preceding image; ground uses the linked scene-first three-band method. Isolated sprites/decal/person sources use native alpha, while scenes/portraits/ground remain opaque. Planned generator prompts cannot contain positive old magenta background instructions or ground scale-trigger words.

No linked required output may disappear from a plan. Genuine deferrals/ambiguities need a current exact source quote/hash and stay visible; already-covered additionally needs real inventory PNG/hash evidence. Subjob reservations match an exact key/output: reserving `180a-run` cannot reserve corners, boulders or planting. Raw completion is never appearance acceptance, registration, main integration or whole-catalogue completion.

The worker writes only its one exact PNG, sibling provenance and batch checkpoint. New subjob checkpoints bind source fingerprint, plan hash, job key, exact ID, decoded PNG/hash and alpha/opaque contract. The frozen source bundle retains original legacy wording; each job's effective generation prompt must follow the newer owner rules.

## Run and operate

Review `config.example.json`, write an absolute-path `config.json`, and run a dry tick first:

```powershell
node scripts/assets/continuous-art/supervisor.mjs --config E:/ClaudeTemp/continuous-art/config.json --dry-run
node scripts/assets/continuous-art/supervisor.mjs --config E:/ClaudeTemp/continuous-art/config.json
```

After code review and a successful real built-in image generation/resume, install the five-minute Windows task:

```powershell
powershell -NoProfile -File scripts/assets/continuous-art/manage-task.ps1 -Action Install
powershell -NoProfile -File scripts/assets/continuous-art/manage-task.ps1 -Action Start
```

Installation copies reviewed modules, wrapper and manager into an immutable hash-recorded `E:/ClaudeTemp/continuous-art/program/<revision>/`. The scheduled action references that stable snapshot, never the temporary source checkout. It uses the recorded Node executable and root's existing Sharp dependency via a junction, without an install or dependency copy. Keep the configured dedicated worker checkout while active; moving/removing it requires updating `config.worktree` first. Do not delete the worker thread/state to restart a batch. The task requests wake from sleep and runs missed ticks when available; the PC must be powered on/wake-capable and the user's authenticated account/session must be available. It cannot run while the machine is shut down or bypass expired sign-in. Launcher-level module/config errors are saved under `launcher/` even when supervisor startup fails.

Use the deployed manager path recorded in `installation.json`:

```powershell
$program=(Get-Content E:/ClaudeTemp/continuous-art/installation.json -Raw | ConvertFrom-Json).program
powershell -NoProfile -File "$program/manage-task.ps1" -Action Status
powershell -NoProfile -File "$program/manage-task.ps1" -Action Stop
powershell -NoProfile -File "$program/manage-task.ps1" -Action Start
```

Stop writes a durable STOP marker, disables only this named task and terminates only lock-owned PIDs whose command line matches the dedicated supervisor/worker. It never scans/kills unrelated Codex or owner server processes. Start removes the marker and enables/starts this task. Technical errors remain visible; inspect before `--retry-errors`. Existing live reservations can be updated in `reservations.json` without modifying the program. A new live source hash is noticed even while quota backoff prevents model calls.

## Checks and pilot

Run `node scripts/assets/continuous-art/supervisor.test.mjs` for serialized tiny fake workers, not model calls. The independent 19-case review covered completed-turn tool quota, fake quota text, strict PNG/hash/id/tool validation, live-only existing originals, once-per-hash review, locks and owned child cleanup.

2026-10-28 real pilot: dedicated thread `01a18192-f90b-7083-9bae-71e492fa53cc` generated `golf:range-coffee-kiosk` through the built-in tool. Exact copied PNG SHA256 `5241862da793f431fefae6851c6ba0fd4f947694bc0894b367c658b1f34b6e38`; primary appearance accepted separately. This proves generation, not geometry calibration or game/main integration. The actual batch logs remain under `E:/ClaudeTemp/continuous-art/`.
