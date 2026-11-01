// Headless tests for the rail (plan P23 4.2, P1-E, T120; regrouped by T182, #454; T206 #540: Facilities in Decoration's place, Cart paths & roads
// in Course below Buildings): Select · COURSE: Driving range, Course, Facilities · TOWN:
// Traffic, Town decoration · Bulldoze; every tool reachable from its group (Props from both decorations); the ramp's locks per group and per
// tool inside a group; NEW per group; no key letters on the rail (the tooltip names them); old saves' seen ids. T250 (#721): the rail split
// into the course drawer on the left and the town footer along the bottom, and where the footer stands. T255 (#739): a town tool's panel docks
// above the footer, a club tool's keeps the left panel, the shared tools' follow the group they were opened from, and where the footer panel
// stands. npm test (bundled by esbuild, run by node --test; the buttons render with react-dom/server).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, STAGE_WHY, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { readFileSync } from 'node:fs';
import { RAIL, drawerEntries, drawerOf, extraLock, pickTool, railEntries, railItemOf, railItemsOf, railTip, toolDrawer, toolLock, toolNew, toolSections, toolsIn, type RailEntry } from '../src/ui/rail-items';
import { FOOT_GAP, FOOT_MARGIN, PANEL_W, footerPlace, freeStretches, panelPlace, type FootPlace } from '../src/ui/footer-layout';
import { Rail } from '../src/ui/Rail';
import { TownFooter } from '../src/ui/TownFooter';
import type { Tool } from '../src/game/types';
import { GREENKEEPING } from '../src/game/features';

const GOLF_RAIL = ['select', 'course', 'facilities', 'ground', 'traffic', 'towndecor', 'bulldoze'];
/** the classic town game: Facilities holds golf tools only, so it is not on its rail */
const TOWN_RAIL = ['select', 'course', 'traffic', 'towndecor', 'bulldoze'];
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
/** every tool a rail item holds: greenkeeping is in none while GREENKEEPING is off (features.ts) */
const ALL_TOOLS: Tool[] = (['select', 'road', 'junction', 'bulldoze', 'park', 'toll', 'bus', 'lane', 'downgrade', 'business', 'paint', 'course', 'path', 'buildings', 'props', 'greenkeeping', 'practice'] as Tool[]).filter(t => GREENKEEPING || t !== 'greenkeeping');

