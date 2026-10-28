// T235 (#690, the concept's top bar title): the club's name by stage, "Year N • Month • Weather temp°C", the temperature rule, and the width rule.
// Headless (react-dom/server for the markup); the bar's one row at 1366-2560 px is measured in the browser (the PR's screenshots).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import {
  COUNTRY_CLUB_TIER, FULL_MONTHS, MAP_NAME, MONTH_HIGH_C, TEMP_LIMITS_C, TITLE_WEATHER, clubName, clubStage, clubTitle, clubYear, monthTemperature, tempText,
  type ClubTitleFacts,
} from '../src/game/golf/clubtitle';
import { TIERS } from '../src/game/golf/tour';
import { TOURNAMENT_MONTH, WEATHER_CONDITIONS, getTournamentWeather, type WeatherCondition } from '../src/game/golf/weather';
import { MONTH_NAMES } from '../src/game/golf/calendar';
import { ClubTitleText, TITLE_FULL_FROM, TITLE_WORDS_FROM } from '../src/ui/ClubTitle';

const facts = (o: Partial<ClubTitleFacts> = {}): ClubTitleFacts => ({ seed: 1234, seasons: 0, month: 8, run: 1, range: false, holes: 9, tier: 1, ...o });

describe("the club's name at each stage (golf/clubtitle.ts)", () => {
  it('a range start with no hole is its driving range; with a hole a golf club; from the tier 4 a golf and country club', () => {
    assert.equal(MAP_NAME, 'Maple Falls');
    assert.equal(clubStage({ range: true, holes: 0, tier: 1 }), 'range');
    assert.equal(clubStage({ range: true, holes: 1, tier: 1 }), 'club', 'the first hole makes it a club');
    assert.equal(clubStage({ range: true, holes: 9, tier: 3 }), 'club');
    assert.equal(clubStage({ range: false, holes: 0, tier: 1 }), 'club', 'only a range start has a driving range stage: another golf start is a club');
    assert.equal(clubStage({ range: false, holes: 9, tier: 1 }), 'club');
    assert.equal(clubStage({ range: false, holes: 18, tier: 4 }), 'country');
    assert.equal(clubStage({ range: true, holes: 18, tier: 5 }), 'country');
  });
  it("the tier boundary is the first tier with hospitality and hotel rooms: the Classic, tier 4", () => {
    assert.equal(COUNTRY_CLUB_TIER, 4);
    assert.equal(TIERS[COUNTRY_CLUB_TIER - 1]!.name, 'Maple Falls Classic');
    assert.ok(!TIERS[COUNTRY_CLUB_TIER - 2]!.needs.includes('hospitality'), 'the tier below has none');
    assert.ok(TIERS[COUNTRY_CLUB_TIER - 1]!.needs.includes('hospitality') && TIERS[COUNTRY_CLUB_TIER - 1]!.needs.includes('hotelRooms'));
  });
  it('the names, full and short', () => {
    assert.equal(clubName('range'), 'Maple Falls Driving Range');
    assert.equal(clubName('club'), 'Maple Falls Golf Club');
    assert.equal(clubName('country'), 'Maple Falls Golf & Country Club', "the concept's title");
    assert.equal(clubName('range', true), 'Maple Falls Range');
    assert.equal(clubName('club', true), 'Maple Falls GC');
    assert.equal(clubName('country', true), 'Maple Falls G&CC');
    assert.equal(clubName('club', false, 'Pine Hollow'), 'Pine Hollow Golf Club', 'any map name');
  });
  it('the title carries the name for the facts: a range start, a club with holes, a top-tier club', () => {
    assert.equal(clubTitle(facts({ range: true, holes: 0 })).name, 'Maple Falls Driving Range');
    assert.equal(clubTitle(facts({ range: true, holes: 3 })).name, 'Maple Falls Golf Club');
    assert.equal(clubTitle(facts({ tier: 2 })).name, 'Maple Falls Golf Club');
    assert.equal(clubTitle(facts({ tier: 5 })).name, 'Maple Falls Golf & Country Club');
    assert.equal(clubTitle(facts({ tier: 5 })).short, 'Maple Falls G&CC');
    assert.equal(clubTitle(facts({ range: true, holes: 0 })).stage, 'range');
  });
});

