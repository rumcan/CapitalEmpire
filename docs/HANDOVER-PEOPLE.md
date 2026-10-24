# Handover: the 3D people (townspeople, spectators, tournament staff)

Written 2026-10-24 by Claude (the lead) for the next AI. **Read this first, then `docs/SPECTATOR-ART.md`** (the full brief: the cast, the
clips, the wayward-ball scene, the quality bar, the traps). This file is the state of play and what to do next.

## 1. Where it stands (2026-10-24 06:00 UTC)
- **10 good people, checked and pushed** (8 facings, idle + 8 walk frames each, the owner's hands and arms):
  - spectators (`art/spectators/`): `spec_m_polo_visor`, `spec_w_visor_pastel`, `spec_m_bucket_hat`, `spec_w_sunhat_dress`, `spec_w_windbreaker`
  - staff (`art/spectators/`): `staff_marshal_m`, `staff_volunteer_w`
  - townspeople (`art/people3d/`, they walk the town after the studio's **Rebuild game sprites**): `town_m_mechanic`, `town_w_nurse`, `town_m_business`
- **11 bad people, paid for, not used:** `output/people-bad-20261024/` (git-ignored): `spec_m_dad`, `spec_m_plaid`, `spec_m_sun_hat`,
  `spec_m_young_cap`, `spec_w_older_cardigan`, `spec_w_young_shorts`, `staff_caddie_m`, `staff_marshal_w`, `staff_security_m`,
  `town_m_elder`, `town_w_shopper`. RUN modelled a **grass plate with golf balls and clubs fused to their feet** (section 3). Their
  render logs said "model 1.73 to 1.94 units tall" (good people: 1.66 to 1.68).
- **14 not made yet:** the rest of `art/people-cast.json` (the waitress, the student, the jogger, the postman, the two kids of the town,
  the teens, the kids at the tournament, the vendor, the two pros, ...).
- **Nothing is running.** The retry loop was stopped on purpose (it was spending the daily cap on bad models).

## 1b. Update 2026-10-24 07:30 UTC (the next AI): a free rescue of the plates, waiting on the owner
- **New: `scripts/assets/people3d/cut-plate.mjs <in.glb> <out.glb>`** cuts a fused ground plate off a RUN model, locally, no credits.
  It finds the plate's flat top from the height profile (a spike of upward-facing area low down: plates 0.13 to 0.67 of the height
  squared, good people 0.002), cuts every triangle at or below it and drops what that sets loose (balls, clubs). Controls: `--margin`
  (cut height above the found top, default 0.004 of the height), `--top` (set the plate top by hand), `--clear` (also cut clubs or balls
  fused beside a shoe), `--flat` (the plate threshold), `--keep` (loose-piece size). On a good model it says "no ground plate found" and
  writes nothing. It also drops the plate's unused vertices (left in, they made the render read "2.10 units tall").
- **Tried on all 11 bad people** (`worktrees/people-ground/output/cut-test/<id>/`, git-ignored; then rig-local-person.mjs and the render as
  usual): 10 had a plate and came out clean, at 1.64 to 1.71 units tall. Contact sheets: `output/cut-test/rescued-a.png`, `rescued-b.png`.
  - Clean: spec_m_dad, spec_m_sun_hat, spec_m_young_cap, staff_caddie_m, town_m_elder, town_w_shopper, spec_w_older_cardigan; spec_m_plaid
    (a small green chest emblem on the sweater).
  - spec_w_young_shorts: plate gone, but the hands meet in front of the crotch (3B) and a small chest emblem.
  - staff_marshal_w: plate gone, but a navy leg web between the feet in the side and back walk frames and a white speck by the visor
    (the rig transfer, not the cut).
  - staff_security_m: **no plate**; it was bad for a police-style badge, chest tag and arm patches (the no-logo rule). Remake or keep: the
    owner's call.
- **Why the plates got worse:** 2 of the first 13 models had a plate (plaid, security); after the "Nothing under the feet: no ground, no
  grass, ... no golf balls" line went into the pose prompt, 11 of 11 did, the two townspeople with no golf words too. The negation names
  the things the generator then makes.
- **The options put to the owner (2026-10-24), none chosen yet:** 1. the rescue (free; also as an automatic step in make-cast.mjs so a
  plate never costs a remake); 2. words (drop "golf" and the negation line, about 1,000 credits a model); 3. picture first (RUN image,
  about 130 credits, then image-to-3d, about 1,000); 4. another 3D provider (price unknown). They can be combined.
- **Credits (2026-10-24 04:48 UTC):** balance 63,493. hunyuan3d-v3.1-pro averages 986 a model (1,013 today); gemini-3.1-flash-image-preview
  131 an image, gemini-3.1-flash-lite-image 88. `RUNDOT_BETA_FEATURES=1 rundot credits --group-by model` (or `--period today`) shows it.
  11 models were made since 00:00 UTC today, so about 2 are left before the daily cap resets (about 00:15 UTC).

## 2. The pipeline (all in `scripts/assets/people3d/`; details in SPECTATOR-ART.md 1 and 1b)
1. `make-person-3d.mjs <id> "<look>" --root <dir> --model-only`: the model from RUN (text-to-3d, an A-pose prompt around the look). It
   checks RUN's library first (never pays twice), and when the CLI gives up after 600 s it waits for the model in the library.
2. `rig-local-person.mjs <id> --from base_man|base_woman|base_kid --root <dir>`: the skeleton and the walk and idle of a base person moved
   onto the model, locally, free (RUN's `rig-3d` rejected every model on 2026-10-23, base_man's too). Handles RUN's quantized meshes,
   legs that touch (no web between the feet), loose bits and flat plates that are **not** fused.
3. `render-person-3d.mjs <id> --root <dir> --height <m> --hand-twist 70,-70 --arms-in 12`: the sheet (`sheet.webp`, `sheet.json`,
   `preview.png`). The hands and arms are **the owner's choice** (hands option B of five, arms in 12 of 8/12/16 degrees).
4. `make-cast.mjs` runs 1–3 for everyone in `art/people-cast.json` without a sheet (log: `output/people-cast.log`; `--only id,id`,
   `--render-only` re-renders for free). `make-cast-loop.sh` reruns it every 30 min for 24 h while RUN's daily cap is on.

## 3. The two problems to solve before making more
**A. Grounds under the feet (the blocker).** Every look says "... at a 1985 golf tournament" or "watching golf", and the generator
(hunyuan3d text-to-3d) puts a patch of golf course with balls and clubs under the person, fused to the shoes. Adding "Nothing under
the feet: no ground, no grass, no base, no stand, no golf balls" to the prompt (`make-person-3d.mjs`, the `pose` line) made it worse:
all 11 made after it have a plate. A fused plate cannot be cut off (a slice cut took half the body). Options for the owner (give all
of them, the owner chooses; never pre-pick):
1. **Words:** drop "golf" and every negation from the looks and the pose line; say what they wear and their age only (the clothes
   already read as 1985 golf fans). Cheapest; try it on ONE person first.
2. **Picture first:** make an A-pose picture with RUN's image generator on a flat plain background (full body, feet visible, nothing
   under them; `rundot generate image`, which takes a real `--negative-prompt` for "ground, grass, golf ball"; see `scripts/assets/gen-golf.mjs`), check it, then
   `make-person-3d.mjs --image <png>` (image-to-3d). More control over the look too; costs an image plus the model.
