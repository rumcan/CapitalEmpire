// The course brush's own controls, shared by Shape by hand (CoursePanel) and Edit hole's paint section (HoleWizard, T238): the surfaces as
// swatches with their keys (T252: each a puck of the surface's real texture with its border, as the cursor shows it), the brush's shape and
// size: Square (1 to 4 cells, the pills) or Round (T238: a circle on the map, sized by the slider, which draws as a 2:1 ellipse on screen),
// the look of the surface in hand (My looks, T252 in Edit hole too) and the ground's height (T252: Ground height in Edit hole too).
// Self-contained: they read and drive game.paint.
import { useState } from 'react';
import type { Game } from '../../game/engine';
import { PAINT_TEXES, SURFACE_BRUSHES, type BrushKind } from '../../game/paint';
import { MAX_GRASSES } from '../../game/ext/course-grid';
import { GRASS_FAMILIES, GRASS_KIND, GRASS_PLAYS } from '../../game/golf/grasses';
import { EARTHWORK_PER_M3 } from '../../game/golf/costs';
import { SQUARE_SIZES } from '../../game/ext/course-cursor/snap';
import { plainName } from '../../PaintPanel';
import { lookWhat } from '../../game/golf/looks';
import { SurfaceMark } from './SurfaceMark';
import { grassPuckImage, swatchPuckOf, useSwatchPucks } from './swatch-puck';

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

/** the surfaces Holes may paint at this stage (progressive UI), as brush kinds */
export function brushOkOf(game: Game): (kind: string) => boolean {
  const ui = game.toolUi();
  return k => !ui || (ui.visibleCourseBrushes as string[]).includes(k);
}
/** the last surface key in force (1 to 8: SURFACE_BRUSHES' order, the surfaces open at this stage) */
export function surfaceKeysOf(game: Game): number {
  const ok = brushOkOf(game);
  return Math.max(1, ...SURFACE_BRUSHES.map((b, i) => (ok(b.kind) ? i + 1 : 0)));
}

/** the surfaces as swatches with their keys (SURFACE_BRUSHES' order: 1 fairway .. 8 long grass; T252: no cart path, Course › Cart paths & roads
 *  lays them), those open at this stage, in an even grid of four columns; each swatch is the surface's puck (swatch-puck.ts: its real texture
 *  and border; its marked disc under plain node), its name under it and its key in the corner. `on` is the surface in hand (none: no swatch
 *  lit), `pick` arms one */
