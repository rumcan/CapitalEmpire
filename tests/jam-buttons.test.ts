// T459 (the owner, 2026-11-13: "tutorial has a The Bank with a Show me button that does nothing? are you guys not testing buttons?" and "maybe its time
// to add some unit tests"): no dead button in the jam build. Every tutorial step's Show me does something and every control it pulses is drawn; every
// tip's Show me and every Build menu card reaches the engine; every <button> in the jam's cards has a click; every game.x those cards call is a real
// member of the engine's Game. Pure, Node (the built page's own clicks: scripts/jam/smoke.mjs, npm run jam:smoke).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JAM_TOUR, tourShowOf } from '../src/game/ext/progressive-ui/tour';
import { JAM_TIPS } from '../src/ui/jam/tips';
import { runBuildAct, runTipShow, type ActHost, type ActUi } from '../src/ui/jam/acts';
import { buildCards, type BuildAct, type BuildSource } from '../src/ui/jam/build-menu';
import { RAIL, jamRail } from '../src/ui/rail-items';

/** every data-guide anchor the UI draws: the literal ones in the components, the jam rail's items, the two cursors */
function anchors(): Set<string> {
  const out = new Set<string>();
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.tsx')) for (const m of readFileSync(p, 'utf8').matchAll(/data-guide="([^"]+)"/g)) out.add(m[1]!); } };
  walk('src');
  for (const r of jamRail(RAIL)) out.add(`rail-${r.id}`);
  const rail = readFileSync('src/ui/Rail.tsx', 'utf8');
  assert.match(rail, /data-guide=\{isWalk \? 'rail-walk' : 'rail-select'\}/); out.add('rail-walk'); out.add('rail-select');
  assert.match(rail, /data-guide=\{`rail-\$\{r\.id\}`\}/);
  return out;
}

/** a stub game that records every engine call (name and arguments) */
function stub(o: { cardOpen?: boolean; panel?: string | null } = {}): { g: ActHost; calls: string[] } {
  const calls: string[] = [], rec = (n: string) => (...a: unknown[]) => { calls.push(`${n}(${a.map(x => JSON.stringify(x)).join(',')})`); };
  const g: ActHost = {
    range: { cardOpen: o.cardOpen ?? false, scene: { counter: { x: 10, y: 20 } } },
    openRangeCard: rec('openRangeCard'), placeRangePart: rec('placeRangePart'), lookAt: rec('lookAt'), buyRangeUpgrade: rec('buyRangeUpgrade'),
    setTool: rec('setTool'), paint: { setProperty: rec('paint.setProperty') }, startFirstHole: rec('startFirstHole'), placeClubhouse: rec('placeClubhouse'),
    armPractice: rec('armPractice'), buyRange: rec('buyRange'), panel: o.panel ?? null, toggleMoneyPanel: rec('toggleMoneyPanel'), guideShowMe: rec('guideShowMe'),
  };
  return { g, calls };
}
function ui(): { u: ActUi; log: string[] } { const log: string[] = []; return { log, u: { rail: id => log.push(`rail ${id}`), build: t => log.push(`build ${t}`), tips: on => log.push(`tips ${on}`) } }; }

test('the jam tutorial: every step\'s Show me does something, and every control it pulses is drawn', () => {
  const have = anchors();
  assert.ok(JAM_TOUR.length >= 3);
  for (const st of JAM_TOUR) {
    const acts = tourShowOf(st, true);
    assert.ok(acts.length > 0, `${st.id} "${st.title}": its Show me does nothing`);
    for (const a of acts) if (a.k === 'pulse') assert.ok(have.has(a.ui), `${st.id}: Show me pulses data-guide="${a.ui}", which no control draws`);
  }
  // the owner's dead button: The Bank's Show me opens the Bank
  assert.deepEqual(tourShowOf(JAM_TOUR.find(s => s.id === 'tour-room')!, true), [{ k: 'bank' }]);
});

test('every tip with a Show me reaches the game or opens a card', () => {
  const shows = JAM_TIPS.filter(t => t.show);
  assert.ok(shows.length >= 3);
  for (const t of shows) {
    const { g, calls } = stub(), { u, log } = ui(), what = runTipShow(g, t.show!, u);
    assert.ok(calls.length + log.length > 0, `${t.id}: Show me (${t.show}) did nothing`);
    assert.ok(what.length > 0);
  }
  // the Bank's: opens it, and does not shut it when it is open already
  const open = stub({ panel: 'bank' }); runTipShow(open.g, 'bank', ui().u); assert.deepEqual(open.calls, []);
  const shut = stub(); runTipShow(shut.g, 'bank', ui().u); assert.deepEqual(shut.calls, ['toggleMoneyPanel()']);
});

