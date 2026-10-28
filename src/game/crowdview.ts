// The people the renderer draws for the crowd (docs/PEOPLE-IN-GAME.md): the spectators on the galleries, the queues at the gates and the stops,
// the walking parties, each as a sheet row and a frame of the 3D people (library.ts); the golfers' frames come from the golf round's playback
// (golf/play/view.ts). Pure TS, no DOM, no engine: every person is seeded (hash), so a spot keeps its people and their times from frame to frame,
// and the engine only packs the sprites.
import { SPECTATOR_CLIPS, type PeopleClip } from './library';
import { facing } from './ext/pedestrians';

/** a person to draw: its tile position, group (0 spectator, 1 golfer), person (its index in the group's people), sheet row (0-7, the rows
 *  S SW W NW N NE E SE) and frame (absolute in that row: the clip's start + k) */
export interface CrowdPerson { x: number; y: number; group: 0 | 1; person: number; row: number; frame: number }

/** a deterministic hash of two integers: a float in [0, 1) (the seeds of every person, place and time) */
export function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** the frame (absolute: start + k) of a clip t seconds in, on the clip's own time axis (`times`: frame k shows from times[k] to the next; the last
 *  lasts the mean gap). A loop wraps after its last frame, a one-shot holds it; before the first time: the first frame */
export function clipFrame(clip: PeopleClip, t: number): number {
  const { start, n, times, loop } = clip;
  if (n <= 1) return start;
  const t0 = times[0]!, span = times[n - 1]! - t0, total = span + span / (n - 1);
  let u = t - t0;
  if (u <= 0 || total <= 0) return start;
  if (loop) u %= total;
  for (let k = n - 1; k > 0; k--) if (u >= times[k]! - t0) return start + k;
  return start;
}

/** the frame of clip c t seconds from its start (the clip's times start at their first value, so t = 0 is its first frame) */
const at = (c: PeopleClip, t: number): number => clipFrame(c, c.times[0]! + t);

/** the sheet row of a move (dx, dy) in tiles (see facing) */
export function rowToward(dx: number, dy: number): number { return facing(dx, dy); }

/** the body row of a right-handed golfer aiming along the tile direction (ax, ay): the aim turned 90 degrees clockwise on screen, so the pin is on
 *  the golfer's left (the swing's `shot`). Screen X = x - y, Y = (x + y) / 2; turned (X, Y) -> (-Y, X); back to tiles x = Y + X / 2, y = Y - X / 2 */
export function golferRow(ax: number, ay: number): number {
  const X = ax - ay, Y = (ax + ay) / 2;
  return facing(X - Y / 2, X + Y / 2);
}

/** the unit vector of (dx, dy) written into U (the diagonal, toward the screen's bottom, for none): no allocation per call */
const U = new Float64Array(2);
function unit(dx: number, dy: number): void {
  const L = Math.hypot(dx, dy);
  if (L > 1e-6) { U[0] = dx / L; U[1] = dy / L; } else { U[0] = 0.7071; U[1] = 0.7071; }
}

/** T213: a gallery's cheer starts over this many real seconds across its fans (not all at once) */
const CHEER_SPREAD = 0.4;

/** the person object at slot s of out (made on first use, then reused) */
function slot(out: CrowdPerson[], s: number): CrowdPerson { return out[s] ?? (out[s] = { x: 0, y: 0, group: 0, person: 0, row: 0, frame: 0 }); }

/** a standing fan's frame at local time lt of its 20 s cycle: a clap (a loop, 3 s) for half the fans, a cheer (one-shot) now and then, else idle */
function standFrame(spot: number, s: number, lt: number): number {
  const C = SPECTATOR_CLIPS;
  if (lt < 3 && hash(spot, s + 100) < 0.5) return at(C.clap, lt);
  if (lt >= 3 && lt < 4.2 && hash(spot, s + 200) < 0.15) return at(C.cheer, lt - 3);
  return C.idle.start;
}

/** a seated fan's frame at lt: the sit loop, or the sit-and-clap loop for 3 s on half the fans */
function seatFrame(spot: number, s: number, lt: number): number {
  const C = SPECTATOR_CLIPS;
  return lt < 3 && hash(spot, s + 100) < 0.5 ? at(C.sit_clap, lt) : at(C.sit, lt);
}

/** the spectators of a gallery spot at float offset o of the 8-float gallery buffer (x, y, fans, kind, fx, fy, ax, ay; kind 2 a grandstand):
 *  min(fans, 60) standing fans (a grandstand: min(fans, 90) seated) in rows across the line to the focus (fx, fy), each row 0.6 tiles back from the
 *  one before, 0.55 tiles apart across it, jitter 0.12; each faces the focus (a grandstand's seats face fx, fy, each row a step higher). Seeded by
 *  the spot index and the slot. Writes into out from 0 (reusing its objects); returns the count (0 with no people). T213: `cheer` (>= 0: the real
 *  seconds since a golfer near it holed a birdie or better) has the fans cheer (the cheer clip, each a moment apart; seated fans clap) */
