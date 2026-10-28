// T233 (#674, the concept's top bar; docs/art/CONCEPT-LOOK.md step 10): the top bar's stat chips. They read the right numbers (the money and its
// change a month, the reputation, T208's golfers a month from the tee sheet, the course rating from the quality score), and the owner's T135 rule
// holds: below 2200 px a chip shows its icon and its figure, its words in the tooltip (and below 1600 px the money is short, its change in the
// tooltip). Headless (react-dom/server for the markup); the bar's one row at 1366-2560 px is measured in the browser (the PR's screenshots).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { MONEY_MONTHS, MonthMoney, courseRating, golfersAMonth, type TopStats } from '../src/game/golf/topstats';
import { OFF_SEASON_PLAY_DAYS } from '../src/game/golf/yearend';
import { dayRoster } from '../src/game/golf/everyday';
import { changeWhen, plainMoney, shortMoney, signedMoney, statChips } from '../src/ui/stat-chips';
import { StatChips, WIDE_LINE } from '../src/ui/StatChips';

const stats = (o: Partial<TopStats> = {}): TopStats => ({ money: 842350, monthChange: 12480, monthSpan: 1, month: 25, rep: 82, golfers: 1248, quality: 70, holes: 9, ...o });
const byId = (s: TopStats, debt: number | null = null) => Object.fromEntries(statChips(s, debt).map(c => [c.id, c]));

describe('the figures behind the chips (golf/topstats.ts)', () => {
  it("golfers a month: T208's tee sheet (members and visitors) times the season's play days over twelve", () => {
    assert.equal(OFF_SEASON_PLAY_DAYS, 24, 'a season of town days stands for 24 days of play');
    assert.equal(golfersAMonth(0), 0); assert.equal(golfersAMonth(12), 24); assert.equal(golfersAMonth(57), 114); assert.equal(golfersAMonth(-3), 0);
    // from a real tee sheet: the Club card's members and visitors on the day
    const r = dayRoster(1234, 3, { quality: 80, rep: 50, holes: 9 });
    assert.ok(r.members + r.visitors > 0, 'a 9-hole club has golfers');
    assert.equal(golfersAMonth(r.members + r.visitors), Math.round((r.members + r.visitors) * 2));
  });
  it('the course rating: the quality score (0..100) as 0 to 5 in half steps', () => {
    assert.deepEqual([0, 9, 10, 50, 70, 74, 75, 84, 95, 100].map(courseRating), [0, 0.5, 0.5, 2.5, 3.5, 3.5, 4, 4, 5, 5]);
    assert.equal(courseRating(140), 5); assert.equal(courseRating(-10), 0);
  });
  it("the money's change a month: so far this month until a whole month is seen, then the average over the last whole months (the window)", () => {
    const mm = new MonthMoney();
    assert.deepEqual(mm.change(1000), { value: 0, span: 0, month: 0 }, 'nothing seen yet');
    mm.note(0, 1000); mm.note(0.4, 1300);
    assert.deepEqual(mm.change(1300), { value: 300, span: 0, month: 0 }, 'so far this month');
    mm.note(1.01, 1600);
    assert.deepEqual(mm.change(1600), { value: 600, span: 1, month: 0 }, 'September seen whole: +600');
    mm.note(2.0, 1600); mm.note(3.0, 2500);
    assert.deepEqual(mm.change(2500, 1), { value: 900, span: 1, month: 2 }, 'a window of one: the last month alone');
    assert.deepEqual(mm.change(2500, 3), { value: 500, span: 3, month: 0 }, 'three months: (2500 - 1000) / 3');
    assert.deepEqual(mm.change(2500, 12), { value: 500, span: 3, month: 0 }, 'no more than were seen');
    // a skip over four months counts them all; a window too short for the gap still takes the month before
    mm.note(7.2, 900);
    assert.deepEqual(mm.change(900, 3), { value: -400, span: 4, month: 3 }, '(900 - 2500) / 4');
    // an earlier month (a load, a new game) starts again; unlimited money is not watched
    mm.note(2.5, 5000);
    assert.deepEqual(mm.change(5100), { value: 100, span: 0, month: 2 }, 'loaded mid-month: so far since it was seen');
    mm.note(3.0, 5200);
    assert.equal(mm.change(5300).span, 0, "a loaded game's first month is not whole: still so far this month");
    assert.equal(mm.change(5300).value, 100);
    mm.note(4.0, 6200); mm.note(4.5, Infinity);
    assert.deepEqual(mm.change(6200), { value: 1000, span: 1, month: 3 });
    for (let k = 5; k < 40; k++) mm.note(k, 6200 + k);
    assert.ok(mm.change(0, 99).span <= MONEY_MONTHS, `at most ${MONEY_MONTHS} months`);
  });
});

