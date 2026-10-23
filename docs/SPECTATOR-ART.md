# Spectator art: what to make and how (for any AI asked to make it)

Written 2026-10-23 by the lead (Claude). **If the owner told you to make the spectator art, this file is your brief.** Read it top to
bottom, then `docs/ART-PIPELINE.md` (the asset steps and the sprite studio). The owner's words: the crowd *"needs to be extremely well
done. It is what will make the game amazing."* Quality beats speed here: fewer people done beautifully beat many done badly.

## 0. Rules (do not break these)
- **TrickOrTreat (`../TrickOrTreat`) is read-only.** The scripts read its RUN game id from `game.config.prod.json`; never write there.
- **RUN credits are the owner's money.** A person costs about 1,800 credits (model + rig + walk + idle); every extra clip is one more
  `animate-3d` call. Before you spend, run the cast in section 3 past the owner with a credit estimate, then make **one person first**,
  show it, and only then do the rest. Report what you spent.
- **`rundot` (the RUN.world CLI) must already be installed and signed in.** If `rundot` is not found in your shell, stop and ask the
  owner. Do not install or download anything without the owner's yes.
- **No lettering, no logos, no brand marks** on clothes, caps, umbrellas or bags (the owner's rule for all generated art).
- **One person at a time.** The service allows only a few jobs at once and answers the rest with "Too Many Requests" (the script waits and
  retries on its own).
- Commit on your own branch (`art/spectators`), never WIP on main. Messages end with the Co-Authored-By line from CLAUDE.md. Update
  section 7 of this file as you go, so another AI can pick up where you stopped.

## 1. How the townspeople were made (the same pipeline, reused)
The people walking around town are **3D models rendered to sprite sheets**, not painted sprites. Each one:

1. **Model, rig, clips** (spends credits):
   `node scripts/assets/people3d/make-person-3d.mjs <id> "<look>" [--image <A-pose png>] [--max-credits <n>]`
   - `rundot game generate-3d` (text-to-3d from the look, or from an A-pose picture): `art/people3d/<id>/model.glb`
   - `rundot game rig-3d`: a humanoid rig, `rigged.glb`
   - `rundot game animate-3d --animations walk` and `idle`: `anim_walk.glb`, `anim_idle.glb`
   - `receipt.json` keeps the model URL and rig id, so a rerun skips paid steps already done.
2. **Render** (free, local; three.js in headless Edge through playwright-core):
   `node scripts/assets/people3d/render-person-3d.mjs <id> [--height <m>] [--walk <frames>]`
   - The game's 2:1 dimetric camera (30 degrees down), bright flat light with a cool rim (the game adds night, shadows and light pools).
   - **8 facings drawn for real** (rows S SW W NW N NE E SE; no mirroring), columns idle + walk1..walk8 sampled from one stride.
   - 128 px per metre, feet at the anchor. Writes `sheet.webp`, `sheet.json` and `preview.png` (every frame, labelled).
   - It straightens RUN's walk clips (they come with the body turned about 30 degrees) and walks in place (no root motion).
3. **Pack:** `node scripts/assets/prep-sprites.mjs`, or the sprite studio's **Rebuild**. Every person in `art/people3d/` must have the
   same frame count. People are drawn at half the art size (64 px/m).
4. **Fix bad frames** in the sprite studio's **People** tab (`node scripts/assets/review/server.mjs --port 5179`): click a frame and
   choose `mirror`, `use:<k>`, `use:<DIR>:<k>` or `new`. Fixes go to `scripts/assets/walker-fixes.json`. RUN's walks often have
   wrong-way frames (the SE row's frames 3–4 on most adults).

Look at `art/people3d/base_man/` (`receipt.json` has the look prompt, `sheet.json` the format) before you start.

### 1b. The way that works today (2026-10-23): RUN's model, our own rig
RUN's rig service (`rig-3d`) rejected every model on 2026-10-23, base_man's too, so spectator 1 was rigged **locally**:
1. **The model** from RUN: `make-person-3d.mjs <id> "<look>" --root art/spectators`. It stops at the rig step when RUN's rig fails; the
   model is already saved (`model.glb`, `receipt.json` `modelUrl`). If the CLI times out (section 7, the 600 s note), recover the model
   from `rundot assets list` instead of paying again.
2. **The rig and the walk and idle, free:** `node scripts/assets/people3d/rig-local-person.mjs <id> [--from base_man] [--root art/spectators]`
   moves base_man's skeleton and his walk and idle clips onto the new model (TrickOrTreat's `rig-local-costume.mjs` method: the two meshes
   lined up by their bounds, each new vertex takes the skin weights of base_man's 4 nearest vertices). Writes `anim_walk.glb`,
   `anim_idle.glb`, `rigged.glb`; about a minute; no credits. Use `--from base_woman` / `base_kid` for women and children (the closer
   the build, the better the joints line up).
3. **Render:** `render-person-3d.mjs <id> --root art/spectators --height <m>`, then look at `preview.png` (section 4).

**The batch (2026-10-23):** `art/people-cast.json` lists every person to make (townspeople in `art/people3d`, spectators and staff in
`art/spectators`; id, role, height, base, look) and the render settings; `node scripts/assets/people3d/make-cast.mjs` makes everyone who
has no sheet yet, one at a time (model from RUN, local rig, render), logging to `output/people-cast.log`; rerun it to carry on. After a
change of the render settings: `make-cast.mjs --render-only` (free). Each look must start with its own words (the batch checks): after the
CLI's timeout, make-person-3d.mjs finds the model in RUN's library by the start of its prompt.

**Hands and arms (the owner's choice, 2026-10-23):** RUN's A-pose models hold their hands open, palms forward, and the clips keep the arms
out. `render-person-3d.mjs --hand-twist 70,-70 --arms-in 12` (in `people-cast.json` "render") turns the hands (forearm and hand twisted
about the arm, half each; the rig has no finger bones) and swings the upper arms in toward the body. The owner looked at five hand options
and three arm angles and chose these; `-70,70` turns the palms the other way, and above about 16 degrees the hands touch the thighs.

**Three traps the transfer hit (all fixed in the script; keep them fixed if you change it):**
- **RUN's models are quantized** (glTF `KHR_mesh_quantization`: positions, normals and UVs stored as normalized 16-bit integers). Writing
  metre values back into those attributes clamps them to [-1, 1]: the person comes out as stretched columns 2 m tall (the arms, legs and
  shirt smeared into vertical bars). Every attribute is converted to plain Float32 before it is transformed.
- **The base's bone matrices are empty until a render:** `skeleton.update()` before reading skinned vertex positions, or they all read as
  the origin.
- **Keep the mesh indexed:** TrickOrTreat's `toNonIndexed()` tripled the vertices (1.5 million) and made 66 MB files; indexed they are 24 MB.

- **Legs that touch in the A-pose** (bare legs, a skirt, slim trousers): the generated mesh joins them, and base_woman's trouser crotch
  carries both legs' weights, so a white web stretched from foot to foot in the side views. Now: below the hips each vertex samples only
  its own side of the body and keeps none of the other leg's bones, and every triangle with corners on both legs is cut ("leg-web
  triangles cut" in the log; about 2,000 for spec_w_visor_pastel).
- **Finding a model after the CLI's timeout:** `rundot assets list` ends the listed prompt in "…" on a console but "." when piped to a
  script; the first batch's lookup kept the "." and never matched (a 30 min stall). make-person-3d.mjs strips both now, and checks the
  library **before** generating, so a person whose model is already there costs nothing.

- **A ground under the feet:** RUN once modelled a patch of grass with golf balls fused to the shoes ("golf tournament" in the look):
  the render said "model 1.87 units tall" and every frame stood on a green plate. A fused plate cannot be cut off cleanly (a slice cut
  took half the body), so the person is remade: the A-pose prompt now says "Nothing under the feet: no ground, no grass, no base, no
  stand, no golf balls", and give the look new opening words (the library lookup would otherwise find the bad model again). Loose
  plates and specks (not fused) are dropped by rig-local-person.mjs.

**How to tell a broken rig fast:** the script logs the two bounding boxes (base_man about 1.10 x 1.70 m, the new person scaled to match),
and `render-person-3d.mjs` logs "model N units tall": base_man is 1.67 and good people 1.66 to 1.68; 2.00 meant the quantization trap, 1.87 a ground plate. A good preview shows the person
whole in every facing with no spikes.

**Clips beyond walk and idle** (run, clap, cheer, sit, the wayward-ball set) still need RUN's animation service, which needs RUN's rig
(`animate-3d --rig-id`). Try `rundot game animate-3d --input <rigged.glb>` (it takes a local model instead of a rig id) when you get
there; if RUN stays down, the fallback is base clips: make the clip once on a base person when RUN works and transfer it like walk.

**What goes in git:** `model.glb`, `receipt.json`, `sheet.webp`, `sheet.json`, `preview.png` and any clip sheets. The transferred
`anim_walk.glb`, `anim_idle.glb` and `rigged.glb` (24 MB each) are git-ignored: rerun `rig-local-person.mjs` to get them back.

## 2. What the game needs the crowd to do
Spectators are parties of 3 fans (`PARTY`) who drive in, park, walk to the course gates, queue, go through, and stand or sit in
**galleries**: beside each green, behind each tee, in the grandstands and in front of the tents. After play they walk back to their cars.
The galleries sit **outside the gallery ropes**; the crowd moves along the spectator walkways between holes. So the crowd must read well:
- **walking slowly** (a gallery stroll, slower than a town walk) and **hurrying or jogging** (to get to the next green first),
- **standing and watching**, with small idle shifts, and **reacting**: clapping, cheering with arms up, a groan with hands on the head,
- **sitting in the grandstands**: sitting still, sitting and clapping, standing up to cheer,
- **queuing at the gates** (standing with weight on one leg, looking ahead),
- seen at every zoom: close up, each person is a real character; zoomed out, the crowd is a dense, lively mass of colour, not a grid.

## 3. The art list
### 3a. The cast (P1: 16 people; P2: 8 more)
1985 small-town America at a golf tournament (the game starts in 1985): polo shirts, pastel and primary colours, visors, bucket hats,
straw hats, pleated shorts and slacks, plaid, sneakers and loafers. Plenty of variety in age, build, skin tone, hair and colour, so a
crowd of 200 never shows the same person twice nearby. No logos or lettering.

| Id | Look (starting prompt; refine it) | Height |
| --- | --- | --- |
| `spec_m_polo_visor` | man, 40s, bright red polo, white visor, khaki slacks, white sneakers | 1.80 |
| `spec_m_bucket_hat` | man, 50s, heavier build, navy bucket hat, light blue polo, tan shorts, white socks | 1.76 |
| `spec_m_plaid` | man, 60s, grey hair, yellow V-neck sweater over white polo, green plaid trousers, loafers | 1.74 |
| `spec_m_young_cap` | man, 20s, plain blue cap, white t-shirt, jeans, sneakers | 1.82 |
| `spec_m_dad_camera` | man, 30s, moustache, pale green polo, beige shorts, camera on a strap (no brand) | 1.78 |
| `spec_m_sun_hat` | man, 70s, wide straw hat, cream short-sleeved shirt, brown slacks | 1.72 |
| `spec_w_visor_pastel` | woman, 30s, pink polo, white visor, white skirt, sneakers | 1.66 |
| `spec_w_sunhat_dress` | woman, 40s, wide-brimmed sun hat, light yellow sundress, sandals | 1.64 |
| `spec_w_windbreaker` | woman, 50s, short curly hair, teal windbreaker, navy slacks | 1.62 |
| `spec_w_young_shorts` | woman, 20s, ponytail, white tee, red shorts, sneakers | 1.68 |
| `spec_w_older_cardigan` | woman, 70s, white hair, lavender cardigan, grey slacks, comfortable shoes | 1.58 |
| `spec_w_umbrella` | woman, 40s, rain jacket (orange), carries a closed plain golf umbrella | 1.65 |
| `spec_k_boy_cap` | boy, about 10, oversized cap, striped tee, shorts | 1.38 |
| `spec_k_girl_pigtails` | girl, about 8, pigtails, pink t-shirt, denim shorts | 1.28 |
| `spec_teen_boy` | teen, about 15, plain sweatshirt, jeans, sneakers | 1.68 |
| `spec_teen_girl` | teen, about 15, plain sweatshirt round the waist, white tee, jeans | 1.62 |

P2: rain gear versions (open umbrellas, ponchos) for rain days, a dad with a child on his shoulders, a couple holding hands (one model),
a person in a folding chair, marshals with a "quiet" paddle (blank), and an elderly man with a walking stick.

### 3b. The clips each person needs
Ask `rundot game animate-3d --help` (or the RUN docs) for the library's animation names first, and write the list into section 7.
Choose the closest each time; if a clip is missing, note it and use the fallback.

| Clip (sheet name) | What | Frames per facing | Fallback | P |
| --- | --- | --- | --- | --- |
| `idle` | standing, small weight shifts | 1 now (the template); 4 better | - | P1 |
| `walk` | a slow stroll | 8 (one stride) | - | P1 |
| `run` | a jog to the next green | 8 | walk at a higher speed | P1 |
| `clap` | standing, clapping | 4 | idle | P1 |
| `cheer` | arms up, a jump or fist pump | 4 | clap | P1 |
| `sit` | seated still | 1–2 | - | P1 |
| `sit_clap` | seated, clapping | 4 | sit | P1 |
| `groan` | hands on head (a missed putt) | 3 | idle | P2 |
| `point` | pointing at the ball | 3 | idle | P2 |

**Sitting**: render the seated clips **without a seat** (the grandstand sprite has the seats). The anchor is the point under the hips on
the seat's top, not the feet; write `"seatHeightMetres": 0.45` and `"anchor"` at the hips into that clip's json, so the game can sit
them on a seat row.

### 3b+. The signature moment: a ball hit outside the ropes (the owner, 2026-10-23: "that is the level of detail I want")
When a ball lands among the spectators, the crowd **runs to where it lands, crowds round it, then parts for the player and opens a
corridor for the player to play through**. Then they hold still for the shot, and react. This is the level of detail the owner wants
everywhere in the crowd. Every person in the P1 cast needs these clips too (on top of 3b):

| Clip | What | Frames per facing | Fallback | P |
| --- | --- | --- | --- | --- |
| `sprint` | a real run, faster than `run`, arms pumping (rushing to the ball) | 8 | run | P1 |
| `peer` | bent forward at the waist, looking down at the ball on the ground | 3 (a slow loop) | idle | P1 |
| `crouch` | squatting to look at the ball closely (kids and some adults) | 2 | peer | P1 |
| `point_down` | pointing at the ball on the ground, turning to call others | 3 | point | P1 |
| `tiptoe` | at the back of the crush, on tiptoe and leaning to see over the others | 3 | idle | P1 |
| `back_up` | walking backwards slowly (making room as the player arrives) | 8 | walk, played in reverse | P1 |
| `sidestep` | stepping sideways (opening the corridor) | 6 | back_up | P1 |
| `hush` | dead still, hands clasped or at the sides, watching the player (during the shot) | 1–2 | idle | P1 |
| `duck` | flinching, hands up or ducking (the shot comes through low) | 3 | groan | P2 |

And for the corridor itself:
- **Marshals** become P1 (2 people: `marshal_m`, `marshal_w`, plain bright vests with no lettering, a blank "quiet" paddle): clips
  `walk`, `run`, `idle`, `arms_out` (both arms out, holding the crowd back; 2 frames), `wave_back` (waving the crowd back; 4 frames),
  `paddle_up` (holding the paddle up; 1 frame).
- **A loose gallery rope held by hand** (painted sprite, golf pipeline): `rope-hand-held-3m`, `rope-hand-held-6m` (a slack rope with no
  stakes, both end views), so marshals can make a corridor where there is no rope.
- **The player at the ball** comes from the pro golfer set (GOLF-SPRITES.md section 5: walk, address, swing, celebrate); add a `recovery`
  swing (a punch-out half swing, 4 frames) and `assess` (crouched behind the ball, looking at the line; 2 frames) to the pros.

How the scene plays (for the code side, so the art covers every beat): (1) the ball lands; spectators within about 25 m `sprint` to it,
the near ones `peer`, `crouch` or `point_down`, the back rows `tiptoe`; (2) marshals `run` in and `wave_back`; (3) as the player walks
up, the crowd `back_up` and `sidestep` into two lines with a gap from the ball to the green, marshals `arms_out` at the ends and the
hand-held rope across; (4) everyone `hush` while the player does `assess` and `recovery`; (5) on the shot the crowd turns to watch
(the `idle` of the facing toward the green), then `clap` or `cheer`, and drifts back to `walk`.

### 3c. The sheet format the game will read
Keep the townspeople's format so the pack and the studio work unchanged. For each person `art/spectators/<id>/`:
- the model files and `receipt.json` (as in `art/people3d/`),
- one sheet per clip: `<clip>.webp` + `<clip>.json` (the `sheet.json` fields: `id` = `spectator:<id>:<clip>`, `heightMetres`,
  `frameWidth`, `frameHeight`, `anchor`, `directions` (the 8 rows S SW W NW N NE E SE), `frames` (names), `fps`, `clips`), and
  `preview-<clip>.png`.
- 128 px per metre, 8 facings drawn for real (no mirroring).

**Done (2026-10-23, the lead):** both scripts take these options now.
- `make-person-3d.mjs <id> "<look>" --root art/spectators --clips walk,idle,run,clap=<RUN name>,...`: each clip saved as
  `anim_<clip>.glb` (the file RUN writes is renamed); `clap=<RUN name>` when RUN's library calls it something else.
- `render-person-3d.mjs <id> --root art/spectators --height <m>`: the idle + walk template (`sheet.webp` / `sheet.json`, as the
  townspeople); then per clip `--clip <name> --frames <n>` (evenly over a loop), `--once` (a one-shot, first to last frame), `--stride`
  (over one stride, like the walk: run, sprint, back_up, sidestep), `--seated` (adds `seatHeightMetres` and the `seat` point to the json).
  Clips are sized by the walk model, so every clip of a person has the same height and floor.
- Checked on a copy of `base_man` in `output/people-test/`: the template renders byte-identical to the committed sheet; its idle clip
  rendered as a 4-frame clip sheet with S facing the viewer.
- Do **not** put spectators in `art/people3d/` (they would walk the town too and change the townspeople's frame count).

### 3d. Crowd mass for far zoom (P2, painted sprites, not 3D)
Zoomed out, 200 seated people are too many sprites and too small to read. Make dense crowd patches with the golf sprite pipeline
(`scripts/assets/gen-golf.mjs`, flat magenta, keyed by `key-magenta.mjs`; see ART-PIPELINE.md "The golf sprites"), as items in
`art/golf/items.json`:
- `crowd-standing-2x1`, `crowd-standing-4x1` (a rope line, 2 and 4 m long, two rows deep), front and rear views,
- `crowd-seated-row` (one grandstand seat row full of people, matching `grandstand-s`'s seat spacing),
- `crowd-cluster-round` (a ring of people round a green's edge, about 6 m).
Same 1985 clothes and colours as the cast, no lettering. Show the owner before/after with `scripts/assets/key-compare.mjs`.

## 4. Quality bar (check every person before moving on)
- Open `preview-<clip>.png`: every facing faces the right way, the feet stay planted (no sliding in idle, clap, sit), and no frame
  pops. Fix bad frames in the studio's People tab, or rerun the clip.
- Compare the size against `base_man` in the studio's Library (the pointer is a townsperson at the same scale).
- Look at the colours together: the cast side by side should look like one crowd, bright but not neon, with no two people alike.
- In the game (a test copy, see LEAD.md section 6): the crowd at 30% zoom and at 8% zoom. Send the owner a screenshot of each.

## 5. Hand-over to the code side (the lead does this; you do not need to)
The game draws the crowd today with the old 3-hero walk sheet (`src/assets/characters/walkers.png`; `engine.ts` `drawGalleries` and
the walker draw, hero = group % 3). Once the sheets exist, the lead will: pack `art/spectators/` into its own atlas pages, give each walker
group a person and a clip by its stage (walk, run when far behind, idle or clap at a gallery, sit in a grandstand), offset each person's
frame so a crowd never moves in step, and use the crowd patches below about 10% zoom. The wayward-ball scene (3b+) is a sim feature
on the code side too (ball landings outside the ropes, the crowd's rush, the corridor, the marshals): the lead plans it after M2 (see
LEAD.md).

## 6. Order of work
1. Check `rundot` works and list the animation names (section 7). Show the owner the cast and the credit estimate.
2. ~~Make `spec_m_polo_visor` with walk + idle; extend the scripts (3c); render; check (section 4); show the owner.~~ Done 2026-10-23
   (model from RUN, rig and walk/idle by `rig-local-person.mjs`, section 1b).
3. Add the other clips to that person (3b and 3b+); check; show. Then `marshal_m` with its clips.
4. The rest of the P1 cast, one at a time, checking each.
5. The crowd patches (3d), then P2.

## 7. Progress (update this as you go)
- 2026-10-23 13:30 UTC: **11 people done** (spectators: polo visor, pink polo, bucket hat, sundress, windbreaker; staff: marshal (m),
  volunteer; town: mechanic, nurse, businessman), checked. Remade later (new opening words, the no-ground prompt): the plaid man and the
  security guard (RUN fused a ground / balls to their feet; the bad takes are in `output/people-test/bad/`). **RUN's rate limit** stopped
  the batch after 13 models in about 1.5 h ("Too Many Requests"): `make-cast.mjs` now stops at the first one (exit 3), and
  `bash scripts/assets/people3d/make-cast-loop.sh` waits 30 min and tries again (up to 8 h). Run that loop to carry on.
- 2026-10-23 (latest): **the cast batch started**: 35 people in `art/people-cast.json` (12 townspeople, 15 spectators, 8 staff: marshals,
  volunteer, security, caddie, vendor, two pros), one at a time, about 11 min each (RUN's model). Check `output/people-cast.log`; rerun
  `make-cast.mjs` to carry on after a stop (finished people are skipped). Then look at every `preview.png` (section 4), fix bad frames in
  the studio's People tab, and Rebuild game sprites: the townspeople in `art/people3d` walk the town after the rebuild.
- 2026-10-23 (latest): **spectator 1 done for walk + idle.** `spec_m_polo_visor`: RUN's model, rigged locally from base_man
  (`rig-local-person.mjs`, section 1b), rendered at 1.80 m: `art/spectators/spec_m_polo_visor/sheet.webp`, `preview.png`. Checked: whole
  in all 8 facings, clean shoulders, elbows and hips. Not yet: the other clips (RUN's rig service down), the studio People-tab check for
  wrong-way frames, the game wiring (the lead). **Next:** step 6.4, the next people (`--from base_woman` for the women, `base_kid` for
  the children), one at a time: `make-person-3d.mjs` (model only while RUN's rig is down), `rig-local-person.mjs`, render, check.
- 2026-10-23: brief written; the scripts extended (3c). Nothing generated yet: the RUN CLI is not installed on the owner's PC now (not on
  PATH, not in npm, the worker PC unreachable); installing it is the owner's call (the install script from
  github.com/series-ai/rundot-cli-releases, then `rundot login` by the owner).
  **Next:** once `rundot --help` works, `rundot game animate-3d --help` for the animation names (list them here), then step 6.2:
  `node scripts/assets/people3d/make-person-3d.mjs spec_m_polo_visor "<look from 3a>" --root art/spectators --clips walk,idle`,
  `node scripts/assets/people3d/render-person-3d.mjs spec_m_polo_visor --root art/spectators --height 1.80`.
- 2026-10-23: the CLI installed (7.18.0, `%LOCALAPPDATA%\Programs\Rundot`, on the user PATH; the owner signed in). **The CLI gives up after
  600 s** (`TaskCanceledException ... HttpClient.Timeout of 600 seconds`) while RUN keeps working: the first `spec_m_polo_visor` model
  finished 30 s after the CLI gave up. **Do not pay again:** `rundot assets list --game-id AFjPSjQH9kbcCl57sgO3 --service threedgen` shows
  it (generation id, prompt); the model is at
  `https://storage.googleapis.com/venus-app-a037a.firebasestorage.app/threedgen/AFjPSjQH9kbcCl57sgO3/<generation id>/model.compressed.glb`.
  Put that URL in the person's `receipt.json` as `modelUrl`, download it to `model.glb`, and rerun make-person-3d.mjs: it skips to the rig.
  The first take: `8db4bebc-03a3-4d1d-9ac5-627ee227b626`. Other notes from TrickOrTreat (read only): `AI_POLICY_BUDGET_EXHAUSTED` on 3D or
  animation jobs is RUN's policy budget, not the account balance; RUN's library holds 1 GB (`rundot assets rm <id>` after download).
- 2026-10-23: the first take of `spec_m_polo_visor` downloaded to `art/spectators/spec_m_polo_visor/model.glb` (a clean A-pose; a tiny chest
  emblem on the polo, hardly visible at game size), `receipt.json` holds its `modelUrl`. **Rigging is blocked on RUN's side:** `rig-3d`
  answers `[THREE_D_GEN_RIG_FAILED] Provider rejected the request due to invalid parameters` for this model (by URL, by local file, with and
  without `--height`) **and for `base_man`'s model, which rigged fine on 2026-10-20**, so it is the service, not the model. The retry's
  second take of the man will be in the library too (`rundot assets list`): a spare, or remove it. `make-person-3d.mjs --height <m>` now
  passes the height to the rig. **Next:** try `rig-3d` again later (a cheap check: base_man's modelUrl); when it works, rerun
  make-person-3d.mjs for `spec_m_polo_visor` (it skips the model). If it stays broken, a local rig transfer from `base_man` (TrickOrTreat
  did this: `scripts/art/rig-local-costume.mjs`, read only) gives walk and idle without RUN.
- Earlier note:  `rundot` was not on the PATH of the lead's shells (bash and PowerShell); the
  townspeople were made from a shell where it was installed and signed in.
