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
<title>Cinderlinks</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="stage">
  <canvas id="view"></canvas>
  <canvas id="over"></canvas>
  <div id="hud">
    <div id="card"></div>
    <div id="wind"><div id="windArrow">&#10148;</div><div id="windTxt">wind</div></div>
    <canvas id="mini" width="150" height="150"></canvas>
    <div id="power"><div class="track"><i id="powerBar"></i></div><div id="powerTxt"></div></div>
    <div id="clubs"></div>
    <div id="keys"></div>
    <div id="style"><button id="styleBtn" type="button">Settings</button><div id="styleMenu"></div></div>
    <button id="jump" type="button">Jump to ball <b>J</b></button>
    <button id="gimme" type="button">Gimme <b>Y</b></button>
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
Check: body.host #mini
Check: #cover.on

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
.panel, #card, #keys, #help, #wind, #shotc, #styleMenu { background: var(--panel); border: 1px solid var(--line); border-radius: 1.1em; box-shadow: var(--shadow); color: var(--ink); }
body > .panel { border-radius: 0.9em; }
#prac .ph { font-size: 0.85em; letter-spacing: 0.12em; color: var(--gold); margin-bottom: 0.35em; } #prac .pd { padding: 0.3em 0.45em; margin: 0.2em 0; border: 1px solid var(--line); border-radius: 0.6em; cursor: pointer; }
#prac .pd.on { border-color: var(--gold-line); background: var(--gold-wash); } #prac .pd.off { opacity: 0.45; cursor: default; } #prac .pd.done .pt i { color: var(--good); } #prac .pd:hover:not(.off) { border-color: var(--line-hi); }
#prac .pt { display: flex; justify-content: space-between; gap: 0.5em; } #prac .pt i { font-style: normal; color: var(--gold-hi); } #prac .pg { color: var(--ink); font-size: 0.92em; } #prac .pr { color: var(--muted); font-size: 0.85em; }
#prac .pn { margin-top: 0.45em; color: var(--gold-hi); } #prac .pf { margin-top: 0.25em; color: var(--muted); font-size: 0.88em; }
.pflag { padding: 0.1em 0.45em; border-radius: 0.5em; background: var(--panel); border: 1px solid var(--gold-line); color: var(--ink); font: 600 clamp(10px, 0.85vw, 13px) system-ui, sans-serif; white-space: nowrap; }
body > .panel > b:first-child { font-size: 0.85em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }

/* the card: the hole in the serif, gold; its facts as CapitalEmpire's stat lines (muted name, bold cream figure) */
#card { position: absolute; left: 1.4%; top: 2%; padding: 0.6em 0.85em 0.65em; min-width: 13em; pointer-events: auto; cursor: pointer; }
#card:hover { border-color: var(--gold-line); }
#hud.min #card .row, #hud.min #card .course, #hud.min #card .credit, #hud.min #mini, #hud.min #wind, #hud.min #keys, #hud.min #clubs .club:not(.on) { display: none; }
#hud.min #card { min-width: 0; padding: 0.4em 0.85em 0.45em; border-radius: 999px; }
#hud.min #card .hole { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; font-size: 1.15em; gap: 0.9em; }
#card .hole { display: flex; justify-content: space-between; align-items: baseline; gap: 1em; margin-bottom: 0.35em; padding-bottom: 0.3em; border-bottom: 1px solid var(--line);
  font: 700 1.3em/1.2 var(--serif); color: var(--gold-hi); }
#card .hole span { font: 600 0.62em var(--sans); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
#card .course { font-size: 0.92em; font-weight: 700; color: var(--ink); margin-bottom: 0.15em; max-width: 17em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#card .row { display: flex; justify-content: space-between; gap: 1.4em; font-size: 0.95em; }
#card .row span { color: var(--muted); }
#card .row b { color: var(--ink); font-variant-numeric: tabular-nums; text-align: right; }
#card .credit { font-size: 0.78em; line-height: 1.3; color: var(--muted); margin-top: 0.45em; max-width: 15em; white-space: normal; }

