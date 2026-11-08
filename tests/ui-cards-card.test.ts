// T336 (#962): the Cards card (src/ui/golf/CardsCard.tsx: the 8 slots, the collection, the pulls, a card's detail in a flyout to the left, never a sideways scrollbar), the vending machine (VendingMachine.tsx:
// the reel, the prize as it lands, the odds), the pull banner on the result cards, and the shot panel's cards in play and the Space power-spam that only a card (or a save from before the cards) has. Rendered to
// static markup from the views (the numbers are tested in golf-player-cards.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CardsCard, PullBanner } from '../src/ui/golf/CardsCard';
import { VendingMachine } from '../src/ui/golf/VendingMachine';
import { CardArt } from '../src/ui/golf/CardArt';
import { EventCard } from '../src/ui/golf/EventCard';
import { MatchResultCard } from '../src/ui/golf/MatchCards';
import { ShotPanel } from '../src/ui/ShotPanel';
import type { EventCardView, Game, ShotState } from '../src/game/engine';
import { CARDS, DUDS, REEL_STOP, addCard, addPull, cardsInPlay, cardsView, createSpin, cardPrize, dudPrize, emptyCards, equipCard, vendingView, voucherPrize } from '../src/game/golf/cards';
import type { CardsSave, Earn, Glyph, VendingSpin } from '../src/game/golf/cards';
import { allowedClubs, carryFor, kitOf, type Club, type OwnerTurn } from '../src/game/golf/play';
import { rng } from '../src/game/golf/play';

const noop = () => { /* none */ };
const SHOP = { busy: null, shop: true, shopWhy: null };
const own = (ids: string[], equip: string[] = [], pulls: Partial<Record<'bronze' | 'silver' | 'gold', number>> = {}): CardsSave => {
  let c = emptyCards(); for (const id of ids) c = addCard(c, id).cards; for (const id of equip) c = equipCard(c, id);
  for (const [g, n] of Object.entries(pulls)) c = addPull(c, g as 'gold', n);
  return c;
};
const card = (c: CardsSave | undefined, ctx: { busy: string | null; shop: boolean; shopWhy: string | null } = SHOP, initial: string | null = null) =>
  renderToStaticMarkup(createElement(CardsCard, { view: cardsView(c, ctx), onClose: noop, onEquip: noop, onUnequip: noop, onMachine: noop, initial }));

// ---- the Cards card ----

