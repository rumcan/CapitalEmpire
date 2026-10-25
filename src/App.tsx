import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FLOW_COLS, Game, HEAT_COLS, HIST_RAMP, LOS_COL, SPEEDS, UPGRADE_COST } from './game/engine';
import { ROW_BAY_COST, rowLots } from './game/event/rows';
import { LIBRARY } from './game/library';
import { type Tool } from './game/types';
import { CLASS, CLASSES, COURSE_TYPES, FLAG_COST, JUNCTIONS, KEY_CLASSES, RING_LANE_COST, ROAD_TYPES, SLIP_CORNER_COST, SPEED_BONUS_KMH, VARIANTS, courseTierNeeded, speedOf, type Family, type Node } from './game/network';
import { SIGNAL_TIER_YEAR, SPEED_TIER_YEAR } from './game/event/round';
import { GREEN_CAP, MIN_GREEN } from './game/sim/signals';
import { isLights, junctionCorners, slipRule } from './game/junctions';
import { PLANNER_Z, ZOOM_MAX, ZOOM_MIN } from './game/iso';
import { GROWTH_OPTIONS } from './game/lots/town';
import { shortName } from './game/ext/names';
import { Budget, DEBT_DAYS, GAME_DAY, LOAN, LOAN_RATE } from './game/budget';
import { compare, type Delta, type Window } from './game/beforeafter';
import { MILESTONES, WIN_POP, unlockOf } from './game/career';
import { BUS_ROUTE_COST, CARDS, CURB_BAY_COST, LOT_TILE_COST, PARTY, TOLL_BASE_COST, TOLL_BOOTH_COST, TOWN_GROWTH, tollPrice } from './game/event/config';
import { BUSINESS, BUSINESSES, ESTATE_LOTS, unlockText, type BusinessType } from './game/business/catalogue';
import { freshStats } from './game/business/state';
import { BUSINESS_IMAGE } from './game/business/art';
import { BUSINESS_THUMBS } from './game/business-library';
import type { SurgeView } from './game/event/surge';
import { PaintPanel } from './PaintPanel';
import { CoursePanel } from './ui/course/CoursePanel';
import { BuildingsPanel } from './ui/course/BuildingsPanel';
import { PropsPanel } from './ui/course/PropsPanel';
import { MyLooksCard } from './ui/course/MyLooks';
import { Rail, NewBadge } from './ui/Rail';
import { railEntries, railItemOf, toolNew } from './ui/rail-items';
import { SurfaceMark } from './ui/course/SurfaceMark';
import { BRUSH_PRESETS } from './game/paint';
import { STRUCTURES } from './game/golf/tents';
import { findGolfCard, type GolfCardDef } from './game/golf/golfcards';
import { getTournamentWeather } from './game/golf/weather';
import { computeTournamentCloseBook } from './game/golf/yearend';
import { formatMultiDayStatus } from './game/golf/multiday';
import { Icon, type IconName } from './ui/Icon';
import { NightPanel } from './ui/NightPanel';
import { RoadThumb } from './ui/RoadThumb';
import { Thumb } from './ui/Thumb';
import { Minimap } from './ui/Minimap';
import { CourseStatsPanel } from './ui/CourseStatsPanel';
import { GrassManagementPanel } from './ui/GrassManagementPanel';
import { formatPercent } from './ui/TournamentResults';
import { SeasonReportCard } from './ui/golf/SeasonReportCard';
import { RangeCard } from './ui/golf/RangeCard';
import stadiumArt from './assets/ui/art/stadium.webp';

