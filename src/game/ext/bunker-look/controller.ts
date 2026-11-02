import { CELL_T, SURF, type Grid } from '../course-grid';
import { clampBunkerSettings, fromSavedBunkerSettings, readBunkerSettings, toSavedBunkerSettings, type BunkerSettings } from './settings';

/** Integer world coordinates of a 1 m grid cell, independent of grid origin/size. */
export type BunkerCell = readonly [number, number];
export interface BunkerComponent {
  readonly id: string;
  readonly seed: BunkerCell;
  readonly cells: readonly BunkerCell[];
  readonly boundsTiles: readonly [number, number, number, number];
  readonly mode: 'default' | 'custom';
  readonly settings: Readonly<BunkerSettings>;
}
export type BunkerSelection = BunkerComponent;
export interface BunkerMark { seed: [number, number]; settings: BunkerSettings }
/** Only custom component anchors are saved; inherited components have no copied settings. */
/** sparse: defaults holds only what differs from the code's defaults (absent: an older save with every value, migrated on load) */
export interface BunkerState { version: 1; defaults: BunkerSettings; custom: BunkerMark[]; sparse?: true }
export interface BunkerControllerOptions {
  changed?(components: readonly BunkerComponent[]): void;
  emit?(): void;
  save?(): void;
  /** The host may record serialize()/load() around the synchronous mutation for undo. */
  transaction?(label: string, mutate: () => void): void;
}

interface Component {
  id: string;
  seed: BunkerCell;
  cells: readonly BunkerCell[];
  boundsTiles: readonly [number, number, number, number];
  custom?: BunkerSettings;
  customSeed?: BunkerCell;
}
const cellKey = (x: number, y: number) => `${x},${y}`;
const componentId = (seed: BunkerCell) => `bunker:${seed[0]}:${seed[1]}`;
const compareCells = (a: BunkerCell, b: BunkerCell) => a[1] - b[1] || a[0] - b[0];
const sameSettings = (a: Readonly<BunkerSettings>, b: Readonly<BunkerSettings>) => JSON.stringify(a) === JSON.stringify(b);
const customMarksKey = (components: readonly Component[]) => JSON.stringify(components.filter(component => component.custom).map(component => ({ seed: component.seed, settings: component.custom })));

/**
 * Component identity and saved profiles for the real 1 m course grid.
 * Topology scans happen only when grid identity/rev changes. Profile edits reuse
 * the cell registry; frame, camera and UI reads never flood-fill the course.
 */
export class BunkerController {
  private grid: Grid | null = null;
  private gridRev = -1;
  private list: Component[] = [];
  private rawList: Component[] = [];
  private joinSignature = '';
  private owners = new Map<string, Component>();
  private views: readonly BunkerComponent[] = Object.freeze([]);
  private selected: string | null = null;
  private defaultSettings: Readonly<BunkerSettings> = Object.freeze(clampBunkerSettings(undefined));
  private pendingMarks: BunkerMark[] | null = null;
  private version = 0;
  private profileVersion = 0;
  private scans = 0;

  constructor(private readonly options: BunkerControllerOptions = {}) {}

  get defaults(): Readonly<BunkerSettings> { return this.defaultSettings; }
  get components(): readonly BunkerComponent[] { return this.views; }
  get selection(): BunkerSelection | null { return this.views.find(component => component.id === this.selected) ?? null; }
  get revision(): number { return this.version; }
  get stats() { return { gridScans: this.scans, profileRevision: this.profileVersion, revision: this.version, components: this.list.length, customComponents: this.list.filter(component => component.custom).length }; }

  /** World-tile lookup in the cached registry; hole ownership never splits continuous sand. */
  componentAt(tile: { x: number; y: number }): BunkerComponent | null {
    if (!Number.isFinite(tile.x) || !Number.isFinite(tile.y)) return null;
    const owner = this.owners.get(cellKey(Math.floor(tile.x / CELL_T), Math.floor(tile.y / CELL_T)));
    return owner ? this.views.find(component => component.id === owner.id) ?? null : null;
  }

