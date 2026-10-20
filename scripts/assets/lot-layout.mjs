// The house-lot generator: a TrickOrTreat-style lot (the owner's Maple Falls map, measured in output/lotstudy) as builder
// placements in metres, for one lot size, facing and story. Rendered to one sprite by prep-lots.mjs (lot-render.mjs).
//
// Lot frame (metres): X along the street 0..W, Y across 0..D, the street on the +Y side (Y = D, the lot's front edge). A
// rear lot (street on the -Y side) is laid out the same way and mirrored in Y, with the house's rear view.
// What the owner's map does, and what this follows (22 houses, per house): the house at scale 1.2-1.45 set 5-7 m back from
// the walk; a slab walk to the door and a paved drive on one side, a car on half of them; 5 plants against the house,
// 1-2 maples or oaks at 1.2-2.2, 2 pines along the back; 1-2 Halloween pieces at the porch; a back-yard structure and one or
// two pieces of yard furniture; ~16 leaf decals, ~4 dirt patches, pinecones under the pines. The game draws the wooden
// privacy fences and their planting/ground decals separately on shared lot lines; front yards stay open.
//
// Every flat decal the builder library has is covered by a SCENARIO below (or excluded with a reason), and every scenario
// scales with the lot (its lawn area, fence length, trees and story).
import { LIB } from './lot-render.mjs';
import { fromBranch } from './source.mjs';
import { REMOVED } from './removed.mjs';
import { SCALE_OVERRIDES } from './overrides.mjs';

/** the owner's placement scales (places-v5 scales.json: the scale each sprite is drawn at on the Maple Falls map) */
const SCALES = JSON.parse((await fromBranch('town/builder-in-repo', 'scripts/town-builder/places-v5/scales.json')).toString('utf8'));
/** the builder's corrected footprints (collision-overrides.json; some base boxes have their axes swapped) */
let OVR = {}; try { OVR = JSON.parse((await fromBranch('main', 'scripts/town-builder/collision-overrides.json')).toString('utf8')); } catch { /* none */ }

/** a seeded random stream (mulberry32) */
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ok = id => { const i = LIB.get(id); return !!i && !i.hidden && !REMOVED.has(id); };
const have = ids => ids.filter(ok);

