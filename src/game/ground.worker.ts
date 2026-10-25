/// <reference lib="webworker" />
// A ground worker: holds its own copy of the road network, terrain and ground textures and bakes chunks on request.
import { MAP, CHUNK_W, CHUNK_H, MID_K, PLAN_LEVELS } from './iso';
import { RoadNetwork } from './network';
import type { FromWorker, ToWorker } from './ground-protocol';
import { applyOps } from './netops';
import { GroundPainter } from './renderer';
import { Textures } from './textures';
import { EAGER_PHOTO } from './grass-art';
import { isPaintPhoto } from './paint';
import { cacheKey, loadCached, restore, saveCached, snapshot } from './texture-share';
import { WOODLAND_TEX } from './terrain-paint';
import { VARIANT_IDS } from './living-ground';
import { WALL_TEX } from './ext/course-walls';
import { lawnSlot, lawnTex } from './painted-surfaces';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const terrain = new Uint8Array(MAP * MAP), net = new RoadNetwork(), tex = new Textures();
const painter = new GroundPainter(terrain, net, tex);
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
        // every worker (the builder, and the peers that restore its snapshot) takes the presets and the grass's angle and tilt from the art
        tex.configure(m.art);
        const t0 = performance.now();
        if (!m.build) { ready = new Promise<void>(res => { gotTextures = res; }); await ready; post({ t: 'ready', ms: performance.now() - t0 }); break; }
        // the builder: textures from the cache if this browser has them, else built (and cached for next time)
        const key = cacheKey(m.art), cached = await loadCached(key);
        ready = cached ? Promise.resolve(restore(tex, cached)) : tex.build(m.art);
        await ready; texReady();
        post({ t: 'log', message: `textures ${cached ? 'from cache' : 'built'} in ${(performance.now() - t0).toFixed(0)} ms` });
        post({ t: 'ready', ms: performance.now() - t0 });
        if (m.peers) { const snaps = await Promise.all(Array.from({ length: m.peers }, () => snapshot(tex))); post({ t: 'texpack', snaps }, snaps.flatMap(s => s.bitmaps)); }
        if (!cached) void saveCached(key, tex);
        break;
      }
      case 'textures': restore(tex, m.snap); texReady(); gotTextures?.(); break;
      case 'grassArt': tex.setPaintedOn(m.art !== 'photo'); painter.resetPlanColours(); break;
      case 'surfaces': tex.setSurfaces(m.file); painter.resetPainted(); break;
      case 'net': { const t0 = performance.now(); applyOps(net, m.ops); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `net ops ${m.ops.length} in ${ms.toFixed(0)} ms` }); break; }
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
      case 'slopeLight': painter.slopeLight = m.strength; break;
      case 'lotground': {
        // the lazy photo textures the edit's paint areas use (fill and border) are built first, so the chunks baked after it see them
        const need = new Set<string>();
        for (const [, ps] of m.set) for (const p of ps) if (p.lawn && isPaintPhoto(p.tex) && !EAGER_PHOTO.has(p.tex) && !tex.built(p.tex)) need.add(p.tex); else if (p.paint) for (const t of [p.tex, ...(p.paint.b > 0 ? [p.paint.bt] : []), ...(p.paint.m ? [p.paint.m.t] : [])]) if (isPaintPhoto(t) && !EAGER_PHOTO.has(t) && !tex.built(t)) need.add(t);
        // a course chunk's surfaces and collars (T078)
        for (const [, ps] of m.set) for (const p of ps) if (p.course) for (const l of p.course.layers) for (const t of [l.tex, ...(l.collar ? [l.collar.tex] : [])]) if (isPaintPhoto(t) && !EAGER_PHOTO.has(t) && !tex.built(t)) need.add(t);
        // and the wall art its walls wear (T099 WALL_TEX slots; nothing until a slot is registered in grass-art PHOTO_TEX)
        for (const [, ps] of m.set) for (const p of ps) if (p.course?.walls?.length) for (const t of WALL_TEX) if (isPaintPhoto(t) && !EAGER_PHOTO.has(t) && !tex.built(t)) need.add(t);
        await Promise.all([...need].map(t => tex.ensure(t).catch(err => post({ t: 'error', message: String(err) }))));
        painter.setLotGround(m.set, m.drop);
        break;
      }
      case 'paint': {
        await hasTextures;
        if (m.kind !== 'p') await (woods ??= tex.ensure(WOODLAND_TEX).catch(err => post({ t: 'error', message: String(err) })));
        // the painted grass pictures this chunk needs at its art level (painted-grass-lod.ts): the base grass and its tints, and every texture
        // its lots, lawns, painted areas, course surfaces and managed turf use (a painted preset among them); never all of them
        if (m.kind !== 'p') {
          const k = m.kind === 'm' ? MID_K : 1, w = CHUNK_W * k, h = CHUNK_H * k;
          const box = GroundPainter.tileBox(m.i * w, m.j * h, (m.i + 1) * w, (m.j + 1) * h);
          const need = new Set<string>(['grass', 'meadow', 'outside', WOODLAND_TEX, 'dirt', 'bank', 'creek', 'water', 'growSoil']), near = new Set<string>();
          // the living ground's painted variant sets (T111), when their art is in the game
          if (painter.living.on && !painter.living.debug) for (const v of VARIANT_IDS) if (tex.isPainted(v)) need.add(v);
          for (const p of painter.lotsIn(box)) {
            need.add(p.tex);
            if (p.paint?.b) need.add(p.paint.bt);
            if (p.paint?.m) need.add(p.paint.m.t);
            if (p.course) { for (const l of p.course.layers) for (const t of [l, ...(l.collar ? [l.collar] : [])]) { need.add(t.tex); if (t.m) need.add(t.m.t); } if (p.course.walls?.length) for (const w of WALL_TEX) near.add(w); }
            // a town lawn wears one of the painted lawns (painted-surfaces.ts lawnSlot), picked by where it lies
            if (p.lawn && tex.paintedOn) { const k = lawnSlot(p.pts, tex.surfaces.lawns); if (k >= 0) need.add(lawnTex(k)); }
          }
          if (painter.grassStrength > 0 && !painter.grassHeat) {
            for (let y = Math.max(0, Math.floor(box[1] / 4)); y < Math.min(MAP / 4, Math.ceil(box[3] / 4)); y++) for (let x = Math.max(0, Math.floor(box[0] / 4)); x < Math.min(MAP / 4, Math.ceil(box[2] / 4)); x++) {
              const cell = painter.grassCells.get(y * (MAP / 4) + x); if (cell) need.add(cell.material);
            }
          }
          await tex.preparePainted(m.artL ?? m.L, need, near);
        } else { await tex.preparePainted(PLAN_LEVELS[PLAN_LEVELS.length - 1], ['grass', 'meadow', 'outside']); await tex.preparePlanner(['grass', 'meadow', WOODLAND_TEX]); }
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
        const cv = m.kind === 'p' ? painter.paintPlan(m.i, m.j, m.L) : painter.paint(m.i, m.j, m.L, m.kind === 'm');
        const bmp = cv.transferToImageBitmap();
        post({ t: 'tile', id: m.id, kind: m.kind, i: m.i, j: m.j, L: m.L, artL: m.artL ?? m.L, bmp, ms: performance.now() - t0 }, [bmp]);
        break;
      }
    }
  } catch (err) { post({ t: 'error', message: (err as Error).stack || String(err) }); }
};
/** the messages after init, one at a time in arrival order (a bake never overtakes the lot edit sent before it); the chain never rejects (handle catches) */
let queue: Promise<void> = Promise.resolve();
scope.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.t === 'init' || m.t === 'textures') void handle(m);
  else queue = queue.then(() => handle(m));
};