  selectAt(tile: { x: number; y: number }): boolean {
    this.reconcile(this.grid);
    const component = this.componentAt(tile), next = component?.id ?? null;
    if (this.selected !== next) { this.selected = next; this.options.emit?.(); }
    return !!component;
  }

  clearSelection(): void {
    if (this.selected !== null) { this.selected = null; this.options.emit?.(); }
  }

  setDefaults(update: Partial<BunkerSettings>): void {
    const next = clampBunkerSettings(update, this.defaultSettings);
    if (sameSettings(next, this.defaultSettings)) return;
    this.edit('bunker defaults', () => { this.defaultSettings = Object.freeze(next); });
  }

  setMode(mode: 'default' | 'custom'): void {
    const component = this.list.find(item => item.id === this.selected);
    if (!component || (mode === 'custom') === !!component.custom) return;
    this.edit(`bunker ${mode}`, () => {
      if (mode === 'default') { delete component.custom; delete component.customSeed; }
      else { component.custom = clampBunkerSettings(this.defaultSettings); component.customSeed = component.seed; }
    });
  }

  setSelectedSettings(update: Partial<BunkerSettings>): void {
    const component = this.list.find(item => item.id === this.selected);
    if (!component) return;
    const next = clampBunkerSettings(update, component.custom ?? this.defaultSettings);
    if (component.custom && sameSettings(next, component.custom)) return;
    this.edit('bunker settings', () => { component.custom = next; component.customSeed = component.seed; });
  }

  /** Exact unwarped native contours may close a gap between raw cell components. */
  setRenderedJoins(joins: readonly (readonly string[])[], gridRevision: number): boolean {
    if (!this.grid || gridRevision !== this.grid.rev || gridRevision !== this.gridRev) return false;
    const parent = new Map(this.rawList.map(component => [component.id, component.id]));
    const find = (id: string): string => { const p = parent.get(id)!; if (p === id) return p; const root = find(p); parent.set(id, root); return root; };
    for (const join of joins) {
      const ids = join.filter(id => parent.has(id));
      for (let i = 1; i < ids.length; i++) parent.set(find(ids[i]), find(ids[0]));
    }
    const sets = new Map<string, Component[]>();
    for (const component of this.rawList) { const root = find(component.id), set = sets.get(root); if (set) set.push(component); else sets.set(root, [component]); }
    const signature = [...sets.values()].filter(set => set.length > 1).map(set => set.map(component => component.id).sort().join('|')).sort().join(';');
    if (signature === this.joinSignature) return false;
    this.joinSignature = signature;
    const previousCustomMarks = customMarksKey(this.list);
    const selected = this.list.find(component => component.id === this.selected);
    let profilesChanged = false;
    const next = [...sets.values()].map(set => {
      if (set.length === 1) return set[0];
      const custom = set.filter(component => component.custom).sort((a, b) => compareCells(a.customSeed ?? a.seed, b.customSeed ?? b.seed) || compareCells(a.seed, b.seed))[0];
      const cells = Object.freeze(set.flatMap(component => [...component.cells]).sort(compareCells));
      const preferred = custom?.customSeed ?? set.slice().sort((a, b) => compareCells(a.seed, b.seed))[0].seed;
      const seed = cells.find(cell => cell[0] === preferred[0] && cell[1] === preferred[1]) ?? cells[0];
      const component: Component = { id: componentId(seed), seed, cells,
        boundsTiles: Object.freeze([Math.min(...set.map(item => item.boundsTiles[0])), Math.min(...set.map(item => item.boundsTiles[1])), Math.max(...set.map(item => item.boundsTiles[2])), Math.max(...set.map(item => item.boundsTiles[3]))]),
        ...(custom?.custom ? { custom: { ...custom.custom }, customSeed: custom.customSeed ?? custom.seed } : {}) };
      for (const raw of set) if (component.custom) {
        if (!raw.custom || !sameSettings(raw.custom, component.custom)) profilesChanged = true;
        raw.custom = { ...component.custom }; raw.customSeed = component.customSeed;
      }
      return component;
    });
    this.list = next.sort((a, b) => compareCells(a.seed, b.seed));
    this.owners = new Map();
    for (const component of this.list) for (const cell of component.cells) this.owners.set(cellKey(...cell), component);
    if (selected) this.selected = this.owners.get(cellKey(...selected.seed))?.id ?? null;
    if (profilesChanged) this.profileVersion++;
    this.version++; this.refreshViews(); this.notify(profilesChanged || previousCustomMarks !== customMarksKey(this.list));
    return true;
  }

