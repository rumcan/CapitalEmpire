import { paranormalFrame, paranormalNightStrength } from './frames';
﻿import { sampleParanormalBattle, type ParanormalActor } from '../paranormal';
import type { DisasterView } from '../../city';
import type { LibItem, Prop } from '../../types';
import manifest from '../../../assets/paranormal/manifest.json';

const urls = import.meta.glob('../../../assets/paranormal/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
type SpriteKey = keyof typeof manifest;
type Light = { x: number; y: number; radius: number; intensity: number; color: string };
type Screen = (x: number, y: number) => { x: number; y: number };
const MAX_LIGHTS = 192, MAX_ACTORS = 56;
const LIGHT_TYPES: [RegExp, number, number][] = [
  [/streetlamp|street.lamp|lantern|phone_booth|bus_stop/, 4, 1],
  [/arcade|diner|neon/, 4.5, 1],
  [/house|cottage|duplex|victorian|ranch|building|shop|grocery|school|church|bakery|pharmacy/, 3.5, .85],
  [/pumpkin|firepit|candy_stand/, 2, .9],
];

/** Canvas adapter for TrickOrTreat's blue moonlight + feathered restoration masks + warm porch/torch glows.
 * The WebGL frame and completed HUD-free world overlay are copied in-frame; no readback or per-pixel CPU work. */
export class ParanormalRenderer {
  private sheets = new Map<SpriteKey, HTMLImageElement>();
  private original: HTMLCanvasElement | null = null;
  private mask: HTMLCanvasElement | null = null;
  private disc: HTMLCanvasElement | null = null;
  private lights: Light[] = [];
  private lastLights = -Infinity;
  private propCount = -1;
  private cameraKey = '';

  private sheet(key: SpriteKey) {
    let im = this.sheets.get(key);
    if (!im) { im = new Image(); im.src = urls[`../../../assets/paranormal/${manifest[key].file}`]; this.sheets.set(key, im); }
    return im.complete && im.naturalWidth ? im : null;
  }
  private surface(width: number, height: number, old: HTMLCanvasElement | null) {
    const c = old ?? document.createElement('canvas');
    if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
    return c;
  }
  private feather() {
    if (this.disc) return this.disc;
    const c = this.surface(128, 128, null), g = c.getContext('2d')!, r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, '#fff'); r.addColorStop(.35, '#fff');
    for (let k = 1; k <= 8; k++) { const t = k / 8; r.addColorStop(.35 + .65 * t, `rgba(255,255,255,${1 - t * t * (3 - 2 * t)})`); }
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); this.disc = c; return c;
  }
  private collectLights(props: Set<Prop>, library: readonly LibItem[], screen: Screen, w: number, h: number, now: number) {
    const origin = screen(0, 0), key = `${Math.round(origin.x / 80)},${Math.round(origin.y / 80)},${w},${h}`;
    if (now - this.lastLights < 500 && props.size === this.propCount && key === this.cameraKey) return;
    this.lastLights = now; this.propCount = props.size; this.cameraKey = key;
    const candidates: (Light & { dist: number })[] = [];
    for (const p of props) {
      const item = library[p.item]; if (!item) continue;
      const type = LIGHT_TYPES.find(([re]) => re.test(item.id));
      if (!type && !item.glows?.length) continue;
      const x = p.x + (p.flip ? Math.max(0, p.x1 - p.x) : 0), y = p.y + (p.flip ? 0 : Math.max(0, p.y1 - p.y));
      const pos = screen(x, y); if (pos.x < -120 || pos.y < -120 || pos.x > w + 120 || pos.y > h + 120) continue;
      candidates.push({ x, y, radius: type?.[1] ?? 3, intensity: type?.[2] ?? .85, color: '#ffac59', dist: (pos.x - w / 2) ** 2 + (pos.y - h / 2) ** 2 });
    }
    candidates.sort((a, b) => a.dist - b.dist); this.lights = candidates.slice(0, MAX_LIGHTS);
  }

  /** Draw only while paranormal events are active; all sizes are device pixels, tilePx is HW * camera zoom * dpr. */
  draw(ctx: CanvasRenderingContext2D, world: HTMLCanvasElement, disasters: readonly DisasterView[], simTime: number, now: number,
    screen: Screen, tilePx: number, dpr: number, props: Set<Prop>, library: readonly LibItem[]) {
    const strength = paranormalNightStrength(disasters, simTime);
    if (!(strength > 0)) return;
    const w = ctx.canvas.width, h = ctx.canvas.height, actors: ParanormalActor[] = [];
    for (const d of disasters) {
      if (d.kind !== 'paranormal' || simTime < d.start || simTime >= d.end) continue;
      const area = []; for (let i = 0; i + 1 < d.area.length; i += 2) area.push({ x: d.area[i], y: d.area[i + 1] });
      actors.push(...sampleParanormalBattle({ ...d, area }, simTime)); if (actors.length >= MAX_ACTORS) break;
    }
    actors.length = Math.min(actors.length, MAX_ACTORS);
    this.collectLights(props, library, screen, w, h, now);
    const lights = this.lights.slice();
    for (const a of actors) lights.push({ x: a.x, y: a.y, radius: a.light.radius, intensity: a.light.intensity, color: a.light.color });
    this.original = this.surface(w, h, this.original); this.mask = this.surface(w, h, this.mask);
    const original = this.original.getContext('2d')!, mask = this.mask.getContext('2d')!;
    original.globalCompositeOperation = 'copy'; original.drawImage(world, 0, 0); original.globalCompositeOperation = 'source-over'; original.drawImage(ctx.canvas, 0, 0);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(this.original, 0, 0);
    ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = .6 * strength; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .7 * strength; ctx.fillStyle = '#4656c8'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .3 * strength; ctx.fillStyle = '#03030c'; ctx.fillRect(0, 0, w, h);
    mask.setTransform(1, 0, 0, 1, 0, 0); mask.globalCompositeOperation = 'source-over'; mask.globalAlpha = 1; mask.clearRect(0, 0, w, h); mask.globalCompositeOperation = 'lighter';
    const disc = this.feather();
    for (const l of lights) {
      const p = screen(l.x, l.y), rx = l.radius * tilePx, ry = rx * .65;
      if (rx < 1 || p.x + rx < 0 || p.y + ry < 0 || p.x - rx > w || p.y - ry > h) continue;
      mask.globalAlpha = Math.min(1, l.intensity); mask.drawImage(disc, p.x - rx, p.y - ry, rx * 2, ry * 2);
    }
    mask.globalAlpha = 1; mask.globalCompositeOperation = 'source-in'; mask.drawImage(this.original, 0, 0);
    ctx.globalAlpha = strength; ctx.drawImage(this.mask, 0, 0);
    // Warm pool colours match the builder's restoration masks; torch intensity follows sim time when paused.
    ctx.globalCompositeOperation = 'screen';
    for (const l of lights) {
      const p = screen(l.x, l.y), r = l.radius * tilePx;
      if (r < 1 || p.x + r < 0 || p.y + r < 0 || p.x - r > w || p.y - r > h) continue;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); glow.addColorStop(0, l.color); glow.addColorStop(1, `${l.color}00`);
      ctx.globalAlpha = .12 * l.intensity * strength; ctx.fillStyle = glow; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    actors.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const a of actors) this.actor(ctx, a, actors, simTime, screen, tilePx, dpr, w, h);
    ctx.restore();
  }
  private actor(ctx: CanvasRenderingContext2D, a: ParanormalActor, actors: ParanormalActor[], time: number, screen: Screen, tilePx: number, dpr: number, w: number, h: number) {
    const key: SpriteKey = a.kind === 'kid' ? (['tommy', 'jess', 'sam'] as const)[Math.floor(a.id / 2) % 3] : a.kind;
    const im = this.sheet(key), p = screen(a.x, a.y), height = tilePx * (a.kind === 'werewolf' ? 2.5 : a.kind === 'bat' ? 1.1 : 1.9);
    if (!im || height < 2 || p.x < -height || p.x > w + height || p.y < -height || p.y > h + height) return;
    const f = paranormalFrame(key, time, a.action, a.facing, a.id), scale = height / f.sh;
    ctx.save(); ctx.globalAlpha = a.alpha;
    ctx.fillStyle = '#04031180'; ctx.beginPath(); ctx.ellipse(p.x, p.y, height * .22, height * .075, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(p.x, p.y - (a.action === 'fight' ? Math.max(0, Math.sin(time * 10 + a.id)) * height * .07 : 0));
    ctx.scale(f.flip ? -1 : 1, 1);
    if (a.action === 'defeated') { ctx.rotate(-Math.PI / 2); ctx.scale(.8, .8); }
    ctx.drawImage(im, f.sx, f.sy, f.sw, f.sh, -f.ax * scale, -f.ay * scale, f.sw * scale, f.sh * scale);
    ctx.restore();
    if (a.action !== 'fight') return;
    const target = actors.find(b => b.id === (a.id ^ 1)); if (!target) return;
    const t = screen(target.x, target.y), phase = ((time * 2.5 + a.id * .21) % 1 + 1) % 1;
    const x = p.x + (t.x - p.x) * phase, y = p.y + (t.y - p.y) * phase - height * .45 - Math.sin(phase * Math.PI) * height * .25;
    ctx.save(); ctx.globalAlpha = a.alpha; ctx.strokeStyle = a.kind === 'kid' ? '#ffe4a5' : '#b2a2ff'; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.beginPath(); ctx.moveTo(x - (t.x - p.x) * .12, y - (t.y - p.y) * .12); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.5 * dpr, height * .045), 0, Math.PI * 2); ctx.fill();
    if (phase > .8) { ctx.beginPath(); const r = height * .17; ctx.moveTo(t.x - r, t.y - height * .45); ctx.lineTo(t.x + r, t.y - height * .45); ctx.moveTo(t.x, t.y - height * .45 - r); ctx.lineTo(t.x, t.y - height * .45 + r); ctx.stroke(); }
    if (height > 12 * dpr) { const bar = height * .55; ctx.fillStyle = '#170e22'; ctx.fillRect(p.x - bar / 2, p.y - height * 1.02, bar, 2 * dpr); ctx.fillStyle = a.kind === 'kid' ? '#8ee9ad' : '#e79bfe'; ctx.fillRect(p.x - bar / 2, p.y - height * 1.02, bar * (.25 + .75 * (1 - (time % 40) / 40)), 2 * dpr); }
    ctx.restore();
  }
}
