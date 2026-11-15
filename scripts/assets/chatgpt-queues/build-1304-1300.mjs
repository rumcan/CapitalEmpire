// #1304 and #1300: writes the ChatGPT bridge's queues (runner.js __runPairs: [name~v, [refs], prompt1, prompt2?]) and their reference pictures
// from scripts/assets/art-1304-1300.mjs. Never touches runner.js, bridge.py, the other queues or in/.
//   node scripts/assets/chatgpt-queues/build-1304-1300.mjs [--bridge D:/AI/chatgpt-bridge]
// Writes <bridge>/queue-icons1304.json, queue-shack1300.json, queue-shack1300b.json, queue-shack1300c.json, and guides/icons1304/, guides/shack1300/.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { BRIDGE, ICON_SHEETS, SINGLES, LITTER_SHEETS, SECOND_HAND, SCENES, QUEUES } from '../art-1304-1300.mjs';
import { writeGuideBox } from '../iso-guide-box.mjs';

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const bridge = opt('--bridge') ?? BRIDGE, repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../..');
const G1304 = path.join(bridge, 'guides/icons1304'), G1300 = path.join(bridge, 'guides/shack1300');
const p = f => f.replaceAll('\\', '/');
await fs.mkdir(G1304, { recursive: true }); await fs.mkdir(G1300, { recursive: true });

// ---- the references
const STYLE = p(path.join(repo, 'art/theme-consistency/references/theme-authoritative.png'));
const refs = {
  tilesA: p(path.join(G1304, 'style-tiles-v12.png')), tilesB: p(path.join(G1304, 'style-tiles-v13.png')),
  style1304: p(path.join(G1304, 'theme-authoritative.png')), style1300: p(path.join(G1300, 'theme-authoritative.png')),
};
await fs.copyFile(path.join(repo, 'art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-v12.png'), refs.tilesA);
await fs.copyFile(path.join(repo, 'art/theme-consistency/generated/ui/golf-build-tool-tiles-sheet-v13.png'), refs.tilesB);
await fs.copyFile(STYLE, refs.style1304); await fs.copyFile(STYLE, refs.style1300);

const TRANSPARENT = 'FULLY TRANSPARENT background (a PNG with an alpha channel): no white, no backdrop colour, no key colour';
const ONLY = n => `Use only the ${n === 1 ? 'picture' : n === 2 ? 'two pictures' : 'three pictures'} attached to this message (ignore any earlier pictures).`;

// ---- #1304: the tile sheets
const SHEET_INTRO = {
  v14: 'the top bar\'s chips and stats',
  v15: 'the buttons (each scene is ONE chunky painted object shaped like the button\'s symbol: the arrow, triangle, bar, plus, minus and X shapes asked for are solid painted 3D objects, the only symbols allowed)',
  v16: 'the map tools, the road chips, a lock and a windsock',
};
function sheetPrompt(v, tiles) {
  const rows = [0, 1, 2].map(r => `Row ${r + 1}: ` + tiles.slice(r * 4, r * 4 + 4).map(([, what], k) => `(${r * 4 + k + 1}) ${what}`).join('; ') + '.').join('\n');
  const people = tiles.some(([id]) => id === 'golfers') ? ' No people except the two tiny golfers asked for.' : ' No people.';
  return `${ONLY(2)} They are tile sheets already in this painted isometric golf game: match their style, scale, framing, camera angle, detail level and colours exactly.\n\n`
    + `Create an image, 4:3 landscape: a sheet of TWELVE tiny isometric dioramas in a 4 x 3 grid, for ${SHEET_INTRO[v]}. Each scene sits on its own small slab of ground, on its own dark navy (#1E2A44) rounded square; the twelve squares are the same size, evenly spaced, and do not touch. Around and between the squares the background is ${TRANSPARENT}. `
    + `Light from the upper right (the sun is always at the upper right), soft shadows falling to the lower left, warm autumn colours, the year 1985 (no modern things). NO lettering, numbers or logos anywhere: every sign, board, paper, card and screen is blank.${people} `
    + `These tiles are shown very small (16 to 40 px), so each scene has ONE big clear main object filling most of its slab, a strong silhouette and few small details, and is easy to tell apart from the others. Row by row, left to right:\n${rows}`;
}
const icons = Object.entries(ICON_SHEETS).map(([v, tiles]) => [`golf-build-tool-tiles-sheet~${v}`, [refs.tilesA, refs.tilesB], sheetPrompt(v, tiles)]);

