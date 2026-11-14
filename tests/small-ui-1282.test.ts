// #1282 and #1275 (the owner, 2026-11-14): four small UI changes. (1) The map's cursor is a pointer over anything a click opens a window for, the arrow elsewhere,
// and the tools keep their own (ui/map-cursor.ts; the engine's pick is Game.clickOpensAt, checked in the real game by scripts/dev/small-ui-shots.mjs).
// (2) The gold button called "Build on your property" is "Texture Painter" wherever it appears. (3) The speed bar collapses to pause, the speed now and a
// chevron (ui/speed-bar.ts): collapsed by default, remembered, jam and normal alike. (4) The texts that said Facilities > Practice say where it is now: Course >
// Facilities > Practice (PR #1288 moved Facilities into the Course menu), and the jam, which has no Facilities tile, says Build > Practice. Pure, Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { mapCursor, type MapCursorFacts } from '../src/ui/map-cursor';
import { SPEED_BAR_KEY, loadSpeedBarOpen, saveSpeedBarOpen, speedBarView, type SpeedBarFacts } from '../src/ui/speed-bar';
import { SPEEDS, WATCH_SPEED } from '../src/game/golf/watch';
import { practicePath } from '../src/game/golf/menu-path';
import { PRACTICE_BUY_HINT, PRACTICE_HINTS, RAMP_TOAST, RANGE_GUIDE } from '../src/game/ext/progressive-ui';
import { PRACTICE_BRUSH_WHY } from '../src/game/paint-tool';
import { TEXTURE_PAINTER } from '../src/ui/flyout-menu';

