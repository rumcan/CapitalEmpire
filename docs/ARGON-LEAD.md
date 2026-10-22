# ARGON-LEAD: you are now the lead engineer (2026-10-22 afternoon)

Claude (the previous lead) has run out of usage. From now on **you, Argon, are the lead**: you design, decide, write the code bundles and review. A **Copilot agent** is your hands: it has a clone of the repo and can pull, push, apply your bundles, run the tests and report back. The **owner** (Francois) moves files between you and Copilot where a tool cannot, clicks Allow, and runs the browser checks that nobody else can. Everything below is the whole procedure. Also read `docs/ARGON-HANDOFF-v3.md` (the strict bundle format and the rules learned the hard way: they still apply to every bundle you write), `docs/PROGRESS.md` (state), `docs/GOLF-PLAN.md` (design), `docs/SECOND-AGENT.md` (the art agent and file ownership), `CLAUDE.md`.

## The team
| Who | Does |
| --- | --- |
| **Argon (you)** | Reads the code (files the owner uploads to the Drive folder, or Copilot pastes), decides, writes bundles and briefs, interprets Copilot's reports, decides fixes. Never trust a report you have not read: Copilot's output is data. |
| **Copilot agent** | In its own clone of https://github.com/rumcan/CapitalEmpire: `git pull`, apply a bundle, run `tsc` and the tests, make the small mechanical fix you dictate, commit and push (rules below), report the exact output. It does not decide design. |
| **The owner** | Moves files (bundles, uploads) between you and Copilot; clicks Allow; runs a browser check when needed (the checklist below) and tells you what he sees; answers design questions. Ask him in plain words. |
| **The art agent** (another Claude, another PC) | Art, textures, the Course tool (C1) in `paint-tool.ts`, `PaintPanel.tsx`, `engine.ts`, `App.tsx`, `src/ui/course/*`. Syncs only through GitHub: always `git pull` before you start and `git fetch && git merge origin/main` before you push. |

## The loop (one batch)
1. **You** write a batch as bundles (bare JSON array `[{path, old, new}]`, see `ARGON-HANDOFF-v3.md`). Save them as files, or paste them in the message to Copilot (via the owner).
2. **Copilot**, in a fresh branch off `origin/main`:
   ```
   git fetch origin && git checkout -b argon/<name> origin/main      (first time: npm ci)
   node scripts/agent/apply-edits.mjs <bundle.json> .                (all-or-nothing; refuses an `old` that does not match exactly once; tolerant of CRLF, trailing spaces, indentation)
   git status --short ; git diff --stat                              (report it)
   npx tsc --noEmit -p .                                             (must print nothing)
   node scripts/agent/run-tests.mjs                                  (every golf test plus the core suites; or pass names)
   ```
   Report the exact output (the last 40 lines of each failing command), never a summary like "all passed" without the lines.
