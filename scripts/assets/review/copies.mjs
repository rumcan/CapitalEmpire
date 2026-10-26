// The sprite studio's Library shows one card per picture: a library id whose picture is the same as another's in its category (a variation of a
// building the game also has) is folded into that card as a copy (dupes). A picture's average hash: 16 x 16 greyscale, the mean as the threshold,
// 256 bits; two pictures are the same when their hashes differ in SAME bits or fewer.
import sharp from 'sharp';

/** the most bits two average hashes may differ by and still be the same picture */
export const SAME = 6;

/** the 256-bit average hash of a picture (a PNG buffer), as eight 32-bit words; transparency is flattened on a neutral grey. null when the picture has
 *  no visible pixels (fewer than 16 opaque ones: a blank atlas rect, which must never fold into another card) */
export async function averageHash(png) {
  const { data: rgba, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 128) opaque++;
  if (opaque < 16) return null;
  const { data } = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).flatten({ background: '#808080' }).greyscale().resize(16, 16, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0; for (let i = 0; i < 256; i++) sum += data[i];
  const mean = sum / 256, bits = new Uint32Array(8);
  for (let i = 0; i < 256; i++) if (data[i] > mean) bits[i >> 5] |= 1 << (i & 31);
  return bits;
}

/** the Hamming distance between two hashes (the bits that differ) */
export function distance(a, b) {
  let d = 0;
  for (let i = 0; i < 8; i++) for (let x = (a[i] ^ b[i]) >>> 0; x; x &= x - 1) d++;
  return d;
}

/**
 * Folds the cards that show the same picture (in the same category) into one card each. Within a category the base ids go first, then the variations,
 * each in card order; the first one not yet taken keeps the copies that are within SAME of it (its dupes: their ids), and they are left out of the
 * result. hashOf(card) gives the card's hash, or null when it has no picture (it is never folded). Returns the cards kept and the copies folded per category.
 */
export async function foldCopies(cards, hashOf) {
  const byCat = new Map();
  for (const s of cards) {
    const bits = await hashOf(s); if (!bits) continue;
    if (!byCat.has(s.cat)) byCat.set(s.cat, []);
    byCat.get(s.cat).push({ s, bits, i: byCat.get(s.cat).length, variation: s.id.startsWith('variation:') ? 1 : 0 });
  }
  const hidden = new Set(), folded = {};
  for (const [cat, list] of byCat) {
    const order = [...list].sort((a, b) => a.variation - b.variation || a.i - b.i), taken = new Set();
    for (const k of order) {
      if (taken.has(k.s.id)) continue;
      taken.add(k.s.id);
      const copies = order.filter(m => !taken.has(m.s.id) && distance(k.bits, m.bits) <= SAME).map(m => m.s);
      if (!copies.length) continue;
      for (const c of copies) { taken.add(c.id); hidden.add(c.id); }
      k.s.dupes = copies.map(c => c.id);
      folded[cat] = (folded[cat] ?? 0) + copies.length;
    }
  }
  return { cards: cards.filter(s => !hidden.has(s.id)), folded };
}