/** every .ts, .tsx and .css file under a folder (not the assets) */
function sources(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f), st = statSync(p);
    if (st.isDirectory()) { if (f !== 'assets' && f !== 'node_modules') sources(p, out); } else if (/\.(ts|tsx|css)$/.test(f)) out.push(p);
  }
  return out;
}
/** the code of a source line: its // comment and a leading comment line's text taken off (the way a text is read, not what a note says) */
const codeOf = (line: string): string => (/^\s*(\/\/|\/\*|\*)/.test(line) ? '' : line.replace(/\s\/\/.*$/, '').replace(/\/\*.*?\*\//g, ''));

// ---------------------------------------------------------------- the cursor
const base: MapCursorFacts = { verb: null, teePlace: null, tool: 'select', opens: false, hasYou: true, paintOn: false, paintCursor: '' };

test('#1282: with Select in hand the cursor is a pointer over what a click opens, the arrow elsewhere (the pan hand while no character stands in the world)', () => {
  assert.equal(mapCursor({ ...base, opens: true }), 'pointer', 'over a building, the range, a hole, a person: a pointer');
  assert.equal(mapCursor({ ...base, opens: true, hasYou: false }), 'pointer', 'with or without a character');
  assert.equal(mapCursor(base), 'default', 'over open ground: the default arrow');
  assert.equal(mapCursor({ ...base, hasYou: false }), 'grab', 'no character yet (the town game): a drag pans, the hand says so');
});
test('#1282: the tools keep their own cursors, whatever the pick says: a build and the bulldozer the crosshair, a paint tool its brush, a tee in hand copy or grabbing, Walk its verbs', () => {
  for (const tool of ['road', 'business', 'bulldoze', 'junction', 'park', 'course', 'practice', 'props']) assert.equal(mapCursor({ ...base, tool, opens: true }), 'crosshair', tool);
  assert.equal(mapCursor({ ...base, tool: 'paint', paintOn: true, paintCursor: 'url(brush.png) 8 8, crosshair', opens: true }), 'url(brush.png) 8 8, crosshair', 'the paint brush');
  assert.equal(mapCursor({ ...base, tool: 'course', paintOn: true, paintCursor: 'cell', opens: false }), 'cell');
  assert.equal(mapCursor({ ...base, teePlace: { drag: true }, opens: true }), 'grabbing');
  assert.equal(mapCursor({ ...base, teePlace: { drag: false }, opens: true }), 'copy', 'a tee in hand over a building: still copy');
  assert.equal(mapCursor({ ...base, verb: 'url(talk.svg) 4 4, pointer' }), 'url(talk.svg) 4 4, pointer', 'Walk: the speech bubble over a person, as before');
  assert.equal(mapCursor({ ...base, verb: 'not-allowed' }), 'not-allowed');
  assert.equal(mapCursor({ ...base, verb: 'url(walk.svg) 12 20, pointer', opens: true }), 'pointer', 'Walk: what opens at once (the badge of a hole) is a pointer, not footprints');
});

// ---------------------------------------------------------------- the name
test('#1282: the Texture Painter: its name is one constant, and "Build on your property" is nowhere left in the source, the packages or the jam brief', () => {
  assert.equal(TEXTURE_PAINTER, 'Texture Painter');
  const files = [...sources('src'), ...sources('packages'), 'docs/JAM.md'].filter(f => !f.includes('node_modules'));
  const left = files.filter(f => /Build on your property/i.test(readFileSync(f, 'utf8')));
  assert.deepEqual(left, [], 'the old label is gone');
  // the places that draw it say the constant, so the button, the tile, the Range's row and the panel's own heading can never differ
  for (const f of ['src/ui/flyout-menu.ts', 'src/ui/course/PracticePanel.tsx', 'src/ui/course/CoursePanel.tsx']) assert.match(readFileSync(f, 'utf8'), /TEXTURE_PAINTER/, f);
  assert.match(readFileSync('src/ui/course/PracticePanel.tsx', 'utf8'), /<span className="min-w-0">\{TEXTURE_PAINTER\}<\/span>/, 'the Practice panel\'s gold button');
  assert.match(readFileSync('src/ui/course/CoursePanel.tsx', 'utf8'), /<ToolHead icon="terrain" title=\{TEXTURE_PAINTER\}/, 'the panel it opens is headed the same');
});

// ---------------------------------------------------------------- the way to the practice facilities
test('#1282: the way to the practice facilities: Course > Facilities > Practice in the game, Build > Practice in the jam (it has no Facilities tile), the separator kept', () => {
  assert.equal(practicePath(), 'Course ▸ Facilities ▸ Practice', 'this build (the tests run as the normal game)');
  assert.equal(practicePath('›'), 'Course › Facilities › Practice');
  assert.equal(practicePath('▸', true), 'Build ▸ Practice');
  assert.equal(practicePath('›', true), 'Build › Practice');
});
test('#1282: the guide, the hints and the toasts name Course > Facilities > Practice, and the Show me anchor of the Facilities tile falls back to the Course button while the flyout is shut', () => {
  const guide = RANGE_GUIDE.find(s => s.id === 'guide-range-practice')!;
  assert.match(guide.body, /Then Course › Facilities › Practice › Putting green on it\./);
  assert.match(PRACTICE_HINTS[0]!.body, /^Course ▸ Facilities ▸ Practice ▸ Putting green:/);
  assert.match(PRACTICE_HINTS[1]!.body, /^Course ▸ Facilities ▸ Practice ▸ Chipping green and bunker:/);
  assert.match(PRACTICE_BUY_HINT.body, /\(Course ▸ Facilities ▸ Practice\)/);
  assert.match(RAMP_TOAST[1]!, /\(Course ▸ Facilities ▸ Practice\)/);
  assert.equal(PRACTICE_BRUSH_WHY, 'Practice greens are built with Course ▸ Facilities ▸ Practice');
  assert.match(readFileSync('src/ui/GuidePulse.tsx', 'utf8'), /'rail-facilities': \['rail-course'\]/, 'a ring on Course until the Facilities tile is on screen');
  assert.match(readFileSync('src/ui/flyout-menu.ts', 'utf8'), /guide: 'rail-facilities'/, 'the tile carries the anchor');
});
test('#1282: no text says "Facilities > Practice" without Course before it (the notes in the code may)', () => {
  const bad: string[] = [];
  for (const f of sources('src')) readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (/(?<!Course [▸›] )Facilities [▸›] Practice/.test(codeOf(line))) bad.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`); });
  assert.deepEqual(bad, []);
});

// ---------------------------------------------------------------- the speed bar
const bar = (o: Partial<SpeedBarFacts> = {}): SpeedBarFacts => ({ open: false, speeds: SPEEDS, speed: 1, resume: 1, paceLock: false, jam: false, golf: true, watching: null, skipNight: false, ...o });

test('#1275: collapsed (the default): no speed chips, the speed now, a chevron; the keys are the engine\'s so the bar has no part in them', () => {
  const v = speedBarView(bar());
  assert.equal(v.open, false); assert.deepEqual(v.speeds, [], 'no speed chips');
  assert.deepEqual(v.current && { k: v.current.k, label: v.current.label, paused: v.current.paused }, { k: 1, label: '1', paused: false });
  assert.equal(v.watch, null, 'no Watch golf'); assert.equal(v.skipRush, false, 'no skip to the rush hour');
  assert.equal(v.toggle.label, 'Show every speed');
  assert.equal(speedBarView(bar({ speed: WATCH_SPEED, resume: WATCH_SPEED })).current!.label, '1/40', 'the slow speeds read as the open bar writes them');
  assert.equal(speedBarView(bar({ speed: 20, resume: 20 })).current!.label, '20');
  // the keys (, . and Space) are the engine's: the view is a function of the speed alone, so a key that changes the speed changes the chip, collapsed or open
  for (const k of SPEEDS) assert.equal(speedBarView(bar({ speed: k, resume: k })).current!.k, k);
  assert.match(readFileSync('src/App.tsx', 'utf8'), /resume: game\.resumeSpeed/, 'App reads the engine\'s own speed, running or resumed');
});
test('#1275: paused, the chip names the speed Space resumes at (not a speed it is not running)', () => {
  const v = speedBarView(bar({ speed: 0, resume: 4 }));
  assert.equal(v.current!.k, 4); assert.equal(v.current!.label, '4'); assert.equal(v.current!.paused, true);
  assert.match(v.current!.tip, /Paused: Space resumes at 4×/);
  assert.equal(speedBarView(bar({ speed: 0, resume: 0 })).current!.k, 1, 'a game that never ran falls back to 1x');
});
test('#1275: open: every speed with the running one on, Watch golf and skip, as before', () => {
  const v = speedBarView(bar({ open: true, speed: 4 }));
  assert.equal(v.current, null); assert.deepEqual(v.speeds.map(s => s.label), ['1/40', '1/16', '1/4', '1/2', '1', '2', '4', '8', '20']);
  assert.deepEqual(v.speeds.filter(s => s.on).map(s => s.label), ['4'], 'the running speed is the one lit');
  assert.deepEqual(v.speeds.filter(s => s.slow).map(s => s.label), ['1/40', '1/16', '1/4', '1/2'], 'the slow ones are the small chips');
  assert.equal(v.speeds.every(s => !s.off), true);
  assert.equal(v.watch, 'start'); assert.equal(v.skipRush, true); assert.equal(v.toggle.label, 'Hide the speeds');
  assert.equal(speedBarView(bar({ open: true, speed: 0, resume: 4 })).speeds.some(s => s.on), false, 'paused: none lit');
  assert.match(v.speeds[0]!.tip, /watching speed/); assert.match(v.speeds[1]!.tip, /Slow motion/); assert.match(v.speeds[8]!.tip, /^Speed/);
});
test('#1275: your round holds the pace: the speeds above the watching speed are shut, open (collapsed shows the speed it holds)', () => {
  const v = speedBarView(bar({ open: true, speed: WATCH_SPEED, paceLock: true }));
  assert.deepEqual(v.speeds.filter(s => s.off).map(s => s.label), ['1/16', '1/4', '1/2', '1', '2', '4', '8', '20']);
  assert.equal(v.speeds[0]!.off, false);
  assert.equal(speedBarView(bar({ speed: WATCH_SPEED, paceLock: true })).current!.label, '1/40');
});
test('#1275: following a group stays on the bar collapsed (its ✕ is the way back); Skip night stays on it whatever its state; Watch golf is a golf game\'s', () => {
  assert.equal(speedBarView(bar({ watching: 'Group 3' })).watch, 'stop', 'collapsed: the Watching chip stays');
  assert.equal(speedBarView(bar({ open: true, watching: 'Group 3' })).watch, 'stop');
  assert.equal(speedBarView(bar()).watch, null); assert.equal(speedBarView(bar({ open: true })).watch, 'start');
  assert.equal(speedBarView(bar({ open: true, golf: false })).watch, null, 'the town game: no Watch golf');
  assert.equal(speedBarView(bar({ skipNight: true })).skipNight, true); assert.equal(speedBarView(bar({ open: true, skipNight: true })).skipNight, true); assert.equal(speedBarView(bar()).skipNight, false);
});
test('#1275: the jam build\'s shorter bar collapses the same: no Watch golf and no skip to the rush hour, open or shut', () => {
  const shut = speedBarView(bar({ jam: true })), open = speedBarView(bar({ jam: true, open: true }));
  assert.equal(shut.current!.label, '1'); assert.deepEqual(shut.speeds, []); assert.equal(shut.watch, null); assert.equal(shut.skipRush, false);
  assert.equal(open.speeds.length, SPEEDS.length); assert.equal(open.watch, null); assert.equal(open.skipRush, false);
  assert.equal(speedBarView(bar({ jam: true, watching: 'x' })).watch, null, 'never in the jam');
  assert.equal(shut.toggle.tip, 'Every speed');
});
test('#1275: the bar remembers its state in this browser: collapsed when there is nothing, bad, or the storage throws', () => {
  const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m }; };
  const s = mem();
  assert.equal(loadSpeedBarOpen(s), false, 'the default: collapsed');
  assert.equal(saveSpeedBarOpen(true, s), true); assert.equal(s.m.get(SPEED_BAR_KEY), 'open'); assert.equal(loadSpeedBarOpen(s), true);
  assert.equal(saveSpeedBarOpen(false, s), false); assert.equal(s.m.get(SPEED_BAR_KEY), 'closed'); assert.equal(loadSpeedBarOpen(s), false);
  s.m.set(SPEED_BAR_KEY, 'banana'); assert.equal(loadSpeedBarOpen(s), false, 'a bad value is the default');
  const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(loadSpeedBarOpen(boom), false, 'a private window: collapsed'); assert.equal(saveSpeedBarOpen(true, boom), true, 'and saving never throws');
  assert.equal(loadSpeedBarOpen(null), false);
});
test('#1275: the top bar draws the speed bar from the model: the chevron toggles it (aria-expanded), its test ids stay, the pause button and the Pause tooltip are untouched', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  assert.match(app, /data-testid="speed-toggle"/); assert.match(app, /data-testid="speed-current"/); assert.match(app, /data-testid=\{`speed-\$\{s\.label\}`\}/); assert.match(app, /aria-expanded=\{sb\.open\}/);
  assert.match(app, /data-tip="Pause \(Space\)"/); assert.match(app, /data-testid="watch-golf"/); assert.match(app, /data-testid="watch-stop"/);
  assert.match(app, /useState\(\(\) => loadSpeedBarOpen\(\)\)/, 'the state starts from this browser\'s memory');
});
