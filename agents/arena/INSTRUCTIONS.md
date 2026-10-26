# Arena Agent Instructions — Capital Empire (`rumcan/CapitalEmpire`)

You are an **Arena coding agent** working on **Capital Empire** (`https://github.com/rumcan/CapitalEmpire`), a golf course and tournament traffic management game built with Vite + React + TypeScript (strict), WebGL2 rendering, Web Worker traffic/town simulation, and OffscreenCanvas ground painting.

Every ticket is written so you can complete it **mechanically and without guessing design**. You have both **GitHub** and **Google Drive** connected (shared folder `Capital Empire - Argon`, ID `11pAG2rlxViL4bby-cUapecWmP43gv7hC`). Follow the rules below to the letter.

**Stop what you started when you are done (the owner, 2026-10-25).** Before you post your FINAL PUSH or go idle, stop every server and
background process you started: dev servers, `vite preview`, static servers, test and build runs, headless browsers and watch loops, and
the processes behind them. Never leave one idling. The owner's own servers (the game on 5174, the studio on 5191) are theirs. The full
rule is in `CLAUDE.md`.

---

## 1. Taking a Ticket (GitHub Issues + Drive Queue)

1. **Tickets are GitHub issues** labelled `arena` (plus `status:open` / `status:in-progress` / `status:in-review` / `status:done` and an area label: `ui`, `roads`, `course`, `terrain`), mirrored in Google Drive as `TICKET-T0xx-*.md` inside `Capital Empire - Argon` (`11pAG2rlxViL4bby-cUapecWmP43gv7hC`).

2. If the GitHub issue for your assigned `TICKET-T0xx-*.md` does not exist yet on `rumcan/CapitalEmpire`, create it first from the ticket markdown:

   ```bash

   gh issue create --title "[T0xx] <title>" --label "arena,status:open,<area>" --body-file <ticket-file>

3. Take the open issue #<n>, comment "Taking this" on it, and switch its label to status:in-progress:

gh issue comment <n> --body "Taking this"

gh issue edit <n> --remove-label "status:open" --add-label "status:in-progress"

________________

2. Branch and Draft PR at Once
1. Branch from main as arena/<ticket-id>-<short-slug> (for example, arena/T018-ghost-preview):

git fetch origin

git checkout -b arena/<ticket-id>-<short-slug> origin/main

npm ci

2. Make a first commit within the first few minutes (even a stub), push it, and open a draft PR immediately titled [<ticket-id>] <title>, body from agents/arena/PR_TEMPLATE.md, linking the issue (Closes #<n>):

git add <files>

git commit -m "[<ticket-id>] initial stub"

git push -u origin arena/<ticket-id>-<short-slug>

gh pr create --draft --base main --head arena/<ticket-id>-<short-slug> \

  --title "[<ticket-id>] <title>" \

  --body-file agents/arena/PR_TEMPLATE.md

________________

3. Push the Whole Time
1. Commit and push after every meaningful step (each file, each passing test, at least every 15–20 minutes of work).
2. Never sit on unpushed work; never squash everything into one push at the end. The reviewer reads progress from the pushes.

________________

4. Checks Before Every Push
1. Before every push, run:

npm run typecheck

npm test

(the whole suite).

2. If a test fails that the ticket did not expect, say so in a PR comment with the output; do not "fix" unrelated tests.

________________

5. The Final Push Comment & Drive Status Sync
When the ticket is complete:

1. Mark the PR ready for review (gh pr ready <pr-number>) and switch the issue label to status:in-review.
2. Post a PR comment exactly like:

FINAL PUSH <short sha> — ready for review. typecheck: pass. npm test: <passed>/<total>. Notes: <anything unsure>

3. Write PR-<ticket-id>-STATUS.md to Google Drive (in Capital Empire - Argon, ID 11pAG2rlxViL4bby-cUapecWmP43gv7hC) containing:
   * Your FINAL PUSH <short sha> line, PR number, and Issue number
   * Exact output of npm run typecheck and npm test
   * Full git diff origin/main...HEAD This allows the reviewer in Gemini to inspect your exact diff and test output directly from Drive.

________________

6. The 20-Minute Review Loop (GitHub PR + Drive Review File)
1. After the FINAL PUSH comment, check for review feedback every 20 minutes (for example sleep 1200 then gh pr view <n> --comments and search Google Drive for REVIEW-<ticket-id>), for at least 3 hours.
2. When the reviewer asks for changes (either via a GitHub PR review comment or a REVIEW-<ticket-id>.md file in Google Drive with VERDICT: CHANGES_REQUESTED):
   * Make exactly those numbered changes.
   * Run npm run typecheck and npm test.
   * Push to your branch.
   * Post a new FINAL PUSH <sha> comment on the PR listing each requested change and how it was done, and update PR-<ticket-id>-STATUS.md in Google Drive with the new SHA and diff.
   * Start the 20-minute loop again.
3. Stop only when the PR is approved (VERDICT: APPROVED / GitHub PR approved) or merged. Never merge a PR yourself.

________________

7. Existing Repository Rules (Always Enforced)
* No pushes to main and never merge a PR yourself.
* No edits to docs/, CLAUDE.md, AGENTS.md, .claude/, agents/, or scripts/worker/.
* Files outside the ticket's "Files you may touch" list are strictly off limits.
* No new npm dependencies (package.json and package-lock.json are off limits).
* Deterministic code only: use mulberry from src/game/iso.ts; never use Math.random() or Date.now().
* Style & performance: include a /** ... */ JSDoc comment with units (tiles of 2 m, sim s, m/s, $) on every export; keep per-step loops allocation-free; never add a manual "rebuild ground" step.
