import { useEffect, useReducer, useRef, useState } from 'react';
import { FLOW_COLS, Game, LOS_COL, SPEEDS } from './game/engine';
import { ATLAS_PAGES, ATLAS_SIZE, LIBRARY } from './game/library';
import { type LibItem, type Tool } from './game/types';
import { CLASSES, JUNCTIONS } from './game/network';
import { PLANNER_Z, ZOOM_MAX, ZOOM_MIN } from './game/iso';
import { GROWTH_OPTIONS } from './game/lots/town';
import { Budget, DEBT_DAYS, GAME_DAY, LOAN, LOAN_RATE } from './game/budget';
import { compare, type Delta, type Window } from './game/beforeafter';
import { MILESTONES, WIN_POP, classUnlocked, junctionUnlocked, unlockOf } from './game/career';
import { LOT_TILE_COST } from './game/event/config';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select / Pan', key: 'V', icon: '🖱️' },
  { id: 'road', label: 'Roads', key: 'R', icon: '🛣️' },
  { id: 'junction', label: 'Junctions', key: 'J', icon: '🚦' },
  { id: 'bulldoze', label: 'Bulldoze', key: 'X', icon: '🚜' },
  { id: 'park', label: 'Car park', key: 'P', icon: '🅿️' },
];
const money = (n: number) => '$' + Math.round(n).toLocaleString();
/** the price line of a locked road class or junction type: the residents it unlocks at */
const lockText = (pop: number) => `🔒 ${pop.toLocaleString()} residents`;
/** the game clock as HH:MM */
const hhmm = (c: { hour: number; minute: number }) => `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
/** a game hour of the day as HH:00 */
const hod = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [fatal, setFatal] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [help, setHelp] = useState(false);
  /** the bankrupt overlay's 'Keep watching' (cleared once the city is no longer bankrupt) */
  const [watch, setWatch] = useState(false);

  useEffect(() => { if (game && !game.bankrupt) setWatch(false); });
  // the round's clocks (the build, the surge) show mm:ss: re-render 4 times a second while one runs
  const roundLive = !!game && (game.traffic.round.stage === 'build' || game.traffic.round.stage === 'surge');
  useEffect(() => { if (!roundLive) return; const iv = window.setInterval(bump, 250); return () => clearInterval(iv); }, [roundLive]);

  useEffect(() => {
    const canvas = overlayRef.current!;
    let g: Game;
    try { g = new Game(canvasRef.current!, canvas); } catch (e) { setFatal((e as Error).message); return; }
    // debug and headless-screenshot hooks
    Object.assign(window as unknown as Record<string, unknown>, { __game: g, __CLASSES: CLASSES });
    setGame(g);
    const unsub = g.subscribe(bump);
    g.init({ bench: new URLSearchParams(location.search).has('bench') ? +(new URLSearchParams(location.search).get('bench') || 1) || 1 : 0 }).catch(e => setFatal(String(e)));
    const wheel = (e: WheelEvent) => g.wheel(e);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const kd = (e: KeyboardEvent) => g.keyDown(e), ku = (e: KeyboardEvent) => g.keyUp(e);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const iv = window.setInterval(bump, 500);
    return () => { unsub(); g.destroy(); canvas.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  const toasts = game ? game.toasts.filter(t => performance.now() - t.t < 4000) : [];
  const net = game?.ledger?.net ?? 0, debtDays = game?.traffic.budget.debtDays ?? 0;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1b2816] text-slate-100 select-none" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: game?.tool === 'select' ? (game.hoverProp ? 'pointer' : 'grab') : 'crosshair' }}
        onPointerDown={e => game?.pointerDown(e.nativeEvent)}
        onPointerMove={e => game?.pointerMove(e.nativeEvent)}
        onPointerUp={() => game?.pointerUp()}
        onPointerLeave={() => game?.pointerLeave()}
        onDoubleClick={() => game?.doubleClick()}
        onContextMenu={e => e.preventDefault()}
      />

      {fatal && <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#15200f] p-8 text-center text-red-200">This game needs WebGL2 and OffscreenCanvas. {fatal}</div>}
      {game && !game.ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#15200f]">
          <div className="text-3xl font-bold tracking-tight text-amber-200">Maple Falls</div>
          <div className="mt-1 text-sm uppercase tracking-[0.3em] text-amber-400/80">Town Builder</div>
          <div className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round(game.loadProgress * 100)}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-400">Painting ground textures and unpacking sprites…</div>
        </div>
      )}

      {game && game.ready && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-3">
            <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/75 px-4 py-2 shadow-lg backdrop-blur">
              <div>
                <div className="text-base font-bold leading-tight text-amber-200">Maple Falls</div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/70">Town Builder</div>
              </div>
              <div className="mx-1 h-8 w-px bg-white/10" />
              <Stat label="Career" {...careerStat(game)} tone="text-amber-200" />
              <Stat label="Treasury" value={game.unlimited ? '∞' : money(game.money)}tone={game.money < 0 ? 'text-red-300' : 'text-emerald-300'} sub={debtDays ? `bankrupt in ${DEBT_DAYS - debtDays} days` : undefined} subTone="text-red-300" onClick={() => { game.panel = game.panel === 'budget' ? null : 'budget'; game.emit(); }} />
              <Stat label="Population" value={game.traffic.pop.toLocaleString()} />
              <Stat label="Jobs" value={game.traffic.jobs.toLocaleString()} />
              <Stat label="Day" value={String(game.day)} sub={hhmm(game.clock())} />
              <Stat label="Daily income" value={(net >= 0 ? '+' : '') + money(net)} tone={net >= 0 ? 'text-emerald-300' : 'text-red-300'} />
              {(game.growth !== 1 || game.unlimited || !game.stamped) && (
                <div className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-200" title="Dev sandbox options (URL: ?grow=N, ?money=0|1, ?stamp=0|1)">
                  dev: {[game.growth !== 1 && `grow ${game.growth}×`, game.unlimited && '∞ $', !game.stamped && 'no stamp'].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 shadow-lg backdrop-blur">
                <button className="btn" onClick={() => game.togglePause()} title="Pause (Space)">{game.speed ? '⏸' : '▶'}</button>
                {SPEEDS.map(k => <button key={k} className={`chip ${game.speed === k ? 'chip-on' : ''}`} onClick={() => game.setSpeed(k)} title="Speed (, and .)">{k}×</button>)}
                <button className="chip disabled:opacity-40" disabled={game.traffic.skipping} onClick={() => game.skipToRush()} title="Skip to the next rush hour (H)">{game.traffic.skipping ? 'Skipping…' : '⏭ Rush'}</button>
              </div>
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 shadow-lg backdrop-blur">
                <button className="btn" onClick={() => game.zoomAt(Math.max(ZOOM_MIN, game.cam.z / 1.25))} title="Zoom out (-)">−</button>
                <input type="range" min={Math.log(ZOOM_MIN)} max={Math.log(ZOOM_MAX)} step={0.01} value={Math.log(game.cam.z)} onChange={e => game.zoomAt(Math.exp(+e.target.value))} className="w-28 accent-amber-400" />
                <button className="btn" onClick={() => game.zoomAt(Math.min(ZOOM_MAX, game.cam.z * 1.25))} title="Zoom in (+)">+</button>
                <span className="ml-1 w-14 text-right text-xs tabular-nums text-slate-300" title="Zoom relative to the town builder's 100%">{Math.round(game.cam.z * 100)}%</span>
              </div>
              <button className={`btn ${game.showFlow ? 'bg-amber-400/20 text-amber-200' : ''}`} onClick={() => { game.showFlow = !game.showFlow; if (game.showFlow) game.traffic.requestReport(); bump(); }} title="Traffic flow: volume / capacity and junction LOS (F)">Flow</button>
              <button className={`btn ${game.panel === 'bottlenecks' ? 'bg-amber-400/20 text-amber-200' : ''}`} onClick={() => { game.panel = game.panel === 'bottlenecks' ? null : 'bottlenecks'; if (game.panel) game.traffic.requestReport(); bump(); }} title="The worst bottlenecks (B)">Bottlenecks</button>
              <button className={`btn ${game.showGrid ? 'bg-amber-400/20 text-amber-200' : ''}`} onClick={() => { game.showGrid = !game.showGrid; bump(); }} title="Toggle tile grid (G)">Grid</button>
              <button className="btn" onClick={() => game.save()} title="Saved automatically; force a save now">Save</button>
              <button className="btn" onClick={() => { if (confirm('Start a new valley with three towns? Your current game will be replaced.')) game.newTown(); }}>New town</button>
              <button className="btn" onClick={() => { if (confirm('Clear everything and start from an empty field?')) game.clearTown(); }}>Empty map</button>
              <button className="btn" onClick={() => setHelp(true)}>?</button>
            </div>
          </div>

          <div className="absolute left-3 top-24 z-20 flex items-start gap-2">
            <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1.5 shadow-lg backdrop-blur">
              {TOOLS.map(t => (
                <button key={t.id} onClick={() => game.setTool(t.id)} title={`${t.label} (${t.key})`}
                  className={`flex h-12 w-14 flex-col items-center justify-center rounded-lg text-[10px] leading-tight transition ${game.tool === t.id ? 'bg-amber-400 text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10'}`}>
                  <span className="text-lg leading-none">{t.icon}</span>
                  <span className="mt-0.5">{t.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            <div className="w-[310px] rounded-xl border border-white/10 bg-slate-950/80 p-3 shadow-lg backdrop-blur">
              {game.tool === 'road' && <RoadPanel game={game} />}
              {game.tool === 'junction' && <JunctionPanel game={game} />}
              {game.tool === 'bulldoze' && (
                <Panel title="Bulldoze">
                  <p className="text-xs text-slate-300">Click an object to remove it (half its price is refunded). Click or drag along a road to tear it up piece by piece — the ends become cul-de-sacs and curbs, corners, crossings and markings redraw themselves instantly.</p>
                </Panel>
              )}
              {game.tool === 'park' && <ParkPanel game={game} />}
              {game.tool === 'select' && <SelectPanel game={game} />}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/75 px-4 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
            {hintFor(game)}
          </div>
          {(game.showAccess || game.cam.z < PLANNER_Z) && <AccessLegend game={game} />}

          <div className="pointer-events-none absolute left-1/2 top-20 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            {toasts.map(t => (
              <div key={t.id} className={`rounded-lg px-3 py-1.5 text-sm shadow-lg ${t.kind === 'warn' ? 'bg-red-500/90 text-white' : t.kind === 'good' ? 'bg-emerald-500/90 text-white' : 'bg-slate-800/90 text-slate-100'}`}>{t.text}</div>
            ))}
          </div>

          {(game.traffic.car || game.traffic.watch?.node) && (
            <div className="absolute left-[390px] top-24 z-20 flex w-64 flex-col gap-2">
              {game.traffic.car && <CarPanel game={game} />}
              {game.traffic.watch?.node && <RoutesPanel game={game} />}
            </div>
          )}
          {game.panel === 'budget' && <BudgetPanel game={game} />}
          {game.site && <RoundPanel game={game} />}
          {game.panel === 'bottlenecks' && <BottleneckPanel game={game} />}
          {game.showWin && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
              <div className="w-96 rounded-2xl border border-emerald-500/40 bg-slate-950 p-6 text-center text-slate-200 shadow-2xl">
                <div className="text-2xl font-bold text-amber-200">City!</div>
                <p className="mt-3 text-sm text-slate-300">{WIN_POP.toLocaleString()} residents: you have won the Career. The town keeps growing if you keep building.</p>
                <div className="mt-5 flex justify-center">
                  <button className="chip chip-on" onClick={() => { game.showWin = false; game.emit(); }}>Keep building</button>
                </div>
              </div>
            </div>
          )}
          {game.bankrupt && !watch && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
              <div className="w-96 rounded-2xl border border-red-500/40 bg-slate-950 p-6 text-center text-slate-200 shadow-2xl">
                <div className="text-2xl font-bold text-red-300">Bankrupt</div>
                <p className="mt-3 text-sm text-slate-300">The books stayed in the red for {DEBT_DAYS} days in a row.</p>
                <div className="mt-5 flex justify-center gap-2">
                  <button className="chip chip-on" onClick={() => game.newTown()}>New valley</button>
                  <button className="chip" onClick={() => setWatch(true)}>Keep watching</button>
                </div>
              </div>
            </div>
          )}

          <PerfPanel game={game} />
          {help && <Help onClose={() => setHelp(false)} />}
        </>
      )}
      <style>{`.btn{border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(2,6,23,.75);padding:.35rem .7rem;font-size:.75rem;color:#e2e8f0;backdrop-filter:blur(6px)}.btn:hover{background:rgba(255,255,255,.12)}.chip{border-radius:.5rem;border:1px solid rgba(255,255,255,.1);padding:.3rem .55rem;font-size:.7rem;color:#cbd5e1}.chip:hover{background:rgba(255,255,255,.1)}.chip-on{background:rgba(251,191,36,.9);color:#0f172a;border-color:transparent}.card{display:flex;flex-direction:column;align-items:flex-start;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);padding:.4rem .55rem;text-align:left}.card:hover{background:rgba(255,255,255,.08)}.card-on{border-color:#fbbf24;background:rgba(251,191,36,.18)}`}</style>
    </div>
  );
}

