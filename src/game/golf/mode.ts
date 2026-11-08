// Golf mode (G1; docs/GOLF-PLAN.md sections 2-3 and 11): what a golf game saves and what the HUD reads. A save with a `golf` field is a golf
// game; a save without one is a legacy (classic) game and loads as before. Pure TS, no DOM.
import type { Pt } from '../network';
import type { AimPoint, Pin, TeeBoxRec, TeeKind, TeeMark } from './types';
import type { PlacedEventStructure } from './eventtool';
import type { CourseHeightSaveChunk } from '../ext/course-height';
import type { GolfProgress } from '../ext/progressive-ui';
import type { GridSave } from '../ext/course-grid';
import type { BunkerState } from '../ext/bunker-look/controller';
import type { OwnerInput } from './play/live';
import { normalizeRangeBiz, type RangeBizSave } from './rangesave';
import { normalizeDaySave, type DaySave } from './everyday';
import { normalizeBook, type LookBook } from './looks';
import { normalizeGrasses, type CustomGrass } from './grasses';
import { normalizeMyHoles, type MyHole } from './myholes';
import { isTeeKind, migrateTees } from './teesets';
import { normalizeTeeBoxes } from './teeplace';
import { normalizeDayPins, type DayPinsSave } from './daypins';
import { normalizeCrewSave, type CrewSave } from './crew';
import { normalizeClubSave, type ClubSave } from './club';
import { normalizePlayer, type PlayerProfile } from './player';
import { readGameSkills } from './play/mods';
import { normalizeEvents, type ClubEventsSave } from './clubevents';
import type { GameSkills } from './play/types';
import type { OsmGolfInfo } from './osm/types';

/** a rectangle in tiles: top-left x, y and the size w, h */
export type Rect = [number, number, number, number];

/** a golf game's own state, saved as SaveV5.golf: the tournament tier (1..5) and the reputation (0..100), the town's centre (golf mode has one
 *  town), the course's rectangle (the painted course; its areas are ordinary Paint areas, saved with the paints) and the owned parcel (the course
 *  plus its clubhouse and car park), the side of the town the course lies on (0 north, 1 east, 2 south, 3 west), and the hole objects (tee
 *  markers, pins, aim points) and the clubhouse door, tiles */
