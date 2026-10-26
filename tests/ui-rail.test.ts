// Headless tests for the rail (plan P23 4.2, P1-E, T120): the same places at every stage, locked tools dimmed in place with what unlocks
// them, and NEW badges that clear once the tool is opened. npm test (bundled by esbuild, run by node --test; the buttons render with
// react-dom/server).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { railEntries, toolNew, type RailEntry } from '../src/ui/rail-items';
import { Rail } from '../src/ui/Rail';

const GOLF_RAIL = ['select', 'holes', 'paths', 'buildings', 'props', 'roads', 'junction', 'transport', 'paint', 'bulldoze'];
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

describe('the rail keeps the same places at every stage (P23 4.2)', () => {
  it('Select · Course: Holes, Paths, Buildings, Props · Town: Roads, Junctions, Transport · Paint · Bulldoze, at stages 1, 2 and 3 and with every tool shown', () => {
    for (const [holes, adv] of [[0, false], [1, false], [3, false], [0, true]] as const) {
      const p = played(holes); p.advanced = adv;
      const es = railEntries(uiOf(p, holes), true, 'select');
      assert.deepEqual(ids(es), GOLF_RAIL, `holes ${holes}, every tool ${adv}`);
      assert.deepEqual(es.filter(e => e.heading).map(e => [e.item.id, e.heading]), [['holes', 'course'], ['roads', 'town']]);
    }
  });

  it('the classic town game has the Business tool and no Buildings (the clubhouse is golf only), nothing locked', () => {
    const es = railEntries(null, false, 'road');
    assert.ok(ids(es).includes('business') && !ids(es).includes('buildings'));
    assert.ok(es.every(e => !e.locked && !e.isNew));
    assert.equal(es.find(e => e.on)?.item.id, 'roads');
  });

  it('the tool in hand lights its item: the road tool on the course is Paths, the course tool\'s clubhouse scope Buildings', () => {
    const ui = uiOf(played(0), 0);
    assert.equal(railEntries(ui, true, 'course').find(e => e.on)?.item.id, 'holes');
    assert.equal(railEntries(ui, true, 'path').find(e => e.on)?.item.id, 'paths');
    assert.equal(railEntries(ui, true, 'buildings').find(e => e.on)?.item.id, 'buildings');
    assert.equal(railEntries(ui, true, 'lane').find(e => e.on)?.item.id, 'roads');
  });
});

