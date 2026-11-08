// Your cards (T336, #962; the owner, 2026-11-04: "8 cards slots and you get cards when you win tournaments"): the Cards card shows the 8 slots on your player (the cards in play) and your collection (every card of the
// catalogue, the ones you have won in colour and the rest locked), the pulls waiting at the vending machine and the machine's button. A click on a card opens its detail in a flyout to the card's left (the owner's rule: side-opening
// flyouts, no sideways scrollbar, no one long column): its rarity, what it does, its flavour and its inspiration, and Equip or Unequip. A card goes into the first free slot, or into the slot you click while it is picked (the card
// there goes back to the collection). Cards swap between rounds, never in one: the card says why not out on the course. The pictures are TrickOrTreat's paintings where there are some and drawn stand-ins ("Stand In for card art").
import { useState } from 'react';
import { GRADE_NAME, GRADES, SLOTS, type CardTile, type CardsView, type Earn, type Grade } from '../../game/golf/cards';
import { Icon } from '../Icon';
import { CardArt } from './CardArt';

/** the grade of a pull as a colour: bronze, silver, gold */
export const GRADE_COLOR: Readonly<Record<Grade, string>> = { bronze: '#d08a52', silver: '#cbd5e1', gold: '#fbbf24' };
/** the pulls waiting as chips ("Gold x1"): the ones you have, and a quiet "none" */
export function PullChips({ pulls, className = '' }: { pulls: Record<Grade, number>; className?: string }) {
  const have = GRADES.filter(g => pulls[g] > 0).reverse();
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`} data-testid="cards-pulls">
      {have.length ? have.map(g => <span key={g} className="rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ borderColor: `${GRADE_COLOR[g]}99`, color: GRADE_COLOR[g], background: `${GRADE_COLOR[g]}1f` }} data-testid={`pull-${g}`}>{GRADE_NAME[g]} ×{pulls[g]}</span>)
        : <span className="text-[11px] text-slate-400">no pulls waiting</span>}
    </span>
  );
}

/** a card pull just earned (a result card's line): its grade, why, and a button that opens the vending machine */
export function PullBanner({ earn, onOpen }: { earn: Earn; onOpen?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: `${GRADE_COLOR[earn.grade]}88`, background: `${GRADE_COLOR[earn.grade]}18` }} data-testid="pull-banner">
      <span><b style={{ color: GRADE_COLOR[earn.grade] }}>{GRADE_NAME[earn.grade]} card pull</b> <span className="text-slate-300">· {earn.why}</span></span>
      {onOpen && <button className="chip chip-on shrink-0" onClick={onOpen} data-testid="pull-open">Open it</button>}
    </div>
  );
}

/** a card as a square-ish tile: its picture, its name and a bar in its rarity's colour; locked (a shape and a ?) when you have not won it */
function Tile({ t, on, slot, onClick, testid, mark = false }: { t: CardTile; on: boolean; slot?: number; onClick: () => void; testid: string; /** the collection's tile of a card in play says so */ mark?: boolean }) {
  return (
    <button className={`group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-slate-900/70 text-left ${on ? 'ring-2 ring-amber-300/80' : ''} ${t.owned ? 'hover:brightness-125' : 'opacity-80'}`}
      style={{ borderColor: t.owned ? t.color : `${t.color}44` }} onClick={onClick} data-testid={testid} aria-label={t.owned ? t.name : `${t.rarityName} card, not won yet`}
      title={t.owned ? `${t.name} · ${t.rarityName}${(slot ?? t.slot) >= 0 ? ' · in play' : ''}` : `${t.rarityName}: not won yet`}>
      <div className="relative">
        <CardArt glyph={t.glyph} art={t.art} color={t.color} locked={!t.owned} className="aspect-[16/10] w-full" />
        {mark && t.slot >= 0 && <span className="absolute left-1 top-1 rounded bg-black/75 px-1 text-[9px] font-semibold uppercase leading-4 text-amber-200" data-testid={`cards-inplay-${t.id}`}>In play</span>}
      </div>
      <span className="block min-h-[1.9rem] px-1 pt-0.5 text-[10px] font-semibold leading-tight text-slate-100">{t.owned ? t.name : '???'}</span>
      <span className="block h-[3px] w-full" style={{ background: t.color }} />
    </button>
  );
}

/** the card's detail: its picture, rarity, words, effect lines, flavour and inspiration, and Equip / Unequip with the reason when it cannot */
function Detail({ t, view, picking, onEquip, onUnequip, onClose }: { t: CardTile; view: CardsView; picking: boolean; onEquip: (id: string) => void; onUnequip: (slot: number) => void; onClose: () => void }) {
  const full = view.slots.every(s => s), inSlot = t.slot >= 0;
  return (
    <div className="pointer-events-auto max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[300px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" style={{ borderColor: `${t.color}99` }} data-testid="cards-detail">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: t.color }} data-testid="cards-detail-rarity">{t.rarityName} card{t.banned && t.owned ? ' · banned in competition' : ''}</div>
          <div className="font-display text-base font-bold leading-tight text-white" data-testid="cards-detail-name">{t.owned ? t.name : 'Not won yet'}</div>
        </div>
        <button className="btn-icon shrink-0" onClick={onClose} title="Close the card"><Icon name="close" size={16} /></button>
      </div>
      <CardArt glyph={t.glyph} art={t.art} color={t.color} locked={!t.owned} className="aspect-[16/9] w-full rounded-lg border border-white/10" />
      {t.owned ? (
        <>
          <p className="text-xs text-slate-200">{t.text}</p>
          <ul className="space-y-0.5 rounded-lg border border-white/10 bg-white/5 p-2 text-xs" data-testid="cards-detail-lines">{t.lines.map(l => <li key={l} className="text-emerald-200">{l}</li>)}</ul>
          <p className="text-xs italic text-slate-300">{t.flavour}</p>
          <p className="text-[11px] text-slate-400"><span className="font-semibold text-slate-300">Inspired by:</span> {t.inspiration}</p>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {inSlot
              ? <button className="chip disabled:opacity-40" disabled={!!view.busy} title={view.busy ?? 'Back to the collection'} onClick={() => onUnequip(t.slot)} data-testid="cards-unequip">Unequip (slot {t.slot + 1})</button>
              : <button className="chip chip-on disabled:opacity-40" disabled={!!t.why} title={t.why ?? 'Put it in the first free slot'} onClick={() => onEquip(t.id)} data-testid="cards-equip">Equip</button>}
            {!inSlot && full && !view.busy && <span className="text-[11px] text-amber-200">{picking ? 'Click a slot to swap it in' : 'Slots full: click a slot to swap'}</span>}
          </div>
          {view.busy && <div className="text-[11px] text-amber-200" data-testid="cards-why">{view.busy}</div>}
        </>
      ) : <p className="text-xs text-slate-300">A {t.rarityName.toLowerCase()} card. Win a title, finish well or win a money match for a pull, and open it at the vending machine.</p>}
    </div>
  );
}

/** the Cards card: the pulls and the machine's button, the two mechanics a card unlocks, the 8 slots, the collection; and a card's detail to the left. `initial`: the card whose detail is open at first (captures, tests) */
export function CardsCard({ view, onClose, onEquip, onUnequip, onMachine, right = 'right-3', initial = null }: {
  view: CardsView; onClose: () => void; onEquip: (id: string, slot?: number) => void; onUnequip: (slot: number) => void; onMachine: () => void; right?: string; initial?: string | null }) {
  const [sel, setSel] = useState<string | null>(initial);
  const t = sel ? view.tiles.find(x => x.id === sel) ?? null : null;
  // a card picked that is not in play yet (or in another slot) goes into the slot clicked; else the click picks the card in that slot
  const pickSlot = (i: number) => {
    const c = view.slots[i] ?? null;
    if (t && t.owned && t.slot !== i && !view.busy) { onEquip(t.id, i); setSel(t.id); return; }
    if (c) setSel(sel === c.id ? null : c.id);
  };
  const picking = !!t && t.owned && t.slot < 0;
  return (
    <div className={`pointer-events-none absolute ${right} top-[var(--hud-top,6rem)] z-20 flex items-start gap-1.5`} data-testid="cards-root">
      {t && <Detail t={t} view={view} picking={picking} onEquip={id => onEquip(id)} onUnequip={onUnequip} onClose={() => setSel(null)} />}
      <div className="pointer-events-auto max-h-[calc(var(--vh-ui,100vh)-var(--hud-top,6rem)-4.5rem)] w-[336px] space-y-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-slate-950/90 p-3 text-slate-200 shadow-2xl backdrop-blur" data-testid="cards-card">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div><div className="font-semibold text-sky-200">Your cards</div><div className="text-[12px] text-slate-400" data-testid="cards-count">{view.owned} of {view.total} collected · {SLOTS} slots</div></div>
          <button className="btn-icon" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="min-w-0"><div className="text-[11px] uppercase text-slate-400">Pulls waiting</div><PullChips pulls={view.pulls} /></div>
          <button className="chip chip-on shrink-0 disabled:opacity-40" disabled={!view.machine.ok} title={view.machine.ok ? 'The prize machine in your pro shop: open your pulls' : view.machine.why ?? ''} onClick={onMachine} data-testid="cards-machine">Vending machine</button>
        </div>
        <div className="space-y-0.5 text-[11px]" data-testid="cards-mech">
          <div className={view.mech.boost ? 'text-emerald-200' : 'text-slate-400'}>Space power-spam: {view.mech.boost ? 'unlocked' : 'locked (the Power Mash card)'}</div>
          <div className={view.mech.airspin ? 'text-emerald-200' : 'text-slate-400'}>Spin in the air: {view.mech.airspin ? 'unlocked' : 'locked (the Mid-Flight Whisper card)'}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[11px] uppercase text-slate-400">In play · {view.slots.filter(Boolean).length} of {SLOTS}</div>
          <div className="grid grid-cols-4 gap-1.5" data-testid="cards-slots">
            {view.slots.map((c, i) => c
              ? <Tile key={i} t={c} on={sel === c.id} slot={i} onClick={() => pickSlot(i)} testid={`cards-slot-${i}`} />
              : <button key={i} className={`flex aspect-[16/12] items-center justify-center rounded-lg border border-dashed text-[10px] text-slate-500 ${picking ? 'border-amber-300/60 text-amber-200 hover:bg-amber-300/10' : 'border-white/15'}`} onClick={() => pickSlot(i)} data-testid={`cards-slot-${i}`} aria-label={`Empty slot ${i + 1}`}>{picking ? 'Put it here' : `Slot ${i + 1}`}</button>)}
          </div>
        </div>
        {view.busy && <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100" data-testid="cards-busy">{view.busy}</div>}
        <div className="space-y-1">
          <div className="text-[11px] uppercase text-slate-400">Collection</div>
          <div className="grid grid-cols-4 gap-1.5" data-testid="cards-grid">
            {view.tiles.map(c => <Tile key={c.id} t={c} on={sel === c.id} mark onClick={() => setSel(sel === c.id ? null : c.id)} testid={`cards-tile-${c.id}`} />)}
          </div>
        </div>
        <p className="text-[11px] text-slate-400">Win a title, finish in the top places or win a money match to earn a pull, then open it at the vending machine. Click a card for what it does. Cards swap between rounds, never in one.</p>
        <p className="text-[9px] text-slate-500">Stand In for card art (TrickOrTreat’s paintings where there are some)</p>
      </div>
    </div>
  );
}
