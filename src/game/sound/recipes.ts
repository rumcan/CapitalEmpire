// J11 (#1270): the effects, made on the spot with Web Audio (no sound files): the UI's (a soft click, a tick, open and close, cash, a low "can't", the
// chimes), the map's (a thump when something is built, the bulldozer, a golfer's distant strike at the range) and the golf's (the swish and the strike
// of each club, the ball's landing on each surface, the putt dropping in the cup). Each is a Recipe (core.ts): it builds its few nodes on the context it
// is given, into the output it is given, and they free themselves when they end. The same functions are rendered offline by
// scripts/jam/sound-levels.mjs (peak, length, silence) and by the tests with a fake context (every node is stopped within the sound's length).
// Rules for the sounds: quiet and warm (the UI's peak is about -14 dBFS, the golf's -6 at most), nothing shrill (no tone above about 2 kHz that is
// not a quiet partial, a lowpass on the bright ones), every UI sound under 200 ms but the chimes.
import type { Recipe } from './core';

/** the randomness of the variations (the start of the noise, a tone's detune): a test or the level script makes it still */
export const rng = { next: (): number => Math.random() };
const FLOOR = 0.0001;
const MIN_PEAK = 2 * FLOOR;

const noiseBufs = new WeakMap<BaseAudioContext, AudioBuffer>();
/** two seconds of white noise (xorshift32: the same noise every time), made once per context */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseBufs.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const d = b.getChannelData(0); let s = 0x9e3779b9;
    for (let i = 0; i < d.length; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; d[i] = s / 2147483648 - 1; }
    noiseBufs.set(ctx, b);
  }
  return b;
}

export interface Tone {
  /** the pitch (Hz) at the start, and at the end of the sound (an exponential glide) */
  f0: number; f1?: number; type?: OscillatorType;
  /** when it starts after the sound's own start (s), its rise (s, default 4 ms), its fall (s) and its height (a gain, 0..1) */
  at?: number; attack?: number; decay: number; peak: number;
  /** a lowpass over it (Hz): takes the edge off a bright tone */
  lp?: number;
}
/** one oscillator with a rise and an exponential fall: osc -> (lowpass) -> gain -> out */
export function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: Tone): void {
  const osc = ctx.createOscillator(), g = ctx.createGain(), t0 = t + (o.at ?? 0), a = o.attack ?? 0.004, end = t0 + a + o.decay;
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(o.f1, end);
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(MIN_PEAK, o.peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.6; osc.connect(f); f.connect(g); } else osc.connect(g);
  g.connect(out);
  osc.start(t0); osc.stop(end + 0.02);
}

export interface Burst {
  /** the filter the noise goes through, and its centre (Hz) at the start and at the end (an exponential sweep), and its Q */
  filter: BiquadFilterType; f0: number; f1?: number; q?: number;
  at?: number; attack?: number; decay: number; peak: number;
}
/** a puff of filtered noise with a rise and an exponential fall: noise -> filter -> gain -> out */
export function burst(ctx: BaseAudioContext, out: AudioNode, t: number, o: Burst): void {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = t + (o.at ?? 0), a = o.attack ?? 0.002, end = t0 + a + o.decay;
  src.buffer = noiseBuffer(ctx);
  f.type = o.filter; f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f1, end);
  g.gain.setValueAtTime(FLOOR, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(MIN_PEAK, o.peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(FLOOR, end);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t0, rng.next() * 0.5); src.stop(end + 0.02);
}

/** the output a sound goes to when it stands left or right (-1..1); the out itself when the context has no panner */
function panned(ctx: BaseAudioContext, out: AudioNode, pan: number): AudioNode {
  if (!pan || typeof ctx.createStereoPanner !== 'function') return out;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); return p;
}

// ---------------------------------------------------------------- the UI (every one under 200 ms but the chimes)