test('every Build menu act calls the engine (and shuts the menu first)', () => {
  const acts: BuildAct[] = [
    { k: 'place', id: 'range' }, { k: 'place', id: 'carpark' }, { k: 'place', id: 'practice' }, { k: 'upgrade', id: 'greens' }, { k: 'rangeCard' },
    { k: 'newHole' }, { k: 'paths' }, { k: 'clubhouse' }, { k: 'green', id: 'putting' }, { k: 'green', id: 'chipping' }, { k: 'buyRange' }, { k: 'junk' },
  ];
  for (const a of acts) {
    const { g, calls } = stub({ cardOpen: true }), { u, log } = ui();
    runBuildAct(g, a, u);
    assert.equal(log[0], 'build null', `${a.k}: the menu shuts`);
    assert.ok(calls.some(c => !c.startsWith('openRangeCard(false)')), `${a.k}: no engine call (${calls.join(' ')})`);
  }
  // the range card is closed before a placement starts, kept for the acts that open it
  const p = stub({ cardOpen: true }); runBuildAct(p.g, { k: 'newHole' }, ui().u); assert.equal(p.calls[0], 'openRangeCard(false)');
  const r = stub({ cardOpen: true }); runBuildAct(r.g, { k: 'junk' }, ui().u); assert.ok(!r.calls.includes('openRangeCard(false)'));
});

test('every Build menu card that is not built has something to do', () => {
  const src = (o: Partial<BuildSource> = {}): BuildSource => ({
    places: [{ id: 'range', name: 'The driving range', cost: 15000, done: false, why: '' }, { id: 'carpark', name: 'The car park', cost: 2000, done: false, why: '' }, { id: 'practice', name: 'The practice area', cost: 5000, done: false, why: '' }],
    range: null, rangeUpkeep: 0, locks: { newHole: null, buildings: null, path: null, practice: null }, clubhouse: { built: false, cost: 45000, upkeep: 150 }, course: null, money: 75000, ...o,
  });
  for (const s of [src(), src({ clubhouse: { built: true, cost: 45000, upkeep: 150 } }), src({ money: 0 }), src({ locks: { newHole: 'Locked', buildings: 'Locked', path: null, practice: 'Locked' } })]) {
    for (const c of buildCards(s)) assert.ok(c.act || c.done, `${c.id}: neither an act nor built`);
  }
});

/** the <button ...> tags of a TSX source (braces balanced, so an arrow's > inside {} does not end the tag) */
function buttonTags(src: string): string[] {
  const out: string[] = [];
  for (let i = src.indexOf('<button'); i >= 0; i = src.indexOf('<button', i + 7)) {
    let d = 0, j = i;
    for (; j < src.length; j++) { const ch = src[j]; if (ch === '{') d++; else if (ch === '}') d--; else if (ch === '>' && d === 0) break; }
    out.push(src.slice(i, j + 1));
  }
  return out;
}
const JAM_CARDS = ['src/ui/jam/TitleCard.tsx', 'src/ui/golf/StartPickCard.tsx', 'src/ui/jam/TipsCard.tsx', 'src/ui/jam/BuildMenu.tsx', 'src/ui/golf/BankPanel.tsx', 'src/ui/golf/StatementCard.tsx', 'src/ui/golf/RangeCard.tsx', 'src/ui/golf/HoleCard.tsx', 'src/ui/golf/RangeGuideCard.tsx', 'src/ui/golf/View3pPanel.tsx'];

test('every button in the jam\'s cards has a click', () => {
  for (const f of JAM_CARDS) {
    const tags = buttonTags(readFileSync(f, 'utf8'));
    assert.ok(tags.length > 0, `${f}: no buttons found (the scan is broken)`);
    for (const t of tags) assert.ok(/\bonClick=|\btype="submit"/.test(t), `${f}: a button with no onClick: ${t.slice(0, 120)}`);
  }
});

test('every game.x the jam\'s cards and acts call is a member of the engine', () => {
  const eng = readFileSync('src/game/engine.ts', 'utf8'), members = new Set<string>();
  for (const m of eng.matchAll(/^ {2}(?:(?:private|readonly|static|async|get|set|override|public|protected)\s+)*([A-Za-z_$][\w$]*)\s*[(:=<!?]/gm)) members.add(m[1]!);
  assert.ok(members.has('bankBorrow') && members.has('tourShowMe'), 'the member scan finds the engine\'s methods');
  const used = new Map<string, string>();
  for (const f of [...JAM_CARDS, 'src/ui/jam/acts.ts']) for (const m of readFileSync(f, 'utf8').matchAll(/\bgame\.([A-Za-z_$][\w$]*)/g)) used.set(m[1]!, f);
  const acts = readFileSync('src/ui/jam/acts.ts', 'utf8');
  for (const m of acts.slice(acts.indexOf('export interface ActHost'), acts.indexOf('export interface ActUi')).matchAll(/^ {2}([A-Za-z_$][\w$]*)[(:]/gm)) used.set(m[1]!, 'src/ui/jam/acts.ts ActHost');
  assert.ok(used.size > 10);
  for (const [name, f] of used) assert.ok(members.has(name), `${f}: game.${name} is not a member of the engine's Game`);
});
