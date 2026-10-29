// T242 (#702, plan P28 3): set the scene. Inspecting a place opens a large picture card: a painted 1985 view of the place (outside or inside),
// a line written for it, and its numbers. Each place shows the run-down (hard times) or upgraded (good times) picture its state calls for:
//   - the range's views by its upgrades (RANGE_GOOD_WHEN: run-down until they are built, upgraded after), the practice green by the putting
//     green being open, your home by its stage (caravan, cottage, house: the farmhouse) and how far the takings have got through that stage;
//   - the clubhouse by its tier (clubhouse-outside / -inside, tier1..tier5, else run-down below the country club and upgraded from it);
//   - a town business by its lot (upgraded and in good repair: the good-times picture; built, or declining: hard times);
//   - a farm, and an iconic place, by the town's fortunes (townFortune: the share of the town's buildings upgraded against those declining).
// The pictures are the owner's scenes (scripts/assets/prep-scenes.mjs: src/assets/scenes/manifest.json); a place, or a view of it, with no
// picture for its state shows nothing (never a placeholder). Hard times never borrow the good-times picture; good times fall back to the
// hard-times picture of the same view while the upgraded one is still to make (the cottage's). Pure TS, no DOM: the engine gathers the facts
// (Engine.sceneCard) and the card draws them (ui/SceneCard.tsx), which loads the picture only when it opens.
import MANIFEST_FILE from '../assets/scenes/manifest.json';
import type { RangeUpgradeId } from './golf/rangesave';

/** one picture of the manifest: a place's slug, the state it shows, its file under src/assets/scenes and its size (px, bytes) */
export interface ScenePic { slug: string; state: string; file: string; w: number; h: number; bytes: number }
export interface SceneManifest { v: number; pictures: readonly ScenePic[] }
export const SCENE_MANIFEST: SceneManifest = MANIFEST_FILE as SceneManifest;

/** a number under the picture */
export interface SceneTile { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }
/** one view of a place (the range from the road, the video store inside): its picture for the state now, the state, its line and its numbers */
export interface SceneView { id: string; label: string; slug: string; state: string; good: boolean; line: string; pic: ScenePic; tiles: SceneTile[] }
/** the card: the place's name, the small line over it, its views with a picture (at least one) and the one shown */
export interface SceneCardView { title: string; kicker: string; views: SceneView[]; at: number }

/** what the card is open on (Engine.sceneRef): a place, and the view asked for (absent: the first with a picture) */
export type SceneRef =
  | { kind: 'range'; view?: string }
  | { kind: 'club'; view?: string }
  | { kind: 'lot'; key: string; place: string; view?: string }
  | { kind: 'farm'; key: string }
  | { kind: 'place'; id: string; view?: string };

