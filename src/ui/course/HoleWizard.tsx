import { useEffect, useRef, useState } from 'react';
import type { Game } from '../../game/engine';
import { SURF } from '../../game/ext/course-grid';
import { affordKind, statusIcon } from '../status-icon';
import { SURF_SURFACE } from '../../game/ext/course-grid/areas';
import { aboutMoney, planShape, type WizCheck } from '../../game/ext/hole-wizard';
import { SHAPE_RATE_M3, growInMonths } from '../../game/golf/costs';
import { FRAME_TREE_PRICE } from '../../game/golf/holeframe';
import { SURFACE_BRUSHES, type BrushKind } from '../../game/paint';
import { BrushShape, GrassEdgesEntry, GroundHeight, LooksEntry, SurfaceSwatches, surfaceKeysOf } from './BrushControls';
import { CourseEdges } from './CourseEdges';
import { GRID_KINDS } from '../../game/paint-tool';
import { EditTees } from '../golf/TeeSets';

const STEPS = ['Tee', 'Green', 'Shape'] as const;
/** what each step asks for, under the steps */
const ASK: readonly string[] = ['Click a tee: the camera then frames 450 m round it. Click a built hole\'s line to edit its plan.', 'Click the green, 60 m or more from the tee. Esc moves the tee again.'];
/** the price split's rows (P23 4.3): the surfaces a plan lays, in the card's order */
const SPLIT: readonly [number, string][] = [[SURF.fairway, 'Fairway'], [SURF.green, 'Green'], [SURF.tee, 'Tee'], [SURF.rough, 'Rough']];
/** yards in a metre */
const YD = 1.0936;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

/** the New hole wizard's card (T102, finished in T119: plan P23 4.3 and 4.4), on top of the Holes panel in New hole's place while the plan
 *  mode is on: the hole and its number (Number ▾ offers the free ones), the steps, Build · $X and Cancel on top, par and length, the price
 *  split, Seed (the default) or Sod with what each does to the season, the money line, the check table with its fixes, and the keys. The
 *  map shows the ghost, the handles, the gold Build pill and the label beside the pointer. Self-contained: it reads and drives game.paint.
 *  looks / onLooks: My looks' card (T252: Edit hole's paint section opens it too; App's state, as the Holes panel's) */
