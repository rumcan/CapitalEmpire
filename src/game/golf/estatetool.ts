// T353 (#995): Course ▸ Buildings ▸ House lots, the engine's side of golf/estate.ts. Pick the tool and the lots a click or a drag would lay show at the cursor
// along the street beside it: green where they can be laid, red and hatched with the reason where they cannot (the hole card's "golfers there are in range", the
// course in the way, ...); a click lays the lot nearest the pointer, a drag lays the row along the street that the drag covers (on the side of the street the
// drag lies on; along the street itself: both). They go on sale at once (golf/estate.ts) and cost LAY_COST each. With no street in reach the tool says so and
// offers to draw an estate street. The engine gives it a small context, so its own edits stay a few lines.
import type { Pt } from '../network';
import {
  LAY_COST, CLICK_T, pickFrames, placeLots, planLots, type Along, type Estate, type EstateEnv, type EstateLot, type Frame, type StreetSeg,
} from './estate';

/** what the tool needs of the engine */
export interface EstateToolCtx {
  /** the tile under a point of the map (css px) */
  tileAt(mx: number, my: number): Pt;
  /** the street pieces lots can front within r tiles of a point (town road classes on the ground: not cart paths, drives, bridges or tunnels) */
  streets(near: Pt, r: number): StreetSeg[];
  /** what the rules read of the game now */
  env(): EstateEnv;
  /** the estate (made when the first lot is laid) and the game month, the game's seed, the treasury ($) */
  estate(): Estate; now(): number; seed(): number; money(): number;
  /** what a lot would ask now, $, and its view in words ("fairway view"): the ghost's price tag */
  quote(f: Frame): { price: number; view: string };
  /** the lots laid cost this much ($), floated up at the point */
  charge(cost: number, at: Pt): void;
  /** lots were laid: the engine draws them and saves */
  laid(placed: EstateLot[]): void;
  /** nothing to front near the point: the engine offers to draw an estate street */
  noStreet(at: Pt): void;
  toast(text: string, kind: 'good' | 'info' | 'warn'): void;
  emit(): void;
}

/** the ghost the engine draws: the lots a click or a drag would lay (frames with the reason each is refused, '' when it can be laid), how many of each, the
 *  cost ($ to lay them), the words by the cursor and whether they are a refusal */
export interface EstateGhost { frames: { f: Frame; why: string }[]; ok: number; refused: number; cost: number; label: string; bad: boolean }

/** how far (tiles) from a point the streets are looked for, for a click and for a drag (added to the drag's half length) */
const STREET_REACH = 40;
/** the words when nothing is in reach */
export const NO_STREET = 'No street here: house lots front a street';

export class EstateTool {
  /** the tool is in hand */
  on = false;
  /** the ghost at the cursor (null: off the map, or nothing in hand) */
  ghost: EstateGhost | null = null;
  /** a drag's start (tiles), null when not dragging; the pointer's tile */
  private p0: Pt | null = null; private at: Pt | null = null;
  private key = '';
  constructor(private ctx: EstateToolCtx) {}

  /** takes the tool in hand (true) or puts it down */
  arm(on: boolean): void { this.on = on; this.p0 = null; this.ghost = null; this.key = ''; if (on) this.refresh(); this.ctx.emit(); }
  /** Esc: a drag in progress is dropped first; true when something was in hand (the tool itself is put down by the engine's ladder after) */
  cancel(): boolean { if (this.p0) { this.p0 = null; this.refresh(); this.ctx.emit(); return true; } return false; }
  /** the pointer left the map */
  leave(): void { this.at = null; this.ghost = null; this.key = ''; }
  /** whether a drag is under way */
  get dragging(): boolean { return !!this.p0; }

