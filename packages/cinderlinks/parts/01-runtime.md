# BRS: Cinderlinks

Cinderlinks is Cinderdeep's golf game. The same wanderer plays golf on a pixel course seen from an isometric camera. The ground is a height field drawn column by column, so hills bulge and steep steps show rock cliff faces. Every pixel of ground, every plant and every rock is generated from a seed and never repeats.

Format (Fidelity reads this file):
- `##` starts a part; `###` a sub-part.
- `R:` is a requirement.
- `File:` is the file the part writes.
- `Check:` is a text that file must contain.
- A fenced block marked `file=` is that part's code.

## runtime Runtime
The game runs on Windows from its own folder, with no server, no network and no install (as Cinderdeep does).
R: The game is a single HTML page with one JavaScript file and one CSS file, with no external libraries.
R: launch.cmd opens the page in Microsoft Edge in app mode, as its own window.
R: The page has a canvas for the game, an overlay for the HUD and a small canvas for the hole map.
R: The HUD wears CapitalEmpire's look (J5): charcoal glass panels, gold accents and cream letters, as its cards and rail.
File: launch.cmd
Check: --app=
File: index.html
Check: id="view"
Check: id="hud"
Check: id="mini"
Check: id="minimap"

````cmd file=launch.cmd
@echo off
rem Cinderlinks: opens the game in its own Microsoft Edge app window, straight from this folder. No server, no install.
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
start "" "%EDGE%" --app="file:///%~dp0index.html" --new-window --user-data-dir="%TEMP%\cinderlinks-edge" --window-size=1320,790
````

````html file=index.html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Golf Manager 2026</title>
<link rel="stylesheet" href="style.css">
<link rel="icon" href="data:,">
</head>
<body>
<div id="stage">
  <canvas id="view"></canvas>
  <canvas id="over"></canvas>
  <div id="hud">
    <div id="card"><div id="cardLine"></div><div id="wind" title="Wind"><span id="windArrow">&#10148;</span><span id="windTxt"></span></div><div id="cardRead"></div><div id="cardMore"></div></div>
    <div id="minimap" title="Click to fold the hole map"><canvas id="mini" width="128" height="168"></canvas><span id="miniTag"></span></div>
    <div id="power"><div class="track"><i id="powerBar"></i></div><div id="powerTxt"></div></div>
    <div id="clubs"></div>
    <div id="corner"><button id="keys" type="button" title="Keys and help (H)">?</button><div id="style"><button id="styleBtn" type="button" title="Settings">&#9881;</button><div id="styleMenu"></div></div></div>
    <button id="jump" type="button"><img src="tiles/jump-to-ball.webp" alt="" aria-hidden="true" draggable="false">Jump to ball <b>J</b></button>
    <button id="gimme" type="button"><img src="tiles/gimme.webp" alt="" aria-hidden="true" draggable="false">Gimme <b>Y</b></button>
    <div id="help"></div>
    <div id="msg"></div>
  </div>
</div>
<script>var RSCALE = +(new URLSearchParams(location.search).get('scale')); try { RSCALE = RSCALE || +localStorage.getItem('cinderlinks.scale'); } catch (e) {} RSCALE = RSCALE || 0.75;</script>
<script src="courses.js"></script>
<script src="game.js"></script>
</body>
</html>
````

## look The look
The page keeps Cinderdeep's frame (black surround, pixelated canvas) and wears CapitalEmpire's own look on top of it (J5, the owner 2026-11-13: "fit the UIX of the golf game to the capital empire ui"): the same dark charcoal glass panels, gold accents and outlines, cream ink, system sans text and the Georgia serif for titles as CapitalEmpire's cards and rail (src/index.css: --panel, --gold, --ink, .glass, .btn, .seg, .keycap).
R: The canvas is scaled with no smoothing and keeps 16:9.
R: The HUD's tokens are CapitalEmpire's: --gold #f5b52e, --gold-hi #ffd166, --panel rgba(20, 21, 25, 0.9), --ink #efe9da, --muted #a9a394, hairline borders, rounded corners, soft drop shadows; the panels are solid enough to read over the painted picture (no backdrop blur: it would be redrawn over the moving picture every frame).
R: The HUD's text size follows the picture's width (13 px at 1280 px wide, 11 to 15 px), so it reads the same inside CapitalEmpire's frame and in its own window.
R: Inside CapitalEmpire (host mode: the body carries the class host) the hole map and the wind sit below CapitalEmpire's own buttons along the top right. The help never runs off the picture: a long help scrolls up and down (CapitalEmpire's thin scrollbar), never sideways.
File: style.css
Check: image-rendering: pixelated
Check: --panel: rgba(20, 21, 25, 0.9)
Check: body.host #minimap
Check: #minimap.fold
Check: #cover.on
R: 2026-11-15 (the owner: "Stuff should be collapsed .. Icons are sliced off at the sides"): the HUD is collapsed by default and nothing runs off the picture at any size: the hole is a small pill (the hole, par, the way to the pin, the shot, the wind's arrow and mph) that a click opens to its facts (kept); the club in hand is one compact picker (previous and next arrows, the lie as a chip, the aim's distance above it, the whole bag folded above it); the shot is shaped on a ball in a panel the corner button opens; "?" (the keys) and the Settings gear sit in the bottom right corner.
Check: #card.open #cardMore
Check: #clubs .pick
Check: #clubs .bagl
Check: #clubs .club .ci
Check: #shapeBall
Check: #shotBtn
Check: #corner
Check: #aimd

