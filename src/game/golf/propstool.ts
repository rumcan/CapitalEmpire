// The Props tool (plan P24 Phase 3, T131): the engine's side of golf/decor.ts. Pick an item in the Props panel and its ghost follows the cursor
// with its footprint (green where it can stand, red with the reason where it cannot); R turns it to the next of four views (four-view art takes
// its turned picture, lots/preset-art.ts turned(); nothing is ever mirrored); a click buys and places it. With nothing in hand a click selects a
// placed prop, a drag moves it, R turns it and Delete (or Sell) sells it for half its price. Each place, move, turn and sale is one step of the
// course tools' undo (PaintTool.step). The props near a range's shop and mats add their appeal to it (decorAppeal), worked out twice a second.
// The engine gives it a small context, so its own edits stay a few lines.
// T231 (the concept kit): one-view items with several pictures (variants: R steps to the next); runs (the hedge: press, drag along the map's x or
// y axis and let go to lay its pieces end to end, priced a piece); the fountain jet, placeable only in water; and the pond actions: the Stone
// pond edge (the pond under the cursor gets its boulders and lily pads, golf/ponds.ts, priced a stone; on a stone-edged pond it gives back the
// natural edge for half) and the Fountain pond (a round pond dug where it is placed, with its stone edge and a jet, all one undo step).
import type { Prop } from '../types';
import type { Pt } from '../network';
import type { RangeScene } from './rangebiz';
import { turned } from '../lots/preset-art';
import { DECOR_BY_KEY, POND_R, decorAppeal, decorSpotWhy, inPoly, sellBack, standsIn, type Box, type DecorGroup, type DecorItem, type DecorSpot } from './decor';
import { discCells, pondAt, pondHasStones, setPondEdge, shorePieces, type Pond, type PondPiece } from './ponds';
import { KIT_FOUNTAIN } from '../kit';

/** what the tool needs of the engine */
export interface PropsHostCtx {
  /** a golf game (the tool works only there); the library index of an id */
  golf(): boolean; item(id: string): number | undefined; idOf(p: Prop): string;
  /** the size a library item is drawn at (want: the catalogue's, else the studio's, else its own; capped by its pixels) and its footprint there (unflipped) */
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
  /** T231: the still-water pond at a tile (the course's water and painted water; null: none, or the open lake), the ponds' edge marks and their
   *  setter (inside a step: undo carries them), and the Fountain pond's water dug at (x, y), r tiles round, inside the open step: the course's
   *  water on your land, a painted water area in the town; false when it could not be */
  pondAt?(x: number, y: number): Pond | null;
  pondMarks?(): number[]; setPondMarks?(m: number[]): void;
  digPond?(x: number, y: number, r: number, where: 'course' | 'town'): boolean;
}

/** the ghost the engine draws: the picture (item, at x y and scale), its footprint, and the reason it cannot stand there ('' when it can);
 *  noPic: only the label (T231: taking a pond's stones away) */
export interface DecorGhost { item: number; x: number; y: number; scale: number; box: Box; why: string; label: string; noPic?: true }

/** the cursor snaps to this lattice (tiles) */
const SNAP = 0.25;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
/** the appeal and the labels are worked out again this often (frames) */
const SCAN_EVERY = 30;