describe('the date line: Year N • Month • Weather temp°C', () => {
  it("the club's year counts from the start: no seasons played is year 1, the concept's year 3 is two seasons on", () => {
    assert.equal(clubYear(0), 1); assert.equal(clubYear(2), 3); assert.equal(clubYear(-4), 1); assert.equal(clubYear(2.9), 3);
    assert.match(clubTitle(facts({ seasons: 2, month: 9 })).when, /^Year 3 • October$/);
    assert.match(clubTitle(facts({ seasons: 0, month: 8 })).when, /^Year 1 • September$/);
  });
  it('the month in full, and in three letters for the compact title', () => {
    assert.equal(FULL_MONTHS.length, 12);
    FULL_MONTHS.forEach((m, i) => {
      assert.ok(m.startsWith(MONTH_NAMES[i]!), `${m} starts ${MONTH_NAMES[i]}`);
      const t = clubTitle(facts({ seasons: 6, month: i }));
      assert.equal(t.when, `Year 7 • ${m}`); assert.equal(t.whenShort, `Year 7 • ${MONTH_NAMES[i]}`);
    });
    assert.equal(clubTitle(facts({ month: 14 })).when, 'Year 1 • December', 'a month past the year is kept in it');
  });
  it("the line is 'Year N • Month • Weather temp°C', the weather in its own part", () => {
    const re = /^Year \d+ • [A-Z][a-z]+ • (Sunny|Overcast|Rain|Storm|Hot) −?\d+°C$/;
    for (let seed = 1; seed <= 40; seed++) for (let m = 0; m < 12; m++) {
      const t = clubTitle(facts({ seed, month: m, seasons: seed % 7, run: 1 + (seed % 7) }));
      assert.match(t.sub, re); assert.equal(t.sub, `${t.when} • ${t.weather}`);
      assert.match(t.weather, /^(Sunny|Overcast|Rain|Storm|Hot) −?\d+°C$/);
      assert.ok(t.tip.startsWith(`${t.name} · ${t.sub}`), 'the tooltip holds the full text');
    }
  });
  it("the weather is the month's own from the game's calendar; August's is the tournament's, as the tournament chip says it", () => {
    assert.deepEqual(Object.keys(TITLE_WEATHER).sort(), [...WEATHER_CONDITIONS].sort());
    for (let seed = 1; seed <= 60; seed++) for (let run = 1; run <= 4; run++) {
      const t = clubTitle(facts({ seed, run, month: TOURNAMENT_MONTH })), tour = getTournamentWeather(seed, run).condition;
      assert.ok(t.weather.startsWith(TITLE_WEATHER[tour] + ' '), `seed ${seed} run ${run}: ${t.weather} vs ${tour}`);
    }
    for (let m = 0; m < 12; m++) {
      const t = clubTitle(facts({ seed: 77, run: 2, month: m })), w = getTournamentWeather(77, 2, 0, m).condition;
      assert.ok(t.weather.startsWith(TITLE_WEATHER[w] + ' '));
    }
  });
  it('the same date always reads the same; another seed or month may not', () => {
    const a = clubTitle(facts({ seed: 99, month: 3, run: 2 })), b = clubTitle(facts({ seed: 99, month: 3, run: 2 }));
    assert.deepEqual(a, b);
    const seen = new Set<string>(); for (let s = 1; s <= 30; s++) seen.add(clubTitle(facts({ seed: s, month: 3 })).weather);
    assert.ok(seen.size > 3, 'the weather and the temperature vary with the map');
  });
  it('the road a range stands on is in its tooltip, only while it is the range', () => {
    assert.match(clubTitle(facts({ range: true, holes: 0, road: 'County Road 75' })).tip, /^Maple Falls Driving Range, on County Road 75 · Year 1/);
    assert.doesNotMatch(clubTitle(facts({ range: true, holes: 2, road: 'County Road 75' })).tip, /County Road/);
  });
});

