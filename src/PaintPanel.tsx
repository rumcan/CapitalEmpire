import { useState, type ReactNode } from 'react';
import rockyDirt from './assets/ground/rocky-dirt.webp';
import rockyDirtAlt from './assets/ground/rocky-dirt-alt.webp';
import type { Game } from './game/engine';
import { BORDER_MENU, MENU_TEXES, RADIUS_MAX, borderW, edgeAngle } from './game/paint';
import { BORDER_STEPS, CourseEdges, borderLabel, paintBorderAt, paintBorderPos } from './ui/course/CourseEdges';
import { BORDER_KINDS, GRID_KINDS, type PaintMode } from './game/paint-tool';
import { paintedSwatch } from './game/painted-surfaces-live';
import { areaBuildCost } from './game/golf/costs';
import { LIBRARY } from './game/library';
import { PLANT_KINDS, PLANT_R, PLANT_SIZE, PLANT_SPACING } from './game/plant';
import { Thumb } from './ui/Thumb';

const MODES: { id: PaintMode; label: string }[] = [{ id: 'draw', label: 'Draw' }, { id: 'pick', label: 'Pick' }, { id: 'erase', label: 'Erase' }];
const DIRT_SWATCHES: Record<string, string> = { rockyDirt, rockyDirtAlt };
/** a texture's swatch style: its painted look (its colour and near painting, painted-surfaces-live.ts), else the colour, or the dirt picture over it */
export const swatch = (t: { id: string; col: string }) => {
  const p = paintedSwatch(t.id);
  if (p) return { backgroundColor: p.col, backgroundImage: p.img ? `url(${p.img})` : undefined, backgroundSize: '400%', backgroundPosition: 'center' };
  return { backgroundColor: t.col, backgroundImage: DIRT_SWATCHES[t.id] ? `url(${DIRT_SWATCHES[t.id]})` : undefined, backgroundSize: 'cover' };
};
/** whether a texture is laid with its painted look in this game (its angle then does nothing: a painted look is never turned, its light stays upper right) */
const paintedTex = (game: Game, id: string) => game.grassArt === 'painted' && !!paintedSwatch(id);
const LIB_BY_ID = new Map(LIBRARY.map(it => [it.id, it]));
/** a texture's plain name for the menus (P23 P1-E): the owner's preset names as saved in the studio ("Golf - Green", "Path_worn", "sand",
 *  "First Cut") read as words ("Green", "Worn path", "Sand", "First cut"): a "Golf -" prefix goes, underscores become spaces, a trailing
 *  adjective moves to the front, and the name is in sentence case */
export function plainName(name: string): string {
  let s = name.replace(/^\s*golf\s*[-–:]\s*/i, '').replace(/_+/g, ' ').replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();
  const m = /^(\S+) (worn|old|dry|wet|dark|light|new|cracked|stained)$/i.exec(s); if (m) s = `${m[2]} ${m[1]}`;
  s = s.toLowerCase();
  return s ? s[0]!.toUpperCase() + s.slice(1) : name;
}
const TONES: { id: 0 | 1 | 2; label: string }[] = [{ id: 0, label: 'None' }, { id: 1, label: 'Darker' }, { id: 2, label: 'Lighter' }];
/** the style change for a tone chip: switching to Lighter turns a black tint white, to Darker a white tint black (other tints are kept) */
const toneStyle =(tone: 0 | 1 | 2, tint: string) => ({ tone, tint: tone === 2 && tint === '#000000' ? '#ffffff' : tone === 1 && tint === '#ffffff' ? '#000000' : tint });

