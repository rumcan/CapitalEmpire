// The clubhouse card (T208, #553): everyday golf at the club. Today: the members and the visitors on the tee sheet and those checked in so far, the green
// fees taken (members pay nothing on the day), who is out on the course, the cars in the car park, the next tee time and the waits on the group ahead;
// the season: the rounds, the fees against what the year end expects, and the pace term. Opened by clicking the clubhouse with the select tool, or the
// top bar's Club chip. T269 (#810): the Grounds crew: hire and let go the greenkeepers and mower operators, their wages, and the course's condition.
// T214 (#559, plan P26 5.1): the Members block beside it: the members, this month's joined and left and the pool; the dues stepper against the fair
// band; the money a month; and what sells memberships (club-members.ts words it).
import type { ClubCardView } from '../../game/golf/everyday';
import type { MembersView } from '../../game/golf/club';
import { STAND, bandBar, factor, fairWords, membersHeadline, moneyLine, priceSteps, whyLines } from './club-members';
import type { CrewCardView, StaffRole } from '../../game/golf/staff';
import { Icon } from '../Icon';
import { WALK_SERVE_M, lotsLine } from '../../game/golf/walkserve';

const money = (n: number) => '$' + Math.round(n).toLocaleString();
/** a game minute of the day as 07:40 */
const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
/** minutes as "12 min" or "1 h 05" */
const mins = (m: number) => m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')}`;

export function ClubhouseCard({ view, onClose, onStaff, onPrice, right = 'right-3', onScene }: { view: ClubCardView; onClose: () => void; onStaff?: (role: StaffRole, delta: 1 | -1) => void; /** T214: the dues stepper (the dues a month) */ onPrice?: (price: number) => void; right?: string; /** T242: Set the scene (the clubhouse's picture card by tier; absent: no art yet) */ onScene?: () => void }) {
  const t = view.today, s = view.season, pace = s.paceRep > 0 ? `+${s.paceRep}` : `${s.paceRep}`;
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[340px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="club-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-amber-200">Clubhouse</div>
          <div className="text-[12px] text-slate-400">{view.open ? `Open · ${clock(view.minute)} · green fee ${money(view.fee)}` : 'Closed today: the course is the tournament\'s'} · {view.clubMembers} members</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onScene && <button className="chip" onClick={onScene} title="Set the scene: a picture of your clubhouse as it stands" data-testid="club-scene"><Icon name="camera" size={16} />Scene</button>}
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
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
        {view.crew && <div className="flex items-center justify-between" title="Each cup the greenkeepers do not change stays in yesterday's spot; the share of the season's hole-days with an unmoved pin takes up to 3 reputation at the season's end"><span className="text-slate-300">Pins: <span className="font-semibold text-white">{view.crew.cupsToday} of {view.crew.holes}</span> moved this morning</span><span className={view.crew.pinRep < 0 ? 'text-rose-300' : 'text-slate-400'} data-testid="crew-pin-rep">{view.crew.pinRep < 0 ? `${view.crew.pinRep} reputation` : '0 reputation'}</span></div>}
        <div className="flex items-center justify-between" title="How the course plays moves the reputation at the season's end: +1 when groups wait 5 minutes or less a round, down to -3 at 30 minutes or more"><span className="text-slate-300">Pace: <span className="font-semibold text-white">{mins(s.waitAvg)}</span> waiting a round</span><span className={s.paceRep > 0 ? 'text-emerald-300' : s.paceRep < 0 ? 'text-rose-300' : 'text-slate-400'}>{pace} reputation</span></div>
        {view.members && <div className="flex items-center justify-between" data-testid="club-season-dues" title="The members' dues are paid as each month begins, into the treasury; the season's results show them as Memberships"><span className="text-slate-300">Dues: <span className="font-semibold text-emerald-300">{money(view.members.season.dues)}</span> this season</span><span className="text-slate-400">joined {view.members.season.joined} · left {view.members.season.left}</span></div>}
      </div>
      {view.members && <MembersBlock m={view.members} onPrice={onPrice} />}
      {view.crew && <CrewBlock c={view.crew} onStaff={onStaff} />}
    </div>
  );
}

