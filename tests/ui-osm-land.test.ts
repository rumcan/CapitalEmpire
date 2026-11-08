// T357 (#999): where the real ground height shows in the UI, as markup (react-dom/server: effects do not run): the picker's Featured list names the source of each shipped
// course's ground, the course card says the land's source and rise (with the credit) or that the ground is flat, and the gear menu's credit line is the USGS one. No game, no network.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CoursePicker, type Featured } from '../src/ui/golf/CoursePicker';
import { OsmNote } from '../src/ui/course/OsmNote';
import type { Game } from '../src/game/engine';
import { OSM_COURSES } from '../src/game/golf/osm';
import { DEM_CREDIT_DEFAULT } from '../src/game/golf/osm/terrarium';

const FEATURED: Featured[] = OSM_COURSES.map(c => ({ id: c.id, name: c.name, place: c.place, holes: c.holes, par: c.par, mappedPar: c.mappedPar, ...(c.scale ? { scale: c.scale } : {}), ...(c.ground ? { ground: c.ground } : {}) }));
const noop = () => undefined;
const OSM = { id: 'woodhill', name: 'Woodhill Country Club', place: 'Pretoria, South Africa', credit: '© OpenStreetMap contributors', licence: 'ODbL', source: 's', holes: 18, par: 72, mappedPar: 73, scale: 0.9 };
const note = (land: { label: string; credit: string; src: string; fetched: string; reliefM: number } | null) => renderToStaticMarkup(createElement(OsmNote, { game: { osmGame: () => OSM, landInfo: () => land } as unknown as Game }));

describe('the real ground height in the cards (T357)', () => {
  it('the picker names the source of each shipped course\'s ground', () => {
    const h = renderToStaticMarkup(createElement(CoursePicker, { featured: FEATURED, current: null, onOwn: noop, onFeatured: noop, onBuild: noop, onClose: noop }));
    assert.ok(h.includes('data-testid="who-ground-woodhill"') && h.includes('Real ground height (SRTM, 30 m)'), 'Woodhill: SRTM');
    assert.ok(h.includes('Real ground height (USGS 3DEP, 10 m)'), 'Magnolia National: 3DEP');
    assert.equal(FEATURED.filter(f => f.ground).length, 3);
    assert.ok(h.includes('© OpenStreetMap contributors'), 'the OSM credit is still on the card');
    assert.ok(h.includes(DEM_CREDIT_DEFAULT), 'and the elevation credit beside it');
  });
  it('the course card says the land\'s source and rise, with its credit, and "flat" where the game has none', () => {
    const on = note({ label: 'SRTM, 30 m', credit: DEM_CREDIT_DEFAULT, src: 'srtm', fetched: '2026-11-08', reliefM: 74.4 });
    assert.ok(on.includes('data-testid="osm-land"') && on.includes('Real ground height (SRTM, 30 m): 74.4 m of rise across the land'), on);
    assert.ok(on.includes(`title="${DEM_CREDIT_DEFAULT}"`), 'the credit is its tooltip');
    assert.ok(on.includes('greens keep the game&#x27;s own gentle tilt') || on.includes('greens keep the game\'s own gentle tilt'), 'the greens\' tilt is said');
    assert.ok(on.includes('© OpenStreetMap contributors') && !on.includes('osm-flat'));
    const flat = note(null);
    assert.ok(flat.includes('data-testid="osm-flat"') && flat.includes('Flat ground') && !flat.includes('osm-land'));
  });
  it('a game that is not on a map-data course has no card at all, and asks nothing of the land', () => {
    const none = renderToStaticMarkup(createElement(OsmNote, { game: { osmGame: () => null } as unknown as Game }));
    assert.equal(none, '');
  });
});
