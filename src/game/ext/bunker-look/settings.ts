import { APPROVED_APPEARANCE } from './package/approved-preset.js';
import type { Appearance } from './package/runtime/capital-empire-adapter.js';

/** A complete custom snapshot. An absent area override continues following the global defaults. */
export interface BunkerSettings {
  version: 1;
  depth: number;
  collar: number;
  firstCut: number;
  wall: number;
  /** the cut face's height where no green is behind it (metres; the owner, 2026-10-31: low by default, raise it at will) */
  wallLow: number;
  rim: number;
  slope: number;
  shadow: number;
  textureScale: number;
  roughScale: number;
  firstScale: number;
  sandScale: number;
  earthScale: number;
  soilScale: number;
  fairwayScale: number;
  roundness: number;
  /** the sand's turn (degrees) and exposure (a brightness factor, 1 none): the bunker's My looks Angle and Exposure (bunkerSettingsOfLook) */
  sandAngle: number;
  sandExposure: number;
  /** Texture ids (texture-library.ts); an id this browser does not know draws the slot's default texture but stays saved. */
  sandTex: string;
  soilTex: string;
  roughTex: string;
  firstTex: string;
  wallTex: string;
}

export type BunkerSettingKey = { [K in keyof BunkerSettings]: BunkerSettings[K] extends number ? K : never }[Exclude<keyof BunkerSettings, 'version'>];
export type BunkerTextureSlot = 'sand' | 'soil' | 'rough' | 'firstCut' | 'wall';
export type BunkerTextureKey = 'sandTex' | 'soilTex' | 'roughTex' | 'firstTex' | 'wallTex';
export interface BunkerTextureSlotInfo { slot: BunkerTextureSlot; key: BunkerTextureKey; scale: BunkerSettingKey; label: string }
/** The swappable pictures of a bunker, each with its own scale slider (all multiplied by textureScale). */
export const BUNKER_TEXTURE_SLOTS: readonly Readonly<BunkerTextureSlotInfo>[] = Object.freeze([
  { slot: 'sand', key: 'sandTex', scale: 'sandScale', label: 'Sand' },
  { slot: 'soil', key: 'soilTex', scale: 'soilScale', label: 'Edge soil and roots' },
  { slot: 'rough', key: 'roughTex', scale: 'roughScale', label: 'Rough band' },
  { slot: 'firstCut', key: 'firstTex', scale: 'firstScale', label: 'First cut' },
  { slot: 'wall', key: 'wallTex', scale: 'earthScale', label: 'Cut wall' },
].map(slot => Object.freeze(slot as BunkerTextureSlotInfo)));
/** The approved look's pictures (stage-materials.ts BUNKER_PACK_TEXTURES). */
export const DEFAULT_BUNKER_TEXTURES: Readonly<Record<BunkerTextureSlot, string>> = Object.freeze({
  sand: 'bunker:sand', soil: 'bunker:soil', rough: 'bunker:border-grass', firstCut: 'bunker:first-cut', wall: 'bunker:wall-earth',
});
export interface BunkerSettingField {
  key: BunkerSettingKey;
  label: string;
  /** Limits and step are in stored units. Multiply by displayScale for the UI. */
  min: number;
  max: number;
  step: number;
  unit: 'm' | 'x' | '';
  displayScale: number;
  group: 'shape' | 'texture';
  /** Preserved in snapshots, but inert for the current authoritative-ring renderer. */
  hidden?: boolean;
}

