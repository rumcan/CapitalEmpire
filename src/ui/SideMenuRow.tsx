// T366 (#1021; the owner, 2026-11-08: "Any menu button that opens a new menu window to the side like the Bunker Look button should be full width and look
// different so the user can clearly tell there's more menus if he clicks it."): the one row every button that opens a menu or a window to the side is, in
// whichever panel it sits. It runs the panel's full width, with a blue edge and tint (the chips beside it do things; gold is what is on) and an arrow in a round
// pocket at its end, pointing the way the menu opens: ▸ a window to the right of the panel, ◂ one to the left (the Bag's putter parts), ▾ an editor that folds
// out below the row (▸ while it is shut). Markup only: the caller keeps its state and its click, and any attribute a test, a shot script or the guide finds the
// button by (data-*, aria-pressed, title) goes through as it was on the chip.
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** the way the menu opens */
export type SideDir = 'right' | 'left' | 'down';
/** the arrow a row shows: right ▸, left ◂, down ▸ while shut and ▾ while open */
export const sideArrow = (side: SideDir, open: boolean): string => (side === 'left' ? '◂' : side === 'down' && open ? '▾' : '▸');

export interface SideMenuRowProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'value'> {
  /** the row's name */
  label: ReactNode;
  /** a second line under it: what the menu holds */
  sub?: ReactNode;
  /** what is chosen now, at the end of the row before the arrow */
  value?: ReactNode;
  /** a leading icon or swatch */
  lead?: ReactNode;
  /** the menu it opens is open now: the row is lit */
  open?: boolean;
  /** the way it opens (right by default) */
  side?: SideDir;
}

export function SideMenuRow({ label, sub, value, lead, open = false, side = 'right', className = '', type = 'button', ...rest }: SideMenuRowProps) {
  // a caller that names its own aria state (pressed, expanded) keeps it; the others say whether the menu is open
  const aria = rest['aria-pressed'] === undefined && rest['aria-expanded'] === undefined ? { 'aria-expanded': open } : {};
  return (
    <button type={type} className={`side-row ${open ? 'side-row-open' : ''} ${className}`.replace(/\s+/g, ' ').trim()} data-side-menu data-side={side} {...aria} {...rest}>
      {lead && <span className="side-row-lead">{lead}</span>}
      <span className="side-row-text">
        <span className="side-row-label">{label}</span>
        {sub && <span className="side-row-sub">{sub}</span>}
      </span>
      {value && <span className="side-row-value">{value}</span>}
      <span className="side-row-arrow" aria-hidden>{sideArrow(side, open)}</span>
    </button>
  );
}