export class PropsTool {
  /** the item in hand (its key; null: none) and the view it is turned to (0..3; T231: a variant item's picture, 0..n-1) */
  hand: string | null = null; view = 0;
  /** T231: the extra pictures the ghost draws (a run's other pieces, a pond's stones), each with its footprint */
  ghosts: DecorGhost[] = [];
  /** T231: a run being dragged: where it started (tiles) */
  private runFrom: Pt | null = null;
  /** T187: where the tool was opened from (Decoration: the course; Town decoration: the town), the group it opened on (Town decoration ›
   *  Buildings), and All (the whole catalogue, not only the place's) */
  where: 'course' | 'town' = 'course'; group: DecorGroup | null = null; all = false;
  /** T193: the group the toolbar's flyout opened (Props ▸ Plants): the panel shows its cards alone; null: every group */
  focus: DecorGroup | null = null;
  /** opens the tool's view: its place and group (the item in hand goes down when the place changes) */
  setView(where: 'course' | 'town', group: DecorGroup | null = null): void {
    if (where !== this.where) { this.hand = null; this.ghost = null; this.ghosts = []; this.drag = null; this.runFrom = null; }
    this.where = where; this.group = group; this.focus = null; this.ctx.emit();
  }
  /** the ghost at the cursor (the item in hand, or the prop being moved), null off the map */
  ghost: DecorGhost | null = null;
  /** the props tool's stand-in labels: the first placed prop of each stand-in kind */
  labels: { p: Prop; text: string }[] = [];
  private drag: { p: Prop; ox: number; oy: number; sx: number; sy: number; moved: boolean } | null = null;
  private tick = 0; private appealV = 0; private appealScene: RangeScene | null = null; private count = 0;
  constructor(private ctx: PropsHostCtx) {}

  // ---- the catalogue's pictures
  /** the library item an item of the catalogue is drawn with at view q (turned, never mirrored; T231: a variant item's q-th picture) */
  pictureOf(d: DecorItem, q: number): number | undefined {
    if (d.variants?.length) return this.ctx.item(d.variants[((q % d.variants.length) + d.variants.length) % d.variants.length]!) ?? this.ctx.item(d.id);
    return this.ctx.item(turned(d.id, q).id) ?? this.ctx.item(d.id);
  }
  /** whether the item has four distinct views (four-view art), or (T231) several pictures R steps through */
  turns(d: DecorItem): boolean { return d.variants ? d.variants.length > 1 : !d.run && !d.pond && turned(d.id, 1).id !== d.id; }
  /** how many views R steps through */
  private views(d: DecorItem): number { return d.variants?.length ?? 4; }

  // ---- the panel's actions
  /** picks (or, picked again, puts down) an item of the catalogue */
  pick(key: string | null): void {
    this.hand = key && key !== this.hand && DECOR_BY_KEY.has(key) ? key : null; this.view = 0; this.ghost = null; this.ghosts = []; this.drag = null; this.runFrom = null;
    if (this.hand) this.ctx.select(null);
    this.ctx.emit();
  }
  /** puts the item in hand down and ends a move (a tool change) */
  cancel(): void { this.hand = null; this.ghost = null; this.ghosts = []; this.drag = null; this.runFrom = null; }
  /** the placed prop selected in the tool (a prop of the catalogue), and its item */
  selection(): { p: Prop; d: DecorItem } | null { const p = this.ctx.selected(), d = p?.decor ? DECOR_BY_KEY.get(p.decor) : undefined; return p && d ? { p, d } : null; }

  // ---- input
  down(mx: number, my: number): void {
    if (!this.ctx.golf()) return;
    const t = this.ctx.tileAt(mx, my);
    if (this.hand) {
      // T231: a run starts here and is laid when the button comes up (up)
      if (DECOR_BY_KEY.get(this.hand)?.run) { this.runFrom = { x: snapRun(t.x), y: snapRun(t.y) }; this.move(mx, my); this.ctx.emit(); return; }
      this.move(mx, my); this.place(); return;
    }
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
    if (this.hand) {
      const d = DECOR_BY_KEY.get(this.hand)!; this.ghosts = [];
      if (d.run) { this.runGhost(d, t); return; }
      if (d.pond === 'edge') { this.edgeGhost(d, t); return; }
      if (d.pond === 'make') { this.pondGhost(d, t); return; }
      const item = this.pictureOf(d, this.view); this.ghost = item === undefined ? null : this.ghostOf(d, item, snap(t.x), snap(t.y), this.ctx.scaleOf(item, d.scale), null); return;
    }
    this.ghost = null; this.ghosts = [];
    const p = this.ctx.propAt(mx, my); this.ctx.hover(p?.decor ? p : null);
  }
  up(): void {
    if (this.runFrom) { this.placeRun(); return; }
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
    if (this.runFrom) { this.runFrom = null; this.ghosts = []; this.ctx.emit(); return true; } // T231: a run being dragged is dropped
    if (this.hand) { this.pick(null); return true; }
    if (this.selection()) { this.ctx.select(null); this.ctx.emit(); return true; }
    return false;
  }

