import { BunkerCache, StaleBakeError } from './package/runtime/bunker-cache.js';
import { buildBakeRequest } from './package/runtime/capital-empire-adapter.js';
import { bunkerAppearance } from './settings';
import { bunkerMaterials } from './texture-library';
import type { BunkerStageInput, BunkerStageReady, BunkerStageRef, BunkerStageRequest, BunkerStageSprite } from './stage-types';
import type { BBox } from '../../network';

/** Ready source atlas bytes only; every consumer holds an independently bounded copy of this same set. */
export const BUNKER_STAGE_CACHE_BYTES = 32 * 1024 * 1024;
/** How long a suspension may keep the previous pictures up before the native drawing takes over. */
export const BUNKER_SUSPEND_HOLD_MS = 3000;
interface State { ref: BunkerStageRef; pending: boolean }
interface Sprite extends BunkerStageSprite { ref: BunkerStageRef }
export interface BunkerStageBridgeOptions {
  bake(request: BunkerStageRequest): Promise<BunkerStageSprite>;
  disposeBake?(): void;
  expected(set: BunkerStageRef[], drop: string[]): void;
  ready(value: BunkerStageReady): void | Promise<void>;
  drop(id: string, key: string, bounds: BBox): void;
  error?(error: unknown, id: string): void;
  cloneImage?(image: ImageBitmap): Promise<ImageBitmap>;
  maxBytes?: number;
}
const copyRef = (ref: BunkerStageRef): BunkerStageRef => ({ ...ref, ringsTiles: ref.ringsTiles.map(r => r.slice()), sourcePatchKeys: ref.sourcePatchKeys.slice(), dirtyBoundsTiles: [...ref.dirtyBoundsTiles] });

