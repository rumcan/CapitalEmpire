// Headless tests for the rail (plan P23 4.2, P1-E, T120; regrouped by T182, #454; T206 #540: Facilities in Decoration's place, Cart paths & roads
// in Course below Buildings): Select · COURSE: Driving range, Course, Facilities · TOWN:
// Traffic, Town decoration · Bulldoze; every tool reachable from its group (Props from both decorations); the ramp's locks per group and per
// tool inside a group; NEW per group; no key letters on the rail (the tooltip names them); old saves' seen ids. T250 (#721): the rail split
// into the course drawer on the left and the town footer along the bottom, and where the footer stands. npm test (bundled by esbuild, run by
// node --test; the buttons render with react-dom/server).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { advanceProgress, computeProgressiveUiState, emptyProgress, progressFacts, STAGE_WHY, type CourseProgress, type GolfProgress } from '../src/game/ext/progressive-ui';
import { readFileSync } from 'node:fs';
import { RAIL, drawerEntries, drawerOf, extraLock, pickTool, railEntries, railItemOf, railItemsOf, railTip, toolLock, toolNew, toolSections, toolsIn, type RailEntry } from '../src/ui/rail-items';
import { FOOT_GAP, FOOT_MARGIN, footerPlace, freeStretches, type FootPlace } from '../src/ui/footer-layout';
import { Rail } from '../src/ui/Rail';
import type { Tool } from '../src/game/types';
import { GREENKEEPING } from '../src/game/features';

const GOLF_RAIL = ['select', 'course', 'facilities', 'traffic', 'towndecor', 'bulldoze'];
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
      assert.deepEqual(es.filter(e => e.heading).map(e => [e.item.id, e.heading]), [['range', 'course'], ['traffic', 'town']]);
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
      assert.equal(n, t === 'props' || t === 'paint' ? 2 : 1, t);
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
    assert.deepEqual(es.map(e => [e.item.id, e.item.key]), [['select', 'V'], ['range', ''], ['course', 'C'], ['facilities', 'Z'], ['traffic', 'R'], ['towndecor', 'A'], ['bulldoze', 'X']]);
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
      ['traffic', 'road lane downgrade junction bus park toll'], ['towndecor', 'paint props props business'], ['bulldoze', 'bulldoze'],
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
    assert.deepEqual(foot(es), ['traffic', 'towndecor']);
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
    assert.deepEqual(drawerEntries(es, 'footer').filter(e => e.heading).map(e => [e.item.id, e.heading]), [['traffic', 'town']]);
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
    assert.match(readFileSync('src/App.tsx', 'utf8'), /bottom-\[calc\(var\(--foot-top,0px\)\+0\.5rem\)\][^"]*z-20 flex flex-col items-center/, 'the hint bar stands above the footer');
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

// T250: where the footer stands (footer-layout.ts): it moves aside: the free stretch of the bottom edge nearest the middle, full where it fits,
// else compact; only on a crowded screen do the cards in its way move up
describe('the town footer moves aside of the minimap and the bottom cards (T250)', () => {
  const FULL = 300, COMPACT = 116, MINI = 400;
  const at = (w: number, blocks: [number, number][] = []) => footerPlace({ w, laneL: MINI, blocks, full: FULL, compact: COMPACT });
  const clear = (p: FootPlace, w: number, blocks: [number, number][]) => {
    const width = p.compact ? COMPACT : FULL;
    assert.ok(p.x >= MINI + FOOT_GAP, `clear of the minimap (${p.x})`); assert.ok(p.x + width <= w - FOOT_MARGIN, 'on screen');
    for (const [l, r] of blocks) assert.ok(p.x + width <= l || p.x >= r, `clear of the card at ${l}-${r} (${p.x}-${p.x + width})`);
  };
  it('1366, 1920 and 2560 px with no bottom card: full, centred', () => {
    for (const w of [1366, 1920, 2560]) { const p = at(w); assert.deepEqual(p, { x: Math.round(w / 2 - FULL / 2), compact: false, lift: [] }, `${w}`); clear(p, w, []); }
  });
  it('beside the guide card and the leaderboard at their places (right-3, beside the range card, beside a panel): never over them', () => {
    for (const w of [1366, 1920, 2560]) for (const right of [12, 312, 368]) for (const width of [330, 288]) {
      const blocks: [number, number][] = [[w - right - width, w - right]], p = at(w, blocks);
      clear(p, w, blocks);
      if (w >= 1920) assert.equal(p.compact, false, `${w}: full (${right}, ${width})`);
    }
    // 1366 with the range card open: the guide card beside it (right-23rem) leaves 256 px by the minimap: the compact bar there beats the full
    // bar far off to the right
    const busy: [number, number][] = [[1366 - 368 - 330, 1366 - 368]], p = at(1366, busy);
    assert.equal(p.compact, true); clear(p, 1366, busy); assert.ok(Math.abs(p.x + COMPACT / 2 - 683) < 120, 'near the middle');
    assert.deepEqual(freeStretches({ w: 1366, laneL: MINI, blocks: busy }), [[410, 658], [1008, 1354]]);
  });
  it('the last resort: no room on the bottom edge even for the compact bar: compact near the middle, the cards in its way move up', () => {
    const w = 1093; // 125% UI on a 1366 px screen
    const p = at(w, [[90, w - 12]]);
    assert.equal(p.compact, true); assert.deepEqual(p.lift, [0]);
    assert.ok(p.x >= MINI + FOOT_GAP && p.x + COMPACT <= w - FOOT_MARGIN, 'clear of the minimap, on screen');
    // a panel, the range card and the guide card beside them (right-41rem), the leaderboard at the right: a stretch between holds the compact bar
    const blocks: [number, number][] = [[w - 656 - 330, w - 656], [w - 12 - 288, w - 12]], q = at(w, blocks);
    assert.equal(q.lift.length, 0, 'no card moves'); clear(q, w, blocks);
  });
});
