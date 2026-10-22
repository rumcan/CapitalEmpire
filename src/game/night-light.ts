import type { LibItem, Prop } from './types';

/** The night: TrickOrTreat's town-builder lighting (scripts/town-builder/app/night-light.js and the game's render.ts night grade), ported.
 *  The town is washed in blue moonlight (desaturated, tinted, darkened); every light a sprite gives off is a round, feathered pool on the
 *  ground that puts the painted colour back, with a little warmth; a sprite's lit windows (its library glows) glow the same way. The art is
 *  painted at early evening, so by day nothing changes. Here the night follows the game clock (dusk, night, dawn) or is always on or off,
 *  every number is the owner's (the gear menu). */

export type LightKey = 'lamp' | 'porch' | 'window' | 'neon' | 'pumpkin' | 'lantern' | 'stand' | 'fire';
export interface LightType { /** radius in metres */ r: number; /** strength 0..1 */ i: number }
export interface NightSettings {
  /** 'clock': dark from dusk to dawn by the game clock; 'on': always night; 'off': never */
  mode: 'clock' | 'on' | 'off';
  /** the hours (0..24): darkening from dusk, full night from night, lightening from dawn, day from day */
  dusk: number; night: number; dawn: number; day: number;
  /** by the clock, the night falls on one game day in every `every` (1: every night; the days between stay light) */
  every: number;
  /** the moonlight: its colour and how much of it, how grey and how dark the town gets */
  tint: string; strength: number; desat: number; dark: number;
  /** the pools' soft edge (share of the radius) and their warmth */
  feather: number; warmth: number;
  /** the lit windows: their size (times the painted glow) and strength */
  glowSize: number; glowStrength: number;
  types: Record<LightKey, LightType>;
}
export const NIGHT_DEFAULT: NightSettings = {
  mode: 'clock', dusk: 18, night: 20, dawn: 5, day: 7, every: 3,
  tint: '#4656c8', strength: 0.7, desat: 0.6, dark: 0.3, feather: 0.65, warmth: 0.35, glowSize: 2.2, glowStrength: 0.95,
  types: { lamp: { r: 8, i: 1 }, porch: { r: 5, i: 0.9 }, window: { r: 7, i: 0.85 }, neon: { r: 9, i: 1 }, pumpkin: { r: 2.6, i: 0.9 }, lantern: { r: 3.2, i: 0.95 }, stand: { r: 3.6, i: 0.85 }, fire: { r: 4.5, i: 1 } },
};
/** the light types, by sprite id (the builder's list; the same list is in scripts/assets/lot-variants.mjs for the lights baked into lots) */
export const LIGHT_TYPES: { key: LightKey; label: string; test: RegExp }[] = [
  { key: 'lamp', label: 'Street lamps', test: /^world:streetlamp$|streetlamp|street-lamp|lamp-post|lamppost/ },
  { key: 'neon', label: 'Neon (arcade, diner)', test: /^world:(arcade|diner)$/ },
  { key: 'window', label: 'Shop and venue windows', test: /^(town:(bakery|barber|fish_tackle|grocery|hardware|laundromat|pharmacy|postoffice|firestation)|ref:building-(corner-shop|corner-store|grocery|church|school)|world:(video_rental|video|church|school|primary_school|diner_v2))/ },
  { key: 'porch', label: 'House porch lights', test: /^(world:house_\d|gen:house-|gen:back-|expansion:(cottage|dormer|duplex|victorian|ranch)-)/ },
  { key: 'pumpkin', label: 'Jack-o-lanterns', test: /(pumpkin|ref:halloween-pumpkin-cluster)/ },
  { key: 'lantern', label: 'Lanterns', test: /^ref:halloween-lantern$/ },
  { key: 'stand', label: 'Stands, vending, phone booths', test: /^(world:(candy_stand|vending)|town:(phone_booth|bus_stop))$/ },
  { key: 'fire', label: 'Fire pits', test: /^expansion:firepit$/ },
];
const typeCache = new Map<LibItem, LightKey | null>();
/** a sprite's light type: by its id, else its kind (houses and house-like buildings, the builder's recoloured variations among them, a porch;
 *  venues and shops their windows; a lamp a lamp) */
