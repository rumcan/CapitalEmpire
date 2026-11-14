# Fairway Fortune: audio credits (J11, #1270)

Every sound the game makes, where it comes from and under what licence. The rule (the lead's, 2026-11-14): only CC0 / public-domain files (no credit owed,
commercial use allowed) from well-known free libraries; if in doubt, leave it out and synthesize. The test `tests/sound-radio.test.ts` fails if a file under
`public/audio/` is missing from this page, or if the audio passes 12 MB or 30 files.

## 1. Sound effects: made in code, no files

Every click, tick, coin, chime, thump and golf sound (the swish and strike of each club, the ball landing on the fairway, green, sand, water, rough and rock,
the putt dropping, the crowd) is **synthesized on the spot with Web Audio** from oscillators and filtered noise (`src/game/sound/recipes.ts`). No sampled sound
and no recording is in the game, so there is nothing to license and nothing to credit. Author: the game's code (Claude, under the creator's direction).

## 2. The music radio: six CC0 tracks from OpenGameArt

Source: OpenGameArt.org (https://opengameart.org), licence **CC0 1.0** (public domain dedication: no credit owed). The authors are credited anyway (the radio shows
the artist's name; two of them ask for a courtesy credit on their pages). Each source file was downloaded on 2026-11-14 (by the earlier coder of this ticket, each
into its own untrusted folder `F:/ClaudeTemp/jam/audio-src/<name>/`, never run), read only by `ffmpeg`/`ffprobe`, and converted by `scripts/jam/make-music.mjs` to
80 kbps stereo MP3 with the loudness set to -18 LUFS (two passes, so the radio does not jump between tracks) and a 0.4 s fade in and 1.8 s fade out.

| Track | Author | OpenGameArt page | Licence | Date fetched | Original file | Shipped file |
|---|---|---|---|---|---|---|
| Bossa Town | KarateStudios | https://opengameart.org/content/bossa-town | CC0 1.0 | 2026-11-14 | bossa_town.flac (flac, 14.99 MB, 100 s) | public/audio/music/bossa-town.mp3 (mp3 80 kbps, 0.96 MB, 100 s; input -19.3 LUFS to -18) |
| All into Harmony | Pro Sensory (Alex McCulloch) | https://opengameart.org/content/all-into-harmony | CC0 1.0 | 2026-11-14 | all_into_harmony.mp3 (mp3, 2.34 MB, 102 s) | public/audio/music/all-into-harmony.mp3 (mp3 80 kbps, 0.97 MB, 102 s; input -26.5 LUFS to -18) |
| Blue Intermission | congusbongus | https://opengameart.org/content/blue-intermission | CC0 1.0 | 2026-11-14 | blue_intermission.ogg (vorbis, 1.44 MB, 237 s) | public/audio/music/blue-intermission.mp3 (mp3 80 kbps, 2.26 MB, 237 s; input -16.8 LUFS to -18) |
| Seaside Village | KarateStudios | https://opengameart.org/content/seaside-village | CC0 1.0 | 2026-11-14 | seaside_village.flac (flac, 11.43 MB, 76 s) | public/audio/music/seaside-village.mp3 (mp3 80 kbps, 0.72 MB, 76 s; input -15.1 LUFS to -18) |
| Two Left Socks | congusbongus | https://opengameart.org/content/two-left-socks | CC0 1.0 | 2026-11-14 | two_left_socks.ogg (vorbis, 4.61 MB, 200 s) | public/audio/music/two-left-socks.mp3 (mp3 80 kbps, 1.91 MB, 200 s; input -14.9 LUFS to -18) |
| Sunny Side Up 2 | Pro Sensory (Alex McCulloch) | https://opengameart.org/content/sunny-side-up-2 | CC0 1.0 | 2026-11-14 | sunny_side_up_2.mp3 (mp3, 5.38 MB, 141 s) | public/audio/music/sunny-side-up-2.mp3 (mp3 80 kbps, 1.35 MB, 141 s; input -16.9 LUFS to -18) |

The six shipped files are 8.17 MB in all (856 s of music); `src/game/sound/tracks.json` lists them for the radio. Why these six: they are the soft jazz, bossa nova, Rhodes
blues and sunny easy-listening pieces among the 25 candidates, the mood of a small-town golf club in 1985. The Halloween tunes of the owner's other game do not fit.

### How the licences were checked (read this before relying on them)

OpenGameArt answered our fetcher with HTTP 403 on 2026-11-14, so no licence box was read on a live page. Each licence was taken from two secondary records that agree:
the CC0-only scrape of OpenGameArt on Hugging Face (dataset `nyuuzyou/OpenGameArt-CC0`, which lists the page, author, licence "CC0", the posting date and the file
names and sizes) and web search listings of the pages. For each of the six, the page's file name and size matched the downloaded file's size to the tenth of a
megabyte (e.g. Bossa Town: "Bossa Town.wav.flac, 15.7 Mb" against the 15,715,021-byte download). **The owner or the lead should open the six pages and look at the
License(s) box once before the game is submitted**; if any page does not say CC0, delete its file from `public/audio/music/`, its row in `src/game/sound/tracks.json`
and this table (the radio and the test follow the list).

Not used, and why: *Red Heels* (the same author has a CC-BY page of the same name; which one was downloaded is uncertain), *Bossa Shop Theme* (CC-BY 3.0 and CC0
together), and the rest of the 25 candidates for mood, length or confidence.

## 3. Voices

None are shipped yet. The tutorial's voice-over files are made by `scripts/jam/make-voice.mjs` with a local voice engine (one swappable command line); when they are
made they are listed here with the engine, its licence and the date. Windows' built-in voices are never used.

To make them (nothing else to change: the game finds a step's file by the id and a hash of the exact words on the card, and shows the Voice switch in Settings once the manifest has files):

```
node scripts/jam/make-voice.mjs --list                                   # the 16 steps and the words each is said as
VOICE_CMD='<engine> ... {textfile} ... {out}' node scripts/jam/make-voice.mjs --engine-name '<engine and voice>'
```

`{textfile}` is a UTF-8 file with the words, `{out}` the audio file the engine must write (a .wav); the command runs through the shell once per step, then ffmpeg makes a mono 24 kHz 48 kbps MP3 at
-16 LUFS in `public/audio/voice/` (about 100 KB a step; `--set jam` makes only the jam tutorial's 3) and updates `src/game/sound/voice-manifest.json`. A step whose words change later
has no voice until the script is run again (it also removes the files of words no step has now). The script also writes the table below (the test checks every file under `public/audio/` is on this page).

<!-- voices:start -->
No voice files yet.
<!-- voices:end -->