/* the wind: a small square tile; gold while a gust is on the golfer */
#wind { position: absolute; right: calc(1.4% + 12.1em); top: 2%; width: 3.6em; padding: 0.25em 0 0.3em; text-align: center; color: var(--muted); border-radius: 0.9em; }
#windTxt { font-size: 0.8em; }
#windArrow { font-size: 1.6em; line-height: 1.25; color: var(--ink); transition: transform 0.25s; }
#wind.gust #windArrow { color: var(--gold-hi); }
#wind.gust { border-color: var(--gold); background: linear-gradient(var(--gold-wash), var(--gold-wash)), var(--panel); }
/* (inside CapitalEmpire its own buttons, the ghost and share chips and the close button, run along the top right: the map and the wind sit below them) */
body.host #mini, body.host #wind { top: 56px; }
#mini { position: absolute; right: 1.4%; top: 2%; width: 11.5em; height: 11.5em; image-rendering: pixelated; border: 1px solid var(--line-hi); border-radius: 0.9em; box-shadow: var(--shadow); }

/* the power bar (the view's own play) and the swing button (in CapitalEmpire): a rounded track, the fill from green to gold, the gold aim mark and the white hole mark */
#power { position: absolute; left: 36%; right: 36%; bottom: 8%; opacity: 0; transition: opacity 0.15s; text-align: center; }
#power.on { opacity: 1; }
#swingBtn { position: absolute; left: 50%; bottom: 2.2%; transform: translateX(-50%); width: 23em; height: 3.6em; display: none; pointer-events: auto; cursor: pointer; touch-action: none; user-select: none; overflow: hidden;
  background: var(--panel); border: 1px solid var(--gold-line); border-radius: 1em; box-shadow: var(--shadow); color: var(--ink); }
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
#powerTxt { display: inline-block; margin-top: 0.4em; padding: 0.15em 0.7em; border-radius: 999px; background: var(--panel); font-size: 0.95em; font-weight: 700; color: var(--ink); }
#powerTxt:empty { display: none; }
.track { position: relative; height: 1.1em; background: var(--panel); border: 1px solid var(--gold-line); border-radius: 999px; box-shadow: var(--shadow); overflow: hidden; }
.track i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, var(--good), var(--gold-hi) 72%, #e8573c); }
.track b { display: none; position: absolute; top: 0; bottom: 0; }
#power.meter .track b { display: block; }
#power.meter .track i { background: linear-gradient(90deg, rgba(116, 227, 164, 0.6), var(--good) 14%, var(--gold-hi) 80%, #e8573c); }
#power .track b.sweet { background: rgba(116, 227, 164, 0.35); border-left: 1px solid #b8ffc8; border-right: 1px solid #b8ffc8; }
#power .track b.top { width: 2px; margin-left: -1px; background: #fff; }

/* the shot panel: CapitalEmpire's segmented choices (.seg): a dark well, the picked one in the gold button's gradient */
#shotc { position: absolute; right: 1.4%; bottom: 13%; display: none; padding: 0.55em 0.65em; font-size: 0.92em; line-height: 1.4; pointer-events: auto; }   /* (it takes its own clicks: under #hud's pointer-events none they fell through and aimed the shot, the owner 2026-11-13) */
#shotc.on { display: block; }
#shotc .row { display: flex; align-items: center; gap: 0.2em; margin: 0.2em 0; padding: 0.15em; border-radius: 0.7em; background: rgba(0, 0, 0, 0.25); }
#shotc .row span { width: 3.6em; padding-left: 0.35em; font-size: 0.9em; font-weight: 700; color: var(--muted); }
#shotc b { cursor: pointer; padding: 0.2em 0.6em; border-radius: 0.55em; border: 1px solid transparent; color: #d9d3c4; font-weight: 500; }
#shotc b:hover { background: rgba(255, 255, 255, 0.06); }
#shotc b.sel { background: var(--gold-btn); color: #1b1406; font-weight: 700; }
#shotc b.lock { opacity: 0.45; cursor: not-allowed; text-decoration: line-through; }
#shotc b.boost { border-color: var(--line); }
#shotc b.boost.sel { background: linear-gradient(#ef6a4a, #c2410c); border-color: transparent; color: #fff; }
#shotc canvas { width: 3.1em; height: 3.1em; cursor: crosshair; image-rendering: auto; }
#shotc i { font-style: normal; font-size: 0.9em; color: var(--muted); padding: 0 0.3em; }
#pickTxt { margin-top: 0.3em; padding-left: 0.2em; color: var(--gold-hi); }

