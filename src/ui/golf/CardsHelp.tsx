// T337 (#963): the Cards page of Help: every card of the catalogue by rarity (legendary first) with what it does, its flavour and its inspiration (the golf video, the wacky product or the real tech it comes from,
// described and never named), the ones you have won marked, and the ones banned in competition marked. A vertical list in two columns, never a sideways scrollbar.
import { CARDS, RARITIES, cardLines } from '../../game/golf/cards';
import { CardArt } from './CardArt';

/** the Cards page: `owned` the ids of the cards you have won */
export function CardsHelp({ owned = [] }: { owned?: readonly string[] }) {
  const have = new Set(owned), groups = RARITIES.map((r, i) => ({ r, cards: CARDS.filter(c => c.rarity === i) })).reverse();
  return (
    <div className="mt-3 space-y-3" data-testid="cards-help">
      <div className="text-lg font-bold text-amber-200">The cards ({CARDS.length})</div>
      <p className="text-slate-300">Win a title, finish in the top places or win a money match to earn a pull, open it at the vending machine in your pro shop, and keep up to eight cards in your slots (swapped between rounds, never in one). Each card says where it comes from.</p>
      <div className="max-h-[56vh] space-y-3 overflow-y-auto overflow-x-hidden pr-1">
        {groups.map(({ r, cards }) => cards.length ? (
          <section key={r.id} data-testid={`cards-help-${r.id}`}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: r.color }}>{r.name} · {cards.length}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cards.map(c => (
                <article key={c.id} className="flex gap-2 rounded-lg border bg-slate-900/70 p-2" style={{ borderColor: `${r.color}66` }} data-testid={`cards-help-card-${c.id}`}>
                  <CardArt glyph={c.glyph} art={c.art} color={r.color} className="h-14 w-20 shrink-0 rounded-md border border-white/10" />
                  <div className="min-w-0 space-y-0.5 text-[11px] leading-snug">
                    <div className="font-semibold text-slate-100">{c.name}{have.has(c.id) && <span className="ml-1 rounded bg-emerald-500/20 px-1 text-[10px] text-emerald-200">won</span>}</div>
                    <div className="text-slate-300">{c.text}</div>
                    <div className="text-emerald-200">{cardLines(c).join(' · ')}</div>
                    <div className="italic text-slate-400">{c.flavour}</div>
                    <div className="text-slate-400"><span className="font-semibold text-slate-300">Inspired by:</span> {c.inspiration}</div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null)}
      </div>
    </div>
  );
}
