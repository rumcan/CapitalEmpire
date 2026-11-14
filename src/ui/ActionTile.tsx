// J8 (#1261; the owner, 2026-11-14: "add ALOT more images to the UI. especially on stuff you can do"): an action's picture. One painted tile (tool-tiles.ts,
// src/assets/ui/tiles) as a square thumbnail beside the text of the button or row it belongs to: a button's text already names it, so the picture is
// decorative (alt="" and aria-hidden). A fixed width and height (no layout shift), lazy-loaded; the tile is already cut with its rounded corners.
// Sized in px: the UI layer is zoomed by the text size setting (index.css .ui-root), so the picture grows and shrinks with the words. Under plain
// node (the esbuild test bundle that renders panels) there is no URL, so it draws nothing.
import { tileUrl, type ToolTile } from './tool-tiles';

/** a typical size: a chip's or a row's picture (px); the main button of a card takes TILE_BIG */
export const TILE_SMALL = 28, TILE_ROW = 40, TILE_BIG = 64;

/** tile: absent (a table with no entry for the thing): nothing is drawn */
export function ActionTile({ tile, size = TILE_ROW, className = '' }: { tile?: ToolTile | undefined; size?: number; className?: string }) {
  const src = tile ? tileUrl(tile) : undefined;
  if (!tile || !src) return null;
  return <img src={src} width={size} height={size} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} data-action-tile={tile}
    className={`pointer-events-none shrink-0 select-none rounded-[12%] object-contain ${className}`} />;
}
