// T378 (#1034): the pure half of scripts/dev/osm-course-catalogue.mjs: the regions the catalogue is built from, the two Overpass queries a region is asked, how
// their answers become catalogue entries, and how the entries are packed into the compact JSON chunks the game lazy-loads (public/catalogue/). No network, no disk:
// tests/golf-osm-catalogue.test.ts runs it on made-up answers. The format it writes is read by src/game/golf/osm/catalogue.ts (the entry is a tuple, see ENTRY below).
// LICENCE: the data is (c) OpenStreetMap contributors under the ODbL 1.0; every chunk and the index carry the credit.

export const UA = 'CapitalEmpire-catalogue/1.0 (dev script)';
export const CREDIT = '© OpenStreetMap contributors';
export const LICENCE = 'ODbL 1.0 (https://www.openstreetmap.org/copyright)';
/** the public Overpass servers, in the order they are tried when nothing is known of their health (the main one answers most; on 2026-11-09 it gave 502 or took 40 s to
 *  answer its own status page, and two mirrors hung: the script falls over and remembers which server answered last) */
export const SERVERS = [
  'https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter',
];

/** the countries, in the order they are asked: the owner's order first (South Africa, the US, the UK and Ireland, Australia, Canada, New Zealand), then the rest by how
 *  many golf courses they have (the R&A's count, rounded: only the order matters). [ISO 3166-1 alpha-2, approximate golf courses] */
export const COUNTRIES = [
  ['ZA', 410], ['US', 16700], ['GB', 3100], ['IE', 500], ['AU', 1600], ['CA', 2300], ['NZ', 400],
  ['JP', 3000], ['DE', 1050], ['FR', 800], ['KR', 800], ['SE', 660], ['CN', 600], ['ES', 480], ['IT', 440], ['NL', 420], ['AR', 330], ['DK', 310], ['TH', 260], ['MY', 250],
  ['IN', 230], ['MX', 200], ['FI', 190], ['NO', 190], ['AT', 160], ['ID', 150], ['BR', 130], ['CZ', 100], ['TW', 100], ['CH', 100], ['PH', 100], ['PT', 90], ['BE', 80],
  ['IS', 65], ['PL', 60], ['VN', 50], ['CO', 50], ['ZW', 40], ['KE', 40], ['CL', 40], ['RU', 40], ['TR', 30], ['DO', 25], ['PK', 25], ['SG', 20], ['EG', 20], ['MA', 20],
  ['PE', 20], ['UY', 20], ['PR', 20], ['AE', 15], ['JM', 15], ['BS', 15], ['HU', 15], ['SK', 15], ['SI', 15], ['HR', 15], ['RO', 15], ['BG', 15], ['GR', 15], ['UA', 15],
  ['SA', 15], ['NG', 15], ['VE', 15], ['TN', 12], ['BY', 10], ['LT', 10], ['LV', 10], ['EE', 10], ['KH', 10], ['BW', 10], ['NA', 10], ['EC', 10], ['CR', 10], ['PA', 10],
  ['BB', 7], ['LK', 8], ['MM', 8], ['ZM', 8], ['TZ', 8], ['MU', 8], ['FJ', 8], ['PG', 8], ['GT', 8], ['BM', 8], ['LU', 6], ['CY', 6], ['HK', 6], ['RS', 5], ['KZ', 5],
  ['NP', 5], ['UG', 5], ['MW', 5], ['MZ', 5], ['GH', 5], ['NC', 5], ['PF', 5], ['GU', 5], ['BO', 5], ['PY', 5], ['BN', 3], ['LA', 3], ['QA', 3], ['OM', 3], ['CI', 3],
  ['SV', 3], ['HN', 3], ['NI', 3], ['TT', 3], ['BD', 3], ['MT', 2], ['UZ', 2], ['MN', 2], ['MO', 2], ['IL', 2], ['JO', 2], ['KW', 2], ['LB', 2], ['SN', 2], ['AO', 2],
  ['SZ', 2], ['ET', 2], ['SC', 2], ['BZ', 2], ['KY', 2], ['AW', 2], ['CW', 2], ['LI', 1], ['BH', 1], ['DZ', 1], ['LS', 1], ['CU', 1], ['HT', 1],
];