/** the Paint tool's panel: plants, mode, and the style editor (docs/PAINT-TOOL.md) */
export function PaintPanel({ game }: { game: Game }) {
  const p = game.paint;
  const pk = PLANT_KINDS.find(k => k.kind === p.plantBrush)!;
  const help = p.mode === 'plant'
    ? `Drag to plant ${pk.name.toLowerCase()} inside the circle, spaced apart, skipping roads, buildings and other props; going over a spot again fills it in. Alt-drag or Rub out removes only what these brushes planted. [ and ] change the size.`
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
      <div className="mt-2 text-[11px] text-slate-400">Plants</div>
      <div className="flex flex-wrap gap-1">
        {PLANT_KINDS.map(k => <button key={k.kind} className={`chip ${p.mode === 'plant' && p.plantBrush === k.kind ? 'chip-on' : ''}`} onClick={() => p.setPlant(k.kind)}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: k.col }} />{k.name}</button>)}
      </div>
      {game.golfMode && p.mode !== 'plant' && (
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
        {MODES.map(m => <button key={m.id} className={`chip ${p.mode === m.id ? 'chip-on' : ''}`} onClick={() => p.setMode(m.id)}>{m.label}</button>)}
      </div>
      <div className="mt-1 text-xs text-slate-300">{help}</div>
      {p.mode === 'plant' && <PlantControls game={game} />}
      {p.mode !== 'plant' && <StyleEditor game={game} />}
    </div>
  );
}