/** Immutable complete-component snapshots are baked only when geometry/profile changes, never on a view request. */
export class BunkerStageBridge {
  private readonly states = new Map<string, State>();
  private readonly resident = new Map<string, string>();
  private readonly cache: BunkerCache<BunkerStageRequest, Sprite>;
  private closed = false;
  private suspended = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private requested = 0;
  private lastError: string | null = null;
  constructor(private readonly options: BunkerStageBridgeOptions) {
    this.cache = new BunkerCache({ maxBytes: options.maxBytes ?? BUNKER_STAGE_CACHE_BYTES, maxConcurrentBakes: 1,
      bake: async request => {
        const result = await options.bake(request);
        const valid = result.key === request.key && result.renderWidth >= 1 && result.renderWidth <= 512 && result.renderHeight >= 1 && result.renderHeight <= 512 && result.width === result.renderWidth && result.height === result.renderHeight * 3 && result.rasterScale > 0 && Number.isFinite(result.rasterScale);
        if (!valid) { result.image.close(); throw new Error('Invalid bunker stage atlas metadata.'); }
        const state = this.states.get(request.id);
        return { ...result, ref: state?.ref.key === request.key ? copyRef(state.ref) : { id: request.id, key: request.key, ringsTiles: request.ringsTiles.map(r => r.slice()), sourcePatchKeys: request.sourcePatchKeys.slice(), dirtyBoundsTiles: [...request.dirtyBoundsTiles] } };
      }, onEvict: (id, sprite) => {
        if (this.resident.get(id) === sprite.key) this.resident.delete(id);
        this.options.drop(id, sprite.key, [...sprite.ref.dirtyBoundsTiles]);
      } });
  }
  sync(inputs: readonly BunkerStageInput[]): void {
    if (this.closed) return;
    const resumed = this.suspended; this.suspended = false; this.clearSuspendTimer();
    const keep = new Set<string>(), updates: BunkerStageRef[] = [], jobs: { state: State; request: BunkerStageRequest }[] = [];
    for (const input of inputs) {
      try {
        const materials = bunkerMaterials(input.settings), textures = Object.values(materials).map(m => m.id).join(',');
        const request: BunkerStageRequest = { ...buildBakeRequest({ id: input.id, revision: `native-stages-v1:${input.revision}:${textures}`, ringsTiles: input.ringsTiles,
          appearance: bunkerAppearance(input.settings), rasterScale: 0.6, maxEdge: 512 }), sourcePatchKeys: [...input.sourcePatchKeys], materials };
        keep.add(input.id);
        let state = this.states.get(input.id);
        if (!state || state.ref.key !== request.key) {
          const ref: BunkerStageRef = { id: input.id, key: request.key, ringsTiles: request.ringsTiles.map(r => r.slice()), sourcePatchKeys: request.sourcePatchKeys.slice(), dirtyBoundsTiles: [...request.dirtyBoundsTiles] };
          state = { ref, pending: false }; this.states.set(input.id, state); updates.push(copyRef(ref)); jobs.push({ state, request });
        } else {
          if (JSON.stringify(state.ref.sourcePatchKeys) !== JSON.stringify(request.sourcePatchKeys)) {
            state.ref = { ...state.ref, sourcePatchKeys: request.sourcePatchKeys.slice() }; updates.push(copyRef(state.ref));
          }
          if (resumed && !updates.some(ref => ref.id === input.id)) updates.push(copyRef(state.ref));
          if (!state.pending && (resumed || this.resident.get(input.id) !== request.key)) jobs.push({ state, request });
        }
      } catch (error) { this.report(error, input.id); }
    }
    const removed: string[] = [];
    for (const [id] of this.states) if (!keep.has(id)) { this.states.delete(id); this.resident.delete(id); this.cache.delete(id); removed.push(id); }
    if (updates.length || removed.length) this.options.expected(updates, removed);
    for (const job of jobs) this.enqueue(job.state, job.request);
  }
  /** Re-contouring may change ownership: nothing new publishes until a complete generation is verified. The workers keep showing the
   *  current pictures meanwhile (every course edit suspends; dropping them flashed every bunker back to the native drawing), and the
   *  resuming sync replaces or drops them. Only a generation that stays unresolved falls back to native. */
  suspend(): void {
    if (this.closed || this.suspended) return;
    this.suspended = true;
    this.suspendTimer = setTimeout(() => { this.suspendTimer = null; if (this.suspended && !this.closed) this.options.expected([], [...this.states.keys()]); }, BUNKER_SUSPEND_HOLD_MS);
    (this.suspendTimer as { unref?(): void }).unref?.();
  }
  private clearSuspendTimer(): void { if (this.suspendTimer) clearTimeout(this.suspendTimer); this.suspendTimer = null; }
  isCurrent(id: string, key: string): boolean { return !this.closed && !this.suspended && this.states.get(id)?.ref.key === key && this.resident.get(id) === key; }
  get stats() { return { ...this.cache.metrics, maxSourceBytes: this.cache.maxBytes, requested: this.requested, ready: this.suspended ? 0 : [...this.states].filter(([id, state]) => this.resident.get(id) === state.ref.key).length, suspended: this.suspended, errors: this.failures, lastError: this.lastError }; }
  dispose(): void { if (this.closed) return; this.closed = true; this.clearSuspendTimer(); this.cache.dispose(); this.options.disposeBake?.(); this.states.clear(); this.resident.clear(); }
  private enqueue(state: State, request: BunkerStageRequest): void {
    state.pending = true; this.requested++;
    void this.cache.request(state.ref.id, request).then(async sprite => {
      if (this.closed || this.suspended || this.states.get(state.ref.id) !== state || this.cache.get(state.ref.id) !== sprite) return;
      this.resident.set(state.ref.id, state.ref.key);
      const image = await (this.options.cloneImage?.(sprite.image) ?? createImageBitmap(sprite.image));
      if (!this.isCurrent(state.ref.id, state.ref.key)) { image.close(); return; }
      try { await this.options.ready({ ...copyRef(state.ref), image, width: sprite.width, height: sprite.height, renderWidth: sprite.renderWidth, renderHeight: sprite.renderHeight, boundsWorldPx: [...sprite.boundsWorldPx], rasterScale: sprite.rasterScale }); }
      catch (error) { image.close(); throw error; }
    }).catch(error => {
      if (error instanceof StaleBakeError || this.closed || this.states.get(state.ref.id) !== state) return;
      this.resident.delete(state.ref.id); this.options.drop(state.ref.id, state.ref.key, [...state.ref.dirtyBoundsTiles]); this.report(error, state.ref.id);
    }).finally(() => { state.pending = false; });
  }
  private report(error: unknown, id: string) { this.failures++; this.lastError = error instanceof Error ? error.message : String(error); this.options.error?.(error, id); }
}