export interface GolfSave {
 v: 1; tier: number; rep: number; poorYears?: number; town: Pt; course: Rect; parcel: Rect; dir: 0 | 1 | 2 | 3;
 tees: TeeMark[]; pins: Pin[]; aims: AimPoint[]; clubhouse: Pt;
 parcels?: Rect[];
 /** T356 (#998): the rects of the land a real course was placed on (they are in parcels too; kept apart so Land for sale and the survey lines leave them be) */
 courseRects?: Rect[];
 /** T232: the town lots the bulldozer cleared on the player's land, pegged out (bare dirt in a survey line) until the player builds there: each
  *  the lot's corner o (x, y), its frame u (x, y) and n (x, y), its width and depth (tiles). Missing: none */
 cleared?: number[][];
 /** T239: a guided range start's practice area while it is still for sale (its rect, tiles): it lies in the start's land but is not the
  *  player's until bought in Land for sale (then this goes and the rect joins parcels). Missing: the player's (an old save's own) */
 practiceLot?: Rect;
 structures?: PlacedEventStructure[];
 cards?: string[];
 /** the course height field as sparse chunks (T027); missing = flat */
 height?: CourseHeightSaveChunk[];
 /** what the player did (T033; missing in older saves: see normalizeProgress) */
 progress?: GolfProgress;
 /** the course grid (plan P21 3.7, T078: ext/course-grid encodeGrid); missing in older saves, whose golf-surface paint areas then move into
  *  a new grid on load. The engine keeps the live grid; this field is only written by a save */
 grid?: GridSave;
  /** Connected bunker appearance defaults and custom anchors; missing older saves use the approved appearance. */
  bunkers?: BunkerState;
 /** T256 (#743): the looks book (golf/looks.ts): each hole's, the property's and each practice facility's looks by owner key. Missing in older
  *  saves: every hole and the property take the course default (today's course-wide looks) as their own on load, so nothing changes */
 looks?: LookBook;
 /** T271 (#812): the course's own grasses (golf/grasses.ts), by slot; the course grid's look layer names them per cell. Missing: none */
 grasses?: CustomGrass[];
 /** T254 (#736): 1 once the tee markers are the four tee sets (blue, white, yellow, red). Missing: an older save, whose back, middle and forward
  *  stand as the blue, white and red and whose holes with a single tee marker become the white set on load (golf/teesets.ts migrateTees) */
 teeSets?: 1;
 /** T256: the player's saved holes ("My holes", golf/myholes.ts), kept with the game (and in the browser, across games) */
 myHoles?: MyHole[];
 /** T268 (#809): the tee boxes Place and Add tee laid, by set (`hole:kind`, golf/teeplace.ts): each box's spot and the ground it covered, put back
  *  when the set is moved or removed. Missing: none (an older box's ground goes back to the grass round it) */
 teeBoxes?: Record<string, TeeBoxRec>;
 /** the hole plans, one save tuple per hole (plan P21 3.7: hole, tee, green, green shape and m², turn, bends, width handles, fairway start,
  *  seed; ext/hole-plan's HolePlanTuple once it lands); kept as they are, undo carries them */
 plans?: unknown[];
 /** how the game started (plan P22 2.6): 'range' for a new game begun with the county road and the driving range (golf/rangestart.ts);
  *  missing for the old start (a seeded town, the old nine and the clubhouse), whose saves keep today's rules */
 start?: 'range';
 /** the county road's map exits, border points in tiles (range starts: the town's off-map world) */
 exits?: Pt[];
 /** the town's growth factor from tournament success (range starts, T090; missing = 1) */
 townBoost?: number;
 /** when the tour invited the player (range starts, T088: the game clock, golf/tour.ts tournamentDue); missing = not yet */
 invited?: { at: number };
 /** the founding seasons passed: season ends with no tournament (range starts, T088); the calendar counts them with the tournaments (missing = 0) */
 founding?: number;
 /** the owner's play in the day (docs/GOLF-PLAY.md decision 7, P4b; see GolfPlaySave). Missing: he is not in the day */
 play?: GolfPlaySave;
 /** T334 (#960): the weather: the first tournament (its key: the round's count) played in the day's wind and the lie's kinds. A save from before it has none: the
  *  engine stamps it on load with the next tournament's key, so a day in progress (and every day before) plays as it did; a new game has none and every day has it */
 weather?: { from: number };
 /** the range business (range starts, plan P24, T129: golf/rangesave.ts): its upgrades, bucket price and counts; a range start's save without it
  *  loads as the starting range */
 range?: RangeBizSave;
 /** everyday golf (T208, golf/everyday.ts DaySave): the town day in play, its check-ins paid and the season's play so far. Missing: none yet (a save
  *  from before T208 starts with the day under way, booking the check-ins still to come) */
 everyday?: DaySave;
 /** T231: the ponds' edge marks, flat x y pairs (tiles): a pond with a mark in it has the stone edge (golf/ponds.ts); missing: every pond natural */
 ponds?: number[];
 /** T269 (#810): the day's pins (golf/daypins.ts): the town day, today's cups and yesterday's. Missing: an older save, whose cups are its placed pins */
 dayPins?: DayPinsSave;
 /** T269 part 2: the grounds crew (golf/crew.ts CrewSave): the holes' stripe phases and the days their fairways were last cut whole. Missing: none */
 crew?: CrewSave;
 /** T214 (#559, plan P26): the club's members (golf/club.ts ClubSave): the count, the dues a month, the founding drive, the month stepped to and the
  *  season's books. Missing: an older save, whose members the engine seeds from T208's stand-in (club.ts legacyClub; P26 section 8) */
 club?: ClubSave;
 /** T241 (#705): your golf (golf/player.ts): your name, skills, practice log, rounds and booked tee time; T240 extends it. Missing: an older save, whose
  *  player starts with the starting profile the first time it is needed */
 player?: PlayerProfile;
 /** T246 (#708): the club's own events (golf/clubevents.ts): the Club Championship and the Mayor's Cup, the seasons held, entered and announced, the
  *  event day and the last result. Missing: an older save (none held yet) */
 clubEvents?: ClubEventsSave;
 /** T340 (#967): this game's course is a real one built from map data (golf/osm): its shipped id, the name and place the game shows, the credit the
  *  course card and the credits carry ("© OpenStreetMap contributors"), where it came from, and its holes and par. The game is laid on the flat map
  *  (boot.ts flatTerrain) whatever its seed. Missing: an ordinary game */
 osm?: OsmGolfInfo;
}

/** the owner's play as saved (GolfSave.play): the tournament's key (the round's count), his sex, the inputs he played in order, and how many of them
 *  he had played when he handed the rest to the caddie (null while he still plays). A replay of the inputs (then the caddie) gives the same round.
 *  Written when he joins, hits or caddies; dropped when the round is free */