````css file=style.css
:root {
  --gold: #f5b52e; --gold-hi: #ffd166; --gold-line: rgba(245, 181, 46, 0.55); --gold-wash: rgba(245, 181, 46, 0.14);
  --gold-btn: linear-gradient(#ffc94a, #f0a91e);
  --panel: rgba(20, 21, 25, 0.9); --panel-2: rgba(32, 33, 38, 0.92); --line: rgba(255, 255, 255, 0.08); --line-hi: rgba(255, 255, 255, 0.14);
  --ink: #efe9da; --muted: #a9a394; --good: #74e3a4; --warn: #fb9a4b;
  --shadow: 0 10px 30px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --serif: Georgia, "Palatino Linotype", "Book Antiqua", Palatino, serif;
}
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
body { display: flex; align-items: center; justify-content: center; color: var(--ink); user-select: none;
  font: 13px/1.35 var(--sans); -webkit-font-smoothing: antialiased; }
button { font-family: var(--sans); }
#stage { position: relative; width: min(100vw, calc(100vh * 16 / 9)); aspect-ratio: 16 / 9; container-type: inline-size; }
#view { display: block; width: 100%; height: 100%; image-rendering: pixelated; cursor: crosshair; }
#over { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; }
#hud { position: absolute; inset: 0; pointer-events: none; font-size: clamp(11px, 1.016cqw, 15px); line-height: 1.35; }

/* the glass panels (CapitalEmpire's .glass): the card, the help, the shot panel, the settings menu, the leaderboard and match cards */
.panel, #card, #help, #shotc, #styleMenu { background: var(--panel); border: 1px solid var(--line); border-radius: 0; box-shadow: var(--shadow); color: var(--ink); }
body > .panel { border-radius: 0; }
#prac .pd { display: flex; gap: 0.7em; align-items: flex-start; padding: 0.5em 0.55em; margin: 0.35em 0; border: 1px solid var(--line); border-radius: 0; background: rgba(0, 0, 0, 0.22); cursor: pointer; }
#prac .pd.on { border-color: var(--gold-line); background: var(--gold-wash); } #prac .pd.off { opacity: 0.45; cursor: default; } #prac .pd.done .pt i { color: var(--good); } #prac .pd:hover:not(.off) { border-color: var(--line-hi); }
#prac .pt { display: flex; justify-content: space-between; gap: 0.5em; } #prac .pt b { color: var(--ink); } #prac .pt i { font-style: normal; color: var(--gold-hi); } #prac .pg { color: var(--ink); font-size: 0.92em; margin-top: 0.15em; } #prac .pr { color: var(--muted); font-size: 0.85em; } #prac .pw { color: var(--warn); font-size: 0.85em; margin-top: 0.1em; }
#prac .pb { height: 0.4em; margin: 0.25em 0; border-radius: 999px; background: rgba(255, 255, 255, 0.1); overflow: hidden; } #prac .pb u { display: block; height: 100%; text-decoration: none; border-radius: 999px; background: var(--gold); } #prac .pd.done .pb u { background: var(--good); }
#prac .pi { flex: none; width: 64px; height: 64px; border-radius: 0; pointer-events: none; } #prac .px { flex: 1; min-width: 0; }   /* (J8: a drill's tile at the left of its words; #1301: 64 px, a card) */
#prac .pn { margin-top: 0.45em; color: var(--gold-hi); } #prac .pf { margin-top: 0.25em; color: var(--muted); font-size: 0.88em; }
/* #1344 (the owner: "make the 'practice - the range' window shrink and expand"): the practice panel's place and size live here so it can fold. Its header folds it; folded, the
   header alone is a pill in the hole pill's look (the serif gold word, the place, the ball, the arrow). Long words wrap: never a sideways scroll bar */
#prac { position: absolute; left: 1.4%; top: 20%; width: clamp(250px, 24vw, 340px); max-width: 40%; max-height: 64%; box-sizing: border-box; padding: 0.55em 0.7em; font-size: clamp(11px, 0.95vw, 14px); line-height: 1.35;
  pointer-events: auto; z-index: 5; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; overflow-wrap: anywhere; }
#prac .ph { position: sticky; top: -0.55em; z-index: 1; display: flex; align-items: baseline; gap: 0.5em; margin: -0.55em -0.1em 0.3em; padding: 0.45em 0.2em 0.35em; background: #16171b; border-bottom: 1px solid var(--line); cursor: pointer; white-space: nowrap; overflow-wrap: normal; min-width: 0; }   /* (sticky: the fold is always at hand while the list scrolls) */
#prac .ph b { font: 700 1.1em/1.2 var(--serif); color: var(--gold-hi); }
#prac .ph i, #prac .ph em { font-style: normal; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#prac .ph i { color: var(--ink); } #prac .ph em { display: none; color: var(--muted); font-variant-numeric: tabular-nums; }
#prac .ph i::before, #prac .ph em::before { content: '\00b7'; margin-right: 0.5em; color: var(--muted); }
#prac .ph s { margin-left: auto; padding-left: 0.3em; text-decoration: none; color: var(--muted); font-size: 0.8em; }
#prac .ph:hover b { color: var(--gold); } #prac .ph:hover s { color: var(--gold-hi); }
#prac.fold { width: auto; max-width: min(24em, 40%); padding: 0.35em 0.8em 0.4em; border-radius: 0; overflow: hidden; }
#prac.fold > :not(.ph) { display: none; }
#prac.fold .ph { position: static; margin: 0; padding: 0; border: 0; background: none; }
#prac.fold .ph em { display: inline; }
#prac.fold .ph s { transform: rotate(-90deg); }
#prac.fold:hover { border-color: var(--gold-line); }
/* #1344 (the owner: "fix the scroll bar style"): the HUD's scroll bar on every panel that scrolls (the practice panel, the shot panel, the help): thin (6 px), a rounded muted-gold thumb on a
   clear track, brighter under the pointer, no arrows; Blink and WebKit by ::-webkit-scrollbar, Firefox by scrollbar-width and scrollbar-color (set only where ::-webkit-scrollbar is not known:
   Chrome drops its ::-webkit-scrollbar look once those are set). Never a sideways one: the panels hide overflow-x */
