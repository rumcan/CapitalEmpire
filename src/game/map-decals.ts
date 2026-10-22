import { mulberry } from './iso';
import { clamp, type C2D, type Cnv } from './canvas2d';
import { DECALS } from './ground-art';
import { NATURE, NATURE_RES } from './nature-patches';
import { SOIL_H, SOIL_R, SOIL_STAMPS, SOIL_W } from './textures';

/** The map's decals: the dressing laid over the base grass before everything else (the builder's town-scene.mjs regionDressing), so the
 *  terrain layers, lots and roads cover them. Five layers: nature patches (16 m clumps of composed decals: leaves, bushes, stones), bare-soil
 *  patches, and the single grass patches, leaf scatters and tufts. Seeded per DRESS-tile region and per layer, so chunks agree and a change to
 *  one layer leaves the others where they were. The settings are the owner's: the sprite studio's Ground tab writes src/game/map-decals.json;
 *  the game (renderer.ts) and the studio's preview both place and draw them here. */

/** the region size in tiles; each layer's count is per region */
export const DRESS = 8;

export type DecalLayerId = 'nature' | 'soil' | 'grass' | 'leaves' | 'tufts';
export interface DecalLayer {
  on: boolean;
  /** how many per DRESS x DRESS tile region, on average (2.4 = 2, and a third 40% of the time) */
  count: number;
  /** the size range, 1 = the picture's own size (soil: 1 = a 45 px radius) */
  min: number; max: number;
  /** the opacity range */
  aMin: number; aMax: number;
  /** mirrored at random */
  flip: boolean;
  /** the layer's pictures left out (indices into decalPics(layer)) */
  off: number[];
}
export interface MapDecalsFile { v: 1; stamp?: string; layers: Record<DecalLayerId, DecalLayer> }

/** the layers in drawing order, with the studio's names and slider ranges */
export const DECAL_LAYERS: { id: DecalLayerId; name: string; note: string; count: [number, number]; size: [number, number] }[] = [
  { id: 'nature', name: 'Nature patches', note: '16 m clumps of leaves, bushes and stones (the big ones)', count: [0, 3], size: [0.1, 3] },
  { id: 'soil', name: 'Bare soil', note: 'ragged patches of bare earth', count: [0, 3], size: [0.2, 8] },
  { id: 'grass', name: 'Grass patches', note: 'darker and lighter tufts of grass', count: [0, 30], size: [0.1, 3] },
  { id: 'leaves', name: 'Leaf scatters', note: 'fallen leaves', count: [0, 30], size: [0.1, 3] },
  { id: 'tufts', name: 'Tufts', note: 'a fine speckle of tufts', count: [0, 30], size: [0.1, 3] },
];

/** the game's original dressing (12 decals per region: 82% grass, then leaves 70% of the rest, else tufts; soil in 30%, nature in 45%) */
export const DEFAULT_DECALS: Record<DecalLayerId, DecalLayer> = {
  nature: { on: true, count: 0.45, min: 0.85, max: 1.4, aMin: 0.92, aMax: 0.92, flip: true, off: [] },
  soil: { on: true, count: 0.3, min: 1.5, max: 4.3, aMin: 1, aMax: 1, flip: false, off: [] },
  grass: { on: true, count: 9.84, min: 0.7, max: 1.3, aMin: 0.55, aMax: 0.95, flip: true, off: [] },
  leaves: { on: true, count: 1.51, min: 0.7, max: 1.3, aMin: 0.55, aMax: 0.95, flip: true, off: [] },
  tufts: { on: true, count: 0.65, min: 0.7, max: 1.3, aMin: 0.55, aMax: 0.95, flip: true, off: [] },
};

/** a layer's pictures: indices into NATURE (nature), the soil stamps (soil) or DECALS (the rest) */
export function decalPics(id: DecalLayerId): number[] {
  if (id === 'nature') return NATURE.map((_, i) => i);
  if (id === 'soil') return Array.from({ length: SOIL_STAMPS }, (_, i) => i);
  return DECALS.flatMap((d, i) => (d.kind === id ? [i] : []));
}

