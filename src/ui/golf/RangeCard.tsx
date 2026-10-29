// The range card (plan P24 Phase 1, T129): the driving range as a business. Today's golfers, the queue and the lost; the season's takings; the
// bucket price with what it does to the visitors; the upgrades, each with its cost, its effect and a Build button. Opened by clicking the range
// with the select tool, or the top bar's Range chip; the map changes the moment an upgrade is built. T206: each practice facility's row has a
// Build button (Facilities ▸ Practice armed with it, the practice area shown). T241: your golf (the "You" block: hit a bucket, with its gain and cost, and
// the last session's result; an open practice green's row has its own Practise button) and the profile card behind it.
import type { RangeCardView } from '../../game/golf/rangehost';
import type { PracticeKind, YouPracticeView, YouRangeView } from '../../game/golf/player';
import { PRICE_MAX, PRICE_MIN, PROPS_APPEAL_CAP, dayDemand, priceFactor, rangeScale } from '../../game/golf/rangesave';
import { appealText } from '../../game/golf/decor';
import { WALK_SERVE_M, lotsLine } from '../../game/golf/walkserve';
import { Icon } from '../Icon';
import { statusIcon } from '../status-icon';

const money = (n: number) => '$' + Math.round(n).toLocaleString();

export function RangeCard({ view, onClose, onPrice, onBuy, onShowPractice, onBuildPractice, practiceWhy = null, right = 'right-3', onScene, you = null, onPractise, onProfile, profileOpen = false }: { view: RangeCardView; onClose: () => void; onPrice: (p: number) => void; onBuy: (id: RangeCardView['upgrades'][number]['id']) => void; onShowPractice?: () => void; /** T206: a facility's Build: Facilities ▸ Practice armed with it, the practice area shown */ onBuildPractice?: (id: RangeCardView['practice'][number]['id']) => void; /** the practice tools' lock (null: open) */ practiceWhy?: string | null; right?: string; /** T242: Set the scene (the range's picture card; absent: no art) */ onScene?: () => void;
  /** T241: your golf (null: none) and its actions: a practice session, and the profile card (open: profileOpen) */ you?: YouRangeView | null; onPractise?: (k: PracticeKind) => void; onProfile?: () => void; profileOpen?: boolean }) {
  const { biz, stats: st, today } = view, scale = Math.round(rangeScale(view.dayLen)), pf = priceFactor(biz.price, st.ref);
  const want = Math.round(dayDemand(biz, view.demand, st)), cap = st.bays * (st.close - st.open);
  const demandWord = pf >= 1.15 ? 'cheap: more golfers' : pf <= 0.85 ? 'dear: fewer golfers' : 'fair';
  return (
    <div className={`pointer-events-auto absolute ${right} top-[var(--hud-top,6rem)] z-20 max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[340px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur`} data-testid="range-card">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div>
          <div className="font-semibold text-amber-200">Driving range</div>
          <div className="text-[12px] text-slate-400">{st.proShop ? 'Pro shop' : 'The shack (a crappy pro shop)'} · {st.tier2 ? `${st.lowerBays} + ${st.bays - st.lowerBays} upstairs` : st.bays} bays · {st.counters} {st.counters === 1 ? 'counter' : 'counters'} · open {view.hours}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onScene && <button className="chip" onClick={onScene} title="Set the scene: a picture of your range as it stands" data-testid="range-scene"><Icon name="camera" size={16} />Scene</button>}
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <Tile label="Today" value={`${Math.round(today.golfers)}`} sub="golfers" />
        <Tile label="Hitting" value={`${today.playing}/${st.bays}`} sub={st.tier2 ? `${view.upstairs} upstairs · ${today.queue} queued` : `${today.queue} queued`} />
        <Tile label="Lost" value={`${today.lost > 0 ? `${statusIcon('warn')} ` : ''}${Math.round(today.lost)}`} sub="drove on" tone={today.lost > 0 ? 'text-rose-300' : 'text-white'} />
      </div>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="range-parking" title="The range's car park: its golfers' cars parked now of its bays (the lot's and the car park building's), and the cars that drove on today because it was full">
        <span className="text-slate-300">Parking: <span className="font-semibold text-white">{view.parking.parked}/{view.parking.bays}</span> cars{view.parking.garage ? <span className="text-slate-400"> · building {view.parking.garage.parked}/{view.parking.garage.cars}</span> : null}</span>
        <span className={view.parking.turned > 0 ? 'font-semibold text-rose-300' : 'text-slate-400'}>{view.parking.turned} turned away today{view.parking.turned > 0 && !st.parking ? ' (car park full)' : ''}</span>
      </div>
      {/* T237: the car parks within walking distance of the shop (golf/walkserve.ts): only their bays count for the range */}
      <div className={`rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs ${view.parking.lots.length ? 'text-slate-300' : 'font-semibold text-rose-300'}`} data-testid="range-lots" title={`A car park serves the range when its nearest bay is within ${WALK_SERVE_M} m of walking (about 2 minutes) of the shop; car parks further away add no bays`}>{lotsLine(view.parking.lots)}</div>
      <div className="grid grid-cols-2 gap-1.5 text-center" data-guide="range-takings">
        <Tile label="Season takings" value={money(biz.season.takings)} sub={`${Math.round(biz.season.buckets).toLocaleString()} buckets`} tone="text-emerald-300" />
        <Tile label="Demand a day" value={`${want}`} sub={`room for ${cap}`} />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="range-upkeep" title="Each upgrade costs a little every game month (twelve a season), booked as upkeep; the range itself costs $2,000 a season">
        <span className="text-slate-300">Upgrades' upkeep: <span className={view.upkeep > 0 ? 'font-semibold text-rose-300' : 'text-white'}>{money(view.upkeep)} a month</span></span>
        <span className="text-slate-400">{money(view.upkeepSeason)} this season</span>
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs">
        <div className="mb-1 flex items-center justify-between"><span className="text-[12px] uppercase text-slate-400">Bucket price</span><span className="text-slate-400">{demandWord}</span></div>
        <div className="flex items-center gap-2">
          <button className="chip" disabled={biz.price <= PRICE_MIN} onClick={() => onPrice(biz.price - 1)} title="Cheaper">−</button>
          <span className="min-w-[3rem] text-center text-base font-bold text-white">{money(biz.price)}</span>
          <button className="chip" disabled={biz.price >= PRICE_MAX} onClick={() => onPrice(biz.price + 1)} title="Dearer">+</button>
          <span className="text-[12px] text-slate-400">{st.extra ? `+ ${money(st.extra)} shop spend · ` : ''}fair price {money(st.ref)}</span>
        </div>
        <div className="mt-1 text-[12px] text-slate-400">Each golfer you see stands for {scale} customers over the season.</div>
      </div>
      {you && (
        <div className="space-y-1 rounded-lg border border-sky-400/25 bg-sky-400/5 p-2 text-xs" data-testid="range-you">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] uppercase text-slate-400">Your golf</span>
            <span className="flex items-center gap-1.5">
              <span className="text-slate-300" title="Your handicap: the strokes over par your skills average over 18 holes">{you.name} · handicap <span className="font-semibold text-white" data-testid="range-you-hcp">{you.hcpText}</span></span>
              {onProfile && <button className={`chip normal-case ${profileOpen ? 'chip-on' : ''}`} onClick={onProfile} title="Your skills, your practice log, your rounds and your tee time" data-testid="range-you-profile">Profile</button>}
            </span>
          </div>
          <Session s={you.sessions.find(x => x.kind === 'bucket')!} onPractise={onPractise} />
          {you.last && <div className="text-[12px] text-slate-400" data-testid="range-you-last">Last: {you.last.text} · ${you.last.cost.toLocaleString()} · handicap {hcp(you.last.hcp[0])} to <span className="text-emerald-300">{hcp(you.last.hcp[1])}</span></div>}
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="range-props-appeal" title="Props within 15 tiles of the shop or the mats (the Props tool): more golfers, and a higher fair price">
        <span className="text-slate-300">Appeal from props: <span className={st.propsAppeal > 0 ? 'font-semibold text-emerald-300' : 'text-white'}>{appealText(st.propsAppeal)}</span> <span className="text-slate-400">(of {appealText(PROPS_APPEAL_CAP)})</span></span>
      </div>
      <div className="space-y-1.5" data-testid="range-practice">
        <div className="flex items-center justify-between text-[12px] uppercase text-slate-400">
          <span>Practice facilities</span>
          {onShowPractice && <button className="chip normal-case" onClick={onShowPractice} title="Show the practice area with the next facility in hand">Show area</button>}
        </div>
        {view.practice.map(f => (
          <div key={f.id} className={`rounded-lg border p-2 text-xs ${f.state === 'open' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`} data-testid={`range-practice-${f.id}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">{f.name}</span>
              {f.state === 'open' ? <span className="text-emerald-300">Open</span>
                : onBuildPractice ? <button className="chip chip-on disabled:opacity-40" disabled={!!practiceWhy} title={practiceWhy || `Pick the ${f.name.toLowerCase()} and place it in the practice area`} onClick={() => onBuildPractice(f.id)} data-testid={`range-practice-build-${f.id}`}>Build</button>
                : <span className={f.state === 'none' ? 'text-slate-400' : 'text-amber-300'}>{f.state === 'none' ? 'Not built' : 'Not open yet'}</span>}
            </div>
            <div className="text-[12px] text-slate-400">{f.words}</div>
            {f.state !== 'open' && practiceWhy && <div className="text-[12px] text-amber-300/80">{practiceWhy}</div>}
            {f.state === 'open' && you && (() => { const s = you.sessions.find(x => x.kind === f.id); return s && <div className="mt-1"><Session s={s} onPractise={onPractise} /></div>; })()}
            <div className="mt-0.5 flex justify-between text-[12px] text-slate-400">
              <span>+{Math.round(f.appeal * 100)}% visitors · ${view.fee} a golfer</span>
              <span>{f.today} today · {Math.round(f.golfers)} this season · <span className="text-emerald-300/90">{money(f.takings)}</span></span>
            </div>
          </div>
        ))}
        <div className="text-[12px] text-slate-400">In the Practice area beside the car park. A share of the range's golfers walk over after their bucket.</div>
      </div>
      {view.extras.some(e => e.owned) && (
        <div className="space-y-1.5" data-testid="range-extras">
          <div className="text-[12px] uppercase text-slate-400">Kiosk and academy</div>
          {view.extras.filter(e => e.owned).map(e => (
            <div key={e.id} className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs" data-testid={`range-extra-${e.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">{e.id === 'kiosk' ? 'Coffee kiosk' : 'Golf academy'}</span>
                <span className="text-[12px] text-slate-400">{e.today} today · {Math.round(e.season.golfers)} this season · <span className="text-emerald-300/90">{money(e.season.takings)}</span></span>
              </div>
              <div className="text-[12px] text-slate-400">{e.words}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs" data-testid="range-home" title="Your home beside the range grows with the range's lifetime takings">
        <span className="text-slate-300">Your home: <span className="font-semibold text-white">{view.home.name}</span></span>
        <span className="text-slate-400">{view.home.next ? `${view.home.next.name} at ${money(view.home.next.at)} taken (${money(view.home.total)} so far)` : `${money(view.home.total)} taken in all`}</span>
      </div>
      <div className="space-y-1.5" data-testid="range-upgrades">
        <div className="text-[12px] uppercase text-slate-400">Upgrades</div>
        {view.upgrades.map(u => (
          <div key={u.id} className={`rounded-lg border p-2 text-xs ${u.owned ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`} data-guide={`range-buy-${u.id}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">{u.name}</span>
              {u.owned ? <span className="text-emerald-300">Built</span> : (
                <button className="chip chip-on disabled:opacity-40" disabled={!!u.why} title={u.why || `Build for ${money(u.cost)}`} onClick={() => onBuy(u.id)} data-testid={`range-buy-${u.id}`}>Build {money(u.cost)}</button>
              )}
            </div>
            <div className="text-[12px] text-slate-400">{u.effect}</div>
            <div className="text-[12px] text-slate-400">Upkeep {money(u.upkeep)} a month{view.needs[u.id].length ? ` · needs ${view.needs[u.id].join(' and ')}` : ''}</div>
            {!u.owned && u.why && u.why !== 'Built' && <div className="text-[12px] text-amber-300/80">{u.why}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
/** a handicap as golfers write it (+ below scratch) */
const hcp = (h: number) => h < 0 ? `+${(-h).toFixed(1)}` : h.toFixed(1);
/** T241: one practice session's button: its cost and minutes, the gain to each skill it raises and the handicap after; the reason when it cannot start */
function Session({ s, onPractise }: { s: YouPracticeView; onPractise?: (k: PracticeKind) => void }) {
  const gains = s.gains.map(g => `${g.name.toLowerCase()} +${g.gain.toFixed(1)}`).join(', ');
  return (
    <div className="space-y-0.5" data-testid={`practise-${s.kind}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button className="chip chip-on disabled:opacity-40" disabled={!onPractise || !!s.why} onClick={() => onPractise?.(s.kind)} title={s.why ?? `${s.name}: $${s.cost} and ${s.min} minutes; ${gains}`} data-testid={`practise-${s.kind}-go`}>{s.name}</button>
        <span className="text-slate-300">${s.cost.toLocaleString()} · {s.min} min</span>
        <span className="text-emerald-300/90">{gains}</span>
        <span className="text-slate-400">handicap {hcp(s.hcp[0])} to {hcp(s.hcp[1])}</span>
      </div>
      {s.why && <div className="text-[12px] text-amber-300/80" data-testid={`practise-${s.kind}-why`}>{s.why}</div>}
    </div>
  );
}
function Tile({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-1.5">
      <div className="text-[12px] uppercase text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="text-[12px] text-slate-400">{sub}</div>
    </div>
  );
}
