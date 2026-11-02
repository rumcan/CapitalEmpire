// The player's own bunker textures (the owner, 2026-10-31: "add an upload your own texture button"): a picture picked from disk, scaled to
// at most UPLOAD_EDGE px and kept as WebP in this browser's IndexedDB, so it survives reloads; registered in the bunker texture library
// (texture-library.ts registerOwnTexture) as `upload:<hash>`, where any bunker slot can use it (the sand, the edge soil, the cut wall).
// A save naming one this browser does not have draws the slot's default. No-op where there is no IndexedDB (node tests).
import { registerOwnTexture, unregisterOwnTexture } from './texture-library';

const DB = 'capitalempire-bunker-textures', STORE = 'textures';
/** the longest edge an upload is kept at (the bake samples it repeated; bigger only costs memory) */
export const UPLOAD_EDGE = 1024;
interface Stored { id: string; name: string; blob: Blob }

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(null);
  });
}
function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { const r = run(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
const label = (name: string) => name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 40) || 'My texture';
function register(s: Stored): string { registerOwnTexture({ id: s.id, label: s.name, group: 'Your textures', url: URL.createObjectURL(s.blob) }); return s.id; }

let loaded: Promise<number> | null = null;
/** registers every upload kept in this browser (once); resolves to how many */
export function loadOwnTextures(): Promise<number> {
  return loaded ??= open().then(async db => { if (!db) return 0; const all = await tx<Stored[]>(db, 'readonly', s => s.getAll() as IDBRequest<Stored[]>); for (const s of all) register(s); return all.length; }).catch(() => 0);
}

/** keeps a picked picture (scaled to UPLOAD_EDGE, as WebP) and registers it; resolves to its texture id */
export async function addOwnTexture(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture (PNG, JPEG or WebP).');
  const bmp = await createImageBitmap(file), k = Math.min(1, UPLOAD_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const canvas = new OffscreenCanvas(w, h), ctx = canvas.getContext('2d')!; ctx.drawImage(bmp, 0, 0, w, h); bmp.close();
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', await blob.arrayBuffer()));
  const id = `upload:${[...hash.slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('')}`, stored: Stored = { id, name: label(file.name), blob };
  const db = await open(); if (db) await tx(db, 'readwrite', s => s.put(stored));
  return register(stored);
}

/** forgets an upload in this browser */
export async function removeOwnTexture(id: string): Promise<void> {
  const db = await open(); if (db) await tx(db, 'readwrite', s => s.delete(id));
  unregisterOwnTexture(id);
}
