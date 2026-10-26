# AGENT-BRIEF: how the lead hands a ticket to a coding agent (and how any AI picks the work up again)

The owner (2026-10-26): "make sure all work have docs and constant progress updates to files etc so any AI can open the docs and
distribute work if we move to a diff claude acc. this should get all the ais back to work right after a switch over".

So: **nothing lives only in a chat or a worktree.** Every piece of work is a GitHub issue. Its branch is pushed after every sub-step.
Its issue carries a progress comment after every sub-step. `docs/NOW.md` "START HERE" lists what is in flight and how to resume it.
A new AI on any account reads `CLAUDE.md`, then NOW.md "START HERE", then this file, and can restart every agent within minutes.

## 1. The lead's loop
1. **A ticket = a GitHub issue.**
   - Title: `[T<nnn>] <what>`; take the next number after the highest `[T…]` in `gh issue list --state all`.
   - Labels: `arena`, `status:in-progress`, plus `golf` for course work.
   - Body: the owner's words, quoted, with the date; then **Do:** (the behaviour) and **Checks:** (tests and screenshots).
2. **A worktree per ticket**, made one at a time (several at once can run git out of memory with the 2-3 GB packs):
   - the Agent tool with `isolation: "worktree"` (the agent then runs `git checkout -B arena/T<nnn>-<slug> origin/main`);
   - or by hand: `git -c checkout.workers=1 worktree add -b arena/T<nnn>-<slug> .claude/worktrees/t<nnn>-<slug> origin/main`,
     and tell the agent to work only there.
3. **Brief the agent** with the template in section 3. Fill in the ticket, the files, what is on main that it must not break, who else is
   working where (so no two agents edit the same files), and a free port (section 4). The owner's model rule: range and P24 work runs on
   Opus 5.5 at high effort; other tickets use the default.
4. **Review when it reports.** Check that the PR contains `origin/main` (`git merge-base --is-ancestor origin/main origin/<branch>`) and
   that `gh pr view <n> --json mergeable,mergeStateStatus` reads MERGEABLE CLEAN. Read the diff's risky parts and look at the
   screenshots yourself. Then comment the review on the PR and merge (`gh pr merge <n> --merge`). The owner allows the lead to merge on
   typecheck, the agent's own tests and this review; the full regression runs nightly.
5. **After the merge:**
   - Remove the agent's worktree (`git worktree remove --force -f <path>`; each is about 4.3 GB and E: is small).
   - Send the owner the key before/after screenshots.
   - Update NOW.md "START HERE".
   - Tell any agent still working on neighbouring files to merge main.

## 2. The progress protocol (every agent, every ticket)
After **each sub-step** (cause found, fix in, test written, screenshots taken, PR opened):
1. Commit (`[T<nnn>] WIP: <what>` is fine) and **push** to the ticket's branch.
2. **Comment on the issue** (`gh issue comment <n> --body ...`) with:
   - what is done;
   - what is next;
   - the findings the next agent needs (the root cause, file:line, decisions taken);
   - the paths of the screenshots or sheets.

If a session dies (a power cut, the app quitting, a usage limit, an account switch), the next AI checks out the branch, reads the issue's
last comment, commits any WIP left in the old worktree, and carries on.

## 3. The brief template (copy, fill the <…>)
```
You are a <game / graphics / art-pipeline> developer on CapitalEmpire (GitHub rumcan/CapitalEmpire), a golf events manager game
(Vite + React + TypeScript, WebGL2, ground painting in Web Workers on OffscreenCanvas). Your ticket is **T<nnn>, GitHub issue #<n>**
(`gh issue view <n>`): <one line>. <The owner's words, quoted, with the date.>

## Set up
<Either: "You are in a fresh git worktree that may NOT be based on main: `git fetch origin && git checkout -B arena/T<nnn>-<slug> origin/main`
(retry with `git -c checkout.workers=1` if git runs out of memory)." Or: "Work ONLY in the existing worktree <path> (branch <branch>).">
Then `TEMP=E:/ClaudeTemp TMP=E:/ClaudeTemp npm ci --cache E:/npm-cache --no-audit --no-fund`.
Read `CLAUDE.md`, `docs/AGENT-BRIEF.md` (the rules and the progress protocol), `docs/SECOND-AGENT.md` "Who owns what", and <the plan
sections and files that matter>.

## The job
<What to do, as behaviour. For a bug: reproduce it first, find the root cause, then fix it, with a test that fails before the fix.>

## On main, do not break
<The recent merges that touch the same area.>

## Coordination
<Who else is working, on which files; stay out of them; merge origin/main before the PR.>

## Rules
Follow docs/AGENT-BRIEF.md section 5 (disk, memory, ports, owner files, tests, art, commits, PR) and section 2 (push and comment on
the issue after every sub-step). Your dev server: port <p>. Scratch and screenshots: E:/ClaudeTemp/T<nnn>/.

## Screenshots, into E:/ClaudeTemp/T<nnn>/
<The before and after shots the lead needs, at which zooms.>

## Report back, briefly
The PR URL and final commit; the root cause or what you built, with your decisions; the tests and typecheck results; each screenshot's
full path with one line on what it shows; what is left; confirmation that every server you started is stopped.
```

