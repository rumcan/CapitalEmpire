// Where the Holes panel's + dropdown goes (#1296: the owner, "the window should be overflow visible"). Pure TypeScript, no DOM: HoleStrip.tsx's HoleMenu measures the badge and
// the menu and asks here; tests/hole-menu-place.test.ts holds it to the rules. All in the window's own px (the UI layer's Text size zoom is the caller's to undo).

/** the badge's rect, the part of it placement reads */
export interface MenuAnchor { left: number; top: number; bottom: number }
/** the menu's size */
export interface MenuSize { width: number; height: number }

/** where the dropdown goes: under the badge with their left edges together, or above it when the window has no room below; always inside the window (pad px from each edge).
 *  A menu taller than the window sits at the top edge; one wider than it, at the left. a: the badge's rect, m: the menu's size, W x H: the window */
export function placeMenu(a: MenuAnchor, m: MenuSize, W: number, H: number, gap = 4, pad = 6): { left: number; top: number } {
  const left = Math.max(pad, Math.min(a.left, W - pad - m.width));
  const below = a.bottom + gap, top = below + m.height <= H - pad ? below : Math.max(pad, a.top - gap - m.height);
  return { left, top: Math.min(top, Math.max(pad, H - pad - m.height)) };
}