export function lightType(it: LibItem): LightKey | null {
  let t = typeCache.get(it);
  if (t === undefined) {
    t = LIGHT_TYPES.find(l => l.test.test(it.id))?.key ?? (it.kind === 'house' || (it.kind === 'building' && /house|cottage|duplex|victorian|ranch|bungalow/i.test(it.id)) ? 'porch' : it.kind === 'venue' ? 'window' : it.kind === 'lamp' ? 'lamp' : it.kind === 'vending' ? 'stand' : null);
    typeCache.set(it, t);
  }
  return t;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
export function clampNight(n: Partial<NightSettings> | null | undefined): NightSettings {
  const D = NIGHT_DEFAULT, s = n ?? {};
  const types = {} as Record<LightKey, LightType>;
  for (const k of Object.keys(D.types) as LightKey[]) types[k] = { r: num(s.types?.[k]?.r, D.types[k].r, 0, 30), i: num(s.types?.[k]?.i, D.types[k].i, 0, 1) };
  return {
    mode: s.mode === 'on' || s.mode === 'off' || s.mode === 'clock' ? s.mode : D.mode,
    dusk: num(s.dusk, D.dusk, 0, 24), night: num(s.night, D.night, 0, 24), dawn: num(s.dawn, D.dawn, 0, 24), day: num(s.day, D.day, 0, 24), every: Math.round(num(s.every, D.every, 1, 14)),
    tint: typeof s.tint === 'string' && /^#[0-9a-f]{6}$/i.test(s.tint) ? s.tint : D.tint,
    strength: num(s.strength, D.strength, 0, 1), desat: num(s.desat, D.desat, 0, 1), dark: num(s.dark, D.dark, 0, 1),
    feather: num(s.feather, D.feather, 0.02, 0.98), warmth: num(s.warmth, D.warmth, 0, 1), glowSize: num(s.glowSize, D.glowSize, 0, 6), glowStrength: num(s.glowStrength, D.glowStrength, 0, 1), types,
  };
}

/** the game day a night belongs to (the day its dusk fell on): hour h of day `day` before that day's dusk belongs to the night before */
export function nightDay(s: NightSettings, h: number, day: number): number {
  const t = (((h - s.dusk) % 24) + 24) % 24;
  return day + Math.floor((h - t) / 24);
}

/** how far into the night the hour h (0..24, fractional) of game day `day` is: 0 by day, 1 at night, smooth from dusk to night and from dawn
 *  to day; by the clock only on the nights whose day is a multiple of `every` (no day given: every night) */
export function nightAt(s: NightSettings, h: number, day?: number): number {
  if (s.mode === 'off') return 0;
  if (s.mode === 'on') return 1;
  if (day !== undefined && s.every > 1 && ((nightDay(s, h, day) % s.every) + s.every) % s.every !== 0) return 0;
  const smooth = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
  const since = (a: number) => (((h - a) % 24) + 24) % 24, span = (a: number, b: number) => (((b - a) % 24) + 24) % 24 || 24;
  const evening = span(s.dusk, s.night), dark = span(s.night, s.dawn), morning = span(s.dawn, s.day);
  const t = since(s.dusk);
  if (t < evening) return smooth(t / evening);
  if (t < evening + dark) return 1;
  if (t < evening + dark + morning) return 1 - smooth((t - evening - dark) / morning);
  return 0;
}

/** a light in canvas px: a round pool (rx, ry), strength, an optional colour washed in instead of the warmth */
export interface NightLight { sx: number; sy: number; rx: number; ry: number; i: number; tint?: string }
type Screen = (x: number, y: number) => { x: number; y: number };

/** the lights of one placed sprite (the builder's spriteLights): a typed light at its base, or in front of a house, shop or neon sign (the
 *  front is +y, +x when mirrored), the lights baked into a lot, and its lit windows. ze = canvas px per world px. */
export function propLights(p: Prop, it: LibItem, s: NightSettings, screen: Screen, ze: number, out: NightLight[]) {
  const pxm = 45.25 * ze, cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2;
  const pool = (x: number, y: number, t: LightType) => { if (!(t.r > 0) || !(t.i > 0)) return; const q = screen(x, y); out.push({ sx: q.x, sy: q.y, rx: t.r * pxm, ry: t.r * pxm * 0.5, i: t.i }); };
  if (it.lights) for (const l of it.lights) {
    const t = s.types[l.type as LightKey]; if (!t) continue;
    // metres from the anchor (2 m a tile), scaled and mirrored with the sprite (mirroring swaps the ground axes)
    const u = (l.dx * p.scale) / 2, v = (l.dy * p.scale) / 2; pool(p.x + (p.flip ? v : u), p.y + (p.flip ? u : v), t);
  } else {
    const k = lightType(it);
    if (k) {
      const t = s.types[k];
      if (k === 'porch' || k === 'window' || k === 'neon') { const out2 = (k === 'porch' ? 1 : 1.6) / 2; pool(p.flip ? p.x1 + out2 : cx, p.flip ? cy : p.y1 + out2, t); }
      else pool(cx, cy, t);
    }
  }
  if (it.glows?.length && s.glowSize > 0 && s.glowStrength > 0) {
    const a = screen(p.x, p.y), k = p.scale * ze;
    for (const g of it.glows) { const r = g.r * k * s.glowSize; out.push({ sx: a.x + (p.flip ? it.ax - g.x : g.x - it.ax) * k, sy: a.y + (g.y - it.ay) * k, rx: r, ry: r, i: s.glowStrength }); }
  }
}

/** Applies the night to a finished frame (the builder's applyNight): moonlight everywhere at `amount` (0..1, the hour's darkness), the
 *  frame's own colour back inside each light, warmth in the pools. Reuses its scratch canvases between frames. */
export class NightRenderer {
  private orig: HTMLCanvasElement | null = null; private mask: HTMLCanvasElement | null = null;
  private discs = new Map<number, HTMLCanvasElement>(); private warm: HTMLCanvasElement | null = null; private tints = new Map<string, HTMLCanvasElement>();
  private surface(c: HTMLCanvasElement | null, W: number, H: number) { const s = c ?? document.createElement('canvas'); if (s.width !== W || s.height !== H) { s.width = W; s.height = H; } return s; }
  /** a white feathered disc (soft edge = feather share of the radius) */
  private disc(feather: number) {
    const key = Math.round(feather * 100); let c = this.discs.get(key); if (c) return c;
    const N = 256; c = this.surface(null, N, N); const g = c.getContext('2d')!, gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2), f = clamp(feather, 0.02, 0.98);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1 - f, 'rgba(255,255,255,1)');
    for (let k = 1; k <= 8; k++) { const t = k / 8; gr.addColorStop(1 - f + f * t, `rgba(255,255,255,${(1 - t * t * (3 - 2 * t)).toFixed(3)})`); }
    g.fillStyle = gr; g.fillRect(0, 0, N, N); this.discs.set(key, c); return c;
  }
  private warmDisc() {
    if (this.warm) return this.warm;
    const N = 128, c = this.surface(null, N, N), g = c.getContext('2d')!, gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, 'rgba(255,154,64,1)'); gr.addColorStop(0.6, 'rgba(255,154,64,0.5)'); gr.addColorStop(1, 'rgba(255,154,64,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N); this.warm = c; return c;
  }
  private tintDisc(color: string) {
    let c = this.tints.get(color); if (c) return c;
    const N = 128; c = this.surface(null, N, N); const g = c.getContext('2d')!, gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, color); gr.addColorStop(0.6, color + '80'); gr.addColorStop(1, color + '00'); g.fillStyle = gr; g.fillRect(0, 0, N, N); this.tints.set(color, c); return c;
  }
  /** ctx: the overlay canvas (its own drawing is kept: it is graded with the world); world: the WebGL canvas under it */
  apply(ctx: CanvasRenderingContext2D, world: HTMLCanvasElement, s: NightSettings, amount: number, lights: NightLight[]) {
    if (!(amount > 0)) return;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    this.orig = this.surface(this.orig, W, H); this.mask = this.surface(this.mask, W, H);
    const o = this.orig.getContext('2d')!; o.globalCompositeOperation = 'copy'; o.drawImage(world, 0, 0); o.globalCompositeOperation = 'source-over'; o.drawImage(ctx.canvas, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.orig, 0, 0);
    ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = s.desat * amount; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = s.strength * amount; ctx.fillStyle = s.tint; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = s.dark * amount; ctx.fillStyle = '#03030c'; ctx.fillRect(0, 0, W, H);
    // the lit areas: the untouched frame through the feathered masks
    const m = this.mask.getContext('2d')!, disc = this.disc(s.feather), on = (l: NightLight) => !(l.sx + l.rx < 0 || l.sy + l.ry < 0 || l.sx - l.rx > W || l.sy - l.ry > H || l.rx < 0.5);
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1; m.clearRect(0, 0, W, H); m.globalCompositeOperation = 'lighter';
    for (const l of lights) if (on(l)) { m.globalAlpha = Math.min(1, l.i); m.drawImage(disc, l.sx - l.rx, l.sy - l.ry, l.rx * 2, l.ry * 2); }
    m.globalAlpha = 1; m.globalCompositeOperation = 'source-in'; m.drawImage(this.orig, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = amount; ctx.drawImage(this.mask, 0, 0);
    // a little warmth in the pools (soft light), or the light's own colour (soft light, then screen)
    for (const op of ['soft-light', 'screen'] as const) {
      ctx.globalCompositeOperation = op;
      for (const l of lights) {
        if (!on(l) || (!l.tint && (op === 'screen' || !(s.warmth > 0)))) continue;
        ctx.globalAlpha = Math.min(1, (l.tint ? (op === 'screen' ? 0.22 : 0.4 + s.warmth * 0.5) : s.warmth) * l.i * amount);
        ctx.drawImage(l.tint ? this.tintDisc(l.tint) : this.warmDisc(), l.sx - l.rx, l.sy - l.ry, l.rx * 2, l.ry * 2);
      }
    }
    ctx.restore();
  }
}
