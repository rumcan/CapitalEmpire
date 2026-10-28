/// <reference lib="webworker" />
// A ground worker: holds its own copy of the road network, terrain and ground textures and bakes chunks on request.
import { MAP, CHUNK_W, CHUNK_H, MID_K, PLAN_LEVELS, PLAN_W, PLAN_H } from './iso';
import { RoadNetwork } from './network';
import type { FromWorker, ToWorker } from './ground-protocol';
import { applyOps } from './netops';
import { GroundPainter } from './renderer';
import { GRASS_TINTS, PAINTED_NAMES, Textures } from './textures';
import { EAGER_PHOTO } from './grass-art';
import { isPaintPhoto } from './paint';
import { cacheKey, dropCache, loadCached, restore, saveCached, snapshot } from './texture-share';
import { lightPack } from './boot';
import { WOODLAND_TEX } from './terrain-paint';
import { VARIANT_IDS } from './living-ground';
import { WALL_TEX } from './ext/course-walls';
import { softCanvases } from './canvas2d';
import { BLOCK_UNDER, WOODLAND, lawnTexFor } from './painted-surfaces';
import { roughTexes } from './rough-yards';
import { layerTexes, type LotPatch } from './ground-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const terrain = new Uint8Array(MAP * MAP), net = new RoadNetwork(), tex = new Textures();
const painter = new GroundPainter(terrain, net, tex);
tex.onMade = (what, work, wall) => post({ t: 'log', message: `made ${what} in ${work.toFixed(0)} ms (over ${wall.toFixed(0)} ms)` });
// URL discovery is cheap; image bytes are decoded only when a changed cell needs that generated asset.
const grassAssets = import.meta.glob('../assets/ground/grass-management/**/*.{webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const grassLoads = new Set<string>();
const loadGrass = async (id: string) => {
  if (tex.isPainted(id)) return; // A registered condition family uses the same authored zoom path, not the legacy single image.
  if (grassLoads.has(id)) return;
  const path = Object.keys(grassAssets).find(p => p.endsWith('/' + id + '.webp') || p.endsWith('/' + id + '.png'));
  if (!path) return;
  grassLoads.add(id);
  try { const response = await fetch(grassAssets[path]); if (!response.ok) throw new Error('grass asset fetch'); const image = await createImageBitmap(await response.blob()); const cv = new OffscreenCanvas(image.width, image.height); cv.getContext('2d')!.drawImage(image, 0, 0); image.close(); painter.grassImages.set(id, cv); if (painter.grassImages.size > 16) { const oldest = painter.grassImages.keys().next().value!; painter.grassImages.delete(oldest); grassLoads.delete(oldest); } }
  catch { grassLoads.delete(id); } // Current grass stays usable when an optional generated image is unavailable.
};
let ready: Promise<void> | null = null, gotTextures: (() => void) | null = null;
/** resolved once this worker has its textures (built, cached or sent): a paint that arrives before init waits for it */
let texReady!: () => void;
const hasTextures = new Promise<void>(res => { texReady = res; });
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);
/** the woodland floor's Fescue (terrain-paint.ts WOODLAND_TEX), a lazy photo: built once, before this worker's first full bake */
let woods: Promise<void> | null = null;
/** the photo textures this worker builds up front (a light boot's few, T157: init's limits); the others are built on first use */
let eager: ReadonlySet<string> = EAGER_PHOTO;
/** a light boot's: the screen-space textures are made on first use (Textures.lazy), also after a restore */
let lazyTex = false;

