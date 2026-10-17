import { HH, HW, MAP, ZOOM_MAX, ZOOM_MIN, clamp, tileOf, worldX, worldY } from './iso';
import { LIBRARY } from './library';
import { CLASS, CLASSES, JUNCTIONS, RoadNetwork, add, mul, perp, sub, vlen, type ClassId, type Leg, type Node, type NodeType, type PieceSel, type Pt, type RoadClass } from './network';
import { GroundRenderer, type Camera } from './renderer';
import { Textures } from './textures';
import type { BendMode, LibItem, LineStyle, Prop, SaveData, Tool } from './types';

const SAVE_KEY = 'maple-falls-town-v2';
const DAY_SECONDS = 20;

interface Build { legs: Leg[]; cls: RoadClass; t0: number; dur: number; total: number; cum: number[] }
interface Particle { x: number; y: number; vx: number; vy: number; vz: number; z: number; life: number; age: number; r: number }
export interface Toast { id: number; text: string; t: number; kind: 'info' | 'warn' | 'good' }
const AUTO_TREES = ['world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold'];

export class Game {
  ctx: CanvasRenderingContext2D;
  dpr = 1; cw = 1; ch = 1; cssW = 1; cssH = 1;
  cam: Camera = { X: worldX(MAP / 2, MAP / 2), Y: worldY(MAP / 2, MAP / 2), z: 0.16 };
  terrain = new Uint8Array(MAP * MAP);
  net = new RoadNetwork();
  props: Prop[] = []; order: Prop[] = []; nextUid = 1;
  images: HTMLImageElement[] = [];
  tex = new Textures();
  ground: GroundRenderer;
  ready = false; loadProgress = 0;
  // tools
  tool: Tool = 'road'; roadClass: ClassId = 'street'; bendMode: BendMode = 90; lineStyle: LineStyle = 0; junctionType: NodeType = 'signal';
  terrainType = 0; brush = 2; libIndex = 0; flip = false; placeScale = 1;
  selected: Prop | null = null; showGrid = false;
  hover: Pt | null = null; hoverProp: Prop | null = null; hoverNode: Node | null = null; hoverPiece: PieceSel | null = null;
  route: Pt[] = [];
  // economy
  money = 80000; day = 1; dayTimer = 0; population = 0; lastIncome = 0;
  // fx
  builds: Build[] = []; particles: Particle[] = [];
  toasts: Toast[] = []; toastId = 1;
  // input
  private dragging: null | { kind: 'pan' | 'prop' | 'paint' | 'bulldoze'; sx: number; sy: number; camX: number; camY: number; moved: boolean; prop?: Prop; ox?: number; oy?: number } = null;
  keys = new Set<string>();
  private listeners = new Set<() => void>();
  private saveTimer = 0;
  private raf = 0; private last = 0;
  placeError = '';

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.ground = new GroundRenderer(this.terrain, this.net, this.tex);
  }
  get cls() { return CLASS[this.roadClass]; }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { for (const l of this.listeners) l(); }
  toast(text: string, kind: Toast['kind'] = 'info') {
    this.toasts.push({ id: this.toastId++, text, t: performance.now(), kind });
    if (this.toasts.length > 4) this.toasts.shift();
    this.emit();
  }

  async init() {
    const imgs = LIBRARY.map(it => new Promise<HTMLImageElement>(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(im); im.src = it.src; }));
    let done = 0; const total = imgs.length + 12;
    const tick = () => { this.loadProgress = ++done / total; this.emit(); };
    imgs.forEach(p => p.then(tick));
    const texJob = this.tex.build(() => tick());
    this.images = await Promise.all(imgs);
    await texJob;
    if (!this.load()) this.seedTown();
    this.net.rebuild(); this.syncAutoProps(); this.syncLamps(false);
    this.reorder();
    this.ready = true; this.emit();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }
  destroy() { cancelAnimationFrame(this.raf); }

  // ---------- geometry helpers ----------
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cssW = r.width; this.cssH = r.height;
    this.cw = Math.max(1, Math.round(r.width * this.dpr)); this.ch = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== this.cw || this.canvas.height !== this.ch) { this.canvas.width = this.cw; this.canvas.height = this.ch; }
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
    const occ = this.net.rectOcc(f.x0 + 0.08, f.y0 + 0.08, f.x1 - 0.08, f.y1 - 0.08);
    if (it.kind === 'car') { if (occ === 3) return 'Not on the median'; }
    else if (it.big) { if (occ) return 'Keep buildings off the road and sidewalk'; }
    else if (occ === 2) return 'Not on the asphalt';
    for (const p of this.props) {
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
    this.props.push(p); return p;
  }
  removeProp(p: Prop) { const i = this.props.indexOf(p); if (i >= 0) this.props.splice(i, 1); if (this.selected === p) this.selected = null; }
  /** street lamps light the road: their reflection pools are part of the ground picture */
  syncLamps(invalidate = true) {
    const before = this.net.pools.map(p => p.x + ',' + p.y).join(';');
    this.net.setLamps(this.props.filter(p => LIBRARY[p.item].kind === 'lamp').map(p => ({ x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 })));
    const after = this.net.pools.map(p => p.x + ',' + p.y).join(';');
    if (invalidate && before !== after) {
      const a = new Set(before.split(';')), b = new Set(after.split(';'));
      for (const k of [...a, ...b]) if (!(a.has(k) && b.has(k)) && k) { const [x, y] = k.split(',').map(Number); this.ground.invalidate([x - 9, y - 9, x + 9, y + 9]); }
    }
  }
  /** median trees, roundabout trees and traffic lights follow the road network */
  syncAutoProps() {
    const want = new Map<string, { item: number; x: number; y: number; scale: number }>();
    for (const a of this.net.autoProps) {
      const id = a.kind === 'tree' ? AUTO_TREES[a.i % AUTO_TREES.length] : a.kind === 'rbtree' ? 'world:tree_oak_0' : 'town:traffic_light';
      const item = LIBRARY.findIndex(i => i.id === id); if (item < 0) continue;
      const it = LIBRARY[item], b = it.boxes[0], scale = a.kind === 'tree' ? 0.85 : a.kind === 'rbtree' ? 1.2 : 1;
      want.set(`${a.kind}@${a.x.toFixed(2)},${a.y.toFixed(2)}`, { item, x: a.x - b.dx * scale / 2, y: a.y - b.dy * scale / 2, scale });
    }
    this.props = this.props.filter(p => !p.auto || want.has(p.auto));
    const have = new Set(this.props.filter(p => p.auto).map(p => p.auto!));
    for (const [k, w] of want) if (!have.has(k)) { const p = this.addProp(w.item, w.x, w.y, false, w.scale); p.auto = k; }
  }

  /** painter's order: a topological sort over props whose pictures overlap on screen */
  reorder() {
    const props = this.props, n = props.length;
    const box = props.map(p => { const it = LIBRARY[p.item], k = p.scale, X = worldX(p.x, p.y), Y = worldY(p.x, p.y); const ax = (p.flip ? it.w - it.ax : it.ax) * k; return { x0: X - ax, x1: X - ax + it.w * k, y0: Y - it.ay * k, y1: Y - it.ay * k + it.h * k }; });
    const cell = 800, buckets = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const b = box[i];
      for (let gx = Math.floor(b.x0 / cell); gx <= Math.floor(b.x1 / cell); gx++) for (let gy = Math.floor(b.y0 / cell); gy <= Math.floor(b.y1 / cell); gy++) {
        const k = gx + ',' + gy; let l = buckets.get(k); if (!l) buckets.set(k, (l = [])); l.push(i);
      }
    }
    const behind: number[][] = Array.from({ length: n }, () => []);
    const seenPair = new Set<number>();
    const isBehind = (a: Prop, b: Prop) => {
      const e = 0.02;
      if (a.x1 <= b.x0 + e) return true; if (b.x1 <= a.x0 + e) return false;
      if (a.y1 <= b.y0 + e) return true; if (b.y1 <= a.y0 + e) return false;
      return a.x1 + a.y1 < b.x1 + b.y1;
    };
    for (const l of buckets.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const a = l[i], b = l[j], key = a < b ? a * n + b : b * n + a; if (seenPair.has(key)) continue; seenPair.add(key);
      const A = box[a], B = box[b]; if (A.x0 >= B.x1 || B.x0 >= A.x1 || A.y0 >= B.y1 || B.y0 >= A.y1) continue;
      if (isBehind(props[a], props[b])) behind[b].push(a); else behind[a].push(b);
    }
    const idx = props.map((_, i) => i).sort((a, b) => (props[a].x1 + props[a].y1) - (props[b].x1 + props[b].y1));
    const state = new Uint8Array(n), out: Prop[] = [];
    const visit = (i: number) => {
      if (state[i]) return; state[i] = 1;
      const stack: [number, number][] = [[i, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1], deps = behind[top[0]];
        if (top[1] < deps.length) { const d = deps[top[1]++]; if (!state[d]) { state[d] = 1; stack.push([d, 0]); } }
        else { stack.pop(); state[top[0]] = 2; out.push(props[top[0]]); }
      }
    };
    for (const i of idx) visit(i);
    this.order = out;
  }

  // ---------- road routing ----------
  setTool(t: Tool) { if (this.tool !== t) { this.cancelRoute(); this.selected = null; } this.tool = t; this.emit(); }
  setLib(i: number) { this.libIndex = i; this.tool = 'objects'; this.emit(); }
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
  routeCost() { return Math.round(this.net.legsLength(this.previewLegs()) * this.cls.cost); }
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
  finishRoute() {
    const legs: Leg[] = [];
    for (let i = 1; i < this.route.length; i++) if (this.route[i].x !== this.route[i - 1].x || this.route[i].y !== this.route[i - 1].y) legs.push({ a: this.route[i - 1], b: this.route[i] });
    if (!legs.length) { this.cancelRoute(); return; }
    const cls = this.cls, total = this.net.legsLength(legs), cost = Math.round(total * cls.cost);
    if (cost > this.money) { this.toast(`Not enough money: the route costs $${cost.toLocaleString()}`, 'warn'); return; }
    const hw = cls.h + cls.walk;
    const blocking = this.props.filter(p => !p.auto && LIBRARY[p.item].big && LIBRARY[p.item].kind !== 'car' && this.propInLegs(p, legs, hw));
    if (blocking.length) { this.toast(`${LIBRARY[blocking[0].item].name} is in the way — bulldoze it first`, 'warn'); return; }
    const cleared = this.props.filter(p => !p.auto && !LIBRARY[p.item].big && this.propInLegs(p, legs, hw));
    for (const p of cleared) this.removeProp(p);
    const now = performance.now(), dur = Math.min(4000, 700 + total * 70);
    const cum: number[] = []; let acc = 0; for (const l of legs) { cum.push(acc); acc += vlen(sub(l.b, l.a)); }
    const pad = hw + 16;
    const bb = legs.reduce<[number, number, number, number]>((b, l) => [Math.min(b[0], l.a.x, l.b.x), Math.min(b[1], l.a.y, l.b.y), Math.max(b[2], l.a.x, l.b.x), Math.max(b[3], l.a.y, l.b.y)], [Infinity, Infinity, -Infinity, -Infinity]);
    this.ground.invalidate([bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad], true, now + dur + 150);
    this.net.addLegs(legs, cls, this.lineStyle);
    this.afterNetworkChange();
    this.builds.push({ legs, cls, t0: now, dur, total, cum });
    this.money -= cost;
    this.route = [];
    this.toast(`Built ${Math.round(total * 2)} m of ${cls.name.toLowerCase()} for $${cost.toLocaleString()}${cleared.length ? ` (cleared ${cleared.length} item${cleared.length > 1 ? 's' : ''})` : ''}`, 'good');
  }
  private afterNetworkChange() { this.syncAutoProps(); this.syncLamps(); this.reorder(); this.scheduleSave(); this.emit(); }
  private junctionClick(mx: number, my: number) {
    const t = this.tileAt(mx, my), spec = JUNCTIONS.find(j => j.id === this.junctionType)!;
    const n = this.net.nearestNode(t, spec.minDeg, 5);
    if (!n) { this.toast(spec.minDeg > 2 ? 'Click a junction where three or more roads meet' : 'Click a junction or a bend in the road', 'warn'); return; }
    if (n.type === this.junctionType) { this.toast(`That junction already has ${spec.name.toLowerCase()}`); return; }
    if (spec.cost > this.money) { this.toast(`Not enough money: ${spec.name} costs $${spec.cost.toLocaleString()}`, 'warn'); return; }
    this.money -= spec.cost;
    const reach = Math.max(...n.arms.map(a => a.h)) + 20;
    this.ground.invalidate([n.x - reach, n.y - reach, n.x + reach, n.y + reach]);
    this.net.setNodeType(n, this.junctionType);
    this.afterNetworkChange();
    this.puff(n.x, n.y, 8);
    if (this.junctionType === 'slip' && !n.arms.every(a => a.len >= 27)) this.toast('Slipways need long approaches (54 m+): short arms get plain corners', 'warn');
    else this.toast(`${spec.name} installed`, 'good');
  }
  private bulldozeAt(mx: number, my: number, first: boolean) {
    const t = this.tileAt(mx, my);
    if (first) {
      const p = this.propAt(mx, my);
      if (p && !p.auto) { const it = LIBRARY[p.item]; this.removeProp(p); this.money += Math.round(it.cost * 0.5); if (it.kind === 'lamp') this.syncLamps(); this.reorder(); this.scheduleSave(); this.toast(`Removed ${it.name} (+$${Math.round(it.cost * 0.5).toLocaleString()})`); return; }
    }
    const piece = this.net.pieceNear(t); if (!piece) return;
    const r = piece.seg.cls.h + 18, cx = (piece.p0.x + piece.p1.x) / 2, cy = (piece.p0.y + piece.p1.y) / 2;
    this.ground.invalidate([cx - r, cy - r, cx + r, cy + r]);
    this.net.removePiece(piece);
    this.afterNetworkChange();
    this.hoverPiece = this.net.pieceNear(t);
    this.puff(t.x, t.y, 10);
  }
  private paintAt(mx: number, my: number) {
    const t = this.tileAt(mx, my), r = this.brush, cx = Math.floor(t.x), cy = Math.floor(t.y);
    let changed = false;
    for (let y = cy - r + 1; y <= cy + r - 1; y++) for (let x = cx - r + 1; x <= cx + r - 1; x++) {
      if (x < 0 || y < 0 || x >= MAP || y >= MAP) continue;
      if (r > 1 && Math.hypot(x + 0.5 - t.x, y + 0.5 - t.y) > r - 0.3) continue;
      const i = y * MAP + x; if (this.terrain[i] !== this.terrainType) { this.terrain[i] = this.terrainType; changed = true; }
    }
    if (changed) { this.ground.invalidate([cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1]); this.scheduleSave(); }
  }
  private placeAt(mx: number, my: number) {
    const t = this.tileAt(mx, my), it = LIBRARY[this.libIndex], k = this.placeScale;
    const err = this.canPlace(it, t.x, t.y, this.flip, k);
    if (err) { this.toast(err, 'warn'); return; }
    if (it.cost > this.money) { this.toast(`Not enough money for ${it.name} ($${it.cost.toLocaleString()})`, 'warn'); return; }
    this.money -= it.cost;
    this.addProp(this.libIndex, t.x, t.y, this.flip, k);
    if (it.kind === 'lamp') this.syncLamps();
    this.reorder(); this.scheduleSave(); this.emit();
    this.puff(t.x, t.y, 4);
  }
  propAt(mx: number, my: number): Prop | null {
    const X = this.cam.X + (mx - this.cssW / 2) / this.cam.z, Y = this.cam.Y + (my - this.cssH / 2) / this.cam.z;
    for (let i = this.order.length - 1; i >= 0; i--) {
      const p = this.order[i], it = LIBRARY[p.item], k = p.scale, px = worldX(p.x, p.y), py = worldY(p.x, p.y), ax = (p.flip ? it.w - it.ax : it.ax) * k;
      if (X >= px - ax && X <= px - ax + it.w * k && Y >= py - it.ay * k && Y <= py - it.ay * k + it.h * k) {
        const img = this.images[p.item]; if (!img.naturalWidth) return p;
        const u = (X - (px - ax)) / (it.w * k), v = (Y - (py - it.ay * k)) / (it.h * k);
        if (sampleAlpha(img, p.flip ? 1 - u : u, v) > 20) return p;
      }
    }
    return null;
  }
  deleteSelected() { if (!this.selected) return; const p = this.selected, it = LIBRARY[p.item]; this.removeProp(p); if (!p.auto) this.money += Math.round(it.cost * 0.5); if (it.kind === 'lamp') this.syncLamps(); this.reorder(); this.scheduleSave(); this.toast(`Removed ${it.name}`); this.emit(); }
  flipSelected() {
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item];
    const err = this.canPlace(it, p.x, p.y, !p.flip, p.scale, p); if (err) { this.toast(err, 'warn'); return; }
    p.flip = !p.flip; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, p.scale)); this.reorder(); this.scheduleSave(); this.emit();
  }
  scaleSelected(f: number) {
    const p = this.selected; if (!p) return; const it = LIBRARY[p.item], k = clamp(p.scale * f, 0.6, 1.6);
    const err = this.canPlace(it, p.x, p.y, p.flip, k, p); if (err) { this.toast(err, 'warn'); return; }
    p.scale = k; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, k)); this.reorder(); this.scheduleSave(); this.emit();
  }

  // ---------- input ----------
  pointerDown(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.canvas.setPointerCapture(e.pointerId);
    const pan = e.button === 1 || e.button === 2 || this.keys.has(' ');
    if (pan || this.tool === 'select') {
      if (!pan && this.tool === 'select') {
        const p = this.propAt(mx, my);
        if (p) { this.selected = p; this.emit(); this.dragging = { kind: 'prop', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false, prop: p, ox: p.x, oy: p.y }; return; }
        this.selected = null; this.emit();
      }
      this.dragging = { kind: 'pan', sx: mx, sy: my, camX: this.cam.X, camY: this.cam.Y, moved: false }; return;
    }
    if (e.button !== 0) return;
    switch (this.tool) {
      case 'road': this.roadClick(mx, my); break;
      case 'junction': this.junctionClick(mx, my); break;
      case 'bulldoze': this.bulldozeAt(mx, my, true); this.dragging = { kind: 'bulldoze', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
      case 'terrain': this.paintAt(mx, my); this.dragging = { kind: 'paint', sx: mx, sy: my, camX: 0, camY: 0, moved: false }; break;
      case 'objects': this.placeAt(mx, my); break;
    }
  }
  pointerMove(e: PointerEvent) {
    const mx = e.offsetX, my = e.offsetY;
    this.hover = this.tileAt(mx, my);
    const d = this.dragging;
    if (d) {
      if (Math.abs(mx - d.sx) + Math.abs(my - d.sy) > 3) d.moved = true;
      if (d.kind === 'pan') { this.cam.X = d.camX - (mx - d.sx) / this.cam.z; this.cam.Y = d.camY - (my - d.sy) / this.cam.z; this.clampCam(); }
      else if (d.kind === 'paint') this.paintAt(mx, my);
      else if (d.kind === 'bulldoze') this.bulldozeAt(mx, my, false);
      else if (d.kind === 'prop' && d.prop && d.moved) {
        const t = this.tileAt(mx, my), p = d.prop, it = LIBRARY[p.item], s0 = this.tileAt(d.sx, d.sy);
        const nx = d.ox! + (t.x - s0.x), ny = d.oy! + (t.y - s0.y);
        this.placeError = this.canPlace(it, nx, ny, p.flip, p.scale, p);
        p.x = nx; p.y = ny; Object.assign(p, this.footprint(it, nx, ny, p.flip, p.scale));
      }
    } else if (this.tool === 'select') this.hoverProp = this.propAt(mx, my);
    if (this.tool === 'objects') this.placeError = this.canPlace(LIBRARY[this.libIndex], this.hover.x, this.hover.y, this.flip, this.placeScale);
    if (this.tool === 'junction') this.hoverNode = this.net.nearestNode(this.hover, JUNCTIONS.find(j => j.id === this.junctionType)!.minDeg, 5);
    if (this.tool === 'bulldoze') this.hoverPiece = this.net.pieceNear(this.hover);
  }
  pointerUp() {
    const d = this.dragging; this.dragging = null;
    if (!d) return;
    if (d.kind === 'prop' && d.prop && d.moved) {
      const p = d.prop, it = LIBRARY[p.item];
      if (this.placeError) { p.x = d.ox!; p.y = d.oy!; Object.assign(p, this.footprint(it, p.x, p.y, p.flip, p.scale)); this.toast(this.placeError, 'warn'); this.placeError = ''; }
      if (it.kind === 'lamp') this.syncLamps();
      this.reorder(); this.scheduleSave();
    }
  }
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
      case 'f': case 'F': if (this.selected) this.flipSelected(); else { this.flip = !this.flip; this.emit(); } break;
      case 'g': case 'G': this.showGrid = !this.showGrid; this.emit(); break;
      case 'q': case 'Q': this.bendMode = this.bendMode === 90 ? 45 : 90; this.emit(); break;
      case 'r': case 'R': this.setTool('road'); break;
      case 'j': case 'J': this.setTool('junction'); break;
      case 'b': case 'B': this.setTool('objects'); break;
      case 't': case 'T': this.setTool('terrain'); break;
      case 'x': case 'X': this.setTool('bulldoze'); break;
      case 'v': case 'V': this.setTool('select'); break;
      case '1': case '2': case '3': case '4': case '5': { const c = CLASSES[+e.key - 1]; if (c) { this.roadClass = c.id; this.setTool('road'); } break; }
      case '+': case '=': this.zoomAt(clamp(this.cam.z * 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case '-': case '_': this.zoomAt(clamp(this.cam.z / 1.25, ZOOM_MIN, ZOOM_MAX)); break;
      case ' ': e.preventDefault(); break;
    }
  }
  keyUp(e: KeyboardEvent) { this.keys.delete(e.key); }

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
  scheduleSave() { clearTimeout(this.saveTimer); this.saveTimer = window.setTimeout(() => this.save(), 800); }
  save() {
    try {
      let bin = ''; for (let i = 0; i < this.terrain.length; i++) bin += String.fromCharCode(this.terrain[i]);
      const data: SaveData = {
        version: 2, map: MAP, terrain: btoa(bin),
        segs: [...this.net.segs].map(s => [s.a.x, s.a.y, s.b.x, s.b.y, s.cls.id, s.style]),
        nodes: [...this.net.nodes.values()].filter(n => n.type !== 'plain').map(n => [n.x, n.y, n.type]),
        props: this.props.filter(p => !p.auto).map(p => [p.item, +p.x.toFixed(3), +p.y.toFixed(3), p.flip ? 1 : 0, p.scale]),
        money: this.money, day: this.day, cam: { ...this.cam },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch { /* storage unavailable */ }
  }
  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false;
      const d = JSON.parse(raw) as SaveData; if (d.version !== 2 || d.map !== MAP) return false;
      const bin = atob(d.terrain); for (let i = 0; i < this.terrain.length && i < bin.length; i++) this.terrain[i] = bin.charCodeAt(i);
      for (const [ax, ay, bx, by, cls, style] of d.segs) this.net.addLegs([{ a: { x: ax, y: ay }, b: { x: bx, y: by } }], CLASS[cls as ClassId] ?? CLASS.street, style as LineStyle);
      for (const [x, y, type] of d.nodes) { const n = this.net.nodeAt({ x, y }); if (n) n.type = type as NodeType; }
      this.props = []; for (const [item, x, y, flip, scale] of d.props) if (LIBRARY[item]) this.addProp(item, x, y, !!flip, scale);
      this.money = d.money; this.day = d.day; if (d.cam) this.cam = { ...d.cam, z: clamp(d.cam.z, ZOOM_MIN, ZOOM_MAX) };
      return true;
    } catch { return false; }
  }
  private reset() {
    this.terrain.fill(0); this.net = new RoadNetwork(); this.ground = new GroundRenderer(this.terrain, this.net, this.tex);
    this.props = []; this.money = 80000; this.day = 1; this.route = []; this.selected = null; this.builds = [];
  }
  newTown() { this.reset(); this.seedTown(); this.net.rebuild(); this.syncAutoProps(); this.syncLamps(false); this.reorder(); this.save(); this.emit(); }
  clearTown() { this.reset(); this.net.rebuild(); this.reorder(); this.save(); this.emit(); }

  /** A starter Maple Falls showing every road type: highway with a 45° approach, a boulevard, an avenue, a roundabout, lights with slipways, streets and a lane. */
  seedTown() {
    const net = this.net, byId = (id: string) => LIBRARY.findIndex(i => i.id === id);
    const legs = (pts: [number, number][]): Leg[] => pts.slice(1).map((p, i) => ({ a: { x: pts[i][0], y: pts[i][1] }, b: { x: p[0], y: p[1] } }));
    net.addLegs(legs([[10, 50], [24, 36], [146, 36], [146, 64]]), CLASS.road, 0);
    net.addLegs(legs([[80, 36], [80, 124]]), CLASS.boulevard, 0);
    net.addLegs(legs([[36, 80], [128, 80]]), CLASS.avenue, 0);
    net.addLegs(legs([[54, 80], [54, 108], [106, 108], [106, 80]]), CLASS.street, 0);
    net.addLegs(legs([[54, 80], [54, 58]]), CLASS.street, 1);
    net.addLegs(legs([[60, 124], [100, 124]]), CLASS.street, 0);
    net.addLegs(legs([[106, 96], [122, 80]]), CLASS.street, 0);
    net.addLegs(legs([[54, 94], [72, 94]]), CLASS.lane, 0);
    net.addLegs(legs([[120, 108], [106, 108]]), CLASS.street, 2);
    const typed = (x: number, y: number, t: NodeType) => { const n = net.nodeAt({ x, y }); if (n) n.type = t; };
    typed(80, 36, 'slip'); typed(80, 80, 'roundabout'); typed(80, 108, 'signal'); typed(106, 80, 'signal');
    net.rebuild();
    // helpers: a sprite facing +y with its front edge on frontY; flipped sprites face +x with their front edge on frontX
    const front = (id: string, cx: number, frontY: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = cx - b.dx * k / 2, y = frontY - (b.dy * k / 2 + b.hy * k / 2); if (!this.canPlace(it, x, y, false, k)) this.addProp(i, x, y, false, k); };
    const side = (id: string, frontX: number, cy: number, k = 1) => { const i = byId(id); if (i < 0) return; const it = LIBRARY[i], b = it.boxes[0], x = frontX - (b.dy * k / 2 + b.hy * k / 2), y = cy - b.dx * k / 2; if (!this.canPlace(it, x, y, true, k)) this.addProp(i, x, y, true, k); };
    const put = (id: string, x: number, y: number, k = 1, flip = false) => { const i = byId(id); if (i >= 0 && !this.canPlace(LIBRARY[i], x, y, flip, k)) this.addProp(i, x, y, flip, k); };
    // avenue shops (north side, facing the avenue)
    front('town:postoffice', 45, 75.4); front('town:bakery', 54, 75.4); front('world:arcade', 63, 75.4);
    front('world:video_rental', 96, 75.4); front('town:grocery', 106, 75.4); front('world:diner', 115, 75.4); front('town:pharmacy', 123, 75.4);
    front('town:laundromat', 40, 118.9); front('town:fish_tackle', 128, 100);
    // civic
    front('world:church', 54, 54.4); front('world:primary_school', 46, 32.2); front('ref:building-gas-canopy', 112, 32.2); side('town:firestation', 73.9, 62);
    front('world:barn', 30, 61); put('ref:landmark-windmill', 22, 72); put('world:watertower', 138, 76); put('world:gazebo', 102, 56);
    // houses: north of the loop street and the south street, west of the cul-de-sac street, north of the lane
    for (const [id, x] of [['world:house_1', 61], ['world:house_3', 69], ['gen:house-splitlevel', 91], ['world:house_4', 99]] as [string, number][]) front(id, x, 104.9);
    for (const [id, x] of [['gen:house-duplex', 66], ['world:house_1', 74], ['gen:house-l-ranch', 88], ['world:house_3', 96]] as [string, number][]) front(id, x, 120.9);
    for (const [id, y] of [['gen:house-ranch-long', 64], ['world:house_4', 72], ['gen:house-farmhouse-wrap', 88], ['gen:house-l-shape', 100]] as [string, number][]) side(id, 50.9, y);
    front('world:house_4', 60, 92.4); front('static:garage_timber', 67, 92.4);
    // terrain: park, field, plaza, driveways
    for (let y = 44; y < 66; y++) for (let x = 90; x < 124; x++) this.terrain[y * MAP + x] = 1;
    for (let y = 44; y < 60; y++) for (let x = 20; x < 42; x++) this.terrain[y * MAP + x] = 4;
    for (let y = 70; y < 75; y++) for (let x = 40; x < 50; x++) this.terrain[y * MAP + x] = 5;
    for (const x of [64, 72, 94, 102]) for (let y = 105; y < 106; y++) this.terrain[y * MAP + x] = 6;
    // trees, furniture, vehicles, Halloween
    const trees = ['world:tree_oak_0', 'world:tree_oak_1', 'ref:tree-maple-crimson', 'world:tree_oak_2', 'ref:tree-birch-gold', 'world:tree_pine_0', 'ref:tree-spruce-blue', 'world:tree_pine_1'];
    const spots: [number, number][] = [[94, 48], [100, 50], [108, 47], [114, 52], [120, 58], [96, 60], [112, 62], [118, 48], [60, 113], [68, 113], [92, 113], [100, 113], [44, 86], [46, 100], [112, 90], [118, 96], [130, 56], [134, 48], [30, 72], [36, 66], [138, 92], [132, 100], [60, 44], [66, 48], [24, 60]];
    spots.forEach(([x, y], i) => put(trees[(i * 5) % trees.length], x, y, 0.95 + ((i * 7) % 4) * 0.08));
    // street lamps on the sidewalk's outer half along every kerbed street, both sides, staggered (their reflections light the road)
    const lampId = byId('world:streetlamp'), lampIt = LIBRARY[lampId], lb = lampIt.boxes[0];
    for (const r of net.routes) {
      if (r.cls.walkTex !== 'slabs' || r.closed) continue;
      const n = r.pts.length;
      for (let k = 0; k + 1 < n; k++) {
        const a = r.pts[k], b = r.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 6) continue;
        const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, off = r.cls.h + r.cls.walk * 0.62, step = r.cls.id === 'lane' ? 12 : 8;
        for (let s = 4; s < L - 3; s += step) for (const side of [1, -1]) {
          const t = s + (side > 0 ? 0 : step / 2); if (t > L - 3) continue;
          const cx = a.x + ux * t + nx * side * off, cy = a.y + uy * t + ny * side * off, x = cx - lb.dx * 0.9 / 2, y = cy - lb.dy * 0.9 / 2;
          if (!this.canPlace(lampIt, x, y, false, 0.9)) this.addProp(lampId, x, y, false, 0.9);
        }
      }
    }
    put('world:hydrant', 60, 84.2, 0.9); put('world:mailbox', 68, 76.3, 0.9); put('world:bench', 92, 84.1, 0.9); put('world:trashcan', 94, 84.1, 0.9); put('town:bus_stop', 66, 84.1, 0.95);
    put('town:stop_sign', 57.4, 104.6, 0.9); put('town:phone_booth', 101, 76.3, 0.9); put('town:picnic_table', 104, 60, 0.95); put('town:bike_rack', 60, 76.3, 0.9); put('town:utility_pole', 36, 86, 1);
    put('world:car_0', 48, 37.2); put('static:pickup_n', 104, 34.9); put('world:schoolbus', 130, 37.3); put('static:van_e', 60, 82.2); put('world:car_2', 110, 77.8);
    put('world:car_1', 82, 60); put('static:compact_n', 76, 100); put('world:car_3', 66, 106.9); put('static:compact_e', 96, 109.1, 1, true);
    put('world:scarecrow', 30, 52, 0.9); put('ref:halloween-hay-bales', 34, 56, 0.9); put('world:pumpkin_0', 59, 101.5, 0.9); put('world:pumpkin_1', 91.5, 101.6, 0.9); put('gen:inflatable-pumpkin', 73, 117.8, 0.9);
    put('world:candy_stand', 110, 58, 0.9); put('ref:halloween-pumpkin-cluster', 48, 72.5, 0.9); put('ref:halloween-sheet-ghost', 97, 101, 0.9);
    this.cam = { X: worldX(84, 86), Y: worldY(84, 86), z: 0.17 };
  }

  // ---------- fx ----------
  puff(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + (Math.random() - 0.5) * 1.5, y: y + (Math.random() - 0.5) * 1.5, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.6 + Math.random() * 1.2, z: 0, life: 0.6 + Math.random() * 0.6, age: 0, r: 0.25 + Math.random() * 0.3 });
  }
  private revealFront(b: Build, now: number) {
    const p = clamp((now - b.t0) / b.dur, 0, 1), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    return e * b.total;
  }
  /** screen-space clip of what has been built so far */
  private revealPath(now: number): Path2D | null {
    if (!this.builds.length) return null;
    const path = new Path2D();
    for (const b of this.builds) {
      const front = this.revealFront(b, now), pad = b.cls.h + b.cls.walk + 14;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = clamp(front - b.cum[i], 0, len); if (rl <= 0) return;
        const u = mul(d, 1 / len), n = perp(u), done = rl >= len - 1e-6;
        const s = sub(l.a, mul(u, pad)), e = add(l.a, mul(u, rl + (done ? pad : 0)));
        const c = [add(s, mul(n, pad)), add(e, mul(n, pad)), sub(e, mul(n, pad)), sub(s, mul(n, pad))].map(q => this.screen(q.x, q.y));
        path.moveTo(c[0].x, c[0].y); for (let k = 1; k < 4; k++) path.lineTo(c[k].x, c[k].y); path.closePath();
      });
    }
    return path;
  }

  // ---------- main loop ----------
  frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.resize();
    const sp = 900 / this.cam.z * dt; let kx = 0, ky = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('a') || this.keys.has('A')) kx -= 1; if (this.keys.has('ArrowRight') || this.keys.has('d') || this.keys.has('D')) kx += 1;
    if (this.keys.has('ArrowUp') || this.keys.has('w') || this.keys.has('W')) ky -= 1; if (this.keys.has('ArrowDown') || this.keys.has('s') || this.keys.has('S')) ky += 1;
    if (kx || ky) { this.cam.X += kx * sp * 0.6; this.cam.Y += ky * sp * 0.6; this.clampCam(); }
    this.dayTimer += dt; if (this.dayTimer >= DAY_SECONDS) { this.dayTimer -= DAY_SECONDS; this.tickDay(); }
    for (const b of this.builds) {
      const front = this.revealFront(b, now); if (front >= b.total) continue;
      b.legs.forEach((l, i) => {
        const d = sub(l.b, l.a), len = vlen(d), rl = front - b.cum[i]; if (rl < 0 || rl > len) return;
        const u = mul(d, 1 / len), n = perp(u), f = add(l.a, mul(u, rl));
        for (let k = 0; k < 3; k++) { const s = (Math.random() - 0.5) * 2 * b.cls.h, q = add(f, mul(n, s)); this.particles.push({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 1.5 - u.x * 0.4, vy: (Math.random() - 0.5) * 1.5 - u.y * 0.4, vz: 0.8 + Math.random() * 1.6, z: 0, life: 0.5 + Math.random() * 0.6, age: 0, r: 0.3 + Math.random() * 0.4 }); }
      });
    }
    this.builds = this.builds.filter(b => now < b.t0 + b.dur + 150);
    for (const p of this.particles) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 0.8 * dt; p.r += 0.6 * dt; }
    this.particles = this.particles.filter(p => p.age < p.life);
    this.draw(now);
  };

  private draw(now: number) {
    const ctx = this.ctx, ze = this.cam.z * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b2816'; ctx.fillRect(0, 0, this.cw, this.ch);
    this.ground.draw(ctx, this.cam, this.cw, this.ch, this.dpr, now, this.revealPath(now), 7);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.showGrid && this.cam.z > 0.12) {
      const c0 = tileOf(this.cam.X - this.cw / 2 / ze, this.cam.Y), c1 = tileOf(this.cam.X + this.cw / 2 / ze, this.cam.Y), top = tileOf(this.cam.X, this.cam.Y - this.ch / 2 / ze), bot = tileOf(this.cam.X, this.cam.Y + this.ch / 2 / ze);
      const x0 = clamp(Math.floor(Math.min(c0.x, top.x)), 0, MAP), x1 = clamp(Math.ceil(Math.max(c1.x, bot.x)), 0, MAP), y0 = clamp(Math.floor(Math.min(c1.y, top.y)), 0, MAP), y1 = clamp(Math.ceil(Math.max(c0.y, bot.y)), 0, MAP);
      this.setIso(ctx); ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    }
    this.drawGroundOverlays(ctx);
    const margin = 600 * ze;
    for (const p of this.order) {
      const it = LIBRARY[p.item], k = p.scale * ze, s = this.screen(p.x, p.y), ax = (p.flip ? it.w - it.ax : it.ax) * k;
      const x = s.x - ax, y = s.y - it.ay * k, w = it.w * k, h = it.h * k;
      if (x + w < -margin || y + h < -margin || x > this.cw + margin || y > this.ch + margin) continue;
      const img = this.images[p.item]; if (!img.naturalWidth) continue;
      if (!it.big && it.kind !== 'fencex' && it.kind !== 'fencey') {
        const fw = (p.x1 - p.x0), fh = (p.y1 - p.y0), c = this.screen((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(2, (fw + fh) / 2 * HW * ze * 0.75), Math.max(1, (fw + fh) / 2 * HH * ze * 0.75), 0, 0, Math.PI * 2); ctx.fill();
      }
      if (p === this.selected || p === this.hoverProp) {
        this.setIso(ctx); ctx.beginPath(); ctx.rect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = p === this.selected ? 'rgba(255,190,60,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = p === this.selected ? '#ffbe3c' : 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      }
      if (p.flip) { ctx.save(); ctx.translate(x + w, y); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, w, h); ctx.restore(); }
      else ctx.drawImage(img, x, y, w, h);
    }
    if (this.tool === 'objects' && this.hover && !this.dragging) {
      const it = LIBRARY[this.libIndex], k = this.placeScale, f = this.footprint(it, this.hover.x, this.hover.y, this.flip, k), ok = !this.placeError;
      this.setIso(ctx); ctx.beginPath(); ctx.rect(f.x0, f.y0, f.x1 - f.x0, f.y1 - f.y0); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = ok ? 'rgba(90,220,120,0.3)' : 'rgba(240,70,60,0.35)'; ctx.fill(); ctx.strokeStyle = ok ? '#6ee7a0' : '#f87171'; ctx.lineWidth = 2; ctx.stroke();
      const img = this.images[this.libIndex], s = this.screen(this.hover.x, this.hover.y), kk = k * ze, ax = (this.flip ? it.w - it.ax : it.ax) * kk;
      ctx.globalAlpha = ok ? 0.8 : 0.45;
      if (img.naturalWidth) { if (this.flip) { ctx.save(); ctx.translate(s.x - ax + it.w * kk, s.y - it.ay * kk); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, it.w * kk, it.h * kk); ctx.restore(); } else ctx.drawImage(img, s.x - ax, s.y - it.ay * kk, it.w * kk, it.h * kk); }
      ctx.globalAlpha = 1;
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
    } else if (this.tool === 'terrain' && this.hover) {
      const r = this.brush, cx = Math.floor(this.hover.x), cy = Math.floor(this.hover.y);
      this.setIso(ctx); ctx.beginPath();
      for (let y = cy - r + 1; y <= cy + r - 1; y++) for (let x = cx - r + 1; x <= cx + r - 1; x++) { if (r > 1 && Math.hypot(x + 0.5 - this.hover.x, y + 0.5 - this.hover.y) > r - 0.3) continue; ctx.rect(x, y, 1, 1); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

// alpha sampling for picking (cached, small)
const alphaCache = new WeakMap<HTMLImageElement, { w: number; h: number; data: Uint8ClampedArray }>();
function sampleAlpha(img: HTMLImageElement, u: number, v: number) {
  let e = alphaCache.get(img);
  if (!e) {
    const w = Math.min(96, img.naturalWidth), h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, h);
    e = { w, h, data: g.getImageData(0, 0, w, h).data }; alphaCache.set(img, e);
  }
  const x = clamp(Math.floor(u * e.w), 0, e.w - 1), y = clamp(Math.floor(v * e.h), 0, e.h - 1);
  return e.data[(y * e.w + x) * 4 + 3];
}
