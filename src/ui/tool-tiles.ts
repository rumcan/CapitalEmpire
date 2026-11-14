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
// the second pair: every tutorial and guide step, the rail and top bar, the range card's shift and scene, the daylight, the earthworks, Help, and the golf view's clubs and buttons
export const TOOL_TILES_V7 = ['place-range', 'walking-path', 'sell-buckets', 'select-tool', 'walk', 'find-me', 'game-speed', 'zoom', 'shift-hours', 'scene', 'daylight', 'earthworks'] as const;
export const TOOL_TILES_V8 = ['club-driver', 'club-wood', 'club-long-iron', 'club-iron', 'club-wedge', 'club-putter', 'jump-to-ball', 'gimme', 'go-for-it', 'back-to-course', 'help-keys', 'closed-gate'] as const;
// the last sheet: the sound tiles (SOUND_TILES: for J11's music radio and sound settings), Settings' text size, currency, colour-safe money, backups and load, and the title card's front door
export const TOOL_TILES_V9 = ['radio', 'boombox', 'headphones', 'bell', 'radio-off', 'jukebox', 'currency', 'text-size', 'colour-safe', 'backups', 'load-save', 'front-door'] as const;
export type ToolTile = typeof TOOL_TILES_V1[number] | typeof TOOL_TILES_V2[number] | typeof TOOL_TILES_V3[number] | typeof TOOL_TILES_V4[number] | typeof TOOL_TILES_V5[number] | typeof TOOL_TILES_V6[number] | typeof TOOL_TILES_V7[number] | typeof TOOL_TILES_V8[number] | typeof TOOL_TILES_V9[number];
/** Row-major sheet identities; v1 asset files remain byte-for-byte unchanged. These are the Course and Facilities flyouts' tiles (ui-flyouts.test.ts
 *  checks each is on a tool): the action tiles of sheets v3 to v6 are ACTION_TILES. */
export const TOOL_TILES: readonly ToolTile[] = [...TOOL_TILES_V1, ...TOOL_TILES_V2];
/** J8: the action tiles (sheets v3 to v9), 84 of them, each on an action somewhere in the UI (tests/ui-action-tiles.test.ts checks every id used exists) */
export const ACTION_TILES: readonly ToolTile[] = [...TOOL_TILES_V3, ...TOOL_TILES_V4, ...TOOL_TILES_V5, ...TOOL_TILES_V6, ...TOOL_TILES_V7, ...TOOL_TILES_V8, ...TOOL_TILES_V9];
/** the six sound tiles of sheet v9, cut for J11 (#1270, branch arena/j11-sound: the music radio and the sound settings): no action in the jam wears them until that lands */
export const SOUND_TILES: readonly ToolTile[] = ['radio', 'boombox', 'headphones', 'bell', 'radio-off', 'jukebox'];

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

// ---- J8 (#1261): the action tiles' homes (ACTION_TILES, sheets v3 to v6). A table says which tile an action wears; ActionTile.tsx draws it.
/** the range upgrades (rangesave.ts ids), on the range card and the Build menu; the car park's two steps are Gravel and Pave */
export const RANGE_UPGRADE_TILE: Readonly<Partial<Record<string, ToolTile>>> = {
  teeturf: 'turf-tee', grass: 'grass-outfield', greens: 'target-green', targets: 'target-green', gravel: 'gravel-car-park', pave: 'paved-car-park',
  bays8: 'open-bays', bays12: 'open-bays', bays24: 'open-bays', covered: 'covered-bays', dispenser: 'ball-dispenser',
};
/** the range card's practice sessions (player.ts PracticeKind): Hit a bucket, Putting practice, Chipping practice */
export const SESSION_TILE: Readonly<Partial<Record<string, ToolTile>>> = { bucket: 'hit-balls', putting: 'putting-green', chipping: 'chip-and-putt' };
/** the practice greens' rows on the range card (the putting green's own tile; the chipping green's is the second sheet's) */
export const PRACTICE_BUILD_TILE: Readonly<Partial<Record<string, ToolTile>>> = { putting: 'putting-green', chipping: 'chipping-green' };
/** the range card's placements (the range, its car park, the practice area) */
export const PLACE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { range: 'buy-range', carpark: 'gravel-car-park', practice: 'putting-green' };
/** the ball room tree's branches (rangesave.ts TreeBranch): Picking, Staff, Machines, Supply and Your game */
export const BRANCH_TILE: Readonly<Partial<Record<string, ToolTile>>> = { picking: 'pick-balls', staff: 'hire-attendant', machines: 'ball-washer', supply: 'bucket-price', golf: 'profile' };
/** the tree's nodes that have a picture of their own (rangesave.ts ids; the others wear their branch's): the attendants, the washer and the bucket counter */
export const BALL_NODE_TILE: Readonly<Partial<Record<string, ToolTile>>> = { attendant: 'hire-attendant', attendant2: 'hire-attendant', attendant3: 'hire-attendant', washer: 'ball-washer', counter: 'bucket-price' };