test('cards card: the 8 slots and the whole collection (what you have in colour, the rest locked), the count, the pulls, the machine’s button, no sideways scroll', () => {
  const h = card(own(['power-mash', 'flatstick', 'lead-tape'], ['power-mash', 'flatstick'], { gold: 1, bronze: 2 }));
  assert.ok(h.includes('data-testid="cards-card"') && !h.includes('data-testid="cards-detail"'), 'the card, no detail until a card is picked');
  assert.equal((h.match(/data-testid="cards-slot-\d"/g) ?? []).length, 8, 'eight slots'); assert.equal((h.match(/data-testid="cards-tile-/g) ?? []).length, CARDS.length, 'every card of the catalogue is a tile');
  assert.ok(/3 of \d+ collected · 8 slots/.test(h), 'the count');
  assert.ok(h.includes('data-testid="pull-gold"') && /Gold ×1/.test(h) && /Bronze ×2/.test(h) && !h.includes('data-testid="pull-silver"'), 'the pulls waiting');
  assert.ok(/In play · 2 of 8/.test(h), 'two in play'); assert.ok(/Power Mash/.test(h) && /Lie-Angle Balanced Flatstick/.test(h), 'the cards you have show their names');
  assert.equal((h.match(/\?\?\?/g) ?? []).length, CARDS.length - 3, 'the others are locked: no name, a ???');
  assert.ok(!h.includes('Long Drive Shaft'), 'a card you have not won shows no name'); assert.ok(/Stand In for card art/.test(h), 'labelled stand-ins');
  assert.ok(!/overflow-x-(auto|scroll)/.test(h) && /overflow-x-hidden/.test(h), 'never a sideways scrollbar');
  assert.ok(/data-testid="cards-machine"/.test(h) && !/disabled=""[^>]*data-testid="cards-machine"|data-testid="cards-machine"[^>]*disabled=""/.test(h), 'the machine’s button is on');
  assert.ok(/Space power-spam: unlocked/.test(h) && /Spin in the air: locked \(the Mid-Flight Whisper card\)/.test(h), 'the two mechanics: Power Mash is in a slot, the Whisper is not won');
  assert.ok(/grid-cols-4/.test(h), 'four cards across');
});

test('cards card: with no shop the machine’s button says why; out on the course the card says cards swap between rounds; a new game’s two mechanics are locked, a save from before the cards has both', () => {
  const noShop = card(own([]), { busy: null, shop: false, shopWhy: 'Build a clubhouse, a range or a pro’s office first' });
  assert.ok(/disabled=""[^>]*data-testid="cards-machine"|data-testid="cards-machine"[^>]*disabled=""/.test(noShop) && /Build a clubhouse/.test(noShop), 'no pro shop: the reason in the button’s tooltip');
  assert.ok(/no pulls waiting/.test(noShop)); assert.ok(/Space power-spam: locked \(the Power Mash card\)/.test(noShop) && /Spin in the air: locked/.test(noShop), 'a new game has neither');
  const busy = card(own(['power-mash'], ['power-mash']), { busy: 'You are out on the course: your cards change when the round is over', shop: true, shopWhy: null }, 'long-drive-shaft');
  assert.ok(/data-testid="cards-busy"[^>]*>You are out on the course/.test(busy), 'between rounds, never in one');
  const legacy = card(undefined); assert.ok(/Space power-spam: unlocked/.test(legacy) && /Spin in the air: unlocked/.test(legacy), 'no cards at all is a save from before them: both are theirs'); assert.ok(/0 of \d+ collected/.test(legacy));
});

test('cards card: a card’s detail (rarity, words, effect lines, flavour, inspiration, Equip) opens in a flyout; a card in a slot offers Unequip; a locked one says it is not won; busy and a full bag of slots say why not', () => {
  const have = own(['long-drive-shaft', 'power-mash'], ['power-mash']);
  const d = card(have, SHOP, 'long-drive-shaft');
  assert.ok(d.includes('data-testid="cards-detail"') && /data-testid="cards-detail-name"[^>]*>Long Drive Shaft/.test(d), 'the detail of the shaft'); assert.ok(/Epic card/.test(d) && /Driver: \+10% carry/.test(d) && /sweet spot -20%/.test(d), 'rarity and effect');
  assert.ok(/Inspired by:/.test(d) && /long-drive shafts/.test(d) && /launches like a regret/.test(d), 'the inspiration and the flavour'); assert.ok(/data-testid="cards-equip"/.test(d) && !/disabled=""[^>]*data-testid="cards-equip"|data-testid="cards-equip"[^>]*disabled=""/.test(d), 'Equip is on');
  assert.ok(d.indexOf('data-testid="cards-detail"') < d.indexOf('data-testid="cards-card"'), 'the flyout is to the card’s left (before it in the row)');
  const eq = card(have, SHOP, 'power-mash'); assert.ok(/data-testid="cards-unequip"[^>]*>Unequip \(slot 1\)/.test(eq) && !eq.includes('data-testid="cards-equip"'), 'a card in play offers Unequip');
  const locked = card(have, SHOP, 'flatstick'); assert.ok(/Not won yet/.test(locked) && /Epic card/.test(locked) && !/Inspired by/.test(locked) && !/Lie-Angle Balanced Flatstick/.test(locked.split('data-testid="cards-detail"')[1]!.split('data-testid="cards-card"')[0]!), 'a card you have not won: no words');
  const busy = card(have, { busy: 'You are out on the course: your cards change when the round is over', shop: true, shopWhy: null }, 'long-drive-shaft');
  assert.ok(/disabled=""[^>]*data-testid="cards-equip"|data-testid="cards-equip"[^>]*disabled=""/.test(busy) && /data-testid="cards-why"/.test(busy), 'out on the course Equip is off and says why');
  let full = emptyCards(); for (const c of CARDS.slice(0, 9)) full = addCard(full, c.id).cards; for (const c of CARDS.slice(0, 8)) full = equipCard(full, c.id);
  const f = card(full, SHOP, CARDS[8]!.id); assert.ok(/All 8 slots are full/.test(f) && /Slots full: click a slot to swap|Click a slot to swap it in/.test(f), 'all eight slots full: pick a slot to swap');
  const banned = card(own(['hot-driver']), SHOP, 'hot-driver'); assert.ok(/banned in competition/.test(banned), 'a card banned in competition says so');
});

test('card art: a glyph on a frame lit from the upper right for every glyph the catalogue and the junk use; a locked card is a question mark; a painting only with a bundler', () => {
  const glyphs = new Set<Glyph>([...CARDS.map(c => c.glyph), ...DUDS.map(d => d.glyph), 'star']);
  for (const g of glyphs) { const h = renderToStaticMarkup(createElement(CardArt, { glyph: g, color: '#36d7ff' })); assert.ok(h.includes('<svg') && h.includes('viewBox="0 0 32 32"') && h.includes('radial-gradient(circle at 74% 20%'), g); }
  const l = renderToStaticMarkup(createElement(CardArt, { glyph: 'wedge', color: '#36d7ff', locked: true })); assert.ok(l.includes('?') && !l.includes('<svg'));
  const p = renderToStaticMarkup(createElement(CardArt, { glyph: 'button', art: 'masher', color: '#64ff3a' })); assert.ok(p.includes('<svg'), 'under node there is no painting: the glyph shows');
});

// ---- the vending machine ----

const r = (s: number) => rng(s, 4, 4);
const machine = (c: CardsSave | undefined, spin: VendingSpin | null, o: { initialOdds?: boolean; vouchers?: number } = {}) =>
  renderToStaticMarkup(createElement(VendingMachine, { v: vendingView(c, spin, { busy: null, vouchers: o.vouchers ?? 0 }), onSpin: noop, onSettle: noop, onEquip: noop, onClose: noop, onBag: noop, initialOdds: o.initialOdds }));
const won = (p: ReturnType<typeof cardPrize>): VendingSpin => ({ ...createSpin(3, 'gold', p, r(1)), status: 'won' });

test('vending machine: the reel, the pulls, Spin with the grade it spends; with no pull it says so and Spin is off; no sideways scroll', () => {
  const idle = machine(own([], [], { gold: 1, silver: 2 }), null);
  assert.ok(idle.includes('data-testid="vending-machine"') && idle.includes('role="dialog"') && /The Prize Machine/.test(idle), 'the machine, a dialog');
  assert.equal((idle.match(/class="vm-tile/g) ?? []).length, CARDS.length, 'the idle strip shows the catalogue'); assert.ok(/vm-reel/.test(idle) && /vm-marker/.test(idle) && /vm-frame/.test(idle));
  assert.ok(/Spin the machine · Gold pull/.test(idle) && !/disabled=""[^>]*data-testid="vending-spin"|data-testid="vending-spin"[^>]*disabled=""/.test(idle), 'Spin spends the best pull: gold');
  assert.ok(/data-testid="vending-grade-gold"/.test(idle) && /Silver ×2/.test(idle) && /disabled=""[^>]*data-testid="vending-grade-bronze"|data-testid="vending-grade-bronze"[^>]*disabled=""/.test(idle), 'a chip for each grade, the empty one off');
  assert.ok(!/overflow-x-(auto|scroll)/.test(idle), 'never a sideways scrollbar');
  const none = machine(own([]), null); assert.ok(/disabled=""[^>]*data-testid="vending-spin"|data-testid="vending-spin"[^>]*disabled=""/.test(none) && /data-testid="vending-why"[^>]*>No pulls waiting/.test(none), 'no pull: Spin is off, and says why');
  assert.ok(/0 of \d+ cards · 0 opened · junk drawer 0 · 0 vouchers/.test(none), 'the tally');
});

test('vending machine: a spin lays the reel (the prize at the stop tile), and the prize lands as a card’s face, a voucher or a dud', () => {
  const c = own([], [], { gold: 1 }), flat = CARDS.find(x => x.id === 'flatstick')!;
  const spinning = createSpin(1, 'gold', cardPrize(flat), r(2)), sp = machine(c, spinning);
  assert.equal((sp.match(/class="vm-tile/g) ?? []).length, spinning.reel.length); assert.ok(/The machine is choosing your prize/.test(sp) && !sp.includes('data-testid="vending-result"') && !sp.includes('vending-winner-tile'), 'turning: no result yet');
  assert.ok(/disabled=""[^>]*data-testid="vending-spin"|data-testid="vending-spin"[^>]*disabled=""/.test(sp) && /The machine is choosing/.test(sp), 'Spin is off while it turns');
  const landed = machine(addCard(c, flat.id).cards, won(cardPrize(flat))), tiles = landed.split('class="vm-tile');
  assert.ok(landed.includes('data-testid="vending-winner-tile"') && tiles[REEL_STOP + 1]!.includes('vm-winner'), 'the winning tile is the one at the stop');
  assert.ok(/You won: Lie-Angle Balanced Flatstick/.test(landed) && /data-testid="vending-result-name"[^>]*>Lie-Angle Balanced Flatstick/.test(landed) && /New epic card/.test(landed) && /Inspired by:/.test(landed) && /data-testid="vending-equip"/.test(landed), 'the card’s face and Equip');
  const full = machine(addCard(c, flat.id).cards, won(cardPrize(flat)), { vouchers: 0 }); assert.ok(!/disabled=""[^>]*data-testid="vending-equip"/.test(full), 'a slot is free: Equip is on');
  const vouch = machine(c, won(voucherPrize(1)), { vouchers: 3 }); assert.ok(/A sponsor’s voucher/.test(vouch) && /every uncommon card/.test(vouch) && /You have 3/.test(vouch) && /data-testid="vending-bag"/.test(vouch), 'a voucher');
  const dud = machine(c, won(dudPrize(DUDS[0]!))); assert.ok(/A dud: Broken Tee/.test(dud) && /Snapped on the first swing/.test(dud) && /junk drawer/.test(dud), 'a dud');
});

test('vending machine: the odds panel gives each rarity’s chance for the grade, the cards you do not have, the dud share and the table of how pulls are earned', () => {
  const h = machine(own(CARDS.filter(x => x.rarity === 0).map(x => x.id), [], { bronze: 1 }), null, { initialOdds: true });
  assert.ok(h.includes('data-testid="vending-odds"') && /What’s inside · a Bronze pull/.test(h), 'the panel for the grade');
  assert.ok(h.includes('data-testid="odds-common"') && /40%/.test(h), 'common is half the pulls, less the duds: 40%'); assert.ok(/you have them all: a voucher/.test(h), 'every common is owned: a voucher');
  assert.ok(/20%/.test(h) && /golf junk/.test(h), 'one in five a dud'); assert.ok(/How pulls are earned/.test(h) && /Win a title/.test(h) && /top quarter/.test(h) && /money match/.test(h), 'the earning table');
  assert.ok(/Gold: an uncommon or better, never a dud/.test(h));
});

// ---- the result cards, the shot panel ----

test('result cards: a pull earned shows its grade and why, with a button for the machine; an event’s result and a match’s', () => {
  const earn: Earn = { grade: 'gold', why: 'Won the Club Championship' };
  const b = renderToStaticMarkup(createElement(PullBanner, { earn, onOpen: noop })); assert.ok(/Gold card pull/.test(b) && /Won the Club Championship/.test(b) && /data-testid="pull-open"/.test(b));
  assert.ok(!renderToStaticMarkup(createElement(PullBanner, { earn })).includes('pull-open'), 'no button without the machine');
  const res = { id: 'club' as const, season: 0, year: 1985, pos: 1, of: 14, strokes: 74, toPar: 2, champion: 'You', champToPar: 2, won: true, rep: 1, money: 500 };
  const ev: EventCardView = { id: 'club', name: 'Club Championship', when: 'May 1985', phase: 'result', hcp: 12, hcpText: '12.0', maxHcp: 18, why: null, entered: true, field: null, holes: null, playWhy: null, playing: false, result: res, line: 'You win the Club Championship at +2', you: 'You', pull: earn };
  const e = renderToStaticMarkup(createElement(EventCard, { view: ev, right: 'right-3', onClose: noop, onEnter: noop, onPlay: noop, onMachine: noop })); assert.ok(/data-testid="pull-banner"/.test(e) && /Gold card pull/.test(e), 'the event card’s result carries it');
  const e0 = renderToStaticMarkup(createElement(EventCard, { view: { ...ev, pull: null }, right: 'right-3', onClose: noop, onEnter: noop, onPlay: noop })); assert.ok(!/pull-banner/.test(e0), 'none paid: no banner');
  const m = renderToStaticMarkup(createElement(MatchResultCard, { r: { name: 'Mia Brown', text: 'You beat Mia: +$300', result: 'w', stake: 300, money: 300, rep: 1, res: [1, -1, 1], card: [], ocard: [], rival: 'You 1-0 · +$300', pull: { grade: 'silver', why: 'Won a $300 money match' } }, onClose: noop, onMachine: noop }));
  assert.ok(/Silver card pull/.test(m) && /Won a \$300 money match/.test(m) && /data-testid="pull-open"/.test(m), 'the match’s result carries it');
});

const turn = (lie: OwnerTurn['lie']): OwnerTurn => ({ golfer: -1, holeIdx: 0, hole: 1, par: 4, stroke: 1, t: 0, lie, ball: { x: 10, y: 10 }, pin: { x: 90, y: 10 }, distM: 160, suggested: { club: 'iron6', aim: { x: 80, y: 10 }, power: 1 } });
const state = (club: Club, lie: OwnerTurn['lie'] = 'fairway'): ShotState => ({ turn: turn(lie), input: { club, aim: { x: 80, y: 10 }, power: 1 }, mine: true });
function panelGame(s: ShotState, extra: Record<string, unknown>): Game {
  return { shotState: () => s, shotSkill: () => 0.3, shotKit: () => kitOf(0.3, s.input.club), shotCarry: () => carryFor(0.3, s.input.club), setShotShape() { /* none */ }, shotConditions: () => null, lastShotReport: () => null, setShotClub() { /* none */ }, ownerCaddie() { /* none */ }, ownerSwing() { /* none */ },
    shotClubs: () => allowedClubs('fairway', false), clubLevel: () => 0, ...extra } as unknown as Game;
}

test('shot panel: the cards in play are chips (the ones for this club lit, one banned in competition struck out); Space is spoken of only when the power-spam is unlocked', () => {
  const c = own(['long-drive-shaft', 'hot-driver', 'wonder-wedge', 'power-mash'], ['long-drive-shaft', 'hot-driver', 'wonder-wedge', 'power-mash']);
  const inPlay = (club: Club, comp: boolean) => cardsInPlay(c, club, comp);
  const g = (club: Club, can: { boost: boolean; airspin: boolean }, comp = false) => panelGame(state(club), { shotCards: () => inPlay(club, comp), shotCan: () => can });
  const h = renderToStaticMarkup(createElement(ShotPanel, { game: g('driver', { boost: true, airspin: false }) }));
  assert.ok(h.includes('data-testid="shot-cards"') && /data-testid="shot-card-long-drive-shaft"/.test(h) && /Long Drive Shaft/.test(h) && /Power Mash/.test(h), 'the cards in slots');
  assert.ok(/Space during the swing: more power, riskier\./.test(h), 'Power Mash: Space is spoken of');
  const locked = renderToStaticMarkup(createElement(ShotPanel, { game: g('driver', { boost: false, airspin: false }) })); assert.ok(!/Space during the swing/.test(locked), 'locked: no word of Space'); assert.ok(/Enter or click the meter to swing/.test(locked));
  const dr = inPlay('driver', false), wd = inPlay('sw', false); assert.ok(dr.find(x => x.id === 'long-drive-shaft')!.here && !dr.find(x => x.id === 'wonder-wedge')!.here && wd.find(x => x.id === 'wonder-wedge')!.here && dr.find(x => x.id === 'power-mash')!.here, 'a card is lit for the clubs it is for; a mechanic is always lit');
  const comp = inPlay('driver', true); assert.ok(comp.find(x => x.id === 'hot-driver')!.off && !comp.find(x => x.id === 'hot-driver')!.here && !inPlay('driver', false).find(x => x.id === 'hot-driver')!.off, 'banned in competition: off in one');
  const hc = renderToStaticMarkup(createElement(ShotPanel, { game: g('driver', { boost: true, airspin: true }, true) })); assert.ok(/line-through/.test(hc), 'struck out in the panel');
  // a stand-in game with no cards at all (an older panel test's) is the legacy set: Space is spoken of and no chips
  const plain = renderToStaticMarkup(createElement(ShotPanel, { game: panelGame(state('iron6'), {}) })); assert.ok(/Space during the swing/.test(plain) && !plain.includes('data-testid="shot-cards"'));
});
