// What everyday golf looks like at a minute of the town day (T208, #553): each group's car drives in from the club car park's entrance and parks; its
// golfers walk to the clubhouse's door, check in, walk out to stand behind the first tee, play their round (the golf play's playback, play/view.ts, for
// the groups on screen only: a group off the screen costs a look at its hole), walk back to the car and drive off. Pure TS, no DOM: the engine draws
// the people, the cars and the balls. Minutes are game minutes of the town day; the swings and walk cycles run in real seconds.
import { clipFrame, rowToward } from '../crowdview';
import { GOLFER_CLIPS } from '../library';
import { ADDRESS_TIME, STEP_IN, stateAt, teeSpot, walkMin } from './play/round';
import { PlayView, type PlayBall, type PlayPerson } from './play/view';
import type { CartPaths, PlayCart } from './play/carts';
import type { CourseView, Pt, RoundPlan } from './play/types';
import { holeFrom } from './play/courseview';
import type { DayRoster } from './everyday';

/** a car's drive between the car park's entrance and its bay (game minutes) */
export const DRIVE_MIN = 1.2;
/** a group stands at the clubhouse's desk this long (game minutes) */
export const DESK_MIN = 2;
/** a group's car leaves this long after its last golfer is back at it (game minutes) */
export const LEAVE_MIN = 1.5;
/** a group waiting behind the first tee for groups still to tee off stands this much further back for each (tiles) */
const QUEUE_BACK = 2.4;
/** the golfers of a group stand this far apart across their walk (tiles) */
const SPREAD = 0.7;
/** a hole's box is padded by this many tiles (the wayward balls and the walks off the line) */
const HOLE_PAD = 30;
/** the walk cycle's offset per golfer (real seconds) */
const STEP_S = 0.37;

/** the club's ground as the walks need it: the clubhouse's door, the club car park's bays (point and heading) and its entrance (null: no car park: the
 *  golfers come and go at the door) */
export interface ClubGround { door: Pt; bays: { x: number; y: number; hx: number; hy: number;
  /** T237: the drive from the car park's mouth along its aisles to the aisle point in front of the bay (the car parks nose-in from there), and
   *  the walk from the car to the door (along the aisles to the footpath, then on it); absent or empty: straight */
  drive?: Pt[]; walk?: Pt[] }[]; entrance: Pt | null }
/** T237: the point and heading (unit) u (0..1) of the way along polyline pts, by length */
const P_OUT = { x: 0, y: 0, hx: 0, hy: 0 };
export function polyAt(pts: readonly Pt[], u: number): { x: number; y: number; hx: number; hy: number } {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  let d = Math.max(0, Math.min(1, u)) * L;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!, l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l || i === pts.length - 1) { const k = l > 0 ? Math.min(1, d / l) : 1; P_OUT.x = a.x + (b.x - a.x) * k; P_OUT.y = a.y + (b.y - a.y) * k; P_OUT.hx = l > 0 ? (b.x - a.x) / l : 0; P_OUT.hy = l > 0 ? (b.y - a.y) / l : 0; return P_OUT; }
    d -= l;
  }
  const p = pts[0] ?? { x: 0, y: 0 }; P_OUT.x = p.x; P_OUT.y = p.y; P_OUT.hx = 0; P_OUT.hy = 0; return P_OUT;
}
/** T237: the walk (game minutes) along a polyline: its legs' walks */
function walkPath(pts: readonly Pt[]): number { let m = 0; for (let i = 1; i < pts.length; i++) m += walkMin(pts[i - 1]!, pts[i]!); return m; }
/** a car to draw: its point (tiles), heading angle (radians, atan2 of the tile direction) and its type (0..4) */
export interface DayCar { x: number; y: number; ang: number; type: number }

/** a golfer's day apart from his round: his group, his slot, his first strike (the round takes over at its address), his done minute, where he stands at
 *  the end of his round, and the minutes of his walks (bay to door, door to his place behind the first tee, the end of his round to his car) */
interface Leg { g: number; slot: number; first: number; done: number; end: Pt; spot: Pt; w1: number; w2: number; w3: number }
/** a group's car(s): the bay (index into ground.bays; -1: none free) of each car, its car type, and its minutes: in (parked at arrive), the group back at
 *  the car (back) and gone (leave + DRIVE_MIN) */
interface Trip { bays: number[]; types: number[]; arrive: number; desk: number; back: number; leave: number }

