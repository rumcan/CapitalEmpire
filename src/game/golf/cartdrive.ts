// T351 (#994, the owner, 2026-11-08: "why does the golf cart not look natural when driving?"): how your golf cart handles. It kept the character's walk: it set off at full pace, turned
// on the spot (its facing snapped to the key's direction) and stopped dead. Now it pulls away and rolls to a stop, and under the keys it STEERS: its heading turns toward the way you point
// it (a quarter turn in about 0.3 s, a little slower from rest) and it drives along that heading, so it takes a bend in an arc and never slides sideways. Its picture is the nearest
// of the eight to the heading (golf/cartart.ts), so a turn steps through the neighbouring pictures. A click's route is followed exactly as before (the polyline the A* pulled
// straight: it must not cut a corner off the ground it keeps clear of); only its pace eases in and out and its picture's heading turns toward each leg. Pure TS, no DOM: the engine
// hands it the character record (golf/you.ts), the keys and `ok`, the ground the cart may be on. Allocation-free per frame.
import { facing } from '../ext/pedestrians';
import { FRAMES_PER_TILE, keyDir, paceOf, remaining, stepYou, stopWalk, type You } from './you';
import { headingOf, turnToward } from './play/cartturn';

/** how fast the heading turns (radians a second, at full speed): a quarter turn in 0.3 s */
export const TURN_RATE = Math.PI / 2 / 0.3;
/** the share of the turn rate a cart at rest has (it turns as it moves off: the rate rises with its speed) */
export const TURN_AT_REST = 0.35;
/** seconds to pull away to full pace, and to roll to a stop from it */
export const SPEED_UP_S = 0.45, SPEED_DOWN_S = 0.3;
/** the slowest a driven cart goes (a share of its pace: from rest it starts here and picks up; at the end of a route it creeps in at twice this) */
export const V_MIN = 0.06;

/** the tile-space heading (atan2(hy, hx)) of a facing (0-7, the people sheets' rows S SW W NW N NE E SE): facing f is the direction at 45 + 45 f degrees */
export const faceAngle = (face: number): number => ((face + 1) * Math.PI) / 4;

const KD: [number, number] = [0, 0];
/** your cart's driving state: the heading it is drawn with (tile-space radians) and its speed as a share of its pace */
export class CartDrive {
  /** the heading the cart is drawn and driven with (tile-space radians, atan2(hy, hx)) */
  ang = 0;
  /** its speed as a share of its pace (0 standing, 1 at full pace) */
  v = 0;
  /** the keys were let go and it rolls on along its heading while its speed dies away */
  coasting = false;
  private target = 0; private lastFace = -1; private px = 0; private py = 0;

  /** the cart put down (placed, loaded, brought): standing, on its facing */
  reset(c: You): void { this.ang = this.target = faceAngle(c.face); this.v = 0; this.coasting = false; this.lastFace = c.face; this.px = c.x; this.py = c.y; }

  /** a frame of driving along the heading at `v` of the cart's pace: slides along what blocks it as the walk does (each tile axis alone). True when it moved */
  private roll(c: You, run: boolean, dt: number, ok: (x: number, y: number) => boolean): boolean {
    c.keys = true; c.swing = -1;
    const s = paceOf(c, run) * this.v * dt, dx = Math.cos(this.ang) * s, dy = Math.sin(this.ang) * s;
    let moved = false;
    if (ok(c.x + dx, c.y + dy)) { c.x += dx; c.y += dy; moved = true; }
    else if (dx && ok(c.x + dx, c.y)) { c.x += dx; moved = true; }
    else if (dy && ok(c.x, c.y + dy)) { c.y += dy; moved = true; }
    if (s > 1e-9) c.face = facing(Math.cos(this.ang), Math.sin(this.ang));
    if (moved) c.phase += s * FRAMES_PER_TILE * (run ? 0.75 : 1);
    return moved;
  }

  /** a frame with the keys down (kx, ky: -1, 0 or 1 on the screen's axes; run: Shift): the heading turns toward the keys' direction, the pace picks up, the cart drives along the
   *  heading. Any route stops. True when it moved */
  keys(c: You, kx: number, ky: number, run: boolean, dt: number, ok: (x: number, y: number) => boolean): boolean {
    if (c.moving) stopWalk(c);
    keyDir(kx, ky, KD); const want = headingOf(KD[0], KD[1]);
    this.v = Math.min(1, Math.max(this.v, V_MIN) + dt / SPEED_UP_S);
    this.ang = turnToward(this.ang, want, TURN_RATE * Math.max(TURN_AT_REST, this.v) * dt); this.target = this.ang; this.coasting = true;
    return this.roll(c, run, dt, ok);
  }

  /** a frame with no keys down: rolling on after them (the speed dies away along the heading), else following the route it has (its pace eased in and out: it slows over the last
   *  half second's drive), else standing. True on the frame a route ends */
  free(c: You, dt: number, ok: (x: number, y: number) => boolean): boolean {
    if (this.coasting && !c.moving) {
      this.v = Math.max(0, this.v - dt / SPEED_DOWN_S); this.target = this.ang;
      if (this.v <= V_MIN) { this.v = 0; this.coasting = false; c.keys = false; return false; }
      this.roll(c, false, dt, ok); return false;
    }
    this.coasting = false; c.keys = false;
    if (!c.moving) { this.v = 0; return false; }
    const pace = paceOf(c, c.run), brake = Math.min(1, Math.max(2 * V_MIN, remaining(c) / (pace * SPEED_DOWN_S * 0.5)));
    this.v = Math.min(brake, Math.min(1, Math.max(this.v, V_MIN) + dt / SPEED_UP_S));
    const speed = c.speed; c.speed = speed * this.v;
    const arrived = stepYou(c, dt);
    c.speed = speed;
    if (arrived) this.v = 0;
    return arrived;
  }

  /** the heading after the frame (call it every frame): under the keys it is the steering's own; on a route it turns toward the way the cart went this frame; a facing the game
   *  set from outside (the cart turned to you on arriving, put down facing a tee) is turned to, not jumped to. At rest it keeps its heading */
  look(c: You, dt: number): void {
    const dx = c.x - this.px, dy = c.y - this.py; this.px = c.x; this.py = c.y;
    if (c.keys) { this.lastFace = c.face; return; }
    if (c.moving && Math.hypot(dx, dy) > 1e-6) this.target = headingOf(dx, dy);
    else if (c.face !== this.lastFace) this.target = faceAngle(c.face);
    this.lastFace = c.face;
    this.ang = turnToward(this.ang, this.target, TURN_RATE * dt);
  }
}
