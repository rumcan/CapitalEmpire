// T219 (P27, #594): an iconic place's card (the drive-in, the high school): its name after the town, what it is, the residents it opened at, its
// size, and the art it still waits for (its stand-ins). Opened by clicking any of its props with the select tool. No economy yet.
import { Icon } from './Icon';

/** what the card shows (engine.ts placeCard) */
export interface PlaceCardView { id: string; name: string; kind: string; pop: number; w: number; d: number; standIns: string[]; town: number }

export function PlaceCard({ view, onClose, right = 'right-3' }: { view: PlaceCardView; onClose: () => void; right?: string }) {
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 w-[300px] space-y-2 rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="place-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-amber-200" data-testid="place-name">{view.name}</div>
          <div className="text-[12px] text-slate-400">{view.kind} · a landmark of the town</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-lg border border-white/10 bg-white/5 p-1.5"><div className="text-[12px] uppercase text-slate-400">Opened at</div><div className="text-sm font-bold text-white">{view.pop.toLocaleString()}</div><div className="text-[12px] text-slate-400">residents</div></div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-1.5"><div className="text-[12px] uppercase text-slate-400">Grounds</div><div className="text-sm font-bold text-white">{view.w} x {view.d} m</div><div className="text-[12px] text-slate-400">town of {Math.round(view.town).toLocaleString()}</div></div>
      </div>
      <p className="text-xs text-slate-300">Every town gets one when it grows big enough. Visitors come later.</p>
      {view.standIns.length > 0 && <p className="text-[12px] text-slate-400" data-testid="place-standins">Stand-ins until their art is drawn: {view.standIns.join(', ')}.</p>}
    </div>
  );
}
