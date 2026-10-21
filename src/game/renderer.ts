import { CHUNK_H, CHUNK_W, HH, HW, MAP, MID_K, PLAN_H, PLAN_W, mulberry, tileOf } from './iso';
import { add, linePath, mul, offsetPolyline, perp, roundPieces, roundedPath, sub, vlen, type BBox, type Decal, type Feature, type FxView, type LineRec, type Pt, type RoadNetwork, type SlabRun } from './network';
import { MOSAIC_TILES, SOIL_H, SOIL_R, SOIL_STAMPS, SOIL_W, canvas, ctx2d, type C2D, type Cnv, type Textures, type TexName } from './textures';
import { isPhotoGrass } from './grass-art';
import { DECALS, POOL_ANCHOR, PPM, SLAB_CELL } from './ground-art';
import { LOT_DECALS } from './lot-decals';
import { NATURE, NATURE_RES } from './nature-patches';
import { HS, TC, type Waterway } from './terrain/types';
import { makeNoise } from './terrain/noise';
import { classAlpha, rockAlpha, shadeField, shadeRGBA, slopeField, waterBox, waterShape } from './terrain-paint';
import { quadBox, type LotPatch, type PatchTex } from './ground-protocol';

/** screen px per tile unit along the iso axes at level 1 */
const TILE_PX = Math.hypot(HW, HH);
/** curb geometry in tiles (kit: top 0.13 m, joint 0.08 m, face 0.18 m, gutter 0.40 m) */
const CURB_TOP = 0.065, CURB_JOINT = 0.04, FACE_WORLD = 7.5, GUTTER = 0.2;
const SLAB_LEN = 1.25;
/** grass dressing regions (tiles): each is 256 m², the builder's 512 px region at zoom 1 */
const DRESS = 8;
/** bridge geometry in world px at zoom 1: deck thickness, deck underside to water, railing height */
const DECK_T = 12, PIER_H = 40, RAIL_H = 10;
const YELLOW = 'rgba(246,168,36,0.93)', WHITE = 'rgba(229,225,207,0.9)';
export interface Camera { X: number; Y: number; z: number }
/** building footprints for the planner map: x0, y0, x1, y1, colour index (tiles), five floats each */
export type PlanBlocks = Float32Array;
export const PLAN_BLOCK_COLOURS = ['#c9b79a', '#d98f5a', '#e8d27a', '#8fae6a', '#6c7c8c'];
/** lot patches are indexed in cells of this many tiles */
const LOT_CELL = 32;
/** the asphalt of the planner map (the same colour as the roads) */
const PLAN_ASPHALT = '#3c4150';
/** a patch's polygon as a closed path (tile space), all its points in order */
const polyPath = (pts: number[]) => { const p = new Path2D(); p.moveTo(pts[0], pts[1]); for (let k = 2; k + 1 < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]); p.closePath(); return p; };
/** signed shoelace area of a polygon (tile space): positive when its points run counter-clockwise on the axes */
const signedArea = (pts: number[]) => { let a = 0; const n = pts.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; } return a / 2; };

