// Your bag (T335, #961; the owner, 2026-11-04: "all the clubs and upgrading clubs ... shaft changes on putters add more feel and luck vs accuracy"): the 14 clubs as tiles in their groups (woods, irons, wedges,
// the putter), each tinted by its upgrade level (Garage-sale, Club, Tour, Prototype); a click opens the club's detail in a flyout to the card's left (the owner's rule: side-opening flyouts, no sideways
// scrollbar, no one long column): its carry, launch, spin and forgiveness, what the next level adds and costs, and for the putter its feel, line and luck and the two slots (the shaft and the head), each of which opens
// its parts in a second flyout further left (shafts and heads trading feel, accuracy and luck). The numbers are
// play/bag.ts bagView's, which reads the shot model's own (applyMods). The tile pictures are drawn stand-ins ("Stand In for club icons").
import { useState } from 'react';
import { CLUB_SHORT, LEVEL_NAME, type BagView, type Club, type ClubRow, type PartKind } from '../../game/golf/play';
import { Icon } from '../Icon';
import { ClubIcon, LEVEL_COLOR } from './ClubIcon';

const usd = (n: number): string => `$${n.toLocaleString('en-US')}`;
const YARDS = 1.09361;
/** the tile's border by level: Garage-sale plain, then sky, green and gold */
const TILE_BORDER = ['border-white/10', 'border-sky-400/60', 'border-emerald-400/70', 'border-amber-300/90 bg-amber-300/10'];
/** the level as three dots: filled up to the level */
function LevelDots({ level }: { level: number }) {
  return <span className="flex gap-0.5" aria-label={LEVEL_NAME[level]}>{[1, 2, 3].map(i => <span key={i} className="h-1.5 w-1.5 rounded-full border border-white/20" style={i <= level ? { background: LEVEL_COLOR[level], borderColor: LEVEL_COLOR[level] } : undefined} />)}</span>;
}
/** forgiveness as five dots */
function Pips({ n }: { n: number }) {
  return <span className="inline-flex gap-0.5 align-middle" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-2 w-2 rounded-full ${i <= n ? 'bg-amber-300' : 'bg-white/15'}`} />)}</span>;
}
/** one of the putter's three: a bar from 0 to its best */
function Bar({ label, value, tip }: { label: string; value: number; tip: string }) {
  return (
    <div className="grid grid-cols-[3.2rem_1fr] items-center gap-2 text-[11px]" title={tip}>
      <span className="text-slate-300">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-sky-400/80" style={{ width: `${Math.round(Math.min(1, Math.max(0.04, value)) * 100)}%` }} /></span>
    </div>
  );
}

/** the club's detail: the numbers, the next level's offer, and for the third wood's slot the swap */
function ClubDetail({ row, view, part, onUpgrade, onPart, onThird, onClose }: { row: ClubRow; view: BagView & { busy?: string | null }; part: PartKind | null; onUpgrade: (c: Club, voucher: boolean) => void; onPart: (k: PartKind | null) => void; onThird: (w: 'wood5' | 'hybrid') => void; onClose: () => void }) {
  const n = row.next, third = row.club === 'wood5' || row.club === 'hybrid';
  return (
    <div className="pointer-events-auto max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[300px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" data-testid="bag-detail">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2"><ClubIcon club={row.club} level={row.level} size={34} />
          <div><div className="font-semibold text-sky-200" data-testid="bag-detail-name">{row.name}</div>
            <div className="text-[12px]" style={{ color: LEVEL_COLOR[row.level] }} data-testid="bag-detail-level">{row.levelName}{row.level === 0 ? ' · the club you started with' : ''}</div></div></div>
        <button className="btn-icon" onClick={onClose} title="Close the club"><Icon name="close" size={16} /></button>
      </div>
      {row.club !== 'putter' && (
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs" data-testid="bag-stats">
          <dt className="text-slate-400" title="How far the ball flies with it at your game: your skill for it, your power and the club's upgrades">Carry</dt><dd className="tabular-nums text-white">{Math.round(row.carryM)} m <span className="text-slate-400">({Math.round(row.carryM * YARDS)} yd)</span></dd>
          <dt className="text-slate-400" title="The loft: a higher launch lands softer and catches less of a roll, a low one runs on">Launch</dt><dd className="text-white">{row.launch} <span className="text-slate-400">({row.loftDeg}°){row.runs ? ` · ${row.runs}` : ''}</span></dd>
          <dt className="text-slate-400" title="The backspin the club can put on the ball (the spin ball): a Tour wedge grips more">Spin</dt><dd className="tabular-nums text-white">{row.spinPct}% <span className="text-slate-400">of the most</span></dd>
          <dt className="text-slate-400" title="A wider sweet spot on the swing meter, a smaller scatter and fewer mishits">Forgiveness</dt><dd><Pips n={row.forgive} /></dd>
        </dl>
      )}
      {third && (
        <div className="flex items-center gap-1.5 text-xs" data-testid="bag-third" title="The third wood's slot holds a 5-wood (more distance) or a hybrid (more forgiving, plays off your irons). Each keeps its own level.">
          <span className="text-slate-400">Third wood</span>
          {(['wood5', 'hybrid'] as const).map(w => <button key={w} disabled={!!view.busy} className={`chip ${view.third.is === w ? 'chip-on' : ''}`} onClick={() => onThird(w)} data-testid={`bag-third-${w}`}>{w === 'wood5' ? '5-wood' : 'Hybrid'}</button>)}
        </div>
      )}
      {n ? (
        <div className="space-y-1 rounded-lg border border-white/10 bg-white/5 p-2 text-xs" data-testid="bag-next">
          <div className="flex items-baseline justify-between"><span className="font-semibold" style={{ color: LEVEL_COLOR[n.level] }}>Next: {n.name}</span><span className="tabular-nums text-white">{usd(n.price)}</span></div>
          <div className="text-slate-300">{n.lines.join(' · ') || 'A better finish'}</div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <button className="chip chip-on disabled:opacity-40" disabled={!!n.why || !!view.busy} title={view.busy ?? n.why ?? `Buy the ${n.name} level for ${usd(n.price)}`} onClick={() => onUpgrade(row.club, false)} data-testid="bag-upgrade">Upgrade {usd(n.price)}</button>
            {view.vouchers > 0 && <button className="chip disabled:opacity-40" disabled={!!n.voucherWhy || !!view.busy} title={view.busy ?? n.voucherWhy ?? 'Use a sponsor’s voucher: free'} onClick={() => onUpgrade(row.club, true)} data-testid="bag-voucher">Use a voucher</button>}
          </div>
          {(view.busy || n.why) && <div className="text-[11px] text-amber-200" data-testid="bag-why">{view.busy ?? n.why}</div>}
        </div>
      ) : <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-2 text-xs text-amber-100">A Prototype: the best there is.</div>}
      {row.club === 'putter' && <PutterFitting view={view} part={part} onPart={onPart} />}
    </div>
  );
}

/** the putter's fitting: its feel, line and luck as bars, and its two slots (the shaft and the head) as rows that open their parts in a flyout further left */
function PutterFitting({ view, part, onPart }: { view: BagView & { busy?: string | null }; part: PartKind | null; onPart: (k: PartKind | null) => void }) {
  const p = view.putter;
  return (
    <div className="space-y-2" data-testid="bag-fitting">
      <div className="space-y-1 rounded-lg border border-white/10 bg-white/5 p-2" data-testid="putter-profile">
        <div className="text-[11px] uppercase text-slate-400">Your putter</div>
        <Bar label="Feel" value={(p.feel - 0.6) / 1.2} tip={`Distance control: the pace may be further out, the lag putt lands closer (x${p.feel.toFixed(2)})`} />
        <Bar label="Line" value={(p.line - 0.5) / 2} tip={`Accuracy: how far off the line a putt may be and still drop, and the sweet spot on the line click (x${p.line.toFixed(2)})`} />
        <Bar label="Luck" value={p.luck / 0.5} tip={`A bad putt may still drop, a good one may lip out (${Math.round(p.luck * 100)}%)`} />
      </div>
      {(['shaft', 'head'] as const).map(k => {
        const cur = (k === 'shaft' ? p.shafts : p.heads).find(r => r.fitted);
        return (
          <button key={k} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs hover:border-amber-300/60 ${part === k ? 'border-amber-300/70 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}
            onClick={() => onPart(part === k ? null : k)} title={`Change the putter’s ${k}: it opens to the left`} data-testid={`bag-slot-${k}`}>
            <span><span className="block text-[11px] uppercase text-slate-400">{k === 'shaft' ? 'Shaft' : 'Head'}</span><span className="font-semibold text-slate-100">{cur?.name ?? ''}</span></span>
            <Icon name="left" size={14} />
          </button>
        );
      })}
    </div>
  );
}
/** the parts of one slot (the putter's shafts or heads) in a flyout: each with what it trades; Fit for one you own, Buy for one you do not */
function PartsFlyout({ kind, view, onFit, onClose }: { kind: PartKind; view: BagView & { busy?: string | null }; onFit: (k: PartKind, id: string) => void; onClose: () => void }) {
  const parts = kind === 'shaft' ? view.putter.shafts : view.putter.heads;
  return (
    <div className="pointer-events-auto max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[300px] space-y-1.5 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" data-testid={`bag-${kind}s`}>
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div><div className="font-semibold text-sky-200">Putter {kind}s</div><div className="text-[12px] text-slate-400">Feel, line and luck: what each trades</div></div>
        <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={16} /></button>
      </div>
      {parts.map(r => (
        <div key={r.id} className={`rounded-lg border p-1.5 text-xs ${r.fitted ? 'border-amber-300/60 bg-amber-300/10' : 'border-white/10 bg-white/5'}`} data-testid={`bag-${r.kind}-${r.id}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-100">{r.name}</span>
            {r.fitted ? <span className="text-[11px] font-semibold text-amber-200">Fitted</span>
              : <button className="chip disabled:opacity-40" disabled={!!r.why || !!view.busy} title={view.busy ?? r.why ?? (r.owned ? 'Fit it: free' : `Buy it for ${usd(r.price)} and fit it`)} onClick={() => onFit(r.kind, r.id)} data-testid={`bag-fit-${r.id}`}>{r.owned ? 'Fit' : `Buy ${usd(r.price)}`}</button>}
          </div>
          <div className="text-[11px] text-slate-300">{r.lines.join(' · ') || 'The plain one'}</div>
          <div className="text-[11px] text-slate-400">{r.note}</div>
          {!r.fitted && !r.owned && (r.why || view.busy) && <div className="text-[11px] text-amber-200">{view.busy ?? r.why}</div>}
        </div>
      ))}
    </div>
  );
}

