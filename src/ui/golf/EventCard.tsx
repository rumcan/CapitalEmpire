// T246 (#708): the club's own events' card (golf/clubevents.ts): the announcement a month before (enter when your handicap qualifies), the day itself
// (play it: your round on every hole under competition rules), and the result: the Club Championship's champion, the Mayor's Cup's presentation by the
// mayor. #1296 (the owner: nothing on screen says Stand In, and no code-drawn stand-in pictures): the card has no picture of the mayor until GOLF-ART-LIST 222 (the town hall and the mayor) is painted; it was a drawn figure labelled "Stand In for the Mayor".
import type { EventCardView } from '../../game/engine';
import { clock } from '../../game/golf/player';
import { Icon } from '../Icon';
import { EVENT_EMBLEM, Emblem } from '../Emblem';
import { PullBanner } from './CardsCard';

export function EventCard({ view: v, right, onClose, onEnter, onPlay, onMachine }: { view: EventCardView; right: string; onClose: () => void; onEnter: () => void; onPlay: () => void; /** T336: opens the vending machine (the card pull this result paid) */ onMachine?: () => void }) {
  const mayor = v.id === 'mayor', r = v.result;
  const about = mayor
    ? 'The town\'s yearly event at your club. You host it, you may play in it, and the mayor presents the cup.'
    : `Your members' championship: the members on the day's tee sheet, and you if your handicap is ${v.maxHcp?.toFixed(1)} or less.`;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 w-[320px] space-y-2 rounded-xl border border-amber-300/20 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="event-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="flex items-center gap-1.5 font-semibold text-amber-200"><Emblem id={EVENT_EMBLEM[v.id]} size={44} fallback={<Icon name="trophy" size={16} />} />{v.name}</div>
          <div className="text-[12px] text-slate-400">{v.phase === 'today' ? `Today at your club · ${v.when}` : v.phase === 'result' ? `The result · ${v.when}` : `${v.when} at your club`}</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      {v.phase === 'result' && r ? (
        <div className="space-y-2" data-testid="event-result">
          <div className="flex gap-2">
            <div className="space-y-1 text-xs">
              {mayor
                ? <p className="text-slate-200">The mayor presents the Mayor&apos;s Cup {r.won ? <>to <span className="font-semibold text-amber-200">you</span></> : <>to <span className="font-semibold text-white">{r.champion || 'nobody'}</span></>}.</p>
                : <p className="text-slate-200">Club Champion {r.year}: <span className="font-semibold text-amber-200">{r.won ? v.you : r.champion || 'nobody'}</span></p>}
              <p className="rounded bg-white/5 px-1.5 py-1 text-slate-300">{v.line}</p>
              {r.won && <p className="font-semibold text-emerald-300">Prize: ${r.money.toLocaleString()} · club reputation +{r.rep} · the title is in your profile</p>}
              {r.pos === null && <p className="text-slate-400">{r.strokes === null && r.of > 0 ? 'You did not hand in a card this time.' : ''}</p>}
            </div>
          </div>
          {v.pull && <PullBanner earn={v.pull} onOpen={onMachine} />}
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex gap-2">
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
                : <button className="chip chip-on w-full justify-center disabled:opacity-40" disabled={!!v.playWhy} onClick={onPlay} title={v.playWhy ?? ''} data-testid="event-play">Start round{v.tee != null ? ` · tee time ${clock(v.tee)}` : ''}</button>}
              {v.playWhy && !v.playing && !v.why && <p className="text-amber-200">{v.playWhy}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
