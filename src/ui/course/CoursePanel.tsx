import type { Game } from '../../game/engine';
import { BRUSH_PRESETS } from '../../game/paint';
import { PLANT_KINDS } from '../../game/plant';
import { PIECE_BUTTONS } from '../../game/ext/course-pieces';
import { SQUARE_SIZES } from '../../game/ext/course-cursor/snap';
import { EARTHWORK_PER_M3 } from '../../game/golf/costs';
import { BUSINESS, CLUBHOUSE_RANGE_COST } from '../../game/business/catalogue';
import { PlantControls, StyleEditor } from '../../PaintPanel';
import { SurfaceMark } from './SurfaceMark';
import { HoleStrip } from './HoleStrip';
import { HoleInspector } from './HoleInspector';
import { HoleWizardPanel } from './HoleWizard';
import { CourseEdges } from './CourseEdges';
import { GRID_KINDS } from '../../game/paint-tool';

type CourseTab = 'build' | 'presets' | 'plants' | 'buildings';

/** the Course tool's panel: the current hole with undo and redo, then the tabs: Build (the surfaces and their style), Presets (the 1-18 holes) and Plants
 *  (docs/COURSE-BUILDER.md, C1), and in a golf game Buildings (the clubhouse the player places, plan P22 T089) */
export function CoursePanel({ game }: { game: Game }) {
  const p = game.paint, n = p.brushHole, br = p.brush[p.brushKind], name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '';
  const ui = game.toolUi(), brushOk = (k: string) => !ui || (ui.visibleCourseBrushes as string[]).includes(k), fine = (k: string) => !ui || (ui.visibleFineControls as string[]).includes(k);
  // T109: building works in 1 m mini-grid cells; the round brush and the big stamps (the old pieces) sit under Advanced (Settings > Show every tool now)
  const adv = !ui || ui.advancedMode, sq = p.brushSquare(), cells = p.brushCells;
  // T117: stage 1 is New hole only; Shape by hand (the surfaces and methods), Presets and Plants open with the first hole (P23 4.2)
  const shape = !ui || ui.shapeByHand;
  const tab: CourseTab = game.clubPlacing ? 'buildings' : p.mode === 'hole' ? 'presets' : p.mode === 'plant' ? 'plants' : 'build';
  const help = p.mode === 'height'
    ? `Drag to ${p.heightMode} the ground (subtle: ±3 m at most). Smooth evens out bumps, Flatten brings it back to level. Roads stay flat. [ ] size.${game.golfMode ? ` Earthworks cost $${EARTHWORK_PER_M3} per m³.` : ''}`
    : p.mode === 'piece'
    ? `Click to lay a ${PIECE_BUTTONS.find(b => b.arch === p.pieceArch)?.name ?? 'piece'} for hole ${n}. It snaps to the end or edge of the course piece it touches and dresses its own borders. R turns it, [ ] sizes it.`
    : p.mode === 'brush' && sq
    ? `Click paints ${sq === 1 ? 'one 1 m cell' : `${sq} x ${sq} cells`} of ${name} for hole ${n} on the mini grid (a town square is 2 x 2); drag paints a run. Cells of the same surface join up. Alt-drag or Rub out erases. [ ] size.`
    : p.mode === 'brush'
    ? `Drag to paint ${name} for hole ${n}; strokes of the same surface on a hole join into one area. Alt-drag or Rub out erases. [ ] size.`
    : `Click corners (or press and drag) to lay ${name} for hole ${n}; double-click or Enter closes. Pick the shape to edit it with its handles.`;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Course</div>
        <span className="text-xs text-slate-200">{`Hole ${n}`}</span>
        <button className={`chip ${p.canUndo ? '' : 'opacity-40'}`} disabled={!p.canUndo} title="Ctrl+Z" onClick={() => p.undo()}>Undo</button>
        <button className={`chip ${p.canRedo ? '' : 'opacity-40'}`} disabled={!p.canRedo} title="Ctrl+Y" onClick={() => p.redo()}>Redo</button>
      </div>
      <HoleStrip game={game} />
      {p.mode === 'plan' && <HoleWizardPanel game={game} />}
      <HoleInspector game={game} />
      <div className="mt-2 flex flex-wrap gap-1">
        <button className={`chip ${tab === 'build' ? 'chip-on' : ''}`} onClick={() => { game.placeClubhouse(false); p.setBrush(p.brushKind); }}>Build</button>
        {shape && <button className={`chip ${tab === 'presets' ? 'chip-on' : ''}`} onClick={() => { game.placeClubhouse(false); p.setMode('hole'); }}>Presets</button>}
        {shape && <button className={`chip ${tab === 'plants' ? 'chip-on' : ''}`} onClick={() => { game.placeClubhouse(false); p.setPlant(p.plantBrush); }}>Plants</button>}
        {game.golfMode && <button className={`chip ${tab === 'buildings' ? 'chip-on' : ''}`} onClick={() => game.placeClubhouse(true)}>Buildings</button>}
      </div>
      {tab === 'build' && p.mode !== 'plan' && !shape && (
        <div className="mt-2 text-xs text-slate-300">+ New hole plans the whole hole for you: click a tee, then a green, and Build. Shape by hand (1 m cells) opens after your first hole.</div>
      )}
      {tab === 'build' && p.mode !== 'plan' && shape && (
        <>
          <div className="mt-2 text-[11px] text-slate-400">Surface (keys 1–{Math.max(1, ...BRUSH_PRESETS.map((b, i) => (brushOk(b.kind) ? i + 1 : 0)))})</div>
          {/* T118: each surface's disc with its mark (the cursor's chip carries the same), its key, and the armed one plainly lit */}
          <div className="flex flex-wrap gap-1">
            {BRUSH_PRESETS.map((b, i) => brushOk(b.kind) && <button key={b.kind} aria-pressed={p.brushKind === b.kind} title={`${b.name} (key ${i + 1})`} className={`chip ${p.brushKind === b.kind ? 'chip-on ring-2 ring-amber-200/80' : ''}`} onClick={() => p.mode === 'draw' ? p.setShape(b.kind) : p.setBrush(b.kind)}><SurfaceMark kind={b.kind} size={20} />{b.name}<span className={`ml-0.5 text-[10px] font-bold ${p.brushKind === b.kind ? 'text-amber-950/70' : 'text-slate-500'}`}>{i + 1}</span></button>)}
          </div>
          <div className="mt-2 text-[11px] text-slate-400">Method</div>
          <div className="flex flex-wrap gap-1">
            <button className={`chip ${p.mode === 'brush' ? 'chip-on' : ''}`} onClick={() => p.setBrush(p.brushKind)}>Brush</button>
            <button className={`chip ${p.mode === 'draw' ? 'chip-on' : ''}`} onClick={() => p.setShape(p.brushKind)}>Shape</button>
            {fine('heightBrush') && <button className={`chip ${p.mode === 'height' ? 'chip-on' : ''}`} onClick={() => p.setHeight()}>Height</button>}
            {(adv || p.mode === 'piece') && <button className={`chip ${p.mode === 'piece' ? 'chip-on' : ''}`} title="Advanced: the big ready-made shapes (pear fairway, kidney green, pond...), stamped on the mini grid" onClick={() => p.setPiece(p.pieceArch)}>Stamps</button>}
          </div>
          {p.mode === 'brush' && (
            <>
              <div className="mt-2 text-[11px] text-slate-400">Brush size (1 m mini-grid cells)</div>
              <div className="flex flex-wrap gap-1">
                {SQUARE_SIZES.map(k => <button key={k} className={`chip ${cells === k ? 'chip-on' : ''}`} title={k === 2 ? 'One town square (a road tile)' : `${k * k} cells, ${k} m a side`} onClick={() => p.setBrushCells(k)}>{k === 1 ? '1 cell' : k === 2 ? '2 x 2 (town square)' : `${k} x ${k}`}</button>)}
                {adv && <button className={`chip ${cells === 0 ? 'chip-on' : ''}`} title="Advanced: a round brush in tiles" onClick={() => p.setBrushCells(0)}>Round</button>}
              </div>
              {cells === 0 && (
                <div className="flex items-center gap-2">
                  <input type="range" min={0.5} max={20} step={0.5} value={br.r} onChange={e => p.setBrushR(+e.target.value)} className="flex-1" />
                  <span className="w-16 text-right text-xs text-slate-200">{`${br.r} tiles`}</span>
                </div>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                <button className={`chip ${p.rubOut ? 'chip-on' : ''}`} onClick={() => { p.rubOut = !p.rubOut; game.emit(); }}>Rub out</button>
              </div>
            </>
          )}
          {p.mode === 'piece' && (
            <>
              <div className="mt-2 text-[11px] text-slate-400">Stamps (Advanced)</div>
              <div className="flex flex-wrap gap-1">
                {PIECE_BUTTONS.filter(b => brushOk(b.kind)).map(b => <button key={b.arch} className={`chip ${p.pieceArch === b.arch ? 'chip-on' : ''}`} onClick={() => p.setPiece(b.arch)}>{b.name}</button>)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {fine('pieceAngle') && <button className="chip" title="R (Shift+R turns back)" onClick={() => p.setPieceOpts({ angle: p.pieceAngle + 15 })}>{`Turn ${p.pieceAngle}°`}</button>}
                {fine('pieceScale') && <button className="chip" title="[" onClick={() => p.setPieceOpts({ scale: p.pieceScale - 0.25 })}>Smaller</button>}
                {fine('pieceScale') && <button className="chip" title="]" onClick={() => p.setPieceOpts({ scale: p.pieceScale + 0.25 })}>Bigger</button>}
                {fine('pieceScale') && <span className="text-xs text-slate-300">{`${p.pieceScale}×`}</span>}
                {fine('snapToggle') && <button className={`chip ${p.pieceSnap ? 'chip-on' : ''}`} title="Snap to the piece it touches" onClick={() => p.setPieceOpts({ snap: !p.pieceSnap })}>Snap</button>}
              </div>
            </>
          )}
          {p.mode === 'height' && (
            <>
              <div className="mt-2 text-[11px] text-slate-400">Ground</div>
              <div className="flex flex-wrap gap-1">
                {(['raise', 'lower', 'smooth', 'flatten'] as const).map(m => <button key={m} className={`chip ${p.heightMode === m ? 'chip-on' : ''}`} onClick={() => p.setHeight({ mode: m })}>{m[0]!.toUpperCase() + m.slice(1)}</button>)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1">
                <button className="chip" title="[" onClick={() => p.setHeight({ r: p.heightR - 2 })}>Smaller</button>
                <button className="chip" title="]" onClick={() => p.setHeight({ r: p.heightR + 2 })}>Bigger</button>
                <span className="text-xs text-slate-300">{`${p.heightR} tiles`}</span>
                <button className="chip" onClick={() => p.setHeight({ level: p.heightLevel - 1 })}>Gentler</button>
                <button className="chip" onClick={() => p.setHeight({ level: p.heightLevel + 1 })}>Stronger</button>
                <span className="text-xs text-slate-300">{`Strength ${p.heightLevel}/5`}</span>
              </div>
            </>
          )}
          {/* the course look's Border and Shadow for the surface in the brush: in Fine tuning's Border (where the old buttons were), else here */}
          {!fine('customStyle') && p.mode !== 'height' && GRID_KINDS.includes(p.brushKind) && <CourseEdges game={game} />}
          <div className="mt-1 text-xs text-slate-300">{help}</div>
          {/* T035: the planting method and the surface style sit under Advanced (the all-tools toggle); without them new areas use seed planting and the preset style */}
          {fine('customStyle') && (
            <>
              <div className="mt-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Fine tuning</div>
              {game.golfMode && (
                <>
                  <div className="mt-2 text-[11px] text-slate-400">Planting method</div>
                  <div className="flex flex-wrap gap-1">
                    <button className={`chip ${p.plantKind === 'seed' ? 'chip-on' : ''}`} onClick={() => { p.plantKind = 'seed'; game.emit(); }}>Seed (grows in)</button>
                    <button className={`chip ${p.plantKind === 'sod' ? 'chip-on' : ''}`} onClick={() => { p.plantKind = 'sod'; game.emit(); }}>Sod (instant, 3–5× cost)</button>
                  </div>
                </>
              )}
              <div className="mt-2 text-[11px] text-slate-400">{`${name} style (every ${name} on hole ${n} follows it; remembered)`}</div>
              <StyleEditor game={game} />
            </>
          )}
        </>
      )}
      {tab === 'presets' && (
        <>
          <div className="mt-2 text-xs text-slate-300">{`Click the map to place the hole, its tee at the click; R turns it. It becomes hole ${n} (the current hole), or the next free number if hole ${n} already has areas.`}</div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <button className={`chip col-span-3 ${p.holeSlot === 0 ? 'chip-on' : ''}`} onClick={() => p.setHoleSlot(0)}>Generated: a new layout each time</button>
            {p.presetSlots().map((slot, i) => slot
              ? <button key={i} className={`chip ${p.holeSlot === i + 1 ? 'chip-on' : ''}`} title={`${i + 1}. ${slot}`} onClick={() => p.setHoleSlot(i + 1)}>{`${i + 1}. ${slot}`}</button>
              : <button key={i} className="chip opacity-40" disabled title="Empty: make it in the studio's Holes tab">{`${i + 1}. empty`}</button>)}
          </div>
        </>
      )}
      {tab === 'buildings' && (() => {
        const built = game.bizDefs.some(d => d.type === 'clubhouse'), B = BUSINESS.clubhouse;
        return (
          <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2 text-xs">
            <div className="flex items-center justify-between"><span className="font-semibold text-slate-100">Clubhouse</span><span className="text-amber-200">{built ? '✓ Built' : `$${CLUBHOUSE_RANGE_COST.toLocaleString()}`}</span></div>
            <div className="mt-1 text-slate-400">{`${B.footprint.w} × ${B.footprint.h} tiles · one only. The course's front door: green fees start, the tournament's crowd heads here, and the tour needs it before it invites you.`}</div>
            <div className="mt-1 text-slate-300">{built ? 'Your clubhouse stands: there is one only.' : 'Click beside a drive on your land (its front snaps to the drive); R turns it, Esc stops.'}</div>
          </div>
        );
      })()}
      {tab === 'plants' && (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {PLANT_KINDS.map(k => <button key={k.kind} className={`chip ${p.mode === 'plant' && p.plantBrush === k.kind ? 'chip-on' : ''}`} onClick={() => p.setPlant(k.kind)}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: k.col }} />{k.name}</button>)}
          </div>
          <PlantControls game={game} />
        </>
      )}
    </div>
  );
}
