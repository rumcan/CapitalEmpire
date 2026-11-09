// The range ball loop (T386, #1043; the owner, 2026-11-08, after Find The Needle: "we do need some progression and automation"). The driving
// range's balls are a small economy the player works by hand at first and automates later: every bucket sold takes balls out of the ball room,
// every ball hit lands on the outfield and STAYS there until somebody picks it up, and when the ball room runs out the bays sit empty. You walk
// out (Walk mode), pick balls up by hand (hold F over them, or click a pile), fill a basket and carry it back; money buys better tools (a ball
// tube, a push picker, a cart that tows a picker, a wider gang picker, night picking), later staff and machines (golf/rangetree.ts, PR 2 and 3).
// No belts: each stage has a throughput (balls an hour) and a flow panel (PR 2) shows where it jams.
// Pure TS, no DOM, no engine: golf/rangebiz.ts (RangeSim) lands and sells the balls, golf/rangehost.ts hands them to the engine to draw and
// to your character to pick, golf/rangesave.ts keeps the save. Everything here works on a plain BallSave (the save as it is: no class), so a
// save, a load and a test are the same object. Times are sim seconds; positions are tiles (2 m); a ball is one range ball.

/** the town day the numbers below are said for (the 10-minute default, rangesave.ts rangeScale): visits and machines scale with the day's length so
 *  the balls an hour and the money an hour stay the same in real time whatever day length the owner sets */
export const REF_DAY = 600;
/** the balls in a golfer's bucket (one visible golfer = one bucket in the ball loop: it stands for rangeScale customers in the money, but its balls
 *  are the balls you see and pick up) at the reference day; visitBalls scales it with the day's length */
export const BALLS_VISIT = 40;
/** the most balls lying on the outfield: past it a ball that lands is lost in the rough (a range that is never picked loses balls) */
export const FIELD_CAP = 8000;
/** the clean balls a new game's ball room starts with (5 buckets: its first sales are the range's first money, then the outfield is the supply), and what a save from before T386 gets per hitting bay (legacyBalls) */
export const START_BALLS = 200;
export const LEGACY_BALLS_A_BAY = 900;
/** the balls lost overnight (a new town day): the share of those lying on the outfield (trodden in, kicked into the rough, taken by kids) and the
 *  share of the ball room's stock that wears out (cut, cracked) */
export const DAY_LOSS_FIELD = 0.02, DAY_LOSS_STOCK = 0.004;
/** the supplier (a tree node): a case of balls, what a ball costs ($: more than a ball earns at the dearest bucket, so ordering is never the loop,
 *  only a top-up), and the cases it delivers a town day */
export const CASE_BALLS = 120, BALL_COST = 8.5, CASES_A_DAY = 3;
/** the dump zone round the ball room (tiles): your basket (on foot) or your cart's hopper is emptied into the ball room within it */
export const DUMP_REACH = 2.6;
/** a landing's scatter (tiles): the other balls of a swing land this far, about, from the one you see (every ball lies where it landed until it is picked
 *  up or lost) */
export const SCATTER = 1.5;

/** who picked a ball up: you by hand or tube, you with the push picker, you in the cart, the night cart, a range attendant, a robot, a net's chute */
export type PickBy = 'hand' | 'push' | 'cart' | 'night' | 'staff' | 'robot' | 'net';
export const PICK_BY: readonly PickBy[] = ['hand', 'push', 'cart', 'night', 'staff', 'robot', 'net'];
/** a span's ball counts: balls hit, sold, lost and bought, and the balls picked up by each way of picking */
export interface BallCounts { hit: number; sold: number; lost: number; bought: number; picked: Record<PickBy, number> }
/** the range's balls in the save (golf.range.balls): the clean balls in the ball room, the balls with golfers who have bought them and not yet hit
 *  them all (the sim's), the balls in your basket and in your cart's hopper, the balls lying on the outfield (x y pairs, tiles, two decimals), the
 *  range's till ($: what the range has taken, less what it has spent on its own gear: the ball loop's tools, staff and machines are bought with it),
 *  today's counts and the lifetime's, and the town day the day's counts are for */
