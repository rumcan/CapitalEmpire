import { useState, type ReactNode } from 'react';
import type { Game } from '../../game/engine';
import { BRUSH_PRESETS, PAINT_TEXES } from '../../game/paint';
import { PLANT_KINDS } from '../../game/plant';
import { PIECE_BUTTONS } from '../../game/ext/course-pieces';
import { SQUARE_SIZES } from '../../game/ext/course-cursor/snap';
import { EARTHWORK_PER_M3 } from '../../game/golf/costs';
import { PlantControls, plainName } from '../../PaintPanel';
import { ToolHead } from '../ToolHead';
import { SurfaceMark } from './SurfaceMark';
import { HoleStrip, newHole } from './HoleStrip';
import { HoleWizardPanel } from './HoleWizard';

/** the paint modes that live under More options (the brush is Shape by hand's; plan is New hole's) */
const MORE_MODES = new Set(['draw', 'piece', 'height', 'plant', 'hole']);
/** More options' open state, remembered for the session (P23 4.3) */
const MORE_KEY = 'capitalempire.holes.more';
function sessionFlag(key: string): boolean { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } }
function setSessionFlag(key: string, on: boolean) { try { sessionStorage.setItem(key, on ? '1' : '0'); } catch { /* storage may be unavailable */ } }

/** a texture's plain name (the brush look's: My looks), from its id */
export const lookName = (tex: string) => plainName(PAINT_TEXES.find(t => t.id === tex)?.name ?? tex);

/** the Holes panel (plan P23 4.3, P1-E; was the Course panel): the header with ↶ ↷, New hole on top as the gold primary (the wizard's card
 *  in its place while New hole is open), then, once a hole exists (stage 2), your holes as badges with the current hole's status, Shape by
 *  hand with the six marked surfaces, and one collapsed More options drawer in sections. At stage 1 it is New hole and its line only.
 *  looks / onLooks: Holes > More options > My looks (the style editor's card beside the panel: App's state, so Esc closes it first) */
export function CoursePanel({ game, looks = false, onLooks }: { game: Game; looks?: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, ui = game.toolUi();
  const shape = !ui || ui.shapeByHand, plan = p.mode === 'plan';
  return (
    <div className="tp" data-panel="holes">
      <ToolHead icon="trophy" title="Holes" desc="Each hole is a park: build it, then shape it">
        <button className="round-btn" disabled={!p.canUndo} aria-label={p.canUndo ? `Undo ${p.undoLabel}` : 'Nothing to undo'} title={p.canUndo ? `Undo: ${p.undoLabel} (Ctrl+Z)` : 'Nothing to undo'} onClick={() => p.undo()}>↶</button>
        <button className="round-btn" disabled={!p.canRedo} aria-label={p.canRedo ? `Redo ${p.redoLabel}` : 'Nothing to redo'} title={p.canRedo ? `Redo: ${p.redoLabel} (Ctrl+Y)` : 'Nothing to redo'} onClick={() => p.redo()}>↷</button>
      </ToolHead>
      {plan ? <HoleWizardPanel game={game} /> : (
        <button className="pill-gold" data-primary="new-hole" title="Click the tee, then the green: the whole hole is planned, ready to shape and build" onClick={() => newHole(game)}>
          <span className="pill-plus" aria-hidden>+</span>
          <span className="min-w-0"><span className="block">New hole</span>{!shape && <small>Click a tee, then a green</small>}</span>
        </button>
      )}
      {!shape && !plan && (
        <>
          <p className="mt-2.5 leading-snug">The whole hole is planned for you: fairway, green, tee and rough. Nothing is paid until you press Build.</p>
          <p className="sub-line mt-2">Shape by hand (1 m cells) opens after your first hole.</p>
        </>
      )}
      {shape && (
        <>
          <HoleStrip game={game} />
          {!plan && <ShapeByHand game={game} />}
          {!plan && <MoreOptions game={game} looks={looks} onLooks={onLooks} />}
        </>
      )}
    </div>
  );
}

/** a k x k grid of dots, the size pills' glyph */
function SizeGlyph({ k }: { k: number }) {
  const s = 12, d = s / k;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className="shrink-0">
      {Array.from({ length: k * k }, (_, i) => <rect key={i} x={(i % k) * d + 0.6} y={Math.floor(i / k) * d + 0.6} width={d - 1.2} height={d - 1.2} rx={k === 1 ? 2 : 0.6} fill="currentColor" />)}
    </svg>
  );
}

