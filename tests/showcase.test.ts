// The living scene behind the jam's title card (J12, #1271: src/game/showcase.ts, showcase-director.ts): the camera stops lie inside the world (and the prepared world
// the shipped save holds), the camera keeps each point of interest where the card leaves room for it, the scene boots with no save read or written, a choice on the card
// is carried to the game's own boot by the address, the scene never runs where it must not, and the director cuts from stop to stop with a cross-fade and never
// reaches for anything of the player's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { GAME_BOOT } from '../src/game/boot';
import { HH, HW, MAP, ZOOM_MAX, ZOOM_MIN, worldX, worldY } from '../src/game/iso';
import { CHOICE_KEY, FADE_MS, REST_AFTER_MS, choiceFromStore, READY_MAX_MS, READY_MIN_MS, SHOW_ANCHOR, SHOW_HOURS, SHOW_STOPS, SLOW_AFTER_MS, SLOW_FRAME_MS, WARM_MS, WIDE_MIN_W, choiceHash, choiceOf, pickStart, poseAt, sceneOff, showBoot, showWanted, stopProblems, weakMachine, type ShowEnv, type ShowStop } from '../src/game/showcase';
import { ShowDirector, type ShowEvent, type ShowHost } from '../src/game/showcase-director';
import { townClockFor, townTimeOf, type TownClock } from '../src/game/sim/townclock';

const stop = (o: Partial<ShowStop> = {}): ShowStop => ({ id: 't', name: 'test', x: 1000, y: 1000, dx: 10, dy: -6, z0: 0.2, z1: 0.3, secs: 15, ...o });
const screenOf = (p: { X: number; Y: number; z: number }, x: number, y: number, w: number, h: number) => ({ sx: (worldX(x, y) - p.X) * p.z + w / 2, sy: (worldY(x, y) - p.Y) * p.z + h / 2 });

test('the stops lie inside the map, within the game\'s zoom, stay 12 to 18 s and are not repeated', () => {
  assert.deepEqual(stopProblems(SHOW_STOPS), []);
  assert.ok(SHOW_STOPS.length >= 2, 'a lap has more than one place');
  // the checker itself catches what it is for
  assert.ok(stopProblems([stop({ x: 10 })]).some(p => /outside the map/.test(p)));
  assert.ok(stopProblems([stop({ x: MAP - 70, dx: 200 })]).some(p => /end .* outside/.test(p)));
  assert.ok(stopProblems([stop({ z1: ZOOM_MAX * 1.2 })]).some(p => /zoom/.test(p)));
  assert.ok(stopProblems([stop({ z0: ZOOM_MIN / 2 })]).some(p => /zoom/.test(p)));
  assert.ok(stopProblems([stop({ secs: 9 })]).some(p => /12 to 18/.test(p)) && stopProblems([stop({ secs: 25 })]).some(p => /12 to 18/.test(p)));
  assert.ok(stopProblems([stop(), stop()]).some(p => /second stop/.test(p)));
  assert.ok(stopProblems([stop({ x: NaN })]).some(p => /finite/.test(p)));
});

type ShippedSave = { map: number; seed: number; segs: [number, number, number, number, string][]; biz: [string, number, number, number, number][]; golf?: { parcel: [number, number, number, number]; plans?: unknown[] } };
const shipped = (): ShippedSave => JSON.parse(gunzipSync(readFileSync('src/assets/showcase/menu.cesave')).toString('utf8')) as ShippedSave;

