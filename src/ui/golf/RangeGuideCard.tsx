// The range start's guided build (T239, #699; the owner, 2026-10-28: "the starting tutorial on how to build to upgrade and build some of the
// first driving range features"): a card in the corner listing the seven steps (guide.ts RANGE_GUIDE). Each line ticks itself when its build is
// done and shows its reward; the current line (the first still to do) says what to do, with Show me (the tool or card it needs, the camera on
// its spot, its control pulsed: Engine.guideShowMe) and Skip; every line still to do has Show me too. Skip guide puts the whole card away. It
// folds to the current line. The clock never stops for it.
import type { GuideLine } from '../../game/ext/progressive-ui/guide';
import { Icon } from '../Icon';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function RangeGuideCard({ view, right = 'right-3', onShow, onSkip, onFold, onScene }: {
  view: { lines: GuideLine[]; folded: boolean }; right?: string;
  onShow: (id: string) => void; /** a line's Skip (its id), or Skip guide (null) */ onSkip: (id: string | null) => void; onFold: (folded: boolean) => void;
  /** T242: Set the scene: your range (its picture card; absent: no art) */ onScene?: () => void;
}) {
  const { lines, folded } = view, done = lines.filter(l => l.state !== 'todo').length, cur = lines.find(l => l.current)!;
  return (
    <section className={`pointer-events-auto absolute bottom-3 ${right} z-20 w-[330px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="range-guide" aria-label="Guide: build your range">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Guide · build your range</div>
          <div className="text-[12px] text-slate-400">{done} of {lines.length} done</div>
        </div>
        {onScene && <button className="chip ml-auto px-2 py-0.5" onClick={onScene} title="Set the scene: your range as it stands" data-testid="range-guide-scene"><Icon name="camera" size={14} />Scene</button>}
        <button className="btn-icon" onClick={() => onFold(!folded)} title={folded ? 'Show every step' : 'Fold to the current step'} aria-label={folded ? 'Show every step' : 'Fold the guide'} data-testid="range-guide-fold"><Icon name={folded ? 'up' : 'down'} size={16} /></button>
      </div>
      <ol className="mt-2 space-y-1">
        {lines.filter(l => !folded || l.current).map(l => (
          <li key={l.step.id} className={`rounded-lg border px-2 py-1.5 text-xs ${l.current ? 'border-amber-400/40 bg-amber-400/5' : l.state === 'done' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`} data-testid={`range-guide-${l.step.id}`} data-state={l.state}>
            <div className="flex items-center gap-2">
              <span className={`w-4 shrink-0 text-center font-bold ${l.state === 'done' ? 'text-emerald-300' : l.state === 'skipped' ? 'text-slate-500' : 'text-amber-300'}`} aria-label={l.state === 'done' ? 'Done' : l.state === 'skipped' ? 'Skipped' : `Step ${l.step.n}`}>{l.state === 'done' ? '✓' : l.state === 'skipped' ? '–' : l.step.n}</span>
              <span className={`flex-1 font-medium ${l.state === 'todo' ? 'text-white' : 'text-slate-400'} ${l.state === 'skipped' ? 'line-through' : ''}`}>{l.step.title}</span>
              {l.step.reward ? <span className={`shrink-0 tabular-nums ${l.state === 'done' ? 'text-emerald-300' : 'text-slate-400'}`} title={l.state === 'done' ? 'Paid' : 'Paid when the step is done'}>{l.state === 'done' ? '+' : ''}{money(l.step.reward)}</span> : null}
              {l.state === 'todo' && !l.current && <button className="chip px-2 py-0.5" onClick={() => onShow(l.step.id)} title="Show me: the tool and the spot" data-testid={`range-guide-show-${l.step.n}`}>Show</button>}
            </div>
            {l.current && <>
              <p className="mt-1 pl-6 text-[12px] text-slate-300">{l.step.body}</p>
              <div className="mt-1.5 flex gap-1.5 pl-6">
                <button className="chip chip-on" onClick={() => onShow(l.step.id)} data-testid="range-guide-show">Show me</button>
                <button className="chip" onClick={() => onSkip(l.step.id)} title="Skip this step (no reward)" data-testid="range-guide-skip">Skip</button>
              </div>
            </>}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between text-[12px] text-slate-400">
        <span>{folded ? `Step ${cur.step.n} of ${lines.length}` : 'Each step pays when it is done'}</span>
        <button className="underline decoration-dotted hover:text-slate-200" onClick={() => onSkip(null)} data-testid="range-guide-off">Skip guide</button>
      </div>
    </section>
  );
}