/** the playback of one town day's everyday golf on the club's ground */
export class DayView {
  people: PlayPerson[] = []; balls: PlayBall[] = []; cars: DayCar[] = [];
  /** T213: the carts on the course in the box (the golf play's, play/carts.ts: the visitors and half the members ride) */
  carts: PlayCart[] = [];
  readonly plan: RoundPlan; readonly roster: DayRoster;
  private view: CourseView; private ground: ClubGround; private pv: PlayView;
  private legs: Leg[] = []; private trips: Trip[] = [];
  /** per group: the box of each hole (x0 y0 x1 y1, tiles, padded), the hole it is on found from plan.pace.arrive */
  private boxes: [number, number, number, number][] = [];
  private only: Uint8Array;
  /** T213: the box of the last update (tiles x0 y0 x1 y1) */
  private box = [0, 0, 0, 0];

  constructor(plan: RoundPlan, roster: DayRoster, view: CourseView, ground: ClubGround, paths: CartPaths | null = null) {
    this.plan = plan; this.roster = roster; this.view = view; this.ground = ground; this.pv = new PlayView(plan, view, { paths, home: ground.door });
    // T213: a cart's golfers ride it back to the clubhouse's door after their round, and walk to their car from there
    const cp = this.pv.cartPlay;
    const n = plan.golfers.length; this.only = new Uint8Array(n);
    const first = new Array<number>(n).fill(Infinity);
    for (const s of plan.shots) if (s.stroke === 1 && s.hole === 0 && s.t < first[s.golfer]!) first[s.golfer] = s.t;
    const end = stateAt(plan, view, 1e9), holes = view.holes, door = ground.door;
    this.boxes = holes.map((h, i) => {
      const pts = [...h.line, h.pin, holes[i + 1]?.tee ?? h.pin];
      return [Math.min(...pts.map(p => p.x)) - HOLE_PAD, Math.min(...pts.map(p => p.y)) - HOLE_PAD, Math.max(...pts.map(p => p.x)) + HOLE_PAD, Math.max(...pts.map(p => p.y)) + HOLE_PAD];
    });
    // the cars: each group's cars take the free bays in arrival order (a bay is free again once its car has driven off)
    const free = new Float64Array(ground.bays.length).fill(-Infinity), byArrive = roster.info.map((_, i) => i).sort((a, b) => roster.info[a]!.arrive - roster.info[b]!.arrive);
    this.trips = roster.info.map(() => ({ bays: [], types: [], arrive: 0, desk: 0, back: 0, leave: 0 }));
    plan.groups.forEach((gr, g) => {
      const tr = this.trips[g]!, inf = roster.info[g]!; tr.arrive = inf.arrive;
      gr.players.forEach((id, slot) => {
        const spot = holes.length ? teeSpot(holeFrom(holes[0]!, plan.golfers[id]?.tees), slot) : door, // T254: behind his own set's tee
          e = end[id] ? { x: end[id]!.x, y: end[id]!.y } : door;
        const home = cp ? cp.homeMinute(id) : Infinity, rides = Number.isFinite(home);
        this.legs[id] = { g, slot, first: first[id]!, done: rides ? home : plan.done[id] ?? Infinity, end: rides ? door : e, spot, w1: 0, w2: walkMin(door, spot), w3: 0 };
      });
    });
    for (const g of byArrive) {
      const tr = this.trips[g]!, inf = roster.info[g]!, gr = plan.groups[g]!;
      for (let c = 0; c < inf.cars; c++) {
        let b = -1;
        for (let i = 0; i < free.length; i++) if (free[i]! <= inf.arrive - DRIVE_MIN) { b = i; break; }
        tr.bays.push(b); tr.types.push((gr.players[0]! * 7 + c * 3 + g) % 5);
        if (b >= 0) free[b] = Infinity; // held until its leave is known (below)
      }
      // the walks: from the first car's bay (or the door) to the door and on; back to it after the round
      let back = -Infinity;
      // (T237: along the car park's aisles and its footpath, the way the golfers walk)
      const way = this.wayIn(tr);
      for (const id of gr.players) { const L = this.legs[id]!; L.w1 = walkPath(way); L.w3 = walkPath(this.wayBack(tr, L.end)); back = Math.max(back, L.done + L.w3); }
      tr.desk = tr.arrive + Math.max(...gr.players.map(id => this.legs[id]!.w1)) + DESK_MIN;
      tr.back = back; tr.leave = back + LEAVE_MIN;
      for (const b of tr.bays) if (b >= 0) free[b] = tr.leave + DRIVE_MIN;
    }
    // the first tee's line: a group that reaches its place behind the tee while groups before it have still to tee off stands QUEUE_BACK further back
    // for each of them (they would stand on one spot), and walks up to the tee for its shot
    const h0 = holes[0];
    if (h0) {
      const a = h0.line[1] ?? h0.pin, dx = a.x - h0.tee.x, dy = a.y - h0.tee.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      const lastFirst = plan.groups.map(gr => Math.max(...gr.players.map(id => this.legs[id]!.first)));
      plan.groups.forEach((gr, g) => {
        const at = this.trips[g]!.desk + this.legs[gr.players[0]!]!.w2;
        let rank = 0; plan.groups.forEach((o, k) => { if (k !== g && o.tee < gr.tee && lastFirst[k]! > at) rank++; });
        if (!rank) return;
        for (const id of gr.players) { const L2 = this.legs[id]!; L2.spot = { x: L2.spot.x - ux * QUEUE_BACK * rank, y: L2.spot.y - uy * QUEUE_BACK * rank }; L2.w2 = walkMin(door, L2.spot); }
      });
    }
  }

