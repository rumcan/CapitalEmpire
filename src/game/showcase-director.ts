// The director of the living scene behind the jam's title card (J12, #1271; showcase.ts holds the places): it glides the engine's camera across each stop,
// asks for the next stop's ground a few seconds ahead, and cuts to it with a cross-fade: the picture is copied into a canvas laid over the game (opaque),
// the camera goes to the next stop, and once that view is baked the copy fades out over the live game. Nothing else of the game is touched: the engine
// is the real one, on the prepared world, with saving off (engine.ts show). DOM and the engine's camera only; the engine is reached through ShowHost so a
// test can stand in for it (tests/showcase.test.ts).
import { townTimeOf, type TownClock } from './sim/townclock';
import { FADE_MS, READY_MAX_MS, READY_MIN_MS, REST_AFTER_MS, SHOW_HOURS, SLOW_AFTER_MS, SLOW_FRAME_MS, WARM_MS, poseAt, type ShowPose, type ShowStop } from './showcase';

/** what the director needs of the engine (engine.ts Game has all of it) */
export interface ShowHost {
  cam: ShowPose;
  cssW: number; cssH: number;
  canvas: HTMLCanvasElement; overlay: HTMLCanvasElement;
  perf: { frameMs: number };
  onFrame: ((now: number, dt: number) => void) | null;
  onAfterDraw: ((now: number) => void) | null;
  clampCam(): void;
  warmView(c: ShowPose, now: number): void;
  viewReady(c: ShowPose): boolean;
  traffic: { town: TownClock; simTime(now: number): number; setTownClock(c: TownClock): void };
}

/** what the director tells the page: 'first' (the first stop is baked and showing: the still picture fades out), 'cut' (a stop began), 'slow' (the machine is too slow for the scene:
 *  the page gives way to its still picture), 'rest' (REST_AFTER_MS of play: the page stops the engine and the last picture stays) */
export type ShowEvent = 'first' | 'cut' | 'slow' | 'rest';

export class ShowDirector {
  private i: number;
  private state: 'first' | 'play' | 'capture' | 'cover' = 'first';
  /** when the stop began (ms), when the first view was asked for, when the cover began */
  private t0 = 0; private askedAt = 0; private coverAt = 0;
  /** when the first view was shown and the stop began to play (the machine's speed is judged SLOW_AFTER_MS later: a frame time measured while the first view was still baking says little) */
  private playSince = 0; private slowChecked = false; private off = false; private hourSet = false;
  /** the frames' time while playing (ms; a gap over 100 ms, a hidden tab's, counts as 100) and the last frame's time: the scene rests after REST_AFTER_MS of it */
  private played = 0; private lastNow = 0;
  private fadeTimer = 0;
  /** the camera's scratch poses (this stop's, the next stop's for the warm-up): the frame hook allocates nothing */
  private pose: ShowPose = { X: 0, Y: 0, z: 0 }; private nextPose: ShowPose = { X: 0, Y: 0, z: 0 };
  constructor(private g: ShowHost, private stops: readonly ShowStop[], start: number, private snap: HTMLCanvasElement, private emit: (e: ShowEvent) => void = () => {}) {
    this.i = ((start % stops.length) + stops.length) % stops.length;
  }

  /** begins: the camera at the start stop, the hours set, and the hooks in the engine's frame */
  begin(now = performance.now()) {
    const g = this.g;
    this.place(this.i, 0);
    this.askedAt = now;
    g.onFrame = (t) => this.frame(t);
    g.onAfterDraw = (t) => this.after(t);
  }

  /** ends it (the page is leaving or the scene gives way): the hooks go and the cover is cleared */
  end() {
    this.off = true; clearTimeout(this.fadeTimer);
    if (this.g.onFrame) this.g.onFrame = null;
    if (this.g.onAfterDraw) this.g.onAfterDraw = null;
  }