  // ---- the actions
  /** buys and places the item in hand on the ghost (or says why not) */
  place(): void {
    const g = this.ghost, d = this.hand ? DECOR_BY_KEY.get(this.hand) : undefined; if (!g || !d) return;
    if (g.why) { this.ctx.toast(g.why, 'warn'); return; }
    if (d.pond === 'edge') { this.placeEdge(d, g); return; }
    if (d.pond === 'make') { this.placePond(d, g); return; }
    this.ctx.step(`Place ${d.name.toLowerCase()}`, () => { const p = this.ctx.addProp(g.item, g.x, g.y, g.scale); p.decor = d.key; this.ctx.spend(d.price); return d.price; });
    this.changed(); this.ctx.toast(`${d.name} placed (-$${d.price.toLocaleString()})`, 'good');
  }
  /** turns the item in hand to its next view, or the selected prop where it stands (when its turned footprint fits) */
  turn(): void {
    if (this.hand) {
      const d = DECOR_BY_KEY.get(this.hand)!; this.view = (this.view + 1) % this.views(d);
      if (d.run || d.pond) { this.ctx.toast(d.run ? `${d.name}: drag it along the map; it follows your drag` : `${d.name}: round, the same from every side`, 'info'); this.ctx.emit(); return; }
      if (!this.turns(d)) this.ctx.toast(`${d.name}: one picture, the same from every side`, 'info');
      if (this.ghost) { const item = this.pictureOf(d, this.view)!; this.ghost = this.ghostOf(d, item, this.ghost.x, this.ghost.y, this.ctx.scaleOf(item, d.scale), null); }
      this.ctx.emit(); return;
    }
    const s = this.selection(); if (!s) return;
    if (!this.turns(s.d)) { this.ctx.toast(`${s.d.name}: one picture, the same from every side`, 'info'); return; }
    // T231: a variant item steps to its next picture where it stands
    const vs = s.d.variants, cur = this.ctx.idOf(s.p), next = vs ? vs[(vs.indexOf(cur) + 1) % vs.length]! : turned(cur, 1).id;
    const item = this.ctx.item(next); if (item === undefined) return;
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
    const key = p.decor!, frame = p.frame; this.ctx.removeProp(p);
    const q = this.ctx.addProp(item, x, y, p.scale); q.decor = key; if (frame) q.frame = frame; return q; // T229: a frame tree keeps its hole
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
    let why = decorSpotWhy(box, spot, standsIn(d, this.where), d.water === 'in');
    if (!why && !ignore && d.price > this.ctx.money()) why = `Not enough money: it costs $${d.price.toLocaleString()}`;
    return { item, x, y, scale, box, why, label: why || (ignore ? `Move ${d.name.toLowerCase()} here` : `${d.name} · $${d.price.toLocaleString()}`) };
  }

