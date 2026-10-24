// Which side every tree sprite is lit from: the game's sun comes from the right (screen upper right), so a tree lit from the left is always
// drawn mirrored and every other tree never is (no random mirroring anywhere: engine.addProp and treeSprites apply TREE_MIRROR).
//   node scripts/assets/tree-sun.mjs
// Three readings on the mip-0 atlas picture, each positive when the right is brighter:
//   crown: the brightness of each opaque pixel of the top 70% against its distance from the tree's centre line (a slope, in % of the mean);
//   half: the mean brightness of the right half of all opaque pixels against the left half (in % of the mean);
//   trunk: the same per row across the bottom 25% (the trunk and its foot), each row split at its own centre.
// The crown decides; when the three disagree the tree is marked "check by eye" and TREE_SIDE must say. Writes src/game/tree-sun.ts (every
// tree's side, so the runtime never measures, and the mirrored ones) and output/tree-sun/contact.png (each tree as it will be drawn, its
// readings under it) to check by eye.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REVIEW = path.join(root, 'output/tree-sun');
/** hand readings that win over the measure: id -> 'left' | 'right' (the side the light comes from in the art), with the reason */
const TREE_SIDE = {
  // the warm sunlit needle tips and the trunk's lit edge are on the right; the bright blue on the left is the cool sky fill, which fools
  // the brightness of the crown (crown and half read left, the trunk reads right)
  'ref:tree-spruce-blue': 'right',
};