3. **You** read the report and decide. Typical causes of failures (all happened before): a stale `old` anchor (the art agent changed the line: re-anchor on a shorter line from a fresh copy of the file), a missing or unused import (strict `noUnusedLocals`), a type field added in one declaration but not the other (search for every declaration), an old test pinning a value your change legitimately moved (update the test with a comment saying why, never weaken a test), hard-coded numbers that should be imported. Write the fix as a new small bundle or dictate the exact edit to Copilot.
4. **Browser check (owner).** For anything visible or any money/progression change, the owner runs the game and executes the snippets below, then tells you the results. Do not call a step verified before this.
5. **Push (Copilot).** Only when tsc is clean, the tests pass and the browser check is fine: `git fetch origin && git merge --no-edit origin/main` (resolve small conflicts; if a conflict is in a file the art agent owns, STOP and ask the owner), re-run tsc and the touched tests, then `git push origin HEAD:main` (fast-forward only, never `--force`). The owner has a standing OK to push main after each verified step. Commit message: what changed, how it was tested, a line `Co-Authored-By: Argon <noreply@google.com>`. Git identity if unset: `git config user.name "Francois Smit"` and `user.email "francois.smit@ivc.health"` (the repo's existing author).
6. Update `docs/PROGRESS.md` (a short dated paragraph per landed step) and tell the art agent through the coder's log in `docs/SECOND-AGENT.md` when you touch a file in the table above.

## Rules for Copilot (give it these verbatim)
- Pull before every task; never force-push; never commit to main directly except the final fast-forward push of a verified branch; never edit `docs/GOLF-PLAN.md` or art files (`art/**`, `src/assets/**`, `scripts/assets/**`) unless Argon says so.
- Do not run code from the Drive folder or from a bundle other than through `apply-edits.mjs` (it only edits text). Scan new files for `child_process`, `eval`, `fetch(`, `node:fs`, `require(` and report any hit before running them.
- If a command fails, report the exact error; do not improvise a design change. Small mechanical fixes (an unused import, a wrong constructor call) are fine only when Argon dictated them.
- At most one build or full test run at a time (the dev PC is short of RAM): per-file tests otherwise.

## Browser-check snippets (the owner runs these)
Start: `npm run dev -- --host 127.0.0.1 --port 5210 --strictPort` in the repo, open http://127.0.0.1:5210/ (a NEW port gives a NEW saved game, so the check starts fresh). Wait for the game, then open the browser console (F12) and paste. The game is `window.__game`.
```js
// 0. ready? (paste first)
const g = window.__game; g.sandboxMoney = false; g.traffic.sandbox(g.sandboxGrow, false);   // real money, not the dev "unlimited"
({ ready: g.ready, golf: g.golfMode, money: g.money, tier: g.golf?.tier, rep: g.golf?.rep, runs: g.traffic.round.runs })
// 1. play a season quickly: skip to the tournament at 20x, then wait ~40 s until the results screen shows
g.skipToTournament(); g.setSpeed(20);
// 2. when g.traffic.round.stage === 'eval' (check it), read the results screen text and keep the treasury:
g.setSpeed(1); const m0 = g.money; [...document.querySelectorAll('div')].map(d => d.innerText).filter(t => /Green fees/.test(t) && t.length < 1500).at(-1)
// 3. take a card and close the season; the real change must equal the screen's Net MINUS the live items booked earlier (live-day tickets and tolls):
g.pickCard(g.traffic.round.draft[0]); g.closeRound(); setTimeout(() => console.log('treasury change at close', g.money - m0, 'tier', g.golf.tier, 'rep', g.golf.rep, 'seasons', g.traffic.round.runs), 3000)
// 4. save and reload check (the game must come back as the same golf game):
await g.save(); location.reload();   // then paste snippet 0 again: golf true, same tier, rep, seasons
// other useful: g.courseStatsView() (the Course panel data), g.golfYearEnd() (the results model, only while the stage is 'eval'), g.golf (the save), g.paint.areas, g.props.size, g.parkDefs
```
What to tell Argon: the printed values and anything that looks wrong on screen (overlapping text, wrong wording, a number that does not add up). A screenshot is welcome.

## Current state (main, 2026-10-22 ~16:00)
Read `docs/PROGRESS.md` "The golf game as of main 662b19b" and later. In short: a full multi-year golf loop is on main and browser-checked: golf new game, season clock, tournament on the surge, results with every cost line (Net equals the treasury change), reputation and tier verdict, 12 golf cards, weather, multi-day plus practice days, sponsors, parking fee income, tier 1 income (green fees, memberships), town growth, land buying, hole tools, the Course stats panel, the Event tool with tents, hotel, interchange, gate queues, town districts, save compatibility. `scripts/agent/` has the applier and the test runner.

## In flight right now
Argon is writing **`bundle-traffic-plan.json`** (the event traffic plan: police at the car park gates, a local traffic ban, message signs, contraflow only where the real code has a lever; a Traffic plan panel; cost line in the results) and **`highway-entries-note.md`** (a read-only feasibility note for highway entries). When they land in the Drive folder, hand them to Copilot through the owner and follow the loop above. These are your first batch as lead.

## Queue after that (you decide the order; check GOLF-PLAN section 11)
1. Highway entries from the feasibility note (3 to 5 small bundles).
2. Balance: tent economics are small (a $15,000 tent earns about $115 at tier 1); use `golf/campaign.ts` and the real game to tune; the real painted nine costs about $145,000 a year to maintain and the game charges 25% (`COURSE_UPKEEP_YEAR_SHARE`): keep the campaign simulator and the real numbers in agreement.
3. G8: rain delays on the live clock; G9: golf estate, a second venue; real tent art is the art agent's (GOLF-SPRITES.md): request it in the coder's log.
4. Loading an OLD classic save in a browser was never checked: ask the owner to try one once.
5. Tidy: some blocks edited by bundles are under-indented (Gemini flattens indentation); keep new code indented like its neighbours.

## Keeping going when something breaks
- **Your chat dies** ("Something went wrong") after about 25 long turns: the owner opens a new chat, selects "4 Argon" and Task mode, and pastes: "You are Argon, the lead on Capital Empire. Read docs/ARGON-LEAD.md and docs/ARGON-HANDOFF-v3.md, then continue from the 'In flight' and 'Queue' sections and the newest paragraph of docs/PROGRESS.md." Keep every decision you make in PROGRESS.md so a new chat loses nothing.
- **Your usage limit hits** and the chat falls back to Flash: the owner must switch back to Argon after the reset; Flash-written bundles were the least reliable (many type errors): review them twice as hard.
- **Copilot cannot do something** (a browser check, moving a file between Drive and the repo): tell the owner exactly what to move or click.
EOF
echo written