/** a library sprite cut out of its atlas page (mip 1) with CSS */
function Thumb({ it, size }: { it: LibItem; size: number }) {
  const [page, u0, v0, u1, v1] = it.tex, P = ATLAS_SIZE / 2, w = (u1 - u0) * P, h = (v1 - v0) * P, k = Math.min(size / w, size / h);
  return <div style={{ width: w * k, height: h * k, backgroundImage: `url(${ATLAS_PAGES[page][1]})`, backgroundSize: `${P * k}px ${P * k}px`, backgroundPosition: `${-u0 * P * k}px ${-v0 * P * k}px` }} />;
}

/** frame time, what was drawn, and the traffic */
function PerfPanel({ game }: { game: Game }) {
  const p = game.perf;
  return (
    <div className="absolute bottom-3 right-3 z-20 w-56 rounded-xl border border-white/10 bg-slate-950/80 p-2 text-[11px] tabular-nums text-slate-300 shadow-lg backdrop-blur">
      <div className="flex justify-between"><span>{p.fps.toFixed(0)} fps · {p.tier}</span><span>cpu {p.cpuMs.toFixed(1)} ms</span></div>
      <div className="flex justify-between text-slate-400"><span>{p.instances.toLocaleString()} sprites · {p.draws} draws</span><span>{p.uploadKB.toFixed(0)} KB</span></div>
      <div className="flex justify-between text-slate-400"><span>{game.props.size.toLocaleString()} props · {game.net.segs.size.toLocaleString()} segs</span><span>bake {p.chunksPending}</span></div>
      <div className="mt-1 flex items-center gap-1"><span className="mr-auto text-slate-400">Cars</span>
        {[0, 1000, 5000, 10000].map(n => <button key={n} className={`chip ${(game.traffic?.target ?? 0) === n ? 'chip-on' : ''}`} onClick={() => game.setTraffic(n)}>{n ? n / 1000 + 'k' : 'off'}</button>)}
      </div>
      {game.traffic && <div className="flex justify-between text-slate-400"><span>sim {p.simActive} cars</span><span>tick {p.simTickMs.toFixed(1)} ms (max {p.simMaxTickMs.toFixed(1)})</span></div>}
      <div className="mt-1 flex items-center gap-1"><span className="mr-auto text-slate-400">Growth</span>
        <select className="rounded bg-slate-800 px-1 text-slate-200" value={game.traffic.option} onChange={e => game.setGrowth(e.target.value)}>
          {GROWTH_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      <div className="flex justify-between text-slate-400"><span>{p.pop.toLocaleString()} pop · {p.jobs.toLocaleString()} jobs</span><span>{p.built.toLocaleString()} built lots · {p.lotProps.toLocaleString()} lot props</span></div>
    </div>
  );
}

/** a top-bar figure: its label, value and a line under it; bar (0 to 1) draws a thin progress bar under that */
function Stat({ label, value, sub, tone, subTone, bar, onClick }: { label: string; value: string; sub?: string; tone?: string; subTone?: string; bar?: number; onClick?: () => void }) {
  return (
    <div className={`px-1 ${onClick ? 'cursor-pointer rounded-lg hover:bg-white/5' : ''}`} onClick={onClick}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums leading-tight ${tone ?? ''}`}>{value}</div>
      {sub && <div className={`text-[10px] ${subTone ?? 'text-slate-500'}`}>{sub}</div>}
      {bar !== undefined && <div className="mt-0.5 h-1 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round(bar * 100)}%` }} /></div>}
    </div>
  );
}

