// J7 (#1225): the jam build's optional tips (tips.ts), opened from Build ▸ Tips: a card with a line a tip; a click opens one, Show me where it has one,
// ✕ closes the card. No order, no ticks, no rewards: the guided build's card (RangeGuideCard) stays out of the jam build.
import { useState } from 'react';
import { Icon } from '../Icon';
import { JAM_TIPS, type TipShow } from './tips';

export function TipsCard({ right = 'right-3', onShow, onClose }: { right?: string; onShow: (s: TipShow) => void; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(JAM_TIPS[0]!.id);
  return (
    <section className={`pointer-events-auto absolute bottom-3 ${right} z-20 w-[330px] max-w-[calc(100vw-1.5rem)] rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="tips" aria-label="Tips">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/80">Tips</div>
          <div className="text-[12px] text-slate-400">Read any, in any order</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close the tips" aria-label="Close the tips" data-testid="tips-close"><Icon name="close" size={16} /></button>
      </div>
      <ul className="mt-2 space-y-1">
        {JAM_TIPS.map(t => (
          <li key={t.id} className={`rounded-lg border px-2 py-1.5 text-xs ${open === t.id ? 'border-amber-400/40 bg-amber-400/5' : 'border-white/5 bg-white/5'}`} data-testid={`tips-${t.id}`}>
            <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
              <span className="flex-1 font-medium text-white">{t.title}</span><Icon name={open === t.id ? 'up' : 'down'} size={14} />
            </button>
            {open === t.id && <>
              <p className="mt-1 text-[12px] text-slate-300">{t.body}</p>
              {t.show && <button className="chip mt-1.5" onClick={() => onShow(t.show!)} data-testid={`tips-show-${t.id}`}>Show me</button>}
            </>}
          </li>
        ))}
      </ul>
    </section>
  );
}
