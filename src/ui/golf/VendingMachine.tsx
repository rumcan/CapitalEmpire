// The vending machine (T336, #962; the owner, 2026-11-04: "lets copy the vending machine from the trick or treat game where is spins like the counterstrike cases opening"): the pro shop's prize machine. Copied from
// TrickOrTreat's src/ui/VendingMachine.tsx (read-only there, with the owner's permission) and made for cards: a reel of tiles that spins and slows onto the prize, rarity colours (common grey to legendary orange), a marker
// at the centre, the odds of each grade and the table of how pulls are earned. The prize is decided before the reel turns (the engine rolls it once; the decoys decide nothing); this only shows it: the reel is one CSS
// transform animation (the Web Animations API, 4.4 s, the easing of a case opening) on the compositor, so it costs the game no frame; no per-frame React work, no blur over the game. Reduced motion: 0.35 s.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CARDS, DUDS, EARN_TABLE, GRADE_NAME, GRADES, RARITIES, cardPrize, prizeKind, prizeName, type Grade, type Prize, type VendingView } from '../../game/golf/cards';
import { Icon } from '../Icon';
import { CardArt } from './CardArt';
import { GRADE_COLOR, PullChips } from './CardsCard';

/** how long the reel turns (ms), and with reduced motion */
export const REEL_MS = 4400, REEL_MS_REDUCED = 350;
const GREY = '#94a3b8';

/** a prize's picture: a card's, a sponsor's voucher (a star in its rarity's colour) or the junk (grey) */
function PrizeArt({ p, className }: { p: Prize; className: string }) {
  if (p.kind === 'card') return <CardArt glyph={p.card.glyph} art={p.card.art} color={RARITIES[p.rarity].color} className={className} />;
  if (p.kind === 'voucher') return <CardArt glyph="star" color={RARITIES[p.rarity].color} className={className} />;
  return <CardArt glyph={p.dud.glyph} color={GREY} className={`${className} saturate-50`} />;
}
const colorOf = (p: Prize): string => p.kind === 'dud' ? GREY : RARITIES[p.rarity].color;

/** one tile of the reel */
function ReelTile({ p, winner }: { p: Prize; winner: boolean }) {
  return (
    <div className={`vm-tile ${winner ? 'vm-winner' : ''}`} style={{ '--prize': colorOf(p) } as CSSProperties} data-testid={winner ? 'vending-winner-tile' : undefined}>
      <PrizeArt p={p} className="aspect-[16/10] w-full" />
      <span className="block px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: colorOf(p) }}>{prizeKind(p)}</span>
      <strong className="block min-h-[2.4rem] px-2 pb-1.5 text-[13px] leading-tight text-slate-100">{prizeName(p)}</strong>
    </div>
  );
}

