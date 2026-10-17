import { CHUNK_H, CHUNK_W, DISTRICT_Z, HH, HW, MAP, MID_BELOW, MID_H, MID_W, PLANNER_Z, PLAN_H, PLAN_W, SPR_H, SPR_W, ZOOM_MAX, ZOOM_MIN, clamp, levelFor, midLevelFor, planLevelFor, tileOf, worldX, worldY } from './iso';
import { ATLAS_PAGES, LIBRARY } from './library';
import { CLASS, CLASSES, Grid, JUNCTIONS, RoadNetwork, SK, add, mul, perp, sub, unionBox, vlen, type AutoProp, type BBox, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type Pt, type PortalRec, type RoadClass, type SegKind } from './network';
import { NetEditor, netToOps } from './netops';
import { STRUCT_COST, STRUCT_MAX, highwayRoute, longestRun, splitByTerrain, structureLengths } from './structures';
import { GLRenderer, POINT_STRIDE, SHADOW_STRIDE, SPRITE_STRIDE } from './gl';
import { GroundCache } from './ground-cache';
import { SpriteTiles, spriteRect, type Drawable } from './sprites';
import { readSave, writeSave, clearSave, SAVE_VERSION, type SaveV4 } from './save';
import { CAR_COLOURS } from './traffic';
import { SimClient } from './sim/client';
import { TC, classAt, generateTerrain, makeNoise, type Noise, type Terrain } from './terrain';
import { slopeField } from './terrain-paint';
import { FOREST_CELL, forestCell } from './forest';
import type { BendMode, LibItem, LineStyle, Prop, Tool } from './types';
import { LK, LaneGraph, laneAt } from './sim/lanes';
import { phaseState } from './sim/signals';

const DAY_SECONDS = 20;
/** a fresh random map seed (Math.random is fine here: the generator itself is seeded) */
const newSeed = () => (Math.random() * 0x7fffffff) | 0 || 1;

interface Build { legs: Leg[]; cls: RoadClass; t0: number; dur: number; total: number; cum: number[] }
interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }
export interface Toast { id: number; text: string; t: number; kind: 'info' | 'warn' | 'good' }
export interface Camera { X: number; Y: number; z: number }
const AUTO_TREES = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];
const autoKey = (a: AutoProp) => `${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`;
const BUILDING_KINDS: Record<string, number> = { house: 0, shop: 1, venue: 1, arcade: 1, landmark: 4, barn: 3 };

export class Game {
  gl: GLRenderer; ov: CanvasRenderingContext2D;
  dpr = 1; cw = 1; ch = 1; cssW = 1; cssH = 1;
  cam: Camera = { X: worldX(MAP / 2, MAP / 2), Y: worldY(MAP / 2, MAP / 2), z: 0.16 };
  /** the map seed (saved) and the valley generated from it */
  seed = 1; terrain!: Terrain;
  net = new RoadNetwork(); edit = new NetEditor(this.net); lanes = new LaneGraph();
  props = new Set<Prop>(); nextUid = 1;
  private propGrid = new Grid<Prop>(8); private lampProps = new Set<Prop>(); private autoByKey = new Map<string, Prop>();
  sprites = new SpriteTiles();
  /** forest: slope field and clearing noise of the terrain; trees planted per FOREST_CELL cell (key cj * 32 + ci), drawn as sprites only, never in props */
  private slope: Float32Array = new Float32Array(0); private clearing: Noise = makeNoise(0); private forest = new Map<number, Prop[]>(); private forestItem = new Map<string, number>();
  /** tunnel mouths of the network: key of the last synced set, and the points themselves */
  private portalKey = ''; private portalPts: PortalRec[] = [];
  ground: GroundCache;
  /** the atlas pages (mip 1) as images, for the 2D overlay and picking */
  pageImages: HTMLImageElement[] = []; private pageAlpha: { w: number; h: number; data: Uint8ClampedArray }[] = [];
  ready = false; loadProgress = 0;
  // tools
  tool: Tool = 'road'; roadClass: ClassId = 'street'; bendMode: BendMode = 90; lineStyle: LineStyle = 0; junctionType: NodeType = 'signal';
  selected: Prop | null = null; showGrid = false; showLanes = false;
  hover: Pt | null = null; hoverProp: Prop | null = null; hoverNode: Node | null = null; hoverPiece: PieceSel | null = null;
  route: Pt[] = [];
  // economy
  money = 80000; day = 1; dayTimer = 0; population = 0; lastIncome = 0;
  // fx
  builds: Build[] = []; particles: Particle[] = [];
  toasts: Toast[] = []; toastId = 1;
  traffic: SimClient | null = null;
  /** car light points, reused each frame (grown to 7 points per sim slot) */
  private lightBuf = new Float32Array(0);
  // perf
  perf = { fps: 0, frameMs: 0, cpuMs: 0, drawMs: 0, instances: 0, draws: 0, chunksPending: 0, uploadKB: 0, frames: 0, tier: 'street' as 'street' | 'district' | 'planner', forest: 0, simActive: 0, simTickMs: 0, simMaxTickMs: 0 };
  private frameTimes: number[] = [];
  // input
  private dragging: null | { kind: 'pan' | 'bulldoze'; sx: number; sy: number; camX: number; camY: number; moved: boolean } = null;
  keys = new Set<string>();
  private listeners = new Set<() => void>();
  private saveTimer = 0; private blocksTimer = 0;
  private raf = 0; private last = 0;
  private mask: OffscreenCanvas | null = null;

