import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { Pedestrians, sidewalks, type WalkerView } from '../src/game/ext/pedestrians';
import { personIdentity, personLookIndex } from '../src/game/person-identity';
import { portraitOf, type PortraitManifest, type PortraitPic } from '../src/game/portraits';
import { GOLFER_PEOPLE, SPECTATOR_PEOPLE, WALKER_PEOPLE } from '../src/game/library';
import { PersonPortrait } from '../src/ui/PersonPortrait';
import { TalkCard } from '../src/ui/golf/YouCards';
import { SceneCard } from '../src/ui/SceneCard';
import { HARD_TIMES, pickPicture, propertyPicture, propertyScene, type PropertySceneFacts, type SceneManifest, type ScenePic } from '../src/game/scenes';

const town = (people = 15) => {
  const p = new Pedestrians(41, people, 24);
  p.setSidewalks(sidewalks([{ pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], h: 2, walk: 2, closed: false }]));
  p.setDoors([{ x: 12, y: 5, kind: 0 }, { x: 88, y: 5, kind: 1 }]);
  return p;
};
const look = 'person:3d:town_m_mechanic';
const actor = personIdentity(5, 'town:1', look, 'town');
const portrait = (o: Partial<PortraitPic> = {}): PortraitPic => ({ lookId: look, file: 'mechanic.png', w: 1024, h: 1280, bytes: 2000, ...o });

test('a town walker keeps actor id, look and name while actually walking', () => {
  const p = town(); p.populate(6);
  const state = p.identityState(), views: WalkerView[] = [], positions = new Map<number, [number, number]>();
  let moved = false;
  for (let i = 0; i < 80; i++) {
    p.step(0.25);
    const n = p.inBox(-20, -20, 120, 20, views);
    for (const v of views.slice(0, n)) {
      const old = positions.get(v.id), before = personIdentity(5, `town:${v.id}`, WALKER_PEOPLE[v.person]!.id, 'town');
      if (old && Math.hypot(v.x - old[0], v.y - old[1]) > 0.1) moved = true;
      positions.set(v.id, [v.x, v.y]);
      const saved = state.people.find(([id]) => id === v.id)!;
      assert.equal(v.person, saved[1]);
      assert.deepEqual(before, personIdentity(5, `town:${saved[0]}`, WALKER_PEOPLE[saved[1]]!.id, 'town'));
    }
  }
  assert.ok(moved, 'the identity check covers a moving walker, not only two equal input objects');
  assert.deepEqual(p.identityState(), state);
});

test('different people sharing one appearance have different persistent actor identities', () => {
  const p = town(1); p.populate(2);
  const [[idA, lookA], [idB, lookB]] = p.identityState().people;
  assert.equal(lookA, lookB); assert.notEqual(idA, idB);
  const a = personIdentity(5, `town:${idA}`, look, 'town'), b = personIdentity(5, `town:${idB}`, look, 'town');
  assert.notEqual(a.id, b.id); assert.equal(a.lookId, b.lookId);
});

test('recycling a population slot creates a fresh lifecycle and preserves surviving actors', () => {
  const p = town(); p.populate(4); const before = p.identityState();
  p.populate(2); p.populate(4); const after = p.identityState();
  assert.deepEqual(after.people.slice(0, 2), before.people.slice(0, 2));
  assert.ok(after.people[2][0] >= before.nextId); assert.ok(after.people[3][0] > after.people[2][0]);
  assert.equal(new Set(after.people.map(([id]) => id)).size, 4);
});

