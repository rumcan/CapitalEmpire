// T424 (docs/CINDERLINKS-PORT.md, the host half of "other people"): who is on the course at a game minute, as the view from behind the golfer is sent it
// (protocol3p.ts ActorsMsg). Everything is read from the one golf model, never worked out again: where each golfer is and what he does is round.ts'
// stateAt (the owner's group included: LiveGroup appends his shots to the same plan), the minute of each stroke the plan's shots, who rides and where the
// carts are carts.ts' CartPlay (the playback's own), who has a caddie entourage.ts' (golfer.caddie). Galleries are T429 and are left out.
// What this file adds is only how a person is SEEN: a pose (Doing) with how far through it he is, a facing, and a dress (Dress) derived from the golfer's
// id, look and sex, so the same golfer always wears the same clothes.
// Positions cross the bridge in the view's frame (protocol3p.ts toView): metres from the course's centre, x east, y south; a heading is degrees clockwise
// from east (atan2 of the view's y south over x east).
// Pure TS, no DOM.
import type { CourseView, Golfer, GolferState, Pt, RoundPlan, Shot } from './types';
import { ADDRESS_TIME, SWING_TIME, stateAt } from './round';
import { RIDE, WALK, type CartPlay, type PlayCart } from './carts';
import type { Frame3p } from './export3p';
import { centreOf } from './turn3p';
import { PROTOCOL_V, toView, type Actor, type ActorsMsg, type Doing, type Dress } from './protocol3p';

/** a golfer is shown this many game minutes before his group's tee time (standing at the first tee); before that he is not on the course */
export const SHOW_BEFORE = 10;
/** the ids of the actors that are not golfers: a cart is CART_ID + its index (entourage.ts golfer.cart), a caddie CADDIE_ID + his golfer's id */
export const CART_ID = 100000, CADDIE_ID = 200000;
/** a caddie stands this far (tiles) to his golfer's right and a little behind him; off to the side of the green while he putts */
const CADDIE_SIDE = 0.8, CADDIE_BACK = 0.5, CADDIE_PUTT = 3;
/** T426: a putt from further than this (tiles: 8 m) has the flag tended; the tender stands this far (tiles) to the side of the pin */
export const TEND_TILES = 4;
const TEND_SIDE = 0.35;

/** what actorsMsg reads: the round plan and its course (the plan the playback draws: playRound's, with LiveGroup's shots appended), the game minute, and
 *  the carts' playback (view.ts' cartPlay; absent or null: nobody rides) */
export interface ActorsState { plan: RoundPlan; view: CourseView; minute: number; carts?: CartPlay | null }

// ---------------------------------------------------------------- looks

/** the clothes a golfer may wear: shirts (bright, as golf shirts are), trousers (quiet), caps */
const SHIRTS = ['#c8323a', '#f2f2ee', '#2f5fae', '#2f8a4e', '#f2c94c', '#e8803a', '#7a4fa0', '#1f2a44', '#5ab8d8', '#e87aa8', '#9aa4b2', '#3a3a3e'];
const TROUSERS = ['#2a3550', '#d8cfb4', '#5a5f6a', '#1e1e24', '#f0f0ea', '#6e5a3c', '#3c4a34'];
const CAPS = ['#f6f6f2', '#1f2a44', '#c8323a', '#2f5fae', '#2a2a2e', '#d8cfb4'];
/** skin tones by the golfer's look (types.ts Golfer.look 0..4: the art variant, so the manager view's picture and this one agree) */
const SKINS = ['#f1c9a4', '#e2b48a', '#c48d62', '#9a6544', '#6e4430'];
const HAIRS = ['#2c1a12', '#5a3a22', '#a8743c', '#d8b070', '#8a8a8a'];
/** a caddie wears the tournament's white bib over a plain shirt */
const CADDIE_SHIRT = '#f6f6f2', CADDIE_TROUSERS = '#3a4250', CADDIE_CAP = '#1f2a44';

