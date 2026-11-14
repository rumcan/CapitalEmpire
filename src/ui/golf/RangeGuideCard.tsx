// The range start's guided build (T239, #699; the owner, 2026-10-28: "the starting tutorial on how to build to upgrade and build some of the
// first driving range features"): a card in the corner listing its steps (guide.ts RANGE_GUIDE; T288: two placement steps first; #1297: three steps in all, the owner took the rest out). Each line ticks itself when its build is
// done and shows its reward; the current line (the first still to do) says what to do, with Show me (the tool or card it needs, the camera on
// its spot, its control pulsed: Engine.guideShowMe) and Skip; every line still to do has Show me too. Skip guide puts the whole card away. It
// folds to the current line. The clock never stops for it.
// T293 (#878): the start tutorial runs on this card too (heading, testid, Next on its 'next' steps, Skip tutorial): one guide look, not two.
import { useEffect, useRef } from 'react';
import type { GuideLine } from '../../game/ext/progressive-ui/guide';
import { Icon } from '../Icon';
import { sfx } from '../../game/sound/sfx'; // J11 (#1270)
import { voice } from '../../game/sound/voice';
import { ActionTile, TILE_ROW, TILE_SMALL } from '../ActionTile'; // J8 (#1261): each step's painted tile (GuideStep.tile), at the left of its row, bigger on the open step
import { money } from './money';

export function RangeGuideCard({ view, right = 'right-3', onShow, onSkip, onFold, onScene, onNext, voiced = false, heading = 'Guide · build your range', tid = 'range-guide', foot = 'Each step pays when it is done', offLabel = 'Skip guide' }: {
  view: { lines: GuideLine[]; folded: boolean }; right?: string;
  /** T293: Next on the current line when its step goes on with Next (absent: every step ticks itself) */ onNext?: (id: string) => void;
  /** J11: a step's voice-over plays when the step opens (voice.ts; the text stays on the card as its caption) */ voiced?: boolean;
  /** T293: the card's heading, test id prefix, footnote and Skip-all label (the range guide's by default) */ heading?: string; tid?: string; foot?: string; offLabel?: string;
  onShow: (id: string) => void; /** a line's Skip (its id), or Skip guide (null) */ onSkip: (id: string | null) => void; onFold: (folded: boolean) => void;
  /** T242: Set the scene: your range (its picture card; absent: no art) */ onScene?: () => void;
}) {
  const { lines, folded } = view, done = lines.filter(l => l.state !== 'todo').length, cur = lines.find(l => l.current)!;
  // J11: a step done (ticked by its build, or Next) rings a short bell; the card showing for the first time rings nothing
  const was = useRef(done);
  useEffect(() => { if (done > was.current) sfx.ding(); was.current = done; }, [done]);
  // J11: the current step's voice, when it opens; the next step, Skip, or the card going away stops it (the files are made from exactly this text)
  const step = cur.step;
  useEffect(() => { if (!voiced) return undefined; voice.say(step.id, step.title, step.body); return () => voice.stop(); }, [voiced, step.id, step.title, step.body]);
  return (
    <section className={`pointer-events-auto absolute bottom-3 ${right} z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-1rem)] w-[330px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid={tid} aria-label={heading.replace(' · ', ': ')}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">{heading}</div>
          <div className="text-[12px] text-slate-400">{done} of {lines.length} done</div>
        </div>
        {onScene && <button className="chip ml-auto px-2 py-0.5" onClick={onScene} title="Set the scene: your range as it stands" data-testid={`${tid}-scene`}><ActionTile tile="scene" size={TILE_SMALL} />Scene</button>}
        <button className="btn-icon" onClick={() => onFold(!folded)} title={folded ? 'Show every step' : 'Fold to the current step'} aria-label={folded ? 'Show every step' : 'Fold the guide'} data-testid={`${tid}-fold`}><Icon name={folded ? 'up' : 'down'} size={16} /></button>
      </div>
      <ol className="mt-2 space-y-1">
        {lines.filter(l => !folded || l.current).map(l => (
          <li key={l.step.id} className={`rounded-lg border px-2 py-1.5 text-xs ${l.current ? 'border-amber-400/40 bg-amber-400/5' : l.state === 'done' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`} data-testid={`${tid}-${l.step.id}`} data-state={l.state}>
            {/* J8: the step's tile at the left of the whole row (bigger on the open step, beside its words and buttons) */}
            <div className="flex items-start gap-2">
              <ActionTile tile={l.step.tile} size={l.current ? TILE_ROW + 8 : TILE_ROW - 8} className={l.state === 'todo' ? '' : 'opacity-60'} />
              <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`w-4 shrink-0 text-center font-bold ${l.state === 'done' ? 'text-emerald-300' : l.state === 'skipped' ? 'text-slate-500' : 'text-amber-300'}`} aria-label={l.state === 'done' ? 'Done' : l.state === 'skipped' ? 'Skipped' : `Step ${l.step.n}`}>{l.state === 'done' ? '✓' : l.state === 'skipped' ? '–' : l.step.n}</span>
              <span className={`flex-1 font-medium ${l.state === 'todo' ? 'text-white' : 'text-slate-400'} ${l.state === 'skipped' ? 'line-through' : ''}`}>{l.step.title}</span>
              {l.step.reward ? <span className={`shrink-0 tabular-nums ${l.state === 'done' ? 'text-emerald-300' : 'text-slate-400'}`} title={l.state === 'done' ? 'Paid' : 'Paid when the step is done'}>{l.state === 'done' ? '+' : ''}{money(l.step.reward)}</span> : null}
              {l.state === 'todo' && !l.current && <button className="chip px-2 py-0.5" onClick={() => onShow(l.step.id)} title="Show me: the tool and the spot" data-testid={`${tid}-show-${l.step.n}`}>Show</button>}
            </div>
            {l.current && <>
              <p className="mt-1 pl-6 text-[12px] text-slate-300">{l.step.body}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                {onNext && l.step.done === 'next' && <button className="chip chip-on" onClick={() => { sfx.ding(); onNext(l.step.id); }} data-testid={`${tid}-next`}>{l.step.n === lines.length ? 'Done' : 'Next'}</button>}
                <button className={`chip ${onNext && l.step.done === 'next' ? '' : 'chip-on'}`} onClick={() => onShow(l.step.id)} data-testid={`${tid}-show`}>Show me</button>
                <button className="chip" onClick={() => onSkip(l.step.id)} title={l.step.reward ? 'Skip this step (no reward)' : 'Skip this step'} data-testid={`${tid}-skip`}>Skip</button>
              </div>
            </>}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between text-[12px] text-slate-400">
        <span>{folded ? `Step ${cur.step.n} of ${lines.length}` : foot}</span>
        <button className="underline decoration-dotted hover:text-slate-200" onClick={() => onSkip(null)} data-testid={`${tid}-off`}>{offLabel}</button>
      </div>
    </section>
  );
}