describe('the rail: the groups, in the same places at every stage (T182)', () => {
  it('golf: Select · Course: Driving range, Course, Facilities · Town: Traffic, Town decoration · Bulldoze, at every stage', () => {
    for (const [holes, adv] of [[0, false], [1, false], [3, false], [0, true]] as const) {
      const p = played(holes); p.advanced = adv;
      assert.deepEqual(ids(railEntries(uiOf(p, holes), true, 'select')), GOLF_RAIL, `holes ${holes}, every tool ${adv}`);
      const es = railEntries(uiOf(p, holes), true, 'select', { range: true });
      assert.deepEqual(ids(es), ['select', 'range', ...GOLF_RAIL.slice(1)], 'a range start: the Driving range first under Course');
      assert.deepEqual(es.filter(e => e.heading).map(e => [e.item.id, e.heading]), [['range', 'course'], ['ground', 'town']]);
    }
  });
  it('the classic town game: no range, no golf-only tools; its Business tool under Town decoration; nothing locked', () => {
    const es = railEntries(null, false, 'road');
    assert.deepEqual(ids(es), TOWN_RAIL);
    assert.ok(es.every(e => !e.locked && !e.isNew));
    assert.equal(es.find(e => e.on)?.item.id, 'traffic');
    const town = RAIL.find(r => r.id === 'towndecor')!;
    assert.deepEqual(toolsIn(town, false).map(t => t.id), ['paint', 'business']);
    assert.deepEqual(toolsIn(town, true).map(t => t.id), ['paint', 'props', 'props'], 'T187: its Props and its Buildings (the Props tool town views)');
    assert.deepEqual(toolsIn(RAIL.find(r => r.id === 'course')!, false).map(t => t.id), ['course', 'path'], 'T206: its cart paths and drives in Course');
  });
  it('every tool is reachable from exactly one group (Props from Facilities and Town decoration, Paint from Town decoration and Facilities\' Plants), and the groups hold what the owner asked', () => {
    for (const t of ALL_TOOLS) {
      const n = railItemsOf(t).length;
      assert.equal(n, t === 'props' || t === 'paint' || t === 'course' ? 2 : 1, t); // Course: Holes, and the footer's Ground height (its height brush)
    }
    const tools = (id: string) => RAIL.find(r => r.id === id)!.tools.map(t => t.id);
    assert.deepEqual(tools('course'), GREENKEEPING ? ['course', 'buildings', 'path', 'greenkeeping'] : ['course', 'buildings', 'path'], 'T206: Cart paths & roads directly below Buildings');
    assert.deepEqual(RAIL.find(r => r.id === 'course')!.extras?.map(x => x.id), ['event', 'land'], 'the tournament stuff: the Event catalogue; T200: Land for sale');
    assert.deepEqual(tools('facilities'), ['practice', 'paint', 'props'], 'T206: Practice, Plants, Decoration (Props)');
    assert.equal(RAIL.find(r => r.id === 'decor'), undefined, 'Decoration is no group of the rail');
    assert.deepEqual(tools('traffic'), ['road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll']);
    assert.deepEqual(toolSections(RAIL.find(r => r.id === 'traffic')!, true).map(s => [s.sub, s.tools.length]), [['Roads', 3], ['Junctions', 1], ['Transport', 3]]);
    assert.equal(RAIL.find(r => r.id === 'range')!.action, 'range');
  });
  it('the tool in hand lights its group; Props lights the decoration it was opened from; the open range card lights the Driving range', () => {
    const ui = uiOf(played(3), 3);
    const lit = (t: Tool, active?: string, rangeOpen = false) => railEntries(ui, true, t, { active, range: true, rangeOpen }).filter(e => e.on).map(e => e.item.id);
    assert.deepEqual(lit('course'), ['course']); assert.deepEqual(lit('buildings'), ['course']); assert.deepEqual(lit('greenkeeping'), GREENKEEPING ? ['course'] : [], 'hidden: no rail item holds it');
    assert.deepEqual(lit('path'), ['course']); assert.deepEqual(lit('lane'), ['traffic']); assert.deepEqual(lit('toll'), ['traffic']); assert.deepEqual(lit('paint'), ['towndecor']);
    assert.deepEqual(lit('paint', 'facilities'), ['facilities'], 'T206: the plant brush opened from Facilities lights it'); assert.deepEqual(lit('practice'), ['facilities']);
    assert.deepEqual(lit('props'), ['facilities']); assert.deepEqual(lit('props', 'towndecor'), ['towndecor']); assert.deepEqual(lit('props', 'facilities'), ['facilities']);
    assert.deepEqual(lit('select', undefined, true), ['range']);
    assert.equal(railItemOf('props', 'towndecor')?.id, 'towndecor'); assert.equal(railItemOf('props', 'traffic')?.id, 'facilities', 'an item that does not hold it: its first');
    assert.equal(railItemOf('paint', 'traffic')?.id, 'towndecor', 'its first that is not a second home');
  });
});

