// The golf round's types (docs/GOLF-PLAY.md, the P1 contract): the field, the tee times, the shots and the state of each golfer through the day.
// Times are game minutes of the tournament day; distances are tiles unless a name says M (metres). Pure TS, no DOM.
import type { Pt } from '../holes';
import type { TeeKind } from '../types';
import type { LieKind } from './lies';
import type { Mod } from './mods';
export type { Pt };

/** the surface a ball lies on: tee, fairway, rough, fescue (deep grass), bunker, green, water, or out of bounds */
export type Lie = 'tee' | 'fairway' | 'rough' | 'fescue' | 'bunker' | 'green' | 'water' | 'out';
/** one hole to play: its number, par, tee, pin and playing line (the tee, the aim points, the pin; the tee set furthest back). T254: sets, each
 *  tee set's tee and line, back (blue) to front (red) (absent: the one tee) */
export interface PlayHole { n: number; par: 3 | 4 | 5; tee: Pt; pin: Pt; line: Pt[]; sets?: { kind: TeeKind; tee: Pt; line: Pt[] }[] }
/** the course a round is played on: the holes in play order (a 9-hole course is listed twice) and the lie at any point */
export interface CourseView { holes: PlayHole[]; lieAt(x: number, y: number): Lie;
  /** T334: the finer lie at a point (lies.ts LieKind: the first cut, the deep rough); absent: the coarse lie's own (a view made by hand) */
  kindAt?(x: number, y: number): LieKind }
/** a golfer's sex: the field's looks come from the golfer art of the matching sex */
export type Sex = 'm' | 'w';
/** T241: a golfer's skill by part of the game (0..1 each), as the shot model reads it (shot.ts skillFor): driving (the driver and the 3-wood), irons
 *  (the irons and the pitching wedge), the short game (the sand wedge: chips, pitches and bunker shots) and putting. Your profile's nerve is already in
 *  them (golf/player.ts gameSkills: what pressure takes off). A field golfer has none: his one skill plays every shot */
export interface GameSkills { driving: number; irons: number; short: number; putting: number;
  /** T334 part 2: the stats beyond the four parts of the game (each 0..1, nerve already in them; absent: 0.5, which changes nothing: mods.ts NEUTRAL) */
  power?: number; accuracy?: number; touch?: number;
  /** T334 part 2: the modifiers stacked on the stats (cards, clubs and shafts: T335, T336; mods.ts applyMods); absent: none */
  mods?: readonly Mod[];
  /** T335 (#961): the clubs in his bag (any order; bag.ts bagGear): the shot panel offers these and the caddie (chooseShot) picks among them. Absent: the original seven clubs, as before the bag */
  clubs?: readonly Club[] }
/** a golfer: a unique id (0..size-1), name, sex, whether a pro, skill (0..1), look (0..4, the art variant), and the owner's golfer. T213 (entourage.ts):
 *  the cart he rides (an index shared by the two golfers of a cart; absent: he walks) and whether a caddie walks with him */
export interface Golfer { id: number; name: string; sex: Sex; pro: boolean; skill: number; look: number; owner?: boolean; cart?: number; caddie?: boolean;
  /** T254: the tee set he plays from (golf/teesets.ts: a tournament's field the blue, everyday golfers by who they are, the owner his choice); on a
   *  hole without it, the nearest set there is. Absent: the hole's set furthest back */
  tees?: TeeKind;
  /** T241: his skill by part of the game (your profile's, golf/player.ts); absent: `skill` plays every shot (the field). With it, `skill` is their
   *  average (the tee times' order) */
  skills?: GameSkills }
/** a tee time: the game minute and the golfer ids in the group */
export interface Group { tee: number; players: number[] }
/** a club, or the putter. T335 (#961): the bag of 14 (bag.ts): the driver, the 3-wood, a 5-wood or a hybrid (one slot), the 4- to 9-irons, the pitching, gap, sand and lob wedges, the putter. The first
 *  eight are the model's original clubs (the field plays them; their numbers are exactly what they were before the bag) */