/** a button: a soft pop with a faint tap on top (about 60 ms) */
export const click: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 780, f1: 500, attack: 0.002, decay: 0.05, peak: 0.16 * v, lp: 3200 });
  burst(ctx, out, t, { filter: 'bandpass', f0: 2300, q: 1.2, attack: 0.001, decay: 0.012, peak: 0.07 * v });
};
/** a tab, a slider's release, a toggle: a lighter, higher wooden tick (about 35 ms) */
export const tick: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { type: 'triangle', f0: 1350, f1: 1000, attack: 0.001, decay: 0.03, peak: 0.14 * v, lp: 3600 });
  tone(ctx, out, t, { f0: 2400, attack: 0.001, decay: 0.012, peak: 0.03 * v, lp: 3600 });
};
/** a tick box ticked: two quick blips going up (about 70 ms) */
export const on: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 880, attack: 0.002, decay: 0.03, peak: 0.13 * v, lp: 3200 });
  tone(ctx, out, t, { at: 0.035, f0: 1320, attack: 0.002, decay: 0.035, peak: 0.13 * v, lp: 3200 });
};
/** a tick box cleared: two quick blips going down (about 70 ms) */
export const off: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 1100, attack: 0.002, decay: 0.03, peak: 0.12 * v, lp: 3200 });
  tone(ctx, out, t, { at: 0.035, f0: 700, attack: 0.002, decay: 0.035, peak: 0.12 * v, lp: 3200 });
};
/** a card or menu opens: two soft notes a fifth apart, going up, with a breath of air (about 150 ms) */
export const open: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 523.25, attack: 0.006, decay: 0.07, peak: 0.15 * v, lp: 2800 });
  tone(ctx, out, t, { at: 0.055, f0: 783.99, attack: 0.006, decay: 0.09, peak: 0.15 * v, lp: 2800 });
  burst(ctx, out, t, { filter: 'bandpass', f0: 1000, f1: 2200, q: 0.7, attack: 0.03, decay: 0.1, peak: 0.02 * v });
};
/** a card or menu closes: two soft notes going down (about 120 ms) */
export const close: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 659.25, attack: 0.005, decay: 0.05, peak: 0.14 * v, lp: 2800 });
  tone(ctx, out, t, { at: 0.045, f0: 440, attack: 0.005, decay: 0.07, peak: 0.14 * v, lp: 2800 });
};
/** a purchase or a payment: a coin on a counter, two bright but soft bell notes (about 190 ms) */
export const cash: Recipe = (ctx, out, t, v) => {
  burst(ctx, out, t, { filter: 'highpass', f0: 3200, q: 0.7, attack: 0.001, decay: 0.008, peak: 0.05 * v });
  tone(ctx, out, t, { f0: 1046.5, attack: 0.002, decay: 0.15, peak: 0.12 * v, lp: 5000 });
  tone(ctx, out, t, { f0: 2512, attack: 0.002, decay: 0.05, peak: 0.02 * v, lp: 5000 });
  tone(ctx, out, t, { at: 0.06, f0: 1568, attack: 0.002, decay: 0.13, peak: 0.12 * v, lp: 5000 });
  tone(ctx, out, t, { at: 0.06, f0: 3763, attack: 0.002, decay: 0.045, peak: 0.02 * v, lp: 5000 });
};
/** a refused action: a low "uh-oh", two short falling notes, soft (about 160 ms) */
export const refuse: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { type: 'triangle', f0: 196, f1: 150, attack: 0.004, decay: 0.065, peak: 0.2 * v, lp: 700 });
  tone(ctx, out, t, { type: 'triangle', at: 0.075, f0: 165, f1: 118, attack: 0.004, decay: 0.08, peak: 0.2 * v, lp: 700 });
};
/** a music-box note: a sine with two quiet partials, falling away slowly */
function bell(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, at: number, decay: number, peak: number): void {
  tone(ctx, out, t, { at, f0: f, attack: 0.004, decay, peak, lp: 5000 });
  tone(ctx, out, t, { at, f0: f * 2, attack: 0.004, decay: decay * 0.5, peak: peak * 0.22, lp: 5000 });
  tone(ctx, out, t, { at, f0: f * 3.01, attack: 0.004, decay: decay * 0.25, peak: peak * 0.07, lp: 5000 });
}
/** the month's statement: a soft four-note arpeggio going up, C E G C, ringing out (about 1.7 s) */
export const chime: Recipe = (ctx, out, t, v) => {
  bell(ctx, out, t, 523.25, 0, 0.9, 0.1 * v);
  bell(ctx, out, t, 659.25, 0.11, 0.9, 0.1 * v);
  bell(ctx, out, t, 783.99, 0.22, 0.95, 0.1 * v);
  bell(ctx, out, t, 1046.5, 0.34, 1.3, 0.09 * v);
};
/** a tutorial step done: two bell notes, G then D above (about 0.7 s) */
export const ding: Recipe = (ctx, out, t, v) => {
  bell(ctx, out, t, 783.99, 0, 0.5, 0.11 * v);
  bell(ctx, out, t, 1174.66, 0.1, 0.55, 0.1 * v);
};