// ---------------------------------------------------------------- the flat decals: one scenario each (or a reason)
/** scenario -> the decal ids it lays. Every flat, unhidden library decal is in exactly one list or in EXCLUDED. */
export const SCENARIOS = {
  walk: ['paint:slabs-tile-2_5m-1', 'paint:slabs-tile-2_5m-2', 'paint:slabs-tile-5m-1', 'paint:slabs-tile-5m-2'],          // the slab walk, door to sidewalk
  patio: ['paint:slabs-square-4m-1', 'paint:slabs-square-4m-2', 'paint:slabs-square-8m-1', 'paint:slabs-blob-8m-1', 'paint:slabs-blob-8m-2', 'paint:slabs-blob-8m-3'], // a patio at the back door (party, retired)
  drive: ['paint:pavement-square-4m-1', 'paint:pavement-square-4m-2', 'paint:pavement-blob-4m-1', 'paint:pavement-blob-4m-2', 'paint:pavement-blob-4m-3', 'paint:pavement-blob-4m-4', 'paint:pavement-square-8m-1', 'paint:pavement-blob-8m-1', 'paint:pavement-blob-8m-2', 'paint:pavement-blob-8m-3', 'paint:pavement-blob-2m-1', 'paint:pavement-blob-2m-2', 'paint:pavement-blob-2m-3'], // the drive, kerb to garage
  blacktop: ['paint:asphalt-square-4m-1', 'paint:asphalt-square-4m-2', 'paint:asphalt-blob-4m-1', 'paint:asphalt-blob-4m-2', 'paint:asphalt-blob-4m-3', 'paint:asphalt-blob-4m-4', 'paint:asphalt-square-8m-1', 'paint:asphalt-blob-8m-1', 'paint:asphalt-blob-8m-2', 'paint:asphalt-blob-8m-3', 'paint:asphalt-blob-2m-1', 'paint:asphalt-blob-2m-2', 'paint:asphalt-blob-2m-3'], // a blacktop drive instead (40% of lots)
  stepping: ['paint:slabs-blob-2m-1', 'paint:slabs-blob-2m-2', 'paint:slabs-blob-2m-3', 'paint:slabs-blob-4m-1', 'paint:slabs-blob-4m-2', 'paint:slabs-blob-4m-3', 'paint:slabs-blob-4m-4'], // stepping stones from the back door to the yard's main piece
  carSpot: ['town:oil_stain', 'gen:oil-stain-big'],                       // under the parked car
  driveWear: ['town:wheel_wear', 'town:paving_wear'],                     // the drive mouth and the turn into the garage
  playWear: ['paint:dirt-blob-2m-1', 'paint:dirt-blob-2m-2', 'paint:dirt-blob-2m-3', 'town:bare_grass'], // under swings, trampolines, the doghouse, the hoop
  gardenBed: ['paint:dirt-square-4m-1', 'paint:dirt-square-4m-2', 'paint:dirt-square-8m-1'],            // a vegetable bed (retired, worker)
  bareYard: ['paint:dirt-blob-4m-1', 'paint:dirt-blob-4m-2', 'paint:dirt-blob-4m-3', 'paint:dirt-blob-4m-4', 'paint:dirt-blob-8m-1', 'paint:dirt-blob-8m-2', 'paint:dirt-blob-8m-3'], // worn-out back yards (mechanic, neglected), the shed's apron
  muddyGate: ['town:mud_grass'],                                          // where the side path meets the back yard, by the hose
  fenceLeaves: ['gen:drift-1', 'gen:drift-2', 'gen:drift-3', 'gen:drift-4', 'gen:drift-5', 'gen:drift-6', 'gen:drift-7', 'gen:drift-8'], // blown against the fences, in the inner corners
  treeLeaves: ['decal:decal-06-orange-leaf-scatter', 'decal:decal-07-red-leaf-cluster', 'decal:decal-08-yellow-leaf-scatter', 'decal:scatter-tiny-leaves'], // under and downwind of each maple or oak
  houseLeaves: ['town:leaf_drift'],                                       // in the corners of the house and the porch steps
  lawn: ['decal:decal-01-lush-grass', 'decal:decal-02-dry-golden-grass', 'decal:decal-03-moss-groundcover', 'decal:decal-04-low-weeds', 'decal:decal-05-thin-grass'], // breaking up the lawn, by its area
  fenceTufts: ['decal:scatter-grass-tufts'],                              // along the fence bases
  pineFloor: ['gen:pinecones-needles'],                                   // under every pine
  deadwood: ['gen:twigs-branches'],                                       // under dead trees and big old maples
  candy: ['gen:litter-candy', 'poi:candy-soda-litter'],                   // on the front walk after trick or treat
  paper: ['town:paper_litter', 'gen:litter-newspaper', 'poi:newspaper-cup-litter', 'poi:flyer-tape-litter'], // the newspaper on the drive, a flyer by the mailbox
  binBags: ['gen:rubbish-bags', 'gen:rubbish-cardboard', 'town:bag_litter'], // beside the bins at the kerb
  party: ['gen:litter-fastfood', 'poi:pizza-litter', 'expansion:can-litter', 'recovered:star-soda-spill', 'recovered:pizza-box-open'], // the morning after (party story)
  neglect: ['expansion:cloth-litter', 'recovered:tokens-ticket'],         // scattered in a neglected yard
  puddle: ['town:puddle', 'gen:puddle-small', 'gen:puddle-large'],        // a low spot of a dirt patch or the drive end
  gravel: ['town:gravel_spill', 'gen:gravel-spill'],                      // by the shed, at a gravel drive mouth
  tyreTracks: ['expansion:mud-tracks-x', 'expansion:mud-tracks-y', 'expansion:mud-long-x', 'expansion:mud-long-y', 'expansion:mud-arc', 'gen:wheel-tracks-mud'], // from the drive across the lawn to the junk car or trailer
  footprints: ['expansion:mud-footprints'],                               // from the back door down the yard (mechanic, neglected)
  workshop: ['expansion:paint-spill'],                                    // in front of the workbench or garage
  canopy: ['shadow:canopy'],                                              // the soft shade under each big tree
  bushShade: ['shadow:round-dark', 'shadow:round-soft'],                  // under bushes and the plants against the house
  longShade: ['shadow:long-soft', 'shadow:wide-faint'],                   // along the house's shady side and under the hedge
};
/** flat decals that never belong on a house lot, and why */
export const EXCLUDED = {
  arcade: [/^arcade:/, 'arcade floor decals: the arcade interior only'],
  road: [/^expansion:(gutter-leaves|storm-drain|manhole)|^gen:(manhole-drain|cracks-)/, 'road and kerb decals: the road painter places these'],
  hiddenSoil: [/^gen:(soil-damp|bare-grass-patch|chalk-hopscotch)$/, 'hidden by the owner in the builder'],
  variations: [/^variation:|^decal:decal-0[1-8].+-|^paint:.*-v\d/, 'variations: the scenario picks among the base decals'],
};
/** every flat, unhidden decal of the library: [scenario or 'excluded: why' or null when uncovered] */
export function coverage() {
  const out = [];
  for (const [id, it] of LIB) {
    if (!it.flat || it.hidden) continue;
    const sc = Object.entries(SCENARIOS).find(([, ids]) => ids.includes(id))?.[0];
    const ex = Object.values(EXCLUDED).find(([re]) => re.test(id));
    out.push([id, sc ?? (ex ? 'excluded: ' + ex[1] : null)]);
  }
  return out;
}

