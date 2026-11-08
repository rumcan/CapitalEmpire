// T335 (#961): the bag card (src/ui/golf/BagCard.tsx): the 14 clubs as tiles in groups with their upgrade levels, a club's detail in a flyout to the card's left (carry, launch, spin, forgiveness, the next level's offer
// and why not), the third wood's slot, the putter's fitting (feel, line and luck, shafts and heads), a sponsor's vouchers, the shop's state and the money; no sideways scrollbar. Rendered to static markup from the
// bag view (the numbers are tested in golf-play-bag.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { BagCard } from '../src/ui/golf/BagCard';
import { ClubIcon } from '../src/ui/golf/ClubIcon';
import { CLUB_ORDER, bagGear, bagView, fitPart, normalizeBag } from '../src/game/golf/play';
import type { BagSave, Club, PartKind } from '../src/game/golf/play';
import { START_SKILLS, gameSkills } from '../src/game/golf/player';

const noop = () => { /* none */ };
const view = (bag: BagSave | null, ctx = { shop: true, money: 5000 }, busy: string | null = null) => ({ ...bagView(bag, gameSkills(START_SKILLS, 0, bagGear(bag)), ctx), busy });
const html = (bag: BagSave | null, initial: Club | null = null, ctx = { shop: true, money: 5000 }, busy: string | null = null, initialPart: PartKind | null = null) =>
  renderToStaticMarkup(createElement(BagCard, { view: view(bag, ctx, busy), onClose: noop, onUpgrade: noop, onFit: noop, onThird: noop, initial, initialPart }));