export interface BallSave { v: 1; clean: number; inPlay: number; basket: number; hopper: number; field: number[]; till: number; day: BallCounts; total: BallCounts; dayNo: number }

const noPicks = (): Record<PickBy, number> => ({ hand: 0, push: 0, cart: 0, night: 0, staff: 0, robot: 0, net: 0 });
export const zeroCounts = (): BallCounts => ({ hit: 0, sold: 0, lost: 0, bought: 0, picked: noPicks() });
/** a new game's balls: START_BALLS clean in the ball room, nothing on the outfield, an empty till */
export function newBalls(): BallSave { return { v: 1, clean: START_BALLS, inPlay: 0, basket: 0, hopper: 0, field: [], till: 0, day: zeroCounts(), total: zeroCounts(), dayNo: -1 }; }
/** the balls a save from before T386 starts with (it never ran out: the balls were picked at once, or by the cart each night): its bays' share, so
 *  an existing range does not suddenly run dry; its till is its lifetime takings to LEGACY_TILL_CAP (the grown range has money to spend on the new gear) */
export const LEGACY_TILL_CAP = 40000;
export function legacyBalls(bays: number, takings: number): BallSave {
  const b = newBalls(); b.clean = Math.max(START_BALLS, Math.round(Math.max(1, bays) * LEGACY_BALLS_A_BAY)); b.till = Math.round(Math.max(0, Math.min(LEGACY_TILL_CAP, Number.isFinite(takings) ? takings : 0))); return b;
}
/** the balls a golfer's bucket holds at a town day of dayLen sim seconds */
export const visitBalls = (dayLen: number): number => Math.max(8, Math.round(BALLS_VISIT * Math.max(24, dayLen) / REF_DAY));
/** balls an hour (a town hour of the day dayLen) of a rate in balls a sim second: what the flow panel and the tree say */
export const perHour = (bps: number, dayLen: number): number => bps * Math.max(24, dayLen) / 24;

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pos = (v: unknown): number => Math.max(0, num(v));
function counts(c: unknown): BallCounts {
  const o = (c && typeof c === 'object' ? c : {}) as Partial<BallCounts>, p = (o.picked && typeof o.picked === 'object' ? o.picked : {}) as Partial<Record<PickBy, number>>, picked = noPicks();
  for (const k of PICK_BY) picked[k] = Math.round(pos(p[k]));
  return { hit: Math.round(pos(o.hit)), sold: Math.round(pos(o.sold)), lost: Math.round(pos(o.lost)), bought: Math.round(pos(o.bought)), picked };
}
/** a loaded golf.range.balls made well formed, or undefined when there is none (a save from before T386: the caller gives it legacyBalls): whole
 *  counts, a field of finite pairs inside the cap */
export function normalizeBalls(x: unknown): BallSave | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<BallSave>, field: number[] = [];
  if (Array.isArray(o.field)) for (let i = 0; i + 1 < o.field.length && field.length < FIELD_CAP * 2; i += 2) { const a = o.field[i], b = o.field[i + 1]; if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) field.push(a, b); }
  return { v: 1, clean: Math.round(pos(o.clean)), inPlay: Math.round(pos(o.inPlay)), basket: Math.round(pos(o.basket)), hopper: Math.round(pos(o.hopper)), field, till: Math.round(pos(o.till) * 100) / 100, day: counts(o.day), total: counts(o.total), dayNo: Math.floor(num(o.dayNo, -1)) };
}
/** the balls lying on the outfield */
export const fieldCount = (b: Pick<BallSave, 'field'>): number => b.field.length / 2;
/** all the range's balls: the ball room's, with golfers, in your basket and hopper, and lying out (what a sale and a pick keep the same) */
export const poolOf = (b: BallSave): number => b.clean + b.inPlay + b.basket + b.hopper + fieldCount(b);

// ---------------------------------------------------------------- selling and landing

