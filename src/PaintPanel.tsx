import rockyDirt from './assets/ground/rocky-dirt.webp';
import rockyDirtAlt from './assets/ground/rocky-dirt-alt.webp';
import type { Game } from './game/engine';
import { BORDER_TEXES, BORDER_W, BRUSH_PRESETS, PAINT_TEXES, RADIUS_MAX, edgeAngle, type BorderSize } from './game/paint';
import type { PaintMode } from './game/paint-tool';
import { areaBuildCost } from './game/golf/costs';

const MODES: { id: PaintMode; label: string }[] = [{ id: 'draw', label: 'Draw' }, { id: 'pick', label: 'Pick' }, { id: 'erase', label: 'Erase' }, { id: 'hole', label: 'Golf hole' }, { id: 'brush', label: 'Brush' }];
const DIRT_SWATCHES: Record<string, string> = { rockyDirt, rockyDirtAlt };
const swatch = (t: { id: string; col: string }) => ({ backgroundColor: t.col, backgroundImage: DIRT_SWATCHES[t.id] ? `url(${DIRT_SWATCHES[t.id]})` : undefined, backgroundSize: 'cover' });
const BORDERS = ['None', 'Small', 'Medium', 'Large'];
const TONES: { id: 0 | 1 | 2; label: string }[] = [{ id: 0, label: 'None' }, { id: 1, label: 'Darker' }, { id: 2, label: 'Lighter' }];
/** the style change for a tone chip: switching to Lighter turns a black tint white, to Darker a white tint black (other tints are kept) */
const toneStyle = (tone: 0 | 1 | 2, tint: string) => ({ tone, tint: tone === 2 && tint === '#000000' ? '#ffffff' : tone === 1 && tint === '#ffffff' ? '#000000' : tint });

/** the Paint tool's panel: mode, texture, scale, angle, border and the snap setting (docs/PAINT-TOOL.md) */
export function PaintPanel({ game }: { game: Game }) {
  const p = game.paint, s = p.style;
  const picked = p.selected ? p.areas.find(a => a.id === p.selected) : undefined;
  const pts = picked ? picked.pts : p.pts;
  const br = p.brush[p.brushKind], brushName = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '';
  const help = p.mode === 'brush'
    ? `Drag to paint ${brushName} for hole ${p.brushHole}; strokes of the same kind on a hole join into one area. Alt-drag or Rub out erases. [ and ] change the size. The texture and border settings below edit this preset (remembered).`
    : p.mode === 'hole'
    ? 'Click to place a golf hole, its tee at the click. R turns it. Every piece is an ordinary painted area (Pick to edit, Erase to remove); the flag and plants are props (Bulldoze).'
    : p.selected
    ? `Area #${p.selected}: drag its handles to reshape or move it; the settings below change it. Delete removes it (a corner under the pointer goes first).`
    : p.mode === 'draw'
      ? 'Click corners; click the first one (or double-click / Enter) to close. Or press and drag to paint an outline freehand.'
      : p.mode === 'pick'
        ? 'Click an area to pick it.'
        : 'Click an area to remove it.';
  return (
    <div>
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Paint</div>
      <div className="mt-2 text-[11px] text-slate-400">Golf brush</div>
      <div className="flex flex-wrap gap-1">
        {BRUSH_PRESETS.map(b => <button key={b.kind} className={`chip ${p.mode === 'brush' && p.brushKind === b.kind ? 'chip-on' : ''}`} onClick={() => p.setBrush(b.kind)}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(PAINT_TEXES.find(t => t.id === b.style.tex)!)} />{b.name}</button>)}
      </div>
      {game.golfMode && (  
 <>  
 <div className="mt-2 text-[11px] text-slate-400">Planting method</div>  
 <div className="flex flex-wrap gap-1">  
 <button className={`chip ${p.plantKind === 'seed' ? 'chip-on' : ''}`} onClick={() => { p.plantKind = 'seed'; game.emit(); }}>Seed (grows in)</button>  
 <button className={`chip ${p.plantKind === 'sod' ? 'chip-on' : ''}`} onClick={() => { p.plantKind = 'sod'; game.emit(); }}>Sod (instant, 3–5× cost)</button>  
 </div>  
 </>  
 )}  
 <div className="mt-2 text-[11px] text-slate-400">Mode</div>
      <div className="flex flex-wrap gap-1">
        {MODES.map(m => <button key={m.id} className={`chip ${p.mode === m.id ? 'chip-on' : ''}`} onClick={() => m.id === 'brush' ? p.setBrush(p.brushKind) : p.setMode(m.id)}>{m.label}</button>)}
      </div>
      <div className="mt-1 text-xs text-slate-300">{help}</div>
      {p.mode === 'brush' && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">Hole</div>
          <div className="flex items-center gap-1">
            <button className="btn" onClick={() => { p.brushHole = Math.max(1, p.brushHole - 1); game.emit(); }}>−</button>
            <span className="w-12 text-center text-xs text-slate-200">{p.brushHole}</span>
            <button className="btn" onClick={() => { p.brushHole = Math.min(18, p.brushHole + 1); game.emit(); }}>+</button>
          </div>
          <div className="mt-2 text-[11px] text-slate-400">Brush size</div>
          <div className="flex items-center gap-2">
            <input type="range" min={0.5} max={20} step={0.5} value={br.r} onChange={e => p.setBrushR(+e.target.value)} className="flex-1" />
            <span className="w-16 text-right text-xs text-slate-200">{`${br.r} tiles`}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button className={`chip ${p.rubOut ? 'chip-on' : ''}`} onClick={() => { p.rubOut = !p.rubOut; game.emit(); }}>Rub out</button>
          </div>
        </>
      )}
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
      <div className="mt-2 text-[11px] text-slate-400">Corners</div>
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={RADIUS_MAX} step={0.25} value={s.radius} onChange={e => p.setStyle({ radius: +e.target.value })} className="flex-1" />
        <span className="w-14 text-right text-xs text-slate-200">{s.radius === 0 ? 'Sharp' : `${s.radius * 2} m`}</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Tone</div>
      <div className="flex flex-wrap gap-1">
        {TONES.map(t => <button key={t.id} className={`chip ${s.tone === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle(toneStyle(t.id, s.tint))}>{t.label}</button>)}
      </div>
      {s.tone > 0 && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">Strength</div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={100} step={5} value={Math.round(s.toneAmt * 100)} onChange={e => p.setStyle({ toneAmt: +e.target.value / 100 })} className="flex-1" />
            <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(s.toneAmt * 100)}%`}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-200">
            Tint
            <input type="color" value={s.tint} onChange={e => p.setStyle({ tint: e.target.value })} className="h-6 w-10 cursor-pointer bg-transparent" />
          </div>
        </>
      )}
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
      <div className="mt-2 text-[11px] text-slate-400">{game.golfMode ? (p.outline().length >= 6 ? `Estimated cost: $${Math.round(areaBuildCost(p.outline(), s.tex, p.plantKind)).toLocaleString()} (${p.plantKind}) · ${p.areas.length} area(s)` : `${p.areas.length} painted area(s)`) : `${p.areas.length} painted area(s) · free (decoration)`}</div>
      </div>
      );
     }