/** one message: init and the texture pack run on arrival (init waits for the pack); every other message runs after the one before it */
const handle = async (m: ToWorker) => {
  try {
    switch (m.t) {
      case 'grass': {
        painter.grassStrength = Math.min(1, Math.max(0, m.strength)); painter.grassHeat = m.heat; painter.grassMowing = m.mowing;
        for (const c of m.cells) { if (c.active) painter.grassCells.set(c.id, c); else painter.grassCells.delete(c.id); }
        break;
      }
      case 'init': {
        painter.setTerrain(m.terrain, m.height, m.waters);
        // a light boot's limits (T157, boot.ts): smaller decode caches, fewer photos built up front, the texture cache only read
        const lim = m.limits;
        if (lim?.tiles != null) tex.tileLimit = lim.tiles;
        if (lim?.painted != null) tex.paintedLimit = lim.painted;
        if (lim?.eager) eager = new Set(lim.eager);
        if (lim?.soft) softCanvases(true);
        lazyTex = !!lim?.lazy;
        // T168: a lazy worker's photos built on first use leave their mosaics for first use too, and its bakes put aside a chunk that meets a
        // texture not made yet (it is made in slices meanwhile) rather than making it at once
        tex.lazyPhotoMosaics = lazyTex; deferring = lazyTex;
        tex.makeForColour = !(lim?.lazy && lim.tints !== false); // a light boot's (its tints lazy too) keeps T157's swatch colours
        // every worker (the builder, and the peers that restore its snapshot) takes the presets and the grass's angle and tilt from the art
        tex.configure(m.art);
        const t0 = performance.now();
        if (!m.build) { ready = new Promise<void>(res => { gotTextures = res; }); await ready; post({ t: 'ready', ms: performance.now() - t0 }); break; }
        // the builder: textures from the cache if this browser has them, else built (and cached for next time)
        const lazyTints = !!lim?.lazy && lim.tints !== false;
        // T166: the game neither reads nor writes the browser's cache (ground-protocol.ts WorkerLimits.readCache): the old one is deleted
        if (lim?.readCache === false && lim.saveCache === false) dropCache();
        const key = cacheKey(m.art), cached = lim?.readCache === false ? null : await loadCached(key, lim ? lightPack(EAGER_PHOTO, eager, lim.lazy ? new Set([...PAINTED_NAMES, ...(lazyTints ? GRASS_TINTS.map(t => t[0]) : [])]) : undefined, lim.lazy) : undefined);
        ready = cached ? Promise.resolve(restore(tex, cached)) : tex.build(m.art, undefined, eager, !!lim?.lazy, lazyTints);
        if (cached && lazyTex) tex.lazyMissing();
        await ready; texReady();
        post({ t: 'log', message: `textures ${cached ? 'from cache' : 'built'} in ${(performance.now() - t0).toFixed(0)} ms` });
        post({ t: 'ready', ms: performance.now() - t0, saving: !cached });
        if (m.peers) { const snaps = await Promise.all(Array.from({ length: m.peers }, () => snapshot(tex))); post({ t: 'texpack', snaps }, snaps.flatMap(s => s.bitmaps)); }
        if (!cached && lim?.saveCache !== false) void saveCached(key, tex).finally(() => post({ t: 'saved' }));
        break;
      }
      case 'textures': restore(tex, m.snap); if (lazyTex) tex.lazyMissing(); texReady(); gotTextures?.(); break;
      case 'grassArt': tex.setPaintedOn(m.art !== 'photo'); painter.resetPlanColours(); break;
      case 'surfaces': tex.setSurfaces(m.file); painter.resetPainted(); break;
      case 'net': { const t0 = performance.now(); applyOps(net, m.ops); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `net ops ${m.ops.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'tilesAhead': tex.tilesAhead = m.bands; break;
      case 'lamps': { const t0 = performance.now(), pts = []; for (let i = 0; i + 1 < m.pts.length; i += 2) pts.push({ x: m.pts[i], y: m.pts[i + 1] }); net.setLamps(pts); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `lamps ${pts.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'terrain': painter.setTerrain(m.cls, m.height, m.waters); break;
      case 'blocks': painter.blocks = m.data; break;
      case 'course': painter.setCourse(m.i0, m.j0, m.w, m.h, m.data); break;
      case 'casters': {
        for (const p of m.dropPrefix ?? []) painter.casters.dropPrefix(p);
        for (const k of m.drop) painter.casters.drop(k);
        for (const [k, recs] of m.set) painter.casters.set(k, recs);
        break;
      }
      case 'living': painter.living = { on: m.on, debug: m.debug }; break;
      case 'rugged': painter.rugged = m.on; break;
      case 'softDirt': painter.softDirt = m.on; break;
      case 'stripes': painter.stripes = m.on; break;
      case 'leaves': painter.leafDensity = m.density; break;
      case 'specCam': painter.specCam = m.on; break;
      case 'swamp': painter.swamp = m.on; break;
      case 'grassShine': painter.grassShine = m.on; painter.shineWeights = m.weights; break;
      case 'slopeLight': painter.slopeLight = m.strength; break;
      case 'lotground': {
        // the lazy photo textures the edit's paint areas use (fill and border, course surfaces and collars, wall art): built first, so the
        // chunks baked after it see them. T168, a deferring worker: started now, not waited for here; a chunk that lays one waits for it
        // alone (paint: missingPhotos), so the other chunks go on
        const need = new Set<string>();
        for (const [, ps] of m.set) for (const p of ps) for (const t of patchPhotos(p)) need.add(t);
        const built = Promise.all([...need].map(t => tex.ensure(t).catch(err => post({ t: 'error', message: String(err) }))));
        if (!deferring) await built;
        painter.setLotGround(m.set, m.drop);
        break;
      }
      case 'memProbe': {
        post({ t: 'log', message: 'mem ' + JSON.stringify(memProbe()) });
        break;
      }
      case 'prewarm': {
        // T168: textures the open tool can lay (the Course tool's brushes), made ahead: photos decoded now, procedural textures and mosaics in
        // slices while the worker is idle; nothing waits for them
        const painted: string[] = [];
        for (const t of m.tex) {
          if (tex.isPainted(t)) painted.push(t); // a painted family: its pictures at the current art level decoded ahead
          else if (isPaintPhoto(t) && !eager.has(t) && !tex.built(t)) void tex.ensure(t).catch(err => post({ t: 'error', message: String(err) }));
          else if (tex.isLazy(t)) tex.queueBuild(t);
        }
        if (painted.length) void tex.preparePainted(tex.paintedArtLevel, painted, [], false).catch(err => post({ t: 'error', message: String(err) }));
        kick();
        break;
      }
      case 'paint': {
        await hasTextures;
        // the tile spec the tile set families are laid at (T145, T150, painted-tiles.ts tileSpec: the camera's band and the screen's DPR), with this bake
        if (m.ts !== undefined) tex.tileTs = m.ts;
        if (m.kind !== 'p') await (woods ??= tex.ensure(WOODLAND_TEX).catch(err => post({ t: 'error', message: String(err) })));
        // the painted grass pictures this chunk needs at its art level (painted-grass-lod.ts): the base grass and its tints, and every texture
        // its lots, lawns, painted areas, course surfaces and managed turf use (a painted preset among them); never all of them
        if (m.kind !== 'p') {
          const k = m.kind === 'm' ? MID_K : 1, w = CHUNK_W * k, h = CHUNK_H * k;
          const box = GroundPainter.tileBox(m.i * w, m.j * h, (m.i + 1) * w, (m.j + 1) * h);
          const need = new Set<string>(['grass', 'meadow', 'outside', WOODLAND_TEX, WOODLAND, 'dirt', 'bank', 'creek', 'water', 'growSoil']), near = new Set<string>();
          // T199: the small streams' swamp, where one reaches into the chunk
          if (painter.swampIn(box)) need.add('swamp');
          // the living ground's painted variant sets (T111), when their art is in the game
          if (painter.living.on && !painter.living.debug) for (const v of VARIANT_IDS) if (tex.isPainted(v)) need.add(v);
          for (const p of painter.lotsIn(box)) {
            need.add(p.tex);
            if (p.paint?.b) need.add(p.paint.bt);
            if (p.paint?.m) need.add(p.paint.m.t);
            if (p.course) { for (const l of p.course.layers) for (const t of layerTexes(l)) need.add(t); if (p.course.walls?.length) for (const w of WALL_TEX) near.add(w); } // T256: its alternate looks too
            // a town lawn wears one of the painted lawns (painted-surfaces.ts lawnSlot), picked by where it lies
            // (a lot's lawn wears its look state's, T155: lawnTexFor)
            if (p.lawn && tex.paintedOn) { const t = lawnTexFor(p.lawn, p.pts, tex.surfaces); if (t) need.add(t); }
            // T194: a block's grass in soft patches lies over the rough
            if (p.lawn && p.lawn.share < 1) need.add(BLOCK_UNDER);
            // T222: a rough yard's fescue, dirt and desert patches
            if (p.lawn?.rough) for (const t of roughTexes(p.lawn.rough)) need.add(t);
          }
          if (painter.grassStrength > 0 && !painter.grassHeat) {
            for (let y = Math.max(0, Math.floor(box[1] / 4)); y < Math.min(MAP / 4, Math.ceil(box[3] / 4)); y++) for (let x = Math.max(0, Math.floor(box[0] / 4)); x < Math.min(MAP / 4, Math.ceil(box[2] / 4)); x++) {
              const cell = painter.grassCells.get(y * (MAP / 4) + x); if (cell) need.add(cell.material);
            }
          }
          await tex.preparePainted(m.artL ?? m.L, need, near);
        } else {
          await tex.preparePainted(PLAN_LEVELS[PLAN_LEVELS.length - 1], ['grass', 'meadow', 'outside']); await tex.preparePlanner(['grass', 'meadow', WOODLAND_TEX, WOODLAND]);
          // the tile set families the planner piece's course surfaces wear (their tiles at the camera's band: FAR at the furthest zoom)
          const box = GroundPainter.tileBox(m.i * PLAN_W, m.j * PLAN_H, (m.i + 1) * PLAN_W, (m.j + 1) * PLAN_H, 2), course = new Set<string>(['grass', 'meadow', 'outside', WOODLAND_TEX, WOODLAND]);
          if (painter.swampIn(box)) course.add('swamp'); // (T199: the streams' swamp)
          for (const p of painter.lotsIn(box)) if (p.course) for (const l of p.course.layers) for (const t of [l, ...(l.collar ? [l.collar] : []), ...(l.alts ?? []).flatMap(a => [a.look, ...(a.band ? [a.band] : [])])]) course.add(t.tex);
          await tex.prepareTiles(course);
        }
        // T168: the photos this chunk's lots and course lay, not built yet: the chunk is put aside until they are, the others go on
        if (deferring && m.kind !== 'p') {
          const k = m.kind === 'm' ? MID_K : 1, w = CHUNK_W * k, h = CHUNK_H * k, miss = new Set<string>();
          for (const p of painter.lotsIn(GroundPainter.tileBox(m.i * w, m.j * h, (m.i + 1) * w, (m.j + 1) * h))) for (const t of patchPhotos(p)) miss.add(t);
          if (miss.size) {
            const built = Promise.all([...miss].map(t => tex.ensure(t).catch(err => post({ t: 'error', message: String(err) }))));
            if (!probing(m)) putAside(m, built);
            break;
          }
        }
        // Decode only artwork used by the requested visible chunk, never all registered course/town cells.
        if (m.kind !== 'p' && painter.grassStrength > 0 && !painter.grassHeat) {
          const k = m.kind === 'm' ? MID_K : 1, w = CHUNK_W * k, h = CHUNK_H * k;
          const box = GroundPainter.tileBox(m.i * w, m.j * h, (m.i + 1) * w, (m.j + 1) * h), ids = new Set<string>();
          for (let y = Math.max(0, Math.floor(box[1] / 4)); y < Math.min(MAP / 4, Math.ceil(box[3] / 4)); y++) for (let x = Math.max(0, Math.floor(box[0] / 4)); x < Math.min(MAP / 4, Math.ceil(box[2] / 4)); x++) {
            const c = painter.grassCells.get(y * (MAP / 4) + x); if (!c) continue;
            ids.add(c.material); if (c.foot > 0.005) ids.add(c.foot > 0.45 ? 'crowd-heavy' : c.moisture > 0.8 ? 'mud-footprints' : 'crowd-light'); if (c.carts > 0.005) ids.add('cart-tracks'); if (c.divots > 0.005) ids.add(c.repair > 0 ? 'divots-repair' : 'divots-fresh'); else if (c.repair > 0) ids.add('maintenance');
          }
          if (painter.grassMowing) ids.add('mowing-stripes'); await Promise.all([...ids].map(loadGrass));
        }
        const t0 = performance.now();
        let cv: OffscreenCanvas;
        // T168: textures not made yet: the bake goes on with placeholders to learn them all, is thrown away, and the chunk waits aside until
        // they are made in slices; the other chunks are baked meanwhile
        // (a probe, T168: a chunk near the view baked ahead in idle time only to learn the textures it lacks: they are made ahead, the bake
        // is thrown away)
        tex.deferMakes = deferring; tex.deferNeed = !probing(m); tex.missing.clear();
        try { cv = m.kind === 'p' ? painter.paintPlan(m.i, m.j, m.L) : painter.paint(m.i, m.j, m.L, m.kind === 'm'); }
        finally { tex.deferMakes = false; tex.deferNeed = true; }
        if (probing(m)) { tex.missing.clear(); cv.width = cv.height = 0; painter.takeShadeMask(); painter.takeSpecMask(); painter.takeGlossMask(); painter.takeShineMask(); kick(); break; }
        if (tex.missing.size) { const keys = [...tex.missing]; tex.missing.clear(); painter.takeShadeMask(); painter.takeSpecMask(); painter.takeGlossMask(); painter.takeShineMask(); putAside(m, Promise.all(keys.map(k => tex.whenMade(k)))); break; }
        lastBake = performance.now(); if (deferring && m.kind !== 'p') aheadOf(m);
        const bmp = cv.transferToImageBitmap(), sm = m.kind === 'p' ? null : painter.takeShadeMask(), shade = sm ? sm.transferToImageBitmap() : undefined;
        // (T215: the reflection mask, when specCam is on and the chunk has a lamp pool on its asphalt)
        const rm = m.kind === 'p' ? null : painter.takeSpecMask(), spec = rm ? rm.transferToImageBitmap() : undefined;
        // (T199: the swamp's gloss mask, when specCam is on and the chunk lays the swamp)
        const gm = m.kind === 'p' ? null : painter.takeGlossMask(), gloss = gm ? gm.transferToImageBitmap() : undefined;
        // (T262: the grass shine's weight mask, when the shine is on and the chunk has grass)
        const shine = m.kind === 'p' ? undefined : painter.takeShineMask() ?? undefined;
        post({ t: 'tile', id: m.id, kind: m.kind, i: m.i, j: m.j, L: m.L, artL: m.artL ?? m.L, ts: m.ts, tiled: painter.tilesUsed, prov: painter.provisional, bmp, shade, spec, gloss, shine, shineMs: painter.shineMs, ms: performance.now() - t0 }, [bmp, ...(shade ? [shade] : []), ...(spec ? [spec] : []), ...(gloss ? [gloss] : []), ...(shine ? [shine.data.buffer] : [])]);
        break;
      }
    }
  } catch (err) { post({ t: 'error', message: (err as Error).stack || String(err) }); }
};
/** the messages after init, one at a time in arrival order (a bake never overtakes the lot edit sent before it, but one put aside for a texture
 *  being made is baked after the messages that came meanwhile, T168); the chain never rejects (handle catches) */
let queue: Promise<void> = Promise.resolve();
/** messages waiting in the chain (T168: the slicer makes textures ahead only when none waits) */
let pending = 0;
const enqueue = (m: ToWorker) => {
  pending++;
  queue = queue.then(() => { const t0 = performance.now(); return handle(m).finally(() => { lastMsgMs = performance.now() - t0; }); }).finally(() => { pending--; kick(); });
};
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.t === 'init' || m.t === 'textures') void handle(m);
  else enqueue(m);
};