/** Widths are 2 m tiles internally; all displayed lengths are metres. */
export const BUNKER_SETTING_FIELDS: readonly Readonly<BunkerSettingField>[] = Object.freeze([
  { key: 'depth', label: 'Floor depth below cut wall', min: 0, max: 6, step: 0.1, unit: 'm', displayScale: 1, group: 'shape' },
  // both cut faces up to 2 m (the owner, 2026-10-31: "set wall height to max for 2m")
  { key: 'wall', label: 'Cut face height', min: 0, max: 2, step: 0.05, unit: 'm', displayScale: 1, group: 'shape' },
  { key: 'wallLow', label: 'Cut face height with no green behind', min: 0, max: 2, step: 0.05, unit: 'm', displayScale: 1, group: 'shape' },
  // hidden (the owner, 2026-10-31: "remove this"): the course draws the ground round a bunker, so its rim stays flat (0)
  { key: 'rim', label: 'Rim height', min: 0, max: 1.5, step: 0.05, unit: 'm', displayScale: 1, group: 'shape', hidden: true },
  { key: 'slope', label: 'Sand slope width', min: 0.05, max: 7.5, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'collar', label: 'Rough band width', min: 0.05, max: 3.75, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'firstCut', label: 'First cut width', min: 0.05, max: 3.75, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'shadow', label: 'Shadow strength', min: 0, max: 3, step: 0.05, unit: '', displayScale: 1, group: 'shape' },
  { key: 'roundness', label: 'Authoring roundness', min: 0, max: 1, step: 0.05, unit: '', displayScale: 1, group: 'shape', hidden: true },
  { key: 'textureScale', label: 'Overall texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'roughScale', label: 'Rough texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'firstScale', label: 'First cut texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  // the sand's size, turn and exposure come from the bunker's look (bunkerSettingsOfLook: My looks' Scale, Angle, Exposure)
  { key: 'sandScale', label: 'Sand texture scale', min: 0.25, max: 24, step: 0.05, unit: 'x', displayScale: 1, group: 'texture', hidden: true },
  { key: 'sandAngle', label: 'Sand angle', min: -180, max: 180, step: 1, unit: '°', displayScale: 1, group: 'texture', hidden: true },
  { key: 'sandExposure', label: 'Sand exposure', min: 0.25, max: 4, step: 0.01, unit: 'x', displayScale: 1, group: 'texture', hidden: true },
  { key: 'soilScale', label: 'Edge soil texture scale', min: 0.25, max: 6, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'earthScale', label: 'Wall texture scale', min: 0.25, max: 6, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'fairwayScale', label: 'Outer grass texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture', hidden: true },
].map(field => Object.freeze(field as BunkerSettingField)));

export const DEFAULT_BUNKER_SETTINGS: Readonly<BunkerSettings> = Object.freeze({
  version: 1,
  // The cut face is this high on the side toward the green and half of it on the far side (the owner, 2026-10-31), so the far side's 0.6 m
  // matches the old bunker's sink and the swap from the old drawing to the baked picture reads as the same bunker; a shallow sand floor.
  depth: 0.3,
  wall: 1.2,
  wallLow: 0.25,
  // In the game the course draws the grass round a bunker (its rough, a green, a fairway, with their own transitions): the bake draws
  // only the bunker, so its own rough band and first cut start at their minimum and its rim is flat (the approved preset's 5 m band on
  // a 0.8 m mound was cut by every neighbouring green and left raised slivers over the wall). Both widths stay on the sliders.
  collar: 0.05,
  firstCut: 0.05,
  rim: 0,
  slope: APPROVED_APPEARANCE.settings.slope!,
  shadow: APPROVED_APPEARANCE.settings.shadow!,
  textureScale: APPROVED_APPEARANCE.settings.textureScale!,
  roughScale: APPROVED_APPEARANCE.settings.roughScale!,
  firstScale: APPROVED_APPEARANCE.settings.firstScale!,
  sandScale: APPROVED_APPEARANCE.settings.sandScale!,
  earthScale: APPROVED_APPEARANCE.settings.earthScale!,
  // the edge soil shared the wall's scale before it had its own slider
  soilScale: APPROVED_APPEARANCE.settings.earthScale!,
  fairwayScale: APPROVED_APPEARANCE.settings.fairwayScale!,
  roundness: APPROVED_APPEARANCE.settings.roundness!,
  sandAngle: 0,
  sandExposure: 1,
  ...Object.fromEntries(BUNKER_TEXTURE_SLOTS.map(slot => [slot.key, DEFAULT_BUNKER_TEXTURES[slot.slot]])) as Record<BunkerTextureKey, string>,
});

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const textureId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[ -]/.test(value);

/** The values a game save took from the code's defaults before the defaults moved (the approved preset's depth, cut face, rim and grass
 *  bands): a saved bunker still at one of them takes today's default instead, so an old save does not keep the deep pit. */
