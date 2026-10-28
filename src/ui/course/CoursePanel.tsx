import { useState, type ReactNode } from 'react';
import type { Game } from '../../game/engine';
import { BRUSH_PRESETS } from '../../game/paint';
import { PLANT_KINDS } from '../../game/plant';
import { PIECE_BUTTONS } from '../../game/ext/course-pieces';
import { PlantControls } from '../../PaintPanel';
import { LockMark } from '../Rail';
import { ToolHead } from '../ToolHead';
import { BrushShape, GroundHeight, LooksEntry, SurfaceSwatches, surfaceKeysOf } from './BrushControls';
import { HoleStrip, newHole } from './HoleStrip';
import { HoleWizardPanel } from './HoleWizard';
import { CourseEdges } from './CourseEdges';
import { GRID_KINDS } from '../../game/paint-tool';

/** the paint modes that live under More options (the brush is Shape by hand's; plan is New hole's) */
const MORE_MODES = new Set(['draw', 'piece', 'height', 'plant', 'hole']);
/** More options' open state, remembered for the session (P23 4.3) */
const MORE_KEY = 'capitalempire.holes.more';
function sessionFlag(key: string): boolean { try { return sessionStorage.getItem(key) === '1'; } catch { return false; } }
function setSessionFlag(key: string, on: boolean) { try { sessionStorage.setItem(key, on ? '1' : '0'); } catch { /* storage may be unavailable */ } }

/** a texture's plain name (the brush look's: My looks), from its id (T252: it lives with the shared brush controls) */
export { lookName } from './BrushControls';

/** the Holes panel (plan P23 4.3, P1-E; was the Course panel): the header with ↶ ↷, New hole on top as the gold primary (the wizard's card
 *  in its place while New hole is open), then, once a hole exists (stage 2), your holes as badges with the current hole's status, Shape by
 *  hand with the marked surfaces (eight since T222's Waste area), and one collapsed More options drawer in sections. At stage 1 it is New hole and its line only.
 *  looks / onLooks: Holes > More options > My looks (the style editor's card beside the panel: App's state, so Esc closes it first) */
