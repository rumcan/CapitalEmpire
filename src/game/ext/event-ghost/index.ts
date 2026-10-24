// Ghost previews for the Event tool's structures and the Holes tool's markers (UIX revamp T019): pure blueprints for drawGhostBlueprint.
// Units: tiles of 2 m; money in $.
import { ghostStatus, type GhostBlueprint } from '../ghost-preview';

/** the ghost of an Event structure on its candidate rectangle [x, y, w, h] (tiles): valid with "Name (mode) · $cost" when the check passes and it is affordable, else invalid with the reason */
export function structureGhost(rect: readonly [number, number, number, number], check: { ok: boolean; cost: number; reason?: string }, money: number, name: string, mode: 'rent' | 'buy'): GhostBlueprint {
  const g = ghostStatus(check.ok ? '' : (check.reason || 'Cannot place structure here'), check.cost, money, `${name} (${mode})`);
  return { status: g.status, rects: [{ rect: { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } }], label: g.label, bad: g.bad };
}

/** the ghost of a hole marker moved to tile (x, y): a ring (pin 1.2 tiles, tee 1.6), valid with "Hole N pin" / "Hole N back tee" when the spot is allowed, else invalid with the reason */
export function markerGhost(x: number, y: number, hole: number, kind: 'pin' | 'back' | 'middle' | 'forward', v: { ok: boolean; reason?: string }): GhostBlueprint {
  const g = ghostStatus(v.ok ? '' : (v.reason || 'Invalid placement'), 0, Infinity, `Hole ${hole} ${kind === 'pin' ? 'pin' : kind + ' tee'}`);
  return { status: g.status, rings: [{ cx: x, cy: y, outerR: kind === 'pin' ? 1.2 : 1.6 }], label: g.label, bad: g.bad };
}
