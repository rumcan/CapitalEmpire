// The hole card (plan P23-UX 6.2 P2-4, T174): a selected hole's facts as the game has them (D7.3: par, lengths from each tee, grow-in, its
// surfaces' areas, its checks and warnings), each check with the Fix that arms the tool that mends it; the pin and tee markers dragged on the map
// while it is open (no re-plan, no charge); Edit hole (New hole's editor on it, framed, with a toast; "Editing hole n" while that editor is open,
// T205); Delete with a confirm that states the refund; the number, which
// trades places with another hole's (D4.12, as dragging the Holes panel's badges). Opened by a hole's badge in the Holes panel or a click on the
// hole with Select; Esc or ✕ closes it. In New hole's card style; colour never alone (P23 D8.1: ✓ ◔ ! ✗ beside the colours, 13 px body).
import { useState } from 'react';
import type { Game } from '../../game/engine';
import { deleteNote, type HoleCardCheck, type HoleCardView } from '../../game/golf/holecard';
import { TEE_SET } from '../../game/golf/teesets';
import { monthIndexLabel } from '../../game/golf/calendar';
import { SurfaceMark } from '../course/SurfaceMark';
import { Icon } from '../Icon';

/** the surfaces' names as the Holes panel says them */
const NAME: Record<string, string> = { green: 'Green', tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', water: 'Water', fescue: 'Fescue', waste: 'Waste area', longGrass: 'Long grass' };
const m2 = (n: number) => `${n.toLocaleString('en-US')} m²`;

/** the open card's facts (null: none open) */
function useHoleCard(game: Game): HoleCardView | null { return game.holeCardView(); }
/** a two-step action: ask, then do (the card's Delete) */
function useConfirm(): [boolean, () => void, () => void] { const [on, set] = useState(false); return [on, () => set(true), () => set(false)]; }

/** the card, beside the map's right edge (left of an open side panel, as the range card); its height in the UI scale's own units (--vh-ui:
 *  78vh ran past the screen's bottom at 125%, T205's overflow check) */
export function HoleCard({ game, right = 'right-3' }: { game: Game; right?: string }) {
  const c = useHoleCard(game), [asking, ask, unask] = useConfirm();
  if (!c) return null;
  const bad = c.checks.filter(k => !k.ok), state = bad.length ? { icon: '!', word: 'needs attention', tone: 'text-amber-300' } : c.ready !== null ? { icon: '◔', word: `growing · ready ${monthIndexLabel(c.ready)}`, tone: 'text-sky-300' } : { icon: '✓', word: 'ready', tone: 'text-emerald-300' };
  const length = c.tees[0]?.m ?? 0, del = deleteNote(c);
  const others = game.courseHoleViews().filter(v => v.n !== c.n);
  /** this hole's editor is open in the Holes panel ("Edit hole n"): Edit hole has nothing more to open (T205) */
  const editing = game.paint.editingHole === c.n;
  return (
    <section className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[340px] overflow-y-auto overflow-x-hidden rounded-xl border border-[var(--gold-line)] bg-slate-950/90 p-3 text-[13px] text-slate-200 shadow-2xl backdrop-blur`} data-testid="hole-card" aria-label={`Hole ${c.n}`}>
      <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="wiz-title">Hole {c.n}</span>
            <label className="wiz-num" title="The hole's number: another hole's trades places with it (the routing follows), as dragging its badge in the Holes panel">
              <span className="sr-only">Number</span>
              <select value={c.n} onChange={e => game.renumberHole(c.n, +e.target.value)} data-testid="hole-number">
                {Array.from({ length: 18 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n === c.n ? `No. ${n}` : others.some(v => v.n === n && v.started) ? `No. ${n} (swap with hole ${n})` : `No. ${n}`}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-0.5 text-[13px] text-slate-300">{c.par ? `Par ${c.par} · ${length} m` : 'No par yet: it needs a pin and a tee'}</div>
          <div className={`mt-0.5 flex items-center gap-1.5 text-[12px] ${state.tone}`} data-testid="hole-state"><span aria-hidden className="font-bold">{state.icon}</span>{state.word}</div>
          {bad.length > 0 && c.ready !== null && <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-sky-300"><span aria-hidden className="font-bold">◔</span>growing · ready {monthIndexLabel(c.ready)}</div>}
        </div>
        <button className="btn-icon" onClick={() => game.closeHoleCard()} title="Close (Esc)" aria-label="Close the hole card"><Icon name="close" size={18} /></button>
      </div>

      {c.tees.length > 0 && (
        <div className="wiz-stats" data-testid="hole-tees">
          <div className="text-[12px] text-[var(--muted)]">From each tee</div>
          <dl className="wiz-split">
            {c.tees.map(t => <div key={t.kind} data-tee={t.kind}><dt><TeeDot kind={t.kind} />{TEE_SET[t.kind].name} tee · par {t.par}</dt><dd>{t.m} m</dd></div>)}
          </dl>
          {/* T254: "Add tee: Blue / Yellow / Red": a tee box behind or ahead along the line, priced like a tee */}
          {c.addable.length > 0 && game.addTeeSet && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="hole-add-tee">
              <span className="text-[12px] text-[var(--muted)]">Add tee:</span>
              {c.addable.map(k => <button key={k} className="chip" onClick={() => game.addTeeSet(c.n, k)} title={`Lay the ${TEE_SET[k].colour} tee box (${TEE_SET[k].who}) ${k === 'back' ? 'behind' : 'ahead'} along the line, priced like a tee${game.teeBoxPrice ? `: about $${game.teeBoxPrice().toLocaleString('en-US')}` : ''}`} data-add-tee={k}><TeeDot kind={k} />{TEE_SET[k].name}</button>)}
            </div>
          )}
        </div>
      )}

      {c.areas.length > 0 && (
        <div className="wiz-stats" data-testid="hole-areas">
          <div className="text-[12px] text-[var(--muted)]">Its surfaces</div>
          <ul className="mt-1 flex flex-col gap-1 text-[13px]">
            {c.areas.map(a => (
              <li key={a.surface} className="flex items-center gap-2">
                <SurfaceMark kind={a.surface} size={20} />
                <span className="min-w-0 flex-1">{NAME[a.surface] ?? a.surface}</span>
                <span className="tabular-nums font-semibold">{m2(a.m2)}</span>
                <span className={`w-[7.5rem] text-right text-[12px] ${a.ready !== null ? 'text-sky-300' : 'text-emerald-300'}`}>{a.ready !== null ? <><span aria-hidden>◔ </span>ready {monthIndexLabel(a.ready)}</> : <><span aria-hidden>✓ </span>grown in</>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2" data-testid="hole-checks">
        <div className="mb-1 text-[12px] text-[var(--muted)]">Checks</div>
        <ul className="wiz-checks">
          {c.checks.map(k => <CheckRow key={k.id} game={game} k={k} />)}
        </ul>
      </div>

      <FrameRow game={game} n={c.n} />

      <p className="sub-line mt-2">Drag the pin or a tee marker on the map to move it: no re-plan, no charge. It stays on its green or tee. Edit Hole Layout moves them all with the line, and lays no grass.</p>

      {!asking ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {/* T205: Edit hole always shows what it did: the editor opens on this hole, framed, with a toast; while it is open it says so */}
            <button className={`chip ${editing ? 'chip-editing' : 'disabled:opacity-40'}`} disabled={!c.planned || editing} onClick={() => game.editHole(c.n)} title={editing ? `Hole ${c.n}'s layout editor is open in the Holes panel: drag the tee, the green or the line, then Move tees and flag` : c.planned ? 'Drag the tee, the green or the line: the tee markers and the flag move, no grass is laid (fix the course with the paint brushes)' : 'Painted by hand: shape it with the brush'} data-testid="hole-edit"><Icon name="pin" size={14} />{editing ? `Editing hole ${c.n}` : 'Edit Hole Layout'}</button>
            <button className="chip" onClick={ask} title="Delete the hole with its paint, or keep its grass as your property's paint, after a confirm" data-testid="hole-delete"><Icon name="bulldozer" size={14} />Delete</button>
            {/* T256: the hole with its cells, plan, heights and looks (and its frame trees) as a My holes entry */}
            <SaveHole game={game} n={c.n} />
          </div>
          {!c.planned && <p className="sub-line mt-1" data-testid="hole-edit-why">Painted by hand: shape it with the brush. Edit Hole Layout is for holes New hole planned.</p>}
        </>
      ) : (
        <div className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-2" role="alertdialog" aria-label={`Delete hole ${c.n}?`} data-testid="hole-delete-confirm">
          <div className="font-semibold text-rose-200">Delete hole {c.n}?</div>
          <p className="mt-0.5 text-[12px] text-slate-300">{del.text}</p>
          {/* T256 (#743): the hole owns its paint: delete it all, or leave its grass as your property's paint; one undo step either way */}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button className="chip border-rose-400/60 text-rose-100" onClick={() => { unask(); game.deleteHole(c.n, false); }} autoFocus data-testid="hole-delete-all">Delete hole and its grass · {del.refund ? `refund $${del.refund.toLocaleString('en-US')}` : 'no refund'}</button>
            <button className="chip border-amber-300/60 text-amber-100" onClick={() => { unask(); game.deleteHole(c.n, true); }} data-testid="hole-delete-keep">Delete hole, keep the grass</button>
            <button className="chip" onClick={unask}>Keep it</button>
          </div>
        </div>
      )}
    </section>
  );
}