/** the US states and DC (ISO 3166-2 US-xx), the busiest first: the US is asked one state at a time (a state's answer is a few hundred courses, not sixteen thousand) */
export const US_STATES = [
  ['FL', 'Florida'], ['CA', 'California'], ['TX', 'Texas'], ['MI', 'Michigan'], ['NY', 'New York'], ['OH', 'Ohio'], ['PA', 'Pennsylvania'], ['NC', 'North Carolina'],
  ['IL', 'Illinois'], ['SC', 'South Carolina'], ['GA', 'Georgia'], ['WI', 'Wisconsin'], ['MN', 'Minnesota'], ['NJ', 'New Jersey'], ['AZ', 'Arizona'], ['VA', 'Virginia'],
  ['IN', 'Indiana'], ['MA', 'Massachusetts'], ['WA', 'Washington'], ['CO', 'Colorado'], ['MO', 'Missouri'], ['TN', 'Tennessee'], ['IA', 'Iowa'], ['MD', 'Maryland'],
  ['CT', 'Connecticut'], ['KS', 'Kansas'], ['OR', 'Oregon'], ['AL', 'Alabama'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['OK', 'Oklahoma'], ['NE', 'Nebraska'],
  ['ME', 'Maine'], ['NH', 'New Hampshire'], ['NV', 'Nevada'], ['UT', 'Utah'], ['AR', 'Arkansas'], ['MS', 'Mississippi'], ['ID', 'Idaho'], ['WV', 'West Virginia'],
  ['MT', 'Montana'], ['NM', 'New Mexico'], ['SD', 'South Dakota'], ['VT', 'Vermont'], ['HI', 'Hawaii'], ['DE', 'Delaware'], ['ND', 'North Dakota'], ['RI', 'Rhode Island'],
  ['WY', 'Wyoming'], ['AK', 'Alaska'], ['DC', 'District of Columbia'],
];

/** the English name of a country by its ISO code ("GB": "United Kingdom") */
export function countryName(cc) {
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch { return cc; }
}

/** a place of the map ranks (a city is looked for in a wider ring than a hamlet), and what the course's own town is taken from */
export const PLACE_KINDS = ['city', 'town', 'village', 'suburb', 'hamlet'];

/** the regions the catalogue is asked for, in order. A region is one Overpass area: a country, or (the US) one state. `only` limits it to these country codes.
 *  { id, cc, state (US only: [code, name]), area: [key, value] } */
export function regionsPlan(only) {
  const want = only?.length ? new Set(only.map(s => s.toUpperCase())) : null, out = [];
  for (const [cc] of COUNTRIES) {
    if (want && !want.has(cc)) continue;
    if (cc === 'US') for (const [code, name] of US_STATES) out.push({ id: `us-${code.toLowerCase()}`, cc, state: [code, name], area: ['ISO3166-2', `US-${code}`] });
    else out.push({ id: cc.toLowerCase(), cc, area: ['ISO3166-1', cc] });
  }
  return out;
}

const areaOf = r => `area["${r.area[0]}"="${r.area[1]}"]->.a;`;
/** the query that asks one region for its golf courses with a name (their tags and bounding boxes: no geometry) and, in the same answer, the numbered hole lines
 *  (golf=hole ways with a ref: their tags and centres), which say which courses have their holes mapped */
export function coursesQuery(r, timeoutS = 300) {
  return [
    `[out:json][timeout:${timeoutS}];`, areaOf(r),
    'nwr(area.a)["leisure"="golf_course"]["name"]->.c;', '.c out tags bb;',
    'way(area.a)["golf"="hole"]["ref"]->.h;', '.h out tags center;',
  ].join('\n');
}
/** the query for the named places of a country (as tab-separated text: lat, lon, name, kind), where a course with no address takes its town from */
export function placesQuery(r, kinds = PLACE_KINDS, timeoutS = 300) {
  return [`[out:csv(::lat, ::lon, name, place; false)][timeout:${timeoutS}];`, areaOf(r), `node(area.a)["place"~"^(${kinds.join('|')})$"]["name"];`, 'out;'].join('\n');
}
/** the region the US-wide places are asked for (one query for the whole country, the biggest places only: a state's hamlets are too many to ask for) */
export const usPlaces = { id: 'us', cc: 'US', area: ['ISO3166-1', 'US'] };

/** the places of a CSV answer: [{ lat, lon, name, kind }] (rows that do not read are left out) */
export function parsePlacesCsv(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const f = line.split('\t');
    if (f.length < 4) continue;
    const lat = Number(f[0]), lon = Number(f[1]), name = f[2].trim(), kind = f[3].trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !name || !PLACE_KINDS.includes(kind)) continue;
    out.push({ lat, lon, name, kind });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------- the nearest places
const KM = 111.32;
/** how far a kind of place reaches as "the course's own town": a metropolis is a long way from its edge, a hamlet is not a town at all (km) */
const REACH = { city: 40, town: 25, village: 10, suburb: 10, hamlet: 6 };
/** a nearer place wins unless a bigger one is nearly as near: the distance is scaled by this (a city 7 km away beats a hamlet 4 km away) */
const WEIGHT = { city: 0.55, town: 0.7, village: 0.9, suburb: 0.85, hamlet: 1.15 };

/** an index of places on a grid of 0.25 degrees: `near(lat, lon)` gives the course's own place ("Wingate Park": the nearest of any kind, a bigger one counting as nearer)
 *  and the town it belongs to ("Pretoria": a city within 20 km, else the nearest town within 25 km, else a city within 40 km), each by name, either '' when none is near */
export class Places {
  constructor(list) {
    this.cell = 0.25; this.grid = new Map(); this.count = 0;
    for (const p of list ?? []) {
      const k = this.key(p.lat, p.lon), a = this.grid.get(k);
      if (a) a.push(p); else this.grid.set(k, [p]);
      this.count++;
    }
  }
  key(lat, lon) { return `${Math.floor(lat / this.cell)},${Math.floor(lon / this.cell)}`; }
  /** the places within `km` of a point, with their distances */
  within(lat, lon, km) {
    const out = [], cl = Math.max(0.2, Math.cos(lat * Math.PI / 180)), rLat = km / KM / this.cell, rLon = km / (KM * cl) / this.cell;
    const y0 = Math.floor(lat / this.cell - rLat), y1 = Math.floor(lat / this.cell + rLat), x0 = Math.floor(lon / this.cell - rLon), x1 = Math.floor(lon / this.cell + rLon);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      for (const p of this.grid.get(`${y},${x}`) ?? []) {
        const d = Math.hypot((p.lat - lat) * KM, (p.lon - lon) * KM * cl);
        if (d <= km) out.push({ p, d });
      }
    }
    return out;
  }
  near(lat, lon) {
    let local = null, city = null, town = null;
    for (const { p, d } of this.within(lat, lon, 40)) {
      if (d > REACH[p.kind]) continue;
      const score = d * WEIGHT[p.kind];
      if (!local || score < local.score) local = { p, score };
      if (p.kind === 'city' && (!city || d < city.d)) city = { p, d };
      if (p.kind === 'town' && (!town || d < town.d)) town = { p, d };
    }
    // the town: a city within 20 km, else the nearest town (25 km), else a city further off (40 km): Wingate Park is in Pretoria, 9 km off, with the town of Irene nearer
    return { local: local?.p.name ?? '', town: ((city && city.d <= 20 ? city : null) ?? town ?? city)?.p.name ?? '' };
  }
}

