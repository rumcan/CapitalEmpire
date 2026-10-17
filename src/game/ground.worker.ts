/// <reference lib="webworker" />
// A ground worker: holds its own copy of the road network, terrain and ground textures and bakes chunks on request.
import { MAP } from './iso';
import { RoadNetwork } from './network';
import type { FromWorker, ToWorker } from './ground-protocol';
import { applyOps } from './netops';
import { GroundPainter } from './renderer';
import { Textures } from './textures';
import { cacheKey, loadCached, restore, saveCached, snapshot } from './texture-share';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const terrain = new Uint8Array(MAP * MAP), net = new RoadNetwork(), tex = new Textures();
const painter = new GroundPainter(terrain, net, tex);
let ready: Promise<void> | null = null, gotTextures: (() => void) | null = null;
const post = (m: FromWorker, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

scope.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.t) {
      case 'init': {
        painter.setTerrain(m.terrain, m.height, m.waters);
        const t0 = performance.now();
        if (!m.build) { ready = new Promise<void>(res => { gotTextures = res; }); await ready; post({ t: 'ready', ms: performance.now() - t0 }); break; }
        // the builder: textures from the cache if this browser has them, else built (and cached for next time)
        const key = cacheKey(m.art), cached = await loadCached(key);
        ready = cached ? Promise.resolve(restore(tex, cached)) : tex.build(m.art);
        await ready;
        post({ t: 'log', message: `textures ${cached ? 'from cache' : 'built'} in ${(performance.now() - t0).toFixed(0)} ms` });
        post({ t: 'ready', ms: performance.now() - t0 });
        if (m.peers) { const snaps = await Promise.all(Array.from({ length: m.peers }, () => snapshot(tex))); post({ t: 'texpack', snaps }, snaps.flatMap(s => s.bitmaps)); }
        if (!cached) void saveCached(key, tex);
        break;
      }
      case 'textures': restore(tex, m.snap); gotTextures?.(); break;
      case 'net': { const t0 = performance.now(); applyOps(net, m.ops); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `net ops ${m.ops.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'lamps': { const t0 = performance.now(), pts = []; for (let i = 0; i + 1 < m.pts.length; i += 2) pts.push({ x: m.pts[i], y: m.pts[i + 1] }); net.setLamps(pts); const ms = performance.now() - t0; if (ms > 50) post({ t: 'log', message: `lamps ${pts.length} in ${ms.toFixed(0)} ms` }); break; }
      case 'terrain': painter.setTerrain(m.cls, m.height, m.waters); break;
      case 'blocks': painter.blocks = m.data; break;
      case 'lotground': painter.setLotGround(m.set, m.drop); break;
      case 'paint': {
        if (ready) await ready;
        const t0 = performance.now();
        const cv = m.kind === 'p' ? painter.paintPlan(m.i, m.j, m.L) : painter.paint(m.i, m.j, m.L, m.kind === 'm');
        const bmp = cv.transferToImageBitmap();
        post({ t: 'tile', id: m.id, kind: m.kind, i: m.i, j: m.j, L: m.L, bmp, ms: performance.now() - t0 }, [bmp]);
        break;
      }
    }
  } catch (err) { post({ t: 'error', message: (err as Error).stack || String(err) }); }
};