test('the stops lie in the prepared world: on the map, near the club\'s land and the county road the shipped save holds, which has the club the stops look at', () => {
  const save = shipped();
  assert.equal(save.map, MAP, 'the save is for this map size');
  assert.ok(save.golf, 'the prepared world is a golf game');
  // the club the scene looks at: the old range and a clubhouse, and the holes built through the wizard
  assert.deepEqual(save.biz.map(b => b[0]).sort(), ['clubhouse', 'range']);
  assert.ok((save.golf!.plans ?? []).length >= 3, 'the world has its holes');
  const [px, py, pw, ph] = save.golf!.parcel, reach = 600;
  const roadGap = (x: number, y: number) => Math.min(...save.segs.map(([ax, ay, bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ((dx * dx + dy * dy) || 1))); return Math.hypot(ax + dx * t - x, ay + dy * t - y); }));
  for (const s of SHOW_STOPS) for (const [x, y] of [[s.x, s.y], [s.x + s.dx, s.y + s.dy]] as const) {
    assert.ok(x >= px - reach && x <= px + pw + reach && y >= py - reach && y <= py + ph + reach, `${s.id}: (${x}, ${y}) is far from the club's land [${px}, ${py}, ${pw}, ${ph}]`);
    assert.ok(roadGap(x, y) <= 160, `${s.id}: (${x}, ${y}) is ${Math.round(roadGap(x, y))} tiles from any road: the view would be bare ground`);
  }
});

test('the scene adds at most 12 files and 8 MB to the build: the world and one still picture for each stop, nothing else', () => {
  const dir = 'src/assets/showcase', files = readdirSync(dir);
  assert.ok(files.length <= 12, `${files.length} files`);
  assert.ok(files.reduce((n, f) => n + statSync(`${dir}/${f}`).size, 0) <= 8 * 1024 * 1024, 'over 8 MB');
  assert.deepEqual([...files].sort(), ['menu.cesave', ...SHOW_STOPS.map(s => `${s.id}.jpg`)].sort(), 'the folder holds the world and the stops\' stills: a stop with no still shows the card over a bare start');
});

