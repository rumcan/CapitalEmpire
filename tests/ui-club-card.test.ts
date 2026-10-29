// T214 (#559, plan P26 phase 2): the Clubhouse card's Members block (ui/golf/club-members.ts words it; ClubhouseCard.tsx draws it): the fair band
// as a bar with the price's marker, the dues stepper's limits, the words (the headline, where the price stands, the money a month, "What sells
// memberships" worst first); the card's markup (the block beside the Grounds crew, the stepper's buttons, the card still 340 px and never scrolling
// sideways); the golfers chip's tip (P26 5.3); the App's wiring. Headless (react-dom/server for the markup); the card at 1366 and 2560 px is the
// PR's screenshots (scripts/dev/club-shots.mjs, which measures its sideways overflow).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { membersView, newClub, PRICE_MAX, PRICE_MIN, type ClubInputs, type ClubSave } from '../src/game/golf/club';
import type { ClubCardView } from '../src/game/golf/everyday';
import { crewCard, freshStaff } from '../src/game/golf/staff';
import { BAR_SPAN, STAND, bandBar, fairWords, membersHeadline, moneyLine, priceSteps, whyLines } from '../src/ui/golf/club-members';
import { ClubhouseCard } from '../src/ui/golf/ClubhouseCard';
import { golfersTip, statChips } from '../src/ui/stat-chips';

/** a nine of quality 85 and reputation 56 at level 1 (P26 4.1's first nine: fair $49, band $42-56), 800 residents and 39 visitors a day, waits of 18 min */
const INP: ClubInputs = { residents: 800, quality: 85, rep: 56, holes: 9, visitors: 39, level: 1, waitAvg: 18, slow: 0.52 };
const club = (o: Partial<ClubSave> = {}): ClubSave => ({ ...newClub(12), founded: true, members: 85.6, price: 50, last: { joined: 4.2, left: 1.4 }, season: { dues: 4120, upkeep: 300, joined: 20.4, left: 3.4 }, ...o });
const view = (o: Partial<ClubSave> = {}) => membersView(club(o), INP);
/** the card's view with the Members block (and T269's crew) */
function cardView(o: Partial<ClubSave> = {}): ClubCardView {
  const m = view(o);
  return {
    open: true, minute: 600,
    today: { members: 10, visitors: 30, inMembers: 4, inVisitors: 12, fees: 2640, turned: 0, out: 9, parked: 6, next: 616, waiting: 1, waitMin: 40, waitAvg: 6, worst: 12 },
    season: { days: 3, members: 30, visitors: 90, fees: 7900, expected: 19000, waitAvg: 18, paceRep: 0 },
    clubMembers: m.members, fee: 22, scale: 10, crew: crewCard(freshStaff(10, [1, 2, 3, 4, 5, 6, 7, 8, 9], 4), 9), members: m,
  };
}

describe('the fair band and the dues stepper', () => {
  it('the bar spans half to one and a half of the fair price; the band 0.85-1.15 sits at 35-65%; the marker at the price, held at the ends', () => {
    assert.deepEqual([...BAR_SPAN], [0.5, 1.5]);
    const f = view().fair, b = bandBar({ price: f, fair: f, band: [0.85 * f, 1.15 * f] });
    assert.ok(Math.abs(b.lo - 0.35) < 1e-9 && Math.abs(b.hi - 0.65) < 1e-9 && Math.abs(b.at - 0.5) < 1e-9);
    assert.equal(bandBar({ price: 10, fair: f, band: [0.85 * f, 1.15 * f] }).at, 0, 'far below: the left end');
    assert.equal(bandBar({ price: 300, fair: f, band: [0.85 * f, 1.15 * f] }).at, 1, 'far above: the right end');
  });
  it('$5 steps from $10 to $300: no step below the floor or above the ceiling', () => {
    assert.deepEqual(priceSteps({ price: 40, min: PRICE_MIN, max: PRICE_MAX, step: 5 }), { down: 35, up: 45 });
    assert.deepEqual(priceSteps({ price: PRICE_MIN, min: PRICE_MIN, max: PRICE_MAX, step: 5 }), { down: null, up: 15 });
    assert.deepEqual(priceSteps({ price: PRICE_MAX, min: PRICE_MIN, max: PRICE_MAX, step: 5 }), { down: 295, up: null });
  });
  it("the words: P26 4.1's first nine is fair at $42-56; below the band cheap, above it dear", () => {
    const v = view();
    assert.equal(Math.round(v.fair), 49); assert.equal(fairWords(v), 'Fair for your club: $42-56');
    assert.equal(v.stand, 'fair'); assert.equal(view({ price: 40 }).stand, 'cheap'); assert.equal(view({ price: 60 }).stand, 'dear');
    assert.equal(STAND.cheap.line, 'Cheap: more join, the tee sheet fills'); assert.equal(STAND.dear.line, 'Dear: fewer join, more leave');
  });
});