/** T256 (#743): Save hole: the hole as a "My holes" entry (its cells, plan, ground height and looks; its frame trees when ticked), named;
 *  New hole's "From My holes" places it again, in this game or another */
function SaveHole({ game, n }: { game: Game; n: number }) {
  const [open, setOpen] = useState(false), [name, setName] = useState(''), [trees, setTrees] = useState(true);
  if (!game.saveMyHole) return null; // (a stub game in the tests has none)
  if (!open) return <button className="chip" onClick={() => { setName(`Hole ${n}`); setOpen(true); }} title="Keep this hole (its grass, plan, ground height and looks) in My holes, to build it again" data-testid="hole-save"><Icon name="pin" size={14} />Save hole</button>;
  return (
    <div className="mt-1 flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-white/10 p-2" data-testid="hole-save-form">
      <input className="min-w-0 flex-1 rounded bg-slate-900 px-2 py-1 text-[13px]" aria-label="The saved hole's name" value={name} maxLength={40} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { game.saveMyHole(n, name, trees); setOpen(false); } e.stopPropagation(); }} autoFocus />
      <label className="flex items-center gap-1 text-[12px]"><input type="checkbox" checked={trees} onChange={e => setTrees(e.target.checked)} />With its frame trees</label>
      <button className="chip chip-on" onClick={() => { game.saveMyHole(n, name, trees); setOpen(false); }} data-testid="hole-save-go">Save to My holes</button>
      <button className="chip" onClick={() => setOpen(false)}>Cancel</button>
    </div>
  );
}