#prac::-webkit-scrollbar, #shotc::-webkit-scrollbar, #help::-webkit-scrollbar { width: 6px; height: 0; background: transparent; }
#prac::-webkit-scrollbar-button, #shotc::-webkit-scrollbar-button, #help::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
#prac::-webkit-scrollbar-track, #shotc::-webkit-scrollbar-track, #help::-webkit-scrollbar-track, #prac::-webkit-scrollbar-corner, #shotc::-webkit-scrollbar-corner, #help::-webkit-scrollbar-corner { background: transparent; }
#prac::-webkit-scrollbar-thumb, #shotc::-webkit-scrollbar-thumb, #help::-webkit-scrollbar-thumb { min-height: 28px; border-radius: 999px; background: rgba(245, 181, 46, 0.36); }
#prac::-webkit-scrollbar-thumb:hover, #shotc::-webkit-scrollbar-thumb:hover, #help::-webkit-scrollbar-thumb:hover { background: rgba(255, 209, 102, 0.85); }
@supports not selector(::-webkit-scrollbar) {
  #prac, #shotc, #help { scrollbar-width: thin; scrollbar-color: rgba(245, 181, 46, 0.4) transparent; }
  #prac:hover, #shotc:hover, #help:hover { scrollbar-color: rgba(255, 209, 102, 0.8) transparent; }
}
/* #1344 (the owner: "add some info about the ball you just hit. center top"): the last ball's launch-monitor strip, at the top centre under the edge, between the hole pill (left, at most
   26em wide) and the map (right): the club, a row of cells (a small caps name over the number) that wraps, and one or two tips. Only while there is a last ball */
#lastBall { position: absolute; left: 50%; top: 2%; transform: translateX(-50%); display: none; box-sizing: border-box; width: max-content; max-width: min(40em, calc(100% - 2 * (1.4% + 27em)));
  padding: 0.4em 0.65em 0.45em; border-radius: 0; pointer-events: auto; font-size: 0.92em; line-height: 1.3; overflow-wrap: anywhere; }
#lastBall.on { display: block; }
#lastBall .lbh { display: flex; align-items: center; gap: 0.5em; white-space: nowrap; overflow-wrap: normal; }
#lastBall .lbh b { font: 700 1.05em/1.2 var(--serif); color: var(--gold-hi); }
#lastBall .lbh em { flex: 1; min-width: 0; font-style: normal; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; }
#lastBall .lbh em::before { content: '\00b7'; margin-right: 0.5em; color: var(--muted); }
#lastBall .lbx { flex: none; width: 1.55em; height: 1.55em; padding: 0; display: grid; place-items: center; border: 1px solid var(--line-hi); border-radius: 50%; background: rgba(255, 255, 255, 0.06); color: var(--muted); font: 700 0.95em/1 var(--sans); cursor: pointer; }
#lastBall .lbx:hover { color: var(--gold-hi); border-color: var(--gold-line); }
#lastBall .lbr { display: flex; flex-wrap: wrap; gap: 0.3em; margin-top: 0.3em; }
#lastBall .lbr span { display: flex; flex-direction: column; flex: 1 0 auto; min-width: 4.4em; padding: 0.12em 0.5em 0.18em; border-radius: 0; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--line); }
#lastBall .lbr i { font-style: normal; font-size: 0.7em; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
#lastBall .lbr b { font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
#lastBall .lbt { margin-top: 0.3em; font-size: 0.95em; }
#lastBall .lbt div::before { content: '\203a'; margin-right: 0.4em; color: var(--muted); }
#lastBall .lbt .tip { color: var(--gold-hi); } #lastBall .lbt .good { color: var(--good); }
.pflag { padding: 0.1em 0.45em; border-radius: 0; background: var(--panel); border: 1px solid var(--gold-line); color: var(--ink); font: 600 clamp(10px, 0.85vw, 13px) system-ui, sans-serif; white-space: nowrap; }
body > .panel > b:first-child { font-size: 0.85em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }

/* 2026-11-15 (the owner: "Stuff should be collapsed"): the card is a small pill: the hole in the serif, gold, then par, the way to the pin and the shot, and the
   wind (an arrow as the camera sees it and its mph, gold in a gust) in it; on the green the break under it. A click opens its facts beneath (CapitalEmpire's stat
   lines: muted name, bold cream figure); the choice is kept */
