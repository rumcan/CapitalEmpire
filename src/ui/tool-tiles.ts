// T233 (#674, the owner 2026-10-27 showing the concept, docs/art/CONCEPT-LOOK.md step 10: "this is the look and feel we need to get to"): the
// build tools as small illustrated isometric scenes, as the concept's Golf Course panel draws them. The twelve tiles are art 174 (the sheet in
// art/theme-consistency/generated/ui/, cut by scripts/assets/prep-ui-tool-tiles.mjs into src/assets/ui/tiles/). Which flyout row shows which
// tile is here (flyout-menu.ts sets MenuRow.tile on the Course and Facilities menus); a row with no tile keeps its icon, mark or swatch.
// Pure TypeScript, no DOM.

/** a tile of art 174, by its picture */
export type ToolTile = 'tee' | 'fairway' | 'green' | 'bunker' | 'pond' | 'rough' | 'trees' | 'rocks' | 'cart-path' | 'clubhouse' | 'range-bays' | 'flower-bed';
/** the twelve tiles in the sheet's order (row by row) */
export const TOOL_TILES: readonly ToolTile[] = ['tee', 'fairway', 'green', 'bunker', 'pond', 'rough', 'trees', 'rocks', 'cart-path', 'clubhouse', 'range-bays', 'flower-bed'];

// Vite fills the glob in when it builds; under plain node (the esbuild test bundle that renders the flyouts) there is none, so no pictures
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/tiles/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
/** a tile's picture (undefined under plain node: the row draws its icon instead) */
export const tileUrl = (t: ToolTile): string | undefined => URLS[`../assets/ui/tiles/${t}.webp`];

/** Course ▸ Holes ▸ Shape by hand: the surfaces' tiles (SURFACE_BRUSHES' kinds; T252: no cart path brush). The Waste area has none yet (its
 *  pebbles mark; requested in docs/GOLF-SPRITES.md); T238's Long grass wears the rough's tile (the long rough it was) */
export const SURFACE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { fairway: 'fairway', green: 'green', tee: 'tee', rough: 'rough', bunker: 'bunker', water: 'pond', longGrass: 'rough' };
/** Facilities ▸ Plants: the plant brush's kinds (plant.ts PLANT_KINDS; Bushes and Palms keep their swatch) */
export const PLANT_TILE: Readonly<Partial<Record<string, ToolTile>>> = { trees: 'trees', flowers: 'flower-bed' };
/** Facilities ▸ Practice: the practice area's facilities (the putting green, the chipping green and its bunker) */
export const PRACTICE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { putting: 'green', chipping: 'bunker' };
/** Facilities ▸ Decoration ▸ Props: the catalogue's groups (golf/decor.ts DECOR_GROUPS; All props and Furniture keep their icon) */
export const PROP_GROUP_TILE: Readonly<Partial<Record<string, ToolTile>>> = { stone: 'rocks', water: 'pond', plants: 'flower-bed' };
/** the groups' and the single tools' tiles: Course ▸ Holes (the flag on its green), New hole (a hole starts at its tee), Shape by hand (the
 *  striped fairway), Buildings and the Clubhouse, Cart paths & roads; Facilities ▸ Practice (the covered range bays), Plants (the autumn
 *  trees), Decoration (the boulders: its Stone, T231) */
export const ROW_TILE = {
  holes: 'green', newHole: 'tee', shape: 'fairway', buildings: 'clubhouse', club: 'clubhouse', paths: 'cart-path',
  practice: 'range-bays', plants: 'trees', decoration: 'rocks',
} as const satisfies Record<string, ToolTile>;