// every tree in a generated library: its atlas page (mip 0) and rectangle
const trees = [];
for (const f of ['library', 'east-library', 'business-library', 'construction-library', 'golf-library', 'cars-library', 'views-library', 'trees-library']) {
  const text = fs.readFileSync(path.join(root, `src/game/${f}.ts`), 'utf8');
  const imports = new Map([...text.matchAll(/import\s+(\w+)\s+from\s+'([^']+\.webp)'/g)].map(m => [m[1], path.join(root, 'src/game', m[2])]));
  const pagesLiteral = /ATLAS_PAGES: string\[\]\[\] = (\[.*?\]);/.exec(text)?.[1] ?? /const PAGES: string\[\]\[\] = (\[.*?\]);/.exec(text)?.[1];
  const pages = pagesLiteral ? [...pagesLiteral.matchAll(/\[(\w+)/g)].map(m => imports.get(m[1])) : [...imports].filter(([a]) => /m0$/.test(a)).map(([, p]) => p);
  for (const m of text.matchAll(/\{"id":"([^"]+)","name":"[^"]*","cat":"[^"]*","kind":"tree".*?"tex":\[([^\]]+)\]/g)) {
    const [page, u0, v0, u1, v1] = m[2].split(',').map(Number);
    if (!pages[page]) throw new Error(`${m[1]}: no page ${page} in ${f}`);
    trees.push({ id: m[1], file: pages[page], u0, v0, u1, v1 });
  }
}
for (const id of Object.keys(TREE_SIDE)) if (!trees.some(t => t.id === id)) throw new Error(`TREE_SIDE names ${id}, which is not a library tree`);

/** the brightness of a pixel (0..255) */
const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
/** the three readings of a tree picture (RGBA data, width x height): crown, half and trunk, each > 0 when the right is brighter */
function readings(data, width, height) {
  const opaque = (x, y) => data[(y * width + x) * 4 + 3] >= 200;
  // crown: the brightness slope across the top 70%
  let n = 0, sx = 0, sl = 0;
  const px = [];
  for (let y = 0; y < height * 0.7; y++) for (let x = 0; x < width; x++) {
    if (!opaque(x, y)) continue;
    const l = lum(data, (y * width + x) * 4); px.push([x, l]); n++; sx += x; sl += l;
  }
  const cx = sx / n, ml = sl / n;
  let cov = 0, vx = 0; for (const [x, l] of px) { cov += (x - cx) * (l - ml); vx += (x - cx) ** 2; }
  const crown = cov / Math.sqrt(vx * n) / Math.max(1, ml) * 100;
  // half: right half against left half of every opaque pixel, split at their centre line
  let ax = 0, an = 0; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (opaque(x, y)) { ax += x; an++; }
  const mid = ax / an;
  let L = 0, nl = 0, R = 0, nr = 0, Lt = 0, nlt = 0, Rt = 0, nrt = 0;
  for (let y = 0; y < height; y++) {
    let rs = 0, rn = 0; for (let x = 0; x < width; x++) if (opaque(x, y)) { rs += x; rn++; }
    const rc = rn ? rs / rn : mid, foot = y > height * 0.75;
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      const l = lum(data, (y * width + x) * 4);
      if (x < mid) { L += l; nl++; } else { R += l; nr++; }
      if (foot) { if (x < rc) { Lt += l; nlt++; } else { Rt += l; nrt++; } }
    }
  }
  const half = (R / nr - L / nl) / ((R + L) / (nr + nl)) * 100;
  const trunk = nlt && nrt ? (Rt / nrt - Lt / nlt) / ((Rt + Lt) / (nrt + nlt)) * 100 : crown;
  return { crown, half, trunk };
}

fs.mkdirSync(REVIEW, { recursive: true });
const tiles = [], unsettled = [];
for (const t of trees) {
  const { width: PW, height: PH } = await sharp(t.file).metadata();
  const left = Math.round(t.u0 * PW), top = Math.round(t.v0 * PH), width = Math.round((t.u1 - t.u0) * PW), height = Math.round((t.v1 - t.v0) * PH);
  const png = await sharp(t.file).extract({ left, top, width, height }).png().toBuffer();
  const { data } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  Object.assign(t, readings(data, width, height));
  t.agree = Math.sign(t.crown) === Math.sign(t.half) && Math.sign(t.crown) === Math.sign(t.trunk);
  t.side = TREE_SIDE[t.id] ?? (t.crown >= 0 ? 'right' : 'left');
  if (!t.agree && !TREE_SIDE[t.id]) unsettled.push(t.id);
  // the review tile: the tree as the game will draw it
  const thumb = await sharp(png).flop(t.side === 'left').resize(160, 200, { fit: 'inside' }).png().toBuffer(), meta = await sharp(thumb).metadata();
  const how = TREE_SIDE[t.id] ? ' (by hand)' : t.agree ? '' : ' CHECK BY EYE';
  const label = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="44"><text x="90" y="14" text-anchor="middle" font-size="11" fill="#172a32" font-family="sans-serif">${t.id.replace(/^(capital|world|ref):/, '')}</text><text x="90" y="28" text-anchor="middle" font-size="10" fill="#172a32" font-family="sans-serif">${t.crown.toFixed(0)} / ${t.half.toFixed(0)} / ${t.trunk.toFixed(0)}</text><text x="90" y="41" text-anchor="middle" font-size="11" fill="${t.side === 'left' || how ? '#c0392b' : '#172a32'}" font-family="sans-serif">${t.side === 'left' ? 'lit left: mirrored' : 'lit right'}${how}</text></svg>`;
  tiles.push([{ input: thumb, left: Math.floor((180 - meta.width) / 2), top: 200 - meta.height }, { input: Buffer.from(label), left: 0, top: 200 }]);
}
const cols = 8, rows = Math.ceil(tiles.length / cols);
await sharp({ create: { width: cols * 180, height: rows * 250, channels: 4, background: '#d8e0e3' } })
  .composite(tiles.flatMap((t, i) => t.map(c => ({ ...c, left: c.left + (i % cols) * 180, top: c.top + Math.floor(i / cols) * 250 }))))
  .png().toFile(path.join(REVIEW, 'contact.png'));
const sorted = [...trees].sort((a, b) => (a.id < b.id ? -1 : 1)), r1 = v => v.toFixed(1);
fs.writeFileSync(path.join(root, 'src/game/tree-sun.ts'), [
  '// Generated by scripts/assets/tree-sun.mjs: the side every library tree\'s art is lit from (measured on its picture; TREE_SIDE in the',
  '// script where the measure is fooled). The sun comes from the right, so a tree lit from the left is always drawn mirrored and every',
  '// other tree never is: no tree is mirrored at random (engine.addProp and treeSprites). Run the script again after adding tree art:',
  '// tests/tree-sun.test.ts fails while a library tree is missing here.',
  '',
  '/** the side the light comes from in each library tree\'s picture, as drawn unmirrored: every tree sprite, by id. The readings (crown /',
  ' *  half / trunk, > 0 when the right is brighter) are in the comment after each */',
  'export const TREE_LIGHT: Readonly<Record<string, \'left\' | \'right\'>> = {',
  ...sorted.map(t => `  ${JSON.stringify(t.id)}: '${t.side}', // ${r1(t.crown)} / ${r1(t.half)} / ${r1(t.trunk)}${TREE_SIDE[t.id] ? ' (by hand)' : ''}`),
  '};',
  '/** the trees drawn mirrored: their art is lit from the left (TREE_LIGHT), so the mirror puts the light on the right, where the sun is */',
  'export const TREE_MIRROR: ReadonlySet<string> = new Set(Object.keys(TREE_LIGHT).filter(id => TREE_LIGHT[id] === \'left\'));',
  ''].join('\n'));
console.log(trees.map(t => `${t.id} ${r1(t.crown)} / ${r1(t.half)} / ${r1(t.trunk)} ${t.side}${TREE_SIDE[t.id] ? ' (by hand)' : t.agree ? '' : ' CHECK BY EYE'}`).join('\n'));
console.log(`${trees.length} trees, ${trees.filter(t => t.side === 'left').length} lit from the left (mirrored); review: ${path.relative(root, REVIEW)}/contact.png`);
if (unsettled.length) { console.error(`readings disagree, add a hand reading to TREE_SIDE: ${unsettled.join(', ')}`); process.exitCode = 1; }