/** T214: the Members block: the headline, the dues stepper with the fair band under it, the money a month and "What sells memberships" */
function MembersBlock({ m, onPrice }: { m: MembersView; onPrice?: (price: number) => void }) {
  const h = membersHeadline(m), st = priceSteps(m), bar = bandBar(m), stand = STAND[m.stand], ml = moneyLine(m);
  const tone = m.stand === 'fair' ? 'text-emerald-300' : 'text-amber-200';
  return (
    <>
      <div className="flex items-center justify-between text-[12px] uppercase text-slate-400"><span>Members</span><span className="normal-case" data-testid="club-dues-month">{ml.dues} a month</span></div>
      <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="club-members-block">
        <div className="text-slate-300" data-testid="club-members-head" title="Members join each month from the pool (the town's golfers and the visitors who come back) and some leave; they play free and pay the dues">
          <span className="text-sm font-bold text-white">{h.members}</span> · <span className={h.net > 0 ? 'text-emerald-300' : h.net < 0 ? 'text-rose-300' : 'text-slate-300'}>{h.month}</span> · {h.pool}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] uppercase text-slate-400">Dues</span>
          <button className="chip" disabled={!onPrice || st.down === null} onClick={() => { if (st.down !== null) onPrice?.(st.down); }} title={`Cheaper dues (${money(m.step)} less): more join`} aria-label="Lower the dues" data-testid="club-price-down">−</button>
          <span className="min-w-[3.5rem] text-center text-base font-bold text-white" data-testid="club-price">{money(m.price)}</span>
          <button className="chip" disabled={!onPrice || st.up === null} onClick={() => { if (st.up !== null) onPrice?.(st.up); }} title={`Dearer dues (${money(m.step)} more): fewer join, more leave`} aria-label="Raise the dues" data-testid="club-price-up">+</button>
          <span className="text-[12px] text-slate-400">a month</span>
        </div>
        <div className="relative h-2 rounded-full bg-white/10" data-testid="club-band" title={`The fair band: ${money(m.band[0])} to ${money(m.band[1])} a month (your price: ${money(m.price)})`}>
          <div className="absolute inset-y-0 rounded-full bg-emerald-500/70" style={{ left: `${(bar.lo * 100).toFixed(1)}%`, width: `${((bar.hi - bar.lo) * 100).toFixed(1)}%` }} />
          <div className="absolute -top-0.5 h-3 w-1 rounded-sm bg-amber-300" style={{ left: `calc(${(bar.at * 100).toFixed(1)}% - 2px)` }} data-testid="club-band-marker" />
        </div>
        <div className="flex items-center justify-between gap-2 text-[12px]"><span className="text-slate-400" data-testid="club-fair">{fairWords(m)}</span><span className={`font-semibold ${tone}`}>{stand.word}</span></div>
        <div className={`text-[12px] ${tone}`} data-testid="club-stand">{stand.line}</div>
        <div className="text-[12px] text-slate-300" data-testid="club-member-money" title="A month: the dues the members pay, their upkeep (lockers, handicap cards, the newsletter) and the visitors' green fees the members no longer pay (they were regulars)">
          Dues <span className="font-semibold text-emerald-300">{ml.dues}</span> · upkeep <span className="font-semibold text-rose-300">{ml.upkeep}</span> · about <span className="font-semibold text-white">{ml.lost}</span> of green fees lost a month
        </div>
        <details className="border-t border-white/10 pt-1" data-testid="club-why">
          <summary className="cursor-pointer text-[12px] text-slate-300">What sells memberships</summary>
          <ul className="mt-1 space-y-0.5 text-[12px]">
            {whyLines(m).map(w => <li key={w.id} className="flex items-baseline justify-between gap-2" data-testid={`club-why-${w.id}`}><span className="text-slate-300">{w.text}</span>{w.factor !== null && <span className={`shrink-0 tabular-nums ${w.factor < 0.95 ? 'text-amber-200' : w.factor > 1.05 ? 'text-emerald-300' : 'text-slate-400'}`}>{factor(w.factor)}</span>}</li>)}
          </ul>
        </details>
      </div>
    </>
  );
}

