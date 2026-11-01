// The surface in focus in a hole's panel (the owner, 2026-11-01: "when you click on fairway it should hide all the other ones and show a larger
// thumb of the fairway and give you a quick change button so you can quickly flip through textures for the main and border texture. you should
// also be able to select an already created and saved one or edit the current fairway for this hole (like you would when you create your own)
// and use it for this hole or for default for the entire map"): the surface's look as a large disc, its Main and Border textures with ‹ › to
// step through the library (QuickTextures), your saved grasses to paint with, the whole look editor on Edit, and whose look it is: this hole's,
// the course default new holes start from, or every hole's. ‹ All surfaces goes back to the swatches. Self-contained: it reads and drives
// game.paint.
import { useState } from 'react';
import type { Game } from '../../game/engine';
import { SURFACE_BRUSHES, type BrushKind } from '../../game/paint';
import { lookWhat } from '../../game/golf/looks';
import { GRASS_KIND } from '../../game/golf/grasses';
import { QuickTextures, StyleEditor } from '../../PaintPanel';
import { LookDisc } from './MyLooks';
import { lookName } from './CoursePanel';
import { SurfaceMark } from './SurfaceMark';
import { grassPuckImage } from './swatch-puck';

export function SurfaceFocus({ game, kind, onBack, pickGrass }: { game: Game; kind: BrushKind; onBack: () => void; pickGrass: (k: number) => void }) {
  const p = game.paint, s = p.style, b = SURFACE_BRUSHES.find(x => x.kind === kind), name = b?.name ?? kind, owner = p.lookOwner;
  const [edit, setEdit] = useState(false), [done, setDone] = useState('');
  const own = game.golfMode && !!game.courseGrid && !!p.grasses;
  return (
    <div className="mt-1" data-surface-focus={kind}>
      {/* (a fixed height, every name on one line: a long texture name never moves the ‹ › buttons under it while you click through; the
          owner, 2026-11-01) */}
      <div className="flex h-8 items-center justify-between gap-2">
        <button className="chip shrink-0" onClick={onBack} title="Show every surface again" data-focus-back>‹ All surfaces</button>
        <span className="sub-line min-w-0 truncate" title={lookWhat(kind, owner)}>{lookWhat(kind, owner)}</span>
      </div>
      <div className="mt-2 flex h-[110px] items-center gap-3 overflow-hidden" data-focus-head>
        <LookDisc kind={kind} tex={s.tex} scale={s.scale} angle={s.angle} tone={s.tone} toneAmt={s.toneAmt} width={150} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 truncate font-semibold"><SurfaceMark kind={kind} size={20} /><span className="truncate">{name}</span></div>
          <div className="sub-line mt-0.5 truncate" title={lookName(s.tex)}>{lookName(s.tex)}</div>
        </div>
      </div>
      {/* (hidden while the whole editor is open: it has the same pickers, so the border texture is never shown twice) */}
      {!edit && <QuickTextures game={game} />}
      {/* whose look it is: this hole's (the default here), the course default new holes start from, or every hole's at once */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Use this look for" data-focus-scope>
        <button className={`chip ${owner !== 'default' ? 'chip-on' : ''}`} aria-pressed={owner !== 'default'} title="Only this hole wears it: the other holes, your property and the facilities keep their own" onClick={() => { if (owner === 'default') p.setLookDefault(false); setDone(''); }}>This hole</button>
        <button className={`chip ${owner === 'default' ? 'chip-on' : ''}`} aria-pressed={owner === 'default'} title={`Edit the ${name.toLowerCase()} look every new hole starts from (your holes keep theirs)`} onClick={() => { p.setLookDefault(true); setDone(''); }}>Course default</button>
        <button className="chip" title={`Give every hole and the course default this ${name.toLowerCase()} look`} onClick={() => { const n = p.applyLookToAll(kind); setDone(n.length ? `On holes ${n.join(', ')} and the default` : 'On the course default'); }}>Apply to all holes</button>
        {done && <span className="sub-line" role="status">{done}</span>}
      </div>
      {own && p.grasses.length > 0 && (
        <div className="mt-2" data-focus-saved>
          <div className="text-[12px] text-slate-400">Your saved grasses</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.grasses.map(g => { const puck = grassPuckImage(game, g); return (
              <button key={g.k} className="chip" title={`Paint with ${g.name}`} onClick={() => pickGrass(g.k)}>
                {puck ? <img src={puck.url} width={28} height={19} alt="" draggable={false} /> : <SurfaceMark kind={GRASS_KIND[g.plays]} size={16} />}{g.name}
              </button>
            ); })}
          </div>
        </div>
      )}
      <button className={`chip mt-2 ${edit ? 'chip-on' : ''}`} aria-expanded={edit} onClick={() => setEdit(!edit)} data-focus-edit>{edit ? 'Close the editor' : `Edit the ${name.toLowerCase()} look`} <span aria-hidden>{edit ? '▾' : '▸'}</span></button>
      {edit && <div className="mt-1.5" data-focus-editor><StyleEditor game={game} gridOnly /></div>}
    </div>
  );
}
