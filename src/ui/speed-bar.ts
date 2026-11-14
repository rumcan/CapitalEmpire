// The speed bar's collapsed model (#1275; the owner, 2026-11-14, of the top bar's time controls, pause then 1/40x ... 20x, Watch golf and skip: "this can
// collapse right? and expand"). Collapsed is the default and shows only what the player needs at a glance: the pause button, the speed the game runs at (or,
// paused, the one it resumes at) and a chevron; expanded shows every speed, Watch golf and skip, as before. The choice is remembered in this browser
// (localStorage, every access in try/catch, as the UI scale: a private window falls back to collapsed). The keys (, . and Space) are the engine's and
// never read this: they work whether the bar is open or shut. The jam build's bar is the shorter one (no Watch golf, no skip to the rush hour) and
// collapses the same way. Two things stay on the bar whatever its state, because they are state and a call to act and must never hide: the "Watching
// <group> ✕" chip while you follow a group (its ✕ is the way back), and Skip night when a night can be skipped. Pure TS, no DOM, no engine.
import { WATCH_SPEED, speedLabel } from '../game/golf/watch';

/** the localStorage key: 'open' (every speed), 'closed' (collapsed); none: collapsed */
export const SPEED_BAR_KEY = 'capitalempire.speedBar';

/** the remembered state: true when the bar was left open (collapsed when there is none, or the storage cannot be read) */
export function loadSpeedBarOpen(store?: Pick<Storage, 'getItem'> | null): boolean {
  try { const s = store === undefined ? globalThis.localStorage : store; return s?.getItem(SPEED_BAR_KEY) === 'open'; } catch { return false; }
}
/** remembers the state (nothing when the storage throws); returns the state given */
export function saveSpeedBarOpen(open: boolean, store?: Pick<Storage, 'setItem'> | null): boolean {
  try { (store === undefined ? globalThis.localStorage : store)?.setItem(SPEED_BAR_KEY, open ? 'open' : 'closed'); } catch { /* storage may be unavailable */ }
  return open;
}

/** what the bar is drawn from (App.tsx reads it off the game) */
export interface SpeedBarFacts {
  /** the player's choice: open (every speed, Watch golf, skip) or collapsed */
  open: boolean;
  /** the speeds the bar offers, slowest first (golf/watch.ts SPEEDS) */
  speeds: readonly number[];
  /** the speed the game runs at (0: paused) and the one Space resumes at (the running one when it runs) */
  speed: number; resume: number;
  /** your round holds the pace: the speeds above the watching speed are shut */
  paceLock: boolean;
  /** the jam build: no Watch golf, no skip to the rush hour */
  jam: boolean;
  /** a golf game (Watch golf is offered), and the group you follow now (its label), or null */
  golf: boolean; watching: string | null;
  /** a clock night with a night left to skip */
  skipNight: boolean;
}
/** a speed chip of the open bar */
export interface SpeedChip { k: number; label: string; on: boolean; off: boolean; slow: boolean; tip: string }
/** the collapsed bar's chip: the speed now, or while paused the one Space resumes at */
export interface SpeedCurrent { k: number; label: string; paused: boolean; tip: string }
export interface SpeedBarView {
  open: boolean;
  /** every speed's chip when open, none collapsed */
  speeds: SpeedChip[];
  /** the current-speed chip when collapsed, none open */
  current: SpeedCurrent | null;
  /** Watch golf (start) when open, "Watching ✕" (stop) whenever you follow a group, none otherwise (no golf, or the jam) */
  watch: 'start' | 'stop' | null;
  /** the skip to the next rush hour: open only, never in the jam */
  skipRush: boolean;
  /** Skip night: whenever a night can be skipped */
  skipNight: boolean;
  /** the chevron: what a click does and says (aria-expanded is `open`) */
  toggle: { label: string; tip: string };
}

/** a speed chip's tooltip (the keys' hint kept as it was) */
export const speedTip = (k: number): string => (k === WATCH_SPEED ? 'The watching speed: golfers walk at a natural pace (, and .)' : k < 1 ? 'Slow motion (, and .)' : 'Speed (, and .)');

/** the speed bar for these facts: which controls show, the current chip's words and the chevron's */
export function speedBarView(f: SpeedBarFacts): SpeedBarView {
  const running = f.speed > 0, k = running ? f.speed : f.resume > 0 ? f.resume : 1;
  const speeds: SpeedChip[] = f.open ? f.speeds.map(s => ({ k: s, label: speedLabel(s), on: f.speed === s, off: f.paceLock && s > WATCH_SPEED, slow: s < 1, tip: speedTip(s) })) : [];
  const current: SpeedCurrent | null = f.open ? null : {
    k, label: speedLabel(k), paused: !running,
    tip: running ? `Speed ${speedLabel(k)}×: click for every speed (, and . change it)` : `Paused: Space resumes at ${speedLabel(k)}×. Click for every speed (, and . change it)`,
  };
  const watch = !f.golf || f.jam ? null : f.watching !== null ? 'stop' : f.open ? 'start' : null;
  return {
    open: f.open, speeds, current, watch,
    skipRush: f.open && !f.jam, skipNight: f.skipNight,
    toggle: f.open ? { label: 'Hide the speeds', tip: 'Collapse the speed bar to pause and the current speed' } : { label: 'Show every speed', tip: f.jam ? 'Every speed' : 'Every speed, Watch golf and skip to the rush hour' },
  };
}