const ROLE: Record<StaffRole, { one: string; many: string; does: string }> = {
  gk: { one: 'Greenkeeper', many: 'Greenkeepers', does: 'Moves the cups each morning, rakes the bunkers, mows the greens' },
  mo: { one: 'Mower operator', many: 'Mower operators', does: 'Cuts the fairways and the rough' },
};
/** T269: the Grounds crew block: each role's count with Hire and Let go, its wage and what the course needs; the wages a month; the condition and the turf */
function CrewBlock({ c, onStaff }: { c: CrewCardView; onStaff?: (role: StaffRole, delta: 1 | -1) => void }) {
  const short = (['gk', 'mo'] as const).filter(r => c.staff[r] < c.need[r]);
  const tone = c.condition >= 90 ? 'text-emerald-300' : c.condition >= 70 ? 'text-amber-200' : 'text-rose-300';
  return (
    <>
      <div className="flex items-center justify-between text-[12px] uppercase text-slate-400"><span>Grounds crew</span><span className="normal-case" data-testid="crew-wages">{money(c.wages)} a month</span></div>
      <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="club-crew">
        {(['gk', 'mo'] as const).map(r => (
          <div key={r} className="flex items-center gap-2" data-testid={`crew-${r}`} title={`${ROLE[r].does}. ${money(c.wage[r])} a month each; letting one go costs a month's wage. A new hire starts the next morning`}>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white">{ROLE[r].many}</div>
              <div className={`text-[12px] ${c.staff[r] < c.need[r] ? 'text-amber-200' : 'text-slate-400'}`}>{money(c.wage[r])} a month · {c.need[r] ? `${c.need[r]} needed for ${c.holes} holes` : 'none needed yet'}</div>
            </div>
            <button className="btn-icon" disabled={!onStaff || c.staff[r] <= 0} onClick={() => onStaff?.(r, -1)} title={`Let a ${ROLE[r].one.toLowerCase()} go (a month's wage, ${money(c.wage[r])})`} aria-label={`Let a ${ROLE[r].one.toLowerCase()} go`} data-testid={`crew-${r}-letgo`}>−</button>
            <span className="w-5 text-center text-sm font-bold tabular-nums text-white" data-testid={`crew-${r}-n`}>{c.staff[r]}</span>
            <button className="btn-icon" disabled={!onStaff || c.staff[r] >= c.max} onClick={() => onStaff?.(r, 1)} title={`Hire a ${ROLE[r].one.toLowerCase()} (${money(c.wage[r])} a month)`} aria-label={`Hire a ${ROLE[r].one.toLowerCase()}`} data-testid={`crew-${r}-hire`}>+</button>
          </div>
        ))}
        <div className="border-t border-white/10 pt-1.5" data-testid="crew-condition" title="The course's condition: each job the crew falls behind on (greens, bunkers, fairways, rough) lowers it; it takes up to a quarter off the quality score the golfers, the members and the tournament see">
          <div className="text-slate-300">Condition <span className={`font-semibold ${tone}`}>{c.condition}</span> of 100</div>
          <div className="text-[12px] text-slate-400">Greens {c.stimp.toFixed(1)} ft on the stimp · fairways {c.fairwayMM} mm · rough {c.roughMM} mm</div>
        </div>
        {short.length > 0 && <div className="text-[12px] font-semibold text-amber-200" data-testid="crew-short">{short.map(r => `${c.need[r] - c.staff[r]} ${c.need[r] - c.staff[r] === 1 ? ROLE[r].one.toLowerCase() : ROLE[r].many.toLowerCase()} short`).join(', ')}: {short.includes('gk') ? 'cups stay put and the greens slow' : ''}{short.length === 2 ? '; ' : ''}{short.includes('mo') ? 'the grass grows long' : ''}</div>}
      </div>
    </>
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