/** whole buckets of vb balls the ball room holds */
export const bucketsLeft = (b: Pick<BallSave, 'clean'>, vb: number): number => Math.floor(b.clean / Math.max(1, vb));
/** a sale: a bucket's vb balls leave the ball room for the golfer's hands (false: the ball room holds fewer; nothing changes) */
export function takeBucket(b: BallSave, vb: number): boolean {
  if (b.clean < vb) return false;
  b.clean -= vb; b.inPlay += vb; b.day.sold += vb; b.total.sold += vb; return true;
}
const r2 = (v: number): number => Math.round(v * 100) / 100;
/** the fence a landing keeps inside (x0 y0 x1 y1, tiles); none: anywhere */
export type Bounds = readonly [number, number, number, number];
/** n balls of a golfer's swing land on the outfield, the first at (x, y), the others scattered round it (up to SCATTER tiles, bent toward the
 *  middle: a sum of three draws of rnd), each kept inside the fence; a ball past FIELD_CAP is lost. The balls come out of the golfer's hands
 *  (inPlay), never below zero. Returns the balls that lie */
export function landBalls(b: BallSave, x: number, y: number, n: number, rnd: () => number, fence?: Bounds | null): number {
  let lay = 0;
  for (let i = 0; i < n; i++) {
    let px = x, py = y;
    if (i > 0) { px += (rnd() + rnd() + rnd() - 1.5) * 2 * SCATTER; py += (rnd() + rnd() + rnd() - 1.5) * 2 * SCATTER; }
    if (fence) { px = Math.min(fence[2], Math.max(fence[0], px)); py = Math.min(fence[3], Math.max(fence[1], py)); }
    if (b.inPlay > 0) b.inPlay--;
    b.day.hit++; b.total.hit++;
    if (b.field.length >= FIELD_CAP * 2) { b.day.lost++; b.total.lost++; continue; }
    b.field.push(r2(px), r2(py)); lay++;
  }
  return lay;
}
/** a golfer who leaves before hitting all the bucket: what is left of its balls lands at (x, y) in one heap (a skip, a load) */
export function dropInPlay(b: BallSave, at: (i: number) => { x: number; y: number }, rnd: () => number, fence?: Bounds | null): void {
  const n = b.inPlay; for (let i = 0; i < n; i++) { const p = at(i); landBalls(b, p.x, p.y, 1, rnd, fence); }
  b.inPlay = 0;
}

// ---------------------------------------------------------------- picking

/** removes ball k (swap with the last) */
function drop(f: number[], k: number): void { const n = f.length - 2; f[2 * k] = f[n]!; f[2 * k + 1] = f[n + 1]!; f.length = n; }
/** the nearest balls within r of (x, y), at most max, taken off the outfield; returns how many (the caller puts them in a basket, a hopper or the
 *  ball room). Nearest first, so the balls at your feet go before the ones at the edge of your reach */
