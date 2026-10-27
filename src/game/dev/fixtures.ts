// The dev-only save fixtures a URL opens (T098, issue #168; plan P22 2.7.3): ?fixture=range20 opens tests/fixtures/saves/golf-v5-range-20y.json,
// the range start's grown town at year 20 (scripts/sim/range-fixture.ts) with the course land empty and green, for manual checks of a grown
// town and the bench's &fixture=range20 scene. engine.ts imports this only under import.meta.env.DEV, so the build never holds a fixture.
import { upgradeSave, type SaveV5 } from '../save';

/** the fixtures by their ?fixture= name */
const FIXTURES: Record<string, () => Promise<{ default: unknown }>> = {
  range20: () => import('../../../tests/fixtures/saves/golf-v5-range-20y.json'),
};

/** the fixture `name` as a loadable save (migrated as a stored save is), or null when there is no such fixture or it does not read */
export async function devFixture(name: string): Promise<SaveV5 | null> {
  const get = FIXTURES[name];
  if (!get) { console.warn(`[fixture] no fixture "${name}" (have: ${Object.keys(FIXTURES).join(', ')})`); return null; }
  const d = (await get()).default as { version: number; map: number } & Partial<SaveV5>;
  return upgradeSave(d);
}
