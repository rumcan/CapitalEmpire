// Money floats up where it is made (T147, #306). The owner (2026-10-26): "show green +$400 or what ever you make float up from a customer when we
// make money and -$300 when we dont in red". Each in-world money event becomes a short label that rises from its place and fades (FLOAT_LIFE):
// green +$X when money comes in, red -$X when it goes out at a place, and red -$X with a small caption for a sale we lost (a customer turned away
// or giving up a queue: the sale it would have made; the treasury is not charged). Readable, not noisy: one float per transaction at the street
// zoom, merged per place at the mid zoom (a running "+$1,240" over the range), none at the district and overview zooms; capped per frame. The
// engine feeds it (the range's onMoney, the purchases placed, the city worker's money with its place) and draws it on its 2D overlay.
import { DISTRICT_Z, HH } from './iso';
import type { RangeMoneyEvent } from './golf/rangebiz';

/** one float per transaction at this zoom and closer (the street view; the galleries' "n watching" shows from here too) */
export const FLOAT_STREET_Z = 0.2;
/** merged per place from here to FLOAT_STREET_Z (the mid zoom); none further out (the district and overview tiers) */
export const FLOAT_MID_Z = DISTRICT_Z;
/** a float's life (wall-clock s): it rises and fades over it */
export const FLOAT_LIFE = 1.5;
/** at the mid zoom a place's float takes in the money of this long after it began (wall-clock s: its running total), then rises away */
export const MERGE_WINDOW = 0.6;
/** at most this many new floats a frame and on screen at once: more money is added to the newest float at its spot (and kind), else dropped */
export const FLOAT_NEW_MAX = 8, FLOAT_LIVE_MAX = 60;
/** a float born within this long (s) of another at its spot is drawn a line above it, up to STACK_MAX lines (more: added to that one) */
export const STACK_GAP = 0.4, STACK_MAX = 3;
/** the mid zoom's place, for money with no place group: this cell (tiles) */
export const MID_CELL = 32;
/** the rise (screen px at dpr 1) over a float's life */
const RISE_PX = 30;

/** in: money came in (green); out: money went out at a place (red); lost: a sale we lost (red with a caption, the treasury not charged) */
export type FloatKind = 'in' | 'out' | 'lost';
/** a money event at a place (tiles) and its $ (positive) */
export interface MoneyEvent {
  x: number; y: number; amount: number; kind: FloatKind;
  /** the place it is merged into at the mid zoom (e.g. 'range') and that place's point (tiles); missing: its MID_CELL cell, at its first money */
  group?: string; gx?: number; gy?: number;
  /** a small caption under the amount (a lost sale's reason); a lost sale without one says 'lost sale' */
  note?: string;
}
/** a float: its point (tiles), $ and kind, birth (s), the spot it stacks at (street: its half tile; mid: its place), the line it is drawn on above
 *  its point, its caption, the money events in it, and whether it is a mid-zoom place total */
export interface MoneyFloat { x: number; y: number; amount: number; kind: FloatKind; born: number; spot: string; stack: number; note: string; n: number; merged: boolean }
export type FloatTier = 'street' | 'mid' | 'none';
/** the floats at a zoom (the camera's CSS zoom): one per transaction, merged per place, or none */
export const floatTier = (zoom: number): FloatTier => zoom >= FLOAT_STREET_Z ? 'street' : zoom >= FLOAT_MID_Z ? 'mid' : 'none';

