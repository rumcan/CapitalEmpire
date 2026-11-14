// The living scene behind the jam build's title card (J12, #1271; the owner, 2026-11-14: "animated town/golfcourse/farms etc behind the main menu like the
// factorio main menu ... very pretty and zoomed in"). The real game runs behind the card: a prepared world (src/assets/showcase/menu.cesave, rebuilt by
// scripts/jam/menu-scene-build.mjs) is loaded into the engine with saving switched off, and the camera glides across one place for 12 to 18 seconds, then
// cross-fades to the next (showcase-director.ts). This file is the pure part: the places (the stops), the camera at a moment of a stop, the order
// of the visit and the rules of when the scene may run at all. No DOM, no engine: tests/showcase.test.ts runs it.
import { MAP, ZOOM_MAX, ZOOM_MIN, worldX, worldY } from './iso';
import { GAME_BOOT, type BootOptions } from './boot';

/** a place the camera visits: the point it shows (tiles), how it drifts and how long it stays */
export interface ShowStop {
  /** a short id (the still picture's file name, the checks' name for it) */
  id: string;
  /** what it shows, for the picture's alt text and the shots' names */
  name: string;
  /** the point of interest at the start (tile x, y) and how far it drifts over the stop (tiles): the camera glides from (x, y) to (x + dx, y + dy) */
  x: number; y: number; dx: number; dy: number;
  /** the zoom at the start and at the end (CSS zoom: 0.3 is the closest the game has; the log of the zoom glides) */
  z0: number; z1: number;
  /** seconds on screen before the cross-fade (12 to 18) */
  secs: number;
  /** the hour of the town day the stop looks best at (24 h clock: the director sets the town clock to it at the stop's cut when the day has run past the golf hours) */
  hour?: number;
}

/** the camera at a moment of a stop, as the engine holds it (world px at zoom 1: iso.ts) */
export interface ShowPose { X: number; Y: number; z: number }

/** where the point of interest sits on a wide screen: right of the card (the card is on the left), a little above the middle (fractions of the width and height) */
export const SHOW_ANCHOR = Object.freeze({ x: 0.64, y: 0.5 });
/** on a screen narrower than this (css px), or taller than wide, the card is in the middle and the point of interest too */
export const WIDE_MIN_W = 900;
/** the cross-fade from one stop to the next (ms), and the least the director waits for the next stop's ground before it starts it (ms) and the most (ms) */
export const FADE_MS = 1800, READY_MIN_MS = 500, READY_MAX_MS = 4000;
/** the still picture's fade out when the scene is ready (ms) */
export const POSTER_FADE_MS = 1400;
/** how long before a cut the director asks for the next stop's ground and trees (ms) */
export const WARM_MS = 3500;
/** the golf hours the scene keeps the town clock in (hours of the day): it starts at the first, and a cut that finds the clock past the second sets it back */
export const SHOW_HOURS = Object.freeze({ start: 7.0, end: 13.0 });
/** the golfers a day the scene's course has (the sim's busiest ordinary day, so there are groups on every hole: engine dayInputs busy) */
export const SHOW_GOLFERS = 80;
/** the frame time (ms, over the first SLOW_AFTER_MS of running) above which the machine is too slow for the scene: it gives way to its still picture */
export const SLOW_FRAME_MS = 42, SLOW_AFTER_MS = 4000;

/** the places, in the order of a visit's lap (a visit starts at a different one each time and goes round). Each is looked at in the shots
 *  (docs/jam-shots/j12-*.jpg) and moved until it is pretty: the tile numbers are the prepared world's (scripts/jam/menu-scene-build.mjs) */
export const SHOW_STOPS: readonly ShowStop[] = [
  { id: 'range', name: 'The driving range on a busy morning', x: 1000, y: 1003, dx: -12, dy: -4, z0: 0.3, z1: 0.28, secs: 15 },
  { id: 'arrive', name: 'Cars arriving at the club', x: 962, y: 1022, dx: 8, dy: -8, z0: 0.3, z1: 0.3, secs: 15 },
  { id: 'fairway', name: 'A fairway framed with trees', x: 922, y: 950, dx: -4, dy: -40, z0: 0.26, z1: 0.22, secs: 16 },
  { id: 'green', name: 'A green with its flag', x: 802, y: 990, dx: 6, dy: -10, z0: 0.3, z1: 0.3, secs: 14 },
  { id: 'farm', name: 'A farm by the county road', x: 474, y: 978, dx: 6, dy: 4, z0: 0.25, z1: 0.27, secs: 15 },
  { id: 'bridge', name: 'The county road over the river', x: 1058, y: 1040, dx: 20, dy: 0, z0: 0.25, z1: 0.25, secs: 14 },
];

