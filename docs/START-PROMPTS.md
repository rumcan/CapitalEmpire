# START-PROMPTS: paste one into a fresh chat to get that Claude back to work

The owner (2026-10-26): "make sure all the claudes running at the moment can start new chats at any time we are getting close to our
weekly cap".

Open a new Claude Code chat (desktop app, Code tab) on any account, with the folder the prompt names, and paste the prompt for the role.
Each prompt points to files and GitHub issues that are kept current. Nothing depends on an old chat's history.
**Read the docs from origin/main, never from `E:\Repos\CapitalEmpire` itself:** that checkout sits on an old side branch with an old
CLAUDE.md and NOW.md (2026-10-28: `arena/T026-course-height`).

## The lead (runs everything else)
Folder: `E:\Repos\CapitalEmpire\worktrees\lead-typecheck` (the lead's own worktree).
```
You are the new lead on CapitalEmpire (GitHub rumcan/CapitalEmpire), a 1985 golf events manager game. Your folder is
E:\Repos\CapitalEmpire\worktrees\lead-typecheck. First run `git status` (commit nothing that is not yours), then
`git fetch origin && git checkout -B lead/takeover-<date> origin/main`, and read docs/NOW.md section "START HERE" there and follow it.
```
NOW.md "START HERE" holds everything else: what to read, how to restart the agents and the 5174 auto-updater, the owner's rules, what is in
flight, the queue, and the owner's art that is waiting.

## A coding ticket (one per in-progress issue)
```
You are a developer on CapitalEmpire (E:\Repos\CapitalEmpire, GitHub rumcan/CapitalEmpire), a golf events manager game.
Your ticket is T<nnn>, GitHub issue #<n>. Read the issue and its comments; the last progress comment ends with "To resume". Check out
the branch it names: `git worktree list` shows if a worktree still has it; otherwise
`git -c checkout.workers=1 worktree add .claude/worktrees/t<nnn> <branch>`. Work only in that worktree: read its CLAUDE.md and
docs/AGENT-BRIEF.md (not the main checkout's, which are old). Commit any WIP left there, then carry on.
Follow AGENT-BRIEF's rules (disk, memory, ports, tests, art, PR) and its progress protocol: push and comment on the issue after every
sub-step, ending with "To resume". Open the PR when done; do not merge (the lead merges).
```

Tickets in progress now: see NOW.md "START HERE" (the In flight table); it is the only list kept current.

## Other sessions working in this repo
Each keeps its own handover doc with a start prompt at the top. Paste that prompt into a new chat.
- **The lot lab (lot-preset studio): finished as a separate session (2026-10-26).** Its branch `lot-presets` is on main (#290). Lot
  presets are now made in the one studio, http://192.168.0.2:5191 (Lots tab; the lab at http://localhost:5174/?lotlab&dev), by the owner and
  helpers on the network. Its history: `docs/handovers/lot-presets.md`. Do not start the old 5241/5242 servers again.
- **3D people, golf play and run.world.** This session made the 3D crowd and golfers (PR #238) and golf play (PR #258; its open items
  are under "Status" in `docs/GOLF-PLAY.md`).
  - **Handover:** `docs/HANDOVER-PEOPLE.md` section 0 "START HERE", with the start prompt at the top. It is on branch
    `art/people-ground-20261024` (worktree `E:\Repos\CapitalEmpire\worktrees\people-ground`). It was pushed to GitHub on 2026-10-26 at
    80da0db (the owner approved): `git show origin/art/people-ground-20261024:docs/HANDOVER-PEOPLE.md`.
  - **Batch loop:** a loop makes the last 12 people (`make-cast-loop.sh` in a hidden Git Bash, restarted 2026-10-26 05:37 UTC). It waits
    out RUN's daily cap and dies if the app or PC stops, so a new chat restarts it as the handover says.
- **Nightly regression:** planned as a scheduled task ("CapitalEmpire nightly regression", about 02:00) but **not set up yet**
  (2026-10-28): the last full run was by hand on 2026-10-27 (`E:/ClaudeTemp/nightly/2026-10-27.md`, all green). Its report goes to
  `E:/ClaudeTemp/nightly/<date>.md`.
