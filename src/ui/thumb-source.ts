// T257 (#747): where a library picture's thumbnail is drawn from (the owner, 2026-10-29: "bad ui thumbnails. the thumbs pixelate"). The
// Props panel's and the plant brush's cards were cut from an atlas page's mip 1 with CSS: a 0.8 m boulder is about 15 px there, blown up to
// 50. Now a picture with a full-resolution master in the repo is drawn from it (the concept kit's art/concept-kit/<slug>.webp, T232's
// building-site kit's art/construction/site-kit/<slug>.webp: both at up to 2x the size the game draws them), anything else from its atlas
// page's mip 0 (no smaller mip); Thumb.tsx draws either at the screen's device pixel ratio, once, and caches the result.
// Vite fills the globs in when it builds; under plain node (the esbuild test bundle) there are none, so a picture has no URL (as Icon.tsx).
import { ATLAS_PAGES, ATLAS_SIZE } from '../game/library';
import type { LibItem } from '../game/types';

const glob = (g: () => Record<string, string>): Record<string, string> => { try { return g(); } catch { return {}; } };
/** the masters' URLs by repo path ('art/concept-kit/boulder-small-a.webp') */
const MASTER_URLS: Readonly<Record<string, string>> = Object.fromEntries(Object.entries({
  ...glob(() => import.meta.glob('../../art/concept-kit/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  ...glob(() => import.meta.glob('../../art/construction/site-kit/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
  // T258: the range's ChatGPT art (prep-range-art.mjs; none until the owner's pictures land)
  ...glob(() => import.meta.glob('../../art/range-kit/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>),
}).map(([k, v]) => [k.replace(/^(\.\.\/)+/, ''), v]));

/** the repo path of a library picture's full-resolution master, or null: the concept kit's (kit:<slug>), the building-site kit's
 *  (construction:site-<...>, construction:timber-frame-<n>) and T258's range art (range:<slug>-<view>) */
export function masterPath(id: string): string | null {
  if (id.startsWith('kit:')) return `art/concept-kit/${id.slice(4)}.webp`;
  if (id.startsWith('range:')) return `art/range-kit/${id.slice(6)}.webp`;
  const m = /^construction:(site-[a-z0-9-]+|timber-frame-\d+)$/.exec(id);
  return m ? `art/construction/site-kit/${m[1]}.webp` : null;
}

const HAS_URLS = (u: Readonly<Record<string, string>>) => { for (const _ in u) return true; return false; };
/** what a thumbnail is drawn from: the master (the whole picture) or an atlas page's mip 0 (rect: x, y, w, h in its pixels; flip: the cell
 *  is stored mirrored); url null under node */
export type ThumbSource =
  | { kind: 'master'; path: string; url: string | null }
  | { kind: 'atlas'; page: number; level: 0; url: string | null; rect: [number, number, number, number]; flip: boolean };
/** a library picture's thumbnail source (urls: the masters' URLs by repo path; the build's, or a test's) */
export function thumbSource(it: LibItem, urls: Readonly<Record<string, string>> = MASTER_URLS): ThumbSource {
  const path = masterPath(it.id);
  // (a master the build has: its URL; under node, where no URL is known, the master the repo names)
  if (path && (urls[path] || !HAS_URLS(urls))) return { kind: 'master', path, url: urls[path] ?? null };
  const [page, u0, v0, u1, v1] = it.tex, S = ATLAS_SIZE;
  return { kind: 'atlas', page, level: 0, url: ATLAS_PAGES[page]?.[0] ?? null, rect: [Math.min(u0, u1) * S, v0 * S, Math.abs(u1 - u0) * S, (v1 - v0) * S], flip: u0 > u1 };
}
/** the box (css px) a picture's thumbnail fills in a square of side size: its trimmed picture's aspect */
export function thumbBox(it: LibItem, size: number): { w: number; h: number } {
  const qw = Math.max(1e-3, it.quad[2] - it.quad[0]), qh = Math.max(1e-3, it.quad[3] - it.quad[1]), k = Math.min(size / qw, size / qh);
  return { w: Math.max(1, Math.round(qw * k)), h: Math.max(1, Math.round(qh * k)) };
}