const FORMER_DEFAULTS: Partial<Record<BunkerSettingKey, number>> = { depth: APPROVED_APPEARANCE.depth, wall: APPROVED_APPEARANCE.settings.wall!,
  rim: APPROVED_APPEARANCE.settings.rim!, collar: APPROVED_APPEARANCE.settings.collar!, firstCut: APPROVED_APPEARANCE.settings.firstCut! };
/** A saved settings object as the game loads it: the former defaults dropped (FORMER_DEFAULTS), the rest as saved. */
export function fromSavedBunkerSettings(value: unknown): unknown {
  const input = object(value); if (!input) return value;
  const out = { ...input };
  for (const [key, old] of Object.entries(FORMER_DEFAULTS)) if (out[key] === old) delete out[key];
  return out;
}
/** What a game save keeps of a settings object: only what differs from today's defaults (so a later change of default reaches it). */
export function toSavedBunkerSettings(settings: Readonly<BunkerSettings>): Partial<BunkerSettings> {
  const out: Record<string, unknown> = { version: 1 };
  for (const [key, value] of Object.entries(settings)) if (key !== 'version' && value !== DEFAULT_BUNKER_SETTINGS[key as keyof BunkerSettings]) out[key] = value;
  // the edge soil scale follows the wall's when a save has the wall's alone (clampBunkerSettings): keep it explicit
  if ('earthScale' in out && !('soilScale' in out)) out.soilScale = settings.soilScale;
  return out as Partial<BunkerSettings>;
}

/** Normalize without rounding: the exact approved appearance survives saves and resets. */
export function clampBunkerSettings(value: unknown, base: Readonly<BunkerSettings> = DEFAULT_BUNKER_SETTINGS): BunkerSettings {
  let input = object(value);
  // Future formats must not be silently interpreted as this version's controls.
  if (input?.version !== undefined && input.version !== 1) input = undefined;
  // a saved snapshot from before the edge soil had its own scale: the soil keeps following the wall's earth scale
  if (input?.version === 1 && !finite(input.soilScale) && finite(input.earthScale)) input = { ...input, soilScale: input.earthScale };
  const out: BunkerSettings = { ...DEFAULT_BUNKER_SETTINGS };
  for (const field of BUNKER_SETTING_FIELDS) {
    const fallback = finite(base[field.key]) ? base[field.key] : DEFAULT_BUNKER_SETTINGS[field.key];
    const number = finite(input?.[field.key]) ? input![field.key] as number : fallback;
    out[field.key] = Math.max(field.min, Math.min(field.max, number));
  }
  for (const slot of BUNKER_TEXTURE_SLOTS) {
    const value = input?.[slot.key];
    out[slot.key] = textureId(value) ? value : textureId(base[slot.key]) ? base[slot.key] : DEFAULT_BUNKER_SETTINGS[slot.key];
  }
  return out;
}

/** Optional custom save field: absence or unsupported/corrupt data keeps inheritance. */
export function readBunkerSettings(value: unknown): BunkerSettings | undefined {
  const input = object(value);
  if (!input || input.version !== undefined && input.version !== 1) return undefined;
  if (input.version !== 1 && !BUNKER_SETTING_FIELDS.some(field => finite(input[field.key])) && !BUNKER_TEXTURE_SLOTS.some(slot => textureId(input[slot.key]))) return undefined;
  return clampBunkerSettings(input);
}

/** Custom values are complete snapshots; later global edits affect inheriting areas only. */
export function resolveBunkerSettings(defaults: unknown, custom?: unknown): BunkerSettings {
  return readBunkerSettings(custom) ?? clampBunkerSettings(defaults);
}

export function bunkerAppearance(value: Readonly<BunkerSettings>): Appearance {
  const settings = clampBunkerSettings(value);
  const appearance = { ...APPROVED_APPEARANCE, depth: settings.depth, settings: { ...APPROVED_APPEARANCE.settings } };
  for (const field of BUNKER_SETTING_FIELDS) if (field.key !== 'depth') appearance.settings[field.key] = settings[field.key];
  return appearance;
}