export function CoursePanel({ game, looks = false, onLooks }: { game: Game; looks?: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, ui = game.toolUi();
  // New hole's editor on screen (T238: Edit hole with a brush in hand too): its card in New hole's place, Shape by hand under it hidden
  const shape = !ui || ui.shapeByHand, plan = p.planOpen, lock = ui?.newHoleLock ?? null;
  // ↶ ↷ name what they take back (P23 4.3); in New hole its own clicks and drags come first (P23 4.4, T119)
  const un = p.topUndo, re = p.topRedo;
  // T256 (#743): Range › Build: the same painting tools, on your property (cells of no hole)
  if (p.property) return <PropertyPanel game={game} looks={looks} onLooks={onLooks} />;
  return (
    <div className="tp" data-panel="holes">
      <ToolHead icon="trophy" title="Holes" desc="Each hole is a park: build it, then shape it">
        <button className="round-btn" disabled={!un} aria-label={un ? `Undo ${un}` : 'Nothing to undo'} title={un ? `Undo: ${un} (Ctrl+Z)` : 'Nothing to undo'} onClick={() => p.undoTop()}>↶</button>
        <button className="round-btn" disabled={!re} aria-label={re ? `Redo ${re}` : 'Nothing to redo'} title={re ? `Redo: ${re} (Ctrl+Y)` : 'Nothing to redo'} onClick={() => p.redoTop()}>↷</button>
      </ToolHead>
      {p.mode === 'myhole' && p.myHole ? <MyHolePlace game={game} /> : plan ? <HoleWizardPanel game={game} looks={looks} onLooks={onLooks} /> : (
        <button className={`pill-gold ${lock ? 'opacity-50' : ''}`} data-primary="new-hole" data-guide="new-hole" aria-disabled={!!lock} title={lock ? `New hole: ${lock}` : 'Click the tee, then the green: the whole hole is planned, ready to shape and build'} onClick={() => newHole(game)}>
          <span className="pill-plus" aria-hidden>{lock ? <LockMark size={12} /> : '+'}</span>
          <span className="min-w-0"><span className="block">New hole</span>{lock ? <small data-testid="new-hole-lock">{lock}</small> : !shape && <small>Click a tee, then a green</small>}</span>
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

/** Shape by hand (P23 4.3, 4.5): the surfaces as swatches (keys 1–8; T252: each the surface's puck, no cart path), the brush's shape (T238:
 *  Square or Round) and size ([ ]), Brush and Erase */
function ShapeByHand({ game }: { game: Game }) {
  const p = game.paint, keys = surfaceKeysOf(game);
  const brush = p.mode === 'brush', cells = p.brushCells, armed = brush || p.mode === 'draw' || p.mode === 'piece', run = brush && !!p.brushRun && cells > 0;
  const name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '';
  return (
    <section data-section="shape" className="mt-3">
      <div className="sec-head"><h3 className="label-caps">Shape by hand</h3><span className="sec-note">{`1 m cells · keys 1–${keys}`}</span></div>
      {/* T256: whose paint the brush lays: this hole's (Range › Build paints your property) */}
      {game.golfMode && armed && <div className="paint-owner" data-testid="paint-owner">{`Painting hole ${p.brushHole}`}</div>}
      <SurfaceSwatches game={game} on={armed ? p.brushKind : null} pick={k => (p.mode === 'draw' ? p.setShape(k) : p.setBrush(k))} />
      <BrushShape game={game} brush={brush} arm={() => p.setBrush(p.brushKind)} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Brush | Run (T122, P23 4.5): the brush paints where you click and drag; Run lays a strip like a road, from click to click */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Brush or Run" data-method={run ? 'run' : 'brush'}>
          <button className={`chip ${brush && !run ? 'chip-on' : ''}`} aria-pressed={brush && !run} title={`Paint ${name} for hole ${p.brushHole}: click a cell, drag a run`} onClick={() => p.setBrushRun(false)}>Brush</button>
          {game.golfMode && <button className={`chip ${run ? 'chip-on' : ''}`} aria-pressed={run} title={`Run: lay a strip of ${name} as wide as the size, like a road: click a start, click each bend, then double-click, Enter or right-click. Shift keeps a leg straight`} onClick={() => p.setBrushRun(true)}>Run</button>}
        </div>
        <button className={`chip ${brush && p.rubOut ? 'chip-on' : ''}`} aria-pressed={brush && p.rubOut} title={`Erase takes the top surface under the ${run ? 'run' : 'brush'} (hold Alt for a moment while brushing); no refund`} onClick={() => { const v = !(brush && p.rubOut); if (!brush) p.setBrush(p.brushKind); p.rubOut = v; game.emit(); }}>Erase</button>
      </div>
      {!game.golfMode && brush && <div className="sub-line mt-1.5">{`Click paints ${name} for hole ${p.brushHole}; drag paints a run. Alt-drag or Erase rubs out. [ ] size.`}</div>}
    </section>
  );
}

/** T256 (#743; the owner, 2026-10-29: "add a build button that gets you to the same painting tools we have for holes but these painting tool
 *  work on you range and practice area and around the whole property, they are not connected to you hole"): Range › Build's panel. The
 *  holes' painting tools (the surfaces, Square or Round, Brush or Run, Erase, My looks, Ground height) on your property: they lay cells of no
 *  hole, never touch a hole's, and hole edits and deletes never touch them. Done goes back to the Holes panel */
function PropertyPanel({ game, looks, onLooks }: { game: Game; looks: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, brush = p.mode === 'brush', height = p.mode === 'height', run = brush && !!p.brushRun && p.brushCells > 0, keys = surfaceKeysOf(game);
  const name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '', un = p.topUndo, re = p.topRedo;
  return (
    <div className="tp" data-panel="property">
      <ToolHead icon="terrain" title="Build" desc="Paint your property: the range, the practice area and the rest of your land">
        <button className="round-btn" disabled={!un} aria-label={un ? `Undo ${un}` : 'Nothing to undo'} title={un ? `Undo: ${un} (Ctrl+Z)` : 'Nothing to undo'} onClick={() => p.undoTop()}>↶</button>
        <button className="round-btn" disabled={!re} aria-label={re ? `Redo ${re}` : 'Nothing to redo'} title={re ? `Redo: ${re} (Ctrl+Y)` : 'Nothing to redo'} onClick={() => p.redoTop()}>↷</button>
      </ToolHead>
      <div className="paint-owner" data-testid="paint-owner">Painting your property</div>
      <p className="sub-line mt-1.5 leading-snug">Not part of any hole: editing or deleting a hole never touches it, and it never paints over a hole. Priced as the course.</p>
      <section data-section="shape" className="mt-3">
        <div className="sec-head"><h3 className="label-caps">Surfaces</h3><span className="sec-note">{`1 m cells · keys 1–${keys}`}</span></div>
        <SurfaceSwatches game={game} on={brush ? p.brushKind : null} pick={k => p.setBrush(k)} />
        <BrushShape game={game} brush={brush} arm={() => p.setBrush(p.brushKind)} />
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5" role="group" aria-label="Brush or Run" data-method={run ? 'run' : 'brush'}>
            <button className={`chip ${brush && !run ? 'chip-on' : ''}`} aria-pressed={brush && !run} title={`Paint ${name} on your property: click a cell, drag a run`} onClick={() => p.setBrushRun(false)}>Brush</button>
            <button className={`chip ${run ? 'chip-on' : ''}`} aria-pressed={run} title={`Run: lay a strip of ${name} as wide as the size, like a road`} onClick={() => p.setBrushRun(true)}>Run</button>
          </div>
          <button className={`chip ${brush && p.rubOut ? 'chip-on' : ''}`} aria-pressed={brush && p.rubOut} title="Erase takes your property's top surface under the brush (never a hole's); no refund" onClick={() => { const v = !(brush && p.rubOut); if (!brush) p.setBrush(p.brushKind); p.rubOut = v; game.emit(); }}>Erase</button>
          <button className={`chip ${height ? 'chip-on' : ''}`} data-ground-height aria-pressed={height} aria-expanded={height} title="Ground height: raise, lower, smooth or flatten your land (earthworks are paid for)" onClick={() => (height ? p.setBrush(p.brushKind) : p.setHeight())}>Ground height <span aria-hidden>{height ? '▾' : '▸'}</span></button>
        </div>
        {height && <GroundHeight game={game} on arm={() => p.setHeight()} />}
      </section>
      <div className="mt-2.5"><h4 className="sub-head">Look</h4><LooksEntry game={game} looks={looks} onLooks={onLooks} arm={() => { if (p.mode !== 'brush') p.setBrush(p.brushKind); }} /></div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button className="chip" title="Back to the Holes panel: its brush paints the hole in hand" onClick={() => p.setProperty(false)} data-testid="property-done">Done · back to Holes</button>
      </div>
    </div>
  );
}

/** T256: New hole's "From My holes": the saved hole in hand as a ghost on the map (R turns it, a click builds it as the next free hole, priced
 *  as New hole); Esc or Back returns to New hole */
function MyHolePlace({ game }: { game: Game }) {
  const p = game.paint, h = p.myHole!, gh = p.myHoleGhost(), turns = ['as saved', 'a quarter turn', 'half a turn', 'three quarters'];
  return (
    <div className="wizard-card" data-primary="myhole" data-testid="myhole-place">
      <span className="wiz-title">{`From My holes · ${h.name}`}</span>
      <p className="sub-line mt-1.5">{`Click on the map to build it as hole ${gh?.n || p.nextFreeHole()}: its grass, plan, ground height and looks${h.props.length ? ` (and ${h.props.length} frame trees with Frame with trees on)` : ''}. R turns it.`}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button className="chip" onClick={() => p.turnMyHole(true)} title="Turn it back (Shift+R)">↺</button>
        <span>{`Turned ${turns[(p.myTurn - h.facing + 4) % 4] ?? ''}`}</span>
        <button className="chip" onClick={() => p.turnMyHole()} title="Turn it (R)">↻</button>
      </div>
      {gh && <p className={`mt-1.5 leading-snug ${gh.why ? 'text-rose-300' : ''}`} data-testid="myhole-status">{gh.why || `Hole ${gh.n} · $${gh.cost.toLocaleString()}${gh.note ? ` · ${gh.note}` : ''}`}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button className="chip" onClick={() => p.setMyHole(null)}>Back to New hole</button>
      </div>
    </div>
  );
}

/** a labelled section of More options */
function Sub({ title, children }: { title: string; children: ReactNode }) {
  return <div className="mt-2.5"><h4 className="sub-head">{title}</h4>{children}</div>;
}

/** More options (P23 4.3): one collapsed drawer in labelled sections, remembered for the session: Shapes (Lasso, Stamps; T238 moved Round
 *  to Shape by hand), Look (My
 *  looks: each surface's look and the style editor, decision 3), Edges (T123's Border and Shadow of the surface in the brush), Planting
 *  (Seed or Sod), and Hole · plants · ground (saved holes, editing a
 *  planned hole, the plant brushes, the ground's height). While one of its tools is in hand it stays open; closing it puts that tool down */
function MoreOptions({ game, looks, onLooks }: { game: Game; looks: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, ui = game.toolUi(), fine = (k: string) => !ui || (ui.visibleFineControls as string[]).includes(k);
  const [open, setOpenState] = useState(() => sessionFlag(MORE_KEY));
  const more = MORE_MODES.has(p.mode), shown = open || more || looks;
  const setOpen = (on: boolean) => { setOpenState(on); setSessionFlag(MORE_KEY, on); if (!on) { if (more) p.setBrush(p.brushKind); onLooks?.(false); } };
  const n = p.brushHole, name = BRUSH_PRESETS.find(b => b.kind === p.brushKind)?.name ?? '';
  const help = p.mode === 'piece' ? `Click to stamp a ${PIECE_BUTTONS.find(b => b.arch === p.pieceArch)?.name ?? 'piece'} for hole ${n} on the mini grid. R turns it, [ ] sizes it.`
    : p.mode === 'draw' ? `Click corners (or press and drag) to lay ${name} for hole ${n}; double-click or Enter closes.`
    : '';
  const lookArm = () => { if (p.mode !== 'brush' && p.mode !== 'draw') p.setBrush(p.brushKind); };
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
              <button className={`chip ${p.mode === 'piece' ? 'chip-on' : ''}`} aria-pressed={p.mode === 'piece'} title="Stamps: the big ready-made shapes (pear fairway, kidney green, pond...), stamped on the mini grid" onClick={() => p.setPiece(p.pieceArch)}>Stamps</button>
            </div>
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
          {GRID_KINDS.includes(p.brushKind) && p.mode !== 'height' && p.mode !== 'plant' && p.mode !== 'hole' && (
            <Sub title="Edges">
              <CourseEdges game={game} />
            </Sub>
          )}
          <Sub title="Look">
            <LooksEntry game={game} looks={looks} onLooks={onLooks} arm={lookArm} />
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
              {game.golfMode && p.hasPlan(n) && <button className="chip" title={`Hole ${n}'s layout: move the tee, the green and the bends; the tee markers and the flag follow, no grass is laid`} onClick={() => p.editPlan(n)}>{`Edit Hole Layout ${n}`}</button>}
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
            {p.mode === 'height' && <GroundHeight game={game} on arm={() => p.setHeight()} />}
          </Sub>
        </div>
      )}
    </section>
  );
}