/** the bag card: the tiles, and a club's detail to their left. `initial`: the club whose detail is open at first (captures, tests) */
export function BagCard({ view, onClose, onUpgrade, onFit, onThird, right = 'right-3', initial = null, initialPart = null }: {
  view: BagView & { busy?: string | null }; onClose: () => void; onUpgrade: (club: Club, voucher: boolean) => void; onFit: (kind: PartKind, id: string) => void; onThird: (which: 'wood5' | 'hybrid') => void; right?: string; initial?: Club | null;
  /** the putter's slot whose parts are open at first (captures, tests) */ initialPart?: PartKind | null }) {
  const [sel, setSel] = useState<Club | null>(initial), [part, setPart] = useState<PartKind | null>(initialPart);
  const row = sel ? view.rows.find(r => r.club === sel) ?? null : null;
  return (
    <div className={`pointer-events-none absolute ${right} top-[var(--hud-top,6rem)] z-20 flex items-start gap-1.5`} data-testid="bag-root">
      {row?.club === 'putter' && part && <PartsFlyout kind={part} view={view} onFit={onFit} onClose={() => setPart(null)} />}
      {row && <ClubDetail row={row} view={view} part={part} onUpgrade={onUpgrade} onPart={setPart} onThird={onThird} onClose={() => { setSel(null); setPart(null); }} />}
      <div className="pointer-events-auto max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[304px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" data-testid="bag-card">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div><div className="font-semibold text-sky-200">Your bag</div><div className="text-[12px] text-slate-400">{view.rows.length} clubs · {view.points} of {view.max} upgrades</div></div>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="flex items-baseline justify-between rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs">
          <span className="text-slate-400" title={view.shop ? 'The pro shop is open to you' : view.shopWhy ?? ''}>{view.shop ? 'Pro shop open' : 'No pro shop yet'}</span>
          <span className="tabular-nums text-white" data-testid="bag-money">{view.money === Infinity ? 'Unlimited' : usd(Math.round(view.money))}</span>
        </div>
        {view.vouchers > 0 && <div className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-xs text-amber-100" data-testid="bag-vouchers">{view.vouchers} sponsor’s voucher{view.vouchers > 1 ? 's' : ''}: a club upgraded free (up to Tour)</div>}
        {view.groups.map(g => (
          <div key={g.name} className="space-y-1" data-testid={`bag-group-${g.name.toLowerCase()}`}>
            <div className="text-[11px] uppercase text-slate-400">{g.name}</div>
            <div className="grid grid-cols-6 gap-1.5">
              {g.rows.map(r => (
                <button key={r.club} className={`flex flex-col items-center gap-0.5 rounded-lg border bg-white/5 px-0.5 py-1.5 text-[11px] hover:border-amber-300/60 ${r.club === 'putter' ? 'col-span-2' : ''} ${TILE_BORDER[r.level]} ${sel === r.club ? 'ring-2 ring-amber-300/80' : ''}`}
                  title={`${r.name}: ${r.levelName}${r.club === 'putter' ? '' : `, carry ${Math.round(r.carryM)} m`}`} onClick={() => { setSel(sel === r.club ? null : r.club); setPart(null); }} data-testid={`bag-club-${r.club}`} aria-label={r.name}>
                  <ClubIcon club={r.club} level={r.level} size={26} />
                  <span className="font-semibold text-slate-100">{CLUB_SHORT[r.club]}</span>
                  <LevelDots level={r.level} />
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-[11px] text-slate-400">Click a club for its carry, launch, spin and forgiveness, and to upgrade it. The putter takes shafts and heads that trade feel, line and luck.</p>
        <p className="text-[9px] text-slate-500">Stand In for club icons</p>
      </div>
    </div>
  );
}

