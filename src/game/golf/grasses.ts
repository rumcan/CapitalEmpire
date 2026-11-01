// T271 (#812; the owner, 2026-10-29: "I would like to be able to create my own grass preset. option 9 should be create your own under shape by
// hand"): the course's own grasses. A custom grass is a name, the surface it plays as (fairway, first cut, rough, long grass or fescue: how the
// ball lies and how fast it grows), a painted grass family at a scale and an exposure (never a tint: the owner's rule, no flat colour washes),
// mowing stripes for a fairway-like one, and its edges (Border: a first cut band; Round off; Shadow). It lives in the game save
// (GolfSave.grasses), at most MAX_GRASSES, each in a slot k (1..8) that the course grid's look layer names per cell (ext/course-grid Grid.look):
// the cell's surf holds the surface it plays as, so play, growth and costs read it as that surface; the drawn course sees slot k as draw id
// grassId(k), a surface of its own. Pure: no DOM, importable from node tests.
import { MAX_GRASSES, SURF, grassId } from '../ext/course-grid';
import { BORDER_MAX_M, clampBorder } from '../ext/course-grid/patch';
import type { CourseLooks } from '../ext/course-grid/patch';
import type { CourseTex } from '../ground-protocol';
import { exposed, exposureOf } from '../exposure';
import { FAMILIES, familyById } from '../painted-families';
import type { GolfSurface } from './types';
import type { BrushKind, PaintTex } from '../paint';
import type { PuckBand } from '../course-look';
import type { PuckStyle } from '../ext/course-cursor';

/** what a custom grass plays as */
export type GrassPlay = 'fairway' | 'firstCut' | 'rough' | 'longGrass' | 'fescue';
/** the plays in the editor's order, with their names */
export const GRASS_PLAYS: readonly { play: GrassPlay; name: string; note: string }[] = [
  { play: 'fairway', name: 'Fairway', note: 'a clean lie; grows in over 3 months' },
  { play: 'firstCut', name: 'First cut', note: 'a little grass behind the ball; 2 months' },
  { play: 'rough', name: 'Rough', note: 'the rough\'s lie; 2 months' },
  { play: 'longGrass', name: 'Long grass', note: 'the deep grass lie; 2 months' },
  { play: 'fescue', name: 'Fescue', note: 'the wild fescue lie; 3 months' },
];
/** the course grid surface each play's cells hold (ext/course-grid SURF): the first cut has no surface of its own (it is a band round the
 *  fairway), so its cells are rough, which grows in the same 2 months and rubs out the same way; the lie reads the grass (golfSurfaceOf) */
export const PLAY_SURF: Readonly<Record<GrassPlay, number>> = { fairway: SURF.fairway, firstCut: SURF.rough, rough: SURF.rough, longGrass: SURF.longGrass, fescue: SURF.fescue };
/** the golf surface a custom grass plays as (the lie, the grass care, the price) */
export const golfSurfaceOf = (p: GrassPlay): GolfSurface => p;
/** whether a play takes mowing stripes (a fairway-like grass: the fairway and the first cut) */
export const stripesOk = (p: GrassPlay) => p === 'fairway' || p === 'firstCut';
/** the hairline Shadow a new grass starts at (course-walls SHADOW_HAIRLINE) */
const SHADOW_START = 0.15;

/** a custom grass (GolfSave.grasses): its slot k, name, play, painted family, scale, exposure (saved as a tone, exposure.ts: tone 0 none,
 *  1 darker at toneAmt, 2 lighter), mowing stripes, Border (metres: 0 none, else a first cut band that wide), Round off and its Smoothness,
 *  and Shadow (0 none .. 1 strong) */
/** family: a painted grass family, or (the owner, 2026-10-31: My looks merged into Create your own) any texture: a texture preset (preset:<id>)
 *  or the player's own uploaded picture (upload:<hash>); angle: its turn in degrees (a painted family is never turned: its light stays upper right) */
export interface CustomGrass { k: number; name: string; plays: GrassPlay; family: string; scale: number; angle: number; tone: 0 | 1 | 2; toneAmt: number; stripes: boolean; border: number; round: boolean; smooth: number; shadow: number;
  /** its Border band's own texture (as family: a painted grass, a preset or an upload), scale, angle and exposure (the owner, 2026-10-31: "you
   *  cant set a border in the create your own section"); absent: the course's first cut */
  btex?: string; bscale?: number; bangle?: number; btone?: 0 | 1 | 2; btoneAmt?: number;
  /** T285: its grass length (1 the green's cut .. 5 the fescue); absent: its play's (PLAY_LENGTH) */
  length?: number }