describe('the Members block in words', () => {
  it('the headline: "86 members · +3 this month (joined 4, left 1) · pool 63"', () => {
    const h = membersHeadline(view());
    assert.deepEqual([h.members, h.month, h.pool], ['86 members', '+3 this month (joined 4, left 1)', 'pool 63']);
    assert.equal(membersHeadline(view({ members: 1, last: { joined: 0, left: 2 } })).month, '−2 this month (joined 0, left 2)');
    assert.equal(membersHeadline(view({ members: 1, last: { joined: 0, left: 0 } })).members, '1 member');
  });
  it('the money a month: the dues, the upkeep, the green fees the members no longer pay', () => {
    const v = view(), ml = moneyLine(v);
    assert.equal(ml.dues, '+$4,300'); assert.equal(ml.upkeep, '−$344'); assert.match(ml.lost, /^\$\d/);
  });
  it('"What sells memberships": a line per term with its factor, worst first, the town last; the pace as P26 words it', () => {
    const w = whyLines(view());
    assert.deepEqual(w.map(x => x.id).slice(-1), ['town']);
    const f = w.filter(x => x.factor !== null).map(x => x.factor!);
    assert.deepEqual(f, [...f].sort((a, b) => a - b), 'worst first');
    assert.equal(w.length, 7);
    const pace = w.find(x => x.id === 'pace')!;
    assert.equal(pace.text, 'Pace: groups wait 18 min a round'); assert.equal(pace.factor!.toFixed(2), '0.84');
    assert.equal(w.find(x => x.id === 'clubhouse')!.text, 'The clubhouse: level 1');
    assert.match(w.find(x => x.id === 'town')!.text, /^The town: 800 residents and 39 visitors a day make a pool of 63$/);
    assert.match(w.find(x => x.id === 'holes')!.text, /9 holes \(18 sell best\)/);
  });
});

describe('the card', () => {
  const html = (o: Partial<ClubSave> = {}) => renderToStaticMarkup(createElement(ClubhouseCard, { view: cardView(o), onClose: () => {}, onStaff: () => {}, onPrice: () => {} }));
  it('the Members block sits directly above the Grounds crew; the header counts the club\'s members; the season line has the dues', () => {
    const h = html();
    const mi = h.indexOf('data-testid="club-members-block"'), ci = h.indexOf('data-testid="club-crew"'), ti = h.indexOf('data-testid="club-season"');
    assert.ok(ti > 0 && mi > ti && ci > mi, 'today and this season, then members, then the crew');
    assert.match(h, /green fee \$22 · 86 members/);
    assert.match(h, /data-testid="club-season-dues"[^>]*>.*\$4,120/);
    assert.match(h, /data-testid="club-price"[^>]*>\$50</);
    assert.match(h, /Fair for your club: \$42-56/);
    assert.match(h, /What sells memberships/);
  });
  it("the stepper's buttons stop at $10 and $300", () => {
    const lo = html({ price: PRICE_MIN }), hi = html({ price: PRICE_MAX }), mid = html();
    assert.match(lo, /<button[^>]*disabled=""[^>]*data-testid="club-price-down"/); assert.doesNotMatch(lo, /<button[^>]*disabled=""[^>]*data-testid="club-price-up"/);
    assert.match(hi, /<button[^>]*disabled=""[^>]*data-testid="club-price-up"/); assert.doesNotMatch(hi, /<button[^>]*disabled=""[^>]*data-testid="club-price-down"/);
    assert.doesNotMatch(mid, /disabled=""[^>]*data-testid="club-price-(up|down)"/);
  });
  it('the card stays 340 px wide and never scrolls sideways (overflow-x-hidden); no Members block without a club', () => {
    const h = html();
    assert.match(h, /data-testid="club-card"/); assert.match(h, /w-\[340px\]/); assert.match(h, /overflow-x-hidden/);
    const none = renderToStaticMarkup(createElement(ClubhouseCard, { view: { ...cardView(), members: undefined }, onClose: () => {} }));
    assert.doesNotMatch(none, /club-members-block/); assert.match(none, /club-crew/);
  });
});

describe('the top bar and the App (P26 5.3)', () => {
  it("the golfers chip's tip says how many of the rounds are members' and the club's members", () => {
    assert.equal(golfersTip({ golfers: 1248 }), "Golfers a month: 1,248 rounds, members and visitors, at today's tee sheet (the Club chip)");
    assert.equal(golfersTip({ golfers: 1248, members: 86, memberRounds: 420 }), "Golfers a month: 1,248 rounds, members and visitors, at today's tee sheet; 420 of them members' (the club has 86 members, who play free on their dues) (the Club chip)");
    assert.match(golfersTip({ golfers: 0, members: 3 }), /none yet/);
    const g = statChips({ money: 1, monthChange: 0, monthSpan: 1, month: 3, rep: 40, golfers: 100, quality: 70, holes: 9, members: 12, memberRounds: 30 }).find(c => c.id === 'golfers')!;
    assert.match(g.tip, /30 of them members'/);
  });
  it('the App: the card\'s dues stepper sets the price; the money drawer lists the dues and the wages; the results\' Memberships line explains itself', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    assert.match(app, /<ClubhouseCard view=\{cc\}[^\n]*onPrice=\{p => game\.setClubPrice\(p\)\}/);
    assert.match(app, /g\.clubMoney\(\)/); assert.match(app, /label="Dues"/); assert.match(app, /label="Wages"/);
    assert.match(app, /data-testid="results-memberships"/);
  });
});
