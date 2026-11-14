// Painted menu icons from the original tool sheet and item181's second subject grid.
// Flyouts preserve their existing actions, row labels and navigation.
export const TOOL_TILES_V1 = ['tee', 'fairway', 'green', 'bunker', 'pond', 'rough', 'trees', 'rocks', 'cart-path', 'clubhouse', 'range-bays', 'flower-bed'] as const;
export const TOOL_TILES_V2 = ['waste-sand', 'snack-hut', 'golf-hole', 'grandstand-scoreboard', 'land-plot', 'autumn-shrubs', 'palms', 'street-furniture', 'patio-table', 'long-grass', 'chipping-green', 'surveyor-turf'] as const;
// J8 (#1261; the owner, 2026-11-14: "add ALOT more images to the UI. especially on stuff you can do"): four more sheets of the same kind, the pictures on
// the jam's actions (the range card, the Bank, a hole's card, the title card, the tips, the practice drills). Shown by ActionTile.tsx.
export const TOOL_TILES_V3 = ['buy-range', 'hit-balls', 'chip-and-putt', 'clear-junk', 'pick-balls', 'hire-attendant', 'ball-washer', 'bucket-price', 'turf-tee', 'grass-outfield', 'target-green', 'covered-bays'] as const;
export const TOOL_TILES_V4 = ['open-bays', 'ball-dispenser', 'gravel-car-park', 'paved-car-park', 'putting-green', 'play-hole', 'edit-hole', 'frame-trees', 'draw-drive', 'seed', 'sod', 'bulldoze'] as const;
export const TOOL_TILES_V5 = ['bank', 'borrow', 'repay', 'save-money', 'take-money', 'statement', 'tips', 'how-to-play', 'settings', 'save-game', 'new-game', 'profile'] as const;
export const TOOL_TILES_V6 = ['drill-distance', 'drill-shaping', 'drill-flight', 'drill-junk', 'drill-up-down', 'drill-putting', 'drill-bunker', 'shot-draw', 'shot-fade', 'shot-high', 'shot-low', 'shot-spin'] as const;
export type ToolTile = typeof TOOL_TILES_V1[number] | typeof TOOL_TILES_V2[number] | typeof TOOL_TILES_V3[number] | typeof TOOL_TILES_V4[number] | typeof TOOL_TILES_V5[number] | typeof TOOL_TILES_V6[number];
/** Row-major sheet identities; v1 asset files remain byte-for-byte unchanged. These are the Course and Facilities flyouts' tiles (ui-flyouts.test.ts
 *  checks each is on a tool): the action tiles of sheets v3 to v6 are ACTION_TILES. */
export const TOOL_TILES: readonly ToolTile[] = [...TOOL_TILES_V1, ...TOOL_TILES_V2];
/** J8: the action tiles (sheets v3 to v6), 48 of them, each on an action somewhere in the UI (tests/ui-action-tiles.test.ts checks every id used exists) */
export const ACTION_TILES: readonly ToolTile[] = [...TOOL_TILES_V3, ...TOOL_TILES_V4, ...TOOL_TILES_V5, ...TOOL_TILES_V6];

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
/** T400 (#1078): the golf props' kinds in Facilities (decor.ts PROP_KINDS): the structures by the scoreboard stand, the furniture by the table and chairs,
 *  the range's props by its bays, the vehicles by the cart path. */
export const PROP_KIND_TILE: Readonly<Partial<Record<string, ToolTile>>> = { structures: 'grandstand-scoreboard', coursefurniture: 'patio-table', rangeprops: 'range-bays', vehicles: 'cart-path' };
/** Existing Course/Facilities rows: menu pictures, not gameplay object replacements. */
export const ROW_TILE = {
  holes: 'golf-hole', newHole: 'golf-hole', shape: 'fairway', buildings: 'clubhouse', club: 'clubhouse', halfway: 'snack-hut', paths: 'cart-path',
  // T214: stand-in tiles until GOLF-SPRITES' Build-tool tiles for the pro's office and the teaching hut land
  proOffice: 'clubhouse', teachHut: 'snack-hut',
  practice: 'range-bays', plants: 'trees', decoration: 'street-furniture', build: 'surveyor-turf',
} as const satisfies Record<string, ToolTile>;
/** Existing Course extras from rail-items.ts. */
export const EXTRA_TILE: Readonly<Partial<Record<string, ToolTile>>> = { event: 'grandstand-scoreboard', land: 'land-plot' };