/** Paints ground chunks (the full-quality bake) and planner chunks (the far-zoom map). Runs in the ground workers. */
export class GroundPainter {
  private scratch = new Map<string, Cnv>();
  /** the noise that wobbles the class edges (fixed seed) */
  private edgeNoise = makeNoise(7);
  /** planner colours per texture, computed once */
  private planCols = new Map<TexName, string>();
  blocks: PlanBlocks = new Float32Array(0);
  /** hillshade per height sample, and the waterways with their bboxes (grown for the shore) */
  shade: Float32Array = new Float32Array(HS * HS);
  /** slope magnitude per height sample (bare rock on the steep faces) */
  slope: Float32Array = new Float32Array(HS * HS);
  waters: { w: Waterway; box: BBox }[] = [];
  /** lot ground patches by lot key, and a grid (LOT_CELL tiles) of the patches they cover, keyed by cell */
  lotPatches = new Map<string, LotPatch[]>();
  private lotGrid = new Map<number, LotPatch[]>();
  constructor(public terrain: Uint8Array, public net: RoadNetwork, public tex: Textures) {}
  /** take a new terrain: classes, height samples and waterways */
  setTerrain(cls: Uint8Array, height: Float32Array, waters: Waterway[]) { this.terrain.set(cls); this.shade = shadeField(height); this.slope = slopeField(height); this.waters = waters.map(w => ({ w, box: waterBox(w.pts, 4) })); }
  /** apply lot ground edits: each key in `set` replaces its patches, each key in `drop` loses them */
  setLotGround(set: [string, LotPatch[]][], drop: string[]) {
    for (const k of drop) this.lotRemove(k);
    for (const [k, ps] of set) { this.lotRemove(k); if (ps.length) { this.lotPatches.set(k, ps); for (const p of ps) this.lotCells(p, c => { const l = this.lotGrid.get(c); if (l) l.push(p); else this.lotGrid.set(c, [p]); }); } }
  }
  private lotRemove(k: string) {
    const old = this.lotPatches.get(k); if (!old) return; this.lotPatches.delete(k);
    for (const p of old) this.lotCells(p, c => { const l = this.lotGrid.get(c); if (!l) return; const i = l.indexOf(p); if (i >= 0) l.splice(i, 1); if (!l.length) this.lotGrid.delete(c); });
  }
  /** the grid cells a patch's box covers */
  private lotCells(p: LotPatch, fn: (c: number) => void) {
    const b = quadBox(p.pts);
    for (let cx = Math.floor(b[0] / LOT_CELL); cx <= Math.floor(b[2] / LOT_CELL); cx++) for (let cy = Math.floor(b[1] / LOT_CELL); cy <= Math.floor(b[3] / LOT_CELL); cy++) fn((cx + 1024) * 4096 + cy + 1024);
  }
  /** the lot patches that may touch a tile box (each once) */
  lotsIn(b: BBox): LotPatch[] {
    const out = new Set<LotPatch>();
    for (let cx = Math.floor(b[0] / LOT_CELL); cx <= Math.floor(b[2] / LOT_CELL); cx++) for (let cy = Math.floor(b[1] / LOT_CELL); cy <= Math.floor(b[3] / LOT_CELL); cy++) for (const p of this.lotGrid.get((cx + 1024) * 4096 + cy + 1024) ?? []) out.add(p);
    return [...out];
  }
  private buffer(name: string, W: number, H: number) {
    let c = this.scratch.get(name); if (!c) { c = canvas(W, H); this.scratch.set(name, c); }
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = ctx2d(c); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, W, H); return c;
  }
  /** the tile box a world-px rectangle covers (plus a margin) */
  static tileBox(X0: number, Y0: number, X1: number, Y1: number, pad = 1): BBox {
    const corners = [tileOf(X0, Y0), tileOf(X1, Y0), tileOf(X0, Y1), tileOf(X1, Y1)];
    return [Math.floor(Math.min(...corners.map(p => p.x))) - pad, Math.floor(Math.min(...corners.map(p => p.y))) - pad, Math.ceil(Math.max(...corners.map(p => p.x))) + pad, Math.ceil(Math.max(...corners.map(p => p.y))) + pad];
  }

  /** the planner colour of a texture: its mean RGB at the planner mip, 20% desaturated and lifted 5% (cached) */
  private planColour(name: TexName): string {
    let c = this.planCols.get(name);
    if (!c) {
      const img = isPhotoGrass(name) ? this.tex.mosaicFor(name, 0.035) : this.tex.image(name, 0.035), d = ctx2d(img).getImageData(0, 0, img.width, img.height).data, n = d.length / 4;
      let r = 0, g = 0, b = 0; for (let k = 0; k < d.length; k += 4) { r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      const y = (0.3 * r + 0.59 * g + 0.11 * b) / n, lift = (s: number) => Math.round(Math.min(255, (s / n * 0.8 + y * 0.2) * 1.05));
      c = `rgb(${lift(r)},${lift(g)},${lift(b)})`; this.planCols.set(name, c);
    }
    return c;
  }

  /** the far-zoom map: flat terrain colours, sidewalks and roads as solid fills, building footprints */
  paintPlan(i: number, j: number, L: number): Cnv {
    const W = Math.round(PLAN_W * L), H = Math.round(PLAN_H * L), X0 = i * PLAN_W, Y0 = j * PLAN_H;
    const cv = canvas(W, H), ctx = ctx2d(cv);
    const M = new DOMMatrix([HW * L, HH * L, -HW * L, HH * L, -X0 * L, -Y0 * L]);
    const box = GroundPainter.tileBox(X0, Y0, X0 + PLAN_W, Y0 + PLAN_H, 2), [tx0, ty0, tx1, ty1] = box;
    ctx.fillStyle = '#2c3a20'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(M);
    ctx.fillStyle = this.planColour('grass'); ctx.fillRect(0, 0, MAP, MAP);
    // meadow and forest in 4 x 4 tile blocks (the planner never shows finer detail)
    const mx0 = Math.max(0, tx0), mx1 = Math.min(MAP, tx1), my0 = Math.max(0, ty0), my1 = Math.min(MAP, ty1), byType = new Map<number, Path2D>();
    for (let y = my0 - (my0 % 4); y < my1; y += 4) for (let x = mx0 - (mx0 % 4); x < mx1; x += 4) { const t = this.terrain[y * MAP + x]; if (t !== TC.PATCH && t !== TC.HILL) continue; let p = byType.get(t); if (!p) byType.set(t, (p = new Path2D())); p.rect(x, y, 4, 4); }
    for (const [t, p] of byType) { ctx.fillStyle = this.planColour(t === TC.PATCH ? 'meadow' : 'forest'); ctx.fill(p); }
    // bare rock on the steep faces, as a flat colour (before the river banks, so they read on top)
    const ra = rockAlpha(this.slope, tx0, ty0, tx1 - tx0, ty1 - ty0, 0.25, this.edgeNoise);
    if (ra) { const rb = this.buffer('small', ra.W, ra.H), rg = ctx2d(rb); rg.putImageData(new ImageData(ra.data as Uint8ClampedArray<ArrayBuffer>, ra.W, ra.H), 0, 0); rg.globalCompositeOperation = 'source-in'; rg.fillStyle = this.planColour('rock'); rg.fillRect(0, 0, ra.W, ra.H); rg.globalCompositeOperation = 'source-over'; ctx.setTransform(M); ctx.drawImage(rb, tx0, ty0, ra.W / 0.25, ra.H / 0.25); }
    // river banks, creeks and the water, then the hillshade (as on the ground), so the planner reads the valley too
    const vis = (b: BBox) => b[2] >= tx0 && b[0] <= tx1 && b[3] >= ty0 && b[1] <= ty1, near = this.waters.filter(w => vis(w.box));
    const shape = (kind: 'river' | 'creek', extra: number, col: string) => { const p = new Path2D(); let any = false; for (const w of near) if (w.w.kind === kind) any = waterShape(p, w.w.pts, extra, box) || any; if (any) { ctx.fillStyle = col; ctx.fill(p); } };
    shape('river', 3, this.planColour('bank'));
    const sm = shadeRGBA(this.shade, tx0, ty0, tx1 - tx0, ty1 - ty0, 0.25), sb = this.buffer('small', sm.W, sm.H);
    ctx2d(sb).putImageData(new ImageData(sm.data as Uint8ClampedArray<ArrayBuffer>, sm.W, sm.H), 0, 0); ctx.setTransform(M); ctx.drawImage(sb, tx0, ty0, sm.W / 0.25, sm.H / 0.25);
    shape('river', 0, this.planColour('water'));
    shape('creek', 0, this.planColour('water'));
    // lot ground as flat fills (before the roads, so the kerbs stay on top)
    const planFill = (t: PatchTex) => t === 'asphalt' || t === 'asphaltDark' || t === 'asphaltWorn' ? PLAN_ASPHALT : t === 'slabs' ? '#9a9184' : this.planColour(t as TexName);
    const lotAll = this.lotsIn(box).filter(p => !p.top), paintsP = lotAll.filter(p => p.paint).sort((a, b) => a.paint!.z - b.paint!.z);
    for (const p of [...lotAll.filter(p => !p.paint && p.tex !== 'marks'), ...paintsP]) { ctx.fillStyle = planFill(p.tex); ctx.fill(polyPath(p.pts)); }
    const v = this.net.view(box), minW = 1.2 / (TILE_PX * L);
    const fill = (list: Feature[], col: string) => { ctx.strokeStyle = ctx.fillStyle = col; ctx.lineJoin = 'round'; for (const f of list) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.lineWidth = Math.max(minW, f.w); ctx.stroke(f.path); } else ctx.fill(f.path); } };
    fill(v.walkF, '#9a9184'); fill(v.asphF.filter(f => f.tex === 'gravel'), this.planColour('roadgravel')); fill(v.asphF.filter(f => f.tex !== 'gravel'), '#3c4150'); fill(v.medianF, '#557a35');
    ctx.fillStyle = '#557a35'; for (const r of v.rbIslands) { ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.fill(); }
    // tunnel routes have no road fills, so the planner marks them with a dashed line
    ctx.strokeStyle = 'rgba(60,65,80,0.85)'; ctx.lineCap = 'butt'; ctx.setLineDash([3, 2]);
    for (const t of v.tunnels) { ctx.lineWidth = Math.max(minW, t.w); ctx.stroke(linePath(t.pts, false)); }
    ctx.setLineDash([]);
    const b = this.blocks;
    for (let k = 0; k + 4 < b.length; k += 5) { if (b[k + 2] < tx0 || b[k] > tx1 || b[k + 3] < ty0 || b[k + 1] > ty1) continue; ctx.fillStyle = PLAN_BLOCK_COLOURS[b[k + 4] | 0] ?? PLAN_BLOCK_COLOURS[0]; ctx.fillRect(b[k], b[k + 1], b[k + 2] - b[k], b[k + 3] - b[k + 1]); }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = Math.max(0.3, minW); ctx.strokeRect(0, 0, MAP, MAP);
    return cv;
  }

  /** a screen-space texture aligned to the world origin, for a context whose transform is the chunk's iso matrix */
  private screenPattern(g: C2D, name: TexName, L: number, X0: number, Y0: number, Minv: DOMMatrix, G?: DOMMatrix) {
    const img = this.tex.image(name, L), p = g.createPattern(img, 'repeat')!;
    const ox = ((X0 * L) % img.width + img.width) % img.width, oy = ((Y0 * L) % img.height + img.height) % img.height;
    const T0 = Minv.multiply(new DOMMatrix([1, 0, 0, 1, -ox, -oy])); p.setTransform(G ? G.multiply(T0) : T0); return p;
  }
  /** the asphalt mosaic, which lives in ground (tile) space: one period = MOSAIC_TILES tiles; G turns it about the origin */
  private groundPattern(g: C2D, img: Cnv, G?: DOMMatrix) {
    const p = g.createPattern(img, 'repeat')!, s = MOSAIC_TILES / img.width, S = new DOMMatrix([s, 0, 0, s, 0, 0]); p.setTransform(G ? G.multiply(S) : S); return p;
  }

  /** one ground chunk (CHUNK_W x CHUNK_H world px) at cache level L: the full-quality bake. lite = a district chunk
   *  (MID_K x MID_K ground chunks) for far zooms, without the detail too small to see there (slab sprites, litter,
   *  decals, tyre marks, wheel wear, curb joints) */
  paint(i: number, j: number, L: number, lite = false): Cnv {
    const CW = CHUNK_W * (lite ? MID_K : 1), CH = CHUNK_H * (lite ? MID_K : 1);
    const W = Math.round(CW * L), H = Math.round(CH * L), X0 = i * CW, Y0 = j * CH;
    const cv = canvas(W, H), ctx = ctx2d(cv);
    const M = new DOMMatrix([HW * L, HH * L, -HW * L, HH * L, -X0 * L, -Y0 * L]), Minv = M.inverse();
    const pats = new Map<TexName, CanvasPattern>();
    const pat = (n: TexName) => { let p = pats.get(n); if (!p) { p = this.screenPattern(ctx, n, L, X0, Y0, Minv); pats.set(n, p); } return p; };
    const box = GroundPainter.tileBox(X0, Y0, X0 + CW, Y0 + CH), [tx0, ty0, tx1, ty1] = box, vis = (b: BBox) => b[2] >= tx0 && b[0] <= tx1 && b[3] >= ty0 && b[1] <= ty1;
    const minW = 1 / (TILE_PX * L), net = this.net.view([tx0 - 8, ty0 - 8, tx1 + 8, ty1 + 8], !lite), tex = this.tex;
    const paint = (g: C2D, f: Feature) => { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w; g.stroke(f.path); } else g.fill(f.path); };
    const ring = (g: C2D, f: Feature, extra: number) => { g.lineCap = f.cap; if (f.kind === 'stroke') { g.lineWidth = f.w + extra; g.stroke(f.path); } else { g.lineWidth = extra; g.stroke(f.path); } };
    /** a chunk-sized mask of the given features (black where covered) */
    const maskOf = (name: string, feats: Feature[], extra = 0) => { const m = this.buffer(name, W, H), g = ctx2d(m); g.setTransform(M); g.lineJoin = 'round'; g.fillStyle = g.strokeStyle = '#000'; for (const f of feats) extra ? ring(g, f, extra) : paint(g, f); return m; };
    const composite = (buf: Cnv, op: GlobalCompositeOperation = 'source-over', alpha = 1) => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; ctx.drawImage(buf, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.setTransform(M); };
    const through = (buf: Cnv, mask: Cnv) => { const g = ctx2d(buf); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); g.globalCompositeOperation = 'source-over'; };
    ctx.setTransform(M); ctx.lineJoin = 'round'; ctx.lineCap = 'butt';

    // ---- 1. terrain: grass; meadow and forest floor through soft noise-edged class masks; river banks and creek beds from
    //      the smoothed waterway lines; the baked hillshade; then the river water (flat, so unshaded)
    ctx.fillStyle = pat('grass'); ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
    if (L >= 0.05) { this.drawDressing(ctx, box, L, M); ctx.setTransform(M); }
    const bw = tx1 - tx0, bh = ty1 - ty0;
    /** an RGBA image over the tile box (res px per tile), stretched onto g through the iso transform (bilinear) */
    const overlay = (g: C2D, img: { data: Uint8ClampedArray; W: number; H: number }, res: number) => { const s = this.buffer('small', img.W, img.H); ctx2d(s).putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.W, img.H), 0, 0); g.setTransform(M); g.imageSmoothingEnabled = true; g.drawImage(s, tx0, ty0, img.W / res, img.H / res); };
    /** a texture through a mask: `mask` draws alpha into a chunk buffer, the texture fills it (source-in), then it is composited */
    const layer = (name: TexName, mask: (g: C2D) => void) => { const b = this.buffer('layer', W, H), g = ctx2d(b); mask(g); g.globalCompositeOperation = 'source-in'; g.setTransform(M); g.fillStyle = this.screenPattern(g, name, L, X0, Y0, Minv); g.fillRect(tx0, ty0, bw, bh); g.globalCompositeOperation = 'source-over'; composite(b); };
    const cres = lite ? 1 : 4;
    for (const [want, name] of [[TC.PATCH, 'meadow'], [TC.HILL, 'forest']] as const) { const a = classAlpha(this.terrain, want, tx0, ty0, bw, bh, cres, this.edgeNoise); if (a) layer(name, g => overlay(g, a, cres)); }
    const ra = rockAlpha(this.slope, tx0, ty0, bw, bh, cres, this.edgeNoise); if (ra) layer('rock', g => overlay(g, ra, cres));
    const near = this.waters.filter(w => vis(w.box)), rivers = near.filter(w => w.w.kind === 'river'), creeks = near.filter(w => w.w.kind === 'creek');
    /** a feathered waterway mask: 4 nested shapes from extra + f down to extra - f (tiles), each adding a quarter of the alpha */
    const shore = (g: C2D, list: typeof near, extra: number, f: number, scale = 1) => { g.setTransform(M); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(0,0,0,0.25)'; for (let s = 0; s < 4; s++) { const p = new Path2D(); let any = false; for (const w of list) any = waterShape(p, w.w.pts, extra + f * (1 - (2 * s) / 3), box, scale) || any; if (any) g.fill(p); } g.globalCompositeOperation = 'source-over'; };
    if (rivers.length) layer('bank', g => shore(g, rivers, 3, 0.8));
    if (creeks.length) { layer('creek', g => shore(g, creeks, 0.5, 0.5)); layer('water', g => shore(g, creeks, 0, 0.25, 0.35)); }
    const sres = lite ? 0.25 : 0.5; overlay(ctx, shadeRGBA(this.shade, tx0, ty0, bw, bh, sres), sres); ctx.setTransform(M);
    if (rivers.length) layer('water', g => shore(g, rivers, 0, 0.3));

    const walk = net.walkF.filter(f => vis(f.bbox)), asph = net.asphF.filter(f => vis(f.bbox));
    const med = net.medianF.filter(f => vis(f.bbox)), isl = net.islandF.filter(f => vis(f.bbox));
    const rbs = net.rbIslands.filter(i => vis([i.x - i.r, i.y - i.r, i.x + i.r, i.y + i.r]));
    const brs = net.bridges.filter(b => vis(b.bbox)), ports = net.portals.filter(p => vis(p.bbox));
    /** the chunk transform shifted dy world px straight down the screen */
    const shiftM = (dy: number) => new DOMMatrix([1, 0, 0, 1, 0, dy * L]).multiply(M);
    // ---- 1a. lot ground (driveways, walks, car parks, yards) before the verges and roads: each patch in its surface,
    //      a thin dark rim (paving and pads: 0.08 tiles in) or a soft edge (asphalt: 0.15 tiles in), then the bay lines
    const all = this.lotsIn(box).filter(p => !p.top), tops = this.lotsIn(box).filter(p => p.top && p.lines?.length), marks = all.filter(p => p.tex === 'marks'), lots = all.filter(p => !p.paint && p.tex !== 'marks'), paints = all.filter(p => p.paint).sort((a, b) => a.paint!.z - b.paint!.z);
    if (lots.length) {
      const lotAsph = lots.some(p => p.tex === 'asphalt') ? this.groundPattern(ctx, tex.mosaicFor('lot', L)) : null;
      for (const p of lots) {
        const path = polyPath(p.pts);
        if (p.tex === 'slabs') { ctx.save(); ctx.clip(path); ctx.fillStyle = tex.curb.top; ctx.fill(path); if (!lite) this.slabGrid(ctx, new DOMMatrix(), quadBox(p.pts), M); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = pat('grime'); ctx.fill(path); ctx.restore(); ctx.setTransform(M); }
        else { ctx.fillStyle = p.tex === 'asphalt' ? lotAsph! : pat(p.tex as TexName); ctx.fill(path); }
        if (p.tex === 'asphalt' || p.tex === 'paving' || p.tex === 'pad' || p.tex === 'slabs') {
          ctx.save(); ctx.clip(path); ctx.strokeStyle = p.tex === 'asphalt' ? 'rgba(12,10,8,0.5)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = p.tex === 'asphalt' ? 0.3 : 0.16; ctx.stroke(path); ctx.restore();
        }
      }
      // lines: parking bays in worn off-white; furrows (field and dirt patches, the farms' crop rows) in dark brown
      // (and yellow parking lines, the bay rows that ask for them)
      for (const kind of ['furrow', 'white', 'yellow'] as const) {
        const set = lots.filter(p => p.lines && p.lines.length && ((p.tex === 'field' || p.tex === 'dirt') ? 'furrow' : p.lineCol === 'yellow' ? 'yellow' : 'white') === kind);
        if (!set.length) continue;
        const lb = this.buffer('lotLines', W, H), lg = ctx2d(lb); lg.setTransform(M); lg.lineCap = 'butt'; lg.lineJoin = 'round';
        lg.strokeStyle = kind === 'furrow' ? 'rgba(74,58,36,0.5)' : kind === 'yellow' ? 'rgba(238,192,46,0.9)' : 'rgba(229,225,207,0.85)'; lg.lineWidth = Math.max(kind === 'yellow' ? 0.1 : 0.08, minW); lg.beginPath();
        for (const p of set) for (let k = 0; k + 3 < p.lines!.length; k += 4) { lg.moveTo(p.lines![k], p.lines![k + 1]); lg.lineTo(p.lines![k + 2], p.lines![k + 3]); }
        lg.stroke(); lg.setTransform(M); lg.globalCompositeOperation = 'destination-in'; lg.fillStyle = this.screenPattern(lg, 'wear', L, X0, Y0, Minv); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        composite(lb);
      }
      ctx.setTransform(M);
    }
    // ---- 1a". the lots' flat decals (leaf drifts, worn grass, oil stains, litter, mud) over their ground
    if (marks.length) { this.drawMarks(ctx, marks, L, M, box); ctx.setTransform(M); }
    // ---- 1a'. painted areas (the Paint tool) in id order: over the lot ground, under the bridges and roads
    if (paints.length) { this.drawPaints(ctx, paints, L, X0, Y0, M, Minv, box, lite); ctx.setTransform(M); }
    // ---- 1b. bridge decks under the road: the shadow on the water, the piers, the deck's fascia and top
    for (const b of brs) {
      const path = linePath(b.pts, false);
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.setTransform(shiftM(DECK_T + PIER_H + 14)); ctx.strokeStyle = 'rgba(0,0,10,0.45)'; ctx.lineWidth = 2 * b.hw + 0.6; ctx.stroke(path);
      const piers = new Path2D();
      walkOpen(b.pts, 9, 3, (P, u) => { const n = perp(u), h = b.hw - 0.6, A = sub(P, mul(n, h)), B = add(P, mul(n, h)); piers.moveTo(A.x, A.y); piers.lineTo(B.x, B.y); });
      ctx.strokeStyle = '#4a4640'; ctx.lineWidth = 0.8;
      for (let dy = DECK_T; dy <= DECK_T + PIER_H; dy += Math.max(1, 3 / L)) { ctx.setTransform(shiftM(dy)); ctx.stroke(piers); }
      ctx.lineWidth = 2 * b.hw; ctx.strokeStyle = '#5d5850';
      for (let dy = DECK_T; dy >= 0; dy -= Math.max(1, 2 / L)) { ctx.setTransform(shiftM(dy)); ctx.stroke(path); }
      ctx.setTransform(M); ctx.strokeStyle = '#8f897e'; ctx.stroke(path);
      ctx.setTransform(M);
    }
    // ---- 2. verges (gravel) and sidewalks: slab sprites per 2.5 m, grime, masked to the sidewalk
    for (const f of walk) if (f.tex === 'gravel') { ctx.strokeStyle = 'rgba(40,32,18,0.3)'; ring(ctx, f, Math.max(0.18, 2 * minW)); }
    for (const f of walk) if (f.tex === 'gravel') { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = pat('gravel'); ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = pat('gravel'); ctx.fill(f.path); } }
    const slabWalk = walk.filter(f => f.tex === 'slabs');
    if (slabWalk.length) {
      const walkMask = maskOf('walkMask', slabWalk);
      const sb = this.buffer('slabs', W, H), sg = ctx2d(sb);
      sg.setTransform(M); sg.fillStyle = tex.curb.top; sg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
      sg.imageSmoothingEnabled = true; sg.imageSmoothingQuality = 'high';
      if (!lite) for (const run of net.slabRuns) this.drawSlabs(sg, run, box);
      sg.setTransform(M); sg.globalCompositeOperation = 'multiply'; sg.fillStyle = this.screenPattern(sg, 'grime', L, X0, Y0, Minv); sg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0); sg.globalCompositeOperation = 'source-over';
      through(sb, walkMask);
      // soft dark casing where the sidewalk meets grass
      ctx.strokeStyle = 'rgba(30,22,12,0.45)'; for (const f of slabWalk) ring(ctx, f, Math.max(0.14, 2 * minW));
      composite(sb);
    }

    if (asph.length) {
      const kerbed = asph.filter(f => f.kerb), plain = asph.filter(f => !f.kerb);
      const asphMask = maskOf('asphMask', asph), shift = Math.max(1, FACE_WORLD * L);
      // ---- 4. curb: raised top ring (joint colour outside, cream top inside), then the visible face between the top and the road
      if (kerbed.length) {
        const top = this.buffer('curbTop', W, H), tg = ctx2d(top);
        for (const dy of [0, -shift]) {
          tg.setTransform(new DOMMatrix([1, 0, 0, 1, 0, dy]).multiply(M)); tg.lineJoin = 'round';
          tg.strokeStyle = tex.curb.joint; for (const f of kerbed) ring(tg, f, 2 * (CURB_TOP + CURB_JOINT));
          tg.strokeStyle = tex.curb.top; for (const f of kerbed) ring(tg, f, 2 * CURB_TOP);
        }
        composite(top);
        // the face: a wall of height `shift` px standing on the asphalt edge wherever the road lies below the curb on
        // screen = (asphalt mask shifted up) minus (asphalt mask). Three tones from the strip, light at the top.
        const kerbMask = maskOf('kerbMask', kerbed), bands = tex.curb.face;
        const faceBands = this.buffer('faceBands', W, H), bg = ctx2d(faceBands);
        bg.drawImage(kerbMask, 0, -shift); bg.globalCompositeOperation = 'destination-out'; bg.drawImage(kerbMask, 0, 0);
        bg.globalCompositeOperation = 'source-in'; bg.fillStyle = bands[0]; bg.fillRect(0, 0, W, H);
        const tint = (col: string, dy: number) => { const t = this.buffer('faceTint', W, H), g = ctx2d(t); g.drawImage(kerbMask, 0, dy); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, W, H); bg.globalCompositeOperation = 'source-atop'; bg.drawImage(t, 0, 0); };
        tint(bands[1], -shift * 0.62); tint(bands[2], -shift * 0.3);
        composite(faceBands);
      }
      // plain (verge) roads: a soft dark edge instead of a curb
      if (plain.length) { ctx.strokeStyle = 'rgba(12,10,8,0.5)'; for (const f of plain) ring(ctx, f, Math.max(0.2, 2 * minW)); }
      // ---- 5. asphalt: the painted mosaic in ground space, per class tone
      // gravel roads are painted first, with their own pattern and no tones, so a paved road meeting one paints over it
      const gravelF = asph.filter(f => f.tex === 'gravel'), paved = asph.filter(f => f.tex !== 'gravel');
      if (gravelF.length) { const gp = pat('roadgravel'); for (const f of gravelF) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = gp; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = gp; ctx.fill(f.path); } } }
      const base = this.groundPattern(ctx, tex.mosaicFor('base', L));
      for (const f of paved) { ctx.lineCap = f.cap; if (f.kind === 'stroke') { ctx.strokeStyle = base; ctx.lineWidth = f.w; ctx.stroke(f.path); } else { ctx.fillStyle = base; ctx.fill(f.path); } }
      // class tones as solid masks composited once (overlapping strokes and discs must not accumulate)
      const dark = asph.filter(f => f.tex === 'asphaltDark'), worn = asph.filter(f => f.tex === 'asphaltWorn');
      const toneLayer = (feats: Feature[], col: string, op: GlobalCompositeOperation, alpha: number) => {
        const tb = this.buffer('tone', W, H), tg = ctx2d(tb); tg.setTransform(M); tg.lineJoin = 'round'; tg.strokeStyle = tg.fillStyle = col;
        for (const f of feats) paint(tg, f); composite(tb, op, alpha);
      };
      if (dark.length) toneLayer(dark, 'rgb(10,12,24)', 'multiply', 0.28);
      if (worn.length) { toneLayer(worn, 'rgb(150,150,150)', 'multiply', 0.5); toneLayer(worn, 'rgb(190,180,160)', 'screen', 0.22); }
      // ---- 6. gutter: the strip's shadow rows just inside the curb (dark, then warm), masked to the asphalt
      if (kerbed.length) {
        const gb = this.buffer('gutter', W, H), gg = ctx2d(gb); gg.setTransform(M); gg.lineJoin = 'round';
        const [g0, g1, g2] = tex.curb.gutter;
        gg.strokeStyle = g2; gg.globalAlpha = 0.5; for (const f of kerbed) ring(gg, f, 2 * GUTTER);
        gg.strokeStyle = g1; gg.globalAlpha = 0.7; for (const f of kerbed) ring(gg, f, 2 * GUTTER * 0.6);
        gg.strokeStyle = g0; gg.globalAlpha = 0.9; for (const f of kerbed) ring(gg, f, 2 * GUTTER * 0.3);
        gg.globalAlpha = 1; through(gb, asphMask); composite(gb);
        // curb joints: dark ticks across the top every slab
        ctx.strokeStyle = tex.curb.joint; ctx.lineWidth = Math.max(0.02, minW * 0.9); ctx.beginPath();
        for (const j of net.joints) if (j.a.x >= tx0 && j.a.x <= tx1 && j.a.y >= ty0 && j.a.y <= ty1) { ctx.moveTo(j.a.x, j.a.y); ctx.lineTo(j.b.x, j.b.y); }
        ctx.save(); ctx.setTransform(new DOMMatrix([1, 0, 0, 1, 0, -shift]).multiply(M)); ctx.stroke(); ctx.restore(); ctx.setTransform(M);
      }
      // ---- 7. medians, islands, roundabout centres
      const curbRing = (feats: Feature[]) => { ctx.strokeStyle = tex.curb.joint; for (const f of feats) ring(ctx, f, 2 * (CURB_TOP + CURB_JOINT)); ctx.strokeStyle = tex.curb.top; for (const f of feats) ring(ctx, f, 2 * CURB_TOP); };
      curbRing(med); curbRing(isl);
      for (const f of med) { ctx.lineCap = f.cap; ctx.strokeStyle = pat('grass'); ctx.lineWidth = f.w; ctx.stroke(f.path); }
      for (const f of isl) { ctx.fillStyle = pat('pad'); ctx.fill(f.path); }
      for (const i of rbs) {
        ctx.beginPath(); ctx.arc(i.x, i.y, i.r, 0, Math.PI * 2);
        ctx.strokeStyle = tex.curb.joint; ctx.lineWidth = 2 * (CURB_TOP + CURB_JOINT); ctx.stroke(); ctx.strokeStyle = tex.curb.top; ctx.lineWidth = 2 * CURB_TOP; ctx.stroke();
        ctx.fillStyle = pat('grass'); ctx.fill();
        const ringR = Math.max(0.8, i.r * 0.42);
        ctx.beginPath(); ctx.arc(i.x, i.y, ringR, 0, Math.PI * 2); ctx.arc(i.x, i.y, ringR - 0.7, 0, Math.PI * 2, true); ctx.fillStyle = pat('paving'); ctx.fill('evenodd');
      }
      // ---- 8. decals, tyre marks, markings (chipped), crossings
      if (!lite) for (const d of net.decals) if (d.x >= tx0 - 2 && d.x <= tx1 + 2 && d.y >= ty0 - 2 && d.y <= ty1 + 2) drawDecal(ctx, d);
      if (!lite) for (const t of net.tyres) {
        if (t.x < tx0 - 8 || t.x > tx1 + 8 || t.y < ty0 - 8 || t.y > ty1 + 8) continue;
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.ang);
        const g = ctx.createLinearGradient(t.start, 0, t.start + t.len, 0); g.addColorStop(0, 'rgba(10,10,14,0.35)'); g.addColorStop(1, 'rgba(10,10,14,0)');
        ctx.fillStyle = g; for (const lat of t.lat) ctx.fillRect(t.start, -lat - 0.11, t.len, 0.22); ctx.restore();
      }
      const lines = net.lines.filter(l => vis(l.bbox)), zebra = net.zebra.filter(z => vis(z.bbox)), bars = net.bars.filter(b => vis(b.bbox));
      if (lines.length || zebra.length || bars.length || tops.length) {
        const lb = this.buffer('lines', W, H), lg = ctx2d(lb); lg.setTransform(M); lg.lineJoin = 'round';
        for (const l of lines) drawLine(lg, l, minW);
        // on-street parking marks (lot ground patches drawn on top): the edge line and the bay ticks
        if (tops.length) { lg.strokeStyle = WHITE; lg.lineCap = 'butt'; lg.lineWidth = Math.max(0.08, minW); lg.beginPath(); for (const p of tops) for (let k = 0; k + 3 < p.lines!.length; k += 4) { lg.moveTo(p.lines![k], p.lines![k + 1]); lg.lineTo(p.lines![k + 2], p.lines![k + 3]); } lg.stroke(); }
        lg.fillStyle = WHITE; for (const z of zebra) lg.fill(z.path); for (const b of bars) lg.fill(b.path);
        // chipped paint: keep the line where the wear mask is opaque
        lg.setTransform(M); lg.globalCompositeOperation = 'destination-in'; lg.fillStyle = this.screenPattern(lg, 'wear', L, X0, Y0, Minv); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        through(lb, asphMask); composite(lb);
      }
      // ---- 9. polished wheel paths (very faint) and the street-lamp reflection pools (the painting's measured response)
      const wear = lite ? [] : net.wear.filter(w => vis(w.bbox));
      if (wear.length) {
        const wb = this.buffer('wear', W, H), wg = ctx2d(wb); wg.setTransform(M); wg.lineCap = 'round'; wg.lineJoin = 'round';
        for (const w of wear) { wg.strokeStyle = 'rgba(255,255,255,0.035)'; wg.lineWidth = 0.5; for (const o of w.offsets) wg.stroke(roundedPath(offsetPolyline(w.pts, o, w.closed), w.r, w.closed)); }
        through(wb, asphMask); composite(wb, 'screen');
      }
      const pools = net.pools.filter(p => p.x >= tx0 - 8 && p.x <= tx1 + 8 && p.y >= ty0 - 8 && p.y <= ty1 + 8);
      if (pools.length) {
        const rotA = Math.PI / 2 - tex.stampAngle, sc = 1.2 / (2 * PPM);
        for (const [variant, stamp] of [['lit1', tex.pool1], ['lit2', tex.pool2]] as const) {
          const pm = this.buffer('poolMask', W, H), pg = ctx2d(pm); pg.imageSmoothingEnabled = true;
          for (const p of pools) {
            const S = M.transformPoint(new DOMPoint(p.x, p.y));
            const T = new DOMMatrix([1, 0, 0, 1, S.x, S.y]).multiply(new DOMMatrix([Math.cos(rotA), Math.sin(rotA), -Math.sin(rotA), Math.cos(rotA), 0, 0])).multiply(new DOMMatrix([1, 0, 0, 1, -S.x, -S.y])).multiply(M).multiply(new DOMMatrix([sc, 0, 0, sc, p.x, p.y])).multiply(new DOMMatrix([1, 0, 0, 1, -POOL_ANCHOR[0], -POOL_ANCHOR[1]]));
            pg.setTransform(T); pg.globalAlpha = p.strength; pg.drawImage(stamp, 0, 0);
          }
          const lit = this.buffer('lit', W, H), lg = ctx2d(lit); lg.setTransform(M); lg.fillStyle = this.groundPattern(lg, tex.mosaicFor(variant, L)); lg.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
          through(lit, pm); through(lit, asphMask); composite(lit);
        }
        // the curb and sidewalk near a lamp catch some of the light too (CURB_HOT / walk terms)
        const glow = this.buffer('glow', W, H), gg = ctx2d(glow); gg.setTransform(M);
        for (const p of pools) { const g = gg.createRadialGradient(p.x, p.y, 0, p.x, p.y, 3.2); g.addColorStop(0, 'rgba(255,170,70,0.55)'); g.addColorStop(0.4, 'rgba(255,150,50,0.22)'); g.addColorStop(1, 'rgba(255,140,40,0)'); gg.fillStyle = g; gg.beginPath(); gg.arc(p.x, p.y, 3.2, 0, Math.PI * 2); gg.fill(); }
        gg.setTransform(1, 0, 0, 1, 0, 0); gg.globalCompositeOperation = 'destination-out'; gg.drawImage(asphMask, 0, 0);
        composite(glow, 'screen');
      }
    }
    // ---- 9b. bridge railings: a base rail on the deck edge, a top rail RAIL_H above it, and posts every tile (not in lite)
    if (brs.length) {
      const posts = new Path2D();
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      for (const b of brs) for (const s of [1, -1]) {
        const edge = offsetPolyline(b.pts, s * (b.hw - 0.12), false), path = linePath(edge, false);
        ctx.setTransform(M); ctx.strokeStyle = '#7a7468'; ctx.lineWidth = 0.08; ctx.stroke(path);
        if (lite) continue;
        ctx.setTransform(shiftM(-RAIL_H)); ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 0.07; ctx.stroke(path);
        walkOpen(edge, 1, 0, p => { const q = M.transformPoint(new DOMPoint(p.x, p.y)); posts.moveTo(q.x, q.y); posts.lineTo(q.x, q.y - RAIL_H * L); });
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!lite) { ctx.strokeStyle = '#c8c0b0'; ctx.lineWidth = Math.max(1, 1.5 * L); ctx.stroke(posts); }
      ctx.setTransform(M);
    }
    // ---- 9c. tunnel portals: the dark mouth on the slope, the headwall above it, and the arch
    for (const p of ports) {
      const d = p.dir, n = perp(d), P = { x: p.x, y: p.y }, H = 70 * L;
      const Dd = mul(d, 3), A = add(P, mul(n, p.hw)), B = sub(P, mul(n, p.hw));
      const mouth = ctx.createLinearGradient(P.x, P.y, P.x + Dd.x, P.y + Dd.y);
      mouth.addColorStop(0, 'rgba(8,7,12,0.95)'); mouth.addColorStop(1, 'rgba(8,7,12,0)');
      ctx.setTransform(M); ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(B.x + Dd.x, B.y + Dd.y); ctx.lineTo(A.x + Dd.x, A.y + Dd.y); ctx.closePath();
      ctx.fillStyle = mouth; ctx.fill();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const wa = add(P, mul(n, p.hw + 0.8)), wb = sub(P, mul(n, p.hw + 0.8));
      const a = M.transformPoint(new DOMPoint(wa.x, wa.y)), b = M.transformPoint(new DOMPoint(wb.x, wb.y));
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - H); ctx.lineTo(a.x, a.y - H); ctx.closePath();
      ctx.fillStyle = '#7d776d'; ctx.fill();
      ctx.beginPath(); ctx.moveTo(a.x, a.y - H); ctx.lineTo(b.x, b.y - H); ctx.strokeStyle = '#a39c90'; ctx.lineWidth = Math.max(1, 3 * L); ctx.stroke();
      const ai = add(P, mul(n, p.hw * 0.85)), bi = sub(P, mul(n, p.hw * 0.85));
      const a2 = M.transformPoint(new DOMPoint(ai.x, ai.y)), b2 = M.transformPoint(new DOMPoint(bi.x, bi.y));
      ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(a2.x, a2.y - 0.45 * H); ctx.bezierCurveTo(a2.x, a2.y - 0.8 * H, b2.x, b2.y - 0.8 * H, b2.x, b2.y - 0.45 * H); ctx.lineTo(b2.x, b2.y); ctx.closePath();
      ctx.fillStyle = '#07060a'; ctx.fill();
      ctx.setTransform(M);
    }
    // ---- 10. leaves and grass tufts, lit by the pools where they lie in one
    if (!lite) this.drawLitter(ctx, net, L, M, box, W, H);
    // ---- 11. the world beyond the map
    const outside = new Path2D(); outside.rect(tx0 - 4, ty0 - 4, tx1 - tx0 + 8, ty1 - ty0 + 8); outside.rect(0, 0, MAP, MAP);
    ctx.fillStyle = pat('outside'); ctx.fill(outside, 'evenodd');
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = Math.max(0.08, minW); ctx.strokeRect(0, 0, MAP, MAP);
    return cv;
  }

  /** slab sprites along a run (tile space), stretched to 2.5 m x the sidewalk width like the builder's slab() */
  private drawSlabs(g: C2D, run: SlabRun, box: BBox) {
    const tex = this.tex, img = tex.slabs, [tx0, ty0, tx1, ty1] = box;
    if (run.kind === 'straight') {
      const dx = run.b.x - run.a.x, dy = run.b.y - run.a.y, L = Math.hypot(dx, dy); if (L < 0.05) return;
      const minx = Math.min(run.a.x, run.b.x) - 3, maxx = Math.max(run.a.x, run.b.x) + 3, miny = Math.min(run.a.y, run.b.y) - 3, maxy = Math.max(run.a.y, run.b.y) + 3;
      if (maxx < tx0 || minx > tx1 || maxy < ty0 || miny > ty1) return;
      const n = Math.max(1, Math.round(L / SLAB_LEN)), len = L / n, ang = Math.atan2(dy, dx), rng = mulberry(run.seed);
      const w = run.w1 - run.w0 - CURB_TOP - CURB_JOINT;
      for (let k = 0; k < n; k++) {
        const idx = tex.slabIndex(run.visible, rng()), [sx, sy, sw, sh] = tex.slabRect(idx);
        const cx = run.a.x + (dx / L) * (k + 0.5) * len + run.n.x * (run.w0 + CURB_TOP + CURB_JOINT), cy = run.a.y + (dy / L) * (k + 0.5) * len + run.n.y * (run.w0 + CURB_TOP + CURB_JOINT);
        if (cx < tx0 - 2 || cx > tx1 + 2 || cy < ty0 - 2 || cy > ty1 + 2) continue;
        g.save(); g.translate(cx, cy); g.rotate(ang);
        // the sprite's bottom row is the curb side: orient 'across' from the curb outwards
        const flip = run.n.x * Math.cos(ang + Math.PI / 2) + run.n.y * Math.sin(ang + Math.PI / 2) < 0;
        if (flip) g.scale(1, -1);
        g.drawImage(img, sx, sy, sw, sh, -len / 2 - 0.01, -0.01, len + 0.02, w + 0.02); g.restore();
      }
    } else {
      if (run.c.x + run.r1 < tx0 || run.c.x - run.r1 > tx1 || run.c.y + run.r1 < ty0 || run.c.y - run.r1 > ty1) return;
      const rm = (run.r0 + run.r1) / 2, span = run.a1 - run.a0, n = Math.max(1, Math.round(Math.abs(span) * rm / SLAB_LEN)), step = span / n, rng = mulberry(run.seed), inner = run.r0 + CURB_TOP + CURB_JOINT;
      for (let k = 0; k < n; k++) {
        const a0 = run.a0 + step * k, a1 = a0 + step, am = (a0 + a1) / 2, idx = tex.slabIndex(Math.cos(am) + Math.sin(am) < 0, rng()), [sx, sy, sw, sh] = tex.slabRect(idx);
        g.save(); g.translate(run.c.x, run.c.y); g.rotate(am);
        g.beginPath(); g.moveTo(Math.cos(a0 - am) * inner, Math.sin(a0 - am) * inner); g.arc(0, 0, run.r1 + 0.02, a0 - am, a1 - am, step < 0); g.arc(0, 0, inner, a1 - am, a0 - am, step > 0); g.closePath(); g.clip();
        const chord = Math.abs(step) * run.r1 + 0.1;
        g.drawImage(img, sx, sy, sw, sh, inner - 0.02, -chord / 2, run.r1 - inner + 0.06, chord);
        g.restore();
      }
    }
  }

  /** the painted areas of a chunk (the Paint tool), in id order: each polygon filled with its texture through G (turned and
   *  scaled in tile space about the origin), an optional border band inside its edge, and a thin rim for the paved textures */
  private drawPaints(ctx: C2D, paints: LotPatch[], L: number, X0: number, Y0: number, M: DOMMatrix, Minv: DOMMatrix, box: BBox, lite: boolean) {
    for (const p of paints) {
      const st = p.paint!, path = polyPath(p.pts), G = new DOMMatrix().rotateSelf(0, 0, st.a).scaleSelf(st.s, st.s), pb = quadBox(p.pts);
      const r = [Math.max(pb[0], box[0]) - 1, Math.max(pb[1], box[1]) - 1, Math.min(pb[2], box[2]) + 1, Math.min(pb[3], box[3]) + 1];
      if (r[2] <= r[0] || r[3] <= r[1]) continue;
      const asph = p.tex === 'asphalt' || p.tex === 'asphaltDark' || p.tex === 'asphaltWorn', paved = asph || p.tex === 'paving' || p.tex === 'pad' || p.tex === 'slabs';
      /** paints texture t over the area: a fill of its rectangle (w = 0), or a stroke of its edge w tiles wide */
      const lay = (t: string, w: number) => {
        const put = (style: string | CanvasPattern) => { if (w) { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.stroke(path); } else { ctx.fillStyle = style; ctx.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); } };
        const tone = (col: string, op: GlobalCompositeOperation, alpha: number) => { ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha; put(col); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; };
        if (t === 'kerb') { ctx.strokeStyle = this.tex.curb.joint; ctx.lineWidth = w; ctx.stroke(path); ctx.strokeStyle = this.tex.curb.top; ctx.lineWidth = Math.max(0.02, w - 0.08); ctx.stroke(path); return; }
        if (t === 'slabs') {
          put(this.tex.curb.top);
          if (!lite) {
            if (w) {
              // one row of slab sprites along each edge, on the inside (the sign of the area says which normal points in)
              const n = p.pts.length / 2, sg = signedArea(p.pts) > 0 ? 1 : -1;
              for (let i = 0; i < n; i++) {
                const j = (i + 1) % n, ax = p.pts[2 * i], ay = p.pts[2 * i + 1], bx = p.pts[2 * j], by = p.pts[2 * j + 1], len = Math.hypot(bx - ax, by - ay);
                if (len < 1e-6) continue;
                const ux = (bx - ax) / len, uy = (by - ay) / len, seed = Math.round(ax * 4) * 73856093 ^ Math.round(ay * 4) * 19349663 ^ Math.round(bx * 4) * 83492791;
                this.drawSlabs(ctx, { kind: 'straight', a: { x: ax, y: ay }, b: { x: bx, y: by }, n: { x: -uy * sg, y: ux * sg }, w0: -(CURB_TOP + CURB_JOINT), w1: w / 2, visible: false, seed }, box);
              }
            } else this.slabGrid(ctx, G, r, M);
          }
          ctx.globalCompositeOperation = 'multiply'; put(this.screenPattern(ctx, 'grime', L, X0, Y0, Minv)); ctx.globalCompositeOperation = 'source-over';
          return;
        }
        if (t === 'asphalt' || t === 'asphaltDark' || t === 'asphaltWorn') {
          put(this.groundPattern(ctx, this.tex.mosaicFor('base', L * st.s), G));
          if (t === 'asphaltDark') tone('rgb(10,12,24)', 'multiply', 0.28);
          if (t === 'asphaltWorn') { tone('rgb(150,150,150)', 'multiply', 0.5); tone('rgb(190,180,160)', 'screen', 0.22); }
          return;
        }
        if (isPhotoGrass(t)) { put(this.groundPattern(ctx, this.tex.mosaicFor(t, L * st.s), G)); return; }
        put(this.screenPattern(ctx, t as TexName, L, X0, Y0, Minv, G));
      };
      ctx.save(); ctx.setTransform(M); ctx.clip(path); ctx.lineJoin = 'round';
      lay(p.tex, 0);
      if (st.b > 0) { ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 2 * st.b + 0.08; ctx.stroke(path); lay(st.bt, 2 * st.b); }
      else if (paved) { ctx.strokeStyle = asph ? 'rgba(12,10,8,0.5)' : 'rgba(0,0,0,0.3)'; ctx.lineWidth = asph ? 0.3 : 0.16; ctx.stroke(path); }
      ctx.restore();
    }
  }
  /** sidewalk slab sprites in a running bond over the rectangle r (tiles), in texture space: a tile is G (u, v), so the
   *  slabs turn with the area; the seeds depend on the cell only, so neighbouring chunks agree */
  private slabGrid(g: C2D, G: DOMMatrix, r: number[], M: DOMMatrix) {
    const SW = SLAB_LEN * SLAB_CELL[1] / SLAB_CELL[0], Gi = G.inverse();
    let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (const [x, y] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) { const q = Gi.transformPoint(new DOMPoint(x, y)); u0 = Math.min(u0, q.x); v0 = Math.min(v0, q.y); u1 = Math.max(u1, q.x); v1 = Math.max(v1, q.y); }
    const j0 = Math.floor(v0 / SW) - 1, j1 = Math.ceil(v1 / SW) + 1, k0 = Math.floor(u0 / SLAB_LEN) - 2, k1 = Math.ceil(u1 / SLAB_LEN) + 1;
    if ((j1 - j0 + 1) * (k1 - k0 + 1) > 20000) return;
    const img = this.tex.slabs;
    g.setTransform(M.multiply(G)); g.imageSmoothingEnabled = true;
    for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
      const rng = mulberry((k * 73856093) ^ (j * 19349663) ^ 0x5eed), [sx, sy, sw, sh] = this.tex.slabRect(this.tex.slabIndex(false, rng()));
      g.drawImage(img, sx, sy, sw, sh, k * SLAB_LEN + (j & 1 ? SLAB_LEN / 2 : 0) - 0.01, j * SW - 0.01, SLAB_LEN + 0.02, SW + 0.02);
    }
    g.setTransform(M);
  }

  /** the builder's grass dressing (town-scene.mjs regionDressing), seeded per DRESS-tile region so chunks agree: a bare-soil
   *  patch in 30% of regions, then about 12 soft decals per region (82% the five grass patches, the rest leaf scatters and
   *  tufts) at 0.7-1.3x their size, flipped at random, 55-95% opaque. Drawn over the grass before everything else, so the
   *  terrain layers, lots and roads cover them; skipped on hills, water and banks. */
  private drawDressing(ctx: C2D, box: BBox, L: number, M: DOMMatrix) {
    const [tx0, ty0, tx1, ty1] = box, tex = this.tex, soil: number[] = [], dec: number[] = [], nat: number[] = [];
    const ground = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP && y < MAP && this.terrain[Math.floor(y) * MAP + Math.floor(x)] <= TC.PATCH;
    for (let ry = Math.floor((ty0 - 8) / DRESS); ry <= Math.floor((ty1 + 8) / DRESS); ry++) for (let rx = Math.floor((tx0 - 8) / DRESS); rx <= Math.floor((tx1 + 8) / DRESS); rx++) {
      const r = mulberry(((rx * 7919) ^ (ry * 104729) ^ 0xdeca1) >>> 0);
      // a nature patch (16 m of composed decals) in 45% of the regions, from its own stream so the rest stays as it was
      { const q = mulberry(((rx * 15485863) ^ (ry * 32452843) ^ 0x7a7e) >>> 0); if (q() < 0.45 && NATURE.length) { const x = (rx + q()) * DRESS, y = (ry + q()) * DRESS, k = Math.floor(q() * NATURE.length), s = (0.85 + q() * 0.55) * (q() < 0.5 ? -1 : 1); if (ground(x, y)) nat.push(x, y, k, s); } }
      if (r() < 0.3) { const x = (rx + r()) * DRESS, y = (ry + r()) * DRESS, rad = (1.5 + r() * 2.8) * 45, k = Math.floor(r() * SOIL_STAMPS); if (ground(x, y)) soil.push(x, y, rad, k); }
      for (let i = 0; i < 12; i++) {
        const k = r() < 0.82 ? Math.floor(r() * 5) : r() < 0.7 ? 5 + Math.floor(r() * 3) : 8, x = (rx + r()) * DRESS, y = (ry + r()) * DRESS, s = 0.7 + r() * 0.6, flip = r() < 0.5 ? -1 : 1, a = 0.55 + r() * 0.4;
        if (ground(x, y)) dec.push(x, y, k, s * flip, a);
      }
    }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (let i = 0; i < nat.length; i += 4) {
      const S = M.transformPoint(new DOMPoint(nat[i], nat[i + 1])), n = NATURE[nat[i + 2]], s = nat[i + 3];
      ctx.globalAlpha = 0.92; ctx.setTransform(L * s, 0, 0, L * Math.abs(s), S.x, S.y);
      ctx.drawImage(tex.nature, n.x, n.y, n.w, n.h, -n.ox, -n.oy, n.w / NATURE_RES, n.h / NATURE_RES);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < soil.length; i += 4) {
      const S = M.transformPoint(new DOMPoint(soil[i], soil[i + 1])), f = soil[i + 2] / SOIL_R;
      ctx.setTransform(L * f, 0, 0, L * f, S.x, S.y); ctx.drawImage(tex.soil, soil[i + 3] * SOIL_W, 0, SOIL_W, SOIL_H, -SOIL_W / 2, -SOIL_H / 2, SOIL_W, SOIL_H);
    }
    for (let i = 0; i < dec.length; i += 5) {
      const S = M.transformPoint(new DOMPoint(dec[i], dec[i + 1])), d = DECALS[dec[i + 2]], s = dec[i + 3];
      ctx.globalAlpha = dec[i + 4]; ctx.setTransform(L * s, 0, 0, L * Math.abs(s), S.x, S.y);
      ctx.drawImage(tex.decals, d.x, d.y, d.w, d.h, -d.w / 2, -d.h / 2, d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }

  /** the lots' flat decals: each centred on its ground point, screen-aligned like the builder's, scaled and mirrored */
  private drawMarks(ctx: C2D, patches: LotPatch[], L: number, M: DOMMatrix, box: BBox) {
    const [tx0, ty0, tx1, ty1] = box, img = this.tex.lotDecals;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    for (const p of patches) for (let k = 0, m = p.marks ?? []; k + 4 < m.length; k += 5) {
      const d = LOT_DECALS[m[k]], x = m[k + 1], y = m[k + 2], s = m[k + 3];
      if (!d || x < tx0 - 4 || x > tx1 + 4 || y < ty0 - 4 || y > ty1 + 4) continue;
      const S = M.transformPoint(new DOMPoint(x, y));
      ctx.globalAlpha = m[k + 4]; ctx.setTransform(L * s, 0, 0, L * Math.abs(s), S.x, S.y);
      ctx.drawImage(img, d.x, d.y, d.w, d.h, -d.w / 2, -d.h / 2, d.w, d.h);
    }
    ctx.globalAlpha = 1;
  }

  private drawLitter(ctx: C2D, net: FxView, L: number, M: DOMMatrix, box: BBox, W: number, H: number) {
    const [tx0, ty0, tx1, ty1] = box, tex = this.tex, atlas = tex.leaves, occAt = (x: number, y: number) => this.net.occAt(x, y);
    const lb = this.buffer('leaves', W, H), g = ctx2d(lb); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    const pxPerM = 45.25 * L, shadowDx = 0.8 * L, shadowDy = 1.1 * L;
    const draw = (x: number, y: number, ang: number, sizeM: number, idx: number, pass: number) => {
      const S = M.transformPoint(new DOMPoint(x, y)), size = sizeM * pxPerM, [sx, sy, sw, sh] = tex.leafRect(idx);
      g.setTransform(1, 0, 0, 1, S.x + (pass ? 0 : shadowDx), S.y + (pass ? 0 : shadowDy)); g.scale(1, 0.74); g.rotate(ang);
      g.drawImage(atlas, sx, sy, sw, sh, -size / 2, -size / 2, size, size);
    };
    const inView: { x: number; y: number; ang: number; s: number; idx: number }[] = [];
    for (const l of net.leaves) { if (l.x < tx0 - 0.5 || l.x > tx1 + 0.5 || l.y < ty0 - 0.5 || l.y > ty1 + 0.5) continue; const r = mulberry((l.x * 977 + l.y * 131 + l.ang * 100) | 0); inView.push({ x: l.x, y: l.y, ang: l.ang, s: l.s, idx: tex.pickLeaf(r, l.s) }); }
    // a sparse scatter and a few drifts on the grass, as the builder's regionDressing does
    const rx0 = Math.floor(tx0 / 8), rx1 = Math.floor(tx1 / 8), ry0 = Math.floor(ty0 / 8), ry1 = Math.floor(ty1 / 8);
    for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) {
      const r = mulberry(((rx * 7919) ^ (ry * 104729) ^ 0x51ed) >>> 0), g2 = () => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
      const add = (x: number, y: number, sizeM: number) => { if (x < 0 || y < 0 || x >= MAP || y >= MAP || occAt(x, y)) return; if (this.terrain[Math.floor(y) * MAP + Math.floor(x)] > 1) return; inView.push({ x, y, ang: r() * Math.PI * 2, s: sizeM, idx: tex.pickLeaf(r, sizeM) }); };
      const sizeOf = (k: string) => { const u = r(); return (k === 'stray' ? 0.96 : 1) * (u < 0.22 ? 0.11 + r() * 0.08 : u < 0.58 ? 0.2 + r() * 0.1 : u < 0.88 ? 0.32 + r() * 0.15 : 0.49 + r() * 0.16); };
      for (let i = 0; i < 30; i++) add(rx * 8 + r() * 8, ry * 8 + r() * 8, sizeOf('stray'));
      for (let c = 0; c < 2; c++) { if (r() > 0.6) continue; const X0 = rx * 8 + r() * 8, Y0 = ry * 8 + r() * 8, n = 4 + Math.floor(r() * r() * 22), sp = (0.35 + r() * 0.6) / 2; for (let i = 0; i < n; i++) add(X0 + g2() * sp, Y0 + g2() * sp, sizeOf('gutter')); }
    }
    g.globalAlpha = 0.22; g.globalCompositeOperation = 'source-over';
    // shadows (as a darkening of the ground): drawn black through the leaf alpha
    const sh = this.buffer('leafShadow', W, H), shg = ctx2d(sh);
    for (const l of inView) { const S = M.transformPoint(new DOMPoint(l.x, l.y)), size = l.s * pxPerM, [sx, sy, sw, swh] = tex.leafRect(l.idx); shg.setTransform(1, 0, 0, 1, S.x + shadowDx, S.y + shadowDy); shg.scale(1, 0.74); shg.rotate(l.ang); shg.drawImage(atlas, sx, sy, sw, swh, -size / 2, -size / 2, size, size); }
    shg.setTransform(1, 0, 0, 1, 0, 0); shg.globalCompositeOperation = 'source-in'; shg.fillStyle = '#05050f'; shg.fillRect(0, 0, W, H);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 0.22; ctx.drawImage(sh, 0, 0); ctx.globalAlpha = 1;
    g.globalAlpha = 1;
    for (const l of inView) draw(l.x, l.y, l.ang, l.s, l.idx, 1);
    // tufts over the curb's grass edge
    if (L >= 0.15) {
      g.setTransform(M); g.lineCap = 'round';
      const cols = ['#4f7a2c', '#6c9a3a', '#3a5c22', '#86ac46'];
      for (const q of net.tufts) {
        if (q.x < tx0 || q.x > tx1 || q.y < ty0 || q.y > ty1) continue;
        const r = mulberry(900 + q.v + ((q.x * 31 + q.y * 17) | 0));
        g.save(); g.translate(q.x, q.y); g.rotate(q.ang);
        for (let i = 0; i < 7; i++) { const y = (r() - 0.5) * 0.3, len = 0.07 + r() * 0.12, ang = (r() - 0.5) * 1.3; g.strokeStyle = cols[(r() * cols.length) | 0]; g.lineWidth = 0.012 + r() * 0.012; g.beginPath(); g.moveTo(-0.04, y); g.lineTo(-0.04 + len * Math.cos(ang), y + len * Math.sin(ang)); g.stroke(); }
        g.restore();
      }
    }
    // leaves lying in a lamp pool are lit like the builder's (brighter, warmer)
    const pools = net.pools.filter(p => p.x >= tx0 - 8 && p.x <= tx1 + 8 && p.y >= ty0 - 8 && p.y <= ty1 + 8);
    if (pools.length) {
      const lm = this.buffer('leafLight', W, H), lg = ctx2d(lm), rotA = Math.PI / 2 - tex.stampAngle, sc = 1.2 / (2 * PPM);
      for (const p of pools) {
        const S = M.transformPoint(new DOMPoint(p.x, p.y));
        const T = new DOMMatrix([1, 0, 0, 1, S.x, S.y]).multiply(new DOMMatrix([Math.cos(rotA), Math.sin(rotA), -Math.sin(rotA), Math.cos(rotA), 0, 0])).multiply(new DOMMatrix([1, 0, 0, 1, -S.x, -S.y])).multiply(M).multiply(new DOMMatrix([sc, 0, 0, sc, p.x, p.y])).multiply(new DOMMatrix([1, 0, 0, 1, -POOL_ANCHOR[0], -POOL_ANCHOR[1]]));
        lg.setTransform(T); lg.drawImage(tex.pool1, 0, 0);
      }
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-in'; lg.fillStyle = 'rgba(255,190,90,1)'; lg.fillRect(0, 0, W, H);
      lg.globalCompositeOperation = 'destination-in'; lg.drawImage(lb, 0, 0);
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'screen'; g.globalAlpha = 0.75; g.drawImage(lm, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lb, 0, 0); ctx.setTransform(M);
  }
}

/** points every `step` tiles along an open polyline, from `skip` tiles in to `skip` tiles before the end, with the unit direction of the run each sits on */
function walkOpen(pts: Pt[], step: number, skip: number, fn: (p: Pt, u: Pt) => void) {
  let total = 0; for (let k = 0; k + 1 < pts.length; k++) total += vlen(sub(pts[k + 1], pts[k]));
  let next = skip, acc = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], l = vlen(sub(pts[k + 1], a)); if (l < 1e-9) continue;
    const u = mul(sub(pts[k + 1], a), 1 / l);
    while (next <= acc + l && next <= total - skip + 1e-6) { fn(add(a, mul(u, next - acc)), u); next += step; }
    acc += l;
  }
}

