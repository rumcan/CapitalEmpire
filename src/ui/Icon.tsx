// The owner's gold-on-charcoal UI icons (cut from docs/ui/icon-sheet.webp by scripts/assets/prep-ui-icons.mjs), by name.
// Vite fills the glob in when it builds; under plain node (the esbuild test bundle that renders panels) there is none, so no pictures
// #1304 drew an icon's painted tile (tool-tiles.ts ICON_TILE, src/assets/ui/tiles) in its place; ui-art-look.ts 'vector' kept the gold icon as an option
// The owner, 2026-11-16 ("these picture icons dont work at all. tried to add too much detail. at this size it does not translate to an icon"; "map zoom cant
// be a picture icon"): Icon always draws the gold line icons again, never the painted tiles (#1304's ICON_TILE stays as a table, unused here), and Close is a
// plain cross in the text's colour ("the close icon needs to be a normal UI element"). Painted pictures stay where they are big (ActionTile at 56 px and up).
import { ICON_TILE, tileUrl, type ToolTile } from './tool-tiles';
const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();

export type IconName =
  | 'leaf' | 'road' | 'house' | 'junction' | 'bulldozer' | 'bus' | 'power' | 'civic'
  | 'tree' | 'buildings' | 'bank' | 'people' | 'briefcase' | 'sun' | 'income' | 'gear'
  | 'trophy' | 'calendar' | 'info' | 'compass' | 'terrain' | 'layers' | 'chart' | 'camera'
  | 'pause' | 'play' | 'fast' | 'skip' | 'rewind' | 'start' | 'zoom-in' | 'zoom-out'
  | 'pin' | 'oneway' | 'trees' | 'sidewalk' | 'forest' | 'road-edge' | 'hills' | 'fullscreen'
  | 'help' | 'up' | 'down' | 'left' | 'right' | 'back2' | 'forward2' | 'swap' | 'open' | 'close';

/** the close mark: a plain UI cross (the owner, 2026-11-16: "the close icon needs to be a normal UI element"), never a picture */
const CLOSE = <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />;

/** an icon at size px (square); decorative, so it has no alt text: the button around it carries the title */
export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  if (name === 'close') return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-glyph="close" className={`ui-glyph pointer-events-none shrink-0 select-none ${className}`}>{CLOSE}</svg>;
  // (a fixed square box: the cut icons are not all square, and the page's img rule, height auto, let a wide one come out short; 2026-11-16)
  return <img src={URLS[`../assets/ui/icons/${name}.webp`]} width={size} height={size} alt="" draggable={false} style={{ width: size, height: size }} className={`pointer-events-none shrink-0 select-none object-contain ${className}`} />;
}

/** #1304: an icon's painted tile URL (undefined: none mapped, or its file not cut yet). Icon no longer draws it (2026-11-16, below) */
export const iconTileUrl = (name: IconName): string | undefined => { const t = ICON_TILE[name]; return t ? tileUrl(t as ToolTile) : undefined; };