export type Club = 'driver' | 'wood3' | 'wood5' | 'hybrid' | 'iron4' | 'iron5' | 'iron6' | 'iron7' | 'iron8' | 'iron9' | 'pw' | 'gw' | 'sw' | 'lw' | 'putter';
/** one stroke: the golfer, hole index (0..17), stroke number (1-based), the minute struck, from and to (tiles), the club, the lie where it came
 *  to rest, the penalty stroke (water or out of bounds), and whether it went in */
export interface Shot { golfer: number; hole: number; stroke: number; t: number; from: Pt; to: Pt; club: Club; lie: Lie; penalty: 0 | 1; holed: boolean;
  /** T251: a full shot's or chip's landing (shot.ts hitShot), the playback's bounce and roll (play/roll.ts); absent: a putt, or a plan made by hand */
  landing?: Landing }
/** T251: where a full shot or chip landed and its lie there, and where its roll stopped and its lie there (rest: `to`, unless the ball went into water
 *  or out of bounds, when `to` is the drop or the stroke again) */
export interface Landing { at: Pt; lie: Lie; rest: Pt; restLie: Lie;
  /** T318: the owner's spin's change to the roll (m along the flight; below 0 shorter, past the landing a spin back), the roll's `spinRoll` hook for
   *  T319's roll; absent: no spin */
  spin?: number;
  /** T318: a spin back's check: the point past the landing the ball skids to before it spins back to its rest (absent: none) */
  check?: Pt }
/** T211 pace of play: a group's wait on the group ahead: the group (an index into groups), the hole index, where (on the tee, for the landing area; or
 *  short of the green, for the green), and from..to in game minutes (to is Infinity while the group ahead has not let it play yet) */
export interface Wait { group: number; hole: number; at: 'tee' | 'green'; from: number; to: number }
/** T211: a wave-through: at minute t, on the tee of hole `hole` (an index), the slow group (an index into groups, holding two holes open) stood aside and
 *  the marshal waved the group behind it (through) on */
export interface WaveThrough { t: number; hole: number; slow: number; through: number }
/** T211: a round's pace: each group's minute at each tee (arrive[group][hole], Infinity until known), the waits as they were struck, the waits under way
 *  where the play stops for the owner's input (open), and the wave-throughs in time order */
export interface Pace { arrive: number[][]; waits: Wait[]; open: Wait[]; waves: WaveThrough[] }
/** the whole day's play: the field, the groups, every shot by t, strokes[golfer][hole] (penalties included), the minute each golfer is done (holed out and
 *  walked off the last green; Infinity until known), and the pace (T211; absent on a plan made by hand) */
export interface RoundPlan { golfers: Golfer[]; groups: Group[]; shots: Shot[]; strokes: number[][]; done: number[]; pace?: Pace }
/** what a golfer is doing at a minute: waiting for his tee time, walking, addressing or swinging a full shot, putting, holed, or done */
export type Action = 'waiting' | 'walk' | 'address' | 'swing' | 'putt' | 'holed' | 'done';
/** a golfer at a minute: the hole he is on, his position, what he does, where his ball is, the ball in flight, and his score so far */
export interface GolferState { golfer: number; hole: number; x: number; y: number; action: Action; ball: Pt | null; flight: { from: Pt; to: Pt; u: number } | null; strokes: number; toPar: number; thru: number;
  /** T266: where the walk he is on ends (his ball, his place by the next tee, his step-off); null or absent: not on a walk */
  dest?: Pt | null;
  /** T266: the game minute he must be at dest by (his next address; Infinity: not known) */
  by?: number }
/** one row of the leaderboard: the shared position, to par, holes completed and strokes */
export interface Standing { golfer: number; pos: number; toPar: number; thru: number; strokes: number }
