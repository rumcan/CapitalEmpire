// Painted menu icons from the original tool sheet and item181's second subject grid.
// Flyouts preserve their existing actions, row labels and navigation.
export const TOOL_TILES_V1 = ['tee', 'fairway', 'green', 'bunker', 'pond', 'rough', 'trees', 'rocks', 'cart-path', 'clubhouse', 'range-bays', 'flower-bed'] as const;
export const TOOL_TILES_V2 = ['waste-sand', 'snack-hut', 'golf-hole', 'grandstand-scoreboard', 'land-plot', 'autumn-shrubs', 'palms', 'street-furniture', 'patio-table', 'long-grass', 'chipping-green', 'surveyor-turf'] as const;
export type ToolTile = typeof TOOL_TILES_V1[number] | typeof TOOL_TILES_V2[number];
/** Row-major sheet identities; v1 asset files remain byte-for-byte unchanged. */
export const TOOL_TILES: readonly ToolTile[] = [...TOOL_TILES_V1, ...TOOL_TILES_V2];

// Vite resolves these normal imported assets; Node tests intentionally use the existing icon fallback.
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/tiles/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
export const tileUrl = (t: ToolTile): string | undefined => URLS[`../assets/ui/tiles/${t}.webp`];

/** Actual SURFACE_BRUSHES ids; Waste area and Long grass now have their own paintings. */
export const SURFACE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { fairway: 'fairway', green: 'green', tee: 'tee', rough: 'rough', bunker: 'bunker', water: 'pond', waste: 'waste-sand', longGrass: 'long-grass' };
/** Actual PLANT_KINDS ids from plant.ts. */
export const PLANT_TILE: Readonly<Partial<Record<string, ToolTile>>> = { trees: 'trees', flowers: 'flower-bed', bushes: 'autumn-shrubs', palms: 'palms' };
export const PRACTICE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { putting: 'green', chipping: 'chipping-green' };
/** Actual DECOR_GROUPS ids; Furniture is represented by its table and chairs. */
export const PROP_GROUP_TILE: Readonly<Partial<Record<string, ToolTile>>> = { stone: 'rocks', water: 'pond', plants: 'flower-bed', furniture: 'patio-table' };
/** Existing Course/Facilities rows: menu pictures, not gameplay object replacements. */
export const ROW_TILE = {
  holes: 'golf-hole', newHole: 'golf-hole', shape: 'fairway', buildings: 'clubhouse', club: 'clubhouse', halfway: 'snack-hut', paths: 'cart-path',
  practice: 'range-bays', plants: 'trees', decoration: 'street-furniture', build: 'surveyor-turf',
} as const satisfies Record<string, ToolTile>;
/** Existing Course extras from rail-items.ts. */
export const EXTRA_TILE: Readonly<Partial<Record<string, ToolTile>>> = { event: 'grandstand-scoreboard', land: 'land-plot' };