  get stop(): ShowStop { return this.stops[this.i]!; }
  get index(): number { return this.i; }
  get phase(): string { return this.state; }

  /** the camera at moment u of stop k */
  private place(k: number, u: number) {
    const g = this.g, p = poseAt(this.stops[k]!, u, g.cssW, g.cssH, this.pose);
    g.cam.X = p.X; g.cam.Y = p.Y; g.cam.z = p.z; g.clampCam();
  }

  /** the town clock at a golf hour: at the start, and at a cut that finds it past the end of the golf hours (the same day again: the day's groups are the same, so
   *  a clock put back shows them where they were) */
  private setHour(now: number, first = false) {
    const T = this.g.traffic, st = T.simTime(now), t = townTimeOf(T.town, st);
    if (!first && t.dayMin / 60 <= SHOW_HOURS.end) return;
    T.setTownClock({ ...T.town, t0: st, m0: (t.day - 1) * 1440 + SHOW_HOURS.start * 60 });
  }

  private frame(now: number) {
    if (this.off) return;
    const g = this.g, gap = this.lastNow ? Math.min(100, now - this.lastNow) : 0; this.lastNow = now;
    // the town clock starts at the first golf hour once the worker's time is known (before its first frame the sim time reads 0)
    if (!this.hourSet && g.traffic.simTime(now) > 0) { this.setHour(now, true); this.hourSet = true; }
    if (this.state === 'first') {
      this.place(this.i, 0);
      if (now - this.askedAt >= READY_MIN_MS && (g.viewReady(g.cam) || now - this.askedAt >= READY_MAX_MS * 2)) { this.state = 'play'; this.t0 = now; this.playSince = now; this.emit('first'); this.emit('cut'); }
      else g.warmView(g.cam, now);
      return;
    }
    if (this.state === 'play') {
      const s = this.stops[this.i]!, ms = s.secs * 1000, el = now - this.t0, u = el / ms;
      this.place(this.i, u);
      if ((this.played += gap) >= REST_AFTER_MS) { this.emit('rest'); return; }
      if (!this.slowChecked && now - this.playSince >= SLOW_AFTER_MS) { this.slowChecked = true; if (g.perf.frameMs > SLOW_FRAME_MS) { this.emit('slow'); return; } }
      if (ms - el < WARM_MS) { const n = (this.i + 1) % this.stops.length; g.warmView(poseAt(this.stops[n]!, 0, g.cssW, g.cssH, this.nextPose), now); }
      if (u >= 1) this.state = 'capture'; // (the picture is copied after this frame's draw)
      return;
    }
    if (this.state === 'cover') {
      this.place(this.i, 0);
      const el = now - this.coverAt;
      if (el >= READY_MIN_MS && (g.viewReady(g.cam) || el >= READY_MAX_MS)) {
        // the next stop is baked: the copy fades out over it, and the stop's own glide begins at once
        const s = this.snap.style; s.transition = `opacity ${FADE_MS}ms ease-in-out`; s.opacity = '0';
        this.state = 'play'; this.t0 = now; this.emit('cut');
      } else g.warmView(g.cam, now);
    }
  }

  /** after a frame's draw: when a cut is due, the picture (the game's canvas and its overlay) is copied over the game and the camera goes to the next stop */
  private after(now: number) {
    if (this.off || this.state !== 'capture') return;
    const g = this.g, snap = this.snap, w = g.canvas.width, h = g.canvas.height;
    if (snap.width !== w) snap.width = w;
    if (snap.height !== h) snap.height = h;
    const c = snap.getContext('2d');
    if (c) { c.drawImage(g.canvas, 0, 0, w, h); c.drawImage(g.overlay, 0, 0, w, h); }
    const s = snap.style; s.transition = 'none'; s.opacity = '1';
    this.i = (this.i + 1) % this.stops.length;
    this.setHour(now);
    this.place(this.i, 0);
    this.state = 'cover'; this.coverAt = now;
  }
}
