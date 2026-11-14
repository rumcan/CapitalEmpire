// J11 (#1270; the owner, 2026-11-14: "add a music radio"): the radio, ported from TrickOrTreat's (src/game/sound/radio.ts: an <audio> deck, play and next, its volume its
// own knob, the track list from a manifest) and cut down to one station: a few free tracks that suit a sunny 1985 small-town golf course (tracks.json, made by
// scripts/jam/make-music.mjs from CC0 pieces; every file is in docs/jam/AUDIO-CREDITS.md). Rules:
//   1. Nothing plays, and nothing is fetched, before the player turns it on: a new player's radio is OFF. The music files are never in the page's JavaScript: each is
//      one <audio> src, set when it is first wanted (preload none), so a player who never turns the radio on never downloads a byte of music.
//   2. "On" is remembered (this browser's storage, with the track): the next visit starts it at the player's first click or key (a browser refuses sound before
//      one), never before. A play the browser refuses waits for the next click.
//   3. Its volume and mute are the sound settings' (core.ts: Music, and the one Mute): the radio holds no volume of its own. A hidden tab is silent. The tutorial's
//      voice ducks it (duck).
//   4. Garnish never breaks the game: no Audio in this environment, a missing file, a refused play all end in silence; a file that will not load skips to the next track,
//      and after every track has failed it rests (error) until it is turned on again.
import { sound as theSound, type SoundCore } from './core';
import manifest from './tracks.json';

export interface Track { id: string; title: string; artist: string; licence: string; page: string; file: string; seconds: number; bytes: number }
/** the radio's tracks, in playing order (src/game/sound/tracks.json) */
export const TRACKS: readonly Track[] = manifest.tracks;

/** where the radio's state is kept in this browser (the sound settings, music volume and mute, are core.ts's own) */
export const RADIO_KEY = 'capitalempire.radio';
/** a new player's radio: off. The owner's rule is that nothing downloads before the radio is turned on */
export const RADIO_DEFAULT_ON = false;
/** how far the tutorial's voice pulls the music down while it speaks (a share of its volume) */
export const DUCK_TO = 0.3;

export interface RadioState { on: boolean; id: string | null }
/** the state from stored text (off with no track for anything missing or bad; a track that is no longer in the list is forgotten) */
export function parseRadio(raw: string | null | undefined, tracks: readonly Track[] = TRACKS): RadioState {
  const out: RadioState = { on: RADIO_DEFAULT_ON, id: null };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as { on?: unknown; id?: unknown } | null;
    if (!o || typeof o !== 'object') return out;
    if (typeof o.on === 'boolean') out.on = o.on;
    if (typeof o.id === 'string' && tracks.some(t => t.id === o.id)) out.id = o.id;
  } catch { /* bad text: the defaults */ }
  return out;
}
export function serializeRadio(s: RadioState): string { return JSON.stringify({ v: 1, on: s.on, id: s.id }); }

/** the track after (dir 1) or before (dir -1) i in a list of n, wrapping round; 0 for a list with nothing in it or an index that is no number */
export function nextIndex(i: number, n: number, dir: 1 | -1 = 1): number {
  if (!(n > 0)) return 0;
  const k = Number.isFinite(i) ? Math.floor(i) : 0;
  return (((k + dir) % n) + n) % n;
}

/** the part of an <audio> element the radio uses (so a test hands it a fake) */
export interface AudioLike {
  src: string; volume: number; currentTime: number; paused: boolean; preload: string;
  play(): Promise<void> | void; pause(): void;
  addEventListener(type: 'ended' | 'error' | 'playing' | 'pause', fn: () => void): void;
}
export interface RadioEnv {
  /** makes the <audio> element: absent, the page's own (none under node); null: none */
  audio?: (() => AudioLike | null) | null;
  /** where the state is kept: absent, this browser's localStorage; null: nowhere */
  store?: Pick<Storage, 'getItem' | 'setItem'> | null;
  tracks?: readonly Track[];
  /** the folder the files are under (the page's base: './' in the build); absent: Vite's BASE_URL */
  base?: string;
  hidden?: () => boolean;
  /** a place to hear the next click on, for a play the browser refused (absent: the page's window; null: none) */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null;
}

export interface RadioView {
  /** the player wants music (turned on, and remembered) */ on: boolean;
  /** the music is playing now (false while it waits for a click, loads or has failed) */ playing: boolean;
  /** every track failed to load: it rests until it is turned on again */ error: boolean;
  /** the track it is on, and its place in the list */ track: Track | null; index: number; count: number;
}

export class Radio {
  private state: RadioState;
  private audio: AudioLike | null = null;
  private idx = 0;
  private playing = false;
  private error = false;
  private failures = 0;
  private ducks = 0;
  private view: RadioView;
  private subs = new Set<() => void>();
  private waiting = false;
  private tracks: readonly Track[];

  constructor(private core: SoundCore = theSound, private env: RadioEnv = {}) {
    this.tracks = env.tracks ?? TRACKS;
    this.state = parseRadio(this.read(), this.tracks);
    this.idx = Math.max(0, this.tracks.findIndex(t => t.id === this.state.id));
    this.view = this.makeView();
    core.subscribe(() => this.syncVolume());
    if (typeof document !== 'undefined' && document.addEventListener && !env.hidden) document.addEventListener('visibilitychange', () => this.sync());
    // a remembered "on" starts at the first click or key, not before
    if (this.state.on && this.tracks.length) core.onGesture(() => this.start());
  }

  // ---- state

