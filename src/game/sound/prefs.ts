// J11 (#1270, the owner 2026-11-14: "add a music radio ... make sure we have uix sfx and some game sfx"): the sound settings, pure (no Web Audio, no DOM).
// Music and effects have a volume (0..1) and a mute each, and one switch silences both (the Mute key, the radio's speaker). Kept per browser
// (localStorage, every access in try/catch, as ui/uiScale.ts and ui/golf/money.ts do): a private window or blocked storage falls back to the defaults.
// core.ts holds the settings in force and plays; this file only reads, checks and writes them.

/** the localStorage key (the golf view, an iframe of the same page, never reads it: the host plays its sounds, see core.ts) */
export const SOUND_KEY = 'capitalempire.sound';

export interface SoundPrefs {
  /** everything off: music and effects (the Mute key, the radio's speaker) */
  muted: boolean;
  /** the music's volume and the effects' volume, 0..1 (the slider's position; the loudness follows volumeGain) */
  music: number;
  sfx: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  /** the tutorial's voice-over is on (it plays under the effects' volume and mute; its own switch in Settings) */
  voice: boolean;
}

export const SOUND_DEFAULTS: Readonly<SoundPrefs> = Object.freeze({ muted: false, music: 0.6, sfx: 0.8, musicMuted: false, sfxMuted: false, voice: true });

/** a volume held to 0..1 and to whole percents; null for anything that is not a finite number (NaN, Infinity, a word, nothing): the caller keeps what it had */
export function clampVolume(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** the loudness (a gain, 0..1) a slider position stands for: squared, so the lower half of the slider is not almost all of the range's loudness */
export function volumeGain(v: number): number {
  const x = clampVolume(v) ?? 0;
  return x * x;
}

/** the settings from stored text (the defaults for anything missing or bad, a field at a time; nothing throws) */
export function parseSoundPrefs(raw: string | null | undefined): SoundPrefs {
  const out: SoundPrefs = { ...SOUND_DEFAULTS };
  if (!raw) return out;
  let o: unknown;
  try { o = JSON.parse(raw); } catch { return out; }
  if (!o || typeof o !== 'object') return out;
  const r = o as Record<string, unknown>;
  const mus = clampVolume(r.music), fx = clampVolume(r.sfx);
  if (mus !== null) out.music = mus;
  if (fx !== null) out.sfx = fx;
  if (typeof r.muted === 'boolean') out.muted = r.muted;
  if (typeof r.musicMuted === 'boolean') out.musicMuted = r.musicMuted;
  if (typeof r.sfxMuted === 'boolean') out.sfxMuted = r.sfxMuted;
  if (typeof r.voice === 'boolean') out.voice = r.voice;
  return out;
}

/** the text to store */
export function serializeSoundPrefs(p: SoundPrefs): string {
  return JSON.stringify({ v: 1, muted: p.muted, music: p.music, sfx: p.sfx, musicMuted: p.musicMuted, sfxMuted: p.sfxMuted, voice: p.voice });
}

/** the effects' volume as heard: 0 when muted (all, or effects) */
export const effectiveSfx = (p: SoundPrefs): number => (p.muted || p.sfxMuted ? 0 : p.sfx);
/** the voice-over's volume as heard: the effects' volume, 0 when its own switch, the effects or everything is off */
export const effectiveVoice = (p: SoundPrefs): number => (p.voice ? effectiveSfx(p) : 0);
/** the music's volume as heard: 0 when muted (all, or music) */
export const effectiveMusic = (p: SoundPrefs): number => (p.muted || p.musicMuted ? 0 : p.music);

type ReadStore = Pick<Storage, 'getItem'> | null | undefined;
type WriteStore = Pick<Storage, 'setItem'> | null | undefined;
const pick = <T,>(s: T | null | undefined): T | null => { if (s !== undefined) return s; try { return (globalThis.localStorage as unknown as T) ?? null; } catch { return null; } };

/** the stored settings (the defaults when there are none, they are bad, or storage throws); s: a store of its own (tests), absent: this browser's */
export function loadSoundPrefs(s?: ReadStore): SoundPrefs {
  try { const st = pick(s); return parseSoundPrefs(st ? st.getItem(SOUND_KEY) : null); } catch { return { ...SOUND_DEFAULTS }; }
}
/** stores the settings (nothing when storage throws) */
export function saveSoundPrefs(p: SoundPrefs, s?: WriteStore): void {
  try { pick(s)?.setItem(SOUND_KEY, serializeSoundPrefs(p)); } catch { /* storage may be unavailable */ }
}
