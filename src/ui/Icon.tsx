// The owner's gold-on-charcoal UI icons (cut from docs/ui/icon-sheet.webp by scripts/assets/prep-ui-icons.mjs), by name.
// Vite fills the glob in when it builds; under plain node (the esbuild test bundle that renders panels) there is none, so no pictures
// #1304: an icon whose painted tile has landed (tool-tiles.ts ICON_TILE, src/assets/ui/tiles) draws the tile instead, at the same size (no layout shift);
// ui-art-look.ts 'vector' (the old look, kept as an option) and a tile not yet cut keep the gold icon
import { ICON_TILE, tileUrl, type ToolTile } from './tool-tiles';
import { paintedUi } from './ui-art-look';
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();

export type IconName =
  | 'leaf' | 'road' | 'house' | 'junction' | 'bulldozer' | 'bus' | 'power' | 'civic'
  | 'tree' | 'buildings' | 'bank' | 'people' | 'briefcase' | 'sun' | 'income' | 'gear'
  | 'trophy' | 'calendar' | 'info' | 'compass' | 'terrain' | 'layers' | 'chart' | 'camera'
  | 'pause' | 'play' | 'fast' | 'skip' | 'rewind' | 'start' | 'zoom-in' | 'zoom-out'
  | 'pin' | 'oneway' | 'trees' | 'sidewalk' | 'forest' | 'road-edge' | 'hills' | 'fullscreen'
  | 'help' | 'up' | 'down' | 'left' | 'right' | 'back2' | 'forward2' | 'swap' | 'open' | 'close';

/** an icon at size px (square); decorative, so it has no alt text: the button around it carries the title */
export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  const tile = paintedUi() ? iconTileUrl(name) : undefined;
  if (tile) return <img src={tile} width={size} height={size} alt="" draggable={false} data-icon-tile={ICON_TILE[name]} className={`pointer-events-none select-none rounded-[12%] ${className}`} />;
  return <img src={URLS[`../assets/ui/icons/${name}.webp`]} width={size} height={size} alt="" draggable={false} className={`pointer-events-none select-none ${className}`} />;
}

/** #1304: an icon's painted tile URL (undefined: none mapped, or its file not cut yet) */
export const iconTileUrl = (name: IconName): string | undefined => { const t = ICON_TILE[name]; return t ? tileUrl(t as ToolTile) : undefined; };