#card { position: absolute; left: 1.4%; top: 2%; box-sizing: border-box; max-width: min(26em, 44%); display: flex; flex-wrap: wrap; align-items: center; gap: 0.15em 0.6em; padding: 0.35em 0.8em 0.4em; border-radius: 0; pointer-events: auto; cursor: pointer; }
#card:hover { border-color: var(--gold-line); }
#cardLine { display: flex; align-items: baseline; gap: 0.5em; white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 0; }
#cardLine b { font: 700 1.15em/1.2 var(--serif); color: var(--gold-hi); }
#cardLine i { font-style: normal; font-weight: 600; color: var(--ink); }
#cardLine i::before { content: '\00b7'; margin-right: 0.5em; color: var(--muted); }
#cardLine s { text-decoration: none; color: var(--muted); font-size: 0.8em; }
#card.open #cardLine s { display: inline-block; transform: rotate(180deg); }
#wind { display: inline-flex; align-items: center; gap: 0.3em; padding: 0.05em 0.55em; border-radius: 999px; background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line); color: var(--ink); font-weight: 700; font-size: 0.95em; white-space: nowrap; }
#windArrow { display: inline-block; line-height: 1; transition: transform 0.25s; }
#windTxt:empty { display: none; }
#wind.gust { border-color: var(--gold); color: var(--gold-hi); background: var(--gold-wash); }
#cardRead { flex-basis: 100%; font-size: 0.92em; font-weight: 600; color: var(--gold-hi); white-space: normal; }
#cardRead:empty { display: none; }
#cardMore { display: none; flex-basis: 100%; margin-top: 0.3em; padding-top: 0.3em; border-top: 1px solid var(--line); }
#card.open #cardMore { display: block; }
#card .course { font-size: 0.92em; font-weight: 700; color: var(--ink); margin-bottom: 0.15em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#card .row { display: flex; justify-content: space-between; gap: 1.4em; font-size: 0.95em; }
#card .row span { color: var(--muted); white-space: nowrap; }
#card .row b { color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; font-weight: 600; }
#card .note { margin-top: 0.35em; font-size: 0.8em; line-height: 1.3; color: var(--muted); white-space: normal; }
/* (inside CapitalEmpire its own buttons, the round menu and the close button, run along the top right: the map sits below them) */
body.host #minimap { top: 56px; }
/* #1327 (the owner: "add minimap of the hole you are playing in the top right, that shows where you are and where you are aiming"): the hole's map, tee at the bottom and the green at the top as the camera
   looks down the hole, sized to the hole (--mapw, --mapb: its width, and how far down it reaches, in em, set with each hole; the wind sits left of it and the shot panel below it). The folded HUD does not hide it
   in CapitalEmpire; a click folds it to a small pill (kept). Only the dots and the line over it are redrawn. */
#minimap { position: absolute; right: 1.4%; top: 2%; padding: 0.25em; line-height: 0; pointer-events: auto; cursor: pointer; background: var(--panel); border: 1px solid var(--line-hi); border-radius: 0; box-shadow: var(--shadow); }
#minimap:hover { border-color: var(--gold-line); }
#mini { display: block; image-rendering: pixelated; border-radius: 0; }
#miniTag { position: absolute; right: 0.5em; top: 0.5em; width: 1.35em; height: 1.35em; border-radius: 50%; background: var(--panel); border: 1px solid var(--line-hi); color: var(--gold-hi); font: 700 0.85em/1.25em var(--sans); text-align: center; }
#minimap.fold { padding: 0.3em 0.8em; border-radius: 999px; line-height: 1.35; }
#minimap.fold #mini { display: none; }
#minimap.fold #miniTag { position: static; display: block; width: auto; height: auto; border: 0; border-radius: 0; background: none; font: 600 0.95em/1.35 var(--sans); color: var(--ink); }

/* the power bar (the view's own play) and the swing button (in CapitalEmpire): a rounded track, the fill from green to gold, the gold aim mark and the white hole mark */
#power { position: absolute; left: 36%; right: 36%; bottom: 8%; opacity: 0; transition: opacity 0.15s; text-align: center; }
#power.on { opacity: 1; }
#swingBtn { position: absolute; left: 50%; bottom: 2.2%; transform: translateX(-50%); width: 23em; height: 3.6em; display: none; pointer-events: auto; cursor: pointer; touch-action: none; user-select: none; overflow: hidden;
  background: var(--panel); border: 1px solid var(--gold-line); border-radius: 0; box-shadow: var(--shadow); color: var(--ink); }
#swingBtn.on { display: block; }
#swingBtn.on:hover { border-color: var(--gold); }
#swingBtn.idle { opacity: 0.6; cursor: default; border-color: var(--line); }
#swingBtn.swinging { border-color: var(--gold); box-shadow: var(--shadow), 0 0 0 1px var(--gold), 0 0 16px rgba(245, 181, 46, 0.35); }
#swingBtn i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: linear-gradient(90deg, rgba(116, 227, 164, 0.35), rgba(116, 227, 164, 0.7) 40%, rgba(255, 209, 102, 0.85) 90%); }
#swingBtn b { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1.5px; display: none; }
#swingBtn b.on { display: block; }
#swingBtn b.aimmk { background: var(--gold-hi); box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), 0 0 6px rgba(255, 209, 102, 0.7); }
#swingBtn b.aimmk::after { content: ''; position: absolute; left: -4.5px; top: 0; border: 6px solid transparent; border-top-color: var(--gold-hi); }
#swingBtn b.holemk { width: 2px; margin-left: -1px; background: #fff; opacity: 0.9; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45); }
#swingBtn span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.05em; font-weight: 700; white-space: nowrap; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 8px rgba(0, 0, 0, 0.5); }
/* #1336: the tapped boost, a thin bar over the power that rises with each tap of Up and falls when he stops (orange; red with the Power Mash charge armed), and the
   spin readout beside the meter during his flight: a small ball with the spin's dot, its words above it */
