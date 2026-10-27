import type { Game } from '../game/engine';
import { GROUND_MATERIALS, GRASS_ACTION_NAME, GRASS_COST, type GrassAction, type GrassSettings } from '../game/ext/grass-management';
import { ToolHead } from './ToolHead';
export { GRASS_ACTION_NAME };

/** Local grass inspection and paid care; all radii in 2 m tiles, doses normalized 0..1. Docked: Greenkeeping's panel in the rail's panel (golf
 *  games, T175: pick a care, then each click on the turf applies it); else the floating Grass panel (the classic game's) */
export function GrassManagementPanel({ game, docked = false }: { game: Game; docked?: boolean }) {
  const s = game.grass.settings, point = game.grassTarget, cell = point && game.grass.at(point.x, point.y), scope = game.grassScope();
  const edit = (f: () => void) => { f(); game.emit(); };
  const slider = (label: string, key: keyof Pick<GrassSettings, 'strength' | 'recovery' | 'wear' | 'rain' | 'evaporation' | 'temperature'>, min: number, max: number, step: number) => <label className="block text-xs">{label}: {s[key].toFixed(2)}<input className="w-full" type="range" min={min} max={max} step={step} value={s[key]} onChange={e => game.tuneGrass({ [key]: +e.target.value })} /></label>;
  // a plain call, not a component: the subtree keeps its identity across renders (a slider being dragged keeps its focus)
  const wrap = (children: React.ReactNode) => docked
    ? <div className="tp space-y-3" data-panel="greenkeeping"><ToolHead icon="trees" title="Greenkeeping" desc="Keep the course's turf: pick a care, then click the turf" />{children}</div>
    : <section data-testid="grass-panel" className="pointer-events-auto absolute right-3 top-[var(--hud-top,6rem)] z-30 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-80 space-y-3 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/95 p-4 text-slate-100 shadow-2xl">
      <div className="flex items-center justify-between"><strong>Grass care</strong><button onClick={() => edit(() => { game.grassPanel = false; game.grassAction = null; })}>Close</button></div>{children}</section>;
  return wrap(<>
    <p className="text-xs text-slate-300">{docked ? 'Pick a care below, then click the turf: each click applies it there (Esc puts it down). With none picked, a click inspects. Right-drag pans. Cells cover 8 × 8 m.' : 'Click turf to inspect. Arm an operation to apply it on each click. Right-drag pans. Cells cover 8 × 8 m.'}</p>
    {s.strength === 0 && <p className="text-xs text-slate-300">Existing grass appearance is preserved. Turn on health colours or raise Condition layer below to see maintenance overlays.</p>}
    <div className="flex gap-3 text-xs"><label><input type="checkbox" checked={s.enabled} onChange={e => game.tuneGrass({ enabled: e.target.checked })} /> Enable care</label><label><input type="checkbox" checked={game.grassHeat} onChange={e => edit(() => { game.grassHeat = e.target.checked; game.tuneGrass({}); })} /> Health colours</label></div>
    <p className="text-xs">{game.grass.activeCells.toLocaleString()} managed cells · {game.grass.days.toFixed(1)} turf days</p>
    {cell ? <><p className="text-sm capitalize">{cell.surface.replace(/-/g, ' ')} · {cell.condition}</p><div className="grid grid-cols-2 gap-1 text-xs">{(['health', 'coverage', 'moisture', 'nutrients', 'compaction', 'growth', 'foot', 'carts', 'divots'] as const).map(k => <span key={k}>{k}: {Math.round(cell[k] * 100)}%</span>)}</div></> : <p className="text-xs text-amber-200">Select a painted grass area or town lawn.</p>}
    <label className="block text-xs">Scope<select className="mt-1 w-full bg-slate-800 p-1" value={game.grassArea ? 'area' : 'radius'} onChange={e => edit(() => { game.grassArea = e.target.value === 'area'; })}><option value="radius">Radius around clicked point</option><option value="area">Clicked grass polygon</option></select></label>
    {!game.grassArea && <label className="block text-xs">Radius: {game.grassRadius * 2} m<input className="w-full" type="range" min="2" max="64" step="2" value={game.grassRadius} onChange={e => edit(() => { game.grassRadius = +e.target.value; })} /></label>}
    <label className="block text-xs">Care dose: {Math.round(game.grassDose * 100)}%<input className="w-full" type="range" min="0.1" max="1" step="0.1" value={game.grassDose} onChange={e => edit(() => { game.grassDose = +e.target.value; })} /></label>
    <label className="block text-xs">Mowing direction: {game.grassAngle}°<input className="w-full" type="range" min="0" max="165" step="15" value={game.grassAngle} onChange={e => edit(() => { game.grassAngle = +e.target.value; })} /></label>
    <div className="grid grid-cols-2 gap-2">{(Object.keys(GRASS_COST) as GrassAction[]).map(action => <button key={action} className={`rounded border p-2 text-xs capitalize ${game.grassAction === action ? 'border-emerald-400 bg-emerald-900' : 'border-white/20'}`} aria-pressed={game.grassAction === action} data-action={action} onClick={() => edit(() => { game.grassAction = game.grassAction === action ? null : action; })}>{GRASS_ACTION_NAME[action]}{scope ? ` · $${game.grass.quote(action, scope, game.grassDose)}` : ''}</button>)}<button className="rounded border border-white/20 p-2 text-xs" disabled={!game.grassAction || !scope} onClick={() => game.grassAction && game.careGrass(game.grassAction)}>Apply here</button></div>
    <button className="text-xs underline" onClick={() => game.markGrassDivot()} disabled={!cell}>Mark one player divot here</button>
    <details><summary className="cursor-pointer text-xs">Appearance and weather tuning</summary><div className="mt-2 space-y-2">
      <label className="block text-xs"><input type="checkbox" checked={s.mowing} onChange={e => game.tuneGrass({ mowing: e.target.checked })} /> Temporary care mowing marks (preset stripes stay unchanged)</label>
      <label className="block text-xs">Condition material<select className="mt-1 w-full bg-slate-800 p-1" value={s.material} onChange={e => game.tuneGrass({ material: e.target.value })}><option value="auto">Automatic from local grass condition</option>{GROUND_MATERIALS.map(m => <option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
      <p className="text-xs text-slate-400">Optional generated materials load when installed. Existing textures remain underneath; unavailable materials use a condition tint.</p>
      {slider('Condition layer', 'strength', 0, 1, 0.05)}{slider('Recovery rate', 'recovery', 0, 5, 0.1)}{slider('Traffic wear rate', 'wear', 0, 5, 0.1)}{slider('Daily rain / soil capacity', 'rain', 0, 0.5, 0.01)}{slider('Daily evaporation / soil capacity', 'evaporation', 0, 0.3, 0.005)}{slider('Temperature °C', 'temperature', -10, 45, 1)}
      <p className="text-xs text-slate-400">Tournament weather adds rain, storm or heat effects. Mowing presets and base grass remain editable in Studio.</p>
    </div></details>
  </>);
}