/** a road marking: optional sideways offset, rounded corners, dashes anchored to world position (so joining roads never shifts them) */
function drawLine(ctx: C2D, l: LineRec, minW: number) {
  const pts = l.offset ? offsetPolyline(l.pts, l.offset, l.closed) : l.pts;
  const pieces = roundPieces(pts, l.r, l.closed); if (!pieces.length) return;
  ctx.strokeStyle = l.color === '#d6b23b' ? YELLOW : l.color; ctx.lineWidth = Math.max(l.width, minW); ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  if (!l.dash) {
    ctx.setLineDash([]); ctx.beginPath();
    pieces.forEach((p, i) => { if (p.run) { if (i === 0) ctx.moveTo(p.a.x, p.a.y); else ctx.lineTo(p.a.x, p.a.y); ctx.lineTo(p.b.x, p.b.y); } else ctx.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); });
    if (l.closed) ctx.closePath(); ctx.stroke(); return;
  }
  const period = l.dash[0] + l.dash[1], mod = (v: number) => ((v % period) + period) % period;
  ctx.setLineDash(l.dash);
  let carry = 0;
  for (const p of pieces) {
    if (p.run) {
      const dx = p.b.x - p.a.x, dy = p.b.y - p.a.y, len = Math.hypot(dx, dy); if (len < 1e-6) continue;
      let cx = dx / len, cy = dy / len; const forward = cx > 1e-9 || (Math.abs(cx) <= 1e-9 && cy > 0);
      if (!forward) { cx = -cx; cy = -cy; }
      const phi = p.a.x * cx + p.a.y * cy, off = forward ? mod(phi) : mod(-phi - l.dash[1]);
      ctx.lineDashOffset = off; ctx.beginPath(); ctx.moveTo(p.a.x, p.a.y); ctx.lineTo(p.b.x, p.b.y); ctx.stroke();
      carry = mod(off + len);
    } else {
      ctx.lineDashOffset = carry; ctx.beginPath(); ctx.moveTo(p.from.x, p.from.y); ctx.arcTo(p.ctrl.x, p.ctrl.y, p.to.x, p.to.y, p.r); ctx.stroke();
      const u = { x: p.from.x - p.ctrl.x, y: p.from.y - p.ctrl.y }, v = { x: p.to.x - p.ctrl.x, y: p.to.y - p.ctrl.y };
      const ang = Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / ((Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) || 1))));
      carry = mod(carry + (Math.PI - ang) * p.r);
    }
  }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