#swingBtn u.boostbar { position: absolute; left: 0; top: 0; width: 0; height: 0.32em; display: none; text-decoration: none; border-radius: 0; background: linear-gradient(90deg, rgba(255, 196, 96, 0.75), #ff9b3d); box-shadow: 0 0 6px rgba(255, 155, 61, 0.6); }
#swingBtn u.boostbar.on { display: block; }
#swingBtn u.boostbar.armed { background: linear-gradient(90deg, #ff9b3d, #e8573c); box-shadow: 0 0 8px rgba(232, 87, 60, 0.75); }
#spinRead { position: absolute; bottom: 2.2%; left: calc(50% - 11.5em - 4.2em); width: 3.6em; height: 3.6em; display: none; pointer-events: none; }
#spinRead.on { display: block; }
#spinRead canvas { display: block; width: 100%; height: 100%; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.6)); }
#spinRead span { position: absolute; right: 0; bottom: calc(100% + 0.25em); padding: 0.1em 0.5em; border-radius: 999px; background: var(--panel); border: 1px solid var(--gold-line); font-size: 0.8em; font-weight: 700; white-space: nowrap; color: var(--ink); }
#powerTxt { display: inline-block; margin-top: 0.4em; padding: 0.15em 0.7em; border-radius: 999px; background: var(--panel); font-size: 0.95em; font-weight: 700; color: var(--ink); }
#powerTxt:empty { display: none; }
.track { position: relative; height: 1.1em; background: var(--panel); border: 1px solid var(--gold-line); border-radius: 999px; box-shadow: var(--shadow); overflow: hidden; }
.track i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, var(--good), var(--gold-hi) 72%, #e8573c); }
.track b { display: none; position: absolute; top: 0; bottom: 0; }
#power.meter .track b { display: block; }
#power.meter .track i { background: linear-gradient(90deg, rgba(116, 227, 164, 0.6), var(--good) 14%, var(--gold-hi) 80%, #e8573c); }
#power .track b.sweet { background: rgba(116, 227, 164, 0.35); border-left: 1px solid #b8ffc8; border-right: 1px solid #b8ffc8; }
#power .track b.top { width: 2px; margin-left: -1px; background: #fff; }

/* 2026-11-15 (the owner: "Why not make the draw and fade like normal golf games where you just move the dot on the ball?"): the shot is shaped on a ball. A small
   button at the bottom right shows the ball with its dot and the shape picked; a click opens the panel above it (kept shut until asked, the choice kept): one big
   ball to drag the dot on (left draw, right fade, up high, down low), the painted draw, fade, high and low tiles round it, a gold ring for his limit, a small arrow
   that previews the shape, Reset, and, folded under it, how to boost and spin (#1336) and Go for it. It never runs off the picture: it scrolls up and down inside. */
