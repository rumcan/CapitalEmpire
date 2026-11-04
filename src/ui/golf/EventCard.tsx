// T246 (#708): the club's own events' card (golf/clubevents.ts): the announcement a month before (enter when your handicap qualifies), the day itself
// (play it: your round on every hole under competition rules), and the result: the Club Championship's champion, the Mayor's Cup's presentation by the
// mayor. The mayor's picture is a labelled stand-in until GOLF-ART-LIST 222 (the town hall and the mayor) is drawn.
import type { EventCardView } from '../../game/engine';
import { Icon } from '../Icon';

/** the mayor's stand-in: a framed figure with the label the owner's rule asks for ("Stand In for <name>") */
function MayorStandIn({ presenting }: { presenting: boolean }) {
  return (
    <div className="relative flex h-24 w-20 shrink-0 flex-col items-center justify-end overflow-hidden rounded-lg border border-amber-300/30 bg-gradient-to-b from-sky-900/60 to-slate-900" data-testid="mayor-standin">
      {/* head, sash and suit drawn in plain shapes */}
      <div className="absolute top-3 h-6 w-6 rounded-full bg-[#e8c39e]" />
      <div className="absolute top-[2.1rem] h-12 w-14 rounded-t-2xl bg-slate-700" />
      <div className="absolute top-[2.3rem] h-10 w-2 rotate-[30deg] bg-amber-400/80" />
      {presenting && <div className="absolute right-0.5 top-8 text-amber-300"><Icon name="trophy" size={18} /></div>}
      <div className="relative z-10 w-full bg-amber-500/25 px-0.5 text-center text-[9px] leading-tight text-amber-100">Stand In for the Mayor</div>
    </div>
  );
}

export function EventCard({ view: v, right, onClose, onEnter, onPlay }: { view: EventCardView; right: string; onClose: () => void; onEnter: () => void; onPlay: () => void }) {
  const mayor = v.id === 'mayor', r = v.result;
  const about = mayor
    ? 'The town\'s yearly event at your club. You host it, you may play in it, and the mayor presents the cup.'
    : `Your members' championship: the members on the day's tee sheet, and you if your handicap is ${v.maxHcp?.toFixed(1)} or less.`;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 w-[320px] space-y-2 rounded-xl border border-amber-300/20 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="event-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-amber-200"><Icon name="trophy" size={16} />{v.name}</div>
          <div className="text-[12px] text-slate-400">{v.phase === 'today' ? `Today at your club · ${v.when}` : v.phase === 'result' ? `The result · ${v.when}` : `${v.when} at your club`}</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      {v.phase === 'result' && r ? (
        <div className="space-y-2" data-testid="event-result">
          <div className="flex gap-2">
            {mayor && <MayorStandIn presenting />}
            <div className="space-y-1 text-xs">
              {mayor
                ? <p className="text-slate-200">The mayor presents the Mayor&apos;s Cup {r.won ? <>to <span className="font-semibold text-amber-200">you</span></> : <>to <span className="font-semibold text-white">{r.champion || 'nobody'}</span></>}.</p>
                : <p className="text-slate-200">Club Champion {r.year}: <span className="font-semibold text-amber-200">{r.won ? v.you : r.champion || 'nobody'}</span></p>}
              <p className="rounded bg-white/5 px-1.5 py-1 text-slate-300">{v.line}</p>
              {r.won && <p className="font-semibold text-emerald-300">Prize: ${r.money.toLocaleString()} · club reputation +{r.rep} · the title is in your profile</p>}
              {r.pos === null && <p className="text-slate-400">{r.strokes === null && r.of > 0 ? 'You did not hand in a card this time.' : ''}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
            {mayor && <MayorStandIn presenting={false} />}
            <p className="text-slate-300">{about}</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
            <span>Your handicap <span className="font-semibold text-white">{v.hcpText}</span>{v.maxHcp !== null && <span className="text-slate-400"> (entry {v.maxHcp.toFixed(1)} or less)</span>}</span>
          </div>
          {v.why && <p className="text-amber-200" data-testid="event-why">{v.why}. Practise at the range to bring it down.</p>}
          {v.phase === 'soon' && !v.why && (v.entered
            ? <p className="text-emerald-300" data-testid="event-entered">You are entered. On the day, the first tee (or this card) starts your round.</p>
            : <button className="chip chip-on w-full justify-center" onClick={onEnter} data-testid="event-enter">Enter the {v.name}</button>)}
          {v.phase === 'today' && (
            <div className="space-y-1">
              <p className="text-slate-300">{v.field ?? 0} in the field · all {v.holes} holes · competition rules: no mulligans, no gimmies · your game under tournament pressure.</p>
              {v.playing ? <p className="text-sky-200">You are out on the course in it.</p>
                : <button className="chip chip-on w-full justify-center disabled:opacity-40" disabled={!!v.playWhy} onClick={onPlay} title={v.playWhy ?? ''} data-testid="event-play">Play the {v.name}</button>}
              {v.playWhy && !v.playing && !v.why && <p className="text-amber-200">{v.playWhy}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