// ---------------------------------------------------------------- the uprights
// Picked from the builder library by rule (not by name), so new art is used as soon as the builder has it. Square-on views
// (tagged facing:south or facing:north) do not sit on an iso lot and are left out; corner views and the originals are kept.
const tagsOf = it => it.tags || [], baseOf = it => tagsOf(it).find(t => t.startsWith('variation-of:'))?.slice(13) ?? it.id;
const iso = it => !tagsOf(it).some(t => t === 'facing:south' || t === 'facing:north');
const all = f => [...LIB.values()].filter(it => !it.hidden && !it.flat && !REMOVED.has(it.id) && iso(it) && f(it)).map(it => it.id);
/** front-facing houses: the house sprites and their corner-view variations (no garages, no house backs) */
export const HOUSES = all(it => it.category === 'Houses' && /^(world:house_[0-9]|gen:house-)/.test(baseOf(it)));
/** rear views for lots whose street is behind them */
export const REARS = all(it => it.category === 'House rear & side views' && /-rear$/.test(baseOf(it)) && !/garage/.test(baseOf(it)));
const RUNDOWN = all(it => /rundown-house/.test(baseOf(it)));
const treeLike = it => it.category === 'Trees & plants' && /tree|pine|spruce|fir|maple|birch|oak/.test(it.id);
/** broadleaf trees, conifers and dead trees: every tree the library has */
export const MAPLES = all(it => treeLike(it) && !/pine|spruce|fir|dead/.test(it.id));
export const PINES = all(it => treeLike(it) && /pine|spruce|fir/.test(it.id));
const DEAD = all(it => treeLike(it) && /dead/.test(it.id));
/** cars that sit along a drive (the lot's Y axis, nose to the street or to the garage): the north/south cars and the diagonal
 *  (:4) views of the east/west ones */
