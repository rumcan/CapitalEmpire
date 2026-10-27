// Headless tests for the rail (plan P23 4.2, P1-E, T120; regrouped by T182, #454): Select · COURSE: Driving range, Course, Decoration · TOWN:
// Traffic, Town decoration · Bulldoze; every tool reachable from its group (Props from both decorations); the ramp's locks per group and per
// tool inside a group; NEW per group; no key letters on the rail (the tooltip names them); old saves' seen ids. npm test (bundled by esbuild,
// run by node --test; the buttons render with react-dom/server).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, STAGE_WHY, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { RAIL, extraLock, pickTool, railEntries, railItemOf, railItemsOf, railTip, toolLock, toolNew, toolSections, toolsIn, type RailEntry } from '../src/ui/rail-items';
import { Rail } from '../src/ui/Rail';
import type { Tool } from '../src/game/types';

const GOLF_RAIL = ['select', 'course', 'decor', 'traffic', 'towndecor', 'bulldoze'];
const course = (holes: number): CourseProgress => ({ holes, seasons: 0, invited: false });
/** the unlocks of a golf game with this progress and holes */
const uiOf = (p: GolfProgress, holes: number) => computeProgressiveUiState(progressFacts(p, course(holes)));
/** a golf game's progress after the course reached this many holes (the engine's progressCheck), with the tools opened since */
function played(holes: number, opened: string[] = []): GolfProgress {
  const p = emptyProgress();
  advanceProgress(p, progressFacts(p, course(holes)), null);
  for (const t of opened) advanceProgress(p, progressFacts(p, course(holes)), t);
  return p;
}
const ids = (es: RailEntry[]) => es.map(e => e.item.id);
const html = (es: RailEntry[]) => renderToStaticMarkup(createElement(Rail, { entries: es, onPick: () => {}, onLocked: () => {} }));
/** the rendered button of rail item id */
const button = (h: string, id: string) => h.match(new RegExp(`<button data-rail="${id}"[^>]*>[\\s\\S]*?</button>`))?.[0] ?? '';
const WHY3 = "Unlocks with your third hole or the tour's invitation";
const ALL_TOOLS: Tool[] = ['select', 'road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path', 'buildings', 'props', 'greenkeeping'];

describe('the rail: the groups, in the same places at every stage (T182)', () => {
  it('golf: Select · Course: Driving range, Course, Decoration · Town: Traffic, Town decoration · Bulldoze, at every stage', () => {
    for (const [holes, adv] of [[0, false], [1, false], [3, false], [0, true]] as const) {
      const p = played(holes); p.advanced = adv;
      assert.deepEqual(ids(railEntries(uiOf(p, holes), true, 'select')), GOLF_RAIL, `holes ${holes}, every tool ${adv}`);
      const es = railEntries(uiOf(p, holes), true, 'select', { range: true });
      assert.deepEqual(ids(es), ['select', 'range', ...GOLF_RAIL.slice(1)], 'a range start: the Driving range first under Course');
      assert.deepEqual(es.filter(e => e.heading).map(e => [e.item.id, e.heading]), [['range', 'course'], ['traffic', 'town']]);
    }
  });
  it('the classic town game: no range, no golf-only tools; its Business tool under Town decoration; nothing locked', () => {
    const es = railEntries(null, false, 'road');
    assert.deepEqual(ids(es), GOLF_RAIL);
    assert.ok(es.every(e => !e.locked && !e.isNew));
    assert.equal(es.find(e => e.on)?.item.id, 'traffic');
    const town = RAIL.find(r => r.id === 'towndecor')!;
    assert.deepEqual(toolsIn(town, false).map(t => t.id), ['paint', 'business']);
    assert.deepEqual(toolsIn(town, true).map(t => t.id), ['paint', 'props', 'props'], 'T187: its Props and its Buildings (the Props tool town views)');
    assert.deepEqual(toolsIn(RAIL.find(r => r.id === 'course')!, false).map(t => t.id), ['course']);
  });
  it('every tool is reachable from exactly one group (Props from both decorations), and the groups hold what the owner asked', () => {
    for (const t of ALL_TOOLS) {
      const n = railItemsOf(t).length;
      assert.equal(n, t === 'props' ? 2 : 1, t);
    }
    const tools = (id: string) => RAIL.find(r => r.id === id)!.tools.map(t => t.id);
    assert.deepEqual(tools('course'), ['course', 'buildings', 'greenkeeping']);
    assert.deepEqual(RAIL.find(r => r.id === 'course')!.extras?.map(x => x.id), ['event', 'land'], 'the tournament stuff: the Event catalogue; T200: Land for sale');
    assert.deepEqual(tools('decor'), ['path', 'props']);
    assert.deepEqual(tools('traffic'), ['road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll']);
    assert.deepEqual(toolSections(RAIL.find(r => r.id === 'traffic')!, true).map(s => [s.sub, s.tools.length]), [['Roads', 3], ['Junctions', 1], ['Transport', 3]]);
    assert.equal(RAIL.find(r => r.id === 'range')!.action, 'range');
  });
  it('the tool in hand lights its group; Props lights the decoration it was opened from; the open range card lights the Driving range', () => {
    const ui = uiOf(played(3), 3);
    const lit = (t: Tool, active?: string, rangeOpen = false) => railEntries(ui, true, t, { active, range: true, rangeOpen }).filter(e => e.on).map(e => e.item.id);
    assert.deepEqual(lit('course'), ['course']); assert.deepEqual(lit('buildings'), ['course']); assert.deepEqual(lit('greenkeeping'), ['course']);
    assert.deepEqual(lit('path'), ['decor']); assert.deepEqual(lit('lane'), ['traffic']); assert.deepEqual(lit('toll'), ['traffic']); assert.deepEqual(lit('paint'), ['towndecor']);
    assert.deepEqual(lit('props'), ['decor']); assert.deepEqual(lit('props', 'towndecor'), ['towndecor']); assert.deepEqual(lit('props', 'decor'), ['decor']);
    assert.deepEqual(lit('select', undefined, true), ['range']);
    assert.equal(railItemOf('props', 'towndecor')?.id, 'towndecor'); assert.equal(railItemOf('props', 'traffic')?.id, 'decor', 'an item that does not hold it: its first');
  });
});

