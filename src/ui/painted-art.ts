// #1304: the painted pictures the UI's canvases draw under their live marks (src/assets/ui/art: the swing meter's face, the spin ball), in place of the
// code-drawn stand-ins. One image each, loaded on first ask; null until it has loaded, when its file is missing, under plain node, or with the old look
// (ui-art-look.ts 'vector'): the caller then draws its old vector picture.
import { paintedUi } from './ui-art-look';

const URLS: Record<string, string> = (() => { try { return import.meta.glob('../assets/ui/art/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>; } catch { return {}; } })();
const images = new Map<string, HTMLImageElement>();

/** the URL of a painted UI picture (name: its file's stem), or undefined */
export const paintedArtUrl = (name: string): string | undefined => URLS[`../assets/ui/art/${name}.webp`];
/** the loaded picture, or null (not painted, not loaded yet, or the old look); onLoad runs once it loads (to redraw) */
export function paintedArt(name: string, onLoad?: () => void): HTMLImageElement | null {
  if (!paintedUi() || typeof Image === 'undefined') return null;
  const url = paintedArtUrl(name); if (!url) return null;
  let img = images.get(name);
  if (!img) { img = new Image(); img.decoding = 'async'; img.src = url; images.set(name, img); }
  if (img.complete && img.naturalWidth > 0) return img;
  if (onLoad) img.addEventListener('load', onLoad, { once: true });
  return null;
}
