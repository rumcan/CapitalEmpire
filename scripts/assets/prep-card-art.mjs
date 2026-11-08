// T336 (#962): the cards' pictures taken from TrickOrTreat's treats (read-only art and idea source, with the owner's permission: "lets steal art from trickorTreat"): each painting is cut to a small WebP in
// src/assets/cards/<key>.webp, where the card (golf/cards/catalogue.ts `art`) and the vending machine find it. A card with no painting is drawn as a glyph (ui/golf/CardArt.tsx: "Stand In for card art").
//   node scripts/assets/prep-card-art.mjs [--src F:/Repos/TrickOrTreat/public/assets/treats] [--only masher,token]
// Run again to add one: put its key and treat file in PICKS. Nothing is written to TrickOrTreat.
import sharp from 'sharp';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const src = opt('src', 'F:/Repos/TrickOrTreat/public/assets/treats'), only = opt('only', '') ? opt('only', '').split(',') : null, out = 'src/assets/cards';
/** the card art key -> the treat painting it comes from (TrickOrTreat's public/assets/treats/<file>.webp) */
export const PICKS = {
  masher: 'masher',     // Power Mash: a button-masher's controller
  batteries: 'batteries', // Range Rat: a Walkman at the range
  token: 'token',       // the vending machine itself: the arcade cabinet
  yoyo: 'yoyo',         // Trick Shot: a yo-yo (T337)
};
// 16:9, 320 px wide: a tile's picture at 2x and the card's detail at 1x
const W = 320, H = 180;
mkdirSync(out, { recursive: true });
for (const [key, file] of Object.entries(PICKS)) {
  if (only && !only.includes(key)) continue;
  const from = join(src, `${file}.webp`);
  if (!existsSync(from)) { console.error(`missing ${from}`); process.exitCode = 1; continue; }
  const to = join(out, `${key}.webp`);
  await sharp(from).resize(W, H, { fit: 'cover', position: 'centre' }).webp({ quality: 78 }).toFile(to);
  console.log(`${to}  ${(statSync(to).size / 1024).toFixed(1)} KB`);
}