/** the camera at moment u (0 at the start of the stop, 1 at its end) so that the point of interest is at the anchor of a screen cssW x cssH */
export function poseAt(s: ShowStop, u: number, cssW: number, cssH: number): ShowPose {
  const k = Math.min(1, Math.max(0, u)), wide = cssW >= WIDE_MIN_W && cssW > cssH * 1.15;
  const ax = wide ? SHOW_ANCHOR.x : 0.5, ay = wide ? SHOW_ANCHOR.y : 0.46;
  const z = Math.exp(Math.log(s.z0) + (Math.log(s.z1) - Math.log(s.z0)) * k);
  const tx = s.x + s.dx * k, ty = s.y + s.dy * k;
  return { X: worldX(tx, ty) - (ax - 0.5) * cssW / z, Y: worldY(tx, ty) - (ay - 0.5) * cssH / z, z };
}

/** the stop a visit starts at: a different one from the last visit's when there is a choice (rnd in [0, 1): a random number; last: the stop of the
 *  last visit, or null) */
export function pickStart(n: number, rnd: number, last: number | null): number {
  if (n <= 1) return 0;
  const k = Math.min(n - 1, Math.floor(Math.max(0, rnd) * n));
  return last !== null && k === last ? (k + 1) % n : k;
}

/** the problems with a list of stops (an empty list: none): a point or its drift outside the map or too near its edge for the view, a zoom outside the
 *  game's range or past the closest, a stay outside 12 to 18 s, a repeated id */
export function stopProblems(stops: readonly ShowStop[], margin = 60): string[] {
  const out: string[] = [], seen = new Set<string>();
  const inside = (x: number, y: number) => x >= margin && y >= margin && x <= MAP - margin && y <= MAP - margin;
  for (const s of stops) {
    if (seen.has(s.id)) out.push(`${s.id}: a second stop with this id`); seen.add(s.id);
    if (![s.x, s.y, s.dx, s.dy, s.z0, s.z1, s.secs].every(Number.isFinite)) { out.push(`${s.id}: a number is not finite`); continue; }
    if (!inside(s.x, s.y)) out.push(`${s.id}: the start (${s.x}, ${s.y}) is outside the map`);
    if (!inside(s.x + s.dx, s.y + s.dy)) out.push(`${s.id}: the end (${s.x + s.dx}, ${s.y + s.dy}) is outside the map`);
    for (const z of [s.z0, s.z1]) if (z < ZOOM_MIN || z > ZOOM_MAX) out.push(`${s.id}: the zoom ${z} is outside the game's ${ZOOM_MIN} to ${ZOOM_MAX}`);
    if (s.secs < 12 || s.secs > 18) out.push(`${s.id}: ${s.secs} s is not 12 to 18`);
  }
  return out;
}

/* ---- when the scene runs, and how a game starts from it ---- */

/** the boot the scene's engine has: the game's (or the boot given), with no save read or written and no money floats (engine init: saveBlocked) */
export function showBoot(b: BootOptions = GAME_BOOT): BootOptions { return { ...b, save: false, moneyFloats: false }; }

/** what the player chose on the title card: a new game or the saved one. The page reloads with it in its address (`#play=new`, `#play=continue`) and the next
 *  boot is the game's own, as it always was, straight into it (the scene's world is never the player's, so the choice is carried over by a fresh page) */
export type StartChoice = 'new' | 'continue';
export const CHOICE_KEY = 'play';
/** the choice in an address's hash, or null */
export function choiceOf(hash: string): StartChoice | null {
  const m = new RegExp(`(?:^#|&)${CHOICE_KEY}=(new|continue)(?:&|$)`).exec(hash);
  return m ? (m[1] as StartChoice) : null;
}
/** the hash that carries a choice */
export const choiceHash = (c: StartChoice): string => `#${CHOICE_KEY}=${c}`;

/** what the page knows when it decides about the scene */
export interface ShowEnv {
  /** the jam build (the title card is the jam's) */ jam: boolean;
  /** a choice already made (the page was reloaded by the title card) */ chose: boolean;
  /** the player asked for less motion */ reducedMotion: boolean;
  /** the tab is hidden (opened in the background) */ hidden: boolean;
  /** a machine too small for it: fewer than 4 GB or 3 cores, or the browser asked for less data */ weak: boolean;
  /** the lot lab / the bench / a dev fixture decided the boot already */ other: boolean;
}
/** the scene runs only for the jam's title card, before a choice, with motion allowed, on a visible tab and a machine that can; else the title card shows its still
 *  picture over the game's own boot, as before */
export function showWanted(e: ShowEnv): boolean { return e.jam && !e.chose && !e.reducedMotion && !e.hidden && !e.weak && !e.other; }

/** the sceneless flow: the address says so (`#scene=off`: the scene's world could not be had, so the page started again without it) */
export const sceneOff = (hash: string): boolean => /(?:^#|&)scene=off(?:&|$)/.test(hash);
/** a machine too small for the scene (fewer than 4 GB of memory or 3 cores, or the browser asked for less data); what the browser does not say is not held against it */
export function weakMachine(nav: { deviceMemory?: number; hardwareConcurrency?: number; connection?: { saveData?: boolean } }): boolean {
  return (nav.deviceMemory !== undefined && nav.deviceMemory < 4) || (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency < 3) || !!nav.connection?.saveData;
}