/** the prize as it lands: the card's face (or the voucher's or the junk's words) and what to do with it */
function Result({ v, onEquip, onBag }: { v: VendingView; onEquip: () => void; onBag?: () => void }) {
  const s = v.spin!, w = s.winner;
  if (w.kind === 'card' && v.won) {
    const t = v.won.tile;
    return (
      <section className="grid gap-3 rounded-xl border bg-slate-900/80 p-3 sm:grid-cols-[13rem_1fr]" style={{ borderColor: `${t.color}aa` }} aria-label="Your prize" data-testid="vending-result">
        <CardArt glyph={t.glyph} art={t.art} color={t.color} className="aspect-[16/10] w-full rounded-lg border border-white/10 sm:aspect-auto sm:min-h-[8rem]" />
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.color }}>New {t.rarityName.toLowerCase()} card{t.banned ? ' · banned in competition' : ''}</div>
          <div className="font-display text-xl font-bold text-white" data-testid="vending-result-name">{t.name}</div>
          <p className="text-xs text-slate-200">{t.text}</p>
          <ul className="space-y-0.5 text-xs text-emerald-200">{t.lines.map(l => <li key={l}>{l}</li>)}</ul>
          <p className="text-xs italic text-slate-300">{t.flavour}</p>
          <p className="text-[11px] text-slate-400"><span className="font-semibold text-slate-300">Inspired by:</span> {t.inspiration}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button className="btn-gold disabled:opacity-40" disabled={!!v.won.why} title={v.won.why ?? 'Put it in the first free slot'} onClick={onEquip} data-testid="vending-equip">Equip it</button>
            {v.won.why && <span className="text-[11px] text-amber-200" data-testid="vending-equip-why">{v.won.why}</span>}
          </div>
        </div>
      </section>
    );
  }
  if (w.kind === 'voucher') {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-300/10 p-3" aria-label="Your prize" data-testid="vending-result">
        <PrizeArt p={w} className="h-16 w-24 shrink-0 rounded-lg border border-white/10" />
        <div className="space-y-1"><div className="font-display text-lg font-bold text-amber-100">A sponsor’s voucher</div>
          <p className="text-xs text-slate-200">You hold every {RARITIES[w.rarity].name.toLowerCase()} card, so the machine pays a sponsor’s voucher: one club of your bag upgraded free (up to Tour). You have {v.vouchers}.</p>
          {onBag && <button className="chip" onClick={onBag} data-testid="vending-bag">Open my bag</button>}</div>
      </section>
    );
  }
  if (w.kind !== 'dud') return null;
  return (
    <section className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/80 p-3" aria-label="No prize this time" data-testid="vending-result">
      <PrizeArt p={w} className="h-16 w-24 shrink-0 rounded-lg border border-white/10" />
      <div className="space-y-0.5"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">A dud</div><div className="font-display text-lg font-bold text-slate-200" data-testid="vending-result-name">{w.dud.name}</div>
        <p className="text-xs italic text-slate-300">“{w.dud.quote}”</p><p className="text-[11px] text-slate-500">Into the junk drawer ({v.junk}). Better luck next spin.</p></div>
    </section>
  );
}

/** the odds and the table: what each rarity pays at the grade picked, the cards you do not have yet, the dud share, and how pulls are earned */
function Odds({ v, grade }: { v: VendingView; grade: Grade }) {
  const o = v.odds[grade], pc = (x: number) => `${Math.round(x * 1000) / 10}%`;
  return (
    <section className="space-y-2 rounded-xl border border-white/10 bg-slate-900/70 p-3 text-xs text-slate-300" aria-label="Prize catalogue and odds" data-testid="vending-odds">
      <div className="font-semibold text-slate-100">What’s inside · a {GRADE_NAME[grade]} pull</div>
      <p>The prize is decided before the reel turns: the reel is the show. You never draw a card you have; hold every card of a rarity and its draw pays a sponsor’s voucher instead.</p>
      <div className="space-y-1">{o.rows.map(r => (
        <div key={r.rarity} className="grid grid-cols-[5.5rem_3.2rem_1fr] items-center gap-2 tabular-nums" data-testid={`odds-${r.name.toLowerCase()}`}>
          <span className="font-semibold" style={{ color: r.color }}>{r.name}</span><span className="text-right text-slate-100">{pc(r.chance)}</span>
          <span className="text-slate-400">{r.chance === 0 ? 'none in this grade' : r.pays === 'voucher' ? 'you have them all: a voucher' : `${r.left} of ${r.total} cards you do not have`}</span>
        </div>))}
        <div className="grid grid-cols-[5.5rem_3.2rem_1fr] gap-2 tabular-nums"><span className="font-semibold text-slate-400">Dud</span><span className="text-right text-slate-100">{pc(o.dud)}</span><span className="text-slate-400">{o.dud ? `golf junk (${DUDS.length} kinds), wins nothing` : 'never in this grade'}</span></div>
      </div>
      <div className="border-t border-white/10 pt-2"><div className="font-semibold text-slate-100">How pulls are earned</div>
        <ul className="mt-1 space-y-0.5">{EARN_TABLE.map(r => <li key={r.what} className="flex items-baseline justify-between gap-2"><span>{r.what}</span><span className="shrink-0 font-semibold" style={{ color: GRADE_COLOR[r.grade] }}>{GRADE_NAME[r.grade]}</span></li>)}</ul>
        <p className="mt-1 text-slate-400">Gold: an uncommon or better, never a dud. Silver: better odds. Bronze: the plain table.</p></div>
    </section>
  );
}