// ---------------------------------------------------------------------------------------------------------------- entries
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const LATIN = /[A-Za-zÀ-ɏ]/;
/** a course's name for the list: its `name`, or its English name when the name is not in Latin letters and the map has one */
export function displayName(tags) {
  const name = clean(tags.name), en = clean(tags['name:en'] || tags.int_name);
  return !LATIN.test(name) && en ? en : name;
}
/** the other names a course answers to (the filter matches them; they are not shown): name:en, int_name, alt_name, short_name, old_name, official_name, and the
 *  name itself when the list shows its English name */
export function otherNames(tags, shown) {
  const seen = new Set([shown.toLowerCase()]), out = [];
  for (const raw of [tags.name, tags['name:en'], tags.int_name, tags.alt_name, tags.short_name, tags.old_name, tags.official_name]) {
    for (const part of String(raw ?? '').split(';')) { const s = clean(part); if (s && !seen.has(s.toLowerCase())) { seen.add(s.toLowerCase()); out.push(s); } }
  }
  return out.join(' | ');
}

const R = 6371008.8;
/** a course's centre and size from an Overpass element read with `out tags bb`: [lat, lon, width m, height m] (a node is a point: size 0), or null with no position */
export function geometryOf(el) {
  const b = el.bounds;
  if (b && [b.minlat, b.maxlat, b.minlon, b.maxlon].every(Number.isFinite)) {
    const lat = (b.minlat + b.maxlat) / 2, lon = (b.minlon + b.maxlon) / 2, cl = Math.cos(lat * Math.PI / 180);
    return [lat, lon, Math.round((b.maxlon - b.minlon) * cl * Math.PI / 180 * R), Math.round((b.maxlat - b.minlat) * Math.PI / 180 * R)];
  }
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon, 0, 0] : null;
}