export function pickAround(b: BallSave, x: number, y: number, r: number, max: number): number {
  const f = b.field, r2_ = r * r; if (max <= 0 || !f.length) return 0;
  const hit: { k: number; d: number }[] = [];
  for (let k = 0; k < f.length / 2; k++) { const dx = f[2 * k]! - x, dy = f[2 * k + 1]! - y, d = dx * dx + dy * dy; if (d <= r2_) hit.push({ k, d }); }
  if (!hit.length) return 0;
  if (hit.length > max) { hit.sort((p, q) => p.d - q.d); hit.length = max; }
  hit.sort((p, q) => q.k - p.k); // (highest index first: a swap never moves one still to come)
  for (const h of hit) drop(f, h.k);
  return hit.length;
}
/** the balls within w of the segment a-c (a swath: a roller or a gang driven that way), at most max, taken off the outfield; returns how many */
export function pickSwath(b: BallSave, ax: number, ay: number, cx: number, cy: number, w: number, max: number): number {
  const f = b.field; if (max <= 0 || !f.length) return 0;
  const dx = cx - ax, dy = cy - ay, L2 = dx * dx + dy * dy || 1e-9, w2 = w * w, hit: number[] = [];
  for (let k = 0; k < f.length / 2 && hit.length < max; k++) {
    const x = f[2 * k]!, y = f[2 * k + 1]!, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), ex = ax + dx * t - x, ey = ay + dy * t - y;
    if (ex * ex + ey * ey <= w2) hit.push(k);
  }
  for (let i = hit.length - 1; i >= 0; i--) drop(f, hit[i]!);
  return hit.length;
}
/** the nearest ball to (x, y) within r (a point, or null): where a pick order walks to when nothing is within your reach */
export function nearestBall(b: Pick<BallSave, 'field'>, x: number, y: number, r: number): { x: number; y: number } | null {
  const f = b.field; let best = -1, bd = r * r;
  for (let k = 0; k < f.length / 2; k++) { const dx = f[2 * k]! - x, dy = f[2 * k + 1]! - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = k; } }
  return best < 0 ? null : { x: f[2 * best]!, y: f[2 * best + 1]! };
}
/** how many balls lie within r of (x, y) (the pile's size under the pointer) */
export function ballsNear(b: Pick<BallSave, 'field'>, x: number, y: number, r: number): number {
  const f = b.field, r2_ = r * r; let n = 0;
  for (let k = 0; k < f.length / 2; k++) { const dx = f[2 * k]! - x, dy = f[2 * k + 1]! - y; if (dx * dx + dy * dy <= r2_) n++; }
  return n;
}
/** the balls of a load put into the ball room (a basket, a hopper, a robot's tray): clean stock, counted as picked by `by` */
export function stow(b: BallSave, n: number, by: PickBy): void { if (n <= 0) return; b.clean += n; b.day.picked[by] += n; b.total.picked[by] += n; }
/** the balls picked by `by` that have not reached the ball room yet are counted when they are stowed (stow); this counts a pick that goes straight
 *  into a basket or hopper */
export function carry(b: BallSave, where: 'basket' | 'hopper', n: number): void { if (where === 'basket') b.basket += n; else b.hopper += n; }
/** your basket or your hopper emptied into the ball room (stow counts them as picked by `by`); returns the balls */
export function dump(b: BallSave, where: 'basket' | 'hopper', by: PickBy): number {
  const n = where === 'basket' ? b.basket : b.hopper; if (n <= 0) return 0;
  if (where === 'basket') b.basket = 0; else b.hopper = 0;
  stow(b, n, by); return n;
}

// ---------------------------------------------------------------- the days

/** a new town day: the night's losses (DAY_LOSS_FIELD of the outfield's balls, DAY_LOSS_STOCK of the ball room's), the day's counts start again.
 *  `nights` is the nights since the counts were last for a day (a skip crosses several, at most 5 are charged). Returns the balls lost */
export function overnight(b: BallSave, nights: number, rnd: () => number): number {
  let lost = 0;
  for (let n = 0; n < Math.min(5, Math.max(0, nights)); n++) {
    const out = Math.floor(fieldCount(b) * DAY_LOSS_FIELD + rnd());
    for (let i = 0; i < out && b.field.length; i++) drop(b.field, Math.floor(rnd() * fieldCount(b)));
    const worn = Math.min(b.clean, Math.floor(b.clean * DAY_LOSS_STOCK + rnd()));
    b.clean -= worn; lost += out + worn;
  }
  b.total.lost += lost; b.day = zeroCounts(); b.day.lost = lost;
  return lost;
}
/** n balls taken off the outfield at random (a machine that picks wherever the balls lie: the skip's night cart); returns how many were there */
export function removeRandom(b: BallSave, n: number, rnd: () => number): number {
  let k = 0; for (; k < n && b.field.length; k++) drop(b.field, Math.floor(rnd() * fieldCount(b)) % fieldCount(b));
  return k;
}
/** a span the player skipped (dt sim seconds of a town day of dayLen): the shop serves the visits the balls allow, day by day. want is the visits the
 *  demand and the bays allow (rangesave.ts skippedVisits). Each day sells H balls, at most what the ball room holds plus what the day's machines (auto: balls a
 *  sim second, robots and staff) pick before it is out; the balls land on the outfield (at gives a landing's point), the machines take theirs back, and then
 *  the night cart (night) picks all that lies out. The pool is kept. Returns the visits served (the rest were short of balls) */
