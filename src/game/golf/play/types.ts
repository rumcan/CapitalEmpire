// The golf round's types (docs/GOLF-PLAY.md, the P1 contract): the field, the tee times, the shots and the state of each golfer through the day.
// Times are game minutes of the tournament day; distances are tiles unless a name says M (metres). Pure TS, no DOM.
import type { Pt } from '../holes';
import type { TeeKind } from '../types';
export type { Pt };

/** the surface a ball lies on: tee, fairway, rough, fescue (deep grass), bunker, green, water, or out of bounds */
export type Lie = 'tee' | 'fairway' | 'rough' | 'fescue' | 'bunker' | 'green' | 'water' | 'out';
/** one hole to play: its number, par, tee, pin and playing line (the tee, the aim points, the pin; the tee set furthest back). T254: sets, each
 *  tee set's tee and line, back (blue) to front (red) (absent: the one tee) */
export interface PlayHole { n: number; par: 3 | 4 | 5; tee: Pt; pin: Pt; line: Pt[]; sets?: { kind: TeeKind; tee: Pt; line: Pt[] }[] }
/** the course a round is played on: the holes in play order (a 9-hole course is listed twice) and the lie at any point */
export interface CourseView { holes: PlayHole[]; lieAt(x: number, y: number): Lie }
/** a golfer's sex: the field's looks come from the golfer art of the matching sex */
export type Sex = 'm' | 'w';
/** a golfer: a unique id (0..size-1), name, sex, whether a pro, skill (0..1), look (0..4, the art variant), and the owner's golfer. T213 (entourage.ts):
 *  the cart he rides (an index shared by the two golfers of a cart; absent: he walks) and whether a caddie walks with him */
export interface Golfer { id: number; name: string; sex: Sex; pro: boolean; skill: number; look: number; owner?: boolean; cart?: number; caddie?: boolean;
  /** T254: the tee set he plays from (golf/teesets.ts: a tournament's field the blue, everyday golfers by who they are, the owner his choice); on a
   *  hole without it, the nearest set there is. Absent: the hole's set furthest back */
  tees?: TeeKind }
/** a tee time: the game minute and the golfer ids in the group */
export interface Group { tee: number; players: number[] }
/** a club, or the putter */
export type Club = 'driver' | 'wood3' | 'iron4' | 'iron6' | 'iron8' | 'pw' | 'sw' | 'putter';
/** one stroke: the golfer, hole index (0..17), stroke number (1-based), the minute struck, from and to (tiles), the club, the lie where it came
 *  to rest, the penalty stroke (water or out of bounds), and whether it went in */
export interface Shot { golfer: number; hole: number; stroke: number; t: number; from: Pt; to: Pt; club: Club; lie: Lie; penalty: 0 | 1; holed: boolean }
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
export interface GolferState { golfer: number; hole: number; x: number; y: number; action: Action; ball: Pt | null; flight: { from: Pt; to: Pt; u: number } | null; strokes: number; toPar: number; thru: number }
/** one row of the leaderboard: the shared position, to par, holes completed and strokes */
export interface Standing { golfer: number; pos: number; toPar: number; thru: number; strokes: number }
