// T449 (src/game/golf/nightgolf.ts, clubevents.ts): Night golf. It opens at the tour's tier 2; it is hosted only with most holes lit by floodlight
// towers (15 of 18, 8 of 9); its money is tickets, entries and a novelty that fades, less the staff and the lights; the dark costs the field strokes on
// unlit holes, the same every time; it is the season's third club event, skipped while it cannot be hosted; the floodlight is an Event tool structure.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TILE_M } from '../src/game/golf/types';
import {
  COURSE_LIT_SHARE, FLOODLIGHT_ID, LIGHT_REACH_M, NIGHT, NIGHT_UNLOCK_TIER, darkStrokes, hostWhy, lighting, litShare, nightMoney, nightUnlocked, type LitHole,
} from '../src/game/golf/nightgolf';
import { CLUB_EVENTS, EVENT_IDS, MODE_OF, eventDue, eventOfMode, freshEvents, normalizeEvents, seasonMonthOf } from '../src/game/golf/clubevents';
import { STRUCTURE } from '../src/game/golf/tents';
import { STRUCTURE_SPRITE } from '../src/game/golf/structure-art';
import { groupOf } from '../src/game/golf/structure-groups';

/** n holes of 300 m running east, 60 tiles apart */
const holes = (n: number): LitHole[] => Array.from({ length: n }, (_, i) => ({ n: i + 1, line: [{ x: 0, y: 60 * i }, { x: 300 / TILE_M, y: 60 * i }] }));
/** towers every 120 m along a hole's line, 10 m off it */
const towersFor = (h: LitHole) => [0, 120, 240].map(m => ({ x: h.line[0]!.x + m / TILE_M + 30 / TILE_M, y: h.line[0]!.y + 10 / TILE_M }));

describe('night golf: the unlock (T449)', () => {
  it('opens at the tour\'s tier 2 and says so before', () => {
    assert.equal(NIGHT_UNLOCK_TIER, 2);
    assert.ok(!nightUnlocked(1)); assert.ok(nightUnlocked(2)); assert.ok(nightUnlocked(5));
    const hs = holes(18), lit = hs.flatMap(towersFor);
    assert.match(hostWhy(1, hs, lit)!, /tier 2/);
    assert.equal(hostWhy(2, hs, lit), null);
  });
});

describe('night golf: the lights (T449)', () => {
  it('a hole is lit along the stretch within a tower\'s reach', () => {
    const h = holes(1)[0]!;
    assert.equal(litShare(h.line, []), 0);
    assert.equal(litShare(h.line, towersFor(h)), 1);
    const one = litShare(h.line, [{ x: 0, y: 0 }]); // one tower on the tee lights the first 75 m of 300
    assert.ok(Math.abs(one - (LIGHT_REACH_M / 300)) < 0.06, `${one}`);
  });
  it('hosting needs 15 of 18 holes lit (8 of 9), and the reason says how many', () => {
    const hs = holes(18);
    assert.equal(lighting(hs, []).need, Math.ceil(18 * COURSE_LIT_SHARE));
    assert.equal(lighting(hs, []).need, 15); assert.equal(lighting(holes(9), []).need, 8);
    const fourteen = hs.slice(0, 14).flatMap(towersFor), fifteen = hs.slice(0, 15).flatMap(towersFor);
    assert.equal(lighting(hs, fourteen).lit, 14);
    assert.equal(hostWhy(3, hs, fourteen), 'Night golf needs floodlights along at least 15 of your 18 holes: 14 are lit (build Floodlight towers beside the holes)');
    assert.equal(hostWhy(3, hs, fifteen), null);
    assert.match(hostWhy(3, hs, [])!, /none is lit/);
    assert.match(hostWhy(3, [], [])!, /holes/);
  });
  it('the floodlight tower is a bought Event tool structure from tier 2, drawn with a stand-in lamp, in its own group', () => {
    const f = STRUCTURE[FLOODLIGHT_ID]!;
    assert.ok(f, 'in the catalogue'); assert.equal(f.kind, 'light'); assert.equal(f.tier, 2); assert.ok(f.buy > 0); assert.equal(f.rent, 0);
    assert.equal(STRUCTURE_SPRITE[FLOODLIGHT_ID], 'world:streetlamp');
    assert.equal(groupOf(FLOODLIGHT_ID)?.id, 'lights');
  });
});

