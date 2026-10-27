// T219 follow-up (#594): pictures whose library data does not fit their picture, drawn right where a whole preset (an iconic place) asks. Pure over
// the library, no DOM. The library keeps what the generator wrote (scripts/assets/prep-views.mjs): a four-view building's footprint is the old sprite's
// box, grown or shrunk with the art (the NE view's, the SE and NW views' turned), and each view's ground point is found from the picture's lowest
// point taken as the box's near corner. The drive-in screen's old sprite was 1 x 8 tiles with its long side along y, but its pictures run the other
// way (NE and SW along x, SE and NW along y) and are 5.5 x 1.2 tiles, so every view's footprint lies across its picture and its ground point (the
// anchor) is up to 370 px off it: drawn on a lot, three of its four facings left the lot. The library data stays as it is (the studio and the saves
// hold it); a place takes the corrected footprint and the ground point from here.
//
// The art model also set the SE and NW views the other way round from the game's order (preset-art.ts: a quarter turn takes the front from +y to +x,
// the views NE, SE, SW, NW): the screen's NW picture shows its face (the front facing +x) and its SE picture its back (the front facing -x). A fix
// lists the pictures in the order of the front facing +y, +x, -y, -x, so a place's quarter turn picks the one that faces the street.
import { LIBRARY } from '../library';

type Box4 = [number, number, number, number];
/** a footprint at scale 1, tiles: its extent along the world x (hx) and y (hy), the library's boxes' convention */
interface Foot { hx: number; hy: number }
/** a fixed picture: its pictures in the order of the front facing +y, +x, -y, -x (the first is the base id), and each one's true footprint */
export interface ArtFix { front: readonly [string, string, string, string]; foot: Readonly<Record<string, Foot>> }

const SCREEN = 'variation:ref-building-drive-in-screen-b0bccc2a-plain:1';
const view = (v: string) => `view:${SCREEN}:${v}`;
/** the screen's pictures measured from their sheets (art/building-views): the long side 5.5 tiles and the thickness 1.2 (the lowest point to the
 *  leftmost and the rightmost of the footprint's corners, 64 px a tile), along x in NE and SW, along y in SE and NW */
export const ART_FIXES: Readonly<Record<string, ArtFix>> = {
  [SCREEN]: {
    front: [SCREEN, view('nw'), view('sw'), view('se')],
    foot: { [SCREEN]: { hx: 5.5, hy: 1.2 }, [view('nw')]: { hx: 1.2, hy: 5.5 }, [view('sw')]: { hx: 5.5, hy: 1.2 }, [view('se')]: { hx: 1.2, hy: 5.5 } },
  },
};
/** the fix a picture belongs to, from any of its pictures */
const FIX_OF = new Map<string, ArtFix>(Object.values(ART_FIXES).flatMap(f => f.front.map(id => [id, f] as const)));
const BY = new Map(LIBRARY.map(i => [i.id, i]));

/** the way a quarter turn of a fixed picture faces: the front's direction in world tiles for each place in `front` (+y, +x, -y, -x) */
export const FRONT_DIR: readonly { x: number; y: number }[] = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }];

/** a fixed picture turned `turns` quarters from the one given (the front's +y to +x, as preset-art.ts turned) at scale k: the picture drawn and its
 *  footprint relative to its anchor, tiles, at the true size and place. A drawn prop's anchor is where the library put it (the picture's own ground
 *  point), so the footprint's centre is off it by the ground point's difference; atW takes the anchor from a footprint box like this one. null: not
 *  a fixed picture */
export function fixedArt(id: string, turns: number, k: number): { id: string; h: Box4 } | null {
  const fix = FIX_OF.get(id); if (!fix) return null;
  const pic = fix.front[(((fix.front.indexOf(id) + Math.round(turns)) % 4) + 4) % 4]!, it = BY.get(pic), ft = fix.foot[pic], b = it?.boxes[0];
  if (!it || !ft || !b) return null;
  // the picture's lowest point (px at scale 1) is the near corner of the footprint the generator took: its centre lay (hx - hy) * 32 left and
  // (hx + hy) * 16 above it. The true footprint's centre lies where its own box puts it
  const nx = it.ax + 32 * (b.hx - b.hy), ny = it.ay + 16 * (b.hx + b.hy);
  const cx = nx - 32 * (ft.hx - ft.hy), cy = ny - 16 * (ft.hx + ft.hy);
  // the centre's offset from the anchor on screen (world px: the picture drawn k times its px), and the same in tiles (X = 64 (x - y), Y = 32 (x + y))
  const dX = k * (cx - it.ax), dY = k * (cy - it.ay), ox = dX / 128 + dY / 64, oy = dY / 64 - dX / 128, hw = ft.hx * k / 2, hh = ft.hy * k / 2;
  return { id: pic, h: [ox - hw, oy - hh, ox + hw, oy + hh] };
}