/** the Career figure: the milestone reached, the next one and how far the population is from it (from the last milestone's residents to the next one's); Career won at the last */
function careerStat(game: Game): { value: string; sub: string; bar?: number } {
  const cur = MILESTONES[game.reached]!, nxt = MILESTONES[game.reached + 1];
  if (!nxt) return { value: cur.name, sub: 'Career won' };
  return { value: cur.name, sub: `next: ${nxt.name} at ${nxt.pop.toLocaleString()}`, bar: Math.min(1, Math.max(0, (game.traffic.pop - cur.pop) / (nxt.pop - cur.pop))) };
}

/** the city's books: the last closed day's ledger, the net of the last 14 days as bars, the loans and the debt */
function BudgetPanel({ game }: { game: Game }) {
  const b = game.traffic.budget, l = game.ledger, H = b.history.slice(-14), mx = Math.max(1, ...H.map(v => Math.abs(v.net)));
  const rows: [string, number, boolean][] = l ? [['Property tax', l.property, true], ['Business', l.business, true], ['Grants', l.grants ?? 0, true], ['Road upkeep', l.upkeep, false], ['Signal upkeep', l.signals, false], ['Loan interest', l.interest, false], ['Construction', l.construction, false], ['Compensation', l.compensation, false]] : [];
  const maxLoans = Budget.from(b).maxLoans(game.traffic.pop);
  return (
    <div className="absolute right-3 top-24 z-20 w-72 rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title={`Budget — day ${game.day}`}>
        {l ? (
          <div className="space-y-0.5 text-xs">
            {rows.map(([name, v, income]) => (
              <div key={name} className={`flex justify-between ${!v ? 'text-slate-500' : income ? 'text-emerald-300' : 'text-red-300'}`}><span>{name}</span><span className="tabular-nums">{v && !income ? '−' : v ? '+' : ''}{money(v)}</span></div>
            ))}
            <div className={`mt-1 flex justify-between border-t border-white/10 pt-1 font-semibold ${l.net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}><span>Net</span><span className="tabular-nums">{l.net >= 0 ? '+' : '−'}{money(Math.abs(l.net))}</span></div>
          </div>
        ) : <p className="text-xs text-slate-400">The first day's books close at midnight.</p>}
        <div className="relative mt-3 flex h-16 gap-0.5">
          <div className="absolute inset-x-0 top-1/2 border-t border-white/20" />
          {H.map(v => (
            <div key={v.day} className="relative flex-1" title={`Day ${v.day}: ${v.net >= 0 ? '+' : '−'}${money(Math.abs(v.net))}`}>
              <div className={`absolute inset-x-0 ${v.net >= 0 ? 'rounded-t bg-emerald-400/80' : 'rounded-b bg-red-400/80'}`} style={{ height: `${Math.max(2, Math.abs(v.net) / mx * 50)}%`, ...(v.net >= 0 ? { bottom: '50%' } : { top: '50%' }) }} />
            </div>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-slate-500">{H.length ? `Net per day, last ${H.length} day${H.length === 1 ? '' : 's'}` : 'No day has closed yet'}</div>
        <div className="mt-3 text-xs text-slate-300">Loans: {b.loans} of {maxLoans} × {money(LOAN)} at {Math.round(LOAN_RATE * 100)}%/day</div>
        <div className="mt-1 flex gap-1">
          <button className="chip flex-1" onClick={() => game.borrow()}>Borrow</button>
          <button className="chip flex-1" onClick={() => game.repay()}>Repay</button>
        </div>
        {debtDaysLine(b.debtDays)}
      </Panel>
    </div>
  );
}
/** the event round (Phase 5 step 2c): the stadium's round by stage (free: start it; build: the clock, the crowd and the upkeep; surge: kick-off's clock;
 *  eval: the result, to close). Docked under the top bar; the eval screen replaces it in step 7 */
function RoundPanel({ game }: { game: Game }) {
  const r = game.traffic.round, last = r.last, goBtn = <button className="chip" onClick={() => game.goToSite()}>Go to stadium</button>;
  const crowd = r.crowd.map((c, i) => `Town ${String.fromCharCode(65 + i)} ${c}`).join(' · ') + (r.crowd.length ? ' cars' : '');
  return (
    <div className="pointer-events-auto absolute left-1/2 top-24 z-20 w-[440px] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title={`Event: Stadium · Level ${r.level}`}>
        {r.stage === 'free' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">Run {r.runs + 1}</span>
              <div className="flex gap-1">{goBtn}<button className="chip chip-on" onClick={() => game.startRound()}>Start the event</button></div>
            </div>
            {last && <p className="text-xs text-slate-300">Last run: {last.arrived}/{last.sent} arrived ({Math.round(last.rate * 100)}%)</p>}
          </div>
        )}
        {r.stage === 'build' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-200">Build · {mmss(Math.ceil(r.buildLeft))}</span>
              <div className="flex gap-1">{goBtn}<button className="chip chip-on" onClick={() => game.startNow()}>Start now</button></div>
            </div>
            <p className="text-xs text-slate-300">{crowd}</p>
            <p className="text-xs text-slate-400">upkeep {money(r.upkeep)}</p>
          </div>
        )}
        {r.stage === 'surge' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl font-bold tabular-nums text-amber-200">Kick-off in {mmss(Math.ceil(r.surgeLeft))}</span>
              {goBtn}
            </div>
            <p className="text-xs text-slate-300">{crowd}</p>
            <p className="text-xs text-slate-400">upkeep {money(r.upkeep)}</p>
          </div>
        )}
        {r.stage === 'eval' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-100">Event over{last ? ` · ${last.arrived}/${last.sent} arrived (${Math.round(last.rate * 100)}%)` : ''}</span>
              <button className="chip chip-on" onClick={() => game.closeRound()}>Back to the valley</button>
            </div>
            <p className="text-xs text-slate-400">upkeep paid {money(r.upkeep)}</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** the legend of the flow colours: the v/c bands, in FLOW_COLS order */
const FLOW_LEGEND: [string, string][] = [['< 0.5', FLOW_COLS[0]!], ['< 0.8', FLOW_COLS[1]!], ['< 1', FLOW_COLS[2]!], ['≥ 1 v/c', FLOW_COLS[3]!]];
/** the worst bottlenecks of the city's last report, worst first: a row per item (click to jump there), the time lost per game hour, and the flow legend */
function BottleneckPanel({ game }: { game: Game }) {
  // items under 0.1 veh-min an hour are noise (a car slowing for a turn), not bottlenecks
  const top = (game.traffic.report?.top ?? []).filter(it => it.loss >= 6);
  return (
    <div className="absolute right-3 top-24 z-20 max-h-[calc(100vh-18rem)] w-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title="Bottlenecks">
        <p className="mb-2 text-xs text-slate-400">Time lost in the last game hour or so, worst first</p>
        {top.length ? (
          <div className="space-y-0.5">
            {top.map((it, i) => (
              <button key={it.kind + it.key} className="block w-full rounded-lg px-1.5 py-1 text-left hover:bg-white/10" onClick={() => game.jumpTo(it.x, it.y)} title="Jump there">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right tabular-nums text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-100">{it.label}</span>
                  {it.kind === 'junction'
                    ? <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-slate-900" style={{ background: LOS_COL[it.los] }}>{it.los}</span>
                    : <span className="shrink-0 text-[10px] tabular-nums text-slate-300">v/c {it.vc.toFixed(2)}</span>}
                </div>
                <div className="pl-6 text-[10px] text-slate-400">{(it.loss / 60).toFixed(1)} veh-min lost per hour{it.vc < 0.3 && (it.los === 'E' || it.los === 'F') ? <span className="text-amber-300"> · queued back from downstream</span> : it.vc >= 0.8 ? <span className="text-red-300"> · at capacity</span> : null}</div>
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-slate-400">{game.traffic.report ? 'No bottlenecks: the traffic flows freely' : 'No traffic yet'}</p>}
        <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-400">
          {FLOW_LEGEND.map(([t, c]) => (
            <span key={t} className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: c }} />{t}</span>
          ))}
        </div>
        <BeforeAfter game={game} />
      </Panel>
    </div>
  );
}
/** the day and the hours of a window as the panel names it, e.g. day 3, 07:00–09:00 (the books' day 1 is the first day) */
function winLabel(game: Game, w: Window) { return `day ${Math.floor(w.h0 / 24) - Math.floor(game.traffic.budget.base / GAME_DAY) + 1}, ${hod(w.h0)}–${hod(w.h1)}`; }
/** a compared value as the table shows it: seconds to one decimal, the ratio to two, counts whole */
const fmtVal = (name: string, v: number) => name === 'Time lost per trip' ? `${v.toFixed(1)} s` : name === 'Trip time vs free flow' ? v.toFixed(2) : Math.round(v).toLocaleString();
/** the change of a compared value: an arrow and the per cent, green when better and red when worse; a dash when it did not move */
function Change({ d }: { d: Delta }) {
  if (Math.abs(d.pct) < 0.5) return <span className="text-slate-500">–</span>;
  return <span className={d.better ? 'text-emerald-300' : 'text-red-300'}>{d.pct > 0 ? '▲' : '▼'} {Math.min(999, Math.abs(d.pct)).toFixed(0)}%</span>;
}
/** the before / after section of the bottlenecks panel: a snapshot now, then the first rush after the change against the last rush before it (see Game.takeSnapshot) */
function BeforeAfter({ game }: { game: Game }) {
  const snap = game.snapshot, after = game.snapshotAfter, waiting = !!snap && !after;
  // while the after rush is out, the report is asked for every 10 s, so its hours come in fresh
  useEffect(() => { if (!waiting) return; const iv = setInterval(() => game.traffic.requestReport(), 10000); return () => clearInterval(iv); }, [game, waiting]);
  if (!snap) return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="mb-1 text-xs font-bold text-slate-200">Before / after</div>
      <button className="chip" onClick={() => game.takeSnapshot()}>Take snapshot</button>
      <p className="mt-1 text-[11px] text-slate-400">Snapshot, change the roads, then wait for (or skip to) the next rush hour.</p>
    </div>
  );
  const rows = after ? compare(snap.before ?? after, after) : [];
  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <div className="mb-1 flex items-center gap-2 text-xs font-bold text-slate-200">Before / after<span className="flex-1" /><button className="chip" onClick={() => game.clearSnapshot()}>Clear</button></div>
      <div className="space-y-1 text-[11px] text-slate-300">
        {snap.before
          ? <p>Before: {winLabel(game, snap.before)}{snap.before.rush ? '' : ' (no rush yet: the last 2 hours)'}</p>
          : <p className="text-amber-200">No traffic on record before the snapshot yet</p>}
        {after ? (
          <>
            <p>After: {winLabel(game, after)}</p>
            <table className="w-full tabular-nums">
              <thead><tr className="text-[10px] text-slate-500"><th className="text-left font-normal">Measure</th><th className="text-right font-normal">Before</th><th className="text-right font-normal">After</th><th className="text-right font-normal">Change</th></tr></thead>
              <tbody>
                {rows.map(d => (
                  <tr key={d.name} className="border-t border-white/5">
                    <td className="py-0.5 pr-1 text-slate-300">{d.name}</td>
                    <td className="px-1 text-right text-slate-400">{snap.before ? fmtVal(d.name, d.before) : '–'}</td>
                    <td className="px-1 text-right text-slate-100">{fmtVal(d.name, d.after)}</td>
                    <td className="pl-1 text-right">{snap.before && <Change d={d} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span>After: waiting for {hod(snap.after[0])}–{hod(snap.after[1])}</span>
            <button className="chip disabled:opacity-40" disabled={game.traffic.skipping} onClick={() => game.skipToRush()}>Skip to rush</button>
          </div>
        )}
      </div>
    </div>
  );
}
/** the access overlay's bands and the growth counts, bottom-left above the hint bar (see Game.growthNow) */
const ACCESS_LEGEND: [string, string][] = [['full growth (< 1.3)', '#3ddc84'], ['slowed (1.3–1.8)', '#ffb020'], ['stopped (> 1.8)', '#ff3b3b']];
function AccessLegend({ game }: { game: Game }) {
  return (
    <div className="pointer-events-none absolute bottom-14 left-3 z-20 w-56 rounded-xl border border-white/10 bg-slate-950/80 p-2 text-[11px] text-slate-300 shadow-lg backdrop-blur">
      {ACCESS_LEGEND.map(([t, c]) => (
        <div key={t} className="flex items-center gap-2"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: c }} />{t}</div>
      ))}
      <div className="mt-1 border-t border-white/10 pt-1 tabular-nums">+{game.growTot} lots started today, −{game.declTot} declining</div>
    </div>
  );
}
/** the red line of the budget panel: the days in the red and the days left before bankruptcy (nothing when the books are fine) */
function debtDaysLine(d: number) {
  return d > 0 ? <p className="mt-2 text-xs text-red-300">In the red for {d} day{d === 1 ? '' : 's'}: bankrupt in {DEBT_DAYS - d} unless the books recover.</p> : null;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{title}</div>{children}</div>);
}

function RoadPanel({ game }: { game: Game }) {
  const legs = game.previewLegs();
  const len = game.net.legsLength(legs);
  const cost = game.routeCost(), comp = game.routeCompensation();
  const cls = game.cls;
  return (
    <Panel title="Building new roads">
      <p className="text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">Draw a connected route.</b> Click to start, click again for each bend or stop. Routes snap to the grid; crossings become junctions with rounded corners and crossings automatically.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {CLASSES.map((c, i) => {
          const lk = classUnlocked(c.id, game.reached) ? null : unlockOf('class', c.id)!;
          return (
            <button key={c.id} className={`card ${game.roadClass === c.id ? 'card-on' : ''} ${lk ? 'opacity-50' : ''}`} onClick={() => { game.roadClass = c.id; game.emit(); }} title={`Key ${i + 1}`}>
              <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">{c.name}</span><span className="text-amber-300">{lk ? lockText(lk.pop) : `${money(c.cost)} / 2 m`}</span></div>
              <div className="text-[10px] text-slate-400">{c.desc}</div>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Bends</span>
        {([90, 45] as const).map(b => <button key={b} className={`chip ${game.bendMode === b ? 'chip-on' : ''}`} onClick={() => { game.bendMode = b; game.emit(); }} title="Q toggles">{b}°</button>)}
        <span className="ml-auto text-[10px] text-slate-500">Shift: straight line</span>
      </div>
      {cls.centre === 'style' && (
        <div className="mt-2 flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Centre line</span>
          {([['Dashed', 0], ['Double', 1], ['None', 2]] as const).map(([n, v]) => (
            <button key={v} className={`chip ${game.lineStyle === v ? 'chip-on' : ''}`} onClick={() => { game.lineStyle = v; game.emit(); }}>{n}</button>
          ))}
        </div>
      )}
      <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">Route</span><span>{game.route.length} point{game.route.length === 1 ? '' : 's'} · {Math.round(len * 2)} m</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Cost</span><span className={cost + comp.comp > game.money ? 'text-red-300' : 'text-emerald-300'}>{money(cost)}</span></div>
        {comp.n > 0 && <div className="flex justify-between"><span className="text-slate-400">Compensation</span><span className="text-red-300">{money(comp.comp)} <span className="text-slate-500">({comp.n} building{comp.n === 1 ? '' : 's'})</span></span></div>}
      </div>
      <div className="mt-2 flex gap-1">
        <button className="chip chip-on flex-1 disabled:opacity-40" disabled={game.route.length < 2} onClick={() => game.finishRoute()}>Build route ⏎</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.undoRoutePoint()} title="Backspace">Undo</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.cancelRoute()} title="Esc">Cancel</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Double-click the last point or press Enter to build. Drawing over an existing road upgrades it. Trees and small items in the way are cleared; buildings block the route.</p>
    </Panel>
  );
}

/** the car park tool: how to place one, its cost per tile, and the list of car parks (Go; a dev-only test of 50 cars) */
function ParkPanel({ game }: { game: Game }) {
  const views = game.traffic.parks;
  return (
    <Panel title="Car park">
      <p className="text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">Drag a rectangle beside a road.</b> The road along one of its sides is the frontage: the entrances go on it and the bays fill the rows along it. Cars park at the bays nearest an entrance first; when it is full, the rest are turned away. Roads cannot cross a car park, and bulldozing one refunds nothing.
      </p>
      <div className="mt-2 text-xs text-amber-300">{money(LOT_TILE_COST)} per tile</div>
      <div className="mt-2 max-h-64 overflow-y-auto">
        {game.parkDefs.length === 0 && <p className="text-xs text-slate-400">No car parks yet.</p>}
        {game.parkDefs.map(d => {
          const v = views.find(q => q.id === d.id);
          return (
            <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-xs">
              <span className="tabular-nums text-slate-200">#{d.id} · {v ? `${v.bays} bays · ${v.parked}/${v.turned}` : 'no road along it'}</span>
              <span className="flex gap-1">
                <button className="btn" onClick={() => game.goToPark(d.id)}>Go</button>
                {import.meta.env.DEV && <button className="btn" onClick={() => game.parkTest(d.id, 50)}>Test 50 cars</button>}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function JunctionPanel({ game }: { game: Game }) {
  const n = game.hoverNode;
  return (
    <Panel title="Junctions">
      <p className="text-xs text-slate-300">Pick a type, then click a junction. Lights add stop lines and signals on every corner; slipways add channelised turn lanes with islands (needs long approaches); roundabouts get a planted island.</p>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {JUNCTIONS.map(j => {
          const lk = junctionUnlocked(j.id, game.reached) ? null : unlockOf('junction', j.id)!;
          return (
            <button key={j.id} className={`card ${game.junctionType === j.id ? 'card-on' : ''} ${lk ? 'opacity-50' : ''}`} onClick={() => { game.junctionType = j.id; game.emit(); }}>
              <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">{j.name}</span><span className="text-amber-300">{lk ? lockText(lk.pop) : j.cost ? money(j.cost) : 'free'}</span></div>
              <div className="text-[10px] text-slate-400">{j.desc}</div>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{n ? `Junction of ${n.arms.length} roads (${JUNCTIONS.find(j => j.id === n.type)?.name.toLowerCase()}) — click to convert` : 'Hover a junction to highlight it.'}</p>
    </Panel>
  );
}

/** what a car is going to, by the use of its trip's destination (the tag of Sim.inspect: LU, 0 = none) */
const GOING = ['driving around', 'home', 'a shop', 'work at the industry', 'a venue', 'a civic site'];
/** seconds as m:ss */
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** the car inspector (select tool, click a car): its speed against the limit, where it is going, its trip so far against its ideal time
 *  (amber over 1.3, red over 1.8), the straight-line distance left, and Follow and Close */
function CarPanel({ game }: { game: Game }) {
  const c = game.traffic.car!, ratio = c.tripS / c.idealS;
  const tone = ratio > 1.8 ? 'text-red-300' : ratio > 1.3 ? 'text-amber-300' : 'text-slate-100';
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title="Car">
        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <span className="text-slate-400">Speed</span><span className="tabular-nums">{Math.round(c.v * 3.6)} km/h (limit {Math.round(c.vmax * 3.6)})</span>
          <span className="text-slate-400">Going to</span><span>{GOING[c.tag] ?? 'driving around'}</span>
          <span className="text-slate-400">Trip so far</span><span className={`tabular-nums ${tone}`}>{mmss(c.tripS)} (ideal {mmss(c.idealS)}, {ratio.toFixed(1)}×)</span>
          <span className="text-slate-400">Distance left</span><span className="tabular-nums">{Math.round(Math.hypot(c.dx - c.x, c.dy - c.y) * 2)} m</span>
        </div>
        <div className="mt-2 flex gap-1">
          <button className={`chip ${game.followCar ? 'chip-on' : ''}`} onClick={() => { game.followCar = !game.followCar; game.emit(); }}>Follow</button>
          <button className="chip" onClick={() => game.closeInspect()}>Close</button>
        </div>
      </Panel>
    </div>
  );
}
/** the junction routes (flow on, click a junction): the cars that crossed it since the watch began, the colour legend, and Close */
function RoutesPanel({ game }: { game: Game }) {
  const w = game.traffic.watch!;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title="Junction routes">
        <p className="text-xs text-slate-200">{w.n} cars crossed since you started watching</p>
        <p className="mt-1 text-[10px] text-slate-400"><span className="text-blue-400">Blue</span>: where they come from · <span className="text-orange-400">orange</span>: where they go</p>
        <div className="mt-2 flex gap-1"><button className="chip" onClick={() => game.closeWatch()}>Close</button></div>
      </Panel>
    </div>
  );
}

function SelectPanel({ game }: { game: Game }) {
  const p = game.selected;
  if (!p) return (<Panel title="Select"><p className="text-xs text-slate-300">Click an object to select it. Drag empty ground (or hold the right mouse button anywhere) to pan; scroll to zoom.</p></Panel>);
  const it = LIBRARY[p.item];
  return (
    <Panel title="Selected">
      <div className="flex items-center gap-2">
        <Thumb it={it} size={56} />
        <div><div className="text-sm font-semibold">{it.name}</div><div className="text-[11px] text-slate-400">{it.cat} · scale {p.scale.toFixed(2)}{p.flip ? ' · flipped' : ''}{p.auto ? ' · placed by the road works' : ''}</div></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button className="chip" onClick={() => game.scaleSelected(1.1)}>Bigger</button>
        <button className="chip" onClick={() => game.scaleSelected(1 / 1.1)}>Smaller</button>
        <button className="chip bg-red-500/70 text-white" onClick={() => game.deleteSelected()}>Remove (Del)</button>
      </div>
    </Panel>
  );
}

function hintFor(g: Game) {
  switch (g.tool) {
    case 'road': return g.route.length ? `Route: ${g.route.length} point(s) — click to extend, double-click / Enter to build, Backspace to undo, Esc to cancel, Shift for a straight 45° run` : `BUILDING NEW ROADS — Draw a connected route: click where the ${g.cls.name.toLowerCase()} should start`;
    case 'junction': return g.hoverNode ? `Click to install ${JUNCTIONS.find(j => j.id === g.junctionType)!.name.toLowerCase()} here` : 'Hover a junction (three or more roads; roundabouts also work on bends)';
    case 'bulldoze': return 'Click objects or roads to remove them';
    case 'park': return 'PARK: drag a rectangle beside a road · click a car park to remove it (no refund)';
    default: return 'Drag to pan · scroll to zoom · WASD / arrows move the camera · R roads · J junctions · X bulldoze';
  }
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-6 text-sm text-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-bold text-amber-200">How Maple Falls works</div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-300">
          <li><b>Roads</b> are drawn as connected routes, exactly like the town builder: click points, finish with Enter or a double-click. Everything on the ground — asphalt, kerbs, sidewalk slabs, rounded corners, crossings, centre lines, manholes and drains — is generated geometry, so a new road appears instantly, no ground rebuild.</li>
          <li>The surfaces are <b>lit relief</b>, like the builder's bake: the asphalt is a cracked mosaic of facets and the sidewalk is slabs, each with a height-field; a cold key light from the upper-left shades them and puts specular glints on the facets that face it, markings are painted into the relief, kerbs get a bright top edge and a gutter shadow, and fallen leaves pile up against every kerb.</li>
          <li>Five road types: <b>Lane</b> (single lane), <b>Street</b> (2 lanes, sidewalks, your choice of centre line), <b>Road</b> (wider, darker asphalt with paved shoulders inside yellow edge lines and a gravel verge), <b>Avenue</b> and <b>Boulevard</b> (2 / 4 lanes around a tree-lined median).</li>
          <li>Bends can be 90° or 45° (Q toggles); hold Shift to draw one straight run in any of the eight directions. Crossing an existing road makes a junction; drawing over a road upgrades it.</li>
          <li><b>Junctions</b> can become traffic lights (signals on every corner, stop lines), lights with slipways (channelised turn lanes and islands — needs long straight approaches) or roundabouts with a planted island. Roundabouts also work on a bend.</li>
          <li>The town pays property tax (more on better roads, less where traffic jams) and business takings for every customer who arrives on time; roads and signals cost upkeep. Click the treasury for the books and loans; five days in the red and you are bankrupt. Everything autosaves in this browser.</li>
          <li><b>Career</b>: milestones at 250, 1,000, 2,500, 4,000 and 6,000 residents unlock road classes, junctions and tunnels and pay grants; 6,000 wins. Bankruptcy loses.</li>
          <li>Camera: drag with the right mouse button or the Select tool, scroll to zoom (max = the builder's 30%), WASD / arrows to pan, G for the grid.</li>
          <li>Space pauses (tap it; hold it and drag to pan); , and . change the speed; H skips to the next rush hour.</li>
          <li>F shows traffic flow and junction levels of service; B lists the worst bottlenecks (click one to jump there).</li>
          <li>With the select tool, click a car to inspect its trip; with the flow overlay on, click a junction to see where its traffic comes from and goes.</li>
        </ul>
        <button className="btn mt-5" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