const fin = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export function clampDecals(f: Partial<MapDecalsFile> | null | undefined): MapDecalsFile {
  const layers = {} as Record<DecalLayerId, DecalLayer>;
  for (const L of DECAL_LAYERS) {
    const s: Partial<DecalLayer> = f?.layers?.[L.id] ?? {}, D = DEFAULT_DECALS[L.id], n = decalPics(L.id).length;
    let min = clamp(fin(s.min, D.min), L.size[0], L.size[1]), max = clamp(fin(s.max, D.max), L.size[0], L.size[1]), aMin = clamp(fin(s.aMin, D.aMin), 0, 1), aMax = clamp(fin(s.aMax, D.aMax), 0, 1);
    if (max < min) [min, max] = [max, min];
    if (aMax < aMin) [aMin, aMax] = [aMax, aMin];
    const off = Array.isArray(s.off) ? [...new Set(s.off.filter(i => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b) : [];
    layers[L.id] = { on: typeof s.on === 'boolean' ? s.on : D.on, count: clamp(fin(s.count, D.count), L.count[0], L.count[1]), min, max, aMin, aMax, flip: typeof s.flip === 'boolean' ? s.flip : D.flip, off };
  }
  return { v: 1, ...(typeof f?.stamp === 'string' ? { stamp: f.stamp } : {}), layers };
}

/** the decal pictures: the nature patches (nature.webp), the soil stamps (textures.ts soilStamps) and the grass decals (decals.webp) */
export interface DecalArt { nature: Cnv; soil: Cnv; decals: Cnv }
const SALT: Record<DecalLayerId, number> = { nature: 0x7a7e, soil: 0x5011, grass: 0x6a55, leaves: 0x1eaf, tufts: 0x7f75 };

/** one placed decal per 5 numbers: x, y (tiles), picture (index into NATURE / the soil stamps / DECALS), signed scale (negative = mirrored), opacity */
export function placeDecals(box: readonly [number, number, number, number], set: MapDecalsFile, ground: (x: number, y: number) => boolean): Record<DecalLayerId, number[]> {
  const [tx0, ty0, tx1, ty1] = box, out = {} as Record<DecalLayerId, number[]>;
  for (const L of DECAL_LAYERS) {
    const s = set.layers[L.id], pics = decalPics(L.id).filter((_, i) => !s.off.includes(i)), o: number[] = (out[L.id] = []);
    if (!s.on || s.count <= 0 || !pics.length) continue;
    const whole = Math.floor(s.count), part = s.count - whole;
    for (let ry = Math.floor((ty0 - 8) / DRESS); ry <= Math.floor((ty1 + 8) / DRESS); ry++) for (let rx = Math.floor((tx0 - 8) / DRESS); rx <= Math.floor((tx1 + 8) / DRESS); rx++) {
      const r = mulberry(((rx * 15485863) ^ (ry * 32452843) ^ SALT[L.id]) >>> 0), n = whole + (r() < part ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = (rx + r()) * DRESS, y = (ry + r()) * DRESS, k = pics[Math.floor(r() * pics.length)], sc = s.min + r() * (s.max - s.min), f = r() < 0.5 && s.flip ? -1 : 1, a = s.aMin + r() * (s.aMax - s.aMin);
        if (ground(x, y)) o.push(x, y, k, sc * f, a);
      }
    }
  }
  return out;
}

/** draws the placed decals: M maps tiles to the canvas, L is canvas px per world px. Leaves ctx's transform and alpha changed (set them after). */
export function drawDecals(ctx: C2D, placed: Record<DecalLayerId, number[]>, art: DecalArt, L: number, M: DOMMatrix) {
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  for (const { id } of DECAL_LAYERS) {
    const p = placed[id];
    for (let i = 0; i < p.length; i += 5) {
      const S = M.transformPoint(new DOMPoint(p[i], p[i + 1])), s = p[i + 3];
      ctx.globalAlpha = p[i + 4];
      if (id === 'nature') {
        const n = NATURE[p[i + 2]]; ctx.setTransform(L * s, 0, 0, L * Math.abs(s), S.x, S.y);
        ctx.drawImage(art.nature, n.x, n.y, n.w, n.h, -n.ox, -n.oy, n.w / NATURE_RES, n.h / NATURE_RES);
      } else if (id === 'soil') {
        const f = (Math.abs(s) * 45) / SOIL_R; ctx.setTransform(L * f * Math.sign(s), 0, 0, L * f, S.x, S.y);
        ctx.drawImage(art.soil, p[i + 2] * SOIL_W, 0, SOIL_W, SOIL_H, -SOIL_W / 2, -SOIL_H / 2, SOIL_W, SOIL_H);
      } else {
        const d = DECALS[p[i + 2]]; ctx.setTransform(L * s, 0, 0, L * Math.abs(s), S.x, S.y);
        ctx.drawImage(art.decals, d.x, d.y, d.w, d.h, -d.w / 2, -d.h / 2, d.w, d.h);
      }
    }
  }
  ctx.globalAlpha = 1;
}