export interface GolfPlaySave { key: number; owner: 'm' | 'w'; inputs: OwnerInput[]; caddie: number | null; /** T254: the tee set he chose (absent: the white) */ tees?: TeeKind;
  /** T241: his skills as he joined (your profile under the tournament's pressure), so a reload replays the same round. Absent: a save from before T241,
   *  which plays at OWNER_SKILL as it did */
  skills?: GameSkills }

/** T334: whether the day's weather plays in the tournament of key `key`: from `weather.from` on; a game with no weather yet (a new one, nothing stamped) has it from the first (and is stamped: it keeps it
 *  through every save) */
export function weatherOn(g: { weather?: { from: number } }, key: number): boolean { return key >= (g.weather ??= { from: 0 }).from; }
/** T334: a save from before the weather has none, so its tournament in progress (and every day before) plays as it did: the weather starts with the next tournament (the key after the one
 *  in progress: `runs` counts the rounds done, and a day under way is not done yet). A save that has it keeps it */
export function stampWeather(g: { weather?: { from: number } }, runs: number, dayInProgress: boolean): void { if (!g.weather) g.weather = { from: runs + (dayInProgress ? 1 : 0) }; }

/** a saved owner's play, or null when it is not well formed (no key, sex or inputs list); a missing caddie count is null */
function normalizePlaySave(p: Partial<GolfPlaySave> | null | undefined): GolfPlaySave | null {
  const key = p?.key, owner = p?.owner, inputs = p?.inputs, caddie = p?.caddie, tees = p?.tees, sk = p?.skills;
  if (typeof key !== 'number' || !Number.isFinite(key) || (owner !== 'm' && owner !== 'w') || !Array.isArray(inputs)) return null;
  // (T334 part 2: his power, accuracy and touch when saved as numbers, held to 0..1; a save from before has none: they play as neutral. T335: his mods and the clubs in his bag, through the same reader)
  const skills = readGameSkills(sk);
  return { key, owner, inputs, caddie: typeof caddie === 'number' && Number.isFinite(caddie) ? caddie : null, ...(isTeeKind(tees) ? { tees } : {}), ...(skills ? { skills } : {}) };
}

/** a golf game's start money, $ (City.setBudget's golf treasury) */
export const GOLF_START_MONEY = 600000;

/** the golf HUD's view (Engine.golfView): the tier and its event name, the month label ("Mar 1985"), the months left to the tournament
 *  (0..12, fractional), the tournament's year, and whether the tournament day is under way (the round's surge or its results) */
export interface GolfView { tier: number; tierName: string; month: string; monthsLeft: number; year: number; live: boolean }

