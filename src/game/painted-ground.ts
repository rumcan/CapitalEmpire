/** The painted grass on a ground chunk (T082, #147): a family's blend (Textures.sourceFor: periodic, one picture per art level) laid in the
 *  stochastic layout of painted-grass-lod.ts (soft patches at their own phases on a jittered world-space lattice), then the world-space hue and
 *  value drift over it. Composed once per chunk into a chunk-sized picture; the base ground, the lawns, the meadow and the painted areas all
 *  fill from it, so they line up and no tile period shows anywhere. Runs in the ground workers (OffscreenCanvas). */
import { canvas, ctx2d, type C2D, type Cnv } from './canvas2d';
import { PATCH_SPRITES, grassPatches, grassTone, patchAngle, patchPhase, patchRadius, toneOps, trimLru } from './painted-grass-lod';

type Box = readonly [number, number, number, number];
/** the sample step of the drift's picture, tiles (its shortest wave is 28 tiles, so 4 is smooth after the bilinear stretch) */
const TONE_STEP = 4;
/** the patch pictures a worker keeps: one set per blend picture, patch size and density */
const MAX_SPRITE_SETS = 2;

export class PaintedGround {
  private sprites = new Map<string, Cnv[]>();
  private ids = new WeakMap<Cnv, number>(); private nextId = 1;

  /** the blend's PATCH_SPRITES patch pictures for radius R (tiles) at spp px a tile: the blend turned by sprite k's angle about the centre, at its
   *  phase, through a soft round mask (a flat core to 35% of the radius, then easing out) */
  private patchSet(img: Cnv, period: number, R: number, spp: number) {
    let id = this.ids.get(img); if (!id) { id = this.nextId++; this.ids.set(img, id); }
    const key = `${id}:${R}:${spp.toFixed(3)}`, have = this.sprites.get(key);
    if (have) { this.sprites.delete(key); this.sprites.set(key, have); return have; }
    const S = Math.max(4, Math.ceil(2 * R * spp)), mask = canvas(S, S), mg = ctx2d(mask), gr = mg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, '#000'); gr.addColorStop(0.35, '#000'); gr.addColorStop(0.7, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    mg.fillStyle = gr; mg.fillRect(0, 0, S, S);
    const ppt = img.width / period, set: Cnv[] = [];
    for (let k = 0; k < PATCH_SPRITES; k++) {
      const c = canvas(S, S), g = ctx2d(c), p = g.createPattern(img, 'repeat')!, s = spp / ppt, [u, v] = patchPhase(k);
      g.imageSmoothingQuality = 'high';
      p.setTransform(new DOMMatrix().translateSelf(S / 2, S / 2).rotateSelf(patchAngle(k)).scaleSelf(s).translateSelf(-u * img.width, -v * img.width)); g.fillStyle = p; g.fillRect(0, 0, S, S);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
      set.push(c);
    }
    this.sprites.set(key, set); trimLru(this.sprites, new Set([key]), MAX_SPRITE_SETS);
    return set;
  }

  private means = new WeakMap<Cnv, string>();
  /** a picture's mean colour (from a 16 px copy) */
  private meanOf(img: Cnv) {
    let m = this.means.get(img);
    if (!m) { const c = canvas(16, 16), g = ctx2d(c); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data, s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k]! / 256; m = `rgb(${s.map(Math.round).join(',')})`; this.means.set(img, m); }
    return m;
  }
  /** lays the blend (img repeating over period tiles) over tile box `box` of g, whose transform is the chunk's iso matrix M at cache level L:
   *  its mean colour underneath, the patches, then the drift */
  compose(g: C2D, img: Cnv, period: number, box: Box, L: number) {
    // patch pictures at the chunk's density (80 L px a tile: a tile edge is 71.6 L chunk px) or the blend's own, at most 640 px across (only
    // the 20% zoom's near and mid mix on a dpr-2 screen asks for more, and gets 1.2x less)
    const R = patchRadius(period), spp = Math.min(img.width / period, 80 * L, 640 / (2 * R));
    // under the patches, the blend's mean colour: where their soft edges thin out the ground blurs a little, but no periodic picture shows
    g.fillStyle = this.meanOf(img); g.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2);
    const set = this.patchSet(img, period, R, spp);
    for (const q of grassPatches(box, R)) g.drawImage(set[q.k]!, q.x - R, q.y - R, 2 * R, 2 * R);
    this.drawTone(g, box);
  }
  private lit: Cnv | null = null;
  /** the world-space drift (painted-grass-lod.ts grassTone, toneOps) over tile box `box` of g (transform: tile space), sampled every TONE_STEP
   *  tiles on the world grid so chunks agree at their seams: the shade multiplied in, then the light as the grass times its gain, added
   *  (canvas 'lighter'), so it only lifts what is already lit (T110) */
  private drawTone(g: C2D, box: Box) {
    const x0 = (Math.floor(box[0] / TONE_STEP) - 2) * TONE_STEP, y0 = (Math.floor(box[1] / TONE_STEP) - 2) * TONE_STEP;
    const w = Math.ceil((box[2] - x0) / TONE_STEP) + 3, h = Math.ceil((box[3] - y0) / TONE_STEP) + 3;
    const shade = canvas(w, h), light = canvas(w, h), sd = ctx2d(shade).createImageData(w, h), ld = ctx2d(light).createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const { mul, gain } = toneOps(grassTone(x0 + (i + 0.5) * TONE_STEP, y0 + (j + 0.5) * TONE_STEP)), o = (j * w + i) * 4;
      for (let k = 0; k < 3; k++) { sd.data[o + k] = Math.round(mul[k]! * 255); ld.data[o + k] = Math.round(gain[k]! * 255); }
      sd.data[o + 3] = ld.data[o + 3] = 255;
    }
    ctx2d(shade).putImageData(sd, 0, 0); ctx2d(light).putImageData(ld, 0, 0);
    const M = g.getTransform(), W = g.canvas.width, H = g.canvas.height, stretch = (c: C2D, img: Cnv) => { c.imageSmoothingEnabled = true; c.drawImage(img, x0, y0, w * TONE_STEP, h * TONE_STEP); };
    // the light: a copy of the grass times the gain picture, added back
    if (!this.lit || this.lit.width !== W || this.lit.height !== H) this.lit = canvas(W, H);
    const lg = ctx2d(this.lit); lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'copy'; lg.drawImage(g.canvas, 0, 0);
    lg.setTransform(M); lg.globalCompositeOperation = 'multiply'; stretch(lg, light);
    g.save(); g.globalCompositeOperation = 'multiply'; stretch(g, shade);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(this.lit, 0, 0); g.restore();
  }
}
