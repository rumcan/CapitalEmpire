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
R: The HUD is a golf scoreboard: dark green panels with a gold line and cream letters.
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
    <div id="style"><button id="styleBtn" type="button">Parkland</button><div id="styleMenu"></div></div>
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
The page keeps Cinderdeep's frame: black surround, pixelated canvas, capital letters with a hard shadow.
R: The canvas is scaled with no smoothing and keeps 16:9.
File: style.css
Check: image-rendering: pixelated

````css file=style.css
html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
body { display: flex; align-items: center; justify-content: center; color: #eadfcb; user-select: none;
  font: bold 12px/1.25 "Lucida Console", Consolas, "Courier New", monospace; letter-spacing: 1px; }
#stage { position: relative; width: min(100vw, calc(100vh * 16 / 9)); aspect-ratio: 16 / 9; }
#view { display: block; width: 100%; height: 100%; image-rendering: pixelated; cursor: crosshair; }
#over { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; }
#hud { position: absolute; inset: 0; pointer-events: none; text-transform: uppercase; }
.panel, #card, #clubs .club, #keys, #help, #wind { background: rgba(12, 34, 24, 0.78); border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.55); color: #f4efdc; }
#card { position: absolute; left: 1.4%; top: 2%; padding: 7px 10px 8px; min-width: 150px; font-size: 11px; line-height: 1.55; }
#card { pointer-events: auto; cursor: pointer; }
#hud.min #card .row, #hud.min #card .course, #hud.min #card .credit, #hud.min #mini, #hud.min #wind, #hud.min #keys, #hud.min #clubs .club:not(.on) { display: none; }
#hud.min #card { min-width: 0; padding: 4px 9px 5px; opacity: 0.88; }
#hud.min #card .hole { border-bottom: 0; margin-bottom: 0; padding-bottom: 0; font-size: 12px; gap: 12px; }
#card .hole { font-size: 15px; color: #f2c94c; border-bottom: 1px solid rgba(242, 201, 76, 0.45); margin-bottom: 4px; padding-bottom: 3px; display: flex; justify-content: space-between; align-items: baseline; }
#card .hole span { font-size: 11px; color: #f4efdc; }
#card .row { display: flex; justify-content: space-between; gap: 18px; }
#card .course { font-size: 11px; color: #f4efdc; letter-spacing: 0.04em; margin-bottom: 2px; }
#card .credit { font-size: 8px; line-height: 1.3; color: rgba(244, 239, 220, 0.7); margin-top: 5px; max-width: 170px; white-space: normal; }
#card .row span { color: #a9c9b1; }
#card .row b { color: #ffffff; }
#wind { position: absolute; right: calc(1.4% + 162px); top: 2%; width: 54px; padding: 4px 0 3px; text-align: center; font-size: 9px; color: #a9c9b1; }
#windArrow { font-size: 22px; line-height: 26px; color: #f4efdc; transition: transform 0.25s; }
#wind.gust #windArrow { color: #f2c94c; }
#wind.gust { box-shadow: 0 0 0 1px #f2c94c; }
#mini { position: absolute; right: 1.4%; top: 2%; width: 150px; height: 150px; image-rendering: pixelated; border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.55); opacity: 0.95; }
#power { position: absolute; left: 36%; right: 36%; bottom: 8%; opacity: 0; transition: opacity 0.15s; text-align: center; }
#power.on { opacity: 1; }
#powerTxt { margin-top: 4px; font-size: 11px; color: #f4efdc; text-shadow: 2px 2px 0 #000; }
.track { height: 13px; background: #0c2218; border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.55); position: relative; }
.track i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #58c070, #f2c94c 72%, #e8573c); }
#clubs { position: absolute; left: 1.4%; bottom: 2.4%; display: flex; gap: 6px; }
#clubs .club { padding: 4px 9px 5px; font-size: 11px; color: #a9c9b1; line-height: 1.35; }
#clubs .club.on { box-shadow: 0 0 0 1px #f2c94c, 0 0 0 3px rgba(242, 201, 76, 0.25); color: #ffffff; background: rgba(22, 60, 40, 0.9); }
#clubs .club b { color: #f2c94c; }
#clubs .club i { display: block; font-style: normal; font-size: 9px; color: #a9c9b1; }
#keys { position: absolute; right: 1.4%; bottom: 2.4%; padding: 4px 9px; font-size: 10px; color: #a9c9b1; }
#style { position: absolute; top: 2%; left: 50%; transform: translateX(-50%); pointer-events: auto; text-align: center; }
#styleBtn { padding: 5px 12px; font: inherit; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #f4efdc; background: rgba(12, 34, 24, 0.86); border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.7); cursor: pointer; }
#styleBtn:hover { background: rgba(28, 66, 44, 0.95); } #styleBtn b { color: #f2c94c; margin-left: 6px; }
#styleMenu { display: none; margin-top: 5px; padding: 7px 8px 6px; gap: 14px; text-align: left; white-space: nowrap; background: rgba(12, 34, 24, 0.92); border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.55); }
#styleMenu.on { display: flex; }
#styleMenu .grp > i { display: block; font-style: normal; font-size: 9px; color: #f2c94c; margin: 0 0 3px 8px; }
#styleMenu button { display: block; width: 100%; padding: 3px 8px; font: inherit; font-size: 11px; text-transform: uppercase; text-align: left; color: #f4efdc; background: none; border: 0; cursor: pointer; }
#styleMenu button:hover { background: rgba(28, 66, 44, 0.95); } #styleMenu button.on { color: #f2c94c; }
#jump, #gimme { position: absolute; right: 1.4%; bottom: 8%; padding: 6px 12px; font: inherit; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #f4efdc; background: rgba(12, 34, 24, 0.86); border: 2px solid #0a1a12; box-shadow: 0 0 0 1px rgba(242, 201, 76, 0.7); cursor: pointer; pointer-events: auto; display: none; }
#jump.on, #gimme.on { display: block; } #jump:hover, #gimme:hover { background: rgba(28, 66, 44, 0.95); } #jump b, #gimme b { color: #f2c94c; margin-left: 4px; }
#gimme { bottom: calc(8% + 38px); box-shadow: 0 0 0 1px #f2c94c, 0 0 0 3px rgba(242, 201, 76, 0.25); }
#keys b { color: #f2c94c; }
#help { position: absolute; right: 1.4%; bottom: calc(2.4% + 34px); padding: 8px 12px; font-size: 10px; line-height: 1.7; display: none; white-space: pre; color: #f4efdc; }
#help.on { display: block; }
#help b { color: #f2c94c; display: inline-block; min-width: 96px; }
#msg { position: absolute; left: 8%; right: 8%; top: 27%; text-align: center; font-size: 16px; color: #fff3c4; text-shadow: 2px 2px 0 #000, 0 0 12px rgba(0, 0, 0, 0.6); }
````