test('bag card: 14 tiles in woods, irons, wedges and putter, each with its short name and its level; the money, the shop and no sideways scroll', () => {
  const h = html(null);
  assert.ok(h.includes('data-testid="bag-card"') && !h.includes('data-testid="bag-detail"'), 'the card, no detail until a club is picked');
  for (const g of ['woods', 'irons', 'wedges', 'putter']) assert.ok(h.includes(`data-testid="bag-group-${g}"`), g);
  assert.equal((h.match(/data-testid="bag-club-/g) ?? []).length, 14);
  for (const c of CLUB_ORDER.filter(x => x !== 'hybrid')) assert.ok(h.includes(`data-testid="bag-club-${c}"`), c);
  assert.ok(!h.includes('data-testid="bag-club-hybrid"'), 'the hybrid is not in a bag with the 5-wood');
  assert.ok(/>Dr</.test(h) && />3W</.test(h) && />5W</.test(h) && />PW</.test(h) && />LW</.test(h) && />Putter</.test(h), 'short names');
  assert.ok(/0 of 42 upgrades/.test(h) && /14 clubs/.test(h), 'the count'); assert.ok(/Pro shop open/.test(h) && /\$5,000/.test(h), 'the shop and the money');
  assert.ok(/Stand In for club icons/.test(h), 'the icons are labelled stand-ins');
  assert.ok(!/overflow-x-(auto|scroll)/.test(h) && /overflow-x-hidden/.test(h), 'never a sideways scrollbar');
  assert.ok(/grid-cols-6/.test(h) && /col-span-2[^"]*[^>]*data-testid="bag-club-putter"/.test(h), 'six tiles across: the six irons in one row, the putter’s tile two wide');
  const none = html(null, null, { shop: false, money: 5000 }); assert.ok(/No pro shop yet/.test(none));
});

test('bag card: an upgraded club is tinted by its level, and a Prototype is gold; the bag counts its upgrades', () => {
  const b = normalizeBag({ v: 1, lv: { driver: 3, iron7: 2, sw: 1 } }), h = html(b);
  assert.ok(/6 of 42 upgrades/.test(h), 'the sum of the levels');
  assert.ok(h.includes('border-amber-300/90') && h.includes('border-emerald-400/70') && h.includes('border-sky-400/60'), 'a border for each level');
  assert.ok(/aria-label="Prototype"/.test(h) && /aria-label="Tour"/.test(h) && /aria-label="Club"/.test(h), 'the level dots');
});

test('bag card: a club’s detail has its carry, launch, spin and forgiveness, the next level with its price, and the buttons; money, shop and a busy round say why not', () => {
  const d = html(null, 'driver');
  assert.ok(d.includes('data-testid="bag-detail"') && /Driver/.test(d) && /Garage-sale/.test(d), 'the detail of the driver');
  assert.ok(/Carry/.test(d) && /\d+ m/.test(d) && /Launch/.test(d) && /Low/.test(d) && /Spin/.test(d) && /12%/.test(d) && /Forgiveness/.test(d), 'carry, launch, spin, forgiveness');
  assert.ok(/Next: Club/.test(d) && /\$900/.test(d) && /\+2% carry/.test(d) && /scatter -3%/.test(d), 'the next level and what it adds');
  assert.ok(/Upgrade \$900/.test(d) && !/disabled=""[^>]*data-testid="bag-upgrade"/.test(d), 'the upgrade button is on');
  assert.ok(!d.includes('data-testid="bag-voucher"'), 'no voucher button without a voucher');
  const poor = html(null, 'driver', { shop: true, money: 100 }); assert.ok(/data-testid="bag-why"[^>]*>Needs \$900/.test(poor) && /disabled=""[^>]*data-testid="bag-upgrade"|data-testid="bag-upgrade"[^>]*disabled=""/.test(poor), 'too poor: the reason, the button off');
  const busy = html(null, 'driver', undefined, 'You are out on the course: your bag changes when the round is over'); assert.ok(/out on the course/.test(busy));
  const top = html(normalizeBag({ v: 1, lv: { driver: 3 } }), 'driver'); assert.ok(/A Prototype: the best there is/.test(top) && !top.includes('data-testid="bag-upgrade"'), 'nothing past a Prototype');
  const v = html(normalizeBag({ v: 1, vouchers: 2 }), 'iron6'); assert.ok(v.includes('data-testid="bag-vouchers"') && /2 sponsor’s vouchers/.test(v) && v.includes('data-testid="bag-voucher"'), 'vouchers: the line and the button');
  const t = html(normalizeBag({ v: 1, vouchers: 1, lv: { iron6: 2 } }), 'iron6'); assert.ok(/disabled=""[^>]*data-testid="bag-voucher"|data-testid="bag-voucher"[^>]*disabled=""/.test(t), 'a voucher goes only up to Tour');
});

test('bag card: the third wood’s slot swaps the 5-wood and the hybrid; the lob wedge is hard to hit and lands soft', () => {
  const w = html(null, 'wood5'); assert.ok(w.includes('data-testid="bag-third"') && w.includes('data-testid="bag-third-wood5"') && w.includes('data-testid="bag-third-hybrid"'), 'the swap on the 5-wood');
  assert.ok(/chip chip-on[^>]*data-testid="bag-third-wood5"/.test(w), 'the 5-wood is the one in');
  const hy = html({ v: 1, third: 'hybrid' }, 'hybrid'); assert.ok(/chip chip-on[^>]*data-testid="bag-third-hybrid"/.test(hy) && hy.includes('data-testid="bag-club-hybrid"') && !hy.includes('data-testid="bag-club-wood5"'));
  const lw = html(null, 'lw'); assert.ok(/Very high/.test(lw) && /lands soft/.test(lw)); assert.ok(!lw.includes('data-testid="bag-third"'), 'only the third wood has the swap');
});

test('bag card: the putter’s flyout has its feel, line and luck and the two slots; a slot opens its parts in a second flyout to the left: what each trades, Fit for what you own, Buy for what you do not', () => {
  const p = html(null, 'putter');
  assert.ok(p.includes('data-testid="bag-fitting"') && p.includes('data-testid="putter-profile"') && /Feel/.test(p) && /Line/.test(p) && /Luck/.test(p), 'the three');
  assert.ok(p.includes('data-testid="bag-slot-shaft"') && p.includes('data-testid="bag-slot-head"') && /Stock steel shaft/.test(p) && /Blade head/.test(p), 'the two slots, each with what is fitted');
  assert.ok(!p.includes('data-testid="bag-shafts"') && !p.includes('data-testid="bag-heads"'), 'the parts are not open until a slot is');
  const sh = html(null, 'putter', undefined, null, 'shaft');
  assert.ok(sh.includes('data-testid="bag-shafts"') && !sh.includes('data-testid="bag-heads"'), 'the shafts');
  for (const id of ['stock', 'whip', 'stiff']) assert.ok(sh.includes(`data-testid="bag-shaft-${id}"`), id);
  assert.ok(/Whippy graphite shaft/.test(sh) && /Stiff counter-balanced shaft/.test(sh), 'the shafts by name');
  assert.ok(/feel \+20%/.test(sh) && /luck \+25%/.test(sh) && /sweet spot -15%/.test(sh) && /line -20%/.test(sh) && /sweet spot \+25%/.test(sh) && /line \+50%/.test(sh) && /feel -12%/.test(sh) && /leave -10%/.test(sh), 'what each trades, in words (the putter’s scatter is its leave)');
  assert.ok(/Buy \$450/.test(sh) && /Buy \$600/.test(sh) && /Fitted/.test(sh), 'new shafts are bought, the stock one is fitted');
  assert.ok(sh.indexOf('data-testid="bag-shafts"') < sh.indexOf('data-testid="bag-detail"') && sh.indexOf('data-testid="bag-detail"') < sh.indexOf('data-testid="bag-card"'), 'the parts open left of the club, which opens left of the card');
  const hd = html(null, 'putter', undefined, null, 'head');
  for (const id of ['blade', 'mallet', 'lie']) assert.ok(hd.includes(`data-testid="bag-head-${id}"`), id);
  assert.ok(/Lie-angle balanced head/.test(hd) && /Buy \$800/.test(hd) && /Buy \$500/.test(hd) && /luck -25%/.test(hd) && /line \+25%/.test(hd), 'the heads');
  const fit = fitPart(null, 'shaft', 'whip').bag, own = html(fit, 'putter', undefined, null, 'shaft');
  assert.ok(/data-testid="bag-fit-stock"[^>]*>Fit</.test(own), 'a part you own is fitted for free'); assert.ok(/border-amber-300\/60[^"]*"[^>]*data-testid="bag-shaft-whip"/.test(own), 'the fitted one is marked');
  assert.ok(own.includes('data-testid="bag-shaft-whip"') && !/data-testid="bag-fit-whip"/.test(own), 'no button on the fitted part');
  assert.ok(/Whippy graphite shaft/.test(html(fit, 'putter')), 'the slot says what is fitted');
  const poor = html(null, 'putter', { shop: true, money: 100 }, null, 'shaft'); assert.ok(/Needs \$450/.test(poor), 'too poor for the new shaft');
  const busy = html(null, 'putter', undefined, 'You are out on the course: your bag changes when the round is over', 'head'); assert.ok(/disabled=""[^>]*data-testid="bag-fit-mallet"/.test(busy), 'out on the course nothing is fitted');
  const g = html(null, 'driver', undefined, null, 'shaft'); assert.ok(!g.includes('data-testid="bag-fitting"') && !g.includes('data-testid="bag-shafts"'), 'only the putter has a fitting');
});

test('club icon: a drawn stand-in for each family, tinted by level', () => {
  for (const c of CLUB_ORDER) { const h = renderToStaticMarkup(createElement(ClubIcon, { club: c, level: 3 })); assert.ok(h.startsWith('<svg') && h.includes('#fbbf24'), `${c}`); }
  assert.ok(renderToStaticMarkup(createElement(ClubIcon, { club: 'driver', level: 0 })).includes('#94a3b8'));
});
