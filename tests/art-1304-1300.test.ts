// #1304 (painted pictures for the old icons and every code-drawn stand-in) and #1300 (no shack art; second-hand or new). The art table
// (scripts/assets/art-1304-1300.mjs) and the game's tables agree; the old look stays an option; the shack props never show and an old save's load as
// their replacement; the scenes never pick a shack picture; the first clubhouse is the 1950s budget one; and the importer, on placeholder pictures
// (solid shapes made here, never art), cuts and writes every kind of picture it takes and refuses one with no transparent background.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLUB_TILE, ICON_TILE, ICON_TILES, TOOL_TILES, ACTION_TILES, PROP_TILES, TOOL_TILES_V14, TOOL_TILES_V15, TOOL_TILES_V16 } from '../src/ui/tool-tiles';
import { readUiArtLook } from '../src/ui/ui-art-look';
import { EVENT_EMBLEM, emblemOfTitle } from '../src/ui/Emblem';
import { SHACK_PAINTING, SHACK_PROPS, SECOND_HAND_ITEMS, isShackProp, secondHandPrice, shackReplacement, shackTuple, tierCat, tierOfCat, saleSignId } from '../src/game/golf/second-hand';
import { LIBRARY } from '../src/game/library';
import { DECOR } from '../src/game/golf/decor';
import { HARD_TIMES, GOOD_TIMES, SCENE_MANIFEST, SHACK_SCENES, pickPicture } from '../src/game/scenes';
import { FIRST_CLUBHOUSE, businessArt } from '../src/game/business/art';
import { lookOf } from '../src/game/newart';
import { SALE_SIGN } from '../src/game/golf/estate';

const art = () => import(pathToFileURL(path.resolve('scripts/assets/art-1304-1300.mjs')).href);
const ids = new Set(LIBRARY.map(i => i.id));
const ICON_NAMES_RENDERED = ['leaf', 'road', 'house', 'junction', 'bulldozer', 'bus', 'buildings', 'bank', 'people', 'briefcase', 'sun', 'income', 'gear', 'trophy', 'calendar', 'info', 'compass',
  'terrain', 'layers', 'chart', 'pause', 'play', 'fast', 'skip', 'rewind', 'zoom-in', 'zoom-out', 'pin', 'oneway', 'trees', 'sidewalk', 'forest', 'help', 'up', 'down', 'left', 'right', 'forward2', 'swap', 'close'];

test('#1304: the icon sheets are the art table\'s and the tile cutter\'s; every rendered icon has a tile; no tile name is taken twice', async () => {
  const { ICON_SHEETS, ICON_REUSE } = await art();
  const prep = await import(pathToFileURL(path.resolve('scripts/assets/prep-ui-tool-tiles.mjs')).href);
  for (const [v, mine] of [['v14', TOOL_TILES_V14], ['v15', TOOL_TILES_V15], ['v16', TOOL_TILES_V16]] as const) {
    assert.deepEqual(ICON_SHEETS[v].map((t: [string]) => t[0]), [...mine], `${v}: the queue paints the tiles the game names`);
    assert.deepEqual(prep.SHEET_NAMES[v].flat(), [...mine], `${v}: the cutter names them so`);
  }
  assert.equal(new Set([...TOOL_TILES, ...ACTION_TILES, ...PROP_TILES, ...ICON_TILES]).size, 156 + 36, 'thirty-six new names, none an older tile\'s');
  const every = new Set<string>([...TOOL_TILES, ...ACTION_TILES, ...PROP_TILES, ...ICON_TILES, 'settings', 'how-to-play', 'daylight', 'earthworks', 'bank', 'bulldoze', 'trees']);
  for (const n of ICON_NAMES_RENDERED) assert.ok(ICON_TILE[n] && every.has(ICON_TILE[n]!), `${n} has a painted tile`);
  for (const [icon, tile] of Object.entries(ICON_REUSE)) assert.equal(ICON_TILE[icon], tile, `${icon} reuses ${tile}`);
  for (const t of Object.values(CLUB_TILE)) assert.ok(t.startsWith('club-'), t);
});

