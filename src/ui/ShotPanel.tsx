// The owner's shot panel (docs/GOLF-PLAY.md decision 7, P4b; T316 #902 the 3-click swing): open while his shot is due (the game is paused for it). The
// hole, par and stroke; the distance to the pin and to the aim; his lie; the clubs his lie allows (the suggested one marked; Q/E or the wheel cycle them)
// with the club's full carry; the half-circle swing meter (swing.ts SwingMeter): Enter or a click on the meter starts the swing, the second sets the power,
// the third the accuracy at the snap line; Space taps during the swing add a little power (capped) and narrow the sweet spot. Then the caddie's finish,
// and the last shot's carry and total. It sits bottom centre and reads game.shotState(); App mounts it while a shot is open.
// T334 (#960): the conditions (play/conditions.ts, Game.shotConditions): the wind (a dial: the arrow is the way it blows against the shot, up the line a tailwind; its speed, gusts and
// what it adds to this shot), the lie and what it does (carry, scatter, spin, a flier's chance) and the slope under the ball; the meter's aim mark is where to stop the power for the
// distance the shot PLAYS like in them.
// The meter is a plain canvas (no atlas page): a labelled stand-in until meter art exists.
import { useEffect, useRef, useState } from 'react';
import type { Game, ShotState } from '../game/engine';
import { BOOST, CLUB_NAME, METER, SwingMeter, allowedClubs, compassOf, meterMark, pickText, shapeText, sweetSpot, swingEffect, type Lie, type SwingPhase } from '../game/golf/play';
import { TILE_M } from '../game/golf/types';

/** the lies as the panel names them */
const LIE_NAME: Record<Lie, string> = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', fescue: 'Fescue', bunker: 'Bunker', green: 'Green', water: 'Water', out: 'Out of bounds' };
/** yards per metre */
const YARDS = 1.09361;
/** how long (ms) the finished meter holds before the shot is played (so the player sees where his clicks landed) */
const HOLD_MS = 650;
/** the meter canvas (CSS px), the arc's centre and radius */
const CW = 300, CH = 178, CX = 150, CY = 118, R = 96;

/** the shot panel: nothing with no shot open */
export function ShotPanel({ game }: { game: Game }) {
  const s = game.shotState();
  if (!s) return null;
  // a fresh meter for each turn
  return <ShotPanelBody key={`${s.turn.holeIdx}:${s.turn.stroke}`} game={game} s={s} />;
}

/** the arc's angle (radians, counter-clockwise from the right) of a meter mark u: the snap line at the right end, the arc's top end (TOP) at the left */
const ang = (u: number): number => (u / METER.top) * Math.PI;
/** the canvas point at mark u and radius r */
const pt = (u: number, r: number): [number, number] => [CX + r * Math.cos(ang(u)), CY - r * Math.sin(ang(u))];

/** what the meter draws besides the swing: the sweet spot's half width, the aim's mark, the 100% label, whether it is a putt */
interface MeterLook { sweet: number; aimMark: number; full: string; putting: boolean }