describe('locked tools stay in place, dimmed, with what unlocks them (P23 4.2)', () => {
  it('stage 1: Roads, Junctions, Transport and Paint render dimmed with a lock and their "Unlocks with …"; Holes, Paths and Buildings are open', () => {
    const es = railEntries(uiOf(played(0), 0), true, 'course'), h = html(es);
    assert.deepEqual(es.filter(e => e.locked).map(e => [e.item.id, e.locked]), [
      ['roads', "Unlocks with your third hole or the tour's invitation"],
      ['junction', "Unlocks with your third hole or the tour's invitation"],
      ['transport', "Unlocks with your third hole or the tour's invitation"],
      ['paint', 'Unlocks with your first hole'],
    ]);
    const paint = button(h, 'paint');
    assert.match(paint, /class="[^"]*rail-tab-locked/, 'Paint is dimmed');
    assert.match(paint, /aria-disabled="true"/);
    assert.match(paint, /title="Paint · Unlocks with your first hole"/);
    assert.match(paint, /aria-label="Paint: Unlocks with your first hole"/);
    assert.match(paint, /class="rail-lock"/, 'with its lock');
    assert.match(button(h, 'roads'), /title="Roads · Unlocks with your third hole or the tour&#x27;s invitation"/);
    for (const id of ['select', 'holes', 'paths', 'buildings', 'props', 'bulldoze']) {
      assert.doesNotMatch(button(h, id), /rail-tab-locked|aria-disabled/, id);
    }
    assert.match(button(h, 'holes'), /class="rail-tab rail-tab-on/, 'Holes is the tool in hand');
  });

  it('a click on a locked item says why and opens nothing; an open one opens', () => {
    const es = railEntries(uiOf(played(0), 0), true, 'course');
    let picked = '', said = '';
    const tree = Rail({ entries: es, onPick: r => { picked = r.id; }, onLocked: (r, why) => { said = `${r.id}: ${why}`; } });
    /** the rail item's button element (the Rail is a plain function component: its element tree is walked, no DOM) */
    const find = (id: string): ReactElement<{ onClick: () => void }> => {
      const walk = (n: unknown): ReactElement<{ onClick: () => void }> | null => {
        if (Array.isArray(n)) { for (const c of n) { const f = walk(c); if (f) return f; } return null; }
        if (!isValidElement(n)) return null;
        const props = n.props as { 'data-rail'?: string; children?: unknown };
        return props['data-rail'] === id ? (n as ReactElement<{ onClick: () => void }>) : walk(props.children);
      };
      return walk(tree)!;
    };
    find('paint').props.onClick();
    assert.equal(picked, '');
    assert.equal(said, 'paint: Unlocks with your first hole');
    find('buildings').props.onClick();
    assert.equal(picked, 'buildings');
  });

  it('stage 2 opens Paint; the town tools stay locked in place; stage 3 and Show every tool now lock nothing', () => {
    assert.deepEqual(railEntries(uiOf(played(1), 1), true, 'select').filter(e => e.locked).map(e => e.item.id), ['roads', 'junction', 'transport']);
    assert.deepEqual(railEntries(uiOf(played(3), 3), true, 'select').filter(e => e.locked), []);
    const adv = played(0); adv.advanced = true;
    assert.deepEqual(railEntries(uiOf(adv, 0), true, 'select').filter(e => e.locked || e.isNew), []);
  });
});

describe('NEW badges clear once the tool is opened (P23 4.2, T117 seen ids)', () => {
  it('stage 2: Paint carries NEW until it is first opened, then never again', () => {
    let p = played(1);
    let h = html(railEntries(uiOf(p, 1), true, 'course'));
    assert.match(button(h, 'paint'), /class="new-badge rail-new">NEW</);
    assert.match(button(h, 'paint'), /aria-label="Paint \(new\)"/);
    assert.doesNotMatch(button(h, 'holes'), /NEW/, 'stage-1 tools never carry NEW');
    // the player opens Paint (the engine counts the tool in hand: progressCheck -> advanceProgress)
    assert.equal(advanceProgress(p, progressFacts(p, course(1)), 'paint'), true);
    assert.ok(p.seen.includes('paint'));
    h = html(railEntries(uiOf(p, 1), true, 'course'));
    assert.doesNotMatch(button(h, 'paint'), /NEW/);
    // and it stays gone after a save and load
    p = played(1, ['paint']);
    assert.doesNotMatch(button(html(railEntries(uiOf(p, 1), true, 'select')), 'paint'), /NEW/);
  });

  it('stage 3: Roads, Junctions and Transport say NEW; opening Roads clears its badge, and its Upgrade and Downgrade keep theirs until opened', () => {
    const p = played(3, ['paint']);
    const es = railEntries(uiOf(p, 3), true, 'select');
    assert.deepEqual(es.filter(e => e.isNew).map(e => e.item.id), ['roads', 'junction', 'transport']);
    advanceProgress(p, progressFacts(p, course(3)), 'road');
    const ui = uiOf(p, 3);
    assert.deepEqual(railEntries(ui, true, 'road').filter(e => e.isNew).map(e => e.item.id), ['junction', 'transport']);
    assert.equal(toolNew(ui, 'road'), false);
    assert.equal(toolNew(ui, 'lane'), true, "the panel's Upgrade still says NEW");
    advanceProgress(p, progressFacts(p, course(3)), 'lane');
    assert.equal(toolNew(uiOf(p, 3), 'lane'), false);
  });

  it('a locked tool never says NEW', () => {
    const es = railEntries(uiOf(played(1), 1), true, 'select');
    assert.ok(es.filter(e => e.locked).every(e => !e.isNew));
  });
});