export const CARS = all(it => it.category === 'Vehicles' && !/bus/.test(it.id) && (/_[ns](-v2)?$/.test(it.id) || /(compact|pickup|van)_[ew](-v2)?-[0-9a-f]+:4$/.test(it.id) || /^world:car_0$|world-car_[12]-[0-9a-f]+:4$/.test(it.id)));
const PLANTS = have(['town:hydrangea', 'town:fern', 'town:ornamental_grass', 'world:bush_0', 'world:bush_1', 'world:bush_2', 'ref:halloween-mums']);
const PUMPKINS = have(['world:pumpkin_0', 'world:pumpkin_1']);
const SPOOKY = have(['ref:halloween-hay-bales', 'ref:halloween-pumpkin-cluster', 'gen:inflatable-pumpkin', 'ref:halloween-sheet-ghost', 'world:scarecrow', 'expansion:blowmold-ghost', 'expansion:yard-spider', 'expansion:yard-coffin', 'ref:halloween-witch-sign', 'ref:halloween-lantern', 'world:grave_0', 'world:grave_1', 'world:grave_2']);
/** cars by the way they face: s = +Y (toward a front street), n = -Y */
/** the back yard by household: [structures (one or two, the biggest first), furniture and toys (two to four)] */
const STORIES = {
  family: [have(['expansion:trampoline', 'world:swings', 'expansion:sandbox', 'expansion:kiddie-pool']), have(['expansion:tricycle', 'expansion:wagon', 'gen:kids-bikes', 'expansion:doghouse', 'expansion:basketball-hoop', 'expansion:washing-line'])],
  retired: [have(['expansion:glasshouse', 'expansion:patio-swing', 'expansion:chicken-coop']), have(['expansion:rain-barrel', 'expansion:compost-bin', 'expansion:garden-pump', 'expansion:birdhouse-post', 'world:bench', 'expansion:garden-hose'])],
  worker: [have(['expansion:lean-to-shed', 'expansion:boat-trailer', 'expansion:canoe']), have(['expansion:woodpile', 'expansion:rideon-mower', 'expansion:lawn-roller', 'expansion:washing-line', 'expansion:leaf-bags'])],
  party: [have(['expansion:aboveground-pool', 'expansion:hot-tub', 'expansion:backyard-tent']), have(['expansion:firepit', 'expansion:barbecue', 'expansion:lawn-chair', 'gen:cooler-lawnchairs', 'expansion:camping-cooler', 'expansion:brick-barbecue'])],
  dreamer: [have(['expansion:skate-ramp', 'expansion:backyard-tent', 'expansion:treehouse']), have(['expansion:backyard-telescope', 'expansion:homemade-gokart', 'expansion:soapbox-racer', 'expansion:carseat-bench', 'expansion:doghouse'])],
  mechanic: [have(['expansion:junk-car', 'expansion:boat-trailer', 'expansion:lean-to-shed']), have(['expansion:scrap-engine', 'expansion:tyre-stack', 'expansion:yard-workbench', 'expansion:air-compressor', 'expansion:oil-drums', 'expansion:motorcycle-front'])],
  neglected: [have(['expansion:junk-car', 'expansion:outhouse']), have(['expansion:appliance-pile', 'expansion:attic-trunk', 'expansion:crt-curb', 'expansion:tyre-stack', 'expansion:antique-pram'])],
};
export const STORY_NAMES = Object.keys(STORIES);
/** parked cars at the size the game draws cars on the road (src/game/sprites.ts CAR_SCALE) */
const CAR_SCALE = 0.8;
/** the owner's scale for a sprite (a variation takes its original's), or 1 */
export const ownerScale = id => { const it = LIB.get(id); const b = it ? baseOf(it) : id; return SCALE_OVERRIDES[id] ?? SCALES[id]?.scale ?? SCALES[b]?.scale ?? 1; };
/** the owner's map scale for a sprite, ignoring the studio's overrides */
export const mapScale = id => { const it = LIB.get(id); const b = it ? baseOf(it) : id; return SCALES[id]?.scale ?? SCALES[b]?.scale ?? 1; };

/** does a house fit a W x D lot at the owner's scale (with the deepest setback and room for a back yard) */
export const fitsLot = (id, W, D) => { const s = ownerScale(id), [hx, hy] = half(id, s); return 2 * hx <= W - 0.8 && 2 * hy <= D - 7 - 9; };
/** the footprint half extents (metres) of a sprite at scale s (its base box; swapped when mirrored) */
function half(id, s = 1, flip = false) {
  const it = LIB.get(id), boxes = OVR[id]?.boxes ?? OVR[baseOf(it)]?.boxes;
  let hx, hy;
  if (boxes?.length) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const b of boxes) { x0 = Math.min(x0, (b.dx || 0) - b.hx / 2); x1 = Math.max(x1, (b.dx || 0) + b.hx / 2); y0 = Math.min(y0, (b.dy || 0) - b.hy / 2); y1 = Math.max(y1, (b.dy || 0) + b.hy / 2); } hx = (x1 - x0) / 2; hy = (y1 - y0) / 2; }
  // fw, fh: the footprint in tiles (2 m) along world X and Y, so the half extents in metres are fw and fh (the base boxes of some
  // sprites have their axes swapped)
  else if (it.fw && it.fh) { hx = it.fw; hy = it.fh; }
  else { const b = it.base ?? { hx: 0.5, hy: 0.5 }; hx = b.hx; hy = b.hy; }
  return flip ? [hy * s, hx * s] : [hx * s, hy * s];
}

