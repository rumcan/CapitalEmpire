// T188 (P23-UX P2-2, P2-3): the Season card's checklist from facts and its sentences; each Fix arms its tool and names an anchor; every guide
// step's anchor exists on a control (data-guide in the UI's source); engine events move the guide on; the welcome card waits for the first
// baked view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { invitedFacts } from '../src/game/golf/tour';
import { FIX, foundingChecklist, seasonChip, seasonPhase, seasonSentence } from '../src/ui/golf/season';
import { GUIDE, GUIDE_STUCK, RANGE_GUIDE, applyGuideEvent, guideStep, type GuideFacts } from '../src/game/ext/progressive-ui/guide';
import { ANCHOR_FALLBACK, anchorElement } from '../src/ui/GuidePulse';
import { RAIL } from '../src/ui/rail-items';
import { WELCOME_WAIT_MS, allBaked, welcomeReady } from '../src/game/golf/firstview';

test("the founding checklist from the tour's facts: each item's mark and progress", () => {
  const c = invitedFacts({ holes: 3, carpark: true, clubhouse: false });
  assert.deepEqual(foundingChecklist(c).map(i => [i.id, i.ok, i.detail]), [['holes', false, '3 of 9 built'], ['carpark', true, 'Built'], ['clubhouse', false, 'None yet']]);
  assert.ok(foundingChecklist(invitedFacts({ holes: 12, carpark: true, clubhouse: true })).every(i => i.ok));
  assert.equal(foundingChecklist(invitedFacts({ holes: 12, carpark: true, clubhouse: true }))[0]!.detail, '9 of 9 built');
  assert.equal(seasonChip('founding', c), '◔ 3/9 holes'); assert.equal(seasonChip('invited'), '✓ Invited'); assert.equal(seasonChip('tour'), 'Season');
});

test('the season phase and its sentence: a founding season holds no tournament (the old pill said "the end of August")', () => {
  assert.equal(seasonPhase(null, 0), 'tour'); assert.equal(seasonPhase({ invited: false }, 0), 'founding'); assert.equal(seasonPhase({ invited: true }, 0), 'invited'); assert.equal(seasonPhase({ invited: true }, 1), 'tour');
  const c = invitedFacts({ holes: 1, carpark: true, clubhouse: false });
  const f = seasonSentence('founding', { check: c });
  assert.match(f, /no tournament this year/); assert.match(f, /9 holes, a car park and a clubhouse/); assert.match(f, /still to do: 9 holes, a clubhouse/); assert.doesNotMatch(f, /August/);
  assert.match(seasonSentence('invited', { due: true }), /closes this season/); assert.match(seasonSentence('invited', { due: false }), /closes next season/);
  assert.match(seasonSentence('tour', { monthsLeft: 2.2 }), /in 3 months/); assert.match(seasonSentence('tour', { live: true }), /Tournament day/);
});

test('each Fix arms its tool and pulses its anchor', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(FIX).map(([k, v]) => [k, [v.tool, v.anchor]])), { holes: ['course', 'new-hole'], carpark: ['park', 'tool-park'], clubhouse: ['buildings', 'clubhouse-card'] });
  // the engine's armFix: the same tools (New hole, the car park, the clubhouse armed) and anchors
  const eng = readFileSync('src/game/engine.ts', 'utf8'), arm = eng.slice(eng.indexOf('  armFix('), eng.indexOf('\n  }', eng.indexOf('  armFix(')));
  assert.match(arm, /startFirstHole\(\)/); assert.match(arm, /this\.paint\.setPlan\(\)/); assert.match(arm, /setTool\('park'\)/); assert.match(arm, /placeClubhouse\(true\)/);
  for (const v of Object.values(FIX)) assert.ok(arm.includes(`'${v.anchor}'`), v.anchor);
});

