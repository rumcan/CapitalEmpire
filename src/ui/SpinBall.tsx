// T318 (#904): the spin ball in the bottom right of the shot view (Tiger Woods 2008 style). Before the shot: click or drag on the ball to put the dot where
// the club should strike it (top: topspin, the ball runs out; bottom: backspin, it checks or spins back; left / right: draw / fade). While the ball is in
// the air: each click on the ball, or the F key, adds more of that spin (the meter fills to the club's and the lie's cap). It reads game.spinView(); App
// mounts it while a full shot is open or a spun ball flies. A plain canvas (no atlas page), with no caption on it (#1296: nothing on screen says Stand In).
import { useEffect, useRef } from 'react';
import type { Game } from '../game/engine';
import { CLUB_NAME, SPIN } from '../game/golf/play';

/** the canvas (CSS px), the ball's centre and radius */
const W = 136, H = 136, CX = 68, CY = 66, R = 50;

type View = NonNullable<ReturnType<Game['spinView']>>;

/** draws the ball, the cross, the labels and the dot (and in the air the pulse of a click) */
function drawBall(c: HTMLCanvasElement, v: View, pulse: number) {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
  const ctx = c.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  // the ball: lit from the upper right (the game's sun), a cool shade at the lower left
  const g = ctx.createRadialGradient(CX + R * 0.35, CY - R * 0.4, R * 0.1, CX, CY, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#eef2f6'); g.addColorStop(1, '#b8c2cf');
  ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = v.air ? (v.room ? '#fbbf24' : '#f87171') : 'rgba(15,23,42,0.6)'; ctx.stroke();
  // dimples (a fixed scatter)
  ctx.fillStyle = 'rgba(100,116,139,0.18)';
  for (let k = 0; k < 26; k++) {
    const a = k * 2.399963, rr = R * 0.88 * Math.sqrt((k + 0.5) / 26), x = CX + rr * Math.cos(a), y = CY + rr * Math.sin(a);
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  // the cross and the cap ring (the most spin in the dot's direction)
  ctx.strokeStyle = 'rgba(15,23,42,0.28)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(CX - R, CY); ctx.lineTo(CX + R, CY); ctx.moveTo(CX, CY - R); ctx.lineTo(CX, CY + R); ctx.stroke();
  // the labels
  ctx.font = '600 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(226,232,240,0.85)';
  ctx.fillText('TOP', CX, CY - R - 8); ctx.fillText('BACK', CX, CY + R + 8);
  ctx.save(); ctx.translate(CX - R - 9, CY); ctx.rotate(-Math.PI / 2); ctx.fillText('DRAW', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(CX + R + 9, CY); ctx.rotate(Math.PI / 2); ctx.fillText('FADE', 0, 0); ctx.restore();
  // the dot: where the club strikes the ball; in the air its ring grows with the spin
  const dx = CX + v.x * R * 0.9, dy = CY - v.y * R * 0.9;
  if (v.air) {
    ctx.beginPath(); ctx.arc(dx, dy, 7 + 14 * v.amount + 6 * pulse, 0, Math.PI * 2); ctx.strokeStyle = `rgba(239,68,68,${0.35 + 0.5 * pulse})`; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fillStyle = '#dc2626'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#7f1d1d'; ctx.stroke();
}

/** the spin ball: nothing with no full shot open and no spun ball in the air */
export function SpinBall({ game, right }: { game: Game; right: string }) {
  const v = game.spinView();
  const canvas = useRef<HTMLCanvasElement | null>(null), drag = useRef(false), pulseAt = useRef(0);
  const vr = useRef(v); vr.current = v;

  // F while the ball is in the air: one more click of spin (capturing: F's flow overlay waits while the ball flies)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const cur = vr.current; if (!cur?.air || e.ctrlKey || e.metaKey || e.altKey || (e.key !== 'f' && e.key !== 'F')) return;
      const tag = (e.target as HTMLElement | null)?.tagName; if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!e.repeat) { pulseAt.current = performance.now(); game.spinPump(); }
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [game]);

  // drawn on each change, and a short pulse after a click in the air
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const c = canvas.current, cur = vr.current; if (!c || !cur) return;
      const p = Math.max(0, 1 - (performance.now() - pulseAt.current) / 250);
      drawBall(c, cur, p);
      if (p > 0) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [v?.x, v?.y, v?.air, v?.pump, v?.amount, v?.room]);

  if (!v) return null;
  /** the dot from a pointer on the canvas (the ball's unit circle; y up) */
  const aimAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect(), x = (e.clientX - b.left - CX) / (R * 0.9), y = -(e.clientY - b.top - CY) / (R * 0.9);
    game.setShotSpin(x, y);
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (v.air) { pulseAt.current = performance.now(); game.spinPump(); return; }
    drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); aimAt(e);
  };
  const clicks = Math.round(v.amount * 100), capPct = Math.round(v.cap * 100);
  return (
    <div className={`pointer-events-auto absolute ${right} bottom-[calc(var(--foot-stack,0px)+0.75rem)] z-20 w-[11rem] glass p-2 text-slate-200`} data-testid="spin-ball">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xs font-bold tracking-wide text-[var(--gold-hi)] uppercase">Spin</span>
        <span className="text-[10px] text-slate-400">{CLUB_NAME[v.club]}</span>
      </div>
      <canvas ref={canvas} width={W} height={H} className={`mx-auto block select-none ${v.air ? 'cursor-pointer' : 'cursor-crosshair'}`} style={{ width: W, height: H, touchAction: 'none' }}
        aria-label="Spin ball" onPointerDown={onDown} onPointerMove={e => { if (drag.current && !v.air) aimAt(e); }}
        onPointerUp={() => { drag.current = false; }} onContextMenu={e => { e.preventDefault(); if (!v.air) game.setShotSpin(0, 0); }} />
      {/* the meter: the spin now, and the cap the club and the lie allow in the dot's direction */}
      <div className="relative mt-1 h-2 rounded bg-slate-700/70" title={`The most spin this club and lie allow: ${capPct}%`}>
        <div className="absolute inset-y-0 left-0 rounded bg-red-500" style={{ width: `${clicks}%` }} />
        <div className="absolute inset-y-[-2px] w-[2px] bg-amber-300" style={{ left: `calc(${capPct}% - 1px)` }} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-slate-200" data-testid="spin-text">{v.text}{v.air && v.pump > 0 ? ` (+${v.pump})` : ''}</p>
      <p className="text-[10px] leading-tight text-slate-400">
        {v.air ? (v.room ? 'Click the ball or press F for more spin!' : 'Full spin for this club and lie')
          : v.pumpOk ? `Click or drag on the ball to choose the spin; in the air click (or F) to add ${Math.round(SPIN.per * 100)}% a click. Right-click: none.`
            : 'Click or drag on the ball to choose the spin. Right-click: none. (Adding spin in the air is the Mid-Flight Whisper card’s.)'}
      </p>
    </div>
  );
}
