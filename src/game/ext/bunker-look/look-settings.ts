import { exposureOf } from '../../exposure';
import { clampBunkerSettings, DEFAULT_BUNKER_SETTINGS, type BunkerSettings } from './settings';

/** What a bunker's look (My looks, kept per owner in the looks book: a hole, the property, a facility, the course default) holds of the 3D
 *  bake besides its sand's texture, size, angle and exposure (the look's own fields): the depth and walls, and the edge soil and cut wall
 *  pictures. Everything else the bake takes from the course: the Border band round it, Round off, the Shadow (the owner, 2026-10-31: "two
 *  different texture editors ... consolidate into one single component that edits the bunkers look") */
export const BUNKER_LOOK_KEYS = ['depth', 'wall', 'slope', 'textureScale', 'soilTex', 'soilScale', 'wallTex', 'earthScale'] as const;
export type BunkerLookKey = (typeof BUNKER_LOOK_KEYS)[number];
export type BunkerLookFields = Partial<Pick<BunkerSettings, BunkerLookKey>>;
/** the parts of a look the bake reads */
export interface BunkerLookStyle { scale: number; angle: number; tone: number; toneAmt: number; bunker?: BunkerLookFields }

/** The bake's settings for a bunker wearing this look: its own depth, walls and pictures (the defaults where it sets none), the sand at the
 *  look's Scale (100%: the default sand size), Angle and Exposure. */
export function bunkerSettingsOfLook(st: Readonly<BunkerLookStyle>): BunkerSettings {
  const own: Record<string, unknown> = {};
  for (const key of BUNKER_LOOK_KEYS) if (st.bunker?.[key] !== undefined) own[key] = st.bunker[key];
  const scale = Number.isFinite(st.scale) && st.scale > 0 ? st.scale : 1;
  return clampBunkerSettings({ ...own, sandScale: DEFAULT_BUNKER_SETTINGS.sandScale * scale, sandAngle: Number.isFinite(st.angle) ? st.angle : 0, sandExposure: exposureOf(st.tone, st.toneAmt) });
}
