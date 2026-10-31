import { APPROVED_APPEARANCE } from './package/approved-preset.js';
import type { Appearance } from './package/runtime/capital-empire-adapter.js';

/** A complete custom snapshot. An absent area override continues following the global defaults. */
export interface BunkerSettings {
  version: 1;
  depth: number;
  collar: number;
  firstCut: number;
  wall: number;
  rim: number;
  slope: number;
  shadow: number;
  textureScale: number;
  roughScale: number;
  firstScale: number;
  sandScale: number;
  earthScale: number;
  fairwayScale: number;
  roundness: number;
}

export type BunkerSettingKey = Exclude<keyof BunkerSettings, 'version'>;
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
  { key: 'wall', label: 'Cut face height', min: 0, max: 4, step: 0.05, unit: 'm', displayScale: 1, group: 'shape' },
  { key: 'rim', label: 'Rim height', min: 0, max: 1.5, step: 0.05, unit: 'm', displayScale: 1, group: 'shape' },
  { key: 'slope', label: 'Sand slope width', min: 0.05, max: 7.5, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'collar', label: 'Rough band width', min: 0.05, max: 3.75, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'firstCut', label: 'First cut width', min: 0.05, max: 3.75, step: 0.05, unit: 'm', displayScale: 2, group: 'shape' },
  { key: 'shadow', label: 'Shadow strength', min: 0, max: 3, step: 0.05, unit: '', displayScale: 1, group: 'shape' },
  { key: 'roundness', label: 'Authoring roundness', min: 0, max: 1, step: 0.05, unit: '', displayScale: 1, group: 'shape', hidden: true },
  { key: 'textureScale', label: 'Overall texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'roughScale', label: 'Rough texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'firstScale', label: 'First cut texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'sandScale', label: 'Sand texture scale', min: 0.25, max: 6, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'earthScale', label: 'Earth texture scale', min: 0.25, max: 6, step: 0.05, unit: 'x', displayScale: 1, group: 'texture' },
  { key: 'fairwayScale', label: 'Outer grass texture scale', min: 0.25, max: 4, step: 0.05, unit: 'x', displayScale: 1, group: 'texture', hidden: true },
].map(field => Object.freeze(field as BunkerSettingField)));

export const DEFAULT_BUNKER_SETTINGS: Readonly<BunkerSettings> = Object.freeze({
  version: 1,
  depth: APPROVED_APPEARANCE.depth,
  collar: APPROVED_APPEARANCE.settings.collar!,
  firstCut: APPROVED_APPEARANCE.settings.firstCut!,
  wall: APPROVED_APPEARANCE.settings.wall!,
  rim: APPROVED_APPEARANCE.settings.rim!,
  slope: APPROVED_APPEARANCE.settings.slope!,
  shadow: APPROVED_APPEARANCE.settings.shadow!,
  textureScale: APPROVED_APPEARANCE.settings.textureScale!,
  roughScale: APPROVED_APPEARANCE.settings.roughScale!,
  firstScale: APPROVED_APPEARANCE.settings.firstScale!,
  sandScale: APPROVED_APPEARANCE.settings.sandScale!,
  earthScale: APPROVED_APPEARANCE.settings.earthScale!,
  fairwayScale: APPROVED_APPEARANCE.settings.fairwayScale!,
  roundness: APPROVED_APPEARANCE.settings.roundness!,
});

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Normalize without rounding: the exact approved appearance survives saves and resets. */
export function clampBunkerSettings(value: unknown, base: Readonly<BunkerSettings> = DEFAULT_BUNKER_SETTINGS): BunkerSettings {
  let input = object(value);
  // Future formats must not be silently interpreted as this version's controls.
  if (input?.version !== undefined && input.version !== 1) input = undefined;
  const out: BunkerSettings = { ...DEFAULT_BUNKER_SETTINGS };
  for (const field of BUNKER_SETTING_FIELDS) {
    const fallback = finite(base[field.key]) ? base[field.key] : DEFAULT_BUNKER_SETTINGS[field.key];
    const number = finite(input?.[field.key]) ? input![field.key] as number : fallback;
    out[field.key] = Math.max(field.min, Math.min(field.max, number));
  }
  return out;
}

/** Optional custom save field: absence or unsupported/corrupt data keeps inheritance. */
export function readBunkerSettings(value: unknown): BunkerSettings | undefined {
  const input = object(value);
  if (!input || input.version !== undefined && input.version !== 1) return undefined;
  if (input.version !== 1 && !BUNKER_SETTING_FIELDS.some(field => finite(input[field.key]))) return undefined;
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
