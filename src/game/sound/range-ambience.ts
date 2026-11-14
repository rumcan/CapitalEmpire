// J11 (#1270): the range's ambience, heard only while the camera is close on the range: a soft breeze, a bird now and then, and the distant "tok" of each golfer's strike
// as he hits (the range's golfers: RangeSim.onStrike). It is quiet on purpose (the breeze is about -34 dBFS) and it is made of the one master bus's effects, so the
// effects' volume and every mute silence it. Nothing here runs per frame: the engine calls update about six times a second (progressCheck) and strike() once per
// golfer's swing; the breeze is one looped noise source with a filter and a gain, built when the camera first comes close and taken down (its nodes freed) a few
// seconds after it leaves.
import { sound as theSound, type SoundCore } from './core';
import { noiseBuffer } from './recipes';
import { playRangeStrike, playSfx } from './sfx';

/** the zoom (CSS zoom: 0.3 is the closest) the ambience begins at, and where it is at full: the zoom where the range's props and golfers are drawn close up */
export const AMBIENCE_FROM = 0.09, AMBIENCE_FULL = 0.2;
/** the breeze's gain at full (about -34 dBFS through its filter), how fast it follows the level (s), and how long the nodes live after the level has gone to nothing (ms) */
const WIND_GAIN = 0.15, WIND_TC = 0.5, KEEP_MS = 4000;
/** the shortest time between two strikes heard (ms), and between two birds (ms: a random 6 to 16 s) */
const STRIKE_GAP_MS = 220, BIRD_MIN_MS = 6000, BIRD_SPAN_MS = 10000;

/** how much of the ambience the camera earns: 0 farther than AMBIENCE_FROM, 1 from AMBIENCE_FULL, smooth between, and 0 when the range is not in view */
export function ambienceLevel(zoom: number, inView: boolean): number {
  if (!inView || !Number.isFinite(zoom)) return 0;
  const t = Math.min(1, Math.max(0, (zoom - AMBIENCE_FROM) / (AMBIENCE_FULL - AMBIENCE_FROM)));
  return t * t * (3 - 2 * t);
}

export class RangeAmbience {
  private nodes: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private level = 0;
  private quietSince = -Infinity;
  private lastStrike = -Infinity;
  private nextBird = 0;
  constructor(private core: SoundCore = theSound, private now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), private rnd: () => number = Math.random) {}

  /** whether the breeze exists now (its nodes are built) */
  get active(): boolean { return this.nodes !== null; }
  /** the level the breeze is set to now (0..1) */
  get current(): number { return this.level; }

  /** the camera's level now (ambienceLevel): about six times a second */
  update(level: number): void {
    const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0, t = this.now();
    this.level = l;
    if (l > 0.02) this.quietSince = t;
    if (this.nodes === null && l > 0.02) this.build();
    const n = this.nodes;
    if (n) {
      const a = this.core.audio();
      if (a) { try { n.gain.gain.setTargetAtTime(l * WIND_GAIN * (0.75 + 0.25 * Math.sin(t / 2300) + 0.1 * (this.rnd() - 0.5)), a.ctx.currentTime, WIND_TC); } catch { /* ignore */ } }
      if (l <= 0.02 && t - this.quietSince > KEEP_MS) this.teardown();
    }
    // a bird, now and then, while the camera is close
    if (l > 0.35 && t >= this.nextBird) {
      if (this.nextBird > 0) playSfx('bird', 0.4 + 0.6 * l);
      this.nextBird = t + BIRD_MIN_MS + this.rnd() * BIRD_SPAN_MS;
    }
  }

  /** a golfer far off hits a ball: pan -1..1 (across the screen), near 0..1 (how close the camera is, less when he is off the screen). False when it was not made (too soon after the last, or nothing would be heard) */
  strike(pan: number, near: number): boolean {
    const t = this.now();
    if (t - this.lastStrike < STRIKE_GAP_MS || !(near > 0.05)) return false;
    this.lastStrike = t;
    return playRangeStrike(pan, near);
  }

  private build(): void {
    const a = this.core.audio(); if (!a) return;
    try {
      const { ctx, out } = a;
      const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
      src.buffer = noiseBuffer(ctx); src.loop = true;
      filter.type = 'bandpass'; filter.frequency.value = 650; filter.Q.value = 0.5;
      gain.gain.value = 0;
      src.connect(filter); filter.connect(gain); gain.connect(out);
      src.start(0, this.rnd() * 1.5);
      this.nodes = { src, filter, gain };
    } catch { this.nodes = null; }
  }
  /** takes the breeze down: its source stopped and its nodes let go */
  teardown(): void {
    const n = this.nodes; this.nodes = null; if (!n) return;
    try { n.src.stop(); n.src.disconnect(); n.filter.disconnect(); n.gain.disconnect(); } catch { /* ignore */ }
  }
}

/** the page's range ambience */
export const rangeAmbience = new RangeAmbience();