test('#1304: the painted look is the default; ?uilook=vector or the stored choice keeps the old one', () => {
  assert.equal(readUiArtLook('', null), 'painted');
  assert.equal(readUiArtLook('?uilook=vector', null), 'vector');
  assert.equal(readUiArtLook('', 'vector'), 'vector');
  assert.equal(readUiArtLook('?a=1&uilook=painted', 'vector'), 'painted', 'the address wins');
  assert.equal(readUiArtLook('', 'nonsense'), 'painted');
});

test('#1304: each club event and won title has its emblem, and every emblem is in the queue', async () => {
  const { SINGLES } = await art();
  assert.deepEqual(EVENT_EMBLEM, { mayor: 'mayors-cup', club: 'club-championship', night: 'night-golf' });
  assert.equal(emblemOfTitle("Mayor's Cup"), 'mayors-cup');
  assert.equal(emblemOfTitle('Club Championship 1986'), 'club-championship');
  assert.equal(emblemOfTitle('Tour event'), 'tour-event');
  const outs = new Set(SINGLES.map((s: { out: string }) => s.out));
  for (const e of ['mayors-cup', 'club-championship', 'night-golf', 'tour-event', 'club-crest']) assert.ok(outs.has(`src/assets/ui/emblems/${e}.webp`), e);
  assert.ok(outs.has('src/assets/ui/art/swing-meter-face.webp') && outs.has('src/assets/ui/art/spin-ball.webp'));
  for (const s of SINGLES) if (s.words === null) assert.doesNotMatch(s.subject, /reads [A-Z]/, `${s.id}: no words asked for`);
});

test('#1300: every shack prop is in the library, never a card, and loads as a new or second-hand one', async () => {
  const { SECOND_HAND } = await art();
  const shacks = LIBRARY.filter(i => /shack|shanty|tarp/i.test(i.id) && i.id.startsWith('newprop:'));
  assert.equal(shacks.length, 29);
  for (const s of shacks) assert.ok(isShackProp(s.id), `${s.id} is a shack prop`);
  for (const [shack, nu] of Object.entries(SHACK_PROPS)) {
    assert.ok(ids.has(shack), shack); assert.ok(ids.has(nu), nu); assert.ok(!isShackProp(nu), `${nu} is no shack`);
    const painting = SECOND_HAND.find((b: { id: string }) => b.id === SHACK_PAINTING[shack]);
    assert.ok(painting?.shacks.includes(shack), `${shack}: the art table paints its replacement`);
  }
  for (const d of DECOR) assert.ok(!isShackProp(d.id), `${d.key} is a shack card`);
  assert.ok(!DECOR.some(d => /shack|shanty|tarp/i.test(d.name)), 'no card is named for a shack');
  // an old save's tuple: the new prop until the second-hand painting is packed, then that
  const has = (id: string) => ids.has(id) || id.startsWith('range:second-hand-');
  assert.deepEqual(shackTuple(['newprop:shanty-toilet', 1, 2, 0, 1, 0, 'newprop-shanty-toilet'], has), ['newprop:portable-toilets', 1, 2, 0, 1, 0, 'newprop-portable-toilets']);
  const views = { 'second-hand-toilets': ['range:second-hand-toilets-view1', 'range:second-hand-toilets-view2'] };
  assert.equal(shackReplacement('newprop:shanty-toilet', has, views), 'range:second-hand-toilets-view1');
  const keep = ['newprop:medical-tent', 1, 2, 0, 1] as const;
  assert.equal(shackTuple(keep, has), keep, 'any other prop is untouched');
  assert.equal(SECOND_HAND_ITEMS.length, SECOND_HAND.length, 'range-art-items.json lists every second-hand painting');
  assert.notEqual(SALE_SIGN, 'newprop:shanty-signpost'); assert.equal(SALE_SIGN, saleSignId()); assert.ok(ids.has(SALE_SIGN));
});

