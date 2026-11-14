// The layers over the game behind the jam's title card (J12, #1271): the still picture of the place the scene starts at (the first picture, shown at once, and the
// picture the scene gives way to on a slow machine) and the cross-fade's copy of the last picture (showcase-director.ts draws into it). Both sit under the card
// and over the game's canvases; neither takes the pointer. The game itself runs under them (engine.ts show).
import type { RefObject } from 'react';
import { POSTER_FADE_MS, anchorOf } from '../../game/showcase';

/** the stills by stop id (src/assets/showcase/<id>.jpg: a shot of the stop's first frame, made by scripts/jam/menu-scene-shots.mjs) */
const POSTERS = import.meta.glob('../../assets/showcase/*.jpg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const posterOf = (id: string): string | null => POSTERS[`../../assets/showcase/${id}.jpg`] ?? null;
/** where the still's point of interest sits, as the camera puts it for this screen (right of the card on a wide one, in the middle on a narrow one: showcase.ts anchorOf) */
const objectPositionOf = (): string => { const a = anchorOf(window.innerWidth, window.innerHeight); return `${a.x * 100}% ${a.y * 100}%`; };

export function MenuScene({ poster, alt, posterOn, snapRef }: { poster: string | null; alt: string; posterOn: boolean; snapRef: RefObject<HTMLCanvasElement | null> }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[55] overflow-hidden" data-testid="menu-scene">
      {/* the copy of the last picture (opacity is the director's, set on the element) */}
      <canvas ref={snapRef} className="absolute inset-0 h-full w-full opacity-0" aria-hidden="true" />
      {poster && <img src={poster} alt={alt} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: objectPositionOf(), opacity: posterOn ? 1 : 0, transition: `opacity ${POSTER_FADE_MS}ms ease-in-out` }} data-testid="menu-still" draggable={false} />}
    </div>
  );
}