const CELL = 0.05;
/** the course whose bounding box holds each hole line (the smallest, when two do), and how many of the holes 1..18 each has: { ref ("w123") -> distinct numbers } */
export function holesOf(courses, holeEls) {
  const grid = new Map(), box = new Map();
  const add = (k, c) => { const a = grid.get(k); if (a) a.push(c); else grid.set(k, [c]); };
  for (const c of courses) {
    if (!c.b) continue;
    box.set(c.ref, c.b);
    const y0 = Math.floor(c.b[0] / CELL), y1 = Math.floor(c.b[1] / CELL), x0 = Math.floor(c.b[2] / CELL), x1 = Math.floor(c.b[3] / CELL);
    if ((y1 - y0 + 1) * (x1 - x0 + 1) > 400) continue; // (a "course" the size of a county: not a place the holes can be told to)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) add(`${y},${x}`, c);
  }
  const nums = new Map(), pad = 0.0003;
  for (const h of holeEls) {
    const lat = h.center?.lat ?? h.lat, lon = h.center?.lon ?? h.lon, m = /^\s*(\d{1,2})\s*$/.exec(h.tags?.ref ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !m) continue;
    const n = Number(m[1]);
    if (n < 1 || n > 18) continue;
    let best = null;
    for (const c of grid.get(`${Math.floor(lat / CELL)},${Math.floor(lon / CELL)}`) ?? []) {
      const b = c.b;
      if (lat < b[0] - pad || lat > b[1] + pad || lon < b[2] - pad || lon > b[3] + pad) continue;
      const area = (b[1] - b[0]) * (b[3] - b[2]);
      if (!best || area < best.area) best = { c, area };
    }
    if (best) { const s = nums.get(best.c.ref); if (s) s.add(n); else nums.set(best.c.ref, new Set([n])); }
  }
  return nums;
}

/** the catalogue's entries of a region's course answer. `places` (a Places) names the town of a course the map gives no address; `suffix` (the US state's code) is
 *  added to the place. An entry is the tuple ENTRY: [ref ("w4261725": way, "r" relation, "n" node), name, place, lat, lon, width and height in 10 m, hole lines
 *  numbered 1..18 inside it (the game calls a course Full when all 9 or 18 are there), other names for the filter ('' none), country code ('' when the chunk holds one country)] */
export function entriesOf(json, opt = {}) {
  const els = json?.elements ?? [], courses = [], holeEls = [];
  for (const el of els) {
    if (el.tags?.leisure === 'golf_course') {
      const g = geometryOf(el), name = displayName(el.tags ?? {});
      if (!g || name.length < 2 || !['node', 'way', 'relation'].includes(el.type)) continue;
      const ref = el.type[0] + el.id, b = el.bounds ? [el.bounds.minlat, el.bounds.maxlat, el.bounds.minlon, el.bounds.maxlon] : null;
      courses.push({ ref, el, g, name, b });
    } else if (el.tags?.golf === 'hole') holeEls.push(el);
  }
  const numbered = holesOf(courses, holeEls), out = [];
  for (const c of courses) {
    const t = c.el.tags ?? {}, [lat, lon, w, h] = c.g;
    const town = clean(t['addr:city'] || t['addr:town'] || t['addr:village'] || t['addr:municipality']), sub = clean(t['addr:suburb'] || t['addr:hamlet'] || t['addr:district']);
    let parts;
    if (town) parts = [sub, town]; else { const n = opt.places?.near(lat, lon); parts = n ? [n.local, n.town] : []; }
    const seen = new Set(), place = [...parts, opt.suffix ?? ''].map(clean).filter(s => s && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase())).join(', ');
    out.push([
      c.ref, c.name, place, Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4, Math.min(9999, Math.round(w / 10)), Math.min(9999, Math.round(h / 10)),
      numbered.get(c.ref)?.size ?? 0, otherNames(t, c.name), opt.cc ?? '',
    ]);
  }
  return out;
}

