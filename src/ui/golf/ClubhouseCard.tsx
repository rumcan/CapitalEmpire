// The clubhouse card (T208, #553): everyday golf at the club. Today: the members and the visitors on the tee sheet and those checked in so far, the green
// fees taken (members pay nothing on the day), who is out on the course, the cars in the car park, the next tee time and the waits on the group ahead;
// the season: the rounds, the fees against what the year end expects, and the pace term. Opened by clicking the clubhouse with the select tool, or the
// top bar's Club chip.
import type { ClubCardView } from '../../game/golf/everyday';
import { Icon } from '../Icon';
import { WALK_SERVE_M, lotsLine } from '../../game/golf/walkserve';

const money = (n: number) => '$' + Math.round(n).toLocaleString();
/** a game minute of the day as 07:40 */
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
/** minutes as "12 min" or "1 h 05" */
const mins = (m: number) => m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;

export function ClubhouseCard({ view, onClose, right = 'right-3' }: { view: ClubCardView; onClose: () => void; right?: string }) {
  const t = view.today, s = view.season, pace = s.paceRep > 0 ? `+${s.paceRep}` : `${s.paceRep}`;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[340px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="club-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-amber-200">Clubhouse</div>
          <div className="text-[12px] text-slate-400">{view.open ? `Open · ${clock(view.minute)} · green fee ${money(view.fee)}` : 'Closed today: the course is the tournament\'s'} · {view.clubMembers} members</div>
        </div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="text-[12px] uppercase text-slate-400">Today</div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Tile label="Members" value={`${t.inMembers}/${t.members}`} sub="no fee today" testid="club-members" title="Members checked in of those on today's tee sheet: they pay their dues, not a green fee" />
        <Tile label="Visitors" value={`${t.inVisitors}/${t.visitors}`} sub={t.turned > 0 ? `${t.turned} turned away` : 'pay at the desk'} tone={t.turned > 0 ? 'text-rose-300' : 'text-white'} testid="club-visitors" title="Visitors checked in of those on today's tee sheet, each paying the green fee at the desk; turned away: the tee sheet was full" />
        <Tile label="Green fees" value={money(t.fees)} sub="taken today" tone="text-emerald-300" testid="club-fees" title={`Visitors x ${money(view.fee)}; each golfer you see stands for ${view.scale.toFixed(0)} rounds over the season`} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Tile label="On the course" value={`${t.out}`} sub={`${t.parked} cars parked`} />
        <Tile label="Next tee" value={t.next !== null ? clock(t.next) : '—'} sub={t.next !== null ? 'tee time' : 'all out'} />
        <Tile label="Waits" value={t.waiting > 0 ? `${t.waiting} now` : 'none now'} sub={`${mins(t.waitAvg)} a group`} tone={t.waitAvg >= 15 ? 'text-rose-300' : t.waitAvg >= 5 ? 'text-amber-200' : 'text-white'} testid="club-waits" title={`Groups waiting on the group ahead now; the waits so far today, per group teed off (the longest: ${mins(t.worst)})`} />
      </div>
      {/* T237: the car parks within walking distance of the door (golf/walkserve.ts) */}
      {view.lots && <div className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs ${view.lots.length ? 'text-slate-300' : 'font-semibold text-rose-300'}`} data-testid="club-lots" title={`A car park serves the clubhouse when its nearest bay is within ${WALK_SERVE_M} m of walking (about 2 minutes) of the door; car parks further away add no bays`}>{lotsLine(view.lots)}</div>}
      <div className="text-[12px] uppercase text-slate-400">This season</div>
      <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="club-season">
        <div className="flex items-center justify-between"><span className="text-slate-300">Rounds: <span className="font-semibold text-white">{s.members.toLocaleString()}</span> members · <span className="font-semibold text-white">{s.visitors.toLocaleString()}</span> visitors</span><span className="text-slate-400">{s.days} {s.days === 1 ? 'day' : 'days'}</span></div>
        <div className="flex items-center justify-between"><span className="text-slate-300">Green fees: <span className="font-semibold text-emerald-300">{money(s.fees)}</span></span><span className="text-slate-400" title="What the season's green fees should come to at this course and reputation (yearend greenFeeIncome)">expected {money(s.expected)} a season</span></div>
        <div className="flex items-center justify-between" title="How the course plays moves the reputation at the season's end: +1 when groups wait 5 minutes or less a round, down to -3 at 30 minutes or more"><span className="text-slate-300">Pace: <span className="font-semibold text-white">{mins(s.waitAvg)}</span> waiting a round</span><span className={s.paceRep > 0 ? 'text-emerald-300' : s.paceRep < 0 ? 'text-rose-300' : 'text-slate-400'}>{pace} reputation</span></div>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone = 'text-white', testid, title }: { label: string; value: string; sub: string; tone?: string; testid?: string; title?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-1.5" data-testid={testid} title={title}>
      <div className="text-[12px] uppercase text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="text-[12px] text-slate-400">{sub}</div>
    </div>
  );
}