describe("the ramp's locks per group and inside a group (T182)", () => {
  it('stage 1: Traffic is locked in place with what unlocks it; Course, Facilities and Town decoration are open, their locked tools locked inside', () => {
    const ui = uiOf(played(0), 0), es = railEntries(ui, true, 'course'), h = html(es);
    assert.deepEqual(es.filter(e => e.locked).map(e => [e.item.id, e.locked]), [['traffic', WHY3]]);
    const traffic = button(h, 'traffic');
    assert.match(traffic, /class="[^"]*rail-tab-locked/); assert.match(traffic, /aria-disabled="true"/); assert.match(traffic, /class="rail-lock"/);
    assert.match(traffic, /data-tip="Traffic"/); assert.match(traffic, /data-tip-key="R"/);
    assert.equal(toolLock(ui, 'paint'), STAGE_WHY[2], 'Paint locked inside Town decoration');
    assert.match(toolLock(ui, 'greenkeeping') ?? '', /^Unlocks when your first hole is grown in/, 'Greenkeeping locked inside Course');
    assert.equal(toolLock(ui, 'props'), null); assert.equal(toolLock(ui, 'course'), null); assert.equal(toolLock(ui, 'path'), null);
    for (const id of ['select', 'course', 'facilities', 'towndecor', 'bulldoze']) assert.doesNotMatch(button(h, id), /rail-tab-locked|aria-disabled/, id);
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
    assert.deepEqual(es.map(e => [e.item.id, e.item.key]), [['select', 'V'], ['range', ''], ['course', 'C'], ['facilities', 'Z'], ['ground', ''], ['traffic', 'R'], ['towndecor', 'A'], ['bulldoze', 'X']]);
    // the tools keep their keys (the engine's keys open them, as before)
    const keyOf = (t: Tool) => RAIL.flatMap(r => r.tools).find(x => x.id === t && !x.alt)!.key;
    assert.deepEqual(['course', 'props', 'road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll', 'paint', 'bulldoze', 'select'].map(t => keyOf(t as Tool)), ['C', 'Z', 'R', 'N', 'Y', 'J', 'U', 'P', 'T', 'A', 'X', 'V']);
  });
});