// ---- #1304: the emblems and the single pictures
const singles = SINGLES.map(s => {
  const isoNote = s.id === 'tee-markers' ? '' : ' Seen straight on, not isometric.';
  const words = s.words ? `The ONLY words in the picture are ${s.words}, spelt exactly so, crisp and readable; no other letters or numbers.` : 'NO words, letters or numbers anywhere.';
  const shape = s.aspect ? `Create an image, ${s.aspect}` : 'Create an image, square 1:1: ONE emblem centred, filling about 85% of the picture';
  return [`${s.id}~e1`, [refs.style1304], `${ONLY(1)} It is the painted style of my game: copy its painterly style, light and colour only, not its camera or its subjects.\n\n${shape}: ${s.subject}.${isoNote} ${words} Light from the upper right; any shading falls to the lower left. No flat single-colour fills: painted texture and soft light on every surface. ${TRANSPARENT}, no ground, no frame box; only the subject.`];
});
const litter = LITTER_SHEETS.map(s => {
  const n = s.cols * s.rows, word = n === 12 ? 'TWELVE' : 'FOUR';
  const rows = Array.from({ length: s.rows }, (_, r) => `Row ${r + 1}: ` + s.cells.slice(r * s.cols, r * s.cols + s.cols).map((c, k) => `(${r * s.cols + k + 1}) ${c}`).join('; ') + '.').join('\n');
  return [`${s.id}~e1`, [refs.style1304], `${ONLY(1)} It is the painted style of my game: copy its painterly style, light and colour only.\n\nCreate an image, ${s.cols === s.rows ? 'square 1:1' : '4:3 landscape'}: a sheet of ${word} separate small pieces of desert ground litter in a ${s.cols} x ${s.rows} grid, each centred in its own equal cell, well apart, none touching another or crossing its cell's edge. Seen from the game's camera: fixed parallel 2:1 isometric, looking down at about 30 degrees, no perspective. Colours of sand, sandstone, grey-brown stone, dry brown brush and a little grey-green sage; never green grass, never autumn leaves. Sun at the screen's upper right: each piece is lit there and has a small soft contact shadow toward the lower left. Painted, textured, soft natural edges, no flat colour fills. ${TRANSPARENT}, no ground between the pieces. Row by row, left to right:\n${rows}`];
});
const icons1304 = [...icons, ...singles, ...litter];

// ---- #1300: the second-hand buildings, two views each from the style picture and the guide boxes
const notes = [];
const shack = [];
for (const b of SECOND_HAND) {
  const g1 = p(path.join(G1300, `${b.id}-guide-view1.png`)), g2 = p(path.join(G1300, `${b.id}-guide-view2.png`));
  const s1 = await writeGuideBox({ L: b.L, D: b.D, H: b.H, view: 1 }, g1); await writeGuideBox({ L: b.L, D: b.D, H: b.H, view: 2 }, g2);
  notes.push(`${b.id}: ${b.L} x ${b.D} x ${b.H} m, guides at ${s1.toFixed(0)} px a metre`);
  const what = `${b.what}, about ${b.L} m long, ${b.D} m deep and ${b.H} m high`;
  const SECOND = 'It is SECOND-HAND: bought used, a normal, decent, well-kept thing a few years old, perhaps a little faded or older in style. Never a shack: no tin-and-tarp, no rust holes, no patched tarps, no scrap, nothing derelict.';
  const p1 = `${ONLY(3)} Picture 1 is the overall painted style of my game: copy its painterly style, light and colour only, not its camera or its buildings. Picture 2 is a plain grey box drawn at the game's exact camera: true 2:1 isometric, every horizontal edge at exactly 26.565 degrees from the horizontal, every vertical edge exactly vertical, no perspective (parallel lines stay parallel). Picture 3 is the same box turned for a second view: keep it for later.\n\n`
    + `Paint the object so it fills picture 2's grey box EXACTLY: the same size, place and outline on the canvas, every horizontal edge parallel to the box's edges, its top on the box's top face; the tan patch only marks the footprint (paint no ground). The object: ${what}. ${SECOND} `
    + `Orientation: its FRONT is the box's face toward the screen's LOWER LEFT (the dark mark is where its door, hatch or counter goes); its right end is the face toward the LOWER RIGHT. Late-afternoon sun at the screen's upper right; small soft contact shadows toward the lower left only. Painted texture on every surface, no flat colour fills. ${TRANSPARENT}, no ground; only the object and its soft contact shadow. No text, letters or numbers anywhere.`;
  const p2 = `Now the SAME object exactly (same design, colours, materials, size and light) as it fills picture 3's grey box EXACTLY: the box turned so the object's FRONT (the dark mark) faces the screen's LOWER RIGHT and its LEFT end shows toward the lower left. Not a mirror image: draw the left end as it really is. Same fixed 2:1 isometric camera, sun still at the screen's upper right, contact shadows toward the lower left. ${TRANSPARENT}, no ground. No text.`;
  shack.push([`${b.id}~s1`, [refs.style1300, g1, g2], p1, p2]);
}
const split = SECOND_HAND.findIndex(b => b.id === 'second-hand-map-board');
// ---- #1300: the scenes, from their upgraded pictures (the viewpoint), never from the shack ones
const scenes = [];
for (const s of SCENES) {
  const ref = p(path.join(G1300, `scene-${s.slug}-upgraded.png`));
  await sharp(path.join(repo, `src/assets/scenes/${s.slug}-upgraded.webp`)).png().toFile(ref);
  scenes.push([`scene-${s.slug}-second-hand~s1`, [ref], `${ONLY(1)} It is a painted scene from my game (a place after its upgrades). Create an image, 16:9 landscape, in exactly its painted style, colours and light and from its EXACT viewpoint and framing: the same place as it was earlier, ${s.what}. Light from the upper right, shadows to the lower left, the year 1985, early autumn. No people. No text, letters or numbers anywhere (signs blank).`]);
}

const out = { [QUEUES.icons1304]: icons1304, [QUEUES.shack1300]: shack.slice(0, split), [QUEUES.shack1300b]: shack.slice(split), [QUEUES.shack1300c]: scenes };
for (const [f, q] of Object.entries(out)) { await fs.writeFile(path.join(bridge, f), JSON.stringify(q, null, 1) + '\n'); console.log(`${f}: ${q.length} items`); }
console.log(notes.join('\n'));