function rrect(ctx: C2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawDecal(ctx: C2D, d: Decal) {
  ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.ang); ctx.scale(d.s, d.s);
  const rng = mulberry(d.seed);
  switch (d.t) {
    case 'manhole': {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(0.04, 0.05, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#343a4e'; ctx.beginPath(); ctx.arc(0, 0, 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6a7086'; ctx.lineWidth = 0.055; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0, 0, 0.27, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.035; ctx.beginPath(); for (const y of [-0.14, 0, 0.14]) { ctx.moveTo(-0.22, y); ctx.lineTo(0.22, y); } ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,190,0.2)'; ctx.lineWidth = 0.04; ctx.beginPath(); ctx.arc(0, 0, 0.34, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
      break;
    }
    case 'drain': {
      ctx.fillStyle = '#262a38'; ctx.fillRect(-0.45, -0.21, 0.9, 0.42);
      ctx.strokeStyle = '#555c70'; ctx.lineWidth = 0.05; ctx.strokeRect(-0.45, -0.21, 0.9, 0.42);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.055; ctx.beginPath(); for (const y of [-0.12, -0.04, 0.04, 0.12]) { ctx.moveTo(-0.37, y); ctx.lineTo(0.37, y); } ctx.stroke();
      break;
    }
    case 'oil': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.65); g.addColorStop(0, 'rgba(6,6,12,0.5)'); g.addColorStop(0.55, 'rgba(8,8,14,0.25)'); g.addColorStop(1, 'rgba(8,8,14,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 0.65, 0.45, rng() * 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'patch': {
      const l = 1.8 + rng() * 1.3, w = 0.9 + rng() * 0.6; ctx.rotate((rng() - 0.5) * 0.25);
      rrect(ctx, -l / 2, -w / 2, l, w, 0.25);
      ctx.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)'; ctx.fill();
      ctx.strokeStyle = 'rgba(4,5,8,0.6)'; ctx.lineWidth = 0.085; ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
