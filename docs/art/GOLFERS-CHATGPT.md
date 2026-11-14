# Golfers' standing pose and walk through ChatGPT (issue #1235)

The owner, 2026-11-13: "there should be a chat gpt work flow where i can open chat gpt and you generate new animation sprites. i need new ones for the
players and their normal pose and walking. for all the players can you please redo them". This file is the whole route: how to run it, what each step
does, and how to switch back.

## What is made
Each golfer (`art/golfers/<id>/`, 10 of them) has `sheet.webp` + `sheet.json`: 8 rows (the headings S SW W NW N NE E SE; never mirrored, each its own
picture), 9 columns (column 0 standing, columns 1-8 the walk loop), cells 160 x 279 px, the feet at the anchor (80, 269). One ChatGPT picture = one
golfer at one heading: a 3x3 sheet (cell 1 standing, cells 2-9 the walk) on a flat key colour. So a golfer is 8 pictures, all ten are 80.
The game (prep-sprites.mjs packs the sheets into the walker atlas) and the golf view (packages/cinderlinks/build.mjs copies them) read the sheet as before:
nothing else changes. The first import of a golfer keeps the old one as `sheet-old.webp` / `sheet-old.json`.

## How to run it (the owner, or any session)
1. **ChatGPT**: open the Claude app's browser pane on https://chatgpt.com, signed in (the pane keeps the sign-in).
2. **The bridge**: `python D:/AI/chatgpt-bridge/bridge.py` (port 8765; stop it with Ctrl+C or its pid in `bridge-pid.txt`).
3. **The packs** (in a checkout with `art/golfers`):
   `python scripts/assets/golfers/golfer_pack.py --golfer golf_pro_m2 --skip-done`
   writes `D:/AI/chatgpt-bridge/guides/golfers/<id>/<H>/` (ref.png, guide.png, PROMPT.md, CHECKS.md) and the queue `D:/AI/chatgpt-bridge/queue-golfers.json`.
   No `--golfer`: all ten. `--skip-done` leaves out what is already in `D:/AI/chatgpt-bridge/in`, so a stopped run resumes where it stopped.
4. **Run the queue** in the ChatGPT tab: paste `D:/AI/chatgpt-bridge/runner.js` into the page (a session does it with its javascript tool; by hand: the
   browser's console), then `__start('golfers')`. Each picture gets its own new chat (short chats: past ~10 pictures ChatGPT mixes things up), the two
   references are attached, the prompt (with the heading in words) is typed and sent, and the finished picture is saved as
   `D:/AI/chatgpt-bridge/in/<id>~<H>-golfers.png`. Progress and errors: `D:/AI/chatgpt-bridge/queue.log`. Stop: `window.__stopQueue = true`.
   A usage limit stops the queue (logged as LIMIT); wait for it to reset, run step 3 with `--skip-done` again, paste, start.
   **By hand** instead: in a new chat attach `ref.png` then `guide.png` of a heading's folder, paste its `PROMPT.md`, check against `CHECKS.md`, save the
   picture into `D:/AI/chatgpt-bridge/in/` under the name above.
5. **Import**: `python scripts/assets/golfers/import_golfer.py --all --golfer golf_pro_m2` (or one picture: `import_golfer.py <path>`; `--dry-run
   --preview p.png` writes only a picture: the old row on top, the new below). It keys the background, finds the nine figures, scales them to the
   current figure's height at that heading, stands them on the sheet's ground line with the body over the anchor, and writes the row.
6. **Look**: `python scripts/assets/golfers/import_golfer.py --contact golf_pro_m2 --out m2.png` (every heading, old over new) and `m2-walk.gif`
   (the eight headings walking). A bad heading: run it again in ChatGPT (delete its picture from `in/`, step 3 with `--heading NW --skip-done`).
7. **Into the views**: `npm run cinder:build` (the golf view); the game's walker atlas: `node scripts/assets/prep-sprites.mjs` (needs the full art
   checkout; heavy, run it through `E:/ClaudeTemp/heavy.sh`). Commit the sheets (and sheet-old.*).

