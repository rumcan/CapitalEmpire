// The golf hole preset (Paint tool, 'hole' mode): one simple hole made only of ordinary painted areas plus props (flag, trees, bushes, flowers). Pure, no DOM. Local frame: the tee at the origin, the hole along +X.
import { mulberry } from '../iso';
import { surfaceOfTex } from './costs';
import { BRUSH_PRESETS, DEFAULT_STYLE, clampStyle, type BorderSize, type BorderTex, type BrushKind, type PaintArea, type PaintTex } from '../paint';

/** a prop of the preset: its kind and its tile position; a stored preset's prop names its sprite (id), flip and map scale exactly */
export interface PresetProp { kind: 'flag' | 'tree' | 'bush' | 'flower'; x: number; y: number; id?: string; flip?: boolean; scale?: number }
/** a hole: its painted areas (paint order, no ids yet) and its props */
export interface HolePreset { areas: Omit<PaintArea, 'id'>[]; props: PresetProp[] }

/** the fairway's centre line (y) at x, and its half width */
const cl = (x: number) => -4 * Math.sin(Math.PI * (x - 16) / 90);
const hw = (x: number) => 7 + 2 * Math.sin(x / 18);
/** the rough ellipse: centre x, radii */
const RC = 62, RX = 74, RY = 28;
/** the holes and the rough's no-tree zones (x, y, radius): the pond, the three bunkers and the green, each grown by 3 tiles */
const ZONES: [number, number, number][] = [[42, 15, 11], [72, -11, 8], [110, -9, 7.5], [125, 8, 7], [118, 1, 12]];
/** a closed blob: n points on the ellipse (cx, cy, rx, ry), each radius scaled by 1 + wobble * (rnd() - 0.5); angles are monotone, so it stays simple */
export function blob(cx: number, cy: number, rx: number, ry: number, n: number, wobble: number, rnd: () => number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n, k = 1 + wobble * (rnd() - 0.5); out.push(cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)); }
  return out;
}
/** a tile value rounded to quarter tiles (no -0) */
const q4 = (v: number) => Math.round(v * 4) / 4 + 0;

/** the hole in the local frame for a seed: the same seed gives the same hole */
export function holePreset(seed: number): HolePreset {
  const rnd = mulberry(seed), areas: Omit<PaintArea, 'id'>[] = [], props: PresetProp[] = [];
  const add = (pts: number[], tex: PaintTex, border: BorderSize, btex: BorderTex, radius: number) => areas.push({ pts, ...clampStyle({ ...DEFAULT_STYLE, tex, border, btex, radius }) });
  /** true when no prop of the kind lies within d of (x, y) */
  const apart = (x: number, y: number, d: number, kind: PresetProp['kind']) => props.every(p => p.kind !== kind || Math.hypot(p.x - x, p.y - y) >= d);
  add(blob(RC, 0, RX, RY, 28, 0.12, rnd), 'golfRough', 0, 'kerb', 6);
  add(blob(42, 15, 8, 5, 16, 0.15, rnd), 'waterDark', 2, 'dirt', 1);
  const fw: number[] = [];
  for (let x = 16; x <= 106; x += 6) fw.push(x, cl(x) - hw(x));
  for (let x = 106; x >= 16; x -= 6) fw.push(x, cl(x) + hw(x));
  add(fw, 'golfFairway', 3, 'golfFirstCut', 5);
  add([-3, -3, 5, -3, 5, 3, -3, 3], 'golfTee', 1, 'golfFirstCut', 1);
  add(blob(72, -11, 5, 2.5, 12, 0.2, rnd), 'bunkerSand', 2, 'golfRough', 1);
  add(blob(110, -9, 4.5, 2.5, 12, 0.2, rnd), 'bunkerSand', 2, 'golfRough', 1);
  add(blob(125, 8, 4, 2.2, 12, 0.2, rnd), 'bunkerSand', 2, 'golfRough', 1);
  add(blob(118, 1, 9, 7, 24, 0.08, rnd), 'golfGreen', 2, 'golfFringe', 0);
  props.push({ kind: 'flag', x: 119, y: 2 });
  for (let k = 0; k < 70; k++) {
    const a = rnd() * 2 * Math.PI, d = 2 + 12 * rnd(), x = RC + (RX + d) * Math.cos(a), y = (RY + d) * Math.sin(a);
    if (apart(x, y, 3, 'tree')) props.push({ kind: 'tree', x, y });
  }
  for (let k = 0; k < 80; k++) {
    const a = rnd() * 2 * Math.PI, d = 3 * rnd(), x = RC + (RX + d) * Math.cos(a), y = (RY + d) * Math.sin(a);
    if (apart(x, y, 1.5, 'bush')) props.push({ kind: 'bush', x, y });
  }
  for (let k = 0; k < 80; k++) {
    const x = -7 + 16 * rnd(), y = -7 + 14 * rnd();
    const ex = Math.max(-3 - x, x - 5, 0), ey = Math.max(Math.abs(y) - 3, 0), r = Math.hypot(ex, ey);
    if (r >= 1.5 && r <= 4 && (x < -3 || Math.abs(y) > 3) && apart(x, y, 1, 'flower')) props.push({ kind: 'flower', x, y });
  }
  for (let k = 0; k < 20; k++) {
    const x = RC - RX + 2 * RX * rnd(), y = -RY + 2 * RY * rnd();
    if (((x - RC) / RX) ** 2 + (y / RY) ** 2 >= 0.85) continue;
    const u = Math.min(106, Math.max(16, x));
    if (Math.abs(y - cl(u)) <= hw(u) + 8) continue;
    if ((x < 16 || x > 106) && (Math.hypot(x, y) <= 10 || Math.hypot(x - 118, y - 1) <= 10)) continue;
    if (ZONES.some(([zx, zy, r]) => Math.hypot(x - zx, y - zy) <= r)) continue;
    if (apart(x, y, 3, 'tree')) props.push({ kind: 'tree', x, y });
  }
  return { areas, props };
}

