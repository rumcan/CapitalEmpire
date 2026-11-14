// J11 (#1270): the effects by name. Everything that wants a sound calls one of these (or golfSound, for the golf view's messages): each knows its recipe
// (recipes.ts, at its level), its shortest gap and how loud it is, and goes through the one master bus (core.ts), so the effects' volume, the mutes, "nothing
// before the first click" and the burst thinning apply to all of them and no component builds an AudioContext of its own.
import { sound } from './core';
import type { Recipe } from './core';
import { GOLF_CLUBS, SURFACES, rangeStrike, recipeOf, trimmed, type GolfClub, type Surface } from './recipes';

/** every plain effect: its shortest gap (ms): the same sound is not made again inside it. The recipes are looked up by id at load (a typo throws at once) */
const GAPS = {
  click: 40, tick: 40, on: 40, off: 40, open: 90, close: 90,
  cash: 150, refuse: 300, chime: 1000, ding: 400,
  place: 300, bulldoze: 400, bird: 600,
  heart: 120, breath: 300, applause: 1500, groan: 1500,
} as const;
export type SfxName = keyof typeof GAPS;
export const SFX_NAMES = Object.keys(GAPS) as SfxName[];
const RECIPES = Object.fromEntries(SFX_NAMES.map(n => [n, recipeOf(n)])) as Record<SfxName, Recipe>;

/** plays an effect by name (v: 0..1, how strong); false when nothing was made (not unlocked yet, muted, inside its gap, a burst) */
export function playSfx(name: SfxName, v = 1): boolean { return sound.play(name, RECIPES[name], v, GAPS[name]); }
/** the same, as plain calls (the call sites read better: sfx.cash()) */
export const sfx = {
  click: () => playSfx('click'), tick: () => playSfx('tick'), on: () => playSfx('on'), off: () => playSfx('off'),
  open: () => playSfx('open'), close: () => playSfx('close'),
  /** a purchase or a payment */ cash: () => playSfx('cash'),
  /** a refused action */ refuse: () => playSfx('refuse'),
  /** the month's statement */ chime: () => playSfx('chime'),
  /** a tutorial step done */ ding: () => playSfx('ding'),
  /** something built or placed on the map */ place: () => playSfx('place'),
  /** something bulldozed */ bulldoze: () => playSfx('bulldoze'),
};

// ---------------------------------------------------------------- the map's range (a golfer far off hits a ball)

const STRIKE_PAN: Record<string, Recipe> = {};
/** a golfer's strike at the range, far off: pan -1..1 (where it is across the screen, in steps of a tenth), near 0..1 (how close the camera is) */
export function playRangeStrike(pan: number, near: number): boolean {
  const p = Number.isFinite(pan) ? Math.round(Math.max(-1, Math.min(1, pan)) * 10) / 10 : 0, key = String(p);
  const r = STRIKE_PAN[key] ?? (STRIKE_PAN[key] = trimmed('rangeStrike', rangeStrike(p)));
  return sound.play('rangeStrike', r, strengthOf(near, 0.5), 70);
}

// ---------------------------------------------------------------- the golf view (it sends messages; the host plays them)

const byClub = (kind: string): Record<GolfClub, Recipe> => Object.fromEntries(GOLF_CLUBS.map(c => [c, recipeOf(`${kind}-${c}`)])) as Record<GolfClub, Recipe>;
const SWISH = byClub('swish'), STRIKE = byClub('strike');
const LAND = Object.fromEntries(SURFACES.map(s => [s, recipeOf(`land-${s}`)])) as Record<Surface, Recipe>;
const CUP: Record<'drop' | 'lip', Recipe> = { drop: recipeOf('cup-drop'), lip: recipeOf('cup-lip') };

/** the four sounds a club makes, from the model's club id (driver, wood3, wood5, hybrid, iron4..iron9, pw, gw, sw, lw, putter); anything unknown is an iron */
export function clubClass(id: unknown): GolfClub {
  if (typeof id !== 'string') return 'iron';
  if (id === 'driver' || /^wood\d*$/.test(id)) return 'driver';
  if (id === 'putter') return 'putter';
  if (id === 'wedge' || /^(pw|gw|sw|lw)$/.test(id)) return 'wedge';
  return 'iron';
}
/** the surface a ball lands on, from the view's name for it (anything unknown is the fairway) */
export function surfaceOf(id: unknown): Surface { return typeof id === 'string' && (SURFACES as readonly string[]).includes(id) ? (id as Surface) : 'fairway'; }
/** a strength from a message: 0..1, and `dflt` for anything that is not a number */
export function strengthOf(p: unknown, dflt = 0.7): number { return typeof p === 'number' && Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : dflt; }

/** what the golf view sends for a sound (protocol3p.ts SoundMsg, the part of it that matters here) */
export interface GolfSoundMsg { k?: unknown; club?: unknown; mat?: unknown; p?: unknown; drop?: unknown }
export const GOLF_KINDS = ['swish', 'strike', 'tap', 'land', 'cup', 'heart', 'breath', 'applause', 'groan', 'mute'] as const;
/** plays one of the view's sounds (or, for 'mute', toggles the mute); false for anything that is not one (the message is not trusted: a wrong kind is ignored, a wrong club or surface is played as the nearest) */
export function golfSound(m: GolfSoundMsg): boolean {
  switch (m.k) {
    case 'swish': { const c = clubClass(m.club); return sound.play(`swish-${c}`, SWISH[c], strengthOf(m.p), 100); }
    case 'strike': { const c = clubClass(m.club); return sound.play(`strike-${c}`, STRIKE[c], strengthOf(m.p), 80); }
    case 'tap': return sound.play('strike-putter', STRIKE.putter, strengthOf(m.p, 0.4), 80);
    case 'land': { const s = surfaceOf(m.mat); return sound.play(`land-${s}`, LAND[s], strengthOf(m.p), 45); }
    case 'cup': { const d = m.drop === false ? 'lip' : 'drop'; return sound.play(`cup-${d}`, CUP[d], 1, 300); }
    case 'heart': return playSfx('heart', strengthOf(m.p, 1));
    case 'breath': return playSfx('breath', strengthOf(m.p, 1));
    case 'applause': return playSfx('applause', strengthOf(m.p, 0.6));
    case 'groan': return playSfx('groan');
    case 'mute': { const muted = sound.toggleMute(); if (!muted) playSfx('tick'); return true; } // (the Mute key, F8, pressed in the view: the page mutes everything, or lifts every mute)
    default: return false;
  }
}
