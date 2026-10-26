/** The painted ground on a ground chunk (T082, #147): a look's levels (each a periodic painting at its own metres, painted-families.ts) laid in
 *  the stochastic layout of painted-grass-lod.ts (soft patches at their own phases and small turns on a jittered world-space lattice; a level
 *  that covers the whole map is laid once, aligned to it, as it cannot repeat), crossfaded by their weights, then the world-space hue and value
 *  drift over them. Composed per chunk (or the part of it a surface uses) into a chunk-sized picture; the map grass, the lawns, the course
 *  surfaces and the painted areas fill from it, so they line up and no tile period shows anywhere. Runs in the ground workers (OffscreenCanvas). */
import { canvas, ctx2d, type C2D, type Cnv } from './canvas2d';
import { PATCH_SPRITES, grassPatches, grassTone, patchAngle, patchPhase, patchRadius, toneOps, trimLru } from './painted-grass-lod';

type Box = readonly [number, number, number, number];
/** the sample step of the drift's picture, tiles (its shortest wave is 28 tiles, so 4 is smooth after the bilinear stretch) */
const TONE_STEP = 4;
/** the bytes of patch pictures a worker keeps (one set per painting, patch size and density; the least recently used go first) */
export const SPRITE_BYTES = 128 << 20;
/** one level as a chunk lays it: its painting (pic gives the mip with at least that many px across), the tiles one repeat covers, its weight in
 *  the crossfade, and whether it covers the whole map (laid once, aligned to the map) */
export interface LayLevel { pic: (px: number) => Cnv | null; period: number; weight: number; map: boolean }

export class PaintedGround {
  private sprites = new Map<string, { set: Cnv[]; bytes: number }>();
  private ids = new WeakMap<Cnv, number>(); private nextId = 1;
  private spriteBytes = 0;

  /** the painting's PATCH_SPRITES patch pictures for radius R (tiles) at spp px a tile: the painting turned by sprite k's angle about the centre,
   *  at its phase, through a soft round mask (a flat core to 35% of the radius, then easing out) */
  private patchSet(img: Cnv, period: number, R: number, spp: number) {
    let id = this.ids.get(img); if (!id) { id = this.nextId++; this.ids.set(img, id); }
    const key = `${id}:${period}:${R}:${spp.toFixed(3)}`, have = this.sprites.get(key);
    if (have) { this.sprites.delete(key); this.sprites.set(key, have); return have.set; }
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
    const bytes = S * S * 4 * PATCH_SPRITES;
    this.sprites.set(key, { set, bytes }); this.spriteBytes += bytes;
    for (const [k, v] of this.sprites) { if (this.spriteBytes <= SPRITE_BYTES || k === key) break; this.sprites.delete(k); this.spriteBytes -= v.bytes; }
    return set;
  }

  private means = new WeakMap<Cnv, string>();
  /** a picture's mean colour (from a 16 px copy) */
  meanOf(img: Cnv) {
    let m = this.means.get(img);
    if (!m) { const c = canvas(16, 16), g = ctx2d(c); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, 16, 16); const d = g.getImageData(0, 0, 16, 16).data, s = [0, 0, 0]; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) s[k] += d[i + k]! / 256; m = `rgb(${s.map(Math.round).join(',')})`; this.means.set(img, m); }
    return m;
  }
  /** one level over tile box `box` of g (transform: the chunk's iso matrix at cache level L): its mean colour underneath, then its patches (or
   *  the painting laid once over the map when it covers it); false when its picture is not decoded */
  private layLevel(g: C2D, lv: LayLevel, box: Box, L: number): boolean {
    if (lv.map) {
      const img = lv.pic(Math.min(4096, lv.period * 80 * L)); if (!img) return false;
      const p = g.createPattern(img, 'repeat')!, s = lv.period / img.width; p.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
      g.fillStyle = p; g.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2);
      return true;
    }
    // patch pictures at the chunk's density (80 L px a tile: a tile edge is 71.6 L chunk px) or the painting's own, at most 640 px across
    const R = patchRadius(lv.period), full = lv.pic(Infinity); if (!full) return false;
    const spp = Math.min(full.width / lv.period, 80 * L, 640 / (2 * R)), img = lv.pic(Math.ceil(spp * lv.period)) ?? full;
    g.fillStyle = this.meanOf(img); g.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2);
    const set = this.patchSet(img, lv.period, R, spp);
    for (const q of grassPatches(box, R)) g.drawImage(set[q.k]!, q.x - R, q.y - R, 2 * R, 2 * R);
    return true;
  }
  private tmp: Cnv | null = null;
  /** a look's levels over tile box `box` of g (transform: the chunk's iso matrix M at cache level L; any clip g has stays): the heaviest level
   *  laid opaque, the other over it at its weight, then the drift (drift false: none); false when a picture is missing */
  composeLevels(g: C2D, levels: readonly LayLevel[], box: Box, L: number, drift = true): boolean {
    const order = [...levels].sort((a, b) => b.weight - a.weight);
    if (!order.length || !this.layLevel(g, order[0]!, box, L)) return false;
    for (const lv of order.slice(1)) {
      const W = g.canvas.width, H = g.canvas.height;
      if (!this.tmp || this.tmp.width !== W || this.tmp.height !== H) this.tmp = canvas(W, H);
      const t = ctx2d(this.tmp); t.setTransform(1, 0, 0, 1, 0, 0); t.clearRect(0, 0, W, H); t.setTransform(g.getTransform());
      if (!this.layLevel(t, lv, box, L)) return false;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = lv.weight; g.drawImage(this.tmp, 0, 0); g.restore();
    }
    if (drift) this.drawTone(g, box);
    return true;
  }
  /** a single periodic picture (img repeating over period tiles) laid in the patches over tile box `box` (the leaf litter, T111): base true
   *  puts its mean colour under it and the drift over it; false lays the patches alone (a picture with transparent gaps) */
  compose(g: C2D, img: Cnv, period: number, box: Box, L: number, base = true) {
    const R = patchRadius(period), spp = Math.min(img.width / period, 80 * L, 640 / (2 * R));
    if (base) { g.fillStyle = this.meanOf(img); g.fillRect(box[0] - 1, box[1] - 1, box[2] - box[0] + 2, box[3] - box[1] + 2); }
    const set = this.patchSet(img, period, R, spp);
    for (const q of grassPatches(box, R)) g.drawImage(set[q.k]!, q.x - R, q.y - R, 2 * R, 2 * R);
    if (base) this.drawTone(g, box);
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
    // only under the gain picture: the rest of the copy goes, so nothing past the drifted box is added twice
    lg.globalCompositeOperation = 'destination-in'; stretch(lg, light);
    g.save(); g.globalCompositeOperation = 'multiply'; stretch(g, shade);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'lighter'; g.drawImage(this.lit, 0, 0); g.restore();
  }
}
/** keeps trimLru reachable from here for the callers that size their own caches */
export { trimLru };