// ---------------------------------------------------------------- the map

/** something is built or placed: a low thump with a wooden knock and a puff of dust (about 200 ms) */
export const place: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 150, f1: 55, attack: 0.003, decay: 0.16, peak: 0.34 * v, lp: 420 });
  tone(ctx, out, t, { type: 'triangle', f0: 520, f1: 380, attack: 0.001, decay: 0.04, peak: 0.1 * v, lp: 1800 });
  burst(ctx, out, t, { filter: 'lowpass', f0: 900, f1: 400, q: 0.6, attack: 0.002, decay: 0.07, peak: 0.1 * v });
};
/** the bulldozer: an engine's grumble, a scrape of gravel and a few stones falling (about 360 ms) */
export const bulldoze: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { type: 'sawtooth', f0: 62, f1: 50, attack: 0.02, decay: 0.3, peak: 0.07 * v, lp: 220 });
  burst(ctx, out, t, { filter: 'lowpass', f0: 280, f1: 140, q: 0.7, attack: 0.012, decay: 0.28, peak: 0.3 * v });
  burst(ctx, out, t, { filter: 'bandpass', f0: 1700, f1: 700, q: 0.9, attack: 0.004, decay: 0.12, peak: 0.12 * v });
  for (let k = 0; k < 3; k++) burst(ctx, out, t, { at: 0.05 + k * 0.07 + rng.next() * 0.02, filter: 'bandpass', f0: 2600 - k * 500, q: 1.4, attack: 0.001, decay: 0.014, peak: 0.07 * v });
};
/** a golfer far off on the range hits a ball: a dull "tok" with an echo down the range; pan -1..1 (where it is on the screen), v the nearness (about 400 ms) */
export function rangeStrike(pan = 0): Recipe {
  return (ctx, out, t, v) => {
    const o = panned(ctx, out, pan);
    for (let k = 0; k < 3; k++) {
      const g = [1, 0.34, 0.14][k]! * v;
      tone(ctx, o, t, { at: k * 0.13, f0: 820, f1: 520, attack: 0.002, decay: 0.05, peak: 0.2 * g, lp: 2200 });
    }
    burst(ctx, o, t, { filter: 'bandpass', f0: 1900, q: 1, attack: 0.001, decay: 0.02, peak: 0.07 * v });
  };
}
/** a bird, now and then, on the range's ambience: two or three soft chirps (about 250 ms) */
export const bird: Recipe = (ctx, out, t, v) => {
  const f = 2300 + rng.next() * 700, n = 2 + Math.floor(rng.next() * 2);
  for (let k = 0; k < n; k++) tone(ctx, out, t, { at: k * 0.085, f0: f, f1: f * (1.1 + rng.next() * 0.25), attack: 0.008, decay: 0.05, peak: 0.05 * v, lp: 3400 });
};

// ---------------------------------------------------------------- the golf (the view's messages and the map's putts)

export type GolfClub = 'driver' | 'iron' | 'wedge' | 'putter';
export const GOLF_CLUBS: readonly GolfClub[] = ['driver', 'iron', 'wedge', 'putter'];
export type Surface = 'fairway' | 'green' | 'sand' | 'water' | 'rough' | 'rock';
export const SURFACES: readonly Surface[] = ['fairway', 'green', 'sand', 'water', 'rough', 'rock'];