/** normalizes a loaded GolfSave so missing array or optional fields from older/partial saves default safely without mutating valid fields */
export function normalizeGolfSave(g: Partial<GolfSave> | null | undefined): GolfSave | null {
  if (!g || !g.town || !g.course || !g.clubhouse) return null;
  const parcel: Rect = g.parcel ?? g.parcels?.[0] ?? g.course;
  // the range start's fields (plan P22 2.6) are taken out and put back only when well formed, so an old start's save normalizes as before
  const { start, exits, townBoost, invited, founding, play, weather, range, everyday, ponds, practiceLot, looks, myHoles, teeSets, grasses, teeBoxes, dayPins, crew, club, player, clubEvents, osm, courseRects, ...rest } = g;
  const out: GolfSave = {
    ...rest,
    v: 1,
    tier: g.tier ?? 1,
    rep: g.rep ?? 0,
    town: g.town,
    course: g.course,
    parcel,
    dir: g.dir ?? 0,
    // T254: an older save's tee markers become the tee sets (nothing moves); a save that has the sets keeps its well-formed markers
    tees: teeSets === 1 ? (g.tees ?? []).filter(t => t && isTeeKind(t.kind) && Number.isFinite(t.x) && Number.isFinite(t.y)) : migrateTees(g.tees ?? []),
    // (the engine's save writes teeSets: 1; migrateTees is idempotent, so an old save loaded twice before a save maps the same)
    ...(teeSets === 1 ? { teeSets: 1 as const } : {}),
    pins: g.pins ?? [],
    aims: g.aims ?? [],
    clubhouse: g.clubhouse,
  };
  if (start === 'range') { out.start = 'range'; out.range = normalizeRangeBiz(range); }
  if (start === 'range' && Array.isArray(practiceLot) && practiceLot.length === 4 && practiceLot.every(v => Number.isFinite(v)) && practiceLot[2] > 0 && practiceLot[3] > 0) out.practiceLot = [...practiceLot] as Rect;
  if (Array.isArray(exits)) out.exits = exits.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)).map(p => ({ x: p.x, y: p.y }));
  if (typeof townBoost === 'number' && Number.isFinite(townBoost)) out.townBoost = townBoost;
  if (invited && Number.isFinite(invited.at)) out.invited = { at: invited.at };
  if (typeof founding === 'number' && Number.isFinite(founding) && founding > 0) out.founding = Math.floor(founding);
  const pl = normalizePlaySave(play); if (pl) out.play = pl;
  if (weather && typeof weather.from === 'number' && Number.isFinite(weather.from) && weather.from >= 0) out.weather = { from: Math.floor(weather.from) }; // T334
  const ed = normalizeDaySave(everyday); if (ed) out.everyday = ed;
  // T231: the pond marks, finite pairs only (golf/ponds.ts normalizePondMarks: none kept means the field stays out)
  if (Array.isArray(ponds)) { const m: number[] = []; for (let k = 0; k + 1 < ponds.length; k += 2) { const x = ponds[k], y = ponds[k + 1]; if (Number.isFinite(x) && Number.isFinite(y)) m.push(x!, y!); } if (m.length) out.ponds = m; }
  // T256: the looks book and My holes, well formed only (a save without the book keeps none: the engine gives every owner today's looks)
  const lk = normalizeBook(looks); if (lk) out.looks = lk;
  const mh = normalizeMyHoles(myHoles); if (mh.length) out.myHoles = mh;
  // T271: the custom grasses, well formed only (none kept: the field stays out)
  const gr = normalizeGrasses(grasses); if (gr.length) out.grasses = gr;
  const tb = normalizeTeeBoxes(teeBoxes); if (tb) out.teeBoxes = tb; // T268
  // T269: the day's pins, well formed only (none: the placed pins are today's)
  const dp = normalizeDayPins(dayPins); if (dp) out.dayPins = dp;
  // T269: the crew's stripes, well formed (nothing to keep: the field stays out)
  if (crew) { const c = normalizeCrewSave(crew); if (c.phase.length || c.mown.length || c.staff) out.crew = c; }
  const cl = normalizeClubSave(club); if (cl) out.club = cl; // T214: the members, well formed only (none: the engine seeds an old save's)
  // T241: your golf, well formed (none: the engine starts the starting profile when it is first needed)
  const pp = normalizePlayer(player); if (pp) out.player = pp;
  if (clubEvents) out.clubEvents = normalizeEvents(clubEvents); // T246
  // T340: a map-data course's credit and name, well formed only (the strings kept, the numbers finite)
  if (osm && typeof osm.id === 'string' && typeof osm.name === 'string') out.osm = { id: osm.id, name: osm.name, place: String(osm.place ?? ''), credit: String(osm.credit ?? ''), licence: String(osm.licence ?? ''), source: String(osm.source ?? ''), holes: Number.isFinite(osm.holes) ? osm.holes : 0, par: Number.isFinite(osm.par) ? osm.par : 0, mappedPar: Number.isFinite(osm.mappedPar) ? osm.mappedPar : Number.isFinite(osm.par) ? osm.par : 0, ...(typeof osm.scale === 'number' && osm.scale > 0 && osm.scale < 1 ? { scale: osm.scale } : {}), ...(osm.entry && Number.isFinite(osm.entry.x) && Number.isFinite(osm.entry.y) && ['N', 'E', 'S', 'W'].includes(osm.entry.edge) ? { entry: { x: osm.entry.x, y: osm.entry.y, edge: osm.entry.edge } } : {}), ...(osm.derived === true ? { derived: true } : {}), ...(typeof osm.turn === 'number' && Number.isFinite(osm.turn) ? { turn: osm.turn } : {}), ...(osm.placed === true ? { placed: true as const } : {}) }; // (T356: placed into a game under way: its own map; turn: how far it was turned)
  // T356: the rects of the land a real course was placed on, well formed only (finite, positive size)
  if (Array.isArray(courseRects)) { const cr = courseRects.filter(r => Array.isArray(r) && r.length === 4 && r.every(v => Number.isFinite(v)) && r[2]! > 0 && r[3]! > 0).map(r => [...r] as Rect); if (cr.length) out.courseRects = cr; }
  return out;
}
