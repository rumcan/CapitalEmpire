# 3D people: START HERE (any model, any session)

Read this file only. It is the whole 3D job: the accounts, the steps, where it stands, and the next action. The deep background
(why each step is the way it is, the traps already fixed) is in `docs/SPECTATOR-ART.md`; open it only for the section a step names.

**Keep it cheap.** Do not read whole files or logs: `tail` the log, `grep` for one line. Never open `.glb` files. Look at a
`preview.png` only when this file tells you to check a person.

**When you stop, update section 5 (the state) and section 6 (the log) first.** The next model starts from them with nothing else.

**Branch note (2026-11-07):** this file, the picture script and the 6 people made from pictures are committed on `art/people-3d-20261107` (from lead/live). The Meshy pipeline (`meshy.mjs`, `meshy-person.sh`, `meshy-queue.sh`, `art/meshy-clips.json` and the `<id>`-form `plain-glb.mjs`) is still only in the E: checkout, uncommitted: lead/live's `plain-glb.mjs` is a different tool with another command line, so committing them needs a merge of the two first. The new people's `meshyRole` in the cast is what that pipeline calls `clips`.

## 1. Accounts (the owner's; set up 2026-10-29)
- **RUN.world** (models): the `rundot` CLI, signed in as nicola.smit1987@gmail.com (user OnyxQuasar408), 110,000 credits on
  2026-10-29. **The owner allows any spend of these credits.** Check with `rundot whoami` and `rundot credits`. If the account is
  wrong or signed out, stop and ask the owner to run `rundot login` (never sign in yourself).
- RUN game for the jobs: `art/run-game/game.config.prod.json` (id `4G0mrT5UcCtD5KY8luXQ`); `make-person-3d.mjs` reads it on its own.
  The old TrickOrTreat game id does not work on this account.