/** the club through the air on the way down: a breath of wind that rises; longer and louder for a driver, a whisper for a putter (0.1 to 0.3 s) */
export function swish(club: GolfClub): Recipe {
  return (ctx, out, t, v) => {
    switch (club) {
      case 'driver': burst(ctx, out, t, { filter: 'bandpass', f0: 300, f1: 2000, q: 1.3, attack: 0.15, decay: 0.12, peak: 0.2 * v }); break;
      case 'iron': burst(ctx, out, t, { filter: 'bandpass', f0: 400, f1: 2400, q: 1.3, attack: 0.12, decay: 0.09, peak: 0.16 * v }); break;
      case 'wedge': burst(ctx, out, t, { filter: 'bandpass', f0: 500, f1: 2100, q: 1.2, attack: 0.1, decay: 0.08, peak: 0.12 * v }); break;
      default: burst(ctx, out, t, { filter: 'bandpass', f0: 700, f1: 1500, q: 1, attack: 0.05, decay: 0.05, peak: 0.04 * v });
    }
  };
}
/** the club meets the ball: a driver's deep "thwock" with a ring of metal, an iron's crisp click, a wedge's soft thud and brush, a putter's wooden "tock"; v the power */
export function strike(club: GolfClub): Recipe {
  return (ctx, out, t, v) => {
    const k = 0.55 + 0.45 * v; // (a soft shot is a quieter one, never a silent one)
    switch (club) {
      case 'driver':
        tone(ctx, out, t, { f0: 190, f1: 95, attack: 0.002, decay: 0.11, peak: 0.32 * k, lp: 700 });
        tone(ctx, out, t, { f0: 1850, attack: 0.001, decay: 0.09, peak: 0.07 * k, lp: 4000 });
        tone(ctx, out, t, { f0: 3100, attack: 0.001, decay: 0.05, peak: 0.025 * k, lp: 4000 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 1800, q: 0.8, attack: 0.001, decay: 0.03, peak: 0.16 * k });
        break;
      case 'iron':
        tone(ctx, out, t, { f0: 260, f1: 140, attack: 0.002, decay: 0.07, peak: 0.26 * k, lp: 900 });
        tone(ctx, out, t, { f0: 2400, attack: 0.001, decay: 0.06, peak: 0.05 * k, lp: 4000 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 2600, q: 0.9, attack: 0.001, decay: 0.022, peak: 0.2 * k });
        break;
      case 'wedge':
        tone(ctx, out, t, { f0: 220, f1: 120, attack: 0.002, decay: 0.08, peak: 0.22 * k, lp: 800 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 1400, q: 0.7, attack: 0.002, decay: 0.05, peak: 0.14 * k });
        break;
      default:
        tone(ctx, out, t, { f0: 980, f1: 760, attack: 0.001, decay: 0.035, peak: 0.22 * k, lp: 2600 });
        tone(ctx, out, t, { f0: 1960, attack: 0.001, decay: 0.02, peak: 0.05 * k, lp: 3500 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 3000, q: 1.1, attack: 0.001, decay: 0.01, peak: 0.1 * k });
    }
  };
}
/** the ball lands, or bounces: a thud on the fairway, a soft pat on the green, a "fumph" in sand, a plop and a splash in water, a rustle in the rough, a knock
 *  on rock; v how hard it came down */