  // ---- T231: runs (the hedge)
  /** the pieces of a run from a to b: along the map's x or y axis (whichever the drag runs more along), end to end from a, as many as reach b
   *  (at least one), each at the item's size */
  runPieces(d: DecorItem, a: Pt, b: Pt): { item: number; x: number; y: number; scale: number }[] {
    const k = d.run!, dx = b.x - a.x, dy = b.y - a.y, alongX = Math.abs(dx) >= Math.abs(dy), item = this.ctx.item(alongX ? k.x : k.y);
    if (item === undefined) return [];
    const scale = this.ctx.scaleOf(item, d.scale), step = k.len * scale, sg = (alongX ? dx : dy) < 0 ? -1 : 1, n = Math.max(1, Math.round(Math.abs(alongX ? dx : dy) / step));
    return Array.from({ length: n }, (_, i) => { const o = sg * (i + 0.5) * step; return { item, x: alongX ? a.x + o : a.x, y: alongX ? a.y : a.y + o, scale }; });
  }
  private runGhost(d: DecorItem, t: Pt): void {
    const from = this.runFrom ?? { x: snapRun(t.x), y: snapRun(t.y) }, to = this.runFrom ? t : from;
    const gs = this.runPieces(d, from, to).map(p => this.ghostOf(d, p.item, p.x, p.y, p.scale, null));
    if (!gs.length) { this.ghost = null; return; }
    const n = gs.length, cost = n * d.price, bad = gs.find(g => g.why && !g.why.startsWith('Not enough money'))?.why ?? (cost > this.ctx.money() ? `Not enough money: ${n} pieces cost $${cost.toLocaleString()}` : '');
    const label = bad || (this.runFrom ? `${d.name}: ${n} piece${n > 1 ? 's' : ''}, ${n * 4} m · $${cost.toLocaleString()} (let go to lay it)` : `${d.name} · $${d.price.toLocaleString()} a piece: press and drag along the map`);
    this.ghost = { ...gs[0]!, why: bad, label }; this.ghosts = gs.slice(1).map(g => ({ ...g, why: g.why && !g.why.startsWith('Not enough money') ? g.why : bad }));
  }
  /** lays the run being dragged (one undo step), or says why not */
  private placeRun(): void {
    const g = this.ghost, d = this.hand ? DECOR_BY_KEY.get(this.hand) : undefined, all = g ? [g, ...this.ghosts] : [];
    this.runFrom = null; this.ghosts = [];
    if (!g || !d) { this.ctx.emit(); return; }
    if (g.why) { this.ctx.toast(g.why, 'warn'); this.ctx.emit(); return; }
    const cost = all.length * d.price;
    this.ctx.step(`Lay ${d.name.toLowerCase()}`, () => { for (const q of all) { const p = this.ctx.addProp(q.item, q.x, q.y, q.scale); p.decor = d.key; } this.ctx.spend(cost); return cost; });
    this.changed(); this.ctx.toast(`${d.name}: ${all.length} piece${all.length > 1 ? 's' : ''} laid (-$${cost.toLocaleString()})`, 'good');
  }

