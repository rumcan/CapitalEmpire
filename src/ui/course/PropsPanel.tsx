import type { Game } from '../../game/engine';
import { DECOR, DECOR_GROUPS, PROPS_APPEAL_RADIUS, PROPS_DECAY, appealText, sellBack, type DecorItem } from '../../game/golf/decor';
import { PROPS_APPEAL_CAP } from '../../game/golf/rangesave';
import { LIBRARY } from '../../game/library';
import { Thumb } from '../Thumb';
import { statusIcon } from '../status-icon';
import { ToolHead } from '../ToolHead';

const money = (n: number) => '$' + n.toLocaleString();

/** the Props panel (plan P24 Phase 3, T131): the course's decor in four groups (Plants, Water, Stone, Furniture), each a card with its picture,
 *  name, price and appeal. Picking one puts it in hand (its ghost follows the cursor, R turns it, a click places it, Esc puts it down); with
 *  nothing in hand a placed prop is selected with a click, dragged to move it, turned with R and sold for half its price */
export function PropsPanel({ game }: { game: Game }) {
  const t = game.decor, sel = t.selection(), range = game.golf?.start === 'range', appeal = range ? t.appeal() : 0;
  return (
    <div className="tp" data-panel="props">
      <ToolHead icon="leaf" title="Props" desc="Dress your venue: pot plants, fountains, statues, pillars and benches" />
      {range && (
        <div className="mb-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5" data-testid="props-appeal">
          <div className="flex items-baseline justify-between gap-2"><span>Appeal from props</span><span className="font-semibold text-emerald-300">{appealText(appeal)} <span className="font-normal text-slate-400">of {appealText(PROPS_APPEAL_CAP)}</span></span></div>
          <div className="sub-line leading-snug">Props within {PROPS_APPEAL_RADIUS} tiles of the shop or the mats bring more golfers, who pay more. Each more of a kind counts {Math.round(PROPS_DECAY * 100)}% of the one before: mix plants, water, a statue and seats.</div>
        </div>
      )}
      {sel && (
        <div className="mb-2 rounded-lg border border-[var(--gold-line)] bg-black/30 p-2" data-testid="props-selected">
          <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{sel.d.name}</span><span className="sub-line">{appealText(sel.d.appeal)} appeal</span></div>
          <div className="sub-line">Drag it to move it{t.turns(sel.d) ? ', R turns it' : ''}.</div>
          <div className="mt-1.5 flex gap-1.5">
            {t.turns(sel.d) && <button className="chip" onClick={() => t.turn()} title="Turn it to its next view (R)">Turn</button>}
            <button className="chip" onClick={() => t.sell()} title="Sell it for half its price (Delete)" data-testid="props-sell">Sell +{money(sellBack(sel.d))}</button>
          </div>
        </div>
      )}
      {DECOR_GROUPS.map(g => (
        <div key={g.id} className="mb-2">
          <div className="label-caps mb-1 text-slate-400">{g.name}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {DECOR.filter(d => d.group === g.id).map(d => <Card key={d.key} game={game} d={d} />)}
          </div>
        </div>
      ))}
      <p className="mt-1 leading-snug">{t.hand ? 'Click on your land to place it; R turns it, Esc puts it down.' : 'Pick a prop to place it, or click one on the map to move, turn or sell it.'}</p>
    </div>
  );
}

function Card({ game, d }: { game: Game; d: DecorItem }) {
  const t = game.decor, on = t.hand === d.key, item = t.pictureOf(d, on ? t.view : 0), it = item !== undefined ? LIBRARY[item] : undefined, poor = d.price > game.money;
  return (
    <button className={`card gap-1 ${on ? 'card-on' : ''}`} data-card={`prop-${d.key}`} aria-pressed={on} onClick={() => t.pick(d.key)} title={`${d.desc}${t.turns(d) ? ' · four views (R turns it)' : ''}`}>
      <div className="grid h-14 w-full place-items-center overflow-hidden rounded-lg bg-black/30">{it && <Thumb it={it} size={50} />}</div>
      <div className="w-full truncate font-semibold leading-tight">{d.name}</div>
      {d.standIn && <div className="w-full truncate rounded bg-amber-500/15 px-1 text-[12px] leading-tight text-amber-200" title="This picture stands in until the real art is drawn">Stand In for {d.standIn}</div>}
      <div className="flex w-full items-baseline justify-between gap-1"><span className={poor ? 'text-rose-300' : 'text-amber-200'}>{poor ? `${statusIcon('fail')} ` : ''}{money(d.price)}</span><span className="sub-line">{appealText(d.appeal)}</span></div>
    </button>
  );
}
