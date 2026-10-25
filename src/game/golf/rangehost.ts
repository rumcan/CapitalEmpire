// The range business on the map (plan P24 Phase 1, T129): the engine's side of golf/rangebiz.ts. It lays the range's scene (its ground patches,
// its auto props and, once, its cart paths), steps the golfers on the town clock and books their sales, and hands the engine the golfers and cars
// to draw as movers and the balls and labels to draw over the map. The engine gives it a small context, so its own edits stay a few lines.
import type { Drawable } from '../sprites';
import { CAR_SCALE } from '../sprites';
import type { Prop } from '../types';
import type { LotPatch } from '../ground-protocol';
import type { Pt } from '../network';
import type { Rect } from './mode';
import { GOLFER_BASE, GOLFER_FRAMES, GOLFER_PEOPLE, WALK_DIRS } from '../library';
import { carHeading, facings } from '../traffic';
import { surfacePreset } from '../paint-presets';
import { SURFACE_TEX } from './paintcourse';
import type { GolfSurface } from './types';
import { RangeSim, rangeScene, rangeStats, upgradeWhy, withPrice, withUpgrade, RANGE_UPGRADES, type CarSlot, type DemandCtx, type RangeBizSave, type RangeClock, type RangeScene, type RangeUpgradeId, type ScenePatch, type ScenePiece } from './rangebiz';

/** what the host needs of the engine */
export interface RangeHostCtx {
  /** the range state in the save (null: not a range start), the plot and its facing (null: no range business) */
  biz(): RangeBizSave | null; plot(): { rect: Rect; facing: 0 | 1 | 2 | 3 } | null;
  /** the range's car park: its bays (point and heading) and its entrance; null while it is not built */
  carPark(): { bays: CarSlot[]; entrance: Pt } | null;
  /** places a scene piece as an auto prop (turned to its view, at its size, the key its auto) and removes one */
  addPiece(p: ScenePiece, key: string): Prop | null; removeProp(p: Prop): void;
  /** the ground patches of a key (null drops them), the cart paths to lay (cement slab, committed), the trees to clear off a box */
  setGround(key: string, patches: LotPatch[] | null): void; layPaths(legs: { a: Pt; b: Pt }[]): void; clearTrees(box: [number, number, number, number]): void;
  /** the treasury, a spend ($, construction), takings booked ($, business income) */
  money(): number; spend(n: number): void; book(n: number): void;
  /** the demand's inputs, the town day's length (sim s), the sim's time (s) and the town clock */
  demand(): DemandCtx; dayLen(): number; simT(): number; clock(): RangeClock;
  save(): void; toast(text: string, kind: 'good' | 'info' | 'warn'): void; emit(): void;
}

/** the texture a scene patch is laid with: a golf surface takes the course's own preset (the brush's, the owner's studio presets), else its
 *  game texture; the rest are ground textures as they are */
function patchTex(s: ScenePatch['surf']): LotPatch['tex'] {
  if (s === 'concrete') return 'pad'; // the Paint tool's concrete
  if (s === 'dirt' || s === 'grassDry' || s === 'asphaltDark' || s === 'gravel') return s;
  return (surfacePreset(s) ?? SURFACE_TEX[s as GolfSurface].tex) as LotPatch['tex'];
}
/** the takings are booked this often (sim s), not on every sale; a frame this long (sim s) is a skip */
const BOOK_EVERY = 2, SKIP_DT = 120;

export class RangeHost {
  scene: RangeScene | null = null;
  readonly sim: RangeSim;
  /** the scene's auto props by key, and its stand-in labels (prop, text) */
  private props = new Map<string, Prop>(); labels: { p: Prop; text: string }[] = [];
  private key = ''; private lastT = -1; private owed = 0; private owedT = 0;
  private movers: Drawable[] = []; private carDraw: Drawable[] = [];
  /** the balls in the air (x y h triples) */
  readonly flyingBuf = new Float32Array(3 * 160); nFlying = 0;
  /** the range card is open */
  cardOpen = false;
  constructor(private ctx: RangeHostCtx, seed: number) { this.sim = new RangeSim(seed, GOLFER_PEOPLE.length); }