/**
 * The placements of one house lot, W x D metres, front street on +Y (rear = false) or -Y (rear = true), for a story.
 * Returns { items: [{ id, x, y, flip, scale, z? }], house } in the lot frame.
 */
export function layoutLot({ W, D, rear = false, story = 'family', seed = 1, house: houseId, car: carId }) {
  const r = rng(seed), pick = a => a[Math.floor(r() * a.length)], between = (a, b) => a + (b - a) * r();
  const items = [], ups = [];   // ups: placed upright footprints [x0, y0, x1, y1] for spacing
  const put = (id, x, y, o = {}) => { if (!id || !ok(id)) return null; const p = { id, x: +x.toFixed(3), y: +y.toFixed(3), flip: !!o.flip, scale: +(o.scale ?? 1).toFixed(3), ...(o.z != null ? { z: o.z } : {}) }; items.push(p); return p; };
  /** an upright where it fits: inside the lot, clear of the paved strips and of every upright placed so far (with a gap) */
  const free = (x0, y0, x1, y1, gap = 0.3) => x0 >= 0.2 && y0 >= 0.2 && x1 <= W - 0.2 && y1 <= D - 0.2 && !ups.some(u => x0 < u[2] + gap && x1 > u[0] - gap && y0 < u[3] + gap && y1 > u[1] - gap);
  const own = (id, j = 0.06) => ownerScale(id) * between(1 - j, 1 + j);
  const stand = (id, x, y, o = {}) => { if (!id || !ok(id)) return null; const s = o.scale ?? own(id, o.jit); o = { ...o, scale: s }; const [hx, hy] = half(id, s, o.flip); if (!o.force && !free(x - hx, y - hy, x + hx, y + hy, o.gap ?? 0.3)) return null; ups.push([x - hx, y - hy, x + hx, y + hy]); return put(id, x, y, o); };
  /** try a few seeded spots in a rectangle for an upright */
  const somewhere = (id, x0, y0, x1, y1, o = {}) => { for (let k = 0; k < 14; k++) { const p = stand(id, between(x0, x1), between(y0, y1), o); if (p) return p; } return null; };
  const decal = (sc, x, y, s = 1, o = {}) => put(pick(have(SCENARIOS[sc])), Math.min(W - 0.3, Math.max(0.3, x)), Math.min(D - 0.3, Math.max(0.3, y)), { scale: s, flip: r() < 0.5, z: o.z ?? 0 });

  // ---- the house: the biggest that leaves room for the drive, 5-7 m back from the front edge
  const neg = story === 'neglected', DW = 3.2, setback = between(5, 7);
  const pool = rear ? REARS : neg && RUNDOWN.length ? RUNDOWN : HOUSES;   // a rear lot shows a rear view, run down or not
  let best = null;
  const order = houseId ? [houseId, ...[...pool].sort(() => r() - 0.5)] : [...pool].sort(() => r() - 0.5);
  for (const id of order) {
    if (best) break;
    const s = own(id, 0.03), [hx, hy] = half(id, s);
    if (2 * hx <= W - 0.8 && 2 * hy <= D - setback - 9) best = { id, s, w: 2 * hx, d: 2 * hy, hx, hy };
  }
  if (!best) { const id = pick(pool), [hx, hy] = half(id, 1); const s = Math.min(1.45, (W - 0.8) / (2 * hx), (D - setback - 9) / (2 * hy)); best = { id, s, w: 2 * hx * s, d: 2 * hy * s, hx: hx * s, hy: hy * s }; }
  // the drive runs beside the house when there is room, else straight up to the garage end of the house front
  const side = best.w <= W - DW - 0.8, driveLeft = r() < 0.5;
  const hx0 = side ? (driveLeft ? DW + 0.4 : 0.4) : 0.4, hcx = hx0 + best.hx + between(0, Math.max(0, (side ? W - DW - 0.8 : W - 0.8) - best.w)), front = D - setback, hcy = front - best.hy;
  const house = stand(best.id, hcx, hcy, { scale: best.s, force: true });
  const back = front - best.d;   // the house's back wall (Y)

  // ---- the drive and the walk (paint), the car, the bins at the kerb
  const dx = side ? (driveLeft ? DW / 2 + 0.2 : W - DW / 2 - 0.2) : hcx + (driveLeft ? -1 : 1) * (best.hx - DW / 2 - 0.2), driveEnd = side ? Math.max(back + 1, front - 4) : front + 0.3;
  const surface = r() < 0.4 ? 'blacktop' : 'drive';
  for (let y = D - 1.6; y > driveEnd - 1; y -= 2.6) decal(surface, dx, y, 0.8, { z: 1 });
  ups.push([dx - DW / 2, driveEnd, dx + DW / 2, D]);
  decal('driveWear', dx, D - 1.2, 0.8, { z: 2 });
  let doorX = hcx + between(-0.25, 0.25) * best.w; if (!side && Math.abs(doorX - dx) < DW / 2 + 1) doorX = dx - (driveLeft ? -1 : 1) * (DW / 2 + 1.2);
  for (let y = D - 0.8; y > front + 0.4; y -= 1.5) decal('walk', doorX, y, 0.6, { z: 1 });
  ups.push([doorX - 0.8, front, doorX + 0.8, D]);
  if (story !== 'neglected' && r() < 0.6) {
    const cy = D - 2.8, car = carId ?? pick(CARS);
    if (car) { put(car, dx, cy, { scale: CAR_SCALE }); decal('carSpot', dx, cy + 0.4, 0.8, { z: 2 }); }
  }
  if (r() < 0.3) decal('paper', dx + between(-0.8, 0.8), D - between(1, 4), 0.8, { z: 3 });
  const kerbX = driveLeft ? DW + 1.0 : W - DW - 1.0;
  stand('gen:trash-cans-row', kerbX, D - 0.7, { force: true });
  stand('world:mailbox', kerbX + (driveLeft ? 1.3 : -1.3), D - 0.5, { force: true });
  decal('binBags', kerbX + (driveLeft ? 1.0 : -1.0), D - 1.4, 0.8, { z: 3 });
  if (r() < 0.4) stand('expansion:leaf-bags', kerbX + (driveLeft ? 2.4 : -2.4), D - 0.8, {});

  // ---- the porch: pumpkins either side of the door, mums at the steps, candy litter on the walk; a display for some
  if (!neg) {
    for (const sx of [-1, 1]) if (r() < 0.8) stand(pick(PUMPKINS), doorX + sx * between(1.0, 1.4), front + 0.6, { scale: between(0.9, 1.2), gap: 0.05 });
    if (r() < 0.5) stand('ref:halloween-mums', doorX + (r() < 0.5 ? -1.8 : 1.8), front + 0.9, { gap: 0.05 });
    if (r() < 0.45) decal('candy', doorX, between(front + 1, D - 1), 0.7, { z: 3 });
    if (r() < 0.35) for (let k = 0, n = 1 + Math.floor(r() * 2); k < n; k++) somewhere(pick(SPOOKY), 0.8, front + 1.2, W - 0.8, D - 1.2, { scale: between(0.9, 1.2) });
  }
  // the plants against the house front, a shade under each
  for (let x = hcx - best.hx + 0.6; x < hcx + best.hx - 0.4; x += between(1.2, 1.8)) {
    if (Math.abs(x - doorX) < 1.1) continue;
    const p = stand(pick(PLANTS), x, front + 0.7, { scale: between(0.8, 1.15), gap: 0.05 });
    if (p && r() < 0.5) decal('bushShade', x + 0.3, front + 0.9, 0.6);
  }
  for (const sx of [-1, 1]) for (let y = front - 0.8; y > back + 0.6; y -= between(1.4, 2.2)) { const x = hcx + sx * (best.hx + 0.7); const p = stand(pick(PLANTS), x, y, { scale: between(0.8, 1.1), gap: 0.05 }); if (p) decal('bushShade', x + 0.3, y + 0.3, 0.55); }
  for (let y = front + 1.4; y < D - 1.2; y += between(1.3, 1.8)) for (const sx of [-1, 1]) if (r() < 0.55) stand(pick(PLANTS), doorX + sx * 1.3, y, { scale: between(0.7, 0.95), gap: 0.05 });
  for (const cx of [0.9, W - 0.9]) if (r() < 0.6) stand(pick(PLANTS), cx, D - 1.0, { scale: between(0.9, 1.3) });
  for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) decal('houseLeaves', between(hcx - best.hx, hcx + best.hx), front + between(0.3, 0.9), between(0.7, 1.1), { z: 2 });
  decal('longShade', hcx + best.hx * 0.3, back - 0.6, 0.8);

  // no fences here: the game draws the fence grid on the lot lines as its own layer, with its own plants and decals
  // (src/game/lots/compose.ts fenceLayer), so a baked lot is the house and its yard only

  // ---- the back yard by story: one or two structures, two to four pieces; their wear on the grass
  const yard = [0.6, 0.6, W - 0.6, Math.max(1.4, back - 0.8)];
  const [big, small] = STORIES[story] ?? STORIES.family;
  const nBig = (back - 1 > 9 ? 2 : 1) * (r() < 0.85 ? 1 : 0), nSmall = 2 + Math.floor(r() * 3 * Math.min(1, (W * back) / 160));
  const wornUnder = new Set(['expansion:trampoline', 'gen:back-swingset', 'expansion:doghouse', 'expansion:basketball-hoop', 'expansion:sandbox', 'expansion:skate-ramp', 'expansion:homemade-gokart']);
  for (const id of [...big].sort(() => r() - 0.5).slice(0, nBig)) { const p = somewhere(id, ...yard, {}); if (p && wornUnder.has(id)) decal('playWear', p.x, p.y + 0.3, between(0.9, 1.3)); if (p && /shed|workbench|junk|trailer/.test(id)) decal(neg ? 'bareYard' : 'gravel', p.x + 0.5, p.y + 1.2, 0.9); }
  for (const id of [...small].sort(() => r() - 0.5).slice(0, nSmall)) { const p = somewhere(id, ...yard, {}); if (p && wornUnder.has(id)) decal('playWear', p.x, p.y + 0.2, 0.8); if (p && /workbench|compressor|scrap/.test(id)) decal('workshop', p.x + 0.4, p.y + 0.8, 0.8); }
  // stepping stones from the back door to the first structure, worn grass beside them
  const main = items.find(p => big.includes(p.id));
  if (main) { const n = Math.max(2, Math.round(Math.hypot(main.x - hcx, main.y - back) / 1.2)); for (let k = 1; k < n; k++) { const t = k / n; decal('stepping', hcx + (main.x - hcx) * t, back + (main.y - back) * t, 0.45, { z: 1 }); } decal('playWear', (hcx + main.x) / 2 + 0.6, (back + main.y) / 2, 0.8); }
  if (story === 'retired' || (story === 'worker' && r() < 0.5)) decal('gardenBed', W * between(0.3, 0.7), Math.max(1.6, back * 0.4), between(0.8, 1.1));
  if (story === 'party' || story === 'retired') decal('patio', hcx, back - 1.6, between(0.55, 0.7));
  if (story === 'party') for (let k = 0; k < 3; k++) decal('party', between(1, W - 1), between(1, back - 1), 0.8, { z: 3 });
  if (story === 'mechanic' || neg) {
    decal('tyreTracks', dx, Math.max(2, back - 2), 1.0); decal('footprints', hcx, back - 2.2, 0.9);
    for (let k = 0; k < 2; k++) decal('bareYard', between(1.5, W - 1.5), between(1.5, back - 1.5), between(0.7, 1.1));
    if (r() < 0.6) decal('puddle', between(2, W - 2), between(2, back - 2), 0.9, { z: 2 });
  }
  if (neg) for (let k = 0; k < 4; k++) decal('neglect', between(1, W - 1), between(1, D - 1), 0.8, { z: 3 });
  if (!neg && r() < 0.3) decal('puddle', dx, driveEnd + 0.6, 0.7, { z: 2 });
  decal('muddyGate', driveLeft ? DW + 0.6 : W - DW - 0.6, back + 0.4, 0.8);

  // ---- trees: pines along the back fence, a maple or oak front and back (bigger lots get more); a dead one when neglected;
  // each with its shade, the pines with cones and needles, the maples with leaves downwind and twigs under the big ones
  const nPine = Math.max(1, Math.round(W / 14)) + (r() < 0.35 ? 1 : 0), nMaple = 1 + (D > 26 ? 1 : 0) + (W > 14 && r() < 0.5 ? 1 : 0);
  const trees = [], deck = list => { const d = [...list].sort(() => r() - 0.5); let k = 0; return () => d[k++ % d.length]; }, nextPine = deck(PINES), nextMaple = deck(MAPLES);
  for (let k = 0; k < nPine; k++) { const p = somewhere(neg && r() < 0.5 ? pick(DEAD) : nextPine(), 0.9, 0.8, W - 0.9, Math.min(4, back - 1), { jit: 0.15, gap: 0.6 }); if (p) trees.push(p); }
  const mapleSpots = [[0.9, front + 1, W - 0.9, D - 1.6], [0.9, 1, W - 0.9, back - 1], [0.9, 1, W - 0.9, back - 1]];
  for (let k = 0; k < nMaple; k++) { const p = somewhere(nextMaple(), ...mapleSpots[k], { jit: 0.15, gap: 0.8 }); if (p) trees.push(p); }
  for (const t of trees) {
    const pine = /pine|spruce/.test(t.id), dead = /dead/.test(t.id), big = t.scale > 2;
    decal('canopy', t.x + 0.3, t.y + 0.3, t.scale * (pine ? 0.3 : 0.45));
    if (pine) decal('pineFloor', t.x + between(-0.4, 0.4), t.y + between(0, 0.6), between(0.6, 0.9), { z: 1 });
    else if (!dead) { for (let k = 0, n = 2 + Math.floor(r() * 2 + (big ? 2 : 0)); k < n; k++) decal('treeLeaves', t.x + between(-1, 3), t.y + between(-1, 3), between(0.5, 0.9), { z: 1 }); decal('fenceLeaves', t.x + between(0.5, 2.5), t.y + between(0.5, 2.5), between(0.6, 1.0), { z: 1 }); }
    if (dead || (big && r() < 0.5)) decal('deadwood', t.x + between(-0.5, 1), t.y + between(0, 1), between(0.6, 0.9), { z: 1 });
  }

  // ---- every open patch of lawn filled from a jittered grid ~2.2 m apart: a plant, a young tree or a small nature cluster
  // (grass, moss and leaf decals), wherever it fits clear of the house, the paving and what is already there (the side lines
  // stay clear for the fence layer's planting)
  const young = id => ownerScale(id) * between(0.55, 0.8);

  for (let y = 1.6; y < D - 1.3; y += 2.2) for (let x = 1.9; x < W - 1.8; x += 2.2) {
    const px = x + between(-0.7, 0.7), py = y + between(-0.7, 0.7), u = r();
    if (u < 0.34) stand(pick(PLANTS), px, py, { scale: between(0.75, 1.1), gap: 0.3 });
    else if (u < 0.42) { const id = r() < 0.6 ? nextMaple() : nextPine(); const p = stand(id, px, py, { scale: young(id), gap: 0.7 }); if (p) decal(/pine|spruce/.test(id) ? 'pineFloor' : 'treeLeaves', px + 0.4, py + 0.5, 0.6, { z: 1 }); }
    else if (u < 0.75 && free(px - 0.8, py - 0.8, px + 0.8, py + 0.8, 0)) { decal('lawn', px, py, between(0.45, 0.75)); decal(r() < 0.6 ? 'treeLeaves' : 'fenceLeaves', px + between(-0.6, 0.6), py + between(-0.6, 0.6), between(0.45, 0.8), { z: 1 }); }
  }

  // ---- the lawn: grass decals and leaf scatters by area (one per ~30 m2 and ~45 m2 of open lawn)
  const lawn = W * D - best.w * best.d - DW * (D - driveEnd);
  for (let k = 0, n = Math.round(lawn / 18); k < n; k++) decal('lawn', between(0.8, W - 0.8), between(0.8, D - 0.8), between(0.4, 0.7));
  for (let k = 0, n = Math.round(lawn / 22); k < n; k++) decal('treeLeaves', between(0.8, W - 0.8), between(0.8, D - 0.8), between(0.45, 0.8), { z: 1 });
  for (let k = 0, n = Math.round(lawn / 60); k < n; k++) decal('fenceLeaves', between(0.8, W - 0.8), between(0.8, D - 0.8), between(0.6, 1.1), { z: 1 });
  for (let k = 0, n = Math.round(lawn / 120); k < n; k++) decal('playWear', between(1, W - 1), between(1, back - 1), between(0.8, 1.2));

  // a rear lot: the same lot mirrored in Y (the street on -Y), its decals and props keeping their art (the house is a rear view)
  if (rear) for (const p of items) p.y = +(D - p.y).toFixed(3);
  return { items, house };
}
