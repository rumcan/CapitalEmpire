// T297 (#882): the lot groups learned from the presets (src/game/lots/groups.ts): the cells build from the real presets, a shabby back yard's junk
// cell holds no tidy planter, and every member of a cell has that cell's role.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGroups, groupOf, learnGroups, mainOf, roleOf, sizeOf, zoneOf, cellOf, type Role } from '../src/game/lots/groups';
import { parsePresets, type LotPreset } from '../src/game/lots/presets';
import PRESET_FIXTURE from './fixtures/lot-presets.json';

const presets: LotPreset[] = parsePresets(PRESET_FIXTURE).presets;
const cells = learnGroups(presets);
buildGroups(presets);

test('the cells build from the real presets: many cells, each with members', () => {
  assert.ok(cells.size > 100, `only ${cells.size} cells`);
  for (const [, m] of cells) assert.ok(m.length >= 1);
  // a tidy front yard of a built house has planting (the owner's presets hold bushes and flowers at the front)
  const planters = [...cells].filter(([k]) => k.startsWith('res|built|front|planter|'));
  assert.ok(planters.length > 0, 'no front planter cell for a built house');
});

test('a shabby back-yard junk cell holds no tidy planter', () => {
  const junkBack = [...cells].filter(([k]) => k.startsWith('res|declined|back|junk|'));
  for (const [, m] of junkBack) for (const id of m) assert.notEqual(roleOf(id), 'planter', `${id} is a planter in a junk cell`);
  // and no planter cell of any state or zone holds a junk id
  for (const [k, m] of cells) if (k.includes('|planter|')) for (const id of m) assert.notEqual(roleOf(id), 'junk', `${id} is junk in ${k}`);
});

test('every member of a cell has that cell\'s role', () => {
  // (the key's role is the member's role; a member's zone and size come from the preset prop it was seen in, so only the role is checked here)
  for (const [k, m] of cells) {
    const role = k.split('|')[3] as Role;
    for (const id of m) assert.equal(roleOf(id), role, `${id} in ${k}`);
  }
});

test('a prop\'s cell key is its own (zone, role and size from the prop and its preset)', () => {
  const p = presets.find(q => q.use === 'res' && q.state === 'built' && q.props.length > 6)!;
  const main = mainOf(p);
  p.props.forEach((q, i) => {
    if (i === main) return;
    const role = roleOf(q.id); if (!role) return;
    const key = cellOf(p.use, p.state, zoneOf(q.x, q.y, p.w, p.d), role, sizeOf(q));
    assert.ok(cells.get(key)?.includes(q.id), `${q.id} is not in its own cell ${key}`);
    assert.ok(groupOf(p.use, p.state, zoneOf(q.x, q.y, p.w, p.d), role, sizeOf(q)).includes(q.id));
  });
});