  /** the scene laid again when the range's state, its plot or its car park changed (cheap to call every frame: a key compares them) */
  sync(force = false): void {
    const b = this.ctx.biz(), pl = this.ctx.plot(), cp = this.ctx.carPark();
    const key = b && pl ? `${pl.rect.join(',')}:${pl.facing}:${b.owned.join(',')}:${cp ? cp.bays.length : -1}` : '';
    if (!force && key === this.key) return;
    this.key = key;
    if (!b || !pl) { this.drop(); return; }
    const sc = rangeScene(pl.rect, pl.facing, b);
    // the props: kept where the key and picture stay, the rest made again
    const want = new Map(sc.pieces.map(p => [p.key, p]));
    for (const [k, p] of this.props) { const w = want.get(k); if (!w || !this.scene || !sameSpot(this.scene.pieces.find(q => q.key === k), w)) { this.ctx.removeProp(p); this.props.delete(k); } }
    for (const [k, w] of want) if (!this.props.has(k)) { const p = this.ctx.addPiece(w, 'range:' + k); if (p) this.props.set(k, p); }
    this.labels = sc.pieces.filter(p => p.label && this.props.has(p.key)).map(p => ({ p: this.props.get(p.key)!, text: p.label! }));
    // laid as painted areas (the Paint tool's path, which knows the presets), in the scene's order and under anything the player paints
    this.ctx.setGround('range:ground', sc.patches.map((p, i) => ({ pts: p.pts, tex: patchTex(p.surf), paint: { s: 1, a: 0, b: 0, bt: 'kerb', z: -1e6 + i } })));
    if (!this.scene) this.ctx.clearTrees(sc.box);
    if (!b.paths) { this.ctx.layPaths(sc.paths); b.paths = true; this.ctx.save(); }
    this.scene = sc;
    this.sim.setScene(sc, cp?.bays ?? [], cp?.entrance ?? null);
  }
  /** everything off the map (a new game, a load, not a range start) */
  drop(): void {
    for (const p of this.props.values()) this.ctx.removeProp(p);
    this.props.clear(); this.labels = []; this.scene = null; this.key = ''; this.lastT = -1; this.sim.clear();
    this.ctx.setGround('range:ground', null);
  }

  /** once a frame: the golfers move on by the sim time since the last frame, and their takings are booked every BOOK_EVERY sim s */
  step(): void {
    const b = this.ctx.biz(); if (!b || !this.scene) return;
    const t = this.ctx.simT(), dt = this.lastT < 0 ? 0 : t - this.lastT; this.lastT = t;
    if (dt <= 0) return;
    // a long frame (a slow tab, 20x) is stepped in pieces of half a second, so the golfers walk on; only a skip (two minutes and more of sim
    // time at once: Skip to season end) is booked by the expected sales and clears them
    const clock = this.ctx.clock(), dem = this.ctx.demand(), L = this.ctx.dayLen();
    if (dt >= SKIP_DT) this.owed += this.sim.step(dt, clock, b, dem, L);
    else for (let left = dt; left > 1e-9; left -= 0.5) this.owed += this.sim.step(Math.min(0.5, left), clock, b, dem, L);
    this.owedT += dt;
    if (this.owed > 0 && (this.owedT >= BOOK_EVERY || dt >= SKIP_DT)) { this.ctx.book(Math.round(this.owed)); this.owed = 0; this.owedT = 0; if (this.cardOpen) this.ctx.emit(); }
    this.nFlying = this.sim.flying(this.flyingBuf);
  }