  // ---- T231: ponds
  /** the stones and lily pads a pond's edge lays, as ghosts */
  private pieceGhosts(ps: readonly PondPiece[]): DecorGhost[] {
    const out: DecorGhost[] = [];
    for (const q of ps) { const item = this.ctx.item(q.id); if (item === undefined) continue; out.push({ item, x: q.x, y: q.y, scale: q.s, box: this.ctx.footprint(item, q.x, q.y, q.s), why: '', label: '' }); }
    return out;
  }
  /** the Stone pond edge at the cursor: the pond under it with its stones (to lay them), or its natural edge back (it has them) */
  private edgeGhost(d: DecorItem, t: Pt): void {
    const item = this.pictureOf(d, 0)!, pond = this.ctx.pondAt?.(t.x, t.y) ?? null, box: Box = [t.x - 0.25, t.y - 0.25, t.x + 0.25, t.y + 0.25];
    const base = { item, x: t.x, y: t.y, scale: 1, box };
    if (!pond) { this.ghost = { ...base, why: 'Point at a pond: the course\'s water or a painted pond (the open lake keeps its shore)', label: '', noPic: true }; this.ghost.label = this.ghost.why; return; }
    const pieces = shorePieces(pond), n = pieces.length;
    if (!n) { this.ghost = { ...base, why: 'Too small for a stone edge', label: 'Too small for a stone edge', noPic: true }; return; }
    if (pondHasStones(this.ctx.pondMarks?.() ?? [], pond)) {
      const back = Math.round(n * d.price / 2);
      this.ghost = { ...base, why: '', label: `Natural edge: take its ${n} stones and the lily pads away (+$${back.toLocaleString()})`, noPic: true }; return;
    }
    const cost = n * d.price, why = cost > this.ctx.money() ? `Not enough money: ${n} stones cost $${cost.toLocaleString()}` : '';
    this.ghosts = this.pieceGhosts(pieces);
    this.ghost = { ...base, why, label: why || `Stones round this pond: ${n} stones · $${cost.toLocaleString()}, and lily pads`, noPic: true };
  }
  private placeEdge(d: DecorItem, g: DecorGhost): void {
    const pond = this.ctx.pondAt?.(g.x, g.y) ?? null; if (!pond || !this.ctx.setPondMarks) return;
    const marks = this.ctx.pondMarks?.() ?? [], has = pondHasStones(marks, pond), n = shorePieces(pond).length;
    const spent = has ? -Math.round(n * d.price / 2) : n * d.price;
    this.ctx.step(has ? 'Natural pond edge' : 'Stone pond edge', () => { this.ctx.setPondMarks!(setPondEdge(marks, pond, !has, g.x, g.y)); this.ctx.spend(spent); return spent; });
    this.ghosts = []; this.changed();
    this.ctx.toast(has ? `The pond has its natural edge again (+$${(-spent).toLocaleString()})` : `Stones round the pond: ${n} stones (-$${spent.toLocaleString()})`, 'good');
  }
  /** the Fountain pond at the cursor: its round footprint (the land's checks), its stones and the jet in the middle */
  private pondGhost(d: DecorItem, t: Pt): void {
    const x = snapRun(t.x), y = snapRun(t.y), jet = this.ctx.item(KIT_JET)!, scale = this.ctx.scaleOf(jet);
    const g = this.ghostOf(d, jet, x, y, scale, null), box: Box = [x - POND_R, y - POND_R, x + POND_R, y + POND_R], sc = this.ctx.scene();
    const spot: DecorSpot = { ...this.ctx.spot, range: (px, py) => (sc && sc.patches.some(pa => (pa.surf === 'concrete' || pa.surf === 'asphaltDark' || pa.surf === 'tee') && inPoly(pa.pts, px, py)) ? 'mats' : ''), overlaps: b => { for (const p of this.ctx.propsIn(b)) if (b[0] < p.x1 - 0.05 && b[2] > p.x0 + 0.05 && b[1] < p.y1 - 0.05 && b[3] > p.y0 + 0.05) return this.ctx.propName(p); return ''; } };
    let why = decorSpotWhy(box, spot, standsIn(d, this.where));
    if (!why && d.price > this.ctx.money()) why = `Not enough money: it costs $${d.price.toLocaleString()}`;
    const disc = pondOfDisc(x, y);
    this.ghosts = disc ? this.pieceGhosts(shorePieces(disc)) : [];
    this.ghost = { ...g, box, why, label: why || `${d.name} · $${d.price.toLocaleString()}` };
  }
  private placePond(d: DecorItem, g: DecorGhost): void {
    const x = g.x, y = g.y, where = standsIn(d, this.where), jet = DECOR_BY_KEY.get('kit-fountain');
    if (!this.ctx.digPond || !this.ctx.setPondMarks || !jet) return;
    let ok = false;
    this.ctx.step(`Place ${d.name.toLowerCase()}`, () => {
      ok = this.ctx.digPond!(x, y, POND_R, where); if (!ok) return 0;
      this.ctx.setPondMarks!([...(this.ctx.pondMarks?.() ?? []), x, y]);
      const p = this.ctx.addProp(g.item, x, y, g.scale); p.decor = jet.key;
      this.ctx.spend(d.price); return d.price;
    });
    this.ghosts = []; this.changed();
    this.ctx.toast(ok ? `${d.name} placed (-$${d.price.toLocaleString()})` : `${d.name}: the ground could not be dug here`, ok ? 'good' : 'warn');
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

/** T231: the jet the Fountain pond stands in its middle */
const KIT_JET = KIT_FOUNTAIN[0];
/** T231: a run's start and a Fountain pond's middle snap to the half tile (the course grid's cell lines) */
const snapRun = (v: number) => Math.round(v * 2) / 2;
/** T231: the round pond the Fountain pond digs at (x, y), as a pond (its stones' preview) */
function pondOfDisc(x: number, y: number): Pond | null {
  const s = new Set(discCells(x, y, POND_R).map(([cx, cy]) => cy * 65536 + cx));
  return pondAt(x, y, (cx, cy) => s.has(cy * 65536 + cx));
}