test('identity-only save/restore preserves names and appearances and keeps the id allocator ahead', () => {
  const p = town(); p.populate(8); p.step(13); p.populate(6); p.populate(8);
  const saved = JSON.parse(JSON.stringify(p.identityState())), restored = town();
  const profiles = p.identityState().people.map(([id, who]) => personIdentity(7, `town:${id}`, WALKER_PEOPLE[who]!.id, 'town'));
  restored.restoreIdentities(saved); restored.populate(8);
  assert.deepEqual(restored.identityState(), saved);
  assert.deepEqual(restored.identityState().people.map(([id, who]) => personIdentity(7, `town:${id}`, WALKER_PEOPLE[who]!.id, 'town')), profiles);
  restored.populate(9); assert.ok(restored.identityState().people[8][0] >= saved.nextId);
  const oldSave = town(); oldSave.restoreIdentities(); oldSave.populate(2);
  assert.equal(oldSave.identityState().people[0][1], personLookIndex(41, 1, 15));
});

test('bad or duplicate restored identities cannot alias two live people', () => {
  const p = town(); p.restoreIdentities({ nextId: 1, people: [[10, 1], [10, 3], [-1, 0], [12, 999]] }); p.populate(4);
  const ids = p.identityState().people.map(([id]) => id);
  assert.equal(ids[0], 10); assert.equal(new Set(ids).size, 4); assert.ok(ids.slice(1).every(id => id > 10));
});

test('portraits use the actual clicked look and restrict actor-specific and role-specific images', () => {
  const m: PortraitManifest = { v: 1, pictures: [portrait({ lookId: 'spectator:spec_m_dad', file: 'dad.webp' }), portrait({ personId: 'another-person', file: 'other.webp' }), portrait(), portrait({ role: 'staff', file: 'staff.webp' }), portrait({ personId: actor.id, file: 'named.webp' })] };
  assert.equal(portraitOf(actor, m)?.file, 'named.webp');
  assert.equal(portraitOf({ ...actor, id: 'other' }, m)?.file, 'mechanic.png');
  assert.equal(portraitOf({ ...actor, id: 'other', role: 'staff' }, m)?.file, 'staff.webp');
  assert.equal(portraitOf({ ...actor, lookId: 'unknown-look' }, m), null);
  assert.equal(portraitOf(actor, { v: 1, pictures: [portrait({ state: 'upgraded' })] }, 'rundown'), null);
});

test('all forty existing animated looks can resolve their own portrait without changing an animation index', () => {
  const groups = [[WALKER_PEOPLE, 'town'], [SPECTATOR_PEOPLE, 'spectator'], [GOLFER_PEOPLE, 'golfer']] as const;
  assert.equal(groups.reduce((n, [people]) => n + people.length, 0), 40);
  for (const [people, role] of groups) for (const person of people) {
    const profile = personIdentity(9, `test:${person.id}`, person.id, role), m: PortraitManifest = { v: 1, pictures: [portrait({ lookId: person.id, file: `${person.id.replace(/:/g, '-')}.png` })] };
    assert.equal(portraitOf(profile, m)?.lookId, person.id);
  }
});

test('large portraits request only the chosen image from a mounted card; missing art has no unrelated image', () => {
  const m: PortraitManifest = { v: 1, pictures: [portrait()] }, urls = { '../assets/portraits/mechanic.png': '/mechanic-hashed.png' };
  const markup = renderToStaticMarkup(createElement(PersonPortrait, { person: actor, manifest: m, urls }));
  assert.match(markup, /src="\/mechanic-hashed.png"/); assert.match(markup, /loading="lazy"/);
  assert.doesNotMatch(markup, /rel="preload"/); assert.match(markup, /width="1024"/);
  const missing = renderToStaticMarkup(createElement(PersonPortrait, { person: actor, manifest: { v: 1, pictures: [] }, urls }));
  assert.match(missing, /Portrait not yet available/); assert.doesNotMatch(missing, /<img/);
  const talk = renderToStaticMarkup(createElement(TalkCard, { talk: { name: actor.name, what: 'Townsperson', line: 'Hello.', person: actor }, right: 'right-2', onClose() {} }));
  assert.match(talk, /Mechanic/); assert.match(talk, /A familiar face around town/); assert.match(talk, /data-person-id=/);
});