  /** the golfers and cars in the tile box as movers (reused): the golfers' 3D frames, the cars at CAR_SCALE about their centres */
  movers_(x0: number, y0: number, x1: number, y1: number): Drawable[] {
    const out = this.movers; out.length = 0;
    if (!this.scene) return out;
    const d = this.sim.view(), F = facings();
    for (let k = 0; k < d.nPeople; k++) {
      const p = d.people[k]!; if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      const m = this.mover(out.length);
      m.item = GOLFER_BASE + (p.person * WALK_DIRS.length + p.row) * GOLFER_FRAMES + p.frame; m.x = p.x; m.y = p.y; m.flip = false; m.scale = 1; m.moving = false;
      m.x0 = p.x - 0.12; m.y0 = p.y - 0.12; m.x1 = p.x + 0.12; m.y1 = p.y + 0.12; out.push(m);
    }
    for (let k = 0; k < d.nCars; k++) {
      const c = d.cars[k]!; if (c.x < x0 || c.x > x1 || c.y < y0 || c.y > y1) continue;
      const f = F[c.type % 5]![carHeading(c.ang)]!, m = this.carMover(k);
      m.item = f.item; m.flip = f.flip; m.scale = CAR_SCALE; m.moving = true;
      m.x = c.x - f.ox * CAR_SCALE; m.y = c.y - f.oy * CAR_SCALE; m.x0 = c.x - f.hx * CAR_SCALE; m.x1 = c.x + f.hx * CAR_SCALE; m.y0 = c.y - f.hy * CAR_SCALE; m.y1 = c.y + f.hy * CAR_SCALE;
      out.push(m);
    }
    return out;
  }
  private mover(k: number): Drawable { const a = this.peopleDraw; return a[k] ?? (a[k] = { item: 0, x: 0, y: 0, flip: false, scale: 1, x0: 0, y0: 0, x1: 0, y1: 0, moving: false }); }
  private peopleDraw: Drawable[] = [];
  private carMover(k: number): Drawable { const a = this.carDraw; return a[k] ?? (a[k] = { item: 0, x: 0, y: 0, flip: false, scale: CAR_SCALE, x0: 0, y0: 0, x1: 0, y1: 0, moving: true }); }