/** the key names are sorted and matched by: lower case, accents and the letters NFD cannot take apart folded away */
export function fold(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[æÆ]/g, 'ae').replace(/[øØ]/g, 'o').replace(/[łŁ]/g, 'l').replace(/[đĐ]/g, 'd').replace(/œ/gi, 'oe').replace(/ı/g, 'i').toLowerCase();
}

/** the same course twice (a point and a polygon of the same name, a few hundred metres apart) is one: the one with the bigger outline stays. Entries are tuples */
export function dedupe(entries) {
  const byName = new Map(), drop = new Set();
  entries.forEach((e, i) => { const k = fold(e[1]); const a = byName.get(k); if (a) a.push(i); else byName.set(k, [i]); });
  const near = (a, b) => Math.hypot((a[3] - b[3]) * KM, (a[4] - b[4]) * KM * Math.cos(a[3] * Math.PI / 180)) < 0.6;
  for (const idx of byName.values()) {
    if (idx.length < 2) continue;
    for (let x = 0; x < idx.length; x++) for (let y = x + 1; y < idx.length; y++) {
      const a = entries[idx[x]], b = entries[idx[y]];
      if (drop.has(idx[x]) || drop.has(idx[y]) || a[0] === b[0] || !near(a, b)) continue;
      const area = e => e[5] * e[6] + e[7] * 1000;
      drop.add(area(a) >= area(b) ? idx[y] : idx[x]);
    }
  }
  return entries.filter((_, i) => !drop.has(i));
}

// ---------------------------------------------------------------------------------------------------------------- chunks
/** the entry tuple's fields, for the readers */
export const ENTRY = ['ref', 'name', 'place', 'lat', 'lon', 'w10', 'h10', 'holes', 'alt', 'cc'];

/** the chunks of a catalogue: each country with MIN_OWN or more courses is a chunk on its own; the smaller ones are packed together, in the order they are asked, up
 *  to PACK_MAX entries to a pack (a pack's entries carry their country code). `countries`: [{ cc, entries }] in asking order. Returns [{ id, cc ('' for a pack), entries }] */
export const MIN_OWN = 150, PACK_MAX = 700;
export function packChunks(countries) {
  const out = [], small = [];
  for (const c of countries) {
    if (!c.entries.length) continue;
    if (c.entries.length >= MIN_OWN) out.push({ id: c.cc.toLowerCase(), cc: c.cc, entries: c.entries.map(e => { const t = e.slice(); t[9] = ''; return t; }), at: c.at });
    else small.push(c);
  }
  let pack = null, n = 0;
  for (const c of small) {
    if (!pack || pack.entries.length + c.entries.length > PACK_MAX) { pack = { id: `rest${++n}`, cc: '', entries: [], at: c.at }; out.push(pack); }
    for (const e of c.entries) { const t = e.slice(); t[9] = c.cc; pack.entries.push(t); }
    if (c.at && (!pack.at || c.at < pack.at)) pack.at = c.at;
  }
  for (const k of out) k.entries.sort((a, b) => (fold(a[1]) < fold(b[1]) ? -1 : fold(a[1]) > fold(b[1]) ? 1 : a[0] < b[0] ? -1 : 1));
  return out;
}

/** a chunk's file text: compact JSON, one entry a line (so a diff of two builds reads) */
export function chunkText(chunk, built) {
  const lines = chunk.entries.map(e => JSON.stringify(trimTail(e)));
  return `{"v":1,"cc":${JSON.stringify(chunk.cc)},"credit":${JSON.stringify(CREDIT)},"at":${JSON.stringify(chunk.at ?? built)},"e":[\n${lines.join(',\n')}\n]}\n`;
}
/** an entry without its empty tail ('' other names, '' country): the reader fills them in */
function trimTail(e) { const t = e.slice(); while (t.length > 8 && (t[t.length - 1] === '' || t[t.length - 1] === undefined)) t.pop(); return t; }
