// T252 (#731; the owner, 2026-10-28: "change the icon the the puck with the actual texture with the border it has"): the Holes swatches' pucks.
// Each is the brush cursor's chip drawn small (ext/course-cursor swatchPuck: the surface's own painted tile through its look's tint and tone,
// with the border the course lays round it: the green's fringe, the first cut round a fairway or a tee, a bunker's lip, a pond's bank; the
// rough, the long grass and the waste area plain), made once into an image and kept by its look, so the swatch and the cursor show the same
// puck. A look changed (My looks, or Studio › Painted saving the surfaces file) gives a new key and the puck is made again; a picture still
// loading is drawn as its colour and the puck made again when it lands. Under plain node (the esbuild test bundle that renders the panels)
// there is no document and no texture source: no pucks, the swatch keeps its marked disc (SurfaceMark), as Icon.tsx does without pictures.
import { useSyncExternalStore } from 'react';
import type { Game } from '../../game/engine';
import type { BrushKind } from '../../game/paint';
import { swatchPuck, type CursorTexture, type PuckStyle, type SpriteCanvas } from '../../game/ext/course-cursor';
import { puckBandOf, type BrushLooks, type PuckBand } from '../../game/course-look';
import { finishOf } from '../../game/course-finish';
import { onPaintedSurfaces, paintedSurfaces } from '../../game/painted-surfaces-live';

/** a swatch puck's top face across, css px */
export const SWATCH_PUCK_CSS = 44;
/** a made puck: its image, its size in css px, and whether every picture it needed was there (else the texture revision it was drawn at) */
interface Made { url: string; w: number; h: number; whole: boolean; rev: number }
/** the pucks made, by key (kept small: one per surface and look) */
const made = new Map<string, Made>();
const MAX_MADE = 64;
/** the store's version: a new one re-renders the swatches (a picture landed, a look changed) */
let version = 0;
const subs = new Set<() => void>();
const bump = () => { version++; for (const s of subs) s(); };
const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
const snap = () => version;

/** the painted surfaces file's changes (Studio › Painted saving it): every puck is made again */
let fileNo = 0, unwatchFile: (() => void) | null = null;
function watchFile() { if (!unwatchFile) unwatchFile = onPaintedSurfaces(() => { fileNo++; made.clear(); bump(); }); }
/** a puck drawn while a picture loaded: the texture source is watched until its revision moves (the picture landed), then the swatches render
 *  again and that puck is made again; given up after WATCH_MS (a texture with no picture stays its colour) */
let watch: ReturnType<typeof setInterval> | null = null, watchRev = -1, watchUntil = 0;
const WATCH_MS = 20000;
function waitFor(tex: CursorTexture) {
  watchUntil = Date.now() + WATCH_MS; watchRev = tex.rev();
  if (watch) return;
  watch = setInterval(() => {
    const r = tex.rev();
    if (r !== watchRev) { watchRev = r; bump(); }
    if (Date.now() > watchUntil || ![...made.values()].some(m => !m.whole)) { clearInterval(watch!); watch = null; }
  }, 150);
}

/** a look's part of a puck's key */
const styleKey = (st: PuckStyle) => `${st.tex}|${st.scale}|${st.angle}|${st.border}|${st.btex}|${st.bscale}|${st.bangle}|${st.tone}|${st.toneAmt}|${st.tint}`;
const bandKey = (pb: PuckBand | null) => (pb ? `${pb.name}|${pb.tex.tex}|${pb.tex.sc}|${pb.tex.a}|${pb.tex.t ?? 0}|${pb.tex.ta ?? 0}|${pb.tex.tc ?? ''}|${pb.tone ? `${pb.tone.tc}${pb.tone.ta}` : ''}` : '-');
const domCanvas = (w: number, h: number): SpriteCanvas => Object.assign(document.createElement('canvas'), { width: w, height: h });

/** re-renders the caller when a puck lands or a look changes (the Holes swatches call it) */
export function useSwatchPucks(): number { return useSyncExternalStore(subscribe, snap, snap); }

/** the surface's look and border as its puck shows them: its brush style (the look My looks sets) and the band the course lays round it */
export function puckLookOf(kind: string, brush: BrushLooks): { st: PuckStyle; pb: PuckBand | null } | null {
  const st = brush[kind as BrushKind]?.style as PuckStyle | undefined; if (!st) return null;
  return { st, pb: puckBandOf(kind, brush, finishOf(paintedSurfaces())) };
}

/** brush kind `kind`'s swatch puck, as an image (url) and its css size; null under plain node or with no texture source (the swatch then
 *  shows its marked disc) */
export function swatchPuckOf(game: Game, kind: BrushKind): { url: string; w: number; h: number } | null {
  const tex = (game as { cursorTexture?: CursorTexture }).cursorTexture;
  if (typeof document === 'undefined' || !tex) return null;
  const look = puckLookOf(kind, game.paint.brush as BrushLooks); if (!look) return null;
  watchFile();
  const d = Math.min(3, Math.max(1, Math.round((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) * 2) / 2));
  const key = `${kind}|${d}|${fileNo}|${styleKey(look.st)}|${bandKey(look.pb)}`;
  const m = made.get(key);
  if (m && (m.whole || m.rev === tex.rev())) return m;
  const { c, whole } = swatchPuck(domCanvas, kind, look.st, look.pb, SWATCH_PUCK_CSS, d, tex);
  let url = ''; try { url = (c as HTMLCanvasElement).toDataURL('image/png'); } catch { return null; }
  const out: Made = { url, w: Math.round(c.width / d), h: Math.round(c.height / d), whole, rev: tex.rev() };
  made.delete(key); made.set(key, out); if (made.size > MAX_MADE) made.delete(made.keys().next().value!);
  if (!whole) waitFor(tex);
  return out;
}
