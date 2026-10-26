// The lot lab's light boot (T157, dev builds only: ?lotlab). The owner (2026-10-26), after the Claude app crashed twice from memory: "we need
// to optimise the app. the studio is taking too much ram to run the full game". The studio's Lots tab frames the lab, and the lab used to
// boot the whole game: the town, the city worker, three ground workers each with its own texture pack, the course workers, the full-budget
// sprite atlas. Measured on main (issue #336): about 4.2 GB of renderer and GPU memory for one lot on one street.
//
// The light boot gives the lab only what it draws:
// - a flat map of plain grass (no rivers, hills, towns, forest or town trees; no save read or written), and a box of LAB_BOX tiles round the
//   lab street that the camera keeps to, so nothing outside it is ever baked;
// - no city worker (no traffic, town growth or budget), no course workers (no course), no money floats, no HUD or minimap;
// - one ground worker, with small decode caches and only the photo textures a lot uses built up front;
// - a sprite atlas with a small budget: every page is resident only at a coarse mip, the cells a lot draws stream in finer (atlas-pages.ts).
// Every lab feature still runs on the real engine (stageLab, the lot composer, the dev editor). The plain game boots as before (GAME_BOOT
// is what the engine uses when no light boot is given).
//
// This module is pure (no DOM, no GL): the engine and App.tsx read its answers, the tests check them (tests/lab-boot.test.ts).
import { MAP } from '../iso';
import type { BBox } from '../network';
import { GAME_BOOT, withGroundLevers, type BootOptions } from '../boot';

/** the side of the lab's map box in tiles: the lab street (90 tiles each way of its centre, engine.ts stageLab, also on a diagonal), the lab
 *  lot and its neighbours (two each way along the street, three across: lot-lab-plan.ts neighbourLots) with room to spare */
export const LAB_BOX = 320;
/** the lab's furthest zoom: the whole box across a 1600 px wide frame (the lab's own camera floor is closer still, lot-lab.ts keepCam) */
export const LAB_ZOOM_MIN = 0.04;
/** the photo textures the lab's ground workers build up front: the ones a town lot lays without asking (renderer.ts: a lot's concrete is the
 *  chip seal mosaic, its paths and yards gravel and dirt, the lot asphalt the Paint tool's asphalt); the golf, field and water photos are
 *  built only if a lab lot paints them (ground.worker.ts 'lotground') */
export const LAB_EAGER_PHOTOS: readonly string[] = ['chipSeal', 'dirt', 'gravel', 'asphalt'];

/** the lab's map box: LAB_BOX tiles round the map's centre (where boot.ts flatTerrain puts its start block, and stageLab its street) */
export function labBox(): BBox {
  const h = LAB_BOX / 2, c = MAP / 2;
  return [c - h, c - h, c + h, c + h];
}

/** the lot lab's light boot */
export function labBoot(): BootOptions {
  return {
    kind: 'lab', groundWorkers: 1, sim: false, atlasMB: 16, atlasKeep: 2, groundPx: 16e6, tileSources: 8, paintedSources: 6, eagerPhotos: LAB_EAGER_PHOTOS,
    saveTextureCache: false, readTextureCache: true, softCanvases: true, lazyTextures: true, lazyTints: true, box: labBox(), zoomMin: LAB_ZOOM_MIN, trees: false, moneyFloats: false, save: false, map: 'flat',
  };
}

/** the boot for a page: the light boot for the lot lab (a dev build with ?lotlab), else the game's; ?lotlab&fullboot boots the lab on the whole
 *  game as before T157 (to compare, or if the light boot ever misses something) */
export function bootFor(search: string, dev: boolean): BootOptions {
  const q = new URLSearchParams(search);
  if (dev && q.has('lotlab') && !q.has('fullboot')) return labBoot();
  // T166: a dev build's ?ground=<levers> boots the game with exactly those ground-worker levers on (boot.ts GROUND_LEVERS; ?ground=old: none)
  return dev && q.has('ground') ? withGroundLevers({ ...GAME_BOOT }, q.get('ground') ?? '') : { ...GAME_BOOT };
}
