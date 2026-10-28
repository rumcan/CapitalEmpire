// Ghost previews for the Event tool's structures and the Holes tool's markers (UIX revamp T019): pure blueprints for drawGhostBlueprint.
// Units: tiles of 2 m; money in $.
import { ghostStatus, type GhostBlueprint, type GhostStatus } from '../ghost-preview';
import type { TeeKind } from '../../golf/types';
import { TEE_SET } from '../../golf/teesets';

/** the ghost of an Event structure on its candidate rectangle [x, y, w, h] (tiles): valid with "Name (mode) · $cost" when the check passes and it is affordable, else invalid with the reason */
export function structureGhost(rect: readonly [number, number, number, number], check: { ok: boolean; cost: number; reason?: string }, money: number, name: string, mode: 'rent' | 'buy'): GhostBlueprint {
  const g = ghostStatus(check.ok ? '' : (check.reason || 'Cannot place structure here'), check.cost, money, `${name} (${mode})`);
  return { status: g.status, rects: [{ rect: { x: rect[0], y: rect[1], w: rect[2], h: rect[3] } }], label: g.label, bad: g.bad };
}

/** the ghost of a hole marker moved to tile (x, y): a ring (pin 1.2 tiles, tee 1.6), valid with "Hole N pin" / "Hole N back tee" when the spot is allowed, else invalid with the reason */
export function markerGhost(x: number, y: number, hole: number, kind: 'pin' | TeeKind, v: { ok: boolean; reason?: string }): GhostBlueprint {
  const g = ghostStatus(v.ok ? '' : (v.reason || 'Invalid placement'), 0, Infinity, `Hole ${hole} ${kind === 'pin' ? 'pin' : TEE_SET[kind].colour + ' tee'}`);
  return { status: g.status, rings: [{ cx: x, cy: y, outerR: kind === 'pin' ? 1.2 : 1.6 }], label: g.label, bad: g.bad };
}

/** the toll tool's label: the reason, else "N booths · $cost" (invalid when short of the money) */
export function tollGhostLabel(why: string, booths: number, cost: number, money: number): { ok: boolean; status: GhostStatus; label: string; bad: boolean } {
  return ghostStatus(why, cost, money, `${booths} booths`);
}

/** the bus tool's label: the reason; before the first stop is picked, the lot stop's car park (the town's, or #park); after it, the route and its cost (free with the starting kit) */
export function busGhostLabel(why: string, picked: boolean, cost: number, money: number, town: boolean, park: number): { ok: boolean; status: GhostStatus; label: string; bad: boolean } {
  if (!picked) return ghostStatus(why, 0, Infinity, town ? 'Lot stop · town car park' : `Lot stop · car park #${park}`);
  return ghostStatus(why, cost, money, cost ? 'Bus route' : 'Bus route · free (the starting kit)');
}

/** a tool's cursor label whose price can be a refund: the reason; else "summary · $cost" (invalid when short of the money), or "summary · refund $n" when cost < 0 */
export function costLabel(why: string, cost: number, money: number, summary: string): { ok: boolean; status: GhostStatus; label: string; bad: boolean } {
  if (why.trim() || !(cost < 0)) return ghostStatus(why, cost, money, summary);
  return { ok: true, status: 'valid', label: `${summary} · refund $${Math.round(-cost).toLocaleString()}`, bad: false };
}