export function skipBalls(b: BallSave, want: number, vb: number, dt: number, dayLen: number, auto: number, night: boolean, at: () => { x: number; y: number }, rnd: () => number, fence?: Bounds | null): number {
  const days = Math.max(1e-9, dt / Math.max(24, dayLen)), steps = Math.min(12, Math.max(1, Math.ceil(days)));
  let served = 0;
  for (let i = 0; i < steps; i++) {
    const span = Math.min(1, days - i), A = Math.max(0, auto) * dayLen * span, H = Math.max(0, Math.min(Math.round(want * span / days * vb), b.clean + Math.floor(A)));
    served += H / vb;
    for (let k = 0; k < H; k++) { const p = at(); landBalls(b, p.x, p.y, 1, rnd, fence); }
    if (A > 0) stow(b, removeRandom(b, Math.round(A), rnd), 'robot');
    b.clean = Math.max(0, b.clean - H);
    if (night && span >= 1) stow(b, removeRandom(b, fieldCount(b), rnd), 'night');
  }
  return served;
}
/** the supplier's order of `cases` cases ($ BALL_COST a ball, CASES_A_DAY a town day): the balls into the ball room, the cost ($) to charge, the
 *  cases that came (0: none: the day's orders are in already, or the till cannot pay). The caller charges `cost` */
export function orderBalls(b: BallSave, cases: number, ordered: number, till: number): { cases: number; cost: number } {
  const n = Math.max(0, Math.min(Math.floor(cases), CASES_A_DAY - ordered, Math.floor(till / (CASE_BALLS * BALL_COST))));
  if (n <= 0) return { cases: 0, cost: 0 };
  b.clean += n * CASE_BALLS; b.day.bought += n * CASE_BALLS; b.total.bought += n * CASE_BALLS;
  return { cases: n, cost: Math.round(n * CASE_BALLS * BALL_COST) };
}

// ---------------------------------------------------------------- what your tools do

/** what you pick with, from the upgrades owned: reach (tiles round you) and rate (balls a second) by hand or tube, your basket's size, the push
 *  picker's swath (tiles across; 0: none), the cart's swath (0: none) and hopper */
export interface PickKit { reach: number; rate: number; basket: number; push: number; cart: number; hopper: number; tube: boolean }
/** bare hands: a ball at a time within a stride, a basket of 24 */
export const HAND = { reach: 0.9, rate: 1.2, basket: 24 };
/** the ball tube (a pipe to pick balls through: no stooping): further and 2.5 times as fast */
export const TUBE = { reach: 1.7, rate: 3 };
/** the wire basket (a bigger basket) and the push picker's roll basket */
export const BASKET2 = 48, PUSH_BASKET = 96;
/** the push picker's swath (a roller cage you walk: 4.8 m across), the cart's pull-behind picker (10 m) and its hopper, the wider gang picker (18 m) */
export const PUSH_SWATH = 2.4, CART_SWATH = 5, CART_HOPPER = 450, GANG_SWATH = 9, GANG_HOPPER = 900;
export function pickKit(owned: readonly string[]): PickKit {
  const has = (id: string) => owned.includes(id), tube = has('tube');
  return {
    reach: tube ? TUBE.reach : HAND.reach, rate: tube ? TUBE.rate : HAND.rate, tube,
    basket: has('pushpick') ? PUSH_BASKET : has('basket') ? BASKET2 : HAND.basket,
    push: has('pushpick') ? PUSH_SWATH : 0,
    cart: has('gang') ? GANG_SWATH : has('picker') ? CART_SWATH : 0, hopper: has('gang') ? GANG_HOPPER : has('picker') ? CART_HOPPER : 0,
  };
}
/** the cart that works by itself after closing (night picking): lanes of this swath (tiles across the lane), balls it can pick a sim second at most */
export const NIGHT_SWATH = 3;