3. **Another provider:** `rundot game generate-3d --help` lists pixal3d, trellis-2, meshy, tripo-v2.5, rodin-v2.5; untested here.
4. **Rescue (2026-10-24, free):** cut the plate off locally, `cut-plate.mjs` (section 1b). Fixed 10 of the 11 bad models.
Check each new person at once: the render log's "model N units tall" (1.66 to 1.68 is right; rescued women came out at 1.69 to 1.71) and its `preview.png`.

**B. Hands in front of the crotch on some models.** The owner's hands and arms settings were chosen on `spec_m_polo_visor`; on some
other models (the young woman in shorts, the caddie) the hands meet in front of the body. Give `art/people-cast.json` a per-person
`"render"` override (make-cast.mjs reads only the global one today: a small change) and set it per person after looking at the preview.

## 4. RUN facts (2026-10-23/24)
- The CLI: `%LOCALAPPDATA%\Programs\Rundot\rundot.exe` (7.18.0, on the user PATH; bash needs
  `export PATH="$PATH:/c/Users/$USERNAME/AppData/Local/Programs/Rundot"`). Signed in as the owner (`rundot whoami`); only the owner
  runs `rundot login`. Game id `AFjPSjQH9kbcCl57sgO3` (TrickOrTreat's, read from its `game.config.prod.json`; TrickOrTreat is read only).
- **Daily cap: about 13 3D models a day**, then `[AI_POLICY_BUDGET_EXHAUSTED] Daily user credit cap reached for threeDGen` (shown
  as "Too Many Requests" without `--json`). It reset at about 00:15 UTC. Storage is not the limit (0.0 B against the quota).
- `generate-3d` takes 4 to 11 min; the CLI gives up at 600 s while RUN finishes (the scripts recover it from `rundot assets list`).
- `rig-3d` rejected every model on 2026-10-23 (`THREE_D_GEN_RIG_FAILED`): hence the local rig. `animate-3d` (clap, sit, run, ...)
  needs a RUN rig id, or try `--input <rigged.glb>`; untested.

## 5. What else is open (in order)
1. Solve 3A with the owner (show the options and a test person), then remake the 11 and make the 14 (about 13 a day).
2. 3B: per-person render settings where the hands look wrong.
3. The other clips (SPECTATOR-ART 3b, 3b+: clap, cheer, sit, run, the wayward-ball set): need RUN's animation service.
4. The studio's People tab: check each person for wrong-way frames (`node scripts/assets/review/server.mjs --port 5179`).
5. Rebuild game sprites (studio, top right) so the new townspeople walk the town; check the game.
6. The game wiring of spectators and staff (the code side: SPECTATOR-ART section 5; LEAD.md).

## 6. Rules (the owner's)
Give every option and the controls to tweak it, never pre-pick. No lettering or logos in generated art. Show the credit cost before
spending RUN credits and make one person before a batch. Ask before downloading or installing anything. TrickOrTreat is read only.
Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; git here needs
`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=safe.directory GIT_CONFIG_VALUE_0=*`. Other sessions work in this repo too: add only your own files
(`git status` shows theirs), never revert theirs. The code side (the game, M2.5 next) is LEAD.md and NOW.md, not this file.
