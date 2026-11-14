// J11 (#1270): the sound core, one small module over Web Audio. It holds the settings in force (prefs.ts), makes the AudioContext, and plays the
// effects' recipes (recipes.ts) through one master bus: a gain (the effects' volume, or nothing when muted) into a gentle limiter into the speakers.
// The music is not here: the radio (radio.ts) plays files with an <audio> element and takes its volume from these settings.
//
// Rules:
//  1. Nothing makes sound, and no AudioContext exists, before the player's first click or key (browsers refuse it anyway): unlock() is called by
//     installSound's one-time listener and by nothing else.
//  2. Harmless without a page: under node there is no AudioContext, a hidden tab makes no sound, a context that is not running plays nothing (a sound
//     scheduled on a suspended context would all come out at once when it starts), a recipe that throws is swallowed. Every call is a no-op then.
//  3. Cheap: a recipe builds its few nodes when it is played and they free themselves when they end (no per-frame work, no pool to leak); each sound has
//     its own shortest gap, and a burst of more than BURST_MAX plays in BURST_MS is thinned, so a loop that calls a sound every frame cannot pile up.
import { clampVolume, effectiveMusic, effectiveSfx, effectiveVoice, loadSoundPrefs, saveSoundPrefs, volumeGain, type SoundPrefs } from './prefs';

/** a sound: builds its nodes on ctx, into out, to start at ctx time t; v (0..1) is how strong this one is */
export type Recipe = (ctx: BaseAudioContext, out: AudioNode, t: number, v: number) => void;

export interface SoundEnv {
  /** where the settings are kept: absent, this browser's localStorage; null: nowhere (a store of its own in the tests) */
  store?: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** the AudioContext class: absent, the page's own (none under node); null: none */
  AudioContext?: (new () => AudioContext) | null;
  /** whether the page is hidden (a hidden tab makes no sound); absent: the document's */
  hidden?: () => boolean;
  /** milliseconds for the rate limits; absent: performance.now */
  now?: () => number;
}

/** the master bus's gain on top of the effects' volume, and the thinning of a burst: at most BURST_MAX sounds in BURST_MS */
export const MASTER_GAIN = 0.9, BURST_MAX = 14, BURST_MS = 250;
/** the lead before a sound starts (s): so its first sample is not cut */
const LEAD = 0.004;

export class SoundCore {
  private prefs: SoundPrefs;
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private gestured = false;
  private subs = new Set<() => void>();
  private gestureSubs = new Set<() => void>();
  private last = new Map<string, number>();
  private ring = new Float64Array(BURST_MAX);
  private ringAt = 0;
  private visHooked = false;
  /** when (the rate limits' clock) the last sound was accepted: the UI hook holds a plain click back while something louder already answered it */
  lastPlayedAt = -Infinity;

  constructor(private env: SoundEnv = {}) {
    this.prefs = loadSoundPrefs(env.store);
    this.ring.fill(-Infinity);
  }

  // ---- the settings