#shotBtn { display: none; align-items: center; gap: 0.4em; height: 2.6em; box-sizing: border-box; padding: 0 0.75em 0 0.25em; border-radius: 999px; background: var(--panel); border: 1px solid var(--gold-line); box-shadow: var(--shadow); color: var(--ink); font: 700 1em/1 var(--sans); cursor: pointer; }
#shotBtn.on { display: inline-flex; } #shotBtn:hover { border-color: var(--gold); } #shotBtn.open { background: linear-gradient(var(--gold-wash), var(--gold-wash)), var(--panel); border-color: var(--gold); }
#shotBtn canvas { width: 2.1em; height: 2.1em; pointer-events: none; }
#shotBtn span { white-space: nowrap; max-width: 10em; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
#shotc { position: absolute; right: 1.4%; bottom: calc(2.4% + 3.3em); width: 17.5em; max-width: 46%; max-height: calc(97.6% - 3.3em - 56px - 1em); box-sizing: border-box; display: none; padding: 0.55em 0.7em 0.65em; overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; font-size: 0.92em; line-height: 1.35; pointer-events: auto; }
#shotc.on { display: block; }
#shotc .sh { display: flex; align-items: center; gap: 0.5em; }
#shotc .sh > b { font-weight: 700; letter-spacing: 0.04em; color: var(--ink); white-space: nowrap; }
#shotc .sh em { flex: 1; min-width: 0; font-style: normal; font-size: 0.9em; color: var(--gold-hi); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#shotc .rst { flex: none; padding: 0.15em 0.55em; font: 600 0.85em/1.3 var(--sans); color: var(--ink); background: rgba(255, 255, 255, 0.06); border: 1px solid var(--line-hi); border-radius: 0; cursor: pointer; }
#shotc .rst:hover { border-color: var(--gold-line); }
#shotc .bw { position: relative; width: 12em; height: 12em; margin: 0.35em auto 0.15em; }
#shapeBall { position: absolute; left: 2.2em; top: 2.2em; width: 7.6em; height: 7.6em; cursor: grab; touch-action: none; }
#shapeArc { position: absolute; right: -0.2em; bottom: -0.1em; width: 2.6em; height: 2.6em; pointer-events: none; }
#shotc .bw img { position: absolute; width: 2.1em; height: 2.1em; border-radius: 0; pointer-events: none; }
#shotc .bw img.e-draw { left: 0; top: 4.95em; } #shotc .bw img.e-fade { right: 0; top: 4.95em; } #shotc .bw img.e-high { left: 4.95em; top: 0; } #shotc .bw img.e-low { left: 4.95em; bottom: 0; }
#shotc .bw img.lock { opacity: 0.3; filter: grayscale(1); }
/* #1344: a locked side's lock badge (on its tile's corner), the lock line under the ball (always there while anything is locked), and a refused drag's shake and flash */
#shotc .lkb { position: absolute; display: none; place-items: center; width: 1.2em; height: 1.2em; border-radius: 50%; background: var(--panel); border: 1px solid var(--warn); color: var(--warn); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5); pointer-events: none; z-index: 1; }
#shotc .lkb svg { display: block; width: 0.78em; height: 0.78em; }
#shotc .lkb.lk-draw { left: 1.45em; top: 4.4em; } #shotc .lkb.lk-fade { right: 1.45em; top: 4.4em; } #shotc .lkb.lk-high { left: 6.45em; top: -0.2em; } #shotc .lkb.lk-low { left: 6.45em; top: 9.45em; }
#shotc.no-draw .lk-draw, #shotc.no-fade .lk-fade, #shotc.no-high .lk-high, #shotc.no-low .lk-low { display: grid; }
#shotc .lock { margin-top: 0.25em; padding: 0.2em 0.45em; border-radius: 0; text-align: center; font-size: 0.85em; font-weight: 600; line-height: 1.35; color: var(--warn); background: rgba(251, 154, 75, 0.08); white-space: pre-line; cursor: help; }
#shotc .lock:empty { display: none; }
#shotc .lock.flash { animation: lockFlash 0.45s ease-out; }
#shapeBall.shake { animation: shapeShake 0.4s ease-in-out; }
@keyframes lockFlash { 0%, 55% { color: #fff; background: rgba(251, 154, 75, 0.38); } 100% { color: var(--warn); background: rgba(251, 154, 75, 0.08); } }
@keyframes shapeShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
#shotc .lab { text-align: center; font-size: 0.85em; color: var(--muted); }
#shotc .lim { margin-top: 0.2em; text-align: center; font-size: 0.85em; color: var(--ink); cursor: help; }
#shotc .lim:empty { display: none; }
#shotc details { margin-top: 0.45em; padding-top: 0.35em; border-top: 1px solid var(--line); }
#shotc summary { cursor: pointer; font-size: 0.88em; color: var(--muted); }
#shotc summary:hover { color: var(--ink); }
/* J8 (#1261), #1301: the painted tile on Go for it: pictures only, never in the way of a click */
#shotc b img { width: 2.6em; height: 2.6em; border-radius: 0; pointer-events: none; display: block; }
#shotc b { cursor: pointer; display: flex; align-items: center; gap: 0.6em; flex: 1; min-width: 0; padding: 0.25em 0.6em 0.25em 0.25em; border-radius: 0; border: 1px solid var(--line); color: #d9d3c4; font-weight: 600; }
#shotc b:hover { background: rgba(255, 255, 255, 0.06); }
#shotc b.sel { background: var(--gold-btn); color: #1b1406; font-weight: 700; }
#shotc b.lock { opacity: 0.6; cursor: not-allowed; }
#shotc b.boost.sel { background: linear-gradient(#ef6a4a, #c2410c); border-color: transparent; color: #fff; }
#shotc b.sel .lw { color: inherit; }
#shotc .hw { display: flex; align-items: flex-start; gap: 0.6em; margin-top: 0.4em; font-size: 0.85em; line-height: 1.35; color: #d9d3c4; }
#shotc .hw img { flex: none; width: 2.4em; height: 2.4em; border-radius: 0; pointer-events: none; }
#shotc .hw b.k { display: inline; padding: 0; border: 0; cursor: default; color: var(--gold-hi); font-weight: 700; }
#shotc .hw b.k:hover { background: none; }
#shotc .st { display: flex; flex-direction: column; gap: 0.4em; margin-top: 0.45em; }
#shotc .tx { display: flex; flex-direction: column; min-width: 0; } #shotc b.lock .nm { text-decoration: line-through; } #shotc .lw { font-style: normal; font-size: 0.8em; font-weight: 500; color: var(--warn); text-decoration: none; white-space: normal; }
#shotc i { font-style: normal; font-size: 0.85em; color: var(--muted); }

/* the clubs. The view's own play: CapitalEmpire's rail tabs, the one in hand ringed in gold on the gold wash. In the game (2026-11-15, the owner: "12 tiles always
   open"): one compact picker, the club in hand (its tile, name and carry from this lie) between previous and next arrows, the lie as a small chip beside it
   ("Rough 80%"), the aim's distance above; a click on the club opens his whole bag above it (a grid, never sideways), a click on one takes it */
#clubs { position: absolute; left: 1.4%; bottom: 2.4%; display: flex; flex-wrap: wrap; gap: 0.45em; max-width: 34%; }
#clubs .club { display: flex; align-items: center; gap: 0.4em; padding: 0.35em 0.7em 0.4em; border-radius: 0; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 1em; font-weight: 600; color: #d9d3c4; line-height: 1.3; }
#clubs.bag { flex-wrap: nowrap; align-items: center; max-width: calc(50% - 11.5em - 5.4em); }   /* (clear of the swing bar and the room kept beside it) */
#clubs .pick { display: flex; align-items: stretch; flex: none; pointer-events: auto; background: var(--panel); border: 1px solid var(--gold-line); border-radius: 0; box-shadow: var(--shadow); }
#clubs .cb { flex: none; width: 1.8em; padding: 0; border: 0; background: none; color: var(--gold-hi); font: 700 1.35em/1 var(--sans); cursor: pointer; border-radius: 0; }
#clubs .cb:hover { background: rgba(255, 255, 255, 0.07); }
#clubs .cur { display: flex; align-items: center; gap: 0.5em; padding: 0.3em 0.35em; cursor: pointer; min-width: 0; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
#clubs .cur:hover { background: rgba(255, 255, 255, 0.05); }
#clubs .cur .ci { flex: none; width: 2.3em; height: 2.3em; border-radius: 0; pointer-events: none; }
#clubs .cur span { display: flex; flex-direction: column; font-weight: 700; color: var(--gold-hi); line-height: 1.2; white-space: nowrap; pointer-events: none; }
#clubs .cur span i { font-style: normal; font-weight: 600; font-size: 0.85em; color: var(--ink); font-variant-numeric: tabular-nums; }
#clubs .lie { flex: none; pointer-events: auto; padding: 0.2em 0.65em; border-radius: 999px; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 0.9em; font-weight: 600; white-space: nowrap; color: var(--ink); }
#clubs .lie.cut { color: var(--warn); border-color: rgba(251, 154, 75, 0.5); }
#clubs .bagl { display: none; position: absolute; left: 0; bottom: calc(100% + 0.45em); grid-template-columns: repeat(3, max-content); gap: 0.3em; padding: 0.4em; max-height: 70cqh; overflow-y: auto; overflow-x: hidden; pointer-events: auto; background: var(--panel); border: 1px solid var(--line); border-radius: 0; box-shadow: var(--shadow); }
#clubs.open .bagl { display: grid; }
#clubs.open #aimd { display: none; }
#clubs .bagl .club { padding: 0.25em 0.55em 0.3em; font-size: 0.88em; cursor: pointer; box-shadow: none; }
#clubs .bagl .club:hover { border-color: var(--gold-line); }
#clubs .club.on { border-color: var(--gold); background: linear-gradient(var(--gold-wash), var(--gold-wash)), var(--panel); color: var(--gold-hi); box-shadow: var(--shadow), inset 0 0 12px rgba(245, 181, 46, 0.18); }
#clubs .club .ci { flex: none; width: 2.5em; height: 2.5em; margin: -0.2em 0; border-radius: 0; pointer-events: none; } #clubs.bag .club .ci { width: 2.2em; height: 2.2em; }   /* (J8: a club tab's painted tile, its club's: driver, wood, long iron, iron, wedge, putter) */
#clubs .club b { margin-right: 0.1em; color: var(--muted); font-weight: 700; }
#clubs .club.on b { color: var(--gold); }
#clubs .club i { display: block; font-style: normal; font-weight: 500; font-size: 0.85em; color: var(--muted); font-variant-numeric: tabular-nums; }
#clubs .club.cut i { color: var(--warn); }
/* J5f: the aim's distance ("Aim 128 m", written by the view's hostAimRead): a small panel above the club box, whatever height the box is (it is the box's own last child, the box
   is the positioned parent); hidden while empty */
#aimd { position: absolute; left: 0; bottom: calc(100% + 0.45em); padding: 0.3em 0.75em 0.35em; border-radius: 0; background: var(--panel); border: 1px solid var(--gold-line); box-shadow: var(--shadow); font-size: 1em; font-weight: 600; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
#aimd:empty { display: none; }
#aimd b { color: var(--gold-hi); font-weight: 700; }
#aimd i { margin-left: 0.5em; font-style: normal; font-size: 0.78em; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }

/* the bottom right corner (2026-11-15): the shot button, then "?" (what can be done now, on hover; a click opens the keys) and the Settings gear, small round buttons */
#corner { position: absolute; right: 1.4%; bottom: 2.4%; display: flex; align-items: center; gap: 0.45em; pointer-events: none; }
#corner > * { pointer-events: auto; }
#keys, #styleBtn { width: 2.4em; height: 2.4em; padding: 0; display: grid; place-items: center; border-radius: 50%; font: 700 1.1em/1 var(--sans); color: var(--ink); background: var(--panel); border: 1px solid var(--line-hi); box-shadow: var(--shadow); cursor: pointer; }
#keys:hover, #styleBtn:hover, #keys.on { border-color: var(--gold-line); color: var(--gold-hi); }
/* the help: CapitalEmpire's keycaps */
#help { position: absolute; right: 1.4%; bottom: calc(2.4% + 3.3em); box-sizing: border-box; max-width: min(36em, 58%); max-height: calc(97.6% - 3.3em - 2% - 1em); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; pointer-events: auto; padding: 0.7em 0.95em; font-size: 0.9em; line-height: 1.6; display: none; white-space: pre-wrap; color: var(--ink); }
/* (its scroll bar is the HUD's, with the practice panel's and the shot panel's: #1344, above) */
#help.on { display: block; }
#help b { display: inline-block; min-width: 7.5em; margin-right: 0.6em; font-weight: 700; color: var(--gold-hi); }
#help b.h { border: 0; background: none; padding: 0; font-size: 0.85em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }

/* the Settings gear and its menu: CapitalEmpire's flyout rows, section names in small caps; the menu opens above the gear, to its left */
#style { position: relative; text-align: left; }
#styleMenu { display: none; position: absolute; right: 0; bottom: calc(100% + 0.45em); padding: 0.55em; gap: 0.9em; text-align: left; white-space: nowrap; border-radius: 0; }
#styleMenu.on { display: flex; }
#styleMenu .grp { display: flex; flex-direction: column; gap: 2px; }
#styleMenu .dist { width: 12em; white-space: normal; } #styleMenu .dist input { width: 100%; margin: 0.4em 0 0.2em; accent-color: var(--gold); cursor: pointer; } #styleMenu .dist span { display: block; font-size: 0.95em; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); margin-left: 0.45em; } #styleMenu .dist label.simple { display: block; font-size: 0.9em; color: var(--ink); margin: 0.5em 0 0 0.35em; cursor: pointer; } #styleMenu .dist label.simple input { width: auto; margin: 0 0.4em 0 0; vertical-align: middle; }
#styleMenu .dist em { display: block; font-style: normal; font-size: 0.85em; line-height: 1.35; color: var(--muted); margin: 0.35em 0 0 0.45em; }
#styleMenu .grp > i { display: block; font-style: normal; font-size: 0.8em; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin: 0.1em 0 0.25em 0.45em; }
#styleMenu button { display: block; width: 100%; padding: 0.3em 0.55em; font-size: 0.95em; text-align: left; color: var(--ink); background: none; border: 1px solid transparent; border-radius: 0; cursor: pointer; }
#styleMenu button:hover { background: rgba(255, 255, 255, 0.07); } #styleMenu button.on { color: var(--gold-hi); background: var(--gold-wash); border-color: rgba(245, 181, 46, 0.45); }

/* Jump to ball (.btn) and Gimme (the gold button: the thing to take now), each with its key as a keycap */
#jump, #gimme { position: absolute; right: 1.4%; bottom: calc(2.4% + 3.3em); display: none; align-items: center; gap: 0.45em; padding: 0.45em 0.9em; font-size: 1em; font-weight: 600; color: var(--ink); background: var(--panel); border: 1px solid var(--line-hi); border-radius: 0; box-shadow: var(--shadow); cursor: pointer; pointer-events: auto; }
#jump.on, #gimme.on { display: inline-flex; } #jump:hover { border-color: var(--gold-line); }
#jump img, #gimme img { width: 2.1em; height: 2.1em; margin: -0.35em 0; border-radius: 0; pointer-events: none; }   /* (J8: their painted tiles; a click on one is a click on the button) */
#jump b, #gimme b { min-width: 1.4em; padding: 0 0.3em; border-radius: 0; border: 1px solid var(--line-hi); background: rgba(255, 255, 255, 0.06); font-size: 0.85em; line-height: 1.45; color: var(--ink); }
#jump.on ~ #gimme { bottom: calc(2.4% + 6.3em); }
#gimme { background: var(--gold-btn); border-color: transparent; color: #1b1406; font-weight: 700; box-shadow: 0 2px 10px rgba(245, 181, 46, 0.35), var(--shadow); }
#gimme:hover { filter: brightness(1.06); } #gimme b { border-color: rgba(27, 20, 6, 0.35); background: rgba(27, 20, 6, 0.1); color: #1b1406; }

/* the message line: the serif on a glass pill, only while there is something to say */
#msg { position: absolute; left: 50%; top: 27%; transform: translateX(-50%); max-width: 84%; width: max-content; padding: 0.35em 1.1em 0.4em; text-align: center; white-space: normal;
  font: 700 1.45em/1.3 var(--serif); color: var(--ink); background: var(--panel); border: 1px solid var(--gold-line); border-radius: 999px; box-shadow: var(--shadow); }
#msg:empty { display: none; }

/* J5b: the loading cover in host mode: a CapitalEmpire card on the dimmed picture until the course's pictures are in (parts/09-hud.md coverShow) */
#cover { position: absolute; inset: 0; display: none; place-items: center; z-index: 5; background: radial-gradient(ellipse at center, rgba(20, 21, 25, 0.92), rgba(8, 9, 12, 0.99)); font-size: clamp(11px, 1.016cqw, 15px); }
#cover.on { display: grid; }
body:has(#cover.on) > .panel { visibility: hidden; }   /* (J5c: the panels outside the picture, the practice drills, the leaderboard, the match, wait behind the cover too) */
#cover .cv { min-width: 19em; padding: 1.1em 1.4em 1.2em; text-align: center; background: var(--panel); border: 1px solid var(--line); border-radius: 0; box-shadow: var(--shadow); color: var(--ink); }
#cover i { display: block; font-style: normal; font-size: 0.8em; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); }
#cover b { display: block; margin-top: 0.25em; font: 700 1.5em/1.25 var(--serif); color: var(--gold-hi); }
#cover s { display: block; height: 0.45em; margin: 0.9em 0 0.55em; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
#cover u { display: block; width: 0; height: 100%; border-radius: 999px; background: var(--gold-btn); transition: width 0.3s; }
#cover em { display: block; font-style: normal; font-size: 0.92em; color: var(--muted); }
````