describe('the temperature rule: plausible for the month and the weather, the same for a date', () => {
  const seeds = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919);
  const temp = (seed: number, month: number, w: WeatherCondition) => monthTemperature(seed, 1 + (seed % 5), month, w);
  it('the temperature is deterministic', () => {
    for (const s of seeds.slice(0, 20)) for (let m = 0; m < 12; m++) for (const w of WEATHER_CONDITIONS) assert.equal(temp(s, m, w), temp(s, m, w));
  });
  it('kept within its weather: heat is 31 or more, no other weather is above 30, rain is not below 1 (colder is snow), a storm not below 4', () => {
    for (const s of seeds) for (let m = 0; m < 12; m++) for (const w of WEATHER_CONDITIONS) {
      const t = temp(s, m, w), [lo, hi] = TEMP_LIMITS_C[w];
      assert.ok(Number.isInteger(t) && t >= lo && t <= hi, `${w} in month ${m}: ${t}`);
    }
    assert.deepEqual(TEMP_LIMITS_C.heat, [31, 40]);
    for (const w of WEATHER_CONDITIONS) if (w !== 'heat') assert.ok(TEMP_LIMITS_C[w][1] <= 30, `${w} is never in the heat's range`);
    assert.ok(TEMP_LIMITS_C.rain[0] >= 1 && TEMP_LIMITS_C.storm[0] >= 4);
  });
  it("follows the season: January is the coldest and July the warmest on average; a day is within 2 degrees of the month's usual for its weather", () => {
    const mean = (m: number, w: WeatherCondition) => seeds.reduce((a, s) => a + temp(s, m, w), 0) / seeds.length;
    assert.ok(mean(0, 'clear') < 3 && mean(0, 'clear') > -4, `a clear January day is about freezing: ${mean(0, 'clear')}`);
    assert.ok(mean(6, 'clear') > 24, `a clear July day is warm: ${mean(6, 'clear')}`);
    for (let m = 1; m < 12; m++) assert.ok(mean(0, 'overcast') < mean(m, 'overcast') + 1e-9, `January overcast is not warmer than month ${m}`);
    assert.equal(MONTH_HIGH_C[9], 16, "October's usual high is the concept's 16");
    assert.ok(Math.abs(mean(9, 'clear') - 18) < 1, `a sunny October day is about 18: ${mean(9, 'clear')}`);
    // the draw moves a day by at most 2 degrees from month and weather (before the limits)
    const base = (m: number, shift: number) => MONTH_HIGH_C[m]! + shift;
    for (const s of seeds.slice(0, 80)) assert.ok(Math.abs(temp(s, 9, 'clear') - base(9, 2)) <= 2);
  });
  it('the weather moves it: sunny is warmer than overcast, rain and storm cooler, heat the hottest, in the same month and map', () => {
    for (const s of seeds.slice(0, 50)) for (const m of [4, 5, 6, 7, 8]) {
      assert.ok(temp(s, m, 'heat') > temp(s, m, 'clear'), `heat above clear (${s}, ${m})`);
      assert.ok(temp(s, m, 'clear') >= temp(s, m, 'overcast') + 2, `clear above overcast (${s}, ${m})`);
      assert.ok(temp(s, m, 'overcast') >= temp(s, m, 'rain'), `rain not above overcast (${s}, ${m})`);
    }
  });
  it('says it in degrees C with a true minus', () => {
    assert.equal(tempText(16), '16°C'); assert.equal(tempText(0), '0°C'); assert.equal(tempText(-3), '−3°C'); assert.equal(tempText(33), '33°C');
    let cold = 0; for (const s of seeds) { const t = clubTitle(facts({ seed: s, month: 0, run: 1 })); if (/−\d/.test(t.weather)) cold++; }
    assert.ok(cold > 0, 'a January date can read below zero');
  });
});

