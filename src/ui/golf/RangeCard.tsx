// The range card (plan P24 Phase 1, T129): the driving range as a business. Today's golfers, the queue and the lost; the season's takings; the
// bucket price with what it does to the visitors; the upgrades, each with its cost, its effect and a Build button. Opened by clicking the range
// with the select tool, or the top bar's Range chip; the map changes the moment an upgrade is built. T206: each practice facility's row has a
// Build button (Facilities ▸ Practice armed with it, the practice area shown).
import type { RangeCardView } from '../../game/golf/rangehost';
import { PRICE_MAX, PRICE_MIN, PROPS_APPEAL_CAP, dayDemand, priceFactor, rangeScale } from '../../game/golf/rangesave';
import { appealText } from '../../game/golf/decor';
import { Icon } from '../Icon';
import { statusIcon } from '../status-icon';

const money = (n: number) => '$' + Math.round(n).toLocaleString();

export function RangeCard({ view, onClose, onPrice, onBuy, onShowPractice, onBuildPractice, practiceWhy = null, right = 'right-3' }: { view: RangeCardView; onClose: () => void; onPrice: (p: number) => void; onBuy: (id: RangeCardView['upgrades'][number]['id']) => void; onShowPractice?: () => void; /** T206: a facility's Build: Facilities ▸ Practice armed with it, the practice area shown */ onBuildPractice?: (id: RangeCardView['practice'][number]['id']) => void; /** the practice tools' lock (null: open) */ practiceWhy?: string | null; right?: string }) {
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
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
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
      <div className="grid grid-cols-2 gap-1.5 text-center">
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
                : onBuildPractice ? <button className="chip disabled:opacity-40" disabled={!!practiceWhy} title={practiceWhy || `Pick the ${f.name.toLowerCase()} and place it in the practice area`} onClick={() => onBuildPractice(f.id)} data-testid={`range-practice-build-${f.id}`}>Build</button>
                : <span className={f.state === 'none' ? 'text-slate-400' : 'text-amber-300'}>{f.state === 'none' ? 'Not built' : 'Not open yet'}</span>}
            </div>
            <div className="text-[12px] text-slate-400">{f.words}</div>
            {f.state !== 'open' && practiceWhy && <div className="text-[12px] text-amber-300/80">{practiceWhy}</div>}
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
          <div key={u.id} className={`rounded-lg border p-2 text-xs ${u.owned ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/5 bg-white/5'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-white">{u.name}</span>
              {u.owned ? <span className="text-emerald-300">Built</span> : (
                <button className="chip disabled:opacity-40" disabled={!!u.why} title={u.why || `Build for ${money(u.cost)}`} onClick={() => onBuy(u.id)} data-testid={`range-buy-${u.id}`}>Build {money(u.cost)}</button>
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
function Tile({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-1.5">
      <div className="text-[12px] uppercase text-slate-400">{label}</div>
      <div className={`text-sm font-bold ${tone}`}>{value}</div>
      <div className="text-[12px] text-slate-400">{sub}</div>
    </div>
  );
}
