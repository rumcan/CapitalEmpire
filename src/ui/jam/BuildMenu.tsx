// J7 (#1225; the owner, 2026-11-13: "make a better build menu with pictures and let the player decide"): the jam build's Build menu. A card for every
// thing the player can build (build-menu.ts), in four tabs (Range, Course, Club, Practice): its picture, name, price, upkeep a month and payback, greyed
// with its reason when it cannot be built yet. A click starts the same placement the rail and the range card start (App.tsx runs the act) and closes the
// menu; Esc or ✕ closes it. It stands beside the rail (App.tsx puts it in the rail's row). Tips opens the optional tips (TipsCard). The grid wraps (never a sideways scrollbar) and the panel scrolls down only.
import { useEffect } from 'react';
import { paybackWords } from '../../game/golf/payback';
import { Icon } from '../Icon';
import { sceneUrl } from '../SceneCard';
import { tileUrl } from '../tool-tiles';
import { money } from '../golf/money';
import { BUILD_GROUPS, type BuildCard, type BuildGroupId, type BuildPic } from './build-menu';

const picUrl = (p: BuildPic): string | undefined => ('scene' in p ? sceneUrl(p.scene) : tileUrl(p.tile));

export function BuildMenu({ cards, tab, onTab, onPick, onClose, onTips }: {
  cards: BuildCard[]; tab: BuildGroupId;
  onTab: (g: BuildGroupId) => void; onPick: (c: BuildCard) => void; onClose: () => void; onTips: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  const shown = cards.filter(c => c.group === tab);
  return (
    <section className="pointer-events-auto flex max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[min(760px,calc(100vw-9rem))] flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 text-slate-200 shadow-2xl backdrop-blur"
      data-testid="build-menu" aria-label="Build">
      <div className="win-head win-head-slate flex items-center justify-between gap-2 px-3 pt-3">
        <div>
          <div className="font-semibold text-amber-200">Build</div>
          <div className="text-[12px] text-slate-400">Anything, in any order: you decide. Takings and payback are estimates.</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button className="chip" onClick={onTips} title="Tips: how the range, the course and the money work" data-testid="build-tips"><Icon name="info" size={16} />Tips</button>
          <button className="btn-icon" onClick={onClose} title="Close (Esc)" aria-label="Close the Build menu" data-testid="build-close"><Icon name="close" size={18} /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 px-3 pt-2" role="tablist">
        {BUILD_GROUPS.map(g => {
          const n = cards.filter(c => c.group === g.id && !c.done && !c.why).length;
          return (
            <button key={g.id} role="tab" aria-selected={tab === g.id} className={`chip ${tab === g.id ? 'chip-on' : ''}`} onClick={() => onTab(g.id)} data-testid={`build-tab-${g.id}`}>
              {g.label}{n > 0 && <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[11px] text-emerald-300" title={`${n} you can build now`}>{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2 overflow-y-auto overflow-x-hidden p-3" role="tabpanel">
        {shown.map(c => <Card key={c.id} c={c} onPick={onPick} />)}
        {!shown.length && <div className="text-[12px] text-slate-400">Nothing here yet.</div>}
      </div>
    </section>
  );
}

function Card({ c, onPick }: { c: BuildCard; onPick: (c: BuildCard) => void }) {
  const url = picUrl(c.pic), off = !!c.why || (!c.act && !c.done), p = c.payback;
  const tone = !p ? '' : p.verdict === 'pays' || p.verdict === 'free' ? 'text-emerald-300' : p.verdict === 'slow' ? 'text-amber-300' : 'text-slate-300';
  return (
    <button className={`group flex flex-col overflow-hidden rounded-lg border text-left transition ${c.done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/5'} ${off ? 'cursor-default' : 'hover:border-amber-300/60 hover:bg-white/10'}`}
      onClick={() => { if (!c.why && c.act) onPick(c); }} aria-disabled={off || undefined} title={c.why ?? (c.done && c.act ? `${c.name}: open it` : c.act ? `${c.name}: place it on your land` : c.name)}
      data-testid={`build-card-${c.id}`} data-state={c.done ? 'done' : c.why ? 'locked' : 'open'}>
      <div className="relative h-[92px] w-full bg-slate-900">
        {url && <img src={url} alt="" draggable={false} className={`h-full w-full object-cover ${c.why ? 'opacity-40 grayscale' : ''}`} style={'scene' in c.pic && c.pic.pos ? { objectPosition: c.pic.pos } : undefined} />}
        {c.done && <span className="absolute right-1.5 top-1.5 rounded bg-emerald-600/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">✓ {c.done}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-2 text-[12px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-semibold ${c.why ? 'text-slate-400' : 'text-white'}`}>{c.name}</span>
          {!c.done && c.cost !== null && <span className="shrink-0 tabular-nums text-amber-200">{c.costNote ? `from ${money(c.cost)}` : money(c.cost)}</span>}
        </div>
        <div className="leading-snug text-slate-400">{c.line}</div>
        {!c.done && c.costNote && <div className="text-slate-500">{c.costNote}</div>}
        {!c.done && c.upkeep !== null && <div className="text-slate-400">Upkeep <span className="text-slate-200">{money(c.upkeep)}</span> a month{c.upkeepNote ? ` (${c.upkeepNote})` : ''}</div>}
        {!c.done && p && <div className={`font-semibold ${tone}`} data-testid={`build-payback-${c.id}`} data-verdict={p.verdict}>
          {p.extra >= 0.5 && <span className="font-normal text-slate-400">About <span className="text-emerald-300">+{money(p.extra)}</span> a month · </span>}{paybackWords(p)}</div>}
        {c.note && <div className="text-slate-500">{c.note}</div>}
        {c.why && <div className="mt-auto pt-1 text-amber-300/90" data-testid={`build-why-${c.id}`}>{c.why}</div>}
      </div>
    </button>
  );
}