/** the hint's key words, drawn as keycaps */
const KEY_WORDS = /\b(Esc|Tab|Enter|Shift|Backspace|Space|Delete)\b/;
const money = (n: number) => '$' + Math.round(n).toLocaleString();
/** a signed money figure: +$X or −$X */
const sgn = (n: number) => (n < 0 ? '−' : '+') + money(Math.abs(n));
/** the price line of a locked road class or junction type: the residents it unlocks at */
const lockText = (pop: number) => `🔒 ${pop.toLocaleString()} residents`;
/** the game clock as HH:MM */
const hhmm = (c: { hour: number; minute: number }) => `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;
/** a game hour of the day as HH:00 */
const hod = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
/** the Developer toggle (T035): the perf panel, the dev badge, the Studio button and the cars/growth controls; F3 flips it, ?debug forces it on, remembered in localStorage, off by default */
const DEV_KEY = 'capitalempire.dev';
function devStart(): boolean { try { return new URLSearchParams(location.search).has('debug') || localStorage.getItem(DEV_KEY) === '1'; } catch { return false; } }

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [fatal, setFatal] = useState('');
  const [game, setGame] = useState<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [help, setHelp] = useState(false);
  /** the settings menu (Save, New game, Empty map) open under its gear */
  const [menu, setMenu] = useState(false);
  /** the menu button waiting for its second click (New game, Empty map), or null */
  const [armed, setArmed] = useState<'new' | 'empty' | null>(null);
  useEffect(() => { if (!menu) setArmed(null); }, [menu]);
  const [courseStats, setCourseStats] = useState<ReturnType<Game['courseStatsView']>>(null);  
  // Esc closes the topmost menu or card before it reaches the tool (P23 P1-A): the engine's Esc ladder asks which of these are open
  useEffect(() => { if (game) game.uiCards = { open: () => ({ help, menu, looks: looksOpen, stats: !!courseStats }), close: c => (c === 'help' ? setHelp(false) : c === 'menu' ? setMenu(false) : c === 'looks' ? setLooks(false) : setCourseStats(null)) }; });
  /** the Developer toggle (see devStart): the gear menu's checkbox and F3 set it; remembered */
  const [dev, setDevState] = useState(devStart);
  const devRef = useRef(dev);
  const setDev = (v: boolean) => { devRef.current = v; setDevState(v); try { localStorage.setItem(DEV_KEY, v ? '1' : '0'); } catch { /* storage may be unavailable */ } };
  useEffect(() => { const f3 = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); setDev(!devRef.current); } }; window.addEventListener('keydown', f3); return () => window.removeEventListener('keydown', f3); }, []);
  /** the last tool picked in each rail item, so an item returns to it */
  const last = useRef<Record<string, Tool>>({});
  /** Holes > More options > My looks (P23 decision 3): the surface style editor's card beside the Holes panel; Esc closes it first */
  const [looks, setLooks] = useState(false);
  const looksOpen = looks && game?.uiTool === 'course';
  useEffect(() => { if (!looksOpen && looks) setLooks(false); }, [looksOpen, looks]);
  /** the bankrupt overlay's 'Keep watching' (cleared once the city is no longer bankrupt) */
  const [watch, setWatch] = useState(false);
  /** the top bar wraps to two rows on narrow windows (how wide depends on its content): --hud-top follows its bottom, and the rail and the
   *  right-hand cards sit under it */
  const hudRo = useRef<ResizeObserver | null>(null);
  const topBar = useCallback((el: HTMLDivElement | null) => {
    hudRo.current?.disconnect(); hudRo.current = null; if (!el) return;
    hudRo.current = new ResizeObserver(() => document.documentElement.style.setProperty('--hud-top', `${Math.round(el.getBoundingClientRect().bottom)}px`));
    hudRo.current.observe(el);
  }, []);

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
    // the road builder's stress test (dev only): __roadFuzz(seed, steps) drives the road tools at random and reports what broke (on the live
    // game: StrictMode mounts twice, and the first game is disposed)
    if (import.meta.env.DEV) void import('./game/dev/roadfuzz').then(m => Object.assign(window as unknown as Record<string, unknown>, { __roadFuzz: (seed?: number, steps?: number, o?: Parameters<typeof m.roadFuzz>[3]) => m.roadFuzz((window as unknown as { __game: Game }).__game, seed, steps, o), __roadReplay: (box: [number, number, number, number], log: string[], upTo?: number) => m.roadReplay((window as unknown as { __game: Game }).__game, box, log, upTo), __junctionGallery: (o?: Parameters<typeof m.junctionGallery>[1]) => m.junctionGallery((window as unknown as { __game: Game }).__game, o) }));
    // the dev lot editor (P20 T071, dev builds only: ?dev or the I key): select, resize, move, turn, delete, add; edits kept in the lot presets
    let lotEditorOff: (() => void) | undefined, disposed = false;
    if (import.meta.env.DEV) void import('./game/dev/lot-editor').then(m => { if (!disposed) lotEditorOff = m.installLotEditor(g, canvas); });
    setGame(g);
    const unsub = g.subscribe(bump);
    g.init({ bench: new URLSearchParams(location.search).has('bench') ? +(new URLSearchParams(location.search).get('bench') || 1) || 1 : 0 }).catch(e => setFatal(String(e)));
    const wheel = (e: WheelEvent) => g.wheel(e);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const kd = (e: KeyboardEvent) => g.keyDown(e), ku = (e: KeyboardEvent) => g.keyUp(e);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const iv = window.setInterval(bump, 500);
    return () => { disposed = true; lotEditorOff?.(); unsub(); g.destroy(); canvas.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  const toasts = game ? game.toasts.filter(t => performance.now() - t.t < 4000) : [];
  const net = game?.ledger?.net ?? 0, debtDays = game?.traffic.budget.debtDays ?? 0;
  // the rail item of the tool in hand (the road tool on the course is Paths, the course tool's clubhouse scope Buildings: game.uiTool)
  const item = game ? railItemOf(game.uiTool) : undefined;
  if (game && item) last.current[item.id] = game.uiTool;
  /** the golf HUD's view (null outside golf mode): the top bar's tier and month */
  const gv = game?.golfMode ? game.golfView() : null, fv = game?.golfMode ? game.foundingView() : null;
  /** the tool visibility in force (T033 progressive unlocks; null shows everything) */
  const ui = game?.toolUi() ?? null;
  /** whether a golf top-bar chip is shown under the progressive unlocks */
  const chip = (id: string) => !ui || (ui.visibleGolfChips as string[]).includes(id);
  /** the first-run hint (null when none or all dismissed); golf mode shows it in the bottom bar */
  const hint = ui?.activeHint ?? null;
  /** the Course brush's words (T118): what a click does (the surface, the hole it joins or starts, the price a cell) and the state; golf mode always shows them while a surface is armed */
  const courseHint = game?.courseHint() ?? '';
  /** the surface keys in force: 1 to the last surface the progressive unlocks show (BRUSH_PRESETS' order, as PaintTool.key reads them) */
  const surfaceKeys = Math.max(1, ...BRUSH_PRESETS.map((b, i) => (!ui || (ui.visibleCourseBrushes as string[]).includes(b.kind) ? i + 1 : 0)));
  /** the open item's tools that the progressive unlocks show (the segmented row of Roads and Transport) */
  const shownTools = item ? item.tools.filter(t => !ui || (ui.visibleTools as string[]).includes(t.id)) : [];

  /** the top bar's money figure (a button: it opens the budget) */
  const treasury = (g: Game) => <Stat icon="bank" label="Treasury" value={g.unlimited ? '∞' : money(g.money)} tone={g.money < 0 ? 'text-red-300' : 'text-emerald-300'} sub={debtDays ? `bankrupt in ${DEBT_DAYS - debtDays} days` : undefined} subTone="text-red-300" onClick={() => { g.panel = g.panel === 'budget' ? null : 'budget'; g.emit(); }} />;
  /** the population, jobs, day and daily income: inline in classic mode, in the Treasury drawer in golf mode (T035) */
  const moreStats = (g: Game) => (
    <>
      <Stat icon="people" label="Population" value={g.traffic.pop.toLocaleString()} />
      <Stat icon="briefcase" label="Jobs" value={g.traffic.jobs.toLocaleString()} />
      <Stat icon="sun" label="Day" value={String(g.day)} sub={hhmm(g.clock())} />
      <Stat icon="income" label="Daily income" value={(net >= 0 ? '+' : '') + money(net)} tone={net >= 0 ? 'text-emerald-300' : 'text-red-300'} />
    </>
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1b2816] text-slate-100 select-none" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: game?.tool === 'select' ? (game.hoverProp ? 'pointer' : 'grab') : game?.paintOn ? game.paint.cursorStyle : 'crosshair' }}
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
          <div ref={topBar} className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="pointer-events-auto glass flex items-center gap-3 px-4 py-2">
              <div className="flex items-center gap-2.5">
                <Icon name="leaf" size={38} />
                <div className="max-[1599px]:hidden">
                  <div className="whitespace-nowrap font-display text-2xl font-bold leading-tight text-[var(--gold-hi)]">Maple Falls</div>
                  <div className="label-caps whitespace-nowrap">Town Builder</div>
                </div>
              </div>
              <div className="h-9 w-px bg-white/10" />
              {gv ? (
                <>
                  <Stat icon="trophy" label="Tier" value={`T${gv.tier}`} sub={gv.tierName} tone="text-amber-200" />
                  <Stat icon="calendar" label="Month" value={gv.month} sub={gv.live ? 'Tournament day' : `${Math.ceil(gv.monthsLeft)} ${Math.ceil(gv.monthsLeft) === 1 ? 'month' : 'months'} to ${fv && !fv.due ? 'season end' : 'the tournament'}`} />
                  {game.golf?.start === 'range' && <button className={`chip ${game.range.cardOpen ? 'chip-on' : ''}`} onClick={() => game.openRangeCard()} title="The driving range: golfers, takings, bucket price and upgrades" data-testid="range-chip"><Icon name="income" size={16} />Range</button>}
                  {fv?.invited && game.traffic.round.runs === 0 && !gv.live && <span className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-200" title="The tour's invitation: the first tournament is held at the end of the season it names">The Club Championship: end of {fv.due ? 'this' : 'next'} season</span>}
                  {gv.live && (() => { const w = getTournamentWeather(game.seed, game.traffic.round.stage === 'eval' && game.traffic.round.last ? game.traffic.round.last.run : game.traffic.round.runs + 1); return <span className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-200" title={w.summary}>{w.icon} {w.label}</span>; })()}
                  {chip('courseStats') && <button className={`chip ${courseStats ? 'chip-on' : ''}`} onClick={() => setCourseStats(courseStats ? null : (game.courseStatsView() ?? null))} title="Course stats and scorecard"><Icon name="trophy" size={16} />Course</button>}
                  {chip('land') && <button className={`chip ${game.landMode ? 'chip-on' : ''}`} onClick={() => { game.toggleLandMode(); bump(); }} title="Buy adjacent land parcels"><Icon name="compass" size={16} />Land</button>}
                  {chip('holes') && <button className={`chip ${game.holesTool ? 'chip-on' : ''}`} onClick={() => { game.toggleHolesTool(); bump(); }} title="Move pins and tee markers"><Icon name="pin" size={16} />Holes</button>}  
 {chip('event') && <button className={`chip ${game.eventTool ? 'chip-on' : ''}`} onClick={() => { game.toggleEventTool(); bump(); }} title="Event structures catalogue"><Icon name="buildings" size={16} />Event</button>}  
 {chip('skipTournament') && <button className="chip disabled:opacity-40" disabled={game.traffic.skipping || gv.live} onClick={() => game.skipToTournament()} title={fv && !fv.due ? `Skip to the end of the season (no tournament yet: ${fv.invited ? 'the first one closes the next season' : fv.check.text})` : 'Skip to the tournament (end of August)'}><Icon name="skip" size={16} />{/* P23 4.11: under 1600 px the chip says Skip (its tooltip says the rest), so the top bar keeps one row at 1366 px */}<span className="max-[1599px]:hidden">{fv && !fv.due ? 'Skip to season end' : 'Skip to tournament'}</span><span className="min-[1600px]:hidden">Skip</span></button>}
                </>
              ) : game.eventMode
                ? <Stat icon="trophy" label="Level" value={String(game.traffic.round.xp)} sub={`${game.traffic.round.cards.length} cards`} tone="text-amber-200" />
                : <Stat icon="trophy" label="Career" {...careerStat(game)} tone="text-amber-200" />}
              {gv ? (
                <div className="group relative">
                  {treasury(game)}
                  <div className="absolute left-0 top-full z-30 hidden pt-1 group-hover:block">
                    <div className="glass flex flex-col gap-2 p-2">{moreStats(game)}</div>
                  </div>
                </div>
              ) : <>{treasury(game)}{moreStats(game)}</>}
              {dev && <span className="rounded-md border border-sky-400/50 bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-200" title="Developer panels are on (F3 hides them)">DEV</span>}
              {dev && (game.growth !== 1 || game.unlimited || !game.stamped) && (
                <div className="rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-xs font-semibold text-amber-200" title="Dev sandbox options (URL: ?grow=N, ?money=0|1, ?stamp=0|1)">
                  dev: {[game.growth !== 1 && `grow ${game.growth}×`, game.unlimited && '∞ $', !game.stamped && 'no stamp', game.unlockAll && 'all unlocked'].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            <div className="pointer-events-auto ml-auto flex items-center gap-2">
              <div className="glass flex items-center gap-1 px-2 py-1.5">
                <button className="btn-icon" onClick={() => game.togglePause()} title="Pause (Space)"><Icon name={game.speed ? 'pause' : 'play'} size={22} /></button>
                {SPEEDS.map(k => <button key={k} className={`chip ${game.speed === k ? 'chip-on' : ''}`} onClick={() => game.setSpeed(k)} title="Speed (, and .)">{k}×</button>)}
                <button className="chip disabled:opacity-40" disabled={game.traffic.skipping} onClick={() => game.skipToRush()} title="Skip to the next rush hour (H)"><Icon name="skip" size={16} />{game.traffic.skipping ? 'Skipping…' : ''}</button>
                {game.night.mode === 'clock' && game.clockNight() > 0 && <button className="chip" onClick={() => game.skipNight()} title="Skip this night: daylight until the next one (how often nights come: gear menu, Night)"><Icon name="sun" size={16} /> Skip night</button>}
              </div>
              <div className="glass flex items-center gap-1 px-2 py-1.5">
                <button className="btn-icon" onClick={() => game.zoomAt(Math.max(ZOOM_MIN, game.cam.z / 1.25))} title="Zoom out (-)"><Icon name="zoom-out" size={20} /></button>
                <button className="btn-icon" onClick={() => game.zoomAt(Math.min(ZOOM_MAX, game.cam.z * 1.25))} title="Zoom in (+)"><Icon name="zoom-in" size={20} /></button>
              </div>
              <button className={`btn-icon ${game.showFlow ? 'on' : ''}`} onClick={() => { game.setFlow(!game.showFlow); bump(); }} title="Live congestion heat map (F)"><Icon name="layers" size={22} /></button>
              {game.showFlow && (['time', 'now'] as const).map(m => (
                <button key={m} className={`btn ${game.flowMode === m ? 'bg-amber-400/20 text-amber-200' : ''}`} onClick={() => { game.flowMode = m; game.emit(); }}>{m === 'time' ? 'Over time' : 'Now'}</button>
              ))}
              <button className={`btn-icon ${game.panel === 'bottlenecks' ? 'on' : ''}`} onClick={() => { game.panel = game.panel === 'bottlenecks' ? null : 'bottlenecks'; if (game.panel) game.traffic.requestReport(); bump(); }} title="The worst bottlenecks (B)"><Icon name="chart" size={22} /></button>
              <button className={`btn-icon ${game.showGrid ? 'on' : ''}`} onClick={() => { game.setShowGrid(!game.showGrid); bump(); }} title="Map grid: the 2 m tiles roads and lots snap to, shown while a build or paint tool is in hand (G)"><Icon name="fullscreen" size={22} /></button>
              <button className={`btn ${game.grassPanel ? 'on' : ''}`} onClick={() => game.toggleGrassPanel()} title="Inspect and maintain course and town grass">Grass</button>
              <div className="relative">
                <button className={`btn-icon ${menu ? 'on' : ''}`} onClick={() => setMenu(!menu)} title="Settings"><Icon name="gear" size={22} /></button>
                {menu && (
                  <div className="glass absolute right-0 top-full z-30 mt-2 flex max-h-[calc(100vh-8rem)] w-80 flex-col gap-1 overflow-y-auto p-2">
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title="Performance panel, dev badge, Studio, traffic and growth controls (F3)"><input type="checkbox" checked={dev} onChange={e => setDev(e.target.checked)} />Developer (F3)</label>
                    {/* T117: the unlocks' Settings switch (was the top bar's All tools chip): every tool and fine control now, whatever the stage */}
                    {game.playerProgressFacts() && (
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title={ui ? `Tools open as your course grows (${ui.stageLabel}). Tick to show every tool and fine control now` : 'The dev sandbox shows every tool (?unlock=0 plays the unlocks)'}>
                        <input type="checkbox" checked={!ui || ui.advancedMode} disabled={!ui} onChange={e => { game.setAdvancedTools(e.target.checked); bump(); }} />
                        Show every tool now
                      </label>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title="A subtle iso grid of the 2 m tiles roads and lots snap to, at all times (it fades out as you zoom out). Building the course shows its 1 m half grid either way (G)">
                      <input type="checkbox" checked={game.showGrid} onChange={e => { game.setShowGrid(e.target.checked); bump(); }} />
                      Map grid (G)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title="A small label over each building drawn as a stand-in (another building of its kind) until its own art arrives: Stand In for Church">
                      <input type="checkbox" checked={game.showStandIns} onChange={e => { game.setShowStandIns(e.target.checked); bump(); }} />
                      Show stand-in labels
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title="Floods, storms, landslides, wildfires and earthquakes close roads now and then">
                      <input type="checkbox" checked={game.disastersEnabled} onChange={e => { game.setDisasters(e.target.checked); bump(); }} />
                      Natural disasters
                    </label>
                    <label className="flex items-center gap-2 px-2 py-2 text-sm" title="The contact shadows under every building, car, tree and prop (TrickOrTreat's town-builder shadows). 100% = the builder's, 0 = off">
                      <span className="w-16 shrink-0">Shadows</span>
                      <input type="range" className="min-w-0 flex-1" min={0} max={2} step={0.05} value={game.shadowStrength} onChange={e => { game.setShadowStrength(+e.target.value); bump(); }} />
                      <span className="w-10 text-right tabular-nums">{Math.round(game.shadowStrength * 100)}%</span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm" title="The grass grows where it would: darker, bushier grass along fences, walls, hedges and water, patchy grass with bare dirt and leaves under trees, worn ground at doors and path edges, and soft shade at the foot of everything (T111)">
                      <input type="checkbox" checked={game.groundVariety} onChange={e => { game.setGroundVariety(e.target.checked); bump(); }} />
                      Ground variety
                    </label>
                    <label className="flex items-center gap-2 px-2 py-2 text-sm" title="How strongly raised and lowered ground (the Height tool) catches the sun at the upper right: lit, textured slopes facing it, soft cool shade facing away (T126). 100% = the default, 0 = off">
                      <span className="w-16 shrink-0">Slope light</span>
                      <input type="range" className="min-w-0 flex-1" min={0} max={2} step={0.05} value={game.slopeLight} onChange={e => { game.setSlopeLight(+e.target.value); bump(); }} />
                      <span className="w-10 text-right tabular-nums">{Math.round(game.slopeLight * 100)}%</span>
                    </label>
                    {dev && (
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs" title="Developer: the ground shows the living ground's influence maps instead of the grass: lush green, thin orange, bare brown, litter red, shade blue-grey">
                        <input type="checkbox" checked={game.groundDebug} onChange={e => { game.setGroundDebug(e.target.checked); bump(); }} />
                        Ground variety maps (debug)
                      </label>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 px-2 pt-2 text-sm" title="Every tree, building, prop and car throws its silhouette onto the ground away from the sun (the baked house lots have theirs baked in, from cast-shadow.json)">
                      <input type="checkbox" checked={game.cast.on} onChange={e => { game.setCast({ on: e.target.checked }); bump(); }} />
                      Cast shadows
                    </label>
                    {game.cast.on && ([['Sun side', 'angle', 0, 360, 5, `${Math.round(game.cast.angle)}°`], ['Length', 'length', 0.1, 1.5, 0.05, `${Math.round(game.cast.length * 100)}%`], ['Darkness', 'strength', 0, 1, 0.02, `${Math.round(game.cast.strength * 100)}%`]] as const).map(([label, k, lo, hi, step, show]) => (
                      <label key={k} className="flex items-center gap-2 px-2 py-1 text-xs" title={k === 'angle' ? 'The way the shadows fall on screen: 0 right, 90 down, 180 left, 270 up' : undefined}>
                        <span className="w-16 shrink-0">{label}</span>
                        <input type="range" className="min-w-0 flex-1" min={lo} max={hi} step={step} value={game.cast[k]} onChange={e => { game.setCast({ [k]: +e.target.value }); bump(); }} />
                        <span className="w-10 text-right tabular-nums">{show}</span>
                      </label>
                    ))}
                    <NightPanel game={game} bump={bump} />
                    <button className="btn w-full" onClick={() => { setMenu(false); game.save(); }} title="Saved automatically; force a save now">Save</button>
                    {/* asked in the menu (the browser's confirm() is not shown in every embedded browser): a first click arms, a second acts */}
                    <button className={`btn w-full ${armed === 'new' ? '!border-red-400 !text-red-300' : ''}`} title="Start a new game: your current game is replaced" onClick={() => { if (armed !== 'new') { setArmed('new'); return; } setArmed(null); setMenu(false); game.newTown(); }}>{armed === 'new' ? 'Click again: replace this game' : 'New game'}</button>
                    <button className={`btn w-full ${armed === 'empty' ? '!border-red-400 !text-red-300' : ''}`} title="Clear everything and start from an empty field" onClick={() => { if (armed !== 'empty') { setArmed('empty'); return; } setArmed(null); setMenu(false); game.clearTown(); }}>{armed === 'empty' ? 'Click again: clear everything' : 'Empty map'}</button>
                  </div>
                )}
              </div>
              {dev && ON_PC && <a className="btn" href={STUDIO_URL} target="studio" rel="noopener" title="The sprite studio (5179): sprites, lots, holes, the ground grass and map decals. Its Rebuild game sprites rebuilds this game: reload to see it">Studio</a>}
              <button className="btn-icon" onClick={() => setHelp(true)} title="How it works"><Icon name="help" size={22} /></button>
            </div>
          </div>

          <div className="absolute left-3 top-[var(--hud-top,5.75rem)] z-20 flex items-start gap-2">
            {/* P23 P1-E: the same places from minute zero; a tool not open yet stays dimmed in place with what unlocks it, a new one says NEW */}
            <Rail entries={railEntries(ui, game.golfMode, game.uiTool)} onPick={r => game.setTool(last.current[r.id] ?? r.tools[0]!.id)} onLocked={(r, why) => game.toast(`${r.label}: ${why}`)} />
            <div className="glass w-[330px] max-h-[calc(100vh-var(--hud-top,5.75rem)-8.25rem)] overflow-y-auto p-3" data-tool={game.uiTool}>
              {shownTools.length > 1 && (
                <div className="seg mb-3">
                  {shownTools.map(t => (
                    <button key={t.id} className={game.uiTool === t.id ? 'on' : ''} onClick={() => game.setTool(t.id)} title={t.key ? `${t.label} (${t.key})` : t.label}><Icon name={t.icon} size={16} />{t.label}{toolNew(ui, t.id) && <NewBadge />}</button>
                  ))}
                </div>
              )}
              {game.uiTool === 'road' && <RoadPanel game={game} scope="town" />}
              {game.uiTool === 'path' && <RoadPanel game={game} scope="course" />}
              {game.tool === 'lane' && (
                <Panel title="Upgrade roads" icon="up" desc="Click a straight run of road to take it one size up: gravel → street → road → arterial → six-lane; avenue → boulevard → grand. On the course: walking path → dirt path → cement slabs → paved cart path; gravel drive → paved → avenue. You pay only the difference.">
                  <p className="text-xs text-slate-300">Right-click a one-way road to reverse it.</p>
                </Panel>
              )}
              {game.tool === 'downgrade' && (
                <Panel title="Downgrade roads" icon="down" desc="Click a straight run of road to take it one size down the same ladder. The difference is refunded.">
                  <p className="text-xs text-slate-300">Right-click a one-way road to reverse it.</p>
                </Panel>
              )}
              {game.tool === 'junction' && <JunctionPanel game={game} />}
              {game.tool === 'bulldoze' && (
                <Panel title="Bulldoze" icon="bulldozer">
                  <p className="text-xs text-slate-300">Click an object to remove it (half its price is refunded). Click or drag along a road to tear it up piece by piece — the ends become cul-de-sacs and curbs, corners, crossings and markings redraw themselves instantly.</p>
                </Panel>
              )}
              {game.tool === 'paint' && <PaintPanel game={game} />}
              {game.uiTool === 'course' && <CoursePanel game={game} looks={looksOpen} onLooks={setLooks} />}
              {game.uiTool === 'buildings' && <BuildingsPanel game={game} />}
              {game.tool === 'props' && <PropsPanel game={game} />}
              {game.tool === 'park' && <ParkPanel game={game} />}
              {game.tool === 'toll' && <TollPanel game={game} />}
              {game.tool === 'business' && <BusinessPanel game={game} />}
              {game.tool === 'bus' && <BusPanel game={game} />}
              {game.tool === 'select' && <SelectPanel game={game} />}
            </div>
            {looksOpen && <MyLooksCard game={game} onClose={() => setLooks(false)} />}
          </div>

          {/* the hint bar, centred in the lane between the minimap's town chip and the stats card. Golf mode (T035): the first-run hint, with its Got it;
              and while a course surface is armed (T118), always the Course pill: what a click lays (the surface's disc and mark, the hole it joins, the
              price a cell, the state's words) and how to switch or stop; no bar without either */}
          {(!gv || hint || courseHint) && (
          <div className="pointer-events-none absolute bottom-3 left-[24.5rem] right-[15.5rem] z-20 flex flex-col items-center gap-1.5">
            {(!gv || hint) && (
            <div className={`flex items-center gap-2 glass rounded-full! px-4 py-1.5 text-xs ${gv ? 'pointer-events-auto' : ''}`}>
              <Icon name="info" size={18} />
              {gv && hint
                ? <><span><b>{hint.title}</b> · {hint.body}</span>{hint.id.startsWith('hint-practice') && <button className="chip chip-on" data-testid="hint-show-practice" onClick={() => { game.showPracticeArea(); bump(); }}>Show me</button>}<button className="chip" onClick={() => { game.dismissHint(hint.id); bump(); }}>Got it</button></>
                : <span>{keyed(hintFor(game))}</span>}
            </div>
            )}
            {gv && courseHint && (
            <div className="flex items-center gap-2 glass rounded-full! px-4 py-1.5 text-xs" data-testid="course-pill">
              <SurfaceMark kind={game.paint.brushKind} size={24} />
              <span className="text-slate-100">{courseHint}</span>
              <span className="whitespace-nowrap text-slate-300">· <span className="keycap">1–{surfaceKeys}</span> switch surface · <span className="keycap">Esc</span> stop</span>
            </div>
            )}
          </div>
          )}
          {(game.showAccess || (dev && game.cam.z < PLANNER_Z)) && <AccessLegend game={game} />}
          {game.showFlow && <HeatLegend raised={game.showAccess || (dev && game.cam.z < PLANNER_Z)} time={game.flowMode === 'time'} />}

          <div className="pointer-events-none absolute left-1/2 top-20 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            {toasts.map(t => (
              <div key={t.id} className="glass px-3 py-1.5 text-sm"><span className={t.kind === 'warn' ? 'text-red-300' : t.kind === 'good' ? 'text-emerald-300' : ''}>{t.text}</span></div>
            ))}
          </div>

          {(game.traffic.car || game.traffic.watch?.node) && (
          <div className="absolute left-[444px] top-[var(--hud-top,6rem)] z-20 flex w-64 flex-col gap-2">
          {game.traffic.car && <CarPanel game={game} />}
          {game.traffic.watch?.node && <RoutesPanel game={game} />}
          </div>
          )}
          {game.panel === 'budget' && <BudgetPanel game={game} />}
          {game.grassPanel && <GrassManagementPanel game={game} />}
          {courseStats && (
          <div className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20`}>
          <CourseStatsPanel stats={courseStats} onClose={() => setCourseStats(null)} onSelectHole={h => { if (game.holesTool) game.selectGolfMarker(h, 'pin'); else { const pin = game.golf?.pins.find(p => p.hole === h); if (pin) game.jumpTo(pin.x, pin.y); } }} />
          </div>
          )}
          {game.eventTool && gv && (
          <div className={`pointer-events-auto absolute ${game?.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20 max-h-[75vh] w-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`}>
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2 font-semibold text-amber-200"><Icon name="buildings" size={18} />Event Structures</div>
          <button className="btn-icon" onClick={() => game.toggleEventTool()}>✕</button>
          </div>
          <div className="space-y-1.5 text-xs">
          {STRUCTURES.filter(s => s.tier <= gv.tier + 1).map(s => (
          <div key={s.id} className="space-y-1 rounded-lg border border-white/5 bg-white/5 p-2">
          <div className="flex justify-between font-medium text-white">
          <span>{s.name}</span>
          <span className="text-[10px] text-slate-400">{s.footprint.w}×{s.footprint.h}{s.unit ? ` · ${s.capacity} ${s.unit}` : ''}</span>
          </div>
          <p className="text-[11px] text-slate-400">{s.blurb}</p>
          <div className="flex gap-1.5 pt-1">
          {s.rent > 0 && (
          <button className={`chip flex-1 justify-center text-center ${game?.eventStructurePending?.typeId === s.id && game.eventStructurePending?.mode === 'rent' ? 'chip-on' : ''}`} onClick={() => { if (game) { game.setPendingStructure(s.id, 'rent'); bump(); } }}>Rent ${s.rent.toLocaleString()}</button>
          )}
          {s.buy > 0 && (
          <button className={`chip flex-1 justify-center text-center ${game?.eventStructurePending?.typeId === s.id && game.eventStructurePending?.mode === 'buy' ? 'chip-on' : ''}`} onClick={() => { if (game) { game.setPendingStructure(s.id, 'buy'); bump(); } }}>Buy ${s.buy.toLocaleString()}</button>
          )}
          </div>
          </div>
          ))}
          </div>
          </div>
          )}
          {game.site && game.traffic.round.stage !== 'eval' && <RoundPanel game={game} />}
          {game.site && game.traffic.round.stage === 'eval' && <EvalScreen game={game} />}
          {game.seasonReport && game.traffic.round.stage === 'free' && <SeasonReportCard report={game.seasonReport} onContinue={() => game.dismissSeasonReport()} />}
          {(() => { const rc = game.rangeCard(); return rc && <RangeCard view={rc} right={game.panel ? 'right-[19.5rem]' : 'right-3'} onClose={() => game.openRangeCard(false)} onPrice={p => game.setRangePrice(p)} onBuy={id => game.buyRangeUpgrade(id)} onShowPractice={() => game.showPracticeArea()} />; })()}
          {game.eventMode && !game.site && !game.golfMode && (
            <div className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20 flex items-center gap-3 glass p-3 text-sm`}>
              <Icon name="trophy" size={32} />
              <span>Place your stadium to start the events</span>
              <button className="btn-gold" onClick={() => game.setTool('business')}>Business tool (M)</button>
            </div>
          )}
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
                  <button className="chip chip-on" onClick={() => game.newTown()}>New game</button>
                  <button className="chip" onClick={() => setWatch(true)}>Keep watching</button>
                </div>
              </div>
            </div>
          )}

          <Minimap game={game} />
          {dev && <PerfPanel game={game} />}
          {help && <Help onClose={() => setHelp(false)} />}
        </>
      )}
        </div>
  );
}

/** frame time, what was drawn, and the traffic */
function PerfPanel({ game }: { game: Game }) {
  const p = game.perf;
  return (
    <div className="absolute bottom-3 right-3 z-20 w-56 glass p-2 text-[11px] tabular-nums">
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

/** a top-bar figure: its icon (in a square, when given), its label, value and a line under it; bar (0 to 1) draws a thin progress bar under that */
function Stat({ label, value, sub, tone, subTone, bar, onClick, icon }: { label: string; value: string; sub?: string; tone?: string; subTone?: string; bar?: number; onClick?: () => void; icon?: IconName }) {
  return (
    <div className={`flex items-center gap-2.5 px-1 ${onClick ? 'cursor-pointer rounded-lg hover:bg-white/5' : ''}`} onClick={onClick}>
      {icon && <div className="glass-2 hidden h-8 w-8 shrink-0 place-items-center min-[1900px]:grid"><Icon name={icon} size={24} /></div>}
      <div>
        <div className="label-caps">{label}</div>
        <div className={`text-sm font-semibold tabular-nums leading-tight ${tone ?? ''}`}>{value}</div>
        {sub && <div className={`text-[10px] ${subTone ?? 'text-slate-500'}`}>{sub}</div>}
        {bar !== undefined && <div className="mt-0.5 h-1 w-28 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round(bar * 100)}%` }} /></div>}
      </div>
    </div>
  );
}
/** a hint's key words as keycaps: the words in KEY_WORDS are split out (odd parts) and drawn as .keycap */
function keyed(s: string) { return s.split(KEY_WORDS).map((p, i) => (i % 2 ? <span key={i} className="keycap">{p}</span> : p)); }

