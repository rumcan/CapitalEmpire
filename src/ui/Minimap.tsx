// The bottom-left minimap of the whole map (terrain, lots, roads and the view box) and the town chip beside it. The base picture is
// rebuilt only when the roads, the valley, the lots (throttled) or the pixel ratio change; each frame only redraws the view box when the camera moves.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Game } from '../game/engine';
import { DISTRICT_Z, MAP } from '../game/iso';
import { TC } from '../game/terrain/types';
import { Icon } from './Icon';

const W = 200, H = 100; // minimap CSS size, px
const S = W / (2 * MAP); // px per tile along each iso axis: the whole map fits the frame
const TN = 256, TSTEP = 8; // terrain layer: one pixel per 8x8 tiles
const LOT_MS = 500; // lots-only changes rebuild the base at most this often
/** terrain colours by TC value: GROUND, PATCH, HILL, WATER, CREEK, BANK */
const TERRAIN_RGB: number[][] = [[95, 122, 60], [108, 135, 67], [122, 110, 94], [58, 109, 153], [88, 121, 74], [138, 135, 92]];
const ROAD_STYLE: [string, number][] = [['#bfb7a5', 0.7], ['#efe2bf', 1.1], ['#f5b52e', 1.6]];

/** the terrain layer: a TN x TN picture of the classes sampled at each 8x8 block's centre */
function buildTerrain(cls: Uint8Array): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = TN;
  const g = c.getContext('2d')!;
  const img = g.createImageData(TN, TN), d = img.data;
  for (let by = 0; by < TN; by++) for (let bx = 0; bx < TN; bx++) {
    const col = TERRAIN_RGB[cls[(by * TSTEP + TSTEP / 2) * MAP + bx * TSTEP + TSTEP / 2] ?? TC.GROUND] ?? TERRAIN_RGB[0]!;
    const o = (by * TN + bx) * 4;
    d[o] = col[0]!; d[o + 1] = col[1]!; d[o + 2] = col[2]!; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** paints the base picture: terrain, then lots as 1 px squares, then the roads by width */
function paintBase(game: Game, terr: HTMLCanvasElement, dpr: number, base: HTMLCanvasElement) {
  const g = base.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, base.width, base.height);
  g.setTransform(dpr * S * TSTEP, dpr * S * TSTEP / 2, -dpr * S * TSTEP, dpr * S * TSTEP / 2, dpr * W / 2, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(terr, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#d8b47a';
  for (const l of game.traffic.lots.values()) {
    const x = l.o[0] + l.u[0] * l.w / 2 + l.n[0] * l.d / 2, y = l.o[1] + l.u[1] * l.w / 2 + l.n[1] * l.d / 2;
    g.fillRect((x - y) * S + W / 2, (x + y) * S / 2, 1, 1);
  }
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  for (const sg of game.net.segs) {
    const h = sg.cls.h, p = paths[h < 2.5 ? 0 : h < 4.5 ? 1 : 2]!;
    const ax = sg.a.x, ay = sg.a.y, bx = sg.b.x, by = sg.b.y;
    p.moveTo((ax - ay) * S + W / 2, (ax + ay) * S / 2);
    p.lineTo((bx - by) * S + W / 2, (bx + by) * S / 2);
  }
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) { g.strokeStyle = ROAD_STYLE[k]![0]; g.lineWidth = ROAD_STYLE[k]![1]; g.stroke(paths[k]!); }
}

/** the bottom-left minimap and the town chip (a dropdown jumps to the overview or a town) */
export function Minimap({ game }: { game: Game }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const base = document.createElement('canvas');
    let terr: HTMLCanvasElement | null = null, cls: Uint8Array | null = null, hasBase = false;
    let netVer = -1, nLots = -1, dprB = 0, built = 0, lastBuild = -Infinity;
    let kX = NaN, kY = NaN, kZ = NaN, kW = NaN, kH = NaN, kB = -1;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio || 1, now = performance.now();
      const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
      if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
      // base picture: rebuilt in this check, never in render
      const c = game.terrain ? game.terrain.cls : null;
      let dirty = false;
      if (c !== cls) { cls = c; terr = c ? buildTerrain(c) : null; dirty = true; }
      if (dpr !== dprB || game.net.version !== netVer) dirty = true;
      const nl = game.traffic.lots.size;
      if (nl !== nLots && now - lastBuild >= LOT_MS) dirty = true;
      if (dirty && terr && cls) {
        if (base.width !== pw || base.height !== ph) { base.width = pw; base.height = ph; }
        paintBase(game, terr, dpr, base);
        netVer = game.net.version; nLots = nl; dprB = dpr; lastBuild = now; built++; hasBase = true;
      }
      // view box: only when the camera, the canvas size or the base changed
      const cx = game.cam.X, cy = game.cam.Y, cz = game.cam.z, cw = game.cssW, ch = game.cssH;
      if (cx === kX && cy === kY && cz === kZ && cw === kW && ch === kH && built === kB) return;
      kX = cx; kY = cy; kZ = cz; kW = cw; kH = ch; kB = built;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (hasBase) ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const p0 = game.tileAt(0, 0), p1 = game.tileAt(cw, 0), p2 = game.tileAt(cw, ch), p3 = game.tileAt(0, ch);
      ctx.beginPath();
      ctx.moveTo((p0.x - p0.y) * S + W / 2, (p0.x + p0.y) * S / 2);
      ctx.lineTo((p1.x - p1.y) * S + W / 2, (p1.x + p1.y) * S / 2);
      ctx.lineTo((p2.x - p2.y) * S + W / 2, (p2.x + p2.y) * S / 2);
      ctx.lineTo((p3.x - p3.y) * S + W / 2, (p3.x + p3.y) * S / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,181,46,0.14)'; ctx.fill();
      ctx.strokeStyle = '#f5b52e'; ctx.lineWidth = 1.5; ctx.stroke();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  /** centres the view on the minimap point under (ox, oy) (canvas CSS px) */
  const goTo = (ox: number, oy: number) => {
    const diff = (ox - W / 2) / S, sum = 2 * oy / S;
    game.lookAt(Math.min(MAP, Math.max(0, (sum + diff) / 2)), Math.min(MAP, Math.max(0, (sum - diff) / 2)));
  };
  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); dragRef.current = true;
    goTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    if (dragRef.current) goTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation(); dragRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const stop = (e: ReactPointerEvent) => e.stopPropagation();

  // town chip: the nearest town to the view centre once zoomed in past DISTRICT_Z, else the overview
  const centre = game.tileAt(game.cssW / 2, game.cssH / 2);
  let near = -1;
  if (game.cam.z >= DISTRICT_Z) {
    let best = Infinity;
    game.townPts.forEach((p, i) => { const d = (p.x - centre.x) ** 2 + (p.y - centre.y) ** 2; if (d < best) { best = d; near = i; } });
  }
  const line1 = near >= 0 ? game.names.town(near) : 'Maple Falls';
  const line2 = near >= 0 ? 'Town' : 'Overview';

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-end gap-2" onPointerDown={stop} onPointerMove={stop} onPointerUp={stop}>
      <div className="glass p-1.5 relative">
        <canvas
          ref={canvasRef}
          width={Math.round(W * (window.devicePixelRatio || 1))}
          height={Math.round(H * (window.devicePixelRatio || 1))}
          style={{ width: W, height: H }}
          className="block cursor-pointer"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <div className="absolute right-2 top-1 text-[10px] font-bold text-[var(--gold)] leading-none text-center">▲<br />N</div>
      </div>
      <div className="glass flex items-center gap-2 px-3 py-2 relative">
        <div className="flex flex-col">
          <span className="font-display text-sm">{line1}</span>
          <span className="text-[11px] text-[var(--muted)]">{line2}</span>
        </div>
        <button type="button" className="btn px-1 py-1" aria-label="Choose a town" aria-expanded={open} onClick={() => setOpen(o => !o)}>
          <Icon name="down" size={16} className={open ? 'rotate-180' : ''} />
        </button>
        {open && (
          <div className="glass p-1 flex flex-col min-w-40 absolute bottom-full mb-2 left-0 max-h-72 overflow-y-auto">
            <button type="button" className="btn w-full justify-start" onClick={() => { game.lookAt(MAP / 2, MAP / 2, 0.03); setOpen(false); }}>Overview</button>
            {game.townPts.map((p, i) => (
              <button key={i} type="button" className="btn w-full justify-start" onClick={() => { game.lookAt(p.x, p.y, Math.max(game.cam.z, 0.14)); setOpen(false); }}>{game.names.town(i)}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