- **Meshy.ai** (rigging and clips): signed in by the owner in a browser, 1,200 credits on 2026-10-29. Not the RUN credits.
- RUN cannot do the clips: its library is only `idle, walk, run, jump`, and its `rig-3d` / `animate-3d` fail ("Provider rejected
  the request due to invalid parameters") for every model. Do not retry them unless the owner asks.

## 2. What we are making
- **The cast:** `art/people-cast.json`, 35 people (12 townspeople in `art/people3d/`, 15 spectators and 8 staff in
  `art/spectators/`). Each person is done when its folder has `sheet.webp` and `preview.png`.
- **The clips** each spectator needs, beyond walk and idle (`docs/SPECTATOR-ART.md` 3b and 3b+): `run, clap, cheer, sit, sit_clap,
  sprint, peer, crouch, point_down, tiptoe, back_up, sidestep, hush` (P1); `groan, point, duck` (P2). Marshals (`staff_marshal_m`,
  `staff_marshal_w`) also `arms_out, wave_back, paddle_up`.

## 3. Step A: the models (RUN; runs on its own)
One command makes everyone who has no sheet yet, one at a time: the model from RUN (about 3 to 11 min), then a free local rig from
a base person (walk + idle), then the render:

    bash scripts/assets/people3d/make-cast-loop.sh > output/people-cast-run.out 2>&1      (run in the background)

- Progress: `tail -n 5 output/people-cast.log` ("<id>: done" per person, "batch over: N made" at the end).
- RUN's daily cap (about 13 models a day) stops it; the loop waits 30 min and retries for 24 h. That is normal.
- **Only one batch at a time.** Before starting one, check none is running:
  `powershell "Get-CimInstance Win32_Process | ? { $_.CommandLine -match 'make-cast|make-person' } | % ProcessId"`.
  Stopping the bash loop leaves its `node` child running: kill both, or two batches race (2026-10-29: "model FAILED:" with an empty
  message for everyone = a second batch running).
- A rerun never pays twice for a model: it checks RUN's library and `receipt.json` first.
- A person whose line says `FAILED` with a real message: rerun the loop once; if it fails again, note it in section 6 and move on.

## 4. Step B: rigs and clips (Meshy's API; no browser; works since 2026-10-29)
**The owner's rules (2026-10-29):** no game code, only low-token background work on the people. **Meshy credits are scarce**
(907 on 2026-10-29, about 170 short of everything): spend them in this order and never on anything else. **Never ask Meshy for 3D
models** unless every person is rigged AND every clip is made (models come from RUN, whose credits are plentiful).

The key is in `.meshy-key` (repo root, git-ignored; never print or commit it). `node scripts/assets/people3d/meshy.mjs balance`
shows the credits. Two commands per person (root, height and role are read from `art/people-cast.json`):

    bash scripts/assets/people3d/meshy-person.sh <id> rig      plain.glb (free) + Meshy remesh and rig (10 credits)
    bash scripts/assets/people3d/meshy-person.sh <id> clips    the clips of its role (3 credits each) + one sheet per clip (free)

**Order (the owner, 2026-10-29: the most-used people first):** by how often a role is on screen. (1) `rig` in this order:
spectators, marshals, caddies, tour pros, the player character (player_m), security, golfers, range, greenkeeper, janitor, vendor,
server, staff, camera, photographer, starter, scorer, official, family, town (townspeople mostly walk, which they already have).
Each new person from Step A goes into this order when it is checked. (2) `clips` (the p1 actions) in the same order. (3) only when
every p1 is done: `clips <id> p2`, same order. Stop and tell the owner when the balance is under 40.
- **Budget (2026-10-29):** 907 credits; all rigs about 410, all p1 about 1,550 with the 44 text-to-motion clips, everything about
  2,200. Expect to stop part-way through (2); the owner tops up Meshy.
- **Roles** (49 people, the `clips` field in the cast; the p1 and p2 actions of each in `art/meshy-clips.json`):
  coach = the player character (teaching: talk with hands, drive, chip, putt, a slow demo swing; barbecue at the grill, eat, drink);
  tourpro (play: drive, chip, putt, practice swing, read a putt, fist pump, frustration, tip the cap; angry: throw the club, slam it down, angry walk, fist in the air shouting, stomp, shout; the win: receive and lift the
  trophy, hug, handshake); family = the winner's wife and son (run and hug, hug, cheer, clap, jump for joy); official (present the
  trophy, handshake, announce on a microphone, clap); spectator; marshal (QUIET sign held up, arms out, wave the crowd back, point the
  way); security (stand guard, radio, point the way); camera (walk filming with a shoulder camera, film, kneel and film); photographer
  (crouch and shoot, stand and shoot); caddie (walk with the bag, hand a club, rake a bunker, tend the flag, read a putt, clean the
  ball); range (pick range balls with a tube, pick up, carry and empty the bucket); golfer = range customers (drive, tee up, lean on
  the club, practice swing); scorer (clipboard, hang a score on the board); starter (announce on the first tee); vendor (grill, serve,
  pour); server (tray of drinks, serve, pour); greenkeeper (cut a new hole, move the flag, rake, mow, dig); janitor (sweep, empty a
  bin, pick up litter); staff (volunteers: talk, point the way, hand out sheets); town (talk, drink, eat).
- A number is a Meshy library clip (678 of them, free to list: `output/meshy/library.json`); `m:<name>` is a **text-to-motion**
  clip (clap, eat, chip, putt, grill, dig, sweep: the library has none). Each is made once (10 credits) and shared by everyone
  (`output/meshy/motions.json`); Meshy keeps it 3 days, after which the script makes it again (another 10), so do the people who
  need one within 3 days of the first.
- How it works: RUN's file is Draco + quantized + webp with about 500,000 faces, which Meshy refuses; `plain-glb.mjs` writes a plain
  copy, Meshy remeshes it to 100,000 faces and rigs that. A rerun skips what is done (`meshy.json`, `anim_<clip>.glb`); failed
  Meshy jobs are refunded. Not done by Meshy (no clip yet): point_down, tiptoe, sidestep, hush, point, wave_back, paddle_up, duck.
- Check (section 7): one `preview-<clip>.png` per person (a text-to-motion clip when it has one), not all.

## 5. State (update this when you stop)
- **Now (2026-10-29 06:30 UTC):** Step A is running in the background (one batch). Done people: 14 + the 3 base people
  (`spec_m_plaid` new today). The security guard's model is saved; the batch rigs and renders it next.
- Step B (06:50 UTC): **`spec_m_polo_visor` done**, all 9 library clips rendered and checked (cheer, sit_clap previewed clean).
  Meshy balance 1,169. **The owner approved it (2026-10-29): run section 4 for every finished person**, spectators and staff
  first, then townspeople; one person at a time; a new person gets its clips as soon as its sheet is done and checked. Stop and tell
  the owner if the balance drops below 40.
