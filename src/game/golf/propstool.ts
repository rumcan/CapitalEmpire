// The Props tool (plan P24 Phase 3, T131): the engine's side of golf/decor.ts. Pick an item in the Props panel and its ghost follows the cursor
// with its footprint (green where it can stand, red with the reason where it cannot); R turns it to the next of four views (four-view art takes
// its turned picture, lots/preset-art.ts turned(); nothing is ever mirrored); a click buys and places it. With nothing in hand a click selects a
// placed prop, a drag moves it, R turns it and Delete (or Sell) sells it for half its price. Each place, move, turn and sale is one step of the
// course tools' undo (PaintTool.step). The props near a range's shop and mats add their appeal to it (decorAppeal), worked out twice a second.
// The engine gives it a small context, so its own edits stay a few lines.
import type { Prop } from '../types';
import type { Pt } from '../network';
import type { RangeScene } from './rangebiz';
import { turned } from '../lots/preset-art';
import { DECOR_BY_KEY, decorAppeal, decorSpotWhy, inPoly, sellBack, type Box, type DecorItem, type DecorSpot } from './decor';

/** what the tool needs of the engine */
export interface PropsHostCtx {
  /** a golf game (the tool works only there); the library index of an id */
  golf(): boolean; item(id: string): number | undefined; idOf(p: Prop): string;
  /** the size a library item is drawn at (the studio's, else want, else its own; capped by its pixels) and its footprint there (unflipped) */
  scaleOf(item: number, want?: number): number; footprint(item: number, x: number, y: number, scale: number): Box;
  /** the map's checks (decor.ts DecorSpot) without the range's ground, which the tool reads from the scene */
  spot: Omit<DecorSpot, 'range' | 'overlaps'>;
  /** the props whose footprints touch a box, and every prop (the periodic scan) */
  propsIn(b: Box): Iterable<Prop>; props(): Iterable<Prop>; propName(p: Prop): string;
  /** the range's scene (null: not a range start) */
  scene(): RangeScene | null;
  addProp(item: number, x: number, y: number, scale: number): Prop; removeProp(p: Prop): void;
  /** the placed prop under the cursor (css px), the tile under it */
  propAt(mx: number, my: number): Prop | null; tileAt(mx: number, my: number): Pt;
  /** the selection the engine outlines (the Select tool's), and the hover outline */
  selected(): Prop | null; select(p: Prop | null): void; hover(p: Prop | null): void;
  money(): number; spend(n: number): void;
  /** one undo step of the course tools: run changes props and returns what it spent ($; a sale is negative) */
  step(label: string, run: () => number): void; undo(): void; redo(): void;
  save(): void; toast(text: string, kind: 'good' | 'info' | 'warn'): void; emit(): void;
}

/** the ghost the engine draws: the picture (item, at x y and scale), its footprint, and the reason it cannot stand there ('' when it can) */
export interface DecorGhost { item: number; x: number; y: number; scale: number; box: Box; why: string; label: string }

/** the cursor snaps to this lattice (tiles) */
const SNAP = 0.25;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
/** the appeal and the labels are worked out again this often (frames) */
const SCAN_EVERY = 30;

