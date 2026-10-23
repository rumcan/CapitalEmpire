/** T017: export conserved runtime artwork at measured maximum normal camera/placement sizes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd(), OUT = 'art/theme-consistency', ZOOM = .3, DPR = 2;
const read = p => fs.readFile(path.join(ROOT, p), 'utf8');
const exists = async p => !!await fs.stat(path.join(ROOT, p)).catch(() => null);
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const writeChanged = async (file, data) => { if (!await exists(file) || hash(await fs.readFile(path.join(ROOT, file))) !== hash(data)) await fs.writeFile(path.join(ROOT, file), data); };
const slug = id => id.replace(/[^a-zA-Z0-9_-]/g, '-');
const json = async (p, value) => fs.writeFile(path.join(ROOT, p), JSON.stringify(value, null, 2) + '\n');
const sources = new Map(), pageMeta = new Map();
const previousInventory = await exists(`${OUT}/inventory.json`) ? JSON.parse(await read(`${OUT}/inventory.json`)) : {};
const previousItems = new Map((previousInventory.items ?? []).map(it => [it.id, it]));
const previousRasters = new Map((previousInventory.items ?? []).flatMap(it => [...it.display.rasters, ...it.display.configuredRasters ?? []].map(r => [r.file, { ...r, nativeSha256: it.source.nativeSha256 }])));

// Parse only generated literal data. No game modules, DOM, import side effects or walker frame evaluation.
function literal(text, name) {
  const declaration = new RegExp('(?:const|let)\\s+' + name + '\\b').exec(text);
  if (!declaration) throw Error(`Missing literal ${name}`);
  const equal = text.indexOf('=', declaration.index), start = text.slice(equal + 1).search(/[\[{]/) + equal + 1;
  let depth = 0, quote = '', escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '[' || c === '{') depth++;
    if ((c === ']' || c === '}') && --depth === 0) return text.slice(start, i + 1);
  }
  throw Error(`Unterminated ${name}`);
}
const parse = (text, name) => JSON.parse(literal(text, name).replace(/,\s*([\]}])/g, '$1'));
const cite = (file, text, needle) => `${file}:${text.slice(0, text.indexOf(needle)).split('\n').length}`;
const scalesText = await read('src/game/lots/scales.ts'), owner = parse(scalesText, 'OWNER_SCALE');
const removed = new Set(parse(scalesText, 'REMOVED_IDS'));
const libraryFiles = [
  ['src/game/library.ts', 'LIBRARY'], ['src/game/cars-library.ts', 'ITEMS'],
  ['src/game/east-library.ts', 'ITEMS'], ['src/game/business-library.ts', 'items'],
  ['src/game/construction-library.ts', 'ITEMS'], ['src/game/golf-library.ts', 'ITEMS'],
];
const pages = [], all = [], excluded = [];
for (const [file, name] of libraryFiles) {
  const text = await read(file), imports = new Map([...text.matchAll(/import\s+(\w+)\s+from\s+['"]([^'"]+\.(?:webp|png))['"]/g)]
    .map(m => [m[1], path.posix.normalize(path.posix.join(path.posix.dirname(file), m[2]))]));
  const pageName = name === 'LIBRARY' ? 'ATLAS_PAGES' : name === 'items' ? null : /const PAGES/.test(text) ? 'PAGES' : null;
  let localPages;
  if (pageName) localPages = JSON.parse(literal(text, pageName).replace(/\b([a-zA-Z]\w*)\b/g, '"$1"')).map(row => row.map(alias => imports.get(alias)));
  else {
    const mip0 = [...imports].filter(([alias]) => /^(?:m0|p\d+m0)$/.test(alias)).map(([, p]) => p);
    localPages = mip0.map(p => [p]);
  }
  if (!localPages.length || localPages.some(row => !row[0])) throw Error(`Unmapped atlas ${file}`);
  const offset = pages.length; pages.push(...localPages);
  sources.set(file, hash(text));
  for (const item of parse(text, name)) {
    if (removed.has(item.id) || (file.includes('east-library') && removed.has(item.id.replace(/^east:/, '')))) {
      excluded.push({ id: item.id, source: file, reason: 'REMOVED_IDS: not appended to runtime library' }); continue;
    }
    const atlas = localPages[item.tex[0]]?.[0];
    if (!atlas) throw Error(`Unmapped ${item.id} page ${item.tex[0]}`);
    all.push({ ...item, source: file, atlas, runtimePage: offset + item.tex[0] });
  }
}

const businessText = await read('src/game/business/art.ts'), catalogue = await read('src/game/business/catalogue.ts');
const engineText = await read('src/game/engine.ts'), tentsText = await read('src/game/golf/tents.ts');
const parcelSizes = new Map([...catalogue.matchAll(/id:\s*'([^']+)'[^\n]*footprint:\s*\{\s*w:\s*([\d.]+),\s*h:\s*([\d.]+)/g)]
  .map(m => [m[1], [+m[2], +m[3]]]));
const layout = businessText.slice(businessText.indexOf('const LAYOUT'), businessText.indexOf('/** Derive render-only'));
const businessScales = new Map();
const addBiz = (id, business, fraction) => {
  id = id.includes(':') ? id : 'business:' + id;
  const dims = parcelSizes.get(business); if (!dims) throw Error(`Missing parcel ${business}`);
  const width = all.find(it => it.id === id)?.w; if (!width) return;
  const scale = fraction ? 64 * (dims[0] + dims[1]) * fraction / width : owner[id] ?? 1;
  const list = businessScales.get(id) ?? []; list.push({ scale, context: `business parcel ${business} ${dims.join('x')} tiles`, citation: cite('src/game/business/art.ts', businessText, 'const it = library[item], scale') }); businessScales.set(id, list);
};
for (const m of layout.matchAll(/(\w+):\s*single\('([^']+)'\)/g)) addBiz(m[2], m[1], .88);
// Single-line stadium/estate/clubhouse entries and multiline golf/fishing entries.
let context = '';
for (const line of layout.split('\n')) {
  const type = /^\s*(\w+):\s*\[/.exec(line); if (type) context = type[1];
  for (const p of line.matchAll(/\[\s*'([^']+)'\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+(?:\s*\/\s*[\d.]+)?)/g)) {
    const [n, d = '1'] = p[2].split('/'); if (context) addBiz(p[1], context, +n / +d);
  }
}
const structures = new Map([...tentsText.matchAll(/id:\s*'([^']+)'[^\n]*footprint:\s*\{\s*w:\s*([\d.]+),\s*h:\s*([\d.]+)/g)].map(m => [m[1], [+m[2], +m[3]]]));
const structureArt = literal(engineText, 'STRUCTURE_SPRITE');
const structureScales = new Map();
for (const match of structureArt.matchAll(/(\w+):\s*'([^']+)'/g)) {
  const dims = structures.get(match[1]), it = all.find(x => x.id === match[2]); if (!dims || !it) continue;
  const bounds = it.boxes.reduce((b, q) => [Math.min(b[0], (q.dx - q.hx) / 2), Math.min(b[1], (q.dy - q.hy) / 2), Math.max(b[2], (q.dx + q.hx) / 2), Math.max(b[3], (q.dy + q.hy) / 2)], [Infinity, Infinity, -Infinity, -Infinity]);
  const scale = Math.min(dims[0] / (bounds[2] - bounds[0]), dims[1] / (bounds[3] - bounds[1])) * (owner[it.id] ?? 1);
  const list = structureScales.get(it.id) ?? []; list.push({ scale, context: `golf structure ${match[1]} ${dims.join('x')} tiles`, citation: cite('src/game/engine.ts', engineText, 'function structureScale') }); structureScales.set(it.id, list);
}

function category(it) {
  if (it.kind === 'lot') return 'composite-lots';
  if (it.kind === 'tree') return 'trees';
  if (it.kind === 'car' || /^business:golf-cart-(?:sw|se)$/.test(it.id)) return 'cars';
  if (['building', 'house', 'venue', 'gazebo', 'arcade'].includes(it.kind)) return 'buildings';
  if (it.source.includes('business-library')) return /(?:stadium|clubhouse|pro-shop|garage|pavilion|sportsbar|diner|buscompany|taxi$|casino|hotel|motel|villa|lodge|cabin|boathouse|kiosk|tackle$|driving-range)/.test(it.id) ? 'buildings' : null;
  return /(?:^|[:_-])(?:shed|shelter|kiosk|tent|stand|barn|outhouse|greenhouse|glasshouse|treehouse|phone[-_]booth|bus[-_]stop|cottage|cabin)(?:$|[:_-])/.test(it.id) ? 'buildings' : null;
}
function bounds(it, scale, carFactor = 1) {
  const k = scale * carFactor * ZOOM, q = it.quad;
  return { left: (q[0] - it.ax) * k, top: (q[1] - it.ay) * k, right: (q[2] - it.ax) * k, bottom: (q[3] - it.ay) * k, width: (q[2] - q[0]) * k, height: (q[3] - q[1]) * k };
}
async function savePNG(buffer, file, width, height) {
  const prior = previousRasters.get(file);
  if (prior?.nativeSha256 === hash(buffer) && prior.width === width && prior.height === height && await exists(file)) {
    if (hash(await fs.readFile(path.join(ROOT, file))) === prior.sha256) {
      const { nativeSha256, ...record } = prior; return record;
    }
  }
  const data = await sharp(buffer).ensureAlpha().resize(width, height, { fit: 'fill' }).png().toBuffer();
  await fs.writeFile(path.join(ROOT, file), data);
  const meta = await sharp(data).metadata(), stats = await sharp(data).stats();
  return { file, width: meta.width, height: meta.height, sha256: hash(data), alpha: { hasAlpha: meta.hasAlpha, min: stats.channels[3]?.min, max: stats.channels[3]?.max } };
}
await fs.mkdir(path.join(ROOT, OUT, 'exports'), { recursive: true });
const items = [], selected = all.filter(it => category(it));
selected.sort((a, b) => ['buildings', 'trees', 'cars', 'composite-lots'].indexOf(category(a)) - ['buildings', 'trees', 'cars', 'composite-lots'].indexOf(category(b)) || a.id.localeCompare(b.id));
for (const it of selected) {
  const cat = category(it), dir = `${OUT}/exports/${cat}`; await fs.mkdir(path.join(ROOT, dir), { recursive: true });
  if (!pageMeta.has(it.atlas)) { const data = await fs.readFile(path.join(ROOT, it.atlas)); pageMeta.set(it.atlas, { ...await sharp(data).metadata(), sha256: hash(data) }); }
  const meta = pageMeta.get(it.atlas), t = it.tex;
  const left = Math.round(t[1] * meta.width), top = Math.round(t[2] * meta.height), right = Math.round(t[3] * meta.width), bottom = Math.round(t[4] * meta.height);
  const crop = { left, top, width: right - left, height: bottom - top };
  if (left < 0 || top < 0 || right > meta.width || bottom > meta.height || crop.width < 1 || crop.height < 1) throw Error(`Invalid atlas crop ${it.id}`);
  const previous = previousItems.get(it.id);
  let buffer;
  if (previous?.source.atlasSha256 === meta.sha256 && JSON.stringify(previous.source.crop) === JSON.stringify(crop) && await exists(previous.source.native)) {
    const cached = await fs.readFile(path.join(ROOT, previous.source.native));
    if (hash(cached) === previous.source.nativeSha256) buffer = cached;
  }
  buffer ??= await sharp(path.join(ROOT, it.atlas)).extract(crop).png().toBuffer();
  const own = owner[it.id] ?? owner[it.id.replace(/^east:/, '')] ?? 1, car = it.kind === 'car' ? .88 : 1;
  const normalBusiness = businessScales.get(it.id) ?? [];
  const configuredScale = it.kind === 'car' ? 1 : normalBusiness.length ? Math.max(...normalBusiness.map(c => c.scale)) : own;
  const configuredContext = it.kind === 'car' ? 'ordinary parked/traffic car at instance scale1, with CAR_SCALE0.88 applied once (lots/compose.ts:200; sim/client.ts:354)' : normalBusiness.length ? 'largest actual current canonical business parcel placement; each contextual parcel fit is listed in scaleCandidates' : 'OWNER_SCALE/default normal prop placement at max camera zoom; seeded size variation and contextual structure fits are listed separately';
  const candidates = [
    { scale: it.kind === 'car' ? 1 : own, context: it.kind === 'car' ? 'ordinary parked/traffic car instance scale; OWNER_SCALE is not applied by lot car placement' : 'configured OWNER_SCALE or default 1', citation: it.kind === 'car' ? 'src/game/lots/compose.ts:200; src/game/sim/client.ts:354' : 'src/game/lots/scales.ts:2' },
    { scale: 1.6, context: 'player selected-prop resize upper bound', citation: cite('src/game/engine.ts', engineText, 'clamp(p.scale * f, 0.6, 1.6)') },
  ];
  if (cat === 'trees') candidates.push({ scale: own * 2.5, context: 'normal plant brush upper bound times OWNER_SCALE', citation: 'src/game/plant.ts:19; src/game/engine.ts:732' }, { scale: (owner[it.id] ?? 1.5) * 1.1, context: 'town tree seeded size upper bound', citation: 'src/game/towntrees.ts:37' });
  if (cat !== 'cars') candidates.push({ scale: own * 1.05 * (cat === 'trees' ? 1.1 : 1), context: 'lot scale with +5% seeded jitter; fence planting multiplier up to 1.1', citation: 'src/game/lots/compose.ts:200; src/game/lots/compose.ts:585' });
  candidates.push(...businessScales.get(it.id) ?? [], ...structureScales.get(it.id) ?? []);
  const max = Math.max(...candidates.map(c => c.scale)), configured = bounds(it, configuredScale, car), normal = bounds(it, max, car), base = `${dir}/${slug(it.id)}`;
  const native = `${base}.native.png`; if (!await exists(native) || hash(await fs.readFile(path.join(ROOT, native))) !== hash(buffer)) await fs.writeFile(path.join(ROOT, native), buffer);
  const views = [], configuredViews = [];
  for (const dpr of [1, DPR]) views.push({ dpr, ...await savePNG(buffer, `${base}.max${dpr === 1 ? '' : '@2x'}.png`, Math.max(1, Math.ceil(normal.width * dpr)), Math.max(1, Math.ceil(normal.height * dpr))) });
  for (const dpr of [1, DPR]) configuredViews.push({ dpr, ...await savePNG(buffer, `${base}.configured${dpr === 1 ? '' : '@2x'}.png`, Math.max(1, Math.ceil(configured.width * dpr)), Math.max(1, Math.ceil(configured.height * dpr))) });
  const direction = /:(SE|SW|NE|NW|S|W|N|E)$/.exec(it.id)?.[1] ?? (it.id.startsWith('east:') ? 'east' : null);
  const subject = it.id.replace(/^east:/, '').replace(/:(SE|SW|NE|NW|S|W|N|E)$/, '').replace(/^business:golf-cart-(sw|se)$/, 'business:golf-cart');
  items.push({ id: it.id, name: it.name, category: cat, kind: it.kind, subject, direction, status: 'exported',
    source: { library: it.source, librarySha256: sources.get(it.source), atlas: it.atlas, atlasSha256: meta.sha256, runtimePage: it.runtimePage, localPage: t[0], uv: t.slice(1), crop, native, nativeSha256: hash(buffer) },
    display: { w: it.w, h: it.h, ax: it.ax, ay: it.ay, quad: it.quad, ownerNominalScale: own, ownerNominalCSS: bounds(it, own, car), configuredScale, configuredContext, carFactor: car, configuredCSS: configured, configuredRasters: configuredViews, normalScaleUpper: max, normalMaxCSS: normal, scaleCandidates: candidates, rasters: views },
  });
}

const sourceOnly = [];
for (const version of ['trees-v1', 'trees-v2']) {
  const manifest = `src/assets/vegetation/${version}/manifest.json`; if (!await exists(manifest)) continue;
  for (const entry of JSON.parse(await read(manifest)).items) {
    if (all.some(it => it.id === `capital:${entry.id}`)) continue;
    const file = path.posix.join(path.posix.dirname(manifest), entry.file), id = `${version}:${entry.id}`;
    if (!await exists(file)) { sourceOnly.push({ id, category: 'trees', status: 'unavailable-source', source: { manifest, file } }); continue; }
    const buffer = await fs.readFile(path.join(ROOT, file)), meta = await sharp(buffer).metadata();
    const output = `${OUT}/exports/trees/${slug(id)}.source-only.png`, encoded = await sharp(buffer).ensureAlpha().png().toBuffer(); await writeChanged(output, encoded);
    sourceOnly.push({ id, name: entry.id, category: 'trees', subject: id, status: 'exported-source-only', source: { manifest, file, sha256: hash(buffer), reference: output, referenceSha256: hash(encoded), width: meta.width, height: meta.height }, display: null, limitation: 'Source-only art has no runtime LibItem/world scale. Native reference exported; maximum in-game size is undefined until integrated.' });
  }
}
// Selected manifest source sheets only: no recursive discovery of old revisions, individual crops or corrections.
const grassTreeSources = [], grassSourceManifests = [];
for (const [folder, ids] of [
  ['trees', ['golden-maple-mature-4views', 'golden-maple-young-4views', 'orange-oak-mature-4views', 'copper-beech-4views']],
  ['budget-props', ['red-maple-4views', 'blue-green-conifer-4views']],
]) {
  const roots = ['art/grass-management', 'output/theme-consistency/prior-trees/art/grass-management'];
  let sourceRoot = null, manifestFile = null;
  for (const root of roots) if (await exists(`${root}/${folder}/manifest.json`)) { sourceRoot = root; manifestFile = `${root}/${folder}/manifest.json`; break; }
  const retained = `${OUT}/source-manifests/T016-${folder}.json`;
  if (!manifestFile && await exists(retained)) manifestFile = retained;
  if (!manifestFile) continue;
  const manifestBuffer = await fs.readFile(path.join(ROOT, manifestFile));
  await fs.mkdir(path.join(ROOT, OUT, 'source-manifests'), { recursive: true });
  if (manifestFile !== retained) await writeChanged(retained, manifestBuffer);
  grassSourceManifests.push({ manifest: retained, sha256: hash(manifestBuffer), sourceBranch: 'arena/T016-grass-management', selectedIds: ids });
  const manifest = JSON.parse(manifestBuffer);
  for (const entry of manifest.assets.filter(a => ids.includes(a.id))) {
    const id = `grass-art:${entry.id}`, originalSource = `art/grass-management/${entry.source}`;
    const reference = `${OUT}/exports/trees/${slug(id)}.source-only.png`;
    const file = sourceRoot && await exists(`${sourceRoot}/${entry.source}`) ? `${sourceRoot}/${entry.source}` : reference;
    if (!await exists(file)) { sourceOnly.push({ id, category: 'trees', subject: id, status: 'unavailable-source', source: { manifest: retained, originalSource } }); continue; }
    const buffer = await fs.readFile(path.join(ROOT, file)), meta = await sharp(buffer).metadata();
    if (file !== reference) await writeChanged(reference, buffer);
    grassTreeSources.push(originalSource);
    sourceOnly.push({ id, name: entry.id, category: 'trees', subject: id, status: 'exported-source-only', source: { manifest: retained, sourceBranch: 'arena/T016-grass-management', originalSource, file, sha256: hash(buffer), reference, referenceSha256: hash(buffer), width: meta.width, height: meta.height, existingDirections: manifest.angles ?? ['NE', 'SE', 'SW', 'NW'] }, display: null, limitation: 'Selected existing four-view source sheet, retained byte-for-byte. No runtime LibItem or placement scale; maximum in-game size undefined until integrated.' });
  }
}
const groups = new Map();
for (const it of [...items, ...sourceOnly].filter(it => it.category !== 'composite-lots')) {
  const id = it.subject ?? it.id, group = groups.get(id) ?? { id, category: it.category, name: it.name ?? it.id, sourceIds: [], references: [], desiredAngles: ['NE', 'SE', 'SW', 'NW'], status: 'pending-theme-reference' };
  group.sourceIds.push(it.id);
  if (it.display) group.references.push({ id: it.id, direction: it.direction, file: it.display.configuredRasters[1].file, sha256: it.display.configuredRasters[1].sha256, normalMaxFile: it.display.rasters[1].file, normalMaxSha256: it.display.rasters[1].sha256, native: it.source.native });
  else if (it.source.reference) group.references.push({ id: it.id, file: it.source.reference, sha256: it.source.referenceSha256 });
  groups.set(id, group);
}
const oldQueue = await exists(`${OUT}/queue.json`) ? JSON.parse(await read(`${OUT}/queue.json`)) : {};
const oldGroups = new Map((oldQueue.subjects ?? []).map(it => [it.id, it]));
const subjects = [...groups.values()].map(it => ({ ...it, ...oldGroups.get(it.id), sourceIds: it.sourceIds, references: it.references }))
  .sort((a, b) => ['buildings', 'trees', 'cars'].indexOf(a.category) - ['buildings', 'trees', 'cars'].indexOf(b.category) || a.id.localeCompare(b.id));
const counts = Object.fromEntries(['buildings', 'trees', 'cars', 'composite-lots'].map(cat => [cat, { runtimeViews: items.filter(it => it.category === cat).length, sourceOnly: sourceOnly.filter(it => it.category === cat).length, subjects: subjects.filter(it => it.category === cat).length }]));
const report = { schemaVersion: 1, task: 'T017', counts, policy: { zoom: ZOOM, dpr: DPR, dprCitation: 'src/game/engine.ts:657', zoomCitation: 'src/game/iso.ts:11', boundsCitation: 'src/game/sprites.ts:26', rasterRounding: 'ceil floating CSS width/height times DPR; retained exact CSS bounds define draw size', native: 'Conserved current mip0 atlas pixels, not original pre-atlas source pixels; mip0 density is not game zoom.', maximum: 'Largest audited configured/normal UI scale, including parcel and golf structure fits. Arbitrary Studio/script/save scales have no finite global maximum.', formula: 'CSS width=(quad[2]-quad[0])*instanceScale*carFactor*ZOOM_MAX; equivalent height; spriteRect anchor-relative bounds retained', sourceOnly: 'No invented runtime maximum for unintegrated artwork.' }, libraries: Object.fromEntries(sources), items, sourceOnly, excluded, excludedNonSubjects: all.filter(it => !category(it)).map(it => ({ id: it.id, kind: it.kind, reason: 'not a building, tree, car or composite lot' })), unavailable: [{ source: '../TrickOrTreat', reason: 'external original source archive unavailable; only retained runtime atlas artwork exported' }] };
report.supplementalSourceAudit = { vegetationManifests: ['src/assets/vegetation/trees-v1/manifest.json', 'src/assets/vegetation/trees-v2/manifest.json'], grassArtRoot: 'art/grass-management', grassTreeSources, grassSourceManifests, grassManifestPresent: await exists('art/grass-management/manifest.json'), note: 'Ground material/decal records are not tree subjects. Source-only foliage has no defined runtime maximum. Only six selected T016 manifest source sheets are queued, with revisions and individual crops excluded.' };
for (const item of report.excludedNonSubjects) item.reason = /crushed-car/.test(item.id) ? 'scrap pile decoration, not a drivable vehicle' : /rabbit-hutch/.test(item.id) ? 'animal enclosure decoration, outside building-scale structures' : /arcade_v2_booth/.test(item.id) ? 'arcade furnishing, not an arcade building' : item.id.startsWith('business:') ? 'golf ground surface, equipment or furniture; actual buildings and carts are inventoried separately' : `outside requested building, small shelter, tree and vehicle scope (kind ${item.kind})`;
await json(`${OUT}/inventory.json`, report);
await json(`${OUT}/queue.json`, { ...oldQueue, schemaVersion: 1, task: 'T017', order: ['buildings', 'trees', 'cars'], oneSubjectPerCall: true, themeReference: oldQueue.themeReference ?? null, subjects, counts: { total: subjects.length, exportedRuntimeViews: items.length, sourceOnly: sourceOnly.length, generated: subjects.filter(x => ['generated', 'reviewed', 'exported'].includes(x.status)).length, reviewed: subjects.filter(x => x.status === 'reviewed').length, pending: subjects.filter(x => !['generated', 'reviewed', 'exported'].includes(x.status)).length } });
console.log(JSON.stringify({ counts, totalRuntimeViews: items.length, totalSourceOnly: sourceOnly.length, subjects: subjects.length, pages: pages.length }, null, 2));
