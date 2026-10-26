# NOW: the live work log

Update this file **before** each edit and after each sub-step. The section below is always the current state. Everything under
"History" is older and kept for reference.

## START HERE (kept current by the lead; last updated 2026-10-26 midday)

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

**The owner tests on http://localhost:5174.** The owner pre-approves the lead's recommended decisions (state them in chat). The lead
merges reviewed PRs (AGENT-BRIEF section 1). The owner wants screenshots of every change.

### In flight
| Ticket | Issue | Branch | Worktree | Port | State |
| --- | --- | --- | --- | --- | --- |
| **T154 (top priority)** | #330 | `arena/T154-new-art` | `.claude/worktrees/t154` | 5187 (studio 5193) | The owner: "bringing the next art into the game ... new buildings and plants ... in the studio asap". Today's screen-axis four-view sets (parking garages 2-6 storey, bakery, grocery, pharmacy, 3 industrial, 3 houses; 3 bushes, 3 flowerbeds, hydrangea; bench, lamp, trash can, parking entry; 2 wagons, pickup) into the studio Library and the game; the parking garage replaces the car park building's stand-in. Phase 1 PR first; Phase 2 the eight headings. |
| T152 | #325 | `arena/T152-car-spacing` (d3bdbf1) | `.claude/worktrees/t152` | — | **Paused** for the art (the owner). Root cause: the range's own cars (`rangebiz.ts:803/832/723`) are placed by their own clock; fixed in rangebiz.ts only (overlaps -75-82% with the 44-bay lot, money identical). **Owner's decision needed:** at full demand the one-lane drive and the building's ramp cannot carry the cars at a car's gap (wider drive, second ramp, faster car-park speeds, or the queue limiting sales). Left: three gates, shots, PR. |
| T155 | #333 | `arena/T155-lot-lab-2` | `.claude/worktrees/t155` | 5186 | The lot lab, part 2 (the owner: ~1,500 lot combinations): PR 1 a roomier layout (drawer: lot choice only; top toolbar; floating selection bar; bottom palette; right inspector), house allocations (road angles + built/upgraded/decrepit per house), lawns by state (upgraded putting-green, built fairway, decrepit rough); PR 2 lots auto-sized from a master on the largest lot. |
| T112 | #199 | `arena/T112-sharp` (1872f0e) | `.claude/worktrees/t112` | — | **Paused** for T153: sharp 0.35.5 in, all packed art identical (260 images byte-identical; 16 view PNGs only re-tagged), still to do: the KTX2 check, the studio check, audit/typecheck/suite/build, the PR. Resume from #199. |

**Two coding agents at a time (the owner, 2026-10-26: first "maybe just too many background tasks?" after the studio tab died with the
PC at 1.5 GB free, then "start up two coding agents"):** keep two coding agents running, start the next queue ticket when one lands, no
more; each runs one heavy process at a time. Both stopped once at the usage limit (13:50) and were resumed: an agent that stops on a
limit is resumed with a message, not restarted.

**One studio (the owner, 2026-10-26: "when a studio is running it is the only studio and any changes made affect the actual game
sprites"; "put the studio on the network for all pcs on network to edit").** The lot lab's branch is on main (#290): the only studio is
port 5191 from `worktrees/theme-consistency`, the checkout of the owner's 5174 game, both on the LAN (http://192.168.0.2:5191 and
http://192.168.0.2:5174; launch configs `studio` with `STUDIO_HOST=0.0.0.0`, `lead-game` with `--host 0.0.0.0`). Never start a second
studio for the owner; an agent's check studio (5193) is stopped before it reports. The old lot lab servers (5241, 5242) and its
worktree `.claude/worktrees/lot-presets` are dead: the owner closes the servers, then the worktree goes. The owner restored
`variation:gen-house-l-shape-e0e3b328-plain:1` for its 9 lot presets (#294); `tests/lot-presets-json.test.ts` passes again.

**2026-10-26 manual regression** (main `d750592`, `E:/ClaudeTemp/nightly/2026-10-26-manual.md`): typecheck, 1697/1697 tests, the build,
sim, town, towns and biz gates PASS; fix and event gates FAIL (#285). towns/event/biz had not run for days (no .webp loader; fixed by #286).

Each agent pushes its branch and comments on its issue after every sub-step,
ending with "To resume". **Other live sessions** (the lot-preset studio, the 3D spectators) keep their own handover docs; see
`docs/START-PROMPTS.md`.

### Queue (in order)
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