export function galleryPeople(G: ArrayLike<number>, o: number, spot: number, now: number, people: number, out: CrowdPerson[], cheer = -1): number {
  const x = G[o]!, y = G[o + 1]!, stand = G[o + 3] === 2, fx = G[o + 4]!, fy = G[o + 5]!;
  const n = Math.min(Math.round(G[o + 2]!), stand ? 90 : 60);
  if (people <= 0 || n <= 0) return 0;
  unit(fx - x, fy - y);
  const ux = U[0], uy = U[1], vx = -uy, vy = ux, perRow = stand ? 12 : 10, seatRow = rowToward(ux, uy);
  for (let s = 0; s < n; s++) {
    const r = Math.floor(s / perRow), along = (s % perRow - (perRow - 1) / 2) * 0.55, back = r * 0.6;
    let px = x + vx * along - ux * back + (hash(spot, s * 3) - 0.5) * 0.24, py = y + vy * along - uy * back + (hash(spot, s * 3 + 1) - 0.5) * 0.24;
    if (stand) { px -= r * 0.35; py -= r * 0.35; }   // a grandstand's rows also climb the screen
    const lt = ((now + hash(spot * 7 + 1, s) * 20) % 20 + 20) % 20, p = slot(out, s);
    p.x = px; p.y = py; p.group = 0; p.person = Math.floor(hash(spot, s * 3 + 2) * people);
    p.row = stand ? seatRow : rowToward(fx - px, fy - py);
    p.frame = stand ? seatFrame(spot, s, lt) : standFrame(spot, s, lt);
    if (cheer >= 0) { const ct = cheer - hash(spot, s + 300) * CHEER_SPREAD; if (ct >= 0) p.frame = stand ? at(SPECTATOR_CLIPS.sit_clap, ct) : at(SPECTATOR_CLIPS.cheer, ct); }
  }
  return n;
}

/** a queue at a stop or a gate: min(count, 24) people standing idle on a 4-wide grid 0.7 tiles apart, centred on (x, y), its rows along the line
 *  to (fx, fy), each facing it. Seeded by key (the stop's route, or -1 - the gate) and the slot (jitter 0.1). Writes into out; returns the count */
export function queuePeople(x: number, y: number, fx: number, fy: number, count: number, key: number, _now: number, people: number, out: CrowdPerson[]): number {
  const n = Math.min(Math.round(count), 24);
  if (people <= 0 || n <= 0) return 0;
  unit(fx - x, fy - y);
  const ux = U[0], uy = U[1], vx = -uy, vy = ux, rows = Math.ceil(n / 4);
  for (let s = 0; s < n; s++) {
    const along = (s % 4 - 1.5) * 0.7, back = (Math.floor(s / 4) - (rows - 1) / 2) * 0.7;
    const px = x + vx * along - ux * back + (hash(key, s * 3) - 0.5) * 0.2, py = y + vy * along - uy * back + (hash(key, s * 3 + 1) - 0.5) * 0.2, p = slot(out, s);
    p.x = px; p.y = py; p.group = 0; p.person = Math.floor(hash(key, s * 3 + 2) * people); p.row = rowToward(fx - px, fy - py); p.frame = SPECTATOR_CLIPS.idle.start;
  }
  return n;
}

/** a walking party, the walker group idx at float offset o of the 6-float walker buffer (x, y, n, stage, tx, ty): min(round(n), 3) people side by
 *  side across the heading (toward its target), 0.4 tiles apart, facing it, on the walk loop (one phase for the party, its own by idx). Writes into
 *  out; returns the count */
export function walkerPeople(W: ArrayLike<number>, o: number, idx: number, now: number, people: number, out: CrowdPerson[]): number {
  const x = W[o]!, y = W[o + 1]!, k = Math.min(Math.round(W[o + 2]!), 3);
  if (people <= 0 || k <= 0) return 0;
  unit(W[o + 4]! - x, W[o + 5]! - y);
  const ux = U[0], uy = U[1], vx = -uy, vy = ux, row = rowToward(ux, uy), frame = at(SPECTATOR_CLIPS.walk, now + hash(idx, 9) * 2);
  for (let j = 0; j < k; j++) {
    const along = (j - (k - 1) / 2) * 0.4, p = slot(out, j);
    p.x = x + vx * along; p.y = y + vy * along; p.group = 0; p.person = Math.floor(hash(idx, j) * people); p.row = row; p.frame = frame;
  }
  return k;
}
