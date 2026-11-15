// #1345: the cliffs of the view's own relief, as the host's model reads them. The view from behind the golfer (Cinderlinks) grows plateaus and rock faces of its
// own round a host's course, never on a hole's line of play (its 03b-realcourse.md); the owner: "ball hit into the cliff just sits there and you have to play it
// from the side of a cliff. can we make Cliff balls a lateral penalty with a drop". The view works out where its relief is a cliff once per course (deterministic:
// grown from the course itself) and sends it as a `cliffs` message (protocol3p.ts CliffsMsg): a grid of 2 m cells in its frame, run-length coded. The host turns it
// into the game's tile frame (cliffMaskOf), keeps it with the course in the save (GolfSave.cliffs3p: a reload's replay of the owner's round reads the same cliffs),
// and the course views answer cliffAt from it (live.ts cliffView: the lie 'cliff' from model version 7). A course with no mask (an older view, the harness, a
// course never opened in the view) has no cliffs. Pure TS, no DOM.
import { TILE_M } from '../types';
import type { Pt } from './types';
import type { CliffsMsg } from './protocol3p';

/** the most cells a mask may hold (a bigger one is refused: the view's own is cut to its marked cells and the reach of play) */
export const CLIFF_MAX_CELLS = 4_000_000;
/** how many courses' masks the save keeps (the newest first) */
export const CLIFF_KEEP = 4;

/** a cliff mask in the game's frame: the course it is for (the course message's id), the north-west corner of its first cell (tiles), its cell (tiles), its width
 *  and height in cells, and its cells run-length coded row by row ([value, count, ...]; 1: a cliff) */
export interface CliffMask { course: string; x0: number; y0: number; cell: number; w: number; h: number; r: number[] }
/** a mask unpacked for reading */
export interface CliffGrid { x0: number; y0: number; cell: number; w: number; h: number; g: Uint8Array }

/** the view's mask in the game's frame: its corner from the view's metres (from the course's centre, y south) to tiles; null when it does not read as one */
export function cliffMaskOf(m: CliffsMsg, centre: Pt): CliffMask | null {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  if (!m || typeof m.course !== 'string' || !ok(m.x0) || !ok(m.y0) || !ok(m.cell) || !(m.cell > 0) || !Number.isInteger(m.w) || !Number.isInteger(m.h) || m.w < 1 || m.h < 1
    || m.w * m.h > CLIFF_MAX_CELLS || !Array.isArray(m.r) || m.r.length % 2 || !m.r.every(ok)) return null;
  return { course: m.course, x0: centre.x + m.x0 / TILE_M, y0: centre.y + m.y0 / TILE_M, cell: m.cell / TILE_M, w: m.w, h: m.h, r: m.r.slice() };
}
/** the mask unpacked (runs past its cells are cut) */
export function cliffGrid(M: CliffMask): CliffGrid {
  const g = new Uint8Array(M.w * M.h); let at = 0;
  for (let k = 0; k + 1 < M.r.length && at < g.length; k += 2) { const n = Math.max(0, Math.min(Math.floor(M.r[k + 1]!), g.length - at)); if (M.r[k]) g.fill(1, at, at + n); at += n; }
  return { x0: M.x0, y0: M.y0, cell: M.cell, w: M.w, h: M.h, g };
}
/** whether the point (tiles) lies in a cliff cell of the grid (outside it: no) */
export function cliffHit(G: CliffGrid | null | undefined, x: number, y: number): boolean {
  if (!G) return false;
  const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((y - G.y0) / G.cell);
  return i >= 0 && j >= 0 && i < G.w && j < G.h && G.g[j * G.w + i] === 1;
}
/** the save's list with this mask in it: the newest first, one per course, at most CLIFF_KEEP */
export function keepCliffs(list: readonly CliffMask[] | undefined, M: CliffMask): CliffMask[] {
  return [M, ...(list ?? []).filter(c => c.course !== M.course)].slice(0, CLIFF_KEEP);
}