/** the Career figure: the milestone reached, the next one and how far the population is from it (from the last milestone's residents to the next one's); Career won at the last */
function careerStat(game: Game): { value: string; sub: string; bar?: number } {
  const cur = MILESTONES[game.reached]!, nxt = MILESTONES[game.reached + 1];
  if (!nxt) return { value: cur.name, sub: 'Career won' };
  return { value: cur.name, sub: `next: ${nxt.name} at ${nxt.pop.toLocaleString()}`, bar: Math.min(1, Math.max(0, (game.traffic.pop - cur.pop) / (nxt.pop - cur.pop))) };
}

/** the city's books: the last closed day's ledger, the net of the last 14 days as bars, the loans and the debt */
function BudgetPanel({ game }: { game: Game }) {
  const b = game.traffic.budget, l = game.ledger, H = b.history.slice(-14), mx = Math.max(1, ...H.map(v => Math.abs(v.net)));
  const rows: [string, number, boolean][] = l ? [['Property tax', l.property, true], ['Business', l.business, true], ['Grants', l.grants ?? 0, true], ['Land sales', l.sales ?? 0, true], ['Connection fees', l.fees ?? 0, true], ['Upkeep', l.upkeep, false], ['Signal upkeep', l.signals, false], ['Loan interest', l.interest, false], ['Construction', l.construction, false], ['Compensation', l.compensation, false]] : [];
  const maxLoans = Budget.from(b).maxLoans(game.traffic.pop);
  return (
    <div className="absolute right-3 top-[var(--hud-top,6rem)] z-20 w-72 rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
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
/** the surge's per-town lines and its total (the live counts, or the result's at kick-off): the town's letter, parked of sent, the fans, and a note
 *  when no car park is reachable (the rest on a second line); the total line is the fans arrived of the fans sent (PARTY per car), and the rate */
function SurgeTowns({ rows, total, golf }: { rows: TownRow[]; total?: { fans: number; sent: number }; golf?: boolean }) {
  const F = total?.fans ?? 0, S = total?.sent ?? 0, who = golf ? 'spectators' : 'fans';
  return (
    <div className="space-y-0.5">
      {rows.map((w, k) => (
        <div key={k}>
          <p className="text-xs tabular-nums text-slate-300">{String.fromCharCode(65 + k)}  parked {w.parked}/{w.sent} cars · at the stop {w.atStop} · on buses {w.onBus} · arrived {w.fans} {who}{w.stranded > 0 ? ' · no car park reachable' : ''}{w.byBus > 0 ? ` · by bus ${w.byBus}` : ''}</p>
          {w.rest && <p className="text-[10px] tabular-nums text-slate-400">{w.rest}</p>}
        </div>
      ))}
      {total && <p className="text-xs font-semibold tabular-nums text-slate-100">Arrived {F}/{S * PARTY} {who} ({S ? Math.round(100 * F / (S * PARTY)) : 0}%)</p>}
    </div>
  );
}
/** a town's row in SurgeTowns: the cars sent and parked, stranded (no car park reachable), the fans at the doors, at a lot stop and on a bus, and the rest of its counts */
interface TownRow { sent: number; parked: number; stranded: number; fans: number; atStop: number; onBus: number; byBus: number; rest: string }
/** the surge's live rows: the cars on the road, turned away and lost per town, and the fans per town (and by a town bus) */
function liveRows(v: SurgeView): TownRow[] {
  return v.sent.map((sent, k) => ({ sent, parked: v.parked[k]!, stranded: v.stranded[k]!, fans: v.fans[k]!, atStop: v.atStop[k]!, onBus: v.onBus[k]!, byBus: v.byBus[k]!, rest: `on the road ${v.onRoad[k]}` + (v.turned[k] ? ` · turned ${v.turned[k]}` : '') + ` · lost ${v.lost[k]}` }));
}

/** the event round (Phase 5 step 2c): the stadium's round by stage (free: start it; build: the clock, the crowd and the upkeep; surge: kick-off's clock).
 *  Docked top right (left of a right-hand panel when one is open); the eval stage has its own screen (EvalScreen) */
function RoundPanel({ game }: { game: Game }) {
  const r = game.traffic.round, last = r.last, golf = game.golfMode, gv = golf ? game.golfView() : null;
  const crowd = r.crowd.map((c, i) => `Town ${String.fromCharCode(65 + i)} ${c}`).join(' · ') + (r.crowd.length ? ' cars' : '');
  // golf mode (with its view): the season's note, then the tournament day; the stadium's wording otherwise
  const sentence = gv ? (r.stage === 'free' ? `Season ${gv.year}: get the course and the roads ready. The tournament is at the end of August.` : 'Tournament day: the spectators are driving to the course.')
    : r.stage === 'free' ? 'Host a major stadium event to boost happiness, income and the local economy.'
    : r.stage === 'build' ? 'Fans are on their way: finish the roads before kick-off.' : 'Kick-off: the crowd is driving to the stadium.';
  // minimized (the owner: "always open in my face"): a small pill with the event, the month and the clock; remembered
  const [min, setMin] = useState(() => { try { return localStorage.getItem('capitalempire.eventMin') !== '0'; } catch { return true; } });
  const minimize = (v: boolean) => { setMin(v); try { localStorage.setItem('capitalempire.eventMin', v ? '1' : '0'); } catch { /* storage may be unavailable */ } };
  const clock = r.stage === 'build' ? `Build ${mmss(Math.ceil(r.buildLeft))}` : r.stage === 'surge' ? `${golf ? 'Tee-off' : 'Kick-off'} ${mmss(Math.ceil(r.surgeLeft))}` : '';
  if (min) return (
    <button className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20 glass flex items-center gap-2 px-3 py-1.5 text-sm`} title="Show the event" onClick={() => minimize(false)}>
      <Icon name="trophy" size={18} />
      <span className="font-semibold text-[var(--gold-hi)]">{gv ? `T${gv.tier}` : `Level ${r.level}`}</span>
      <span>{gv ? gv.month : `Run ${r.runs + 1}`}</span>
      {clock && <span className="font-bold tabular-nums text-[var(--gold-hi)]">{clock}</span>}
      <Icon name="down" size={14} />
    </button>
  );
  return (
    // on the right, out of the way of building; left of the budget or bottleneck panel when one of those is open there
    <div className={`pointer-events-auto absolute ${game.panel ? 'right-[19.5rem]' : 'right-3'} top-[var(--hud-top,6rem)] z-20 w-[440px] max-w-[calc(100vw-1.5rem)] glass overflow-hidden`}>
      {!golf && <img src={stadiumArt} alt="" className="pointer-events-none absolute right-0 top-0 h-[128px] w-[192px] object-cover" style={{ maskImage: 'linear-gradient(to right, transparent, black 45%)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 45%)' }} />}
      <div className="relative p-3">
        <button className="btn-icon absolute right-2 top-2 z-10" title="Minimize the event (click the pill to show it again)" onClick={() => minimize(true)}><Icon name="up" size={16} /></button>
        <div className="flex items-start gap-2">
          <Icon name="trophy" size={34} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-bold tracking-wide text-[var(--gold-hi)] uppercase">{gv ? gv.tierName : 'Event: Stadium'}</span>
              <span className="rounded-md border border-[var(--gold-line)] px-1.5 text-[10px] font-bold uppercase text-[var(--gold-hi)]">{gv ? `T${gv.tier}` : `Level ${r.level}`}</span>
            </div>
            <span className="text-sm">{gv ? gv.month : `${r.year} – Run ${r.runs + 1}`}</span>
          </div>
        </div>
        <p className="mt-2 max-w-[15rem] text-xs text-slate-300">{sentence}</p>
        {r.stage === 'free' && last && <p className="text-[11px] text-slate-400">Last run: {last.arrived}/{last.sent * PARTY} {golf ? 'spectators' : 'fans'} arrived ({Math.round(last.rate * 100)}%)</p>}
        {r.stage === 'build' && (
          <div className="mt-2 space-y-2">
            <span className="block text-xl font-bold tabular-nums text-[var(--gold-hi)]">Build · {mmss(Math.ceil(r.buildLeft))}</span>
            <p className="text-xs text-slate-300">{crowd}</p>
            <p className="text-xs text-slate-400">upkeep {money(r.upkeep)} · toll {money(r.toll)}</p>
          </div>
        )}
        {r.stage === 'surge' && (
          <div className="mt-2 space-y-2">
            <span className="block text-xl font-bold tabular-nums text-[var(--gold-hi)]">{golf ? 'Tee-off' : 'Kick-off'} in {mmss(Math.ceil(r.surgeLeft))}</span>
            {r.surge && <SurgeTowns rows={liveRows(r.surge)} total={{ fans: r.surge.fans.reduce((a, b) => a + b, 0), sent: r.surge.sent.reduce((a, b) => a + b, 0) }} golf={golf} />}
            <p className="text-xs text-slate-300">{crowd}</p>
            <p className="text-xs text-slate-400">upkeep {money(r.upkeep)} · toll {money(r.toll)}</p>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <button className="btn flex-1 py-2 text-sm" onClick={() => game.goToSite()}><Icon name="calendar" size={18} />View Event</button>
          {r.stage === 'free' && !golf && <button className="btn-gold flex-1 py-2 text-sm" onClick={() => game.startRound()}><Icon name="start" size={18} />Start Event</button>}
          {r.stage === 'build' && <button className="btn-gold flex-1 py-2 text-sm" onClick={() => game.startNow()}><Icon name="start" size={18} />Start now</button>}
        </div>
      </div>
    </div>
  );
}

/** the evaluation screen (Phase 5 step 7b): a centred card over the map, shown in eval only. The arrival rate and its change, the towns, the money, the
 *  bottlenecks at kick-off (Go jumps there), and the draft of cards: picking one opens the way back to the valley (closeRound). No close button */
function EvalScreen({ game }: { game: Game }) {
 const r = game.traffic.round, last = r.last, golf = game.golfMode, gv = golf ? game.golfView() : null;
 if (!last) return null;
 const pct = Math.round(last.rate * 100), delta = last.prevRate === null ? null : pct - Math.round(last.prevRate * 100);
 const ye = golf ? game.golfYearEnd(last) : null;
 const book = ye ? computeTournamentCloseBook(ye, last.tickets ?? 0, game.courseAreaList(), last.upkeep, last.toll ?? 0) : null;
 return (
 <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
 <div className="pointer-events-auto max-h-full w-[560px] max-w-full space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-slate-200 shadow-2xl backdrop-blur">
 <div className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400/80">{gv ? `${gv.tierName} · ${last.run === 1 ? 'First' : 'Year ' + last.run} tournament` : `Stadium · Level ${last.level} · Run ${last.run}`}</div>
 {ye && (
 <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
 {ye.weather && (
 <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-slate-300">
 <span className="font-semibold text-amber-200">Weather: {ye.weather.icon} {ye.weather.label}</span>
 <span className="text-slate-400">{ye.weather.summary}</span>
 </div>
 )}
 <div className="grid grid-cols-4 gap-2 text-center">
 <div>
 <div className="text-[10px] uppercase text-slate-400">Satisfaction</div>
 <div className="text-base font-bold text-amber-200">{formatPercent(ye.satisfaction)}</div>
 <div className="text-[10px] text-slate-400" title="Measured from the crowd on the day; est.: estimated (no gates placed, or the cars are still leaving)">Q {Math.round(ye.facts.avgQueueMin)}m{ye.measured?.gates ? '' : ' est.'} · Exit {Math.round(ye.facts.exitP95Min)}m{ye.measured?.exit ? '' : ' est.'}</div>
 </div>
 <div>
 <div className="text-[10px] uppercase text-slate-400">Reputation</div>
 <div className="text-base font-bold text-white">
 {ye.prevRep} → <span className={ye.rep >= ye.prevRep ? 'text-emerald-400' : 'text-rose-400'}>{ye.rep}</span>
 </div>
 </div>
 <div>
 <div className="text-[10px] uppercase text-slate-400">Tent Takings</div>
 <div className="text-base font-bold text-emerald-300">{money(ye.tentRevenue ?? 0)}</div>
 </div>
 <div>
 <div className="text-[10px] uppercase text-slate-400">Next Year</div>
 <div className="text-xs font-semibold text-emerald-300">{ye.verdictText}</div>
 </div>
 </div>
          {ye.multiDay && ye.multiDay.resolvedDays > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2 text-center text-[11px] text-slate-300">
              <span className="font-semibold text-amber-300">{formatMultiDayStatus(ye.multiDay.liveDays, ye.multiDay.resolvedDays, ye.multiDay.practiceDays ?? 0)}</span> · Total {ye.multiDay.totalSpectators.toLocaleString()} spectators · {money(ye.multiDay.totalRevenue)} gross
            </div>
          )}
 </div>
 )}
 <div>
          <p><span className="text-4xl font-bold tabular-nums text-amber-200">{pct}%</span> <span className="text-sm text-slate-200">{golf ? 'of spectators in before tee-off' : 'of fans in before kick-off'}</span></p>
          <p className="text-xs text-slate-400">
            {delta === null ? (golf ? 'First tournament' : 'First run at this level')
              : delta > 0 ? <span className="tabular-nums text-emerald-300">▲ +{delta} points since the last run</span>
              : delta < 0 ? <span className="tabular-nums text-red-300">▼ −{-delta} points since the last run</span>
              : 'No change since the last run'}
          </p>
        </div>
        {golf ? (ye?.townGrowthText && <div className="rounded-lg bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-200">{ye.townGrowthText}</div>) : (last.perfect && <div className="rounded-lg bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-200">{`Perfect! The towns grow ${Math.round(TOWN_GROWTH * 100)}% and the stadium goes up to Level ${last.level + 1}`}</div>)}
        <div className="space-y-0.5 rounded-lg bg-white/5 p-2">
          {last.byTown.map((t, k) => (
            <p key={k} className="text-xs tabular-nums text-slate-300">Town {String.fromCharCode(65 + k)}  {t.fans}/{t.sent * PARTY} {golf ? 'spectators' : 'fans'} · stuck: on the road {t.late} · at the stop {t.atStop} · lost {t.lost}{t.byBus > 0 ? ` · by bus ${t.byBus}` : ''}</p>
          ))}
        </div>
        <p className="text-sm text-slate-200">
        {book ? (<>{book.toll > 0 && <>Toll <span className="tabular-nums text-emerald-300">{sgn(book.toll)}</span> · </>}Green fees <span className="tabular-nums text-emerald-300">{sgn(book.greenFeeIncome)}</span> · Memberships <span className="tabular-nums text-emerald-300">{sgn(book.membershipIncome)}</span> · Tickets <span className="tabular-nums text-emerald-300">{sgn(book.tickets)}</span> · Parking <span className="tabular-nums text-emerald-300">{sgn(book.parking)}</span> · Tents <span className="tabular-nums text-emerald-300">{sgn(book.tents)}</span>{book.sponsors > 0 && <> · Sponsors <span className="tabular-nums text-emerald-300">{sgn(book.sponsors)}</span></>}{book.tv > 0 && <> · TV <span className="tabular-nums text-emerald-300">{sgn(book.tv)}</span></>} · Purse <span className="tabular-nums text-red-300">−{money(book.purse)}</span> · Tent rent <span className="tabular-nums text-red-300">−{money(book.rent)}</span> · Tent upkeep <span className="tabular-nums text-red-300">−{money(book.annualTentUpkeep)}</span> · Course upkeep <span className="tabular-nums text-red-300">−{money(book.annualCourseUpkeep)}</span>{book.liveUpkeep > 0 && <> · Upkeep <span className="tabular-nums text-red-300">−{money(book.liveUpkeep)}</span></>} · Net <span className={`tabular-nums ${book.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{sgn(book.net)}</span></>) : (<>Toll <span className="tabular-nums text-emerald-300">{sgn(last.toll ?? 0)}</span>{last.tickets !== undefined && <> · Tickets <span className="tabular-nums text-emerald-300">{sgn(last.tickets)}</span></>} · Payout <span className={`tabular-nums ${last.payout < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{sgn(last.payout)}</span> · Upkeep <span className="tabular-nums text-red-300">−{money(last.upkeep)}</span> · Net <span className={`tabular-nums ${last.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{sgn(last.net)}</span></>)}
        </p>
        {last.stuck.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-100">Where they got stuck</p>
            {last.stuck.map((s, k) => (
              <div key={k} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-300">{s.label} <span className="tabular-nums text-slate-400">· {Math.round(s.loss / 60)} vehicle-min lost</span></span>
                <button className="chip" onClick={() => game.jumpTo(s.x, s.y)}>Go</button>
              </div>
            ))}
          </div>
        )}
        {r.draft && (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-100">Pick a card</p>
            <div className="grid grid-cols-3 gap-2">
              {r.draft.map(id => { const c = (golf ? findGolfCard(id) : undefined) ?? CARDS.find(q => q.id === id); if (!c) return null; return (
                <button key={id} className="flex flex-col rounded-xl border border-white/10 bg-white/5 p-3 text-left transition hover:border-amber-400/50 hover:bg-white/10" onClick={() => game.pickCard(id)}>
                  <span className="flex items-start justify-between gap-1">
                    <span className="text-sm font-semibold text-slate-100">{c.name}</span>
                    <span className={`shrink-0 rounded px-1 text-[9px] font-bold uppercase ${c.kind === 'unlock' ? 'bg-sky-400/20 text-sky-200' : 'bg-amber-400/20 text-amber-200'}`}>{c.kind === 'unlock' ? 'Unlock' : 'Upgrade'}</span>
                  </span>
                  <span className="mt-1 text-xs text-slate-400">{c.desc}</span>
                </button>
              ); })}
            </div>
          </div>
        )}
        {golf && (game.golf?.cards ?? r.cards).length > 0 && (
          <div className="space-y-1 rounded-lg bg-white/5 p-2 text-xs">
            <p className="font-semibold text-amber-200">Club cards</p>
            {(game.golf?.cards ?? r.cards).map((id, idx) => { const c: GolfCardDef | undefined = findGolfCard(id); return c ? <p key={`${id}-${idx}`} className="text-slate-300"><span className="font-semibold text-white">{c.name}</span> · <span className="text-slate-400">{c.desc}</span></p> : null; })}
          </div>
        )}
        <div className="flex items-center justify-end gap-3 pt-1">
          {r.draft && <span className="text-xs text-slate-400">Pick a card first</span>}
          <button className="chip chip-on disabled:cursor-not-allowed disabled:opacity-40" disabled={!!r.draft} onClick={() => game.closeRound()}>Back to the valley</button>
        </div>
      </div>
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
    <div className="absolute right-3 top-[var(--hud-top,6rem)] z-20 max-h-[calc(100vh-18rem)] w-72 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/85 p-3 shadow-lg backdrop-blur">
      <Panel title="Bottlenecks">
        <p className="mb-2 text-xs text-slate-400">Time lost in the last game hour or so, worst first</p>
        {top.length ? (
          <div className="space-y-0.5">
            {top.map((it, i) => {
              // the name looked up on the main thread: a junction by its node, a link by the road under its midpoint; the type text stays as the subtitle
              const name = it.kind === 'junction' ? game.junctionNameAt(it.x, it.y) : shortName(game.roadNameAt({ x: it.x, y: it.y }));
              return (
              <button key={it.kind + it.key} className="block w-full rounded-lg px-1.5 py-1 text-left hover:bg-white/10" onClick={() => game.jumpTo(it.x, it.y)} title="Jump there">
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right tabular-nums text-slate-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-100">{name || it.label}</span>
                  {it.kind === 'junction'
                    ? <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-slate-900" style={{ background: LOS_COL[it.los] }}>{it.los}</span>
                    : <span className="shrink-0 text-[10px] tabular-nums text-slate-300">v/c {it.vc.toFixed(2)}</span>}
                </div>
                {name ? <div className="pl-6 text-[10px] text-slate-500">{it.label}</div> : null}
                <div className="pl-6 text-[10px] text-slate-400">{(it.loss / 60).toFixed(1)} veh-min lost per hour{it.vc < 0.3 && (it.los === 'E' || it.los === 'F') ? <span className="text-amber-300"> · queued back from downstream</span> : it.vc >= 0.8 ? <span className="text-red-300"> · at capacity</span> : null}</div>
              </button>
              );
            })}
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
    <div className="pointer-events-none absolute bottom-[9.5rem] left-3 z-20 w-56 rounded-xl border border-white/10 bg-slate-950/80 p-2 text-[11px] text-slate-300 shadow-lg backdrop-blur">
      {ACCESS_LEGEND.map(([t, c]) => (
        <div key={t} className="flex items-center gap-2"><span className="inline-block h-2.5 w-3 rounded-sm" style={{ background: c }} />{t}</div>
      ))}
      <div className="mt-1 border-t border-white/10 pt-1 tabular-nums">+{game.growTot} lots started today, −{game.declTot} declining</div>
    </div>
  );
}
/** the heat map's bands, bottom-left above the hint bar (raised: above the access legend too; see Game.drawFlow) */
const HEAT_LEGEND: [string, string][] = [['Flowing — 75%+ of the speed limit', HEAT_COLS[0]!], ['Slow — 50–75%', HEAT_COLS[1]!], ['Heavy — 25–50%', HEAT_COLS[2]!], ['Stopped — under 25%', HEAT_COLS[3]!]];
/** the over-time view's gradient: the ramp of the congestion glow (HIST_RAMP, drawHeatHist) */
const HIST_GRADIENT = `linear-gradient(90deg, ${HIST_RAMP.map(c => `rgb(${c.join(',')})`).join(', ')})`;
/** the flow legend: the over-time view (time: the delay each road lost over about 6 game hours, a gradient) or the live bands */
function HeatLegend({ raised, time }: { raised: boolean; time: boolean }) {
  return (
    <div className={`pointer-events-none absolute ${raised ? 'bottom-[17rem]' : 'bottom-[9.5rem]'} left-3 z-20 w-64 rounded-xl border border-white/10 bg-slate-950/80 p-2 text-[11px] text-slate-300 shadow-lg backdrop-blur`}>
      {time ? <>
        <div className="mb-1 font-bold text-slate-100">Congestion · over time</div>
        <div className="h-2 w-full rounded-full" style={{ background: HIST_GRADIENT }} />
        <div className="mt-0.5 flex justify-between text-[10px] text-slate-300"><span>some delay</span><span>jams every day</span></div>
        <div className="mt-1 border-t border-white/10 pt-1 text-[10px] text-slate-400">where cars lost time over the last ~6 game hours</div>
      </> : <>
        <div className="mb-1 font-bold text-slate-100">Congestion · live</div>
        {HEAT_LEGEND.map(([t, c]) => (
          <div key={t} className="flex items-center gap-2"><span className="inline-block h-1 w-4 shrink-0 rounded-full" style={{ background: c }} />{t}</div>
        ))}
        <div className="mt-1 border-t border-white/10 pt-1 text-[10px] text-slate-400">speed against the limit, each direction; updated twice a second</div>
      </>}
    </div>
  );
}
/** the red line of the budget panel: the days in the red and the days left before bankruptcy (nothing when the books are fine) */
function debtDaysLine(d: number) {
  return d > 0 ? <p className="mt-2 text-xs text-red-300">In the red for {d} day{d === 1 ? '' : 's'}: bankrupt in {DEBT_DAYS - d} unless the books recover.</p> : null;
}
/** a panel: its title (with an icon, a header row with the icon in a gold-lined box and the one-line desc under the title) and its body */
function Panel({ title, children, icon, desc }: { title: string; children: React.ReactNode; icon?: IconName; desc?: string }) {
  if (!icon) return (<div><div className="font-display text-base font-bold text-amber-200 mb-2">{title}</div>{children}</div>);
  return (
    <div>
      <div className="mb-3 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--gold-line)] bg-black/30"><Icon name={icon} size={30} /></div>
        <div className="min-w-0">
          <div className="font-display text-lg font-bold">{title}</div>
          {desc && <div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">{desc}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

/** the road tool's size headers, in order: the town's (the Roads panel) */
const ROAD_FAMILIES: { id: Family; label: string; desc: string }[] = [
  { id: 'small', label: 'Small', desc: 'For residential areas and low traffic.' },
  { id: 'medium', label: 'Medium', desc: 'For higher traffic and main routes.' },
  { id: 'large', label: 'Large', desc: 'For major connections and high density.' },
  { id: 'rural', label: 'Rural', desc: 'Between the towns: shoulders, no sidewalks.' },
];
/** the course's headers (the Course menu's Paths & drives, T084): its cart paths, then its drives */
const COURSE_FAMILIES_UI: { id: Family; label: string; desc: string }[] = [
  { id: 'cart', label: 'Cart paths', desc: 'Walkers and carts: a walking path, dirt or cement slabs to start, upgrade to paved; on the 1 m half grid' },
  { id: 'course', label: 'Course drives', desc: 'Cars, one lane: start as gravel, upgrade to paved and avenue' },
];
/** the variant chip labels, by a variant's flags joined with dots ('' is the plain type) */
const VARIANT_LABEL: Record<string, string> = { '': 'Plain', tr: 'Trees', gr: 'Grass median', gd: 'Garden median', tl: 'Turn lane', 'tl.tr': 'Turn lane + trees', ow: 'One-way', 'ow.tr': 'One-way + trees' };
/** the variant chip icons, by the same flags */
const VARIANT_ICON: Record<string, IconName> = { '': 'road', tr: 'trees', gr: 'forest', tl: 'swap', 'tl.tr': 'swap', ow: 'oneway', 'ow.tr': 'oneway' };

/** the road tool's panel: the town's roads (scope town: the Roads menu) or the course's cart paths and drives (scope course: the Course menu's
 *  Paths & drives, T084); the same drawing, snapping and pricing either way */
function RoadPanel({ game, scope }: { game: Game; scope: 'town' | 'course' }) {
  const course = scope === 'course', families = course ? COURSE_FAMILIES_UI : ROAD_FAMILIES, types = course ? COURSE_TYPES : ROAD_TYPES;
  const legs = game.previewLegs(), block = game.routeBlock(legs);
  const len = game.net.legsLength(legs);
  const cost = game.routeCost(), comp = game.routeCompensation();
  const cls = game.cls, ui = game.toolUi(), adv = !ui || ui.advancedMode;
  /** the family the picked type lives in, and its name (shown on a collapsed header) */
  const curType = types.find(t => t.id === game.cls.base), curFam = curType?.family, curName = curType ? CLASS[curType.id]!.name : '';
  /** the open family: null = the picked type's family (the default), 'none' = all collapsed, else the family the player opened */
  const [openFam, setOpenFam] = useState<Family | 'none' | null>(null);
  const isOpen = (f: Family) => openFam === null ? f === curFam : openFam === f;
  return (
    <Panel title={course ? 'Paths' : 'Road Construction'} icon={course ? 'sidewalk' : 'road'} desc={course ? 'The streets of your course town: cart paths and drives, laid the way roads are built. Click to start, click again for each bend or stop. Points snap to junctions, paths, roads and the 1 m half grid of the course.' : 'Draw a connected route: click to start, click again for each bend or stop. Points snap to junctions, roads and the grid; crossings become junctions.'}>
      <div className="mt-2 flex flex-col gap-2">
        {families.map(f => { const ex = isOpen(f.id); return (
          <div key={f.id}>
            <button className="mb-1 flex w-full items-baseline gap-2 text-left" onClick={() => setOpenFam(ex ? 'none' : f.id)} aria-expanded={ex}>
              <span className="label-caps">{f.label}</span>
              <span className="min-w-0 flex-1 truncate text-[10px] text-[var(--muted)]">{f.desc}</span>
              {!ex && f.id === curFam && <span className="shrink-0 text-xs font-semibold text-[var(--gold)]">{curName}</span>}
              <Icon name={ex ? 'up' : 'down'} size={12} />
            </button>
            {ex && types.filter(t => t.family === f.id).map(t => {
              // a locked card: a course path held back by the unlock stage says so (T117), a course drive shows its tour level, a town class the
              // career milestone that unlocks it (greyed either way)
              const c = CLASS[t.id]!, open = game.classOpen(t.id), tier = courseTierNeeded(t.id), lk = open ? null : unlockOf('class', t.id), lock = open ? null : game.courseStageLock(t.id) ? '🔒 First hole' : tier !== null ? `🔒 Tour level ${tier}` : lk ? lockText(lk.pop) : '🔒', on = game.cls.base === t.id;
              return (
                <div key={`${f.id}-${t.id}`}>
                  <button className={`card mb-1 ${on ? 'card-on' : ''} ${lock ? 'opacity-50' : ''}`} onClick={() => game.pickType(t.id)} title={KEY_CLASSES.includes(t.id) ? `Key ${KEY_CLASSES.indexOf(t.id) + 1}` : 'No key: picked here'}>
                    <div className="flex w-full items-center gap-2.5">
                      <RoadThumb cls={c} w={84} h={36} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100">{c.name}</div>
                        <div className="text-[10px] text-[var(--muted)]">{[...c.desc.split(' · ').filter(p => /\d/.test(p)), c.noCars ? 'carts & walkers' : `${Math.round(speedOf(c, game.net.speedTier) * 3.6)} km/h`].join(' · ')}</div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-[var(--gold)]">{lock ?? `${money(c.cost)} / 2 m`}</span>
                    </div>
                  </button>
                  {on && VARIANTS[t.id].length > 1 && (
                    <div className="mb-1 ml-2 mt-1">
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        {VARIANTS[t.id].map(v => {
                          const vc = CLASS[v]!;
                          const fl = vc.flags.join('.');
                          return <button key={v} className={`chip ${game.roadClass === v ? 'chip-on' : ''}`} onClick={() => { game.roadClass = v; game.emit(); }}><Icon name={VARIANT_ICON[fl] ?? 'road'} size={14} />{VARIANT_LABEL[fl] ?? vc.name}</button>;
                        })}
                        <span className="ml-auto text-[10px] text-slate-500">Tab: flip</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">{money(game.cls.cost)} / 2 m · {game.cls.desc}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ); })}
      </div>
      {/* T084: the course's ladders; the Upgrade and Downgrade tools step a path or drive along them (they are the Roads menu's, for every road) */}
      {course && (
        <div className="mt-2 rounded-lg bg-white/5 p-2 text-[11px] text-slate-300">
          <div>Upgrade a path or drive one step (you pay only the difference): walking path → dirt path → cement slabs → paved cart path; gravel drive → paved → avenue.</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button className="chip" onClick={() => game.setTool('lane')} title="Upgrade tool (N)"><Icon name="up" size={14} />Upgrade</button>
            <button className="chip" onClick={() => game.setTool('downgrade')} title="Downgrade tool (Y)"><Icon name="down" size={14} />Downgrade</button>
          </div>
        </div>
      )}
      {/* T036: the fine tuning rows sit under Settings > Show every tool now (advanced); their hotkeys (Q, E, Tab) work from the engine either way */}
      {adv && <>
        <div className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Fine tuning</div>
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Bends</span>
          {([90, 45] as const).map(b => <button key={b} className={`chip ${game.bendMode === b ? 'chip-on' : ''}`} onClick={() => { game.bendMode = b; game.emit(); }} title="Q toggles">{b}°</button>)}
          <span className="ml-auto text-[10px] text-slate-500">Shift: straight line</span>
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Replace</span>
          <button className={`chip ${game.replaceMode ? 'chip-on' : ''}`} onClick={() => { game.replaceMode = !game.replaceMode; game.emit(); }} title="E toggles">{game.replaceMode ? 'On' : 'Off'}</button>
          <span className="ml-auto text-[10px] text-slate-500">Roads in the way are bulldozed</span>
        </div>
        {!course && <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Speed limits</span>
          {([0, 1, 2, 3] as const).map(t => { const open = t <= game.speedTierMax(); return <button key={t} className={`chip ${game.net.speedTier === t ? 'chip-on' : ''} ${open ? '' : 'opacity-50'}`} onClick={() => game.setSpeedTier(t)} title={open ? (t ? `Every road +${SPEED_BONUS_KMH[t]} km/h (up to 140)` : 'Each road its own limit') : `From ${SPEED_TIER_YEAR[t]}`}>{t ? `+${SPEED_BONUS_KMH[t]}` : 'Standard'}</button>; })}
        </div>}
        {cls.centre === 'style' && (
          <div className="mt-2 flex items-center gap-1">
            <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Centre line</span>
            {([['Dashed', 0], ['Double', 1], ['None', 2]] as const).map(([n, v]) => (
              <button key={v} className={`chip ${game.lineStyle === v ? 'chip-on' : ''}`} onClick={() => { game.lineStyle = v; game.emit(); }}>{n}</button>
            ))}
          </div>
        )}
      </>}
      <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">Route</span><span>{game.route.length} point{game.route.length === 1 ? '' : 's'} · {Math.round(len * 2)} m</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Cost</span><span className={cost + comp.comp > game.money ? 'text-red-300' : 'text-emerald-300'}>{money(cost)}</span></div>
        {comp.n > 0 && <div className="flex justify-between"><span className="text-slate-400">Compensation</span><span className="text-red-300">{money(comp.comp)} <span className="text-slate-500">({comp.n} building{comp.n === 1 ? '' : 's'})</span></span></div>}
        {block && <div className="mt-1 text-xs text-red-300">{block}</div>}
      </div>
      <div className="mt-2 flex gap-1">
        <button className="chip chip-on flex-1 disabled:opacity-40" disabled={game.route.length < 2} onClick={() => game.finishRoute()}>Build route ⏎</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.undoRoutePoint()} title="Backspace">Undo</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.cancelRoute()} title="Esc">Cancel</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Double-click the last point, press Enter or right-click to build. To widen or narrow a road, use Upgrade (N) or Downgrade (Y). Trees and small items in the way are cleared; buildings block the route.</p>
    </Panel>
  );
}

/** the Car park tool's modes: Rectangle (a car park by drag), Rows (bays laid along a drag) and On-street (parallel bays along a road's kerb) */
const PARK_MODES: { id: 'rect' | 'rows' | 'curb'; label: string }[] = [{ id: 'rect', label: 'Rectangle' }, { id: 'rows', label: 'Rows' }, { id: 'curb', label: 'On-street' }];

/** the car park tool: its mode and how to place with it, the parking fee, the lots and runs with their cars, the parks' cars (rectangles: the list; Go;
 *  a dev-only test of 50 cars) */
function ParkPanel({ game }: { game: Game }) {
  const views = game.traffic.parks, pk = game.parking, mode = pk.mode;
  return (
    <Panel title="Car park" icon="pin">
      <div className="flex flex-wrap gap-1">
        {PARK_MODES.map(m => <button key={m.id} className={`chip ${mode === m.id ? 'chip-on' : ''}`} onClick={() => { pk.mode = m.id; game.emit(); }}>{m.label}</button>)}
      </div>
      {mode === 'rect' && <>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          <b className="text-slate-100">Drag a rectangle beside a road.</b> The road along one of its sides is the frontage: the entrances go on it and the bays fill the rows along it. Cars park at the bays nearest an entrance first; when it is full, the rest are turned away. Roads cannot cross a car park, and bulldozing one refunds nothing.
        </p>
        <div className="mt-2 text-xs text-amber-300">{money(LOT_TILE_COST)} per tile</div>
      </>}
      {mode === 'rows' && <>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">Drag to lay a row of bays along the drag. Tab flips the side, Shift snaps the angle to 15°. Click a row to remove it.</p>
        <div className="mt-2 flex gap-1">{([90, 60, 45] as const).map(a => <button key={a} className={`chip ${pk.bay === a ? 'chip-on' : ''}`} onClick={() => { pk.bay = a; game.emit(); }}>{a}°</button>)}</div>
        <div className="mt-1 flex gap-1">{(['yellow', 'white'] as const).map(c => <button key={c} className={`chip ${pk.col === c ? 'chip-on' : ''}`} onClick={() => { pk.col = c; game.emit(); }}>{c === 'yellow' ? 'Yellow' : 'White'}</button>)}</div>
        <div className="mt-2 text-xs text-amber-300">{`$${ROW_BAY_COST} per bay`}</div>
      </>}
      {mode === 'curb' && <>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">Hover a road: the kerb on the pointer's side gets parallel bays. Roads with 2+ lanes that way give up their kerb lane; plain roads park on the shoulder. Click again to remove.</p>
        <div className="mt-2 text-xs text-amber-300">{`$${CURB_BAY_COST} per bay`}</div>
      </>}
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-200">
        <span>Parking fee per car</span>
        <button className="btn" onClick={() => pk.setFee(pk.fee - 1)}>−</button>
        <span className="tabular-nums">{`$${pk.fee}`}</span>
        <button className="btn" onClick={() => pk.setFee(pk.fee + 1)}>+</button>
      </div>
      <div className="mt-2 text-xs tabular-nums text-slate-200">{`${rowLots(pk.rows).length} lots · ${pk.curbs.length} on-street runs`}</div>
      {game.extraParks.map(p => { const v = views.find(q => q.id === p.id); return v ? <div key={p.id} className="text-xs tabular-nums text-slate-300">{`P · ${v.parked}/${v.bays}`}</div> : null; })}
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={game.showParkDemand} onChange={e => { game.setParkDemand(e.target.checked); game.emit(); }} />
        Show parking demand (cars per hour wanting a space)
      </label>
      {mode === 'rect' && <div className="mt-2 max-h-64 overflow-y-auto">
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
      </div>}
    </Panel>
  );
}

/** the business families in the panel's order */
const FAMILIES: BusinessType['family'][] = ['sports', 'leisure', 'tourism', 'transport', 'property'];

/** the business tool: the catalogue by family, in a scrollable list; each type's card (see BizCard) */
function BusinessPanel({ game }: { game: Game }) {
  const free = game.traffic.round.stage === 'free';
  return (
    <Panel title="Business" icon="buildings">
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {FAMILIES.map(f => (
          <div key={f}>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{f}</div>
            {BUSINESSES.filter(b => b.family === f && (b.id as string) !== 'clubhouse').map(b => <BizCard key={b.id} game={game} b={b} free={free} />)}
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** one type's card in the business panel: its name, cost, footprint (tiles, the most you may own) and blurb; each placed one as a row (level, satisfaction,
 *  revenue; Go to, Demolish: the stadium's only between rounds; a visit or fleet type's day so far below it); a Build button when it is open and under its most (it becomes the type in hand, the card
 *  highlighted); greyed, with its unlock, while it is not open */
function BizCard({ game, b, free }: { game: Game; b: BusinessType; free: boolean }) {
  const open = game.bizOpen(b.id), placed = game.bizDefs.filter(d => d.type === b.id), under = placed.length < b.max, sel = game.bizType === b.id;
  return (
    <div className={`mt-1 rounded-lg p-2 text-xs ${sel ? 'bg-amber-300/10 ring-1 ring-amber-300/60' : 'bg-white/5'} ${open ? '' : 'opacity-50'}`}>
      <img src={BUSINESS_THUMBS[BUSINESS_IMAGE[b.id]]} alt={b.name} className="mb-2 h-28 w-full rounded-md bg-slate-950/40 object-contain" loading="lazy" />
      <div className="flex justify-between"><b className="text-slate-100">{b.name}</b><span>{money(b.buildCost)}</span></div>
      <div className="flex justify-between text-slate-400"><span>{b.footprint.w} × {b.footprint.h} tiles · up to {b.max}</span></div>
      <p className="mt-1 leading-relaxed text-slate-300">{b.blurb}</p>
      {placed.map(d => {
        const v = game.traffic.biz.find(q => q.id === d.id) ?? freshStats(d.id);
        return (
          <div key={d.id} className="mt-1 border-t border-white/10 pt-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-emerald-300">{`L${v.level} · ${Math.round(v.sat * 100)}% · ${money(v.revenue)}`}</span>
              <div className="flex gap-2"><button className="btn" onClick={() => game.goToBusiness(d.id)}>Go to</button>
                <button className="btn" disabled={b.id === 'stadium' && !free} onClick={() => game.demolishBusiness(d.id)}>Demolish (+{money(b.buildCost / 2)})</button></div>
            </div>
            {b.kind === 'visit' && <div className="text-slate-400">{`Today: ${v.today.visitors} cars (${v.today.late} late, ${v.today.missed} missed) · ${money(v.today.revenue)} · ${v.goodDays} good days`}</div>}
            {b.kind === 'estate' && <div className="text-slate-400">{`Lots sold: ${v.visitors}/${ESTATE_LOTS} · last close +${v.today.visitors} (${money(v.today.revenue)})`}</div>}
            {b.kind === 'fleet' && <div className="text-slate-400">{`Today: ${v.today.visitors} ${b.id === 'taxi' ? 'rides' : 'riders'} · ${money(v.today.revenue)} · ${v.goodDays} good ${b.id === 'taxi' ? 'days' : 'rounds'}`}</div>}
          </div>
        );
      })}
      {open && (b.family === 'tourism' || b.id === 'casino') && <TouristLine game={game} />}
      {!open && <p className="mt-1 text-amber-200">{unlockText(b, game.ownedBiz())}</p>}
      {open && under && <button className="btn mt-2" onClick={() => game.selectBizType(b.id)}>{sel ? 'Selected' : 'Build'}</button>}
      {open && under && sel && <p className="mt-1 text-amber-200">Click open land to build it · R rotates</p>}
    </div>
  );
}

/** where the tourists come from: the highway entry at the map edge, and whether a road reaches it yet (within 12 tiles, as the city worker's
 *  ENTRY_REACH); Go to looks at it */
function TouristLine({ game }: { game: Game }) {
  const h = game.terrain.highway, open = h.x >= 0 && game.net.segsNear(h, 12).size > 0;
  if (h.x < 0) return null;
  return (
    <div className="mt-1 flex items-center justify-between gap-2 text-slate-400">
      <span>{open ? 'Tourists drive in from the highway entry' : 'Tourists come once a road reaches the highway entry at the map edge'}</span>
      <button className="btn shrink-0 whitespace-nowrap" onClick={() => game.lookAt(h.x, h.y)}>Go to</button>
    </div>
  );
}

/** the toll gate tool: how it works, the price per car (at the round's level), the booths a new gate has and its cost, and the list of toll gates (Go) */
function TollPanel({ game }: { game: Game }) {
  const price = tollPrice(game.traffic.round.level), cost = TOLL_BASE_COST + game.tollBooths * TOLL_BOOTH_COST;
  return (
    <Panel title="Toll gate" icon="swap">
      <p className="text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">Click a straight road.</b> The gate is a plaza across it: each car that passes a booth pays {money(price)}. Drivers avoid a toll road when a free way exists, so close the free ways. R flips the way in. Roads cannot cross the plaza; bulldozing it removes the gate (the road stays, no refund).
      </p>
      <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">Toll per car</span><span>{money(price)}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Booths per new gate</span><span>{game.tollBooths}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Cost of a new gate</span><span className={cost > game.money ? 'text-red-300' : 'text-emerald-300'}>{money(cost)}</span></div>
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto">
        {game.tollDefs.length === 0 && <p className="text-xs text-slate-400">No toll gates yet.</p>}
        {game.tollDefs.map(d => (
          <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-xs">
            <span className="tabular-nums text-slate-200">#{d.id} · {d.booths} booths</span>
            <button className="btn" onClick={() => game.goToToll(d.id)}>Go</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** the bus route tool: how a route works (fans walk to the lot stop, the buses carry them to the doors), its buses and seats, its cost (the first is
 *  free), and the routes (Go) */
function BusPanel({ game }: { game: Game }) {
  const cost = game.busDefs.length ? BUS_ROUTE_COST : 0;
  return (
    <Panel title="Bus route" icon="bus">
      <p className="text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">Click a road beside a car park, then a road near the stadium.</b> Fans walk from the bays to the stop and queue there; the buses carry them to the doors. Without a route they walk all the way. Esc cancels; with Bulldoze (X), click a stop to remove its route (no refund).
      </p>
      <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">Buses per new route</span><span>{game.busFleet}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Seats per bus</span><span>{game.busSeats}</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Cost of a new route</span><span className={cost > game.money ? 'text-red-300' : 'text-emerald-300'}>{cost ? money(cost) : 'free (the starting kit)'}</span></div>
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto">
        {game.busDefs.length === 0 && <p className="text-xs text-slate-400">No bus routes yet.</p>}
        {game.busDefs.map(d => (
          <div key={d.id} className="flex items-center justify-between gap-2 py-1 text-xs">
            <span className="tabular-nums text-slate-200">#{d.id} · {d.town !== undefined ? `town ${String.fromCharCode(65 + d.town)} lot stop` : `car park #${d.park}`} · {d.buses} buses · {d.seats} seats</span>
            <button className="btn" onClick={() => game.goToBus(d.id)}>Go</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** the game runs on the owner's PC (localhost): the HUD shows the Studio button, which opens the sprite studio on port 5179 of the same PC */
const ON_PC = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const STUDIO_URL = `${location.protocol}//${location.hostname}:5179/`;
/** the junction types the tool offers as brushes and in the Type control */
type JunctionKind = 'plain' | 'stop' | 'mini' | 'signal' | 'roundabout';
/** the segment and card names of the junction tool's types */
const SEG_NAME: Record<JunctionKind, string> = { plain: 'Plain', stop: 'All-way stop', mini: 'Mini-roundabout', signal: 'Lights', roundabout: 'Roundabout' };
/** the short labels of the selected junction's Type control */
const SEG_SHORT: Record<JunctionKind, string> = { plain: 'Plain', stop: '4-way stop', mini: 'Mini', signal: 'Lights', roundabout: 'Roundabout' };
/** the junction types the tool's brushes and the Type control offer, in the order the Tab flip goes */
const JUNCTION_KINDS: JunctionKind[] = ['plain', 'stop', 'mini', 'signal', 'roundabout'];
/** the one-line help under the Type control for the types with no options */
const KIND_HELP: Record<string, string> = { stop: 'Every approach stops; the car that waited longest goes first.', mini: 'A painted island; drivers give way to the circle and take turns.' };
/** the junction tool's panel: the brush cards (Select, then Plain, All-way stop, Mini-roundabout, Lights and Roundabout with its ring-lane chips), then the selected junction (SelectedJunction) */
function JunctionPanel({ game }: { game: Game }) {
  const b = game.brush, n = game.selectedNode();
  const hint = b === 'select' ? 'Hover a junction to outline it and click to select it. Tab flips the type under the pointer; Esc deselects, then returns to Select.'
    : b === 'plain' ? 'Click a junction to make it plain. Right-click resets a junction to plain (free).'
    : b === 'stop' ? 'Click a junction to make it an all-way stop. Right-click resets a junction to plain (free).'
    : b === 'mini' ? 'Click a junction to paint a mini-roundabout in it (arms of 2 lanes each way at most). Right-click resets a junction to plain.'
    : b === 'signal' ? 'Click a junction to install traffic lights (the best tier open this year). Right-click resets a junction to plain.'
    : `Click a junction or a bend to install a ${game.ringLanes}-lane roundabout. Right-click resets a junction to plain.`;
  // with a junction selected the brushes shrink to one row of chips, so the junction's own options fit (as the reference games keep the selection first)
  if (n) return (
    <Panel title="Junctions" icon="junction">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        {(['select', ...JUNCTION_KINDS] as const).map(t => <button key={t} className={`chip ${b === t ? 'chip-on' : ''}`} onClick={() => { game.brush = t; game.emit(); }}>{t === 'select' ? 'Select' : SEG_NAME[t]}</button>)}
      </div>
      <SelectedJunction game={game} n={n} />
    </Panel>
  );
  return (
    <Panel title="Junctions" icon="junction">
      <div className="mt-1 grid grid-cols-1 gap-1">
        <button className={`card ${b === 'select' ? 'card-on' : ''}`} onClick={() => { game.brush = 'select'; game.emit(); }}>
          <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">Select</span><span className="text-amber-300">free</span></div>
          <div className="text-[10px] text-slate-400">Click a junction to select it and set its type and options</div>
        </button>
        {JUNCTION_KINDS.map(t => {
          const lk = game.junctionOpen(t) ? null : unlockOf('junction', t)!, spec = JUNCTIONS.find(j => j.id === t)!, on = b === t;
          return (
            <div key={t} className="space-y-1">
              <button className={`card w-full ${on ? 'card-on' : ''} ${lk ? 'opacity-50' : ''}`} onClick={() => { game.brush = t; game.emit(); }}>
                <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">{SEG_NAME[t]}</span><span className="text-amber-300">{lk ? (game.eventMode ? 'Roundabout card' : lockText(lk.pop)) : spec.cost ? money(spec.cost) : 'free'}</span></div>
                <div className="text-[10px] text-slate-400">{spec.desc}</div>
              </button>
              {t === 'roundabout' && on && (
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-slate-400">Ring lanes:</span>
                  {([1, 2, 3] as const).map(k => <button key={k} className={`chip ${game.ringLanes === k ? 'chip-on' : ''}`} onClick={() => { game.ringLanes = k; game.emit(); }}>{k}{k > 1 ? ` (+${money((k - 1) * RING_LANE_COST)})` : ''}</button>)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">{hint}</p>
    </Panel>
  );
}
/** the selected junction: its name and roads, its type (a segmented control: Plain, 4-way stop, Mini, Lights, Roundabout, each with its price or the
 *  reason it cannot apply) and only the options of that type: Plain has wide corners and turn lanes; Lights has the slipways, wide corners, turn lanes
 *  and the signals (tier, upgrades, the fixed-time split); a roundabout has its ring lanes; a stop or a mini has no options, only its one-line help */
function SelectedJunction({ game, n }: { game: Game; n: Node }) {
  const lights = isLights(n), segs = JUNCTION_KINDS;
  const active = (t: JunctionKind) => (t === 'signal' ? lights : n.type === t);
  const blocked = segs.filter(t => !active(t)).map(t => game.installCheck(n, t, game.ringLanes).why).filter(Boolean);
  return (
    <div className="mt-2 space-y-2 border-t border-white/10 pt-2 text-xs">
      <div><div className="font-semibold text-slate-100">{game.junctionName(n) || 'Junction'}</div><div className="text-[11px] text-slate-400">{n.arms.length} roads{n.arms.length < 3 ? ' (a bend)' : ''}</div></div>
      <div>
        <div className="mb-1 text-[11px] text-slate-400">Type</div>
        <div className="flex gap-1">
          {segs.map(t => {
            const { cost } = game.installCheck(n, t, game.ringLanes);
            return <button key={t} className={`chip flex-1 ${active(t) ? 'chip-on' : ''}`} onClick={() => game.setSelectedType(t)}><span className="block">{SEG_SHORT[t]}</span><span className="block text-[10px] opacity-80">{active(t) ? 'now' : cost ? money(cost) : 'free'}</span></button>;
          })}
        </div>
        {blocked.map((w, i) => <p key={i} className="mt-1 text-[10px] text-amber-300">{w}</p>)}
        {KIND_HELP[n.type] && <p className="mt-1 text-[11px] text-slate-400">{KIND_HELP[n.type]}</p>}
      </div>
      {n.type === 'plain' && <div className="space-y-2"><FlagRow game={game} n={n} k="wide" /><FlagRow game={game} n={n} k="tl" /></div>}
      {lights && (
        <div className="space-y-2">
          <SlipRow game={game} n={n} />
          <FlagRow game={game} n={n} k="wide" />
          <FlagRow game={game} n={n} k="tl" />
          <div className="space-y-2 border-t border-white/5 pt-2"><div className="font-semibold text-slate-100">Signals</div><SignalsDetail key={`${n.x},${n.y}`} game={game} n={n} /></div>
        </div>
      )}
      {n.type === 'roundabout' && <RingRow game={game} n={n} />}
    </div>
  );
}
/** a flag option (wide corners, turn lanes): its price (or 'on'), what it does, why it cannot go on, and Add or Remove (removing is free) */
function FlagRow({ game, n, k }: { game: Game; n: Node; k: 'wide' | 'tl' }) {
  const on = k === 'wide' ? !!n.wide : !!n.tl, why = on ? '' : game.flagWhy(n, k);
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-slate-100">{k === 'wide' ? 'Wide corners' : 'Turn lanes'} <span className="text-[10px] text-amber-300">{on ? 'on' : money(FLAG_COST[k])}</span></div>
        <div className="text-[10px] text-slate-400">{k === 'wide' ? 'The corners take up to twice the speed' : 'The left lane takes left turns only (two-lane roads)'}</div>
        {why && <div className="text-[10px] text-amber-300">{why}</div>}
      </div>
      <button className={`chip ${on ? 'chip-on' : ''}`} disabled={!on && !!why} onClick={() => game.setFlag(n, k, !on)}>{on ? 'Remove' : 'Add'}</button>
    </div>
  );
}
/** the slipways of lights: how many of the corners that take one have one, and All and None (the + and × on the map do one corner at a time) */
function SlipRow({ game, n }: { game: Game; n: Node }) {
  const fit = junctionCorners(n).filter(c => c.fits), on = fit.filter(c => c.on).length, addCost = (fit.length - on) * SLIP_CORNER_COST;
  const why = fit.length ? (addCost > game.money ? 'Not enough money for all of them' : '') : slipRule(n);
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-slate-100">Slipways: {on} of {fit.length} corners <span className="text-[10px] text-amber-300">{money(SLIP_CORNER_COST)} a corner</span></div>
        <div className="text-[10px] text-slate-400">The + and × on the map add or remove one</div>
        {why && <div className="text-[10px] text-amber-300">{why}</div>}
      </div>
      <button className="chip" disabled={!fit.length || on === fit.length || addCost > game.money} onClick={() => game.setSlipways(n, fit.map(c => c.deg))}>All{addCost ? ` (${money(addCost)})` : ''}</button>
      <button className="chip" disabled={!on} onClick={() => game.setSlipways(n, [])}>None</button>
    </div>
  );
}
/** a roundabout's ring lanes: the chips (the current one marked; re-laning pays the difference, a fall is free) and the reason a change cannot go */
function RingRow({ game, n }: { game: Game; n: Node }) {
  const cur = n.rl ?? 1, opts = [1, 2, 3] as const, why = opts.filter(k => k !== cur).map(k => game.installCheck(n, 'roundabout', k).why).filter(Boolean)[0];
  return (
    <div className="space-y-1">
      <div className="text-slate-100">Ring lanes</div>
      <div className="flex gap-1">
        {opts.map(k => {
          const { cost } = game.installCheck(n, 'roundabout', k);
          return <button key={k} className={`chip flex-1 ${cur === k ? 'chip-on' : ''}`} disabled={cur === k} onClick={() => { game.ringLanes = k; game.setSelectedType('roundabout'); }}><span className="block">{k} lane{k > 1 ? 's' : ''}</span><span className="block text-[10px] opacity-80">{cur === k ? 'now' : cost ? `+${money(cost)}` : 'free'}</span></button>;
        })}
      </div>
      {why && <p className="text-[10px] text-amber-300">{why}</p>}
    </div>
  );
}

/** the lights' tier names (the Signals section of the selected junction; index = tier) */
const TIER_LABEL = ['Fixed-time lights', 'Actuated lights', 'Adaptive lights'];
/** the compass points (E first, counter-clockwise: north is up the map, so y grows south), and the same eight from north (for phase labels) */
const COMPASS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'], NORTH_FIRST = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** a signal phase's label: the compass names of the arms it serves, e.g. N–S */
function phaseLabel(n: Node, armPhase: number[], k: number): string {
  const names = new Set<string>();
  n.arms.forEach((a, i) => { if (armPhase[i] === k) names.add(COMPASS[(Math.round(Math.atan2(-a.dir.y, a.dir.x) / (Math.PI / 4)) + 8) % 8]!); });
  return [...names].sort((a, b) => NORTH_FIRST.indexOf(a) - NORTH_FIRST.indexOf(b)).join('–') || `Phase ${k + 1}`;
}
/** the selected lights: the tier, the fixed-time green split (a slider per phase, committed on release, with the cycle length) and the upgrades (paid, by year) */
function SignalsDetail({ game, n }: { game: Game; n: Node }) {
  const tier = n.sig ?? 1, plan = game.lanes.signals.get(n);
  const [draft, setDraft] = useState<number[] | null>(null);
  const greens = draft ?? plan?.greens ?? [], cycle = greens.reduce((s, g) => s + g, 0) + 5 * greens.length;
  /** the slider's release: the split is set (the lights become fixed-time) and the network commits, once */
  const release = () => { if (draft && plan && draft.some((g, k) => g !== plan.greens[k])) game.setSplit(n, draft); setDraft(null); };
  const up = (t: 1 | 2, label: string) => {
    const ok = game.signalTier() >= t;
    return <button className={`chip ${ok ? 'chip-on' : ''}`} disabled={!ok} onClick={() => game.upgradeSignal(t)}>{ok ? `Upgrade to ${label} (${money(UPGRADE_COST[t]!)})` : `${label[0]!.toUpperCase()}${label.slice(1)} lights from ${SIGNAL_TIER_YEAR[t]}`}</button>;
  };
  return (
    <div className="mt-2 space-y-2 text-xs">
      <div className="flex items-baseline justify-between gap-2"><span className="font-semibold text-slate-100">{TIER_LABEL[tier]}</span>{tier === 0 && plan && <span className="text-slate-400">cycle {cycle} s</span>}</div>
      {tier === 0 && plan && (
        <div className="space-y-1">
          {greens.map((g, k) => (
            <label key={k} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-slate-300">{phaseLabel(n, plan.armPhase, k)}</span>
              <input type="range" min={MIN_GREEN} max={GREEN_CAP} step={1} value={g} className="flex-1" onChange={e => { const d = [...greens]; d[k] = +e.target.value; setDraft(d); }} onPointerUp={release} onKeyUp={release} />
              <span className="w-10 text-right tabular-nums text-slate-200">{g} s</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {tier < 1 && up(1, 'actuated')}
        {tier < 2 && up(2, 'adaptive')}
      </div>
    </div>
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
    case 'road': return (g.route.length ? `Route: ${g.route.length} point(s) — click to extend, double-click, Enter or right-click to build, Backspace to undo, Esc to cancel, Shift for a straight 45° run` : `BUILDING NEW ROADS — Draw a connected route: click where the ${g.cls.name.toLowerCase()} should start${VARIANTS[g.cls.base]!.length > 1 ? ' · Tab flips the variant' : ''}`) + ' · E: replace';
    case 'junction': {
      const s = g.selectedNode(), h = g.hoverNode, what = g.brush === 'signal' ? 'traffic lights' : g.brush === 'roundabout' ? `a ${g.ringLanes}-lane roundabout` : g.brush === 'stop' ? 'an all-way stop' : g.brush === 'mini' ? 'a mini-roundabout' : 'plain';
      if (g.brush === 'select') return s ? 'Click a corner’s + or × to add or remove its slipway (lights) · Esc deselects, then returns to Select' : h ? 'Click to select this junction · Tab flips its type' : 'Hover a junction to outline it · click to select it · Tab flips the type';
      return h ? `Click to make this junction ${what} · right-click resets it to plain · Tab flips the type` : `Hover a junction (three or more roads; roundabouts also work on bends) to make it ${what} · Esc returns to Select`;
    }
    case 'lane': case 'downgrade': {
      const h = g.laneHover, up = g.tool === 'lane', head = up ? 'UPGRADE' : 'DOWNGRADE', rev = ' · Right-click a one-way road to reverse it';
      if (!h || !h.segs.length) return `${head} — hover a straight road: its run lights up; click to take it one size ${up ? 'up (you pay the difference)' : 'down (the difference is refunded)'}` + rev;
      return (h.why || `${head} — click to make this ${h.segs.length > 1 ? 'run' : 'road'} ${h.to!.name.toLowerCase()} ${h.cost < 0 ? `(refund ${money(-h.cost)})` : `for ${money(h.cost)}`}`) + rev; }
    case 'course': { const q = g.paint, ch = g.courseHint(); return q.mode === 'brush' ? `${ch ? `${ch} ·` : `COURSE (hole ${q.brushHole}, ${q.brushKind}):`} drag to paint · Alt-drag erases · [ ] size · 1–7 surfaces · Ctrl+Z undo` : q.mode === 'draw' ? `COURSE (hole ${q.brushHole}, ${q.brushKind} shape): click corners, double-click or Enter closes · Esc back to the brush · Ctrl+Z undo` : q.mode === 'hole' ? `COURSE: click to place ${q.holeSlot ? 'preset ' + q.holeSlot : 'a generated hole'} · R turns · Esc back to the brush` : q.mode === 'plant' ? `COURSE (plants: ${q.plantBrush}): drag to plant · Alt-drag removes what these brushes planted · [ ] size` : 'COURSE: pick a surface (1–7) to paint'; }
    case 'bulldoze': return 'Click objects or roads to remove them (roads refund their value)';
    case 'paint': return g.paint.mode === 'draw' ? (g.paint.pts.length ? `PAINT: ${g.paint.pts.length / 2} corner(s) — click the first corner, double-click or Enter to close · Backspace undoes · Esc cancels` : 'PAINT: click the corners of a shape, or press and drag to paint an outline freehand · Tab: Draw, Pick, Erase') : g.paint.mode === 'pick' ? 'PAINT: click an area to pick it and change its look · Page Up / Down moves it over / under (Shift: to the front / back) · Delete removes it · Esc: back to Draw · Tab: the next mode' : g.paint.mode === 'hole' ? 'GOLF HOLE: click to place (tee at the click) · R turns · Esc back to Draw' : g.paint.mode === 'brush' ? `BRUSH (${g.paint.brushKind}, hole ${g.paint.brushHole}): drag to paint · Alt-drag erases · [ ] size · Esc back to Draw` : g.paint.mode === 'plant' ? `PLANT (${g.paint.plantBrush}): drag to plant · Alt-drag removes what these brushes planted · [ ] size · Esc back to Draw` : 'PAINT: click an area to erase it';
    case 'select': return g.hoverRoad ? `${g.hoverRoad} · Drag to pan · scroll to zoom · WASD / arrows move the camera · R roads · J junctions · X bulldoze` : 'Drag to pan · scroll to zoom · WASD / arrows move the camera · R roads · J junctions · X bulldoze';
    case 'park': return g.parking.mode === 'rows' ? 'ROWS: drag along the ground to lay bays · Tab flips the side · Shift snaps 15° · click a row to remove it' : g.parking.mode === 'curb' ? 'ON-STREET: hover a road and click the kerb to park along it · click again to remove' : 'PARK: drag a rectangle beside a road · click a car park to remove it (no refund)';
    case 'toll': return 'TOLL GATE: click a straight road to put a plaza across it · R flips the way in · with Bulldoze (X), click a plaza to remove the gate (no refund)';
    case 'business': return `BUSINESS: click open land to build a ${BUSINESS[g.bizType].name.toLowerCase()} · R rotates${g.bizType === 'stadium' ? ' · the closer to the towns, the easier its traffic' : ''}`;
    case 'bus': return g.busPick ? 'BUS ROUTE: click a road near the stadium for the doors stop · Esc cancels' : 'BUS ROUTE: click a road beside a car park for the lot stop · with Bulldoze (X), click a stop to remove its route (no refund)';
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
          <li>Bends can be 90° or 45° (Q toggles); hold Shift to draw one straight run in any of the eight directions. Crossing an existing road makes a junction; to widen a road, use the Add lane tool.</li>
          <li><b>Junctions</b>: the tool's brush is Select, Plain, All-way stop, Mini-roundabout, Lights or Roundabout (1–3 ring lanes); a click with a type brush makes that junction the type, and right-click resets one to plain. Select a junction to set its type and options in the panel: wide corners and turn lanes, slipways on each corner (the + and × on the map; they need long approaches), the signal tier with its upgrades and the fixed-time green split, or the roundabout's ring lanes. Tab flips the junction under the pointer through the types; Esc deselects, then returns to Select.</li>
          <li>The town pays property tax (more on better roads, less where traffic jams) and business takings for every customer who arrives on time; roads and signals cost upkeep. Click the treasury for the books and loans; five days in the red and you are bankrupt. Everything autosaves in this browser.</li>
          <li><b>Signals</b> (Junctions tool, a lit junction selected): new lights take the best tier open in the year (fixed-time; actuated loop detectors from 1990, adaptive from 2000, paid upgrades). Set each phase's green time in the panel or upgrade; the year shows beside the event's run.</li>
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
