// The golf round's types (docs/GOLF-PLAY.md, the P1 contract): the field, the tee times, the shots and the state of each golfer through the day.
// Times are game minutes of the tournament day; distances are tiles unless a name says M (metres). Pure TS, no DOM.
import type { Pt } from '../holes';
export type { Pt };

/** the surface a ball lies on: tee, fairway, rough, fescue (deep grass), bunker, green, water, or out of bounds */
export type Lie = 'tee' | 'fairway' | 'rough' | 'fescue' | 'bunker' | 'green' | 'water' | 'out';
/** one hole to play: its number, par, tee, pin and playing line (the tee, the aim points, the pin) */
export interface PlayHole { n: number; par: 3 | 4 | 5; tee: Pt; pin: Pt; line: Pt[] }
/** the course a round is played on: the holes in play order (a 9-hole course is listed twice) and the lie at any point */
export interface CourseView { holes: PlayHole[]; lieAt(x: number, y: number): Lie }
/** a golfer's sex: the field's looks come from the golfer art of the matching sex */
export type Sex = 'm' | 'w';
/** a golfer: a unique id (0..size-1), name, sex, whether a pro, skill (0..1), look (0..4, the art variant), and the owner's golfer */
export interface Golfer { id: number; name: string; sex: Sex; pro: boolean; skill: number; look: number; owner?: boolean }
/** a tee time: the game minute and the golfer ids in the group */
export interface Group { tee: number; players: number[] }
/** a club, or the putter */
export type Club = 'driver' | 'wood3' | 'iron4' | 'iron6' | 'iron8' | 'pw' | 'sw' | 'putter';
/** one stroke: the golfer, hole index (0..17), stroke number (1-based), the minute struck, from and to (tiles), the club, the lie where it came
 *  to rest, the penalty stroke (water or out of bounds), and whether it went in */
export interface Shot { golfer: number; hole: number; stroke: number; t: number; from: Pt; to: Pt; club: Club; lie: Lie; penalty: 0 | 1; holed: boolean }
/** the whole day's play: the field, the groups, every shot by t, strokes[golfer][hole] (penalties included), and the minute each golfer is done (holed out and walked off the last green) */
export interface RoundPlan { golfers: Golfer[]; groups: Group[]; shots: Shot[]; strokes: number[][]; done: number[] }
/** what a golfer is doing at a minute: waiting for his tee time, walking, addressing or swinging a full shot, putting, holed, or done */
export type Action = 'waiting' | 'walk' | 'address' | 'swing' | 'putt' | 'holed' | 'done';
/** a golfer at a minute: the hole he is on, his position, what he does, where his ball is, the ball in flight, and his score so far */
export interface GolferState { golfer: number; hole: number; x: number; y: number; action: Action; ball: Pt | null; flight: { from: Pt; to: Pt; u: number } | null; strokes: number; toPar: number; thru: number }
/** one row of the leaderboard: the shared position, to par, holes completed and strokes */
export interface Standing { golfer: number; pos: number; toPar: number; thru: number; strokes: number }