/* ---- T168: the lazy textures made in slices, between bakes ----
 * The worker's bakes put a chunk aside when it meets textures not made yet (procedural ones, photos' mosaics: Textures.missing, the bake
 * going on with placeholders to learn them all and then thrown away; photos its lots lay: patchPhotos). The textures are made SLICE_MS at a
 * time, one slice after each message (longer while the chunk waits and messages keep coming), and the chunk goes back in the queue when they
 * are made. The chunk keeps its place in flight (the main thread sends no more for it), so the worker's other chunk goes on meanwhile and
 * the texture is not starved by a flood of new chunks that would need it too. Textures made ahead (the probes', the Course tool's) get slices
 * only when no message waits and no chunk was baked for IDLE_MS. */
const SLICE_MS = 5, IDLE_MS = 50;
let deferring = false, slicing = false, lastBake = 0, lastMsgMs = 0;
/* the probes (T168): after each chunk it bakes, the worker notes its neighbours; in idle time it bakes them ahead, thrown away, to learn the
 * textures they will lack (the map's own: never one the map does not lay), made ahead in slices. The newest first, at most PROBES waiting. */
const PROBES = 48;
type Paint = ToWorker & { t: 'paint' };
const probes: Paint[] = [], known = new Set<string>();
let probeId = -1;
const probing = (m: Paint) => m.id < 0;
const chunkKey = (m: { kind: string; i: number; j: number; L: number; ts?: number }) => `${m.kind}${m.i},${m.j}@${m.L}#${m.ts ?? 0}`;
function aheadOf(m: Paint) {
  known.add(chunkKey(m));
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const q: Paint = { ...m, id: probeId--, i: m.i + di, j: m.j + dj }, k = chunkKey(q);
    if (known.has(k)) continue; known.add(k); probes.push(q);
  }
  if (probes.length > PROBES) probes.splice(0, probes.length - PROBES);
  if (known.size > 20000) known.clear();
  idleSoon();
}
let idleTimer = 0;
/** the worker's idle work: ahead builds' slices (kick), else the next probe */
function idleSoon() { if (!idleTimer) idleTimer = setTimeout(idleWork, IDLE_MS) as unknown as number; }
function idleWork() {
  idleTimer = 0;
  if (pending || performance.now() - lastBake < IDLE_MS || asideIds.size) { if (probes.length || tex.pendingBuilds(true)) idleSoon(); return; }
  if (tex.pendingBuilds(true)) { kick(); idleSoon(); return; }
  const q = probes.pop(); if (q) { enqueue(q); idleSoon(); }
}
const asideIds = new Set<number>();
/** the chunk m waits for `ready` (its textures made, its photos built): put aside, queued again once ready */
function putAside(m: ToWorker & { t: 'paint' }, ready: Promise<unknown>) {
  asideIds.add(m.id);
  void ready.then(() => { asideIds.delete(m.id); enqueue(m); });
  kick();
}
function kick() {
  if (slicing) return;
  const ahead = pending === 0 && performance.now() - lastBake > IDLE_MS;
  if (!tex.pendingBuilds(ahead)) { if (tex.pendingBuilds(true) || probes.length) idleSoon(); return; }
  slicing = true; tick.port2.postMessage(0);
}
/** a slice: SLICE_MS, longer (up to 4x) when a bake waits aside and messages keep coming, so the texture it waits for gets about as much time
 *  as the bakes going on meanwhile */