/** T285: a play's grass length, a new grass's start */
export const PLAY_LENGTH: Readonly<Record<GrassPlay, number>> = { fairway: 2, firstCut: 3, rough: 3, longGrass: 4, fescue: 5 };

/** the painted grass families the editor offers (every painted family of kind grass), in the registry's order */
export const GRASS_FAMILIES: readonly { id: string; name: string }[] = FAMILIES.filter(f => f.kind === 'grass').map(f => ({ id: f.id, name: f.name }));
/** whether a family id is a painted grass family */
export const isGrassFamily = (id: string) => familyById(id)?.kind === 'grass';
/** whether an id is a texture a custom grass may wear: a painted grass family, a texture preset or an uploaded picture */
export const isGrassTexture = (id: string) => isGrassFamily(id) || /^preset:[a-z0-9-]{1,40}$/.test(id) || /^upload:[0-9a-f]{12}$/.test(id);
/** the texture id a custom grass is laid with: own:<play>:<family> (painted-surfaces lookOfTex lays the family as painted, no tint, no tone;
 *  grass-shine shineGroup reads the play: the grass shines as the surface it plays as) */
export const grassTex = (g: Pick<CustomGrass, 'plays' | 'family'>) => (isGrassFamily(g.family) ? `own:${g.plays}:${g.family}` : g.family);
/** the family and play a custom grass texture id names, or null when it is not one */
export function ownTex(tex: string): { play: GrassPlay; family: string } | null {
  if (!tex.startsWith('own:')) return null;
  const i = tex.indexOf(':', 4); if (i < 0) return null;
  const play = tex.slice(4, i) as GrassPlay;
  return PLAY_SURF[play] !== undefined ? { play, family: tex.slice(i + 1) } : null;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
/** the longest name kept */
export const GRASS_NAME_MAX = 24;

/** a new grass's starting values in slot k (a fairway-like grass in the given family, banded with a 2 m first cut as the fairway is) */
export function newGrass(k: number, family: string, n = k): CustomGrass {
  return { k, name: `My grass ${n}`, plays: 'fairway', family, scale: 1, angle: 0, tone: 0, toneAmt: 0.35, stripes: true, border: 2, round: true, smooth: 1, shadow: SHADOW_START };
}
/** a grass held to its ranges (a bad family falls back to `fallback`); null when it is not one at all (no slot, no play) */
export function clampGrass(v: unknown, fallback = GRASS_FAMILIES[0]?.id ?? 'emerald-medium'): CustomGrass | null {
  const o = v as Partial<CustomGrass> | null;
  if (!o || typeof o !== 'object') return null;
  const k = o.k; if (typeof k !== 'number' || !Number.isInteger(k) || k < 1 || k > MAX_GRASSES) return null;
  const plays = o.plays as GrassPlay; if (PLAY_SURF[plays] === undefined) return null;
  const name = (typeof o.name === 'string' ? o.name.trim().slice(0, GRASS_NAME_MAX) : '') || `My grass ${k}`;
  const family = typeof o.family === 'string' && isGrassTexture(o.family) ? o.family : fallback;
  const tone = o.tone === 1 || o.tone === 2 ? o.tone : 0;
  const band = typeof o.btex === 'string' && isGrassTexture(o.btex) ? { btex: o.btex, bscale: r3(clamp(o.bscale, 0.25, 4, 1)), bangle: r3(clamp(o.bangle, -180, 180, 0)), btone: (o.btone === 1 || o.btone === 2 ? o.btone : 0) as 0 | 1 | 2, btoneAmt: r3(clamp(o.btoneAmt, 0, 1, 0.35)) } : {};
  return { k, name, plays, family, scale: r3(clamp(o.scale, 0.25, 4, 1)), angle: r3(clamp(o.angle, -180, 180, 0)), tone, toneAmt: r3(clamp(o.toneAmt, 0, 1, 0.35)), stripes: !!o.stripes && stripesOk(plays),
    border: r3(clampBorder(clamp(o.border, 0, BORDER_MAX_M, 0))), round: !!o.round, smooth: r3(clamp(o.smooth, 0, 1, 0.5)), shadow: r3(clamp(o.shadow, 0, 1, SHADOW_START)), ...band,
    ...(typeof o.length === 'number' && Number.isFinite(o.length) ? { length: Math.min(5, Math.max(1, Math.round(o.length))) } : {}) };
}
/** the grasses from a save: each well formed one, one per slot (the first wins), by slot; [] for none (every older save) */
export function normalizeGrasses(raw: unknown): CustomGrass[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomGrass[] = [], seen = new Set<number>();
  for (const v of raw) { const g = clampGrass(v); if (g && !seen.has(g.k)) { seen.add(g.k); out.push(g); } }
  return out.sort((a, b) => a.k - b.k);
}
/** the lowest free slot (1..MAX_GRASSES), or 0 when every slot is taken */
export function freeSlot(list: readonly Pick<CustomGrass, 'k'>[]): number {
  for (let k = 1; k <= MAX_GRASSES; k++) if (!list.some(g => g.k === k)) return k;
  return 0;
}
/** a grass's fill as a course texture: its family at its scale, with its exposure when it has one (a texture, never a tint) */
export function grassCourseTex(g: CustomGrass): CourseTex {
  const x = exposureOf(g.tone, g.toneAmt);
  return { tex: grassTex(g), sc: g.scale, a: isGrassFamily(g.family) ? 0 : g.angle ?? 0, ...(exposed(x) ? { x } : {}) };
}

/** a grass's Border band as a course texture: its own texture at its scale, angle and exposure, else the course's first cut */
export function grassBandTex(g: CustomGrass, firstCut: CourseTex): CourseTex {
  if (!g.btex) return firstCut;
  const x = exposureOf(g.btone ?? 0, g.btoneAmt ?? 0.35), fam = isGrassFamily(g.btex);
  return { tex: fam ? `own:${g.plays}:${g.btex}` : g.btex, sc: g.bscale ?? 1, a: fam ? 0 : g.bangle ?? 0, ...(exposed(x) ? { x } : {}) };
}

/** what CourseLooks carries for the custom grasses, by draw id: each one's fill, its band (the course's first cut), its Border, Shadow and
 *  Round off, the surface it plays as (base) and the ids with mowing stripes. photo: lay each in its play's own photo texture (the dev
 *  server's ?grass=photo, where no painted family is laid) */
export function grassLooks(list: readonly CustomGrass[], firstCut: CourseTex, photo = false): Required<Pick<CourseLooks, 'base'>> & Pick<CourseLooks, 'stripes'> & { length: (number | undefined)[]; surf: (CourseTex | undefined)[]; band: (CourseTex | undefined)[]; border: (number | undefined)[]; shadow: (number | undefined)[]; round: (number | undefined)[] } {
  const surf: (CourseTex | undefined)[] = [], band: (CourseTex | undefined)[] = [], border: (number | undefined)[] = [], shadow: (number | undefined)[] = [], round: (number | undefined)[] = [], base: (number | undefined)[] = [], stripes: number[] = [], length: (number | undefined)[] = [];
  for (const g of list) {
    const id = grassId(g.k), t = grassCourseTex(g);
    surf[id] = photo ? { ...t, tex: PHOTO_TEX[g.plays] } : t; band[id] = grassBandTex(g, firstCut); border[id] = g.border; shadow[id] = g.shadow; base[id] = PLAY_SURF[g.plays];
    if (g.round) round[id] = g.smooth;
    length[id] = g.length ?? PLAY_LENGTH[g.plays];
    if (g.stripes && stripesOk(g.plays)) stripes.push(id);
  }
  return { surf, band, border, shadow, round, base, length, ...(stripes.length ? { stripes } : {}) };
}
/** a custom grass's puck (the Holes swatch, the editor's preview, the brush chip: ext/course-cursor swatchPuck): its family at its scale with
 *  its exposure on the top face, and the first cut band round it when it has a Border (firstCut: the course's first cut texture) */
export function grassPuck(g: CustomGrass, firstCut: CourseTex | null): { st: PuckStyle; pb: PuckBand | null } {
  const st: PuckStyle = { tex: grassTex(g) as PaintTex, scale: g.scale, angle: isGrassFamily(g.family) ? 0 : g.angle ?? 0, border: 0, btex: 'dirt', tone: g.tone, toneAmt: g.toneAmt, tint: '#ffffff', bscale: 1, bangle: 0 };
  return { st, pb: g.border > 0 && firstCut ? { name: 'first-cut', tex: grassBandTex(g, firstCut), tone: null } : null };
}
/** the brush kind that carries a custom grass's brush (its size, the cursor's chip shape and mark): the fairway's for a fairway, the rough's for
 *  the first cut and the rough, the long grass's for the long grass and the fescue (which has no brush of its own) */
export const GRASS_KIND: Readonly<Record<GrassPlay, BrushKind>> = { fairway: 'fairway', firstCut: 'rough', rough: 'rough', longGrass: 'longGrass', fescue: 'longGrass' };
/** each play's own photo texture (the dev server's photo grass) */
const PHOTO_TEX: Readonly<Record<GrassPlay, string>> = { fairway: 'golfFairway', firstCut: 'golfFirstCut', rough: 'golfRough', longGrass: 'golfLongGrass', fescue: 'golfFescue' };