describe('the width rule: the compact title below 2560 px, the full from 2560 px, the words from 1900 px, the tooltip always', () => {
  const t = clubTitle(facts({ tier: 5, seasons: 2, month: 9 }));
  const html = renderToStaticMarkup(createElement(ClubTitleText, { title: t }));
  const css = readFileSync('src/index.css', 'utf8'), app = readFileSync('src/App.tsx', 'utf8');
  it('both forms are in the markup, the width picks one (nothing is measured in script)', () => {
    assert.match(html, /data-testid="title-name"><span class="title-full">Maple Falls Golf &amp; Country Club<\/span><span class="title-compact">Maple Falls G&amp;CC<\/span><\/div>/);
    assert.match(html, /data-testid="title-sub"><span class="title-full">Year 3 • October<\/span><span class="title-compact">Year 3 • Oct<\/span><span> • <\/span><span class="club-title-weather">(Sunny|Overcast|Rain|Storm|Hot) −?\d+°C<\/span><\/div>/);
  });
  it('index.css: the compact form shows by default and the full one from TITLE_FULL_FROM', () => {
    assert.equal(TITLE_FULL_FROM, 2560); assert.equal(TITLE_WORDS_FROM, 1900);
    assert.match(css, /\.club-title \.title-full \{ display: none; \}/);
    assert.match(css, /@media \(min-width: 2560px\) \{[^@]*\.club-title \.title-full \{ display: inline; \}[^@]*\.club-title \.title-compact \{ display: none; \}/);
    assert.match(css, /\.club-title-name \{[^}]*font-size: 1\.125rem;/, 'the compact name is a size smaller');
    assert.match(css, /\.club-title \{[^}]*white-space: nowrap;/, 'one line each');
    assert.match(css, /\.club-title-name \{[^}]*overflow: hidden; text-overflow: ellipsis;/, 'never wraps: cut with an ellipsis');
  });
  it('the compact title is no wider than the bar allows where it is full (2200 to 2559 px, about 180 px): its words are short', () => {
    // measured in the browser at 18 px / 12 px (the PR's screenshots): the compact name and line are 172 px for "Maple Falls Range" over a Sep line; the
    // budget is in characters here: the longest compact name 17, the longest compact line "Year 12 • Sep • Overcast −12°C" (30)
    for (const stage of ['range', 'club', 'country'] as const) assert.ok(clubName(stage, true).length <= 17, `${stage}: ${clubName(stage, true)}`);
    let longest = 0;
    for (let m = 0; m < 12; m++) for (const w of WEATHER_CONDITIONS) {
      const s = `Year 12 • ${MONTH_NAMES[m]} • ${TITLE_WEATHER[w]} ${tempText(TEMP_LIMITS_C[w][0] === -30 ? -12 : TEMP_LIMITS_C[w][0])}`; longest = Math.max(longest, s.length);
    }
    assert.ok(longest <= 30, `the longest compact line ${longest}`);
    assert.ok(clubName('country').length <= 31, 'the full name is the concept\'s own length');
  });
  it("the golf bar draws the title's words from 1900 px, keeps the leaf and puts the full text in the tooltip on the leaf too; the classic game keeps its line", () => {
    assert.match(app, /data-tip=\{title\?\.tip\} data-testid="title-block">\s*<Icon name="leaf" size=\{38\} \/>/, 'the tooltip is on the block with the leaf');
    assert.match(app, /<div className="max-\[1899px\]:hidden">\{\/\*[^*]*\*\/\}<ClubTitleText title=\{title\} \/>/, 'the title words from 1900 px');
    assert.match(app, /Town Builder<\/div>/, 'the classic town game keeps its old line');
    assert.match(app, /const title = game\?\.ready \? game\.titleName\(fv\?\.check\.holes\) : null;/);
    assert.match(readFileSync('src/game/engine.ts', 'utf8'), /titleName\(holes: number = this\.inviteCheck\(\)\?\.holes \?\? 0\): ClubTitle \| null \{\s*const g = this\.golf; if \(!g\) return null;/, 'null outside golf mode');
  });
  it("the tooltip holds the whole title: name · line, and the range's road", () => {
    assert.equal(t.tip, `Maple Falls Golf & Country Club · ${t.sub}`);
    assert.ok(t.sub.startsWith('Year 3 • October • '));
  });
});