describe("the ramp's locks per group and inside a group (T182)", () => {
  it('stage 1: Traffic is locked in place with what unlocks it; Course, Decoration and Town decoration are open, their locked tools locked inside', () => {
    const ui = uiOf(played(0), 0), es = railEntries(ui, true, 'course'), h = html(es);
    assert.deepEqual(es.filter(e => e.locked).map(e => [e.item.id, e.locked]), [['traffic', WHY3]]);
    const traffic = button(h, 'traffic');
    assert.match(traffic, /class="[^"]*rail-tab-locked/); assert.match(traffic, /aria-disabled="true"/); assert.match(traffic, /class="rail-lock"/);
    assert.match(traffic, /data-tip="Traffic"/); assert.match(traffic, /data-tip-key="R"/);
    assert.equal(toolLock(ui, 'paint'), STAGE_WHY[2], 'Paint locked inside Town decoration');
    assert.match(toolLock(ui, 'greenkeeping') ?? '', /^Unlocks when your first hole is grown in/, 'Greenkeeping locked inside Course');
    assert.equal(toolLock(ui, 'props'), null); assert.equal(toolLock(ui, 'course'), null); assert.equal(toolLock(ui, 'path'), null);
    for (const id of ['select', 'course', 'decor', 'towndecor', 'bulldoze']) assert.doesNotMatch(button(h, id), /rail-tab-locked|aria-disabled/, id);
    assert.equal(extraLock(ui, { id: 'event', label: 'Tournament', icon: 'calendar' }), WHY3, 'the Tournament opens with the town (its chip\'s stage)');
  });
  it('a click on a group opens its last tool, else its first open one; a click on a locked group says why and opens nothing', () => {
    const s1 = uiOf(played(0), 0), s2 = uiOf(played(1), 1), town = RAIL.find(r => r.id === 'towndecor')!, traffic = RAIL.find(r => r.id === 'traffic')!;
    assert.equal(pickTool(town, true, s1), 'props', 'stage 1: Paint is locked, Props opens');
    assert.equal(pickTool(town, true, s2), 'paint'); assert.equal(pickTool(town, true, s2, 'props'), 'props', 'the last one used');
    assert.equal(pickTool(town, true, s1, 'paint'), 'props', 'a last one locked again is skipped');
    assert.equal(pickTool(traffic, true, s1), null);
    let picked = '', said = '';
    const tree = Rail({ entries: railEntries(s1, true, 'course'), onPick: r => { picked = r.id; }, onLocked: (r, why) => { said = `${r.id}: ${why}`; } });
    const find = (id: string): ReactElement<{ onClick: () => void }> => {
      const walk = (n: unknown): ReactElement<{ onClick: () => void }> | null => {
        if (Array.isArray(n)) { for (const c of n) { const f = walk(c); if (f) return f; } return null; }
        if (!isValidElement(n)) return null;
        const props = n.props as { 'data-rail'?: string; children?: unknown };
        return props['data-rail'] === id ? (n as ReactElement<{ onClick: () => void }>) : walk(props.children);
      };
      return walk(tree)!;
    };
    find('traffic').props.onClick(); assert.equal(picked, ''); assert.equal(said, `traffic: ${WHY3}`);
    find('towndecor').props.onClick(); assert.equal(picked, 'towndecor');
  });
  it('stage 2 opens Paint; Traffic stays locked; stage 3 and Show every tool now lock nothing', () => {
    assert.deepEqual(railEntries(uiOf(played(1), 1), true, 'select').filter(e => e.locked).map(e => e.item.id), ['traffic']);
    assert.equal(toolLock(uiOf(played(1), 1), 'paint'), null);
    assert.deepEqual(railEntries(uiOf(played(3), 3), true, 'select').filter(e => e.locked), []);
    const adv = played(0); adv.advanced = true;
    assert.deepEqual(railEntries(uiOf(adv, 0), true, 'select').filter(e => e.locked || e.isNew), []);
  });
});