export function land(surface: Surface): Recipe {
  return (ctx, out, t, v) => {
    const k = 0.4 + 0.6 * v;
    switch (surface) {
      case 'fairway':
        tone(ctx, out, t, { f0: 130, f1: 60, attack: 0.003, decay: 0.09, peak: 0.26 * k, lp: 500 });
        burst(ctx, out, t, { filter: 'lowpass', f0: 1400, f1: 600, q: 0.6, attack: 0.002, decay: 0.08, peak: 0.1 * k });
        break;
      case 'green':
        tone(ctx, out, t, { f0: 190, f1: 100, attack: 0.003, decay: 0.07, peak: 0.18 * k, lp: 600 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 2200, q: 0.8, attack: 0.001, decay: 0.03, peak: 0.05 * k });
        break;
      case 'sand':
        burst(ctx, out, t, { filter: 'bandpass', f0: 900, f1: 400, q: 0.7, attack: 0.004, decay: 0.16, peak: 0.2 * k });
        tone(ctx, out, t, { f0: 90, f1: 55, attack: 0.004, decay: 0.1, peak: 0.1 * k, lp: 300 });
        break;
      case 'water':
        tone(ctx, out, t, { f0: 420, f1: 900, attack: 0.004, decay: 0.1, peak: 0.24 * k, lp: 1600 });
        burst(ctx, out, t, { at: 0.01, filter: 'bandpass', f0: 1600, f1: 500, q: 0.7, attack: 0.01, decay: 0.3, peak: 0.16 * k });
        break;
      case 'rough':
        burst(ctx, out, t, { filter: 'bandpass', f0: 1100, f1: 700, q: 0.5, attack: 0.006, decay: 0.18, peak: 0.14 * k });
        tone(ctx, out, t, { f0: 100, f1: 60, attack: 0.003, decay: 0.06, peak: 0.12 * k, lp: 400 });
        break;
      default:
        tone(ctx, out, t, { type: 'triangle', f0: 900, f1: 600, attack: 0.001, decay: 0.04, peak: 0.2 * k, lp: 2600 });
        burst(ctx, out, t, { filter: 'bandpass', f0: 3500, q: 1, attack: 0.001, decay: 0.015, peak: 0.1 * k });
    }
  };
}
/** the putt reaches the cup: dropped (two ticks against the cup, then a plop) or lipped out (the ticks and a little "tsk") (about 250 ms) */
export function cup(kind: 'drop' | 'lip'): Recipe {
  return (ctx, out, t, v) => {
    tone(ctx, out, t, { type: 'triangle', f0: 1700, f1: 1400, attack: 0.001, decay: 0.015, peak: 0.12 * v, lp: 3000 });
    tone(ctx, out, t, { type: 'triangle', at: 0.055, f0: 1400, f1: 1100, attack: 0.001, decay: 0.015, peak: 0.1 * v, lp: 3000 });
    if (kind === 'drop') tone(ctx, out, t, { at: 0.1, f0: 480, f1: 170, attack: 0.004, decay: 0.14, peak: 0.22 * v, lp: 1200 });
    else burst(ctx, out, t, { at: 0.1, filter: 'bandpass', f0: 2600, q: 1.2, attack: 0.002, decay: 0.05, peak: 0.05 * v });
  };
}
/** the heartbeat while a full shot is charged (a "lub-dub") and the breath drawn in on release: the view's marksman's shot */
export const heart: Recipe = (ctx, out, t, v) => {
  tone(ctx, out, t, { f0: 64, f1: 38, attack: 0.012, decay: 0.16, peak: 0.34 * v, lp: 200 });
  tone(ctx, out, t, { at: 0.17, f0: 54, f1: 34, attack: 0.012, decay: 0.2, peak: 0.24 * v, lp: 200 });
};
export const breath: Recipe = (ctx, out, t, v) => {
  burst(ctx, out, t, { filter: 'bandpass', f0: 420, f1: 2600, q: 1.1, attack: 0.3, decay: 0.12, peak: 0.13 * v });
};

// ---------------------------------------------------------------- the lists (the level script and the tests walk them)

export interface SoundInfo {
  id: string; recipe: Recipe; group: 'ui' | 'map' | 'golf';
  /** the longest it may last (ms): 200 for the UI's but the chimes */
  maxMs: number;
}
/** every sound, by id */
export const SOUNDS: readonly SoundInfo[] = [
  { id: 'click', recipe: click, group: 'ui', maxMs: 200 }, { id: 'tick', recipe: tick, group: 'ui', maxMs: 200 },
  { id: 'on', recipe: on, group: 'ui', maxMs: 200 }, { id: 'off', recipe: off, group: 'ui', maxMs: 200 },
  { id: 'open', recipe: open, group: 'ui', maxMs: 200 }, { id: 'close', recipe: close, group: 'ui', maxMs: 200 },
  { id: 'cash', recipe: cash, group: 'ui', maxMs: 200 }, { id: 'refuse', recipe: refuse, group: 'ui', maxMs: 200 },
  { id: 'chime', recipe: chime, group: 'ui', maxMs: 2000 }, { id: 'ding', recipe: ding, group: 'ui', maxMs: 1000 },
  { id: 'place', recipe: place, group: 'map', maxMs: 400 }, { id: 'bulldoze', recipe: bulldoze, group: 'map', maxMs: 500 },
  { id: 'rangeStrike', recipe: rangeStrike(0), group: 'map', maxMs: 600 }, { id: 'bird', recipe: bird, group: 'map', maxMs: 500 },
  ...GOLF_CLUBS.map((c): SoundInfo => ({ id: `swish-${c}`, recipe: swish(c), group: 'golf', maxMs: 450 })),
  ...GOLF_CLUBS.map((c): SoundInfo => ({ id: `strike-${c}`, recipe: strike(c), group: 'golf', maxMs: 300 })),
  ...SURFACES.map((s): SoundInfo => ({ id: `land-${s}`, recipe: land(s), group: 'golf', maxMs: 500 })),
  { id: 'cup-drop', recipe: cup('drop'), group: 'golf', maxMs: 400 }, { id: 'cup-lip', recipe: cup('lip'), group: 'golf', maxMs: 400 },
  { id: 'heart', recipe: heart, group: 'golf', maxMs: 500 }, { id: 'breath', recipe: breath, group: 'golf', maxMs: 700 },
];
