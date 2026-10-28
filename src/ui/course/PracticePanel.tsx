// Facilities ▸ Practice's panel (T206, #540): the practice facilities, each its own building tool. A card per facility (its state as the range
// reads it, its appeal and fee); the one in hand shows its size (− / + as [ / ]), its turn (R), the putting green's outline (Tab) and what a
// click builds for what; Show area moves the camera to the practice area. A built facility goes with the bulldozer.
import type { Game } from '../../game/engine';
import { PRACTICE_SIZE, PUTT_SHAPES, TURNS } from '../../game/golf/practicebuild';
import { FACILITY_NAME } from '../../game/golf/practicetool';
import { PRACTICE_APPEAL, PRACTICE_FEE, PRACTICE_IDS, type PracticeId } from '../../game/golf/rangesave';
import { ToolHead } from '../ToolHead';

const BLURB: Readonly<Record<PracticeId, string>> = {
  putting: 'An organic putting green with its fringe and practice flags.',
  chipping: 'A chipping green with a practice bunker beside it and a mat to chip from.',
};

export function PracticePanel({ game }: { game: Game }) {
  const pt = game.practice, k = pt.kind, scan = game.range.practice, area = !!game.range.scene;
  return (
    <div className="tp" data-panel="practice">
      <ToolHead icon="pin" title="Practice" desc="Build the practice facilities in the practice area beside the car park" />
      {!area && <p className="leading-snug text-amber-200">Only a driving range has a practice area.</p>}
      {PRACTICE_IDS.map(id => {
        const st = scan?.[id].state ?? 'none', open = st === 'open', on = k === id;
        return (
          <button key={id} className={`card mt-2 gap-1 ${on ? 'card-on' : ''}`} data-card={`practice-${id}`} aria-pressed={on} disabled={!area}
            onClick={() => game.armPractice(on ? null : id)} title={open ? `Your ${FACILITY_NAME[id].toLowerCase()} is open: bulldoze it to build another` : on ? 'In hand: click in the practice area to build it' : 'Pick it to place it'}>
            <div className="flex w-full items-baseline justify-between gap-2"><span className="font-semibold">{FACILITY_NAME[id]}</span>
              <span className={open ? 'text-emerald-300' : st === 'none' ? 'text-slate-400' : 'text-amber-300'}>{open ? '✓ Open' : st === 'none' ? 'Not built' : 'Not open yet'}</span></div>
            <div className="sub-line leading-snug">{BLURB[id]} +{Math.round(PRACTICE_APPEAL[id] * 100)}% visitors, ${PRACTICE_FEE} a golfer who uses it.</div>
          </button>
        );
      })}
      {k && (
        <div className="mt-3 space-y-2" data-testid="practice-controls">
          <div className="flex items-center justify-between gap-2">
            <span>Size <span className="sub-line">(green alone)</span></span>
            <span className="flex items-center gap-1.5">
              <button className="chip" onClick={() => pt.resize(-1)} disabled={pt.size[k] <= PRACTICE_SIZE[k].min} data-tip="Smaller" data-tip-key="[">−</button>
              <span className="min-w-[4.5rem] text-center font-semibold" data-testid="practice-size">{pt.size[k]} m²</span>
              <button className="chip" onClick={() => pt.resize(1)} disabled={pt.size[k] >= PRACTICE_SIZE[k].max} data-tip="Bigger" data-tip-key="]">+</button>
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>Turn</span>
            <button className="chip" onClick={() => pt.setTurn(pt.turn + 1)} data-tip="Turn it" data-tip-key="R">{Math.round(pt.turn * 360 / TURNS)}° ↻</button>
          </div>
          {k === 'putting' && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-2"><span>Outline</span><button className="chip" onClick={() => pt.reseed()} data-tip="A fresh wobble of the same outline">Reshape</button></div>
              <div className="flex flex-wrap gap-1">
                {PUTT_SHAPES.map((s, i) => <button key={s.id} className={`chip ${pt.shape === i ? 'chip-on' : ''}`} onClick={() => pt.setShape(i)} data-tip={`${s.name} outline`} data-tip-key="Tab">{s.name}</button>)}
              </div>
            </div>
          )}
          <p className={`leading-snug ${pt.ghost?.why ? 'text-rose-300' : ''}`} data-testid="practice-status">{pt.status}</p>
          <p className="sub-line leading-snug">Click to build it. Ctrl+Z takes it back; the bulldozer removes a built one (half its price back).</p>
        </div>
      )}
      {area && <button className="chip mt-3" onClick={() => pt.showArea()} data-testid="practice-show-area">Show area</button>}
    </div>
  );
}