  constructor(public canvas: HTMLCanvasElement, public overlay: HTMLCanvasElement) {
    this.gl = new GLRenderer(canvas);
    this.ov = overlay.getContext('2d')!;
    this.net.paintData = false;
    this.ground = new GroundCache(this.gl);
  }
  get cls() { return CLASS[this.roadClass]; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { for (const l of this.listeners) l(); }
  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ id: this.toastId++, text, t: performance.now(), kind });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  async init(opts: { bench?: number } = {}) {
    const tick = (p: number) => { this.loadProgress = p; this.emit(); };
    this.resize();
    const atlas = this.gl.loadAtlas(this.dpr >= 1.5);
    this.pageImages = await Promise.all(ATLAS_PAGES.map(row => new Promise<HTMLImageElement>(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(im); im.src = row[1]; })));
    this.pageAlpha = this.pageImages.map(im => { const w = Math.max(1, im.naturalWidth >> 1), h = Math.max(1, im.naturalHeight >> 1), c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(im, 0, 0, w, h); return { w, h, data: g.getImageData(0, 0, w, h).data }; });
    tick(0.3);
    await atlas; tick(0.5); if (this.dead) return;
    const save = opts.bench ? null : await readSave(); if (this.dead) return;
    if (opts.bench) { this.genTerrain(1); const { buildBenchmark } = await import('./bench'); buildBenchmark(this, opts.bench); }
    else if (!save || !this.load(save)) { this.genTerrain(newSeed()); this.seedTown(); }
    tick(0.7);
    const tl = performance.now();
    this.ground.init(this.terrain);
    this.afterLoad();
    if (opts.bench) console.log('[bench] after load', Math.round(performance.now() - tl), 'ms');
    await new Promise<void>(res => { const wait = () => (this.ground.ready || this.dead ? res() : setTimeout(wait, 30)); wait(); });
    if (this.dead) return;
    this.ready = true; tick(1);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  /** generate the valley for a seed (about 0.3–0.6 s) */
  private genTerrain(seed: number) {
    this.seed = seed; this.terrain = generateTerrain(seed);
    for (const ps of this.forest.values()) for (const p of ps) this.sprites.remove(p);
    this.forest.clear(); this.perf.forest = 0; this.slope = slopeField(this.terrain.height); this.clearing = makeNoise(this.terrain.seed ^ 0x5f0e);
  }
  dead = false;
  destroy() { this.dead = true; cancelAnimationFrame(this.raf); clearTimeout(this.saveTimer); clearTimeout(this.blocksTimer); this.ground.terminate(); this.traffic?.terminate(); }

  // ---------- geometry helpers ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.cw = Math.max(1, Math.round(r.width * this.dpr)); this.ch = Math.max(1, Math.round(r.height * this.dpr));
    for (const c of [this.canvas, this.overlay]) if (c.width !== this.cw || c.height !== this.ch) { c.width = this.cw; c.height = this.ch; }
  }
  tileAt(mx: number, my: number) {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    return tileOf(X, Y);
  }
  screen(x: number, y: number) {
    const ze = this.cam.z * this.dpr;
    return { x: (worldX(x, y) - this.cam.X) * ze + this.cw / 2, y: (worldY(x, y) - this.cam.Y) * ze + this.ch / 2 };
  }
  setIso(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr;
    ctx.setTransform(HW * ze, HH * ze, -HW * ze, HH * ze, this.cw / 2 - this.cam.X * ze, this.ch / 2 - this.cam.Y * ze);
  }
  footprint(it: LibItem, x: number, y: number, flip: boolean, k: number) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of it.boxes) {
      const hx = (flip ? b.hy : b.hx) * k / 2, hy = (flip ? b.hx : b.hy) * k / 2, dx = (flip ? b.dy : b.dx) * k / 2, dy = (flip ? b.dx : b.dy) * k / 2;
      x0 = Math.min(x0, x + dx - hx); x1 = Math.max(x1, x + dx + hx); y0 = Math.min(y0, y + dy - hy); y1 = Math.max(y1, y + dy + hy);
    }
    return { x0, y0, x1, y1 };
  }
  canPlace(it: LibItem, x: number, y: number, flip: boolean, k: number, ignore?: Prop): string {
    const f = this.footprint(it, x, y, flip, k);
    if (f.x0 < 1 || f.y0 < 1 || f.x1 > MAP - 1 || f.y1 > MAP - 1) return 'Outside the town limits';
    for (let y = Math.floor(f.y0); y < Math.ceil(f.y1); y++) for (let x = Math.floor(f.x0); x < Math.ceil(f.x1); x++) {
      const c = this.terrain.cls[y * MAP + x]; if (c === TC.HILL || c === TC.WATER || c === TC.CREEK || c === TC.BANK) return 'Not on hills or water';
    }
    const occ = this.net.rectOcc(f.x0 + 0.08, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08);
    if (it.kind === 'car') { if (occ === 3) return 'Not on the median'; }
    else if (it.big) { if (occ) return 'Keep buildings off the road and sidewalk'; }
    else if (occ === 2) return 'Not on the asphalt';
    for (const p of this.propGrid.query([f.x0, f.y0, f.x1, f.y1])) {
      if (p === ignore) continue;
      const pit = LIBRARY[p.item];
      if (!(it.big || pit.big)) continue;
      if (f.x0 < p.x1 - 0.05 && f.x1 > p.x0 + 0.05 && f.y0 < p.y1 - 0.05 && f.y1 > p.y0 + 0.05) return 'Overlaps ' + pit.name;
    }
    return '';
  }
  addProp(item: number, x: number, y: number, flip: boolean, scale: number): Prop {
    const f = this.footprint(LIBRARY[item], x, y, flip, scale);
    const p: Prop = { uid: this.nextUid++, item, x, y, flip, scale, ...f };
    this.props.add(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.add(p);
    if (LIBRARY[item].kind === 'lamp') this.lampProps.add(p);
    if (LIBRARY[item].big) this.scheduleBlocks();
    return p;
  }
  removeProp(p: Prop) {
    if (!this.props.delete(p)) return;
    this.propGrid.remove(p); this.sprites.remove(p); this.lampProps.delete(p);
    if (p.auto) this.autoByKey.delete(p.auto);
    if (this.selected === p) this.selected = null;
    if (LIBRARY[p.item].big) this.scheduleBlocks();
  }
  /** after moving, flipping or scaling a prop */
  /** plant the forest cells near the view (world px rectangle): nearest to the view centre first, at most two cells per frame */
  private plantForest(X0: number, Y0: number, X1: number, Y1: number) {
    const a = tileOf(X0, Y0), b = tileOf(X1, Y0), c = tileOf(X0, Y1), d = tileOf(X1, Y1), g = 8, N = MAP / FOREST_CELL;
    const ci0 = clamp(Math.floor((Math.min(a.x, b.x, c.x, d.x) - g) / FOREST_CELL), 0, N - 1), ci1 = clamp(Math.floor((Math.max(a.x, b.x, c.x, d.x) + g) / FOREST_CELL), 0, N - 1);
    const cj0 = clamp(Math.floor((Math.min(a.y, b.y, c.y, d.y) - g) / FOREST_CELL), 0, N - 1), cj1 = clamp(Math.floor((Math.max(a.y, b.y, c.y, d.y) + g) / FOREST_CELL), 0, N - 1);
    let todo: number[] | null = null;
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const key = cj * N + ci; if (this.forest.has(key)) continue;
      if (!todo) todo = []; todo.push(key);
    }
    if (!todo) return;
    const m = tileOf((X0 + X1) / 2, (Y0 + Y1) / 2), mx = clamp(Math.floor(m.x / FOREST_CELL), 0, N - 1), my = clamp(Math.floor(m.y / FOREST_CELL), 0, N - 1);
    const dd = (k: number) => ((k % N) - mx) ** 2 + (Math.floor(k / N) - my) ** 2;
    todo.sort((p, q) => dd(p) - dd(q));
    for (let k = 0; k < Math.min(2, todo.length); k++) this.plantCell(todo[k], todo[k] % N, Math.floor(todo[k] / N));
  }
  /** plant one forest cell as sprites (not props: no selection, bulldozing or saving) */
  private plantCell(key: number, ci: number, cj: number) {
    const trees = forestCell(this.terrain.seed, this.terrain.cls, this.terrain.height, this.slope, this.clearing, ci, cj), out: Prop[] = [];
    for (const tr of trees) {
      if (this.inPortal(tr.x, tr.y)) continue;
      let item = this.forestItem.get(tr.id);
      if (item === undefined) { item = LIBRARY.findIndex(i => i.id === tr.id); this.forestItem.set(tr.id, item); }
      if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], ax = tr.x - b.dx * tr.scale / 2, ay = tr.y - b.dy * tr.scale / 2;
      const p: Prop = { uid: this.nextUid++, item, x: ax, y: ay, flip: tr.flip, scale: tr.scale, ...this.footprint(it, ax, ay, tr.flip, tr.scale) };
      this.sprites.add(p); out.push(p);
    }
    this.forest.set(key, out); this.perf.forest += out.length;
  }
  /** no trees in front of a tunnel mouth: a short strip out of the portal, as wide as its road plus margin */
  private inPortal(x: number, y: number): boolean {
    for (const p of this.portalPts) {
      const dx = x - p.x, dy = y - p.y, t = dx * p.dir.x + dy * p.dir.y, lat = Math.abs(-dx * p.dir.y + dy * p.dir.x);
      if (t > -6 && t < 8 && lat < p.hw + 3) return true;
    }
    return false;
  }
  /** after a network rebuild: the forest cells near a tunnel mouth (old or new) re-plant without the trees in the way */
  private syncPortals() {
    const ps = this.net.portals(), key = ps.map(p => p.x.toFixed(2) + ',' + p.y.toFixed(2)).sort().join(';');
    if (key === this.portalKey) return;
    const pts = [...this.portalPts, ...ps], N = MAP / FOREST_CELL, g = 14;
    for (const [k, trees] of this.forest) {
      const x0 = (k % N) * FOREST_CELL - g, y0 = Math.floor(k / N) * FOREST_CELL - g, x1 = x0 + FOREST_CELL + 2 * g, y1 = y0 + FOREST_CELL + 2 * g;
      if (!pts.some(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) continue;
      for (const p of trees) this.sprites.remove(p);
      this.perf.forest -= trees.length; this.forest.delete(k);
    }
    this.portalKey = key; this.portalPts = ps;
  }
  private propChanged(p: Prop) { const it = LIBRARY[p.item]; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, p.scale)); this.propGrid.remove(p); this.propGrid.add(p, [p.x0, p.y0, p.x1, p.y1]); this.sprites.update(p); if (it.big) this.scheduleBlocks(); }
  /** street lamps light the road: their reflection pools are part of the ground picture */
  syncLamps() {
    const pts = [...this.lampProps].map(p => ({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }));
    const changed = this.net.setLamps(pts);
    this.ground.lamps(new Float32Array(pts.flatMap(p => [p.x, p.y])));
    for (const b of changed) this.ground.invalidate(b, false, 0, 'gm');
  }
  /** median trees, roundabout trees and traffic lights follow the road network (only what the last rebuild changed) */
  private syncAutoProps(added: AutoProp[], removed: AutoProp[]) {
    for (const a of removed) { const p = this.autoByKey.get(autoKey(a)); if (p) this.removeProp(p); }
    for (const a of added) {
      const k = autoKey(a); if (this.autoByKey.has(k)) continue;
      const id = a.kind === 'tree' ? AUTO_TREES[a.i % AUTO_TREES.length] : a.kind === 'rbtree' ? 'world:tree_oak_0' : 'town:traffic_light';
      const item = LIBRARY.findIndex(i => i.id === id); if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], scale = a.kind === 'tree' ? 0.85 : a.kind === 'rbtree' ? 1.2 : 1;
      const p = this.addProp(item, a.x - b.dx * scale / 2, a.y - b.dy * scale / 2, false, scale); p.auto = k; this.autoByKey.set(k, p);
    }
  }
  /** building footprints for the planner map (debounced: many edits, one message) */
  private scheduleBlocks() {
    if (!this.ready) return;
    clearTimeout(this.blocksTimer); this.blocksTimer = window.setTimeout(() => this.sendBlocks(true), 400);
  }
  private sendBlocks(invalidate: boolean) {
    const out: number[] = [];
    for (const p of this.props) { const it = LIBRARY[p.item]; if (!it.big || it.kind === 'car') continue; out.push(p.x0, p.y0, p.x1, p.y1, BUILDING_KINDS[it.kind] ?? 2); }
    this.ground.blocks(new Float32Array(out));
    if (invalidate) this.ground.invalidate([0, 0, MAP, MAP], false, 0, 'p');
  }

  // ---------- network edits ----------
  /** send the edits to the workers, refresh what depends on the network and mark the changed ground stale */
  private commitNetwork(keepPrev = false, until = 0) {
    const ops = this.edit.commit(); this.lanes.update(this.net);
    this.ground.netOps(ops); this.traffic?.netOps(ops);
    if (this.net.lastDirty) { const d = this.net.lastDirty; this.ground.invalidate([d[0] - 2, d[1] - 2, d[2] + 2, d[3] + 2], keepPrev, until); }
    this.syncAutoProps(this.net.autoAdded, this.net.autoRemoved); this.syncPortals();
    this.syncLamps(); this.scheduleSave(); this.emit();
  }
  private afterLoad() {
    const ops = this.edit.commit(true); this.lanes.update(this.net);
    this.ground.netOps(ops); this.traffic?.netOps(ops); this.syncPortals();
    this.syncAutoProps(this.net.autoProps, []);
    this.syncLamps(); this.sendBlocks(false);
    this.ground.invalidateAll();
  }

  // ---------- road routing ----------
  setTool(t: Tool) { if (this.tool !== t) { this.cancelRoute(); this.selected = null; } this.tool = t; this.emit(); }
  private snapNode(p: Pt): Pt { return { x: clamp(Math.round(p.x), 2, MAP - 2), y: clamp(Math.round(p.y), 2, MAP - 2) }; }
  /** legs from `from` to `p`: a right-angle bend, or (45° mode) a diagonal followed by a straight */
  private legsTo(from: Pt, p: Pt, straight = false): Leg[] {
    const dx = p.x - from.x, dy = p.y - from.y, ax = Math.abs(dx), ay = Math.abs(dy);
    if (!ax && !ay) return [];
    if (straight) {
      const k = Math.round((ax + ay) / 2);
      if (ax >= 2.4 * ay || ay >= 2.4 * ax) return [{ a: from, b: ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y } }];
      return [{ a: from, b: { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k } }];
    }
    if (!ax || !ay) return [{ a: from, b: p }];
    if (this.bendMode === 45) {
      const k = Math.min(ax, ay), corner = { x: from.x + Math.sign(dx) * k, y: from.y + Math.sign(dy) * k };
      if (corner.x === p.x && corner.y === p.y) return [{ a: from, b: p }];
      return [{ a: from, b: corner }, { a: corner, b: p }];
    }
    const corner = ax >= ay ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
    return [{ a: from, b: corner }, { a: corner, b: p }];
  }
  previewLegs(): Leg[] {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) legs.push({ a: this.route[i - 1], b: this.route[i] });
    if (this.route.length && this.hover) legs.push(...this.legsTo(this.route[this.route.length - 1], this.snapNode(this.hover), this.keys.has('Shift')));
    return legs;
  }
  routeCost() { return this.structured(this.previewLegs()).cost; }
  private roadClick(mx: number, my: number) {
    const p = this.snapNode(this.tileAt(mx, my));
    if (!this.route.length) { this.route.push(p); this.emit(); return; }
    const last = this.route[this.route.length - 1];
    for (const l of this.legsTo(last, p, this.keys.has('Shift'))) this.route.push(l.b);
    this.emit();
  }
  undoRoutePoint() { this.route.pop(); this.emit(); }
  cancelRoute() { this.route = []; this.emit(); }
  /** strip test: does the prop footprint touch a leg's corridor of half width hw? */
  private propInLegs(p: Prop, legs: Leg[], hw: number) {
    const pts = [{ x: p.x0, y: p.y0 }, { x: p.x1, y: p.y0 }, { x: p.x0, y: p.y1 }, { x: p.x1, y: p.y1 }, { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 }];
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d), u = mul(d, 1 / L), n = perp(u);
      for (const q of pts) { const w = sub(q, l.a), t = u.x * w.x + u.y * w.y, s = Math.abs(n.x * w.x + n.y * w.y); if (t > -hw && t < L + hw && s < hw) return true; }
    }
    return false;
  }
  /** does a road corridor of half width hw cross a hill or the river? (creeks and banks are fine: culverts, riverside roads) */
  private blockedForRoad(legs: Leg[], hw: number): boolean {
    for (const l of legs) {
      const d = sub(l.b, l.a), L = vlen(d); if (!L) continue;
      const u = mul(d, 1 / L), n = perp(u);
      for (let s = 0; s <= L; s += 0.5) for (let o = -hw; o <= hw + 1e-6; o += 0.5) {
        const x = l.a.x + u.x * s + n.x * o, y = l.a.y + u.y * s + n.y * o, c = classAt(this.terrain, x, y);
        if (c === TC.HILL || c === TC.WATER) return true;
      }
    }
    return false;
  }
  /** the legs split into ground, bridge and tunnel pieces, with their cost (money) and an error ('' if fine) */
  private structured(legs: Leg[]) {
    const { legs: parts, kinds } = splitByTerrain(legs, this.cls.h + this.cls.walk, (x, y) => classAt(this.terrain, x, y));
    let raw = 0; for (let i = 0; i < parts.length; i++) raw += vlen(sub(parts[i].b, parts[i].a)) * this.cls.cost * STRUCT_COST[kinds[i]];
    const cost = Math.round(raw), lens = structureLengths(parts, kinds);
    let err = '';
    if (longestRun(parts, kinds, SK.BRIDGE) > STRUCT_MAX[SK.BRIDGE]) err = `Bridges can span at most ${STRUCT_MAX[SK.BRIDGE] * 2} m`;
    else if (longestRun(parts, kinds, SK.TUNNEL) > STRUCT_MAX[SK.TUNNEL]) err = `Tunnels can be at most ${STRUCT_MAX[SK.TUNNEL] * 2} m long`;
    return { parts, kinds, cost, lens, err };
  }
  private propsNearLegs(legs: Leg[], hw: number) {
    let bb: BBox | null = null; for (const l of legs) bb = unionBox(bb, [Math.min(l.a.x, l.b.x) - hw, Math.min(l.a.y, l.b.y) - hw, Math.max(l.a.x, l.b.x) + hw, Math.max(l.a.y, l.b.y) + hw]);
    return bb ? [...this.propGrid.query(bb)].filter(p => this.propInLegs(p, legs, hw)) : [];
  }
  finishRoute() {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) if (this.route[i].x !== this.route[i - 1].x || this.route[i].y !== this.route[i - 1].y) legs.push({ a: this.route[i - 1], b: this.route[i] });
    if (!legs.length) { this.cancelRoute(); return; }
    const cls = this.cls, st = this.structured(legs), { parts, kinds, cost, lens } = st;
    if (cost > this.money) { this.toast(`Not enough money: the route costs $${cost.toLocaleString()}`, 'warn'); return; }
    if (st.err) { this.toast(st.err, 'warn'); return; }
    const total = this.net.legsLength(parts);
    const hw = cls.h + cls.walk, near = this.propsNearLegs(legs, hw);
    const blocking = near.filter(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car');
    if (blocking.length) { this.toast(`${LIBRARY[blocking[0].item].name} is in the way — bulldoze it first`, 'warn'); return; }
    const cleared = near.filter(p => !p.auto && !LIBRARY[p.item].big);
    for (const p of cleared) this.removeProp(p);
    const now = performance.now(), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of parts) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    this.edit.addLegs(parts, cls, this.lineStyle, kinds);
    this.commitNetwork(true, now + dur + 150);
    this.builds.push({ legs: parts, cls, t0: now, dur, total, cum });
    this.money -= cost;
    this.route = [];
    const structs = [lens[SK.BRIDGE] ? `${Math.round(lens[SK.BRIDGE] * 2)} m bridge` : '', lens[SK.TUNNEL] ? `${Math.round(lens[SK.TUNNEL] * 2)} m tunnel` : ''].filter(Boolean);
    this.toast(`Built ${Math.round(total * 2)} m of ${cls.name.toLowerCase()}${structs.length ? ` (${structs.join(', ')})` : ''} for $${cost.toLocaleString()}${cleared.length ? ` (cleared ${cleared.length} item${cleared.length > 1 ? 's' : ''})` : ''}`, 'good');
  }
  private junctionClick(mx: number, my: number) {
    const t = this.tileAt(mx, my), spec = JUNCTIONS.find(j => j.id === this.junctionType)!;
    const n = this.net.nearestNode(t, spec.minDeg, 5);
    if (!n) { this.toast(spec.minDeg > 2 ? 'Click a junction where three or more roads meet' : 'Click a junction or a bend in the road', 'warn'); return; }
    if (n.type === this.junctionType) { this.toast(`That junction already has ${spec.name.toLowerCase()}`); return; }
    if (spec.cost > this.money) { this.toast(`Not enough money: ${spec.name} costs $${spec.cost.toLocaleString()}`, 'warn'); return; }
    this.money -= spec.cost;
    this.edit.setNodeType(n, this.junctionType);
    this.commitNetwork();
    this.puff(n.x, n.y, 8);
    if (this.junctionType === 'slip' && !n.arms.every(a => a.len >= 27)) this.toast('Slipways need long approaches (54 m+): short arms get plain corners', 'warn');
    else this.toast(`${spec.name} installed`, 'good');
  }
  private bulldozeAt(mx: number, my: number, first: boolean) {
    const t = this.tileAt(mx, my);
    if (first) {
      const p = this.propAt(mx, my);
      if (p && !p.auto) { const it = LIBRARY[p.item]; this.removeProp(p); this.money += Math.round(it.cost * 0.5); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name} (+$${Math.round(it.cost * 0.5).toLocaleString()})`); return; }
    }
    const piece = this.net.pieceNear(t); if (!piece) return;
    this.edit.removePiece(piece);
    this.commitNetwork();
    this.hoverPiece = this.net.pieceNear(t);
    this.puff(t.x, t.y, 10);
  }
  propAt(mx: number, my: number): Prop | null {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z, r = [0, 0, 0, 0];
    for (const p of this.sprites.at(X, Y)) {
      if (!this.props.has(p)) continue; // forest trees are not props: never picked
      spriteRect(p, r); if (X < r[0] || X > r[2] || Y < r[1] || Y > r[3]) continue;
      const it = LIBRARY[p.item], [page, u0, v0, u1, v1] = it.tex, a = this.pageAlpha[page];
      if (!a) return p;
      let u = (X - r[0]) / (r[2] - r[0]); if (p.flip) u = 1 - u;
      const v = (Y - r[1]) / (r[3] - r[1]), px = clamp(Math.floor((u0 + (u1 - u0) * u) * a.w), 0, a.w - 1), py = clamp(Math.floor((v0 + (v1 - v0) * v) * a.h), 0, a.h - 1);
      if (a.data[(py * a.w + px) * 4 + 3] > 20) return p;
    }
    return null;
  }
  deleteSelected() { if (!this.selected) return; const p = this.selected, it = LIBRARY[p.item]; this.removeProp(p); if (!p.auto) this.money += Math.round(it.cost * 0.5); if (it.kind === 'lamp') this.syncLamps(); this.scheduleSave(); this.toast(`Removed ${it.name}`); this.emit(); }
  scaleSelected(f: number) {
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item], k = clamp(p.scale * f, 0.6, 1.6);
    const err = this.canPlace(it, p.x, p.y, p.flip, k, p); if (err) { this.toast(err, 'warn'); return; }
    p.scale = k; this.propChanged(p); this.scheduleSave(); this.emit();
  }

  // ---------- input ----------
  pointerDown(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.overlay.setPointerCapture(e.pointerId);
    const pan = e.button === 1 || e.button === 2 || this.keys.has(' ');
    if (pan || this.tool === 'select') {
      if (!pan && this.tool === 'select') {
        const p = this.propAt(mx, my);
        if (p) { this.selected = p; this.emit(); return; }
        this.selected = null; this.emit();
      }
      this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false }; return;
    }
    if (e.button !== 0) return;
    switch (this.tool) {
      case 'road': this.roadClick(mx, my); break;
      case 'junction': this.junctionClick(mx, my); break;
      case 'bulldoze': this.bulldozeAt(mx, my, true); this.dragging = { kind: 'bulldoze', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
    }
  }
  pointerMove(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.hover = this.tileAt(mx, my);
    const d = this.dragging;
    if (d) {
      if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 3) d.moved = true;
      if (d.kind === 'pan') { this.cam.X = d.camX - (mx - d.sx) / this.cam.z; this.cam.Y = d.camY - (my - d.sy) / this.cam.z; this.clampCam(); }
      else if (d.kind === 'bulldoze') this.bulldozeAt(mx, my, false);
    } else if (this.tool === 'select') this.hoverProp = this.propAt(mx, my);
    if (this.tool === 'junction') this.hoverNode = this.net.nearestNode(this.hover, JUNCTIONS.find(j => j.id === this.junctionType)!.minDeg, 5);
    if (this.tool === 'bulldoze') this.hoverPiece = this.net.pieceNear(this.hover);
  }
  pointerUp() { this.dragging = null; }
  pointerLeave() { this.hover = null; this.hoverProp = null; this.hoverNode = null; this.hoverPiece = null; }
  doubleClick() { if (this.tool === 'road' && this.route.length > 1) this.finishRoute(); }
  wheel(e: WheelEvent) {
    e.preventDefault();
    const f = Math.exp(-e.deltaY * 0.0014);
    this.zoomAt(clamp(this.cam.z * f, ZOOM_MIN, ZOOM_MAX), e.offsetX, e.offsetY);
  }
  zoomAt(z: number, mx = this.cssW / 2, my = this.cssH / 2) {
    const wx = this.cam.X + (mx - this.cssW / 2) / this.cam.z, wy = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    this.cam.z = z;
    this.cam.X = wx - (mx - this.cssW / 2) / z; this.cam.Y = wy - (my - this.cssH / 2) / z; this.clampCam(); this.emit();
  }
  clampCam() { this.cam.X = clamp(this.cam.X, -MAP * HW, MAP * HW); this.cam.Y = clamp(this.cam.Y, 0, MAP * HH * 2); }
  keyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.keys.add(e.key);
    switch (e.key) {
      case 'Escape': if (this.route.length) this.cancelRoute(); else { this.selected = null; this.emit(); } break;
      case 'Enter': if (this.tool === 'road') this.finishRoute(); break;
      case 'Backspace': if (this.tool === 'road') this.undoRoutePoint(); break;
      case 'Delete': this.deleteSelected(); break;
      case 'g': case 'G': this.showGrid = !this.showGrid; this.emit(); break;
      case 'l': case 'L': this.showLanes = !this.showLanes; this.emit(); break;
      case 'q': case 'Q': this.bendMode = this.bendMode === 90 ? 45 : 90; this.emit(); break;
      case 'r': case 'R': this.setTool('road'); break;
      case 'j': case 'J': this.setTool('junction'); break;
      case 'x': case 'X': this.setTool('bulldoze'); break;
      case 'v': case 'V': this.setTool('select'); break;
      case '1': case '2': case '3': case '4': case '5': { const c = CLASSES[+e.key - 1]; if (c) { this.roadClass = c.id; this.setTool('road'); } break; }
      case '+': case '=': this.zoomAt(clamp(this.cam.z * 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case '-': case '_': this.zoomAt(clamp(this.cam.z / 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case ' ': e.preventDefault(); break;
    }
  }
  keyUp(e: KeyboardEvent) { this.keys.delete(e.key); }
  /** traffic: n cars driving the network (0 = none); the sim worker starts on first use */
  setTraffic(n: number) { if (!this.traffic) this.traffic = new SimClient(netToOps(this.net)); this.traffic.setTarget(n); this.emit(); }

  // ---------- economy / save ----------
  private linked(p: Prop) { return this.net.rectOcc(p.x0 - 3, p.y0 - 3, p.x1 + 3, p.y1 + 3) > 0; }
  private tickDay() {
    let houses = 0, venues = 0;
    for (const p of this.props) { const it = LIBRARY[p.item]; if (it.kind === 'house' && this.linked(p)) houses++; else if ((it.kind === 'venue' || it.kind === 'arcade' || it.kind === 'shop') && this.linked(p)) venues++; }
    let upkeep = 0; for (const s of this.net.segs) upkeep += vlen(sub(s.b, s.a)) * (1 + s.cls.order * 0.6);
    this.population = houses * 3 + venues;
    this.lastIncome = Math.round(houses * 120 + venues * 260 - upkeep);
    this.money += this.lastIncome; this.day++;
    this.scheduleSave(); this.emit();
  }
  scheduleSave() { if (this.benchMode) return; clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => void this.save(), 800); }
  benchMode = false;
  async save() {
    if (this.benchMode) return 0;
    const d: SaveV4 = {
      version: SAVE_VERSION, map: MAP, seed: this.seed,
      segs: [...this.net.segs].map(s => [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style, s.kind]),
      nodes: [...this.net.nodes.values()].filter(n => n.type !== 'plain').map(n => [n.x, n.y, n.type]),
      props: [...this.props].filter(p => !p.auto).map(p => [LIBRARY[p.item].id, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale]),
      money: this.money, day: this.day, cam: { ...this.cam },
    };
    try { return await writeSave(d); } catch { return 0; }
  }
  private load(d: SaveV4): boolean {
    try {
      this.genTerrain(d.seed);
      for (const [ax, ay, bx, by, cls, style, kind] of d.segs) this.edit.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], CLASS[cls as ClassId] ?? CLASS.street, style as LineStyle, [(kind ?? 0) as SegKind]);
      this.net.rebuild(true);
      for (const [x, y, type] of d.nodes) { const n = this.net.nodeAt({ x, y }); if (n) this.edit.setNodeType(n, type as NodeType); }
      const index = new Map(LIBRARY.map((it, i) => [it.id, i]));
      for (const [id, x, y, flip, scale] of d.props) { const i = index.get(id); if (i !== undefined) this.addProp(i, x, y, !!flip, scale); }
      this.money = d.money; this.day = d.day; if (d.cam) this.cam = { ...d.cam, z: clamp(d.cam.z, ZOOM_MIN, ZOOM_MAX) };
      return true;
    } catch (e) { console.error('load failed', e); return false; }
  }
  private reset() {
    this.edit.clear();
    for (const p of [...this.props]) this.removeProp(p);
    this.sprites.clear(); this.autoByKey.clear(); this.forest.clear(); this.perf.forest = 0;
    this.money = 80000; this.day = 1; this.route = []; this.selected = null; this.builds = [];
  }
  newTown() {
    this.reset(); this.genTerrain(newSeed()); this.ground.terrain(this.terrain);
    this.seedTown(); this.afterLoad(); void this.save(); this.toast(`New valley (seed ${this.seed})`); this.emit();
  }
  clearTown() { this.reset(); this.afterLoad(); void clearSave(); void this.save(); this.emit(); }

  /** A starter Maple Falls showing every road type: highway with a 45° approach, a boulevard, an avenue, a roundabout, lights with slipways, streets and a lane. */
  seedTown() {
    const { start } = this.terrain, Ox = clamp(start.x + 32 - 80, 8, MAP - 168), Oy = clamp(start.y + 32 - 80, 8, MAP - 168);
    const net = this.net, byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
    const legs = (pts: [number, number][]): Leg[] => pts.slice(1).map((p, i) => ({ a: { x: pts[i][0] + Ox, y: pts[i][1] + Oy }, b: { x: p[0] + Ox, y: p[1] + Oy } }));
    const road = (pts: [number, number][], c: RoadClass, s: LineStyle) => { const ls = legs(pts); if (!this.blockedForRoad(ls, c.h + c.walk)) this.edit.addLegs(ls, c, s); };
    road([[10, 50], [24, 36], [146, 36], [146, 64]], CLASS.road, 0);
    road([[80, 36], [80, 124]], CLASS.boulevard, 0);
    road([[36, 80], [128, 80]], CLASS.avenue, 0);
    road([[54, 80], [54, 108], [106, 108], [106, 80]], CLASS.street, 0);
    road([[54, 80], [54, 58]], CLASS.street, 1);
    road([[60, 124], [100, 124]], CLASS.street, 0);
    road([[106, 96], [122, 80]], CLASS.street, 0);
    road([[54, 94], [72, 94]], CLASS.lane, 0);
    road([[120, 108], [106, 108]], CLASS.street, 2);
    net.rebuild(true);
    const typed = (x: number, y: number, t: NodeType) => { const n = net.nodeAt({ x: x + Ox, y: y + Oy }); if (n) this.edit.setNodeType(n, t); };
    typed(80, 36, 'slip'); typed(80, 80, 'roundabout'); typed(80, 108, 'signal'); typed(106, 80, 'signal');
    net.rebuild();
    // helpers: a sprite facing +y with its front edge on frontY; flipped sprites face +x with their front edge on frontX
    const front = (id: string, cx: number, frontY: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = cx + Ox - b.dx * k / 2, y = frontY + Oy - (b.dy * k / 2 + b.hy * k / 2); if (!this.canPlace(it, x, y, false, k)) this.addProp(i, x, y, false, k); };
    const side = (id: string, frontX: number, cy: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = frontX + Ox - (b.dy * k / 2 + b.hy * k / 2), y = cy + Oy - b.dx * k / 2; if (!this.canPlace(it, x, y, true, k)) this.addProp(i, x, y, true, k); };
    const put = (id: string, x: number, y: number, k = 1, flip = false) => { const i = byId(id); if (i >= 0 && !this.canPlace(LIBRARY[i], x + Ox, y + Oy, flip, k)) this.addProp(i, x + Ox, y + Oy, flip, k); };
    front('town:postoffice', 45, 75.4); front('town:bakery', 54, 75.4); front('world:arcade', 63, 75.4);
    front('world:video_rental', 96, 75.4); front('town:grocery', 106, 75.4); front('world:diner', 115, 75.4); front('town:pharmacy', 123, 75.4);
    front('town:laundromat', 40, 118.9); front('town:fish_tackle', 128, 100);
    front('world:church', 54, 54.4); front('world:primary_school', 46, 32.2); front('ref:building-gas-canopy', 112, 32.2); side('town:firestation', 73.9, 62);
    front('world:barn', 30, 61); put('ref:landmark-windmill', 22, 72); put('world:watertower', 138, 76); put('world:gazebo', 102, 56);
    for (const [id, x] of [['world:house_1', 61], ['world:house_3', 69], ['gen:house-splitlevel', 91], ['world:house_4', 99]] as [string, number][]) front(id, x, 104.9);
    for (const [id, x] of [['gen:house-duplex', 66], ['world:house_1', 74], ['gen:house-l-ranch', 88], ['world:house_3', 96]] as [string, number][]) front(id, x, 120.9);
    for (const [id, y] of [['gen:house-ranch-long', 64], ['world:house_4', 72], ['gen:house-farmhouse-wrap', 88], ['gen:house-l-shape', 100]] as [string, number][]) side(id, 50.9, y);
    front('world:house_4', 60, 92.4); front('static:garage_timber', 67, 92.4);
    const trees = ['world:tree_oak_0', 'world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold', 'world:tree_pine_0', 'ref:tree-spruce-blue', 'world:tree_pine_1'];
    const spots: [number, number][] = [[94, 48], [100, 50], [108, 47], [114, 52], [120, 58], [96, 60], [112, 62], [118, 48], [60, 113], [68, 113], [92, 113], [100, 113], [44, 86], [46, 100], [112, 90], [118, 96], [130, 56], [134, 48], [30, 72], [36, 66], [138, 92], [132, 100], [60, 44], [66, 48], [24, 60]];
    spots.forEach(([x, y], i) => put(trees[(i * 5) % trees.length], x, y, 0.95 + ((i * 7) % 4) * 0.08));
    this.lampsAlongRoads(this.net);
    put('world:hydrant', 60, 84.2, 0.9); put('world:mailbox', 68, 76.3, 0.9); put('world:bench', 92, 84.1, 0.9); put('world:trashcan', 94, 84.1, 0.9); put('town:bus_stop', 66, 84.1, 0.95);
    put('town:stop_sign', 57.4, 104.6, 0.9); put('town:phone_booth', 101, 76.3, 0.9); put('town:picnic_table', 104, 60, 0.95); put('town:bike_rack', 60, 76.3, 0.9); put('town:utility_pole', 36, 86, 1);
    put('world:car_0', 48, 37.2); put('static:pickup_n', 104, 34.9); put('world:schoolbus', 130, 37.3); put('static:van_e', 60, 82.2); put('world:car_2', 110, 77.8);
    put('world:car_1', 82, 60); put('static:compact_n', 76, 100); put('world:car_3', 66, 106.9); put('static:compact_e', 96, 109.1, 1, true);
    put('world:scarecrow', 30, 52, 0.9); put('ref:halloween-hay-bales', 34, 56, 0.9); put('world:pumpkin_0', 59, 101.5, 0.9); put('world:pumpkin_1', 91.5, 101.6, 0.9); put('gen:inflatable-pumpkin', 73, 117.8, 0.9);
    put('world:candy_stand', 110, 58, 0.9); put('ref:halloween-pumpkin-cluster', 48, 72.5, 0.9); put('ref:halloween-sheet-ghost', 97, 101, 0.9);
    const cx = start.x + 32, cy = start.y + 32;
    this.cam.X = worldX(cx, cy); this.cam.Y = worldY(cx, cy);
    this.buildHighway();
  }
  /** the highway from its map edge entry to the starter town's node nearest the entry (the start block centre if the town has no nodes) */
  private buildHighway() {
    const t = this.terrain, h = t.highway, hw = CLASS.road.h + CLASS.road.walk;
    if (h.x < 0) return;
    let target = { x: t.start.x + t.start.size / 2, y: t.start.y + t.start.size / 2 }, best = Infinity;
    for (const n of this.net.nodes.values()) { const d = (n.x - h.x) ** 2 + (n.y - h.y) ** 2; if (d < best) { best = d; target = { x: n.x, y: n.y }; } }
    const pts = highwayRoute(h, target, hw, (x, y) => classAt(t, x, y));
    const legs0: Leg[] = []; for (let i = 1; i < pts.length; i++) legs0.push({ a: pts[i - 1], b: pts[i] });
    const { legs, kinds } = splitByTerrain(legs0, hw, (x, y) => classAt(t, x, y));
    for (const p of this.propsNearLegs(legs, hw)) if (!LIBRARY[p.item].big) this.removeProp(p);
    this.edit.addLegs(legs, CLASS.road, 0, kinds);
  }
  /** street lamps on the sidewalk's outer half along every kerbed street, both sides, staggered */
  lampsAlongRoads(net: RoadNetwork, every = 1) {
    const lampId = LIBRARY.findIndex(i => i.id === 'world:streetlamp'), lampIt = LIBRARY[lampId], lb = lampIt.boxes[0];
    let n = 0;
    for (const r of net.routes) {
      if (r.cls.walkTex !== 'slabs' || r.closed) continue;
      for (let k = 0; k + 1 < r.pts.length; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 6) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = r.cls.h + r.cls.walk * 0.62, step = (r.cls.id === 'lane' ? 12 : 8) * every;
        for (let s = 4; s < L - 3; s += step) for (const side of [1, -1]) {
          const t = s + (side > 0 ? 0 : step / 2); if (t > L - 3) continue;
          const cx = a.x + ux * t + nx * side * off, cy = a.y + uy * t + ny * side * off, x = cx - lb.dx * 0.9 / 2, y = cy - lb.dy * 0.9 / 2;
          if (!this.canPlace(lampIt, x, y, false, 0.9)) { this.addProp(lampId, x, y, false, 0.9); n++; }
        }
      }
    }
    return n;
  }

  // ---------- fx ----------
  puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 1.5, y: y + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.6 + Math.random() * 1.2, z: 0, life: 0.6 + Math.random() * 0.6, age: 0, r: 0.25 + Math.random() * 0.3 });
  }
  private revealFront(b: Build, now: number) {
    const p = clamp((now - b.t0) / b.dur, 0, 1), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return e * b.total;
  }
  /** the build reveal as an alpha mask in screen space (half resolution) */
  private revealMask(now: number) {
    if (!this.builds.length) return null;
    const W = Math.ceil(this.cw / 2), H = Math.ceil(this.ch / 2);
    if (!this.mask || this.mask.width !== W || this.mask.height !== H) this.mask = new OffscreenCanvas(W, H);
    const g = this.mask.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.beginPath();
    for (const b of this.builds) {
      const front = this.revealFront(b, now), pad = b.cls.h + b.cls.walk + 14;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = clamp(front - b.cum[i], 0, len); if (rl <= 0) return;
        const u = mul(d, 1 / len), n = perp(u), done = rl >= len - 1e-6;
        const s = sub(l.a, mul(u, pad)), e = add(l.a, mul(u, rl + (done ? pad : 0)));
        const c = [add(s, mul(n, pad)), add(e, mul(n, pad)), sub(e, mul(n, pad)), sub(s, mul(n, pad))].map(q => this.screen(q.x, q.y));
        g.moveTo(c[0].x / 2, c[0].y / 2); for (let k = 1; k < 4; k++) g.lineTo(c[k].x / 2, c[k].y / 2); g.closePath();
      });
    }
    g.fill(); return this.mask;
  }

  // ---------- main loop ----------
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const t0 = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000), frameMs = now - this.last; this.last = now;
    this.resize();
    const sp = 900 / this.cam.z * dt; let kx = 0, ky = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) kx -= 1; if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) ky -= 1; if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) ky += 1;
    if (kx || ky) { this.cam.X += kx * sp * 0.6; this.cam.Y += ky * sp * 0.6; this.clampCam(); }
    this.onFrame?.(now, dt);
    this.dayTimer += dt; if (this.dayTimer >= DAY_SECONDS) { this.dayTimer -= DAY_SECONDS; this.tickDay(); }
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl));
        for (let k = 0; k < 3; k++) { const s = (Math.random() - 0.5) * 2 * b.cls.h, q = add(f, mul(n, s)); this.particles.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 1.5 - u.x * 0.4, vy: (Math.random() - 0.5) * 1.5 - u.y * 0.4, vz: 0.8 + Math.random() * 1.6, z: 0, life: 0.7 + Math.random() * 0.7, age: 0, r: 0.3 + Math.random() * 0.5 }); }
      });
    }
    this.builds = this.builds.filter(b => now < b.t0 + b.dur + 150);
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 0.8 * dt; p.r += 0.6 * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
    this.traffic?.update(now);
    const t1 = performance.now();
    this.draw(now);
    const t2 = performance.now();
    // perf counters (rolling one second)
    this.frameTimes.push(frameMs); if (this.frameTimes.length > 60) this.frameTimes.shift();
    const avg = this.frameTimes.reduce((s, v) => s + v, 0) / this.frameTimes.length;
    Object.assign(this.perf, { fps: 1000 / avg, frameMs: avg, cpuMs: t2 - t0, drawMs: t2 - t1, instances: this.gl.stats.instances, draws: this.gl.stats.draws, uploadKB: this.gl.stats.uploadFloats * 4 / 1024, chunksPending: this.ground.busy, simActive: this.traffic?.stats.active ?? 0, simTickMs: this.traffic?.stats.tickMs ?? 0, simMaxTickMs: this.traffic?.stats.maxTickMs ?? 0 });
    this.perf.frames++;
  };
  /** a hook for the benchmark's camera path */
  onFrame: ((now: number, dt: number) => void) | null = null;

  private draw(now: number) {
    const z = this.cam.z, ze = z * this.dpr, gl = this.gl, cam = this.cam;
    const tier = z < PLANNER_Z ? 'planner' : z < DISTRICT_Z ? 'district' : 'street'; this.perf.tier = tier;
    gl.begin({ X: cam.X, Y: cam.Y, ze, cw: this.cw, ch: this.ch }, [0.106, 0.157, 0.086]);
    const X0 = cam.X - this.cw / 2 / ze, Y0 = cam.Y - this.ch / 2 / ze, X1 = cam.X + this.cw / 2 / ze, Y1 = cam.Y + this.ch / 2 / ze;
    const dist = (cx: number, cy: number) => Math.hypot(cx - cam.X, cy - cam.Y) * ze;
    // ---- planner map: the whole view at the planner tier, otherwise under any chunk not baked yet
    const pL = planLevelFor(ze), pi0 = Math.floor(X0 / PLAN_W), pi1 = Math.floor(X1 / PLAN_W), pj0 = Math.floor(Y0 / PLAN_H), pj1 = Math.floor(Y1 / PLAN_H);
    const drawPlan = () => {
      for (let j = pj0; j <= pj1; j++) for (let i = pi0; i <= pi1; i++) {
        const t = this.ground.tile('p', i, j); this.ground.need(t, pL, (tier === 'planner' ? 0 : 1e6) + dist((i + 0.5) * PLAN_W, (j + 0.5) * PLAN_H), now);
        if (t.tex) gl.drawChunk(t.tex, i * PLAN_W, j * PLAN_H, (i + 1) * PLAN_W, (j + 1) * PLAN_H);
      }
    };
    if (tier === 'planner') {
      drawPlan();
      // vehicles as dots coloured by type
      const tr = this.traffic;
      if (tr) {
        const pts = new Float32Array(tr.n * POINT_STRIDE); let n = 0;
        for (let i = 0; i < tr.n; i++) { if (!tr.alive[i]) continue; const X = worldX(tr.px[i], tr.py[i]), Y = worldY(tr.px[i], tr.py[i]); if (X < X0 || X > X1 || Y < Y0 || Y > Y1) continue; const c = CAR_COLOURS[tr.kind[i] % CAR_COLOURS.length], o = n * POINT_STRIDE; pts[o] = X; pts[o + 1] = Y; pts[o + 2] = c[0]; pts[o + 3] = c[1]; pts[o + 4] = c[2]; pts[o + 5] = 1; n++; }
        gl.upload(pts, n * POINT_STRIDE); gl.drawPoints(0, n, Math.max(1.5, Math.min(4, 5 * ze / 0.035)) * (this.dpr > 1 ? 1.5 : 1));
      }
    } else {
      // ---- ground: full chunks close up, district chunks (4 x 4, lite) further out
      const mid = z < MID_BELOW, kind = mid ? 'm' : 'g', CW = mid ? MID_W : CHUNK_W, CH = mid ? MID_H : CHUNK_H, L = mid ? midLevelFor(ze) : levelFor(ze);
      const i0 = Math.floor(X0 / CW), i1 = Math.floor(X1 / CW), j0 = Math.floor(Y0 / CH), j1 = Math.floor(Y1 / CH);
      // a chunk not baked yet shows its piece of the planner map meanwhile
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j); if (t.tex || t.prev) continue;
        const X = i * CW, Y = j * CH, pi = Math.floor(X / PLAN_W), pj = Math.floor(Y / PLAN_H), p = this.ground.tile('p', pi, pj);
        this.ground.need(p, pL, 1e6 + dist(X, Y), now);
        if (p.tex) gl.drawChunk(p.tex, X, Y, X + CW, Y + CH, false, 1, [(X - pi * PLAN_W) / PLAN_W, (Y - pj * PLAN_H) / PLAN_H, (X + CW - pi * PLAN_W) / PLAN_W, (Y + CH - pj * PLAN_H) / PLAN_H]);
      }
      const mask = this.revealMask(now); if (mask) gl.setMask(mask);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const t = this.ground.tile(kind, i, j);
        this.ground.need(t, L, dist((i + 0.5) * CW, (j + 0.5) * CH), now);
        const r = [i * CW, j * CH, (i + 1) * CW, (j + 1) * CH] as const;
        if (t.prev && now < t.prevUntil) { gl.drawChunk(t.prev, ...r); if (t.tex && t.tex !== t.prev && mask) gl.drawChunk(t.tex, ...r, true); }
        else if (t.tex) gl.drawChunk(t.tex, ...r);
      }
      // ---- sprites: every visible tile in one instanced draw (each instance clipped to its tile), vehicles merged in
      const vis: { i: number; j: number }[] = [];
      for (let j = Math.floor(Y0 / SPR_H); j <= Math.floor(Y1 / SPR_H); j++) for (let i = Math.floor(X0 / SPR_W); i <= Math.floor(X1 / SPR_W); i++) vis.push({ i, j });
      const c = [tileOf(X0, Y0), tileOf(X1, Y0), tileOf(X0, Y1), tileOf(X1, Y1)], pad = 6;
      // cars in tunnels are not drawn (the sim client skips them)
      const bx0 = Math.min(...c.map(p => p.x)) - pad, by0 = Math.min(...c.map(p => p.y)) - pad, bx1 = Math.max(...c.map(p => p.x)) + pad, by1 = Math.max(...c.map(p => p.y)) + pad;
      const movers: Drawable[] = this.traffic ? this.traffic.visible(bx0, by0, bx1, by1) : [];
      this.plantForest(X0, Y0, X1, Y1);
      const f = this.sprites.frame(vis, movers), street = tier === 'street';
      // car lights (night): lamps and beam glows of the cars in the same box, uploaded with the sprites
      const tr = this.traffic, lightOn = !!tr && cam.z >= 0.08;
      if (tr && lightOn && this.lightBuf.length < tr.n * 7 * POINT_STRIDE) this.lightBuf = new Float32Array(tr.n * 7 * POINT_STRIDE);
      const lt = tr && lightOn ? tr.lights(bx0, by0, bx1, by1, ze, Math.floor(now / 350) % 2 === 0, this.lightBuf) : null;
      const [sAt, pAt, lAt] = gl.uploadParts([[f.shadows, street ? f.shadowFloats : 0], [f.stream, f.floats], [this.lightBuf, lt ? (lt.small + lt.beams) * POINT_STRIDE : 0]]);
      if (street) gl.drawShadows(sAt, f.shadowFloats / SHADOW_STRIDE);
      gl.drawSprites(pAt, f.floats / SPRITE_STRIDE, tier === 'district' ? 7 * this.dpr : 0);
      if (lt) { gl.drawPoints(lAt, lt.small, Math.max(2, 0.55 * 64 * ze), true); gl.drawPoints(lAt + lt.small * POINT_STRIDE, lt.beams, Math.max(4, 2.6 * 64 * ze), true); }
    }
    this.ground.pump(); this.ground.settle(now); this.ground.evict(now);
    this.drawOverlay(now);
  }

  /** debug: the lane graph (white links, yellow connectors, cyan ring arcs, red conflict dots); lanes are drawn when an end is near the view */
  private drawLanes(ctx: CanvasRenderingContext2D) {
    const ze = this.cam.z * this.dpr, pad = 10;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const ok = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1, at = { x: 0, y: 0, hx: 0, hy: 0 };
    this.setIso(ctx); ctx.lineWidth = 0.08;
    for (const l of this.lanes.lanes) {
      if (!l) continue;
      const n = l.pts.length;
      if (!ok(l.pts[0], l.pts[1]) && !ok(l.pts[n - 2], l.pts[n - 1])) continue;
      if (l.kind === LK.LINK) ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      if (l.kind === LK.CONN) ctx.strokeStyle = '#ffd866';
      if (l.kind === LK.RING) ctx.strokeStyle = '#5ee6ff';
      ctx.beginPath(); ctx.moveTo(l.pts[0], l.pts[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(l.pts[i], l.pts[i + 1]); ctx.stroke();
      for (const c of l.conflicts) {
        if (c.lane < l.id) continue;
        laneAt(l, c.s, at); ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.arc(at.x, at.y, 0.15, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /** the signal heads of the junctions in view (Street tier): a disc per arm at its stop line, green, amber or red at the sim's time */
  private drawSignals(ctx: CanvasRenderingContext2D) {
    const traffic = this.traffic; if (!traffic) return;
    const ze = this.cam.z * this.dpr, pad = 4;
    const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
    const x0 = Math.min(c0.x, top.x) - pad, x1 = Math.max(c1.x, bot.x) + pad, y0 = Math.min(c1.y, top.y) - pad, y1 = Math.max(c0.y, bot.y) + pad;
    const T = traffic.simTime(performance.now());
    this.setIso(ctx);
    for (const p of this.lanes.signals.values()) {
      const n = p.node;
      if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
      for (let i = 0; i < n.arms.length; i++) {
        const a = n.arms[i], inset = a.stop >= 0 ? a.stop : a.reachEdge, st = phaseState(p, p.armPhase[i], T);
        const x = n.x + a.dir.x * inset + a.nrm.x * a.h * 0.75, y = n.y + a.dir.y * inset + a.nrm.y * a.h * 0.75;
        ctx.fillStyle = st === 0 ? '#3ddc84' : st === 1 ? '#ffb020' : '#ff3b3b';
        ctx.beginPath(); ctx.arc(x, y, 0.35, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  private drawOverlay(now: number) {
    const ctx = this.ov, ze = this.cam.z * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cw, this.ch);
    if (this.showGrid && this.cam.z > 0.12) {
      const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
      const x0 = clamp(Math.floor(Math.min(c0.x, top.x)), 0, MAP), x1 = clamp(Math.ceil(Math.max(c1.x, bot.x)), 0, MAP), y0 = clamp(Math.floor(Math.min(c1.y, top.y)), 0, MAP), y1 = clamp(Math.ceil(Math.max(c0.y, bot.y)), 0, MAP);
      this.setIso(ctx); ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    }
    if (this.showLanes && this.cam.z > 0.12) this.drawLanes(ctx);
    if (this.traffic && this.cam.z >= DISTRICT_Z) this.drawSignals(ctx);
    this.drawGroundOverlays(ctx);
    for (const p of [this.selected, this.hoverProp]) {
      if (!p) continue;
      this.setIso(ctx); ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = p === this.selected ? 'rgba(255,190,60,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = p === this.selected ? '#ffbe3c' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    }
    // construction front: striped barrier, cones and dust
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl)), w = b.cls.h * 2, dd = 0.35;
        this.setIso(ctx); ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(Math.atan2(u.y, u.x));
        ctx.fillStyle = '#f2b632'; ctx.fillRect(-dd / 2, -w / 2, dd, w);
        ctx.fillStyle = '#1a1a1a'; for (let s = -w / 2; s < w / 2; s += 0.8) ctx.fillRect(-dd / 2, s, dd, 0.4);
        ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const t of [-b.cls.h + 0.4, b.cls.h - 0.4]) {
          const q = add(f, mul(n, t)), c = this.screen(q.x, q.y), hgt = 0.5 * HH * ze * 2.2, bw = 0.25 * HW * ze;
          ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(c.x, c.y - hgt); ctx.lineTo(c.x + bw, c.y); ctx.lineTo(c.x - bw, c.y); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillRect(c.x - bw * 0.5, c.y - hgt * 0.55, bw, hgt * 0.15);
        }
      });
    }
    for (const p of this.particles) {
      const s = this.screen(p.x, p.y), a = (1 - p.age / p.life) * 0.5, r = p.r * HW * ze;
      ctx.fillStyle = `rgba(214,190,150,${a.toFixed(3)})`; ctx.beginPath(); ctx.ellipse(s.x, s.y - p.z * HH * ze * 1.5, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawGroundOverlays(ctx: CanvasRenderingContext2D) {
    const strip = (legs: Leg[], hw: number) => { for (const l of legs) { const d = sub(l.b, l.a), len = vlen(d) || 1, u = mul(d, 1 / len), n = perp(u); const c = [add(sub(l.a, mul(u, hw)), mul(n, hw)), add(add(l.b, mul(u, hw)), mul(n, hw)), sub(add(l.b, mul(u, hw)), mul(n, hw)), sub(sub(l.a, mul(u, hw)), mul(n, hw))]; ctx.moveTo(c[0].x, c[0].y); for (let k = 1; k < 4; k++) ctx.lineTo(c[k].x, c[k].y); ctx.closePath(); } };
    if (this.tool === 'road') {
      const legs = this.previewLegs(), cls = this.cls;
      if (legs.length) {
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = cls.walkTex === 'gravel' ? 'rgba(150,140,120,0.45)' : 'rgba(230,200,160,0.45)'; ctx.fill();
        this.setIso(ctx); ctx.beginPath(); strip(legs, cls.h); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = 'rgba(50,60,80,0.6)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
        if (cls.median) { this.setIso(ctx); ctx.beginPath(); strip(legs, cls.median / 2); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(90,160,70,0.55)'; ctx.fill(); }
        this.setIso(ctx); ctx.beginPath(); for (const l of legs) { ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); } ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.stroke();
        const pts = [...this.route, legs[legs.length - 1].b];
        for (const p of pts) { const s = this.screen(p.x, p.y); ctx.fillStyle = '#ffd866'; ctx.beginPath(); ctx.arc(s.x, s.y, 4 * this.dpr, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#4a3200'; ctx.lineWidth = 1.5; ctx.stroke(); }
      } else if (this.hover) {
        const p = this.snapNode(this.hover), s = this.screen(p.x, p.y);
        ctx.fillStyle = 'rgba(255,216,102,0.9)'; ctx.beginPath(); ctx.arc(s.x, s.y, 5 * this.dpr, 0, Math.PI * 2); ctx.fill();
      }
    } else if (this.tool === 'junction' && this.hoverNode) {
      const n = this.hoverNode, r = Math.max(...n.arms.map(a => a.h)) + 1.5;
      this.setIso(ctx); ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,216,102,0.22)'; ctx.fill(); ctx.strokeStyle = '#ffd866'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.stroke(); ctx.setLineDash([]);
    } else if (this.tool === 'bulldoze' && this.hoverPiece) {
      const pc = this.hoverPiece, cls = pc.seg.cls;
      this.setIso(ctx); ctx.beginPath(); strip([{ a: pc.p0, b: pc.p1 }], cls.h + cls.walk); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(240,80,60,0.3)'; ctx.fill(); ctx.strokeStyle = '#f87171'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}