test('the scene\'s overlay draws no label, badge, marker, outline or hint: only the world\'s own balls and dust, and the early return comes first', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8').replace(/\r\n/g, '\n');
  const body = /private drawShowOverlay\([^\n]*\{\n([\s\S]*?)\n  \}\n  private drawOverlay/.exec(src)?.[1];
  assert.ok(body, 'drawShowOverlay is there');
  for (const bad of ['labels.draw', 'labels.place', 'drawHoleBadges', 'drawTeeMarkers', 'drawYourCart', 'drawYou(', 'drawBusinesses', 'drawParks', 'drawPlaceNames', 'drawTownNames', 'drawGroundOverlays', 'drawInspect', 'drawMoneyFloats', 'drawTolls', 'drawStandIns']) assert.ok(!body!.includes(bad), `the scene's overlay calls ${bad}`);
  assert.match(src, /private drawOverlay\(now: number\) \{\n[^\n]*\n[^\n]*clearRect[^\n]*\n\s*if \(this\.show\) \{ this\.drawShowOverlay\(ctx, now, ze\); return; \}/, 'the scene takes its own path before any label is gathered');
});

test('the engine of the scene boots with its camera already on the first place (the ground the first picture needs bakes during the boot, not the place the world was built at)', () => {
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n'), load = readFileSync('src/game/showcase-load.ts', 'utf8').replace(/\r\n/g, '\n');
  assert.match(app, /g\.showcaseLoader = \(\) => loadShowcaseSave\(poseAt\(SHOW_STOPS\[startStop\]!, 0, window\.innerWidth, window\.innerHeight\)\);/);
  assert.match(load, /export async function loadShowcaseSave\(cam\?: \{ X: number; Y: number; z: number \}\)/); assert.match(load, /if \(cam && s\) s\.cam = \{ X: cam\.X, Y: cam\.Y, z: cam\.z \};/);
  // and the pose the loader is given is a real one on the first stop's point of interest
  const p = poseAt(SHOW_STOPS[0]!, 0, 1600, 900); assert.ok(Number.isFinite(p.X) && Number.isFinite(p.Y) && p.z > 0 && p.z <= ZOOM_MAX);
});

test('starting a game from the title card gives the game it always gave: the scene leaves by a reload into the game\'s own boot, then New game / Continue as before', () => {
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  // the one place a game starts from the card, as it was: a new game over a save is a new town, the card closes, the speed is the game's
  assert.match(app, /const startGame = \(g: Game, fresh: boolean\) => \{ if \(fresh && hasSave\) g\.newTown\(\); setTitleOpen\(false\); g\.setSpeed\(1\); \};/);
  // the page the choice started: the game's own boot (never the scene's), the same new town (a save stood) or the saved game, at the normal speed
  assert.match(app, /if \(choice === 'new' && had\) game\.newTown\(\); game\.setSpeed\(1\);/);
  assert.match(app, /const \[boot\] = useState\(\(\) => \{ const b = bootFor\(location\.search, import\.meta\.env\.DEV\); return sceneWanted && b\.kind === 'game' \? showBoot\(b\) : b; \}\);/);
  // in the scene the click touches none of the scene's world: it writes the choice into the address and reloads
  const leave = /const leaveTitle = \(fresh: boolean\) => \{\n([\s\S]*?)\n  \};/.exec(app)?.[1] ?? '';
  const scene = /if \(sceneWanted\) \{[^\n]*\n([\s\S]*?)\n    \}\n/.exec(leave)?.[1] ?? '';
  assert.match(scene, /choiceHash\(fresh \? 'new' : 'continue'\)/); assert.match(scene, /location\.reload\(\)/); assert.ok(!/game\./.test(scene), 'the scene\'s engine is not asked to start anything');
  // a chosen start is never the scene: showWanted says no once a choice is in the address (tested above), and the title is not open for it
  assert.match(app, /const \[titleOpen, setTitleOpen\] = useState\(JAM && !choice\);/);
});

test('the camera holds the point of interest at the anchor (right of the card on a wide screen, in the middle on a narrow one) and glides to the stop\'s end', () => {
  const s = stop(), W = 1600, H = 900;
  for (const u of [0, 0.37, 1]) {
    const p = poseAt(s, u, W, H), at = screenOf(p, s.x + s.dx * u, s.y + s.dy * u, W, H);
    assert.ok(Math.abs(at.sx - SHOW_ANCHOR.x * W) < 1e-6 && Math.abs(at.sy - SHOW_ANCHOR.y * H) < 1e-6, `u=${u}: the point is at the anchor`);
  }
  // the zoom glides in its log: halfway is the geometric mean
  assert.ok(Math.abs(poseAt(s, 0.5, W, H).z - Math.sqrt(0.2 * 0.3)) < 1e-9);
  assert.equal(poseAt(s, 0, W, H).z, 0.2); assert.ok(Math.abs(poseAt(s, 1, W, H).z - 0.3) < 1e-12);
  // u outside 0..1 holds the end
  assert.deepEqual(poseAt(s, -3, W, H), poseAt(s, 0, W, H)); assert.deepEqual(poseAt(s, 9, W, H), poseAt(s, 1, W, H));
  // a narrow or tall screen: the card is in the middle, so is the point
  for (const [w, h] of [[WIDE_MIN_W - 1, 700], [800, 1200], [390, 844]] as const) {
    const p = poseAt(s, 0, w, h), at = screenOf(p, s.x, s.y, w, h);
    assert.ok(Math.abs(at.sx - w / 2) < 1e-6 && at.sy < h * 0.5 && at.sy > h * 0.4, `${w}x${h}: the point is in the middle`);
  }
  // the whole drift is in the shown stops too: every pose keeps the point on screen
  for (const st of SHOW_STOPS) for (const u of [0, 0.5, 1]) { const p = poseAt(st, u, W, H), a = screenOf(p, st.x + st.dx * u, st.y + st.dy * u, W, H); assert.ok(a.sx > 0 && a.sx < W && a.sy > 0 && a.sy < H, `${st.id} u=${u}`); }
  assert.ok(HW > 0 && HH > 0);
});

test('a visit starts at a different place from the last when there is a choice, and always at a real stop', () => {
  for (let n = 1; n <= 6; n++) for (let last = -1; last < n; last++) for (let k = 0; k < 20; k++) {
    const r = k / 20, i = pickStart(n, r, last < 0 ? null : last);
    assert.ok(Number.isInteger(i) && i >= 0 && i < n, `n=${n} last=${last} r=${r}: ${i}`);
    if (n > 1 && last >= 0) assert.notEqual(i, last, `n=${n} last=${last} r=${r}`);
  }
  assert.equal(pickStart(5, 0.999999, null), 4); assert.equal(pickStart(5, 0, null), 0); assert.equal(pickStart(0, 0.5, null), 0);
  // every stop gets visited first by some roll
  const first = new Set<number>(); for (let k = 0; k < 100; k++) first.add(pickStart(SHOW_STOPS.length, k / 100, null)); assert.equal(first.size, SHOW_STOPS.length);
});

test('the scene boots with no save read or written and no money floats; the game\'s own boot is untouched', () => {
  const b = showBoot();
  assert.equal(b.save, false); assert.equal(b.moneyFloats, false);
  assert.deepEqual({ ...b, save: true, moneyFloats: true }, { ...GAME_BOOT }, 'nothing else differs from the game\'s boot');
  assert.equal(GAME_BOOT.save, true); assert.equal(GAME_BOOT.moneyFloats, true); assert.ok(Object.isFrozen(GAME_BOOT));
  const lab = { ...GAME_BOOT, groundWorkers: 2 }; assert.equal(showBoot(lab).groundWorkers, 2); assert.equal(lab.save, true);
});

test('the engine keeps the scene away from the player\'s slot: saving is blocked before anything could write, and the slot is not read', () => {
  const src = readFileSync('src/game/engine.ts', 'utf8').replace(/\r\n/g, '\n'); // (a Windows checkout has CRLF)
  const at = (re: RegExp) => { const m = re.exec(src); assert.ok(m, `engine.ts has ${re}`); return m!.index; };
  const block = at(/if \(showSave\) this\.saveBlocked = true;/), read = at(/const read = opts\.bench \|\| fixName \|\| showSave \|\| this\.osmSpec \|\| !this\.boot\.save \? null : await readSave\(\)/), loaded = at(/const save = fixture \?\? showSave \?\? read\?\.save \?\? null;/);
  assert.ok(block < read && read < loaded, 'saveBlocked, then the (skipped) read, then the save chosen');
  // a scene's world that fails to load must not take the backup path (a copy of the player's slot) the stored save's failure takes
  assert.match(src, /if \(save && showSave\) this\.showFailed = true;[^\n]*\n\s*else if \(save\) \{ if \(await backupTownSlot\('loadfailed'\)\)/);
  // the scene takes no input and shows no toasts
  for (const re of [/toast\(text: string[^\n]*\n\s*if \(this\.show\) return;/, /pointerDown\(e: PointerEvent\) \{\n\s*if \(this\.show\) return;/, /pointerMove\(e: PointerEvent\) \{\n\s*if \(this\.show\) return;/, /pointerUp\(\) \{\n\s*if \(this\.show\) return;/, /keyDown\(e: KeyboardEvent\) \{\n\s*if \(this\.show\) return;/, /wheel\(e: WheelEvent\) \{\n\s*if \(this\.show\)/, /doubleClick\(\) \{ if \(this\.show\) return;/]) assert.match(src, re);
  // every writer of the slot is behind saveBlocked (save) or out of the scene's reach (the gear menu's)
  assert.match(src, /async save\(\) \{\n\s*if \(this\.benchMode(?: \|\| this\.startPick)?\) return 0; if \(this\.saveBlocked\) return 0;/); // (J9 added the start pick, which writes nothing either)
});

test('a choice on the title card rides the address to the game\'s own boot', () => {
  assert.equal(choiceHash('new'), `#${CHOICE_KEY}=new`); assert.equal(choiceHash('continue'), '#play=continue');
  for (const c of ['new', 'continue'] as const) assert.equal(choiceOf(choiceHash(c)), c);
  assert.equal(choiceOf(''), null); assert.equal(choiceOf('#'), null); assert.equal(choiceOf('#play=other'), null); assert.equal(choiceOf('#play=newer'), null); assert.equal(choiceOf('#x=play=new'), null);
  assert.equal(choiceOf('#a=1&play=continue&b=2'), 'continue'); assert.equal(choiceOf('#play=new&scene=off'), 'new');
  assert.ok(sceneOff('#scene=off') && sceneOff('#a=1&scene=off') && !sceneOff('') && !sceneOff('#scene=on') && !sceneOff('#myscene=off'));
  // the tab's session storage carries it too, for a page that cannot change its address
  assert.equal(choiceFromStore('new'), 'new'); assert.equal(choiceFromStore('continue'), 'continue'); assert.equal(choiceFromStore(null), null); assert.equal(choiceFromStore(''), null); assert.equal(choiceFromStore('newer'), null);
});

test('the scene runs only on the jam\'s title card, before a choice, with motion allowed, on a visible tab and a machine that can', () => {
  const ok: ShowEnv = { jam: true, chose: false, reducedMotion: false, hidden: false, weak: false, other: false };
  assert.equal(showWanted(ok), true);
  for (const k of ['chose', 'reducedMotion', 'hidden', 'weak', 'other'] as const) assert.equal(showWanted({ ...ok, [k]: true }), false, k);
  assert.equal(showWanted({ ...ok, jam: false }), false, 'the normal game has no title card');
  assert.equal(weakMachine({}), false, 'what the browser does not say is not held against it');
  assert.equal(weakMachine({ deviceMemory: 2 }), true); assert.equal(weakMachine({ deviceMemory: 8, hardwareConcurrency: 2 }), true); assert.equal(weakMachine({ deviceMemory: 4, hardwareConcurrency: 4 }), false);
  assert.equal(weakMachine({ hardwareConcurrency: 8, connection: { saveData: true } }), true);
});

/** a stand-in for the engine: records what the director asks of it */
function host(over: Partial<ShowHost> = {}) {
  const calls: string[] = [];
  const cam = { X: 0, Y: 0, z: 0.1 };
  const style: Record<string, string> = { opacity: '0', transition: '' };
  const drawn: string[] = [];
  const ctx = { drawImage: (img: { tag: string }) => { drawn.push(img.tag); } };
  const snap = { width: 0, height: 0, style, getContext: () => ctx } as unknown as HTMLCanvasElement;
  let ready = false, town: TownClock = { ...townClockFor(600), t0: 0, m0: 0 }, sim = 1000;
  const sets: TownClock[] = [];
  const g: ShowHost & { calls: string[]; setReady(v: boolean): void; sets: TownClock[]; setSim(t: number): void } = {
    cam, cssW: 1600, cssH: 900, canvas: { width: 1600, height: 900, tag: 'gl' } as unknown as HTMLCanvasElement, overlay: { width: 1600, height: 900, tag: 'overlay' } as unknown as HTMLCanvasElement,
    perf: { frameMs: 16.7 }, onFrame: null, onAfterDraw: null, calls,
    clampCam() { calls.push('clamp'); },
    warmView() { calls.push('warm'); },
    viewReady() { calls.push('ready?'); return ready; },
    traffic: { get town() { return town; }, simTime: () => sim, setTownClock(c) { sets.push(c); town = c; calls.push('clock'); } },
    setReady(v) { ready = v; }, sets, setSim(t) { sim = t; },
    ...over,
  };
  return { g, snap, style, drawn, calls, sets };
}
/** one engine frame at time `now`: the camera's hook, then the draw, then the after-draw hook */
const frame = (g: ShowHost, now: number) => { g.onFrame?.(now, 0.016); g.onAfterDraw?.(now); };

test('the director: waits for the first view, glides, cuts with a copy of the picture, shows the next stop once it is baked and fades the copy out', () => {
  const { g, snap, style, drawn } = host();
  const stops = [stop({ id: 'a', x: 1000, y: 1000, secs: 12 }), stop({ id: 'b', x: 1200, y: 1100, secs: 14 })];
  const events: ShowEvent[] = [];
  const d = new ShowDirector(g, stops, 0, snap, e => events.push(e)); d.begin(0);
  assert.equal(d.phase, 'first'); assert.ok(g.onFrame && g.onAfterDraw);
  // nothing shows until the first view is baked (and not before the least wait)
  frame(g, 100); assert.equal(d.phase, 'first'); assert.deepEqual(events, []);
  g.setReady(true); frame(g, READY_MIN_MS - 1); assert.equal(d.phase, 'first');
  frame(g, READY_MIN_MS + 10); assert.equal(d.phase, 'play'); assert.deepEqual(events, ['first', 'cut']);
  // the camera glides: at the middle it is where poseAt says
  const t0 = READY_MIN_MS + 10; frame(g, t0 + 6000);
  const mid = poseAt(stops[0]!, 0.5, 1600, 900); assert.ok(Math.abs(g.cam.X - mid.X) < 1e-6 && Math.abs(g.cam.z - mid.z) < 1e-9);
  assert.equal(style.opacity, '0', 'no copy over the game while it plays');
  // the cut: at the end of the stop the picture and its overlay are copied (same frame), opaque at once, and the camera is at the next stop
  frame(g, t0 + 12000); assert.equal(d.phase, 'cover'); assert.equal(d.index, 1);
  assert.deepEqual(drawn, ['gl', 'overlay']); assert.equal(style.opacity, '1'); assert.equal(style.transition, 'none'); assert.equal(snap.width, 1600); assert.equal(snap.height, 900);
  const start = poseAt(stops[1]!, 0, 1600, 900); assert.ok(Math.abs(g.cam.X - start.X) < 1e-6);
  // the copy stays opaque until the next stop's ground is baked and the least wait is over; then it fades and the new stop's own glide starts
  g.setReady(false); frame(g, t0 + 12000 + READY_MIN_MS + 50); assert.equal(d.phase, 'cover'); assert.equal(style.opacity, '1');
  g.setReady(true); frame(g, t0 + 12000 + READY_MIN_MS + 100); assert.equal(d.phase, 'play'); assert.equal(style.opacity, '0'); assert.match(style.transition, new RegExp(`opacity ${FADE_MS}ms`));
  assert.deepEqual(events, ['first', 'cut', 'cut']);
  // the lap goes round
  const t1 = t0 + 12000 + READY_MIN_MS + 100; frame(g, t1 + 14000); assert.equal(d.index, 0); assert.equal(d.phase, 'cover');
  d.end(); assert.equal(g.onFrame, null); assert.equal(g.onAfterDraw, null);
});

test('the director: a view that never bakes does not hold the scene for ever, and the next stop\'s ground is asked for a few seconds ahead', () => {
  const { g, snap, calls } = host();
  const stops = [stop({ id: 'a', secs: 12 }), stop({ id: 'b', x: 1300, secs: 12 })];
  const d = new ShowDirector(g, stops, 0, snap); d.begin(0);
  frame(g, READY_MAX_MS * 2 + 1); assert.equal(d.phase, 'play', 'the first view is shown after the most wait');
  const t0 = READY_MAX_MS * 2 + 1; calls.length = 0;
  frame(g, t0 + 12000 - WARM_MS - 100); assert.ok(!calls.includes('warm'), 'not warm yet');
  frame(g, t0 + 12000 - WARM_MS + 100); assert.ok(calls.includes('warm'), 'warm for the next stop in the last seconds');
  frame(g, t0 + 12000); assert.equal(d.phase, 'cover');
  frame(g, t0 + 12000 + READY_MAX_MS - 1); assert.equal(d.phase, 'cover'); frame(g, t0 + 12000 + READY_MAX_MS + 1); assert.equal(d.phase, 'play', 'covered no longer than the most wait');
});

test('the director: the town clock starts at the first golf hour and is put back at a cut that finds it past the last (the same day)', () => {
  const { g, snap, sets } = host();
  const stops = [stop({ id: 'a', secs: 12 }), stop({ id: 'b', secs: 12 })];
  g.setSim(5000); const dayNow = townTimeOf(g.traffic.town, 5000).day; const d = new ShowDirector(g, stops, 0, snap); d.begin(0);
  frame(g, 10); assert.equal(sets.length, 1, 'set once the sim time is known');
  const first = townTimeOf(sets[0]!, 5000); assert.equal(first.dayMin, SHOW_HOURS.start * 60); assert.equal(first.day, dayNow, 'the same day');
  // a day on: at the cut the clock reads 17:30 on day 1, past the end: set back to the first hour of day 1
  g.setReady(true); frame(g, READY_MIN_MS + 10);
  const late: TownClock = { ...sets[0]!, t0: 5000, m0: 17.5 * 60 }; (g.traffic as { setTownClock(c: TownClock): void }).setTownClock(late); sets.length = 0;
  const t0 = READY_MIN_MS + 10; frame(g, t0 + 12000);
  assert.equal(sets.length, 1, 'put back at the cut'); assert.equal(townTimeOf(sets[0]!, 5000).dayMin, SHOW_HOURS.start * 60); assert.equal(townTimeOf(sets[0]!, 5000).day, 1);
  // within the golf hours a cut leaves it alone
  g.setReady(true); frame(g, t0 + 12000 + READY_MIN_MS + 10); const t1 = t0 + 12000 + READY_MIN_MS + 10; sets.length = 0;
  frame(g, t1 + 12000); assert.equal(sets.length, 0);
});

test('the director: a machine too slow for the scene says so once, after the first seconds, and a quick one never does', () => {
  // (the rest below: a scene left open for hours stops drawing after REST_AFTER_MS of play, the last picture stays; a hidden tab's pause is not play)
  { const { g, snap } = host(); const events: ShowEvent[] = []; const d = new ShowDirector(g, [stop({ secs: 15 }), stop({ id: 'b', secs: 15 })], 0, snap, e => events.push(e)); d.begin(0); g.setReady(true);
    let t = READY_MIN_MS + 10; frame(g, t); assert.equal(d.phase, 'play');
    for (let k = 0; k < 20; k++) { t += 16.7 * 60; frame(g, t); g.setReady(true); } // (about 20 s of frames, a cut among them)
    assert.ok(!events.includes('rest'), 'not within the first minutes');
    t += 30 * 60 * 1000; frame(g, t); frame(g, t + 16); assert.ok(!events.includes('rest'), 'a gap of half an hour (a hidden tab) is not play');
    let n = 0; for (let k = 0; k < 40000 && !events.includes('rest'); k++) { t += 16.7; frame(g, t); g.setReady(true); n++; }
    assert.equal(events.filter(e => e === 'rest').length, 1, 'rests once'); assert.ok(n * 16.7 >= REST_AFTER_MS - 60000 && n * 16.7 <= REST_AFTER_MS * 1.06, `after ${Math.round(n * 16.7 / 1000)} s of frames (the covers between stops are not play)`); }
  for (const [ms, slow] of [[SLOW_FRAME_MS + 10, true], [SLOW_FRAME_MS - 10, false]] as const) {
    const { g, snap } = host({ perf: { frameMs: ms } });
    const events: ShowEvent[] = []; const d = new ShowDirector(g, [stop({ secs: 15 }), stop({ id: 'b', secs: 15 })], 0, snap, e => events.push(e)); d.begin(0);
    g.setReady(true);
    const play = READY_MIN_MS + 10; frame(g, play); // (the first view shows: the machine is judged SLOW_AFTER_MS from here, not from the page's start, when the engine was still baking)
    frame(g, play + SLOW_AFTER_MS - 100); assert.ok(!events.includes('slow'), 'not before the first seconds of play are over');
    frame(g, play + SLOW_AFTER_MS + 100); frame(g, play + SLOW_AFTER_MS + 200);
    assert.equal(events.filter(e => e === 'slow').length, slow ? 1 : 0, `${ms} ms a frame`);
  }
});