  private read(): string | null { try { const s = this.env.store === undefined ? globalThis.localStorage : this.env.store; return s ? s.getItem(RADIO_KEY) : null; } catch { return null; } }
  private save(): void { try { const s = this.env.store === undefined ? globalThis.localStorage : this.env.store; s?.setItem(RADIO_KEY, serializeRadio(this.state)); } catch { /* storage may be unavailable */ } }
  private makeView(): RadioView { const t = this.tracks[this.idx] ?? null; return { on: this.state.on, playing: this.playing, error: this.error, track: t, index: this.idx, count: this.tracks.length }; }
  private changed(): void {
    const v = this.makeView(), o = this.view;
    if (v.on === o.on && v.playing === o.playing && v.error === o.error && v.index === o.index && v.track === o.track && v.count === o.count) return; // (the same object until something changed: useSyncExternalStore)
    this.view = v; for (const f of this.subs) { try { f(); } catch { /* a dead listener */ } }
  }
  /** the radio now (the same object until it changes) */
  get(): RadioView { return this.view; }
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }

  // ---- the player

  private hidden(): boolean { return this.env.hidden ? this.env.hidden() : typeof document !== 'undefined' && !!document.hidden; }
  private target(): number { return this.hidden() ? 0 : Math.min(1, Math.max(0, this.core.musicLevel() * (this.ducks > 0 ? DUCK_TO : 1))); }
  private syncVolume(): void { if (this.audio) { try { this.audio.volume = this.target(); } catch { /* ignore */ } } }
  /** sets the deck's volume from the settings now (they tell the radio themselves; a tab that is shown or hidden calls this) */
  sync(): void { this.syncVolume(); }
  private base(): string { return this.env.base ?? (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'; }
  /** the address of a track's file */
  urlOf(t: Track): string { return this.base().replace(/\/?$/, '/') + t.file; }

  private deck(): AudioLike | null {
    if (this.audio) return this.audio;
    let a: AudioLike | null = null;
    try { a = this.env.audio === undefined ? (typeof Audio !== 'undefined' ? (new Audio() as unknown as AudioLike) : null) : this.env.audio ? this.env.audio() : null; } catch { a = null; }
    if (!a) return null;
    a.preload = 'none';
    a.addEventListener('playing', () => { this.playing = true; this.failures = 0; this.error = false; this.changed(); });
    a.addEventListener('pause', () => { this.playing = false; this.changed(); });
    a.addEventListener('ended', () => { if (this.state.on) this.step(1, true); });
    a.addEventListener('error', () => this.failed());
    this.audio = a; this.syncVolume();
    return a;
  }

  /** loads the track the radio is on and plays it (the player has clicked, or a remembered "on" is waiting for the first click) */
  private start(): void {
    if (!this.state.on || !this.tracks.length) return;
    if (!this.core.unlocked) { if (!this.waiting) { this.waiting = true; this.core.onGesture(() => { this.waiting = false; this.start(); }); } return; }
    const a = this.deck(), t = this.tracks[this.idx];
    if (!a || !t) return;
    this.error = false;
    const url = this.urlOf(t);
    if (!a.src || !a.src.endsWith(t.file)) { a.src = url; try { a.currentTime = 0; } catch { /* nothing loaded yet */ } }
    this.syncVolume();
    let r: Promise<void> | void;
    try { r = a.play(); } catch { r = undefined; }
    if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.refused());
    this.changed();
  }
  /** the browser refused the play (no click yet that it counts): the next click tries again */
  private refused(): void {
    this.playing = false; this.changed();
    const w = this.env.win === undefined ? (typeof window !== 'undefined' ? window : null) : this.env.win;
    if (!w || this.waiting) return;
    this.waiting = true;
    const retry = (): void => { w.removeEventListener('pointerdown', retry, true); w.removeEventListener('keydown', retry, true); this.waiting = false; this.start(); };
    w.addEventListener('pointerdown', retry, true); w.addEventListener('keydown', retry, true);
  }
  /** a file that will not load: the next track, and after every track has failed, rest */
  private failed(): void {
    if (this.error) return; // (resting: a stray error from the dead deck does not start the round again)
    this.playing = false; this.failures++;
    if (this.failures >= Math.max(1, this.tracks.length)) { this.error = true; this.failures = 0; this.changed(); return; }
    this.step(1, true);
  }
  private step(dir: 1 | -1, play: boolean): void {
    this.idx = nextIndex(this.idx, this.tracks.length, dir);
    this.state = { ...this.state, id: this.tracks[this.idx]?.id ?? null }; this.save();
    this.changed();
    if (play) this.start();
  }

  // ---- what the player does

  /** turns the radio on (a click or a key is the gesture) and plays the track it is on */
  turnOn(): void { this.state = { ...this.state, on: true, id: this.tracks[this.idx]?.id ?? null }; this.save(); this.error = false; this.failures = 0; this.changed(); this.start(); }
  /** turns it off: the music stops (the track keeps its place for the next time) */
  turnOff(): void { this.state = { ...this.state, on: false }; this.save(); try { this.audio?.pause(); } catch { /* ignore */ } this.playing = false; this.changed(); }
  toggle(): void { if (this.state.on) this.turnOff(); else this.turnOn(); }
  /** the next track (wrapping round), playing: the radio turns on if it was off */
  next(): void { this.state = { ...this.state, on: true }; this.error = false; this.failures = 0; this.step(1, true); }
  /** the track before it */
  prev(): void { this.state = { ...this.state, on: true }; this.error = false; this.failures = 0; this.step(-1, true); }
  /** the tutorial's voice starts (true) or ends (false): the music dips under it */
  duck(on: boolean): void { this.ducks = Math.max(0, this.ducks + (on ? 1 : -1)); this.syncVolume(); }
}

/** the page's radio */
export const radio = new Radio();
