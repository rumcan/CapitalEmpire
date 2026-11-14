// #1297 (the owner, 2026-11-14: the guide's Show me lit the Course button, "clicking there does not open", and never led on to the thing the step names): how a Show me
// leads the player down a menu, level by level. A target that stands inside a menu (a flyout row: Range > Place the practice area; Course > Facilities > Practice >
// Putting green) has a LEAD: the rail button that opens it and the group rows on the way, each a control with its own data-guide anchor. The spotlight lights the deepest
// level of the chain that is on screen: the rail button first, and when that is clicked (or, after a moment, opened by the spotlight itself: App.tsx's reveal) the next
// level, down to the entry itself. The chain is also the caption's breadcrumb (Course > Facilities > Practice > Putting green), so what the words say, what is lit and the
// real menu (flyout-menu.ts: its rows carry these anchors, tests/spotlight-leads.test.ts walks them) are one path. Pure TS, no DOM; depends on nothing in the game.

/** a level between the rail button and the target: the control's data-guide anchor, its name as the menu shows it, and (a group row that opens the next column) its row key in
 *  the flyout, which is what the spotlight opens by itself. A step with no key is a leaf that does something (the Range card row, Land for sale): it is lit, never pressed for you */
export interface LeadStep { guide: string; label: string; key?: string }
/** where a target is in the menus: the rail item whose flyout holds it (rail-items.ts id), the levels between, and the target's own name */
export interface Lead { item: string; steps: readonly LeadStep[]; label: string }

/** the rail items' names (rail-items.ts RAIL labels: tests/spotlight-leads.test.ts keeps them the same) */
export const RAIL_NAME: Readonly<Record<string, string>> = Object.freeze({ range: 'Range', course: 'Course', paths: 'Cart paths & roads', traffic: 'Traffic' });

const FACILITIES: LeadStep = { guide: 'rail-facilities', label: 'Facilities', key: 'facilities' };
const PRACTICE: LeadStep = { guide: 'facilities-practice', label: 'Practice', key: 'practice' };
const HOLES: LeadStep = { guide: 'course-holes', label: 'Holes', key: 'holes' };
const BUILDINGS: LeadStep = { guide: 'course-buildings', label: 'Buildings', key: 'buildings' };
const LAND: LeadStep = { guide: 'course-land', label: 'Land for sale' };
const ROADS: LeadStep = { guide: 'traffic-roads', label: 'Roads', key: 'roads' };
const TRANSPORT: LeadStep = { guide: 'traffic-transport', label: 'Transport', key: 'transport' };

/** every target that stands in a menu, by its anchor (the anchor of the flyout row, or of the control the row opens) */
export const LEADS: Readonly<Record<string, Lead>> = Object.freeze({
  // Range: the three placements are rows of its flyout, and its card opens from the Range card row
  'place-range': { item: 'range', steps: [], label: 'Place the driving range' },
  'place-carpark': { item: 'range', steps: [], label: 'Place the car park' },
  'place-practice': { item: 'range', steps: [], label: 'Place the practice area' },
  'range-card': { item: 'range', steps: [], label: 'Range card' },
  // Course: Facilities is the flyout's sixth tile (#1272), its Practice group the next column, the greens the next
  'rail-facilities': { item: 'course', steps: [], label: 'Facilities' },
  'practice-putting': { item: 'course', steps: [FACILITIES, PRACTICE], label: 'Putting green' },
  'practice-chipping': { item: 'course', steps: [FACILITIES, PRACTICE], label: 'Chipping green and bunker' },
  'new-hole': { item: 'course', steps: [HOLES], label: 'New hole' },
  'clubhouse-card': { item: 'course', steps: [BUILDINGS], label: 'Clubhouse' },
  'land-buy': { item: 'course', steps: [LAND], label: 'Buy' },
  // Traffic (the town footer): its flyouts open upward, the rows to the side
  'traffic-build': { item: 'traffic', steps: [ROADS], label: 'Build' },
  'road-upgrade': { item: 'traffic', steps: [ROADS], label: 'Upgrade' },
  'tool-park': { item: 'traffic', steps: [TRANSPORT], label: 'Car park' },
});

/** where an anchor falls back to while its control is not on screen (its panel closed): the control that opens it (a lead's chain is below, and wins) */
export const ANCHOR_FALLBACK: Readonly<Record<string, readonly string[]>> = {
  'new-hole': ['rail-course'], 'clubhouse-card': ['rail-course'], 'tool-park': ['rail-traffic'], 'fix-holes': ['season-chip'], 'fix-carpark': ['season-chip'],
  // #1272: Facilities is a tile of the Course flyout (it carries this anchor while that is open), no rail button: shut, the guide points at Course
  'rail-facilities': ['rail-course'],
  'fix-clubhouse': ['season-chip'], 'invite-pill': ['season-chip'], 'results': ['season-chip'],
  // T366: the Skip to tournament button is a row of the Season card: while the card is shut the guide points at the chip that opens it
  'chip-skip': ['season-chip'],
  // the jam's Build menu opens from the rail's Build button
  'build-menu': ['rail-build'],
};

/** the rail button's anchor for a rail item */
export const railAnchor = (item: string): string => `rail-${item}`;

/** the controls that lead to anchor id, nearest first: the control itself, the levels of its menu from the nearest to the outermost, then the rail button that opens it.
 *  Without a lead, its fallbacks (the control that opens its card) */
export function chainOf(id: string): readonly string[] {
  const cached = CHAINS.get(id); if (cached) return cached;
  const l = LEADS[id], out: readonly string[] = l ? [id, ...[...l.steps].reverse().map(s => s.guide), railAnchor(l.item)] : [id, ...(ANCHOR_FALLBACK[id] ?? [])];
  CHAINS.set(id, out); return out;
}
const CHAINS = new Map<string, readonly string[]>();

/** the names along the way for the caption: the rail button, each level, the entry (null: not in a menu) */
export function crumbsOf(id: string): readonly string[] | null {
  const l = LEADS[id]; return l ? [RAIL_NAME[l.item] ?? l.item, ...l.steps.map(s => s.label), l.label] : null;
}

/** which level of a chain to light: the deepest that is on screen (the lowest index: 0 is the target itself), -1 when none is. Until grace is over only the target's own counts: it may
 *  be coming (its card or menu is opening), and lighting an outer level first would flash it and move on. on(anchor) says whether a control with that anchor is on screen */
export function deepestOn(chain: readonly string[], on: (anchor: string) => boolean, grace: boolean): number {
  for (let k = 0; k < chain.length; k++) {
    if (k > 0 && !grace) return -1;
    if (on(chain[k]!)) return k;
  }
  return -1;
}

/** the group rows to open so that the level after chain level k is on screen (k: 0 the target, 1..n the steps from the nearest, n + 1 the rail button): the keys of the steps
 *  from the outermost to the lit one. [] opens just the flyout; null when the lit level is no group (a leaf that acts: nothing to open) or id has no lead */
export function keysToReveal(id: string, k: number): string[] | null {
  const l = LEADS[id]; if (!l || k < 1) return null;
  const n = l.steps.length, take = l.steps.slice(0, Math.max(0, n - k + 1));
  return take.every(s => !!s.key) && k <= n + 1 ? take.map(s => s.key!) : null;
}