## 4. Ports and servers
| Port | What | Who may touch it |
| --- | --- | --- |
| 5174 | The owner's game. `.claude/launch.json` configs `lead-game` or `capital-empire`, both serving `worktrees/theme-consistency` (branch `lead/live`). The auto-updater (`bash E:/ClaudeTemp/autoupdate-5174.sh`, log `E:/ClaudeTemp/autoupdate-5174.log`) fast-forwards it to main every minute. **Never serve 5174 from the main checkout**: it sits on an old branch and shows the old three-town start. | The lead only (restart it after a crash) |
| 5191 | The owner's studio (config `studio`) | Nobody but the owner |
| 5186-5189 | Agents' dev servers (`npx vite --port <p> --strictPort`), one port per running agent | The agent that started it; it stops it before reporting |
| 5193 | An agent's studio, when a ticket needs one | Same |
| 5241, 5242 | Another session's lot-presets game and studio | Not ours |

## 5. The owner's rules for every agent
- **Disk:** never write to C:. Set `TEMP`/`TMP` to `E:/ClaudeTemp` and use the npm cache `E:/npm-cache`. Scratch goes in
  `E:/ClaudeTemp/T<nnn>/`. E: is nearly full: make no big files, and clean your scratch when done.
- **Memory:** the PC has 16 GB shared by several Claude sessions. Run one heavy thing at a time (typecheck, tests, a dev server, a
  headless browser), close each headless Edge as soon as its shots are taken, and use `git -c checkout.workers=1` if a checkout fails.
- **Servers:** never touch 5174 or 5191. Stop every server and process you start before you report (stopping a background task can
  leave its vite running: kill it by PID).
- **Owner files:** never commit `lot-presets.json` or `scale-overrides.json` changes you did not make.
- **Tests** run with node's runner on an esbuild bundle, not vitest:
  `npx esbuild tests/a.test.ts --bundle --platform=node --format=esm --loader:.webp=empty --loader:.png=empty --outdir=output/tests-t<nnn> --out-extension:.js=.mjs --log-level=warning && node --test output/tests-t<nnn>/*.mjs`.
  Run `npm run typecheck`, your new tests and the neighbouring tests you touch. Never run the full suite, `npm run build` or the gates:
  the nightly regression does that (scheduled task "CapitalEmpire nightly regression", report in `E:/ClaudeTemp/nightly/<date>.md`,
  failures as `[nightly]` issues).
- **Art:** the sun is at the upper right and shadows fall at 145°. Highlights are masked by the texture and inset from edges; shadows
  are a cool multiply that keeps the texture. No visible repeating texture (mowing stripes excepted, drawn last on top). No old photo
  textures. Nothing mirrored: pictures turn to one of four views. Stand-ins are labelled "Stand In for <name>", and missing art goes
  into `docs/GOLF-SPRITES.md` as requests.
- **Commits** start `[T<nnn>] …` and end with the `Co-Authored-By:` line the session's attribution names.
- **PR:**
  - Before opening it, `git fetch origin && git merge origin/main`, then re-run the typecheck and your tests.
  - Push, then open a PR to main titled `[T<nnn>] …` with "Closes #<n>" in the body. For a bug, the body gives the root cause.
  - End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - Do not merge; the lead merges.

## 6. After a switch-over or a crash (the checklist)
1. Read `CLAUDE.md`, then `docs/NOW.md` "START HERE", then this file.
2. Restart the 5174 auto-updater and, if 5174 is down, the `lead-game` server (section 4).
3. Read the latest nightly report and any open `[nightly]` issue; real failures come first.
4. `gh issue list --label status:in-progress`. For each ticket:
   - read its last progress comment;
   - `git worktree list` shows whether its worktree still exists; if it has uncommitted work, commit it as WIP and push;
   - start an agent on it with section 3's template, pointing at the branch and the issue's last comment.
5. Then carry on with NOW.md's queue.