export function SurfaceSwatches({ game, on, pick, pickGrass }: { game: Game; on: BrushKind | null; pick: (kind: BrushKind) => void; pickGrass?: (k: number) => void }) {
  const ok = brushOkOf(game), p = game.paint;
  // T271 (#812): the course's own grasses after the eight, each its puck and Shift + its place as its key, then 9, Create your own (a golf
  // course's grid only: a classic game paints areas). A grass in hand lights its own swatch, not its carrier surface's
  const own = game.golfMode && !!game.courseGrid && !!p.grasses, gk = on ? p.grassInHand ?? 0 : 0;
  useSwatchPucks();
  return (
    <>
      <div className="swatches" role="group" aria-label="Surface">
        {SURFACE_BRUSHES.map((b, i) => {
          if (!ok(b.kind)) return null;
          const lit = on === b.kind && !gk, puck = swatchPuckOf(game, b.kind);
          return (
            <button key={b.kind} data-swatch={b.kind} aria-pressed={lit} title={`${b.name} (key ${i + 1})`} className={`swatch ${lit ? 'swatch-on' : ''}`} data-puck={puck ? 'texture' : 'mark'} onClick={() => pick(b.kind)}>
              <span className="swatch-puck">{puck ? <img src={puck.url} width={puck.w} height={puck.h} alt="" draggable={false} /> : <SurfaceMark kind={b.kind} size={40} />}</span>
              <span className="swatch-key" aria-hidden>{i + 1}</span>
              <span className="swatch-name">{b.name}</span>
            </button>
          );
        })}
        {own && p.grasses.map((g, i) => {
          const lit = gk === g.k, puck = grassPuckImage(game, g), play = GRASS_PLAYS.find(q => q.play === g.plays)?.name ?? '';
          return (
            <button key={`own-${g.k}`} data-swatch={`grass-${g.k}`} aria-pressed={lit} title={`${g.name}: your own grass, plays as ${play.toLowerCase()} (Shift+${i + 1})`} className={`swatch ${lit ? 'swatch-on' : ''}`} data-puck={puck ? 'texture' : 'mark'} onClick={() => (pickGrass ?? (k => p.setGrass(k)))(g.k)}>
              <span className="swatch-puck">{puck ? <img src={puck.url} width={puck.w} height={puck.h} alt="" draggable={false} /> : <SurfaceMark kind={GRASS_KIND[g.plays]} size={40} />}</span>
              <span className="swatch-key" aria-hidden>{`⇧${i + 1}`}</span>
              <span className="swatch-name">{g.name}</span>
            </button>
          );
        })}
        {own && p.grasses.length < MAX_GRASSES && (
          <button key="own-new" data-swatch="grass-new" aria-pressed={!!p.grassDraft && !p.grassDraft.k} title="Create your own grass: its name, how it plays, its painted grass, scale, exposure, stripes and edges (key 9)" className={`swatch ${p.grassDraft && !p.grassDraft.k ? 'swatch-on' : ''}`} onClick={() => p.openGrass()}>
            <span className="swatch-puck"><NewGrassMark /></span>
            <span className="swatch-key" aria-hidden>9</span>
            <span className="swatch-name">Create your own</span>
          </button>
        )}
      </div>
      {own && <GrassInHand game={game} />}
    </>
  );
}
/** T271: More options › Edges (and Edit hole's) with a custom grass in hand: its Border, Round off and Shadow are its own, set in its editor */
export function GrassEdgesEntry({ game }: { game: Game }) {
  const p = game.paint, g = p.grass; if (!g) return null;
  const parts = [g.border > 0 ? `Border ${g.border < 1 ? `${Math.round(g.border * 100)} cm` : `${g.border.toFixed(1)} m`}` : 'Border none', g.round ? `Round off ${Math.round(g.smooth * 100)}%` : 'not rounded', `Shadow ${Math.round(g.shadow * 100)}%`];
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5" data-edges="grass">
      <span className="sub-line">{parts.join(' · ')}</span>
      <button className="chip" onClick={() => p.openGrass(g.k)}>{`Edit in ${g.name}`} <span aria-hidden>▸</span></button>
    </div>
  );
}
/** T271: Create your own's mark: an empty puck with a plus */
function NewGrassMark() {
  return (
    <svg width={44} height={30} viewBox="0 0 44 30" aria-hidden>
      <path d="M2 13 V18 A20 10 0 0 0 42 18 V13 Z" fill="rgba(74,58,40,0.85)" />
      <ellipse cx="22" cy="13" rx="20" ry="10" fill="rgba(93,122,46,0.35)" stroke="rgba(255,246,214,0.55)" strokeWidth="1.2" strokeDasharray="3 2.5" />
      <path d="M22 8 V18 M17 13 H27" stroke="var(--gold-hi, #f3d58a)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
/** T271: the custom grass in hand: what it plays as, Edit (its editor) and Delete (asks first: its cells take the surface it plays as) */
function GrassInHand({ game }: { game: Game }) {
  const p = game.paint, g = p.grass, [ask, setAsk] = useState(0);
  if (!g || (p.mode !== 'brush' && p.mode !== 'draw')) return null;
  const play = GRASS_PLAYS.find(q => q.play === g.plays)?.name ?? '';
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="grass-in-hand">
      <span className="sub-line">{`${g.name} plays as ${play.toLowerCase()}`}</span>
      {ask === g.k ? (<>
        <span className="text-rose-300">{`Delete ${g.name}? Its cells become plain ${g.plays === 'firstCut' ? 'rough' : play.toLowerCase()}.`}</span>
        <button className="chip" data-testid="grass-delete-yes" onClick={() => { p.deleteGrass(g.k); setAsk(0); }}>Delete</button>
        <button className="chip" onClick={() => setAsk(0)}>Keep</button>
      </>) : (<>
        <button className={`chip ${p.grassDraft?.k === g.k ? 'chip-on' : ''}`} data-testid="grass-edit" onClick={() => p.openGrass(g.k)}>Edit <span aria-hidden>▸</span></button>
        <button className="chip" data-testid="grass-delete" title={`Delete ${g.name}: its cells keep how they play and take that surface's own look (Undo brings it back)`} onClick={() => setAsk(g.k)}>Delete</button>
      </>)}
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Paint over" data-replace={p.paintReplace ? 'replace' : 'layer'}>
        <button className={`chip ${!p.paintReplace ? 'chip-on' : ''}`} aria-pressed={!p.paintReplace} title="Layer under: the brush slides past the surfaces drawn above it (rough stays under a fairway, a fairway under a green)" onClick={() => p.setPaintReplace(false)}>Layer under</button>
        <button className={`chip ${p.paintReplace ? 'chip-on' : ''}`} aria-pressed={p.paintReplace} title="Replace: the brush paints over whatever is there (rough over a fairway, fairway over a green)" onClick={() => p.setPaintReplace(true)}>Replace</button>
      </div>
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

/** a texture's plain name (the brush look's: My looks), from its id */
export const lookName = (tex: string) => plainName(PAINT_TEXES.find(t => t.id === tex)?.name ?? tex);
/** T271: a painted grass family's name (the grass editor's texture list) */
export const familyName = (id: string) => GRASS_FAMILIES.find(f => f.id === id)?.name ?? id;

/** My looks (P23 decision 3; T252 in Edit hole too: the owner, 2026-10-28: "i dont see the button that lets me customise textures for the
 *  bunker or anything i build on this hole"): the surface in hand and its look, a button that opens the style editor's card beside the panel
 *  (App's state: Esc closes it first). A look is course-wide: every cell of that surface on the course wears it, on every hole. `arm` takes
 *  the surface brush in hand first (the card edits the brush's look) */
export function LooksEntry({ game, looks, onLooks, arm }: { game: Game; looks: boolean; onLooks?: (open: boolean) => void; arm: () => void }) {
  // T256 (#743): a look belongs to where it is painted: the hole in hand, the property (Range › Build), a facility; the entry says whose
  const p = game.paint, name = SURFACE_BRUSHES.find(b => b.kind === p.brushKind)?.name ?? '', owner = p.lookOwner ?? 'default';
  const tex = (p.lookOf ? p.lookOf(owner, p.brushKind)?.tex : p.brush[p.brushKind]?.style.tex) ?? '', what = lookWhat(p.brushKind, owner);
  // T271: a custom grass in hand is edited in its own editor (its look is the course's, not a hole's)
  const g = p.grass;
  if (g) return (
    <div className="flex items-center justify-between gap-2" data-testid="looks-entry">
      <span>Your grass</span>
      <button className={`chip ${p.grassDraft?.k === g.k ? 'chip-on' : ''}`} data-looks aria-pressed={p.grassDraft?.k === g.k} title={`${g.name}: its texture, scale, exposure, stripes and edges (every cell of it on the course)`} onClick={() => { onLooks?.(false); p.openGrass(g.k); }}>{`${g.name}: ${familyName(g.family)}`} <span aria-hidden>▸</span></button>
    </div>
  );
  return (
    <div className="flex items-center justify-between gap-2" data-testid="looks-entry">
      <span>My looks</span>
      <button className={`chip ${looks ? 'chip-on' : ''}`} data-looks aria-pressed={looks} title={`${what}: only they wear this look (the others keep their own); the puck at the pointer shows it`} onClick={() => { arm(); p.closeGrass?.(); onLooks?.(!looks); }}>{`${name}: ${lookName(tex)}`} <span aria-hidden>▸</span></button>
    </div>
  );
}

/** Ground height (T252, shared by Shape by hand's More options and Edit hole: the owner, 2026-10-28: "add the sculpting too to raise and
 *  lower and flatten ground to the hole editing"): Raise, Lower, Smooth or Flatten, the brush's size and strength, and what a drag does.
 *  `on` is whether the height brush is in hand (its chips light up only then); `arm` takes it in hand first (Shape by hand: setHeight;
 *  Edit hole: setEditHeight, the plan's handles kept); `note` ends its line (Edit hole: the handles still drag). Each stroke is one undo step */
export function GroundHeight({ game, on, arm, note = '' }: { game: Game; on: boolean; arm: () => void; note?: string }) {
  const p = game.paint, set = (o: Parameters<typeof p.setHeight>[0]) => () => { if (!on) arm(); p.setHeight(o); };
  return (
    <div data-testid="ground-height">
      <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-label="Ground height">
        {(['raise', 'lower', 'smooth', 'flatten'] as const).map(m => <button key={m} className={`chip ${on && p.heightMode === m ? 'chip-on' : ''}`} aria-pressed={on && p.heightMode === m} onClick={set({ mode: m })}>{m[0]!.toUpperCase() + m.slice(1)}</button>)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button className="chip" title="[" onClick={set({ r: p.heightR - 2 })}>Smaller</button>
        <button className="chip" title="]" onClick={set({ r: p.heightR + 2 })}>Bigger</button>
        <span>{`${p.heightR} tiles`}</span>
        <button className="chip" onClick={set({ level: p.heightLevel - 1 })}>Gentler</button>
        <button className="chip" onClick={set({ level: p.heightLevel + 1 })}>Stronger</button>
        <span>{`Strength ${p.heightLevel}/5`}</span>
      </div>
      <div className="sub-line mt-1.5">{`Drag to ${p.heightMode} the ground (subtle: ±3 m at most). Smooth evens out bumps, Flatten brings it back to level. Roads stay flat. [ ] size.${game.golfMode ? ` Earthworks cost $${EARTHWORK_PER_M3} a m³.` : ''}${note ? ` ${note}` : ''}`}</div>
    </div>
  );
}