/** draws the meter at time t (s), with the swing's result line once it is done */
function drawMeter(c: HTMLCanvasElement, m: SwingMeter | null, t: number, look: MeterLook, result: string | null) {
  const dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(CW * dpr)) { c.width = Math.round(CW * dpr); c.height = Math.round(CH * dpr); }
  const ctx = c.getContext('2d'); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, CW, CH);
  const band = (u0: number, u1: number, col: string, w: number) => { ctx.beginPath(); ctx.arc(CX, CY, R, -ang(u0), -ang(u1), true); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.stroke(); };
  const tick = (u: number, r0: number, r1: number, col: string, w: number) => { const [x0, y0] = pt(u, r0), [x1, y1] = pt(u, r1); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.stroke(); };
  const label = (u: number, r: number, text: string, col: string, size = 10) => { const [x, y] = pt(u, r); ctx.fillStyle = col; ctx.font = `600 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y); };
  // the arc: past the snap (a late click: right), the power side, the overswing; the sweet spot over the snap line
  band(METER.low, 0, 'rgba(244,114,182,0.45)', 16);
  band(0, 1, 'rgba(56,189,248,0.35)', 16);
  band(1, METER.top, 'rgba(248,113,113,0.6)', 16);
  band(Math.max(METER.low, -look.sweet), Math.min(METER.top, look.sweet), 'rgba(74,222,128,0.95)', 18);
  for (let u = 0.25; u < 1; u += 0.25) tick(u, R - 8, R + 8, 'rgba(226,232,240,0.35)', 1);
  tick(0, R - 14, R + 14, '#f8fafc', 2); label(0, R + 24, 'snap', '#e2e8f0', 9);
  tick(1, R - 12, R + 12, '#fbbf24', 3); label(1, R + 26, look.full, '#fcd34d', 10);
  label((1 + METER.top) / 2, R - 22, 'over', 'rgba(254,202,202,0.9)', 9);
  if (look.aimMark > 0.02) { tick(look.aimMark, R - 10, R + 10, '#22d3ee', 2); label(look.aimMark, R - 22, 'aim', '#67e8f9', 9); }
  // early on the way back misses left, late misses right
  label(0.15, R - 28, look.putting ? 'pull' : 'pull · hook', 'rgba(226,232,240,0.75)', 9);
  label(-0.13, R - 28, look.putting ? 'push' : 'push · slice', 'rgba(226,232,240,0.75)', 9);
  // the clicks so far: the power set (gold) and the accuracy (pink)
  if (m?.power != null) tick(m.power, R - 16, R + 16, '#fde047', 3);
  if (m?.acc != null) tick(m.acc, R - 18, R + 18, '#f472b6', 3);
  // the marker
  const u = m ? m.pos(t) : 0, [mx, my] = pt(u, R + 16), [ix, iy] = pt(u, 30);
  ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(mx, my); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill();
  // the centre: the power now (or set), the boost, the result
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#f8fafc';
  const pw = m?.power ?? (m && m.phase === 'up' ? u : null);
  ctx.font = '700 22px system-ui, sans-serif'; ctx.fillText(pw === null ? 'Ready' : `${Math.round(pw * 100)}%`, CX, CY - 8);
  const b = m ? m.boost() : 0;
  ctx.font = '600 11px system-ui, sans-serif'; ctx.fillStyle = b > 0 ? '#fca5a5' : 'rgba(226,232,240,0.6)';
  ctx.fillText(b > 0 ? `boost +${Math.round(b * 100)}%${b >= BOOST.max ? ' (max)' : ''}` : 'Space: boost', CX, CY + 8);
  if (result) { ctx.font = '700 13px system-ui, sans-serif'; ctx.fillStyle = '#fde68a'; ctx.fillText(result, CX, CY + 34); }
  ctx.font = '500 8px system-ui, sans-serif'; ctx.fillStyle = 'rgba(226,232,240,0.4)'; ctx.textAlign = 'left'; ctx.fillText('Stand In for swing meter art', 4, CH - 4);
}

/** the wind dial and the lie's box for the open shot (T334): re-read ten times a second, as the gusts move */
function ConditionsBox({ game }: { game: Game }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick(n => (n + 1) % 1e6), 120); return () => window.clearInterval(id); }, []);
  const c = game.shotConditions(); if (!c || !c.on) return null;
  const w = c.wind, len = 8 + Math.min(w.mph, 25) * 0.8, pv = c.preview;
  const add = [Math.abs(pv.windCarryM) >= 1 ? `${pv.windCarryM > 0 ? '+' : '-'}${Math.abs(Math.round(pv.windCarryM))} m` : '', Math.abs(pv.windDriftM) >= 1 ? `${Math.abs(Math.round(pv.windDriftM))} m ${pv.windDriftM > 0 ? 'right' : 'left'}` : ''].filter(Boolean).join(', ');
  return (
    <div className="mt-1 flex flex-col gap-1" data-testid="shot-conditions">
      {!c.putting && (
        <div className="flex items-center gap-2 rounded-md bg-slate-900/50 px-2 py-1" title="The wind moves the ball in the air: more on a long, high shot, less on a low one, none on a putt. The dial looks down the shot: up is the target.">
          <svg width="46" height="46" viewBox="-23 -23 46 46" aria-label="Wind dial" className="shrink-0">
            <circle r="21" fill="rgba(15,23,42,0.5)" stroke="rgba(148,163,184,0.5)" />
            <path d="M0 -21 l-3.5 5.5 h7 z" fill="#fbbf24" />
            {!w.calm && (
              <g transform={`rotate(${w.arrow.toFixed(1)})`} stroke="#67e8f9" fill="#67e8f9" strokeLinecap="round">
                <line x1="0" y1={len / 2} x2="0" y2={-len / 2 + 3} strokeWidth="2.4" />
                <path d={`M0 ${-len / 2 - 3} l-4.5 7.5 h9 z`} stroke="none" />
              </g>
            )}
          </svg>
          <div className="leading-tight" data-testid="wind-text">
            <div className="text-sm font-bold tabular-nums text-cyan-100">{w.calm ? 'Calm' : `${Math.round(w.mph)} mph`}</div>
            <div className="text-[11px] text-slate-200">{w.rel}{add ? `: ${add}` : ''}</div>
            {!w.calm && <div className="text-[11px] text-slate-400">from the {compassOf(w.from)} · gusts to {w.peak}</div>}
          </div>
        </div>
      )}
      <div className="rounded-md bg-slate-900/50 px-2 py-1 leading-tight" data-testid="lie-text" title={c.lie.note}>
        <div className="text-sm font-bold text-slate-100">{c.lie.name}{c.lie.flier >= 0.05 ? ' · flier risk' : ''}</div>
        <div className="text-[11px] text-slate-300">{c.putting ? 'On the green' : c.lie.lines.length ? c.lie.lines.join(' · ') : c.lie.note}</div>
        {!c.putting && c.slopeLines.map(l => <div key={l} className="text-[11px] text-amber-200">{l}</div>)}
      </div>
    </div>
  );
}

/** the panel for one open turn */
function ShotPanelBody({ game, s }: { game: Game; s: ShotState }) {
  const t = s.turn, i = s.input, putting = i.club === 'putter', clubs = allowedClubs(t.lie, t.lie === 'tee'), skill = game.shotSkill();
  const aimM = Math.hypot(i.aim.x - t.ball.x, i.aim.y - t.ball.y) * TILE_M, fullM = putting ? t.distM : game.shotCarry(), kit = game.shotKit(), cond = game.shotConditions(), playsM = cond?.on && !putting ? cond.playsLikeM : aimM, suggested = cond?.suggest ?? t.suggested.club;
  const meter = useRef<SwingMeter | null>(null), canvas = useRef<HTMLCanvasElement | null>(null), fired = useRef(false);
  const [phase, setPhase] = useState<SwingPhase>('ready');
  const [result, setResult] = useState<string | null>(null);
  const look: MeterLook = { sweet: sweetSpot(skill, 0, kit?.sweet ?? 1), aimMark: meterMark(fullM > 0 ? playsM / fullM : 1, putting), full: putting ? `100% · ${t.distM.toFixed(1)} m` : `100% · ${Math.round(fullM)} m`, putting };
  const swinging = phase === 'up' || phase === 'back', busy = phase !== 'ready';
  const last = game.lastShotReport();

  /** the swing's end (by the third click, or by itself past the arc's end): shows the miss, holds, then plays the shot */
  const finish = (m: SwingMeter) => {
    const o = m.outcome(); if (!o || fired.current) return;
    fired.current = true;
    const e = swingEffect(o, game.shotSkill(), putting, game.shotKit()?.sweet ?? 1);
    setPhase('done'); setResult(`${shapeText(e)} · ${Math.round(e.power * 100)}%`);
    window.setTimeout(() => game.ownerSwing(o), HOLD_MS);
  };
  /** the swing button (Enter, a click): starts, sets the power, sets the accuracy */
  const click = () => {
    if (!meter.current) meter.current = new SwingMeter(game.shotSkill(), game.shotKit()?.speed ?? 1);
    const m = meter.current; if (m.phase === 'done') return;
    const ph = m.click(performance.now() / 1000); setPhase(ph);
    if (ph === 'done') finish(m);
  };
  /** the club one step longer (-1) or shorter (+1), not once the swing has begun */
  const cycle = (d: number) => {
    if (meter.current) return;
    const k = clubs.indexOf(i.club), n = clubs[Math.min(clubs.length - 1, Math.max(0, k + d))];
    if (n && n !== i.club) game.setShotClub(n);
  };
  const api = useRef({ click, cycle, finish }); api.current = { click, cycle, finish };
  const lookRef = useRef(look); lookRef.current = look;
  const resultRef = useRef(result); resultRef.current = result;

  // the keys and clicks while the panel is open (capturing: the game's own Enter, Space-to-pause, Q and E wait while the shot is open)
  useEffect(() => {
    const typing = (e: Event) => { const tag = (e.target as HTMLElement | null)?.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'; };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) api.current.click(); }
      else if (k === ' ') {
        // a tap counts, a held key does not (the spam is the point)
        e.preventDefault(); e.stopImmediatePropagation();
        const m = meter.current; if (!e.repeat && m && (m.phase === 'up' || m.phase === 'back')) m.press(performance.now() / 1000);
      } else if (/^[qQeE]$/.test(k)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) api.current.cycle(k === 'q' || k === 'Q' ? -1 : 1); }
    };
    const up = (e: KeyboardEvent) => { if (!typing(e) && (e.key === 'Enter' || e.key === ' ' || /^[qQeE]$/.test(e.key))) { e.preventDefault(); e.stopImmediatePropagation(); } };
    // during the swing any left click is the swing button (it never aims mid-swing)
    const ptr = (e: PointerEvent) => {
      const m = meter.current; if (e.button !== 0 || !m || (m.phase !== 'up' && m.phase !== 'back')) return;
      e.preventDefault(); e.stopImmediatePropagation(); api.current.click();
    };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('pointerdown', ptr, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('pointerdown', ptr, true); };
  }, []);

  // the meter: drawn each frame while swinging (the swing ends by itself past the arc's end), once otherwise
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const c = canvas.current, m = meter.current, now = performance.now() / 1000;
      if (m && (m.phase === 'up' || m.phase === 'back')) { m.tick(now); if ((m.phase as SwingPhase) === 'done') { setPhase('done'); api.current.finish(m); } }
      if (c) drawMeter(c, m, now, { ...lookRef.current, sweet: sweetSpot(game.shotSkill(), m?.boost() ?? 0, game.shotKit()?.sweet ?? 1) }, resultRef.current);
      if (m && (m.phase === 'up' || m.phase === 'back')) raf = requestAnimationFrame(frame);
    };
    frame();
    return () => cancelAnimationFrame(raf);
  }, [phase, result, i.club, i.aim.x, i.aim.y, game]);

  return (
    <div className="pointer-events-auto absolute bottom-[calc(var(--foot-stack,0px)+0.75rem)] left-1/2 z-20 w-[42rem] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 glass p-3 text-slate-200" data-testid="shot-panel">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[15rem] flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-display text-sm font-bold tracking-wide text-[var(--gold-hi)] uppercase">Your shot</span>
            <span className="text-xs tabular-nums text-slate-300">Hole {t.hole} · Par {t.par} · Stroke {t.stroke}</span>
          </div>
          <p className="mt-1 text-xs tabular-nums text-slate-300">
            To the pin {putting ? t.distM.toFixed(1) : Math.round(t.distM)} m ({Math.round(t.distM * YARDS)} yd) · to the aim {putting ? aimM.toFixed(1) : Math.round(aimM)} m · {LIE_NAME[t.lie]}
          </p>
          <div className="mt-2 flex flex-wrap gap-1" onWheel={e => { if (e.deltaY) cycle(e.deltaY > 0 ? 1 : -1); }} title="Q / E or the mouse wheel change the club">
            {clubs.map(c => (
              <button key={c} disabled={busy} className={`chip ${c === i.club ? 'chip-on' : ''} ${c === suggested ? 'ring-1 ring-amber-300/70' : ''}`}
                title={c === suggested ? 'The suggested club' : undefined} onClick={() => game.setShotClub(c)}>{CLUB_NAME[c]}</button>
            ))}
          </div>
          {!putting && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="shot-shape" title="Shape the shot before the swing: a draw curves left, a fade right; a high flight lands soft and catches more wind, a low one runs on and shrugs it. It is harder to pull off (a bigger miss on a bad accuracy click) the less skilled you are">
              <span className="flex items-center gap-1"><span className="text-[11px] uppercase text-slate-400">Curve</span>
                {([['Draw', -1], ['Straight', 0], ['Fade', 1]] as const).map(([n, v]) => <button key={n} disabled={busy} className={`chip ${(s.shape?.curve ?? 0) === v ? 'chip-on' : ''}`} onClick={() => game.setShotShape(v, undefined)}>{n}</button>)}
              </span>
              <span className="flex items-center gap-1"><span className="text-[11px] uppercase text-slate-400">Flight</span>
                {([['Low', -1], ['Normal', 0], ['High', 1]] as const).map(([n, v]) => <button key={n} disabled={busy} className={`chip ${(s.shape?.flight ?? 0) === v ? 'chip-on' : ''}`} onClick={() => game.setShotShape(undefined, v)}>{n}</button>)}
              </span>
            </div>
          )}
          {!putting && cond && cond.shape.lines.length > 0 && <p className="mt-1 text-[11px] text-amber-200" data-testid="shape-lines">{pickText(cond.shape.pick)}:{cond.shape.lines.join(' · ')}</p>}
          <p className="mt-1 text-xs tabular-nums text-slate-300">
            {CLUB_NAME[i.club]}{i.club === suggested ? ' (suggested)' : ''}: {putting ? `putting scale, 100% is the hole (${t.distM.toFixed(1)} m)` : `full carry ${Math.round(fullM)} m (${Math.round(fullM * YARDS)} yd)`}
            {!putting && Math.abs(playsM - aimM) >= 3 ? <span className="text-cyan-200"> · the aim plays like {Math.round(playsM)} m</span> : null}
          </p>
          <p className="mt-1 min-h-[4.5em] text-[12px] text-slate-400">
            {phase === 'ready' ? 'Enter or click the meter to swing: again for the power, once more at the snap line. Space during the swing: more power, riskier. Q / E or the wheel: club. Click the course to aim.'
              : phase === 'up' ? 'Click (or Enter) to set the power…' : phase === 'back' ? 'Click (or Enter) at the snap line…' : ''}
          </p>
          {last && <p className="mt-1 text-[12px] tabular-nums text-slate-300">Last shot: {last.text}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button className="btn" disabled={swinging || phase === 'done'} onClick={() => game.ownerCaddie()}>{s.mine ? 'Let the caddie finish the hole' : 'Let the caddie finish'}</button>
          </div>
        </div>
        <div className="mx-auto shrink-0" style={{ width: CW }}>
          <canvas ref={canvas} width={CW} height={CH} className="cursor-pointer select-none" style={{ width: CW, height: CH }} aria-label="Swing meter"
            onPointerDown={e => { if (e.button === 0 && !meter.current) { e.preventDefault(); click(); } }} />
          <ConditionsBox game={game} />
        </div>
      </div>
    </div>
  );
}