## Switch back
Copy `sheet-old.webp` / `sheet-old.json` over `sheet.webp` / `sheet.json` (one golfer), or a single heading: `git show <commit>^:art/golfers/<id>/sheet.webp`.

## The prompt (golfer_pack.py PROMPT; the template is D:/AI/chatgpt-bridge/prompt-golfers.txt)
Reference 1 = who the golfer is (the old sheet's standing frames from the front, three-quarter, side and back, enlarged on grey); reference 2 = the 3x3
layout at this heading (the old frames on the key colour: they fix the heading, camera, size and place; their poses are only rough). The prompt asks for
a relaxed standing pose (head up, arms down) and a named 8-phase walk loop (contact, settle, passing, rise, each side), a painterly sprite, orthographic
30 degrees down, never mirrored, the sun at the upper right, mid-1980s golf clothes with no logos, and one flat key colour: the one of magenta, green
and blue farthest from the golfer's clothes (golfer_pack.py picks it). A woman golfer's prompt says she/her.

## The owner's rules this keeps
Sun at the screen's upper right; never mirrored; the golfer's identity from the old sheet; the same scale (the importer matches the old height per
heading); background keyed out; 1985 clothes, no logos; art goes straight in, the old kept as an option.

## The clips and the staff (2026-11-14: "the animations too")
- **A golfer's swing and putt**: `golfer_pack.py --clip golf_drive` (12 frames, one 4x3 landscape picture per heading) or `--clip golf_putt`
  (8 frames, 4x2). Pictures are named `<id>~<H>~<clip>-golfers.png`; import with `import_golfer.py --all --golfer <id> --clip golf_drive`
  (the frame count, cells, anchor and `times` stay as they were, so the game plays them unchanged; `<clip>-old.*` is kept) and look with
  `--contact <id> --clip golf_drive`. Reference 1 is the golfer's new painted standing pose, so the clothes stay the same.
- **A new person** (the staff: art/spectators/staff_range_m, staff_role_headpro, _teachpro, _secretary, _caddie, _greenkeeper, _mower):
  1. a design picture: the body of a similar rigged person (`--like`) as a 4-view grey mannequin + the role's description, painted once;
  2. `golfer_pack.py --family spectators --golfer <id> --like <body> --ref <id>/design.png --who "<role>"` (add `--clip golf_drive` for the
     pros, `--clip pick` for the attendant): the guide frames become grey mannequins (with coloured guides ChatGPT painted the guide's person);
  3. import with `import_golfer.py --family spectators ...`. The game draws them from prep-sprites' **staff** group (staff_range_*,
     staff_role_*; clips pick and golf_drive, a missing clip shows the person standing) once prep-sprites has run.
- **Re-runs**: `--note "..."` adds words to the clothes line (a colour that drifted); `--heading W` for one heading. `import_golfer.py --all`
  skips a picture whose figures touch (two in one cell) and says so: paint that heading again.
- **Runners**: `__start('golfers')` (one picture per item) or the pairs runner `__start2('<kind>')` (queue-<kind>.json items `[name~v, [refs],
  prompt 1, prompt 2]`: two views of one object in one chat, the stand-in buildings; one view when prompt 2 is empty). Never start a second
  loop in the same tab while one runs (they race and mix attachments): reload the tab first. Several tabs can run queues side by side.
- **Into the game**: the golf view on `npm run cinder:build`; the map (the range customers, the pros, the staff, you) after
  `scripts/assets/prep-sprites.mjs` in a full checkout with TrickOrTreat.

## Transparent backgrounds (2026-11-14)
The owner: "chat gpt can make transparent pngs ... dont have to key out". Stand-in and building pictures now ask for a fully transparent background, and
`prep-range-art.mjs` uses a picture's own alpha (`key-magenta.mjs` `alphaOrKey`). The golfer and staff sheets above still use a key colour (`golfer_pack.py`,
`import_golfer.py` find the nine figures on it); they are all painted. A new run should ask for transparency too, with `import_golfer.py` taught to read the alpha first.
