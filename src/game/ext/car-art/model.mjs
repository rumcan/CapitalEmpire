// A car's model: every picture of one car (its facings, its views, its eight headings) is sized together in the sprite studio, so a resized car is the
// same size whichever way it faces. Plain JS so the game (ext/car-art/index.ts, typed by model.d.mts) and the asset scripts (the studio server.mjs,
// prep-cars.mjs, prep-sprites.mjs) share one rule. The rule, from the library's ids (every car id in it is covered by tests/car-model.test.ts):
//   variation:<prefix>-<name>-<hash>:<view>  a side/front/rear/corner view of the sprite <prefix>:<name> (the hash is 8 hex digits): its model's
//   cars:<model>:<heading>                   one of the eight headings of an eight-way car (art/cars): cars:<model>
//   static:<name>_<n|e|s|w>[-v<n>]           a facing of a town car (Compact N, Compact E, Compact N V2...): static:<name>
//   anything else                            its own model (world:car_0, world:schoolbus)
// The rule is for car ids only (the library's kind car): a building's variation views are not folded by it (size-report.ts sizeIdOf, server.mjs).
const VARIATION = /^variation:([a-z]+)-(.+)-[0-9a-f]{8}:\d+$/, EIGHT = /^(cars:.+):(?:SE|S|SW|W|NW|N|NE|E)$/, FOUR = /^(static:[a-z]+)_[nesw](?:-v\d+)?$/;
/** the model of a car id (the key its studio size is kept by: scale-overrides.json) */
export function carModel(id) {
  const v = VARIATION.exec(id); if (v) return carModel(`${v[1]}:${v[2]}`);
  return id.replace(EIGHT, '$1').replace(FOUR, '$1');
}
/** the models whose name is not read from their id */
export const CAR_MODEL_NAMES = { 'static:compact': 'Compact', 'static:pickup': 'Pickup', 'static:van': 'Van', 'world:schoolbus': 'School bus' };
/** a model's name on its studio card: the table's, else its id's name with its prefix dropped (cars:burgundy-wagon: Burgundy wagon; world:car_0: Car 0) */
export function carModelName(model) {
  return CAR_MODEL_NAMES[model] ?? model.replace(/^[a-z]+:/, '').replace(/[-_]+/g, ' ').replace(/^[a-z]/, c => c.toUpperCase());
}
/** a model's size in a sizes table (scale-overrides.json): its own key, and the largest of any size still kept under one of its pictures' ids (the
 *  per-facing keys of before T143: never lose a size the owner set); undefined when none is set */
export function carModelSize(sizes, model) {
  let m; for (const k of Object.keys(sizes)) { const v = sizes[k]; if (typeof v === 'number' && carModel(k) === model && (m === undefined || v > m)) m = v; }
  return m;
}
/** the sizes with every car's keys folded into its model's (carModelSize: the largest), the other keys as they are; carIds: the game's car ids (the
 *  library's kind car, the removed ones too), which say what is a car: a building's variation views keep their own keys. A new object */
export function foldCarSizes(sizes, carIds) {
  const models = new Set([...carIds].map(carModel)), out = {};
  for (const [k, v] of Object.entries(sizes)) { const m = models.has(carModel(k)) ? carModel(k) : k; out[m] = out[m] === undefined ? v : Math.max(out[m], v); }
  return out;
}
