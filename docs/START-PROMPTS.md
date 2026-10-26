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

Tickets in progress now (see NOW.md "START HERE" for the current list):
- **T140** #270 Town roads: the kerb face across chunk borders (branch `arena/T140-road-kerb`, dev port 5189).
- **T141** #271 Every prop's shadow made for the top-right sun (branch `arena/T141-prop-shadows`, dev port 5186; the findings in
  `docs/art/SHADOW-AUDIT.md` on that branch).

## Other sessions working in this repo
Each keeps its own handover doc with a start prompt at the top. Paste that prompt into a new chat.
- **Studio lot-preset editor** (branch `lot-presets`, worktree `E:\Repos\CapitalEmpire\.claude\worktrees\lot-presets`, game on 5241,
  studio on 5242; launch.json configs `lot-presets-game` and `lot-presets-studio`). Its handover is
  `docs/handovers/lot-presets.md` in that worktree, with the start prompt at the top (WIP commit 62d1322). As of 2026-10-26 it is
  **committed locally only**: the session asks the owner before pushing. Until it is pushed, open the doc from that worktree on this PC.
- **3D spectators and run.world** (the 3D people and crowd art): `docs/HANDOVER-PEOPLE.md`, then `docs/SPECTATOR-ART.md`. Asked on
  2026-10-26 to refresh it with a start prompt.
- **Nightly regression:** a scheduled task ("CapitalEmpire nightly regression", about 02:06). It needs no prompt, but it needs its
  commands allowed so it can run unattended. Its report goes to `E:/ClaudeTemp/nightly/<date>.md`.