describe('night golf: the money (T449)', () => {
  it('tickets by reputation, entries by the field, a novelty that fades, the lights by the towers', () => {
    const m = nightMoney({ rep: 50, field: 40, before: 0, towers: 45 });
    assert.equal(m.attendance, NIGHT.base + NIGHT.perRep * 50);
    assert.equal(m.tickets, m.attendance * NIGHT.ticket); assert.equal(m.entries, 40 * NIGHT.entry);
    assert.equal(m.novelty, Math.round(m.tickets * 0.5)); assert.equal(m.lights, 45 * NIGHT.towerNight);
    assert.equal(m.net, m.tickets + m.entries + m.novelty - m.staff - m.lights);
    const nov = [0, 1, 2, 3, 4, 9].map(b => nightMoney({ rep: 50, field: 40, before: b, towers: 45 }).novelty);
    for (let i = 1; i < nov.length; i++) assert.ok(nov[i]! <= nov[i - 1]!, 'the novelty fades');
    assert.equal(nov[nov.length - 1], 0);
    assert.ok(nightMoney({ rep: 90, field: 40, before: 0, towers: 45 }).attendance > m.attendance, 'more reputation, more spectators');
    assert.ok(nightMoney({ rep: 50, field: 40, before: 0, towers: 90 }).net < m.net, 'more towers cost more a night');
    assert.ok(m.net > 0, 'a lit course at reputation 50 makes money its first night');
  });
});

describe('night golf: the dark (T449)', () => {
  it('costs strokes on unlit holes only, the same every time', () => {
    const lit = new Map(holes(18).map(h => [h.n, 1])), dark = new Map(holes(18).map(h => [h.n, 0]));
    const names = Array.from({ length: 200 }, (_, i) => `Golfer ${i}`);
    assert.ok(names.every(n => darkStrokes(n, lit) === 0), 'a lit course costs nothing');
    const avg = names.reduce((a, n) => a + darkStrokes(n, dark), 0) / names.length;
    assert.ok(avg > 18 * 0.25 && avg < 18 * 0.45, `about a third of a stroke a dark hole (${avg.toFixed(2)})`);
    assert.equal(darkStrokes('Pat Doe', dark), darkStrokes('Pat Doe', dark));
  });
});

describe('night golf as a club event (T449)', () => {
  it('is the season\'s third event, in July, open to all, played as a night-golf round', () => {
    assert.deepEqual(EVENT_IDS, ['mayor', 'club', 'night']);
    assert.equal(CLUB_EVENTS.night.name, 'Night golf'); assert.equal(CLUB_EVENTS.night.field, 'all'); assert.equal(CLUB_EVENTS.night.maxHcp, null);
    assert.equal(MODE_OF.night, 'night-golf'); assert.equal(eventOfMode('night-golf'), 'night');
  });
  it('is not due while it cannot be hosted, and is once it can', () => {
    const s = freshEvents(); s.held.mayor = 0; s.held.club = 0;
    const at = seasonMonthOf('night') + 0.1;
    assert.equal(eventDue(s, 0, at, id => id !== 'night'), null);
    assert.equal(eventDue(s, 0, at), 'night');
  });
  it('the save keeps how many nights were held and a night event day', () => {
    const s = normalizeEvents({ held: { night: 2 }, entered: {}, announced: {}, nights: 3, today: { id: 'night', season: 2, day: 5, par: 72, holes: 18, field: [{ name: 'A', strokes: 80 }] } });
    assert.equal(s.nights, 3); assert.equal(s.held.night, 2); assert.equal(s.today?.id, 'night');
    assert.equal(normalizeEvents({ held: {}, entered: {}, announced: {} }).nights, undefined);
  });
});