/* the clubs: CapitalEmpire's rail tabs, the one in hand ringed in gold on the gold wash */
#clubs { position: absolute; left: 1.4%; bottom: 2.4%; display: flex; flex-wrap: wrap; gap: 0.45em; max-width: 64%; }
#clubs.bag { gap: 0.3em; max-width: 34%; }   /* (his whole bag wraps in the left third: the power bar stays clear) */
#clubs .club { padding: 0.35em 0.7em 0.4em; border-radius: 0.8em; background: var(--panel); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 1em; font-weight: 600; color: #d9d3c4; line-height: 1.3; }
#clubs.bag .club { padding: 0.25em 0.55em 0.3em; font-size: 0.88em; }
#clubs .club.on { border-color: var(--gold); background: linear-gradient(var(--gold-wash), var(--gold-wash)), var(--panel); color: var(--gold-hi); box-shadow: var(--shadow), inset 0 0 12px rgba(245, 181, 46, 0.18); }
#clubs .club b { margin-right: 0.1em; color: var(--muted); font-weight: 700; }
#clubs .club.on b { color: var(--gold); }
#clubs .club i { display: block; font-style: normal; font-weight: 500; font-size: 0.85em; color: var(--muted); font-variant-numeric: tabular-nums; }
#clubs .club.cut i { color: var(--warn); }

/* the key hints and the help: CapitalEmpire's keycaps */
#keys { position: absolute; right: 1.4%; bottom: 2.4%; padding: 0.35em 0.75em; border-radius: 999px; font-size: 0.9em; color: var(--muted); }
#keys b { display: inline-block; min-width: 1.4em; padding: 0 0.3em; border-radius: 0.35em; border: 1px solid var(--line-hi); background: rgba(255, 255, 255, 0.06); font-weight: 700; line-height: 1.45; text-align: center; color: var(--ink); }
#help { position: absolute; right: 1.4%; bottom: calc(2.4% + 2.9em); max-width: 58%; max-height: calc(100% - 2.4% - 2.9em - 2% - 5em); overflow-y: auto; overflow-x: hidden; overscroll-behavior: contain; pointer-events: auto; padding: 0.7em 0.95em; font-size: 0.9em; line-height: 1.6; display: none; white-space: pre-wrap; color: var(--ink); }
/* CapitalEmpire's thin scrollbar (src/index.css, T205): a light thumb, gold under the pointer, no arrows; never a sideways one */
#help::-webkit-scrollbar { width: 8px; background: transparent; } #help::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
#help::-webkit-scrollbar-thumb { min-height: 28px; border: 2px solid transparent; border-radius: 999px; background: rgba(239, 233, 218, 0.26) padding-box; } #help::-webkit-scrollbar-thumb:hover { background: rgba(245, 181, 46, 0.85) padding-box; }
#help.on { display: block; }
#help b { display: inline-block; min-width: 7.5em; margin-right: 0.6em; font-weight: 700; color: var(--gold-hi); }
#help b.h { border: 0; background: none; padding: 0; font-size: 0.85em; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold); }

/* the Settings button and its menu: CapitalEmpire's .btn and its flyout rows, section names in small caps */
#style { position: absolute; top: 2%; left: 50%; transform: translateX(-50%); pointer-events: auto; text-align: center; }
#styleBtn { display: inline-flex; align-items: center; gap: 0.4em; padding: 0.4em 0.9em; font-size: 1em; font-weight: 600; color: var(--ink); background: var(--panel); border: 1px solid var(--line-hi); border-radius: 0.8em; box-shadow: var(--shadow); cursor: pointer; }
#styleBtn:hover { border-color: var(--gold-line); } #styleBtn b { color: var(--gold); margin-left: 0; font-size: 0.85em; }
#styleMenu { display: none; margin-top: 0.4em; padding: 0.55em; gap: 0.9em; text-align: left; white-space: nowrap; border-radius: 1em; }
#styleMenu.on { display: flex; }
#styleMenu .grp { display: flex; flex-direction: column; gap: 2px; }
#styleMenu .dist { width: 12em; white-space: normal; } #styleMenu .dist input { width: 100%; margin: 0.4em 0 0.2em; accent-color: var(--gold); cursor: pointer; } #styleMenu .dist span { display: block; font-size: 0.95em; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink); margin-left: 0.45em; } #styleMenu .dist label.simple { display: block; font-size: 0.9em; color: var(--ink); margin: 0.5em 0 0 0.35em; cursor: pointer; } #styleMenu .dist label.simple input { width: auto; margin: 0 0.4em 0 0; vertical-align: middle; }
#styleMenu .dist em { display: block; font-style: normal; font-size: 0.85em; line-height: 1.35; color: var(--muted); margin: 0.35em 0 0 0.45em; }
#styleMenu .grp > i { display: block; font-style: normal; font-size: 0.8em; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); margin: 0.1em 0 0.25em 0.45em; }
#styleMenu button { display: block; width: 100%; padding: 0.3em 0.55em; font-size: 0.95em; text-align: left; color: var(--ink); background: none; border: 1px solid transparent; border-radius: 0.6em; cursor: pointer; }
#styleMenu button:hover { background: rgba(255, 255, 255, 0.07); } #styleMenu button.on { color: var(--gold-hi); background: var(--gold-wash); border-color: rgba(245, 181, 46, 0.45); }