describe('no key letters on the rail; the keys stay in the tooltip (T182)', () => {
  it('the rail draws no key letter; every keyed group names its key in its tooltip', () => {
    const es = railEntries(uiOf(played(3), 3), true, 'select', { range: true }), h = html(es);
    assert.doesNotMatch(h, /rail-key/);
    for (const e of es) assert.equal(railTip(e).key, e.item.key || undefined, e.item.id);
    assert.deepEqual(es.map(e => [e.item.id, e.item.key]), [['select', 'V'], ['range', ''], ['course', 'C'], ['decor', 'Z'], ['traffic', 'R'], ['towndecor', 'A'], ['bulldoze', 'X']]);
    // the tools keep their keys (the engine's keys open them, as before)
    const keyOf = (t: Tool) => RAIL.flatMap(r => r.tools).find(x => x.id === t)!.key;
    assert.deepEqual(['course', 'props', 'road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll', 'paint', 'bulldoze', 'select'].map(t => keyOf(t as Tool)), ['C', 'Z', 'R', 'N', 'Y', 'J', 'U', 'P', 'T', 'A', 'X', 'V']);
  });
});

describe('NEW per group; old saves (T117 seen ids, T182)', () => {
  it('stage 2: Town decoration says NEW (its Paint) until Paint is opened, then never again (Course: its Greenkeeping, T175)', () => {
    const p = played(1);
    assert.deepEqual(railEntries(uiOf(p, 1), true, 'course').filter(e => e.isNew).map(e => e.item.id), ['course', 'towndecor']);
    assert.match(button(html(railEntries(uiOf(p, 1), true, 'course')), 'towndecor'), /class="new-badge rail-new">NEW</);
    advanceProgress(p, progressFacts(p, course(1)), 'paint');
    assert.deepEqual(railEntries(uiOf(p, 1), true, 'course').filter(e => e.isNew).map(e => e.item.id), ['course']);
    advanceProgress(p, progressFacts(p, course(1)), 'greenkeeping');
    assert.deepEqual(railEntries(uiOf(p, 1), true, 'course').filter(e => e.isNew).map(e => e.item.id), []);
  });
  it('stage 3: Traffic says NEW until one of its tools is opened; the row keeps the others\' own NEW until they are', () => {
    const p = played(3, ['paint', 'greenkeeping']);
    assert.deepEqual(railEntries(uiOf(p, 3), true, 'select').filter(e => e.isNew).map(e => e.item.id), ['traffic']);
    advanceProgress(p, progressFacts(p, course(3)), 'road');
    const ui = uiOf(p, 3);
    assert.deepEqual(railEntries(ui, true, 'road').filter(e => e.isNew).map(e => e.item.id), []);
    assert.equal(toolNew(ui, 'road'), false); assert.equal(toolNew(ui, 'lane'), true); assert.equal(toolNew(ui, 'junction'), true);
  });
  it("an old save's seen ids (tools and the old groups) map to the new groups: nothing it opened says NEW again", () => {
    const p = played(3); p.seen.push('paint', 'greenkeeping', 'road', 'roads', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll', 'transport');
    assert.deepEqual(railEntries(uiOf(p, 3), true, 'select').filter(e => e.isNew), []);
    for (const t of ['paint', 'road', 'lane', 'junction', 'bus', 'park', 'toll'] as Tool[]) assert.equal(toolNew(uiOf(p, 3), t), false, t);
  });
  it('a locked group never says NEW', () => {
    assert.ok(railEntries(uiOf(played(1), 1), true, 'select').filter(e => e.locked).every(e => !e.isNew));
  });
});
