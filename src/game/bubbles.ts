// Speech bubbles over the people (T406, #1090; the owner, 2026-11-09: "add speech bubbles to the game for all of the people walking around. both random
// thoughts, happiness and game related, and fun ones"). The words are one table (bubble-lines.ts); this is the cheap machine that picks who says what:
//  - at most RATES[rate].cap bubbles at once (about six), each 2 to 4 s and fading; a cool-down for each person and one for the whole screen;
//  - sampled, never per person per frame: a few times a second it picks ONE person of those on screen and one row that fits, and an event (a ball in the
//    water, a birdie, a fan hit) answers once;
//  - a fan hit by a ball plays the hurt loop (clutches his knee, moans on a beat for two game minutes, limps off) which is a state, not a bubble in the pool.
// The engine gives it the people on screen through a BubbleHost (it never holds a person itself) and draws the live bubbles (bubble-draw.ts).
// Pure TS, no DOM.
import { HURT_BEAT, HURT_GAME_MIN, HURT_MIN_REAL_S, HURT_ON, GONE_S, LIMP_S, SAMPLED, fits, hurtLine, rulesFor, type BubbleContext, type BubbleRule, type BubbleStyle, type EventId, type SpeakerKind, CALM, SPEAKER_KINDS } from './bubble-lines';

/** a person as the host gives him: its kind, a stable id within the kind, its drawn point (tiles) and lift (world px: seated), whether he moves, whether he
 *  is busy (a golfer at address or in a swing: no bubble over him), and how visible he is (0..1) */
export interface Speaker { kind: SpeakerKind; id: number; x: number; y: number; lift: number; moving: boolean; busy: boolean; alpha: number }
/** the people on screen, as the engine has them (it fills `out`; false: no such person now). find: the same person again by his id, for a bubble following him */
export interface BubbleHost {
  count(kind: SpeakerKind): number;
  person(kind: SpeakerKind, k: number, out: Speaker): boolean;
  find(kind: SpeakerKind, id: number, out: Speaker): boolean;
}
/** a spectator's id for the host: where he is drawn from (0 a gallery, 1 a walking party, 2 a queue), the spot, party or queue's index, and his slot there */
export const specId = (source: number, index: number, slot: number): number => (source * 1e6 + index) * 128 + slot;
/** the parts of a spectator's id */
export const specParts = (id: number): { source: number; index: number; slot: number } => { const slot = id % 128, q = Math.floor(id / 128); return { source: Math.floor(q / 1e6), index: q % 1e6, slot }; };

/** how many bubbles at once, the rest between two (s) on the whole screen, and the chance a sample (every SAMPLE_S) starts one: Low, Normal, High (the gear menu) */
export type BubbleRate = 'low' | 'normal' | 'high';
export const BUBBLE_RATES: readonly BubbleRate[] = ['low', 'normal', 'high'];
export const RATES: Readonly<Record<BubbleRate, { cap: number; gap: number; chance: number }>> = {
  low: { cap: 4, gap: 2.6, chance: 0.3 }, normal: { cap: 6, gap: 1.2, chance: 0.5 }, high: { cap: 8, gap: 0.55, chance: 0.8 },
};
/** the time between samples (s): the machine thinks this often, never per frame */
export const SAMPLE_S = 0.5;
/** bubbles show at the street zoom (the district tier's edge) and closer, fully from FULL_Z */
export const MIN_Z = 0.12, FULL_Z = 0.2;
/** a bubble lives LIFE_BASE + LIFE_PER x its letters seconds, held within LIFE_MIN..LIFE_MAX (the ticket: 2 to 4 s) */
export const LIFE_BASE = 1.6, LIFE_PER = 0.055, LIFE_MIN = 2, LIFE_MAX = 4;
/** a person is quiet this long after any bubble, whatever its row (s) */
export const QUIET_S = 14;
/** a bubble whose person is not on screen any more for this long goes (s) */
export const LOST_S = 0.6;
/** the people a sample may try before giving up (the ones on a cool-down or busy are passed) */
export const TRIES = 4;

/** a live bubble: whose, where (tiles; kept up as he moves), what and how, and its clock (the engine's seconds). `lines`, `w` and `h` are the drawing's
 *  layout (bubble-draw.ts caches the wrapped text here) */
