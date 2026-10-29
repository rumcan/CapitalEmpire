// T269 (#810) part 2: what the grounds crew looks like at a minute of the town day (golf/crew.ts's day played back): each worker on his leg, on foot
// or riding, and the carts and mowers, his own and parked ones. With #821's caps the workers walk after the schedule at the walk cap and ride at the
// cart cap (play/pacer.ts: a long drive between holes is faded, as the golfers' walks are). Pure TS, no DOM: the engine draws the people (stand-ins
// until the art lands: GOLF-SPRITES.md "Grounds crew") and the vehicles. Reused arrays: no allocation per frame once warm.
import { clipFrame, rowToward } from '../crowdview';
import { SPECTATOR_CLIPS } from '../library';
import { Pacer } from './play/pacer';
import { legIndex, type CrewDay, type CrewLeg, type Role, type Veh } from './crew';

/** a worker to draw: his point (tiles), his role, his body row and clip frame, how visible (the pacer's fade), and his lift (world px: on a seat) */
export interface CrewPerson { x: number; y: number; role: Role; k: number; row: number; frame: number; alpha: number; lift: number }
/** a vehicle to draw: its point, its kind, its heading (tiles, unnormalised) and how visible */
export interface CrewThing { x: number; y: number; veh: Veh; hx: number; hy: number; alpha: number }
/** the caps the crew move at, tiles a sim second (null: the schedule as it is) */
export interface CrewPace { walk: number; cart: number }

/** a walk cycle's offset per worker (real seconds), and a rake stroke's slower step */
const STEP_S = 0.41, RAKE_STEP = 0.5;
/** a seated worker is drawn this high on his seat (world px) */
const SEAT_LIFT = 7;
/** the walk-behind runs this far ahead of the man pushing it (tiles) */
const PUSH_AHEAD = 0.55;

const moving = (a: CrewLeg['act']) => a === 'walk' || a === 'drive' || a === 'mow' || a === 'push' || a === 'rake';
const riding = (l: CrewLeg) => l.veh !== 'none' && l.veh !== 'push';

export class CrewView {
  people: CrewPerson[] = []; things: CrewThing[] = [];
  readonly day: CrewDay;
  private walkers: Pacer | null = null; private riders: Pacer | null = null;
  constructor(day: CrewDay, pace: CrewPace | null = null) {
    this.day = day;
    if (pace) { this.walkers = new Pacer(day.workers.length, pace.walk); this.riders = new Pacer(day.workers.length, pace.cart); }
  }
  /** the crew at game minute `minute` and real seconds `now`, sim seconds simT (rate: game minutes a sim second now), in the tile box x0 y0 x1 y1 */
  update(minute: number, now: number, x0: number, y0: number, x1: number, y1: number, simT = 0, rate = 1): void {
    const R = rate > 0 ? rate : 1, W = this.day.workers;
    let np = 0, nt = 0;
    const inBox = (x: number, y: number) => x >= x0 - 3 && x <= x1 + 3 && y >= y0 - 3 && y <= y1 + 3;
    const thing = (x: number, y: number, veh: Veh, hx: number, hy: number, alpha: number) => {
      if (!inBox(x, y)) return;
      const t = this.things[nt] ?? (this.things[nt] = { x: 0, y: 0, veh: 'none', hx: 0, hy: 0, alpha: 1 }); t.x = x; t.y = y; t.veh = veh; t.hx = hx; t.hy = hy; t.alpha = alpha; nt++;
    };
    for (let k = 0; k < W.length; k++) {
      const w = W[k]!, li = legIndex(w, minute), l = li >= 0 ? w.legs[li]! : null; if (!l || l.act === 'away') continue;
      const u = l.t1 > l.t0 ? Math.min(1, Math.max(0, (minute - l.t0) / (l.t1 - l.t0))) : 1;
      let x = l.ax + (l.bx - l.ax) * u, y = l.ay + (l.by - l.ay) * u, hx = l.bx - l.ax, hy = l.by - l.ay, alpha = 1, walked = moving(l.act) && (hx !== 0 || hy !== 0);
      // the heading of a leg that stays: the next leg's way (a kneel faces the cup he walked to)
      if (!walked) { const n = w.legs[li + 1]; if (n) { hx = n.bx - n.ax; hy = n.by - n.ay; } if (hx === 0 && hy === 0) { hx = 1; hy = 1; } }
      const P = riding(l) ? this.riders : this.walkers;
      if (P) {
        P.step(k, x, y, moving(l.act) ? l.bx : x, moving(l.act) ? l.by : y, false, now, simT, (l.t1 - minute) / R);
        x = P.x; y = P.y; alpha = P.alpha; if (P.walked) { hx = P.hx; hy = P.hy; walked = true; } else if (moving(l.act)) walked = false;
      }
      // his parked cart or mower, where it stands while he works on foot
      if (Number.isFinite(l.px)) thing(l.px, l.py, l.pveh, 1, 1, 1);
      if (!inBox(x, y)) continue;
      const ride = riding(l);
      if (ride) thing(x, y, l.veh, hx, hy, alpha);
      if (l.veh === 'push') { const L = Math.hypot(hx, hy) || 1; thing(x + hx / L * PUSH_AHEAD, y + hy / L * PUSH_AHEAD, 'push', hx, hy, alpha); }
      const clips = SPECTATOR_CLIPS, frame = ride || l.act === 'kneel' ? clips.sit.start : walked ? clipFrame(clips.walk, (now + k * STEP_S) * (l.act === 'rake' ? RAKE_STEP : 1)) : clips.idle.start;
      const p = this.people[np] ?? (this.people[np] = { x: 0, y: 0, role: 'gk', k: 0, row: 0, frame: 0, alpha: 1, lift: 0 });
      p.x = x; p.y = y; p.role = w.role; p.k = w.k; p.row = rowToward(hx, hy); p.frame = frame; p.alpha = alpha; p.lift = ride ? SEAT_LIFT : 0; np++;
    }
    this.people.length = np; this.things.length = nt;
  }
}

/** where hole n's flag stands at minute m: yesterday's cup until the greenkeeper sets today's (the day's cup event), then today's; a hole whose cup is
 *  not changed today has no event (today's is yesterday's) */
export function cupSetAt(day: CrewDay | null, n: number): number | null {
  if (!day) return null;
  for (const c of day.cups) if (c.hole === n) return c.t;
  return null;
}
