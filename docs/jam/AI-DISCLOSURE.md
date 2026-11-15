# Golf Manager 2026: AI and asset disclosure

(The game was called "Fairway Fortune" until 2026-11-15.)

What in the jam build was made with AI tools, which tools, and how; and what was not. Every line comes from the repo's own records
(the `*.provenance.json` file beside each generated picture, the art docs, the commit trailers and `docs/jam/AUDIO-CREDITS.md`).
Where the records do not say, this page says so instead of guessing. Counts are from `lead/live` on 2026-11-15.

**In one line:** the code was written by AI coding agents (mostly Anthropic's Claude) under the creator's design, direction and review;
nearly all the 2D art was generated with AI image tools from the creator's direction, then cut, cleaned and fitted by the game's own scripts;
the sound effects are synthesized in code; the music is human-made CC0 music; there is no AI voice and no AI music.

## 1. Code

- Written with **Anthropic's Claude** in **Claude Code**, under the creator's design, direction and review. The commit history's co-author
  lines: Claude Opus 5.5 about 1,930 commits, Claude Sonnet 5.5 about 420, Claude Haiku 5.5 about 80, Claude Fable 5.1 / 5.2 about 35.
- **OpenAI Codex** co-authored about 60 commits (an earlier period); about 35 more are signed by a coding agent named "Arena Agent".
  For two days in October (2026-10-22 and 23) a separate agent, "Argon", led the engineering with a GitHub Copilot agent writing code
  (`docs/ARGON-LEAD.md`).
- The golf view's pixel renderer (`packages/cinderlinks`) is code: the golfer, the ball and the ground are drawn by the program, not painted.
- Runtime libraries: React and React DOM, clsx, tailwind-merge (open-source, MIT).

## 2. Pictures (2D art)

Each generated picture has a provenance record beside it in `art/` with the date, the prompt, the references and the generator.

| Tool | How it was used | Records |
|---|---|---|
| **OpenAI image generation, through the Codex app** ("image_gen") | Buildings and businesses in their isometric views, props, vehicles, range and course kit, the painted ground tiles (grass, fairway, sand, soil...), portraits, tournament and catalogue items | 326 provenance files name it as the generator; many more crop records point at its output folder |
| **ChatGPT image generation** (the creator's own ChatGPT, driven by a local bridge) | The painted golfers (the walk, drive and putt sheets: `docs/art/GOLFERS-CHATGPT.md`, #1235); the 132 painted action tiles of the interface (tile sheets v3 to v13, cut into `src/assets/ui/tiles`); repaints of the farm animals; and other sheets | 86 provenance files |
| **RUN.world** (image generation, model "gemini-3.1-flash-image-preview") | The first sheet of interface tiles (v1, 2026-10-28); the earlier golf sprites and the art the game took over from the creator's other game (TrickOrTreat's sprite atlas, made through RUN.world's sheet runner: `docs/GOLF-SPRITES.md`, `docs/ART-PIPELINE.md`) | 1 provenance file; the atlas has no per-file record |

After generation, the game's scripts (`scripts/assets/prep-*.mjs`) cut the sheets into single pictures, key or keep the transparency, scale them
and pack them into atlases; the creator reviewed them in the art studio and sent back what was wrong. No picture is a photograph or traced from a
third-party game.

Not recorded: the origin of the interface icon sheet (`docs/ui/icon-sheet.webp`, `src/assets/ui/icons`), the four treat cards copied from TrickOrTreat,
and a few pictures the creator supplied himself (`art/owner-supplied`, the desert props, a ploughed-field painting). These have no generator record,
so this page does not say whether they were hand-made or AI-made.

## 3. 3D models, people and animals (rendered to sprites; no 3D model ships)

- **Townspeople and spectators:** a RUN.world image of each, turned into a 3D model with RUN's image-to-3D (Hunyuan3D v3.1 Pro), rigged and
  animated (Meshy for rigs and clips, or a local transfer from a base rig), then rendered to sprite sheets on the creator's PC
  (`docs/3D-START-HERE.md`, `docs/SPECTATOR-ART.md`, `art/golfers/*.json`).
- **Golfers:** started the same way (RUN image, image-to-3D, base rig clips); the sheets that ship are the ChatGPT-painted ones above
  (the 3D renders are kept as `sheet-old`).
- **Farm animals:** 3D models made with **Idol**, a free local 3D generator on the creator's own GPU, rendered and then repainted with ChatGPT
  (`scripts/assets/animals/idol_models.py`).

## 4. Sound and music (details in `docs/jam/AUDIO-CREDITS.md`)

- **Sound effects:** none recorded and none AI-made. Every click, chime, swing, strike, landing and crowd sound is synthesized with Web Audio from
  oscillators and noise in the game's code (`src/game/sound/recipes.ts`, written by Claude under the creator's direction).
- **Music (the radio):** eleven CC0 tracks by human composers from OpenGameArt.org: "Bossa Town" and "Seaside Village" by KarateStudios, "All into
  Harmony" and "Sunny Side Up 2" by Pro Sensory (Alex McCulloch), "Blue Intermission" and "Two Left Socks" by congusbongus, and five chiptunes by
  Juhani Junkala (SubspaceAudio). Converted to MP3 and levelled by `scripts/jam/make-music.mjs`; nothing AI-made.
- **Voice:** none ships (the tutorial's voice-over plumbing exists, no voice files were made).

## 5. Data

- **OpenStreetMap:** the real-course catalogue (`public/catalogue/*.json`) and the real courses in the golf view's package carry
  "© OpenStreetMap contributors, ODbL 1.0". Real-course import is part of the jam build, so the credit ships with it (the game's credits and this page).

- **Elevation data:** real-course ground height from the United States 3DEP (formerly NED) and global GMTED2010 and SRTM terrain data,
  courtesy of the U.S. Geological Survey (credited in the game's Settings, beside OpenStreetMap).

## For the jam form (short)

> Yes. **Code:** written with AI coding agents, mostly Anthropic's Claude (Claude Code), some OpenAI Codex, under the creator's design and review.
> **Art:** 2D art generated with OpenAI image generation (via Codex), ChatGPT and RUN.world from the creator's direction, then cut and fitted by the
> game's own scripts; people and animals are 3D models made with RUN image-to-3D, Meshy and Idol, rendered to sprites.
> **Sound:** effects synthesized in code; music is eleven CC0 tracks by human composers from OpenGameArt (credited). No AI music, no AI voice.