  /**
   * Match every surviving old sand cell. Splits retain their custom snapshot;
   * merges use the lowest previous custom seed (row then column). A seed remains
   * stable while present and reanchors inside the surviving component if erased.
   */
  reconcile(grid: Grid | null | undefined): boolean {
    const next = grid ?? null;
    if (next === this.grid && (!next || next.rev === this.gridRev)) return false;
    this.rebuild(next);
    this.notify(false);
    return true;
  }

  serialize(): BunkerState {
    this.reconcile(this.grid);
    const custom = this.pendingMarks ?? this.list.filter(component => component.custom).map(component => ({ seed: [...component.seed] as [number, number], settings: component.custom! }));
    return { version: 1, sparse: true, defaults: toSavedBunkerSettings(this.defaultSettings) as BunkerSettings, custom: custom.map(mark => ({ seed: [...mark.seed], settings: { ...mark.settings } })) };
  }

  /** Call with the loaded grid; without a grid argument this also restores host undo snapshots. */
  load(value: unknown, grid: Grid | null | undefined = this.grid): void {
    const input = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
    const supported = input?.version === 1;
    this.defaultSettings = Object.freeze(clampBunkerSettings(supported ? (input.sparse === true ? input.defaults : fromSavedBunkerSettings(input.defaults)) : undefined));
    this.pendingMarks = supported ? readMarks(input.custom) : [];
    // Rebuilding on load must use saved anchors, never accidentally inherit the
    // profiles that happened to be resident before a different save/undo state.
    const oldSelection = this.list.find(component => component.id === this.selected);
    this.list = []; this.rawList = []; this.owners.clear(); this.selected = null;
    this.rebuild(grid ?? null);
    if (oldSelection) {
      this.selected = this.owners.get(cellKey(...oldSelection.seed))?.id ?? null;
      if (!this.selected) for (const cell of oldSelection.cells) {
        const component = this.owners.get(cellKey(...cell));
        if (component) { this.selected = component.id; break; }
      }
    }
    this.profileVersion++;
    this.notify(false);
  }

  private edit(label: string, mutate: () => void): void {
    let changed = false;
    const apply = () => {
      mutate(); changed = true;
      for (const raw of this.rawList) {
        const owner = this.owners.get(cellKey(...raw.seed));
        if (owner?.custom) { raw.custom = { ...owner.custom }; raw.customSeed = owner.customSeed ?? owner.seed; }
        else { delete raw.custom; delete raw.customSeed; }
      }
      this.profileVersion++; this.version++; this.refreshViews();
    };
    if (this.options.transaction) this.options.transaction(label, apply); else apply();
    if (changed) this.notify(true);
  }