  /** where a group's car c parks: its bay, else the entrance, else the door */
  private carAt(tr: Trip, c: number): Pt { const b = tr.bays[c] ?? -1; return b >= 0 ? this.ground.bays[b]! : this.ground.entrance ?? this.ground.door; }
  /** T237: a group's walk from its first car to the door: along the car park's aisles and footpath (ClubGround walk), else straight */
  private wayIn(tr: Trip): Pt[] { const b = tr.bays[0] ?? -1, w = b >= 0 ? this.ground.bays[b]!.walk : undefined; return [this.carAt(tr, 0), ...(w ?? []), this.ground.door]; }
  /** T237: a golfer's walk back to the group's first car from where his round ended: to the footpath, then back along it and the aisles */
  private wayBack(tr: Trip, end: Pt): Pt[] { const b = tr.bays[0] ?? -1, w = b >= 0 ? this.ground.bays[b]!.walk : undefined; return [end, ...(w ? [...w].reverse() : []), this.carAt(tr, 0)]; }

  /** the playback at a minute of the town day and real seconds `now`, for the tile box (x0 y0 x1 y1): the people, cars and balls in or near it */
  update(minute: number, now: number, x0: number, y0: number, x1: number, y1: number): void {
    const plan = this.plan, G = plan.groups, only = this.only, ground = this.ground, door = ground.door;
    const inBox = (x: number, y: number, pad = 4) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
    only.fill(0);
    let np = 0, nc = 0;
    const person = (x: number, y: number, golfer: number, row: number, frame: number, lift = 0) => {
      const p = this.people[np] ?? (this.people[np] = { x: 0, y: 0, golfer: 0, row: 0, frame: 0 }); p.x = x; p.y = y; p.golfer = golfer; p.row = row; p.frame = frame; p.lift = lift; np++;
    };
    const car = (x: number, y: number, ang: number, type: number) => { const c = this.cars[nc] ?? (this.cars[nc] = { x: 0, y: 0, ang: 0, type: 0 }); c.x = x; c.y = y; c.ang = ang; c.type = type; nc++; };
    const arrive = (G.length && plan.pace) ? plan.pace.arrive : null;
    for (let g = 0; g < G.length; g++) {
      const tr = this.trips[g]!, gr = G[g]!;
      if (minute < tr.arrive - DRIVE_MIN || minute >= tr.leave + DRIVE_MIN) continue;
      // the cars: driving in, parked, driving off
      for (let c = 0; c < tr.bays.length; c++) {
        const b = tr.bays[c]!; if (b < 0) continue;
        const bay = ground.bays[b]!, e = ground.entrance ?? bay, bayAng = Math.atan2(bay.hy, bay.hx), dr = bay.drive ?? [];
        // (T237: in by the mouth and along the aisles, nose-in; out backing to the aisle and the same way back)
        if (minute < tr.arrive) { const q = polyAt([e, ...dr, bay], (minute - (tr.arrive - DRIVE_MIN)) / DRIVE_MIN); if (inBox(q.x, q.y)) car(q.x, q.y, Math.atan2(q.hy, q.hx), tr.types[c]!); }
        else if (minute < tr.leave) { if (inBox(bay.x, bay.y)) car(bay.x, bay.y, bayAng, tr.types[c]!); }
        else { const q = polyAt([bay, ...[...dr].reverse(), e], (minute - tr.leave) / DRIVE_MIN), back = dr.length && Math.hypot(q.x - bay.x, q.y - bay.y) < Math.hypot(dr[dr.length - 1]!.x - bay.x, dr[dr.length - 1]!.y - bay.y) - 1e-6; if (inBox(q.x, q.y)) car(q.x, q.y, back ? bayAng : Math.atan2(q.hy, q.hx), tr.types[c]!); }
      }
      if (minute < tr.arrive) continue;
      // the group's hole now (T211's arrivals at the tees): its box decides whether its round is played back this frame
      let onScreen = false;
      if (arrive) {
        const A = arrive[g]!; let h = 0; while (h + 1 < A.length && A[h + 1]! <= minute) h++;
        const bx = this.boxes[h]; onScreen = !!bx && bx[2] >= x0 && bx[0] <= x1 && bx[3] >= y0 && bx[1] <= y1;
      }
      for (let s = 0; s < gr.players.length; s++) {
        const id = gr.players[s]!, L = this.legs[id]!, side = (s - (gr.players.length - 1) / 2) * SPREAD;
        if (minute >= L.first - ADDRESS_TIME && minute < L.done) { if (onScreen) only[id] = 1; continue; }
        let px: number, py: number, hx = 0, hy = 0, walking = true;
        if (minute < L.first) {
          // before the round: the car to the door, the desk, the door to his place behind the first tee, waiting there, stepping up to the tee
          const h0 = this.view.holes[0], tee = h0 ? holeFrom(h0, this.plan.golfers[id]?.tees).tee : L.spot, stepMin = Math.max(STEP_IN, walkMin(L.spot, tee));
          const t1 = tr.arrive + L.w1, t2 = tr.desk, t3 = t2 + L.w2, step = L.first - ADDRESS_TIME - stepMin;
          if (minute < t1) { const q = polyAt(this.wayIn(tr), L.w1 > 0 ? (minute - tr.arrive) / L.w1 : 1); px = q.x; py = q.y; hx = q.hx; hy = q.hy; }
          else if (minute < t2) { px = door.x; py = door.y; walking = false; hx = L.spot.x - door.x; hy = L.spot.y - door.y; }
          else if (minute < t3) { const u = L.w2 > 0 ? (minute - t2) / L.w2 : 1; px = door.x + (L.spot.x - door.x) * u; py = door.y + (L.spot.y - door.y) * u; hx = L.spot.x - door.x; hy = L.spot.y - door.y; }
          else if (minute < step) { px = L.spot.x; py = L.spot.y; walking = false; hx = tee.x - L.spot.x; hy = tee.y - L.spot.y; }
          else { const u = Math.min(1, (minute - step) / stepMin); px = L.spot.x + (tee.x - L.spot.x) * u; py = L.spot.y + (tee.y - L.spot.y) * u; hx = tee.x - L.spot.x; hy = tee.y - L.spot.y; }
        } else {
          // after the round: from where he walked off the last green back to the car; in it once he is there
          const t = minute - L.done; if (t >= L.w3) continue;
          const q = polyAt(this.wayBack(tr, L.end), L.w3 > 0 ? t / L.w3 : 1); px = q.x; py = q.y; hx = q.hx; hy = q.hy;
        }
        // side by side across the way they walk
        const Lh = Math.hypot(hx, hy); if (Lh > 0 && walking) { px += -hy / Lh * side; py += hx / Lh * side; }
        if (!inBox(px, py)) continue;
        const row = Lh > 0 ? rowToward(hx, hy) : 0, frame = walking ? clipFrame(GOLFER_CLIPS.walk, now + id * STEP_S) : GOLFER_CLIPS.idle.start;
        person(px, py, id, row, frame);
      }
    }
    // the rounds on screen: the golf play's playback of just those golfers
    // (T213: with their carts, those in the box only: a cart off the screen costs a look at its hole)
    const box = this.box; box[0] = x0; box[1] = y0; box[2] = x1; box[3] = y1; this.pv.box = box;
    this.pv.update(minute, now, null, null, only);
    for (const p of this.pv.people) person(p.x, p.y, p.golfer, p.row, p.frame, p.lift ?? 0);
    this.people.length = np; this.cars.length = nc; this.balls = this.pv.balls; this.carts = this.pv.carts;
  }

  /** the golfers out now: checked in and not yet back at their car (for the clubhouse card) */
  outNow(minute: number): number {
    let n = 0;
    this.plan.groups.forEach((gr, g) => { const tr = this.trips[g]!; if (minute >= tr.arrive && minute < tr.back) n += gr.players.length; });
    return n;
  }
  /** the cars in the car park now */
  parkedNow(minute: number): number { let n = 0; for (const tr of this.trips) if (minute >= tr.arrive && minute < tr.leave) n += tr.bays.filter(b => b >= 0).length; return n; }
}