/** the states a place in good or hard times may show, best first */
export const GOOD_TIMES: readonly string[] = ['upgraded', 'rundown', 'one'], HARD_TIMES: readonly string[] = ['rundown', 'one'];
/** the picture of a slug in the first of the wanted states the art has, or null */
export function pickPicture(slug: string, want: readonly string[], m: SceneManifest = SCENE_MANIFEST): ScenePic | null {
  for (const s of want) { const p = m.pictures.find(q => q.slug === slug && q.state === s); if (p) return p; }
  return null;
}
/** the slugs the manifest has (a place's buttons show only when one of its views has art) */
export function hasSlug(slug: string, m: SceneManifest = SCENE_MANIFEST): boolean { return m.pictures.some(p => p.slug === slug); }

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ---------- the lines (the game's voice: warm, specific, 1985), by slug and state; a view's line for its picture's state
export const LINES: Readonly<Record<string, Readonly<Record<'rundown' | 'upgraded', string>>>> = {
  'range-road': {
    rundown: 'A hand-painted sign, a tin-and-tarp shack and four mats on the dirt. Most drivers on the county road slow down, look, and keep going.',
    upgraded: 'Covered bays, a striped outfield with flags to aim at and a paved lot. Folks pull off the county road on purpose now.',
  },
  'hitting-bays': {
    rundown: 'Frayed mats on packed dirt, a split bucket and a bent divider. Every swing kicks up a little dust.',
    upgraded: 'A roof over every mat, fresh turf underfoot and tokens at the dispenser. The after-work crowd stays till the lights go off.',
  },
  'pro-shop-inside': {
    rundown: 'Inside the shack: a plywood counter, a cash box and a few used clubs in an oil drum. The old man at the counter knows every regular by name.',
    upgraded: 'Panelled walls, a glass counter of gloves and tees, new irons on the rack. They come in for a bucket and leave with a sweater.',
  },
  'practice-green': {
    rundown: 'A patchy green behind the shack with one tattered flag. You can putt on it, if you can read the weeds.',
    upgraded: 'A manicured putting green, three flags and a bench by the hedge. Somebody is always working on a four-footer.',
  },
  'home-caravan': {
    rundown: 'Your caravan: a fold-down table, the range\'s ledger, a stack of bills and a cold coffee. The TV gets two channels on a good night.',
    upgraded: 'The caravan, squared away: a gingham cloth, a mended window, a trophy on the shelf. Out the window, cars in a paved lot.',
  },
  'home-cottage': {
    rundown: 'The cottage: whitewashed brick, a wood stove and a plaid sofa that has seen better days. The boxes can wait; the ledger can\'t.',
    upgraded: 'The cottage, made a home: the stove lit, the boxes gone, curtains up. The ledger still lives on the desk.',
  },
  'home-farmhouse': {
    rundown: 'The farmhouse kitchen: peeling paper, an old range cooker and a long table with room for the ledger and then some.',
    upgraded: 'Copper pans over the range, a pie on the table, trophies on the shelf. The farmhouse kitchen smells like Sunday.',
  },
  'video-store-outside': {
    rundown: 'The sign is missing two letters and the posters have faded to blue. One hatchback in the lot, and weeds in the cracks.',
    upgraded: 'Neon in the window, cut-outs of this week\'s hits and a line of kids at the door on a Friday night.',
  },
  'video-store-inside': {
    rundown: 'Gaps on the shelves, half a new-releases wall and a clerk who has seen every tape twice. Be kind, rewind.',
    upgraded: 'Full shelves, popcorn by the counter and a movie on the set. Every copy of the new release is out by six.',
  },
  'clubhouse-outside': {
    rundown: 'Your clubhouse: a low timber building, a flagpole and a chalkboard of tee times by the door.',
    upgraded: 'The country club: white columns, a circle drive and members\' cars nose to nose under the maples.',
  },
  'clubhouse-inside': {
    rundown: 'A few bar stools, a TV with the tour on and a scorecard pinned behind the till.',
    upgraded: 'Wood panelling, leather chairs and the 18th green framed in the window.',
  },
};
/** a farm's kitchen (the farmhouse picture, not your own home): its own words */
export const FARM_LINES: Readonly<Record<'rundown' | 'upgraded', string>> = {
  rundown: 'A farmhouse kitchen in hard times: peeling paper, a cold range, boxes nobody has unpacked. The bank calls more often than the neighbours.',
  upgraded: 'A farm kitchen in a good year: copper pans, a pie cooling, the back door open on the garden.',
};
/** a view's line: its slug's for the state shown, else the place's own (a business with no line per view) */
function lineOf(slug: string, state: string, fallback?: Readonly<Record<'rundown' | 'upgraded', string>>): string {
  const k = state === 'upgraded' ? 'upgraded' : 'rundown';
  return LINES[slug]?.[k] ?? fallback?.[k] ?? '';
}
/** a view of a place with its picture for the state (null: no art for it) */
function viewOf(id: string, label: string, slug: string, good: boolean, tiles: SceneTile[], lines?: Readonly<Record<'rundown' | 'upgraded', string>>, want?: readonly string[]): SceneView | null {
  const pic = pickPicture(slug, want ?? (good ? GOOD_TIMES : HARD_TIMES)); if (!pic) return null;
  return { id, label, slug, state: pic.state, good: pic.state === 'upgraded' || /^tier/.test(pic.state) ? good : false, line: lines ? lineOf('', pic.state, lines) : lineOf(slug, pic.state), pic, tiles };
}
const card = (title: string, kicker: string, views: (SceneView | null)[], want?: string): SceneCardView | null => {
  const vs = views.filter((v): v is SceneView => !!v); if (!vs.length) return null;
  return { title, kicker, views: vs, at: Math.max(0, vs.findIndex(v => v.id === want)) };
};

// ---------- the range (a range start): the road, the bays, the shop inside, the practice green and your home
export type RangeSceneView = 'road' | 'bays' | 'shop' | 'green' | 'home';
/** the upgrades a range view needs for its good-times picture, all of them: the road sees the green outfield, the paved lot and the covered
 *  bays; the bays need their turf and their roof; the shop is the pro shop */
export const RANGE_GOOD_WHEN: Readonly<Record<'road' | 'bays' | 'shop', readonly RangeUpgradeId[]>> = {
  road: ['grass', 'pave', 'covered'], bays: ['teeturf', 'covered'], shop: ['proshop'],
};
/** your home's picture by stage (rangesave.ts HOME_NAME: the caravan, the cottage, the house: the farmhouse) */
export const HOME_SLUGS: readonly [string, string, string] = ['home-caravan', 'home-cottage', 'home-farmhouse'];
/** the lifetime takings at which each home smartens up (its good-times picture): half way to the next home (rangesave.ts HOME_AT 100k, 400k),
 *  and the house at 700k */
export const HOME_SMART_AT: readonly [number, number, number] = [50000, 250000, 700000];
/** the facts the range's card reads (Engine.sceneCard, from the range card's view) */
export interface RangeSceneFacts {
  owned: readonly string[]; putting: boolean; home: 0 | 1 | 2; homeName: string; homeNext: { name: string; at: number } | null; lifetime: number;
  golfers: number; playing: number; queue: number; lost: number; bays: number; price: number; seasonTakings: number; seasonBuckets: number; shopExtra: number;
  green: { today: number; golfers: number; takings: number };
}
/** whether a range view shows good times */
export function rangeGood(view: RangeSceneView, f: Pick<RangeSceneFacts, 'owned' | 'putting' | 'home' | 'lifetime'>): boolean {
  if (view === 'green') return f.putting;
  if (view === 'home') return f.lifetime >= HOME_SMART_AT[f.home];
  return RANGE_GOOD_WHEN[view].every(u => f.owned.includes(u));
}
/** which range view a range prop belongs to (its auto key after 'range:'): the home and its yard, the shop, the bays, the practice greens;
 *  anything else (the sign, the car park, the outfield's flags and boards) is seen from the road */
export function rangeViewOfKey(key: string): RangeSceneView {
  if (/^(caravan|cottage|house|wash|braai|chair|cooler|hose|bins-yard|birdhouse|bed|swing|garage|glasshouse|firepit|planter)/.test(key)) return 'home';
  if (/^(shop|dispenser|trolley|kiosk|academy)/.test(key)) return 'shop';
  if (/^(roof|deck|bench|bins-tee|light|mark|mat)/.test(key)) return 'bays';
  if (/^(putting|chipping|cup|practice)/.test(key)) return 'green';
  return 'road';
}
export function rangeScene(f: RangeSceneFacts, want?: string): SceneCardView | null {
  const good = (v: RangeSceneView) => rangeGood(v, f), shopGood = good('shop');
  const homeSlug = HOME_SLUGS[f.home];
  return card('Your driving range', 'Set the scene', [
    viewOf('road', 'From the road', 'range-road', good('road'), [
      { label: 'Today', value: `${Math.round(f.golfers)}`, sub: 'golfers' },
      { label: 'Season takings', value: money(f.seasonTakings), sub: `${Math.round(f.seasonBuckets).toLocaleString('en-US')} buckets`, tone: 'good' },
      { label: 'Bays', value: `${f.bays}`, sub: `${RANGE_GOOD_WHEN.road.filter(u => f.owned.includes(u)).length} of 3 road upgrades` },
      { label: 'Bucket', value: money(f.price), sub: 'a bucket' },
    ]),
    viewOf('bays', 'The hitting bays', 'hitting-bays', good('bays'), [
      { label: 'Hitting', value: `${f.playing}/${f.bays}`, sub: 'bays in use' },
      { label: 'Queue', value: `${f.queue}`, sub: 'waiting' },
      { label: 'Drove on', value: `${Math.round(f.lost)}`, sub: 'today', tone: f.lost > 0 ? 'bad' : undefined },
      { label: 'Covered', value: f.owned.includes('covered') ? 'Yes' : 'Not yet', sub: f.owned.includes('teeturf') ? 'turf under the mats' : 'mats on the dirt' },
    ]),
    viewOf('shop', shopGood ? 'The pro shop' : 'The shack, inside', 'pro-shop-inside', shopGood, [
      { label: 'Season takings', value: money(f.seasonTakings), tone: 'good' },
      { label: 'Shop spend', value: f.shopExtra > 0 ? `+${money(f.shopExtra)}` : 'None', sub: f.shopExtra > 0 ? 'a golfer' : 'build the pro shop' },
      { label: 'Bucket', value: money(f.price), sub: 'at the counter' },
    ]),
    viewOf('green', 'The practice green', 'practice-green', good('green'), f.putting ? [
      { label: 'Today', value: `${f.green.today}`, sub: 'putting' },
      { label: 'This season', value: `${Math.round(f.green.golfers)}`, sub: 'golfers' },
      { label: 'Takings', value: money(f.green.takings), tone: 'good' },
    ] : [{ label: 'Putting green', value: 'Not built', sub: 'Facilities › Practice' }]),
    viewOf('home', `Your ${f.homeName.toLowerCase()}`, homeSlug, good('home'), [
      { label: 'Home', value: f.homeName },
      { label: 'Taken in all', value: money(f.lifetime), tone: 'good' },
      f.homeNext ? { label: 'Next home', value: f.homeNext.name, sub: `at ${money(f.homeNext.at)}` } : { label: 'Next home', value: 'This is it', sub: 'the last move' },
    ]),
  ], want);
}

// ---------- the clubhouse: outside and inside, by tier (1..5; tier 4 is the golf and country club: clubtitle.ts COUNTRY_CLUB_TIER)
const COUNTRY_TIER = 4;
/** the clubhouse's wanted states at a tier: its own tier's picture, then the tiers below, then good or hard times */
export function clubWant(tier: number): string[] {
  const t = Math.max(1, Math.min(5, Math.round(tier))), out: string[] = [];
  for (let k = t; k >= 1; k--) out.push(`tier${k}`);
  return out.concat(t >= COUNTRY_TIER ? GOOD_TIMES : HARD_TIMES);
}
export interface ClubSceneFacts { tier: number; members: number; visitors: number; fees: number; rounds: number }
export function clubScene(f: ClubSceneFacts, want?: string): SceneCardView | null {
  const good = f.tier >= COUNTRY_TIER, w = clubWant(f.tier);
  const tiles: SceneTile[] = [
    { label: 'Members', value: `${f.members}`, sub: 'on the books' },
    { label: 'Visitors', value: `${f.visitors}`, sub: 'today' },
    { label: 'Green fees', value: money(f.fees), sub: 'today', tone: 'good' },
    { label: 'Tier', value: `${f.tier}`, sub: `${f.rounds.toLocaleString('en-US')} rounds this season` },
  ];
  return card('Your clubhouse', 'Set the scene', [viewOf('outside', 'Outside', 'clubhouse-outside', good, tiles, undefined, w), viewOf('inside', 'Inside', 'clubhouse-inside', good, tiles, undefined, w)], want);
}

// ---------- the town's businesses, by the building on the lot (its library id's subject: a view's or a variation's own building)
export interface LotPlace { id: string; name: string; subjects: readonly string[]; slug: string; lines: Readonly<Record<'rundown' | 'upgraded', string>> }
/** the businesses that can have scenes: their buildings, the slug their pictures use (<slug>-outside, <slug>-inside, or <slug> alone) and their
 *  lines. T270 (#827): a video store is any lot drawn as world:video or world:video_rental. Batch 2's pictures light the others up as they land */
export const LOT_PLACES: readonly LotPlace[] = [
  { id: 'video', name: 'The video store', subjects: ['world:video', 'world:video_rental'], slug: 'video-store', lines: { rundown: LINES['video-store-outside']!.rundown, upgraded: LINES['video-store-outside']!.upgraded } },
  { id: 'diner', name: 'The diner', subjects: ['world:diner'], slug: 'diner', lines: { rundown: 'Cracked vinyl booths, coffee on the warmer since dawn and pie under a scratched dome. The regulars sit where they always sit.', upgraded: 'The chrome polished, every booth full, and the waitress tops you up before you ask.' } },
  { id: 'gas', name: 'The gas station', subjects: ['ref:building-gas-canopy'], slug: 'gas-station', lines: { rundown: 'Two pumps, a dusty shop and a mechanic who can fix anything with what he has.', upgraded: 'Fresh paint on the canopy, a car on the lift and the cooler stocked for the drive out to the course.' } },
  { id: 'barber', name: 'The barber shop', subjects: ['town:barber'], slug: 'barber-shop', lines: { rundown: 'One chair, a striped pole and the ball game on the radio. Haircuts and opinions, both cheap.', upgraded: 'Three chairs going and a wait on Saturday morning. The whole town hears the news here first.' } },
  { id: 'hardware', name: 'The hardware store', subjects: ['town:hardware'], slug: 'hardware-store', lines: { rundown: 'Bins of loose nails, a creaky floor and a clerk who will tell you what you actually need.', upgraded: 'Paint mixed while you wait and a new lawnmower out front with a bow on it.' } },
  { id: 'grocery', name: 'The grocery store', subjects: ['town:grocery'], slug: 'grocery-store', lines: { rundown: 'Half the shelves stocked, one register open and the specials hand-lettered on butcher paper.', upgraded: 'Every aisle full, two registers ringing and a boy to carry your bags to the car.' } },
  { id: 'pharmacy', name: 'The pharmacy', subjects: ['town:pharmacy'], slug: 'pharmacy', lines: { rundown: 'A soda fountain with two working stools and a pharmacist who remembers your prescription.', upgraded: 'Malts at the fountain, a rack of paperbacks and a line at the counter.' } },
  { id: 'tackle', name: 'The fish-and-tackle shop', subjects: ['town:fish_tackle'], slug: 'fish-and-tackle', lines: { rundown: 'Live bait in the cooler, lures on a pegboard and a fish story with every sale.', upgraded: 'New rods on the wall, a boat on a trailer out front and maps of the lake on the counter.' } },
  { id: 'arcade', name: 'The arcade', subjects: ['world:arcade'], slug: 'arcade', lines: { rundown: 'Half the cabinets say OUT OF ORDER. The kids crowd round the two that work.', upgraded: 'Every cabinet lit and beeping, tokens in every pocket and a high score to beat.' } },
  { id: 'laundromat', name: 'The laundromat', subjects: ['town:laundromat'], slug: 'laundromat', lines: { rundown: 'Three dryers out of six, a folding table and a TV bolted to the wall.', upgraded: 'Every machine running, a change machine that works and the radio on.' } },
  { id: 'bakery', name: 'The bakery', subjects: ['town:bakery'], slug: 'bakery', lines: { rundown: 'A short shelf of bread and a cake in the window that has been there a while.', upgraded: 'Warm loaves by seven, a line out the door and the cake order book full.' } },
  { id: 'post', name: 'The post office', subjects: ['town:postoffice'], slug: 'post-office', lines: { rundown: 'One window open, a board of lost dogs and a flag that needs replacing.', upgraded: 'A new flag out front and the whole town checking its box at noon.' } },
  { id: 'fire', name: 'The fire station', subjects: ['town:firestation'], slug: 'fire-station', lines: { rundown: 'One engine, polished anyway, and the volunteers\' chili cook-off flyer on the door.', upgraded: 'Two engines out front and the doors open on a summer evening.' } },
];
const PLACE_BY_SUBJECT = new Map(LOT_PLACES.flatMap(p => p.subjects.map(s => [s, p] as const)));
/** the business a building's picture belongs to: its subject (a view's own building: Engine.sceneSubject), or a variation of it
 *  ('variation:world-video_rental-cc8c504f-plain:1' is a world:video_rental), or null */
export function lotPlaceOf(subject: string): LotPlace | null {
  const p = PLACE_BY_SUBJECT.get(subject); if (p) return p;
  const m = /^variation:([a-z0-9]+)-(.+?)-[0-9a-f]{8}(?:-[a-z-]+)?(?::\d+)?$/.exec(subject);
  return m ? PLACE_BY_SUBJECT.get(`${m[1]}:${m[2]}`) ?? null : null;
}
/** whether a business has any scene yet */
export function lotPlaceHasArt(p: LotPlace): boolean { return [`${p.slug}-outside`, `${p.slug}-inside`, p.slug].some(s => hasSlug(s)); }
/** a lot's state (lots/town.ts LV and decline): good times when upgraded and in good repair */
export interface LotSceneFacts { level: number; decline: number; jobs: number; town: string; pop: number }
export const LOT_UPGRADED = 3, LOT_BUILT = 2;
export function lotGood(f: Pick<LotSceneFacts, 'level' | 'decline'>): boolean { return f.level >= LOT_UPGRADED && f.decline === 0; }
export const CONDITION: readonly string[] = ['In good repair', 'Shabby', 'Boarded up', 'Derelict'];
export function lotScene(p: LotPlace, f: LotSceneFacts, want?: string): SceneCardView | null {
  if (f.level < LOT_BUILT) return null; // nothing built yet: nothing to see inside
  const good = lotGood(f), tiles: SceneTile[] = [
    { label: 'Condition', value: CONDITION[Math.max(0, Math.min(3, f.decline))]!, tone: f.decline > 0 ? 'bad' : good ? 'good' : undefined },
    { label: 'Business', value: f.level >= LOT_UPGRADED ? 'Upgraded' : 'Getting by', sub: f.level >= LOT_UPGRADED ? 'grown with the town' : 'not upgraded yet' },
    { label: 'Staff', value: `${f.jobs}`, sub: f.jobs === 1 ? 'job' : 'jobs' },
    { label: f.town, value: f.pop.toLocaleString('en-US'), sub: 'residents' },
  ];
  return card(p.name, `Set the scene · ${f.town}`, [
    viewOf('outside', 'Outside', `${p.slug}-outside`, good, tiles, LINES[`${p.slug}-outside`] ? undefined : p.lines),
    viewOf('inside', 'Inside', `${p.slug}-inside`, good, tiles, LINES[`${p.slug}-inside`] ? undefined : p.lines),
    viewOf('one', p.name, p.slug, good, tiles, LINES[p.slug] ? undefined : p.lines),
  ], want);
}

// ---------- the town's fortunes: farms and iconic places have no state of their own; they do as well as the town does (T245 deepens this)
export interface TownFortune { built: number; up: number; down: number; good: boolean }
/** the town's built lots, those upgraded in good repair and those declining: good times when at least a quarter are upgraded and they outnumber
 *  the declining ones (a town of fewer than 10 buildings is in hard times) */
export function townFortune(lots: Iterable<{ level: number; decline: number }>): TownFortune {
  let built = 0, up = 0, down = 0;
  for (const l of lots) { if (l.level < LOT_BUILT) continue; built++; if (l.decline > 0) down++; else if (l.level >= LOT_UPGRADED) up++; }
  return { built, up, down, good: built >= 10 && up >= built / 4 && up > down };
}
const pct = (a: number, b: number) => `${b > 0 ? Math.round((100 * a) / b) : 0}%`;
/** a farm: the farmhouse kitchen (the farmhouse home's pictures, in a farm's words) */
export function farmScene(f: { ha: number; town: string; fortune: TownFortune }): SceneCardView | null {
  const t = f.fortune;
  return card('A farm', `Set the scene · outside ${f.town}`, [viewOf('kitchen', 'The farmhouse kitchen', HOME_SLUGS[2], t.good, [
    { label: 'Land', value: `${f.ha.toFixed(1)} ha`, sub: 'fields and yard' },
    { label: 'Times', value: t.good ? 'Good' : 'Hard', sub: `as ${f.town} goes`, tone: t.good ? 'good' : 'bad' },
    { label: 'Upgraded', value: pct(t.up, t.built), sub: `of ${t.built} buildings` },
    { label: 'Run down', value: pct(t.down, t.built), sub: 'declining', tone: t.down > 0 ? 'bad' : undefined },
  ], FARM_LINES)]);
}
/** the iconic places (T219: lots/iconic-places.json): their slug is their id */
export const PLACE_LINES: Readonly<Record<string, string>> = {
  'drive-in': 'Cars nose to the screen, speakers hooked on the windows and the projector beam full of moths.',
  'high-school': 'Friday night under the lights: the band, the bleachers and half the town in letter jackets.',
};
export function placeScene(f: { id: string; name: string; pop: number; w: number; d: number; fortune: TownFortune }, want?: string): SceneCardView | null {
  const line = PLACE_LINES[f.id] ?? '', lines = { rundown: line, upgraded: line }, tiles: SceneTile[] = [
    { label: 'Opened at', value: f.pop.toLocaleString('en-US'), sub: 'residents' },
    { label: 'Grounds', value: `${f.w} x ${f.d} m` },
    { label: 'Times', value: f.fortune.good ? 'Good' : 'Hard', sub: 'as the town goes', tone: f.fortune.good ? 'good' : 'bad' },
  ];
  return card(f.name, 'Set the scene', [
    viewOf('outside', 'Outside', `${f.id}-outside`, f.fortune.good, tiles, lines), viewOf('inside', 'Inside', `${f.id}-inside`, f.fortune.good, tiles, lines),
    viewOf('one', f.name, f.id, f.fortune.good, tiles, lines),
  ], want);
}
/** whether an iconic place has a scene */
export function placeHasArt(id: string): boolean { return [`${id}-outside`, `${id}-inside`, id].some(s => hasSlug(s)); }

/** a farm's farmhouse pictures (ext/farms farms.ts FARMHOUSE_FRONT and FARMHOUSE_REAR): a click on one inspects the farm */
export const FARMHOUSE_SUBJECTS: ReadonlySet<string> = new Set(['gen:house-farmhouse-wrap', 'gen:house-l-ranch', 'gen:house-ranch-long', 'expansion:ranch-rear']);

/** whether a kind of place has any picture at all (the cards' Set the scene buttons; the manifest never changes while the game runs) */
const ART = new Map<string, boolean>();
export function sceneArt(kind: 'range' | 'club'): boolean {
  let a = ART.get(kind);
  if (a === undefined) ART.set(kind, a = (kind === 'range' ? ['range-road', 'hitting-bays', 'pro-shop-inside', 'practice-green', ...HOME_SLUGS] : ['clubhouse-outside', 'clubhouse-inside']).some(s => hasSlug(s)));
  return a;
}

// ---------- events: a range view's picture turning (an upgrade built, the putting green open, a home move)
const RANGE_SLUG: Readonly<Record<Exclude<RangeSceneView, 'home'>, string>> = { road: 'range-road', bays: 'hitting-bays', shop: 'pro-shop-inside', green: 'practice-green' };
/** the range's pictures now, the file each view shows ('' when none): the engine compares them about once a second and offers the card for
 *  the first view whose picture changed (a good-times picture still to make changes nothing) */
export function rangeSceneKeys(f: Pick<RangeSceneFacts, 'owned' | 'putting' | 'home' | 'lifetime'>): Record<RangeSceneView, string> {
  const pic = (v: RangeSceneView) => pickPicture(v === 'home' ? HOME_SLUGS[f.home] : RANGE_SLUG[v], rangeGood(v, f) ? GOOD_TIMES : HARD_TIMES)?.file ?? '';
  return { road: pic('road'), bays: pic('bays'), shop: pic('shop'), green: pic('green'), home: pic('home') };
}
/** the toast offering a changed view's card (its button: Set the scene) */
export function rangeNews(view: RangeSceneView, f: Pick<RangeSceneFacts, 'owned' | 'putting' | 'home' | 'lifetime'>): string {
  const good = rangeGood(view, f);
  switch (view) {
    case 'road': return good ? 'Your range looks the part from the county road now' : 'Your range from the road';
    case 'bays': return good ? 'Your hitting bays are roofed and turfed' : 'Your hitting bays';
    case 'shop': return good ? 'The shack is a pro shop now' : 'The shack';
    case 'green': return good ? 'Your putting green is open' : 'Your practice green';
    default: return good ? 'Home has smartened up' : 'Your new home';
  }
}
