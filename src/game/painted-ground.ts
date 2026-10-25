/** The painted grass on a ground chunk (T082, #147): a family's blend (Textures.sourceFor: periodic, one picture per art level) laid in the
 *  stochastic layout of painted-grass-lod.ts (soft patches at their own phases on a jittered world-space lattice), then the world-space hue and
 *  value drift over it. Composed once per chunk into a chunk-sized picture; the base ground, the lawns, the meadow and the painted areas all
 *  fill from it, so they line up and no tile period shows anywhere. Runs in the ground workers (OffscreenCanvas). */
import { canvas, ctx2d, type C2D, type Cnv } from './canvas2d';
import { PATCH_PHASES, TONE_COOL, TONE_STRENGTH, TONE_WARM, grassPatches, grassTone, patchPhase, patchRadius, trimLru } from './painted-grass-lod';

type Box = readonly [number, number, number, number];
/** the sample step of the drift's picture, tiles (its shortest wave is 28 tiles, so 4 is smooth after the bilinear stretch) */
const TONE_STEP = 4;
/** the patch pictures a worker keeps: one set per blend picture, patch size and density */
const MAX_SPRITE_SETS = 3;

export class PaintedGround {
  private sprites = new Map<string, Cnv[]>();
  private ids = new WeakMap<Cnv, number>(); private nextId = 1;

  /** the blend's PATCH_PHASES patch pictures for radius R (tiles) at spp px a tile: the blend at phase k, through a soft round mask (a flat
   *  core to 35% of the radius, then easing out) */
  private patchSet(img: Cnv, period: number, R: number, spp: number) {
    let id = this.ids.get(img); if (!id) { id = this.nextId++; this.ids.set(img, id); }
    const key = `${id}:${R}:${spp.toFixed(3)}`, have = this.sprites.get(key);
    if (have) { this.sprites.delete(key); this.sprites.set(key, have); return have; }
    const S = Math.max(4, Math.ceil(2 * R * spp)), mask = canvas(S, S), mg = ctx2d(mask), gr = mg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#000'); gr.addColorStop(0.7, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = gr; mg.fillRect(0, 0, S, S);
    const ppt = img.width / period, set: Cnv[] = [];
    for (let k = 0; k < PATCH_PHASES; k++) {
      const c = canvas(S, S), g = ctx2d(c), p = g.createPattern(img, 'repeat')!, s = spp / ppt, [u, v] = patchPhase(k);
      g.imageSmoothingQuality = 'high';
      p.setTransform(new DOMMatrix([s, 0, 0, s, -u * period * spp, -v * period * spp])); g.fillStyle = p; g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
      set.push(c);
    }
    this.sprites.set(key, set); trimLru(this.sprites, new Set([key]), MAX_SPRITE_SETS);
    return set;
  }

  /** lays the blend (img repeating over period tiles) over tile box `box` of g, whose transform is the chunk's iso matrix M at cache level L:
   *  the blend at phase 0 underneath (a few % of it shows through the patches' soft edges), the patches, then the drift */
  compose(g: C2D, img: Cnv, period: number, box: Box, L: number) {
    // patch pictures at the chunk's density (80 L px a tile: a tile edge is 71.6 L chunk px) or the blend's own, at most 640 px across
    const R = patchRadius(period), spp = Math.min(img.width / period, 80 * L, 640 / (2 * R));
    const base = g.createPattern(img, 'repeat')!, s = period / img.width; base.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    g.fillStyle = base; g.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2);
    const set = this.patchSet(img, period, R, spp);
    for (const q of grassPatches(box, R)) g.drawImage(set[q.k]!, q.x - R, q.y - R, 2 * R, 2 * R);
    drawTone(g, box);
  }
}

/** the world-space drift (painted-grass-lod.ts grassTone) over tile box `box` of g (transform: tile space): warm and lighter where the tone is
 *  up, cool and darker where it is down, at most TONE_STRENGTH; sampled every TONE_STEP tiles on the world grid, so chunks agree at their seams */
export function drawTone(g: C2D, box: Box) {
  const x0 = (Math.floor(box[0] / TONE_STEP) - 2) * TONE_STEP, y0 = (Math.floor(box[1] / TONE_STEP) - 2) * TONE_STEP;
  const w = Math.ceil((box[2] - x0) / TONE_STEP) + 3, h = Math.ceil((box[3] - y0) / TONE_STEP) + 3, small = canvas(w, h), sg = ctx2d(small), d = sg.createImageData(w, h), D = d.data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = grassTone(x0 + (i + 0.5) * TONE_STEP, y0 + (j + 0.5) * TONE_STEP), c = t >= 0 ? TONE_WARM : TONE_COOL, o = (j * w + i) * 4;
    D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = Math.round(Math.abs(t) * TONE_STRENGTH * 255);
  }
  sg.putImageData(d, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(small, x0, y0, w * TONE_STEP, h * TONE_STEP); g.restore();
}