  private rebuild(grid: Grid | null): void {
    const oldOwners = this.owners, oldSelected = this.list.find(component => component.id === this.selected);
    const nextOwners = new Map<string, Component>(), components: Component[] = [];
    const visited = new Set<number>();
    if (grid) {
      this.scans++;
      const ox = Math.round(grid.x0 / CELL_T), oy = Math.round(grid.y0 / CELL_T);
      for (let start = 0; start < grid.surf.length; start++) {
        if (grid.surf[start] !== SURF.bunker || visited.has(start)) continue;
        const queue = [start], cells: BunkerCell[] = [], overlaps = new Set<Component>(), keys = new Set<string>();
        visited.add(start);
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let at = 0; at < queue.length; at++) {
          const index = queue[at], cx = index % grid.w, cy = Math.floor(index / grid.w), x = ox + cx, y = oy + cy;
          const cell = Object.freeze([x, y] as [number, number]), key = cellKey(x, y);
          cells.push(cell); keys.add(key);
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
          const old = oldOwners.get(key); if (old) overlaps.add(old);
          const visit = (next: number) => { if (grid.surf[next] === SURF.bunker && !visited.has(next)) { visited.add(next); queue.push(next); } };
          if (cx > 0) visit(index - 1); if (cx + 1 < grid.w) visit(index + 1);
          if (cy > 0) visit(index - grid.w); if (cy + 1 < grid.h) visit(index + grid.w);
        }
        cells.sort(compareCells);
        const previous = [...overlaps].sort((a, b) => compareCells(a.seed, b.seed));
        const customOwner = previous.find(component => component.custom);
        const preferred = customOwner && keys.has(cellKey(...customOwner.seed)) ? customOwner : previous.find(component => keys.has(cellKey(...component.seed)));
        const seed = preferred?.seed ?? cells[0];
        const component: Component = {
          id: componentId(seed), seed, cells: Object.freeze(cells),
          boundsTiles: Object.freeze([x0 * CELL_T, y0 * CELL_T, (x1 + 1) * CELL_T, (y1 + 1) * CELL_T]),
          ...(customOwner?.custom ? { custom: { ...customOwner.custom }, customSeed: customOwner.customSeed ?? customOwner.seed } : {}),
        };
        components.push(component);
        for (const cell of cells) nextOwners.set(cellKey(...cell), component);
      }
    }
    components.sort((a, b) => compareCells(a.seed, b.seed));
    this.grid = grid; this.gridRev = grid?.rev ?? -1; this.list = components; this.rawList = components.slice(); this.joinSignature = ''; this.owners = nextOwners;
    if (grid && this.pendingMarks) {
      for (const mark of this.pendingMarks) {
        const component = nextOwners.get(cellKey(...mark.seed));
        // Marks are sorted; an old merge with multiple anchors has a stable winner.
        if (component && !component.custom) {
          component.custom = { ...mark.settings };
          component.seed = Object.freeze([...mark.seed] as [number, number]);
          component.customSeed = component.seed;
          component.id = componentId(component.seed);
        }
      }
      this.pendingMarks = null;
      components.sort((a, b) => compareCells(a.seed, b.seed));
    }
    if (oldSelected) {
      this.selected = nextOwners.get(cellKey(...oldSelected.seed))?.id ?? null;
      if (!this.selected) {
        for (const cell of oldSelected.cells) { const component = nextOwners.get(cellKey(...cell)); if (component) { this.selected = component.id; break; } }
      }
    } else if (!components.some(component => component.id === this.selected)) this.selected = null;
    this.version++;
    this.refreshViews();
  }

  private refreshViews(): void {
    this.views = Object.freeze(this.list.map(component => Object.freeze({
      id: component.id, seed: component.seed, cells: component.cells, boundsTiles: component.boundsTiles,
      mode: component.custom ? 'custom' as const : 'default' as const,
      settings: Object.freeze({ ...(component.custom ?? this.defaultSettings) }),
    })));
  }

  private notify(persist: boolean): void {
    this.options.changed?.(this.views);
    if (persist) this.options.save?.();
    this.options.emit?.();
  }
}

function readMarks(value: unknown): BunkerMark[] {
  if (!Array.isArray(value)) return [];
  const marks: BunkerMark[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const input = candidate as Record<string, unknown>, seed = input.seed;
    const settings = readBunkerSettings(input.settings);
    if (!Array.isArray(seed) || seed.length !== 2 || !seed.every(Number.isSafeInteger) || !settings) continue;
    marks.push({ seed: [seed[0] as number, seed[1] as number], settings });
  }
  return marks.sort((a, b) => compareCells(a.seed, b.seed) || JSON.stringify(a.settings).localeCompare(JSON.stringify(b.settings)));
}
