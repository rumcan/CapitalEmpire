// The course brush's own controls, shared by Shape by hand (CoursePanel) and Edit hole's paint section (HoleWizard, T238): the surfaces as
// marked swatches with their keys, and the brush's shape and size: Square (1 to 4 cells, the pills) or Round (T238: a circle on the map, sized
// by the slider, which draws as a 2:1 ellipse on screen). Self-contained: they read and drive game.paint.
import type { Game } from '../../game/engine';
import { BRUSH_PRESETS, type BrushKind } from '../../game/paint';
import { SQUARE_SIZES } from '../../game/ext/course-cursor/snap';
import { SurfaceMark } from './SurfaceMark';

/** a k x k grid of dots, the size pills' glyph */
export function SizeGlyph({ k }: { k: number }) {
  const s = 12, d = s / k;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden className="shrink-0">
      {Array.from({ length: k * k }, (_, i) => <rect key={i} x={(i % k) * d + 0.6} y={Math.floor(i / k) * d + 0.6} width={d - 1.2} height={d - 1.2} rx={k === 1 ? 2 : 0.6} fill="currentColor" />)}
    </svg>
  );
}
/** the brush shapes' glyphs: a cell square seen on the map (a diamond), or a circle on the map (a 2:1 ellipse) */
function ShapeGlyph({ round }: { round: boolean }) {
  return (
    <svg width={16} height={10} viewBox="0 0 16 10" aria-hidden className="shrink-0">
      {round ? <ellipse cx="8" cy="5" rx="7" ry="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <path d="M8 1.2 L14.6 5 L8 8.8 L1.4 5 Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />}
    </svg>
  );
}

/** the surfaces Holes may paint at this stage (progressive UI), as BRUSH_PRESETS kinds */
export function brushOkOf(game: Game): (kind: string) => boolean {
  const ui = game.toolUi();
  return k => !ui || (ui.visibleCourseBrushes as string[]).includes(k);
}

/** the surfaces as marked swatches with their keys (BRUSH_PRESETS' order: 1 fairway .. 9 long grass), those open at this stage; `on` is the
 *  surface in hand (none: no swatch lit), `pick` arms one */
export function SurfaceSwatches({ game, on, pick }: { game: Game; on: BrushKind | null; pick: (kind: BrushKind) => void }) {
  const ok = brushOkOf(game);
  return (
    <div className="swatches" role="group" aria-label="Surface">
      {BRUSH_PRESETS.map((b, i) => {
        if (!ok(b.kind)) return null;
        const lit = on === b.kind;
        return (
          <button key={b.kind} data-swatch={b.kind} aria-pressed={lit} title={`${b.name} (key ${i + 1})`} className={`swatch ${lit ? 'swatch-on' : ''}`} onClick={() => pick(b.kind)}>
            <span className="swatch-disc"><SurfaceMark kind={b.kind} size={34} /></span>
            <span className="swatch-key" aria-hidden>{i + 1}</span>
            <span className="swatch-name">{b.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** the brush's shape, Square or Round (T238, remembered), and its size: the square's pills (1 to 4 cells) or the round brush's slider (the
 *  surface's radius, tiles; shown as metres across). `brush` is whether the brush is in hand (the chips light up only then); `arm` takes
 *  it in hand first when a chip is pressed without it */
export function BrushShape({ game, brush, arm }: { game: Game; brush: boolean; arm?: () => void }) {
  const p = game.paint, cells = p.brushCells, round = cells === 0, r = p.brush[p.brushKind]?.r ?? 1;
  const go = (f: () => void) => () => { if (!brush) arm?.(); f(); };
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brush shape" data-shape={round ? 'round' : 'square'}>
        <button className={`chip ${brush && !round ? 'chip-on' : ''}`} aria-pressed={brush && !round} title="Square: whole 1 m cells, 1 to 4 a side" onClick={go(() => p.setBrushShape('square'))}><ShapeGlyph round={false} />Square</button>
        <button className={`chip ${brush && round ? 'chip-on' : ''}`} aria-pressed={brush && round} title="Round: a circle on the map, for round greens and bunkers (the slider sizes it)" onClick={go(() => p.setBrushShape('round'))}><ShapeGlyph round />Round</button>
      </div>
      {round ? (
        <div className="mt-2 flex items-center gap-2" data-testid="round-size">
          <input type="range" aria-label="Round brush size" min={0.5} max={20} step={0.5} value={r} onChange={e => { if (!brush) arm?.(); p.setBrushR(+e.target.value); }} className="min-w-0 flex-1" />
          <span className="w-16 text-right" title={`${r} tiles across the radius ([ ] size)`}>{`${Math.round(4 * r)} m`}</span>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Brush size">
          {SQUARE_SIZES.map(k => (
            <button key={k} className={`chip ${brush && cells === k ? 'chip-on' : ''}`} aria-pressed={brush && cells === k} title={k === 1 ? 'One 1 m cell ([ ] size)' : `${k * k} cells, ${k} m a side${k === 2 ? ': one town square' : ''} ([ ] size)`} onClick={go(() => p.setBrushCells(k))}>
              <SizeGlyph k={k} />{k === 1 ? '1' : `${k}×${k}`}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
