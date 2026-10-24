// Road, town and place names (T012): seeded generators so a map feels lived in (the HUD, the bottleneck list
// "Maple Ave & 3rd St", toasts, map labels). Pure TS, no DOM: everything is a deterministic function of the
// constructor seed and the call's inputs, so a save needs only the seed. Never Math.random: the streams are
// mulberry (src/game/iso.ts) seeded by an FNV-1a hash of the inputs. Names are allocated once per road (the
// lead calls as roads and towns appear), not per sim step, so the cost is a few hashes per name.
import { mulberry } from '../../iso';
import type { ClassId } from '../../network';
import { MAPLE_VALLEY, type SettingData } from './maple-valley';

/** the settings a Names can generate for; add a data file (maple-valley.ts's SettingData shape) to add one */
export type SettingId = 'maple-valley';
/** the word lists by setting id */
export const SETTINGS: Record<SettingId, SettingData> = { 'maple-valley': MAPLE_VALLEY };
/** the road classes road() understands: the network's ClassId plus 'highway' (interstates, T004) */
export type RoadCls = ClassId | 'highway';

/** fields joined for hashing, and cache keys joined, with this separator (never in a name or a lead key) */
const SEP = '\u001f';
/** the input with its whitespace runs collapsed and its ends trimmed */
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** the FNV-1a hash (32-bit, avalanche finish) of s salted by seed: the seed of every per-name mulberry stream */
function hash32(seed: number, s: string): number {
  let h = (seed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x45d9f3b); h ^= h >>> 16;
  return h >>> 0;
}
/** an entry of a picked at a uniform index from rng */
const pick = <T>(rng: () => number, a: readonly T[]): T => a[Math.floor(rng() * a.length)]!;
/** a Fisher-Yates shuffle of a (the array itself, reordered) by rng */
function shuffled<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]!; a[i] = a[j]!; a[j] = t; }
  return a;
}
/** the possessive of a name ("Miller" -> "Miller's", "Kowalski" -> "Kowalski's", "Ross" -> "Ross'") */
const poss = (s: string): string => (s.endsWith('s') ? `${s}'` : `${s}'s`);
/** a business type id ("fish-and-tackle", "auto_repair") as display words ("Fish And Tackle", "Auto Repair") */
const title = (s: string): string => clean(s.replace(/[_-]+/g, ' ')).split(' ').filter(Boolean).map(x => (x === '&' ? x : x[0]!.toUpperCase() + x.slice(1).toLowerCase())).join(' ');

/** n with its ordinal suffix (1 -> "1st", 12 -> "12th", 23 -> "23rd"); n is floored, the sign kept */
export function ordinal(n: number): string {
  const a = Math.floor(n), r100 = Math.abs(a) % 100, r10 = Math.abs(a) % 10;
  const s = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return `${a}${s}`;
}

/** how big a road its name says it is, 7 down to 1 (I-84, Route 9, Boulevard, Avenue, County Road / Road,
 *  Street, Lane and the small suffixes): junction() puts the bigger road first by this. A name with no known
 *  suffix counts as a Street (2); abbreviated suffixes (Ave, St, CR 12) rank as their full forms. */
export function roadRank(name: string): number {
  const s = clean(name);
  if (/^(I-\d|Interstate\b)/i.test(s) || /\b(Freeway|Expressway)\b/i.test(s)) return 7;
  if (/^(Route|State Route|US|U\.S\.)\s*\d/i.test(s) || /\b(Highway|Hwy)\b/i.test(s)) return 6;
  if (/\b(Boulevard|Blvd)\.?$/i.test(s)) return 5;
  if (/\b(Avenue|Ave)\.?$/i.test(s)) return 4;
  if (/^(County (Road|Rd)|CR)\b/i.test(s) || /\b(Road|Rd)\.?$/i.test(s)) return 3;
  if (/\b(Street|St)\.?$/i.test(s) || /^\d+(st|nd|rd|th)$/i.test(s)) return 2;
  if (/\b(Lane|Ln|Court|Ct|Place|Pl|Drive|Dr|Trail|Alley|Way|Circle|Cir)\.?$/i.test(s)) return 1;
  return 2;
}

/** a road name's short form for labels ("Maple Avenue" -> "Maple Ave", "County Road 12" -> "CR 12",
 *  "3rd Street" -> "3rd St"; "Route 9" and "I-84" are already short). Idempotent. */