/* Jump to ball (.btn) and Gimme (the gold button: the thing to take now), each with its key as a keycap */
#jump, #gimme { position: absolute; right: 1.4%; bottom: 8%; display: none; align-items: center; gap: 0.45em; padding: 0.45em 0.9em; font-size: 1em; font-weight: 600; color: var(--ink); background: var(--panel); border: 1px solid var(--line-hi); border-radius: 0.8em; box-shadow: var(--shadow); cursor: pointer; pointer-events: auto; }
#jump.on, #gimme.on { display: inline-flex; } #jump:hover { border-color: var(--gold-line); }
#jump b, #gimme b { min-width: 1.4em; padding: 0 0.3em; border-radius: 0.35em; border: 1px solid var(--line-hi); background: rgba(255, 255, 255, 0.06); font-size: 0.85em; line-height: 1.45; color: var(--ink); }
#gimme { bottom: calc(8% + 2.9em); background: var(--gold-btn); border-color: transparent; color: #1b1406; font-weight: 700; box-shadow: 0 2px 10px rgba(245, 181, 46, 0.35), var(--shadow); }
#gimme:hover { filter: brightness(1.06); } #gimme b { border-color: rgba(27, 20, 6, 0.35); background: rgba(27, 20, 6, 0.1); color: #1b1406; }

/* the message line: the serif on a glass pill, only while there is something to say */
#msg { position: absolute; left: 50%; top: 27%; transform: translateX(-50%); max-width: 84%; width: max-content; padding: 0.35em 1.1em 0.4em; text-align: center; white-space: normal;
  font: 700 1.45em/1.3 var(--serif); color: var(--ink); background: var(--panel); border: 1px solid var(--gold-line); border-radius: 999px; box-shadow: var(--shadow); }
#msg:empty { display: none; }

/* J5b: the loading cover in host mode: a CapitalEmpire card on the dimmed picture until the course's pictures are in (parts/09-hud.md coverShow) */
#cover { position: absolute; inset: 0; display: none; place-items: center; z-index: 5; background: radial-gradient(ellipse at center, rgba(20, 21, 25, 0.92), rgba(8, 9, 12, 0.99)); font-size: clamp(11px, 1.016cqw, 15px); }
#cover.on { display: grid; }
body:has(#cover.on) > .panel { visibility: hidden; }   /* (J5c: the panels outside the picture, the practice drills, the leaderboard, the match, wait behind the cover too) */
#cover .cv { min-width: 19em; padding: 1.1em 1.4em 1.2em; text-align: center; background: var(--panel); border: 1px solid var(--line); border-radius: 1.1em; box-shadow: var(--shadow); color: var(--ink); }
#cover i { display: block; font-style: normal; font-size: 0.8em; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--gold); }
#cover b { display: block; margin-top: 0.25em; font: 700 1.5em/1.25 var(--serif); color: var(--gold-hi); }
#cover s { display: block; height: 0.45em; margin: 0.9em 0 0.55em; border-radius: 999px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
#cover u { display: block; width: 0; height: 100%; border-radius: 999px; background: var(--gold-btn); transition: width 0.3s; }
#cover em { display: block; font-style: normal; font-size: 0.92em; color: var(--muted); }
````
