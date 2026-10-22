import { ATLAS_PAGES, ATLAS_SIZE } from '../game/library';
import type { LibItem } from '../game/types';

/** a library sprite cut out of its atlas page (mip 1) with CSS */
export function Thumb({ it, size }: { it: LibItem; size: number }) {
  const [page, u0, v0, u1, v1] = it.tex, P = ATLAS_SIZE / 2, w = (u1 - u0) * P, h = (v1 - v0) * P, k = Math.min(size / w, size / h);
  return <div style={{ width: w * k, height: h * k, backgroundImage: `url(${ATLAS_PAGES[page][1]})`, backgroundSize: `${P * k}px ${P * k}px`, backgroundPosition: `${-u0 * P * k}px ${-v0 * P * k}px` }} />;
}
