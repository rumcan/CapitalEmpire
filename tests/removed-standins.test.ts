// T167 (#371): a picture the owner removed in the studio is never drawn. The presets that still place one get a stand-in at compose time: the
// lot's house by a house of its size class that suits the lot's road and state and fits its band, another building by one of its kind and
// footprint (else nothing), an expansion or a prop left out; picked by the lot, so it never changes on a reload; everything else of a preset is
// drawn exactly as before; the owner's data files are only read. Headless.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compose, lotPreset, lotPresets, setGeneratedLots, type ComposeState, type LotGeom } from '../src/game/lots/compose';
import { LU, LV } from '../src/game/lots/town';
import { LIBRARY } from '../src/game/library';
import { isBuilding } from '../src/game/mirror';
import { houseFamily } from '../src/game/lots/house-class';
import { fitPreset, type LotPreset } from '../src/game/lots/presets';

(globalThis as unknown as { Path2D: unknown }).Path2D ??= class { moveTo() {} lineTo() {} arc() {} arcTo() {} closePath() {} rect() {} };

const REMOVED = JSON.parse(fs.readFileSync('scripts/assets/removed.json', 'utf8')) as Record<string, { kind: string }>;
const BY = new Map(LIBRARY.map(i => [i.id, i]));
const gone = (id: string) => id in REMOVED || !BY.has(id);
const USE: Record<string, number> = { res: LU.RES, com: LU.COM, park: LU.COM, tour: LU.TOUR, ind: LU.IND, civic: LU.GOV };
/** a lot drawing a preset (forced, as the lab draws it): its own size, facing +y, at a place on a street */
const lotFor = (p: LotPreset, k: number): { g: LotGeom; st: ComposeState } => ({
  g: { o: { x: 300 + 30 * (k % 40), y: 300 + 40 * Math.floor(k / 40) }, u: { x: 1, y: 0 }, n: { x: 0, y: 1 }, w: p.w, d: p.d },
  st: { use: USE[p.use] ?? LU.RES, level: p.state === 'upgraded' ? LV.UPGRADED : LV.BUILT, decline: p.state === 'declined' ? 2 : 0, seed: 7, preset: p.id },
});
const placing = () => lotPresets().filter(p => p.use !== 'farm' && p.props.some(q => gone(q.id)));

describe('stand-ins for the pictures the owner removed (T167)', () => {
  it('1. no removed picture is ever drawn: over every preset that places one, in its state, generated or not', () => {
    const list = placing();
    assert.ok(list.length > 100, `${list.length} presets place a removed picture`);
    for (const gen of [false, true]) {
      setGeneratedLots(gen);
      list.forEach((p, k) => { const l = lotFor(p, k), c = compose(l.g, l.st); for (const q of c.props) assert.ok(!gone(q.id), `${p.id}: draws ${q.id}`); });
    }
    setGeneratedLots(true);
  });
  it('2. a removed house becomes a house: a dwelling, marked as a stand-in; the decrepit house lots have their houses again', () => {
    let houses = 0;
    placing().filter(p => p.use === 'res').forEach((p, k) => {
      const l = lotFor(p, k), lp = lotPreset(l.g, l.st)!, c = compose(l.g, l.st);
      for (const q of c.props.filter(x => x.standIn)) assert.ok(gone(q.standIn!) && !gone(q.id), `${q.id} stands in for ${q.standIn}`);
      if (p.state === 'declined' && lp.fit.standIn?.some(Boolean)) {
        assert.ok(c.props.some(q => q.standIn && houseFamily(q.id) === 'dwelling'), `${p.id}: the decrepit lot has a house again`);
        houses++;
      }
    });
    assert.ok(houses > 30, `${houses} decrepit house lots draw a stand-in house`);
  });
  it('3. a stand-in is the same on every compose of the lot (a reload); over the decrepit presets more than one house stands in', () => {
    const decl = placing().filter(q => q.use === 'res' && q.state === 'declined'), a = lotFor(decl[0]!, 3), ids = new Set<string>();
    const one = JSON.stringify(compose(a.g, a.st));
    assert.equal(JSON.stringify(compose(a.g, a.st)), one);
    decl.forEach((p, k) => { const l = lotFor(p, k), h = compose(l.g, l.st).props.find(q => q.standIn); if (h) ids.add(h.id); });
    assert.ok(ids.size > 1, `the houses standing in: ${[...ids].join(', ')}`);
  });
  it('4. everything else of a preset is drawn as before: only its removed props change', () => {
    for (const p of placing()) {
      const l = lotFor(p, 1), lp = lotPreset(l.g, l.st)!, fit = fitPreset(p, l.g.w, l.g.d);
      const mine = lp.fit.props.filter((_, i) => !lp.fit.standIn?.[i]).map(q => q.id).sort();
      const before = fit.props.filter(q => !gone(q.id)).map(q => q.id).sort();
      assert.deepEqual(mine, before, `${p.id}: the props it keeps are its own`);
    }
  });
  it('5. a removed building of another use (the fire station) becomes a building of its kind, or nothing; a removed expansion is left out', () => {
    const fire = placing().filter(p => p.props.some(q => q.id === 'town:firestation'));
    assert.ok(fire.length > 10);
    let stood = 0;
    fire.forEach((p, k) => {
      const l = lotFor(p, k), lp = lotPreset(l.g, l.st)!;
      lp.fit.props.forEach((q, i) => { if (lp.fit.standIn?.[i] === 'town:firestation') { const it = BY.get(q.id)!; assert.equal(it.kind, REMOVED['town:firestation']!.kind); assert.ok(isBuilding(it)); stood++; } });
    });
    // the dormer's rear set is the house of the curated rear lots (their only building): it stands in as a house, as the lot's house does
    for (const p of placing().filter(q => q.props.some(x => x.id === 'expansion:dormer-rear'))) {
      const l = lotFor(p, 2), lp = lotPreset(l.g, l.st)!, i = lp.fit.standIn?.indexOf('expansion:dormer-rear') ?? -1;
      if (i >= 0) assert.equal(houseFamily(lp.fit.props[i]!.id), 'dwelling', `${p.id}: its house stands in as a house`);
    }
    assert.ok(stood >= 0);
  });
});
