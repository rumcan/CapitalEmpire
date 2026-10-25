// T080: the atlas pages as GPU-compressed blocks. The production build ships each page level as KTX2 (Basis UASTC 4x4, next to its WebP with
// the same name; vite.config.ts atlasKtx2), and this transcodes it at load, in workers, to the block format the GPU takes (atlas-formats.ts
// pickFormat: BC7 on desktops, else ASTC 4x4 or ETC2 RGBA): one byte per texel instead of RGBA8's four. A GPU with none of them, the dev
// server (fresh WebP while the art is edited) and a build without the KTX2 files use the WebP pages as RGBA8 (gl.ts initAtlas falls back).
import KtxWorker from './atlas-ktx2.worker?worker';
import type { AtlasSource, LevelData } from './atlas-gl';
import { ktx2Url, type KtxFormat } from './atlas-formats';

export { ktx2Built, pickFormat } from './atlas-formats';

/** the KTX2 pages, transcoded to `format` in `workers` workers */
export function ktx2Source(pages: string[][], format: KtxFormat, workers = 3): AtlasSource {
  type Reply = { id: number; width: number; height: number; blocks: Uint8Array; error?: string };
  const pending = new Map<number, { res: (d: LevelData) => void; rej: (e: Error) => void }>();
  const pool = Array.from({ length: workers }, () => {
    const w = new KtxWorker();
    w.onmessage = (e: MessageEvent<Reply>) => {
      const r = e.data, p = pending.get(r.id); if (!p) return; pending.delete(r.id);
      if (r.error) p.rej(new Error(r.error)); else p.res({ width: r.width, height: r.height, blocks: r.blocks, close() { /* garbage collected */ } });
    };
    return w;
  });
  let id = 0;
  return {
    format,
    level: (p, m) => new Promise<LevelData>((res, rej) => {
      const i = ++id; pending.set(i, { res, rej });
      pool[i % pool.length]!.postMessage({ id: i, url: ktx2Url(pages[p]![m]!), format: format.transcode });
    }),
    dispose: () => { for (const w of pool) w.terminate(); for (const p of pending.values()) p.rej(new Error('closed')); pending.clear(); },
  };
}