/** the hole turned by dir quarter turns ((x, y) -> (-y, x) per step) about the origin and moved to (x, y); area corners rounded to quarter tiles */
export function placeHole(p: HolePreset, x: number, y: number, dir: 0 | 1 | 2 | 3): HolePreset {
  const at = (px: number, py: number, round: boolean): [number, number] => {
    let a = px, b = py;
    for (let k = 0; k < dir; k++) { const t = a; a = -b; b = t; }
    a += x; b += y;
    return round ? [q4(a), q4(b)] : [a, b];
  };
  const areas = p.areas.map(ar => {
    const pts: number[] = [];
    for (let i = 0; i < ar.pts.length; i += 2) { const [a, b] = at(ar.pts[i]!, ar.pts[i + 1]!, true); pts.push(a, b); }
    return { ...ar, pts };
  });
  const props = p.props.map(q => { const [a, b] = at(q.x, q.y, false); return { ...q, x: a, y: b }; });
  return { areas, props };
}

/** a hole as the studio's Holes tab stores it (src/game/golf/hole-presets.json): areas and props in the local frame (the tee at 0) */
export interface StoredHole {
  name: string;
  areas: { tex: string; border: number; btex: string; radius: number; kind?: string; pts: number[] }[];
  props: { id: string; x: number; y: number; flip: boolean; scale: number }[];
}
/** the brush kind a texture belongs to (the golf brush presets' fill textures, else its golf surface's kind; any water is water), or undefined */
export function kindOfTex(tex: string): BrushKind | undefined {
  return BRUSH_PRESETS.find(b => b.style.tex === tex)?.kind ?? SURFACE_KIND[surfaceOfTex(tex as PaintTex) ?? ''] ?? (tex.startsWith('water') ? 'water' : undefined);
}
/** the brush kind of a golf surface (costs.ts surfaceOfTex: the plain textures and the owner's presets tagged with a surface) */
const SURFACE_KIND: Record<string, BrushKind> = { green: 'green', tee: 'tee', fairway: 'fairway', rough: 'rough', bunker: 'bunker', water: 'water', path: 'path' };
/** a stored hole as a preset: its areas in the default style with the stored texture, border and corners (a stored kind is kept when it is
 *  a brush kind), its props with their exact sprites (the flag is the prop whose id names a flag or pin) */
export function storedHolePreset(h: StoredHole): HolePreset {
  const kinds = new Set<string>(BRUSH_PRESETS.map(b => b.kind));
  const areas = h.areas.map(a => ({ pts: a.pts.slice(), ...clampStyle({ ...DEFAULT_STYLE, tex: a.tex as PaintTex, border: a.border as BorderSize, btex: a.btex as BorderTex, radius: a.radius }), ...(a.kind && kinds.has(a.kind) ? { kind: a.kind as BrushKind } : {}) }));
  const props: PresetProp[] = h.props.map(q => ({ kind: /flag|pin/.test(q.id) ? 'flag' : 'tree', x: q.x, y: q.y, id: q.id, flip: q.flip, scale: q.scale }));
  return { areas, props };
}
