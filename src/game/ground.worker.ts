/// <reference lib="webworker" />
// A ground worker: holds its own copy of the road network, terrain and ground textures and bakes chunks on request.
import { MAP } from './iso';
import { RoadNetwork } from './network';
import type { FromWorker, ToWorker } from './ground-protocol';
import { applyOps } from './netops';
import { GroundPainter } from './renderer';
import { Textures } from './textures';
import { EAGER_PHOTO } from './grass-art';
import { isPaintPhoto } from './paint';
import { cacheKey, loadCached, restore, saveCached, snapshot } from './texture-share';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const terrain = new Uint8Array(MAP * MAP), net = new RoadNetwork(), tex = new Textures();
const painter = new GroundPainter(terrain, net, tex);
let ready: Promise<void> | null = null, gotTextures: (() => void) | null = null;
/** resolved once this worker has its textures (built, cached or sent): a paint that arrives before init waits for it */
let texReady!: () => void;
const hasTextures = new Promise<void>(res => { texReady = res; });
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

/** one message: init and the texture pack run on arrival (init waits for the pack); every other message runs after the one before it */
const handle = async (m: ToWorker) => {
  try {
    switch (m.t) {
      case 'init': {
        painter.setTerrain(m.terrain, m.height, m.waters);
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
      case 'net': { const t0 = performance.now(); applyOps(net, m.ops); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `net ops ${m.ops.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'lamps': { const t0 = performance.now(), pts = []; for (let i = 0; i + 1 < m.pts.length; i += 2) pts.push({ x: m.pts[i], y: m.pts[i + 1] }); net.setLamps(pts); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `lamps ${pts.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'terrain': painter.setTerrain(m.cls, m.height, m.waters); break;
      case 'blocks': painter.blocks = m.data; break;
      case 'lotground': {
        // the lazy photo textures the edit's paint areas use (fill and border) are built first, so the chunks baked after it see them
        const need = new Set<string>();
        for (const [, ps] of m.set) for (const p of ps) if (p.paint) for (const t of [p.tex, ...(p.paint.b > 0 ? [p.paint.bt] : []), ...(p.paint.m ? [p.paint.m.t] : [])]) if (isPaintPhoto(t) && !EAGER_PHOTO.has(t) && !tex.has(t)) need.add(t);
        await Promise.all([...need].map(t => tex.ensure(t).catch(err => post({ t: 'error', message: String(err) }))));
        painter.setLotGround(m.set, m.drop);
        break;
      }
      case 'paint': {
        await hasTextures;
        const t0 = performance.now();
        const cv = m.kind === 'p' ? painter.paintPlan(m.i, m.j, m.L) : painter.paint(m.i, m.j, m.L, m.kind === 'm');
        const bmp = cv.transferToImageBitmap();
        post({ t: 'tile', id: m.id, kind: m.kind, i: m.i, j: m.j, L: m.L, bmp, ms: performance.now() - t0 }, [bmp]);
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
