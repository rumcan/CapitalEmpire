import { GRASS_SURFACES, GROUND_MATERIALS, type GrassSurface, type GrassCondition } from './catalog';
/** Care operations; amounts are normalized 0..1, mowing angle in degrees. */
export type GrassAction = 'mow' | 'water' | 'fertilise' | 'aerate' | 'seed' | 'sod' | 'repair';
/** Daily weather: rain/evaporation in normalized soil capacity per day, temperature in Celsius. */
export interface GrassWeather { rain: number; evaporation: number; temperature: number }
/** Local tile-space selection, optionally restricted to a registered polygon key. */
export interface GrassScope { x: number; y: number; radius: number; zone?: string }
/** Reusable worker-ready cell descriptor, normalized state except tile coordinates and angle in degrees. */
export interface GrassCellView { id: number; active: boolean; x: number; y: number; size: number; surface: GrassSurface; condition: GrassCondition; material: string; health: number; coverage: number; moisture: number; nutrients: number; compaction: number; growth: number; foot: number; carts: number; divots: number; divotX: number; divotY: number; angle: number; repair: number }
/** Versioned independent save field; paint tuple slots remain unchanged. */
export interface GrassSave { v: 1; size: number; cell: number; days: number; settings: GrassSettings; cells: number[][] }
/** Owner controls, saved with the maintenance state. Rates multiply daily recovery and local wear. */
export interface GrassSettings { enabled: boolean; strength: number; recovery: number; wear: number; rain: number; evaporation: number; temperature: number; material: string; mowing: boolean }
/** Care cost in dollars per 8 m cell at full dose; other cell sizes scale by area. */
export const GRASS_COST: Record<GrassAction, number> = { mow: 2, water: 1, fertilise: 3, aerate: 4, seed: 6, sod: 28, repair: 5 };
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
const defaults = (): GrassSettings => ({ enabled: true, strength: 0, recovery: 1, wear: 1, rain: 0.06, evaporation: 0.035, temperature: 20, material: 'auto', mowing: false });
const bands: GrassCondition[] = ['neglected', 'stressed', 'recovering', 'maintained', 'pristine'];
/** Whether a tile-space point lies inside a polygon, including its boundary. */
export function grassContains(pts: readonly number[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const ax = pts[j], ay = pts[j + 1], bx = pts[i], by = pts[i + 1], cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-8 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) hit = !hit;
  }
  return hit;
}
/** Exact polygon/cell intersection, retaining thin diagonal turf and cell-edge slivers. */
function intersects(pts: readonly number[], x: number, y: number, size: number): boolean {
  if (grassContains(pts, x, y) || grassContains(pts, x + size, y) || grassContains(pts, x, y + size) || grassContains(pts, x + size, y + size)) return true;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const ax = pts[j], ay = pts[j + 1], dx = pts[i] - ax, dy = pts[i + 1] - ay;
    let lo = 0, hi = 1;
    if (dx === 0) { if (ax < x || ax > x + size) continue; }
    else { const a = (x - ax) / dx, b = (x + size - ax) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (dy === 0) { if (ay < y || ay > y + size) continue; }
    else { const a = (y - ay) / dy, b = (y + size - ay) / dy; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (lo <= hi) return true;
  }
  return false;
}
/** Deterministic coarse grass grid. Map units are 2 m tiles; default cells are 4 tiles (8 m). Only registered turf evolves. */
export class GrassManagement {
  readonly cell: number; readonly size: number; readonly side: number;
  settings = defaults(); days = 0;
  private zones = new Map<string, { pts: number[]; surface: GrassSurface; cells: number[] }>();
  private owners = new Map<number, Set<string>>();
  private refs: Uint16Array; private initialized: Uint8Array; private surface: Uint8Array;
  private data: Float32Array[]; private dirty: Uint8Array; private queue: Int32Array; private queued = 0;
  private live: Int32Array; private count = 0; private views: (GrassCellView | undefined)[];
  /** Construct bounded grids up to the game's 2048 tile map. */
  constructor(size = 2048, cell = 4) {
    this.size = Math.floor(clamp(size, 4, 2048)); this.cell = Math.floor(clamp(cell, 1, 32)); this.side = Math.ceil(this.size / this.cell);
    const n = this.side * this.side;
    this.refs = new Uint16Array(n); this.initialized = new Uint8Array(n); this.surface = new Uint8Array(n); this.data = Array.from({ length: 13 }, () => new Float32Array(n));
    this.dirty = new Uint8Array(n); this.queue = new Int32Array(n); this.live = new Int32Array(n); this.views = new Array(n);
  }
  /** Registered polygon keys, suitable for area controls. */
  get zoneKeys(): string[] { return [...this.zones.keys()]; }
  /** Current number of registered cells. */
  get activeCells(): number { let n = 0; for (let k = 0; k < this.count; k++) if (this.refs[this.live[k]]) n++; return n; }
  /** Re-send current appearances after changing overlay controls; no condition changes. */
  refresh(): void { for (let k = 0; k < this.count; k++) if (this.refs[this.live[k]]) this.mark(this.live[k]); }
  /** Clamp and persist independent tuning; auto chooses appearance from local condition, explicit material is a visual override. */
  configure(patch: Partial<GrassSettings>): void { const o = { ...this.settings, ...patch }; this.settings = { enabled: o.enabled !== false, strength: clamp(o.strength), recovery: clamp(o.recovery, 0, 5), wear: clamp(o.wear, 0, 10), rain: clamp(o.rain, 0, 2), evaporation: clamp(o.evaporation, 0, 2), temperature: clamp(o.temperature, -30, 60), material: GROUND_MATERIALS.some(m => m.id === o.material) ? o.material : 'auto', mowing: o.mowing === true }; this.refresh(); }
  private mark(i: number) { if (!this.dirty[i]) { this.dirty[i] = 1; this.queue[this.queued++] = i; } }
  private init(i: number, condition: GrassCondition = 'neglected') {
    if (this.initialized[i]) return;
    this.initialized[i] = 1; this.live[this.count++] = i;
    // Callers can preserve a healthy existing preset; deliberately neglected starter turf still needs care.
    const score = condition === 'pristine' ? 0.99 : condition === 'maintained' ? 0.9 : condition === 'recovering' ? 0.8 : condition === 'stressed' ? 0.65 : 0.6;
    this.data[0][i] = score; this.data[1][i] = Math.min(1, score + 0.05); this.data[2][i] = score > 0.8 ? 0.6 : 0.42; this.data[3][i] = score > 0.8 ? 0.7 : 0.38; this.data[4][i] = score > 0.8 ? 0.08 : 0.25; this.data[5][i] = score > 0.8 ? 0.15 : 0.55;
  }
  /** Add/change a turf polygon, preserving care at unchanged locations. Empty/invalid polygons remove it. */
  register(key: string, pts: readonly number[], surface: GrassSurface, initial?: GrassCondition): void {
    const old = this.zones.get(key);
    if (old && old.surface === surface && old.pts.length === pts.length && old.pts.every((v, i) => v === pts[i])) return;
    this.remove(key);
    if (pts.length < 6 || pts.length > 2000 || pts.length % 2 || !pts.every(Number.isFinite) || !GRASS_SURFACES.includes(surface)) return;
    let x0 = this.size, y0 = this.size, x1 = 0, y1 = 0;
    for (let k = 0; k < pts.length; k += 2) { x0 = Math.min(x0, pts[k]); y0 = Math.min(y0, pts[k + 1]); x1 = Math.max(x1, pts[k]); y1 = Math.max(y1, pts[k + 1]); }
    const cells: number[] = [], c = this.cell;
    for (let y = Math.max(0, Math.floor(y0 / c)); y < Math.min(this.side, Math.ceil(y1 / c)); y++) for (let x = Math.max(0, Math.floor(x0 / c)); x < Math.min(this.side, Math.ceil(x1 / c)); x++) {
      if (!intersects(pts, x * c, y * c, c)) continue;
      const i = y * this.side + x; this.init(i, initial); this.refs[i]++; this.surface[i] = GRASS_SURFACES.indexOf(surface); cells.push(i); this.mark(i);
      let owners = this.owners.get(i); if (!owners) this.owners.set(i, owners = new Set()); owners.add(key);
    }
    this.zones.set(key, { pts: [...pts], surface, cells });
  }
  /** Remove a polygon; cells with no other turf owner stop evolving and send a local removal. */
  remove(key: string): void { const z = this.zones.get(key); if (!z) return; this.zones.delete(key); for (const i of z.cells) { this.refs[i]--; const owners = this.owners.get(i); owners?.delete(key); for (const k of owners ?? []) { const other = this.zones.get(k); if (other) this.surface[i] = GRASS_SURFACES.indexOf(other.surface); } this.mark(i); } }
  /** Original tile polygon for the local selection preview, never mutated by the grid. */
  polygon(key: string): readonly number[] | undefined { return this.zones.get(key)?.pts; }
  /** Topmost registered turf under a tile point; coarse candidates, then exact polygon containment. */
  zoneAt(x: number, y: number): string | undefined { if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x >= this.size || y >= this.size) return; const i = Math.floor(y / this.cell) * this.side + Math.floor(x / this.cell); let key: string | undefined; for (const k of this.owners.get(i) ?? []) { const z = this.zones.get(k); if (z && grassContains(z.pts, x, y)) key = k; } return key; }
  /** Clear all state for a new valley. */
  clear(): void { for (let k = 0; k < this.count; k++) { const i = this.live[k]; this.refs[i] = 0; this.mark(i); } this.zones.clear(); this.owners.clear(); this.initialized.fill(0); for (const a of this.data) a.fill(0); this.count = 0; this.days = 0; this.settings = defaults(); }
  private select(s: GrassScope, visit: (i: number) => void): number {
    if (![s.x, s.y, s.radius].every(Number.isFinite) || s.radius < 0) return 0;
    const c = this.cell, r = Math.min(this.size * 2, s.radius), zone = s.zone ? this.zones.get(s.zone) : undefined;
    if (s.zone && !zone) return 0;
    let n = 0;
    const touch = (i: number) => { const x = i % this.side * c, y = Math.floor(i / this.side) * c; if (this.refs[i] && (zone || Math.hypot(Math.max(x - s.x, 0, s.x - x - c), Math.max(y - s.y, 0, s.y - y - c)) <= r)) { visit(i); n++; } };
    if (zone) for (const i of zone.cells) touch(i);
    else for (let y = Math.max(0, Math.floor((s.y - r) / c)); y < Math.min(this.side, Math.floor((s.y + r) / c) + 1); y++) for (let x = Math.max(0, Math.floor((s.x - r) / c)); x < Math.min(this.side, Math.floor((s.x + r) / c) + 1); x++) touch(y * this.side + x);
    return n;
  }
  /** Quote care before spending; no state changes. Dollars, adjusted for actual cell area. */
  quote(action: GrassAction, scope: GrassScope, amount = 1): number { return !this.settings.enabled || typeof GRASS_COST[action] !== 'number' ? 0 : Math.ceil(this.select(scope, () => {}) * GRASS_COST[action] * this.cell ** 2 / 16 * clamp(amount)); }
  /** Apply care to selected turf. Returns affected cell count; no care spills into other cells. */
  apply(action: GrassAction, scope: GrassScope, amount = 1, angle = 0): number {
    if (!this.settings.enabled || typeof GRASS_COST[action] !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
    const a = clamp(amount), d = this.data;
    return this.select(scope, i => {
      if (action === 'water') d[2][i] = clamp(d[2][i] + 0.45 * a);
      if (action === 'fertilise') d[3][i] = clamp(d[3][i] + 0.45 * a);
      if (action === 'aerate') { d[4][i] *= 1 - 0.7 * a; d[10][i] = 0.8; }
      if (action === 'mow') { d[5][i] *= 1 - 0.85 * a; d[9][i] = ((Number.isFinite(angle) ? angle : 0) % 180 + 180) % 180; if (d[2][i] < 0.15) d[0][i] *= 0.95; }
      if (action === 'seed') { d[10][i] = 1; d[3][i] = clamp(d[3][i] + 0.1 * a); }
      if (action === 'sod') { d[1][i] = clamp(d[1][i] + 0.8 * a); d[0][i] = Math.max(d[0][i], 0.85 * a); d[8][i] *= 1 - a; d[10][i] = 0.7; }
      if (action === 'repair') { d[8][i] *= 1 - a; d[6][i] *= 1 - 0.8 * a; d[7][i] *= 1 - 0.8 * a; d[10][i] = 1; }
      this.mark(i);
    });
  }
  /** A bounded local traffic stroke in tiles; count is actual passages, not simulated customers. Kind divot represents an actual turf strike. */
  traffic(x0: number, y0: number, x1: number, y1: number, count = 1, kind: 'foot' | 'cart' | 'divot' = 'foot', radius = 0.5): void {
    if (!this.settings.enabled || ![x0, y0, x1, y1, count, radius].every(Number.isFinite) || count <= 0 || radius < 0 || !['foot', 'cart', 'divot'].includes(kind)) return;
    const c = this.cell, r = Math.min(16, radius), dx = x1 - x0, dy = y1 - y0, len = dx * dx + dy * dy, d = this.data;
    if (len > 128 ** 2) return; // Long teleports/replans are not traversed turf.
    for (let y = Math.max(0, Math.floor((Math.min(y0, y1) - r) / c)); y < Math.min(this.side, Math.floor((Math.max(y0, y1) + r) / c) + 1); y++) for (let x = Math.max(0, Math.floor((Math.min(x0, x1) - r) / c)); x < Math.min(this.side, Math.floor((Math.max(x0, x1) + r) / c) + 1); x++) {
      const i = y * this.side + x; if (!this.refs[i]) continue;
      if (kind === 'divot' && (x !== Math.floor(x0 / c) || y !== Math.floor(y0 / c))) continue;
      const px = x * c + c / 2, py = y * c + c / 2, t = clamp(((px - x0) * dx + (py - y0) * dy) / (len || 1));
      if (Math.hypot(px - x0 - dx * t, py - y0 - dy * t) > r + c * 0.71) continue;
      if (!this.zoneAt(x0 + dx * t, y0 + dy * t)) continue;
      const wear = clamp(count, 0, 10000) * (kind === 'cart' ? 0.015 : kind === 'divot' ? 0.04 : 0.001) * clamp(this.settings.wear, 0, 10) * (1 + Math.max(0, d[2][i] - 0.7) * 3);
      d[kind === 'cart' ? 7 : kind === 'divot' ? 8 : 6][i] = clamp(d[kind === 'cart' ? 7 : kind === 'divot' ? 8 : 6][i] + wear);
      if (kind === 'divot') { d[11][i] = x0; d[12][i] = y0; }
      d[4][i] = clamp(d[4][i] + wear * 0.6); d[1][i] = clamp(d[1][i] - wear * 0.3); d[0][i] = clamp(d[0][i] - wear * 0.15); this.mark(i);
    }
  }
  /** Advance days under constant weather in bounded half-day steps; no allocations or random draws in cell loops. */
  step(days: number, weather: GrassWeather = this.settings): void {
    if (!this.settings.enabled || !Number.isFinite(days) || days <= 0) return;
    const total = Math.min(days, 366), steps = Math.ceil(total * 2), dt = total / steps, d = this.data;
    const rain = clamp(weather.rain, 0, 2), evap = clamp(weather.evaporation, 0, 2), temp = clamp(weather.temperature, -30, 60), recovery = clamp(this.settings.recovery, 0, 5);
    for (let s = 0; s < steps; s++) for (let k = 0; k < this.count; k++) {
      const i = this.live[k]; if (!this.refs[i]) continue;
      const before = this.visualKey(i);
      d[2][i] = clamp(d[2][i] + dt * (rain * (1 - 0.6 * d[4][i]) - evap * (0.5 + Math.max(0, temp) / 30)));
      const water = clamp(1 - Math.abs(d[2][i] - 0.6) * 2), warmth = clamp(1 - Math.abs(temp - 20) / 25), vigor = water * warmth * (0.2 + d[3][i] * 0.8) * (1 - d[4][i] * 0.8);
      d[0][i] = clamp(d[0][i] + dt * (0.045 * vigor * recovery - 0.04 * (1 - water) - 0.015 * d[4][i]));
      d[1][i] = clamp(d[1][i] + dt * (0.025 * vigor * d[0][i] * recovery * (1 + d[10][i] * 3) - 0.02 * (1 - water)));
      d[3][i] = clamp(d[3][i] - dt * 0.003 * vigor); d[4][i] = clamp(d[4][i] - dt * 0.001 * recovery);
      d[5][i] = clamp(d[5][i] + dt * 0.035 * vigor); const heal = dt * 0.025 * vigor * recovery;
      for (let j = 6; j <= 8; j++) d[j][i] = clamp(d[j][i] - heal * (1 + d[10][i]));
      d[10][i] = clamp(d[10][i] - dt / 30); if (before !== this.visualKey(i)) this.mark(i);
    }
    this.days += total;
  }
  private visualKey(i: number): number { const d = this.data; return Math.floor(d[0][i] * 20) + Math.floor(d[1][i] * 20) * 32 + Math.floor(d[5][i] * 10) * 1024 + Math.floor((d[6][i] + d[7][i] + d[8][i]) * 20) * 16384 + Math.floor(d[10][i] * 10) * 1048576; }
  private view(i: number): GrassCellView {
    const v = this.views[i] ?? (this.views[i] = {} as GrassCellView), d = this.data, score = Math.min(d[0][i], d[1][i]) - d[4][i] * 0.12 - d[8][i] * 0.1 - Math.max(0, d[5][i] - 0.35) * 0.18;
    const band = score < 0.5 ? 0 : score < 0.68 ? 1 : score < 0.83 ? 2 : score < 0.94 ? 3 : 4;
    v.id = i; v.active = this.refs[i] > 0; v.x = i % this.side * this.cell; v.y = Math.floor(i / this.side) * this.cell; v.size = this.cell; v.surface = GRASS_SURFACES[this.surface[i]]; v.condition = bands[band]; v.material = this.settings.material === 'auto' ? `${v.surface}-${v.condition}` : this.settings.material;
    v.health = d[0][i]; v.coverage = d[1][i]; v.moisture = d[2][i]; v.nutrients = d[3][i]; v.compaction = d[4][i]; v.growth = d[5][i]; v.foot = d[6][i]; v.carts = d[7][i]; v.divots = d[8][i]; v.angle = d[9][i]; v.repair = d[10][i]; v.divotX = d[11][i]; v.divotY = d[12][i]; return v;
  }
  /** Inspect a cell without allocating after first use; returned descriptor is reused. */
  at(x: number, y: number): GrassCellView | null { if (![x, y].every(Number.isFinite) || x < 0 || y < 0 || x >= this.size || y >= this.size) return null; const i = Math.floor(y / this.cell) * this.side + Math.floor(x / this.cell); return this.refs[i] ? this.view(i) : null; }
  /** Drain changed cells into a reusable list. Worker consumers derive local dirty boxes from x/y/size. */
  drain(out: GrassCellView[]): number { out.length = this.queued; for (let k = 0; k < this.queued; k++) { const i = this.queue[k]; out[k] = this.view(i); this.dirty[i] = 0; } this.queued = 0; return out.length; }
  /** Serialize only managed cells; legacy saves without this field start at the default condition. */
  serialize(): GrassSave { const cells: number[][] = []; for (let k = 0; k < this.count; k++) { const i = this.live[k]; if (this.refs[i]) cells.push([i, this.surface[i], ...this.data.map(a => a[i])]); } return { v: 1, size: this.size, cell: this.cell, days: this.days, settings: { ...this.settings }, cells }; }
  /** Load state with bounded/clamped numbers; registration of current polygons decides which saved cells are active. */
  load(raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as GrassSave; if (s.v !== 1 || s.size !== this.size || s.cell !== this.cell || !Array.isArray(s.cells)) return;
    this.days = clamp(s.days, 0, 1e8); const o = s.settings;
    if (o && typeof o === 'object') { this.settings = defaults(); this.configure(o); }
    for (let k = 0; k < Math.min(s.cells.length, this.refs.length); k++) { const row = s.cells[k]; if (!Array.isArray(row) || (row.length !== 13 && row.length !== 15) || !Number.isInteger(row[0]) || row[0] < 0 || row[0] >= this.refs.length) continue; const i = row[0]; this.init(i); this.surface[i] = Math.floor(clamp(row[1], 0, GRASS_SURFACES.length - 1)); for (let j = 0; j < 13; j++) this.data[j][i] = clamp(row[j + 2], 0, j >= 11 ? this.size : j === 9 ? 180 : 1); this.mark(i); }
  }
}
