# NOW: the live work log

## Historical preparation: parking garage diagonal views (2026-10-26)
- Branch `lead/garage-eight-views-20261026`, isolated worktree `worktrees/garage-eight-views-20261026`, based on main `fffca10`.
- Implemented: scoped `prep-garage-views.mjs` (also called by `prep-views.mjs`), append-only `garage-views-library`, shared Studio sizing/eight labelled thumbnails, explicit diagonal picker IDs and lot-lab NE-set entry; R turns within that diagonal set. Original base/N/E/S/W IDs and indices stay intact. Automatic selection for arbitrary road angles remains T154 Phase 2.
- Checks before artwork: typecheck PASS, 8 focused importer/axis checks PASS (including execution of the generated append function on a fixture: existing base object/index unchanged, four records appended, atlas offset applied, no duplicate IDs), production build PASS (38.8 s). Default `npm test` failed allocating Node semi-space; serial execution of the test bundles then completed: 1847 total, 1839 pass, 7 fail, 1 skip. The missing owner-rough source was a sparse-checkout omission: adding that tracked path makes painted-tiles.test pass (16 pass, 1 skip). Six other failures are outside this garage change: RES side-yard, RangeSim.newDay, two curated-lot JSON checks, new-art swapped count and stationwagon shadow. Logs: `output/garage-full-tests-serial.log`, `output/garage-painted-recheck.log`. No full-suite pass is claimed.
- Next action: await primary's reviewed v2 (v1 diagonal sheets rejected for duplicate corners/slopes/clipping), import only provenance `integrationStatus: ready` with all four native crops and matching storey count. Inspect actual game and Studio after packing; no art is integrated or on main from this branch yet.
- Do not ship unreviewed PNGs. Existing axis garage 4/5/6-storey floor counts are disputed and retained as a known art issue; no silent relabelling in this code change. Rough v2 art remains the primary art session's priority.

Update this file **before** each edit and after each sub-step. The section below is always the current state. Everything under
"History" is older and kept for reference.

## START HERE (kept current by the lead; last updated 2026-10-29 10:10

**Paste-ready start prompts for every role are in `docs/START-PROMPTS.md`:** the lead, a coding ticket, and the other sessions in this
repo. The weekly usage cap is close (2026-10-26), so any chat may stop at any moment.

**If you are a new AI, maybe on another Claude account, after a switch-over or a crash:**
1. Read `CLAUDE.md`, this section, then `docs/AGENT-BRIEF.md`. That file holds the agent rules, the brief template, the progress
   protocol, the ports and the restart checklist.
2. Restart the 5174 auto-updater (`bash E:/ClaudeTemp/autoupdate-5174.sh` in the background). If http://localhost:5174 is down, start the
   `.claude/launch.json` config `lead-game`. **5174 must serve `worktrees/theme-consistency`, never the main checkout.**
3. Read the newest `E:/ClaudeTemp/nightly/<date>.md` and any open `[nightly]` issue. Real failures come first.
4. Resume every in-flight ticket below: read its issue's last progress comment, commit any WIP left in its worktree, and start an agent on
   its branch with AGENT-BRIEF's template.
5. Then take the queue in order. Ask the owner only the questions marked as theirs.

**Tests never block a merge** (the owner, 2026-10-26): the lead merges on review + typecheck; agents run their tests after the PR, in
parallel, and push fixes as follow-up PRs (AGENT-BRIEF sections 1 and 5).

**The owner tests on http://localhost:5174.** The owner pre-approves the lead's recommended decisions (state them in chat). The lead
merges reviewed PRs (AGENT-BRIEF section 1). The owner wants screenshots of every change.

### Art integration T183 (#459)

Branch `lead/garage-eight-views-20261026`, worktree `worktrees/garage-eight-views-20261026`: reviewed native diagonal views for all five parking-garage storey counts and four shrubs (36 pictures). Existing axis IDs and saved indices stay intact; new diagonal sets append once, share Studio sizes and use the actual road heading. Canonical SE/NW names are losslessly corrected from the generator labels. Source art, crop hashes and primary reviews accompany normal packed assets. PR #582: actual engine lot-lab proof on road headings 0/1/2/4/6 has correct authored directions, no mirrored props and zero page errors. Studio visibly loads eight labelled thumbnails for all nine subjects; evidence in `E:/ClaudeTemp/T183/`. Main `6d1e964` is merged; the concept kit stays before supplemental views, preserving existing indices. Shadow audit changes only the 36 new view records. Final typecheck/focused tests are next, followed by lead review/merge. Own check servers 5189/5193 are stopped; no main integration claim before the PR merges.