export function HoleWizardPanel({ game, looks = false, onLooks }: { game: Game; looks?: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, w = p.wizard;
  const gh = w.step !== 'tee' && w.plan ? w.ghost() : null;
  const c = w.step === 'shape' ? w.check() : null;
  const checks = w.step === 'shape' ? w.checks() : [];
  // T229: Frame with trees on: the Build's price is the hole's and its frame's; T263: and with Shape the ground on, its earthworks
  const fr = w.step === 'shape' && p.frameTrees ? game.wizardFrame?.() : null, earth = w.step === 'shape' ? p.groundCost() : null;
  const total = (gh?.cost ?? 0) + Math.max(0, fr?.price ?? 0) + (earth?.cost ?? 0);
  const step = w.step === 'tee' ? 0 : w.step === 'green' ? 1 : 2;
  const cur = p.brushHole, canEdit = w.step === 'tee' && p.hasPlan(cur);
  const nums = w.base ? [] : p.planNumbers();
  // T205: the editor opening (New hole, or Edit hole from the card or the status line, scrolled down to the badges) brings the panel back to
  // its top, so "New hole n" / "Edit hole n" and its steps show
  const ref = useRef<HTMLDivElement>(null), opened = w.base ? w.hole : 0;
  useEffect(() => { const panel = ref.current?.closest('[data-testid="tool-panel"]'); if (panel) panel.scrollTop = 0; }, [opened]);
  return (
    <div className="wizard-card" data-primary="wizard" ref={ref}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="wiz-title">{w.base ? `Edit Hole Layout ${w.hole}` : `New hole ${w.hole}`}</span>
        {nums.length > 1 && (
          <label className="wiz-num" title="The hole's number: a free one, or after your last hole">
            <span className="sr-only">Number</span>
            <select value={w.hole} onChange={e => p.setPlanHole(+e.target.value)}>
              {nums.map(o => <option key={o.n} value={o.n}>{o.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <ol className="wiz-steps" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < step ? 'wiz-done' : i === step ? 'wiz-now' : ''} aria-current={i === step ? 'step' : undefined}>{i < step ? `✓ ${s}` : `${i + 1} ${s}`}</li>
        ))}
      </ol>
      {w.step === 'shape' && (
        <div className="mt-2 flex items-center gap-1.5">
          <button className="pill-gold wiz-build" disabled={!c?.ok} title={c?.ok ? (w.base ? 'Move the tee markers and the flag to this layout: no grass is laid (Enter, or the gold pill by the green)' : 'Build the hole (Enter, or the gold pill by the green)') : c?.why} onClick={() => p.buildPlan()}>
            <span className="min-w-0 flex-1">{c?.ok && gh ? (w.base ? 'Move tees and flag' : `Build · ${money(total)}`) : 'Build'}</span><kbd>Enter</kbd>
          </button>
          <button className="chip" title="Drop this plan (Esc steps back one stage)" onClick={() => p.cancelPlan()}>Cancel</button>
        </div>
      )}
      {w.step !== 'shape' && <p className="sub-line mt-1.5">{w.suggestM > 0 && step === 1 ? `Point the way: the green sits ${w.suggestM} m out, a par-3 to start with. Esc moves the tee again.` : ASK[step]}</p>}
      {w.step === 'tee' && !w.base && <FromMyHoles game={game} />}
      {w.suggestM > 0 && w.step !== 'shape' && (
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[12px]" data-testid="wiz-par3">
          <span className="text-emerald-300">Suggested: a {w.suggestM} m par-3 for your first hole</span>
          <button className="chip" title="Place the green anywhere, at any length" onClick={() => { w.suggestM = 0; game.emit(); }}>Any length</button>
        </div>
      )}
      {gh && <Stats game={game} />}
      {w.base && w.step === 'shape' && <EditTees game={game} n={w.base.hole} /> /* T268: place, move and remove each tee set */}
      {w.base && w.step === 'shape' && <EditPaint game={game} looks={looks} onLooks={onLooks} />}
      {gh && !w.base && <Planting game={game} /> /* T254: Edit Hole Layout plants nothing */}
      {gh && w.step === 'shape' && !w.base && <Frame game={game} cost={gh.cost} />}
      {gh && w.step === 'shape' && !w.base && <Ground game={game} cost={gh.cost} />}
      {checks.length > 0 && <Checks game={game} rows={checks} />}
      {w.step === 'shape' && (
        <p className="wiz-keys">Drag the line to bend it · amber handles widen · <kbd>R</kbd> turns the green · <kbd>[</kbd> <kbd>]</kbd> size it · <kbd>Ctrl</kbd>+<kbd>Z</kbd> undoes a drag{w.base ? ' or a stroke' : ''} · <kbd>Esc</kbd> steps back</p>
      )}
      <div className="mt-1.5 flex flex-wrap gap-1">
        {w.base && w.step === 'shape' && <DeleteChoice game={game} n={w.base.hole} />}
        {canEdit && <button className="chip" onClick={() => game.editHole(cur)} title="Move this hole's tee markers and flag: no grass is laid">{`Edit Hole Layout ${cur}`}</button>}
        <button className="chip" title="Back to the brush" onClick={() => p.setBrush(p.brushKind)}>Done</button>
      </div>
    </div>
  );
}

/** T256 (#743): Edit hole's Delete hole, a choice: the hole and all its paint (touch-ups included) back to the land with its frame trees, or
 *  its grass kept as your property's paint; one undo step either way */
function DeleteChoice({ game, n }: { game: Game; n: number }) {
  const [ask, setAsk] = useState(false);
  if (!ask) return <button className="chip" title="Delete the hole: with its grass, or keeping its grass as your property's paint (undo brings it back)" onClick={() => setAsk(true)} data-testid="wiz-delete">Delete hole</button>;
  return (
    <div className="mt-1 flex w-full flex-wrap gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 p-2" role="alertdialog" aria-label={`Delete hole ${n}?`} data-testid="wiz-delete-choice">
      <button className="chip border-rose-400/60 text-rose-100" onClick={() => { setAsk(false); game.deleteHole(n, false); }}>Delete hole and its grass</button>
      <button className="chip border-amber-300/60 text-amber-100" onClick={() => { setAsk(false); game.deleteHole(n, true); }}>Delete hole, keep the grass</button>
      <button className="chip" onClick={() => setAsk(false)}>Keep it</button>
    </div>
  );
}

/** T256 (#743): New hole's "From My holes": the player's saved holes (this game's and the browser's), each placed as a ghost (R turns it), a
 *  click builds it as this hole, priced as New hole */
function FromMyHoles({ game }: { game: Game }) {
  const list = game.myHoles?.() ?? [], [open, setOpen] = useState(false);
  if (!list.length) return null;
  return (
    <div className="mt-2" data-testid="from-my-holes">
      <button className="chip" aria-expanded={open} onClick={() => setOpen(!open)}>{`From My holes (${list.length})`} <span aria-hidden>{open ? '▾' : '▸'}</span></button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {list.map((h, i) => (
            <li key={`${h.name}-${i}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate" title={h.name}>{h.name}<span className="sub-line">{`${h.par ? ` · par ${h.par}` : ''}${h.m ? ` · ${h.m} m` : ''}`}</span></span>
              <span className="flex shrink-0 gap-1">
                <button className="chip chip-on" onClick={() => game.paint.setMyHole(h)} title="Place it on the map: R turns it, a click builds it">Place</button>
                <button className="chip" onClick={() => game.forgetMyHole(h)} title="Take it out of My holes" aria-label={`Forget ${h.name}`}>×</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** T238 (the owner, 2026-10-28: "editinghole should be where you can also paint and add to the holes grass"): Edit hole's paint section, the
 *  Shape by hand surfaces (keys 1–8), the brush's shape (Square or Round) and size, and Erase. A stroke paints into this hole, one undo step
 *  a stroke; the plan's handles stay on the map and still drag; the paint stays when Edit hole closes. The lit surface again (or Esc) puts the
 *  brush down. T252: My looks (the look of the surface in hand: course-wide, every hole wears it) and Ground height (Raise, Lower, Smooth,
 *  Flatten: the owner, 2026-10-28: "add the sculpting too to raise and lower and flatten ground to the hole editing"), the handles still
 *  dragging under it; picking a surface puts it down, and Ground height puts the surface brush down */
function EditPaint({ game, looks, onLooks }: { game: Game; looks: boolean; onLooks?: (open: boolean) => void }) {
  const p = game.paint, n = p.editingHole, on = p.mode === 'brush' && p.planOpen, height = p.mode === 'height' && p.planOpen;
  // T271: a custom grass in hand paints too (its swatch after the eight); the lit swatch again puts the brush down
  const gr = on ? p.grass : null, name = gr?.name ?? SURFACE_BRUSHES.find(b => b.kind === p.brushKind)?.name ?? '', keys = surfaceKeysOf(game);
  const pick = (k: BrushKind) => p.setEditBrush(on && p.brushKind === k && !p.grassInHand ? null : k, 0);
  const pickGrass = (k: number) => (on && p.grassInHand === k ? p.setEditBrush(null) : p.setGrass(k));
  const help = on ? `Drag on the map to paint ${name.toLowerCase()} into hole ${n}; the tee, the green and the bends still drag. Esc puts the brush down.`
    : `Pick a surface to paint into hole ${n} (keys 1–${keys}); the tee, the green and the bends still drag.`;
  return (
    <section className="mt-2" aria-label="Paint this hole" data-section="edit-paint">
      <h4 className="sub-head">{`Paint hole ${n}`}</h4>
      <SurfaceSwatches game={game} on={on ? p.brushKind : null} pick={pick} pickGrass={pickGrass} />
      <BrushShape game={game} brush={on} arm={() => p.setEditBrush(p.brushKind)} />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button className={`chip ${on && p.rubOut ? 'chip-on' : ''}`} aria-pressed={on && p.rubOut} title="Erase takes the top surface under the brush (hold Alt for a moment while brushing); no refund" onClick={() => { const v = !(on && p.rubOut); if (!on) p.setEditBrush(p.brushKind); p.rubOut = v; game.emit(); }}>Erase</button>
        <button className={`chip ${height ? 'chip-on' : ''}`} data-ground-height aria-pressed={height} aria-expanded={height} title="Ground height: raise, lower, smooth or flatten the ground round this hole (earthworks are paid for)" onClick={() => p.setEditHeight(height ? null : {})}>Ground height <span aria-hidden>{height ? '▾' : '▸'}</span></button>
        {(on || height) && <button className="chip" title="Put the brush down: the plan's handles alone (Esc)" onClick={() => p.setEditBrush(null)}>Handles only</button>}
      </div>
      {height ? <GroundHeight game={game} on={height} arm={() => p.setEditHeight()} note="The tee, the green and the bends still drag; Esc puts it down." /> : <p className="sub-line mt-1">{help}</p>}
      {/* T253 (#735; the owner, 2026-10-28, editing hole 1: "Edges is just a heading ... there is no checkbox or slider yet to make shit
          rounder"): the surface in hand's Edges, as in More options: its Border, Round off and Smoothness (this hole's look), Shadow, Height */}
      {on && GRID_KINDS.includes(p.brushKind) && (
        <div className="mt-2" data-section="edit-edges">
          <h4 className="sub-head">Edges</h4>
          {gr ? <GrassEdgesEntry game={game} /> : <CourseEdges game={game} />}
        </div>
      )}
      <div className="mt-2">
        <LooksEntry game={game} looks={looks} onLooks={onLooks} arm={() => { if (!on) p.setEditBrush(p.brushKind); }} />
      </div>
    </section>
  );
}

/** par, length and shape, and the price split by surface */
function Stats({ game }: { game: Game }) {
  const w = game.paint.wizard, gh = w.ghost(), pl = w.plan; if (!gh || !pl) return null;
  const split = w.split(), rest = [...split].filter(([s]) => !SPLIT.some(([q]) => q === s)).reduce((a, [, v]) => a + v.cost, 0);
  const earth = w.step === 'shape' && !w.base ? game.paint.groundCost() : null; // T263: Shape the ground's earthworks
  return (
    <div className="wiz-stats">
      <div className="wiz-par">{`Par ${gh.info.par} · ${gh.info.lengthM} m`}</div>
      <div className="sub-line">{`${Math.round(gh.info.lengthM * YD)} yd · ${planShape(pl)}`}{gh.refused ? ` · ${gh.refused.toLocaleString()} m² left out` : ''}</div>
      {w.step === 'shape' && !w.base && (
        <dl className="wiz-split">
          {SPLIT.map(([s, name]) => {
            const v = split.get(s); if (!v) return null;
            return <div key={s}><dt>{s === SURF.green || s === SURF.tee ? `${name} · ${v.cells.toLocaleString()} m²` : name}</dt><dd>{money(v.cost)}</dd></div>;
          })}
          {rest > 0 && <div><dt>Other</dt><dd>{money(rest)}</dd></div>}
          {earth && earth.cost > 0 && <div data-testid="wiz-split-earth"><dt>{`Earthworks · ${Math.round(earth.m3).toLocaleString()} m³`}</dt><dd>{money(earth.cost)}</dd></div>}
        </dl>
      )}
    </div>
  );
}

/** Seed (the default) or Sod (P23 4.4): both prices, what Sod does to the season, and the money line */
function Planting({ game }: { game: Game }) {
  const p = game.paint, w = p.wizard, k = w.costs(); if (!k) return null;
  const sod = p.plantKind === 'sod', cost = sod ? k.sod : k.seed, have = game.money;
  const ratio = k.seed > 0 ? (k.sod / k.seed).toFixed(1) : '1';
  const months = [...w.split().keys()].map(s => { const g = SURF_SURFACE[s]; return g ? growInMonths(g, 'seed') : 0; }).filter(m => m > 0);
  const lo = months.length ? Math.min(...months) : 0, hi = months.length ? Math.max(...months) : 0, grow = lo === hi ? `${lo} months` : `${lo}–${hi} months`;
  const pick = (kind: 'seed' | 'sod') => { p.plantKind = kind; game.emit(); };
  return (
    <section className="mt-2" aria-label="Planting">
      <h4 className="sub-head">Planting</h4>
      <div className="wiz-plant" role="group" aria-label="Seed or Sod">
        <button className={`chip ${!sod ? 'chip-on' : ''}`} aria-pressed={!sod} title="Seed: the cheap way; the grass grows in" onClick={() => pick('seed')}>{`Seed · ${money(k.seed)}`}</button>
        <button className={`chip ${sod ? 'chip-on' : ''}`} aria-pressed={sod} title="Sod: rolls of grown turf, playable at once" onClick={() => pick('sod')}>{`Sod · ${money(k.sod)}`}</button>
      </div>
      <p className="sub-line mt-1">
        {sod
          ? `Sod: ready now, ${ratio} times the price of Seed; nine holes like this would cost about ${aboutMoney(9 * k.sod)}.`
          : `Seed: playable in ${grow}. Sod is ready now but costs ${ratio} times as much: nine holes like this would cost about ${aboutMoney(9 * k.sod)}.`}
      </p>
      <p className="wiz-money">{`Nine holes like this: about ${aboutMoney(9 * cost)} · you have `}<b className={have >= cost ? 'text-emerald-300' : 'text-red-300'}>{`${aboutMoney(have)} ${statusIcon(affordKind(cost, have))}`}</b></p>
    </section>
  );
}

/** T229 (#668): Frame with trees, on by default: Build plants clumps of conifers and autumn trees along the rough's outer edge too (golf/holeframe.ts),
 *  priced per tree; the count and price are worked out once the ghost holds still. Off: the hole card frames it later */
function Frame({ game, cost }: { game: Game; cost: number }) {
  const p = game.paint, on = p.frameTrees, f = on ? game.wizardFrame?.() : null, short = !!f && f.price > 0 && game.money < cost + f.price;
  return (
    <section className="mt-2" aria-label="Trees" data-testid="wiz-frame">
      <h4 className="sub-head">Trees</h4>
      <div className="flex items-center justify-between gap-2">
        <button className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} data-testid="wiz-frame-toggle" title="Clumps of spruce, pine, maple and birch along the rough's outer edge, with gaps: never in the line of play, on a path or on water" onClick={() => p.setFrameTrees(!on)}>{on ? '✓ Frame with trees' : 'Frame with trees'}</button>
        <span className="tabular-nums text-[13px] font-semibold" data-testid="wiz-frame-price">{!on ? 'Off' : f ? (f.trees ? `${f.trees} trees · ${money(f.price)}` : 'No room for a frame here') : 'Working it out…'}</span>
      </div>
      <p className="sub-line mt-1">{on ? `Clumps along the rough's edge, ${money(FRAME_TREE_PRICE)} a tree, clear of the line of play, the landing zones, paths, water and the cart lanes. Bulldoze one to open a view.` : 'Build plants no trees: frame the hole later from its card.'}</p>
      {short && <p className="mt-1 text-[12px] text-amber-300"><span aria-hidden>! </span>Not enough money for all of it: Build plants the clumps the rest pays for.</p>}
    </section>
  );
}

/** T263 (#771): Shape the ground, on by default, beside Frame with trees: Build shapes the new hole's ground too (ext/hole-ground: gentle rolls
 *  along the fairway, low mounds and a swale in the rough, the green tilted up from front to back, the tee level), priced as earthworks (the
 *  earth moved, m³, at SHAPE_RATE_M3: shaped while the hole is built, a third of the brush's rate) in the same undo step. Off: the hole is
 *  laid on the ground as it is */
function Ground({ game, cost }: { game: Game; cost: number }) {
  const p = game.paint, on = p.shapeGround, e = on ? p.groundCost() : null, short = !!e && e.cost > 0 && game.money < cost + e.cost;
  return (
    <section className="mt-2" aria-label="Ground" data-testid="wiz-ground">
      <h4 className="sub-head">Ground</h4>
      <div className="flex items-center justify-between gap-2">
        <button className={`chip ${on ? 'chip-on' : ''}`} aria-pressed={on} data-testid="wiz-ground-toggle" title="Gentle rolls along the fairway, low mounds and a swale in the rough, the green tilted up from front to back; the tee stays level, and roads, paths and other holes are left as they are" onClick={() => p.setShapeGround(!on)}>{on ? '✓ Shape the ground' : 'Shape the ground'}</button>
        <span className="tabular-nums text-[13px] font-semibold" data-testid="wiz-ground-price">{!on ? 'Off' : e ? `${Math.round(e.m3).toLocaleString()} m³ · ${money(e.cost)}` : 'Nothing to shape here'}</span>
      </div>
      <p className="sub-line mt-1">{on ? `Rolls along the fairway, mounds round it and the green, the green tilted front to back. Shaped while it is built: ${money(SHAPE_RATE_M3)} a m³; Undo takes them back with the grass.` : 'Build lays the hole on the ground as it is: shape it later with Edit hole\'s Ground height.'}</p>
      {short && <p className="mt-1 text-[12px] text-amber-300"><span aria-hidden>! </span>Not enough money for the earthworks too: Build lays the hole on the ground as it is.</p>}
    </section>
  );
}

/** the check table (P23 4.4): blocks in red, warnings in amber, passed checks ticked; each with its fix */
function Checks({ game, rows }: { game: Game; rows: WizCheck[] }) {
  const p = game.paint;
  return (
    <section className="mt-2" aria-label="Checks">
      <h4 className="sub-head">Checks</h4>
      <ul className="wiz-checks">
        {rows.map(r => (
          <li key={r.id} data-check={r.id} className={`wiz-${r.kind}`}>
            <span className="wiz-mark" aria-hidden>{r.kind === 'block' ? '✕' : r.kind === 'warn' ? '!' : r.kind === 'info' ? 'i' : '✓'}</span>
            <span className="min-w-0 flex-1">{r.kind === 'block' ? <span className="sr-only">Blocks Build: </span> : r.kind === 'warn' ? <span className="sr-only">Warning: </span> : r.kind === 'info' ? <span className="sr-only">Info: </span> : null}{r.text}</span>
            {r.fix === 'seed' && <button className="chip" onClick={() => { p.plantKind = 'seed'; game.emit(); }}>Use Seed</button>}
            {r.show && r.kind !== 'ok' && <button className="chip" onClick={() => p.showMe(r.show!)}>Show me</button>}
            {/* T200: off your land: the land for sale there */}
            {game.golfMode && (r.id === 'land' || (r.id === 'left' && /not your land/.test(r.text))) && <button className="chip chip-on" data-testid="refusal-land" onClick={() => game.openLandSale(r.show?.[0] ?? null)}>Land for sale</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
