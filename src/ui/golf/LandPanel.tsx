// Land for sale's panel (T200, #524; plan P23-UX P2-6): the overlay's key (the price bands: a colour and a $ label, never colour alone; the
// hatched blocks; your land's outline), then the card of the block a click picked: its size, land class, price, what stands on it and what it
// adds, and Buy / Cancel (a refused block's card says why and has no Buy). A click on the map never buys: only Buy does, exactly this block at
// this price (golf/land-sale.ts). Esc closes the card, then the overlay; another tool closes it too.
import type { Game } from '../../game/engine';
import { BAND_LABEL, BAND_MAX, BAND_NAME, offerFacts, type PriceBand } from '../../game/golf/land-sale';
import { rectAreaSqm } from '../../game/golf/parcels';
import { ToolHead } from '../ToolHead';
import { affordKind, statusIcon } from '../status-icon';

const money = (n: number) => '$' + Math.round(n).toLocaleString();
/** the bands' swatches (the map's fills: engine.ts LAND_BAND_COL) */
const SWATCH: Record<PriceBand, string> = { cheap: '#34d399', fair: '#facc15', dear: '#fb7185' };
const CLASS_NAME: Record<string, string> = { farm: 'Farmland', open: 'Open land', town: 'Town land', commercial: 'Shops (commercial)', industrial: 'Works (industrial)', unbuildable: 'Unbuildable' };

export function LandPanel({ game }: { game: Game }) {
  const card = game.land.card, parcels = game.golf ? game.golf.parcels ?? [game.golf.parcel] : [];
  const bands: PriceBand[] = ['cheap', 'fair', 'dear'];
  const range = (b: PriceBand) => (b === 'cheap' ? `up to $${BAND_MAX.cheap} a m²` : b === 'fair' ? `$${BAND_MAX.cheap}–${BAND_MAX.fair} a m²` : `over $${BAND_MAX.fair} a m²`);
  return (
    <div className="tp" data-panel="land" data-testid="land-panel">
      <ToolHead icon="terrain" title="Land for sale" desc="Blocks next to your land. Click one to see it: nothing is bought until you press Buy" />
      <ul className="land-key" aria-label="Key">
        {bands.map(b => (
          <li key={b}><span className="land-swatch" style={{ background: SWATCH[b] }} aria-hidden /><b className="land-band">{BAND_LABEL[b]}</b><span>{BAND_NAME[b]}</span><span className="sub-line">{range(b)}</span></li>
        ))}
        <li><span className="land-swatch land-swatch-hatch" aria-hidden /><b className="land-band">✕</b><span>Not for sale</span><span className="sub-line">hover for why</span></li>
        <li><span className="land-swatch land-swatch-own" aria-hidden /><span>Your land</span></li>
      </ul>
      {card ? (() => {
        const f = offerFacts(card, parcels, game.treesOn(card.rect)), short = !card.why && card.price > game.money;
        return (
          <section className="land-card" data-testid="land-card" aria-label="The block">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display text-base font-bold">{card.name ?? CLASS_NAME[card.landClass] ?? card.landClass}</h3>
              {card.why ? <span className="text-red-300">Not for sale</span> : <span className="font-semibold text-amber-200">{`${BAND_LABEL[card.band ?? 'fair']} ${money(card.price)}`}</span>}
            </div>
            <dl className="land-facts">
              <dt>Size</dt><dd>{f.size}</dd>
              <dt>On it</dt><dd>{f.on}</dd>
              <dt>Adds</dt><dd>{f.adds}</dd>
              {!card.why && <><dt>Price</dt><dd>{`${money(card.price)} · ${BAND_NAME[card.band ?? 'fair'].toLowerCase()} (${(card.price / rectAreaSqm(card.rect)).toFixed(2)} $ a m²)`}</dd></>}
            </dl>
            {card.why && <p className="land-why" data-testid="land-why">{card.why}</p>}
            {short && <p className="land-why">{`You have ${money(game.money)} ${statusIcon(affordKind(card.price, game.money))}`}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {!card.why && <button className="chip chip-on" data-testid="land-buy" disabled={short} onClick={() => game.buyLandCard()}>{`Buy · ${money(card.price)}`}</button>}
              <button className="chip" data-testid="land-cancel" onClick={() => { game.land.cancel(); game.emit(); }}>Cancel</button>
            </div>
          </section>
        );
      })() : <p className="sub-line mt-2">Click a block on the map to see its size, price and what it adds.</p>}
      <button className="chip mt-3" data-testid="land-close" onClick={() => game.closeLandSale()}>Close Land for sale</button>
    </div>
  );
}
