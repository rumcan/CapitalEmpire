// The people the renderer draws for the crowd (docs/PEOPLE-IN-GAME.md): the spectators on the galleries, the queues at the gates and the stops,
// the walking parties, each as a sheet row and a frame of the 3D people (library.ts); the golfers' frames come from the golf round's playback
// (golf/play/view.ts). Pure TS, no DOM, no engine: every person is seeded (hash), so a spot keeps its people and their times from frame to frame,
// and the engine only packs the sprites.
import { SPECTATOR_CLIPS, type PeopleClip } from './library';
import { facing } from './ext/pedestrians';
import { WALK_STRIDE } from './event/crowd';
import type { PlacedSeating } from './golf/event-seating';
import { LIMP_S } from './bubble-lines';

/** T212 (#557): the putt clip's impact, seconds into GOLFER_CLIPS.golf_putt (its sheet's impactSecs: render-person-3d.mjs --putt, a hand-keyed
 *  pendulum: the top of the backstroke at 0.5 s, the putter back at the address and the ball struck at 0.8 s, the finish held from 1.05 s) */
export const PUTT_IMPACT_S = 0.8;

/** a person to draw: its tile position, group (0 spectator, 1 golfer), person (its index in the group's people), sheet row (0-7, the rows
 *  S SW W NW N NE E SE) and frame (absolute in that row: the clip's start + k) */
export interface CrowdPerson { x: number; y: number; group: 0 | 1; person: number; row: number; frame: number; /** Authored bench-top height, in metres, for aligning the person's seated hips. */ seatHeightMetres?: number; benchPixelsPerMetre?: number;
  /** T406: how visible he is (0..1; absent: 1): a hurt fan limping out of sight fades */ alpha?: number }

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
function slot(out: CrowdPerson[], s: number): CrowdPerson { const p = out[s] ?? (out[s] = { x: 0, y: 0, group: 0, person: 0, row: 0, frame: 0 }); p.alpha = undefined; return p; }

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

/** T406 (#1090): a fan hit by a ball (bubbles.ts Hurt): his gallery spot and slot, his pose (clutching his knee, limping off, gone for a while), the second the pose
 *  began (the engine's clock) and where his gallery looks (tiles) */
export interface HurtFan { spot: number; slot: number; pose: 'clutch' | 'limp' | 'gone'; since: number; fx: number; fy: number }
/** a hurt fan limps off at this many tiles a second (a hobble) */
export const LIMP_V = 0.45;
/** T406: a hurt fan at slot p: crouched over his knee (the `hurt` clip when the animation runner has made it: SPECTATOR_CLIPS.hurt; until then the crouch of the
 *  sit clip, as the grounds crew's kneeling stand-in), then limping away from his gallery's focus and fading, then out of sight (alpha 0) */
function hurtFan(p: CrowdPerson, h: HurtFan, now: number): void {
  const C = SPECTATOR_CLIPS as Record<string, PeopleClip>, clip = C.hurt ?? C.sit!, t = Math.max(0, now - h.since);
  if (h.pose === 'clutch') { p.frame = clipFrame(clip, clip.times[0]! + t); return; }
  const dx = p.x - h.fx, dy = p.y - h.fy, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, u = h.pose === 'gone' ? LIMP_S : Math.min(t, LIMP_S);
  p.x += ux * LIMP_V * u; p.y += uy * LIMP_V * u; p.row = rowToward(ux, uy); p.frame = at(C.walk!, u * 0.55);
  p.alpha = h.pose === 'gone' ? 0 : u > LIMP_S - 1.2 ? Math.max(0, (LIMP_S - u) / 1.2) : undefined;
}

/** Gallery buffer x/y/fans/kind/focus/aim at float offset o. Standing fans retain their seeded informal rows (up to 60); stands draw up to 90
 *  samples of occupied authored seats, preserving exact positions, aisle gaps, bank facings and bench heights. Larger stands sample across
 *  their occupied rows rather than changing gameplay capacity. Without supplied geometry the legacy stand view is only an estimate.
 *  T377: a standing gallery with `places` (a tee's arc and a green's ring: golf/galleries.ts galleryPlaces, x y x y ... best first) puts its first n fans on the first
 *  n places (up to 90), each a little off its place (a 0.28 tile jitter), facing the focus; the fans past the places are not drawn.
 *  Reuses out objects; cheer >= 0 is seconds since a nearby birdie and keeps the existing clap/cheer animation clips. */