  /** over the map (canvas px, screen: a tile point to canvas px, ze: zoom x dpr): at the street tier the lying balls (white dots) and the balls in
   *  the air (a dot up its arc, its shadow on the grass) and the distance numbers over their markers; at district zoom the "Driving Range" label */
  drawOver(c: CanvasRenderingContext2D, screen: (x: number, y: number) => { x: number; y: number }, ze: number, zoom: number, dpr: number, w: number, h: number): void {
    const sc = this.scene; if (!sc) return;
    const on = (p: { x: number; y: number }, m = 40) => p.x > -m && p.y > -m && p.x < w + m && p.y < h + m;
    if (zoom >= 0.12) {
      const r = Math.max(0.9 * dpr, 0.09 * 64 * ze), L = this.sim.lying, n = this.sim.nLying;
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.beginPath();
      for (let i = 0; i < n; i++) { const p = screen(L[2 * i]!, L[2 * i + 1]!); if (on(p, 4)) { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, Math.PI * 2); } }
      c.fill();
      const F = this.flyingBuf;
      c.fillStyle = 'rgba(20,40,10,0.35)'; c.beginPath();
      for (let i = 0; i < this.nFlying; i++) { const p = screen(F[3 * i]!, F[3 * i + 1]!); if (on(p)) { c.moveTo(p.x + r, p.y); c.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); } }
      c.fill(); c.fillStyle = '#ffffff'; c.beginPath();
      for (let i = 0; i < this.nFlying; i++) { const p = screen(F[3 * i]!, F[3 * i + 1]!), hy = F[3 * i + 2]! * 32 * ze * 1.4; if (on(p, 200)) { c.moveTo(p.x + r * 1.2, p.y - hy); c.arc(p.x, p.y - hy, r * 1.2, 0, Math.PI * 2); } }
      c.fill();
      // the distance numbers: a small dark plate with white figures just above each marker
      const px = Math.round(dpr * Math.max(9, 11 * Math.sqrt(Math.min(1, zoom / 0.3))));
      c.font = `700 ${px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const t of sc.numbers) {
        const p = screen(t.x, t.y); if (!on(p)) continue;
        const y = p.y - (t.low ? 1.2 : 2.6) * 32 * ze - (t.low ? 0 : px), tw = c.measureText(t.text).width + 8 * dpr;
        c.fillStyle = 'rgba(16,24,16,0.8)'; c.beginPath(); c.roundRect(p.x - tw / 2, y - px * 0.75, tw, px * 1.5, 3 * dpr); c.fill();
        c.fillStyle = '#f8fafc'; c.fillText(t.text, p.x, y + 0.5 * dpr);
      }
      c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    } else if (zoom >= 0.03) {
      const p = screen(sc.label.x, sc.label.y); if (!on(p, 200)) return;
      const px = Math.round(dpr * 12);
      c.font = `700 ${px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 3 * dpr; c.strokeStyle = 'rgba(10,30,10,0.85)'; c.strokeText('Driving Range', p.x, p.y); c.fillStyle = '#ecfccb'; c.fillText('Driving Range', p.x, p.y);
      c.textAlign = 'start'; c.textBaseline = 'alphabetic';
    }
  }

  // ---- the range card's actions
  /** buys upgrade id (pays, re-lays the scene, saves); false with the reason toasted when it cannot */
  buy(id: RangeUpgradeId): boolean {
    const b = this.ctx.biz(); if (!b) return false;
    const why = upgradeWhy(b, id, this.ctx.money()); if (why) { this.ctx.toast(why, 'warn'); return false; }
    const u = RANGE_UPGRADES.find(q => q.id === id)!;
    this.ctx.spend(u.cost); Object.assign(b, withUpgrade(b, id)); this.sync(true); this.ctx.save();
    this.ctx.toast(`${u.name} built (-$${u.cost.toLocaleString()})`, 'good'); this.ctx.emit();
    return true;
  }
  /** sets the bucket price (whole dollars in the band) */
  setPrice(price: number): void { const b = this.ctx.biz(); if (!b) return; b.price = withPrice(b, price).price; this.ctx.save(); this.ctx.emit(); }
  /** whether tile (x, y) is on the range's front (the shop, the yard, the mats: where a click opens the card) */
  hit(x: number, y: number): boolean {
    const pl = this.ctx.plot(); if (!pl || !this.scene) return false;
    const [rx, ry, rw, rh] = pl.rect, f = pl.facing;
    // the front: the 26 tiles of the plot on the road side (the frame's v 0..26), turned with the facing
    const fr: Rect = f === 2 ? [rx, ry, rw, 26] : f === 0 ? [rx, ry + rh - 26, rw, 26] : f === 1 ? [rx, ry, 26, rh] : [rx + rw - 26, ry, 26, rh];
    return x >= fr[0] && x < fr[0] + fr[2] && y >= fr[1] && y < fr[1] + fr[3];
  }
  /** the range as the card shows it */
  view() {
    const b = this.ctx.biz(); if (!b) return null;
    const dem = this.ctx.demand(), st = rangeStats(b, dem), money = this.ctx.money();
    return {
      biz: b, stats: st, today: this.sim.today, hours: `${String(st.open).padStart(2, '0')}:00-${st.close}:00`,
      upgrades: RANGE_UPGRADES.map(u => ({ ...u, why: upgradeWhy(b, u.id, money), owned: b.owned.includes(u.id) })),
      demand: dem, dayLen: this.ctx.dayLen(),
    };
  }
}
/** whether two scene pieces stand in the same spot as the same picture */
function sameSpot(a: ScenePiece | undefined, b: ScenePiece): boolean { return !!a && a.id === b.id && a.x === b.x && a.y === b.y && a.q === b.q && a.scale === b.scale && a.fit === b.fit; }
export type RangeCardView = NonNullable<ReturnType<RangeHost['view']>>;