describe('NEW per group; old saves (T117 seen ids, T182)', () => {
  it('stage 2: Town decoration says NEW (its Paint) until Paint is opened, then never again (Course: its Greenkeeping, T175, while it is on the rail)', () => {
    const p = played(1);
    // Course's NEW is its Greenkeeping (T175): no Course NEW while GREENKEEPING is off (features.ts hides that tool)
    assert.deepEqual(railEntries(uiOf(p, 1), true, 'course').filter(e => e.isNew).map(e => e.item.id), GREENKEEPING ? ['course', 'facilities', 'towndecor'] : ['facilities', 'towndecor'], 'T206: Facilities too (its Plants, the Paint tool\'s plant brush)');
    assert.match(button(html(railEntries(uiOf(p, 1), true, 'course')), 'towndecor'), /class="new-badge rail-new">NEW</);
    advanceProgress(p, progressFacts(p, course(1)), 'paint');
    assert.deepEqual(railEntries(uiOf(p, 1), true, 'course').filter(e => e.isNew).map(e => e.item.id), GREENKEEPING ? ['course'] : []);
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

describe('the rail keeps its icons; the tiles are the flyouts\' (T233)', () => {
  it('the rail draws one icon per group and no tool tile (the illustrated tiles show in the Course and Facilities flyouts, ui-flyouts)', () => {
    const es = railEntries(null, true, 'select', { range: true }), h = html(es);
    assert.doesNotMatch(h, /flyout-pic|data-tile|assets\/ui\/tiles/);
    assert.equal((h.match(/<img /g) ?? []).length, es.length, 'one icon a group');
    // the rail's groups and their tools are as they were: the tiles add no tool and move none
    assert.deepEqual(RAIL.map(r => [r.id, r.tools.map(t => t.id).join(' ')]), [
      ['select', 'select'], ['range', 'select'], ['course', `course buildings path${GREENKEEPING ? ' greenkeeping' : ''}`], ['facilities', 'practice paint props'],
      ['ground', 'course'], ['traffic', 'road lane downgrade junction bus park toll'], ['towndecor', 'paint props props business'], ['bulldoze', 'bulldoze'],
    ]);
  });
});

// T250 (#721, the owner 2026-10-28: "lets have course on the left drawer and have a new footer drawer for town"): the rail split in two: the
// course drawer on the left (Select · COURSE · Bulldoze) and the town footer along the bottom (TOWN: Traffic, Town decoration); the groups, their
// tools, locks, NEW badges and anchors are the same in both
describe('the two drawers: the course drawer on the left, the town footer along the bottom (T250)', () => {
  const side = (es: RailEntry[]) => ids(drawerEntries(es, 'side')), foot = (es: RailEntry[]) => ids(drawerEntries(es, 'footer'));
  const draw = (es: RailEntry[], drawer: 'side' | 'footer', compact = false) => renderToStaticMarkup(createElement(Rail, { entries: drawerEntries(es, drawer), drawer, compact, onPick: () => {}, onLocked: () => {} }));
  it('golf: Select · Course: Driving range, Course, Facilities · Bulldoze on the left; Town: Traffic, Town decoration in the footer; the classic game alike', () => {
    const es = railEntries(null, true, 'select', { range: true });
    assert.deepEqual(side(es), ['select', 'range', 'course', 'facilities', 'bulldoze']);
    assert.deepEqual(foot(es), ['ground', 'traffic', 'towndecor'], 'the owner, 2026-11-01: Ground height next to Traffic');
    assert.deepEqual(side(railEntries(null, true, 'select')), ['select', 'course', 'facilities', 'bulldoze'], 'no range: the Course group first under Course');
    const town = railEntries(null, false, 'road');
    assert.deepEqual(side(town), ['select', 'course', 'bulldoze'], 'the classic town game: its Course group on the left');
    assert.deepEqual(foot(town), ['traffic', 'towndecor'], 'the classic town game shows the footer with its town tools');
    assert.equal(drawerEntries(town, 'footer').find(e => e.on)?.item.id, 'traffic', 'the road in hand lights Traffic in the footer');
    // every group in exactly one drawer, by its section; the drawers together are the rail
    for (const r of RAIL) assert.equal(drawerOf(r), r.section === 'town' ? 'footer' : 'side', r.id);
    for (const g of [es, town]) assert.deepEqual([...side(g), ...foot(g)].sort(), ids(g).sort());
    // each drawer's first item under a heading carries it
    assert.deepEqual(drawerEntries(es, 'side').filter(e => e.heading).map(e => [e.item.id, e.heading]), [['range', 'course']]);
    assert.deepEqual(drawerEntries(es, 'footer').filter(e => e.heading).map(e => [e.item.id, e.heading]), [['ground', 'town']]);
  });
  it('drawn: the course drawer (no heading words: a rule after Select, Bulldoze set off by a rule) and the footer (no heading; icon and name side by side; compact: the icons alone)', () => {
    const es = railEntries(null, true, 'select', { range: true }), s = draw(es, 'side'), f = draw(es, 'footer'), c = draw(es, 'footer', true);
    assert.match(s, /^<nav class="glass rail-nav[^"]*" aria-label="Club tools" data-testid="rail" data-drawer="side">/);
    assert.doesNotMatch(s, /rail-heading|>Course<\/div>/, 'no heading words (the owner)'); assert.doesNotMatch(s, /data-rail="(traffic|towndecor)"/);
    assert.match(s, /data-rail="select"[\s\S]*?<div class="rail-sep" aria-hidden="true"><\/div><button data-rail="range"/, 'a rule between Select and the Course groups');
    assert.match(s, /data-rail="facilities"[\s\S]*?<div class="rail-sep" aria-hidden="true"><\/div><button data-rail="bulldoze"/, 'a rule between Facilities and Bulldoze');
    assert.match(f, /^<nav class="glass rail-foot " aria-label="Town tools" data-testid="rail-footer" data-drawer="footer" data-compact="false">/);
    assert.doesNotMatch(f, /rail-heading|>Town<\/div>/, 'no heading words (the owner)');
    assert.doesNotMatch(f, /data-rail="(select|range|course|facilities|bulldoze)"/);
    for (const [id, label] of [['traffic', 'Traffic'], ['towndecor', 'Town decoration']] as const) {
      assert.match(button(f, id), new RegExp(`class="rail-tab rail-tab-foot [^"]*"[^>]*>[\\s\\S]*?<img [^>]*width="24"[\\s\\S]*?<span>${label}</span>`), `${id}: its icon beside its name`);
      // the guide's Show me finds the town tools in the footer (data-guide="rail-<id>"; GuidePulse's 'tool-park' falls back to 'rail-traffic')
      assert.match(button(f, id), new RegExp(`data-guide="rail-${id}"`));
      // compact: no name drawn, the name kept for the screen reader and the tooltip
      const b = button(c, id);
      assert.doesNotMatch(b, /<span>/); assert.match(b, new RegExp(`aria-label="${label}"`)); assert.match(b, new RegExp(`data-tip="${label}"`));
    }
    assert.match(c, /class="glass rail-foot rail-foot-compact"[^>]*data-compact="true"/);
    // never scrolls sideways; one height in both forms (the controls above it stand on --foot-top)
    const css = readFileSync('src/index.css', 'utf8');
    assert.match(css, /\.rail-tab\.rail-tab-foot \{[^}]*height: 42px;/);
    assert.match(css, /\.rail-foot-compact \.rail-tab\.rail-tab-foot \{ width: 46px;/);
    assert.doesNotMatch(css.match(/\.rail-foot \{[^}]*\}/)?.[0] ?? '', /overflow-x: (auto|scroll)/);
    // T255: the hint bar stands above the footer and above a town tool's panel docked on it (--foot-stack: TownFooter sets both)
    assert.match(readFileSync('src/App.tsx', 'utf8'), /bottom-\[calc\(var\(--foot-stack,0px\)\+0\.5rem\)\][^"]*z-20 flex flex-col items-center/, 'the hint bar stands above the footer');
  });
  it('locks and NEW in the footer as on the rail: stage 1 Traffic locked in place with its why; stage 2 Town decoration says NEW', () => {
    const f1 = draw(railEntries(uiOf(played(0), 0), true, 'course'), 'footer'), traffic = button(f1, 'traffic');
    assert.match(traffic, /rail-tab-locked/); assert.match(traffic, /aria-disabled="true"/); assert.match(traffic, /class="rail-lock"/);
    assert.match(traffic, new RegExp(`data-tip-why="${WHY3.replace(/'/g, '&#x27;')}"`));
    const s2 = railEntries(uiOf(played(1), 1), true, 'course');
    assert.match(button(draw(s2, 'footer'), 'towndecor'), /class="new-badge rail-new">NEW</);
    assert.match(button(draw(s2, 'footer', true), 'towndecor'), /class="new-badge rail-new">NEW</, 'compact keeps the badge');
  });
});

// T250: where the footer stands (footer-layout.ts): it moves aside: the free stretch of the bottom edge nearest the right corner (the owner,
// 2026-10-29: "move center footer menu to the right corner"), full where it fits, else compact; only on a crowded screen do the cards in its way move up
describe('the town footer moves aside of the minimap and the bottom cards (T250)', () => {
  const FULL = 300, COMPACT = 116, MINI = 400;
  const at = (w: number, blocks: [number, number][] = []) => footerPlace({ w, laneL: MINI, blocks, full: FULL, compact: COMPACT });
  const clear = (p: FootPlace, w: number, blocks: [number, number][]) => {
    const width = p.compact ? COMPACT : FULL;
    assert.ok(p.x >= MINI + FOOT_GAP, `clear of the minimap (${p.x})`); assert.ok(p.x + width <= w - FOOT_MARGIN, 'on screen');
    for (const [l, r] of blocks) assert.ok(p.x + width <= l || p.x >= r, `clear of the card at ${l}-${r} (${p.x}-${p.x + width})`);
  };
  it('1366, 1920 and 2560 px with no bottom card: full, in the bottom right corner', () => {
    for (const w of [1366, 1920, 2560]) { const p = at(w); assert.deepEqual(p, { x: w - FOOT_MARGIN - FULL, compact: false, lift: [] }, `${w}`); clear(p, w, []); }
  });
  it('beside the guide card and the leaderboard at their places (right-3, beside the range card, beside a panel): never over them', () => {
    for (const w of [1366, 1920, 2560]) for (const right of [12, 312, 368]) for (const width of [330, 288]) {
      const blocks: [number, number][] = [[w - right - width, w - right]], p = at(w, blocks);
      clear(p, w, blocks);
      // by the corner: right of the card, full where it fits there, else compact; with no room right of it, full just left of it
      const room = right - FOOT_GAP - FOOT_MARGIN;
      if (room >= FULL) assert.deepEqual(p, { x: w - FOOT_MARGIN - FULL, compact: false, lift: [] }, `${w}: full in the corner (${right}, ${width})`);
      else if (room >= COMPACT) assert.deepEqual(p, { x: w - FOOT_MARGIN - COMPACT, compact: true, lift: [] }, `${w}: compact in the corner (${right}, ${width})`);
      else assert.deepEqual(p, { x: w - right - width - FOOT_GAP - FULL, compact: false, lift: [] }, `${w}: full left of the card (${right}, ${width})`);
    }
    // 1366 with the range card open: the guide card beside it (right-23rem): the full bar in the corner right of it
    const busy: [number, number][] = [[1366 - 368 - 330, 1366 - 368]], p = at(1366, busy);
    assert.deepEqual(p, { x: 1354 - FULL, compact: false, lift: [] }); clear(p, 1366, busy);
    assert.deepEqual(freeStretches({ w: 1366, laneL: MINI, blocks: busy }), [[410, 658], [1008, 1354]]);
  });
  it('the last resort: no room on the bottom edge even for the compact bar: compact in the corner, the cards in its way move up', () => {
    const w = 1093; // 125% UI on a 1366 px screen
    const p = at(w, [[90, w - 12]]);
    assert.equal(p.compact, true); assert.deepEqual(p.lift, [0]);
    assert.ok(p.x >= MINI + FOOT_GAP && p.x + COMPACT <= w - FOOT_MARGIN, 'clear of the minimap, on screen'); assert.equal(p.x, w - FOOT_MARGIN - COMPACT, 'in the corner');
    // a panel, the range card and the guide card beside them (right-41rem), the leaderboard at the right: a stretch between holds the compact bar
    const blocks: [number, number][] = [[w - 656 - 330, w - 656], [w - 12 - 288, w - 12]], q = at(w, blocks);
    assert.equal(q.lift.length, 0, 'no card moves'); clear(q, w, blocks);
  });
});

// T255 (#739, the owner 2026-10-29, of the Upgrade roads panel in the left tool panel: "these windows need to move to the center footer where
// town moved to"): a tool's panel stands in the drawer its group sits in; Paint and Props, in both, follow the group they were opened from
describe("a tool's panel stands in its group's drawer: a town tool's above the footer, a club tool's in the left panel (T255)", () => {
  const TOWN: Tool[] = ['road', 'lane', 'downgrade', 'junction', 'bus', 'park', 'toll', 'business'];
  it('the road panels (Build, Upgrade, Downgrade), Junctions, Transport (bus, car park, toll) and Town decoration dock above the footer; the club tools, Select and Bulldoze keep the left panel', () => {
    for (const t of TOWN) assert.equal(toolDrawer(t), 'footer', t);
    for (const t of ALL_TOOLS.filter(x => !TOWN.includes(x) && x !== 'paint' && x !== 'props')) assert.equal(toolDrawer(t), 'side', t);
    assert.deepEqual(['select', 'course', 'path', 'buildings', 'practice', 'bulldoze'].map(t => toolDrawer(t as Tool)), Array(6).fill('side'));
    assert.equal(toolDrawer('paint'), 'footer', "Paint is Town decoration's (Facilities' Plants is its second home)");
    assert.equal(toolDrawer('props'), 'side', 'Props opens with Facilities first');
  });
  it("Paint and Props follow the group they were opened from (the rail's lit group, active), in the golf and the classic game", () => {
    assert.equal(toolDrawer('paint', 'facilities'), 'side', 'Facilities ▸ Plants: the left panel'); assert.equal(toolDrawer('paint', 'towndecor'), 'footer');
    assert.equal(toolDrawer('props', 'towndecor'), 'footer', 'Town decoration ▸ Props: above the footer'); assert.equal(toolDrawer('props', 'facilities'), 'side');
    assert.equal(toolDrawer('paint', 'traffic'), 'footer', 'a group that does not hold it: its own'); assert.equal(toolDrawer('props', 'course'), 'side');
    // the panel always stands in the drawer of the group the rail lights, whichever group was opened last
    for (const golf of [true, false]) for (const t of ALL_TOOLS) for (const active of [null, ...RAIL.map(r => r.id)]) {
      const on = railEntries(null, golf, t, { active, range: golf }).find(e => e.on);
      if (on) assert.equal(toolDrawer(t, active), drawerOf(on.item), `${golf ? 'golf' : 'classic'} ${t} opened from ${active}`);
    }
  });
  it("drawn: one panel body in one of two containers: the left tool panel, or the footer panel (the left one's width and look, opening upward, scrolling vertically only)", () => {
    const ref = { current: null }, foot = (panel: { tool: string; body: ReactElement } | null, raised = false) => renderToStaticMarkup(createElement(TownFooter, {
      entries: drawerEntries(railEntries(null, true, 'lane'), 'footer'), onPick: () => {}, onLocked: () => {}, boxRef: ref, navRef: ref, panel, raised,
    }));
    const body = createElement('p', null, 'Upgrade roads'), f = foot({ tool: 'lane', body });
    assert.match(f, /<div class="glass tool-panel tool-panel-foot pointer-events-auto w-\[330px\] overflow-y-auto overflow-x-hidden p-3 "[^>]*data-tool="lane" data-testid="tool-panel" data-dock="footer"[^>]*><p>Upgrade roads<\/p><\/div>/);
    assert.match(foot({ tool: 'lane', body }, true), /tool-panel-foot [^"]* hidden"/, "the footer's flyouts open where it stands: it makes way");
    assert.doesNotMatch(foot(null), /tool-panel/, 'a club tool in hand: no footer panel');
    const app = readFileSync('src/App.tsx', 'utf8');
    assert.match(app, /const dock = toolDrawer\(game\.uiTool, activeRail\.current\)/);
    assert.match(app, /panel=\{dock === 'footer' && !idle \? \{ tool: game\.uiTool, body: toolBody \} : null\}/);
    assert.match(app, /\{dock === 'side' && \([\s\S]{0,40}<div className=\{`glass tool-panel w-\[330px\][^`]*overflow-y-auto overflow-x-hidden[^`]*`\}[^>]*data-dock="side">\s*\{toolBody\}/);
    // the panels' JSX is written once (the crumb, its back arrow and every tool's panel are toolBody's)
    for (const tag of ['data-testid="tool-crumb"', '<RoadPanel game={game} scope="town"', '<JunctionPanel', '<ParkPanel', '<BusPanel', '<TollPanel', '<PaintPanel', '<PropsPanel', 'title="Upgrade roads"'])
      assert.equal(app.split(tag).length - 1, 1, tag);
    const css = readFileSync('src/index.css', 'utf8'), rule = css.match(/\.tool-panel-foot \{[^}]*\}/)?.[0] ?? '';
    assert.match(rule, /position: absolute; bottom: calc\(100% \+ 8px\);/, 'docked above the footer, opening upward');
    assert.match(rule, /max-height: min\(calc\(var\(--vh-ui, 100vh\) - var\(--hud-top, 5\.75rem\) - var\(--foot-top, 0px\) - 1rem\), calc\(var\(--vh-ui, 100vh\) \* 0\.6\)\)/);
    assert.doesNotMatch(rule, /overflow-x: (auto|scroll)/);
    assert.match(readFileSync('src/ui/ShotPanel.tsx', 'utf8'), /bottom-\[calc\(var\(--foot-stack,0px\)\+0\.75rem\)\]/, 'the shot panel stands above it too');
  });
});

// T255: where the footer panel stands (footer-layout.ts panelPlace): centred on the footer where that is clear, else moved aside to the free
// stretch nearest the footer's middle that holds it, never over the minimap or a card; with no room, in the left tool panel's place (null)
describe('the footer panel moves aside of the minimap and the cards, like the footer (T255)', () => {
  const MAP: [number, number] = [12, 225];
  const at = (w: number, cx: number, blocks: [number, number][] = []) => panelPlace({ w, laneL: 0, blocks: [MAP, ...blocks], cx, width: PANEL_W });
  const clear = (x: number | null, w: number, blocks: [number, number][]) => {
    assert.notEqual(x, null); const l = x!, r = l + PANEL_W;
    assert.ok(l >= FOOT_MARGIN && r <= w - FOOT_MARGIN, `on screen (${l}-${r})`);
    for (const [a, b] of [MAP, ...blocks]) assert.ok(r + FOOT_GAP <= a || l >= b + FOOT_GAP, `clear of ${a}-${b} (${l}-${r})`);
  };
  it('1366, 1920 and 2560 px with no card beside it: centred on the footer', () => {
    for (const w of [1366, 1920, 2560]) { const x = at(w, w / 2); assert.equal(x, Math.round(w / 2 - PANEL_W / 2), `${w}`); clear(x, w, []); }
    assert.equal(at(1366, 531), 531 - PANEL_W / 2, 'the footer moved aside: the panel stays centred on it');
  });
  it('beside the range card, the guide card and the leaderboard at their places: never over them, as near the footer as they allow', () => {
    // 1366: the range card (right-3, 340 px) and the guide card beside it (right-23rem, 330 px): the stretch between the minimap and the guide card
    const busy: [number, number][] = [[1366 - 12 - 340, 1366 - 12], [1366 - 368 - 330, 1366 - 368]], x = at(1366, 531, busy);
    clear(x, 1366, busy); assert.equal(x, 1366 - 368 - 330 - FOOT_GAP - PANEL_W, 'against the guide card, nearest the footer');
    for (const w of [1366, 1920, 2560]) for (const right of [12, 312, 368]) for (const width of [288, 330, 340]) {
      const blocks: [number, number][] = [[w - right - width, w - right]], p = at(w, w / 2, blocks);
      clear(p, w, blocks);
    }
    // the leaderboard (right-3, w-72) or the guide card at right-3: the panel stays centred
    for (const w of [1366, 1920]) for (const width of [288, 330]) assert.equal(at(w, w / 2, [[w - 12 - width, w - 12]]), Math.round(w / 2 - PANEL_W / 2));
  });
  it("no stretch holds it (125% UI on 1366 with the range card and the guide card): null, it takes the left tool panel's place", () => {
    const w = 1093, busy: [number, number][] = [[w - 12 - 340, w - 12], [w - 368 - 330, w - 368]];
    assert.equal(at(w, w / 2, busy), null);
    assert.notEqual(at(w, w / 2, [[w - 12 - 340, w - 12]]), null, 'the range card alone leaves it room');
  });
});