export function galleryPeople(G: ArrayLike<number>, o: number, spot: number, now: number, people: number, out: CrowdPerson[], cheer = -1, seating?: PlacedSeating, places?: ArrayLike<number>, hurt?: readonly HurtFan[]): number {
  const x = G[o]!, y = G[o + 1]!, stand = G[o + 3] === 2, fx = G[o + 4]!, fy = G[o + 5]!, spread = !stand && !!places && places.length >= 2;
  const occupied = Math.max(0, Math.min(Math.round(G[o + 2]!), stand && seating ? seating.count : Infinity));
  const n = Math.min(occupied, stand ? 90 : spread ? Math.min(90, places!.length >> 1) : 60);
  if (people <= 0 || n <= 0) return 0;
  unit(fx - x, fy - y);
  const ux = U[0], uy = U[1], vx = -uy, vy = ux, perRow = stand ? Math.max(1, Math.ceil(Math.sqrt(n * 2))) : 10, seatRow = rowToward(ux, uy);
  for (let s = 0; s < n; s++) {
    const r = Math.floor(s / perRow), along = (s % perRow - (perRow - 1) / 2) * 0.55, back = r * 0.6;
    let px = x + vx * along - ux * back + (hash(spot, s * 3) - 0.5) * 0.24, py = y + vy * along - uy * back + (hash(spot, s * 3 + 1) - 0.5) * 0.24;
    if (spread) { px = places![2 * s]! + (hash(spot, s * 3) - 0.5) * 0.28; py = places![2 * s + 1]! + (hash(spot, s * 3 + 1) - 0.5) * 0.28; }
    const lt = ((now + hash(spot * 7 + 1, s) * 20) % 20 + 20) % 20, p = slot(out, s);
    p.x = px; p.y = py; p.group = 0; p.person = Math.floor(hash(spot, s * 3 + 2) * people);
    p.row = stand ? seatRow : rowToward(fx - px, fy - py);
    p.seatHeightMetres = stand ? 0.45 + r * 0.35 : undefined;
    p.benchPixelsPerMetre = stand ? seating?.verticalPixelsPerMetre ?? 32 : undefined;
    if (stand && seating) {
      const at = (occupied > n ? Math.floor((s + 0.5) * occupied / n) : s) * 5, seats = seating.seats;
      p.x = seats[at]!; p.y = seats[at + 1]!; p.seatHeightMetres = seats[at + 2]!; p.row = rowToward(seats[at + 3]!, seats[at + 4]!);
    }
    p.frame = stand ? seatFrame(spot, s, lt) : standFrame(spot, s, lt);
    if (cheer >= 0) { const ct = cheer - hash(spot, s + 300) * CHEER_SPREAD; if (ct >= 0) p.frame = stand ? at(SPECTATOR_CLIPS.sit_clap, ct) : at(SPECTATOR_CLIPS.cheer, ct); }
    // (T406: a fan hit by a ball: the gag's pose; none hurt, the usual: this costs a length check)
    if (hurt !== undefined && hurt.length > 0 && !stand) for (let q = 0; q < hurt.length; q++) { const h = hurt[q]!; if (h.spot === spot && h.slot === s) { hurtFan(p, h, now); break; } }
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
    p.x = px; p.y = py; p.group = 0; p.person = Math.floor(hash(key, s * 3 + 2) * people); p.row = rowToward(fx - px, fy - py); p.frame = SPECTATOR_CLIPS.idle.start; p.seatHeightMetres = undefined; p.benchPixelsPerMetre = undefined;
  }
  return n;
}

/** a walking party, the walker group at float offset o of the 7-float walker buffer (x, y, n, stage, tx, ty, id: the point it is heading for now, and its own
 *  number): min(round(n), 3) people who walk together and not in step (T377, #1033, the owner: "spectators walking in step 3 at a time"): each has his own
 *  pace (the walk loop at 0.85 to 1.15 of its rate), phase, a place along the heading that drifts (a person is ahead of the others, then behind) and a place across
 *  it that drifts, all from the group's id and his number (the id is the walker's own, not its index in the buffer, so a person is the same person from frame to
 *  frame). The group faces its heading. Writes into out; returns the count. stride 6 reads the old buffer (idx is then the seed) */
export function walkerPeople(W: ArrayLike<number>, o: number, idx: number, now: number, people: number, out: CrowdPerson[], stride = WALK_STRIDE): number {
  const x = W[o]!, y = W[o + 1]!, k = Math.min(Math.round(W[o + 2]!), 3);
  if (people <= 0 || k <= 0) return 0;
  const id = stride > 6 ? W[o + 6]! : idx;
  unit(W[o + 4]! - x, W[o + 5]! - y);
  const ux = U[0], uy = U[1], vx = -uy, vy = ux, row = rowToward(ux, uy), C = SPECTATOR_CLIPS.walk;
  for (let j = 0; j < k; j++) {
    const s = 11 + j * 7, h1 = hash(id, s), h2 = hash(id, s + 1), h3 = hash(id, s + 2), h4 = hash(id, s + 3), h5 = hash(id, s + 4), h6 = hash(id, s + 5), c = j - (k - 1) / 2;
    // the pace and the phase: the clip at 0.85 to 1.15 of its rate, from a start of his own
    const frame = at(C, now * (0.85 + 0.3 * h1) + h2 * 3);
    // along the heading: his place in the party (0.35 to 0.75 tiles apart) and a slow drift of 0.45 (a period of 5 to 11 s); across it: 0.35 to 0.6 apart, drifting 0.15
    const along = c * (0.35 + 0.4 * h3) + Math.sin(now * (0.55 + 0.6 * h4) + h5 * 6.2832) * 0.45, across = c * (0.35 + 0.25 * h4) + Math.sin(now * (0.3 + 0.35 * h6) + h1 * 6.2832) * 0.15, p = slot(out, j);
    p.x = x + ux * along + vx * across; p.y = y + uy * along + vy * across; p.group = 0; p.person = Math.floor(hash(id, j) * people); p.row = row; p.frame = frame; p.seatHeightMetres = undefined; p.benchPixelsPerMetre = undefined;
  }
  return k;
}