  /** the pointer went down: a drag starts here (a click lays on release) */
  down(mx: number, my: number): void { if (!this.on) return; this.at = this.ctx.tileAt(mx, my); this.p0 = { ...this.at }; this.refresh(); this.ctx.emit(); }
  /** the pointer moved: the ghost follows (the words by the cursor change with it, so the panel is told when they do) */
  move(mx: number, my: number): void {
    if (!this.on) return;
    const was = this.ghost?.label ?? ''; this.at = this.ctx.tileAt(mx, my); this.refresh();
    if ((this.ghost?.label ?? '') !== was) this.ctx.emit();
  }
  /** the pointer came up: the lots the ghost shows are laid (a click lays the one under it, a drag the row it covered) */
  up(mx: number, my: number): void {
    if (!this.on || !this.p0) return;
    this.at = this.ctx.tileAt(mx, my);
    const from = this.p0, to = this.at; this.p0 = null;
    const along = this.alongOf(from, to);
    if (!along.segs.length) { this.ctx.noStreet(to); this.ctx.toast(NO_STREET, 'warn'); this.refresh(); this.ctx.emit(); return; }
    const e = this.ctx.estate(), env = this.ctx.env(), plan = planLots(e, along, env);
    if (!plan.ok.length) {
      const why = plan.refused[0]?.why ?? 'No lot fits there';
      this.ctx.toast(plan.refused.length > 1 ? `${why} (${plan.refused.length} lots refused)` : why, 'warn'); this.refresh(); this.ctx.emit(); return;
    }
    const cost = plan.ok.length * LAY_COST;
    if (cost > this.ctx.money()) { this.ctx.toast(`Not enough money: ${plan.ok.length} lot${plan.ok.length > 1 ? 's' : ''} cost $${cost.toLocaleString()} to lay`, 'warn'); this.refresh(); this.ctx.emit(); return; }
    const r = placeLots(e, along, env, this.ctx.now(), this.ctx.seed());
    this.ctx.charge(r.cost, to);
    this.ctx.laid(r.placed);
    const n = r.placed.length, ref = r.refused.length;
    this.ctx.toast(`${n} house lot${n > 1 ? 's' : ''} laid for sale (-$${r.cost.toLocaleString()})${ref ? `; ${ref} refused: ${r.refused[0]!.why}` : ''}`, 'good');
    this.key = ''; this.refresh(); this.ctx.emit();
  }

  /** where the lots would be laid for a click or drag from→to: the streets round them */
  private alongOf(from: Pt, to: Pt): Along {
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, r = Math.hypot(to.x - from.x, to.y - from.y) / 2 + STREET_REACH;
    return { segs: this.ctx.streets(mid, r), from, to };
  }
  /** the ghost worked out again at the pointer (cheap enough for every move: a few lots against the rules), only when the pointer or the estate moved */
  refresh(): void {
    const at = this.at; if (!this.on || !at) { this.ghost = null; return; }
    const from = this.p0 ?? at, e = this.ctx.estate();
    const key = `${from.x.toFixed(1)},${from.y.toFixed(1)}|${at.x.toFixed(1)},${at.y.toFixed(1)}|${e.rev}|${e.lots.length}|${this.ctx.money()}`;
    if (key === this.key && this.ghost) return;
    this.key = key;
    const along = this.alongOf(from, at);
    if (!along.segs.length) { this.ghost = { frames: [], ok: 0, refused: 0, cost: 0, label: NO_STREET, bad: true }; return; }
    const picked = pickFrames(along.segs, from, at);
    if (!picked.length) { this.ghost = { frames: [], ok: 0, refused: 0, cost: 0, label: Math.hypot(at.x - from.x, at.y - from.y) < CLICK_T ? 'Point at a lot beside a street' : 'No lot beside the street there', bad: true }; return; }
    const plan = planLots(e, along, this.ctx.env()), bad = new Map(plan.refused.map(x => [x.frame, x.why]));
    const frames = picked.map(f => ({ f, why: bad.get(f) ?? '' }));
    // (planLots works on its own picks: match them to the ghost's by their place)
    const whyAt = (f: Frame) => plan.refused.find(x => Math.abs(x.frame.o.x - f.o.x) < 1e-6 && Math.abs(x.frame.o.y - f.o.y) < 1e-6 && x.frame.side === f.side)?.why ?? '';
    for (const q of frames) q.why = whyAt(q.f);
    const ok = frames.filter(q => !q.why).length, refused = frames.length - ok, cost = ok * LAY_COST;
    let label: string, isBad = false;
    if (ok === 0) { label = frames[0]!.why + (frames.length > 1 ? ` (${frames.length} lots)` : ''); isBad = true; }
    else if (cost > this.ctx.money()) { label = `Not enough money: ${ok} lot${ok > 1 ? 's' : ''} cost $${cost.toLocaleString()} to lay`; isBad = true; }
    else {
      const first = frames.find(q => !q.why)!, q = this.ctx.quote(first.f);
      label = ok === 1 ? `House lot · $${cost.toLocaleString()} to lay · asks about $${q.price.toLocaleString()} (${q.view})` : `${ok} house lots · $${cost.toLocaleString()} to lay`;
      if (refused) label += ` · ${refused} refused: ${frames.find(x => x.why)!.why}`;
    }
    this.ghost = { frames, ok, refused, cost, label, bad: isBad };
  }
}