### In flight
**Accepted green/fringe delivery (T217 #569, `lead/terrain-green-fringe-20261027`):** publish the two new canonical handoffs and their
source closure; add the complete green set as `putting-green-finished`, retaining the legacy pinned green and every curated surface choice.
Fringe keeps its existing ID and PNGs while gaining canonical acceptance. PR #726 is uploaded, fresh main 8e7742d merged, typecheck and 24 focused tests pass. All 345 existing images, 30 other family records and current surface choices are unchanged. Mature-sod actual game NEAR/MID/FAR and Studio evidence is in art/theme-consistency/reviews/T217-green-fringe/; temporary review choices only. MID surrounding chunk differences remain and current MID/FAR coverage is 5.73 tiles, documented honestly. Next: lead review/merge; no owner mapping reset. #486 source delivery is merged.

**Accepted terrain source delivery (#383, `lead/terrain-ready-20261026`):** the four accepted families' canonical selections, native PNGs,
provenance and review proofs are being committed from the art checkout. T170 already packed these exact accepted long-grass hashes;
this delivery preserves those packed bytes and the owner's `rough-owner` mapping. Also guard asset preparation against explicitly held
appearance reviews and make the green fallback follow a future canonical selection. Verified 440 source files, 717 path/hash bindings and
all 48 primary native/packed sizes, with zero missing references or mismatches. Typecheck and the three focused prep fixtures pass.
Next: review and merge the source delivery PR. No full suite/build, new browser session or owner server changes were needed; runtime pixels
are unchanged. Green/fringe remain separate pending handoffs.

| Ticket | Issue | Branch | Worktree | Port | State |
| --- | --- | --- | --- | --- | --- |
| T256 | #743 | `arena/T256-hole-paint` | an `isolation: worktree` agent | 5187 | **Agent 2 (Opus high, started 12:05).** Range › Build paints the property apart from holes; each hole and facility owns its paint and its looks; delete a hole with or without its grass; Save hole to My holes. To resume: #743. |
| T257 | #747 | `arena/T257-props` | an `isolation: worktree` agent | 5186 | **Agent 1 (Opus, started 12:00).** Props: shadows at the foot, sharp thumbnails from the masters, every boulder variant and "mixed" brushes, R turns (natural props flip too) and [ ] scales 80-120%. To resume: #747. |
| ART-RUN | — | none (art files, untracked, as Codex keeps them) | the main checkout's `art/theme-consistency/generated/ground/run-grass/` (read-only git) | — | **Image-generation agent (RUN.world, rumcan@gmail.com; not a coding agent).** The owner's method (`docs/art/GROUND-TEXTURE-METHOD.md`) works at RUN's own 1376x768 with no resampling. **First cut v1** (all three bands) made from one frame's quarters: 688x384 tiles, about 16 a view, so repeats show (FAR a tone checkerboard). **What works (first cut NEAR, approved by the lead):** tile 1 by the owner's method in RUN; **tiles 2-4 by image quilting from tile 1** (`E:/ClaudeTemp/ART-RUN/scripts/quilt.mjs`, Efros-Freeman, 192 px patches, min-error cuts, the shared border a plain quilt too), no RUN calls: the 4x4 has no grid, no seams, tone within 0.3. **Failed and dropped:** four independent screenshots (RUN paints a different lawn each time) and outpainting (RUN copies what it sees; a strip anchor leaves a straight line). **First cut is IN THE GAME** (#586, the owner: "yes merge"): family `first-cut-run`, shipped by `prep-painted-tiles.mjs` `RUN_SETS` from `run-grass/first-cut/<band>/tiles-v3b` (run it from a worktree on main with `--art E:/Repos/CapitalEmpire --owner-art <the worktree>`; without `--owner-art` the owner's paintings drop out; ship only the family you mean to: the art session's READY-MATERIALS has moved on for fringe and putting green, unreviewed). **The tee is IN THE GAME** (#590, `tee-run`). **The owner's rule from now on: finished art goes straight in, no asking** ("put stuff in the game, dont ask just do it we can always remove it later"; the old look stays a Studio option). **Blocks and lawns, waiting for the leaves (the owner, 20:30):** the town blocks wear the desert (#625); the owner found dirt beside the bright lawns poor, then: "the dirt and grass blend will work when you add more leaves. so try that first". So nothing changes until T220's leaves land. Ready if still wanted after: branch `lead/blocks-fescue` (PARKED, not merged: blocks a browner golden fescue, the block under-layer the fescue, lot lawns duller), and the art agent's `fescue-brown-run` (a new browner fescue for the blocks: MADE, all three bands, `run-grass/fescue-brown/<band>/tiles-v1`, kind grass; the owner has its sheet `E:/ClaudeTemp/ART-RUN/FESCUE-BROWN-in-the-game-contact.png`; on hold until the leaves land). **TOP PRIORITY for the art agent (the owner, this evening: "priority above all else"):** the art session's scene paintings in `art/theme-consistency/generated/ground/scene-backgrounds/` made into tile sets and shipped: desert, swamp (find its source or make it in RUN with the owner's method; T199 #517 waits for it), dirt, sand-raked, then any painting that beats a provisional set in the game. Tile 1 = the painting (desert and dirt: the shop left out), tiles 2-4 quilted, no resampling; RUN only where quilting cannot fix it. The lead ships each material as it lands (`prep-painted-tiles.mjs` RUN_SETS, then a surface mapping). **The fringe is HELD:** MID and FAR are made (`run-grass/fringe/{mid,far}/tiles-v1`), but RUN's safety filter refused every NEAR fringe edit (8 tries); a family needs all three levels and a borrowed NEAR would jump in colour. A fresh art agent (the first one's context ran long; it resumes from `E:/ClaudeTemp/ART-RUN/PROGRESS.md`) retries NEAR once with a new screenshot and wording, else marks it blocked. **Standing order (the owner, this evening): the art agent keeps making the art list** (`docs/GOLF-ART-LIST.md`, its Progress section marks what is done): the fringe, the rough, section 8's ground pictures, the range's top-down pictures (19, 20, 21, 27, 147), a one-view sprite pilot (36, 43, 45) then the B items, and the A items as **two views** (the owner: "two diffrent angles of each thing same lighting from top right always": front+right and left+front, never mirrored). Its item status: `E:/ClaudeTemp/ART-RUN/ART-LIST-STATUS.json`; the lead integrates and marks the list. Sprites need atlas room (GPU 95.8 / 96 MB): retire old Halloween sprites first. The game must show view 1 or 2 by facing (a small code change when the first two-view items land). **Sprites stay with Codex:** RUN's four-view turns failed the pilot (views not one rigid object, no margins; the magenta key itself was clean). Every RUN generation is deleted from the library once on disk (0 left at the last check). **The art agent stopped at 21:10 on RUN's DAILY image cap** ("[AI_POLICY_BUDGET_EXHAUSTED] Daily user credit cap reached for imageGen"; 19,875 credits left, 4,800 spent today): resume it after the reset with a fresh agent from `E:/ClaudeTemp/ART-RUN/PROGRESS.md` (its end lists the next steps: retakes of 20, 27, 147 with the v2 prompts, then the sprite pilot 36/43/45 on magenta, then the shack as two views). 134 Event matting is deferred (quilting breaks a panel grid). 19 the hitting mat is made (top-down, `run-top/golf-range-mats/golf-range-mats-top-v1.png`), not drawn yet; quilting costs none. To resume: `E:/ClaudeTemp/ART-RUN/PROGRESS.md`. |
| T112 | #199 | `arena/T112-sharp` (PR #394) | `.claude/worktrees/t112` | — | **Approved, merge HELD for the owner:** a lock change makes the 5174 auto-updater run `npm ci` in theme-consistency, whose node_modules the live 5191 studio holds (sharp). Order: the owner stops 5191 → merge #394 → let npm ci finish → restart 5191 and 5174. All shipped bytes identical on 0.35.5; audit 0. |
| P05 | #68 | PR #413 **open for the owner's approval** | — | — | The M5 balance plan, measured: arrival 47% at tier 1 from a fresh start (the start's 56-bay car park holds 168 fans), 100% with car parks; 10% at tier 2 fresh, 70-81% with car parks; an 18 of ~5,900 m fits the starting land on every seed (~$190k seeded); with the proposals a careful player reaches tier 3 in year 4. Knob recommended for "careless out-saves careful": sponsors x (1 + (rep-50)/50). |
| T183 / T168 | #459, PR #486 | `lead/garage-eight-views-20261026`, `lead/terrain-ready-20261026` | `worktrees/*` | 5193 | **Codex (the art AI), not ours:** reviewed diagonal parking garages (189 commits ahead of its remote, uncommitted files: Codex's to commit); PR #486 commits accepted terrain sources (+357k lines, 445 files): review with the art session before merging. Its studio 5193 is Codex's. |

**Two coding agents at a time (the owner, 2026-10-26: first "maybe just too many background tasks?" after the studio tab died with the
PC at 1.5 GB free, then "start up two coding agents"):** keep two coding agents running, start the next queue ticket when one lands, no
more (the owner allowed a third for T157 on 2026-10-26); each runs one heavy process at a time. Both stopped once at the usage limit (13:50) and were resumed: an agent that stops on a
limit is resumed with a message, not restarted.

**One studio (the owner, 2026-10-26: "when a studio is running it is the only studio and any changes made affect the actual game
sprites"; "put the studio on the network for all pcs on network to edit").** The lot lab's branch is on main (#290): the only studio is
port 5191 from `worktrees/theme-consistency`, the checkout of the owner's 5174 game, both on the LAN (http://192.168.0.2:5191 and
http://192.168.0.2:5174; launch configs `studio` with `STUDIO_HOST=0.0.0.0`, `lead-game` with `--host 0.0.0.0`). Never start a second
studio for the owner; an agent's check studio (5193) is stopped before it reports. The old lot lab servers (5241, 5242) and its
worktree `.claude/worktrees/lot-presets` are dead: the owner closes the servers, then the worktree goes. The owner restored
`variation:gen-house-l-shape-e0e3b328-plain:1` for its 9 lot presets (#294); `tests/lot-presets-json.test.ts` passes again.

**2026-10-27 nightly** (main `81a66c0`, run by the lead with a haiku-runner at 02:30; **no scheduled nightly task exists**,
`E:/ClaudeTemp/nightly/2026-10-27.md`): typecheck, **1906/1906 tests**, the build, sim, town, towns, fix, event and biz gates **all PASS**.
Gap: no gate covers the range start (T098).

**2026-10-26 manual regression** (main `d750592`, `E:/ClaudeTemp/nightly/2026-10-26-manual.md`): typecheck, 1697/1697 tests, the build,
sim, town, towns and biz gates PASS; fix and event gates FAIL (#285). towns/event/biz had not run for days (no .webp loader; fixed by #286).

Each agent pushes its branch and comments on its issue after every sub-step,
ending with "To resume". **Other live sessions** (the lot-preset studio, the 3D spectators) keep their own handover docs; see
`docs/START-PROMPTS.md`.

### Queue (in order)
- **Restart 2026-10-27 14:50 (the owner: "we switched to another acc that now ran out of usage. please check status and start up development").**
  The other account's lead merged #511-#530 (car lights, lawns, gas station, flyouts, Land for sale, main green). At its limit it left T202's
  work uncommitted (saved as WIP c8bbbcd) and three ground PRs open (#514 T196, #518 T197, #522 T195 1-2: reviewed, typechecked together,
  merged). The 12 last 3D people finished on 2026-10-26 and are committed on `art/people-ground-20261024` (0bd25f4): T203 #531.
  Housekeeping: T174-T177, T179, T184 closed (merged earlier). The 5174 auto-updater ran 5 times over; the owner approved stopping 4
  (one left, bash PID 31220). Still listening, not ours: a stray vite on 5189 (an agent's, gone since 07:50) and the dead lot lab's 5241.
- **The concept look (the owner, 21:30: "this is the look and feel we need to get to"):** `docs/art/CONCEPT-LOOK.md` (#635) has the reference, the gaps and the code work in order; its art is GOLF-ART-LIST section 12 (items 149-175). **Waiting on the owner:** step 1, green ground (the map, the blocks and the yards go green; it reverses #625 and the map half of #621). Step 2, a golden-hour colour grade, is the next code ticket after the owner's queue.
- **Next, in order, when an agent lands:** (T256 #743 and T258 #755 are running) **T237 #694** car parks: the range set back from the road for frontage parking, car parks that look like car parks, a 150 m walking rule shown while placing (the owner; after T258, which also changes the range scene) → **T259 #759** farms (seasonal corn and ploughed fields, orchards in rows, farmhouses set back on a poplar-lined lane; art 185-189 in ChatGPT) → **T258 #755** draw the range's made mats and target greens, and a pipeline that swaps in the owner's ChatGPT range buildings (two views) as they land → **T254 #736** Edit Hole Layout moves only the tees and the flag (no regrowing), four tee sets blue, white, yellow, red (the owner) → **T253 #735** round and smooth any painted area (a tick box and a slider) and bunkers like the owner's reference (`docs/art/reference/bunkers-and-pond-reference.png`; after T252) → **T248 #718** water that moves (research first, two flowing textures, waves lapping at the shore) → **T251 #728** balls bounce and roll on the ground (the range, the course, NPCs and you; the owner) → **T249 #719** a grey stone water border with planting on any water (waits for the owner's ChatGPT art, item 180) → (done: **T239 #699** the range start as a guided build (the owner, 2026-10-28: the car park starts as dirt, no walkway beside the tee, the player builds the target greens, the path and the car park, and buys the practice area, all taught by `RANGE_GUIDE`; Opus high, two phases) and **T238 #697** course painting (these two can run side by side) (paint inside Edit hole, a round isometric brush, Long grass as a surface: the owner, 2026-10-28) → **T237 #694** the course car park (placement, look, how people use it: the owner) → **P28** (the owner, 2026-10-28: you, the town and its people; `docs/plans/P28.md`, art GOLF-ART-LIST section 13): T242 #702 set-the-scene cards → T243 #703 people's cards and portraits → T240 #704 your character → T241 #705 your skills → T244 #706 money matches → T245 #707 a healthier town → T246 #708 your tournament and the Mayor's Cup (the art first: the art agent on 200-204 and 211) → **T214 phase 1** memberships (plan P26 merged #695; the owner's questions Q1-Q5 taken as recommended, pre-approved, until the owner says otherwise) → the golf play tickets: **T212 #557** putt, chip, tee-up and coach clips → then **T112 #199** (merge #394 when the owner stops 5191) →
  **T149 #312** (waits for the owner's FAR-anchor choice) → the lists below.
  (Golf play P1-P4 is on main from #258; the owner asked for its tickets on 2026-10-27, 18:05. T215 #561 stays open for the owner's call on
  water and roads by day.)
- **P25 #348 lots generated on the fly** (the owner: "start over with the lot presets we need a workflow that gets us to generating perfect
  lots on the fly"): hard rules + learned per-sector taste (T158 wizard, in flight) → T159 bootstrap from the existing presets + a 12-lot
  gallery → T160 the generator in the game, seeded per lot, model as data → T161 pairs, densities by state, a 50-seed exam sheet. The
  presets file stays (archive, one-off overrides). Same agent as T155/T158.
- **Scene-background paintings (checked 2026-10-26 evening, main checkout, untracked):** `art/theme-consistency/generated/ground/scene-backgrounds/<material>/`
  holds one building-free painting a level (`*-background-anchored-v1.raw.png`, ~1742x903) for fairway, putting-green, lake, sand-raked,
  sand-ripples, golden-fescue and long-grass; desert and dirt only the version with the shop. `long-grass/*-uniform-background-v2` = the
  owner's rough already in the game (#360, same sha256). Fairway and putting-green go in through T165; lake, sands and fescue keep the
  art session's seam-repaired READY tiles unless the owner prefers the paintings.
- **Texture art status (2026-10-26 15:30):** the art session (Codex; `art/theme-consistency/material-texture-batches/ACTIVE-WORK.json`)
  has finished 2 of its 14 families (golden fescue, lake: in the game). sand-ripples has raw variants, sand-raked 2/12, desert/dirt
  anchors only; fairway, putting-green, first-cut, long-grass and the rest have job files and no pictures yet. Each lands through
  READY-MATERIALS → `node scripts/assets/prep-painted-tiles.mjs` → a surface in Studio › Painted.
0b. **T149 #312 painted terrain follow-ups** (waits for the owner's FAR-anchor choice after T150): real game-vs-proof comparisons (T145's side-by-sides were invalid), the in-band zoom steps
   (the owner's call), seams, DPR 2 softness, rivers.
1. **The nightly.** The owner should allow the nightly session's commands so it runs unattended. fix:gate's new default (seed 1 day 60)
   passes by 1.8 points only: if it flips, retune the scenario (#298's header has the scan table), do not touch traffic.
2. **The owner's new grass paintings**, when they arrive. Import them with `scripts/assets/prep-painted-families.mjs` (the families list
   in the script), then map them per surface in Studio › Painted.
3. **P24 follow-ups:**
   - the putt, chip and coaching clips;
   - real art for the stand-ins in `docs/GOLF-SPRITES.md` (the range, practice and props kits).
4. **The owner's call:** the top bar's chip words are icons only below 2200 px (T135). Bring the words back at 1920 if the owner asks.
5. **Older lists:** T110's rest of the game (paint-edges rims, water glints, prop and tree shadows: T141 covers the props); P23 Phase 2
   (one Streets tool, holes drawn like a road, season and hole cards); P22 T090-T098; P21 T101 and T103-T107; M2/M3 leftovers; T112
   (the sharp bump). See the History sections below and `gh issue list --label arena --state open`.

### Done recently (newest first; details in each PR)
- 2026-10-29 13:10: **#754** footer menus open on a click, close on the next (with the panel), and the panel has a close button (the owner). **The range's stand-in buildings**: none replaced yet (RUN's two-view turns failed; 2D now ChatGPT): their prompts are first in `docs/art/CHATGPT-IMAGE-QUEUE.md`; T258 draws the made mats and target greens and picks up the owner's ChatGPT files.
- 2026-10-29 12:00: **#751 T255 the town tools' panels open above the footer** (roads, junctions, transport, Town decoration's Paint and Props; shared tools follow where they were opened; capped at 60% height; moves aside of the bottom cards; one known gap at 125% UI on 1366 px with two cards open). **#750 T247 soft dirt edges**: the dirt-to-fescue (and desert, dirt car park, dirt tee) edge is a noise-broken band about 3/6/9/10 tiles at 30/15/8/4% (the old edge was a fixed-pixel cut, and T217 skipped the tufts at far bands); bake +0.3 ms at 30%, about +2 ms at 8% on range20 (borderline, noisy: watch it in the nightly bench).
- 2026-10-29 11:15: **#745 T252 course painting polish**: real-texture swatch pucks with their borders (one painter for swatches and the cursor), an even grid, My looks and Ground height in Edit hole, an eraser cursor, no Cart path swatch (Long grass key 8). Looks are course-wide today: T256 makes them per hole and per facility (the owner).
- 2026-10-29 10:40: **#741** the rail says Range, no Course/Town heading words; **#742** Build buttons in gold (the owner).
- 2026-10-29 10:20: **#738** the tool panel closes on Select with nothing selected (the owner).
- 2026-10-28 10:05: **#733 T250 the town footer**: the club's tools in the left drawer (Select, Course group, Bulldoze), Traffic and Town decoration in a footer centred along the bottom (flyouts open upward, levels to the side; compact form where room is short; keys 1-6 unchanged). **#734** the owner's bunker reference picture.
- 2026-10-28 16:50: **#730 picking a surface paints it** (the owner: Bunker drew rough): Erase stayed on from before; a surface pick (swatch or keys) now puts Erase down, in Edit hole and Shape by hand.
- 2026-10-28 16:20: **#727 T238 course painting** (the owner): paint inside Edit hole (a "Paint hole n" section; strokes belong to the open hole, one undo step each), a Square/Round brush for every surface (Round is a map circle, a 2:1 ellipse on screen), and **Long grass** (course-grid id 9, save-compatible; `longGrass` wears the owner's rough; plays as deep grass; key 9). T250 #721 (the left drawer and a town footer) started.
- 2026-10-28 15:30: **#714 + #723 T239 the range start as a guided build** (the owner): a new range starts with a dirt car park (loose rows, 55% of the bays), no walkway, no target greens; upgrades Gravel ($3,000) and Pave ($8,000) the car park, Target greens ($2,500, three; `targets` adds two more); golfers walk a laid Walking path; the practice area is land to buy (`golf.practiceLot`, Land for sale opens with the first upgrade); the range guide's 7 steps (buckets, greens, path, gravel and pave, turf, practice area and putting green, first hole) with Show me, Skip, rewards ($8,000 in all); old saves keep everything.
- 2026-10-28 14:20: **#715 T236 car paints**: all 11 paints failed the audit (the colour-band recolour painted chrome and missed lit edges), so painting is off (`?carpaint=1` for the old palette); car parks and lots now show real vehicles in their own colours (the yellow pickup, `world:car_0..3`, the compacts, the rusty pickup on farms), chosen by the bay's heading; driving cars stay the two wagons (the only 8-facing vehicles). Art 178/179 (an 8-facing pickup and sedan) are best made as 3D models (RUN 3D) rendered at 8 facings.
- 2026-10-28 14:10: **The owner: RUN credits are for 3D work only; no top-up; 2D images from ChatGPT's image generator**, run by the owner from `docs/art/CHATGPT-IMAGE-QUEUE.md` (31 ready prompts: batch 2's P1 places with file names). RUN stays for the people pipeline (the player's looks 233, clips 234 and 177, the caddie 176, good-times clothes 235). The art agent's RUN scene batch is cancelled.
- 2026-10-28 13:40: **Set-the-scene batch 1 made** (P28, art 200-204, 211): 17 pictures, run-down and upgraded pairs lined up (the range from the road, the hitting bays, the caravan, the farmhouse, the cottage run-down, the pro shop, the practice green, the video store outside and inside), in `art/theme-consistency/generated/scenes/`, untracked; sheet `E:/ClaudeTemp/ART-RUN/SCENES-batch1-contact.png`. The range's name is "Maple Falls Driving Range". RUN's daily cap is about 13,800 credits; **6,075 credits left**: batch 2 (the P1 places 205-222, about 30 pictures) uses most of it; the rest of section 13 needs a top-up (the owner's call). Resume: `E:/ClaudeTemp/ART-RUN/PROGRESS.md`.
- 2026-10-28 11:25: **#696 the course rough wears the town lawns' grass** (the owner: "can we see the rough grass ... on the course rough"); the owner's rough paintings stay on decrepit lawns and become T238's Long grass. **#692 the turfed range tee on clean concept turf** (the owner: the divots "isnt working"); `range-tee-divots-run` rejected, a Studio option. **#695 the P26 plan** (club pros and memberships): staff (head pro $900, teaching pro $300, secretary $450 a month), the pro's office and teaching hut, lessons, a real membership price, sales and churn, 7 phases; careful +$195k, careless −$26k over 10 seasons.
- 2026-10-28 10:40: **#689 T234 pond rims, part 2**: boulder-led rims (one every 2.4-2.8 m, large and medium, half in the water), small-stone fills only in straight breaks (at most 30%), planting on the bank (plume grass, shrubs, mums, a plant per 3.7-5 m); the course pond 90 pieces for $5,400 (part 1: 146, $8,760). Close to the concept's ponds.
- 2026-10-28 10:00: **#687 T233 the concept's UI** (step 10): the 12 tool tiles in grid levels of the Course and Facilities flyouts (rows without a tile keep their icon on the navy square; columns narrow, never a sideways scroll); the top bar's stat chips (money with its monthly change averaged over a town day, reputation, golfers a month from T208's tee sheet, course rating 0-5), icons only below 2200 px (T135); the tier name and months-left text now from 2400 px so the bar stays one row down to 1366 px. Left: art 175 (the chips' icons), nine more tool tiles (GOLF-SPRITES), the title still says "Town builder" where the concept shows the club's name, year, month and weather. **Every concept step is done or running except step 1, green ground (the owner's call).**
- 2026-10-28 09:15: **#685 T234 pond rims, part 1**: the Stones edge with gaps (11-13% of the shore), plume-grass tufts and boulders in them, varied pieces; lily pads recoloured green (`greenPads()` in prep-kit, `GREEN_PADS`) and enlarged. Still a dense cobble band: part 2 (boulder-led, planting between) is running.
- 2026-10-28 08:25: **#682 T232 building sites you can see** (the concept's step 9): lots under construction show a white dashed survey line and bare dirt; house sites get the timber frame (169, view by facing), the library's digger (168 blocked in RUN), heaps and lumber; bought land shows its line; a cleared plot on your land shows dirt (`golf.cleared`). The construction page had room (no atlas change); built lots' compositions unchanged (3,433 digests). **#681 T231 the concept's kit**: 47 masters packed on the golf page (no page added, nothing retired; GPU unchanged); ponds Natural/Stones (`golf/ponds.ts`), lily pads, Fountain jet ($3,500), Fountain pond ($9,000), stone edge ($60 a stone); Decoration › Water, Stone, Furniture (lamp posts), Plants (shrubs, mums, palms, the Hedge run); Facilities › Plants' Palms brush; built house lots get a front hedge, shrubs and mums (`kitYard`, own draws, curated presets exact). T234 #683 polishes the rim and the pads.
- 2026-10-28 07:00: **#679 T230 the concept's water**: ponds on `pond-concept-run` (154), rivers on `lake`, both with the new look (`water-look.ts`): deeper teal toward the middle (world-anchored shore distance; a separate `riverDepth` keeps rivers turquoise), a warm bed at the edge, soft reflections of shore trees and buildings, and the camera glint on all water (the Night switch now "Lamp reflections and water glint (test)"). Studio › Painted › Water look; off = main's frame. Bake +0.3-0.5 ms a river chunk.
- 2026-10-28 05:55: **#677 T229 trees frame the holes** (the concept's step 6): New hole's "Frame with trees" (on by default) and the hole card's button plant woods 2-3 rows deep along the rough (clumps 11 tiles apart, few narrow gaps), clear of play, landing zones, cart lanes, paths and water; $60 a tree (a 340 m par 4 about $9,000); re-framing never doubles. The bench: 30% about 55 fps (was 58). Left: course quality has no tree term (GOLF-PLAN 4.3's beauty).
- 2026-10-28 05:10: **The art agent finished and stopped** (no cap hit; balance 8,955 credits; 10,920 spent on 10-28 UTC): section 12's ground (149-154) and kit (158-164, 169-171, 174; 168 the excavator blocked in RUN: two views not one machine), the top-down retakes 20, 27, 147, and the B pilot (36 boulders x9, 43 palms x9, 45 lamp posts). All untracked under `art/theme-consistency/generated/`. Into the game: T231 #671 (pond kit, planting, the pilot), T232 #673 (building sites), T233 #674 (UI tiles, chips). Not started: 167 clubhouse (A), 173 hire cart (D) (both likely to hit the multi-view limit), the P2 items, the green's MID retry. To resume: `E:/ClaudeTemp/ART-RUN/PROGRESS.md`.
- 2026-10-28 04:15: **#667 T228 the concept's streets**: white edge lines inside the kerb on town roads from the street up (broken at junctions, drives, bus stops, bays); zebras pinned by tests (they already matched); car paints (11, body only; `?carpaint=0`); car parks draw their cars to the count (a fixed bay order, nothing off screen). Note: grown towns' streets are gravel until the player upgrades them (the owner's design), so the markings show on upgraded roads. Left: town car-park lots keep the composer's fill; centre lines stay yellow (the concept's look white).
- 2026-10-28 03:55: **#666 the concept's course grass** (149-151): `fairway-concept-run` on fairway and the range outfield, `first-cut-concept-run` on firstCut and the green collar, `green-concept-run` on greens and range targets (its MID provisional). **#665 T213 caddies, carts, celebrations**: caddies for tier 3+ pros (a labelled stand-in), carts for tier 1-2 amateurs and everyday visitors (on the cart paths or the rough's edge, parked off the greens, 0.75 of the walk time), a stand-in celebration pose and the gallery's cheer after a birdie. Art gaps 173 (8-facing cart), 176 (caddie), 177 (clips).
- 2026-10-28 03:20: **#663 the concept's lawn on every yard** (GOLF-ART-LIST 153, RUN with the concept as the style reference; v2 warmed halfway to the concept's town grass): `lawn-concept-run` on lawn, lawnBuilt, lawnUpgraded and the lawns preset; `meadow-concept-run` (for the map's open ground, waiting for the owner's green-ground call) and `rough-concept-run` (152; the course keeps the owner's rough) in Studio › Painted. The art agent goes on with 149 fairway, 150 first cut, 151 green (an even-daylight v5 prompt: the golden-hour wording painted sun glows).
- 2026-10-28 02:25: **#660 T227 the concept's course look** (steps 3-4): fairway mowing bands now run ALONG the line of play (3 tiles, strength 0.8; doglegs mitred, T218's seam gone; texture kept: multiply and lift), the range outfield too after Grass the outfield; fine green stripes; a darker, wider first-cut collar (4 m round fairways, 2 m round greens; a player's Border wins); bunker lips (a cool crescent inside the far rim, a light near lip, a first-cut grass ring). Knobs: Studio › Painted › Course finish (a `course` block in painted-surfaces.json), `__game.ground.setCourseFinish`. Bake within T217's 0 to +0.8 ms. **The owner's studio on 5191 needs a restart** to save the new `course` block (until then a save drops it: the tuned defaults hold).
- 2026-10-28 01:40: **#658 T208 everyday golf**: a daily tee sheet (members 35% of the club, visitors `dailyGolfers` ±15%; twos to fours, 07:00-15:00); cars park, golfers check in and pay at the clubhouse (members free), wait behind the 1st tee, play in T211's Field and leave; fees booked at check-in ×10 (one town day stands for ten billing days: 36 visitors show $7,920), counted in `Budget.earned`; pace moves reputation (+1 to −3) at season end; the Clubhouse card (select it or the top bar's Club chip). Off-screen groups cost one box check; a busy day +0.5 ms drawn. Left: a ~78 ms hitch at each busy day change (work out the next day in idle time), T214 for the old generic clubhouse visits. **The art agent** restarted (01:45) on the concept greens, section 12 items 153, 152, 149-151 (`*-concept-run`), RUN's daily cap permitting.
- 2026-10-28 01:00: **#655 T211 pace of play**: one time-ordered `Field`; a tee shot waits for the group ahead to clear 300 m, an approach for the green to clear; the owner's group waited for and waiting; the marshal waves a group through when a slow group holds two holes (no chains); "waiting on the 7th tee" on the board; T210's last group is now the one furthest back. Normal fields rarely wait; a slow group (often the owner's) does. event:gate PASS.
- 2026-10-28 00:55: **#654 T226 the golden-hour colour grade** (the concept's step 2): a curve, not a tint (highlights warmer mostly in red, small cool deep shadows, an S-curve pivoting low, vibrance), a 7% vignette, an optional edge blur; gear menu › Colour grade on by default, strength 0-150%; off and full night skip the pass (bit-identical); within budget (+1 draw). Open for the owner: the concept's deep shadows are warm brown, not teal (the cool term is small).
- 2026-10-28 00:00: **#651 T210 the results wait for the last group**: the day's result is still reckoned at 15:00 (money, town growth unchanged), but the results screen opens after the last putt; a "Last group on the 18th" toast and banner (Watch moves the camera) first; "Results now" keeps the old early screen; T209's resume holds (`golf/play/finish.ts`).
- 2026-10-28 00:35: **#649 T199 swamp on the streams** (the owner): the creeks draw as a swamp band (`swamp.ts`; the stream's water narrow, a muddy lip, the `swamp` surface on `swamp-run`, a ragged world-anchored rim; rivers and lakes unchanged), and with `specCam` on the pools catch a cool camera glint (a gloss mask per swamp tile, T215's falloff; off = bit-identical). Bake +0.4 ms a chunk, the bench within budget. Left: T215 phase 2 (plain water), a softer blend where the swamp meets the fescue.
- 2026-10-28 00:10: **#647 T222 rough backyards early** (the owner): about 40% of a new town's house yards wear fescue, dirt or desert in soft patches (10% by 3,000 residents; declined lots more, upgraded never; by the lot's seed, props unmoved; gear menu > Rough yards); veg beds on dirt (`dirt-run`); **Holes › Shape by hand › Waste area** (key 7, the cart path moves to 8; priced and played like a bunker). Noted: desert and dirt yards blend into the desert blocks, and desert waste beside golden fescue reads weakly: the concept's green ground would fix both.
- 2026-10-27 23:20: **#645 the drive-in's real screen** (the owner: "we have a litteral drive in screen prop"): the library picture with a footprint and view-order fix for places only (`lots/art-fix.ts`; its library data had a 1 x 8 box across the picture and SE/NW swapped), the face to the 28 cars at all four facings; #594 closed. Left for art: 142 the town's name on the screen, 143, 144.
- 2026-10-27 22:55: **#642 T224 roundabouts clear or refuse** (the owner): rings and minis (placing, re-laning, Tab, widening) use the roads' obstacle list: built lots in the circle are bulldozed and priced (compensation in the label and panel), small props go; a business, a car park, the range's pieces, an iconic place, a toll plaza or a big prop refuses it, outlined red with the reason. Iconic places now refuse roads too (a road went straight through the drive-in). Left: a road joining a ring in a wider class grows it unchecked.
- 2026-10-27 22:30: **#640 T223 the desert range start** (the owner): a new range's outfield is desert (`range-outfield-desert`), its tee box dirt (`range-tee`, its own patch: course tees unchanged); upgrades **Turf the tee box** ($4,000: `range-tee-divots-run`, +5% visitors, $1 more a bucket) and **Grass the outfield** ($12,000 after it: today's striped outfield, +15%); the caravan and cottage yards desert (`range-home-yard`); old saves own both upgrades (they keep their grass; they now pay their $120 a month upkeep). The fine tile grid over tee cells in its shots is the **map grid** (`ext/map-grid`, `Game.showGrid`): on by default in dev builds, off in production, a switch: not a bug.
- 2026-10-27 22:00: **#637 T225 the painted tests check the rules** (44/44): no pins on the owner's Studio picks; the manifest revision as the prep script computes it (the lead's hand imports since #586 chained it: wrong). **#638** the recipe for shipping a RUN set is in `docs/art/GROUND-TEXTURE-METHOD.md`.
- 2026-10-27 21:40: **#635 the concept look** (the owner's target picture): `docs/art/CONCEPT-LOOK.md` and GOLF-ART-LIST section 12 (149-175). **#634 T221 the town grows with the money made** (`Budget.earned`, the room `earnedTarget`, a careless club's town about a third of a careful one's; range:gate passes). **#633 T220 a ton more fallen leaves** (backyards about 20x, under every tree, drifts along fences and kerbs, baked: frame time unchanged; gear menu > Fallen leaves 0-200%).
- 2026-10-27 21:05: **#630 five RUN-made ground textures** (the art agent, GOLF-ART-LIST 131, 132, 133, 135, 21; shipped without asking, the owner's rule): river banks and creek beds wear `pond-bank-run`, grow-in soil `grow-in-run`, a new Town surface `mulch` (the Paint tool's Bark mulch) `flower-bed-soil-run`; `field-parking-run` and `range-tee-divots-run` are in Studio › Painted only (no grass car park yet; the range tee shares the course's tee surface until T223). #628 the greenkeeping/practice tests; T225 #631 filed for three stale painted tests.
- 2026-10-27 20:48: **#627 Greenkeeping hidden for now** (the owner: "hide/remove greenkeeping from the game for now"): one switch, `src/game/features.ts` `GREENKEEPING = false` (no rail tool, no Course flyout group, no Grass button or panel, the grass-care system off so the turf never drifts). **#628** its tests and T206's Practice tool in the progressive tests (5 files, 71/71). Flip the switch to bring it back.
- 2026-10-27 20:32: **#625 town blocks desert** (the owner): the block grass and its under-layer wear `desert-run`.
- 2026-10-27 20:26: **the scene paintings are all in** (the owner's top priority): #620 raked sand on the bunkers, #621 the putting green on every green and the range's targets, the map's fescue now blends with **dirt** (the living ground's lush patches: the owner), and the RUN rough offered as a family (the owner's own rough stays on the course).
- 2026-10-27 20:15: **T219 #615 iconic places**: the drive-in and the high school on every map (whole presets in `lots/iconic-places.json`, placed once by residents, named after the town, cards; stand-ins for art 142-148; follow-up: the drive-in's screen to the end of the car rows). **The scene paintings** (the owner's top priority): **#614 swamp** (`swamp-run`, RUN-painted; on the map with T199), **#616 dirt** (store removed; Painted › Dirt), **#617 farm fields** on the new dirt.
- 2026-10-27 20:05: **T218 #609 fairway stripes** (the owner): light mowing bands across each hole's line of play (doglegs per leg), the range outfield's look; `ground.setStripes`. **#612 the desert** (the owner's top priority): the art session's desert painting, the store quilted away, four quilted tiles a level, on Painted › Waste area sand. The RUN fringe is held (too flat at NEAR).
- 2026-10-27 20:00: **#608 the dev server grows the town at the game's speed** (the owner: "grows too fast"; it was 20x by default on the dev server; `?grow=N` for tests).
- 2026-10-27 19:39: **T209 #599 the tournament day resumes after a reload**: the day's clocks, surge, crowd, car parks and the owner's round saved as an optional `SaveV5.tourney` during the round only (every other save byte-identical); a resumed day holds the sim until its play is rebuilt; old saves load as before.
- 2026-10-27 19:32: **T203 #597 the last 12 people**: 7 townspeople walk the town, 4 spectators join the crowd with their clips (the vendor waits for a staff system); only the walker pages 17-21 repacked, pages 0-16 byte-identical; GPU 95.8 / 96 MB. #596 the clubhouse test follows its new size.
- 2026-10-27 19:28: **#590 the tee** (RUN-made, quilted: `tee-run` on Painted › Tee); **#591 lawns calmer** (the owner: "crazy green"; every lawn surface on `first-cut-run`, no lines); **#593 the clubhouse a quarter of the size** (the owner: "masssiive"; 40 x 24 → 20 x 12 tiles; placed ones keep their saved size; its tests run after the merge). T218 #592 fairway stripes and T219 #594 iconic places filed; GOLF-ART-LIST section 11 holds the places' missing art.
- 2026-10-27 19:02: **T217 #588 rugged edges within the bake budget**: caches only (spill paths, ring boxes, the living ground's outlines, bank faces); on-minus-off now about 0 to +0.8 ms median; the look byte-identical (19 shots, 0 px). First cut checked on 5174: mapped, its tiles served, no errors.
- 2026-10-27 18:43: **#586 first cut in the game** (the owner: "yes merge"): the RUN-made first cut (tile 1 by the owner's method, tiles 2-4 quilted) as the `first-cut-run` tile family on Painted › First cut; `prep-painted-tiles.mjs` gains `RUN_SETS` and `--owner-art`.
- 2026-10-27 18:11: **T215 phase 1 #583 the lamps' camera reflection** (the owner's idea; off by default, bit-for-bit today's look when off): with `__game.specCam = true` or gear ▸ Night ▸ Lamp reflections the pools are lit on the GPU from a per-chunk mask, fading from the screen's centre; the verdict: works, no vignette at the default radii, the depth from the pools alone is small and shows best while panning. #561 stays open for the owner's call on water and roads by day.
- 2026-10-27 17:52: **T206 #580 Facilities** (the owner): the rail's Facilities group (Practice tools of their own: a putting green and a chipping green with its bunker, placed whole as a ghost and laid as the same hole-0 cells; Plants with the tree brush; Decoration ▸ Props) in Decoration's place; Course ▸ Cart paths & roads below Buildings; the Green and Bunker brushes refused in the practice area; the range card's Build buttons; the range card and Grass panel sized by --vh-ui. Plants keep the Paint tool's lock (the first hole).
- 2026-10-27 17:01: **T205 #573 Edit hole that works**: the card's Edit hole re-opened the editor already open (no change, and it dropped unsaved drags); now it keeps an open editor, frames the hole and toasts; 'Editing hole 1' on the card; badges read 'Hole 1'; '✎ Edit hole 1' under them; one thin themed scrollbar everywhere, no sideways scroll; ui:overflow covers Course › Holes and the hole card (416 looks, 0 failures). T206 also takes the range card's and Grass panel's `--vh-ui` height.
- 2026-10-27 16:59: **T204 #574 rugged grass edges** (the owner): rounded corners and a world-seeded wobble on painted areas, lot lawns and course layers (drawing only); tall grass spills over short ground in blades from its own painting with a cool shade; the living ground's lush grass at full strength with a tufted edge and 4x fewer open-ground patches (the pale green fade gone); `ground.setRugged(false)` compares. Over the bake budget at the range start 15% (+3 ms median): T217 #576.
- 2026-10-27 16:21: **T216 #570 hidden bushes hide their shadows**: one `CULL_MIN_PX` drives the sprite, cast, contact and vector shadow passes (the shadow instances carry the picture's height and cull flag); made by haiku-coder, committed by the lead after a check in the game (the shaders compile and draw at 0.17, 0.07 and 0.035, no errors).
- 2026-10-27 16:07: **T207 #567 roads on your own land**: one obstacle check (`route-obstacles.ts`, `Game.routeInWay`) for the preview, each click and Build; course drives and cart paths refused only by the range's real structures (`rangeStructures`), the clubhouse, halfway house, town businesses, a car park's inside and tolls, with the structure named and outlined; town roads keep the padded rectangles. The owner's controls: right-click takes back a point (right-drag still pans), Enter or a double-click builds.
- 2026-10-27 15:58: **#565 the fringe grass a touch less green** (the owner: "too bright green"): tint #ffedfa (green x 0.93) and +0.04 tone on every fringe-family surface (fringe, fairway, first cut, the range's outfield, built and upgraded lot lawns): about 6% less saturation at the same brightness; Studio › Painted can fine-tune it.
- 2026-10-27 15:36: **T195 #549 fix:gate passes again**: the default scenario is seed 2 day 50 (the gravel-grid gridlock, B -34.6% against the 10% bar; days 48/52/54 pass too); B's STOPs are correct under T184's unequal-crossing rule; traffic untouched; the range20 fixture regenerated with the minis player. **#550** the art list asks for magenta backgrounds.
- 2026-10-27 15:12: **#543 the course wears the lawns' new grass** (the owner: town lawns' grass is not the course's): fairway and the range's outfield on the `fringe` tile family (as the yard lawns, #516), first cut the same at 1.25 scale, a little darker; the old families stay in Studio › Painted. GOLF-ART-LIST section 10: greenkeeping's 16 grass families x 5 conditions, 20 soils, 12 decal sheets to regenerate in the painted style (T016's 2026-10-22 set predates it). T206 also takes the tree brush (the owner: "no idea how to plant trees"; today only under Town decoration ▸ Paint ▸ Plants).
- 2026-10-27 ~15:00: **the big golf art list** (the owner: "I need a big art list and what angle it should be"): `docs/GOLF-ART-LIST.md` replaces the range list; angle codes (A four views, A8, B one view, C top-down, D eight facings, R run pieces, P a person's A-pose picture), 141 items: range, fun targets, practice rock features, palms and lights, pros and memberships, storage and maintenance, the course, the clubhouse, the tournament, ground pictures, people.
- 2026-10-27 14:52: **T202 #536 Help › Keys**: ? / F1 / the top bar's ? open a Keys sheet built from the rail's tool table (every key once, locks dimmed with their reason, vertical scroll only); 1-6 open the rail groups' flyouts (Holes keeps 1-7 for surfaces, Build 1-6 for road classes); the lot lab's ? opens the same sheet; the 5 self-skipping version tests are rules and run.
- 2026-10-27 14:46: **#533 the range art list** (the owner: a list for the image generator): `docs/RANGE-ART-LIST.md` (now `docs/GOLF-ART-LIST.md`), four shared prompt blocks and 21 items (buildings, signs, props, the picker cart, ground pictures) with sizes, ids, stand-ins and priorities; the 3D clips and P3 ideas apart.
- 2026-10-27 14:27: **T196 #514 soft course borders** (the green-to-fringe and tee joints a soft cool shade, no hard line), **T197 #518 zoom without glitches** (idle prebake of the next zooms' chunks, band switches crossfade, provisional bakes retried), **T195 #522 minis keep their corner lots** (lotRingClear; the range gate's player uses minis). Typecheck clean on the three together.
- 2026-10-27 13:21: **#528 main green (2033 pass, 0 fail)**: compose, house-alloc, lot-taste, lot-wizard and train-every-use check rules, not the owner's
  data (presets, allocations, samples, the Rebuild's art), so a studio save no longer breaks them.
- 2026-10-27 13:14: **T200 #526 Land for sale** (P23-UX P2-6): Course ▸ Land for sale; an overlay of buyable blocks by price band ($ / $$ / $$$
  with labels), unbuyable ones hatched with an ✕ and a reason (public road, water, not adjacent), your land outlined; a click opens a card
  (size, class, price, what is on it, what it adds) with Buy, never buying at once; a brush or New hole refused for "not your land" offers
  it. Town blocks stay buyable (houses bought out at the land price, as GOLF-PLAN 4.4).
- 2026-10-27 12:54: **T193 #523 flyout submenus** (the owner: "i want sub menus ... open all more to the side with more levels"): rail groups open
  cascading flyouts (Traffic ▸ Roads ▸ Build ▸ classes by family; Course ▸ Holes ▸ Shape by hand ▸ surfaces); a leaf shows a small tool
  panel with a breadcrumb and back arrow; Esc/map click closes; keyboard walks them; locked rows show their reason; **no horizontal
  scrollbars** (`npm run ui:overflow`: 388 looks at 1366/1600 x 100/125%, 0 failures).
- 2026-10-27 12:05: **the lawns, for real**: **T194 #519** the root cause of fescue showing in chunk-shaped pieces through yards and blocks: the
  ground worker's tile cache was trimmed by a decode finishing mid-bake, so drawLawns dropped the lawn from that chunk (textures.ts now
  pins the bake's pictures); block grass under share 1 lies over the rough. **#513** the living ground's lush/patchy in the rough (+ the
  owner's Painted edits saved: green putting-green, dirt cutaway-earth). **#516** yard lawns in the textured fringe (the fairway
  painting is smooth zoomed out). **#520** tests check the painting rules, not the owner's Painted choices. **T198 #515** the gas
  station composes properly (forecourt, the Gas Shop, bays). **T192 #511** car lights. No swamp art yet: T199 #517 waits for tiles.
- 2026-10-27 11:28: **T192 #511 car lights**: no headlights, beams or turn signals; brake lights half size (8.8 px) and brightness (0.5),
  on the car body, drawn in the sprite pass right after their own car (nearer sprites cover them; none seen from the front); no fps
  loss. `BRAKE_LIGHT.alpha` in `sim/car-lamps.ts` is the knob if they read too faint at night. The shadow agent is done for now.
- 2026-10-27 11:19: **T191 #499 the new ground art, used everywhere** (the owner: "make sure it gets used everywhere"): `fringe` (new, provisional,
  only the export-report tiles) on the fringe surface and every collar round greens; `putting-green-v2` (MID/FAR the v2 sets, NEAR the
  owner's painting) on the green, `lawnUpgraded`, and the range's target and practice greens. Nothing wears the old putting-green
  families now; they stay as the option. Seams within 1.16x inside. Found: a stale MID chunk after the first zoom (to T197).
- 2026-10-27 11:16: **T184 #468 + #470 junction rules that work** (the owner approved): equal crossings first-come (no arbitrary major, no STOP),
  queue-aware routing (a link costs its head car's wait + 2 s a car), a 20 s deadlock breaker, roundabout entries judged by the ring car's
  real speed; sim:gate towed 679 → 88; town/towns/event/biz as before; range bands pass for every player. The jam hint points at the
  Junction tool; `--player` places all-way stops ($300) and reaches P22 on seeds 1-3 never broke ($58-76k over 20 seasons). **fix:gate
  FAILS** (A 20% faster; B's class upgrade brings STOP back): re-scan in T195. Minis relieve the jam best but re-cut corner lots: T195.
- 2026-10-27 10:57: **#500 the owner's studio work saved to main** (lot presets +2,132 lines, wizard samples, allocations, sizes, the Rebuild's
  atlas/views/axis pages, new parking-garage views), committed from a separate index; the 5174 checkout then moved to main with
  `reset --mixed` (its files untouched; clean). Lawns: lot lawns cover the whole lot (share 1); block grass is soft patches at the
  owner's blockShare over the fescue; the living ground's thin/bare patches near fences and trees let the fescue show.
- 2026-10-27 10:25: **T189 #495 block grass in the new paintings + Erase back**: the town's block grass wears long-grass and rough-owner
  (local contrast 14.8 / 11.0 at 30%, against the old looks' ~5 flat wash; sage, straw and the flat greens dropped; blockShare
  untouched; the old families still offered in Studio › Painted). The lot lab's **⌫ Erase (E)** mode and Eraser swatch: drag erases under
  the brush (any material, O for only the picked one), a click removes a whole patch, Del the outlined one; one undo per stroke.
- 2026-10-27 10:12: **T190 #492 every sprite sizes 0.5-1.5x at least** (the owner: "always alow ... atleast 50% bigger or smaller"):
  the cap is max(pixel limit, 1.5 x baseline) in lookOf, maxDrawScale, the lab's steps, the engine's scaleOf and the studio card; past its
  pixels a sprite draws a little soft at the closest zoom ("soft at the closest zoom" note, never a block); the Rebuild packs each
  picture at the largest scale the owner's presets draw it (read only, capped at 1.5).
- 2026-10-27 10:07: **T185 done (#491)**: the draft fills the shadow across a wall base's step (chimneys, downpipes, lower porches: no lit
  slivers; the hotel's lit corner hole gone); 606 pictures re-drafted; shadows in 3+ pieces 11 → 0, holes 31 → 20 (the rest real gaps),
  detached 5 → 2. #466 and #474 closed. Tools for later hand fixes in `E:/ClaudeTemp/T185/an/` and `tools/`. The shadow agent is done.
- 2026-10-27 09:54: **T186 #485 sprite shadows take the max with the baked ground shade**: the bake mirrors its shade into a quarter-size
  mask; the shadow layer is RG8 (sprites red, baked green), composited M(s)/M(b) (no darker band where a tree shadow crosses a green's
  edge or a bunker lip); `__game.shadeMax = false` shows the old product; bake 5.4 → 5.9 ms. **The pixel limit vs sizes:** the owner's newer
  rule (at least ±50% for every sprite) beats the 2026-10-24 "no pixelating" cap: T190.
- 2026-10-27 08:50: **T188 #481 the Season card and guide anchors** (P23-UX P2-2, P2-3): the founding chip "◔ 0/9 holes" opens a Season
  card (the month, the founding checklist with Fix buttons that arm and pulse the tool, after founding the tournament plan, the Course
  stats moved in); the duplicate round pill gone in free seasons; `data-guide` anchors and a gold pulse (`GuidePulse.tsx`) for Show me and
  Fix; engine events advance the guide; the welcome card waits for the first baked view. Top bar one row at 1366 and 1600.
- 2026-10-27 08:46: **T185 #482 cast shadows start at the base** (the owner: "shadows are not starting at the base of a sprite"): fixed in
  `shadow-draft.ts` and all 1,524 pictures re-drafted: walls behind porches/decks/steps stand on their own bottom (wall bases outside
  their cast 85 → 2), trees get a trunk band ring and their pool on the trunk, thin legs kept (corner cells joined, 32-point rings),
  end-on vehicles no fake depth (the bus's cast 257 → 127 px); detached casts 17 → 5. Sheets `E:/ClaudeTemp/T185/pr2/`.
- 2026-10-27 08:36: **T187 #478 the toolbar's gaps**: Town decoration › Buildings in golf games (park fountain $12k, bus shelter $1.5k,
  public toilets $9k, small chapel $60k; decoration only: the town has no land value to raise; no stand-ins: bandstand, statue, town
  hall annex requested in GOLF-SPRITES); Course › Buildings › **Halfway house** ($18k, one per course, within 80 m of a tee, front on a
  cart path; half the clubhouse's golfers stop and spend $4); Props filtered by place (course 28, town 22, an All toggle).
- 2026-10-27 08:12: **T182 #472 the toolbar regrouped** (the owner's grouping): Select · COURSE: Driving range (the range card), Course (Holes,
  Buildings, Greenkeeping, Tournament), Decoration (Paths, Props) · TOWN: Traffic (Roads: Build/Upgrade/Downgrade, Junctions, Transport: Bus
  route, Car park, Toll gate), Town decoration (Paint, Props; Buildings in the classic game) · Bulldoze; no key letters on the rail (keys
  work, named in the tooltip); a group locked only when all its tools are; NEW per group; old saves map. Gaps: T187.
- 2026-10-27 08:02: **T185 #473 shadows no longer compound** (the owner: "two shadows blocking the same light does not multiply a shadow"):
  one R8 shadow layer drawn with MAX blending, laid on the ground once as a multiply in one cool colour (`cast-shadow.ts SHADOW_AMBIENT`);
  bench fps the same or better. The audit (1,524 vector shadows) is on #466; sheets `E:/ClaudeTemp/T185/`.
- 2026-10-27 07:49: **T183 #467 the lot lab**: decals work in the wizard (its click handler swallowed them), pick behind sprites, and
  draw on top of all of a lot's ground everywhere; **Select / Draw** modes (a lit switch "↖ Select (V)" / "✎ Draw: Concrete (B)", a banner,
  a brush cursor 0.5-4 tiles with [ ]; strokes merge into one patch per material; Shift erases; R Shape; one undo per stroke); in the
  wizard a click selects (a ring), Del/Backspace deletes (still "not kept"), Ctrl+Z undoes, Draw is saved with the sample.
- 2026-10-27 07:10: **#463 lawns keep their detail**: the streaks along fences are back (the owner likes them); the blanket was the living
  ground's ambient occlusion (a cool multiply over all ground near any house, tree or fence): off (`LIVING_AO = false`); a built
  lawn's local contrast 1.14 → 1.78 at 30% (the raw painting 1.66), its colour back at the painting's. **#443 junction diagnosis**: class
  upgrades add speed not capacity; plain one-lane crossings gridlock by spillback; junction tools save 0.26-0.43x for $3-80k on 10 crossings.
- 2026-10-27 06:56: **#442 + #456 golf towns drive, and the jam is the player's** (the owner: "the guy hasto upgrade his town roads"): the T048
  leave-time bug fixed (no golf town trip ever left); range:gate's default run bands the unattended town's stall; `--player` (a
  harness player upgrading jammed arms each season) reaches P22's bands on seed 1 only (~$810k over 20 seasons, then broke): **the
  owner's balance call**; `JAM_HINT` points at Roads: Upgrade and the O overlay; the range20 fixture is the seed-1 player town.
  **#457** blob shadows are a fake ambient occlusion (`CONTACT_AO` 0.45, centred, 3 px blur). **#458** lawns: the living ground and
  condition layer kept off lot lawns (the owner then said they like the streaks: T181b restores them and removes the flat wash).
- 2026-10-27 06:30: **T180 #451 not by colour alone** (P23-UX D8.1): refused cells hatched with an ✕ (one module `ext/refused-mark.ts`:
  the brush, New hole's left-out cells, blocked footprints, the clubhouse and props ghosts); icons beside ten colour-only states
  (`ui/status-icon.ts`); body text 13 px, secondary 12 px; WCAG AA: `text-slate-500` on panels (2.9:1) → slate-400 (5.3:1).
- 2026-10-27 06:26: **T095 #419 the first minute of a range start** (squash-merged on the owner's word): welcome card (follows the ramp),
  the founding line in the Tier sub-line, the tee ring, three toasts, the 7-step range guide, the unnamed town until "is on the map". The
  lead merged main in first (engine field renamed `playableHoles`: T090 has a `holesBuilt()` method).
- 2026-10-27 06:03: **T179 #448 accessibility first pass** (P23-UX P2-7): one styled tooltip (`ui/Tooltip.tsx`) replaces 44 browser titles on
  the rail and top bar (name, key, the lock's reason: "Roads R 🔒 Unlocks with your third hole or the tour's invitation"); the gold
  focus ring extended to every control; a **UI scale** setting (90/100/110/125%, UI layer only, kept per browser). The top bar stays one
  row at 1366x768 up to 110%; at 125% it wraps to two rows. Shots `E:/ClaudeTemp/T179/shots/`.
- 2026-10-27 05:53: **T177 #441 a grown town keeps its started lots**: in a range start's town a started or built lot keeps its footprint;
  new block and frontage lots fill round it; it goes only if its road goes or a road runs through it. Lost started/built lots over
  20 seasons: 327/425/516 (seeds 1-3; **277-409 built houses removed**) → **0**. range:gate bands pass (`GROWN_PLAN_H` stays 0.5: growth
  is street-limited); town:gate unchanged (the rule is range starts only: in classic towns subdividing closed blocks fills the interior).
- 2026-10-27 05:34: **#440 main's tests green again** (the hole badge's new title and drag-slot class from T174).
- 2026-10-27 05:14: **T098 #436 the grown-town fixture, loader and bench**: `npm run range:fixture` → `tests/fixtures/saves/golf-v5-range-20y.json`
  (seed 1 after 20 seasons: 2,391 lots, 6,648 residents; 36 KB gzipped; save-fixtures test 9); dev-only `?fixture=range20` (not in
  dist; never touches the player's save); bench `&start=range` and `&fixture=range20` stages all under budget (range20 8%: 0.86 / 2.0 ms CPU,
  10,884 instances; no cars yet: fixed next). Note for the owner: the course land shows as the map's autumn field grass, not mown green.
- 2026-10-27 05:11: **T176 #435 New hole's ghost extras** (P23-UX P2-10): the trees a Build clears are tinted (a warm rust in the sprite
  shader, their own light and shade kept; shadows unchanged) and counted as an info check ("42 trees cleared"), the same set the Build
  clears (the clearing code and the ghost share two rules); the ghost draws the collar band the Build lays (first cut, fringe, bunker
  lip, water bank; not charged); map labels and the Build pill fade to 30% within 60 px of the pointer. Shots `E:/ClaudeTemp/T176/shots/`.
- 2026-10-27 04:58: **T090 #428 the town grows from the range outward** (P22 2.3, RISKY): a range start's town grows its own lots at
  `(30 + 3 x holes + 0.04 x built) x success` a season (success set by each tournament, saved as `GolfSave.townBoost`), picks fall off
  from its anchored centre, a lot builds in 240 s, a street every half game hour, the first street and lot ~60 s in at 1x (P22 2.8);
  career grants pay in range starts; fixed: a young town measured its first pick from the map exit. range:gate holds P22 2.7's bands
  over 20 seasons on seeds 1-3 (year 20: 2,056-2,391 lots, 5,610-6,648 residents; no street within 6 tiles of the golf land); classic
  gates identical to the nightly; suite 1926/1926. Finding for a ticket: ~30% of started lots are lost when new streets re-partition
  the frontage (lots.ts). Shots `E:/ClaudeTemp/T090/`.
- 2026-10-27 04:52: **T175 #431 Greenkeeping on the rail + the clubhouse stopgap** (P23-UX P2-5, P2-9): Greenkeeping is a COURSE tool
  (no free key), locked until the first hole is grown in ("hole 1 ready Mar 1985"), then never again; its panel is the Grass panel with
  its cares armed (Overseed, Re-Turf: renamed from seed/sod), Esc drops the armed care; the top-bar Grass button picks it in golf games.
  A clubhouse refused for want of a drive offers **Draw a drive** (Paths › gravel drive from the nearest road); the drive built, Buildings
  comes back with the clubhouse armed at the spot. Shots `E:/ClaudeTemp/T175/shots/`.
- 2026-10-27 04:34: **T174 #426 the hole card** (P23-UX P2-4): select a hole by its map badge (new: drawn at each hole's first tee),
  its Holes panel badge or a click with Select → par, lengths per tee, grow-in per surface, areas, checks with Fix (arms the brush,
  the marker or Edit hole); pin and tee drags never re-plan or charge (`markerMove`, refused off their surface); Edit hole; Delete
  (confirms "no refund", "up to N m²" cleared); renumber by swapping badges (grid, plans, pins, tees, painted areas follow). Also fixed: the
  rail/panel box swallowed map clicks under a short panel. Shots `E:/ClaudeTemp/T174/shots/`.
- 2026-10-27 04:19: **T091 #422 grown-town roads keep off the course**: every golf game's town roads keep 6 tiles off the golf land (old
  starts could cross the course before); `short()` counts only lots that can build; a range start's town lays a leg every game hour,
  anchored between its seed and its built lots, legs near golf land (40 tiles) penalised; a grown industrial district 200-280 tiles toward
  the nearer exit. Classic games untouched. T090 builds on it. The lead typechecks PRs in a sparse `worktrees/lead-typecheck` (moved from `.claude/worktrees/lead-tc`, which agent cleanups removed twice) (no art,
  docs, assets; node_modules a junction: remove it with [System.IO.Directory]::Delete first).
- 2026-10-27 04:08: **T096 #423 the range's look**: most was already built by P24/T086 (props turn with the plot, the range ground group,
  golfers at the bays); added: the range's outfield and target greens are managed grass (`driving-range`, `golf-green` families, grass
  catalog `PRESET_FAMILY`), a turning/placement test, and the range kit P2 → P1 in GOLF-SPRITES with art requests (mats strip, target-green
  decal, a golfer teeing up). range:gate identical.
- 2026-10-27 03:50: **T092 #418 map exits feed the town's visits**: the tourist catchment (clubhouse, tourism, casino) is one per map exit
  on a range start (`visitExits`; classic games keep one entry), its kerb on the lane into the map; the range itself already drew per
  exit through RangeSim (P24 D2), so no worker range cars. All gates as the nightly; range:gate identical. In a new game 15 range cars in
  75 s, 8 and 7 from each end. Suite 1915/1915.
- 2026-10-27 03:09: **T098 #415 the range gate** (`npm run range:gate -- [seed] [days]`, 20 town days in ~10 s, deterministic): a fresh
  range start headless (`harness.ts setupRange`), held to bands from main's numbers: golfers 31-40 a day, takings $7.2-9.6k, lost ~40% (4
  bays), no car left at 05:00, range cars overlapping ≤2% (1.1% today, at the car park entrance and aisles), step times. Seeds 1-3 PASS;
  other gates unchanged; suite 1911/1911. The range20 fixture, `?fixture=` and bench stages wait for T090 (#159).
- 2026-10-27 02:23: **T173 #410 train every use in the lab**: the wizard and gallery follow the lab's lot type (shops, industry, car
  parks/civic/tour) with the game's own layout path and the live model (presets as the head start + the owner's samples, weighted per
  group: shops x4, industry x4, open x11); **Ship model** renders a 24-lot exam (shipped vs live) over the lab and ships on "Ship"
  (`lot-models/v<N>.exam.jpg`, then the model, then the index); counters per group; palette thumbs at mip 2. "Learn from the presets"
  removed (the presets are always the head start). Shots `E:/ClaudeTemp/T173/`.
- 2026-10-27 02:06: **T172 #408 the game's RAM step 2**: the main-thread heap 214 → 127 MB (the terrain label buffer and shadow mesh
  data let go after use, the picking alpha as bits), the atlas keeps 2 decoded levels (24 → 8 MB), the ground chunk cache 32e6 px (after a
  pan 158 → 112 MB). Pixel-identical, no pop-in, bench fps as main; suite 1900/1900. Dropped: 12 tile sources (bake waits doubled).
  **Owner's call:** the dev server's sprite atlas is 383 MB RGBA8 in VRAM (production 96 MB BC7): serve the build's KTX2 pages in dev
  (production look, but a studio Rebuild would need the ~90 s KTX2 encode) or a smaller RGBA8 budget (some blurry cells on pans).
- 2026-10-27 01:42: **T171 #405 items know their place** (model v4 LATEST; v1-v3 unchanged): per-item anchors (kerb, door/front, sides,
  back, fence line, drive/parking edge, corner) and rows; **shops now generate** (a "composed" group lays each known item by its own count at
  its learnt place: bench, rack and bin at the kerb, hvac, cabinet and dumpster by the side, a hedge where the back fence is free); houses
  and industry use anchors (mailbox and bins at the kerb, planting along the front, piles along fences); car parks, civic and tour keep v3
  (anchors made them plainer). Compose time unchanged (55.7 ms, 507 lots generated). Shots `E:/ClaudeTemp/T171/`.
- 2026-10-27 01:14: **T110 #402 textured light and shadow** (the owner's art rule): paint-tool area rims are a shine textured by the
  area's own colours, 0.2 m inside the edge; their shadows and dark rims multiply one cool shade `SHADE_RGB` (112,120,152), the same as the
  course shadows; bunker floor light inset; the Course puck's flat screen washes and cream edge line now textured and inset. Hillshade,
  collars, walls and banks were already compliant; kerbs (2-3 px) and water (no glints) left; prop/tree shadows are T141/T142's. Bake
  time within noise. For the owner's eye: the puck reads slightly softer without its cream line. Shots `E:/ClaudeTemp/T110/shots/`.
- 2026-10-27 00:47: **T169 #399 lots on the fly for more uses** (model v3 LATEST; v1/v2 towns unchanged): **industry on** (junk-yard
  props varied lot to lot), **car parks, civic, tour on**; **shops off** (their frozen lots are composed: hedges along the fence, racks and
  benches by the door, dumpster at the back; per-kind positions laid them worse: T171). A generated lot keeps its preset's buildings,
  patches, fences, street items, parked cars and car-park furniture; no plant on paving except along the fence; no tree within 2.5 tiles of
  a main building's front. Town compose 49.3 → 52.7 ms. Exams and game shots in `E:/ClaudeTemp/T169/`.
- 2026-10-27 00:25: **T170 #397 main green again + the art session's newer tiles**: `RangeSim.newDay` test knows `noPark`/`taken`; the
  painted-tiles manifest test skips with "art moved: re-run prep-painted-tiles" when the art folder moved (strict otherwise). Shipped:
  long-grass canonical (no longer provisional; seams 38.7 → 18.7 NEAR), putting-green finished sets, and **putting-green-paint MID from the
  finished mid-v1 set as made** (new heal method `finished-set-as-made`: it already tiles; T165's fallback grid bands gone). Suite 1888/1888.
  For the owner's eye: the collar's inner cut shows as a faint angular tone edge inside each MID green tile (the art session's report too).
- 2026-10-26 23:56: **T152 #391 range cars keep their distance**: cars keep a car's gap in their lane; building-bound golfers share cars
  (1-4 a car, mean 2.05, seeded by the visit) and the drive's two halves and the building's two lanes in/out carry them; golfers,
  takings and car hours identical. Overlapping moving cars a day: with the building 547k → 22.4k (−96%), 44-bay lot 31.7k → 6.9k (−78%).
  sim/town/fix/event gates pass (fix:gate −11.8% as main). Not taken: a queue cap (−48% golfers), faster car-park speeds.
- 2026-10-26 ~23:00: **T168 #389 no first-use stall**: lazy textures built in 5 ms slices; a chunk that meets an unmade texture waits aside
  while the others bake; idle test-bakes of the 8 chunks round the last one make ahead only what the map lays; the Course tool prewarms its
  brushes; a row-at-a-time noise 4.6x faster. Cold-start bake max 978 → 158 ms, memory idle 3,466 → 3,047 MB (all Edge), the ground
  pixel-identical. **Heads-up:** the lead's typecheck worktree `.claude/worktrees/lead2-read` was removed by someone at 22:43; git run in
  its empty folder fell through to the main checkout (a checkout there aborted, nothing changed). Check a folder is a worktree before git.
- 2026-10-26 ~23:00 → 23:50: the usage limit stopped the lead and the lot agent; both resumed at 23:51.
- 2026-10-26 ~22:45: **T154 phase 2 #386 eight headings**: on a 45° road a building with a screen-axis set faces its street (road 1 → N,
  3 → E, 5 → S, 7 → W; never mirrored; footprint from the set). 14 buildings have sets (five parking garages, bakery, grocery, pharmacy,
  three industrials, `world:house_0/1/3`); the owner's 45° presets use houses without sets, so a real 45° street looks the same: 65 of
  the 74 buildings the presets place lack sets (missing-views list in `docs/GOLF-SPRITES.md`, `world:house_5` first). `?oldheadings`
  for comparison. **#387** the presets test accepts removed pictures (T167 stand-ins): main's two lot-presets-json failures fixed.
- 2026-10-26 ~22:25: **T161 #384 pairs, densities by state, the exam** (`lots/taste.ts`): partners learnt within 2.5 tiles (doghouse +
  sandbox + oak, mailbox + bins, hvac + cabinet); densities by state (upgraded lush, decrepit junky); **model v2 is LATEST** (a v1 town
  composes exactly as before: a save without `lotModel` stays v1, so the owner's existing town keeps v1; a new game uses v2). `npm run
  lots:exam` renders 50 fixed lots (4 axis roads x 3 states x sizes) as a contact sheet (`E:/ClaudeTemp/T161/exam/`).
- 2026-10-26 ~22:10: **T166 #380 the game's RAM about halved** (the owner: "we need to optimise the app"): one ground worker instead of three
  (three baked no faster: one GPU process), lazy procedural textures and photo mosaics, no IndexedDB texture pack (the old one deleted once).
  All Edge processes idle 5,895 → 3,316 MB, after a pan 5,949 → 2,910, after 10 jumps 7,095 → 3,671; VRAM 3.4-4.3 → 1.5-1.9 GB; browser
  process 455 → 56 MB; ready 5.9 → 3.0 s; bakes faster (bench 15.7 → 9.4 ms, district fps 47-54 → 57-59). The ground pixel-identical
  (NEAR 202 of 924,800 px by ≤2 levels). CPU canvases tried and dropped (bakes 9 → 38 ms). Cost: a ~1 s stall the first time a texture is
  needed (T168). Dev switch `?ground=old|lazy,one,two,soft,cache` and `scripts/perf/memory.mjs` measure each lever.
- 2026-10-26 ~22:00: **#376 generated lots keep their garages and sheds** (every building of the frozen preset stays; nothing generated
  lands on them). **T167 #377 removed pictures are never drawn**: the declined presets placed the removed rundown house (70), derelict
  two-storey (35) and fire station (48), so decrepit streets had no houses; now the house is an allocated dwelling of its size class that
  fits the band (seeded by the lot), another building one of its kind within 40% of its footprint, expansions and props left out; a badge in
  the lot lab marks each stand-in; the owner's files only read. Decrepit streets now show ordinary houses: real decrepit house art is an
  art request. Main typechecks with both, lot suites 42/42. The lead typechecks PRs in `.claude/worktrees/lead2-read` (node_modules is a
  junction to theme-consistency's: remove it with [System.IO.Directory]::Delete before removing the worktree).
- 2026-10-26 ~21:45: **T160 #374 lots generated on the fly**: a house lot whose preset is frozen (not the owner's own) keeps its house,
  drive, walk, street items and fence; its plants, props, cars and decals come from the generator (`lot-gen.ts`) with the shipped model
  `lots/lot-models/v1.json` (87 presets, 2,709 items), seeded by street key + slot + state; the save records `lotModel` (missing = v1);
  the lab's "Ship model" writes the next version; `?oldlots` composes as before. Compose of a whole town ~54 → ~32 ms (a `carOwnerScale`
  memo). Known: garages/sheds dropped (follow-up in flight); decrepit houses not drawn (before too: T167).
- 2026-10-26 ~21:20: **T165 #369 fairway and putting green from the new paintings** (`art/owner-supplied/{fairway,putting-green}-20261026`,
  families `fairway-paint`, `putting-green-paint`): edges healed with a matched bridge (no seam line); the putting green MID falls back to
  the raw MID tiles with one shared strip (the painting's bright corner repeated). The fairway's mowing stripes fan out in perspective,
  so no crop lines them up: a soft stripe kink stays at the wrap. Straight stripes need a fairway painted without perspective (or without
  stripes: the game draws its own mowing bands). Old `fairway` / `putting-green` families kept as the option.
- 2026-10-26 evening: **T164 #361 + #366 main's tests green after the Rebuild**: a frozen house preset's house keeps its yards at today's
  sizes (`compose.ts houseYards`: moved along the frontage into its band; `pickedPreset` prefers presets whose house fits);
  `draft-shadows.mjs` drops shadow entries for pictures the library no longer has; newart-default pins no stand-in count. **T159 #364**
  the lab's "Learn from the presets" (every item on the owner's lab and edited presets a kept sample, learnt again in place) and the
  **lot gallery** (a dozen generated lots, Good / Bad each, Space saves and lays the next, Fix opens one in the wizard).
- 2026-10-26: **T162 #360 the owner's rough** (`art/owner-supplied/rough-20261026`, family `rough-owner`, one tile a level): edges healed once
  in the asset step (`scripts/assets/tile-heal.mjs`, wrap-bridge 48 px); `rough` and `lawnDeclined` wear it. **T163 #359 parked cars vs the
  studio size**: sizes always matched; a studio save now reaches the running dev game at once (`lots/scales-live.ts`), and cards past a
  picture's pixels show the size the lots draw. **#357 tests never block a merge** (merge on review + typecheck; fix forward).
- 2026-10-26: **T157 #354 the lot lab runs light** (the owner: "the studio is taking too much ram"): boot options (`src/game/boot.ts`; the game
  unchanged), the lab's light boot under `?lotlab` (one CPU-canvas ground worker, no sim/save/town/golf, lazy textures, a small atlas, a
  320-tile box; `?lotlab&fullboot` for the old way); the studio's Lots frame only while open. Lab memory 4,179 → ~1,340 MB, VRAM 1,898 → ~290
  MB. `scripts/perf/memory.mjs` repeats the measurement. Follow-ups noted: the game's three ground workers hold ~450-630 MB of texture pack
  each (the lazy textures could help); the owner's own Chrome GPU process held 10.3 GB.
- 2026-10-26: **T158 #352 the lot wizard** (W in the lab: click deletes, Space saves + next in ~36 ms, S skips; 12 sectors, Beta keep
  rates, `lot-learning.json` via POST /__dev/learning; `lot-gen.ts` a pure seeded generator for P25). **#353** the studio Rebuild output
  (the owner's latest sizes over the new art; the studio now runs with VIPS_CONCURRENCY=1 in launch.json: the Rebuild failed for memory
  without it).
- 2026-10-26: **T154 #345 the new art in the studio and the game**: 28 screen-axis sets (`sync-axis-views.mjs`, `prep-axis-views.mjs`,
  `axis-library.ts`, both in the Rebuild): parking garages 2-6 storey (the 6-storey is the range's car park building), a Landscaping
  category (3 bushes, 3 flowerbeds, hydrangea; in the lab palette and the Props tool), shops/industrials/houses with 8 views, bench/lamp/
  bin/gate, the wagons' and pickup's views. **#346** saved the owner's uncommitted studio data first (lot presets +2,976 lines, sizes,
  removals); the 5174 checkout's local Rebuild output was backed up to `E:/ClaudeTemp/lead/owner-rebuild-backup-20261026/` and the checkout
  brought to main; a studio Rebuild then packs the owner's latest sizes on top. **Open, the owner's call:** lot presets still place three
  removed ids (`town:firestation` and two variations): restore them or re-point the presets.
- 2026-10-26: **T155 PR 2 #342 lots auto-sized from a master**: the largest size of a type/state is the master; Save/Approve derives every
  smaller size of its road (`src/game/lots/derive.ts`: the house keeps its street edge, yards shrink, trees then large then small props
  drop); derived ids `master~WxD`, a hand edit detaches; a masters report (3,744 type x state x size x road cells today).
- 2026-10-26: 5174 had died (the app's crash takes the lead-started servers with it); restarted. Suggested to the owner: start 5174/5191 from
  their own terminal so a Claude crash does not stop them.
- 2026-10-26: **T155 PR 1 #340 the lot lab's new layout**: drawer = lot choice only; toolbar over the map; floating selection bar; bottom
  palette strip (built from LIBRARY: new art shows up by itself); right inspector with **house allocations** (8-road compass, built /
  upgraded / decrepit; `src/game/lots/house-allocations.json`, POST `/__dev/allocations`; Generate, New lot, variants and Change house only
  deal houses that suit) and a coverage table; **lawns by state** (`lawnBuilt` fairway, `lawnUpgraded` putting-green, `lawnDeclined`
  sage-long until long-grass is repaired).
- 2026-10-26: **#337 fescue at half size up close, MID and FAR earlier, zoom-out stopped at 1.25%** (the owner): anchors near 0.6 / mid
  0.2 / far 0.05, nearUntil 10%, new farFrom 2.5%, ZOOM_MIN 0.0125 (FAR 0.25x there, ~4.4 tiles across 1920 px). **#335 rough back on
  sage-long** (the owner: the provisional long-grass "clearly not right").
- 2026-10-26: the Claude app crashed twice; after each the lead restarted the auto-updater and the studio and resumed T154/T155 by message.
- 2026-10-26: **T153 #332 zoom and golf textures**: ZOOM_MIN 0.0075 (one ZOOM_STEP 1.25 fewer; clampZoom), FAR native there, NEAR until 5%
  (`anchors.nearUntil`); sand-ripples (canonical, id sand-ripples-tiles) → waste; fairway, putting-green, long-grass **provisional** from
  the raw v1 tiles → fairway, green+fringe, rough (a re-run of prep-painted-tiles switches each to its canonical selection when
  READY-MATERIALS lists it). The provisional rough shows hard seams (raw art). Follow-up: bring the turf-condition pictures back on tiled
  turf (lead's call: yes).
- 2026-10-26: **#329 blob shadows 2 px blurrier** (the owner): every drawn contact shadow's rim +2 px (`shadow-vector.ts BLOB_BLUR`), the
  fallback blob shader +0.0625 m.
- 2026-10-26: **T151 #324 world labels never overlap**: one placement pass a frame by priority (`label-place.ts`, `world-labels.ts`;
  names 100, counts 90, stand-ins 10), slots kept while free, hidden when crowded; money float columns lifted clear.
- 2026-10-26: **T148 #321 the lot lab's editing tools**: multi-select (Shift+click, box drag) with group move/delete/turn/size as one undo,
  Ctrl+C/V across lots, Change house (H, same family and size class), Lot grid (L), Generate in place + New lot ▶, Neighbours (N).
- 2026-10-26: **T150 #319 painted tiles at their true size**: one fixed world size per set, native at its anchor (NEAR 30% from the
  near-shop reference, MID 10%, FAR at the furthest zoom 0.6%), never magnified, real zoom, switches only at anchors (4% hysteresis).
  **Open, the owner's call:** at DPR 1 a FAR tile at native is wider than the map at the furthest zoom (2x2 tiles at DPR 2); MID shrinks
  to tiny repeats just before FAR pops in 16x larger at the last zoom step; the alternative is FAR at its own reference scale (~5.5%).
- 2026-10-26: **T147 #317 money floats**: green +$X where money comes in, red -$X where it goes out, red with a reason for lost sales
  (the treasury untouched); one per sale from zoom 0.2, merged per place 0.12-0.2, none further out; gear-menu "Money floats"
  (`src/game/moneyfloats.ts`; the range via `RangeSim.onMoney`, the worker's money buffer, purchases at the click point).
- 2026-10-26: **#314 the map's open grass draws golden fescue and rivers draw lake** (course turf and town lawns stay green until their
  families exist).
- 2026-10-26: **T145 #311 the hand-painted terrain tiles**: golden fescue (surface `fescue`) and lake (surface `water`), three authored
  sets NEAR/MID/FAR of four 1742x902 tiles each, hash-verified by `scripts/assets/prep-painted-tiles.mjs` from
  `eight-tiles/READY-MATERIALS.json` into `src/assets/ground/painted/tiles/` and `src/game/painted-tiles.json`; world-anchored seeded
  permutation, 12 zoom steps with hysteresis, the step in the worker/chunk keys; readout under `?debug`. Next families: add to
  READY-MATERIALS, re-run the script, map a surface. Follow-ups in T149.
- 2026-10-26: **T146 #308 the range's car park building and parallel counters** (P24 D49-D55): a $36,000 multi-storey car park (180
  cars, stand-in + art request `golf:range-carpark`), the pro shop's counters one per 9 bays, the skip capped by bays and parking. A full
  36-bay range: bays taken at peak 19 → 36, live day 125 → 420 sold, no car turned away. `RangeSim.onMoney` for T147.
- 2026-10-26: **T144 #302 the studio's Library page is light**: WebP card thumbs at four size steps, cards scrolled far away drop their
  pictures (decoded pictures held: 545 MB → at most 26 MB). The 5191 studio was restarted on it.
- 2026-10-26: **#298 the gates retuned to the game as it is** (#285 closed; the bisect found intended features, not a regression: #87 woods
  buildable, 78e5472 three-town growth, 0c58278 parking fees). fix:gate refuses a city not at capacity (exit 2) and defaults to seed 1
  day 60; a round books its parking fees like its tolls (`Round.parking`); event:gate reconciles with them, (b) measured on the fixed
  towns, (c) every car parked and >= 99%.
- 2026-10-26: **T143 #297 one Library card per car** with every rotation, facing and view as thumbs and one size (`ext/car-art/model.mjs`
  `carModel`, shared by the game and the pack scripts; old per-facing sizes folded keeping the largest; Vehicles 65 cards → 9). A
  Rebuild packs the car pixels at the models' sizes when the owner is done sizing. The 5191 studio was restarted on it.
- 2026-10-26: **T142 #292 a hand-drawn vector shadow for every asset view** (1,421 drawn shapes in `src/game/shadow-shapes.json`, drafted
  from each picture by `scripts/dev/draft-shadows.mjs` + hand hints in `shadow-hints.json`; T141 behind the gear-menu toggle "Drawn shadows
  (T142)"; a new picture needs an entry or `tests/shadow-vector.test.ts` fails: run the draft with `--only <ids>` against a dev server).
  #294 the l-shape house restored with its shadows and the Rebuild output.
- 2026-10-26: **#290 the lot lab lands on main**: the lot presets and the lot lab (`?lotlab&dev`), cars and business art resizable, and the
  Library's locked sizes fixed: the studio's Rebuild never ran `prep-views.mjs` (nor prep-cars, prep-business-art), so a size set on a
  four-view building was never packed; now Rebuild runs every pack in dependency order and stand-ins are packed for the largest size
  any building drawn as them needs (`newart.ts standInNeeds`, `stand-in-needs.ts`, `prep-views.mjs packFor`, 3x source cap). A Rebuild
  takes about 12 min (prep-sprites 10). Only `golf:clubhouse-shanty` still cannot reach its size (needs higher-res art).
- 2026-10-26: T044 #287 build stamp and save download/load/backups in the gear menu (P07 5-6); T041 #284 transport panels' fine controls
  under All tools, golf wording (both orphaned 2026-10-24 work, found at the account switch); #286 the gate scripts' image loaders.
  Removed the merged and dead worktrees (63 GB free on E:). About 32 unregistered old folders (~10 GB, 2026-10-22) remain in
  `.claude/worktrees` (main-merge, golf-art, brush-round, ...): ask the owner before deleting.
- 2026-10-26: T141 #279 every prop's shadow made for the top-right sun (1,638 views audited; whole-word name rules, shapes fitted to the drawn picture, one lean for blob and box, `shadow-overrides.json`; the audit page `?shadows=audit` and `docs/art/SHADOW-AUDIT.md`; left: front-facing fence panels, two-post signs).
- 2026-10-26: T140 #277 the town roads' kerb face across chunk borders (`kerb-face.ts`; the leaf litter's square shade too; the shared test raster in `tests/helpers/soft-raster.ts`).
- 2026-10-26: T139 #268 cart-path bevel; T136 #267 Shadow slider for painted areas; T137 #266 three-way wall junctions; T135 #264
  the new game's month, one grow label, the top bar on one row, unknown business types; T138 #263 the puck's marks off its face.
- 2026-10-26: T134 #256 dark unbaked ground; T133 #255 World of Golf extras; T132 #251 range to first hole; T119 #248 New hole
  finished; T122 #247 Run; T130 #245 practice greens; T131 #244 Props tool.
- 2026-10-25: T129 #240 the range business (P24); T128 #234 painted ground everywhere.

### Machine facts
- **Memory:** the PC has 16 GB shared by several Claude sessions, VS Code and Codex. With many open, git checkouts of the 2-3 GB packs
  fail (use `git -c checkout.workers=1`); on 2026-10-26 the Agent tool's own worktree failed this way ("packed object ... is corrupt" is
  the failed allocation, not real corruption: `git cat-file -s <sha>` reads it fine): make the worktree by hand with checkout.workers=1. Run one heavy step at a time.
- **Disk:** E: has about 30-45 GB free. Each agent worktree with node_modules is about 4.3 GB. Remove it as soon as its PR merges.
- **Others in the repo:** other sessions work here too (branches `lead/golf-play`, the people session's `worktrees/people-ground`,
  `finite-atlas-runtime-20261026`). Do not touch their worktrees.

## History: owner-requested integration (2026-10-23)
- Branch: `lead/merge-outstanding-20261023`, isolated checkout `worktrees/outstanding-merge-20261023`, from main `72317a9`.
- Request: merge every outstanding product branch/PR into main and document the image-creation workflow in the handover and main repository.
- Integrated: PRs #13 (historical sprite sources), #12 (completed grass catalogue), #17 (dusk sprite library, through `27eb91e`), #16 (ghost preview module), plus local shadow commit `b941683`, all without conflicts.
- Next action: finish the canonical image workflow and handover links, correcting stale branch/resume instructions. Fresh dependency install, typecheck, full tests and production build are running in the isolated checkout; perform built-game shadow checks, refresh origin/main and land only the verified combined result.
- Other worktrees remain untouched. The dirty frosty parking files are already landed through `99840d6`; local launcher changes are machine settings. Do not copy those old files onto main.
- This integration does not start M2.5 or generate new images. The existing milestone plan below remains unchanged.

## History: status log 2026-10-25 late to 2026-10-26 morning (superseded by START HERE)

- **Main:** 61263c5 (after #240). 5174 runs main (auto-updater restarted after the power cut: `bash E:/ClaudeTemp/autoupdate-5174.sh`
  in the background; the 5174 server is `.claude/launch.json` config `lead-game`). No nightly report yet (the first run is 2026-10-26 02:06).
- **T128 merged (#234):** hand-painted art on every surface, Studio › Painted picker, Blend with and Border texture on the course, no photo
  textures in play (`?grass=photo` dev only). **The owner: "the grass isnt good. I am getting new textures made now."** New paintings go in
  through `scripts/assets/prep-painted-families.mjs` (art under `art/theme-consistency/generated/ground/painted-scaled/<family>-v<n>/`, the
  families list in the script) and are mapped per surface in the studio. Left: painted Paint-tool areas have no Shadow slider (needs an
  edge-shade model); the rough (sage long) is streaky at 30%; a dark, unbaked ground for ~24 s after a fresh start (headless Edge, dpr 2, also
  on main before T128): worth its own ticket.
- **The owner's new direction (2026-10-25): the range business first, then the course** ("Think Vodacom's World of Golf"; done by Opus 5.5
  on high). Plan **P24** `docs/plans/P24-RANGE-BUSINESS.md`. **T129 merged (#240):** the ready-built range (striped outfield, tee box and
  mats, flagged greens, yardage markers, fence, cement paths, sign), the caravan and back yard, the crappy pro shop, golfers who buy buckets and
  hit visible balls, the queue, the range card with 8 upgrades. Follow-ups: the label glyph after "DRIVING RANGE", the onboarding pill still says
  "Step 1: Build your first hole" in a range start (Phase 4), the car park reads P · 0/44 while range golfers are parked.
- **T131 merged (#244):** the Props tool (key Z, `golf/decor.ts`, `golf/propstool.ts`, `ui/course/PropsPanel.tsx`): plants, fountain,
  well, statue, pillars, arch, benches, lamps, flag pole; place, turn, move, sell (half back), one undo step each (`PaintTool.step`); appeal
  `RangeExtras.propsAppeal` within 15 tiles of the shop or mats, capped at +40%.
- **T130 merged (#245):** the practice area across the drive from the range's car park; the player paints a putting green (300 m²) and a
  chipping green with a bunker with the course brush; cells held at hole 0; +10% appeal and $2 a golfer each; putters and chippers drawn;
  hints with Show me; the range's tee box laid into the course grid (T127 banks raise it). Plan decisions D18-D29 in P24.
- **T122 merged (#247):** Run (Holes › Shape by hand › Brush | Run | Erase; `ext/course-cursor/run.ts`; a 200 m run 0.28 ms).
- **T119 merged (#248):** New hole finished (its own undo, the Esc ladder, the 4.4 check table with practice-area rows, Seed default and the
  money line, the number picker, the camera fit; `TEE_VIEW_M` = a 450 m radius, kept by the lead so a par-5 green is in view).
- **T132 merged (#251, P24 Phase 4a):** the range start's unlock order (minute zero: Select and Bulldoze → first upgrade: Holes' Green and
  Bunker, Paths → putting green: Props → $20k a season or season 2: New hole and Buildings), the onboarding pill in that order, a 150 m par-3
  suggested first, props diminishing by kind (80% each), upgrade upkeep monthly, the range's own presets "Range outfield" (stripes last) and
  "Range target green" (paint-presets.json, painted-surfaces.json), the stadium label fix, the car park counter, decor in Select, a T129 bay bug.
  Balance table and D30-D40 in P24.
- **T133 merged (#255, P24 Phase 4b):** coffee kiosk, ball picker cart, second tier (double-deck, `Drawable.lift`), golf academy, the home
  growing caravan → cottage ($100k lifetime takings) → house ($400k); D41-D50 and the balance rows in P24. P24 is complete.
- **T134 merged (#256):** the dark ground. Root cause: baked chunks drew nothing while the zoom crossfade waited for every visible chunk,
  and an edge chunk was never requested (planting stopped one tile short of `CHUNK_CASTER_REACH`). Fix: `ground-layers.ts chunkLayers` (a
  chunk always draws its older, new or planner picture), planting to the caster reach, planner pieces first and evictable, the builder worker
  kept free while it saves the texture cache. Dark time over 40 jumps 28.1 s → 5.7 s; confirmed in a headed browser.
- **Known bugs done (2026-10-26):** T135 #264 (a new game's month: `Sim.restartClock` from `City.terrain`; one grow label
  `golf/growlabel.ts`; the top bar on one row at 1366/1600/1920, chip words from 2200 px; unknown business types dropped on load),
  T136 #267 (a Shadow slider for painted areas: `PaintArea.shadow`, `paint-edges.ts AREA_SHADE`, `renderer.ts areaLight`; area look
  changes undoable), T137 #266 (clean three-way junctions in `ext/course-walls`), T138 #263 (the puck's marks moved to a badge beside
  it), T139 #268 (cart-path bevel: rims drawn from the paths stepped by `SUN_TILE_DIR`, `cart-bevel.ts`, no chunk-seam bars). The
  fringe's olive ring was fixed by T128.
- **Follow-ups found:** the town roads' kerb face slides its chunk mask the same way T139 fixed for paths (a gap at a chunk's bottom
  edge); the owner may want the top bar's chip words back at 1920.
- **5174 note:** the `capital-empire` launch entry now serves `worktrees/theme-consistency` (it served the stale main checkout,
  `arena/T026-course-height`, which showed the old three-town start). The machine runs short of RAM with many sessions open; git
  checkouts of the 2-3 GB packs then fail (use `-c checkout.workers=1`).
- **Next (owner's call):**
  - The owner's new grass paintings, when they arrive (prep-painted-families.mjs, then the studio).
  - P24 follow-ups: a bigger range car park or parking with the second tier (D49); labels overlapping at the shop front; the putt, chip and
    coaching clips; real art for every stand-in in GOLF-SPRITES.md's range, practice and props kits.
  - The handover's list: known bugs (the new game's month, "growing · ready" in the status line, the top bar wrapping at stage 3, a Shadow
    slider for painted areas, T099's sliver), T110's rest, P23 Phase 2 (one Streets tool, holes drawn like a road).
- **Housekeeping:** each agent worktree with node_modules is ~4.3 GB. E: fell to 4.5 GB free on 2026-10-26 ~00:30; the lead removed this
  session's six merged worktrees (T119, T122, T128, T129/NOW, T130, T131). Remove each agent's worktree as soon as its PR merges.

## History: HANDOVER 2026-10-25 evening (its rules are now in docs/AGENT-BRIEF.md; its open work is in START HERE)

**Main:** 864b910 (after #236). The owner tests on **http://localhost:5174** (dev server from `worktrees/theme-consistency`, branch
lead/live; never edit that checkout by hand). The studio runs on 5191 when started (`.claude/launch.json` config `studio`).

**How the lead works now (all owner rules; also in CLAUDE.md and the lead's memory):**
- Delegate code to agents (general-purpose with worktree isolation for real tickets; haiku-coder or haiku-runner for small
  jobs). Every brief says: never write to C:; E:/ClaudeTemp and E:/npm-cache; one heavy run at a time; never touch 5174/5191;
  **stop every server and process you started** before reporting; never commit lot-presets.json or scale-overrides.json
  changes it didn't make; merge origin/main before the PR.
- **Testing (#232):** coders run typecheck plus their own and neighbouring tests only. The lead merges on that plus a review,
  after checking the PR contains origin/main. **Nightly** scheduled task "CapitalEmpire nightly regression" (~02:00, runs while
  the desktop app is open) runs the full suite, build and gates in `.claude/worktrees/nightly`, writes
  `E:/ClaudeTemp/nightly/<date>.md`, and opens a `[nightly]` issue on real failures: **read it each morning and fix those first**.
- **5174 auto-update:** a background loop pulls each merge into 5174 within a minute (hot reload). It dies with the chat:
  restart it with `bash E:/ClaudeTemp/autoupdate-5174.sh` (run in the background; log `E:/ClaudeTemp/autoupdate-5174.log`).
- The owner pre-approves the lead's recommended decisions (state them in chat). The lead may merge reviewed PRs. Push or
  publish the job board (gh-pages) when asked.
- **Art rules:** sun at the upper right, shadows at 145°; no visible repeating texture (mowing stripes excepted, drawn last on top);
  highlights masked by the texture and inset from edges, shadows a cool multiply keeping texture (T110); **no old photo
  textures visible anywhere** (the owner, 2026-10-25); stand-ins labelled "Stand In for <name>".

**Open work, in priority order:**
1. **T128 (#233, PR #234): hand-painted art on every surface and preset.** The agent stopped at a usage limit; its work is pushed
   (branch arena/T128-painted-everywhere, WIP commit 208da52). Start a new agent on that branch to finish it:
   - map every surface to the families in `art/theme-consistency/generated/ground/new-painted-spatial-scales-20261025.json`
     (painted-scaled/, coverage near 40 m, mid 320 m, far 4096 m);
   - remove the gear menu's Painted/Photo toggle (keep a dev-only `?grass=photo`); no photo textures in the pickers;
   - make **Blend with** and the **border texture** work for course surfaces, or hide them;
   - give the studio a family picker for every surface (the owner fixes the mappings there);
   - list paved surfaces without painted art as art requests;
   - review the screenshots, then merge.
2. **P23 Phase 1 wave B** (docs/plans/P23-UX.md 6.1): **T119 (#213) New hole, finished** (camera framing, own undo, build checks
   with Fix, Seed default) and **T122 (#216) Run** (a road-like strip of cells next to Brush in the Holes panel).
3. **Known bugs:**
   - a new game starts in the wrong month (the clock carries over, e.g. Jul 1985 instead of Sep 1984);
   - the "growing · ready" text belongs in the status line and hint pill (App.tsx);
   - the top bar wraps at stage 3 with the invitation pill;
   - painted areas have no Shadow slider;
   - the fringe shows an olive ring (texture);
   - T099's sliver where a green, a pond and the rough meet.
4. **T110 (#193) rest of the game:** paint-edges rims, the road kerb highlight, water glints, prop and tree shadows. Height light
   (T126 #235), walls (T099) and tee banks (T127 #236) already follow it. T075 stripes: wire `stripeBands` as the **last** layer on
   top of mown surfaces.
5. **Post P23 Phase 2** tickets, with the owner's approved picks: keep today's keys; Paint stays on the rail; the style editor in
   Holes › More options › My looks (done in T120); keep the right-click rule; the half-grid spotlight over a faint grid; the map
   grid only while building (done, #221); **one Streets tool** with tabs Cart paths · Drives · Roads; **holes drawn like a road**;
   course homes grow along drives. Also season and hole cards, greenkeeping, land, and an accessibility and 1366 pass.
6. **The rest:**
   - P22 remaining T090-T098 (T094 waits on P03 T055/T056);
   - P21 T101, T103-T107;
   - P19 T068/T069b/T070, not posted;
   - M2/M3 tournament day and transport leftovers;
   - T112 (sharp 0.35 bump).
7. **Art:**
   - buildings 144 of 204: the art chat generates; integrate as in PR #143;
   - ground prompts in docs/art/GRASS-PROMPTS.md (17-20 are the living-ground variants) and docs/art/WALL-PROMPTS.md.

**Merged today (for orientation):**
- **Course:** T099 3D collars (#201); T100/T108/T109 grids, the cursor and 1-cell building (#196); T102 the New hole wizard
  and T074 the hole plan (#204/#205); T113 course props (#200); T114 stand-in labels (#203); T123 wizard reset, grow-in,
  Border and Shadow sliders (#224); T124 roads off the course (#226); T125 rub out with carve (#229); T126 height light (#235);
  T127 tee banks, rock and stairs (#236).
- **Ground and art:** T082 painted grass (#194); T111 living ground (#206); #143 13 buildings.
- **Performance:** T080 art as separate files and compressed GPU pages (#180/#182/#195).
- **Plans:** P22 (#173-#177); T115 range-start fixes (#208); P23 plan (#209).
- **UX Phase 1:** T116-T118 and T120 (#217, #218, #220, #227).
- **Job board:** live and reconciled (#231): 86 of 141 steps, about 8-10 working days for the planned tracks.

**Housekeeping:**
- Remove merged agent worktrees under `.claude/worktrees` (keep `agent-acd6950cf3042c7c6` and `agent-af505db199879b80d`: the
  runner worktrees, with node_modules) and `nightly`.
- E: had about 58 GB free.

## Current step
- **The new lead's board** (2026-10-24, LEAD.md section 5). Open tickets: GitHub issues `arena` + `status:open`.
- **M2.5 (P02):** T048 and T050 landed (the tournament day clock; the movers on the timeline). Next on the city.ts / event chain: T051b (galleries follow the play, wiring T051a), T052 (viewing and tents from the movers), T053 (the tournament-day strip).
- **P03:** T055/T056 after that chain (surge.ts / city.ts are single-owner).
- **P22 (the new start, plan merged #153):** T085 #173, T086 #174, T087 #175, T088 #176 (founding seasons, the tour's invitation) and T089 #177
  (the player-placed clubhouse) merged (2026-10-24 night). A new game: one county road, the driving range, the town seeded across the road and
  growing outward, off the course land; `?start=town` keeps the old start; old saves keep their towns. Next: T094 (off-map tournament crowd: today
  only 37% arrive before tee-off; needs P03 T055/T056), T095 (first minute; needs P21's hole wizard and cell brush tickets), T090/T091 (grown-town
  growth; roads off the course in every golf game: rerun town:gate and towns:gate), T092/T093 (exits and through traffic), T096 (range look, the
  clubhouse's four-way facing), T097, T098 (range:gate, grown-town fixture).
- **P21 (the course grid), all on main:** T072, T073 #134, T076 #140, T078 #142, T077 #145, T077b #170 (contouring in workers: a dab about 1 ms of
  main thread), T081 #171 (the 3D surface puck cursor, grid and glowing footprint). Flash's T075 #137 (edge light, stripes) and T074 #138 (hole plan)
  wait on their review findings. Re-contouring only changed surfaces needs a per-surface entry point in course-blobs.
- **P19:** T067 merged; T084 #172 (course paths in the Course menu: dirt 2 m $8, cement slab 2.5 m $20, paved 3 m $45 per 2 m, dev unlock).
  Cart paths are lane-less roads in the main network until T068 (their own network) moves them. T069a, T068, T069b, T070 next.
- **P20 (lot presets), all on main:** #130, #132, #139 (the in-game dev editor, `?dev` or I). The owner edits presets live on 5174; commit their
  saves (lot-presets.json, scale-overrides.json, studio atlas pages) as "owner edits" PRs (#151, #169). Compose digests pin at TABLE_SCALE.
- **Sizes (#125):** nothing drawn past its native pixels on any path. GPU memory 1050 MB at dpr 2 (budget 96 MB), and the single-file build is
  324 MB with about 1 GB of RAM to spare: T080 #141 (compressed pages, residency, separate asset files) is next in priority after the art settles.
- **Art:** #143 (144 of 204 four-view buildings). Game-art grass: T082 #147, the prompt sheet docs/art/GRASS-PROMPTS.md (three zoom images per
  surface, each shown at its own pixels: close 21 px/m = 48 m per 1024 px tile, mid 96 m, far 192 m); the owner is generating textures.
- **Housekeeping:** remove merged worktrees (E: about 58 GB free). Runner worktrees: .claude/worktrees/agent-acd6950cf3042c7c6 and agent-af505db199879b80d.

## Findings: what a golf tournament day simulates today (2026-10-23)
- **Start:** `City.startTournament` (city.ts) at the season's end: the crowd is `spectatorDemand(tier, rep)` (day 1's share, less the
  parking-fee cut) in party cars of `PARTY` = 3 fans, split over the towns by population (`crowdFor`); the season clock freezes; the surge
  starts at once (`beginSurge`: `planSurge`, `startBuses`).
- **Simulated:** the surge (`event/surge.ts`): party cars leave the towns' homes over the first `DEPART_END` = 55% of `SURGE_S` = 600 sim s
  and drive to the car parks (`parks`, their sinks); each parked car's 3 fans walk (`City.partyWalk`): to a shuttle stop if their car
  park has a route (`event/bus.ts`, buses in the sim), else (`walkDoor`) straight to the nearest of the **clubhouse plot's 4 "doors"**
  (`event/site.ts` siteAt: the middle of each side of the site; the site is the clubhouse business plot in golf mode), where they count
  as arrived at once (`Crowd.arrive`). Walkers and stop queues are drawn (engine `drawCrowd`, the walker sprites). **Kick-off**
  (`City.kickOff`) takes the counts: arrived fans, cars parked; tickets are paid per arrived fan.
- **Formulas (not people):** the gate queue, lateness and the exit time (`golf/yearend.ts` `measureGateFlows`: a fixed arrival curve
  07:00-13:00 through the gate lanes of the placed gate structures), viewing, satisfaction, money (`computeYearEnd`, `tournamentday.ts`).
- **Missing:** gates as places with queues; the spectators inside the course (galleries round the holes, grandstands, tents); the walk
  back and the **drive home** (`closeRound` despawns every car: "the roads clear after the event"); the seasonal crowd from outside the town
  (everyone comes from the town's homes).

## The M2 design (decision in LEAD.md section 5)
- **M2.1 Course gates.** The gates are the placed Event structures of kind 'gate' (their rectangle's middle; lanes = the structure's
  capacity); with none, the clubhouse plot's doors as today (one lane each). Fans walk from their bay to the nearest gate, join its queue
  (a FIFO of parties), and are admitted at the gate's rate (`GATE_LANE_PER_HOUR` = 600 a lane an hour; one sim s = one game minute, so
  10 a lane a sim second); admitted fans are the ones inside (the counts kick-off reads). The queues are drawn like the shuttle stops'.
- **M2.2 Galleries.** Admitted fans go to gallery spots (the featured holes' tees and greens, grandstands, tents) and stand there as
  crowds (counts per spot; drawn as dense groups); tents serve them.
- **M2.3 Going home.** At the day's end the fans walk back to their car park and their party cars drive home (respawned at their bay,
  bound for their home lot): the egress traffic. The round's eval shows how long it took.
- **M2.4 Results from the movers.** The measured gate waits, the late fans (admitted after their tee time) and the exit times replace
  `measureGateFlows`' formula.
- **M2.5 The tournament on the town day.** The tournament day maps onto one town day (gates 07:00, play, exits in the evening).

## Plan for M2.1 (tick as you go)
- [x] a. `event/crowd.ts`: a walker stage 2 (to gate `route`), gate queues (`gateQ`: FIFO of parties per gate), `admit(g, n)` (moves up to n
  fans from gate g's queue inside: `arrive`), `atGate` in `counts()`; tests in `tests/crowd.test.ts` (or a new `tests/gates.test.ts`).
- [x] b. `sim/protocol.ts` `{ t: 'gates'; gates: { x; y; lanes }[] }`, `sim.worker.ts` case, `City.setGates`; `SimClient.setGates`.
- [x] c. `City.walkDoor` in golf mode with gates: walk to the nearest gate (stage 2); `City.step`: each gate admits `lanes * 10` fans a sim
  second (fractions carried).
- [x] d. The frame: the gate queues appended to `stops` (so the engine draws them), or their own array; the engine draws them.
- [x] e. Engine: the gates from `golf.structures` (kind 'gate', `structureRect` middle, `STRUCTURE[type].capacity` lanes) sent on load and
  whenever the structures change.
- [x] f. typecheck, tests, build, browser check (place a gate, skip to the tournament, see the queue and the admitted count), land.

## Plan for M2.2 Galleries (write the details here before you start)
- [x] a. Decide the gallery spots: per hole of the course (golf/holes.ts, holeview.ts: tees and greens; the featured holes), the placed
  grandstands and tents (golf.structures, STRUCTURE kinds 'grandstand', 'food', 'drink', ...), the 18th green. A pure module
  `src/game/golf/galleries.ts`: spots (x, y, capacity, kind) from the holes and structures; the share of the crowd each draws.
- [x] b. Admitted fans walk from the gate to a spot (a stage 3 walker in event/crowd.ts, or a gallery list in the crowd) and stand there
  (counts per spot); later in the day they move between spots (follow the play: M2.5 ties it to the town day).
- [x] c. Send the spots to the sim (a message like `gates`), draw the standing crowds at street zoom (dense walker groups, the count).
- [x] d. Tests, browser check, land.

## Plan for M2.3 Going home (branch `lead/m2-going-home`)
**Found:** a party car records only its town (`Sim.party[slot]`) and, once parked, `[town, park, bay]` (`Sim.partyBays`, read by
`City.drainParty` → `partyWalk`); its home lot is not kept. `closeRound` despawns every car and `emptyParks` zeroes the car parks.
**Design:** `City.parkedCars` records each parked party car `{ town, park, bay }`. In golf mode the leaving starts `LEAVE_AFTER` sim s after
kick-off and releases the parked cars' parties over `LEAVE_S` sim s (in a seeded random order): each party walks from a gallery spot that
has fans (taking PARTY fans off it; with no spots, from the nearest gate or the site's middle) to its car's bay (a `Crowd` walker stage 4,
route = the index in `parkedCars`); when it lands (`Crowd.onBack`) its car waits to leave (`City.leavePending`); each step a waiting car
is spawned at its car park's entrance (the park's sink: lane by `sinkLane`, s = the sink's s) bound for a home of its town (the homes of the
surge's plan, by population; `driveway(lot, g)`), and the park's `parked` count drops. Measured (for M2.4): `leave = { start, cars,
gone, last }` (sim s), into `RoundResult.leave` when the round closes.
- [x] a. `event/crowd.ts`: stage 4, `onBack(town, route)`; test.
- [x] b. `city.ts`: `parkedCars` (in `drainParty`), the homes by town kept from `planSurge`, `LEAVE_AFTER` / `LEAVE_S`, `stepLeaving(dt)`
  (release, walk, spawn), the measurement; `closeRound` keeps despawning (anything left is cut off).
- [x] c. Tests (a City-level test if feasible, else crowd-level), browser check (the evening traffic out of the car parks), land.

## Plan for M2.4 Results from the movers (branch `lead/m2-results`)
Found (a): `computeYearEnd` (`golf/yearend.ts`) builds the DayFacts from `measureGateFlows(arrived, lanes, cards)`, a per-minute formula
(arrival curve through the gate rate; exit curve through the same rate); missed = sent * PARTY - arrived. The engine calls it from
`golfYearEnd` (the results card in App.tsx, recomputed every render from `round.last`, which the worker posts every frame, so a measure
that grows during the eval shows live) and from `closeRound` (books the tier and rep). Sim s = game minutes (the gate rate is per minute).
Design (b):
- Gates: `GateStats.late` = fans admitted after waiting over ON_TIME_GRACE_MIN (45); `RoundResult.gates.late`. Measured facts: queue =
  gates.avgWait; late = gates.late + gates.queuing (still in the queue at kick-off: they get in late, not missed); on time = arrived -
  gates.late; missed = sent * PARTY - arrived - queuing.
- Exit: each car's wait from its party being back at the bay to driving out of the car park (the car park's exit onto a busy road is the
  queue; the walk back is not counted). `City.leave.waits`, `RoundResult.leave.p95` (sim s). Measured exit P95 once 95% of the cars are
  out; before that the formula's (the card says "est.").
- `YearEndResult.measured: { gates: boolean; exit: boolean }`; the card marks estimates. No gates placed or old saves: the formula.
- [x] b1. crowd.ts GateStats.late; city.ts kickOff gates.late; leave waits and p95; round.ts types.
- [x] b2. yearend.ts measured facts; App.tsx card marks.
- [x] c. Tests (gates late counting; yearend with measured inputs; leave p95), browser check on 5181, land.

## Plan for M2.5 The tournament on the town day (write the details here before you start)


## Next action
Review the open PRs as they land, and the full-suite runs (one heavy run at a time on this PC).

## Done (newest first)
- 2026-10-24: **Merged T048, T043, T045, T049, T054, T050, T051a, T060a** (PRs #102–#106, #110, #111, #113).
- 2026-10-24: **The building import reached 131 of 204**, with old pictures never shown (PR #112, awaiting the owner).
- 2026-10-23: **M2.4 Results from the movers landed** on main. Browser-checked on a test copy (5181, a gate placed by script, Skip to tournament at 8x): `last.gates` admitted 168, wait 0, late 0; the card read `Q 0m · Exit 0m est.` at kick-off, then the cars left (56 of 56, the exit P95 rising 0 → 8.8 → 12 sim s) and it read `Q 0m · Exit 12m` (both measured). Satisfaction 76 (unchanged: 12 min is under the 30 min full-marks line).
- 2026-10-23: **Magenta keyer clean-up landed** on main (an aside from M2, the owner asked): despill 'keep', speck clean-up, haze limit, linear-light option in `scripts/assets/key-magenta.mjs`, each a setting; before/after sheets by `scripts/assets/key-compare.mjs`. Details in PROGRESS.md. M2.4 is still next.
- 2026-10-23: **M2.3 Going home landed** on main. Browser-checked on a test copy (5181, Skip to tournament at 8x): 56 cars parked; the leaving started 120 sim s after kick-off; the first car left ~250 s later (the long walk back from the far greens), 53 of 56 had left by ~960 s; cars on the roads rose from ~41 to ~100 (the evening traffic). Note: the walk back from far greens is long; M2.5 (the town day) will set when the leaving starts.
- 2026-10-23: **M2.2 Galleries landed** on main. Browser-checked on a test copy (5181, fresh golf game, Skip to tournament at 8x): 18 spots (9 greens, 9 tees), 102 of the 168 fans in standing at them while the rest still walked, drawn as rings of standing fans with `n watching` (15 by a green, 12 by a tee).
- 2026-10-23: **M2.1 Course gates landed** on main. Browser-checked on a test copy (port 5181, a fresh golf game, a gate placed by script between the car park and the clubhouse plot, Skip to tournament at 8x): the fans walked to the gate (stage 2 walkers seen), the gate admitted all 168 who arrived (`last.gates`: admitted 168, wait 0: a 4-lane gate admits 40 a second and they came about one a second, so no queue at tier 1); 168 of 360 fans arrived at all: the round's stuck list blames the town's 4-arm junctions (M3's job).
- 2026-10-23: M2 findings and design written (above). M1 Living town landed on main (4c90e25).