describe('the chips read the right numbers (ui/stat-chips.ts)', () => {
  it("money and its change a month, reputation, golfers a month, course rating, in the concept's order", () => {
    const cs = statChips(stats());
    assert.deepEqual(cs.map(c => c.id), ['money', 'rep', 'golfers', 'rating']);
    const c = byId(stats());
    assert.equal(c.money!.value, '$842,350'); assert.equal(c.money!.short, '$842k'); assert.equal(c.money!.sub, '▲ +$12,480/mo'); assert.equal(c.money!.subTone, 'up');
    assert.equal(c.rep!.value, '82%');
    assert.equal(c.golfers!.value, '1,248');
    assert.equal(c.rating!.value, '3.5'); assert.equal(c.rating!.unit, '/5');
    assert.match(c.money!.tip, /^Money: \$842,350\. Last month \(Oct 1986\): \+\$12,480\. Click for the books$/);
  });
  it('losing money, in the red, bankrupt soon, unlimited, no holes: never by colour alone (T180)', () => {
    const lose = byId(stats({ monthChange: -3400 }));
    assert.equal(lose.money!.sub, '▼ −$3,400/mo'); assert.equal(lose.money!.subTone, 'down');
    assert.equal(byId(stats({ monthChange: 0 })).money!.sub, '$0/mo');
    const red = byId(stats({ money: -5000 }), 3);
    assert.equal(red.money!.value, '! −$5,000'); assert.equal(red.money!.short, '! −$5,000'); assert.equal(red.money!.tone, 'down');
    assert.equal(red.money!.sub, 'bankrupt in 3 days'); assert.equal(red.money!.subAlways, true, 'the warning shows at every width');
    assert.match(red.money!.tip, /In the red: bankrupt in 3 days/);
    const inf = byId(stats({ money: Infinity, monthChange: null }));
    assert.equal(inf.money!.value, '∞'); assert.equal(inf.money!.sub, undefined); assert.equal(inf.money!.short, undefined);
    const none = byId(stats({ quality: null, holes: 0, golfers: 0 }));
    assert.equal(none.rating!.value, '—'); assert.equal(none.rating!.unit, undefined); assert.equal(none.rating!.tip, 'Course rating: no holes yet');
    assert.equal(none.golfers!.value, '0'); assert.match(none.golfers!.tip, /none yet/);
  });
  it("the change's span in words, and the money figures", () => {
    assert.equal(changeWhen({ monthSpan: 0, month: 0 }), 'So far this month (Sep 1984)');
    assert.equal(changeWhen({ monthSpan: 1, month: 4 }), 'Last month (Jan 1985)');
    assert.equal(changeWhen({ monthSpan: 5, month: 2 }), 'A month on average over the last 5 months (Nov 1984 to Mar 1985)');
    assert.deepEqual([9500, 842350, 1234567, 12_400_000, -5000, -42_000].map(shortMoney), ['$9,500', '$842k', '$1.23M', '$12.4M', '−$5,000', '−$42k']);
    assert.equal(signedMoney(12480), '+$12,480'); assert.equal(signedMoney(-3), '−$3'); assert.equal(signedMoney(0), '$0');
    assert.equal(plainMoney(-1234.4), '−$1,234');
  });
});

describe("the chips as drawn: T135's icon-only rule below 2200 px", () => {
  const html = renderToStaticMarkup(createElement(StatChips, { chips: statChips(stats()), on: { money: () => {}, golfers: () => {} }, drawer: createElement('span', null, 'drawer') }));
  it('every chip: its icon and its figure at every width, its words only from 2200 px, the words in its tooltip', () => {
    assert.equal(WIDE_LINE, 'hidden min-[2200px]:block');
    for (const [id, label, tip] of [['rep', 'Reputation', 'Reputation: 82 of 100'], ['golfers', 'Golfers/mo', 'Golfers a month: 1,248'], ['rating', 'Course rating', 'Course rating: 3.5 of 5']]) {
      const chip = new RegExp(`data-stat="${id}"[^>]*data-tip="${tip}`).exec(html);
      assert.ok(chip, `${id}: its tooltip says its words`);
      const next = html.indexOf('data-stat=', chip.index + 10), body = html.slice(chip.index, next < 0 ? undefined : next);
      assert.match(body, /class="stat-chip-icon"><img/, `${id}: its icon`);
      assert.ok(body.includes(`class="stat-chip-label ${WIDE_LINE}">${label}<`), `${id}: its words from 2200 px only`);
      assert.doesNotMatch(body, /class="stat-chip-value[^"]*hidden/, `${id}: its figure always shows`);
    }
    // the money: the full figure from 1600 px, the short one below; its change from 1600 px; no words of its own
    const m = html.slice(html.indexOf('data-stat="money"'), html.indexOf('data-stat="rep"'));
    assert.match(m, /<span class="hidden min-\[1600px\]:inline">\$842,350<\/span><span class="min-\[1600px\]:hidden">\$842k<\/span>/);
    assert.match(m, /class="stat-chip-sub hidden min-\[1600px\]:block stat-up"[^>]*>▲ \+\$12,480\/mo</);
    assert.doesNotMatch(m, /stat-chip-label/);
    assert.match(html, /<button type="button" class="stat-chip" data-stat="money"/, 'the money opens the books');
    assert.match(html, /<button type="button" class="stat-chip" data-stat="golfers"/, 'the golfers open the Club card');
    assert.match(html, /<div class="stat-chip" data-stat="rep"[^>]*role="group"/, 'no action: not a button');
    assert.match(html, /group-hover:block[^>]*><div class="glass[^>]*><span>drawer<\/span>/, "the money's drawer");
  });
  it("the golf top bar draws them first, after the title, and keeps the other chips' words from 2200 px", () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    assert.match(app, /const WIDE = 'hidden min-\[2200px\]:inline';/);
    const chips = app.indexOf('<StatChips chips={statChips(stats'), tier = app.indexOf('<Stat icon="trophy" label="Tier"');
    assert.ok(chips > 0 && tier > chips, 'the stat chips come before the Tier');
    assert.match(app, /label="Tier"[^\n]*subClass="max-\[2399px\]:hidden"/, "the tier's name from 2400 px (its tooltip says it)");
    assert.doesNotMatch(app, /\{gv \? \(\s*<div className="group relative">\s*\{treasury\(game\)\}/, 'the golf Treasury is the money chip now');
    const css = readFileSync('src/index.css', 'utf8');
    assert.match(css, /\.stat-chip \{[^}]*white-space: nowrap;/);
  });
});
