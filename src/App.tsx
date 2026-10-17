import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Game } from './game/engine';
import { LIBRARY } from './game/library';
import { TERRAINS, type Tool } from './game/types';
import { CLASSES, JUNCTIONS } from './game/network';
import { ZOOM_MAX, ZOOM_MIN } from './game/iso';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select / Pan', key: 'V', icon: '🖱️' },
  { id: 'road', label: 'Roads', key: 'R', icon: '🛣️' },
  { id: 'junction', label: 'Junctions', key: 'J', icon: '🚦' },
  { id: 'objects', label: 'Build', key: 'B', icon: '🏠' },
  { id: 'terrain', label: 'Terrain', key: 'T', icon: '🌿' },
  { id: 'bulldoze', label: 'Bulldoze', key: 'X', icon: '🚜' },
];
const money = (n: number) => '$' + Math.round(n).toLocaleString();

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = new Game(canvas);
    (window as unknown as { __game: Game }).__game = g;
    setGame(g);
    const unsub = g.subscribe(bump);
    g.init();
    const wheel = (e: WheelEvent) => g.wheel(e);
    canvas.addEventListener('wheel', wheel, { passive: false });
    const kd = (e: KeyboardEvent) => g.keyDown(e), ku = (e: KeyboardEvent) => g.keyUp(e);
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const iv = window.setInterval(bump, 500);
    return () => { unsub(); g.destroy(); canvas.removeEventListener('wheel', wheel); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); clearInterval(iv); };
  }, []);

  const cats = useMemo(() => [...new Set(LIBRARY.map(i => i.cat))], []);
  const [cat, setCat] = useState<string>('Houses');
  const toasts = game ? game.toasts.filter(t => performance.now() - t.t < 4000) : [];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#1b2816] text-slate-100 select-none" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: game?.tool === 'select' ? (game.hoverProp ? 'pointer' : 'grab') : 'crosshair' }}
        onPointerDown={e => game?.pointerDown(e.nativeEvent)}
        onPointerMove={e => game?.pointerMove(e.nativeEvent)}
        onPointerUp={() => game?.pointerUp()}
        onPointerLeave={() => game?.pointerLeave()}
        onDoubleClick={() => game?.doubleClick()}
        onContextMenu={e => e.preventDefault()}
      />

      {game && !game.ready && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#15200f]">
          <div className="text-3xl font-bold tracking-tight text-amber-200">Maple Falls</div>
          <div className="mt-1 text-sm uppercase tracking-[0.3em] text-amber-400/80">Town Builder</div>
          <div className="mt-6 h-2 w-64 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.round(game.loadProgress * 100)}%` }} />
          </div>
          <div className="mt-2 text-xs text-slate-400">Painting ground textures and unpacking sprites…</div>
        </div>
      )}

      {game && game.ready && (
        <>
          <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-start justify-between p-3">
            <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/75 px-4 py-2 shadow-lg backdrop-blur">
              <div>
                <div className="text-base font-bold leading-tight text-amber-200">Maple Falls</div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-amber-400/70">Town Builder</div>
              </div>
              <div className="mx-1 h-8 w-px bg-white/10" />
              <Stat label="Treasury" value={money(game.money)} tone={game.money < 0 ? 'text-red-300' : 'text-emerald-300'} />
              <Stat label="Population" value={game.population.toLocaleString()} />
              <Stat label="Day" value={String(game.day)} sub={`next in ${Math.max(0, Math.ceil(20 - game.dayTimer))}s`} />
              <Stat label="Daily income" value={(game.lastIncome >= 0 ? '+' : '') + money(game.lastIncome)} tone={game.lastIncome >= 0 ? 'text-emerald-300' : 'text-red-300'} />
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 px-2 py-1.5 shadow-lg backdrop-blur">
                <button className="btn" onClick={() => game.zoomAt(Math.max(ZOOM_MIN, game.cam.z / 1.25))} title="Zoom out (-)">−</button>
                <input type="range" min={ZOOM_MIN} max={ZOOM_MAX} step={0.005} value={game.cam.z} onChange={e => game.zoomAt(+e.target.value)} className="w-28 accent-amber-400" />
                <button className="btn" onClick={() => game.zoomAt(Math.min(ZOOM_MAX, game.cam.z * 1.25))} title="Zoom in (+)">+</button>
                <span className="ml-1 w-14 text-right text-xs tabular-nums text-slate-300" title="Zoom relative to the town builder's 100%">{Math.round(game.cam.z * 100)}%</span>
              </div>
              <button className={`btn ${game.showGrid ? 'bg-amber-400/20 text-amber-200' : ''}`} onClick={() => { game.showGrid = !game.showGrid; bump(); }} title="Toggle tile grid (G)">Grid</button>
              <button className="btn" onClick={() => game.save()} title="Saved automatically; force a save now">Save</button>
              <button className="btn" onClick={() => { if (confirm('Start a fresh Maple Falls starter town? Your current town will be replaced.')) game.newTown(); }}>New town</button>
              <button className="btn" onClick={() => { if (confirm('Clear everything and start from an empty field?')) game.clearTown(); }}>Empty map</button>
              <button className="btn" onClick={() => setHelp(true)}>?</button>
            </div>
          </div>

          <div className="absolute left-3 top-24 z-20 flex items-start gap-2">
            <div className="flex flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/80 p-1.5 shadow-lg backdrop-blur">
              {TOOLS.map(t => (
                <button key={t.id} onClick={() => game.setTool(t.id)} title={`${t.label} (${t.key})`}
                  className={`flex h-12 w-14 flex-col items-center justify-center rounded-lg text-[10px] leading-tight transition ${game.tool === t.id ? 'bg-amber-400 text-slate-900 shadow' : 'text-slate-300 hover:bg-white/10'}`}>
                  <span className="text-lg leading-none">{t.icon}</span>
                  <span className="mt-0.5">{t.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            <div className="w-[310px] rounded-xl border border-white/10 bg-slate-950/80 p-3 shadow-lg backdrop-blur">
              {game.tool === 'road' && <RoadPanel game={game} />}
              {game.tool === 'junction' && <JunctionPanel game={game} />}
              {game.tool === 'objects' && <ObjectsPanel game={game} cats={cats} cat={cat} setCat={setCat} />}
              {game.tool === 'terrain' && <TerrainPanel game={game} />}
              {game.tool === 'bulldoze' && (
                <Panel title="Bulldoze">
                  <p className="text-xs text-slate-300">Click an object to remove it (half its price is refunded). Click or drag along a road to tear it up piece by piece — the ends become cul-de-sacs and curbs, corners, crossings and markings redraw themselves instantly.</p>
                </Panel>
              )}
              {game.tool === 'select' && <SelectPanel game={game} />}
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/75 px-4 py-1.5 text-xs text-slate-300 shadow-lg backdrop-blur">
            {hintFor(game)}
          </div>

          <div className="pointer-events-none absolute left-1/2 top-20 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
            {toasts.map(t => (
              <div key={t.id} className={`rounded-lg px-3 py-1.5 text-sm shadow-lg ${t.kind === 'warn' ? 'bg-red-500/90 text-white' : t.kind === 'good' ? 'bg-emerald-500/90 text-white' : 'bg-slate-800/90 text-slate-100'}`}>{t.text}</div>
            ))}
          </div>

          {help && <Help onClose={() => setHelp(false)} />}
        </>
      )}
      <style>{`.btn{border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(2,6,23,.75);padding:.35rem .7rem;font-size:.75rem;color:#e2e8f0;backdrop-filter:blur(6px)}.btn:hover{background:rgba(255,255,255,.12)}.chip{border-radius:.5rem;border:1px solid rgba(255,255,255,.1);padding:.3rem .55rem;font-size:.7rem;color:#cbd5e1}.chip:hover{background:rgba(255,255,255,.1)}.chip-on{background:rgba(251,191,36,.9);color:#0f172a;border-color:transparent}.card{display:flex;flex-direction:column;align-items:flex-start;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);padding:.4rem .55rem;text-align:left}.card:hover{background:rgba(255,255,255,.08)}.card-on{border-color:#fbbf24;background:rgba(251,191,36,.18)}`}</style>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="px-1">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-sm font-semibold tabular-nums leading-tight ${tone ?? ''}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div><div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{title}</div>{children}</div>);
}

function RoadPanel({ game }: { game: Game }) {
  const legs = game.previewLegs();
  const len = game.net.legsLength(legs);
  const cost = game.routeCost();
  const cls = game.cls;
  return (
    <Panel title="Building new roads">
      <p className="text-xs leading-relaxed text-slate-300">
        <b className="text-slate-100">Draw a connected route.</b> Click to start, click again for each bend or stop. Routes snap to the grid; crossings become junctions with rounded corners and crossings automatically.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {CLASSES.map((c, i) => (
          <button key={c.id} className={`card ${game.roadClass === c.id ? 'card-on' : ''}`} onClick={() => { game.roadClass = c.id; game.emit(); }} title={`Key ${i + 1}`}>
            <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">{c.name}</span><span className="text-amber-300">{money(c.cost)} / 2 m</span></div>
            <div className="text-[10px] text-slate-400">{c.desc}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs">
        <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Bends</span>
        {([90, 45] as const).map(b => <button key={b} className={`chip ${game.bendMode === b ? 'chip-on' : ''}`} onClick={() => { game.bendMode = b; game.emit(); }} title="Q toggles">{b}°</button>)}
        <span className="ml-auto text-[10px] text-slate-500">Shift: straight line</span>
      </div>
      {cls.centre === 'style' && (
        <div className="mt-2 flex items-center gap-1">
          <span className="mr-1 text-[10px] uppercase tracking-wider text-slate-400">Centre line</span>
          {([['Dashed', 0], ['Double', 1], ['None', 2]] as const).map(([n, v]) => (
            <button key={v} className={`chip ${game.lineStyle === v ? 'chip-on' : ''}`} onClick={() => { game.lineStyle = v; game.emit(); }}>{n}</button>
          ))}
        </div>
      )}
      <div className="mt-2 rounded-lg bg-white/5 p-2 text-xs">
        <div className="flex justify-between"><span className="text-slate-400">Route</span><span>{game.route.length} point{game.route.length === 1 ? '' : 's'} · {Math.round(len * 2)} m</span></div>
        <div className="flex justify-between"><span className="text-slate-400">Cost</span><span className={cost > game.money ? 'text-red-300' : 'text-emerald-300'}>{money(cost)}</span></div>
      </div>
      <div className="mt-2 flex gap-1">
        <button className="chip chip-on flex-1 disabled:opacity-40" disabled={game.route.length < 2} onClick={() => game.finishRoute()}>Build route ⏎</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.undoRoutePoint()} title="Backspace">Undo</button>
        <button className="chip" disabled={!game.route.length} onClick={() => game.cancelRoute()} title="Esc">Cancel</button>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Double-click the last point or press Enter to build. Drawing over an existing road upgrades it. Trees and small items in the way are cleared; buildings block the route.</p>
    </Panel>
  );
}

function JunctionPanel({ game }: { game: Game }) {
  const n = game.hoverNode;
  return (
    <Panel title="Junctions">
      <p className="text-xs text-slate-300">Pick a type, then click a junction. Lights add stop lines and signals on every corner; slipways add channelised turn lanes with islands (needs long approaches); roundabouts get a planted island.</p>
      <div className="mt-2 grid grid-cols-1 gap-1">
        {JUNCTIONS.map(j => (
          <button key={j.id} className={`card ${game.junctionType === j.id ? 'card-on' : ''}`} onClick={() => { game.junctionType = j.id; game.emit(); }}>
            <div className="flex w-full items-center justify-between text-xs"><span className="font-semibold text-slate-100">{j.name}</span><span className="text-amber-300">{j.cost ? money(j.cost) : 'free'}</span></div>
            <div className="text-[10px] text-slate-400">{j.desc}</div>
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{n ? `Junction of ${n.arms.length} roads (${JUNCTIONS.find(j => j.id === n.type)?.name.toLowerCase()}) — click to convert` : 'Hover a junction to highlight it.'}</p>
    </Panel>
  );
}

function TerrainPanel({ game }: { game: Game }) {
  return (
    <Panel title="Terrain">
      <div className="grid grid-cols-2 gap-1">
        {TERRAINS.map(t => (
          <button key={t.id} onClick={() => { game.terrainType = t.id; game.emit(); }}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs ${game.terrainType === t.id ? 'border-amber-400 bg-amber-400/20' : 'border-white/10 hover:bg-white/10'}`}>
            <span className="h-5 w-5 rounded" style={{ background: t.color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.4)' }} />{t.name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs"><span className="text-slate-400">Brush</span>
        <input type="range" min={1} max={6} value={game.brush} onChange={e => { game.brush = +e.target.value; game.emit(); }} className="flex-1 accent-amber-400" /><span className="w-4 tabular-nums">{game.brush}</span></div>
      <p className="mt-2 text-[11px] text-slate-500">Paint lots, parks, fields and plazas. Paving and concrete pads cross the sidewalk, so you can lay driveways up to the curb.</p>
    </Panel>
  );
}

function ObjectsPanel({ game, cats, cat, setCat }: { game: Game; cats: string[]; cat: string; setCat: (c: string) => void }) {
  const items = LIBRARY.map((it, i) => ({ it, i })).filter(x => x.it.cat === cat);
  const sel = LIBRARY[game.libIndex];
  return (
    <Panel title="Build">
      <div className="flex flex-wrap gap-1">
        {cats.map(c => <button key={c} className={`chip ${cat === c ? 'chip-on' : ''}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      <div className="mt-2 grid max-h-[40vh] grid-cols-3 gap-1 overflow-y-auto pr-1">
        {items.map(({ it, i }) => (
          <button key={it.id} onClick={() => game.setLib(i)} title={`${it.name} — ${money(it.cost)}`}
            className={`flex flex-col items-center rounded-lg border p-1 ${game.libIndex === i ? 'border-amber-400 bg-amber-400/20' : 'border-white/10 hover:bg-white/10'}`}>
            <div className="flex h-14 w-full items-center justify-center"><img src={it.src} alt={it.name} className="max-h-14 max-w-full object-contain" draggable={false} /></div>
            <div className="w-full truncate text-center text-[10px] text-slate-200">{it.name}</div>
            <div className="text-[10px] text-amber-300">{money(it.cost)}</div>
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <button className={`chip ${game.flip ? 'chip-on' : ''}`} onClick={() => { game.flip = !game.flip; game.emit(); }} title="F">Flip ↔</button>
        <span className="text-slate-400">Size</span>
        <input type="range" min={0.7} max={1.4} step={0.05} value={game.placeScale} onChange={e => { game.placeScale = +e.target.value; game.emit(); }} className="flex-1 accent-amber-400" />
        <span className="w-8 tabular-nums">{game.placeScale.toFixed(2)}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{sel.name}: {sel.kind === 'house' ? 'faces the front edge; place it north of a street (or flipped, west of one)' : sel.door ? 'a venue with a front door, earns daily income when a sidewalk is near' : 'decorative'}.</p>
    </Panel>
  );
}

function SelectPanel({ game }: { game: Game }) {
  const p = game.selected;
  if (!p) return (<Panel title="Select"><p className="text-xs text-slate-300">Click an object to select it, drag to move it. Drag empty ground (or hold the right mouse button anywhere) to pan; scroll to zoom.</p></Panel>);
  const it = LIBRARY[p.item];
  return (
    <Panel title="Selected">
      <div className="flex items-center gap-2">
        <img src={it.src} alt="" className="h-14 w-14 object-contain" />
        <div><div className="text-sm font-semibold">{it.name}</div><div className="text-[11px] text-slate-400">{it.cat} · scale {p.scale.toFixed(2)}{p.flip ? ' · flipped' : ''}{p.auto ? ' · placed by the road works' : ''}</div></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button className="chip" onClick={() => game.flipSelected()}>Flip (F)</button>
        <button className="chip" onClick={() => game.scaleSelected(1.1)}>Bigger</button>
        <button className="chip" onClick={() => game.scaleSelected(1 / 1.1)}>Smaller</button>
        <button className="chip bg-red-500/70 text-white" onClick={() => game.deleteSelected()}>Remove (Del)</button>
      </div>
    </Panel>
  );
}

function hintFor(g: Game) {
  switch (g.tool) {
    case 'road': return g.route.length ? `Route: ${g.route.length} point(s) — click to extend, double-click / Enter to build, Backspace to undo, Esc to cancel, Shift for a straight 45° run` : `BUILDING NEW ROADS — Draw a connected route: click where the ${g.cls.name.toLowerCase()} should start`;
    case 'junction': return g.hoverNode ? `Click to install ${JUNCTIONS.find(j => j.id === g.junctionType)!.name.toLowerCase()} here` : 'Hover a junction (three or more roads; roundabouts also work on bends)';
    case 'objects': return g.placeError && g.hover ? `✖ ${g.placeError}` : `Click to place ${LIBRARY[g.libIndex].name} · F to flip · right-drag to pan`;
    case 'terrain': return `Paint ${TERRAINS[g.terrainType].name} — click or drag`;
    case 'bulldoze': return 'Click objects or roads to remove them';
    default: return 'Drag to pan · scroll to zoom · WASD / arrows move the camera · R roads · J junctions · B build · T terrain · X bulldoze';
  }
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-6 text-sm text-slate-200 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="text-lg font-bold text-amber-200">How Maple Falls works</div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-slate-300">
          <li><b>Roads</b> are drawn as connected routes, exactly like the town builder: click points, finish with Enter or a double-click. Everything on the ground — asphalt, kerbs, sidewalk slabs, rounded corners, crossings, centre lines, manholes and drains — is generated geometry, so a new road appears instantly, no ground rebuild.</li>
          <li>The surfaces are <b>lit relief</b>, like the builder's bake: the asphalt is a cracked mosaic of facets and the sidewalk is slabs, each with a height-field; a cold key light from the upper-left shades them and puts specular glints on the facets that face it, markings are painted into the relief, kerbs get a bright top edge and a gutter shadow, and fallen leaves pile up against every kerb.</li>
          <li>Five road types: <b>Lane</b> (single lane), <b>Street</b> (2 lanes, sidewalks, your choice of centre line), <b>Road</b> (wider, darker asphalt with paved shoulders inside yellow edge lines and a gravel verge), <b>Avenue</b> and <b>Boulevard</b> (2 / 4 lanes around a tree-lined median).</li>
          <li>Bends can be 90° or 45° (Q toggles); hold Shift to draw one straight run in any of the eight directions. Crossing an existing road makes a junction; drawing over a road upgrades it.</li>
          <li><b>Junctions</b> can become traffic lights (signals on every corner, stop lines), lights with slipways (channelised turn lanes and islands — needs long straight approaches) or roundabouts with a planted island. Roundabouts also work on a bend.</li>
          <li><b>Build</b> places the builder's sprites: houses face their front edge (south-west on screen), flip with <b>F</b> to face south-east. Buildings need clear ground; lamps, signs and benches may stand on the sidewalk, cars on the road.</li>
          <li>Houses and venues near a sidewalk earn money every day; roads cost upkeep. Everything autosaves in this browser.</li>
          <li>Camera: drag with the right mouse button or the Select tool, scroll to zoom (max = the builder's 30%), WASD / arrows to pan, G for the grid.</li>
        </ul>
        <button className="btn mt-5" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