- Uncommitted: this file, `art/run-game/`, the game id change in `scripts/assets/people3d/make-person-3d.mjs`, the new people in
  `art/`. The checkout is on branch `arena/T026-course-height` (not ours): commit on a branch of your own (`art/people-3d`), never on main.
- **Watcher 2026-10-29 06:35:** 16 sheets. `spec_m_young_cap` was bad (1.87, ground plate): sheet/model deleted, look reworded; and town_w_shopper likewise; and staff_caddie_m likewise; all need a loop rerun after the batch ends.
- **Next action (2026-10-29 07:40, the owner):** Step B by roles (section 4 order): rig everyone done first, then the coach, greenkeeper, janitor and vendor clips. Three new people in the cast for Step A: player_m (the player character), staff_greenkeeper_m, staff_janitor_m. No game code.

- **2026-11-07 (latest):** 33 of 49 people done (lead/live has their sheets; the 15 spectators clap, cheer and sit in the game).
  The text-to-3D loop stopped on 2026-10-31 (RUN daily cap). **New method, tested by the owner's choice ("RUN, test one first"):** one
  A-pose picture per person from RUN's image model (`rundot generate image --model gemini-3.1-flash-image-preview --aspect-ratio 3:4`,
  120 credits), then `make-person-3d.mjs <id> "<look>" --image <png> --root <root> --model-only` (image-to-3D, about 1,000 credits, 3 min),
  then `rig-local-person.mjs` and `render-person-3d.mjs` as the cast batch does. **The arms must be about 40 degrees out with a clear gap
  to the body and hips:** a picture with the arms hanging close (`output/people-test/bad/player_m-v1/`) gave skin webs from forearm to hip.
  `player_m` passed this way (1.66 tall, clean in all 8 facings; picture `art/spectators/player_m/apose-v2.png`). Then staff_pro_m1,
  staff_pro_m2, staff_caddie_w, staff_starter_m, staff_official_m, all clean (1.65 to 1.68). Pictures by `python scripts/assets/people3d/people-apose.py <id>...`
  (RUN rate-limits a burst after two: wait 40 s between); look at each picture BEFORE its model (the starter's first had the hands raised
  above the shoulders: redrawn with "arms pointing down and out, hands below the waist"). **39 of 49 done. RUN balance 332: stopped for a
  top-up.** **Next:** the last 10 (staff_greenkeeper_m, staff_janitor_m, staff_scorer_w, staff_tvcam_m, staff_photog_w, staff_range_m,
  golfer_m_range, golfer_w_range, family_w_wife, family_k_son; about 1,130 credits each), then the Meshy rigs and clips of the 16 new
  people in section 4's order (Meshy 380 credits: not enough for all).

## 6. Log (newest first; one line each)
- 2026-11-07: 5 more from pictures (both pros, caddie_w, starter, official), all clean; 6 pictures + 5 models = 5,785 credits; balance 332.
- 2026-11-07: player_m made from an A-pose picture (image-to-3D): first take had arm-to-hip skin webs (arms too close), second take
  (arms 40 degrees out) clean, 1.66. Cost 2,266 RUN credits for the test (2 pictures, 2 models).