/** T229 (#668): Frame with trees: clumps of conifers and autumn trees along the hole's rough's outer edge (golf/holeframe.ts), priced per tree, the
 *  price on the button before you press it (one undo step). Framing again plants only where there is room, and takes away frame trees an edit
 *  of the hole left in play (half their price back, as the bulldozer) */
function FrameRow({ game, n }: { game: Game; n: number }) {
  const f = game.holeFrameView?.(n); if (!f) return null; // (a stub game in the tests has none)
  const can = f.trees > 0 || f.stale > 0, usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  const label = f.trees ? `Frame with trees · ${f.trees} trees · ${usd(f.price)}` : f.stale ? `Take ${f.stale} out of play · +${usd(f.refund)}` : f.has ? 'Framed' : 'No room for a frame';
  const note = [f.has ? `${f.has} frame tree${f.has === 1 ? '' : 's'} now.` : "Clumps of spruce, pine, maple and birch along the rough's edge, with gaps; never in the line of play, on a path or on water.",
    f.stale ? `${f.stale} stand in play since the hole changed: framing again takes them away (half back).` : '', f.has && !f.trees && !f.stale ? 'No room for more clumps: bulldoze one to open a view.' : ''].filter(Boolean).join(' ');
  return (
    <div className="mt-2" data-testid="hole-frame">
      <div className="mb-1 text-[12px] text-[var(--muted)]">Trees</div>
      <button className={`chip ${can ? 'chip-on' : ''} disabled:opacity-40`} disabled={!can} onClick={() => game.frameHoleTrees(n)} title={can ? 'Plants the clumps (Ctrl+Z takes them and the money back)' : 'Nothing to plant'} data-testid="hole-frame-go"><Icon name="trees" size={14} />{label}</button>
      <p className="sub-line mt-1">{note}</p>
    </div>
  );
}

/** T254: a tee set's colour, a small ball beside its name (the colour is never alone: the name is beside it) */
function TeeDot({ kind }: { kind: keyof typeof TEE_SET }) {
  const s = TEE_SET[kind];
  return <span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-[-1px]" style={{ background: s.fill, boxShadow: `inset 0 0 0 1px ${s.rim}` }} />;
}

/** one check: its mark (✓ ok, ✗ a check that fails, ! a warning) beside its colour, its words, and its Fix */
function CheckRow({ game, k }: { game: Game; k: HoleCardCheck }) {
  const cls = k.ok ? 'wiz-ok' : k.warn ? 'wiz-warn' : 'wiz-block', mark = k.ok ? '✓' : k.warn ? '!' : '✗';
  const fix = k.fix, label = !fix ? '' : fix.kind === 'edit' ? 'Edit Hole Layout' : fix.kind === 'brush' ? `Paint ${NAME[fix.surface]!.toLowerCase()}` : fix.marker === 'pin' ? 'Move the pin' : 'Move the tees';
  return (
    <li className={cls}>
      <span className="wiz-mark" aria-hidden>{mark}</span>
      <span className="min-w-0 flex-1">{k.text}</span>
      {fix && <button className="chip" onClick={() => game.holeCardFix(fix)} title="Arms the tool that fixes it">{label}</button>}
    </li>
  );
}