export class PropsTool {
  /** the item in hand (its key; null: none) and the view it is turned to (0..3) */
  hand: string | null = null; view: 0 | 1 | 2 | 3 = 0;
  /** the ghost at the cursor (the item in hand, or the prop being moved), null off the map */
  ghost: DecorGhost | null = null;
  /** the props tool's stand-in labels: the first placed prop of each stand-in kind */
  labels: { p: Prop; text: string }[] = [];
  private drag: { p: Prop; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null = null;
  private tick = 0; private appealV = 0; private appealScene: RangeScene | null = null; private count = 0;
  constructor(private ctx: PropsHostCtx) {}

  // ---- the catalogue's pictures
  /** the library item an item of the catalogue is drawn with at view q (turned, never mirrored) */
  pictureOf(d: DecorItem, q: number): number | undefined { return this.ctx.item(turned(d.id, q).id) ?? this.ctx.item(d.id); }
  /** whether the item has four distinct views (four-view art) */
  turns(d: DecorItem): boolean { return turned(d.id, 1).id !== d.id; }

  // ---- the panel's actions
  /** picks (or, picked again, puts down) an item of the catalogue */
  pick(key: string | null): void {
    this.hand = key && key !== this.hand && DECOR_BY_KEY.has(key) ? key : null; this.view = 0; this.ghost = null; this.drag = null;
    if (this.hand) this.ctx.select(null);
    this.ctx.emit();
  }
  /** puts the item in hand down and ends a move (a tool change) */
  cancel(): void { this.hand = null; this.ghost = null; this.drag = null; }
  /** the placed prop selected in the tool (a prop of the catalogue), and its item */
  selection(): { p: Prop; d: DecorItem } | null { const p = this.ctx.selected(), d = p?.decor ? DECOR_BY_KEY.get(p.decor) : undefined; return p && d ? { p, d } : null; }

  // ---- input
  down(mx: number, my: number): void {
    if (!this.ctx.golf()) return;
    const t = this.ctx.tileAt(mx, my);
    if (this.hand) { this.move(mx, my); this.place(); return; }
    const p = this.ctx.propAt(mx, my);
    if (p?.decor && DECOR_BY_KEY.has(p.decor)) { this.ctx.select(p); this.drag = { p, ox: p.x - t.x, oy: p.y - t.y, sx: mx, sy: my, moved: false }; this.ghost = null; }
    else this.ctx.select(null);
    this.ctx.emit();
  }
  move(mx: number, my: number): void {
    if (!this.ctx.golf()) return;
    const t = this.ctx.tileAt(mx, my);
    if (this.drag) {
      const d = this.drag; if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 4) d.moved = true;
      this.ghost = d.moved ? this.ghostOf(DECOR_BY_KEY.get(d.p.decor!)!, d.p.item, snap(t.x + d.ox), snap(t.y + d.oy), d.p.scale, d.p) : null;
      return;
    }
    if (this.hand) { const d = DECOR_BY_KEY.get(this.hand)!, item = this.pictureOf(d, this.view); this.ghost = item === undefined ? null : this.ghostOf(d, item, snap(t.x), snap(t.y), this.ctx.scaleOf(item, d.scale), null); return; }
    this.ghost = null;
    const p = this.ctx.propAt(mx, my); this.ctx.hover(p?.decor ? p : null);
  }
  up(): void {
    const d = this.drag; this.drag = null; if (!d) return;
    const g = this.ghost; this.ghost = null;
    if (!d.moved || !g) { this.ctx.emit(); return; }
    if (g.why) { this.ctx.toast(g.why, 'warn'); this.ctx.emit(); return; }
    const it = DECOR_BY_KEY.get(d.p.decor!)!;
    this.ctx.step(`Move ${it.name.toLowerCase()}`, () => { const q = this.remake(d.p, d.p.item, g.x, g.y); this.ctx.select(q); return 0; });
    this.changed();
  }
  /** a key in the tool: R turns (the item in hand, else the selected prop), Delete sells the selected prop, Ctrl+Z / Ctrl+Y undo and redo; true when taken */
  key(e: KeyboardEvent): boolean {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); this.ctx.undo(); this.changed(); return true; }
      if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); this.ctx.redo(); this.changed(); return true; }
      return false;
    }
    if (e.key === 'r' || e.key === 'R') { this.turn(); return true; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (this.selection()) { this.sell(); return true; } }
    return false;
  }
  /** Esc: the item in hand goes down, else the selection; true when it did something */
  esc(): boolean {
    if (this.hand) { this.pick(null); return true; }
    if (this.selection()) { this.ctx.select(null); this.ctx.emit(); return true; }
    return false;
  }

  // ---- the actions
  /** buys and places the item in hand on the ghost (or says why not) */
  place(): void {
    const g = this.ghost, d = this.hand ? DECOR_BY_KEY.get(this.hand) : undefined; if (!g || !d) return;
    if (g.why) { this.ctx.toast(g.why, 'warn'); return; }
    this.ctx.step(`Place ${d.name.toLowerCase()}`, () => { const p = this.ctx.addProp(g.item, g.x, g.y, g.scale); p.decor = d.key; this.ctx.spend(d.price); return d.price; });
    this.changed(); this.ctx.toast(`${d.name} placed (-$${d.price.toLocaleString()})`, 'good');
  }
  /** turns the item in hand to its next view, or the selected prop where it stands (when its turned footprint fits) */
  turn(): void {
    if (this.hand) {
      const d = DECOR_BY_KEY.get(this.hand)!; this.view = ((this.view + 1) % 4) as 0 | 1 | 2 | 3;
      if (!this.turns(d)) this.ctx.toast(`${d.name}: one picture, the same from every side`, 'info');
      if (this.ghost) { const item = this.pictureOf(d, this.view)!; this.ghost = this.ghostOf(d, item, this.ghost.x, this.ghost.y, this.ctx.scaleOf(item, d.scale), null); }
      this.ctx.emit(); return;
    }
    const s = this.selection(); if (!s) return;
    if (!this.turns(s.d)) { this.ctx.toast(`${s.d.name}: one picture, the same from every side`, 'info'); return; }
    const item = this.ctx.item(turned(this.ctx.idOf(s.p), 1).id); if (item === undefined) return;
    const g = this.ghostOf(s.d, item, s.p.x, s.p.y, s.p.scale, s.p); if (g.why) { this.ctx.toast(g.why, 'warn'); return; }
    this.ctx.step(`Turn ${s.d.name.toLowerCase()}`, () => { const q = this.remake(s.p, item, s.p.x, s.p.y); this.ctx.select(q); return 0; });
    this.changed();
  }
  /** sells the selected prop: half its price back */
  sell(): void {
    const s = this.selection(); if (!s) return;
    const back = sellBack(s.d);
    this.ctx.step(`Sell ${s.d.name.toLowerCase()}`, () => { this.ctx.removeProp(s.p); this.ctx.spend(-back); return -back; });
    this.ctx.select(null); this.changed(); this.ctx.toast(`${s.d.name} sold (+$${back.toLocaleString()})`, 'good');
  }
  /** a prop made again at a new spot or picture (a move or a turn: remove and add, so the undo journal sees it), keeping its kind and size */
  private remake(p: Prop, item: number, x: number, y: number): Prop {
    const key = p.decor!; this.ctx.removeProp(p);
    const q = this.ctx.addProp(item, x, y, p.scale); q.decor = key; return q;
  }
  private changed(): void { this.tick = SCAN_EVERY; this.scan(true); this.ctx.save(); this.ctx.emit(); }

  // ---- the spot check
  /** the ghost of catalogue item d drawn as library item `item` at (x, y): its footprint and why it cannot stand there (ignore: the prop being moved) */
  ghostOf(d: DecorItem, item: number, x: number, y: number, scale: number, ignore: Prop | null): DecorGhost {
    const box = this.ctx.footprint(item, x, y, scale), sc = this.ctx.scene();
    const spot: DecorSpot = {
      ...this.ctx.spot,
      range: (px, py) => {
        if (!sc) return '';
        for (const pa of sc.patches) if ((pa.surf === 'concrete' || pa.surf === 'asphaltDark' || pa.surf === 'tee') && inPoly(pa.pts, px, py)) return 'mats';
        for (const t of sc.targets) if ((t.x - px) ** 2 + (t.y - py) ** 2 <= (t.r + 0.6) ** 2) return 'target';
        return '';
      },
      overlaps: b => { for (const p of this.ctx.propsIn(b)) if (p !== ignore && b[0] < p.x1 - 0.05 && b[2] > p.x0 + 0.05 && b[1] < p.y1 - 0.05 && b[3] > p.y0 + 0.05) return this.ctx.propName(p); return ''; },
    };
    let why = decorSpotWhy(box, spot);
    if (!why && !ignore && d.price > this.ctx.money()) why = `Not enough money: it costs $${d.price.toLocaleString()}`;
    return { item, x, y, scale, box, why, label: why || (ignore ? `Move ${d.name.toLowerCase()} here` : `${d.name} · $${d.price.toLocaleString()}`) };
  }

  // ---- appeal and labels
  /** once a frame: every SCAN_EVERY frames the placed props are looked over again (an undo, a load or the bulldozer can change them) */
  frame(): void { if (++this.tick >= SCAN_EVERY) this.scan(false); }
  private scan(force: boolean): void {
    this.tick = 0;
    const seen = new Set<string>(), labels: { p: Prop; text: string }[] = [], placed: { key: string; x: number; y: number }[] = [];
    for (const p of this.ctx.props()) {
      if (!p.decor) continue;
      const d = DECOR_BY_KEY.get(p.decor); if (!d) continue;
      placed.push({ key: d.key, x: p.x, y: p.y });
      if (d.standIn && !seen.has(d.key)) { seen.add(d.key); labels.push({ p, text: `Stand In for ${d.standIn}` }); }
    }
    this.labels = labels;
    const sc = this.ctx.scene(), was = this.appealV;
    this.appealV = sc ? decorAppeal(placed, rangeAnchors(sc)) : 0; this.appealScene = sc;
    if (!force && (was !== this.appealV || placed.length !== this.count)) this.ctx.emit();
    this.count = placed.length;
  }
  /** the appeal the placed props add to the range now (0 without a range) */
  appeal(): number { if (this.appealScene !== this.ctx.scene()) this.scan(true); return this.appealV; }
  /** how many props of the catalogue stand on the map */
  get placed(): number { return this.count; }
}

/** where a range's props count from (plan P24 Phase 3): its shop and every open mat */
export function rangeAnchors(sc: RangeScene): Pt[] {
  const shop = sc.pieces.find(p => p.key === 'shop');
  return [...(shop ? [{ x: shop.x, y: shop.y }] : []), ...sc.bays.map(b => b.stand)];
}
