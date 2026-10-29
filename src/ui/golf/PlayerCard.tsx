// Your golf (T241, #705; docs/plans/P28.md section 2): the profile card. Your name and handicap, the five skills (0..100, what each plays in the
// tooltip), your round today on the tee sheet (book the next free tee time, cancel it, out on the course, the score), the practice log and your rounds.
// Opened from the range card's "Your golf" block or the top bar's You chip; T240 (your character) adds the looks and the name.
import type { PlayerCardView } from '../../game/golf/player';
import { Icon } from '../Icon';

const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
const hcp = (h: number) => h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1);
const toPar = (d: number) => d === 0 ? 'E' : d > 0 ? `+${d}` : `${d}`;

export function PlayerCard({ view, onClose, onBook, onCancel, right = 'right-3' }: { view: PlayerCardView; onClose: () => void; onBook: () => void; onCancel: () => void; right?: string }) {
  const r = view.round;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[320px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="player-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-sky-200">Your golf</div>
          <div className="text-[12px] text-slate-400">{view.name} · an amateur golfer</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="flex items-baseline justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5" title="Your handicap: the strokes over par your skills average over 18 holes (a + below scratch)">
        <span className="text-[12px] uppercase text-slate-400">Handicap</span>
        <span className="text-xl font-bold text-white" data-testid="player-hcp">{view.hcpText}</span>
      </div>
      <div className="space-y-1" data-testid="player-skills">
        {view.skills.map(s => (
          <div key={s.id} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 text-xs" title={s.what} data-testid={`player-skill-${s.id}`}>
            <span className="text-slate-300">{s.name}</span>
            <span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }} /></span>
            <span className="text-right font-semibold text-white">{s.value.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs" data-testid="player-round">
        <div className="mb-1 text-[12px] uppercase text-slate-400">Your round today</div>
        {r.k === 'none' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-300">{r.why ?? (r.next !== null ? `Next free tee time ${clock(r.next)}` : 'No tee times left today')}</span>
            <button className="chip chip-on disabled:opacity-40" disabled={!!r.why || r.next === null} onClick={onBook} title="A slot on today's tee sheet: you play alone, with your skills, as the members do" data-testid="player-book">Book {r.next !== null && !r.why ? clock(r.next) : ''}</button>
          </div>
        )}
        {r.k === 'booked' && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-300">Booked: tee time <span className="font-semibold text-white">{clock(r.tee)}</span></span>
            <button className="chip" onClick={onCancel} data-testid="player-cancel">Cancel</button>
          </div>
        )}
        {r.k === 'out' && <div className="text-sky-200">Out on the course (teed off {clock(r.tee)})</div>}
        {r.k === 'done' && <div className="text-slate-300">You shot <span className="font-semibold text-white">{r.strokes}</span> ({toPar(r.strokes - r.par)})</div>}
      </div>
      <div className="space-y-1" data-testid="player-log">
        <div className="text-[12px] uppercase text-slate-400">Practice</div>
        {view.log.length ? view.log.map((e, i) => (
          <div key={i} className="rounded border border-white/5 bg-white/5 px-2 py-1 text-[12px] text-slate-300">
            <div>Day {e.day} · {e.text}</div>
            <div className="text-slate-400">${e.cost.toLocaleString()} · handicap {hcp(e.hcp[0])} to <span className="text-emerald-300">{hcp(e.hcp[1])}</span></div>
          </div>
        )) : <div className="text-[12px] text-slate-400">None yet. A bucket at the range raises driving and irons, the putting green putting, the chipping green the short game.</div>}
      </div>
      <div className="space-y-1" data-testid="player-rounds">
        <div className="text-[12px] uppercase text-slate-400">Rounds</div>
        {view.rounds.length ? view.rounds.map((x, i) => (
          <div key={i} className="flex justify-between text-[12px] text-slate-300"><span>Day {x.day} · {x.kind === 'everyday' ? 'Everyday round' : x.kind === 'match' ? 'Money match' : 'Tournament'}</span><span className="font-semibold text-white">{x.text}</span></div>
        )) : <div className="text-[12px] text-slate-400">None yet. Nerve grows as you play: a little from a friendly round, more from a match or the tournament.</div>}
      </div>
    </div>
  );
}