/** the machine: nothing when `v` is null (closed). `onSpin(grade)` spends a pull and rolls the prize (the engine); the reel then turns and `onSettle(id)` is called when it stops */
export function VendingMachine({ v, onSpin, onSettle, onEquip, onClose, onBag, initialOdds = false }: { v: VendingView; onSpin: (g: Grade) => void; onSettle: (id: number) => void; onEquip: () => void; onClose: () => void; onBag?: () => void;
  /** the odds panel open at first (captures, tests) */ initialOdds?: boolean }) {
  const [pick, setPick] = useState<Grade | null>(null), [odds, setOdds] = useState(initialOdds);
  const frame = useRef<HTMLDivElement>(null), track = useRef<HTMLDivElement>(null), modal = useRef<HTMLDivElement>(null);
  const spin = v.spin, spinning = spin?.status === 'spinning';
  const grade: Grade = pick && v.pulls[pick] > 0 ? pick : v.best ?? 'bronze';
  // the idle strip: the cards of the catalogue, rarest last, as a showcase (the reel of a spin replaces it)
  const idle = useMemo(() => CARDS.slice().sort((a, b) => a.rarity - b.rarity).map(cardPrize), []);
  const shown = spin?.reel ?? idle;

  // the reel: one transform animation from where it is to the centre of the prize's tile (TrickOrTreat's, with its easing); a resize re-aims it
  const id = spin?.id, settle = useRef(onSettle); settle.current = onSettle;
  useEffect(() => {
    if (id === undefined || !frame.current || !track.current || !spin) return;
    const viewport = frame.current, reel = track.current, stop = spin.stop;
    const duration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? REEL_MS_REDUCED : REEL_MS;
    let animation: Animation | null = null, finished = false; const started = performance.now();
    const destination = () => { const tile = reel.children[stop] as HTMLElement; return viewport.clientWidth / 2 - tile.offsetLeft - tile.offsetWidth / 2; };
    const done = () => { if (finished) return; finished = true; reel.style.transform = `translateX(${destination()}px)`; animation?.cancel(); settle.current(id); };
    const position = () => {
      if (finished) { reel.style.transform = `translateX(${destination()}px)`; return; }
      const from = getComputedStyle(reel).transform;
      animation?.cancel();
      animation = reel.animate([{ transform: from === 'none' ? 'translateX(0px)' : from }, { transform: `translateX(${destination()}px)` }], { duration: Math.max(1, duration - (performance.now() - started)), easing: 'cubic-bezier(.08,.72,.15,1)', fill: 'forwards' });
      animation.onfinish = done;
    };
    if (spin.status !== 'spinning') { finished = true; position(); return; }
    position();
    const observer = new ResizeObserver(position); observer.observe(viewport);
    const timeout = window.setTimeout(done, duration + 200);
    return () => { observer.disconnect(); animation?.cancel(); clearTimeout(timeout); };
    // (only a new spin restarts the reel: its status turning to won must not)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Escape leaves (not while the reel turns)
  useEffect(() => {
    const keys = (e: KeyboardEvent) => { if (e.key === 'Escape' && !spinning) { e.preventDefault(); e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', keys, true);
    return () => window.removeEventListener('keydown', keys, true);
  }, [spinning, onClose]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/75 p-3" data-testid="vending-root">
      <div ref={modal} className="vm-machine max-h-full w-[min(1020px,100%)] space-y-3 overflow-y-auto overflow-x-hidden rounded-2xl border border-amber-300/40 p-4 text-slate-200 shadow-2xl" role="dialog" aria-modal="true" aria-label="The pro shop prize machine" data-testid="vending-machine">
        <header className="flex items-start gap-3">
          <CardArt glyph="star" art="token" color="#ff9d1e" className="hidden h-16 w-28 shrink-0 rounded-lg border border-white/10 sm:block" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">Pro shop · prizes for the winners</div>
            <h2 className="font-display text-2xl font-bold text-[var(--gold-hi)]">The Prize Machine</h2>
            <p className="text-xs text-slate-300">A pull is spent for a spin. A card goes in your collection; every card of a rarity you hold pays a voucher; the rest is the junk of the lost-and-found.</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button className="btn-icon" disabled={spinning} onClick={onClose} title={spinning ? 'The machine is choosing' : 'Close the machine (Esc)'} aria-label="Leave the machine" data-testid="vending-close"><Icon name="close" size={18} /></button>
            <PullChips pulls={v.pulls} />
          </div>
        </header>
        <div className="vm-frame" ref={frame} data-testid="vending-reel">
          <div className="vm-reel" ref={track} key={spin?.id ?? 'idle'} data-testid="vending-track">
            {shown.map((p, i) => <ReelTile key={`${i}:${p.key}`} p={p} winner={!!spin && spin.status === 'won' && i === spin.stop} />)}
          </div>
          <div className="vm-marker" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" className="absolute -left-[14px] -top-[6px]" style={{ filter: 'drop-shadow(0 2px 3px #000)' }}><path d="M3 5 H21 L12 20z" fill="#ffcf70" /></svg></div>
        </div>
        <div className="text-center text-sm font-semibold text-amber-200" role="status" aria-live="polite" data-testid="vending-state">
          {spinning ? 'The machine is choosing your prize…' : spin ? `${spin.winner.kind === 'dud' ? 'A dud' : 'You won'}: ${prizeName(spin.winner)}` : v.best ? 'Spin the machine. Find something wicked.' : 'No pulls waiting. Win a title, finish well or win a money match.'}
        </div>
        {spin && !spinning && <Result v={v} onEquip={onEquip} onBag={onBag} />}
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
          <div className="flex items-center gap-1" role="group" aria-label="Which pull to spend" data-testid="vending-grades">
            {GRADES.slice().reverse().map(g => <button key={g} className={`chip disabled:opacity-35 ${grade === g && v.pulls[g] > 0 ? 'ring-1 ring-amber-300/80' : ''}`} style={{ color: v.pulls[g] > 0 ? GRADE_COLOR[g] : undefined }} disabled={v.pulls[g] <= 0 || spinning} onClick={() => setPick(g)} data-testid={`vending-grade-${g}`}>{GRADE_NAME[g]} ×{v.pulls[g]}</button>)}
          </div>
          <button className="btn-gold disabled:opacity-40" disabled={!!v.why} title={v.why ?? `Spend a ${GRADE_NAME[grade]} pull`} onClick={() => onSpin(grade)} data-testid="vending-spin">
            <Icon name="fast" size={16} />{spin ? 'Spin again' : 'Spin the machine'} · {GRADE_NAME[grade]} pull
          </button>
          <button className="chip" aria-expanded={odds} onClick={() => setOdds(!odds)} data-testid="vending-odds-toggle">Prizes and odds</button>
          <span className="ml-auto text-[11px] tabular-nums text-slate-400" data-testid="vending-tally">{v.owned} of {v.total} cards · {v.opened} opened · junk drawer {v.junk} · {v.vouchers} voucher{v.vouchers === 1 ? '' : 's'}</span>
        </div>
        {v.why && !spinning && <p className="text-[11px] text-amber-200" data-testid="vending-why">{v.why}</p>}
        {odds && <Odds v={v} grade={grade} />}
        <p className="text-[9px] text-slate-500">Copied from TrickOrTreat’s prize machine · Stand In for card art</p>
      </div>
    </div>
  );
}