const sliceMs = () => (pending && asideIds.size ? Math.min(4 * SLICE_MS, Math.max(SLICE_MS, lastMsgMs)) : SLICE_MS);
/** a zero-delay turn of the event loop (setTimeout(0) is held to 4 ms once nested): the messages that came meanwhile run first */
const tick = new MessageChannel();
tick.port1.onmessage = () => {
  slicing = false;
  try { tex.step(performance.now() + sliceMs(), pending === 0 && performance.now() - lastBake > IDLE_MS); } catch (err) { post({ t: 'error', message: (err as Error).stack || String(err) }); }
  kick();
};
/** T172: the pixels this worker holds, by owner, MB of RGBA8 (each canvas or bitmap counted once, at width x height x 4): the textures'
 *  mips, mosaics, photo sources, painted pictures, tile set pictures and fixed pictures; the painter's caches and scratch buffers. A measure
 *  for scripts/perf/memory.mjs, never on a hot path */
function memProbe(): Record<string, number> {
  const seen = new Set<object>(), out: Record<string, number> = {};
  const px = (v: unknown, depth = 0): number => {
    if (!v || typeof v !== 'object' || seen.has(v) || depth > 3) return 0;
    const o = v as { width?: unknown; height?: unknown }; seen.add(v);
    if (typeof o.width === 'number' && typeof o.height === 'number' && (v instanceof OffscreenCanvas || v instanceof ImageBitmap)) return o.width * o.height * 4;
    if (v instanceof Map) { let n = 0; for (const x of v.values()) n += px(x, depth + 1); return n; }
    if (Array.isArray(v)) { let n = 0; for (const x of v) n += px(x, depth + 1); return n; }
    if (depth > 0) { let n = 0; for (const x of Object.values(v)) n += px(x, depth + 1); return n; }
    return 0;
  };
  const add = (k: string, v: unknown) => { const n = px(v); if (n) out[k] = Math.round((n / 1048576) * 10) / 10; };
  const T = tex as unknown as Record<string, unknown>, P = painter as unknown as Record<string, unknown>;
  for (const k of ['mips', 'mosaics', 'photoSrc', 'paintedPics', 'tilePics']) add('tex.' + k, T[k]);
  add('tex.fixed', ['slabs', 'leaves', 'pool1', 'pool2', 'decals', 'soil', 'lotDecals', 'nature'].map(k => T[k]));
  for (const k of ['grassImages', 'toned', 'planPics', 'wallPics', 'composed', 'scratch', 'leafChunks', 'livingMade']) add('painter.' + k, P[k]);
  add('painter.leafPic', [P.leafPic]);
  add('painter.leafAtlases', [...(P.leafAtlases as Map<number, { cv: OffscreenCanvas }>).values()].map(a => a.cv));
  return out;
}
/** the photo textures (lazy, not built yet) a lot patch lays: a lawn's photo, a painted area's fill, border and mix, a course chunk's surfaces
 *  and collars (T078) and the wall art its walls wear (T099 WALL_TEX slots) */
function patchPhotos(p: LotPatch): string[] {
  // has: ensure's own test; a painted texture (its family's pictures, decoded before the bake) needs no photo (T168: never built)
  const out: string[] = [], add = (t: string | undefined) => { if (t && isPaintPhoto(t) && !eager.has(t) && !tex.isPainted(t) && !tex.has(t)) out.push(t); };
  if (p.lawn) { add(p.tex); if (p.lawn.rough) for (const t of roughTexes(p.lawn.rough)) add(t); } else if (p.paint) { add(p.tex); if (p.paint.b > 0) add(p.paint.bt); if (p.paint.m) add(p.paint.m.t); }
  if (p.course) { for (const l of p.course.layers) { add(l.tex); if (l.collar) add(l.collar.tex); for (const a of l.alts ?? []) { add(a.look.tex); if (a.band) add(a.band.tex); } } if (p.course.walls?.length) for (const t of WALL_TEX) add(t); }
  return out;
}