  /** the settings in force (the same object until one changes: for useSyncExternalStore) */
  get(): SoundPrefs { return this.prefs; }
  /** tells fn when the settings change; returns the way to stop */
  subscribe(fn: () => void): () => void { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  private set(p: Partial<SoundPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    saveSoundPrefs(this.prefs, this.env.store);
    this.applyBus();
    for (const f of this.subs) { try { f(); } catch { /* a dead listener */ } }
  }
  /** sets the music's or the effects' volume; false (nothing changed) for anything that is not a finite number */
  setVolume(kind: 'music' | 'sfx', v: unknown): boolean {
    const n = clampVolume(v);
    if (n === null) return false;
    if (this.prefs[kind] !== n) this.set(kind === 'music' ? { music: n } : { sfx: n });
    return true;
  }
  /** the tutorial voice-over's switch */
  setVoice(on: boolean): void { if (this.prefs.voice !== !!on) this.set({ voice: !!on }); }
  /** mutes or unmutes the music, the effects, or everything ('all') */
  setMuted(kind: 'music' | 'sfx' | 'all', muted: boolean): void {
    if (kind === 'all') { if (this.prefs.muted !== muted) this.set({ muted }); }
    else if (kind === 'music') { if (this.prefs.musicMuted !== muted) this.set({ musicMuted: muted }); }
    else if (this.prefs.sfxMuted !== muted) this.set({ sfxMuted: muted });
  }
  /** the Mute key: everything off, or back on (unmuting also lifts the music's and the effects' own mutes, so a press never leaves silence behind) */
  toggleMute(): boolean {
    const p = this.prefs, on = !(p.muted || (p.musicMuted && p.sfxMuted));
    if (on) this.set({ muted: true }); else this.set({ muted: false, musicMuted: false, sfxMuted: false });
    return on;
  }
  /** whether everything is silent now (all muted, or both kinds muted) */
  get allMuted(): boolean { const p = this.prefs; return p.muted || (p.musicMuted && p.sfxMuted); }
  /** the music's volume as heard (0..1: 0 when muted), already shaped (volumeGain) */
  musicLevel(): number { return volumeGain(effectiveMusic(this.prefs)); }
  /** the effects' volume as heard */
  sfxLevel(): number { return volumeGain(effectiveSfx(this.prefs)); }
  /** the voice-over's volume as heard (the effects', or 0 with its switch off) */
  voiceLevel(): number { return volumeGain(effectiveVoice(this.prefs)); }

  // ---- the context

  private hidden(): boolean {
    if (this.env.hidden) return this.env.hidden();
    return typeof document !== 'undefined' && !!document.hidden;
  }
  private now(): number { return this.env.now ? this.env.now() : typeof performance !== 'undefined' ? performance.now() : Date.now(); }
  private ctor(): (new () => AudioContext) | null {
    if (this.env.AudioContext !== undefined) return this.env.AudioContext;
    const g = globalThis as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext };
    return g.AudioContext ?? g.webkitAudioContext ?? null;
  }
  /** whether the player has clicked or pressed a key yet */
  get unlocked(): boolean { return this.gestured; }
  /** tells fn at the first gesture (at once when it has come); the radio starts a remembered "on" this way */
  onGesture(fn: () => void): void { if (this.gestured) fn(); else this.gestureSubs.add(fn); }
  /** the first click or key: from now on there may be sound. Makes the context (once) and starts it; false when there is none to make (node, an old browser) */
  unlock(): boolean {
    if (!this.gestured) {
      this.gestured = true;
      const subs = [...this.gestureSubs]; this.gestureSubs.clear();
      for (const f of subs) { try { f(); } catch { /* a dead listener */ } }
    }
    if (this.ctx) { this.resume(); return true; }
    const AC = this.ctor();
    if (!AC) return false;
    try {
      const ctx = new AC(), bus = ctx.createGain(), lim = ctx.createDynamicsCompressor();
      lim.threshold.value = -8; lim.knee.value = 6; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
      bus.connect(lim); lim.connect(ctx.destination);
      this.ctx = ctx; this.bus = bus;
      this.applyBus(true);
      this.hookVisibility();
      this.resume();
      return true;
    } catch { this.ctx = null; this.bus = null; return false; }
  }
  private resume(): void {
    const c = this.ctx;
    if (!c || this.hidden() || c.state === 'running') return;
    try { const r = c.resume() as Promise<void> | undefined; r?.catch?.(() => { /* still blocked: the next gesture tries again */ }); } catch { /* ignore */ }
  }
  private hookVisibility(): void {
    if (this.visHooked || typeof document === 'undefined' || !document.addEventListener) return;
    this.visHooked = true;
    document.addEventListener('visibilitychange', () => {
      const c = this.ctx; if (!c) return;
      try { if (document.hidden) void c.suspend(); else if (this.gestured) void c.resume(); } catch { /* ignore */ }
    });
  }
  private applyBus(now = false): void {
    const c = this.ctx, b = this.bus; if (!c || !b) return;
    const g = volumeGain(effectiveSfx(this.prefs)) * MASTER_GAIN;
    try { if (now) b.gain.value = g; else b.gain.setTargetAtTime(g, c.currentTime, 0.02); } catch { /* ignore */ }
  }
  /** whether an effect would be heard now: the player has clicked, the context runs, the page shows, the effects are not muted */
  ready(): boolean {
    const c = this.ctx;
    if (!c || !this.gestured || this.hidden() || effectiveSfx(this.prefs) <= 0) return false;
    if (c.state !== 'running') { this.resume(); return false; }
    return true;
  }
  /** the context and the master bus, for a sound that keeps nodes of its own (the range's ambience); null when nothing would be heard */
  audio(): { ctx: AudioContext; out: AudioNode } | null { return this.ready() ? { ctx: this.ctx!, out: this.bus! } : null; }
  /** the context's clock now (s), 0 without a context */
  clock(): number { return this.ctx ? this.ctx.currentTime : 0; }

  // ---- playing

  /** plays a recipe through the master bus: false (nothing made) when it would not be heard, when its own shortest gap has not passed (gapMs), or in a burst */
  play(id: string, recipe: Recipe, v = 1, gapMs = 30): boolean {
    if (!this.ready()) return false;
    const now = this.now(), last = this.last.get(id);
    if (last !== undefined && now - last < gapMs) return false;
    if (now - this.ring[this.ringAt]! < BURST_MS) return false; // BURST_MAX plays are already inside the window (the ring starts at -Infinity: empty)
    this.ring[this.ringAt] = now; this.ringAt = (this.ringAt + 1) % BURST_MAX;
    this.last.set(id, now); this.lastPlayedAt = now;
    const ctx = this.ctx!;
    try { recipe(ctx, this.bus!, ctx.currentTime + LEAD, Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1))); return true; } catch { return false; }
  }
}

/** the page's sound */
export const sound = new SoundCore();

/** the first click or key unlocks the sound (once; the listeners go): call at boot. Returns the way to take the listeners away */
export function installSound(win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window, core: SoundCore = sound): () => void {
  if (!win) return () => { /* no page */ };
  const off = (): void => { win.removeEventListener('pointerdown', first, true); win.removeEventListener('keydown', first, true); };
  function first(e?: Event): void {
    // (a bare modifier key is not a gesture the browser counts: wait for a real one)
    const k = (e as KeyboardEvent | undefined)?.key;
    if (k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return;
    off(); core.unlock();
  }
  win.addEventListener('pointerdown', first, true);
  win.addEventListener('keydown', first, true);
  return off;
}