/** a small integer hash (deterministic, the same on every machine) */
function hash(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0; h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
const pick = <T>(list: readonly T[], h: number): T => list[h % list.length]!;

/** a golfer's dress: from his id, his look and his sex only, so it never changes through a round or between messages. The owner keeps the view's own
 *  golfer (red shirt, white cap): the view draws him itself */
export function dressOf(g: Pick<Golfer, 'id' | 'look' | 'sex'>): Dress {
  const h = hash(g.id + 1, g.look + 7), look = Math.max(0, Math.min(SKINS.length - 1, g.look | 0));
  const shirt = pick(SHIRTS, h), trousers = pick(TROUSERS, h >>> 5), cap = pick(CAPS, h >>> 9);
  // a shirt and trousers of one colour read as overalls: the trousers move on one
  const tr = trousers === shirt ? pick(TROUSERS, (h >>> 5) + 1) : trousers;
  const build = Math.round((g.sex === 'w' ? 0.93 : 0.98) * 100 + ((h >>> 13) % 8)) / 100;
  return { shirt, trousers: tr, cap, skin: SKINS[look]!, hair: pick(HAIRS, (h >>> 17) + look), build, sex: g.sex };
}
/** a caddie's dress: the bib and dark trousers, his own skin and build (from his golfer's id, so he too is always the same man) */
export function caddieDress(golferId: number): Dress {
  const h = hash(golferId + 911, 3);
  return { shirt: CADDIE_SHIRT, trousers: CADDIE_TROUSERS, cap: CADDIE_CAP, skin: pick(SKINS, h), hair: pick(HAIRS, h >>> 4), build: Math.round(96 + ((h >>> 8) % 8)) / 100, sex: 'm' };
}

// ---------------------------------------------------------------- the strokes by golfer

/** each golfer's shots in time order (rebuilt when the plan's shots grow: a live group appends them) */
const strokesOf = new WeakMap<RoundPlan, { n: number; by: Map<number, Shot[]> }>();
function shotsBy(plan: RoundPlan): Map<number, Shot[]> {
  const got = strokesOf.get(plan); if (got && got.n === plan.shots.length) return got.by;
  const by = new Map<number, Shot[]>();
  for (const s of plan.shots) { const a = by.get(s.golfer); if (a) a.push(s); else by.set(s.golfer, [s]); }
  for (const a of by.values()) a.sort((p, q) => p.t - q.t);
  strokesOf.set(plan, { n: plan.shots.length, by });
  return by;
}
/** the first of a golfer's shots struck at or after minute m (his next stroke), and the last struck before it */
function around(list: readonly Shot[] | undefined, m: number): { prev: Shot | null; next: Shot | null } {
  if (!list || !list.length) return { prev: null, next: null };
  let lo = 0, hi = list.length;   // the first with t >= m
  while (lo < hi) { const k = (lo + hi) >> 1; if (list[k]!.t < m) lo = k + 1; else hi = k; }
  return { prev: lo > 0 ? list[lo - 1]! : null, next: lo < list.length ? list[lo]! : null };
}

// ---------------------------------------------------------------- the message

const DEG = 180 / Math.PI;
/** the heading (degrees clockwise from east, y south) from a to b; NaN when they are the same point */
const headingOf = (a: Pt, b: Pt): number => { const dx = b.x - a.x, dy = b.y - a.y; return dx * dx + dy * dy < 1e-8 ? NaN : Math.atan2(dy, dx) * DEG; };
const clamp01 = (v: number): number => v < 0 ? 0 : v > 1 ? 1 : v;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const roundPt = (p: readonly [number, number]): [number, number] => [round2(p[0]), round2(p[1])];

/** who is on the course at st.minute, as the view is sent them: every golfer from SHOW_BEFORE before his group's tee time until he is done (the owner
 *  flagged: the view draws him itself), a caddie beside each golfer who has one, and each cart that is out with its riders. Ids are stable through the
 *  round (a golfer's is his id in the round; carts CART_ID + index, caddies CADDIE_ID + golfer id), so the view can move each from where it was */
export function actorsMsg(st: ActorsState, frame: Frame3p | Pt): ActorsMsg {
  const { plan, view, minute: m } = st, c = centreOf(frame), carts = st.carts ?? null;
  const states: GolferState[] = stateAt(plan, view, m), by = shotsBy(plan), tee = new Map<number, number>(), group = new Map<number, number>();
  plan.groups.forEach((gr, k) => { for (const id of gr.players) { tee.set(id, gr.tee); group.set(id, k); } });
  const golfers = new Map(plan.golfers.map(g => [g.id, g] as const)), stOf = new Map(states.map(s => [s.golfer, s] as const));
  const out: Actor[] = [], riders = new Map<number, number[]>();

  for (const s of states) {
    const g = golfers.get(s.golfer); if (!g) continue;
    if (s.action === 'done') continue;
    if (s.action === 'waiting' && m < (tee.get(g.id) ?? 0) - SHOW_BEFORE) continue;
    const pin = view.holes[s.hole]?.pin ?? null, { prev, next } = around(by.get(g.id), m);
    let at: Pt = { x: s.x, y: s.y }, doing: Doing, phase = 0, heading = NaN;
    // a cart's golfer rides from his last stroke at a stop to his walk out at the next (carts.ts rider): the cart carries him
    const mode = carts && g.cart !== undefined && !g.owner ? carts.rider(g.id, m) : -1;
    if (mode === RIDE) {
      doing = 'ride';
      const list = riders.get(g.cart!); if (list) list.push(g.id); else riders.set(g.cart!, [g.id]);
    } else if (mode === WALK) {
      const w = carts!.walk; at = { x: w.x, y: w.y }; doing = 'walk'; heading = headingOf({ x: 0, y: 0 }, { x: w.hx, y: w.hy });
    } else if (s.action === 'swing' && prev) {   // from the strike to the finish
      doing = 'swing'; phase = clamp01((m - prev.t) / SWING_TIME); heading = headingOf(prev.from, prev.to);
    } else if (next && next.club !== 'putter' && (s.action === 'address' || (s.action === 'waiting' && next.stroke === 1 && m >= next.t - ADDRESS_TIME))) {
      // from stepping up to the strike (the round has the first tee's golfer waiting right up to his strike: he is shown addressing it, as on every other)
      doing = 'address'; phase = clamp01((m - (next.t - ADDRESS_TIME)) / ADDRESS_TIME); heading = headingOf(next.from, next.to);
    } else if (s.action === 'putt') {   // the address and the stroke, as one: from stepping up to the end of the stroke
      const shot = next && m >= next.t - ADDRESS_TIME ? next : prev;
      doing = 'putt';
      if (shot) { phase = clamp01((m - (shot.t - ADDRESS_TIME)) / (ADDRESS_TIME + SWING_TIME)); heading = headingOf(shot.from, shot.to); }
    } else if (s.action === 'walk' && s.dest && Math.hypot(s.dest.x - s.x, s.dest.y - s.y) > 0.02) {
      doing = 'walk'; heading = headingOf(at, s.dest);
    } else {
      // standing: waiting on a tee, holed out at his step-off, or at his ball while another plays. He watches a group-mate who is playing, else the pin
      doing = 'stand';
      const k = group.get(g.id), mates = k === undefined ? [] : plan.groups[k]!.players;
      for (const id of mates) {
        if (id === g.id) continue;
        const o = stOf.get(id);
        if (o && (o.action === 'address' || o.action === 'swing' || o.action === 'putt')) { doing = 'watch'; heading = headingOf(at, o); break; }
      }
      if (Number.isNaN(heading) && pin) heading = headingOf(at, pin);
    }
    const a: Actor = { id: g.id, role: 'golfer', at: roundPt(toView(at, c)), hole: view.holes[s.hole]?.n ?? s.hole + 1, action: s.action, ball: s.ball ? roundPt(toView(s.ball, c)) : null,
      name: g.name, sex: g.sex, look: g.look, doing, phase: round2(phase), dress: dressOf(g) };
    if (!Number.isNaN(heading)) a.heading = Math.round(heading);
    if (g.owner) a.owner = true;
    if (g.cart !== undefined) a.cart = CART_ID + g.cart;
    if (g.caddie) a.caddie = true;
    out.push(a);

    // his caddie: beside him, a little behind and to his right, turned as he is; off to the side while he putts; with him on his walks
    if (g.caddie && doing !== 'ride') {
      const hr = Number.isNaN(heading) ? 0 : heading / DEG, fx = Math.cos(hr), fy = Math.sin(hr), rx = -fy, ry = fx;
      const side = doing === 'putt' ? CADDIE_PUTT : CADDIE_SIDE, back = doing === 'putt' ? 0 : CADDIE_BACK;
      const cp = { x: at.x + rx * side - fx * back, y: at.y + ry * side - fy * back };
      const cd: Actor = { id: CADDIE_ID + g.id, role: 'caddie', at: roundPt(toView(cp, c)), hole: view.holes[s.hole]?.n ?? s.hole + 1, doing: doing === 'walk' ? 'walk' : doing === 'putt' || doing === 'watch' ? 'watch' : 'stand',
        phase: 0, dress: caddieDress(g.id) };
      if (!Number.isNaN(heading)) cd.heading = Math.round(doing === 'putt' && pin ? headingOf(cp, pin) : heading);
      out.push(cd);
    }
  }

  // the carts that are out (the playback's own: carts.ts update), with their riders, the driver first (the lower id: the first of the pair)
  if (carts) {
    const list: PlayCart[] = []; carts.update(m, list);
    for (const p of list) {
      const rs = (riders.get(p.cart) ?? []).sort((x, y) => x - y), h = headingOf({ x: 0, y: 0 }, { x: p.hx, y: p.hy });
      // a rider is drawn in the cart: his place is the cart's
      for (const id of rs) { const a = out.find(o => o.id === id); if (a) a.at = roundPt(toView(p, c)); }
      const golfersHole = rs.length ? out.find(o => o.id === rs[0])?.hole ?? 0 : 0;
      const ca: Actor = { id: CART_ID + p.cart, role: 'cart', at: roundPt(toView(p, c)), hole: golfersHole, riders: rs };
      if (!Number.isNaN(h)) ca.heading = Math.round(h);
      out.push(ca);
    }
  }
  // T426: the flag tended: a putt from further than TEND_TILES has the flag held, by the putter's caddie (he has one) or else the group-mate nearest the pin who
  // is not playing (out of the cart, if he sits in it); the tender stands at the pin, a little to its side, turned to the putter
  for (const s of states) {
    if (s.action !== 'putt') continue;
    const pin = view.holes[s.hole]?.pin; if (!pin || !s.ball || Math.hypot(s.ball.x - pin.x, s.ball.y - pin.y) <= TEND_TILES) continue;
    const g = golfers.get(s.golfer)!, k = group.get(s.golfer);
    let who: Actor | undefined = g.caddie ? out.find(o => o.id === CADDIE_ID + g.id) : undefined;
    if (!who && k !== undefined) {
      let best = Infinity;
      for (const id of plan.groups[k]!.players) {
        const o = stOf.get(id), a = o && id !== s.golfer && o.hole === s.hole && (o.action === 'walk' || o.action === 'holed') ? out.find(q => q.id === id) : undefined;
        if (!a || golfers.get(id)?.owner) continue;   // (the owner is the player: the view never moves him)
        const d = Math.hypot(o!.x - pin.x, o!.y - pin.y); if (d < best) { best = d; who = a; }
      }
    }
    if (!who) continue;
    const dx = s.x - pin.x, dy = s.y - pin.y, L = Math.hypot(dx, dy) || 1, sp = { x: pin.x - dy / L * TEND_SIDE, y: pin.y + dx / L * TEND_SIDE };
    if (who.doing === 'ride') for (const o of out) if (o.role === 'cart' && o.riders?.includes(who.id)) o.riders = o.riders.filter(id => id !== who!.id);   // (he gets out of the cart)
    who.at = roundPt(toView(sp, c)); who.doing = 'watch'; who.phase = 0; who.tend = true; who.heading = Math.round(headingOf(sp, s));
  }

  return { v: PROTOCOL_V, t: 'actors', at: m, actors: out };
}