/** Shape by hand (P23 4.3, 4.5): the six surfaces as marked swatches (keys 1–6), the brush sizes ([ ]), Brush and Erase */
function ShapeByHand({ game }: { game: Game }) {
  const p = game.paint, ui = game.toolUi(), brushOk = (k: string) => !ui || (ui.visibleCourseBrushes as string[]).includes(k);
  const keys = Math.max(1, ...BRUSH_PRESETS.map((b, i) => (brushOk(b.kind) ? i + 1 : 0)));
  const brush = p.mode === 'brush', cells = p.brushCells, armed = brush || p.mode === 'draw' || p.mode === 'piece';
  const name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '';
  return (
    <section data-section="shape" className="mt-3">
      <div className="sec-head"><h3 className="label-caps">Shape by hand</h3><span className="sec-note">{`1 m cells · keys 1–${keys}`}</span></div>
      <div className="swatches" role="group" aria-label="Surface">
        {BRUSH_PRESETS.map((b, i) => {
          if (!brushOk(b.kind)) return null;
          const on = armed && p.brushKind === b.kind;
          return (
            <button key={b.kind} data-swatch={b.kind} aria-pressed={on} title={`${b.name} (key ${i + 1})`} className={`swatch ${on ? 'swatch-on' : ''}`} onClick={() => (p.mode === 'draw' ? p.setShape(b.kind) : p.setBrush(b.kind))}>
              <span className="swatch-disc"><SurfaceMark kind={b.kind} size={34} /></span>
              <span className="swatch-key" aria-hidden>{i + 1}</span>
              <span className="swatch-name">{b.name}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brush size">
        {SQUARE_SIZES.map(k => (
          <button key={k} className={`chip ${brush && cells === k ? 'chip-on' : ''}`} aria-pressed={brush && cells === k} title={k === 1 ? 'One 1 m cell ([ ] size)' : `${k * k} cells, ${k} m a side${k === 2 ? ': one town square' : ''} ([ ] size)`} onClick={() => { if (!brush) p.setBrush(p.brushKind); p.setBrushCells(k); }}>
            <SizeGlyph k={k} />{k === 1 ? '1' : `${k}×${k}`}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button className={`chip ${brush && !p.rubOut ? 'chip-on' : ''}`} aria-pressed={brush && !p.rubOut} title={`Paint ${name} for hole ${p.brushHole}: click a cell, drag a run`} onClick={() => { p.rubOut = false; if (!brush) p.setBrush(p.brushKind); else game.emit(); }}>Brush</button>
        <button className={`chip ${brush && p.rubOut ? 'chip-on' : ''}`} aria-pressed={brush && p.rubOut} title="Erase takes the top surface under the brush (hold Alt for a moment); no refund" onClick={() => { p.rubOut = !(brush && p.rubOut); if (!brush) p.setBrush(p.brushKind); else game.emit(); }}>Erase</button>
      </div>
      {!game.golfMode && brush && <div className="sub-line mt-1.5">{`Click paints ${name} for hole ${p.brushHole}; drag paints a run. Alt-drag or Erase rubs out. [ ] size.`}</div>}
    </section>
  );
}

/** a labelled section of More options */
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-2.5"><h4 className="sub-head">{title}</h4>{children}</div>;
}

/** More options (P23 4.3): one collapsed drawer in labelled sections, remembered for the session: Shapes (Lasso, Round, Stamps), Look (My
 *  looks: each surface's look and the style editor, decision 3), Planting (Seed or Sod), and Hole · plants · ground (saved holes, editing a
 *  planned hole, the plant brushes, the ground's height). While one of its tools is in hand it stays open; closing it puts that tool down */
function MoreOptions({ game, looks, onLooks }: { game: Game; looks: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, ui = game.toolUi(), fine = (k: string) => !ui || (ui.visibleFineControls as string[]).includes(k);
  const [open, setOpenState] = useState(() => sessionFlag(MORE_KEY));
  const more = MORE_MODES.has(p.mode) || (p.mode === 'brush' && p.brushCells === 0), shown = open || more || looks;
  const setOpen = (on: boolean) => { setOpenState(on); setSessionFlag(MORE_KEY, on); if (!on) { if (more) p.setBrush(p.brushKind); if (more && p.brushCells === 0) p.setBrushCells(1); onLooks?.(false); } };
  const n = p.brushHole, name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '', br = p.brush[p.brushKind];
  const help = p.mode === 'height'
    ? `Drag to ${p.heightMode} the ground (subtle: ±3 m at most). Smooth evens out bumps, Flatten brings it back to level. Roads stay flat. [ ] size.${game.golfMode ? ` Earthworks cost $${EARTHWORK_PER_M3} a m³.` : ''}`
    : p.mode === 'piece' ? `Click to stamp a ${PIECE_BUTTONS.find(b => b.arch === p.pieceArch)?.name ?? 'piece'} for hole ${n} on the mini grid. R turns it, [ ] sizes it.`
    : p.mode === 'draw' ? `Click corners (or press and drag) to lay ${name} for hole ${n}; double-click or Enter closes.`
    : '';
  const lookOpen = () => { if (p.mode !== 'brush' && p.mode !== 'draw') p.setBrush(p.brushKind); onLooks?.(!looks); };
  return (
    <section data-section="more" className="more">
      <button className="more-head" aria-expanded={shown} onClick={() => setOpen(!shown)}>
        <span className="font-semibold">More options</span>
        <span className="more-sub">{shown ? 'open for this session' : 'shapes · my looks · planting · more'}</span>
        <span aria-hidden>{shown ? '▾' : '▸'}</span>
      </button>
      {shown && (
        <div>
          <Sub title="Shapes">
            <div className="flex flex-wrap gap-1.5">
              <button className={`chip ${p.mode === 'draw' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'draw'} title="Lasso: click corners, or press and drag an outline" onClick={() => p.setShape(p.brushKind)}>Lasso</button>
              <button className={`chip ${p.mode === 'brush' && p.brushCells === 0 ? 'chip-on' : ''}`} aria-pressed={p.mode === 'brush' && p.brushCells === 0} title="A round brush, sized in tiles" onClick={() => { if (p.mode !== 'brush') p.setBrush(p.brushKind); p.setBrushCells(0); }}>Round</button>
              <button className={`chip ${p.mode === 'piece' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'piece'} title="Stamps: the big ready-made shapes (pear fairway, kidney green, pond...), stamped on the mini grid" onClick={() => p.setPiece(p.pieceArch)}>Stamps</button>
            </div>
            {p.mode === 'brush' && p.brushCells === 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <input type="range" aria-label="Round brush size" min={0.5} max={20} step={0.5} value={br.r} onChange={e => p.setBrushR(+e.target.value)} className="min-w-0 flex-1" />
                <span className="w-16 text-right">{`${br.r} tiles`}</span>
              </div>
            )}
            {p.mode === 'piece' && (
              <>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PIECE_BUTTONS.filter(b => !ui || (ui.visibleCourseBrushes as string[]).includes(b.kind)).map(b => <button key={b.arch} className={`chip ${p.pieceArch === b.arch ? 'chip-on' : ''}`} onClick={() => p.setPiece(b.arch)}>{b.name}</button>)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {fine('pieceAngle') && <button className="chip" title="R (Shift+R turns back)" onClick={() => p.setPieceOpts({ angle: p.pieceAngle + 15 })}>{`Turn ${p.pieceAngle}°`}</button>}
                  {fine('pieceScale') && <button className="chip" title="[" onClick={() => p.setPieceOpts({ scale: p.pieceScale - 0.25 })}>Smaller</button>}
                  {fine('pieceScale') && <button className="chip" title="]" onClick={() => p.setPieceOpts({ scale: p.pieceScale + 0.25 })}>Bigger</button>}
                  {fine('pieceScale') && <span>{`${p.pieceScale}×`}</span>}
                  {fine('snapToggle') && <button className={`chip ${p.pieceSnap ? 'chip-on' : ''}`} title="Snap to the piece it touches" onClick={() => p.setPieceOpts({ snap: !p.pieceSnap })}>Snap</button>}
                </div>
              </>
            )}
            {(p.mode === 'draw' || p.mode === 'piece') && <div className="sub-line mt-1.5">{help}</div>}
          </Sub>
          <Sub title="Look">
            <div className="flex items-center justify-between gap-2">
              <span>My looks</span>
              <button className={`chip ${looks ? 'chip-on' : ''}`} data-looks aria-pressed={looks} title={`${name}'s look: every ${name.toLowerCase()} you paint wears it; the disc at the pointer shows it`} onClick={lookOpen}>{`${name}: ${lookName(br.style.tex)}`} <span aria-hidden>▸</span></button>
            </div>
          </Sub>
          {game.golfMode && (
            <Sub title="Planting">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Planting">
                <button className={`chip ${p.plantKind === 'seed' ? 'chip-on' : ''}`} aria-pressed={p.plantKind === 'seed'} title="Seed: the cheap way; the grass grows in over a few months" onClick={() => { p.plantKind = 'seed'; game.emit(); }}>Seed · grows in</button>
                <button className={`chip ${p.plantKind === 'sod' ? 'chip-on' : ''}`} aria-pressed={p.plantKind === 'sod'} title="Sod: rolls of grown turf, playable at once, 3 to 5 times the price" onClick={() => { p.plantKind = 'sod'; game.emit(); }}>Sod · ready now, 3–5×</button>
              </div>
            </Sub>
          )}
          <Sub title="Hole · plants · ground">
            <div className="flex flex-wrap gap-1.5">
              <button className={`chip ${p.mode === 'hole' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'hole'} onClick={() => p.setMode('hole')}>Saved holes <span aria-hidden>▸</span></button>
              {game.golfMode && p.hasPlan(n) && <button className="chip" title={`Open hole ${n}'s plan in New hole: move the tee, the green, the bends and widths`} onClick={() => p.editPlan(n)}>{`Edit hole ${n}`}</button>}
              <button className={`chip ${p.mode === 'plant' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'plant'} onClick={() => p.setPlant(p.plantBrush)}>Plants <span aria-hidden>▸</span></button>
              <button className={`chip ${p.mode === 'height' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'height'} onClick={() => p.setHeight()}>Ground height <span aria-hidden>▸</span></button>
            </div>
            {p.mode === 'hole' && (
              <>
                <div className="sub-line mt-1.5">{`Click the map to place the hole, its tee at the click; R turns it. It becomes hole ${n}, or the next free number if hole ${n} already has areas.`}</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <button className={`chip col-span-3 ${p.holeSlot === 0 ? 'chip-on' : ''}`} onClick={() => p.setHoleSlot(0)}>Generated: a new layout each time</button>
                  {p.presetSlots().map((slot, i) => slot
                    ? <button key={i} className={`chip ${p.holeSlot === i + 1 ? 'chip-on' : ''}`} title={`${i + 1}. ${slot}`} onClick={() => p.setHoleSlot(i + 1)}>{`${i + 1}. ${slot}`}</button>
                    : <button key={i} className="chip opacity-40" disabled title="Empty: make it in the studio's Holes tab">{`${i + 1}. empty`}</button>)}
                </div>
              </>
            )}
            {p.mode === 'plant' && (
              <>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {PLANT_KINDS.map(k => <button key={k.kind} className={`chip ${p.plantBrush === k.kind ? 'chip-on' : ''}`} onClick={() => p.setPlant(k.kind)}><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.col }} />{k.name}</button>)}
                </div>
                <PlantControls game={game} />
              </>
            )}
            {p.mode === 'height' && (
              <>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(['raise', 'lower', 'smooth', 'flatten'] as const).map(m => <button key={m} className={`chip ${p.heightMode === m ? 'chip-on' : ''}`} onClick={() => p.setHeight({ mode: m })}>{m[0]!.toUpperCase() + m.slice(1)}</button>)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <button className="chip" title="[" onClick={() => p.setHeight({ r: p.heightR - 2 })}>Smaller</button>
                  <button className="chip" title="]" onClick={() => p.setHeight({ r: p.heightR + 2 })}>Bigger</button>
                  <span>{`${p.heightR} tiles`}</span>
                  <button className="chip" onClick={() => p.setHeight({ level: p.heightLevel - 1 })}>Gentler</button>
                  <button className="chip" onClick={() => p.setHeight({ level: p.heightLevel + 1 })}>Stronger</button>
                  <span>{`Strength ${p.heightLevel}/5`}</span>
                </div>
                <div className="sub-line mt-1.5">{help}</div>
              </>
            )}
          </Sub>
        </div>
      )}
    </section>
  );
}
