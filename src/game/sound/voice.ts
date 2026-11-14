// J11 (#1270): the tutorial's voice-over. When a tutorial or guide step opens, its voice plays (one at a time: a new step, Skip or the card going away stops it), under the
// effects' volume and its own Voice switch (Settings), never before the player's first click, with the music dipping under it. The files are made by
// scripts/jam/make-voice.mjs from exactly the text shown (voice-steps.ts: the key of a file is the step's id and a hash of its text) and listed in voice-manifest.json;
// each is fetched only when its step opens (an <audio> src), never bundled. The text stays on the screen as the caption. A step with no file, a missing file, a refused
// play: silence, and nothing else changes. With no files shipped (the manifest empty) the whole thing is absent, and Settings does not show the Voice switch.
import { sound as theSound, type SoundCore } from './core';
import { radio as theRadio } from './radio';
import { voiceKey } from './voice-steps';
import manifest from './voice-manifest.json';

export interface VoiceFile { file: string; bytes: number; seconds: number }
/** the voice files that were made, by key (src/game/sound/voice-manifest.json: written by scripts/jam/make-voice.mjs) */
export const VOICES: Readonly<Record<string, VoiceFile>> = (manifest as { voices: Record<string, VoiceFile> }).voices;

/** the part of an <audio> element the voice uses (so a test hands it a fake) */
export interface VoiceAudio {
  src: string; volume: number; currentTime: number; preload: string;
  play(): Promise<void> | void; pause(): void;
  addEventListener(type: 'ended' | 'error' | 'pause', fn: () => void): void;
}
export interface VoiceEnv {
  audio?: (() => VoiceAudio | null) | null;
  voices?: Readonly<Record<string, VoiceFile>>;
  base?: string;
  /** the music to dip while the voice speaks (absent: the page's radio; null: none) */
  ducker?: { duck(on: boolean): void } | null;
}

export class Voice {
  private a: VoiceAudio | null = null;
  private ducked = false;
  private current: string | null = null;
  private voices: Readonly<Record<string, VoiceFile>>;
  constructor(private core: SoundCore = theSound, private env: VoiceEnv = {}) {
    this.voices = env.voices ?? VOICES;
    core.subscribe(() => this.sync());
  }

  /** whether any voice files were shipped: Settings shows the Voice switch only then */
  available(): boolean { return Object.keys(this.voices).length > 0; }
  /** whether a file was made for this step's exact text */
  has(id: string, title: string, body: string): boolean { return voiceKey(id, title, body) in this.voices; }
  /** whether a voice is speaking now */
  get speaking(): boolean { return this.current !== null; }

  private ducker(): { duck(on: boolean): void } | null { return this.env.ducker === undefined ? theRadio : this.env.ducker; }
  private duck(on: boolean): void { if (on === this.ducked) return; this.ducked = on; try { this.ducker()?.duck(on); } catch { /* ignore */ } }
  private base(): string { return this.env.base ?? (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './'; }
  private deck(): VoiceAudio | null {
    if (this.a) return this.a;
    let a: VoiceAudio | null = null;
    try { a = this.env.audio === undefined ? (typeof Audio !== 'undefined' ? (new Audio() as unknown as VoiceAudio) : null) : this.env.audio ? this.env.audio() : null; } catch { a = null; }
    if (!a) return null;
    a.preload = 'none';
    const over = (): void => { this.current = null; this.duck(false); };
    a.addEventListener('ended', over); a.addEventListener('error', over);
    this.a = a; return a;
  }
  private sync(): void {
    if (!this.a) return;
    const v = this.core.voiceLevel();
    try { this.a.volume = Math.min(1, Math.max(0, v)); } catch { /* ignore */ }
    if (v <= 0 && this.current) this.stop(); // (the switch or the sound was turned off while it spoke)
  }

  /** a step opened: its voice plays, if there is a file for these words and sound is on and the player has clicked. True when it started */
  say(id: string, title: string, body: string): boolean {
    this.stop();
    const f = this.voices[voiceKey(id, title, body)];
    if (!f || !this.core.unlocked || this.core.voiceLevel() <= 0) return false;
    const a = this.deck(); if (!a) return false;
    a.src = this.base().replace(/\/?$/, '/') + f.file;
    this.sync();
    this.current = id; this.duck(true);
    try {
      const r = a.play();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => { this.current = null; this.duck(false); });
    } catch { this.current = null; this.duck(false); return false; }
    return true;
  }
  /** stops the voice (a new step, Skip, the card going away) */
  stop(): void {
    if (this.a && this.current !== null) { try { this.a.pause(); this.a.currentTime = 0; } catch { /* ignore */ } }
    this.current = null; this.duck(false);
  }
}

/** the page's voice */
export const voice = new Voice();