const picture = (o: Partial<ScenePic> = {}): ScenePic => ({ slug: 'town-home-outside', state: 'rundown', file: 'house.png', w: 1024, h: 576, bytes: 1200, ...o });
const home: PropertySceneFacts = { key: 'lot:1', subject: 'world:house_0', name: 'The old house', slug: 'town-home', good: false, home: true, tiles: [{ label: 'Residents', value: '3' }] };

test('ordinary homes require matching architecture or an explicit placed-instance scene', () => {
  const m: SceneManifest = { v: 1, pictures: [picture(), picture({ subject: 'world:house_1', file: 'wrong.png' }), picture({ subject: home.subject, file: 'right.png' })] };
  assert.equal(propertyPicture(home, 'outside', m)?.file, 'right.png');
  assert.equal(propertyPicture({ ...home, subject: 'world:house_2' }, 'outside', m), null);
  m.pictures = [...m.pictures, picture({ instanceKey: home.key, file: 'my-house.png' })];
  assert.equal(propertyPicture(home, 'outside', m)?.file, 'my-house.png');
  assert.equal(propertyPicture({ ...home, key: 'another-lot' }, 'outside', m)?.file, 'right.png');
});

test('house variations and property conditions stay independent; hard times never show upgraded art', () => {
  const subject = 'variation:world-house_0-deadbeef-plain:1';
  const m: SceneManifest = { v: 1, pictures: [picture({ subject, state: 'upgraded', file: 'pretty.png' }), picture({ subject: home.subject, file: 'other-building.png' })] };
  assert.equal(propertyPicture({ ...home, subject }, 'outside', m), null);
  assert.equal(propertyPicture({ ...home, subject, good: true }, 'outside', m)?.file, 'pretty.png');
  const pending = propertyScene({ ...home, subject }, undefined, m);
  assert.equal(pending.views[0].pendingArt, true); assert.equal(pending.views[0].pic.file, '');
  assert.equal(propertyScene({ ...home, good: true }, undefined, m).views[0].state, 'rundown', 'same home can keep its worn scene while its upgrade art is missing');
});

test('event facility scenes distinguish sizes even when legacy sprites are shared', () => {
  const small: PropertySceneFacts = { ...home, key: 'event:1', home: false, subject: 'golf:grandstand-s', slug: 'event-standS', name: 'Grandstand S' };
  const large = { ...small, key: 'event:2', slug: 'event-standL', name: 'Grandstand L' };
  const m: SceneManifest = { v: 1, pictures: [picture({ slug: 'event-standS-outside', file: 'small.png' }), picture({ slug: 'event-standL-outside', state: 'upgraded', file: 'large-new.png' })] };
  assert.equal(propertyPicture(small, 'outside', m)?.file, 'small.png');
  assert.equal(propertyPicture(large, 'outside', m), null);
  assert.equal(propertyPicture({ ...large, good: true }, 'outside', m)?.file, 'large-new.png');
});

test('business inside/outside tabs support exact identity and pending tabs without an unrelated fallback', () => {
  const business = { ...home, subject: 'world:video', home: false, name: 'Video Vault', slug: 'video-store' };
  const m: SceneManifest = { v: 1, pictures: [picture({ slug: 'video-store-outside', subject: business.subject })] };
  const view = propertyScene(business, 'inside', m);
  assert.equal(view.at, 1); assert.equal(view.views[0].pendingArt, undefined); assert.equal(view.views[1].pendingArt, true);
  const markup = renderToStaticMarkup(createElement(SceneCard, { view, onView() {}, onClose() {} }));
  assert.match(markup, /scene-picture-pending/); assert.match(markup, /Video Vault/); assert.doesNotMatch(markup, /data-testid="scene-picture"/);
  assert.equal(pickPicture('video-store-outside', HARD_TIMES, m), null, 'identity-scoped pictures cannot leak into a legacy generic picker');
});
