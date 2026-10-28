# Continuous golf artwork worker (T250)

The supervisor refreshes the live Markdown every tick, inventories actual hashed originals in both checkouts, and claims one bounded batch. It keeps generated, appearance-reviewed, registered and merged states separate. Raw presence suppresses duplicate generation; pending originals receive a review checkpoint once per exact source hash. A primary appearance decision may be a hash-bound sibling `.appearance.json`, preserving the original generator provenance.

Current dispatch is Codex's A two-view sheets. RUN-owned B/C/P work is not claimed. D/R direction subjobs and unclassified entries remain visible as pending planning; this first version does not execute D/R. It never reports the entire catalogue complete just because its dispatch queue is empty. Parent review/integration is a separate handoff; the worker cannot merge runtime changes.

Only the supported VS Code bundled Codex binary is discovered. It orchestrates the built-in `image_gen.imagegen`, with true alpha and the owner's two style references. No API/SDK/script image-generation fallback exists. Initial execution stores a new dedicated thread UUID; every later turn resumes precisely that UUID. The interactive parent's thread is forbidden.

An actual outer usage error or the worker's structured **actual tool** quota checkpoint persists a UTC `notBeforeUtc` five hours later. Other failures require attention and are retried only when relevant live instructions change or an operator explicitly uses `--retry-errors`. A completed outer CLI turn does not hide a tool quota error. Quota words in prompts never start backoff. A file lock covers the complete child lifetime; active/orphan worker PIDs block another launch.

Configuration and all large state/logs live under `E:/ClaudeTemp/continuous-art/`. `queue.json` exposes authority SHA, per-item source SHA, raw artifact SHA, appearance state, owners and pending direction plans. `state.json` exposes the dedicated UUID, PID/heartbeat, last checkpoint/error and retry time. Each `batches/<UTC>/` preserves exact authority, prompt, JSONL output and checkpoint.

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