/** $ as the float shows it: whole dollars with thousands commas (the machine's locale is not used: "+$1,240" everywhere), cents under $10 */
export function moneyAmount(n: number): string {
  const v = Math.abs(n);
  if (v < 10 && Math.round(v * 100) % 100 !== 0) return v.toFixed(2);
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
/** a float's label: +$X in, -$X out or lost */
export const moneyText = (f: Pick<MoneyFloat, 'kind' | 'amount'>): string => `${f.kind === 'in' ? '+' : '-'}$${moneyAmount(f.amount)}`;
/** a lost sale's caption: its reason at the street zoom; the count at the mid zoom when several were merged */
export function floatNote(f: Pick<MoneyFloat, 'kind' | 'note' | 'n' | 'merged'>): string {
  if (f.kind !== 'lost') return f.note;
  if (f.merged && f.n > 1) return `${f.n} sales lost`;
  return f.note || 'lost sale';
}

export class MoneyFloats {
  /** the floats on screen (oldest first) */
  readonly live: MoneyFloat[] = [];
  /** the money events dropped by the caps (none at their spot to add to) since the start */
  dropped = 0;
  private fresh = 0;

  /** once a frame, before the frame's money: the floats past their life go, and the frame's count of new floats starts again */
  frame(now: number): void {
    const L = this.live; let k = 0;
    for (let i = 0; i < L.length; i++) if (now - L[i]!.born < FLOAT_LIFE) L[k++] = L[i]!;
    L.length = k; this.fresh = 0;
  }
  /** every float gone (a load, the setting turned off) */
  clear(): void { this.live.length = 0; this.fresh = 0; }

  /** a money event at the zoom now: its float (a new one, or the one it was added to), or null (no money, the overview zoom, or dropped) */
  add(e: MoneyEvent, now: number, zoom: number): MoneyFloat | null {
    if (!(e.amount > 0) || !Number.isFinite(e.amount) || !Number.isFinite(e.x) || !Number.isFinite(e.y)) return null;
    const tier = floatTier(zoom); if (tier === 'none') return null;
    return tier === 'street' ? this.street(e, now) : this.mid(e, now);
  }

  /** the newest live float at spot (of kind, if given) */
  private newest(spot: string, kind?: FloatKind): MoneyFloat | null {
    for (let i = this.live.length - 1; i >= 0; i--) { const f = this.live[i]!; if (f.spot === spot && (!kind || f.kind === kind)) return f; }
    return null;
  }
  private full(): boolean { return this.fresh >= FLOAT_NEW_MAX || this.live.length >= FLOAT_LIVE_MAX; }
  private into(f: MoneyFloat | null, e: MoneyEvent): MoneyFloat | null {
    if (!f) { this.dropped++; return null; }
    f.amount += e.amount; f.n++; return f;
  }
  private push(e: MoneyEvent, x: number, y: number, spot: string, stack: number, now: number, merged: boolean): MoneyFloat {
    const f: MoneyFloat = { x, y, amount: e.amount, kind: e.kind, born: now, spot, stack, note: e.note ?? '', n: 1, merged };
    this.live.push(f); this.fresh++; return f;
  }
  /** street: a float of its own at its point, a line above a float just born at its spot */
  private street(e: MoneyEvent, now: number): MoneyFloat | null {
    const spot = `s${Math.round(e.x * 2)},${Math.round(e.y * 2)}`;
    if (this.full()) return this.into(this.newest(spot, e.kind), e);
    const prev = this.newest(spot); let stack = prev && now - prev.born < STACK_GAP ? prev.stack + 1 : 0;
    if (stack > STACK_MAX) { const same = this.newest(spot, e.kind); if (same) return this.into(same, e); stack = 0; }
    return this.push(e, e.x, e.y, spot, stack, now, false);
  }
  /** mid: added to its place's float of its kind while that is in its merge window; else a new one at the place's point, a line above the place's
   *  other floats still in theirs (in, out and lost apart) */
  private mid(e: MoneyEvent, now: number): MoneyFloat | null {
    const place = e.group !== undefined ? `g${e.group}` : `c${Math.floor(e.x / MID_CELL)},${Math.floor(e.y / MID_CELL)}`;
    const same = this.newest(place, e.kind);
    if (same && now - same.born < MERGE_WINDOW) return this.into(same, e);
    if (this.full()) return this.into(same, e);
    let stack = 0;
    for (const f of this.live) if (f.spot === place && now - f.born < MERGE_WINDOW) stack = Math.max(stack, f.stack + 1);
    return this.push(e, e.gx ?? e.x, e.gy ?? e.y, place, Math.min(stack, STACK_MAX), now, true);
  }
}

/** a float's rise (0..1, eased out) and opacity at now: in over its first 8%, full to 55%, then fading out */
export function floatPose(f: Pick<MoneyFloat, 'born'>, now: number): { rise: number; alpha: number } {
  const k = Math.min(1, Math.max(0, (now - f.born) / FLOAT_LIFE));
  return { rise: 1 - (1 - k) * (1 - k), alpha: k >= 1 ? 0 : k < 0.08 ? k / 0.08 : k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1 };
}

/** the colours: green in, red out and lost (the caption a paler red), on a dark outline that reads on any ground */
const FILL: Readonly<Record<FloatKind, string>> = { in: '#4ade80', out: '#f87171', lost: '#f87171' };
const NOTE = '#fecaca', OUTLINE = 'rgba(2,6,23,0.92)';

/** the floats on the 2D overlay (canvas px): each above its point (a walker's height up at the street zoom), risen and faded by its age, its line
 *  in the stack above that; three passes (the street amounts, the place totals, the captions) so the font is set three times a frame */
export function drawMoneyFloats(ctx: CanvasRenderingContext2D, floats: readonly MoneyFloat[], now: number, screen: (x: number, y: number) => { x: number; y: number }, ze: number, dpr: number, w: number, h: number): void {
  if (!floats.length) return;
  const lift = Math.max(10 * dpr, 1.3 * 0.9 * HH * 2 * ze), line = 16 * dpr, rise = RISE_PX * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round'; ctx.strokeStyle = OUTLINE;
  const pass = (merged: boolean | null, px: number) => {
    ctx.font = `${merged === null ? 600 : 800} ${px * dpr}px ui-sans-serif, system-ui, sans-serif`; ctx.lineWidth = (merged === null ? 2.5 : 3.5) * dpr;
    for (const f of floats) {
      if (merged === null ? !floatNote(f) : f.merged !== merged) continue;
      const p = screen(f.x, f.y), o = floatPose(f, now);
      const y = p.y - lift - o.rise * rise - f.stack * line + (merged === null ? 11 * dpr : 0);
      if (p.x < -80 * dpr || p.x > w + 80 * dpr || y < -40 * dpr || y > h + 40 * dpr || o.alpha <= 0) continue;
      const t = merged === null ? floatNote(f) : moneyText(f);
      ctx.globalAlpha = o.alpha; ctx.strokeText(t, p.x, y); ctx.fillStyle = merged === null ? NOTE : FILL[f.kind]; ctx.fillText(t, p.x, y);
    }
  };
  pass(false, 14); pass(true, 16); pass(null, 10);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

/** a lost golfer's caption by its reason (T146's why) */
export const LOST_WHY: Readonly<Record<NonNullable<RangeMoneyEvent['why']>, string>> = { queue: 'lost · line too long', parking: 'lost · car park full', patience: 'lost · gave up waiting' };
/** the range's money event as a float (merged over the range's shop at the mid zoom, at at): a sale, fee, coffee or lesson green, a lost golfer
 *  red with its reason and the bucket it would have bought; a skip's money (no place) none */
export function rangeFloat(e: RangeMoneyEvent, at: { x: number; y: number } | null): MoneyEvent | null {
  if (!e.at) return null;
  const lost = e.kind === 'lost', amount = lost ? e.missed ?? 0 : e.amount;
  if (!(amount > 0)) return null;
  return { x: e.at.x, y: e.at.y, amount, kind: lost ? 'lost' : 'in', group: 'range', ...(at ? { gx: at.x, gy: at.y } : {}), ...(lost && e.why ? { note: LOST_WHY[e.why] } : {}) };
}
/** the city worker's money (City.takeCash: 4 floats each, x, y, $ signed (+ in, - out) and 1 for a sale lost) as floats at the zoom now */
export function addCash(fl: MoneyFloats, cash: ArrayLike<number>, now: number, zoom: number): void {
  for (let k = 0; k + 3 < cash.length; k += 4) {
    const n = cash[k + 2]!, lost = cash[k + 3]! === 1;
    fl.add({ x: cash[k]!, y: cash[k + 1]!, amount: Math.abs(n), kind: lost ? 'lost' : n > 0 ? 'in' : 'out' }, now, zoom);
  }
}
