/** Ground textures are procedural and take seconds to build. One worker builds them (or reads them from an IndexedDB
 *  cache written on an earlier visit) and hands the other workers copies as ImageBitmaps. */
import { canvas, ctx2d, type CurbColours, type Cnv, type Textures } from './textures';

/** bump when the texture generation code changes, so stale caches are rebuilt */
const TEX_VERSION = 'tex-3';
export interface TexSnapshot { names: string[]; bitmaps: ImageBitmap[]; curb: CurbColours; stampAngle: number }

function entries(t: Textures): [string, Cnv][] {
  const out: [string, Cnv][] = [...t.mips.entries()].map(([k, v]) => ['mip:' + k, v]);
  for (const [k, list] of t.mosaics) list.forEach((c, i) => out.push([`mosaic:${k}:${i}`, c]));
  out.push(['slabs', t.slabs], ['leaves', t.leaves], ['pool1', t.pool1], ['pool2', t.pool2]);
  return out;
}
export async function snapshot(t: Textures): Promise<TexSnapshot> {
  const e = entries(t);
  return { names: e.map(x => x[0]), bitmaps: await Promise.all(e.map(x => createImageBitmap(x[1]))), curb: t.curb, stampAngle: t.stampAngle };
}
export function restore(t: Textures, s: TexSnapshot) {
  const mosaics = new Map<string, Cnv[]>();
  s.names.forEach((name, i) => {
    const b = s.bitmaps[i], c = canvas(b.width, b.height); ctx2d(c).drawImage(b, 0, 0); b.close();
    if (name.startsWith('mip:')) t.mips.set(name.slice(4), c);
    else if (name.startsWith('mosaic:')) { const [, k, idx] = name.split(':'); let l = mosaics.get(k); if (!l) mosaics.set(k, (l = [])); l[+idx] = c; }
    else (t as unknown as Record<string, Cnv>)[name] = c;
  });
  t.mosaics = mosaics; t.curb = s.curb; t.stampAngle = s.stampAngle;
}

/* ---- IndexedDB cache (works inside workers) ---- */
function db(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open('capital-empire-textures', 1); r.onupgradeneeded = () => r.result.createObjectStore('t'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function hash(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
export const cacheKey = (art: unknown) => TEX_VERSION + ':' + hash(JSON.stringify(art));
interface Stored { names: string[]; blobs: Blob[]; curb: CurbColours; stampAngle: number }
export async function loadCached(key: string): Promise<TexSnapshot | null> {
  try {
    const d = await db(), v = await new Promise<Stored | undefined>((res, rej) => { const q = d.transaction('t').objectStore('t').get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
    if (!v) return null;
    return { names: v.names, bitmaps: await Promise.all(v.blobs.map(b => createImageBitmap(b))), curb: v.curb, stampAngle: v.stampAngle };
  } catch { return null; }
}
export async function saveCached(key: string, t: Textures) {
  try {
    const e = entries(t), blobs = await Promise.all(e.map(x => x[1].convertToBlob({ type: 'image/png' })));
    const d = await db(), st = d.transaction('t', 'readwrite').objectStore('t');
    st.clear(); st.put({ names: e.map(x => x[0]), blobs, curb: t.curb, stampAngle: t.stampAngle } satisfies Stored, key);
  } catch { /* the cache is optional */ }
}
