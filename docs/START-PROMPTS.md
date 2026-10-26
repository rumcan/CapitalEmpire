# START-PROMPTS: paste one into a fresh chat to get that Claude back to work

The owner (2026-10-26): "make sure all the claudes running at the moment can start new chats at any time we are getting close to our
weekly cap".

Open a new Claude Code chat (desktop app, Code tab) with the folder `E:\Repos\CapitalEmpire`, on any account, and paste the prompt for
the role. Each prompt points to files and GitHub issues that are kept current. Nothing depends on an old chat's history.

## The lead (runs everything else)
```
You are the lead on CapitalEmpire (E:\Repos\CapitalEmpire, GitHub rumcan/CapitalEmpire), a golf events manager game.
Read CLAUDE.md, then docs/NOW.md section "START HERE", then docs/AGENT-BRIEF.md. Then:
1. Restart the 5174 auto-updater in the background: bash E:/ClaudeTemp/autoupdate-5174.sh. If http://localhost:5174 is down, start the
   .claude/launch.json config "lead-game" (it must serve worktrees/theme-consistency, never the main checkout).
2. Read the newest report in E:/ClaudeTemp/nightly/ and any open [nightly] issue; fix real failures first.
3. Resume every in-progress ticket (gh issue list --label status:in-progress). For each: read the issue's last progress comment
   ("To resume"), commit any WIP left in its worktree (git worktree list), and start an agent on its branch with AGENT-BRIEF's template.
4. Review and merge finished PRs (AGENT-BRIEF section 1), remove merged worktrees, keep NOW.md "START HERE" current after every merge
   or dispatch, and send me the screenshots.
5. Then work NOW.md's queue in order.
Delegate the coding to agents, test only the touched code by day (the full regression runs nightly), merge on typecheck, the agent's own
tests and your review, and keep me posted with screenshots. I test on http://localhost:5174.
```

## A coding ticket (one per in-progress issue)
```
You are a developer on CapitalEmpire (E:\Repos\CapitalEmpire, GitHub rumcan/CapitalEmpire), a golf events manager game.
Your ticket is T<nnn>, GitHub issue #<n>. Read CLAUDE.md and docs/AGENT-BRIEF.md, then the issue and its comments; the last
progress comment ends with "To resume". Check out the branch it names: `git worktree list` shows if a worktree still has it; otherwise
`git -c checkout.workers=1 worktree add .claude/worktrees/t<nnn> <branch>`. Commit any WIP left there, then carry on.
Follow AGENT-BRIEF's rules (disk, memory, ports, tests, art, PR) and its progress protocol: push and comment on the issue after every
sub-step, ending with "To resume". Open the PR when done; do not merge (the lead merges).
```

Tickets in progress now: see NOW.md "START HERE" (the In flight table); it is the only list kept current.

## Other sessions working in this repo
Each keeps its own handover doc with a start prompt at the top. Paste that prompt into a new chat.
- **The lot lab (lot-preset studio).** Its start prompt (the owner, 2026-10-26; it supersedes older ones), paste as is:
  ```
  You are the lot lab session on CapitalEmpire (the lot-preset studio, separate from the lead's work).
  - Worktree E:\Repos\CapitalEmpire\.claude\worktrees\lot-presets, branch lot-presets (never the main checkout). Git there needs
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*.
  - Handover: docs/handovers/lot-presets.md in that worktree (read its "Now" section, starting "At the account switch"), then
    docs/plans/P20.md section "The lot lab".
  - Servers (keep them up for the owner): game http://localhost:5241, studio http://127.0.0.1:5242 (also http://192.168.0.2:5242 on the
    network for helpers), .claude/launch.json configs lot-presets-game and lot-presets-studio. They are not the lead's 5174/5191.
  - Next: (1) check the studio Rebuild finished: GET http://127.0.0.1:5242/api/status (never POST /api/rebuild to poll); check the
    Library pictures match their cards. (2) Finish the stand-in packing fix in scripts/assets/prep-sprites.mjs (old houses such as
    variation:world-house_0-north-1dde6f56-plain:1 are drawn as four-view stand-ins; pack each stand-in for the largest size any
    house drawn as it needs); check git diff for unfinished work. (3) Rebuild game sprites, then check resized houses in the lab
    (http://localhost:5241/?lotlab&dev) with the Person cursor.
  - The branch's newest commits (up to 309d68a) are local only; origin has 51643a7. Push them when the owner says so; no PR yet. Do not
    merge lot-presets into main without the owner's review.
  ```
- **3D people, golf play and run.world.** This session made the 3D crowd and golfers (PR #238) and golf play (PR #258; its open items
  are under "Status" in `docs/GOLF-PLAY.md`).
  - **Handover:** `docs/HANDOVER-PEOPLE.md` section 0 "START HERE", with the start prompt at the top. It is on branch
    `art/people-ground-20261024` (worktree `E:\Repos\CapitalEmpire\worktrees\people-ground`). It was pushed to GitHub on 2026-10-26 at
    80da0db (the owner approved): `git show origin/art/people-ground-20261024:docs/HANDOVER-PEOPLE.md`.
  - **Batch loop:** a loop makes the last 12 people (`make-cast-loop.sh` in a hidden Git Bash, restarted 2026-10-26 05:37 UTC). It waits
    out RUN's daily cap and dies if the app or PC stops, so a new chat restarts it as the handover says.
- **Nightly regression:** a scheduled task ("CapitalEmpire nightly regression", about 02:06). It needs no prompt, but it needs its
  commands allowed so it can run unattended. Its report goes to `E:/ClaudeTemp/nightly/<date>.md`.