/** every data-guide anchor the UI's source sets (literal ones, and the rail's rail-<id> and the group tools' tool-<id>) */
function anchorsInSource(): Set<string> {
  const out = new Set<string>(), walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.tsx')) for (const m of readFileSync(p, 'utf8').matchAll(/data-guide="([^"]+)"/g)) out.add(m[1]!); } };
  walk('src');
  const app = readFileSync('src/App.tsx', 'utf8'), rail = readFileSync('src/ui/Rail.tsx', 'utf8'), card = readFileSync('src/ui/golf/SeasonCard.tsx', 'utf8');
  assert.match(rail, /data-guide=\{`rail-\$\{r\.id\}`\}/); for (const r of RAIL) out.add(`rail-${r.id}`);
  // T193: the group's tools are the flyouts' leaves now (Flyouts.tsx: tool-<id>, the Props tool's group for its Buildings)
  const fly = readFileSync('src/ui/Flyouts.tsx', 'utf8');
  assert.match(fly, /data-guide=\{r\.leaf \? `tool-\$\{r\.leaf\.entry\.view\?\.group \?\? r\.leaf\.entry\.id\}` : undefined\}/); for (const r of RAIL) for (const t of r.tools) out.add(`tool-${t.view?.group ?? t.id}`);
  assert.match(app, /guide="month"/); out.add('month');
  assert.match(card, /data-guide=\{`fix-\$\{it\.id\}`\}/); for (const k of Object.keys(FIX)) out.add(`fix-${k}`);
  return out;
}

test("every guide step's anchor is on a control (and every fallback too)", () => {
  const have = anchorsInSource();
  for (const st of [...GUIDE, ...RANGE_GUIDE, GUIDE_STUCK]) if (st.target.ui) assert.ok(have.has(st.target.ui), `${st.id}: data-guide="${st.target.ui}"`);
  for (const [id, fb] of Object.entries(ANCHOR_FALLBACK)) { assert.ok(have.has(id), id); for (const f of fb) assert.ok(have.has(f), `${id} -> ${f}`); }
  for (const v of Object.values(FIX)) assert.ok(have.has(v.anchor), v.anchor);
  assert.ok(have.has('season-chip') && have.has('range-chip') && have.has('invite-pill') && have.has('results'));
});

test('the pulse finds the first visible element of an anchor, else of its fallback', () => {
  const el = (w: number) => ({ getBoundingClientRect: () => ({ width: w, height: w }) }) as unknown as HTMLElement;
  const shown = el(10), hidden = el(0), rail = el(20);
  const doc = { querySelectorAll: (q: string) => (q === '[data-guide="new-hole"]' ? [hidden] : q === '[data-guide="rail-course"]' ? [rail] : q === '[data-guide="month"]' ? [hidden, shown] : []) } as unknown as Document;
  assert.equal(anchorElement('new-hole', doc), rail, "New hole's panel closed: the Course group");
  assert.equal(anchorElement('month', doc), shown);
  assert.equal(anchorElement('nothing', doc), null);
});

test('engine events move the range guide on at once: a hole built, the clubhouse placed, a car park built', () => {
  const f: GuideFacts = { pieces: 0, roads: 0, parks: 0, structures: 0, kinds: {}, runs: 0, holes: 0, tutorial: 'on', step: 2, start: 'range', clubhouse: false, invited: false };
  assert.equal(guideStep(f)?.id, 'guide-range-hole');
  const a = applyGuideEvent(f, 'hole'); assert.equal(a.holes, 1); assert.equal(guideStep(a)?.id, 'guide-range-clubhouse');
  const b = applyGuideEvent(a, 'clubhouse'); assert.equal(b.clubhouse, true); assert.equal(guideStep(b)?.id, 'guide-range-nine');
  assert.equal(applyGuideEvent(b, 'carpark').parks, 1);
  assert.equal(f.holes, 0, 'the facts before are untouched');
  // the engine raises them where they happen
  const eng = readFileSync('src/game/engine.ts', 'utf8');
  assert.match(eng, /holeBuilt: \(\) => this\.guideEvent\('hole'\)/); assert.match(eng, /this\.guideEvent\('clubhouse'\)/); assert.match(eng, /this\.guideEvent\('carpark'\)/);
});

test('the welcome card waits for the first baked view (or WELCOME_WAIT_MS at most)', () => {
  assert.equal(allBaked([{ tex: 1 }, { tex: {} }]), true); assert.equal(allBaked([{ tex: 1 }, { tex: null }]), false); assert.equal(allBaked([]), true);
  assert.equal(welcomeReady(false, 0), false); assert.equal(welcomeReady(false, WELCOME_WAIT_MS - 1), false); assert.equal(welcomeReady(true, 0), true); assert.equal(welcomeReady(false, WELCOME_WAIT_MS), true);
  const eng = readFileSync('src/game/engine.ts', 'utf8'), wv = eng.slice(eng.indexOf('  welcomeView()'), eng.indexOf('  welcomeView()') + 300);
  assert.match(wv, /if \(!welcomeReady\(this\.firstViewBaked, performance\.now\(\) - this\.readyAt\)\) return null;/);
});
