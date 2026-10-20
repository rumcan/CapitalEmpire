import rockyDirt from './assets/ground/rocky-dirt.webp';
import rockyDirtAlt from './assets/ground/rocky-dirt-alt.webp';
import type { Game } from './game/engine';
import { BORDER_TEXES, BORDER_W, PAINT_TEXES, edgeAngle, type BorderSize } from './game/paint';
import type { PaintMode } from './game/paint-tool';

const MODES: { id: PaintMode; label: string }[] = [{ id: 'draw', label: 'Draw' }, { id: 'pick', label: 'Pick' }, { id: 'erase', label: 'Erase' }];
const DIRT_SWATCHES: Record<string, string> = { rockyDirt, rockyDirtAlt };
const swatch = (t: { id: string; col: string }) => ({ backgroundColor: t.col, backgroundImage: DIRT_SWATCHES[t.id] ? `url(${DIRT_SWATCHES[t.id]})` : undefined, backgroundSize: 'cover' });
const BORDERS = ['None', 'Small', 'Medium', 'Large'];

/** the Paint tool's panel: mode, texture, scale, angle, border and the snap setting (docs/PAINT-TOOL.md) */
export function PaintPanel({ game }: { game: Game }) {
  const p = game.paint, s = p.style;
  const picked = p.mode === 'pick' && p.selected ? p.areas.find(a => a.id === p.selected) : undefined;
  const pts = picked ? picked.pts : p.pts;
  const help = p.mode === 'draw'
    ? 'Click corners; click the first one (or double-click / Enter) to close. Or press and drag to paint an outline freehand.'
    : p.mode === 'pick'
      ? (p.selected ? `Area #${p.selected}: the settings below change it. Delete removes it.` : 'Click an area to pick it.')
      : 'Click an area to remove it.';
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Paint</div>
      <div className="mt-2 text-[11px] text-slate-400">Mode</div>
      <div className="flex flex-wrap gap-1">
        {MODES.map(m => <button key={m.id} className={`chip ${p.mode === m.id ? 'chip-on' : ''}`} onClick={() => p.setMode(m.id)}>{m.label}</button>)}
      </div>
      <div className="mt-1 text-xs text-slate-300">{help}</div>
      <div className="mt-2 text-[11px] text-slate-400">Texture</div>
      <div className="flex flex-wrap gap-1">
        {PAINT_TEXES.map(t => <button key={t.id} className={`chip ${s.tex === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ tex: t.id })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(t)} />{t.name}</button>)}
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Scale</div>
      <div className="flex items-center gap-1">
        <button className="btn" onClick={() => p.setStyle({ scale: s.scale / 1.25 })}>−</button>
        <span className="w-12 text-center text-xs text-slate-200">{`${Math.round(s.scale * 100)}%`}</span>
        <button className="btn" onClick={() => p.setStyle({ scale: s.scale * 1.25 })}>+</button>
        <button className="btn" onClick={() => p.setStyle({ scale: 1 })}>Reset</button>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Angle</div>
      <div className="flex items-center gap-2">
        <input type="range" min={-90} max={90} step={5} value={s.angle} onChange={e => p.setStyle({ angle: +e.target.value })} className="flex-1" />
        <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(s.angle)}°`}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <button className={`chip ${s.angle === 0 ? 'chip-on' : ''}`} onClick={() => p.setStyle({ angle: 0 })}>Grid 0°</button>
        <button className={`chip ${s.angle === 45 ? 'chip-on' : ''}`} onClick={() => p.setStyle({ angle: 45 })}>45°</button>
        <button className="chip disabled:opacity-40" disabled={pts.length < 4} onClick={() => p.setStyle({ angle: edgeAngle(pts) })}>Along first edge</button>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Border</div>
      <div className="flex flex-wrap gap-1">
        {BORDERS.map((n, i) => <button key={n} className={`chip ${s.border === i ? 'chip-on' : ''}`} title={`${BORDER_W[i]! * 2} m`} onClick={() => p.setStyle({ border: i as BorderSize })}>{n}</button>)}
      </div>
      {s.border > 0 && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">Border texture</div>
          <div className="flex flex-wrap gap-1">
            {BORDER_TEXES.map(t => <button key={t.id} className={`chip ${s.btex === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ btex: t.id })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(t)} />{t.name}</button>)}
          </div>
        </>
      )}
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-200">
        <input type="checkbox" checked={p.snap} onChange={e => { p.snap = e.target.checked; game.emit(); }} />
        Snap corners to the grid
      </label>
      <div className="mt-2 text-[11px] text-slate-400">{`${p.areas.length} painted area(s) · free (decoration)`}</div>
    </div>
  );
}
