// J8 (#1261; the owner, 2026-11-14: "add ALOT more images to the UI. especially on stuff you can do"): an action's picture. One painted tile (tool-tiles.ts,
// src/assets/ui/tiles) as a square thumbnail beside the text of the button or row it belongs to: a button's text already names it, so the picture is
// decorative (alt="" and aria-hidden). A fixed width and height (no layout shift), lazy-loaded; the tile is already cut with its rounded corners.
// Sized in px: the UI layer is zoomed by the text size setting (index.css .ui-root), so the picture grows and shrinks with the words. Under plain
// node (the esbuild test bundle that renders panels) there is no URL, so it draws nothing.
// The owner, 2026-11-16 ("these picture icons dont work at all. tried to add too much detail. at this size it does not translate to an icon"): a painted tile
// shows only where it is big (TILE_PICTURE, 56 px, and up: the Build menu's cards, the cards' headers, the ball tree's open node). Smaller, it is a small spot
// (a button, a chip, a settings or card row): the closest gold line icon stands in (TILE_ICON, at one size per kind of spot), or nothing where none fits.
import { Icon, type IconName } from './Icon';
import { tileUrl, type ToolTile } from './tool-tiles';

/** a typical size: a chip's or a row's picture (px); the main button of a card takes TILE_BIG */
export const TILE_SMALL = 28, TILE_ROW = 40, TILE_BIG = 64;
/** the smallest size a painted tile is drawn at: under it, its icon (TILE_ICON) */
export const TILE_PICTURE = 56;

/** a tile's line icon for a small spot (no entry: the spot shows no picture, its words say it) */
export const TILE_ICON: Readonly<Partial<Record<ToolTile, IconName>>> = {
  scene: 'camera', 'find-me': 'pin', settings: 'gear', 'load-save': 'open', 'new-game': 'start', walk: 'people', 'help-keys': 'help', tips: 'help', 'how-to-play': 'help',
  'draw-drive': 'road', 'golf-hole': 'pin', 'edit-hole': 'pin', 'play-hole': 'pin', 'chip-and-putt': 'pin', seed: 'leaf', sod: 'leaf', bulldoze: 'bulldozer', 'frame-trees': 'trees',
  earthworks: 'hills', currency: 'income', 'range-till': 'income', 'bucket-price': 'income', bank: 'bank', borrow: 'bank', 'save-money': 'income', 'take-money': 'income',
  repay: 'income', statement: 'chart', daylight: 'sun', 'shift-hours': 'calendar', profile: 'people', 'hire-attendant': 'people', 'home-caravan': 'house', 'front-door': 'house',
  'back-to-course': 'back2', trees: 'trees', clubhouse: 'house', 'club-house': 'house', 'range-bays': 'pin', 'place-range': 'pin', 'gravel-car-park': 'road', 'paved-car-park': 'road',
  'cart-path': 'sidewalk', 'walking-path': 'sidewalk', buildings: 'buildings', golfers: 'people', 'buy-range': 'pin', 'putting-green': 'pin', 'target-green': 'pin', 'sell-buckets': 'income',
};

/** tile: absent (a table with no entry for the thing): nothing is drawn. Under TILE_PICTURE: the tile's line icon (18 px in a chip or a button, 22 px in a row) */
export function ActionTile({ tile, size = TILE_ROW, className = '' }: { tile?: ToolTile | undefined; size?: number; className?: string }) {
  if (tile && size < TILE_PICTURE) { const icon = TILE_ICON[tile]; return icon ? <Icon name={icon} size={size <= 34 ? 18 : 22} className={`shrink-0 ${className}`} /> : null; }
  const src = tile ? tileUrl(tile) : undefined;
  if (!tile || !src) return null;
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} data-action-tile={tile}
    className={`pointer-events-none shrink-0 select-none rounded-[12%] object-contain ${className}`} />;
}