export interface Bubble {
  kind: SpeakerKind; who: number; x: number; y: number; lift: number; text: string; style: BubbleStyle; rule: string;
  born: number; life: number; seen: number;
  /** the hurt loop's own bubble: its text and clock follow the beats */
  hurt?: boolean;
  lines?: string[]; w?: number; h?: number;
}
/** the pose of a hurt fan: clutching his knee, limping off, gone for a while */
export type HurtPose = 'clutch' | 'limp' | 'gone';
/** a fan hit by a ball: his place (the gallery spot and his slot), where his gallery looks (fx, fy: tiles), the hole it was, the pose and the second (the
 *  engine's clock) it began, when the gag began and its game-time length. crowdview.ts galleryPeople reads spot, slot, pose, since, fx and fy */
export interface Hurt {
  spot: number; slot: number; fx: number; fy: number; hole: number; pose: HurtPose; since: number;
  t0: number; sim0: number; simDur: number; bubble: Bubble;
}

/** a small seeded generator (mulberry32) for tests */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** a hash of an integer to [0, 1) (a person's own mood from his id) */
function h1(a: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ 0x7f4a7c15; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** a person's own mood: the context's, shifted a little by who he is (so not everyone is happy at once): 0..1 */
export function personMood(ctx: Pick<BubbleContext, 'mood'>, kind: SpeakerKind, id: number): number {
  const k = SPEAKER_KINDS.indexOf(kind);
  return Math.min(1, Math.max(0, ctx.mood + (h1(id * 4 + k) - 0.5) * 0.36));
}
/** how long a bubble of this text lives (s) */
export const lifeOf = (text: string): number => Math.min(LIFE_MAX, Math.max(LIFE_MIN, LIFE_BASE + LIFE_PER * text.length));
/** the bubble's fade by the zoom: 0 under MIN_Z, 1 from FULL_Z (smooth between) */
export function zoomAlpha(zoom: number): number { const t = Math.min(1, Math.max(0, (zoom - MIN_Z) / (FULL_Z - MIN_Z))); return t * t * (3 - 2 * t); }
/** a bubble's life at `now`: its age (s), the pop-in scale (0.6 to 1 with a little overshoot over 0.16 s) and its opacity (1, fading over the last 0.4 s) */
export function bubblePose(b: Pick<Bubble, 'born' | 'life'>, now: number): { age: number; scale: number; alpha: number } {
  const age = now - b.born, left = b.life - age;
  if (age < 0 || left <= 0) return { age, scale: 1, alpha: 0 };
  const k = Math.min(1, age / 0.16), back = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // ease-out-back
  return { age, scale: 0.6 + 0.4 * Math.max(0, back), alpha: left < 0.4 ? left / 0.4 : 1 };
}

const TMP: Speaker = { kind: 'town', id: 0, x: 0, y: 0, lift: 0, moving: false, busy: false, alpha: 1 };
const TMP2: Speaker = { kind: 'town', id: 0, x: 0, y: 0, lift: 0, moving: false, busy: false, alpha: 1 };

export class BubbleSystem {
  /** the bubbles on screen, oldest first */
  readonly live: Bubble[] = [];
  /** the fans hurt by a ball: the gag under way (crowdview.ts galleryPeople reads them), and their bubbles (drawn with `live`) */
  readonly hurts: Hurt[] = [];
  /** the settings: on, and how often */
  on = true; rate: BubbleRate = 'normal';
  /** what the game says now (the engine sets it about once a second) */
  ctx: BubbleContext = { ...CALM };
  /** the counts since the start: bubbles started, answers to events, samples thought, hurt gags and the bubbles dropped for want of room */
  stats = { spawned: 0, events: 0, samples: 0, hurts: 0, dropped: 0 };
  private nextAt = 0; private sampleAt = 0;
  /** the quiet of each person (his key's end, s) and each row's rest */
  private quiet = new Map<number, number>(); private rest = new Map<string, number>();
  private last = new Map<string, number>();
  private pool: Bubble[] = [];

  constructor(readonly host: BubbleHost, private rng: () => number = Math.random) {}

  /** every bubble and hurt gone (a load, a setting turned off) */
  clear(): void { this.live.length = 0; this.hurts.length = 0; this.quiet.clear(); this.rest.clear(); this.last.clear(); this.nextAt = 0; this.sampleAt = 0; }
  /** the bubbles to draw now: the live ones and the hurt fans' (each hurt's own bubble while it shows) into `out` */
  drawable(now: number, out: Bubble[]): Bubble[] {
    out.length = 0;
    for (const b of this.live) out.push(b);
    for (const h of this.hurts) if (h.pose === 'clutch' && h.bubble.text && now - h.bubble.born < h.bubble.life) out.push(h.bubble);
    return out;
  }

  private key(kind: SpeakerKind, id: number): number { return id * 4 + SPEAKER_KINDS.indexOf(kind); }
  private quietOf(kind: SpeakerKind, id: number, now: number): boolean { return (this.quiet.get(this.key(kind, id)) ?? 0) > now; }
  private bubble(): Bubble { return this.pool.pop() ?? { kind: 'town', who: 0, x: 0, y: 0, lift: 0, text: '', style: 'say', rule: '', born: 0, life: 0, seen: 0 }; }
  private free(b: Bubble): void { b.lines = undefined; b.w = undefined; b.h = undefined; b.hurt = undefined; if (this.pool.length < 32) this.pool.push(b); }
  /** a line of the row for the next bubble: not the one it said last (when it has another) */
  private pick(r: BubbleRule): string {
    const L = r.lines, prev = this.last.get(r.id) ?? -1;
    let i = Math.floor(this.rng() * L.length);
    if (L.length > 1 && i === prev) i = (i + 1 + Math.floor(this.rng() * (L.length - 1))) % L.length;
    this.last.set(r.id, i); return L[i]!;
  }

  /** once a frame: the bubbles past their life go, the others follow their people, the hurt gags move on, and now and then (SAMPLE_S) a person says something.
   *  now: the engine's real seconds; sim: the game clock (sim seconds); zoom: the camera's */
  frame(now: number, sim: number, zoom: number): void {
    const L = this.live;
    // the gone, and the following
    let k = 0;
    for (let i = 0; i < L.length; i++) {
      const b = L[i]!;
      if (now - b.born >= b.life) { this.free(b); continue; }
      if (this.host.find(b.kind, b.who, TMP)) { b.x = TMP.x; b.y = TMP.y; b.lift = TMP.lift; b.seen = now; }
      else if (now - b.seen > LOST_S) { this.free(b); continue; }
      L[k++] = b;
    }
    L.length = k;
    this.hurtFrame(now, sim);
    if (!this.on || zoom < MIN_Z) return;
    if (now >= this.sampleAt) { this.sampleAt = now + SAMPLE_S * (0.8 + 0.4 * this.rng()); this.sample(now); }
  }

  /** one sample: with the rate's chance, a person on screen says a thing that fits (nobody when all are quiet or the screen is full) */
  private sample(now: number): void {
    const R = RATES[this.rate]; this.stats.samples++;
    if (this.live.length + this.hurts.length >= R.cap || now < this.nextAt || this.rng() > R.chance) return;
    // the kind: by the square root of the people of each on screen (a handful of golfers still speak among a crowd)
    const w = [0, 0, 0, 0]; let tot = 0;
    for (let i = 0; i < SPEAKER_KINDS.length; i++) { const n = this.host.count(SPEAKER_KINDS[i]!); w[i] = n > 0 ? Math.sqrt(n) : 0; tot += w[i]!; }
    if (tot <= 0) return;
    for (let t = 0; t < TRIES; t++) {
      let r = this.rng() * tot, ki = 0; for (; ki < 3; ki++) { r -= w[ki]!; if (r < 0) break; }
      const kind = SPEAKER_KINDS[ki]!, n = this.host.count(kind); if (n <= 0) continue;
      const p = TMP2; if (!this.host.person(kind, Math.floor(this.rng() * n), p) || p.busy || p.alpha < 0.6 || this.quietOf(kind, p.id, now)) continue;
      const mood = personMood(this.ctx, kind, p.id);
      let sum = 0; const rows: BubbleRule[] = [];
      for (const rule of SAMPLED) { if (!fits(rule, kind, this.ctx, mood) || (this.rest.get(rule.id) ?? 0) > now) continue; rows.push(rule); sum += rule.weight; }
      if (!rows.length) continue;
      let x = this.rng() * sum, rule = rows[0]!; for (const q of rows) { x -= q.weight; if (x < 0) { rule = q; break; } }
      this.say(kind, p, rule, this.pick(rule), now, false); return;
    }
  }

  /** a bubble over person p: the row's text and style, its cool-downs set. `forced`: an event's (it makes room and does not wait for the screen's gap) */
  private say(kind: SpeakerKind, p: Speaker, rule: BubbleRule, text: string, now: number, forced: boolean): Bubble | null {
    const R = RATES[this.rate], L = this.live;
    if (L.length + this.hurts.length >= R.cap) {
      if (!forced) return null;
      // an event takes the place of the oldest bubble that is not one of its own kind of moment
      let oi = -1; for (let i = 0; i < L.length; i++) if (L[i]!.rule.startsWith('ev-') === false) { oi = i; break; }
      if (oi < 0) { this.stats.dropped++; return null; }
      this.free(L[oi]!); L.splice(oi, 1);
    }
    const b = this.bubble();
    b.kind = kind; b.who = p.id; b.x = p.x; b.y = p.y; b.lift = p.lift; b.text = text; b.style = rule.style ?? 'say'; b.rule = rule.id; b.born = now; b.life = lifeOf(text); b.seen = now;
    b.lines = undefined; b.w = undefined; b.h = undefined; b.hurt = undefined;
    L.push(b); this.stats.spawned++;
    this.quiet.set(this.key(kind, p.id), now + Math.max(QUIET_S, rule.cooldown * (0.75 + 0.5 * this.rng())));
    if (rule.gap) this.rest.set(rule.id, now + rule.gap);
    if (!forced) this.nextAt = now + RATES[this.rate].gap * (0.7 + 0.6 * this.rng());
    if (this.quiet.size > 600) this.prune(now);
    return b;
  }
  private prune(now: number): void { for (const [k, v] of this.quiet) if (v <= now) this.quiet.delete(k); for (const [k, v] of this.rest) if (v <= now) this.rest.delete(k); }

  /** a bubble with this text over a given person now (the incidents', the gags' and the dev console's): its own cool-down, no screen gap, making room like an event.
   *  Returns the bubble, or null (he is not on screen, or the bubbles are off) */
  tell(kind: SpeakerKind, id: number, text: string, now: number, style: BubbleStyle = 'say', rule = 'tell'): Bubble | null {
    if (!this.on || !this.host.find(kind, id, TMP2)) return null;
    return this.say(kind, TMP2, { id: rule.startsWith('ev-') ? rule : 'ev-' + rule, group: 'fun', on: 'sample', who: [kind], lines: [text], weight: 1, cooldown: 20, style }, text, now, true);
  }
  /** a bubble over a random person of the kind on screen (null: none) */
  tellAny(kind: SpeakerKind, text: string, now: number, style: BubbleStyle = 'say'): Bubble | null {
    const n = this.host.count(kind);
    for (let t = 0; t < TRIES && n > 0; t++) { if (!this.host.person(kind, Math.floor(this.rng() * n), TMP) || TMP.busy) continue; const id = TMP.id; return this.tell(kind, id, text, now, style, 'ev-say'); }
    return null;
  }
  /** a game event at (x, y) (tiles): every row that answers it speaks: the subject (the golfer, when given) and the people near (the nearest few of the
   *  kinds the row names, within its radius). Events are not held to the screen's gap, only to each row's rest and each person's quiet, and they make room.
   *  Returns the bubbles started */
  event(id: EventId, x: number, y: number, now: number, subject?: { kind: SpeakerKind; id: number }, skip?: { kind: SpeakerKind; id: number }): number {
    if (!this.on) return 0;
    let made = 0; this.stats.events++;
    for (const rule of rulesFor(id)) {
      if ((this.rest.get(rule.id) ?? 0) > now) continue;
      if (rule.role === 'subject') {
        if (!subject || !rule.who.includes(subject.kind) || !this.host.find(subject.kind, subject.id, TMP2) || TMP2.busy || TMP2.alpha < 0.5 || this.quietOf(subject.kind, subject.id, now)) continue;
        if (this.say(subject.kind, TMP2, rule, this.pick(rule), now, true)) made++;
        continue;
      }
      // the people near: the nearest n of the row's kinds within its radius
      const n = rule.n ?? 1, rad = rule.radius ?? 10, near: { kind: SpeakerKind; id: number; d: number }[] = [];
      for (const kind of rule.who) {
        const c = this.host.count(kind);
        for (let k = 0; k < c; k++) {
          if (!this.host.person(kind, k, TMP2) || TMP2.busy || TMP2.alpha < 0.6) continue;
          if (skip && skip.kind === kind && skip.id === TMP2.id) continue;
          if (subject && subject.kind === kind && subject.id === TMP2.id) continue;
          const d = Math.hypot(TMP2.x - x, TMP2.y - y); if (d > rad || this.quietOf(kind, TMP2.id, now)) continue;
          near.push({ kind, id: TMP2.id, d: d + this.rng() * 1.5 });
        }
      }
      near.sort((a, b) => a.d - b.d);
      for (let i = 0; i < Math.min(n, near.length); i++) {
        const q = near[i]!; if (!this.host.find(q.kind, q.id, TMP2)) continue;
        if (this.say(q.kind, TMP2, rule, this.pick(rule), now, true)) made++;
      }
    }
    return made;
  }

  /** a fan hit by a ball: the hurt gag begins (the gallery spot and his slot, where the gallery looks, the hole it was; sim: the game clock now (sim
   *  seconds) and rate: game minutes a sim second, which make the gag HURT_GAME_MIN game minutes long). At most HURT_MAX at a time (a newer one
   *  replaces the oldest); a fan already hurt is not hurt again. Returns the gag, or null */
  hurt(spot: number, slot: number, fx: number, fy: number, hole: number, now: number, sim: number, rate: number): Hurt | null {
    if (!this.on) return null;
    for (const h of this.hurts) if (h.spot === spot && h.slot === slot) return null;
    if (this.hurts.length >= HURT_MAX) { const o = this.hurts.shift()!; this.free(o.bubble); }
    const b = this.bubble(); b.kind = 'spectator'; b.who = specId(0, spot, slot); b.x = 0; b.y = 0; b.lift = 0; b.text = ''; b.style = 'moan'; b.rule = 'hurt'; b.born = now; b.life = HURT_ON; b.seen = now; b.hurt = true;
    b.lines = undefined; b.w = undefined; b.h = undefined;
    const h: Hurt = { spot, slot, fx, fy, hole, pose: 'clutch', since: now, t0: now, sim0: sim, simDur: HURT_GAME_MIN / Math.max(1e-6, rate), bubble: b };
    this.hurts.push(h); this.stats.hurts++;
    return h;
  }
  /** the hurt gags' clocks: the bubble's beats while he clutches, then the limp, then gone, then he is back in his place (the gag is over) */
  private hurtFrame(now: number, sim: number): void {
    const H = this.hurts;
    let k = 0;
    for (let i = 0; i < H.length; i++) {
      const h = H[i]!;
      if (h.pose === 'clutch') {
        if (sim - h.sim0 >= h.simDur && now - h.t0 >= HURT_MIN_REAL_S) { h.pose = 'limp'; h.since = now; h.bubble.text = ''; }
        else {
          const el = now - h.t0, text = hurtLine(el), beat = Math.floor(el / HURT_BEAT);
          if (text) { if (h.bubble.text !== text || h.bubble.born < h.t0 + beat * HURT_BEAT - 1e-9) { h.bubble.text = text; h.bubble.born = h.t0 + beat * HURT_BEAT; h.bubble.lines = undefined; } h.bubble.life = HURT_ON; }
          else h.bubble.text = '';
          if (this.host.find('spectator', h.bubble.who, TMP)) { h.bubble.x = TMP.x; h.bubble.y = TMP.y; h.bubble.lift = TMP.lift; h.bubble.seen = now; }
        }
      } else if (h.pose === 'limp' && now - h.since >= LIMP_S) { h.pose = 'gone'; h.since = now; }
      else if (h.pose === 'gone' && now - h.since >= GONE_S) { this.free(h.bubble); continue; }
      H[k++] = h;
    }
    H.length = k;
  }
}
/** the most fans hurt at once */
export const HURT_MAX = 3;
