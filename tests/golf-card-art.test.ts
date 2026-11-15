// #1286: every Prize Machine card has a painting (src/assets/cards/<art>.webp, cut by scripts/assets/prep-card-art.mjs), so no card shows the drawn glyph, the fallback
// for a missing picture (ui/golf/CardArt.tsx); the machine has its own, and the folder holds nothing no card uses. (Run from the repo root, as `npm test` is.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { CARDS } from '../src/game/golf/cards';

const DIR = 'src/assets/cards', MACHINE = 'machine';
/** a WebP file: RIFF....WEBP */
const isWebp = (b: Buffer) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';

test('every card has a painting, and the file exists', () => {
  const missing: string[] = [];
  for (const c of CARDS) {
    if (!c.art) { missing.push(`${c.id}: no art`); continue; }
    const f = `${DIR}/${c.art}.webp`;
    if (!existsSync(f)) missing.push(`${c.id}: ${f} missing`);
    else assert.ok(isWebp(readFileSync(f)), `${f} is not a WebP`);
  }
  assert.deepEqual(missing, []);
});

test('the Prize Machine has its painting', () => {
  assert.ok(existsSync(`${DIR}/${MACHINE}.webp`));
});

test('the cards folder holds no painting nothing uses', () => {
  const used = new Set<string>([MACHINE, ...CARDS.map(c => c.art ?? '')]);
  assert.deepEqual(readdirSync(DIR).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).filter(k => !used.has(k)), []);
});