- 2026-10-30 07:30: RUN still answered "Daily user credit cap reached for threeDGen" 24 h after the last model (12 models, 12,156 credits used of 110,000), so the cap is not a simple 24 h reset. The model loop was restarted for another 24 h. 15 of 49 people have sheets.
- 2026-10-29 13:00: **Step B runs on its own now:** `bash scripts/assets/people3d/meshy-queue.sh > output/meshy-queue.log 2>&1` in the background: every 30 min it rigs new people, then p1 in the most-used order; p2 only once all 49 have p1; stops under 40 credits; one queue (lock output/meshy-queue.lock). If `tail output/meshy-queue.log` shows it stopped, start it again. 15 people rigged with p1+p2; 440 credits left.
- 2026-10-29 13:10: Step B queue ALLDONE for all 15 people with a sheet (rig + p1 + p2, 0 failures, Meshy balance 440, 467 credits spent). 34 of 49 still have no sheet: RUN daily cap, loop retrying every 30 min (try 11 of 48). When new sheets appear, rerun `bash Temp/stepb3.sh` (picks them up in order; one queue only).
- 2026-10-29 11:45: Step B stalled ~09:50-11:20 (hung meshy-person.sh spec_m_dad blocked stepb2's wait loop); then rig.sh and stepb2.sh both rigged spec_w_older_cardigan. Fix: ONE queue only, Temp/stepb3.sh (via launch3.sh) = stepb2 with `timeout 1800` on every meshy-person.sh call, no wait loop; rig.sh/stepb2.sh must not run again. Progress: output/stepb3.out, done list output/stepb-done.txt.
- 2026-10-29 11:35: stepb2 had idled 4h (its wait loop matched itself); wait loop removed and restarted. RUN daily cap: Step A retrying every 30 min (try 8 of 48), 18 sheets so far. Watcher for Step A died (exit 255).
- 2026-10-29: (order now the owner's most-used-first, in Temp/next.py) Step B automated: Temp/stepb2.sh (waits for rig.sh, then rig, p1 by role order, p2; stops under 40 credits; progress output/stepb2.out, done list output/stepb-done.txt; Temp/next.py picks the next person). Kill it to pause.
- 2026-10-29: Step B resumed on the new process: rig loop (7 people with a sheet and no meshy_rigged.glb) running via Temp/rig.sh, output/rig.out. Next: clips by role order.
- 2026-10-29: Step B PAUSED by lead (per-role clip sets pending). Finishing the current person only; stepb.sh loop killed. Unrun: rest of the 12 in C:/Users/RAMPAGE/AppData/Local/Temp/stepb.sh plus spec_m_dad, staff_marshal_w.
- 2026-10-29 07:05: spec_m_dad done 1.66 (queued Step B). RUN daily cap hit; Step A waits 30 min x48. spec_w_visor_pastel Step B done (1.67).
- 2026-10-29: staff_marshal_w done, 1.67 good; queued for Step B after the running stepb script (output/stepb-queue.txt).
- 2026-10-29: spec_w_young_shorts done but 1.92 (plate even with reworded look?): removed, to redo. Step B (meshy) started on 12 finished people via output/stepb.out.
- 2026-10-29: town_m_elder done but plate (1.81): removed (look already reworded), to redo. Redo list: young_cap, shopper, caddie, sun_hat, elder.
- 2026-10-29 06:50: Meshy API works (RUN's rig failed on file format + face count, not the person). spec_m_polo_visor: remesh+rig 10, 9 clips 27 credits.
- 2026-10-29: spec_m_sun_hat done but 1.92: removed. Plates on 4 of 6 checked, so every not-yet-made person's look now opens 'Full-body standing figure, standing on nothing, no ground, no base...' (art/people-cast.json reformatted by json.dump).
- 2026-10-29: staff_caddie_m done but plate (1.85): removed, reworded, to redo. Plates seen on 3 of 5 checked; 1.85+ is the tell.
- 2026-10-29: spec_w_older_cardigan done (1.74, previewed clean: no plate; height ~1.7 is fine for these).
- 2026-10-29: town_w_shopper done but plate + torn skirt (1.77): removed, reworded, to redo. RUN often fuses a plate: reworded looks say 'standing on nothing, no ground'.
- 2026-10-29: staff_security_m done (1.78); spec_m_young_cap done but 1.87 + plate: removed, reworded, to redo.
- 2026-10-29: new RUN account and game; RUN's rig/animation found down and its library too small for our clips (0 credits spent);
  model batch started; `spec_m_plaid` done.

## 7. Checking a person (cheap)
`grep "<id>: done" output/people-cast.log`: the line says "model N units tall". A good adult is 1.64 to 1.68; 1.87 or more means
RUN fused a ground plate to the feet, 2.00 a broken file. Only if the number is off, or once per 5 people, open
`<root>/<id>/preview.png` and check the person is whole and faces the right way in all 8 rows. A bad person: delete its folder's
`sheet.*`, give its look new opening words in `art/people-cast.json` (or the batch finds the bad model again), rerun the loop.
**Never give several looks the same opening:** the batch refuses to start if two looks share their first 38 characters (it finds models
in RUN's library by them). Prefix one person only (`Take two: `); shared wording such as "standing on nothing, no ground" goes at the
**end** of a look (2026-10-29: a shared prefix stopped the batch).
