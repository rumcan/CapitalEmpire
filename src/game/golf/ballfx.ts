// T251 (#728): a golf ball's landing effects as canvas particles over the map (the engine's drawBalls): a splash where a ball goes into water (two
// rings spreading on the water and a jet of drops falling back; the water's own drawing is not touched) and a puff of sand round a ball plugged in a
// bunker. u is the effect's progress (0..1, play/roll.ts fu); (x, y) the ball's ground point in canvas px; r the ball's radius (px); m the px of one
// metre of height (HH x zoom).

/** the splash's drops: how many, how high (m) and how long they fly (a share of the splash) */
const DROPS = 6, DROP_H = 0.9, DROP_U = 0.55;
/** the sand's grains: how many and how high they rise (m) */
const GRAINS = 7, GRAIN_H = 0.35;

/** a ball's splash into water at (x, y): a white burst, two rings spreading out and fading (the second a little later), and drops thrown up and out */
export function ballSplash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, m: number, dpr: number): void {
  if (u >= 1) return;
  if (u < 0.3) { ctx.fillStyle = `rgba(240,248,255,${(0.75 * (1 - u / 0.3)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(x, y, 1.6 * r, 0.8 * r, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineWidth = 1.2 * dpr;
  for (let k = 0; k < 2; k++) {
    const v = (u - 0.22 * k) / (1 - 0.22 * k); if (v <= 0) continue;
    const rx = r * (1.2 + 4.8 * v);
    ctx.strokeStyle = `rgba(236,246,255,${(0.85 * (1 - v)).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(x, y, rx, 0.5 * rx, 0, 0, Math.PI * 2); ctx.stroke();
  }
  if (u < DROP_U) {
    const w = u / DROP_U, up = 4 * DROP_H * w * (1 - w) * m, out = r * (0.6 + 2.6 * w), d = Math.max(0.8, 0.5 * r);
    ctx.fillStyle = `rgba(240,248,255,${(0.95 * (1 - 0.6 * w)).toFixed(3)})`; ctx.beginPath();
    for (let j = 0; j < DROPS; j++) { const a = 0.4 + j * 2 * Math.PI / DROPS, px = x + Math.cos(a) * out, py = y + 0.5 * Math.sin(a) * out - up * (0.7 + 0.3 * (j % 2)); ctx.moveTo(px + d, py); ctx.arc(px, py, d, 0, Math.PI * 2); }
    ctx.fill();
  }
}

/** a puff of sand round a ball plugged in a bunker at (x, y): grains thrown up and out round it, falling and fading */
export function ballPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, u: number, m: number): void {
  if (u >= 1) return;
  const up = 4 * GRAIN_H * u * (1 - u) * m, out = r * (1 + 3.2 * u), d = Math.max(0.7, 0.55 * r * (1 - 0.5 * u));
  ctx.fillStyle = `rgba(222,200,150,${(0.9 * (1 - u)).toFixed(3)})`; ctx.beginPath();
  for (let j = 0; j < GRAINS; j++) { const a = 0.2 + j * 2 * Math.PI / GRAINS, k = 0.75 + 0.25 * ((j * 5) % 3) / 2, px = x + Math.cos(a) * out * k, py = y + 0.5 * Math.sin(a) * out * k - up * k; ctx.moveTo(px + d, py); ctx.arc(px, py, d, 0, Math.PI * 2); }
  ctx.fill();
}