test('#1300: the shabby tier is the second-hand one, cheaper than new', () => {
  assert.ok(!LIBRARY.some(i => /shabby/i.test(i.cat)), 'no category says shabby');
  const sh = LIBRARY.filter(i => / \(second-hand\)$/.test(i.cat) && !isShackProp(i.id));
  assert.ok(sh.length >= 20);
  for (const i of sh) { assert.equal(i.cost, 300, i.id); assert.equal(tierOfCat(i.cat), 'second-hand'); }
  assert.equal(tierOfCat('New: Stalls'), 'new'); assert.equal(tierOfCat('New: Trees'), null);
  assert.equal(tierCat('New: Stalls (shabby)'), 'New: Stalls (second-hand)');
  assert.equal(secondHandPrice(500), 300); assert.equal(secondHandPrice(1500), 900);
  for (const d of DECOR.filter(d => d.group.endsWith('(second-hand)'))) assert.match(d.desc, /bought used/);
});

test('#1300: your range\'s scenes never pick a shack picture', () => {
  for (const slug of SHACK_SCENES) for (const want of [HARD_TIMES, GOOD_TIMES]) assert.notEqual(pickPicture(slug, want)?.state, 'rundown', slug);
  const pic = (state: string) => ({ slug: "range-road", state, file: `range-road-${state}.webp`, w: 1, h: 1, bytes: 1, width: 1, quality: 80, version: 1, source: "", sha256: "" });
  const m = { ...SCENE_MANIFEST, pictures: [pic('rundown'), pic('second-hand'), pic('upgraded')] } as typeof SCENE_MANIFEST;
  assert.equal(pickPicture('range-road', HARD_TIMES, m)?.state, 'second-hand');
  assert.equal(pickPicture('range-road', GOOD_TIMES, m)?.state, 'upgraded');
  assert.equal(pickPicture('hitting-bays', HARD_TIMES)?.state, 'rundown', 'a run-down picture with no shack stays');
});

test('#1300: the first clubhouse is the second-hand 1950s one, never the shack', () => {
  assert.ok(ids.has(FIRST_CLUBHOUSE));
  const index = new Map(LIBRARY.map((it, i) => [it.id, i] as const));
  const ps = businessArt({ id: 1, type: 'clubhouse', x: 10, y: 10, w: 20, h: 12 }, LIBRARY, index);
  assert.ok(ps.length > 0);
  for (const p of ps) assert.doesNotMatch(LIBRARY[lookOf(p).item]!.id, /shanty|shack/);
});