export function shortName(name: string): string {
  return clean(name)
    .replace(/^County (Road|Rd)\.?/i, 'CR')
    .replace(/\bBoulevard\.?$/i, 'Blvd')
    .replace(/\bAvenue\.?$/i, 'Ave')
    .replace(/\bStreet\.?$/i, 'St')
    .replace(/\bRoad\.?$/i, 'Rd')
    .replace(/\bLane\.?$/i, 'Ln')
    .replace(/\bDrive\.?$/i, 'Dr')
    .replace(/\bCourt\.?$/i, 'Ct')
    .replace(/\bPlace\.?$/i, 'Pl')
    .replace(/\bHighway\.?$/i, 'Hwy');
}

/** a road name without its class suffix ("Maple Avenue" -> "Maple"); numbered names have no stem and stay whole */
function stemOf(name: string): string {
  const s = clean(name);
  if (/^(I-\d|Route\s|State Route\s|County\s|CR\s)/i.test(s)) return s;
  const t = s.replace(/\s+(Boulevard|Blvd|Avenue|Ave|Street|St|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Trail|Highway|Hwy)\.?$/i, '');
  return t || s;
}

/** the display suffix of each named class; the numbered classes (road, arterial, highway) format their own */
const SUFFIX: Partial<Record<RoadCls, string>> = { gravel: 'Lane', lane: 'Lane', street: 'Street', avenue: 'Avenue', boulevard: 'Boulevard', 'drive-gravel': 'Drive', drive: 'Drive', 'drive-avenue': 'Drive', 'cart-dirt': 'Path', 'cart-slab': 'Path', cart: 'Path' };
/** the class ids and their aliases road() accepts (case-insensitive); an unknown class is a street */
const ALIAS: Record<string, RoadCls> = {
  gravel: 'gravel', dirt: 'gravel', unpaved: 'gravel', lane: 'lane', ln: 'lane', alley: 'lane', court: 'lane', ct: 'lane',
  street: 'street', st: 'street', road: 'road', rd: 'road', county: 'road', avenue: 'avenue', ave: 'avenue',
  arterial: 'arterial', route: 'arterial', state: 'arterial', boulevard: 'boulevard', blvd: 'boulevard',
  highway: 'highway', interstate: 'highway', freeway: 'highway', expressway: 'highway',
  // the golf course's drives (P19): a variant maps to its type's id, so all the drives take the Drive suffix
  'drive-gravel': 'drive-gravel', drive: 'drive', 'drive.tr': 'drive', 'drive-avenue': 'drive-avenue', 'drive-avenue.gr': 'drive-avenue', 'drive-avenue.gd': 'drive-avenue',
  // the course's cart paths (T084): the Path suffix
  'cart-dirt': 'cart-dirt', 'cart-slab': 'cart-slab', cart: 'cart',
};
/** the RoadCls of a class string the caller passes (an engine ClassId, 'highway', or an alias) */
const normCls = (cls: string): RoadCls => ALIAS[clean(cls).toLowerCase()] ?? 'street';
/** the town-cycle prefixes past the whole town pool (see town()) */
const TOWN_CYCLE = ['New ', 'North ', 'Port ', 'Fort ', 'Mount '];

/** The name generator of one map: build it from the map's seed, then ask it as towns, roads and places appear.
 *  Guarantees: the same seed and inputs give the same names (roads are cached by key, so a repeat call is the
 *  same string; across instances this holds for the same allocation order, which the engine's deterministic
 *  route order gives - only the rare keys whose first-choice stem or number collides probe onward), and road
 *  names never repeat within their scope: named roads within their nearTown (each town
 *  may have its own Main Street; inside one town a stem is used once across Lane, Street, Avenue and Boulevard),
 *  numbered roads (County Road, Route, I-) across the whole map. A road's key must be stable and unique within
 *  the map (the lead's route key is the natural choice): the same key is the same road, so a street widened to
 *  an avenue keeps its stem ("Maple Street" -> "Maple Avenue"). nearTown should be the deterministic nearest
 *  town (or omitted out in the country); it salts the draw and sets the no-repeat scope, never the name's text. */