/** the plant brush's controls: size, spacing, the plant sizes, which plants are picked, Rub out and the count (shown in plant mode) */
export function PlantControls({ game }: { game: Game }) {
  const p = game.paint, ps = p.plant[p.plantBrush], pk = PLANT_KINDS.find(k => k.kind === p.plantBrush)!, pool = game.plantPool(p.plantBrush), plantPicked = new Set(ps.ids ?? pool.map(x => x.id));
  const togglePick = (id: string) => { const next = new Set(plantPicked); if (next.has(id)) next.delete(id); else next.add(id); p.setPlantSet({ ids: pool.map(x => x.id).filter(x => next.has(x)) }); };
  return (
    <>
      <div className="mt-2 text-[11px] text-slate-400">Brush size</div>
      <div className="flex items-center gap-2">
        <input type="range" min={PLANT_R[0]} max={PLANT_R[1]} step={0.5} value={ps.r} onChange={e => p.setPlantSet({ r: +e.target.value })} className="flex-1" />
        <span className="w-16 text-right text-xs text-slate-200">{`${ps.r} tiles`}</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Spacing (the gap between plants)</div>
      <div className="flex items-center gap-2">
        <input type="range" min={PLANT_SPACING[0]} max={PLANT_SPACING[1]} step={0.5} value={ps.spacing} onChange={e => p.setPlantSet({ spacing: +e.target.value })} className="flex-1" />
        <span className="w-16 text-right text-xs text-slate-200">{`${ps.spacing * 2} m`}</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Smallest plant (of its normal size)</div>
      <div className="flex items-center gap-2">
        <input type="range" min={PLANT_SIZE[0]} max={PLANT_SIZE[1]} step={0.05} value={ps.lo} onChange={e => p.setPlantSet({ lo: Math.min(+e.target.value, ps.hi) })} className="flex-1" />
        <span className="w-16 text-right text-xs text-slate-200">{`${Math.round(ps.lo * 100)}%`}</span>
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Largest plant</div>
      <div className="flex items-center gap-2">
        <input type="range" min={PLANT_SIZE[0]} max={PLANT_SIZE[1]} step={0.05} value={ps.hi} onChange={e => p.setPlantSet({ hi: Math.max(+e.target.value, ps.lo) })} className="flex-1" />
        <span className="w-16 text-right text-xs text-slate-200">{`${Math.round(ps.hi * 100)}%`}</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <button className={`chip ${p.rubOut ? 'chip-on' : ''}`} onClick={() => { p.rubOut = !p.rubOut; game.emit(); }}>Rub out</button>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
        {`${pk.name}: ${plantPicked.size} of ${pool.length} picked`}
        <button className="chip" onClick={() => p.setPlantSet({ ids: null })}>All</button>
        <button className="chip" onClick={() => p.setPlantSet({ ids: [] })}>None</button>
      </div>
      <div className="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto">
        {pool.map(x => (
          <button key={x.id} title={`${x.name} (${x.id})`} onClick={() => togglePick(x.id)}
            className={`flex h-14 items-end justify-center rounded border p-0.5 ${plantPicked.has(x.id) ? 'border-amber-400 bg-amber-400/15' : 'border-slate-700 bg-slate-900/40 opacity-50'}`}>
            {LIB_BY_ID.has(x.id) ? <Thumb it={LIB_BY_ID.get(x.id)!} size={48} /> : <span className="text-[10px]">{x.name}</span>}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11px] text-slate-400">{`${game.plantedCount()} planted by these brushes · free (decoration)`}</div>
    </>
  );
}

/** a collapsible settings section; its open state is remembered per id in localStorage */
function Section({ id, title, children, open: dflt = true }: { id: string; title: string; children: ReactNode; open?: boolean }) {
  const key = `capitalempire.paintSection.${id}`;
  const [open, setOpen] = useState<boolean>(() => { try { const v = localStorage.getItem(key); return v === null ? dflt : v === '1'; } catch { return dflt; } });
  return (
    <details open={open} onToggle={e => { const o = e.currentTarget.open; setOpen(o); try { localStorage.setItem(key, o ? '1' : '0'); } catch { /* storage unavailable */ } }}>
      <summary className="mt-2 cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-slate-300">{title}</summary>
      {children}
    </details>
  );
}

/** the style editor: the fill's texture, scale, angle, corners, tone and border (and the border's own), the snap setting, and the area count and cost.
 *  gridOnly (Holes > My looks on a golf course's 1 m grid, P23 P1-E): what the grid's cells wear (T128: the texture, its size and angle, its tone
 *  and blend, and its collar band's width, shadow, texture, size, angle and tone), without the painted areas' layer, corners and cost */
export function StyleEditor({ game, gridOnly = false }: { game: Game; gridOnly?: boolean }) {
  const p = game.paint, s = p.style;
  // a course surface's border is its collar band on the course grid (the course look); any other is the painted area's. Every control shown
  // works on both (course-look.ts: the fill's texture, scale, angle, tone and blend, the band's texture, scale, angle and tone); the ones that
  // cannot (a grid surface's corners, the kerb as its band, a painted look's angle) are left out
  const grid = (gridOnly || p.course) && GRID_KINDS.includes(p.brushKind) && !p.selected, band = grid && !!BORDER_KINDS[p.brushKind];
  const fillPainted = paintedTex(game, s.tex), bandPainted = paintedTex(game, s.btex);
  const picked = p.selected ? p.areas.find(a => a.id === p.selected) : undefined;
  const pts = picked ? picked.pts : p.pts;
  // the border follows the fill's scale and angle until either is set (the renderer draws it that way), so show the fill's values then
  const bFollow = s.bscale === 1 && s.bangle === 0, bScale = bFollow ? s.scale : s.bscale, bAngle = bFollow ? s.angle : s.bangle;
  const bOwn = (c: { bscale?: number; bangle?: number }) => p.setStyle({ bscale: bScale, bangle: bAngle, ...c });
  return (
    <>
      {picked && !gridOnly && (<Section id="layer" title="Layer">
        <div className="mt-2 text-[11px] text-slate-400">Layer (over or under the areas it overlaps)</div>
        <div className="flex flex-wrap gap-1">
          <button className="chip" title="To the back: under every area it overlaps (Shift+Page Down, Ctrl+Shift+[)" onClick={() => p.moveLayer('back')}>To back</button>
          <button className="chip" title="Back one: under the next area below it (Page Down, Ctrl+[)" onClick={() => p.moveLayer(-1)}>Back</button>
          <button className="chip" title="Forward one: over the next area above it (Page Up, Ctrl+])" onClick={() => p.moveLayer(1)}>Forward</button>
          <button className="chip" title="To the front: over every area it overlaps (Shift+Page Up, Ctrl+Shift+])" onClick={() => p.moveLayer('front')}>To front</button>
        </div>
        <div className="text-[10px] text-slate-500">Page Up / Down, Shift for front / back (or Ctrl+] / Ctrl+[)</div>
      </Section>)}
      <Section id="texture" title="Texture and blend">
      <div className="mt-2 text-[11px] text-slate-400">Texture</div>
      <div className="flex flex-wrap gap-1">
        {MENU_TEXES.map(t => <button key={t.id} className={`chip ${s.tex === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ tex: t.id })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(t)} />{plainName(t.name)}</button>)}
        {!MENU_TEXES.length && <div className="text-[11px] text-slate-400">No texture presets yet: make them in the studio (Ground → Texture presets), then Rebuild game sprites.</div>}
      </div>
      <div className="mt-2 text-[11px] text-slate-400">Blend with</div>
      <div className="flex flex-wrap gap-1">
        <button className={`chip ${!s.mtex ? 'chip-on' : ''}`} onClick={() => p.setStyle({ mtex: undefined })}>None</button>
        {MENU_TEXES.map(t => <button key={t.id} className={`chip ${s.mtex === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ mtex: t.id })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(t)} />{plainName(t.name)}</button>)}
      </div>
      {s.mtex && (
        <>
          {([['Share', 'mshare', 0, 1, 0.01, (v: number) => `${Math.round(v * 100)}%`, 0.5], ['Softness', 'msoft', 0.01, 0.5, 0.01, (v: number) => v.toFixed(2), 0.12], ['Patch size', 'mpatch', 0.25, 4, 0.05, (v: number) => `${v.toFixed(2)}x`, 1]] as const).map(([label, key, lo, hi, step, fmt, def]) => (
            <div key={key} className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
              <span className="w-16 shrink-0">{label}</span>
              <input type="range" min={lo} max={hi} step={step} value={s[key] ?? def} onChange={e => p.setStyle({ [key]: +e.target.value })} className="min-w-0 flex-1" />
              <span className="w-12 text-right text-xs text-slate-200">{fmt(s[key] ?? def)}</span>
            </div>
          ))}
        </>
      )}
      </Section>
      <Section id="look" title="Size, angle and colour">
      <div className="mt-2 text-[11px] text-slate-400">Scale</div>
      <div className="flex items-center gap-1">
        <button className="btn" onClick={() => p.setStyle({ scale: s.scale / 1.25 })}>−</button>
        <span className="w-12 text-center text-xs text-slate-200">{`${Math.round(s.scale * 100)}%`}</span>
        <button className="btn" onClick={() => p.setStyle({ scale: s.scale * 1.25 })}>+</button>
        <button className="btn" onClick={() => p.setStyle({ scale: 1 })}>Reset</button>
      </div>
      {!fillPainted && (<>
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
      </>)}
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
      </Section>
      {/* the owner (2026-10-25): "should be a slider". One continuous Border, a hairline to huge: a course surface's collar band (its course look,
          with its Shadow right under it), or a painted area's border (the old None, Small, Medium and Large are points on it) */}
      <Section id="border" title="Border">
      {grid ? <CourseEdges game={game} /> : (
        <div className="flex items-center gap-2 text-[11px] text-slate-400" title="The border band inside the area's edge: none, a hairline, up to 8 m">
          <span className="w-12 shrink-0">Border</span>
          <input type="range" aria-label="Border width" min={0} max={BORDER_STEPS} step={1} value={paintBorderPos(s.border)} onChange={e => p.setStyle({ border: paintBorderAt(+e.target.value) })} className="min-w-0 flex-1" />
          <span className="w-16 text-right text-xs text-slate-200">{s.border > 0 ? borderLabel(2 * borderW(s.border)) : 'none'}</span>
        </div>
      )}
      {(grid ? band : s.border > 0) && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">Border texture</div>
          <div className="flex flex-wrap gap-1">
            {BORDER_MENU.filter(t => !grid || t.id !== 'kerb').map(t => <button key={t.id} className={`chip ${s.btex === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ btex: t.id })}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={swatch(t)} />{plainName(t.name)}</button>)}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            Border scale and angle
            <button className={`chip ${bFollow ? 'chip-on' : ''}`} title="The border uses the fill's scale and angle" onClick={() => p.setStyle({ bscale: 1, bangle: 0 })}>Follow the fill</button>
          </div>
          <div className="flex items-center gap-1">
            <button className="btn" onClick={() => bOwn({ bscale: bScale / 1.25 })}>−</button>
            <span className="w-12 text-center text-xs text-slate-200">{`${Math.round(bScale * 100)}%`}</span>
            <button className="btn" onClick={() => bOwn({ bscale: bScale * 1.25 })}>+</button>
            <button className="btn" onClick={() => bOwn({ bscale: 1 })}>Reset</button>
          </div>
          {!bandPainted && (<>
          <div className="flex items-center gap-2">
            <input type="range" min={-90} max={90} step={5} value={bAngle} onChange={e => bOwn({ bangle: +e.target.value })} className="flex-1" />
            <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(bAngle)}°`}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <button className={`chip ${!bFollow && s.bangle === 0 ? 'chip-on' : ''}`} onClick={() => bOwn({ bangle: 0 })}>Grid 0°</button>
            <button className={`chip ${!bFollow && s.bangle === 45 ? 'chip-on' : ''}`} onClick={() => bOwn({ bangle: 45 })}>45°</button>
            <button className="chip disabled:opacity-40" disabled={pts.length < 4} onClick={() => bOwn({ bangle: edgeAngle(pts) })}>Along first edge</button>
          </div>
          </>)}
          <div className="mt-2 text-[11px] text-slate-400">Border tone</div>
          <div className="flex flex-wrap gap-1">
            {TONES.map(t => <button key={t.id} className={`chip ${s.btone === t.id ? 'chip-on' : ''}`} onClick={() => p.setStyle({ btone: t.id, btint: toneStyle(t.id, s.btint).tint })}>{t.label}</button>)}
          </div>
          {s.btone > 0 && (
            <>
              <div className="mt-2 text-[11px] text-slate-400">Border strength</div>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={Math.round(s.btoneAmt * 100)} onChange={e => p.setStyle({ btoneAmt: +e.target.value / 100 })} className="flex-1" />
                <span className="w-10 text-right text-xs text-slate-200">{`${Math.round(s.btoneAmt * 100)}%`}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-200">
                Border tint
                <input type="color" value={s.btint} onChange={e => p.setStyle({ btint: e.target.value })} className="h-6 w-10 cursor-pointer bg-transparent" />
              </div>
            </>
          )}
        </>
      )}
      </Section>
      {!gridOnly && <Section id="shape" title={grid ? 'Grid' : 'Corners and grid'} open={false}>
      {!grid && (<>
      <div className="mt-2 text-[11px] text-slate-400">Corners</div>
      <div className="flex items-center gap-2">
        <input type="range" min={0} max={RADIUS_MAX} step={0.25} value={s.radius} onChange={e => p.setStyle({ radius: +e.target.value })} className="flex-1" />
        <span className="w-14 text-right text-xs text-slate-200">{s.radius === 0 ? 'Sharp' : `${s.radius * 2} m`}</span>
      </div>
      </>)}
      <label className="mt-2 flex items-center gap-2 text-xs text-slate-200">
      <input type="checkbox" checked={p.snap} onChange={e => { p.snap = e.target.checked; game.emit(); }} />
      Snap corners to the grid
      </label>
      </Section>}
      {!gridOnly && <div className="mt-2 text-[11px] text-slate-400">{game.golfMode ? (p.outline().length >= 6 ? `Estimated cost: $${Math.round(areaBuildCost(p.outline(), s.tex, p.plantKind)).toLocaleString()} (${p.plantKind}) · ${p.areas.length} area(s)` : `${p.areas.length} painted area(s)`) : `${p.areas.length} painted area(s) · free (decoration)`}</div>}
    </>
  );
}