test('the importer cuts placeholder pictures into the game\'s files and refuses one with no transparency', async () => {
  const sharp = (await import(['sharp'][0]!)).default;
  const { prep1304And1300 } = await import(pathToFileURL(path.resolve('scripts/assets/prep-1304-1300.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'art1304-')), inDir = path.join(tmp, 'in'), out = path.join(tmp, 'out'), gen = path.join(tmp, 'gen');
  fs.mkdirSync(inDir); fs.mkdirSync(path.join(out, 'src/assets/scenes'), { recursive: true });
  fs.copyFileSync('src/assets/scenes/manifest.json', path.join(out, 'src/assets/scenes/manifest.json'));
  try {
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    const svgPng = async (w: number, h: number, body: string, bg = clear) => sharp({ create: { width: w, height: h, channels: 4, background: bg } }).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`) }]).png().toBuffer();
    // a 4 x 3 sheet of navy rounded squares on a transparent ground (the v14 tile sheet's shape)
    let cards = ''; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cards += `<rect x="${40 + c * 300}" y="${40 + r * 290}" width="250" height="250" rx="30" fill="#1E2A44"/><circle cx="${165 + c * 300}" cy="${165 + r * 290}" r="60" fill="#c84"/>`;
    fs.writeFileSync(path.join(inDir, 'golf-build-tool-tiles-sheet-1view-v14.png'), await svgPng(1240, 920, cards));
    fs.writeFileSync(path.join(inDir, 'emblem-mayors-cup-1view-e1.png'), await svgPng(1024, 1024, '<circle cx="512" cy="512" r="300" fill="#d4a017"/>'));
    fs.writeFileSync(path.join(inDir, 'emblem-mayors-cup-1view-e2.png'), await svgPng(1024, 1024, '<rect x="300" y="200" width="400" height="600" fill="#d4a017"/>'));
    fs.writeFileSync(path.join(inDir, 'spin-ball-1view-e1.png'), await svgPng(800, 800, '<circle cx="400" cy="400" r="380" fill="#eee"/>'));
    fs.writeFileSync(path.join(inDir, 'swing-meter-face-1view-e1.png'), await svgPng(1200, 800, '<path d="M100 600 A500 500 0 0 1 1100 600 Z" fill="#b8860b"/>'));
    fs.writeFileSync(path.join(inDir, 'emblem-night-golf-1view-e1.png'), await svgPng(600, 600, '<circle cx="300" cy="300" r="200" fill="#123"/>', { r: 255, g: 255, b: 255, alpha: 1 }));
    let bits = ''; for (let k = 0; k < 12; k++) bits += `<ellipse cx="${150 + (k % 4) * 300}" cy="${130 + Math.floor(k / 4) * 260}" rx="${30 + k * 4}" ry="20" fill="#a98"/>`;
    fs.writeFileSync(path.join(inDir, 'desert-litter-pieces-1view-e1.png'), await svgPng(1200, 780, bits));
    for (const v of ['view1', 'view2']) fs.writeFileSync(path.join(inDir, `second-hand-toilets-${v}-s1.png`), await svgPng(900, 600, '<polygon points="300,500 450,575 600,500 600,250 450,175 300,250" fill="#68a"/>'));
    fs.writeFileSync(path.join(inDir, 'scene-range-road-second-hand-1view-s1.png'), await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#7a6' } }).png().toBuffer());

    const r = await prep1304And1300({ inDir, gen, out, range: false });
    const meta = async (f: string) => sharp(path.join(out, f)).metadata();
    // the tiles
    for (const t of TOOL_TILES_V14) { const m = await meta(`src/assets/ui/tiles/${t}.webp`); assert.equal(m.width, 144, t); }
    assert.ok(fs.existsSync(path.join(gen, 'ui/golf-build-tool-tiles-sheet-v14.png')), 'the source kept beside the older sheets');
    assert.match(r.lines.join('\n'), /icons v15: waiting/);
    // the emblem: the newest version (the tall rectangle), trimmed, at most 256 px
    const em = await meta('src/assets/ui/emblems/mayors-cup.webp'); assert.equal(em.height, 256); assert.ok(em.width! < 200, 'the newest picture, trimmed');
    assert.equal((await meta('src/assets/ui/art/spin-ball.webp')).width, 272);
    const face = await meta('src/assets/ui/art/swing-meter-face.webp'); assert.deepEqual([face.width, face.height], [600, 356]);
    // a picture on a backdrop is refused, never keyed
    assert.ok(!fs.existsSync(path.join(out, 'src/assets/ui/emblems/night-golf.webp')));
    assert.match(r.lines.join('\n'), /emblem-night-golf: .*no transparent background/);
    // the litter: twelve trimmed pieces and their list
    const lit = JSON.parse(fs.readFileSync(path.join(out, 'src/assets/desert-litter/desert-litter-pieces.json'), 'utf8'));
    assert.equal(lit.pieces.length, 12);
    assert.ok((await meta('src/assets/desert-litter/desert-litter-pieces-0.webp')).width! < 120, 'trimmed to the piece');
    // the second-hand building: both views where prep-range-art looks
    assert.ok(fs.existsSync(path.join(gen, 'buildings/second-hand-toilets-view1-v1.png')) && fs.existsSync(path.join(gen, 'buildings/second-hand-toilets-view2-v1.png')));
    // the scene: its webp and its manifest row
    assert.equal((await meta('src/assets/scenes/range-road-second-hand.webp')).width, 1024);
    const man = JSON.parse(fs.readFileSync(path.join(out, 'src/assets/scenes/manifest.json'), 'utf8'));
    assert.equal(man.pictures.filter((p: { slug: string; state: string }) => p.slug === 'range-road' && p.state === 'second-hand').length, 1);
    // a second run is the same (the manifest row replaced, not added)
    await prep1304And1300({ inDir, gen, out, range: false });
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'src/assets/scenes/manifest.json'), 'utf8')).pictures.length, man.pictures.length);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
