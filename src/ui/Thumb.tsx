import { useEffect, useState } from 'react';
import { ATLAS_PAGES, ATLAS_SIZE } from '../game/library';
import { thumbItem } from '../game/newart';
import type { LibItem } from '../game/types';
import { thumbBox, thumbSource } from './thumb-source';

// T257 (#747): a thumbnail is drawn once from its picture's full-resolution master (or its atlas page's mip 0; thumb-source.ts) at the screen's
// device pixel ratio, with a high-quality downscale, and kept as a small PNG (a blob URL) for every card that shows it again. Until it is
// drawn (and under node, where nothing is drawn) the card shows the atlas's mip 1 cut with CSS, as it did before.

/** the drawn thumbnails (blob URLs) by picture, box and device pixel ratio; the ones being drawn */
const DRAWN = new Map<string, string>(), PENDING = new Map<string, Promise<string | null>>();
/** the pictures being drawn from, by URL, and how many thumbnails still wait on each: let go when none does (an atlas page is 16 MB decoded) */
const SOURCES = new Map<string, { img: Promise<HTMLImageElement>; n: number }>();
function hold(url: string) {
  let s = SOURCES.get(url);
  if (!s) { const img = new Image(); img.decoding = 'async'; img.src = url; s = { img: img.decode().then(() => img), n: 0 }; SOURCES.set(url, s); }
  s.n++; return s.img;
}
function letGo(url: string) { const s = SOURCES.get(url); if (s && --s.n <= 0) SOURCES.delete(url); }

/** a picture drawn into a w x h css px box at dpr: its master or atlas cell fitted inside it (contain), as a blob URL; null when it cannot be */
async function draw(it: LibItem, w: number, h: number, dpr: number): Promise<string | null> {
  const src = thumbSource(it); if (!src.url) return null;
  const url = src.url;
  try {
    const img = await hold(url);
    const [sx, sy, sw, sh] = src.kind === 'master' ? [0, 0, img.naturalWidth, img.naturalHeight] : src.rect;
    const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr)), k = Math.min(W / sw, H / sh);
    const dw = Math.max(1, Math.round(sw * k)), dh = Math.max(1, Math.round(sh * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); if (!g) return null;
    // (a cell stored mirrored in the atlas is drawn the right way round)
    if (src.kind === 'atlas' && src.flip) { g.translate(W, 0); g.scale(-1, 1); }
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    let bmp: ImageBitmap | null = null;
    try { bmp = await createImageBitmap(img, Math.round(sx), Math.round(sy), Math.round(sw), Math.round(sh), { resizeWidth: dw, resizeHeight: dh, resizeQuality: 'high' }); } catch { bmp = null; }
    if (bmp) { g.drawImage(bmp, Math.round((W - dw) / 2), Math.round((H - dh) / 2)); bmp.close(); }
    else g.drawImage(img, sx, sy, sw, sh, Math.round((W - dw) / 2), Math.round((H - dh) / 2), dw, dh);
    const blob = await new Promise<Blob | null>(r => cv.toBlob(r, 'image/png'));
    return blob ? URL.createObjectURL(blob) : null;
  } catch { return null; } finally { letGo(url); }
}
function drawn(key: string, it: LibItem, w: number, h: number, dpr: number): Promise<string | null> {
  let p = PENDING.get(key);
  if (!p) { p = draw(it, w, h, dpr).then(u => { PENDING.delete(key); if (u) DRAWN.set(key, u); return u; }); PENDING.set(key, p); }
  return p;
}

/** a library sprite's thumbnail fitted in a square of side size (css px); an old building's thumbnail is its new-art stand-in (newart.ts);
 *  flip: mirrored (T257: a natural prop the player flipped) */
export function Thumb({ it, size, flip = false }: { it: LibItem; size: number; flip?: boolean }) {
  const t = thumbItem(it), { w, h } = thumbBox(t, size), dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const key = `${t.id}|${w}x${h}@${dpr}`;
  const [got, setGot] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (DRAWN.has(key)) return;
    let live = true;
    void drawn(key, t, w, h, dpr).then(u => { if (live && u) setGot({ key, url: u }); });
    return () => { live = false; };
  }, [key]); // (the key names the picture, its box and the dpr: all the drawing depends on)
  const url = DRAWN.get(key) ?? (got?.key === key ? got.url : null), mirror = flip ? { transform: 'scaleX(-1)' } : null;
  if (url) return <img src={url} width={w} height={h} alt="" draggable={false} className="pointer-events-none select-none" style={{ width: w, height: h, ...mirror }} data-thumb="sharp" />;
  // while it is drawn, and under node: the atlas page's mip 1 cut out with CSS
  const [page, u0, v0, u1, v1] = t.tex, P = ATLAS_SIZE / 2, cw = Math.abs(u1 - u0) * P, ch = (v1 - v0) * P, k = Math.min(size / cw, size / ch);
  return <div data-thumb="mip" style={{ width: cw * k, height: ch * k, backgroundImage: `url(${ATLAS_PAGES[page]![1]})`, backgroundSize: `${P * k}px ${P * k}px`, backgroundPosition: `${-Math.min(u0, u1) * P * k}px ${-v0 * P * k}px`, ...(flip !== (u0 > u1) ? { transform: 'scaleX(-1)' } : null) }} />;
}