export class Names {
  /** the map seed every name is drawn from (the only thing a save must keep) */
  readonly seed: number;
  /** the setting whose word lists are in use */
  readonly setting: SettingId;
  /** the setting's word lists */
  private d: SettingData;
  /** every single-stem candidate (trees, local, surnames, scenic) */
  private stems: string[];
  /** the town pool in draw order: the shuffled curated towns, then the shuffled generated ones */
  private pool: string[];
  /** the allocated stem by road key (named classes), and the stems used by scope (lowercase) */
  private stemByKey = new Map<string, string>();
  private usedStems = new Map<string, Set<string>>();
  /** the allocated name by category + road key (numbered classes), and the numbers used by category */
  private numByKey = new Map<string, string>();
  private usedNums = new Map<string, Set<number>>();

  /** a generator for one map: its seed, and its setting ('maple-valley' unless said) */
  constructor(seed: number, setting: SettingId = 'maple-valley') {
    this.seed = seed >>> 0;
    this.setting = setting in SETTINGS ? setting : 'maple-valley';
    this.d = SETTINGS[this.setting];
    this.stems = [...this.d.trees, ...this.d.local, ...this.d.surnames, ...this.d.scenic];
    const seen = new Set<string>(), curated = shuffled([...this.d.towns], mulberry(hash32(this.seed, 'towns')));
    for (const t of curated) seen.add(t.toLowerCase());
    const combos: string[] = [];
    for (const f of this.d.townFirst) for (const s of this.d.townSuffix) {
      const sw = s.trim();
      if (sw === f || sw === `${f}s`) continue;
      const t = f + s;
      if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); combos.push(t); }
    }
    this.pool = [...curated, ...shuffled(combos, mulberry(hash32(this.seed, 'towns2')))];
  }

  /** how many distinct town names town() serves before it starts prefixing ("New ...") */
  get townCount(): number { return this.pool.length; }

  /** the name of town i (i = 0, 1, 2, ... the caller's town index): pure in the seed and i, whatever order the
   *  towns are asked in, and distinct until the pool runs out (townCount names), then prefixed cycles of it */
  town(i: number): string {
    const n = this.pool.length, k = Number.isFinite(i) ? Math.floor(i) : 0, idx = ((k % n) + n) % n, base = this.pool[idx]!;
    if (k < n) return base;
    return TOWN_CYCLE[(Math.floor(k / n) - 1) % TOWN_CYCLE.length]! + base;
  }

  /** one candidate stem from rng: mostly a single stem, often a compound (Maple Ridge), sometimes qualified (North Maple) */
  private stemCandidate(rng: () => number): string {
    const r = rng();
    if (r < 0.52) return pick(rng, this.stems);
    if (r < 0.86) {
      const f = pick(rng, this.stems), secs = this.d.seconds;
      let si = Math.floor(rng() * secs.length);
      if (f.endsWith(secs[si]!)) si = (si + 1) % secs.length;
      return `${f} ${secs[si]!}`;
    }
    return `${pick(rng, this.d.prefixes)} ${pick(rng, this.stems)}`;
  }

  /** the stem of the road with this key in this scope: the first candidate in the key's own seeded probe
   *  sequence that the scope has not used, then cached by key for every later class of the same road */
  private stemFor(key: string, scope: string): string {
    const had = this.stemByKey.get(key);
    if (had) return had;
    let used = this.usedStems.get(scope);
    if (!used) { used = new Set(); this.usedStems.set(scope, used); }
    let stem = '';
    for (let a = 0; ; a++) {
      stem = this.stemCandidate(mulberry(hash32(this.seed, `road${SEP}${scope}${SEP}${key}${SEP}${a}`)));
      if (!used.has(stem.toLowerCase()) || a >= 10000) break;
    }
    if (used.has(stem.toLowerCase())) stem = `${stem} ${ordinal(used.size + 1)}`;
    used.add(stem.toLowerCase());
    this.stemByKey.set(key, stem);
    return stem;
  }

  /** the numbered name of the road with this key: the key's hashed start in the class's usual band, probed
   *  upward to a number unused on this map (County Road 12, Route 9, I-84), then cached by key */
  private numbered(cat: 'road' | 'arterial' | 'highway', key: string): string {
    const ck = `${cat}${SEP}${key}`, had = this.numByKey.get(ck);
    if (had) return had;
    let used = this.usedNums.get(cat);
    if (!used) { used = new Set(); this.usedNums.set(cat, used); }
    const h = hash32(this.seed, `num${SEP}${cat}${SEP}${key}`);
    const conf = cat === 'highway' ? { lo: 5, hi: 9999, start: 10 + (h % 90) }
      : cat === 'arterial' ? { lo: 1, hi: 99999, start: 1 + (h % 300) }
      : { lo: 1, hi: 99999, start: 1 + (h % 500) };
    let n = conf.start;
    while (used.has(n)) n = n >= conf.hi ? conf.lo : n + 1;
    used.add(n);
    const name = cat === 'highway' ? `I-${n}` : cat === 'arterial' ? `Route ${n}` : `County Road ${n}`;
    this.numByKey.set(ck, name);
    return name;
  }

  /** the name of one road: its stable unique key, its class (a network ClassId, 'highway', or an alias; an
   *  unknown class names a street), and the town it is in or near (its no-repeat scope: omit out in the country).
   *  Lane, street, avenue and boulevard (and gravel, as a lane) draw tree, local and family stems ("Maple Avenue");
   *  road is "County Road 12", arterial "Route 9", highway "I-84". For a numbered grid line use grid() instead. */
  road(key: string, cls: string, nearTown?: string): string {
    const c = normCls(cls), k = clean(key);
    if (c === 'highway' || c === 'arterial' || c === 'road') return this.numbered(c, k);
    return `${this.stemFor(k, clean(nearTown ?? '').toLowerCase())} ${SUFFIX[c] ?? 'Street'}`;
  }

  /** the name of grid line n (1-based: 1, 2, 3, ... in order across a town grid) of a named class:
   *  "3rd Street", "5th Avenue". Pure (no registry): distinct n are distinct names, and road() never
   *  generates an ordinal, so a grid and the named roads around it cannot collide. */
  grid(n: number, cls: string = 'street'): string {
    const k = Math.max(1, Math.floor(n) || 1);
    return `${ordinal(k)} ${SUFFIX[normCls(cls)] ?? 'Street'}`;
  }

  /** a junction's name from the names of the roads meeting there: the two biggest by roadRank(), the bigger
   *  first, in short form ("Maple Ave & 3rd St"); a tie keeps the caller's order, repeats count once.
   *  One road gives its short form alone, none gives ''. */
  junction(roadNames: string[]): string {
    const seen = new Set<string>(), uniq: string[] = [];
    for (const raw of roadNames) {
      const s = clean(raw), l = shortName(s).toLowerCase();
      if (s && !seen.has(l)) { seen.add(l); uniq.push(s); }
    }
    return uniq
      .map((name, i) => ({ name, i, r: roadRank(name) }))
      .sort((a, b) => b.r - a.r || a.i - b.i)
      .slice(0, 2)
      .map(x => shortName(x.name))
      .join(' & ');
  }

  /** the name of a bridge carrying roadName: over water usually "Maple Avenue Bridge", sometimes a memorial
   *  ("Hartley Memorial Bridge"); not over water an "... Overpass" or "... Viaduct". Pure in the inputs, so two
   *  bridges of one road share a name (the spec API carries no bridge identity; see the PR notes). A name
   *  already ending in a bridge, tunnel or the like passes through (but "Bridge Avenue" is a road, and bridges). */
  bridge(roadName: string, overWater: boolean): string {
    const road = clean(roadName);
    if (/\b(bridge|tunnel|overpass|viaduct)$/i.test(road)) return road;
    const rng = mulberry(hash32(this.seed, `bridge${SEP}${road}${SEP}${overWater ? 1 : 0}`)), r = rng();
    if (overWater) return road && r < 0.75 ? `${road} Bridge` : `${pick(rng, this.d.surnames)} Memorial Bridge`;
    if (!road) return `${pick(rng, this.d.surnames)} Viaduct`;
    return r < 0.7 ? `${road} Overpass` : `${road} Viaduct`;
  }

  /** the name of a tunnel carrying roadName: usually its stem's tunnel ("Maple Tunnel"), sometimes a family
   *  name ("Hartley Tunnel"). Pure in the inputs, like bridge(). */
  tunnel(roadName: string): string {
    const road = clean(roadName);
    if (/\btunnel$/i.test(road)) return road;
    const rng = mulberry(hash32(this.seed, `tunnel${SEP}${road}`)), r = rng();
    return road && r < 0.8 ? `${stemOf(road)} Tunnel` : `${pick(rng, this.d.surnames)} Tunnel`;
  }

  /** a station's name from the nearest street or landmark: "Maple Avenue" -> "Maple Avenue Station",
   *  a junction name works too ("Maple Ave & 3rd St Station"), a name already a station passes through,
   *  and with nothing nearby a seeded city-centre name ("Union Station") serves. */
  station(nearest: string): string {
    const s = clean(nearest);
    if (!s) return pick(mulberry(hash32(this.seed, 'station')), ['Union Station', 'Central Station', 'Main Street Station', 'Valley Station']);
    return /\bstation$/i.test(s) ? s : `${s} Station`;
  }

  /** a business's name from its type (an id or words: 'stadium', 'sports-bar', 'tackle', 'diner', 'golf',
   *  'taxi', ...; unknown types title-case) and its place (a town, street or landmark name; scenic words
   *  serve with none): "Riverside Stadium", "Bass Lake Tackle", "Rose's Diner". Pure in the inputs, so pass a
   *  specific place (the street or landmark, not only the town) where two of a type sit in one town. */
  business(type: string, place: string): string {
    const P = clean(place), norm = clean(type).toLowerCase().replace(/[_-]+/g, ' '), words = new Set(norm.split(' ').filter(Boolean));
    const has = (...ws: string[]): boolean => ws.some(x => words.has(x));
    const rng = mulberry(hash32(this.seed, `biz${SEP}${norm}${SEP}${P.toLowerCase()}`));
    const surname = pick(rng, this.d.surnames), owner = pick(rng, this.d.owners), scenic = pick(rng, this.d.scenicPlaces), r = rng();
    const at = (noun: string): string => (!P ? `${scenic} ${noun}` : P.toLowerCase().endsWith(noun.toLowerCase()) ? P : `${P} ${noun}`);
    if (has('stadium')) return at('Stadium');
    if (has('arena')) return at('Arena');
    if (has('ballpark')) return at('Ballpark');
    if (has('tackle', 'bait')) return !P || r >= 0.85 ? `${poss(surname)} Tackle Shop` : r < 0.55 ? `${P} Tackle` : `${P} Bait & Tackle`;
    if (has('sports') && has('bar')) return r < 0.6 ? `${poss(surname)} Sports Bar` : at('Sports Bar');
    if (has('bar', 'pub', 'tavern')) return r < 0.6 ? `${poss(surname)} ${has('tavern') ? 'Tavern' : has('pub') ? 'Pub' : 'Bar'}` : at(has('tavern') ? 'Tavern' : has('pub') ? 'Pub' : 'Bar');
    if (has('diner')) return r < 0.65 ? `${poss(owner)} Diner` : at('Diner');
    if (has('bakery')) return r < 0.65 ? `${poss(owner)} Bakery` : at('Bakery');
    if (has('cafe', 'coffee')) return r < 0.6 ? `${poss(owner)} Cafe` : at('Cafe');
    if (has('restaurant', 'grill')) return has('grill') ? at('Grill') : at('Restaurant');
    if (has('estate', 'estates', 'lots')) return at('Estates');
    if (has('golf')) return r < 0.55 ? at('Golf Course') : at('Country Club');
    if (has('casino')) return at('Casino');
    if (has('hotel')) return at('Hotel');
    if (has('motel')) return at('Motel');
    if (has('resort')) return at('Resort');
    if (has('lodge')) return at('Lodge');
    if (has('inn')) return at('Inn');
    if (has('marina')) return at('Marina');
    if (has('taxi', 'cab')) return `${P || scenic} Taxi Co.`;
    if (has('bus', 'transit')) return r < 0.5 ? `${P || scenic} Bus Lines` : `${surname} Bus Lines`;
    if (has('farm', 'orchard')) return r < 0.6 ? `${surname} ${has('orchard') ? 'Orchard' : 'Farm'}` : at('Farms');
    if (has('gas', 'fuel')) return `${poss(surname)} Service Station`;
    if (has('garage')) return `${poss(surname)} Garage`;
    if (has('auto', 'repair', 'tire', 'tyre')) return at('Auto Repair');
    if (has('grocery')) return r < 0.5 ? `${poss(surname)} Grocery` : at('Grocery');
    if (has('market')) return at('Market');
    if (has('hardware')) return at('Hardware');
    if (has('pharmacy', 'drugstore')) return at('Pharmacy');
    if (has('theater', 'theatre', 'cinema', 'movie')) return at('Theater');
    if (has('bowling')) return at('Lanes');
    const noun = title(type) || 'General Store';
    return P ? (P.toLowerCase().endsWith(noun.toLowerCase()) ? P : `${P} ${noun}`) : `${poss(surname)} ${noun}`;
  }
}
